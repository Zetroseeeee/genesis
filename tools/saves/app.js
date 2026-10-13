// The worlds on disk in the real app: Electron on this checkout (npm run build first), a folder of its own, three starts.
//   xvfb-run -a -s "-screen 0 1600x1000x24" node tools/saves/app.js [--keep]
//   1. what a player of 0.54 left in the page's storage, written there by hand: the world in play (packed, as a long game's is), two
//      worlds kept (one packed with its picture, one plain), the settings and the news read
//   2. the app moves them into files as it starts - every one there and readable, the page's storage emptied, the settings in
//      Settings.json - and the world in play is continued, saved (Ctrl+S), a copy of it kept with its picture, a picture of the
//      world taken, played on, and the app quit: the world in play is on the disk as it was at the last moment
//   3. continued from there; left for the main menu and a new world founded: the world left is kept aside under its own name and
//      the new one is the world in play; a kept world deleted; a setting changed and in the file; nothing in the page's storage
// About four minutes under software GL. Run it after touching desktop/saves.js, src/disk.js or how the game saves.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron } = require('playwright');
const { Saves, AUTO, EXT } = require('../../desktop/saves.js');

const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'saves-app-')), UD = path.join(TMP, 'userdata'), PICS = path.join(TMP, 'pictures'), SAVES = path.join(UD, 'Saves');
const disk = new Saves({ dir: SAVES, log: () => {} });
let fails = 0, n = 0; const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, what) => { const t = Date.now() + ms; for (;;) { let v = null; try { v = await fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() > t) { console.log('  (waited in vain for ' + what + ')'); return null; } await sleep(500); } };
const files = () => { try { return fs.readdirSync(SAVES).filter((f) => f.endsWith(EXT)).map((f) => f.slice(0, -EXT.length)).sort(); } catch (e) { return []; } };
const prefs = () => { try { return JSON.parse(fs.readFileSync(path.join(UD, 'Settings.json'), 'utf8')); } catch (e) { return {}; } };

async function start(label) {
  console.log('-- ' + label);
  const app = await _electron.launch({
    executablePath: require('electron'), args: [ROOT, '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    env: Object.assign({}, process.env, { GENESIS_USERDATA: UD, GENESIS_PICTURES: PICS, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }), timeout: 180000,
  });
  const out = []; app.process().stdout.on('data', (d) => out.push(String(d)));
  const page = await app.firstWindow(); const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 300)); });
  await page.waitForFunction(() => window.__G && window.__G.sim && document.getElementById('loading').hidden, null, { timeout: 400000 });
  return { app, page, errors, out };
}
// Continue, from the home screen: the camera flies down to where the world was left (a software renderer takes its time over it)
async function cont(s) {
  await s.page.evaluate(() => document.getElementById('btn-load').click());
  await s.page.waitForFunction(() => document.body.dataset.mode === 'play', null, { timeout: 60000 });
  await s.page.waitForFunction(() => !window.__G.mapcam.fly, null, { timeout: 400000 });
}
// the app quit as a player quits it (the game's own Quit): the world in play is written as the window closes
async function quit(s) { const gone = new Promise((r) => s.app.process().once('exit', r)); await s.page.evaluate(() => window.desktop.quit()).catch(() => {}); await Promise.race([gone, sleep(60000)]); }

