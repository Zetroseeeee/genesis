// Fills the holes in the elevation packs (data/e).
//
// The packs were built from a source that had nothing for a few rectangles of the Earth: there the ground was left at
// sea level, a pit with walls kilometres high where it met the mountains round it (Bohemia, the eastern Carpathians,
// the Yukon, the Qaidam, a quarter of Antarctica). This reads every pack, finds the ground that is at zero inside
// those rectangles though it should not be, and puts real heights there.
//
//   node tools/terrain/voids.mjs scan                 list the holes (quarter-degree cells at zero, well inland, beside high ground)
//   node tools/terrain/voids.mjs fix [--source terrarium|world] [--cache <dir>] [--out <dir>] [--levels 3,4,5]
//
// Heights come from the Terrain Tiles on AWS Open Data ("terrarium" PNGs: metres = R*256 + G + B/256 - 32768,
// https://registry.opendata.aws/terrain-tiles/ - Mapzen/Tilezen's mosaic of SRTM, GMTED2010, ETOPO1 and others, see
// https://github.com/tilezen/joerd/blob/master/docs/attribution.md). That host cannot be reached from the cloud
// workspace, so the Terrain workflow runs this and publishes the changed packs for review. `--source world` uses the
// simulation's own half-degree grid instead (data/world.png): coarse, for trying the machinery where there is no network.
// Where new ground meets old, the old is eased toward the new over a few pixels, so no seam is left.
// Needs sharp: tools/models/node_modules (npm ci --prefix tools/models).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(ROOT, 'tools/models/'));
const sharp = require('sharp');

// lon0, lon1, lat0, lat1 (a little larger than the holes: only ground at zero inside them is touched)
const VOIDS = [
  { name: 'the Qaidam and the Altun', box: [89.5, 96.5, 35.5, 40.5] },
  { name: 'the Yukon, south-east Alaska, northern British Columbia', box: [-144.5, -125.5, 51.5, 68.5] },
  { name: 'Bohemia, Saxony, Silesia, Lower Austria', box: [11.5, 18.0, 47.8, 52.5] },
  { name: 'the eastern Carpathians', box: [20.5, 24.0, 47.8, 50.7] },
  { name: 'East Antarctica', box: [89.5, 180.0, -85.06, -66.0] },          // (south of 85.05 S the packs have ground from another source, and it is whole)
  { name: 'Antarctica by the date line', box: [-180.0, -177.0, -85.06, -82.5] },
];
const CAP = -85.0511;       // where the Mercator tiles end
const FEATHER = 10;         // pixels over which old ground is eased toward new beside a hole
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'), 'utf8')); const PACKS = index.elev.packs; const TILE = index.tile;
const packFile = (L, px, py) => path.join(ROOT, 'data/e', `${L}_${px}_${py}.png`);
// a pack's pixel -> the centre of that pixel on the Earth (tiles of level L are 360/2^(L+1) degrees across)
const geo = (L, px, py, W) => { const td = 360 / (2 << L); const n = index.elev.packTiles; return { lon: (x) => -180 + (px * n + (x + 0.5) / TILE) * td, lat: (y) => 90 - (py * n + (y + 0.5) / TILE) * td, td }; };
const inVoid = (lon, lat) => { for (const v of VOIDS) if (lon >= v.box[0] && lon <= v.box[1] && lat >= v.box[2] && lat <= v.box[3]) return true; return false; };

