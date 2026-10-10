// GENESIS peoples: who lives where, and in what tongue. Pure data, no drawing (the lens of peoples is world.js's palette
// and main.js's key). Classic script; exposes window.PEOPLE.
//
// Every region that people live in belongs to a people (people.ppl: 0 where nobody known lives). A people is born where a
// tribe first settles; it spreads with the land its realms clear and settle; it keeps its regions when they are conquered,
// and is slowly taken into the people that rules it (faster in towns, beside regions of the rulers' own people, under laws
// that make one people of many, from schools); and a people spread far beyond the reach of one realm drifts apart into
// daughter peoples with tongues of their own, which keep a family likeness. A realm is ruled by one people: the people of
// the region it was founded in. A ruling few who have become a small share of their realm in time take up the tongue of
// those they rule.
// What a realm's peoples do to it, measured against the age (as knowledge and rule are, so that the world's numbers stay
// where they were fitted):
//  - Peoples who are not its rulers' are restless (unrest()), the more so from the Industrial age, when every people would
//    be a nation; laws of standing, of the provinces and of faith make it worse or better.
//  - When a realm fractures, it breaks along its peoples (farSeed(); splitCiv's fill keeps to the people of the seed).
// The names of places and of new realms are in the tongue of the people that lives there. The module throws its own dice:
// a people's drift and its tongue's sounds move nothing else in the world.
(function () {
  // how fast a region is taken into its rulers' people, a year, by age, alone among strangers (beside its rulers' own
  // people several times as fast: see step)
  const ASSIM = [0.0004, 0.0006, 0.0008, 0.001, 0.0009, 0.0011, 0.0022, 0.003, 0.0026];
  // how restless the peoples who are not a realm's rulers' make it, by age: their share of its people times this
  const RESTLESS = [0.05, 0.07, 0.09, 0.11, 0.11, 0.13, 0.24, 0.28, 0.22];
  // what share of their people realms of each age usually rule of other peoples (tools/people/norm.js measures it):
  // a realm is restless only for what it holds beyond its age's way, and a little steadier for less
  // NORM-BEGIN
  const NORM = [0.021, 0.056, 0.077, 0.059, 0.046, 0.042, 0.034, 0.023, 0.013];
  // NORM-END
  // a people drifts apart where it has spread farther than this from its home, in regions, by age (roads, books and a
  // common ruler hold a tongue together over more ground)
  const DRIFT = [14, 18, 22, 26, 28, 32, 40, 56, 80];
  // laws (rule.js, by key): how restless other peoples are under them (minor), and how fast they are taken in (assim)
  const LAW = {
    citizens: { minor: 1.3, assim: 0.7 }, castes: { minor: 1.1, assim: 0.8 }, orders: { minor: 1.05 }, subjects: { minor: 0.85, assim: 1.2 },
    property: { minor: 0.95 }, suffrage: { minor: 0.8, assim: 1.2 }, human: { minor: 0.7, assim: 1.1 },
    vassals: { minor: 0.85, assim: 0.6 }, governors: { assim: 1.1 }, examined: { assim: 1.3 }, intendants: { minor: 1.1, assim: 1.3 },
    selfrule: { minor: 0.6, assim: 0.5 }, central: { minor: 1.2, assim: 1.8 }, digital: { assim: 1.4 },
    tolerance: { minor: 0.85 }, established: { minor: 1.05 }, orthodoxy: { minor: 1.2, assim: 1.2 }, secular: { minor: 0.9 }, godless: { minor: 1.1 },
    schooling: { assim: 1.6 }, research: { assim: 1.5 }, cloister: { assim: 1.1 },
    police: { minor: 0.8 }, watched: { minor: 0.7 }, press: { minor: 1.1 }, opennet: { minor: 1.1 }, line: { minor: 0.9, assim: 1.2 },
  };
  const LAW_FIELDS = ['rights', 'admin', 'faith', 'learning', 'justice', 'speech'];
  const MAXP = 65000;

  function create(h) {
    const { W, H, N, land, owner, pop, level, civs, MAXC, LI, STYLES } = h;
    const year = () => h.year();
    const ppl = new Uint16Array(N);                 // the people of each region (0: none known)
    const ruling = new Uint16Array(MAXC);           // the people that rules each realm
    const foreignShare = new Float32Array(MAXC);    // the share of a realm's people who are not its rulers', counted every few years
    const restless = new Float32Array(MAXC);        // what that costs its stability now (unrest)
    const list = [null];                            // the peoples by id: { id, name, t (tongue), parent, fam, born, home, hue, sat, lit, n, pop, gone }
    const stats = { born: 0, drifted: 0, assimilated: 0, turned: 0, ms: 0 };
    const news = [];                                // (what the chronicle should hear of: main and the sim log it)

    // ---------- the module's own dice ----------
    let rs = ((h.seed || 1) ^ 0x2c1b3c6d) >>> 0;
    const rnd = () => { rs += 0x6D2B79F5; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];

    // ---------- tongues ----------
    // a tongue is one of sim.js's name styles narrowed to the sounds one people uses, so that its names sound alike; a
    // daughter's keeps most of its mother's and trades some for others of the style (the family likeness)
    function keep(arr, share) { const out = arr.filter(() => rnd() < share); return out.length >= Math.min(3, arr.length) ? out : arr.slice(0, Math.min(arr.length, 3 + Math.floor(rnd() * 3))); }
    function shift(mine, all, share) { const out = mine.filter(() => rnd() > share); for (const x of all) if (out.indexOf(x) < 0 && rnd() < share * mine.length / all.length) out.push(x); return out.length >= Math.min(3, all.length) ? out : mine.slice(); }
    function tongue(st, mother) {
      const S = STYLES[st] || STYLES[0];
      if (S.syl) return { st, syl: mother ? shift(mother.syl, S.syl, 0.3) : keep(S.syl, 0.5) };
      if (mother) return { st, on: shift(mother.on, S.on, 0.3), vow: shift(mother.vow, S.vow, 0.2), end: shift(mother.end, S.end, 0.35) };
      return { st, on: keep(S.on, 0.6), vow: keep(S.vow, 0.8), end: keep(S.end, 0.5) };
    }
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    function nameIn(t, minS, maxS) {
      const n = minS + Math.floor(rnd() * (maxS - minS + 1));
      if (t.syl) { let s = ''; for (let i = 0; i < n; i++) s += pick(t.syl); return cap(s); }
      let s = ''; for (let i = 0; i < n; i++) s += pick(t.on) + pick(t.vow);
      s += rnd() < 0.85 ? pick(t.end) : pick(t.on);
      return cap(s.replace(/(.)\1\1/g, '$1$1'));
    }

    // ---------- birth ----------
    const GOLD = 0.6180339887;
    function make(name, t, home, parent) {
      if (list.length >= MAXP) return 0;
      const id = list.length, P = parent ? list[parent] : null;
      // (a family keeps a hue of its own: its daughters near it, a little lighter or darker, a little greyer or brighter)
      const hue = P ? (P.hue + (rnd() - 0.5) * 0.09 + 1) % 1 : (id * GOLD + 0.13) % 1;
      const p = { id, name, t, parent: parent || 0, fam: P ? P.fam : id, born: year(), home, hue, sat: P ? Math.min(0.8, Math.max(0.35, P.sat + (rnd() - 0.5) * 0.2)) : 0.55 + rnd() * 0.15, lit: P ? Math.min(0.62, Math.max(0.36, P.lit + (rnd() - 0.5) * 0.14)) : 0.46 + rnd() * 0.08, n: 0, pop: 0, gone: 0 };
      list.push(p); stats.born++; return id;
    }
    // a realm is about to be founded at home: if nobody known lives there, a people for it - a daughter of the nearest
    // people within reach that speaks a tongue of its kind (those who went out from it: its tongue, a little changed), or
    // the first of a new family. style: the kind of tongue of the place, drawn by sim.js's styleFor as it always was (so
    // that a world's tongues are as many and as mixed as they were: diplomacy's kindred speech and the hordes of the steppe
    // and mandates of the river plains count on it). Named when the realm is (born).
    const NEAR = 12;
    function prepare(home, style) {
      if (ppl[home]) return ppl[home];
      const y0 = (home / W) | 0, x0 = home - y0 * W; let mother = 0;
      for (let r = 1; r <= NEAR && !mother; r++) for (let dy = -r; dy <= r && !mother; dy++) { const y = y0 + dy; if (y < 0 || y >= H) continue; for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const q = ppl[y * W + ((x0 + dx + W) % W)]; if (q && (style === undefined || list[q].t.st === style)) { mother = q; break; } } }
      const M = mother ? list[mother] : null;
      const p = make(null, M ? tongue(M.t.st, M.t) : tongue(style || 0), home, mother); if (p) ppl[home] = p; return p;
    }
    // a realm is founded at home (a tribe settles, a province breaks away, the player sets out): the people it is of, which
    // is named as the realm is if it is new
    function born(home, c, from, style) {
      let p = ppl[home] || prepare(home, style === undefined ? c.style : style);
      if (p && !list[p].name) list[p].name = c.name;
      ruling[c.id] = p; foreignShare[c.id] = 0; restless[c.id] = 0;
      return p;
    }
    // the realm's name and its places' names, in the tongue of who lives there
    function realmName(home) { const p = ppl[home] && list[ppl[home]]; return p ? nameIn(p.t, 2, 3) : null; }
    function styleAt(home) { const p = ppl[home] && list[ppl[home]]; return p ? p.t.st : -1; }
    function nameAt(i, c) { const p = list[ppl[i] || (c ? ruling[c.id] : 0)]; return p ? nameIn(p.t, 2, 3) : null; }
    // a realm takes a region: settlers bring their people to empty land; land with a people of its own keeps it
    function claimed(i, c) { if (!ppl[i] && c && ruling[c.id]) ppl[i] = ruling[c.id]; }

    // ---------- what the laws do ----------
    function lawF(c, key) {
      const R = h.rule && h.rule.ruleOf(civs[c]); if (!R) return 1; let f = 1;
      for (const k of LAW_FIELDS) { const L = LAW[R.laws[k]]; if (L && L[key] !== undefined) f *= L[key]; }
      return f;
    }

    // ---------- a year ----------
    const tally = new Float64Array(MAXC * 2);      // (own, all) people of each realm, counted every few years
    function step() {
      const t0 = performance.now(), yr = year();
      // a fifth of the land each year: who has been taken into their rulers' people
      const k5 = ((yr % 5) + 5) % 5, era = [];
      for (let c = 0; c < MAXC; c++) era[c] = civs[c] ? Math.min(8, Math.max(0, civs[c].era | 0)) : 0;
      const af = new Float32Array(MAXC); for (let c = 0; c < MAXC; c++) if (civs[c]) af[c] = ASSIM[era[c]] * lawF(c, 'assim') * 5 * (h.pull ? h.pull(c) : 1);      // (a realm of renown takes others in faster: culture.js)
      for (let k = k5; k < LI.length; k += 5) {
        const i = LI[k], o = owner[i]; if (o < 0) continue; const p = ppl[i], r = ruling[o]; if (!p || !r || p === r || !af[o]) continue;
        let near = 0; for (let q = 0; q < 8; q++) { const n = h.nbOf(i, q); if (n >= 0 && ppl[n] === r && owner[n] === o) near++; }
        const town = level[i] >= 2 ? 1.6 : level[i] ? 1.25 : 1;
        if (rnd() < af[o] * town * (0.4 + near * 0.6)) { ppl[i] = r; stats.assimilated++; }
      }
      // every five years: who rules whom, what it costs, and the ruling few who have become the strangers
      if (k5 === 0) {
        tally.fill(0); for (const P of list) if (P) { P.n = 0; P.pop = 0; }
        for (let k = 0; k < LI.length; k++) { const i = LI[k], p = ppl[i]; if (p) { const P = list[p]; P.n++; P.pop += pop[i]; } const o = owner[i]; if (o < 0) continue; tally[o * 2 + 1] += pop[i]; if (p && p === ruling[o]) tally[o * 2] += pop[i]; }
        for (let c = 0; c < MAXC; c++) {
          const cv = civs[c]; if (!cv) continue; const all = tally[c * 2 + 1]; const fs = all > 0 ? 1 - tally[c * 2] / all : 0; foreignShare[c] = fs;
          restless[c] = -RESTLESS[era[c]] * (fs * lawF(c, 'minor') - NORM[era[c]]); if (restless[c] > 0.02) restless[c] = 0.02;
          // (rulers who are a tenth of their own realm's people are not rulers of their own people for long)
          if (fs > 0.9 && all > 0 && rnd() < 0.1) { const best = largest(c); if (best && best !== ruling[c]) { const was = ruling[c]; ruling[c] = best; stats.turned++; news.push({ c, kind: 'turned', was, now: best, year: yr }); } }
        }
        for (const P of list) if (P && !P.gone && P.n === 0 && yr - P.born > 50) { P.gone = yr; }
      }
      // every twenty-five years: peoples that have spread far apart drift into new peoples
      if (((yr % 25) + 25) % 25 === 0) drift(yr);
      stats.ms = performance.now() - t0;
    }
    // the largest people of a realm, by its people
    function largest(c) { const m = new Map(); for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] !== c || !ppl[i]) continue; m.set(ppl[i], (m.get(ppl[i]) || 0) + pop[i]); } let best = 0, bv = -1; for (const [p, v] of m) if (v > bv) { bv = v; best = p; } return best; }
    // a people's regions farther from its home than its age holds together part from it, a cluster at a time
    function drift(yr) {
      const far = new Map();      // people -> its farthest region from home, and how far
      for (let k = 0; k < LI.length; k++) { const i = LI[k], p = ppl[i]; if (!p) continue; const P = list[p]; const d = h.cellDist(i, P.home); const f = far.get(p); if (!f || d > f.d) far.set(p, { i, d }); }
      for (const [p, f] of far) {
        const P = list[p]; if (P.n < 12 || yr - P.born < 300) continue;
        const o = owner[f.i], e = o >= 0 && civs[o] ? Math.min(8, Math.max(0, civs[o].era | 0)) : 0; const D = DRIFT[e];
        if (f.d < D) continue;
        // (under one realm that rules it, a people keeps together: the tongue of the capital is heard everywhere)
        const held = o >= 0 && ruling[o] === p ? 0.35 : 1;
        if (rnd() > Math.min(0.5, (f.d / D - 1) * 0.6) * held) continue;
        split(p, f.i, Math.max(4, Math.min(P.n >> 1, 400)), yr);
      }
    }
    function split(p, seed, max, yr) {
      const P = list[p]; const id = make(null, tongue(P.t.st, P.t), seed, p); if (!id) return 0;
      const D = list[id]; D.name = nameIn(D.t, 2, 3);
      // (the regions of the old people nearest the seed, out to half the way home)
      const reach = h.cellDist(seed, P.home) * 0.5, seen = new Set([seed]), q = [seed]; let n = 0;
      while (q.length && n < max) { const i = q.shift(); ppl[i] = id; n++; for (let k = 0; k < 8; k++) { const m = h.nbOf(i, k); if (m < 0 || seen.has(m) || ppl[m] !== p || h.cellDist(m, seed) > reach) continue; seen.add(m); q.push(m); } }
      // (a realm whose capital is among them is ruled by the new people now)
      for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (cv && ruling[c] === p && cv.capital >= 0 && ppl[cv.capital] === id) ruling[c] = id; }
      stats.drifted++; news.push({ kind: 'drift', p: id, from: p, at: seed, n, year: yr }); D.n = n;
      return id;
    }

    // ---------- what the simulation asks ----------
    const unrest = (cv) => restless[cv.id];
    // the region a breakaway grows from: of those the sim found far from the capital, one of a people not the rulers'
    // (asked with the sim's own candidates, so that the world throws the same dice)
    function farSeed(c, cands) { let best = -1, bs = -1; for (const [i, d] of cands) { const s = d * (ppl[i] && ppl[i] !== ruling[c] ? 1.7 : 1); if (s > bs) { bs = s; best = i; } } return best; }
    // the share of each people in a realm, the largest first: [[people, share], ...]
    function peoplesOf(c, max) {
      const m = new Map(); let all = 0; for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] !== c) continue; all += pop[i]; const p = ppl[i]; m.set(p, (m.get(p) || 0) + pop[i]); }
      return [...m].filter(([p]) => p).sort((a, b) => b[1] - a[1]).slice(0, max || 6).map(([p, v]) => [p, all > 0 ? v / all : 0]);
    }
    // a people's family: its mother, her mother ... to the first
    function lineage(p) { const out = []; let q = list[p]; while (q && out.length < 12) { out.push(q.id); q = q.parent ? list[q.parent] : null; } return out; }
    const rgbOf = (p) => { const P = list[p]; if (!P) return [0.5, 0.5, 0.5]; return hsl(P.hue, P.sat, P.lit); };
    function hsl(hh, s, l) { const f = (n) => { const k = (n + hh * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; }
    const nameOf = (p) => list[p] ? list[p].name : '';

    // ---------- saved with the world ----------
    function save() {
      // (the map of peoples, run by run: [people, how many regions in a row] over the whole grid)
      const runs = []; let cur = ppl[0], n = 0; for (let i = 0; i < N; i++) { if (ppl[i] === cur) n++; else { runs.push(cur, n); cur = ppl[i]; n = 1; } } runs.push(cur, n);
      return { v: 1, rs, l: list.slice(1).map((p) => [p.name, p.t, p.parent, p.fam, p.born, p.home, +p.hue.toFixed(4), +p.sat.toFixed(3), +p.lit.toFixed(3), p.gone]), map: runs, r: Array.from(ruling) };
    }
    function load(s) {
      list.length = 1; ppl.fill(0); ruling.fill(0); foreignShare.fill(0); restless.fill(0);
      if (!s || !s.l) return false;
      if (s.rs !== undefined) rs = s.rs >>> 0;
      s.l.forEach((q, k) => list.push({ id: k + 1, name: q[0], t: q[1], parent: q[2], fam: q[3], born: q[4], home: q[5], hue: q[6], sat: q[7], lit: q[8], gone: q[9] || 0, n: 0, pop: 0 }));
      let i = 0; for (let k = 0; k < s.map.length; k += 2) { const p = s.map[k], n = s.map[k + 1]; ppl.fill(p, i, Math.min(N, i + n)); i += n; }
      if (s.r) for (let c = 0; c < Math.min(MAXC, s.r.length); c++) ruling[c] = s.r[c];
      for (let k = 0; k < LI.length; k++) { const i = LI[k], P = list[ppl[i]]; if (P) { P.n++; P.pop += pop[i]; } }      // (how many each people is, for the key and the pages until the next count)
      return true;
    }
    // a world saved before there were peoples: every realm's land is its own people's, wild land nobody's known
    function settle() {
      list.length = 1; ppl.fill(0); ruling.fill(0);
      for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv) continue; const p = make(cv.name, tongue(cv.style), cv.capital >= 0 ? cv.capital : cv.home, 0); ruling[c] = p; }
      for (let k = 0; k < LI.length; k++) { const i = LI[k], o = owner[i]; if (o >= 0 && civs[o]) ppl[i] = ruling[o]; }
    }

    return { ppl, ruling, list, stats, news, foreignShare, restless, step, prepare, born, claimed, realmName, styleAt, nameAt, nameIn, unrest, farSeed, peoplesOf, lineage, rgbOf, nameOf, save, load, settle, lawF, LAW };
  }

  window.PEOPLE = { create, ASSIM, RESTLESS, NORM, DRIFT, LAW };
})();
