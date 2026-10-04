// Keeps the game's files current without replacing the app.
//
// The app carries a list of every file it serves and that file's SHA-256 (content.json, written when the app is
// packed). The build publishes the same kind of list for the newest game (the manifest) and, one by one under their
// hash, the files that differ from the apps already given out. An update is therefore: fetch the list, fetch the
// files this copy lacks into a store beside the saves, check each against its hash, and from the next start serve the
// game through the new list - a file the app already has from the app, anything else from the store. Nothing inside
// the app is ever written, so its signature stays whole, and going back is a matter of using the old list again.
//
// What this cannot bring is a new shell (this folder: the window, this updater). The manifest says which shell the
// game needs (shell.api) and the oldest app that can take it as files alone (epoch); an app that is too old is told
// to fetch the whole app instead, and this module downloads the disk image for it.
//
// No Electron in here: fetch, the folders and the clock are handed in, so the whole thing runs under plain Node in
// tools/test_update.js.
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const FORMAT = 1;
const HEX64 = /^[0-9a-f]{64}$/;
const PARALLEL = 4, TRIES = 3, STALL_MS = 45000, MANIFEST_MS = 25000, MAX_MANIFEST = 8e6;

function extOf(key) { const e = path.extname(key).toLowerCase(); return /^\.[a-z0-9]{1,8}$/.test(e) ? e : ''; }
// (the name keeps the file's ending so that whatever serves it can tell what kind of file it is)
function blobName(hash, key) { return hash + extOf(key); }
function blobUrl(feed, hash, key) { return feed + '/content-' + hash[0] + '/' + blobName(hash, key); }
function manifestId(files) { const h = crypto.createHash('sha256'); for (const k of Object.keys(files).sort()) h.update(k + '\t' + files[k][0] + '\n'); return h.digest('hex'); }
function validKey(k) { return typeof k === 'string' && k.length > 0 && k.length < 400 && k[0] !== '/' && !k.includes('\\') && !k.includes('\0') && !k.split('/').some((s) => s === '' || s === '.' || s === '..'); }
// null when the list can be trusted to describe a whole game, else what is wrong with it
function validate(m) {
  if (!m || typeof m !== 'object') return 'not a list';
  if (m.format !== FORMAT) return 'format ' + m.format;
  if (!Number.isInteger(m.seq) || m.seq <= 0) return 'no build time';
  if (!Number.isInteger(m.epoch) || m.epoch <= 0 || m.epoch > m.seq) return 'no epoch';
  if (!m.shell || !Number.isInteger(m.shell.api)) return 'no shell';
  if (typeof m.version !== 'string' || !m.version) return 'no version';
  if (!m.files || typeof m.files !== 'object' || Array.isArray(m.files)) return 'no files';
  const keys = Object.keys(m.files); if (keys.length < 8) return 'too few files';
  for (const k of keys) { const f = m.files[k]; if (!validKey(k)) return 'bad path ' + k; if (!Array.isArray(f) || !HEX64.test(f[0]) || !Number.isInteger(f[1]) || f[1] < 0) return 'bad entry ' + k; }
  for (const need of ['local.html', 'main.js', 'version.json']) if (!m.files[need]) return 'no ' + need;
  if (m.id !== manifestId(m.files)) return 'the list does not match its own checksum';
  if (m.app && (!HEX64.test(m.app.sha256) || !Number.isInteger(m.app.bytes) || typeof m.app.name !== 'string' || !/^[\w.-]+\.dmg$/.test(m.app.name))) return 'bad app entry';
  return null;
}
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
function writeJson(file, obj) { const tmp = file + '.new'; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, file); }
function unlink(file) { try { fs.unlinkSync(file); } catch (e) {} }
function sizeOf(file) { try { const s = fs.statSync(file); return s.isFile() ? s.size : -1; } catch (e) { return -1; } }
class HttpError extends Error { constructor(status, url) { super('HTTP ' + status + ' for ' + url); this.status = status; } }
class IntegrityError extends Error {}

