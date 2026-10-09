// What the land feeds, measured against history: how intensely each kind of land is farmed (FIT in src/land.js, between its
// marks) is moved until each of Maddison's ten regions (tools/people/regions.js) holds its share of the world's people at AD 1,
// 1000, 1500, 1700 and 1820, the centuries before the factories, when the land and its farming said where people lived.
//   node tools/people/landfit.js [seed,seed] [--fit N] [--write]
// Each round runs the worlds side by side (one process a seed), says by how much each region is over or short of its share,
// and moves each kind of land by the regions it feeds, weighed by how many of each region's people live on it: how intensely its
// farmland is farmed by the people who live by farming it, what it gives by the people who live off it without (a cell feeds
// whichever is more), and what the Americas and Australia farm with by the people of their realms that have not met the old
// world (a least-squares step, damped by half: the world answers a change in one with changes in all). The best round is kept;
// --write puts it in. What the whole world numbers is not this tool's: tools/know/people.js fits the table of food after it.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const cp = require('child_process');
const args = process.argv.slice(2);
const RX = /\/\* LAND:BEGIN \*\/\s*const FIT = (\{[\s\S]*?\});\s*\/\* LAND:END \*\//; const landSrc = fs.readFileSync(path.join(root, 'src/land.js'), 'utf8');
const m0 = RX.exec(landSrc); if (!m0) throw new Error('no LAND marks in src/land.js');
const parseFit = (txt) => JSON.parse(txt.replace(/([a-z]+):/g, '"$1":'));
const showFit = (F) => '{ ' + Object.entries(F).map(([k, [i, f]]) => `${k}: [${+i.toPrecision(3)}, ${+f.toPrecision(3)}]`).join(', ') + ' }';
const DATES = [1, 1000, 1500, 1700, 1820];
const HIST = { 1: [24.7, 4.75, 3.9, 1.17, 5.6, 3.0, 59.6, 75.0, 36.6, 16.5], 1000: [25.4, 6.5, 7.1, 1.96, 11.4, 7.5, 59.0, 75.0, 41.4, 33.0], 1500: [57.3, 13.5, 16.95, 2.8, 17.5, 15.4, 103.0, 110.0, 55.4, 46.6],
  1700: [81.5, 18.8, 26.55, 1.75, 12.05, 27.0, 138.0, 165.0, 71.8, 61.1], 1820: [133.0, 36.5, 54.8, 11.2, 21.2, 31.0, 381.0, 209.0, 89.4, 74.2] };
const SHORT = ['W.Eur', 'E.Eur', 'USSR', 'Offsh', 'LatAm', 'Japan', 'China', 'India', 'O.Asia', 'Africa'], NR = 10, NC = 16;

if (args[0] === '--worker') {
  // one world: the people of each region at each date, and of each kind of land within each region
  const seed = +args[1], F = parseFit(process.env.LANDFIT);
  const W = 720, H = 360, N = W * H; const PNG = require(path.join(root, 'node_modules/pngjs')).PNG; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
  const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
  for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
  { const sp = PNG.sync.read(fs.readFileSync(path.join(root, 'data/soil.png'))); wd.soil = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { wd.soil[i * 3] = sp.data[i * 4]; wd.soil[i * 3 + 1] = sp.data[i * 4 + 1]; wd.soil[i * 3 + 2] = sp.data[i * 4 + 2]; } }
  for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'disease']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
  (0, eval)(landSrc.replace(m0[0], `/* LAND:BEGIN */ const FIT = ${showFit(F)}; /* LAND:END */`)); (0, eval)(fs.readFileSync(path.join(root, 'src/sim.js'), 'utf8'));
  const RP = PNG.sync.read(fs.readFileSync(path.join(__dirname, 'regions.png'))); const REG = new Uint8Array(N); for (let i = 0; i < N; i++) REG[i] = RP.data[i * 4];
  const sim = window.createSim(wd, seed);
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.homeOf(i); if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  const out = []; let k = 0;
  while (k < DATES.length) { sim.tick(); if (sim.year < DATES[k]) continue;
    // (each region's people by kind of land, those who live by farming it and those who live off it without; and those of realms
    //  of the Americas and Australia that farm without the old world's beasts and crops)
    const r = new Array(NR).fill(0), rk = new Array(NR * NC).fill(0), rw = new Array(NR * NC).fill(0), ra = new Array(NR).fill(0); let world = 0;
    for (const i of sim.LI) { const p = sim.pop[i]; if (!(p > 0)) continue; world += p; const g = REG[i]; if (g >= NR) continue; r[g] += p; const o = sim.owner[i], c = o >= 0 ? sim.civs[o] : null, k = sim.landClass(i);
      if (!c || sim.forageCap(i) >= sim.capacity(i, c) * 0.999) rw[g * NC + k] += p; else { rk[g * NC + k] += p; if (sim.apart(o)) ra[g] += p; } }
    out.push({ y: DATES[k], world, r, rk, rw, ra }); k++; }
  process.stdout.write(JSON.stringify(out)); process.exit(0);
}

