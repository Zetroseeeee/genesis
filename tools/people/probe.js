// The world's peoples through the ages in numbers, and what each age's realms usually rule of other peoples.
//   node tools/people/probe.js [seed[,seed...]] [last year] [--write]
// The world is run from 10,000 BC; at each date it prints how many peoples there are and of how many families, the
// largest of them, how many have drifted apart and how many regions have been taken into their rulers' people, and how
// many realms rule what share of other peoples. Every five years, every realm's share of other peoples (as its laws make
// it weigh: people.lawF 'minor') is added to its age's sums, weighted by the square root of its people (the usual realm is
// the measure, as for rule's norms); --write puts the means into src/people.js between its NORM marks, which the
// simulation then holds every realm against (people.unrest): run it over two seeds after changing what makes peoples
// restless, how fast they are taken in, or how breakaways choose their seed, and run it twice.
// What to hold it to: a few hundred peoples alive in the Iron Age and after, in some dozens of families; the largest few
// holding a tenth of the world's people each by the Classical age; a realm's share of other peoples rising from nought
// among bands to a fifth or so in the great empires of the Classical and later ages; a year of peoples well under a
// millisecond.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number); const write = args.includes('--write');
const lastArg = args.find((a) => /^-?\d+$/.test(a) && !/,/.test(a) && a !== String(seeds[0])); const last = lastArg !== undefined ? +lastArg : 2050;
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'disease', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const DATES = [-8000, -6000, -4000, -3000, -2000, -1000, -500, 0, 500, 1000, 1400, 1600, 1800, 1900, 1950, 2000, 2050].filter((y) => y <= last);
const sum = new Float64Array(9), wsum = new Float64Array(9);
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const t0 = Date.now(); const P = sim.people;
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  let k = 0, ms = 0, years = 0, splits = 0, splitsP = 0;
  const seen = new Set(); for (const e of sim.allEvents) seen.add(e.seq);
  console.log(`\nseed ${seed}`);
  while (k < DATES.length && sim.year < last) {
    sim.tick(); ms += P.stats.ms; years++;
    for (let q = sim.allEvents.length - 1; q >= 0 && q >= sim.allEvents.length - 40; q--) { const e = sim.allEvents[q]; if (seen.has(e.seq)) continue; seen.add(e.seq); if (/break(s)? away from/.test(e.text)) { splits++; if (/^The .* of .* break away/.test(e.text)) splitsP++; } }
    if (sim.year % 5 === 0) for (const cv of sim.civs) { if (!cv) continue; const c = cv.id, pp = sim.popOf[c]; if (!(pp > 0)) continue; const w = Math.sqrt(pp); sum[cv.era] += w * P.foreignShare[c] * P.lawF(c, 'minor'); wsum[cv.era] += w; }
    if (sim.year < DATES[k]) continue; k++;
    const alive = P.list.filter((p) => p && p.n > 0), fams = new Set(alive.map((p) => p.fam)); let world = 0; for (const p of alive) world += p.pop;
    const top = alive.slice().sort((a, b) => b.pop - a.pop).slice(0, 5).map((p) => `${p.name} ${Math.round(100 * p.pop / Math.max(1e-9, world))}% (${p.n})`).join(', ');
    let fs = 0, fw = 0, many = 0; const eras = new Array(9).fill(0); for (const cv of sim.civs) { if (!cv) continue; const w = Math.sqrt(sim.popOf[cv.id] || 0); fs += w * P.foreignShare[cv.id]; fw += w; if (P.foreignShare[cv.id] > 0.25) many++; eras[cv.era]++; }
    console.log(`${sim.fmtYear(sim.year).padStart(9)}: ${alive.length} peoples in ${fams.size} families (${P.stats.born} born, ${P.stats.drifted} drifted apart); ${P.stats.assimilated} regions taken in, ${P.stats.turned} rulers turned; realms ${sim.st.civCount}, a realm rules ${(100 * fs / Math.max(1e-9, fw)).toFixed(0)}% others on the mean, ${many} a quarter and more; breakaways ${splits} (${splitsP} of a people of their own) | ${(ms / years).toFixed(3)} ms a year | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    console.log(`           largest: ${top}`);
  }
}
const table = []; for (let e = 0; e < 9; e++) table.push(wsum[e] > 0 ? +(sum[e] / wsum[e]).toFixed(3) : (e ? table[e - 1] : 0));
console.log(`\nwhat each age's realms rule of other peoples (now, and what the file holds):\n  ${table.map((v) => v.toFixed(3).padStart(7)).join('')}\n  ${window.PEOPLE.NORM.map((v) => v.toFixed(3).padStart(7)).join('')}`);
if (write) { const p = path.join(root, 'src/people.js'); const s = fs.readFileSync(p, 'utf8'); const a = s.indexOf('// NORM-BEGIN'), z = s.indexOf('// NORM-END'); if (a < 0 || z < 0) throw new Error('no NORM marks in src/people.js'); fs.writeFileSync(p, s.slice(0, a) + '// NORM-BEGIN\n  const NORM = [' + table.join(', ') + '];\n  ' + s.slice(z)); console.log('written to src/people.js'); }