class Updater {
  // o: { bundle: the app's own list (or null: no updates), roots: { app, data } where the app's files lie,
  //      dir: a folder of our own to keep things in, feed: where releases are downloaded from, shellApi,
  //      fetch, manifestName?, now?, log? }
  constructor(o) {
    this.o = o; this.bundle = o.bundle && validate(o.bundle) === null ? o.bundle : null;
    this.dir = o.dir; this.store = path.join(o.dir, 'store'); this.tmp = path.join(this.store, 'tmp');
    this.feed = String(o.feed || '').replace(/\/+$/, ''); this.manifestName = o.manifestName || 'manifest.json'; this.shellApi = o.shellApi | 0;
    this.fetch = o.fetch; this.now = o.now || Date.now; this.log = o.log || (() => {});
    this.listeners = new Set();
    this.active = null; this.previous = null; this.staged = null; this.latest = null; this.plan = null;
    this.persist = { pending: null, skip: [], notice: null, lastCheck: 0 };
    this.phase = this.bundle && this.feed && this.fetch ? 'idle' : 'off';
    this.error = null; this.checkError = null; this.progress = null; this.abort = null;
    this.app = { phase: 'idle', bytes: 0, total: 0, file: null, error: null }; this.appAbort = null;
    this.byHash = new Map(); if (this.bundle) for (const k of Object.keys(this.bundle.files)) this.byHash.set(this.bundle.files[k][0], k);
  }

  // ---- what is in use ----
  current() { return this.active || this.bundle; }
  bundlePath(key) { return key.startsWith('data/') ? path.join(this.o.roots.data, key.slice(5)) : path.join(this.o.roots.app, key); }
  // Where the file for this path lies. undefined: no update is in use, serve the app's own files as ever.
  // null: the game in use has no such file.
  resolve(key) {
    if (!this.active) return undefined;
    const f = Object.prototype.hasOwnProperty.call(this.active.files, key) ? this.active.files[key] : null; if (!f) return null;
    const own = this.byHash.get(f[0]); if (own !== undefined) return this.bundlePath(own);
    return path.join(this.store, blobName(f[0], key));
  }
  // every file of this list is at hand: in the app, or whole in the store
  _whole(m) {
    for (const k of Object.keys(m.files)) { const f = m.files[k]; if (this.byHash.has(f[0])) continue; if (sizeOf(path.join(this.store, blobName(f[0], k))) !== f[1]) return false; }
    return true;
  }
  // this list is newer than what is in use, and this app can run it
  _usable(m) {
    const cur = this.current();
    return validate(m) === null && m.seq > cur.seq && m.id !== cur.id && !this.persist.skip.includes(m.id) && m.shell.api <= this.shellApi && this.bundle.seq >= m.epoch;
  }
  _load(name) { const m = readJson(path.join(this.dir, name)); return m && validate(m) === null ? m : null; }
  _save() { try { writeJson(path.join(this.dir, 'state.json'), this.persist); } catch (e) { this.log('state not saved: ' + e.message); } }

