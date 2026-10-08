// The world's economy through the ages, in numbers: prices, shortages, work, trade, how well people live.
//   node tools/econ/probe.js [seed] [last year, default 2000] [goods to follow, comma separated keys]
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const fs = require('fs'); const path = require('path'); const PNG = require('pngjs').PNG; const root = path.join(__dirname, '..', '..');
(0, eval)(fs.readFileSync(path.join(root, 'src/econ.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/know.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/rule.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/diplo.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/army.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/people.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/sim.js'), 'utf8'));
const E = window.ECON; const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
const seed = +(process.argv[2] || 12345), last = +(process.argv[3] || 2000); const follow = (process.argv[4] || '').split(',').filter(Boolean);
const sim = createSim(wd, seed); const M = sim.market; const NG = E.NG, NC = E.NC, NR = E.NR;
{ let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
const t0 = Date.now(); let next = -9000, tMarket = 0, nMarket = 0;
const step0 = M.step; M.step = function (o) { const t = process.hrtime.bigint(); step0(o); tMarket += Number(process.hrtime.bigint() - t) / 1e6; nMarket++; };
const f2 = (v) => v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
while (sim.year < last) {
  sim.tick(); if (sim.year < next && sim.year < last) continue; next += sim.year < -3000 ? 2000 : sim.year < 0 ? 1000 : sim.year < 1500 ? 500 : 100;
  let realms = 0, pop = 0, ls = 0, ut = 0, inc = 0, cus = 0; const sat = new Float64Array(NC), satN = new Float64Array(NC); const eras = new Uint32Array(9);
  for (const cv of sim.civs) { if (!cv) continue; const c = cv.id, P = sim.popOf[c]; realms++; pop += P; ls += M.LS[c] * P; ut += M.util[c] * P; inc += cv.income || 0; cus += M.rev[c]; eras[cv.era]++; for (let k = 0; k < NC; k++) if (cv.era >= E.CATS[k].era) { sat[k] += M.sat[c * NC + k] * P; satN[k] += P; } }
  console.log(`\n=== ${sim.fmtYear(sim.year)}: ${realms} realms (by era ${[...eras].join(' ')}), ${(pop / 1000).toFixed(1)} m people; links ${M.links.length} (${M.links.filter(l => l.sea).length} by sea); world product ${f2(M.worldGdp)}, trade ${f2(M.worldTrade)} (${(100 * M.worldTrade / Math.max(1e-9, M.worldGdp)).toFixed(1)}%); taxes ${f2(inc)}, of which customs ${f2(cus)}; market ${(tMarket / Math.max(1, nMarket)).toFixed(2)} ms/yr; ${((Date.now() - t0) / 1000).toFixed(0)} s`); tMarket = 0; nMarket = 0;
  console.log(`  living ${(ls / pop).toFixed(2)}  hands busy ${(ut / pop).toFixed(2)}  | ` + E.CATS.map((C, k) => satN[k] ? `${C.key} ${(sat[k] / satN[k]).toFixed(2)}` : '').filter(Boolean).join('  '));
  // each good: world price against its usual price, output against need, the share of the world's people whose realm has less than half of what it wants
  const rows = [];
  for (let g = 1; g < NG; g++) { const G = E.GOODS[g]; if (!(M.wOut[g] > 0) && !(M.wNeed[g] > 1e-6)) continue; let shortP = 0, wantP = 0, holders = 0; for (const cv of sim.civs) { if (!cv) continue; const c = cv.id; const nd = M.need[c * NG + g]; if (M.out[c * NG + g] > 1e-9) holders++; if (nd > 1e-9 && M.fin[c * NG + g] + 0 > 0) { wantP += sim.popOf[c]; if ((M.got[c * NG + g]) < 0.5 * M.fin[c * NG + g]) shortP += sim.popOf[c]; } }
    rows.push(`${G.tk} ${M.wPx[g].toFixed(2)}x ${(M.wOut[g] / Math.max(1e-9, M.wNeed[g])).toFixed(2)} s${wantP ? Math.round(100 * shortP / wantP) : 0}% h${holders} t${(100 * M.wTrade[g] / Math.max(1e-9, M.wOut[g])).toFixed(0)}%`); }
  for (let k = 0; k < rows.length; k += 6) console.log('  ' + rows.slice(k, k + 6).map(r => r.padEnd(34)).join(''));
  // the lines of work: how much of the world's work each does, and how much of what it meant to make it made
  { const lab = new Float64Array(NR), plan = new Float64Array(NR), made = new Float64Array(NR); let tot = 0; for (const cv of sim.civs) { if (!cv) continue; const c = cv.id; for (let r = 0; r < NR; r++) { lab[r] += M.mk[c * NR + r] * E.RECIPES[r].l; plan[r] += M.act[c * NR + r]; made[r] += M.mk[c * NR + r]; tot += M.mk[c * NR + r] * E.RECIPES[r].l; } }
    console.log('  work: ' + E.RECIPES.map((R, r) => plan[r] > 0 ? `${R.key} ${(100 * lab[r] / Math.max(1e-9, tot)).toFixed(0)}%/${(100 * made[r] / plan[r]).toFixed(0)}` : '').filter(Boolean).join('  ')); }
  if (follow.length) { const big = sim.civs.filter(Boolean).sort((a, b) => sim.popOf[b.id] - sim.popOf[a.id]).slice(0, 5);
    for (const cv of big) { const c = cv.id; console.log(`  ${sim.fullName(cv)} (${(sim.popOf[c] / 1000).toFixed(2)} m, era ${cv.era}, living ${M.LS[c].toFixed(2)}, busy ${M.util[c].toFixed(2)}, partners ${M.partners(c).length}): ` + follow.map(k => { const g = E.ID[k]; const o = c * NG + g; return `${k} p${M.px[o].toFixed(2)} out ${f2(M.out[o])} need ${f2(M.need[o])} imp ${f2(M.imp[o])} exp ${f2(M.exp[o])} st ${f2(M.stock[o])}`; }).join(' | ')); } }
}