// ---- where heights come from ----
function terrarium(cacheDir) {
  const URL0 = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'; const mem = new Map(); let fetched = 0, cached = 0;
  const load = async (z, x, y) => {
    const key = `${z}/${x}/${y}`; if (mem.has(key)) return mem.get(key);
    const file = path.join(cacheDir, `${z}_${x}_${y}.png`); let buf = null;
    if (fs.existsSync(file)) { buf = fs.readFileSync(file); cached++; }
    else {
      for (let k = 0; ; k++) { try { const r = await fetch(`${URL0}/${key}.png`); if (!r.ok) throw new Error('HTTP ' + r.status); buf = Buffer.from(await r.arrayBuffer()); break; } catch (e) { if (k >= 4) throw new Error(`terrain tile ${key}: ${e.message}`); await new Promise((ok) => setTimeout(ok, 500 * (k + 1))); } }
      fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(file, buf); fetched++;
    }
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true }); const out = new Float32Array(256 * 256); const C = info.channels;
    for (let i = 0; i < 65536; i++) out[i] = data[i * C] * 256 + data[i * C + 1] + data[i * C + 2] / 256 - 32768;
    mem.set(key, out); return out;
  };
  return {
    name: 'terrarium', stats: () => `${fetched} tiles fetched, ${cached} from the cache`, clear: () => mem.clear(),
    // the tiles a set of points needs at zoom z (each point's four neighbours), fetched a few dozen at a time
    async prepare(z, pts) {
      const need = new Set(); const n = 1 << z, S = 256 * n;
      for (const [lon, lat] of pts) { const [gx, gy] = merc(lon, Math.max(lat, CAP), S); for (const dx of [0, 1]) for (const dy of [0, 1]) { const X = ((Math.floor(gx) + dx) >> 8), Y = Math.min(n - 1, Math.max(0, (Math.floor(gy) + dy) >> 8)); need.add(`${((X % n) + n) % n}/${Y}`); } }
      const list = [...need]; for (let i = 0; i < list.length; i += 32) await Promise.all(list.slice(i, i + 32).map((k) => { const [x, y] = k.split('/').map(Number); return load(z, x, y); }));
      return list.length;
    },
    at(z, lon, lat) {
      const n = 1 << z, S = 256 * n; const [gx, gy] = merc(lon, Math.max(lat, CAP), S); const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0; let h = 0;
      for (const dx of [0, 1]) for (const dy of [0, 1]) { const X = x0 + dx, Y = Math.min(S - 1, Math.max(0, y0 + dy)); const t = mem.get(`${z}/${(((X >> 8) % n) + n) % n}/${Y >> 8}`); if (!t) throw new Error('tile not prepared'); h += t[(Y & 255) * 256 + (X & 255)] * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy); }
      return h;
    },
  };
}
const merc = (lon, lat, S) => { const s = Math.sin(Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180); return [(lon + 180) / 360 * S - 0.5, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * S - 0.5]; };
// the simulation's own grid: one byte per half degree, turned into metres by what the packs themselves say where they are whole
async function worldGrid() {
  const { data, info } = await sharp(path.join(ROOT, 'data/world.png')).raw().toBuffer({ resolveWithObject: true }); const W = info.width, H = info.height, C = info.channels;
  const byte = (lon, lat) => { const gx = (lon + 180) / 360 * W - 0.5, gy = (90 - lat) / 180 * H - 0.5; const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0; let v = 0; for (const dx of [0, 1]) for (const dy of [0, 1]) v += data[(Math.min(H - 1, Math.max(0, y0 + dy)) * W + (((x0 + dx) % W) + W) % W) * C] * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy); return v; };
  // calibrate against level 3 (the whole Earth in eight packs), away from the holes
  const sum = new Float64Array(256), cnt = new Float64Array(256);
  for (let py = 0; py < 2; py++) for (let px = 0; px < 4; px++) { const key = `3/${px}/${py}`; if (!PACKS[key]) continue; const { data: d, info: i } = await sharp(packFile(3, px, py)).raw().toBuffer({ resolveWithObject: true }); const g = geo(3, px, py, i.width); const [mn, sc] = PACKS[key];
    for (let y = 4; y < i.height; y += 16) for (let x = 4; x < i.width; x += 16) { const lon = g.lon(x), lat = g.lat(y); if (inVoid(lon, lat) || lat < -84) continue; const h = mn + d[(y * i.width + x) * i.channels] * sc; if (h <= 0) continue; const b = Math.round(byte(lon, lat)); sum[b] += h; cnt[b]++; } }
  const lut = new Float64Array(256); let last = 0; for (let b = 0; b < 256; b++) { if (cnt[b] > 3) last = Math.max(last, sum[b] / cnt[b]); lut[b] = last; }
  return { name: 'world', stats: () => 'the half-degree grid', clear() {}, async prepare() { return 0; }, at(z, lon, lat) { const v = byte(lon, Math.max(lat, CAP)); const b0 = Math.floor(v); return lut[b0] + (lut[Math.min(255, b0 + 1)] - lut[b0]) * (v - b0); } };
}

