// What an age expects of a realm's rule: the world's mean of everything forms, laws and estates give, age by age.
//   node tools/rule/norm.js [seed[,seed...]] [--write]
// The world is run from 10,000 BC to 2050; every five years every realm's own factors (rule.own: before they are set
// against the age) are added to its age's sums. What feeds and employs people (food, growth, health, hunger, trade,
// workshops, yields) is weighted by a realm's people: the world's people must come out as before. What makes a realm
// hold together, learn and fight (everything else) is weighted by the square root of its people: there the usual
// realm is the measure, not the few great ones, or the many would sit below the norm in reach, break up, and the
// world would be more and smaller realms than it was. --write puts the means into src/rule.js between
// its NORM marks; the simulation then divides every realm's factors by them (see "Rule is measured against the age"
// there). Run it over two seeds after changing what forms and laws give, who likes them, or how the autopilot chooses,
// and run it twice: a world measured against the age chooses a little differently from one that is not.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number); const write = args.includes('--write');
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
for (const f of ['econ', 'know', 'rule', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const R = window.RULE; const NK = R.NK; const sum = [], wsum = new Float64Array(9), sumR = [], wsumR = new Float64Array(9); for (let e = 0; e < 9; e++) { sum.push(new Float64Array(NK)); sumR.push(new Float64Array(NK)); }
const BY_PEOPLE = { food: 1, grow: 1, health: 1, hunger: 1, trade: 1, work: 1, yield: 1 };
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const t0 = Date.now();
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  const own = sim.rule.own;
  while (sim.year < 2050) { sim.tick(); if (sim.year % 5) continue; for (const cv of sim.civs) { if (!cv) continue; const c = cv.id, P = sim.popOf[c]; if (!(P > 0)) continue; const e = cv.era; const q = Math.sqrt(P); wsum[e] += P; wsumR[e] += q; const s = sum[e], r = sumR[e]; for (let k = 0; k < NK; k++) { const v = own[c * NK + k]; s[k] += P * v; r[k] += q * v; } } }
  let pop = 0; for (const cv of sim.civs) if (cv) pop += sim.popOf[cv.id];
  console.log(`seed ${seed}: ran to ${sim.fmtYear(sim.year)} in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${sim.st.civCount} realms, ${(pop / 1000).toFixed(0)} m people`);
}
const table = {}; R.KEYS.forEach((key, k) => { const row = []; for (let e = 0; e < 9; e++) row.push(wsum[e] > 0 ? +(BY_PEOPLE[key] ? sum[e][k] / wsum[e] : sumR[e][k] / wsumR[e]).toFixed(3) : (e ? row[e - 1] : (R.ADDED[key] ? 0 : 1))); table[key] = row; });
console.log('what each age gets from its rule (the means now, and what the file holds):');
for (const key of R.KEYS) console.log(`  ${key.padEnd(10)} ${table[key].map((v) => v.toFixed(2).padStart(6)).join('')}    ${R.NORM ? R.NORM[key].map((v) => v.toFixed(2).padStart(6)).join('') : '(nothing yet)'}`);
const text = '  const NORM = {\n' + R.KEYS.map((key) => `    ${key}: [${table[key].join(', ')}],`).join('\n') + '\n  };';
if (write) { const p = path.join(root, 'src/rule.js'); const s = fs.readFileSync(p, 'utf8'); const a = s.indexOf('/* NORM:BEGIN */'), z = s.indexOf('/* NORM:END */'); if (a < 0 || z < 0) throw new Error('no NORM marks in src/rule.js'); fs.writeFileSync(p, s.slice(0, a) + '/* NORM:BEGIN */\n' + text + '\n  ' + s.slice(z)); console.log('written to src/rule.js'); }
