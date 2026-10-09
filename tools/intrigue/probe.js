// Spies and schemes through the ages, in numbers: how many schemes the world's realms begin, of which kind, how many succeed, fail and
// are found out, how many wars are fought over agents caught, how strong the networks are age by age, and how long a year of it takes.
//   node tools/intrigue/probe.js [seed[,seed...]] [last year]
// What to hold it to: schemes from the Bronze Age on, a few a turn among the great realms and no more (the world's wars, risings and
// successions are its own: a scheme now and then moves one); about half succeeding and a third found out (the odds and risks in
// intrigue.js); wars over agents caught a small share of all wars; murders of heirs rare; a year well under a tenth of a millisecond.
// Then the war-and-peace probe over 12345 and 777: the world must go on as it did.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number);
const lastArg = args.find((a) => /^-?\d+$/.test(a) && !/,/.test(a) && a !== String(seeds[0])); const last = lastArg !== undefined ? +lastArg : 2050;
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
{ const sp = PNG.sync.read(fs.readFileSync(path.join(root, 'data/soil.png'))); wd.soil = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { wd.soil[i * 3] = sp.data[i * 4]; wd.soil[i * 3 + 1] = sp.data[i * 4 + 1]; wd.soil[i * 3 + 2] = sp.data[i * 4 + 2]; } }      // (what the land feeds: land.js)
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'disease', 'land', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const DATES = [-3000, -1000, 0, 500, 1000, 1500, 1800, 1900, 2000, 2050].filter((y) => y <= last);
const IN = window.INTRIGUE;
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const X = sim.intrigue;
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.homeOf(i); if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  let ms = 0, n = 0, k = 0, was = { begun: 0, done: 0, caught: 0 }; const t0 = Date.now(); console.log(`\nseed ${seed}`);
  while (k < DATES.length && sim.year < last) { sim.tick(); ms += X.stats.ms; n++;
    if (sim.year < DATES[k]) continue; k++; const realms = sim.civs.filter(Boolean);
    const nets = {}; for (const c of realms) { const e = c.era; (nets[e] = nets[e] || []).push(X.netOf(c)); }
    const netTxt = Object.keys(nets).map((e) => `${e}:${(nets[e].reduce((a, b) => a + b, 0) / nets[e].length).toFixed(1)}`).join(' ');
    const busy = realms.filter((c) => c.intrigue && c.intrigue.s).length;
    const S = X.stats; const wars = sim.diplo.stats.wars;
    console.log(`${sim.fmtYear(sim.year).padStart(9)}: ${S.begun} schemes begun (+${S.begun - was.begun}), ${S.done} succeeded, ${S.failed} failed, ${S.caught} found out; ${busy} under way among ${realms.length} realms; wars over agents ${wars.spies || 0} of ${Object.values(wars).reduce((a, b) => a + b, 0)} | networks by age ${netTxt} | ${(ms / n).toFixed(4)} ms a year, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    was = { begun: S.begun, done: S.done, caught: S.caught }; }
  console.log('  by scheme (begun: succeeded / failed / found out): ' + IN.SCHEMES.map((s) => { const o = X.stats.out[s.key] || [0, 0, 0]; return `${s.key} ${X.stats.by[s.key] || 0}: ${o[0]}/${o[1]}/${o[2]}`; }).join(', '));
}
