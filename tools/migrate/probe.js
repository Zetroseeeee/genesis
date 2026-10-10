// People on the move through the ages, in numbers (migrate.js): how many leave their realm in a century and how many of them cross a
// border, how many flee (famine, war, unrest), the greatest flows of the decade, the share of the world's people in the Americas and
// how many of them are of peoples from beyond the ocean, how many regions newcomers made theirs, and how long a year of it takes.
//   node tools/migrate/probe.js [seed[,seed...]] [last year]
// What to hold it to: few go in the early ages (they move with the land their realms take), more with ships and far more with
// steamships; the Americas' share of the world's people rising after 1500 toward history's (Maddison: 2 % in 1500, 4 % in 1820,
// 8 % in 1870, 11 % in 1913, 14 % in 1998 with the Offshoots); a year of it some hundredths of a millisecond. Then the regional
// census (tools/people/regions.js), the world's people (tools/know/people.js) and the war-and-peace probe.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number);
const lastArg = args.find((a) => /^-?\d+$/.test(a) && !/,/.test(a) && a !== String(seeds[0])); const last = lastArg !== undefined ? +lastArg : 2050;
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
{ const sp = PNG.sync.read(fs.readFileSync(path.join(root, 'data/soil.png'))); wd.soil = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { wd.soil[i * 3] = sp.data[i * 4]; wd.soil[i * 3 + 1] = sp.data[i * 4 + 1]; wd.soil[i * 3 + 2] = sp.data[i * 4 + 2]; } }
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'disease', 'land', 'climate', 'migrate', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const DATES = [-8000, -6000, -4000, -2000, -1000, 0, 500, 1000, 1300, 1500, 1600, 1700, 1800, 1850, 1900, 1950, 2000, 2050].filter((y) => y <= last);
const inAm = (i) => { const lon = ((i % W) + 0.5) / W * 360 - 180; return lon < -30 && lon > -170; };
const fmt = (k) => (k >= 1000 ? (k / 1000).toFixed(k >= 1e4 ? 0 : 1) + ' m' : Math.round(k) + ' k');
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const M = sim.mig;
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.homeOf(i); if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  console.log(`seed ${seed}`);
  let o0 = 0, a0 = 0, r0 = 0, ms0 = 0, n0 = 0; const t0 = Date.now();
  for (const D of DATES) {
    while (sim.year < D) sim.tick();
    const S = M.stats; const out = S.out - o0, abroad = S.abroad - a0, ref = S.refugees - r0, yrs = S.years - n0, ms = (S.ms - ms0) / Math.max(1, yrs); o0 = S.out; a0 = S.abroad; r0 = S.refugees; ms0 = S.ms; n0 = S.years;
    let world = 0, am = 0, amFar = 0; const ppl = sim.people.ppl, home = new Map();
    for (const i of sim.LI) { const p = sim.pop[i]; world += p; if (inAm(i)) { am += p; const q = ppl[i]; if (q) { let h = home.get(q); if (h === undefined) { const P = sim.people.list[q]; h = P && P.home >= 0 ? (inAm(P.home) ? 1 : 0) : 1; home.set(q, h); } if (!h) amFar += p; } } }
    const top = M.flows.slice(0, 4).map(([a, b, v]) => `${sim.civs[a] ? sim.civs[a].name : a} > ${sim.civs[b] ? sim.civs[b].name : b} ${fmt(v)}`).join('; ');
    console.log(`${sim.fmtYear(sim.year).padStart(9)}: people ${(world / 1000).toFixed(1)} m; left their homes ${fmt(out)} (${fmt(abroad)} to other realms, ${fmt(ref)} fled), ${(1000 * out / Math.max(1, yrs) / Math.max(1, world)).toFixed(2)} in a thousand a year; the Americas ${(100 * am / world).toFixed(1)} % of the world (${(100 * amFar / Math.max(1e-6, am)).toFixed(0)} % of peoples from over the ocean) | ${ms.toFixed(3)} ms a year | ${Math.round((Date.now() - t0) / 1000)} s`);
    if (top) console.log(`           the decade's greatest: ${top}`);
  }
}
