// Where the game keeps what it keeps (disk.js; window.DISK): its worlds and its settings.
//
// In the app (window.desktop.saves: desktop/saves.js) every world is a file of its own in the game's folder - Autosave.holocene the world
// in play, every other file a world kept - and the settings are a file beside them (Settings.json): nothing is in the page's storage.
// The first time the app starts with files, the worlds and settings the page's storage kept before (0.54 and earlier) are moved into
// files, one by one, each taken out of the page's storage only once its file is written and read back.
// On the web (the preview) the page's storage is all there is: the world in play in localStorage (packed when it is long), the worlds
// kept in IndexedDB, the settings in localStorage. Both answer the same calls:
//   prime()                       read the world in play before anything asks for it (and, in the app, move the old worlds into files)
//   hasAuto(), autoJson()         whether a world in play is saved, and its save as text (throws when it cannot be read)
//   writeAuto(json, head, pic)    save the world in play (pic: a Blob or a promise of one, or null to keep the picture it had)
//                                 -> Promise<boolean> (on the web true or false at once, unless a long one is packed)
//   writeAutoNow(json, head)      the same at the window's last moment, at once                                       -> boolean
//   list()                        every world kept, and in the app the one in play first:
//                                 [{ id, auto, name, realm, when, age, at, size, pic: Blob | null, broken }]
//   keep(json, head, pic, name)   a copy of the world in play kept beside it                                         -> Promise<id>
//   read(id), remove(id)          a world's save as text; a world deleted (in the app: to the Trash)
//   retire(world)                 another world takes the place of the one in play ({ seed, year }): in the app the one in play is
//                                 kept aside under its own name (its name, or null); on the web it is replaced, as it always was
//   relabelAuto(head)             the world in play's head said again (a world moved from the page's storage has a bare one)
//   reveal(id), picture(blob, name), get(key), set(key, value)
//   files                         true in the app; keepsLeft: true where the world left is kept by itself (no need to ask first)
window.DISK = (function () {
  'use strict';
  const AUTO = 'Autosave';
  const SAVE_KEY = 'genesis-save-v2', PACK_AT = 4.0e6, PACKED = 'gz1:';
  const canPack = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  // the settings as the page's storage kept them (key: [its name there, kept as JSON])
  const OLD = { settings: ['genesis-settings', true], newsSeen: ['holocene-news-seen', false], seq: ['holocene-seq', false] };
  const packText = async (json) => new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const unpackBytes = (b) => new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const rawBytes = (raw) => { const b = new Uint8Array(raw.length - PACKED.length); for (let i = 0; i < b.length; i++) b[i] = raw.charCodeAt(i + PACKED.length); return b; };
  // the worlds the page's storage kept (IndexedDB 'holocene', store 'worlds')
  const OLDDB = (() => {
    let dbp = null;
    const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('holocene', 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('worlds')) r.result.createObjectStore('worlds', { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => { dbp = null; rej(r.error); }; }));
    const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('worlds', mode), q = fn(t.objectStore('worlds')); t.oncomplete = () => res(q ? q.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
    return { list: () => tx('readonly', (st) => st.getAll()), put: (w) => tx('readwrite', (st) => st.put(w)), del: (id) => tx('readwrite', (st) => st.delete(id)), ok: () => typeof indexedDB !== 'undefined', close: () => { if (dbp) dbp.then((d) => d.close()).catch(() => {}); dbp = null; } };
  })();
  const localGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const localDel = (k) => { try { localStorage.removeItem(k); } catch (e) {} };

  // ---------- on the web: the page's storage ----------
  function page() {
    let cache = null, seq = 0;      // ({ raw: the packed save as it is kept, json: what it says }; the saves asked for)
    const session = { resume: 'holocene-resume' };
    return {
      files: false, keepsLeft: false, AUTO: null,
      async prime() { try { const raw = localGet(SAVE_KEY); if (raw && raw.startsWith(PACKED) && canPack) cache = { raw, json: await unpackBytes(rawBytes(raw)) }; } catch (e) { console.warn('the saved world could not be unpacked', e); } },
      hasAuto: () => !!localGet(SAVE_KEY),
      autoJson() { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null; if (!raw.startsWith(PACKED)) return raw; if (cache && cache.raw === raw) return cache.json; throw new Error('a packed save not unpacked'); },
      // (written at once - true or false - unless it is four million characters and more: then it is packed, in the background, and
      // the answer is a promise; a save made while one was packed is the one kept)
      writeAuto(json) {
        const my = ++seq;
        if (!canPack || !(json.length > PACK_AT || window.GENESIS_PACK)) { try { localStorage.setItem(SAVE_KEY, json); return true; } catch (e) { return false; } }
        return packText(json).then((z) => { if (my !== seq) return false; const parts = [PACKED]; for (let i = 0; i < z.length; i += 8192) parts.push(String.fromCharCode.apply(null, z.subarray(i, i + 8192))); const raw = parts.join(''); localStorage.setItem(SAVE_KEY, raw); cache = { raw, json }; return true; }).catch(() => false);
      },
      // (the window's last moment: written as it is if there is room, or the one before stands)
      writeAutoNow(json) { ++seq; try { localStorage.setItem(SAVE_KEY, json); return true; } catch (e) { return false; } },
      async list() { const l = await OLDDB.list(); return l.map((w) => ({ id: w.id, auto: false, name: w.name, realm: w.realm, year: w.year, when: w.when, age: w.age, at: w.at, size: w.size, pic: w.thumb || null })); },
      async keep(json, head, pic, name) {
        const data = canPack ? new Blob([await packText(json)]) : new Blob([json]), id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await OLDDB.put({ id, name: name || head.name, realm: head.realm, year: head.year, when: head.when, age: head.age, at: Date.now(), thumb: pic, data, packed: canPack ? 1 : 0, size: data.size });
        return id;
      },
      async read(id) { const w = (await OLDDB.list()).find((x) => x.id === id); if (!w) throw new Error('no such world'); return w.packed ? unpackBytes(new Uint8Array(await w.data.arrayBuffer())) : w.data.text(); },
      remove: (id) => OLDDB.del(id).then(() => 'deleted'),
      retire: async () => null, relabelAuto: async () => {}, reveal: async () => false,
      // (a picture is given as a download: the browser asks where it goes)
      async picture(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); return null; },
      get(k) { if (session[k]) { try { return sessionStorage.getItem(session[k]); } catch (e) { return null; } } const o = OLD[k]; const raw = localGet(o ? o[0] : 'holocene-' + k); if (raw === null) return null; try { return o && !o[1] ? raw : JSON.parse(raw); } catch (e) { return null; } },
      set(k, v) { try { if (session[k]) { if (v === null || v === undefined) sessionStorage.removeItem(session[k]); else sessionStorage.setItem(session[k], String(v)); return; } const o = OLD[k], key = o ? o[0] : 'holocene-' + k; if (v === null || v === undefined) localStorage.removeItem(key); else localStorage.setItem(key, o && !o[1] ? String(v) : JSON.stringify(v)); } catch (e) {} },
    };
  }

  // ---------- in the app: files ----------
  function files(D) {
    const S = D.saves, st = D.store;
    let auto = null, autoHead = null, chain = Promise.resolve();      // (the world in play's save as text, kept in hand: the newest given or read; its head; the saves on their way, in order)
    const bytesOf = async (blob) => (blob ? new Uint8Array(await blob.arrayBuffer()) : null);
    // the settings the page's storage kept, into the file at once (they are read before anything else)
    try { for (const k of Object.keys(OLD)) { const raw = localGet(OLD[k][0]); if (raw !== null && st.get(k) === null) st.set(k, OLD[k][1] ? JSON.parse(raw) : raw); } } catch (e) { console.warn('the settings could not be moved', e); }
    // the worlds the page's storage kept, into files one by one: each taken out of the page's storage once its file is written and
    // read back (a failure leaves it there, and it is tried again at the next start)
    async function moveOld() {
      let left = 0;
      const raw = localGet(SAVE_KEY);
      if (raw) {
        try {
          const json = raw.startsWith(PACKED) ? await unpackBytes(rawBytes(raw)) : raw, s = JSON.parse(json);
          const r = await S.write({ auto: true, json, head: { year: s.year, seed: s.seed } });
          if (r && !r.stale) localDel(SAVE_KEY); else left++;
        } catch (e) { left++; console.warn('the world in play could not be moved into a file', e); }
      }
      if (OLDDB.ok()) {
        let list = []; try { list = await OLDDB.list(); } catch (e) { list = []; }
        for (const w of list) {
          try {
            const gz = w.packed ? await bytesOf(w.data) : null, json = w.packed ? null : await w.data.text();
            await S.write({ name: w.name, json, gz, head: { name: w.name, realm: w.realm, year: w.year, when: w.when, age: w.age, at: w.at }, pic: await bytesOf(w.thumb) });
            await OLDDB.del(w.id);
          } catch (e) { left++; console.warn('a kept world could not be moved into a file: ' + w.name, e); }
        }
        if (!left) { OLDDB.close(); try { indexedDB.deleteDatabase('holocene'); } catch (e) {} }
      }
      if (!left) { for (const k of Object.keys(OLD)) localDel(OLD[k][0]); st.set('savesMoved', 1); }
    }
    return {
      files: true, keepsLeft: true, AUTO,
      async prime() {
        if (!st.get('savesMoved')) { try { await moveOld(); } catch (e) { console.warn(e); } }
        auto = null; autoHead = null;
        try { const l = await S.list(), a = l.find((w) => w.auto && !w.broken); if (a) { const r = await S.read(AUTO); auto = r.json; autoHead = r.head; } }
        catch (e) { console.warn('the world in play could not be read', e); }
      },
      hasAuto: () => auto !== null,
      autoJson: () => auto,
      autoHead: () => autoHead,
      // (the newest is in hand at once - Continue finds it while it goes to the disk - and the saves go to the disk in the order given,
      // each when its picture is taken: pic may be a promise of one)
      writeAuto(json, head, pic) {
        auto = json; autoHead = head;
        const p = chain.then(async () => S.write({ auto: true, json, head, pic: await bytesOf(await pic) })).then((r) => !!r);
        chain = p.catch(() => {}); return p;
      },
      writeAutoNow(json, head) { auto = json; autoHead = head; let r = null; try { r = S.writeNow({ json, head }); } catch (e) { r = null; } return !!r && !r.error; },
      async list() { return (await S.list()).map((w) => Object.assign({}, w, { pic: w.pic ? new Blob([w.pic], { type: 'image/jpeg' }) : null })); },
      async keep(json, head, pic, name) { const r = await S.write({ name: name || head.name, json, head, pic: await bytesOf(pic) }); return r.id; },
      async read(id) { const r = await S.read(id); if (id === AUTO) { auto = r.json; autoHead = r.head; } return r.json; },
      remove(id) { if (id === AUTO) { auto = null; autoHead = null; } return S.remove(id); },
      // (what is in hand is let go at once: the next save is the new world's)
      retire(world) { auto = null; autoHead = null; const p = chain.then(() => S.retire({ seed: world.seed, year: world.year })); chain = p.catch(() => {}); return p; },
      async relabelAuto(head) { await S.relabel(AUTO, head); autoHead = Object.assign({}, autoHead, head); },
      reveal: (id) => S.reveal(id),
      async picture(blob, name) { return S.picture(await bytesOf(blob), name); },
      get: (k) => st.get(k),
      set: (k, v) => st.set(k, v),
    };
  }

  // the app's files where the app gives them, the page's storage everywhere else
  function open(desktop) { return desktop && desktop.saves && desktop.store ? files(desktop) : page(); }
  return { open, AUTO };
})();
