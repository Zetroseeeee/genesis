// The air, checked and drawn without the game: node tools/air/sky.js check | sheet [name] | orbit [name]
//   check   how close the quick sums in src/air.js are to slow, exact ones (the column of air to space; a line of sight in few steps)
//   sheet   shots/air/<name>.png: the sky and a plain green country under it, looking toward the sun and away, for a row of sun heights
//   orbit   shots/air/<name>.png: the planet's rim from outside, day, edge of night and night
// Options by environment: EXPOSE, HAZE, N (steps for the sky), NG (steps for the ground), ALT (metres above the sea)
global.window = global; const fs = require('fs'), path = require('path');
(0, eval)(fs.readFileSync(path.join(__dirname, '../../src/air.js'), 'utf8'));
const A = global.AIR, { PNG } = require('pngjs'); const R_M = 6371000;
if (process.env.HAZE) A.setHaze(+process.env.HAZE); if (process.env.EXPOSE) A.expose = +process.env.EXPOSE; if (process.env.EXPOSE_HIGH) A.exposeHigh = +process.env.EXPOSE_HIGH;
const NS = +(process.env.N || 16), NG = +(process.env.NG || 8);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// the picture's last step, as post.js does it: the screen's curve, then the shoulder
const show = (lin) => lin.map((v) => { let g = Math.pow(Math.max(v, 0), 0.4545); const a = 0.8, l = 1.035; if (g > a) g = a + (l - a) * (1 - Math.exp(-(g - a) / (l - a))); return Math.min(1, g); });
// the ground as terrain.js lights it: a colour of the screen, by the sun's height there and how the ground faces it
const ground = (col, sunUp, diff) => { const kW = sm(0.02, 0.42, sunUp), k = sm(-0.03, 0.05, sunUp) * (1 + 1.1 * (1 - sm(0.04, 0.5, sunUp))), sun = [k, k * (0.56 + 0.44 * kW), k * (0.30 + 0.70 * kW)], day = sm(-0.1, 0.16, sunUp), dusk = sm(-0.12, 0.02, sunUp) * (1 - sm(0.08, 0.4, sunUp));
  const amb = [0.24 + (0.26 - 0.24) * day + 0.24 * dusk, 0.30 + (0.26 - 0.30) * day + 0.17 * dusk, 0.48 + (0.26 - 0.48) * day + 0.18 * dusk]; return col.map((c, i) => c * (amb[i] + diff * 1.05 * sun[i])); };

