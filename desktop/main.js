// GENESIS desktop shell: one window, the game served from disk over a private scheme (so fetch, textures and saves
// behave exactly as they do on the web). World data and models live beside the app, not inside its archive.
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1680, height: 1050, minWidth: 1024, minHeight: 640, backgroundColor: '#05070b', title: 'GENESIS', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
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
