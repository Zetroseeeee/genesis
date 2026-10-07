#!/usr/bin/env node
// Brings the picture of the Earth (the "planet" release: made by the Planet workflow, tools/planet/imagery.py, from NASA's
// Blue Marble Next Generation) into data/i/: index.json and the bundles of packs it names (<level>_b<x>_<y>.bin: sixty-four
// packs to a file, a table of where each begins and then the packs' own files - src/terrain.js reads a pack out of its
// bundle, as it does the water's edge). The pack is kept in the release under the name of what it was made from (the first
// twelve digits of the SHA-256 of tools/planet/imagery.py and tools/planet/mask.png together), and this asks for the pack
// of what lies here: a branch that changes the builder gets its own, and the game that is out keeps the picture it was
// built with. Where that pack has not been made (tools/planet/pack.sh makes it: a quarter of an hour) the pack made last
// is taken, with a warning; with PLANET_STRICT=1 (the build of the game) that is an error. PART=1 takes the trial made
// last instead (planet-part.tar: some blocks only, and nothing but the climate's colour elsewhere).
// Without the picture the game has no Earth to show: there is none in the repository any more (it was 16 MB at five
// kilometres to a texel; this is some 200 MB at 611 m).
//   node tools/planet/fetch.mjs          fetch what is not here
//   node tools/planet/fetch.mjs check    is what is here whole? (the game's build asks)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = process.env.PLANET_DIR ? path.resolve(process.env.PLANET_DIR) : path.join(ROOT, 'data/i');      // (PLANET_DIR: another folder, to try this on a copy)
const repo = process.env.GITHUB_REPOSITORY || JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/models.json'), 'utf8')).repo;
const base = `https://github.com/${repo}/releases/download/${process.env.TAG || 'planet'}`;
const H = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'tools/planet/imagery.py'))).update(fs.readFileSync(path.join(ROOT, 'tools/planet/mask.png'))).digest('hex').slice(0, 12);
const strict = process.env.PLANET_STRICT === '1', part = process.env.PART === '1';
const pull = (name, to) => { const tmp = to + '.part'; try { execFileSync('curl', ['-fsSL', '--retry', '3', '-o', tmp, `${base}/${name}`], { stdio: 'ignore' }); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; } fs.renameSync(tmp, to); };
const MAGIC = 'HWB1';
const packsOf = function* (ix) { for (const [lv, l] of Object.entries(ix.levels)) for (let i = 0; i < l.packs.length; i++) if (l.packs[i] === 'P') yield [lv, i % l.nx, Math.floor(i / l.nx)]; };
const count = (ix) => Object.values(ix.levels).reduce((n, l) => n + (l.packs.match(/P/g) || []).length, 0);
// is what is here whole? every pack the list names lies in its bundle, and is a picture
function whole(dir, all) {
  const ix = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), n = ix.bundle; if (!n || !ix.levels) throw new Error('index.json is not the list of a pack in bundles');
  if (all) { if (ix.partial) throw new Error('a trial of some blocks, not the whole Earth'); for (let l = 0; l <= ix.maxLevel; l++) if (!ix.levels[l] || ix.levels[l].packs.length !== ix.levels[l].nx * ix.levels[l].ny || ix.levels[l].packs.includes('?')) throw new Error('level ' + l + ' is not whole'); }
  const heads = new Map(); let packs = 0, bytes = 0;
  try {
    for (const [lv, px, py] of packsOf(ix)) {
      const f = path.join(dir, `${lv}_b${Math.floor(px / n)}_${Math.floor(py / n)}.bin`); let h = heads.get(f);
      if (!h) { const fd = fs.openSync(f, 'r'), head = Buffer.alloc(8 + n * n * 8); h = { head, fd, size: fs.fstatSync(fd).size }; heads.set(f, h); fs.readSync(fd, head, 0, head.length, 0); if (head.toString('latin1', 0, 4) !== MAGIC || head.readUInt32LE(4) !== n * n) throw new Error(path.basename(f) + ' is not a bundle'); bytes += h.size; }
      const at = 8 + ((py % n) * n + px % n) * 8, off = h.head.readUInt32LE(at), len = h.head.readUInt32LE(at + 4), sig = Buffer.alloc(12);
      if (!len || off + len > h.size) throw new Error(`the pack ${lv}_${px}_${py} is not in its bundle`);
      fs.readSync(h.fd, sig, 0, 12, off); if (sig.toString('latin1', 0, 4) !== 'RIFF' || sig.toString('latin1', 8, 12) !== 'WEBP') throw new Error(`the pack ${lv}_${px}_${py} is not a picture`);
      packs++;
    }
  } finally { for (const h of heads.values()) fs.closeSync(h.fd); }
  return { ix, packs, bundles: heads.size, bytes };
}
if (process.argv[2] === 'check') {
  try { const { ix, packs, bundles, bytes } = whole(DIR, true); if (packs < 800) throw new Error('only ' + packs + ' packs'); console.log(`planet: the picture of the Earth, ${packs} packs in ${bundles} bundles (${(bytes / 1e6).toFixed(0)} MB), down to level ${ix.maxLevel}, made ${ix.made} (${ix.hash})`); process.exit(0); }
  catch (e) { console.error('planet: ' + e.message); process.exit(1); }
}
let had = null; try { had = whole(DIR).ix; } catch (e) { had = null; }
const tmp = process.env.PLANET_DIR ? DIR + '.new' : path.join(ROOT, 'data', '.i.new');      // (a name git does not see, should a fetch stop half way)
const unpack = (tar) => {
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  execFileSync('tar', ['-xf', tar, '-C', tmp]); fs.rmSync(tar, { force: true });
  const { ix } = whole(tmp);
  fs.rmSync(DIR, { recursive: true, force: true }); fs.renameSync(tmp, DIR);
  return ix;
};
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
if (part) {
  const tar = path.join(ROOT, 'data', '.planet-part.tar');
  try { pull('planet-part.tar', tar); } catch (e) { console.error('planet: no trial in the release'); process.exit(1); }
  const ix = unpack(tar); console.log(`planet: a trial of some blocks, made ${ix.made}: ${count(ix)} packs (not the game's pack)`);
  process.exit(0);
}
const listAt = path.join(ROOT, 'data', '.planet.json');
const tryList = (name) => { try { pull(name, listAt); const l = JSON.parse(fs.readFileSync(listAt, 'utf8')); fs.rmSync(listAt, { force: true }); return l; } catch (e) { fs.rmSync(listAt, { force: true }); return null; } };
let list = tryList(`planet-${H}.json`);
if (!list) {
  if (strict) { console.error(`planet: the pack of this builder (${H}) is not in the release. Make it: tools/planet/pack.sh (MODE=imagery REF=<this branch>).`); process.exit(1); }
  list = tryList('planet.json');
  if (list) console.log(`planet: WARNING: the pack of this builder (${H}) has not been made (MODE=imagery tools/planet/pack.sh makes it); taking the pack made last (${list.hash})`);
}
if (!list) { console.log(had ? `planet: the release cannot be reached; keeping the picture that is here (${had.hash}${had.partial ? ', a trial' : ''})` : 'planet: WARNING: no picture of the Earth could be fetched (the game will have none to show)'); process.exit(0); }
if (had && !had.partial && had.hash === list.hash && had.made === list.made && process.env.FRESH !== '1') { console.log(`planet: ${count(had)} packs, made ${had.made} (pack ${had.hash}); nothing to fetch`); process.exit(0); }
const tar = path.join(ROOT, 'data', '.planet.tar');
pull(`planet-${list.hash}.tar`, tar);
const ix = unpack(tar);
console.log(`planet: the picture of the Earth, ${count(ix)} packs down to level ${ix.maxLevel}, made ${ix.made} (pack ${ix.hash}); fetched`);
