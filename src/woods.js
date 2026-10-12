// Holocene woods (classic script; exposes window.WOODS): the world's woods. Every region of the land has a share that would stand
// in wood by nature (pot: the trees of our own day where they stand, or what its kind of land carries - the oak and beech of the
// temperate north, the rainforest, the taiga - where the fields are now), and a share that stands in wood now (cover). In 10,000 BC
// the woods are nature's, nothing under the ice, and the land the ice leaves grows its woods back over centuries. Where a realm farms,
// its people clear what their fields, pasture and fallow take - so much land a head, by the age (shifting fields and long fallows
// first, less as farming grows more intense, far less once machines and fertiliser feed many from little) - and they take it where
// the land can be farmed: where the farmland and pasture of our own day lie (the plains cleared, the hills and mountains wooded),
// and where they live; at the pace of their tools: fire and stone axes, bronze, iron axes, saws, steam and machines. Where they leave, the wood grows back: half in some sixty years. What
// it gives: timber at the market by the woods that stand, and the picture - fields and woods where they are, not where somebody
// farms this year. The player's word on his woods: cleared as the farmers will, kept for the crown (the royal forests: cleared more
// slowly and less, a little less food, the nobles' hunting grounds), or planted (from the Industrial age: woods grow back fast on
// land nobody farms, for a share of the realm's income).
// Everything is flat arrays a region long; a fifth of the land is looked at each year (LAP).
//   WOODS.create(h) -> { pot, cover, step, cleared, woodF, foodF, incF, policy, setPolicy, of, bandOf, stats, save, load, settle } for one world.
window.WOODS = (function () {
  'use strict';
  // what share of a region's land stands in wood by nature, by its kind of land (land.js CLASSES: sea, ice, tundra, boreal, desert,
  // steppe, grassland, temperate woods, Mediterranean, monsoon farmland, savanna, rainforest, tropical highlands, high plateau,
  // continental woods, tropical Asia) - the most of the kind's land that is not bog, rock, open grass or a river's water
  const POT = [0, 0, 0.08, 0.85, 0.02, 0.08, 0.15, 0.9, 0.55, 0.7, 0.3, 0.95, 0.6, 0.08, 0.85, 0.9];
  // how much of a region's pasture was wood before it was grazed (in wooded country the cattle graze where the wood was; the
  // steppe was always grass: pot keeps the two apart)
  const PAST_CLEAR = 0.6;
  // how much more than the farmland and pasture of our own day a people that uses its land to the full keeps clear, by age: long
  // fallows and shifting fields, then two and three fields, the commons and the wood-pasture, the new husbandry; machines, fertiliser
  // and new seed feed more from less, the poorer fields are given up and the woods come back to them (the forests of Europe, New
  // England and Japan are larger now than in 1850)
  const EXT = [1.8, 1.8, 1.7, 1.7, 1.7, 1.6, 1.5, 1.2, 1.1, 1.05];
  // how much land a head its farming keeps clear, in hectares, by age: fields, pasture, meadow and fallow, the commons' grazing and
  // the village (the world's farmland and pasture were some five hectares a head about 1700, four in 1850, a little over one now:
  // less here, since a realm's people are not all its farmers' land - the steppe's herds graze what was never wood)
  const HA = [5, 5, 4.5, 4, 3.6, 3.3, 2.5, 1.5, 1.0, 0.8];
  // how fast people clear what they need, the share of what is left to clear in a year, by age: fire and stone axes, bronze, iron
  // axes, the Classical and Medieval ages' saws and ploughs, gunpowder's age, steam, machines
  const CLEAR = [0.004, 0.008, 0.015, 0.02, 0.025, 0.03, 0.05, 0.08, 0.08, 0.06];
  // how fast a wood grows back where nobody needs the land (a share of what is missing in a year: half in some sixty years); on the
  // land the ice has just left it is the trees' own march north, over centuries
  const GROW = 0.012, GROW_ICE = 0.0025;
  // the player's word on his woods: [key, name, text, how much of what the fields need is cleared, how fast, regrowth, food, income]
  const POLICY = [
    ['clear', 'Cleared as the farmers will', 'Fields and pasture take what wood they need.', 1, 1, 1, 1, 1],
    ['keep', 'Kept for the crown', 'Royal forests: the woods are the crown\'s hunting grounds and its timber. Cleared slowly and less; a little less food.', 0.75, 0.5, 1, 0.97, 1],
    ['plant', 'Planted', 'Foresters plant where nobody farms: the woods grow back three times as fast, for a share of the realm\'s income.', 1, 1, 3, 1, 0.98],
  ];
  const PK = {}; POLICY.forEach((p, k) => { PK[p[0]] = k; });
  const PLANT_ERA = 6;      // (forestry: from the Industrial age)
  const LAP = 5, Q = 250;   // (a fifth of the land a year; cover and pot in steps of 1/250)
  const MINW = 25;          // (woods worth the name: a tenth of a region's land and more)
  const CELL_KM2 = 3086;    // (a region at the equator is half a degree square)
  // the lens of the woods: how much of nature's woods stands, place by place (land with next to no wood by nature unpainted)
  const BANDS = [
    { key: 'none', name: 'Little wood by nature', css: 'transparent', rgb: [0, 0, 0] },
    { key: 'wild', name: 'Wildwood (nine tenths and more)', css: '#1f4d2b', rgb: [0.12, 0.3, 0.17] },
    { key: 'woods', name: 'Woods with clearings (six to nine tenths)', css: '#4a7a3c', rgb: [0.29, 0.48, 0.24] },
    { key: 'thin', name: 'Thinned (three to six tenths)', css: '#a59f4e', rgb: [0.65, 0.62, 0.31] },
    { key: 'cleared', name: 'Cleared for fields (under three tenths)', css: '#c98f55', rgb: [0.79, 0.56, 0.33] },
    { key: 'regrow', name: 'Growing back', css: '#86c27a', rgb: [0.53, 0.76, 0.48] },
  ];
  const BK = {}; BANDS.forEach((b, k) => { b.id = k; BK[b.key] = k; });
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // h: { N, W, H, LI, MAXC, soil (N * 3: kind and today's trees, farmland, pasture), owner, use (Uint8 a region: its people against
  //      what it feeds, x 255, from the simulation's pass over the land), civs, popOf(c) (thousands), ice (Uint8 a region or null: the
  //      ice or a lake of the wet centuries over it), year(), cult(i) (how far a realm uses a region's land, for the picture where
  //      nature has next to no wood) }
  function create(h) {
    const N = h.N, W = h.W, H = h.H, LI = h.LI, MAXC = h.MAXC, soil = h.soil, owner = h.owner, use = h.use, civs = h.civs, ice = h.ice;
    const pop = h.pop, wood = h.wood, goods = h.goods, GT = h.gTimber;      // (who lives where, and the timber a region gives: for what the world's woods yield on the whole)
    const sup = new Float32Array(MAXC), fr = new Float32Array(MAXC);      // (each realm's land that can be farmed where its people live, km2; and the share of it they need)
    const wantK = new Float32Array(MAXC), rateK = new Float32Array(MAXC), growK = new Float32Array(MAXC).fill(1);      // (each realm's clearing, its pace and its regrowth, by its age and its word: made with the tally)
    const iced = (i) => ice !== null && ice[i] !== 0;
    const pot = new Uint8Array(N), cover = new Uint8Array(N), need = new Uint8Array(N), wild = new Uint8Array(N);      // (wild: land the ice has left, growing its first woods)
    // (a region's square kilometres in a step of 1/Q: a region shrinks toward the poles)
    const rowA = new Float32Array(H); for (let y = 0; y < H; y++) rowA[y] = CELL_KM2 * Math.cos((90 - (y + 0.5) / H * 180) * Math.PI / 180) / Q;
    const stats = { ms: 0, years: 0, cleared: 0, grown: 0 };
    let lap = 0;
    for (let k = 0; k < LI.length; k++) {
      const i = LI[k], r = soil[i * 3], kind = r & 15, tree = (r >> 4) / 15, farm = soil[i * 3 + 1] / 255, past = soil[i * 3 + 2] / 255;
      const p = Math.max(tree, POT[kind]); pot[i] = Math.round(p * Q); need[i] = Math.round(Math.min(1, farm + PAST_CLEAR * past) * Q);
      if (iced(i)) { cover[i] = 0; wild[i] = 1; } else cover[i] = pot[i];
    }
    // (the regions that have woods worth the name by nature, a tenth of their land and more: the only ones that are cleared and grow
    // back - the steppe's few trees, the desert's and the tundra's are as nature has them, and their fields are their people's; and
    // every region's square kilometres in a step of 1/Q, in the order of the land)
    const WL = Int32Array.from(LI.filter((i) => pot[i] >= MINW)), LA = new Float32Array(LI.length); for (let k = 0; k < LI.length; k++) LA[k] = rowA[(LI[k] / W) | 0];
    function policy(cv) { const w = cv && cv.woods; return w && PK[w.k] !== undefined ? PK[w.k] : 0; }
    const farms = (cv) => clamp((cv.tech - 0.025) / 0.1, 0, 1);      // (as the simulation's cultivation: a band that does not farm clears nothing)
    // (where people live on it: a region its people use to the half and more counts whole, an empty one not at all)
    const here = (i) => (use[i] >= 128 ? 1 : use[i] / 128);
    // how much of each realm's land can be farmed where its people live (its square kilometres, in steps of 1/Q), over a piece of the
    // land: a fifth of it is counted each year and the sum is taken once all five are in (supAcc), the whole at once after a load
    // ... and, over the same piece, what the woods its people live in yield against what nature's would (acc: the people on timber-
    // giving land, and the same weighed by their woods). Timber is measured against the age, as every edge is: a region's woods
    // yield what they would by nature times the share that stands, over what the woods the world's people live in yield on the whole
    // (wfK) - the world has the timber it always had, and a realm that has cleared its woods has less of it than one that kept them
    const supAcc = new Float32Array(MAXC), wfAcc = new Float64Array(2), wfAll = new Float64Array(2); let partial = true, wfK = 1;
    function scan(k0, k1, into, acc) {
      for (let k = k0; k < k1; k++) {
        const o = owner[LI[k]]; if (o < 0) continue; const i = LI[k]; into[o] += need[i] * LA[k] * here(i);
        const P = pot[i]; if (P >= MINW) { const v = pop[i] * (wood[i] + (goods[i] === GT ? 1 : 0)); if (v > 0) { acc[0] += v; acc[1] += v * (0.25 + 0.75 * cover[i] / P); } }
      }
    }
    const setK = (a) => { wfK = a[1] > 0 ? Math.min(3, a[0] / a[1]) : 1; };
    function tally() { sup.fill(0); wfAll.fill(0); scan(0, LI.length, sup, wfAll); setK(wfAll); rates(); }
    // every LAP years: the share of its land each realm's people need (so much land a head, by the age), and what they clear, how
    // fast, and how fast the woods grow back on it, by its age and its word
    function rates() {
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; wantK[c] = 0; rateK[c] = 0; growK[c] = 1; if (!cv) { fr[c] = 0; continue; }
        const e = clamp(cv.era | 0, 0, 9), pol = cv.player ? POLICY[policy(cv)] : POLICY[0];
        fr[c] = sup[c] > 0 ? Math.min(1, h.popOf(c) * 10 * HA[e] / (sup[c] * EXT[e])) : 0;
        wantK[c] = EXT[e] * fr[c] * farms(cv) * pol[3]; rateK[c] = CLEAR[e] * pol[4]; growK[c] = pol[5];
      }
    }
    // what a region's people keep cleared, in steps of 1/Q (more than nature's woods is all of them)
    const want = (i, o) => need[i] * here(i) * wantK[o];
    // a fifth of the land: every region toward what its people need cleared, at the pace of their tools; the wood grows back where
    // they need less
    function step() {
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0; stats.years++;
      lap = (lap + 1) % LAP; scan(Math.floor(LI.length * lap / LAP), Math.floor(LI.length * (lap + 1) / LAP), supAcc, wfAcc);
      if (lap === LAP - 1) { if (partial) { sup.fill(0); wfAll.fill(0); scan(0, LI.length, sup, wfAll); setK(wfAll); partial = false; } else { sup.set(supAcc); setK(wfAcc); } supAcc.fill(0); wfAcc.fill(0); rates(); }
      for (let k = Math.floor(WL.length * lap / LAP), k1 = Math.floor(WL.length * (lap + 1) / LAP); k < k1; k++) {      // (a fifth of the land in one piece: the arrays are read in order)
        const i = WL[k], P = pot[i], o = owner[i];
        if (cover[i] === P && (o < 0 || wantK[o] === 0)) continue;      // (woods nobody clears: nothing to do - most of the world, most of the time; never under the ice, where nothing stands)
        if (ice !== null && ice[i] !== 0) { cover[i] = 0; wild[i] = 1; continue; }
        let tgt = P, rate = 0, grow = wild[i] ? GROW_ICE : GROW;
        if (o >= 0) { const w = need[i] * here(i) * wantK[o]; if (w > 0) { tgt = w >= P ? 0 : P - w; rate = rateK[o]; } grow *= growK[o]; }
        const c = cover[i];
        if (c > tgt + 0.5) { const d = (c - tgt) * Math.min(1, rate * LAP); if (d > 0) { const n = Math.max(0, Math.round(c - Math.max(d, 0.5))); stats.cleared += c - n; cover[i] = n; } }
        else if (c < tgt - 0.5) { const d = (tgt - c) * Math.min(1, grow * LAP); const n = Math.min(P, Math.round(c + Math.max(d, 0.5))); stats.grown += n - c; cover[i] = n; if (wild[i] && n * 2 > P) wild[i] = 0; }
      }
      stats.ms += (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    }
    // how far a region's woods are cleared, against nature's (0: wildwood, 1: none left); where nature has next to no wood, how far
    // its people use the land (the picture's fields)
    // (the land the ice has left is bare because its woods have not come yet, not because anybody cleared it: its fields are its
    // people's, as before)
    function cleared(i) { const P = pot[i]; return P >= MINW && wild[i] === 0 ? 1 - cover[i] / P : h.cult(i); }
    // the timber a region yields: what its woods would by nature times the share that stands (hedgerows, coppices and orchards keep a
    // quarter where they are gone), against the age (wfK); and the first part alone, for the page
    function woodF(i) { const P = pot[i]; return P >= MINW ? (0.25 + 0.75 * cover[i] / P) * wfK : 1; }
    function woodOwn(i) { const P = pot[i]; return P >= MINW ? 0.25 + 0.75 * cover[i] / P : 1; }
    // what the player's word costs: food (royal forests), income (planting)
    function foodF(cv) { return cv && cv.player ? POLICY[policy(cv)][6] : 1; }
    function incF(c) { const cv = civs[c]; return cv && cv.player ? POLICY[policy(cv)][7] : 1; }
    function setPolicy(cv, key) { if (PK[key] === undefined) return 'No such word'; if (key === 'plant' && (cv.era | 0) < PLANT_ERA) return 'Needs the Industrial age'; (cv.woods || (cv.woods = { k: 'clear' })).k = key; rates(); return null; }
    // a realm's woods: how much of its land stands in wood and how much would by nature (in square kilometres), and the share
    function of(c) { let w = 0, n = 0; for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] !== c) continue; const a = LA[k]; w += cover[i] * a; n += pot[i] * a; } return { now: w, nature: n, share: n > 0 ? w / n : 1 }; }
    // every realm's woods at once, in square kilometres (one pass over the land): { now, nature } a realm long
    function realms() { const now = new Float64Array(MAXC), nat = new Float64Array(MAXC); for (let k = 0; k < LI.length; k++) { const i = LI[k], o = owner[i]; if (o < 0) continue; const a = LA[k]; now[o] += cover[i] * a; nat[o] += pot[i] * a; } return { now, nature: nat }; }
    // the world's woods and one realm's, by the bands of the lens (in square kilometres of nature's woods: how much of the woods
    // that would stand is wildwood, thinned, cleared or growing back), and what stands against what would
    function census(me) {
      const n = new Float64Array(BANDS.length), mine = new Float64Array(BANDS.length); let now = 0, nat = 0, mNow = 0, mNat = 0;
      for (let k = 0; k < LI.length; k++) { const i = LI[k], P = pot[i]; if (P === 0) continue; const a = LA[k], b = bandOf(i), v = P * a; n[b] += v; now += cover[i] * a; nat += v; if (owner[i] === me) { mine[b] += v; mNow += cover[i] * a; mNat += v; } }
      return { n, mine, now, nature: nat, meNow: mNow, meNature: mNat };
    }
    // the lens of the woods: how much of nature's woods stands in a region (BANDS), and whether they are growing back - where the
    // woods are short of what its people leave standing, by a twelfth and more
    function bandOf(i) {
      const P = pot[i]; if (P < MINW || iced(i)) return BK.none;
      const c = cover[i], f = c / P;
      if (f < 0.9) { const o = owner[i]; let tgt = P; if (o >= 0) { const w = want(i, o); if (w > 0) tgt = w >= P ? 0 : P - w; } if (c < tgt - Math.max(2, P / 12)) return BK.regrow; }
      return f >= 0.9 ? BK.wild : f >= 0.6 ? BK.woods : f >= 0.3 ? BK.thin : BK.cleared;
    }
    // saved: the woods of the land, region by region (one byte each, the land's regions in order), and which of them are the land the
    // ice has left, growing its first woods (a bit each)
    const pack = (b) => { let s = ''; for (let k = 0; k < b.length; k += 8192) s += String.fromCharCode.apply(null, b.subarray(k, k + 8192)); return btoa(s); };
    function save() {
      const b = new Uint8Array(LI.length), wb = new Uint8Array((LI.length + 7) >> 3); let any = false;
      for (let k = 0; k < LI.length; k++) { const i = LI[k]; b[k] = cover[i]; if (wild[i]) { wb[k >> 3] |= 1 << (k & 7); any = true; } }
      return { lap, c: pack(b), w: any ? pack(wb) : undefined };
    }
    function load(s) {
      tally(); partial = true; supAcc.fill(0); wfAcc.fill(0); if (!s || !s.c) return false; const t = atob(s.c); if (t.length !== LI.length) return false; lap = s.lap | 0;
      const wt = s.w ? atob(s.w) : ''; wild.fill(0);
      for (let k = 0; k < LI.length; k++) { const i = LI[k]; cover[i] = Math.min(pot[i], t.charCodeAt(k)); if (wt.length > k >> 3 && (wt.charCodeAt(k >> 3) >> (k & 7)) & 1) wild[i] = 1; if (iced(i)) { cover[i] = 0; wild[i] = 1; } }
      return true;
    }
    // a world saved before the woods: as much wood as its people's fields leave, nature's wherever nobody farms
    function settle() { tally(); for (let k = 0; k < LI.length; k++) { const i = LI[k], P = pot[i], o = owner[i]; if (iced(i)) { cover[i] = 0; continue; } const w = o >= 0 && P >= MINW ? want(i, o) : 0; cover[i] = w >= P ? 0 : Math.round(P - w); } }
    return { pot, cover, need, wild, sup, fr, wantK, step, cleared, woodF, woodOwn, get wfK() { return wfK; }, foodF, incF, policy, setPolicy, of, realms, census, bandOf, stats, save, load, settle };
  }
  return { create, POT, EXT, HA, CLEAR, GROW, POLICY, PK, PLANT_ERA, Q, BANDS, BK };
})();
