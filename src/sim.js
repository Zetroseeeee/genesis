// GENESIS world simulation (classic script; exposes window.createSim)

// ============================================================================
// GENESIS world simulation. Pure logic, no DOM: the page (and a headless test) drive it.
// Grid: 720x360 cells (0.5 degrees), x wraps, row 0 = 90N.
// ============================================================================
function createSim(world, seed) {
  const W = 720, H = 360, N = W * H;
  const MAXC = 512;
  const ECON = window.ECON;      // goods, recipes and the market (econ.js, loaded before this file)
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

  // ---------- eras & tech ----------
  const ERAS = [
    ['Stone Age', 0], ['Bronze Age', 0.08], ['Iron Age', 0.18], ['Classical', 0.30], ['Medieval', 0.42], ['Renaissance', 0.55], ['Industrial', 0.66], ['Modern', 0.80], ['Information Age', 0.92]
  ];
  const eraOf = (t) => { let e = 0; for (let k = 0; k < ERAS.length; k++) if (t >= ERAS[k][1]) e = k; return e; };
  // keep a realm's era in step with its knowledge (called wherever tech changes); announces the new age
  function syncEra(cv, c) {
    const e = eraOf(cv.tech); if (e === cv.era) return;
    cv.era = e; cv.eraSince = year; logEvent(cv, `${fullName(cv)} enters the ${ERAS[e][0]}`, (c >= 0 && cellsOf[c] > 30) || cv.player); evolveGov(cv);
  }
  const lerpTable = (T, t) => { if (t <= T[0][0]) return T[0][1]; for (let k = 1; k < T.length; k++) if (t <= T[k][0]) { const [a, va] = T[k - 1], [b, vb] = T[k]; return va + (vb - va) * (t - a) / (b - a); } return T[T.length - 1][1]; };
  // how many people a unit of land feeds, by knowledge (calibrated so world population tracks real history)
  const FOOD = [[0, 0.004], [0.08, 0.02], [0.18, 0.08], [0.3, 0.2], [0.42, 0.28], [0.55, 0.4], [0.66, 0.8], [0.8, 1.4], [0.92, 4], [1, 7]];
  const foodMult = (t) => lerpTable(FOOD, t);
  // per-civ food multiplier, refreshed every tick (tech only changes between ticks)
  const fmOf = new Float32Array(MAXC).fill(lerpTable(FOOD, 0.02)); const FM0 = lerpTable(FOOD, 0);
  // knowledge gained per year, by knowledge (Bronze ~5000 BC for the leaders, Information Age ~2000 AD)
  const RATE = [[0, 9e-6], [0.08, 1.5e-5], [0.18, 3e-5], [0.3, 6e-5], [0.42, 1.1e-4], [0.55, 2.2e-4], [0.66, 6.7e-4], [0.8, 1.1e-3], [0.92, 1.2e-3], [1, 1.2e-3]];
  const techRate = (t) => lerpTable(RATE, t);
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
  const GOV_TITLES = { tribe: ['Chief', 'Elder'], chiefdom: ['Chief', 'Lord'], 'city-state': ['Archon', 'Prince'], kingdom: ['King', 'Queen'], empire: ['Emperor', 'Empress'], republic: ['Consul', 'President'], sultanate: ['Sultan', 'Shah'], federation: ['Premier', 'Chancellor'] };
  function fullName(c) {
    switch (c.gov) {
      case 'tribe': return `the ${c.name} people`;
      case 'chiefdom': return `${c.name} Chiefdom`;
      case 'city-state': return `${c.name}`;
      case 'kingdom': return `Kingdom of ${c.name}`;
      case 'empire': return `${c.name} Empire`;
      case 'republic': return `Republic of ${c.name}`;
      case 'sultanate': return `Sultanate of ${c.name}`;
      case 'federation': return `${c.name} Federation`;
    }
    return c.name;
  }
  function religionName(st) {
    const base = makeName(st, 1, 2);
    return pick([`${base}ism`, `the Way of ${base}`, `the ${base} Faith`, `Cult of ${base}`, `${base}an Creed`, `Church of ${base}`]);
  }
  function fmtYear(y) { return y < 0 ? `${(-y).toLocaleString()} BC` : `${y} AD`; }

  // ---------- civs ----------
  const civs = new Array(MAXC).fill(null);
  const freeIds = [];
  for (let c = MAXC - 1; c >= 0; c--) freeIds.push(c);
  const popOf = new Float32Array(MAXC), cellsOf = new Int32Array(MAXC), strengthOf = new Float32Array(MAXC);
  const acad = new Int32Array(MAXC), temples = new Int32Array(MAXC), ports = new Int32Array(MAXC), markets = new Int32Array(MAXC), wonders = new Int32Array(MAXC), mines = new Int32Array(MAXC), bestCell = new Int32Array(MAXC), bestPop = new Float32Array(MAXC);
  const contact = new Uint16Array(MAXC * MAXC);
  // what the market needs to know of each realm: the people living on each raw good's land (mines counted over), whether
  // it holds such land at all (known to it or not), its townspeople, and up to four of its harbours
  const rawPop = new Float32Array(MAXC * NG), held = new Uint8Array(MAXC * NG), urban = new Float32Array(MAXC), portCells = new Int32Array(MAXC * 4).fill(-1);
  const worldEvents = [];
  let year = -10000, civCount = 0, tickCount = 0, player = -1;
  const st = { year, civCount, player };

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
    if (/prophet|adopts|Faith|Way of|Cult|Creed|Church|ism\b/.test(text)) return 'faith';
    if (/breaks away|independence|becomes .* of|is no more|settle|arrive|found/.test(text)) return 'state';
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
    const style = opts.style ?? styleFor(home);
    const name = opts.name || makeName(style, 2, 3);
    const rgb = hsl2rgb(hue(id + 1), 0.62 + rnd() * 0.2, 0.5 + rnd() * 0.15);
    const c = {
      id, name, style, rgb, color: `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`,
      tech: opts.tech ?? 0.02 + rnd() * 0.02, era: 0, gov: 'tribe', capital: home, home, founded: year,
      aggression: 0.2 + rnd() * 0.8, expansion: 0.5 + rnd() * 0.9, stability: 1, wealth: 0,
      wars: {}, truce: {}, religion: null, ruler: null, rulers: [], events: [], alive: true,
      player: !!opts.player, policy: { research: 1, military: 1, tax: 1, stance: 'steady' }, army: -99999,
      warStart: {}, cellsAtWar: {}, peakCells: 1, lastCapital: year, eraSince: year - 500,
    };
    c.era = eraOf(c.tech); fmOf[id] = foodMult(c.tech);
    civs[id] = c; civCount++; st.civCount = civCount; lastNb[id] = null;
    for (let k = 0; k < MAXC; k++) { contact[k * MAXC + id] = 0; contact[id * MAXC + k] = 0; const l = lastNb[k]; if (l) { const j = l.indexOf(id); if (j >= 0) l.splice(j, 1); } }      // (the number may have been a dead realm's: its borders are not this one's)
    market.born(id, opts.from === undefined ? -1 : opts.from, opts.share || 0);
    owner[home] = id; if (pop[home] < 0.6) pop[home] = 0.6;
    if (!cellName.has(home)) cellName.set(home, makeName(style, 2, 3));
    newRuler(c, true);
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
  const market = ECON.create({ MAXC, civs, popOf, cellsOf, ports, markets, rawPop, urban, portCells, eff, keep, hold, cellDist, seaRange, tv, seed, year: () => year, player: () => player });
  // count each realm's workshops, and what they do for it: every kind of work a third cheaper for the first of its
  // workshops (then by the square root of how many), food kept longer for its granaries, merchants holding more for its warehouses
  function countIndustry() {
    indN.fill(0); const NI = IND.length;
    for (const [i, a] of ind) { const o = owner[i]; if (o < 0 || !civs[o] || !level[i]) continue; for (let k = 0; k < NI; k++) if (a[k]) indN[o * NI + k]++; }
    for (let c = 0; c < MAXC; c++) { if (!civs[c]) continue; const b = c * NI; for (let k = 0; k < NI; k++) { const sec = IND_SEC[IND[k]]; if (sec !== undefined) eff[c * 8 + sec] = 1 + 0.3 * Math.sqrt(indN[b + k]); } keep[c] = 1 / (1 + 0.6 * Math.sqrt(indN[b + 4])); hold[c] = 1 + 0.5 * Math.sqrt(indN[b + 5]); }
  }
  const lastNb = new Array(MAXC).fill(null);
  const satOf = (c, key) => market.sat[c * NC + CAT[key]];
  const buildCost = (c) => 1.15 - 0.3 * satOf(c, 'build');      // timber, stone and tools to hand make every work cheaper; short of them, dearer
  function pickTrait(c) {
    const w = { conqueror: 1 + (c.aggression > 0.6 ? 1 : 0), builder: 1, pious: c.religion ? 1.4 : 0.6, scholar: c.era >= 3 ? 1.3 : 0.4, merchant: c.era >= 2 ? 1.2 : 0.3, tyrant: 0.5, steward: 1, navigator: c.era >= 3 && ports[c.id] ? 1.4 : 0.2 };
    let sum = 0; for (const k in w) sum += w[k]; let r = rnd() * sum; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return 'steward';
  }
  function newRuler(c, first) {
    const titles = GOV_TITLES[c.gov] || ['Ruler', 'Ruler'];
    const fem = rnd() < 0.3; const old = c.ruler;
    if (old && !first) { // the dead are remembered by what they did
      const reign = year - old.since; old.until = year;
      if (reign >= 22 && rnd() < 0.6) old.ep = pick(TRAITS[old.trait] ? TRAITS[old.trait].ep : ['the Old']);
      if (old.ep && (c.player || (cellsOf[c.id] > 250 && rnd() < 0.25))) logEvent(c, `After ${reign} years ${old.title} ${old.name} dies; the people remember ${old.fem ? 'her' : 'him'} as ${old.name} ${old.ep}`, false, 'ruler');
    }
    const r = { name: makeName(c.style, 2, 3), title: titles[fem ? 1 : 0], since: year, fem, trait: pickTrait(c), seed: rint(1e6) };
    c.ruler = r; c.rulers.push(r); if (c.rulers.length > 60) c.rulers.shift();
    const elected = c.gov === 'republic' || c.gov === 'federation';
    if (!first && (c.player || rnd() < 0.15)) logEvent(c, `${r.title} ${r.name}, ${TRAITS[r.trait].a}, ${elected ? 'is elected to lead' : 'takes the throne of'} ${fullName(c)}`, cellsOf[c.id] > 250 && rnd() < 0.2, 'ruler');
  }
  function killCiv(c, why) {
    for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] === c.id && level[i] >= 2) markRuin(i, c.era, c.culture); }
    c.alive = false; civCount--; st.civCount = civCount; civs[c.id] = null; freeIds.push(c.id);
    pushWorld({ year, text: `${fullName(c)} is no more${why ? ' — ' + why : ''}.`, civ: c.id, type: 'state', loc: c.capital, dead: true });
  }

  // ---------- init population ----------
  function seedPopulation() {
    for (const i of LI) {
      const f = fert[i];
      if (f > 0.12 && !(flags[i] & 8)) pop[i] = f * 0.35 * (0.4 + rnd() * 1.2);
    }
  }
  seedPopulation();

  function capacity(i, c) {
    const t = c ? c.tech : 0.0;
    const f = Math.min(1.2, fert[i] + bonusFert[i]);
    let k = f * 30 * (c ? fmOf[c.id] : FM0) * (1 + infra[i] * 0.22);
    if (flags[i] & 2) k *= t > 0.05 ? 4 : 1.6;       // river valleys: irrigation
    else if (flags[i] & 4) k *= 1.3;                 // coasts: fishing and trade
    return k;
  }
  function strength(c) {
    const strat = (c.era >= 1 ? 4 * satOf(c.id, 'arms') : 0) + Math.min(3, mines[c.id]) * 0.5; // an army with all the arms, horses and guns it wants is two fifths stronger than one with none; mines dig deeper
    const s = (popOf[c.id] + 2) * (0.25 + c.tech * 1.6) * c.policy.military * (year < c.army ? 1.6 : 1) * (0.6 + c.stability * 0.5) * (1 + 0.1 * strat);
    return s;
  }
  // what a cell brings its realm's market: its own good, if the realm's age can work it (a mine digs more than twice as
  // much), and the wood, stone and sea salt any country has
  function yieldsOf(i, o, c, p) {
    const g = goods[i], b = o * NG;
    if (g) { held[b + g] = 1; if (c.era >= gera[i]) rawPop[b + g] += (special[i] & 512) ? p * 2.2 : p; }
    const wd = wood[i]; if (wd) rawPop[b + G_TIMBER] += p * wd; rawPop[b + G_STONE] += p * 0.1; if (flags[i] & 4) rawPop[b + G_SALT] += p * 0.08;
  }
  const NB = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];
  function nbOf(i, k) { // wrap-safe neighbour
    const y = (i / W) | 0, x = i - y * W;
    const dy = k < 3 ? -1 : k < 5 ? 0 : 1, dx = k === 0 || k === 3 || k === 5 ? -1 : k === 1 || k === 6 ? 0 : 1;
    const yy = y + dy; if (yy < 0 || yy >= H) return -1;
    return yy * W + ((x + dx + W) % W);
  }
  function claim(i, c, from) {
    const prev = owner[i];
    owner[i] = c.id;
    if (prev >= 0 && civs[prev] && civs[prev].capital === i) {
      const p = civs[prev];
      logEvent(p, `${cellName.get(i) || 'The capital'} falls to ${fullName(c)}`, true);
      logEvent(c, `${c.ruler.title} ${c.ruler.name} takes ${cellName.get(i) || 'the enemy capital'}`, true);
      p.stability -= 0.35; p.capital = -1;
    }
    if (from >= 0) { const m = Math.min(pop[from] * 0.15, 3); pop[from] -= m; pop[i] += m; }
  }

  // ---------- war & diplomacy ----------
  function declareWar(a, b, why) {
    a.wars[b.id] = year; b.wars[a.id] = year; a.warStart[b.id] = cellsOf[a.id]; b.warStart[a.id] = cellsOf[b.id];
    logEvent(a, `${fullName(a)} declares war on ${fullName(b)}${why ? ' ' + why : ''}`, cellsOf[a.id] + cellsOf[b.id] > 80 || a.player || b.player);
    pushOwn(b, { year, text: `${fullName(a)} declares war on ${fullName(b)}`, type: 'war', loc: b.capital, civ: b.id });
  }
  function makePeace(a, b, text) {
    delete a.wars[b.id]; delete b.wars[a.id];
    const t = year + 60 + rint(80); a.truce[b.id] = t; b.truce[a.id] = t;
    logEvent(a, text || `${fullName(a)} and ${fullName(b)} make peace`, cellsOf[a.id] + cellsOf[b.id] > 120 || a.player || b.player);
    pushOwn(b, { year, text: text || `${fullName(a)} and ${fullName(b)} make peace`, type: 'war', loc: b.capital, civ: b.id });
  }
  function isAtWar(a, b) { return a.wars[b] !== undefined; }

  // ---------- splitting / collapse ----------
  function splitCiv(c, seedCell, maxCells, why) {
    // flood fill from seedCell through c's cells up to maxCells → new civ
    const visited = new Set([seedCell]); const q = [seedCell]; const cells = [];
    while (q.length && cells.length < maxCells) {
      const i = q.shift(); cells.push(i);
      for (let k = 0; k < 8; k++) { const n = nbOf(i, k); if (n >= 0 && owner[n] === c.id && !visited.has(n)) { visited.add(n); q.push(n); } }
    }
    if (cells.length < 3) return null;
    const style = rnd() < 0.7 ? c.style : styleFor(seedCell);
    const nc = newCiv(seedCell, { style, tech: c.tech * (0.92 + rnd() * 0.08), from: c.id, share: Math.min(0.9, cells.length / Math.max(1, cellsOf[c.id])) });
    if (!nc) return null;
    nc.gov = c.gov === 'tribe' ? 'tribe' : c.gov === 'empire' ? 'kingdom' : c.gov; nc.era = eraOf(nc.tech);
    nc.religion = c.religion;
    for (const i of cells) owner[i] = nc.id;
    nc.capital = seedCell; cellsOf[nc.id] = cells.length;
    logEvent(c, `${fullName(nc)} breaks away from ${fullName(c)}${why ? ' ' + why : ''}`, cells.length > 25 || c.player);
    pushOwn(nc, { year, text: `${fullName(nc)} declares independence from ${fullName(c)}`, type: 'state', loc: nc.capital, civ: nc.id });
    return nc;
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
    tickCount++; year++;
    if (tickCount % 25 === 0) shufflePerm();
    // per-civ accumulators
    popOf.fill(0); cellsOf.fill(0); acad.fill(0); temples.fill(0); ports.fill(0); markets.fill(0); wonders.fill(0); mines.fill(0); bestPop.fill(-1); rawPop.fill(0); held.fill(0); urban.fill(0); portCells.fill(-1);
    const budget = new Float32Array(MAXC);
    let techSum = 0, techN = 0;
    for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv) continue; strengthOf[c] = strength(cv); fmOf[c] = foodMult(cv.tech); techSum += cv.tech; techN++; }
    meanTech = techN ? techSum / techN : 0.02;
    // pass 1: growth + accumulate (order-independent)
    for (let k = 0; k < LI.length; k++) {
      const i = LI[k]; const o = owner[i]; const c = o >= 0 ? civs[o] : null;
      let p = pop[i];
      if (p > 0 || c) {
        const K = capacity(i, c);
        const r = (0.006 + (c ? c.tech * 0.02 : 0)) * (c ? (1 - (c.policy.tax - 1) * 0.15) * (0.7 + c.stability * 0.3) : 1);
        p += r * p * Math.max(-10, 1 - p / Math.max(K, 0.01)); // overfull land empties by at most ~a quarter a year
        if (p < 0.001) p = 0;
        pop[i] = p;
      }
      if (c) {
        popOf[o] += p; cellsOf[o]++;
        if (special[i] & 1) { if (ports[o] < 4) portCells[o * 4 + ports[o]] = i; ports[o]++; } if (special[i] & 2) acad[o]++; if (special[i] & 4) temples[o]++; if (special[i] & 8) markets[o]++; if (special[i] & 16) wonders[o]++; if (special[i] & 512) mines[o]++;
        if (p > 0.05) yieldsOf(i, o, c, p);
        if (p > bestPop[o]) { bestPop[o] = p; bestCell[o] = i; }
        // settlement level, relative to what the era can feed
        const fm = fmOf[o]; const s1 = 6 * fm + 0.2, s2 = 25 * fm + 1, s3 = 90 * fm + 4, s4 = 300 * fm + 15;
        const prevLvl = level[i];
        level[i] = p >= s4 ? 4 : p >= s3 ? 3 : p >= s2 ? 2 : p >= s1 ? 1 : 0;
        if (level[i] >= 2) { urban[o] += p; const q = Math.min(255, Math.round(Math.log2(p * 20 + 1) * 16)); if (q > peak[i]) peak[i] = q; }
        if (level[i]) { const b = Math.min(255, Math.round(Math.log2(p * 1000 + 1) * 3)); if (b > gBand[i]) { gPrev[i] = gBand[i]; gBand[i] = b; gYear[i] = year; } else if (b < gBand[i]) { gBand[i] = b; gPrev[i] = b; } }
        else if (gBand[i]) { gBand[i] = 0; gPrev[i] = 0; gYear[i] = -1e9; }
        // a town that shrinks to a hamlet, or dies, leaves its stones (sudden or slow); a town rebuilt over them clears them
        if (prevLvl >= 2 && level[i] < 2) markRuin(i, c.era, c.culture);
        else if (level[i] >= 2 && p >= s2 * 1.1 && ruins.has(i) && year - ruins.get(i).year > 5) { ruins.delete(i); }      // (well clear of the size of a town: a saved world's rounded numbers must not rebuild one)
        if (c.capital === i && level[i] < 1) level[i] = 1;
        if (level[i] && !cellName.has(i)) cellName.set(i, makeName(c.style, 2, 3));
        if (level[i] && siteU[i] < 0) { siteU[i] = 0.25 + rnd() * 0.5; siteV[i] = 0.25 + rnd() * 0.5; }
      } else if (level[i]) level[i] = 0;
    }
    // per-civ bookkeeping
    for (let c = 0; c < MAXC; c++) {
      const cv = civs[c]; if (!cv) continue;
      if (cellsOf[c] === 0) { killCiv(cv, 'its last lands were lost'); continue; }
      if (cv.capital < 0 || owner[cv.capital] !== c) { cv.capital = bestCell[c]; logEvent(cv, `${cellName.get(cv.capital) || 'A new city'} becomes the capital of ${fullName(cv)}`, false); }
      if (cellsOf[c] > cv.peakCells) cv.peakCells = cellsOf[c];
      // knowledge
      const urban = Math.min(1.4, Math.max(0.6, 0.6 + Math.log10(popOf[c] + 1) / 4));
      const dt = techRate(cv.tech) * urban * cv.policy.research * (1 + acad[c] * 0.08) * (0.7 + cv.stability * 0.3) * tv(cv, 'research', 1);
      cv.tech = Math.min(1, cv.tech + dt);
      syncEra(cv, c);
      // wealth
      // (how well the people live, by last year's market: fed, clothed, housed and supplied; and what the customs took at the border)
      const living = market.LS[c], customs = market.rev[c];
      cv.trade = { living, customs, imp: market.impV[c], exp: market.expV[c] };
      const income = popOf[c] * (0.06 + cv.tech * 0.3) * cv.policy.tax * (1 + ports[c] * 0.05 + Math.min(0.3, markets[c] * 0.04) + Math.min(0.3, mines[c] * 0.05) + 0.3 * Math.max(0, living - 0.45) * (1 + Math.min(0.5, markets[c] * 0.1))) * tv(cv, 'income', 1) - popOf[c] * 0.05 * (cv.policy.military - 1) + customs;
      cv.income = income; cv.wealth += income;
      // stability: drifts to a target set by war, overreach, taxes and stance; crises knock it down
      const atWarN = Object.keys(cv.wars).length;
      const overreach = Math.max(0, cellsOf[c] / (40 + cv.tech * 3000) - 1);
      const target = 1 - atWarN * 0.12 - overreach * 0.5 - (cv.policy.tax - 1) * 0.3 - (cv.policy.stance === 'aggressive' ? 0.12 : 0) + Math.min(0.15, temples[c] * 0.03) + Math.min(0.15, wonders[c] * 0.05) + 0.12 * satOf(c, 'luxury') - 0.2 * Math.max(0, 0.75 - satOf(c, 'food')) + tv(cv, 'stab', 0);
      aiBuild(cv); aiIndustry(cv);
      cv.stability += (Math.min(1, target) - cv.stability) * 0.012;
      if (cellsOf[c] > 30 && rnd() < 0.0035 * Math.min(1, cellsOf[c] / 1500) + 0.0004) {
        cv.stability -= 0.25 + rnd() * 0.3;
        logEvent(cv, `${pick(['Famine', 'A succession war', 'A revolt of the provinces', 'A palace coup', 'Plague and famine', 'A peasant uprising', 'A schism in the faith', 'Bankruptcy of the court'])} shakes ${fullName(cv)}`, cellsOf[c] > 300 || cv.player);
      }
      cv.stability = Math.max(0, Math.min(1, cv.stability));
      // expansion budget
      const drive = cv.player ? (cv.policy.stance === 'consolidate' ? 0 : cv.policy.stance === 'aggressive' ? 1.6 : 0.7) : cv.expansion * (cv.policy.stance === 'aggressive' ? 1.5 : 1) * tv(cv, 'exp', 1);
      budget[c] = drive * (0.12 + Math.pow(cellsOf[c], 0.5) * 0.012) * (0.4 + cv.stability * 0.6);
      // ruler death
      if (rnd() < 1 / 34) newRuler(cv, false);
      // religion
      if (!cv.religion && cv.tech > 0.14 && rnd() < 0.0025 * tv(cv, 'faith', 1)) { cv.religion = religionName(cv.style); logEvent(cv, `In ${cellName.get(cv.capital) || fullName(cv)} a prophet arises. The people take up ${cv.religion}`, cellsOf[c] > 20 || cv.player); }
      // collapse
      if (cv.stability < 0.3 && cellsOf[c] > 8 && rnd() < 0.05) {
        const parts = 1 + rint(2); let made = 0;
        for (let q = 0; q < parts; q++) { const seedC = pickFarCell(cv); if (seedC >= 0) { const nc = splitCiv(cv, seedC, Math.ceil(cellsOf[c] * (0.2 + rnd() * 0.3)), 'as the realm fractures'); if (nc) made++; } }
        if (made) cv.stability += 0.3;
      }
      // overreach split
      const reach = reachOf(cv.tech) + ports[c] * 2;
      if (cellsOf[c] > 12 && tickCount % 20 === (c % 20) && !(cv.player && cv.stability > 0.5)) {
        const far = pickFarCell(cv, reach * 1.1);
        if (far >= 0 && rnd() < 0.25) splitCiv(cv, far, Math.ceil(cellsOf[c] * 0.2), 'beyond the reach of its capital');
      }
    }
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
          if (n >= 0 && land[n] && owner[n] < 0 && pop[n] < pop[i] * 0.6 && fert[n] > 0.08) { const m = p * 0.08; pop[i] -= m; pop[n] += m; }
        }
        if (fert[i] > 0.5 && year - lastFounding > 2 && civCount < MAXC - 4 && rnd() < 3e-6 * (1 + age / 1500) * ((flags[i] & 2) ? 3 : 1)) {
          const nc = newCiv(i, { tech: 0.015 + 0.4 * meanTech }); if (nc) { lastFounding = year; nc.era = eraOf(nc.tech); evolveGov(nc); logEvent(nc, `${fullName(nc)} settle ${cellName.get(i)}, and stay`, rnd() < 0.3); }
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
            if (fert[n] + bonusFert[n] > 0.04 && !(flags[n] & 8) && cellDist(n, c.capital) < reachOf(c.tech) + ports[o] * 2) {
              budget[o] -= 1; claim(n, c, i);
            }
          } else if (on !== o && isAtWar(c, on)) {
            const e = civs[on];
            const sa = strengthOf[o], sb = strengthOf[on];
            const pWin = 0.11 * Math.pow(sa / (sa + sb + 0.001), 2.2) / (1 + walls[n] * 1.5);
            if (rnd() < 0.08) battles.push({ i: n, from: i, year, a: o, b: on, siege: walls[n] > 0 });
            if (rnd() < pWin) { claim(n, c, i); cellsOf[on]--; cellsOf[o]++; budget[o] -= 0.5; battles.push({ i: n, from: i, year, a: o, b: on, siege: walls[n] > 0, taken: true }); if (level[n] >= 2) { const sackP = Math.min(0.7, 0.18 * (c.policy.stance === 'aggressive' ? 1.5 : 1) * (c.tech + 0.05 < e.tech ? 2 : 1) * tv(c, 'sack', 1)); if (rnd() < sackP) { pop[n] *= 0.12; rubble.set(n, year); logEvent(c, `${fullName(c)} sacks ${cellName.get(n) || 'the city'}; its people are scattered`, level[n] >= 3 || e.player || c.player, 'war', n); } else { pop[n] *= 0.85; rubble.set(n, year); } } if (rnd() < 0.05) logEvent(c, `${fullName(c)} takes ${cellName.get(n) || 'land'} from ${fullName(e)}`, false); }
          }
        }
      }
      // sea colonisation
      if (budget[o] > 0 && (flags[i] & 4) && c.tech > 0.22 && p > 0.3 * K && r1 < 0.02) {
        const R = seaRange(c.tech) * tv(c, 'sea', 1) + ports[o] * 3;
        const y = (i / W) | 0, x = i - y * W;
        const dy = Math.round((rnd() * 2 - 1) * R), dx = Math.round((rnd() * 2 - 1) * R / cosLat[y]);
        const yy = y + dy; if (yy >= 0 && yy < H) {
          const n2 = yy * W + ((x + dx + W) % W);
          if (land[n2] && (flags[n2] & 4) && owner[n2] < 0 && fert[n2] > 0.1 && !(flags[n2] & 8) && cellDist(n2, i) < R) {
            budget[o] -= 1; claim(n2, c, i); if (!cellName.has(n2)) cellName.set(n2, makeName(c.style, 2, 3));
            if (cellDist(n2, i) > 12) logEvent(c, `Ships of ${fullName(c)} found ${cellName.get(n2)} across the sea`, cellDist(n2, i) > 30 || c.player);
          }
        }
      }
      // internal migration towards emptier good land
      if (p > 0.6 * K) {
        const n3 = nbOf(i, rint(8));
        if (n3 >= 0 && land[n3] && owner[n3] === o) { const Kn = capacity(n3, c); if (pop[n3] < 0.5 * Kn) { const m = Math.min(p * 0.05, (Kn - pop[n3]) * 0.3); pop[i] -= m; pop[n3] += m; } }
      }
    }
    // diplomacy every 10 ticks (staggered)
    for (let c = 0; c < MAXC; c++) {
      const a = civs[c]; if (!a || tickCount % 10 !== c % 10) continue;
      // wars end
      for (const bidS of Object.keys(a.wars)) {
        const bid = +bidS; const b = civs[bid];
        if (!b) { delete a.wars[bid]; continue; }
        const len = year - a.wars[bid];
        const lostA = 1 - cellsOf[c] / Math.max(1, a.warStart[bid] || 1), lostB = 1 - cellsOf[bid] / Math.max(1, b.warStart[c] || 1);
        if (len > 25 && (rnd() < 0.15 || len > 90 || lostA > 0.4 || lostB > 0.4)) {
          const winner = lostA > lostB + 0.1 ? b : lostB > lostA + 0.1 ? a : null;
          makePeace(a, b, winner ? `${fullName(winner)} wins its war against ${fullName(winner === a ? b : a)}` : null);
        }
      }
      // new wars
      if (a.player && a.policy.stance !== 'aggressive') { /* player declares manually */ }
      else if (Object.keys(a.wars).length < 2 && cellsOf[c] > 4) {
        for (let b = 0; b < MAXC; b++) {
          const n = contact[c * MAXC + b]; if (!n) continue;
          const bv = civs[b]; if (!bv || isAtWar(a, b) || (a.truce[b] || -1e9) > year) continue;
          const sa = strengthOf[c], sb = strengthOf[b];
          // (a strategic good its own age can use, that the other holds and it does not: the one it is shortest of)
          let covet = 0, worst = -1; for (const g of STRAT_RAW) { if (GOODS[g].era > a.era || !held[b * NG + g] || held[c * NG + g]) continue; const sh = market.shortOf(c, g); if (sh > worst) { worst = sh; covet = g; } }
          if (sa > sb * 1.15 && rnd() < a.aggression * tv(a, 'agg', 1) * 0.14 * (a.policy.stance === 'aggressive' ? 2 : 1) * (covet ? 1.6 : 1)) { let why; if (covet) why = `for its ${GOODS[covet].name.toLowerCase()}`; else why = pick(['over a border dispute', 'for glory', 'to seize its fields', 'after an insult to its ruler', 'to punish raids', '', '']); declareWar(a, bv, why); break; }
        }
      }
      // tech diffusion, religion spread, and who the merchants can reach by land (the realms touched in these ten years or the ten before)
      const nb = [];
      for (let b = 0; b < MAXC; b++) {
        const n = contact[c * MAXC + b]; if (!n) continue; const bv = civs[b]; if (!bv) { contact[c * MAXC + b] = 0; continue; }
        nb.push(b);
        if (bv.tech > a.tech) a.tech += (bv.tech - a.tech) * 0.015;
        if (!a.religion && bv.religion && rnd() < 0.08) { a.religion = bv.religion; logEvent(a, `${fullName(a)} adopts ${bv.religion}`, cellsOf[c] > 40); }
        contact[c * MAXC + b] = 0;
      }
      { const was = lastNb[c]; lastNb[c] = nb; let all = nb; if (was) { all = nb.slice(); for (const b of was) if (civs[b] && all.indexOf(b) < 0) all.push(b); } market.touch(c, all); }
      syncEra(a, c);
    }
    // random disasters
    if (rnd() < 0.012) plague(pick(LI), 8 + rint(14), true);
    finishWorks();
    livingWorld();
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
    if (year - comet > 140 && rnd() < 0.004) { comet = year; pushWorld({ year, text: 'A great comet hangs in the sky; the wise read omens in it', civ: -1, type: 'disaster', loc: -1 }); for (const c of civs) if (c && !c.religion && rnd() < 0.25) { c.religion = religionName(c.style); logEvent(c, `Under the comet, ${fullName(c)} turns to ${c.religion}`, cellsOf[c.id] > 40, 'faith'); } }
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
    let best = -1, bd = minDist || 0;
    for (let t = 0; t < 60; t++) { const i = perm[rint(perm.length)]; if (owner[i] !== c.id) continue; const d = cellDist(i, c.capital); if (d > bd) { bd = d; best = i; if (minDist) break; } }
    return best;
  }
  function evolveGov(c) {
    const cells = cellsOf[c.id]; const t = c.tech; let g = c.gov;
    if (t < 0.08) g = 'tribe';
    else if (t < 0.18) g = 'chiefdom';
    else if (t < 0.42) g = cells < 14 ? 'city-state' : cells > 400 ? 'empire' : (g === 'sultanate' ? g : 'kingdom');
    else if (t < 0.66) g = cells > 500 ? 'empire' : (rnd() < 0.15 ? 'sultanate' : (rnd() < 0.12 ? 'republic' : 'kingdom'));
    else if (t < 0.8) g = rnd() < 0.4 ? 'republic' : cells > 600 ? 'empire' : 'kingdom';
    else g = rnd() < 0.7 ? 'republic' : 'federation';
    if (g !== c.gov) { const old = fullName(c); c.gov = g; logEvent(c, `${old} becomes ${fullName(c)}`, cells > 40 || c.player); }
  }
  function evolveGovAll() { for (const c of civs) if (c) evolveGov(c); }
  function plague(center, radius, natural) {
    let hit = null, hitPop = 0; const y0 = (center / W) | 0, x0 = center - y0 * W;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const yy = y0 + dy; if (yy < 0 || yy >= H) continue; const i = yy * W + ((x0 + dx + W) % W);
      if (!land[i] || pop[i] <= 0) continue; const d = Math.sqrt(dx * dx * cosLat[yy] * cosLat[yy] + dy * dy); if (d > radius) continue;
      const kill = (0.25 + rnd() * 0.3) * (1 - d / radius);
      const o = owner[i]; if (o >= 0 && pop[i] > hitPop && civs[o]) { hitPop = pop[i]; hit = civs[o]; }
      pop[i] *= (1 - kill);
    }
    if (hit && (natural ? popOf[hit.id] > 20 : true)) { logEvent(hit, `A great plague sweeps through ${fullName(hit)}`, popOf[hit.id] > 200 || hit.player); hit.stability -= 0.1; plagues.push({ i: center, year, r: radius }); }
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
    if (!land[i] || (flags[i] & 8)) return null; // no one settles the ice
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
    for (let k = 0; k < 8; k++) { const n = nbOf(i, k); if (n >= 0 && land[n] && owner[n] < 0 && fert[n] > 0.05) { owner[n] = c.id; pop[n] += 0.3; } }
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
    academy: { cost: 150, dur: 14, slot: true, name: 'Academy', desc: 'Scholars and a library. +8% knowledge growth.' },
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
    levy: { cost: 120, dur: 0, slot: false, name: 'Levy', desc: 'Raise a great army for 30 years.' },
  };
  const COST = {}; for (const k in BUILD) COST[k] = BUILD[k].cost; COST.develop = COST.farm; COST.fortify = COST.walls;
  const DUR_ERA = [1.4, 1.2, 1.1, 1, 1, 0.9, 0.6, 0.4, 0.3];
  const durOf = (kind, era) => BUILD[kind].dur ? Math.max(1, Math.round(BUILD[kind].dur * DUR_ERA[Math.min(8, era)])) : 0;
  function costOf(kind) { const c = playerCiv(); const f = c ? (1 + c.tech * 4 + Math.sqrt(popOf[c.id]) / 40) * (BUILD[kind] && BUILD[kind].dur ? buildCost(c.id) : 1) : 1; return Math.round((COST[kind] || 0) * f); }
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
    if (kind === 'levy') return year < c.army ? 'An army is already in the field' : null;
    if (i < 0 || !land[i]) return 'That is not land';
    if (kind === 'settle') {
      if (owner[i] === c.id) return 'Already yours';
      if (owner[i] >= 0 && !isAtWar(c, owner[i])) return 'That land belongs to a state you are not at war with';
      let adj = false; for (let k = 0; k < 8; k++) { const n = nbOf(i, k); if (n >= 0 && owner[n] === c.id) adj = true; }
      if (!adj) return 'Must touch your border'; if (flags[i] & 8) return 'Nothing lives on the ice'; return null;
    }
    if (owner[i] !== c.id) return 'Not your land';
    if (inProgress(i, kind)) return 'Already being built';
    if (kind === 'farm') return infra[i] >= 5 ? 'Fully farmed' : level[i] < 1 ? 'Needs a settlement' : null;
    if (kind === 'walls') return walls[i] >= 3 ? 'Fully fortified' : level[i] < 1 ? 'Needs a settlement' : null;
    if (kind === 'port') return !(flags[i] & 4) ? 'Needs a coast' : (special[i] & 1) ? 'Already a harbour' : level[i] < 1 ? 'Needs a settlement' : null;
    if (kind === 'academy') return level[i] < 2 ? 'Needs a town or city' : c.era < 3 ? 'Academies come with the Classical age' : (special[i] & 2) ? 'Already has an academy' : null;
    if (kind === 'temple') return level[i] < 1 ? 'Needs a settlement' : (special[i] & 4) ? 'Already has a temple' : null;
    if (kind === 'market') return level[i] < 1 ? 'Needs a settlement' : c.era < 1 ? 'Markets come with the Bronze Age' : (special[i] & 8) ? 'Already has a market' : null;
    if (B.ind) {
      if (indAt(i, kind)) return 'Already built here';
      const need = { smithy: 1, warehouse: 1, shipyard: 2, factory: 6, refinery: 7, lab: 8 }[kind] || 0; if (c.era < need) return `Not before the ${ERAS[need][0]}${/Age$/.test(ERAS[need][0]) ? '' : ' age'}`;
      if (kind === 'shipyard') return !(special[i] & 1) ? 'Needs a harbour' : null;
      if (kind === 'smithy' || kind === 'warehouse' || kind === 'factory' || kind === 'refinery' || kind === 'lab') return level[i] < 2 ? 'Needs a town or city' : null;
      return level[i] < 1 ? 'Needs a settlement' : null;
    }
    if (kind === 'mine') { const g = goods[i] ? GOODS[goods[i]] : null; return !g ? 'This land yields nothing to work' : c.era < gera[i] ? `Your people cannot yet work ${g.name.toLowerCase()}` : (special[i] & 512) ? 'Already mined' : level[i] < 1 ? 'Needs a settlement' : null; }
    if (kind === 'wonder') return i !== c.capital ? 'Wonders rise in the capital' : level[i] < 2 ? 'The capital must be a town first' : (special[i] & 16) ? 'The capital already has its wonder' : null;
    if (kind === 'capital') return level[i] < 2 ? 'A capital needs at least a town' : c.capital === i ? 'Already the capital' : null;
    return null;
  }
  // start a work: pay now, finish in dur years (finishWorks applies the effect)
  function startWork(c, kind, i, slot, cost) {
    const B = BUILD[kind]; c.wealth -= cost;
    if (kind === 'levy') { c.army = year + 30; logEvent(c, `${c.ruler.title} ${c.ruler.name} raises a great army`, false); return 'Army raised for 30 years'; }
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
    if (e >= 1 && !(special[i] & 8)) opts.push(['market', 8]);
    if (!(special[i] & 4) && (cv.religion || e >= 2)) opts.push(['temple', 4]);
    if (e >= 3 && lv >= 2 && !(special[i] & 2)) opts.push(['academy', 2]);
    if (e >= 2 && (flags[i] & 4) && !(special[i] & 1)) opts.push(['port', 1]);
    if (e >= 1 && e <= 5 && lv >= 2 && walls[i] < (e >= 4 ? 3 : 2) && (Object.keys(cv.wars).length || rnd() < 0.5)) opts.push(['walls', 0]);
    if (infra[i] < 5 && rnd() < 0.5) opts.push(['farm', 0]);
    if (goods[i] && e >= gera[i] && !(special[i] & 512) && (GOODS[goods[i]].mine || rnd() < 0.4)) opts.push(['mine', 512]);
    if (i === cv.capital && !(special[i] & 16) && lv >= 2 && rankOf(cv) <= 4) opts.push(['wonder', 16]);
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
  function playerWar(targetId) { const c = playerCiv(); const t = civs[targetId]; if (!c || !t || c === t) return; if (isAtWar(c, targetId)) makePeace(c, t); else declareWar(c, t, 'by decree'); }
  function renamePlayer(name) { const c = playerCiv(); if (c && name.trim()) { c.name = name.trim().slice(0, 28); } }

  // ---------- serialisation (compact: fits browser storage) ----------
  function save() {
    const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
    const p8 = new Uint8Array(N); for (let i = 0; i < N; i++) p8[i] = Math.min(255, Math.round(Math.log2(pop[i] * 20 + 1) * 16)); // log scale
    const runs = []; let cur = owner[0], len = 0; for (let i = 0; i < N; i++) { if (owner[i] === cur) len++; else { runs.push(cur, len); cur = owner[i]; len = 1; } } runs.push(cur, len);
    const sparse = (arr) => { const out = []; for (let i = 0; i < N; i++) if (arr[i]) out.push(i, arr[i]); return out; };
    const bonus = []; for (let i = 0; i < N; i++) if (Math.abs(bonusFert[i]) > 0.005) bonus.push(i, Math.round(bonusFert[i] * 100));
    const names = []; for (const [k, v] of cellName) if (level[k] || civs.some(c => c && c.capital === k)) names.push(k, v);
    const sites = []; for (let i = 0; i < N; i++) if (siteU[i] >= 0 && level[i]) sites.push(i, Math.round(siteU[i] * 100), Math.round(siteV[i] * 100));
    return {
      v: 2, year, tickCount, player, rs, seed,
      pop: b64(p8), owner: runs, infra: sparse(infra), walls: sparse(walls), special: sparse(special), peak: sparse(peak), slotA: sparse(slotA), slotB: sparse(slotB), bonus, names, sites,
      works: [...works.entries()].map(([i, l]) => [i, l.map(w => [w.k, w.slot, w.start, w.dur])]), grow: (() => { const g = []; for (let i = 0; i < N; i++) if (gBand[i] && year - gYear[i] < 80) g.push(i, gBand[i], gPrev[i], gYear[i]); return g; })(),
      ruins: [...ruins.entries()].slice(-600), volc: volcanoes.map(v => [v.last, v.erupting]), comet,
      civs: civs.map(c => c ? { ...c, events: c.events.slice(cellsOf[c.id] > 20 || c.player ? -30 : -8), rulers: c.rulers.slice(-10) } : null), worldEvents: worldEvents.slice(-200), history: history.filter((h, i) => i % 2 === 0 || i > history.length - 40),
      econ: market.save(), ind: [...ind.entries()].map(([i, a]) => [i, Array.from(a)]),
    };
  }
  function load(s) {
    const u8 = (str) => { const bin = atob(str); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
    year = s.year; tickCount = s.tickCount; player = s.player; rs = s.rs >>> 0;
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
    for (let c = MAXC - 1; c >= 0; c--) { if (s.civs[c]) { civs[c] = s.civs[c]; civCount++; fmOf[c] = foodMult(civs[c].tech); if (civs[c].eraSince === undefined) civs[c].eraSince = year - 500; } else freeIds.push(c); }
    worldEvents.length = 0; worldEvents.push(...s.worldEvents); history.length = 0; if (s.history) history.push(...s.history);
    recount(); countIndustry(); st.year = year; st.civCount = civCount; st.player = player;
    // the market as it was left; a world saved before there was one gets thirty quiet years to find its prices
    if (!market.load(s.econ)) { for (let c = 0; c < MAXC; c++) if (civs[c]) market.born(c, -1, 0); touchAll(); market.warm(30); } else touchAll();
  }
  // who touches whom by land, read off the map (the tick keeps it up from border contacts afterwards)
  function touchAll() {
    const sets = new Map();
    for (let k = 0; k < LI.length; k++) { const i = LI[k]; const o = owner[i]; if (o < 0) continue; for (const d of [1, W]) { const y = (i / W) | 0; const j = d === 1 ? y * W + ((i - y * W + 1) % W) : i + W; if (j >= N) continue; const on = owner[j]; if (on >= 0 && on !== o) { let a = sets.get(o); if (!a) sets.set(o, a = new Set()); a.add(on); let b = sets.get(on); if (!b) sets.set(on, b = new Set()); b.add(o); } } }
    for (let c = 0; c < MAXC; c++) { const l = civs[c] && sets.has(c) ? [...sets.get(c)].filter(b => civs[b]) : null; lastNb[c] = l; market.touch(c, l); }
  }
  // rebuild everything the tick derives from the cell arrays (levels, per-realm totals, strengths) so a loaded or edited world reads right before its first year runs
  function recount() {
    popOf.fill(0); cellsOf.fill(0); acad.fill(0); temples.fill(0); ports.fill(0); markets.fill(0); wonders.fill(0); mines.fill(0); bestPop.fill(-1); rawPop.fill(0); held.fill(0); urban.fill(0); portCells.fill(-1);
    for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv) continue; fmOf[c] = foodMult(cv.tech); }
    for (let k = 0; k < LI.length; k++) {
      const i = LI[k]; const o = owner[i]; const c = o >= 0 ? civs[o] : null; const p = pop[i];
      if (!c) { level[i] = 0; continue; }
      popOf[o] += p; cellsOf[o]++;
      if (special[i] & 1) { if (ports[o] < 4) portCells[o * 4 + ports[o]] = i; ports[o]++; } if (special[i] & 2) acad[o]++; if (special[i] & 4) temples[o]++; if (special[i] & 8) markets[o]++; if (special[i] & 16) wonders[o]++; if (special[i] & 512) mines[o]++;
      if (p > 0.05) yieldsOf(i, o, c, p);
      if (p > bestPop[o]) { bestPop[o] = p; bestCell[o] = i; }
      const fm = fmOf[o]; const s1 = 6 * fm + 0.2, s2 = 25 * fm + 1, s3 = 90 * fm + 4, s4 = 300 * fm + 15;
      level[i] = p >= s4 ? 4 : p >= s3 ? 3 : p >= s2 ? 2 : p >= s1 ? 1 : 0; if (level[i] >= 2) urban[o] += p;
      if (c.capital === i && level[i] < 1) level[i] = 1;
      if (level[i] && !cellName.has(i)) cellName.set(i, makeName(c.style, 2, 3));
      if (level[i] && !gBand[i]) { gBand[i] = Math.min(255, Math.round(Math.log2(p * 1000 + 1) * 3)); gPrev[i] = gBand[i]; }
    }
    for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv) continue; if (cv.capital < 0 || owner[cv.capital] !== c) cv.capital = bestCell[c]; strengthOf[c] = strength(cv); }
  }

  return {
    W, H, N, MAXC, pop, owner, infra, walls, special, level, cellName, civs, LI, fert, land, flags, elev, bonusFert, siteU, siteV,
    BUILD, works, slotA, slotB, gBand, gPrev, gYear, NSLOTS, slotOf, freeSlots, inProgress, durOf, cannot(kind, i) { const c = playerCiv(); return c ? cannot(c, kind, i) : 'No state'; },
    popOf, cellsOf, strengthOf, acad, temples, ports, markets, wonders, worldEvents, allEvents, history, ERAS, COST,
    volcanoes, fires, floods, quakes, battles, plagues, ruins, rubble, get comet() { return comet; },
    goods, gera, GOODS, GOOD_ID, market, rawPop, held, urban, satOf, touchAll, IND, ind, indN, indAt, workName, eff,
    cellDist,
    // where a realm's yearly income comes from (the same sum the tick makes), for the ledger
    incomeParts(cv) {
      const c = cv.id, base = popOf[c] * (0.06 + cv.tech * 0.3) * cv.policy.tax * tv(cv, 'income', 1), living = market.LS[c];
      const parts = { taxes: base, ports: base * ports[c] * 0.05, markets: base * Math.min(0.3, markets[c] * 0.04), mines: base * Math.min(0.3, mines[c] * 0.05), living: base * 0.3 * Math.max(0, living - 0.45) * (1 + Math.min(0.5, markets[c] * 0.1)), customs: market.rev[c], upkeep: popOf[c] * 0.05 * (cv.policy.military - 1) };
      parts.net = parts.taxes + parts.ports + parts.markets + parts.mines + parts.living + parts.customs - parts.upkeep; return parts;
    },
    // does this realm's age know how to work what this cell yields?
    knows(c, i) { return !!goods[i] && !!c && c.era >= gera[i]; },
    tick, st, get year() { return year; }, get player() { return player; }, get evSeq() { return evSeq; }, playerCiv, setPlayer, costOf, reachOf, spawnTribe, act, playerWar, renamePlayer, plague, meteor, bounty,
    TRAITS, traitOf, fullName, fmtYear, describeCell, isAtWar, capacity, eraOf, strength, save, load, recount, rnd, religionName, makeName, logEvent, evolveGovAll,
    settlementsOf(id) { const out = []; for (let k = 0; k < LI.length; k++) { const i = LI[k]; if (owner[i] === id && level[i]) out.push(i); } out.sort((a, b) => pop[b] - pop[a]); return out; },
    cultivation(i) { const o = owner[i]; if (o < 0 || !civs[o]) return 0; const c = civs[o]; const K = capacity(i, c); const farm = Math.min(1, Math.max(0, (c.tech - 0.025) / 0.1)); return K > 0.01 ? Math.min(1, pop[i] / K) * farm * (level[i] ? 1 : 0.6) : 0; },
    prophet(i) { const o = owner[i]; if (o < 0 || !civs[o]) return 'Click a state'; const c = civs[o]; c.religion = religionName(c.style); c.stability = Math.min(1, c.stability + 0.2); logEvent(c, `A prophet walks out of the desert. ${fullName(c)} takes up ${c.religion}`, true); return `${c.religion} is born`; },
    enlighten(i) { const o = owner[i]; if (o < 0 || !civs[o]) return 'Click a state'; const c = civs[o]; c.tech = Math.min(1, c.tech + 0.06); fmOf[o] = foodMult(c.tech); const e = eraOf(c.tech); if (e !== c.era) { c.era = e; evolveGov(c); } logEvent(c, `A golden age of learning dawns in ${fullName(c)}`, true); return `${fullName(c)} leaps ahead`; },
  };
}

window.createSim = createSim;
