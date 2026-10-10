// The world's culture through the ages in numbers, and what renown each age's realms usually hold.
//   node tools/culture/probe.js [seed[,seed...]] [last year] [--write]
// The world is run from 10,000 BC; at each date it prints how many great people have been born since the date before (of
// each kind) and how many live, how many works have been made, forgotten and lost and how many are kept, the golden ages,
// what the works brought (insight, authority), how much the realms that make great people have (towns, academies ...:
// culture.pointsOf, the middle realm's and the tenth from the top) and how many great people a turn the great realms and
// the middle ones bring forth, the most renowned realms and the greatest works. Every five years every realm's renown is
// added to its age's sums (as a logarithm: the usual realm is the one as many are above as below), weighted by the square
// root of its people; --write puts the result into src/culture.js between its NORM marks, which the simulation then holds
// every realm's renown against (culture.rel): run it twice over two seeds after changing how great people come, what their
// works are worth, or what renown is.
// What to hold it to: the first great people in the Bronze Age; a great realm (the tenth from the top) about one great
// person a turn from the Iron Age on, half that in the Bronze Age, the middle realm a fifth of that; a golden age now and
// then for the great realms (a few in a hundred of them at a time); the greatest realms many times the usual renown; the
// culture of a saved world well under a megabyte; a year of culture a small fraction of a millisecond.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const args = process.argv.slice(2); const seeds = (args.find((a) => /^\d+(,\d+)*$/.test(a)) || '12345').split(',').map(Number); const write = args.includes('--write');
const lastArg = args.find((a) => /^-?\d+$/.test(a) && !/,/.test(a) && a !== String(seeds[0])); const last = lastArg !== undefined ? +lastArg : 2050;
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
{ const sp = PNG.sync.read(fs.readFileSync(path.join(root, 'data/soil.png'))); wd.soil = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { wd.soil[i * 3] = sp.data[i * 4]; wd.soil[i * 3 + 1] = sp.data[i * 4 + 1]; wd.soil[i * 3 + 2] = sp.data[i * 4 + 2]; } }      // (what the land feeds: land.js)
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'disease', 'land', 'climate', 'sim']) (0, eval)(fs.readFileSync(path.join(root, 'src/' + f + '.js'), 'utf8'));
const DATES = [-4000, -3000, -2000, -1500, -1000, -500, 0, 500, 1000, 1400, 1600, 1800, 1900, 1950, 2000, 2050].filter((y) => y <= last);
const sum = new Float64Array(9), wsum = new Float64Array(9);
const q = (a, f) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * f))] : 0);
for (const seed of seeds) {
  const sim = window.createSim(wd, seed); const C = sim.culture; const TURN = window.CULTURE.TURN;
  { let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.homeOf(i); if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
  let k = 0, ms = 0, years = 0, bornAt = 0, workAt = 0, goldAt = 0, forgotAt = 0, lostAt = 0, insAt = 0, authAt = 0, lastYear = sim.year; const t0 = Date.now();
  let had = new Map();      // (each realm's great people at the date before, by the realm itself: numbers are given again to new realms)
  const goldNow = () => sim.civs.filter((cv) => cv && C.isGolden(cv.id)).length;
  console.log(`\nseed ${seed}`);
  while (k < DATES.length && sim.year < last) {
    sim.tick(); ms += C.stats.ms; years++;
    if (sim.year % 5 === 0) for (const cv of sim.civs) { if (!cv) continue; const c = cv.id, pp = sim.popOf[c]; if (!(pp > 0)) continue; const w = Math.sqrt(pp); sum[cv.era] += w * Math.log(C.renown[c] + 1); wsum[cv.era] += w; }
    if (sim.year < DATES[k]) continue; k++;
    const S = C.stats, byKind = {}; for (const g of C.greats) if (g.born > lastYear) byKind[C.KINDS[g.kind].key] = (byKind[C.KINDS[g.kind].key] || 0) + 1;
    let world = 0; for (const cv of sim.civs) if (cv) world += C.renown[cv.id];
    // the realms that make great people: what they have, and how many they brought forth a turn since the date before
    const makers = sim.civs.filter((cv) => cv && C.pace(cv.id) > 0).map((cv) => ({ cv, pts: C.pointsOf(cv.id), per: had.has(cv) ? (C.born[cv.id] - had.get(cv)) / Math.max(1e-9, (sim.year - lastYear) / TURN[cv.era]) : NaN })).sort((a, b) => b.pts - a.pts);
    const pts = makers.map((m) => m.pts).sort((a, b) => a - b); const top = makers.slice(0, Math.max(1, Math.round(makers.length / 10))).filter((m) => !isNaN(m.per)), mid = makers.slice(Math.round(makers.length * 0.3), Math.round(makers.length * 0.7)).filter((m) => !isNaN(m.per));
    const mean = (a) => (a.length ? a.reduce((x, m) => x + m.per, 0) / a.length : 0);
    const eras = {}; for (const m of makers) eras[m.cv.era] = (eras[m.cv.era] || 0) + 1;
    const best = sim.civs.filter(Boolean).sort((a, b) => C.renown[b.id] - C.renown[a.id]).slice(0, 4).map((cv) => `${sim.fullName(cv)} ${C.renown[cv.id].toFixed(0)} (${C.rel(cv.id).toFixed(1)}x${C.isGolden(cv.id) ? ', golden' : ''})`).join(', ');
    const greatest = C.works.filter((w) => !w.lost).sort((a, b) => b.value - a.value).slice(0, 3).map((w) => { const g = C.greatOf(w.by); return `${w.name} by ${g ? g.name : '?'} (${w.value})`; }).join('; ');
    const size = JSON.stringify(C.save()).length;
    console.log(`${sim.fmtYear(sim.year).padStart(9)}: ${S.born - bornAt} great people born (${C.alive.length} living), ${S.works - workAt} works made, ${S.forgot - forgotAt} forgotten, ${S.lost - lostAt} lost (${C.works.length} kept), ${S.golden - goldAt} golden ages (${goldNow()} now); renown in the world ${world.toFixed(0)}; insight ${((S.insight - insAt) * 1e5).toFixed(0)}, authority ${(S.auth - authAt).toFixed(0)}; saved ${(size / 1024).toFixed(0)} KB  | ${((Date.now() - t0) / 1000).toFixed(0)} s, ${(ms / Math.max(1, years)).toFixed(3)} ms a year`);
    console.log(`           ${makers.length} realms make great people (${Object.entries(eras).map(([e, n]) => sim.ERAS[e][0] + ' ' + n).join(', ')}); what they have: the middle ${q(pts, 0.5)}, the tenth from the top ${q(pts, 0.9)}, the most ${pts[pts.length - 1] || 0}; a turn: the great realms ${mean(top).toFixed(2)}, the middle ones ${mean(mid).toFixed(2)}`);
    console.log(`           of them: ${Object.entries(byKind).map(([a, b]) => a + ' ' + b).join(', ') || 'nobody'}`);
    console.log(`           most renowned: ${best || 'nobody'}`);
    if (greatest) console.log(`           greatest works: ${greatest}`);
    bornAt = S.born; workAt = S.works; goldAt = S.golden; forgotAt = S.forgot; lostAt = S.lost; insAt = S.insight; authAt = S.auth; lastYear = sim.year;
    had = new Map(); for (const cv of sim.civs) if (cv) had.set(cv, C.born[cv.id]);
  }
}
const table = []; for (let e = 0; e < 9; e++) table.push(wsum[e] > 0 ? +(Math.exp(sum[e] / wsum[e]) - 1).toFixed(1) : (e ? table[e - 1] : 0));
console.log(`\nwhat renown each age's usual realm holds (now, and what the file holds):\n  ${table.map((v) => v.toFixed(1).padStart(7)).join('')}\n  ${window.CULTURE.NORM.map((v) => v.toFixed(1).padStart(7)).join('')}`);
if (write) { const p = path.join(root, 'src/culture.js'); const s = fs.readFileSync(p, 'utf8'); const a = s.indexOf('// NORM-BEGIN'), z = s.indexOf('// NORM-END'); if (a < 0 || z < 0) throw new Error('no NORM marks in src/culture.js'); fs.writeFileSync(p, s.slice(0, a) + '// NORM-BEGIN\n  const NORM = [' + table.join(', ') + '];\n  ' + s.slice(z)); console.log('written to src/culture.js'); }
