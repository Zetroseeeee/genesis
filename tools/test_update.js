// The updater, end to end under plain Node: small games in folders, the build's publishing step writing a feed, a web
// server handing the feed out (and misbehaving on demand), and desktop/updater.js as the app would run it.
//   node tools/test_update.js        Exit code 1 on any failure.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { Updater, validate, blobName } = require('../desktop/updater.js');
const { make } = require('./update/manifest.js');
const { plan, needed, dirStore, stage, check: checkFeed } = require('./update/publish.js');

const fails = []; let checks = 0;
function check(cond, msg) { checks++; if (!cond) { fails.push(msg); console.log('  FAIL', msg); } }
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'updtest-'));
const rnd = (n, seed) => { const out = Buffer.alloc(n); let h = crypto.createHash('sha256').update(String(seed)).digest(); for (let o = 0; o < n; o += 32) { h = crypto.createHash('sha256').update(h).digest(); h.copy(out, o, 0, Math.min(32, n - o)); } return out; };
const quiet = console.log; const mute = async (fn) => { const l = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = l; } };

// ---- the games ----
const note = (c, t) => ({ commit: c, date: '2026-10-04', title: t, body: 'What changed, in a few lines.' });
const V = {
  v1: { version: '1.0.0', commit: 'aaaaaaa', seq: 1000, notes: [note('aaaaaaa', 'The first game')] },
  v2: { version: '1.0.1', commit: 'bbbbbbb', seq: 2000, notes: [note('bbbbbbb', 'A great hall'), note('aaaaaaa', 'The first game')] },
  v3: { version: '1.0.2', commit: 'ccccccc', seq: 3000, notes: [note('ccccccc', 'A wiser world'), note('bbbbbbb', 'A great hall'), note('aaaaaaa', 'The first game')] },
  v4: { version: '1.0.3', commit: 'ddddddd', seq: 4000, notes: [note('ddddddd', 'A new window'), note('ccccccc', 'A wiser world')] },
};
const base = () => ({
  'app/local.html': '<html>the page</html>', 'app/main.js': 'console.log("main, first")', 'app/sim.js': 'sim, first', 'app/world.js': 'world', 'app/terrain.js': 'terrain',
  'app/fonts.css': '@font-face{}', 'app/three.min.js': rnd(300000, 'three'),
  'data/tex/atlas.json': '{"a":1}', 'data/tex/a.webp': rnd(200000, 'a'), 'data/models/index.json': '{"models":{}}', 'data/models/hut.glb': rnd(1500000, 'hut'),
  'data/i/0_0_0.webp': rnd(100000, 'i'), 'data/e/0_0_0.png': rnd(50000, 'e'), 'data/world.png': rnd(40000, 'w'),
});
const GAMES = {};
GAMES.v1 = base();
GAMES.v2 = Object.assign(base(), { 'app/main.js': 'console.log("main, second")', 'data/models/hall.glb': rnd(2000000, 'hall'), 'data/tex/atlas.json': '{"a":2}' }); delete GAMES.v2['data/tex/a.webp'];
GAMES.v3 = Object.assign({}, GAMES.v2, { 'app/main.js': GAMES.v1['app/main.js'], 'app/sim.js': 'sim, wiser' });       // main.js goes back to what it was
GAMES.v4 = Object.assign({}, GAMES.v3, { 'app/world.js': 'world, new window' });
const dirOf = (v) => path.join(ROOT, 'games', v);
function writeGame(v) {
  const files = Object.assign({}, GAMES[v], { 'app/version.json': JSON.stringify(Object.assign({ name: 'Holocene', built: '2026-10-04T12:00:00Z' }, V[v])) });
  for (const k of Object.keys(files)) { const f = path.join(dirOf(v), k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, files[k]); }
}
for (const v of Object.keys(GAMES)) writeGame(v);
fs.mkdirSync(path.join(ROOT, 'shell')); fs.writeFileSync(path.join(ROOT, 'shell', 'main.js'), 'shell');
fs.writeFileSync(path.join(ROOT, 'pkg1.json'), JSON.stringify({ productName: 'Holocene', holocene: { shellApi: 1 } }));
fs.writeFileSync(path.join(ROOT, 'pkg2.json'), JSON.stringify({ productName: 'Holocene', holocene: { shellApi: 2 } }));
const pkgOf = (v) => path.join(ROOT, v === 'v4' ? 'pkg2.json' : 'pkg1.json');
const listOf = (v) => make({ app: path.join(dirOf(v), 'app'), data: path.join(dirOf(v), 'data'), shell: path.join(ROOT, 'shell'), pkg: pkgOf(v) }).manifest;
const DMG = rnd(3000000, 'dmg');

