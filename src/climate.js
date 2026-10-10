// Holocene weather (classic script; exposes window.CLIMATE): the climate of the ten thousand years the game is played in, and the
// weather of each of them. Three things, all of them the Earth's own:
//   the ice: in 10,000 BC the last of the great ice sheets still lay over Canada and Scandinavia, and withdrew over five thousand
//     years (DOMES: each a dome that shrinks to nothing by its year; where one still reaches, nobody lives and nothing grows);
//   the green Sahara: from the end of the last cold until about 3500 BC the monsoon reached far into Africa, Arabia and the Thar,
//     and what is desert now was grassland with lakes and herds (GREEN); it dried within a few centuries, and its people went to
//     the rivers;
//   droughts and good years: the great ones history remembers, where and when they were (EVENTS: the cold of 6200 BC, the
//     drought of 2200 BC that broke the kingdoms of the river plains, the dark sun of 536, the Little Ice Age, the Dust Bowl ...),
//     and the weather of every year besides (spells: a drought somewhere every year or so, a run of good harvests now and then).
// What it gives the simulation: every place's harvest this year against the usual (hv: 1 an ordinary year), whether it lies under
// the ice (ice), how green the dry lands are (wet); the host takes the rest (the dead of a famine, the market's crops). It throws its
// own dice. Flat arrays; a year of it touches only the places a drought or a good year is changing.
//   CLIMATE.create(h) -> { step, hv, ice, wet, here, view, spellsIn, save, load, ... } for one world.
window.CLIMATE = (function () {
  'use strict';
  const R_KM = 6371, D2R = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---------- the ice ----------
  // Domes of ice: where each stood at the end of the last cold (r0, kilometres, in 10,050 BC: twelve thousand years before the
  // radiocarbon's present) and the year it was gone. A dome shrinks slowly at first and then fast (p, ICE_P on the whole): the ice
  // over Hudson Bay held until the lake behind it broke through, in 6200 BC, and was gone within a lifetime; the Scandinavian ice
  // stood at its moraines until the last cold ended (hold: 9650 BC) and then went back across the Gulf of Bothnia in two thousand years. Together they are the Laurentide ice
  // sheet (Keewatin, Hudson, Labrador, Foxe), the last of the Cordilleran and the Innuitian, and the Scandinavian one (the Scandes
  // and the dome over the Gulf of Bothnia), Iceland's and the Highlands' (after Dyke 2004 and Hughes et al. 2016, at this grain).
  const T0 = -10050, ICE_P = 0.7;
  const dome = (key, name, lon, lat, r0, end, hold, p) => ({ key, name, lon, lat, r0, end, hold: hold || T0, p: p || ICE_P });
  const DOMES = [
    dome('keewatin', 'the ice of the Keewatin', -97, 61, 1350, -5900),
    dome('hudson', 'the ice over Hudson Bay', -86, 59, 1200, -6250),
    dome('labrador', 'the ice of Labrador', -71, 54.5, 900, -4800),
    dome('foxe', 'the ice of Baffin', -74, 68, 800, -5000),
    dome('cordillera', 'the ice of the western mountains', -126, 56, 450, -8500),
    dome('innuitian', 'the ice of the high Arctic', -82, 79, 600, -6000),
    dome('scandes', 'the ice of the Scandinavian mountains', 15, 64, 650, -7600, -9650, 0.5),
    dome('bothnia', 'the ice over the Gulf of Bothnia', 21, 66, 700, -7650, -9650, 0.5),
    dome('iceland', 'the ice of Iceland', -18.5, 64.9, 220, -8000),
    dome('highlands', 'the ice of the Highlands', -4.8, 56.8, 120, -9650),
  ];
  const ND = DOMES.length;
  const domeR = (d, y) => (y >= d.end ? 0 : y <= d.hold ? d.r0 : d.r0 * Math.pow((d.end - y) / (d.end - d.hold), d.p));
  // great-circle kilometres
  function gcKm(lon1, lat1, lon2, lat2) {
    const a = lat1 * D2R, b = lat2 * D2R, c = Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos((lon2 - lon1) * D2R);
    return R_KM * Math.acos(clamp(c, -1, 1));
  }
  // the year the ice left a place (-1e9: it lay there in no year of the game), and which dome held it last
  function iceLeftAt(lon, lat) {
    let best = -1e9, who = -1;
    for (let k = 0; k < ND; k++) { const d = DOMES[k], km = gcKm(lon, lat, d.lon, d.lat); if (km >= d.r0) continue; const t = d.end - (d.end - d.hold) * Math.pow(km / d.r0, 1 / d.p); if (t > best) { best = t; who = k; } }
    return [best, who];
  }

  // ---------- the green Sahara ----------
  // The African humid period: when the summer sun stood stronger over the north of the world, the monsoon reached far into the
  // Sahara, Arabia and the Thar. Grassland and lakes to the twentieth parallel and beyond, steppe further north; herds, fishermen
  // on lakes where there is sand now. It came with the end of the last cold and went, region by region, in a few centuries: the
  // east of the Sahara and Arabia first, the west later, the Thar last. In each: full wetness south of latFull, none north of
  // latZero; on (from, full) and off (begins, gone).
  const green = (key, name, lon0, lon1, fade, latFull, latZero, on0, on1, off0, off1) => ({ key, name, lon0, lon1, fade, latFull, latZero, on0, on1, off0, off1 });
  const GREEN = [
    green('wsahara', 'the western Sahara', -20, 27, 4, 18, 30, -9700, -8700, -3700, -2700),
    green('esahara', 'the eastern Sahara', 21, 38, 4, 18, 28.5, -9700, -8700, -4300, -3300),
    green('arabia', 'Arabia', 35, 60, 3, 17, 30, -9200, -8200, -4500, -3500),
    green('thar', 'the Thar', 66, 76, 2, 24, 31, -9200, -8200, -2600, -1900),
  ];
  const NGR = GREEN.length;
  const greenProfile = (g, lon, lat) => (lat <= 0 ? 0 : Math.min(sstep(g.lon0 - g.fade, g.lon0 + g.fade, lon), 1 - sstep(g.lon1 - g.fade, g.lon1 + g.fade, lon)) * (1 - sstep(g.latFull, g.latZero, lat)));
  // how green each region is in a year (the cold of 6200 BC dried it for a lifetime)
  const greenS = (g, y) => sstep(g.on0, g.on1, y) * (1 - sstep(g.off0, g.off1, y)) * (1 - 0.6 * evRamp(EV.cold82, y));
  // what kinds of land the wet years changed (land.js's numbering: desert, steppe, high plateau), and how much
  const GREEN_KIND = { 4: 1, 5: 0.6, 13: 0.5 };

  // ---------- the great droughts and colds ----------
  // Where and when, as the cores, the lakes and the chronicles have them; how deep (the harvest at the worst: 0.72 is 72 in a
  // hundred of an ordinary year; above 1, the warm centuries' better harvests in the north), in circles [lon, lat, km]. A
  // place's share falls off from the middle of a circle to its edge (EV_IN), and an event comes in over its first sixth and goes
  // over its last quarter. kind: drought (the land browns), cold (the snow lies longer), warm, volcanic (a dim sun: cold).
  const ev = (key, name, kind, y0, y1, depth, where, text) => ({ key, name, kind, y0, y1, depth, where, text });
  const EVENTS = [
    ev('cold82', 'the Cold Years', 'cold', -6250, -6080, 0.84, [[35, 37, 1200], [15, 48, 1300], [8, 28, 1500]],
      'For a lifetime the summers are cold and the rains fail, from the plains of Europe to the hills of Anatolia and the grasslands of the Sahara: the first farmers leave their villages.'),
    ev('drying', 'the Drying', 'drought', -3950, -3750, 0.85, [[18, 23, 2000], [46, 25, 1200], [38, 32, 700]],
      'The rains that fed the grasslands of the Sahara and Arabia fail, and when they come back they are not what they were. The herdsmen drive their cattle to the rivers.'),
    ev('great42', 'the Great Drought', 'drought', -2250, -2000, 0.72, [[43, 33, 650], [37, 34, 450], [33, 39, 500], [31, 27, 600], [70, 27, 650], [23, 38, 350], [113, 35, 700], [52, 32, 600]],
      'The rains fail from the Aegean to the Indus, and the Nile\'s flood is low year after year: the granaries empty, and the great kingdoms of the river plains break apart.'),
    ev('long12', 'the Long Drought', 'drought', -1250, -1080, 0.78, [[35, 34, 600], [33, 39, 600], [23, 38, 400], [43, 34, 600], [31, 28, 500]],
      'Years without rain in the lands of the eastern sea: famine, wanderers on the roads, and kingdoms that had stood for centuries fall.'),
    ev('warmrome', 'the Warm Centuries', 'warm', -200, 350, 1.04, [[12, 45, 1600], [30, 38, 1200]],
      'Mild winters and steady rains round the inland sea: the harvests are good, the vines climb the hills and the grain ships sail.'),
    ev('dark536', 'the Dark Sun', 'volcanic', 536, 546, 0.8, [[10, 50, 2500], [60, 45, 2500], [110, 40, 2200], [-95, 40, 2500]],
      'The sun shines as dim as the moon for a year and a half; snow falls in summer, and the harvests fail across the north of the world.'),
    ev('cold536', 'the Cold after the Dark Sun', 'cold', 546, 660, 0.95, [[20, 52, 2500], [80, 45, 2500]],
      'The summers stay short and cold for a century after the dark sun: less grain, and wanderers from the steppe.'),
    ev('maya', 'the Drought of the Jungle Cities', 'drought', 800, 950, 0.75, [[-89, 18, 450]],
      'Year after year the rains fail over the jungle cities: the reservoirs dry, and the people leave the cities to the forest.'),
    ev('warmmed', 'the Warm Years of the North', 'warm', 950, 1250, 1.05, [[10, 58, 1500], [-40, 64, 1000]],
      'Mild summers in the north: vines in England, farms in Greenland, and good harvests.'),
    ev('pueblo', 'the Drought of the Cliff Dwellers', 'drought', 1276, 1300, 0.72, [[-109, 36, 500]],
      'Twenty years without enough rain in the canyons: the cliff villages are left empty.'),
    ev('famine1315', 'the Great Famine', 'cold', 1315, 1318, 0.7, [[8, 51, 1200]],
      'Rain without end for three summers: the grain rots in the fields, and the poor eat what they can find.'),
    ev('lia', 'the Little Ice Age', 'cold', 1550, 1750, 0.94, [[15, 55, 2600], [100, 40, 1800], [-90, 45, 2000]],
      'The winters grow long and hard: rivers freeze that never froze, the glaciers come down into the valleys, and for two hundred years the harvests are poorer.'),
    ev('ming', 'the Drought of the Late Ming', 'drought', 1627, 1644, 0.75, [[112, 36, 700]],
      'Locusts and drought on the northern plains, year after year: famine, and armies of the starving.'),
    ev('laki', 'the Haze of Laki', 'volcanic', 1783, 1785, 0.85, [[5, 52, 1400]],
      'A volcano in Iceland breathes a poisoned haze over the north: the summer is red and the winter bitter.'),
    ev('tambora', 'the Year Without a Summer', 'volcanic', 1816, 1817, 0.8, [[5, 48, 1500], [-75, 42, 1100]],
      'A mountain in the islands of the east has blown itself apart: snow in June, frost in August, and no harvest worth the name.'),
    ev('monsoon1876', 'the Great Famine of the Monsoon', 'drought', 1876, 1879, 0.7, [[78, 17, 900], [113, 36, 700], [-40, -7, 600]],
      'The monsoon fails, and fails again: in India, in China and in the north of Brazil the dead are counted in millions.'),
    ev('dustbowl', 'the Dust Bowl', 'drought', 1931, 1940, 0.75, [[-100, 37, 600]],
      'The ploughed plains blow away in black storms: the farms are given up, and their people take to the road.'),
    ev('sahel', 'the Drought of the Sahel', 'drought', 1968, 1985, 0.75, [[-5, 14, 1000], [15, 13, 900], [30, 13, 600]],
      'The rains fail along the southern edge of the Sahara for seventeen years: the herds die, and the desert moves south.'),
  ];
  const EV = {}; EVENTS.forEach((e, k) => { e.id = k; EV[e.key] = e; });
  function evRamp(e, y) { if (y < e.y0 || y >= e.y1) return 0; const L = e.y1 - e.y0; if (L <= 4) return 1; return clamp(Math.min((y - e.y0 + 1) / (L * 0.16), (e.y1 - y) / (L * 0.25), 1), 0, 1); }
  const EV_IN = (q) => (q >= 1 ? 0 : q <= 0.5 ? 1 : sstep(1, 0.5, q));      // (a share of an event's depth, by the distance over the circle's radius)

  // ---------- the ages of the climate ----------
  // What the date's page names, and how much colder than our own day's the snow is (chill: 1 the last of the Ice Age's cold; the
  // snow lies longer and further south by it, the ground's shader and the trees' boughs read it).
  const EPOCHS = [
    [-1e9, 'the last cold of the Ice Age', 0.8, 'The cold is breaking: the ice sheets still lie over the north, and the sea is lower than it will be.'],
    [-9650, 'the great thaw', 0.25, 'The ice withdraws from the north; the monsoon reaches deep into Africa and Arabia, and the Sahara is green.'],
    [-6000, 'the Holocene warmth', -0.1, 'The warmest centuries since the ice: the north is mild, and the Sahara still green.'],
    [-3500, 'the drying', 0.05, 'The monsoon has drawn back south: the Sahara is desert, and its people live by the rivers.'],
    [-250, 'the warm centuries', -0.1, 'Mild winters and good harvests round the inland sea.'],
    [400, 'the cold of the dark centuries', 0.3, 'Cooler summers and poorer harvests in the north.'],
    [950, 'the warm years of the north', -0.15, 'Mild summers in the north: farms in Greenland, vines in England.'],
    [1250, 'the Little Ice Age', 0.45, 'Long hard winters: rivers freeze, glaciers grow, and harvests are poorer for centuries.'],
    [1850, 'the thaw of the machine age', 0.1, 'The glaciers begin to withdraw.'],
    [1980, 'the warming', -0.35, 'The world grows warmer than it has been since the ice: the snow lies less and the glaciers melt.'],
  ];
  function epochOf(y) { let e = EPOCHS[0]; for (const x of EPOCHS) if (y >= x[0]) e = x; return { name: e[1], chill: e[2], text: e[3], since: e[0] }; }
  // (the chill of the year: the age's, more in a cold event, less in a warm one)
  function chillOf(y) { let c = epochOf(y).chill; for (const e of EVENTS) { const r = evRamp(e, y); if (!r) continue; if (e.kind === 'cold') c += 0.35 * r; else if (e.kind === 'volcanic') c += 0.6 * r; else if (e.kind === 'warm') c -= 0.15 * r; } return clamp(c, -1, 1.5); }

  // ---------- the weather of a year ----------
  // How readily each kind of land has a bad year (land.js's kinds: sea, ice, tundra, boreal, desert, steppe, grass, oceanic woods,
  // Mediterranean, monsoon, savanna, rainforest, tropical highlands, high plateau, continental woods, tropical Asia): the steppe,
  // the savanna and the monsoon's lands most, the rainforest and the boreal woods least.
  const VAR = [0, 0, 0.3, 0.4, 0.6, 1.4, 1.1, 0.7, 1.2, 1.3, 1.4, 0.4, 0.9, 1.0, 0.8, 0.8];
  // A spell: a drought or a run of good harvests over a few hundred kilometres for some years. rate: how many begin in a year in
  // the whole world; r: its radius (km); depth or gain at its heart; years: how long on the whole, at most.
  const SPELL = { drought: { rate: 1.6, r: [300, 900], depth: [0.15, 0.45], years: 2.5, max: 7 }, plenty: { rate: 0.8, r: [300, 700], gain: [0.06, 0.14], years: 1.8, max: 3 } };
  const SP_IN = (q) => (q >= 1 ? 0 : (1 - q * q) * (1 - q * q));      // (a spell is at its worst at its heart)
  const SP_IN2 = (q2) => (q2 >= 1 ? 0 : (1 - q2) * (1 - q2));      // (the same, from the square of the distance over the radius)
  const MAXV = 12;      // (how many droughts the ground's shader is told of: the deepest)

  // the lens of the harvest: what the year is, place by place
  const BANDS = [
    { key: 'none', name: 'An ordinary year', css: 'transparent', rgb: [0, 0, 0] },
    { key: 'ice', name: 'Under the ice', css: '#e8f1fb', rgb: [0.91, 0.95, 0.98] },
    { key: 'green', name: 'Green where the desert will be', css: '#5f9a5a', rgb: [0.37, 0.6, 0.35] },
    { key: 'famine', name: 'The harvest fails (under 70 in a hundred)', css: '#7a3418', rgb: [0.48, 0.2, 0.09] },
    { key: 'drought', name: 'A drought (70 to 88)', css: '#c27a34', rgb: [0.76, 0.48, 0.2] },
    { key: 'poor', name: 'A poor year (88 to 96)', css: '#dcc184', rgb: [0.86, 0.76, 0.52] },
    { key: 'good', name: 'A good year (above 104)', css: '#4f8f3c', rgb: [0.31, 0.56, 0.24] },
  ];
  const BK = {}; BANDS.forEach((b, k) => { b.id = k; BK[b.key] = k; });

  // ---------- one grid's places, made once ----------
  // (lon and lat of every cell, the year the ice left it and which dome held it last, how green the wet years made it and in
  //  which region: the same for every world on the grid)
  const grids = {};
  function grid(W, H) {
    const key = W + 'x' + H; if (grids[key]) return grids[key];
    const N = W * H, lonX = new Float32Array(W), latY = new Float32Array(H), cosY = new Float32Array(H), sinY = new Float32Array(H), cosX = new Float64Array(W), sinX = new Float64Array(W);
    for (let x = 0; x < W; x++) { lonX[x] = (x + 0.5) / W * 360 - 180; cosX[x] = Math.cos(lonX[x] * D2R); sinX[x] = Math.sin(lonX[x] * D2R); }
    for (let y = 0; y < H; y++) { latY[y] = 90 - (y + 0.5) / H * 180; cosY[y] = Math.cos(latY[y] * D2R); sinY[y] = Math.sin(latY[y] * D2R); }
    const iceLeft = new Float32Array(N).fill(-1e9), iceDome = new Int8Array(N).fill(-1), greenP = new Float32Array(N), greenR = new Int8Array(N).fill(-1);
    for (let y = 0; y < H; y++) {
      const lat = latY[y]; const nearIce = DOMES.some((d) => Math.abs(lat - d.lat) * 111.2 < d.r0); const inGreen = lat > 5 && lat < 34;
      if (!nearIce && !inGreen) continue;
      for (let x = 0; x < W; x++) {
        const i = y * W + x, lon = lonX[x];
        if (nearIce) { const [t, k] = iceLeftAt(lon, lat); if (k >= 0) { iceLeft[i] = t; iceDome[i] = k; } }
        if (inGreen) for (let g = 0; g < NGR; g++) { const p = greenProfile(GREEN[g], lon, lat); if (p > greenP[i]) { greenP[i] = p; greenR[i] = g; } }
      }
    }
    return (grids[key] = { W, H, N, lonX, latY, cosY, sinY, cosX, sinX, iceLeft, iceDome, greenP, greenR });
  }
  // the cells within r km of a place: f(i, q2) with q2 the square of the distance over r (0 at the place, 1 at the edge). (The angle's
  // square from the chord's: 2(1 - cos a) is a^2 - a^4/12 ..., good to a part in two hundred over the widest circle here, and no
  // arc-cosine for each cell)
  function within(Gd, lon, lat, rKm, f) {
    const { W, H, cosY, sinY, cosX, sinX } = Gd, dLat = rKm / 111.2, y0 = Math.max(0, Math.floor((90 - (lat + dLat)) / 180 * H)), y1 = Math.min(H - 1, Math.ceil((90 - (lat - dLat)) / 180 * H));
    const sa = Math.sin(lat * D2R), ca = Math.cos(lat * D2R), cr = Math.cos(rKm / R_KM), co = Math.cos(lon * D2R), so = Math.sin(lon * D2R), k2 = (R_KM / rKm) * (R_KM / rKm);
    for (let y = y0; y <= y1; y++) {
      const cl = cosY[y], sb = sinY[y], a = sa * sb, b = ca * cl; const dLon = cl > 0.02 ? rKm / (111.2 * cl) + 1 : 360; const xc = (lon + 180) / 360 * W - 0.5, xr = dLon / 360 * W;
      let xa = Math.floor(xc - xr), xb = Math.ceil(xc + xr); if (xb - xa + 1 >= W) { xa = 0; xb = W - 1; }      // (near a pole a circle takes the whole row: each cell once)
      for (let xx = xa; xx <= xb; xx++) {
        const x = xx < 0 ? xx + W : xx >= W ? xx - W : xx; const c = a + b * (cosX[x] * co + sinX[x] * so); if (c < cr) continue;
        const u = c >= 1 ? 0 : 2 * (1 - c); f(y * W + x, (u + u * u / 12) * k2);
      }
    }
  }

  // ---------- one world ----------
  // h: { W, H, LI (the land's cells), kcls (land.js's kind of each cell), year(), seed, owner (each cell's realm), live (a cell's
  //      people, for the news), civs, nameOf(c) (a realm's full name), placeOf(i) (a place's name) }
  function create(h) {
    const { W, H, LI, kcls } = h; const Gd = grid(W, H), N = Gd.N;
    const hv = new Float32Array(N).fill(1), evF = new Float32Array(N).fill(1), spF = new Float32Array(N).fill(1);
    const ice = new Uint8Array(N), wet = new Float32Array(N);
    const tmp = new Float32Array(N), inEv = new Uint8Array(N), spN = new Uint8Array(N); let evCells = [];
    const dirty = new Int32Array(N); let nDirty = 0; const isDirty = new Uint8Array(N);
    const mark = (i) => { if (!isDirty[i]) { isDirty[i] = 1; dirty[nDirty++] = i; } };
    const flush = () => { for (let k = 0; k < nDirty; k++) { const i = dirty[k]; hv[i] = ice[i] ? 0 : evF[i] * spF[i]; isDirty[i] = 0; } nDirty = 0; };
    // (how dry and how prone to bad years each land cell is, and the land the wet years could green: once)
    const greenK = new Float32Array(N); const iceCells = [], greenCells = [];
    for (const i of LI) { if (Gd.iceLeft[i] > -1e8) iceCells.push(i); const g = Gd.greenP[i] * (GREEN_KIND[kcls[i]] || 0); if (g > 0.01) { greenK[i] = g; greenCells.push(i); } }
    let s = ((h.seed || 1) * 2246822519 + 0x5EED) >>> 0;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const poisson = (l) => { let k = 0, p = Math.exp(-l), q = p, u = rnd(); while (u > q && k < 20) { k++; p *= l / k; q += p; } return k; };
    let spells = [], nid = 1, evSig = '', slowAt = -1e9, first = true, wetVer = 0; const seen = new Set(); const news = [];
    const stats = { droughts: 0, plenty: 0, events: 0, ms: 0 };

    // the ice and the green lands: once a decade (the ice withdraws a few kilometres a year)
    function slow(y) {
      let iceN = 0;
      for (const i of iceCells) { const v = y < Gd.iceLeft[i] ? 1 : 0; if (v !== ice[i]) { ice[i] = v; mark(i); } iceN += v; }
      let moved = false; for (const i of greenCells) { const g = greenS(GREEN[Gd.greenR[i]], y) * greenK[i]; if (Math.abs(g - wet[i]) > 1e-4) { wet[i] = g; mark(i); moved = true; } }
      if (moved) wetVer++; slowAt = y; return iceN;
    }
    // the great events: their field again whenever one begins, ends, or has come in or gone out by a step (a fifth; a tenth for
    // the short ones). Each event's places and its share at each are found once (evAt) and kept: the Little Ice Age is a sixth of the land
    const evAt = new Map();
    function placesOf(e) {
      let P = evAt.get(e.key); if (P) return P; const touched = [];
      for (const [lon, lat, km] of e.where) within(Gd, lon, lat, km, (i, q2) => { const v = EV_IN(Math.sqrt(q2)); if (v > tmp[i]) { if (!tmp[i]) touched.push(i); tmp[i] = v; } });
      P = { idx: Int32Array.from(touched), val: new Float32Array(touched.length) }; touched.forEach((i, k) => { P.val[k] = tmp[i]; tmp[i] = 0; }); evAt.set(e.key, P); return P;
    }
    function events(y) {
      let sig = ''; for (const e of EVENTS) { const r = evRamp(e, y); if (r > 0) sig += e.id + ':' + (e.y1 - e.y0 > 60 ? Math.round(r * 5) : Math.round(r * 10)) + ','; }
      for (const e of EVENTS) { if (y >= e.y0 && y < e.y1 && !seen.has(e.key)) { seen.add(e.key); stats.events++; news.push({ kind: 'event', key: e.key, year: y, realms: realmsIn(e.where) }); } }
      if (sig === evSig) return; evSig = sig;
      for (const i of evCells) { evF[i] = 1; inEv[i] = 0; mark(i); } evCells = [];
      for (const e of EVENTS) {
        let r = evRamp(e, y); if (r <= 0) continue; r = e.y1 - e.y0 > 60 ? Math.round(r * 5) / 5 : r; const P = placesOf(e), d = (e.depth - 1) * r;
        for (let k = 0; k < P.idx.length; k++) { const i = P.idx[k]; evF[i] *= 1 + d * P.val[k]; if (!inEv[i]) { inEv[i] = 1; evCells.push(i); } mark(i); }
      }
    }
    function realmsIn(where) {
      const n = new Map(); for (const [lon, lat, km] of where) within(Gd, lon, lat, km, (i, q2) => { if (q2 > 0.72) return; const o = h.owner[i]; if (o >= 0) n.set(o, (n.get(o) || 0) + 1); });
      return [...n.entries()].filter((x) => x[1] >= 3).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    }
    // a place for a spell: a cell of land, as prone to bad years as its kind is; never under the ice
    function spawn(kind, y) {
      const S = SPELL[kind];
      for (let t = 0; t < 24; t++) {
        const i = LI[(rnd() * LI.length) | 0]; if (ice[i] || !(rnd() * 1.4 < VAR[kcls[i]])) continue;
        const x = i % W, yy = (i / W) | 0, r = S.r[0] + rnd() * (S.r[1] - S.r[0]);
        const sev = kind === 'drought' ? -(S.depth[0] + rnd() * (S.depth[1] - S.depth[0])) * Math.min(1.2, 0.6 + 0.4 * VAR[kcls[i]]) : S.gain[0] + rnd() * (S.gain[1] - S.gain[0]);
        const n = Math.min(S.max, 1 + Math.floor(-Math.log(1 - rnd() * 0.999) * (S.years - 1)));
        return { id: nid++, kind, i, lon: Gd.lonX[x], lat: Gd.latY[yy], r, s: sev, y0: y, y1: y + n };
      }
      return null;
    }
    // a spell is laid on its cells when it begins and taken off when it ends (each cell counts the spells over it, so that one under none
    // is exactly an ordinary year again); the realms it reaches are counted as it is laid
    // (the cells a spell lies on, and its factor at each, are kept on it from when it is laid until it is taken off)
    const lIdx = [], lF = [], rcN = new Uint16Array(65536), rcL = [];
    function lay(sp, on) {
      if (on) {
        lIdx.length = 0; lF.length = 0; rcL.length = 0;
        within(Gd, sp.lon, sp.lat, sp.r, (i, q2) => { const v = SP_IN2(q2); if (v <= 0) return; const f = 1 + sp.s * v; spF[i] *= f; spN[i]++; mark(i); lIdx.push(i); lF.push(f);
          if (q2 < 0.72) { const o = h.owner[i]; if (o >= 0) { if (!rcN[o]) rcL.push(o); rcN[o]++; } } });
        sp.cells = Int32Array.from(lIdx); sp.fs = Float32Array.from(lF);
        sp.realms = rcL.filter((o) => rcN[o] >= 3).sort((a, b) => rcN[b] - rcN[a]); for (const o of rcL) rcN[o] = 0;
      } else if (sp.cells) {
        const C = sp.cells, F = sp.fs; for (let k = 0; k < C.length; k++) { const i = C[k]; if (spN[i] > 0 && --spN[i] === 0) spF[i] = 1; else spF[i] /= F[k]; mark(i); } sp.cells = null; sp.fs = null;
      }
    }
    function weather(y) {
      for (let k = spells.length - 1; k >= 0; k--) if (spells[k].y1 <= y) { const sp = spells[k]; spells.splice(k, 1); lay(sp, false); if (sp.kind === 'drought') news.push({ kind: 'rains', id: sp.id, year: y, realms: sp.realms || [], at: sp.i, years: sp.y1 - sp.y0 }); }
      for (const kind of ['drought', 'plenty']) { let n = poisson(SPELL[kind].rate); while (n-- > 0) { const sp = spawn(kind, y); if (!sp) continue; spells.push(sp); lay(sp, true); stats[kind === 'drought' ? 'droughts' : 'plenty']++; news.push({ kind, id: sp.id, year: y, realms: sp.realms, at: sp.i, s: sp.s }); } }
    }
    // a year
    function step() {
      const t0 = performance.now(), y = h.year();
      if (first || y - slowAt >= 10 || y < slowAt) slow(y);
      events(y); weather(y); first = false;
      flush();
      stats.ms = performance.now() - t0;
    }
    // ---------- what the pages ask ----------
    // a place this year: its harvest, the spell over it (how many years so far), the great event, the ice and the green
    function here(i) {
      const y = h.year(), x = i % W, yy = (i / W) | 0, lon = Gd.lonX[x], lat = Gd.latY[yy];
      const out = { hv: hv[i], ice: !!ice[i], iceLeft: Gd.iceLeft[i], iceDome: Gd.iceDome[i] >= 0 ? DOMES[Gd.iceDome[i]].name : '', wet: wet[i], greenEnd: Gd.greenR[i] >= 0 ? GREEN[Gd.greenR[i]].off1 : 0, greenName: Gd.greenR[i] >= 0 ? GREEN[Gd.greenR[i]].name : '', spell: null, event: null };
      let best = 0; for (const sp of spells) { const q = gcKm(lon, lat, sp.lon, sp.lat) / sp.r; if (q >= 1) continue; const v = Math.abs(sp.s) * SP_IN(q); if (v > best) { best = v; out.spell = { kind: sp.kind, years: y - sp.y0 + 1, depth: sp.s * SP_IN(q), id: sp.id }; } }
      let eb = 0; for (const e of EVENTS) { const r = evRamp(e, y); if (!r) continue; for (const [elon, elat, km] of e.where) { const q = gcKm(lon, lat, elon, elat) / km; const v = EV_IN(q) * r; if (v > eb) { eb = v; out.event = { key: e.key, name: e.name, kind: e.kind, text: e.text, y0: e.y0, y1: e.y1, share: v }; } } }
      return out;
    }
    // the band of the lens of the harvest a place is in
    function bandOf(i) { if (ice[i]) return BK.ice; const v = hv[i]; if (v < 0.7) return BK.famine; if (v < 0.88) return BK.drought; if (v < 0.96) return BK.poor; if (v > 1.04) return BK.good; if (wet[i] > 0.25) return BK.green; return BK.none; }
    // what the ground's shader is told: the domes as they stand (lon, lat, km), how green each region is, the droughts (the deepest
    // MAXV of the spells and of the great droughts' circles: lon, lat, km, how much the harvest is down at the heart), the chill
    function view(out) {
      const y = h.year(); out = out || { domes: new Float32Array(ND * 4), green: new Float32Array(4), dry: new Float32Array(MAXV * 4), nDry: 0, chill: 0 };
      for (let k = 0; k < ND; k++) { const d = DOMES[k]; out.domes[k * 4] = d.lon; out.domes[k * 4 + 1] = d.lat; out.domes[k * 4 + 2] = domeR(d, y); out.domes[k * 4 + 3] = 0; }
      for (let g = 0; g < 4; g++) out.green[g] = g < NGR ? greenS(GREEN[g], y) : 0;
      const dry = []; for (const sp of spells) if (sp.s < 0) dry.push([sp.lon, sp.lat, sp.r, -sp.s]);
      for (const e of EVENTS) { if (e.kind !== 'drought') continue; const r = evRamp(e, y); if (!r) continue; for (const [lon, lat, km] of e.where) dry.push([lon, lat, km, (1 - e.depth) * r]); }
      dry.sort((a, b) => b[3] - a[3]); out.nDry = Math.min(MAXV, dry.length); out.dry.fill(0);
      for (let k = 0; k < out.nDry; k++) { const q = dry[k]; out.dry[k * 4] = q[0]; out.dry[k * 4 + 1] = q[1]; out.dry[k * 4 + 2] = q[2]; out.dry[k * 4 + 3] = q[3]; }
      out.chill = chillOf(y); return out;
    }
    // the spells over a realm's land now (for its panel and what is under way): [{ kind, years, cells, worst }]
    function spellsIn(c) {
      const out = []; const y = h.year();
      for (const sp of spells) { let n = 0, worst = 1; within(Gd, sp.lon, sp.lat, sp.r, (i, q2) => { if (h.owner[i] !== c) return; n++; const v = 1 + sp.s * SP_IN2(q2); if (sp.s < 0 ? v < worst : v > worst) worst = v; }); if (n) out.push({ id: sp.id, kind: sp.kind, years: y - sp.y0 + 1, cells: n, worst, at: sp.i }); }
      return out.sort((a, b) => b.cells - a.cells);
    }
    function save() { return { s, nid, sp: spells.map((x) => [x.id, x.kind === 'drought' ? 0 : 1, x.i, x.r, x.s, x.y0, x.y1]), seen: [...seen] }; }
    function load(o) {
      spells = []; seen.clear(); evSig = ''; first = true;
      if (o) { s = o.s >>> 0; nid = o.nid || 1; for (const a of o.sp || []) { const i = a[2]; spells.push({ id: a[0], kind: a[1] ? 'plenty' : 'drought', i, lon: Gd.lonX[i % W], lat: Gd.latY[(i / W) | 0], r: a[3], s: a[4], y0: a[5], y1: a[6] }); } for (const k of o.seen || []) seen.add(k); }
      else { const y = h.year(); for (const e of EVENTS) if (y >= e.y0) seen.add(e.key); }      // (a world from before the weather: what has begun already is not news)
      ice.fill(0); wet.fill(0); hv.fill(1); evF.fill(1); spF.fill(1); inEv.fill(0); spN.fill(0); evCells = []; nDirty = 0; isDirty.fill(0);
      const y = h.year(); slow(y); events(y); for (const sp of spells) lay(sp, true); news.length = 0;
      flush(); first = false;
    }
    // (a new world begins with the climate of its year, and with what has already begun counted as old)
    { const y = h.year(); for (const e of EVENTS) if (y > e.y0) seen.add(e.key); slow(y); events(y); news.length = 0; flush(); }
    return { hv, ice, wet, greenK, greenCells, step, here, bandOf, view, spellsIn, save, load, news, stats, get spells() { return spells; }, get wetVer() { return wetVer; }, epoch: () => epochOf(h.year()), chill: () => chillOf(h.year()), iceLeft: Gd.iceLeft };
  }
  return { create, DOMES, GREEN, EVENTS, EV, EPOCHS, BANDS, BK, SPELL, VAR, MAXV, ND, NGR, T0, ICE_P, domeR, greenS, evRamp, epochOf, chillOf, iceLeftAt, gcKm, grid };
})();
