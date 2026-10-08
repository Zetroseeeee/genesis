// GENESIS armies and fleets: hosts that march across the map, meet in battle and lay siege, and the fleets that carry them
// over the sea. Pure data, no drawing (troops.js draws them, main.js gives the player's orders). Classic script; exposes
// window.ARMY.
//
// What decides land is still the simulation's border fights (sim.js, pass 2): the numbers the world was fitted to stay
// where they were. Armies are where a war is seen and where the player wages it:
//  - Every realm at war with a neighbour keeps a host on that front. It marches to where the fighting is (the newest fight
//    over the border between the two) and stays on its own side of it; where it stands, the enemy's attacks on its land
//    fail more often and its own succeed more often (focus(), read by the border fights). Two hostile hosts that meet give
//    battle: men are lost, the beaten one falls back, a broken one goes home and is raised again after some years.
//  - The player's levy is a host he leads: it marches where he sends it, by a road the realm may use (its own land, an
//    enemy's, unclaimed land, an ally's), takes the enemy's regions one by one as it comes to them, lays siege to walled
//    towns, and fights the hosts it meets. Where no road runs by land, his fleet carries it over the sea.
(function () {
  // what a host is called, by age
  const KIND = ['war band', 'host', 'host', 'army', 'army', 'army', 'army', 'army', 'force'];
  // the share of a realm's people a campaign puts under arms, by age (every hunter of a band; few of a kingdom's peasants;
  // the mass armies of the nineteenth and twentieth centuries; few and professional at the end)
  const MOB = [0.06, 0.03, 0.025, 0.02, 0.012, 0.015, 0.025, 0.02, 0.006];
  // regions a host marches in a year through land it may cross, and how many of the enemy's it can take in one
  const SPEED = [3, 4, 4, 5, 5, 6, 9, 14, 18], STORM = [1, 1, 1, 1, 1, 2, 2, 3, 3];
  // sea regions a fleet sails in a year, and the men a ship carries
  const SAIL = [5, 7, 9, 11, 13, 18, 26, 36, 44], CARRY = [20, 40, 60, 80, 100, 200, 600, 1500, 2000];
  const GARRISON = 0.04, GARRISON_WALLED = 0.08;      // the share of a region's people that holds it against an assault, or a siege
  const FOCUS_OWN = 2.0, FOCUS_FOE = 0.4, FOCUS_R = 2;      // where a host stands (within FOCUS_R regions): its realm's attacks succeed so much more often, the enemy's so much less
  const BROKEN = 0.2;      // a host with fewer men than this share of those it was raised with is broken, and goes home
  const REST = 12;         // years before a realm raises a host again on a front where it lost one
  const MAXPATH = 90000;   // regions looked at, at most, to find a road

  function create(h) {
    const { W, H, N, land, owner, level, walls, pop, flags, special, civs, nbOf, cellDist } = h;
    const list = [], fleets = []; let nextId = 1;
    const rest = new Map();      // civ * 4096 + foe -> the year a host may be raised there again
    const stats = { hosts: 0, battles: 0, sieges: 0, taken: 0, ms: 0 };
    const news = [];      // what has happened to the player's hosts and ships since main.js last looked: { year, text, cell, kind }
    let seq = 0; const say = (c, text, cell, kind) => { if (c && c.player) { news.push({ year: year(), text, cell, kind, seq: ++seq }); if (news.length > 40) news.shift(); } };
    const year = () => h.year();
    const eraOf = (c) => Math.min(8, Math.max(0, c.era | 0));
    const cellLL = (i) => { const y = (i / W) | 0, x = i - y * W; return [(x + 0.5) / W * 360 - 180, 90 - (y + 0.5) / H * 180]; };

    // ---------- who may march where ----------
    // a host crosses its own land, its enemies', land nobody holds, and that of its allies, its lord and its vassals
    function mayPass(c, o) {
      if (o < 0 || o === c.id) return true;
      if (h.isAtWar(c, o)) return true;
      const cv = civs[o]; if (!cv) return true;
      if (h.diplo.has(c, o, 'alliance')) return true;
      const lc = h.diplo.lordOf(c), lo = h.diplo.lordOf(cv);
      return (lc && lc.id === o) || (lo && lo.id === c.id);
    }
    // a road by land from a to b (b may be a region the host has to take): an array of regions after a, or null. A* over the
    // grid, mountains slower to cross than plains.
    function roadBy(c, a, b, sea) {
      if (a === b) return [];
      const open = new Heap(), came = new Map(), cost = new Map(); cost.set(a, 0); open.push(a, cellDist(a, b));
      let seen = 0;
      while (open.size) {
        const i = open.pop(); if (i === b) break;
        if (++seen > MAXPATH) return null;
        const ci = cost.get(i);
        for (let k = 0; k < 8; k++) {
          const n = nbOf(i, k); if (n < 0) continue;
          if (sea) { if (land[n] && n !== b) continue; }
          else { if (!land[n] || (flags[n] & 8)) continue; if (n !== b && !mayPass(c, owner[n])) continue; }
          const step = (k === 0 || k === 2 || k === 5 || k === 7 ? 1.41 : 1) * (sea ? 1 : 1 + 3 * h.elev[n] / 255);
          const nc = ci + step; const old = cost.get(n);
          if (old === undefined || nc < old) { cost.set(n, nc); came.set(n, i); open.push(n, nc + cellDist(n, b)); }
        }
      }
      if (!came.has(b)) return null;
      const out = []; for (let i = b; i !== a; i = came.get(i)) out.push(i); out.reverse(); return out;
    }
    // a sea region beside a coastal region (where a fleet lies off it), or -1
    function offshore(i) { for (let k = 0; k < 8; k++) { const n = nbOf(i, k); if (n >= 0 && !land[n]) return n; } return -1; }

    // ---------- raising ----------
    function menFor(c, share) { return Math.max(40, Math.round(h.popOf[c.id] * 1000 * MOB[eraOf(c)] * c.policy.military * (share || 1))); }
    function nameFor(c, ai) {
      const k = KIND[eraOf(c)], cap = h.cellName.get(c.capital);
      const n = 1 + list.filter((a) => a.c === c.id).length;
      return ai ? `The ${k} of ${h.fullName(c)}` : (n > 1 ? `The ${['', 'first', 'second', 'third', 'fourth'][Math.min(4, n)] || n + 'th'} ${k} of ${cap || h.fullName(c)}` : `The ${k} of ${cap || h.fullName(c)}`);
    }
    function make(c, at, men, ai, foe) {
      const a = { id: nextId++, c: c.id, men, raised: men, cell: at, from: at, goal: -1, path: [], state: 'camp', foe: foe === undefined ? -1 : foe, siege: 0, siegeAt: -1, morale: 1, era: eraOf(c), since: year(), moved: year(), ai: !!ai, fleet: -1, name: nameFor(c, ai), won: 0, lost: 0 };
      list.push(a); return a;
    }
    // the player's levy takes the field at a town of his (or at his capital)
    function raise(c, at) {
      const i = at >= 0 && owner[at] === c.id && land[at] ? at : c.capital; if (i < 0) return null;
      for (const a of list) if (a.c === c.id && !a.ai) return a;      // (one levy, one host)
      const a = make(c, i, menFor(c, 1.5), false);
      h.logEvent(c, `${a.name} takes the field: ${fmtMen(a.men)} under arms`, false, 'war', i);
      return a;
    }
    const fmtMen = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + ' million men' : n >= 10000 ? Math.round(n / 1000) + ' thousand men' : n >= 1000 ? (n / 1000).toFixed(1) + ' thousand men' : Math.round(n) + ' men';
    function remove(a) { const k = list.indexOf(a); if (k >= 0) list.splice(k, 1); if (a.fleet >= 0) { const f = fleets.find((q) => q.id === a.fleet); if (f) f.carry = -1; } }

    // ---------- the player's orders ----------
    // march to a region: by land if a road runs there, else to the fleet's harbour, over the sea and up the shore beyond
    function order(id, goal) {
      const a = list.find((q) => q.id === id); if (!a || a.ai) return 'No such host';
      const c = civs[a.c]; if (!c) return 'No such host';
      if (goal < 0 || !land[goal]) return 'A host marches on land';
      const o = owner[goal];
      if (o >= 0 && o !== c.id && !mayPass(c, o)) return `${h.fullName(civs[o])} will not let your host through: you are not at war with them, nor allied`;
      if (a.state === 'sea') return 'Your host is at sea';
      const road = roadBy(c, a.cell, goal, false);
      if (road) { a.goal = goal; a.path = road; a.legs = null; a.state = road.length ? 'march' : 'camp'; a.siege = 0; a.siegeAt = -1; return null; }
      // over the sea: a fleet of the realm's, at a harbour the host can reach, to the coast nearest the goal
      const fl = fleets.filter((f) => f.c === c.id && f.carry < 0); if (!fl.length) return 'No road runs there by land. A fleet could carry your host over the sea';
      let best = null;
      for (const f of fl) {
        const toPort = roadBy(c, a.cell, f.port, false); if (!toPort) continue;
        const land2 = coastNear(c, goal, f); if (!land2) continue;
        const sea = roadBy(c, offshore(f.port), land2.off, true); if (!sea) continue;
        const ashore = roadBy(c, land2.cell, goal, false); if (!ashore) continue;
        const len = toPort.length + sea.length * 0.4 + ashore.length;
        if (!best || len < best.len) best = { f, toPort, sea, land2, ashore, len };
      }
      if (!best) return 'Neither by land nor by sea does a road run there for your host';
      a.goal = goal; a.path = best.toPort; a.legs = { fleet: best.f.id, sea: best.sea, landAt: best.land2.cell, ashore: best.ashore }; a.state = best.toPort.length ? 'march' : 'embark'; a.siege = 0; a.siegeAt = -1;
      return null;
    }
    // the coastal region nearest a goal that a fleet could put a host ashore on (one the host may enter), with the sea off it
    function coastNear(c, goal, f) {
      const gy = (goal / W) | 0, gx = goal - gy * W; let best = null;
      for (let r = 0; r <= 12 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const y = gy + dy; if (y < 0 || y >= H) continue;
        const i = y * W + ((gx + dx + W) % W); if (!land[i] || !(flags[i] & 4) || (flags[i] & 8)) continue;
        if (!mayPass(c, owner[i])) continue; const off = offshore(i); if (off < 0) continue;
        const d = cellDist(i, goal); if (!best || d < best.d) best = { cell: i, off, d };
      }
      return best;
    }
    function halt(id) { const a = list.find((q) => q.id === id); if (!a || a.ai || a.state === 'sea') return; a.path = []; a.legs = null; a.goal = -1; a.state = 'camp'; a.siege = 0; a.siegeAt = -1; }
    function disband(id, why) {
      const a = list.find((q) => q.id === id); if (!a) return; const c = civs[a.c];
      if (c && !a.ai) { if (year() < c.army) c.army = year(); h.logEvent(c, why || `${a.name} goes home`, false, 'war', a.cell); }
      remove(a);
    }

    // ---------- fleets ----------
    function shipsFor(c) { return Math.max(4, Math.round(6 + 3 * (h.ports[c.id] || 0) + 10 * (eraOf(c) >= 6 ? 1 : 0))); }
    function buildFleet(c, port) {
      const f = { id: nextId++, c: c.id, ships: shipsFor(c), built: 0, port, cell: offshore(port), from: offshore(port), path: [], state: 'port', carry: -1, era: eraOf(c), since: year(), name: `The fleet of ${h.cellName.get(port) || h.fullName(c)}` };
      f.built = f.ships; fleets.push(f);
      h.logEvent(c, `${f.name} puts to sea: ${f.ships} ships`, false, 'war', port); return f;
    }
    const naval = (c) => h.KF(c.id, 'sea') * (1 + 0.5 * (h.knows(c.id, 'galleys') ? 1 : 0) + 0.5 * (h.knows(c.id, 'ironclads') ? 1 : 0));

    // ---------- where hosts stand: the border fights read this ----------
    // the factor on realm o's chance to take region n from realm on: more where o's host stands near, less where on's does
    const near = new Map();      // region -> [civ ids with a host within FOCUS_R], rebuilt every year
    function mark() {
      near.clear();
      for (const a of list) {
        const y0 = (a.cell / W) | 0, x0 = a.cell - y0 * W;
        for (let dy = -FOCUS_R; dy <= FOCUS_R; dy++) { const y = y0 + dy; if (y < 0 || y >= H) continue; for (let dx = -FOCUS_R; dx <= FOCUS_R; dx++) { const i = y * W + ((x0 + dx + W) % W); let l = near.get(i); if (!l) near.set(i, l = []); if (l.indexOf(a.c) < 0) l.push(a.c); } }
      }
    }
    function focus(o, on, n) {
      if (!(civs[o] && civs[o].player) && !(civs[on] && civs[on].player)) return 1;      // (the world's own wars keep the numbers they were fitted to: there hosts are what is seen, and they fight each other, but land changes hands as it always did)
      const l = near.get(n); if (!l) return 1;
      let f = 1; if (l.indexOf(o) >= 0) f *= FOCUS_OWN; if (l.indexOf(on) >= 0) f *= FOCUS_FOE; return f;
    }

    // ---------- the autopilot's hosts: one on every front ----------
    // the newest fight over the border between each two realms, from the simulation's record of them
    function fronts() {
      const out = new Map(), yr = year(), B = h.battles;
      for (let k = B.length - 1; k >= 0; k--) { const b = B[k]; if (yr - b.year > 6) break; const key = b.a * 4096 + b.b; if (!out.has(key)) out.set(key, b); }
      return out;
    }
    function syncAI() {
      const yr = year(), want = new Set();
      for (const c of civs) {
        if (!c || c.player) continue; const ws = Object.keys(c.wars); if (!ws.length) continue;
        const nb = h.neighbours(c.id) || [];
        const foes = ws.map(Number).filter((f) => civs[f] && nb.indexOf(f) >= 0);
        for (const f of foes) {
          const key = c.id * 4096 + f; want.add(key);
          if (list.some((a) => a.ai && a.c === c.id && a.foe === f)) continue;
          if ((rest.get(key) || -1e9) > yr) continue;
          if (c.capital < 0 || h.cellsOf[c.id] < 3) continue;
          make(c, c.capital, menFor(c, 1 / Math.max(1, foes.length)), true, f);
        }
      }
      for (let k = list.length - 1; k >= 0; k--) { const a = list[k]; if (!a.ai) continue; const c = civs[a.c]; if (!c || !want.has(a.c * 4096 + a.foe) || !civs[a.foe]) list.splice(k, 1); }
    }
    // an autopilot host goes where the fighting is, and stays on its own side of the border
    function moveAI(a, F) {
      const c = civs[a.c], f = civs[a.foe]; if (!c || !f) return;
      const b1 = F.get(c.id * 4096 + f.id), b2 = F.get(f.id * 4096 + c.id);
      let target = -1;
      if (b1 && (!b2 || b1.year >= b2.year)) target = b1.from;      // (where it attacked from)
      else if (b2) target = b2.i;                                    // (the region the enemy attacks)
      if (target < 0 || owner[target] !== c.id) target = c.capital >= 0 && f.capital >= 0 ? stepToward(c, c.capital, f.capital) : -1;
      if (target < 0) return;
      a.goal = target; let moves = SPEED[eraOf(c)];
      while (moves-- > 0 && a.cell !== target) {
        let best = -1, bd = cellDist(a.cell, target);
        for (let k = 0; k < 8; k++) { const n = nbOf(a.cell, k); if (n < 0 || !land[n] || (flags[n] & 8)) continue; const o = owner[n]; if (o !== c.id && o >= 0 && !(h.diplo.has(c, o, 'alliance'))) continue; const d = cellDist(n, target); if (d < bd - 1e-6) { bd = d; best = n; } }
        if (best < 0) break; a.from = a.cell; a.cell = best; a.moved = year();
      }
      a.state = a.cell === target ? 'camp' : 'march';
    }
    // the last region of c's on the way from a toward b, walking straight: where c's border meets the road
    function stepToward(c, a, b) {
      let i = a; for (let s = 0; s < 400; s++) { if (i === b) return i; let best = -1, bd = cellDist(i, b); for (let k = 0; k < 8; k++) { const n = nbOf(i, k); if (n < 0 || !land[n]) continue; const d = cellDist(n, b); if (d < bd - 1e-6) { bd = d; best = n; } } if (best < 0 || owner[best] !== c.id) return i; i = best; }
      return i;
    }

    // ---------- the player's host on the march ----------
    const power = (a) => a.men * Math.max(0.02, h.strengthOf[a.c]) * (0.4 + 0.6 * a.morale);
    function garrison(n, walled) { const o = owner[n]; return pop[n] * 1000 * (walled ? GARRISON_WALLED : GARRISON) * Math.max(0.02, o >= 0 ? h.strengthOf[o] : 0.3); }
    function movePlayer(a) {
      const c = civs[a.c]; if (!c) return;
      if (a.state === 'siege') { siegeStep(a); return; }
      if (a.state === 'embark' || a.state === 'sea') { sail(a); return; }
      let moves = SPEED[eraOf(c)], storms = STORM[eraOf(c)];
      while (moves > 0 && a.path.length) {
        const n = a.path[0], o = owner[n];
        if (o >= 0 && o !== c.id && h.isAtWar(c, o)) {
          if (storms <= 0) break; storms--; moves--;
          if (level[n] >= 1 && walls[n] > 0) { a.state = 'siege'; a.siegeAt = n; a.siege = 0; stats.sieges++; h.logEvent(c, `${a.name} lays siege to ${h.cellName.get(n) || 'a walled town'}`, false, 'war', n); say(c, `${a.name} lays siege to ${h.cellName.get(n) || 'a walled town'}`, n, 'siege'); return; }
          if (!assault(a, n, 1)) break;
        } else if (!mayPass(c, o)) { const again = a.goal >= 0 ? roadBy(c, a.cell, a.goal, false) : null; a.path = again || []; if (!again) a.state = 'camp'; break; }
        else moves--;
        a.from = a.cell; a.cell = n; a.path.shift(); a.moved = year();
      }
      if (!a.path.length) a.state = a.legs ? 'embark' : 'camp';
      else if (a.state !== 'siege') a.state = 'march';
    }
    // a host storms an enemy region: the men who hold it, what the host brings against them (k: less from the boats)
    function assault(a, n, k) {
      const c = civs[a.c], pa = power(a) * k, pd = garrison(n, false) + 1e-6, r = pa / (pa + pd);
      const p = Math.min(0.95, Math.max(0.05, 0.15 + 0.8 * Math.pow(r, 1.5)));
      a.men = Math.max(0, Math.round(a.men * (1 - (0.01 + 0.07 * (1 - r)))));
      if (h.rnd() < p) { h.conquer(n, c, a.cell, false); stats.taken++; a.morale = Math.min(1.2, a.morale + 0.02); return true; }
      a.morale = Math.max(0.2, a.morale - 0.05); return false;
    }
    function siegeStep(a) {
      const c = civs[a.c], n = a.siegeAt, o = owner[n];
      if (n < 0 || o === c.id || o < 0 || !h.isAtWar(c, o)) { a.state = a.path.length ? 'march' : 'camp'; a.siegeAt = -1; a.siege = 0; return; }
      const pa = power(a), pd = garrison(n, true) + 1e-6, r = pa / (pa + pd);
      const rate = Math.min(0.6, Math.max(0.01, 0.4 * Math.pow(r, 1.5) * h.KF(c.id, 'siege') / h.KF(o, 'defence') / Math.max(1, walls[n])));
      a.siege += rate; a.men = Math.max(0, Math.round(a.men * (1 - 0.02 - 0.03 * (1 - r))));      // (disease in the camp, and sallies)
      if (a.siege >= 1) {
        const name = h.cellName.get(n) || 'the town', foe = civs[o];
        h.conquer(n, c, a.cell, true); stats.taken++;
        h.logEvent(c, `${a.name} takes ${name} after a siege`, true, 'war', n); say(c, `${a.name} takes ${name} after a siege`, n, 'taken'); if (foe) { h.logEvent(foe, `${name} falls to ${a.name}`, false, 'war', n); say(foe, `${name} falls to ${a.name}`, n, 'lost'); }
        a.from = a.cell; a.cell = n; if (a.path[0] === n) a.path.shift(); a.siege = 0; a.siegeAt = -1; a.state = a.path.length ? 'march' : 'camp'; a.moved = year(); a.morale = Math.min(1.2, a.morale + 0.1);
      }
    }
    // the fleet comes for the host at its harbour, carries it, and puts it ashore
    function sail(a) {
      const c = civs[a.c], L = a.legs; if (!L) { a.state = 'camp'; return; }
      const f = fleets.find((q) => q.id === L.fleet); if (!f) { a.legs = null; a.state = 'camp'; h.logEvent(c, `${a.name} waits for ships that will not come`, false, 'war', a.cell); return; }
      if (a.state === 'embark') {
        if (f.carry >= 0 && f.carry !== a.id) return;
        f.carry = a.id; f.path = L.sea.slice(); f.state = 'sea'; a.state = 'sea'; a.fleet = f.id; return;
      }
      // at sea
      let moves = SAIL[f.era];
      while (moves-- > 0 && f.path.length) { f.from = f.cell; f.cell = f.path.shift(); }
      seaFight(f, a);
      if (!fleets.includes(f)) return;
      if (!f.path.length) {
        // ashore: the landing region, by storm if the enemy holds it (from the boats, at two thirds of the host's might)
        const n = L.landAt, o = owner[n];
        if (o >= 0 && o !== c.id && h.isAtWar(c, o)) { if (!assault(a, n, 0.67)) return; }
        else if (!mayPass(c, o)) { a.state = 'camp'; a.legs = null; f.carry = -1; a.fleet = -1; return; }
        a.from = f.cell; a.cell = n; a.path = L.ashore.slice(); a.legs = null; a.fleet = -1; f.carry = -1; f.state = 'sea'; a.state = a.path.length ? 'march' : 'camp'; a.moved = year();
        f.path = roadBy(c, f.cell, offshore(f.port), true) || []; f.state = 'home';
      }
      a.cell = f.cell >= 0 ? f.cell : a.cell;
    }
    // a fleet that sails within reach of an enemy's harbours is met by its ships
    function seaFight(f, a) {
      const c = civs[f.c];
      for (const ks of Object.keys(c.wars)) {
        const e = civs[+ks]; if (!e || !h.ports[e.id]) continue;
        let close = false; for (let k = 0; k < 4; k++) { const p = h.portCells[e.id * 4 + k]; if (p >= 0 && cellDist(p, f.cell) <= 4) close = true; }
        if (!close || h.rnd() > 0.5) continue;
        const pf = f.ships * naval(c) * Math.max(0.02, h.strengthOf[c.id]), pe = (4 + 3 * h.ports[e.id]) * naval(e) * Math.max(0.02, h.strengthOf[e.id]), r = pf / (pf + pe);
        stats.battles++;
        const win = h.rnd() < Math.pow(r, 1.5) / (Math.pow(r, 1.5) + Math.pow(1 - r, 1.5));
        f.ships = Math.max(0, Math.round(f.ships * (win ? 1 - 0.1 * (1 - r) : 0.55 + 0.2 * r)));
        h.battles.push({ i: f.cell, from: f.from, year: year(), a: c.id, b: e.id, sea: true, taken: false });
        { const text = win ? `${f.name} beats the ships of ${h.fullName(e)} at sea` : `${f.name} is beaten at sea by the ships of ${h.fullName(e)}`; h.logEvent(c, text, true, 'war', f.cell); say(c, text, f.cell, win ? 'won' : 'lost'); }
        if (!win && a) { a.men = Math.round(a.men * 0.75); a.morale = Math.max(0.2, a.morale - 0.25); }
        if (f.ships < Math.max(2, f.built * 0.25)) {
          h.logEvent(c, `${f.name} is lost`, true, 'war', f.cell);
          if (a) { a.men = Math.round(a.men * 0.4); a.state = 'camp'; a.legs = null; a.fleet = -1; a.cell = f.port >= 0 && owner[f.port] === c.id ? f.port : c.capital; }
          const k = fleets.indexOf(f); if (k >= 0) fleets.splice(k, 1); return;
        }
        if (!win && a) { f.path = roadBy(c, f.cell, offshore(f.port), true) || []; f.state = 'home'; a.legs = null; a.state = 'sea'; }
        return;
      }
    }
    function moveFleet(f) {
      if (f.carry >= 0) return;      // (the host it carries moves it)
      const c = civs[f.c]; if (!c) return;
      if (f.state === 'home') { let moves = SAIL[f.era]; while (moves-- > 0 && f.path.length) { f.from = f.cell; f.cell = f.path.shift(); } if (!f.path.length) f.state = 'port'; }
    }

    // ---------- battle ----------
    function battle(a, b) {
      const pa = power(a) * terrain(a, b), pb = power(b) * terrain(b, a), r = pa / (pa + pb);
      const ka = Math.pow(r, 1.5), kb = Math.pow(1 - r, 1.5), aWins = h.rnd() < ka / (ka + kb);
      const W1 = aWins ? a : b, L1 = aWins ? b : a, rw = aWins ? r : 1 - r;
      const mw = W1.men, ml = L1.men;
      W1.men = Math.round(W1.men * (1 - (0.06 + 0.16 * (1 - rw)) * (0.7 + 0.6 * h.rnd())));
      L1.men = Math.round(L1.men * (1 - (0.22 + 0.25 * rw) * (0.7 + 0.6 * h.rnd())));
      const lostW = mw - W1.men, lostL = ml - L1.men;
      W1.morale = Math.min(1.2, W1.morale + 0.1); L1.morale = Math.max(0.2, L1.morale - 0.3); W1.won++; L1.lost++;
      stats.battles++;
      h.battles.push({ i: L1.cell, from: W1.cell, year: year(), a: W1.c, b: L1.c, field: true, taken: false });
      const cw = civs[W1.c], cl = civs[L1.c], at = h.cellName.get(L1.cell) || h.cellName.get(W1.cell) || 'the border';
      if (cw.player || cl.player) {
        const text = cw.player ? `${W1.name} beats ${L1.name} at ${at}: ${fmtMen(lostL)} of theirs fall, ${fmtMen(lostW)} of yours` : `${L1.name} is beaten at ${at} by ${W1.name}: ${fmtMen(lostL)} fall`;
        h.logEvent(cw.player ? cw : cl, text, true, 'war', L1.cell); say(cw.player ? cw : cl, text, L1.cell, cw.player ? 'won' : 'lost');
      }
      // the beaten host falls back toward its capital, out of the battle's reach
      retreat(L1);
      if (L1.men < L1.raised * BROKEN) broken(L1);
    }
    function terrain(a, b) {      // the side standing on higher ground, or behind walls on its own land, fights better
      const ea = h.elev[a.cell] / 255, eb = h.elev[b.cell] / 255; let k = 1 + Math.max(0, ea - eb) * 0.8;
      if (owner[a.cell] === a.c && walls[a.cell] > 0 && level[a.cell]) k *= 1 + 0.4 * walls[a.cell];
      return k;
    }
    function retreat(a) {
      const c = civs[a.c]; if (!c || c.capital < 0) return; a.path = []; a.goal = -1; a.legs = null; a.siege = 0; a.siegeAt = -1;
      for (let s = 0; s < 2; s++) { let best = -1, bd = cellDist(a.cell, c.capital); for (let k = 0; k < 8; k++) { const n = nbOf(a.cell, k); if (n < 0 || !land[n] || !mayPass(c, owner[n])) continue; const d = cellDist(n, c.capital); if (d < bd) { bd = d; best = n; } } if (best < 0) break; a.from = a.cell; a.cell = best; }
      a.state = 'camp'; a.moved = year();
    }
    function broken(a) {
      const c = civs[a.c];
      if (a.ai) rest.set(a.c * 4096 + a.foe, year() + REST);
      if (c && !a.ai) disband(a.id, `${a.name} is broken and scatters`); else remove(a);
      if (c && c.player) say(c, `${a.name} is broken`, a.cell, 'broken');
    }
    function fight() {
      // hosts of realms at war with each other, within a region of each other, give battle: once a year each
      const at = new Map(); for (const a of list) { let l = at.get(a.cell); if (!l) at.set(a.cell, l = []); l.push(a); }
      const done = new Set();
      for (const a of list.slice()) {
        if (done.has(a.id) || !list.includes(a)) continue; const c = civs[a.c]; if (!c) continue;
        let foe = null;
        for (let k = -1; k < 8 && !foe; k++) {
          const n = k < 0 ? a.cell : nbOf(a.cell, k); if (n < 0) continue; const l = at.get(n); if (!l) continue;
          for (const b of l) if (b !== a && !done.has(b.id) && list.includes(b) && h.isAtWar(c, b.c) && b.state !== 'sea' && a.state !== 'sea') { foe = b; break; }
        }
        if (!foe) continue; done.add(a.id); done.add(foe.id); battle(a, foe);
      }
    }

    // ---------- a year ----------
    function step() {
      const t0 = performance.now(), yr = year(), F = fronts();
      syncAI();
      for (const a of list.slice()) {
        if (!list.includes(a)) continue; const c = civs[a.c];
        if (!c) { remove(a); continue; }
        if (!a.ai) {
          if (yr >= c.army) { disband(a.id, `${a.name} goes home: its men have served their years`); continue; }
          // a foe the host was marching on has made peace: its orders stand only as far as the way is open
          if (a.foe >= 0 && !c.wars[a.foe]) a.foe = -1;
          movePlayer(a);
        } else moveAI(a, F);
        a.men = Math.round(a.men * 0.995 + 0.0); a.morale = Math.min(1, a.morale + 0.02);
        if (a.ai) a.men = Math.max(a.men, Math.round(a.raised * 0.5 * Math.min(1, (yr - a.since) / 30)));      // (an autopilot's front is kept up)
      }
      for (const f of fleets.slice()) { if (!civs[f.c]) { fleets.splice(fleets.indexOf(f), 1); continue; } moveFleet(f); }
      fight();
      for (const a of list.slice()) if (a.men < a.raised * BROKEN && list.includes(a)) broken(a);
      mark();
      stats.hosts = list.length; stats.ms = performance.now() - t0;
    }
    // a realm that falls takes its hosts and ships with it
    function died(c) { for (let k = list.length - 1; k >= 0; k--) if (list[k].c === c) list.splice(k, 1); for (let k = fleets.length - 1; k >= 0; k--) if (fleets[k].c === c) fleets.splice(k, 1); }

    // ---------- saved with the world ----------
    const ST = ['camp', 'march', 'siege', 'embark', 'sea'];
    function save() {
      return { n: nextId,
        a: list.map((a) => [a.id, a.c, a.men, a.raised, a.cell, a.goal, ST.indexOf(a.state), a.foe, Math.round(a.siege * 100), a.siegeAt, Math.round(a.morale * 100), a.era, a.ai ? 1 : 0, a.since, a.name, a.won, a.lost]),
        f: fleets.map((f) => [f.id, f.c, f.ships, f.built, f.port, f.cell, f.era, f.since, f.name]),
        r: [...rest.entries()] };
    }
    function load(s) {
      list.length = 0; fleets.length = 0; rest.clear(); if (!s) return;
      nextId = s.n || 1;
      for (const q of s.a || []) { const [id, c, men, raised, cell, goal, st, foe, sg, sAt, mo, era, ai, since, name, won, lost] = q; if (!civs[c]) continue; const a = { id, c, men, raised, cell, from: cell, goal, path: [], state: ST[st] || 'camp', foe, siege: sg / 100, siegeAt: sAt, morale: mo / 100, era, since, moved: since, ai: !!ai, fleet: -1, name, won: won || 0, lost: lost || 0 }; if (a.state === 'sea' || a.state === 'embark') a.state = 'camp'; list.push(a); if (!a.ai && a.goal >= 0) { const r = roadBy(civs[c], cell, goal, false); a.path = r || []; if (a.state === 'march' && !r) a.state = 'camp'; } }
      for (const q of s.f || []) { const [id, c, ships, built, port, cell, era, since, name] = q; if (!civs[c]) continue; fleets.push({ id, c, ships, built, port, cell, from: cell, path: [], state: 'port', carry: -1, era, since, name }); }
      for (const [k, v] of s.r || []) rest.set(+k, v);
      mark();
    }
    mark();
    return { list, fleets, stats, news, step, raise, order, halt, disband, buildFleet, focus, died, save, load, mayPass, roadBy, cellLL, power, menFor, fmtMen, of: (c) => list.filter((a) => a.c === c), fleetsOf: (c) => fleets.filter((f) => f.c === c), byId: (id) => list.find((a) => a.id === id) || null, fleetById: (id) => fleets.find((f) => f.id === id) || null };
  }

  // a binary heap of (value, priority), least first
  class Heap {
    constructor() { this.v = []; this.p = []; }
    get size() { return this.v.length; }
    push(v, p) { const V = this.v, P = this.p; let i = V.length; V.push(v); P.push(p); while (i > 0) { const j = (i - 1) >> 1; if (P[j] <= p) break; V[i] = V[j]; P[i] = P[j]; i = j; } V[i] = v; P[i] = p; }
    pop() {
      const V = this.v, P = this.p, top = V[0], lv = V.pop(), lp = P.pop(); const n = V.length; if (!n) return top;
      let i = 0; for (;;) { let l = 2 * i + 1; if (l >= n) break; if (l + 1 < n && P[l + 1] < P[l]) l++; if (P[l] >= lp) break; V[i] = V[l]; P[i] = P[l]; i = l; }
      V[i] = lv; P[i] = lp; return top;
    }
  }

  window.ARMY = { create, KIND, MOB, SPEED, STORM, SAIL, CARRY, FOCUS_OWN, FOCUS_FOE, FOCUS_R };
})();
