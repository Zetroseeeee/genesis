// Sickness through the ages, in numbers: how many outbreaks arise and of which kind, how far each goes, how many die of them against
// the world's people, how the Americas fare before and after the first ships, and how long a year of it takes.
//   node tools/disease/probe.js [seed[,seed...]] [last year]
// What to hold it to: outbreaks from the Bronze Age on, a few at a time; the world's people near history's (4 million in 10,000 BC,
// 220 in the year 1, 970 in 1800, 6,140 in 2000: tools/know/people.js, refit FOOD if they fall away); the dead of a century a few per
// cent of the world in the old ages, a great pestilence now and then taking a third of a region; the Americas losing much of their people
// in the generations after the first contact across the sea (history: half and more); a year well under a tenth of a millisecond.
// Then the war-and-peace probe over 12345 and 777.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number);
const lastArg = args.find((a) => /^-?\d+$/.test(a) && !/,/.test(a) && a !== String(seeds[0])); const last = lastArg !== undefined ? +lastArg : 2050;
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
{ const sp = PNG.sync.read(fs.readFileSync(path.join(root, 'data/soil.png'))); wd.soil = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { wd.soil[i * 3] = sp.data[i * 4]; wd.soil[i * 3 + 1] = sp.data[i * 4 + 1]; wd.soil[i * 3 + 2] = sp.data[i * 4 + 2]; } }      // (what the land feeds: land.js)
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'disease', 'land', 'climate', 'migrate', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const DATES = [-6000, -3000, -2000, -1000, 0, 500, 1000, 1300, 1500, 1600, 1700, 1800, 1900, 1950, 2000, 2050].filter((y) => y <= last);
const DS = window.DISEASE;
const isAmericas = (i) => { const x = i % W; const lon = (x + 0.5) / W * 360 - 180; return lon < -30 && lon > -170; };
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const X = sim.disease;
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.homeOf(i); if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  let ms = 0, n = 0, k = 0, dead0 = 0; const t0 = Date.now(); console.log(`\nseed ${seed}`);
  while (k < DATES.length && sim.year < last) { sim.tick(); ms += X.stats.ms; n++;
    if (sim.year < DATES[k]) continue; k++;
    let world = 0, am = 0; for (const i of sim.LI) { world += sim.pop[i]; if (isAmericas(i)) am += sim.pop[i]; }
    const S = X.stats; const act = X.out.map((o) => `${o.name} (${DS.KINDS[o.k].key}, ${o.n} realms)`).join(', ');
    console.log(`${sim.fmtYear(sim.year).padStart(9)}: ${S.begun} outbreaks (${Object.keys(S.by).map((q) => q + ' ' + S.by[q]).join(', ')}), ${S.reached} realms reached, dead ${Math.round(S.dead - dead0)} since the last line | world ${Math.round(world)} (people ${sim.fmtPop ? sim.fmtPop(world) : ''}), the Americas ${(100 * am / Math.max(1e-9, world)).toFixed(1)}% | ${(ms / n).toFixed(4)} ms a year, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    if (act) console.log(`           under way: ${act}`);
    { const amR = sim.civs.filter((c) => c && c.capital >= 0 && isAmericas(c.capital)); const had = DS.KINDS.map((K) => amR.filter((c) => X.had[c.id * DS.NK + K.id]).length);
      console.log(`           the Americas: ${amR.length} realms; have had ${DS.KINDS.map((K, i) => K.key + ' ' + had[i]).join(', ')}`); }
    dead0 = S.dead; }
  console.log('  the worst: ' + X.past.slice().sort((a, b) => b.dead - a.dead).slice(0, 6).map((o) => `${o.name} ${sim.fmtYear(o.year)}-${sim.fmtYear(o.end)} ${o.realms} realms ${o.dead} dead`).join('; '));
}
