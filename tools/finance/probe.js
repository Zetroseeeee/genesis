// Money through the ages, in numbers: who owes what and at what rate, defaults, debased coin, the banking houses and the
// chartered companies of the world, the panics, and what the autopilot's courts hold.
//   node tools/finance/probe.js [seed[,seed...]] [last year]
// The world is run from 10,000 BC; at each date it prints how many realms can borrow and how many owe, what the world owes
// against what it takes in a year, the rate the usual debtor pays, the greatest debtors (in years of their income), what
// has happened since the date before (borrowed, repaid, defaults, debasements, restorations, houses opened and failed,
// companies chartered and crashed, panics), the greatest houses and companies, and how much the autopilot's courts hold in
// turns of their income. What to hold it to: no credit before the tribute lists; a few debtors in the Bronze and Iron Ages
// (wars that outlast what a court has put by), more from banking, many from the exchange; the usual debtor owing a few
// years of its income; a default somewhere every century or two from the Middle Ages and a great one now and then that
// takes houses down with it; houses from banking (a few dozen by the Renaissance), companies from the chartered companies,
// a bubble that bursts now and then; the courts holding a turn or two of their income; a year of finance a small fraction
// of a millisecond. Run it after touching finance.js, then the war-and-peace probe (the world must go on fighting as it did).
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number);
const lastArg = args.find((a) => /^-?\d+$/.test(a) && !/,/.test(a) && a !== String(seeds[0])); const last = lastArg !== undefined ? +lastArg : 2050;
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'disease', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const DATES = [-3000, -2000, -1000, -500, 0, 500, 1000, 1300, 1500, 1650, 1800, 1900, 1950, 2000, 2050].filter((y) => y <= last);
const q = (a, f) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * f))] : 0);
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const F = sim.finance; const TURN = window.FINANCE.TURN;
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  let k = 0, ms = 0, years = 0; const t0 = Date.now(); let was = Object.assign({}, F.stats);
  console.log(`\nseed ${seed}`);
  while (k < DATES.length && sim.year < last) {
    sim.tick(); ms += F.stats.ms; years++;
    if (sim.year < DATES[k]) continue; k++;
    const S = F.stats, d = (key) => S[key] - (was[key] || 0);
    const realms = sim.civs.filter(Boolean); const can = realms.filter((cv) => F.canBorrow(cv.id)); const owing = can.filter((cv) => F.debt[cv.id] > 0);
    let debt = 0, gross = 0; for (const cv of can) { debt += F.debt[cv.id]; gross += F.grossOf(cv); }
    const years_ = owing.map((cv) => F.debt[cv.id] / F.grossOf(cv)).sort((a, b) => a - b); const rates = owing.map((cv) => F.rateOf[cv.id]).sort((a, b) => a - b);
    const top = owing.slice().sort((a, b) => F.debt[b.id] / F.grossOf(b) - F.debt[a.id] / F.grossOf(a)).slice(0, 3).map((cv) => `${sim.fullName(cv)} ${(F.debt[cv.id] / F.grossOf(cv)).toFixed(1)} yrs at ${(100 * F.rateOf[cv.id]).toFixed(1)}%${sim.civs[cv.id].wars && Object.keys(cv.wars).length ? ' (at war)' : ''}`).join(', ');
    const hs = F.houses.filter((x) => !x.fail), cos = F.companies.filter((y) => !y.gone);
    const hoards = realms.filter((cv) => !cv.player && cv.income > 0).map((cv) => cv.wealth / (cv.income * TURN[cv.era])).sort((a, b) => a - b);
    const debased = realms.filter((cv) => F.fine[cv.id] < 0.999).length, panicky = realms.filter((cv) => F.panic[cv.id] > 0.2).length;
    console.log(`${sim.fmtYear(sim.year).padStart(9)}: ${can.length} of ${realms.length} realms can borrow, ${owing.length} owe; the world owes ${(debt / Math.max(1e-9, gross)).toFixed(2)} years of its income; a debtor owes ${q(years_, 0.5).toFixed(1)} yrs (the tenth from the top ${q(years_, 0.9).toFixed(1)}) at ${(100 * q(rates, 0.5)).toFixed(1)}%  | ${((Date.now() - t0) / 1000).toFixed(0)} s, ${(ms / Math.max(1, years)).toFixed(3)} ms a year`);
    console.log(`           since: borrowed ${d('borrowed').toFixed(0)}, repaid ${d('repaid').toFixed(0)}, ${d('defaults')} defaults, ${d('debased')} debasements, ${d('restored')} restored, ${d('houses')} houses opened, ${d('failed')} failed, ${d('companies')} companies chartered, ${d('crashes')} crashed, ${d('panics')} panics; now ${debased} realms with debased coin, ${panicky} in a panic`);
    console.log(`           the courts hold ${q(hoards, 0.1).toFixed(2)} / ${q(hoards, 0.5).toFixed(2)} / ${q(hoards, 0.9).toFixed(2)} turns of their income (a tenth from the bottom, the middle, a tenth from the top)`);
    if (top) console.log(`           the greatest debtors: ${top}`);
    if (hs.length) console.log(`           houses ${hs.length}: ${hs.slice().sort((a, b) => b.cap - a.cap).slice(0, 3).map((x) => `${x.name} (${x.c >= 0 && sim.civs[x.c] ? sim.fullName(sim.civs[x.c]) : 'no realm'}; capital ${x.cap.toFixed(0)}, lent ${x.lent.toFixed(0)})`).join('; ')}`);
    if (cos.length) console.log(`           companies ${cos.length}: ${cos.slice().sort((a, b) => b.val * b.cap - a.val * a.cap).slice(0, 3).map((y) => `${y.name} (${y.c >= 0 && sim.civs[y.c] ? sim.fullName(sim.civs[y.c]) : '?'}; at ${y.val.toFixed(2)}, returns ${(100 * y.ret).toFixed(1)}%)`).join('; ')}`);
    was = Object.assign({}, S);
  }
}
