// Publishes a build to the copies of the game already installed (the reader is desktop/updater.js).
//
// What is kept where (GitHub releases of this repository, or a folder laid out the same way for tests):
//   update/manifest.json          the list of the newest game: every file, its SHA-256, its length
//   content-<0..f>/<sha256><ext>  the files themselves, each under its hash (sixteen shelves: a release holds 1000 files)
//   latest/Holocene-mac-arm64.dmg the whole app
// Only files that some installed app may lack are kept on the shelves. A file is marked "common" (a third entry, 1) in
// the list while every app given out since the epoch carries it; the first build of a line marks them all and shelves
// nothing. From then on a file whose content is not common is shelved - also one that went back to an older content,
// which the apps in between do not have. When that would be too many files, or the shell changed, a new line begins:
// nothing shelved, and older apps are told to fetch the whole app (they see epoch > their own build time).
//
//   node tools/update/publish.js stage   --app <dist> --data <data> --shell <desktop> --pkg package.json --dmg <file> [--content content.json]
//                                         (--repo owner/name | --dir <folder>) [--new-epoch] --out out/manifest.json
//        shelves what is missing, clears what is no longer needed, puts the list up as manifest-next.json (not yet in force)
//   node tools/update/publish.js promote --manifest out/manifest.json (--repo | --dir)       puts it in force
//   node tools/update/publish.js check   (--repo | --dir)       fetches the list in force and asks for every shelved file by its public link
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { validate, blobName } = require('../../desktop/updater.js');
const { make, sha256 } = require('./manifest.js');

const SHELVES = '0123456789abcdef'.split('');
// the files of a list that are not common: shelf name -> { key, hash, size }
function needed(m) { const out = new Map(); for (const k of Object.keys(m.files)) { const f = m.files[k]; if (f[2] === 1) continue; const n = blobName(f[0], k); if (!out.has(n)) out.set(n, { key: k, hash: f[0], size: f[1] }); } return out; }

// prev: the list in force (or null), next: the new build's list (no marks yet), listing: Map shelf name -> length
function plan(prev, next, listing, { maxBlobs = 400, newEpoch = false, app = null } = {}) {
  const was = prev && validate(prev) === null ? prev : null;
  let reason = !was ? 'nothing is published yet' : newEpoch ? 'a new line was asked for' : next.shell.api !== was.shell.api ? 'the shell changed (api ' + was.shell.api + ' -> ' + next.shell.api + ')' : '';
  const mark = (common) => { const files = {}; for (const k of Object.keys(next.files)) { const f = next.files[k]; files[k] = common === null || common.has(f[0]) ? [f[0], f[1], 1] : [f[0], f[1]]; } return files; };
  let files = null;
  if (!reason) {
    const common = new Set(); for (const k of Object.keys(was.files)) if (was.files[k][2] === 1) common.add(was.files[k][0]);
    files = mark(common);
    const n = needed({ files }).size; if (n > maxBlobs) reason = n + ' files differ from the first app of this line: too many to shelve one by one';
  }
  const reset = !!reason; if (reset) files = mark(null);
  const manifest = Object.assign({}, next, { files, epoch: reset ? next.seq : was.epoch }); if (app) manifest.app = app; else delete manifest.app;
  const bad = validate(manifest); if (bad) throw new Error('the new list is not usable: ' + bad);
  const need = needed(manifest); const keep = new Set(need.keys());
  if (was && !reset) for (const n of needed(was).keys()) keep.add(n);        // someone may be half way through fetching the list in force
  const upload = [...need].filter(([n, f]) => listing.get(n) !== f.size).map(([n, f]) => Object.assign({ name: n }, f));
  const remove = [...listing.keys()].filter((n) => !keep.has(n));
  // what a copy of the build before this one will do with the new list
  const expect = !was ? 'first' : reset ? 'app-required' : next.id === was.id ? 'same' : 'updated';
  return { manifest, upload, remove, reset, reason, expect, shelved: need.size };
}

