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
//   WOODS.create(h) -> { pot, cover, step, cleared, woodF, foodF, incF, policy, setPolicy, of, stats, save, load, settle } for one world.
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
  const EXT = [1.8, 1.8, 1.7, 1.7, 1.7, 1.6, 1.5, 1.2, 1.1];
  // how much land a head its farming keeps clear, in hectares, by age: fields, pasture, meadow and fallow, the commons' grazing and
  // the village (the world's farmland and pasture were some five hectares a head about 1700, four in 1850, a little over one now:
  // less here, since a realm's people are not all its farmers' land - the steppe's herds graze what was never wood)
  const HA = [5, 5, 4.5, 4, 3.6, 3.3, 2.5, 1.5, 1.0];
  // how fast people clear what they need, the share of what is left to clear in a year, by age: fire and stone axes, bronze, iron
  // axes, the Classical and Medieval ages' saws and ploughs, gunpowder's age, steam, machines
  const CLEAR = [0.004, 0.008, 0.015, 0.02, 0.025, 0.03, 0.05, 0.08, 0.08];
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
  const CELL_KM2 = 3086;    // (a region at the equator is half a degree square)
  // the lens of the woods: how much of nature's woods stands, place by place (land with next to no wood by nature unpainted)
  const BANDS = [
    { key: 'none', name: 'Little wood by nature', css: 'transparent', rgb: [0, 0, 0] },
    { key: 'wild', name: 'Wildwood (nine tenths of nature\'s and more)', css: '#1f4d2b', rgb: [0.12, 0.3, 0.17] },
    { key: 'woods', name: 'Woods with clearings (six to nine tenths)', css: '#4a7a3c', rgb: [0.29, 0.48, 0.24] },
    { key: 'thin', name: 'Thinned (three to six tenths)', css: '#a59f4e', rgb: [0.65, 0.62, 0.31] },
    { key: 'cleared', name: 'Cleared for fields and pasture (under three tenths)', css: '#c98f55', rgb: [0.79, 0.56, 0.33] },
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
    function policy(cv) { const w = cv && cv.woods; return w && PK[w.k] !== undefined ? PK[w.k] : 0; }
    const farms = (cv) => clamp((cv.tech - 0.025) / 0.1, 0, 1);      // (as the simulation's cultivation: a band that does not farm clears nothing)
    // (where people live on it: a region its people use to the half and more counts whole, an empty one not at all)
    const here = (i) => (use[i] >= 128 ? 1 : use[i] / 128);
    // every LAP years: how much of each realm's land can be farmed where its people live, and the share of it they need (so much
    // land a head, by the age)
    function tally() {
      sup.fill(0); for (let k = 0; k < LI.length; k++) { const i = LI[k], o = owner[i]; if (o >= 0) sup[o] += need[i] * rowA[(i / W) | 0] * here(i); }
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; wantK[c] = 0; rateK[c] = 0; growK[c] = 1; if (!cv) { fr[c] = 0; continue; }
        const e = clamp(cv.era | 0, 0, 8), pol = cv.player ? POLICY[policy(cv)] : POLICY[0];
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
      lap = (lap + 1) % LAP; if (lap === 0) tally();
      for (let k = lap; k < LI.length; k += LAP) {
        const i = LI[k], P = pot[i]; if (P === 0) continue;
        if (ice !== null && ice[i] !== 0) { cover[i] = 0; wild[i] = 1; continue; }
        const o = owner[i]; let tgt = P, rate = 0, grow = wild[i] ? GROW_ICE : GROW;
        if (o >= 0) { const w = need[i] * here(i) * wantK[o]; if (w > 0) { tgt = w >= P ? 0 : P - w; rate = rateK[o]; } grow *= growK[o]; }
        const c = cover[i];
        if (c > tgt + 0.5) { const d = (c - tgt) * Math.min(1, rate * LAP); if (d > 0) { const n = Math.max(0, Math.round(c - Math.max(d, 0.5))); stats.cleared += c - n; cover[i] = n; } }
        else if (c < tgt - 0.5) { const d = (tgt - c) * Math.min(1, grow * LAP); const n = Math.min(P, Math.round(c + Math.max(d, 0.5))); stats.grown += n - c; cover[i] = n; if (wild[i] && n * 2 > P) wild[i] = 0; }
      }
      stats.ms += (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    }
    // how far a region's woods are cleared, against nature's (0: wildwood, 1: none left); where nature has next to no wood, how far
    // its people use the land (the picture's fields)
    function cleared(i) { const P = pot[i]; return P >= 13 ? 1 - cover[i] / P : h.cult(i); }
    // the timber a region yields against what its woods would yield by nature: hedgerows, coppices and orchards keep a quarter
    function woodF(i) { const P = pot[i]; return P >= 13 ? 0.25 + 0.75 * cover[i] / P : 1; }
    // what the player's word costs: food (royal forests), income (planting)
    function foodF(cv) { return cv && cv.player ? POLICY[policy(cv)][6] : 1; }
    function incF(c) { const cv = civs[c]; return cv && cv.player ? POLICY[policy(cv)][7] : 1; }
    function setPolicy(cv, key) { if (PK[key] === undefined) return 'No such word'; if (key === 'plant' && (cv.era | 0) < PLANT_ERA) return 'Needs the Industrial age'; (cv.woods || (cv.woods = { k: 'clear' })).k = key; tally(); return null; }
    // a realm's woods: how much of its land stands in wood and how much would by nature (in square kilometres), and the share
    function of(c) { let w = 0, n = 0; for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] !== c) continue; const a = rowA[(i / W) | 0]; w += cover[i] * a; n += pot[i] * a; } return { now: w, nature: n, share: n > 0 ? w / n : 1 }; }
    // saved: the woods of the land, region by region (one byte each, the land's regions in order)
    function save() { let s = ''; const b = new Uint8Array(LI.length); for (let k = 0; k < LI.length; k++) b[k] = cover[LI[k]]; for (let k = 0; k < b.length; k += 8192) s += String.fromCharCode.apply(null, b.subarray(k, k + 8192)); return { lap, c: btoa(s) }; }
    function load(s) { tally(); if (!s || !s.c) return false; const t = atob(s.c); if (t.length !== LI.length) return false; lap = s.lap | 0; for (let k = 0; k < LI.length; k++) cover[LI[k]] = Math.min(pot[LI[k]], t.charCodeAt(k)); wild.fill(0); for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (iced(i)) { cover[i] = 0; wild[i] = 1; } } return true; }
    // a world saved before the woods: as much wood as its people's fields leave, nature's wherever nobody farms
    function settle() { tally(); for (let k = 0; k < LI.length; k++) { const i = LI[k], P = pot[i], o = owner[i]; if (iced(i)) { cover[i] = 0; continue; } const w = o >= 0 ? want(i, o) : 0; cover[i] = w >= P ? 0 : Math.round(P - w); } }
    return { pot, cover, need, step, cleared, woodF, foodF, incF, policy, setPolicy, of, stats, save, load, settle };
  }
  return { create, POT, EXT, HA, CLEAR, GROW, POLICY, PK, PLANT_ERA, Q };
})();
