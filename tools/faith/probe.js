// The world's faiths through the ages in numbers, and what share of other faiths each age's realms usually hold.
//   node tools/faith/probe.js [seed[,seed...]] [last year] [--write]
// The world is run from 10,000 BC; at each date it prints how many faiths are kept and of how many families, how many of
// them are for all peoples, the largest with their share of the world's people, how many realms keep the old ways, and
// what has happened since the start: faiths founded, rulers who took up a faith, churches that broke away, teachings for
// all peoples out of a people's faith, regions the state and the preachers have carried over, harbours the merchants
// have reached. Every five years every realm's share of other faiths (weighed as faith.js weighs them, and as its laws
// and its faith's tenets make it count: lawF 'minor', tf 'minor') is added to its age's sums, weighted by the square root
// of its people (the usual realm is the measure, as for rule's norms and the peoples'); --write puts the means into
// src/faith.js between its NORM marks, which the simulation then holds every realm against (faith.unrest): run it over two
// seeds after changing what makes faiths spread, what makes them restless or how realms take them up, and run it twice.
// What to hold it to: the old ways everywhere until the Bronze Age, then many small faiths; by the Classical age a few
// faiths for all peoples spreading over the old ways and each other, the largest few holding a tenth to a quarter of the
// world's people each by AD 1000, with churches broken away from them; the old ways left to a few realms at the edges by
// the Modern age; a year of faiths well under a millisecond.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number); const write = args.includes('--write');
const lastArg = args.find((a) => /^-?\d+$/.test(a) && !/,/.test(a) && a !== String(seeds[0])); const last = lastArg !== undefined ? +lastArg : 2050;
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const DATES = [-8000, -6000, -4000, -3000, -2000, -1000, -500, 0, 500, 1000, 1400, 1600, 1800, 1900, 1950, 2000, 2050].filter((y) => y <= last);
const sum = new Float64Array(9), wsum = new Float64Array(9);
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const F = sim.faith;
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  let k = 0, ms = 0, years = 0; const t0 = Date.now();
  console.log(`\nseed ${seed}`);
  while (k < DATES.length && sim.year < last) {
    sim.tick(); ms += F.stats.ms; years++;
    if (sim.year % 5 === 0) for (const cv of sim.civs) { if (!cv) continue; const c = cv.id, pp = sim.popOf[c]; if (!(pp > 0)) continue; const w = Math.sqrt(pp); sum[cv.era] += w * F.otherShare[c] * F.lawF(c, 'minor') * (F.state[c] ? F.tf(F.state[c], 'minor') : 1); wsum[cv.era] += w; }
    if (sim.year < DATES[k]) continue; k++;
    const alive = F.list.filter((f) => f && f.n > 0), fams = new Set(alive.map((f) => f.fam)); let world = 0, kept = 0; for (let q = 0; q < sim.LI.length; q++) world += sim.pop[sim.LI[q]]; for (const f of alive) kept += f.pop;
    const top = alive.slice().sort((a, b) => b.pop - a.pop).slice(0, 6).map((f) => `${F.shortOf(f.id)}${f.world ? '*' : ''} ${Math.round(100 * f.pop / Math.max(1e-9, world))}% (${f.n}, ${f.realms} realms)`).join(', ');
    let old = 0, realms = 0, os = 0, ow = 0, much = 0; for (const cv of sim.civs) { if (!cv) continue; realms++; if (!F.state[cv.id]) old++; const w = Math.sqrt(sim.popOf[cv.id] || 0); os += w * F.otherShare[cv.id]; ow += w; if (F.otherShare[cv.id] > 0.25) much++; }
    const S = F.stats;
    console.log(`${sim.fmtYear(sim.year).padStart(9)}: ${alive.length} faiths in ${fams.size} families (${alive.filter((f) => f.world).length} for all peoples), kept by ${Math.round(100 * kept / Math.max(1e-9, world))}% of the world; ${old} of ${realms} realms keep the old ways; a realm holds ${(100 * os / Math.max(1e-9, ow)).toFixed(0)}% others (${much} realms over a quarter)  | ${((Date.now() - t0) / 1000).toFixed(0)} s, ${(ms / Math.max(1, years)).toFixed(3)} ms a year`);
    console.log(`           since the start: ${S.founded} founded, ${S.adopted} taken up, ${S.turned} forsaken, ${S.split} churches broke away, ${S.worlds} teachings for all peoples; regions carried over by the state ${S.converted}, by preachers ${S.preached}, harbours by merchants ${S.missions}`);
    console.log(`           largest: ${top}`);
  }
  const holy = []; for (const f of F.list) if (f && f.n > 0 && f.pop > 0) holy.push(f); holy.sort((a, b) => b.pop - a.pop);
  console.log('  the largest faiths and their holy cities:'); for (const f of holy.slice(0, 8)) { const o = sim.owner[f.home], cv = o >= 0 ? sim.civs[o] : null; console.log(`    ${f.name}${f.world ? ' (for all peoples)' : ''}, founded ${sim.fmtYear(f.born)} at ${sim.cellName.get(f.home) || '?'}; ${f.tenets.map((t) => F.TK[t].name).join(' and ')}; holy city held by ${cv ? sim.fullName(cv) + (F.state[o] === f.id ? ' (of the faith)' : ' (of another faith)') : 'nobody'}${f.parent ? '; a church of ' + F.nameOf(f.parent) : ''}`); }
}
const table = []; for (let e = 0; e < 9; e++) table.push(wsum[e] > 0 ? +(sum[e] / wsum[e]).toFixed(3) : (e ? table[e - 1] : 0));
console.log(`\nwhat each age's realms hold of other faiths (now, and what the file holds):\n  ${table.map((v) => v.toFixed(3).padStart(7)).join('')}\n  ${window.FAITH.NORM.map((v) => v.toFixed(3).padStart(7)).join('')}`);
if (write) { const p = path.join(root, 'src/faith.js'); const s = fs.readFileSync(p, 'utf8'); const a = s.indexOf('// NORM-BEGIN'), z = s.indexOf('// NORM-END'); if (a < 0 || z < 0) throw new Error('no NORM marks in src/faith.js'); fs.writeFileSync(p, s.slice(0, a) + '// NORM-BEGIN\n  const NORM = [' + table.join(', ') + '];\n  ' + s.slice(z)); console.log('written to src/faith.js'); }
