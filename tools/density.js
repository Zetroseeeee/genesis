// How much of a town's ground its houses cover once the real models stand on the plan (the world's own fitting rule:
// a house is skipped if its model would stand in a neighbour's).   node tools/density.js [eras, default 1] [cultures]
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const fs = require('fs'); const PNG = require('pngjs').PNG;
require('../src/geo.js'); (0, eval)(fs.readFileSync('src/town.js', 'utf8')); (0, eval)(fs.readFileSync('src/econ.js', 'utf8')); (0, eval)(fs.readFileSync('src/know.js', 'utf8')); (0, eval)(fs.readFileSync('src/rule.js', 'utf8')); (0, eval)(fs.readFileSync('src/diplo.js', 'utf8')); (0, eval)(fs.readFileSync('src/army.js', 'utf8')); (0, eval)(fs.readFileSync('src/people.js', 'utf8')); (0, eval)(fs.readFileSync('src/faith.js', 'utf8')); (0, eval)(fs.readFileSync('src/culture.js', 'utf8')); (0, eval)(fs.readFileSync('src/finance.js', 'utf8')); (0, eval)(fs.readFileSync('src/dynasty.js', 'utf8')); (0, eval)(fs.readFileSync('src/story.js', 'utf8')); (0, eval)(fs.readFileSync('src/sim.js', 'utf8'));
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync('data/world.png'));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
const idx = JSON.parse(fs.readFileSync('data/models/index.json', 'utf8')); const CULT = window.TOWN.CULTURES;
const byKind = {}; for (const id in idx.models) { const e = idx.models[id]; const use = (kinds, eras, cultures) => { for (const k of kinds) (byKind[k] = byKind[k] || []).push({ def: Object.assign({ id }, e), eras, cultures }); }; use(e.kinds || [], e.eras || [0, 8], e.cultures); for (const a of e.also || []) use(a.kinds || [], a.eras || e.eras || [0, 8], a.cultures || e.cultures); }
const hash = (i, k) => { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const pick = (kind, era, cul, seed) => { const ok = (byKind[kind] || []).filter((u) => era >= u.eras[0] && era <= u.eras[1] && (!u.cultures || u.cultures.includes(CULT[cul]))); return ok.length ? ok[Math.min(ok.length - 1, Math.floor((seed - Math.floor(seed)) * ok.length))].def : null; };
const SITES = { med: [22.4, 38.2], north: [10, 52], east: [37, 52], mena: [44.4, 32.5], africa: [0, 10], sasia: [80, 26], easia: [113, 35], seasia: [104, 14], america: [-99, 19.3], namerica: [-90, 38.6] };
const TECH = [0, 0.1, 0.2, 0.33, 0.45, 0.58, 0.7, 0.85, 0.97];
const eras = (process.argv[2] || '1').split(',').map(Number); const only = process.argv[3] ? process.argv[3].split(',') : null;
for (const era of eras) for (const name of Object.keys(SITES)) {
  if (only && !only.includes(name)) continue;
  const [lon, lat] = SITES[name]; const sim = createSim(wd, 7); const i = Math.floor((90 - lat) / 180 * H) * W + Math.floor((lon + 180) / 360 * W);
  const c = sim.setPlayer(i, 'T', [0.5, 0.5]); if (!c) continue;
  c.tech = TECH[era]; c.era = sim.eraOf(c.tech); sim.pop[c.capital] = 8; sim.walls[c.capital] = 2; sim.special[c.capital] |= 2 | 4 | 8; for (let t = 0; t < 3; t++) sim.tick(); c.eraSince = sim.year - 200;
  const L = window.TOWN.layout(sim, c.capital, c, {}); const cul = L.culture; const kRep = L.k; const items = L.items;
  // the world's fitting rule (world.js modelFit / fitHouses)
  const fitOf = (B, it, flags) => { const landmark = flags & 1; const turn = !landmark && ((B.d > B.w * 1.2 && it.w > it.d * 1.2) || (B.w > B.d * 1.2 && it.d > it.w * 1.2)); const pw = turn ? it.d : it.w, pd = turn ? it.w : it.d; const f = Math.min(pw / (B.w * kRep), pd / (B.d * kRep)); return { turn, u: kRep * Math.max(landmark ? 0.75 : 0.8, Math.min((flags & 8) ? 2.2 : landmark ? 1.4 : 1.25, f)) }; };
  const rectOf = (def, it, flags) => { const f = fitOf(def, it, flags); const yaw = it.yaw + (f.turn ? Math.PI / 2 : 0); const hw = def.w * f.u * 0.45, hd = def.d * f.u * 0.45; return { x: it.x, z: it.z, ax: Math.cos(yaw), az: Math.sin(yaw), hw, hd, r: Math.hypot(hw, hd), area: def.w * f.u * def.d * f.u }; };
  const span = (R, a, b) => R.hw * Math.abs(a * R.ax + b * R.az) + R.hd * Math.abs(a * R.az - b * R.ax);
  const apart = (P, Q, a, b) => Math.abs((Q.x - P.x) * a + (Q.z - P.z) * b) > span(P, a, b) + span(Q, a, b);
  const overlap = (P, Q) => { const dx = Q.x - P.x, dz = Q.z - P.z; if (dx * dx + dz * dz > (P.r + Q.r) * (P.r + Q.r)) return false; return !(apart(P, Q, P.ax, P.az) || apart(P, Q, P.az, -P.ax) || apart(P, Q, Q.ax, Q.az) || apart(P, Q, Q.az, -Q.ax)); };
  const rects = []; const great = (it) => (Math.floor(it.style / 1024) & 1) || it.as || it.tag;
  const defOf = (it, k) => (it.as && pick(it.as, L.era, cul, hash(c.capital, 4000 + k))) || pick(it.kind, L.era, cul, hash(c.capital, 4000 + k));
  items.forEach((it, k) => { if (!great(it)) return; const def = defOf(it, k); if (!def || def.fit === 'run' || def.fit === 'gate') return; rects.push(rectOf(def, it, Math.floor(it.style / 1024))); });
  let planned = 0, kept = 0, area = 0; const inR = L.R * 0.7;
  items.forEach((it, k) => { if (great(it)) return; const flags = Math.floor(it.style / 1024); if (flags & 18) return; const def = defOf(it, k); if (!def || def.fit) return; if (Math.hypot(it.x, it.z) > inR) return; planned++;
    const R = rectOf(def, it, flags); for (const Q of rects) if (overlap(R, Q)) return; rects.push(R); kept++; area += R.area; });
  console.log(`${name.padEnd(9)} era ${c.era}: R ${Math.round(L.Rt)} m true, drawn x${kRep.toFixed(1)}; within 0.7R: ${planned} house plots, ${kept} stand (${Math.round(kept / planned * 100)}%), covering ${Math.round(area / (Math.PI * inR * inR) * 100)}% of the ground`);
}
