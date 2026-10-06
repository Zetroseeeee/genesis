#!/usr/bin/env node
// Brings the ground's materials (the "ground" release: packed by the Ground workflow) into data/tex/: ground.json and the
// two atlases it names. A pack is kept in the release under the name of the list it was made from (the first twelve digits
// of the SHA-256 of assets/ground/materials.json and tools/ground/build.py together), and this asks for the pack of the list
// that lies here: a branch that tries other materials gets its own, and the game that is out keeps the ground it was built
// with. Where that pack has not been made (tools/ground/pack.sh makes it) the pack made last is taken, with a warning; with
// GROUND_STRICT=1 (the build of the game) that is an error. The atlases are fetched again only when the list says they
// were made anew (FRESH=1: always). Without any pack the game draws the ground the way it did before there was one.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEX = path.join(ROOT, 'data/tex');
const repo = process.env.GITHUB_REPOSITORY || JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/models.json'), 'utf8')).repo;
const base = `https://github.com/${repo}/releases/download/${process.env.TAG || 'ground'}`;
const H = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'assets/ground/materials.json'))).update(fs.readFileSync(path.join(ROOT, 'tools/ground/build.py'))).digest('hex').slice(0, 12);
const named = (f, h) => h ? f.replace(/(\.[a-z]+)$/, `-${h}$1`) : f;
const pull = (name, to) => { const tmp = to + '.part'; try { execFileSync('curl', ['-fsSL', '--retry', '3', '-o', tmp, `${base}/${name}`], { stdio: 'ignore' }); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; } fs.renameSync(tmp, to); };
fs.mkdirSync(TEX, { recursive: true });
const listAt = path.join(TEX, 'ground.json'); let had = null; try { had = JSON.parse(fs.readFileSync(listAt, 'utf8')); } catch (e) {}
const strict = process.env.GROUND_STRICT === '1';
let list = null, own = H;
const tryList = (h) => { try { pull(named('ground.json', h), listAt + '.new'); return JSON.parse(fs.readFileSync(listAt + '.new', 'utf8')); } catch (e) { fs.rmSync(listAt + '.new', { force: true }); return null; } };
list = tryList(H);
if (!list) {
  if (strict) { console.error(`ground: the pack of this list of materials (${H}) is not in the release. Make it: tools/ground/pack.sh (REF=<this branch>).`); process.exit(1); }
  own = ''; list = tryList('');
  if (list) console.log(`ground: WARNING: the pack of this list of materials (${H}) has not been made (tools/ground/pack.sh makes it); taking the pack made last`);
}
if (!list) { console.log(had ? 'ground: the release cannot be reached; keeping the pack that is here' : 'ground: no pack yet (the game draws the ground the old way)'); process.exit(0); }
let got = 0;
for (const f of [list.albedo, list.normal]) {
  const to = path.join(TEX, f); const stale = process.env.FRESH === '1' || !had || had.made !== list.made || !fs.existsSync(to) || fs.statSync(to).size === 0;
  if (stale) { pull(named(f, own), to); got++; }
}
fs.renameSync(listAt + '.new', listAt);
console.log(`ground: ${list.layers.length} materials, made ${list.made}${own ? ' (pack ' + own + ')' : ''}; ${got} atlas${got === 1 ? '' : 'es'} fetched`);