// ---- where things are kept ----
function dirStore(root) {
  const shelf = (n) => path.join(root, 'content-' + n[0]);
  return {
    kind: 'dir ' + root,
    async manifest(name = 'manifest.json') { try { return JSON.parse(fs.readFileSync(path.join(root, 'update', name), 'utf8')); } catch (e) { return null; } },
    async listing() { const out = new Map(); for (const s of SHELVES) { const d = path.join(root, 'content-' + s); if (!fs.existsSync(d)) continue; for (const f of fs.readdirSync(d)) out.set(f, fs.statSync(path.join(d, f)).size); } return out; },
    async put(items) { for (const it of items) { fs.mkdirSync(shelf(it.name), { recursive: true }); fs.copyFileSync(it.file, path.join(shelf(it.name), it.name)); } },
    async remove(names) { for (const n of names) { try { fs.unlinkSync(path.join(shelf(n), n)); } catch (e) {} } },
    async publish(manifest, name = 'manifest.json') { fs.mkdirSync(path.join(root, 'update'), { recursive: true }); fs.writeFileSync(path.join(root, 'update', name), JSON.stringify(manifest)); },
    url(rel) { return 'file://' + path.join(root, rel); },
  };
}
function ghStore(repo) {
  const gh = (args, opts = {}) => execFileSync('gh', args, Object.assign({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }, opts));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const releaseId = (tag) => { try { return gh(['api', `repos/${repo}/releases/tags/${tag}`, '--jq', '.id']).trim(); } catch (e) { return null; } };
  const ensure = (tag, title, notes) => { if (!releaseId(tag)) gh(['release', 'create', tag, '--repo', repo, '--title', title, '--notes', notes, '--latest=false']); };
  const again = async (fn, what) => { for (let i = 0; ; i++) { try { return fn(); } catch (e) { if (i >= 3) throw e; console.log(`${what}: ${String(e.stderr || e.message).trim().split('\n').pop()} - again in ${20 * (i + 1)} s`); await sleep(20000 * (i + 1)); } } };
  return {
    kind: 'github ' + repo,
    async manifest(name = 'manifest.json') {
      const res = await fetch(`https://github.com/${repo}/releases/download/update/${name}?t=${Date.now()}`, { redirect: 'follow', cache: 'no-store' });
      if (res.status === 404) return null; if (!res.ok) throw new Error('the list in force could not be read: HTTP ' + res.status);
      return res.json();
    },
    async listing() {
      const out = new Map();
      for (const s of SHELVES) {
        const id = releaseId('content-' + s); if (!id) continue;
        const rows = gh(['api', '--paginate', `repos/${repo}/releases/${id}/assets?per_page=100`, '--jq', '.[] | "\\(.name)\\t\\(.size)\\t\\(.state)"']).split('\n').filter(Boolean);
        for (const r of rows) { const [name, size, state] = r.split('\t'); out.set(name, state === 'uploaded' ? +size : -1); }
      }
      return out;
    },
    // (GitHub allows about eighty uploads a minute: a dozen at a time with a breath between)
    async put(items) {
      const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'shelve-'));
      for (const s of SHELVES) {
        const mine = items.filter((it) => it.name[0] === s); if (!mine.length) continue;
        ensure('content-' + s, 'Game files ' + s, 'Files of the game, each under its SHA-256. The app\'s updater fetches them; the build keeps this shelf.');
        for (let i = 0; i < mine.length; i += 12) {
          const batch = mine.slice(i, i + 12).map((it) => { const p = path.join(stage, it.name); fs.copyFileSync(it.file, p); return p; });
          await again(() => gh(['release', 'upload', 'content-' + s, ...batch, '--repo', repo, '--clobber']), 'shelving');
          for (const p of batch) fs.unlinkSync(p);
          if (items.length > 12) await sleep(10000);
        }
      }
    },
    async remove(names) { for (const n of names) { try { gh(['release', 'delete-asset', 'content-' + n[0], n, '--repo', repo, '--yes']); } catch (e) { console.log('not removed: ' + n); } } },
    async publish(manifest, name = 'manifest.json') {
      ensure('update', 'Updates', 'What the installed game reads to learn that there is a newer one: manifest.json lists every file of the newest game. Kept by the build.');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'list-')); const f = path.join(dir, name); fs.writeFileSync(f, JSON.stringify(manifest));
      await again(() => gh(['release', 'upload', 'update', f, '--repo', repo, '--clobber']), 'publishing the list');
    },
    url(rel) { return `https://github.com/${repo}/releases/download/${rel}`; },
  };
}

