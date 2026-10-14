// A town's plan from above as the planner gives it, without the page (seconds): its streets, its houses in the colours of
// their roofs, the things in the yards, the walls, the great buildings and the quarters. To look at how a town of a people,
// an age and a size is laid out before looking at it in the game.
//   node tools/towns/plan.js [places] [eras] [sizes in thousands] [--found <era>]
//   -> shots/towns/plan_<place>_e<era>_<size>k.png, and shots/towns/plan_sheet.png with all of them
// places: london cotswold rome moscow cairo lagos delhi xian kyoto java mexico chicago mongolia fes kenya (default: a few)
global.window = global; const fs = require('fs'); const path = require('path'); const PNG = require('pngjs').PNG;
for (const f of ['know.js', 'vern.js', 'plots.js', 'town.js']) (0, eval)(fs.readFileSync(path.join('src', f), 'utf8'));
TOWN.budget.on = false;
const W = 720, H = 360, N = W * H;
const PLACES = { london: [-0.12, 51.5], cotswold: [-1.9, 51.9], rome: [12.5, 41.9], moscow: [37.62, 55.75], cairo: [31.24, 30.04], lagos: [3.38, 6.52], delhi: [77.2, 28.6], xian: [108.9, 34.3], kyoto: [135.7, 35.0], java: [110.4, -7.0], mexico: [-99.13, 19.43], chicago: [-87.63, 41.88], mongolia: [106.9, 47.9], fes: [-5.0, 34.03], kenya: [37.0, -0.5] };
const ERA_TECH = [0.04, 0.12, 0.24, 0.35, 0.48, 0.6, 0.72, 0.86, 0.95, 1.05];
const args = process.argv.slice(2).filter((a, k, A) => !a.startsWith('--') && !(A[k - 1] || '').startsWith('--'));
const places = (args[0] || 'cotswold,fes,xian,lagos').split(',');
const eras = (args[1] || '0,4').split(',').map(Number);
const sizes = (args[2] || '0.3,5').split(',').map(Number);
const fi = process.argv.indexOf('--found'); const found = fi > 0 ? +process.argv[fi + 1] : null;
const SZ = 720; fs.mkdirSync('shots/towns', { recursive: true });
const hexRGB = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const KIND = { street: 0xb9ab92, road7: 0x8c8c88, wall: 0x6e6256, model: 0xc28a5c, prop: 0x5a4a3a, great: 0xd0a040, field: 0xc8c08a, water: 0x6f9fc0 };
const tiles = [];
for (const name of places) {
  const [lon, lat] = PLACES[name]; const i = Math.floor((90 - lat) / 180 * H) * W + Math.floor((lon + 180) / 360 * W);
  for (const era of eras) for (const popK of sizes) {
    const lvl = popK >= 500 ? 4 : popK >= 50 ? 3 : popK >= 5 ? 2 : 1;
    const S = { W, H, pop: new Float32Array(N), level: new Uint8Array(N), walls: new Uint8Array(N), special: new Uint16Array(N), infra: new Uint8Array(N), land: new Uint8Array(N).fill(1), elev: new Uint8Array(N).fill(20), flags: new Uint8Array(N), year: 1950, works: new Map(), rubble: new Map(), civs: [] };
    S.pop[i] = popK; S.level[i] = lvl; S.special[i] = 14; S.walls[i] = era >= 1 && era <= 5 && lvl >= 2 ? 1 : 0;
    const fE = found === null ? Math.min(era, 2) : Math.min(era, found);
    const rec = [-5000, fE, i, era >= 6 && lvl >= 3 ? Math.round(Math.log2(popK * 1000 * 0.5 + 1) * 3) : 0, S.walls[i] ? Math.round(Math.log2(popK * 1000 * 0.7 + 1) * 3) : 0];
    S.townRec = () => rec;
    const c = { id: 0, era, tech: ERA_TECH[era], capital: i, home: i, eraSince: -2000 };
    TOWN.clearCache(); PLOTS.clear();
    const t0 = Date.now(); const L = TOWN.layout(S, i, c, { coarse: false }); const ms = Date.now() - t0;
    const k = L.k; const ext = Math.max(L.Rt * 1.25, 60); const mpp = ext * 2 / SZ;      // metres a pixel
    const img = new PNG({ width: SZ, height: SZ }); const D = img.data;
    const bg = era >= 7 ? [196, 200, 190] : [204, 214, 178]; for (let p = 0; p < SZ * SZ; p++) { D[p * 4] = bg[0]; D[p * 4 + 1] = bg[1]; D[p * 4 + 2] = bg[2]; D[p * 4 + 3] = 255; }
    const put = (px, py, rgb, a) => { if (px < 0 || py < 0 || px >= SZ || py >= SZ) return; const o = (py * SZ + px) * 4; a = a === undefined ? 1 : a; D[o] = D[o] * (1 - a) + rgb[0] * a; D[o + 1] = D[o + 1] * (1 - a) + rgb[1] * a; D[o + 2] = D[o + 2] * (1 - a) + rgb[2] * a; };
    const toPx = (x, z) => [SZ / 2 + x / mpp, SZ / 2 - z / mpp];
    const rect = (x, z, w, d, yaw, rgb, a, edge) => {      // a rotated rectangle in true metres: w along (cos yaw, sin yaw), d across it
      const cx = Math.cos(yaw), sx = Math.sin(yaw); const hw = Math.max(w, mpp) / 2, hd = Math.max(d, mpp) / 2;
      const R = Math.hypot(hw, hd) / mpp + 1; const [px0, py0] = toPx(x, z);
      for (let py = Math.floor(py0 - R); py <= py0 + R; py++) for (let px = Math.floor(px0 - R); px <= px0 + R; px++) {
        const X = (px + 0.5 - SZ / 2) * mpp - x, Z = (SZ / 2 - py - 0.5) * mpp - z; const u = X * cx + Z * sx, v = -X * sx + Z * cx;
        if (Math.abs(u) <= hw && Math.abs(v) <= hd) { const e = edge && (hw - Math.abs(u) < mpp * 0.9 || hd - Math.abs(v) < mpp * 0.9); put(px, py, e ? rgb.map((q) => q * 0.62) : rgb, a); }
      } };
    const line = (x0, z0, x1, z1, hw, rgb) => { const L2 = Math.hypot(x1 - x0, z1 - z0); if (L2 < 1e-6) return; rect((x0 + x1) / 2, (z0 + z1) / 2, L2 + hw, hw * 2, Math.atan2(z1 - z0, x1 - x0), rgb, 1); };
    // the town's parks and the streets, then the walls, then what stands
    for (const pk of L.parks || []) { const [x, z, r] = [pk[0] / k, pk[1] / k, pk[2] / k]; rect(x, z, r * 1.8, r * 1.8, 0, [150, 186, 120], 0.8); }
    const stc = hexRGB(era >= 7 ? KIND.road7 : KIND.street);
    for (const s of L.streets) line(s[0] / k, s[1] / k, s[2] / k, s[3] / k, s[4] / k, stc);
    for (const wv of L.walls || []) { const a = wv.a !== undefined ? wv.a : 0; rect(wv.x / k, wv.z / k, (wv.len || 6) / k, 2.5, a, hexRGB(KIND.wall), 1); }
    let nVh = 0, nModel = 0, nProp = 0;
    const ordered = L.items.slice().sort((a, b) => (a.prop ? 1 : 0) - (b.prop ? 1 : 0));
    for (const it of ordered) {
      const x = it.x / k, z = it.z / k, w = it.w / k, d = it.d / k;
      if (it.kind === 'vh') { nVh++; const ox = it.ofx !== undefined ? it.ofx / k : 0, oz = it.ofz !== undefined ? it.ofz / k : 0; const cy = Math.cos(it.yaw), sy = Math.sin(it.yaw); const roof = it.pal ? it.pal[4] : it.color; rect(x + ox * cy - oz * -sy, z + ox * sy + oz * cy, w, d, it.yaw, hexRGB(roof), 1, true); continue; }
      if (it.prop) { nProp++; rect(x, z, Math.max(w, 1), Math.max(d, 1), it.yaw || 0, it.kind === 'field' || it.kind === 'beds' ? hexRGB(KIND.field) : hexRGB(it.color || KIND.prop), 0.9); continue; }
      nModel++; const great = (it.style >> 10) & 9; rect(x, z, w, d, it.yaw || 0, great ? hexRGB(KIND.great) : hexRGB(it.color || KIND.model), 1, true);
    }
    // a scale bar of 100 m in the corner
    for (let px = 10; px < 10 + 100 / mpp; px++) for (let py = SZ - 14; py < SZ - 10; py++) put(Math.round(px), py, [30, 30, 30]);
    const file = `shots/towns/plan_${name}_e${era}_${popK}k.png`; fs.writeFileSync(file, PNG.sync.write(img)); tiles.push({ file, img });
    // how much of its ground the buildings cover, in its middle third, the third about it and the third at its edge (an old town's
    // middle a third and more, a medina's half to four fifths, a village's edge a twentieth)
    const cov = [0, 0, 0]; for (const it of L.items) { if (it.prop && it.kind !== 'vh') continue; const r = Math.hypot(it.x / k, it.z / k) / L.Rt; const b = r < 1 / 3 ? 0 : r < 2 / 3 ? 1 : r < 1 ? 2 : -1; if (b >= 0) cov[b] += (it.w / k) * (it.d / k); }
    const bandA = [1, 3, 5].map((m) => Math.PI * L.Rt * L.Rt * m / 9), covS = cov.map((a, b) => Math.round(a / bandA[b] * 100) + '%').join(' ');
    console.log(`${name.padEnd(9)} e${era} ${String(popK).padStart(5)}k ${L.morph.padEnd(8)} R ${String(Math.round(L.Rt)).padStart(5)} m  n ${String(L.n).padStart(5)} houses ${String(nVh).padStart(5)} models ${String(nModel).padStart(4)} props ${String(nProp).padStart(5)}  covered ${covS}  ${ms} ms  -> ${file}  (100 m = ${Math.round(100 / mpp)} px)`);
  }
}
// all of them on one sheet, four across, at half size
const T = SZ / 2, cols = Math.min(4, tiles.length), rows = Math.ceil(tiles.length / cols); const sheet = new PNG({ width: cols * T, height: rows * T });
tiles.forEach((t, n) => { const ox = (n % cols) * T, oy = Math.floor(n / cols) * T; for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const s = ((y * 2) * SZ + x * 2) * 4, o = ((oy + y) * cols * T + ox + x) * 4; for (let q = 0; q < 4; q++) sheet.data[o + q] = t.img.data[s + q]; } });
fs.writeFileSync('shots/towns/plan_sheet.png', PNG.sync.write(sheet)); console.log('shots/towns/plan_sheet.png');
