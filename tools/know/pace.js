// The pace of history: when the first realm reaches each age, how the rest follow, how many people there are.
//   node tools/know/pace.js [seed[,seed...]] [--fit N] [--write]
// History's dates are those of whoever was first (the Bronze Age began where bronze was first cast), so the measure is
// the most learned realm of each year. While it leads nobody teaches it: it moves by RATE for its age times what it
// adds itself (its people, academies, scholars, ruler, what it knows). That factor is measured year by year, and with
// --fit each age's RATE is set to (the age's length in knowledge) / (the years history gave it) / (the factor), N times
// over, with the mean of the seeds (one world's dates swing by a century on a hair). --write puts the table between
// the RATE marks in src/sim.js.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number); const fitN = args.includes('--fit') ? +(args[args.indexOf('--fit') + 1] || 3) : 0; const write = args.includes('--write');
const TARGET = [-3300, -1200, -500, 500, 1400, 1760, 1900, 1970, 2030];      // the year the realms in front enter each age after the first, and the year they have learned everything
(0, eval)(fs.readFileSync(path.join(root, 'src/econ.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/know.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/rule.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/diplo.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/army.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/people.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/faith.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/culture.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/finance.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/dynasty.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/story.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/legacy.js'), 'utf8'));
const simSrc = fs.readFileSync(path.join(root, 'src/sim.js'), 'utf8');
const m = /\/\* RATE:BEGIN \*\/\s*const RATE = \[([^\]]*)\];\s*\/\* RATE:END \*\//.exec(simSrc); if (!m) throw new Error('no RATE marks in src/sim.js');
let RATE = m[1].split(',').map(Number);
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
function run1(rate, until, quiet, seed) {
  (0, eval)(simSrc.replace(m[0], `const RATE = [${rate.join(', ')}];`));
  const sim = window.createSim(wd, seed); const K = window.KNOW;
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  const reached = new Array(9).fill(null), near = new Array(9).fill(null), half = new Array(9).fill(null), mSum = new Array(9).fill(0), mN = new Array(9).fill(0), tSum = new Array(9).fill(0); let t00 = 0; const dates = [-8000, -6000, -4000, -3000, -2000, -1000, -500, 0, 500, 1000, 1400, 1600, 1800, 1900, 1950, 2000, 2050]; let k = 0; const t0 = Date.now(); const rows = [];
  while (sim.year < until) {
    sim.tick();
    // the realms in front: the tenth most learned of them (one prodigy is not history)
    const ts = []; let pop = 0, mt = 0, top = null; for (const c of sim.civs) if (c) { ts.push(c.tech); pop += sim.popOf[c.id]; mt += c.tech * sim.popOf[c.id]; if (!top || c.tech > top.tech) top = c; } ts.sort((a, b) => b - a); const first = ts[0] || 0, front = ts[Math.min(ts.length - 1, Math.max(0, Math.round(ts.length * 0.05)))] || 0, mid = ts[ts.length >> 1] || 0;
    if (!t00) t00 = first;
    for (let e = 1; e <= 9; e++) { if (reached[e - 1] === null && first >= K.ERA_AT[e] - 1e-9) reached[e - 1] = sim.year; if (near[e - 1] === null && front >= K.ERA_AT[e] - 1e-9) near[e - 1] = sim.year; if (half[e - 1] === null && mid >= K.ERA_AT[e] - 1e-9) half[e - 1] = sim.year; }
    // what the realm in front adds to its age's pace (while it has not learned everything)
    // (without what the calendar adds or takes: the table is to be right when the calendar has nothing to correct)
    if (top && top.tech < 1) { const e = sim.eraOf(top.tech); const ip = sim.insightParts(top); mSum[e] += ip.total / ip.time / rate[e]; mN[e]++; tSum[e] += ip.time; }
    if (k < dates.length && sim.year >= dates[k]) { k++; let n = 0, known = 0, best = 0, st = 0, ls = 0; for (const c of sim.civs) if (c) { n++; known += sim.know.count[c.id]; best = Math.max(best, sim.know.count[c.id]); st += c.stability; ls += sim.market.LS[c.id]; }
      rows.push(`${String(sim.year).padStart(6)}: realms ${String(n).padStart(3)}  people ${(pop / 1000).toFixed(1).padStart(7)} m  first ${first.toFixed(3)} (${sim.ERAS[sim.eraOf(first)][0]})  one in twenty ${front.toFixed(3)}  middle ${mid.toFixed(3)}  mean ${(mt / Math.max(1, pop)).toFixed(3)}  known ${(known / n).toFixed(0)} (most ${best})  calm ${(st / n).toFixed(2)}  living ${(ls / n).toFixed(2)}  | ${((Date.now() - t0) / 1000).toFixed(0)} s`); }
  }
  if (!quiet) for (const r of rows) console.log(r);
  return { reached, near, half, m: mSum.map((v, e) => mN[e] ? v / mN[e] : null), time: tSum.map((v, e) => mN[e] ? v / mN[e] : null), t00 };
}
// every seed's world, and the mean of their dates (an age some world did not reach counts as not reached)
function run(rate, until, quiet) {
  const all = seeds.map((sd, k) => { if (!quiet && seeds.length > 1) console.log(`seed ${sd}`); return run1(rate, until, quiet, sd); });
  const mean = (key) => all[0][key].map((_, e) => all.some((r) => r[key][e] === null) ? null : Math.round(all.reduce((a, r) => a + r[key][e], 0) / all.length));
  const m = all[0].m.map((_, e) => { const vs = all.map((r) => r.m[e]).filter((v) => v !== null); return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null; });
  const time = all[0].time.map((_, e) => { const vs = all.map((r) => r.time[e]).filter((v) => v !== null); return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null; });
  if (!quiet && all.length > 1) all.forEach((r, k) => console.log(`seed ${seeds[k]}: the first realm enters ${r.reached.map((y) => y === null ? '—' : y).join(', ')}`));
  return { reached: mean('reached'), near: mean('near'), half: mean('half'), m, time, t00: all.reduce((a, r) => a + r.t00, 0) / all.length };
}
const show = (r) => console.log('the first realm enters: ' + r.reached.map((y, e) => `${e < 8 ? window.createSimNames[e + 1] : 'all known'} ${y === null ? '—' : y} (${TARGET[e]})`).join(', ') + '\none realm in twenty:    ' + r.near.map((y) => y === null ? '—' : y).join(', ') + '\nthe middle realm:       ' + r.half.map((y) => y === null ? '—' : y).join(', ') + '\nwhat the first adds to its age: ' + r.m.map((v) => v === null ? '—' : v.toFixed(2)).join(', ') + '\nwhat the calendar makes of it:  ' + r.time.map((v) => v === null ? '—' : v.toFixed(2)).join(', '));
window.createSimNames = ['Stone', 'Bronze', 'Iron', 'Classical', 'Medieval', 'Renaissance', 'Industrial', 'Modern', 'Information'];
let res = run(RATE, 2060, !!fitN); show(res);
for (let it = 0; it < fitN; it++) {
  // each age's pace: its length in knowledge, over the years history gave it, over what the realm in front adds
  const next = RATE.slice(); const KA = window.KNOW.ERA_AT;
  for (let e = 0; e < 9; e++) { if (res.m[e] === null) continue; const band = KA[e + 1] - (e ? KA[e] : res.t00), years = TARGET[e] - (e ? TARGET[e - 1] : -10000); next[e] = band / years / res.m[e]; }
  RATE = next.map((v) => +v.toPrecision(3)); console.log(`\nfit ${it + 1}: RATE = [${RATE.join(', ')}]`); res = run(RATE, 2060, it < fitN - 1); show(res);
}
// (the file may have been worked on while the worlds ran: only the table between the marks is replaced, in the file as it is now)
if (write && fitN) { const p = path.join(root, 'src/sim.js'); const now = fs.readFileSync(p, 'utf8'); const mm = /\/\* RATE:BEGIN \*\/[\s\S]*?\/\* RATE:END \*\//.exec(now); if (!mm) throw new Error('no RATE marks in src/sim.js'); fs.writeFileSync(p, now.replace(mm[0], `/* RATE:BEGIN */\n  const RATE = [${RATE.join(', ')}];\n  /* RATE:END */`)); console.log('written to src/sim.js'); }
