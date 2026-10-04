// A copy, on this machine, of what the real feed holds for an app that carries a given list: the list in force and
// every file that app would fetch, each checked against the list. For looking at a real update where the feed itself
// is out of an app's reach (see realwalk.js).
//   node tools/update/mirror.mjs <the app's content.json> <folder>
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [have, out] = process.argv.slice(2); if (!have || !out) { console.error('mirror.mjs <content.json> <folder>'); process.exit(2); }
const FEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).holocene.feed.replace(/\/+$/, '');
const ext = (k) => { const m = /\.[A-Za-z0-9]+$/.exec(k); return m ? m[0] : ''; };
fs.mkdirSync(path.join(out, 'update'), { recursive: true });
execFileSync('curl', ['-fsSL', '-o', path.join(out, 'update/manifest.json'), FEED + '/update/manifest.json']);
const a = JSON.parse(fs.readFileSync(have, 'utf8')), b = JSON.parse(fs.readFileSync(path.join(out, 'update/manifest.json'), 'utf8'));
console.log(`the app has ${a.product} ${a.version} (${a.commit}); the feed has ${b.product} ${b.version} (${b.commit}), ${Object.keys(b.files).length} files`);
const has = new Set(Object.values(a.files).map((f) => f[0])); let n = 0, bytes = 0;
for (const [k, f] of Object.entries(b.files)) { if (has.has(f[0])) continue; const dir = path.join(out, 'content-' + f[0][0]); fs.mkdirSync(dir, { recursive: true }); const file = path.join(dir, f[0] + ext(k));
  if (!fs.existsSync(file)) execFileSync('curl', ['-fsSL', '-o', file, `${FEED}/content-${f[0][0]}/${f[0]}${ext(k)}`]);
  if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== f[0] || fs.statSync(file).size !== f[1]) throw new Error('not what the list says: ' + k); n++; bytes += f[1]; }
console.log(`${n} files fetched and checked, ${(bytes / 1e6).toFixed(1)} MB`);
