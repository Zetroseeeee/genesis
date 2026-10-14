// HOLOCENE plots: how a settlement is laid out on the ground and in what order it grows. Pure data (no THREE); classic script;
// exposes window.PLOTS. town.js asks it for the first n plots of a town and builds on them.
//
// A real town is not re-planned as it grows: its first houses stand along the road that brought people there, the next along
// the lanes off it and round the green or the market, and each new street is added at the edge of the last. So a town's plan
// here is fixed by the place (its seed) and its kind (organic, grid, medina, compound, cluster) and never by how big it is: the
// streets are laid out once, the plots along them are taken in one order for ever, and a town of n houses is the first n of
// them. A plot taken stays taken (the house on it may be rebuilt, the plot is not moved), so growth only ever adds.
//
// All in true metres from the middle of the town, x east, z north (the planner's frame); a plot's yaw is the planner's (from
// east toward north) with the house's front (+z) to its street.
(function () {
  'use strict';
  function h(i, k) { let x = (i * 374761393 + k * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const TAU = Math.PI * 2;

  // ---------- an occupancy grid of true metres (what is street, what is taken) ----------
  class Occ {
    // (its cells lie on multiples of their size from the middle of the town, whatever the plan's radius: a larger plan rasters
    // every street and plot of a smaller one exactly as it did, and so accepts the very plots it did. Everything is reckoned from
    // the middle (k0 is the middle's cell), never from the grid's corner, so that not even a rounding differs between two plans)
    constructor(R, cell) { this.c = cell; this.k0 = Math.ceil(R / cell + 2); this.n = this.k0 * 2; this.a = new Uint8Array(this.n * this.n); }
    idx(x, z) { const gx = Math.floor(x / this.c) + this.k0, gz = Math.floor(z / this.c) + this.k0; if (gx < 0 || gz < 0 || gx >= this.n || gz >= this.n) return -1; return gz * this.n + gx; }
    // a rectangle (centre, half sizes along its own axes ux,uz and the perpendicular): test (any cell at or above lvl) or mark;
    // row by row, only the cells whose middles lie inside (where each row crosses the rectangle's edges)
    rect(cx, cz, ux, uz, hw, hd, mark, lvl) {
      const c = this.c, k0 = this.k0, n = this.n, A = this.a; const ex = Math.abs(ux) * hw + Math.abs(uz) * hd, ez = Math.abs(uz) * hw + Math.abs(ux) * hd;
      const z0 = Math.floor((cz - ez) / c), z1 = Math.floor((cz + ez) / c);
      if (!mark && (z0 + k0 < 0 || z1 + k0 >= n || Math.floor((cx - ex) / c) + k0 < 0 || Math.floor((cx + ex) / c) + k0 >= n)) return true;      // (what reaches past the grid is taken)
      const aux = Math.abs(ux) > 1e-9, auz = Math.abs(uz) > 1e-9;
      for (let zr = Math.max(-k0, z0), ze = Math.min(n - 1 - k0, z1); zr <= ze; zr++) {
        const pz = (zr + 0.5) * c - cz; let lo = -1e30, hi = 1e30;
        if (aux) { const a = (-hw - pz * uz) / ux, b = (hw - pz * uz) / ux; if (a < b) { lo = a; hi = b; } else { lo = b; hi = a; } } else if (Math.abs(pz * uz) > hw) continue;
        if (auz) { const a = (pz * ux - hd) / uz, b = (pz * ux + hd) / uz; if (a < b) { if (a > lo) lo = a; if (b < hi) hi = b; } else { if (b > lo) lo = b; if (a < hi) hi = a; } } else if (Math.abs(pz * ux) > hd) continue;
        if (lo > hi) continue;
        let g0 = Math.ceil((lo + cx) / c - 0.5) + k0, g1 = Math.floor((hi + cx) / c - 0.5) + k0; if (g0 < 0) g0 = 0; if (g1 > n - 1) g1 = n - 1;
        const row = (zr + k0) * n;
        if (mark) { for (let gx = g0; gx <= g1; gx++) if (A[row + gx] < mark) A[row + gx] = mark; }
        else { for (let gx = g0; gx <= g1; gx++) if (A[row + gx] >= lvl) return true; }
      }
      return false;
    }
    // a street: a thick segment
    seg(x0, z0, x1, z1, hw, mark) { const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 1e-6) return; const n = Math.ceil(L / 16);      // (in short pieces: a long street across the grid has a bounding box of square kilometres)
      for (let k = 0; k < n; k++) { const a = k / n, b = (k + 1) / n; this.rect(x0 + dx * (a + b) / 2, z0 + dz * (a + b) / 2, dx / L, dz / L, L / n / 2 + hw * 0.5, hw, mark); } }
  }

  // ---------- what kind of place ----------
  // organic: roads out from the market or green, lanes round it, plots along them all (the old towns of Europe, the Near East's
  //   villages, Russia, the Ottoman lands, India's market towns); a village of it is the first road's two sides
  // grid: blocks between straight streets (Hippodamian and Roman foundations, the cities of China, the colonial towns of Spain
  //   and the Americas); medina: houses packed round their courts between a few winding streets (the Near East, North Africa, the
  //   Sahel's towns, the old cities of India and Central Asia); compound: family yards in a ring of huts and granaries behind a
  //   fence, scattered among paths (Africa south of the Sahara); cluster: houses loosely about a middle, as the first villages
  //   were and many still are (the Stone and Bronze Ages, the Americas' and Pacific peoples, hamlets of the hills)
  // A town keeps the kind it was founded as (its streets are where they are): by the place, the people who founded it and their age.
  function morphOf(fam, region, cul, foundEra) {
    if (region === 'steppe' || region === 'mong' || region === 'arctic' || region === 'tibet' || region === 'poly' || region === 'austr' && cul !== 0 && cul !== 1) return 'cluster';      // camps of tents, hamlets of the herders and the islands
    if (fam === 'africa') return region === 'sahel' || region === 'ethi' || region === 'swah' || region === 'magh' ? 'medina' : 'compound';
    if (fam === 'mena' || region === 'hind' || region === 'raj' || region === 'casia' || region === 'pers') return 'medina';
    if (fam === 'easia') return region === 'japan' || region === 'korea' || foundEra <= 1 ? 'organic' : 'grid';      // (the first villages of China grew as they would; the walled cities were laid out)
    if (fam === 'amer' || fam === 'nam' || fam === 'seasia') {
      if (CULFAM_EURO[cul] && foundEra >= 5) return 'grid';      // the colonial grid: the Laws of the Indies, the townships of the settlers
      if (fam === 'amer') return foundEra >= 2 ? 'grid' : 'cluster';      // (Teotihuacan and Tenochtitlan were laid out on their axes)
      return fam === 'seasia' ? 'organic' : 'cluster';
    }
    if (cul === 0 && foundEra === 3) return 'grid';      // a colony of the Greeks or the Romans
    return 'organic';
  }
  const CULFAM_EURO = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0];      // (by culture: the peoples who build as Europe does)

  // ---------- the plan of one town ----------
  // A plan is made out to a radius and kept; asked for more plots than it has, it is made again larger (the same streets and
  // the same plots, more of them). Each plot: x, z (the middle of its frontage, on the street's edge), yaw (its house's front to
  // the street), f (frontage), dep (how deep it may go), key (the order it is taken in), rank (0 a main road, 1 a lane round the
  // middle, 2 a back lane; 3 the square), u (how near the middle, 0..1, for its kind), cell (medina and compound: a whole house's
  // ground, not a frontage), comp (the compound it belongs to).
  const cache = new Map(); let version = 0;
  const keep = (key, P) => { cache.set(key, P); if (cache.size > 300) cache.delete(cache.keys().next().value); version++; };
  function plan(i, morph, opt) {
    const need = opt.need | 0; const key = i + '|' + morph + '|' + opt.sig;
    let P = cache.get(key);
    if (P && (P.plots.length >= need || P.full)) return P;
    let R = P ? P.R * 1.6 : Math.max(120, opt.r0 || 200);
    for (let tries = 0; tries < 6; tries++) {
      P = build(i, morph, opt, R);
      if (P.plots.length >= need || R > 12000) break;
      R *= 1.6;
    }
    if (R > 12000) P.full = true;
    jobs.delete(key); keep(key, P);
    return P;
  }
  // A page cannot stop for the plan of a great city (some hundreds of milliseconds): it asks for it (request) and the plan is made
  // a few milliseconds a frame (pump), the town drawn meanwhile as from afar, or by the smaller plan it had. version: how many
  // plans have been made (a page draws its towns again when it changes).
  const clock = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
  let until = Infinity; const over = () => until !== Infinity && clock() > until;
  const jobs = new Map();
  function request(i, morph, opt) {
    const need = opt.need | 0; const key = i + '|' + morph + '|' + opt.sig; const P = cache.get(key);
    if (P && (P.plots.length >= need || P.full)) return P;
    const j = jobs.get(key); if (j) { if (need > j.need) j.need = need; return null; }
    jobs.set(key, { key, i, morph, opt, need, R: P ? P.R * 1.6 : Math.max(120, opt.r0 || 200), tries: 0, gen: null });
    return null;
  }
  function pump(ms) {
    if (!jobs.size) return 0; until = clock() + ms;
    try {
      for (const j of jobs.values()) {
        if (clock() > until) break;
        if (!j.gen) j.gen = buildGen(j.i, j.morph, j.opt, j.R);
        const r = j.gen.next(); if (!r.done) break;      // (out of time: on with it next frame)
        const P = r.value; j.gen = null;
        if (P.plots.length >= j.need || j.R > 12000 || j.tries >= 5) { if (j.R > 12000) P.full = true; jobs.delete(j.key); keep(j.key, P); }
        else { j.R *= 1.6; j.tries++; }
      }
    } finally { until = Infinity; }
    return jobs.size;
  }
  function build(i, morph, opt, R) { const u0 = until; until = Infinity; try { const g = buildGen(i, morph, opt, R); let r = g.next(); while (!r.done) r = g.next(); return r.value; } finally { until = u0; } }

  function* buildGen(i, morph, opt, R) {
    const rnd = (k) => h(i, 70000 + k);
    const axis = opt.axis;
    const streets = [], plots = [];
    // What the plan keeps are the plots taken before a town reaches keepR; nothing laid out beyond far (a plot) or farSt (a street)
    // can take their ground or the ground of anything that could, so the plan is laid out no further (a larger plan lays out the
    // very same plots within it: the plots kept are the same, in the same order)
    const keepR = Math.min(R * 0.82, R - 70), far = keepR + 150, farSt = keepR + 200, far2 = far * far, farSt2 = farSt * farSt;
    const beyond = (pts, r2) => {      // (every piece of the line, not only its points: a grid's street is two points far apart)
      if (pts.length === 1) return pts[0][0] * pts[0][0] + pts[0][1] * pts[0][1] >= r2;
      for (let k = 0; k + 1 < pts.length; k++) { const a = pts[k], b = pts[k + 1]; const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; const t = L2 > 1e-12 ? clamp(-(a[0] * dx + a[1] * dz) / L2, 0, 1) : 0; const x = a[0] + dx * t, z = a[1] + dz * t; if (x * x + z * z < r2) return false; }
      return true; };
    const cell = 2.5; const occ = new Occ(farSt + 60, cell);      // (a fixed size: a larger plan must accept the very plots a smaller one did)
    // the square or green in the middle: a rectangle along the town's axis (a village's green, a town's market), and the
    // building every town gathers round on one side of it (the planner keeps that plot)
    const sqW = opt.sq ? opt.sq[0] : 50, sqD = opt.sq ? opt.sq[1] : 36; const ca = Math.cos(axis), sa = Math.sin(axis);
    const square = { x: 0, z: 0, w: sqW, d: sqD, a: axis };
    if (morph !== 'compound' && morph !== 'cluster') occ.rect(0, 0, ca, sa, sqW / 2 + 2, sqD / 2 + 2, 2);
    const addStreet = (pts, hw, rank) => { const s = { pts, hw, rank, id: streets.length }; streets.push(s); if (!beyond(pts, farSt2)) for (let k = 0; k + 1 < pts.length; k++) occ.seg(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], hw + 0.6, 2); return s; };
    // plots along one side of a polyline: frontages one after another, each as deep as there is room (a plot does not reach
    // into a street or another plot), the house's front to the street. key0: the order of the street's first plot; perm: how
    // much each metre along it adds to the order
    const AT = [0, 0, 0, 0];
    const along = (pts, hw, side, rank, key0, perm, fr, depMax, tag, sid, whole) => {
      if (!whole && beyond(pts, far2)) return 0;
      let acc = 0, segK = 0, s0 = 0; const seglen = []; let total = 0; for (let k = 0; k + 1 < pts.length; k++) { const L = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); seglen.push(L); total += L; }
      const at = (s) => { while (segK < seglen.length - 1 && s > s0 + seglen[segK]) { s0 += seglen[segK]; segK++; } const t = clamp((s - s0) / Math.max(1e-6, seglen[segK]), 0, 1); const a = pts[segK], b = pts[segK + 1]; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; AT[0] = a[0] + dx * t; AT[1] = a[1] + dz * t; AT[2] = dx / L; AT[3] = dz / L; return AT; };
      let s = 3 + rnd(tag * 7 + side) * 3; let q = 0;
      while (s < total - 4) {
        const f = fr(s, q); at(s + f / 2); const px = AT[0], pz = AT[1], tx = AT[2], tz = AT[3]; const nx = -tz * side, nz = tx * side;      // n: from the street into the plot
        if (!whole && px * px + pz * pz > far2) { s += f; q++; continue; }      // (a block's plots all, or none: one of its sides takes the corners of the next)
        const fx = px + nx * (hw + 0.4), fz = pz + nz * (hw + 0.4);      // the plot's front edge, middle
        // as deep as it can go, down to a house's depth
        let dep = depMax, ok = false;
        for (let tr = 0; tr < 4 && dep >= 6; tr++, dep *= 0.7) { const cx = fx + nx * dep / 2, cz = fz + nz * dep / 2; if (!occ.rect(cx, cz, tx, tz, f / 2 - 0.25, dep / 2 - 0.25, 0, 1)) { ok = true; break; } }
        if (ok) { const cx = fx + nx * dep / 2, cz = fz + nz * dep / 2; occ.rect(cx, cz, tx, tz, f / 2, dep / 2, 1);
          const yaw = Math.atan2(-nz, -nx) + Math.PI / 2;      // the house's front (+z) toward the street: front angle = yaw - pi/2 = angle of -n
          plots.push({ x: fx, z: fz, yaw, f, dep, key: key0 + s * perm + rnd(tag * 131 + q) * 6, rank, tx, tz, nx, nz, st: sid === undefined ? -1 : sid, s0: s, s1: s + f }); acc++; }
        s += f; q++;
      }
      return acc;
    };
    const fr0 = opt.front || [6, 11];      // frontages: narrow in the middle, wider out
    const frontage = (d, rank, k) => { const t = clamp(d / 700, 0, 1); const a = fr0[0] * (1 + t * 0.6 + rank * 0.15), b = fr0[1] * (1 + t * 0.9 + rank * 0.2); return a + (b - a) * h(i, 81000 + k); };

    if (morph === 'organic') {
      // roads out of the square: the first two a through road (a village is its two sides first), then the others
      const nMain = 3 + Math.floor(rnd(1) * 3); const angs = [axis + (rnd(2) - 0.5) * 0.4, axis + Math.PI + (rnd(3) - 0.5) * 0.5];
      for (let k = 2; k < nMain; k++) angs.push(axis + Math.PI / 2 + (k - 2) * Math.PI + (rnd(10 + k) - 0.5) * 0.9);
      const mains = [];
      for (let k = 0; k < angs.length; k++) {
        const a0 = angs[k], ph = rnd(20 + k) * TAU, ph2 = rnd(30 + k) * TAU; const pts = []; let x = Math.cos(a0) * Math.max(sqW, sqD) * 0.5, z = Math.sin(a0) * Math.max(sqW, sqD) * 0.5;
        for (let s = 0; s < Math.min(R * 1.1, farSt + 60); s += 14) { pts.push([x, z]); const hd = a0 + 0.22 * Math.sin(s / 260 + ph) + 0.1 * Math.sin(s / 95 + ph2); x += Math.cos(hd) * 14; z += Math.sin(hd) * 14; }
        mains.push({ pts, a: a0, hw: k < 2 ? 4.5 : 3.5, k });
      }
      for (const m of mains) m.id = addStreet(m.pts, m.hw, 0).id;
      // lanes round the middle: arcs between neighbouring roads at a ring's distance, each its own radius and wobble, the
      // further rings broken here and there; and short lanes out from each ring to the next
      // (every ring that could come in among the plots a smaller plan keeps is laid out in every plan: they wander by a fifth; and
      // a lane round the middle half a ring out, the back lane of the houses about the square)
      const ring = 72 + rnd(5) * 40; const nR = Math.ceil((R * 1.35 + 100) / ring);
      const order = angs.map((a, k) => [((a % TAU) + TAU) % TAU, k]).sort((p, q) => p[0] - q[0]);
      const rings = [];
      for (let jj = 0; jj <= nR; jj++) for (let q = 0; q < order.length; q++) {
        if (q === 0 && over()) yield;
        const j = jj || 0.5, jk = jj || 99;
        const a0 = order[q][0], a1 = order[(q + 1) % order.length][0] + (q + 1 === order.length ? TAU : 0); if (a1 - a0 < 0.25) continue;
        if ((j >= 2 || !jj) && h(i, 82000 + jk * 17 + q) < (jj ? 0.18 : 0.3)) continue;
        const r0 = (Math.max(sqW, sqD) * 0.5 + j * ring) * (1 + (h(i, 83000 + jk * 17 + q) - 0.5) * 0.24); const ph = h(i, 84000 + jk * 17 + q) * TAU;
        if (r0 * 0.88 > farSt) continue;      // (it wanders by a ninth at most: wholly beyond)
        const pts = []; const n = Math.max(4, Math.ceil((a1 - a0) * r0 / 14));
        for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; const rr = r0 * (1 + 0.07 * Math.sin(a * 3 + ph) + 0.04 * Math.sin(a * 7 + ph * 2)); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
        const s = addStreet(pts, !jj ? 2.4 : j <= 2 ? 3 : 2.6, 1); s.j = jk; s.r = r0; rings.push(s);
      }
      const lanes = [];
      if (over()) yield;
      for (const rg of rings) { const n = rg.pts.length; const step = Math.max(4, Math.round((60 + h(i, 85000 + rg.j) * 60) / 14));
        for (let k = step; k < n - step / 2; k += step) { if (h(i, 86000 + rg.j * 211 + k) < 0.3) continue; const [x, z] = rg.pts[k]; const a = Math.atan2(z, x); const pts = []; let px = x, pz = z;
          for (let s = 0; s < ring * 0.95; s += 12) { pts.push([px, pz]); const hd = a + 0.25 * Math.sin(s / 40 + k); px += Math.cos(hd) * 12; pz += Math.sin(hd) * 12; }
          if (beyond(pts, farSt2)) continue; const l = addStreet(pts, 2.2, 2); l.r = rg.r; lanes.push(l); } }
      // plots: round the square first, then the through road, the other roads, the rings, the lanes
      const sqPlots = (key0) => { const hw = sqW / 2, hd = sqD / 2; const sides = [[[-hw, hd], [hw, hd]], [[hw, -hd], [-hw, -hd]], [[-hw, -hd], [-hw, hd]], [[hw, hd], [hw, -hd]]];
        for (let q = 0; q < 4; q++) { const [a, b] = sides[q]; const pts = [[a[0] * ca - a[1] * sa, a[0] * sa + a[1] * ca], [b[0] * ca - b[1] * sa, b[0] * sa + b[1] * ca]]; along(pts, 2.1, 1, 3, key0, 0.2, (s, k) => frontage(0, 0, q * 50 + k), 22, 900 + q); } };
      sqPlots(0);
      for (const m of mains) for (const side of [1, -1]) { along(m.pts, m.hw, side, 0, 10 + m.k * 55, 1, (s, k) => frontage(s, 0, m.k * 10000 + side * 5000 + k), 30, 100 + m.k * 2 + (side > 0 ? 1 : 0), m.id); if (over()) yield; }
      for (const rg of rings) for (const side of [1, -1]) { along(rg.pts, rg.hw, side, 1, rg.r + 35, 0.35, (s, k) => frontage(rg.r, 1, rg.j * 7000 + side * 3000 + k), 26, 300 + rg.j * 2 + (side > 0 ? 1 : 0), rg.id); if (over()) yield; }
      for (const ln of lanes) for (const side of [1, -1]) { along(ln.pts, ln.hw, side, 2, ln.r + 60, 1, (s, k) => frontage(ln.r + s, 2, k + side * 900), 20, 600 + (side > 0 ? 1 : 0), ln.id); if (over()) yield; }
    } else if (morph === 'grid') {
      // blocks between straight streets on the town's axis; plots round each block's edges, the blocks nearest the square first
      const B = opt.block || 90, sw = opt.streetW || 9; const step = B + sw; const n = Math.ceil(R / step) + 1;
      for (let k = -n; k <= n; k++) { if (over()) yield; const u = (k + 0.5) * step; const len = Math.min(R * 1.05, farSt + 40); if (Math.abs(u) > farSt + 40) continue; addStreet([[u * ca - (-len) * sa, u * sa + (-len) * ca], [u * ca - len * sa, u * sa + len * ca]], sw / 2, Math.abs(k + 0.5) < 1 ? 0 : 1); addStreet([[(-len) * ca - u * sa, (-len) * sa + u * ca], [len * ca - u * sa, len * sa + u * ca]], sw / 2, Math.abs(k + 0.5) < 1 ? 0 : 1); }
      const blocks = []; for (let bx = -n; bx <= n; bx++) for (let bz = -n; bz <= n; bz++) { const u = bx * step, v = bz * step; const d = Math.hypot(u, v); if (d > R || d > keepR + B) continue; blocks.push([d + h(i, 87000 + bx * 977 + bz) * 20, u, v, bx, bz]); }      // (a block further out has no plot kept, and blocks keep to themselves)
      blocks.sort((a, b) => a[0] - b[0]);
      for (const [d, u, v, bx, bz] of blocks) {
        if (bx === 0 && bz === 0) continue;      // (the square's block)
        const hb = B / 2; const P = (p) => { const x = u + p[0], z = v + p[1]; return [x * ca - z * sa, x * sa + z * ca]; };
        // most blocks have a lane down the middle (a hutong, a back lane, the alley between two rows of houses' yards), so that
        // a block is two halves with houses round each and none of them deeper than half the block
        const hk = bx * 977 + bz; const lane = h(i, 87700 + hk) < 0.8, ldir = h(i, 87800 + hk) < 0.5 ? 0 : 1, lw = 1.6;
        const halves = !lane ? [[-hb, hb, -hb, hb]] : ldir === 0 ? [[-hb, hb, -hb, -lw], [-hb, hb, lw, hb]] : [[-hb, -lw, -hb, hb], [lw, hb, -hb, hb]];
        if (lane) addStreet(ldir === 0 ? [P([-hb - 2, 0]), P([hb + 2, 0])] : [P([0, -hb - 2]), P([0, hb + 2])], lw, 2);
        for (let hh = 0; hh < halves.length; hh++) { const [u0, u1, v0, v1] = halves[hh];
          const sides = [[[u0, v1], [u1, v1]], [[u1, v1], [u1, v0]], [[u1, v0], [u0, v0]], [[u0, v0], [u0, v1]]]; const dep = Math.min(u1 - u0, v1 - v0) * 0.5 * 0.95;
          for (let q = 0; q < 4; q++) { const [a, b] = sides[q];
            // the plots stand on the edge, facing out to the street (or the lane) that runs by it
            along([P(a), P(b)], 0.3, -1, 1, d, 0.25, (s, k) => frontage(d, 1, bx * 4000 + bz * 40 + q * 10 + hh * 5 + k), dep, 400 + ((bx * 31 + bz * 17 + q * 3 + hh) & 255), undefined, true); } }
        if (over()) yield;
      }
      // (taken nearest the square first, whichever block they belong to: a village of the grid is the plaza's four sides)
      for (let k = 0; k < plots.length; k++) { const p = plots[k]; p.key = Math.hypot(p.x, p.z) + h(i, 87500 + k) * 10; }
    } else if (morph === 'medina') {
      // a few winding streets out of the middle and pieces of rings between them, alleys off them that end among the houses,
      // and the ground between packed with houses round their courts: rows of cells a house wide, each row's joints its own
      // (as bricks are laid), now and then two cells one house, a cell cut back where a street runs by, a few left open
      const nMain = 3 + Math.floor(rnd(1) * 2);
      for (let k = 0; k < nMain; k++) { const a0 = axis + k * TAU / nMain + (rnd(10 + k) - 0.5) * 0.7, ph = rnd(20 + k) * TAU; const pts = []; let x = Math.cos(a0) * sqW * 0.55, z = Math.sin(a0) * sqW * 0.55;
        for (let s = 0; s < Math.min(R * 1.1, farSt + 60); s += 12) { pts.push([x, z]); const hd = a0 + 0.35 * Math.sin(s / 150 + ph) + 0.15 * Math.sin(s / 45 + ph * 1.7); x += Math.cos(hd) * 12; z += Math.sin(hd) * 12; }
        addStreet(pts, 3.2, 0); }
      const ring = 110 + rnd(5) * 50; for (let j = 1; j * ring < R + 90; j++) {      // (every ring that could reach in among the plots a smaller plan keeps: they wander, and their alleys go in)
        if (over()) yield;
        const r0 = sqW * 0.5 + j * ring; if (r0 * 0.82 > farSt + 70) continue; const n = Math.max(12, Math.round(TAU * r0 / 14)); const ph = rnd(40 + j) * TAU; const pts = [];
        for (let k = 0; k <= n; k++) { const a = k / n * TAU; const rr = r0 * (1 + 0.12 * Math.sin(a * 2 + ph) + 0.06 * Math.sin(a * 5 + ph)); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
        for (let q = 0; q < 6; q++) { const a = Math.floor(h(i, 88000 + j * 7 + q) * n); const b = Math.min(n, a + Math.floor(n * (0.08 + 0.1 * h(i, 88100 + j * 7 + q)))); if (b - a > 2) addStreet(pts.slice(a, b + 1), 2.2, 1); } }
      // the alleys: off every street, every thirty to fifty metres one side or the other, a lane a few metres wide that winds in
      // among the houses for a few of their lengths and ends at a door (the derb)
      for (const s0 of streets.slice()) { const pts = s0.pts; let acc = h(i, 88500 + s0.id) * 30, q = 0;
        for (let k = 0; k + 1 < pts.length; k++) { const a = pts[k], b = pts[k + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue; acc += L;
          if (acc < 30 + 20 * h(i, 88600 + s0.id * 101 + q)) continue; acc = 0; q++;
          const side = h(i, 88700 + s0.id * 101 + q) < 0.5 ? 1 : -1; const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L; let hd = Math.atan2(tx * side, -tz * side);      // (across the street, to one side)
          const len = 18 + 40 * h(i, 88800 + s0.id * 101 + q); const ap = []; let x = b[0] + Math.cos(hd) * (s0.hw + 0.5), z = b[1] + Math.sin(hd) * (s0.hw + 0.5);
          for (let s = 0; s <= len; s += 6) { ap.push([x, z]); hd += (h(i, 88900 + s0.id * 101 + q * 13 + s) - 0.5) * 0.9; x += Math.cos(hd) * 6; z += Math.sin(hd) * 6; }
          if (ap.length > 2 && Math.hypot(x, z) < R * 1.05 && !beyond(ap, farSt2)) addStreet(ap, 1.2, 2); }
        if (over()) yield; }
      const C = opt.cell || 13, J = 0.32; const nC = Math.ceil(R / C) + 2;
      const vB = (k) => k * C + (h(i, 89500 + k * 7) - 0.5) * J * C;      // the rows' edges
      const uB = (k, j) => j * C + h(i, 89300 + k * 13) * C + (h(i, 89000 + j * 977 + k * 31) - 0.5) * J * C;      // the joints along row k
      const cells = [];
      for (let k = -nC; k < nC; k++) { if ((k & 15) === 0 && over()) yield; const v0 = vB(k), v1 = vB(k + 1);
        for (let j = -nC - 1; j < nC; j++) {
          // (two cells one house: a pair is j even and the next, so that whether they are one does not hang on where the rows begin)
          const pair = (j & 1) === 0 && h(i, 91500 + j * 977 + k * 31) < 0.13; if ((j & 1) === 1 && h(i, 91500 + (j - 1) * 977 + k * 31) < 0.13) continue;
          const u0 = uB(k, j), u1 = uB(k, j + (pair ? 2 : 1)); const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2; const d = Math.hypot(uc, vc); if (d > R || d > far) continue;
          cells.push([d + h(i, 90000 + j * 977 + k * 31) * 22, u0, u1, v0, v1, j, k]); } }
      cells.sort((a, b) => a[0] - b[0]); let nc = 0;
      for (const [d, u0, u1, v0, v1, j, k] of cells) {
        if ((++nc & 63) === 0 && over()) yield;
        if (h(i, 91000 + j * 977 + k * 31) < 0.05) continue;      // a little square, a garden, a well
        // the ground the streets leave it: the whole cell, else the part of it away from the street (the half, or a third)
        let a0 = u0, a1 = u1, b0 = v0, b1 = v1, ok = false;
        const fits = (p0, p1, q0, q1) => { const uc = (p0 + p1) / 2, vc = (q0 + q1) / 2; return p1 - p0 > 5 && q1 - q0 > 5 && !occ.rect(uc * ca - vc * sa, uc * sa + vc * ca, ca, sa, (p1 - p0) / 2 - 0.15, (q1 - q0) / 2 - 0.15, 0, 2); };
        if (fits(a0, a1, b0, b1)) ok = true;
        else { const r0 = Math.floor(h(i, 92000 + j * 977 + k * 31) * 4);
          for (const cut of [0.45, 0.65]) { for (let q = 0; q < 4 && !ok; q++) { const s = (r0 + q) & 3; const du = (u1 - u0) * cut, dv = (v1 - v0) * cut;
            const c = s === 0 ? [u0 + du, u1, v0, v1] : s === 1 ? [u0, u1 - du, v0, v1] : s === 2 ? [u0, u1, v0 + dv, v1] : [u0, u1, v0, v1 - dv];
            if (fits(c[0], c[1], c[2], c[3])) { [a0, a1, b0, b1] = c; ok = true; } } if (ok) break; } }
        if (!ok) continue;
        const uc = (a0 + a1) / 2, vc = (b0 + b1) / 2; const x = uc * ca - vc * sa, z = uc * sa + vc * ca; const hu = (a1 - a0) / 2, hv = (b1 - b0) / 2;
        occ.rect(x, z, ca, sa, hu, hv, 1);
        // its door on the side a street or an alley runs by (the nearest such); else on whichever side its dice say
        let best = Math.floor(h(i, 92500 + j * 977 + k * 31) * 4), bd = 1e9;
        for (let q = 0; q < 4; q++) { const a = axis + q * Math.PI / 2; const half = q & 1 ? hv : hu; for (const reach of [1.8, 4.5]) { const kk = occ.idx(x + Math.cos(a) * (half + reach), z + Math.sin(a) * (half + reach)); if (kk >= 0 && occ.a[kk] === 2 && reach < bd) { bd = reach; best = q; } } }
        const fa = axis + best * Math.PI / 2; const nx = -Math.cos(fa), nz = -Math.sin(fa);      // n: from the front into the house
        const dep = best & 1 ? hv * 2 : hu * 2, f = best & 1 ? hu * 2 : hv * 2;
        plots.push({ x: x - nx * dep / 2, z: z - nz * dep / 2, yaw: fa + Math.PI / 2, f, dep, key: d, rank: d < 120 ? 1 : 2, tx: -nz, tz: nx, nx, nz, cell: 1, open: bd < 1e9 ? 1 : 0 });
      }
    } else if (morph === 'compound') {
      // family yards on a sunflower spiral, paths between; each yard its huts round it, the granaries, a fence
      const sp = opt.spacing || 42; const nY = Math.ceil(Math.PI * R * R / (sp * sp));
      for (let k = 0; k < nY; k++) { const r = sp * Math.sqrt(k + 0.6) * 0.62, a = k * 2.39996 + rnd(7) * TAU; if (r > far + sp) break; if ((k & 63) === 63 && over()) yield; const x = Math.cos(a) * r + (h(i, 93000 + k) - 0.5) * sp * 0.35, z = Math.sin(a) * r + (h(i, 93500 + k) - 0.5) * sp * 0.35;
        const rc = sp * (0.26 + 0.1 * h(i, 94000 + k)); const nh = 3 + Math.floor(h(i, 94500 + k) * 4);
        for (let q = 0; q < nh; q++) { const b = a + Math.PI + (q - (nh - 1) / 2) * (TAU / (nh + 1.5)); const hx = x + Math.cos(b) * rc * 0.62, hz = z + Math.sin(b) * rc * 0.62;
          const fa = b + Math.PI; const nx = Math.cos(b), nz = Math.sin(b);      // each hut's door to the yard
          plots.push({ x: hx - nx * 2.5, z: hz - nz * 2.5, yaw: Math.atan2(-nz, -nx) + Math.PI / 2, f: 6, dep: 6, key: r + q * 2 + h(i, 95000 + k * 13 + q) * 3, rank: 2, tx: -nz, tz: nx, nx, nz, cell: 1, comp: k, cx: x, cz: z, cr: rc }); void fa; }
      }
      // paths: from the middle out between the yards
      for (let k = 0; k < 6; k++) { const a0 = axis + k * TAU / 6 + (rnd(50 + k) - 0.5) * 0.5; const pts = []; for (let s = 6; s < R; s += 16) { const hd = a0 + 0.3 * Math.sin(s / 70 + k); pts.push([Math.cos(hd) * s, Math.sin(hd) * s]); } streets.push({ pts, hw: 1.3, rank: 2 }); }
    } else {      // cluster
      const sp = opt.spacing || 22; const nH = Math.ceil(Math.PI * R * R / (sp * sp) * 1.2); const par = opt.parallel;
      for (let k = 0; k < nH; k++) { const r = sp * Math.sqrt(k + 0.5) * 0.58, a = k * 2.39996 + rnd(7) * TAU; if (r > far + sp) break; if ((k & 127) === 127 && over()) yield; const x = Math.cos(a) * r + (h(i, 96000 + k) - 0.5) * sp * 0.5, z = Math.sin(a) * r + (h(i, 96500 + k) - 0.5) * sp * 0.5;
        if (occ.rect(x, z, 1, 0, sp * 0.3, sp * 0.3, 0, 1)) continue;
        const fa = par ? axis + (h(i, 97000 + k) < 0.5 ? 0 : Math.PI) + (h(i, 97100 + k) - 0.5) * 0.25 : Math.atan2(-z, -x) + (h(i, 97200 + k) - 0.5) * 0.6;      // longhouses side by side; huts with their doors to the middle
        const nx = -Math.cos(fa), nz = -Math.sin(fa); occ.rect(x, z, 1, 0, sp * 0.32, sp * 0.32, 1);
        plots.push({ x: x - nx * 3, z: z - nz * 3, yaw: fa + Math.PI / 2, f: sp * 0.6, dep: sp * 0.6, key: r + h(i, 97300 + k) * sp, rank: 2, tx: -nz, tz: nx, nx, nz, cell: 1 });
      }
      for (let k = 0; k < 4; k++) { const a0 = axis + k * TAU / 4 + (rnd(60 + k) - 0.5) * 0.6; const pts = []; for (let s = 5; s < R; s += 15) { const hd = a0 + 0.35 * Math.sin(s / 50 + k); pts.push([Math.cos(hd) * s, Math.sin(hd) * s]); } streets.push({ pts, hw: 1.0, rank: 2 }); }
    }
    // only what lies well inside the radius it was made to (keepR): past it a plot may yet be taken by one nearer in a larger plan
    const K = new Float64Array(plots.length), ix = []; for (let k = 0; k < plots.length; k++) { K[k] = plots[k].key; if (K[k] < keepR) ix.push(k); }
    ix.sort((a, b) => K[a] - K[b] || a - b); const keep = ix.map((k) => plots[k]);
    // how far out the first n plots reach (rad[n - 1]: the radius of a disc with their spread, never less than for fewer)
    const rad = new Float32Array(keep.length); let s2 = 0, best = 0;
    for (let k = 0; k < keep.length; k++) { const p = keep[k], d = Math.min(p.dep, 14) * 0.5; const x = p.x + p.nx * d, z = p.z + p.nz * d; s2 += x * x + z * z; best = Math.max(best, Math.sqrt(2 * s2 / (k + 1))); rad[k] = best; }
    return { R, plots: keep, streets, square, morph, rad };
  }
  // the radius of a town of n plots (true metres)
  function radAt(P, n) { if (!P.plots.length || n <= 0) return 0; return P.rad[Math.min(n, P.plots.length) - 1]; }
  // how far out the backs of the first n plots reach, the share q of them (a wall raised round a town encloses most of it; the
  // houses strung out along its roads beyond are its suburbs)
  function outerAt(P, n, q) {
    const nn = Math.min(n, P.plots.length); if (!nn) return 0; const key = nn + ':' + q; if (P._oa && P._oa.key === key) return P._oa.v;
    const d = new Float32Array(nn); for (let k = 0; k < nn; k++) { const p = P.plots[k]; d[k] = Math.hypot(p.x + p.nx * p.dep, p.z + p.nz * p.dep); }
    d.sort(); const v = d[Math.min(nn - 1, Math.floor(q * (nn - 1)))]; P._oa = { key, v }; return v;
  }

  // The streets a town of n plots has: those its plots stand on, as far along as they are built (from where the street leaves the
  // square or the street it comes off), and the others (the grid's, the medina's, the paths) as far out as the town reaches.
  // Segments [x0, z0, x1, z1, half width, rank] in true metres.
  function streetsFor(P, n) {
    const key = n; if (P._sf && P._sf.key === key) return P._sf.out;
    const nn = Math.min(n, P.plots.length); const far = new Float32Array(P.streets.length).fill(-1); let used = false;
    for (let k = 0; k < nn; k++) { const p = P.plots[k]; if (p.st >= 0) { far[p.st] = Math.max(far[p.st], p.s1 + 4); used = true; } }
    const R = radAt(P, nn) * 1.08 + 10; const out = [];
    for (const st of P.streets) {
      const pts = st.pts; let lim = far[st.id === undefined ? -1 : st.id];
      // (a main road runs on out of the town, to where the road to the next one begins)
      if (st.rank === 0 && used) { let s1 = 0; for (let k = 0; k + 1 < pts.length; k++) { const b = pts[k + 1]; s1 += Math.hypot(b[0] - pts[k][0], b[1] - pts[k][1]); if (Math.hypot(b[0], b[1]) > R * 1.1) break; } lim = Math.max(lim, s1); }
      let s = 0;
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (used && st.id !== undefined && lim >= 0) { if (s >= lim) break; const t = Math.min(1, (lim - s) / L); out.push([a[0], a[1], a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, st.hw, st.rank]); }
        else if (!(used && st.id !== undefined && P.morph === 'organic')) {      // (the part of it within the town: a grid's street is one long line across the whole plan)
          const dx = b[0] - a[0], dz = b[1] - a[1], A = dx * dx + dz * dz, B = a[0] * dx + a[1] * dz, Cc = a[0] * a[0] + a[1] * a[1] - R * R, disc = B * B - A * Cc;
          if (A > 1e-9 && disc > 0) { const sq = Math.sqrt(disc); const t0 = Math.max(0, (-B - sq) / A), t1 = Math.min(1, (-B + sq) / A); if (t1 - t0 > 1e-6) out.push([a[0] + dx * t0, a[1] + dz * t0, a[0] + dx * t1, a[1] + dz * t1, st.hw, st.rank]); }
        }
        s += L;
      }
    }
    P._sf = { key, out }; return out;
  }

  // Where the main roads leave a town of radius r (angles, east toward north): the gates of its walls and the roads to its
  // neighbours. Worked out from the same dice as the plan, without making it (the roads between all the towns in sight ask).
  function exits(i, morph, opt, r) {
    const rnd = (k) => h(i, 70000 + k); const axis = opt.axis; const sqW = opt.sq ? opt.sq[0] : 50, sqD = opt.sq ? opt.sq[1] : 36; const out = [];
    if (morph === 'organic') {
      const nMain = 3 + Math.floor(rnd(1) * 3); const angs = [axis + (rnd(2) - 0.5) * 0.4, axis + Math.PI + (rnd(3) - 0.5) * 0.5];
      for (let k = 2; k < nMain; k++) angs.push(axis + Math.PI / 2 + (k - 2) * Math.PI + (rnd(10 + k) - 0.5) * 0.9);
      for (let k = 0; k < angs.length; k++) {      // (walked as the plan walks it, to where it crosses r)
        const a0 = angs[k], ph = rnd(20 + k) * TAU, ph2 = rnd(30 + k) * TAU; let x = Math.cos(a0) * Math.max(sqW, sqD) * 0.5, z = Math.sin(a0) * Math.max(sqW, sqD) * 0.5;
        for (let s = 0; s < r * 1.5 + 30 && Math.hypot(x, z) < r; s += 14) { const hd = a0 + 0.22 * Math.sin(s / 260 + ph) + 0.1 * Math.sin(s / 95 + ph2); x += Math.cos(hd) * 14; z += Math.sin(hd) * 14; }
        out.push(Math.atan2(z, x)); }
    } else if (morph === 'medina') {
      const nMain = 3 + Math.floor(rnd(1) * 2);
      for (let k = 0; k < nMain; k++) { const a0 = axis + k * TAU / nMain + (rnd(10 + k) - 0.5) * 0.7, ph = rnd(20 + k) * TAU; let x = Math.cos(a0) * sqW * 0.55, z = Math.sin(a0) * sqW * 0.55;
        for (let s = 0; s < r * 1.5 + 30 && Math.hypot(x, z) < r; s += 12) { const hd = a0 + 0.35 * Math.sin(s / 150 + ph) + 0.15 * Math.sin(s / 45 + ph * 1.7); x += Math.cos(hd) * 12; z += Math.sin(hd) * 12; }
        out.push(Math.atan2(z, x)); }
    } else if (morph === 'grid') { for (let q = 0; q < 4; q++) out.push(axis + q * Math.PI / 2); }
    else if (morph === 'compound') { for (let k = 0; k < 6; k += 2) out.push(axis + k * TAU / 6 + (rnd(50 + k) - 0.5) * 0.5 + 0.3 * Math.sin(r / 70 + k)); }
    else { for (let k = 0; k < 4; k += 2) out.push(axis + k * TAU / 4 + (rnd(60 + k) - 0.5) * 0.6 + 0.35 * Math.sin(r / 50 + k)); }
    return out;
  }

  window.PLOTS = { plan, request, pump, get version() { return version; }, pending: () => jobs.size, morphOf, radAt, outerAt, streetsFor, exits, cached: (i, morph, sig) => cache.get(i + '|' + morph + '|' + sig) || null, clear: () => { cache.clear(); jobs.clear(); }, cacheSize: () => cache.size };
})();
