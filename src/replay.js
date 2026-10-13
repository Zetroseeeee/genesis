// The world through the ages (replay.js; window.REPLAY): the map of who held the land, kept as history goes, for the atlas of
// history (atlas.js). Pure data; the simulation steps it once a year (sim.replay).
//
// A frame is the map at a date: a grid of 360 by 180, each place two by two of the simulation's regions (the realm that holds most
// of them; a realm before nobody, so that an island keeps its holder), kept as what changed since the frame before - runs of places
// that came to one holder, each a skip, a length and the holder as numbers of a byte or more (most are under 128) - so that a whole
// history is a few hundred kilobytes. Frames are taken as the ages go, the same number in each (FRAMES, as the epilogue's chart
// gives each age the same width: the Stone Age's 6,700 years and the Information Age's 60 are alike in how much happens in them),
// every 280 years at first and every two and a half at the last; with each, where the player's capital stood.
// A realm's life is kept beside them (its id, the year it rose and the year it was gone, its name as it was last seen, its colour,
// whether it was the player's): an id is given again once its realm is gone, and a frame's year says whose it was (the life of that
// id that began last before it). Lives are begun and ended at the frames, so a realm that rose and fell between two is not kept.
window.REPLAY = (function () {
  'use strict';
  const AGE_AT = [-10000, -3300, -1200, -500, 500, 1400, 1760, 1900, 1970, 2030, 2150];      // (sim.js's HIST: the world's dates of the ages)
  const FRAMES = 24, RW = 360, RH = 180, RN = RW * RH;
  const ageOf = (y) => { let a = 0; while (a < AGE_AT.length - 2 && y >= AGE_AT[a + 1]) a++; return a; };
  const stepAt = (y) => { if (y >= AGE_AT[AGE_AT.length - 1]) return 25; const a = ageOf(y); return Math.max(1, (AGE_AT[a + 1] - AGE_AT[a]) / FRAMES); };      // (a world played on past the end of the Holocene: one in 25 years)
  // numbers of a byte or more: seven bits a byte, the high bit saying another follows
  function put(out, v) { while (v >= 128) { out.push((v & 127) | 128); v >>>= 7; } out.push(v); }
  // a frame's runs laid over a grid
  function apply(grid, bytes) {
    let p = 0, i = 0; const n = bytes.length;
    const get = () => { let v = 0, s = 0, b; do { b = bytes[p++]; v |= (b & 127) << s; s += 7; } while (b & 128); return v; };
    while (p < n) { i += get(); const len = get(), o = get() - 1; grid.fill(o, i, i + len); i += len; }
    return grid;
  }
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = (str) => { const bin = atob(str); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };

  // h = { W, H, owner, civs, MAXC, year: () => year, name: (cv) => its name }
  function create(h) {
    const W = h.W, owner = h.owner, civs = h.civs, MAXC = h.MAXC;
    const grid = new Int16Array(RN).fill(-1), now = new Int16Array(RN);      // (the map as the last frame left it; this frame's)
    const frames = [];      // { y: year, d: Uint8Array (the runs), c: the player's capital, a place of the grid or -1 }
    const lives = [];       // [id, from, to (null while it lives), name, colour 0xRRGGBB, flags: 1 the player's]
    const cur = new Int32Array(MAXC).fill(-1), obj = new Array(MAXC).fill(null);      // (each id's life now, and the realm it was taken from)
    let next = -Infinity, bytes = 0;
    const colourOf = (cv) => { const r = cv.rgb || [0.5, 0.5, 0.5]; return (Math.round(r[0] * 255) << 16) | (Math.round(r[1] * 255) << 8) | Math.round(r[2] * 255); };
    // the map now, two by two: the holder of most of a block's regions; a holder before nobody
    function sample() {
      for (let y = 0; y < RH; y++) {
        const r0 = y * 2 * W, r1 = r0 + W;
        for (let x = 0; x < RW; x++) {
          const a = owner[r0 + x * 2], b = owner[r0 + x * 2 + 1], c = owner[r1 + x * 2], d = owner[r1 + x * 2 + 1];
          let o = a;
          if (a < 0 || (a !== b && a !== c && a !== d)) { if (b >= 0 && (b === c || b === d)) o = b; else if (c >= 0 && c === d) o = c; else o = a >= 0 ? a : b >= 0 ? b : c >= 0 ? c : d; }
          now[y * RW + x] = o;
        }
      }
    }
    // the lives: those gone since the last frame end now, those that rose begin
    function livesNow(yr) {
      for (let id = 0; id < MAXC; id++) {
        const cv = civs[id];
        if (cur[id] >= 0 && (cv !== obj[id] || !cv || cv.alive === false)) { lives[cur[id]][2] = yr; cur[id] = -1; obj[id] = null; }
        if (cv && cv.alive !== false && cur[id] < 0) { cur[id] = lives.length; obj[id] = cv; lives.push([id, Math.min(yr, cv.founded !== undefined ? cv.founded : yr), null, h.name(cv), colourOf(cv), cv.player ? 1 : 0]); }
        if (cur[id] >= 0) { const L = lives[cur[id]]; L[3] = h.name(cv); if (cv.player) L[5] |= 1; }
      }
    }
    function take(yr) {
      sample(); livesNow(yr);
      const out = []; let last = 0;
      for (let k = 0; k < RN;) {
        if (now[k] === grid[k]) { k++; continue; }
        const o = now[k]; let e = k + 1; while (e < RN && now[e] === o) e++;      // (a run goes on over places already its holder's: no harm, and fewer runs)
        put(out, k - last); put(out, e - k); put(out, o + 1); last = e; k = e;
      }
      grid.set(now);
      let cap = -1; const pl = civs.find((cv) => cv && cv.player && cv.alive !== false);
      if (pl && pl.capital >= 0) { const cy = (pl.capital / W) | 0, cx = pl.capital - cy * W; cap = (cy >> 1) * RW + (cx >> 1); }
      const d = Uint8Array.from(out); frames.push({ y: yr, d, c: cap }); bytes += d.length;
    }
    // a year: a frame when its date comes
    function step() { const yr = h.year(); if (yr < next) return; take(yr); next = yr + stepAt(yr); }
    // the grid of frame k (into a grid of the caller's, or a new one)
    function at(k, into) { const g = into || new Int16Array(RN); g.fill(-1); for (let j = 0; j <= k && j < frames.length; j++) apply(g, frames[j].d); return g; }
    // whose an id was at a year: the life of that id that began last before it
    function lifeOf(id, yr) { let best = null; for (const L of lives) if (L[0] === id && L[1] <= yr && (!best || L[1] >= best[1])) best = L; return best; }
    function save() {
      const all = new Uint8Array(bytes); let p = 0; for (const f of frames) { all.set(f.d, p); p += f.d.length; }
      return { v: 1, y: frames.map((f) => f.y), n: frames.map((f) => f.d.length), c: frames.map((f) => f.c), d: b64(all), l: lives.map((L) => L.slice()), next };
    }
    function load(s) {
      frames.length = 0; lives.length = 0; cur.fill(-1); obj.fill(null); grid.fill(-1); bytes = 0; next = -Infinity;
      if (!s || s.v !== 1) return false;      // (a world saved before the atlas: its history is kept from where it was saved)
      const all = unb64(s.d); let p = 0;
      for (let k = 0; k < s.y.length; k++) { const d = all.slice(p, p + s.n[k]); p += s.n[k]; frames.push({ y: s.y[k], d, c: s.c ? s.c[k] : -1 }); bytes += d.length; apply(grid, d); }
      for (const L of s.l) lives.push(L.slice());
      // the lives still running are the realms of the world as it is: matched by id (a realm saved is the realm loaded)
      lives.forEach((L, k) => { if (L[2] === null && civs[L[0]]) { cur[L[0]] = k; obj[L[0]] = civs[L[0]]; } else if (L[2] === null) L[2] = s.y.length ? s.y[s.y.length - 1] : 0; });
      next = s.next !== undefined && s.next !== null ? s.next : -Infinity;
      return true;
    }
    const stats = () => ({ frames: frames.length, lives: lives.length, bytes });
    return { step, at, lifeOf, save, load, stats, frames, lives, take };
  }
  return { create, apply, AGE_AT, FRAMES, RW, RH, RN, ageOf };
})();
