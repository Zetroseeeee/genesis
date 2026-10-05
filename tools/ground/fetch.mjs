#!/usr/bin/env node
// Brings the ground's materials (the "ground" release: packed by the Ground workflow) into data/tex/: ground.json and the
// two atlases it names. The list is always looked at; the atlases are fetched again only when the list says they were made anew
// (FRESH=1: always). Without the pack the game draws the ground the way it did before there was one.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEX = path.join(ROOT, 'data/tex');
const repo = process.env.GITHUB_REPOSITORY || JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/models.json'), 'utf8')).repo;
const base = `https://github.com/${repo}/releases/download/${process.env.TAG || 'ground'}`;
const pull = (name, to) => { const tmp = to + '.part'; execFileSync('curl', ['-fsSL', '--retry', '3', '-o', tmp, `${base}/${name}`], { stdio: 'ignore' }); fs.renameSync(tmp, to); };
fs.mkdirSync(TEX, { recursive: true });
const listAt = path.join(TEX, 'ground.json'); let had = null; try { had = JSON.parse(fs.readFileSync(listAt, 'utf8')); } catch (e) {}
let list = null;
try { pull('ground.json', listAt + '.new'); list = JSON.parse(fs.readFileSync(listAt + '.new', 'utf8')); } catch (e) { fs.rmSync(listAt + '.new', { force: true }); fs.rmSync(listAt + '.new.part', { force: true }); }
if (!list) { console.log(had ? 'ground: the release cannot be reached; keeping the pack that is here' : 'ground: no pack yet (the game draws the ground the old way)'); process.exit(0); }
let got = 0;
for (const f of [list.albedo, list.normal]) {
  const to = path.join(TEX, f); const stale = process.env.FRESH === '1' || !had || had.made !== list.made || !fs.existsSync(to) || fs.statSync(to).size === 0;
  if (stale) { pull(f, to); got++; }
}
fs.renameSync(listAt + '.new', listAt);
console.log(`ground: ${list.layers.length} materials, made ${list.made}; ${got} atlas${got === 1 ? '' : 'es'} fetched`);