async function stage(store, o) {
  const { manifest: next, sources } = make({ app: o.app, data: o.data, shell: o.shell, pkg: o.pkg });
  if (o.content) { const c = JSON.parse(fs.readFileSync(o.content, 'utf8')); if (c.id !== next.id) throw new Error('the files are not the ones the app\'s own list was made from'); }
  const app = o.dmg ? { name: o.dmgName || path.basename(o.dmg), bytes: fs.statSync(o.dmg).size, sha256: sha256(o.dmg) } : null;
  const prev = await store.manifest(); const listing = await store.listing();
  const p = plan(prev, next, listing, { newEpoch: !!o.newEpoch, maxBlobs: o.maxBlobs || 400, app });
  const up = p.upload.map((u) => ({ name: u.name, file: sources[u.key], size: u.size }));
  const bytes = up.reduce((a, u) => a + u.size, 0);
  console.log(`${store.kind}: ${next.product} ${next.version} (${next.commit}); in force: ${prev ? prev.version + ' (' + prev.commit + ')' : 'nothing'}`);
  if (p.reset) console.log('a new line begins: ' + p.reason + '. Older apps will be told to fetch the whole app.');
  if (prev && prev.shell && prev.shell.hash && next.shell.hash !== prev.shell.hash && next.shell.api === prev.shell.api) console.log('NOTE: the shell (desktop/) changed but its api number did not: installed apps keep their old shell. If the game now needs the new one, raise holocene.shellApi in package.json.');
  console.log(`shelved files: ${p.shelved} needed, ${up.length} to put up (${(bytes / 1e6).toFixed(1)} MB), ${p.remove.length} to clear`);
  await store.put(up); await store.remove(p.remove);
  // every shelved file must be there, whole, before the list may point at it
  const now = await store.listing(); const missing = [...needed(p.manifest)].filter(([n, f]) => now.get(n) !== f.size).map(([n]) => n);
  if (missing.length) throw new Error(missing.length + ' shelved files are missing or the wrong length: ' + missing.slice(0, 5).join(', '));
  await store.publish(p.manifest, 'manifest-next.json');
  if (o.out) { fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true }); fs.writeFileSync(o.out, JSON.stringify(p.manifest)); fs.writeFileSync(o.out.replace(/\.json$/, '') + '-plan.json', JSON.stringify({ expect: p.expect, reset: p.reset, reason: p.reason, shelved: p.shelved, uploaded: up.length, bytes, cleared: p.remove.length, previous: prev ? { version: prev.version, commit: prev.commit, seq: prev.seq } : null })); }
  console.log('staged as manifest-next.json; a copy of the build before this one should end as: ' + p.expect);
  return p;
}
async function check(store) {
  const m = await store.manifest(); if (!m) throw new Error('no list is in force'); const bad = validate(m); if (bad) throw new Error('the list in force is not usable: ' + bad);
  const need = [...needed(m)]; let ok = 0; const wrong = [];
  for (const [n, f] of need) {
    const url = store.url('content-' + n[0] + '/' + n);
    if (url.startsWith('file://')) { let s = -1; try { s = fs.statSync(url.slice(7)).size; } catch (e) {} if (s === f.size) ok++; else wrong.push(n); continue; }
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' }); const len = +res.headers.get('content-length');
    if (res.ok && len === f.size) ok++; else wrong.push(n + ' (HTTP ' + res.status + ', ' + len + ' bytes)');
  }
  console.log(`list in force: ${m.product} ${m.version} (${m.commit}), ${Object.keys(m.files).length} files, epoch ${m.epoch}; shelved ${need.length}, reachable ${ok}`);
  if (wrong.length) throw new Error('not reachable: ' + wrong.slice(0, 6).join(', '));
  return m;
}
module.exports = { plan, needed, dirStore, ghStore, stage, check, SHELVES };

if (require.main === module) {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; }; const has = (n) => process.argv.includes('--' + n);
  const store = arg('dir') ? dirStore(arg('dir')) : arg('repo') ? ghStore(arg('repo')) : null; if (!store) { console.error('--repo owner/name or --dir <folder>'); process.exit(2); }
  const cmd = process.argv[2];
  (async () => {
    if (cmd === 'stage') await stage(store, { app: arg('app'), data: arg('data'), shell: arg('shell'), pkg: arg('pkg', 'package.json'), dmg: arg('dmg'), dmgName: arg('dmg-name'), content: arg('content'), newEpoch: has('new-epoch'), out: arg('out') });
    else if (cmd === 'promote') { const m = JSON.parse(fs.readFileSync(arg('manifest'), 'utf8')); const bad = validate(m); if (bad) throw new Error(bad); await store.publish(m, 'manifest.json'); console.log(`in force: ${m.product} ${m.version} (${m.commit})`); }
    else if (cmd === 'check') await check(store);
    else { console.error('stage | promote | check'); process.exit(2); }
  })().catch((e) => { console.error('FAILED: ' + (e.stderr || e.message)); process.exit(1); });
}
