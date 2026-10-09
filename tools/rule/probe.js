// How the world's realms are governed through the ages, in numbers: which forms of rule they have, which laws, how
// content their estates are, how much authority their rulers hold, how often estates ask and rise.
//   node tools/rule/probe.js [seed] [last year]
// Run it after touching rule.js (what forms and laws give, who likes them, how the autopilot chooses): the world should
// pass through the forms and laws of each age in that age, estates should mostly be content but not all of them and
// not always, and risings should be events (a few a turn in the whole world), not weather.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const R = window.RULE; const args = process.argv.slice(2).map(Number); const seed = args[0] || 12345, last = args[1] === undefined ? 2050 : args[1];
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
const sim = window.createSim(wd, seed);
{ let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
const DATES = [-8000, -6000, -4000, -3000, -2000, -1000, -500, 0, 500, 1000, 1400, 1600, 1800, 1900, 1950, 2000, 2050].filter((y) => y <= last);
const rule = sim.rule; rule.stats.moves = {}; let prev = JSON.parse(JSON.stringify(rule.stats)); let k = 0; const t0 = Date.now();
while (k < DATES.length) {
  sim.tick(); if (sim.year < DATES[k]) continue;
  const forms = {}, laws = R.CATS.map(() => ({})); let n = 0, pop = 0, auth = 0, stab = 0, reforming = 0; const mood = new Float64Array(R.NE), pw = new Float64Array(R.NE); const fsum = new Float64Array(R.NK);
  for (const cv of sim.civs) { if (!cv) continue; const c = cv.id, P = sim.popOf[c], Q = rule.ruleOf(cv); n++; pop += P; auth += Q.auth; stab += cv.stability; if (Q.reform) reforming++;
    forms[Q.gov] = (forms[Q.gov] || 0) + P; R.CATS.forEach((C, i) => { laws[i][Q.laws[C.key]] = (laws[i][Q.laws[C.key]] || 0) + P; });
    for (let e = 0; e < R.NE; e++) { mood[e] += P * Q.mood[e]; pw[e] += P * rule.power[c * R.NE + e]; } for (let q = 0; q < R.NK; q++) fsum[q] += P * rule.f[c * R.NK + q]; }
  const top = (o, m) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, m).map(([key, v]) => `${key} ${Math.round(100 * v / pop)}%`).join(', ');
  const S = rule.stats, d = (key) => S[key] - prev[key]; const ris = S.risings.map((v, e) => v - prev.risings[e]);
  console.log(`\n${sim.fmtYear(sim.year)}: ${n} realms, ${(pop / 1000).toFixed(0)} m people; stability ${(stab / n).toFixed(2)}, authority ${(auth / n).toFixed(0)}, ${reforming} reforming  | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(`  forms (by people): ${top(forms, 7)}`);
  console.log('  laws: ' + R.CATS.map((C, i) => `${C.key}: ${top(laws[i], 3)}`).join('\n        '));
  console.log('  estates (power, content): ' + R.ESTATES.map((E, e) => `${E.key} ${Math.round(100 * pw[e] / pop)}% ${(mood[e] / pop).toFixed(2)}`).join('  '));
  console.log('  factors: ' + R.KEYS.map((key, q) => `${key} ${(fsum[q] / pop).toFixed(2)}`).join(' '));
  console.log(`  since the last line: ${d('laws')} laws passed, ${d('forms')} changes of form (${d('grown')} grown into, ${d('seized')} seized, ${d('passed')} passed on a death), ${d('demands')} demands (${d('granted')} granted, ${d('refused')} refused), risings ${ris.map((v, e) => v ? R.ESTATES[e].key + ' ' + v : '').filter(Boolean).join(', ') || 'none'}`);
  { const mv = Object.entries(S.moves).map(([key, v]) => [key, v - (prev.moves[key] || 0)]).filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 14); if (mv.length) console.log('  changes of form: ' + mv.map(([key, v]) => `${key} ${v}`).join(', ')); }
  prev = JSON.parse(JSON.stringify(S)); k++;
}
