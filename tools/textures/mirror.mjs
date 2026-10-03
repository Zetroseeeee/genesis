#!/usr/bin/env node
// CI: copy the generated texture atlases and UI art from the generator's CDN into the "textures" release of this
// repository, so builds and dev boxes can fetch them from one place. Reads the URLs from data/tex/atlas.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tex/atlas.json'), 'utf8'));
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const TAG = 'textures';
let have;
try { have = new Set(JSON.parse(sh('gh', ['release', 'view', TAG, '--json', 'assets'])).assets.map((a) => a.name)); }
catch (e) { sh('gh', ['release', 'create', TAG, '--title', 'Textures and UI art', '--notes', 'Generated material atlases and interface art, mirrored from the generator. Fetched by tools/textures/fetch.mjs.', '--latest=false']); have = new Set(); }
const items = [];
for (const [k, a] of Object.entries(man.atlases || {})) items.push([`atlas_${k}`, a.url]);
for (const [k, url] of Object.entries(man.ui || {})) items.push([`ui_${k}`, url]);
const work = fs.mkdtempSync('/tmp/tex-'); let n = 0;
for (const [name, url] of items) {
  if (!/^https?:/.test(url)) continue;
  const file = `${name}${path.extname(new URL(url).pathname) || '.webp'}`;
  if (have.has(file)) continue;
  const p = path.join(work, file);
  sh('curl', ['-fsSL', '--retry', '3', '-o', p, url]); sh('gh', ['release', 'upload', TAG, p, '--clobber']); n++;
  console.log('mirrored', file, fs.statSync(p).size);
}
console.log(`textures: ${n} mirrored, ${items.length - n} already there`);
