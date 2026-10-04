// Fills the holes in the elevation packs (data/e).
//
// The packs were built from a source that had nothing for a few rectangles of the Earth: there the ground was left at
// sea level - a pit with walls kilometres high where it met mountains (Bohemia and southern Poland, the Yukon, the
// Qaidam, a quarter of Antarctica, the far tip of Chukotka). This reads every pack, finds the ground that lies at zero
// inside those rectangles though it should not, and puts real heights there.
//
//   node tools/terrain/voids.mjs scan [--dir <packs>]     list the holes: ground at zero where the simulation's own grid has land well above the sea
//   node tools/terrain/voids.mjs fix [--cache <dir>] [--out <dir>] [--levels 3,4,5] [--no-tiles]
//
// Two sources of heights:
//  - "tiles": the Terrain Tiles on AWS Open Data ("terrarium" PNGs: metres = R*256 + G + B/256 - 32768,
//    https://registry.opendata.aws/terrain-tiles/ - Mapzen/Tilezen's mosaic of SRTM, GMTED2010, ETOPO1 and others,
//    attribution: https://github.com/tilezen/joerd/blob/master/docs/attribution.md). That host cannot be reached from
//    the cloud workspace, so the Terrain workflow runs this and publishes the changed packs for review.
//  - "grid": the simulation's own half-degree grid (data/world.png, red = 23 + metres / 30), smoothly interpolated.
//    Used for Antarctica, where the tiles give the rock under the ice, not the ice one would stand on; an ice sheet
//    is smooth enough for half a degree to do. With --no-tiles it is used everywhere (coarse: for trying the
//    machinery where there is no network).
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
  { name: 'the Qaidam and the Altun', box: [89.5, 96.5, 35.5, 40.5], src: 'tiles' },
  { name: 'the Yukon, south-east Alaska, northern British Columbia', box: [-144.5, -125.5, 51.5, 68.5], src: 'tiles' },
  { name: 'Bohemia, Silesia, Lower Austria, Slovakia, southern Poland', box: [11.5, 24.5, 47.7, 52.5], src: 'tiles' },
  { name: 'the tip of Chukotka, Wrangel Island', box: [-180.0, -177.0, 64.5, 72.0], src: 'tiles' },
  { name: 'East Antarctica', box: [89.5, 180.0, -85.06, -64.5], src: 'grid' },          // (south of 85.05 S the packs have ground from another source, and it is whole)
  { name: 'Antarctica by the date line', box: [-180.0, -177.0, -85.06, -77.5], src: 'grid' },
];
const CAP = -85.0511;       // where the Mercator tiles end
const FEATHER = 10;         // pixels over which old ground is eased toward new beside a hole
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'), 'utf8')); const PACKS = index.elev.packs; const TILE = index.tile;
const packFile = (L, px, py) => path.join(ROOT, 'data/e', `${L}_${px}_${py}.png`);
// a pack's pixel -> the centre of that pixel on the Earth (tiles of level L are 360/2^(L+1) degrees across)
const geo = (L, px, py, W) => { const td = 360 / (2 << L); const n = index.elev.packTiles; return { lon: (x) => -180 + (px * n + (x + 0.5) / TILE) * td, lat: (y) => 90 - (py * n + (y + 0.5) / TILE) * td, td }; };
const voidAt = (lon, lat) => { for (const v of VOIDS) if (lon >= v.box[0] && lon <= v.box[1] && lat >= v.box[2] && lat <= v.box[3]) return v; return null; };

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
// the simulation's own grid: one byte per half degree (23 at the sea's level, one step per 30 m), read smoothly (a cubic
// B-spline over sixteen cells: no creases where cells meet)
async function worldGrid() {
  const { data, info } = await sharp(path.join(ROOT, 'data/world.png')).raw().toBuffer({ resolveWithObject: true }); const W = info.width, H = info.height, C = info.channels;
  const B = (t) => [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6, (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
  const byte = (lon, lat) => { const gx = (lon + 180) / 360 * W - 0.5, gy = (90 - lat) / 180 * H - 0.5; const x0 = Math.floor(gx), y0 = Math.floor(gy); const wx = B(gx - x0), wy = B(gy - y0); let v = 0; for (let j = 0; j < 4; j++) { const y = Math.min(H - 1, Math.max(0, y0 - 1 + j)); for (let i = 0; i < 4; i++) v += data[(y * W + (((x0 - 1 + i) % W) + W) % W) * C] * wx[i] * wy[j]; } return v; };
  return { name: 'grid', land: (lon, lat) => data[(Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / 180 * H))) * W + ((Math.floor((lon + 180) / 360 * W) % W) + W) % W) * C + 2] & 1, raw: (lon, lat) => data[(Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / 180 * H))) * W + ((Math.floor((lon + 180) / 360 * W) % W) + W) % W) * C], at(z, lon, lat) { return Math.max(0, (byte(lon, lat) - 23) * 30); } };
}