// ---- the feed, and a server that can be told to misbehave ----
let feedN = 0;
function newFeed() { const dir = path.join(ROOT, 'feed' + (++feedN)); fs.mkdirSync(path.join(dir, 'latest'), { recursive: true }); fs.writeFileSync(path.join(dir, 'latest', 'Holocene-mac-arm64.dmg'), DMG); return dir; }
async function publish(feed, v, opts = {}) {
  const dmg = path.join(feed, 'latest', 'Holocene-mac-arm64.dmg');
  const p = await mute(() => stage(dirStore(feed), Object.assign({ app: path.join(dirOf(v), 'app'), data: path.join(dirOf(v), 'data'), shell: path.join(ROOT, 'shell'), pkg: pkgOf(v), dmg, out: path.join(feed, 'out.json') }, opts)));
  if (!opts.hold) await dirStore(feed).publish(p.manifest, 'manifest.json');
  return p;
}
const knobs = { feed: null, fail: new Map(), cut: new Map(), corrupt: new Set(), delay: 0, log: [], text: null };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const name = path.basename(u.pathname); knobs.log.push({ name, range: req.headers.range || null });
  const send = () => {
    if (knobs.text !== null && name === 'manifest.json') { res.writeHead(200); return res.end(knobs.text); }
    const file = path.join(knobs.feed, decodeURIComponent(u.pathname));
    if (!file.startsWith(knobs.feed) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('no'); }
    const left = knobs.fail.get(name) | 0; if (left > 0) { knobs.fail.set(name, left - 1); res.writeHead(500); return res.end('no'); }
    let body = fs.readFileSync(file); if (knobs.corrupt.has(name)) { body = Buffer.from(body); body[body.length >> 1] ^= 0xff; }
    let status = 200, start = 0; const m = /^bytes=(\d+)-$/.exec(req.headers.range || ''); if (m) { start = +m[1]; if (start >= body.length) { res.writeHead(416); return res.end(); } status = 206; }
    const part = body.subarray(start); const headers = { 'content-length': part.length, 'accept-ranges': 'bytes' }; if (status === 206) headers['content-range'] = `bytes ${start}-${body.length - 1}/${body.length}`;
    res.writeHead(status, headers);
    const cut = knobs.cut.get(name); if (cut && !m) { knobs.cut.delete(name); res.write(part.subarray(0, cut), () => res.destroy()); return; }      // the line drops part way
    res.end(part);
  };
  if (knobs.delay) setTimeout(send, knobs.delay); else send();
});
const reset = (feed) => { knobs.feed = feed; knobs.fail.clear(); knobs.cut.clear(); knobs.corrupt.clear(); knobs.delay = 0; knobs.log.length = 0; knobs.text = null; };

