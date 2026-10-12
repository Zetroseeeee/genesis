// The world's woods through the ages, in numbers (woods.js): how much of nature's woods stands, in the world and in each of
// Maddison's ten regions (tools/people/regions.png), how much was cleared and grown back since the date before, and how long a
// year of it takes.
//   node tools/woods/probe.js [seed[,seed...]] [last year]
// What to hold it to (Williams, Deforesting the Earth, 2003; Kaplan et al. 2009; FAO): the world keeps nine tenths of its woods
// to 1700, some four fifths in 1850 and two thirds in 2000; western Europe a half by AD 1000, a fifth to a third by 1300 and
// about a fifth in 1850, more again by 2000; China about half by AD 1, under a quarter by 1900; the Americas' woods growing back
// after the sicknesses of the sixteenth century and cleared again in the nineteenth; the tropics cleared last.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number);
const lastArg = args.find((a) => /^-?\d+$/.test(a) && !/,/.test(a) && a !== String(seeds[0])); const last = lastArg !== undefined ? +lastArg : 2050;
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
{ const sp = PNG.sync.read(fs.readFileSync(path.join(root, 'data/soil.png'))); wd.soil = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { wd.soil[i * 3] = sp.data[i * 4]; wd.soil[i * 3 + 1] = sp.data[i * 4 + 1]; wd.soil[i * 3 + 2] = sp.data[i * 4 + 2]; } }
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'disease', 'land', 'climate', 'migrate', 'woods', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const RP = PNG.sync.read(fs.readFileSync(path.join(root, 'tools/people/regions.png'))); const REG = new Uint8Array(N); for (let i = 0; i < N; i++) REG[i] = RP.data[i * 4];
const SHORT = ['W.Eur', 'E.Eur', 'USSR', 'Offsh', 'LatAm', 'Japan', 'China', 'India', 'O.Asia', 'Africa'], NR = SHORT.length;
const DATES = [-8000, -6000, -4000, -2000, -1000, 0, 500, 1000, 1300, 1500, 1600, 1700, 1800, 1850, 1900, 1950, 2000, 2050].filter((y) => y <= last);
const pad = (s, n) => String(s).padStart(n);
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const Wd = sim.woods; if (!Wd) { console.log('no woods'); process.exit(1); }
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.homeOf(i); if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  console.log(`seed ${seed}                world  ${SHORT.map((s) => pad(s, 7)).join('')}   (the share of nature's woods that stands)`);
  const t0 = Date.now(); let c0 = 0, g0 = 0, ms0 = 0, y0 = 0;
  for (const D of DATES) {
    while (sim.year < D) sim.tick();
    const now = new Float64Array(NR + 1), nat = new Float64Array(NR + 1);
    for (const i of sim.LI) { const a = Math.cos((90 - (Math.floor(i / W) + 0.5) / H * 180) * Math.PI / 180), c = Wd.cover[i] * a, p = Wd.pot[i] * a; now[NR] += c; nat[NR] += p; const g = REG[i]; if (g < NR) { now[g] += c; nat[g] += p; } }
    const S = Wd.stats, ha = (v) => (v / window.WOODS.Q * 3086).toFixed(0);      // (a cell at the equator is half a degree square: some 3,086 km2)
    console.log(`${pad(sim.fmtYear(sim.year), 9)}: ${pad((now[NR] / nat[NR]).toFixed(2), 5)}  ${Array.from(now.slice(0, NR)).map((v, g) => pad(nat[g] > 0 ? (v / nat[g]).toFixed(2) : '-', 7)).join('')}   woods ${ha(now[NR] / 100)} of ${ha(nat[NR] / 100)} km2 x100; cleared ${ha((S.cleared - c0) / 100)}, grown back ${ha((S.grown - g0) / 100)} | ${((S.ms - ms0) / Math.max(1, S.years - y0)).toFixed(3)} ms a year | ${Math.round((Date.now() - t0) / 1000)} s`);
    c0 = S.cleared; g0 = S.grown; ms0 = S.ms; y0 = S.years;
  }
}
