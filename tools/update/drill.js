// The update drill: the real app, a feed on this machine, and four starts that between them take an update the way a
// player's copy would.
//   node tools/update/drill.js                                  the checkout, under Electron (software GL: slow)
//   node tools/update/drill.js --app release/mac-arm64/Holocene.app      the packed app (the build runs this on a Mac)
//   1. the app, as given out, finds a newer game on the feed, fetches it, puts it to use and comes up on it   -> updated
//   2. started again, it is running the new game from its store and finds nothing newer                       -> current
//   3. a build that cannot start is published; the app takes it, fails to come up, and goes back by itself     -> undone
//   4. started again, it still runs the game that works and is not offered the broken one                      -> current
// The feed is made with the same code the build publishes with (publish.js, into a folder), served over HTTP.
// Options: --keep (leave the working folder), --xvfb (wrap the app in xvfb-run), --timeout <s per start>.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { make } = require('./manifest.js');
const { dirStore, stage } = require('./publish.js');
const serve = require('./serve.js');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; }; const has = (n) => process.argv.includes('--' + n);
const APP = arg('app'); const TIMEOUT = +arg('timeout', APP ? 150 : 240);
const R = APP
  ? { dist: path.join(APP, 'Contents/Resources/app/dist'), data: path.join(APP, 'Contents/Resources/data'), shell: path.join(APP, 'Contents/Resources/app/desktop'), pkg: path.join(APP, 'Contents/Resources/app/package.json') }
  : { dist: 'dist', data: 'data', shell: 'desktop', pkg: 'package.json' };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'drill-')); const FEED = path.join(TMP, 'feed'); const store = dirStore(FEED);
const quietly = async (fn) => { const l = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = l; } };

// a copy of the game's own files (not the world data) with some of them changed
function variant(name, from, change) {
  const dir = path.join(TMP, name); fs.cpSync(from, dir, { recursive: true });      // (a checkout's dist/data is a link: copied as a link, and the list leaves it out)
  change(dir); return dir;
}
const publish = async (dist) => { const p = await quietly(() => stage(store, { app: dist, data: R.data, shell: R.shell, pkg: R.pkg })); await store.publish(p.manifest, 'manifest.json'); return p; };

