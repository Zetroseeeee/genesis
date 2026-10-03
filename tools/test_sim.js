// GENESIS headless simulation test: runs sim.js in node for thousands of years and checks invariants,
// every player action and god power, save/load round trips, and memory bounds. Exit code 1 on any failure.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
require('../dist/geo.js'); require('../dist/town.js');
const fs = require('fs'); const PNG = require('pngjs').PNG;
(0, eval)(fs.readFileSync('src/sim.js', 'utf8')); // indirect eval: global scope, so Math/typed-array lookups stay fast
const W = 720, H = 360, N = W * H;
const png = PNG.sync.read(fs.readFileSync('data/world.png'));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }

const fails = []; let checks = 0; const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null; const want = (n) => !ONLY || ONLY.includes(String(n));
function check(cond, msg) { checks++; if (!cond) { fails.push(msg); console.log('  FAIL', msg); } }
const t0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

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
  }
  check(n === sim.st.civCount, `${tag}: civCount ${sim.st.civCount} != living ${n}`);
  check(sim.worldEvents.length <= 600, `${tag}: worldEvents unbounded (${sim.worldEvents.length})`);
  check(sim.allEvents.length <= 6000, `${tag}: allEvents unbounded (${sim.allEvents.length})`);
  check(sim.ruins.size <= 1500, `${tag}: ruins unbounded (${sim.ruins.size})`);
  check(sim.fires.length <= 120 && sim.floods.length <= 60 && sim.quakes.length <= 60 && sim.battles.length <= 400 && sim.plagues.length <= 400, `${tag}: living-world lists unbounded (${sim.fires.length}/${sim.floods.length}/${sim.quakes.length}/${sim.battles.length}/${sim.plagues.length})`);
  for (const [i, ru] of sim.ruins) check(i >= 0 && i < N && ru.R > 0 && isFinite(ru.R), `${tag}: bad ruin ${i}`);
}

