#!/usr/bin/env node
// Brings the water's edge (the "water" release: made by the Water workflow, tools/water/build.py) into data/w/: index.json
// and the packs it names. The pack is kept in the release under the name of what it was made from (the first twelve
// digits of the SHA-256 of tools/water/build.py, data/rivers.png and data/index.json together), and this asks for the pack of what lies here: a branch that
// changes the builder gets its own, and the game that is out keeps the shores it was built with. Where that pack has not
// been made (tools/water/pack.sh makes it: about an hour) what is here is kept, with a warning; with WATER_STRICT=1 (the
// build of the game) that is an error. PART=1 takes the trial made last instead (water-part.tar: some blocks only).
// Without any pack the game draws its coasts from the picture of the Earth, as it did before there was one.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'data/w');
const repo = process.env.GITHUB_REPOSITORY || JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/models.json'), 'utf8')).repo;
const base = `https://github.com/${repo}/releases/download/${process.env.TAG || 'water'}`;
const riv = path.join(ROOT, 'data/rivers.png');      // (the rivers the game draws itself go into the making, and its heights: build.py's pack_hash reckons the same)
const H = (() => { const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'tools/water/build.py'))); for (const f of [riv, path.join(ROOT, 'data/index.json')]) if (fs.existsSync(f)) h.update(fs.readFileSync(f)); return h.digest('hex').slice(0, 12); })();
const strict = process.env.WATER_STRICT === '1', part = process.env.PART === '1';
const pull = (name, to) => { const tmp = to + '.part'; try { execFileSync('curl', ['-fsSL', '--retry', '3', '-o', tmp, `${base}/${name}`], { stdio: 'ignore' }); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; } fs.renameSync(tmp, to); };
let had = null; try { had = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')); } catch (e) {}
const count = (ix) => Object.values(ix.levels).reduce((n, l) => n + (l.packs.match(/P/g) || []).length, 0);
const tmp = path.join(ROOT, 'data', '.w.new');
const unpack = (tar) => {
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  execFileSync('tar', ['-xf', tar, '-C', tmp]); fs.rmSync(tar, { force: true });
  const ix = JSON.parse(fs.readFileSync(path.join(tmp, 'index.json'), 'utf8'));
  for (const [lv, l] of Object.entries(ix.levels)) for (let i = 0; i < l.packs.length; i++) if (l.packs[i] === 'P') { const f = path.join(tmp, `${lv}_${i % l.nx}_${Math.floor(i / l.nx)}.${ix.ext || 'webp'}`); if (!fs.existsSync(f) || fs.statSync(f).size === 0) throw new Error('the pack lacks ' + path.basename(f)); }
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
