// Holocene desktop shell: one window, the game served from disk over a private scheme (so fetch, textures and saves
// behave exactly as they do on the web). World data and models live beside the app, not inside its archive.
// The game's files can be newer than the app that carries them: updater.js fetches changed files into a store beside
// the saves and this shell serves them in place of the app's own (see updater.js). The shell itself - this folder -
// only changes with a new app; package.json's holocene.shellApi is raised when the game comes to need a newer one.
const { app, BrowserWindow, Menu, net, protocol, shell, ipcMain, session } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { Updater } = require('./updater.js');
const PKG = require('../package.json');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DATA = app.isPackaged ? path.join(process.resourcesPath, 'data') : path.join(ROOT, 'data');
const NAME = PKG.productName || 'Holocene';
const SMOKE = process.argv.includes('--smoke') || process.env.GENESIS_SMOKE === '1';
const DRILL = SMOKE && process.env.GENESIS_SMOKE_UPDATE === '1';      // the self-check also takes an update, start to finish

// Saves, settings and fetched updates live in one folder whatever the game is called on the outside ("GENESIS" was
// its first name): a new name must never cost anyone their worlds.
// (The self-check works in a folder of its own that it throws away: it never sees or touches anyone's worlds.)
if (SMOKE && !process.env.GENESIS_USERDATA) { try { for (const f of fs.readdirSync(os.tmpdir())) { const p = path.join(os.tmpdir(), f); if (f.startsWith('holocene-check-') && Date.now() - fs.statSync(p).mtimeMs > 3600e3) fs.rmSync(p, { recursive: true, force: true }); } } catch (e) {} }      // (and those of earlier checks, an hour on)
app.setPath('userData', process.env.GENESIS_USERDATA || (SMOKE ? fs.mkdtempSync(path.join(os.tmpdir(), 'holocene-check-')) : path.join(app.getPath('appData'), 'GENESIS')));

