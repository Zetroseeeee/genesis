// GENESIS desktop shell: one window, the game served from disk over a private scheme (so fetch, textures and saves
// behave exactly as they do on the web). World data and models live beside the app, not inside its archive.
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DATA = app.isPackaged ? path.join(process.resourcesPath, 'data') : path.join(ROOT, 'data');

protocol.registerSchemesAsPrivileged([{ scheme: 'genesis', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
// this is a game: take the fast GPU and do not let the system throttle it
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

function fileFor(urlPath) {
  let p = decodeURIComponent(urlPath); if (p === '/' || p === '') p = '/local.html';
  const inData = p.startsWith('/data/');
  const base = inData ? DATA : DIST;
  const file = path.normalize(path.join(base, inData ? p.slice(6) : p.slice(1)));
  return file.startsWith(base) ? file : null;
}

// --smoke: boot, wait for the world, models and art, optionally run a scene script and save a picture of the window,
// print one line of JSON and exit (0 = everything loaded). Used by the build to prove the packaged app starts.
const SMOKE = process.argv.includes('--smoke') || process.env.GENESIS_SMOKE === '1';
function smoke(win) {
  const t0 = Date.now(); const errors = []; const limit = +(process.env.GENESIS_SMOKE_TIMEOUT || 120) * 1000;
  win.webContents.on('console-message', (...a) => { const d = a[0] && a[0].message !== undefined ? a[0] : { level: a[1], message: a[2] }; if (d.level === 'error' || d.level === 3) errors.push(String(d.message).slice(0, 300)); });
  win.webContents.on('render-process-gone', (e, d) => { console.log('GENESIS-SMOKE ' + JSON.stringify({ ok: false, gone: d.reason })); app.exit(1); });
  const probe = `(() => { const c = document.querySelector('canvas'); let gpu = ''; try { const gl = c.getContext('webgl2'); const x = gl.getExtension('WEBGL_debug_renderer_info'); gpu = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) {}
    return { sim: !!(window.__G && __G.sim), models: window.MODELS && MODELS.ready ? Object.keys(MODELS.defs).length : 0, tex: !!(window.TEX && TEX.manifest), buildings: window.__G && __G.world ? __G.world.buildingCount : 0, modelStats: window.MODELS ? MODELS.stats : null, gpu, w: innerWidth, h: innerHeight, dpr: devicePixelRatio }; })()`;
  const finish = async (ok, info) => {
    let fps = 0;
    try { fps = await win.webContents.executeJavaScript(`new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t > 3000) res(Math.round(n / 3)); else requestAnimationFrame(f); }; requestAnimationFrame(f); })`); } catch (e) {}
    try { if (process.env.GENESIS_SMOKE_SHOT) { const img = await win.webContents.capturePage(); fs.writeFileSync(process.env.GENESIS_SMOKE_SHOT, img.toPNG()); } } catch (e) { errors.push('capture: ' + e.message); }
    try { info = Object.assign(info || {}, await win.webContents.executeJavaScript(probe)); } catch (e) {}
    console.log('GENESIS-SMOKE ' + JSON.stringify(Object.assign({ ok, seconds: Math.round((Date.now() - t0) / 1000), fps }, info, { errors: errors.slice(0, 6) })));
    app.exit(ok ? 0 : 1);
  };
  let staged = false;
  const tick = async () => {
    let info = null; try { info = await win.webContents.executeJavaScript(probe); } catch (e) {}
    const loaded = info && info.sim && info.models > 0 && info.tex;
    if (loaded && !staged) {
      staged = true;
      const file = process.env.GENESIS_SMOKE_SCRIPT;
      if (file) { try { await win.webContents.executeJavaScript(fs.readFileSync(file, 'utf8')); } catch (e) { errors.push('scene: ' + e.message); } setTimeout(() => finish(true, info), +(process.env.GENESIS_SMOKE_SETTLE || 20) * 1000); return; }
      return finish(true, info);
    }
    if (Date.now() - t0 > limit) return finish(false, info);
    setTimeout(tick, 1000);
  };
  win.webContents.once('did-finish-load', () => setTimeout(tick, 1500));
  setTimeout(() => { console.log('GENESIS-SMOKE ' + JSON.stringify({ ok: false, reason: 'the page never finished loading', errors: errors.slice(0, 6) })); app.exit(1); }, limit + 90000);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1680, height: 1050, minWidth: 1024, minHeight: 640, backgroundColor: '#05070b', title: 'GENESIS', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  if (SMOKE) smoke(win);
  win.loadURL('genesis://app/local.html' + (process.env.GENESIS_QUERY ? '?' + process.env.GENESIS_QUERY : ''));
  return win;
}

app.whenReady().then(() => {
  protocol.handle('genesis', (req) => {
    const file = fileFor(new URL(req.url).pathname);
    if (!file) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'Game', submenu: [{ role: 'togglefullscreen' }, { role: 'reload', label: 'Restart' }, { type: 'separator' }, { role: 'toggleDevTools' }, ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }])] },
    { role: 'windowMenu' },
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
