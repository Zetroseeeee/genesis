// The list of every file the game serves, with each file's SHA-256 and length: what the updater compares.
//   node tools/update/manifest.js --app <folder with local.html, main.js ...> --data <data folder> --shell <desktop folder>
//                                 [--pkg package.json] --out <file>
// Run on the packed app (so the list is exactly what was packed), it writes the app's own list
// (Contents/Resources/app/desktop/content.json); tools/update/publish.js turns the same list into the published one.
// From a checkout:  node tools/update/manifest.js --app dist --data data --shell desktop --out /tmp/content.json
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { manifestId, validate, FORMAT } = require('../../desktop/updater.js');

// files that are in a checkout's data/ but never packed (package.json: build.extraResources.filter)
const NOT_PACKED = [/^tex\/test_/, /^tex\/shot_/, /^tex\/atlas_local\.json$/, /^tex\/atlas_shot\.json$/];
function sha256(file) { const h = crypto.createHash('sha256'); const fd = fs.openSync(file, 'r'); const buf = Buffer.allocUnsafe(1 << 20); try { for (;;) { const n = fs.readSync(fd, buf, 0, buf.length, null); if (!n) break; h.update(buf.subarray(0, n)); } } finally { fs.closeSync(fd); } return h.digest('hex'); }
function walk(root, each, rel = '') {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name.startsWith('.')) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(root, each, r); else if (e.isFile()) each(r, path.join(root, r));      // (links are not followed: dist/data is one)
  }
}
// { manifest, sources: path in the list -> file on disk }
function make({ app, data, shell, pkg }) {
  const files = {}, sources = {};
  walk(app, (r, f) => { if (r === 'data' || r.startsWith('data/')) return; files[r] = [sha256(f), fs.statSync(f).size]; sources[r] = f; });
  walk(data, (r, f) => { if (NOT_PACKED.some((x) => x.test(r))) return; files['data/' + r] = [sha256(f), fs.statSync(f).size]; sources['data/' + r] = f; });
  const v = JSON.parse(fs.readFileSync(path.join(app, 'version.json'), 'utf8'));
  const p = pkg ? JSON.parse(fs.readFileSync(pkg, 'utf8')) : {};
  const sh = crypto.createHash('sha256'); if (shell) walk(shell, (r, f) => { if (r === 'content.json') return; sh.update(r + '\0'); sh.update(fs.readFileSync(f)); });
  const manifest = {
    format: FORMAT, product: v.name || p.productName || 'Holocene', version: v.version, seq: v.seq, commit: v.commit, built: v.built, id: manifestId(files),
    shell: { api: (p.holocene && p.holocene.shellApi) | 0, hash: shell ? sh.digest('hex').slice(0, 16) : '' },
    epoch: v.seq, notes: Array.isArray(v.notes) ? v.notes : [], files,
  };
  const bad = validate(manifest); if (bad) throw new Error('the list is not usable: ' + bad);
  return { manifest, sources };
}
module.exports = { make, sha256, walk };

if (require.main === module) {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
  const { manifest } = make({ app: arg('app', 'dist'), data: arg('data', 'data'), shell: arg('shell', 'desktop'), pkg: arg('pkg', 'package.json') });
  const out = arg('out'); if (!out) { console.error('--out <file>'); process.exit(2); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(manifest));
  let bytes = 0; for (const k in manifest.files) bytes += manifest.files[k][1];
  console.log(`content list: ${manifest.product} ${manifest.version} (${manifest.commit}), ${Object.keys(manifest.files).length} files, ${(bytes / 1e6).toFixed(1)} MB, shell api ${manifest.shell.api} -> ${out}`);
}