protocol.registerSchemesAsPrivileged([{ scheme: 'genesis', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
// this is a game: take the fast GPU and do not let the system throttle it
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// ---- updates ----
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const updater = new Updater({
  // (the self-check shows the app's own files unless it is drilling an update; a checkout has no list and so no updates)
  bundle: SMOKE && !DRILL ? null : readJson(process.env.GENESIS_CONTENT || path.join(__dirname, 'content.json')),
  roots: { app: DIST, data: DATA }, dir: path.join(app.getPath('userData'), 'updates'),
  feed: process.env.GENESIS_UPDATE_FEED || (PKG.holocene && PKG.holocene.feed) || '', manifestName: process.env.GENESIS_UPDATE_MANIFEST || 'manifest.json',
  shellApi: (PKG.holocene && PKG.holocene.shellApi) | 0, fetch: (url, init) => net.fetch(url, init), log: (m) => console.log('[update] ' + m),
});
const GUARD_MS = +(process.env.GENESIS_UPDATE_GUARD || 150) * 1000, CHECK_EVERY = 20 * 60e3;
let mainWin = null, guard = null, lastCheck = 0, pageUp = false;
const reload = () => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.session.clearCache().catch(() => {}).then(() => { if (!mainWin.isDestroyed()) mainWin.webContents.reloadIgnoringCache(); }); };
// An update just put to use is on trial until the game says it is up: if it does not, in time, the update is undone.
function armGuard() {
  clearTimeout(guard); if (!updater.pending) return;
  guard = setTimeout(() => { if (updater.pending && updater.rollback('the game did not come up in ' + GUARD_MS / 1000 + ' s')) reload(); }, GUARD_MS);
}
function check(force) { if (updater.phase === 'off') return Promise.resolve(updater.snapshot()); if (!force && Date.now() - lastCheck < 10 * 60e3) return Promise.resolve(updater.snapshot()); lastCheck = Date.now(); return updater.check(); }
// "About Holocene" names the game in use (which updates move on) and, beside it, the app that carries it
let aboutFor = '';
function about() { const cur = updater.current(); const v = cur ? cur.version : app.getVersion(); if (v === aboutFor) return; aboutFor = v; try { app.setAboutPanelOptions({ applicationName: NAME, applicationVersion: v, version: 'app ' + app.getVersion(), copyright: PKG.author ? String(PKG.author.name || PKG.author) : '' }); } catch (e) {} }
updater.on((s) => { about(); if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('update:state', s); });

function fileFor(key) {
  const inData = key.startsWith('data/');
  const base = inData ? DATA : DIST;
  const file = path.normalize(path.join(base, inData ? key.slice(5) : key));
  return file.startsWith(base + path.sep) ? file : null;
}
function serve(req) {
  let key; try { key = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, ''); } catch (e) { return new Response('bad request', { status: 400 }); }
  if (key === '') key = 'local.html';
  const over = updater.resolve(key);            // undefined: no update in use
  if (over === null) return new Response('not found', { status: 404 });
  const file = over !== undefined ? over : fileFor(key);
  if (!file) return new Response('forbidden', { status: 403 });
  return net.fetch(pathToFileURL(file).toString());
}

// --smoke: boot, wait for the world, models and art, optionally run a scene script and save a picture of the window,
// print one line of JSON and exit (0 = everything loaded). Used by the build to prove the packaged app starts.
// With GENESIS_SMOKE_UPDATE=1 it then takes whatever update the feed offers - check, fetch, put to use, come up again
// on the new files - and reports that too ("update": { result: "updated" | "app-required" | ... }).
function smoke(win) {
  const t0 = Date.now(); const errors = []; const limit = +(process.env.GENESIS_SMOKE_TIMEOUT || 120) * 1000;
  const say = (o) => console.log('GENESIS-SMOKE ' + JSON.stringify(o));
  win.webContents.on('console-message', (...a) => { const d = a[0] && a[0].message !== undefined ? a[0] : { level: a[1], message: a[2] }; if (d.level === 'error' || d.level === 3) errors.push(String(d.message).slice(0, 300)); });
  win.webContents.on('render-process-gone', (e, d) => { say({ ok: false, gone: d.reason }); app.exit(1); });
  const probe = `(() => { const c = document.querySelector('canvas'); let gpu = ''; try { const gl = c.getContext('webgl2'); const x = gl.getExtension('WEBGL_debug_renderer_info'); gpu = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) {}
    let samplers = 0, glMax = 0; try { const gl = window.__G.renderer.getContext(); glMax = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS); for (const p of window.__G.renderer.info.programs) { const n = gl.getProgramParameter(p.program, gl.ACTIVE_UNIFORMS); let k = 0; for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p.program, i); if (u && (u.type === gl.SAMPLER_2D || u.type === gl.SAMPLER_CUBE || u.type === 0x8DC1 || u.type === 0x8B5F || u.type === 0x8B62 || u.type === 0x8DC4)) k += u.size; } if (k > samplers) samplers = k; } } catch (e) {}
    return { samplers, glMax, sim: !!(window.__G && __G.sim), models: window.MODELS && MODELS.ready ? Object.keys(MODELS.defs).length : 0, tex: !!(window.TEX && TEX.manifest), buildings: window.__G && __G.world ? __G.world.buildingCount : 0, modelStats: window.MODELS ? MODELS.stats : null, version: window.GENESIS_VERSION ? GENESIS_VERSION.version + ' ' + GENESIS_VERSION.commit : '', gpu, w: innerWidth, h: innerHeight, dpr: devicePixelRatio }; })()`;
  const run = (js) => win.webContents.executeJavaScript(js);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // the world, the models and the art are in: the probe, or null when the time is up
  const loaded = async (until) => { for (;;) { let info = null; try { info = await run(probe); } catch (e) {} if (info && info.sim && info.models > 0 && info.tex) return info; if (Date.now() > until) return null; await sleep(1000); } };
  const finish = async (ok, info) => {
    let fps = 0;
    try { fps = await run(`new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t > 3000) res(Math.round(n / 3)); else requestAnimationFrame(f); }; requestAnimationFrame(f); })`); } catch (e) {}
    try { if (process.env.GENESIS_SMOKE_SHOT) { const img = await win.webContents.capturePage(); fs.writeFileSync(process.env.GENESIS_SMOKE_SHOT, img.toPNG()); } } catch (e) { errors.push('capture: ' + e.message); }
    try { info = Object.assign(info || {}, await run(probe)); } catch (e) {}
    if (errors.some((e) => /shader error|not compiled|INVALID_OPERATION/i.test(e))) ok = false;      // a shader the GPU refused is a failed launch, whatever else loaded
    say(Object.assign({ ok, seconds: Math.round((Date.now() - t0) / 1000), fps }, info, { errors: errors.slice(0, 6) }));
    app.exit(ok ? 0 : 1);
  };
  // The update drill. What happened is reported as update.result: "updated" (fetched, put to use, came up on the new
  // files and was kept), "undone" (it did not come up, and the game went back to what worked), "current" (already on
  // the newest), "app-required" (the feed asks for a newer app). GENESIS_SMOKE_EXPECT names the one that counts as passing.
  const drill = async (info) => {
    const expect = process.env.GENESIS_SMOKE_EXPECT || 'updated'; const from = info.version;
    const done = (result, more, inf) => finish(result === expect, Object.assign(inf || info, { update: Object.assign({ result, expect, from }, more) }));
    let s = await updater.check(); const cur0 = updater.snapshot().current;
    if (s.phase === 'app-required') return done('app-required', { to: s.latest.version + ' ' + s.latest.commit });
    if (s.phase === 'idle' && !s.checkError) return done(cur0.source === 'update' && info.version === cur0.version + ' ' + cur0.commit ? 'current' : 'nothing offered', { running: info.version, source: cur0.source });
    if (s.phase !== 'available' && s.phase !== 'ready') return done(s.phase, { error: s.error || s.checkError });
    const files = s.latest.files, bytes = s.latest.bytes, to = s.latest.version + ' ' + s.latest.commit; const t1 = Date.now();
    if (s.phase === 'available') s = await updater.start();
    if (s.phase !== 'ready') return done('not fetched', { to, error: s.error });
    const fetched = Math.round((Date.now() - t1) / 100) / 10;
    let again = new Promise((r) => win.webContents.once('did-finish-load', r));
    if (!updater.apply()) return done('not applied', { to });
    armGuard(); reload(); await again;
    // it comes up on the new files and is kept - or the guard undoes it and the page comes up again on the old ones
    let now = null; const until = Date.now() + limit + GUARD_MS;
    for (;;) {
      now = await loaded(Date.now() + 3000); const snap = updater.snapshot();
      if (now && !updater.pending && now.version === snap.current.version + ' ' + snap.current.commit) break;
      if (Date.now() > until) break;
    }
    const snap = updater.snapshot(); const running = now ? now.version : '';
    const result = running === to && snap.current.source === 'update' && !updater.pending ? 'updated' : snap.notice === 'undone' && running && running !== to ? 'undone' : 'did not come up';
    return done(result, { to, files, bytes, fetched, running, notice: snap.notice }, now || info);
  };
  win.webContents.once('did-finish-load', async () => {
    await sleep(1500); const info = await loaded(t0 + limit); if (!info) { let last = null; try { last = await run(probe); } catch (e) {} return finish(false, last); }
    if (DRILL) return drill(info);
    const file = process.env.GENESIS_SMOKE_SCRIPT;
    if (file) { try { await run(fs.readFileSync(file, 'utf8')); } catch (e) { errors.push('scene: ' + e.message); } await sleep(+(process.env.GENESIS_SMOKE_SETTLE || 20) * 1000); }
    finish(true, info);
  });
  setTimeout(() => { say({ ok: false, reason: 'the page never finished loading', errors: errors.slice(0, 6) }); app.exit(1); }, (DRILL ? 3 : 1) * limit + 90000);
}

function createWindow() {
  // (the self-check may ask for a window larger than the build machine's screen, so its pictures are a proper size)
  const size = SMOKE && /^\d+x\d+$/.test(process.env.GENESIS_SMOKE_SIZE || '') ? process.env.GENESIS_SMOKE_SIZE.split('x').map(Number) : [1680, 1050];
  const win = new BrowserWindow({
    width: size[0], height: size[1], minWidth: 1024, minHeight: 640, backgroundColor: '#05070b', title: NAME, show: false, enableLargerThanScreen: SMOKE,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') },
  });
  mainWin = win;
  if (SMOKE) win.setContentSize(size[0], size[1]);      // (the constructor clamps to the screen; this does not)
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('genesis://app/')) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });      // the window only ever shows the game
  // an update on trial that brings the page down is undone at once, not after the wait
  win.webContents.on('render-process-gone', () => { if (!SMOKE && updater.pending && updater.rollback('the page went down')) setTimeout(reload, 300); });
  win.on('focus', () => { if (!SMOKE && pageUp) check(false).catch(() => {}); });      // (coming back to the game after a while: look again)
  win.on('closed', () => { if (mainWin === win) mainWin = null; });
  if (SMOKE) smoke(win);
  win.loadURL('genesis://app/local.html' + (process.env.GENESIS_QUERY ? '?' + process.env.GENESIS_QUERY : ''));
  armGuard();
  return win;
}

