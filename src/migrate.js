// Holocene migration (classic script; exposes window.MIGRATE): people on the move. People go from where the land is full to where
// there is room and a better living: over the border to an emptier neighbour, along the market's roads and ships to a realm they
// reach, to the realm's own far land (its frontier, its colonies). A famine sends its hungry over the border, a war its refugees, an
// unquiet realm those who can go. Their numbers grow with the ages and what carries them (feet and carts; the ships of the ocean;
// steamships and railways), and with the law of labour (a serf may not leave the land; free hands go where the work is). Where
// newcomers come to outnumber the people of a place, it is theirs: their people and their faith (the host's land pass, by inPpl and
// inFth).
// Everything here is flat arrays a realm long: the host's land pass fills cap (what the realm's land feeds), crowd (its people beyond
// six tenths of that, cell by cell: who would leave) and room (below eight tenths: room for newcomers) in the years the flows are
// worked out (EVERY), and moves the people every year by outF (the share of the crowded that leave), genF (the share of all that
// flee) and inF (the share of the room that newcomers fill), in the realms where act is set.
//   MIGRATE.create(h) -> { cap, crowd, room, outF, genF, inF, inPpl, inFth, step, of, setPolicy, save, load, ... } for one world.
window.MIGRATE = (function () {
  'use strict';
  // the share of a realm's people that would leave in a year at the full pull of an empty land, by age: feet and carts, then the
  // ships of the ocean, then steamships and railways (the great emigrations of the nineteenth century: a twentieth of Europe in a
  // decade at their height; of the world, some one in a thousand a year from 1850 to 1940, to other lands and to its own far
  // frontiers), then the closed borders and settled lands of the last ages
  const RATE = [0.0004, 0.0005, 0.0005, 0.0006, 0.0006, 0.0009, 0.004, 0.0035, 0.003];
  // how readily the law of labour lets people go (rule.js's labour field: a serf is bound to the land; free hands go where the work is)
  const MOB = { kin: 1, corvee: 0.8, slavery: 0.5, serfdom: 0.25, guilds: 0.9, free: 1.3, factoryacts: 1.3, unions: 1.3, assigned: 0.3 };
  // refugees: of those a famine kills, as many again flee it; of a realm losing its land to a war a share a year; of one coming apart
  const FAMINE_FLEE = 1.0, WAR_FLEE = 0.004, UNREST_FLEE = 0.003;
  // newcomers from a realm that knows more bring some of it: a share of the difference, by how many they are of the people (the
  // host adds it to what the realm learns that year, as a neighbour's teaching), at most TEACH_MAX in five years
  const TEACH = 0.25, TEACH_MAX = 0.015;
  // how much of a realm's room it can take in a year (the rest of the newcomers do not come)
  const CAPIN = 0.03;
  // newcomers unsettle a realm when they are many: a decade's of them beyond a share of its people (NEW0) costs stability, by NEW_K;
  // a realm that bars its crowded people from leaving keeps them restless
  const NEW0 = 0.03, NEW_K = 0.5, BARRED_K = 0.03;
  // how often the flows are worked out (years; the host moves the people every year by the last of them)
  const EVERY = 5;
  // a destination's pull: how much emptier it is than home (its people against what its land feeds), how much better people live
  // there (to a power), its borders, kinship; hardly at all over the sea before the ships of the ocean (a boat takes a family to
  // the next island, not a people over the sea: at four tenths of the pull in the Middle Ages, Java peopled Australia), a
  // quarter of it under sail (a few thousand a year crossed to the Americas), all of it with steam; the realm's own far land by
  // its share of room
  const GAP0 = 0.05, LIVE_POW = 1.5, SEA = [0.02, 0.03, 0.05, 0.08, 0.1, 0.25, 1, 1, 1], SELF = 1.2, KIN = 1.5, FAITH_KIN = 1.2;
  // what the player's realm says of its borders, and of its people leaving (kept on the realm: civ.mig.b, civ.mig.l)
  const BORDERS = [['open', 'Open', 'Anyone who comes may stay and work.', 1], ['guarded', 'Guarded', 'Some are let in, as the work needs them.', 0.35], ['closed', 'Closed', 'Strangers are turned back at the border.', 0.03]];
  const LEAVING = [['free', 'Free to go', 'Whoever wants to leave may leave.', 1], ['barred', 'Barred', 'Nobody leaves without the crown\'s leave: fewer go.', 0.15]];
  const BK = {}; BORDERS.forEach((b, i) => { BK[b[0]] = i; }); const LK = {}; LEAVING.forEach((b, i) => { LK[b[0]] = i; });
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rec = (cv, yr) => cv.mig || (cv.mig = { b: 'open', l: 'free', o: 0, i: 0, y: yr });

  // h: { civs, MAXC, year(), pop(c), fm(c) (how many its ways feed on a unit of land), starved(c), lost(c) (regions lost this year), stab(cv), nb(c), partners(c), ls(c) (how well
  //      people live), ruling(c) (people id), faith(c) (faith id, 0 the old ways), labour(cv) (the law of labour's key), harvest(c),
  //      atWar(cv, d), news(from, to, thousands) (a decade's great flow), teach(d, amount) (learning newcomers bring) }
  function create(h) {
    const civs = h.civs, MAXC = h.MAXC;
    const cap = new Float32Array(MAXC), crowd = new Float32Array(MAXC), room = new Float32Array(MAXC);
    const outF = new Float32Array(MAXC), genF = new Float32Array(MAXC), inF = new Float32Array(MAXC);
    const inPpl = new Uint16Array(MAXC), inFth = new Uint16Array(MAXC), act = new Uint8Array(MAXC);      // (act: the realm has people leaving or coming: the host's pass looks at nothing else)
    const roomLeft = new Float32Array(MAXC), inSum = new Float32Array(MAXC), selfIn = new Float32Array(MAXC), inMax = new Float32Array(MAXC), inFrom = new Int32Array(MAXC), taught = new Float32Array(MAXC);
    const dens = new Float32Array(MAXC), lsP = new Float32Array(MAXC), bOf = new Float32Array(MAXC), hvOf = new Float32Array(MAXC), sq = new Float32Array(MAXC), fmOf = new Float32Array(MAXC);
    const pplOf = new Uint16Array(MAXC), fthOf = new Uint16Array(MAXC);
    const flows = new Map();      // (the decade's flows between realms: from * MAXC + to -> thousands)
    const stats = { out: 0, abroad: 0, refugees: 0, ms: 0, years: 0 };
    let lastFlows = [];      // (the last decade's greatest flows: [from, to, thousands])
    let rot = 0, stampN = 0;
    const W = new Int32Array(MAXC), WG = new Float32Array(MAXC), mark = new Int32Array(MAXC).fill(-1);
    let nW = 0, gSum = 0, wSum = 0;

    function policy(cv) { const m = cv.mig; return { b: m && m.b ? (BK[m.b] | 0) : 0, l: m && m.l ? (LK[m.l] | 0) : 0 }; }
    // how strongly d draws the people of c (g: the pull, 0 to about 1), and so how many of them it takes (by the pull and its room)
    function consider(c, cv, d, acc, stamp) {
      let g;
      if (d === c) g = SELF * clamp(room[c] / Math.max(1e-6, 0.8 * cap[c]), 0, 1);      // (the realm's own far land: by how much of it is empty)
      else {
        // (how much emptier it is, as the newcomers' own ways would farm it: a land of hunters is full at a few to a valley, and has
        //  room for many farmers)
        g = dens[c] - dens[d] * fmOf[d] / fmOf[c] - GAP0; if (!(g > 0) || !(roomLeft[d] > 0) || mark[d] === stamp) return; if (h.atWar(cv, d)) return;
        g *= acc * clamp(lsP[d] / lsP[c], 0.1, 8) * bOf[d]; if (pplOf[c] && pplOf[d] === pplOf[c]) g *= KIN; if (fthOf[c] && fthOf[d] === fthOf[c]) g *= FAITH_KIN;
      }
      mark[d] = stamp; g *= hvOf[d]; if (!(g > 0) || !(roomLeft[d] > 0)) return;
      W[nW] = d; WG[nW] = g; nW++; gSum += g; wSum += g * sq[d];
    }
    // (worked out every EVERY years - the room and the crowding change slowly - and the host's land pass moves the people every year
    //  by what was worked out last)
    function step() {
      const yr = h.year(); stats.years++; if (yr % EVERY !== 0) return; const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      outF.fill(0); genF.fill(0); inF.fill(0); inPpl.fill(0); inFth.fill(0); inSum.fill(0); selfIn.fill(0); inMax.fill(0); inFrom.fill(-1); taught.fill(0); act.fill(0);
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; if (!cv || !(cap[c] > 0)) { roomLeft[c] = 0; continue; }
        roomLeft[c] = room[c] * CAPIN; dens[c] = h.pop(c) / cap[c]; lsP[c] = Math.pow(Math.max(0.1, h.ls(c)), LIVE_POW); sq[c] = Math.sqrt(room[c]);
        bOf[c] = cv.player ? BORDERS[policy(cv).b][3] : 1; hvOf[c] = 0.4 + 0.6 * clamp(h.harvest(c), 0, 1.2); pplOf[c] = h.ruling(c) || 0; fthOf[c] = h.faith(c) || 0; fmOf[c] = Math.max(1e-6, h.fm(c));
      }
      rot = (rot + 7919) % MAXC;      // (sources in a turning order: no realm is always first to the room)
      for (let q = 0; q < MAXC; q++) {
        const c = (q + rot) % MAXC, cv = civs[c]; if (!cv || !(cap[c] > 0)) continue; const P = h.pop(c); if (!(P > 0.5)) continue;
        const pol = policy(cv), era = clamp(cv.era | 0, 0, 8), st = h.stab(cv);
        const mob = (MOB[h.labour(cv)] || 1) * (cv.player ? LEAVING[pol.l][3] : 1);
        const flee = (h.starved(c) * FAMINE_FLEE + P * ((h.lost(c) > 0 ? WAR_FLEE : 0) + (st < 0.3 ? UNREST_FLEE * (0.3 - st) / 0.3 : 0))) * Math.min(1, mob * 1.5);
        if (!(crowd[c] > 0.01 * P) && !(flee > 0.05)) continue;      // (nobody much to send: most realms, most years)
        let went = 0, wentC = 0, fled = 0;
        // (one share of them to d, up to what d can take this year)
        const send = (d, e) => { e = Math.min(e, roomLeft[d]); if (!(e > 0)) return 0; roomLeft[d] -= e; inSum[d] += e; if (e > inMax[d]) { inMax[d] = e; inFrom[d] = c; } went += e;
          if (d === c) { wentC += e; selfIn[c] += e; } else { const key = c * MAXC + d; flows.set(key, (flows.get(key) || 0) + e * EVERY); stats.abroad += e * EVERY; const dt = cv.tech - civs[d].tech; if (dt > 0) taught[d] += e * dt; } return e; };
        // emigrants: where there is room and a better living - the realm's own far land, its neighbours, the realms its roads and ships reach
        if (crowd[c] > 0.01 * P) {
          nW = 0; gSum = 0; wSum = 0; const stamp = ++stampN;
          consider(c, cv, c, 1, stamp);
          const nb = h.nb(c); if (nb) for (let k = 0; k < nb.length; k++) consider(c, cv, nb[k], 1, stamp);
          const pa = h.partners(c); if (pa) for (let k = 0; k < pa.length; k++) consider(c, cv, pa[k], SEA[era], stamp);
          if (wSum > 0) { const E = Math.min(crowd[c] * 0.5, P * RATE[era] * mob * Math.min(1.5, gSum)); for (let k = 0; k < nW; k++) send(W[k], E * WG[k] * sq[W[k]] / wSum); }
        }
        const fromCrowd = went;
        // refugees: over the border to any neighbour at peace with theirs that has room and a harvest, emptier or not
        if (flee > 0.05) {
          const nb = h.nb(c); let rs = 0; if (nb) for (let k = 0; k < nb.length; k++) { const d = nb[k], dv = civs[d]; if (dv && roomLeft[d] > 0 && !h.atWar(cv, d)) rs += sq[d] * hvOf[d]; }
          if (rs > 0) for (let k = 0; k < nb.length; k++) { const d = nb[k], dv = civs[d]; if (dv && roomLeft[d] > 0 && !h.atWar(cv, d)) fled += send(d, Math.min(flee, P * 0.05) * sq[d] * hvOf[d] / rs); }
        }
        if (!(went > 0)) continue;
        // from where: the emigrants from the crowded land, the refugees from everyone
        if (fromCrowd > 0 && crowd[c] > 0) outF[c] = fromCrowd / crowd[c];
        if (fled > 0) genF[c] = Math.min(0.05, fled / P);
        if (outF[c] > 0 || genF[c] > 0) act[c] = 1;
        stats.out += went * EVERY; stats.refugees += fled * EVERY;
        if (went > wentC) rec(cv, yr).o += (went - wentC) * EVERY;
      }
      // who comes: the largest of them (the realm's own people, where it is its own), filling the room they take
      for (let d = 0; d < MAXC; d++) {
        const dv = civs[d]; if (!dv || !(inSum[d] > 0) || !(room[d] > 0)) continue;
        inF[d] = Math.min(CAPIN * 1.5, inSum[d] / room[d]); act[d] = 1;
        const s = inFrom[d]; if (s >= 0) { inPpl[d] = pplOf[s]; inFth[d] = fthOf[s]; }
        const abroad = inSum[d] - selfIn[d]; if (abroad > 0) rec(dv, yr).i += abroad * EVERY;
        if (taught[d] > 0 && h.teach) h.teach(d, Math.min(TEACH_MAX, TEACH * EVERY * taught[d] / Math.max(1, h.pop(d))));
      }
      if (yr % 10 === 0) decade(yr);
      stats.ms += (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    }
    // every ten years: the decade's flows, greatest first (the lens draws them, the player and the world hear of them)
    function decade(yr) {
      const all = []; for (const [k, v] of flows) all.push([Math.floor(k / MAXC), k % MAXC, v]); all.sort((a, b) => b[2] - a[2]);
      lastFlows = all.slice(0, 48); flows.clear();
      for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv || !cv.mig) continue; const m = cv.mig; m.lo = m.o; m.li = m.i; m.o = 0; m.i = 0; m.y = yr; }
      if (h.news) for (const [a, b, v] of lastFlows) h.news(a, b, v);
    }
    // where a realm's people went and whence its newcomers came, the last decade (thousands)
    function of(c) { const to = [], from = []; for (const [a, b, v] of lastFlows) { if (a === c) to.push([b, v]); if (b === c) from.push([a, v]); } return { to, from }; }
    // what the newcomers of the last decade and a barred border do to a realm's stability (and the share of its people they are)
    function share(c) { const cv = civs[c]; return cv && cv.mig && cv.mig.li > 0 ? cv.mig.li / Math.max(1, h.pop(c)) : 0; }
    function unrest(cv) { const c = cv.id, m = cv.mig; let u = -NEW_K * Math.max(0, share(c) - NEW0); if (m && m.l === 'barred') u -= BARRED_K * clamp(crowd[c] / Math.max(1, h.pop(c)) * 5, 0, 1); return u; }
    function setPolicy(cv, what, key) { const m = rec(cv, h.year()); if (what === 'b' && BK[key] !== undefined) m.b = key; else if (what === 'l' && LK[key] !== undefined) m.l = key; else return 'No such policy'; return null; }
    function save() { return { rot, flows: lastFlows.map(([a, b, v]) => [a, b, Math.round(v * 10) / 10]) }; }
    function load(s) { if (!s) return; rot = s.rot | 0; lastFlows = Array.isArray(s.flows) ? s.flows.filter((f) => Array.isArray(f) && f.length === 3) : []; }
    return { cap, crowd, room, outF, genF, inF, inPpl, inFth, act, step, of, share, unrest, setPolicy, policy, save, load, stats, get flows() { return lastFlows; } };
  }
  return { create, RATE, MOB, BORDERS, LEAVING, BK, LK, CAPIN, SEA, NEW0, NEW_K, EVERY };
})();