let clientN = 0;
const newDir = () => path.join(ROOT, 'client' + (++clientN));
function client(v, dir, extra = {}) {
  const logs = [];
  const u = new Updater(Object.assign({ bundle: listOf(v), roots: { app: path.join(dirOf(v), 'app'), data: path.join(dirOf(v), 'data') }, dir, feed: `http://127.0.0.1:${server.address().port}`, shellApi: 1, fetch, retryMs: 5, log: (m) => logs.push(m) }, extra));
  u.logs = logs; return u.init();
}
const read = (u, key) => { const f = u.resolve(key); if (!f) return f; try { return fs.readFileSync(f); } catch (e) { return 'unreadable: ' + f; } };
const same = (a, b) => Buffer.isBuffer(a) && Buffer.compare(a, Buffer.from(b)) === 0;
const storeFiles = (dir) => { try { return fs.readdirSync(path.join(dir, 'store')).filter((f) => f !== 'tmp').sort(); } catch (e) { return []; } };
// every file of game v reads, through the updater, exactly as that game has it - and nothing else is served
function serves(u, v, tag) {
  let wrong = 0; const want = Object.assign({}, GAMES[v]);
  for (const k of Object.keys(want)) { const key = k.replace(/^app\//, ''); if (!same(read(u, key), want[k])) wrong++; }
  check(wrong === 0, `${tag}: ${wrong} files are not served as game ${v} has them`);
  for (const k of Object.keys(GAMES.v1).concat(Object.keys(GAMES.v2))) { const key = k.replace(/^app\//, ''); if (!(k in want)) check(u.resolve(key) === null, `${tag}: ${key} is not part of ${v} and must not be served`); }
  check(JSON.parse(read(u, 'version.json')).version === V[v].version, `${tag}: version.json is that of ${v}`);
}
function serves2(u, v) {
  let wrong = 0; const want = GAMES[v]; for (const k of Object.keys(want)) if (!same(read(u, k.replace(/^app\//, '')), want[k])) wrong++;
  const listed = Object.keys(u.active ? u.active.files : {}).length; check(wrong === 0 && listed === Object.keys(want).length + 1, `${v}: served exactly (${wrong} wrong, ${listed} listed for ${Object.keys(want).length + 1})`);
}
async function update(u) { await u.check(); if (u.phase === 'available') await u.start(); return u.phase === 'ready' && u.apply(); }

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  quiet('1. the rules of the list');
  {
    const m = listOf('v1'); check(validate(m) === null, 'a list made from a game is usable');
    check(Object.keys(m.files).length === Object.keys(GAMES.v1).length + 1, 'every file is listed once'); check(m.files['data/tex/a.webp'] && m.files['main.js'] && !m.files['app/main.js'], 'paths are the ones the page asks for');
    const bad = (change, why) => { const c = JSON.parse(JSON.stringify(m)); change(c); check(validate(c) !== null, 'refused: ' + why); };
    bad((c) => { c.format = 2; }, 'another format'); bad((c) => { delete c.files['local.html']; }, 'no page'); bad((c) => { c.files['main.js'][0] = c.files['sim.js'][0]; }, 'checksum of the list');
    bad((c) => { c.files['../x.js'] = c.files['main.js']; }, 'a path that climbs out'); bad((c) => { c.files['/etc/x'] = c.files['main.js']; }, 'a rooted path'); bad((c) => { c.files['a\\b'] = c.files['main.js']; }, 'a backslash');
    bad((c) => { c.files['main.js'][0] = 'xyz'; }, 'not a hash'); bad((c) => { c.epoch = c.seq + 1; }, 'an epoch in the future'); bad((c) => { c.files = {}; }, 'no files'); bad((c) => { c.app = { name: '../x.dmg', bytes: 1, sha256: m.files['main.js'][0] }; }, 'an app name with a path');
    check(blobName('ab'.repeat(32), 'data/x/y.GLB') === 'ab'.repeat(32) + '.glb' && blobName('ab'.repeat(32), 'LICENSE') === 'ab'.repeat(32), 'a shelved file keeps its ending');
    const off = new Updater({ bundle: null, dir: newDir(), feed: 'http://127.0.0.1:1', fetch }).init(); check(off.phase === 'off' && off.resolve('main.js') === undefined, 'no list in the app: no updates, files served as ever');
    await off.check(); check(off.phase === 'off', 'and it never looks');
  }

  quiet('2. the first build of a line');
  const feed = newFeed(); reset(feed);
  {
    const p = await publish(feed, 'v1'); check(p.reset && p.expect === 'first' && p.upload.length === 0 && p.shelved === 0, 'first build: nothing shelved');
    check(Object.values(p.manifest.files).every((f) => f[2] === 1) && p.manifest.epoch === 1000, 'every file is common, the line starts here');
    const u = client('v1', newDir()); const seen = []; u.on((s) => seen.push(s.phase)); await u.check();
    check(u.phase === 'idle' && u.snapshot().latest === null && seen.includes('checking'), 'the same game: up to date'); check(u.resolve('main.js') === undefined, 'nothing overlaid');
    check(u.snapshot().current.version === '1.0.0' && u.snapshot().current.source === 'app', 'it knows what it runs');
  }

  quiet('3. an update: found, fetched, put to use');
  const dirA = newDir();
  {
    const p = await publish(feed, 'v2'); check(!p.reset && p.expect === 'updated' && p.upload.length === 4, 'second build: the four changed files shelved (' + p.upload.length + ')');
    check(p.manifest.epoch === 1000 && p.manifest.files['main.js'].length === 2 && p.manifest.files['sim.js'][2] === 1, 'changed files lose the mark, the rest keep it');
    const u = client('v1', dirA); await u.check(); const s = u.snapshot();
    check(u.phase === 'available' && s.latest.version === '1.0.1' && s.latest.files === 4, 'the update is offered');
    const want = ['main.js', 'version.json', 'data/models/hall.glb', 'data/tex/atlas.json'].reduce((a, k) => a + p.manifest.files[k][1], 0);
    check(s.latest.bytes === want, 'its size is that of the changed files alone'); check(s.latest.notes.length === 1 && s.latest.notes[0].title === 'A great hall', 'its notes stop at the game in hand');
    check(u.resolve('main.js') === undefined && storeFiles(dirA).length === 0, 'nothing changes before it is asked for');
    const prog = []; u.on((x) => { if (x.progress) prog.push(x.progress.bytes); }); await u.start();
    check(u.phase === 'ready' && storeFiles(dirA).length === 4 && fs.existsSync(path.join(dirA, 'staged.json')), 'fetched whole and set aside'); check(prog.length > 0 && Math.max(...prog) === want, 'progress runs to the full size');
    check(u.resolve('main.js') === undefined, 'still the old game until it is put to use');
    check(u.apply() === true && u.phase === 'idle' && u.pending, 'put to use; waiting for the game to come up'); serves(u, 'v2', 'after the update');
    check(u.resolve('main.js').startsWith(path.join(dirA, 'store')) && u.resolve('sim.js') === path.join(dirOf('v1'), 'app', 'sim.js'), 'changed files from the store, the rest from the app');
    check(u.snapshot().current.version === '1.0.1' && u.snapshot().current.source === 'update', 'it says what it runs now');
    const again = client('v1', dirA); check(again.snapshot().current.version === '1.0.1' && again.pending, 'it is still in use after a restart'); serves(again, 'v2', 'after a restart');
    again.confirm(); check(!again.pending && !fs.existsSync(path.join(dirA, 'previous.json')), 'the game came up: settled'); await again.check(); check(again.phase === 'idle', 'and it is up to date');
  }

  quiet('4. an update that does not come up is undone');
  {
    const dir = newDir(); let u = client('v1', dir); check(await update(u), 'updated'); check(u.snapshot().current.version === '1.0.1', 'runs the new game');
    u = client('v1', dir); check(u.snapshot().current.version === '1.0.1' && u.persist.pending.attempts === 2, 'second start: still trying');
    u = client('v1', dir); const s = u.snapshot(); check(s.current.version === '1.0.0' && s.current.source === 'app' && s.notice === 'undone', 'third start: back to the app\'s own files, and it says so');
    check(u.resolve('main.js') === undefined && !u.pending, 'nothing overlaid any more'); await u.check(); check(u.phase === 'idle' && u.snapshot().latest === null, 'the failed update is not offered again');
    u.ackNotice(); check(client('v1', dir).snapshot().notice === null, 'the notice is shown once');
    // rolled back within one session (the timer in the shell)
    const dir2 = newDir(); const w = client('v1', dir2); await update(w); check(w.rollback('test') && w.snapshot().current.version === '1.0.0' && w.phase === 'idle', 'undone on the spot');
  }

  quiet('5. the next build, with a file that went back');
  {
    const p = await publish(feed, 'v3'); const names = p.upload.map((x) => x.key).sort().join(',');
    check(p.expect === 'updated' && names === 'main.js,sim.js,version.json', 'shelved: the changed files and the one that went back (' + names + ')');
    const listing = await dirStore(feed).listing(); check(listing.size === 7, 'the shelves keep the last build\'s files for whoever is half way (' + listing.size + ')');
    // a copy that never updated; one that installed the second app; one running the second game over the first app
    const a = client('v1', newDir()); await a.check(); check(a.snapshot().latest.files === 4, 'from the first app: four files'); check(await update(a), 'first app -> third game'); serves(a, 'v3', 'first app');
    check(a.resolve('main.js') === path.join(dirOf('v1'), 'app', 'main.js'), 'a file that went back to what the app has is taken from the app');
    const b = client('v2', newDir()); await b.check(); check(b.snapshot().latest.files === 3, 'from the second app: three files'); check(await update(b), 'second app -> third game'); serves(b, 'v3', 'second app');
    const c = client('v1', dirA); check(await update(c), 'updated copy -> third game'); serves(c, 'v3', 'updated copy');
    check(fs.existsSync(path.join(dirA, 'previous.json')) && storeFiles(dirA).length === 6, 'the game before is kept until the new one is up');
    c.confirm(); check(storeFiles(dirA).length === 4, 'then its files go (' + storeFiles(dirA).length + ' left)'); serves(c, 'v3', 'after clearing');
    check(c.snapshot().latest === null && c.phase === 'idle', 'settled');
    const m = await mute(() => checkFeed(dirStore(feed))); check(m.version === '1.0.2', 'the published list and every shelved file can be reached');
  }

  quiet('6. undone to the game before');
  {
    const f2 = newFeed(); reset(f2); await publish(f2, 'v1'); await publish(f2, 'v2'); const dir = newDir(); let u = client('v1', dir); await update(u); u.confirm();
    await publish(f2, 'v3'); check(await update(u), 'second update'); u = client('v1', dir); u = client('v1', dir);
    check(u.snapshot().current.version === '1.0.1' && u.snapshot().notice === 'undone', 'the third game did not come up: back to the second, which did'); serves(u, 'v2', 'after undoing'); check(!u.pending, 'and it is not on trial');
    reset(feed);
  }

  quiet('7. bad lines and bad files');
  {
    const f2 = newFeed(); reset(f2); await publish(f2, 'v1'); const p = await publish(f2, 'v2'); const hall = blobName(p.manifest.files['data/models/hall.glb'][0], 'x.glb');
    let dir = newDir(), u = client('v1', dir); knobs.corrupt.add(hall); await u.check(); await u.start();
    check(u.phase === 'available' && /damaged/.test(u.error) && !fs.existsSync(path.join(dir, 'staged.json')), 'a file that does not match its checksum is refused'); check(u.resolve('main.js') === undefined, 'and nothing is put to use');
    check(!storeFiles(dir).includes(hall), 'the bad file is not kept'); knobs.corrupt.clear(); await u.start(); check(u.phase === 'ready' && u.error === null, 'asked again, it comes whole'); u.apply(); serves(u, 'v2', 'after a bad file');
    // the line drops part way through the largest file: the next try carries on from where it stopped
    dir = newDir(); u = client('v1', dir); knobs.log.length = 0; knobs.cut.set(hall, 700000); await u.check(); await u.start();
    const asked = knobs.log.filter((l) => l.name === hall); check(u.phase === 'ready', 'a dropped line is tried again'); const from = asked[1] && /^bytes=(\d+)-$/.exec(asked[1].range || ''); check(asked.length === 2 && asked[0].range === null && from && +from[1] > 0 && +from[1] <= 700000, 'carrying on from the byte it stopped at (' + JSON.stringify(asked.map((a) => a.range)) + ')');
    u.apply(); serves(u, 'v2', 'after a dropped line');
    dir = newDir(); u = client('v1', dir); knobs.fail.set(hall, 2); await u.check(); await u.start(); check(u.phase === 'ready', 'a server error is tried again');
    dir = newDir(); u = client('v1', dir); knobs.fail.set(hall, 9); await u.check(); await u.start(); check(u.phase === 'available' && /did not finish/.test(u.error), 'and given up on after three, with the reason'); knobs.fail.clear();
    await u.start(); check(u.phase === 'ready' && storeFiles(dir).length === 4, 'what was fetched is kept for the next try');
    // stopped by the player
    dir = newDir(); u = client('v1', dir); knobs.delay = 150; await u.check(); const run = u.start(); setTimeout(() => u.cancel(), 60); await run; knobs.delay = 0;
    check(u.phase === 'available' && u.error === null && u.snapshot().progress === null, 'stopped: offered again, no complaint'); await u.start(); check(u.phase === 'ready', 'and it can be started again');
    // a shelved file that is gone (the build moved on): it looks again instead of failing
    dir = newDir(); u = client('v1', dir); await u.check(); fs.renameSync(path.join(f2, 'content-' + hall[0], hall), path.join(f2, 'gone')); await u.start();
    check(u.phase === 'available' && /still being published/.test(u.error), 'a missing file: told to wait, not broken'); fs.renameSync(path.join(f2, 'gone'), path.join(f2, 'content-' + hall[0], hall));
    // lists that cannot be used
    dir = newDir(); u = client('v1', dir);
    knobs.text = 'not json'; await u.check(); check(u.phase === 'idle' && /could not be read/.test(u.checkError), 'a list that is not a list');
    const m = await dirStore(f2).manifest(); knobs.text = JSON.stringify(Object.assign({}, m, { id: '0'.repeat(64) })); await u.check(); check(u.phase === 'idle' && /checksum/.test(u.checkError), 'a list that does not match its checksum');
    const c = JSON.parse(JSON.stringify(m)); delete c.files['local.html']; knobs.text = JSON.stringify(c); await u.check(); check(u.phase === 'idle' && u.checkError, 'a list without the page');
    knobs.text = null; fs.renameSync(path.join(f2, 'update', 'manifest.json'), path.join(f2, 'update', 'm.json')); await u.check(); check(u.phase === 'idle' && u.checkError === 'none published', 'no list at all');
    fs.renameSync(path.join(f2, 'update', 'm.json'), path.join(f2, 'update', 'manifest.json')); await u.check(); check(u.phase === 'available' && u.checkError === null, 'and found again when it is back');
    const dead = new Updater({ bundle: listOf('v1'), roots: { app: 'x', data: 'y' }, dir: newDir(), feed: 'http://127.0.0.1:1', shellApi: 1, fetch, retryMs: 5 }).init(); await dead.check(); check(dead.phase === 'idle' && dead.checkError, 'no connection: quiet');
    reset(feed);
  }

  quiet('8. between sessions');
  {
    const dir = newDir(); let u = client('v1', dir); await u.check(); await u.start(); check(u.phase === 'ready' && u.snapshot().current.version === '1.0.0', 'fetched, not yet in use, and the app is closed');
    u = client('v1', dir); check(u.snapshot().current.version === '1.0.2' && u.pending, 'at the next start it is in use'); serves(u, 'v3', 'applied at start'); u.confirm();
    // a newer app is installed over a copy that had updated itself
    const w = client('v3', dir); check(w.resolve('main.js') === undefined && w.snapshot().current.source === 'app' && !fs.existsSync(path.join(dir, 'active.json')), 'a newer app: its own files are used, the old update dropped');
    w.gc(); check(storeFiles(dir).length === 0, 'and the store is emptied');
    // files of the update in use go missing
    const d2 = newDir(); u = client('v1', d2); await update(u); u.confirm(); fs.unlinkSync(path.join(d2, 'store', storeFiles(d2)[0]));
    u = client('v1', d2); check(u.resolve('main.js') === undefined && u.snapshot().notice === 'damaged', 'a store with a file missing: back to the app\'s own files'); await u.check(); check(u.phase === 'available', 'and the update is offered afresh');
    await u.start(); check(u.phase === 'ready', 'and fetched again');
    // a newer list arrives while one is waiting
    const f2 = newFeed(); reset(f2); await publish(f2, 'v1'); await publish(f2, 'v2'); const d3 = newDir(); u = client('v1', d3); await u.check(); await u.start(); check(u.phase === 'ready', 'one waiting');
    await publish(f2, 'v3'); await u.check(); check(u.phase === 'available' && u.snapshot().latest.version === '1.0.2', 'a newer one takes its place'); await u.start(); check(u.apply(), 'and is the one put to use'); serves(u, 'v3', 'superseded update');
    reset(feed);
  }

  quiet('9. when files alone will not do');
  {
    const f2 = newFeed(); reset(f2); await publish(f2, 'v1'); await publish(f2, 'v2'); await publish(f2, 'v3');
    const p = await publish(f2, 'v4'); check(p.reset && /shell/.test(p.reason) && p.expect === 'app-required' && p.manifest.epoch === 4000, 'a new shell begins a new line'); check((await dirStore(f2).listing()).size === 0, 'the shelves are cleared');
    const dir = newDir(); let u = client('v1', dir); await u.check(); check(u.phase === 'app-required' && u.snapshot().latest.app.bytes === DMG.length, 'an older app is told to fetch the whole app'); await u.start(); check(u.phase === 'app-required', 'it does not try to patch itself');
    const dl = path.join(ROOT, 'Downloads'); fs.mkdirSync(dl, { recursive: true }); knobs.cut.set('Holocene-mac-arm64.dmg', 1000000); knobs.log.length = 0; const file = await u.getApp(dl);
    check(file === path.join(dl, 'Holocene-1.0.3-mac-arm64.dmg') && same(fs.readFileSync(file), DMG), 'the disk image arrives whole, under its version'); check(knobs.log.filter((l) => /^bytes=[1-9]\d*-$/.test(l.range || '')).length === 1, 'carried on after the line dropped');
    check(u.snapshot().app.phase === 'ready' && u.snapshot().app.file === file, 'and it says where it is'); knobs.log.length = 0; await u.getApp(dl); check(knobs.log.length === 0, 'a copy already fetched is not fetched again');
    knobs.corrupt.add('Holocene-mac-arm64.dmg'); fs.unlinkSync(file); check(await u.getApp(dl) === null && u.snapshot().app.phase === 'error' && !fs.existsSync(file), 'a damaged image is refused'); knobs.corrupt.clear();
    const young = client('v1', newDir(), { shellApi: 2 }); await young.check(); check(young.phase === 'app-required', 'an app from before the line began, likewise');
    const cur = client('v4', newDir(), { shellApi: 2 }); await cur.check(); check(cur.phase === 'idle', 'the app of the new line is up to date');
    // too many changed files to shelve
    const fA = newFeed(); await publish(fA, 'v1'); const p2 = plan(await dirStore(fA).manifest(), listOf('v2'), new Map(), { maxBlobs: 1 }); check(p2.reset && /too many/.test(p2.reason) && p2.expect === 'app-required', 'too many files to shelve: a new line');
    const p3 = plan(await dirStore(feed).manifest(), listOf('v3'), await dirStore(feed).listing()); check(p3.expect === 'same' && p3.upload.length === 0, 'the same game built again: nothing to do');
    // an update that needs a newer shell is never put to use, even if it is lying ready
    const d5 = newDir(); u = client('v1', d5); fs.writeFileSync(path.join(d5, 'staged.json'), JSON.stringify(p.manifest)); u = client('v1', d5); check(u.resolve('main.js') === undefined && !fs.existsSync(path.join(d5, 'staged.json')), 'a waiting update this app cannot run is thrown out');
    reset(feed);
  }

  quiet('10. many builds: any app of the line reaches the game in force, exactly');
  {
    let seed = 20261004; const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; const pick = (a) => a[Math.floor(r() * a.length)];
    const f2 = newFeed(); reset(f2); const names = []; let files = base(); const old = {};      // old: contents a file once had, to go back to
    for (let i = 0; i < 14; i++) {
      const v = 'r' + i;
      if (i > 0) {
        files = Object.assign({}, files); const keys = Object.keys(files).filter((k) => k !== 'app/local.html' && k !== 'app/main.js');
        for (let n = 1 + Math.floor(r() * 3); n > 0; n--) {
          const k = pick(keys), roll = r(); (old[k] = old[k] || []).push(files[k]);
          if (roll < 0.25 && old[k].length > 1 && files[k] !== undefined) files[k] = pick(old[k].filter((x) => x !== undefined));      // back to an earlier content
          else if (roll < 0.4 && k.startsWith('data/')) delete files[k];                                                                 // gone
          else files[k] = rnd(2000 + Math.floor(r() * 30000), v + k);                                                                    // changed (or back from the dead)
        }
        if (r() < 0.4) files['data/models/new' + i + '.glb'] = rnd(5000, v);                                                             // new
        if (r() < 0.2) files['app/main.js'] = 'main ' + i;
        if (r() < 0.35) { const k = pick(Object.keys(files).filter((x) => x.startsWith('data/'))); files[k.replace(/(\.\w+)$/, '_moved' + i + '$1')] = files[k]; delete files[k]; }      // moved: the same content under another name
      }
      GAMES[v] = files; V[v] = { version: '2.0.' + i, commit: 'r' + String(i).padStart(6, '0'), seq: 10000 + i, notes: [] }; writeGame(v); names.push(v);
      const p = await publish(f2, v); check(i === 0 ? p.reset : !p.reset, v + ': ' + (i === 0 ? 'begins the line' : 'stays on the line'));
      const m = await dirStore(f2).manifest(); const listing = await dirStore(f2).listing(); check([...needed(m)].every(([n, f]) => listing.get(n) === f.size), v + ': every shelved file is on the shelves');
      // every app given out so far updates to this game; so does a copy that has been updating itself all along
      let bad = 0; for (const from of names.slice(0, -1)) { const u = client(from, newDir()); if (!(await update(u))) { bad++; continue; } const before = fails.length; serves2(u, v); if (fails.length > before) bad++; }
      check(bad === 0, v + ': ' + bad + ' of ' + (names.length - 1) + ' older apps could not reach it');
    }
    const dir = newDir(); let u = client('r0', dir); check(await update(u), 'a copy that waited through all of them updates in one step'); u.confirm(); serves2(u, 'r13');
    const total = Object.keys((await dirStore(f2).manifest()).files).length; const shelved = (await dirStore(f2).listing()).size; check(shelved < total * 2, 'the shelves do not grow without bound (' + shelved + ' files for a game of ' + total + ')');
    reset(feed);
  }

  server.close();
  quiet(`\n${checks} checks, ${fails.length} failures`);
  if (fails.length) { console.log(fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
  if (ROOT.startsWith(os.tmpdir()) && path.basename(ROOT).startsWith('updtest-')) { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (e) {} }
})().catch((e) => { console.error(e); process.exit(1); });
