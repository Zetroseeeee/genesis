// GENESIS faiths: who believes what, where the holy cities are, and what it does to realms. Pure data, no drawing (the
// lens of faiths is world.js's palette and main.js's key; a realm's faith is a page of the laws screen, gov.js).
// Classic script; exposes window.FAITH.
//
// Every region people live in keeps a faith (faith.fth: 0 where they keep the old ways, the gods and the dead of their own
// people). A faith is founded in a holy city when a prophet arises (sim.js: in a realm that knows priesthood and has no
// faith, under a comet, by the god power; in the player's realm the player founds it and chooses its tenets). It is the
// faith of its realm, and the realm carries it to its regions (the faster under one established faith or an enforced
// orthodoxy, slowly where many gods keep one peace, hardly at all where faith is a private matter); those who preach it
// carry it over to the regions beside them, across any border if it is a faith for all peoples (one founded where the
// world faiths are known), among its own people if it is a people's faith; and the merchants of its realms carry it over
// the sea to their partners. The conquered keep their faith. A ruler of the old ways takes up the faith of a neighbour,
// or the faith most of his people have come to hold; a ruler who keeps his people's faith turns now and then to one for
// all peoples; one of a faith turns only when his own has become a quarter of his realm. A faith held far from its holy
// city splits (a church of its own, the more readily once books are printed, and its neighbours may follow), and out of
// a people's faith, where the world faiths are known, comes a teaching for all peoples. Every faith has two tenets, which
// say how it spreads, how it suffers others and whether it will fight for its holy city.
// What a realm's faiths do to it, measured against the age (as knowledge, rule and peoples are, so that the world's numbers
// stay where they were fitted):
//  - Regions of other faiths than the realm's are restless (unrest()), beyond what realms of the age usually hold; the old
//    ways under a faith (and a faith under the old ways) a quarter as much, another church of the same faith most of it;
//    the laws of faith and of speech and the faith's tenets make it worse or better.
//  - Diplomacy (diplo.js asks): one faith, another church of it, another faith; the holy city of one's faith held by
//    another; a holy war, and a war for the holy city.
// The module throws its own dice: what is preached and believed moves nothing else in the world but through the above.
(function () {
  'use strict';
  // how fast the state carries its faith into a region of its realm, a year, by age (among regions that hold it already
  // two and a half times as fast as alone; faster in towns and beside a temple, faster among the old ways)
  const CONV = [0.002, 0.0035, 0.0045, 0.005, 0.005, 0.005, 0.004, 0.003, 0.002];
  // how fast those who preach a faith for all peoples carry it to a neighbouring region, a year, by age (a people's faith
  // among its own people at half of it, among others hardly)
  const PREACH = [0.001, 0.002, 0.003, 0.005, 0.005, 0.005, 0.004, 0.003, 0.002];
  // how readily a ruler of the old ways takes up the faith of a neighbour, every five years, for each neighbour that holds one
  const ADOPT = [0.02, 0.03, 0.04, 0.04, 0.04, 0.035, 0.03, 0.02, 0.015];
  // how readily the merchants of a realm of a faith for all peoples plant it in a partner's harbour or capital, every five years
  const MISSION = [0, 0, 0.04, 0.1, 0.12, 0.14, 0.12, 0.08, 0.05];
  // how restless other faiths make a realm, by age: their share of its people (weighed: see weight) times this
  const RESTLESS = [0.03, 0.05, 0.07, 0.09, 0.1, 0.1, 0.08, 0.06, 0.04];
  // what share of their people realms of each age usually hold of other faiths (tools/faith/probe.js --write measures it):
  // a realm is restless only for what it holds beyond its age's way, and a little steadier for less
  // NORM-BEGIN
  const NORM = [0, 0.039, 0.021, 0.087, 0.074, 0.079, 0.109, 0.161, 0.212];
  // NORM-END
  // a faith held farther from its holy city than this, in regions, by age, may split
  const SPLIT = [24, 26, 28, 30, 32, 34, 40, 50, 60];
  // the tenets a faith is founded on: what each does (preach: how readily it is carried over to a region; adopt: how readily
  // a ruler takes it up; conv: how fast its state carries it; minor: how restless other faiths are where it is the state's;
  // hate: what its realms think of realms of other faiths; sword: a holy war is always just to it; holy: how much its
  // realms mind another faith holding its holy city; town: how much faster it takes towns; split: how readily it splits;
  // own and others: how fast it goes among its people and among others; hungry: how much faster among the hungry)
  const TENETS = [
    { key: 'mission', name: 'Missionaries', text: 'Its preachers go wherever there are people to hear them, and its merchants take them over the sea.', preach: 2, adopt: 1.5 },
    { key: 'sword', name: 'The sword of faith', text: 'Those who die spreading the faith are blessed. A war on unbelievers is always just, and the conquered are made to believe.', conv: 1.4, hate: -6, sword: true },
    { key: 'peace', name: 'Peace among peoples', text: 'Every people may keep its gods; the faithful live beside them in peace. Other faiths are quieter where it rules, and it spreads more slowly.', minor: 0.7, conv: 0.7, hate: 5 },
    { key: 'pilgrim', name: 'Pilgrimage', text: 'Once in a life the faithful go to the holy city, and they will not leave it in other hands.', holy: 1.6, adopt: 1.1 },
    { key: 'monks', name: 'Monks and books', text: 'Houses of prayer keep books and teach the young. It takes the towns first and holds together.', town: 1.6, split: 0.5 },
    { key: 'ancestors', name: 'The ancestors', text: 'The dead of the people are honoured as gods: the faith belongs to its people, and goes slowly among others.', own: 2, others: 0.3 },
    { key: 'kings', name: 'Kings anointed', text: 'The ruler is chosen by heaven, and his faith is his people\'s.', conv: 1.3, adopt: 1.2 },
    { key: 'alms', name: 'Alms', text: 'The faithful feed the poor, and the poor come to the faith.', hungry: 1.8, preach: 1.15 },
  ];
  const TK = {}; TENETS.forEach((T, k) => { T.id = k; TK[T.key] = T; });
  // laws (rule.js, by key): how fast the state carries its faith (conv), how restless other faiths are (minor), how well
  // the realm's own faith holds against preachers (resist: below 1 holds better)
  const LAW = {
    spirits: { conv: 0.5, minor: 0.8 }, ancestors: { conv: 0.9, minor: 0.9 }, rulercult: { conv: 1.2, minor: 1.05 },
    tolerance: { conv: 0.5, minor: 0.55, resist: 1.1 }, established: { conv: 1.25, resist: 0.6 }, orthodoxy: { conv: 1.8, minor: 1.3, resist: 0.3 },
    secular: { conv: 0.15, minor: 0.5, resist: 1.2 }, godless: { conv: 0.6, minor: 1.2, resist: 1.5 },
    censor: { resist: 0.8 }, line: { resist: 0.6 }, wallednet: { resist: 0.7 }, press: { resist: 1.2 }, opennet: { resist: 1.2 },
  };
  const LAW_FIELDS = ['faith', 'speech'];
  const LAP = 10;      // (a tenth of the land is gone over each year, and what could happen in ten years is asked of it at once)
  const MAXF = 4000;      // (ids are 16 bits, and the lens's palette is 4096 wide)
  const NAMES_OLD = ['the Way of {B}', 'the Cult of {B}', 'the Mysteries of {B}', 'the {B} Rites'];
  const NAMES_WORLD = ['{I}', '{I}', 'the {B} Teaching', 'the Church of {B}', 'the {B} Creed'];
  const LATER = ['Reformed', 'Free', 'New', 'Restored'];

  function create(h) {
    const { W, H, N, owner, pop, level, special, civs, MAXC, LI, STYLES } = h;
    const year = () => h.year();
    const fth = new Uint16Array(N);                 // the faith of each region (0: the old ways)
    const state = new Uint16Array(MAXC);            // the faith of each realm (0: the old ways)
    const stateShare = new Float32Array(MAXC);      // the share of a realm's people of its own faith, counted every five years
    const otherShare = new Float32Array(MAXC);      // the share that keeps others, weighed (see weight)
    const restless = new Float32Array(MAXC);        // what that costs its stability now (unrest)
    const pending = new Int32Array(MAXC).fill(-1);  // a prophet has arisen in the player's realm, here: he founds the faith (gov.js)
    const pendingAt = new Float64Array(MAXC);       // (and when)
    const missionTo = new Int32Array(MAXC).fill(-1), missionUntil = new Float64Array(MAXC);      // the player's missionaries: to whom, until when
    const list = [null];                            // the faiths by id: { id, name, base, world, parent, fam, born, home, founder, tenets, hue, sat, lit, n, pop, peak, realms, gone }
    const holyAt = new Map();                       // holy city -> faith
    const holyCell = new Uint8Array(N);             // (1 where some faith has its holy city: the year's loop asks it first)
    let prepped = false;
    const stats = { founded: 0, adopted: 0, turned: 0, split: 0, worlds: 0, converted: 0, preached: 0, missions: 0, ms: 0, msTally: 0 };
    const news = [];                                // (what the chronicle should hear of: the sim logs it)

    // ---------- the module's own dice ----------
    let rs = ((h.seed || 1) ^ 0x3a5f1c2b) >>> 0;
    const rnd = () => { rs += 0x6D2B79F5; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const eraOf = (cv) => Math.min(8, Math.max(0, cv ? cv.era | 0 : 0));

    // ---------- names ----------
    // a faith is named in the tongue of the people of its holy city (people.js), or of its realm's kind of names
    function tongueAt(cell, cv) {
      const P = h.people; if (P) { const p = P.list[P.ppl[cell] || (cv ? P.ruling[cv.id] : 0)]; if (p && p.t) return p.t; }
      const S = STYLES[cv ? cv.style : 0] || STYLES[0]; return S.syl ? { syl: S.syl } : { on: S.on, vow: S.vow, end: S.end };
    }
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    function nameIn(t, minS, maxS) {
      const n = minS + Math.floor(rnd() * (maxS - minS + 1));
      if (t.syl) { let s = ''; for (let i = 0; i < n; i++) s += pick(t.syl); return cap(s); }
      let s = ''; for (let i = 0; i < n; i++) s += pick(t.on) + pick(t.vow);
      s += rnd() < 0.85 ? pick(t.end) : pick(t.on);
      return cap(s.replace(/(.)\1\1/g, '$1$1'));
    }
    const taken = (nm) => list.some((F) => F && F.name === nm);
    const ism = (B) => { const b = B.replace(/[aeiouy]+$/i, ''); return (b.length >= 3 ? b : B) + 'ism'; };
    function freshName(cell, cv, world) {
      const t = tongueAt(cell, cv); let nm = '', B = '';
      for (let k = 0; k < 12; k++) { B = nameIn(t, 1, 2); if (B.length < 3) continue; nm = pick(world ? NAMES_WORLD : NAMES_OLD).replace('{B}', B).replace('{I}', ism(B)); if (!taken(nm)) break; }
      return { name: nm, base: B };
    }
    // a church that breaks away is named for where it lies from the holy city, or once books are printed for what it means to do
    function dirOf(from, to) {
      const ax = to % W, ay = (to / W) | 0, hx = from % W, hy = (from / W) | 0; let dx = ax - hx; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W; const dy = ay - hy;
      return Math.abs(dx) > Math.abs(dy) * 1.2 ? (dx > 0 ? 'Eastern' : 'Western') : (dy > 0 ? 'Southern' : 'Northern');
    }
    // (one word before the faith's own name, never a pile of them: a church of the Southern church is the Western church, not
    // the Western Southern one)
    const QUAL = ['Eastern', 'Western', 'Northern', 'Southern', 'True', 'Old', 'Pure'].concat(LATER);
    const bare = (nm) => { let the = nm.startsWith('the '), t = the ? nm.slice(4) : nm; for (let k = 0; k < 4; k++) { const w = t.split(' ')[0]; if (QUAL.indexOf(w) < 0 || t.indexOf(' ') < 0) break; t = t.slice(w.length + 1); } return { the, t }; };
    const prefixed = (F, a) => { const b = bare(F.name); return (b.the ? 'the ' : '') + a + ' ' + b.t; };
    function sectName(F, cv) {
      const opts = (eraOf(cv) >= 5 && h.knows(cv.id, 'printing') ? LATER.slice() : []).concat([dirOf(F.home, cv.capital), 'True', 'Old', 'Pure']);
      for (const a of opts) { const nm = prefixed(F, a); if (nm !== F.name && !taken(nm)) return { name: nm, base: F.base }; }
      return freshName(cv.capital, cv, F.world);
    }
    const shortOf = (f) => { const F = list[f]; return F ? (F.name.startsWith('the ') ? F.name.slice(4) : F.name) : ''; };
    const nameOf = (f) => (list[f] ? list[f].name : 'the old ways');

    // ---------- tenets ----------
    // what the founders of a faith hold to: by the ruler's character and the age, two of them
    function chooseTenets(cv, world) {
      const t = h.trait ? h.trait(cv) : '', w = TENETS.map((T) => 1);
      const add = (k, v) => { w[TK[k].id] *= v; };
      if (!world) { add('ancestors', 2.5); add('kings', 1.6); add('mission', 0.4); add('peace', 0.6); } else { add('mission', 1.8); add('alms', 1.5); add('ancestors', 0.3); }
      if (t === 'conqueror') add('sword', 3); if (t === 'pious') { add('pilgrim', 2); add('monks', 2); } if (t === 'merchant' || t === 'navigator') add('mission', 2.2);
      if (t === 'tyrant') add('kings', 2.5); if (t === 'steward' || t === 'builder') { add('alms', 1.8); add('pilgrim', 1.5); } if (t === 'scholar') add('monks', 2.5);
      if (cv && cv.aggression > 0.6) add('sword', 1.6); else add('peace', 1.4);
      const out = []; for (let k = 0; k < 2; k++) { let sum = 0; w.forEach((v, j) => { if (out.indexOf(j) < 0) sum += v; }); let r = rnd() * sum; for (let j = 0; j < w.length; j++) { if (out.indexOf(j) >= 0) continue; r -= w[j]; if (r <= 0) { out.push(j); break; } } if (out.length <= k) out.push(TENETS.findIndex((T, j) => out.indexOf(j) < 0)); }
      return out.map((j) => TENETS[j].key);
    }
    // what a faith's tenets do, multiplied (1 where none says anything)
    const KEYS = ['preach', 'adopt', 'conv', 'minor', 'town', 'split', 'own', 'others', 'hungry'];
    function factors(F) { F.k = {}; for (const key of KEYS) { let v = 1; for (const t of F.tenets) { const x = TK[t] && TK[t][key]; if (typeof x === 'number') v *= x; } F.k[key] = v; } return F; }
    const tf = (f, key) => { const F = list[f]; return F ? F.k[key] : 1; };
    const tsum = (f, key) => { const F = list[f]; if (!F) return 0; let v = 0; for (const k of F.tenets) { const x = TK[k] && TK[k][key]; if (typeof x === 'number') v += x; } return v; };
    const has = (f, key) => !!(list[f] && list[f].tenets.indexOf(key) >= 0);

    // ---------- birth ----------
    const GOLD = 0.6180339887;
    function make(o) {
      if (list.length >= MAXF) return 0;
      const id = list.length, P = o.parent && !o.newFam ? list[o.parent] : null;
      // (a family keeps a hue of its own, its churches beside it, each a step to one side and lighter or darker, so that they can be told
      // apart on the map; a teaching for all peoples out of a people's faith is a family of its own; faiths for all peoples bright, a
      // people's faith quieter)
      const side = rnd() < 0.5 ? -1 : 1, free = !P && o.world ? freeHue() : -1, hue = P ? (P.hue + side * (0.03 + rnd() * 0.05) + 1) % 1 : free >= 0 ? free : (id * GOLD + 0.41) % 1;
      const F = { id, name: o.name, base: o.base || '', world: !!o.world, parent: o.parent || 0, fam: P ? P.fam : id, born: year(), home: o.home, founder: o.founder ?? -1, people: o.people ?? (h.people ? h.people.ppl[o.home] : 0),
        tenets: o.tenets || [], hue, sat: P ? Math.min(0.85, Math.max(0.4, P.sat + (rnd() - 0.5) * 0.24)) : (o.world ? 0.68 : 0.5) + rnd() * 0.12, lit: P ? Math.min(0.68, Math.max(0.36, P.lit + (P.lit > 0.52 ? -1 : P.lit < 0.44 ? 1 : rnd() < 0.5 ? -1 : 1) * (0.08 + rnd() * 0.07))) : 0.47 + rnd() * 0.1,
        n: 0, pop: 0, peak: 0, realms: 0, gone: 0 };
      factors(F); list.push(F); holyAt.set(o.home, id); holyCell[o.home] = 1; return id;
    }
    // the hue farthest from those of the great families kept now (every family for all peoples, and the large ones of
    // their peoples): a new faith for all peoples spreads over much of the map, and in the hue of another great one it
    // could not be told from it (or -1 where there are none yet)
    function freeHue() {
      const hs = []; for (const F of list) if (F && !F.gone && F.fam === F.id && (F.world || F.n >= 100)) hs.push(F.hue);
      if (!hs.length) return -1; let best = -1, bd = -1; const ph = rnd();
      for (let k = 0; k < 48; k++) { const h0 = (ph + k / 48) % 1; let d = 1; for (const x of hs) { const dd = Math.abs(h0 - x); const e = Math.min(dd, 1 - dd); if (e < d) d = e; } if (d > bd) { bd = d; best = h0; } }
      return best;
    }
    function setState(c, f) { state[c] = f; const cv = civs[c]; if (cv) cv.religion = f ? list[f].name : null; if (prepped) prep(c); }
    // a faith is founded in a realm, at a holy city (its capital unless said): the faith of the realm from now on
    function found(c, cell, opts) {
      const cv = civs[c]; if (!cv) return 0; opts = opts || {}; const at = cell >= 0 ? cell : cv.capital; if (at < 0) return 0;
      const world = opts.world ?? h.knows(c, 'scripture'); const nm = opts.name ? { name: opts.name, base: opts.base || '' } : freshName(at, cv, world);
      const id = make({ name: nm.name, base: nm.base, world, home: at, founder: c, tenets: opts.tenets && opts.tenets.length === 2 ? opts.tenets.slice() : chooseTenets(cv, world) }); if (!id) return 0;
      const was = state[c]; setState(c, id); fth[at] = id; if (cv.capital >= 0 && pop[cv.capital] > 0 && !holyAt.has(cv.capital)) fth[cv.capital] = id;
      pending[c] = -1; stats.founded++; news.push({ kind: 'found', c, f: id, at, was, why: opts.why || 'prophet', year: year() });
      return id;
    }
    // a prophet arises in a realm without a faith: the autopilot's founds one at once; in the player's, the player does (gov.js)
    function prophet(c, cell, why) {
      const cv = civs[c]; if (!cv || state[c]) return 0;
      if (cv.player) { if (pending[c] < 0) { pending[c] = cell >= 0 ? cell : cv.capital; pendingAt[c] = year(); news.push({ kind: 'prophet', c, at: pending[c], why: why || 'prophet', year: year() }); } return 0; }
      return found(c, cell, { why });
    }
    // a realm is founded at home: it keeps the faith of the people there, or of the realm it broke away from
    function born(c, home, from) {
      pending[c] = -1; missionTo[c] = -1;
      const f = fth[home] || (from >= 0 && civs[from] ? state[from] : 0); setState(c, f);
    }
    // a realm takes a region: settlers of its own people bring its faith to land where nobody kept another
    function claimed(i, c, prev) {
      const f = fth[i];
      if (!f && c && state[c.id] && h.people && h.people.ppl[i] === h.people.ruling[c.id] && !(pop[i] > 0.3)) fth[i] = state[c.id];
      // (a holy city that changes hands: the chronicle hears of it)
      const hf = holyAt.get(i); if (hf && c && prev >= 0 && prev !== c.id && !list[hf].gone) {
        const was = state[prev], now = state[c.id];
        if (was === hf && now !== hf) news.push({ kind: 'holyfall', f: hf, at: i, c: c.id, from: prev, year: year() });
        else if (was !== hf && now === hf) news.push({ kind: 'holyfree', f: hf, at: i, c: c.id, from: prev, year: year() });
      }
    }
    function gone(c) { state[c] = 0; pending[c] = -1; missionTo[c] = -1; restless[c] = 0; }

    // ---------- what the laws do ----------
    function lawF(c, key) {
      const R = h.rule && h.rule.ruleOf(civs[c]); if (!R) return 1; let f = 1;
      for (const k of LAW_FIELDS) { const L = LAW[R.laws[k]]; if (L && L[key] !== undefined) f *= L[key]; }
      return f;
    }
    const lawOf = (c) => { const R = h.rule && h.rule.ruleOf(civs[c]); return R ? R.laws.faith : ''; };
    // how much a region of faith f weighs on a realm of faith s: nothing if one; a quarter where one of them is the old
    // ways; most of it for another church of the same faith; all of it for another faith
    const weight = (f, s) => (f === s ? 0 : !f || !s ? 0.25 : list[f].fam === list[s].fam ? 0.8 : 1);

    // ---------- a year ----------
    // (what a realm's laws, age and faith make of it, worked out every five years and whenever its faith changes: the year's
    // loop over the land only reads them)
    const conv = new Float32Array(MAXC), goal = new Uint16Array(MAXC), resist = new Float32Array(MAXC), eras = new Uint8Array(MAXC), hungry = new Float32Array(MAXC);
    function prep(c) {
      const cv = civs[c]; conv[c] = 0; if (!cv) return; const e = eras[c] = eraOf(cv), s = state[c], godless = lawOf(c) === 'godless';
      goal[c] = godless ? 0 : s; conv[c] = s || godless ? CONV[e] * lawF(c, 'conv') * (godless ? 1 : tf(s, 'conv')) * LAP : 0; resist[c] = lawF(c, 'resist');
      hungry[c] = h.living ? (h.living(c) < 0.45 ? 1 : 0) : 0;
    }
    function prepAll(yr) { for (let c = 0; c < MAXC; c++) { prep(c); if (missionTo[c] >= 0 && (missionUntil[c] < yr || !civs[missionTo[c]] || !civs[c])) missionTo[c] = -1; } }
    function step() {
      const t0 = performance.now(), yr = year(), k5 = ((yr % 5) + 5) % 5, kl = ((yr % LAP) + LAP) % LAP;
      if (k5 === 0 || !prepped) { prepAll(yr); prepped = true; }
      const P = h.people ? h.people.ppl : null;
      for (let k = kl; k < LI.length; k += LAP) {
        const i = LI[k]; if (!(pop[i] > 0.02)) continue;
        const o = owner[i], f = fth[i];
        if (holyCell[i] && f && list[f].home === i && !(o >= 0 && conv[o] > 0 && goal[o] === 0)) continue;      // (a holy city keeps its faith; only a godless state takes it away)
        // the state carries its faith (or, where faith is abolished, takes it away)
        if (o >= 0 && conv[o] > 0) { const g = goal[o]; if (g !== f) {
          const G = g ? list[g] : null; let p = conv[o] * (level[i] >= 2 ? 1.5 * (G ? G.k.town : 1) : level[i] ? 1.2 : 1) * ((special[i] & 4) ? 1.4 : 1) * (f ? 1 : 1.4);
          if (G) { if (P) p *= P[i] === G.people ? G.k.own : G.k.others; if (hungry[o]) p *= G.k.hungry; }
          // (beside regions that hold it already, faster: the neighbours are asked only when the dice could fall so)
          const r = rnd(); if (r < p) { let near = 0, of = 0; for (let q = 0; q < 8; q++) { const n = h.nbOf(i, q); if (n < 0 || owner[n] !== o) continue; of++; if (fth[n] === g) near++; }
            if (r < p * (0.4 + 0.6 * (of ? near / of : 0))) { fth[i] = g; stats.converted++; continue; } }
        } }
        // those who preach a faith carry it over from a neighbouring region (one of the eight, by the dice)
        const y = (i / W) | 0, r = (rnd() * 8) | 0, yy = y + (r < 3 ? -1 : r < 5 ? 0 : 1); if (yy < 0 || yy >= H) continue;
        const n = yy * W + ((i - y * W + (r === 0 || r === 3 || r === 5 ? -1 : r === 1 || r === 6 ? 0 : 1) + W) % W);
        const g = fth[n]; if (!g || g === f || !(pop[n] > 0.02)) continue;
        const G = list[g], on = owner[n], e = on >= 0 ? eras[on] : o >= 0 ? eras[o] : 0;
        const same = P && P[n] === P[i];
        let p = PREACH[e] * LAP * (G.world ? 1 : same ? 0.5 : 0.08) * G.k.preach * ((special[n] & 4) ? 1.5 : 1) * (level[n] >= 2 ? 1.2 : 1) * (f ? 1 : 1.5) * (P && P[i] === G.people ? G.k.own : G.k.others);
        if (o >= 0) {
          if (f && f === state[o]) p *= resist[o];      // (the realm's own faith holds as its laws hold it)
          if (goal[o] !== g && conv[o] > 0 && goal[o] === 0) p *= 0.3;      // (the godless state stops the preachers)
          if (on !== o) { p *= on >= 0 && h.atWar(o, on) ? 0.25 : 0.6; if (on >= 0 && missionTo[on] === o && state[on] === g) p *= 3; }
          if (hungry[o]) p *= G.k.hungry;
        }
        if (rnd() < p) { fth[i] = g; stats.preached++; }
      }
      if (k5 === 0) { const t1 = performance.now(); tally(yr); stats.msTally = performance.now() - t1; }
      if (((yr % 25) + 25) % 25 === 0) schisms(yr);
      stats.ms = performance.now() - t0;
    }
    // every five years: who holds what, what it costs, who takes up whose faith
    const SL = 8, slotF = new Uint16Array(MAXC * SL), slotP = new Float32Array(MAXC * SL), all = new Float64Array(MAXC), same = new Float64Array(MAXC), other = new Float64Array(MAXC);
    function shareIn(c, f) { if (!(all[c] > 0)) return 0; for (let q = 0; q < SL; q++) if (slotF[c * SL + q] === f) return slotP[c * SL + q] / all[c]; return 0; }
    function tally(yr) {
      for (const F of list) if (F) { F.n = 0; F.pop = 0; F.realms = 0; }
      slotF.fill(0); slotP.fill(0); all.fill(0); same.fill(0); other.fill(0);
      for (let k = 0; k < LI.length; k++) {
        const i = LI[k], f = fth[i], p = pop[i]; if (f) { const F = list[f]; F.n++; F.pop += p; }
        const o = owner[i]; if (o < 0 || !(p > 0)) continue; all[o] += p; const s = state[o];
        if (f === s) same[o] += p; else other[o] += p * weight(f, s);
        if (f) { const b = o * SL; for (let q = 0; q < SL; q++) { const x = slotF[b + q]; if (x === f) { slotP[b + q] += p; break; } if (!x) { slotF[b + q] = f; slotP[b + q] = p; break; } } }
      }
      for (const F of list) if (F && F.n > F.peak) F.peak = F.n;
      const links = h.links ? h.links() : null;
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; if (!cv) continue; const e = eras[c] = eraOf(cv), s = state[c];
        const A = all[c]; stateShare[c] = A > 0 ? same[c] / A : 1; otherShare[c] = A > 0 ? other[c] / A : 0; if (s) list[s].realms++;
        restless[c] = -RESTLESS[e] * (otherShare[c] * lawF(c, 'minor') * (s ? tf(s, 'minor') : 1) - NORM[e]); if (restless[c] > 0.02) restless[c] = 0.02;
        if (cv.player) continue;      // (the player's realm keeps its faith until he changes it: gov.js)
        // the faith most of its people have come to hold
        let b = 0, bp = 0; for (let q = 0; q < SL; q++) { const x = slotF[c * SL + q]; if (x && x !== s && slotP[c * SL + q] > bp) { bp = slotP[c * SL + q]; b = x; } }
        const bs = A > 0 ? bp / A : 0;
        if (b && !s && bs >= 0.35 && rnd() < 0.5) { adopt(c, b, 'people'); continue; }
        if (b && s && stateShare[c] < 0.25 && bs >= 0.6 && rnd() < (lawOf(c) === 'orthodoxy' ? 0.03 : 0.15)) { adopt(c, b, 'turned'); continue; }
        // the faith of a neighbour: a ruler of the old ways readily, one who keeps his people's faith now and then turns to one for all peoples
        if (!s || !list[s].world) {
          const nb = h.near(c); if (nb) for (const b2 of nb) {
            const g = state[b2]; if (!g || g === s || !civs[b2]) continue; const G = list[g]; if (s && !G.world) continue;
            const p = ADOPT[e] * (G.world ? 1 : 0.35) * (s ? 0.5 : 1) * tf(g, 'adopt') * (1 + 3 * shareIn(c, g)) * (missionTo[b2] === c ? 2.5 : 1);
            if (rnd() < p) { adopt(c, g, 'neighbour', b2); break; }
          }
          if (state[c] !== s) continue;
        }
        // a vassal comes to its lord's faith
        const lord = h.lordOf ? h.lordOf(cv) : -1; if (lord >= 0 && civs[lord] && state[lord] && state[lord] !== s && list[state[lord]].world && rnd() < 0.04) { adopt(c, state[lord], 'lord', lord); continue; }
      }
      // the merchants of a faith for all peoples carry it to their partners' harbours (a realm with many partners spreads
      // what it sends among them)
      if (links && links.length) {
        const deg = new Uint16Array(MAXC); for (const L of links) { deg[L.a]++; deg[L.b]++; }
        for (const L of links) for (let d = 0; d < 2; d++) {
          const a = d ? L.b : L.a, bb = d ? L.a : L.b; const g = state[a], cv = civs[a], bv = civs[bb]; if (!g || !cv || !bv || !list[g].world || state[bb] === g) continue;
          if (rnd() >= MISSION[eras[a]] * tf(g, 'preach') * (missionTo[a] === bb ? 3 : 1) / Math.max(1, deg[a] / 3)) continue;
          const at = h.harbour ? h.harbour(bb, rnd()) : bv.capital; if (at < 0 || !(pop[at] > 0.02) || holyAt.has(at) || fth[at] === g) continue;
          if (fth[at] && fth[at] === state[bb] && rnd() > resist[bb] * 0.6) continue;      // (a realm's own faith keeps its harbours as its laws keep them)
          fth[at] = g; stats.missions++;
        }
      }
      // faiths nobody holds any more
      for (const F of list) if (F && !F.gone && F.n === 0 && F.realms === 0 && yr - F.born > 30) { F.gone = yr; if (holyAt.get(F.home) === F.id) { holyAt.delete(F.home); holyCell[F.home] = 0; } if (F.peak >= 20) news.push({ kind: 'gone', f: F.id, year: yr }); }
    }
    function adopt(c, g, why, from) {
      const cv = civs[c]; if (!cv || !list[g]) return; const was = state[c]; setState(c, g); pending[c] = -1;
      const cp = cv.capital; if (cp >= 0 && pop[cp] > 0 && fth[cp] !== g && !holyAt.has(cp)) fth[cp] = g;
      if (why === 'turned') stats.turned++; else stats.adopted++;
      news.push({ kind: why === 'turned' ? 'turned' : 'adopt', c, f: g, was, from: from ?? -1, why, year: year() });
    }
    // every twenty-five years: churches that break away, and teachings for all peoples out of a people's faith
    function schisms(yr) {
      for (const F of list) {
        if (!F || F.gone || F.n < 30 || yr - F.born < 300) continue;
        let best = -1, bd = 0;
        for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv || cv.player || state[c] !== F.id || cv.capital < 0 || owner[F.home] === c) continue; const d = h.cellDist(cv.capital, F.home); if (d > bd) { bd = d; best = c; } }
        if (best < 0) continue; const e = eras[best], D = SPLIT[e]; if (bd < D) continue;
        const p = Math.min(0.35, (bd / D - 1) * 0.35) * (h.knows(best, 'printing') ? 2 : 1) * (lawOf(best) === 'orthodoxy' ? 0.5 : 1) * tf(F.id, 'split') * Math.min(1, (h.cellsOf[best] || 0) / 30);
        if (rnd() < p) split(F.id, best, yr, false);
      }
      // (rarely: the world has had a handful of them, and the more there are already, the fewer new ones come)
      const fams = new Set(); for (const F of list) if (F && !F.gone && F.world && F.n > 0) fams.add(F.fam); let worlds = fams.size;
      const pw = 0.05 * Math.max(0, 1 - worlds / 5); if (pw > 0) for (const F of list) {
        if (!F || F.gone || F.world || F.n < 40 || yr - F.born < 300 || rnd() >= pw) continue;
        let best = -1, bn = 0; for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv || cv.player || state[c] !== F.id || cv.capital < 0 || !h.knows(c, 'scripture')) continue; const n = h.cellsOf[c] || 0; if (n > bn) { bn = n; best = c; } }
        if (best >= 0) { split(F.id, best, yr, true); worlds++; }
      }
    }
    function split(f, c, yr, world) {
      const F = list[f], cv = civs[c]; const nm = world ? freshName(cv.capital, cv, true) : sectName(F, cv);
      const tenets = world ? chooseTenets(cv, true) : (rnd() < 0.5 ? F.tenets.slice() : [F.tenets[0], chooseTenets(cv, F.world).find((k) => k !== F.tenets[0])]);
      const id = make({ name: nm.name, base: nm.base, world: world || F.world, parent: f, newFam: world, home: cv.capital, founder: c, tenets }); if (!id) return 0;
      // (a church that breaks away takes its flock with it; a new teaching has the court, and the state carries it from there)
      if (!world) for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] === c && fth[i] === f && !holyAt.has(i)) fth[i] = id; }
      fth[cv.capital] = id; setState(c, id);
      if (world) stats.worlds++; else stats.split++;
      news.push({ kind: world ? 'world' : 'split', c, f: id, from: f, year: yr });
      // (those near it who keep the old church may follow it: whose realm, his faith)
      if (!world) for (let b = 0; b < MAXC; b++) {
        const bv = civs[b]; if (!bv || b === c || bv.player || state[b] !== f || bv.capital < 0 || owner[F.home] === b || h.cellDist(bv.capital, cv.capital) > 12 || rnd() >= 0.3) continue;
        for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] === b && fth[i] === f && !holyAt.has(i)) fth[i] = id; }
        setState(b, id); news.push({ kind: 'follow', c: b, f: id, lead: c, year: yr });
      }
      return id;
    }

    // ---------- what the player does (gov.js) ----------
    // found a faith: where a prophet has arisen (free), or by the realm's own priests (it costs authority: the caller pays)
    function playerFound(c, tenets, name) {
      const cv = civs[c]; if (!cv) return 'No realm'; if (state[c]) return 'Your realm has a faith';
      if (!tenets || tenets.length !== 2 || tenets[0] === tenets[1] || !TK[tenets[0]] || !TK[tenets[1]]) return 'Choose two tenets';
      const at = pending[c] >= 0 && owner[pending[c]] === c ? pending[c] : cv.capital;
      const id = found(c, at, { tenets, name: name && !taken(name) ? name : undefined, why: 'founded' }); return id ? null : 'No faith can be founded now';
    }
    // a name for a faith the player is about to found, in the tongue of its holy city
    function suggest(c) { const cv = civs[c]; if (!cv) return ''; const at = pending[c] >= 0 ? pending[c] : cv.capital; return freshName(at, cv, h.knows(c, 'scripture')).name; }
    // take up another faith as the realm's
    function playerAdopt(c, f) { const cv = civs[c]; if (!cv || !list[f] || list[f].gone) return 'No such faith'; if (state[c] === f) return 'It is your faith already'; adopt(c, f, 'chosen'); return null; }
    // a church of the realm's own, broken from the faith it keeps (its people with it)
    function playerChurch(c) { const cv = civs[c]; const f = state[c]; if (!cv || !f || cv.capital < 0) return 'Your realm has no faith to break with'; return split(f, c, year(), false) ? null : 'No church can be founded now'; }
    // send missionaries to a realm: for two turns its people hear them three times as often, its ruler twice as readily
    function sendMission(c, to, years) { if (!civs[c] || !civs[to] || c === to) return 'No such realm'; if (!state[c] || !list[state[c]].world) return 'Only a faith for all peoples sends missionaries'; missionTo[c] = to; missionUntil[c] = year() + years; return null; }

    // ---------- what the simulation asks ----------
    const unrest = (cv) => restless[cv.id];
    const faithOf = (cv) => (cv ? state[cv.id] : 0);
    const kin = (a, b) => { const fa = state[a.id], fb = state[b.id]; return !!(fa && fb && fa !== fb && list[fa].fam === list[fb].fam); };
    // the realm that holds the holy city of a's faith, if it keeps another faith (or -1)
    function holyHeld(a) { const f = state[a.id]; if (!f) return -1; const o = owner[list[f].home]; return o >= 0 && o !== a.id && civs[o] && state[o] !== f ? o : -1; }
    // the share of each faith in a realm, the largest first: [[faith, share], ...] (0: the old ways)
    function faithsOf(c, max) {
      const m = new Map(); let A = 0; for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] !== c) continue; A += pop[i]; m.set(fth[i], (m.get(fth[i]) || 0) + pop[i]); }
      return [...m].sort((a, b) => b[1] - a[1]).slice(0, max || 6).map(([f, v]) => [f, A > 0 ? v / A : 0]);
    }
    function lineage(f) { const out = []; let q = list[f]; while (q && out.length < 12) { out.push(q.id); q = q.parent ? list[q.parent] : null; } return out; }
    const rgbOf = (f) => { const F = list[f]; if (!F) return [0.5, 0.5, 0.5]; return hsl(F.hue, F.sat, F.lit); };
    function hsl(hh, s, l) { const f = (n) => { const k = (n + hh * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; }

    // ---------- saved with the world ----------
    function save() {
      const runs = []; let cur = fth[0], n = 0; for (let i = 0; i < N; i++) { if (fth[i] === cur) n++; else { runs.push(cur, n); cur = fth[i]; n = 1; } } runs.push(cur, n);
      const pend = [], mis = []; for (let c = 0; c < MAXC; c++) { if (pending[c] >= 0) pend.push(c, pending[c], pendingAt[c]); if (missionTo[c] >= 0) mis.push(c, missionTo[c], missionUntil[c]); }
      return { v: 1, rs, l: list.slice(1).map((F) => [F.name, F.base, F.world ? 1 : 0, F.parent, F.fam, F.born, F.home, F.founder, F.tenets.join(','), +F.hue.toFixed(4), +F.sat.toFixed(3), +F.lit.toFixed(3), F.peak, F.gone, F.people]), map: runs, s: Array.from(state), pend, mis };
    }
    function load(s) {
      list.length = 1; fth.fill(0); state.fill(0); holyAt.clear(); holyCell.fill(0); pending.fill(-1); missionTo.fill(-1); restless.fill(0); otherShare.fill(0); stateShare.fill(1); prepped = false;
      if (!s || !s.l) return false;
      if (s.rs !== undefined) rs = s.rs >>> 0;
      s.l.forEach((q, k) => { const F = { id: k + 1, name: q[0], base: q[1], world: !!q[2], parent: q[3], fam: q[4], born: q[5], home: q[6], founder: q[7], tenets: q[8] ? q[8].split(',') : [], hue: q[9], sat: q[10], lit: q[11], peak: q[12] || 0, gone: q[13] || 0, people: q[14] || 0, n: 0, pop: 0, realms: 0 }; factors(F); list.push(F); if (!F.gone) { holyAt.set(F.home, F.id); holyCell[F.home] = 1; } });
      let i = 0; for (let k = 0; k < s.map.length; k += 2) { const f = s.map[k], n = s.map[k + 1]; fth.fill(f, i, Math.min(N, i + n)); i += n; }
      if (s.s) for (let c = 0; c < Math.min(MAXC, s.s.length); c++) { state[c] = s.s[c]; if (civs[c]) civs[c].religion = state[c] && list[state[c]] ? list[state[c]].name : null; }
      if (s.pend) for (let k = 0; k < s.pend.length; k += 3) { pending[s.pend[k]] = s.pend[k + 1]; pendingAt[s.pend[k]] = s.pend[k + 2]; }
      if (s.mis) for (let k = 0; k < s.mis.length; k += 3) { missionTo[s.mis[k]] = s.mis[k + 1]; missionUntil[s.mis[k]] = s.mis[k + 2]; }
      for (let k = 0; k < LI.length; k++) { const i = LI[k], F = list[fth[i]]; if (F) { F.n++; F.pop += pop[i]; } }      // (how many keep each faith, for the key and the pages until the next count)
      return true;
    }
    // a world saved before faiths had regions: every faith by its name, its holy city the capital of the first realm that
    // keeps it, and every realm's land of its realm's faith
    function settle() {
      list.length = 1; fth.fill(0); state.fill(0); holyAt.clear(); holyCell.fill(0); prepped = false; const byName = new Map();
      for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv || !cv.religion) continue; let id = byName.get(cv.religion);
        if (!id) { const at = cv.capital >= 0 ? cv.capital : cv.home; id = make({ name: cv.religion, base: '', world: h.knows(c, 'scripture'), home: at, founder: c, tenets: chooseTenets(cv, h.knows(c, 'scripture')) }); byName.set(cv.religion, id); }
        state[c] = id; }
      for (let k = 0; k < LI.length; k++) { const i = LI[k], o = owner[i]; if (o >= 0 && civs[o] && state[o]) fth[i] = state[o]; }
    }

    return { fth, state, list, stats, news, pending, missionTo, missionUntil, stateShare, otherShare, restless, holyAt, step, found, prophet, born, claimed, gone, adopt, playerFound, playerAdopt, playerChurch, sendMission, suggest,
      unrest, faithOf, kin, holyHeld, faithsOf, lineage, rgbOf, nameOf, shortOf, lawF, tf, tsum, has, weight, save, load, settle, LAW, TENETS, TK };
  }

  window.FAITH = { create, CONV, PREACH, ADOPT, MISSION, RESTLESS, NORM, SPLIT, TENETS, LAW };
})();
