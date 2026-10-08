// The people on Earth through history: how many the simulation has against how many there were.
//   node tools/know/people.js [seed[,seed...]] [--fit N] [--write]
// With --fit it moves the table of how many people a unit of land feeds (FOOD in src/sim.js, between its marks) toward
// history's count, N times over: for every date the world is short or over by some ratio, and each point of the table
// is moved by the ratios of the dates at which people lived by it (weighted by how many did). --write puts it in.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number); const fitN = args.includes('--fit') ? +(args[args.indexOf('--fit') + 1] || 3) : 0; const write = args.includes('--write');
// millions of people, from the usual reconstructions (McEvedy and Jones, HYDE, the UN's counts and its middle projection)
const REAL = [[-10000, 4], [-8000, 5], [-6000, 9], [-5000, 13], [-4000, 18], [-3000, 28], [-2000, 45], [-1000, 80], [-500, 120], [0, 220], [500, 205], [1000, 285], [1300, 400], [1400, 360], [1500, 460], [1600, 560], [1700, 640], [1800, 970], [1850, 1260], [1900, 1650], [1950, 2520], [1975, 4070], [2000, 6140], [2025, 8200], [2050, 9700]];
const real = (y) => { if (y <= REAL[0][0]) return REAL[0][1]; for (let k = 1; k < REAL.length; k++) if (y <= REAL[k][0]) { const [a, va] = REAL[k - 1], [b, vb] = REAL[k]; return Math.exp(Math.log(va) + (Math.log(vb) - Math.log(va)) * (y - a) / (b - a)); } return REAL[REAL.length - 1][1]; };
const DATES = []; for (let y = -9000; y <= -1000; y += 500) DATES.push(y); for (let y = -750; y <= 1000; y += 250) DATES.push(y); for (let y = 1100; y <= 1700; y += 100) DATES.push(y); for (let y = 1750; y <= 2050; y += 25) DATES.push(y);
(0, eval)(fs.readFileSync(path.join(root, 'src/econ.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/know.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/rule.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/diplo.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/army.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/people.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/faith.js'), 'utf8'));
const simSrc = fs.readFileSync(path.join(root, 'src/sim.js'), 'utf8');
const RX = /\/\* FOOD:BEGIN \*\/\s*const FOOD = (\[\[[\s\S]*?\]\]);\s*\/\* FOOD:END \*\//; const m = RX.exec(simSrc); if (!m) throw new Error('no FOOD marks in src/sim.js');
let FOOD = JSON.parse(m[1]);
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
const show = (f) => '[' + f.map(([t, v]) => `[${t}, ${+v.toPrecision(3)}]`).join(', ') + ']';
function run1(food, seed) {
  (0, eval)(simSrc.replace(m[0], `const FOOD = ${show(food)};`));
  const sim = window.createSim(wd, seed);
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  const NJ = food.length; const out = []; let k = 0;
  // the weight of each point of the table at a date: the people who live by it (the two points either side of their realm's knowledge)
  const weights = () => { const w = new Float64Array(NJ); let tot = 0, wild = 0; for (const i of sim.LI) { const p = sim.pop[i]; if (!(p > 0)) continue; tot += p; const o = sim.owner[i]; const t = o >= 0 && sim.civs[o] ? sim.civs[o].tech : 0; if (o < 0) wild += p; let j = 0; while (j < NJ - 2 && t > food[j + 1][0]) j++; const a = food[j][0], b = food[j + 1][0]; const f = Math.min(1, Math.max(0, (t - a) / (b - a))); w[j] += p * (1 - f); w[j + 1] += p * f; } return { w, tot, wild }; };
  while (k < DATES.length) { sim.tick(); if (sim.year < DATES[k]) continue; const r = weights(); let mt = 0, pp = 0; for (const c of sim.civs) if (c) { mt += c.tech * sim.popOf[c.id]; pp += sim.popOf[c.id]; } out.push({ y: DATES[k], pop: r.tot / 1000, wild: r.wild / 1000, w: r.w, mean: pp ? mt / pp : 0 }); k++; }
  return out;
}
function run(food, quiet) {
  const all = seeds.map((sd) => run1(food, sd)); const res = DATES.map((y, d) => ({ y, pop: all.reduce((a, r) => a + r[d].pop, 0) / all.length, wild: all.reduce((a, r) => a + r[d].wild, 0) / all.length, mean: all.reduce((a, r) => a + r[d].mean, 0) / all.length, w: all[0][d].w.map((_, j) => all.reduce((a, r) => a + r[d].w[j], 0) / all.length) }));
  if (!quiet) for (const r of res) if (r.y % 500 === 0 || r.y >= 1000) console.log(`${String(r.y).padStart(6)}: ${r.pop.toFixed(1).padStart(8)} m (of them ${r.wild.toFixed(1)} m in no realm)   history ${real(r.y).toFixed(0).padStart(5)} m   ${(r.pop / real(r.y)).toFixed(2)}x   mean knowledge ${r.mean.toFixed(3)}`);
  let err = 0; for (const r of res) err += Math.abs(Math.log(r.pop / real(r.y))); console.log(`mean error: a factor of ${Math.exp(err / res.length).toFixed(3)}`);
  return res;
}
let res = run(FOOD, !!fitN);
for (let it = 0; it < fitN; it++) {
  const next = FOOD.map(([t, v], j) => { let a = 0, b = 0; for (const r of res) { const w = r.w[j]; if (!(w > 0)) continue; a += w * Math.log(real(r.y) / r.pop); b += w; } return [t, b > 0 ? v * Math.exp(0.8 * a / b) : v]; });
  for (let j = 1; j < next.length; j++) if (next[j][1] < next[j - 1][1] * 1.02) next[j][1] = next[j - 1][1] * 1.02;      // (more knowledge never feeds fewer)
  FOOD = next.map(([t, v]) => [t, +v.toPrecision(3)]); console.log(`\nfit ${it + 1}: FOOD = ${show(FOOD)}`); res = run(FOOD, it < fitN - 1);
}
if (write && fitN) { const p = path.join(root, 'src/sim.js'); const now = fs.readFileSync(p, 'utf8'); const mm = RX.exec(now); if (!mm) throw new Error('no FOOD marks in src/sim.js'); fs.writeFileSync(p, now.replace(mm[0], `/* FOOD:BEGIN */\n  const FOOD = ${show(FOOD)};\n  /* FOOD:END */`)); console.log('written to src/sim.js'); }
