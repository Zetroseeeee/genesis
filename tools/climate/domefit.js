// The domes of ice (src/climate.js) against where history has the margins (tools/climate/iceref.json).
//   node tools/climate/domefit.js map [out.png]        a sheet of where the ice lies at 10,000, 9000, 8000, 7000, 6300, 6000 and 5000 BC
//                                                      over North America and Scandinavia, the margins of those years as red points
//                                                      (default shots/climate/icemap.png)
//   node tools/climate/domefit.js fit [passes] [--write]   moves every dome (its middle and where it goes, radius, how long, which
//                                                      way, its end, how it shrinks) by coordinate descent until the years the ice
//                                                      leaves the margins' points and the places of 'left' are as near history's
//                                                      as it can make them, the places of 'free' never under it; prints the worst
//                                                      points, and with --write puts the table into src/climate.js (DOMES marks).
// The domes of FIX are left as they are: nothing there holds them (the high Arctic, Baffin, Iceland; the Highlands' shape).
// Run it after touching the domes or the lobes, then the ice tests (test_sim 23) and the climate probe.
global.window = {}; const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..');
(0, eval)(fs.readFileSync(path.join(root, 'src/climate.js'), 'utf8')); const C = window.CLIMATE;
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'iceref.json'), 'utf8'));
const T0 = C.T0, mode = process.argv[2] || 'map';
const FIX = { foxe: 'all', innuitian: 'all', iceland: 'all', highlands: ['to', 'end', 'p'] };
const KEYS = ['lon', 'lat', 'tox', 'toy', 'r0', 'ax', 'az', 'end', 'p'];
// the year the ice of these domes left a place (-1e9: never), with the domes as given (each frame worked out afresh)
function left(D, u, lk) {
  let best = -1e9;
  for (const d of D) {
    if (!(C.domeQ(d, C.frame(d, d.hold), u) < lk)) continue;
    let t = d.hold; const st = Math.max(10, (d.end - d.hold) / 60); while (t + st < d.end && C.domeQ(d, C.frame(d, t + st), u) < lk) t += st;
    let a = t, b = Math.min(d.end, t + st); for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (C.domeQ(d, C.frame(d, m), u) < lk) a = m; else b = m; }
    if (a > best) best = a;
  }
  return best;
}
if (mode === 'map') {
  const PNG = require(path.join(root, 'node_modules/pngjs')).PNG; const wp = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png'))); const WW = wp.width, WH = wp.height;
  const landAt = (lon, lat) => { const x = Math.min(WW - 1, Math.max(0, Math.floor((lon + 180) / 360 * WW))), y = Math.min(WH - 1, Math.max(0, Math.floor((90 - lat) / 180 * WH))); return wp.data[(y * WW + x) * 4 + 2] & 1; };
  const VIEWS = [['N America', -145, -50, 38, 82], ['Scandinavia', -12, 48, 50, 76]], YEARS = [-10000, -9000, -8000, -7000, -6300, -6000, -5000], S = 5;
  const tiles = []; let W = 0, H = 0;
  for (const v of VIEWS) { const w = Math.round((v[2] - v[1]) * S * Math.cos((v[3] + v[4]) / 2 * Math.PI / 180)), h = Math.round((v[4] - v[3]) * S); tiles.push([v, w, h]); W = Math.max(W, w); H += h + 4; }
  const out = new PNG({ width: W * YEARS.length + 4 * (YEARS.length - 1), height: H }); out.data.fill(30);
  const put = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= out.width || y >= out.height) return; const o = (y * out.width + x) * 4; out.data[o] = r; out.data[o + 1] = g; out.data[o + 2] = b; out.data[o + 3] = 255; };
  const cache = new Map(), leftAt = (lon, lat) => { const k = Math.round(lon * 10) + ',' + Math.round(lat * 10); let v = cache.get(k); if (v === undefined) { v = C.iceLeftAt(lon, lat)[0]; cache.set(k, v); } return v; };
  let oy = 0;
  for (const [v, w, h] of tiles) {
    const cl = Math.cos((v[3] + v[4]) / 2 * Math.PI / 180);
    YEARS.forEach((yr, k) => { const ox = k * (W + 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const lon = v[1] + (x + 0.5) / (S * cl), lat = v[4] - (y + 0.5) / S, land = landAt(lon, lat), ice = yr < leftAt(lon, lat);
        if (ice) put(ox + x, oy + y, land ? 235 : 200, land ? 240 : 215, 250); else if (land) put(ox + x, oy + y, 70, 110, 60); else put(ox + x, oy + y, 25, 45, 90); }
      for (const [ry, lon, lat] of REF.margins) { if (Math.abs(ry - yr) > 150) continue; const x = Math.round((lon - v[1]) * S * cl), y = Math.round((v[4] - lat) * S); if (x < 0 || y < 0 || x >= w || y >= h) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) put(ox + x + dx, oy + y + dy, 255, 40, 30); }
      for (let t = 0; t < Math.round((-4000 - yr) / 1000); t++) for (let dy = 0; dy < 6; dy++) put(ox + 4 + t * 6, oy + 3 + dy, 255, 220, 0);      // (the year: a tick for every thousand years before 4000 BC)
    });
    oy += h + 4;
  }
  const file = process.argv[3] || path.join(root, 'shots/climate/icemap.png'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, PNG.sync.write(out)); console.log('wrote', file);
  return;
}
// ---------- the fit ----------
const PTS = [];
for (const [y, lon, lat] of REF.margins) PTS.push({ u: C.unit(lon, lat), y, w: 1, kind: 'margin' });
for (const [lon, lat, y, name] of REF.left) PTS.push({ u: C.unit(lon, lat), y, w: 1.5, kind: name });
for (const [lon, lat, name] of REF.free) PTS.push({ u: C.unit(lon, lat), y: T0, w: 2, kind: 'free', name });
for (const p of PTS) p.lk = C.lobeK(p.u);
const D = C.DOMES.map((d) => ({ ...d, to: d.to.slice() }));
const huber = (e) => (Math.abs(e) <= 1 ? e * e / 2 : Math.abs(e) - 0.5);
function loss() {
  let s = 0;
  for (const p of PTS) { const L = left(D, p.u, p.lk); if (p.kind === 'free') { if (L > T0) s += p.w * huber((L - T0) / 300); } else s += p.w * huber((Math.max(L, T0 - 600) - p.y) / 300); }
  for (const d of D) { if (d.ax < 1) s += (1 - d.ax) * 50; if (d.ax > 3.2) s += (d.ax - 3.2) * 50; if (d.p < 0.25) s += (0.25 - d.p) * 100; if (d.p > 2) s += (d.p - 2) * 100; if (d.r0 < 60) s += 100; }
  return s;
}
const STEP = { lon: 1.0, lat: 0.5, tox: 1.0, toy: 0.5, r0: 60, ax: 0.15, az: 12, end: 150, p: 0.08 };
const get = (d, k) => (k === 'tox' ? d.to[0] : k === 'toy' ? d.to[1] : d[k]), set = (d, k, v) => { if (k === 'tox') d.to[0] = v; else if (k === 'toy') d.to[1] = v; else d[k] = v; };
const fixed = (d, k) => FIX[d.key] === 'all' || (Array.isArray(FIX[d.key]) && (FIX[d.key].includes(k) || (k.startsWith('to') && FIX[d.key].includes('to'))));
let best = loss(); const passes = +(process.argv[3] || 40), step = KEYS.map((k) => D.map(() => STEP[k]));
console.log('start', best.toFixed(2));
for (let pass = 0; pass < passes; pass++) {
  let moved = 0;
  D.forEach((d, i) => KEYS.forEach((k, j) => { if (fixed(d, k)) return; const v0 = get(d, k); let ok = false;
    for (const sg of [1, -1]) { set(d, k, v0 + sg * step[j][i]); const l = loss(); if (l < best - 1e-9) { best = l; ok = true; moved++; break; } }
    if (!ok) { set(d, k, v0); step[j][i] *= 0.6; } else step[j][i] *= 1.2; }));
  console.log('pass', pass, best.toFixed(2), 'moved', moved); if (!moved) break;
}
const errs = PTS.map((p) => ({ p, L: left(D, p.u, p.lk) })), ll = (u) => `${(Math.atan2(u[1], u[0]) * 180 / Math.PI).toFixed(1)},${(Math.asin(u[2]) * 180 / Math.PI).toFixed(1)}`;
console.log('worst:', errs.filter((e) => e.p.kind !== 'free').map((e) => ({ ...e, d: Math.max(e.L, T0 - 600) - e.p.y })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 12).map((e) => `${e.p.kind === 'margin' ? ll(e.p.u) : e.p.kind}@${e.p.y}:${Math.round(e.d)}`).join('  '));
console.log('free but under the ice:', errs.filter((e) => e.p.kind === 'free' && e.L > T0).map((e) => `${e.p.name} until ${Math.round(e.L)}`).join(', ') || 'none');
const f = (v) => (Math.round(v * 100) / 100).toString();
const table = D.map((d) => { const o = []; if (d.hold !== T0) o.push(`hold: ${d.hold}`); o.push(`p: ${f(d.p)}`, `ax: ${f(d.ax)}`, `az: ${f(d.az)}`, `to: [${f(d.to[0])}, ${f(d.to[1])}]`); if (d.mtn) o.push('mtn: 1');
  return `    dome('${d.key}', '${d.name}', ${f(d.lon)}, ${f(d.lat)}, ${Math.round(d.r0)}, ${Math.round(d.end / 10) * 10}, { ${o.join(', ')} }),`; }).join('\n');
console.log(table);
if (process.argv.includes('--write')) { const p = path.join(root, 'src/climate.js'); const s = fs.readFileSync(p, 'utf8'); fs.writeFileSync(p, s.replace(/(\/\* DOMES:BEGIN \*\/\n)[\s\S]*?(\n\s*\/\* DOMES:END \*\/)/, `$1${table}$2`)); console.log('written to src/climate.js'); }
