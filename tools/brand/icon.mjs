// The app icon: the real Earth as night falls over Mesopotamia, and the first fire. Rendered from the game's own
// picture of the planet (data/i, data/info.png, data/clouds.jpg) with the game's own sea colours, so the icon is the game.
//   node tools/brand/icon.mjs [sheet.jpg] [draft]      (needs sharp: tools/models/node_modules)
// Writes build/icon.png (1024, the macOS app icon: a rounded tile with the margins Apple asks for) and
// src/mark.png (256, the same picture for use inside the game). With a first argument it also writes a sheet of the
// icon at the sizes the system shows it (512 ... 16) to look at; "draft" as the second renders without smoothing (fast).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(ROOT, 'tools/models/'));
const sharp = require('sharp');

const S = 1024, SS = process.argv[3] === 'draft' ? 1 : 3, N = S * SS;   // drawn three times too large, then scaled down
const TILE = 824 / 1024, RADIUS_N = 5.0;           // Apple's tile: 824 of 1024 across, corners of continuous curvature
const D2R = Math.PI / 180;
const VIEW = { lon: 14, lat: 21 };                 // what faces us: Africa, Europe, the Near East
const SUN = { lon: -65, lat: 15 };                 // the sun stands over the Atlantic: evening in the Fertile Crescent
const FIRE = { lon: 44.4, lat: 32.5 };             // where the first village lights its fire
const PLANET = { cx: 0.5, cy: 0.503, r: 0.342 };   // of the whole picture

