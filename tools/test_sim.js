// GENESIS headless simulation test: runs sim.js in node for thousands of years and checks invariants,
// every player action and god power, save/load round trips, and memory bounds. Exit code 1 on any failure.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
require('../dist/geo.js'); require('../dist/town.js');
const fs = require('fs'); const PNG = require('pngjs').PNG;
(0, eval)(fs.readFileSync('src/econ.js', 'utf8'));
(0, eval)(fs.readFileSync('src/know.js', 'utf8')); (0, eval)(fs.readFileSync('src/rule.js', 'utf8')); (0, eval)(fs.readFileSync('src/diplo.js', 'utf8')); (0, eval)(fs.readFileSync('src/army.js', 'utf8')); (0, eval)(fs.readFileSync('src/people.js', 'utf8')); (0, eval)(fs.readFileSync('src/faith.js', 'utf8')); (0, eval)(fs.readFileSync('src/culture.js', 'utf8')); (0, eval)(fs.readFileSync('src/finance.js', 'utf8')); (0, eval)(fs.readFileSync('src/dynasty.js', 'utf8'));
(0, eval)(fs.readFileSync('src/sim.js', 'utf8')); // indirect eval: global scope, so Math/typed-array lookups stay fast
const W = 720, H = 360, N = W * H;
const png = PNG.sync.read(fs.readFileSync('data/world.png'));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }

const fails = []; let checks = 0; const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null; const want = (n) => !ONLY || ONLY.includes(String(n));
function check(cond, msg) { checks++; if (!cond) { fails.push(msg); console.log('  FAIL', msg); } }
const t0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// give a realm every discovery up to an age, and any others by name (the tests set `tech` by hand: this is the knowledge that goes with it)
const teach = (sim, c, upto, keys) => { for (const D of window.KNOW.LIST) if ((upto !== undefined && D.era <= upto) || (keys && keys.includes(D.key))) sim.know.learn(c.id, c, D.id, true); sim.know.lastT[c.id] = c.tech; sim.know.pool[c.id] = 0; };

function invariants(sim, tag) {
  let badPop = 0, badOwner = 0, badLevel = 0, orphanOwner = 0, nanCount = 0;
  const cellsOf = new Int32Array(sim.MAXC);
  for (let i = 0; i < N; i++) {
    const p = sim.pop[i]; if (!(p >= 0) || !isFinite(p)) { badPop++; if (Number.isNaN(p)) nanCount++; }
    const o = sim.owner[i]; if (o < -1 || o >= sim.MAXC) badOwner++; else if (o >= 0) { if (!sim.civs[o]) orphanOwner++; else cellsOf[o]++; }
    if (sim.level[i] > 4) badLevel++;
    if (sim.level[i] && o < 0) badLevel++;
  }
  check(badPop === 0, `${tag}: ${badPop} cells with negative/NaN population (${nanCount} NaN)`);
  check(badOwner === 0, `${tag}: ${badOwner} cells with out-of-range owner`);
  check(orphanOwner === 0, `${tag}: ${orphanOwner} cells owned by a dead realm`);
  check(badLevel === 0, `${tag}: ${badLevel} bad settlement levels`);
  let n = 0;
  for (const c of sim.civs) { if (!c) continue; n++;
    check(isFinite(c.tech) && c.tech >= 0 && c.tech <= 1, `${tag}: ${c.name} tech ${c.tech}`);
    check(isFinite(c.stability) && c.stability >= 0 && c.stability <= 1, `${tag}: ${c.name} stability ${c.stability}`);
    check(isFinite(c.wealth), `${tag}: ${c.name} wealth ${c.wealth}`);
    check(c.era === sim.eraOf(c.tech), `${tag}: ${c.name} era ${c.era} != eraOf(${c.tech})`);
    check(c.capital >= 0 && c.capital < N, `${tag}: ${c.name} capital ${c.capital}`);
    check(sim.owner[c.capital] === c.id || cellsOf[c.id] === 0, `${tag}: ${c.name} capital not owned (owner ${sim.owner[c.capital]})`);
    check(Math.abs(cellsOf[c.id] - sim.cellsOf[c.id]) <= 2, `${tag}: ${c.name} cellsOf ${sim.cellsOf[c.id]} vs counted ${cellsOf[c.id]}`);
    for (const k of Object.keys(c.wars)) { const b = sim.civs[+k]; check(!b || b.wars[c.id] !== undefined, `${tag}: one-sided war ${c.name} -> ${k}`); }
    check(c.ruler && c.ruler.name, `${tag}: ${c.name} has no ruler`);
    check(c.events.length <= 80, `${tag}: ${c.name} events unbounded (${c.events.length})`);
    // what it has sworn: to living realms only, the same on both sides; a lord that lives, is not its own vassal and is not its enemy
    const d = c.dip; check(!!d, `${tag}: ${c.name} has no diplomatic record`); if (!d) continue;
    check(d.rep >= 0 && d.rep <= 100 && d.inf >= 0 && d.inf <= 80 && isFinite(d.rep + d.inf), `${tag}: ${c.name} word ${d.rep}, infamy ${d.inf}`);
    for (const k in d.pact) { const b = sim.civs[+k]; check(!!b && b !== c, `${tag}: ${c.name} is sworn to a realm that is gone (${k})`); if (!b) continue; for (const kind in d.pact[k]) check(!!b.dip.pact[c.id] && b.dip.pact[c.id][kind] === d.pact[k][kind], `${tag}: a one-sided ${kind} between ${c.name} and ${b.name}`); }
    if (d.lord >= 0) { const l = sim.civs[d.lord]; check(!!l && l !== c, `${tag}: ${c.name} has a lord that is gone (${d.lord})`); if (l) { check(l.dip.lord !== c.id, `${tag}: ${c.name} and ${l.name} are each other's lords`); check(c.wars[l.id] === undefined, `${tag}: ${c.name} is at war with its lord`); } }
    for (const k in d.side) check(c.wars[k] !== undefined, `${tag}: ${c.name} stands beside a friend in a war it is not in (${k})`);
    for (const k in d.owes) check(!!sim.civs[+k], `${tag}: ${c.name} owes reparations to a realm that is gone`);
    check(d.offers.length <= 6 && (c.player || d.offers.length === 0), `${tag}: ${c.name} has ${d.offers.length} offers before it`);
    check(Object.keys(d.mem).length <= sim.MAXC && Object.keys(d.ask).length <= sim.MAXC * 8, `${tag}: ${c.name} remembers without bound`);
  }
  { let tin = 0, tout = 0; for (let k = 0; k < sim.MAXC; k++) { tin += sim.diplo.trIn[k]; tout += sim.diplo.trOut[k]; } check(Math.abs(tin - tout) < 1e-3 * (1 + tin), `${tag}: tribute paid ${tout.toFixed(2)} is not tribute received ${tin.toFixed(2)}`); }
  check(n === sim.st.civCount, `${tag}: civCount ${sim.st.civCount} != living ${n}`);
  check(sim.worldEvents.length <= 600, `${tag}: worldEvents unbounded (${sim.worldEvents.length})`);
  check(sim.allEvents.length <= 6000, `${tag}: allEvents unbounded (${sim.allEvents.length})`);
  check(sim.ruins.size <= 1500, `${tag}: ruins unbounded (${sim.ruins.size})`);
  check(sim.fires.length <= 120 && sim.floods.length <= 60 && sim.quakes.length <= 60 && sim.battles.length <= 400 && sim.plagues.length <= 400, `${tag}: living-world lists unbounded (${sim.fires.length}/${sim.floods.length}/${sim.quakes.length}/${sim.battles.length}/${sim.plagues.length})`);
  for (const [i, ru] of sim.ruins) check(i >= 0 && i < N && ru.R > 0 && isFinite(ru.R), `${tag}: bad ruin ${i}`);
}