// ---- scan ----
async function scan() {
  const G = 0.25, cells = new Map(); const land = await (async () => { const { data, info } = await sharp(path.join(ROOT, 'data/world.png')).raw().toBuffer({ resolveWithObject: true }); return (lon, lat) => data[(Math.min(info.height - 1, Math.max(0, Math.floor((90 - lat) * 2))) * info.width + ((Math.floor((lon + 180) * 2) % 720) + 720) % 720) * info.channels + 2] & 1; })();
  for (const key of Object.keys(PACKS)) { const [L, px, py] = key.split('/').map(Number); if (L !== 5 || !fs.existsSync(packFile(L, px, py))) continue; const { data, info } = await sharp(packFile(L, px, py)).raw().toBuffer({ resolveWithObject: true }); const g = geo(L, px, py, info.width); const [mn, sc] = PACKS[key];
    for (let y = 2; y < info.height; y += 4) for (let x = 2; x < info.width; x += 4) { const lon = g.lon(x), lat = g.lat(y); const k = Math.floor((lon + 180) / G) + ',' + Math.floor((90 - lat) / G); let c = cells.get(k); if (!c) { c = { n: 0, z: 0, s: 0, lon, lat }; cells.set(k, c); } const h = mn + data[(y * info.width + x) * info.channels] * sc; c.n++; if (h <= 0) c.z++; c.s += h; } }
  const out = [];
  for (const [k, c] of cells) { if (c.z < c.n * 0.98) continue; let inl = true; for (let dy = -1; dy <= 1 && inl; dy++) for (let dx = -1; dx <= 1; dx++) if (!land(c.lon + dx * 0.5, c.lat + dy * 0.5)) { inl = false; break; } if (!inl) continue; const [gx, gy] = k.split(',').map(Number); let hi = 0; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const o = cells.get((gx + dx) + ',' + (gy + dy)); if (o && o.s / o.n > hi) hi = o.s / o.n; } if (hi > 500) out.push([c.lon, c.lat, Math.round(hi)]); }
  const boxes = []; out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [lon, lat, hi] of out) { let b = boxes.find((b) => lon >= b.a - 0.6 && lon <= b.b + 0.6 && lat >= b.c - 0.6 && lat <= b.d + 0.6); if (!b) { b = { a: lon, b: lon, c: lat, d: lat, n: 0, hi: 0 }; boxes.push(b); } b.a = Math.min(b.a, lon); b.b = Math.max(b.b, lon); b.c = Math.min(b.c, lat); b.d = Math.max(b.d, lat); b.n++; b.hi = Math.max(b.hi, hi); }
  for (const b of boxes.sort((x, y) => y.n - x.n)) console.log(`${String(b.n).padStart(5)} cells at zero  lon ${b.a.toFixed(1)}..${b.b.toFixed(1)}  lat ${b.c.toFixed(1)}..${b.d.toFixed(1)}  ground nearby up to ${b.hi} m${b.n < 12 ? '   (a real hollow, most likely: below the sea)' : ''}`);
  console.log(`${out.length} quarter-degree cells at zero, inland, beside ground above 500 m`);
  return out.length;
}

