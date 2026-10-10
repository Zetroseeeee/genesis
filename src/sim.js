// GENESIS world simulation (classic script; exposes window.createSim)

// ============================================================================
// GENESIS world simulation. Pure logic, no DOM: the page (and a headless test) drive it.
// Grid: 720x360 cells (0.5 degrees), x wraps, row 0 = 90N.
// ============================================================================
function createSim(world, seed) {
  const W = 720, H = 360, N = W * H;
  const MAXC = 512;
  const ECON = window.ECON;      // goods, recipes and the market (econ.js, loaded before this file)
  const KNOW = window.KNOW;      // discoveries (know.js, loaded before this file)
  const RULE = window.RULE;      // forms of government, laws and estates (rule.js, loaded before this file)
  const DIPLO = window.DIPLO;    // pacts, causes of war and terms of peace (diplo.js, loaded before this file)
  const ARMY = window.ARMY;      // hosts and fleets (army.js, loaded before this file)
  const PEOPLE = window.PEOPLE;  // who lives where, in what tongue (people.js, loaded before this file)
  const FAITH = window.FAITH;    // who believes what, and where the holy cities are (faith.js, loaded before this file)
  const CULTURE = window.CULTURE;      // great people, great works, renown (culture.js, loaded before this file)
  const FINANCE = window.FINANCE;      // coin, credit, banking houses, companies, panics (finance.js, loaded before this file)
  const DYNASTY = window.DYNASTY;      // the people who rule, their families and houses (dynasty.js, loaded before this file)
  const STORY = window.STORY;      // the stories that come before a realm's court (story.js; a tool that does not load it runs without them)
  const LEGACY = window.LEGACY;      // what a people is remembered for: the ambitions of every age, the world's firsts (legacy.js; likewise)
  const INTRIGUE = window.INTRIGUE;      // spies and schemes (intrigue.js; likewise)
  const DISEASE = window.DISEASE;      // pestilence that travels (disease.js; likewise)
  const LAND = window.LAND;      // what the land feeds (land.js; a tool that does not load it, or a world without data/soil.png, feeds by the old map)
  const CLIMATE = window.CLIMATE;      // the ice, the green Sahara, droughts and good years (climate.js; only in a world whose land has kinds)
  const { land, fert, elev, flags } = world;   // land Uint8, fert Float32 0..1, elev Uint8, flags Uint8 (1 land,2 river,4 coast,8 ice)

  // ---------- RNG ----------
  let rs = seed >>> 0;
  const rnd = () => { rs += 0x6D2B79F5; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rint = (n) => Math.floor(rnd() * n);
  const pick = (a) => a[rint(a.length)];

  // ---------- cell state ----------
  const pop = new Float32Array(N);       // thousands of people
  const owner = new Int16Array(N).fill(-1);
  const infra = new Uint8Array(N);       // 0..5 development
  const walls = new Uint8Array(N);       // 0..3
  const special = new Uint16Array(N);    // 1 port, 2 academy, 4 temple, 8 market, 16 wonder (bits 5-8: the era the wonder was raised in), 512 mine
  const level = new Uint8Array(N);       // settlement level 0..4
  const peak = new Uint8Array(N);        // the most people a town ever held (log-quantised, as in save()); sizes its ruins
  const slotA = new Uint16Array(N);      // where the player (or the AI) put each work, 4 bits each: temple | academy<<4 | market<<8 | wonder<<12 (0 = unplaced, else slot+1)
  const slotB = new Uint8Array(N);       // mine slot (+1) in the low nibble
  const gBand = new Uint8Array(N), gPrev = new Uint8Array(N); const gYear = new Int32Array(N).fill(-1e9); // a town's size band now, the band before, and when it changed: the planner builds the new ring over the years after
  // (a band and a peak are logarithms of how many live there, asked of every settlement every year: so each cell remembers between which
  //  numbers its band stays what it is, and above which its peak would rise, a hair inside the true bounds, and the logarithm is only
  //  taken outside them. Whatever else writes gBand or peak must forget these: recount() does)
  const bandLo = new Float32Array(N), bandHi = new Float32Array(N), peakAt = new Float32Array(N);
  const works = new Map();               // cell -> [{ k, slot, start, dur }]: what is under construction there
  const bonusFert = new Float32Array(N); // god bounty etc
  const siteU = new Float32Array(N).fill(-1), siteV = new Float32Array(N); // settlement position within cell (0..1), -1 unset
  const cellName = new Map();
  // ---------- the living world: things that happen to the land itself ----------
  const cellOf = (lon, lat) => { const x = Math.floor((lon + 180) / 360 * W), y = Math.floor((90 - lat) / 180 * H); return Math.max(0, Math.min(H - 1, y)) * W + (((x % W) + W) % W); };
  // real volcanoes (lon, lat, name, power 1..3)
  const VOLCANOES = [[14.43, 40.82, 'Vesuvius', 2], [15.0, 37.75, 'Etna', 2], [25.4, 36.4, 'Thera', 3], [138.73, 35.36, 'Fuji', 2], [105.42, -6.1, 'Krakatoa', 3], [118.0, -8.25, 'Tambora', 3], [120.35, 15.13, 'Pinatubo', 3], [-122.19, 46.2, 'St Helens', 2], [-155.29, 19.41, 'Kilauea', 1], [-19.67, 63.99, 'Hekla', 2], [-98.62, 19.02, 'Popocatépetl', 2], [29.25, -1.52, 'Nyiragongo', 1], [110.44, -7.54, 'Merapi', 2], [-78.44, -0.68, 'Cotopaxi', 2], [-70.9, -37.85, 'Antuco', 1], [158.03, 56.06, 'Klyuchevskaya', 2], [-121.76, 46.85, 'Rainier', 2], [-91.55, 14.47, 'Fuego', 1], [40.67, 13.6, 'Erta Ale', 1], [-23.6, 65.0, 'Laki', 3], [125.4, 2.78, 'Awu', 2], [167.83, -15.39, 'Ambrym', 1], [-17.63, 28.57, 'Teide', 1], [130.66, 31.59, 'Sakurajima', 1], [-62.18, 16.72, 'Soufrière', 1], [145.04, -5.53, 'Manam', 1], [43.33, -11.75, 'Karthala', 1], [-160.1, 54.75, 'Aniakchak', 2], [177.18, -37.52, 'Whakaari', 1], [36.0, -3.07, 'Ol Doinyo Lengai', 1]];
  const volcanoes = VOLCANOES.map(([lon, lat, name, power]) => ({ lon, lat, name, power, cell: cellOf(lon, lat), erupting: -1e9, strength: 0, last: -1e9 }));
  // fault belts as polylines (lon, lat): where earthquakes happen
  const FAULTS = [[[141, 45], [142, 40], [141, 36], [138, 34], [134, 33], [131, 31]], [[122, 25], [121, 22], [124, 13], [126, 8]], [[95, 5], [100, -2], [104, -5], [110, -8], [116, -9], [122, -9], [128, -3]], [[-123, 49], [-122, 46], [-124, 42], [-122, 38], [-118, 34], [-116, 32]], [[-105, 20], [-100, 17], [-95, 16], [-90, 14], [-86, 12]], [[-80, 1], [-78, -3], [-77, -10], [-72, -16], [-70, -22], [-71, -30], [-72, -36], [-73, -42]], [[172, -43], [175, -40], [177, -38]], [[12, 44], [14, 42], [16, 40], [16, 38], [20, 38], [22, 37], [26, 38], [30, 40], [36, 38], [40, 39], [44, 38], [49, 35], [53, 36], [60, 30], [66, 30], [71, 34], [76, 33], [80, 29], [85, 28], [90, 27], [95, 27], [96, 22]], [[36, 12], [36, 6], [36, 0], [30, -4], [34, -8], [34, -14]], [[160, 55], [156, 52], [150, 47], [146, 44]], [[-150, 60], [-160, 55], [-170, 53], [180, 52]], [[-25, 64], [-18, 65]], [[72, 40], [74, 42], [78, 43], [86, 44], [95, 42]]];
  const fires = [], floods = [], quakes = [], battles = [], plagues = []; let comet = -1e9;
  const ruins = new Map();   // cell -> { year, era, culture, R (m), wonder: era+1 or 0 }
  const rubble = new Map();  // cell -> year of the last earthquake
  const landIdx = [];
  for (let i = 0; i < N; i++) if (land[i]) landIdx.push(i);
  const LI = Int32Array.from(landIdx);
  const perm = Int32Array.from(landIdx);
  const shufflePerm = () => { for (let i = perm.length - 1; i > 0; i--) { const j = rint(i + 1); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; } };
  shufflePerm();

  // ---------- goods: what the land yields (econ.js lays them out; the market further down prices and trades them) ----------
  // goods[i]: the good of a cell (0 = none).  gera[i]: the age in which that place begins to yield it.  wood[i]: how much
  // timber any inhabited cell gives beside its own good (every country has some wood and stone; the sea gives salt).
  const GOODS = ECON.GOODS, GOOD_ID = ECON.ID, NG = ECON.NG, NC = ECON.NC, CAT = ECON.CAT;
  const { goods, gera, wood } = ECON.place(world, W, H);
  const G_TIMBER = GOOD_ID.timber, G_STONE = GOOD_ID.stone, G_SALT = GOOD_ID.salt;
  const STRAT_RAW = []; GOODS.forEach((g, k) => { if (g && g.raw && g.kind === 'strategic') STRAT_RAW.push(k); });

  const cosLat = new Float32Array(H);
  for (let y = 0; y < H; y++) cosLat[y] = Math.max(0.08, Math.cos((90 - (y + 0.5) / H * 180) * Math.PI / 180));
  const cellDist = (a, b) => { // in cells, roughly
    const ya = (a / W) | 0, xa = a - ya * W, yb = (b / W) | 0, xb = b - yb * W;
    let dx = Math.abs(xa - xb); if (dx > W / 2) dx = W - dx; dx *= (cosLat[ya] + cosLat[yb]) * 0.5;
    const dy = ya - yb; return Math.sqrt(dx * dx + dy * dy);
  };

  // ---------- the land: what each cell feeds (land.js, data/soil.png) ----------
  // A cell feeds its farmland (and a share of its pasture), as large as the cell is (a cell shrinks toward the poles), times how
  // intensely its kind of land is farmed in its realm's age and what its continent has to farm with (landK, a realm's row of
  // it made once a year); people who do not farm live off what it gives them (forA). A world made before the land had kinds (a
  // save without `land`) feeds by the old map's greenness and the table it was saved under: an update must not starve anyone.
  const soil = world.soil, LM = !!(LAND && soil); let landOn = LM;
  const NLC = LAND ? LAND.NC : 1, NLA = LAND ? LAND.NA : 1;
  const kcls = new Uint8Array(N), farmA = new Float32Array(N), forA = new Float32Array(N), homeW = new Float32Array(N);
  const landK = new Float32Array(MAXC * NLC), wfOf = new Float32Array(MAXC).fill(1);
  const roomKey = new Uint32Array(MAXC), roomCell = new Int32Array(MAXC).fill(-1);      // (each realm's far land with room for emigrants this year)      // (and what each realm's continent farms with: 1 the old world's beasts and crops)
  const RCF = new Float32Array([1, 1, 1.25, 1.25, 1.15, 1.15, 1.35, 1.35]);      // (by a cell's river and coast bits: water to drink, fish, boats)
  let LSCALE = 1, WSCALE = 1;
  let HV = null, ICE = null;      // (this year's harvest of every cell against an ordinary year's, and whether the ice still lies on it: climate.js, made below)
  if (LM) {
    let oldK = 0, newK = 0, oldW = 0, newW = 0; const pot = [];
    for (const i of LI) {
      const y = (i / W) | 0, area = cosLat[y], r = soil[i * 3], k = r & 15; kcls[i] = k;
      const tree = (r >> 4) / 15, farm = soil[i * 3 + 1] / 255, past = soil[i * 3 + 2] / 255;
      if (flags[i] & 8) continue;
      farmA[i] = area * (farm + LAND.PAST[k] * past);
      forA[i] = area * LAND.FORAGE[k] * (0.15 + farm + past + 0.6 * tree) * ((flags[i] & 2) ? 1.5 : 1) * ((flags[i] & 4) ? 1.3 : 1);
      // (the old map's capacity at the Middle Ages and for bands that do not farm, to put the new one on the same footing: the table of food stays true)
      oldK += fert[i] * ((flags[i] & 2) ? 4 : (flags[i] & 4) ? 1.3 : 1); newK += farmA[i] * LAND.TAB[k * NLA + 4] * RCF[flags[i] & 6];
      oldW += fert[i] * ((flags[i] & 2) ? 1.6 : (flags[i] & 4) ? 1.3 : 1); newW += forA[i];
      const lon = ((i % W) + 0.5) / W * 360 - 180, lat = 90 - (y + 0.5) / H * 180;
      const wf = LAND.WORLDS[LAND.worldAt(lon, lat)].f; homeW[i] = farmA[i] * LAND.TAB[k * NLA + 1] * RCF[flags[i] & 6] * wf * wf; if (fert[i] > 0.05) pot.push(homeW[i]);      // (the first farmers of the Americas came late: maize took millennia)
    }
    LSCALE = newK > 0 ? oldK / newK : 1; WSCALE = newW > 0 ? oldW / newW : 1;
    // (where bands settle down as a people: as many places as the old map had good land, the best for the first farmers of the Bronze Age)
    let good = 0; for (const i of LI) if (fert[i] > 0.5 && !(flags[i] & 8)) good++;
    pot.sort((a, b) => b - a); const thr = pot[Math.min(pot.length - 1, Math.max(0, good))] || 1;
    for (const i of LI) homeW[i] = Math.min(1.2, 0.5 * homeW[i] / thr);
  }
  const forA0 = LM ? forA.slice() : null;      // (what the land gives those who do not farm, before the wet centuries greened the dry lands: climate.js)
  const homeOf = (i) => (landOn ? (ICE !== null && ICE[i] ? 0 : homeW[i]) : fert[i]);
  const COAST = Int32Array.from(landIdx.filter((i) => (flags[i] & 4) && !(flags[i] & 8)));      // (the shores of the world, for ships that cross oceans)

  // ---------- eras & tech ----------
  const ERAS = ['Stone Age', 'Bronze Age', 'Iron Age', 'Classical', 'Medieval', 'Renaissance', 'Industrial', 'Modern', 'Information Age'].map((n, k) => [n, KNOW.ERA_AT[k]]);
  const eraOf = (t) => { let e = 0; for (let k = 0; k < ERAS.length; k++) if (t >= ERAS[k][1]) e = k; return e; };
  // keep a realm's era in step with its knowledge (called wherever tech changes); announces the new age
  function syncEra(cv, c) {
    const e = eraOf(cv.tech); if (e === cv.era) return;
    cv.era = e; cv.eraSince = year; logEvent(cv, `${fullName(cv)} enters the ${ERAS[e][0]}`, (c >= 0 && cellsOf[c] > 30) || cv.player);
  }
  const lerpTable = (T, t) => { if (t <= T[0][0]) return T[0][1]; for (let k = 1; k < T.length; k++) if (t <= T[k][0]) { const [a, va] = T[k - 1], [b, vb] = T[k]; return va + (vb - va) * (t - a) / (b - a); } return T[T.length - 1][1]; };
  // how many people a unit of land feeds, by knowledge. Measured, not chosen: tools/know/people.js runs the world and
  // moves the table until the people on Earth are as many as history counted, century by century (5 million in 8000 BC,
  // 220 at the turn of the era, 970 in 1800, 6,140 in 2000).
  /* FOOD:BEGIN */
  const FOOD = [[0, 0.00499], [0.04, 0.00972], [0.08, 0.0289], [0.13, 0.0706], [0.18, 0.107], [0.24, 0.167], [0.3, 0.212], [0.36, 0.293], [0.42, 0.299], [0.49, 0.382], [0.55, 0.523], [0.6, 0.74], [0.66, 1.26], [0.73, 2.04], [0.8, 2.42], [0.86, 4.08], [0.92, 6.54], [1, 9.51]];
  /* FOOD:END */
  // how fast a people can grow where there is room: a little faster as it learns, and much faster in the last ages
  // (the land's limit is then the only brake, as it was once children stopped dying)
  const growOf = (t) => 0.006 + t * 0.02 + (t > 0.66 ? Math.min(0.016, (t - 0.66) / 0.24 * 0.016) : 0);
  // A world saved before there were laws was fed by the table of its day (0.15), and keeps it: an update must not starve anyone's people.
  const FOOD_015 = [[0, 0.00527], [0.04, 0.0118], [0.08, 0.0277], [0.13, 0.0672], [0.18, 0.107], [0.24, 0.197], [0.3, 0.224], [0.36, 0.23], [0.42, 0.239], [0.49, 0.411], [0.55, 0.551], [0.6, 0.944], [0.66, 1.66], [0.73, 2.97], [0.8, 4.23], [0.86, 8.88], [0.92, 11.1], [1, 12.5]];
  // A world saved before the land had kinds (0.37 and before) keeps the table of 0.37 and the old map (see landOn).
  const FOOD_037 = [[0, 0.00508], [0.04, 0.0108], [0.08, 0.0253], [0.13, 0.0587], [0.18, 0.0894], [0.24, 0.155], [0.3, 0.191], [0.36, 0.223], [0.42, 0.227], [0.49, 0.351], [0.55, 0.472], [0.6, 0.753], [0.66, 1.32], [0.73, 2.29], [0.8, 3.1], [0.86, 6.42], [0.92, 8.57], [1, 10.2]];
  let foodTab = FOOD;
  const foodMult = (t) => lerpTable(foodTab, t);
  // per-civ food multiplier, refreshed every tick (tech only changes between ticks)
  const fmOf = new Float32Array(MAXC).fill(lerpTable(FOOD, 0.02)); let FM0 = lerpTable(FOOD, 0); const growR = new Float32Array(MAXC);      // (what a realm's land feeds, and how fast its people grow, this year)
  // knowledge gained in a year, by age, before what a realm adds to it (towns, academies, scholars, what it knows).
  // Set by tools/know/pace.js so that the realms in front keep history's dates: bronze about 3300 BC, iron 1200 BC,
  // the classical world 500 BC, the middle ages AD 500, 1400, 1760, 1900, 1970.
  /* RATE:BEGIN */
  const RATE = [0.00000602, 0.0000348, 0.000112, 0.0000692, 0.0000705, 0.000138, 0.000458, 0.000711, 0.000556];
  /* RATE:END */
  const techRate = (t) => RATE[eraOf(t)];
  // History's own dates: the knowledge the first realm had reached by each year. A realm ahead of that gropes in the dark
  // (a quarter of an age ahead, it learns half as fast); the realms in front of a world that has fallen behind find
  // what its time is ripe for (as much faster). So every world keeps roughly to the calendar, whoever leads it.
  const HIST = [[-10000, 0.035], [-3300, 0.08], [-1200, 0.18], [-500, 0.30], [500, 0.42], [1400, 0.55], [1760, 0.66], [1900, 0.80], [1970, 0.92], [2030, 1]];
  const AHEAD = 0.03; let frontTech = 0;      // (frontTech: the most learned realm's knowledge as this year began)
  // A world that was saved before history kept a calendar may be far ahead of it. Its calendar is set forward by as many years as
  // its first realm was ahead when it was loaded, once and for good (calShift, saved with the world): its ages go on from where they are.
  let calShift = 0;
  const histYearOf = (t) => { if (t <= HIST[0][1]) return HIST[0][0]; for (let k = 1; k < HIST.length; k++) if (t <= HIST[k][1]) { const [ya, ta] = HIST[k - 1], [yb, tb] = HIST[k]; return Math.round(ya + (yb - ya) * (t - ta) / (tb - ta)); } return HIST[HIST.length - 1][0]; };
  const timeF = (t) => { const d = t - lerpTable(HIST, year + calShift); return d > 0 ? 1 / (1 + d / AHEAD) : t >= frontTech - 0.004 ? 1 + Math.min(2, -d / AHEAD) : 1; };
  // how much of the gap to a more learned neighbour closes in ten years, by the neighbour's age: slowly while knowledge
  // walks, faster once it is printed, wired and broadcast
  const SPREAD = [0.024, 0.024, 0.03, 0.03, 0.035, 0.05, 0.1, 0.2, 0.3];
  // how readily a realm that rules itself goes to war with a neighbour it is stronger than, each time it looks about it (every ten years): times its
  // ruler's temper, and what diplo.js makes of the reason it could give and of what it thinks of them (see "new wars" in the tick)
  const WAR_RATE = 0.16; const foes = [];
  // (in a world whose land has kinds the early realms lie further apart, among foragers and herders, and the late ones crowd together: the
  //  appetite of each age is set so that the world fights as often as it did before, age by age - tools/diplo/probe.js)
  const WAR_AGE = [1.5, 1.6, 1.5, 1.35, 1.25, 1.0, 0.75, 0.72, 0.72];
  const SCHOLARS = 0.04;      // coin a thousand people pay in a year for each step of Research above 1 (and keep, below it)
  const seaRange = (t) => t < 0.22 ? 0 : 3 + Math.pow((t - 0.22) / 0.5, 2) * 85;
  const reachOf = (t) => 2.5 + t * 95; // max distance from capital, cells

  // ---------- names ----------
  const STYLES = [
    { k: 'latinic', on: ['b', 'c', 'd', 'f', 'g', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'cl', 'tr'], vow: ['a', 'e', 'i', 'o', 'u'], end: ['us', 'a', 'um', 'ia', 'is', 'o', 'ium', 'ae', 'ar'] },
    { k: 'norse', on: ['b', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'r', 's', 't', 'v', 'th', 'sk', 'br', 'gr', 'hr'], vow: ['a', 'e', 'i', 'o', 'u', 'ei', 'au'], end: ['heim', 'vik', 'gard', 'stad', 'holm', 'r', 'n', 'd', 'mark'] },
    { k: 'semitic', on: ['b', 'd', 'h', 'k', 'l', 'm', 'n', 'q', 'r', 's', 'sh', 't', 'z', 'kh', 'y'], vow: ['a', 'i', 'u', 'e'], end: ['ar', 'im', 'on', 'ah', 'ur', 'esh', 'ad', 'an', 'el'] },
    { k: 'sinitic', syl: ['shan', 'li', 'wu', 'han', 'zhou', 'jin', 'yan', 'qi', 'lu', 'wei', 'chu', 'song', 'tai', 'hai', 'lin', 'ming', 'xu', 'guo', 'bei', 'nan', 'da', 'xi', 'long', 'he', 'yue'] },
    { k: 'bantu', on: ['b', 'd', 'g', 'k', 'l', 'm', 'n', 'ng', 'ny', 's', 't', 'w', 'z', 'mb', 'nd', 'nk'], vow: ['a', 'e', 'i', 'o', 'u'], end: ['a', 'i', 'o', 'e', 'u', 'ala', 'ongo', 'imba'] },
    { k: 'polynesian', on: ['h', 'k', 'l', 'm', 'n', 'p', 't', 'w', 'r', 'ng', 'f', 'v'], vow: ['a', 'e', 'i', 'o', 'u'], end: ['a', 'i', 'u', 'o', 'e', 'ai', 'ao', 'nui'] },
    { k: 'turkic', on: ['b', 'd', 'g', 'k', 'l', 'm', 'n', 'r', 's', 't', 'y', 'z', 'ch', 'sh', 'kh'], vow: ['a', 'e', 'i', 'o', 'u', 'ü', 'ö'], end: ['an', 'uk', 'ay', 'er', 'ut', 'al', 'ir', 'ag', 'khan'] },
    { k: 'nahuatl', syl: ['tla', 'tzin', 'coa', 'xo', 'chi', 'pan', 'cal', 'mi', 'te', 'no', 'ya', 'hua', 'tec', 'tzal', 'cui', 'pil', 'tlan', 'mex', 'ato', 'qui', 'ma', 'zo'] },
    { k: 'hellenic', on: ['th', 'k', 'p', 'd', 'l', 'm', 'n', 'r', 's', 'x', 'ph', 'ch', 'kr', 'st'], vow: ['a', 'e', 'i', 'o', 'y'], end: ['os', 'on', 'ia', 'es', 'is', 'ae', 'eus', 'polis'] },
    { k: 'indic', on: ['b', 'ch', 'd', 'dh', 'g', 'j', 'k', 'kh', 'm', 'n', 'p', 'r', 's', 'sh', 't', 'v'], vow: ['a', 'i', 'u', 'e', 'o', 'aa'], end: ['a', 'pur', 'nagar', 'i', 'ka', 'ra', 'ta', 'vati'] },
    { k: 'celtic', on: ['b', 'c', 'd', 'g', 'l', 'm', 'n', 'r', 'br', 'gw', 'll', 'rh', 'dr'], vow: ['a', 'e', 'i', 'o', 'u', 'y', 'ae'], end: ['an', 'wyn', 'och', 'ath', 'en', 'ydd', 'ric', 'mor'] },
    { k: 'nilotic', on: ['ach', 'ok', 'd', 'k', 'l', 'm', 'n', 'ny', 'r', 't', 'w', 'ng'], vow: ['a', 'e', 'i', 'o', 'u'], end: ['ok', 'ol', 'ang', 'uk', 'ar', 'ath', 'ur', 'et'] },
  ];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function makeName(st, minS, maxS) {
    const S = STYLES[st];
    const n = minS + rint(maxS - minS + 1);
    if (S.syl) { let s = ''; for (let i = 0; i < n; i++) s += pick(S.syl); return cap(s); }
    let s = '';
    for (let i = 0; i < n; i++) s += pick(S.on) + pick(S.vow);
    if (rnd() < 0.85) s += pick(S.end); else s += pick(S.on);
    s = s.replace(/(.)\1\1/g, '$1$1');
    return cap(s);
  }
  function styleFor(i) { // loosely regional flavour
    const y = (i / W) | 0, x = i - y * W, lat = 90 - (y + 0.5) / H * 180, lon = (x + 0.5) / W * 360 - 180;
    let c;
    if (lon < -30) c = lat > 20 ? [7, 10, 5] : [7, 7, 5];
    else if (lon < 60) { if (lat > 55) c = [1, 10, 1]; else if (lat > 34) c = [0, 8, 10, 1]; else if (lat > 12) c = [2, 2, 8]; else c = [4, 11, 4]; }
    else if (lon < 100) { if (lat > 40) c = [6, 6, 1]; else c = [9, 9, 2, 6]; }
    else if (lon < 150) { if (lat > 20) c = [3, 3, 6]; else c = [5, 9, 3]; }
    else c = [5, 5, 7];
    return pick(c);
  }
  let rule = null;      // (how each realm is governed: made further down, once the counts it reads exist)
  let diplo = null;     // (what realms have sworn to one another, and why they fight: likewise)
  let army = null;      // (the hosts in the field and the fleets at sea: army.js)
  let people = null;    // (the peoples of the world and their tongues: people.js)
  let faith = null;     // (the faiths of the world, and where they are held: faith.js)
  let culture = null;   // (great people, their works and the renown of realms: culture.js)
  let finance = null;   // (coin, debts, banking houses, companies and panics: finance.js)
  let dynasty = null;   // (the people who rule, their houses, and who comes after them: dynasty.js)
  let story = null;     // (what comes before a realm's court, and what its ruler chooses: story.js)
  let legacy = null;    // (what each realm will be remembered for: legacy.js)
  let intrigue = null;    // (its spies and schemes: intrigue.js)
  let disease = null;    // (its sicknesses: disease.js)
  let storiesOn = true;      // (the player's: the page's setting)
  function fullName(c) { return rule ? rule.fullName(c) : c.name; }
  function religionName(st) {
    const base = makeName(st, 1, 2);
    return pick([`${base}ism`, `the Way of ${base}`, `the ${base} Faith`, `Cult of ${base}`, `${base}an Creed`, `Church of ${base}`]);
  }
  function fmtYear(y) { return y < 0 ? `${(-y).toLocaleString()} BC` : `${y} AD`; }

  // ---------- civs ----------
  const civs = new Array(MAXC).fill(null);
  const freeIds = [];
  for (let c = MAXC - 1; c >= 0; c--) freeIds.push(c);
  const popOf = new Float32Array(MAXC), cellsOf = new Int32Array(MAXC), strengthOf = new Float32Array(MAXC), mightOf = new Float32Array(MAXC);      // (strengthOf: how good a realm's arms are; mightOf: its arms and its numbers: see strength)
  const acad = new Int32Array(MAXC), temples = new Int32Array(MAXC), ports = new Int32Array(MAXC), markets = new Int32Array(MAXC), wonders = new Int32Array(MAXC), mines = new Int32Array(MAXC), townsOf = new Int32Array(MAXC), bestCell = new Int32Array(MAXC), bestPop = new Float32Array(MAXC);
  const townPick = new Int32Array(MAXC).fill(-1), townKey = new Uint32Array(MAXC);      // (a town of each realm, a different one every year by a hash of the place and the year: where a great person is born, culture.js)
  const lostSeat = new Int32Array(MAXC).fill(-1), seatAt = new Int32Array(MAXC), seatPop = new Float32Array(MAXC);      // (reseat: a capital taken this year)
  const contact = new Uint16Array(MAXC * MAXC);
  // what the market needs to know of each realm: the people living on each raw good's land (mines counted over), whether
  // it holds such land at all (known to it or not), its townspeople, and up to four of its harbours
  const rawPop = new Float32Array(MAXC * NG), held = new Uint8Array(MAXC * NG), urban = new Float32Array(MAXC), portCells = new Int32Array(MAXC * 4).fill(-1);
  const worldEvents = [];
  let year = -10000, civCount = 0, tickCount = 0, player = -1;
  const st = { year, civCount, player };
  // the weather (climate.js): the ice that still lies over the north, the dry lands green in the wet centuries, the great droughts
  // and colds history remembers and every year's own, in a world whose land has kinds. The green Sahara feeds herdsmen as a
  // savanna would (forage), and gives it back as it dries.
  const climate = CLIMATE && LM ? CLIMATE.create({ W, H, LI, kcls, year: () => year, seed, owner }) : null;
  if (climate) { HV = climate.hv; ICE = climate.ice; }
  const greenAdd = new Float32Array(climate ? climate.greenCells.length : 0); let wetVer = -1;
  if (climate) climate.greenCells.forEach((i, k) => { greenAdd[k] = cosLat[(i / W) | 0] * LAND.FORAGE[10] * 0.65 * ((flags[i] & 2) ? 1.5 : 1) * ((flags[i] & 4) ? 1.3 : 1); });
  function applyWet() { if (!climate) return; wetVer = climate.wetVer; const G = climate.greenCells, wet = climate.wet; for (let k = 0; k < G.length; k++) { const i = G[k]; forA[i] = forA0[i] + wet[i] * greenAdd[k]; } }
  applyWet();
  const relief = new Float32Array(MAXC), hvSum = new Float32Array(MAXC), hvPop = new Float32Array(MAXC), starved = new Float32Array(MAXC);      // (what softens a famine in each realm; its harvest, weighed by its people; who starved this year)
  const FAMINE = 0.25;      // (of those a bad year's land no longer feeds, the share that die of it within the year where nothing softens it)
  const iced = (i) => ICE !== null && landOn && ICE[i] === 1;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const CROP = new Float32Array(NG); for (let g = 1; g < NG; g++) { const G = ECON.GOODS[g]; if (G) CROP[g] = G.crop || (G.key === 'cattle' ? 0.6 : 0); }      // (how much of a good is a harvest: grain all of it, fish half, cattle some)

  function hue(id) { const h = (id * 137.508) % 360; return h; }
  function hsl2rgb(h, s, l) {
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)];
  }
  function eventType(text) {
    if (/declares war|wins its war|make peace|takes .* from|falls to/.test(text)) return 'war';
    if (/takes the throne|is elected/.test(text)) return 'ruler';
    if (/plague|Fire falls|Famine|meteor|uprising|coup|revolt|shakes/.test(text)) return 'disaster';
    if (/enters the|golden age/i.test(text)) return 'era';
    if (/prophet|adopts|takes up|forsakes|faithful|holy city|teaching|Faith|Way of|Cult|Creed|Church|Rites|Mysteries|ism\b/.test(text)) return 'faith';
    if (/breaks? away|independence|becomes .* of|is no more|settle|arrive|found/.test(text)) return 'state';
    return 'city';
  }
  function pushWorld(e) { worldEvents.push(e); if (worldEvents.length > 600) worldEvents.splice(0, worldEvents.length - 600); }
  function pushOwn(c, e) { c.events.push(e); if (c.events.length > 80) c.events.splice(0, c.events.length - 80); }
  let evSeq = 0; // every event gets a running number, so the page can ask "what happened since I last looked"
  function logEvent(c, text, important, type, loc) {
    const e = { year, text, type: type || eventType(text), loc: loc !== undefined ? loc : c.capital, civ: c.id, seq: ++evSeq };
    pushOwn(c, e);
    if (important || c.player) pushWorld({ ...e, mine: !!c.player });
    allEvents.push(e); if (allEvents.length > 6000) allEvents.splice(0, 1000);
  }
  const allEvents = [];
  function newCiv(home, opts = {}) {
    if (!freeIds.length) return null;
    const id = freeIds.pop();
    // (its tongue's kind is the place's, drawn as it always was; the people it is of is one that lives there, or one of that
    // tongue gone out from its neighbours, or a new one: people.js)
    const drawn = opts.style ?? styleFor(home); if (people) people.prepare(home, drawn);
    const st0 = people ? people.styleAt(home) : -1; const style = opts.style ?? (st0 >= 0 ? st0 : drawn);      // (a realm of a known people is named in its tongue)
    const name = opts.name || (st0 >= 0 && people.realmName(home)) || makeName(style, 2, 3);
    const rgb = hsl2rgb(hue(id + 1), 0.62 + rnd() * 0.2, 0.5 + rnd() * 0.15);
    const c = {
      id, name, style, rgb, color: `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`,
      tech: opts.tech ?? 0.02 + rnd() * 0.02, era: 0, gov: 'band', capital: home, home, founded: year,
      aggression: 0.2 + rnd() * 0.8, expansion: 0.5 + rnd() * 0.9, stability: 1, wealth: 0, income: 0,
      wars: {}, truce: {}, religion: null, ruler: null, rulers: [], events: [], alive: true,
      player: !!opts.player, policy: { research: 1, military: 1, tax: 1, stance: 'steady' }, army: -99999,
      warStart: {}, cellsAtWar: {}, peakCells: 1, lastCapital: year, eraSince: year - 500,
    };
    c.era = eraOf(c.tech);
    civs[id] = c; civCount++; st.civCount = civCount; lastNb[id] = null; nearNb[id] = null; warCnt[id] = -1;
    know.born(id, opts.from === undefined ? -1 : opts.from, c.tech); rule.born(id, c, opts.from === undefined ? -1 : opts.from); diplo.born(id, c, opts.from === undefined ? -1 : opts.from); fmOf[id] = fmNow(c);
    for (let k = 0; k < MAXC; k++) { contact[k * MAXC + id] = 0; contact[id * MAXC + k] = 0; const l = lastNb[k]; if (l) { const j = l.indexOf(id); if (j >= 0) l.splice(j, 1); } const l2 = nearNb[k]; if (l2 && l2 !== l) { const j = l2.indexOf(id); if (j >= 0) l2.splice(j, 1); } }      // (the number may have been a dead realm's: its borders are not this one's)
    market.born(id, opts.from === undefined ? -1 : opts.from, opts.share || 0);
    owner[home] = id; if (pop[home] < 0.6) pop[home] = 0.6;
    if (people) people.born(home, c, opts.from, style);
    if (faith) faith.born(id, home, opts.from === undefined ? -1 : opts.from);      // (the faith of the people there, or of the realm it broke from)
    if (culture) culture.newRealm(id, opts.from === undefined ? -1 : opts.from);
    if (finance) finance.born(id);
    if (dynasty) dynasty.born(id);
    if (disease) { const around = []; const y0 = (home / W) | 0, x0 = home - y0 * W; for (let dy = -2; dy <= 2; dy++) { const yy = y0 + dy; if (yy < 0 || yy >= H) continue; for (let dx = -2; dx <= 2; dx++) { const o = owner[yy * W + ((x0 + dx + W) % W)]; if (o >= 0 && o !== id && civs[o] && around.indexOf(o) < 0) around.push(o); } } disease.born(id, opts.from === undefined ? -1 : opts.from, around); }      // (what its people have had: the realm it broke from, or the land about it)
    if (!cellName.has(home)) cellName.set(home, (people && people.nameAt(home, c)) || makeName(style, 2, 3));
    newRuler(c, true);
    if (!c.player && opts.from === undefined) { know.settle(id, c); rule.settle(id, c); fmOf[id] = fmNow(c);      // (what a people already knew, and how it ruled itself, when it settled down; the player chooses)
      c.ruler.title = rule.naming(c).titles[c.ruler.fem ? 1 : 0]; if (dynasty) dynasty.recrown(id, succKind(c)); }      // (its first ruler rules as it does now: where by blood, he founds a house)
    return c;
  }
  // ---------- rulers: whoever sits the throne bends the realm their way ----------
  const TRAITS = {
    conqueror: { label: 'Conqueror', a: 'a conqueror', ep: ['the Conqueror', 'the Hammer', 'the Terrible', 'the Lion'], desc: 'Hungry for land: more wars, faster expansion, harsher sacks.', agg: 1.8, exp: 1.3, stab: -0.03, sack: 1.6, build: ['fortify'] },
    builder: { label: 'Builder', a: 'a builder', ep: ['the Builder', 'the Great', 'the Magnificent'], desc: 'Raises walls, roads and wonders; the people take pride in them.', build: ['wonder', 'develop', 'fortify'], stab: 0.03, buildRate: 1.8 },
    pious: { label: 'Pious', a: 'a devout soul', ep: ['the Pious', 'the Holy', 'the Devout'], desc: 'Temples rise and faith spreads; cities are spared the sack.', build: ['temple'], stab: 0.05, sack: 0.4, faith: 3 },
    scholar: { label: 'Scholar', a: 'a scholar', ep: ['the Wise', 'the Learned', 'the Philosopher'], desc: 'Knowledge grows a quarter faster and academies are founded.', research: 1.25, build: ['academy'], agg: 0.7 },
    merchant: { label: 'Merchant', a: 'a merchant at heart', ep: ['the Rich', 'the Golden', 'the Prosperous'], desc: 'Markets and ports flourish: a fifth more income.', income: 1.2, build: ['market', 'port'], agg: 0.8 },
    tyrant: { label: 'Tyrant', a: 'a tyrant', ep: ['the Cruel', 'the Mad', 'the Bloody'], desc: 'Fear keeps order for a while, then breeds revolt; cities are sacked without mercy.', stab: -0.1, sack: 2.5, agg: 1.3, income: 1.1 },
    steward: { label: 'Steward', a: 'a careful steward', ep: ['the Just', 'the Quiet', 'the Careful'], desc: 'Keeps the peace at home and abroad; slow to expand.', agg: 0.4, exp: 0.7, stab: 0.06 },
    navigator: { label: 'Navigator', a: 'a sailor', ep: ['the Navigator', 'the Far-Sailing', 'the Wanderer'], desc: 'Ships range half again as far; colonies rise across the sea.', sea: 1.5, exp: 1.2, build: ['port'] },
  };
  const traitOf = (c) => (c && c.ruler && TRAITS[c.ruler.trait]) || null;
  const tv = (c, k, d) => { const t = traitOf(c); return t && t[k] !== undefined ? t[k] : d; };
  // ---------- the market: prices, workshops and trade between realms (econ.js), stepped once a year ----------
  // what a town raises to work its goods (see BUILD): cell -> for each kind, the plot it stands on + 1 (0 = not built)
  const IND = ['workshop', 'weaver', 'smithy', 'brewery', 'granary', 'warehouse', 'shipyard', 'factory', 'refinery', 'lab'];
  const IND_SEC = { workshop: 0, smithy: 1, weaver: 2, brewery: 3, shipyard: 4, factory: 5, refinery: 6, lab: 7 };      // the kind of work each makes cheaper (ECON.SECTORS)
  const ind = new Map(); const indN = new Int32Array(MAXC * IND.length);
  const eff = new Float32Array(MAXC * 8).fill(1), keep = new Float32Array(MAXC).fill(1), hold = new Float32Array(MAXC).fill(1);
  // ---------- knowledge: what each realm has discovered (know.js), and the edges it gives ----------
  const know = KNOW.create({ MAXC, civs, goods: GOODS, goodId: GOOD_ID, recipes: ECON.RECIPES, held, seed, start: -10000, year: () => year, nameOf: (cv) => fullName(cv),
    coastal: (c) => ports[c] > 0 || (civs[c] && civs[c].capital >= 0 && !!(flags[civs[c].capital] & 4)), shortOf: (c, g) => market.shortOf(c, g), onLearn });
  const KF = know.f, KK = know.K, NKF = know.NK, gmask = know.gmask;
  const kf = (c, k) => KF[c * NKF + k];
  // how many wars a realm is in: counted when first asked, kept until a war begins or ends (and no longer than the year: a tool may write one in by hand)
  const warCnt = new Int16Array(MAXC).fill(-1); const warsOf = (cv) => { const c = cv.id; let k = warCnt[c]; if (k < 0) { k = 0; for (const _ in cv.wars) k++; warCnt[c] = k; } return k; };
  // how each realm is governed (rule.js): its form, its laws and its estates leave factors here every year, as knowledge does
  const worksIn = (c) => { let k = 0; const b = c * IND.length; for (let j = 0; j < IND.length; j++) k += indN[b + j]; return k; };
  rule = RULE.create({ MAXC, civs, year: () => year, rnd, knows: (c, key) => know.has[c * know.ND + KNOW.ID[key]] === 1, popOf, urban, townsOf, cellsOf, temples, markets, ports, acad, wonders,
    works: worksIn, sat: (c, key) => market.sat[c * NC + CAT[key]], living: (c) => market.LS[c], traded: (c) => market.gdp[c] > 0 ? (market.impV[c] + market.expV[c]) / (2 * market.gdp[c]) : (civs[c] && civs[c].rule && civs[c].rule.tr) || 0,      // (a world just loaded has no year of trade behind it yet: what it was when saved)
    warsN: warsOf, tongue: (cv) => STYLES[cv.style] ? STYLES[cv.style].k : '', nameOf: (cv) => fullName(cv), span: (cv) => spanOf(cv),
    event: (cv, text, important, kind) => logEvent(cv, text, important || !!cv.player, kind === 'state' ? 'state' : 'law'), alarm: () => {}, news: (cv, text) => logEvent(cv, text, true, 'state'),
    shake: (cv, by) => { cv.stability = Math.max(0, cv.stability - by); },
    lose: (cv, share) => { for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] === cv.id && level[i] < 2) pop[i] *= 1 - share; } },
    fine: (cv, share) => { cv.wealth -= Math.max(0, cv.income || 0) * RULE.PACE[cv.era] * share; },
    split: (cv, why) => { const far = pickFarCell(cv); if (far >= 0) splitCiv(cv, far, Math.ceil(cellsOf[cv.id] * (0.15 + rnd() * 0.25)), why); },
    crown: (cv, how) => newRuler(cv, false, how) });      // (how the government changed: a ruler put down, or one who stays as the realm reforms about him)
  const RF = rule.f, RK = rule.K, NRF = rule.NK;
  // where a realm's stability is heading, and why (the tick uses the sum, the page shows the parts)
  const SP = { wars: 0, overreach: 0, taxes: 0, stance: 0, temples: 0, wonders: 0, luxuries: 0, hunger: 0, ruler: 0, knowledge: 0, rule: 0, peoples: 0, faiths: 0, culture: 0, finance: 0, dynasty: 0, story: 0, target: 1 };      // (the tick's own, written over for every realm: the page gets a fresh one)
  function stabParts(cv, into) {
    const c = cv.id, ro = c * NRF; const wars = warsOf(cv); const P = into || {};
    P.wars = -wars * 0.12; P.overreach = -0.5 * Math.max(0, cellsOf[c] / spanOf(cv) - 1); P.taxes = -(cv.policy.tax - 1) * 0.3; P.stance = cv.policy.stance === 'aggressive' ? -0.12 : 0; P.temples = Math.min(0.15, temples[c] * 0.03); P.wonders = Math.min(0.15, wonders[c] * 0.05);
    P.luxuries = 0.12 * satOf(c, 'luxury'); P.hunger = -0.2 * Math.max(0, 0.75 - satOf(c, 'food')) * RF[ro + RK.hunger]; P.ruler = tv(cv, 'stab', 0); P.knowledge = KF[c * NKF + KK.stab]; P.rule = RF[ro + RK.stab];
    P.peoples = people ? people.unrest(cv) : 0;      // (other peoples than its rulers', beyond what the age's realms hold: people.js)
    P.faiths = faith ? faith.unrest(cv) : 0;      // (other faiths than the realm's, likewise: faith.js)
    P.culture = culture ? culture.unrest(cv) : 0;      // (pride in its renown, against what realms of its age hold, and a golden age: culture.js)
    P.finance = finance ? finance.unrest(cv) : 0;      // (dear bread after a debasement, a panic, a default not long ago: finance.js)
    P.dynasty = dynasty ? dynasty.unrest(cv) : 0;      // (a child on the throne, and a regent ruling for him: dynasty.js)
    P.story = story ? story.unrest(cv) : 0;      // (what the realm's choices left behind for some years: a festival remembered, a monument, an old ruler who will not let go: story.js)
    P.sickness = disease ? disease.unrest(c) : 0;      // (the fear a pestilence brings while it burns: disease.js)
    P.target = 1 + P.wars + P.overreach + P.taxes + P.stance + P.temples + P.wonders + P.luxuries + P.hunger + P.ruler + P.knowledge + P.rule + P.peoples + P.faiths + P.culture + P.finance + P.dynasty + P.story + P.sickness; return P;
  }
  const spanOf = (cv) => (40 + cv.tech * 3000) * KF[cv.id * NKF + KK.reach] * RF[cv.id * NRF + RK.reach];      // how many regions a realm holds without strain
  const fmNow = (cv) => foodMult(cv.tech) * KF[cv.id * NKF + KK.food] * RF[cv.id * NRF + RK.food];
  // a realm's row of what a unit of farmland of each kind feeds it this year: its age (and how far into the next), its continent's
  // crops and beasts (the Americas and Australia farm with fewer until they have met the old world: its sicknesses come with its ships)
  function landRow(cv) {
    const e = Math.max(0, Math.min(NLA - 1, cv.era | 0)), t0 = ERAS[e][1], t1 = e + 1 < ERAS.length ? ERAS[e + 1][1] : t0 + 1, f = Math.max(0, Math.min(1, (cv.tech - t0) / Math.max(1e-6, t1 - t0)));
    let wf = 1; if (cv.capital >= 0) { const y = (cv.capital / W) | 0; const w = LAND.worldAt(((cv.capital % W) + 0.5) / W * 360 - 180, 90 - (y + 0.5) / H * 180); if (w && !(disease && disease.met(cv.id))) wf = LAND.WORLDS[w].f; }
    wfOf[cv.id] = wf; const b = cv.id * NLC; for (let k = 0; k < NLC; k++) landK[b + k] = LAND.at(k, e, f) * wf * LSCALE;
  }      // how many a unit of land feeds: the age's table, what the realm knows of farming against its age, and its laws
  function onLearn(cv, D, isFirst, beyond) {
    if (legacy && D) legacy.learned(cv, D.key);      // (the order in which realms learn what the ambitions race for)
    if (!D) { if (cv.player) logEvent(cv, `Your scholars go beyond what any age knew (${beyond})`, false, 'know'); return; }
    if (cv.player) logEvent(cv, isFirst && D.first ? `Your people are the first in the world to learn ${D.name}` : `Your people learn ${D.name}`, isFirst && D.first, 'know');
    else if (isFirst && D.first) pushWorld({ year, text: `${cap(fullName(cv))} ${cv.gov === 'band' ? 'are' : 'is'} the first to learn ${D.name}`, civ: cv.id, type: 'know', loc: cv.capital, seq: ++evSeq });
  }
  const market = ECON.create({ MAXC, civs, popOf, cellsOf, ports, markets, rawPop, urban, portCells, eff, keep, hold, cellDist, seaRange, tv, seed, year: () => year, player: () => player,
    rmask: know.rmask, ymul: know.ymul, kf: KF, NKF, K_TRADE: KK.trade, K_SEA: KK.sea, closed: (a, b) => diplo.closed(a, b), agreed: (a, b) => diplo.agreed(a, b), pactVer: () => diplo.ver });
  // what a realm learns in a year, and where it comes from: its age's pace, how many it is, what it spends on scholars
  // (twice the coin is half as much again), the share of its towns that have an academy, its peace at home, its ruler, and
  // what it knows of learning itself against its age
  function insightParts(cv) {
    const c = cv.id; const base = techRate(cv.tech), people = Math.min(1.4, Math.max(0.6, 0.6 + Math.log10(popOf[c] + 1) / 4)), spend = Math.pow(Math.max(0.05, cv.policy.research), 0.6);
    const acads = 1 + 0.5 * Math.min(1, acad[c] / Math.max(1, townsOf[c])), calm = 0.7 + cv.stability * 0.3, ruler = tv(cv, 'research', 1), known = KF[c * NKF + KK.research], time = timeF(cv.tech), laws = RF[c * NRF + RK.research], tales = story ? story.insF(c) : 1;
    return { base, people, spend, acads, calm, ruler, known, time, laws, tales, total: base * people * spend * acads * calm * ruler * known * time * laws * tales, taught: cv.taught || 0 };
  }
  const insight = (cv) => { const c = cv.id; return techRate(cv.tech) * Math.min(1.4, Math.max(0.6, 0.6 + Math.log10(popOf[c] + 1) / 4)) * Math.pow(Math.max(0.05, cv.policy.research), 0.6) * (1 + 0.5 * Math.min(1, acad[c] / Math.max(1, townsOf[c]))) * (0.7 + cv.stability * 0.3) * tv(cv, 'research', 1) * KF[c * NKF + KK.research] * timeF(cv.tech) * RF[c * NRF + RK.research] * (story ? story.insF(c) : 1); };
  const reachFor = (cv) => reachOf(cv.tech) * KF[cv.id * NKF + KK.reach] * RF[cv.id * NRF + RK.reach] + ports[cv.id] * 2;      // how far from its capital a realm holds land
  // count each realm's workshops, and what they do for it: every kind of work a third cheaper for the first of its
  // workshops (then by the square root of how many), food kept longer for its granaries, merchants holding more for its warehouses
  function countIndustry() {
    indN.fill(0); const NI = IND.length;
    for (const [i, a] of ind) { const o = owner[i]; if (o < 0 || !civs[o] || !level[i]) continue; for (let k = 0; k < NI; k++) if (a[k]) indN[o * NI + k]++; }
    for (let c = 0; c < MAXC; c++) { if (!civs[c]) continue; const b = c * NI; for (let s = 0; s < 8; s++) eff[c * 8 + s] = KF[c * NKF + KK.c_crafts + s] * RF[c * NRF + RK.work]; for (let k = 0; k < NI; k++) { const sec = IND_SEC[IND[k]]; if (sec !== undefined) eff[c * 8 + sec] *= 1 + 0.3 * Math.sqrt(indN[b + k]); } keep[c] = 1 / (1 + 0.6 * Math.sqrt(indN[b + 4])); hold[c] = (1 + 0.5 * Math.sqrt(indN[b + 5])) * RF[c * NRF + RK.trade]; }
  }
  const lastNb = new Array(MAXC).fill(null);
  // those a realm has touched in these ten years or the ten before (a border one region long is not crossed every decade): whom its merchants reach by land and its envoys know
  const nearNb = new Array(MAXC).fill(null);
  const satOf = (c, key) => market.sat[c * NC + CAT[key]];
  const buildCost = (c) => (1.15 - 0.3 * satOf(c, 'build')) * KF[c * NKF + KK.build] * RF[c * NRF + RK.build] * (culture ? culture.buildF(c) : 1);      // timber, stone and tools to hand make every work cheaper; short of them, dearer; what the realm knows of building; and its master builders
  // ---------- diplomacy: what realms think of one another, what they have sworn, why they fight and on what terms they stop (diplo.js) ----------
  // a strategic good a's own age can use, that b holds and a does not: the one a is shortest of (0: none)
  // (what a realm lacks of them is worked out once a year, the first time anybody asks: its envoys ask often)
  const lackOf = new Array(MAXC).fill(null), lackAt = new Int32Array(MAXC).fill(-99999);
  function covetOf(a, b) {
    const c = a.id; let L = lackOf[c]; if (lackAt[c] !== year || !L) { L = lackOf[c] || (lackOf[c] = []); L.length = 0; lackAt[c] = year; const ao = c * NG; for (const g of STRAT_RAW) if (GOODS[g].era <= a.era && !held[ao + g]) L.push(g); }
    if (!L.length) return 0; let covet = 0, worst = -1; const bo = b.id * NG; for (let i = 0; i < L.length; i++) { const g = L[i]; if (!held[bo + g]) continue; const sh = market.shortOf(c, g); if (sh > worst) { worst = sh; covet = g; } } return covet;
  }
  // a government of the winner's kind that the loser can be given: the winner's own where the loser's age and size allow it, else the latest of that kind they do
  function formFor(l, w) {
    const own = RULE.FORM[rule.ruleOf(w).gov], cur = rule.ruleOf(l).gov; const fits = (F) => F.key !== cur && F.kind === own.kind && F.era <= l.era && F.minEra <= l.era && !(F.faith && !l.religion) && !(F.port && !ports[l.id]) && !(F.lo && cellsOf[l.id] < F.lo);
    if (fits(own)) return own.key; let best = null; for (const F of RULE.FORMS) if (fits(F) && (!best || F.era > best.era)) best = F; return best ? best.key : null;
  }
  // one realm is joined to another: its land, its people and what its treasury holds
  function absorb(big, small, why) {
    for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] === small.id) owner[i] = big.id; }
    cellsOf[big.id] += cellsOf[small.id]; popOf[big.id] += popOf[small.id]; cellsOf[small.id] = 0; popOf[small.id] = 0; if (small.wealth > 0) big.wealth += small.wealth;
    for (const k in small.wars) { const e = civs[+k]; if (e) { delete e.wars[small.id]; warCnt[e.id] = -1; } }
    if (small.capital >= 0 && !cellName.has(small.capital)) cellName.set(small.capital, (people && people.nameAt(small.capital, small)) || makeName(small.style, 2, 3));
    killCiv(small, why);
  }
  diplo = DIPLO.create({ MAXC, civs, year: () => year, rnd, knows: (c, key) => know.has[c * know.ND + KNOW.ID[key]] === 1, discovery: (key) => KNOW.LIST[KNOW.ID[key]].name, popOf, cellsOf, strengthOf, mightOf,
    nbOf: (c) => nearNb[c] || lastNb[c], spied: (a, b) => (intrigue ? intrigue.caughtFrom(a, b) : -Infinity), warsN: warsOf, links: () => market.links, gdp: (c) => market.gdp[c], atWar: (a, bid) => a.wars[bid] !== undefined, truce: (a, bid) => a.truce[bid] || -1e9, declareWar, makePeace,
    // (a war won lifts those who fought it and the crown they fought for; a war lost does the opposite)
    won: (w, l) => { w.lastWin = [year, l.id, fullName(l)]; if (legacy) legacy.won(w); const Wn = rule.ruleOf(w), Ls = rule.ruleOf(l); Wn.bump[RULE.EK.soldiers] += 0.1; Wn.bump[RULE.EK.nobles] += 0.06; Wn.auth = Math.min(RULE.AUTH_MAX, Wn.auth + 10); Ls.bump[RULE.EK.soldiers] -= 0.1; Ls.bump[RULE.EK.nobles] -= 0.08; Ls.auth = Math.max(0, Ls.auth - 10); },
    // (told in both realms' chronicles; the player's side of it is his own news)
    event: (cv, text, important, other) => { const mine = !!(other && other.player && !cv.player); const a = mine ? other : cv, b = mine ? cv : other; logEvent(a, text, important, 'pact'); if (b) pushOwn(b, { year, text, type: 'pact', loc: b.capital, civ: b.id }); },
    shake: (cv, by) => { cv.stability = Math.max(0, cv.stability - by); },
    // (kindred speech is a tongue of the same kind, as it always was; one people under two flags is the same people: people.js)
    tongue: (cv) => STYLES[cv.style] ? STYLES[cv.style].k : '', folk: (cv) => (people && people.ruling[cv.id]) || 0,
    // (one faith, another church of it, a holy city held by another faith, what a faith's tenets make of others: faith.js)
    renownOf: (cv) => (culture ? culture.renown[cv.id] : 0), renownRel: (cv) => (culture ? culture.rel(cv.id) : 1),      // (renown, and renown against the age's usual: culture.js)
    faith: (cv) => (faith ? faith.faithOf(cv) : 0), faithKin: (a, b) => !!faith && faith.kin(a, b), holyHeld: (cv) => (faith ? faith.holyHeld(cv) : -1), faithT: (cv, key) => (faith ? faith.tsum(faith.faithOf(cv), key) : 0), sword: (cv) => !!faith && faith.has(faith.faithOf(cv), 'sword'), kind: (cv) => RULE.FORM[rule.ruleOf(cv).gov].kind, blood: (cv) => rule.succession(cv) === 'blood',
    faithLaw: (cv) => rule.ruleOf(cv).laws.faith, tradeLaw: (cv) => rule.ruleOf(cv).laws.trade, covets: (a, b) => { const g = covetOf(a, b); return g ? GOODS[g].name : ''; }, absorb, formFor,
    setForm: (cv, key) => { const F = RULE.FORM[key]; if (!F) return; if (!rule.known(cv.id, F)) rule.ruleOf(cv).brought = key; rule.setForm(cv.id, cv, F, 'imposed'); },
    alarm: () => {}, trait: (cv) => cv.ruler ? cv.ruler.trait : '', aggression: (cv) => cv.player ? (cv.policy.stance === 'aggressive' ? 0.9 : cv.policy.stance === 'consolidate' ? 0.25 : 0.5) : cv.aggression,      /* (the player's appetite is what his stance says, not a number he cannot see) */ ruler: (cv) => cv.ruler ? `${cv.ruler.title} ${cv.ruler.name}` : fullName(cv), nameOf: (cv) => fullName(cv), income: (cv) => cv.income || 0, fmtYear,
    married: (a, b) => { if (dynasty) dynasty.married(a, b); } });      // (a royal marriage weds two of the houses' people: dynasty.js)
  army = ARMY.create({ W, H, N, land, owner, level, walls, pop, flags, special, civs, nbOf, cellDist, elev, year: () => year, seed, isAtWar: (c, o) => c.wars[o] !== undefined, diplo,
    strengthOf, mightOf, popOf, cellsOf, ports, portCells, battles, cellName, fullName, logEvent, conquer, neighbours: (c) => lastNb[c] || nearNb[c],
    KF: (c, key) => KF[c * NKF + KK[key]], knows: (c, key) => know.has[c * know.ND + KNOW.ID[key]] === 1 });
  people = PEOPLE.create({ W, H, N, land, owner, pop, level, civs, MAXC, LI, STYLES, nbOf, cellDist, year: () => year, seed, rule, pull: (c) => (culture ? culture.pull(c) : 1) });
  faith = FAITH.create({ W, H, N, owner, pop, level, special, civs, MAXC, LI, STYLES, nbOf, cellDist, year: () => year, seed, rule, people, cellsOf,
    knows: (c, key) => know.has[c * know.ND + KNOW.ID[key]] === 1, trait: (cv) => (cv && cv.ruler ? cv.ruler.trait : ''), atWar: (a, b) => !!civs[a] && civs[a].wars[b] !== undefined,
    near: (c) => nearNb[c] || lastNb[c], links: () => market.links, living: (c) => market.LS[c], lordOf: (cv) => (cv.dip ? cv.dip.lord : -1),
    harbour: (c, r) => { const n = Math.min(4, ports[c]); return n ? portCells[c * 4 + Math.floor(r * n)] : civs[c] ? civs[c].capital : -1; } });
  culture = CULTURE.create({ owner, civs, MAXC, STYLES, cellName, people, rule, year: () => year, seed, townsOf, acad, temples, markets, wonders, extra: (c) => (story ? story.renOf(c) : 0),
    knows: (c, key) => know.has[c * know.ND + KNOW.ID[key]] === 1, trait: (cv) => (cv.ruler ? cv.ruler.trait : ''), realmName: (cv) => fullName(cv),
    townOf: (c) => (townPick[c] >= 0 && owner[townPick[c]] === c ? townPick[c] : -1),
    // (a sage's work: so many years of the realm's learning at once, which goes into its discoveries as a neighbour's teaching does)
    inspire: (c, years) => { const cv = civs[c]; if (!cv || !(years > 0)) return 0; const g = Math.min(1 - cv.tech, insight(cv) * years); if (g > 0) cv.tech += g; return Math.max(0, g); },
    // (the arts: so many turns of the authority the realm gathers, at once)
    acclaim: (c, turns) => { const cv = civs[c]; if (!cv || !(turns > 0)) return 0; const R = rule.ruleOf(cv); const g = Math.min(RULE.AUTH_MAX - R.auth, rule.gainOf(c, cv) * RULE.PACE[cv.era] * turns); if (!(g > 0)) return 0; R.auth = Math.round((R.auth + g) * 1000) / 1000; return g; } });
  // (the realms a realm trades with by the market's links; its share of the world's trade, reckoned once a year)
  const partnersOf = (c) => { if (diplo && diplo.linked() === market.links) return diplo.partnersOf(c); const out = []; for (const L of market.links) { if (L.a === c) out.push(L.b); else if (L.b === c) out.push(L.a); } return out; };      // (diplomacy keeps the market's links indexed by realm: the same list, in the same order, without going through them all)
  let tradeYear = -1e9, tradeAll = 1; const tradeShare = (c) => { if (tradeYear !== year) { tradeYear = year; let t = 0; for (let k = 0; k < MAXC; k++) if (civs[k]) t += market.expV[k] + market.impV[k]; tradeAll = Math.max(1e-6, t); } return (market.expV[c] + market.impV[c]) / tradeAll; };
  finance = FINANCE.create({ civs, MAXC, owner, STYLES, cellName, people, year: () => year, seed, townsOf, markets, ports,
    knows: (c, key) => know.has[c * know.ND + KNOW.ID[key]] === 1, warsN: (cv) => warsOf(cv), trait: (cv) => (cv.ruler ? cv.ruler.trait : ''), nameOf: (cv) => fullName(cv),
    near: (c) => nearNb[c] || lastNb[c], partners: partnersOf, remember: (a, bid, by) => diplo.remember(a, bid, by), trade: tradeShare,
    townOf: (c) => (townPick[c] >= 0 && owner[townPick[c]] === c ? townPick[c] : -1), portOf: (c) => { const n = Math.min(4, ports[c]); return n ? portCells[c * 4] : -1; } });
  // the people who rule: persons, their families and houses, who comes after whom (dynasty.js); a royal marriage weds two of them
  const marriedTo = (c) => { const cv = civs[c], d = cv && cv.dip; if (!d) return []; const out = []; for (const k in d.pact) if (civs[+k] && diplo.has(cv, +k, 'marriage')) out.push(+k); return out; };
  dynasty = DYNASTY.create({ civs, MAXC, STYLES, people, year: () => year, seed, kind: (cv) => succKind(cv), warsN: (cv) => warsOf(cv), traitW: (cv) => traitW(cv), marriedTo });
  // what a realm weighs in a ruler's character, by what it is (pickTrait; dynasty.js draws the leanings of its children by it)
  function traitW(c) { return { conqueror: 1 + (c.aggression > 0.6 ? 1 : 0), builder: 1, pious: c.religion ? 1.4 : 0.6, scholar: c.era >= 3 ? 1.3 : 0.4, merchant: c.era >= 2 ? 1.2 : 0.3, tyrant: 0.5, steward: 1, navigator: c.era >= 3 && ports[c.id] ? 1.4 : 0.2 }; }
  function pickTrait(c) {
    const w = traitW(c); let sum = 0; for (const k in w) sum += w[k]; let r = rnd() * sum; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return 'steward';
  }
  // how rulers follow one another, as dynasty.js tells them apart: an emperor names his heir from his house, a party or the experts
  // name theirs; the elders choose, the priests choose (and number their rulers)
  const succKind = (cv) => { const s = rule.succession(cv), g = rule.ruleOf(cv).gov; return s === 'named' ? (g === 'empire' ? 'named' : 'party') : s === 'chosen' ? (g === 'temple' || g === 'theocracy' ? 'holy' : 'chosen') : s; };
  let dying = false, lastHow = '', murdered = false;      // (newRuler: whether whoever is crowned now comes after a death, and whether it was a murder (story.js); how the throne passed the last time)
  const RISK_HOW = { clear: 0.7, child: 1.6, kin: 1.3, extinct: 2.5, new: 1, stay: 0 };      // (a succession is the likelier disputed the further the throne goes from a grown heir)
  // A new ruler (first: the realm's first; how: why the throne is empty: 'death', 'term', or how its form of government just changed,
  // rule.js). Every ruler is a person of dynasty.js: his name, sex, face and character are his; where a regent rules for a child,
  // the regent's character is the realm's until the child is of age.
  function newRuler(c, first, how) {
    const titles = rule.naming(c).titles; const succ = rule.succession(c), kind = succKind(c);
    const fem = rnd() < 0.3; const old = c.ruler;
    // (where his realm grows or reforms into a government that passes by blood, the ruler stays: he takes its title, and founds a house)
    if (old && !first && dynasty && (how === 'reform' || how === 'grown') && DYNASTY.dynastic(kind) && old.pid && dynasty.rulerOf(c.id) && dynasty.rulerOf(c.id).id === old.pid) {
      old.title = titles[old.fem ? 1 : 0]; dynasty.recrown(c.id, kind); lastHow = 'stay'; return;
    }
    const why = first ? 'first' : dying || how === 'passed' || how === 'death' || !how ? 'death' : how === 'term' ? 'term' : how === 'abdicate' ? 'abdicate' : how === 'seized' || how === 'imposed' ? 'fall' : 'reform';
    if (old && !first) { // the dead are remembered by what they did
      const reign = year - old.since; old.until = year;
      if (reign >= 22 && rnd() < 0.6) old.ep = pick(TRAITS[old.trait] ? TRAITS[old.trait].ep : ['the Old']);
      if (old.ep && why === 'death' && !c.player && cellsOf[c.id] > 250 && rnd() < 0.25) logEvent(c, `After ${reign} years ${old.title} ${old.name} dies; the people remember ${old.fem ? 'her' : 'him'} as ${old.name} ${old.ep}`, false, 'ruler');      // (the player's is told with his heir's coming)
    }
    const r = { name: makeName(c.style, 2, 3), title: titles[fem ? 1 : 0], since: year, fem, trait: pickTrait(c), seed: rint(1e6) };
    let S = null; if (dynasty) { S = dynasty.succeed(c.id, kind, why, old && old.ep); if (S) { const p = S.p; r.name = p.n; r.fem = p.f; r.title = titles[p.f ? 1 : 0]; r.seed = p.sd; if (S.trait) r.trait = S.trait; r.pid = p.id; } }
    lastHow = S ? S.how : 'new';
    c.ruler = r; c.rulers.push(r); if (c.rulers.length > 60) c.rulers.shift();
    if (!first && (c.player || rnd() < 0.15)) logEvent(c, crowned(c, r, S, kind, old, why), cellsOf[c.id] > 250 && rnd() < 0.2, 'ruler');
  }
  // a ruler dies now, as he would at the year's roll (for tests and scenes): who comes after him, and how the throne passed
  function rulerDies(cv) { const succ = rule.succession(cv); dying = true; if (succ === 'elected' || !rule.passes(cv.id, cv)) newRuler(cv, false, 'death'); dying = false; return lastHow; }

  // ---------- the stories that come before a realm's court (story.js) ----------
  // the settlements of every realm, gathered in one pass over the land once a decade when stories ask (a pass is a millisecond:
  // one for every story would be most of what they cost), and checked when used (a place may have changed hands since)
  const tnList = new Array(MAXC).fill(null); let tnYear = -1e9;
  function townsOf_(c) { if (year - tnYear >= 10 || year < tnYear) { tnYear = year; for (let k = 0; k < MAXC; k++) if (tnList[k]) tnList[k].length = 0; for (let k = 0; k < LI.length; k++) { const i = LI[k], o = owner[i]; if (o < 0 || !level[i]) continue; (tnList[o] || (tnList[o] = [])).push(i); } }
    const L = (tnList[c] || []).filter((i) => owner[i] === c && level[i]); const cp = civs[c] ? civs[c].capital : -1; if (cp >= 0 && owner[cp] === c && !L.includes(cp)) L.push(cp); return L; }
  // a town of a realm for a story to happen in: any, one with an academy, a market or a harbour (else any), not the one given;
  // the larger the likelier (r: the story's own dice)
  function storyTown(c, want, r) {
    const T = townsOf_(c); const all = [], fit = []; let sum = 0, fsum = 0;
    for (const i of T) { if (typeof want === 'number' && i === want) continue; const w = level[i] * level[i] + pop[i] * 0.05; all.push(i, w); sum += w;
      if (want === 'academy' ? special[i] & 2 : want === 'market' ? special[i] & 8 : want === 'port' ? special[i] & 1 : false) { fit.push(i, w); fsum += w; } }
    const L = fit.length ? fit : all, Tw = fit.length ? fsum : sum; if (!L.length) return civs[c] ? civs[c].capital : -1;
    let x = r * Tw; for (let k = 0; k < L.length; k += 2) { x -= L[k + 1]; if (x <= 0) return L[k]; } return L[L.length - 2];
  }
  // a town of a realm on a river (or -1); one on its border with another realm (else its capital)
  function riverTown(c, r) { const L = townsOf_(c).filter((i) => flags[i] & 2); return L.length ? L[Math.floor(r * L.length)] : -1; }
  function borderTown(c, o, r) {
    const near = (i, d) => { const y = (i / W) | 0, x = i - y * W; for (let dy = -d; dy <= d; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -d; dx <= d; dx++) if (owner[yy * W + ((x + dx + W) % W)] === o) return true; } return false; };
    const T = townsOf_(c); let L = T.filter((i) => near(i, 1)); if (!L.length) L = T.filter((i) => near(i, 3)); return L.length ? L[Math.floor(r * L.length)] : civs[c] ? civs[c].capital : -1;
  }
  // a realm's people grow or shrink by a share (a plague, refugees taken in): its settlements, where most of them live
  // the realm's settlement nearest a place (for the chronicle: "the rains fail about Ur")
  function nearTown(c, at) { let best = -1, bd = 1e9; for (const i of townsOf_(c)) { const d = cellDist(i, at); if (d < bd) { bd = d; best = i; } } return best >= 0 ? best : civs[c] ? civs[c].capital : -1; }
  const placeName = (i) => (i >= 0 && cellName.get(i)) || 'the country';
  // what the weather does that the chronicles tell (climate.js): the great droughts and colds as the world hears of them, a drought or
  // a good year in the player's realm and the great realms, the rains come back; the court is asked when a drought is deep
  function climateNews() {
    const Q = climate.news; if (!Q.length) return;
    while (Q.length) {
      const n = Q.shift();
      if (n.kind === 'event') {
        const E = CLIMATE.EV[n.key], at = cellOf(E.where[0][0], E.where[0][1]); pushWorld({ year, text: `${cap(E.name)}: ${E.text}`, civ: -1, type: 'disaster', loc: at });
        for (const c of n.realms) { const cv = civs[c]; if (!cv) continue; if (cv.player) { logEvent(cv, `${cap(E.name)} comes to ${fullName(cv)}`, true, 'disaster', nearTown(c, at)); if (E.depth < 0.9) storyTell(cv, E.kind === 'drought' ? 'drought' : 'frost', { ev: E.key, i: nearTown(c, at) }); } else if (cellsOf[c] > 150) logEvent(cv, `${cap(E.name)} comes to ${fullName(cv)}`, false, 'disaster', nearTown(c, at)); }
      } else if (n.kind === 'drought') {
        for (const c of n.realms) { const cv = civs[c]; if (!cv) continue; const t = nearTown(c, n.at);
          if (cv.player) { logEvent(cv, `The rains fail about ${placeName(t)}`, true, 'disaster', t); if (n.s < -0.22) storyTell(cv, 'drought', { sp: n.id, i: t }); }
          else if (cellsOf[c] > 150 && n.s < -0.3) logEvent(cv, `Drought in ${fullName(cv)}, about ${placeName(t)}`, false, 'disaster', t); }
      } else if (n.kind === 'rains') { for (const c of n.realms) { const cv = civs[c]; if (cv && cv.player) logEvent(cv, `The rains come back about ${placeName(nearTown(c, n.at))}${n.years > 1 ? ` after ${n.years} dry years` : ''}`, false, 'disaster', nearTown(c, n.at)); } }
      else if (n.kind === 'plenty') { for (const c of n.realms) { const cv = civs[c]; if (cv && cv.player) logEvent(cv, `A good year about ${placeName(nearTown(c, n.at))}: the granaries are full`, false, 'state', nearTown(c, n.at)); } }
    }
  }
  // who starved this year (counted in the pass over the land): the player's realm is told of any famine, the world of a great one
  function famineNews() {
    for (let c = 0; c < MAXC; c++) { const cv = civs[c]; const d = starved[c]; if (!cv || !(d > 0)) continue; const share = d / Math.max(1e-6, popOf[c] + d);
      if (cv.player ? share > 0.002 : share > 0.03 && cellsOf[c] > 100) { const k = cv.famineAt || -1e9; if (year - k < (cv.player ? 3 : 25)) continue; cv.famineAt = year;
        logEvent(cv, `Famine in ${fullName(cv)}: ${fmtThousands(d)} starve${relief[c] > 0.3 ? ', though the granaries are opened' : ''}`, cv.player || share > 0.08, 'disaster'); } }
  }
  const fmtThousands = (k) => { const n = k * 1000; return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' million' : n >= 1000 ? Math.round(n / 1000) * 1000 >= 1e6 ? '1 million' : (Math.round(n / 1000) * 1000).toLocaleString() : Math.max(10, Math.round(n / 10) * 10).toLocaleString(); };
  function popScale(cv, share) { for (const i of townsOf_(cv.id)) pop[i] = Math.max(0, pop[i] * (1 + share)); }
  // a colony across the sea, as a realm's ships found them: land on a coast nobody holds, beyond the next stretch of water
  function colonyFor(cv) {
    const c = cv.id; const R = Math.max(30, (seaRange(cv.tech) * tv(cv, 'sea', 1) * KF[c * NKF + KK.sea] + ports[c] * 3) * 1.5);
    const from = []; for (let k = 0; k < 4; k++) { const i = portCells[c * 4 + k]; if (i >= 0) from.push(i); } if (!from.length && cv.capital >= 0) from.push(cv.capital); if (!from.length) return -1;
    for (let t = 0; t < 600; t++) { const i = from[t % from.length]; const y = (i / W) | 0, x = i - y * W; const dy = Math.round((rnd() * 2 - 1) * R), dx = Math.round((rnd() * 2 - 1) * R / cosLat[y]); const yy = y + dy; if (yy < 0 || yy >= H) continue;
      const n2 = yy * W + ((x + dx + W) % W); if (!land[n2] || !(flags[n2] & 4) || owner[n2] >= 0 || fert[n2] <= 0.1 || (flags[n2] & 8) || cellDist(n2, i) < 12) continue;
      claim(n2, cv, -1); pop[n2] = Math.max(pop[n2], 0.8); if (!cellName.has(n2)) cellName.set(n2, (people && people.nameAt(n2, cv)) || makeName(cv.style, 2, 3)); recount();
      logEvent(cv, `Ships of ${fullName(cv)} found ${cellName.get(n2)} across the sea`, true, 'state', n2); if (legacy) legacy.colony(cv); return n2; }
    return -1;
  }
  // a faith other than the realm's that a preacher might bring: the largest of its own people's after the state's, else a neighbour's
  function otherFaith(cv) {
    if (!faith) return null; const st = faith.state[cv.id] || 0; const nb = nearNb[cv.id] || lastNb[cv.id] || [];
    const m = new Map(); let A = 0; for (const i of townsOf_(cv.id)) { A += pop[i]; const f = faith.fth[i]; if (f && f !== st) m.set(f, (m.get(f) || 0) + pop[i]); }
    const fs = [...m].filter((q) => faith.list[q[0]] && q[1] >= 0.03 * A).sort((a, b) => b[1] - a[1]);
    if (fs.length) { const f = fs[0][0]; let o = -1; for (const b of nb) if (civs[b] && faith.state[b] === f) { o = b; break; } return { f, o }; }
    for (const b of nb) if (civs[b] && faith.state[b] && faith.state[b] !== st && faith.list[faith.state[b]]) return { f: faith.state[b], o: b };
    return null;
  }
  // the holy city of the realm's faith: its own (o: -1), or held by another realm
  function holyFor(cv) { if (!faith) return null; const f = faith.state[cv.id]; const F = f ? faith.list[f] : null; if (!F || !(F.home >= 0)) return null; const o = owner[F.home]; if (o === cv.id) return { i: F.home, f, o: -1 }; return o >= 0 && civs[o] ? { i: F.home, f, o } : null; }
  // what a realm's envoys bring: what its land yields
  function giftOf(o) { const gs = market.goodsOf(o.id).own.slice(0, 2).map((g) => GOODS[g].name.toLowerCase()); return gs.length ? gs.join(' and ') : 'fine cloth'; }
  // so many years of a realm's learning at once (a sage's work, a library rebuilt, an inventor's drawings)
  const inspireYears = (c, years) => { const cv = civs[c]; if (!cv || !(years > 0)) return 0; const g = Math.min(1 - cv.tech, insight(cv) * years); if (g > 0) cv.tech += g; return Math.max(0, g); };
  story = STORY ? STORY.create({ civs, MAXC, year: () => year, seed, dynasty, succKind: (cv) => succKind(cv), name: (cv) => fullName(cv), cellName: (i) => cellName.get(i) || '',
    cells: (c) => cellsOf[c], towns: (c) => townsOf[c], temples: (c) => temples[c], acad: (c) => acad[c], markets: (c) => markets[c], ports: (c) => ports[c], mines: (c) => mines[c],
    knows: (c, key) => know.has[c * know.ND + KNOW.ID[key]] === 1, power: (c, key) => rule.power[c * RULE.NE + RULE.EK[key]] || 0, food: (c) => satOf(c, 'food'), warsN: (cv) => warsOf(cv), ownerOf: (i) => owner[i],
    townOf: storyTown, riverTown: (c) => riverTown(c, rnd()), borderTown: (c, o) => borderTown(c, o, rnd()), near: (c) => nearNb[c] || lastNb[c] || [], reach: (cv) => diplo.reach(cv.id),
    touches: (cv, o) => diplo.touches(cv, o), bound: (a, b) => diplo.bound(a, b), partners: partnersOf, cannotMarry: (a, b) => (a && b ? diplo.cannot(a, b, 'marriage') : 'Nobody'), marry: (a, b) => diplo.seal(a, b, 'marriage'),
    remember: (a, bid, by) => diplo.remember(a, bid, by), claim: (cv, o) => diplo.grantClaim(cv, o), giftOf, faithOf: (cv) => (faith ? faith.state[cv.id] || 0 : 0), faithName: (f) => (faith && f ? faith.nameOf(f) : ''), otherFaith, holyFor,
    master: (c) => { if (!culture || !civs[c]) return null; const w = Math.max(5, RULE.PACE[civs[c].era]); const l = culture.livingOf(c).filter((g) => g.made < 3 && !(g.asked && year - g.asked < w)); return l.length ? l[0] : null; },
    great: (id) => (culture ? culture.greatOf(id) : null), kindName: (g) => culture.kindName(g), commission: (c, id) => culture.commission(c, id), commissionCost: (cv) => culture.commissionCost(cv),
    cannotCommission: (c, id) => { const cv = civs[c], g = culture.greatOf(id); if (!g || g.c !== c || g.dies < year) return 'Nobody to ask'; if (g.made >= 3) return `${g.name} has made all there is in him`; const cost = culture.commissionCost(cv); return cv.wealth < cost ? `Needs ${cost} coin` : null; },
    auth: (cv) => rule.ruleOf(cv).auth, addAuth: (cv, by) => { const R = rule.ruleOf(cv); R.auth = Math.round(Math.max(0, Math.min(RULE.AUTH_MAX, R.auth + by)) * 1000) / 1000; }, bump: (cv, key, by) => { rule.ruleOf(cv).bump[RULE.EK[key]] += by; },
    inspire: inspireYears, insightOf: (cv) => insight(cv), renownNorm: (cv) => (culture ? culture.NORM[Math.min(8, cv.era)] : 0),
    popScale, canBorrow: (cv) => !!finance && finance.canBorrow(cv.id) && finance.room(cv.id) > 1, borrow: (cv, amt) => { if (finance) finance.borrow(cv.id, Math.min(amt, finance.room(cv.id))); },
    colony: colonyFor, heritage: (cv, era, path) => { if (cv.legacy) { cv.legacy.her.push([era, path, year]); if (cv.legacy.her.length > 9) cv.legacy.her.shift(); } }, abdicate: (cv) => newRuler(cv, false, 'abdicate'), murder: (cv) => { murdered = true; rulerDies(cv); murdered = false; }, log: (cv, text, important) => logEvent(cv, text, important, 'story'), quiet: () => !storiesOn,
    // (a pestilence: what it is and where it came from; the gates shut for some years; what the court did against it)
    outbreak: (id) => { const o = disease && disease.out.find((q) => q.id === id); return o ? { name: o.name, kind: DISEASE.KINDS[o.k].name, k: DISEASE.KINDS[o.k].key, from: o.fromName, fromId: o.from, at: cellName.get(o.at) || '' } : null; },
    quarantine: (cv, q, years) => { if (disease) disease.quarantine(cv, q, years); }, cure: (cv, id, f) => { if (disease) disease.cure(cv, id, f); },
    // (the weather: a realm's harvest this year, a drought of the year's own or a great one, the bread a court gives out for some years: climate.js)
    harvest: (c) => (hvPop[c] > 0 ? hvSum[c] / hvPop[c] : 1), spellOf: (id) => (climate ? climate.spells.find((q) => q.id === id) || null : null), climEvent: (key) => (CLIMATE && CLIMATE.EV[key]) || null,
    relief: (cv, years, f) => { cv.clim = { until: year + years, f }; } }) : null;
  // what each realm will be remembered for (legacy.js): what a realm has, as its ambitions ask it; what costs a pass over a long
  // list (the workshops, the market's links, the faiths kept, great people and masterpieces) is counted for every realm at once,
  // once in five years when asked (a realm's ambitions are looked at once in five)
  let shopsY = -1e9; const shopsN = new Int16Array(MAXC);
  const shopsOf = (c) => { if (year - shopsY >= 5 || year < shopsY) { shopsY = year; shopsN.fill(0); for (const [i, a] of ind) { const o = owner[i]; if (o < 0) continue; for (let k = 0; k < a.length; k++) if (a[k]) shopsN[o]++; } } return shopsN[c]; };
  let tradeY = -1e9; const tradeN = new Int16Array(MAXC); let faithY = -1e9; const faithN = new Map();
  const tradersOf = (c) => { if (year - tradeY >= 5 || year < tradeY) { tradeY = year; tradeN.fill(0); for (const L of market.links) { tradeN[L.a]++; tradeN[L.b]++; } } return tradeN[c]; };      // (the market's links, counted)
  const keptBy = (f) => { if (year - faithY >= 5 || year < faithY) { faithY = year; faithN.clear(); for (let k = 0; k < MAXC; k++) { const g = civs[k] && faith.state[k]; if (g) faithN.set(g, (faithN.get(g) || 0) + 1); } } return faithN.get(f) || 0; };
  let cultY = -1e9; const greatN = new Int16Array(MAXC), masterN = new Int16Array(MAXC);
  const cultCount = () => { if ((year - cultY < 5 && year >= cultY) || !culture) return; cultY = year; greatN.fill(0); masterN.fill(0); for (const g of culture.greats) if (g.c >= 0 && g.c < MAXC) greatN[g.c]++; for (const w of culture.works) if (!w.lost && w.held >= 0 && w.held < MAXC && w.value >= culture.MASTER) masterN[w.held]++; };      // (the great people each realm brought forth and the masterpieces it holds, in one pass: the lists run to thousands)
  const pactsOf = (cv, kinds) => { const P = cv.dip && cv.dip.pact; if (!P) return 0; let n = 0; for (const k in P) { if (!civs[+k]) continue; if (kinds ? kinds.some((q) => diplo.has(cv, +k, q)) : diplo.anyPact(cv, +k)) n++; } return n; };
  legacy = LEGACY ? LEGACY.create({ civs, MAXC, year: () => year, name: (cv) => fullName(cv),
    cells: (c) => cellsOf[c], pop: (c) => popOf[c], towns: (c) => townsOf[c], temples: (c) => temples[c], markets: (c) => markets[c], ports: (c) => ports[c], acad: (c) => acad[c], wonders: (c) => wonders[c],
    knows: (c, key) => KNOW.ID[key] !== undefined && know.has[c * know.ND + KNOW.ID[key]] === 1, firstOf: (key) => (KNOW.ID[key] !== undefined ? know.first[KNOW.ID[key]] : null),
    greats: (c) => { cultCount(); return greatN[c]; }, masters: (c) => { cultCount(); return masterN[c]; }, rel: (c) => (culture ? culture.rel(c) : 0),
    golden: (c) => !!culture && culture.isGolden(c), renown: (c) => (culture ? culture.renown[c] : 0),
    founded: (c) => !!faith && faith.list.some((f) => f && f.founder === c && !f.gone), holy: (c) => { if (!faith) return false; const f = faith.state[c], F = f ? faith.list[f] : null; return !!F && F.home >= 0 && owner[F.home] === c; },
    faithRealms: (c) => { if (!faith) return 0; const f = faith.state[c]; return f ? keptBy(f) : 0; },
    vassals: (cv) => diplo.vassalsOf(cv.id).length, pacts: (cv) => pactsOf(cv), marriage: (cv) => pactsOf(cv, ['marriage']) > 0, alliances: (cv) => pactsOf(cv, ['alliance', 'defence']),
    houses: (c) => (finance ? finance.housesOf(c).length : 0), workshops: shopsOf, trade: tradersOf, ls: (c) => market.LS[c], gdp: (c) => market.gdp[c] || 0, might: (c) => mightOf[c],
    addAuth: (cv, by) => { const R = rule.ruleOf(cv); R.auth = Math.round(Math.max(0, Math.min(RULE.AUTH_MAX, R.auth + by)) * 1000) / 1000; },
    log: (cv, text, important) => logEvent(cv, text, important, 'legacy'),
    // what an age leaves is a story of the realm's own (story.js: ageTold)
    tellAge: (cv, d) => (story ? story.ageTold(cv, d) : 'No stories') }) : null;
  // spies and schemes (intrigue.js): what a realm's agents can reach and what they can do there; the deeds are done here
  const worksOf = (cv) => { const out = []; for (const [i, l] of works) if (owner[i] === cv.id) for (const w of l) out.push({ i, w }); return out; };
  // (the dearest discovery of b's that a's people could study now: what its agents would bring home; -1 when there is none)
  const stealable = (a, b) => { let best = -1, bc = -1; const oa = a.id * know.ND, ob = b.id * know.ND; for (let d = 0; d < know.ND; d++) if (know.has[ob + d] && !know.has[oa + d] && KNOW.LIST[d].cost > bc && know.canStudy(a.id, d, a.era)) { bc = KNOW.LIST[d].cost; best = d; } return best; };
  // (whom a realm's agents reach: its envoys' reach, asked once while nothing between it and anybody has changed)
  const reachC = { a: -1, y: 0, v: -1, set: null };
  const inReach = (a, b) => { if (reachC.a !== a.id || reachC.y !== year || reachC.v !== diplo.ver[a.id]) { reachC.a = a.id; reachC.y = year; reachC.v = diplo.ver[a.id]; reachC.set = new Set(diplo.reach(a.id)); } return reachC.set.has(b.id); };
  // (the estate angry enough to rise and strong enough to matter, as rule.js weighs it; -1: none)
  const angriestOf = (b) => { const R = rule.ruleOf(b), p = b.id * RULE.NE; let worst = -1, ws = 0; for (let e = 0; e < RULE.NE; e++) { const v = rule.power[p + e] * Math.max(0, 0.45 - R.mood[e]); if (v > ws) { ws = v; worst = e; } } return worst; };
  const heirOfRealm = (b) => (dynasty && DYNASTY.dynastic(succKind(b)) ? dynasty.heirOf(b.id) : null);
  // (laws that make a realm's agents better, and catch more of another's: police, an intendant in every province, the censor)
  const NETLAW = { justice: { police: 1, watched: 2 }, admin: { intendants: 0.5, digital: 1 }, speech: { censor: 0.5, line: 1, wallednet: 1 } };
  const netLaws = (cv) => { const L = rule.ruleOf(cv).laws, out = []; for (const cat in NETLAW) { const v = NETLAW[cat][L[cat]]; if (v) out.push([RULE.LAW[L[cat]].name, v]); } return out; };
  function rivalsOf(cv) {      // (at war with it, claimed by it, remembered with hatred, or a neighbour it cannot abide: what it thinks of a neighbour is a sum of many reasons, so only one, met at random, is asked)
    const out = [], d = cv.dip; const add = (o) => { if (o && o !== cv && out.indexOf(o) < 0 && !diplo.bound(cv, o)) out.push(o); };
    for (const k in cv.wars) add(civs[+k]);
    if (d) { for (const k in d.claim) if (d.claim[k] > year) add(civs[Math.floor(+k / 4)]); for (const k in d.mem) if (d.mem[k][0] < -20 && diplo.memOf(cv, +k) < -20) add(civs[+k]); }
    const nb = nearNb[cv.id] || lastNb[cv.id]; if (nb && nb.length) { const o = civs[nb[Math.floor(rnd() * nb.length)]]; if (o && out.indexOf(o) < 0 && diplo.opinion(cv, o) < -25) add(o); }
    return out;
  }
  intrigue = INTRIGUE ? INTRIGUE.create({ civs, MAXC, seed, year: () => year, name: (cv) => fullName(cv), cells: (c) => cellsOf[c],
    knows: (c, key) => KNOW.ID[key] !== undefined && know.has[c * know.ND + KNOW.ID[key]] === 1, knowName: (key) => (KNOW.ID[key] !== undefined ? KNOW.LIST[KNOW.ID[key]].name : key),
    netLaws, reach: inReach, touches: (a, b) => diplo.touches(a, b.id), heirOf: heirOfRealm, worksOf, knowsMore: (b, a) => stealable(a, b) >= 0, angriest: angriestOf,
    unitOf: (cv) => (story ? story.unitOf(cv) : Math.round(10 + 12 * cv.era)), remember: (b, aid, by) => diplo.remember(b, aid, by),
    word: (cv, by) => { const d = diplo.D(cv); d.rep = Math.max(0, Math.min(100, d.rep + by)); },
    log: (cv, text, important) => logEvent(cv, text, important, 'intrigue'),
    // (the player hears of agents caught as a story, when stories are on; when another waits, it follows that one)
    tell: (cv, key, d) => { if (!story || !cv.player || !storiesOn) return; if (cv.story && cv.story.q) story.view(cv.id);      // (a story that can no longer be answered stands in nobody's way)
      const why = story.tell(cv, key, d); if (why === 'Another story waits') cv.story.f.push([key, year + 1, d]); },
    detail: (b, key) => (key === 'sabotage' ? { i: worksOf(b).length ? worksOf(b)[0].i : -1 } : key === 'rising' ? { e: angriestOf(b) } : key === 'murder' ? { p: heirOfRealm(b) ? heirOfRealm(b).id : 0 } : {}),
    // (a discovery comes home whole; what had been put into it is not lost)
    steal: (a, b) => { const d = stealable(a, b); if (d < 0) { inspireYears(a.id, 0.5 * RULE.PACE[a.era]); return 'years of their learning'; } if (know.cur[a.id] === d) { know.pool[a.id] += know.prog[a.id]; know.prog[a.id] = 0; know.cur[a.id] = -1; } know.learn(a.id, a, d); return `the secret of ${KNOW.LIST[d].name.toLowerCase()}`; },
    discord: (b) => { b.stability = Math.max(0, b.stability - 0.08); const R = rule.ruleOf(b), p = b.id * RULE.NE; let e = 0; for (let k = 1; k < RULE.NE; k++) if (rule.power[p + k] > rule.power[p + e]) e = k; R.bump[e] -= 0.1; return RULE.estateName(e, b.era).toLowerCase(); },
    claim: (a, b) => diplo.grantClaim(a, b.id),
    sabotage: (b) => { const l = worksOf(b); if (!l.length) return 'nothing to set back'; let x = l[0]; for (const q of l) { const wq = q.w.k === 'wonder', wx = x.w.k === 'wonder'; if ((wq && !wx) || (wq === wx && q.w.dur > x.w.dur)) x = q; }
      const by = Math.max(1, Math.round(x.w.dur / 2)); x.w.start += by; return `the ${(x.w.k === 'mine' ? workName(x.i) : BUILD[x.w.k].name).toLowerCase()} at ${cellName.get(x.i) || 'the capital'} is set back ${by} year${by === 1 ? '' : 's'}`; },
    rise: (b) => { const e = angriestOf(b); if (e < 0) return false; rule.rising(b.id, b, e); return true; },
    murderHeir: (b) => { const p = heirOfRealm(b); return p && dynasty.kill(p.id) ? p.n : ''; },
    rivals: rivalsOf, atWar: (a, b) => !!a.wars && a.wars[b.id] !== undefined }) : null;
  // sickness (disease.js): how crowded a realm is and how many of its people live in towns, what medicine it has against its age,
  // the roads a sickness travels; the dead are taken from its settlements
  const urbanOf = (c) => (civs[c] && popOf[c] > 0 ? Math.min(1, urban[c] / popOf[c]) : 0);      // (the share of its people in towns, as the year's pass counted them)
  disease = DISEASE ? DISEASE.create({ civs, MAXC, seed, year: () => year, name: (cv) => fullName(cv), cellName: (i) => cellName.get(i) || '', cells: (c) => cellsOf[c], ownerOf: (i) => owner[i],
    urban: urbanOf, health: (c) => Math.max(0.3, KF[c * NKF + KK.health] * RF[c * NRF + RK.health]),
    pop: (c) => popOf[c],
    crowd: (c) => townsOf[c] + 2 * markets[c] + 3 * ports[c], nb: (c) => nearNb[c] || lastNb[c], pn: diplo.pN, pa: diplo.pAt, wars: warsOf,
    cradle: (c) => { const cv = civs[c]; if (!cv || cv.capital < 0) return false; const lon = ((cv.capital % W) + 0.5) / W * 360 - 180, lat = 90 - (((cv.capital / W) | 0) + 0.5) / H * 180; return !(lon < -30 && lon > -170) && !(lat < -10 && lon > 110); },
    shut: (cv) => (cv.sick ? (cv.sick.q === 2 ? 0.85 : cv.sick.q === 1 ? 0.5 : 0) : 0),
    reached: (cv, o) => { if (cv.player || cellsOf[cv.id] > 150) logEvent(cv, `${o.name.charAt(0).toUpperCase() + o.name.slice(1)} reaches ${fullName(cv)}`, cv.player, 'disaster'); if (cv.player) storyTell(cv, 'plague', { o: o.id }); } }) : null;
  // a story of the player's family, told when it happens if no other waits and none of its kind was told lately (a birth, a wedding)
  function storyTell(cv, key, d) { if (!story || !cv || !cv.player || !storiesOn) return; const S = cv.story; if (S && (S.q || year - (S.s[key] || -1e9) < 1.5 * RULE.PACE[cv.era])) return; story.tell(cv, key, d); }
  // how a new ruler is told: who died and at what age, whose child the heir is and how old, who rules for a child, the line that
  // failed and the house that begins
  function crowned(c, r, S, kind, old, why) {
    const T = TRAITS[r.trait], realm = fullName(c), who = `${r.title} ${r.name}`;
    const verb = kind === 'elected' ? 'is elected to lead' : kind === 'seized' ? 'takes power in' : kind === 'chosen' || kind === 'holy' || kind === 'party' ? 'is chosen to lead' : 'takes the throne of';
    if (!S || !dynasty) return `${who}, ${T.a}, ${verb} ${realm}`;
    const D = dynasty, p = S.p, was = S.old, age = D.ageOf(p), his = was && was.f ? 'her' : 'his';
    const gone = old && why === 'death' ? `${old.title} ${old.name}${old.ep ? ' ' + old.ep : ''} ${murdered ? 'is murdered' : 'dies'}${was ? ' at ' + D.ageOf(was, year) : ''}, after ${year - old.since} year${year - old.since === 1 ? '' : 's'}. ` : why === 'abdicate' && old ? `${old.title} ${old.name}${old.ep ? ' ' + old.ep : ''} steps down${was ? ' at ' + D.ageOf(was, year) : ''}, after ${year - old.since} year${year - old.since === 1 ? '' : 's'}. ` : why === 'fall' && old ? `${old.title} ${old.name} is put down. ` : '';
    const H = D.houseOf(c.id);
    if (S.how === 'clear') return `${gone}${who}, ${his} ${D.kinOf(was, p)}, takes the throne at ${age}: ${T.a}`;
    if (S.how === 'child') { const R = D.regentOf(c.id); const he = p.f ? 'she' : 'he'; return `${gone}${who}, ${his} ${D.kinOf(was, p)}, is ${age}: ${R && R.p ? `${p.f ? 'her' : 'his'} ${R.who === 'noble' ? 'guardian' : R.who} ${R.p.n}` : 'a regent'} rules until ${he} is grown`; }
    if (S.how === 'kin') return `${gone}The line of ${was ? was.n : old.name} fails, and ${who}, a kinsman of ${H ? H.name : 'the house'}, takes the throne`;
    if (S.how === 'extinct') { const H0 = was && was.h ? D.houses.get(was.h) : null; return `${gone}${H0 ? cap(H0.name) + ' dies out' : 'The line fails'}. ${who} takes the throne of ${realm}${H ? ', the first of ' + H.name : ''}`; }
    return `${gone}${who}, ${T.a}, ${verb} ${realm}${H && DYNASTY.dynastic(kind) && H.n <= 1 ? ', the first of ' + H.name : ''}`;
  }
  function killCiv(c, why) {
    for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] === c.id && level[i] >= 2) markRuin(i, c.era, c.culture); }
    // (its enemies' wars with it are over now: left on their lists until they next looked, they passed to whoever was born under its number)
    for (const k in c.wars) { const e = civs[+k]; if (e && e.wars[c.id] !== undefined) { delete e.wars[c.id]; warCnt[e.id] = -1; } }
    if (legacy) legacy.gone(c); if (intrigue) intrigue.gone(c.id); if (disease) disease.gone(c.id); c.alive = false; civCount--; st.civCount = civCount; civs[c.id] = null; freeIds.push(c.id); mightOf[c.id] = 0; diplo.died(c.id); army.died(c.id); if (faith) faith.gone(c.id); if (culture) culture.gone(c.id); if (finance) finance.gone(c.id); if (dynasty) dynasty.gone(c.id);
    pushWorld({ year, text: `${fullName(c)} is no more${why ? ' — ' + why : ''}.`, civ: c.id, type: 'state', loc: c.capital, dead: true });
  }

  // ---------- init population ----------
  function seedPopulation() {
    for (const i of LI) {
      const f = landOn ? forA[i] * WSCALE : fert[i];      // (the bands of 10,000 BC: where game, fish and nuts are)
      if (f > 0.12 && !(flags[i] & 8)) pop[i] = f * 0.35 * (0.4 + rnd() * 1.2);
    }
  }
  seedPopulation();

  function capacity(i, c) {
    if (landOn) { const hv = HV !== null ? HV[i] : 1; if (hv <= 0) return 0;      // (this year's harvest against an ordinary year's: a drought, a good year; nothing under the ice)
      const w = forA[i] * WSCALE * 30 * FM0; if (!c) return w * RCF[flags[i] & 6] * (1 + bonusFert[i] * 2) * hv;      // (a people that farms still hunts and fishes: never fewer than the land fed before it farmed)
      const k = farmA[i] * landK[c.id * NLC + kcls[i]] * 30 * fmOf[c.id] * (1 + infra[i] * 0.22); return (k > w ? k : w) * RCF[flags[i] & 6] * (1 + bonusFert[i] * 2) * hv; }
    const t = c ? c.tech : 0.0;
    const f = Math.min(1.2, fert[i] + bonusFert[i]);
    let k = f * 30 * (c ? fmOf[c.id] : FM0) * (1 + infra[i] * 0.22);
    if (flags[i] & 2) k *= t > 0.05 ? 4 : 1.6;       // river valleys: irrigation
    else if (flags[i] & 4) k *= 1.3;                 // coasts: fishing and trade
    return k;
  }
  // How strong a realm is. Two figures come of it, and they are not the same thing:
  //   strengthOf (people = 0): how good its arms are - what a fight over a region is decided by, whoever has more heads. The wars of every
  //     world were fitted to this figure, so the fights go on using it: counting heads there would let the largest realm roll up the map.
  //   mightOf (its people and its mines): what it can put in the field and afford to lose - what its neighbours fear, what envoys weigh,
  //     what the player is told ("far weaker than you").
  function strength(c, people, pits) {
    const strat = (c.era >= 1 ? 4 * satOf(c.id, 'arms') : 0) + Math.min(3, pits) * 0.5; // an army with all the arms, horses and guns it wants is two fifths stronger than one with none; mines dig deeper
    const s = (people + 2) * (0.25 + c.tech * 1.6) * c.policy.military * (year < c.army ? 1.6 : 1) * (0.6 + c.stability * 0.5) * (1 + 0.1 * strat) * KF[c.id * NKF + KK.strength] * RF[c.id * NRF + RK.strength] * (story ? story.strF(c.id) : 1);
    return s;
  }
  // what a cell brings its realm's market: its own good, if the realm's age can work it (a mine digs more than twice as
  // much), and the wood, stone and sea salt any country has
  function yieldsOf(i, o, c, p) {
    const g = goods[i], b = o * NG;
    if (g) { held[b + g] = 1; if (c.era >= gera[i] && gmask[b + g]) rawPop[b + g] += ((special[i] & 512) ? p * 2.2 : p) * RF[o * NRF + RK.yield] * (landOn && HV !== null && CROP[g] ? 1 + CROP[g] * (HV[i] - 1) : 1); }      // (a crop is as good as the year's harvest: climate.js)
    const wd = wood[i]; if (wd) rawPop[b + G_TIMBER] += p * wd; rawPop[b + G_STONE] += p * 0.1; if (flags[i] & 4) rawPop[b + G_SALT] += p * 0.08;
  }
  const NB = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];
  function nbOf(i, k) { // wrap-safe neighbour
    const y = (i / W) | 0, x = i - y * W;
    const dy = k < 3 ? -1 : k < 5 ? 0 : 1, dx = k === 0 || k === 3 || k === 5 ? -1 : k === 1 || k === 6 ? 0 : 1;
    const yy = y + dy; if (yy < 0 || yy >= H) return -1;
    return yy * W + ((x + dx + W) % W);
  }
  // whether a realm's settlers may take cell n of realm on's: two ages ahead, land nobody much lives on (a fifth of what the settlers'
  // ways would feed there), no town, not the capital, within the settlers' reach, never the player's (his land is taken only in war),
  // and never a small people's last fifteen regions; and not every year that they could
  const frontierLog = new Map();
  function frontier(c, on, n) {
    const e = civs[on]; if (!e || e.player || c.era - e.era < 2 || level[n] >= 2 || e.capital === n || (flags[n] & 8) || cellsOf[on] < 15 || rnd() > 0.4) return false;
    return pop[n] < 0.2 * capacity(n, c) && cellDist(n, c.capital) < reachFor(c);
  }
  function claim(i, c, from) {
    const prev = owner[i];
    owner[i] = c.id; if (people) people.claimed(i, c); if (faith) faith.claimed(i, c, prev);
    if (prev >= 0 && civs[prev] && civs[prev].capital === i) {
      const p = civs[prev];
      logEvent(p, `${cellName.get(i) || 'The capital'} falls to ${fullName(c)}`, true);
      logEvent(c, `${c.ruler.title} ${c.ruler.name} takes ${cellName.get(i) || 'the enemy capital'}`, true);
      p.stability -= 0.35; p.capital = -1; lostSeat[prev] = i;
    }
    if (from >= 0) { const m = Math.min(pop[from] * 0.15, 3); pop[from] -= m; pop[i] += m; }
  }

  // a region taken in war, from the border fights (sim's pass 2) or by a host (army.js): it changes hands, the fight is
  // remembered (events.js draws it), and a town may be sacked
  function conquer(n, c, from, siege) {
    const on = owner[n], e = civs[on]; if (!e || on === c.id) return;
    claim(n, c, from); cellsOf[on]--; cellsOf[c.id]++;
    battles.push({ i: n, from, year, a: c.id, b: on, siege: !!siege, taken: true });
    if (level[n] >= 2) {
      const sackP = Math.min(0.7, 0.18 * (c.policy.stance === 'aggressive' ? 1.5 : 1) * (c.tech + 0.05 < e.tech ? 2 : 1) * tv(c, 'sack', 1));
      if (rnd() < sackP) { pop[n] *= 0.12; rubble.set(n, year); if (culture) culture.sacked(n, c); logEvent(c, `${fullName(c)} sacks ${cellName.get(n) || 'the city'}; its people are scattered`, level[n] >= 3 || e.player || c.player, 'war', n); } else { pop[n] *= 0.85; rubble.set(n, year); }
    }
    if (rnd() < 0.05) logEvent(c, `${fullName(c)} takes ${cellName.get(n) || 'land'} from ${fullName(e)}`, false);
  }
  // ---------- war & diplomacy ----------
  function declareWar(a, b, why) {
    a.wars[b.id] = year; b.wars[a.id] = year; warCnt[a.id] = warCnt[b.id] = -1; a.warStart[b.id] = cellsOf[a.id]; b.warStart[a.id] = cellsOf[b.id];
    logEvent(a, `${fullName(a)} declares war on ${fullName(b)}${why ? ' ' + why : ''}`, cellsOf[a.id] + cellsOf[b.id] > 80 || a.player || b.player);
    pushOwn(b, { year, text: `${fullName(a)} declares war on ${fullName(b)}`, type: 'war', loc: b.capital, civ: b.id });
  }
  function makePeace(a, b, text, quiet) {
    delete a.wars[b.id]; delete b.wars[a.id]; warCnt[a.id] = warCnt[b.id] = -1;
    const t = year + 60 + rint(80); a.truce[b.id] = t; b.truce[a.id] = t;
    if (quiet && !a.player && !b.player) return;      // (those who came in beside a friend go home with him: one peace, told once)
    logEvent(a, text || `${fullName(a)} and ${fullName(b)} make peace`, cellsOf[a.id] + cellsOf[b.id] > 120 || a.player || b.player);
    pushOwn(b, { year, text: text || `${fullName(a)} and ${fullName(b)} make peace`, type: 'war', loc: b.capital, civ: b.id });
  }
  function isAtWar(a, b) { return a.wars[b] !== undefined; }

  // ---------- splitting / collapse ----------
  function splitCiv(c, seedCell, maxCells, why) {
    // flood fill from seedCell through c's cells up to maxCells → new civ; the regions of the seed's own people first, and
    // of others only when they run out (a province breaks away with its people: people.js)
    const P = people.ppl, own = P[seedCell];
    const visited = new Set([seedCell]); const q = [seedCell], later = []; const cells = [];
    while ((q.length || later.length) && cells.length < maxCells) {
      const i = q.length ? q.shift() : later.shift(); cells.push(i);
      for (let k = 0; k < 8; k++) { const n = nbOf(i, k); if (n >= 0 && owner[n] === c.id && !visited.has(n)) { visited.add(n); (P[n] === own ? q : later).push(n); } }
    }
    if (cells.length < 3) return null;
    const st0 = people.styleAt(seedCell); const style = st0 >= 0 ? st0 : rnd() < 0.7 ? c.style : styleFor(seedCell);
    const nc = newCiv(seedCell, { style, tech: c.tech * (0.92 + rnd() * 0.08), from: c.id, share: Math.min(0.9, cells.length / Math.max(1, cellsOf[c.id])) });
    if (!nc) return null;
    nc.era = eraOf(nc.tech);
    for (const i of cells) owner[i] = nc.id;
    nc.capital = seedCell; cellsOf[nc.id] = cells.length; cellsOf[c.id] = Math.max(0, cellsOf[c.id] - cells.length);      // (the parent's count is right again at once: the rest of the year reads it)
    const pn = own && own !== people.ruling[c.id] ? people.nameOf(own) : '';      // (a people of its own, not the rulers': it is they who rise)
    logEvent(c, pn ? `The ${pn} of ${cellName.get(seedCell) || 'the provinces'} break away from ${fullName(c)} and found ${fullName(nc)}${why ? ', ' + why : ''}` : `${fullName(nc)} breaks away from ${fullName(c)}${why ? ' ' + why : ''}`, cells.length > 25 || c.player);
    pushOwn(nc, { year, text: `${fullName(nc)} declares independence from ${fullName(c)}`, type: 'state', loc: nc.capital, civ: nc.id });
    return nc;
  }

  // a realm whose seat was taken this year (in the border fights, by a host, by a breakaway, at a peace) moves its court at
  // the year's end to the most populous region left to it. It used to wait for next year's count: the screens read the
  // year's end, and between two turns a realm could stand without a capital. With nothing left it keeps its last seat's
  // place until it is gone (next year's count).
  function reseat() {
    let need = 0;
    for (let c = 0; c < MAXC; c++) { const cv = civs[c]; seatAt[c] = -2; if (cv && (cv.capital < 0 || owner[cv.capital] !== c)) { seatAt[c] = -1; seatPop[c] = -1; need++; } }
    if (need) {
      for (let k = 0; k < LI.length; k++) { const i = LI[k], o = owner[i]; if (o >= 0 && seatAt[o] !== -2 && pop[i] > seatPop[o]) { seatPop[o] = pop[i]; seatAt[o] = i; } }
      for (let c = 0; c < MAXC; c++) {
        if (seatAt[c] === -2) continue; const cv = civs[c];
        if (seatAt[c] >= 0) { cv.capital = seatAt[c]; logEvent(cv, `${cellName.get(cv.capital) || 'A new city'} becomes the capital of ${fullName(cv)}`, false); }
        else if (cv.capital < 0 && lostSeat[c] >= 0) cv.capital = lostSeat[c];
      }
    }
    lostSeat.fill(-1);
  }

  // what the faiths did, for the chronicle (faith.js keeps its news; worded here, where the realms' names are)
  function faithNews() {
    while (faith.news.length) {
      const n = faith.news.shift(), F = faith.list[n.f], cv = n.c >= 0 ? civs[n.c] : null, nm = F ? F.name : '', big = !!cv && (cellsOf[cv.id] > 40 || cv.player);
      if (n.kind === 'gone') { pushWorld({ year, text: `${cap(nm)} is no more: nobody keeps it now`, civ: -1, type: 'faith', loc: F ? F.home : -1 }); continue; }
      if (!cv) continue; const who = fullName(cv), at = cellName.get(n.at) || 'the capital';
      if (n.kind === 'found') logEvent(cv, n.why === 'comet' ? `Under the comet a prophet in ${at} preaches ${nm}, and ${who} takes it up` : n.why === 'god' ? `A prophet walks out of the desert at ${at}. ${cap(who)} takes up ${nm}` : n.why === 'founded' ? `${cap(who)} founds ${nm} at ${at}` : `In ${at} a prophet arises: ${nm} is preached in ${who}`, big || cellsOf[cv.id] > 20 || n.why === 'god', 'faith', n.at);
      else if (n.kind === 'prophet') logEvent(cv, `In ${at} a prophet arises, and waits for the court to hear him`, true, 'faith', n.at);
      else if (n.kind === 'adopt') { const fr = n.from >= 0 ? civs[n.from] : null; logEvent(cv, n.why === 'people' ? `The rulers of ${who} take up ${nm}, the faith of most of their people` : n.why === 'lord' && fr ? `${cap(who)} takes up ${nm}, the faith of its lord` : fr ? `${cap(who)} takes up ${nm}, the faith of ${fullName(fr)}` : `${cap(who)} takes up ${nm}`, big, 'faith'); }
      else if (n.kind === 'turned') logEvent(cv, `${cap(who)} forsakes ${faith.nameOf(n.was)} for ${nm}, the faith of most of its people`, big, 'faith');
      else if (n.kind === 'split') logEvent(cv, `In ${who} the faithful break with ${faith.nameOf(n.from)}: ${nm} is born`, true, 'faith');
      else if (n.kind === 'follow') logEvent(cv, `${cap(who)} follows ${civs[n.lead] ? fullName(civs[n.lead]) : 'its neighbour'} into ${nm}`, big, 'faith');
      else if (n.kind === 'world') logEvent(cv, `Out of ${faith.nameOf(n.from)} comes a teaching for all peoples: ${nm}, first preached in ${who}`, true, 'faith');
      else if (n.kind === 'holyfall') logEvent(cv, `${cap(at)}, the holy city of ${nm}, falls to ${who}`, true, 'faith', n.at);
      else if (n.kind === 'holyfree') logEvent(cv, `${cap(who)} takes ${at}, the holy city of its faith`, true, 'faith', n.at);
    }
  }

  // what culture did, for the chronicle (culture.js keeps its news): the great people of note and the player's, the
  // masterpieces and the player's works, golden ages, works lost when a city is sacked
  function cultureNews() {
    while (culture.news.length) {
      const n = culture.news.shift(), cv = n.c >= 0 ? civs[n.c] : null; if (!cv && n.kind !== 'lost') continue;
      const gp = n.gp ? culture.greatOf(n.gp) : null, wk = n.wk ? culture.workOf(n.wk) : null;
      if (n.kind === 'born' && gp && (gp.fame >= 1.8 || cv.player)) logEvent(cv, `${gp.name}, ${gp.fame >= 1.8 ? 'a ' + culture.kindName(gp).toLowerCase() + ' whose name will outlive ' + fullName(cv) : 'a ' + culture.kindName(gp).toLowerCase()}, is born in ${cellName.get(gp.at) || fullName(cv)}`, (gp.fame >= 2.6 && culture.rel(cv.id) >= 2) || cv.player, 'culture', gp.at);      /* (the world hears of the greatest, of renowned realms) */
      else if (n.kind === 'work' && gp && wk && (wk.value >= culture.MASTER || cv.player)) logEvent(cv, `${gp.name} ${n.commissioned ? 'makes, at the court\'s asking,' : 'makes'} ${wk.name}${wk.value >= culture.MASTER ? ', a masterpiece' : ''}${cv.player && n.boon > 0 ? (n.what === 'insight' ? ` (+${Math.round(n.boon * 1e5)} insight)` : ` (+${Math.round(n.boon)} authority)`) : ''}`, wk.value >= 10 || cv.player, 'culture', wk.at);
      else if (n.kind === 'golden') logEvent(cv, `A golden age begins in ${fullName(cv)}`, cellsOf[cv.id] > 40 || cv.player, 'culture');
      else if (n.kind === 'goldenEnd') logEvent(cv, `The golden age of ${fullName(cv)} ends in unrest`, cv.player, 'culture');
      else if (n.kind === 'lost' && wk) { const by = n.c >= 0 ? civs[n.c] : null, maker = civs[wk.c]; const text = `${wk.name} is lost when ${cellName.get(wk.at) || 'the city'} is sacked${by ? ' by ' + fullName(by) : ''}`; if (maker) logEvent(maker, text, wk.value >= 6 || maker.player, 'culture', wk.at); else if (by) logEvent(by, text, wk.value >= 6, 'culture', wk.at); }
    }
  }

  // what finance did, for the chronicle (finance.js keeps its news): the player's dealings; defaults, houses failing, companies
  // crashing and panics where they are great or touch the player
  function financeNews() {
    const big = (cv) => cv && (cv.player || cellsOf[cv.id] > 120);
    while (finance.news.length) {
      const n = finance.news.shift(), cv = n.c >= 0 ? civs[n.c] : null; if (!cv) continue; const me = cv.player; const F = finance;
      if (n.kind === 'borrow' && me) logEvent(cv, `The court borrows ${Math.round(n.amt)} coin, at ${(100 * F.rateOf[cv.id]).toFixed(1)}% a year`, false, 'state');
      else if (n.kind === 'repay' && me) logEvent(cv, `The court repays ${Math.round(n.amt)} coin of its debts`, false, 'state');
      else if (n.kind === 'default') { const hurt = (n.ruined || []).map((b) => civs[b]).filter(Boolean); logEvent(cv, `${cap(fullName(cv))} defaults on ${Math.round(n.amt)} coin of debts${hurt.length ? `, ruining lenders in ${hurt.slice(0, 3).map((b) => fullName(b)).join(', ')}` : ''}`, big(cv) || hurt.some((b) => b.player), 'state'); }
      else if (n.kind === 'debase') logEvent(cv, me ? (n.printed ? `The court prints money: ${Math.round(n.gain)} coin, and prices will rise` : `The court debases the ${F.coin(cv.id) || 'coin'}: ${Math.round(n.gain)} coin, and prices will rise`) : `${cap(fullName(cv))} ${n.printed ? 'prints money' : 'debases its coin'}`, me || (big(cv) && cellsOf[cv.id] > 300), 'state');
      else if (n.kind === 'restore' && (me || big(cv))) logEvent(cv, me ? `The court restores the ${F.coin(cv.id) || 'coin'} to its full weight` : `${cap(fullName(cv))} restores its coin`, me, 'state');
      else if (n.kind === 'house') { const x = F.houseOf(n.h); if (x && (me || cellsOf[cv.id] > 200)) logEvent(cv, `${x.name} opens its doors in ${cellName.get(x.at) || fullName(cv)}`, me, 'state', x.at); }
      else if (n.kind === 'fail') { const x = F.houseOf(n.h); if (x) logEvent(cv, `${x.name} fails${n.why ? ': ' + n.why : ''}`, big(cv), 'disaster', x.at); }
      else if (n.kind === 'company') { const co = F.companies.find((y) => y.id === n.co); if (co && (me || cellsOf[cv.id] > 200)) logEvent(cv, `${co.name} is chartered in ${cellName.get(co.at) || fullName(cv)}`, me, 'state', co.at); }
      else if (n.kind === 'crash') { const co = F.companies.find((y) => y.id === n.co); if (co) logEvent(cv, `The shares of ${co.name} collapse`, big(cv) || (player >= 0 && co.hold[player] > 0), 'disaster', co.at); }
      else if (n.kind === 'panic' && n.text && (me || big(cv))) logEvent(cv, `Panic in the markets of ${fullName(cv)}: ${n.text.charAt(0).toLowerCase() + n.text.slice(1)}`, me, 'disaster');
    }
  }

  // what the families of those who rule did, for the chronicle (dynasty.js keeps its news): the player's own family; royal
  // marriages, houses that lose their thrones and regencies that end, where the realms are great; a child ruler come of age
  // rules by his own character from now on
  function dynastyNews() {
    const D = dynasty; const big = (cv) => cv && (cv.player || cellsOf[cv.id] > 150);
    const royal = (cv) => cv && DYNASTY.dynastic(succKind(cv)); const styled = (cv, p) => p ? `${royal(cv) && !(cv.ruler && cv.ruler.pid === p.id) ? (p.f ? 'Princess ' : 'Prince ') : ''}${p.n}` : '';
    while (D.news.length) {
      const n = D.news.shift(), cv = n.c >= 0 ? civs[n.c] : null; if (!cv) continue; const p = D.of(n.p), me = cv.player, R = cv.ruler;
      if (n.kind === 'ofage') { if (R && R.pid === n.p && p) { if (p.t) R.trait = p.t; if (big(cv)) logEvent(cv, `${R.title} ${R.name} comes of age, and rules ${p.f ? 'herself' : 'himself'} now: ${TRAITS[R.trait].a}`, me, 'ruler'); } }
      else if (!p) continue;
      else if (n.kind === 'regent') { if (R) { R.trait = D.traitOf(cv.id) || R.trait; if (big(cv)) logEvent(cv, `The regent of ${fullName(cv)} dies; ${p.n}, ${TRAITS[p.t] ? TRAITS[p.t].a : 'a noble'}, rules for ${R.title} ${R.name} now`, me, 'ruler'); } }
      else if (n.kind === 'born' && me) { const o = D.of(p.p === R.pid ? p.m : p.p); logEvent(cv, `A ${p.f ? 'daughter' : 'son'} is born to ${R.title} ${R.name}${o ? ' and ' + o.n : ''}: ${p.n}`, false, 'ruler'); storyTell(cv, 'birth', { p: p.id }); }
      else if (n.kind === 'grand' && me) { const par = D.of(p.p) || D.of(p.m); logEvent(cv, `A ${p.f ? 'granddaughter' : 'grandson'} is born to ${R.title} ${R.name}: ${p.n}, ${p.f ? 'daughter' : 'son'} of ${styled(cv, par)}`, false, 'ruler'); }
      else if (n.kind === 'died' && me) { const heir = D.heirOf(cv.id); logEvent(cv, `${styled(cv, p)} dies, ${D.ageOf(p) < 2 ? 'in infancy' : 'aged ' + D.ageOf(p)}${heir ? `: ${styled(cv, heir)} is heir now` : ''}`, false, 'ruler'); }
      else if (n.kind === 'grown' && me) logEvent(cv, `${styled(cv, p)} comes of age: ${TRAITS[p.t] ? TRAITS[p.t].a : 'grown'}${p.rz ? ', as the court had raised ' + (p.f ? 'her' : 'him') : ''}`, false, 'ruler');
      else if (n.kind === 'widowed' && me) logEvent(cv, `${p.n}, ${p.f ? 'wife' : 'husband'} of ${R.title} ${R.name}, dies, aged ${D.ageOf(p)}`, false, 'ruler');
      else if (n.kind === 'royal') { const o = civs[n.o], a = D.of(n.a), b = D.of(n.b); if (o && a && b && (big(cv) || big(o))) logEvent(cv, `${styled(cv, a)} of ${fullName(cv)} weds ${styled(o, b)} of ${fullName(o)}`, me || o.player, 'pact');
        if (o && a && b && (me || o.player)) { const mine = me ? cv : o, ours = me ? a : b, theirs = me ? b : a; if (!(mine.ruler && mine.ruler.pid === ours.id)) storyTell(mine, 'wedding', { a: ours.id, b: theirs.id, o: me ? o.id : cv.id }); } }
      else if (n.kind === 'match' && me) { const sp = D.of(n.s); logEvent(cv, `${styled(cv, p)} weds ${sp ? sp.n : 'a noble'}, of a great family of the realm`, false, 'ruler'); }
      else if (n.kind === 'raise' && me) logEvent(cv, `${styled(cv, p)} is to be raised as ${TRAITS[n.t].a}`, false, 'ruler');
      else if (n.kind === 'pass' && me) { const heir = D.heirOf(cv.id); logEvent(cv, `${styled(cv, p)} is passed over${heir ? `: ${styled(cv, heir)} is heir now` : ''}`, false, 'ruler'); }
    }      // (a house that loses its throne, and a regency that begins, are told with the succession: newRuler)
  }

  // ---------- history (for the chronicle graphs) ----------
  const history = []; // {year, pop, wild, civs, top:[[id,pop,cells]...]}
  function record() {
    let total = 0; for (let c = 0; c < MAXC; c++) if (civs[c]) total += popOf[c];
    let wild = 0; for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] < 0) wild += pop[i]; }
    const top = []; for (let c = 0; c < MAXC; c++) if (civs[c]) top.push([c, popOf[c], cellsOf[c]]);
    top.sort((a, b) => b[1] - a[1]);
    let best = 0; for (const c of civs) if (c && c.tech > best) best = c.tech;
    history.push({ year, pop: total, wild, civs: civCount, best, gdp: Math.round(market.worldGdp), trade: Math.round(market.worldTrade), top: top.slice(0, 12).map(t => [t[0], Math.round(t[1]), t[2]]) });
  }
  // ---------- main tick ----------
  let meanTech = 0.02, lastFounding = -99999;
  function tick() {
    tickCount++; year++; warCnt.fill(-1);
    if (tickCount % 25 === 0) shufflePerm();
    // per-civ accumulators
    popOf.fill(0); cellsOf.fill(0); acad.fill(0); temples.fill(0); ports.fill(0); markets.fill(0); wonders.fill(0); mines.fill(0); townsOf.fill(0); townPick.fill(-1); townKey.fill(0xFFFFFFFF); bestPop.fill(-1); rawPop.fill(0); held.fill(0); urban.fill(0); portCells.fill(-1);
    const budget = new Float32Array(MAXC);
    let techSum = 0, techN = 0;
    frontTech = 0;
    if (landOn) for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (cv) landRow(cv); }
    // the weather of the year (climate.js): the ice, the green lands, the great droughts, every year's own; and what softens a famine
    // in each realm - its granaries, what its market can bring in, the bread the court gives out
    const weather = climate && landOn; if (weather) { climate.step(); if (wetVer !== climate.wetVer) applyWet(); climateNews(); }
    if (weather) for (let c = 0; c < MAXC; c++) { const cv = civs[c]; hvSum[c] = 0; hvPop[c] = 0; starved[c] = 0; if (!cv) continue; const sat = market.sat[c * NC + CAT.food]; relief[c] = Math.min(0.85, 0.6 * (1 - keep[c]) + 0.4 * clamp01((sat - 0.6) / 0.4) + (cv.clim && cv.clim.until > year ? cv.clim.f : 0)); }
    for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv) continue; strengthOf[c] = strength(cv, 0, 0); fmOf[c] = fmNow(cv); growR[c] = growOf(cv.tech) * (1 - (cv.policy.tax - 1) * 0.15) * (0.7 + cv.stability * 0.3) * KF[c * NKF + KK.grow] * RF[c * NRF + RK.grow]; techSum += cv.tech; techN++; if (cv.tech > frontTech) frontTech = cv.tech; }
    meanTech = techN ? techSum / techN : 0.02;
    // pass 1: growth + accumulate (order-independent); the dead of last year's sickness are taken first (disease.js: a share of each realm)
    const sick = disease && disease.dying() ? disease.killF : null;
    roomKey.fill(0xFFFFFFFF); roomCell.fill(-1);
    for (let k = 0; k < LI.length; k++) {
      const i = LI[k]; const o = owner[i]; const c = o >= 0 ? civs[o] : null;
      let p = pop[i]; if (sick !== null && o >= 0) { const q = sick[o]; if (q > 0) p *= 1 - q; }
      if (p > 0 || c) {
        const K = capacity(i, c);
        const r = c ? growR[o] : 0.006;
        p += r * p * Math.max(-10, 1 - p / Math.max(K, 0.01)); // overfull land empties by at most ~a quarter a year
        // (a famine: in a bad year those the land no longer feeds die, a share of them a year, fewer where something softens it)
        if (weather && p > K) { const hv = HV[i]; if (hv < 0.97) { const d = (p - K) * FAMINE * (c ? 1 - relief[o] : 1); p -= d; if (c) starved[o] += d; } }
        if (p < 0.001) p = 0;
        pop[i] = p;
        // (a far cell of a realm with room in it, one a year chosen as by lot: where its emigrants go - colonies across the sea, a frontier far off)
        if (landOn && c && p < 0.35 * K && K > 0.3 && c.capital >= 0) { const hk = Math.imul(i ^ Math.imul(year, 0x27D4EB2D), 0x165667B1) >>> 0; if (hk < roomKey[o] && cellDist(i, c.capital) > 20) { roomKey[o] = hk; roomCell[o] = i; } }
      }
      if (c) {
        popOf[o] += p; cellsOf[o]++; if (weather) { hvSum[o] += p * HV[i]; hvPop[o] += p; }
        if (special[i] & 1) { if (ports[o] < 4) portCells[o * 4 + ports[o]] = i; ports[o]++; } if (special[i] & 2) acad[o]++; if (special[i] & 4) temples[o]++; if (special[i] & 8) markets[o]++; if (special[i] & 16) wonders[o]++; if (special[i] & 512) mines[o]++;
        if (p > 0.05) yieldsOf(i, o, c, p);
        if (p > bestPop[o]) { bestPop[o] = p; bestCell[o] = i; }
        // settlement level, relative to what the era can feed
        const fm = fmOf[o]; const s1 = 6 * fm + 0.2, s2 = 25 * fm + 1, s3 = 90 * fm + 4, s4 = 300 * fm + 15;
        const prevLvl = level[i];
        level[i] = p >= s4 ? 4 : p >= s3 ? 3 : p >= s2 ? 2 : p >= s1 ? 1 : 0;
        if (level[i] >= 2) { urban[o] += p; townsOf[o]++; const hk = Math.imul(i ^ Math.imul(year, 0x9E3779B1), 0x85EBCA6B) >>> 0; if (hk < townKey[o]) { townKey[o] = hk; townPick[o] = i; } if (p >= peakAt[i]) { const q = Math.min(255, Math.round(Math.log2(p * 20 + 1) * 16)); if (q > peak[i]) peak[i] = q; peakAt[i] = peak[i] >= 255 ? 3e38 : (Math.pow(2, (peak[i] + 0.5) / 16) - 1) / 20 * 0.999999; } }
        if (level[i]) { if (p < bandLo[i] || p >= bandHi[i]) { const b = Math.min(255, Math.round(Math.log2(p * 1000 + 1) * 3)); if (b > gBand[i]) { gPrev[i] = gBand[i]; gBand[i] = b; gYear[i] = year; } else if (b < gBand[i]) { gBand[i] = b; gPrev[i] = b; } bandLo[i] = (Math.pow(2, (b - 0.5) / 3) - 1) / 1000 * 1.000001 + 1e-9; bandHi[i] = b >= 255 ? 3e38 : (Math.pow(2, (b + 0.5) / 3) - 1) / 1000 * 0.999999; } }
        else if (gBand[i]) { gBand[i] = 0; gPrev[i] = 0; gYear[i] = -1e9; bandHi[i] = 0; }
        // a town that shrinks to a hamlet, or dies, leaves its stones (sudden or slow); a town rebuilt over them clears them
        if (prevLvl >= 2 && level[i] < 2) markRuin(i, c.era, c.culture);
        else if (level[i] >= 2 && p >= s2 * 1.1 && ruins.has(i) && year - ruins.get(i).year > 5) { ruins.delete(i); }      // (well clear of the size of a town: a saved world's rounded numbers must not rebuild one)
        if (c.capital === i && level[i] < 1) level[i] = 1;
        if (level[i] && (prevLvl !== level[i] || ((year + i) & 15) === 0) && !cellName.has(i)) cellName.set(i, people.nameAt(i, c) || makeName(c.style, 2, 3));      // (asked when a place becomes a settlement or changes rank, and of every place now and then: the map of names is slow to ask)
        if (level[i] && siteU[i] < 0) { siteU[i] = 0.25 + rnd() * 0.5; siteV[i] = 0.25 + rnd() * 0.5; }
      } else if (level[i]) level[i] = 0;
    }
    // per-civ bookkeeping
    for (let c = 0; c < MAXC; c++) if (civs[c]) mightOf[c] = strength(civs[c], popOf[c], mines[c]);
    diplo.tick();      // (who trades with whom; what tribute changes hands this year)
    for (let c = 0; c < MAXC; c++) {
      const cv = civs[c]; if (!cv) continue;
      if (cellsOf[c] === 0) { diplo.fell(cv); killCiv(cv, 'its last lands were lost'); continue; }
      if (cv.capital < 0 || owner[cv.capital] !== c) { cv.capital = bestCell[c]; logEvent(cv, `${cellName.get(cv.capital) || 'A new city'} becomes the capital of ${fullName(cv)}`, false); }
      if (cellsOf[c] > cv.peakCells) cv.peakCells = cellsOf[c];
      // knowledge
      // (what it learned this year, and whatever came to it since last year from its neighbours or from the gods, goes into its discoveries)
      const t1 = cv.tech + insight(cv);
      cv.tech = Math.min(1, t1); know.step(c, cv, Math.max(0, t1 - know.lastT[c])); know.lastT[c] = cv.tech;
      syncEra(cv, c);
      // rule: the estates' content moves, authority gathers, reforms come into force, demands are made and risings break out
      rule.step(c, cv); const ro = c * NRF;
      // wealth
      // (how well the people live, by last year's market: fed, clothed, housed and supplied; and what the customs took at the border)
      const living = market.LS[c], customs = market.rev[c];
      cv.trade = { living, customs, imp: market.impV[c], exp: market.expV[c] };
      // (taxes by the rate, by what the realm's law of taxes brings in and its state spends; the army and the scholars; what the customs took)
      const gross = popOf[c] * (0.06 + cv.tech * 0.3) * cv.policy.tax * (1 + ports[c] * 0.05 + Math.min(0.3, markets[c] * 0.04) + Math.min(0.3, mines[c] * 0.05) + 0.3 * Math.max(0, living - 0.45) * (1 + Math.min(0.5, markets[c] * 0.1))) * tv(cv, 'income', 1) * KF[c * NKF + KK.income] * RF[ro + RK.tax] * (finance ? finance.taxF(c) : 1) * (story ? story.incF(c) : 1) * (disease ? disease.incF(c) : 1);
      cv.gross = gross;      // (what lenders lend against: finance.js)
      const income = gross * (1 - RF[ro + RK.cost]) - popOf[c] * 0.05 * (cv.policy.military - 1) * (cv.policy.military > 1 ? RF[ro + RK.upkeep] : 1) - popOf[c] * SCHOLARS * (cv.policy.research - 1) + customs * RF[ro + RK.customs] + diplo.trIn[c] - diplo.trOut[c];      // (and what vassals and the beaten pay, or what is paid to a lord or a victor)
      cv.income = income; cv.wealth += income;
      // stability: drifts to a target set by war, overreach, taxes and stance; crises knock it down
      const target = stabParts(cv, SP).target;
      aiBuild(cv); aiIndustry(cv);
      cv.stability += (Math.min(1, target) - cv.stability) * 0.012;
      if (cellsOf[c] > 30 && rnd() < (0.0035 * Math.min(1, cellsOf[c] / 1500) + 0.0004) * 0.5 * RF[ro + RK.unrest]) {      // (the estates make most of the trouble now: this is what is left to blind chance)
        cv.stability -= 0.25 + rnd() * 0.3;
        logEvent(cv, `${pick(['Famine', 'A revolt of the provinces', 'Plague and famine', 'A bad harvest and a hard winter', 'Bankruptcy of the court', 'A great fire in the capital'])} shakes ${fullName(cv)}`, cellsOf[c] > 300 || cv.player);
      }
      cv.stability = cv.stability > 0 ? Math.min(1, cv.stability) : cv.stability === cv.stability ? 0 : (st.nan = (st.nan || 0) + 1, 0.5);      // (a number that is no number is put right here, and counted: one such once spread through a whole world)
      // expansion budget
      const drive = cv.player ? (cv.policy.stance === 'consolidate' ? 0 : cv.policy.stance === 'aggressive' ? 1.6 : 0.7) : cv.expansion * (cv.policy.stance === 'aggressive' ? 1.5 : 1) * tv(cv, 'exp', 1);
      budget[c] = drive * (0.12 + Math.pow(cellsOf[c], 0.5) * 0.012) * (0.4 + cv.stability * 0.6) * RF[ro + RK.expand];
      // a ruler dies (or, where rulers are elected, his years are up); where the heir is disputed the realm is shaken
      { const succ = rule.succession(cv); const term = succ === 'elected' && year - cv.ruler.since >= Math.max(4, Math.round(RULE.PACE[cv.era] / 5)) + (cv.ruler.seed % 5);      // (a term is some years, more in the slow ages: the page shows administrations, not consuls)
        const gone = succ === 'elected' ? term || rnd() < 1 / 60 : dynasty ? dynasty.diesNow(cv, rnd()) : rnd() < 1 / 34;      // (else a ruler's death comes with his years: dynasty.js)
        if (gone) { const old = cv.ruler; dying = !term; if (succ === 'elected' || !rule.passes(c, cv)) newRuler(cv, false, term ? 'term' : 'death'); dying = false;      // (what was seized passes with the one who seized it: rule.passes changes the government, which crowns his successor)
          const risk = (succ === 'blood' ? 0.1 : succ === 'seized' ? 0.3 : succ === 'named' ? 0.06 : 0) * (RISK_HOW[lastHow] ?? 1);
          if (risk && rnd() < risk * RF[ro + RK.unrest]) { cv.stability = Math.max(0, cv.stability - (0.1 + rnd() * 0.15)); logEvent(cv, `The death of ${old.title} ${old.name} is followed by a fight for the succession in ${fullName(cv)}`, cellsOf[c] > 300 || cv.player, 'ruler'); }
          if (succ === 'blood') { diplo.heir(c, cv, lastHow); if (civs[c] !== cv) continue; } } }      // (where houses are joined by marriage, now and then one inherits the other: most of all when a line fails)
      // religion
      if (!cv.religion && know.can(c, 'faith') && rnd() < 0.0025 * tv(cv, 'faith', 1)) faith.prophet(c, cv.capital, 'prophet');      // (in the player's realm the player founds it: faith.js)
      // collapse
      if (cv.stability < 0.3 && cellsOf[c] > 8 && rnd() < 0.05) {
        const parts = 1 + rint(2); let made = 0;
        for (let q = 0; q < parts; q++) { const seedC = pickFarCell(cv); if (seedC >= 0) { const nc = splitCiv(cv, seedC, Math.ceil(cellsOf[c] * (0.2 + rnd() * 0.3)), 'as the realm fractures'); if (nc) made++; } }
        if (made) cv.stability += 0.3;
      }
      // overreach split
      const reach = reachFor(cv);
      if (cellsOf[c] > 12 && tickCount % 20 === (c % 20) && !(cv.player && cv.stability > 0.5)) {
        const far = pickFarCell(cv, reach * 1.1);
        if (far >= 0 && rnd() < 0.25 * RF[ro + RK.breakaway]) splitCiv(cv, far, Math.ceil(cellsOf[c] * 0.2), 'beyond the reach of its capital');
      }
      // what it has sworn runs its course, what it remembers fades, and now and then it sends envoys of its own
      diplo.step(c, cv);
    }
    if (weather) famineNews();      // (who starved in the pass over the land: climate.js)
    // pass 2: migration, expansion, conquest (random order)
    const stride = 2;
    const offset = tickCount % stride;
    const age = year + 10000;
    for (let k = offset; k < perm.length; k += stride) {
      const i = perm[k]; const o = owner[i]; const p = pop[i];
      if (p <= 0.05 && o < 0) continue;
      const c = o >= 0 ? civs[o] : null;
      if (!c) { // wild bands: drift and, now and then, settle down as a people
        if (p > 0.1) {
          const n = nbOf(i, rint(8));
          if (n >= 0 && land[n] && owner[n] < 0 && pop[n] < pop[i] * 0.6 && fert[n] > 0.08 && !iced(n)) { const m = p * 0.08; pop[i] -= m; pop[n] += m; }
        }
        if (homeOf(i) > 0.5 && year - lastFounding > 2 && civCount < MAXC - 4 && rnd() < 3e-6 * (1 + age / 1500) * ((flags[i] & 2) ? 3 : 1)) {
          const nc = newCiv(i, { tech: 0.015 + 0.4 * meanTech }); if (nc) { lastFounding = year; nc.era = eraOf(nc.tech); logEvent(nc, `${fullName(nc)} settle ${cellName.get(i)}, and stay`, rnd() < 0.3); }
        }
        continue;
      }
      const K = capacity(i, c);
      const r0 = rnd(); const kk = (r0 * 8) | 0; const n = nbOf(i, kk); const r1 = (r0 * 8) % 1;
      if (n >= 0 && land[n]) {
        const on = owner[n];
        if (on >= 0 && on !== o) contact[o * MAXC + on] = Math.min(65000, contact[o * MAXC + on] + 1);
        // expansion into unowned or enemy land
        if (budget[o] > 0 && p > 0.3 * K && p > 0.15) {
          if (on < 0) {
            if (fert[n] + bonusFert[n] > 0.04 && !(flags[n] & 8) && !iced(n) && cellDist(n, c.capital) < reachFor(c)) {
              budget[o] -= 1; claim(n, c, i);
            }
          } else if (landOn && on !== o && !isAtWar(c, on) && frontier(c, on, n)) {
            // settlers: a realm two ages ahead takes thinly peopled land of its neighbour's without a war (the steppe ploughed, the
            // forest cleared, the colonies of the new world pushing inland), and the neighbour does not forget it
            budget[o] -= 1; claim(n, c, i); diplo.remember(civs[on], o, -1.5);
            const key = o * MAXC + on; if (!(year - (frontierLog.get(key) || -1e9) < 30)) { frontierLog.set(key, year); const where = cellName.get(n) ? ' about ' + cellName.get(n) : '';
              if (c.player) logEvent(c, `Our settlers take land of ${fullName(civs[on])}${where}`, true, 'state', n); else logEvent(civs[on], `Settlers of ${fullName(c)} take land of ${fullName(civs[on])}${where}`, cellsOf[on] > 60, 'state', n); }
          } else if (on !== o && isAtWar(c, on)) {
            const e = civs[on];
            const sa = strengthOf[o], sb = strengthOf[on];
            let pWin = 0.11 * Math.pow(sa / (sa + sb + 0.001), 2.2) / (1 + walls[n] * 1.5 * KF[on * NKF + KK.defence] / KF[o * NKF + KK.siege]);      // (walls count for what their builders know of holding them, against what the attacker knows of breaking them)
            pWin *= army.focus(o, on, n);      // (where a host of either stands, in a war of the player's: army.js)
            if (rnd() < 0.08) battles.push({ i: n, from: i, year, a: o, b: on, siege: walls[n] > 0 });
            if (rnd() < pWin) { conquer(n, c, i, walls[n] > 0); budget[o] -= 0.5; }
          }
        }
      }
      // sea colonisation
      if (budget[o] > 0 && (flags[i] & 4) && know.can(o, 'colonies') && p > 0.3 * K && r1 < 0.02) {
        let R = seaRange(c.tech) * tv(c, 'sea', 1) * KF[o * NKF + KK.sea] + ports[o] * 3;
        const y = (i / W) | 0, x = i - y * W;
        // (oceans crossed on purpose: a shore anywhere across them, in a world whose land has kinds; before, a point at random within reach)
        const ocean = landOn && know.can(o, 'oceans'); if (ocean) R = Math.max(R, 95);
        const dy = Math.round((rnd() * 2 - 1) * R), dx = Math.round((rnd() * 2 - 1) * R / cosLat[y]);
        const yy = ocean ? 0 : y + dy; if (yy >= 0 && yy < H) {
          const fits = (n2) => land[n2] && (flags[n2] & 4) && (owner[n2] < 0 || (owner[n2] !== o && landOn && !isAtWar(c, owner[n2]) && frontier(c, owner[n2], n2))) && fert[n2] > 0.1 && !(flags[n2] & 8) && !iced(n2) && cellDist(n2, i) < R;
          let n2 = ocean ? COAST[rint(COAST.length)] : yy * W + ((x + dx + W) % W);
          if (ocean) for (let t = 0; t < 7 && !fits(n2); t++) n2 = COAST[rint(COAST.length)];      // (the captains look along many shores for one to settle)
          if (fits(n2)) {
            if (owner[n2] >= 0) diplo.remember(civs[owner[n2]], o, -1.5);
            budget[o] -= 1; claim(n2, c, i); if (!cellName.has(n2)) cellName.set(n2, people.nameAt(n2, c) || makeName(c.style, 2, 3));
            if (cellDist(n2, i) > 12) { logEvent(c, `Ships of ${fullName(c)} found ${cellName.get(n2)} across the sea`, cellDist(n2, i) > 30 || c.player); if (legacy) legacy.colony(c); }
          }
        }
      }
      // emigrants: from crowded land to the realm's far land where there is room (roomCell), a few cells a year
      if (landOn && p > 0.85 * K && r1 > 0.97) { const n4 = roomCell[o]; if (n4 >= 0 && owner[n4] === o) { const m = Math.min(p * 0.04, 0.6 * capacity(n4, c) - pop[n4]); if (m > 0) { pop[i] -= m; pop[n4] += m; } } }
      // internal migration towards emptier good land
      if (p > 0.6 * K) {
        const n3 = nbOf(i, rint(8));
        if (n3 >= 0 && land[n3] && owner[n3] === o) { const Kn = capacity(n3, c); if (pop[n3] < 0.5 * Kn) { const m = Math.min(p * 0.05, (Kn - pop[n3]) * 0.3); pop[i] -= m; pop[n3] += m; } }
      }
    }
    // the hosts in the field and the fleets at sea: they march, give battle, lay siege, and the player's take land (army.js)
    army.step();
    // the peoples: who has been taken into whose, who has drifted apart into a people of their own (people.js)
    people.step();
    while (people.news.length) {
      const n = people.news.shift();
      if (n.kind === 'drift' && n.n >= 20) { const P = people.list[n.from], D = people.list[n.p]; const [ax, ay] = [n.at % W, (n.at / W) | 0], [hx, hy] = [P.home % W, (P.home / W) | 0]; let dx = ax - hx; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W; const dy = ay - hy; const dir = Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx > 0 ? 'east' : 'west') : Math.abs(dy) > Math.abs(dx) * 1.5 ? (dy > 0 ? 'south' : 'north') : (dy > 0 ? 'south' : 'north') + (dx > 0 ? '-east' : '-west');
        const o = owner[n.at], cv = o >= 0 ? civs[o] : null; const text = `The ${P.name} of the far ${dir} speak a tongue of their own now: they are the ${D.name}`;
        if (cv) logEvent(cv, text, n.n >= 60 || cv.player, 'state', n.at); else pushWorld({ year, text, civ: -1, type: 'state', loc: n.at }); }
      else if (n.kind === 'turned') { const cv = civs[n.c]; if (cv) logEvent(cv, `The ${people.nameOf(n.was)} who rule ${fullName(cv)} have taken up the tongue of the ${people.nameOf(n.now)}`, cellsOf[n.c] > 60 || cv.player, 'state'); }
    }
    // the faiths: what the state carries, what is preached, who takes up whose faith, churches that break away (faith.js)
    faith.step(); faithNews();
    // great people and their works, renown and golden ages (culture.js)
    culture.step(); cultureNews();
    // credit, coin, banking houses, companies and panics (finance.js)
    finance.step(); financeNews();
    // the families of those who rule: births and deaths, who comes of age, marriages (dynasty.js)
    dynasty.step(); dynastyNews();
    // what comes before the courts: the player's waits for his answer, the autopilot's are answered (story.js)
    if (story) { story.step(); story.news.length = 0; dynastyNews(); financeNews(); cultureNews(); }
    if (legacy) legacy.step();
    // spies and schemes: what the agents of every realm are about (intrigue.js)
    if (intrigue) intrigue.step();
    // sickness: new outbreaks where people live crowded, and where the old ones go next (disease.js)
    if (disease) disease.step();
    // diplomacy every 10 ticks (staggered)
    for (let c = 0; c < MAXC; c++) {
      const a = civs[c]; if (!a || tickCount % 10 !== c % 10) continue;
      // wars end: after a generation, sooner when one side is broken; on what terms, and for whom else, diplo.js says
      diplo.warsEnd(a); warCnt[c] = -1; if (civs[c] !== a) continue;
      // new wars. A realm's appetite for war is its ruler's, as it always was; diplomacy says on whom it falls: of the neighbours it is stronger than, those
      // it is free to fight (no oath, no truce, and stronger than them with their friends), the hated and those it has a reason against before the rest.
      // Hemmed in by oaths it turns on whoever is left; among friends it rests; among enemies it fights twice as often.
      if (a.player && a.policy.stance !== 'aggressive') { /* player declares manually */ }
      else if (warsOf(a) < 2 && cellsOf[c] > 4) {
        let nOld = 0, fSum = 0; foes.length = 0;
        for (let b = 0; b < MAXC; b++) {
          const n = contact[c * MAXC + b]; if (!n) continue;
          const bv = civs[b]; if (!bv || isAtWar(a, b) || (a.truce[b] || -1e9) > year) continue;
          if (!(strengthOf[c] > strengthOf[b] * 1.15)) continue; nOld++; const w = diplo.warWith(a, bv); if (!w) continue; foes.push(bv, w); fSum += w.f;
        }
        if (nOld) { const A = diplo.stats.appetite; A.asked++; A.old += nOld; A.open += foes.length / 2; if (!foes.length) A.shut++; else A.kept += Math.min(nOld, 3 * foes.length / 2); }      // (for the probe: how much of the old appetite for war finds somebody it may fall on)
        if (foes.length) {
          const nNew = foes.length / 2, mean = fSum / nNew; const base = a.aggression * tv(a, 'agg', 1) * WAR_RATE * (landOn ? WAR_AGE[Math.max(0, Math.min(8, a.era | 0))] : 1) * (a.policy.stance === 'aggressive' ? 2 : 1) * Math.min(3, nOld / nNew) / Math.max(0.5, Math.min(1.3, mean));
          for (let k = 0; k < foes.length; k += 2) { const w = foes[k + 1]; if (rnd() < base * w.f * w.g) { diplo.declare(a, foes[k], w.key); break; } }
        }
      }
      // tech diffusion, religion spread, and who the merchants can reach by land (the realms touched in these ten years or the ten before)
      const nb = []; const tBefore = a.tech;
      for (let b = 0; b < MAXC; b++) {
        const n = contact[c * MAXC + b]; if (!n) continue; const bv = civs[b]; if (!bv) { contact[c * MAXC + b] = 0; continue; }
        nb.push(b);
        if (bv.tech > a.tech) a.tech += (bv.tech - a.tech) * SPREAD[bv.era];
        contact[c * MAXC + b] = 0;
      }
      { const was = lastNb[c]; lastNb[c] = nb; let all = nb; if (was) { all = nb.slice(); for (const b of was) if (civs[b] && all.indexOf(b) < 0) all.push(b); } nearNb[c] = all; market.touch(c, all);
        // (what is known to those it touches or trades with is learned half again as fast)
        // and what merchants bring from across the sea teaches too, half as well as a neighbour
        const near = all.slice(); for (const L of market.links) { const b = L.a === c ? L.b : L.b === c ? L.a : -1; if (b < 0 || near.indexOf(b) >= 0) continue; near.push(b); const bv = civs[b]; if (bv && bv.tech > a.tech && !(a.wars && a.wars[b] !== undefined)) a.tech += (bv.tech - a.tech) * SPREAD[bv.era] * 0.5; } know.around(c, near); }
      a.taught = (a.tech - tBefore) / 10;      // what its neighbours taught it, a year (for the page)
      syncEra(a, c);
    }
    // random disasters
    if (!disease && rnd() < 0.012) plague(pick(LI), 8 + rint(14), true);      // (with disease.js, sickness arises where people live crowded and travels: no disk of death from nowhere)
    reseat();
    finishWorks();
    livingWorld(); faithNews();
    countIndustry(); market.step(); if (tickCount % 3 === 0) hungerWatch();
    if (year % 20 === 0) record();
    st.year = year; st.civCount = civCount;
  }
  // ---------- the living world ----------
  function civAt(i) { const o = owner[i]; return o >= 0 ? civs[o] : null; }
  function hurt(center, radius, kill, text, type, opts = {}) {
    // damage a disc of cells; returns the most-populous realm hit (for the chronicle)
    let hit = null, hitPop = 0; const y0 = (center / W) | 0, x0 = center - y0 * W; const touched = new Set();
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const yy = y0 + dy; if (yy < 0 || yy >= H) continue; const i = yy * W + ((x0 + dx + W) % W);
      if (!land[i]) continue; const d = Math.sqrt(dx * dx * cosLat[yy] * cosLat[yy] + dy * dy); if (d > radius) continue;
      const f = 1 - d / (radius + 0.5); const c = civAt(i); if (c && pop[i] > hitPop) { hitPop = pop[i]; hit = c; } if (c) touched.add(c.id);
      pop[i] *= 1 - kill * f;
      if (opts.walls && walls[i] && rnd() < 0.5 * f) walls[i]--; if (opts.infra && infra[i] && rnd() < 0.5 * f) infra[i]--;
      if (opts.fert) bonusFert[i] = Math.max(-0.6, Math.min(0.6, bonusFert[i] + opts.fert * f));
      if (opts.rubble && level[i]) rubble.set(i, year);
    }
    for (const id of touched) { const c = civs[id]; if (c) c.stability = Math.max(0, c.stability - (opts.stab || 0.05)); }
    if (hit) logEvent(hit, text.replace('{realm}', fullName(hit)), opts.important || popOf[hit.id] > 150 || hit.player, type, center);
    else if (opts.important) pushWorld({ year, text: text.replace(' in {realm}', '').replace('{realm}', describeCell(center)), civ: -1, type, loc: center });
    return hit;
  }
  function livingWorld() {
    // volcanoes: each one wakes every few centuries; big ones bury what stands around them
    for (const v of volcanoes) {
      if (v.erupting > -1e8 && year - v.erupting > 3) { v.erupting = -1e9; }
      if (v.erupting > -1e8) continue;
      if (rnd() < 1 / (900 - v.power * 120) && year - v.last > 80) {
        v.erupting = year; v.last = year; v.strength = v.power * (0.6 + rnd() * 0.8);
        const big = v.strength > 2.2; const radius = big ? 3 : v.strength > 1.3 ? 2 : 1;
        hurt(v.cell, radius, big ? 0.6 : 0.25 * v.strength, `${v.name} erupts${big ? ' and buries the country in ash' : ''} in {realm}`, 'disaster', { fert: -0.25, rubble: true, important: big, stab: big ? 0.15 : 0.05 });
        // ash makes the land rich a generation later
        v.enrichAt = year + 40;
      }
      if (v.enrichAt && year >= v.enrichAt) { v.enrichAt = 0; const y0 = (v.cell / W) | 0, x0 = v.cell - y0 * W; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const yy = y0 + dy; if (yy < 0 || yy >= H) continue; const i = yy * W + ((x0 + dx + W) % W); if (land[i]) bonusFert[i] = Math.min(0.6, bonusFert[i] + 0.35); } }
    }
    // wildfires: dry, warm, grassy country burns; forests regrow greener
    if (rnd() < 0.08) { const i = pick(LI); const y = (i / W) | 0; const lat = Math.abs(90 - (y + 0.5) / H * 180); if (fert[i] > 0.2 && fert[i] < 0.75 && lat < 62 && !(flags[i] & 8)) { const r = 1 + rint(3); fires.push({ i, year, r, dur: 1 + rint(2) }); hurt(i, r, 0.06, 'Wildfire sweeps the country in {realm}', 'disaster', { fert: 0.04, stab: 0.02 }); if (fires.length > 120) fires.shift(); } }
    // floods: the great rivers break their banks; silt feeds the fields after
    if (rnd() < 0.05) { const i = pick(LI); if (flags[i] & 2) { const y = (i / W) | 0, x = i - y * W; const cells = [i]; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy; if (yy < 0 || yy >= H || (!dx && !dy)) continue; const j = yy * W + ((x + dx + W) % W); if (land[j] && (flags[j] & 2)) cells.push(j); } floods.push({ i, year, cells }); hurt(i, 2, 0.05, 'The river floods the valley in {realm}', 'disaster', { fert: 0.08, stab: 0.02 }); if (floods.length > 60) floods.shift(); } }
    // earthquakes along the fault belts
    if (rnd() < 0.06) { const belt = pick(FAULTS); const k = rint(belt.length - 1); const t = rnd(); const lon = belt[k][0] + (belt[k + 1][0] - belt[k][0]) * t + (rnd() - 0.5) * 3, lat = belt[k][1] + (belt[k + 1][1] - belt[k][1]) * t + (rnd() - 0.5) * 3; const i = cellOf(lon, lat); const mag = 6 + rnd() * 3; if (land[i]) { quakes.push({ i, year, mag }); hurt(i, mag > 8 ? 3 : mag > 7 ? 2 : 1, 0.04 * (mag - 5), `An earthquake${mag > 8 ? ' of terrible force' : ''} shakes the land in {realm}`, 'disaster', { walls: true, infra: true, rubble: mag > 6.8, stab: mag > 7.5 ? 0.12 : 0.04, important: mag > 8 }); if (quakes.length > 60) quakes.shift(); } }
    // a comet every few lifetimes; faiths are founded under it
    if (year - comet > 140 && rnd() < 0.004) { comet = year; pushWorld({ year, text: 'A great comet hangs in the sky; the wise read omens in it', civ: -1, type: 'disaster', loc: -1 }); for (const c of civs) if (c && !c.religion && know.can(c.id, 'faith') && rnd() < 0.25) faith.prophet(c.id, c.capital, 'comet'); }      // (where there are priests to read it)
    // old marks fade
    while (fires.length && year - fires[0].year > 60) fires.shift();
    while (floods.length && year - floods[0].year > 6) floods.shift();
    while (quakes.length && year - quakes[0].year > 40) quakes.shift();
    while (battles.length && year - battles[0].year > 8) battles.shift();
    while (plagues.length && year - plagues[0].year > 6) plagues.shift();
    for (const [i, y] of rubble) if (year - y > 30) rubble.delete(i);
  }
  // ruins: when a town dies its stones stay
  function markRuin(i, era, culture) {
    const pk = peak[i] ? (Math.pow(2, peak[i] / 16) - 1) / 20 : 0; const p = Math.max(pop[i], pk * 0.6);
    const old = ruins.get(i); const R = Math.max(60, Math.sqrt(Math.max(30, p * 1000) * 150 / Math.PI), old ? old.R : 0);
    ruins.set(i, { year: old ? old.year : year, era: old ? Math.max(old.era, era) : era, culture, R, wonder: (special[i] & 16) ? ((special[i] >> 5) & 15) + 1 : (old ? old.wonder : 0), name: cellName.get(i) || (old ? old.name : '') });
    if (ruins.size > 1500) ruins.delete(ruins.keys().next().value);
  }
  function pickFarCell(c, minDist) {
    // (of the regions found far from the capital, one of a people that is not the rulers' sooner: people.js)
    const cands = [];
    for (let t = 0; t < 60; t++) { const i = perm[rint(perm.length)]; if (owner[i] !== c.id) continue; const d = cellDist(i, c.capital); if (d > (minDist || 0)) { cands.push([i, d]); if (minDist && cands.length >= 3) break; } }
    if (!cands.length) return -1;
    if (minDist) return people.farSeed(c.id, cands);
    let best = -1, bd = -1; for (const [i, d] of cands) if (d > bd) { bd = d; best = i; } const alt = people.farSeed(c.id, cands); return alt >= 0 ? alt : best;
  }
  function evolveGovAll() {}      // (governments change by rule.js now; kept for pages that still call it)
  function plague(center, radius, natural) {
    let hit = null, hitPop = 0; const y0 = (center / W) | 0, x0 = center - y0 * W;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const yy = y0 + dy; if (yy < 0 || yy >= H) continue; const i = yy * W + ((x0 + dx + W) % W);
      if (!land[i] || pop[i] <= 0) continue; const d = Math.sqrt(dx * dx * cosLat[yy] * cosLat[yy] + dy * dy); if (d > radius) continue;
      const kill = (0.25 + rnd() * 0.3) * (1 - d / radius);
      const o = owner[i]; if (o >= 0 && pop[i] > hitPop && civs[o]) { hitPop = pop[i]; hit = civs[o]; }
      pop[i] *= (1 - (o >= 0 && civs[o] ? kill / (KF[o * NKF + KK.health] * RF[o * NRF + RK.health]) : kill));
    }
    if (hit && (natural ? popOf[hit.id] > 20 : true)) { logEvent(hit, `A great plague sweeps through ${fullName(hit)}`, popOf[hit.id] > 200 || hit.player); hit.stability -= 0.1; plagues.push({ i: center, year, r: radius }); }
    if (!natural && disease) disease.seed(center, 'plague');      // (the god's plague does not stop where it was sent: disease.js)
  }
  function meteor(center) {
    const radius = 4; const y0 = (center / W) | 0, x0 = center - y0 * W; let hit = null;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const yy = y0 + dy; if (yy < 0 || yy >= H) continue; const i = yy * W + ((x0 + dx + W) % W);
      if (!land[i]) continue; const o = owner[i]; if (o >= 0 && civs[o]) hit = civs[o]; if (level[i] >= 2 && o >= 0 && civs[o]) markRuin(i, civs[o].era, civs[o].culture);
      pop[i] = 0; owner[i] = -1; infra[i] = 0; walls[i] = 0; special[i] = 0; level[i] = 0; ind.delete(i); bonusFert[i] = Math.max(-0.5, bonusFert[i] - 0.4);
    }
    if (hit) logEvent(hit, `Fire falls from the sky upon ${fullName(hit)}`, true); else pushWorld({ year, text: `A meteor strikes ${describeCell(center)}`, civ: -1, type: 'disaster', loc: center });
  }
  // the god's drought (climate.js): the rains fail for three years over some five hundred kilometres about the place, told as any drought is
  function drought(center) {
    if (!climate || !landOn) return 'The weather of this world is its own';
    if (!land[center]) return 'Needs land'; if (iced(center)) return 'The ice lies here';
    climate.force('drought', center, 550, -0.45, 3); return 'The rains fail';
  }
  function bounty(center) {
    const radius = 4; const y0 = (center / W) | 0, x0 = center - y0 * W; let hit = null;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const yy = y0 + dy; if (yy < 0 || yy >= H) continue; const i = yy * W + ((x0 + dx + W) % W);
      if (!land[i] || (flags[i] & 8)) continue; const d = Math.sqrt(dx * dx + dy * dy); if (d > radius) continue;
      bonusFert[i] = Math.min(0.7, bonusFert[i] + 0.35 * (1 - d / (radius + 1))); const o = owner[i]; if (o >= 0 && civs[o]) hit = civs[o];
    }
    if (hit) logEvent(hit, `The land of ${fullName(hit)} turns rich and green`, true);
  }
  function describeCell(i) {
    const y = (i / W) | 0, x = i - y * W; const lat = 90 - (y + 0.5) / H * 180, lon = (x + 0.5) / W * 360 - 180;
    return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
  }
  function spawnTribe(i, opts) {
    if (!land[i] || (flags[i] & 8) || iced(i)) return null; // no one settles the ice (nor where the ice sheets of the north still lie: climate.js)
    if (owner[i] >= 0) return null;
    pop[i] = Math.max(pop[i], 1.2);
    const c = newCiv(i, opts);
    if (c) { logEvent(c, `${fullName(c)} arrive at ${cellName.get(i)} and put down roots`, true); }
    return c;
  }
  // ---------- player actions ----------
  function playerCiv() { return player >= 0 ? civs[player] : null; }
  function setPlayer(i, name, site) {
    const c = spawnTribe(i, { player: true, name, tech: 0.03 });
    if (!c) return null; player = c.id; st.player = player; c.wealth = 60; c.expansion = 0.8;
    if (site) { siteU[i] = site[0]; siteV[i] = site[1]; } else if (siteU[i] < 0) { siteU[i] = 0.5; siteV[i] = 0.5; }
    level[i] = Math.max(level[i], 1);
    for (let k = 0; k < 8; k++) { const n = nbOf(i, k); if (n >= 0 && land[n] && owner[n] < 0 && fert[n] > 0.05 && !iced(n)) { owner[n] = c.id; pop[n] += 0.3; } }
    return c;
  }
  // what a realm can build: cost (scaled by size and knowledge), years to finish (quicker in later ages), whether it needs a plot, and what it does
  const BUILD = {
    settle: { cost: 25, dur: 0, slot: false, name: 'Settle', desc: 'Claim land touching your border; a village stands there.' },
    farm: { cost: 40, dur: 6, slot: false, name: 'Farms', desc: 'Fields, irrigation and farmsteads around the town. Feeds 22% more per level (5 levels).', max: 5 },
    walls: { cost: 60, dur: 12, slot: false, name: 'Walls', desc: 'A ring of walls with gates and towers. Each level makes the town much harder to take (3 levels).', max: 3 },
    port: { cost: 90, dur: 10, slot: false, name: 'Harbour', desc: 'Piers and warehouses on the shore. Trade income, ships, and colonies across the sea.' },
    market: { cost: 70, dur: 8, slot: true, name: 'Market', desc: 'A market quarter. +4% income, and trade goods earn more.' },
    temple: { cost: 80, dur: 12, slot: true, name: 'Temple', desc: 'A temple quarter. +3% stability; faith spreads from here.' },
    academy: { cost: 150, dur: 14, slot: true, name: 'Academy', desc: 'Scholars and a library. Insight grows by up to half as much again, as more of your towns have one.' },
    mine: { cost: 110, dur: 10, slot: true, name: 'Mine', desc: 'Works what this land yields, in earnest: more than twice as much of it comes to market.' },
    workshop: { cost: 60, dur: 8, slot: true, ind: true, name: 'Workshops', desc: 'Potters, tanners, glassmakers, papermakers and jewellers under one roof. Their work costs a third less.' },
    weaver: { cost: 60, dur: 8, slot: true, ind: true, name: 'Weaving house', desc: 'Looms for wool, cotton and flax. Cloth costs a third less to make.' },
    smithy: { cost: 80, dur: 10, slot: true, ind: true, name: 'Smithy', desc: 'Forges for bronze, tools, arms and guns. Metalwork costs a third less.' },
    brewery: { cost: 50, dur: 6, slot: true, ind: true, name: 'Brewery', desc: 'Brewers and distillers. Beer and spirits cost a third less to make.' },
    granary: { cost: 50, dur: 6, slot: true, ind: true, name: 'Granary', desc: 'Food keeps: far less of the stored harvest rots, so a bad year does less harm.' },
    warehouse: { cost: 80, dur: 8, slot: true, ind: true, name: 'Warehouse', desc: 'Merchants hold half as much again, so more passes through your markets and more reaches them.' },
    shipyard: { cost: 120, dur: 12, slot: true, ind: true, name: 'Shipyard', desc: 'Slips and sheds by the harbour. Ships cost a third less to build.' },
    factory: { cost: 260, dur: 10, slot: true, ind: true, name: 'Factory', desc: 'Steel, engines, mills and motor works. Heavy industry costs a third less.' },
    refinery: { cost: 320, dur: 10, slot: true, ind: true, name: 'Refinery', desc: 'Fuel, plastics, aluminium and powder. Chemical work costs a third less.' },
    lab: { cost: 400, dur: 10, slot: true, ind: true, name: 'Electronics works', desc: 'Clean rooms and assembly lines. Electronics cost a third less to make.' },
    wonder: { cost: 420, dur: 60, slot: true, name: 'Wonder', desc: 'A work of ages in the capital. +5% stability, remembered forever.' },
    capital: { cost: 200, dur: 0, slot: false, name: 'Move capital', desc: 'The court moves to this town.' },
    levy: { cost: 120, dur: 0, slot: false, name: 'Levy', desc: 'Raise a host for a generation or two. It takes the field here, and goes where you send it: it takes enemy land region by region, lays siege to walled towns and fights the hosts it meets.' },
    fleet: { cost: 100, dur: 0, slot: false, name: 'Fleet', desc: 'Ships of war at this harbour. They carry your host over the sea where no road runs by land, and fight the ships they meet.' },
  };
  const COST = {}; for (const k in BUILD) COST[k] = BUILD[k].cost; COST.develop = COST.farm; COST.fortify = COST.walls;
  const DUR_ERA = [1.4, 1.2, 1.1, 1, 1, 0.9, 0.6, 0.4, 0.3];
  const durOf = (kind, era) => BUILD[kind].dur ? Math.max(1, Math.round(BUILD[kind].dur * DUR_ERA[Math.min(8, era)])) : 0;
  const levyYears = (c) => Math.max(30, RULE.PACE[c.era] * 2);
  function costOf(kind) { const c = playerCiv(); const f = c ? (1 + c.tech * 4 + Math.sqrt(popOf[c.id]) / 40) * (BUILD[kind] && BUILD[kind].dur ? buildCost(c.id) : 1) * (kind === 'levy' ? RF[c.id * NRF + RK.levy] : 1) : 1; return Math.round((COST[kind] || 0) * f); }
  const SLOT_SHIFT = { temple: 0, academy: 4, market: 8, wonder: 12 };
  const indAt = (i, kind) => { const a = ind.get(i); return a ? a[IND.indexOf(kind)] : 0; };      // plot + 1 of a workshop of this kind here, or 0
  const slotOf = (i, kind) => kind === 'mine' ? (slotB[i] & 15) - 1 : SLOT_SHIFT[kind] !== undefined ? ((slotA[i] >> SLOT_SHIFT[kind]) & 15) - 1 : BUILD[kind] && BUILD[kind].ind ? indAt(i, kind) - 1 : -1;
  const setSlot = (i, kind, slot) => { if (kind === 'mine') slotB[i] = (slotB[i] & 0xF0) | ((slot + 1) & 15); else if (SLOT_SHIFT[kind] !== undefined) slotA[i] = (slotA[i] & ~(15 << SLOT_SHIFT[kind])) | (((slot + 1) & 15) << SLOT_SHIFT[kind]); };
  const NSLOTS = 12;
  function usedSlots(i) { const used = new Set(); for (const k of ['temple', 'academy', 'market', 'wonder', 'mine']) { const sl = slotOf(i, k); if (sl >= 0) used.add(sl); } const a = ind.get(i); if (a) for (let k = 0; k < a.length; k++) if (a[k]) used.add(a[k] - 1); const w = works.get(i); if (w) for (const x of w) if (x.slot >= 0) used.add(x.slot); return used; }
  // what the work on a cell's own good is called: a mine, a quarry, a vineyard...
  const WORK_NAME = { stone: 'Quarry', salt: 'Saltworks', oil: 'Oil field', gas: 'Gas field', fish: 'Fishery', cattle: 'Ranch', horses: 'Stud farm', wool: 'Sheep run', timber: 'Lumber camp', furs: 'Trapping post', ivory: 'Hunting camp', wine: 'Vineyard', olives: 'Olive groves', silk: 'Silk farm', amber: 'Amber diggings', grain: 'Great farm', rice: 'Paddy estate', maize: 'Great farm' };
  const workName = (i) => { const g = goods[i] ? GOODS[goods[i]] : null; return !g ? 'Mine' : WORK_NAME[g.key] || (g.mine ? 'Mine' : 'Plantation'); };
  function freeSlots(i) { const used = usedSlots(i); const out = []; for (let k = 0; k < NSLOTS; k++) if (!used.has(k)) out.push(k); return out; }
  const inProgress = (i, kind) => { const w = works.get(i); return w ? w.find(x => x.k === kind) || null : null; };
  // can this realm start this work here? returns null when it can, else the reason
  function cannot(c, kind, i) {
    const B = BUILD[kind]; if (!B) return 'Unknown work';
    const lack = (work, lv) => { const D = know.lacks(c.id, work, lv); return D ? `Needs ${D.name}` : null; };
    if (kind === 'levy') return lack('levy') || (year < c.army ? 'An army is already in the field' : null);
    if (kind === 'fleet') return lack('fleet') || (i < 0 || owner[i] !== c.id ? 'Not your land' : !(special[i] & 1) ? 'Needs a harbour' : army.fleetsOf(c.id).length >= 3 ? 'Three fleets are all your harbours can keep' : null);
    if (i < 0 || !land[i]) return 'That is not land';
    if (kind === 'settle') {
      if (owner[i] === c.id) return 'Already yours';
      if (owner[i] >= 0 && !isAtWar(c, owner[i])) return 'That land belongs to a state you are not at war with';
      let adj = false; for (let k = 0; k < 8; k++) { const n = nbOf(i, k); if (n >= 0 && owner[n] === c.id) adj = true; }
      if (!adj) return 'Must touch your border'; if (flags[i] & 8) return 'Nothing lives on the ice'; return null;
    }
    if (owner[i] !== c.id) return 'Not your land';
    if (inProgress(i, kind)) return 'Already being built';
    if (kind === 'farm') return infra[i] >= 5 ? 'Fully farmed' : lack('farm', infra[i] + 1) || (level[i] < 1 ? 'Needs a settlement' : null);
    if (kind === 'walls') return walls[i] >= 3 ? 'Fully fortified' : lack('walls', walls[i] + 1) || (level[i] < 1 ? 'Needs a settlement' : null);
    if (kind === 'port') return lack('port') || (!(flags[i] & 4) ? 'Needs a coast' : (special[i] & 1) ? 'Already a harbour' : level[i] < 1 ? 'Needs a settlement' : null);
    if (kind === 'academy') return lack('academy') || (level[i] < 2 ? 'Needs a town or city' : (special[i] & 2) ? 'Already has an academy' : null);
    if (kind === 'temple') return lack('temple') || (level[i] < 1 ? 'Needs a settlement' : (special[i] & 4) ? 'Already has a temple' : null);
    if (kind === 'market') return lack('market') || (level[i] < 1 ? 'Needs a settlement' : (special[i] & 8) ? 'Already has a market' : null);
    if (B.ind) {
      if (indAt(i, kind)) return 'Already built here';
      const no = lack(kind); if (no) return no;
      if (kind === 'shipyard') return !(special[i] & 1) ? 'Needs a harbour' : null;
      if (kind === 'smithy' || kind === 'warehouse' || kind === 'factory' || kind === 'refinery' || kind === 'lab') return level[i] < 2 ? 'Needs a town or city' : null;
      return level[i] < 1 ? 'Needs a settlement' : null;
    }
    if (kind === 'mine') { const g = goods[i] ? GOODS[goods[i]] : null; if (!g) return 'This land yields nothing to work'; const D = know.estate(c.id, goods[i]); return D ? `Needs ${D.name}` : c.era < gera[i] ? `Your people cannot yet work ${g.name.toLowerCase()}` : (special[i] & 512) ? 'Already mined' : level[i] < 1 ? 'Needs a settlement' : null; }
    if (kind === 'wonder') return lack('wonder') || (i !== c.capital ? 'Wonders rise in the capital' : level[i] < 2 ? 'The capital must be a town first' : (special[i] & 16) ? 'The capital already has its wonder' : null);
    if (kind === 'capital') return level[i] < 2 ? 'A capital needs at least a town' : c.capital === i ? 'Already the capital' : null;
    return null;
  }
  // start a work: pay now, finish in dur years (finishWorks applies the effect)
  function startWork(c, kind, i, slot, cost) {
    const B = BUILD[kind]; c.wealth -= cost;
    if (kind === 'levy') { const n = levyYears(c); c.army = year + n; logEvent(c, `${c.ruler.title} ${c.ruler.name} raises a great army`, false); const a = army.raise(c, i); return a ? `${a.name} takes the field for ${n} years: ${army.fmtMen(a.men)}` : `Army raised for ${n} years`; }
    if (kind === 'fleet') { const f = army.buildFleet(c, i); return `${f.name} puts to sea: ${f.ships} ships`; }
    if (kind === 'settle') { claim(i, c, -1); pop[i] += 0.4; return `Settled ${cellName.get(i) || 'new land'}`; }
    if (kind === 'capital') { c.capital = i; logEvent(c, `The court moves to ${cellName.get(i)}`, false); return 'Capital moved'; }
    let sl = -1; if (B.slot) { const free = freeSlots(i); if (!free.length) { c.wealth += cost; return 'No room left around the town'; } sl = free.includes(slot) ? slot : free[rint(free.length)]; }
    const dur = durOf(kind, c.era); const list = works.get(i) || []; list.push({ k: kind, slot: sl, start: year, dur }); works.set(i, list);
    return `${kind === 'mine' ? workName(i) : B.name} under construction · ${dur} year${dur === 1 ? '' : 's'}`;
  }
  function applyWork(c, i, w) {
    const k = w.k; if (k === 'farm') infra[i] = Math.min(5, infra[i] + 1); else if (k === 'walls') walls[i] = Math.min(3, walls[i] + 1); else if (k === 'port') special[i] |= 1; else if (k === 'academy') special[i] |= 2; else if (k === 'temple') special[i] |= 4; else if (k === 'market') special[i] |= 8; else if (k === 'mine') special[i] |= 512;
    else if (BUILD[k].ind) { let a = ind.get(i); if (!a) ind.set(i, a = new Uint8Array(IND.length)); a[IND.indexOf(k)] = Math.max(1, w.slot + 1); }
    else if (k === 'wonder') { special[i] = (special[i] & ~(15 << 5)) | 16 | ((c ? c.era : 0) << 5); if (c) logEvent(c, `${fullName(c)} completes a wonder at ${cellName.get(i)}`, true, 'state', i); }
    if (w.slot >= 0) setSlot(i, k, w.slot);
    if (c && c.player && k !== 'wonder') logEvent(c, `${k === 'mine' ? workName(i) : BUILD[k].name} finished at ${cellName.get(i) || 'the town'}`, false, 'city', i);
  }
  function finishWorks() {
    for (const [i, list] of works) {
      const o = owner[i]; const c = o >= 0 ? civs[o] : null;
      if (!c) { works.delete(i); continue; } // the town fell: half-built works are lost
      for (let k = list.length - 1; k >= 0; k--) { const w = list[k]; if (year >= w.start + w.dur) { applyWork(c, i, w); list.splice(k, 1); } }
      if (!list.length) works.delete(i);
    }
  }
  // AI works: every state spends its treasury on markets, temples, academies, harbours, walls and, for the great powers, wonders
  function rankOf(cv) { let r = 1; const p = popOf[cv.id]; for (const o of civs) if (o && o !== cv && popOf[o.id] > p) r++; return r; }
  function aiBuild(cv) {
    if (cv.player || cv.wealth < 30 || rnd() > 0.3 * tv(cv, 'buildRate', 1)) return;
    const c = cv.id; const f = (1 + cv.tech * 4 + Math.sqrt(popOf[c]) / 40) * 0.6 * buildCost(c);
    const i = rnd() < 0.45 ? cv.capital : bestCell[c]; if (i < 0 || owner[i] !== c || !level[i]) return;
    const e = cv.era, lv = level[i]; const opts = [];
    const ok = (k) => !cannot(cv, k, i);      // (its age no longer decides what it may raise: what it has learned does)
    if (!(special[i] & 8) && ok('market')) opts.push(['market', 8]);
    if (!(special[i] & 4) && (cv.religion || e >= 2) && ok('temple')) opts.push(['temple', 4]);
    if (lv >= 2 && !(special[i] & 2) && ok('academy')) opts.push(['academy', 2]);
    if (e >= 2 && (flags[i] & 4) && !(special[i] & 1) && ok('port')) opts.push(['port', 1]);
    if (e >= 1 && e <= 5 && lv >= 2 && walls[i] < (e >= 4 ? 3 : 2) && (warsOf(cv) || rnd() < 0.5) && ok('walls')) opts.push(['walls', 0]);
    if (infra[i] < 5 && rnd() < 0.5 && ok('farm')) opts.push(['farm', 0]);
    if (goods[i] && !(special[i] & 512) && (GOODS[goods[i]].mine || rnd() < 0.4) && ok('mine')) opts.push(['mine', 512]);
    if (i === cv.capital && !(special[i] & 16) && lv >= 2 && rankOf(cv) <= 4 && ok('wonder')) opts.push(['wonder', 16]);
    if (!opts.length) return;
    const want = tv(cv, 'build', null); const pref = want ? opts.filter(o => want.includes(o[0])) : []; const from = pref.length && rnd() < 0.7 ? pref : opts;
    const [k] = from[Math.floor(rnd() * from.length)]; const cost = COST[k] * f; if (cv.wealth < cost || inProgress(i, k)) return;
    const w = works.get(i); if (w && w.length >= 2) return; // one or two sites at a time
    startWork(cv, k, i, -1, cost);
    if (k === 'wonder') logEvent(cv, `${fullName(cv)} begins a wonder at ${cellName.get(i)}`, cellsOf[c] > 60, 'state', i);
  }
  // hunger: when a realm that was fed finds itself with less than half the food it wants, the chronicle hears of it
  // (always in the player's realm, now and then elsewhere), and the people are restless for it
  function hungerWatch() {
    if (market.steps < 30) return;
    for (let c = 0; c < MAXC; c++) {
      const cv = civs[c]; if (!cv) continue; const f = satOf(c, 'food'); const was = cv.fed === undefined ? 1 : cv.fed; cv.fed = f;
      if (f >= 0.45 || was < 0.45 || year - (cv.hungerAt || -1e9) < 30) continue;
      cv.hungerAt = year; cv.stability = Math.max(0, cv.stability - 0.06);
      if (cv.player || (cellsOf[c] > 80 && rnd() < 0.25)) logEvent(cv, `${pick(['Famine', 'Hunger', 'A failed harvest'])} in ${fullName(cv)}: there is bread for ${Math.round(f * 100)} in a hundred`, cellsOf[c] > 300 || cv.player, 'disaster');
    }
  }
  // AI workshops: now and then a state raises one in its capital or its greatest town, of a kind its age and its goods call for
  function aiIndustry(cv) {
    if (cv.player || cv.wealth < 60 || rnd() > 0.12 * tv(cv, 'buildRate', 1)) return;
    const c = cv.id; const i = rnd() < 0.5 ? cv.capital : bestCell[c]; if (i < 0 || owner[i] !== c || !level[i]) return;
    const w = works.get(i); if (w && w.length >= 2) return; if (freeSlots(i).length < 3) return;      // (plots are kept for the temple, the market and the rest)
    const b = c * NG; const has = (key) => held[b + GOOD_ID[key]] || market.imp[b + GOOD_ID[key]] > 0; const opts = [];
    for (const k of IND) { if (cannot(cv, k, i)) continue; if (k === 'smithy' && !(has('copper') || has('iron'))) continue; if (k === 'brewery' && !(has('grain') || has('sugar') || has('wine'))) continue; opts.push(k); }
    if (!opts.length) return; const k = opts[Math.floor(rnd() * opts.length)];
    const cost = COST[k] * (1 + cv.tech * 4 + Math.sqrt(popOf[c]) / 40) * 0.6 * buildCost(c); if (cv.wealth < cost) return;
    startWork(cv, k, i, -1, cost);
  }
  function act(kind, i, slot) {
    if (kind === 'develop') kind = 'farm'; if (kind === 'fortify') kind = 'walls';
    const c = playerCiv(); if (!c) return 'No state';
    if (!BUILD[kind]) return 'Unknown action';
    const why = cannot(c, kind, i); if (why) return why;
    const cost = costOf(kind); if (c.wealth < cost) return `Not enough in the treasury (${cost} needed)`;
    const msg = startWork(c, kind, i, slot === undefined ? -1 : slot, cost);
    if (kind === 'wonder') logEvent(c, `${fullName(c)} begins a wonder at ${cellName.get(i)}`, true, 'state', i);
    return msg;
  }
  // the player goes to war (with the best reason he has, or the one named), or asks for peace as things stand: null when done, else why not
  function playerWar(targetId, cause) { const c = playerCiv(); const t = civs[targetId]; if (!c || !t || c === t) return 'Nobody there'; return isAtWar(c, targetId) ? diplo.sue(c, t, 'white') : diplo.declare(c, t, cause); }
  function renamePlayer(name) { const c = playerCiv(); if (c && name.trim()) { c.name = name.trim().slice(0, 28); } }
  // the player's faith (the laws screen, gov.js): what each step costs, then the step itself (null when done, else why not).
  // To found a faith where a prophet has arisen costs nothing, by the realm's own priests some authority; to take up another
  // costs authority by how few of the realm's people hold it, and its old priests' goodwill where most of them keep the old
  // faith; missionaries cost coin and go for two turns; a church of one's own costs much authority, and stands far from the
  // holy city or once books are printed.
  const FAITH_FOUND = 60, FAITH_CHURCH = 90;
  function faithCosts() {
    const c = playerCiv(); if (!c) return null; const s = faith.state[c.id], F = faith.list[s]; const sh = (f) => { const x = faith.faithsOf(c.id, 12).find((q) => q[0] === f); return x ? x[1] : 0; };
    const mine = s ? sh(s) : 0; const far = !!F && F.home >= 0 && owner[F.home] !== c.id && c.capital >= 0 && (cellDist(c.capital, F.home) > FAITH.SPLIT[c.era] || know.has[c.id * know.ND + KNOW.ID.printing] === 1);
    return { found: faith.pending[c.id] >= 0 ? 0 : FAITH_FOUND, canFound: !s && (faith.pending[c.id] >= 0 || know.can(c.id, 'faith')), adopt: (f) => Math.round(25 + 65 * (1 - sh(f))), shake: mine > 0.5 ? 0.08 : 0,
      mission: Math.round(60 + 45 * c.era), missionYears: 2 * RULE.PACE[c.era], church: FAITH_CHURCH, canChurch: !!F && far, auth: rule.ruleOf(c).auth, world: know.has[c.id * know.ND + KNOW.ID.scripture] === 1 };
  }
  function faithAct(what, arg, arg2) {
    const c = playerCiv(); if (!c) return 'No realm'; const K = faithCosts(), R = rule.ruleOf(c); let why = null;
    if (what === 'found') { if (!K.canFound) return faith.state[c.id] ? 'Your realm has a faith' : 'Needs ' + KNOW.LIST[KNOW.ID.priesthood].name; if (R.auth < K.found) return `Needs ${K.found} authority`; why = faith.playerFound(c.id, arg, arg2); if (!why) R.auth -= K.found; }
    else if (what === 'adopt') { const cost = K.adopt(arg); if (R.auth < cost) return `Needs ${cost} authority`; why = faith.playerAdopt(c.id, arg); if (!why) { R.auth -= cost; c.stability = Math.max(0, c.stability - K.shake); } }
    else if (what === 'mission') { const t = civs[arg]; if (!t) return 'No such realm'; if (c.wealth < K.mission) return `Needs ${K.mission} coin`; why = faith.sendMission(c.id, arg, K.missionYears); if (!why) { c.wealth -= K.mission; logEvent(c, `Missionaries of ${faith.nameOf(faith.state[c.id])} go out from ${fullName(c)} to ${fullName(t)}`, false, 'faith', t.capital); } }
    else if (what === 'church') { if (!K.canChurch) return 'Your capital is too near the holy city, and nobody prints books yet'; if (R.auth < K.church) return `Needs ${K.church} authority`; why = faith.playerChurch(c.id) || null; if (!why) R.auth -= K.church; }
    faithNews(); return why;
  }

  // ---------- serialisation (compact: fits browser storage) ----------
  function save() {
    const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
    const p8 = new Uint8Array(N); for (let i = 0; i < N; i++) p8[i] = Math.min(255, Math.round(Math.log2(pop[i] * 20 + 1) * 16)); // log scale
    const runs = []; let cur = owner[0], len = 0; for (let i = 0; i < N; i++) { if (owner[i] === cur) len++; else { runs.push(cur, len); cur = owner[i]; len = 1; } } runs.push(cur, len);
    const sparse = (arr) => { const out = []; for (let i = 0; i < N; i++) if (arr[i]) out.push(i, arr[i]); return out; };
    const bonus = []; for (let i = 0; i < N; i++) if (Math.abs(bonusFert[i]) > 0.005) bonus.push(i, Math.round(bonusFert[i] * 100));
    const names = []; for (const [k, v] of cellName) if (level[k] || civs.some(c => c && c.capital === k)) names.push(k, v);
    const sites = []; for (let i = 0; i < N; i++) if (siteU[i] >= 0 && level[i]) sites.push(i, Math.round(siteU[i] * 100), Math.round(siteV[i] * 100));
    for (const c of civs) if (c && c.rule) c.rule.tr = market.gdp[c.id] > 0 ? +((market.impV[c.id] + market.expV[c.id]) / (2 * market.gdp[c.id])).toFixed(5) : c.rule.tr || 0;
    return {
      v: 2, year, tickCount, player, rs, seed,
      pop: b64(p8), owner: runs, infra: sparse(infra), walls: sparse(walls), special: sparse(special), peak: sparse(peak), slotA: sparse(slotA), slotB: sparse(slotB), bonus, names, sites,
      works: [...works.entries()].map(([i, l]) => [i, l.map(w => [w.k, w.slot, w.start, w.dur])]), grow: (() => { const g = []; for (let i = 0; i < N; i++) if (gBand[i] && year - gYear[i] < 80) g.push(i, gBand[i], gPrev[i], gYear[i]); return g; })(),
      ruins: [...ruins.entries()].slice(-600), volc: volcanoes.map(v => [v.last, v.erupting]), comet,
      civs: civs.map(c => c ? { ...c, events: c.events.slice(c.player ? -30 : cellsOf[c.id] > 20 ? -15 : -6), rulers: c.rulers.slice(-3) } : null), /* (the reigns of a realm are its houses' lines now: dynasty.js; a save is better small) */ worldEvents: worldEvents.slice(-200), history: history.filter((h, i) => i % 2 === 0 || i > history.length - 40),
      econ: market.save(), ind: [...ind.entries()].map(([i, a]) => [i, Array.from(a)]), know: know.save(), armies: army.save(), peoples: people.save(), faiths: faith.save(), culture: culture.save(), finance: finance.save(), dynasty: dynasty.save(), story: story ? story.save() : undefined, legacy: legacy ? legacy.save() : undefined, intrigue: intrigue ? intrigue.save() : undefined, disease: disease ? disease.save() : undefined, climate: climate && landOn ? climate.save() : undefined, cal: calShift, heard: { press: rule.abroad.press, peoples: rule.abroad.peoples }, food: foodTab === FOOD_015 ? 15 : undefined, land: landOn ? 1 : undefined,
    };
  }
  function load(s) {
    const u8 = (str) => { const bin = atob(str); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
    year = s.year; tickCount = s.tickCount; player = s.player; rs = s.rs >>> 0;
    landOn = LM && s.land === 1;      // (a world saved before the land had kinds goes on as it was, and with the table of food it was saved under)
    foodTab = landOn ? FOOD : s.food === 15 || s.heard === undefined ? FOOD_015 : FOOD_037; FM0 = lerpTable(foodTab, 0); warCnt.fill(-1);      // (see FOOD_015)
    if (climate) { climate.load(landOn ? s.climate : null); applyWet(); }      // (a world saved before the weather begins with the climate of its year: what had begun is not news)
    const p8 = u8(s.pop); for (let i = 0; i < N; i++) pop[i] = p8[i] ? (Math.pow(2, p8[i] / 16) - 1) / 20 : 0;
    owner.fill(-1); { let i = 0; for (let k = 0; k < s.owner.length; k += 2) { const v = s.owner[k], n = s.owner[k + 1]; for (let q = 0; q < n; q++) owner[i++] = v; } }
    infra.fill(0); walls.fill(0); special.fill(0); bonusFert.fill(0); level.fill(0);
    for (let k = 0; k < s.infra.length; k += 2) infra[s.infra[k]] = s.infra[k + 1];
    for (let k = 0; k < s.walls.length; k += 2) walls[s.walls[k]] = s.walls[k + 1];
    for (let k = 0; k < s.special.length; k += 2) special[s.special[k]] = s.special[k + 1];
    peak.fill(0); if (s.peak) for (let k = 0; k < s.peak.length; k += 2) peak[s.peak[k]] = s.peak[k + 1];
    slotA.fill(0); if (s.slotA) for (let k = 0; k < s.slotA.length; k += 2) slotA[s.slotA[k]] = s.slotA[k + 1]; slotB.fill(0); if (s.slotB) for (let k = 0; k < s.slotB.length; k += 2) slotB[s.slotB[k]] = s.slotB[k + 1];
    ind.clear(); if (s.ind) for (const [i, a] of s.ind) { const u = new Uint8Array(IND.length); u.set(a.slice(0, IND.length)); ind.set(+i, u); }
    works.clear(); if (s.works) for (const [i, l] of s.works) works.set(+i, l.map(([k, slot, start, dur]) => ({ k, slot, start, dur })));
    gBand.fill(0); gPrev.fill(0); gYear.fill(-1e9); if (s.grow) for (let k = 0; k < s.grow.length; k += 4) { gBand[s.grow[k]] = s.grow[k + 1]; gPrev[s.grow[k]] = s.grow[k + 2]; gYear[s.grow[k]] = s.grow[k + 3]; }
    ruins.clear(); if (s.ruins) for (const [k, v] of s.ruins) ruins.set(+k, v); if (s.volc) s.volc.forEach((v, k) => { if (volcanoes[k]) { volcanoes[k].last = v[0]; volcanoes[k].erupting = v[1]; } }); if (s.comet !== undefined) comet = s.comet;
    fires.length = 0; floods.length = 0; quakes.length = 0; battles.length = 0; plagues.length = 0; rubble.clear();
    for (let k = 0; k < s.bonus.length; k += 2) bonusFert[s.bonus[k]] = s.bonus[k + 1] / 100;
    cellName.clear(); for (let k = 0; k < s.names.length; k += 2) cellName.set(s.names[k], s.names[k + 1]);
    siteU.fill(-1); if (s.sites) for (let k = 0; k < s.sites.length; k += 3) { siteU[s.sites[k]] = s.sites[k + 1] / 100; siteV[s.sites[k]] = s.sites[k + 2] / 100; }
    civs.fill(null); freeIds.length = 0; civCount = 0;
    for (let c = MAXC - 1; c >= 0; c--) { if (s.civs[c]) { civs[c] = s.civs[c]; civCount++; if (civs[c].eraSince === undefined) civs[c].eraSince = year - 500; } else freeIds.push(c); }
    worldEvents.length = 0; worldEvents.push(...s.worldEvents); history.length = 0; if (s.history) history.push(...s.history);
    // what each realm knows; a world saved before there were discoveries is given what its knowledge is worth, the way the autopilot would have learned it
    const hadKnow = know.load(s.know); if (!hadKnow) for (let c = 0; c < MAXC; c++) if (civs[c]) { know.born(c, -1, civs[c].tech); know.settle(c, civs[c]); }
    recount(); countIndustry(); st.year = year; st.civCount = civCount; st.player = player;
    calShift = hadKnow ? s.cal || 0 : Math.max(0, histYearOf(frontTech) - year);      // (a world from before the calendar keeps its own: see calShift)
    // how each realm is governed; a world saved before there were laws is given the form its old name says and the laws of its age
    for (let c = 0; c < MAXC; c++) if (civs[c]) { if (!rule.wake(c, civs[c])) rule.settle(c, civs[c]); } rule.hear(s.heard);
    for (let c = 0; c < MAXC; c++) if (civs[c]) diplo.wake(c, civs[c]);      // (a world saved before diplomacy: nobody has sworn anything yet)
    recount(); countIndustry();      // (again: what the land feeds and what workshops make depend on the laws just read)
    // the market as it was left; a world saved before there was one gets thirty quiet years to find its prices
    if (!market.load(s.econ)) { for (let c = 0; c < MAXC; c++) if (civs[c]) market.born(c, -1, 0); touchAll(); market.warm(30); } else touchAll();
    for (let c = 0; c < MAXC; c++) if (civs[c]) know.around(c, lastNb[c]);
    army.load(s.armies);      // (a world saved before there were hosts has none in the field)
    if (!people.load(s.peoples)) people.settle();      // (a world saved before there were peoples: every realm's land its own people's)
    if (!faith.load(s.faiths)) faith.settle();      // (a world saved before faiths had regions: every realm's land of its realm's faith)
    culture.load(s.culture);      // (a world saved before culture has had no great people yet)
    finance.load(s.finance);      // (a world saved before finance owes nothing, and has no houses yet)
    if (!dynasty.load(s.dynasty)) dynasty.settle();      // (a world saved before dynasties: its rulers become people, of houses of their names where they rule by blood)
    if (story) story.load(s.story);
    if (intrigue) intrigue.load(s.intrigue);      // (the schemes under way are on the realms: civ.intrigue; a world saved before them has none)
    if (disease) disease.load(s.disease);      // (a world saved before sickness travelled has none under way, and its peoples have had nothing yet)
    if (legacy) { legacy.load(s.legacy); if (!s.legacy) legacy.settle(); }      // (a world from before legacies: each realm begins in its own age with nothing remembered)      // (what each realm's stories left behind is on the realm: civ.story; a world saved before stories begins without)
  }
  // who touches whom by land, read off the map (the tick keeps it up from border contacts afterwards)
  function touchAll() {
    const sets = new Map();
    for (let k = 0; k < LI.length; k++) { const i = LI[k]; const o = owner[i]; if (o < 0) continue; for (const d of [1, W]) { const y = (i / W) | 0; const j = d === 1 ? y * W + ((i - y * W + 1) % W) : i + W; if (j >= N) continue; const on = owner[j]; if (on >= 0 && on !== o) { let a = sets.get(o); if (!a) sets.set(o, a = new Set()); a.add(on); let b = sets.get(on); if (!b) sets.set(on, b = new Set()); b.add(o); } } }
    for (let c = 0; c < MAXC; c++) { const l = civs[c] && sets.has(c) ? [...sets.get(c)].filter(b => civs[b]) : null; lastNb[c] = l; nearNb[c] = l; market.touch(c, l); }
  }
  // rebuild everything the tick derives from the cell arrays (levels, per-realm totals, strengths) so a loaded or edited world reads right before its first year runs
  function recount() {
    popOf.fill(0); cellsOf.fill(0); acad.fill(0); temples.fill(0); ports.fill(0); markets.fill(0); wonders.fill(0); mines.fill(0); bestPop.fill(-1); rawPop.fill(0); held.fill(0); urban.fill(0); portCells.fill(-1);
    townsOf.fill(0); frontTech = 0; bandHi.fill(0); peakAt.fill(0);
    for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv) continue; fmOf[c] = fmNow(cv); if (landOn) landRow(cv); if (cv.tech > frontTech) frontTech = cv.tech; }
    for (let k = 0; k < LI.length; k++) {
      const i = LI[k]; const o = owner[i]; const c = o >= 0 ? civs[o] : null; const p = pop[i];
      if (!c) { level[i] = 0; continue; }
      popOf[o] += p; cellsOf[o]++;
      if (special[i] & 1) { if (ports[o] < 4) portCells[o * 4 + ports[o]] = i; ports[o]++; } if (special[i] & 2) acad[o]++; if (special[i] & 4) temples[o]++; if (special[i] & 8) markets[o]++; if (special[i] & 16) wonders[o]++; if (special[i] & 512) mines[o]++;
      if (p > 0.05) yieldsOf(i, o, c, p);
      if (p > bestPop[o]) { bestPop[o] = p; bestCell[o] = i; }
      const fm = fmOf[o]; const s1 = 6 * fm + 0.2, s2 = 25 * fm + 1, s3 = 90 * fm + 4, s4 = 300 * fm + 15;
      level[i] = p >= s4 ? 4 : p >= s3 ? 3 : p >= s2 ? 2 : p >= s1 ? 1 : 0; if (level[i] >= 2) { urban[o] += p; townsOf[o]++; }
      if (c.capital === i && level[i] < 1) level[i] = 1;
      if (level[i] && !cellName.has(i)) cellName.set(i, people.nameAt(i, c) || makeName(c.style, 2, 3));
      if (level[i] && !gBand[i]) { gBand[i] = Math.min(255, Math.round(Math.log2(p * 1000 + 1) * 3)); gPrev[i] = gBand[i]; }
    }
    for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv) continue; if (cv.capital < 0 || owner[cv.capital] !== c) cv.capital = bestCell[c]; strengthOf[c] = strength(cv, 0, 0); mightOf[c] = strength(cv, popOf[c], mines[c]); }
  }

  return {
    W, H, N, MAXC, pop, owner, infra, walls, special, level, cellName, civs, LI, fert, land, flags, elev, bonusFert, siteU, siteV,
    BUILD, works, slotA, slotB, gBand, gPrev, gYear, NSLOTS, slotOf, freeSlots, inProgress, durOf, cannot(kind, i) { const c = playerCiv(); return c ? cannot(c, kind, i) : 'No state'; },
    popOf, cellsOf, strengthOf, mightOf, acad, temples, ports, markets, wonders, worldEvents, allEvents, history, ERAS, COST,
    volcanoes, fires, floods, quakes, battles, plagues, ruins, rubble, get comet() { return comet; },
    goods, gera, GOODS, GOOD_ID, market, rawPop, held, urban, satOf, touchAll, IND, ind, indN, indAt, workName, eff,
    know, insightParts, reachFor, townsOf, rule, diplo, get army() { return army; }, get people() { return people; }, get faith() { return faith; }, get culture() { return culture; }, get finance() { return finance; }, get dynasty() { return dynasty; }, succKind, covetOf, spanOf, levyYears, stabilityParts: stabParts, govName: (c) => RULE.FORM[rule.ruleOf(c).gov].name,
    // the year in which history's first realm had come to know this much (for the page: how far ahead of its time a realm is)
    // the year in which the first peoples knew this much, by this world's calendar (history's own, unless the world came from before the calendar)
    homeOf, get landOn() { return landOn; }, forageCap: (i) => (landOn ? forA[i] * WSCALE * 30 * FM0 * RCF[flags[i] & 6] * (1 + bonusFert[i] * 2) : 0), apart: (c) => landOn && wfOf[c] < 1,
    landOf: (c) => { if (!landOn) return []; const n = new Uint32Array(NLC); for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] === c) n[kcls[i]]++; } return Array.from(n).map((v, k) => [k, v]).filter((x) => x[1] > 0).sort((x, y) => y[1] - x[1]); }, landClass: (i) => (landOn ? kcls[i] : -1), farmland: (i) => (landOn ? farmA[i] / Math.max(0.08, cosLat[(i / W) | 0]) : fert[i]),
    histYear(t) { return histYearOf(t) - calShift; }, get calShift() { return calShift; }, foodMult, get foodOld() { return foodTab === FOOD_015; },
    cellDist, claim, splitCiv,      // (a region changing hands, a province breaking away: for the tests)
    // where a realm's yearly income comes from (the same sum the tick makes), for the ledger
    incomeParts(cv) {
      // (how the people lived and what the customs took as the year's income was reckoned: the market moves on after it, and the ledger is the income's)
      const c = cv.id, ro = c * NRF, base = popOf[c] * (0.06 + cv.tech * 0.3) * cv.policy.tax * tv(cv, 'income', 1) * KF[c * NKF + KK.income] * RF[ro + RK.tax] * (finance ? finance.taxF(c) : 1), living = cv.trade ? cv.trade.living : market.LS[c], rev = cv.trade ? cv.trade.customs : market.rev[c];
      const parts = { taxes: base, ports: base * ports[c] * 0.05, markets: base * Math.min(0.3, markets[c] * 0.04), mines: base * Math.min(0.3, mines[c] * 0.05), living: base * 0.3 * Math.max(0, living - 0.45) * (1 + Math.min(0.5, markets[c] * 0.1)), customs: rev * RF[ro + RK.customs], upkeep: popOf[c] * 0.05 * (cv.policy.military - 1) * (cv.policy.military > 1 ? RF[ro + RK.upkeep] : 1), scholars: popOf[c] * SCHOLARS * (cv.policy.research - 1) };
      parts.state = (parts.taxes + parts.ports + parts.markets + parts.mines + parts.living) * RF[ro + RK.cost];      // (what the realm's laws spend: schools, doles, officials)
      parts.tribute = diplo.trIn[c] - diplo.trOut[c];      // (what vassals and the beaten pay it, less what it pays a lord or a victor)
      parts.paid = finance ? finance.paid[c] : 0; parts.got = finance ? finance.got[c] : 0;      // (interest paid to lenders; interest and dividends that came back: finance.js)
      parts.net = parts.taxes + parts.ports + parts.markets + parts.mines + parts.living + parts.customs - parts.upkeep - parts.scholars - parts.state + parts.tribute - parts.paid + parts.got; return parts;
    },
    // does this realm's age know how to work what this cell yields?
    knows(c, i) { return !!goods[i] && !!c && c.era >= gera[i] && !!gmask[c.id * NG + goods[i]]; },
    // the discovery the player's realm lacks to raise this work here (null: none, whatever else may stand in the way)
    needFor(kind, i) { const c = playerCiv(); if (!c) return null; if (kind === 'farm') return i >= 0 && infra[i] < 5 ? know.lacks(c.id, 'farm', infra[i] + 1) : null; if (kind === 'walls') return i >= 0 && walls[i] < 3 ? know.lacks(c.id, 'walls', walls[i] + 1) : null; if (kind === 'mine') return i >= 0 && goods[i] ? know.estate(c.id, goods[i]) : null; return know.lacks(c.id, kind); },
    tick, st, get year() { return year; }, get player() { return player; }, get evSeq() { return evSeq; }, playerCiv, setPlayer, costOf, reachOf, spawnTribe, act, playerWar, renamePlayer, faithCosts, faithAct, faithNews, cultureNews, financeNews, financeAct: (what, a, b) => { const c = playerCiv(); if (!c) return 'No realm'; const r = finance.act(c.id, what, a, b); financeNews(); return r; }, dynastyNews, rulerDies, courtAct: (what, a, b) => { const c = playerCiv(); if (!c) return 'No realm'; const r = dynasty.act(c.id, what, a, b); dynastyNews(); return r; },
    get story() { return story; }, get legacy() { return legacy; }, get intrigue() { return intrigue; }, get disease() { return disease; },
    // the weather (climate.js), in a world whose land has kinds: a realm's harvest this year against an ordinary year's (weighed by its
    // people), who starved, what softens a famine there; a place's weather; whether the ice still lies on a place
    get climate() { return climate && landOn ? climate : null; }, harvestOf: (c) => (hvPop[c] > 0 ? hvSum[c] / hvPop[c] : 1), starvedOf: (c) => starved[c], reliefOf: (c) => relief[c],
    climateHere: (i) => (climate && landOn ? climate.here(i) : null), iced,
    diseaseView: () => { const c = playerCiv(); return disease ? disease.view(c ? c.id : -1) : null; }, shutAgainst: (q) => { const c = playerCiv(); return c && disease ? disease.quarantine(c, q, 0) : 'No realm'; },
    intrigueView: (bid) => { const c = playerCiv(); return c && intrigue ? intrigue.view(c.id, bid === undefined ? -1 : bid) : null; },
    scheme: (bid, key) => { const c = playerCiv(), b = civs[bid]; if (!c || !intrigue) return 'No realm'; if (!b) return 'Nobody there'; return intrigue.begin(c, b, key); }, unscheme: () => { const c = playerCiv(); return c && intrigue ? intrigue.cancel(c) : 'No realm'; }, legacyView: () => { const c = playerCiv(); return c && legacy ? legacy.view(c.id) : null; }, storyView: () => { const c = playerCiv(); return c && story ? story.view(c.id) : null; }, storyTell: (key, d) => { const c = playerCiv(); return c && story ? story.tell(c, key, d) : 'No realm'; },
    storyChoose: (i) => { const c = playerCiv(); if (!c || !story) return 'No realm'; const r = story.choose(c.id, i); dynastyNews(); financeNews(); cultureNews(); return r; }, setStories: (on) => { storiesOn = !!on; }, get storiesOn() { return storiesOn; }, plague, meteor, bounty, drought,
    TRAITS, traitOf, fullName, fmtYear, describeCell, isAtWar, capacity, eraOf, strength, save, load, recount, rnd, religionName, makeName, logEvent, evolveGovAll,
    settlementsOf(id) { const out = []; for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] === id && level[i]) out.push(i); } out.sort((a, b) => pop[b] - pop[a]); return out; },
    cultivation(i) { const o = owner[i]; if (o < 0 || !civs[o]) return 0; const c = civs[o]; const K = capacity(i, c); const farm = Math.min(1, Math.max(0, (c.tech - 0.025) / 0.1)); return K > 0.01 ? Math.min(1, pop[i] / K) * farm * (level[i] ? 1 : 0.6) : 0; },
    prophet(i) { const o = owner[i]; if (o < 0 || !civs[o]) return 'Click a state'; const c = civs[o]; c.stability = Math.min(1, c.stability + 0.2);
      if (c.player && !faith.state[o]) { faith.prophet(o, i, 'god'); faithNews(); return 'A prophet arises: found his faith in Laws (V)'; }
      const f = faith.found(o, i, { why: 'god' }); faithNews(); return f ? `${cap(faith.nameOf(f))} is born` : 'No faith can be founded here'; },
    enlighten(i) { const o = owner[i]; if (o < 0 || !civs[o]) return 'Click a state'; const c = civs[o]; c.tech = Math.min(1, c.tech + 0.06); fmOf[o] = fmNow(c); const e = eraOf(c.tech); if (e !== c.era) { c.era = e; } logEvent(c, `A golden age of learning dawns in ${fullName(c)}`, true); return `${fullName(c)} leaps ahead`; },
  };
}

window.createSim = createSim;