  // Called once, before anything is served.
  init() {
    if (this.phase === 'off') return this;
    fs.mkdirSync(this.tmp, { recursive: true });
    const p = readJson(path.join(this.dir, 'state.json')); if (p && typeof p === 'object') this.persist = { pending: p.pending || null, skip: Array.isArray(p.skip) ? p.skip.slice(-20) : [], notice: p.notice || null, lastCheck: +p.lastCheck || 0 };
    this.active = this._load('active.json'); this.previous = this._load('previous.json'); this.staged = this._load('staged.json');
    // a newer app has been installed since: its own files are newer than anything kept here
    if (this.active && (this.active.seq <= this.bundle.seq || this.active.id === this.bundle.id || this.active.shell.api > this.shellApi)) { this.log('the app is newer than the update in use: dropped'); this._dropAll(); }
    if (this.previous && this.previous.seq <= this.bundle.seq) { unlink(path.join(this.dir, 'previous.json')); this.previous = null; }
    // files of the update in use have gone missing (a cleaned disk): back to the app's own
    if (this.active && !this._whole(this.active)) { this.log('the update in use is incomplete: dropped'); this._dropAll(); this.persist.notice = 'damaged'; }
    // an update that has not come up twice running is undone
    if (this.active && this.persist.pending && this.persist.pending.id === this.active.id) {
      this.persist.pending.attempts = (this.persist.pending.attempts | 0) + 1;
      if (this.persist.pending.attempts > 2) this.rollback('it did not start');
    } else this.persist.pending = null;
    // one that was fetched whole before the app was closed goes in now, before anything is shown
    if (this.staged) { if (this._usable(this.staged) && this._whole(this.staged)) this._activate(this.staged); else { unlink(path.join(this.dir, 'staged.json')); this.staged = null; } }
    this._save();
    return this;
  }
  _dropAll() { for (const n of ['active.json', 'previous.json']) unlink(path.join(this.dir, n)); this.active = null; this.previous = null; this.persist.pending = null; }
  _activate(m) {
    if (this.active) writeJson(path.join(this.dir, 'previous.json'), this.active); else unlink(path.join(this.dir, 'previous.json'));
    writeJson(path.join(this.dir, 'active.json'), m); unlink(path.join(this.dir, 'staged.json'));
    this.previous = this.active; this.active = m; this.staged = null; if (this.latest && this.latest.id === m.id) { this.latest = null; this.plan = null; }
    this.persist.pending = { id: m.id, attempts: 1, since: this.now() }; this._save();
  }
  // Put the fetched update to use. The caller reloads the game; it must then call confirm() once it is up.
  apply() {
    if (this.phase !== 'ready' || !this.staged) return false;
    if (!this._usable(this.staged) || !this._whole(this.staged)) { unlink(path.join(this.dir, 'staged.json')); this.staged = null; this.error = 'The update was incomplete. Fetch it again.'; this._set(this.latest ? 'available' : 'idle'); return false; }
    this._activate(this.staged); this.error = null; this._set('idle');
    return true;
  }
  // The game came up on the files in use.
  confirm() {
    if (this.phase === 'off' || !this.persist.pending) return;
    this.persist.pending = null; unlink(path.join(this.dir, 'previous.json')); this.previous = null; this._save();
    this.gc(); this._emit();
  }
  get pending() { return !!this.persist.pending; }
  // Undo the update in use: back to the one before it, or to the app's own files. It will not be offered again.
  rollback(why) {
    if (!this.active) return false;
    const failed = this.active; this.log('update ' + failed.version + ' undone: ' + why);
    if (!this.persist.skip.includes(failed.id)) this.persist.skip.push(failed.id);
    const back = this.previous && this.previous.seq > this.bundle.seq && this._whole(this.previous) ? this.previous : null;
    if (back) writeJson(path.join(this.dir, 'active.json'), back); else unlink(path.join(this.dir, 'active.json'));
    unlink(path.join(this.dir, 'previous.json')); this.active = back; this.previous = null;
    if (this.staged && this.staged.id === failed.id) { unlink(path.join(this.dir, 'staged.json')); this.staged = null; }
    if (this.latest && this.latest.id === failed.id) { this.latest = null; this.plan = null; }
    this.persist.pending = null; this.persist.notice = 'undone'; this._save();
    if (this.phase !== 'off') this._set('idle');
    return true;
  }
  ackNotice() { if (this.persist.notice) { this.persist.notice = null; this._save(); this._emit(); } }
  // Files in the store that no list in use speaks of are removed (and parts of downloads long abandoned).
  gc() {
    const keep = new Set();
    for (const m of [this.active, this.previous, this.staged, this.latest]) if (m) for (const k of Object.keys(m.files)) keep.add(blobName(m.files[k][0], k));
    let n = 0;
    try { for (const f of fs.readdirSync(this.store)) { if (f === 'tmp' || keep.has(f)) continue; unlink(path.join(this.store, f)); n++; } } catch (e) {}
    try { const old = this.now() - 3 * 86400e3; for (const f of fs.readdirSync(this.tmp)) { const p = path.join(this.tmp, f); if (keep.has(f.replace(/\.part$/, ''))) continue; try { if (fs.statSync(p).mtimeMs < old) { unlink(p); n++; } } catch (e) {} } } catch (e) {}
    return n;
  }