function check() {
  // the column to space against a sum of 20,000 slices
  const exact = (r, mu, H) => { const sn = Math.sqrt(1 - mu * mu); let s = 0; const n = 20000, far = Math.sqrt(A.RT * A.RT * 4) ; const tEnd = -r * mu + Math.sqrt(Math.max(r * r * mu * mu - r * r + (1 + 40 * H) * (1 + 40 * H), 0)); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n * tEnd, rr = Math.sqrt(r * r + 2 * r * mu * t + t * t); s += Math.exp(-(rr - 1) / H) * tEnd / n; } return s; };
  const col = A.col;
  console.log('column to space: quick / exact');
  for (const H of [A.HR, A.HM]) for (const h of [0, 2000, 10000, 40000]) { const r = 1 + h * A.THICK / R_M; const row = []; for (const deg of [0, 60, 80, 86, 89, 90, 91, 92, 93]) { const mu = Math.cos(deg * Math.PI / 180); const r0 = r * Math.sqrt(1 - mu * mu); if (mu < 0 && r0 < 1) { row.push('  -  '); continue; } row.push((col(r, mu, H) / exact(r, mu, H)).toFixed(3)); } console.log((H === A.HR ? 'gas ' : 'haze'), String(h).padStart(6) + ' m', row.join(' ')); }
  // a line of sight in few steps against 3,000
  console.log('\nline of sight: light added in N steps / in 3000 (red, blue), and what is let through');
  const S0 = (deg) => [Math.cos(deg * Math.PI / 180), 0, Math.sin(deg * Math.PI / 180)];
  const views = [];
  for (const alt of [300, 10000, 80000]) for (const el of [-30, -5, -1, 0, 1, 5, 30, 90]) views.push({ name: `from ${alt} m, ${el} deg`, C: [0, 0, -(1 + alt / R_M)], rd: [Math.cos(el * Math.PI / 180), 0, Math.sin(el * Math.PI / 180)] });
  for (const hp of [0.0002, 0.003, 0.008, 0.02]) { const d = 2.7, s = (1 + hp) / d; views.push({ name: `from orbit, passing ${(hp * R_M / 1000).toFixed(0)} km up`, C: [0, 0, -d], rd: [Math.sqrt(1 - (1 - s * s)), 0, -Math.sqrt(1 - s * s)].map((v, i) => i === 2 ? -v * -1 : v) }); }
  for (const sunDeg of [40, 2, -4]) { console.log(`sun ${sunDeg} deg up`);
    for (const v of views) { const S = v.name.startsWith('from orbit') ? norm([0.3, 0.2, -0.93]) : S0(sunDeg); const ref = A.march(v.C, v.rd, Infinity, 3000, S, { ground: true }); const out = [];
      for (const n of [6, 8, 12, 16, 24]) { const m = A.march(v.C, v.rd, Infinity, n, S, { ground: true }); out.push(`${n}: ${(m.L[0] / ref.L[0]).toFixed(3)} ${(m.L[2] / ref.L[2]).toFixed(3)}`); }
      console.log('  ' + v.name.padEnd(34), out.join('   '), '  L', ref.L.map((x) => (x * A.expose).toFixed(3)).join(' '), ' T', ref.T.map((x) => x.toFixed(3)).join(' ')); } }
  console.log('\nthe table (light scattered more than once), by the sun\'s height:'); A.psi.forEach((p, i) => { const w = -0.55 + 1.35 * i / 15, mu = w >= 0 ? 0.25 * w / (1 - w) : 0.25 * w / (1 + w); console.log('  ' + (Math.asin(mu) * 180 / Math.PI).toFixed(1).padStart(6) + ' deg', p.map((x) => x.toExponential(2)).join(' ')); });
  console.log('\nsunlight on the ground, and how far the eye is opened:'); for (const deg of [60, 30, 10, 5, 2, 0, -2, -4, -6, -9, -12]) { const mu = Math.sin(deg * Math.PI / 180); console.log('  ' + String(deg).padStart(4) + ' deg', A.sun(1, mu).map((x) => x.toFixed(4)).join(' '), ' x' + A.open(mu, 0).toFixed(1)); }
}

