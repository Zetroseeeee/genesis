// Assemble dist/ for local testing and publishing.
// dist/index.html = page as published (no skeleton); dist/local.html = with a doctype skeleton for local browsing
// and for the desktop app: its libraries and typefaces come from disk, so it runs with no network.
// dist/version.json says what this build is (name, version, commit, when) and carries its "What's new": the subjects
// and first paragraphs of the latest commits that changed the game. The page shows it, and the updater's lists are
// stamped from it (tools/update/manifest.js) - so write commit subjects for the people who play.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const SRC = 'src', DIST = 'dist';
fs.mkdirSync(DIST, { recursive: true });
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const page = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
fs.writeFileSync(path.join(DIST, 'index.html'), page);
const skeleton = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui;background:#faf9f5}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${page}</body></html>`;
// when the art has been fetched to disk (tools/textures/fetch.mjs) the local page uses it instead of the CDN copies
const offline = fs.existsSync('data/tex/atlas.offline.json') ? `<script>window.GENESIS_TEX_URL = window.GENESIS_TEX_URL || 'data/tex/atlas.offline.json';</script>` : '';
const swap = (html, from, to) => { if (!html.includes(from)) { console.error('build: the page no longer contains', from.slice(0, 60)); process.exit(1); } return html.replace(from, to); };
let local = skeleton.replace('<body>', '<body>' + offline);
local = swap(local, 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'three.min.js');
local = swap(local, 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', 'GLTFLoader.js');
local = swap(local, 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_decoder.js', 'meshopt_decoder.js');
{ const m = /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/.exec(local); if (!m) { console.error('build: the page no longer links its web fonts'); process.exit(1); } local = local.replace(m[0], '<link rel="stylesheet" href="fonts.css">'); }
fs.writeFileSync(path.join(DIST, 'local.html'), local);
for (const f of ['geo.js', 'shadows.js', 'econ.js', 'know.js', 'rule.js', 'sim.js', 'terrain.js', 'camera.js', 'town.js', 'portrait.js', 'buildings.js', 'textures.js', 'models.js', 'world.js', 'decal.js', 'trees.js', 'life.js', 'movers.js', 'events.js', 'market.js', 'tree.js', 'gov.js', 'main.js']) {
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
// vendored libraries, the typefaces, the mark, and the stand-alone test pages
for (const f of ['three.min.js', 'GLTFLoader.js', 'meshopt_decoder.js']) fs.copyFileSync(path.join('vendor', f), path.join(DIST, f));
fs.mkdirSync(path.join(DIST, 'fonts'), { recursive: true });
for (const f of fs.readdirSync('vendor/fonts')) fs.copyFileSync(path.join('vendor/fonts', f), f === 'fonts.css' ? path.join(DIST, f) : path.join(DIST, 'fonts', f));
fs.copyFileSync(path.join(SRC, 'mark.png'), path.join(DIST, 'mark.png'));
// the model library is optional: an empty index keeps the page quiet when no models have been fetched
if (!fs.existsSync('data/models/index.json')) { fs.mkdirSync('data/models', { recursive: true }); fs.writeFileSync('data/models/index.json', '{"models":{}}'); }
for (const f of fs.readdirSync('tools/pages')) fs.copyFileSync(path.join('tools/pages', f), path.join(DIST, f));
// what this build is, and what changed lately (GENESIS_BUILD_TIME and GENESIS_COMMIT pin them, for tests)
{
  const git = (args) => { try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 << 20 }); } catch (e) { return ''; } };
  const when = process.env.GENESIS_BUILD_TIME ? new Date(process.env.GENESIS_BUILD_TIME) : new Date();
  const commit = process.env.GENESIS_COMMIT || git(['rev-parse', '--short=7', 'HEAD']).trim() || 'dev';
  const notes = git(['log', '-n', '40', '--date=short', '--format=%h%x1f%ad%x1f%s%x1f%b%x1e', '--abbrev=7', '--', 'src', 'data', 'assets', 'desktop', 'vendor', 'package.json']).split('\x1e').map((r) => r.replace(/^\s+/, '')).filter(Boolean).map((r) => {
    const [h, date, title, body] = r.split('\x1f');
    // (trailers and the notes to the build are not for players)
    const text = String(body || '').split('\n').filter((l) => !/^(Co-Authored-By|Claude-Session|Signed-off-by):/i.test(l.trim())).join('\n').replace(/\s*\b\d+\.\d+\.\d+\s*$/, '').trim();
    return { commit: h, date, title: String(title || '').replace(/\s*\[skip ci\]\s*/gi, ' ').trim(), body: text.slice(0, 1400) };
  }).filter((n) => n.title);
  if (process.env.GENESIS_COMMIT && (!notes[0] || notes[0].commit !== commit)) notes.unshift({ commit, date: when.toISOString().slice(0, 10), title: process.env.GENESIS_NOTE || 'A test build', body: '' });
  fs.writeFileSync(path.join(DIST, 'version.json'), JSON.stringify({ name: pkg.productName || 'Holocene', version: pkg.version, commit, built: when.toISOString(), seq: Math.floor(when.getTime() / 1000), notes }));
  console.log('build ok;', pkg.productName, pkg.version, commit + ';', 'data files', files, (total / 1e6).toFixed(1) + 'MB;', notes.length, 'notes');
}
