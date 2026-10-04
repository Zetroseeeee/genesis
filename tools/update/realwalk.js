// Pictures of a real update in the real app: the app as it was given out takes what the real feed holds now.
// (walk.js shows every state an update can be in, with made-up versions; this shows the one that is really out.)
//
// The app as it was given out is a checkout of that commit, built with the time of the build that gave it out: the
// files are then the same byte for byte, and its list has the id of the published one - check that it does.
//   git worktree add --detach /tmp/prev <commit>          (and give it node_modules, data/models and the art of data/tex that git does not hold: real copies, not links)
//   (cd /tmp/prev && GENESIS_BUILD_TIME=<"built" of that version's list> GENESIS_COMMIT=<commit> node tools/build.js \
//      && node tools/update/manifest.js --app dist --data data --shell desktop --pkg package.json --out /tmp/prev.json)
//   node tools/update/mirror.mjs /tmp/prev.json /tmp/mirror
//   xvfb-run -a -s "-screen 0 1920x1200x24" node tools/update/realwalk.js /tmp/prev /tmp/prev.json /tmp/mirror shots real
// Writes <shots>/<name>_1_ready.png, _2_fetching, _3_fetched, _4_restarted, _5_whats_new.
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const [APP, CONTENT, MIRROR, SHOTS, NAME] = process.argv.slice(2); if (!NAME) { console.error('realwalk.js <checkout> <its content.json> <mirror> <shots folder> <name>'); process.exit(2); }
const { _electron } = require('playwright');
const serve = require('./serve.js');
(async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'realwalk-')); const server = await serve(path.resolve(MIRROR), +(process.env.RATE || 2.2e6));      // (slowly, so that fetching can be seen)
  const env = Object.assign({}, process.env, { GENESIS_UPDATE_FEED: 'http://127.0.0.1:' + server.address().port, GENESIS_USERDATA: path.join(TMP, 'userdata'), GENESIS_CONTENT: path.resolve(CONTENT), ELECTRON_DISABLE_SECURITY_WARNINGS: '1' });
  const app = await _electron.launch({ executablePath: require('electron'), cwd: path.resolve(APP), args: ['.', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], env });
  const main = []; app.process().stdout.on('data', (d) => { for (const l of String(d).split('\n')) if (/\[update\]/.test(l)) main.push(l); });
  const win = await app.firstWindow(); const logs = []; win.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  const shot = async (n) => { const f = path.join(SHOTS, `${NAME}_${n}.png`); await win.screenshot({ path: f }); console.log(f); };
  const title = async (t) => { try { await win.waitForFunction((x) => document.getElementById('up-title').textContent === x && !document.getElementById('update').hidden, t, { timeout: 240000 }); } catch (e) { console.log('waiting for "' + t + '":', JSON.stringify(await win.evaluate(() => window.desktop.update.state())).slice(0, 700)); throw e; } };
  const ready = () => win.waitForFunction(() => window.__G && window.__G.sim && document.getElementById('loading').hidden, null, { timeout: 240000 });
  await ready(); console.log('running', await win.evaluate(() => GENESIS_VERSION.version + ' ' + GENESIS_VERSION.commit));
  await title('Update ready'); await win.waitForTimeout(2500); await shot('1_ready');
  console.log('the note says:', JSON.stringify(await win.evaluate(() => document.getElementById('update').innerText)));
  await win.click('#up-go'); await title('Fetching the update'); await win.waitForTimeout(2200); await shot('2_fetching');
  await title('Update fetched'); await win.waitForTimeout(400); await shot('3_fetched');
  await win.click('#up-go'); await win.waitForTimeout(1500); await ready(); await win.waitForTimeout(700);
  console.log('after the restart it says:', JSON.stringify(await win.evaluate(() => [...document.querySelectorAll('#tc .toast')].map((t) => t.textContent)))); await win.waitForTimeout(1500); await shot('4_restarted');
  console.log('running', await win.evaluate(() => GENESIS_VERSION.version + ' ' + GENESIS_VERSION.commit), '| status:', await win.evaluate(() => document.getElementById('home-status').textContent));
  await win.click('#btn-news'); await win.waitForTimeout(700); await shot('5_whats_new');
  console.log(main.slice(-12).join('\n')); console.log(logs.slice(0, 6).join('\n'));
  await app.close(); server.close();
})().catch((e) => { console.error('real walk FAILED: ' + (e.stack || e.message)); process.exit(1); });
