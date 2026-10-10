// The weather through the ages, in numbers (climate.js): how many regions lie under the ice and how green the dry lands are, how much of
// the world's land and how many of its realms a bad year has, the harvest of the world's people against an ordinary year's, how many
// starved since the date before (and how many realms, and the worst), the great droughts and colds that began and whom they struck,
// the world's people, and how long a year of it takes.
//   node tools/climate/probe.js [seed[,seed...]] [last year]
// What to hold it to: ice over Canada and Scandinavia at the start, gone from Scandinavia by 7600 BC and from Labrador by 4800 BC;
// the Sahara green from 9000 to 4000 BC and desert by 2500 BC; a few per cent of the land in a bad year at any time, the world's
// harvest within a hundredth or two of an ordinary year's; famine dead a few per cent of the world in a century, far more where a
// great drought falls (the lands between the rivers about 2200 BC); the world's people near history's (tools/know/people.js: refit
// FOOD if they fall away); a year about a tenth of a millisecond. Then the war-and-peace probe over 12345 and 777.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number);
const lastArg = args.find((a) => /^-?\d+$/.test(a) && !/,/.test(a) && a !== String(seeds[0])); const last = lastArg !== undefined ? +lastArg : 2050;
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
{ const sp = PNG.sync.read(fs.readFileSync(path.join(root, 'data/soil.png'))); wd.soil = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { wd.soil[i * 3] = sp.data[i * 4]; wd.soil[i * 3 + 1] = sp.data[i * 4 + 1]; wd.soil[i * 3 + 2] = sp.data[i * 4 + 2]; } }      // (what the land feeds: land.js)
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'disease', 'land', 'climate', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const DATES = [-9000, -8000, -7000, -6000, -5000, -4000, -3000, -2000, -1000, 0, 500, 1000, 1300, 1500, 1600, 1700, 1800, 1900, 1950, 2000, 2050].filter((y) => y <= last);
const CL_ = window.CLIMATE;
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const C = sim.climate;
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.homeOf(i); if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  let ms = 0, n = 0, k = 0, dead = 0, worst = null; const seen = new Set(); console.log(`\nseed ${seed}`);
  while (k < DATES.length && sim.year < last) {
    sim.tick(); ms += C.stats.ms; n++;
    for (const cv of sim.civs) { if (!cv) continue; const d = sim.starvedOf(cv.id); if (d > 0) { dead += d; if (!worst || d > worst.d) worst = { d, name: sim.fullName(cv), year: sim.year, share: d / Math.max(1e-6, sim.popOf[cv.id] + d) }; } }
    if (sim.year < DATES[k]) continue; k++;
    let world = 0, ice = 0, wet = 0, bad = 0, land = 0, hv = 0; for (const i of sim.LI) { const p = sim.pop[i]; world += p; hv += p * C.hv[i]; ice += C.ice[i]; wet += C.wet[i]; if (!C.ice[i]) { land++; if (C.hv[i] < 0.9) bad++; } }
    let realmsBad = 0, realms = 0; for (const cv of sim.civs) if (cv) { realms++; if (sim.harvestOf(cv.id) < 0.9) realmsBad++; }
    const evs = CL_.EVENTS.filter((e) => e.y0 <= sim.year && !seen.has(e.key)); for (const e of evs) seen.add(e.key);
    console.log(`${sim.fmtYear(sim.year).padStart(9)}: people ${(world / 1000).toFixed(1)} m in ${realms} realms; ice ${ice} regions, green ${Math.round(wet)}; a bad year on ${(100 * bad / land).toFixed(1)}% of the land, ${realmsBad} realms; the world's harvest ${(hv / world).toFixed(3)}; ${C.spells.length} spells; starved since ${(dead / 1000).toFixed(2)} m (${(100 * dead / world).toFixed(2)}% of the world)${worst ? `, the worst ${worst.name} in ${sim.fmtYear(worst.year)} (${(100 * worst.share).toFixed(1)}%)` : ''} | ${(ms / n).toFixed(3)} ms a year (${C.epoch().name})`);
    if (evs.length) console.log(`           begun: ${evs.map((e) => e.name).join('; ')}`);
    ms = 0; n = 0; dead = 0; worst = null;
  }
  console.log(`  droughts begun ${C.stats.droughts}, good years ${C.stats.plenty}, great events ${C.stats.events}`);
}