function start(env, label) {
  return new Promise((done) => {
    let cmd, args;
    if (APP) { const bin = path.join(APP, 'Contents/MacOS'); cmd = path.join(bin, fs.readdirSync(bin)[0]); args = ['--smoke']; }
    else { cmd = require('electron'); args = ['.', '--smoke', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']; }
    if (has('xvfb')) { args = ['-a', cmd, ...args]; cmd = 'xvfb-run'; }
    const child = spawn(cmd, args, { env: Object.assign({}, process.env, env, { GENESIS_SMOKE: '1', GENESIS_SMOKE_UPDATE: '1', GENESIS_SMOKE_TIMEOUT: String(TIMEOUT), ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', log = ''; child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { log += d; });
    const kill = setTimeout(() => child.kill('SIGKILL'), (TIMEOUT * 3 + 200) * 1000);
    child.on('close', (code) => {
      clearTimeout(kill); const line = out.split('\n').filter((l) => l.startsWith('GENESIS-SMOKE ')).pop(); let r = null; try { r = JSON.parse(line.slice(14)); } catch (e) {}
      const u = r && r.update ? r.update : {}; const ok = code === 0 && !!r && r.ok;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${u.result || (r ? 'no update report' : 'no report')}${u.from ? ' | was ' + u.from : ''}${u.to ? ' | offered ' + u.to : ''}${u.running ? ' | running ' + u.running : ''}${u.files ? ` | ${u.files} files, ${u.bytes} bytes in ${u.fetched} s` : ''}${r && r.seconds ? ` | ${r.seconds} s` : ''}${u.error ? ' | ' + u.error : ''}`);
      if (!ok) { console.log(out.split('\n').filter((l) => /\[update\]|GENESIS-SMOKE/.test(l)).slice(-12).join('\n')); console.log(log.split('\n').filter((l) => l && !/Gtk|dbus|DBus|libva|vaapi|GLib|Fontconfig|ALSA|\bgpu\b|viz_main|sandbox|angle|ANGLE/i.test(l)).slice(-8).join('\n')); }
      done({ ok, r, out });
    });
  });
}

(async () => {
  const stamp = (dir, version, commit, dt, title) => { const f = path.join(dir, 'version.json'); const v = JSON.parse(fs.readFileSync(f, 'utf8')); v.version = version; v.commit = commit; v.seq += dt; v.built = new Date(v.seq * 1000).toISOString(); v.notes = [{ commit, date: v.built.slice(0, 10), title, body: 'Made by the update drill.' }].concat(v.notes || []); fs.writeFileSync(f, JSON.stringify(v)); };
  // A: the game as the app carries it
  const a = await publish(R.dist); const own = APP ? JSON.parse(fs.readFileSync(path.join(R.shell, 'content.json'), 'utf8')) : make({ app: R.dist, data: R.data, shell: R.shell, pkg: R.pkg }).manifest;
  if (own.id !== a.manifest.id) throw new Error('the app\'s own list does not describe the files it carries');
  const content = path.join(TMP, 'content.json'); fs.writeFileSync(content, JSON.stringify(own));
  // B: a newer game - its version, a script and the page changed, one file new
  const b = variant('b', R.dist, (dir) => { stamp(dir, own.version + '-drill', 'drill01', 60, 'The update drill: a newer game'); fs.appendFileSync(path.join(dir, 'main.js'), '\n// the update drill was here\n'); fs.appendFileSync(path.join(dir, 'local.html'), '\n<!-- the update drill was here -->\n'); fs.writeFileSync(path.join(dir, 'drill.txt'), 'a file the app never had\n'); });
  const pb = await publish(b); if (pb.expect !== 'updated') throw new Error('the drill feed came out wrong: ' + pb.expect + ' ' + pb.reason);
  const server = await serve(FEED); const env = { GENESIS_UPDATE_FEED: 'http://127.0.0.1:' + server.address().port, GENESIS_USERDATA: path.join(TMP, 'userdata'), GENESIS_UPDATE_GUARD: '30' }; if (!APP) env.GENESIS_CONTENT = content;
  console.log(`update drill: ${APP || 'the checkout under Electron'}; ${own.product} ${own.version} (${own.commit}), ${Object.keys(own.files).length} files; feed ${env.GENESIS_UPDATE_FEED}; ${pb.upload.length} files shelved for the newer game`);
  const results = [];
  results.push(await start(Object.assign({ GENESIS_SMOKE_EXPECT: 'updated', GENESIS_SMOKE_SHOT: arg('shot', '') }, env), '1. takes the update'));
  results.push(await start(Object.assign({ GENESIS_SMOKE_EXPECT: 'current' }, env), '2. starts on it again'));
  // C: a build that cannot start
  const c = variant('c', b, (dir) => { stamp(dir, own.version + '-drill2', 'drill02', 120, 'The update drill: a build that cannot start'); const f = path.join(dir, 'main.js'); fs.writeFileSync(f, 'throw new Error("update drill: this build must not start");\n' + fs.readFileSync(f, 'utf8')); });
  await publish(c);
  results.push(await start(Object.assign({ GENESIS_SMOKE_EXPECT: 'undone' }, env), '3. a broken update is undone'));
  results.push(await start(Object.assign({ GENESIS_SMOKE_EXPECT: 'current' }, env), '4. and stays undone'));
  server.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(bad ? `update drill: ${bad} of ${results.length} steps failed` : `update drill: all ${results.length} steps passed`);
  if (has('keep') || bad) console.log('working folder kept: ' + TMP); else if (path.basename(TMP).startsWith('drill-')) fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('update drill FAILED: ' + (e.stack || e.message)); process.exit(1); });