// ---- fix ----
async function fix() {
  const src = arg('source', 'terrarium') === 'world' ? await worldGrid() : terrarium(arg('cache', path.join(ROOT, 'tools/terrain/cache')));
  const outDir = arg('out', path.join(ROOT, 'data/e')); fs.mkdirSync(outDir, { recursive: true }); const only = arg('levels') ? arg('levels').split(',').map(Number) : null;
  const report = []; let changedIndex = false;
  for (const key of Object.keys(PACKS).sort((a, b) => a.split('/')[0] - b.split('/')[0])) {
    const [L, px, py] = key.split('/').map(Number); const file = packFile(L, px, py); if ((only && !only.includes(L)) || !fs.existsSync(file)) continue;
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true }); const W = info.width, H = info.height, C = info.channels; const g = geo(L, px, py, W); let [mn, sc] = PACKS[key];
    if (mn > 0) continue;          // (a pack whose lowest ground is above the sea has no hole in it)
    // the pack's part that lies in a hole's rectangle
    const lonA = g.lon(0), lonB = g.lon(W - 1), latA = g.lat(0), latB = g.lat(H - 1);
    const touches = VOIDS.some((v) => lonB >= v.box[0] && lonA <= v.box[1] && latA >= v.box[2] && latB <= v.box[3]); if (!touches) continue;
    const isVoid = new Uint8Array(W * H); let nVoid = 0; const pts = [];
    for (let y = 0; y < H; y++) { const lat = g.lat(y); for (let x = 0; x < W; x++) { if (data[(y * W + x) * C] !== 0) continue; const lon = g.lon(x); if (inVoid(lon, lat)) { isVoid[y * W + x] = 1; nVoid++; } } }
    if (!nVoid) continue;
    // distance (in pixels, up to FEATHER) from every pixel to the nearest zero-in-a-rectangle: those nearer than FEATHER are looked up too
    const dist = new Float32Array(W * H).fill(1e9); for (let i = 0; i < W * H; i++) if (isVoid[i]) dist[i] = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let d = dist[i]; if (x > 0) d = Math.min(d, dist[i - 1] + 1); if (y > 0) { d = Math.min(d, dist[i - W] + 1); if (x > 0) d = Math.min(d, dist[i - W - 1] + 1.414); if (x < W - 1) d = Math.min(d, dist[i - W + 1] + 1.414); } dist[i] = d; }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; let d = dist[i]; if (x < W - 1) d = Math.min(d, dist[i + 1] + 1); if (y < H - 1) { d = Math.min(d, dist[i + W] + 1); if (x < W - 1) d = Math.min(d, dist[i + W + 1] + 1.414); if (x > 0) d = Math.min(d, dist[i + W - 1] + 1.414); } dist[i] = d; }
    // (the zoom whose pixels match this level's; one coarser toward the poles, where Mercator tiles are finer than needed)
    const z = Math.max(1, Math.min(11, L + 2 - (Math.max(Math.abs(latA), Math.abs(latB)) > 72 ? 1 : 0)));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dist[y * W + x] < FEATHER) pts.push([g.lon(x), g.lat(y)]);
    await src.prepare(z, pts);
    // new heights: a hole takes the source's ground; ground beside it is eased toward the source so the two meet
    const h = new Float32Array(W * H); let filled = 0, eased = 0, hMax = 0;
    for (let y = 0; y < H; y++) { const lat = g.lat(y); for (let x = 0; x < W; x++) { const i = y * W + x; const old = mn + data[i * C] * sc; let v = old; const d = dist[i];
      if (d < FEATHER) { const s = Math.max(0, src.at(z, g.lon(x), lat)); if (isVoid[i]) { if (s > 0.5) { v = s; filled++; } } else if (old > 0 && s > 0.5) { const w = 1 - d / FEATHER; v = old + (s - old) * w * w * (3 - 2 * w); eased++; } }
      h[i] = v; if (v > hMax) hMax = v; } }
    src.clear();
    if (!filled) continue;
    // the pack's scale must still reach its highest ground
    let rescaled = false; if (hMax > mn + 255 * sc) { sc = Math.ceil((hMax - mn) / 255 * 1000) / 1000; rescaled = true; PACKS[key] = [mn, sc]; changedIndex = true; }
    const out = Buffer.alloc(W * H * C); for (let i = 0; i < W * H; i++) { const b = Math.max(0, Math.min(255, Math.round((h[i] - mn) / sc))); for (let c = 0; c < C; c++) out[i * C + c] = c < 3 ? b : data[i * C + c]; }
    await sharp(out, { raw: { width: W, height: H, channels: C } }).png({ compressionLevel: 9 }).toFile(path.join(outDir, `${L}_${px}_${py}.png`));
    const line = `${key}: ${filled} pixels given ground, ${eased} eased beside them, highest ${Math.round(hMax)} m${rescaled ? `, scale now ${sc}` : ''} (zoom ${z})`; report.push(line); console.log(line);
  }
  if (changedIndex) fs.writeFileSync(arg('out') ? path.join(outDir, 'index.json') : path.join(ROOT, 'data/index.json'), JSON.stringify(index));
  console.log(`${report.length} packs changed from ${src.name} (${src.stats()})${changedIndex ? '; index.json has new scales' : ''}`);
  fs.writeFileSync(path.join(outDir, 'voids-report.txt'), report.join('\n') + '\n');
}

const cmd = process.argv[2];
if (cmd === 'scan') await scan(); else if (cmd === 'fix') await fix(); else { console.error('scan | fix'); process.exit(2); }
