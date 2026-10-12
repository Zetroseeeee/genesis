// A world through the Space Age (the tenth age: knowledge from 1.0 to 1.15, history's 2030 to 2150): how many realms are in each age
// at each date, the most learned realm, the world's people, and whether anything on a realm is not a number; what the leader knows of
// the Space Age and how it is governed; the save, loaded again and run on.
//   node tools/space/probe.js [seed] [last year]
// Run it after touching any table by age (a table one short gives undefined, and that is NaN in everything downstream). Measured for
// 0.43 over 12345: 26 realms in the Space Age in 2030, 196 of 229 by 2050; the leader at 1.15 in 2150, every discovery of the age
// learned; people 9.8 billion in 2030, 11.8 in 2050, 12.9 in 2075 (the most there ever are: small families, FAMILY in sim.js),
// 12.7 in 2100, 10.7 in 2150 (without small families 14.3 in 2100 and 14.0 in 2150); no NaN; a save of 4 MB; four and a half
// minutes.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const seed = +(process.argv[2] || 12345), last = +(process.argv[3] || 2150);
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
{ const sp = PNG.sync.read(fs.readFileSync(path.join(root, 'data/soil.png'))); wd.soil = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { wd.soil[i * 3] = sp.data[i * 4]; wd.soil[i * 3 + 1] = sp.data[i * 4 + 1]; wd.soil[i * 3 + 2] = sp.data[i * 4 + 2]; } }
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'disease', 'land', 'climate', 'migrate', 'woods', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const sim = window.createSim(wd, seed);
{ let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.homeOf(i); if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
const t0 = Date.now(); const DATES = [1900, 1970, 2000, 2030, 2050, 2075, 2100, 2125, 2150].filter((y) => y <= last);
const bad = (v) => typeof v === 'number' && !Number.isFinite(v);
for (const D of DATES) {
  while (sim.year < D) sim.tick();
  const live = sim.civs.filter((c) => c && c.capital >= 0); const byEra = new Array(10).fill(0); let tmax = 0, nan = [];
  for (const c of live) { byEra[c.era]++; if (c.tech > tmax) tmax = c.tech; for (const k of ['tech', 'stability', 'treasury', 'income', 'strength']) if (bad(c[k])) nan.push(c.id + '.' + k); }
  let pop = 0; for (const i of sim.LI) pop += sim.pop[i];
  const lead = live.slice().sort((a, b) => b.tech - a.tech)[0];
  console.log(`${sim.fmtYear(sim.year).padStart(8)}: ${live.length} realms, ages ${byEra.join(' ')} | best tech ${tmax.toFixed(3)} (${lead ? sim.fullName(lead) : ''}) | people ${(pop / 1000).toFixed(0)} m | ${nan.length ? 'NaN ' + nan.slice(0, 6).join(' ') : 'no NaN'} | ${Math.round((Date.now() - t0) / 1000)} s`);
}
const lead = sim.civs.filter((c) => c && c.capital >= 0).sort((a, b) => b.tech - a.tech)[0];
if (lead) { const k = sim.know; const got = window.KNOW.LIST.filter((d) => d.era === 9 && k.has[lead.id * k.ND + d.id]).map((d) => d.key); console.log('the leader knows of the Space Age:', got.join(', ') || 'nothing'); const R = sim.rule.ruleOf(lead); console.log('its government:', R.gov, '| laws:', Object.values(R.laws).join(' ')); }
const s = sim.save(); const js = JSON.stringify(s); console.log('save', (js.length / 1e6).toFixed(1), 'MB');
const sim2 = window.createSim(wd, seed); sim2.load(JSON.parse(js)); for (let k = 0; k < 10; k++) sim2.tick(); console.log('loaded and ran on: year', sim2.year, '| realms', sim2.civs.filter((c) => c && c.capital >= 0).length);
