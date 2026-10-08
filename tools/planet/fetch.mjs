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
// And the sky (tools/planet/sky.py, the workflow's mode "sky": the stars, the Milky Way, the Moon's near side, the clouds)
// into data/sky/, in the same way: sky-<hash>.tar under the name of its builder (the SHA-256 of tools/planet/sky.py), and
// the pack made last where that one has not been made (with PLANET_STRICT=1: an error). SKYPART=1 takes the trial made
// last (sky-part.tar). Without it the game has a sky with no stars in it, a plain Moon and no clouds.
// And the heights (tools/planet/heights.py, mode "heights": the ground's heights from the Terrain Tiles, two bytes a texel,
// 306 m to a texel where there is relief) into data/h/, likewise: heights-<hash>.tar under the name of its builder.
// Without them the game draws the old heights (data/e, in the repository: one byte a texel, the high mountains smooth).
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
  const ix = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); if (!ix.levels || !(ix.bundle || ix.levels[0] && ix.levels[0].bundle)) throw new Error('index.json is not the list of a pack in bundles');
  const png = ix.ext === 'png';      // (the heights: PNGs, and a bundle's size by level)
  if (all) { if (ix.partial) throw new Error('a trial of some blocks, not the whole Earth'); for (let l = 0; l <= ix.maxLevel; l++) if (!ix.levels[l] || ix.levels[l].packs.length !== ix.levels[l].nx * ix.levels[l].ny || ix.levels[l].packs.includes('?')) throw new Error('level ' + l + ' is not whole'); }
  const heads = new Map(); let packs = 0, bytes = 0;
  try {
    for (const [lv, px, py] of packsOf(ix)) {
      const n = ix.levels[lv].bundle || ix.bundle;
      const f = path.join(dir, `${lv}_b${Math.floor(px / n)}_${Math.floor(py / n)}.bin`); let h = heads.get(f);
      if (!h) { const fd = fs.openSync(f, 'r'), head = Buffer.alloc(8 + n * n * 8); h = { head, fd, size: fs.fstatSync(fd).size }; heads.set(f, h); fs.readSync(fd, head, 0, head.length, 0); if (head.toString('latin1', 0, 4) !== MAGIC || head.readUInt32LE(4) !== n * n) throw new Error(path.basename(f) + ' is not a bundle'); bytes += h.size; }
      const at = 8 + ((py % n) * n + px % n) * 8, off = h.head.readUInt32LE(at), len = h.head.readUInt32LE(at + 4), sig = Buffer.alloc(12);
      if (!len || off + len > h.size) throw new Error(`the pack ${lv}_${px}_${py} is not in its bundle`);
      fs.readSync(h.fd, sig, 0, 12, off); if (png ? sig.toString('latin1', 1, 4) !== 'PNG' : sig.toString('latin1', 0, 4) !== 'RIFF' || sig.toString('latin1', 8, 12) !== 'WEBP') throw new Error(`the pack ${lv}_${px}_${py} is not a picture`);
      packs++;
    }
  } finally { for (const h of heads.values()) fs.closeSync(h.fd); }
  return { ix, packs, bundles: heads.size, bytes };
}
// the heights (tools/planet/heights.py, the workflow's mode "heights"): bundles of PNGs like the picture's, in data/h
const HTS = process.env.HEIGHTS_DIR ? path.resolve(process.env.HEIGHTS_DIR) : path.join(ROOT, 'data/h');
const HH = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'tools/planet/heights.py'))).digest('hex').slice(0, 12);
// the sky's pack: is what is here whole? every file its list names lies here, and is what it is called
const SKY = process.env.SKY_DIR ? path.resolve(process.env.SKY_DIR) : path.join(ROOT, 'data/sky');
const HS = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'tools/planet/sky.py'))).digest('hex').slice(0, 12);
function skyWhole(dir, all) {
  const ix = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  if (all && (ix.partial || !ix.stars || !ix.milkyway || !ix.moon || !ix.clouds)) throw new Error('a trial of some parts, not the whole sky');
  const head = (f, n) => { const fd = fs.openSync(path.join(dir, f), 'r'), b = Buffer.alloc(n); try { fs.readSync(fd, b, 0, n, 0); return { b, size: fs.fstatSync(fd).size }; } finally { fs.closeSync(fd); } };
  const webp = (f) => { const h = head(f, 12); if (h.b.toString('latin1', 0, 4) !== 'RIFF' || h.b.toString('latin1', 8, 12) !== 'WEBP' || h.size < 1000) throw new Error(f + ' is not a picture'); return h.size; };
  let bytes = 0;
  if (ix.stars) { const h = head('stars.bin', 8); if (h.b.toString('latin1', 0, 4) !== 'HST1' || h.b.readUInt32LE(4) !== ix.stars.n || h.size !== 8 + ix.stars.n * ix.stars.bytes) throw new Error('stars.bin is not the list of ' + ix.stars.n + ' stars'); bytes += h.size; }
  if (ix.milkyway) bytes += webp('milkyway.webp');
  if (ix.moon) bytes += webp('moon.webp');
  if (ix.clouds) for (const f of [...ix.clouds.halves, ix.clouds.small]) bytes += webp(f);
  return { ix, bytes };
}
if (process.argv[2] === 'check') {
  let bad = 0;
  try { const { ix, packs, bundles, bytes } = whole(DIR, true); if (packs < 800) throw new Error('only ' + packs + ' packs'); console.log(`planet: the picture of the Earth, ${packs} packs in ${bundles} bundles (${(bytes / 1e6).toFixed(0)} MB), down to level ${ix.maxLevel}, made ${ix.made} (${ix.hash})`); }
  catch (e) { console.error('planet: ' + e.message); bad = 1; }
  try { const { ix, packs, bundles, bytes } = whole(HTS, true); if (packs < 300) throw new Error('only ' + packs + ' packs'); console.log(`planet: the heights, ${packs} packs in ${bundles} bundles (${(bytes / 1e6).toFixed(0)} MB), down to level ${ix.maxLevel}, made ${ix.made} (${ix.hash})`); }
  catch (e) { console.error('planet: the heights: ' + e.message); bad = 1; }
  try { const { ix, bytes } = skyWhole(SKY, true); console.log(`planet: the sky, ${ix.stars.n} stars, the Milky Way, the Moon and the clouds at ${ix.clouds.w} (${(bytes / 1e6).toFixed(0)} MB), made ${ix.made} (${ix.hash})`); }
  catch (e) { console.error('planet: the sky: ' + e.message); bad = 1; }
  process.exit(bad);
}
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
const count2 = (ix) => (ix.stars ? ix.stars.n + ' stars' : 'no stars') + (ix.clouds ? ', clouds at ' + ix.clouds.w : '');
// one pack: its list by the builder's name, or the one made last; then its files, looked at before they take the place of what is here
function bring(o) {      // o: what it is called, its folder, its builder's hash, the names in the release, how to look at a folder, how to say what is in a list
  let had = null; try { had = o.look(o.dir).ix; } catch (e) { had = null; }
  const tmp = o.dir === o.home ? path.join(ROOT, 'data', '.' + path.basename(o.dir) + '.new') : o.dir + '.new';      // (a name git does not see, should a fetch stop half way)
  const unpack = (tar) => {
    fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
    execFileSync('tar', ['-xf', tar, '-C', tmp]); fs.rmSync(tar, { force: true });
    const { ix } = o.look(tmp);
    fs.rmSync(o.dir, { recursive: true, force: true }); fs.renameSync(tmp, o.dir);
    return ix;
  };
  if (o.part) {
    const tar = path.join(ROOT, 'data', `.${o.name}-part.tar`);
    try { pull(`${o.name}-part.tar`, tar); } catch (e) { console.error(`planet: no trial of ${o.what} in the release`); return 1; }
    const ix = unpack(tar); console.log(`planet: a trial of ${o.what}, made ${ix.made}: ${o.say(ix)} (not the game's pack)`);
    return 0;
  }
  const listAt = path.join(ROOT, 'data', `.${o.name}.json`);
  const tryList = (name) => { try { pull(name, listAt); const l = JSON.parse(fs.readFileSync(listAt, 'utf8')); fs.rmSync(listAt, { force: true }); return l; } catch (e) { fs.rmSync(listAt, { force: true }); return null; } };
  let list = tryList(`${o.name}-${o.hash}.json`);
  if (!list) {
    if (strict) { console.error(`planet: the pack of this builder (${o.what}, ${o.hash}) is not in the release. Make it: tools/planet/pack.sh (MODE=${o.mode} REF=<this branch>).`); return 1; }
    list = tryList(`${o.name}.json`);
    if (list) console.log(`planet: WARNING: the pack of this builder (${o.what}, ${o.hash}) has not been made (MODE=${o.mode} tools/planet/pack.sh makes it); taking the pack made last (${list.hash})`);
  }
  if (!list) { console.log(had ? `planet: the release cannot be reached; keeping ${o.what} that is here (${had.hash}${had.partial ? ', a trial' : ''})` : `planet: WARNING: ${o.what} could not be fetched (${o.without})`); return 0; }
  if (had && !had.partial && had.hash === list.hash && had.made === list.made && process.env.FRESH !== '1') { console.log(`planet: ${o.what}: ${o.say(had)}, made ${had.made} (pack ${had.hash}); nothing to fetch`); return 0; }
  const tar = path.join(ROOT, 'data', `.${o.name}.tar`);
  pull(`${o.name}-${list.hash}.tar`, tar);
  const ix = unpack(tar);
  console.log(`planet: ${o.what}: ${o.say(ix)}, made ${ix.made} (pack ${ix.hash}); fetched`);
  return 0;
}
let bad = 0;
bad |= bring({ name: 'planet', what: 'the picture of the Earth', mode: 'imagery', dir: DIR, home: path.join(ROOT, 'data/i'), hash: H, part, look: (d) => whole(d), say: (ix) => `${count(ix)} packs down to level ${ix.maxLevel}`, without: 'the game will have no Earth to show' });
bad |= bring({ name: 'heights', what: 'the heights', mode: 'heights', dir: HTS, home: path.join(ROOT, 'data/h'), hash: HH, part: process.env.HEIGHTSPART === '1', look: (d) => whole(d), say: (ix) => `${count(ix)} packs down to level ${ix.maxLevel}`, without: 'the game will draw the old heights' });
bad |= bring({ name: 'sky', what: 'the sky', mode: 'sky', dir: SKY, home: path.join(ROOT, 'data/sky'), hash: HS, part: process.env.SKYPART === '1', look: (d) => skyWhole(d), say: count2, without: 'the game will have no stars, a plain Moon and no clouds' });
process.exit(bad);
