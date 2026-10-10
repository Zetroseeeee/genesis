// Holocene economy (classic script; exposes window.ECON). Pure arithmetic, no DOM: the simulation owns one market
// (ECON.create) and steps it once a year; the page reads it.
//
// A year, in the order it runs:
//   1. The land yields its raw goods where people who know how to work them live on it: more when the price is high,
//      more from a mine, with good and bad harvests for what grows.
//   2. Every realm needs things, by category (food, salt, drink, clothing, shelter, wares, luxuries, power; arms,
//      building materials and ships for the state). Within a category people take whatever is cheap just now
//      compared with its usual price.
//   3. Workshops turn goods into other goods (RECIPES). Each line of work grows while it pays and shrinks while it
//      loses, inside what the towns' hands can do; wages rise as the hands run out.
//   4. A price is the usual price times (what there is / what is wanted)^-0.75, between a fifth and eight times.
//   5. Merchants carry goods between realms that touch, or that reach each other by sea, from where they are cheap
//      to where they are dear, until the gap is no more than the cost of the road (bulk goods travel badly overland)
//      and the customs at the border. Nothing crosses a war.
//   6. People take what they need of what is there; the rest is kept, less what rots.
// A quantity is in lots and a price in coin per lot: the same coin as the treasury.
(function () {
  'use strict';
  const NG = 64;                                   // goods are numbered 1..63
  const ELA = 0.75, INV = 1 / ELA, XMIN = 0.2, XMAX = 8, CMAX = Math.pow(XMIN, -INV), CMIN = Math.pow(XMAX, -INV);      // (a power of three quarters is two square roots)
  const AICUST = 0.03;                             // the customs every realm but the player's takes at its border
  const W0 = 1.2;                                  // coin for a unit of work when half the hands are busy
  const FLOWK = 0.6;                               // how much of a price gap one year's trade closes
  const LAND = 0.05, SEA = 0.003;                  // freight per cell of distance for a good of bulk 1: by road, by ship
  const LANDK = [1, 1, 0.9, 0.8, 0.8, 0.7, 0.3, 0.15, 0.1], SEAK = [1, 1, 0.9, 0.8, 0.7, 0.5, 0.3, 0.2, 0.15];   // roads, then rails; sail, then steam
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // ---------- goods ----------
  // kind: food / material / luxury / strategic (the page colours them by it; realms covet the strategic ones).
  // era: the age that begins to want it.  base: its usual price.  bulk: how badly it travels.  rot: the share of a
  // store lost in a year.  abund: how much of it the Earth gives against what the world would use (1 = just enough).
  const raw = (key, name, tk, kind, era, base, bulk, rot, abund, o) => Object.assign({ key, name, tk, kind, era, base, bulk, rot, abund, raw: true }, o);
  const made = (key, name, tk, kind, era, bulk, rot) => ({ key, name, tk, kind, era, base: 0, bulk, rot, raw: false });
  const GOODS = [null,
    raw('grain', 'Grain', 'GRN', 'food', 0, 1.0, 1.5, 0.30, 1.15, { crop: 1 }),
    raw('fish', 'Fish', 'FSH', 'food', 0, 1.6, 1.2, 0.60, 1.0, { crop: 0.5 }),
    raw('cattle', 'Cattle', 'CTL', 'food', 0, 3.0, 0.8, 0.20, 1.0),
    raw('timber', 'Timber', 'TMB', 'material', 0, 0.8, 2.0, 0.05, 1.1),
    raw('stone', 'Stone', 'STN', 'material', 0, 0.6, 2.5, 0, 1.2, { mine: 1 }),
    raw('salt', 'Salt', 'SLT', 'material', 0, 2.5, 1.0, 0.02, 1.0, { mine: 1 }),
    raw('copper', 'Copper', 'CPR', 'strategic', 1, 12, 0.8, 0, 1.0, { mine: 1 }),
    raw('tin', 'Tin', 'TIN', 'strategic', 1, 40, 0.6, 0, 0.8, { mine: 1 }),
    raw('iron', 'Iron', 'IRN', 'strategic', 2, 6, 1.0, 0.01, 1.2, { mine: 1 }),
    raw('horses', 'Horses', 'HRS', 'strategic', 1, 25, 0.5, 0.12, 0.9),
    raw('gold', 'Gold', 'GLD', 'luxury', 1, 500, 0.05, 0, 0.8, { mine: 1 }),
    raw('gems', 'Gems', 'GEM', 'luxury', 1, 800, 0.03, 0, 0.7, { mine: 1 }),
    raw('wine', 'Wine', 'WIN', 'luxury', 2, 6, 1.0, 0.10, 1.0, { crop: 1 }),
    raw('spices', 'Spices', 'SPC', 'luxury', 2, 60, 0.1, 0.10, 0.8, { crop: 1 }),
    raw('silk', 'Silk', 'SLK', 'luxury', 3, 90, 0.1, 0.03, 0.7),
    raw('furs', 'Furs', 'FUR', 'luxury', 0, 20, 0.3, 0.06, 0.9),
    raw('ivory', 'Ivory', 'IVR', 'luxury', 1, 120, 0.15, 0, 0.7),
    raw('cotton', 'Cotton', 'CTN', 'material', 3, 4, 0.8, 0.05, 1.0, { crop: 1 }),
    raw('coal', 'Coal', 'COL', 'strategic', 6, 1.2, 2.0, 0, 1.1, { mine: 1 }),
    raw('oil', 'Oil', 'OIL', 'strategic', 7, 3, 1.2, 0, 1.0, { mine: 1 }),
    raw('rice', 'Rice', 'RCE', 'food', 0, 1.1, 1.5, 0.25, 1.15, { crop: 1 }),
    raw('maize', 'Maize', 'MZE', 'food', 0, 0.9, 1.5, 0.30, 1.15, { crop: 1 }),
    raw('wool', 'Wool', 'WOL', 'material', 0, 3.5, 0.8, 0.05, 1.0),
    raw('olives', 'Olives', 'OLV', 'food', 1, 4, 1.0, 0.12, 1.0, { crop: 1 }),
    raw('sugar', 'Sugar', 'SGR', 'luxury', 3, 8, 0.9, 0.05, 0.9, { crop: 1 }),
    raw('tea', 'Tea', 'TEA', 'luxury', 3, 14, 0.3, 0.08, 0.9, { crop: 1 }),
    raw('coffee', 'Coffee', 'COF', 'luxury', 4, 12, 0.4, 0.08, 0.9, { crop: 1 }),
    raw('cocoa', 'Cocoa', 'CCA', 'luxury', 1, 16, 0.4, 0.08, 0.9, { crop: 1 }),
    raw('tobacco', 'Tobacco', 'TBC', 'luxury', 1, 10, 0.4, 0.08, 0.9, { crop: 1 }),
    raw('silver', 'Silver', 'SLV', 'luxury', 1, 60, 0.1, 0, 0.8, { mine: 1 }),
    raw('amber', 'Amber', 'AMB', 'luxury', 0, 40, 0.1, 0, 0.7),
    raw('obsidian', 'Obsidian', 'OBS', 'material', 0, 5, 0.6, 0, 0.9, { mine: 1 }),
    raw('incense', 'Incense', 'INC', 'luxury', 1, 50, 0.1, 0.05, 0.7),
    raw('dyes', 'Dyes', 'DYE', 'luxury', 1, 45, 0.1, 0.05, 0.8),
    raw('jade', 'Jade', 'JDE', 'luxury', 0, 150, 0.1, 0, 0.7, { mine: 1 }),
    raw('saltpetre', 'Saltpetre', 'NTR', 'strategic', 4, 15, 0.8, 0, 0.9, { mine: 1 }),
    raw('rubber', 'Rubber', 'RBR', 'strategic', 6, 9, 0.8, 0.03, 0.9),
    raw('gas', 'Natural gas', 'GAS', 'strategic', 7, 2, 2.2, 0, 1.0, { mine: 1 }),
    raw('uranium', 'Uranium', 'URN', 'strategic', 7, 80, 0.2, 0, 0.9, { mine: 1 }),
    raw('bauxite', 'Bauxite', 'BXT', 'material', 7, 2, 2.0, 0, 1.0, { mine: 1 }),
    raw('rareearth', 'Rare earths', 'REE', 'strategic', 8, 70, 0.3, 0, 0.8, { mine: 1 }),
    raw('lithium', 'Lithium', 'LTH', 'strategic', 8, 30, 0.5, 0, 0.9, { mine: 1 }),
    made('pottery', 'Pottery', 'POT', 'material', 0, 1.2, 0.05),
    made('leather', 'Leather', 'LTR', 'material', 0, 0.6, 0.04),
    made('cloth', 'Cloth', 'CLO', 'material', 0, 0.5, 0.04),
    made('beer', 'Beer', 'BER', 'food', 0, 1.5, 0.35),
    made('bronze', 'Bronze', 'BRZ', 'strategic', 1, 0.7, 0),
    made('tools', 'Tools', 'TLS', 'material', 2, 0.7, 0.03),
    made('arms', 'Arms', 'ARM', 'strategic', 1, 0.6, 0.03),
    made('jewellery', 'Jewellery', 'JWL', 'luxury', 1, 0.03, 0),
    made('glass', 'Glass', 'GLS', 'material', 2, 0.9, 0.02),
    made('ships', 'Ships', 'SHP', 'strategic', 2, 0.3, 0.06),
    made('paper', 'Paper', 'PPR', 'material', 3, 0.5, 0.04),
    made('gunpowder', 'Gunpowder', 'PDR', 'strategic', 4, 0.7, 0.05),
    made('guns', 'Guns', 'GUN', 'strategic', 5, 0.5, 0.03),
    made('spirits', 'Spirits', 'SPR', 'luxury', 4, 0.7, 0.02),
    made('steel', 'Steel', 'STL', 'strategic', 6, 1.0, 0.01),
    made('machinery', 'Machinery', 'MCH', 'strategic', 6, 0.8, 0.04),
    made('fuel', 'Fuel', 'FUL', 'strategic', 7, 1.0, 0.02),
    made('plastics', 'Plastics', 'PLS', 'material', 7, 0.7, 0.01),
    made('aluminium', 'Aluminium', 'ALU', 'material', 7, 0.7, 0),
    made('vehicles', 'Vehicles', 'VHC', 'strategic', 7, 0.5, 0.07),
    made('electronics', 'Electronics', 'ELC', 'strategic', 8, 0.2, 0.10),
  ];
  const ID = {}; GOODS.forEach((g, k) => { if (g) { ID[g.key] = k; g.id = k; } });
  const NGOODS = GOODS.length - 1;

  // ---------- recipes: what the workshops make, out of what, with how much work ----------
  // Listed so that everything a recipe uses is made above it. sec: the kind of workshop (a town's buildings make
  // their kind of work cheaper).  cw: how common this way of making the thing is, for sizing the Earth's yields.
  const SECTORS = ['crafts', 'metal', 'textile', 'food', 'ship', 'heavy', 'chem', 'tech'];
  const rc = (key, name, out, era, sec, l, ins, cw, until) => ({ key, name, out: ID[out], era, sec: SECTORS.indexOf(sec), l, in: ins.map(([k, q]) => [ID[k], q]), cw: cw || 1, until: until === undefined ? 9 : until });
  const RECIPES = [
    rc('pottery', 'Potters', 'pottery', 0, 'crafts', 1.5, []),
    rc('leather', 'Tanners', 'leather', 0, 'crafts', 3.0, [['cattle', 0.5]]),
    rc('cloth', 'Wool weavers', 'cloth', 0, 'textile', 2.5, [['wool', 1.2]]),
    rc('cloth_cotton', 'Cotton weavers', 'cloth', 3, 'textile', 2.0, [['cotton', 1.2]]),
    rc('cloth_plain', 'Flax and bark cloth', 'cloth', 0, 'textile', 6.5, [], 0.25),
    rc('beer', 'Brewers', 'beer', 0, 'food', 0.6, [['grain', 1.5]]),
    rc('bronze', 'Bronze founders', 'bronze', 1, 'metal', 4.0, [['copper', 0.9], ['tin', 0.1]]),
    rc('steel', 'Steelworks', 'steel', 6, 'heavy', 0.6, [['iron', 1.1], ['coal', 1.5]]),
    rc('machinery', 'Engine works', 'machinery', 6, 'heavy', 7.5, [['steel', 2.5], ['coal', 2.0]]),
    rc('cloth_mill', 'Cotton mills', 'cloth', 6, 'heavy', 0.5, [['cotton', 1.15], ['coal', 0.3], ['machinery', 0.01]], 4),
    rc('tools', 'Blacksmiths', 'tools', 2, 'metal', 4.5, [['iron', 1.0], ['timber', 1.0]]),
    rc('tools_steel', 'Tool works', 'tools', 6, 'heavy', 1.5, [['steel', 0.8]], 3),
    rc('arms_bronze', 'Bronze armourers', 'arms', 1, 'metal', 4.0, [['bronze', 1.0]], 1, 2),
    rc('arms_copper', 'Copper armourers', 'arms', 1, 'metal', 8.0, [['copper', 2.0]], 0.25, 2),
    rc('arms_iron', 'Iron armourers', 'arms', 2, 'metal', 10, [['iron', 1.5], ['timber', 0.5]], 2, 6),
    rc('arms_steel', 'Arsenals', 'arms', 6, 'heavy', 4.0, [['steel', 1.2]], 4),
    rc('jewel_gold', 'Goldsmiths', 'jewellery', 1, 'crafts', 40, [['gold', 0.5]]),
    rc('jewel_silver', 'Silversmiths', 'jewellery', 1, 'crafts', 40, [['silver', 4.0]]),
    rc('jewel_gems', 'Gem cutters', 'jewellery', 1, 'crafts', 40, [['gems', 0.3]]),
    rc('glass', 'Glassmakers', 'glass', 2, 'crafts', 4.5, [['stone', 1.0], ['timber', 3.0]]),
    rc('glass_coal', 'Glassworks', 'glass', 6, 'heavy', 1.5, [['stone', 1.0], ['coal', 1.5]], 3),
    rc('paper', 'Papermakers', 'paper', 3, 'crafts', 4.5, [['timber', 1.5]]),
    rc('paper_mill', 'Paper mills', 'paper', 6, 'heavy', 1.0, [['timber', 2.0], ['coal', 0.5]], 3),
    rc('gunpowder', 'Powder mills', 'gunpowder', 4, 'chem', 6.0, [['saltpetre', 0.75], ['timber', 0.5]]),
    rc('guns', 'Gunsmiths', 'guns', 5, 'metal', 18, [['iron', 2.0], ['gunpowder', 1.0], ['timber', 0.5]]),
    rc('guns_steel', 'Gun factories', 'guns', 6, 'heavy', 6.0, [['steel', 1.5], ['gunpowder', 0.8]], 3),
    rc('spirits', 'Rum distillers', 'spirits', 4, 'food', 1.2, [['sugar', 0.8]]),
    rc('spirits_grain', 'Grain distillers', 'spirits', 4, 'food', 3.2, [['grain', 3.0], ['timber', 0.5]]),
    rc('spirits_wine', 'Brandy distillers', 'spirits', 4, 'food', 0.8, [['wine', 1.2]], 0.5),
    rc('fuel', 'Refineries', 'fuel', 7, 'chem', 0.8, [['oil', 1.2]]),
    rc('plastics', 'Plastics works', 'plastics', 7, 'chem', 0.8, [['oil', 1.8]]),
    rc('plastics_gas', 'Gas crackers', 'plastics', 7, 'chem', 0.8, [['gas', 2.2]], 0.7),
    rc('aluminium', 'Smelters', 'aluminium', 7, 'chem', 3.5, [['bauxite', 4.0], ['coal', 3.0]]),
    rc('aluminium_gas', 'Gas-fired smelters', 'aluminium', 7, 'chem', 3.5, [['bauxite', 4.0], ['gas', 2.0]], 0.5),
    rc('ships', 'Shipwrights', 'ships', 2, 'ship', 18, [['timber', 12], ['cloth', 1.5], ['tools', 0.5]]),
    rc('ships_steel', 'Shipyards', 'ships', 6, 'ship', 3.0, [['steel', 1.4], ['machinery', 0.1], ['coal', 1.0]], 3),
    rc('vehicles', 'Motor works', 'vehicles', 7, 'heavy', 22, [['steel', 3.0], ['rubber', 1.0], ['machinery', 0.8], ['aluminium', 0.5]]),
    rc('electronics', 'Electronics plants', 'electronics', 8, 'tech', 35, [['copper', 1.0], ['rareearth', 0.5], ['plastics', 2.0], ['lithium', 0.8], ['aluminium', 0.5]]),
  ];
  const NR = RECIPES.length;
  RECIPES.forEach((r, k) => { r.id = k; });
  // a made good's usual price: a tenth over what its first recipe costs at usual prices
  { const round = (v) => { const m = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.round(v / m) * m; };
    for (const r of RECIPES) { const g = GOODS[r.out]; if (g.base) continue; let c = r.l * W0; for (const [gi, q] of r.in) c += q * GOODS[gi].base; g.base = +round(c * 1.1).toPrecision(3); } }
  const MADE_ORDER = []; for (const r of RECIPES) if (!MADE_ORDER.includes(r.out)) MADE_ORDER.push(r.out);
  const MAKES = GOODS.map(() => []), USES = GOODS.map(() => []);      // good -> the recipes that make it / that use it
  for (const r of RECIPES) { MAKES[r.out].push(r.id); for (const [gi] of r.in) USES[gi].push(r.id); }

  // ---------- what people and states want ----------
  // b: coin a thousand people spend on it in a year at the dawn of history.  e: how that grows as they grow richer.
  // ls: its weight in how well people live.  A member: [good, weight, from era, to era].
  const CATS = [
    { key: 'food', name: 'Food', b: 0.30, e: 0.5, era: 0, ls: 0.35, of: [['grain', 1], ['rice', 1], ['maize', 1], ['fish', 0.35], ['cattle', 0.3], ['olives', 0.1]] },
    { key: 'salt', name: 'Salt', b: 0.012, e: 0.5, era: 0, ls: 0.03, of: [['salt', 1]] },
    { key: 'comfort', name: 'Drink and comforts', b: 0.035, e: 1.2, era: 0, ls: 0.12, of: [['beer', 1], ['wine', 0.8], ['olives', 0.5], ['sugar', 0.8], ['tea', 0.6], ['coffee', 0.6], ['cocoa', 0.3], ['tobacco', 0.5], ['spirits', 0.6]] },
    { key: 'cloth', name: 'Clothing', b: 0.06, e: 1.0, era: 0, ls: 0.15, of: [['cloth', 1], ['leather', 0.4], ['furs', 0.25]] },
    { key: 'shelter', name: 'Shelter and warmth', b: 0.05, e: 0.9, era: 0, ls: 0.12, of: [['timber', 1], ['stone', 0.5], ['coal', 0.6], ['gas', 0.5]] },
    { key: 'wares', name: 'Wares', b: 0.045, e: 1.3, era: 0, ls: 0.13, of: [['pottery', 1], ['obsidian', 0.4, 0, 2], ['bronze', 0.6, 1, 3], ['tools', 1], ['glass', 0.4], ['paper', 0.4], ['plastics', 0.5], ['machinery', 0.5], ['vehicles', 1.2], ['electronics', 1.5], ['fuel', 0.8]] },
    { key: 'luxury', name: 'Luxuries', b: 0.025, e: 1.3, era: 0, ls: 0.10, of: [['gold', 0.5], ['silver', 0.5], ['gems', 0.25], ['jewellery', 0.6], ['silk', 0.6], ['ivory', 0.3], ['amber', 0.25], ['jade', 0.25], ['incense', 0.4], ['dyes', 0.4], ['spices', 0.7], ['furs', 0.3]] },
    { key: 'energy', name: 'Power', b: 0.02, e: 1.5, era: 6, ls: 0.10, of: [['coal', 1], ['fuel', 1], ['gas', 0.8], ['uranium', 0.3]] },
    { key: 'arms', name: 'Arms', b: 0.03, e: 1.0, era: 1, state: 1, of: [['arms', 1], ['horses', 0.6, 1, 6], ['guns', 1.2], ['fuel', 0.6], ['vehicles', 0.8], ['electronics', 0.6]] },
    { key: 'build', name: 'Building', b: 0.03, e: 1.0, era: 0, state: 1, of: [['timber', 1], ['stone', 1], ['tools', 0.6], ['glass', 0.3, 3], ['steel', 1], ['machinery', 0.5], ['aluminium', 0.4], ['plastics', 0.2]] },
    { key: 'ships', name: 'Shipping', b: 0.012, e: 1.0, era: 2, state: 1, of: [['ships', 1]] },
  ];
  const NC = CATS.length; const CAT = {};
  CATS.forEach((c, k) => { c.id = k; CAT[c.key] = k; c.m = c.of.map(([key, w, from, to]) => ({ g: ID[key], w, from: from === undefined ? GOODS[ID[key]].era : from, to: to === undefined ? 8 : to })); });
  // people take to a good an age before they can make it themselves (it comes to them by trade)
  const wants = (m, era) => m.from <= era + 1 && era <= m.to;
  let NM = 0; for (const c of CATS) { c.m0 = NM; for (const m of c.m) m.idx = NM++; }      // every member of every category has a number
  // the same tables laid flat, for the yearly loops
  const RAWS = [], gEra = new Uint8Array(NG), gFood = new Uint8Array(NG); for (let g = 1; g < NG; g++) { if (GOODS[g].raw) RAWS.push(g); gEra[g] = GOODS[g].era; gFood[g] = GOODS[g].kind === 'food' ? 1 : 0; } const NRAW = RAWS.length;
  const rEra = new Uint8Array(NR), rSec = new Uint8Array(NR), rOut = new Uint8Array(NR), rL = new Float32Array(NR), rI0 = new Uint16Array(NR + 1); let IG = [], IQ = [];
  RECIPES.forEach((R, r) => { rEra[r] = R.era; rSec[r] = R.sec; rOut[r] = R.out; rL[r] = R.l; rI0[r] = IG.length; for (const [g, q] of R.in) { IG.push(g); IQ.push(q); } }); rI0[NR] = IG.length; IG = Uint8Array.from(IG); IQ = Float32Array.from(IQ);
  const cEra = new Uint8Array(NC), cB = new Float32Array(NC), cE = new Float64Array(NC), cState = new Uint8Array(NC), cLs = new Float32Array(NC), c0 = new Uint16Array(NC + 1), mG = new Uint8Array(NM), mW = new Float32Array(NM), mFrom = new Int8Array(NM), mTo = new Int8Array(NM);
  CATS.forEach((C, k) => { cEra[k] = C.era; cB[k] = C.b; cE[k] = C.e; cState[k] = C.state ? 1 : 0; cLs[k] = C.ls || 0; c0[k] = C.m0; for (const m of C.m) { mG[m.idx] = m.g; mW[m.idx] = m.w; mFrom[m.idx] = m.from; mTo[m.idx] = m.to; } }); c0[NC] = NM;
  const K_ARMS = CAT.arms, K_SHIPS = CAT.ships;

  // ---------- how much of each raw good a thousand people living on its land bring in ----------
  // CAL is measured, not chosen: tools/econ/calibrate.js runs the world and works out, for every raw good, how many
  // lots the world would use for each lot-per-thousand its land could give. A yield is that times the good's abund.
  /* CAL:BEGIN */
  const CAL = {grain: 0.808, fish: 0.507, cattle: 0.671, timber: 0.519, stone: 0.516, salt: 0.242, copper: 0.0482, tin: 0.0756, iron: 0.178, horses: 0.0375, gold: 0.0144, gems: 0.0154, wine: 0.0568, spices: 0.0124, silk: 0.00187, furs: 0.0751, ivory: 0.00263, cotton: 0.33, coal: 9.45, oil: 6.38, rice: 0.375, maize: 0.952, wool: 0.325, olives: 0.804, sugar: 0.176, tea: 0.0946, coffee: 0.444, cocoa: 7.4, tobacco: 0.918, silver: 0.0501, amber: 0.0662, obsidian: 2.43, incense: 1.87, dyes: 0.235, jade: 0.0158, saltpetre: 0.0393, rubber: 0.552, gas: 11.1, uranium: 0.422, bauxite: 1.49, rareearth: 0.266, lithium: 0.749};
  /* CAL:END */
  const yieldOf = (g) => (CAL[g.key] === undefined ? 0.5 : CAL[g.key]) * g.abund;

  // what a thousand people at this level of knowledge would use of everything in a year, at usual prices, with
  // what the workshops need to make it (for calibration, and for the page's "what an age wants")
  function req(tech, era, portShare) {
    const F = 1 + 5 * tech; const x = new Float64Array(NG);
    for (const c of CATS) {
      if (era < c.era) continue; let B = c.b * Math.pow(F, c.e); if (c.key === 'ships') B *= (portShare === undefined ? 0.5 : portShare);
      let sum = 0; for (const m of c.m) if (wants(m, era) && GOODS[m.g].era <= era) sum += m.w; if (!sum) continue;
      for (const m of c.m) if (wants(m, era) && GOODS[m.g].era <= era) x[m.g] += B * m.w / sum / GOODS[m.g].base;
    }
    for (let k = MADE_ORDER.length - 1; k >= 0; k--) {
      const g = MADE_ORDER[k]; if (x[g] <= 0) continue; let sum = 0; for (const ri of MAKES[g]) { const r = RECIPES[ri]; if (r.era <= era && era <= r.until) sum += r.cw; } if (!sum) continue;
      for (const ri of MAKES[g]) { const r = RECIPES[ri]; if (r.era > era || era > r.until) continue; const part = x[g] * r.cw / sum; for (const [gi, q] of r.in) x[gi] += q * part; }
    }
    return x;
  }

  // ---------- where the Earth keeps things ----------
  // The first twenty goods lie where they always lay in this game (the rules below are the ones the simulation was
  // born with, so old worlds keep their mines). Rice and maize take the grain's place in the lands that grew them,
  // and the newer goods are laid on land that had nothing: [good, era, chance, west, south, east, north]. The era is
  // the age in which THAT place begins to yield it (cocoa is old in Mesoamerica and came to West Africa with the
  // plantations; sheep reached Australia with the ships).
  const PLACES = [
    ['tin', 1, 0.4, 12, 50, 14.5, 51], ['tin', 1, 0.2, -9, 41, -6, 43.5], ['tin', 1, 0.3, -4.5, 47.3, -2, 48.5], ['tin', 1, 0.12, 64, 37.5, 70, 40.5], ['tin', 1, 0.3, 34, 37, 35.8, 38], ['tin', 1, 0.5, 102.5, 22.8, 104, 24], ['tin', 1, 0.4, 8.2, 9, 9.8, 10.5], ['tin', 1, 0.6, 105, -3.2, 108.5, -1.4], ['tin', 6, 0.15, 28, -3, 30, -1], ['tin', 6, 0.4, 145, -42, 146.5, -41],
    ['gems', 1, 0.15, 77, 15, 81, 18], ['gems', 1, 0.5, 80, 6, 81.5, 7.5], ['gems', 1, 0.8, 96, 22.5, 97, 23.5], ['gems', 1, 0.6, 70, 36, 71.5, 37.5], ['gems', 1, 0.7, -74.5, 5, -73.5, 6], ['gems', 1, 0.3, 34, 24, 35.5, 25.5], ['gems', 1, 0.5, 102, 12.3, 103, 13.3], ['gems', 5, 0.4, -44.5, -19, -43, -17.5], ['gems', 6, 0.5, 24, -29.5, 25.5, -28], ['gems', 7, 0.3, 23, -22, 26, -20], ['gems', 7, 0.2, 112, 61, 116, 64],
    ['wool', 0, 0.25, -10, 50, 2, 59], ['wool', 0, 0.2, -8, 37, 0, 43], ['wool', 0, 0.15, 27, 37, 45, 41], ['wool', 0, 0.12, 40, 32, 50, 38], ['wool', 0, 0.08, 50, 38, 80, 48], ['wool', 0, 0.06, 85, 30, 110, 48], ['wool', 0, 0.2, -78, -20, -66, -8], ['wool', 5, 0.2, -72, -50, -64, -38], ['wool', 5, 0.2, 140, -38, 153, -28], ['wool', 5, 0.3, 166, -47, 179, -34], ['wool', 5, 0.15, 18, -34, 28, -28], ['wool', 0, 0.1, 0, 48, 6, 52], ['wool', 0, 0.1, -8, 30, 10, 36],
    ['olives', 1, 0.2, -9, 30, 37, 44], ['olives', 5, 0.15, -123, 34, -119, 39],
    ['sugar', 3, 0.12, 76, 16, 92, 28], ['sugar', 3, 0.06, 100, -8, 150, 6], ['sugar', 3, 0.08, 105, 20, 118, 26], ['sugar', 5, 0.5, -85, 17, -60, 23], ['sugar', 5, 0.4, -42, -14, -34, -5], ['sugar', 6, 0.3, -93, 29, -89, 31], ['sugar', 6, 0.2, 28, -31, 33, -27], ['sugar', 6, 0.2, 144, -22, 153, -15], ['sugar', 4, 0.1, 30, 24, 33, 30],
    ['tea', 3, 0.12, 100, 22, 122, 31], ['tea', 4, 0.1, 130, 31, 141, 37], ['tea', 6, 0.25, 86, 24, 96, 28], ['tea', 6, 0.4, 79.5, 6, 82, 9], ['tea', 7, 0.2, 34, -2, 38, 1],
    ['coffee', 4, 0.2, 35, 5, 42, 11], ['coffee', 4, 0.3, 42, 13, 46, 17], ['coffee', 5, 0.06, 98, -8, 114, 2], ['coffee', 6, 0.25, -52, -24, -42, -18], ['coffee', 6, 0.25, -77, 2, -72, 8], ['coffee', 6, 0.15, -92, 9, -83, 16], ['coffee', 7, 0.2, 106, 11, 109, 15], ['coffee', 6, 0.08, 29, -4, 38, 2],
    ['cocoa', 1, 0.15, -96, 14, -86, 19], ['cocoa', 1, 0.05, -80, -5, -60, 3], ['cocoa', 6, 0.35, -8, 4.5, 2, 8], ['cocoa', 6, 0.4, -41, -16, -38, -13], ['cocoa', 7, 0.2, 119, -5, 123, 1],
    ['tobacco', 1, 0.25, -82, 34, -75, 39], ['tobacco', 1, 0.15, -85, 19, -74, 23.5], ['tobacco', 1, 0.06, -100, 15, -88, 21], ['tobacco', 1, 0.1, -55, -30, -48, -24], ['tobacco', 5, 0.08, 22, 38, 36, 42], ['tobacco', 5, 0.1, 78, 14, 82, 18], ['tobacco', 5, 0.1, 99, 22, 105, 27], ['tobacco', 6, 0.12, 28, -19, 35, -12],
    ['silver', 1, 0.8, 23.5, 37.5, 24.5, 38.5], ['silver', 1, 0.12, -7, 37, -1, 39], ['silver', 4, 0.2, 12, 49.5, 16, 51], ['silver', 4, 0.3, 10, 46.5, 13, 47.5], ['silver', 1, 0.5, -67, -21, -64, -18], ['silver', 1, 0.25, -77, -12, -74, -9], ['silver', 1, 0.15, -104, 18, -99, 24], ['silver', 4, 0.4, 131, 34, 134, 36], ['silver', 6, 0.4, -120.5, 38.5, -118, 40], ['silver', 1, 0.08, 33, 36.5, 38, 38.5], ['silver', 1, 0.04, 50, 32, 56, 36], ['silver', 6, 0.5, 140.5, -33, 142.5, -31], ['silver', 5, 0.5, 9, 59, 10.5, 60], ['silver', 2, 0.03, 100, 24, 113, 28],
    ['amber', 0, 0.25, 14, 53.5, 24, 58], ['amber', 0, 0.3, -71, 18.5, -69, 20], ['amber', 0, 0.3, 96, 25, 98, 27],
    ['obsidian', 0, 0.3, 33, 37.5, 36, 39.5], ['obsidian', 0, 0.2, 41, 38, 46, 41], ['obsidian', 0, 0.9, 24, 36.5, 25, 37], ['obsidian', 0, 0.5, 8.3, 39.5, 9.5, 40.5], ['obsidian', 0, 0.9, 14.5, 38.2, 15.5, 38.8], ['obsidian', 0, 0.12, 38, 6, 41, 10], ['obsidian', 0, 0.15, 35.5, -2, 37, 1], ['obsidian', 0, 0.12, -100, 14, -89, 21], ['obsidian', 0, 0.05, -122, 36, -117, 44], ['obsidian', 0, 0.06, -78, -3, -70, 0], ['obsidian', 0, 0.1, -72, -17, -69, -14], ['obsidian', 0, 0.15, 130, 31, 132, 34], ['obsidian', 0, 0.15, 141, 42, 145, 44.5], ['obsidian', 0, 0.3, 175, -39, 177.5, -36.5], ['obsidian', 0, 0.15, -22, 63.5, -15, 66], ['obsidian', 0, 0.4, 20.5, 47.5, 22, 48.8], ['obsidian', 0, 0.4, 149, -6.5, 152, -4],
    ['incense', 1, 0.3, 48, 14.5, 56, 18.5], ['incense', 1, 0.2, 44, 8, 51.5, 12],
    ['dyes', 1, 0.5, 34.5, 32.5, 36.5, 35.5], ['dyes', 1, 0.4, 10, 33, 11.5, 34.5], ['dyes', 1, 0.05, 70, 20, 80, 28], ['dyes', 1, 0.08, 86, 22, 91, 26], ['dyes', 1, 0.4, -98.5, 16, -95.5, 18], ['dyes', 1, 0.1, -76, -15, -72, -12], ['dyes', 2, 0.06, 3, 7, 10, 13], ['dyes', 1, 0.15, -41, -23, -38, -15], ['dyes', 2, 0.1, -1, 43, 4, 45],
    ['jade', 0, 0.4, 77, 36, 82, 38], ['jade', 0, 0.4, 95.5, 24.5, 97.5, 26.5], ['jade', 0, 0.4, -91, 14.5, -88.5, 16], ['jade', 0, 0.3, 168, -45, 172, -42], ['jade', 0, 0.4, 122, 40, 124, 41.5], ['jade', 0, 0.15, 98, 51, 103, 53],
    ['saltpetre', 4, 0.25, 83, 24, 88.5, 27], ['saltpetre', 4, 0.1, 103, 28, 108, 32], ['saltpetre', 4, 0.12, 116, 35, 119, 37.5], ['saltpetre', 6, 0.5, -70.5, -26, -68.5, -19], ['saltpetre', 4, 0.12, -4.5, 38.5, -1.5, 40.5], ['saltpetre', 5, 0.04, 18, 46, 24, 50], ['saltpetre', 4, 0.05, 74, 15, 79, 20], ['saltpetre', 4, 0.05, 51, 29, 56, 33],
    ['rubber', 6, 0.1, -72, -10, -50, 2], ['rubber', 6, 0.06, 16, -5, 28, 3], ['rubber', 7, 0.25, -11, 4.5, -7, 8], ['rubber', 7, 0.3, 98, 0, 104, 7], ['rubber', 7, 0.08, 108, -8, 118, 5], ['rubber', 7, 0.3, 80, 6, 81.5, 8], ['rubber', 7, 0.15, 104, 10, 108, 13], ['rubber', 7, 0.2, 98, 7, 101, 11],
    ['gas', 7, 0.2, 66, 62, 80, 70], ['gas', 7, 0.5, 50, 24.5, 53, 28], ['gas', 7, 0.1, 52, 27, 58, 31], ['gas', 7, 0.15, 54, 36, 64, 41], ['gas', 7, 0.6, 5.5, 52.5, 7.5, 53.6], ['gas', 7, 0.15, 1, 30, 6, 34], ['gas', 7, 0.06, -102, 28, -92, 37], ['gas', 7, 0.08, -82, 38, -75, 42.5], ['gas', 7, 0.08, -120, 52, -110, 58], ['gas', 7, 0.2, 4, 58, 8, 63], ['gas', 7, 0.1, 114, -23, 122, -19], ['gas', 7, 0.06, 103, 28.5, 108, 32], ['gas', 7, 0.2, -70.5, -40, -67, -36], ['gas', 7, 0.15, 30, 30.5, 33, 31.7], ['gas', 7, 0.1, 35, -13, 41, -10],
    ['uranium', 7, 0.12, 62, 43, 72, 47], ['uranium', 7, 0.15, -110, 56, -102, 60], ['uranium', 7, 0.3, 135, -32, 138, -29], ['uranium', 7, 0.4, 131.5, -14, 134, -12], ['uranium', 7, 0.4, 14, -24, 16.5, -21], ['uranium', 7, 0.5, 6.5, 17.5, 9, 19.5], ['uranium', 7, 0.4, 25.5, -12, 28, -10], ['uranium', 7, 0.5, 12.3, 50, 13.5, 50.8], ['uranium', 7, 0.12, -110.5, 36, -107, 39.5], ['uranium', 7, 0.1, 26, -28, 29, -25.5], ['uranium', 7, 0.2, 115, 49.5, 119, 52], ['uranium', 7, 0.5, 12.5, -2.5, 14, -0.5],
    ['bauxite', 7, 0.3, -15, 9, -9, 12.5], ['bauxite', 7, 0.6, 141, -14, 143, -11.5], ['bauxite', 7, 0.4, 115.5, -33, 117, -31], ['bauxite', 7, 0.8, -78.5, 17.6, -76, 18.6], ['bauxite', 7, 0.2, -58, -3, -54, -0.5], ['bauxite', 7, 0.12, 82, 18, 86, 22], ['bauxite', 7, 0.12, 105, 22, 109, 25], ['bauxite', 7, 0.06, 111, 34, 114, 37.5], ['bauxite', 7, 0.3, -59, 4, -54, 7], ['bauxite', 7, 0.5, 4.5, 43.3, 6.5, 44], ['bauxite', 7, 0.3, 22, 38, 23.5, 39], ['bauxite', 7, 0.25, 17, 46.5, 19, 47.5], ['bauxite', 7, 0.15, 107, 11.5, 108.7, 14.5], ['bauxite', 7, 0.2, 108.5, -1.5, 111, 1.5], ['bauxite', 7, 0.05, 59, 51, 62, 60], ['bauxite', 7, 0.1, -2.8, 5.5, -1, 7], ['bauxite', 7, 0.2, 12, 6, 14.5, 7.5],
    ['rareearth', 8, 0.6, 108.5, 40.5, 111, 42.5], ['rareearth', 8, 0.15, 113.5, 23.5, 116.5, 26.5], ['rareearth', 8, 0.4, 101, 27.5, 102.5, 29], ['rareearth', 8, 0.7, -116.5, 35, -115, 36], ['rareearth', 8, 0.7, 121.5, -29.5, 123, -28], ['rareearth', 8, 0.4, 33.5, 67, 36, 68.5], ['rareearth', 8, 0.8, -46.5, 60.5, -45, 61.5], ['rareearth', 8, 0.4, 102.5, 21.5, 104, 23], ['rareearth', 8, 0.4, -47.5, -20, -46, -19], ['rareearth', 8, 0.3, 76, 8.3, 77.2, 9.8], ['rareearth', 8, 0.1, 29.5, -4, 33, -2.5], ['rareearth', 8, 0.2, 97, 24.5, 98.7, 26.5], ['rareearth', 8, 0.4, 19.5, 67.3, 21, 68.3], ['rareearth', 8, 0.3, 18, -31.5, 19.5, -30],
    ['lithium', 8, 0.3, -69, -27, -66, -19.5], ['lithium', 8, 0.3, 115.5, -34.5, 117, -33], ['lithium', 8, 0.25, 118, -22, 120.5, -20], ['lithium', 8, 0.12, 90, 36, 96, 38.5], ['lithium', 8, 0.2, 83.5, 31, 86, 32.5], ['lithium', 8, 0.3, 113.8, 27.3, 115, 28.5], ['lithium', 8, 0.3, -118.5, 37, -117, 38.5], ['lithium', 8, 0.3, -119, 41.2, -117.5, 42.2], ['lithium', 8, 0.4, 30.5, -20.5, 32, -19.5], ['lithium', 8, 0.12, -8, 40.5, -6.5, 42], ['lithium', 8, 0.3, 19, 44, 20, 45], ['lithium', 8, 0.5, 27, -7.8, 28, -6.8], ['lithium', 8, 0.05, -78, 49.5, -74, 53], ['lithium', 8, 0.3, -81.5, 35, -80.5, 35.8], ['lithium', 8, 0.4, -8.5, 10.8, -7.5, 11.8], ['lithium', 8, 0.1, 69, 33.5, 71, 35.5],
  ];
  const RICE = [[96, -10, 145, 34], [76, 8, 96, 28], [124, 30, 146, 40]];
  const placed = new WeakMap();
  function place(world, W, H) {
    const hit = placed.get(world); if (hit) return hit;
    const { land, fert, elev, flags } = world; const N = W * H;
    const goods = new Uint8Array(N), gera = new Uint8Array(N), wood = new Float32Array(N);
    const h32 = (i, k) => { let x = (i * 374761393 + k * 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
    const inBox = (lon, lat, b) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
    // where history found things (lon0, lat0, lon1, lat1)
    const REGION = {
      silk: [[100, 20, 122, 40]], spices: [[72, 6, 80, 20], [95, -10, 130, 15]], ivory: [[-15, -30, 50, 12], [72, 8, 88, 25]],
      gold: [[16, -34, 32, -22], [-12, 5, 2, 14], [-124, 34, -118, 41], [114, -34, 152, -20], [-80, -16, -70, 4], [100, 55, 140, 68]],
      cotton: [[68, 8, 90, 30], [29, 24, 33, 32], [-100, 28, -80, 36], [-104, 14, -88, 22]], horses: [[20, 44, 120, 55], [-110, 32, -95, 50]],
      tin: [[-6, 49.5, -4, 51], [98, 1, 104, 7], [-70, -22, -64, -16]], wine: [[-10, 35, 30, 50], [-124, 32, -118, 40], [-74, -40, -68, -30]],
      coal: [[-4, 51, 2, 56], [6, 50, 9, 52], [-85, 36, -78, 42], [36, 47, 40, 49], [108, 34, 114, 40], [148, -34, 152, -30]],
      oil: [[44, 24, 56, 32], [48, 36, 54, 44], [-104, 27, -94, 34], [-72, 7, -62, 11], [3, 4, 8, 7], [0, 56, 4, 62], [60, 58, 80, 68]],
    };
    const rows = PLACES.map(([key, era, p, w, s, e, n]) => [ID[key], era, p, [w, s, e, n]]);
    for (let i = 0; i < N; i++) {
      if (!land[i] || (flags[i] & 8)) continue;
      const y = (i / W) | 0, x = i - y * W; const lon = (x + 0.5) / W * 360 - 180, lat = 90 - (y + 0.5) / H * 180; const al = Math.abs(lat);
      const f = fert[i], e = elev[i] / 255, coast = !!(flags[i] & 4), river = !!(flags[i] & 2); const r = h32(i, 1), r2 = h32(i, 2);
      let g = 0;
      if (river && f > 0.62 && r < 0.55) g = ID.grain; // the great river valleys feed the world first
      // regional specialities next
      if (!g) for (const key in REGION) { if (REGION[key].some(b => inBox(lon, lat, b)) && r2 < (key === 'horses' ? 0.14 : key === 'coal' || key === 'oil' ? 0.3 : key === 'gold' || key === 'ivory' ? 0.1 : key === 'tin' ? 0.4 : 0.22)) { g = ID[key]; break; } }
      if (!g) {
        if (coast && r < 0.3) g = ID.fish;
        else if (e > 0.55 && r < 0.5) g = r2 < 0.12 ? ID.gold : r2 < 0.22 ? ID.gems : r2 < 0.55 ? ID.iron : ID.stone;
        else if (e > 0.32 && r < 0.45) g = r2 < 0.3 ? ID.copper : r2 < 0.6 ? ID.iron : r2 < 0.75 ? ID.coal : ID.stone;
        else if (r > 0.95) g = r < 0.98 ? ID.iron : ID.copper; // ore in the lowlands too, now and then
        else if (f > 0.62 && (river || r < 0.25)) g = ID.grain;
        else if (f > 0.3 && f < 0.7 && al > 42 && al < 66 && r < 0.3) g = r2 < 0.65 ? ID.timber : ID.furs;
        else if (f > 0.5 && al < 12 && r < 0.2) g = r2 < 0.5 ? ID.spices : ID.timber;
        else if (f > 0.2 && f < 0.5 && al > 30 && al < 56 && r < 0.18) g = r2 < 0.55 ? ID.cattle : ID.horses;
        else if (f < 0.25 && (coast || r < 0.08) && r2 < 0.3) g = ID.salt;
        else if (al > 60 && r < 0.25) g = ID.furs;
        else if (f > 0.4 && al > 28 && al < 50 && r < 0.12) g = ID.wine;
      }
      let era = g ? GOODS[g].era : 0;
      if (g === ID.grain) { if (lon < -30) g = ID.maize; else if (RICE.some(b => inBox(lon, lat, b))) g = ID.rice; }
      if (!g) for (let k = 0; k < rows.length; k++) { const row = rows[k]; if (inBox(lon, lat, row[3]) && h32(i, 100 + k) < row[2]) { g = row[0]; era = row[1]; break; } }
      goods[i] = g; gera[i] = era;
      wood[i] = clamp((f - 0.2) / 0.4, 0, 1) * 0.15;      // any country with rain has woods to cut (the timber lands above have far more)
    }
    const res = { goods, gera, wood }; placed.set(world, res); return res;
  }

  // ---------- one world's market ----------
  // host: { MAXC, civs, popOf, cellsOf, ports, markets, rawPop (MAXC*64: people on each raw good's land, mines
  // counted over), urban (people in towns), portCells (MAXC*4, -1 = none), eff (MAXC*8: how much cheaper each kind of
  // workshop's work is, 1 = as usual), keep / hold (MAXC: granaries, warehouses; 1 = none), cellDist, seaRange, year(), seed }
  function create(host) {
    const { MAXC, civs, popOf, cellsOf, ports, markets, rawPop, urban, portCells } = host;
    const SZ = MAXC * NG;
    const stock = new Float32Array(SZ), px = new Float32Array(SZ).fill(1), av = new Float32Array(SZ), need = new Float32Array(SZ), fin = new Float32Array(SZ), got = new Float32Array(SZ), out = new Float32Array(SZ), used = new Float32Array(SZ), imp = new Float32Array(SZ), exp = new Float32Array(SZ), inv = new Float32Array(SZ);
    const act = new Float32Array(MAXC * NR), mk = new Float32Array(MAXC * NR);        // each line of work: what it means to make, what it made
    const Bk = new Float32Array(MAXC * NC), sh = new Float32Array(MAXC * NM);          // what each realm spends on each want, and how it splits it between the goods
    const sat = new Float32Array(MAXC * NC).fill(0.6), LS = new Float32Array(MAXC).fill(0.6), util = new Float32Array(MAXC), hands = new Float32Array(MAXC), gdp = new Float32Array(MAXC), rev = new Float32Array(MAXC), impV = new Float32Array(MAXC), expV = new Float32Array(MAXC), custT = new Float32Array(MAXC).fill(1), custH = new Float32Array(MAXC).fill(1), cust = new Float32Array(MAXC).fill(-1);
    const present = new Uint8Array(SZ), plen = new Uint8Array(MAXC);
    const nbr = new Array(MAXC).fill(null);             // the realms each one touches by land (from the simulation's border contacts)
    const base = new Float32Array(NG), ibase = new Float32Array(NG), bulk = new Float32Array(NG), rot = new Float32Array(NG), yld = new Float32Array(NG), crop = new Float32Array(NG);
    const BV = []; const BC = new Uint8Array(NG);       // the distinct bulks, and each good's place among them
    for (let g = 1; g < NG; g++) { const G = GOODS[g]; base[g] = G.base; ibase[g] = 1 / G.base; bulk[g] = G.bulk; rot[g] = G.rot; yld[g] = G.raw ? yieldOf(G) : 0; crop[g] = G.crop || 0; let k = BV.indexOf(G.bulk); if (k < 0) { k = BV.length; BV.push(G.bulk); } BC[g] = k; }
    const NB = BV.length;
    // world totals, and the price of everything through the years (a year at a time, and a decade at a time)
    const wPx = new Float32Array(NG).fill(1), wOut = new Float32Array(NG), wNeed = new Float32Array(NG), wTrade = new Float32Array(NG), wStock = new Float32Array(NG);
    const HY = 64, HD = 256; const hYr = new Uint8Array(NG * HY), hDec = new Uint8Array(NG * HD); let nYr = 0, nDec = 0, decAt = 0; const myPx = new Uint8Array(NG * HY); let nMy = 0;
    const q8 = (x) => clamp(Math.round(Math.log2(clamp(x, XMIN / 2, XMAX * 2) / (XMIN / 2)) / Math.log2(XMAX * 4 / XMIN) * 255), 0, 255), d8 = (b) => (XMIN / 2) * Math.pow(XMAX * 4 / XMIN, b / 255);
    let worldGdp = 0, worldTrade = 0, steps = 0;
    // its own run of chance, so that harvests do not disturb the rest of history
    let es = ((host.seed >>> 0) ^ 0x9E3779B9) >>> 0;
    const ernd = () => { es = (es + 0x6D2B79F5) >>> 0; let t = es; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const wShock = new Float32Array(NG).fill(1);

    // ----- who can trade with whom, and what the road costs -----
    let links = [], Tl = new Float32Array(0), linksAt = -1e9;
    const radius = (c) => Math.min(25, Math.sqrt(Math.max(1, cellsOf[c]) / Math.PI) * 0.8);
    const kf = host.kf || null, NKF = host.NKF || 0, K_TRADE = host.K_TRADE || 0, K_SEA = host.K_SEA || 0;      // what each realm knows, as factors (know.js): trade, the range of ships
    const closedTo = host.closed || null, agreedWith = host.agreed || null;                                  // what realms have sworn or shut (diplo.js): markets closed by either, a trade agreement in force
    const rm = host.rmask || null, ym = host.ymul || null;                                                   // the crafts each realm knows; what it gets from each good's land for what it knows
    const seaReach = (cv) => Math.min(400, Math.max(6, host.seaRange(cv.tech) * (host.tv ? host.tv(cv, 'sea', 1) : 1) * (kf ? kf[cv.id * NKF + K_SEA] : 1)) + 3 * ports[cv.id]);
    function buildLinks(year) {
      linksAt = year; const seen = new Map(); links = [];
      const add = (a, b, k, sea, d) => { if (a > b) { const t = a; a = b; b = t; } const key = a * MAXC + b; const l = seen.get(key); if (l) { if (k < l.k) { l.k = k; l.sea = sea; l.d = d; } l.both = true; } else { const L = { a, b, k, sea, d, v: 0, top: 0, tv: 0 }; seen.set(key, L); links.push(L); } };
      for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv || !nbr[c]) continue; for (const b of nbr[c]) { const bv = civs[b]; if (!bv || b === c) continue; const d = 0.5 * (radius(c) + radius(b)) + 1; add(c, b, LAND * d * LANDK[Math.max(cv.era, bv.era)], false, d); } }
      // by sea: every realm with a harbour deals with the eight that pull hardest (the size of their market over the distance)
      const P = []; for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (cv && ports[c] > 0 && portCells[c * 4] >= 0) P.push(c); }
      const size = (c) => popOf[c] * (1 + 5 * civs[c].tech);
      for (const a of P) {
        const ca = civs[a]; const Ra = seaReach(ca); const cand = [];
        for (const b of P) {
          if (b === a) continue; const cb = civs[b]; const R = Math.max(Ra, seaReach(cb));
          if (host.cellDist(portCells[a * 4], portCells[b * 4]) > R + 50) continue;
          let d = 1e9; for (let i = 0; i < 4; i++) { const pa = portCells[a * 4 + i]; if (pa < 0) break; for (let j = 0; j < 4; j++) { const pb = portCells[b * 4 + j]; if (pb < 0) break; const dd = host.cellDist(pa, pb); if (dd < d) d = dd; } }
          if (d <= R) cand.push([b, d, size(b) / Math.pow(d + 4, 1.5)]);
        }
        cand.sort((p, q) => q[2] - p[2]);
        for (let k = 0; k < cand.length && k < 8; k++) { const [b, d] = cand[k]; add(a, b, SEA * (d + 2) * SEAK[Math.max(ca.era, civs[b].era)], true, d); }
      }
      Tl = new Float32Array(links.length * NB);
      links.forEach((L, li) => { L.t = li * NB; for (let k = 0; k < NB; k++) Tl[L.t + k] = Math.pow(1 + Math.max(0.02, BV[k] * L.k), INV); });
    }
    const freight = (L, g) => Math.max(0.02, bulk[g] * L.k);

    // the state's own dealings (the player's realm): customs, bans, a reserve, standing orders
    const econOf = (cv) => cv.econ || (cv.econ = { customs: AICUST, noX: [], noM: [], res: {}, orders: [], led: { customs: 0, bought: 0, sold: 0 }, seq: 0 });
    let banC = -1; const banX = new Uint8Array(NG), banM = new Uint8Array(NG);
    // what the player's realm took from, and sent to, each other realm last year, good by good (for the page)
    let pfC = -1; const pfIn = new Float32Array(SZ), pfOut = new Float32Array(SZ);

    function flow(os, ob, s, r, L) {      // goods go from s to r where r pays more than s plus the road; returns whether any went
      const m = plen[s]; if (!m) return false; const fr = L.fr, ct = fr ? custH[r] : custT[r], tl = L.t, cr8 = fr ? cust[r] * 0.5 : cust[r]; const ps = s * NG; let any = false;      // (under a trade agreement the buyer's customs are halved)
      for (let k = 0; k < m; k++) {
        const g = present[ps + k]; const ivr = inv[ob + g]; if (ivr === 0) continue;
        const as = av[os + g]; if (as <= 0) continue;
        const T = Tl[tl + BC[g]] * ct, ivs = inv[os + g]; const num = as * ivs / T - av[ob + g] * ivr; if (num <= 0.003) continue;
        if (banC >= 0 && ((s === banC && banX[g]) || (r === banC && banM[g]))) continue;
        let q = num / (ivr + ivs / T) * FLOWK; if (q > as * 0.5) q = as * 0.5; if (q < 1e-9) continue;
        av[os + g] = as - q; av[ob + g] += q; exp[os + g] += q; imp[ob + g] += q; any = true;
        const v = q * base[g] * px[os + g]; L.v += v; if (v > L.tv) { L.tv = v; L.top = s === L.a ? g : -g; }
        expV[s] += v; impV[r] += v; rev[r] += v * cr8; wTrade[g] += q;
        if (s === pfC) pfOut[r * NG + g] += q; else if (r === pfC) pfIn[s * NG + g] += q;
      }
      return any;
    }

    // ----- a year -----
    const pxW = new Float64Array(NG), pxN = new Float64Array(NG);
    function step(opts) {
      const quiet = !!(opts && opts.quiet); const year = host.year(); steps++;
      if (year - linksAt >= 4 || year < linksAt) buildLinks(year);
      const pl = host.player ? host.player() : -1; banC = -1;
      if (pfC >= 0 || pl >= 0) { pfIn.fill(0); pfOut.fill(0); } pfC = pl >= 0 && civs[pl] ? pl : -1;
      if (pl >= 0 && civs[pl]) { const e = econOf(civs[pl]); if (e.noX.length || e.noM.length) { banC = pl; banX.fill(0); banM.fill(0); for (const g of e.noX) banX[g] = 1; for (const g of e.noM) banM[g] = 1; } }
      // harvests: the whole world's weather, then each realm's own
      for (let g = 1; g < NG; g++) wShock[g] = crop[g] ? 1 + (ernd() - 0.5) * 0.10 * crop[g] : 1;
      wOut.fill(0); wNeed.fill(0); wTrade.fill(0); wStock.fill(0); pxW.fill(0); pxN.fill(0);
      const eff = host.eff || null, hold = host.hold || null, keepA = host.keep || null;
      // 1-3: what the land gives, what is wanted, what the workshops make
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; if (!cv) continue;
        const o = c * NG, P = popOf[c], era = cv.era; const F = 1 + 5 * cv.tech, lf = Math.log(F), sF = Math.sqrt(F), F7 = Math.exp(0.7 * lf);
        const hs = 1 + (ernd() + ernd() - 1) * 0.14;
        rev[c] = 0; impV[c] = 0; expV[c] = 0;
        const cu = cv.econ ? clamp(+cv.econ.customs || 0, 0, 0.6) : AICUST; if (cu !== cust[c]) { cust[c] = cu; custT[c] = Math.pow(1 + cu, INV); custH[c] = Math.pow(1 + cu * 0.5, INV); }
        fin.fill(0, o, o + NG); need.fill(0, o, o + NG); used.fill(0, o, o + NG); imp.fill(0, o, o + NG); exp.fill(0, o, o + NG); got.fill(0, o, o + NG); out.fill(0, o, o + NG);
        for (let g = 1; g < NG; g++) av[o + g] = stock[o + g];
        for (let k = 0; k < NRAW; k++) {
          const g = RAWS[k]; const rp = rawPop[o + g]; if (!(rp > 0)) continue;
          const x = px[o + g]; const q = rp * yld[g] * F7 * (x < 0.36 ? 0.6 : x > 2.25 ? 1.5 : Math.sqrt(x)) * (crop[g] ? 1 + (hs - 1) * crop[g] : 1) * wShock[g] * (ym ? ym[o + g] : 1);
          out[o + g] = q; av[o + g] += q;
        }
        // what people and the state want, by what is cheap for its kind
        let atWar = false; if (cv.wars) for (const _ in cv.wars) { atWar = true; break; }
        const so = c * NM;
        for (let k = 0; k < NC; k++) {
          let B = 0;
          if (era >= cEra[k]) {
            const e = cE[k]; B = P * cB[k] * (e === 1 ? F : e === 0.5 ? sF : e === 1.5 ? F * sF : Math.exp(e * lf));
            if (k === K_ARMS) B *= (cv.policy ? cv.policy.military : 1) * (atWar ? 1.4 : 1) * (year < cv.army ? 1.3 : 1); else if (k === K_SHIPS) B *= ports[c] > 0 ? Math.min(2, 0.5 + 0.25 * ports[c]) : 0;
          }
          const j0 = c0[k], j1 = c0[k + 1];
          if (B > 0) {
            let sum = 0;
            for (let j = j0; j < j1; j++) { if (mFrom[j] > era + 1 || era > mTo[j]) { sh[so + j] = 0; continue; } const x = px[o + mG[j]]; const v = mW[j] / (x * Math.sqrt(x)); sh[so + j] = v; sum += v; }
            if (sum > 0) { for (let j = j0; j < j1; j++) { const v = sh[so + j]; if (v > 0) { const part = v / sum; sh[so + j] = part; fin[o + mG[j]] += B * part / base[mG[j]]; } } } else B = 0;
          }
          Bk[c * NC + k] = B;
        }
        // the workshops: each line of work follows its margin, inside what the towns' hands can do
        const L = (urban[c] * 0.25 + P * 0.03) * F7; hands[c] = L; const ro = c * NR, eo = c * 8; let busy = 0;
        const w = W0 * (0.55 + 0.9 * util[c]);
        for (let r = 0; r < NR; r++) {
          let A = act[ro + r];
          if (rEra[r] > era || (rm && !rm[ro + r])) { if (A) act[ro + r] = 0; continue; }      // (a craft its age has not reached, or that it has not learned)
          const l = eff ? rL[r] / eff[eo + rSec[r]] : rL[r]; let cost = l * w;
          for (let j = rI0[r], j1 = rI0[r + 1]; j < j1; j++) { const g = IG[j]; cost += IQ[j] * base[g] * px[o + g]; }
          const go = rOut[r]; const m = (base[go] * px[o + go] - cost) / cost; const seed = 0.002 * L / l;
          if (A < seed) { A = m > 0.05 ? seed : 0; } else { A *= 1 + 0.25 * (m < -0.5 ? -0.5 : m > 0.5 ? 0.5 : m); if (A < seed * 0.5) A = 0; }
          act[ro + r] = A; busy += A * l;
        }
        if (busy > L && busy > 0) { const k = L / busy; for (let r = 0; r < NR; r++) act[ro + r] *= k; }
        // they work with what is at hand (never more than six parts in ten of something people also eat or wear), and what
        // they make is there this year. A line of work that cannot get its materials keeps asking for a third more than
        // it got (that is what draws the materials in), but no more: plans do not pile up while the hands stand idle.
        busy = 0;
        for (let r = 0; r < NR; r++) {
          const A = act[ro + r]; mk[ro + r] = 0; if (A <= 0) continue; const j0 = rI0[r], j1 = rI0[r + 1]; let q = A;
          for (let j = j0; j < j1; j++) { const g = IG[j]; const can = av[o + g] * (fin[o + g] > 0 ? 0.6 : 1) / IQ[j]; if (can < q) q = can; }
          for (let j = j0; j < j1; j++) { const g = IG[j]; need[o + g] += A * IQ[j]; if (q > 0) { const left = av[o + g] - q * IQ[j]; av[o + g] = left > 0 ? left : 0; used[o + g] += q * IQ[j]; } }      // (never a hair below nothing)
          const l = eff ? rL[r] / eff[eo + rSec[r]] : rL[r];
          if (q > 0) { const go = rOut[r]; av[o + go] += q; out[o + go] += q; mk[ro + r] = q; busy += q * l; }
          if (q < A) { const top = q * 1.3 + 0.002 * L / l; if (A > top) act[ro + r] = top; }
        }
        util[c] = L > 0 ? busy / L : 0;
        // everything wanted: by people, by the workshops, and a little of everything by the merchants
        const mer = 0.0015 * P * F7 * (1 + 0.3 * Math.sqrt(markets[c])) * (hold ? hold[c] : 1) * (kf ? kf[c * NKF + K_TRADE] : 1); let n = 0;
        for (let g = 1; g < NG; g++) {
          let nd = need[o + g] + fin[o + g]; if (gEra[g] <= era + 1) nd += mer * ibase[g];
          need[o + g] = nd; const a = av[o + g];
          inv[o + g] = nd > 1e-9 ? 1 / (nd * CMAX > a ? nd : a / CMAX) : 0;
          if (a > 1e-9) present[o + n++] = g;
        }
        plen[c] = n;
      }
      // 5: trade, twice round the links (so that a good can go two borders in a year; the second time only where goods moved)
      for (let k = 0; k < links.length; k++) { const L = links[k]; L.v = 0; L.tv = 0; L.top = 0; }
      if (links.length) { const n = links.length, start = Math.abs(year) % n; const pver = closedTo && agreedWith && host.pactVer ? host.pactVer() : null;
        for (let round = 0; round < 2; round++) for (let q = 0; q < n; q++) {
          const L = links[(q + start) % n]; if (round && !L.hot) continue; const a = L.a, b = L.b; const ca = civs[a], cb = civs[b]; if (!ca || !cb) { L.hot = false; continue; } if (ca.wars && ca.wars[b] !== undefined) { L.hot = false; continue; }
          if (pver && !round && (L.va !== pver[a] || L.vb !== pver[b])) { L.va = pver[a]; L.vb = pver[b]; L.shut = closedTo(a, b); L.fr = agreedWith(a, b); }      // (asked again only when either has sworn or shut something since)
          if (L.shut) { L.hot = false; continue; }
          const x = flow(a * NG, b * NG, a, b, L), y = flow(b * NG, a * NG, b, a, L); L.hot = x || y;
        } }
      // the state's standing orders (before people take their share)
      if (!quiet && pl >= 0 && civs[pl] && civs[pl].econ && civs[pl].econ.orders.length) runOrders(civs[pl]);
      // 4, 6: prices, then people take what they need; the rest is kept, less what rots
      worldGdp = 0; worldTrade = 0;
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; if (!cv) continue; const o = c * NG; let va = 0; const keep = keepA ? keepA[c] : 1;
        for (let g = 1; g < NG; g++) {
          const a = av[o + g], nd = need[o + g];
          if (nd <= 1e-9 && a <= 1e-9) { stock[o + g] = 0; continue; }
          const cover = nd > 1e-9 ? a / nd : CMAX; let x; if (cover <= CMIN) x = XMAX; else if (cover >= CMAX) x = XMIN; else { const r = Math.sqrt(cover); x = 1 / (r * Math.sqrt(r)); }
          const p = px[o + g] * 0.5 + x * 0.5; px[o + g] = p;
          const f = fin[o + g]; const take = f > 0 ? (a >= f ? f : a) : 0; got[o + g] = take;
          let left = (a - take) * (1 - (gFood[g] ? rot[g] * keep : rot[g])); const cap = nd * 2.5 + 1e-6; if (left > cap) left = cap;
          stock[o + g] = left;
          va += (out[o + g] - used[o + g]) * base[g] * p;
          wOut[g] += out[o + g]; wNeed[g] += nd; wStock[g] += left; if (a > 1e-9) { pxW[g] += p * a; pxN[g] += a; }
        }
        gdp[c] = va; worldGdp += va; worldTrade += expV[c];
        // how well each want was met, and how well people live
        let ls = 0, lw = 0; const so = c * NM;
        for (let k = 0; k < NC; k++) {
          if (Bk[c * NC + k] <= 0) { sat[c * NC + k] = cState[k] ? 0 : 0.6; continue; }
          let v = 0; for (let j = c0[k], j1 = c0[k + 1]; j < j1; j++) { const part = sh[so + j]; if (part > 0) { const f = fin[o + mG[j]]; if (f > 0) v += part * got[o + mG[j]] / f; } }
          const t = sat[c * NC + k] * 0.4 + (v > 1 ? 1 : v) * 0.6; sat[c * NC + k] = t;
          if (cLs[k]) { ls += cLs[k] * t; lw += cLs[k]; }
        }
        LS[c] = lw > 0 ? ls / lw : 0.6;
      }
      for (let g = 1; g < NG; g++) if (pxN[g] > 0) wPx[g] = pxW[g] / pxN[g];
      // the record: a year at a time (the last 64), a decade at a time (the last 2,560 years)
      if (!quiet) {
        const k = nYr % HY; for (let g = 1; g < NG; g++) hYr[g * HY + k] = q8(wPx[g]); nYr++;
        if (year % 10 === 0) { const d = nDec % HD; for (let g = 1; g < NG; g++) hDec[g * HD + d] = q8(wPx[g]); nDec++; decAt = year; }
        if (pl >= 0 && civs[pl]) { const m = nMy % HY; for (let g = 1; g < NG; g++) myPx[g * HY + m] = q8(px[pl * NG + g]); nMy++; }
        if (pl >= 0 && civs[pl] && civs[pl].econ) civs[pl].econ.led.customs = rev[pl];
      }
    }

    // ----- the book: who would sell to this realm's state, who would buy from it, at what price landed -----
    function partners(c) { const outp = []; for (const L of links) { if (L.a !== c && L.b !== c) continue; const b = L.a === c ? L.b : L.a; const bv = civs[b]; if (!bv) continue; outp.push({ id: b, sea: L.sea, d: L.d, k: L.k, war: !!(civs[c].wars && civs[c].wars[b] !== undefined), v: L.v, top: L.top, link: L }); } return outp; }
    function book(c, g) {
      const asks = [], bids = []; const o = c * NG; const push = (arr, who, q, p, tau) => { if (q > 1e-6) arr.push({ who, q, p, tau }); };
      const side = (who, oo, tau) => {
        const p0 = base[g] * px[oo + g]; const spare = Math.max(0, stock[oo + g] - 0.6 * need[oo + g]); const short = Math.max(0, need[oo + g] * 1.2 - stock[oo + g]);
        if (spare > 0) { const p = p0 * (1 + tau); push(asks, who, spare * 0.5, p, tau); push(asks, who, spare * 0.3, p * 1.1, tau); push(asks, who, spare * 0.2, p * 1.25, tau); }
        if (short > 0 && need[oo + g] > 1e-6) { const p = p0 / (1 + tau); push(bids, who, short * 0.5, p, tau); push(bids, who, short * 0.3, p * 0.9, tau); push(bids, who, short * 0.2, p * 0.8, tau); }
      };
      side(-1, o, 0);
      for (const pt of partners(c)) if (!pt.war) side(pt.id, pt.id * NG, freight(pt.link, g));
      asks.sort((a, b) => a.p - b.p); bids.sort((a, b) => b.p - a.p);
      return { asks, bids };
    }
    // the state buys for its reserve (from its own merchants or from abroad, cheapest first), within what it will pay
    function stateBuy(c, g, qty, limit, dry) {
      const cv = civs[c]; if (!cv || !(qty > 0)) return { q: 0, cost: 0 }; const e = econOf(cv); const b = book(c, g); let left = qty, cost = 0;
      for (const a of b.asks) { if (left <= 1e-9) break; if (limit && a.p > limit) break; let q = Math.min(left, a.q); if (!dry && cv.wealth - cost < q * a.p) q = Math.max(0, (cv.wealth - cost) / a.p); if (q <= 1e-9) break; cost += q * a.p; left -= q; if (!dry) { const oo = (a.who < 0 ? c : a.who) * NG; stock[oo + g] = Math.max(0, stock[oo + g] - q); } }
      const got = qty - left; if (!dry && got > 0) { cv.wealth -= cost; e.res[g] = (e.res[g] || 0) + got; e.led.bought += cost; }
      return { q: got, cost, avg: got > 0 ? cost / got : 0 };
    }
    // and sells from it (to its own market or abroad, dearest first), at no less than it asks
    function stateSell(c, g, qty, limit, dry) {
      const cv = civs[c]; if (!cv || !(qty > 0)) return { q: 0, cost: 0 }; const e = econOf(cv); const have = e.res[g] || 0; let left = Math.min(qty, have), gain = 0; const want = left; const b = book(c, g);
      for (const d of b.bids) { if (left <= 1e-9) break; if (limit && d.p < limit) break; const q = Math.min(left, d.q); gain += q * d.p; left -= q; if (!dry) { const oo = (d.who < 0 ? c : d.who) * NG; stock[oo + g] += q; } }
      const sold = want - left; if (!dry && sold > 0) { cv.wealth += gain; e.res[g] = have - sold; if (e.res[g] < 1e-9) delete e.res[g]; e.led.sold += gain; }
      return { q: sold, cost: gain, avg: sold > 0 ? gain / sold : 0 };
    }
    // release from the reserve straight onto the home market, whatever it fetches (in a shortage this is the point)
    function stateRelease(c, g, qty) {
      const cv = civs[c]; if (!cv) return { q: 0, cost: 0 }; const e = econOf(cv); const have = e.res[g] || 0; const q = Math.min(qty, have); if (!(q > 0)) return { q: 0, cost: 0 };
      const gain = q * base[g] * px[c * NG + g] * 0.8; stock[c * NG + g] += q; e.res[g] = have - q; if (e.res[g] < 1e-9) delete e.res[g]; cv.wealth += gain; e.led.sold += gain; return { q, cost: gain, avg: gain / q };
    }
    function runOrders(cv) {
      const e = cv.econ; const c = cv.id;
      for (const od of e.orders) { if (od.off) continue; const r = od.side === 'buy' ? stateBuy(c, od.g, od.q, od.limit) : stateSell(c, od.g, od.q, od.limit); od.last = r.q; od.done = (od.done || 0) + r.q; if (od.total && od.done >= od.total - 1e-9) od.off = true; }
      e.orders = e.orders.filter(od => !od.off);
    }

    // ----- what the rest of the game asks -----
    const api = {
      NG, NR, NC, stock, px, need, fin, got, out, used, imp, exp, act, mk, sat, LS, util, hands, gdp, rev, impV, expV, wPx, wOut, wNeed, wTrade, wStock,
      step, book, partners, stateBuy, stateSell, stateRelease, econOf,
      get links() { return links; }, get worldGdp() { return worldGdp; }, get worldTrade() { return worldTrade; }, get steps() { return steps; },
      Bk, sh, pfIn, pfOut, cust,
      price(c, g) { return base[g] * px[c * NG + g]; }, worldPrice(g) { return base[g] * wPx[g]; },
      // who wants a good in a realm: its people and state, its workshops, its merchants (lots a year)
      wantsOf(c, g) { const o = c * NG; let w = 0; for (const ri of USES[g]) { const R = RECIPES[ri]; for (const [gi, q] of R.in) if (gi === g) w += act[c * NR + ri] * q; } const f = fin[o + g]; return { people: f, works: w, merchants: Math.max(0, need[o + g] - f - w) }; },
      // every line of work a realm's age knows: what it means to make, what it made, what it earns on a lot, and what holds it back
      lines(c) {
        const cv = civs[c]; if (!cv) return []; const o = c * NG, era = cv.era, w = W0 * (0.55 + 0.9 * util[c]), res = [];
        for (let r = 0; r < NR; r++) { const R = RECIPES[r]; if (R.era > era || (rm && !rm[c * NR + r])) continue; const l = R.l / (host.eff ? host.eff[c * 8 + R.sec] : 1); let cost = l * w; const short = [];
          for (const [g, q] of R.in) { cost += q * base[g] * px[o + g]; if (act[c * NR + r] > 0 && mk[c * NR + r] < act[c * NR + r] * 0.98) { const want = act[c * NR + r] * q; if (used[o + g] + stock[o + g] < want * 1.05) short.push(g); } }
          const price = base[R.out] * px[o + R.out]; res.push({ r, plan: act[c * NR + r], made: mk[c * NR + r], cost, price, margin: (price - cost) / cost, work: mk[c * NR + r] * l, short }); }
        return res;
      },
      // the wage of a unit of work in a realm (coin), and how cheaply each kind of workshop works there
      wage(c) { return W0 * (0.55 + 0.9 * util[c]); },
      touch(c, list) { nbr[c] = list; },
      // a new realm takes its place: one cut from another starts with its share of the stores and the same prices
      born(c, from, share) {
        const o = c * NG; stock.fill(0, o, o + NG); px.fill(1, o, o + NG); need.fill(0, o, o + NG); fin.fill(0, o, o + NG); got.fill(0, o, o + NG); out.fill(0, o, o + NG); av.fill(0, o, o + NG); imp.fill(0, o, o + NG); exp.fill(0, o, o + NG); act.fill(0, c * NR, c * NR + NR); mk.fill(0, c * NR, c * NR + NR); sat.fill(0.6, c * NC, c * NC + NC); LS[c] = 0.6; util[c] = 0; rev[c] = 0; gdp[c] = 0; nbr[c] = null;
        if (from >= 0 && civs[from]) { const p = from * NG; for (let g = 1; g < NG; g++) { px[o + g] = px[p + g]; const s = stock[p + g] * share; stock[o + g] = s; stock[p + g] -= s; } for (let r = 0; r < NR; r++) { const a = act[from * NR + r] * share; act[c * NR + r] = a; act[from * NR + r] -= a; } for (let k = 0; k < NC; k++) sat[c * NC + k] = sat[from * NC + k]; LS[c] = LS[from]; util[c] = util[from]; }
        for (let k = 0; k < MAXC; k++) { const l = nbr[k]; if (l && l.indexOf(c) >= 0) nbr[k] = l.filter(x => x !== c); }      // (the number may have been a dead realm's)
        linksAt = -1e9;
      },
      // run the market a while without the calendar moving (a world loaded from before there was one)
      warm(n) { for (let k = 0; k < n; k++) step({ quiet: true }); },
      // the price of a good through the years: [years ago, world price] oldest first
      series(g, mine) {
        const pts = [];
        if (mine) { const n = Math.min(nMy, HY); for (let k = n - 1; k >= 0; k--) pts.push([k, base[g] * d8(myPx[g * HY + ((nMy - 1 - k) % HY + HY) % HY])]); return pts; }
        const ago = host.year() - decAt; const nd = Math.min(nDec, HD); for (let k = nd - 1; k >= 0; k--) { if (k * 10 + ago < HY) break; pts.push([k * 10 + ago, base[g] * d8(hDec[g * HD + ((nDec - 1 - k) % HD + HD) % HD])]); }
        const n = Math.min(nYr, HY); for (let k = n - 1; k >= 0; k--) pts.push([k, base[g] * d8(hYr[g * HY + ((nYr - 1 - k) % HY + HY) % HY])]);
        return pts;
      },
      // what a realm makes and what comes to it from abroad, most valuable first (for the realm's panel)
      goodsOf(c) {
        const o = c * NG; const own = [], inn = [];
        for (let g = 1; g < NG; g++) { if (out[o + g] > 1e-6) own.push([g, out[o + g] * base[g]]); else if (imp[o + g] > 1e-6) inn.push([g, imp[o + g] * base[g]]); }
        own.sort((a, b) => b[1] - a[1]); inn.sort((a, b) => b[1] - a[1]); return { own: own.map(x => x[0]), imp: inn.map(x => x[0]) };
      },
      // how short a realm is of a good (0 = has all it wants, 1 = has none); and whether it brings any out of its own ground
      shortOf(c, g) { const nd = need[c * NG + g]; return nd > 1e-9 ? clamp(1 - (stock[c * NG + g] + got[c * NG + g]) / nd, 0, 1) : 0; },
      yields(c, g) { return rawPop[c * NG + g] > 0; },
      save() {
        const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
        const ids = []; for (let c = 0; c < MAXC; c++) if (civs[c]) ids.push(c);
        const REC = NG * 3 + NR * 2 + NC; const buf = new Uint8Array(ids.length * REC); const q16 = (v) => v > 0 ? clamp(Math.round((Math.log2(v) + 30) * 1000), 1, 65535) : 0;
        ids.forEach((c, n) => { let p = n * REC; for (let g = 0; g < NG; g++) { const v = q16(stock[c * NG + g]); buf[p++] = v & 255; buf[p++] = v >> 8; } for (let g = 0; g < NG; g++) buf[p++] = q8(px[c * NG + g]); for (let r = 0; r < NR; r++) { const v = q16(act[c * NR + r]); buf[p++] = v & 255; buf[p++] = v >> 8; } for (let k = 0; k < NC; k++) buf[p++] = Math.round(clamp(sat[c * NC + k], 0, 1) * 255); });
        return { v: 1, es, ids, state: b64(buf), util: ids.map(c => +util[c].toFixed(3)), ls: ids.map(c => +LS[c].toFixed(4)), hy: b64(hYr), hd: b64(hDec), hm: b64(myPx), n: [nYr, nDec, nMy, decAt], steps };
      },
      load(s) {
        stock.fill(0); px.fill(1); act.fill(0); sat.fill(0.6); LS.fill(0.6); util.fill(0); nbr.fill(null); linksAt = -1e9; hYr.fill(0); hDec.fill(0); myPx.fill(0); nYr = nDec = nMy = 0;
        if (!s || s.v !== 1) return false;
        const u8 = (str) => { const bin = atob(str); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
        es = s.es >>> 0; const buf = u8(s.state); const REC = NG * 3 + NR * 2 + NC; const d16 = (v) => v ? Math.pow(2, v / 1000 - 30) : 0;
        if (buf.length !== s.ids.length * REC) return false;      // (a save from a build with other goods or recipes: start the market afresh)
        s.ids.forEach((c, n) => { let p = n * REC; for (let g = 0; g < NG; g++) { stock[c * NG + g] = d16(buf[p] | (buf[p + 1] << 8)); p += 2; } for (let g = 0; g < NG; g++) px[c * NG + g] = g ? d8(buf[p++]) : (p++, 1); for (let r = 0; r < NR; r++) { act[c * NR + r] = d16(buf[p] | (buf[p + 1] << 8)); p += 2; } for (let k = 0; k < NC; k++) sat[c * NC + k] = buf[p++] / 255; LS[c] = s.ls && s.ls[n] !== undefined ? s.ls[n] : 0.6; util[c] = s.util ? s.util[n] || 0 : 0; });
        if (s.hy) hYr.set(u8(s.hy).subarray(0, hYr.length)); if (s.hd) hDec.set(u8(s.hd).subarray(0, hDec.length)); if (s.hm) myPx.set(u8(s.hm).subarray(0, myPx.length)); if (s.n) { nYr = s.n[0]; nDec = s.n[1]; nMy = s.n[2]; decAt = s.n[3] || 0; } steps = s.steps || 0;
        return true;
      },
    };
    return api;
  }

  window.ECON = { NG, NR, NC, NM, GOODS, ID, RECIPES, CATS, CAT, SECTORS, MAKES, USES, MADE_ORDER, PLACES, CAL, place, create, req, yieldOf, wants, W0 };
})();