  // ---- telling whoever shows it ----
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { const s = this.snapshot(); for (const fn of this.listeners) { try { fn(s); } catch (e) {} } }
  _set(phase) { this.phase = phase; this._emit(); }
  _brief(m) { return m ? { version: m.version, commit: m.commit || '', built: m.built || '', seq: m.seq } : null; }
  // what the new game brings: its notes down to the one this copy already has
  _notes(m) {
    const cur = this.current(); const out = []; const have = new Set([cur.commit]); for (const n of Array.isArray(cur.notes) ? cur.notes : []) if (n) have.add(n.commit);
    for (const n of Array.isArray(m.notes) ? m.notes : []) { if (!n || have.has(n.commit)) break; out.push({ title: String(n.title || '').slice(0, 200), body: String(n.body || '').slice(0, 1200), date: String(n.date || ''), commit: String(n.commit || '') }); if (out.length >= 30) break; }
    return out;
  }
  snapshot() {
    const cur = this.current(); const next = this.latest || this.staged;
    return {
      phase: this.phase, error: this.error, checkError: this.checkError, notice: this.persist.notice, lastCheck: this.persist.lastCheck,
      current: cur ? Object.assign(this._brief(cur), { source: this.active ? 'update' : 'app' }) : null,
      latest: next ? Object.assign(this._brief(next), { notes: this._notes(next), files: this.plan && this.latest ? this.plan.files.length : 0, bytes: this.plan && this.latest ? this.plan.bytes : 0, app: next.app ? { bytes: next.app.bytes, name: next.app.name } : null }) : null,
      progress: this.progress, app: Object.assign({}, this.app),
    };
  }

  // ---- looking for an update ----
  async _manifest() {
    const url = this.feed + '/update/' + this.manifestName + '?t=' + this.now();
    const res = await this.fetch(url, { cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(MANIFEST_MS) });
    if (!res.ok) throw new HttpError(res.status, url);
    const text = await res.text(); if (text.length > MAX_MANIFEST) throw new Error('the update list is too large');
    let m; try { m = JSON.parse(text); } catch (e) { throw new Error('the update list could not be read'); }
    const bad = validate(m); if (bad) throw new Error('the update list could not be used: ' + bad);
    return m;
  }
  // what would have to be fetched for this list: each file neither in the app nor whole in the store, once
  _plan(m) {
    const seen = new Set(); const files = []; let bytes = 0, blocked = false;
    for (const k of Object.keys(m.files)) {
      const f = m.files[k]; if (this.byHash.has(f[0])) continue;
      const name = blobName(f[0], k); if (seen.has(name)) continue; seen.add(name);
      if (sizeOf(path.join(this.store, name)) === f[1]) continue;
      if (f[2] === 1) blocked = true;      // a file every app since the epoch carries, and this one does not: not ours to patch
      files.push({ key: k, hash: f[0], size: f[1], name }); bytes += f[1];
    }
    return { files, bytes, blocked };
  }
  async check() {
    if (this.phase === 'off' || this.phase === 'checking' || this.phase === 'downloading') return this.snapshot();
    const was = this.phase; this._set('checking');
    let m = null;
    try { m = await this._manifest(); this.checkError = null; }
    catch (e) { this.checkError = e instanceof HttpError && e.status === 404 ? 'none published' : String(e.message || e); this.log('check failed: ' + this.checkError); this._set(was === 'error' ? 'idle' : was); return this.snapshot(); }
    this.persist.lastCheck = this.now(); this._save(); this.error = null;
    const cur = this.current();
    if (m.id === cur.id || m.seq <= cur.seq || this.persist.skip.includes(m.id)) { this.latest = null; this.plan = null; this._set(this.staged ? 'ready' : 'idle'); return this.snapshot(); }
    this.latest = m; this.plan = this._plan(m);
    if (m.shell.api > this.shellApi || this.bundle.seq < m.epoch || this.plan.blocked) this._set('app-required');
    else if (this.staged && this.staged.id === m.id) this._set('ready');
    else if (this.plan.files.length === 0) { writeJson(path.join(this.dir, 'staged.json'), m); this.staged = m; this._set('ready'); }   // everything is already here
    else this._set('available');
    return this.snapshot();
  }