const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345,777').split(',').map(Number);
const fitN = args.includes('--fit') ? +(args[args.indexOf('--fit') + 1] || 3) : 0; const write = args.includes('--write');
const KEYS = Object.keys(parseFit(m0[1])); const CLS = ['sea', 'ice', 'tundra', 'boreal', 'desert', 'steppe', 'grass', 'ocwood', 'medit', 'monsoon', 'savanna', 'rain', 'high', 'plateau', 'cowood', 'tasia'];
const runAll = (F) => Promise.all(seeds.map((seed) => new Promise((res, rej) => { const p = cp.spawn(process.execPath, [__filename, '--worker', String(seed)], { env: Object.assign({}, process.env, { LANDFIT: JSON.stringify(F) }) }); let o = '', e = ''; p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (e += d)); p.on('close', (code) => (code === 0 ? res(JSON.parse(o)) : rej(new Error(e.slice(-800))))); })));
(async () => {
  let F = parseFit(m0[1]); let best = null; const t0 = Date.now();
  for (let it = 0; it <= fitN; it++) {
    const runs = await runAll(F);
    // each region's share over history's, in logarithms, by date and on the whole; how many of each region's people live on each kind of land
    const res = new Array(NR).fill(0), wts = new Array(NR * NC).fill(0), wtw = new Array(NR * NC).fill(0), wta = new Array(NR).fill(0); let score = 0, n = 0;
    const lines = [];
    for (let d = 0; d < DATES.length; d++) { const h = HIST[DATES[d]], hw = h.reduce((a, b) => a + b, 0); const ratio = new Array(NR).fill(0);
      for (const run of runs) { const x = run[d]; for (let g = 0; g < NR; g++) { const lr = Math.log(Math.max(1e-6, x.r[g] / x.world) / (h[g] / hw)); ratio[g] += lr / runs.length; res[g] += lr / (runs.length * DATES.length); const q = (runs.length * DATES.length) * Math.max(1e-9, x.r[g]);
        for (let k = 0; k < NC; k++) { wts[g * NC + k] += x.rk[g * NC + k] / q; wtw[g * NC + k] += x.rw[g * NC + k] / q; } wta[g] += x.ra[g] / q; } }
      for (let g = 0; g < NR; g++) { score += ratio[g] * ratio[g]; n++; }
      lines.push(`  ${String(DATES[d]).padStart(5)} ${ratio.map((v) => Math.exp(v).toFixed(2).padStart(6)).join('')}`); }
    score = Math.sqrt(score / n);
    console.log(`\nround ${it}: the share of each region over history's (${seeds.join(', ')}), off by ${Math.exp(score).toFixed(3)} on the whole (${((Date.now() - t0) / 1000).toFixed(0)} s)\n        ${SHORT.map((s) => s.padStart(6)).join('')}\n${lines.join('\n')}\n  table ${showFit(F)}`);
    if (!best || score < best.score) best = { score, F: JSON.parse(JSON.stringify(F)) };
    if (it === fitN) break;
    // the step: minimise sum over regions (res + sum over the unknowns of w * d)^2 + lambda d^2. The unknowns: each kind's farming
    // (weighed by the region's people who live by it), each kind's foraging (by those who live off it), the Americas' beasts and crops
    const kinds = KEYS.filter((key) => key !== 'worlds'); const use = kinds.map((key) => CLS.indexOf(key)); const NK = use.length, M = 2 * NK + 1, lam = 0.08;
    const wOf = (g, p) => (p < NK ? wts[g * NC + use[p]] : p < 2 * NK ? wtw[g * NC + use[p - NK]] : wta[g]);
    const A = Array.from({ length: M }, () => new Array(M).fill(0)), b = new Array(M).fill(0);
    for (let g = 0; g < NR; g++) for (let p = 0; p < M; p++) { const wp = wOf(g, p); b[p] -= wp * res[g]; for (let q = 0; q < M; q++) A[p][q] += wp * wOf(g, q); }
    for (let p = 0; p < M; p++) A[p][p] += lam;
    // (Gauss-Jordan: fourteen unknowns)
    for (let c = 0; c < M; c++) { let piv = c; for (let r = c + 1; r < M; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r; [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
      for (let r = 0; r < M; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let q = c; q < M; q++) A[r][q] -= f * A[c][q]; b[r] -= f * b[c]; } }
    const d = b.map((v, p) => Math.max(-0.7, Math.min(0.7, 0.5 * v / A[p][p])));
    kinds.forEach((key, p) => { F[key][0] *= Math.exp(d[p]); F[key][1] *= Math.exp(d[NK + p]); });
    F.worlds[0] = Math.min(1, F.worlds[0] * Math.exp(d[2 * NK]));
  }
  console.log(`\nthe best: off by ${Math.exp(best.score).toFixed(3)}\n  ${showFit(best.F)}`);
  if (write) { const src = fs.readFileSync(path.join(root, 'src/land.js'), 'utf8'); fs.writeFileSync(path.join(root, 'src/land.js'), src.replace(RX, `/* LAND:BEGIN */\n  const FIT = ${showFit(best.F)};\n  /* LAND:END */`)); console.log('written into src/land.js'); }
})().catch((e) => { console.error(e); process.exit(1); });