(async () => {
  // ---- 1. what 0.54 left ----
  let s = await start('1. a page of 0.54 leaves its worlds in its storage');
  const seeded = await s.page.evaluate(async () => {
    const G = window.__G; G.start(44.4, 33.3, 'Testland'); G.run(60);
    const S = G.sim, c = S.playerCiv(), save = S.save(); save.cam = { lon: 44.4, lat: 33.3, dist: 0.01, tilt: 0.8, heading: 0 };
    const json = JSON.stringify(save), gz = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let raw = 'gz1:'; for (let i = 0; i < gz.length; i += 8192) raw += String.fromCharCode.apply(null, gz.subarray(i, i + 8192));
    localStorage.setItem('genesis-save-v2', raw);
    localStorage.setItem('genesis-settings', JSON.stringify(Object.assign({}, G.settings, { uiScale: 1.3 })));
    localStorage.setItem('holocene-news-seen', 'abc1234');
    // a small picture, as the worlds kept had
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 200; const g = cv.getContext('2d'); g.fillStyle = '#4a7'; g.fillRect(0, 0, 320, 200);
    const thumb = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.8));
    const db = await new Promise((res, rej) => { const r = indexedDB.open('holocene', 1); r.onupgradeneeded = () => r.result.createObjectStore('worlds', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const put = (w) => new Promise((res, rej) => { const t = db.transaction('worlds', 'readwrite'); t.objectStore('worlds').put(w); t.oncomplete = res; t.onerror = () => rej(t.error); });
    const data = new Blob([gz]); const name = S.fullName(c);
    await put({ id: 'w1', name: 'Kept packed', realm: name, year: S.year, when: S.fmtYear(S.year), age: c.era, at: 1700000000000, thumb, data, packed: 1, size: data.size });
    await put({ id: 'w2', name: 'Kept plain', realm: name, year: S.year, when: S.fmtYear(S.year), age: c.era, at: 1700000100000, thumb: null, data: new Blob([json]), packed: 0, size: json.length });
    db.close();
    return { year: S.year, realm: name, seed: save.seed, bytes: json.length, packed: raw.length };
  });
  console.log(`   seeded: ${seeded.realm}, ${seeded.year}; ${seeded.bytes} characters, packed ${seeded.packed}`);
  await sleep(3000); await quit(s);
  // (what this new app wrote itself is taken away again: only what 0.54 kept is left for it to find)
  fs.rmSync(SAVES, { recursive: true, force: true }); fs.rmSync(path.join(UD, 'Settings.json'), { force: true });

  // ---- 2. moved into files, continued, saved, kept, quit ----
  s = await start('2. the app moves them into files, and the world goes on');
  let l = await until(async () => { const x = await disk.list(); return x.length >= 3 && x.find((w) => w.auto && w.realm) ? x : null; }, 60000, 'the files');
  l = l || await disk.list();
  const a = l.find((w) => w.auto), k1 = l.find((w) => w.id === 'Kept packed'), k2 = l.find((w) => w.id === 'Kept plain');
  check(!!a && a.year === seeded.year && a.seed === seeded.seed && a.realm === seeded.realm, `the world in play is a file, said for what it is (${a && [a.realm, a.when, a.year].join(', ')})`);
  check(!!k1 && k1.at === 1700000000000 && k1.pic && k1.pic.length > 500 && !!k2 && !k2.pic, 'the worlds kept are files, with their pictures and the day they were kept');
  for (const id of [AUTO, 'Kept packed', 'Kept plain']) { let ok = false; try { const r = await disk.read(id); ok = JSON.parse(r.json).year === seeded.year; } catch (e) {} check(ok, `"${id}" reads back whole`); }
  const st = await s.page.evaluate(async () => ({ save: localStorage.getItem('genesis-save-v2'), settings: localStorage.getItem('genesis-settings'), news: localStorage.getItem('holocene-news-seen'), dbs: (await indexedDB.databases()).map((d) => d.name), ui: window.__G.settings.uiScale, cont: !document.getElementById('btn-load').hidden, line: document.getElementById('home-save').textContent, worlds: document.getElementById('home-worlds-s').textContent }));
  check(st.save === null && st.settings === null && st.news === null && !st.dbs.includes('holocene'), `the page's storage is emptied (${JSON.stringify([st.save && st.save.length, st.settings && st.settings.length, st.news, st.dbs])})`);
  check(st.ui === 1.3 && prefs().settings && prefs().settings.uiScale === 1.3 && prefs().newsSeen === 'abc1234' && prefs().savesMoved === 1, 'the settings are in Settings.json, as they were set');
  check(st.cont && st.line.includes(seeded.realm) && /2 worlds kept/.test(st.worlds), `the home screen offers it: '${st.line}', '${st.worlds}'`);
  await cont(s);
  let y = await s.page.evaluate(() => window.__G.sim.year); check(y === seeded.year, `continued where it was left (${y})`);
  // saved with Ctrl+S (Cmd+S on a Mac)
  y = await s.page.evaluate(() => { window.__G.run(40); return window.__G.sim.year; });
  await s.page.keyboard.press('Control+S');
  check(!!(await until(async () => { const h = (await disk.list()).find((w) => w.auto); return h && h.year === y; }, 30000, 'the save')), `saved: the file is the world in ${y}`);
  // a copy kept, with its picture
  await s.page.evaluate(() => { document.getElementById('btn-menu').click(); document.getElementById('m-worlds').click(); });
  await s.page.waitForFunction(() => document.getElementById('worlds').open, null, { timeout: 20000 });
  await s.page.evaluate(() => { document.getElementById('wd-name').value = 'Test copy'; document.querySelector('#worlds [data-wd="keep"]').click(); });
  const copy = await until(async () => (await disk.list()).find((w) => w.id === 'Test copy'), 60000, 'the copy');
  check(!!copy && copy.year === y && copy.pic && copy.pic.length > 1000, `a copy kept as a file with its picture (${copy && copy.pic ? copy.pic.length : 0} bytes of picture)`);
  const cards = await s.page.evaluate(async () => { await new Promise((r) => setTimeout(r, 1500)); return { n: document.querySelectorAll('#wd-list .wd-card').length, auto: !!document.querySelector('#wd-list .wd-card.auto'), reveal: !document.getElementById('wd-reveal').hidden }; });
  check(cards.n === 4 && cards.auto && cards.reveal, `the page lists them all, the world in play first, and offers the folder (${JSON.stringify(cards)})`);
  await s.page.evaluate(() => document.getElementById('worlds').close());
  // a picture of the world: a file in Pictures
  await s.page.keyboard.press('Shift+S');
  const pic = await until(() => { try { const f = fs.readdirSync(path.join(PICS)).find((x) => x.endsWith('.png')); return f ? path.join(PICS, f) : null; } catch (e) { return null; } }, 30000, 'the picture');
  check(!!pic && /^Holocene - .+\.png$/.test(path.basename(pic)) && fs.readFileSync(pic).readUInt32BE(0) === 0x89504e47, `a picture of the world, as a file: ${pic ? path.basename(pic) : 'none'}`);
  // played on, and quit: the world in play as it was at the last moment
  y = await s.page.evaluate(() => { window.__G.run(80); return window.__G.sim.year; });
  const before = (await disk.list()).find((w) => w.auto).year;
  await quit(s);
  const last = (await disk.list()).find((w) => w.auto);
  check(before !== y && last && last.year === y, `quitting saves the world as it was at the last moment (${last && last.year}; the minute before: ${before})`);
  if (s.errors.length) console.log('   the page said: ' + s.errors.filter((e) => /save|world|disk|file/i.test(e)).slice(0, 5).join(' | '));

  // ---- 3. continued, a new world, a world deleted, the settings ----
  s = await start('3. continued from the file; a new world founded; a world deleted');
  await cont(s);
  const y3 = await s.page.evaluate(() => window.__G.sim.year); check(y3 === y, `continued from the last moment (${y3})`);
  const realm = await s.page.evaluate(() => window.__G.sim.fullName(window.__G.sim.playerCiv()));
  await s.page.evaluate(() => { document.getElementById('btn-menu').click(); document.getElementById('m-new').click(); });
  await s.page.waitForFunction(() => document.body.dataset.mode === 'intro', null, { timeout: 30000 }); await sleep(4000);
  const kept0 = files();
  await s.page.evaluate(() => document.getElementById('btn-random').click());
  const moved = await until(() => { const f = files(); return f.find((x) => x !== AUTO && !kept0.includes(x)) || null; }, 30000, 'the world left, kept aside');
  check(!!moved && moved.startsWith(realm), `the world left is kept aside under its own name: "${moved}"`);
  const fresh = await until(async () => { const h = (await disk.list()).find((w) => w.auto); return h && h.seed !== seeded.seed ? h : null; }, 60000, 'the new world saved');
  check(!!fresh && fresh.year < y3, `the new world is the world in play (${fresh && [fresh.realm, fresh.when].join(', ')})`);
  const kept = await disk.read(moved).then((r) => JSON.parse(r.json)).catch(() => null);
  check(!!kept && kept.year === y && kept.seed === seeded.seed, 'and the world left is whole, as it was left');
  // a world deleted (asked twice)
  await s.page.evaluate(() => { document.getElementById('btn-menu').click(); document.getElementById('m-worlds').click(); });
  await s.page.waitForFunction(() => document.querySelectorAll('#wd-list .wd-card').length >= 4, null, { timeout: 30000 });
  await s.page.evaluate(() => { const c = [...document.querySelectorAll('#wd-list .wd-card')].find((x) => x.dataset.id === 'Test copy'); const b = c.querySelector('[data-wd="del"]'); b.click(); b.click(); });
  check(!!(await until(() => !files().includes('Test copy'), 20000, 'the deleted world gone')), 'a world deleted is gone from the folder');
  await s.page.evaluate(() => document.getElementById('worlds').close());
  // a setting changed: in the file
  await s.page.evaluate(() => { const r = document.getElementById('ui-scale'); r.value = '1.1'; r.dispatchEvent(new Event('input')); });
  check(!!(await until(() => prefs().settings && prefs().settings.uiScale === 1.1, 10000, 'the setting in the file')), 'a setting changed is in Settings.json');
  const web = await s.page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, dbs: (await indexedDB.databases()).length }));
  check(web.local === 0 && web.session === 0 && web.dbs === 0, `nothing is in the page's storage (${JSON.stringify(web)})`);
  await quit(s);

  console.log(fails ? `saves in the app: ${fails} of ${n} checks failed` : `saves in the app: all ${n} checks passed`);
  if (process.argv.includes('--keep') || fails) console.log('working folder kept: ' + TMP); else fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('saves in the app FAILED: ' + (e.stack || e.message)); console.log('working folder kept: ' + TMP); process.exit(1); });