  // ---- fetching it ----
  // One file from the feed into dest, checked against its length and hash. A part left by an earlier try is carried on from.
  async _get(url, dest, size, sha256, signal, onBytes) {
    const part = path.join(this.tmp, path.basename(dest) + '.part');
    let have = sizeOf(part); if (have < 0 || have >= size) { unlink(part); have = 0; }
    const ctl = new AbortController(); const onAbort = () => ctl.abort(signal.reason); if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    let stall = null; const kick = () => { clearTimeout(stall); stall = setTimeout(() => ctl.abort(new Error('the download stood still')), STALL_MS); };
    let fh = null, counted = 0;
    try {
      kick();
      const res = await this.fetch(url, { cache: 'no-store', redirect: 'follow', signal: ctl.signal, headers: have ? { Range: 'bytes=' + have + '-' } : {} });
      if (res.status === 416) { unlink(part); throw new IntegrityError('the part on disk did not fit'); }
      if (!res.ok) throw new HttpError(res.status, url);
      const hash = crypto.createHash('sha256');
      if (have && res.status === 206) { await new Promise((ok, bad) => { fs.createReadStream(part).on('data', (c) => hash.update(c)).on('end', ok).on('error', bad); }); counted = have; onBytes(have); fh = await fsp.open(part, 'a'); }
      else { have = 0; fh = await fsp.open(part, 'w'); }
      let got = have; const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        kick(); got += value.length; if (got > size) throw new IntegrityError('more bytes than the list says');
        hash.update(value); await fh.write(value); counted += value.length; onBytes(value.length);
      }
      await fh.sync(); await fh.close(); fh = null;
      if (got !== size) throw new Error('the download ended early (' + got + ' of ' + size + ' bytes)');       // the part is kept: the next try carries on
      if (hash.digest('hex') !== sha256) { unlink(part); throw new IntegrityError('the file does not match its checksum'); }
      try { await fsp.rename(part, dest); } catch (e) { await fsp.copyFile(part, dest); unlink(part); }     // (another volume)
      return counted;
    } catch (e) { if (fh) { try { await fh.close(); } catch (e2) {} } onBytes(-counted); throw e; }
    finally { clearTimeout(stall); signal.removeEventListener('abort', onAbort); }
  }
  async _retry(fn, signal) {
    let last = null;
    for (let i = 0; i < TRIES; i++) {
      if (signal.aborted) throw signal.reason || new Error('stopped');
      try { return await fn(); } catch (e) {
        last = e; if (signal.aborted) throw e; if (e instanceof HttpError && (e.status === 404 || e.status === 403 || e.status === 410)) throw e;
        this.log('download: ' + (e.message || e) + (i + 1 < TRIES ? ' - again' : ''));
        await new Promise((r) => setTimeout(r, this.o.retryMs !== undefined ? this.o.retryMs : 800 * (i + 1)));
      }
    }
    throw last;
  }
  async start() {
    if (this.phase !== 'available' || !this.latest) return this.snapshot();
    const m = this.latest; const plan = this.plan = this._plan(m);
    const abort = this.abort = new AbortController(); this.error = null;
    this.progress = { bytes: 0, total: plan.bytes, files: 0, filesTotal: plan.files.length }; this._set('downloading');
    let lastTold = 0; const tell = () => { const t = this.now(); if (t - lastTold > 120) { lastTold = t; this._emit(); } };
    const queue = plan.files.slice().sort((a, b) => b.size - a.size); let failed = null;
    const worker = async () => {
      for (;;) {
        const f = queue.shift(); if (!f || failed || abort.signal.aborted) return;
        try {
          await this._retry(() => this._get(blobUrl(this.feed, f.hash, f.key), path.join(this.store, f.name), f.size, f.hash, abort.signal, (n) => { this.progress.bytes += n; tell(); }), abort.signal);
          this.progress.files++; this._emit();
        } catch (e) { if (!failed) failed = e; abort.abort(e); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
    this.abort = null;
    if (failed || abort.signal.aborted || !this._whole(m)) {
      this.progress = null;
      if (this._stopped) { this._stopped = false; this._set('available'); return this.snapshot(); }
      // the build has moved on and this list's files are gone: look again rather than complain
      if (failed instanceof HttpError && failed.status === 404) {
        this.phase = 'available'; await this.check();
        if (this.phase === 'available' && this.latest && this.latest.id === m.id) { this.error = 'This update is still being published. Try again in a few minutes.'; this._emit(); }
        return this.snapshot();
      }
      this.error = failed instanceof IntegrityError ? 'A downloaded file was damaged on the way. Try again.' : 'The download did not finish. Check the connection and try again.';
      this.log('update not fetched: ' + (failed && failed.message)); this._set('available'); return this.snapshot();
    }
    writeJson(path.join(this.dir, 'staged.json'), m); this.staged = m; this.progress = null; this._set('ready');
    return this.snapshot();
  }
  cancel() { if (this.phase === 'downloading' && this.abort) { this._stopped = true; this.abort.abort(new Error('stopped')); } }

  // ---- the whole app, when files alone will not do ----
  // Downloads the disk image the manifest names into dir (the Downloads folder) and returns its path once it is whole.
  async getApp(dir) {
    const m = this.latest; if (!m || !m.app) { this.app = { phase: 'error', bytes: 0, total: 0, file: null, error: 'No download is published for this version yet.' }; this._emit(); return null; }
    if (this.app.phase === 'downloading') return null;
    const name = m.app.name.replace(/(-mac)/, '-' + m.version.replace(/[^\w.]/g, '') + '$1'); const dest = path.join(dir, name);
    fs.mkdirSync(this.tmp, { recursive: true });
    this.app = { phase: 'downloading', bytes: 0, total: m.app.bytes, file: null, error: null }; this._emit();
    const abort = this.appAbort = new AbortController(); let lastTold = 0;
    try {
      // (a copy fetched earlier and still whole is used as it is)
      const whole = sizeOf(dest) === m.app.bytes && await new Promise((ok) => { const h = crypto.createHash('sha256'); fs.createReadStream(dest).on('data', (c) => h.update(c)).on('end', () => ok(h.digest('hex') === m.app.sha256)).on('error', () => ok(false)); });
      if (!whole) await this._retry(() => this._get(this.feed + '/latest/' + m.app.name, dest, m.app.bytes, m.app.sha256, abort.signal, (n) => { this.app.bytes += n; const t = this.now(); if (t - lastTold > 200) { lastTold = t; this._emit(); } }), abort.signal);
      this.app = { phase: 'ready', bytes: m.app.bytes, total: m.app.bytes, file: dest, error: null }; this._emit(); return dest;
    } catch (e) {
      const stopped = abort.signal.aborted && this._appStopped; this._appStopped = false;
      this.app = { phase: stopped ? 'idle' : 'error', bytes: 0, total: m.app.bytes, file: null, error: stopped ? null : (e instanceof IntegrityError ? 'The download was damaged on the way. Try again.' : 'The download did not finish. Check the connection and try again.') };
      this.log('app not fetched: ' + (e && e.message)); this._emit(); return null;
    } finally { this.appAbort = null; }
  }
  cancelApp() { if (this.appAbort) { this._appStopped = true; this.appAbort.abort(new Error('stopped')); } }
}

module.exports = { Updater, validate, manifestId, blobName, blobUrl, extOf, validKey, FORMAT, HttpError, IntegrityError };
