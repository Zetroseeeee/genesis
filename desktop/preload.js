// What the game's page may ask of the app around it. The page stays sandboxed: it gets these few calls and nothing else.
const { contextBridge, ipcRenderer } = require('electron');
const listen = (channel, fn) => { const h = (e, a) => fn(a); ipcRenderer.on(channel, h); return () => ipcRenderer.removeListener(channel, h); };
// the settings, read once from their file (Settings.json) and kept here; a change goes to the file at once
let kept = null; const prefs = () => kept || (kept = ipcRenderer.sendSync('store:all') || {});
contextBridge.exposeInMainWorld('desktop', {
  info: () => ipcRenderer.invoke('desktop:info'),
  ready: () => ipcRenderer.send('desktop:ready'),       // the game is up (an update just put to use is then kept)
  quit: () => ipcRenderer.send('desktop:quit'),
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    start: () => ipcRenderer.invoke('update:start'),
    cancel: () => ipcRenderer.send('update:cancel'),
    apply: () => ipcRenderer.invoke('update:apply'),      // the page is reloaded on the new files
    getApp: () => ipcRenderer.invoke('update:app'),       // fetch the whole app's disk image and open it
    cancelApp: () => ipcRenderer.send('update:app-cancel'),
    showApp: () => ipcRenderer.invoke('update:app-show'),
    ack: () => ipcRenderer.send('update:ack'),
    on: (fn) => listen('update:state', fn),
    onOpen: (fn) => listen('update:open', fn),            // "Check for Updates..." was chosen in the menu
  },
  // the worlds: files in the game's folder (desktop/saves.js)
  saves: {
    list: () => ipcRenderer.invoke('saves:list'),                     // every world, the one in play first, with its head and picture
    read: (id) => ipcRenderer.invoke('saves:read', id),               // { head, json }
    write: (o) => ipcRenderer.invoke('saves:write', o),               // { auto | name, json | gz, head, pic }
    writeNow: (o) => ipcRenderer.sendSync('saves:write-now', o),      // the window's last moment: the world in play, at once
    retire: (w) => ipcRenderer.invoke('saves:retire', w),             // another world takes the place of the one in play
    relabel: (id, head, pic) => ipcRenderer.invoke('saves:relabel', id, head, pic),
    remove: (id) => ipcRenderer.invoke('saves:remove', id),           // to the Trash
    reveal: (id) => ipcRenderer.invoke('saves:reveal', id),           // in Finder (the folder, or one world)
    picture: (bytes, name) => ipcRenderer.invoke('saves:picture', bytes, name),      // a PNG into Pictures/Holocene: where it went
    where: () => ipcRenderer.invoke('saves:where'),
  },
  store: {
    get: (k) => { const v = prefs()[k]; return v === undefined ? null : v; },
    set: (k, v) => { if (v === null || v === undefined) delete prefs()[k]; else prefs()[k] = v; ipcRenderer.send('store:set', k, v === undefined ? null : v); },
  },
});
