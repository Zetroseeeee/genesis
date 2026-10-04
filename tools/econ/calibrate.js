// How much each raw good's land must yield, measured from the world itself.
//   node tools/econ/calibrate.js [seed] [--write]     (--write puts the table into src/econ.js between its CAL marks)
//
// The simulation is run from 10,000 BC to 2000 AD (the market steps with it but changes nothing here: only who lives
// where, and what their age wants, is read). In every 500-year stretch, for every raw good, two sums are kept:
//   need:   the lots the world would use in a year at usual prices (ECON.req of every realm's knowledge, times its people)
//   supply: the people living on that good's land (mines counted over) times how hard their age works (F^0.7)
// need / supply is the yield that would give the world exactly what it would use; the table holds the geometric mean
// of that over the stretches in which at least three realms bring the good in and the world wants it at least half
// as much, a head, as it ever does (tin is sized by the Bronze Age, not by the centuries after it). A good that does not travel (grain,
// rice, maize, fish, cattle) is sized by the realms that grow it, and those realms' food is shared among what they grow:
// nobody ate rice in Gaul, so Gaul's bread must come from grain alone.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const fs = require('fs'); const path = require('path'); const PNG = require('pngjs').PNG; const root = path.join(__dirname, '..', '..');
(0, eval)(fs.readFileSync(path.join(root, 'src/econ.js'), 'utf8')); (0, eval)(fs.readFileSync(path.join(root, 'src/sim.js'), 'utf8'));
const E = window.ECON; const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
const seed = +(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 12345); const write = process.argv.includes('--write');
const sim = createSim(wd, seed); const NG = E.NG; const LOCAL = ['grain', 'rice', 'maize', 'fish', 'cattle'].map((k) => E.ID[k]);
// the page seeds two dozen peoples beside the player's; so does this
{ let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
// what a realm would use, with its food shared among the foods it grows itself
function reqOf(cv, c) {
  const era = cv.era, F = 1 + 5 * cv.tech; const x = new Float64Array(NG);
  for (const C of E.CATS) {
    if (era < C.era) continue; let B = C.b * Math.pow(F, C.e); if (C.key === 'ships') B *= sim.ports[c] > 0 ? 1 : 0;
    const ok = (m) => E.wants(m, era) && E.GOODS[m.g].era <= era && (!LOCAL.includes(m.g) || sim.rawPop[c * NG + m.g] > 0);
    let sum = 0; for (const m of C.m) if (ok(m)) sum += m.w; if (!sum) continue;
    for (const m of C.m) if (ok(m)) x[m.g] += B * m.w / sum / E.GOODS[m.g].base;
  }
  for (let k = E.MADE_ORDER.length - 1; k >= 0; k--) {
    const g = E.MADE_ORDER[k]; if (x[g] <= 0) continue; let sum = 0; for (const ri of E.MAKES[g]) { const r = E.RECIPES[ri]; if (r.era <= era && era <= r.until) sum += r.cw; } if (!sum) continue;
    for (const ri of E.MAKES[g]) { const r = E.RECIPES[ri]; if (r.era > era || era > r.until) continue; const part = x[g] * r.cw / sum; for (const [gi, q] of r.in) x[gi] += q * part; }
  }
  return x;
}
const STEP = 500, B0 = -8000, NBK = Math.ceil((2000 - B0) / STEP); const need = [], sup = [], holders = [];
for (let k = 0; k < NBK; k++) { need.push(new Float64Array(NG)); sup.push(new Float64Array(NG)); holders.push(new Float64Array(NG)); }
const heads = new Float64Array(NBK);
const cells = new Uint32Array(NG); for (const i of sim.LI) cells[sim.goods[i]]++;
const t0 = Date.now(); let samples = new Uint32Array(NBK);
while (sim.year < 2000) {
  sim.tick(); if (sim.year % 25 !== 0 || sim.year < B0) continue;
  const b = Math.min(NBK - 1, Math.floor((sim.year - B0) / STEP)); samples[b]++;
  for (const cv of sim.civs) { if (!cv) continue; const c = cv.id, P = sim.popOf[c]; if (P <= 0) continue; heads[b] += P; const x = reqOf(cv, c), F7 = Math.pow(1 + 5 * cv.tech, 0.7);
    for (let g = 1; g < NG; g++) { const G = E.GOODS[g]; if (!G.raw) continue; const rp = sim.rawPop[c * NG + g]; if (rp > 0) { sup[b][g] += rp * F7; holders[b][g]++; } if (LOCAL.includes(g) && !(rp > 0)) continue; need[b][g] += P * x[g]; } }
}
console.log(`ran to ${sim.fmtYear(sim.year)} in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${sim.st.civCount} realms`);
const cal = {}; const rows = [];
for (let g = 1; g < NG; g++) { const G = E.GOODS[g]; if (!G.raw) continue; let ls = 0, n = 0; const per = [];
  let prime = 0; for (let b = 0; b < NBK; b++) if (heads[b] > 0) prime = Math.max(prime, need[b][g] / heads[b]);
  for (let b = 0; b < NBK; b++) { const h = holders[b][g] / Math.max(1, samples[b]); if (sup[b][g] > 0 && need[b][g] > 0 && h >= 3) { const r = need[b][g] / sup[b][g]; const on = need[b][g] / heads[b] >= 0.5 * prime; if (on) { ls += Math.log(r); n++; } per.push(r.toPrecision(2) + (on ? '' : '~')); } else per.push('-'); }
  if (!n) { for (let b = 0; b < NBK; b++) if (sup[b][g] > 0 && need[b][g] > 0) { ls += Math.log(need[b][g] / sup[b][g]); n++; } }
  cal[G.key] = n ? +Math.exp(ls / n).toPrecision(3) : 0.5;
  rows.push(`${G.key.padEnd(10)} cells ${String(cells[g]).padStart(5)}  yield ${String(cal[G.key]).padStart(8)}   ${per.join(' ')}`);
}
console.log(rows.join('\n'));
const text = '  const CAL = ' + JSON.stringify(cal).replace(/"/g, '').replace(/,/g, ', ').replace(/:/g, ': ') + ';';
if (write) { const p = path.join(root, 'src/econ.js'); const s = fs.readFileSync(p, 'utf8'); const a = s.indexOf('/* CAL:BEGIN */'), z = s.indexOf('/* CAL:END */'); if (a < 0 || z < 0) throw new Error('no CAL marks in src/econ.js'); fs.writeFileSync(p, s.slice(0, a) + '/* CAL:BEGIN */\n' + text + '\n  ' + s.slice(z)); console.log('written to src/econ.js'); } else console.log(text);