// ---- what the page may ask (preload.js); only the game's own page is listened to ----
const fromGame = (e) => { try { return !!e.senderFrame && e.senderFrame.url.startsWith('genesis://app/'); } catch (x) { return false; } };
const handle = (channel, fn) => ipcMain.handle(channel, (e, ...a) => (fromGame(e) ? fn(e, ...a) : null));
const hear = (channel, fn) => ipcMain.on(channel, (e, ...a) => { if (fromGame(e)) fn(e, ...a); });
handle('desktop:info', () => ({ name: NAME, app: app.getVersion(), shellApi: (PKG.holocene && PKG.holocene.shellApi) | 0, packaged: app.isPackaged, platform: process.platform, updates: updater.phase !== 'off', smoke: SMOKE }));
hear('desktop:ready', () => { clearTimeout(guard); updater.confirm(); pageUp = true; if (!SMOKE) setTimeout(() => check(true).catch(() => {}), 2500); });
hear('desktop:quit', () => app.quit());
handle('update:state', () => updater.snapshot());
handle('update:check', () => check(true));
handle('update:start', () => updater.start());
hear('update:cancel', () => updater.cancel());
handle('update:apply', () => { if (!updater.apply()) return false; armGuard(); setTimeout(reload, 60); return true; });      // (the answer reaches the page before it goes)
handle('update:app', async () => { const file = await updater.getApp(app.getPath('downloads')); if (file) shell.openPath(file); return file; });
hear('update:app-cancel', () => updater.cancelApp());
handle('update:app-show', () => { const f = updater.snapshot().app.file; if (f && fs.existsSync(f)) { shell.showItemInFolder(f); return true; } return false; });
hear('update:ack', () => updater.ackNotice());

if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();      // two copies would fight over one store of updates
else {
  app.on('second-instance', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });
  app.whenReady().then(() => {
    try { updater.init(); } catch (e) { console.log('[update] could not start: ' + e.message); updater.phase = 'off'; updater.active = null; }
    protocol.handle('genesis', serve); about();
    const isMac = process.platform === 'darwin';
    const checkItem = { label: 'Check for Updates…', enabled: updater.phase !== 'off', click: () => { if (mainWin) mainWin.webContents.send('update:open'); check(true).catch(() => {}); } };
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(isMac ? [{ label: NAME, submenu: [{ role: 'about' }, checkItem, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
      { label: 'Game', submenu: [{ role: 'togglefullscreen' }, { role: 'reload', label: 'Restart' }, { type: 'separator' }, { role: 'toggleDevTools' }, ...(isMac ? [] : [checkItem, { type: 'separator' }, { role: 'quit' }])] },
      { role: 'windowMenu' },
    ]));
    // (a game just put to use at this start is never read from anything Chromium kept of the one before)
    if (updater.pending) session.defaultSession.clearCache().catch(() => {}).then(createWindow); else createWindow();
    if (!SMOKE) setInterval(() => check(true).catch(() => {}), CHECK_EVERY);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
}
