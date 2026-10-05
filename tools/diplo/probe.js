// War and peace through the ages, in numbers: how many realms there are, how often they go to war and why, how long
// wars last and on what terms they end, what realms have sworn to one another, who is whose vassal, what they think
// of one another.
//   node tools/diplo/probe.js [seed] [last year]
//   SRC=<dir> node tools/diplo/probe.js ...     the same world from another checkout's src (to compare with an older game)
// Run it after touching diplo.js or the simulation's wars: the world should fight about as often as it did (a war or
// two a generation for a realm that has neighbours, fewer once the world keeps accounts of unprovoked wars), most
// realms should be bound to somebody, and vassals, unions and broken oaths should be events, not weather.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const src = process.env.SRC ? path.resolve(process.env.SRC) : path.join(root, 'src');
for (const f of ['econ', 'know', 'rule', 'diplo', 'sim']) { const p = path.join(src, f + '.js'); if (fs.existsSync(p)) (0, eval)(fs.readFileSync(p, 'utf8')); }
const args = process.argv.slice(2).map(Number); const seed = args[0] || 12345, last = args[1] === undefined ? 2050 : args[1];
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
const sim = window.createSim(wd, seed);
{ let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
const DATES = [-8000, -6000, -4000, -3000, -2000, -1000, -500, 0, 500, 1000, 1400, 1600, 1800, 1900, 1950, 2000, 2050].filter((y) => y <= last);
const D = sim.diplo || null, DP = window.DIPLO || null;
// what has happened since the last date: wars begun (counted off the realms themselves, so that an older game can be measured too),
// realm-years lived and realm-years at war, wars ended and how long they were, realms born and gone
let begun = 0, ryears = 0, wyears = 0, ended = 0, endedLen = 0, born = 0, gone = 0, bigTaken = 0; const open = new Map(); let alive = new Set();
let prev = D ? JSON.parse(JSON.stringify(D.stats)) : null; let k = 0, y0 = sim.year; const t0 = Date.now(); let dipMs = 0;
const delta = (o, p) => { const out = {}; for (const key in o) { const v = o[key] - ((p && p[key]) || 0); if (v) out[key] = v; } return out; };
const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([key, v]) => `${key} ${v}`).join(', ') || 'none';
while (k < DATES.length) {
  sim.tick(); const y = sim.year; const now = new Set(); const seen = new Set();
  for (const cv of sim.civs) { if (!cv) continue; now.add(cv.id + ':' + cv.founded); ryears++; let w = 0; for (const b in cv.wars) { w++; const key = Math.min(cv.id, +b) + '-' + Math.max(cv.id, +b); seen.add(key); if (!open.has(key)) { open.set(key, cv.wars[b]); begun++; } } if (w) wyears++; }
  for (const [key, since] of open) if (!seen.has(key)) { open.delete(key); ended++; endedLen += y - since; }
  for (const id of now) if (!alive.has(id)) born++; for (const id of alive) if (!now.has(id)) gone++; alive = now;
  if (y < DATES[k]) continue;
  let n = 0, pop = 0, stab = 0, biggest = 0, cells = 0; const sizes = [];
  for (const cv of sim.civs) { if (!cv) continue; n++; pop += sim.popOf[cv.id]; stab += cv.stability; cells += sim.cellsOf[cv.id]; sizes.push(sim.cellsOf[cv.id]); if (sim.cellsOf[cv.id] > biggest) biggest = sim.cellsOf[cv.id]; }
  sizes.sort((a, b) => b - a); const top5 = sizes.slice(0, 5).reduce((s, v) => s + v, 0); const span = Math.max(1, y - y0);
  console.log(`\n${sim.fmtYear(y)}: ${n} realms (${born} born, ${gone} gone), ${(pop / 1000).toFixed(0)} m people, stability ${(stab / Math.max(1, n)).toFixed(2)}; the five greatest hold ${Math.round(100 * top5 / Math.max(1, cells))}% of all held land  | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const joined = D ? D.stats.joined - prev.joined : 0;
  console.log(`  wars: ${begun} begun, ${joined} of them beside a friend (${(begun / (ryears / 100)).toFixed(2)} for a realm in a century, ${((begun - joined) / (ryears / 100)).toFixed(2)} of its own), ${open.size} being fought, ${ended} ended after ${ended ? (endedLen / ended).toFixed(0) : '-'} years on average; a realm is at war ${Math.round(100 * wyears / Math.max(1, ryears))}% of its years`);
  if (D) {
    const S = D.stats; const dw = delta(S.wars, prev.wars), dp = delta(S.pacts, prev.pacts), de = delta(S.peace, prev.peace);
    console.log(`  why: ${fmt(dw)}`); console.log(`  peace: ${fmt(de)}`);
    console.log(`  sworn: ${fmt(dp)}; broken ${S.broken - prev.broken}, refused ${S.refused - prev.refused}; vassals made ${S.vassals - prev.vassals}, freed ${S.freed - prev.freed}, unions ${S.unions - prev.unions}; called to arms ${S.joined - prev.joined}`);
    // as things stand: who is bound to whom, what realms think of those they touch
    const inForce = {}; let vass = 0, bound = 0, op = 0, opN = 0, hostile = 0, warm = 0, rep = 0, inf = 0, trib = 0, emb = 0;
    for (const cv of sim.civs) { if (!cv) continue; const d = D.D(cv); rep += d.rep; inf += d.inf; if (d.lord >= 0) vass++; let any = d.lord >= 0; for (const b in d.pact) for (const kind in d.pact[b]) if (D.has(cv, +b, kind)) { inForce[kind] = (inForce[kind] || 0) + 0.5; any = true; } if (any || D.vassalsOf(cv.id).length) bound++; if (d.ban) for (const _ in d.ban) emb++;
      trib += D.trIn[cv.id]; const nb = D.reach(cv.id); for (const b of nb) { if (!D.touches(cv, b)) continue; const o = D.opinion(cv, sim.civs[b]); op += o; opN++; if (o <= -35) hostile++; else if (o >= 12) warm++; } }
    console.log(`  in force: ${fmt(inForce)}; ${vass} vassals; ${bound} of ${n} realms bound to somebody; ${emb} embargoes; tribute ${trib.toFixed(0)} a year`);
    console.log(`  minds: of those it touches a realm thinks ${(op / Math.max(1, opN)).toFixed(1)} on average over ${opN} pairs (${Math.round(100 * warm / Math.max(1, opN))}% warm or better, ${Math.round(100 * hostile / Math.max(1, opN))}% hostile); word ${(rep / Math.max(1, n)).toFixed(0)}, infamy ${(inf / Math.max(1, n)).toFixed(1)}`);
    prev = JSON.parse(JSON.stringify(S));
  }
  begun = 0; ryears = 0; wyears = 0; ended = 0; endedLen = 0; born = 0; gone = 0; y0 = y; k++;
}
if (D) { const ev = sim.allEvents.filter((e) => e.type === 'pact').slice(-28); console.log('\nthe last things agreed and broken:'); for (const e of ev) console.log(`  ${sim.fmtYear(e.year)}  ${e.text}`); }
