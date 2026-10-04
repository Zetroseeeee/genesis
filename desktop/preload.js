// What the game's page may ask of the app around it. The page stays sandboxed: it gets these few calls and nothing else.
const { contextBridge, ipcRenderer } = require('electron');
const listen = (channel, fn) => { const h = (e, a) => fn(a); ipcRenderer.on(channel, h); return () => ipcRenderer.removeListener(channel, h); };
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
});
