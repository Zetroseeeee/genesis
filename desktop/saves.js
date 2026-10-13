// The worlds on disk (saves.js: plain Node, so that tools/test_saves.js can try it without Electron; main.js keeps one).
//
// Every world is a file of its own in the game's folder - Saves/ in ~/Library/Application Support/GENESIS on a Mac - as any game keeps
// its saves. "Autosave" is the world in play: written every minute, as the player leaves it, before an update and as the window closes.
// Every other file is a world kept: a copy the player kept, or the world in play itself, moved aside under its own name when another
// world takes its place (a new one founded, or a kept one gone back to), so that starting or loading a world never costs another.
//
// A file: "HOLOCENE", the format (u32), the length of its head (u32), the head (JSON: name, realm, year, when, age, seed, when it was
// saved, the game's version, how long the world is unpacked), the length of its picture (u32), the picture (a JPEG of 320 by 200, or
// nothing), then the world as the game saves it, packed (gzip). A list of them reads the heads and pictures alone.
// A file is written beside itself, flushed, read back and unpacked (what is on the disk is what was given), and only then put in place
// of the one before: a save cut off half-written never stands for a world. Writes go one at a time, in the order asked; the window's
// last write (writeNow) goes at once, and an earlier one still on its way is then let go rather than put over it.
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip), gunzip = promisify(zlib.gunzip);

const MAGIC = Buffer.from('HOLOCENE', 'latin1'), FORMAT = 1, EXT = '.holocene', AUTO = 'Autosave';
const HEAD_MAX = 256 * 1024, PIC_MAX = 2 * 1024 * 1024, NAME_MAX = 80, STALE = 10 * 60e3;

// a name a file may have on any disk: no separators or characters Finder or Windows refuse, no leading dot, not too long
function safeName(s) {
  let n = String(s === undefined || s === null ? '' : s).normalize('NFC').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  n = n.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  if (n.length > NAME_MAX) n = n.slice(0, NAME_MAX).replace(/[.\s]+$/, '');
  return n || 'A world';
}
// what the page may name a world by: a file of this folder, nothing else
function validId(id) { return typeof id === 'string' && id.length > 0 && id.length <= 200 && !/[\u0000-\u001f/\\]/.test(id) && !id.startsWith('.'); }
// what a head may say (it is shown in the game's lists: nothing else is kept)
function cleanHead(h) {
  h = h && typeof h === 'object' ? h : {}; const o = {};
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined), num = (v) => (typeof v === 'number' && isFinite(v) ? v : undefined);
  o.name = str(h.name, 160); o.realm = str(h.realm, 200); o.when = str(h.when, 60); o.game = str(h.game, 40);
  o.year = num(h.year); o.age = num(h.age); o.seed = num(h.seed); o.at = num(h.at); o.bytes = num(h.bytes);
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}
// the world in play holds another world, or a later day of this one, than the one about to be written over it: it is kept aside
const ahead = (was, now) => was.seed !== now.seed || (typeof was.year === 'number' && typeof now.year === 'number' && was.year > now.year);
const asPic = (p) => { if (!p || !p.length || p.length > PIC_MAX) return null; const b = Buffer.from(p.buffer ? new Uint8Array(p.buffer, p.byteOffset, p.byteLength) : p); return b[0] === 0xff && b[1] === 0xd8 ? b : null; };      // (a JPEG, or nothing)

