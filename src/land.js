// What the land feeds (window.LAND). The planet's land is of sixteen kinds (data/soil.png, made by tools/climate/soil.py from the
// climate's classes, where woods would stand, and what covers the land today by ESA WorldCover): the desert, farmed only where
// water is brought to it; the steppe and the grassland, which feed herds until the steel plough breaks their sod; the wet clay
// of the north, which waits for iron axes and the heavy plough; the Mediterranean, the irrigated valleys and the highlands of the
// tropics, farmed first; the paddies of monsoon Asia, the densest farmland of all. A cell feeds its farmland (the cropland of our
// own day, and the towns that stand on it) and a share of its pasture, times how intensely its kind of land is farmed in the
// realm's age, times what the realm's continent has to farm with: the Americas had no beast of the plough and their maize came
// late, Australia had neither crops nor herds, until the ships brought wheat, horses and cattle. People who live off the land
// without farming it find their food where game, fish and nuts are: the savanna, the grassland, the temperate woods, coasts
// and rivers. Pure data; the simulation (sim.js) asks it once a year for each realm and keeps the answers in flat arrays.
window.LAND = (() => {
  // the shape of each kind's farming through the ages (Stone .. Information), as a share of what it gives in the Renaissance
  const CURVES = {
    old: [0.3, 0.6, 0.8, 0.9, 1, 1, 1.2, 1.6, 1.8],              // the first farmland: irrigated valleys, the Mediterranean, the highlands of the tropics
    wood: [0.15, 0.25, 0.45, 0.55, 0.85, 1, 1.2, 1.6, 1.8],      // the wooded north: cleared with iron axes, its clay opened by the heavy plough
    grass: [0.1, 0.12, 0.15, 0.15, 0.2, 0.25, 0.8, 1.6, 1.8],    // grass and steppe: herds, until the steel plough and the railway
    tropic: [0.2, 0.3, 0.45, 0.5, 0.55, 0.6, 0.8, 1.5, 1.8],     // the wet and dry tropics of Africa and the Americas: the hoe, then fertiliser
    tasia: [0.2, 0.3, 0.6, 0.7, 0.8, 0.9, 1.1, 1.6, 1.8],        // the wet tropics of Asia: paddies from the Iron Age
  };
  // how intensely each kind's farmland is farmed (people a unit of it feeds in the Renaissance, against the others) and what it gives
  // people who do not farm. Measured, not chosen: tools/people/landfit.js runs the world and moves these until each of history's
  // regions holds its share of the world's people (Maddison's census, AD 1 to 1820), and writes them here.
  /* LAND:BEGIN */
  const FIT = { worlds: [0.5, 0.4], tundra: [0.3, 0.22], boreal: [0.6, 0.25], desert: [1.7, 0.09], steppe: [0.22, 0.3], grass: [0.45, 0.63], ocwood: [3.4, 0.55], medit: [3.8, 0.61], monsoon: [7, 0.65], savanna: [2.5, 0.9], rain: [0.8, 0.83], high: [1.4, 0.46], plateau: [0.81, 0.18], cowood: [0.3, 0.35], tasia: [1.65, 0.65] };
  /* LAND:END */
  // the kinds of land (data/soil.png red, its low four bits); past: how much of its pasture counts as farmland
  const K = (key, name, past, curve, text) => ({ key, name, I: FIT[key] ? FIT[key][0] : 0, past, forage: FIT[key] ? FIT[key][1] : 0, curve, text });
  const CLASSES = [
    K('sea', 'Sea', 0, 'old', ''),
    K('ice', 'Ice', 0, 'old', 'Nothing grows.'),
    K('tundra', 'Tundra', 0.15, 'wood', 'Reindeer and the short summer.'),
    K('boreal', 'Boreal forest', 0.05, 'wood', 'Dark forest and short summers: rye in the clearings.'),
    K('desert', 'Desert', 0.1, 'old', 'Farmed only where water is brought to it - and there, from the first canals, more richly than anywhere.'),
    K('steppe', 'Steppe', 0.25, 'grass', 'Dry grass: herds and horsemen, and grain where the rain allows.'),
    K('grass', 'Grassland', 0.25, 'grass', 'Deep black earth under a sod no wooden plough can break: herds, until the steel plough and the railway make it a breadbasket.'),
    K('ocwood', 'Temperate woods', 0.3, 'wood', 'Wet clay under oak and beech: iron axes clear it, the heavy plough opens it.'),
    K('medit', 'Mediterranean', 0.3, 'old', 'Light soils, dry summers: wheat, the vine and the olive, farmed from the first.'),
    K('monsoon', 'Monsoon farmland', 0.1, 'old', 'The rains of summer: rice and millet, two harvests a year, the densest farmland on Earth.'),
    K('savanna', 'Savanna', 0.2, 'tropic', 'A long dry season: sorghum and millet with the hoe, cattle where the fly allows.'),
    K('rain', 'Rainforest', 0.1, 'tropic', 'Thin red soils under the forest: a field for a few years, then the forest again.'),
    K('high', 'Tropical highlands', 0.3, 'old', 'Cool and well watered above the heat: terraces of maize, potatoes and teff.'),
    K('plateau', 'High plateau', 0.3, 'grass', 'Thin air and cold: barley, yaks and llamas.'),
    K('cowood', 'Continental woods', 0.2, 'wood', 'Long winters and a short year to grow in: rye, oats and the forest.'),
    K('tasia', 'Tropical Asia', 0.1, 'tasia', 'Heat and rain all year: paddies in the valleys, gardens and groves under the palms.'),
  ];
  const NC = CLASSES.length, NA = 9;
  // the table the simulation reads: [class * NA + age]: what a unit of farmland gives in that age, against the first farmland (the
  // simulation's table of food, by knowledge, is how farming as a whole grows: these say only how each kind keeps pace with it)
  const TAB = new Float32Array(NC * NA); CLASSES.forEach((K, k) => { for (let a = 0; a < NA; a++) TAB[k * NA + a] = K.I * CURVES[K.curve][a] / CURVES.old[a]; });
  const PAST = new Float32Array(CLASSES.map((K) => K.past)), FORAGE = new Float32Array(CLASSES.map((K) => K.forage));
  // what a unit of farmland of class k gives a realm a fraction f of the way from age a to the next
  const at = (k, a, f) => { const b = k * NA + a; return a >= NA - 1 ? TAB[b] : TAB[b] + (TAB[b + 1] - TAB[b]) * f; };
  // the continents' crops and beasts: 0 the old world, 1 the Americas, 2 Australia and the islands beyond it
  const WORLDS = [{ key: 'old', name: 'the old world', f: 1 }, { key: 'americas', name: 'the Americas', f: FIT.worlds[0] }, { key: 'sahul', name: 'Australia', f: FIT.worlds[1] }];
  const worldAt = (lon, lat) => (lon < -30 && lon > -170 ? 1 : (lon > 112 && lat < -10.5 && lat > -48) || (lon > 165 && lat < -33 && lat > -48) ? 2 : 0);
  return { CLASSES, CURVES, NC, NA, TAB, PAST, FORAGE, at, WORLDS, worldAt };
})();
