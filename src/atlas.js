// The atlas of history (atlas.js; window.ATLAS): the world through the ages, frame by frame (replay.js; sim.replay) - who held the
// land at every date the world has kept, played as a film or looked at date by date. The realms in their colours with their borders,
// the names of the greatest across their lands, your own realm ringed in gold and your capital marked, the year and its age, the
// world's firsts and your story's turns as they come, how many realms there were and which held most. Space plays and stops, the
// arrows go a frame at a time, Home and End to the first and the last; the bar below is the ages, each as wide as the next.
window.ATLAS = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const AGES = ['Stone Age', 'Bronze Age', 'Iron Age', 'Classical Age', 'Middle Ages', 'Renaissance', 'Industrial Age', 'Modern Age', 'Information Age', 'Space Age'];
  const METAL = ['#b08a5c', '#c58a4a', '#8f9aa6', '#d8b45c', '#c9a14f', '#cfa65a', '#b87a4b', '#b89b5e', '#9fc4d8', '#a8d6e8'];      // (each age's metal: index.html, body[data-age])
  // the map: the grid's places one degree each (replay.js), shown from 80 N to 58 S (nobody holds the ice of the south), drawn on a
  // grid twice as fine (each place split in four by its neighbours, Scale2x: the stairs of a border become slopes)
  const LAT0 = 80, LAT1 = -58, GW = 720, ICE = [176, 190, 202];      // (the ice: Greenland's, and the great sheets of the first millennia)
  const SPEEDS = [1, 2, 4], FPS = 4;      // (frames a second at the first speed: a whole history in a minute)
  let ctx = null, R = null, RP = null, k = 0, t = 0, playing = false, speed = 0, raf = 0, last = 0;
  let base = null, events = [], shown = [];

  function init(c) {
    ctx = c;
    const d = $('atlas');
    d.addEventListener('click', (e) => { const b = e.target.closest('[data-at]'); if (!b) return; const a = b.dataset.at;
      if (a === 'close') close(); else if (a === 'play') toggle(); else if (a === 'speed') { speed = (speed + 1) % SPEEDS.length; ui(); } });
    d.addEventListener('close', () => { playing = false; cancelAnimationFrame(raf); raf = 0; if (ctx.onClose) ctx.onClose(); });
    d.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('button') && (e.code === 'Space' || e.key === 'Enter')) return;      // (a button's own)
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(Math.floor(k + t) + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(Math.ceil(k + t) - 1); }
      else if (e.key === 'Home') { e.preventDefault(); seek(0); }
      else if (e.key === 'End') { e.preventDefault(); seek(RP.frames.length - 1); }
    });
    const bar = $('at-bar'); let drag = false;
    const toBar = (e) => { const r = bar.getBoundingClientRect(); seekPos(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); };
    bar.addEventListener('pointerdown', (e) => { drag = true; bar.setPointerCapture(e.pointerId); playing = false; toBar(e); ui(); });
    bar.addEventListener('pointermove', (e) => { if (drag) toBar(e); });
    bar.addEventListener('pointerup', () => { drag = false; });
    const map = $('at-map');
    map.addEventListener('pointermove', (e) => hover(e)); map.addEventListener('pointerleave', () => { $('at-tip').hidden = true; });
    let rt = 0; window.addEventListener('resize', () => { if (!isOpen()) return; clearTimeout(rt); rt = setTimeout(() => { size(); draw(); }, 120); });
  }
  const isOpen = () => !!$('atlas') && $('atlas').open;
  function close() { const d = $('atlas'); if (d && d.open) d.close(); }
  // opens at the first frame and plays (o.at: 'end' opens at the last, a number at that frame, still)
  function open(o) {
    const s = ctx && ctx.sim(); RP = s && s.replay; R = window.REPLAY;
    if (!RP || !R || RP.frames.length < 2) return false;
    $('atlas').showModal(); size(); baseMap(); FA = FB = null; walk.n = -1; statsN = -1; newsKey = null; iceYear = null; iceFor = NaN; collect();
    const end = RP.frames.length - 1; k = o && o.at === 'end' ? end : o && typeof o.at === 'number' ? Math.max(0, Math.min(end, o.at)) : 0; t = 0; shown = []; playing = !(o && o.at !== undefined);
    $('at-sub').textContent = `${s.fmtYear(RP.frames[0].y)} to ${s.fmtYear(RP.frames[RP.frames.length - 1].y)} · ${RP.frames.length} maps`;
    ui(); draw(); last = performance.now(); loop(); $('atlas').querySelector('.modal').focus({ preventScroll: true });
    return true;
  }
  function toggle() { if (!RP) return; if (!playing && k >= RP.frames.length - 1) { k = 0; t = 0; shown = []; } playing = !playing; last = performance.now(); ui(); }
  function seek(n) { if (!RP) return; k = Math.max(0, Math.min(RP.frames.length - 1, n)); t = 0; playing = false; shown = []; ui(); draw(); }
  // a place on the bar: the ages are each as wide as the next (as the frames are as many in each)
  function posOf(y) { const A = R.AGE_AT, a = R.ageOf(y); return Math.max(0, Math.min(1, (a + Math.max(0, Math.min(1, (y - A[a]) / (A[a + 1] - A[a])))) / (A.length - 1))); }
  function seekPos(p) { const F = RP.frames; let best = 0, bd = 9; for (let j = 0; j < F.length; j++) { const d = Math.abs(posOf(F[j].y) - p); if (d < bd) { bd = d; best = j; } } k = best; t = 0; shown = []; ui(); draw(); }
  function loop() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function f(now) {
      if (!isOpen()) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (playing) { t += dt * FPS * SPEEDS[speed]; while (t >= 1) { t -= 1; k++; if (k >= RP.frames.length - 1) { k = RP.frames.length - 1; t = 0; playing = false; ui(); break; } } draw(); }
      raf = requestAnimationFrame(f);
    });
  }

  // ----- the map -----
  function size() {
    const c = $('at-map'), r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(320, Math.round(r.width * dpr)); c.height = Math.max(120, Math.round(r.height * dpr));
  }
  const rows = () => [Math.round((90 - LAT0) * 2), Math.round((90 - LAT1) * 2)];      // (rows of the twice-as-fine grid shown)
  // the land and the sea, once: the land by how green it is, a faint line along every coast
  function baseMap() {
    const wd = ctx.world && ctx.world(); const [r0, r1] = rows(), H = r1 - r0;
    base = document.createElement('canvas'); base.width = GW; base.height = H; const g = base.getContext('2d'), img = g.createImageData(GW, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < GW; x++) {
      const i = (y + r0) * 720 + x, o = (y * GW + x) * 4, land = wd ? wd.land[i] : 0;
      if (!land) { const f = y / H; d[o] = 12 + 4 * f; d[o + 1] = 22 + 3 * f; d[o + 2] = 31 + 2 * f; d[o + 3] = 255; continue; }
      const fe = wd.fert ? wd.fert[i] : 0.5, el = wd.elev ? wd.elev[i] / 255 : 0;
      const coast = (wd.land[i + 1] === 0 || wd.land[i - 1] === 0 || wd.land[i + 720] === 0 || wd.land[i - 720] === 0) ? 1 : 0;
      const ice = wd.flags && (wd.flags[i] & 8) ? 1 : 0;
      let r = 50 - 10 * fe + 40 * el, gg = 48 + 6 * fe + 34 * el, b = 38 - 2 * fe + 30 * el;
      if (ice) { r = ICE[0]; gg = ICE[1]; b = ICE[2]; }
      if (coast) { r += 26; gg += 24; b += 20; }
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  // the ice sheets of the first millennia (climate.js: the domes that withdraw from Canada and Scandinavia): the year the ice left each
  // place of a grid of degrees, worked out once; a frame's ice is where its year is before that (none in a world saved before the ice)
  let iceYear = null, iceCv = null, iceFor = NaN, iceAny = false;
  function iceYears() {
    if (iceYear !== null) return iceYear; iceYear = false;
    const C = window.CLIMATE, s = ctx.sim(); if (!C || !C.iceLeftAt || !s.climate || s.climate.bare || RP.frames[0].y > -4500) return iceYear;      // (the last of the great sheets was gone by 5000 BC)
    const H2 = (LAT0 - LAT1) | 0, a = new Float32Array(360 * H2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < 360; x++) a[y * 360 + x] = C.iceLeftAt(-180 + x + 0.5, LAT0 - y - 0.5)[0];
    iceYear = a; return a;
  }
  function iceLayer(yr) {
    const a = iceYears(); if (!a) return null;
    if (iceFor !== yr) {
      iceFor = yr; iceAny = false; const H2 = (LAT0 - LAT1) | 0, m = new Int16Array(360 * H2);
      for (let i = 0; i < a.length; i++) if (yr < a[i]) { m[i] = 1; iceAny = true; }
      if (iceAny) {
        const big = scale2x(m, 360, H2);      // (its edge in slopes, as the realms' are)
        if (!iceCv) { iceCv = document.createElement('canvas'); iceCv.width = 720; iceCv.height = H2 * 2; }
        const g = iceCv.getContext('2d'), img = g.createImageData(720, H2 * 2), d = img.data;
        for (let i = 0; i < big.length; i++) if (big[i]) { const p = i * 4; d[p] = ICE[0]; d[p + 1] = ICE[1]; d[p + 2] = ICE[2]; d[p + 3] = 235; }
        g.putImageData(img, 0, 0);
      }
    }
    return iceAny ? iceCv : null;
  }
  // the map of frame n: stepped on from the frame before where it can be (a frame is what changed since the one before it)
  const walk = { n: -1, g: null };
  function gridOf(n) {
    if (!walk.g) walk.g = new Int16Array(R.RN);
    if (walk.n === n) return walk.g;
    if (walk.n >= 0 && n > walk.n) { for (let j = walk.n + 1; j <= n; j++) R.apply(walk.g, RP.frames[j].d); } else RP.at(n, walk.g);
    walk.n = n; return walk.g;
  }
  // the realms of frame n, their names from the lives (an id is given again: the life that began last before the frame's year)
  function realmsAt(n) {
    const yr = RP.frames[n].y, by = new Map();
    for (const L of RP.lives) if (L[1] <= yr && (L[2] === null || L[2] >= yr)) { const b = by.get(L[0]); if (!b || L[1] >= b[1]) by.set(L[0], L); }
    return by;
  }
  // a frame made ready to draw (into the buffers of an old one): its layer - the realms in their colours with a little of the land's,
  // their borders darker, yours gold - its grid, and what each realm holds and where the middle of it lies (for its name)
  function frame(n, old) {
    const g0 = gridOf(n), RW = R.RW; const [r0, r1] = rows(), H = r1 - r0;
    const grid = old ? old.grid : new Int16Array(R.RN); grid.set(g0);
    const big = scale2x(g0, RW, R.RH);
    const lives = realmsAt(n), col = new Map(), mine = new Set();
    // (a realm's colour as an atlas inks it: a quarter of its brightness's grey in it, a little darker)
    for (const [id, L] of lives) { const c = L[4], r = (c >> 16) & 255, gg = (c >> 8) & 255, b = c & 255, l = 0.3 * r + 0.55 * gg + 0.15 * b; col.set(id, [0.92 * (r + (l - r) * 0.25), 0.92 * (gg + (l - gg) * 0.25), 0.92 * (b + (l - b) * 0.25)]); if (L[5] & 1) mine.add(id); }
    const cv = old ? old.cv : document.createElement('canvas'); if (cv.width !== GW || cv.height !== H) { cv.width = GW; cv.height = H; }
    const g = cv.getContext('2d'), img = g.createImageData(GW, H), d = img.data;
    for (let y = 0; y < H; y++) {
      const yy = y + r0, row = yy * GW;
      for (let x = 0; x < GW; x++) {
        const o = big[row + x]; if (o < 0) continue; const c = col.get(o); if (!c) continue;
        const right = big[row + (x + 1) % GW], down = yy + 1 < R.RH * 2 ? big[row + GW + x] : o, up = yy > 0 ? big[row - GW + x] : o, left = big[row + (x + GW - 1) % GW];
        const edge = right !== o || down !== o || up !== o || left !== o, p = (y * GW + x) * 4;
        if (mine.has(o) && edge) { d[p] = 240; d[p + 1] = 204; d[p + 2] = 110; d[p + 3] = 255; }
        else if (edge) { d[p] = c[0] * 0.45; d[p + 1] = c[1] * 0.45; d[p + 2] = c[2] * 0.45; d[p + 3] = 235; }
        else { d[p] = c[0] * 0.86 + 14; d[p + 1] = c[1] * 0.86 + 14; d[p + 2] = c[2] * 0.86 + 12; d[p + 3] = 200; }
      }
    }
    g.putImageData(img, 0, 0);
    // how many places each holds, and their middle (the longitude as a mean of directions: a realm across the date line)
    const cnt = new Map(), cx = new Map(), sx = new Map(), cy = new Map();
    for (let y = 0; y < R.RH; y++) for (let x = 0; x < RW; x++) {
      const o = g0[y * RW + x]; if (o < 0) continue; const a = (x + 0.5) / RW * Math.PI * 2;
      cnt.set(o, (cnt.get(o) || 0) + 1); cx.set(o, (cx.get(o) || 0) + Math.cos(a)); sx.set(o, (sx.get(o) || 0) + Math.sin(a)); cy.set(o, (cy.get(o) || 0) + y + 0.5);
    }
    const list = []; let held = 0;
    for (const [o, n0] of cnt) { held += n0; const L = lives.get(o); if (!L) continue; let a = Math.atan2(sx.get(o), cx.get(o)); if (a < 0) a += Math.PI * 2; list.push({ id: o, n: n0, x: a / (Math.PI * 2) * RW, y: cy.get(o) / n0, name: L[3], mine: !!(L[5] & 1), from: L[1], to: L[2], c: L[4] }); }
    list.sort((a, b) => b.n - a.n);
    return { n, cv, grid, info: { list, held, realms: list.length } };
  }
  function scale2x(src, w, h) {
    const W2 = w * 2, dst = new Int16Array(W2 * h * 2);
    for (let y = 0; y < h; y++) {
      const yu = y > 0 ? y - 1 : 0, yd = y < h - 1 ? y + 1 : h - 1;
      for (let x = 0; x < w; x++) {
        const xl = x > 0 ? x - 1 : w - 1, xr = x < w - 1 ? x + 1 : 0;
        const P = src[y * w + x], A = src[yu * w + x], B = src[y * w + xr], C = src[y * w + xl], D = src[yd * w + x];
        let e0 = P, e1 = P, e2 = P, e3 = P;
        if (A !== D && C !== B) { if (C === A) e0 = A; if (A === B) e1 = B; if (C === D) e2 = C; if (B === D) e3 = D; }
        const o = y * 2 * W2 + x * 2; dst[o] = e0; dst[o + 1] = e1; dst[o + W2] = e2; dst[o + W2 + 1] = e3;
      }
    }
    return dst;
  }
  // the frames either side of the play head: the film goes from one to the next as a dissolve
  let FA = null, FB = null, mix = null;
  function ready() {
    const end = RP.frames.length - 1, a = Math.min(k, end), b = Math.min(k + 1, end);
    if (!FA || FA.n !== a) { if (FB && FB.n === a) { const tmp = FA; FA = FB; FB = tmp; } else FA = frame(a, FA); }
    if (!FB || FB.n !== b) FB = frame(b, FB && FB !== FA ? FB : null);
  }
  const shownF = () => (t > 0.5 && FB ? FB : FA);      // (whose names and numbers are shown: the nearer frame)
  // where the map lies on the canvas: it fills the width, and what is left above and below is sea
  function place() { const c = $('at-map'), [r0, r1] = rows(), H = r1 - r0, sc = Math.min(c.width / GW, c.height / H); return { c, r0, H, sc, mw: GW * sc, mh: H * sc, ox: (c.width - GW * sc) / 2, oy: (c.height - H * sc) / 2 }; }
  function draw() {
    if (!RP || !isOpen()) return;
    ready();
    const L = place(), c = L.c, g = c.getContext('2d'), w = c.width, h = c.height, sc = L.sc, ox = L.ox, oy = L.oy, mw = L.mw, mh = L.mh, r0 = L.r0;
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = '#0c161f'; g.fillRect(0, 0, w, h);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(base, ox, oy, mw, mh);
    const ice = iceLayer(RP.frames[shownF().n].y); if (ice) g.drawImage(ice, ox, oy, mw, mh);
    // the two frames mixed as light is (the one going as much less as the one coming is more), then laid on the land
    if (!mix) mix = document.createElement('canvas'); if (mix.width !== GW || mix.height !== L.H) { mix.width = GW; mix.height = L.H; }
    const m = mix.getContext('2d'); m.globalCompositeOperation = 'copy'; m.globalAlpha = FB.n !== FA.n ? 1 - t : 1; m.drawImage(FA.cv, 0, 0);
    if (t > 0 && FB.n !== FA.n) { m.globalCompositeOperation = 'lighter'; m.globalAlpha = t; m.drawImage(FB.cv, 0, 0); }
    m.globalCompositeOperation = 'source-over'; m.globalAlpha = 1;
    g.drawImage(mix, ox, oy, mw, mh);
    const F = shownF(), info = F.info;
    // the names of the greatest realms, as large as their lands, none over another; yours in gold
    const placed = [], dpr = w / Math.max(1, c.getBoundingClientRect().width);      // (a place of the grid is two of the layer's: x 2 sc on the canvas)
    const font = (getComputedStyle(document.body).getPropertyValue('--display') || 'serif').trim();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    let shownN = 0;
    for (const r of info.list) {
      if (shownN >= 16 || r.n < 5) break;
      const fs = Math.max(10, Math.min(28, 7 + Math.sqrt(r.n) * 1.15)) * dpr, X = ox + r.x * 2 * sc, Y = oy + (r.y * 2 - r0) * sc;
      g.font = `600 ${fs}px ${font}`; const tw = g.measureText(r.name).width + fs * 0.3, box = [X - tw / 2, Y - fs * 0.6, X + tw / 2, Y + fs * 0.6];
      if (box[0] < ox || box[2] > ox + mw || box[1] < oy || box[3] > oy + mh) continue;
      if (placed.some((p) => !(box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3]))) continue;
      placed.push(box); shownN++;
      g.lineWidth = Math.max(2, fs * 0.22); g.strokeStyle = 'rgba(8,10,14,0.85)'; g.strokeText(r.name, X, Y);
      g.fillStyle = r.mine ? '#F2D27A' : 'rgba(244,236,216,0.94)'; g.fillText(r.name, X, Y);
    }
    // your capital
    const f = RP.frames[F.n]; if (f && f.c >= 0) { const cy0 = Math.floor(f.c / R.RW), cx0 = f.c - cy0 * R.RW, X = ox + (cx0 + 0.5) * 2 * sc, Y = oy + ((cy0 + 0.5) * 2 - r0) * sc, s = 5 * dpr;
      g.fillStyle = '#F2D27A'; g.strokeStyle = 'rgba(8,10,14,0.9)'; g.lineWidth = 1.5 * dpr; g.beginPath(); g.moveTo(X, Y - s); g.lineTo(X + s, Y); g.lineTo(X, Y + s); g.lineTo(X - s, Y); g.closePath(); g.fill(); g.stroke(); }
    readout(F);
  }
  // the year and its age, the bar, what came to pass, the greatest realms
  let statsN = -1, newsKey = null;
  function readout(F) {
    const n = F.n, s = ctx.sim(), f = RP.frames[n], fa = RP.frames[k], fb = RP.frames[Math.min(k + 1, RP.frames.length - 1)], yr = Math.round(fa.y + (fb.y - fa.y) * t), a = R.ageOf(yr);
    $('at-year').textContent = s.fmtYear(yr); const ag = $('at-age'); ag.textContent = AGES[a]; ag.style.color = METAL[a];
    $('at-head').style.left = (posOf(yr) * 100).toFixed(2) + '%';
    const info = F.info;
    if (statsN !== n) { statsN = n;
      const top = info.list.slice(0, 5), me = info.list.findIndex((r) => r.mine);
      $('at-stats').innerHTML = `<span><b>${info.realms}</b> realms</span>` + top.map((r) => `<span class="at-r${r.mine ? ' me' : ''}"><i style="background:#${r.c.toString(16).padStart(6, '0')}"></i>${esc(r.name)} <b>${Math.round(100 * r.n / Math.max(1, info.held))}%</b></span>`).join('')
        + (me >= 5 ? `<span class="at-r me"><i style="background:#${info.list[me].c.toString(16).padStart(6, '0')}"></i>${esc(info.list[me].name)}, ${ordinal(me + 1)} <b>${Math.round(100 * info.list[me].n / Math.max(1, info.held))}%</b></span>` : '');
    }
    // what came to pass since the frame before (while playing, a few at a time, each for some seconds)
    const y0 = n > 0 ? RP.frames[n - 1].y : -Infinity, y1 = f.y;
    for (const e of events) if (e.y > y0 && e.y <= y1 && !shown.some((q) => q.e === e)) shown.push({ e, at: performance.now() });
    const nowT = performance.now(); shown = shown.filter((q) => nowT - q.at < (playing ? 4200 / SPEEDS[speed] + 1200 : 1e9) && q.e.y <= y1).slice(-4);
    const key = shown.map((q) => events.indexOf(q.e)).join(',');
    if (key !== newsKey) { newsKey = key; $('at-news').innerHTML = shown.map((q) => `<div class="at-n${q.e.mine ? ' me' : ''}"><span class="at-ny">${esc(s.fmtYear(q.e.y))}</span>${esc(q.e.text)}</div>`).join(''); }
  }
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  // what is told as the film goes: the world's firsts, and the turns of your own story (its founding, its ages, its golden ages, its fall)
  function collect() {
    const s = ctx.sim(), LG = window.LEGACY; events = [];
    if (s.legacy && LG) s.legacy.save().f.forEach((q, i) => { if (q && LG.FIRSTS[i]) events.push({ y: q[0], text: `${LG.FIRSTS[i].name}: ${q[2]}`, mine: false }); });
    const v = s.epilogue ? s.epilogue() : null;
    if (v) {
      events.push({ y: v.founded, text: `${v.people || v.name} begins`, mine: true });
      for (const m of v.marks || []) if (m[1] === 'era' || (m[1] === 'culture' && /golden/i.test(m[2]))) events.push({ y: m[0], text: m[2], mine: true });
      if (v.fell) events.push({ y: v.fell[0], text: `${v.fell[2]} is no more`, mine: true });
    }
    events.sort((a, b) => a.y - b.y);
    const bar = $('at-ticks'); bar.innerHTML = AGES.map((nm, i) => `<span class="at-age" style="--m:${METAL[i]}" title="${esc(nm)}"></span>`).join('')
      + events.filter((e) => e.mine).map((e) => `<i class="at-tick" style="left:${(posOf(e.y) * 100).toFixed(2)}%" title="${esc(s.fmtYear(e.y) + ': ' + e.text)}"></i>`).join('');
  }
  function ui() {
    const b = document.querySelector('#atlas [data-at="play"]'); if (b) { b.textContent = playing ? 'Pause' : (k >= RP.frames.length - 1 ? 'Again' : 'Play'); b.classList.toggle('primary', !playing); }
    const sp = document.querySelector('#atlas [data-at="speed"]'); if (sp) sp.textContent = SPEEDS[speed] + '×';
  }
  // what is under the pointer: whose land, from when to when, how much of the world
  function hover(e) {
    const tip = $('at-tip'); if (!RP || !FA) { tip.hidden = true; return; }
    const L = place(), r = L.c.getBoundingClientRect(), dpr = L.c.width / Math.max(1, r.width);
    const X = (e.clientX - r.left) * dpr, Y = (e.clientY - r.top) * dpr, gx = Math.floor((X - L.ox) / L.sc / 2), gy = Math.floor(((Y - L.oy) / L.sc + L.r0) / 2);
    if (gx < 0 || gx >= R.RW || gy < 0 || gy >= R.RH) { tip.hidden = true; return; }
    const F = shownF(), o = F.grid[gy * R.RW + gx], q = o >= 0 ? F.info.list.find((x) => x.id === o) : null;
    if (!q) { tip.hidden = true; return; }
    const s = ctx.sim();
    tip.innerHTML = `<b>${esc(q.name)}</b><span>${q.mine ? 'Your people · ' : ''}${esc(s.fmtYear(q.from))} to ${q.to === null ? 'this day' : esc(s.fmtYear(q.to))}</span><span>${Math.round(100 * q.n / Math.max(1, F.info.held))}% of the held land</span>`;
    tip.hidden = false; let x = e.clientX - r.left + 14; const tw = tip.offsetWidth; if (x + tw > r.width - 8) x = e.clientX - r.left - tw - 14;
    tip.style.left = x + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px';
  }
  return { init, open, close, isOpen };
})();