// ---- scan ----
async function scan() {
  const grid = await worldGrid(); const dir = arg('dir', path.join(ROOT, 'data/e')); const G = 0.5, cells = new Map();
  for (const key of Object.keys(PACKS)) { const [L, px, py] = key.split('/').map(Number); if (L !== 5) continue; let f = path.join(dir, `${L}_${px}_${py}.png`); if (!fs.existsSync(f)) f = packFile(L, px, py); if (!fs.existsSync(f)) continue;
    const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true }); const g = geo(L, px, py, info.width);
    for (let y = 2; y < info.height; y += 4) for (let x = 2; x < info.width; x += 4) { const lon = g.lon(x), lat = g.lat(y); const gx = Math.floor((lon + 180) / G), gy = Math.floor((90 - lat) / G); const k = gx + ',' + gy; let c = cells.get(k); if (!c) { c = { n: 0, z: 0, lon: gx * G - 180 + G / 2, lat: 90 - gy * G - G / 2 }; cells.set(k, c); } c.n++; if (data[(y * info.width + x) * info.channels] === 0) c.z++; } }
  // a cell of the packs wholly at zero, inland, where the grid stands 90 m or more above the sea
  const out = [];
  for (const c of cells.values()) { if (c.z < c.n * 0.97 || grid.raw(c.lon, c.lat) < 26) continue; let inl = true; for (const dx of [-0.5, 0, 0.5]) for (const dy of [-0.5, 0, 0.5]) if (!grid.land(c.lon + dx, c.lat + dy)) inl = false; if (inl) out.push([c.lon, c.lat, (grid.raw(c.lon, c.lat) - 23) * 30]); }
  const boxes = []; out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [lon, lat, h] of out) { let b = boxes.find((b) => lon >= b.a - 1.1 && lon <= b.b + 1.1 && lat >= b.c - 1.1 && lat <= b.d + 1.1); if (!b) { b = { a: lon, b: lon, c: lat, d: lat, n: 0, h: 0 }; boxes.push(b); } b.a = Math.min(b.a, lon); b.b = Math.max(b.b, lon); b.c = Math.min(b.c, lat); b.d = Math.max(b.d, lat); b.n++; b.h = Math.max(b.h, h); }
  for (const b of boxes.sort((x, y) => y.n - x.n)) console.log(`${String(b.n).padStart(5)} half-degree cells at zero  lon ${(b.a - 0.25).toFixed(2)}..${(b.b + 0.25).toFixed(2)}  lat ${(b.c - 0.25).toFixed(2)}..${(b.d + 0.25).toFixed(2)}  where the ground should stand up to ${b.h} m`);
  console.log(`${out.length} half-degree cells at zero where there should be ground, in ${boxes.length} places`);
  return out.length;
}

