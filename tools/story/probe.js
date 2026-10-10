// The stories of a world through the ages, in numbers: how many the autopilot's realms are told and of which kinds, what
// they choose (the first, second or third choice of each), what lasts on the realms (stability, income, learning and renown
// for some years) and how long a year of stories takes.
//   node tools/story/probe.js [seed[,seed...]] [last year]
// What to hold it to: stories from the first settled peoples on, a few a year across the world by the Middle Ages; every
// kind told somewhere (those of the player's family only, the birth and the wedding and a master's patronage, never); no
// choice taken always or never (a story whose middle choice nobody takes asks the wrong question); a realm with something
// lasting from its stories now and then, not always; a year of stories well under a millisecond. Then the war-and-peace
// probe over 12345 and 777: the world must go on as it did.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number);
const lastArg = args.find((a) => /^-?\d+$/.test(a) && !/,/.test(a) && a !== String(seeds[0])); const last = lastArg !== undefined ? +lastArg : 2000;
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
{ const sp = PNG.sync.read(fs.readFileSync(path.join(root, 'data/soil.png'))); wd.soil = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { wd.soil[i * 3] = sp.data[i * 4]; wd.soil[i * 3 + 1] = sp.data[i * 4 + 1]; wd.soil[i * 3 + 2] = sp.data[i * 4 + 2]; } }      // (what the land feeds: land.js)
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'disease', 'land', 'climate', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const DATES = [-6000, -3000, -1000, 0, 500, 1000, 1300, 1500, 1700, 1850, 1950, 2000, 2050].filter((y) => y <= last);
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const S = sim.story, L = window.STORY.LIST;
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.homeOf(i); if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  let k = 0, ms = 0, years = 0, was = Object.assign({}, S.stats.by), told0 = S.stats.told; const t0 = Date.now();
  console.log(`\nseed ${seed}`);
  while (k < DATES.length && sim.year < last) {
    sim.tick(); ms += S.stats.ms; years++;
    if (sim.year < DATES[k]) continue; k++;
    const by = S.stats.by; const fresh = Object.keys(by).map((key) => [key, by[key] - (was[key] || 0)]).filter((q) => q[1] > 0).sort((a, b) => b[1] - a[1]);
    const realms = sim.civs.filter(Boolean); const lasting = realms.filter((cv) => cv.story && cv.story.m.length).length;
    const st = realms.reduce((s, cv) => s + (sim.story.unrest(cv)), 0), inc = realms.map((cv) => sim.story.incF(cv.id)).filter((f) => f !== 1), ins = realms.map((cv) => sim.story.insF(cv.id)).filter((f) => f !== 1);
    console.log(`${sim.fmtYear(sim.year).padStart(9)}: ${S.stats.told - told0} stories told since (${fresh.length} kinds; ${fresh.slice(0, 6).map(([a, b]) => a + ' ' + b).join(', ')}) | ${((Date.now() - t0) / 1000).toFixed(0)} s, ${(ms / Math.max(1, years)).toFixed(3)} ms a year`);
    console.log(`           lasting: ${lasting} of ${realms.length} realms; stability ${(st >= 0 ? '+' : '') + (100 * st / Math.max(1, realms.length)).toFixed(2)} a realm on the whole; income ×${inc.length ? (inc.reduce((a, b) => a + b, 0) / inc.length).toFixed(3) : '1'} where changed (${inc.length}); learning ×${ins.length ? (ins.reduce((a, b) => a + b, 0) / ins.length).toFixed(3) : '1'} (${ins.length})`);
    was = Object.assign({}, by); told0 = S.stats.told;
  }
  const never = L.filter((st) => !S.stats.by[st.k] && !st.follow && st.who !== 'player').map((st) => st.k);
  console.log(`  every kind: ${Object.keys(S.stats.by).length} told; never told (and could be): ${never.join(', ') || 'none'}; told ${S.stats.told}, by the autopilot ${S.stats.ai}`);
  // which choice is taken, story by story (a choice taken always or never asks the wrong question)
  const P = S.stats.pick; console.log('  choices taken: ' + Object.keys(P).sort((a, b) => (P[b][0] + P[b][1] + P[b][2]) - (P[a][0] + P[a][1] + P[a][2])).map((key) => { const q = P[key], n = q[0] + q[1] + q[2]; return `${key} ${q.map((v) => Math.round(100 * v / n)).join('/')}`; }).join(', '));
  // what the great realms' chronicles say they chose
  const all = []; for (const cv of sim.civs) if (cv) for (const e of cv.events) if (e.type === 'story') all.push(`${sim.fmtYear(e.year)} ${e.text}`);
  console.log('  from the chronicles:\n    ' + all.slice(-10).join('\n    '));
}
