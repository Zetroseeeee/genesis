// GENESIS culture: great people, their great works, a realm's renown and its golden ages. Pure data, no drawing (the
// Culture screen is works.js; the lens of renown is world.js's palette and main.js's key). Classic script; exposes
// window.CULTURE.
//
// Every realm works towards its next great person (prog): its towns, temples, academies, markets and wonders, as its laws
// of learning, speech and faith let people think and say things, its steadiness, its patronage and a golden age make it;
// a great person is born when the work reaches the next threshold, which rises with the great people it has had lately
// (its memory of them halves in four turns: a realm that has had many must do more for the next). What kind - poet,
// artist, master builder, sage, playwright, historian, composer, novelist, filmmaker - stands on what the realm knows and
// leans to what it has (temples make poets and artists, academies sages and historians, markets playwrights and
// novelists, wonders builders). A great person lives some decades and makes up to three works, named in the tongue of his
// people, and each brings his realm something: a sage's work insight, the arts' authority (a realm's glory sung is its
// ruler's free hand), and while a master builder lives the realm's works cost less. A work stays in the city where it was
// made, and whoever holds the city holds the work: a conqueror carries off a realm's renown with its cities, and a sacked
// city may lose its works for ever. A lesser work is forgotten six turns after it was made; a masterpiece never is. A
// realm's renown is what it holds (and its wonders). Four great people born within two turns to a steady realm make a
// golden age: three turns in which great people come almost twice as often and the realm is steadier.
// Everything is paced by the turn (rule.js's PACE), so that what a realm sees of it in a turn is alike in every age.
// What it does to a realm, measured against the age (as knowledge, rule, peoples and faiths are, so that the world's
// numbers stay where they were fitted): a realm whose renown is above the usual for its age is steadier for it (pride),
// one below a little less so; its own people take in others faster (people.js asks: pull), or slower; diplomacy: realms
// of little renown admire one of great renown. The module throws its own dice.
(function () {
  'use strict';
  // a turn of each age, in years (rule.js's PACE)
  const TURN = (window.RULE && window.RULE.PACE) || [200, 100, 50, 50, 40, 20, 10, 5, 5];
  // a realm's work towards its next great person, a year, by age, for each town (an academy counts as three towns, a temple
  // or a market as two, a wonder as five); tools/culture/probe.js shows what the great realms of each age bring forth in a turn
  const PACE = [0, 0.000077, 0.00029, 0.000175, 0.00019, 0.00058, 0.001, 0.00175, 0.0017];
  // the renown of the usual realm of each age (tools/culture/probe.js --write measures it: the mean of the logarithm over
  // realms, weighted by the square root of their people, so that as many realms are above it as below and pride sums to nought)
  // NORM-BEGIN
  const NORM = [0, 2.4, 19.4, 29.1, 39.7, 54.9, 60.5, 64.8, 57.5];
  // NORM-END
  // the kinds of great people: the discovery each stands on, what in a realm makes them (temple, academy, market, wonder,
  // town: weights), what a work of theirs is worth, what it brings the realm, and how their works are named ({P} a person,
  // {Q} another, {C} a city, {V} a virtue, {R} the realm, {A} an adjective, {N} a number)
  const KINDS = [
    { key: 'artist', name: 'Artist', need: 'masonry', w: { temple: 2, wonder: 1, town: 0.4 }, value: 2, boon: 'auth', later: 'Painter', early: 'Sculptor', switch: 5,
      works: ['The {A} Goddess', 'The Frescoes of {C}', 'The Kouros of {C}', 'The Lion of {C}', 'Portrait of {P}', 'The {A} Garden', 'The Hunt of {P}', 'The Dance at {C}'] },
    { key: 'builder', name: 'Master builder', need: 'masonry', w: { wonder: 3, temple: 0.6, town: 0.3 }, value: 3, boon: 'build',
      works: ['The Great Gate of {C}', 'The Hall of {P}', 'The Bridge at {C}', 'The Dome of {C}', 'The Tower of {P}', 'The {A} Stair of {C}', 'The Colonnade of {C}'] },
    { key: 'poet', name: 'Poet', need: 'epics', w: { temple: 1.5, town: 0.5, academy: 0.5 }, value: 3, boon: 'auth',
      works: ['The Song of {P}', 'The Lament for {C}', 'Hymns of {C}', '{P} and {Q}', 'The Book of {P}', 'The Return of {P}', 'Odes to {V}', 'The {A} Year'] },
    { key: 'sage', name: 'Sage', need: 'philosophy', w: { academy: 2.5, temple: 0.4 }, value: 4, boon: 'insight',
      works: ['On {V}', 'The {C} Dialogues', 'Sayings of {P}', 'On the Nature of {V}', 'The Letters of {P}', 'Of {V} and {V2}', 'The Questions of {P}'] },
    { key: 'playwright', name: 'Playwright', need: 'letters', w: { market: 1.5, town: 0.5, academy: 0.5 }, value: 3, boon: 'auth',
      works: ['{P} at {C}', 'The Fall of {C}', 'The {A} Wife', 'The Brothers of {C}', '{P} the King', 'The Feast of {P}', 'The Wasps of {C}'] },
    { key: 'historian', name: 'Historian', need: 'letters', w: { academy: 1.5, town: 0.3 }, value: 3, boon: 'auth',
      works: ['The Histories of {R}', 'The Annals of {C}', 'The Wars of {R}', 'The Lives of the Kings', 'The Chronicle of {C}', 'The Deeds of {P}'] },
    { key: 'composer', name: 'Composer', need: 'humanism', w: { market: 1, temple: 1, academy: 1 }, value: 4, boon: 'auth',
      works: ['Mass for {C}', 'The {A} Symphony', 'Requiem for {P}', '{P}: an Opera', 'Symphony No. {N}', 'The {C} Concertos', 'Variations on a Song of {C}'] },
    { key: 'novelist', name: 'Novelist', need: 'press', w: { market: 1.5, academy: 1, town: 0.4 }, value: 3, boon: 'auth',
      works: ['{P} and {Q}', 'The House of {P}', 'A {A} Season', 'The Children of {C}', 'Letters from {C}', 'The Last Days of {C}', '{P}'] },
    { key: 'film', name: 'Filmmaker', need: 'broadcast', w: { market: 1.5, town: 0.6 }, value: 3, boon: 'auth',
      works: ['Night over {C}', 'The {A} Road', '{P}', 'The Bridge at {C}', 'Sunrise in {C}', 'The Long Summer'] },
  ];
  const KK = {}; KINDS.forEach((K, k) => { K.id = k; KK[K.key] = K; });
  const BUILDER = KK.builder.id;
  const VIRTUES = ['Justice', 'Courage', 'the Soul', 'Friendship', 'the State', 'Nature', 'Time', 'the Gods', 'Memory', 'Love', 'Death', 'Wisdom', 'Order', 'Liberty', 'the Good', 'Beauty'];
  const ADJ = ['Golden', 'Silent', 'Bright', 'Wandering', 'Last', 'Long', 'Red', 'Bitter', 'Hidden', 'Northern', 'Crimson', 'Pale', 'Glorious', 'Quiet', 'Burning', 'Wise'];
  // laws (rule.js, by key): how readily people think and say things, and so how readily great people come
  const LAW = {
    oral: 0.8, scribal: 1, academies: 1.25, cloister: 1.05, universities: 1.3, schooling: 1.2, research: 1.15,
    elders: 0.9, majesty: 0.95, assembly: 1.2, censor: 0.8, press: 1.25, line: 0.7, opennet: 1.25, wallednet: 0.85,
    orthodoxy: 0.85, tolerance: 1.1, secular: 1.05, godless: 0.9,
  };
  const LAW_FIELDS = ['learning', 'speech', 'faith'];
  // patronage: how much faster a realm's great people come at each level (none, the common, generous, lavish), and what the
  // player's levels above the common one cost him a year (a share of his income); a ruler of the autopilot gives by his leaning
  const PATRON = [0.6, 1, 1.6, 2.4], PATRON_COST = [0, 0, 0.08, 0.2];
  const LEAN = { scholar: 2, builder: 2, pious: 1, merchant: 1, steward: 1, navigator: 1, conqueror: 1, tyrant: 0 };
  const MEM = 4;            // (turns in which a realm's memory of the great people it has had halves)
  const GOLD = { need: 4, win: 2, len: 3, rest: 4, boost: 1.8, stab: 0.6, fall: 0.35 };      // (four born within two turns to a realm this steady; three turns; none again within four of its end)
  const MASTER = 7;         // (a work worth this much is a masterpiece, and is never forgotten)
  const FORGET = 6;         // (turns after which a lesser work is forgotten)
  const BOON = { insight: 25, auth: 50 };      // (a work brings its realm value / BOON turns of what it gathers: insight for a sage's, authority for the arts')
  const BUILD = 0.08;       // (a master builder living makes the realm's works this much cheaper; two, twice)
  const MAXW = 6000, MAXP = 5000;
  const yrs = (e, turns, lo, hi) => Math.max(lo, Math.min(hi, turns * TURN[e]));
  const winY = (e) => yrs(e, GOLD.win, 10, 200), lenY = (e) => yrs(e, GOLD.len, 15, 150), restY = (e) => yrs(e, GOLD.rest, 20, 1e9), forgetY = (e) => yrs(e, FORGET, 30, 1e9);

  function create(h) {
    const { owner, civs, MAXC } = h;
    const year = () => h.year();
    const prog = new Float32Array(MAXC);         // each realm's work towards its next great person
    const had = new Float32Array(MAXC);          // the great people it has had lately (its memory of them halves in MEM turns)
    const born = new Uint16Array(MAXC);          // how many it has had in all
    const golden = new Float64Array(MAXC).fill(-1e9);      // until when its golden age lasts (or when the last one ended)
    const renown = new Float32Array(MAXC);       // what it holds, counted every five years
    const lately = new Uint8Array(MAXC);         // its great people born within the last two turns
    const bld = new Uint8Array(MAXC);            // its master builders living
    const greats = [];                           // { id, name, kind, era, born, dies, c, of, at, next, fame, works: [ids], made, asked }
    const alive = [];                            // (those of them living)
    const works = [];                            // { id, name, kind, by, year, era, at, c, held, lost, value }
    let nextGp = 1, nextWk = 1;
    const stats = { born: 0, works: 0, lost: 0, golden: 0, forgot: 0, insight: 0, auth: 0, ms: 0 };
    const news = [];

    // ---------- the module's own dice ----------
    let rs = ((h.seed || 1) ^ 0x1f83d9ab) >>> 0;
    const rnd = () => { rs += 0x6D2B79F5; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const eraOf = (cv) => Math.min(8, Math.max(0, cv ? cv.era | 0 : 0));

    // ---------- names ----------
    // a great person is named in the tongue of the people of the city he was born in (people.js)
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    function tongueAt(cell, cv) {
      const P = h.people; if (P) { const p = P.list[P.ppl[cell] || (cv ? P.ruling[cv.id] : 0)]; if (p && p.t) return p.t; }
      const S = h.STYLES[cv ? cv.style : 0] || h.STYLES[0]; return S.syl ? { syl: S.syl } : { on: S.on, vow: S.vow, end: S.end };
    }
    function nameIn(t, minS, maxS) {
      const n = minS + Math.floor(rnd() * (maxS - minS + 1));
      if (t.syl) { let s = ''; for (let i = 0; i < n; i++) s += pick(t.syl); return cap(s); }
      let s = ''; for (let i = 0; i < n; i++) s += pick(t.on) + pick(t.vow);
      s += rnd() < 0.85 ? pick(t.end) : pick(t.on);
      return cap(s.replace(/(.)\1\1/g, '$1$1'));
    }
    const city = (cell) => (cell >= 0 && h.cellName.get(cell)) || 'the city';
    function workName(K, gp, cv) {
      const t = tongueAt(gp.at, cv); const tpl = pick(K.works);
      return tpl.replace('{P}', nameIn(t, 2, 3)).replace('{Q}', nameIn(t, 2, 3)).replace('{C}', city(gp.at)).replace('{V2}', pick(VIRTUES)).replace('{V}', pick(VIRTUES)).replace('{A}', pick(ADJ))
        .replace('{R}', cv ? cv.name : 'the Realm').replace('{N}', String(2 + Math.floor(rnd() * 8)));
    }
    const kindName = (gp) => { const K = KINDS[gp.kind]; return K.later && gp.era >= K.switch ? K.later : K.early || K.name; };

    // ---------- what the laws and the realm make of it ----------
    function lawF(c) { const R = h.rule && h.rule.ruleOf(civs[c]); if (!R) return 1; let f = 1; for (const k of LAW_FIELDS) { const v = LAW[R.laws[k]]; if (v) f *= v; } return f; }
    const isGolden = (c) => golden[c] >= year();
    const patronOf = (cv) => (cv.player ? (cv.patron === undefined ? 1 : cv.patron) : (LEAN[h.trait ? h.trait(cv) : ''] ?? 1));
    // what the realm has that makes great people (an academy counts as three towns, a temple or a market as two, a wonder as five)
    const pointsOf = (c) => h.townsOf[c] + 3 * h.acad[c] + 2 * h.temples[c] + 2 * h.markets[c] + 5 * h.wonders[c];
    // the work a realm does towards its next great person in a year
    function pace(c) {
      const cv = civs[c]; if (!cv) return 0; const e = eraOf(cv); if (!PACE[e] || !h.knows(c, 'masonry')) return 0;
      return PACE[e] * pointsOf(c) * lawF(c) * (0.5 + cv.stability) * (isGolden(c) ? GOLD.boost : 1) * PATRON[patronOf(cv)];
    }
    const threshold = (c) => 1 + 0.25 * Math.pow(had[c], 0.7);
    // what kind of great person a realm brings forth: what it knows, and what it has
    function kindFor(c) {
      const ws = []; let sum = 0;
      for (const K of KINDS) { if (!h.knows(c, K.need)) { ws.push(0); continue; } const v = 0.2 + (K.w.temple || 0) * Math.min(4, h.temples[c]) + (K.w.academy || 0) * Math.min(4, h.acad[c]) + (K.w.market || 0) * Math.min(4, h.markets[c]) + (K.w.wonder || 0) * Math.min(3, h.wonders[c]) + (K.w.town || 0) * Math.min(6, h.townsOf[c] / 4); ws.push(v); sum += v; }
      if (!(sum > 0)) return -1; let r = rnd() * sum; for (let k = 0; k < ws.length; k++) { r -= ws[k]; if (r <= 0 && ws[k] > 0) return k; } return ws.findIndex((v) => v > 0);
    }

    // ---------- birth, works and death ----------
    function bear(c) {
      const cv = civs[c]; const k = kindFor(c); if (k < 0) return null;
      // (in the capital as often as not; else in a town of the realm)
      let at = cv.capital; if (rnd() > 0.4 && h.townOf) { const t = h.townOf(c); if (t >= 0) at = t; } if (at < 0) return null;
      const fame = Math.min(3, 0.5 + -Math.log(1 - rnd() * 0.98) * 0.6);      // (most are good, a few are great)
      const gp = { id: nextGp++, name: nameIn(tongueAt(at, cv), 2, 3), kind: k, era: eraOf(cv), born: year(), dies: year() + 28 + Math.floor(rnd() * 26), c, of: h.realmName ? h.realmName(cv) : cv.name, at, next: year() + 4 + Math.floor(rnd() * 10), fame: Math.round(fame * 100) / 100, works: [], made: 0, asked: 0 };
      greats.push(gp); alive.push(gp); born[c]++; had[c] += 1; stats.born++; if (k === BUILDER && bld[c] < 255) bld[c]++; if (lately[c] < 255) lately[c]++;
      news.push({ kind: 'born', gp: gp.id, c, year: year() });
      return gp;
    }
    function make(gp, commissioned) {
      const cv = civs[gp.c]; if (!cv) return null; const K = KINDS[gp.kind]; const e = eraOf(cv);
      const at = owner[gp.at] === gp.c ? gp.at : cv.capital; if (at < 0) return null;
      const wk = { id: nextWk++, name: workName(K, gp, cv), kind: gp.kind, by: gp.id, year: year(), era: e, at, c: gp.c, held: gp.c, lost: 0, value: Math.round(K.value * gp.fame * (0.7 + rnd() * 0.6) * 10) / 10 };
      works.push(wk); gp.works.push(wk.id); gp.made++; stats.works++; renown[gp.c] += wk.value;
      // what it brings the realm: a sage's work insight, the arts' authority (in turns of what the realm gathers of them)
      let boon = 0; if (K.boon === 'insight' && h.inspire) boon = h.inspire(gp.c, TURN[e] * wk.value / BOON.insight); else if (K.boon === 'auth' && h.acclaim) boon = h.acclaim(gp.c, wk.value / BOON.auth); if (boon > 0) stats[K.boon] += boon;
      news.push({ kind: 'work', wk: wk.id, gp: gp.id, c: gp.c, commissioned: !!commissioned, boon, what: K.boon, year: year() });
      return wk;
    }

    // ---------- a year ----------
    function step() {
      const t0 = performance.now(), yr = year();
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; if (!cv) continue;
        // (the player's patronage above the common is paid out of his income)
        if (cv.player && cv.patron > 1) cv.wealth -= Math.max(0, cv.income || 0) * PATRON_COST[cv.patron];
        const p = pace(c); if (!(p > 0)) continue;
        prog[c] += p; const T = threshold(c); if (prog[c] >= T) { prog[c] -= T; bear(c); }
      }
      // the living make their works; the dead are dead
      let k = 0;
      for (let j = 0; j < alive.length; j++) {
        const gp = alive[j]; if (gp.dies < yr || gp.c < 0 || !civs[gp.c]) continue;
        alive[k++] = gp;
        if (gp.next <= yr) { if (gp.made < 3) make(gp, false); gp.next = yr + 8 + Math.floor(rnd() * 14); }
      }
      alive.length = k;
      if (((yr % 5) + 5) % 5 === 0) tally(yr);
      stats.ms = performance.now() - t0;
    }
    // every five years: what is forgotten, who holds what, the golden ages
    function tally(yr) {
      forget(yr); count(yr);
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; if (!cv) continue; const e = eraOf(cv);
        had[c] *= Math.pow(0.5, 5 / (MEM * TURN[e]));
        if (golden[c] >= yr) { if (cv.stability < GOLD.fall) { golden[c] = yr - 1; news.push({ kind: 'goldenEnd', c, year: yr }); } continue; }
        if (lately[c] >= GOLD.need && cv.stability >= GOLD.stab && yr > golden[c] + restY(e)) { golden[c] = yr + lenY(e); stats.golden++; news.push({ kind: 'golden', c, year: yr }); }
      }
    }
    // who holds what (and what it is worth), who was born lately, who builds
    function count(yr) {
      renown.fill(0); lately.fill(0); bld.fill(0);
      for (const w of works) { if (w.lost) continue; const o = owner[w.at]; w.held = o >= 0 && civs[o] ? o : -1; if (w.held >= 0) renown[w.held] += w.value; }
      for (const g of greats) { if (g.c < 0 || !civs[g.c]) continue; if (yr - g.born <= winY(eraOf(civs[g.c])) && lately[g.c] < 255) lately[g.c]++; if (g.kind === BUILDER && g.dies >= yr && bld[g.c] < 255) bld[g.c]++; }
      for (let c = 0; c < MAXC; c++) if (civs[c]) renown[c] += 4 * (h.wonders[c] || 0);
    }
    // a lesser work is forgotten six turns after it was made (a lost one at once); a masterpiece never is; the dead are
    // forgotten with their works, six turns after their death
    function forget(yr) {
      let k = 0; for (const w of works) { if (w.value >= MASTER || (!w.lost && yr - w.year <= forgetY(w.era))) works[k++] = w; else stats.forgot++; } works.length = k;
      if (works.length > MAXW) { works.sort((a, b) => (b.value - a.value) || (b.year - a.year)); works.length = MAXW; works.sort((a, b) => a.id - b.id); }
      const keep = new Set(); for (const w of works) keep.add(w.by);
      k = 0; for (const g of greats) { if (g.dies >= yr || keep.has(g.id) || yr - g.dies <= forgetY(g.era)) greats[k++] = g; } greats.length = k;
      if (greats.length > MAXP) greats.splice(0, greats.length - MAXP);
    }
    // a city is sacked: each of its works may be lost for ever (the sim asks when it sacks one)
    function sacked(cell, by) {
      for (const w of works) { if (w.lost || w.at !== cell || rnd() > 0.3) continue; w.lost = year(); stats.lost++; news.push({ kind: 'lost', wk: w.id, c: by ? by.id : -1, year: year() }); }
    }
    // a realm is gone: its great people work no longer, and what was its own is held by whoever holds its cities (its number
    // may be given to a new realm: nothing of the old one must pass to it)
    function gone(c) {
      const yr = year(); prog[c] = 0; had[c] = 0; born[c] = 0; golden[c] = -1e9; renown[c] = 0; lately[c] = 0; bld[c] = 0;
      for (const g of greats) if (g.c === c) { g.c = -1; if (g.dies > yr) g.dies = yr; }
      for (const w of works) if (w.c === c) w.c = -1;
    }
    function bornCiv(c) { prog[c] = 0; had[c] = 0; born[c] = 0; golden[c] = -1e9; renown[c] = 0; lately[c] = 0; bld[c] = 0; }

    // ---------- what the simulation asks ----------
    const rel = (c) => { const cv = civs[c]; if (!cv) return 1; return (renown[c] + 1) / (NORM[eraOf(cv)] + 1); };
    // pride: steadier for renown above the usual for the age, less so for less (and a golden age lifts it)
    function unrest(cv) { const r = Math.log2(rel(cv.id)) / 3; return 0.03 * Math.max(-1, Math.min(1, r)) + (isGolden(cv.id) ? 0.02 : 0); }
    // its own people take others in faster, or slower (people.js)
    const pull = (c) => Math.pow(Math.max(0.5, Math.min(4, rel(c))), 0.2);
    // a master builder living makes the realm's works cheaper (sim.js: buildCost)
    const buildF = (c) => 1 - BUILD * Math.min(2, bld[c]);
    // the great people of a realm living now, and those it has had; the works it holds now (and those made by it that others
    // hold, or that are lost)
    const livingOf = (c) => alive.filter((g) => g.c === c && g.dies >= year());
    const greatsOf = (c) => greats.filter((g) => g.c === c);
    const heldBy = (c) => works.filter((w) => !w.lost && w.held === c);
    const madeBy = (c) => works.filter((w) => w.c === c);
    const workOf = (id) => works.find((w) => w.id === id) || null;
    const greatOf = (id) => greats.find((g) => g.id === id) || null;
    // what a golden age asks, and how near a realm is to one (the Culture screen)
    function goldenNeed(c) { const cv = civs[c]; const e = eraOf(cv); return { need: GOLD.need, have: lately[c], win: winY(e), len: lenY(e), stab: GOLD.stab, until: golden[c], rest: golden[c] > -1e8 && golden[c] < year() ? golden[c] + restY(e) : -1e9 }; }

    // ---------- what the player does (works.js) ----------
    function setPatron(c, lvl) { const cv = civs[c]; if (!cv) return 'No realm'; cv.patron = Math.max(0, Math.min(3, lvl | 0)); return null; }
    const commissionCost = (cv) => Math.round(80 + 60 * eraOf(cv));
    function commission(c, gpId) {
      const cv = civs[c], gp = greatOf(gpId); if (!cv || !gp || gp.c !== c || gp.dies < year()) return 'Nobody to ask'; if (gp.made >= 3) return `${gp.name} has made all there is in him`;
      const wait = Math.max(5, TURN[eraOf(cv)]); if (gp.asked && year() - gp.asked < wait) return 'Asked too lately: give it a turn'; const cost = commissionCost(cv); if (cv.wealth < cost) return `Needs ${cost} coin`;
      cv.wealth -= cost; gp.asked = year(); const w = make(gp, true); return w ? null : 'Nothing was made';
    }

    // ---------- saved with the world ----------
    function save() {
      const yr = year(); const g = greats.map((x) => { const r = [x.id, x.name, x.kind, x.era, x.born, x.dies, x.c, x.at, x.fame, x.made, x.of]; if (x.dies >= yr && x.c >= 0) r.push(x.next, x.asked || 0); return r; });      // (a great person's works are found again from the works on loading; only the living need when they work next)
      const w = works.map((x) => [x.id, x.name, x.kind, x.by, x.year, x.at, x.c, x.lost, x.value, x.era]);
      const per = []; for (let c = 0; c < MAXC; c++) if (civs[c] && (prog[c] > 0 || born[c] || had[c] > 0 || golden[c] > -1e8)) per.push(c, +prog[c].toFixed(4), born[c], golden[c] > -1e8 ? golden[c] : 0, +had[c].toFixed(3));
      return { v: 3, rs, g, w, per, n: [nextGp, nextWk], st: [stats.born, stats.works, stats.lost, stats.golden, stats.forgot] };
    }
    function load(s) {
      greats.length = 0; alive.length = 0; works.length = 0; prog.fill(0); had.fill(0); born.fill(0); golden.fill(-1e9); renown.fill(0); lately.fill(0); bld.fill(0); nextGp = 1; nextWk = 1;
      if (!s || !s.g || s.v !== 3) return false; if (s.rs !== undefined) rs = s.rs >>> 0;
      const yr = year();
      const byId = new Map();
      for (const x of s.g) { const g = { id: x[0], name: x[1], kind: x[2], era: x[3], born: x[4], dies: x[5], c: x[6], at: x[7], fame: x[8], made: x[9] || 0, of: x[10] || '', next: x[11] || 0, asked: x[12] || 0, works: [] }; greats.push(g); byId.set(g.id, g); if (g.dies >= yr && g.c >= 0) alive.push(g); }
      for (const x of s.w) { works.push({ id: x[0], name: x[1], kind: x[2], by: x[3], year: x[4], at: x[5], c: x[6], held: -1, lost: x[7] || 0, value: x[8], era: x[9] || 0 }); const g = byId.get(x[3]); if (g) g.works.push(x[0]); }
      for (let k = 0; k < (s.per || []).length; k += 5) { const c = s.per[k]; prog[c] = s.per[k + 1]; born[c] = s.per[k + 2]; golden[c] = s.per[k + 3] || -1e9; had[c] = s.per[k + 4] || 0; }
      if (s.n) { nextGp = s.n[0]; nextWk = s.n[1]; } if (s.st) { stats.born = s.st[0]; stats.works = s.st[1]; stats.lost = s.st[2]; stats.golden = s.st[3]; stats.forgot = s.st[4] || 0; }
      count(yr);      // (what it holds, as it was when saved: nothing decays or begins on loading)
      return true;
    }

    return { greats, alive, works, prog, had, born, golden, renown, lately, bld, stats, news, step, tally, count, bear, make, sacked, gone, newRealm: bornCiv, rel, unrest, pull, buildF, isGolden, pace, pointsOf, threshold, patronOf, kindName, livingOf, greatsOf, heldBy, madeBy, workOf, greatOf, goldenNeed,
      setPatron, commission, commissionCost, save, load, lawF, KINDS, KK, PATRON, PATRON_COST, NORM, TURN, MASTER, GOLD };
  }

  // the lens of renown (world.js paints realms by these, main.js keys them): a golden age first, then renown against the usual for the age
  const BANDS = [
    { key: 'gold', name: 'In a golden age', css: '#FFE14D' },
    { key: 'famed', name: 'Famed: four times the usual and more', css: '#F0A030', at: 4 },
    { key: 'renowned', name: 'Renowned', css: '#C9853A', at: 1.5 },
    { key: 'usual', name: 'About the usual for the age', css: '#8F8A9A', at: 1 / 1.5 },
    { key: 'less', name: 'Less known', css: '#5B5F8F', at: 0.25 },
    { key: 'little', name: 'Little known', css: '#33355C', at: 0 },
  ];
  BANDS.forEach((B) => { B.rgb = [parseInt(B.css.slice(1, 3), 16) / 255, parseInt(B.css.slice(3, 5), 16) / 255, parseInt(B.css.slice(5, 7), 16) / 255]; });
  const BAND = {}; BANDS.forEach((B) => { BAND[B.key] = B; });
  function band(rel, gold) { if (gold) return 'gold'; for (const B of BANDS) if (B.at !== undefined && rel >= B.at) return B.key; return 'little'; }

  window.CULTURE = { create, PACE, NORM, KINDS, KK, LAW, PATRON, PATRON_COST, GOLD, MASTER, FORGET, BOON, BUILD, TURN, BANDS, BAND, band };
})();