// ---- fix ----
async function fix() {
  const grid = await worldGrid(); const tiles = process.argv.includes('--no-tiles') ? null : terrarium(arg('cache', path.join(ROOT, 'tools/terrain/cache')));
  const srcOf = (v) => (v.src === 'tiles' && tiles ? tiles : grid);
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
    for (let y = 0; y < H; y++) { const lat = g.lat(y); for (let x = 0; x < W; x++) { if (data[(y * W + x) * C] !== 0) continue; const lon = g.lon(x); if (voidAt(lon, lat)) { isVoid[y * W + x] = 1; nVoid++; } } }
    if (!nVoid) continue;
    // which hole a pixel belongs to (its own, or for ground beside a hole the nearest one's: looked up a little way out)
    const holeOf = (lon, lat) => voidAt(lon, lat) || voidAt(lon + g.td / TILE * FEATHER, lat) || voidAt(lon - g.td / TILE * FEATHER, lat) || voidAt(lon, lat + g.td / TILE * FEATHER) || voidAt(lon, lat - g.td / TILE * FEATHER);
    // distance (in pixels, up to FEATHER) from every pixel to the nearest zero-in-a-rectangle: those nearer than FEATHER are looked up too
    const dist = new Float32Array(W * H).fill(1e9); for (let i = 0; i < W * H; i++) if (isVoid[i]) dist[i] = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let d = dist[i]; if (x > 0) d = Math.min(d, dist[i - 1] + 1); if (y > 0) { d = Math.min(d, dist[i - W] + 1); if (x > 0) d = Math.min(d, dist[i - W - 1] + 1.414); if (x < W - 1) d = Math.min(d, dist[i - W + 1] + 1.414); } dist[i] = d; }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; let d = dist[i]; if (x < W - 1) d = Math.min(d, dist[i + 1] + 1); if (y < H - 1) { d = Math.min(d, dist[i + W] + 1); if (x < W - 1) d = Math.min(d, dist[i + W + 1] + 1.414); if (x > 0) d = Math.min(d, dist[i + W - 1] + 1.414); } dist[i] = d; }
    // (the zoom whose pixels match this level's; one coarser toward the poles, where Mercator tiles are finer than needed)
    const z = Math.max(1, Math.min(11, L + 2 - (Math.max(Math.abs(latA), Math.abs(latB)) > 72 ? 1 : 0)));
    if (tiles) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dist[y * W + x] < FEATHER) { const lon = g.lon(x), lat = g.lat(y); const v = holeOf(lon, lat); if (v && v.src === 'tiles') pts.push([lon, lat]); } if (pts.length) await tiles.prepare(z, pts); }
    // new heights: a hole takes the source's ground; ground beside it is eased toward the source so the two meet
    const h = new Float32Array(W * H); let filled = 0, eased = 0, hMax = 0;
    for (let y = 0; y < H; y++) { const lat = g.lat(y); for (let x = 0; x < W; x++) { const i = y * W + x; const old = mn + data[i * C] * sc; let v = old; const d = dist[i];
      if (d < FEATHER) { const lon = g.lon(x); const v0 = holeOf(lon, lat); if (!v0) { h[i] = v; if (v > hMax) hMax = v; continue; } const s = Math.max(0, srcOf(v0).at(z, lon, lat)); if (isVoid[i]) { if (s > 0.5) { v = s; filled++; } } else if (old > 0 && s > 0.5) { const w = 1 - d / FEATHER; v = old + (s - old) * w * w * (3 - 2 * w); eased++; } }
      h[i] = v; if (v > hMax) hMax = v; } }
    if (tiles) tiles.clear();
    if (!filled) continue;
    // the pack's scale must still reach its highest ground
    let rescaled = false; if (hMax > mn + 255 * sc) { sc = Math.ceil((hMax - mn) / 255 * 1000) / 1000; rescaled = true; PACKS[key] = [mn, sc]; changedIndex = true; }
    const out = Buffer.alloc(W * H * C); for (let i = 0; i < W * H; i++) { const b = Math.max(0, Math.min(255, Math.round((h[i] - mn) / sc))); for (let c = 0; c < C; c++) out[i * C + c] = c < 3 ? b : data[i * C + c]; }
    await sharp(out, { raw: { width: W, height: H, channels: C } }).png({ compressionLevel: 9 }).toFile(path.join(outDir, `${L}_${px}_${py}.png`));
    const line = `${key}: ${filled} pixels given ground, ${eased} eased beside them, highest ${Math.round(hMax)} m${rescaled ? `, scale now ${sc}` : ''} (zoom ${z})`; report.push(line); console.log(line);
  }
  if (changedIndex) fs.writeFileSync(arg('out') ? path.join(outDir, 'index.json') : path.join(ROOT, 'data/index.json'), JSON.stringify(index));
  console.log(`${report.length} packs changed (${tiles ? tiles.stats() : 'no tiles: the half-degree grid everywhere'})${changedIndex ? '; index.json has new scales' : ''}`);
  fs.writeFileSync(path.join(outDir, 'voids-report.txt'), report.join('\n') + '\n');
}

const cmd = process.argv[2];
if (cmd === 'scan') await scan(); else if (cmd === 'fix') await fix(); else { console.error('scan | fix'); process.exit(2); }
