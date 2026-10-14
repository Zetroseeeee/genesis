// Holocene learning (classic script; exposes window.LEARN): what the world learns of the player from what he does, and what his own
// court learns of his choices.
//
// The world's courts watch the player's realm - and only his: the autopilot's realms keep the rules every world's history was fitted
// to, and a world without a player is the very world it was - and once a turn they reckon again from everything they remember of him:
//  - whom he falls on: a logistic model of a war he begins (`WAR`), fitted by Newton's method to every realm he could have fallen on
//    in every turn he was watched - did he, or did he not? - by what each was to him: weaker or stronger, of another faith, claimed,
//    at war elsewhere, in turmoil, sworn to him, his own people, holding what he lacks, a realm that wronged him, beyond his borders.
//    The old turns count for less (half in `HALF` turns: a ruler who mends his ways is believed in time), and the model is pulled
//    toward what a court assumes of any realm (each feature's prior weight), so that with little to go on it says what they would
//    have said of anyone. A few realms beyond his borders are watched each turn for all of them (each counted for its share);
//  - whether his word holds: oaths broken (a pact thrown over, a sworn realm attacked, an ally left to fight alone, a lord defied,
//    a call to arms refused) against the turns his oaths stood: a rate, of a gamma prior and its evidence;
//  - whether he stands by his friends (calls to arms answered and refused), whether he gives in when pressed (demands to bend the
//    knee met and refused), what he asks of the beaten (the terms of the peaces he won; vassals joined to his crown), his agents
//    (schemes found out): each a prior and its evidence, all fading as the war model's examples do.
// A court knows of him what has reached it (`heard`: bordering him, at war with him, sworn to him or trading with him it hears most;
// within its envoys' reach a little; beyond it, it forgets), and its belief lies between what it would assume of anyone and what the
// world has learned of him, as far as it has heard. Diplomacy reads the beliefs (diplo.js): their fear of him in what they think of
// him and in whom they dread, a league of those who fear him, his word and his friendship in what they will swear with him, what
// they dare ask of him; intrigue reads their watch for his agents.
//
// His own court learns his choices (`habit`): which way he leans when a story comes before him - a conditional logit over what each
// choice does (stability, coin, authority, the estates, learning, renown, people, what others think, boldness, arms), fitted to his
// choices - and which branches of learning he chooses. When he lets the court decide (stories off) it decides as he would; when he
// leaves his scholars without word they choose as he has; a story's page marks the choice he is wont to make.
//
// Pure data and arithmetic: the simulation calls step() once a year, diplomacy and intrigue tell it what the player did, and the
// screens ask it what is believed. Saved with the world (save().learn). A year costs nothing; a turn's reckoning a millisecond or two.
window.LEARN = (function () {
  'use strict';
  const PACE = window.RULE ? window.RULE.PACE : [200, 100, 50, 50, 40, 20, 10, 5, 5, 5];
  const sig = (z) => (z > 30 ? 1 : z < -30 ? 0 : 1 / (1 + Math.exp(-z)));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const r3 = (v) => Math.round(v * 1000) / 1000;

  // ---------- whom he falls on ----------
  // [key, the realms it describes (the envoys say "you fall on ..." or "you spare ..."), what a court assumes of any realm: the prior's
  // weight in the log-odds of a war begun on such a realm within a turn]. The bias is what he does beyond what realms of the age do
  // (`BASE`): every feature is between 0 and 1.
  const WAR = [
    ['bias', 'your neighbours', 0],
    ['weak', 'realms weaker than you', 1.3],
    ['strong', 'realms stronger than you', -1.2],
    ['faith', 'realms of another faith', 0.3],
    ['claim', 'realms you hold a claim on', 1.2],
    ['busy', 'realms at war with others', 0.3],
    ['torn', 'realms in turmoil', 0.4],
    ['sworn', 'realms sworn to you', -2.4],
    ['kin', 'your own people under another flag', 0.3],
    ['covet', 'realms that hold what you lack', 0.5],
    ['wronged', 'realms that have wronged you', 0.7],
    ['again', 'realms you have fallen on before', 0.8],
    ['far', 'realms beyond your borders', -1.6],
  ];
  const NF = WAR.length, FK = {}; WAR.forEach((f, k) => { FK[f[0]] = k; });
  // what realms of each age do: the log-odds that a realm begins a war of its own on a neighbour of its own weight within a turn
  // (the war-and-peace probe's wars begun in a century, half of them beside a friend from the Iron Age on, by the turn's years, over
  // some five neighbours: nine in a hundred a turn in the Stone Age's turns of two centuries, two in a thousand in our own day's of five years)
  const BASE = [-2.3, -2.9, -4.4, -4.5, -4.4, -4.9, -5.5, -6.1, -6.1, -6.1];
  const W0 = Float64Array.from(WAR.map((f) => f[2]));
  const HALF = 12;          // turns in which what a court remembers of him counts for half
  const LAM = 1;            // how hard the prior holds: an example's worth on each weight
  const MAXEX = 1500;       // the examples kept (the oldest go first: by then they count for little)
  const FAR_N = 4, FAR_S = 40;      // realms beyond his borders watched a turn, and the most any one of them stands for
  const Q = 250;            // features are kept as bytes: 0 .. Q

  // ---------- the rest: [prior for, prior against], in examples' worth ----------
  const OATH0 = [0.4, 12];       // oaths broken per pact-turn: some three in a hundred, so that nine pacts in ten of four turns hold
  const ALLY0 = [4, 1];          // calls to arms answered, refused: four in five
  const GIVE0 = [1, 3];          // demands met, refused: one in four
  const HARSH0 = [3, 3];         // the terms of the peaces he won (as peace stands 0, reparations 1, a new government 2, submission 3): sum, count
  const PLOT0 = [0.1, 10];       // his agents found out, per turn watched

  // ---------- what his court learns of his choices ----------
  // A story's choice, as the court sees it: [key, how it is said ("you choose ..."), the prior's weight] - the prior is what the
  // autopilot's courts weigh (story.js score), scaled.
  const HAB = [
    ['stab', 'quiet at home', 1.2],
    ['coin', 'coin', 0.8],
    ['auth', 'authority', 0.5],
    ['est', 'the estates\' goodwill', 0.6],
    ['learn', 'learning', 0.6],
    ['ren', 'renown', 0.6],
    ['people', 'your people', 1.0],
    ['friends', 'friends abroad', 0.3],
    ['bold', 'the bold course', -0.2],
    ['arms', 'arms', 0.4],
  ];
  const NH = HAB.length, TH0 = Float64Array.from(HAB.map((f) => f[2]));
  const MAXCH = 160, HLAM = 1.5, HALF_CH = 30;      // choices kept, how hard the prior holds, choices in which one counts for half

  // Newton's method on a weighted, penalised logistic log-likelihood (iteratively reweighted least squares): from w, toward the
  // weights that best explain y by X, each example counted c times, the whole pulled toward w0 with strength lam
  function newton(X, Y, C, n, F, w, w0, lam, iters, O) {
    const H = new Float64Array(F * F), g = new Float64Array(F), dw = new Float64Array(F), L = new Float64Array(F * F), t = new Float64Array(F);
    for (let it = 0; it < iters; it++) {
      H.fill(0); g.fill(0);
      for (let i = 0; i < n; i++) {
        const o = i * F; let z = O ? O[i] : 0; for (let k = 0; k < F; k++) z += w[k] * X[o + k];
        const p = sig(z), c = C[i]; if (!(c > 0)) continue; const r = c * (p - Y[i]), s = c * p * (1 - p);
        for (let k = 0; k < F; k++) { const xk = X[o + k]; if (!xk) continue; g[k] += r * xk; const sk = s * xk; for (let j = k; j < F; j++) H[k * F + j] += sk * X[o + j]; }
      }
      for (let k = 0; k < F; k++) { g[k] += lam * (w[k] - w0[k]); H[k * F + k] += lam; for (let j = 0; j < k; j++) H[k * F + j] = H[j * F + k]; }
      if (!chol(H, g, dw, F, L, t)) break;
      let step = 0; for (let k = 0; k < F; k++) { const d = clamp(dw[k], -3, 3); w[k] -= d; if (Math.abs(d) > step) step = Math.abs(d); }
      if (step < 1e-5) break;
    }
    return w;
  }
  // a symmetric positive definite system A x = b, by Cholesky's factors
  function chol(A, b, x, n, L, y) {
    L.fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = A[i * n + j]; for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k]; if (i === j) { if (!(s > 1e-12)) return false; L[i * n + i] = Math.sqrt(s); } else L[i * n + j] = s / L[j * n + j]; }
    for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
    return true;
  }
  // a softmax over choices, fitted by gradient ascent with the prior's pull (the choices of a story are few, and so are stories)
  function softmaxFit(sets, th, th0, lam, iters) {
    const g = new Float64Array(th.length); let lr = 0.5;
    for (let it = 0; it < iters; it++) {
      g.fill(0);
      for (const S of sets) {
        const P = probs(S.phi, th); const c = S.c;
        for (let j = 0; j < S.phi.length; j++) { const f = S.phi[j], e = (j === S.i ? 1 : 0) - P[j]; if (!e) continue; for (let k = 0; k < th.length; k++) g[k] += c * e * f[k]; }
      }
      let big = 0; for (let k = 0; k < th.length; k++) { g[k] -= lam * (th[k] - th0[k]); if (Math.abs(g[k]) > big) big = Math.abs(g[k]); }
      const step = lr / Math.max(1, big); for (let k = 0; k < th.length; k++) th[k] += step * g[k];
      if (big < 1e-4) break; lr *= 0.97;
    }
    return th;
  }
  function probs(phi, th) {
    const z = phi.map((f) => { let s = 0; for (let k = 0; k < th.length; k++) s += th[k] * (f[k] || 0); return s; }); const m = Math.max(...z);
    const e = z.map((v) => Math.exp(v - m)); const t = e.reduce((a, b) => a + b, 0); return e.map((v) => v / t);
  }
  // (bytes as text, for the save)
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = (s) => { const t = atob(s || ''); const u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };

  // ---------- one world's ----------
  // h: { MAXC, civs, year(), player(): the player's realm or null, ratio(a, b): a's might over b's, bound(a, b), claimed(a, b): a holds
  //      a reason for war against b, wronged(a, b): what a holds against b (negative: wrongs), touches(a, b), faith(cv), folk(cv),
  //      covets(a, b), busy(b, a): b at war with somebody other than a, eligible(a, b): a could go to war with b now, reach(a): the ids a
  //      deals with, nb(a): the ids it touches, atWar(a, bid), sworn(a, b): a pact or an oath binds them, partner(a, b): their
  //      merchants trade, pacts(a): how many oaths a is under (pacts of peace, defence, alliance and marriage, and a lord) }
  function create(h) {
    const { MAXC, civs } = h; const year = () => h.year();
    const st = fresh();
    function fresh() {
      return { T: 0, next: -1e12, w: Float64Array.from(W0), X: new Uint8Array(MAXEX * NF), Y: new Uint8Array(MAXEX), C: new Float32Array(MAXEX), TT: new Int32Array(MAXEX), n: 0,
        E: new Uint8Array(MAXEX), cand: [], oath: [0, 0], ally: [0, 0], give: [0, 0], harsh: [0, 0], plot: [0, 0], acc: { nap: [0, 0], trade: [0, 0], defence: [0, 0], alliance: [0, 0], marriage: [0, 0] },
        tot: { wars: 0, oaths: 0, kept: 0, called: 0, answered: 0, asked: 0, gave: 0, peaces: 0, harsh: 0, annexed: 0, plots: 0, turns: 0 },
        heard: new Uint8Array(MAXC), caught: new Float64Array(MAXC).fill(-1e9), prey: new Float32Array(MAXC), seen: -1, told: { a: 'anyone', w: 'holds' },
        habit: { th: Float64Array.from(TH0), sets: [], n: 0, kb: new Float64Array(8), kn: 0 }, ms: 0 };
    }
    let ver = 1;      // (what is believed changes: the caches below are of one version)
    const eraOf = (cv) => Math.max(0, Math.min(9, cv.era | 0));

    // ----- what a realm is to him -----
    function feats(p, b, out) {
      const l2 = Math.log2(Math.max(1e-6, h.ratio(p, b)));
      out[0] = 1; out[1] = clamp(l2 / 3, 0, 1); out[2] = clamp(-l2 / 3, 0, 1);
      const fp = h.faith(p), fb = h.faith(b); out[3] = fp && fb && fp !== fb ? 1 : 0;
      out[4] = h.claimed(p, b) ? 1 : 0; out[5] = h.busy(b, p) ? 1 : 0; out[6] = clamp((0.45 - (b.stability || 0)) / 0.3, 0, 1);
      out[7] = h.bound(p, b) ? 1 : 0; const kp = h.folk(p); out[8] = kp && kp === h.folk(b) ? 1 : 0;
      const t = h.touches(p, b); out[9] = t && h.covets(p, b) ? 1 : 0; out[10] = clamp(-h.wronged(p, b) / 30, 0, 1); out[11] = clamp(st.prey[b.id] / 1.5, 0, 1); out[12] = t ? 0 : 1;
      return out;
    }
    const q8 = (x) => { const u = new Uint8Array(NF); for (let k = 0; k < NF; k++) u[k] = Math.round(clamp(x[k], 0, 1) * Q); return u; };
    const xf = new Float64Array(NF);
    const dot = (w, x) => { let z = 0; for (let k = 0; k < NF; k++) z += w[k] * x[k]; return z; };

    // ----- the turn's watch: every realm he could fall on (his neighbours, and a few further off for all of them) -----
    function watch(p) {
      const nb = h.nb(p) || [], far = []; const out = [];
      const e = eraOf(p); for (const bid of nb) { const b = civs[bid]; if (b && b !== p && h.eligible(p, b)) out.push({ b: bid, x: q8(feats(p, b, xf)), s: 1, y: 0, e }); }
      for (const bid of h.reach(p)) { if (nb.indexOf(bid) >= 0) continue; const b = civs[bid]; if (b && b !== p && h.eligible(p, b)) far.push(bid); }
      if (far.length) { const k = Math.min(FAR_N, far.length), s = Math.min(FAR_S, far.length / k), o = (Math.imul(st.T + 1, 2654435761) >>> 0) % far.length;
        for (let i = 0; i < k; i++) { const bid = far[(o + Math.floor(i * far.length / k)) % far.length]; out.push({ b: bid, x: q8(feats(p, civs[bid], xf)), s, y: 0, e }); } }
      st.cand = out;
    }
    function keep(e) {
      if (st.n >= MAXEX) { const d = 100; st.X.copyWithin(0, d * NF, st.n * NF); st.Y.copyWithin(0, d, st.n); st.C.copyWithin(0, d, st.n); st.TT.copyWithin(0, d, st.n); st.E.copyWithin(0, d, st.n); st.n -= d; }
      const i = st.n++; st.X.set(e.x, i * NF); st.Y[i] = e.y; st.C[i] = e.s; st.TT[i] = st.T; st.E[i] = e.e === undefined ? 2 : e.e;
    }
    // the reckoning: the model of his wars fitted again to all that is remembered
    function fit() {
      const n = st.n; if (!n) { st.w.set(W0); return; }
      const X = new Float64Array(n * NF), Y = new Float64Array(n), C = new Float64Array(n), O = new Float64Array(n);
      for (let i = 0; i < n; i++) { for (let k = 0; k < NF; k++) X[i * NF + k] = st.X[i * NF + k] / Q; Y[i] = st.Y[i]; C[i] = st.C[i] * Math.pow(0.5, (st.T - st.TT[i]) / HALF); O[i] = BASE[st.E[i]]; }
      newton(X, Y, C, n, NF, st.w, W0, LAM, 10, O);
      for (let k = 0; k < NF; k++) if (!Number.isFinite(st.w[k])) { st.w.set(W0); break; }
    }
    // who has heard of him, and how much (a byte a realm)
    const inR = new Uint8Array(MAXC), inN = new Uint8Array(MAXC);
    function hear(p) {
      for (const b of h.reach(p)) inR[b] = 1; for (const b of h.nb(p) || []) inN[b] = 1;
      for (let c = 0; c < MAXC; c++) {
        const b = civs[c]; if (!b || b === p) { st.heard[c] = b ? 255 : 0; inR[c] = inN[c] = 0; continue; }
        let k = h.atWar(p, c) ? 0.7 : inN[c] ? 0.5 : 0; if (k < 0.45 && h.sworn(p, b)) k = 0.45; if (k < 0.35 && h.partner(p, b)) k = 0.35; if (!k && inR[c]) k = 0.15;
        if (k) { k = Math.min(0.9, k * (b.era >= 7 ? 1.6 : b.era >= 5 ? 1.3 : 1)); st.heard[c] = Math.round(st.heard[c] + (255 - st.heard[c]) * k); }
        else st.heard[c] = Math.floor(st.heard[c] * 0.85);
        inR[c] = inN[c] = 0;
      }
    }

    // ----- a year: once a turn of his age, the courts reckon again -----
    function step() {
      const p = h.player(); if (!p) { st.cand = []; return; } const y = year();
      if (st.seen !== p.id) { const H = st.habit; if (st.seen >= 0) { Object.assign(st, fresh()); st.habit = H; } st.seen = p.id; st.next = -1e12; st.cand = []; }      // (a new people founded: the world has heard nothing of it yet; his court's habits are his own and go with him)
      if (y < st.next) return;
      const t0 = Date.now();
      for (const e of st.cand) keep(e);      // (the last turn's watch is done: what he did, and did not do)
      const f = Math.pow(0.5, 1 / HALF); for (const a of [st.oath, st.ally, st.give, st.harsh, st.plot, ...Object.values(st.acc)]) { a[0] *= f; a[1] *= f; } for (let c = 0; c < MAXC; c++) if (st.prey[c]) st.prey[c] = st.prey[c] * f < 0.02 ? 0 : st.prey[c] * f;
      const pn = h.pacts(p); st.oath[1] += pn; st.tot.kept += pn; st.plot[1] += 1;
      st.T++; st.tot.turns++; fit(); hear(p); watch(p);
      st.next = y + PACE[eraOf(p)]; ver++; fearY.fill(-2147483648);
      tell();
      st.ms = Date.now() - t0;
    }

    // ----- what he hears of it: when the world's picture of him turns, his chronicle says so (calm news) -----
    const APP = { conqueror: 'Abroad they call you a conqueror: the courts reckon you fall on your neighbours far oftener than any realm would',
      hungry: 'The courts abroad have come to watch your borders: they reckon you hungry for land', peaceful: 'Abroad you are counted a peaceful neighbour',
      anyone: 'The courts abroad no longer single you out: they reckon of you as they would of anyone' };
    const WRD = { little: 'Your word is worth little abroad: the courts reckon your pacts will not hold', doubted: 'The courts abroad have begun to doubt your word', holds: 'Your word is trusted abroad again' };
    function tell() {
      if (st.T < 4 || !h.news) return; const A = appetite(), r = A[0] / Math.max(0.002, A[1]), B = belief(null), k = B.keep(4);
      const a = r > 2.5 ? 'conqueror' : r > 1.5 ? 'hungry' : r < 0.55 ? 'peaceful' : (st.told.a === 'peaceful' && r < 0.7) || ((st.told.a === 'hungry' || st.told.a === 'conqueror') && r > 1.25) ? st.told.a : 'anyone';
      const w = k < 0.6 ? 'little' : k < 0.8 ? 'doubted' : (st.told.w !== 'holds' && k < 0.86) ? st.told.w : 'holds';
      if (a !== st.told.a) { st.told.a = a; h.news(APP[a]); } if (w !== st.told.w) { st.told.w = w; h.news(WRD[w]); }
    }

    // ----- what he does (diplomacy and intrigue tell it) -----
    // a war he begins: a turn of the watch that ends in yes (what the realm was to him at that moment)
    function declared(p, b) {
      if (!p || !b || !p.player) return; const x = q8(feats(p, b, xf)); st.tot.wars++;
      const e = st.cand.find((q) => q.b === b.id && !q.y); if (e) { e.y = 1; e.x = x; e.s = 1; e.e = eraOf(p); } else st.cand.push({ b: b.id, x, s: 1, y: 1, e: eraOf(p) });
      st.prey[b.id] += 1;      // (and the next time they look at that realm, he has fallen on it before)
      ver++; fearY.fill(-2147483648);
    }
    const oath = (by) => { st.oath[0] += by; if (by >= 0.5) st.tot.oaths++; ver++; };
    const called = (yes, by) => { if (yes) st.ally[0] += by; else st.ally[1] += by; st.tot.called++; if (yes) st.tot.answered++; ver++; };
    const pressed = (yes, by) => { if (yes) st.give[0] += by; else st.give[1] += by; st.tot.asked++; if (yes) st.tot.gave++; ver++; };
    const terms = (rank, by) => { st.harsh[0] += rank * by; st.harsh[1] += by; if (by >= 1) { st.tot.peaces++; st.tot.harsh += rank; } ver++; };
    const annexed = () => { terms(3, 0.7); st.tot.annexed++; };
    const plot = (b) => { st.plot[0] += 1; st.tot.plots++; if (b) st.caught[b.id] = year(); ver++; };
    // what he answers to what envoys propose: the courts send less of what he turns away, and more of what he takes
    const answered = (kind, yes, by) => { const a = st.acc[kind]; if (!a) return; if (yes) a[0] += by; else a[1] += by; st.tot.offered = (st.tot.offered || 0) + 1; if (yes) st.tot.took = (st.tot.took || 0) + 1; };
    const takes = (kind) => { const a = st.acc[kind]; return a ? (1 + a[0]) / (2 + a[0] + a[1]) : 0.5; };
    // a new realm: one cut from his own has heard everything; anyone else, nothing yet
    function born(c, from) { const p = h.player(); st.heard[c] = p && from === p.id ? 255 : 0; st.caught[c] = -1e9; st.prey[c] = 0; }

    // ----- what is believed -----
    const mean = (ev, pr) => (pr[0] + ev[0]) / (pr[0] + pr[1] + ev[0] + ev[1]);
    const heardOf = (b) => (b ? st.heard[b.id] / 255 : 1);
    // what the court of b believes of him (b null: the world, as if it had heard everything)
    function belief(b) {
      const hd = heardOf(b), mix = (v0, v) => v0 + hd * (v - v0);
      const lam = mix(OATH0[0] / OATH0[1], (OATH0[0] + st.oath[0]) / (OATH0[1] + st.oath[1]));
      return { heard: hd, lam, keep: (turns) => Math.exp(-lam * turns), ally: mix(ALLY0[0] / (ALLY0[0] + ALLY0[1]), mean(st.ally, ALLY0)), gives: mix(GIVE0[0] / (GIVE0[0] + GIVE0[1]), mean(st.give, GIVE0)),
        harsh: mix(HARSH0[0] / HARSH0[1], (HARSH0[0] + st.harsh[0]) / (HARSH0[1] + st.harsh[1])), plots: mix(PLOT0[0] / PLOT0[1], (PLOT0[0] + st.plot[0]) / (PLOT0[1] + st.plot[1])) };
    }
    // b's dread that he falls on it within a turn, and what it would dread of anyone in his place: [fear, usual] (cached for the year)
    const fearY = new Int32Array(MAXC).fill(-2147483648), fearV = new Float32Array(MAXC), baseV = new Float32Array(MAXC);
    function fear(b) {
      const p = h.player(); if (!p || !b || b === p || !civs[b.id]) return null; const y = year();
      if (fearY[b.id] !== y) { feats(p, b, xf); const B0 = BASE[eraOf(p)], pm = sig(B0 + dot(st.w, xf)), p0 = sig(B0 + dot(W0, xf)), hd = heardOf(b); fearV[b.id] = p0 + hd * (pm - p0); baseV[b.id] = p0; fearY[b.id] = y; }
      return [fearV[b.id], baseV[b.id]];
    }
    // how much more than they would of anyone (1: as anyone)
    const fearRel = (b) => { const f = fear(b); return f ? f[0] / Math.max(1e-4, f[1]) : 1; };
    // the least dread that counts in his age (half again what realms of the age give a neighbour: in our own day's short turns a
    // chance of a few in a thousand a turn is a great one), and whether b dreads him: much more than it would anyone, and enough to count
    const floor = () => { const p = h.player(); return 1.5 * sig(BASE[p ? eraOf(p) : 2]); };
    const dreads = (b, rel) => { const f = fear(b); if (!f) return false; const r = f[0] / Math.max(1e-4, f[1]); return (r > (rel || 1.5) && f[0] > floor()) || f[0] > 0.25; };
    // why b fears him more or less than anyone: what in the model moves its dread, most first ([feature, by how much in log-odds])
    function why(b) {
      const p = h.player(); if (!p || !b || b === p) return []; feats(p, b, xf); const hd = heardOf(b), out = [];
      for (let k = 0; k < NF; k++) { const v = (st.w[k] - W0[k]) * xf[k] * hd; if (Math.abs(v) >= 0.15) out.push([WAR[k][0], v]); }
      return out.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    }
    // their watch for his agents: 0 to 1 (agents of his caught in the realm itself within three turns count most)
    function watchOf(b) {
      const p = h.player(); if (!p || !b || b === p) return 0; const B = belief(b); const P = PACE[eraOf(b)];
      const own = Math.max(0, 1 - (year() - st.caught[b.id]) / (3 * P));
      return clamp(Math.max(own * 0.8, 4 * (B.plots - PLOT0[0] / PLOT0[1])), 0, 1);
    }
    // his appetite as the realms about him reckon it: what each he could fall on dreads, on the whole, against what it would dread of
    // anyone in his place ([mean, usual]; with nobody about him, a neighbour of his own weight)
    function appetite() {
      const p = h.player(), B0 = BASE[p ? eraOf(p) : 2]; let m = 0, m0 = 0, n = 0;
      for (const e of st.cand) { if (e.s !== 1) continue; let z = B0, z0 = B0; for (let k = 0; k < NF; k++) { const x = e.x[k] / Q; z += st.w[k] * x; z0 += W0[k] * x; } m += sig(z); m0 += sig(z0); n++; }
      return n ? [m / n, m0 / n] : [sig(B0 + st.w[0]), sig(B0)];
    }
    // the world's picture of him, for the page: what the model makes of each feature (how many times likelier than of anyone), the
    // rest of what is believed, and the counts it rests on
    function profile() {
      const B = belief(null); const odds = WAR.map((f, k) => ({ key: f[0], what: f[1], x: Math.exp(st.w[k] - W0[k]), w: st.w[k] }));
      const A = appetite(); return { odds, base: A[0], base0: A[1], keep4: B.keep(4), ally: B.ally, gives: B.gives, harsh: B.harsh, plots: B.plots, takes: Object.fromEntries(Object.keys(st.acc).map((k) => [k, takes(k)])), tot: Object.assign({}, st.tot), T: st.T };
    }
    // those who fear him more than they would anyone (or fear him much whatever they would think of anyone), and know enough of him to
    // say so: [realm, fear, usual], most first
    let fearList = null, fearKey = '';
    function fearful(rel) {
      const p = h.player(); if (!p) return []; const key = year() + ':' + ver + ':' + (rel || 1.4);
      if (key === fearKey && fearList) return fearList; const out = [];
      for (let c = 0; c < MAXC; c++) { const b = civs[c]; if (!b || b === p || st.heard[c] < 64 || !dreads(b, rel || 1.4)) continue; const f = fear(b); out.push([b, f[0], f[1]]); }
      fearKey = key; fearList = out.sort((x, y) => y[1] / y[2] - x[1] / x[2]); return fearList;
    }

    // ----- his court: what it learns of his choices -----
    // a story's choices as the court sees them (story.js makes the vectors); his choice among them
    function chose(phi, i) {
      if (!phi || phi.length < 2 || !(i >= 0 && i < phi.length)) return; const H = st.habit;
      H.sets.push({ phi: phi.map((f) => Array.from(f, r3)), i, n: H.n }); if (H.sets.length > MAXCH) H.sets.shift(); H.n++;
      for (const S of H.sets) S.c = Math.pow(0.5, (H.n - 1 - S.n) / HALF_CH);
      H.th.set(TH0); softmaxFit(H.sets, H.th, TH0, HLAM, 160); for (let k = 0; k < NH; k++) if (!Number.isFinite(H.th[k])) { H.th.set(TH0); break; }
      ver++;
    }
    // the choice the court expects of him: { i, p } (p: how sure), or null while it has seen too few of his choices to say
    function expect(phi, ok) {
      const H = st.habit; if (!phi || !phi.length || H.n < 3) return null; const P = probs(phi, H.th); let best = -1;
      for (let j = 0; j < P.length; j++) if ((!ok || ok[j]) && (best < 0 || P[j] > P[best])) best = j; return best < 0 ? null : { i: best, p: P[best] };
    }
    // what he leans to, for the page: each part of a choice and how much more (or less) than a court would weigh it
    function leanings() { const H = st.habit; return HAB.map((f, k) => ({ key: f[0], what: f[1], by: H.th[k] - TH0[k], th: H.th[k] })).filter((x) => Math.abs(x.by) >= 0.3).sort((x, y) => Math.abs(y.by) - Math.abs(x.by)); }
    // a discovery he chose himself, by its branch; and how his scholars weigh a branch when they choose for themselves
    function studied(branch) { const H = st.habit; if (!(branch >= 0 && branch < H.kb.length)) return; for (let k = 0; k < H.kb.length; k++) H.kb[k] *= 0.93; H.kb[branch] += 1; H.kn++; }
    function taste(branch, nb) { const H = st.habit; let t = 0; for (let k = 0; k < (nb || 6); k++) t += H.kb[k]; if (H.kn < 3 || t <= 0) return 1; return 0.35 + 3.9 * (H.kb[branch] || 0) / t; }
    const tastes = (nb) => { const H = st.habit; let t = 0; for (let k = 0; k < (nb || 6); k++) t += H.kb[k]; return Array.from(H.kb.slice(0, nb || 6), (v) => (t > 0 ? v / t : 0)); };

    // ----- saved with the world -----
    function save() {
      const H = st.habit;
      return { v: 1, nf: NF, T: st.T, next: st.next, seen: st.seen, told: st.told, w: Array.from(st.w, r3), n: st.n, X: b64(st.X.subarray(0, st.n * NF)), Y: b64(st.Y.subarray(0, st.n)), E: b64(st.E.subarray(0, st.n)), C: Array.from(st.C.subarray(0, st.n), (v) => Math.round(v * 100) / 100), TT: Array.from(st.TT.subarray(0, st.n)),
        cand: st.cand.map((e) => [e.b, b64(e.x), Math.round(e.s * 100) / 100, e.y, e.e]), acc: Object.fromEntries(Object.entries(st.acc).map(([k, a]) => [k, a.map(r3)])), oath: st.oath.map(r3), ally: st.ally.map(r3), give: st.give.map(r3), harsh: st.harsh.map(r3), plot: st.plot.map(r3), tot: st.tot,
        heard: b64(st.heard), prey: Array.from(st.prey).map((v, c) => (v ? [c, r3(v)] : null)).filter(Boolean), caught: Array.from(st.caught).map((y, c) => (y > -1e8 ? [c, y] : null)).filter(Boolean),
        habit: { th: Array.from(H.th, r3), sets: H.sets.map((S) => [S.phi, S.i, S.n]), n: H.n, kb: Array.from(H.kb, r3), kn: H.kn } };
    }
    function load(s) {
      const f = fresh(); Object.assign(st, f); ver++; fearY.fill(-2147483648);
      if (!s || s.v !== 1) return false;
      try {
        st.T = s.T | 0; st.next = s.next; st.seen = s.seen === undefined ? -1 : s.seen; if (s.told && s.told.a && s.told.w) st.told = { a: s.told.a, w: s.told.w }; const same = (s.nf || NF) === NF;      // (what a court weighs of a war may grow: a save of another shape keeps all but its examples)
        if (same && Array.isArray(s.w) && s.w.length === NF) st.w = Float64Array.from(s.w);
        if (same) { const X = unb64(s.X), Y = unb64(s.Y); const n = Math.min(MAXEX, s.n | 0, Y.length, Math.floor(X.length / NF)); st.X.set(X.subarray(0, n * NF)); st.Y.set(Y.subarray(0, n)); st.C.set((s.C || []).slice(0, n)); st.TT.set((s.TT || []).slice(0, n)); st.E.set(unb64(s.E).subarray(0, n)); st.n = n;
          st.cand = (s.cand || []).map(([b, x, sv, y, e]) => ({ b, x: unb64(x), s: sv, y, e: e === undefined ? 2 : e })).filter((e) => e.x.length === NF); }
        for (const k of ['oath', 'ally', 'give', 'harsh', 'plot']) if (Array.isArray(s[k])) st[k] = s[k].slice(0, 2);
        if (s.acc) for (const k in st.acc) if (Array.isArray(s.acc[k])) st.acc[k] = s.acc[k].slice(0, 2);
        if (s.tot) Object.assign(st.tot, s.tot);
        const hd = unb64(s.heard); st.heard.set(hd.subarray(0, MAXC)); for (const [c, y] of s.caught || []) if (c >= 0 && c < MAXC) st.caught[c] = y; for (const [c, v] of s.prey || []) if (c >= 0 && c < MAXC) st.prey[c] = v;
        const H = s.habit; if (H) { if (Array.isArray(H.th) && H.th.length === NH) st.habit.th = Float64Array.from(H.th); st.habit.sets = (H.sets || []).map(([phi, i, n2]) => ({ phi, i, n: n2 })); st.habit.n = H.n | 0; if (H.kb) st.habit.kb.set(H.kb.slice(0, 8)); st.habit.kn = H.kn | 0; }
        for (let k = 0; k < NF; k++) if (!Number.isFinite(st.w[k])) { st.w.set(W0); break; }
      } catch (e) { Object.assign(st, fresh()); return false; }
      return true;
    }
    return { st, player: () => h.player(), floor, dreads, step, declared, oath, called, pressed, terms, annexed, plot, answered, takes, born, belief, fear, fearRel, why, watchOf, profile, fearful, chose, expect, leanings, studied, taste, tastes, save, load,
      feats: (p, b) => Array.from(feats(p, b, new Float64Array(NF))), get ver() { return ver; }, heardOf };
  }
  return { WAR, NF, FK, W0, BASE, HAB, NH, TH0, HALF, OATH0, ALLY0, GIVE0, HARSH0, PLOT0, newton, chol, softmaxFit, probs, sig, create };
})();