function pack(head, pic, gz) {
  const h = Buffer.from(JSON.stringify(head), 'utf8'), p = pic || Buffer.alloc(0), a = Buffer.alloc(16), b = Buffer.alloc(4);
  MAGIC.copy(a, 0); a.writeUInt32LE(FORMAT, 8); a.writeUInt32LE(h.length, 12); b.writeUInt32LE(p.length, 0);
  return Buffer.concat([a, h, b, p, gz]);
}
function unpack(buf) {
  if (buf.length < 20 || !buf.subarray(0, 8).equals(MAGIC)) throw new Error('not a world saved by this game');
  if (buf.readUInt32LE(8) > FORMAT) throw new Error('saved by a newer version of the game');
  const hl = buf.readUInt32LE(12); if (hl > HEAD_MAX || 20 + hl > buf.length) throw new Error('the file is cut short');
  const head = JSON.parse(buf.toString('utf8', 16, 16 + hl)), pl = buf.readUInt32LE(16 + hl), p0 = 20 + hl;
  if (pl > PIC_MAX || p0 + pl > buf.length) throw new Error('the file is cut short');
  return { head, pic: pl ? buf.subarray(p0, p0 + pl) : null, gz: buf.subarray(p0 + pl) };
}
// the head and the picture of a file, without reading the world (sync for the window's last moment)
function headOf(file, sync) {
  const parse = (st, a, hb, pic) => {
    if (!a.subarray(0, 8).equals(MAGIC)) throw new Error('not a world saved by this game');
    if (a.readUInt32LE(8) > FORMAT) throw new Error('saved by a newer version of the game');
    return { head: JSON.parse(hb.toString('utf8', 0, hb.length - 4)), pic, size: st.size, mtime: st.mtimeMs };
  };
  const lens = (st, a) => { const hl = a.readUInt32LE(12); if (hl > HEAD_MAX || 20 + hl > st.size) throw new Error('the file is cut short'); return hl; };
  if (sync) {
    const fd = fs.openSync(file, 'r');
    try {
      const st = fs.fstatSync(fd), a = Buffer.alloc(16); if (st.size < 20 || fs.readSync(fd, a, 0, 16, 0) < 16) throw new Error('the file is cut short');
      const hl = lens(st, a), hb = Buffer.alloc(hl + 4); fs.readSync(fd, hb, 0, hl + 4, 16); const pl = hb.readUInt32LE(hl);
      let pic = null; if (pl && pl <= PIC_MAX && 20 + hl + pl <= st.size) { pic = Buffer.alloc(pl); fs.readSync(fd, pic, 0, pl, 20 + hl); }
      return parse(st, a, hb, pic);
    } finally { fs.closeSync(fd); }
  }
  return (async () => {
    const fh = await fsp.open(file, 'r');
    try {
      const st = await fh.stat(), a = Buffer.alloc(16); if (st.size < 20 || (await fh.read(a, 0, 16, 0)).bytesRead < 16) throw new Error('the file is cut short');
      const hl = lens(st, a), hb = Buffer.alloc(hl + 4); await fh.read(hb, 0, hl + 4, 16); const pl = hb.readUInt32LE(hl);
      let pic = null; if (pl && pl <= PIC_MAX && 20 + hl + pl <= st.size) { pic = Buffer.alloc(pl); await fh.read(pic, 0, pl, 20 + hl); }
      return parse(st, a, hb, pic);
    } finally { await fh.close(); }
  })();
}
const exists = (f) => { try { fs.accessSync(f); return true; } catch (e) { return false; } };

