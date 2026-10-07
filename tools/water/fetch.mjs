#!/usr/bin/env node
// Brings the water's edge (the "water" release: made by the Water workflow, tools/water/build.py) into data/w/: index.json
// and the packs it names. The pack is kept in the release under the name of what it was made from (the first twelve
// digits of the SHA-256 of tools/water/build.py, data/rivers.png and data/index.json together), and this asks for the pack of what lies here: a branch that
// changes the builder gets its own, and the game that is out keeps the shores it was built with. Where that pack has not
// been made (tools/water/pack.sh makes it: about an hour) what is here is kept, with a warning; with WATER_STRICT=1 (the
// build of the game) that is an error. PART=1 takes the trial made last instead (water-part.tar: some blocks only).
// Without any pack the game draws its coasts from the picture of the Earth, as it did before there was one.
//
// The packs are kept here in bundles, sixteen to a file (data/w/<level>_b<x>_<y>.bin: a table, then the packs' own files end
// to end; src/terrain.js reads a pack out of its bundle): a game that is out fetches what an update changed file by file, and
// fifteen hundred small files were more than an update can carry (tools/update/publish.js begins a new line of updates past
// four hundred, and the whole app must be fetched again). "node tools/water/fetch.mjs check" says whether what is here is
// whole (the game's build asks).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = process.env.WATER_DIR ? path.resolve(process.env.WATER_DIR) : path.join(ROOT, 'data/w');      // (WATER_DIR: another folder, to try this on a copy)
const repo = process.env.GITHUB_REPOSITORY || JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/models.json'), 'utf8')).repo;
const base = `https://github.com/${repo}/releases/download/${process.env.TAG || 'water'}`;
const riv = path.join(ROOT, 'data/rivers.png');      // (the rivers the game draws itself go into the making, and its heights: build.py's pack_hash reckons the same)
const H = (() => { const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'tools/water/build.py'))); for (const f of [riv, path.join(ROOT, 'data/index.json')]) if (fs.existsSync(f)) h.update(fs.readFileSync(f)); return h.digest('hex').slice(0, 12); })();
const strict = process.env.WATER_STRICT === '1', part = process.env.PART === '1';
const pull = (name, to) => { const tmp = to + '.part'; try { execFileSync('curl', ['-fsSL', '--retry', '3', '-o', tmp, `${base}/${name}`], { stdio: 'ignore' }); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; } fs.renameSync(tmp, to); };
let had = null; try { had = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')); } catch (e) {}
const count = (ix) => Object.values(ix.levels).reduce((n, l) => n + (l.packs.match(/P/g) || []).length, 0);
// ---- bundles ----
// <level>_b<bx>_<by>.bin: 'HWB1', the number of places (BUNDLE * BUNDLE), for each place where its pack begins and how long it
// is (two 32-bit numbers, low byte first; nought and nought: no pack there), then the packs' files. A pack's place is
// (py % BUNDLE) * BUNDLE + px % BUNDLE. The same packs always make the same bytes: the update's lists go by a file's hash.
const BUNDLE = 4, MAGIC = 'HWB1';
const packsOf = function* (ix) { for (const [lv, l] of Object.entries(ix.levels)) for (let i = 0; i < l.packs.length; i++) if (l.packs[i] === 'P') yield [lv, i % l.nx, Math.floor(i / l.nx)]; };
const loose = (dir, ix, lv, px, py) => path.join(dir, `${lv}_${px}_${py}.${ix.ext || 'webp'}`);
function bundle(dir) {
  const ix = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  if (!ix.bundle) {
    const groups = new Map();
    for (const [lv, px, py] of packsOf(ix)) { const k = `${lv}_b${Math.floor(px / BUNDLE)}_${Math.floor(py / BUNDLE)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push([lv, px, py]); }
    for (const [k, list] of groups) {
      const head = Buffer.alloc(8 + BUNDLE * BUNDLE * 8); head.write(MAGIC, 0, 'latin1'); head.writeUInt32LE(BUNDLE * BUNDLE, 4);
      const parts = [head]; let off = head.length;
      for (const [lv, px, py] of list) { const buf = fs.readFileSync(loose(dir, ix, lv, px, py)), at = 8 + ((py % BUNDLE) * BUNDLE + px % BUNDLE) * 8; if (!buf.length) throw new Error(`the pack ${lv}_${px}_${py} is empty`); head.writeUInt32LE(off, at); head.writeUInt32LE(buf.length, at + 4); parts.push(buf); off += buf.length; }
      fs.writeFileSync(path.join(dir, k + '.bin'), Buffer.concat(parts));
    }
    ix.bundle = BUNDLE; fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(ix));      // (only now do the bundles count: stopped before this, the packs are still here one by one)
  }
  for (const [lv, px, py] of packsOf(ix)) fs.rmSync(loose(dir, ix, lv, px, py), { force: true });
  return ix;
}
// is what is here whole? every pack the list names lies in its bundle, and is a picture
function whole(dir, all) {
  const ix = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), n = ix.bundle; if (!n) throw new Error('the packs here are not in bundles (node tools/water/fetch.mjs puts them there)');
  const heads = new Map(); let packs = 0;
  if (all) { if (ix.partial) throw new Error('a trial of some blocks, not the whole Earth'); for (const l of Object.values(ix.levels)) if (l.packs.includes('?')) throw new Error('some blocks were not made'); }
  for (const [lv, px, py] of packsOf(ix)) {
    const f = path.join(dir, `${lv}_b${Math.floor(px / n)}_${Math.floor(py / n)}.bin`); let h = heads.get(f);
    if (!h) { const fd = fs.openSync(f, 'r'); try { const head = Buffer.alloc(8 + n * n * 8); fs.readSync(fd, head, 0, head.length, 0); if (head.toString('latin1', 0, 4) !== MAGIC || head.readUInt32LE(4) !== n * n) throw new Error(path.basename(f) + ' is not a bundle'); h = { head, size: fs.fstatSync(fd).size, fd }; heads.set(f, h); } catch (e) { fs.closeSync(fd); throw e; } }
    const at = 8 + ((py % n) * n + px % n) * 8, off = h.head.readUInt32LE(at), len = h.head.readUInt32LE(at + 4), sig = Buffer.alloc(12);
    if (!len || off + len > h.size) throw new Error(`the pack ${lv}_${px}_${py} is not in its bundle`);
    fs.readSync(h.fd, sig, 0, 12, off); if (sig.toString('latin1', 0, 4) !== 'RIFF' || sig.toString('latin1', 8, 12) !== 'WEBP') throw new Error(`the pack ${lv}_${px}_${py} is not a picture`);
    packs++;
  }
  for (const h of heads.values()) fs.closeSync(h.fd);
  return { ix, packs, bundles: heads.size };
}
if (process.argv[2] === 'check') {
  try { const { ix, packs, bundles } = whole(DIR, true); if (packs < 800) throw new Error('only ' + packs + ' packs'); console.log(`water: ${packs} packs in ${bundles} bundles, made ${ix.made} (${ix.hash})`); process.exit(0); }
  catch (e) { console.error('water: ' + e.message); process.exit(1); }
}
if (had) { try { had = bundle(DIR); whole(DIR); } catch (e) { console.log('water: what is here is not whole (' + e.message + '): fetching it again'); had = null; } }      // (packs fetched before there were bundles are put into them here)
const tmp = DIR + '.new';
const unpack = (tar) => {
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  execFileSync('tar', ['-xf', tar, '-C', tmp]); fs.rmSync(tar, { force: true });
  const ix = JSON.parse(fs.readFileSync(path.join(tmp, 'index.json'), 'utf8'));
  for (const [lv, l] of Object.entries(ix.levels)) for (let i = 0; i < l.packs.length; i++) if (l.packs[i] === 'P') { const f = path.join(tmp, `${lv}_${i % l.nx}_${Math.floor(i / l.nx)}.${ix.ext || 'webp'}`); if (!fs.existsSync(f) || fs.statSync(f).size === 0) throw new Error('the pack lacks ' + path.basename(f)); }
  bundle(tmp); whole(tmp);
  fs.rmSync(DIR, { recursive: true, force: true }); fs.renameSync(tmp, DIR);
  return ix;
};
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
if (part) {
  const tar = path.join(ROOT, 'data', '.water-part.tar');
  try { pull('water-part.tar', tar); } catch (e) { console.error('water: no trial in the release'); process.exit(1); }
  const ix = unpack(tar); console.log(`water: a trial of some blocks, made ${ix.made}: ${count(ix)} packs (not the game's pack)`);
  process.exit(0);
}
let list = null;
try { pull(`water-${H}.json`, path.join(ROOT, 'data', '.water.json')); list = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', '.water.json'), 'utf8')); } catch (e) { list = null; }
fs.rmSync(path.join(ROOT, 'data', '.water.json'), { force: true });
if (!list) {
  if (strict) { console.error(`water: the pack of this builder (${H}) is not in the release. Make it: tools/water/pack.sh (REF=<this branch>).`); process.exit(1); }
  console.log(had ? `water: WARNING: the pack of this builder (${H}) has not been made (tools/water/pack.sh makes it); keeping the one that is here (${had.hash}${had.partial ? ', a trial' : ''})` : 'water: no pack yet (the game draws its coasts from the picture of the Earth)');
  process.exit(0);
}
if (had && !had.partial && had.hash === list.hash && had.made === list.made && process.env.FRESH !== '1') { console.log(`water: ${count(had)} packs, made ${had.made} (pack ${H}); nothing to fetch`); process.exit(0); }
const tar = path.join(ROOT, 'data', '.water.tar');
pull(`water-${H}.tar`, tar);
const ix = unpack(tar);
console.log(`water: ${count(ix)} packs, made ${ix.made} (pack ${H}); fetched`);
