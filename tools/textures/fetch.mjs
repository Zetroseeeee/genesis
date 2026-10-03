#!/usr/bin/env node
// Download the mirrored texture atlases and UI art into data/tex/ and write data/tex/atlas.offline.json, a copy of
// the manifest that points at the local files. The desktop build uses it so the game needs no network for its art.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEX = path.join(ROOT, 'data/tex');
const man = JSON.parse(fs.readFileSync(path.join(TEX, 'atlas.json'), 'utf8'));
const repo = process.env.GITHUB_REPOSITORY || JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/models.json'), 'utf8')).repo;
const base = `https://github.com/${repo}/releases/download/textures`;
let got = 0, kept = 0, missing = 0;
const pull = (name, url) => {
  const file = `${name}${path.extname(new URL(url).pathname) || '.webp'}`; const p = path.join(TEX, file);
  if (fs.existsSync(p) && fs.statSync(p).size > 0) { kept++; return 'data/tex/' + file; }
  try { execFileSync('curl', ['-fsSL', '--retry', '3', '-o', p, `${base}/${file}`], { stdio: 'ignore' }); got++; return 'data/tex/' + file; }
  catch (e) { fs.rmSync(p, { force: true }); missing++; return url; }
};
const out = JSON.parse(JSON.stringify(man));
for (const [k, a] of Object.entries(out.atlases || {})) if (/^https?:/.test(a.url)) a.url = pull(`atlas_${k}`, a.url);
for (const [k, url] of Object.entries(out.ui || {})) if (/^https?:/.test(url)) out.ui[k] = pull(`ui_${k}`, url);
fs.writeFileSync(path.join(TEX, 'atlas.offline.json'), JSON.stringify(out));
console.log(`textures: ${got} downloaded, ${kept} already here, ${missing} not mirrored yet`);