class Saves {
  // o: { dir: the folder, trash: async (file) => moves it to the Trash (or nothing: deleting deletes), log }
  constructor(o) {
    this.dir = path.resolve(o.dir); this.trash = o.trash || null; this.log = o.log || (() => {});
    this.q = Promise.resolve(); this.n = 0; this.gen = 0;      // (the queue; a counter for the files beside; how many last writes there have been)
  }
  _mk() { fs.mkdirSync(this.dir, { recursive: true }); }
  fileOf(id) { if (!validId(id)) throw new Error('not a world of this folder'); const f = path.join(this.dir, id + EXT); if (path.dirname(f) !== this.dir) throw new Error('not a world of this folder'); return f; }
  _one(fn) { const p = this.q.then(() => fn()); this.q = p.catch(() => {}); return p; }      // one at a time, in the order asked
  // a name no file has yet ("Autosave" is the world in play's)
  _free(name) {
    let base = safeName(name); if (base.toLowerCase() === AUTO.toLowerCase()) base += ' (kept)';
    for (let k = 1; k < 100000; k++) { const id = k === 1 ? base : `${base} (${k})`; if (!exists(this.fileOf(id))) return id; }
    throw new Error('no free name for ' + base);
  }
  _part(id) { return path.join(this.dir, `.${id}.${process.pid}.${++this.n}.part`); }
  // the world in play moved aside under its own name (the name its head was saved under), at once
  _aside(head) {
    const id = this._free(head.name || [head.realm, head.when].filter(Boolean).join(', ') || 'A world');
    fs.renameSync(this.fileOf(AUTO), this.fileOf(id)); this.log('the world in play is kept as "' + id + '"'); return id;
  }
  // a file written beside its place, flushed, read back and unpacked, then put in its place - unless the window's last write went
  // first (gen: how many there had been when this one was asked for): that one is the newer. (Asking and putting in place are one
  // step, with nothing between them: a rename on the disk's own clock could land after the last write's and stand over it.)
  async _put(id, head, pic, gz, plain, gen) {
    const file = this.fileOf(id), part = this._part(id);
    try {
      if (!plain) head.bytes = (await gunzip(gz)).length;      // (a world given packed: unpacked once to know it is whole)
      const buf = pack(head, pic, gz);
      const fh = await fsp.open(part, 'w'); try { await fh.writeFile(buf); await fh.sync(); } finally { await fh.close(); }
      const back = unpack(await fsp.readFile(part)), raw = await gunzip(back.gz);
      if (plain ? !raw.equals(plain) : raw.length !== head.bytes) throw new Error('the world did not read back as it was written');
      if (gen !== undefined && gen !== this.gen) { fs.unlinkSync(part); return { id, stale: true }; }
      fs.renameSync(part, file);
      return { id, size: buf.length, at: head.at };
    } catch (e) { try { fs.unlinkSync(part); } catch (x) {} throw e; }
  }
  // every world in the folder, the one in play first, then the newest: { id, auto, name, realm, year, when, age, seed, at, size, pic }
  // (a file that cannot be read is listed with what it is called and why: it can still be deleted)
  list() {
    return this._one(async () => {
      this._mk(); const out = [];
      for (const f of await fsp.readdir(this.dir)) {
        const file = path.join(this.dir, f);
        if (f.startsWith('.')) { if (f.endsWith('.part')) { try { const st = await fsp.stat(file); if (Date.now() - st.mtimeMs > STALE) await fsp.unlink(file); } catch (e) {} } continue; }      // (what a write cut off left)
        if (!f.endsWith(EXT)) continue;
        const id = f.slice(0, -EXT.length); if (!validId(id)) continue;
        try { const r = await headOf(file); out.push(Object.assign(cleanHead(r.head), { id, auto: id === AUTO, size: r.size, at: typeof r.head.at === 'number' ? r.head.at : r.mtime, pic: r.pic })); }
        catch (e) { try { const st = await fsp.stat(file); if (st.isFile()) out.push({ id, auto: id === AUTO, name: id, size: st.size, at: st.mtimeMs, broken: e.message }); } catch (x) {} }
      }
      return out.sort((a, b) => (b.auto - a.auto) || (b.at - a.at));
    });
  }
  // a world's save as text, and its head
  read(id) { return this._one(async () => { const u = unpack(await fsp.readFile(this.fileOf(id))); return { head: cleanHead(u.head), json: (await gunzip(u.gz)).toString('utf8') }; }); }
  // a world written: the world in play (o.auto), or a world kept (named by o.name, or by its head). o.json: the save as text, or
  // o.gz: as it was packed before (the worlds a page's storage kept); o.pic: its picture (the world in play keeps the one it had)
  write(o) {
    const gen = o && o.auto ? this.gen : undefined;
    return this._one(async () => {
      this._mk();
      const plain = typeof o.json === 'string' ? Buffer.from(o.json, 'utf8') : null;
      if (!plain && !(o.gz && o.gz.length)) throw new Error('nothing to save');
      const gz = plain ? await gzip(plain, { level: 6 }) : Buffer.from(o.gz.buffer ? new Uint8Array(o.gz.buffer, o.gz.byteOffset, o.gz.byteLength) : o.gz);
      const head = cleanHead(o.head); if (typeof head.at !== 'number' || o.auto) head.at = Date.now(); if (plain) head.bytes = plain.length;
      let pic = asPic(o.pic), id, kept = null;
      if (o.auto) {
        id = AUTO; let was = null; try { was = await headOf(this.fileOf(AUTO)); } catch (e) {}
        if (gen !== this.gen) return { id, stale: true };      // (the window's last write went first)
        if (was && ahead(was.head, head)) kept = this._aside(was.head);      // (at once: nothing comes between the asking and the moving)
        else if (!pic && was) pic = was.pic;
      } else id = this._free(o.name || head.name);
      const r = await this._put(id, head, pic, gz, plain, gen);
      if (kept) r.kept = kept;
      return r;
    });
  }
  // the window's last moment: the world in play written at once, as it is, past anything still on its way
  writeNow(o) {
    this.gen++; this._mk();
    const plain = Buffer.from(String(o.json), 'utf8'), gz = zlib.gzipSync(plain, { level: 6 }), head = cleanHead(o.head); head.at = Date.now(); head.bytes = plain.length;
    const file = this.fileOf(AUTO), part = this._part(AUTO); let pic = asPic(o.pic), was = null, kept = null;
    try { was = headOf(file, true); } catch (e) {}
    if (was && ahead(was.head, head)) kept = this._aside(was.head); else if (!pic && was) pic = was.pic;
    const buf = pack(head, pic, gz);
    try {
      const fd = fs.openSync(part, 'w'); try { fs.writeFileSync(fd, buf); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      if (!zlib.gunzipSync(unpack(fs.readFileSync(part)).gz).equals(plain)) throw new Error('the world did not read back as it was written');
      fs.renameSync(part, file);
    } catch (e) { try { fs.unlinkSync(part); } catch (x) {} throw e; }
    return { id: AUTO, size: buf.length, at: head.at, kept };
  }
  // another world takes the place of the one in play: unless the world in play is that very world on that very day, it is kept aside
  // under its own name (world: { seed, year } of the world now entered). Its new name, or null.
  retire(world) {
    return this._one(async () => {
      let was = null; try { was = await headOf(this.fileOf(AUTO)); } catch (e) { return null; }
      const w = cleanHead(world); if (was.head.seed === w.seed && was.head.year === w.year) return null;
      return this._aside(was.head);
    });
  }
  // a head (and picture) said again, the world as it is (the world in play's not past the window's last write)
  relabel(id, patch, pic) {
    const gen = id === AUTO ? this.gen : undefined;
    return this._one(async () => {
      const u = unpack(await fsp.readFile(this.fileOf(id))), head = Object.assign(cleanHead(u.head), cleanHead(patch));
      return this._put(id, head, asPic(pic) || (u.pic ? Buffer.from(u.pic) : null), Buffer.from(u.gz), null, gen);
    });
  }
  // a world deleted: to the Trash where there is one
  remove(id) {
    return this._one(async () => {
      const f = this.fileOf(id); if (!exists(f)) return false;
      if (this.trash) { try { await this.trash(f); if (!exists(f)) return 'trash'; } catch (e) { this.log('could not go to the Trash: ' + e.message); } }
      await fsp.unlink(f); return 'deleted';
    });
  }
}

// a picture of the world, kept as a file of its own in a folder of pictures (a PNG, under a name no file there has)
async function savePicture(dir, name, bytes) {
  const b = bytes && bytes.length ? Buffer.from(bytes.buffer ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes) : null;
  if (!b || b.length > 200 * 1024 * 1024 || b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a picture');
  await fsp.mkdir(dir, { recursive: true });
  const base = safeName(name || 'Holocene'); let file = null;
  for (let k = 1; k < 100000 && !file; k++) { const f = path.join(dir, (k === 1 ? base : `${base} (${k})`) + '.png'); if (!exists(f)) file = f; }
  await fsp.writeFile(file, b, { flag: 'wx' });
  return file;
}

module.exports = { Saves, savePicture, safeName, pack, unpack, AUTO, EXT };
