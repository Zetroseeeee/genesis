// HOLOCENE vernacular: how a house is built where it stands. Pure data (no THREE): the world's building regions, what each of
// them built age by age (its styles, and how far into an age one gives way to the next), what the place does to a style (the
// climate's snow, rain and heat, the stone of the hills, the wood that is left), and the house types a town of it is built from.
// Classic script; exposes window.VERN. houses.js turns a type (a genome) into a mesh; town.js gives every plot its type.
//
// The idea is the vernacular's own: a people builds with what the land gives and what the weather asks, in the forms its
// fathers used, and the forms move slowly - a town of a new age is the old one rebuilt house by house. A style here is a
// recipe of ranges and weights (footprint, storeys, roof and pitch, walls, windows, chimneys, galleries ...); a town draws a
// dozen and more types from it, each its own house, and every plot one of them with its own paint.
(function () {
  'use strict';
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function h32(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function strHash(s) { let h = 2166136261; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; }
  // a small generator: the same seed gives the same house
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pickT = (t, r) => { if (!t || typeof t !== 'object' || Array.isArray(t)) return t; let s = 0; for (const k in t) s += t[k]; let x = r * s; for (const k in t) { x -= t[k]; if (x <= 0) return k; } return Object.keys(t)[0]; };
  const inR = (a, r) => Array.isArray(a) ? a[0] + (a[1] - a[0]) * r : a;
  const HEXN = new Map(); const hexN = (s) => { let v = HEXN.get(s); if (v === undefined) { v = parseInt(s.slice(1), 16); HEXN.set(s, v); } return v; };      // (a town asks for its colours thousands of times)

  // ---------- materials: what a wall or roof is made of, and the generated material it is drawn with ----------
  // L: layer of the wall (or roof) texture array; R: a wall drawn with the roof array's layer (reed, palm, turf); p: takes the
  // paint (1) or keeps its own colour (0) or between; rot: the texture turned a quarter (boards laid as logs); t: a tint
  const WALLM = {
    mud: { L: 0, p: 0.75 }, plaster: { L: 1, p: 1 }, lime: { L: 1, p: 1 }, stucco: { L: 1, p: 1 }, coral: { L: 1, p: 1 }, daub: { L: 2, p: 1 }, cob: { L: 2, p: 1 },
    rubble: { L: 3, p: 0.15 }, flint: { L: 3, p: 0.5, t: '#7d7a76' }, granite: { L: 3, p: 0.35, t: '#b3afa8' }, brick: { L: 4, p: 0.12 }, concrete: { L: 5, p: 0.85 }, glass: { L: 6, p: 0 },
    boards: { L: 7, p: 0.2 }, ashlar: { L: 8, p: 0.12 }, marble: { L: 9, p: 0 }, ybrick: { L: 10, p: 0.1 }, rammed: { L: 11, p: 0.2 }, inca: { L: 12, p: 0 },
    clap: { L: 13, p: 1 }, tin: { L: 14, p: 0.3 }, sand: { L: 15, p: 0.1 }, logs: { L: 7, p: 0.45, rot: 1, logs: 1 }, bamboo: { L: 7, p: 0.55, t: '#c9b27a' },
    reed: { R: 0, p: 0.45, t: '#b9a47a' }, palmw: { R: 12, p: 0.15 }, turf: { R: 9, p: 0.6, t: '#7c8a52' }, snow: { L: 1, p: 1 }, felt: { L: 2, p: 1 },
  };
  const ROOFM = {
    thatch: { L: 0 }, reed: { L: 0, t: '#b9ab8e' }, tile: { L: 1 }, slate: { L: 2 }, slab: { L: 2, t: '#d8d0c2', k: 1.7 }, flat: { L: 3 }, tin: { L: 4 }, greytile: { L: 5 }, bluetile: { L: 5, t: '#8f9cab' },
    shingle: { L: 6 }, copper: { L: 7 }, plain: { L: 8 }, earth: { L: 9 }, turf: { L: 9, t: '#6f8a48', green: 1 }, solar: { L: 10 }, glaze: { L: 11 }, yglaze: { L: 11, t: '#d9b54a' },
    palm: { L: 12 }, roman: { L: 13 }, gilt: { L: 14 }, zinc: { L: 15 }, blackpan: { L: 1, t: '#5a5550' }, felt: { L: 3, t: '#e6e0d2' },
  };

  // ---------- where: the world's building regions ----------
  // Tested in order (the first that holds): a place's lon, lat and height (the simulation's byte: 60 is some 500 m, 100 some
  // 1,500, 140 some 2,900). Boxes are rough on purpose: a tradition fades into the next over a few hundred kilometres anyway.
  const B = (lo0, lo1, la0, la1) => (lo, la) => lo >= lo0 && lo < lo1 && la >= la0 && la < la1;
  const REGIONS = [
    ['arctic', (lo, la) => (la > 59.5 && lo > -73 && lo < -11) || (la > 60 && lo > -170 && lo < -60) || (la > 66 && (lo > 60 || lo < -170))],
    ['ice', (lo, la) => B(-25, -5.5, 61.2, 67.5)(lo, la)],
    ['brit', B(-11, 1.9, 49.8, 61)],
    ['lowc', B(2.5, 7.2, 50.6, 53.7)],
    ['balt', B(20.9, 28.5, 53.8, 59.8)],
    ['scan', B(4.5, 31.7, 54.5, 71.5)],
    ['alps', (lo, la, h) => B(5.8, 16.3, 45.6, 48.1)(lo, la) && h > 48],
    ['germ', B(5.8, 15.3, 47.2, 55.2)],
    ['pol', B(14, 24.3, 49, 55)],
    ['cent', B(12, 24.5, 45.4, 51.6)],
    ['nfra', B(-5.2, 8.4, 46, 51.3)],
    ['sfra', B(-2, 7.8, 42.3, 46)],
    ['iber', B(-10, 3.5, 35.8, 44)],
    ['ital', B(6.5, 18.7, 36.4, 47.2)],
    ['greece', (lo, la) => B(19.3, 29.8, 34.7, 41.1)(lo, la) || B(32, 34.7, 34.4, 35.8)(lo, la)],
    ['balk', B(13.3, 30, 39.5, 48.4)],
    ['anat', B(26, 45, 35.8, 42.4)],
    ['cauc', B(38, 50.6, 38.4, 44.9)],
    ['ukr', B(22, 41.5, 44.2, 52.5)],
    ['steppe', (lo, la) => B(46, 88, 42, 55.5)(lo, la) && !(la > 52 && lo < 62)],
    ['rus', (lo, la) => la >= 49 && la < 73 && lo >= 21 && lo < 180],
    ['egypt', (lo, la) => B(24.5, 37, 21.5, 31.8)(lo, la) || B(27, 37, 15, 21.5)(lo, la)],
    ['magh', (lo, la) => B(-17.5, 11.7, 27, 37.6)(lo, la) || B(9, 25, 24, 33.6)(lo, la) || B(-17.5, 24.5, 18.5, 27)(lo, la)],
    ['levant', B(33.8, 38.7, 29.2, 37.3)],
    ['meso', B(38.7, 48.6, 29, 37.6)],
    ['gulf', B(46, 57.6, 22, 30.6)],
    ['yemen', B(42, 54.6, 12, 19)],
    ['arab', B(34, 60, 12, 30.5)],
    ['pers', B(44, 63.6, 25, 39.9)],
    ['tibet', (lo, la, h) => B(78, 104, 27.5, 37.2)(lo, la) && h > 140],
    ['hima', (lo, la, h) => B(70, 98.5, 26.5, 37.5)(lo, la) && h > 92],
    ['casia', (lo, la) => B(52, 80.6, 34.5, 45.5)(lo, la) || B(73, 96, 35, 49)(lo, la)],
    ['mong', B(87, 121, 42.5, 53.5)],
    ['raj', B(68.5, 78, 21, 30.6)],
    ['beng', B(85, 97.6, 20.5, 28.6)],
    ['hind', B(60.5, 88.6, 21, 36.2)],
    ['kerala', B(74, 77.7, 8, 13.1)],
    ['lanka', B(79.4, 82.1, 5.8, 10)],
    ['dec', B(72.5, 87.2, 7.5, 21.1)],
    ['korea', B(124, 131, 33, 43)],
    ['japan', (lo, la) => B(128.5, 146.5, 30, 46.2)(lo, la) || B(123, 131.5, 24, 30)(lo, la)],
    ['nchina', B(103, 135.5, 32.5, 53.5)],
    ['viet', (lo, la) => B(103.5, 109.8, 8.4, 23.4)(lo, la) && (lo > 105.6 || la > 20)],
    ['schina', B(97, 122.6, 20.5, 32.6)],
    ['phil', B(116.5, 127.2, 4.5, 19.6)],
    ['indo', B(92, 109.6, 5.4, 24.2)],
    ['malay', B(95, 130, -11, 7.6)],
    ['mela', (lo, la) => B(130, 180, -23, 0.1)(lo, la)],
    ['poly', (lo, la) => B(166, 179.9, -47.6, -33.9)(lo, la) || B(-180, -134, -28.5, 23)(lo, la)],
    ['austr', B(112, 154, -44.5, -10)],
    ['ethi', (lo, la) => B(33, 48.1, 3, 15.6)(lo, la) || B(42, 51.6, 0, 12)(lo, la)],
    ['sahel', B(-17.6, 39.1, 9.6, 18.6)],
    ['wafr', B(-17.6, 15.6, 4, 10.6)],
    ['swah', B(38.8, 44.1, -11.1, 2.1)],
    ['madag', B(43, 51, -26, -11.5)],
    ['eafr', B(29, 42, -12, 5.1)],
    ['cafr', B(8, 31.1, -11.1, 5.6)],
    ['safr', B(11, 41.5, -35.2, -11)],
    ['nwc', B(-137, -121.4, 42, 59.6)],
    ['cal', B(-124.6, -114, 32, 42.1)],
    ['swest', (lo, la) => B(-115.1, -102, 28, 38.6)(lo, la) || B(-118, -97, 22, 28)(lo, la)],
    ['plains', B(-114.1, -95.4, 30, 55.1)],
    ['ewood', (lo, la) => B(-95.5, -52, 24.5, 50.1)(lo, la) || B(-140, -52, 50, 60.1)(lo, la)],
    ['andes', (lo, la, h) => B(-81.6, -62.9, -38.1, 11.1)(lo, la) && h > 92],
    ['mesoam', B(-106.1, -82.4, 13, 23.6)],
    ['carib', B(-85.6, -58.9, 10, 27.6)],
    ['camer', (lo, la) => B(-92.1, -76.9, 7, 17.6)(lo, la) || B(-77, -59.4, 0, 12.6)(lo, la)],
    ['brazil', (lo, la) => B(-48.1, -34, -24.1, -2.4)(lo, la) || B(-56.1, -39.9, -34.1, -16)(lo, la)],
    ['amaz', B(-79.1, -44, -18.1, 8.1)],
    ['pamp', B(-73.6, -52.9, -56.1, -25.9)],
  ];
  // what a region is by nature: the family of peoples who built it first (for whose builders count as at home), its climate
  // as the tradition knows it (wet, snow, hot, dry), its sub-regions where the tradition differs
  const FAM = { arctic: 'nam', ice: 'euro', brit: 'euro', lowc: 'euro', balt: 'euro', scan: 'euro', alps: 'euro', germ: 'euro', pol: 'euro', cent: 'euro', nfra: 'euro', sfra: 'euro', iber: 'euro', ital: 'euro', greece: 'euro', balk: 'euro', anat: 'mena', cauc: 'euro', ukr: 'euro', steppe: 'mena', rus: 'euro',
    egypt: 'mena', magh: 'mena', levant: 'mena', meso: 'mena', gulf: 'mena', yemen: 'mena', arab: 'mena', pers: 'mena', tibet: 'easia', hima: 'sasia', casia: 'mena', mong: 'easia', raj: 'sasia', beng: 'sasia', hind: 'sasia', kerala: 'sasia', lanka: 'sasia', dec: 'sasia',
    korea: 'easia', japan: 'easia', nchina: 'easia', viet: 'easia', schina: 'easia', phil: 'seasia', indo: 'seasia', malay: 'seasia', mela: 'seasia', poly: 'seasia', austr: 'nam',
    ethi: 'africa', sahel: 'africa', wafr: 'africa', swah: 'africa', madag: 'africa', eafr: 'africa', cafr: 'africa', safr: 'africa',
    nwc: 'nam', cal: 'nam', swest: 'nam', plains: 'nam', ewood: 'nam', andes: 'amer', mesoam: 'amer', carib: 'amer', camer: 'amer', brazil: 'amer', amaz: 'amer', pamp: 'amer' };
  // the realm's people as builders (TOWN.CULTURES: med, north, east, mena, africa, sasia, easia, seasia, america, namerica)
  const CULFAM = ['euro', 'euro', 'euro', 'mena', 'africa', 'sasia', 'easia', 'seasia', 'amer', 'nam'];
  function regionOf(lon, lat, h) { for (const [k, t] of REGIONS) if (t(lon, lat, h || 0)) return k; return lat > 0 ? (lon < -30 ? 'ewood' : 'hind') : (lon < -30 ? 'pamp' : 'safr'); }

  // ---------- the styles ----------
  // A style is ranges ([lo, hi]) and weights ({ option: weight }) for every gene of a house; urban, rural and rich say what
  // changes for a house in a town's streets, in a village or in the fields, and for the well-off (merged over the style).
  const S = {};
  const def = (key, base, o) => { const b = base ? S[base] : null; if (base && !b) throw new Error('vern: no style ' + base); S[key] = Object.assign({}, b || {}, o, { key }); return S[key]; };
  def('house', null, {
    plan: { rect: 1 }, w: [7, 10], d: [6, 8], fl: [1, 2], fh: [2.7, 3.0], pb: [0.15, 0.35], stilt: [1.6, 2.4], pStilt: 0, loft: 0.3,
    roof: { gable: 1 }, pitch: [35, 45], over: [0.3, 0.5], gover: [0.2, 0.35], ridge: 0.7, par: [0.6, 1.0], cren: 0,
    wall: { plaster: 1 }, wall2: { rubble: 1 }, w2on: 'ground', pW2: 0, roofm: { tile: 1 }, chimm: { brick: 1 }, frame: { 0: 1 },
    ww: [0.9, 1.1], wh: [1.2, 1.5], sill: [0.8, 0.95], bay: [2.6, 3.2], arch: 0, shut: 0, mull: 0, grille: 0, wfr: 0.09,
    dw: [1.0, 1.2], dh: [2.1, 2.3], dpos: { c: 2, l: 1, r: 1 }, darch: 0, shop: 0,
    chim: { 0: 1, 1: 2 }, chat: { gable: 1 }, dorm: { 0: 1 }, balc: 0, balk: { wood: 1 }, bfull: 0.3,
    gal: 0, gald: [1.8, 2.4], gals: { front: 1 }, galf: 0, arc: 0, jet: 0, jetd: [0.3, 0.5],
    stepg: 0, toron: 0, wind: 0, tower: 0, oriel: 0, stair: 0, annex: 0.25, corn: 0, quoin: 0, strc: 0, batter: [0, 0], domes: { 0: 1 }, carv: 0, lattice: 0,
    pal: 'neutral',
  });
  // ----- the north-west of Europe -----
  def('nw_med', 'house', {      // the medieval cottage: wattle and daub or stone under thatch, the hearth in the hall; in town, framed houses of two and three floors, gable or eaves to the street
    plan: { rect: 6, L: 1 }, w: [7, 12], d: [4.8, 6.2], fl: [1, 1], fh: [2.3, 2.6], loft: 0.7, roof: { gable: 5, hip: 4, half: 1 }, pitch: [48, 57], over: [0.35, 0.6], gover: [0.25, 0.4], ridge: 0.85,
    wall: { daub: 6, rubble: 2, cob: 2 }, roofm: { thatch: 8, plain: 1, slab: 1 }, frame: { 1: 4, 3: 2, 0: 3 }, ww: [0.5, 0.7], wh: [0.6, 0.8], sill: [0.9, 1.0], bay: [3, 4.5],
    chim: { 0: 7, 1: 3 }, chat: { ridge: 1, gable: 2 }, annex: 0.35, pal: 'nw',
    urban: { fl: [2, 3], w: [5, 8], d: [7, 10], ridge: 0.3, jet: 0.7, frame: { 2: 4, 1: 3, 3: 2 }, wall: { daub: 8, rubble: 1 }, roofm: { plain: 5, thatch: 3, slab: 1 }, shop: 0.5, chim: { 0: 3, 1: 5, 2: 1 }, ww: [0.7, 1.0], wh: [0.8, 1.1], annex: 0.1 },
    rich: { fl: [2, 3], w: [10, 15], d: [6, 8], frame: { 2: 3, 3: 2, 1: 1 }, wall: { daub: 5, ashlar: 2, rubble: 1 }, roofm: { plain: 6, slab: 2, thatch: 1 }, chim: { 1: 3, 2: 3 }, oriel: 0.4, jet: 0.5, ww: [0.8, 1.1], wh: [1, 1.4], mull: 0.8 },
  });
  def('brit_tudor', 'nw_med', {      // Tudor and Stuart: close studding, jetties, brick stacks, glazed mullions; stone in the uplands; thatch in the villages still
    fl: [1, 2], fh: [2.4, 2.7], wall: { daub: 6, rubble: 2, brick: 1, cob: 1 }, roofm: { thatch: 6, plain: 3, slab: 1 }, frame: { 2: 4, 1: 3, 3: 2, 0: 1 }, chim: { 1: 6, 2: 2, 0: 1 }, chat: { gable: 3, ridge: 2 },
    ww: [0.7, 1.0], wh: [0.8, 1.1], mull: 0.7, dorm: { 0: 3, 1: 1, 2: 1 },
    urban: { fl: [2, 3], w: [5, 8], d: [7, 10], ridge: 0.35, jet: 0.8, frame: { 2: 6, 3: 2 }, wall: { daub: 8, brick: 1 }, roofm: { plain: 7, slate: 1 }, shop: 0.5, chim: { 1: 5, 2: 2 }, ww: [0.9, 1.3], wh: [1.0, 1.3], mull: 0.9, oriel: 0.25, dorm: { 0: 2, 1: 2 }, annex: 0.1 },
    rich: { fl: [2, 3], w: [12, 18], d: [6, 8], frame: { 2: 3, 0: 2 }, wall: { brick: 4, ashlar: 2, daub: 2 }, roofm: { plain: 6, slab: 2 }, chim: { 2: 3, 3: 2 }, stepg: 0.25, oriel: 0.5, ww: [1.0, 1.4], wh: [1.4, 1.8], mull: 1, quoin: 0.4 },
  });
  def('georgian', 'house', {      // Queen Anne and Georgian: brick or stucco, symmetrical, sash windows tall and slender, a parapet or a hipped roof
    plan: { rect: 6, L: 1 }, w: [7, 10], d: [7, 10], fl: [2, 2], fh: [2.9, 3.3], roof: { hip: 5, gable: 4 }, pitch: [30, 38], over: [0.15, 0.3], gover: [0.05, 0.15], ridge: 0.95,
    wall: { brick: 6, plaster: 2, ashlar: 1, ybrick: 1 }, roofm: { slate: 5, plain: 4 }, ww: [0.95, 1.1], wh: [1.6, 1.9], sill: [0.65, 0.8], bay: [2.2, 2.6], dpos: { c: 6, l: 1 }, darch: 0.4,
    chim: { 2: 6, 1: 2 }, chat: { gable: 1 }, corn: 0.6, strc: 0.4, quoin: 0.2, pal: 'georgian', annex: 0.2,
    urban: { fl: [3, 4], w: [5.5, 7.5], d: [9, 12], roof: { gable: 3, flat: 2 }, ridge: 1, par: [0.6, 0.9], wall: { brick: 6, ybrick: 3, plaster: 2 }, dpos: { l: 3, r: 2 }, chim: { 2: 1 }, corn: 0.8, dorm: { 0: 2, 1: 1, 2: 1 }, annex: 0.05 },
    rural: { fl: [2, 2], w: [8, 11], d: [6.5, 8.5], wall: { rubble: 3, brick: 3, plaster: 2 } },
    rich: { fl: [2, 3], w: [13, 20], d: [10, 13], wall: { ashlar: 4, brick: 3, plaster: 2 }, roof: { hip: 6, flat: 2 }, corn: 1, quoin: 0.7, strc: 0.6, ww: [1.0, 1.2], wh: [1.8, 2.1] },
  });
  def('vic', 'house', {      // the Victorians: red brick, slate, chimney stacks in rows, bay windows; terraces in the towns, villas with gables for the well-off
    plan: { rect: 5, L: 3 }, w: [5, 6.5], d: [8, 10], fl: [2, 2], fh: [2.7, 3.0], roof: { gable: 7, hip: 2 }, pitch: [35, 42], over: [0.2, 0.35], gover: [0.1, 0.25], ridge: 0.95,
    wall: { brick: 8, ybrick: 2, plaster: 1 }, roofm: { slate: 9, plain: 1 }, ww: [0.9, 1.05], wh: [1.5, 1.7], bay: [2.2, 2.6], oriel: 0.55, dpos: { l: 3, r: 3 }, darch: 0.3,
    chim: { 1: 2, 2: 5 }, chat: { gable: 1 }, strc: 0.3, pal: 'vic', annex: 0.5,
    urban: { w: [4.5, 5.8], d: [9, 11], oriel: 0.45, annex: 0.6 },
    rural: { w: [7, 10], d: [6, 8], wall: { brick: 5, rubble: 3, plaster: 1 }, oriel: 0.2 },
    rich: { plan: { L: 5, T: 2, rect: 1 }, w: [10, 14], d: [9, 12], fl: [2, 3], roof: { gable: 6, hip: 2 }, pitch: [42, 52], carv: 0.6, oriel: 0.8, dorm: { 0: 2, 1: 2 }, tower: 0.15, wall: { brick: 6, plaster: 2, ashlar: 1 } },
  });
  def('uk_semi', 'house', {      // between the wars: semi-detached, pebbledash and brick, a hipped tiled roof, bays of two floors, a garden in front
    plan: { rect: 1 }, w: [7, 9], d: [7.5, 9], fl: [2, 2], fh: [2.6, 2.8], roof: { hip: 7, gable: 3 }, pitch: [38, 45], over: [0.3, 0.45], ridge: 0.95,
    wall: { plaster: 5, brick: 5 }, roofm: { plain: 7, slate: 2, tile: 1 }, ww: [1.2, 1.6], wh: [1.3, 1.5], bay: [2.6, 3.2], oriel: 0.7, chim: { 1: 3, 2: 2 }, chat: { ridge: 2, gable: 1 }, pal: 'semi', annex: 0.35,
    rich: { w: [10, 13], fl: [2, 2], carv: 0.3, frame: { 1: 1, 0: 2 } },
  });
  def('modern_euro', 'house', {      // the houses of the last fifty years in Europe: brick or render, larger windows, a garage
    plan: { rect: 4, L: 3 }, w: [8, 11], d: [8, 10], fl: [1, 2], fh: [2.6, 2.8], roof: { gable: 6, hip: 3, flat: 1 }, pitch: [30, 45], over: [0.3, 0.5], ridge: 0.8,
    wall: { brick: 4, plaster: 5, clap: 1 }, roofm: { plain: 5, slate: 3, tile: 2 }, ww: [1.2, 1.8], wh: [1.3, 1.6], bay: [2.8, 3.6], chim: { 0: 3, 1: 3 }, chat: { side: 1, gable: 1 }, pal: 'modern', annex: 0.5,
  });
  def('lowc_med', 'nw_med', {      // the Low Countries: brick early, thatch in the country, the gable to the street in town
    wall: { brick: 4, daub: 4, cob: 1 }, roofm: { thatch: 7, blackpan: 1, plain: 2 }, pitch: [50, 58],
    urban: { fl: [2, 3], w: [5, 7.5], d: [8, 12], ridge: 0.1, jet: 0.3, frame: { 0: 4, 2: 3 }, wall: { brick: 6, daub: 3 }, roofm: { plain: 5, blackpan: 3, thatch: 1 }, shop: 0.5, chim: { 1: 5 }, stepg: 0.4, ww: [0.8, 1.1], wh: [1.0, 1.4], mull: 0.6 },
    pal: 'lowc',
  });
  def('dutch', 'house', {      // the gables of Holland and Flanders: tall, narrow, brick, stepped or bell-shaped to the street, big windows, black and red pantiles
    plan: { rect: 1 }, w: [5, 7.5], d: [10, 15], fl: [3, 4], fh: [2.9, 3.4], roof: { gable: 1 }, pitch: [52, 60], over: [0.1, 0.2], gover: [0, 0.05], ridge: 0.05, stepg: 0.75,
    wall: { brick: 8, ybrick: 1, plaster: 1 }, roofm: { blackpan: 4, tile: 4, plain: 2 }, ww: [1.0, 1.25], wh: [1.6, 2.0], bay: [1.8, 2.3], dpos: { l: 2, r: 2, c: 1 }, shut: 0.15, chim: { 1: 3, 2: 2 }, chat: { side: 1 }, corn: 0.3, pal: 'lowc', shop: 0.3, annex: 0.15,
    rural: { fl: [1, 2], w: [7, 10], d: [10, 16], pitch: [48, 55], roofm: { thatch: 5, tile: 4 }, stepg: 0.1, ridge: 0.2, annex: 0.5 },
    rich: { w: [8, 11], fl: [3, 4], wall: { brick: 5, ashlar: 2, plaster: 1 }, corn: 0.8, ww: [1.2, 1.4] },
  });
  def('germ_med', 'nw_med', {      // the German lands: Fachwerk, steep roofs of tile or thatch, the gable to the street; the hall-house of the north
    pitch: [52, 60], wall: { daub: 7, rubble: 2 }, roofm: { thatch: 5, plain: 4, shingle: 1 }, frame: { 1: 4, 3: 4, 0: 1 }, ridge: 0.5, pal: 'germ',
    urban: { fl: [2, 4], w: [6, 9], d: [9, 13], ridge: 0.1, jet: 0.75, jetd: [0.3, 0.6], frame: { 3: 5, 1: 3, 2: 1 }, wall: { daub: 9 }, roofm: { plain: 7, shingle: 1, slate: 1 }, shop: 0.4, chim: { 1: 6 }, chat: { ridge: 1 }, dorm: { 0: 2, 1: 2, 2: 1 }, ww: [0.8, 1.0], wh: [1.0, 1.3], annex: 0.1 },
    rural: { plan: { rect: 1 }, w: [10, 14], d: [14, 22], fl: [1, 1], loft: 0.9, roof: { half: 4, gable: 3, hip: 2 }, ridge: 0.05, frame: { 3: 4, 1: 4 }, roofm: { thatch: 6, plain: 3 }, annex: 0.2 },
    rich: { fl: [3, 4], w: [9, 13], frame: { 3: 5, 2: 2 }, oriel: 0.5, stepg: 0.2, wall: { daub: 6, ashlar: 2, rubble: 1 }, carv: 0.5 },
  });
  def('germ_ren', 'germ_med', {      // the German Renaissance and Baroque: framing in figures, roofs of many dormers, oriels; stucco and pastel in the towns of the south and the princes' seats
    urban: { fl: [3, 4], w: [6, 10], d: [10, 14], ridge: 0.15, jet: 0.6, frame: { 3: 6, 1: 2, 0: 2 }, wall: { daub: 7, plaster: 3 }, roofm: { plain: 8, slate: 2 }, shop: 0.4, chim: { 1: 4, 2: 2 }, dorm: { 1: 3, 2: 3, 3: 1 }, oriel: 0.35, ww: [0.9, 1.1], wh: [1.2, 1.5], annex: 0.1, carv: 0.4 },
    rich: { fl: [3, 4], w: [10, 16], d: [11, 15], frame: { 0: 4, 3: 2 }, wall: { plaster: 5, ashlar: 3 }, roof: { gable: 3, half: 2, mansard: 2, hip: 2 }, dorm: { 2: 3, 3: 2 }, corn: 0.7, quoin: 0.5, oriel: 0.5, stepg: 0.25, pal: 'baroque' },
  });
  def('cont_block', 'house', {      // the cities of the nineteenth century from Lisbon to St Petersburg: blocks of flats of four to six floors in stucco, tall windows, balconies, a cornice
    plan: { rect: 1 }, w: [12, 20], d: [12, 16], fl: [4, 5], fh: [3.3, 3.8], roof: { hip: 4, gable: 2, flat: 2, mansard: 2 }, pitch: [25, 35], over: [0.3, 0.6], gover: [0.1, 0.2], ridge: 0.98,
    wall: { plaster: 8, ashlar: 2, brick: 1 }, roofm: { tile: 4, slate: 3, zinc: 2, plain: 2 }, ww: [1.1, 1.3], wh: [2.0, 2.4], bay: [2.6, 3.2], sill: [0.6, 0.75], shut: 0.35, dpos: { c: 4, l: 1 }, darch: 0.6,
    chim: { 2: 3, 3: 3, 4: 1 }, chat: { ridge: 1 }, balc: 0.6, balk: { iron: 4, stone: 2 }, bfull: 0.15, corn: 0.95, strc: 0.8, quoin: 0.3, shop: 0.55, pal: 'cont', annex: 0.05, dorm: { 0: 3, 2: 1, 3: 1 },
    rural: { fl: [2, 3], w: [9, 13], d: [8, 11], shop: 0.1 },
  });
  def('nfra_med', 'nw_med', {      // northern France: stone and half-timber, slate in the west, tile in the east, steep roofs
    wall: { rubble: 5, daub: 4, ashlar: 1 }, roofm: { slate: 4, thatch: 4, plain: 2 }, frame: { 0: 5, 1: 2, 2: 2 }, pal: 'nfra',
    urban: { fl: [2, 4], w: [5, 8], d: [8, 12], ridge: 0.3, jet: 0.6, frame: { 2: 4, 3: 2, 0: 3 }, wall: { daub: 6, rubble: 3 }, roofm: { slate: 5, plain: 4 }, shop: 0.5, chim: { 1: 5, 2: 1 }, dorm: { 0: 2, 1: 2 }, ww: [0.8, 1.0], wh: [1.0, 1.3] },
  });
  def('nfra_classic', 'house', {      // classical France: dressed stone, steep slate roofs, a mansard in town, dormers, shutters in the south of it
    plan: { rect: 5, L: 2 }, w: [8, 12], d: [7, 10], fl: [2, 2], fh: [2.9, 3.3], roof: { hip: 5, gable: 3, mansard: 2 }, pitch: [45, 55], over: [0.15, 0.3], ridge: 0.95,
    wall: { ashlar: 4, rubble: 4, plaster: 2 }, roofm: { slate: 6, plain: 4 }, ww: [1.0, 1.15], wh: [1.6, 2.0], bay: [2.4, 2.9], shut: 0.45, chim: { 2: 6, 1: 2 }, chat: { gable: 2, ridge: 1 }, dorm: { 0: 2, 1: 2, 2: 2 }, corn: 0.5, strc: 0.3, quoin: 0.3, pal: 'nfra',
    urban: { fl: [3, 5], w: [7, 11], d: [10, 14], roof: { mansard: 6, gable: 2, hip: 2 }, wall: { ashlar: 6, plaster: 4 }, roofm: { slate: 6, zinc: 4 }, balc: 0.5, balk: { iron: 1 }, bfull: 0.35, shop: 0.5, dorm: { 2: 3, 3: 2 }, corn: 0.9 },
    rich: { w: [14, 22], d: [10, 14], fl: [2, 3], roof: { mansard: 4, hip: 4 }, quoin: 0.8, corn: 1 },
  });
  def('haussmann', 'cont_block', { roof: { mansard: 9, hip: 1 }, wall: { ashlar: 9, plaster: 1 }, roofm: { zinc: 7, slate: 3 }, fl: [5, 6], fh: [3.0, 3.5], balc: 0.95, balk: { iron: 1 }, bfull: 0.7, shut: 0.1, dorm: { 2: 2, 3: 3, 4: 1 }, pal: 'paris' });
  // ----- the north and east of Europe -----
  def('scan_med', 'house', {      // Norse and Finnish: log houses on a stone footing, roofs of turf on birch bark, low and broad; the stave and the loft-house
    plan: { rect: 1 }, w: [6, 9], d: [5, 7], fl: [1, 1], fh: [2.3, 2.6], pb: [0.3, 0.6], loft: 0.5, roof: { gable: 1 }, pitch: [25, 34], over: [0.4, 0.7], gover: [0.4, 0.7], ridge: 0.8,
    wall: { logs: 1 }, wall2: { rubble: 1 }, w2on: 'plinth', pW2: 1, roofm: { turf: 6, shingle: 3, slab: 1 }, ww: [0.4, 0.6], wh: [0.5, 0.7], bay: [3, 5], chim: { 0: 6, 1: 4 }, chat: { ridge: 1 }, annex: 0.4, pal: 'scan', carv: 0.3,
    urban: { fl: [1, 2], w: [6, 9], d: [6, 9], roofm: { turf: 3, shingle: 5 }, galf: 0.2, shop: 0.2 },
  });
  def('scan_red', 'scan_med', {      // Swedish and Norwegian timber in falu red with white corners, a steeper roof of tile or slate; stucco in the cities
    fl: [1, 2], fh: [2.5, 2.8], pitch: [30, 42], wall: { clap: 6, logs: 4 }, roofm: { tile: 5, turf: 2, slate: 2, shingle: 1 }, ww: [0.8, 1.0], wh: [1.1, 1.4], bay: [2.4, 3.2], chim: { 1: 6, 2: 2 }, quoin: 0.6, pal: 'falu',
    urban: { fl: [2, 3], w: [8, 13], d: [8, 11], wall: { clap: 4, plaster: 5, logs: 1 }, roofm: { tile: 5, slate: 3, copper: 1 }, shop: 0.3, corn: 0.3, pal: 'scancity' },
    rich: { fl: [2, 2], w: [12, 18], roof: { hip: 4, mansard: 3, gable: 3 }, wall: { plaster: 6, clap: 4 }, corn: 0.7, pal: 'scancity' },
  });
  def('ice_turf', 'scan_med', { wall: { turf: 6, rubble: 3 }, roofm: { turf: 1 }, w: [5, 7], d: [7, 10], fl: [1, 1], pitch: [38, 45], over: [0.05, 0.15], gover: [0, 0.1], ridge: 0.15, chim: { 0: 1 }, annex: 0.6, pal: 'scan' });
  def('rus_izba', 'house', {      // the izba: a log house gable to the street, its window frames carved and painted, a roof of planks or thatch, the yard beside it under one roof
    plan: { rect: 5, L: 2 }, w: [6, 8], d: [7, 10], fl: [1, 1], fh: [2.5, 2.8], pb: [0.5, 0.9], loft: 0.8, roof: { gable: 8, hip: 1 }, pitch: [40, 50], over: [0.4, 0.6], gover: [0.4, 0.6], ridge: 0.15,
    wall: { logs: 1 }, roofm: { shingle: 4, thatch: 4, tin: 1 }, ww: [0.7, 0.9], wh: [1.0, 1.2], bay: [1.6, 2.2], shut: 0.6, carv: 0.9, chim: { 1: 1 }, chat: { ridge: 1 }, annex: 0.6, pal: 'rus',
    urban: { fl: [1, 2], w: [7, 10], d: [8, 11], wall: { logs: 6, plaster: 3 }, roofm: { shingle: 3, tin: 4, slate: 1 }, shop: 0.2 },
    rich: { fl: [2, 2], w: [12, 18], d: [10, 14], roof: { hip: 6, gable: 3 }, wall: { plaster: 6, brick: 2, logs: 2 }, roofm: { tin: 6, slate: 2 }, corn: 0.6, pal: 'russtucco', carv: 0.3, gal: 0.25 },
  });
  def('rus_town', 'cont_block', { fl: [2, 3], w: [12, 18], d: [11, 15], fh: [3.4, 4.0], roof: { hip: 8, gable: 2 }, pitch: [18, 26], roofm: { tin: 6, zinc: 3, slate: 1 }, wall: { plaster: 9, brick: 1 }, balc: 0.3, pal: 'russtucco', shut: 0, corn: 0.95, quoin: 0.4 });
  def('balt_med', 'rus_izba', { ridge: 0.6, roofm: { thatch: 6, shingle: 3 }, roof: { hip: 4, gable: 4, half: 2 }, pal: 'balt', carv: 0.4,
    urban: { fl: [2, 4], w: [6, 9], d: [10, 14], ridge: 0.1, wall: { brick: 6, plaster: 3, logs: 1 }, roofm: { plain: 7, tile: 2 }, stepg: 0.5, shop: 0.4, pal: 'lowc' } });
  def('pol_town', 'house', {      // the towns of Poland and Bohemia: arcaded market squares, houses with a parapet attic hiding the roof, pastel stucco
    plan: { rect: 1 }, w: [7, 10], d: [12, 16], fl: [3, 3], fh: [3.0, 3.4], roof: { gable: 6, hip: 2 }, pitch: [45, 55], over: [0.1, 0.25], ridge: 0.1, par: [1.4, 2.6],
    wall: { plaster: 8, brick: 2 }, roofm: { plain: 6, tile: 3, copper: 1 }, ww: [1.0, 1.15], wh: [1.5, 1.8], bay: [2.2, 2.7], arc: 0.35, chim: { 1: 4, 2: 2 }, corn: 0.8, strc: 0.6, stepg: 0.35, shop: 0.4, pal: 'pastel',
    rural: { fl: [1, 1], w: [8, 12], d: [6, 8], par: [0, 0], ridge: 0.6, wall: { logs: 5, plaster: 4 }, roofm: { thatch: 5, shingle: 4 }, stepg: 0, arc: 0, roof: { hip: 4, gable: 3, half: 2 }, pal: 'rus' },
  });
  def('cent_village', 'house', {      // the Pannonian and Danubian village: a long white house of one floor, its gable to the street, a gallery along the yard
    plan: { rect: 1 }, w: [6, 8], d: [12, 20], fl: [1, 1], fh: [2.6, 3.0], pb: [0.3, 0.5], loft: 0.4, roof: { gable: 5, hip: 3, half: 2 }, pitch: [38, 48], over: [0.4, 0.6], gover: [0.3, 0.5], ridge: 0.05,
    wall: { plaster: 6, mud: 3 }, roofm: { thatch: 4, plain: 4, tile: 2 }, ww: [0.8, 1.0], wh: [1.0, 1.3], bay: [2.2, 3.0], gal: 0.6, gald: [1.4, 2.0], gals: { side: 1 }, shut: 0.3, chim: { 1: 5 }, chat: { ridge: 1 }, pal: 'pastel', annex: 0.3,
    urban: { fl: [2, 3], w: [8, 12], d: [12, 16], ridge: 0.85, wall: { plaster: 9 }, roofm: { plain: 6, tile: 3 }, gal: 0, corn: 0.7, shop: 0.4, arc: 0.15, pal: 'baroque' },
  });
  def('alps_chalet', 'house', {      // the Alps: a stone ground floor, timber above, a broad low roof of shingles or stone slabs reaching far out, balconies round it, flowers
    plan: { rect: 1 }, w: [9, 13], d: [9, 14], fl: [2, 3], fh: [2.4, 2.7], pb: [0.2, 0.5], loft: 0.8, roof: { gable: 9, half: 1 }, pitch: [22, 30], over: [1.0, 1.6], gover: [1.0, 1.6], ridge: 0.1,
    wall: { logs: 6, boards: 4 }, wall2: { rubble: 4, plaster: 3 }, w2on: 'ground', pW2: 0.85, roofm: { shingle: 5, slab: 5 }, ww: [0.7, 0.9], wh: [0.9, 1.1], bay: [1.6, 2.4], shut: 0.6,
    balc: 0.85, balk: { wood: 1 }, bfull: 0.85, chim: { 1: 1 }, chat: { ridge: 1 }, carv: 0.6, pal: 'alps', annex: 0.3,
    urban: { fl: [3, 4], w: [9, 12], d: [11, 14], wall: { plaster: 6, logs: 2 }, pW2: 0.3, over: [0.6, 1.0], gover: [0.5, 0.9], balc: 0.5, shop: 0.4, pal: 'alpstown' },
  });
  // ----- the Mediterranean -----
  def('med_stone', 'house', {      // the Mediterranean village: rough stone or lime, a low roof of curved tiles, small windows against the sun, an outside stair to the upper floor
    plan: { rect: 6, L: 2 }, w: [6, 10], d: [5, 8], fl: [1, 2], fh: [2.6, 3.0], roof: { gable: 6, hip: 3, shed: 1 }, pitch: [17, 24], over: [0.15, 0.3], gover: [0.05, 0.15], ridge: 0.8,
    wall: { rubble: 6, plaster: 3, lime: 1 }, roofm: { tile: 8, roman: 2 }, ww: [0.6, 0.85], wh: [0.8, 1.2], bay: [2.6, 3.4], shut: 0.5, stair: 0.25, chim: { 0: 4, 1: 5 }, chat: { gable: 1, side: 1 }, pal: 'med', annex: 0.3,
    urban: { fl: [2, 4], w: [5, 8], d: [8, 12], wall: { plaster: 6, rubble: 3 }, ridge: 0.85, shop: 0.5, tower: 0.06, balc: 0.25, balk: { wood: 2, iron: 1 } },
    rich: { fl: [2, 3], w: [12, 18], d: [10, 14], plan: { rect: 3, court: 2 }, wall: { ashlar: 4, plaster: 4 }, roof: { hip: 6, gable: 2 }, corn: 0.6, arch: 0.4, quoin: 0.4 },
  });
  def('ital_med', 'med_stone', { pal: 'ital', urban: { fl: [2, 4], w: [5, 8], d: [9, 13], wall: { rubble: 4, plaster: 4, brick: 2 }, shop: 0.5, tower: 0.12, arch: 0.5, balc: 0.15 } });
  def('ital_ren', 'med_stone', {      // Italy of the Renaissance and after: stucco in ochre, rust and cream, green shutters, a cornice, a loggia; the palazzo round its court
    fl: [2, 3], ww: [0.9, 1.05], wh: [1.4, 1.8], shut: 0.85, corn: 0.6, strc: 0.4, pal: 'ital',
    urban: { fl: [3, 5], w: [6, 10], d: [10, 14], wall: { plaster: 9, brick: 1 }, roof: { gable: 4, hip: 5 }, shop: 0.55, balc: 0.35, balk: { iron: 3, stone: 1 }, corn: 0.85, darch: 0.5, arc: 0.12 },
    rich: { plan: { court: 4, rect: 2 }, w: [18, 26], d: [16, 24], fl: [3, 3], fh: [3.6, 4.4], roof: { hip: 9 }, wall: { ashlar: 5, plaster: 5 }, corn: 1, quoin: 0.6, arch: 0.5, strc: 0.8, darch: 0.9 },
  });
  def('sfra_med', 'med_stone', { pal: 'provence', wall: { rubble: 6, plaster: 4 } });
  def('iber_med', 'med_stone', {      // Iberia: white lime in the south, granite and wooden galleries in the north, the patio, iron grilles on the windows
    wall: { lime: 6, rubble: 3, plaster: 1 }, grille: 0.5, pal: 'iber',
    urban: { fl: [2, 3], w: [6, 9], d: [10, 14], plan: { rect: 4, court: 2 }, wall: { lime: 7, plaster: 3 }, balc: 0.4, balk: { iron: 3, wood: 1 }, shop: 0.4, grille: 0.7 },
    rich: { plan: { court: 5, rect: 1 }, w: [16, 22], d: [16, 22], wall: { lime: 5, ashlar: 3 } },
  });
  def('iber_north', 'med_stone', { wall: { granite: 6, rubble: 3, plaster: 1 }, roofm: { tile: 6, slate: 3 }, pitch: [22, 30], galf: 0.3, gal: 0.35, gald: [1.0, 1.4], pal: 'ibern', balc: 0.3, balk: { wood: 1 } });
  def('greece_island', 'house', {      // the Aegean: white cubes, flat roofs, blue doors and shutters, a domed chapel here and there, stairs up the outside
    plan: { rect: 6, L: 2 }, w: [5, 8], d: [5, 8], fl: [1, 2], fh: [2.6, 2.9], roof: { flat: 1 }, par: [0.3, 0.5], over: [0, 0.05],
    wall: { lime: 1 }, roofm: { flat: 1 }, ww: [0.6, 0.85], wh: [0.8, 1.2], bay: [2.4, 3.4], shut: 0.6, stair: 0.4, chim: { 0: 3, 1: 2 }, chat: { side: 1 }, domes: { 0: 9, 1: 1 }, pal: 'aegean', annex: 0.2,
  });
  def('greece_main', 'med_stone', { pal: 'greece', roof: { hip: 5, gable: 4 }, pitch: [20, 26], urban: { fl: [2, 3], w: [6, 10], d: [8, 12], wall: { plaster: 6, rubble: 3 }, balc: 0.5, balk: { iron: 2, wood: 1 }, shop: 0.4, corn: 0.3 } });
  def('balk_ottoman', 'house', {      // the Ottoman Balkans and Anatolia: a stone ground floor, the upper floor in timber and white plaster jutting over the street, a broad hipped roof of tiles
    plan: { rect: 5, L: 2 }, w: [7, 11], d: [7, 10], fl: [2, 2], fh: [2.6, 2.9], roof: { hip: 9, gable: 1 }, pitch: [22, 30], over: [0.7, 1.1], gover: [0.5, 0.8], ridge: 0.85,
    wall: { plaster: 7, daub: 3 }, wall2: { rubble: 1 }, w2on: 'ground', pW2: 0.85, frame: { 0: 6, 1: 2 }, roofm: { tile: 9, slab: 1 }, jet: 0.7, jetd: [0.5, 0.9], oriel: 0.3,
    ww: [0.7, 0.9], wh: [1.2, 1.5], bay: [1.6, 2.2], shut: 0.3, lattice: 0.25, chim: { 1: 3, 2: 2 }, chat: { side: 1, ridge: 1 }, pal: 'ottoman', annex: 0.25,
    urban: { fl: [2, 3], w: [6, 9], d: [9, 12], shop: 0.5, jet: 0.85 },
    rich: { plan: { rect: 4, L: 3 }, w: [12, 16], d: [10, 14], fl: [2, 3], oriel: 0.6, gal: 0.3, carv: 0.4 },
  });
  // ----- the Near East and North Africa -----
  def('mud_court', 'house', {      // the mud brick of the river lands: flat roofs on palm beams with a parapet, blank walls to the lane, the house turned in to its court
    plan: { court: 5, U: 2, rect: 3 }, w: [9, 14], d: [9, 14], fl: [1, 2], fh: [2.8, 3.2], roof: { flat: 1 }, par: [0.6, 1.1], over: [0, 0.05],
    wall: { mud: 8, plaster: 2 }, roofm: { earth: 1 }, ww: [0.4, 0.6], wh: [0.5, 0.8], sill: [1.5, 1.9], bay: [3, 5], dpos: { l: 1, r: 1, c: 1 }, darch: 0.3, chim: { 0: 1 }, toron: 0.15, pal: 'mud', annex: 0.1,
    rural: { plan: { rect: 5, court: 2, L: 2 }, w: [6, 10], d: [6, 9], fl: [1, 1] },
    rich: { fl: [2, 2], w: [14, 20], d: [14, 20], wall: { plaster: 6, mud: 2, brick: 2 }, oriel: 0.5, lattice: 0.8, corn: 0.3 },
  });
  def('meso_mud', 'mud_court', { pal: 'mud', urban: { fl: [2, 2], oriel: 0.35, lattice: 0.6, wall: { brick: 4, mud: 4, plaster: 2 }, pal: 'baghdad' } });
  def('egypt_mud', 'mud_court', { domes: { 0: 6, 1: 2 }, pal: 'egypt', urban: { fl: [2, 4], w: [7, 11], d: [8, 12], plan: { rect: 6, court: 2 }, oriel: 0.45, lattice: 0.9, wall: { plaster: 5, mud: 3, sand: 2 } } });
  def('nubia', 'mud_court', { roof: { vault: 5, flat: 3 }, domes: { 0: 4, 1: 3, 2: 1 }, wall: { mud: 6, plaster: 4 }, pal: 'nubia' });
  def('levant_stone', 'house', {      // the Levant: limestone, flat roofs and cross-vaults, a dome on the hall, arched windows in pairs; red tiles in the nineteenth century
    plan: { rect: 5, L: 2, court: 2 }, w: [8, 12], d: [8, 11], fl: [1, 2], fh: [3.0, 3.6], roof: { flat: 6, dome: 2 }, par: [0.4, 0.8], over: [0, 0.05],
    wall: { ashlar: 6, rubble: 3, plaster: 1 }, roofm: { flat: 1 }, ww: [0.7, 0.9], wh: [1.3, 1.7], bay: [2.4, 3.2], arch: 0.75, shut: 0.25, grille: 0.3, domes: { 0: 5, 1: 3 }, chim: { 0: 1 }, pal: 'levant', annex: 0.15,
    urban: { fl: [2, 3], w: [7, 10], d: [9, 12], shop: 0.5, balc: 0.25, balk: { stone: 1, iron: 1 } },
  });
  def('levant_red', 'levant_stone', { roof: { hip: 8, flat: 2 }, pitch: [22, 28], over: [0.2, 0.4], roofm: { tile: 1 }, fl: [2, 3], ww: [0.9, 1.0], wh: [1.9, 2.3], arch: 0.9, balc: 0.4, balk: { stone: 2, iron: 2 }, corn: 0.4, pal: 'levant' });
  def('magh_medina', 'mud_court', {      // the Maghreb: houses of white lime round a court of tiles, flat roofs, few windows to the lane, a green tile over the door
    wall: { lime: 7, plaster: 3 }, roofm: { flat: 1 }, pal: 'magh', ww: [0.5, 0.75], wh: [0.6, 1.0], grille: 0.6, darch: 0.7,
    urban: { fl: [2, 3], w: [8, 12], d: [8, 12] }, rich: { fl: [2, 3], w: [14, 20], d: [14, 20], lattice: 0.5 },
  });
  def('kasbah', 'house', {      // south of the Atlas: rammed earth, towers at the corners tapering and crenellated, patterns cut into the upper walls
    plan: { rect: 4, court: 3 }, w: [9, 14], d: [9, 14], fl: [2, 3], fh: [2.6, 3.0], roof: { flat: 1 }, par: [0.6, 1.0], cren: 0.8, wall: { rammed: 6, mud: 4 }, roofm: { earth: 1 },
    ww: [0.3, 0.5], wh: [0.4, 0.7], sill: [1.4, 1.8], bay: [3, 5], batter: [0.3, 0.6], tower: 0.55, chim: { 0: 1 }, pal: 'kasbah', annex: 0.1,
  });
  def('najdi', 'kasbah', { cren: 0.9, tower: 0.2, wall: { mud: 9, plaster: 1 }, fl: [2, 2], pal: 'najd' });
  def('gulf_coral', 'mud_court', { wall: { coral: 8, plaster: 2 }, wind: 0.45, fl: [1, 2], lattice: 0.5, oriel: 0.2, pal: 'gulf', toron: 0.3 });
  def('hejaz', 'mud_court', { plan: { rect: 1 }, fl: [3, 5], w: [8, 12], d: [8, 12], wall: { coral: 7, plaster: 3 }, oriel: 0.9, lattice: 1, pal: 'hejaz', ww: [0.8, 1.0], wh: [1.4, 1.8], sill: [0.6, 0.8] });
  def('yemen_tower', 'house', {      // Yemen: tower houses of five and six floors, brown stone or mud below, the windows outlined in white gypsum, fanlights of alabaster
    plan: { rect: 1 }, w: [8, 11], d: [8, 11], fl: [4, 6], fh: [2.7, 3.0], roof: { flat: 1 }, par: [0.6, 1.0], cren: 0.3, wall: { rubble: 4, mud: 4, brick: 2 }, roofm: { earth: 1 },
    ww: [0.7, 0.9], wh: [1.0, 1.4], bay: [1.9, 2.4], arch: 0.85, wfr: 0.16, strc: 0.9, chim: { 0: 1 }, batter: [0.1, 0.3], pal: 'yemen', annex: 0.1,
  });
  def('pers_dome', 'mud_court', {      // the Iranian plateau: domes and vaults of mud brick, wind-catchers on the roofs of the desert towns, the court with its pool
    roof: { flat: 5, vault: 3 }, domes: { 0: 2, 1: 3, 2: 2, 3: 1 }, wind: 0.35, wall: { mud: 7, brick: 3 }, pal: 'pers',
    urban: { fl: [1, 2], wall: { brick: 5, mud: 5 }, oriel: 0.1 }, rich: { fl: [2, 2], wind: 0.6, wall: { brick: 6, plaster: 2 } },
  });
  def('casia_mud', 'mud_court', { wall: { mud: 8, plaster: 2 }, gal: 0.6, gald: [2.0, 3.0], gals: { front: 1 }, pal: 'casia', carv: 0.3 });
  // ----- Africa south of the Sahara -----
  def('round_hut', 'house', {      // the round hut: walls of mud and wattle under a cone of thatch reaching low; the granaries beside it on their stones
    plan: { round: 1 }, w: [4.5, 6.5], d: [4.5, 6.5], fl: [1, 1], fh: [1.9, 2.3], pb: [0.1, 0.25], roof: { cone: 1 }, pitch: [40, 50], over: [0.4, 0.7], ridge: 0.5,
    wall: { mud: 8, daub: 2 }, roofm: { thatch: 1 }, ww: [0.3, 0.4], wh: [0.3, 0.4], sill: [1.0, 1.2], bay: [5, 8], dw: [0.7, 0.9], dh: [1.5, 1.8], chim: { 0: 1 }, annex: 0, pal: 'hut',
  });
  def('beehive', 'round_hut', { roof: { dome: 1 }, fh: [0.4, 0.6], wall: { reed: 1 }, roofm: { thatch: 1 }, w: [4, 6], d: [4, 6] });
  def('rondavel_tin', 'round_hut', { roofm: { thatch: 6, tin: 4 }, wall: { mud: 5, plaster: 4, brick: 1 }, ww: [0.6, 0.8], wh: [0.8, 1.0], pal: 'rondavel' });
  def('sahel_mud', 'mud_court', {      // the Sudanic towns: mud brick flat-roofed, buttresses and pinnacles, the ends of palm beams standing out of the walls
    toron: 0.75, batter: [0.15, 0.35], cren: 0.35, wall: { mud: 9, plaster: 1 }, pal: 'sahel', fl: [1, 2],
    rural: { plan: { round: 6, rect: 2 }, w: [4.5, 6.5], d: [4.5, 6.5], roof: { cone: 6, flat: 2 }, pitch: [38, 48], over: [0.3, 0.5], roofm: { thatch: 1 }, toron: 0, cren: 0, par: [0, 0] },
  });
  def('hausa', 'sahel_mud', { domes: { 0: 6, 1: 1 }, cren: 0.6, pal: 'hausa', carv: 0.5 });
  def('wafr_house', 'house', {      // the forest and the coast of West Africa: rectangular houses of mud on a raised floor, a hip of thatch or later of iron, the compound round its yard
    plan: { rect: 6, L: 2, U: 2 }, w: [6, 10], d: [4, 6], fl: [1, 1], fh: [2.3, 2.7], pb: [0.3, 0.5], roof: { hip: 6, gable: 4 }, pitch: [30, 40], over: [0.6, 1.0], gover: [0.4, 0.7], ridge: 0.9,
    wall: { mud: 8, plaster: 2 }, roofm: { thatch: 8, palm: 2 }, ww: [0.5, 0.7], wh: [0.6, 0.9], bay: [2.6, 3.6], gal: 0.3, gald: [1.4, 2.0], chim: { 0: 1 }, pal: 'wafr', annex: 0.25,
  });
  def('cafr_house', 'wafr_house', { plan: { rect: 1 }, roof: { gable: 8, hip: 2 }, pitch: [35, 45], wall: { daub: 5, mud: 5 }, ridge: 0.7 });
  def('ethi_tukul', 'round_hut', { w: [5, 8], d: [5, 8], pitch: [45, 55], wall: { rubble: 4, mud: 6 }, pal: 'ethi' });
  def('swahili', 'mud_court', { wall: { coral: 9, plaster: 1 }, fl: [2, 3], carv: 0.7, balc: 0.25, balk: { wood: 1 }, pal: 'swahili', roof: { flat: 8, gable: 2 }, roofm: { flat: 6, palm: 4 } });
  def('cape_dutch', 'house', { plan: { rect: 4, T: 3, U: 2 }, w: [14, 22], d: [6, 8], fl: [1, 1], fh: [3.0, 3.4], roof: { gable: 1 }, pitch: [44, 52], over: [0.2, 0.3], ridge: 0.95, wall: { lime: 1 }, roofm: { thatch: 1 }, ww: [1.0, 1.1], wh: [1.6, 1.9], shut: 0.8, corn: 0.3, stepg: 0.4, pal: 'capedutch' });
  // ----- South Asia -----
  def('ind_flat', 'mud_court', {      // the plains of India: brick and mud round a court, flat roofs to sleep on in the heat, a parapet, the doorway carved
    wall: { mud: 5, brick: 3, plaster: 2 }, pal: 'india', ww: [0.6, 0.9], wh: [0.9, 1.3], sill: [0.6, 0.9], carv: 0.3,
    urban: { fl: [2, 3], w: [6, 10], d: [9, 13], plan: { rect: 5, court: 3 }, oriel: 0.35, lattice: 0.4, balc: 0.3, balk: { wood: 1, stone: 1 }, shop: 0.5, wall: { brick: 5, plaster: 5 } },
    rich: { plan: { court: 1 }, fl: [3, 4], w: [16, 22], d: [16, 22], oriel: 0.85, lattice: 0.9, corn: 0.6, wall: { plaster: 6, brick: 4 } },
  });
  def('raj_haveli', 'ind_flat', { wall: { sand: 6, plaster: 4 }, pal: 'raj', urban: { fl: [2, 4], w: [6, 10], d: [9, 13], oriel: 0.8, lattice: 0.8, balc: 0.3, balk: { stone: 1 }, shop: 0.4, wall: { sand: 7, plaster: 3 } }, rich: { plan: { court: 1 }, fl: [3, 4], w: [16, 22], d: [16, 22], oriel: 1, lattice: 1, corn: 0.6, domes: { 0: 3, 2: 2, 4: 1 } } });
  def('beng_hut', 'house', {      // Bengal and Assam: bamboo and thatch on a plinth of earth against the floods, the roof curved down at the eaves as a bent bamboo is
    plan: { rect: 1 }, w: [6, 9], d: [4, 6], fl: [1, 1], fh: [2.2, 2.6], pb: [0.5, 0.9], roof: { curve: 4, hip: 4, gable: 2 }, pitch: [35, 45], over: [0.6, 1.0], ridge: 0.9,
    wall: { bamboo: 5, mud: 3, reed: 2 }, roofm: { thatch: 8, tin: 2 }, ww: [0.5, 0.7], wh: [0.6, 0.9], bay: [2.6, 3.6], gal: 0.4, gald: [1.2, 1.8], chim: { 0: 1 }, pal: 'beng', pStilt: 0.15,
  });
  def('kerala_tile', 'house', { plan: { rect: 6, court: 2 }, w: [9, 13], d: [8, 11], fl: [1, 2], fh: [2.6, 3.0], pb: [0.5, 0.8], roof: { hip: 7, gable: 3 }, pitch: [35, 45], over: [0.9, 1.3], gover: [0.6, 0.9], ridge: 0.9,
    wall: { plaster: 6, rubble: 2, boards: 2 }, roofm: { tile: 8, palm: 2 }, ww: [0.7, 0.9], wh: [1.0, 1.3], gal: 0.5, gald: [1.6, 2.2], lattice: 0.4, carv: 0.5, chim: { 0: 1 }, pal: 'kerala' });
  def('deccan_flat', 'ind_flat', { wall: { rubble: 6, mud: 3, plaster: 1 }, pal: 'deccan' });
  def('tamil_row', 'kerala_tile', { plan: { rect: 1 }, w: [6, 9], d: [12, 18], fl: [1, 2], roof: { gable: 6, hip: 4 }, ridge: 0.95, pitch: [25, 35], gal: 0.85, gald: [1.4, 2.0], wall: { plaster: 8, brick: 2 }, pal: 'tamil' });
  def('hima_stone', 'house', {      // the Himalaya: stone and timber in courses, slate or stone-slab roofs, carved wooden balconies on the upper floor
    plan: { rect: 1 }, w: [7, 10], d: [6, 9], fl: [2, 3], fh: [2.3, 2.6], roof: { gable: 6, hip: 3, flat: 1 }, pitch: [25, 35], over: [0.6, 0.9], gover: [0.4, 0.7], ridge: 0.85,
    wall: { rubble: 7, plaster: 3 }, roofm: { slab: 7, slate: 2, tin: 1 }, ww: [0.6, 0.8], wh: [0.8, 1.0], bay: [2.2, 3.0], balc: 0.55, balk: { wood: 1 }, galf: 0.3, carv: 0.7, chim: { 0: 3, 1: 1 }, pal: 'hima', annex: 0.3,
  });
  def('tibet_flat', 'house', { plan: { rect: 4, court: 2 }, w: [8, 12], d: [8, 12], fl: [2, 3], fh: [2.5, 2.8], roof: { flat: 1 }, par: [0.5, 0.8], wall: { lime: 7, rubble: 3 }, roofm: { earth: 1 }, ww: [0.7, 1.0], wh: [0.8, 1.1], wfr: 0.18, batter: [0.25, 0.5], strc: 0.6, chim: { 0: 1 }, pal: 'tibet', annex: 0.2 });
  // ----- East Asia -----
  def('china_court', 'house', {      // the courtyard house of north China: grey brick, grey tiled roofs gently curved, the halls round a court, red doors and lattices
    plan: { court: 5, U: 3, rect: 2 }, w: [12, 18], d: [12, 18], fl: [1, 1], fh: [3.0, 3.4], pb: [0.3, 0.5], roof: { curve: 8, gable: 2 }, pitch: [24, 32], over: [0.6, 0.9], gover: [0.3, 0.5], ridge: 0.98,
    wall: { brick: 4, plaster: 3, rammed: 1 }, roofm: { greytile: 9, thatch: 1 }, ww: [1.0, 1.6], wh: [1.2, 1.6], bay: [3.0, 3.8], lattice: 0.9, chim: { 0: 1 }, pal: 'china', annex: 0.1,
    urban: { plan: { court: 4, rect: 3, U: 2 }, w: [10, 16], d: [10, 16], shop: 0.35 },
    rural: { plan: { rect: 4, U: 2, L: 2 }, w: [9, 13], d: [5, 7], roofm: { greytile: 5, thatch: 5 }, wall: { rammed: 4, mud: 3, brick: 3 } },
    rich: { w: [18, 26], d: [18, 26], fl: [1, 2], carv: 0.6 },
  });
  def('china_south', 'china_court', {      // the south: white walls stepping up in horse-head gables, black-tiled roofs, two floors round a narrow court
    plan: { rect: 4, court: 3, U: 2 }, w: [9, 13], d: [9, 13], fl: [2, 2], roof: { gable: 7, curve: 3 }, pitch: [26, 32], stepg: 0.8, wall: { lime: 7, brick: 3 }, roofm: { greytile: 1 }, pal: 'huizhou',
    rural: { plan: { rect: 1 }, w: [8, 12], d: [6, 8], fl: [1, 2], wall: { lime: 5, rammed: 3, mud: 2 } },
  });
  def('tulou', 'house', { plan: { round: 1 }, w: [36, 56], d: [36, 56], fl: [3, 4], fh: [2.6, 3.0], roof: { cone: 1 }, pitch: [22, 28], over: [1.0, 1.4], wall: { rammed: 1 }, roofm: { greytile: 1 }, ww: [0.5, 0.6], wh: [0.6, 0.8], bay: [3, 4], chim: { 0: 1 }, pal: 'tulou' });
  def('china_stilt', 'house', { plan: { rect: 1 }, w: [7, 10], d: [6, 8], fl: [2, 2], fh: [2.4, 2.7], pStilt: 0.7, stilt: [1.8, 2.6], roof: { curve: 4, gable: 4, hip: 2 }, pitch: [28, 36], over: [0.8, 1.1], ridge: 0.9, wall: { boards: 8, bamboo: 2 }, roofm: { greytile: 6, thatch: 4 }, ww: [0.8, 1.2], wh: [0.9, 1.2], galf: 0.6, gal: 0.4, gald: [1.0, 1.4], lattice: 0.6, chim: { 0: 1 }, pal: 'miao' });
  def('china_shop', 'house', {      // the shophouse of the coast cities and the Nanyang: two and three floors over a covered walk, the shop below, shutters above
    plan: { rect: 1 }, w: [4.5, 6.5], d: [14, 22], fl: [2, 3], fh: [3.2, 3.8], roof: { gable: 7, flat: 3 }, pitch: [24, 30], over: [0.4, 0.6], ridge: 0.98, par: [0.8, 1.2],
    wall: { plaster: 8, brick: 2 }, roofm: { tile: 6, greytile: 4 }, ww: [0.9, 1.1], wh: [1.6, 2.0], bay: [1.8, 2.4], arc: 0.85, shut: 0.75, shop: 1, corn: 0.6, chim: { 0: 1 }, pal: 'shophouse',
  });
  def('japan_minka', 'house', {      // Japan: the farmhouse under a great hipped-and-gabled roof of thatch; in town the machiya, narrow and deep, lattice to the street, tiled
    plan: { rect: 5, L: 2 }, w: [10, 15], d: [7, 10], fl: [1, 1], fh: [2.6, 3.0], pb: [0.4, 0.6], loft: 0.6, roof: { iri: 6, hip: 3, gable: 1 }, pitch: [45, 55], over: [0.8, 1.2], gover: [0.4, 0.7], ridge: 0.95,
    wall: { boards: 4, plaster: 5, daub: 1 }, roofm: { thatch: 8, greytile: 2 }, ww: [1.2, 1.8], wh: [1.2, 1.6], bay: [1.8, 2.4], lattice: 0.85, gal: 0.4, gald: [0.9, 1.2], chim: { 0: 1 }, pal: 'japan', annex: 0.25,
    urban: { w: [5, 7], d: [12, 18], fl: [2, 2], fh: [2.6, 2.9], roof: { gable: 7, iri: 3 }, ridge: 1, pitch: [24, 30], roofm: { greytile: 9, shingle: 1 }, shop: 0.6, lattice: 1, gal: 0, oriel: 0 },
  });
  def('korea_hanok', 'china_court', { plan: { L: 4, U: 3, rect: 3 }, w: [10, 15], d: [8, 12], roof: { curve: 4, iri: 4, hip: 2 }, pitch: [26, 34], wall: { plaster: 6, rubble: 2, boards: 2 }, roofm: { greytile: 6, thatch: 4 }, pal: 'korea', urban: { roofm: { greytile: 8, thatch: 2 } } });
  def('ger', 'house', { plan: { round: 1 }, w: [5, 7], d: [5, 7], fl: [1, 1], fh: [1.4, 1.7], pb: [0, 0.05], roof: { cone: 1 }, pitch: [20, 26], over: [0, 0.05], wall: { felt: 1 }, roofm: { felt: 1 }, ww: [0.01, 0.01], wh: [0.01, 0.01], bay: [99, 99], dw: [0.8, 0.9], dh: [1.3, 1.5], chim: { 0: 3, 1: 1 }, chat: { ridge: 1 }, pal: 'ger', annex: 0 });
  // ----- South-east Asia and the Pacific -----
  def('sea_stilt', 'house', {      // the stilt house: a floor high above the wet ground on posts, walls of boards or plaited bamboo, a steep roof of thatch reaching out, the veranda and its ladder
    plan: { rect: 5, L: 2 }, w: [7, 10], d: [5, 8], fl: [1, 1], fh: [2.4, 2.8], pStilt: 0.95, stilt: [1.8, 2.8], roof: { gable: 6, hip: 3, half: 1 }, pitch: [40, 52], over: [0.7, 1.1], gover: [0.6, 0.9], ridge: 0.85,
    wall: { boards: 5, bamboo: 3, palmw: 2 }, roofm: { thatch: 5, palm: 4, tin: 1 }, ww: [0.8, 1.1], wh: [0.9, 1.2], bay: [2.2, 3.0], gal: 0.6, gald: [1.4, 2.2], stair: 0.6, carv: 0.35, chim: { 0: 1 }, pal: 'stilt', annex: 0.2,
  });
  def('thai_house', 'sea_stilt', { roof: { gable: 1 }, pitch: [50, 60], carv: 0.85, wall: { boards: 9, bamboo: 1 }, roofm: { thatch: 4, tile: 4, tin: 2 }, pal: 'thai' });
  def('malay_house', 'sea_stilt', { roof: { gable: 5, hip: 3, half: 2 }, pal: 'malay', wall: { boards: 8, bamboo: 2 } });
  def('minang', 'sea_stilt', { roof: { horn: 1 }, pitch: [45, 55], w: [12, 20], d: [6, 9], carv: 0.9, roofm: { palm: 5, tin: 5 }, pal: 'minang' });
  def('toraja', 'sea_stilt', { roof: { boat: 1 }, pitch: [40, 50], w: [8, 11], d: [4, 6], carv: 1, roofm: { thatch: 1 }, pal: 'toraja' });
  def('joglo', 'house', { plan: { rect: 1 }, w: [10, 14], d: [10, 14], fl: [1, 1], fh: [2.8, 3.2], pb: [0.3, 0.5], roof: { pyr: 1 }, pitch: [35, 45], over: [0.9, 1.3], wall: { boards: 6, plaster: 4 }, roofm: { tile: 1 }, gal: 0.5, gald: [1.6, 2.2], gals: { wrap: 1 }, carv: 0.6, chim: { 0: 1 }, pal: 'java' });
  def('viet_house', 'china_court', { plan: { rect: 6, L: 2 }, w: [8, 12], d: [5, 8], fl: [1, 1], roof: { gable: 6, curve: 4 }, wall: { plaster: 5, brick: 3, boards: 2 }, roofm: { tile: 5, thatch: 5 }, gal: 0.6, gald: [1.4, 2.0], pal: 'viet',
    urban: { plan: { rect: 1 }, w: [4, 5.5], d: [14, 20], fl: [2, 3], roof: { gable: 7, flat: 3 }, roofm: { tile: 8 }, shop: 0.8, balc: 0.4, balk: { iron: 1 }, pal: 'viettown' } });
  def('bahay_kubo', 'sea_stilt', { w: [5, 7], d: [4, 6], roof: { hip: 5, gable: 5 }, pitch: [45, 55], wall: { bamboo: 5, palmw: 5 }, roofm: { palm: 9, tin: 1 }, pal: 'stilt' });
  def('bahay_bato', 'house', { plan: { rect: 1 }, w: [10, 14], d: [10, 14], fl: [2, 2], fh: [3.2, 3.6], roof: { hip: 9, gable: 1 }, pitch: [28, 34], over: [0.6, 0.9], ridge: 0.95, wall: { boards: 5, plaster: 5 }, wall2: { ashlar: 5, rubble: 3 }, w2on: 'ground', pW2: 1, roofm: { tile: 6, tin: 4 }, ww: [1.4, 1.8], wh: [1.4, 1.7], bay: [1.8, 2.4], jet: 0.7, jetd: [0.5, 0.9], lattice: 0.6, shut: 0.5, pal: 'philcolonial' });
  def('fale', 'house', { plan: { rect: 6, round: 4 }, w: [6, 9], d: [5, 7], fl: [1, 1], fh: [1.8, 2.2], pb: [0.4, 0.7], roof: { hip: 7, gable: 3 }, pitch: [45, 55], over: [0.4, 0.6], gal: 0.9, gald: [1.0, 1.4], gals: { wrap: 1 }, wall: { palmw: 1 }, roofm: { palm: 6, thatch: 4 }, ww: [0.01, 0.01], wh: [0.01, 0.01], bay: [99, 99], chim: { 0: 1 }, pal: 'stilt' });
  def('maori_whare', 'house', { plan: { rect: 1 }, w: [5, 7], d: [8, 12], fl: [1, 1], fh: [1.8, 2.2], roof: { gable: 1 }, pitch: [35, 45], over: [0.3, 0.5], gover: [0.8, 1.4], ridge: 0.05, wall: { boards: 6, reed: 4 }, roofm: { thatch: 1 }, carv: 1, gal: 0.7, gald: [1.4, 2.0], chim: { 0: 1 }, pal: 'maori' });
  // ----- the Americas -----
  def('maya_hut', 'round_hut', { plan: { round: 6, rect: 4 }, w: [4, 5.5], d: [6, 8], pitch: [50, 58], over: [0.4, 0.6], wall: { lime: 5, mud: 3, reed: 2 }, roofm: { palm: 6, thatch: 4 }, pal: 'maya' });
  def('meso_adobe', 'mud_court', { pal: 'mesoadobe', wall: { mud: 6, plaster: 4 }, roofm: { earth: 1 }, toron: 0.4 });
  def('andes_stone', 'house', { plan: { rect: 5, U: 2, court: 1 }, w: [6, 9], d: [4, 6], fl: [1, 2], fh: [2.2, 2.6], roof: { gable: 7, hip: 3 }, pitch: [40, 50], over: [0.3, 0.5], ridge: 0.85, wall: { inca: 3, rubble: 5, mud: 2 }, roofm: { thatch: 8, tile: 2 }, ww: [0.4, 0.6], wh: [0.5, 0.8], bay: [3, 4], chim: { 0: 1 }, pal: 'andes', annex: 0.3 });
  def('maloca', 'house', { plan: { rect: 6, round: 4 }, w: [14, 24], d: [10, 16], fl: [1, 1], fh: [1.4, 1.8], roof: { hip: 6, cone: 4 }, pitch: [50, 60], over: [0.1, 0.3], wall: { palmw: 1 }, roofm: { palm: 1 }, ww: [0.01, 0.01], wh: [0.01, 0.01], bay: [99, 99], dw: [1.0, 1.4], dh: [1.6, 2.0], chim: { 0: 1 }, pal: 'stilt' });
  def('pueblo', 'mud_court', { plan: { rect: 1 }, w: [6, 10], d: [5, 8], fl: [1, 3], roof: { flat: 1 }, par: [0.3, 0.5], wall: { mud: 9, rubble: 1 }, toron: 0.9, stair: 0.4, pal: 'pueblo' });
  def('plank_house', 'house', { plan: { rect: 1 }, w: [12, 18], d: [10, 16], fl: [1, 1], fh: [3.0, 3.6], roof: { gable: 1 }, pitch: [18, 26], over: [0.4, 0.6], gover: [0.6, 0.9], ridge: 0.05, wall: { boards: 1 }, roofm: { shingle: 1 }, ww: [0.01, 0.01], wh: [0.01, 0.01], bay: [99, 99], dw: [0.8, 1.0], dh: [1.2, 1.6], carv: 1, chim: { 0: 1 }, pal: 'nwc' });
  def('longhouse_bark', 'house', { plan: { rect: 1 }, w: [6, 7.5], d: [18, 40], fl: [1, 1], fh: [1.6, 2.0], roof: { vault: 1 }, wall: { boards: 1 }, roofm: { shingle: 1 }, ww: [0.01, 0.01], wh: [0.01, 0.01], bay: [99, 99], ridge: 0.05, chim: { 0: 1 }, pal: 'bark' });
  def('earth_lodge', 'round_hut', { w: [10, 14], d: [10, 14], fh: [1.2, 1.5], roof: { dome: 1 }, wall: { turf: 1 }, roofm: { turf: 1 }, pal: 'hut' });
  def('sod_igloo', 'round_hut', { w: [4, 5], d: [4, 5], fh: [0.3, 0.5], roof: { dome: 1 }, wall: { snow: 1 }, roofm: { felt: 1 }, pal: 'igloo' });
  def('col_spanish', 'house', {      // the colonial towns of Spain: single-storied houses wall to wall round their patios, tall grilled windows, a cornice and parapet, painted in strong colours; tile in the hills
    plan: { court: 4, rect: 4, U: 2 }, w: [10, 16], d: [12, 18], fl: [1, 2], fh: [3.6, 4.4], roof: { flat: 6, gable: 2, hip: 2 }, pitch: [18, 24], par: [0.6, 1.0], over: [0.2, 0.4],
    wall: { plaster: 8, mud: 2 }, roofm: { tile: 6, earth: 4 }, ww: [1.0, 1.2], wh: [2.0, 2.4], sill: [0.4, 0.6], bay: [2.6, 3.4], grille: 0.85, shut: 0.4, darch: 0.4, corn: 0.75, chim: { 0: 3, 1: 1 }, balc: 0.25, balk: { wood: 2, iron: 2 }, pal: 'colonial', toron: 0.1, annex: 0.1,
    rural: { plan: { rect: 5, L: 3 }, w: [8, 12], d: [5, 7], fl: [1, 1], fh: [2.8, 3.2], roof: { gable: 5, flat: 3, hip: 2 }, wall: { mud: 6, plaster: 4 }, gal: 0.4, gald: [1.8, 2.4] },
    rich: { fl: [2, 2], w: [18, 26], d: [18, 26], plan: { court: 1 }, balc: 0.75, balk: { wood: 3, iron: 1 }, corn: 1, arc: 0.3 },
  });
  def('col_portuguese', 'col_spanish', { roof: { hip: 6, gable: 4 }, pitch: [24, 32], over: [0.4, 0.6], roofm: { tile: 1 }, fl: [1, 3], wall: { lime: 7, plaster: 3 }, pal: 'portuguese', shut: 0.6, balc: 0.35 });
  def('col_english', 'house', {      // colonial New England and Virginia: the saltbox and the Cape in clapboard round a central chimney, brick Georgian in the towns, shingle roofs
    plan: { rect: 6, L: 2 }, w: [9, 12], d: [6, 9], fl: [1, 2], fh: [2.5, 2.8], loft: 0.5, roof: { gable: 8, gambrel: 2 }, pitch: [40, 48], over: [0.15, 0.3], gover: [0.1, 0.2], ridge: 0.95,
    wall: { clap: 8, boards: 1, brick: 1 }, roofm: { shingle: 8, slate: 2 }, ww: [0.85, 1.0], wh: [1.3, 1.5], bay: [2.2, 2.8], shut: 0.6, dpos: { c: 6, l: 1 }, chim: { 1: 6, 2: 3 }, chat: { ridge: 4, gable: 3 }, dorm: { 0: 3, 2: 1 }, pal: 'newengland', annex: 0.4,
    urban: { fl: [2, 3], w: [7, 10], d: [9, 12], wall: { brick: 6, clap: 4 }, roofm: { slate: 5, shingle: 5 }, shop: 0.3, corn: 0.5, pal: 'georgian' },
  });
  def('us_victorian', 'vic', { wall: { clap: 8, brick: 2 }, roofm: { shingle: 6, slate: 4 }, gal: 0.75, gald: [1.8, 2.6], gals: { front: 3, wrap: 2 }, carv: 0.7, pal: 'usvic', rural: { plan: { rect: 4, L: 4, T: 2 }, w: [8, 11], d: [8, 11], wall: { clap: 1 }, gal: 0.6 }, urban: { w: [5.5, 7], d: [12, 16], fl: [2, 3], wall: { brick: 6, clap: 4 }, roof: { gable: 5, flat: 5 }, par: [0.5, 0.9], corn: 0.8, gal: 0.2 } });
  def('us_frame', 'house', { plan: { rect: 6, L: 3 }, w: [7, 10], d: [8, 11], fl: [1, 2], fh: [2.6, 2.9], roof: { gable: 9, hip: 1 }, pitch: [35, 45], over: [0.3, 0.45], ridge: 0.3, wall: { clap: 1 }, roofm: { shingle: 7, tin: 3 }, ww: [0.9, 1.0], wh: [1.4, 1.6], bay: [2.2, 2.8], gal: 0.5, gald: [1.8, 2.4], chim: { 1: 1 }, chat: { ridge: 1 }, pal: 'usfarm', annex: 0.35, urban: { roof: { gable: 6, flat: 4 }, par: [0.8, 1.6], shop: 0.6, gal: 0.6, ridge: 0.05 } });
  def('us_bungalow', 'house', { plan: { rect: 6, L: 2 }, w: [9, 12], d: [10, 14], fl: [1, 2], fh: [2.6, 2.8], roof: { gable: 6, hip: 4 }, pitch: [25, 35], over: [0.6, 0.9], gover: [0.4, 0.7], ridge: 0.5, wall: { clap: 6, brick: 3, plaster: 1 }, roofm: { shingle: 9, tile: 1 }, ww: [1.0, 1.4], wh: [1.3, 1.6], gal: 0.85, gald: [2.0, 2.8], chim: { 1: 1 }, chat: { side: 1 }, dorm: { 0: 3, 1: 1 }, pal: 'craftsman', annex: 0.4 });
  def('us_ranch', 'house', { plan: { rect: 5, L: 5 }, w: [14, 20], d: [9, 12], fl: [1, 1], fh: [2.6, 2.8], roof: { hip: 6, gable: 4 }, pitch: [18, 26], over: [0.5, 0.8], ridge: 0.98, wall: { brick: 4, clap: 4, plaster: 2 }, roofm: { shingle: 1 }, ww: [1.4, 2.2], wh: [1.2, 1.5], chim: { 0: 3, 1: 2 }, chat: { side: 1 }, annex: 0.6, pal: 'ranch' });
  def('false_front', 'us_frame', { plan: { rect: 1 }, w: [7, 10], d: [12, 16], fl: [1, 2], ridge: 0.02, par: [1.6, 2.6], roof: { gable: 1 }, shop: 1, gal: 0.7, gald: [2.0, 2.6], pal: 'western' });
  def('carib_house', 'house', { plan: { rect: 6, L: 2 }, w: [7, 10], d: [6, 9], fl: [1, 2], fh: [2.8, 3.2], pb: [0.5, 0.9], roof: { hip: 6, gable: 4 }, pitch: [30, 40], over: [0.5, 0.8], ridge: 0.9, wall: { clap: 7, plaster: 3 }, roofm: { tin: 6, shingle: 3, tile: 1 }, ww: [0.9, 1.1], wh: [1.6, 2.0], bay: [2.0, 2.6], shut: 0.85, gal: 0.75, gald: [1.8, 2.4], carv: 0.6, chim: { 0: 1 }, pal: 'carib' });
  def('creole', 'carib_house', { gal: 0.9, galf: 0.5, wall: { plaster: 6, clap: 4 }, roofm: { slate: 4, tin: 4, tile: 2 }, pal: 'creole' });
  def('queenslander', 'carib_house', { pStilt: 0.85, stilt: [1.8, 2.6], roof: { hip: 8, pyr: 2 }, pitch: [28, 34], wall: { clap: 1 }, roofm: { tin: 1 }, gal: 0.95, gals: { wrap: 3, front: 2 }, pal: 'queensland' });
  def('austr_federation', 'vic', { wall: { brick: 9, plaster: 1 }, roofm: { plain: 5, tin: 5 }, roof: { hip: 6, gable: 4 }, gal: 0.7, gald: [1.8, 2.4], gals: { front: 2, wrap: 1 }, pal: 'federation' });
  def('austr_bark', 'house', { plan: { rect: 1 }, w: [3, 4], d: [2.5, 3.5], fl: [1, 1], fh: [1.0, 1.3], roof: { shed: 1 }, pitch: [25, 35], over: [0.1, 0.2], wall: { boards: 1 }, roofm: { shingle: 1 }, ww: [0.01, 0.01], wh: [0.01, 0.01], bay: [99, 99], chim: { 0: 1 }, pal: 'bark' });
  // ----- the twentieth century and after, everywhere -----
  def('concrete_house', 'house', {      // the house the world's south built itself in concrete: two and three floors, flat roofs with the rods left standing for the next floor, painted bright; balconies
    plan: { rect: 7, L: 3 }, w: [7, 11], d: [8, 12], fl: [2, 3], fh: [2.8, 3.1], roof: { flat: 1 }, par: [0.4, 0.9], over: [0.05, 0.2],
    wall: { concrete: 4, plaster: 6 }, roofm: { flat: 1 }, ww: [0.9, 1.3], wh: [1.1, 1.4], bay: [2.4, 3.2], grille: 0.4, balc: 0.5, balk: { stone: 2, iron: 2 }, chim: { 0: 1 }, toron: 0.35, pal: 'concrete', shop: 0.3, annex: 0.2,
  });
  def('med_flats', 'cont_block', { fl: [4, 6], fh: [2.9, 3.1], roof: { flat: 7, hip: 3 }, wall: { plaster: 7, concrete: 3 }, roofm: { tile: 6, flat: 4 }, balc: 0.95, balk: { stone: 3, iron: 2 }, bfull: 0.6, shut: 0.5, corn: 0.1, strc: 0.1, quoin: 0, ww: [1.1, 1.5], wh: [1.4, 1.6], pal: 'medmodern' });
  def('china_village', 'concrete_house', { fl: [3, 4], roof: { flat: 6, hip: 4 }, pitch: [24, 30], roofm: { flat: 5, glaze: 2, tile: 3 }, wall: { plaster: 4, concrete: 6 }, ww: [1.4, 2.0], pal: 'chinamodern', toron: 0.1 });
  def('japan_modern', 'house', { plan: { rect: 6, L: 4 }, w: [7, 10], d: [7, 10], fl: [2, 2], fh: [2.6, 2.8], roof: { gable: 5, hip: 4, flat: 1 }, pitch: [22, 32], over: [0.4, 0.6], wall: { plaster: 6, clap: 2, concrete: 2 }, roofm: { greytile: 4, slate: 3, tin: 3 }, ww: [1.2, 1.8], wh: [1.1, 1.4], balc: 0.4, balk: { iron: 1 }, chim: { 0: 1 }, pal: 'japanmodern', annex: 0.3 });
  def('future_house', 'house', { plan: { rect: 5, L: 5 }, w: [10, 14], d: [9, 12], fl: [2, 3], fh: [2.9, 3.2], roof: { flat: 7, shed: 3 }, pitch: [8, 14], par: [0.3, 0.5], wall: { plaster: 5, glass: 3, boards: 2 }, roofm: { solar: 7, turf: 3 }, ww: [1.8, 3.0], wh: [1.8, 2.4], bay: [3.0, 4.0], balc: 0.6, balk: { iron: 1 }, bfull: 0.6, chim: { 0: 1 }, pal: 'future', annex: 0.3 });

  // ---------- when: the timeline of every region ----------
  // [age, how far into it (0..1), style or { style: weight }] in order; a house takes the last entry its own day has reached.
  // A style table keyed by builders (euro, mena, africa, sasia, easia, seasia, amer, nam) says who builds what where they
  // are not at home: the colonial towns of the Americas are built by whoever came over the sea.
  const T = {
    brit: [[4, 0, 'nw_med'], [5, 0, 'brit_tudor'], [5, 0.85, 'georgian'], [6, 0.5, 'vic'], [7, 0.15, 'uk_semi'], [8, 0, 'modern_euro'], [9, 0, 'future_house']],
    ice: [[4, 0, 'ice_turf'], [6, 0.4, { scan_red: 2, ice_turf: 1 }], [7, 0, 'modern_euro'], [9, 0, 'future_house']],
    lowc: [[4, 0, 'lowc_med'], [5, 0, 'dutch'], [6, 0.6, { dutch: 1, vic: 1 }], [7, 0.2, 'modern_euro'], [9, 0, 'future_house']],
    scan: [[4, 0, 'scan_med'], [5, 0.2, 'scan_red'], [6, 0.6, { scan_red: 2, cont_block: 1 }], [7, 0.3, 'modern_euro'], [9, 0, 'future_house']],
    balt: [[4, 0, 'balt_med'], [5, 0.3, { balt_med: 2, germ_ren: 1 }], [6, 0.4, { rus_izba: 1, cont_block: 1 }], [7, 0.3, 'modern_euro'], [9, 0, 'future_house']],
    alps: [[4, 0, 'alps_chalet'], [6, 0.7, { alps_chalet: 3, cont_block: 1 }], [8, 0, { alps_chalet: 2, modern_euro: 1 }], [9, 0, 'future_house']],
    germ: [[4, 0, 'germ_med'], [5, 0, 'germ_ren'], [6, 0.3, 'cont_block'], [7, 0.2, 'modern_euro'], [9, 0, 'future_house']],
    pol: [[4, 0, 'balt_med'], [5, 0, 'pol_town'], [6, 0.3, { cont_block: 2, pol_town: 1 }], [7, 0.3, 'modern_euro'], [9, 0, 'future_house']],
    cent: [[4, 0, { germ_med: 1, cent_village: 1 }], [5, 0, { pol_town: 1, cent_village: 1 }], [6, 0.3, { cont_block: 2, cent_village: 1 }], [7, 0.3, 'modern_euro'], [9, 0, 'future_house']],
    nfra: [[4, 0, 'nfra_med'], [5, 0.25, 'nfra_classic'], [6, 0.5, { haussmann: 1, nfra_classic: 2 }], [7, 0.2, 'modern_euro'], [9, 0, 'future_house']],
    sfra: [[4, 0, 'sfra_med'], [6, 0.4, { sfra_med: 2, cont_block: 1 }], [7, 0.4, { med_flats: 1, sfra_med: 2 }], [9, 0, 'future_house']],
    iber: [[4, 0, 'iber_med'], [6, 0.4, { iber_med: 2, cont_block: 1 }], [7, 0.4, { med_flats: 2, iber_med: 1 }], [9, 0, 'future_house']],
    ital: [[4, 0, 'ital_med'], [5, 0, 'ital_ren'], [6, 0.4, { ital_ren: 1, cont_block: 1 }], [7, 0.4, { med_flats: 2, ital_ren: 1 }], [9, 0, 'future_house']],
    greece: [[4, 0, { greece_main: 3, greece_island: 1 }], [5, 0.3, { balk_ottoman: 1, greece_main: 2, greece_island: 1 }], [7, 0.4, { med_flats: 2, greece_island: 1 }], [9, 0, 'future_house']],
    balk: [[4, 0, { med_stone: 1, cent_village: 1 }], [5, 0.15, 'balk_ottoman'], [6, 0.6, { balk_ottoman: 1, cont_block: 1 }], [7, 0.4, { concrete_house: 2, med_flats: 1 }], [9, 0, 'future_house']],
    anat: [[4, 0, { mud_court: 1, med_stone: 1 }], [5, 0, 'balk_ottoman'], [7, 0.3, { concrete_house: 2, med_flats: 1 }], [9, 0, 'future_house']],
    cauc: [[4, 0, { hima_stone: 2, mud_court: 1 }], [6, 0.5, { balk_ottoman: 1, hima_stone: 1 }], [7, 0.3, 'concrete_house'], [9, 0, 'future_house']],
    ukr: [[4, 0, 'cent_village'], [6, 0.3, { cent_village: 2, rus_town: 1 }], [7, 0.3, { modern_euro: 1, concrete_house: 1 }], [9, 0, 'future_house']],
    steppe: [[4, 0, 'ger'], [6, 0.3, { ger: 1, rus_izba: 1 }], [7, 0.2, { rus_izba: 1, concrete_house: 1 }], [9, 0, 'future_house']],
    rus: [[4, 0, 'rus_izba'], [6, 0.2, { rus_izba: 3, rus_town: 1 }], [7, 0.3, { rus_izba: 2, modern_euro: 1 }], [9, 0, 'future_house']],
    egypt: [[4, 0, 'egypt_mud'], [6, 0.5, { egypt_mud: 2, levant_red: 1 }], [7, 0.2, 'concrete_house'], [9, 0, 'future_house']],
    magh: [[4, 0, { magh_medina: 3, kasbah: 1 }], [7, 0.3, { concrete_house: 2, magh_medina: 1 }], [9, 0, 'future_house']],
    levant: [[4, 0, 'levant_stone'], [6, 0.5, { levant_red: 2, levant_stone: 1 }], [7, 0.3, 'concrete_house'], [9, 0, 'future_house']],
    meso: [[4, 0, 'meso_mud'], [7, 0.2, 'concrete_house'], [9, 0, 'future_house']],
    gulf: [[4, 0, 'gulf_coral'], [7, 0.3, 'concrete_house'], [9, 0, 'future_house']],
    yemen: [[4, 0, 'yemen_tower'], [8, 0, { yemen_tower: 1, concrete_house: 1 }], [9, 0, 'future_house']],
    arab: [[4, 0, { najdi: 3, hejaz: 1 }], [7, 0.3, 'concrete_house'], [9, 0, 'future_house']],
    pers: [[4, 0, 'pers_dome'], [7, 0.3, 'concrete_house'], [9, 0, 'future_house']],
    casia: [[4, 0, 'casia_mud'], [7, 0.2, { concrete_house: 1, casia_mud: 1 }], [9, 0, 'future_house']],
    tibet: [[4, 0, 'tibet_flat'], [8, 0, { tibet_flat: 2, concrete_house: 1 }], [9, 0, 'future_house']],
    hima: [[4, 0, 'hima_stone'], [8, 0, { hima_stone: 2, concrete_house: 1 }], [9, 0, 'future_house']],
    mong: [[4, 0, 'ger'], [7, 0.3, { ger: 1, concrete_house: 1 }], [9, 0, 'future_house']],
    raj: [[4, 0, 'raj_haveli'], [7, 0.3, { concrete_house: 2, raj_haveli: 1 }], [9, 0, 'future_house']],
    beng: [[4, 0, 'beng_hut'], [6, 0.6, { beng_hut: 2, ind_flat: 1 }], [7, 0.4, { concrete_house: 1, beng_hut: 1 }], [9, 0, 'future_house']],
    hind: [[4, 0, 'ind_flat'], [7, 0.3, { concrete_house: 2, ind_flat: 1 }], [9, 0, 'future_house']],
    kerala: [[4, 0, 'kerala_tile'], [7, 0.4, { concrete_house: 1, kerala_tile: 1 }], [9, 0, 'future_house']],
    lanka: [[4, 0, 'kerala_tile'], [7, 0.4, { concrete_house: 1, kerala_tile: 1 }], [9, 0, 'future_house']],
    dec: [[4, 0, { deccan_flat: 2, tamil_row: 1 }], [7, 0.3, { concrete_house: 2, tamil_row: 1 }], [9, 0, 'future_house']],
    korea: [[4, 0, 'korea_hanok'], [7, 0.4, { concrete_house: 1, japan_modern: 1 }], [9, 0, 'future_house']],
    japan: [[4, 0, 'japan_minka'], [7, 0.3, { japan_minka: 1, japan_modern: 2 }], [8, 0, 'japan_modern'], [9, 0, 'future_house']],
    nchina: [[4, 0, 'china_court'], [6, 0.6, { china_court: 3, china_shop: 1 }], [7, 0.5, { china_village: 2, china_court: 1 }], [9, 0, 'future_house']],
    schina: [[4, 0, { china_south: 4, china_stilt: 1 }], [6, 0.5, { china_south: 2, china_shop: 1 }], [7, 0.5, { china_village: 2, china_south: 1 }], [9, 0, 'future_house']],
    viet: [[4, 0, 'viet_house'], [7, 0.3, { viet_house: 1, concrete_house: 1 }], [9, 0, 'future_house']],
    indo: [[4, 0, 'thai_house'], [6, 0.6, { thai_house: 3, china_shop: 1 }], [7, 0.5, { thai_house: 1, concrete_house: 1 }], [9, 0, 'future_house']],
    malay: [[4, 0, { malay_house: 6, joglo: 2 }], [6, 0.5, { malay_house: 3, china_shop: 1 }], [7, 0.5, { malay_house: 1, concrete_house: 1 }], [9, 0, 'future_house']],
    phil: [[4, 0, 'bahay_kubo'], [5, 0.3, { amer: { bahay_kubo: 1 }, euro: { bahay_bato: 1, bahay_kubo: 2 }, '*': { bahay_kubo: 1 } }], [7, 0.4, { concrete_house: 1, bahay_kubo: 1 }], [9, 0, 'future_house']],
    mela: [[4, 0, 'sea_stilt'], [8, 0, { sea_stilt: 2, concrete_house: 1 }], [9, 0, 'future_house']],
    poly: [[4, 0, { fale: 2, maori_whare: 1 }], [6, 0.4, { euro: { vic: 1 }, '*': { fale: 1 } }], [7, 0.3, { euro: { us_bungalow: 1 }, '*': { fale: 1, concrete_house: 1 } }], [9, 0, 'future_house']],
    austr: [[4, 0, 'austr_bark'], [6, 0, { euro: { austr_federation: 2, queenslander: 1 }, nam: { austr_federation: 2, queenslander: 1 }, '*': { austr_bark: 1 } }], [7, 0.4, { euro: { us_bungalow: 1, us_ranch: 1 }, nam: { us_bungalow: 1, us_ranch: 1 }, '*': { concrete_house: 1 } }], [9, 0, 'future_house']],
    ethi: [[4, 0, 'ethi_tukul'], [7, 0.3, { ethi_tukul: 1, concrete_house: 1 }], [9, 0, 'future_house']],
    sahel: [[4, 0, { sahel_mud: 3, hausa: 1 }], [7, 0.3, { sahel_mud: 1, concrete_house: 1 }], [9, 0, 'future_house']],
    wafr: [[4, 0, 'wafr_house'], [7, 0.3, { wafr_house: 1, concrete_house: 1 }], [9, 0, 'future_house']],
    swah: [[4, 0, { swahili: 2, round_hut: 1 }], [7, 0.4, { concrete_house: 1, swahili: 1 }], [9, 0, 'future_house']],
    madag: [[4, 0, 'sea_stilt'], [6, 0.4, { sea_stilt: 1, carib_house: 1 }], [7, 0.5, 'concrete_house'], [9, 0, 'future_house']],
    eafr: [[4, 0, 'round_hut'], [6, 0.6, { round_hut: 2, rondavel_tin: 1 }], [7, 0.4, { rondavel_tin: 1, concrete_house: 1 }], [9, 0, 'future_house']],
    cafr: [[4, 0, 'cafr_house'], [7, 0.4, { cafr_house: 1, concrete_house: 1 }], [9, 0, 'future_house']],
    safr: [[4, 0, { round_hut: 3, beehive: 1 }], [5, 0.5, { euro: { cape_dutch: 1 }, '*': { round_hut: 3, beehive: 1 } }], [6, 0.5, { euro: { vic: 1, cape_dutch: 1 }, '*': { rondavel_tin: 1 } }], [7, 0.4, { euro: { us_ranch: 1 }, '*': { rondavel_tin: 1, concrete_house: 1 } }], [9, 0, 'future_house']],
    nwc: [[4, 0, 'plank_house'], [6, 0.3, { euro: { us_frame: 1 }, '*': { plank_house: 1 } }], [7, 0.2, { euro: { us_bungalow: 1 }, '*': { plank_house: 1, us_frame: 1 } }], [8, 0, 'us_ranch'], [9, 0, 'future_house']],
    cal: [[4, 0, 'earth_lodge'], [5, 0.4, { euro: { col_spanish: 1 }, '*': { earth_lodge: 1 } }], [6, 0.6, { euro: { us_victorian: 1, col_spanish: 1 }, '*': { us_frame: 1 } }], [7, 0.2, 'us_bungalow'], [8, 0, 'us_ranch'], [9, 0, 'future_house']],
    swest: [[4, 0, 'pueblo'], [5, 0.3, { euro: { col_spanish: 1 }, '*': { pueblo: 1 } }], [6, 0.6, { col_spanish: 2, false_front: 1 }], [7, 0.3, { us_ranch: 1, col_spanish: 1 }], [9, 0, 'future_house']],
    plains: [[4, 0, 'earth_lodge'], [6, 0.4, { euro: { us_frame: 3, false_front: 1 }, nam: { us_frame: 3, false_front: 1 }, '*': { earth_lodge: 1 } }], [7, 0.2, { us_bungalow: 1, us_frame: 1 }], [8, 0, 'us_ranch'], [9, 0, 'future_house']],
    ewood: [[4, 0, 'longhouse_bark'], [5, 0.3, { euro: { col_english: 1 }, nam: { col_english: 1 }, '*': { longhouse_bark: 1 } }], [6, 0.3, { euro: { col_english: 1, us_victorian: 1 }, nam: { col_english: 1, us_victorian: 1 }, '*': { us_frame: 1 } }], [6, 0.6, 'us_victorian'], [7, 0.15, 'us_bungalow'], [8, 0, 'us_ranch'], [9, 0, 'future_house']],
    arctic: [[4, 0, 'sod_igloo'], [6, 0.6, { euro: { scan_red: 1 }, '*': { sod_igloo: 1 } }], [7, 0.3, { scan_red: 1, us_frame: 1 }], [9, 0, 'future_house']],
    andes: [[4, 0, 'andes_stone'], [5, 0.3, { euro: { col_spanish: 1 }, '*': { andes_stone: 1 } }], [7, 0.4, { concrete_house: 1, andes_stone: 1 }], [9, 0, 'future_house']],
    mesoam: [[4, 0, { maya_hut: 2, meso_adobe: 2 }], [5, 0.3, { euro: { col_spanish: 1 }, '*': { meso_adobe: 1, maya_hut: 1 } }], [7, 0.3, { concrete_house: 2, col_spanish: 1 }], [9, 0, 'future_house']],
    carib: [[4, 0, 'maya_hut'], [5, 0.3, { euro: { col_spanish: 1, carib_house: 1 }, '*': { maya_hut: 1 } }], [6, 0.4, { carib_house: 2, col_spanish: 1 }], [7, 0.5, { concrete_house: 1, carib_house: 1 }], [9, 0, 'future_house']],
    camer: [[4, 0, 'maya_hut'], [5, 0.3, { euro: { col_spanish: 1 }, '*': { maya_hut: 1 } }], [7, 0.4, { concrete_house: 2, col_spanish: 1 }], [9, 0, 'future_house']],
    brazil: [[4, 0, 'maloca'], [5, 0.3, { euro: { col_portuguese: 1 }, '*': { maloca: 1 } }], [7, 0.4, { concrete_house: 2, col_portuguese: 1 }], [9, 0, 'future_house']],
    amaz: [[4, 0, { maloca: 2, sea_stilt: 1 }], [6, 0.5, { euro: { sea_stilt: 1, col_portuguese: 1 }, '*': { maloca: 1 } }], [7, 0.5, { sea_stilt: 1, concrete_house: 1 }], [9, 0, 'future_house']],
    pamp: [[4, 0, 'andes_stone'], [5, 0.4, { euro: { col_spanish: 1 }, '*': { andes_stone: 1 } }], [6, 0.6, { col_spanish: 1, cont_block: 1 }], [7, 0.4, { concrete_house: 1, med_flats: 1 }], [9, 0, 'future_house']],
  };
  // the sub-regions where a region's tradition takes another turn (checked before its timeline)
  const SUB = [
    ['iber', (lo, la) => la > 42 || (lo < -7.5 && la > 41), [[4, 0, 'iber_north'], [7, 0.4, { iber_north: 1, med_flats: 1 }], [9, 0, 'future_house']]],      // Galicia, Asturias and the Basque hills: granite, galleries
    ['greece', (lo, la) => la < 38.5 && lo > 23.5, [[4, 0, 'greece_island'], [9, 0, 'future_house']]],      // the islands
    ['egypt', (lo, la) => la < 24.5, [[4, 0, 'nubia'], [7, 0.4, { nubia: 1, concrete_house: 1 }], [9, 0, 'future_house']]],      // Nubia
    ['magh', (lo, la) => la < 31.8 && lo < 0 || la < 31.3, [[4, 0, 'kasbah'], [7, 0.4, { kasbah: 1, concrete_house: 1 }], [9, 0, 'future_house']]],      // south of the Atlas, the Saharan oases
    ['arab', (lo, la) => lo < 42 && la > 18, [[4, 0, 'hejaz'], [7, 0.3, 'concrete_house'], [9, 0, 'future_house']]],      // the Hejaz
    ['schina', (lo, la) => lo > 115.8 && lo < 120.2 && la > 23.5 && la < 27.6, [[4, 0, { tulou: 1, china_south: 2 }], [7, 0.5, { china_village: 2, china_south: 1 }], [9, 0, 'future_house']]],      // Fujian
    ['schina', (lo, la) => lo < 110.5 && la < 30, [[4, 0, { china_stilt: 3, china_south: 1 }], [7, 0.5, { china_village: 1, china_stilt: 1 }], [9, 0, 'future_house']]],      // the south-west hills
    ['malay', (lo, la) => lo > 98.5 && lo < 102 && la > -2.6 && la < 1, [[4, 0, 'minang'], [8, 0, { minang: 1, concrete_house: 1 }], [9, 0, 'future_house']]],      // the Minangkabau
    ['malay', (lo, la) => lo > 118.8 && lo < 121.2 && la > -3.6 && la < -2.4, [[4, 0, 'toraja'], [8, 0, { toraja: 1, concrete_house: 1 }], [9, 0, 'future_house']]],      // Toraja
    ['malay', (lo, la) => lo > 105 && lo < 115 && la < -5.8, [[4, 0, 'joglo'], [6, 0.5, { joglo: 2, china_shop: 1 }], [7, 0.5, { joglo: 1, concrete_house: 1 }], [9, 0, 'future_house']]],      // Java
    ['dec', (lo, la) => la < 13.5 && lo > 77.5, [[4, 0, 'tamil_row'], [7, 0.4, { concrete_house: 1, tamil_row: 1 }], [9, 0, 'future_house']]],      // Tamil country
    ['ewood', (lo, la) => la < 36.6, [[4, 0, 'longhouse_bark'], [5, 0.3, { euro: { col_english: 1 }, nam: { col_english: 1 }, '*': { longhouse_bark: 1 } }], [6, 0.2, { euro: { creole: 1, us_frame: 1 }, nam: { creole: 1, us_frame: 1 }, '*': { us_frame: 1 } }], [7, 0.15, 'us_bungalow'], [8, 0, 'us_ranch'], [9, 0, 'future_house']]],      // the South
    ['austr', (lo, la) => la > -28, [[4, 0, 'austr_bark'], [6, 0, { euro: { queenslander: 1 }, nam: { queenslander: 1 }, '*': { austr_bark: 1 } }], [7, 0.4, { euro: { queenslander: 1, us_ranch: 1 }, nam: { queenslander: 1, us_ranch: 1 }, '*': { concrete_house: 1 } }], [9, 0, 'future_house']]],      // Queensland
    ['nfra', (lo, la) => lo > 1.8 && lo < 3.2 && la > 48.4 && la < 49.3, [[4, 0, 'nfra_med'], [5, 0.25, 'nfra_classic'], [6, 0.35, 'haussmann'], [7, 0.4, { haussmann: 1, modern_euro: 1 }], [9, 0, 'future_house']]],      // Paris
  ];
  // where the builders came from over the sea, the style of their homeland's age when the place has none for them
  const HOME_STYLE = { euro: [[4, 0, 'nw_med'], [5, 0, 'brit_tudor'], [5, 0.85, 'georgian'], [6, 0.5, 'vic'], [7, 0.15, 'uk_semi'], [8, 0, 'modern_euro'], [9, 0, 'future_house']] };

  // ---------- palettes ----------
  // wall: paints (on plaster, lime, daub, clapboard ...); trim: frames, cornices, bargeboards; shut: shutters; door; roof: tints
  // over the roof material (white leaves it as it is)
  const P = {
    neutral: { wall: ['#e8e0cc', '#ddd3bd', '#efe8d8'], trim: ['#f2efe6', '#5a4632'], shut: ['#4f6b4a', '#5a4a3a'], door: ['#5a4030', '#3e4a3a'], roof: ['#ffffff', '#efe6dc', '#e6e2de'] },
    nw: { wall: ['#efe8d6', '#e9dfc5', '#e6d4b0', '#f2ecdd', '#dcc9a3', '#e8d9b8'], trim: ['#3b2c20', '#4a3626', '#2f2620'], shut: ['#3b2c20'], door: ['#4a3626', '#5a4434'], roof: ['#ffffff', '#e9e1d6', '#d9d2c6', '#f2e6d2'] },
    lowc: { wall: ['#efe8d6', '#e9dfc5', '#d9cdb4'], trim: ['#f4f1ea', '#2f2a26', '#e9e4d8'], shut: ['#2f4a3a', '#7a2a24', '#f2efe6'], door: ['#2f4a3a', '#3b2c20', '#5a2a24'], roof: ['#ffffff', '#e2d6cc', '#cbbfb4'] },
    germ: { wall: ['#f2ecdd', '#efe3c6', '#e9dfc5', '#f0e6d2', '#e6d8c0'], trim: ['#3b2a1e', '#5a3a26', '#6a2a20'], shut: ['#3b4a3a', '#6a2a20'], door: ['#4a3626', '#5a3a26'], roof: ['#ffffff', '#efd9cc', '#e2c8b8', '#d9c0b0'] },
    baroque: { wall: ['#f0dfb8', '#e9d0b0', '#e6d6c8', '#d9e0d0', '#f2e6c6', '#e8c9b0', '#f4efe2'], trim: ['#f6f2e8', '#e9e4d8'], shut: ['#5a6b4a', '#7a5a3a'], door: ['#5a4030', '#3e4a3a'], roof: ['#ffffff', '#efd9cc', '#e2c8b8'] },
    pastel: { wall: ['#f0dfb8', '#e9d0b0', '#e6d6c8', '#d9e0d0', '#f2e6c6', '#e8c9b0', '#e0e6c8', '#efd8c8'], trim: ['#f6f2e8', '#e9e4d8'], shut: ['#5a6b4a'], door: ['#5a4030', '#3e4a3a'], roof: ['#ffffff', '#efd9cc'] },
    georgian: { wall: ['#efe8d8', '#e8dcc4', '#f2ecdd', '#e6e2d6'], trim: ['#f6f4ee', '#efece4'], shut: ['#2f3a32'], door: ['#1f2a24', '#2a2a2e', '#5a2a24', '#2f3a52'], roof: ['#ffffff', '#e6e2de'] },
    vic: { wall: ['#efe8d8', '#e8dcc4'], trim: ['#f2efe6', '#e9e4d8', '#c9c2b2'], shut: ['#2f3a32'], door: ['#2f3a52', '#5a2a24', '#2f4a3a', '#1f2a24'], roof: ['#ffffff', '#e6e2de', '#d6d2ce'] },
    semi: { wall: ['#e9e4d8', '#e2dccd', '#efe9de', '#d9d2c4'], trim: ['#f4f1ea', '#e9e4d8'], shut: ['#2f3a32'], door: ['#2f3a52', '#5a2a24', '#2f4a3a', '#e9e4d8'], roof: ['#ffffff', '#efd9cc', '#d9c0b0'] },
    modern: { wall: ['#f2f0ea', '#e9e6de', '#ddd8cc', '#d6d0c4', '#c9cfd2'], trim: ['#f4f4f2', '#3a3a3c', '#5a5a5c'], shut: ['#3a3a3c'], door: ['#3a3a3c', '#5a4030', '#2f3a52'], roof: ['#ffffff', '#c9c4c0', '#9a9590'] },
    nfra: { wall: ['#efe8d8', '#e6dcc4', '#f2ecdd', '#e0d8c6'], trim: ['#3b2c20', '#e9e4d8'], shut: ['#e9e4d8', '#7a8a8a', '#4f6b6a', '#9a8a6a'], door: ['#4a3626', '#2f3a32', '#5a6a72'], roof: ['#ffffff', '#e6e2de', '#efd9cc'] },
    paris: { wall: ['#e9dfc8', '#efe6d2', '#e2d8c2'], trim: ['#e9dfc8'], shut: ['#d9d2c4', '#7a7a74'], door: ['#2f3a32', '#3b2c20', '#2a2a2e'], roof: ['#ffffff', '#d6dade'] },
    cont: { wall: ['#efe6d2', '#e9d8b8', '#e6d0c0', '#d9dcd0', '#f2e6c6', '#e2d2c2', '#ddd4c6', '#c9b8a6'], trim: ['#f6f2e8', '#e9e4d8', '#d9d2c4'], shut: ['#5a6b4a', '#6a5a4a', '#d9d2c4'], door: ['#4a3626', '#2f3a32'], roof: ['#ffffff', '#e2c8b8', '#d6d2ce'] },
    scan: { wall: ['#e8dcc8'], trim: ['#3b2c20'], shut: ['#3b2c20'], door: ['#3b2c20', '#4a3626'], roof: ['#ffffff', '#e6efd6', '#d6e2c4'] },
    falu: { wall: ['#8a2a20', '#7a2620', '#8f3226', '#a33a2c', '#c9a43a', '#efe8d8', '#7a2620'], trim: ['#f4f1ea', '#efece4'], shut: ['#f4f1ea'], door: ['#f4f1ea', '#2f4a3a', '#3b2c20'], roof: ['#ffffff', '#efd9cc'] },
    scancity: { wall: ['#f0dfb8', '#e9d0b0', '#efe6d2', '#e6d6c8', '#d9b88a', '#c9a07a'], trim: ['#f6f2e8'], shut: ['#5a6b4a'], door: ['#4a3626', '#2f4a3a'], roof: ['#ffffff', '#e2c8b8'] },
    rus: { wall: ['#8a6a4a', '#7a5a3a', '#9a7a52'], trim: ['#f4f1ea', '#5a8ab0', '#4a7a5a', '#e9e4d8', '#4a6aa0'], shut: ['#5a8ab0', '#4a7a5a', '#f4f1ea', '#d9b84a'], door: ['#5a3a26', '#4a3626'], roof: ['#ffffff', '#e2dcd6', '#c9d6c4'] },
    russtucco: { wall: ['#f0d898', '#e9d0a0', '#efe6d2', '#e8c9b0', '#d9e0d0', '#f2d0c0'], trim: ['#f6f2e8'], shut: ['#5a6b4a'], door: ['#4a3626', '#2f3a32'], roof: ['#7a9a7a', '#8aa88a', '#c9c4c0', '#9a4a3a'] },
    balt: { wall: ['#8a6a4a', '#7a5a3a', '#e8dcc8'], trim: ['#f4f1ea', '#3b2c20'], shut: ['#3b2c20', '#4a6a5a'], door: ['#3b2c20'], roof: ['#ffffff', '#e2dcd6'] },
    alps: { wall: ['#7a5232', '#6a4a30', '#8a5a36'], trim: ['#efe8d8', '#5a3a26'], shut: ['#2f5a3a', '#7a2a24', '#efe8d8'], door: ['#5a3a26'], roof: ['#ffffff', '#d9d2ca', '#c9c2ba'] },
    alpstown: { wall: ['#f2ecdd', '#efe3c6', '#e9dfc5', '#f0dfb8'], trim: ['#efe8d8', '#5a3a26'], shut: ['#2f5a3a', '#7a2a24'], door: ['#5a3a26'], roof: ['#ffffff', '#d9d2ca'] },
    med: { wall: ['#e9dcc0', '#efe6d2', '#e6d4b0', '#f2ecdd', '#d9c39a'], trim: ['#efe6d2', '#d9cdb4'], shut: ['#4f6b4a', '#5a6a72', '#7a5a3a', '#3e5a6a'], door: ['#5a4030', '#4f6b4a', '#3e5a6a'], roof: ['#ffffff', '#efd9cc', '#e9cdbc', '#f2e2d2'] },
    ital: { wall: ['#e9c98a', '#e2b07a', '#d98a5a', '#efd8a8', '#f0e2c0', '#c97a4a', '#e8b890', '#d9a46a', '#f2e6c6'], trim: ['#efe6d2', '#f6f2e8'], shut: ['#3e5a3a', '#4f6b4a', '#2f4a3a', '#6a5a3a'], door: ['#4a3626', '#3e3a2a'], roof: ['#ffffff', '#efd9cc', '#e9cdbc'] },
    provence: { wall: ['#efe0c0', '#e9d0a0', '#f2e6c6', '#e6c9a0', '#d9b88a'], trim: ['#efe6d2'], shut: ['#7aa0b0', '#5a8a8a', '#9ab0a0', '#a0886a', '#6a8aa0'], door: ['#7aa0b0', '#5a6a72', '#4a3626'], roof: ['#ffffff', '#efd9cc'] },
    iber: { wall: ['#f6f4ee', '#f2f0e8', '#efe9de', '#f4efe4'], trim: ['#d9c39a', '#e9d8b0', '#f6f4ee'], shut: ['#4f6b4a', '#3e5a6a', '#5a4030'], door: ['#5a4030', '#3e4a3a', '#2f3a52'], roof: ['#ffffff', '#efd9cc'] },
    ibern: { wall: ['#efe8d8', '#d9d2c4'], trim: ['#f4f1ea', '#5a4030'], shut: ['#5a4030', '#2f4a3a'], door: ['#5a4030'], roof: ['#ffffff', '#efd9cc', '#d9d2ca'] },
    aegean: { wall: ['#f8f8f6', '#f6f6f2', '#f4f4f0'], trim: ['#f8f8f6'], shut: ['#2a5a9a', '#3a6aa8', '#2f7a8a', '#5a8a3a'], door: ['#2a5a9a', '#3a6aa8', '#7a2a24'], roof: ['#ffffff'] },
    greece: { wall: ['#efe6d2', '#e9dcc0', '#f2ecdd', '#e6d0b0'], trim: ['#f4f1ea'], shut: ['#3a6aa8', '#4f6b4a', '#7a5a3a'], door: ['#3a6aa8', '#5a4030'], roof: ['#ffffff', '#efd9cc'] },
    ottoman: { wall: ['#f4f1ea', '#efe6d2', '#e9dcc0', '#f2e6d2', '#e8d0b8'], trim: ['#5a3a26', '#3b2c20', '#f4f1ea'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#efd9cc', '#e9cdbc'] },
    mud: { wall: ['#c4a273', '#b8956a', '#cdb08a', '#bfa07a'], trim: ['#5a4632'], shut: ['#5a4632'], door: ['#5a4030', '#3e5a6a'], roof: ['#ffffff'] },
    baghdad: { wall: ['#c9a878', '#d7b98a', '#bf9a6a'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff'] },
    egypt: { wall: ['#d9c39a', '#c9a878', '#e6d4b0', '#efe6d2'], trim: ['#5a4632', '#efe6d2'], shut: ['#5a4632'], door: ['#5a4030', '#3e6a8a'], roof: ['#ffffff'] },
    nubia: { wall: ['#e9c98a', '#7ab0c0', '#f2e6c6', '#d9a46a', '#a0c0a0', '#efe0c0'], trim: ['#f6f4ee', '#3a6aa8'], shut: ['#3a6aa8'], door: ['#3a6aa8', '#5a8a3a'], roof: ['#ffffff'] },
    levant: { wall: ['#e9dcc0', '#efe6d2', '#e6d4b0'], trim: ['#efe6d2'], shut: ['#4f6b6a', '#5a7a8a', '#6a5a3a'], door: ['#4f6b6a', '#5a4030'], roof: ['#ffffff', '#efd9cc'] },
    magh: { wall: ['#f6f4ee', '#f2f0e8', '#efe9de', '#e9dfd0'], trim: ['#f6f4ee', '#3a8a6a'], shut: ['#3a8a6a', '#3a6aa8'], door: ['#3a8a6a', '#3a6aa8', '#7a5a3a'], roof: ['#ffffff'] },
    kasbah: { wall: ['#c9844a', '#b8754a', '#d0946a', '#a86a42'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff'] },
    najd: { wall: ['#c9a06a', '#d0aa78', '#bf9460'], trim: ['#f2ecdd'], shut: ['#5a3a26'], door: ['#5a3a26', '#6a8a9a'], roof: ['#ffffff'] },
    gulf: { wall: ['#e9dcc0', '#efe6d2', '#e2d2b4'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26', '#3e6a8a'], roof: ['#ffffff'] },
    hejaz: { wall: ['#efe6d2', '#e9dcc0', '#f2ecdd'], trim: ['#5a3a26', '#4f7a6a'], shut: ['#4f7a6a', '#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff'] },
    yemen: { wall: ['#8a6a4a', '#9a7a5a', '#7a5a3a'], trim: ['#f6f4ee'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff'] },
    pers: { wall: ['#c9a878', '#d7b98a', '#bfa07a'], trim: ['#5a4632'], shut: ['#5a4632'], door: ['#5a4030', '#2f5a7a'], roof: ['#ffffff'] },
    casia: { wall: ['#c9a878', '#d7b98a', '#e6d4b0'], trim: ['#5a3a26', '#3a6aa8'], shut: ['#5a3a26'], door: ['#5a3a26', '#3a6aa8'], roof: ['#ffffff'] },
    hut: { wall: ['#a6764a', '#b8845a', '#96683f', '#c39466'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#3b2c20'], roof: ['#ffffff', '#e6dcc8', '#d9ccb4'] },
    rondavel: { wall: ['#c39466', '#e9dcc0', '#d9c39a', '#b8845a', '#f2ecdd'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#3b2c20', '#3e6a8a'], roof: ['#ffffff', '#c9c4c0'] },
    sahel: { wall: ['#b8845a', '#a6764a', '#c39466', '#9a6a44'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26', '#6a8a9a'], roof: ['#ffffff'] },
    hausa: { wall: ['#b8845a', '#c39466', '#a6764a'], trim: ['#efe6d2', '#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff'] },
    wafr: { wall: ['#a6643a', '#b8754a', '#9a5a34', '#c9844a'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#3b2c20'], roof: ['#ffffff', '#e6dcc8'] },
    ethi: { wall: ['#8a6a4a', '#a6764a', '#9a7a5a'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#3b2c20'], roof: ['#ffffff', '#e6dcc8'] },
    swahili: { wall: ['#f2ecdd', '#efe6d2', '#e9dcc0'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff'] },
    capedutch: { wall: ['#f8f8f6', '#f4f4f0'], trim: ['#f8f8f6'], shut: ['#2f4a3a', '#3b2c20'], door: ['#3b2c20', '#2f4a3a'], roof: ['#ffffff', '#e6dcc8'] },
    india: { wall: ['#e9dcc0', '#d9c39a', '#f0ece2', '#e6c9a0', '#c99a76', '#b8d0c8', '#e0b8a0'], trim: ['#f6f4ee', '#5a3a26'], shut: ['#3a8a8a', '#5a3a26'], door: ['#5a3a26', '#3a6aa8', '#3a8a6a'], roof: ['#ffffff'] },
    raj: { wall: ['#d9a46a', '#e9b880', '#c98a5a', '#e9c98a'], trim: ['#efe0c0'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff'] },
    beng: { wall: ['#c9b27a', '#b89a6a', '#a6845a'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#e6dcc8'] },
    kerala: { wall: ['#f4efe2', '#e9dcc0', '#d9c39a', '#c9844a'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#efd9cc'] },
    deccan: { wall: ['#c9b8a0', '#b8a68a', '#d9c8a8'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26', '#3a6aa8'], roof: ['#ffffff'] },
    tamil: { wall: ['#f4efe2', '#e9dcc0', '#e0b8a0', '#b8d0c8', '#d9c39a'], trim: ['#f6f4ee', '#7a2a24'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#efd9cc'] },
    hima: { wall: ['#efe8d8', '#d9d2c4'], trim: ['#3b2c20', '#5a3a26'], shut: ['#3b2c20'], door: ['#3b2c20', '#7a2a24'], roof: ['#ffffff', '#d9d2ca'] },
    tibet: { wall: ['#f6f4ee', '#f2f0e8', '#efe9de'], trim: ['#1f1c1a', '#2a2622'], shut: ['#1f1c1a'], door: ['#7a2a24', '#3b2c20'], roof: ['#ffffff'] },
    china: { wall: ['#8f9398', '#9a9ea2', '#a9adb2', '#e6e2da'], trim: ['#7a2a24', '#8a3a2a', '#3b2c20'], shut: ['#7a2a24'], door: ['#8a2a20', '#7a2a24', '#3b2c20'], roof: ['#ffffff', '#d6d8da'] },
    huizhou: { wall: ['#f4f4f0', '#efefeb', '#e9e9e4'], trim: ['#2a2a2a', '#3b2c20'], shut: ['#3b2c20'], door: ['#3b2c20'], roof: ['#ffffff', '#d6d8da'] },
    tulou: { wall: ['#c9a878', '#b8956a', '#d7b98a'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff'] },
    miao: { wall: ['#8a6a4a', '#7a5a3a'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#e6dcc8'] },
    shophouse: { wall: ['#f0dfb8', '#e9d0b0', '#d9e0d0', '#f2d0c0', '#e6d6c8', '#b8d0c8', '#efe6d2', '#e8c0a0'], trim: ['#f6f2e8'], shut: ['#3a8a6a', '#3a6aa8', '#7a5a3a'], door: ['#5a3a26', '#3a6a5a'], roof: ['#ffffff', '#efd9cc'] },
    japan: { wall: ['#e6e0d2', '#efe9dc', '#d9d0bc'], trim: ['#3b2c20', '#2a2622'], shut: ['#3b2c20'], door: ['#3b2c20'], roof: ['#ffffff', '#e6dcc8', '#d6d8da'] },
    korea: { wall: ['#efe9dc', '#e6e0d2'], trim: ['#5a3a26', '#3b2c20'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#e6dcc8', '#d6d8da'] },
    ger: { wall: ['#efe9de', '#f2ede2', '#e6e0d4'], trim: ['#c9844a', '#7a2a24'], shut: ['#7a2a24'], door: ['#c9844a', '#7a2a24', '#3a6aa8'], roof: ['#ffffff'] },
    stilt: { wall: ['#8a6a4a', '#9a7a5a', '#7a5a3a'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#e6dcc8', '#d9ccb4'] },
    thai: { wall: ['#7a5a3a', '#8a6a4a', '#6a4a30'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#e6dcc8'] },
    malay: { wall: ['#7a5a3a', '#8a6a4a', '#9a7a5a', '#e8d8b0'], trim: ['#5a3a26', '#f4efe2'], shut: ['#5a3a26', '#3a6a5a'], door: ['#5a3a26'], roof: ['#ffffff', '#e6dcc8'] },
    minang: { wall: ['#6a4a30', '#5a3a26'], trim: ['#c9844a', '#7a2a24'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#c9c4c0'] },
    toraja: { wall: ['#6a3a26', '#5a3a26'], trim: ['#c9844a', '#efe6d2', '#1f1c1a'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#e6dcc8'] },
    java: { wall: ['#8a6a4a', '#efe6d2'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#efd9cc'] },
    viet: { wall: ['#efe0c0', '#e9d0a0', '#d9c39a'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#efd9cc', '#e6dcc8'] },
    viettown: { wall: ['#f0d898', '#e9d0a0', '#d9e0d0', '#efe6d2', '#b8d0c8'], trim: ['#f6f2e8'], shut: ['#3a8a6a', '#5a6a3a'], door: ['#5a3a26'], roof: ['#ffffff', '#efd9cc'] },
    philcolonial: { wall: ['#8a6a4a', '#efe6d2', '#e9dcc0'], trim: ['#5a3a26', '#f6f4ee'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#efd9cc', '#c9c4c0'] },
    maori: { wall: ['#6a3a26', '#7a4a30'], trim: ['#9a2a20', '#1f1c1a', '#efe6d2'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#e6dcc8'] },
    maya: { wall: ['#efe9de', '#e6dcc8', '#d9c8a8'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#e6dcc8'] },
    mesoadobe: { wall: ['#c9a878', '#d7b98a', '#bf9a6a', '#e6d4b0'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff'] },
    andes: { wall: ['#9a9184', '#a89f90', '#8c8376', '#b0a490'], trim: ['#5a3a26'], shut: ['#5a3a26', '#3a6aa8'], door: ['#5a3a26', '#3a6aa8'], roof: ['#ffffff', '#e6dcc8'] },
    pueblo: { wall: ['#c48f5f', '#d19d6d', '#b58153'], trim: ['#5a3a26'], shut: ['#5a3a26'], door: ['#5a3a26', '#3a8aa8'], roof: ['#ffffff'] },
    nwc: { wall: ['#8a6a4a', '#7a5a3a'], trim: ['#9a2a20', '#1f1c1a', '#efe6d2'], shut: ['#5a3a26'], door: ['#5a3a26'], roof: ['#ffffff', '#c9c4c0'] },
    bark: { wall: ['#8a7a64', '#7a6a54'], trim: ['#5a4632'], shut: ['#5a4632'], door: ['#3b2c20'], roof: ['#ffffff', '#c9c4c0'] },
    igloo: { wall: ['#f4f8fc'], trim: ['#e6eef4'], shut: ['#e6eef4'], door: ['#5a6a7a'], roof: ['#ffffff'] },
    colonial: { wall: ['#e9c060', '#d9864a', '#7ab0b0', '#e8a0a0', '#f2e6c6', '#a0c0a0', '#c97a5a', '#efd8a8', '#6a9ac0', '#f6f4ee'], trim: ['#f6f4ee', '#efe6d2'], shut: ['#5a3a26', '#3a6a5a'], door: ['#5a3a26', '#3a3a3a'], roof: ['#ffffff', '#efd9cc'] },
    portuguese: { wall: ['#f6f4ee', '#f2ecdd', '#efd8a8', '#a0c0d0', '#e8b0a0', '#f0e2c0'], trim: ['#3a6aa8', '#e9c060', '#3a8a6a', '#f6f4ee', '#7a2a24'], shut: ['#3a6aa8', '#3a8a6a', '#5a3a26'], door: ['#3a6aa8', '#5a3a26'], roof: ['#ffffff', '#efd9cc'] },
    newengland: { wall: ['#f4f1ea', '#e9e4d8', '#c9c2b2', '#8a2a20', '#d9c9a0', '#9aa8b0'], trim: ['#f4f1ea'], shut: ['#1f2a24', '#2f3a32', '#3a3a3c', '#5a2a24'], door: ['#1f2a24', '#5a2a24', '#2f3a52'], roof: ['#ffffff', '#c9c4c0', '#9a958e'] },
    usvic: { wall: ['#e8d8b0', '#c9d0b8', '#b8c4cc', '#e0c0a8', '#efe6d2', '#9ab0a0', '#d9a8a0', '#c9b8d0'], trim: ['#f4f1ea', '#7a2a24', '#2f4a3a'], shut: ['#2f4a3a', '#5a2a24'], door: ['#5a2a24', '#2f4a3a', '#3b2c20'], roof: ['#ffffff', '#c9c4c0', '#9a958e'] },
    usfarm: { wall: ['#f4f1ea', '#e9e4d8', '#efe6d2', '#d9d2c4'], trim: ['#f4f1ea'], shut: ['#2f3a32', '#3a3a3c'], door: ['#3b2c20', '#5a2a24'], roof: ['#ffffff', '#c9c4c0', '#e6dcc8'] },
    craftsman: { wall: ['#8a7a5a', '#6a7a6a', '#b8a888', '#9a6a4a', '#7a8a7a', '#c9b89a'], trim: ['#f4f1ea', '#3b2c20'], shut: ['#3b2c20'], door: ['#5a3a26'], roof: ['#ffffff', '#c9c4c0', '#9a958e'] },
    ranch: { wall: ['#e9e4d8', '#d9d2c4', '#c9c2b2', '#b8b4a8', '#efe6d2'], trim: ['#f4f1ea', '#5a5a5c'], shut: ['#3a3a3c', '#5a4030'], door: ['#5a4030', '#3a3a3c'], roof: ['#ffffff', '#c9c4c0', '#9a958e', '#7a7570'] },
    western: { wall: ['#c9b89a', '#b8a888', '#e9e4d8', '#9a8a6a', '#d9c9a0'], trim: ['#f4f1ea', '#5a4632'], shut: ['#5a4632'], door: ['#5a4632'], roof: ['#ffffff', '#c9c4c0'] },
    carib: { wall: ['#f0d898', '#7ab0b0', '#e8a0a0', '#a0c0a0', '#f2e6c6', '#6a9ac0', '#e9c060', '#f6f4ee', '#c9a0c0'], trim: ['#f6f4ee'], shut: ['#3a6a5a', '#3a6aa8', '#7a2a24', '#f6f4ee'], door: ['#3a6a5a', '#5a3a26'], roof: ['#ffffff', '#c9c4c0', '#b0503a'] },
    creole: { wall: ['#f0d898', '#e8b0a0', '#a0c0a0', '#f2e6c6', '#e9c060', '#d9a8a0'], trim: ['#f6f4ee'], shut: ['#2f4a3a', '#3a6a5a'], door: ['#2f4a3a', '#5a3a26'], roof: ['#ffffff', '#c9c4c0'] },
    queensland: { wall: ['#f4f1ea', '#e9e4d8', '#d9e0d0', '#efe6d2'], trim: ['#f4f1ea', '#2f4a3a', '#7a2a24'], shut: ['#2f4a3a'], door: ['#2f4a3a', '#5a3a26'], roof: ['#ffffff', '#c9c4c0', '#9a4a3a', '#5a7a5a'] },
    federation: { wall: ['#efe8d8'], trim: ['#f4f1ea', '#2f4a3a', '#7a2a24'], shut: ['#2f4a3a'], door: ['#2f4a3a', '#5a2a24'], roof: ['#ffffff', '#e2c8b8', '#c9c4c0'] },
    concrete: { wall: ['#e9e4d8', '#f2ecdd', '#e8c9b0', '#d9e0d0', '#f0d898', '#c9d6e0', '#e8b0a0', '#efe6d2', '#d9c9a0', '#a0c0b0'], trim: ['#f4f1ea', '#c9c2b2'], shut: ['#5a5a5c', '#3a6aa8'], door: ['#5a4030', '#3a3a3c', '#7a8a8a'], roof: ['#ffffff'] },
    medmodern: { wall: ['#efe6d2', '#e9dcc0', '#e6d0b0', '#f2ecdd', '#d9d2c4', '#e8c9b0'], trim: ['#f4f1ea'], shut: ['#6a5a4a', '#5a6a5a', '#d9d2c4'], door: ['#5a4030'], roof: ['#ffffff', '#efd9cc'] },
    chinamodern: { wall: ['#f4f4f2', '#efefeb', '#e9e6de', '#e8d8c0'], trim: ['#4a6a8a', '#3a5a7a'], shut: ['#4a6a8a'], door: ['#7a2a24', '#5a4030'], roof: ['#ffffff', '#c9c4c0'] },
    japanmodern: { wall: ['#efe9de', '#e6e2da', '#d9d6cc', '#c9ccd0', '#b8a888'], trim: ['#3a3a3c', '#f4f4f2'], shut: ['#3a3a3c'], door: ['#5a4030', '#3a3a3c'], roof: ['#ffffff', '#c9c4c0', '#9a958e'] },
    future: { wall: ['#f2f3ef', '#e9ece6', '#dfe6dd', '#cfd9d2'], trim: ['#f4f4f2', '#5a6a6a'], shut: ['#5a6a6a'], door: ['#5a6a6a'], roof: ['#ffffff'] },
  };

  // ---------- the place: what the land and the sky ask of a house ----------
  // The simulation's cell (sim.landClass: land.js's kinds; sim.elev; sim.flags 2 river, 4 coast) and the woods left about it
  // (sim.woods): snow (steeper pitch, deeper eaves, more chimneys, smaller windows), rain (deep eaves, galleries, stilts where
  // it floods), heat and drought (thick walls, small windows, flat roofs, courts), the hills (stone), the wood that is left
  // (where the woods are cleared builders turn to brick and stone; where they stand, to timber).
  const SNOWY = { 2: 1, 3: 1, 14: 0.8, 13: 0.7, 1: 1 }, WET = { 11: 1, 15: 1, 9: 0.7, 10: 0.4 }, HOT = { 4: 1, 5: 0.6, 8: 0.4, 10: 0.5, 9: 0.4, 11: 0.5, 15: 0.5 }, DRY = { 4: 1, 5: 0.7 };
  const siteCache = new Map();
  function site(sim, i, c) {
    const W = sim.W || 720, H = sim.H || 360; const y = (i / W) | 0, x = i - y * W;
    const lon = (x + 0.5) / W * 360 - 180, lat = 90 - (y + 0.5) / H * 180;
    const woods = sim.woods && sim.woods.cleared ? 1 - sim.woods.cleared(i) : -1;
    const key = i + ':' + (woods < 0 ? -1 : Math.round(woods * 4));
    const hit = siteCache.get(i); if (hit && hit.key === key) return hit;
    const h = sim.elev ? sim.elev[i] : 0, k = sim.landClass ? sim.landClass(i) : -1, fl = sim.flags ? sim.flags[i] : 0;
    let region = regionOf(lon, lat, h); let tl = T[region]; let sub = 0;
    for (let q = 0; q < SUB.length; q++) { const s = SUB[q]; if (s[0] === region && s[1](lon, lat, h)) { tl = s[2]; sub = q + 1; break; } }
    const mount = h > 95 ? 1 : h > 62 ? 0.5 : 0;
    const s = { key, i, lon, lat, h, k, region, sub, tl, fam: FAM[region] || 'euro', coast: !!(fl & 4), river: !!(fl & 2), mount,
      snow: Math.max(SNOWY[k] || 0, Math.abs(lat) > 55 ? 0.8 : Math.abs(lat) > 45 ? 0.4 : 0, h > 120 ? 0.8 : h > 90 ? 0.5 : 0), wet: WET[k] || (Math.abs(lat) < 15 ? 0.5 : 0), hot: HOT[k] || (Math.abs(lat) < 25 ? 0.6 : 0), dry: DRY[k] || 0,
      wood: woods };
    siteCache.set(i, s); if (siteCache.size > 4000) siteCache.delete(siteCache.keys().next().value);
    return s;
  }
  // the style a house of this place takes in an age, a share of the way into it, built by a people of this family
  function styleAt(st, era, f, fam, r) {
    const tl = st.tl || T[st.region] || HOME_STYLE.euro; let e = null;
    for (const x of tl) { if (x[0] < era || (x[0] === era && x[1] <= f + 1e-6)) e = x; else break; }
    if (!e) e = tl[0];
    let v = e[2];
    if (typeof v === 'object') { if (v[fam] || v['*'] || v.euro) { const home = st.fam === fam; v = v[fam] || (home ? v['*'] : null) || v['*'] || v.euro; } }
    return typeof v === 'string' ? v : pickT(v, r);
  }

  // ---------- types: the houses a town of a style is built from ----------
  // A genome: everything houses.js needs to build one house (dimensions in metres). Drawn from the style's ranges by a seed,
  // after the place has had its say; the context (urban, rural, rich) merges its own ranges over the style's first.
  const MODS = (st, g, r) => {
    // snow: steeper pitched roofs (never a flat roof's), deeper eaves, a chimney more, smaller windows
    if (st.snow > 0.3 && g.roof !== 'flat' && g.roof !== 'dome' && g.roof !== 'vault') { g.pitch = Math.min(62, g.pitch + 6 * st.snow); g.over += 0.15 * st.snow; }
    if (st.snow > 0.6) { g.ww *= 0.9; g.wh *= 0.92; if (g.chim.n === 0 && g.roof !== 'flat' && r() < 0.6) g.chim.n = 1; }
    // rain: deeper eaves; heat and drought: smaller openings, light walls
    if (st.wet > 0.6 && g.roof !== 'flat') g.over += 0.25 * st.wet;
    if (st.hot > 0.6 && st.dry > 0.5) { g.ww *= 0.85; g.wh *= 0.85; }
    // the hills: stone walls where timber or clay was the style's
    if (st.mount >= 0.5 && g.ctx !== 'urban' && (g.wall === 'daub' || g.wall === 'cob' || g.wall === 'mud') && r() < 0.35 + 0.3 * st.mount) g.wall = 'rubble';
    // the wood left: where the woods are gone timber gives way to brick and stone; where they stand it wins over clay
    if (st.wood >= 0 && st.wood < 0.25 && (g.wall === 'logs' || g.wall === 'boards' || g.wall === 'clap') && r() < 0.6) g.wall = st.mount ? 'rubble' : 'brick';
    if (st.wood >= 0 && st.wood < 0.3 && g.frame && r() < 0.45) { g.frame = 0; if (g.wall === 'daub') g.wall = r() < 0.5 ? 'brick' : 'rubble'; }
    if (st.wood > 0.75 && (g.wall === 'daub' || g.wall === 'cob') && st.snow > 0.5 && r() < 0.3) g.wall = 'logs';
    return g;
  };
  const PITCHED = { thatch: 1, reed: 1, tile: 1, slate: 1, slab: 1, greytile: 1, bluetile: 1, shingle: 1, plain: 1, glaze: 1, yglaze: 1, palm: 1, roman: 1, blackpan: 1, turf: 0, tin: 0, copper: 0, zinc: 0 };
  const typeCache = new Map();
  // n types of a style in a context, for a place (the key says which: the same town asks again and again)
  function types(styleKey, ctx, st, n) {
    const key = styleKey + '|' + ctx + '|' + (st ? st.region + st.sub + ':' + st.mount + ':' + Math.round(st.snow * 4) + ':' + Math.round(st.wet * 4) + ':' + (st.wood < 0 ? 'x' : Math.round(st.wood * 4)) : '') + '|' + n;
    let out = typeCache.get(key); if (out) return out;
    const base = S[styleKey] || S.house; const sty = Object.assign({}, base, base[ctx] || {});
    out = []; const R0 = strHash(key);
    for (let t = 0; t < n; t++) {
      const r = rng(R0 + t * 7919);
      // stratified: the types spread over the ranges (the first small, the last large), each gene drawn on its own
      const q = (t + r()) / n;
      const g = { style: styleKey, ctx, plan: pickT(sty.plan, r()), w: inR(sty.w, clamp(q * 0.7 + r() * 0.3, 0, 1)), d: inR(sty.d, r()),
        fl: Math.round(inR([sty.fl[0] - 0.49, sty.fl[1] + 0.49], clamp(q * 0.6 + r() * 0.4, 0, 1))), fh: inR(sty.fh, r()), pb: inR(sty.pb, r()),
        stilt: r() < (sty.pStilt || 0) ? inR(sty.stilt, r()) : 0, loft: r() < sty.loft,
        roof: pickT(sty.roof, r()), pitch: inR(sty.pitch, r()), over: inR(sty.over, r()), gover: inR(sty.gover, r()), ridge: r() < sty.ridge ? 'x' : 'z', par: inR(sty.par, r()), cren: r() < sty.cren,
        wall: pickT(sty.wall, r()), wall2: null, w2on: sty.w2on, roofm: pickT(sty.roofm, r()), chimm: pickT(sty.chimm, r()), frame: +pickT(sty.frame, r()),
        ww: inR(sty.ww, r()), wh: inR(sty.wh, r()), sill: inR(sty.sill, r()), bay: inR(sty.bay, r()), arch: r() < sty.arch, shut: r() < sty.shut, mull: r() < sty.mull, grille: r() < sty.grille, wfr: sty.wfr,
        dw: inR(sty.dw, r()), dh: inR(sty.dh, r()), dpos: pickT(sty.dpos, r()), darch: r() < sty.darch, shop: r() < sty.shop,
        chim: { n: +pickT(sty.chim, r()), at: pickT(sty.chat, r()) }, dorm: +pickT(sty.dorm, r()), balc: r() < sty.balc ? { k: pickT(sty.balk, r()), full: r() < sty.bfull } : null,
        gal: r() < sty.gal ? { d: inR(sty.gald, r()), side: pickT(sty.gals, r()), up: r() < (sty.galf || 0) } : null, arc: r() < sty.arc, jet: r() < sty.jet ? inR(sty.jetd, r()) : 0,
        stepg: r() < sty.stepg, toron: r() < sty.toron, wind: r() < sty.wind, tower: r() < sty.tower, oriel: r() < sty.oriel, stair: r() < sty.stair, annex: r() < sty.annex,
        corn: r() < sty.corn, quoin: r() < sty.quoin, strc: r() < sty.strc, batter: inR(sty.batter, r()), domes: +pickT(sty.domes, r()), carv: r() < sty.carv, lattice: r() < sty.lattice,
        pal: sty.pal, rank: ctx === 'rich' ? 2 : ctx === 'urban' ? 1 : 0 };
      if (sty.wall2 && r() < (sty.pW2 || 0)) g.wall2 = pickT(sty.wall2, r());
      g.fam = st ? st.fam : '';
      if (st) MODS(st, g, r);
      if (g.frame && g.wall !== 'daub' && g.wall !== 'plaster' && g.wall !== 'cob') g.frame = 0;      // (a timber frame is filled with daub or plaster, never brick or stone laid over)
      // what goes together: a flat roof has no chimney stack on a gable; a round house no shop; a tall narrow house no annex
      if (g.plan === 'round') { g.roof = g.roof === 'dome' ? 'dome' : 'cone'; g.w = g.d = Math.max(g.w, g.d) * 0.85 + Math.min(g.w, g.d) * 0.15; g.shop = false; g.jet = 0; g.oriel = false; g.balc = null; g.stepg = false; g.annex = false; g.chim.n = 0; }
      if (g.roof === 'flat' || g.roof === 'dome' || g.roof === 'vault') { g.chim.at = 'side'; g.dorm = 0; g.stepg = false;
        if (PITCHED[g.roofm]) g.roofm = sty.roofm && sty.roofm.earth ? 'earth' : (styleKey === 'col_spanish' || styleKey === 'col_portuguese' || st && st.dry > 0.4) ? 'earth' : 'flat'; }      // (tiles and thatch lie on slopes: a flat roof is of earth, or later of pitch and gravel)
      if (g.roof === 'mansard') g.dorm = Math.max(g.dorm, 2);
      if (g.fl < 2) { g.jet = 0; g.oriel = g.oriel && g.ctx === 'rich'; if (g.balc && !g.stilt) g.balc = null; }
      if (g.stepg && g.ridge === 'x' && g.ctx !== 'urban') g.stepg = r() < 0.3;
      if (g.plan === 'court' && (g.w < 9 || g.d < 9)) g.plan = 'rect';
      g.w = Math.round(g.w * 10) / 10; g.d = Math.round(g.d * 10) / 10;
      // which way its wings, its lean-to and its tower stand, and which of two middle bays has the door (part of the type, so
      // that every level of detail of it is the same house: houses.js asks no dice of its own)
      g.wingSide = r() < 0.5 ? -1 : 1; g.annexSide = r() < 0.5 ? -1 : 1; g.towerSide = r() < 0.5 ? -1 : 1; g.doorOff = r() < 0.5 ? 0 : 1;
      g.id = styleKey + '.' + ctx + '.' + (st ? st.region : '') + '.' + t + '.' + (R0 % 99991);
      out.push(g);
    }
    typeCache.set(key, out); if (typeCache.size > 600) typeCache.delete(typeCache.keys().next().value);
    return out;
  }
  // a type's colours for one house of it: [wall, trim, shutters, door, roof tint] as 24-bit numbers
  function colours(g, seed) {
    const p = P[g.pal] || P.neutral; const r = rng(seed >>> 0 || 1); const pick = (a) => a[Math.floor(r() * a.length) % a.length];
    const shade = (hex, k) => { const v = hexN(hex); const f = (c) => Math.max(0, Math.min(255, Math.round(c * k))); return (f(v >> 16 & 255) << 16) | (f(v >> 8 & 255) << 8) | f(v & 255); };
    const M = WALLM[g.wall] || WALLM.plaster, RM = ROOFM[g.roofm] || ROOFM.tile;
    let wall = M.t ? M.t : pick(p.wall);
    if (g.wall === 'logs' && !/falu|rus|balt/.test(g.pal)) wall = pick(['#8a6a4a', '#7a5a3a', '#9a7a5a', '#6a4a30', '#a08060']);
    if (g.wall === 'lime' || g.wall === 'coral') wall = pick(['#f6f4ee', '#f2f0e8', '#efe9de', '#f4efe4']);
    const roof = RM.t ? RM.t : pick(p.roof);
    return [shade(wall, 0.92 + r() * 0.16), shade(pick(p.trim), 0.95 + r() * 0.1), shade(pick(p.shut), 0.9 + r() * 0.2), shade(pick(p.door), 0.9 + r() * 0.2), shade(roof, 0.94 + r() * 0.12)];
  }
  // how many types a town's houses are drawn from (more in a bigger town: the variety of a city is greater)
  const nTypes = (lvl) => [10, 12, 16, 20, 24][clamp(lvl | 0, 0, 4)];
  // The ground a type stands on, in its own frame (metres: x along its front, z toward the street, the front wall at z = d/2):
  // its wings, its lean-to, its gallery, what stands out from its front (an upper floor jettied out, a stair, an oriel), its
  // eaves. As houses.js builds them: the planner fits a type to a plot by it, and keeps neighbours apart.
  function foot(g) {
    if (g._foot) return g._foot;
    const W = g.w, D = g.d; const flatR = g.roof === 'flat' || g.roof === 'dome' || g.roof === 'vault';
    const ov = flatR ? 0.05 : Math.min(1.2, g.over || 0) * 0.6;
    let x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2, front = 0;
    if (g.plan === 'round') { const r = W / 2 + ov; return (g._foot = { x0: -r, x1: r, z0: -r, z1: r, front: 0 }); }
    const d2 = Math.max(3, Math.min(D * 0.9, 9));
    if (g.plan === 'L' || g.plan === 'T' || g.plan === 'U') z0 -= d2;
    if (g.annex && g.plan !== 'court') { const aw = Math.min(3.6, Math.max(2.2, W * 0.32)) + 0.3; if (g.annexSide > 0) x1 += aw; else x0 -= aw; }
    if (g.gal) { const gd = g.gal.d + 0.25; if (g.gal.side === 'wrap') { front = gd; x0 -= gd; x1 += gd; } else if (g.gal.side === 'side') x1 += gd; else front = gd; }
    if (g.chim && g.chim.n && g.chim.at === 'side' && g.plan !== 'round') { x0 -= 0.6; if (g.chim.n > 1) x1 += 0.6; }
    // (what only juts from the upper floors may hang over the street; what stands on the ground may not)
    if (g.stair && g.fl >= 2 && !g.gal) front = Math.max(front, Math.max(5, Math.round(g.fh / 0.2)) * 0.27);
    const over = Math.max(g.jet && g.fl >= 2 ? g.jet : 0, g.balc && g.fl >= 2 ? (g.balc.k === 'iron' ? 0.7 : 1.0) : 0, g.oriel ? 0.75 : 0);
    return (g._foot = { x0: x0 - ov, x1: x1 + ov, z0: z0 - ov, z1: z1 + front + ov, front, over });
  }
  // how high it stands: the ridge, a tower, domes, the parapet
  function heightOf(g) {
    if (g._h !== undefined) return g._h;
    const base = g.stilt > 0 ? g.stilt + 0.25 : (g.pb || 0); const top = base + Math.max(1, g.fl | 0) * g.fh;
    const tp = Math.tan(clamp(g.pitch, 5, 70) * Math.PI / 180); let h;
    if (g.plan === 'round') h = top + (g.roof === 'dome' ? g.w * 0.45 : g.w / 2 * tp);
    else if (g.roof === 'flat' || g.roof === 'vault' || g.roof === 'dome') h = top + (g.par || 0) + (g.roof === 'dome' || g.domes ? Math.min(g.w, g.d) * 0.3 + 0.6 : g.roof === 'vault' ? g.d * 0.4 : 0);
    else if (g.roof === 'mansard') h = top + Math.min(g.fh * 0.95, 2.8) + 1.2;
    else { const span = g.roof === 'hip' || g.roof === 'pyr' ? Math.min(g.w, g.d) : g.ridge === 'x' ? g.d : g.w; h = top + span / 2 * tp * (g.roof === 'gambrel' ? 1.15 : 1); }
    if (g.tower) h = Math.max(h, top + 2 * g.fh + 1 + 3.5);
    if (g.wind) h = Math.max(h, top + 3.8);
    return (g._h = h);
  }

  window.VERN = { REGIONS, T, S, P, SUB, FAM, CULFAM, WALLM, ROOFM, regionOf, site, styleAt, types, colours, nTypes, foot, heightOf, strHash, rng, h32,
    clearCache: () => { siteCache.clear(); typeCache.clear(); } };
})();
