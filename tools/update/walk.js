// Pictures of what a player sees of an update, taken in the real app (Electron) against a feed on this machine:
// the note on the home screen, fetching, the restart, "What's new", the spark while playing, and the case where a
// whole new app is needed.   xvfb-run -a -s "-screen 0 1920x1200x24" node tools/update/walk.js      (shots/up_*.png)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('playwright');
const { make } = require('./manifest.js');
const { dirStore, stage } = require('./publish.js');
const serve = require('./serve.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-')); const FEED = path.join(TMP, 'feed'); const store = dirStore(FEED);
const quietly = async (fn) => { const l = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = l; } };
const variant = (name, from, change) => { const dir = path.join(TMP, name); fs.cpSync(from, dir, { recursive: true }); change(dir); return dir; };
const stamp = (dir, version, commit, dt, notes) => { const f = path.join(dir, 'version.json'); const v = JSON.parse(fs.readFileSync(f, 'utf8')); v.version = version; v.commit = commit; v.seq += dt; v.built = new Date(v.seq * 1000).toISOString(); v.notes = notes.map((n, k) => ({ commit: k ? commit + k : commit, date: v.built.slice(0, 10), title: n[0], body: n[1] || '' })).concat(v.notes || []); fs.writeFileSync(f, JSON.stringify(v)); };
const publish = async (dist, o = {}) => { const p = await quietly(() => stage(store, Object.assign({ app: dist, data: 'data', shell: 'desktop', pkg: 'package.json' }, o))); await store.publish(p.manifest, 'manifest.json'); return p; };

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await publish('dist'); const own = make({ app: 'dist', data: 'data', shell: 'desktop', pkg: 'package.json' }).manifest; const content = path.join(TMP, 'content.json'); fs.writeFileSync(content, JSON.stringify(own));
  const next = (v) => { const p = own.version.split('.'); p[2] = +p[2] + v; return p.join('.'); };
  const b = variant('b', 'dist', (dir) => { stamp(dir, next(1), 'walk001', 60, [['Open fires burn in the squares after dark', 'Towns without lamps light a great fire on the square from dusk till morning, and braziers either side of each gate.'], ['Rivers freeze where the winters are hard'], ['The turn report fits a low window']]); fs.appendFileSync(path.join(dir, 'main.js'), '\n// walk\n'); fs.writeFileSync(path.join(dir, 'pack.bin'), Buffer.alloc(14e6, 7)); });
  await publish(b);
  const server = await serve(FEED, 1.6e6);      // (slowly, so that fetching can be seen)
  const env = Object.assign({}, process.env, { GENESIS_UPDATE_FEED: 'http://127.0.0.1:' + server.address().port, GENESIS_USERDATA: path.join(TMP, 'userdata'), GENESIS_CONTENT: content, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' });
  const app = await _electron.launch({ executablePath: require('electron'), args: ['.', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], env });
  const main = []; app.process().stdout.on('data', (d) => { for (const l of String(d).split('\n')) if (/\[update\]/.test(l)) main.push(l); });
  const win = await app.firstWindow(); const logs = []; win.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message)); win.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  const shot = async (name) => { await win.screenshot({ path: `shots/up_${name}.png` }); console.log('shots/up_' + name + '.png'); };
  const up = (sel = '#update:not([hidden])') => win.waitForSelector(sel, { timeout: 120000 });
  const title = async (t) => { try { await win.waitForFunction((x) => document.getElementById('up-title').textContent === x && !document.getElementById('update').hidden, t, { timeout: 90000 }); } catch (e) { console.log('waiting for "' + t + '":', JSON.stringify(await win.evaluate(() => window.desktop.update.state())).slice(0, 700), '\n' + main.slice(-6).join('\n'), '\n' + logs.slice(-6).join('\n')); throw e; } };
  const ready = () => win.waitForFunction(() => window.__G && window.__G.sim && document.getElementById('loading').hidden, null, { timeout: 180000 });

  await ready(); await title('Update ready'); await win.waitForTimeout(2500); await shot('1_ready');
  await win.click('#up-go'); await title('Fetching the update'); await win.waitForTimeout(1600); await shot('2_fetching');
  await title('Update fetched'); await win.waitForTimeout(400); await shot('3_fetched');
  await win.click('#up-go'); await win.waitForTimeout(1500); await ready(); await win.waitForTimeout(700);
  console.log('after the restart it says:', JSON.stringify(await win.evaluate(() => [...document.querySelectorAll('#tc .toast')].map((t) => t.textContent)))); await win.waitForTimeout(1500); await shot('4_restarted');
  console.log('running', await win.evaluate(() => GENESIS_VERSION.version + ' ' + GENESIS_VERSION.commit), '| status:', await win.evaluate(() => document.getElementById('home-status').textContent));
  await win.click('#btn-news'); await win.waitForTimeout(700); await shot('5_whats_new'); await win.click('#news-close');
  await win.click('#btn-settings'); await win.waitForTimeout(500); await shot('6_settings'); await win.click('#m-close');
  // a further update arrives while a world is being played
  const c = variant('c', b, (dir) => { stamp(dir, next(2), 'walk002', 120, [['Stars over the night side of the Earth'], ['A porch temple for the Near East and India']]); fs.appendFileSync(path.join(dir, 'main.js'), '\n// walk 2\n'); });
  await publish(c);
  await win.click('#btn-random'); await win.waitForFunction(() => document.body.dataset.mode === 'play', null, { timeout: 60000 }); await win.waitForTimeout(9000);
  await win.evaluate(() => window.desktop.update.check()); await title('Update ready'); await win.waitForTimeout(600); await shot('7_playing_note');
  await win.click('#up-alt'); await win.waitForTimeout(500); await shot('8_playing_spark');
  // and one that needs a whole new app
  fs.mkdirSync(path.join(FEED, 'latest'), { recursive: true }); const dmg = path.join(FEED, 'latest', 'Holocene-mac-arm64.dmg'); fs.writeFileSync(dmg, Buffer.alloc(24e6, 3));
  const pkg2 = path.join(TMP, 'package.json'); const pj = JSON.parse(fs.readFileSync('package.json', 'utf8')); pj.holocene.shellApi += 1; fs.writeFileSync(pkg2, JSON.stringify(pj));
  const d = variant('d', c, (dir) => { stamp(dir, next(10), 'walk003', 180, [['The game can now run in more than one window']]); });
  await publish(d, { pkg: pkg2, dmg });
  await win.evaluate(() => window.desktop.update.check()); await title('A new app is needed'); await win.waitForTimeout(600); await shot('9_new_app');
  await win.click('#up-go'); await title('Fetching the new app'); await win.waitForTimeout(2500); await shot('10_new_app_fetching');
  await title('The new app is here'); await win.waitForTimeout(500); await shot('11_new_app_here');
  console.log(logs.slice(0, 8).join('\n'));
  await app.close(); server.close();
  if (path.basename(TMP).startsWith('walk-')) fs.rmSync(TMP, { recursive: true, force: true });
})().catch((e) => { console.error('walk FAILED: ' + (e.stack || e.message)); process.exit(1); });
