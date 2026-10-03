#!/usr/bin/env node
// Download the published model files (release assets of this repository) into data/models/. No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'data/models');
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/models.json'), 'utf8'));
const repo = process.env.GITHUB_REPOSITORY || man.repo;
const base = `https://github.com/${repo}/releases/download`;
const curl = (url, out) => execFileSync('curl', ['-fsSL', '--retry', '3', '-o', out, url], { stdio: ['ignore', 'ignore', 'ignore'] });
fs.mkdirSync(OUT, { recursive: true });
const merged = { models: {} }; let got = 0, kept = 0;
for (const set of [...new Set(man.models.filter((m) => m.src).map((m) => m.set))]) {
  const tmp = path.join(OUT, `.index-${set}.json`);
  try { curl(`${base}/models-${set}/index.json`, tmp); } catch (e) { console.log(`no published models for set ${set} yet`); continue; }
  const idx = JSON.parse(fs.readFileSync(tmp, 'utf8')); fs.rmSync(tmp, { force: true });
  for (const [id, entry] of Object.entries(idx.models)) {
    const m = man.models.find((x) => x.id === id); if (!m) continue;      // where and when the model belongs comes from the manifest
    for (const l of entry.card ? entry.lods.concat([entry.card]) : entry.lods) {
      const p = path.join(OUT, l.file);
      if (fs.existsSync(p) && fs.statSync(p).size === l.bytes) { kept++; continue; }
      curl(`${base}/models-${set}/${l.file}`, p); got++;
    }
    merged.models[id] = Object.assign({}, entry, { kinds: m.kinds || [], cultures: m.cultures || null, eras: m.eras || [0, 8], fit: m.fit || '', site: m.site || '', sides: m.sides || '', open: !!m.open, title: m.title });
  }
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(merged));
console.log(`models: ${Object.keys(merged.models).length} in index, ${got} file(s) downloaded, ${kept} already here`);