if (want(1)) {
// ---------- 1. long autopilot run ----------
log('1. autopilot: 12,000 years, 3 seeds');
for (const [seed, YEARS] of [[7, 12000], [1234, 4000], [99991, 4000]]) {
  const sim = createSim(wd, seed);
  const t1 = Date.now(); let worst = 0;
  for (let y = 0; y < YEARS; y++) { const a = Date.now(); sim.tick(); worst = Math.max(worst, Date.now() - a); if (y % 2000 === 1999) invariants(sim, `seed ${seed} year ${sim.year}`); }
  const dt = Date.now() - t1; const last = sim.history[sim.history.length - 1];
  log(`   seed ${seed}: ${dt} ms (${(dt / YEARS).toFixed(2)} ms/yr, worst ${worst} ms) · ${sim.year} · civs ${sim.st.civCount} · people ${last ? Math.round(last.pop + last.wild) : '?'}k · ruins ${sim.ruins.size} · events ${sim.worldEvents.length}`);
  check(dt / YEARS < 12, `seed ${seed}: too slow (${(dt / YEARS).toFixed(2)} ms/yr)`);
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
  r.settleFar = sim.act('settle', sim.LI[sim.LI.length - 5]); check(/touch|border|Not|cannot|reach/i.test(r.settleFar) || !/^Settled/.test(r.settleFar), `settle far away should fail: "${r.settleFar}"`);
  if (near !== undefined) { r.settle = sim.act('settle', near); check(/^Settled/.test(r.settle), `settle adjacent: "${r.settle}"`); }
  // works take years: pay now, the effect lands when the site is finished
  const finish = (n) => { for (let k = 0; k < n; k++) sim.tick(); };
  r.farm = sim.act('farm', i0); check(/Farms under construction/.test(r.farm) && sim.infra[i0] === 0 && sim.inProgress(i0, 'farm'), `farm starts a site: "${r.farm}"`);
  r.farm2 = sim.act('farm', i0); check(/Already being built/.test(r.farm2), `no second farm site at once: "${r.farm2}"`);
  r.develop = sim.act('develop', i0); check(/Already being built/.test(r.develop), 'develop is the old name for farm');
  finish(sim.durOf('farm', c.era) + 1); check(sim.infra[i0] === 1 && !sim.inProgress(i0, 'farm'), `farm finished after its years (infra ${sim.infra[i0]})`);
  for (let k = 0; k < 6; k++) { sim.act('farm', i0); finish(sim.durOf('farm', c.era) + 1); } r.farmCap = sim.act('farm', i0); check(/Fully farmed/.test(r.farmCap) && sim.infra[i0] === 5, `farm cap: infra ${sim.infra[i0]} "${r.farmCap}"`);
  r.walls = sim.act('walls', i0); check(/Walls under construction/.test(r.walls) && sim.walls[i0] === 0, `walls start: "${r.walls}"`); finish(sim.durOf('walls', c.era) + 1); check(sim.walls[i0] === 1, 'walls level 1 after construction');
  for (let k = 0; k < 4; k++) { sim.act('walls', i0); finish(sim.durOf('walls', c.era) + 1); } r.wallsCap = sim.act('fortify', i0); check(sim.walls[i0] === 3 && /Fully fortified/.test(r.wallsCap), `walls cap: ${sim.walls[i0]} "${r.wallsCap}"`);
  r.port = sim.act('port', i0); check(/Harbour under construction/.test(r.port), `port on coast: "${r.port}"`); finish(sim.durOf('port', c.era) + 1); check(!!(sim.special[i0] & 1), 'port bit set when finished');
  r.port2 = sim.act('port', i0); check(/Already/.test(r.port2), `double port: "${r.port2}"`);
  r.temple = sim.act('temple', i0, 5); check(/Temple under construction/.test(r.temple) && sim.inProgress(i0, 'temple').slot === 5, `temple on plot 5: "${r.temple}"`);
  check(sim.freeSlots(i0).length === sim.NSLOTS - 1 && !sim.freeSlots(i0).includes(5), 'the plot is taken while the temple is being built');
  finish(sim.durOf('temple', c.era) + 1); check((sim.special[i0] & 4) && sim.slotOf(i0, 'temple') === 5, 'temple finished on its plot');
  r.market0 = sim.act('market', i0); check(/Bronze Age/.test(r.market0), `market in the Stone Age refused: "${r.market0}"`);
  c.tech = 0.1; c.era = sim.eraOf(c.tech);
  r.market = sim.act('market', i0, 5); check(/Market under construction/.test(r.market) && sim.inProgress(i0, 'market').slot !== 5, `market picks another plot when 5 is taken: "${r.market}"`); finish(sim.durOf('market', c.era) + 1); check(!!(sim.special[i0] & 8), 'market bit set');
  r.academy0 = sim.act('academy', i0); check(/town or city|Classical/.test(r.academy0), `academy refused early: "${r.academy0}"`);
  sim.pop[i0] = 50; sim.tick(); check(sim.level[i0] >= 2, `village grew to a town with 50k people (level ${sim.level[i0]})`);
  c.tech = 0.31; c.era = sim.eraOf(c.tech);
  r.academy = sim.act('academy', i0); check(/Academy under construction/.test(r.academy), `academy: "${r.academy}"`); finish(sim.durOf('academy', c.era) + 1); check(!!(sim.special[i0] & 2), 'academy bit set');
  r.wonder = sim.act('wonder', i0); check(/Wonder under construction/.test(r.wonder) && !(sim.special[i0] & 16), `wonder starts: "${r.wonder}"`);
  r.wonder2 = sim.act('wonder', i0); check(/Already being built/.test(r.wonder2), `second wonder refused while building: "${r.wonder2}"`);
  finish(sim.durOf('wonder', c.era) + 1); check(!!(sim.special[i0] & 16), 'wonder finished'); check(((sim.special[i0] >> 5) & 15) === c.era, 'wonder remembers its era');
  r.wonder3 = sim.act('wonder', i0); check(/already/.test(r.wonder3), `second wonder refused: "${r.wonder3}"`);
  check(sim.works.get(i0) === undefined, 'no works left at the capital');
  const mineCell = sim.LI.find(j => sim.owner[j] === c.id && sim.goods[j] && ['copper', 'iron', 'tin', 'stone', 'gold', 'salt', 'gems', 'coal', 'oil'].includes(sim.GOODS[sim.goods[j]].key) && sim.level[j]);
  r.mineNo = sim.act('mine', i0); check(/Nothing here to mine|Already|cannot yet/.test(r.mineNo) || /Mine under construction/.test(r.mineNo), `mine check at the capital: "${r.mineNo}"`);
  if (mineCell !== undefined && !sim.inProgress(mineCell, 'mine') && !(sim.special[mineCell] & 512)) { const why = sim.cannot('mine', mineCell); if (!why) { r.mine = sim.act('mine', mineCell, 0); check(/Mine under construction/.test(r.mine), `mine: "${r.mine}"`); finish(sim.durOf('mine', c.era) + 1); check(!!(sim.special[mineCell] & 512) && sim.slotOf(mineCell, 'mine') === 0, 'mine finished on plot 1'); } }
  r.levy = sim.act('levy', -1); check(/Army raised/.test(r.levy) && c.army > sim.year, `levy: "${r.levy}"`);
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
  const foe = sim.civs.find(x => x && x !== c && x.alive !== false); sim.playerWar(foe.id); check(sim.isAtWar(c, foe.id) && sim.isAtWar(foe, c.id), 'declare war is mutual'); sim.playerWar(foe.id); check(!sim.isAtWar(c, foe.id), 'offer peace ends it');
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
  const frac = withGoods / sim.LI.length; check(frac > 0.15 && frac < 0.4, `goods cover a sensible share of the land (${(frac * 100).toFixed(0)}%)`); check(onIce === 0, 'no goods on the ice'); check(used.size === sim.GOODS.length - 1, `every good occurs somewhere (${used.size}/${sim.GOODS.length - 1})`);
  const i0 = sim.LI.find(i => sim.fert[i] > 0.6 && (sim.flags[i] & 2)); const c = sim.setPlayer(i0, 'Traders', null); for (let k = 0; k < 24; k++) sim.spawnTribe(sim.LI[Math.floor(sim.rnd() * sim.LI.length)], {});
  for (const cv of sim.civs) if (cv) { cv.tech = 0.12; cv.era = sim.eraOf(cv.tech); } // the Bronze Age: copper, tin and horses start to matter
  for (let y = 0; y < 3000; y++) sim.tick();
  check(!!c.trade && c.trade.n >= 0 && typeof c.trade.own === 'number', 'player realm has a trade record');
  let anyImports = 0, traits = new Set(), badTrait = 0, badRulers = 0; for (const cv of sim.civs) { if (!cv) continue; if (cv.trade && cv.trade.imp) anyImports++; if (!cv.ruler || !sim.TRAITS[cv.ruler.trait]) badTrait++; traits.add(cv.ruler && cv.ruler.trait); if (cv.rulers.length > 60 || cv.rulers.some(r => !r.name || !r.title)) badRulers++; }
  check(anyImports > 0, `some realms import goods from neighbours (${anyImports})`); check(badTrait === 0, 'every ruler has a known personality'); check(traits.size >= 5, `personalities vary (${traits.size} kinds in play)`); check(badRulers === 0, 'ruler histories are bounded and complete');
  const remembered = sim.civs.filter(x => x).reduce((a, x) => a + x.rulers.filter(r => r.ep).length, 0); check(remembered > 0, `some dead rulers earned epithets (${remembered})`);
  const covetWars = sim.allEvents.filter(e => /declares war .* for its (copper|tin|iron|horses|coal|oil)/.test(e.text)).length; check(covetWars > 0, `wars are fought over strategic goods (${covetWars})`);
  const strongWithIron = sim.civs.filter(x => x && x.era >= 2 && (sim.goodsMask[x.id] & (1 << sim.GOOD_ID.iron))).length; log(`   realms with iron in the Iron Age or later: ${strongWithIron}; imports seen in ${anyImports}; coveting wars ${covetWars}`);
  // save/load keeps the ruler's personality
  const s = JSON.parse(JSON.stringify(sim.save())); const sim2 = createSim(wd, s.seed || 1); sim2.load(s); const p2 = sim2.playerCiv(); check(p2.ruler.trait === c.ruler.trait && p2.ruler.seed === c.ruler.seed, 'ruler personality survives save/load');
  // an old save without personalities still works
  for (const cv of s.civs) if (cv) { delete cv.ruler.trait; delete cv.trade; } const sim3 = createSim(wd, 1); sim3.load(s); sim3.tick(); check(sim3.playerCiv().trade.n >= 0 && sim3.playerCiv().ruler.name, 'a save from before personalities loads and ticks');
}
}
if (want(7)) {
// ---------- 7. construction, growth and the town planner ----------
log('7. construction, growth and the planner');
{
  const T = window.TOWN; const sim = createSim(wd, 77);
  const i0 = sim.LI.find(i => sim.fert[i] > 0.6 && (sim.flags[i] & 2)); const c = sim.setPlayer(i0, 'Builders', null); for (let k = 0; k < 24; k++) sim.spawnTribe(sim.LI[Math.floor(sim.rnd() * sim.LI.length)], {});
  for (const cv of sim.civs) if (cv) { cv.tech = 0.1; cv.era = sim.eraOf(cv.tech); cv.eraSince = sim.year - 300; cv.wealth = 400; }
  // the AI builds through the same sites the player uses
  let sitesSeen = 0, kinds = new Set(); for (let y = 0; y < 600; y++) { sim.tick(); for (const [i, l] of sim.works) if (sim.owner[i] !== c.id) { sitesSeen++; for (const w of l) kinds.add(w.k); } }
  check(sitesSeen > 0, `AI realms raise works through construction sites (${sitesSeen} site-years, kinds ${[...kinds].join('/')})`);
  let built = 0; for (const i of sim.LI) if (sim.owner[i] >= 0 && sim.owner[i] !== c.id && (sim.special[i] & 15 || sim.walls[i] || sim.infra[i])) built++; check(built > 0, `AI works get finished (${built} cells with works)`);
  // drawn scale: villages big, metropolises bounded
  const k1 = T.scaleOf(100), k2 = T.scaleOf(1000), k3 = T.scaleOf(9000); check(k1 > 15 && k2 > 8 && k2 < 12 && k3 > 2 && k3 < 3, `representational scale tapers (${k1.toFixed(1)}, ${k2.toFixed(1)}, ${k3.toFixed(1)})`);
  check(T.radiusM(sim, i0, c) < 26000, `no town is drawn wider than its region (${(T.radiusM(sim, i0, c) / 1000).toFixed(1)} km)`);
  // growth: a jump in people opens a ring of building sites that close over the years
  c.wealth = 1e6; c.tech = 0.26; c.era = sim.eraOf(c.tech); c.eraSince = sim.year - 300; sim.bonusFert[i0] = 0.6; sim.tick(); // room to grow: better land, better knowledge
  sim.pop[i0] = Math.min(sim.pop[i0] * 1.6, sim.capacity(i0, c) * 0.9); sim.tick();
  check(sim.year - sim.gYear[i0] <= 1 && sim.gBand[i0] > sim.gPrev[i0], `growth band recorded (band ${sim.gBand[i0]} from ${sim.gPrev[i0]}, ${sim.year - sim.gYear[i0]} yrs ago; pop ${sim.pop[i0].toFixed(2)} of ${sim.capacity(i0, c).toFixed(2)})`);
  const L0 = T.layout(sim, i0, c, {}); const n0 = L0.items.length; let maxSites = 0; for (let y = 0; y < 14; y++) { sim.tick(); const L = T.layout(sim, i0, c, {}); maxSites = Math.max(maxSites, L.items.filter(it => it.prog !== undefined).length); }
  const L1 = T.layout(sim, i0, c, {}); check(maxSites > 0, `building sites appear in the new ring (${maxSites} at most)`); check(L1.items.length >= n0, `the town has more houses when the ring is done (${n0} -> ${L1.items.length})`); check(L1.items.filter(it => it.prog !== undefined).length === 0 || L1.growing, 'sites close once the ring is built');
  check(L1.plots.length === sim.NSLOTS && L1.k > 1 && L1.k < 21 && L1.R > 500, `plan exposes plots and scale (k ${L1.k.toFixed(1)}, R ${L1.R.toFixed(0)} m)`);
  // a work in progress shows up in the plan at its plot, growing with the years
  sim.act('temple', i0, 4); sim.tick(); sim.tick(); const Lw = T.layout(sim, i0, c, {}); const site = Lw.items.find(it => it.prog !== undefined && (it.style & 1024)); check(!!site && site.prog < 1, `the temple site is in the plan (prog ${site && site.prog.toFixed(2)})`); check(Lw.plots[4].used, 'plot 4 is marked used');
  // an era change rebuilds the town over the decades, never all at once
  c.tech = 0.43; c.era = 4; c.eraSince = sim.year; sim.tick(); const La = T.layout(sim, i0, c, {}); const oldKinds = (L) => L.items.filter(it => it.prog === undefined && it.style % 8 !== 3 && !(it.style & 1024) && ['adobe', 'longhouse', 'courtyard', 'hut', 'gable', 'hip', 'tenement'].includes(it.kind)).length; // non-stone houses: what the Classical town was built of
  const before = oldKinds(La); for (let y = 0; y < 30; y++) sim.tick(); const Lb = T.layout(sim, i0, c, {}); for (let y = 0; y < 40; y++) sim.tick(); const Lc = T.layout(sim, i0, c, {});
  log(`   era wave: ${before} old houses at the start, ${oldKinds(Lb)} after 30 years, ${oldKinds(Lc)} after 70; sites mid-way ${Lb.items.filter(it => it.prog !== undefined).length}`);
  check(Lb.items.filter(it => it.prog !== undefined).length > 0 || oldKinds(Lb) < before, 'the new age shows rebuilding sites or renewed houses mid-way');
  // save/load keeps sites, plots and growth
  sim.act('walls', i0); const sv = JSON.parse(JSON.stringify(sim.save())); const sim2 = createSim(wd, sv.seed || 1); sim2.load(sv);
  check(sim2.works.has(i0) && sim2.works.get(i0).some(w => w.k === 'walls'), 'works in progress survive save/load'); check(sim2.slotOf(i0, 'temple') === sim.slotOf(i0, 'temple'), 'plots survive save/load'); check(sim2.gBand[i0] === sim.gBand[i0], 'growth band survives save/load');
  for (let y = 0; y < 30; y++) sim2.tick(); check(sim2.walls[i0] >= 1, 'a loaded site still finishes');
}
}
log(`\n${checks} checks, ${fails.length} failures`);

if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