// How fast this machine is at the kind of work a year of the simulation is (floats over a quarter of a million cells, a neighbour looked
// up out of order, a power and an exponential here and there): milliseconds for a fixed amount of it, the middle of three best-of-threes.
// The limit on a year is set against it, not in milliseconds: the same game ran 9.9 ms a year on one box and 13.1 on the next.
function workUnit() {
  const pop = new Float32Array(N), fertU = new Float32Array(N), own = new Int16Array(N), acc = new Float64Array(512); let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < N; i++) { pop[i] = rnd() * 3; fertU[i] = rnd(); own[i] = (rnd() * 300) | 0; }
  const once = () => { let best = 1e9; for (let run = 0; run < 3; run++) { const t0 = process.hrtime.bigint();
    for (let it = 0; it < 24; it++) { acc.fill(0); for (let i = 0; i < N; i++) { const K = 0.2 + 6 * fertU[i]; let p = pop[i]; p += 0.012 * p * (1 - p / K); const j = (i * 7919 + it * 104729) % N; if (own[j] !== own[i] && p > 0.6 * K) { const m = p * 0.02; p -= m; pop[j] += m; } if ((i & 63) === 0) p *= Math.pow(1.0001, fertU[j]) * Math.exp(-1e-5 * p); pop[i] = p; acc[own[i]] += p; } }
    const dt = Number(process.hrtime.bigint() - t0) / 1e6; if (dt < best) best = dt; } return best; };
  const a = [once(), once(), once()].sort((x, y) => x - y); return a[1];
}
if (want(1)) {
// ---------- 1. long autopilot run ----------
log('1. autopilot: 12,000 years, 3 seeds');
for (const [seed, YEARS] of [[7, 12000], [1234, 4000], [99991, 4000]]) {
  const sim = createSim(wd, seed);
  const u0 = workUnit(); const t1 = Date.now(); let worst = 0;
  for (let y = 0; y < YEARS; y++) { const a = Date.now(); sim.tick(); worst = Math.max(worst, Date.now() - a); if (y % 2000 === 1999) invariants(sim, `seed ${seed} year ${sim.year}`); }
  const dt = Date.now() - t1; const last = sim.history[sim.history.length - 1]; const unit = Math.max(u0, workUnit()), limit = 0.24 * unit;      // (the slower of the box's two answers: it may have been busy in between)
  log(`   seed ${seed}: ${dt} ms (${(dt / YEARS).toFixed(2)} ms/yr, worst ${worst} ms) · ${sim.year} · civs ${sim.st.civCount} · people ${last ? Math.round(last.pop + last.wild) : '?'}k · ruins ${sim.ruins.size} · events ${sim.worldEvents.length}`);
  check(dt / YEARS < limit, `seed ${seed}: too slow (${(dt / YEARS).toFixed(2)} ms/yr; on this machine, whose unit of work is ${unit.toFixed(0)} ms, ${limit.toFixed(1)} is the limit)`);      // (seed 7's twelve thousand years take 0.18 of a unit a year with laws, estates and envoys: a third more is a real slowing; the same run measures a part in twenty apart from one time to the next)
  check(sim.st.civCount > 5, `seed ${seed}: world died out (${sim.st.civCount} civs)`);
  const best = Math.max(...sim.civs.filter(c => c).map(c => c.tech));
  if (YEARS >= 12000) check(best > 0.5, `seed ${seed}: nobody past the Renaissance by 2000 AD (best tech ${best.toFixed(2)})`);
  const eras = new Set(sim.civs.filter(c => c).map(c => c.era)); log(`   eras present: ${[...eras].sort().join(',')} · best tech ${best.toFixed(2)} · wars ${sim.civs.filter(c => c).reduce((a, c) => a + Object.keys(c.wars).length, 0) / 2}`);
  const types = {}; for (const e of sim.worldEvents) types[e.type] = (types[e.type] || 0) + 1; log('   event types:', JSON.stringify(types));
  if (YEARS >= 12000) check(sim.volcanoes.some(v => v.last > -1e8), `seed ${seed}: no volcano erupted in 12,000 years`);
}

}
if (want(2)) {
// ---------- 2. player actions ----------
log('2. player actions and god powers');
{
  const sim = createSim(wd, 42);
  const i0 = sim.LI.find(i => sim.fert[i] > 0.6 && (sim.flags[i] & 2) && (sim.flags[i] & 4)) || sim.LI[1000];
  const c = sim.setPlayer(i0, 'Testers', [0.5, 0.5]);
  check(!!c && c.player, 'setPlayer returns a player civ');
  check(sim.playerCiv() === c, 'playerCiv() is the player');
  for (let k = 0; k < 24; k++) sim.spawnTribe(sim.LI[Math.floor(sim.rnd() * sim.LI.length)], {});
  c.wealth = 1e6;
  const near = (() => { const y = (i0 / W) | 0, x = i0 - y * W; return [-1, 1].map(d => y * W + x + d).find(j => sim.land[j] && sim.owner[j] < 0); })();
  const r = {};
  // a people that knows nothing can raise nothing: each work waits on its discovery
  r.farm0 = sim.act('farm', i0); check(/Needs Farming/.test(r.farm0) && sim.needFor('farm', i0).key === 'farming', `no fields before farming: "${r.farm0}"`);
  r.levy0 = sim.act('levy', -1); check(/Needs Chieftains/.test(r.levy0), `no levy before there is someone to call it: "${r.levy0}"`);
  teach(sim, c, 0);
  r.settleFar = sim.act('settle', sim.LI[sim.LI.length - 5]); check(/touch|border|Not|cannot|reach/i.test(r.settleFar) || !/^Settled/.test(r.settleFar), `settle far away should fail: "${r.settleFar}"`);
  if (near !== undefined) { r.settle = sim.act('settle', near); check(/^Settled/.test(r.settle), `settle adjacent: "${r.settle}"`); }
  // works take years: pay now, the effect lands when the site is finished
  const finish = (n) => { for (let k = 0; k < n; k++) sim.tick(); };
  r.farm = sim.act('farm', i0); check(/Farms under construction/.test(r.farm) && sim.infra[i0] === 0 && sim.inProgress(i0, 'farm'), `farm starts a site: "${r.farm}"`);
  r.farm2 = sim.act('farm', i0); check(/Already being built/.test(r.farm2), `no second farm site at once: "${r.farm2}"`);
  r.develop = sim.act('develop', i0); check(/Already being built/.test(r.develop), 'develop is the old name for farm');
  finish(sim.durOf('farm', c.era) + 1); check(sim.infra[i0] === 1 && !sim.inProgress(i0, 'farm'), `farm finished after its years (infra ${sim.infra[i0]})`);
  sim.act('farm', i0); finish(sim.durOf('farm', c.era) + 1); r.farm3 = sim.act('farm', i0); check(sim.infra[i0] === 2 && /Needs Irrigation/.test(r.farm3), `the third level of farms waits on irrigation: "${r.farm3}"`);
  teach(sim, c, undefined, ['irrigation', 'rotation', 'sciencefarming', 'masonry', 'castles', 'sailing', 'boats']);
  for (let k = 0; k < 6; k++) { sim.act('farm', i0); finish(sim.durOf('farm', c.era) + 1); } r.farmCap = sim.act('farm', i0); check(/Fully farmed/.test(r.farmCap) && sim.infra[i0] === 5, `farm cap: infra ${sim.infra[i0]} "${r.farmCap}"`);
  r.walls = sim.act('walls', i0); check(/Walls under construction/.test(r.walls) && sim.walls[i0] === 0, `walls start: "${r.walls}"`); finish(sim.durOf('walls', c.era) + 1); check(sim.walls[i0] === 1, 'walls level 1 after construction');
  for (let k = 0; k < 4; k++) { sim.act('walls', i0); finish(sim.durOf('walls', c.era) + 1); } r.wallsCap = sim.act('fortify', i0); check(sim.walls[i0] === 3 && /Fully fortified/.test(r.wallsCap), `walls cap: ${sim.walls[i0]} "${r.wallsCap}"`);
  r.port = sim.act('port', i0); check(/Harbour under construction/.test(r.port), `port on coast: "${r.port}"`); finish(sim.durOf('port', c.era) + 1); check(!!(sim.special[i0] & 1), 'port bit set when finished');
  r.port2 = sim.act('port', i0); check(/Already/.test(r.port2), `double port: "${r.port2}"`);
  r.temple = sim.act('temple', i0, 5); check(/Temple under construction/.test(r.temple) && sim.inProgress(i0, 'temple').slot === 5, `temple on plot 5: "${r.temple}"`);
  check(sim.freeSlots(i0).length === sim.NSLOTS - 1 && !sim.freeSlots(i0).includes(5), 'the plot is taken while the temple is being built');
  finish(sim.durOf('temple', c.era) + 1); check((sim.special[i0] & 4) && sim.slotOf(i0, 'temple') === 5, 'temple finished on its plot');
  r.market0 = sim.act('market', i0); check(/Needs Markets/.test(r.market0), `market before markets are known refused: "${r.market0}"`);
  c.tech = 0.1; c.era = sim.eraOf(c.tech); teach(sim, c, 1);
  r.market = sim.act('market', i0, 5); check(/Market under construction/.test(r.market) && sim.inProgress(i0, 'market').slot !== 5, `market picks another plot when 5 is taken: "${r.market}"`); finish(sim.durOf('market', c.era) + 1); check(!!(sim.special[i0] & 8), 'market bit set');
  r.academy0 = sim.act('academy', i0); check(/Needs Philosophy/.test(r.academy0), `academy refused early: "${r.academy0}"`);
  sim.pop[i0] = 50; sim.tick(); check(sim.level[i0] >= 2, `village grew to a town with 50k people (level ${sim.level[i0]})`);
  c.tech = 0.31; c.era = sim.eraOf(c.tech); teach(sim, c, 3);
  r.academy = sim.act('academy', i0); check(/Academy under construction/.test(r.academy), `academy: "${r.academy}"`); finish(sim.durOf('academy', c.era) + 1); check(!!(sim.special[i0] & 2), 'academy bit set');
  r.wonder = sim.act('wonder', i0); check(/Wonder under construction/.test(r.wonder) && !(sim.special[i0] & 16), `wonder starts: "${r.wonder}"`);
  r.wonder2 = sim.act('wonder', i0); check(/Already being built/.test(r.wonder2), `second wonder refused while building: "${r.wonder2}"`);
  finish(sim.durOf('wonder', c.era) + 1); check(!!(sim.special[i0] & 16), 'wonder finished'); check(((sim.special[i0] >> 5) & 15) === c.era, 'wonder remembers its era');
  r.wonder3 = sim.act('wonder', i0); check(/already/.test(r.wonder3), `second wonder refused: "${r.wonder3}"`);
  check(sim.works.get(i0) === undefined, 'no works left at the capital');
  const mineCell = sim.LI.find(j => sim.owner[j] === c.id && sim.goods[j] && sim.knows(c, j) && sim.level[j]);
  r.mineNo = sim.act('mine', i0); check(/yields nothing to work|Already|cannot yet/.test(r.mineNo) || /under construction/.test(r.mineNo), `work on the capital's own good: "${r.mineNo}"`);
  if (mineCell !== undefined && !sim.inProgress(mineCell, 'mine') && !(sim.special[mineCell] & 512)) { const why = sim.cannot('mine', mineCell); if (!why) { r.mine = sim.act('mine', mineCell, 0); check(new RegExp(sim.workName(mineCell) + ' under construction').test(r.mine), `${sim.workName(mineCell)}: "${r.mine}"`); finish(sim.durOf('mine', c.era) + 1); check(!!(sim.special[mineCell] & 512) && sim.slotOf(mineCell, 'mine') === 0, 'mine finished on plot 1'); } }
  r.levy = sim.act('levy', -1); check(/takes the field/.test(r.levy) && c.army > sim.year && sim.army.of(c.id).length === 1, `levy: "${r.levy}"`);
  const other = sim.settlementsOf(c.id).find(j => j !== i0 && sim.level[j] >= 2);
  if (other !== undefined) { r.capital = sim.act('capital', other); check(/Capital moved/.test(r.capital) && c.capital === other, `capital: "${r.capital}"`); sim.act('capital', i0); }
  c.wealth = 0; c.army = -99999; r.poor = sim.act('levy', -1); check(/Not enough/.test(r.poor), `no money: "${r.poor}"`); c.wealth = 1e6;
  r.sea = sim.act('farm', 0); check(/not land/.test(r.sea), `act on sea: "${r.sea}"`);
  // god powers
  const e = sim.civs.find(x => x && x !== c); const eCap = e.capital; const popBefore = sim.pop[eCap];
  sim.plague(eCap, 6, false); check(sim.pop[eCap] < popBefore, 'plague kills');
  const bonusBefore = sim.bonusFert[eCap]; sim.bounty(eCap); check(sim.bonusFert[eCap] > bonusBefore + 0.2 && sim.bonusFert[eCap] <= 0.7, `bounty raises fertility (bonus ${bonusBefore.toFixed(2)} -> ${sim.bonusFert[eCap].toFixed(2)})`);
  const pr = sim.prophet(eCap); check(!!e.religion && /faith|religion|prophet/i.test(pr) || e.religion, `prophet founds a faith: "${pr}" (${e.religion})`);
  const techBefore = e.tech; const en = sim.enlighten(eCap); check(e.tech > techBefore && e.era === sim.eraOf(e.tech), `enlighten: "${en}" tech ${techBefore.toFixed(3)} -> ${e.tech.toFixed(3)} era ${e.era}`);
  const spawned = sim.spawnTribe(sim.LI.find(j => sim.owner[j] < 0 && sim.fert[j] > 0.5), {}); check(!!spawned && spawned.capital >= 0, 'spawn tribe on empty land');
  check(sim.spawnTribe(i0, {}) === null, 'spawn on owned land refused');
  check(sim.st.civCount === sim.civs.filter(Boolean).length, `civ count in st is live between ticks (${sim.st.civCount} vs ${sim.civs.filter(Boolean).length})`);
  const target = e.capital; sim.meteor(target); check(sim.owner[target] === -1 && sim.pop[target] === 0, 'meteor clears the cell'); check(sim.ruins.size >= 0, 'ruins map intact after meteor');
  // war & peace
  const foe = sim.civs.find(x => x && x !== c && x.alive !== false); { const no = sim.playerWar(foe.id); check(no === null && sim.isAtWar(c, foe.id) && sim.isAtWar(foe, c.id), 'declare war is mutual' + (no ? ': ' + no : '')); const no2 = sim.playerWar(foe.id); check(no2 === null && !sim.isAtWar(c, foe.id), 'peace as things stand ends a war nobody is winning' + (no2 ? ': ' + no2 : '')); check(/truce/i.test(sim.playerWar(foe.id) || ''), 'and a truce follows'); }
  sim.renamePlayer('  Newname  '); check(c.name === 'Newname', `rename trims: "${c.name}"`);
  sim.renamePlayer(''); check(c.name === 'Newname', 'empty rename ignored');
  for (let y = 0; y < 400; y++) sim.tick(); invariants(sim, 'after actions + 400 years');
  check(sim.playerCiv() === c && c.alive !== false, 'player survives 400 years with a fortune');
  log('   actions ok:', Object.keys(r).length, 'checked');
}

}
if (want(3)) {
// ---------- 3. save / load round trip ----------
log('3. save/load round trip');
{
  const sim = createSim(wd, 2024);
  const i0 = sim.LI[Math.floor(sim.LI.length * 0.4)]; sim.setPlayer(i0, 'Savers', null);
  for (let k = 0; k < 24; k++) sim.spawnTribe(sim.LI[Math.floor(sim.rnd() * sim.LI.length)], {});
  for (let y = 0; y < 3000; y++) sim.tick();
  const s = sim.save(); const json = JSON.stringify(s); log(`   save size ${(json.length / 1024).toFixed(0)} KB`);
  check(json.length < 4.5 * 1024 * 1024, `save fits localStorage (${(json.length / 1024 / 1024).toFixed(2)} MB)`);
  const s2 = JSON.parse(json); const sim2 = createSim(wd, s2.seed || 1); sim2.load(s2);
  check(sim2.ruins.size === Math.min(sim.ruins.size, 600), `ruins restored (${sim2.ruins.size} vs ${sim.ruins.size})`);
  { const pc0 = sim2.playerCiv(); check(pc0 && sim2.cellsOf[pc0.id] > 0 && sim2.popOf[pc0.id] > 0, `per-realm totals rebuilt right after load (cells ${pc0 && sim2.cellsOf[pc0.id]}, people ${pc0 && sim2.popOf[pc0.id].toFixed(1)}k)`); let lv = 0; for (let i = 0; i < N; i++) if (sim2.level[i]) lv++; check(lv > 0, `settlement levels rebuilt right after load (${lv} settlements)`); }
  check(sim2.year === sim.year, 'year restored'); check(sim2.player === sim.player, 'player restored'); check(sim2.st.civCount === sim.st.civCount, `civ count restored (${sim2.st.civCount} vs ${sim.st.civCount})`);
  let ownerDiff = 0, popDiff = 0, lvlDiff = 0; for (let i = 0; i < N; i++) { if (sim2.owner[i] !== sim.owner[i]) ownerDiff++; if (Math.abs(sim2.pop[i] - sim.pop[i]) > Math.max(0.05, sim.pop[i] * 0.05)) popDiff++; }
  check(ownerDiff === 0, `owners restored (${ownerDiff} differ)`); check(popDiff < N * 0.002, `population restored within 5% (${popDiff} cells off)`);
  sim2.tick(); for (let i = 0; i < N; i++) if (sim2.level[i] !== sim.level[i] && Math.abs(sim2.level[i] - sim.level[i]) > 1) lvlDiff++; check(lvlDiff < 50, `settlement levels recomputed close to the original (${lvlDiff} differ by >1)`);
  check(Math.abs(sim2.ruins.size - Math.min(sim.ruins.size, 600)) <= 3 + sim.ruins.size * 0.03, `ruins survive the first tick after load (${sim2.ruins.size} vs ${sim.ruins.size}; quantised populations may rebuild a few)`);
  check(sim2.volcanoes.filter(v => v.last > -1e8).length === sim.volcanoes.filter(v => v.last > -1e8).length, 'volcano history restored');
  check(sim2.comet === sim.comet, 'comet restored');
  const pc = sim2.playerCiv(); check(!!pc && pc.name === 'Savers', 'player civ object restored');
  check(sim2.cellName.size > 0 && sim2.cellName.get(pc.capital) === sim.cellName.get(sim.playerCiv().capital), 'capital name restored');
  for (let y = 0; y < 500; y++) sim2.tick(); invariants(sim2, 'loaded sim + 500 years');
  // special bits beyond 8 (wonder era) must survive: find a wonder
  let wonderCell = -1; for (let i = 0; i < N; i++) if (sim.special[i] & 16) { wonderCell = i; break; }
  if (wonderCell >= 0) check(sim2.special[wonderCell] === sim.special[wonderCell], `wonder era bits survive save (${sim2.special[wonderCell]} vs ${sim.special[wonderCell]})`); else log('   (no wonder built by anyone in 3000 years)');
}

}
if (want(4)) {
// ---------- 4. determinism of seeds ----------
log('4. determinism');
{
  const a = createSim(wd, 555), b = createSim(wd, 555); for (let y = 0; y < 400; y++) { a.tick(); b.tick(); }
  let diff = 0; for (let i = 0; i < N; i++) if (a.owner[i] !== b.owner[i]) diff++; check(diff === 0, `same seed, same world (${diff} cells differ)`);
}

}
if (want(5)) {
// ---------- 5. edge cases ----------
log('5. edge cases');
{
  const sim = createSim(wd, 3);
  check(sim.act('develop', 100) === 'No state', 'act without a player');
  check(sim.playerCiv() === null, 'no player civ before setPlayer');
  check(sim.setPlayer(0, 'Sea', null) === null || sim.playerCiv() === null, 'cannot found on the open sea');
  const iIce = sim.LI.find(i => sim.flags[i] & 8); if (iIce !== undefined) { const c = sim.setPlayer(iIce, 'Ice', null); check(c === null || c.capital === iIce, 'founding on ice either refused or consistent'); }
  const sim2 = createSim(wd, 4); const i0 = sim2.LI[500]; const c = sim2.setPlayer(i0, 'X'.repeat(80), null); check(c.name.length <= 80, 'long names accepted'); sim2.renamePlayer('Y'.repeat(80)); check(c.name.length <= 28, `rename clamps to 28 (${c.name.length})`);
  // kill the player's realm and see it handled
  for (let i = 0; i < N; i++) if (sim2.owner[i] === c.id) { sim2.owner[i] = -1; sim2.pop[i] = 0; }
  sim2.tick(); check(sim2.playerCiv() === null, 'player realm removed when it loses every cell');
  check(sim2.worldEvents.some(e => e.dead), 'death recorded in the chronicle');
  check(sim2.act('develop', i0) === 'No state', 'actions refused after death');
  // ruins get cleared when resettled
  { // a town rebuilt over old ruins clears them; a hamlet among them does not
    const sim3 = createSim(wd, 5); let j = -1, bf = 0; for (const i of sim3.LI) if ((sim3.flags[i] & 2) && sim3.owner[i] < 0 && sim3.fert[i] > bf) { bf = sim3.fert[i]; j = i; }
    sim3.ruins.set(j, { year: sim3.year - 100, era: 2, culture: 0, R: 300, wonder: 0, name: 'Old' }); const c3 = sim3.setPlayer(j, 'New', null); c3.tech = 0.3; c3.era = sim3.eraOf(c3.tech);
    sim3.tick(); const K3 = sim3.capacity(j, c3); sim3.pop[j] = K3 * 0.9; for (let y = 0; y < 12; y++) sim3.tick();
    check(sim3.level[j] >= 2, `rebuilt town reaches level 2+ on the best river land (level ${sim3.level[j]}, K ${K3.toFixed(1)})`); check(!sim3.ruins.has(j), 'ruin cleared when a town is rebuilt over it');
    const sim4 = createSim(wd, 5); sim4.ruins.set(j, { year: sim4.year - 100, era: 2, culture: 0, R: 300, wonder: 0, name: 'Old' }); sim4.setPlayer(j, 'New', null); for (let y = 0; y < 12; y++) sim4.tick(); check(sim4.ruins.has(j) && sim4.level[j] <= 1, `a hamlet lives among the ruins (level ${sim4.level[j]}, ruin ${sim4.ruins.has(j)})`);
    // overfull land empties gradually, never to zero in a year
    const sim5 = createSim(wd, 5); const c5 = sim5.setPlayer(j, 'Full', null); sim5.pop[j] = sim5.capacity(j, c5) * 100; sim5.tick(); check(sim5.pop[j] > 0 && sim5.pop[j] < sim5.capacity(j, c5) * 100, `overpopulated cell declines but survives the year (${sim5.pop[j].toFixed(2)}k)`);
  }
}

}
if (want(6)) {
// ---------- 6. rulers and trade goods ----------
log('6. rulers and trade goods');
{
  const sim = createSim(wd, 31), simB = createSim(wd, 32);
  let same = true; for (let i = 0; i < N; i++) if (sim.goods[i] !== simB.goods[i]) { same = false; break; } check(same, 'goods placement is fixed by the land, not the seed');
  let withGoods = 0, onIce = 0; const used = new Set(); for (const i of sim.LI) { const g = sim.goods[i]; if (g) { withGoods++; used.add(g); if (sim.flags[i] & 8) onIce++; } }
  const frac = withGoods / sim.LI.length; check(frac > 0.15 && frac < 0.4, `goods cover a sensible share of the land (${(frac * 100).toFixed(0)}%)`); check(onIce === 0, 'no goods on the ice'); { const raws = sim.GOODS.filter(g => g && g.raw).length; check(used.size === raws, `every raw good occurs somewhere (${used.size}/${raws})`); }
  const i0 = sim.LI.find(i => sim.fert[i] > 0.6 && (sim.flags[i] & 2)); const c = sim.setPlayer(i0, 'Traders', null); for (let k = 0; k < 24; k++) sim.spawnTribe(sim.LI[Math.floor(sim.rnd() * sim.LI.length)], {});
  for (const cv of sim.civs) if (cv) { cv.tech = 0.12; cv.era = sim.eraOf(cv.tech); } // the Bronze Age: copper, tin and horses start to matter
  for (let y = 0; y < 3000; y++) sim.tick();
  check(!!c.trade && c.trade.living >= 0 && c.trade.living <= 1 && typeof c.trade.imp === 'number', 'player realm has a trade record');
  let anyImports = 0, traits = new Set(), badTrait = 0, badRulers = 0; for (const cv of sim.civs) { if (!cv) continue; if (cv.trade && cv.trade.imp > 0) anyImports++; if (!cv.ruler || !sim.TRAITS[cv.ruler.trait]) badTrait++; traits.add(cv.ruler && cv.ruler.trait); if (cv.rulers.length > 60 || cv.rulers.some(r => !r.name || !r.title)) badRulers++; }
  check(anyImports > 0, `some realms import goods from neighbours (${anyImports})`); check(badTrait === 0, 'every ruler has a known personality'); check(traits.size >= 5, `personalities vary (${traits.size} kinds in play)`); check(badRulers === 0, 'ruler histories are bounded and complete');
  const remembered = sim.civs.filter(x => x).reduce((a, x) => a + x.rulers.filter(r => r.ep).length, 0); check(remembered > 0, `some dead rulers earned epithets (${remembered})`);
  const covetWars = sim.allEvents.filter(e => /declares war .* for its (copper|tin|iron|horses|coal|oil|saltpetre|rubber|natural gas|uranium|rare earths|lithium)/.test(e.text)).length; check(covetWars > 0, `wars are fought over strategic goods (${covetWars})`);
  const strongWithIron = sim.civs.filter(x => x && x.era >= 2 && sim.held[x.id * sim.market.NG + sim.GOOD_ID.iron]).length; log(`   realms with iron in the Iron Age or later: ${strongWithIron}; imports seen in ${anyImports}; coveting wars ${covetWars}`);
  // save/load keeps the ruler's personality
  const s = JSON.parse(JSON.stringify(sim.save())); const sim2 = createSim(wd, s.seed || 1); sim2.load(s); const p2 = sim2.playerCiv(); check(p2.ruler.trait === c.ruler.trait && p2.ruler.seed === c.ruler.seed, 'ruler personality survives save/load');
  // an old save without personalities still works
  for (const cv of s.civs) if (cv) { delete cv.ruler.trait; delete cv.trade; delete cv.know; } delete s.econ; delete s.ind; delete s.know; const sim3 = createSim(wd, 1); sim3.load(s); sim3.tick(); check(sim3.playerCiv().trade.living >= 0 && sim3.playerCiv().ruler.name, 'a save from before personalities and markets loads and ticks');
}
}
if (want(7)) {
// ---------- 7. construction, growth and the town planner ----------
log('7. construction, growth and the planner');
{
  const T = window.TOWN; const sim = createSim(wd, 77);
  const i0 = sim.LI.find(i => sim.fert[i] > 0.6 && (sim.flags[i] & 2)); const c = sim.setPlayer(i0, 'Builders', null); for (let k = 0; k < 24; k++) sim.spawnTribe(sim.LI[Math.floor(sim.rnd() * sim.LI.length)], {});
  for (const cv of sim.civs) if (cv) { cv.tech = 0.1; cv.era = sim.eraOf(cv.tech); cv.eraSince = sim.year - 300; cv.wealth = 400; }
  teach(sim, c, 1);
  // the AI builds through the same sites the player uses
  let sitesSeen = 0, kinds = new Set(); for (let y = 0; y < 600; y++) { sim.tick(); for (const [i, l] of sim.works) if (sim.owner[i] !== c.id) { sitesSeen++; for (const w of l) kinds.add(w.k); } }
  check(sitesSeen > 0, `AI realms raise works through construction sites (${sitesSeen} site-years, kinds ${[...kinds].join('/')})`);
  let built = 0; for (const i of sim.LI) if (sim.owner[i] >= 0 && sim.owner[i] !== c.id && (sim.special[i] & 15 || sim.walls[i] || sim.infra[i])) built++; check(built > 0, `AI works get finished (${built} cells with works)`);
  // drawn scale: villages big, metropolises bounded
  const k1 = T.scaleOf(100), k2 = T.scaleOf(1000), k3 = T.scaleOf(9000); check(k1 > 15 && k2 > 8 && k2 < 12 && k3 > 2 && k3 < 3, `representational scale tapers (${k1.toFixed(1)}, ${k2.toFixed(1)}, ${k3.toFixed(1)})`);
  check(T.radiusM(sim, i0, c) < 26000, `no town is drawn wider than its region (${(T.radiusM(sim, i0, c) / 1000).toFixed(1)} km)`);
  // growth: a jump in people opens a ring of building sites that close over the years
  c.wealth = 1e6; c.tech = 0.26; c.era = sim.eraOf(c.tech); c.eraSince = sim.year - 300; teach(sim, c, 2); sim.bonusFert[i0] = 0.6; sim.tick(); // room to grow: better land, better knowledge
  sim.pop[i0] = Math.min(sim.pop[i0] * 1.6, sim.capacity(i0, c) * 0.9); sim.tick();
  check(sim.year - sim.gYear[i0] <= 1 && sim.gBand[i0] > sim.gPrev[i0], `growth band recorded (band ${sim.gBand[i0]} from ${sim.gPrev[i0]}, ${sim.year - sim.gYear[i0]} yrs ago; pop ${sim.pop[i0].toFixed(2)} of ${sim.capacity(i0, c).toFixed(2)})`);
  const L0 = T.layout(sim, i0, c, {}); const n0 = L0.items.length; let maxSites = 0; for (let y = 0; y < 14; y++) { sim.tick(); const L = T.layout(sim, i0, c, {}); maxSites = Math.max(maxSites, L.items.filter(it => it.prog !== undefined).length); }
  const L1 = T.layout(sim, i0, c, {}); check(maxSites > 0, `building sites appear in the new ring (${maxSites} at most)`); check(L1.items.length >= n0, `the town has more houses when the ring is done (${n0} -> ${L1.items.length})`); check(L1.items.filter(it => it.prog !== undefined).length === 0 || L1.growing, 'sites close once the ring is built');
  check(L1.plots.length === sim.NSLOTS && L1.k > 1 && L1.k < 21 && L1.R > 500, `plan exposes plots and scale (k ${L1.k.toFixed(1)}, R ${L1.R.toFixed(0)} m)`);
  // a work in progress shows up in the plan at its plot, growing with the years
  sim.act('temple', i0, 4); sim.tick(); sim.tick(); const Lw = T.layout(sim, i0, c, {}); const site = Lw.items.find(it => it.prog !== undefined && (it.style & 1024)); check(!!site && site.prog < 1, `the temple site is in the plan (prog ${site && site.prog.toFixed(2)})`); check(Lw.plots[4].used, 'plot 4 is marked used');
  // an era change rebuilds the town over the decades, never all at once
  // (in the first age in which this people builds anew: where the old ways last, a new age changes nothing in a town)
  let e1 = 3; while (e1 < 8 && T.styleEra(e1, c.culture) === T.styleEra(e1 - 1, c.culture)) e1++;
  c.tech = sim.ERAS[e1][1] + 0.01; c.era = e1; c.eraSince = sim.year; teach(sim, c, e1); sim.tick(); const La = T.layout(sim, i0, c, {}); const oldKinds = (L) => L.items.filter(it => it.prog === undefined && it.style % 8 !== 3 && !(it.style & 1024) && ['adobe', 'longhouse', 'courtyard', 'hut', 'gable', 'hip', 'tenement'].includes(it.kind)).length; // non-stone houses: what the Classical town was built of
  const before = oldKinds(La); for (let y = 0; y < 30; y++) sim.tick(); const Lb = T.layout(sim, i0, c, {}); for (let y = 0; y < 40; y++) sim.tick(); const Lc = T.layout(sim, i0, c, {});
  log(`   era wave (${sim.ERAS[e1][0]}): ${before} old houses at the start, ${oldKinds(Lb)} after 30 years, ${oldKinds(Lc)} after 70; sites mid-way ${Lb.items.filter(it => it.prog !== undefined).length}`);
  check(Lb.items.filter(it => it.prog !== undefined).length > 0 || oldKinds(Lb) < before, 'the new age shows rebuilding sites or renewed houses mid-way');
  // save/load keeps sites, plots and growth
  sim.act('walls', i0); const sv = JSON.parse(JSON.stringify(sim.save())); const sim2 = createSim(wd, sv.seed || 1); sim2.load(sv);
  check(sim2.works.has(i0) && sim2.works.get(i0).some(w => w.k === 'walls'), 'works in progress survive save/load'); check(sim2.slotOf(i0, 'temple') === sim.slotOf(i0, 'temple'), 'plots survive save/load'); check(sim2.gBand[i0] === sim.gBand[i0], 'growth band survives save/load');
  for (let y = 0; y < 30; y++) sim2.tick(); check(sim2.walls[i0] >= 1, 'a loaded site still finishes');
}
}
if (want(8)) {
// ---------- 8. the market: goods, prices, workshops, trade, the state's own dealings ----------
log('8. the market');
{
  const E = window.ECON; const NG = E.NG, NC = E.NC, NR = E.NR;
  // the tables hang together
  check(E.GOODS.length === NG && E.GOODS.filter(g => g && g.raw).length === 42 && E.GOODS.filter(g => g && !g.raw).length === 21, `63 goods: 42 from the land, 21 made (${E.GOODS.length - 1})`);
  check(new Set(E.GOODS.filter(Boolean).map(g => g.tk)).size === 63 && new Set(E.GOODS.filter(Boolean).map(g => g.key)).size === 63, 'every good has its own name and ticker');
  check(E.GOODS.every(g => !g || (g.base > 0 && g.bulk > 0 && g.rot >= 0 && g.rot < 1)), 'every good has a usual price, a bulk and a rate of rot');
  { let bad = 0; E.RECIPES.forEach((R, r) => { for (const [g] of R.in) if (!E.GOODS[g].raw && !E.MAKES[g].some(q => q < r)) bad++; if (!(R.l > 0) || R.sec < 0) bad++; }); check(bad === 0, `every recipe's materials are made above it (${bad} out of order)`); }
  { const wanted = new Set(); for (const C of E.CATS) for (const m of C.m) wanted.add(m.g); for (const R of E.RECIPES) for (const [g] of R.in) wanted.add(g); const idle = E.GOODS.filter(g => g && !wanted.has(g.id)).map(g => g.key); check(idle.length === 0, `every good is wanted by someone or used by some workshop (idle: ${idle.join(', ') || 'none'})`); }
  { const missing = E.GOODS.filter(g => g && g.raw && !(E.CAL[g.key] > 0)).map(g => g.key); check(missing.length === 0, `every raw good has a measured yield (missing: ${missing.join(', ') || 'none'}; run tools/econ/calibrate.js --write)`); }
  { const made = E.GOODS.filter(g => g && !g.raw); check(made.every(g => E.MAKES[g.id].length > 0), 'every made good has a recipe'); }
  // a world of traders
  const sim = createSim(wd, 77); const M = sim.market; const i0 = sim.LI.find(i => sim.fert[i] > 0.6 && (sim.flags[i] & 2) && (sim.flags[i] & 4)) || sim.LI.find(i => sim.fert[i] > 0.6 && (sim.flags[i] & 2));
  const c = sim.setPlayer(i0, 'Merchants', null); for (let k = 0; k < 30; k++) sim.spawnTribe(sim.LI[Math.floor(sim.rnd() * sim.LI.length)], {});
  for (const cv of sim.civs) if (cv) { cv.tech = 0.2; cv.era = sim.eraOf(cv.tech); }
  teach(sim, c, 2);
  let tM = 0, nM = 0; { const st0 = M.step; M.step = (o) => { const t = process.hrtime.bigint(); st0(o); tM += Number(process.hrtime.bigint() - t) / 1e6; nM++; }; }
  for (let y = 0; y < 1500; y++) sim.tick();
  const live = sim.civs.filter(Boolean); log(`   ${sim.fmtYear(sim.year)}: ${live.length} realms, ${M.links.length} trade links, world product ${M.worldGdp.toFixed(0)}, trade ${M.worldTrade.toFixed(0)}; the market takes ${(tM / nM).toFixed(2)} ms a year`);
  check(tM / nM < 6, `the market is quick enough (${(tM / nM).toFixed(2)} ms a year with ${live.length} realms)`);
  const sane = (tag, S) => {
    let bad = 0, pxBad = 0, satBad = 0, gotBad = 0;
    for (const cv of S.civs) { if (!cv) continue; const o = cv.id * NG; for (let g = 1; g < NG; g++) { const st = S.market.stock[o + g], p = S.market.px[o + g]; if (!(st >= 0) || !isFinite(st) || !isFinite(S.market.need[o + g]) || !isFinite(S.market.out[o + g])) bad++; if (!(p >= 0.199 && p <= 8.001)) pxBad++; if (S.market.got[o + g] > S.market.fin[o + g] * 1.0001 + 1e-9) gotBad++; }
      for (let k = 0; k < NC; k++) { const v = S.market.sat[cv.id * NC + k]; if (!(v >= 0 && v <= 1)) satBad++; } if (!(S.market.LS[cv.id] >= 0 && S.market.LS[cv.id] <= 1) || !(S.market.util[cv.id] >= 0 && S.market.util[cv.id] <= 1.0001)) satBad++; if (!isFinite(cv.income) || !isFinite(cv.wealth)) bad++; }
    check(bad === 0, `${tag}: stores, wants and treasuries are finite and not negative (${bad} bad)`); check(pxBad === 0, `${tag}: every price is between a fifth and eight times the usual (${pxBad} out)`); check(satBad === 0, `${tag}: wants are met between not at all and wholly (${satBad} out)`); check(gotBad === 0, `${tag}: nobody is given more than they wanted (${gotBad})`);
  };
  sane('after 1,500 years', sim);
  check(M.links.length > 10 && M.worldTrade > 0 && M.worldGdp > 0, `realms trade (${M.links.length} links, ${(100 * M.worldTrade / M.worldGdp).toFixed(0)}% of the world's product crosses a border)`);
  { let worst = 0, name = ''; for (let g = 1; g < NG; g++) { let im = 0, ex = 0; for (const cv of live) { im += M.imp[cv.id * NG + g]; ex += M.exp[cv.id * NG + g]; } const d = Math.abs(im - ex) / Math.max(1e-6, im + ex); if (d > worst) { worst = d; name = E.GOODS[g].key; } } check(worst < 1e-3, `what leaves one realm arrives in another (worst: ${name}, ${(worst * 100).toFixed(3)}% astray)`); }
  { const ls = live.map(cv => M.LS[cv.id]); const lo = Math.min(...ls), hi = Math.max(...ls); check(hi - lo > 0.08, `realms live differently well (${lo.toFixed(2)} to ${hi.toFixed(2)})`); check(ls.reduce((a, b) => a + b, 0) / ls.length > 0.5, `and most live decently (mean ${(ls.reduce((a, b) => a + b, 0) / ls.length).toFixed(2)})`); }
  { const g = E.ID.grain; const ps = live.filter(cv => M.need[cv.id * NG + g] > 0.01).map(cv => M.px[cv.id * NG + g]); check(ps.length > 3 && Math.max(...ps) / Math.min(...ps) > 1.3, `grain costs more in one place than another (${Math.min(...ps).toFixed(2)}x to ${Math.max(...ps).toFixed(2)}x)`); }
  { let lines = 0; for (const cv of live) for (let r = 0; r < NR; r++) if (M.mk[cv.id * NR + r] > 0) lines++; check(lines > live.length * 2, `workshops are at work (${lines} lines in ${live.length} realms)`); const made = E.GOODS.filter(g => g && !g.raw && g.era <= 2 && M.wOut[g.id] > 0).map(g => g.key); check(made.length >= 7, `the made goods of the age are being made (${made.join(', ')})`); }
  { const pts = M.series(E.ID.grain); check(pts.length > 60 && pts.every(p => p[1] > 0 && isFinite(p[1])) && pts[0][0] > pts[pts.length - 1][0], `the price of grain is on record (${pts.length} points over ${pts[0][0]} years)`); check(M.series(E.ID.grain, true).length === 64, 'and so is its price at home, for the last 64 years'); }
  { const gs = M.goodsOf(c.id); check(gs.own.length > 0 && gs.own.every(g => M.out[c.id * NG + g] > 0), `the player's realm makes things (${gs.own.slice(0, 6).map(g => E.GOODS[g].key).join(', ')}${gs.own.length > 6 ? '…' : ''}; ${gs.imp.length} more come from abroad)`); }
  // the state's own dealings
  const e = M.econOf(c); c.wealth = 1e6;
  { e.customs = 0; sim.tick(); const r0 = M.rev[c.id]; e.customs = 0.2; sim.tick(); sim.tick(); check(r0 === 0 && (M.impV[c.id] === 0 || M.rev[c.id] > 0), `customs bring money in when goods come in (${M.rev[c.id].toFixed(2)} on imports worth ${M.impV[c.id].toFixed(1)})`); check(Math.abs(c.trade.customs - M.rev[c.id]) < 1e-6 || c.trade.customs >= 0, 'the treasury is told'); e.customs = 0.03; }
  { e.noM = []; e.noX = []; for (let g = 1; g < NG; g++) { e.noM.push(g); e.noX.push(g); } sim.tick(); let im = 0, ex = 0; for (let g = 1; g < NG; g++) { im += M.imp[c.id * NG + g]; ex += M.exp[c.id * NG + g]; } check(im === 0 && ex === 0, `a ban on everything stops everything at the border (${im} in, ${ex} out)`); e.noM = []; e.noX = []; for (let y = 0; y < 5; y++) sim.tick(); }
  { // buy for the reserve, sell from it, release it at home
    let g = 0, bk = null; for (let k = 1; k < NG && !g; k++) { const b = M.book(c.id, k); if (b.asks.length && b.asks[0].q > 1e-4) { g = k; bk = b; } }
    check(g > 0, `somebody has something to sell (${g ? E.GOODS[g].key + ' at ' + bk.asks[0].p.toFixed(2) : 'nothing on offer'})`);
    if (g) { const w0 = c.wealth; const q = bk.asks[0].q * 0.5; const dry = M.stateBuy(c.id, g, q, 0, true); const r = M.stateBuy(c.id, g, q); check(r.q > 0 && Math.abs(r.q - q) < q * 1e-6 && Math.abs(w0 - c.wealth - r.cost) < 1e-6 && Math.abs((e.res[g] || 0) - r.q) < 1e-9, `the state buys ${E.GOODS[g].key} for its reserve and pays for it (${r.q.toFixed(3)} lots for ${r.cost.toFixed(2)})`); check(Math.abs(dry.cost - r.cost) < 1e-6 && Math.abs(dry.q - r.q) < 1e-9, 'a quote is what the purchase then costs');
      const big = M.stateBuy(c.id, g, 1e9); check(big.q < 1e9 && big.avg >= r.avg - 1e-9, `buying everything on offer costs more a lot (${r.avg.toFixed(2)} then ${big.avg.toFixed(2)})`);
      const have = e.res[g]; const w1 = c.wealth; const rel = M.stateRelease(c.id, g, have * 0.5); check(rel.q > 0 && c.wealth > w1 && Math.abs(e.res[g] - have * 0.5) < 1e-6, 'releasing from the reserve puts goods on the home market and coin in the treasury');
      const w2 = c.wealth; const sold = M.stateSell(c.id, g, 1e9); check(sold.q <= have * 0.5 + 1e-9 && c.wealth >= w2, `the state sells what it can find buyers for (${sold.q.toFixed(3)} of ${(have * 0.5).toFixed(3)})`);
      e.orders.push({ id: 1, g, side: 'buy', q: 0.01, limit: 1e9 }); const before = e.res[g] || 0; for (let y = 0; y < 3; y++) sim.tick(); check((e.res[g] || 0) >= before && e.orders.length === 1 && e.orders[0].done >= 0, `a standing order is worked year by year (${((e.res[g] || 0) - before).toFixed(4)} bought in 3 years)`); e.orders = [];
    }
  }
  // workshops, granaries, and working the land's own good
  { const cap = c.capital; sim.pop[cap] = Math.max(sim.pop[cap], 60); sim.tick(); c.wealth = 1e6;
    const eff0 = sim.eff[c.id * 8 + 0]; const msg = sim.act('workshop', cap, 3); check(/Workshops under construction/.test(msg), `workshops: "${msg}"`); check(/Already being built/.test(sim.act('workshop', cap)), 'and not twice at once');
    const g1 = sim.act('granary', cap); check(/Granary under construction/.test(g1), `granary: "${g1}"`);
    check(/Needs The factory/.test(sim.cannot('factory', cap)), `no factory in the Iron Age: "${sim.cannot('factory', cap)}"`); check(/harbour/.test(sim.cannot('shipyard', cap)) || (sim.special[cap] & 1), 'a shipyard wants a harbour');
    for (let y = 0; y < 30; y++) sim.tick();
    check(sim.indAt(cap, 'workshop') > 0 && sim.slotOf(cap, 'workshop') >= 0 && !sim.freeSlots(cap).includes(sim.slotOf(cap, 'workshop')), `the workshops stand on their plot (${sim.slotOf(cap, 'workshop') + 1})`);
    check(sim.eff[c.id * 8 + 0] > eff0 + 0.25, `and make the crafts cheaper (${eff0.toFixed(2)} to ${sim.eff[c.id * 8 + 0].toFixed(2)})`); check(/Already built/.test(sim.cannot('workshop', cap)), 'one of a kind to a town');
    check(sim.indAt(cap, 'granary') > 0 && sim.indN[c.id * sim.IND.length + sim.IND.indexOf('granary')] === 1, 'the granary is counted');
    let ai = 0; for (const [i] of sim.ind) if (sim.owner[i] !== c.id) ai++; check(ai > 0, `other realms raise workshops too (${ai} towns)`);
    const farm = sim.LI.find(j => sim.owner[j] === c.id && sim.goods[j] && !sim.GOODS[sim.goods[j]].mine && sim.knows(c, j) && sim.level[j] && !(sim.special[j] & 512));
    if (farm !== undefined) { const nm = sim.workName(farm); const r = sim.act('mine', farm); check(nm !== 'Mine' && new RegExp(nm + ' under construction').test(r), `land that is not ore is worked too: "${r}"`); } else log('   (the player holds no worked field with a settlement on it)');
  }
  sane('after the player has dealt', sim);
  // save and load
  { const s = JSON.parse(JSON.stringify(sim.save())); const sim2 = createSim(wd, s.seed || 1); sim2.load(s); const M2 = sim2.market; let dp = 0, ds = 0, da = 0, dl = 0;
    for (const cv of live) { if (!sim.civs[cv.id]) continue; const o = cv.id * NG; for (let g = 1; g < NG; g++) { dp = Math.max(dp, Math.abs(M2.px[o + g] / M.px[o + g] - 1)); if (M.stock[o + g] > 1e-6) ds = Math.max(ds, Math.abs(M2.stock[o + g] / M.stock[o + g] - 1)); } for (let r = 0; r < NR; r++) if (M.act[cv.id * NR + r] > 1e-6) da = Math.max(da, Math.abs(M2.act[cv.id * NR + r] / M.act[cv.id * NR + r] - 1)); dl = Math.max(dl, Math.abs(M2.LS[cv.id] - M.LS[cv.id])); }
    check(dp < 0.02 && ds < 0.002 && da < 0.002 && dl < 0.01, `the market survives save and load (prices within ${(dp * 100).toFixed(1)}%, stores ${(ds * 100).toFixed(2)}%, plans ${(da * 100).toFixed(2)}%, living ${dl.toFixed(3)})`);
    check(sim2.indAt(c.capital, 'workshop') === sim.indAt(c.capital, 'workshop') && sim2.ind.size === sim.ind.size, 'so do the workshops'); check(JSON.stringify(sim2.playerCiv().econ) === JSON.stringify(c.econ), "and the state's reserve and orders");
    sim.tick(); sim2.tick(); const a = M.LS[c.id], b = M2.LS[c.id]; check(Math.abs(a - b) < 0.03, `and the next year goes the same way (living ${a.toFixed(3)} and ${b.toFixed(3)})`); check(M2.links.length > 0 && Math.abs(M2.links.length - M.links.length) <= Math.max(6, M.links.length * 0.25), `the merchants find their roads again (${M2.links.length} links, ${M.links.length} before)`);
    sane('a loaded world', sim2);
    // a world saved before there was a market: it finds its prices in the loading
    delete s.econ; delete s.ind; delete s.know; for (const cv of s.civs) if (cv) { delete cv.econ; delete cv.trade; delete cv.know; } const sim3 = createSim(wd, 1); sim3.load(s); const M3 = sim3.market; const p3 = sim3.playerCiv();
    let moved = 0; for (let g = 1; g < NG; g++) if (Math.abs(M3.px[p3.id * NG + g] - 1) > 0.02) moved++; check(moved > 5 && M3.LS[p3.id] !== 0.6, `a world from before the market finds its prices on loading (${moved} goods off the usual price, living ${M3.LS[p3.id].toFixed(2)})`);
    for (let y = 0; y < 50; y++) sim3.tick(); sane('an old world, 50 years on', sim3);
  }
}
}
if (want(9)) {
// ---------- 9. knowledge: the discoveries, what they open, who learns what ----------
log('9. knowledge');
{
  const KN = window.KNOW, E = window.ECON; const L = KN.LIST, U = KN.UNIT;
  // the tables hang together
  check(L.length === KN.ND && L.length >= 170 && new Set(L.map(d => d.key)).size === L.length && new Set(L.map(d => d.name)).size === L.length, `${L.length} discoveries, each with a key and a name of its own`);
  { const per = new Array(KN.NE).fill(0), sum = new Array(KN.NE).fill(0); for (const D of L) { per[D.era]++; sum[D.era] += D.cost; } let bad = 0; for (let e = 0; e < KN.NE; e++) { const band = KN.ERA_AT[e + 1] - (e ? KN.ERA_AT[e] : KN.T0); if (Math.abs(sum[e] - band) > 1e-9) bad++; } check(bad === 0 && per.every(n => n >= 12), `an age's discoveries cost together what the age is long (per age: ${per.join(', ')})`); }
  check(L.every(D => D.need.every(n => L[n].era <= D.era && n !== D.id)), 'a discovery stands only on earlier ones');
  check(L.every(D => D.text && D.text.length > 20 && D.text.length < 220 && D.cost > 0 && D.w >= 0.5 && D.w <= 1.5), 'every discovery has a line about it and a cost');
  { const idle = L.filter(D => !Object.keys(D.gives).length).map(D => D.key); check(idle.length === 0, `every discovery gives something (${idle.join(', ') || 'none idle'})`); }
  { const sim0 = createSim(wd, 9); const k = sim0.know; const noGate = E.RECIPES.filter((R, r) => !k.recipeGate(r)).map(R => R.key); check(noGate.length === 0, `every craft is opened by a discovery (${noGate.join(', ') || 'all'})`);
    const late = E.RECIPES.filter((R, r) => k.recipeGate(r) && k.recipeGate(r).era !== R.era).map(R => R.key); check(late.length === 0, `and by one of the craft's own age (${late.join(', ') || 'all'})`);
    const gated = E.GOODS.filter(g => g && g.raw && k.goodGate(g.id)); check(gated.length >= 18 && gated.every(g => k.goodGate(g.id).era <= Math.max(1, g.era)), `${gated.length} goods of the land wait on a discovery of their age or an earlier one`);
    check(['grain', 'fish', 'cattle', 'timber', 'stone', 'salt'].every(key => !k.goodGate(E.ID[key])), 'what every people lives on waits on nothing');
    for (const w of KN.WORKS) check(KN.WORK_BY[w] !== undefined || w === 'farm' || w === 'walls', `the ${w} is opened by a discovery`); check(KN.FARM.length === 4 && KN.WALLS.length === 3, 'farms have four discoveries to their five levels, walls three'); }
  // a people begins with nothing but a little to spend
  const sim = createSim(wd, 91); const k = sim.know; const i0 = sim.LI.find(i => sim.fert[i] > 0.6 && (sim.flags[i] & 2) && (sim.flags[i] & 4)) || sim.LI.find(i => sim.fert[i] > 0.6 && (sim.flags[i] & 2));
  const c = sim.setPlayer(i0, 'Scholars', null); for (let n = 0; n < 30; n++) sim.spawnTribe(sim.LI[Math.floor(sim.rnd() * sim.LI.length)], { tech: 0.018 + sim.rnd() * 0.017 });
  check(k.count[c.id] === 0 && Math.abs(k.pool[c.id] * U - 1000) < 1 && k.cur[c.id] === -1, `the player's people know nothing yet and hold ${Math.round(k.pool[c.id] * U)} insight`);
  { const others = sim.civs.filter(x => x && x !== c); const known = others.map(x => k.count[x.id]); check(Math.max(...known) > 0 && Math.max(...known) <= 6 && others.every(x => k.pool[x.id] < 0.004), `other peoples begin with what their knowledge was worth (${Math.min(...known)} to ${Math.max(...known)} discoveries)`); check(k.first.every(f => !f || f.name === ''), 'and nobody is remembered as first to what was known at the dawn'); }
  check(/Needs Farming/.test(sim.cannot('farm', i0)) && /Needs Pottery/.test(sim.cannot('workshop', i0)) && k.rmask[c.id * E.NR + E.RECIPES.findIndex(R => R.key === 'pottery')] === 0, 'no fields, no workshops and no potters before they are learned');
  check(k.study(c.id, c, 'bronze') !== null && k.study(c.id, c, 'megaliths') !== null, 'what belongs to a later age, or stands on what is not known, cannot be studied yet');
  { const before = k.pool[c.id]; const why = k.study(c.id, c, 'farming'); check(why === null && k.knows(c.id, 'farming') && Math.abs(before - k.pool[c.id] - L[KN.ID.farming].cost) < 1e-9, `with insight in hand a discovery is learned at once (${Math.round(k.pool[c.id] * U)} left)`); check(sim.cannot('farm', i0) === null || !/Needs/.test(sim.cannot('farm', i0)), 'and farms can be laid out'); check(k.farmCap[c.id] === 2 && /Irrigation/.test(k.lacks(c.id, 'farm', 3).name), 'up to the second level; the third waits on irrigation'); }
  { k.study(c.id, c, 'pottery'); check(k.knows(c.id, 'pottery') && !sim.needFor('workshop', i0) && k.rmask[c.id * E.NR + E.RECIPES.findIndex(R => R.key === 'pottery')] === 1, 'pottery opens the workshops and sets the potters to work'); check(c.events.some(e => e.type === 'know' && /Pottery/.test(e.text)), 'the chronicle says so'); }
  { const why = k.study(c.id, c, 'weaving'); const st = k.status(c.id, c, sim.insightParts(c).total); check(why === null && !k.knows(c.id, 'weaving') && st.d.key === 'weaving' && st.prog > 0 && st.prog < 1 && st.years > 10 && isFinite(st.years), `the next one is begun with what is left (${Math.round(st.prog * 100)}%, ${st.years} years to go)`); }
  // the queue: a discovery of a later age waits behind what it stands on
  k.enqueue(c.id, c, 'bronze'); check(JSON.stringify(k.mind(c).q) === JSON.stringify(['copper', 'bronze']), `queueing bronze queues copper before it (${k.mind(c).q.join(', ')})`);
  k.enqueue(c.id, c, 'megaliths'); check(k.mind(c).q.join(',') === 'copper,bronze,ritual,quarrying,megaliths', `and megaliths what they stand on (${k.mind(c).q.join(', ')})`);
  k.dequeue(c, 'bronze'); check(k.mind(c).q.indexOf('bronze') < 0, 'a discovery can be taken out of the queue');
  { const p0 = sim.insightParts(c).total; c.policy.research = 2; const p2 = sim.insightParts(c).total; check(p2 > p0 * 1.4 && p2 < p0 * 1.6, `twice the scholars' pay is half as much insight again (${(p2 / p0).toFixed(2)}x)`); sim.recount(); check(sim.incomeParts(c).scholars > 0, 'and it is paid for'); c.policy.research = 1; }
  // years pass: the queue is worked, then the scholars wait, then they choose for themselves
  k.step(c.id, c, 0.02);      // (a windfall, to see the queue worked without waiting two thousand years)
  check(k.knows(c.id, 'weaving') && k.knows(c.id, 'megaliths') && !k.knows(c.id, 'copper') && k.mind(c).q.join(',') === 'copper', `the queue is worked in order as far as the age allows (${k.count[c.id]} known, queue ${k.mind(c).q.join(', ')})`);
  let waited = 0; for (let y = 0; y < 60; y++) { sim.tick(); if (k.cur[c.id] < 0) waited++; }
  check(waited >= 20 && waited <= 30 && k.mind(c).self && k.cur[c.id] >= 0, `left without a word the scholars wait a generation, then choose for themselves (${waited} idle years; last their own choice: ${k.mind(c).self})`);
  // everybody learns; nobody knows what stands on something they do not know, nor what their age has not reached
  let toldKnow = false; for (let y = 0; y < 7900; y++) { sim.tick(); if (!toldKnow && y % 100 === 0) toldKnow = sim.allEvents.some(e => e.type === 'know'); }      // (the chronicle keeps its last few thousand: a first discovery is told early, and later news pushes it out)
  { let open = 0, early = 0, over = 0, n = 0, most = 0; for (const cv of sim.civs) { if (!cv) continue; n++; most = Math.max(most, k.count[cv.id]); let spent = 0; for (const D of L) { if (!k.has[cv.id * k.ND + D.id]) continue; spent += D.cost; if (D.era > cv.era) early++; for (const q of D.need) if (!k.has[cv.id * k.ND + q]) open++; } if (spent > (cv.tech - KN.T0) * 1.5 + 0.004) over++; }
    check(open === 0 && early === 0, `what a realm knows always stands on what it knows, within its age (${open} without footing, ${early} ahead of their age)`); check(over === 0, `nobody has learned more than its knowledge could pay for (${over} realms)`);
    log(`   ${sim.fmtYear(sim.year)}: ${n} realms, the most learned knows ${most} discoveries; the player ${k.count[c.id]}, in the ${sim.ERAS[c.era][0]}`); check(most > 25, `the world has learned things (${most})`); }
  { const M = sim.market; let craft = 0, land = 0; for (const cv of sim.civs) { if (!cv) continue; for (let r = 0; r < E.NR; r++) if (M.mk[cv.id * E.NR + r] > 0 && !k.rmask[cv.id * E.NR + r]) craft++; for (let g = 1; g < E.NG; g++) if (E.GOODS[g].raw && M.out[cv.id * E.NG + g] > 0 && !k.gmask[cv.id * E.NG + g]) land++; } check(craft === 0 && land === 0, `nobody makes what it has not learned to make, nor works land it cannot (${craft} crafts, ${land} goods)`); }
  { const firsts = L.filter(D => D.first && k.first[D.id] && k.first[D.id].name); check(firsts.length > 0 && firsts.every(D => k.first[D.id].y <= sim.year && k.first[D.id].y > -9990), `the world remembers who was first (${firsts.slice(0, 3).map(D => D.name + ': ' + k.first[D.id].name + ', ' + sim.fmtYear(k.first[D.id].y)).join('; ')})`); check(toldKnow || sim.worldEvents.some(e => e.type === 'know') || sim.allEvents.some(e => e.type === 'know'), 'and the chronicle records it'); }
  // edges are measured against the age: a realm that keeps step stands level
  { const far = sim.civs.filter(Boolean).sort((a, b) => b.tech - a.tech)[0]; const st = k.standing(far.id, far.tech); const fs = st.filter(r => r.key !== 'stab').map(r => r.key === 'build' ? 1 / r.f : r.f); check(fs.every(v => v > 0.6 && v < 1.7), `edges stay near what the age expects (${Math.min(...fs).toFixed(2)} to ${Math.max(...fs).toFixed(2)} for ${sim.fullName(far)})`);
    const sim9 = createSim(wd, 5); const z = sim9.spawnTribe(sim9.LI.find(i => sim9.fert[i] > 0.6), { tech: 1 }); for (const D of L) sim9.know.learn(z.id, z, D.id, true); sim9.know.refresh(z.id, 1); const all = sim9.know.standing(z.id, 1); check(all.every(r => r.key === 'stab' ? Math.abs(r.f) < 1e-6 : Math.abs(r.f - 1) < 1e-6), 'a people that knows everything at the end of the last age stands exactly level'); }
  // what a neighbour knows is learned half again as fast
  { const a = sim.civs.find(x => x && x !== c && k.available(x.id, x.era).length); if (a) { const d = k.available(a.id, a.era)[0]; const py = sim.insightParts(a).total; k.nb[a.id * k.ND + d] = 0; const y0 = k.yearsFor(a.id, d, py); k.nb[a.id * k.ND + d] = 1; const y1 = k.yearsFor(a.id, d, py); check(y1 < y0 && y1 >= Math.floor(y0 / 1.5) - 1, `a discovery the neighbours know takes ${y1} years, not ${y0}`); } }
  // a realm cut from another knows what its parent knew
  { let kid = null; for (const cv of sim.civs) if (cv && cv.founded > sim.year - 3000 && k.count[cv.id] > 20) { kid = cv; break; } check(!!kid, `realms born late know things from the start (${kid ? sim.fullName(kid) + ': ' + k.count[kid.id] : 'none found'})`); }
  // save and load
  { const s = JSON.parse(JSON.stringify(sim.save())); const sim2 = createSim(wd, s.seed || 1); sim2.load(s); const k2 = sim2.know; let dh = 0, dc = 0, dp = 0; for (const cv of sim.civs) { if (!cv) continue; for (let d = 0; d < k.ND; d++) if (k.has[cv.id * k.ND + d] !== k2.has[cv.id * k.ND + d]) dh++; if (k.cur[cv.id] !== k2.cur[cv.id]) dc++; dp = Math.max(dp, Math.abs(k.prog[cv.id] - k2.prog[cv.id]) * U, Math.abs(k.pool[cv.id] - k2.pool[cv.id]) * U); }
    check(dh === 0 && dc === 0 && dp < 0.01, `what every realm knows, studies and holds survives save and load (${dh} discoveries, ${dc} studies differ; ${dp.toFixed(4)} insight off)`); const p2 = sim2.playerCiv(); check(JSON.stringify(p2.know) === JSON.stringify(c.know), "and the player's queue"); check(k2.first.filter(Boolean).length === k.first.filter(Boolean).length, 'and who was first');
    let df = 0; for (const cv of sim.civs) if (cv) for (let q = 0; q < k.NK; q++) df = Math.max(df, Math.abs(k.f[cv.id * k.NK + q] - k2.f[cv.id * k.NK + q])); check(df < 1e-5, `and the edges come out the same (${df.toExponential(1)})`);
    sim.tick(); sim2.tick(); check(Math.abs(k.count[c.id] - k2.count[p2.id]) <= 1 && Math.abs(c.tech - p2.tech) < 1e-6, `the next year goes the same way (${k.count[c.id]} and ${k2.count[p2.id]} known, knowledge ${(Math.abs(c.tech - p2.tech) * U).toExponential(1)} insight apart)`);
    // a world saved before there were discoveries: every realm is given what its knowledge is worth
    delete s.know; for (const cv of s.civs) if (cv) delete cv.know; const sim3 = createSim(wd, 1); sim3.load(s); const k3 = sim3.know; let none = 0, off = 0; for (const cv of sim3.civs) { if (!cv) continue; if (cv.tech > KN.T0 + 0.01 && !k3.count[cv.id]) none++; let spent = 0; for (const D of L) if (k3.has[cv.id * k3.ND + D.id]) spent += D.cost; if (Math.abs(spent + k3.prog[cv.id] + k3.pool[cv.id] - Math.max(0, cv.tech - KN.T0)) > 1e-6) off++; }
    check(none === 0 && off === 0, `a world from before knowledge is given what its knowledge is worth (${none} realms left with nothing, ${off} with the wrong sum)`); for (let y = 0; y < 50; y++) sim3.tick(); invariants(sim3, 'an old world with new knowledge, 50 years on');
    // history keeps a calendar now. A world saved before it, and far ahead of it, keeps its own: set forward once, saved with the world
    check(sim.calShift === 0 && sim2.calShift === 0, 'a new world runs by history\'s calendar');
    { const s4 = JSON.parse(JSON.stringify(s)); for (const cv of s4.civs) if (cv) { cv.tech = Math.min(1, cv.tech + 0.3); cv.era = sim.eraOf(cv.tech); } const sim4 = createSim(wd, 1); sim4.load(s4); const front = sim4.civs.filter(Boolean).sort((a, b) => b.tech - a.tech)[0]; const tf = sim4.insightParts(front).time;
      check(sim4.calShift > 1500 && Math.abs(tf - 1) < 0.1, `an old world far ahead of history has its calendar set forward (${sim4.calShift} years; its first realm learns at ×${tf.toFixed(2)})`); check(Math.abs(sim4.histYear(front.tech) - sim4.year) <= 1, 'by which its first realm is on time');
      const sim5 = createSim(wd, 1); sim5.load(JSON.parse(JSON.stringify(sim4.save()))); check(sim5.calShift === sim4.calShift, 'and the calendar is saved with the world'); const t0 = front.tech; for (let y = 0; y < 40; y++) sim4.tick(); check(front.tech > t0 + 20 * 0.00003, `it goes on learning (${((front.tech - t0) * U).toFixed(0)} insight in 40 years)`); invariants(sim4, 'an old world ahead of history, 40 years on'); }
  }
  // speed
  { const sim4 = createSim(wd, 12); for (let n = 0; n < 40; n++) sim4.spawnTribe(sim4.LI[Math.floor(sim4.rnd() * sim4.LI.length)], {}); for (const cv of sim4.civs) if (cv) { cv.tech = 0.5; cv.era = sim4.eraOf(0.5); } for (let y = 0; y < 300; y++) sim4.tick(); const k4 = sim4.know; const st0 = k4.step; let tk = 0, nk = 0; k4.step = (a, b, g) => { const t = process.hrtime.bigint(); st0(a, b, g); tk += Number(process.hrtime.bigint() - t) / 1e6; nk++; };
    for (let y = 0; y < 200; y++) sim4.tick(); log(`   knowledge takes ${(tk / 200).toFixed(3)} ms a year for ${sim4.st.civCount} realms`); check(tk / 200 < 1.5, `knowledge is quick enough (${(tk / 200).toFixed(3)} ms a year)`); }
}
}
if (want(10)) {
// ---------- 10. rule: forms of government, laws, estates, authority ----------
log('10. laws and government');
{
  const R = window.RULE, KN = window.KNOW; R.age();
  // the tables hang together
  check(R.FORMS.length >= 20 && R.LAWS.length >= 90 && R.CATS.length === 12 && R.ESTATES.length === 7, `${R.FORMS.length} forms of government, ${R.LAWS.length} laws in ${R.CATS.length} fields, ${R.ESTATES.length} estates`);
  check(R.CATS.every(C => C.laws.length >= 5 && C.laws[0].need.length === 0 && !C.laws[0].minEra && C.laws[0].first), 'every field has at least five laws, and the first asks nothing');
  check(R.FORMS[0].key === 'band' && R.FORMS[0].need.length === 0, 'a people begins as a band');
  { const all = R.FORMS.concat(R.LAWS); check(new Set(all.map(x => x.key)).size === all.length && new Set(all.map(x => x.name)).size === all.length, 'every form and law has a key and a name of its own');
    check(all.every(x => x.text && x.text.length > 20 && x.text.length < 200), 'and a line about it');
    check(all.every(x => x.need.every(k => KN.ID[k] !== undefined) && x.era >= 0 && x.era <= 8), 'each stands on real discoveries, and belongs to an age');
    const idle = R.LAWS.filter(L => !L.first && !Object.keys(L.gives).length).map(L => L.key); check(idle.length === 0, `every law but the first of its field changes something (${idle.join(', ') || 'none idle'})`);
    const perEra = new Array(9).fill(0); for (const x of all) perEra[x.era]++; check(perEra.every(n => n >= 6), `every age opens forms and laws (${perEra.join(', ')} by age)`);
    check(R.ESTATES.every(E => E.names.length === 9 && R.K[E.lever] !== undefined), 'every estate has a name in every age and something it gives');
    const swayed = R.LAWS.filter(L => L.swayed).length, wayless = R.FORMS.filter(F => !F.ways.length).map(F => F.key); check(swayed > 50 && R.LAWS.every(L => L.sway.length === R.NE && L.sway.every(v => v > 0.2 && v < 2)) && R.CATS.every(C => !C.laws[0].swayed), `${swayed} laws put power in some hands and take it from others (the first of each field in nobody's)`);
    check(wayless.join() === 'band' && R.FORMS.every(F => F.ways.every(L => F.way[L.id] === 1 && L.wayOf.includes(F))), 'every form but the band of kin has ways of its own');
    check(R.NORM && R.KEYS.every(key => R.NORM[key] && R.NORM[key].length === 9 && R.NORM[key].every(v => isFinite(v))), 'what each age expects of rule has been measured for every key');
    const st = KN.LIST.filter(D => KN.BRANCHES[D.branch].key === 'state' && !R.opens(D.key).length).map(D => D.key); log(`   discoveries of the state that open no form or law yet: ${st.join(', ') || 'none'}`); check(st.length <= 2, 'nearly every discovery of the state opens a form or a law'); }
  // a new people
  const sim = createSim(wd, 11); const i0 = sim.LI.find(i => sim.fert[i] > 0.6 && (sim.flags[i] & 2)); const c = sim.setPlayer(i0, 'Lawgivers', null); for (let n = 0; n < 25; n++) sim.spawnTribe(sim.LI[Math.floor(sim.rnd() * sim.LI.length)], {}); sim.recount();
  const k = sim.rule, Q = k.ruleOf(c), NE = R.NE;
  check(Q.gov === 'band' && c.gov === 'band' && R.CATS.every(C => Q.laws[C.key] === C.laws[0].key) && Q.auth === 20 && Q.mood.length === NE && !Q.reform && !Q.demand, 'a new people is a band of kin under its first laws, with a little authority');
  check(sim.fullName(c) === 'the Lawgivers people' && c.ruler.title === 'Elder', `it is called ${sim.fullName(c)}, under ${c.ruler.title} ${c.ruler.name}`);
  { sim.tick(); let sum = 0; for (let e = 0; e < NE; e++) sum += k.power[c.id * NE + e]; check(Math.abs(sum - 1) < 1e-5, `the estates' power is shared out whole (${sum.toFixed(4)})`); check(k.power[c.id * NE + R.EK.farmers] > 0.35, `and a band is mostly its farmers (${Math.round(k.power[c.id * NE + R.EK.farmers] * 100)}% of power)`); }
  // what it cannot have yet, and why
  { const w = k.lacks(c.id, c, R.FORM.chiefdom); check(w && w.know === 'chiefs', 'a chiefdom needs chieftains'); const why = k.begin(c.id, c, 'chiefdom'); check(/Needs Chieftains/.test(why || ''), 'and says so: ' + why);
    check(k.lacks(c.id, c, R.FORM.empire) !== null && k.lacks(c.id, c, R.LAW.income) !== null && k.begin(c.id, c, 'nonsense') !== null, 'empires and income tax are a long way off'); }
  // a law: authority, years, then in force
  teach(sim, c, 0);
  { const L = R.LAW.clanland; check(k.lacks(c.id, c, L) === null, 'with chieftains known, clan land can be had');
    const cost = k.costOf(c.id, c, L), n = k.yearsOf(c, L); check(cost >= 15 && cost <= 90 && n === 120, `it would cost ${cost} authority and take ${n} years`);
    Q.auth = cost - 1; check(/authority/.test(k.begin(c.id, c, 'clanland') || ''), 'not without the authority'); Q.auth = cost + 5; check(k.begin(c.id, c, 'clanland') === null && Math.abs(Q.auth - 5) < 1e-9 && Q.reform && Q.reform.key === 'clanland', 'with it, the reform begins and the authority is spent');
    check(/already under way/.test(k.begin(c.id, c, 'bloodprice') || ''), 'one reform at a time'); check(/Already in force/.test(k.begin(c.id, c, 'commons') || '') || /under way/.test(k.begin(c.id, c, 'commons') || ''), 'and not what is in force already');
    const y0 = sim.year; for (let y = 0; y <= n; y++) sim.tick(); check(Q.laws.land === 'clanland' && !Q.reform && Q.at.land > y0, `after its years it is in force (${sim.fmtYear(Q.at.land)})`);
    check(c.events.some(e => e.type === 'law' && /Land of the clans/.test(e.text)), 'and the chronicle says so');
    const again = k.costOf(c.id, c, R.LAW.commons); for (let y = 0; y < 2 * R.PACE[0] + 5; y++) sim.tick(); const later = k.costOf(c.id, c, R.LAW.commons); check(again > later, `a field changed again at once costs more (${again} authority against ${later} later)`);
    Q.auth = 100; check(k.begin(c.id, c, 'bloodprice') === null, 'another reform can follow'); k.cancel(c); check(!Q.reform && Q.auth > 100 - k.costOf(c.id, c, R.LAW.bloodprice), 'and can be given up (a part of the authority comes back)'); }
  // a form of government
  { Q.auth = R.AUTH_MAX; const before = sim.fullName(c); check(k.begin(c.id, c, 'chiefdom') === null, 'a chiefdom is proclaimed'); const n = k.yearsOf(c, R.FORM.chiefdom); for (let y = 0; y <= n; y++) sim.tick();
    check(Q.gov === 'chiefdom' && c.gov === 'chiefdom' && sim.fullName(c) !== before && /Chief|Jarl|Sheikh|Ariki/.test(c.ruler.title) && sim.govName(c) === 'Chiefdom', `after ${n} years ${before} is ${sim.fullName(c)}, under ${c.ruler.title} ${c.ruler.name}`);
    check(c.events.some(e => e.type === 'state' && /become a chiefdom/.test(e.text)), 'and the chronicle says so: ' + (c.events.filter(e => e.type === 'state').map(e => e.text).pop() || '')); check(k.succession(c) === 'blood', 'its rulers now follow by blood'); }
  // names in a people's own tongue
  check(k.fullName({ name: 'Altai', style: 6 }, 'kingdom') === 'Altai Khanate' && k.fullName({ name: 'Han', style: 3 }, 'empire') === 'Great Han' && k.fullName({ name: 'Roma', style: 0 }, 'republic') === 'Republic of Roma' && k.naming({ name: 'x', style: 9 }, 'kingdom').titles[0] === 'Raja', 'realms and rulers are named in their own tongue (Altai Khanate, Great Han, a Raja)');
  // laws put power in some hands; a form's own ways come easier
  { const e = R.EK.nobles, at = (L) => { k.setLaw(c.id, c, L, 'quiet'); k.powers(c.id, c, Q); return k.power[c.id * NE + e]; }; const was = Q.laws.land; const p0 = at(R.LAW.commons), p1 = at(R.LAW.clanland); const src = k.sways(c, e);
    let sum = 0; for (let x = 0; x < NE; x++) sum += k.power[c.id * NE + x]; check(p1 > p0 * 1.08 && Math.abs(sum - 1) < 1e-5, `clan land puts power in the hands of the clan heads (${Math.round(p0 * 100)}% of it on common land, ${Math.round(p1 * 100)}% under clan land)`);
    check(src.some(r => r[0] === 'Land of the clans' && Math.abs(r[1] - 1.15) < 1e-3) && src.some(r => r[0] === 'Chiefdom' && r[1] > 1), 'and the page can say where an estate\'s power comes from: ' + src.map(r => r[0] + ' x' + (+r[1].toFixed(2))).join(', ')); at(R.LAW[was]);
    const L = R.LAW.ancestors; k.setForm(c.id, c, R.FORM.band, 'quiet'); k.powers(c.id, c, Q); const dear = k.costOf(c.id, c, L); k.setForm(c.id, c, R.FORM.chiefdom, 'quiet'); k.powers(c.id, c, Q); const cheap = k.costOf(c.id, c, L);
    check(R.FORM.chiefdom.way[L.id] === 1 && cheap < dear && cheap <= Math.ceil(dear * 0.9), `a chiefdom's own ways come easier to it (${L.name}: ${cheap} authority, ${dear} for a band)`); }
  // the estates: a law they hate, a demand, a rising
  { const e = R.EK.farmers; k.setLaw(c.id, c, R.LAW.commons, 'quiet'); const h1 = k.heading(c.id, c, e); k.setLaw(c.id, c, R.LAW.clanland, 'quiet'); const h2 = k.heading(c.id, c, e); check(h2 < h1 - 0.05, `farmers are less content under clan land than on common land (heading for ${h2.toFixed(2)}, not ${h1.toFixed(2)})`);
    for (let y = 0; y < 600; y++) sim.tick(); check(Math.abs(Q.mood[e] - k.heading(c.id, c, e)) < 0.06, `and in time that is how content they are (${Q.mood[e].toFixed(2)})`);
    const why = k.reasons(c.id, c, e); check(why.some(r => r[0] === 'Land of the clans' && r[1] < 0), 'the reasons name the law');
    const a0 = Q.auth = 50; Q.demand = { e: R.EK.nobles, key: 'bloodprice', since: sim.year, until: sim.year + 400 }; k.refuse(c.id, c, false); check(!Q.demand && Q.bump[R.EK.nobles] < -0.05 && Q.auth > a0, 'a demand refused is remembered, and the ruler stands the taller for it');
    Q.demand = { e: R.EK.nobles, key: 'bloodprice', since: sim.year, until: sim.year + 400 }; k.grant(c.id, c); check(!Q.demand && Q.laws.justice === 'bloodprice' && Q.bump[R.EK.nobles] > 0, 'a demand granted is law at once, and they are glad of it');
    Q.demand = { e: R.EK.nobles, key: 'tribute', since: sim.year, until: sim.year + 2 }; for (let y = 0; y < 4; y++) sim.tick(); check(!Q.demand && Q.laws.tax !== 'tribute', 'a demand left unanswered lapses as a refusal');
    c.stability = 0.9; const n0 = k.stats.risings[R.EK.artisans]; k.rising(c.id, c, R.EK.artisans); check(c.stability < 0.8 && k.stats.risings[R.EK.artisans] === n0 + 1 && c.events.some(ev => ev.type === 'law' && /Riots|down their tools/.test(ev.text)) && Q.rose === sim.year, `a rising shakes the realm (stability ${c.stability.toFixed(2)})`);
    const w = k.wish(c.id, c, R.EK.farmers); check(w && w.likes[R.EK.farmers] > R.LAW[Q.laws[w.cat]].likes[R.EK.farmers], `an estate knows what it would like (farmers: ${w && w.name})`); }
  // what the page reads
  { const sp = sim.stabilityParts(c); let sum = 1; for (const key in sp) if (key !== 'target') sum += sp[key]; check(Math.abs(sum - sp.target) < 1e-9 && isFinite(sp.rule), `stability's parts add up to where it is heading (${sp.target.toFixed(2)})`);
    const ip = sim.incomeParts(c); check(isFinite(ip.state) && Math.abs(ip.taxes + ip.ports + ip.markets + ip.mines + ip.living + ip.customs - ip.upkeep - ip.scholars - ip.state - ip.net) < 1e-9, 'and the ledger has what the laws spend'); const inc = c.income; sim.tick(); check(Math.abs(sim.incomeParts(c).net - c.income) < Math.max(0.02, Math.abs(c.income) * 0.02), `the ledger's sum is the year's income (${sim.incomeParts(c).net.toFixed(2)} and ${c.income.toFixed(2)})`); }
  // the autopilot's world
  while (sim.year < -2500) sim.tick();
  { let n = 0, changed = 0, bad = 0, badF = 0, badP = 0, unknown = 0; const forms = new Set();
    for (const cv of sim.civs) { if (!cv) continue; n++; const q = k.ruleOf(cv); forms.add(q.gov); let d = 0; for (const C of R.CATS) if (q.laws[C.key] !== C.laws[0].key) d++; if (d && !cv.player) changed++;
      if (!R.FORM[q.gov] || cv.gov !== q.gov || R.CATS.some(C => !R.LAW[q.laws[C.key]] || R.LAW[q.laws[C.key]].cat !== C.key) || !(q.auth >= 0 && q.auth <= R.AUTH_MAX) || q.mood.some(m => !(m >= 0 && m <= 1))) bad++;
      if (!k.known(cv.id, R.FORM[q.gov]) || R.CATS.some(C => !k.known(cv.id, R.LAW[q.laws[C.key]]))) unknown++;
      for (let q2 = 0; q2 < R.NK; q2++) { const v = k.f[cv.id * R.NK + q2]; if (!isFinite(v) || (R.ADDED[R.KEYS[q2]] ? Math.abs(v) > 0.8 : v < 0.15 || v > 4)) badF++; }
      let ps = 0; for (let e = 0; e < NE; e++) ps += k.power[cv.id * NE + e]; if (Math.abs(ps - 1) > 1e-4) badP++; }
    check(bad === 0 && badF === 0 && badP === 0, `every realm's rule is sound in ${sim.fmtYear(sim.year)} (${bad} with a bad form, law, authority or mood; ${badF} factors out of bounds; ${badP} with power not shared out whole)`);
    check(unknown === 0, `nobody holds a form or a law it does not know how to have (${unknown})`);
    check(forms.size >= 4 && changed > n * 0.5 && k.stats.laws > 100, `the autopilot has reformed: ${forms.size} forms in use (${[...forms].join(', ')}), ${changed} of ${n} realms with laws of their own making, ${k.stats.laws} laws passed and ${k.stats.forms} changes of form`);
    check(k.stats.demands > 0 && k.stats.granted + k.stats.refused > 0, `estates have made demands (${k.stats.demands}: ${k.stats.granted} granted, ${k.stats.refused} refused)`); log(`   risings so far: ${k.stats.risings.map((v, e) => v ? R.ESTATES[e].key + ' ' + v : '').filter(Boolean).join(', ') || 'none'}`);
    // rule is measured against the age: the world as a whole is level with it (what feeds people by people, what holds a realm together by the usual realm)
    const byP = ['food', 'work', 'trade', 'grow'], byR = ['tax', 'strength', 'research', 'reach'], m = {}; let pw = 0, rw = 0, st = 0; for (const key of byP.concat(byR)) m[key] = 0;
    for (const cv of sim.civs) { if (!cv || cv.player) continue; const P = sim.popOf[cv.id], q = Math.sqrt(P); pw += P; rw += q; st += q * k.f[cv.id * R.NK + R.K.stab]; for (const key of byP) m[key] += P * k.f[cv.id * R.NK + R.K[key]]; for (const key of byR) m[key] += q * k.f[cv.id * R.NK + R.K[key]]; }
    for (const key of byP) m[key] /= pw; for (const key of byR) m[key] /= rw; st /= rw;
    check(byP.concat(byR).every(key => m[key] > 0.85 && m[key] < 1.18) && Math.abs(st) < 0.08, `the world's rule is level with its age (${byP.concat(byR).map(key => key + ' ' + m[key].toFixed(2)).join(', ')}, stability ${(st >= 0 ? '+' : '') + st.toFixed(2)}): measure again with tools/rule/norm.js if not`); }
  // the mills; what was seized passes at a death; a doctrine from abroad
  { const big = sim.civs.filter(cv => cv && !cv.player && sim.cellsOf[cv.id] > 20).sort((a, b) => sim.urban[b.id] / sim.popOf[b.id] - sim.urban[a.id] / sim.popOf[a.id]);
    const cv = big[0], era0 = cv.era; cv.era = 6; const mills = k.times(cv.id, cv, R.EK.artisans).find(r => /mills/.test(r[0])); const h6 = k.heading(cv.id, cv, R.EK.artisans); cv.era = era0; const h0 = k.heading(cv.id, cv, R.EK.artisans);
    check(R.FACTORY[6] > 0.2 && mills && mills[1] < -0.05 && h6 < h0 - 0.03, `in the age of the mills those who work them are harder to content (${R.estateName(R.EK.artisans, 6)} of ${cv.name}: heading for ${h6.toFixed(2)}, not ${h0.toFixed(2)})`);
    if (!big.slice(1).some(t => k.known(t.id, R.FORM.kingdom)) && big[1]) teach(sim, big[1], 1);      // (a world in which none of the great realms has kings yet: one is taught what a crown stands on)
    let passed = null; for (const t of big.slice(1)) { if (!k.known(t.id, R.FORM.kingdom)) continue; const q = k.ruleOf(t); q.reform = null; k.setForm(t.id, t, R.FORM.tyranny, 'quiet'); for (let n = 0; n < 60 && q.gov === 'tyranny'; n++) k.passes(t.id, t); if (q.gov !== 'tyranny') { passed = t; break; } }
    check(passed && R.kindOf(R.FORM[k.ruleOf(passed).gov]) !== 2 && passed.gov === k.ruleOf(passed).gov && !k.lacks(passed.id, passed, R.FORM[passed.gov]), `what was seized seldom outlives the one who seized it (a tyranny of the ${passed && passed.name} becomes a ${passed && R.FORM[passed.gov].name.toLowerCase()} at his death)`);
    const p = sim.playerCiv(); k.setForm(p.id, p, R.FORM.tyranny, 'quiet'); let own = false; for (let n = 0; n < 40; n++) own = own || k.passes(p.id, p); check(!own && k.ruleOf(p).gov === 'tyranny', 'but the player\'s realm is his own to change'); k.setForm(p.id, p, R.FORM.chiefdom, 'quiet');
    const t = big[9] || big[big.length - 1], q = k.ruleOf(t), e0 = t.era, heard = k.abroad.peoples; check(!!k.lacks(t.id, t, R.FORM.peoples), 'nobody in this age knows how a people\'s republic is run'); k.abroad.peoples = true; t.era = 6;
    for (let n = 0; n < 80 && q.gov !== 'peoples'; n++) { t.stability = 0.3; k.rising(t.id, t, R.EK.artisans); } t.era = e0; t.stability = 0.8;
    check(q.gov === 'peoples' && q.brought === 'peoples' && !k.lacks(t.id, t, R.FORM.peoples) && k.known(t.id, R.FORM.peoples) && !!k.lacks(t.id, t, R.LAW.planned), `once the world has heard of it, those who rise can proclaim one (${sim.fullName(t)}): the doctrine travels ahead of the knowledge, its laws do not`); k.abroad.peoples = heard; }
  // save and load
  { for (const cv of sim.civs) if (cv) { k.powers(cv.id, cv, k.ruleOf(cv)); k.refresh(cv.id, cv); }      // (as a loaded world reckons them: from the realm as it stands, not as it stood when its year was stepped)
    const s = JSON.parse(JSON.stringify(sim.save())); const sim2 = createSim(wd, s.seed || 1); sim2.load(s); const k2 = sim2.rule; let diff = 0, df = 0, dfAll = 0, same = 0, all = 0;
    // (a save keeps each region's people to a part in a hundred, and a loaded world counts its towns afresh from them: a town here and there has crossed a line. Where the towns are the same, so must the factors be, to that grain)
    for (const cv of sim.civs) { if (!cv) continue; const c = cv.id, a = k.ruleOf(cv), b = k2.ruleOf(sim2.civs[c]); if (a.gov !== b.gov || JSON.stringify(a.laws) !== JSON.stringify(b.laws) || Math.abs(a.auth - b.auth) > 1e-9 || JSON.stringify(a.mood) !== JSON.stringify(b.mood) || JSON.stringify(a.reform) !== JSON.stringify(b.reform) || JSON.stringify(a.demand) !== JSON.stringify(b.demand)) diff++;
      let d = 0; for (let q = 0; q < R.NK; q++) d = Math.max(d, Math.abs(k.f[c * R.NK + q] - k2.f[c * R.NK + q])); all++; dfAll = Math.max(dfAll, d); if (sim.townsOf[c] === sim2.townsOf[c]) { same++; df = Math.max(df, d); } }
    check(diff === 0, `every realm's form, laws, authority, estates and reform survive save and load (${diff} differ)`); check(same > all * 0.4 && df < 3e-3 && dfAll < 0.03, `and the factors come out the same (${df.toExponential(1)} apart at most in the ${same} of ${all} realms whose towns are counted the same, ${dfAll.toExponential(1)} in the rest)`);
    check(sim2.fullName(sim2.playerCiv()) === sim.fullName(c), 'and what the realm is called');
    // a world saved before there were laws
    for (const cv of s.civs) if (cv) { delete cv.rule; cv.gov = cv.tech < 0.08 ? 'tribe' : 'kingdom'; } const sim3 = createSim(wd, 1); sim3.load(s); const k3 = sim3.rule; let n3 = 0, with3 = 0, bands = 0; for (const cv of sim3.civs) { if (!cv) continue; n3++; const q = k3.ruleOf(cv); if (R.CATS.some(C => q.laws[C.key] !== C.laws[0].key)) with3++; if (!R.FORM[q.gov]) bands++; }
    check(with3 > n3 * 0.5 && bands === 0, `a world from before laws is given the laws of its age (${with3} of ${n3} realms have some)`);
    // (such a world was fed by the table of its day, and keeps it: the first load after the update must not starve its people)
    { const old = JSON.parse(JSON.stringify(s)); delete old.heard; delete old.food; const sim4 = createSim(wd, 1); sim4.load(old); const kept = JSON.parse(JSON.stringify(sim4.save())); const sim5 = createSim(wd, 1); sim5.load(kept);
      check(!sim.foodOld && !sim2.foodOld && sim4.foodOld && sim5.foodOld && kept.food === 15 && sim4.foodMult(0.6) > sim.foodMult(0.6) * 1.15, `and keeps the yield of the land it was saved under (${sim4.foodMult(0.6).toFixed(3)} at the Renaissance, not ${sim.foodMult(0.6).toFixed(3)}), through further saves`); } for (let y = 0; y < 50; y++) sim3.tick(); invariants(sim3, 'an old world with new laws, 50 years on'); }
  // speed
  { const st0 = k.step; let tk = 0; k.step = (a, b) => { const t = process.hrtime.bigint(); st0(a, b); tk += Number(process.hrtime.bigint() - t) / 1e6; }; for (let y = 0; y < 200; y++) sim.tick(); k.step = st0;
    log(`   rule takes ${(tk / 200).toFixed(3)} ms a year for ${sim.st.civCount} realms`); check(tk / 200 < 2.5, `rule is quick enough (${(tk / 200).toFixed(3)} ms a year)`); invariants(sim, 'the world of laws in ' + sim.fmtYear(sim.year)); }
}
}
if (want(11)) {
// ---------- 11. diplomacy: opinions, pacts, vassals, causes of war, terms of peace ----------
log('11. diplomacy');
{
  const DP = window.DIPLO, R = window.RULE, KN = window.KNOW;
  // the tables hang together
  check(DP.PACTS.length === 5 && DP.PACTS.every(P => KN.ID[P.need] !== undefined && P.turns >= 2 && P.text.length > 30) && KN.ID[DP.VASSAL.need] !== undefined, 'five pacts and vassalage, each standing on a real discovery');
  check(Object.keys(DP.OPENS).length >= 5 && Object.keys(DP.OPENS).every(k => KN.ID[k] !== undefined && DP.OPENS[k].length > 20), 'what else discoveries open between realms (a claim, vassals, embassies, the wireless, unification) is said of real discoveries');
  check(Object.keys(DP.CAUSES).length === 11 && Object.values(DP.CAUSES).every(C => C.name && C.text.length > 15 && ['land', 'tribute', 'vassal', 'regime', 'none'].includes(C.goal)), 'eleven causes of war (the holy city among them), each with something to win');
  check(Object.values(DP.STAND).every(([n, h]) => n && /^#[0-9A-F]{6}$/i.test(h)) && Object.keys(DP.TERMS).every(t => DP.TERM_TEXT[t] && DP.RANK[t] !== undefined), 'standings have a colour, terms a rank and a line');
  check(DP.moodOf(80) === 'devoted' && DP.moodOf(0) === 'indifferent' && DP.moodOf(-20) === 'wary' && DP.moodOf(-90) === 'bitter', 'opinions have words');
  check(DP.UNJUST_STAB[0] === 0 && DP.UNJUST_STAB[1] === 0 && DP.UNJUST_REP[8] > DP.UNJUST_REP[3] && DP.UNJUST_REP[3] > 0, 'the early ages keep no account of unprovoked wars; the later ones do');

  // a small world made by hand: the player in the middle, a realm two regions off on every side (so that each touches the player's land)
  const sim = createSim(wd, 21); const W2 = sim.W; const ok = (i) => i >= 0 && i < N && sim.land[i] && !(sim.flags[i] & 8) && sim.fert[i] > 0.15;
  const i0 = sim.LI.find(i => sim.fert[i] > 0.5 && [i - 3, i + 3, i - 3 * W2, i + 3 * W2, i - 3 * W2 - 3, i + 3 * W2 + 3, i - 3 * W2 + 3, i + 3 * W2 - 3].every(ok) && [-2, -1, 1, 2].every(d => ok(i + d) && ok(i + d * W2)));
  const c = sim.setPlayer(i0, 'Envoys', null); const mk = (off) => { const t = sim.spawnTribe(i0 + off, {}); for (const d of [-1, 1, -W2, W2]) { const j = i0 + off + d; if (sim.owner[j] < 0 && ok(j)) { sim.owner[j] = t.id; sim.pop[j] = 0.5; } } return t; };
  const A = mk(3), B = mk(-3), E = mk(3 * W2), F = mk(-3 * W2), G = mk(3 * W2 + 3), H = mk(-3 * W2 - 3), J = mk(-3 * W2 + 3), K2 = mk(3 * W2 - 3);
  // (their borders are made to meet the player's: one region of each lies against his)
  for (const [t, off] of [[A, 2], [B, -2], [E, 2 * W2], [F, -2 * W2], [G, 2 * W2 + 2], [H, -2 * W2 - 2], [J, -2 * W2 + 2], [K2, 2 * W2 - 2]]) { sim.owner[i0 + off] = t.id; sim.pop[i0 + off] = 0.5; }
  const all = [c, A, B, E, F, G, H, J, K2]; const dp = sim.diplo; const iron = sim.ERAS[2][1] + 0.01;
  // (nobody here does anything of his own accord: no envoys are sent and no wars begun but those the test sends and begins)
  const still = () => { for (const x of all) if (sim.civs[x.id] === x) { x.aggression = 0; if (x !== c) x.dip.think = 1e12; } }; still();
  const setAge = (tech) => { for (const x of all) { x.tech = tech; x.era = sim.eraOf(tech); } };
  const pops = (list) => { for (const [x, p] of list) for (let k = 0; k < sim.LI.length; k++) { const i = sim.LI[k]; if (sim.owner[i] === x.id) sim.pop[i] = p; } sim.recount(); sim.touchAll(); };
  pops([[c, 6], [A, 4], [B, 4], [E, 4], [F, 2], [G, 0.6], [H, 0.6], [J, 3], [K2, 3]]);
  check(all.every(x => x.dip && x.dip.rep === 50 && x.dip.lord === -1 && !Object.keys(x.dip.pact).length), 'every realm begins with a clean slate and an ordinary name');
  check([A, B, E, F].every(x => dp.touches(c, x.id) && dp.reach(c.id).includes(x.id)), 'the player can deal with those he touches');
  { const r = dp.reasons(A, c); const sum = r.why.reduce((t, w) => t + w[1], 0); check(Math.abs(sum - r.o) < 1e-6 && r.o >= -100 && r.o <= 100 && r.why.some(w => /border/.test(w[0])), `an opinion is the sum of its reasons (${r.o}: ${r.why.map(w => w[0] + ' ' + w[1]).join(', ')})`); }

  // before writing, nothing can be sworn; coin and war are all there is
  check(/Needs Written laws/.test(dp.cannot(c, A, 'nap') || '') && /Needs Written laws/.test(dp.propose(c, A, 'nap') || ''), 'a sworn peace needs written laws: ' + dp.cannot(c, A, 'nap'));
  check(/Needs Envoys/.test(dp.cannot(c, A, 'alliance') || '') && /Needs Kingship/.test(dp.cannot(c, A, 'vassal') || '') && /Needs Markets/.test(dp.cannot(c, A, 'trade') || ''), 'alliances need envoys, vassals kingship, trade agreements markets');
  { const cs = dp.causes(c, B); const W0 = dp.warCost(c, B); check(cs[cs.length - 1].key === 'none' && cs[cs.length - 1].just && W0.stab === 0 && W0.rep === 0, 'in the Stone Age nobody asks why a war is fought'); }
  // gifts: coin for goodwill, by what it is to the one who gets it, and no more than 45 of it
  { c.wealth = 500; const before = dp.opinion(B, c), w0 = B.wealth; check(dp.gift(c, B, 0) !== null && dp.gift(c, B, 1e6) !== null, 'a gift of nothing, or of more than the treasury holds, is not sent');
    check(dp.gift(c, B, 40) === null && c.wealth === 460 && B.wealth === w0 + 40, 'coin changes hands'); const after = dp.opinion(B, c); check(after > before && after - before <= 22, `and buys goodwill (${before} -> ${after})`);
    for (let n = 0; n < 12; n++) dp.gift(c, B, 30); check(dp.memOf(B, c.id) <= 45.01 && dp.memOf(B, c.id) > 30, `but not without end (${dp.memOf(B, c.id).toFixed(1)})`); }

  // the Iron Age: everything but embassies; kings on every throne
  setAge(iron); for (const x of all) { teach(sim, x, 2); sim.rule.setForm(x.id, x, R.FORM.kingdom, 'quiet'); x.ruler.trait = 'steward'; } { const of = sim.faith.found(all[0].id, all[0].capital, { name: 'the Old Faith', tenets: ['kings', 'pilgrim'] }); for (const x of all) if (x !== all[0]) sim.faith.adopt(x.id, of, 'chosen'); sim.faith.news.length = 0; } still(); sim.recount();
  check(all.every(x => sim.rule.succession(x) === 'blood') && dp.cannot(c, A, 'nap') === null && dp.cannot(c, A, 'alliance') === null && dp.cannot(c, A, 'marriage') === null, 'with writing, envoys and kings, everything can be proposed');
  // a sworn peace: agreed, in force on both sides for four turns, and it binds
  { dp.remember(A, c.id, 30); const j = dp.judge(A, c, 'nap'); check(j.ok && j.why.length > 0, `they would agree (${j.score}: ${j.why.map(w => w[0]).join(', ')})`);
    const y = sim.year, turn = DP.PACE[c.era]; check(dp.propose(c, A, 'nap') === null && dp.has(c, A.id, 'nap') && dp.has(A, c.id, 'nap') && c.dip.pact[A.id].nap === y + 4 * turn, 'a sworn peace holds four turns, on both sides');
    check(dp.bound(c, A) && dp.bound(A, c) && dp.warWith(A, c) === null, 'and neither will attack the other'); check(dp.cannot(c, A, 'nap') === 'Already in force', 'it cannot be sworn twice');
    const W1 = dp.warCost(c, A); check(W1.broke === 'nap' && W1.rep >= 30, `breaking it would cost the player's word ${W1.rep}`);
    // (who would attack whom is asked of their arms, as the fights are: not of their numbers)
    A.ruler.trait = 'tyrant'; A.policy.military = 4; sim.recount(); let broke = 0; for (let n = 0; n < 60 && !broke; n++) { const w = dp.warWith(A, c); if (w && w.g < 0.2) broke = 1; } check(broke === 1, 'only the faithless would break a sworn peace, and seldom'); A.ruler.trait = 'steward'; A.policy.military = 1; sim.recount();
    check(sim.mightOf[c.id] > sim.strengthOf[c.id] * 2 && Math.abs(sim.strengthOf[c.id] / sim.strengthOf[A.id] - 1) < 0.5 && sim.mightOf[c.id] / sim.mightOf[A.id] > 2, `arms and might are two figures: a realm of many is no better armed for it, and far mightier (arms ${(sim.strengthOf[c.id] / sim.strengthOf[A.id]).toFixed(2)} to 1, might ${(sim.mightOf[c.id] / sim.mightOf[A.id]).toFixed(1)} to 1)`); }
  // refusal, and no asking again at once
  { dp.remember(B, c.id, -200); const j = dp.judge(B, c, 'alliance'); check(!j.ok, `one who hates you refuses (${j.score})`); const n0 = dp.stats.refused; check(dp.propose(c, B, 'alliance') === 'They refuse' && dp.stats.refused === n0 + 1 && !dp.has(c, B.id, 'alliance'), 'and says so');
    check(dp.propose(c, B, 'alliance') === 'They have only just answered that', 'and will not be asked again the same turn'); }
  // a trade agreement halves the customs on that road; closed markets shut it
  { dp.remember(E, c.id, 30); check(dp.propose(c, E, 'trade') === null && dp.agreed(c.id, E.id) && dp.agreed(E.id, c.id) && !dp.agreed(c.id, F.id), 'a trade agreement is agreed');
    for (let n = 0; n < 5; n++) sim.tick(); const link = (x) => sim.market.links.find(L => (L.a === c.id && L.b === x.id) || (L.b === c.id && L.a === x.id));
    check(!!link(E) && link(E).fr === true && !!link(F) && !link(F).fr, 'the market knows which roads have one');
    check(dp.embargo(c, F, true) === null && dp.closed(c.id, F.id) && dp.closed(F.id, c.id), 'markets can be closed to a realm'); const before = dp.opinion(F, c); for (let n = 0; n < 2; n++) sim.tick();
    check(link(F).shut === true && link(F).v === 0 && link(E).shut === false, 'and nothing passes on that road'); check(dp.reasons(F, c).why.some(w => /markets are closed/.test(w[0])), 'they hold it against him');
    check(dp.embargo(c, F, false) === null && !dp.closed(c.id, F.id), 'and opened again'); sim.tick(); check(link(F).shut === false, 'the road is open'); }
  // a claim gives a war its reason; a war without one costs quiet at home and trust abroad
  { c.wealth = 5000; const cost = dp.claimCost(c, B); check(dp.claim(c, B) === null && c.wealth === 5000 - cost && dp.causes(c, B)[0].key === 'claim', `a claim on a neighbour's borderland costs ${cost} coin and is a reason`);
    const W1 = dp.warCost(c, B, 'claim'), W2b = dp.warCost(c, F, 'none'); check(W1.stab === 0 && W1.rep === 0 && W2b.stab === DP.UNJUST_STAB[2] && W2b.rep === DP.UNJUST_REP[2], `a war with a reason costs nothing; one without, ${W2b.stab} stability and ${W2b.rep} of one's word`);
 }
  // war: those sworn to the defender come in beside it, the war is theirs to follow, and one peace ends it for all
  // (a vassal always comes; one bound by a pact weighs it, and may leave its friend to fight alone: the world left to itself shows that)
  { dp.subject(B, J, null); const s0 = c.stability, r0 = c.dip.rep; check(dp.declare(c, B, 'claim') === null && sim.isAtWar(c, B.id) && sim.isAtWar(B, c.id) && c.dip.goal[B.id] === 'claim', 'war is declared, for a claim');
    check(c.stability === s0 && c.dip.rep === r0, 'at no cost at home or abroad'); check(sim.isAtWar(J, c.id) && J.dip.side[c.id] === B.id, 'their vassal comes in beside them');
    check(/fight for/.test(dp.cannotSue(c, J) || '') && dp.cannotSue(c, B) === null, 'peace is made with the one whose war it is');
    check(dp.reasons(B, c).o < -20 && c.events.some(e => /declares war on/.test(e.text) && /claim/.test(e.text)), 'they will not forget it, and the chronicle says why');
    const j = dp.wouldEnd(B, c, c, 'white'); check(j.ok, 'with nobody winning they would take peace as things stand: ' + j.why); check(!dp.wouldEnd(B, c, c, 'tribute').ok && !dp.wouldEnd(B, c, c, 'vassal').ok, 'but will not pay or kneel unbeaten');
    check(dp.sue(c, B, 'white') === null && !sim.isAtWar(c, B.id) && !sim.isAtWar(c, J.id) && J.dip.side[c.id] === undefined, 'one peace ends it for everyone'); dp.release(B, J); c.truce[J.id] = -1e9; J.truce[c.id] = -1e9; check(/truce/i.test(dp.cannotFight(c, B) || '') && /truce/i.test(dp.declare(c, B) || ''), 'and a truce follows: ' + dp.cannotFight(c, B)); }
  // a war won: the terms follow from how it stands
  { check(dp.declare(c, F, 'none') === null, 'another war, for no reason'); check(c.dip.rep === 50 - DP.UNJUST_REP[2], `the player's word suffers for it (${c.dip.rep})`);
    F.warStart[c.id] = Math.round(sim.cellsOf[F.id] * 1.3); const sc = dp.score(c, F); check(sc > 0.15 && sc < 0.3, `having lost a quarter of its land they stand at ${sc.toFixed(2)}`);
    check(dp.termsFor(c, F, sc).join() === 'tribute,white' && dp.wouldEnd(F, c, c, 'tribute').ok && !dp.wouldEnd(F, c, c, 'vassal').ok, 'they would pay, but not kneel');
    check(dp.sue(c, F, 'vassal') !== null && sim.isAtWar(c, F.id), 'and say so'); check(dp.sue(c, F, 'tribute') === null && !sim.isAtWar(c, F.id) && F.dip.owes[c.id] > sim.year, 'reparations are agreed');
    for (let n = 0; n < 3; n++) sim.tick(); const ip = sim.incomeParts(c); check(dp.trIn[c.id] > 0 && dp.trOut[F.id] > 0 && Math.abs(ip.tribute - dp.trIn[c.id] + dp.trOut[c.id]) < 1e-6 && ip.tribute > 0, `and paid: ${ip.tribute.toFixed(3)} a year, an eighth of what they earn`);
    check(c.dip.inf === 0, 'no land was taken, so nobody is the warier'); }
  // submission: by war, by demand; what a vassal owes and may not do; release, rebellion, union
  { check(dp.declare(c, G, 'none') === null, 'a war on a small neighbour'); G.warStart[c.id] = Math.round(sim.cellsOf[G.id] * 3); const sc = dp.score(c, G); check(dp.termsFor(c, G, sc)[0] === 'vassal' && dp.wouldEnd(G, c, c, 'vassal').ok, `at ${sc.toFixed(2)} they would bend the knee`);
    check(dp.sue(c, G, 'vassal') === null && G.dip.lord === c.id && dp.lordOf(G) === c && dp.vassalsOf(c.id).includes(G), 'and do'); check(dp.standing(c, G) === 'vassal' && dp.standing(G, c) === 'lord', 'each knows where the other stands');
    for (let n = 0; n < 3; n++) sim.tick(); check(dp.trOut[G.id] > 0 && Math.abs(dp.trOut[G.id] / Math.max(1e-9, (G.income || 0) + dp.trOut[G.id]) - DP.TRIBUTE) < 0.02, `a vassal pays a tenth (${dp.trOut[G.id].toFixed(3)} of ${((G.income || 0) + dp.trOut[G.id]).toFixed(3)})`);
    check(dp.cannotFight(c, G) === 'They are your vassal' && /lord/.test(dp.cannotFight(G, c) || '') && /vassal makes no wars/.test(dp.cannotFight(G, K2) || ''), 'lord and vassal do not fight, and a vassal makes no wars of its own');
    // (an attack on the vassal is laid before its lord)
    K2.truce = {}; check(dp.declare(K2, G, 'none') === null && sim.isAtWar(K2, G.id), 'a third realm attacks the vassal'); const o = c.dip.offers.find(x => x.kind === 'call' && x.from === G.id && x.vs === K2.id); check(!!o, 'and its lord is called');
    check(dp.answer(c, o.id, true) === null && sim.isAtWar(c, K2.id) && c.dip.side[K2.id] === G.id && !c.dip.offers.some(x => x.kind === 'call'), 'he comes'); check(dp.abandon(c, K2) === null && !sim.isAtWar(c, K2.id) && c.dip.rep < 50, 'or goes home alone, and is thought the less of');
    dp.conclude(K2, G, 'white');
    // a demand without a war: the very strong may ask, the refused remember
    pops([[c, 60], [H, 0.3]]); dp.remember(H, c.id, 40); const j = dp.judge(H, c, 'vassal'); check(j.ok, `a realm two hundred times weaker, and well disposed, bends the knee when asked (${j.score})`); check(dp.propose(c, H, 'vassal') === null && H.dip.lord === c.id, 'and does');
    // release
    { const m0 = dp.memOf(G, c.id); check(dp.breakPact(c, G, 'vassal') === null && G.dip.lord === -1 && dp.memOf(G, c.id) > m0 + 10, 'a vassal released remembers it kindly'); }
    // joined to the crown: only after six turns, and only if they think well of their lord
    check(/Not before/.test(dp.cannotJoin(c, H) || ''), 'a vassal cannot be swallowed at once: ' + dp.cannotJoin(c, H)); H.dip.since = sim.year - 7 * DP.PACE[c.era]; dp.remember(H, c.id, 60);
    const cells = sim.cellsOf[c.id] + sim.cellsOf[H.id], hid = H.id; check(dp.annex(c, H) === null && sim.civs[hid] === null, 'after six turns of goodwill it is joined to the crown'); sim.recount(); check(sim.cellsOf[c.id] === cells, 'with all its land');
    check(sim.civs.every(x => !x || (x.dip.lord !== hid && !x.dip.pact[hid] && x.dip.mem[hid] === undefined && x.wars[hid] === undefined)), 'and nobody is bound to what is gone');
    // rebellion
    dp.subject(c, G, null); check(dp.rebel(G) === null && G.dip.lord === -1 && dp.causes(c, G)[0].key === 'rebel', 'a vassal that throws off the yoke is a rebel to be brought to heel');
    pops([[c, 2], [J, 6]]); dp.remember(J, c.id, -60); { const r = dp.propose(c, J, 'vassal'); check(r === 'They refuse' && dp.causes(c, J).some(x => x.key === 'refused'), 'a realm of his own weight refuses, and the refusal is itself a reason for war: ' + r); } }
  // what is laid before the player: a proposal, a peace, and what happens when he says nothing
  { c.dip.offers = c.dip.offers.filter(x => x.from !== E.id); check(dp.propose(E, c, 'alliance') === null && c.dip.offers.some(x => x.from === E.id && x.kind === 'alliance') && !dp.has(c, E.id, 'alliance'), 'what another realm proposes waits on the player'); const o = c.dip.offers.find(x => x.from === E.id && x.kind === 'alliance');
    check(dp.answer(c, o.id, true) === null && dp.has(E, c.id, 'alliance') && dp.standing(c, E) === 'ally', 'accepted, it is in force'); check(dp.answer(c, o.id, true) === 'That has lapsed', 'an answer is given once');
    c.dip.offers = c.dip.offers.filter(x => x.from !== J.id); dp.propose(J, c, 'trade'); const o2 = c.dip.offers.find(x => x.from === J.id && x.kind === 'trade'); const m0 = dp.memOf(J, c.id); check(dp.answer(c, o2.id, false) === null && dp.memOf(J, c.id) < m0 && !dp.has(c, J.id, 'trade'), 'declined, it is remembered a little');
    // (a war grown old: the other side sends envoys; unanswered, they settle it as things stand)
    J.truce = {}; c.truce = {}; check(dp.declare(J, c, 'none') === null, 'a neighbour attacks'); const old = sim.year - 3 * DP.PACE[c.era]; c.wars[J.id] = J.wars[c.id] = old; dp.warsEnd(J);
    const o3 = c.dip.offers.find(x => x.kind === 'peace' && x.from === J.id); check(!!o3 && o3.terms === 'white' && sim.isAtWar(c, J.id), 'after a generation of war they offer peace, and wait'); o3.until = sim.year; sim.tick(); check(!sim.isAtWar(c, J.id) && !c.dip.offers.includes(o3), 'left unanswered, the envoys settle a long war as it stands'); }
  // a pact runs its course, and can be sworn again in its last turn
  { const u = c.dip.pact[A.id].nap; const turn = DP.PACE[c.era]; while (sim.year < u - turn + 1) sim.tick(); check(dp.has(c, A.id, 'nap') && dp.cannot(c, A, 'nap') === null, 'in its last turn a pact can be sworn again'); dp.remember(A, c.id, 30); check(dp.propose(c, A, 'nap') === null && c.dip.pact[A.id].nap > u, 'and runs on');
    const u2 = c.dip.pact[E.id].trade; while (sim.year < u2 + 4) sim.tick(); check(!dp.has(c, E.id, 'trade') && (c.dip.pact[E.id] || {}).trade === undefined && c.events.some(e => /has run its course/.test(e.text)), 'one that is not, ends, and the player is told'); }      // (the record of a realm with which nothing is sworn any longer is dropped whole)
  // marriage: only between houses, and now and then one inherits the other
  { pops([[A, 4], [B, 0.4]]); A.truce = {}; B.truce = {}; dp.remember(A, B.id, 30); dp.remember(B, A.id, 60); check(dp.propose(A, B, 'marriage') === null && dp.has(A, B.id, 'marriage') && dp.bound(A, B), 'two houses are joined'); sim.rule.setForm(E.id, E, R.FORM.republic, 'quiet'); check(/ruled by blood/.test(dp.cannot(c, E, 'marriage') || ''), 'a republic has no house to marry into');
    let done = 0; for (let n = 0; n < 4000 && !done; n++) { dp.heir(A.id, A); if (!sim.civs[B.id] || !sim.civs[A.id] || B.dip.lord === A.id || A.dip.lord === B.id) done = 1; } check(done === 1, 'sooner or later one house inherits the other: ' + (sim.civs[B.id] && sim.civs[A.id] ? 'two realms, one ruler' : 'its lands')); }
  // a vassal whose lord has grown weak throws off the yoke by itself
  { dp.subject(F, K2, null); K2.dip.since = sim.year - 3 * DP.PACE[K2.era]; pops([[F, 0.5], [K2, 8]]); dp.remember(K2, F.id, -40); let free = 0; for (let n = 0; n < 60 && !free; n++) { dp.think(K2.id, K2); if (K2.dip.lord === -1) free = 1; } check(free === 1 && dp.claimUntil(F, K2.id, 'rebel') > sim.year, 'a vassal stronger than its lord, and ill disposed, rebels'); }
  invariants(sim, 'the hand-made world of envoys');
  // what is sworn, owed and remembered survives a save; a world saved before diplomacy wakes with a clean slate
  { const s = JSON.parse(JSON.stringify(sim.save())); const sim2 = createSim(wd, 21); sim2.load(s); let same = 0, n = 0; const rec = (d) => { const o = Object.assign({}, d); delete o.next; return JSON.stringify(o); };      // (all but `next`: a loaded record is looked through afresh)
    for (const x of sim.civs) { if (!x) continue; n++; if (rec(sim2.civs[x.id].dip) === rec(x.dip)) same++; }
    check(same === n && n > 3, `every realm's record survives a save (${same} of ${n})`); check(sim2.diplo.has(sim2.playerCiv(), A.id, 'nap') && sim2.diplo.standing(sim2.playerCiv(), sim2.civs[E.id]) === dp.standing(c, E), 'and means the same');
    for (let y = 0; y < 30; y++) sim2.tick(); invariants(sim2, 'the loaded world of envoys');
    const old = JSON.parse(JSON.stringify(sim.save())); for (const x of old.civs) if (x) delete x.dip; const sim3 = createSim(wd, 21); sim3.load(old); check(sim3.civs.every(x => !x || (x.dip && x.dip.rep === 50 && !Object.keys(x.dip.pact).length && x.dip.lord === -1)), 'a world from before diplomacy has sworn nothing yet');
    for (let y = 0; y < 30; y++) sim3.tick(); invariants(sim3, 'an old world, thirty years on'); }
  // a realm that loses its last land in a war is struck off: its enemies' wars with it end there and then (left on their lists they would
  // pass to whoever is born under its number), and the conqueror is marked for it, since no peace is made with the dead
  { pops([[F, 6], [K2, 2]]); const no = dp.declare(F, K2, 'rebel'), inf0 = F.dip.inf, id = K2.id, was = (dp.stats.peace.conquest || 0); for (const i of sim.LI) if (sim.owner[i] === id) sim.owner[i] = F.id; sim.recount(); sim.touchAll(); sim.tick();
    check(no === null && !K2.alive && sim.civs[id] !== K2 && F.wars[id] === undefined && sim.civs.every(x => !x || x.wars[id] === undefined), `a realm that has lost its last land is struck off, and nobody is left at war with it - or with whoever is born under its number (${no})`);
    check(F.dip.inf > inf0 && (dp.stats.peace.conquest || 0) === was + 1, `its conqueror is marked for it (conquests ${inf0.toFixed(1)} -> ${F.dip.inf.toFixed(1)})`); invariants(sim, 'the hand-made world after a conquest'); }
}
// a world left to itself: by the Iron Age it has sworn, married, knelt and fought for reasons
{
  const sim = createSim(wd, 31); for (let n = 0; n < 40; n++) sim.spawnTribe(sim.LI[Math.floor(sim.rnd() * sim.LI.length)], {}); sim.recount(); const dp = sim.diplo; const t0w = Date.now();
  while (sim.year < -800) sim.tick(); const S = dp.stats; let bound = 0, n = 0, vass = 0; for (const x of sim.civs) { if (!x) continue; n++; if (x.dip.lord >= 0) vass++; if (x.dip.lord >= 0 || Object.keys(x.dip.pact).length || dp.vassalsOf(x.id).length) bound++; }
  log(`   by ${sim.fmtYear(sim.year)}: ${n} realms, ${bound} bound to somebody, ${vass} vassals; sworn ${JSON.stringify(S.pacts)}; wars ${JSON.stringify(S.wars)}; peace ${JSON.stringify(S.peace)}; ${S.broken} oaths broken, ${S.unions} unions (${((Date.now() - t0w) / 1000).toFixed(0)} s)`);
  check(['nap', 'trade', 'marriage'].every(k => S.pacts[k] > 5) && (S.pacts.defence || 0) + (S.pacts.alliance || 0) > 0, 'realms that rule themselves swear peace, open their markets, marry and stand together');
  check(S.vassals > 3 && S.vassals < 60, `some kneel, and not everyone (${S.vassals} made: ${Object.entries(S.how).map(([k, v]) => k + ' ' + v).join(', ')}; ${S.freed} up again - in a world this young few have had the time; the hand-made one above shows how)`); check((S.wars.none || 0) > 50 && (S.wars.covet || 0) + (S.wars.claim || 0) + (S.wars.reconquest || 0) > 10 && (S.wars.ally || 0) > 0, 'wars are fought for nothing, for goods, for claims and beside friends');
  check(S.peace.white > 50 && S.peace.tribute > 3, 'most end as they stand; some are paid for'); check(bound > n * 0.3 && bound < n, `a good part of the world is bound to somebody, not all of it (${bound} of ${n})`);
  invariants(sim, 'the world of envoys in ' + sim.fmtYear(sim.year));
  // speed: what diplomacy costs a year
  { const T = {}; for (const k of ['tick', 'step', 'warsEnd', 'warWith', 'heir']) { const f = dp[k]; T[k] = 0; dp[k] = function () { const t = process.hrtime.bigint(); const r = f.apply(this, arguments); T[k] += Number(process.hrtime.bigint() - t) / 1e6; return r; }; }
    for (let y = 0; y < 300; y++) sim.tick(); let sum = 0; for (const k in T) sum += T[k]; log(`   diplomacy takes ${(sum / 300).toFixed(3)} ms a year for ${sim.st.civCount} realms (${Object.entries(T).map(([k, v]) => k + ' ' + (v / 300).toFixed(3)).join(', ')})`);
    check(sum / 300 < 1.0, `diplomacy is quick enough (${(sum / 300).toFixed(3)} ms a year)`); }      // (0.75 here in the Iron Age with three hundred realms, a tenth of it this clock's own: a thirtieth of the year)
}
}
if (want(12)) {
// ---------- 12. hosts and fleets: they march, take land, lay siege, give battle, and are saved ----------
log('12. armies');
{
  const sim = createSim(wd, 33); const W2 = sim.W; const ok = (i) => i >= 0 && i < N && sim.land[i] && !(sim.flags[i] & 8) && sim.fert[i] > 0.15;
  // a strip of land: the player at one end, an enemy beside him, a neutral realm beyond
  const i0 = sim.LI.find(i => sim.fert[i] > 0.5 && [-2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(d => ok(i + d) && ok(i + d + W2) && ok(i + d - W2)));
  const c = sim.setPlayer(i0, 'Hosts', null); const A = sim.spawnTribe(i0 + 4, {}), B = sim.spawnTribe(i0 + 9, {});
  for (let d = 2; d <= 6; d++) for (const e of [-W2, 0, W2]) { sim.owner[i0 + d + e] = A.id; sim.pop[i0 + d + e] = 1.2; }
  for (let d = 7; d <= 10; d++) for (const e of [-W2, 0, W2]) { sim.owner[i0 + d + e] = B.id; sim.pop[i0 + d + e] = 1.2; }
  for (const d of [-1, 1]) for (const e of [-W2, 0, W2]) { sim.owner[i0 + d + e] = c.id; sim.pop[i0 + d + e] = 2; }
  sim.pop[i0] = 6; A.capital = i0 + 5; B.capital = i0 + 9; sim.pop[i0 + 5] = 4;
  const all = [c, A, B]; for (const x of all) { x.aggression = 0; if (x !== c) x.dip.think = 1e12; x.tech = sim.ERAS[2][1] + 0.01; x.era = 2; teach(sim, x, 2); }
  sim.touchAll(); sim.tick(); c.wealth = 1e6;
  const AR = sim.army;
  // the levy takes the field as a host
  const msg = sim.act('levy', i0); const h = AR.of(c.id)[0];
  check(!!h && h.men > 40 && !h.ai && /host|army/.test(h.name), `the levy takes the field: "${msg}" (${h ? h.men : 0} men)`);
  check(AR.order(h.id, i0 + 9) && /not at war|will not let/.test(AR.order(h.id, i0 + 9)), 'a host may not march into a realm it is not at war with: ' + AR.order(h.id, i0 + 9));
  // war; the enemy keeps a host on the front; the player's marches on the enemy's capital, region by region
  check(sim.diplo.declare(c, A, 'none') === null && sim.isAtWar(c, A.id), 'war on the neighbour');
  check(AR.order(h.id, A.capital) === null && h.path.length >= 4 && h.state === 'march', `the host is sent to their capital: ${h.path.length} regions`);
  const cells0 = sim.cellsOf[c.id]; let foeHost = null, y0 = sim.year;
  for (let y = 0; y < 60 && sim.owner[A.capital] !== c.id; y++) { sim.tick(); foeHost = foeHost || AR.list.find(a => a.ai && a.c === A.id); }
  check(!!foeHost, 'the enemy keeps a host on the front');
  check(AR.stats.taken > 0 && sim.cellsOf[c.id] > cells0, `the host takes the enemy's regions as it comes to them (${AR.stats.taken} taken in ${sim.year - y0} years)`);
  check(AR.stats.battles > 0, `hosts that meet give battle (${AR.stats.battles})`);
  // a walled town is besieged, and falls
  if (sim.civs[A.id] && sim.owner[A.capital] === A.id) {
    const cap = A.capital; sim.walls[cap] = 2; sim.level[cap] = Math.max(1, sim.level[cap]);
    const hh = AR.of(c.id)[0] || (sim.act('levy', i0), AR.of(c.id)[0]); hh.men = Math.max(hh.men, 5000); hh.morale = 1;
    AR.order(hh.id, cap); let sieged = false;
    for (let y = 0; y < 120 && sim.owner[cap] === A.id; y++) { sim.tick(); if (hh.state === 'siege') sieged = true; if (!AR.byId(hh.id)) break; }
    check(sieged, 'a walled town is besieged');
    check(sim.owner[cap] === c.id || sim.civs[A.id] !== A, `and falls (${sim.owner[cap] === c.id ? 'taken' : sim.civs[A.id] !== A ? 'the realm is gone' : 'held by ' + sim.owner[cap]})`); sim.tick();      // (a realm whose capital fell picks another the next year)
  } else check(true, 'the capital fell to the march');
  // save and load keep the hosts in the field
  const hs = AR.list.length, saved = JSON.parse(JSON.stringify(sim.save())); const s2 = createSim(wd, 1); s2.load(saved);
  check(s2.army.list.length === hs && s2.army.list.every(a => typeof a.men === 'number' && a.cell >= 0), `saved and loaded: ${hs} hosts`);
  // disbanded, the levy is over
  const h3 = AR.of(c.id)[0]; if (h3) { AR.disband(h3.id); check(!AR.of(c.id).length && c.army <= sim.year, 'a host sent home ends the levy'); }
  // a fleet needs a harbour
  check(/harbour/i.test(sim.act('fleet', i0 + 1) || ''), 'a fleet needs a harbour: ' + sim.act('fleet', i0 + 1));
  invariants(sim, 'the world of hosts in ' + sim.fmtYear(sim.year));
}
// the autopilot's hosts in a whole world: on every front, quick enough
{
  const sim = createSim(wd, 12345); for (let y = 0; y < 3000; y++) sim.tick();
  const AR = sim.army; let ms = 0; for (let y = 0; y < 100; y++) { const t = process.hrtime.bigint(); sim.tick(); ms += Number(process.hrtime.bigint() - t) / 1e6; }
  const wars = sim.civs.reduce((n, x) => n + (x ? Object.keys(x.wars).length : 0), 0);
  log(`   ${sim.fmtYear(sim.year)}: ${AR.list.length} hosts in the field for ${wars / 2} wars, ${AR.stats.battles} battles; a year of hosts takes ${AR.stats.ms.toFixed(2)} ms`);
  check(AR.list.length > 0 && AR.list.every(a => a.ai && sim.civs[a.c] && sim.isAtWar(sim.civs[a.c], a.foe)), 'the autopilot keeps hosts only on fronts of its wars');
  check(AR.stats.ms < 4, `hosts are quick enough (${AR.stats.ms.toFixed(2)} ms a year)`);
}
}
if (want(13)) {
// ---------- 13. peoples: who lives where; kin and strangers; taken in, drifting apart, rising; saved ----------
log('13. peoples');
{
  const sim = createSim(wd, 41); const W2 = sim.W, PP = sim.people; const ok = (i) => i >= 0 && i < N && sim.land[i] && !(sim.flags[i] & 8) && sim.fert[i] > 0.15;
  const i0 = sim.LI.find(i => sim.fert[i] > 0.5 && [-2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(d => ok(i + d) && ok(i + d + W2) && ok(i + d - W2)));
  // a tribe on empty land is a new people, named as it is; another settling near it is of its kin; one far off a new family
  const A = sim.spawnTribe(i0, {}); const pA = PP.ruling[A.id];
  check(pA > 0 && PP.ppl[i0] === pA && PP.list[pA].name === A.name && PP.list[pA].fam === pA, `a tribe on empty land is a new people: the ${PP.list[pA] && PP.list[pA].name}`);
  const B = sim.spawnTribe(i0 + 6, { style: A.style }); const pB = PP.ruling[B.id];      // (of the same kind of tongue as the place gave A)
  check(pB > 0 && pB !== pA && PP.list[pB].parent === pA && PP.list[pB].fam === pA, `a tribe of its kind of tongue settling near is of its kin: the ${PP.list[pB].name}, daughters of the ${PP.list[pA].name}`);
  { const j = i0 - 2 * W2; const D2 = sim.owner[j] < 0 && sim.land[j] ? sim.spawnTribe(j, { style: (A.style + 1) % 12 }) : null; if (D2) { const pD = PP.ruling[D2.id]; check(PP.list[pD].fam === pD && PP.list[pD].parent === 0, 'one of another kind of tongue, however near, is the first of a new family'); } }
  check(B.style === PP.list[pB].t.st, 'and its realm is named in its tongue');
  const far = sim.LI.find(i => ok(i) && sim.cellDist(i, i0) > 40 && sim.owner[i] < 0 && PP.ppl[i] === 0);
  const C = sim.spawnTribe(far, {}); const pC = PP.ruling[C.id];
  check(pC > 0 && PP.list[pC].fam === pC && PP.list[pC].parent === 0, 'one far away is the first of a new family');
  // settlers bring their people; a conquered region keeps its own
  sim.claim(i0 + 1, A, i0); check(PP.ppl[i0 + 1] === pA, 'empty land a realm settles is its people\'s');
  for (let d = 5; d <= 8; d++) for (const e of [-W2, 0, W2]) { if (sim.owner[i0 + d + e] < 0) sim.claim(i0 + d + e, B, i0 + 6); sim.pop[i0 + d + e] = 2; }
  for (let d = 1; d <= 4; d++) for (const e of [-W2, 0, W2]) { if (sim.owner[i0 + d + e] !== A.id) sim.claim(i0 + d + e, A, i0); sim.pop[i0 + d + e] = 2; }
  sim.recount(); const took = i0 + 5; sim.claim(took, A, i0 + 4); sim.recount();
  check(sim.owner[took] === A.id && PP.ppl[took] === pB, 'a conquered region keeps its own people');
  // the strangers a realm rules cost it some steadiness, measured against its age
  for (const x of [A, B, C]) { x.aggression = 0; x.dip.think = 1e12; }
  for (let y = 0; y < 6; y++) sim.tick();
  const fsA = PP.foreignShare[A.id], sp = sim.stabilityParts(A);
  check(fsA > 0 && fsA < 1 && sp.peoples < 0, `a realm ruling others is the less steady for it (${Math.round(fsA * 100)}% others: ${(sp.peoples * 100).toFixed(1)} stability)`);
  check(PP.peoplesOf(A.id, 4).length >= 2 && PP.peoplesOf(A.id, 4)[0][0] === pA, 'its peoples, the largest first: ' + PP.peoplesOf(A.id, 4).map(([p, s]) => PP.nameOf(p) + ' ' + Math.round(s * 100) + '%').join(', '));
  // laws: one state, one law and schooling take others in faster; self-rule leaves them be and quiets them
  const R = sim.rule.ruleOf(A); const was = { admin: R.laws.admin, learning: R.laws.learning };
  R.laws.admin = 'central'; R.laws.learning = 'schooling'; const fast = PP.lawF(A.id, 'assim'); R.laws.admin = 'selfrule'; const slow = PP.lawF(A.id, 'assim'), calm = PP.lawF(A.id, 'minor'); R.laws.admin = was.admin; R.laws.learning = was.learning;
  check(fast > 2 && slow < 1 && calm < 1, `laws: one state and schools take others in ${fast.toFixed(1)} times as fast; self-rule ${slow.toFixed(1)}, and quiets them (${calm.toFixed(2)})`);
  // over the centuries a region among the rulers' own is taken into their people
  A.tech = sim.ERAS[6][1] + 0.01; A.era = 6; R.laws.admin = 'central'; R.laws.learning = 'schooling';      // (an industrial state with schools: in the Stone Age it would take a thousand years)
  const before = PP.stats.assimilated; for (let y = 0; y < 900 && PP.ppl[took] !== pA; y++) { if (sim.owner[took] !== A.id) sim.claim(took, A, i0 + 4); sim.tick(); }
  check(PP.ppl[took] === pA && PP.stats.assimilated > before, `in time a region among the rulers' own is taken into their people (${PP.stats.assimilated - before} regions taken in)`);
  // a province of another people breaks away with its people, named in its tongue
  { const s2 = createSim(wd, 43), P2 = s2.people; const j0 = s2.LI.find(i => s2.fert[i] > 0.5 && [-1, 1, 2, 3, 4, 5, 6, 7, 8, 9].every(d => ok(i + d) && ok(i + d + W2) && ok(i + d - W2) && s2.owner[i + d] < 0));
    const X = s2.spawnTribe(j0, {}); const pX = P2.ruling[X.id]; const far2 = s2.LI.find(i => ok(i) && s2.cellDist(i, j0) > 40 && s2.owner[i] < 0); const Y = s2.spawnTribe(far2, {}); const pY = P2.ruling[Y.id];
    for (let d = 1; d <= 9; d++) for (const e of [-W2, 0, W2]) { s2.owner[j0 + d + e] = X.id; s2.pop[j0 + d + e] = 2; P2.ppl[j0 + d + e] = d >= 6 ? pY : pX; }
    s2.recount(); const nc = s2.splitCiv(X, j0 + 8, 9, 'as the realm fractures');
    const cells = []; for (let d = 1; d <= 9; d++) for (const e of [-W2, 0, W2]) if (nc && s2.owner[j0 + d + e] === nc.id) cells.push(j0 + d + e);
    check(!!nc && P2.ruling[nc.id] === pY && cells.length >= 6 && cells.every(i => P2.ppl[i] === pY) && nc.style === P2.list[pY].t.st, `a province of another people breaks away with its people (${cells.length} regions, all theirs: ${nc && s2.fullName(nc)})`);
    const ev = X.events.slice(-3).map(e => e.text).join(' / '); check(new RegExp('The ' + P2.list[pY].name + ' of .* break away').test(ev), 'and the chronicle says who rose: ' + ev.slice(0, 140)); }
  // a people spread far beyond its home drifts apart into a daughter people of its own tongue
  { const s3 = createSim(wd, 47), P3 = s3.people; const k0 = s3.LI.find(i => s3.fert[i] > 0.3 && s3.owner[i] < 0); const Z = s3.spawnTribe(k0, {}); const pZ = P3.ruling[Z.id];
    const row = []; for (let d = 1; d < 120 && row.length < 60; d++) { const i = k0 + d; if (ok(i) && s3.owner[i] < 0) row.push(i); } for (const i of row) { P3.ppl[i] = pZ; s3.pop[i] = 1; }
    P3.list[pZ].born = s3.year - 400; let y = 0; for (; y < 100 && !P3.stats.drifted; y++) s3.tick();
    const d = P3.list.find(p => p && p.parent === pZ && p.fam === pZ); check(P3.stats.drifted > 0 && !!d && d.t.st === P3.list[pZ].t.st, `a people spread far drifts apart: the ${d ? d.name : '?'} of the ${P3.list[pZ].name} (${y} years)`); }
  // saved and loaded: the map of peoples, their tongues and who rules whom
  { const saved = JSON.parse(JSON.stringify(sim.save())); const s2 = createSim(wd, 1); s2.load(saved); const Q = s2.people; let same = true; for (let i = 0; i < N; i++) if (Q.ppl[i] !== PP.ppl[i]) { same = false; break; }
    check(same && Q.list.length === PP.list.length && Q.ruling[A.id] === PP.ruling[A.id] && Q.list[pA].name === PP.list[pA].name && JSON.stringify(Q.list[pB].t) === JSON.stringify(PP.list[pB].t), `saved and loaded: ${PP.list.length - 1} peoples and the map of them`);
    delete saved.peoples; const s3 = createSim(wd, 1); s3.load(saved); const R3 = s3.people; let all = true; for (const k of s3.LI) { const o = s3.owner[k]; if (o >= 0 && s3.civs[o] && R3.ppl[k] !== R3.ruling[o]) { all = false; break; } }
    check(all && R3.list.length > 1, 'a world saved before there were peoples: every realm\'s land its own people\'s'); }
  invariants(sim, 'the world of peoples in ' + sim.fmtYear(sim.year));
}
// the peoples of a whole world: many, of fewer families, quick enough
{
  const sim = createSim(wd, 12345); const PP = sim.people; for (let y = 0; y < 3000; y++) sim.tick();
  let ms = 0; for (let y = 0; y < 100; y++) { sim.tick(); ms += PP.stats.ms; }
  const alive = PP.list.filter(p => p && p.n > 0), fams = new Set(alive.map(p => p.fam)); let bad = 0; for (const cv of sim.civs) if (cv && !(PP.foreignShare[cv.id] >= 0 && PP.foreignShare[cv.id] <= 1 && PP.restless[cv.id] <= 0.02 && PP.restless[cv.id] > -0.5)) bad++;
  log(`   ${sim.fmtYear(sim.year)}: ${alive.length} peoples in ${fams.size} families, ${PP.stats.drifted} drifted apart, ${PP.stats.assimilated} regions taken in; a year of peoples takes ${(ms / 100).toFixed(3)} ms`);
  check(alive.length > 80 && fams.size < alive.length, `a world of peoples (${alive.length}) in fewer families (${fams.size})`);
  check(!bad, `every realm's share of other peoples and its unrest are within bounds (${bad} not)`);
  check(ms / 100 < 1, `peoples are quick enough (${(ms / 100).toFixed(3)} ms a year)`);
}
}
if (want(14)) {
// ---------- 14. faiths: founded, carried by the state, preached, taken up; what it costs; holy cities, churches, the player; saved ----------
log('14. faiths');
{
  const sim = createSim(wd, 53); const W2 = sim.W, F = sim.faith; const ok = (i) => i >= 0 && i < N && sim.land[i] && !(sim.flags[i] & 8) && sim.fert[i] > 0.15;
  const i0 = sim.LI.find(i => sim.fert[i] > 0.5 && [-2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every(d => ok(i + d) && ok(i + d + W2) && ok(i + d - W2) && ok(i + d - 2 * W2) && ok(i + d + 2 * W2)));
  const bronze = sim.ERAS[1][1] + 0.01, classic = sim.ERAS[3][1] + 0.01;
  const A = sim.spawnTribe(i0, {}), B = sim.spawnTribe(i0 + 8, {});
  for (const x of [A, B]) { x.tech = bronze; x.era = sim.eraOf(bronze); teach(sim, x, x === A ? 1 : 0); x.aggression = 0; x.dip.think = 1e12; }      // (B has no priests of its own: no prophet will arise there)
  // a prophet arises in a realm without a faith: a faith of its people, founded at its capital, the faith of the realm
  check(!F.state[A.id] && !A.religion, 'a new realm keeps the old ways');
  const f = F.prophet(A.id, A.capital, 'prophet'); const X = F.list[f];
  check(f > 0 && F.state[A.id] === f && A.religion === X.name && X.home === A.capital && F.fth[A.capital] === f && X.tenets.length === 2 && !X.world, `a prophet founds a faith of its people at the capital: ${X && X.name} (${X && X.tenets.join(', ')})`);
  check(F.holyAt.get(A.capital) === f, 'and its holy city is the capital');
  // the state carries it through the realm; settlers of the realm's own people bring it to empty land
  for (let d = 1; d <= 4; d++) for (const e of [-2 * W2, -W2, 0, W2, 2 * W2]) { const i = i0 + d + e; if (sim.owner[i] < 0) sim.claim(i, A, i0); sim.pop[i] = 2; }
  for (let d = 6; d <= 12; d++) for (const e of [-2 * W2, -W2, 0, W2, 2 * W2]) { const i = i0 + d + e; if (sim.owner[i] < 0) sim.claim(i, B, i0 + 8); sim.pop[i] = 2; }
  sim.recount();
  const aCells = [], bCells = []; for (let d = 1; d <= 12; d++) for (const e of [-2 * W2, -W2, 0, W2, 2 * W2]) { const i = i0 + d + e; if (sim.owner[i] === A.id) aCells.push(i); else if (sim.owner[i] === B.id) bCells.push(i); }
  for (const i of aCells) if (i !== A.capital) F.fth[i] = 0;
  const c0 = F.stats.converted; let y = 0; for (; y < 600 && aCells.filter(i => F.fth[i] === f).length < aCells.length * 0.6; y++) sim.tick();
  check(F.stats.converted > c0 && aCells.filter(i => F.fth[i] === f).length >= aCells.length * 0.6, `the state carries its faith through the realm (${aCells.filter(i => F.fth[i] === f).length} of ${aCells.length} regions in ${y} years)`);
  // a ruler of the old ways takes up the faith of his neighbour
  for (y = 0; y < 800 && F.state[B.id] !== f; y++) sim.tick();
  check(F.state[B.id] === f && B.religion === X.name, `a neighbour of the old ways takes it up (${y} years)`);
  // a faith for all peoples is preached over the border, into a realm of another faith
  const C = sim.spawnTribe(sim.LI.find(i => ok(i) && sim.owner[i] < 0 && sim.cellDist(i, i0) > 30), {}); C.tech = classic; C.era = sim.eraOf(classic); teach(sim, C, 3); C.aggression = 0; C.dip.think = 1e12;
  const g = F.found(C.id, C.capital, { world: true, tenets: ['mission', 'alms'] }); const G = F.list[g];
  check(g > 0 && G.world && G.tenets.join() === 'mission,alms', `a realm that knows the world faiths founds one for all peoples: ${G.name}`);
  for (const i of bCells.slice(0, 6)) F.fth[i] = g;      // (its preachers have come)
  const p0 = F.stats.preached; for (y = 0; y < 300 && F.stats.preached === p0; y++) sim.tick();
  check(F.stats.preached > p0, `those who preach it carry it from region to region (${F.stats.preached - p0} in ${y} years)`);
  // other faiths cost a realm some steadiness, measured against its age; the laws weigh on it
  for (const i of bCells) { if (i !== B.capital) F.fth[i] = g; }
  for (y = 0; y < 6; y++) sim.tick();
  const sp = sim.stabilityParts(B); check(F.otherShare[B.id] > 0.3 && sp.faiths < 0, `a realm of many other faiths is the less steady for it (${Math.round(F.otherShare[B.id] * 100)}% others: ${(sp.faiths * 100).toFixed(1)} stability)`);
  const R = sim.rule.ruleOf(B), was = R.laws.faith; R.laws.faith = 'tolerance'; const calm = F.lawF(B.id, 'minor'), slow = F.lawF(B.id, 'conv'); R.laws.faith = 'orthodoxy'; const hot = F.lawF(B.id, 'minor'), fast = F.lawF(B.id, 'conv'), hold = F.lawF(B.id, 'resist'); R.laws.faith = was;
  check(calm < 1 && slow < 1 && hot > 1 && fast > 1.5 && hold < 0.5, `laws: many gods in one peace quiet other faiths (${calm}) and carry the realm's slowly (${slow}); an enforced orthodoxy angers them (${hot}), carries it fast (${fast}) and holds it against preachers (${hold})`);
  check(weightOk(F), 'other faiths weigh as they should: the old ways a quarter, another church most, another faith all');
  function weightOk(F) { return F.weight(f, f) === 0 && F.weight(0, f) === 0.25 && F.weight(g, f) === 1; }
  // a holy city keeps its faith, and its fall is told
  { const hc = X.home; if (sim.owner[hc] !== A.id) sim.claim(hc, A, hc); sim.claim(hc, C, hc + 1); sim.faithNews();
    const told = C.events.slice(-4).concat(A.events.slice(-4)).map(e => e.text).join(' / '); check(/holy city of/.test(told), 'the fall of a holy city to a realm of another faith is told: ' + told.slice(0, 160));
    for (y = 0; y < 120; y++) { if (sim.owner[hc] !== C.id) sim.claim(hc, C, hc + 1); sim.tick(); } check(F.fth[hc] === f, 'and the holy city keeps its faith under its new masters'); }
  // diplomacy: a realm whose holy city another faith holds thinks less of it, and may go to war for it (A of its own faith, which a
  // ruler of a people's faith may have left for one for all peoples in the years above)
  { if (F.state[A.id] !== f) F.adopt(A.id, f, 'chosen'); if (F.state[C.id] !== g) F.adopt(C.id, g, 'chosen'); const out = []; sim.diplo.opinion(A, C, out); check(out.some(r => /holy city/.test(r[0])), 'a realm thinks less of whoever holds the holy city of its faith: ' + out.map(r => r[0] + ' ' + r[1]).join(', ')); }
  // a church breaks away far from its holy city (the more readily once books are printed), and takes its people with it
  { const s2 = createSim(wd, 59), F2 = s2.faith; const j0 = s2.LI.find(i => ok(i) && s2.owner[i] < 0 && s2.fert[i] > 0.4);
    const H = s2.spawnTribe(j0, {}); const far = s2.LI.find(i => ok(i) && s2.owner[i] < 0 && s2.cellDist(i, j0) > 90 && [1, 2, 3, 4, 5, 6].every(d => ok(i + d) && ok(i + d + W2) && ok(i + d - W2)));
    const Z = s2.spawnTribe(far, {}); const ren = s2.ERAS[5][1] + 0.01; for (const x of [H, Z]) { x.tech = ren; x.era = s2.eraOf(ren); teach(s2, x, 5); x.aggression = 0; x.dip.think = 1e12; }
    const h = F2.found(H.id, H.capital, { world: true, tenets: ['mission', 'peace'] }); F2.adopt(Z.id, h, 'chosen'); F2.list[h].born = s2.year - 500;
    for (let d = 1; d <= 6; d++) for (const e of [-W2, 0, W2]) { const i = far + d + e; if (s2.owner[i] < 0) s2.claim(i, Z, far); s2.pop[i] = 3; F2.fth[i] = h; }
    for (let k = 0; k < 40; k++) { const i = s2.LI.find(q => ok(q) && s2.owner[q] < 0 && F2.fth[q] === 0 && s2.cellDist(q, j0) < 25 && s2.cellDist(q, j0) > 2 + k * 0.1); if (i === undefined) break; F2.fth[i] = h; s2.pop[i] = 1; }
    s2.recount(); let yy = 0; for (; yy < 400 && !F2.stats.split; yy++) s2.tick();
    const sect = F2.list.find(q => q && q.parent === h); check(F2.stats.split > 0 && !!sect && F2.state[Z.id] === sect.id && F2.fth[far + 1] === sect.id, `far from its holy city a church breaks away: ${sect ? sect.name : '?'} (${yy} years), and the realm's people go with it`); }
  // the player: a prophet waits for him; he founds the faith with the tenets he chooses; takes up another; sends missionaries; a church of his own
  { const s4 = createSim(wd, 61), F4 = s4.faith; const k0 = s4.LI.find(i => ok(i) && s4.owner[i] < 0 && s4.fert[i] > 0.5 && [1, 2, 3, 4, 5, 6, 7, 8].every(d => ok(i + d) && s4.owner[i + d] < 0));
    s4.setPlayer(k0, 'Testland'); const P = s4.playerCiv(); P.tech = bronze; P.era = s4.eraOf(bronze); teach(s4, P, 1);
    const N2 = s4.spawnTribe(k0 + 6, {}); N2.tech = classic; N2.era = s4.eraOf(classic); teach(s4, N2, 3); N2.aggression = 0; N2.dip.think = 1e12; const n = F4.found(N2.id, N2.capital, { world: true });
    F4.prophet(P.id, P.capital, 'prophet'); check(F4.pending[P.id] === P.capital && !F4.state[P.id], 'in the player\'s realm a prophet waits for the court');
    check(s4.faithCosts().found === 0 && s4.faithCosts().canFound, 'and founding his faith costs nothing');
    const why = s4.faithAct('found', ['monks', 'pilgrim'], 'the Faith of Tests'); const pf = F4.state[P.id];
    check(!why && pf > 0 && F4.list[pf].name === 'the Faith of Tests' && F4.list[pf].tenets.join() === 'monks,pilgrim' && F4.pending[P.id] < 0, `the player founds it with the tenets he chose (${why || F4.list[pf].name})`);
    for (let k = 0; k < 400; k++) s4.tick(); check(F4.state[P.id] === pf, 'and his realm keeps it until he changes it');
    const R4 = s4.rule.ruleOf(P); R4.auth = 150; const cost = s4.faithCosts().adopt(n); const w2 = s4.faithAct('adopt', n);
    check(!w2 && F4.state[P.id] === n && R4.auth === 150 - cost, `he takes up another faith for ${cost} authority (${w2 || F4.nameOf(n)})`);
    P.wealth = 5000; const t0 = s4.civs.find(c => c && c !== P && F4.state[c.id] !== n); if (t0) { const w3 = s4.faithAct('mission', t0.id); check(!w3 && F4.missionTo[P.id] === t0.id, `and sends missionaries (${w3 || s4.fullName(t0)})`); }
    const save4 = JSON.parse(JSON.stringify(s4.save())); const s5 = createSim(wd, 1); s5.load(save4); const F5 = s5.faith; let same = true; for (let i = 0; i < N; i++) if (F5.fth[i] !== F4.fth[i]) { same = false; break; }
    check(same && F5.list.length === F4.list.length && F5.state[P.id] === n && F5.list[pf].tenets.join() === 'monks,pilgrim' && s5.playerCiv().religion === F4.list[n].name && F5.missionTo[P.id] === F4.missionTo[P.id], `saved and loaded: ${F4.list.length - 1} faiths, the map of them, the realms' and the missionaries`); }
  // a world saved before faiths had regions: every faith by its name, every realm's land of its faith
  { const saved = JSON.parse(JSON.stringify(sim.save())); delete saved.faiths; const s3 = createSim(wd, 1); s3.load(saved); const R3 = s3.faith; let all = true, n = 0;
    for (const k of s3.LI) { const o = s3.owner[k]; if (o >= 0 && s3.civs[o] && s3.civs[o].religion) { n++; if (R3.fth[k] !== R3.state[o] || R3.list[R3.state[o]].name !== s3.civs[o].religion) { all = false; break; } } }
    const byName = new Map(); let one = true; for (const x of s3.civs) { if (!x || !x.religion) continue; const f0 = R3.state[x.id]; if (byName.has(x.religion) && byName.get(x.religion) !== f0) one = false; byName.set(x.religion, f0); }
    check(all && n > 0 && one, `a world saved before faiths had regions: every realm's land of its faith, one faith by one name (${byName.size} names)`); }
  invariants(sim, 'the world of faiths in ' + sim.fmtYear(sim.year));
}
// the faiths of a whole world: once priests are known, many faiths of fewer families; quick enough
{
  const sim = createSim(wd, 12345); const F = sim.faith; for (let y = 0; y < 3000; y++) sim.tick();
  const bronze = sim.ERAS[1][1] + 0.02; for (const cv of sim.civs) if (cv) { cv.tech = Math.max(cv.tech, bronze); cv.era = sim.eraOf(cv.tech); teach(sim, cv, 1); }
  for (let y = 0; y < 600; y++) sim.tick();
  let ms = 0; for (let y = 0; y < 100; y++) { sim.tick(); ms += F.stats.ms; }
  const alive = F.list.filter(f => f && f.n > 0), fams = new Set(alive.map(f => f.fam)); let bad = 0, kept = 0, held = 0; for (const cv of sim.civs) { if (!cv) continue; held++; if (F.state[cv.id]) kept++; if (!(F.otherShare[cv.id] >= 0 && F.otherShare[cv.id] <= 1 && F.restless[cv.id] <= 0.02 && F.restless[cv.id] > -0.5)) bad++; }
  log(`   ${sim.fmtYear(sim.year)}: ${alive.length} faiths in ${fams.size} families, kept by ${kept} of ${held} realms; ${F.stats.founded} founded, ${F.stats.adopted} taken up, ${F.stats.split} churches broke away; a year of faiths takes ${(ms / 100).toFixed(3)} ms`);
  check(alive.length > 10 && kept > held * 0.3, `a world of faiths once priests are known (${alive.length} faiths, kept by ${kept} of ${held} realms)`);
  check(!bad, `every realm's share of other faiths and its unrest are within bounds (${bad} not)`);
  check(ms / 100 < 1.5, `faiths are quick enough (${(ms / 100).toFixed(3)} ms a year)`);
}
}
// ---------- 15. culture: great people, their works and what they bring, renown, golden ages, the player, saved ----------
if (want(15)) {
log('15. culture');
{
  const sim = createSim(wd, 71); const W2 = sim.W, K = sim.culture, CU = window.CULTURE; const ok = (i) => i >= 0 && i < N && sim.land[i] && !(sim.flags[i] & 8) && sim.fert[i] > 0.15;
  const i0 = sim.LI.find(i => sim.fert[i] > 0.5 && [-2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every(d => ok(i + d) && ok(i + d + W2) && ok(i + d - W2) && ok(i + d - 2 * W2) && ok(i + d + 2 * W2)));
  const classic = sim.ERAS[3][1] + 0.01;
  const A = sim.spawnTribe(i0, {}), B = sim.spawnTribe(i0 + 8, {});
  for (const x of [A, B]) { x.tech = classic; x.era = sim.eraOf(classic); x.aggression = 0; x.dip.think = 1e12; } teach(sim, A, 3); teach(sim, B, 0);      // (B knows no masonry: no great people come there)
  for (let d = 1; d <= 4; d++) for (const e of [-2 * W2, -W2, 0, W2, 2 * W2]) { const i = i0 + d + e; if (sim.owner[i] < 0) sim.claim(i, A, i0); sim.pop[i] = 30; }
  for (let d = 6; d <= 12; d++) for (const e of [-2 * W2, -W2, 0, W2, 2 * W2]) { const i = i0 + d + e; if (sim.owner[i] < 0) sim.claim(i, B, i0 + 8); sim.pop[i] = 30; }
  for (let y = 0; y < 3; y++) sim.tick();
  check(K.pace(A.id) > 0 && K.pace(B.id) === 0, `a realm that knows masonry works towards great people (${K.pace(A.id).toFixed(5)} a year), one that does not brings none forth`);
  // a great person: of a kind the realm knows, born in one of its towns, named; he makes up to three works in the city
  const gp = K.bear(A.id); const kinds = new Set(); for (let k = 0; k < 40; k++) { const g = K.bear(A.id); if (g) kinds.add(K.KINDS[g.kind].key); }
  check(!!gp && gp.c === A.id && sim.owner[gp.at] === A.id && gp.name.length > 2 && K.alive.includes(gp), `a great person is born in a town of the realm: ${gp && gp.name}, ${gp && K.kindName(gp)}`);
  check([...kinds].every(k => ['artist', 'builder', 'poet', 'sage', 'playwright', 'historian'].includes(k)) && kinds.size >= 3, `the kinds stand on what the realm knows (${[...kinds].join(', ')})`);
  const w0 = K.make(gp); check(!!w0 && w0.at === gp.at && w0.value > 0 && gp.made === 1 && K.workOf(w0.id) === w0, `he makes a work in his city: ${w0 && w0.name} (${w0 && w0.value})`);
  // what works bring: a sage's insight, the arts' authority, a master builder cheaper works while he lives
  { const g = K.bear(A.id); g.kind = CU.KK.sage.id; const t0 = A.tech; K.make(g); check(A.tech > t0, `a sage's work brings insight (${((A.tech - t0) * 1e5).toFixed(0)})`);
    const R = sim.rule.ruleOf(A); R.auth = 10; const p2 = K.bear(A.id); p2.kind = CU.KK.poet.id; K.make(p2); check(R.auth > 10, `a poet's brings authority (+${(R.auth - 10).toFixed(1)})`);
    for (const x of K.alive) if (x.c === A.id && x.kind === CU.KK.builder.id) x.kind = CU.KK.poet.id; K.tally(sim.year); const f0 = K.buildF(A.id); const b = K.bear(A.id); b.kind = CU.KK.builder.id; K.tally(sim.year);
    check(f0 === 1 && K.buildF(A.id) < 1, `a master builder living makes the realm's works cheaper (${K.buildF(A.id)})`); }
  // renown: what the realm holds; whoever holds the city holds the work
  K.tally(sim.year); const r0 = K.renown[A.id]; check(r0 > 0 && K.heldBy(A.id).length > 0, `a realm's renown is what it holds (${r0.toFixed(1)} from ${K.heldBy(A.id).length} works)`);
  { const at = w0.at; sim.claim(at, B, i0 + 8); K.tally(sim.year); check(w0.held === B.id && K.renown[B.id] >= w0.value - 1e-6 && K.renown[A.id] < r0, `the conqueror of a city holds its works: ${sim.fullName(B)} now has ${w0.name}`);
    sim.claim(at, A, i0); K.tally(sim.year); }
  // a sacked city may lose its works for ever
  { const g = K.bear(A.id); for (let k = 0; k < 12; k++) { const w = K.make(g); if (w) { w.at = A.capital; } g.made = 0; } const n0 = K.stats.lost; for (let k = 0; k < 6; k++) K.sacked(A.capital, B);
    check(K.stats.lost > n0 && K.works.some(w => w.lost && w.at === A.capital), `a sacked city loses works for ever (${K.stats.lost - n0})`); }
  // a lesser work is forgotten after some turns; a masterpiece never is
  { const old = K.make(K.bear(A.id)), great = K.make(K.bear(A.id)); old.value = 3; great.value = 9; old.year -= 5000; great.year -= 5000; K.tally(sim.year);
    check(!K.workOf(old.id) && !!K.workOf(great.id), 'a lesser work is forgotten, a masterpiece is not'); }
  // pride, against the usual for the age; the pull of a renowned realm on others' peoples
  { for (let k = 0; k < 30; k++) { const w = K.make(K.bear(A.id)); if (w) w.value = 9; } K.tally(sim.year); const gold = K.isGolden(A.id) ? 0.02 : 0;
    const hi = K.unrest(A) - gold, lo = K.unrest(B); check(K.rel(A.id) > 2 && hi > 0 && hi <= 0.0301 && lo <= 0, `pride: renown above the usual steadies a realm (${(hi * 100).toFixed(1)}, ${K.rel(A.id).toFixed(1)} times the usual), little renown does not (${(lo * 100).toFixed(1)})`);
    const sp = sim.stabilityParts(A); check(Math.abs(sp.culture - K.unrest(A)) < 1e-9, 'the realm\'s stability counts it');
    check(K.pull(A.id) > 1 && K.pull(B.id) <= 1, `a renowned realm takes in other peoples faster (${K.pull(A.id).toFixed(2)} against ${K.pull(B.id).toFixed(2)})`); }
  // diplomacy: a realm of little renown admires one of great renown
  { const out = []; sim.diplo.opinion(B, A, out); check(out.some(r => /admire/.test(r[0])), 'a realm of little renown admires one of great renown: ' + out.map(r => r[0] + ' ' + r[1]).join(', ')); }
  // a golden age: four great people within two turns, in a steady realm; great people come almost twice as often; unrest ends it
  { const s2 = createSim(wd, 73), K2 = s2.culture; const j0 = s2.LI.find(i => ok(i) && s2.owner[i] < 0 && s2.fert[i] > 0.5 && [1, 2, 3].every(d => ok(i + d) && s2.owner[i + d] < 0)); const G = s2.spawnTribe(j0, {}); G.tech = classic; G.era = s2.eraOf(classic); teach(s2, G, 3); G.aggression = 0; G.dip.think = 1e12;
    for (let d = 1; d <= 3; d++) { if (s2.owner[j0 + d] < 0) s2.claim(j0 + d, G, j0); s2.pop[j0 + d] = 30; } for (let y = 0; y < 3; y++) s2.tick();
    G.stability = 0.9; for (let k = 0; k < 3; k++) K2.bear(G.id); K2.tally(s2.year); const before = K2.isGolden(G.id), p0 = K2.pace(G.id); K2.bear(G.id); K2.tally(s2.year);
    check(!before && K2.isGolden(G.id) && Math.abs(K2.pace(G.id) / p0 - CU.GOLD.boost) < 1e-6 && K2.unrest(G) >= 0.02 - 0.03, `four great people within two turns begin a golden age (until ${s2.fmtYear(K2.golden[G.id])}): great people come ${CU.GOLD.boost} times as often`);
    G.stability = 0.2; K2.tally(s2.year); check(!K2.isGolden(G.id) && K2.news.some(n => n.kind === 'goldenEnd'), 'unrest ends it');
    G.stability = 0.9; for (let k = 0; k < 6; k++) K2.bear(G.id); K2.tally(s2.year); check(!K2.isGolden(G.id), 'and none begins again for some turns after'); }
  // the player: patronage, what it costs, commissions; saved and loaded
  { const s4 = createSim(wd, 79), K4 = s4.culture; const k0 = s4.LI.find(i => ok(i) && s4.owner[i] < 0 && s4.fert[i] > 0.5 && [1, 2, 3, 4].every(d => ok(i + d) && s4.owner[i + d] < 0));
    s4.setPlayer(k0, 'Testland'); const P = s4.playerCiv(); P.tech = classic; P.era = s4.eraOf(classic); teach(s4, P, 3); for (let d = 1; d <= 4; d++) { if (s4.owner[k0 + d] < 0) s4.claim(k0 + d, P, k0); s4.pop[k0 + d] = 30; } for (let y = 0; y < 3; y++) s4.tick();
    const base = K4.pace(P.id); K4.setPatron(P.id, 3); const lav = K4.pace(P.id); K4.setPatron(P.id, 0); const none = K4.pace(P.id);
    check(base > 0 && Math.abs(lav / base - 2.4) < 1e-6 && Math.abs(none / base - 0.6) < 1e-6, `patronage: lavish more than twice as often (${(lav / base).toFixed(2)}), none less often (${(none / base).toFixed(2)})`);
    K4.setPatron(P.id, 3); P.income = 100; P.wealth = 1000; const g0 = K4.greats.length; K4.step(); check(Math.abs(P.wealth - (1000 - 20)) < 1e-6, `and a lavish court pays a fifth of the income for it (${(1000 - P.wealth).toFixed(1)})`); void g0;
    const g = K4.bear(P.id); P.wealth = 5000; const n0 = K4.works.length; const why = K4.commission(P.id, g.id); const again = K4.commission(P.id, g.id);
    check(!why && K4.works.length === n0 + 1 && P.wealth === 5000 - K4.commissionCost(P) && !!again, `a commission: a work at once for ${K4.commissionCost(P)} coin (${why || K4.works[K4.works.length - 1].name}); asked again at once: "${again}"`);
    g.made = 3; g.asked = 0; check(!!K4.commission(P.id, g.id), 'and nothing from a master who has made all there is in him');
    for (let k = 0; k < 5; k++) { const x = K4.bear(P.id); if (x) K4.make(x); } K4.tally(s4.year);
    const saved = JSON.parse(JSON.stringify(s4.save())); const s5 = createSim(wd, 1); s5.load(saved); const K5 = s5.culture;
    const same = K5.greats.length === K4.greats.length && K5.works.length === K4.works.length && K5.alive.length === K4.alive.length && Math.abs(K5.renown[P.id] - K4.renown[P.id]) < 1e-3 && Math.abs(K5.prog[P.id] - K4.prog[P.id]) < 1e-3 && Math.abs(K5.had[P.id] - K4.had[P.id]) < 1e-2 && K5.born[P.id] === K4.born[P.id] && s5.playerCiv().patron === 3
      && K5.greats.every((x, k) => x.name === K4.greats[k].name && x.works.length === K4.greats[k].works.filter(id => K4.workOf(id)).length);
    if (!same) console.log('   culture save:', K5.greats.length, K4.greats.length, K5.works.length, K4.works.length, K5.alive.length, K4.alive.length, K5.renown[P.id], K4.renown[P.id], K5.prog[P.id], K4.prog[P.id], K5.had[P.id], K4.had[P.id], K5.born[P.id], K4.born[P.id], s5.playerCiv().patron, K5.greats.map((x, k) => x.works.length + '/' + K4.greats[k].works.filter(id => K4.workOf(id)).length).join(' '));
    check(same, `saved and loaded: ${K4.greats.length} great people, ${K4.works.length} works, renown ${K4.renown[P.id].toFixed(1)}, patronage`);
    const old = JSON.parse(JSON.stringify(s4.save())); delete old.culture; const s6 = createSim(wd, 1); s6.load(old); check(s6.culture.greats.length === 0 && s6.culture.renown[P.id] >= 0, 'a world saved before culture has had no great people yet'); }
  // a realm that is no more: its great people work no longer; its number given to a new realm brings none of it
  { const small = sim.spawnTribe(sim.LI.find(i => ok(i) && sim.owner[i] < 0 && sim.cellDist(i, i0) > 40), {}); small.tech = classic; small.era = sim.eraOf(classic); teach(sim, small, 3); small.aggression = 0; small.dip.think = 1e12;
    const g = K.bear(small.id); const id = small.id; K.gone(id); check(g.c === -1 && g.dies <= sim.year && K.born[id] === 0 && K.livingOf(id).length === 0, 'a realm that is no more: its great people work no longer, and its number keeps nothing'); }
  invariants(sim, 'the world of culture in ' + sim.fmtYear(sim.year));
}
// the culture of a whole world: great people from the Bronze Age, golden ages, works kept within bounds; quick enough
{
  const sim = createSim(wd, 12345); const K = sim.culture; for (let y = 0; y < 3000; y++) sim.tick();
  const classic = sim.ERAS[3][1] + 0.02; for (const cv of sim.civs) if (cv) { cv.tech = Math.max(cv.tech, classic); cv.era = sim.eraOf(cv.tech); teach(sim, cv, 3); }
  for (let y = 0; y < 400; y++) sim.tick();
  let ms = 0; for (let y = 0; y < 100; y++) { sim.tick(); ms += K.stats.ms; }
  let bad = 0, renowned = 0, held = 0; for (const cv of sim.civs) { if (!cv) continue; held++; const u = K.unrest(cv), r = K.renown[cv.id]; if (!(isFinite(r) && r >= 0 && u >= -0.031 && u <= 0.051 && K.pull(cv.id) >= 0.8 && K.pull(cv.id) <= 1.4)) bad++; if (K.rel(cv.id) > 2) renowned++; }
  log(`   ${sim.fmtYear(sim.year)}: ${K.stats.born} great people born, ${K.alive.length} living; ${K.stats.works} works made, ${K.works.length} kept (${K.stats.forgot} forgotten, ${K.stats.lost} lost); ${K.stats.golden} golden ages; ${renowned} of ${held} realms renowned; a year of culture takes ${(ms / 100).toFixed(3)} ms; saved ${(JSON.stringify(K.save()).length / 1024).toFixed(0)} KB`);
  check(K.stats.born > 100 && K.works.length > 50 && K.alive.length > 10, `a world of great people and works (${K.stats.born} born, ${K.works.length} works kept)`);
  check(K.works.length <= 6000 && K.greats.length <= 5000 && K.works.every(w => w.value >= CU_MASTER() || (!w.lost && sim.year - w.year <= Math.max(30, 6 * window.CULTURE.TURN[w.era]) + 5)), `works and great people are kept within bounds: masterpieces and the works of the last six turns (${K.works.length}, ${K.greats.length})`);
  check(!bad, `every realm's renown, pride and pull are within bounds (${bad} not)`);
  check(ms / 100 < 0.5, `culture is quick enough (${(ms / 100).toFixed(3)} ms a year)`);
  function CU_MASTER() { return window.CULTURE.MASTER; }
}
}
// ---------- 16. finance: credit and its lenders, interest, defaults, the coin, banking houses, companies, panics, the player, saved ----------
if (want(16)) {
log('16. finance');
{
  const sim = createSim(wd, 83); const W2 = sim.W, F = sim.finance; const ok = (i) => i >= 0 && i < N && sim.land[i] && !(sim.flags[i] & 8) && sim.fert[i] > 0.15;
  const i0 = sim.LI.find(i => sim.fert[i] > 0.5 && [-2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every(d => ok(i + d) && ok(i + d + W2) && ok(i + d - W2)));
  const med = sim.ERAS[4][1] + 0.01;
  const A = sim.spawnTribe(i0, {}), B = sim.spawnTribe(i0 + 8, {});
  for (const x of [A, B]) { x.tech = med; x.era = sim.eraOf(med); x.aggression = 0; x.dip.think = 1e12; }
  for (let d = 1; d <= 4; d++) for (const e of [-W2, 0, W2]) { const i = i0 + d + e; if (sim.owner[i] < 0) sim.claim(i, A, i0); sim.pop[i] = 30; }
  for (let d = 6; d <= 12; d++) for (const e of [-W2, 0, W2]) { const i = i0 + d + e; if (sim.owner[i] < 0) sim.claim(i, B, i0 + 8); sim.pop[i] = 30; }
  for (let y = 0; y < 3; y++) sim.tick();
  check(!F.canBorrow(A.id) && F.room(A.id) === 0, 'nobody lends before there are tribute lists');
  teach(sim, A, 4); teach(sim, B, 4); sim.touchAll(); for (let y = 0; y < 12; y++) sim.tick();      // (a few years, for them to know one another as neighbours)
  check(F.canBorrow(A.id) && F.room(A.id) > 0 && F.coin(A.id).length >= 3, `a realm of the tribute lists and coinage can borrow (up to ${F.room(A.id).toFixed(0)}) and strikes a coin: the ${F.coin(A.id)}`);
  // a banking house in B lends to A, its neighbour; interest is paid every year and the house and its realm gain by it
  const H = F.found(B.id, B.capital, { cap: 2000 }); const r0 = F.rate(A.id);
  const w0 = A.wealth, got = F.borrow(A.id, Math.min(1500, F.room(A.id) * 0.8)); const by = F.owesOf(A.id);
  check(got > 0 && F.debt[A.id] === got && Math.abs(A.wealth - w0 - got) < 1e-6 && by.some(o => o.house && o.house.id === H.id), `a realm borrows ${got.toFixed(0)} at ${(100 * r0).toFixed(1)}%: from ${by.map(o => o.house ? o.house.name : 'its own lenders').join(', ')}`);
  { A.aggression = 0; const capB = H.cap, wA = A.wealth, wB = B.wealth; F.step(); check(F.paid[A.id] > 0 && H.cap > capB * 0.9 && F.got[B.id] > 0, `interest is paid (${F.paid[A.id].toFixed(1)} a year): the house keeps half, its realm a share (${F.got[B.id].toFixed(1)})`); void wA; void wB; }
  { const lent0 = H.lent; A.wealth += 5000; const half = F.debt[A.id] / 2, d0 = F.debt[A.id]; const back = F.repay(A.id, half); check(Math.abs(back - half) < 1e-6 && Math.abs(F.debt[A.id] - (d0 - half)) < 1e-6 && H.lent <= lent0, 'and repays what it can'); }
  // a default: the debts wiped, the house's money lost, the realm's standing gone, its lender remembering
  { const cap0 = H.cap, mem0 = sim.diplo.memOf(B, A.id); F.defaultOn(A.id, 'a test'); check(F.debt[A.id] === 0 && !F.owes[A.id] && H.cap < cap0 && F.stand[A.id] < 0.2 && sim.diplo.memOf(B, A.id) < mem0 && F.panic[A.id] > 0, `a default: debts wiped, the house loses (${cap0.toFixed(0)} -> ${H.cap.toFixed(0)}), standing gone, the lender remembers (${mem0} -> ${sim.diplo.memOf(B, A.id)})`);
    check(F.rate(A.id) > r0 * 1.5 && F.room(A.id) < 1000 * 0.5, `and lenders ask more of it, and lend it less (${(100 * F.rate(A.id)).toFixed(1)}%, room ${F.room(A.id).toFixed(0)})`);
    const sp = sim.stabilityParts(A); check(sp.finance < 0, `a default unsettles the realm (${(sp.finance * 100).toFixed(1)})`); }
  // the coin: debased for a windfall; then dearer prices, taxes worth less, unrest; restored for coin
  { const w = A.wealth, g = F.debase(A.id); check(g > 0 && Math.abs(A.wealth - w - g) < 1e-6 && F.fine[A.id] < 1 && F.dear[A.id] > 0 && F.taxF(A.id) < 1 && F.unrest(A) < 0, `a debasement: ${g.toFixed(0)} coin now, the coin at ${(100 * F.fine[A.id]).toFixed(0)}%, prices ${(100 * F.dear[A.id]).toFixed(0)}% ahead, taxes worth ${(100 * F.taxF(A.id)).toFixed(0)}%`);
    A.wealth += 1e6; const why = F.restore(A.id); check(!why && F.fine[A.id] === 1, 'and the coin restored'); }
  // a house that has lost more than it has fails: its borrowers find other lenders, and a panic runs through its markets
  { const C = sim.spawnTribe(sim.LI.find(i => ok(i) && sim.owner[i] < 0 && sim.cellDist(i, i0) > 30), {}); C.tech = med; C.era = sim.eraOf(med); teach(sim, C, 4); C.aggression = 0; C.dip.think = 1e12;
    const H2 = F.found(B.id, B.capital, { cap: 500 }); F.owes[C.id] = [[H2.id, 300]]; F.debt[C.id] = 300; H2.lent = 300; H2.cap = -200; F.step();
    check(H2.fail && F.owesOf(C.id).every(o => !o.house) && F.debt[C.id] === 300 && F.panic[B.id] > 0.2, `a house that lost more than it had fails (${H2.name}); what it lent is owed to others now, and its realm panics`); }
  // panics pass
  { const p0 = F.panic[B.id]; for (let y = 0; y < 8; y++) F.step(); check(F.panic[B.id] < p0 * 0.3, `a panic passes in a few years (${p0.toFixed(2)} -> ${F.panic[B.id].toFixed(2)})`); }
  // a company: it pays its holders; a mania runs its shares up, and the bubble bursts
  { teach(sim, B, 5); sim.ports[B.id] = Math.max(1, sim.ports[B.id]); const co = F.charter(B.id, { at: B.capital, cap: 1000 }); F.step(); check(!!co && co.ret > 0 && F.got[B.id] > 0, `a company is chartered (${co.name}) and pays its realm (${F.got[B.id].toFixed(1)})`);
    co.heat = 0.99; const v0 = co.val; F.step(); check(co.crash === sim.year && co.heat === 0 && F.panic[B.id] > 0.2, `a mania ends in a crash (${v0.toFixed(2)} -> ${co.val.toFixed(2)}), and a panic`); }
  // the player: borrow, repay, debase, restore, a house, a company, shares bought and sold, a default; saved and loaded
  { const s4 = createSim(wd, 89), F4 = s4.finance; const k0 = s4.LI.find(i => ok(i) && s4.owner[i] < 0 && s4.fert[i] > 0.5 && [1, 2, 3, 4].every(d => ok(i + d) && s4.owner[i + d] < 0) && (s4.flags[i] & 4));
    s4.setPlayer(k0, 'Testland'); const P = s4.playerCiv(); s4.special[k0] |= 1; /* (a harbour at its seat) */ const ren = s4.ERAS[5][1] + 0.01; P.tech = ren; P.era = s4.eraOf(ren); teach(s4, P, 5); for (let d = 1; d <= 4; d++) { if (s4.owner[k0 + d] < 0) s4.claim(k0 + d, P, k0); s4.pop[k0 + d] = 30; } for (let y = 0; y < 3; y++) s4.tick();
    P.wealth = 100; const room = F4.room(P.id); const why1 = s4.financeAct('borrow', Math.floor(room / 2)); check(!why1 && F4.debt[P.id] > 0 && P.wealth > 100, `the player borrows ${F4.debt[P.id].toFixed(0)} of ${room.toFixed(0)} (${why1 || 'done'})`);
    const why2 = s4.financeAct('repay', 50); check(!why2 && P.events.slice(-3).some(e => /repays/.test(e.text)), 'repays, and the chronicle says so');
    P.wealth = 1e5; check(!s4.financeAct('house') && F4.housesOf(P.id).length === 1, 'charters a banking house'); check(!s4.financeAct('company') && F4.companiesOf(P.id).length === 1, 'charters a company in a harbour');
    const co = F4.companiesOf(P.id)[0]; const B4 = s4.spawnTribe(s4.LI.find(i => ok(i) && s4.owner[i] < 0 && s4.cellDist(i, k0) > 30), {}); const o = F4.charter(B4.id, { at: B4.capital, cap: 800 }); void co;
    const wb = P.wealth; check(!s4.financeAct('buy', o.id, 500) && P.wealth === wb - 500 && F4.sharesOf(o, P.id) > 0, 'buys shares of another realm\'s company'); check(!s4.financeAct('sell', o.id, 1) && !F4.sharesOf(o, P.id), 'and sells them');
    check(!s4.financeAct('debase') && F4.fine[P.id] < 1, 'debases the coin'); 
    const saved = JSON.parse(JSON.stringify(s4.save())); const s5 = createSim(wd, 1); s5.load(saved); const F5 = s5.finance;
    check(Math.abs(F5.debt[P.id] - F4.debt[P.id]) < 1e-2 && Math.abs(F5.fine[P.id] - F4.fine[P.id]) < 1e-3 && F5.houses.length === F4.houses.length && F5.companies.length === F4.companies.length && F5.coin(P.id) === F4.coin(P.id) && JSON.stringify(F5.owesOf(P.id).map(x => Math.round(x.amt))) === JSON.stringify(F4.owesOf(P.id).map(x => Math.round(x.amt))), `saved and loaded: debts ${F4.debt[P.id].toFixed(0)}, the coin, ${F4.houses.length} houses, ${F4.companies.length} companies`);
    const why3 = s4.financeAct('default'); check(!why3 && F4.debt[P.id] === 0 && F4.lastDef[P.id] === s4.year, 'and repudiates the rest');
    const old = JSON.parse(JSON.stringify(s4.save())); delete old.finance; const s6 = createSim(wd, 1); s6.load(old); check(s6.finance.debt[P.id] === 0 && s6.finance.houses.length === 0, 'a world saved before finance owes nothing and has no houses'); }
  invariants(sim, 'the world of money in ' + sim.fmtYear(sim.year));
}
// the money of a whole world: debtors, houses and companies once they are known; within bounds; quick enough
{
  const sim = createSim(wd, 12345); const F = sim.finance; for (let y = 0; y < 3000; y++) sim.tick();
  const ren = sim.ERAS[5][1] + 0.02; for (const cv of sim.civs) if (cv) { cv.tech = Math.max(cv.tech, ren); cv.era = sim.eraOf(cv.tech); teach(sim, cv, 5); }
  for (let y = 0; y < 300; y++) sim.tick();
  let ms = 0; for (let y = 0; y < 100; y++) { sim.tick(); ms += F.stats.ms; }
  let bad = 0, owing = 0, n = 0; for (const cv of sim.civs) { if (!cv) continue; n++; const c = cv.id; if (F.debt[c] > 0) owing++; if (!(F.debt[c] >= 0 && isFinite(F.debt[c]) && F.fine[c] >= 0.25 && F.fine[c] <= 1 && F.panic[c] >= 0 && F.panic[c] <= 1 && F.stand[c] >= 0 && F.stand[c] <= 1 && isFinite(cv.wealth))) bad++; }
  const hs = F.houses.filter(x => !x.fail).length, cos = F.companies.filter(y => !y.gone).length;
  log(`   ${sim.fmtYear(sim.year)}: ${owing} of ${n} realms owe; ${hs} houses (${F.stats.failed} failed), ${cos} companies (${F.stats.crashes} crashed); ${F.stats.defaults} defaults, ${F.stats.debased} debasements, ${F.stats.panics} panics; a year of finance takes ${(ms / 100).toFixed(3)} ms; saved ${(JSON.stringify(F.save()).length / 1024).toFixed(0)} KB`);
  check(hs > 3 && cos > 0 && owing > 0, `a world of money once banking and companies are known (${hs} houses, ${cos} companies, ${owing} realms owing)`);
  check(!bad, `every realm's debts, coin, panic and standing are within bounds (${bad} not)`);
  check(ms / 100 < 0.5, `finance is quick enough (${(ms / 100).toFixed(3)} ms a year)`);
}
}
log(`\n${checks} checks, ${fails.length} failures`);

if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
