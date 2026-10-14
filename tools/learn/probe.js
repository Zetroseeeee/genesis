// What the world learns of the player and what it does about it (learn.js), in numbers. A world is run to a date without a player;
// then a realm of middling size with several neighbours is made the player's, and played turn by turn by a script of one kind:
//   peace    keeps the peace: swears what is offered, answers calls to arms, takes every peace
//   bully    falls on the weakest neighbour he can beat whenever he is not at war, takes a peace after two turns of it, leaves his friends alone
//   traitor  swears what is offered, throws a pact over now and then, falls on those sworn to him, refuses calls to arms
// and at every few turns it prints: how many courts have heard much of him; how many fear him more than they would anyone, and the
// most; the leagues sworn among those who fear him; the offers and demands that came to him; what his neighbours think of him; what
// the world believes of his word and his friendship; how long a turn's reckoning took.
//   node tools/learn/probe.js [seed] [start year] [turns] [kinds]      (12345, -1000, 30, 'peace,bully,traitor')
// What to hold it to (0.58, seed 12345 from 1000 BC, thirty turns): a bully is feared by most of those who know him within ten turns,
// and leagues are sworn against him; a peaceful player is feared by nobody, and is offered pacts; a traitor's word is worth little.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'learn', 'disease', 'land', 'climate', 'migrate', 'woods', 'replay', 'sim']) { const p = path.join(root, 'src', f + '.js'); if (fs.existsSync(p)) (0, eval)(fs.readFileSync(p, 'utf8')); }
const args = process.argv.slice(2); const seed = +(args[0] || 12345), start = +(args[1] === undefined ? -1000 : args[1]), turns = +(args[2] || 30), kinds = (args[3] || 'peace,bully,traitor').split(',');
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
{ const sp = PNG.sync.read(fs.readFileSync(path.join(root, 'data/soil.png'))); wd.soil = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { wd.soil[i * 3] = sp.data[i * 4]; wd.soil[i * 3 + 1] = sp.data[i * 4 + 1]; wd.soil[i * 3 + 2] = sp.data[i * 4 + 2]; } }
// the world, to the start, without a player (as the other probes make it)
const base = window.createSim(wd, seed);
{ let placed = 0, tries = 0; while (placed < 25 && tries < 20000) { tries++; const i = base.LI[Math.floor(base.rnd() * base.LI.length)]; const f = base.homeOf(i); if (f < 0.45 || base.owner[i] >= 0) continue; if (base.rnd() > f * f) continue; if (base.spawnTribe(i, {})) placed++; } }
const t0 = Date.now(); while (base.year < start) base.tick(); console.log(`a world of seed ${seed} run to ${base.fmtYear(base.year)} in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${base.civs.filter(Boolean).length} realms`);
const saved = JSON.stringify(base.save());
// the realm the player takes: of middling size, with the most neighbours
const nbs = (s, c) => (s.diplo.reach(c.id) || []).filter((b) => s.civs[b] && s.diplo.touches(c, b));
let pick = null, best = -1; for (const c of base.civs) { if (!c) continue; const n = base.cellsOf[c.id]; if (n < 15 || n > 120) continue; const k = nbs(base, c).length; if (k > best) { best = k; pick = c; } }
console.log(`the player's realm: ${base.fullName(pick)}, ${base.cellsOf[pick.id]} regions, ${best} neighbours`);
const pct = (v) => `${Math.round(v * 100)}%`;
for (const kind of kinds) {
  const sv = JSON.parse(saved); sv.player = pick.id; sv.civs[pick.id].player = true; const s = window.createSim(wd, seed); s.load(sv);
  const c = s.playerCiv(), D = s.diplo, L = s.learn, P = () => window.DIPLO.PACE[Math.max(0, Math.min(9, c.era | 0))];
  const got = {}; let warsBegun = 0, broke = 0, leagues0 = 0; const t1 = Date.now(); let slow = 0;
  console.log(`\n${kind}:`);
  for (let t = 0; t < turns && s.playerCiv(); t++) {
    // his answers to what waits for him
    for (const o of D.D(c).offers.slice()) { got[o.kind] = (got[o.kind] || 0) + 1; const yes = o.kind === 'peace' ? (kind !== 'bully' || (s.year - (c.wars[o.from] || s.year)) >= 2 * P()) : o.kind === 'call' ? kind === 'peace' : o.kind === 'submit' ? false : kind !== 'bully'; D.answer(c, o.id, yes); }
    // what he does
    if (kind === 'bully' && !Object.keys(c.wars).length) { const v = nbs(s, c).map((b) => s.civs[b]).filter((b) => !D.cannotFight(c, b) && D.ratio(c, b) > 1.3).sort((a, b) => D.ratio(c, b) - D.ratio(c, a))[0]; if (v && !D.declare(c, v)) warsBegun++; }
    if (kind === 'traitor') {
      for (const b of nbs(s, c).map((x) => s.civs[x])) if (!D.cannot(c, b, 'nap') && D.judge(b, c, 'nap').ok) D.propose(c, b, 'nap');
      if (t % 3 === 2) { const sworn = nbs(s, c).map((b) => s.civs[b]).filter((b) => D.has(c, b.id, 'nap')); if (sworn.length) { const b = sworn[t % sworn.length]; if (D.ratio(c, b) > 1.2 && !D.cannotFight(c, b)) { if (!D.declare(c, b)) { warsBegun++; broke++; } } else if (!D.breakPact(c, b, 'nap')) broke++; } }
      for (const k in c.wars) if ((s.year - c.wars[k]) >= 2 * P()) D.sue(c, s.civs[+k], 'white');
    }
    if (kind === 'bully') for (const k in c.wars) if ((s.year - c.wars[k]) >= 2 * P()) { const b = s.civs[+k]; if (b && D.sue(c, b, D.score(c, b) > 0.15 ? 'tribute' : 'white', c.id)) D.sue(c, b, 'white'); }
    const y0 = s.year; while (s.year < y0 + P() && s.playerCiv()) { const a = Date.now(); s.tick(); slow = Math.max(slow, Date.now() - a); }
    if ((t + 1) % 5 === 0 || t === turns - 1) {
      let heard = 0, n = 0; for (const b of s.civs) { if (!b || b === c) continue; n++; if (L.heardOf(b) > 0.5) heard++; }
      const F = L.fearful(0.1); const inF = new Set(F.map(([b]) => b.id)); let leagues = 0; for (const [b] of F) for (const k in D.D(b).pact) { if (+k > b.id && inF.has(+k) && D.has(b, +k, 'defence')) leagues++; }
      const ns = nbs(s, c); const op = ns.length ? ns.reduce((t2, b) => t2 + D.opinion(s.civs[b], c), 0) / ns.length : 0; const B = L.belief(null); const pr = L.profile();
      const lines = c.events.filter((e) => /^Fearing /.test(e.text)).length;
      console.log(`  ${s.fmtYear(s.year).padEnd(9)} turn ${String(t + 1).padStart(2)}: ${heard} of ${n} courts know much of him; ${F.length} fear him${F.length ? ` (most: ${pct(F[0][1])} a turn, of anyone ${pct(F[0][2])})` : ''}; leagues ${leagues} (told ${lines}); neighbours think ${op.toFixed(0)}; pacts hold ${pct(B.keep(4))}, friends ${pct(B.ally)}; appetite ${pct(pr.base)} (anyone ${pct(pr.base0)}); wars begun ${warsBegun}, oaths broken ${broke}; offers ${Object.entries(got).map(([k, v]) => k + ' ' + v).join(', ') || 'none'}; reckoning ${L.st.ms} ms, slowest year ${slow} ms`);
    }
  }
  console.log(`  what they learned: ${L.profile().odds.filter((o) => Math.abs(Math.log(o.x)) >= 0.25).map((o) => `${o.key} ×${o.x.toFixed(2)}`).join(', ') || 'nothing'}; ${((Date.now() - t1) / 1000).toFixed(0)} s`);
}
