// Assemble dist/ for local testing and publishing.
// dist/index.html = page as published (no skeleton); dist/local.html = with a doctype skeleton for local browsing.
const fs = require('fs');
const path = require('path');
const SRC = 'src', DIST = 'dist';
fs.mkdirSync(DIST, { recursive: true });
const page = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
fs.writeFileSync(path.join(DIST, 'index.html'), page);
const skeleton = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui;background:#faf9f5}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${page}</body></html>`;
fs.writeFileSync(path.join(DIST, 'local.html'), skeleton.replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'three.min.js'));
for (const f of ['geo.js', 'sim.js', 'terrain.js', 'camera.js', 'town.js', 'portrait.js', 'buildings.js', 'textures.js', 'world.js', 'decal.js', 'trees.js', 'life.js', 'movers.js', 'events.js', 'main.js']) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  try { new Function(src); } catch (e) { console.error('SYNTAX ERROR in', f, e.message); process.exit(1); }
  fs.writeFileSync(path.join(DIST, f), src);
}
// data symlink
const dataLink = path.join(DIST, 'data');
try { fs.unlinkSync(dataLink); } catch (e) {}
fs.symlinkSync(path.resolve('data'), dataLink, 'dir');
let total = 0, files = 0; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { total += fs.statSync(p).size; files++; } } };
walk('data');
// vendored libraries and the stand-alone test pages
fs.copyFileSync('vendor/three.min.js', path.join(DIST, 'three.min.js'));
for (const f of fs.readdirSync('tools/pages')) fs.copyFileSync(path.join('tools/pages', f), path.join(DIST, f));
console.log('build ok; data files', files, (total / 1e6).toFixed(1) + 'MB');
