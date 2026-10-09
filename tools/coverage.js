// Which buildings of a town are real models and which still fall back to the procedural kit, by culture and era.
//   node tools/coverage.js [eras, default 0,1,2] [--all] [--wonder]     (needs data/models/index.json: tools/models/fetch.mjs)
//   --all lists the model behind every role; --wonder plans the capital with its age's wonder in place of the landmark
// For every culture a capital is planned with every work built (walls, port, academy, temple, market, wonder, mine,
// and every workshop its age knows)
// and each planned item is looked up the way the game does it (role first, then kind).
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const fs = require('fs'); const PNG = require('pngjs').PNG;
require('../src/geo.js'); (0, eval)(fs.readFileSync('src/town.js', 'utf8')); (0, eval)(fs.readFileSync('src/econ.js', 'utf8')); (0, eval)(fs.readFileSync('src/know.js', 'utf8')); (0, eval)(fs.readFileSync('src/rule.js', 'utf8')); (0, eval)(fs.readFileSync('src/diplo.js', 'utf8')); (0, eval)(fs.readFileSync('src/army.js', 'utf8')); (0, eval)(fs.readFileSync('src/people.js', 'utf8')); (0, eval)(fs.readFileSync('src/faith.js', 'utf8')); (0, eval)(fs.readFileSync('src/culture.js', 'utf8')); (0, eval)(fs.readFileSync('src/finance.js', 'utf8')); (0, eval)(fs.readFileSync('src/dynasty.js', 'utf8')); (0, eval)(fs.readFileSync('src/sim.js', 'utf8'));
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync('data/world.png'));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
const idx = JSON.parse(fs.readFileSync('data/models/index.json', 'utf8')); const CULT = window.TOWN.CULTURES;
const byKind = {}; for (const id in idx.models) { const e = idx.models[id]; const use = (kinds, eras, cultures) => { for (const k of kinds) (byKind[k] = byKind[k] || []).push({ id, eras, cultures }); }; use(e.kinds || [], e.eras || [0, 8], e.cultures || null); for (const u of e.also || []) use(u.kinds || [], u.eras || e.eras || [0, 8], u.cultures === undefined ? e.cultures || null : u.cultures); }
const pick = (kind, era, cul) => (byKind[kind] || []).filter((u) => era >= u.eras[0] && era <= u.eras[1] && (!u.cultures || u.cultures.includes(CULT[cul]))).map((u) => u.id);
const SITES = { med: [22.4, 38.2], north: [10, 52], east: [37, 52], mena: [44.4, 32.5], africa: [0, 10], sasia: [80, 26], easia: [113, 35], seasia: [104, 14], america: [-99, 19.3], namerica: [-90, 38.6] };
const TECH = [0, 0.1, 0.2, 0.33, 0.45, 0.58, 0.7, 0.85, 0.97];
const eras = (process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : '0,1,2').split(',').map(Number); const all = process.argv.includes('--all'); const wonder = process.argv.includes('--wonder');
for (const era of eras) {
  console.log(`\n=== era ${era} ===`);
  for (const name of Object.keys(SITES)) {
    const [lon, lat] = SITES[name]; const sim = createSim(wd, 7); const i = Math.floor((90 - lat) / 180 * H) * W + Math.floor((lon + 180) / 360 * W);
    const c = sim.setPlayer(i, 'T', [0.5, 0.5]); if (!c) { console.log(name, 'cannot found here'); continue; }
    c.tech = TECH[era]; c.era = sim.eraOf(c.tech); sim.pop[c.capital] = 6; sim.walls[c.capital] = 2; sim.special[c.capital] |= 1 | 2 | 4 | 8 | 512 | (wonder ? 16 | (era << 5) : 0); { const a = new Uint8Array(sim.IND.length); let plot = 4; sim.IND.forEach((k, q) => { if (!/Not before/.test(sim.cannot(k, c.capital) || '')) a[q] = 1 + (plot++ % 12); }); sim.ind.set(c.capital, a); }      // every workshop the age knows
    for (let t = 0; t < 3; t++) sim.tick(); c.eraSince = sim.year - 300;
    const L = window.TOWN.layout(sim, c.capital, c, {}); const cul = L.culture;
    const real = {}, kit = {};
    for (const it of L.items) { const e = it.era !== undefined ? it.era : L.era; let ids = it.as ? pick(it.as, e, cul) : []; if (!ids.length) ids = pick(it.kind, e, cul); const key = it.kind + (it.as ? '/' + it.as : '') + (it.tag ? '#' + it.tag : ''); if (ids.length) { real[key] = real[key] || { n: 0, ids: new Set() }; real[key].n++; ids.forEach((x) => real[key].ids.add(x)); } else kit[key] = (kit[key] || 0) + 1; }
    const nReal = Object.values(real).reduce((a, r) => a + r.n, 0), nKit = Object.values(kit).reduce((a, n) => a + n, 0);
    console.log(`${name.padEnd(9)} era ${c.era} culture ${CULT[cul]}: ${nReal} of ${nReal + nKit} items are models` + (nKit ? `  | KIT: ${Object.entries(kit).map(([k, n]) => k + ' x' + n).join(', ')}` : ''));
    if (all) for (const k in real) console.log(`      ${k.padEnd(28)} x${String(real[k].n).padEnd(4)} ${[...real[k].ids].join(', ')}`);
  }
}
