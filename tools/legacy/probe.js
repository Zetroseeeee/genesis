// What the world's realms are remembered for, through the ages, in numbers: how many ambitions are fulfilled and left undone, the
// firsts and who took them, the heritages chosen, the most remembered realms, which ambitions are common and which rare, how long a
// year of legacies takes.
//   node tools/legacy/probe.js [seed[,seed...]] [last year]
// What to hold it to: every first taken by AD 2050, the first into each age near history's dates; the ambitions of the Stone Age
// fulfilled by most realms and those of later ages by fewer, the races (the first ten to write, to learn the alphabet, to build railways,
// to fly, the first five into space) by no more than their number; the most remembered realms far ahead of the middle; a year well under half a
// millisecond. Then the war-and-peace probe over 12345 and 777: the world must go on as it did.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number);
const lastArg = args.find((a) => /^-?\d+$/.test(a) && !/,/.test(a) && a !== String(seeds[0])); const last = lastArg !== undefined ? +lastArg : 2050;
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const DATES = [-6000, -3000, -1000, 0, 500, 1000, 1500, 1800, 1900, 2000, 2050].filter((y) => y <= last);
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const L = sim.legacy, LG = window.LEGACY;
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  let ms = 0, n = 0, k = 0; const t0 = Date.now(); console.log(`\nseed ${seed}`);
  while (k < DATES.length && sim.year < last) { sim.tick(); ms += L.stats.ms; n++;
    if (sim.year < DATES[k]) continue; k++; const realms = sim.civs.filter(Boolean); const tot = realms.map((c) => L.total(c)).sort((a, b) => b - a); const mid = tot[Math.floor(tot.length / 2)] || 0;
    const top = realms.map((c) => [L.total(c), sim.fullName(c), c.era]).sort((a, b) => b[0] - a[0]).slice(0, 3);
    console.log(`${sim.fmtYear(sim.year).padStart(9)}: ${L.stats.got} ambitions fulfilled, ${L.stats.lost} left undone, ${L.stats.firsts} firsts, ${L.stats.heritages} heritages; the middle realm ${mid} | ${(ms / n).toFixed(3)} ms a year, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    console.log(`           the most remembered: ${top.map((t) => `${t[1]} ${t[0]} (age ${t[2]})`).join('; ')}`); }
  const got = {}; for (const c of sim.civs) if (c && c.legacy) for (const key in c.legacy.got) got[key] = (got[key] || 0) + 1;
  console.log('  fulfilled by the realms living now: ' + LG.AMB.map((a) => `${a.key} ${got[a.key] || 0}`).join(', '));
  console.log('  firsts: ' + L.firsts.map((q, i) => (q ? `${LG.FIRSTS[i].key} ${sim.fmtYear(q[0])}` : `${LG.FIRSTS[i].key} -`)).join(', '));
  const P = sim.story.stats.pick.heritage || [0, 0, 0]; console.log(`  heritage: the first path ${P[0]}, the second ${P[1]}, the third ${P[2]}; the hall: ${L.hall.slice(0, 4).map((q) => q[0] + ' ' + q[1]).join('; ')}`);
}