// ---- the game's imagery: level 3 packs, each 1024 x 1024 for 45 x 45 degrees (alpha: 1 land, 0.5 lake, 0 sea) ----
const GW = 8192, GH = 4096;
const packs = new Map();
for (let py = 0; py < 4; py++) for (let px = 0; px < 8; px++) {
  const { data, info } = await sharp(path.join(ROOT, 'data/i', `3_${px}_${py}.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  packs.set(px + '_' + py, { data, w: info.width });
}
function sample(lon, lat) {       // bilinear, across pack edges
  const gx = ((lon + 180) / 360 * GW - 0.5 + GW) % GW, gy = Math.min(GH - 1, Math.max(0, (90 - lat) / 180 * GH - 0.5));
  const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0; const out = [0, 0, 0, 0];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const x = (x0 + i) % GW, y = Math.min(GH - 1, y0 + j); const p = packs.get((x >> 10) + '_' + (y >> 10)); const o = ((y & 1023) * p.w + (x & 1023)) * 4; const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
    out[0] += p.data[o] * w; out[1] += p.data[o + 1] * w; out[2] += p.data[o + 2] * w; out[3] += p.data[o + 3] * w;
  }
  return out;
}
// one channel of a whole-world picture, bilinear
async function plane(file, channel) {
  const { data, info } = await sharp(path.join(ROOT, file)).raw().toBuffer({ resolveWithObject: true });
  return (lon, lat) => {
    const gx = ((lon + 180) / 360 * info.width - 0.5 + info.width) % info.width, gy = Math.min(info.height - 1, Math.max(0, (90 - lat) / 180 * info.height - 0.5));
    const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0; let v = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const x = (x0 + i) % info.width, y = Math.min(info.height - 1, y0 + j); v += data[(y * info.width + x) * info.channels + channel] * (i ? fx : 1 - fx) * (j ? fy : 1 - fy); }
    return v / 255;
  };
}
const CLOUDS = 1;
const nearLand = await (async () => { const { data, info } = await sharp(path.join(ROOT, 'data/i/0_0_0.webp')).ensureAlpha().blur(3).raw().toBuffer({ resolveWithObject: true }); return (lon, lat) => { const x = Math.min(info.width - 1, Math.max(0, Math.floor((lon + 180) / 360 * info.width))), y = Math.min(info.height - 1, Math.max(0, Math.floor((90 - lat) / 180 * info.height))); return data[(y * info.width + x) * 4 + 3] / 255; }; })();
const shelfAt = await plane('data/info.png', 0);      // 1 at the shore, 0 over the deep
const cloudAt = await plane('data/clouds.jpg', 0);

const vec = (lon, lat) => [Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R), Math.cos(lat * D2R) * Math.cos(lon * D2R)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
// the view: rotate so that VIEW faces the eye (z toward us, y up)
const cl = Math.cos(VIEW.lon * D2R), sl = Math.sin(VIEW.lon * D2R), cp = Math.cos(VIEW.lat * D2R), sp = Math.sin(VIEW.lat * D2R);
const toWorld = (x, y, z) => { const y1 = y * cp + z * sp, z1 = -y * sp + z * cp; return [x * cl + z1 * sl, y1, -x * sl + z1 * cl]; };
const toView = (v) => { const x = v[0] * cl - v[2] * sl, z1 = v[0] * sl + v[2] * cl; return [x, v[1] * cp - z1 * sp, v[1] * sp + z1 * cp]; };
const sunV = toView(vec(SUN.lon, SUN.lat)), fireV = toView(vec(FIRE.lon, FIRE.lat));
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const buf = Buffer.alloc(N * N * 4);
for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
  const u = (px + 0.5) / N, v = (py + 0.5) / N; const o = (py * N + px) * 4;
  // the tile
  const tx = Math.abs(u - 0.5) / (TILE / 2), ty = Math.abs(v - 0.5) / (TILE / 2);
  const sd = Math.pow(Math.pow(tx, RADIUS_N) + Math.pow(ty, RADIUS_N), 1 / RADIUS_N);
  if (sd > 1.004) { buf[o + 3] = 0; continue; }
  // space: nearly black, a breath of blue toward the sun, a few stars
  let r = 0.014, g = 0.02, b = 0.036;
  const toSun = Math.max(0, 1 - Math.hypot(u - 0.06, v - 0.2) / 0.9); r += 0.018 * toSun * toSun; g += 0.036 * toSun * toSun; b += 0.08 * toSun * toSun;
  { const cx = Math.floor(u * 120), cy = Math.floor(v * 120); const h = hash(cx, cy); if (h > 0.965) { const sx = (cx + 0.2 + 0.6 * hash(cx + 7, cy)) / 120, sy = (cy + 0.2 + 0.6 * hash(cx, cy + 11)) / 120; const d = Math.hypot(u - sx, v - sy) * S; const m = (h - 0.965) / 0.035; const a = Math.max(0, 1 - d / (0.6 + 1.1 * m * m)) * (0.18 + 0.82 * m * m) * 0.85; r += a; g += a; b += a * 1.06; } }
  // the planet
  const dx = (u - PLANET.cx) / PLANET.r, dy = -(v - PLANET.cy) / PLANET.r; const rr = dx * dx + dy * dy; const d = Math.sqrt(rr);
  // the air seen edge on: a thin bright shell on the lit limb, a thread of blue on the dark one (so the disc stays whole)
  if (d > 0.98 && d < 1.2) {
    const n = [dx / d, dy / d, 0]; const lit = smooth(-0.3, 0.5, dot(n, sunV));
    const fall = Math.exp(-Math.max(0, d - 1) / 0.02) * smooth(0.98, 1.0, d), wide = Math.exp(-Math.max(0, d - 1) / 0.075) * smooth(0.98, 1.0, d);
    const k = fall * (0.13 + 0.87 * lit), kw = wide * lit * 0.16;
    r += 0.26 * k + 0.10 * kw; g += 0.5 * k + 0.26 * kw; b += 0.95 * k + 0.6 * kw;
  }
  if (rr < 1) {
    const dz = Math.sqrt(1 - rr); const w = toWorld(dx, dy, dz); const lat = Math.asin(w[1]) / D2R, lon = Math.atan2(w[0], w[2]) / D2R;
    const c = sample(lon, lat); const al = c[3] / 255; const landW = smooth(0.30, 0.42, al);
    let cr = c[0] / 255, cg = c[1] / 255, cb = c[2] / 255;
    // a little more colour than the photograph: this is an emblem, read at a glance
    { const lum = cr * 0.3 + cg * 0.59 + cb * 0.11; cr = mix(lum, cr, 1.3) * 1.16; cg = mix(lum, cg, 1.24) * 1.13; cb = mix(lum, cb, 1.3) * 1.12; }
    // the sea, as the game paints it: deep blue, lighter over the shelf, green at the shore
    const shelf = shelfAt(lon, lat);
    const sh = Math.pow(shelf, 2.2) * 0.62 * smooth(0.0, 0.2, nearLand(lon, lat));       // (an island too small for the land mask has no shelf to show)
    let wr = mix(0.016, 0.05, sh), wg = mix(0.082, 0.30, sh), wb = mix(0.235, 0.44, sh);
    const lakeW = (1 - smooth(0.06, 0.16, Math.abs(al - 0.5))) * 0.9;        // lakes: a flat 0.5
    cr = mix(mix(wr, cr, landW), 0.05, lakeW); cg = mix(mix(wg, cg, landW), 0.24, lakeW); cb = mix(mix(wb, cb, landW), 0.36, lakeW);
    const N3 = [dx, dy, dz]; const nl = dot(N3, sunV); const day = smooth(-0.16, 0.2, nl);
    // weather: white over the day side, its shadow under it
    const cloud = Math.pow(cloudAt(lon, lat), 0.85) * 0.8 * CLOUDS;
    cr = mix(cr, 0.97, cloud); cg = mix(cg, 0.98, cloud); cb = mix(cb, 1.0, cloud);
    // dusk: the light reddens along the edge of night
    const dusk = smooth(-0.2, 0.03, nl) * (1 - smooth(0.03, 0.4, nl));
    const sunR = 1.0 + 0.55 * dusk, sunG = 1.0 - 0.16 * dusk, sunB = 1.0 - 0.5 * dusk;
    const lit = Math.pow(Math.max(0, nl + 0.16) / 1.16, 0.85) * 1.24;
    let pr = cr * lit * sunR, pg = cg * lit * sunG, pb = cb * lit * sunB;
    // the sun on the sea
    { const h = [sunV[0], sunV[1], sunV[2] + 1]; const hl = Math.hypot(h[0], h[1], h[2]); const s = Math.pow(Math.max(0, dot(N3, [h[0] / hl, h[1] / hl, h[2] / hl])), 70) * (1 - landW) * (1 - cloud) * 0.34 * day; pr += s; pg += s * 0.95; pb += s * 0.86; }
    // night: the land a shade lighter than the sea, both nearly black
    const nr = 0.016 + 0.034 * landW + 0.03 * cloud, ng = 0.027 + 0.04 * landW + 0.034 * cloud, nb = 0.058 + 0.046 * landW + 0.04 * cloud;
    pr = mix(nr, pr, day); pg = mix(ng, pg, day); pb = mix(nb, pb, day);
    // air seen from above: a blue veil toward the limb on the lit side
    { const k = Math.pow(1 - dz, 2.4) * 0.82 * smooth(-0.25, 0.4, nl); pr = mix(pr, 0.34, k); pg = mix(pg, 0.6, k); pb = mix(pb, 1.0, k);
      const kn = Math.pow(1 - dz, 3.0) * 0.5 * (1 - smooth(-0.25, 0.4, nl)); pr = mix(pr, 0.035, kn); pg = mix(pg, 0.075, kn); pb = mix(pb, 0.17, kn); }
    // the fire: a point of light, the glow round it, and the land it lights
    { const dfx = dx - fireV[0], dfy = dy - fireV[1]; const df = Math.hypot(dfx, dfy); const core = Math.max(0, 1 - df / 0.034), halo = Math.exp(-df / 0.075), wide = Math.exp(-df / 0.26);
      const k = (1 - day * 0.85), ground = 0.55 + 0.45 * landW;
      pr += (core * core * 1.8 + halo * 0.95 + wide * 0.3 * ground) * k; pg += (core * core * 1.5 + halo * 0.56 + wide * 0.12 * ground) * k; pb += (core * core * 0.9 + halo * 0.16 + wide * 0.024 * ground) * k; }
    const edge = smooth(1.0, 0.994, d); r = mix(r, pr, edge); g = mix(g, pg, edge); b = mix(b, pb, edge);
  }
  // the tile's own finish: a hair of light along the top edge, and the corners cut soft
  const rim = smooth(0.985, 1.0, sd) * smooth(0.1, -0.6, (v - 0.5) / (TILE / 2)); r += 0.10 * rim; g += 0.12 * rim; b += 0.16 * rim;
  const a = smooth(1.004, 0.996, sd);
  const enc = (x) => Math.round(255 * Math.min(1, Math.max(0, x)));
  buf[o] = enc(r); buf[o + 1] = enc(g); buf[o + 2] = enc(b); buf[o + 3] = Math.round(255 * a);
}
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
const big = sharp(buf, { raw: { width: N, height: N, channels: 4 } });
const out = process.argv[3] === 'draft' ? path.join(ROOT, 'shots') : null;
await big.clone().resize(S, S, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(out ? path.join(out, 'icon_draft.png') : path.join(ROOT, 'build/icon.png'));
if (!out) await big.clone().resize(256, 256, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(path.join(ROOT, 'src/mark.png'));
// how it reads small (for looking at, not shipped)
if (process.argv[2]) { const sizes = [512, 256, 128, 64, 32, 16]; const comps = []; let x = 16; for (const s of sizes) { comps.push({ input: await big.clone().resize(s, s, { kernel: 'lanczos3' }).png().toBuffer(), left: x, top: 16 + (512 - s) }); x += s + 16; } await sharp({ create: { width: x, height: 544, channels: 3, background: '#8a8f98' } }).composite(comps).jpeg({ quality: 92 }).toFile(process.argv[2]); }
console.log(out ? 'draft written: shots/icon_draft.png' : 'icon written: build/icon.png, src/mark.png');