// a camera over the sea at lon 0, lat 0 (the world's +x is up there): alt metres up, looking along the heading (0 = toward the sun's side) at a tilt below the level
function view(alt, pitchDeg, headDeg, fovDeg, W, H, sunDeg, opt) {
  const o = opt || {}; const r = 1 + alt / R_M, up = [1, 0, 0], east = [0, 0, 1], north = [0, 1, 0];
  const S = norm([Math.sin(sunDeg * Math.PI / 180), 0, Math.cos(sunDeg * Math.PI / 180)]);      // the sun in the east, sunDeg above the horizon
  const hd = headDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180; const fwdH = [0, Math.sin(hd), Math.cos(hd)];      // level, toward the east at heading 0
  const fwd = norm([Math.sin(p), fwdH[1] * Math.cos(p), fwdH[2] * Math.cos(p)]), right = norm([0, -fwdH[2], fwdH[1]].map((v) => -v)), upC = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]].map((v) => -v);
  const tanV = Math.tan(fovDeg * Math.PI / 360), tanH = tanV * W / H; const img = new Float32Array(W * H * 3); const C = [-r, 0, 0];      // the planet's centre from the eye
  A.opened = A.open(dot(up, S), alt / R_M); const E = A.exposure(alt / R_M) * A.opened;
  const nightK = (1 - sm(-0.3, -0.08, dot(up, S))) * (1 - sm(0.004, 0.03, alt / R_M)), NIGHT = A.night.map((v) => v * nightK);
  const near = o.dist ? [...A.near(o.dist / R_M), A.down] : [1, 1, A.down];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = ((x + 0.5) / W * 2 - 1) * tanH, sy = (1 - (y + 0.5) / H * 2) * tanV; const rd = norm([fwd[0] + right[0] * sx + upC[0] * sy, fwd[1] + right[1] * sx + upC[1] * sy, fwd[2] + right[2] * sx + upC[2] * sy]);
    const q = dot(rd, C), c2 = r * r, rp2 = c2 - q * q; let lin;
    if (rp2 < 1 && q > 0) {      // the ground
      const t = q - Math.sqrt(1 - rp2), P = [rd[0] * t - C[0], rd[1] * t - C[1], rd[2] * t - C[2]], sunUp = dot(P, S);
      const tile = ((Math.floor(Math.atan2(P[2], P[0]) * 400) + Math.floor(Math.asin(P[1]) * 400)) & 1) ? 1 : 0.86; const sea = o.sea ? 1 : 0;
      const col = sea ? [0.05, 0.13, 0.24] : [0.30 * tile, 0.36 * tile, 0.19 * tile]; const g = ground(col, sunUp, Math.max(sunUp, 0));
      const m = o.noair ? { T: [1, 1, 1], L: [0, 0, 0] } : A.march(C, rd, t, NG, S, { near }); lin = g.map((c, i) => Math.pow(c, 2.2) * m.T[i] + m.L[i] * E + NIGHT[i] * (1 - m.T[i]));
    } else {
      const m = A.march(C, rd, Infinity, NS, S, { near }); lin = m.L.map((l, i) => l * E + NIGHT[i] * (1 - m.T[i]));
      const ang = Math.acos(Math.min(1, dot(rd, S))); if (ang < 0.0093) lin = lin.map((l, i) => l + 60 * m.T[i]);
    }
    const c = show(lin); img[(y * W + x) * 3] = c[0]; img[(y * W + x) * 3 + 1] = c[1]; img[(y * W + x) * 3 + 2] = c[2];
  }
  return img;
}
function save(name, cells, cols, W, H) {
  const rows = Math.ceil(cells.length / cols), png = new PNG({ width: cols * (W + 4), height: rows * (H + 4) }); png.data.fill(255);
  cells.forEach((img, k) => { const ox = (k % cols) * (W + 4) + 2, oy = Math.floor(k / cols) * (H + 4) + 2; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = ((oy + y) * png.width + ox + x) * 4, i = (y * W + x) * 3; png.data[o] = Math.round(img[i] * 255); png.data[o + 1] = Math.round(img[i + 1] * 255); png.data[o + 2] = Math.round(img[i + 2] * 255); png.data[o + 3] = 255; } });
  fs.mkdirSync('shots/air', { recursive: true }); fs.writeFileSync(`shots/air/${name}.png`, PNG.sync.write(png)); console.log(`shots/air/${name}.png`);
}
const cmd = process.argv[2] || 'check', name = process.argv[3] || cmd;
if (cmd === 'check') check();
else if (cmd === 'sheet') { const W = 240, H = 150, alt = +(process.env.ALT || 400), suns = (process.env.SUNS || '50,20,8,2,-1,-4,-7,-11').split(',').map(Number), cells = [];
  for (const s of suns) { cells.push(view(alt, +(process.env.PITCH || 4), 0, 45, W, H, s)); cells.push(view(alt, +(process.env.PITCH || 4), 90, 45, W, H, s)); cells.push(view(alt, +(process.env.PITCH || 4), 180, 45, W, H, s)); cells.push(view(alt, -35, 60, 45, W, H, s)); }
  save(name, cells, 4, W, H); }
else if (cmd === 'orbit') { const W = 300, H = 190, cells = [];
  for (const [alt, pitch, sun] of [[1.7 * R_M, -90, 60], [1.7 * R_M, -70, 20], [1.7 * R_M, -72, -2], [400000, -18, 40], [400000, -18, 3], [400000, -18, -6], [80000, -8, 30], [80000, -8, 1], [80000, -8, -5], [20000, -3, 30], [20000, -3, 1], [20000, -3, -5]]) cells.push(view(alt, pitch, 30, 45, W, H, sun, { sea: false }));
  save(name, cells, 3, W, H); }
