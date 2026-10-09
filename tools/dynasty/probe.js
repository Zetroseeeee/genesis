// The people who rule, in numbers: how long reigns last and how old rulers are, how thrones pass (to a grown heir, to a child
// under a regent, to a kinsman, to a new house when a line fails), how many houses there are and how they end, royal marriages,
// and what it costs.
//   node tools/dynasty/probe.js [seed[,seed...]] [last year]
// What to hold it to: reigns of thirty-two to thirty-six years on the whole, by blood and otherwise (the old flat roll of one in
// 34 gave that many deaths a year, and the world's wars, risings and breakaways were fitted to them), rulers dying at about
// seventy; most thrones going to a grown son or daughter, about one in ten to a child (a regency), a few in a hundred to a
// kinsman, and a line failing one time in ten or so (a house dies out once in some centuries); ruling houses some centuries
// old, a few much older; a year of it a small fraction of a millisecond, and a save of a few hundred kilobytes at most. Run the
// war-and-peace probe after it.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number);
const lastArg = args.find((a) => /^-?\d+$/.test(a) && !/,/.test(a) && a !== String(seeds[0])); const last = lastArg !== undefined ? +lastArg : 2050;
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const DATES = [-3000, -2000, -1000, -500, 0, 500, 1000, 1300, 1500, 1650, 1800, 1900, 1950, 2000, 2050].filter((y) => y <= last);
const q = (a, f) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * f))] : 0);
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const D = sim.dynasty;
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  let k = 0, ms = 0, years = 0; const t0 = Date.now(); let was = JSON.parse(JSON.stringify(D.stats));
  // (every reign that ends, by the kind of rule it was, and the age its ruler died at)
  const ends = []; const succeed = D.succeed; D.succeed = function (c, kind, why, ep) { const C = D.court[c], o = C && D.of(C.ruler); const r = succeed(c, kind, why, ep); if (o && o.r && why !== 'first') ends.push({ kind: o.h ? 'house' : 'other', len: sim.year - o.r[0], age: sim.year - o.b, why, how: r ? r.how : '' }); return r; };
  console.log(`\nseed ${seed}`);
  while (k < DATES.length && sim.year < last) {
    sim.tick(); ms += D.stats.ms; years++;
    if (sim.year < DATES[k]) continue; k++;
    const S = D.stats, dh = (key) => S.how[key] - (was.how[key] || 0), d = (key) => S[key] - (was[key] || 0);
    const realms = sim.civs.filter(Boolean); const kinds = {}; for (const cv of realms) { const kd = sim.succKind(cv); kinds[kd] = (kinds[kd] || 0) + 1; }
    const hd = ends.filter((e) => e.kind === 'house'), ho = ends.filter((e) => e.kind === 'other');
    const mean = (a, f) => (a.length ? (a.reduce((s, e) => s + f(e), 0) / a.length).toFixed(1) : '-');
    const deaths = hd.filter((e) => e.why === 'death');
    const ages = realms.map((cv) => D.rulerOf(cv.id)).filter((p) => p && p.h).map((p) => sim.year - p.b).sort((a, b) => a - b);
    const living = [...D.houses.values()].filter((x) => !x.ended); const hAge = living.map((x) => sim.year - x.founded).sort((a, b) => a - b);
    const regents = realms.filter((cv) => D.regentOf(cv.id)).length;
    const json = JSON.stringify(D.save());
    console.log(`${sim.fmtYear(sim.year).padStart(9)}  ${realms.length} realms (${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([kk, n]) => kk + ' ' + n).join(', ')}); ${D.P.size} people, ${D.houses.size} houses (${living.length} ruling), save ${(json.length / 1024).toFixed(0)} KB`);
    console.log(`           since: ${d('reigns')} reigns ended; by blood ${hd.length}, mean ${mean(hd, (e) => e.len)} yrs (deaths ${deaths.length}, at ${mean(deaths, (e) => e.age)}); others ${ho.length}, mean ${mean(ho, (e) => e.len)} yrs`);
    console.log(`           thrones: clear ${dh('clear')}, child ${dh('child')}, kinsman ${dh('kin')}, line failed ${dh('extinct')}, new ${dh('new')}; houses ended ${d('ended')} (died out ${d('extinct')}, put down ${d('deposed')}); regencies now ${regents}; royal matches ${d('royal')}`);
    console.log(`           rulers of houses: age ${q(ages, 0.1)} / ${q(ages, 0.5)} / ${q(ages, 0.9)}; ruling houses' age ${q(hAge, 0.5)} / ${q(hAge, 0.9)} / ${hAge[hAge.length - 1] || 0} yrs; a year ${(ms / years).toFixed(3)} ms`);
    const old = living.slice().sort((a, b) => a.founded - b.founded).slice(0, 3).map((x) => `${x.name} (${sim.civs[x.c] ? sim.fullName(sim.civs[x.c]) : '?'}, since ${sim.fmtYear(x.founded)}, ${x.n} reigns)`).join('; ');
    if (old) console.log(`           oldest: ${old}`);
    was = JSON.parse(JSON.stringify(S)); ends.length = 0; ms = 0; years = 0;
  }
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
