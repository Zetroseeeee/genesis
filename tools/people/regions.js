// Where the world's people live, against history: the simulation's people in each of Maddison's ten regions (Western Europe,
// Eastern Europe, the former USSR, the Western Offshoots, Latin America, Japan, China, India, the rest of Asia, Africa) and their
// share of the world, against Maddison's (The World Economy: A Millennial Perspective, OECD 2001, Table B-10), at AD 1, 1000,
// 1500, 1600, 1700, 1820, 1870, 1913, 1950 and 1998.
//   node tools/people/regions.js [seed[,seed...]] [last year]
// The regions are tools/people/regions.png (made by regions_map.py from Natural Earth's borders). What to hold it to: every
// region's share within a factor of 1.5 of history's from AD 1000 on (the Americas, Africa and the steppe are where the old
// map's greenness went wrong), and the world's people near history's count (tools/know/people.js).
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345,777').split(',').map(Number);
const lastArg = args.find((a) => /^-?\d+$/.test(a) && !/,/.test(a) && !seeds.includes(+a)); const last = lastArg !== undefined ? +lastArg : 1998;
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N), soil: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; wd.soil[i] = png.data[i * 4 + 3]; }
{ const sp = PNG.sync.read(fs.readFileSync(path.join(root, 'data/soil.png'))); wd.soil = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { wd.soil[i * 3] = sp.data[i * 4]; wd.soil[i * 3 + 1] = sp.data[i * 4 + 1]; wd.soil[i * 3 + 2] = sp.data[i * 4 + 2]; } }      // (what the land feeds: land.js)
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'disease', 'land', 'climate', 'migrate', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const RP = PNG.sync.read(fs.readFileSync(path.join(__dirname, 'regions.png'))); const RJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'regions.json'), 'utf8'));
const REG = new Uint8Array(N); for (let i = 0; i < N; i++) REG[i] = RP.data[i * 4];
const NR = RJ.regions.length, SHORT = ['W.Eur', 'E.Eur', 'USSR', 'Offsh', 'LatAm', 'Japan', 'China', 'India', 'O.Asia', 'Africa'];
// Maddison's Table B-10, millions. From 1950 his India is the present India, Pakistan and Bangladesh being in "Other Asia": here they
// are put back with India (39.5 and 45.6 million in 1950, 135 and 125 in 1998), as the map has British India whole. E. Europe 1870
// is 52.2 (his growth rates; 53.6 is a misprint in some copies).
const HIST = {
  1: [24.7, 4.75, 3.9, 1.17, 5.6, 3.0, 59.6, 75.0, 36.6, 16.5],
  1000: [25.4, 6.5, 7.1, 1.96, 11.4, 7.5, 59.0, 75.0, 41.4, 33.0],
  1500: [57.3, 13.5, 16.95, 2.8, 17.5, 15.4, 103.0, 110.0, 55.4, 46.6],
  1600: [73.8, 16.95, 20.7, 2.3, 8.6, 18.5, 160.0, 135.0, 65.0, 55.3],
  1700: [81.5, 18.8, 26.55, 1.75, 12.05, 27.0, 138.0, 165.0, 71.8, 61.1],
  1820: [133.0, 36.5, 54.8, 11.2, 21.2, 31.0, 381.0, 209.0, 89.4, 74.2],
  1870: [187.5, 52.2, 88.7, 46.1, 40.4, 34.4, 358.0, 253.0, 119.8, 90.5],
  1913: [261.0, 79.5, 156.2, 111.4, 80.9, 51.7, 437.1, 303.7, 185.4, 124.7],
  1950: [304.9, 87.6, 180.0, 176.3, 165.9, 83.8, 546.8, 444.1, 308.0, 228.3],
  1998: [388.0, 121.0, 291.0, 323.0, 508.0, 126.0, 1243.0, 1235.0, 809.0, 760.0],
};
const DATES = Object.keys(HIST).map(Number).filter((y) => y <= last);
const pad = (s, n) => String(s).padStart(n);
const all = DATES.map(() => ({ sim: new Float64Array(NR), n: 0 }));
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const t0 = Date.now();
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.homeOf(i); if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  console.log(`\nseed ${seed}            ${SHORT.map((s) => pad(s, 7)).join('')}    world  (the simulation's share of the world over history's; then millions)`);
  let k = 0;
  while (k < DATES.length) { sim.tick(); if (sim.year < DATES[k]) continue;
    const r = new Float64Array(NR); let world = 0; for (const i of sim.LI) { const p = sim.pop[i]; world += p; const g = REG[i]; if (g < NR) r[g] += p; }
    const h = HIST[DATES[k]], hw = h.reduce((a, b) => a + b, 0);
    console.log(`${pad(DATES[k], 5)} share x  ${Array.from(r).map((v, g) => pad(((v / world) / (h[g] / hw)).toFixed(2), 7)).join('')}   ${pad((world / 1000).toFixed(0), 6)}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    console.log(`      millions ${Array.from(r).map((v) => pad((v / 1000).toFixed(0), 7)).join('')}   history ${h.map((v) => v.toFixed(0)).join(' ')} = ${hw.toFixed(0)}`);
    for (let g = 0; g < NR; g++) all[k].sim[g] += r[g] / world; all[k].n++; k++; }
}
if (seeds.length > 1) { console.log(`\nall seeds: the share of the world over history's`); console.log(`              ${SHORT.map((s) => pad(s, 7)).join('')}`);
  for (let k = 0; k < DATES.length; k++) { const h = HIST[DATES[k]], hw = h.reduce((a, b) => a + b, 0); console.log(`${pad(DATES[k], 5)}         ${Array.from(all[k].sim).map((v, g) => pad(((v / all[k].n) / (h[g] / hw)).toFixed(2), 7)).join('')}`); } }
