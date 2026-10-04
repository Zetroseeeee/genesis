// Takes the lines out of the picture of the Earth (data/i).
//
// The picture comes in packs, each a texture of its own, and a texture cannot be smoothed across its own edge: the
// last texel of one pack and the first of the next were each drawn flat to the edge and met in a step - a line dead
// straight down every meridian that is a pack's edge (Greenwich, 45 E, 90 E ...) and along 45 N, the equator and 45 S,
// plain to see from a few hundred kilometres up, where a texel is five kilometres of ground and many pixels wide.
// Here the two texels that face each other across an edge are both given their mean (four, where four packs meet), so
// each pack ends in the colour its neighbour begins with. Only the colour: the alpha is the map of land and water
// (1 land, 0.75 river, 0.5 lake, 0 sea) and stays as it is, and a texel of sea, whose colour is not used, takes no part.
//
//   node tools/imagery/seams.mjs check [--dir <packs>]     how far the colours stand apart across every edge
//   node tools/imagery/seams.mjs fix [--out <dir>]         write the packs with their edges matched
//
// The packs are written without loss (WebP lossless): an edge matched and then squeezed again would not match, and
// the rest of the picture is not put through the mill a second time. About 25 MB for the whole Earth instead of 4.
// Needs sharp: tools/models/node_modules (npm ci --prefix tools/models).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(ROOT, 'tools/models/'));
const sharp = require('sharp');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'), 'utf8')); const PER = index.img.packTiles, MAXL = index.img.maxLevel;
const LAND = 100;           // alpha from here up is ground whose colour is used (a lake is 128)
const dims = (L) => ({ nx: Math.max(1, (2 << L) / PER), ny: Math.max(1, (1 << L) / PER) });

async function level(L, dir) {
  const { nx, ny } = dims(L); const packs = new Map();
  for (let py = 0; py < ny; py++) for (let px = 0; px < nx; px++) { if (!index.img.packs[`${L}/${px}/${py}`]) continue; let f = path.join(dir, `${L}_${px}_${py}.webp`); if (!fs.existsSync(f)) f = path.join(ROOT, 'data/i', `${L}_${px}_${py}.webp`); if (!fs.existsSync(f)) continue;
    const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); packs.set(px + '/' + py, { data, W: info.width, H: info.height, px, py, file: `${L}_${px}_${py}.webp`, touched: 0 }); }
  return { nx, ny, packs };
}
// every pair of texels that face each other across an edge: [which way the edge runs, pack, index, pack, index]
function* pairs(lv) {
  const { nx, ny, packs } = lv;
  for (const p of packs.values()) {
    const e = packs.get(((p.px + 1) % nx) + '/' + p.py);          // (round the world: the last pack's east is the first)
    if (e && e.H === p.H) for (let y = 0; y < p.H; y++) yield ['ew', p, (y * p.W + p.W - 1) * 4, e, (y * e.W) * 4];
    const s = p.py + 1 < ny ? packs.get(p.px + '/' + (p.py + 1)) : null;
    if (s && s.W === p.W) for (let x = 0; x < p.W; x++) yield ['ns', p, ((p.H - 1) * p.W + x) * 4, s, x * 4];
  }
}
function measure(lv) { let n = 0, sum = 0, worst = 0, sea = 0; for (const [, a, i, b, j] of pairs(lv)) { if (a.data[i + 3] < LAND || b.data[j + 3] < LAND) { sea++; continue; } const d = Math.max(Math.abs(a.data[i] - b.data[j]), Math.abs(a.data[i + 1] - b.data[j + 1]), Math.abs(a.data[i + 2] - b.data[j + 2])); n++; sum += d; if (d > worst) worst = d; } return { n, mean: n ? sum / n : 0, worst, sea }; }

async function check() {
  const dir = arg('dir', path.join(ROOT, 'data/i')); let bad = 0;
  for (let L = 0; L <= MAXL; L++) { const lv = await level(L, dir); const m = measure(lv); if (m.worst > 0) bad++; console.log(`level ${L}: ${lv.packs.size} packs, ${m.n} pairs of land texels face each other across an edge (${m.sea} more with sea on a side); they stand ${m.mean.toFixed(1)} apart on average, ${m.worst} at worst (of 255)`); }
  console.log(bad ? `${bad} levels have edges that do not meet` : 'every edge meets'); return bad;
}
async function fix() {
  const out = arg('out', path.join(ROOT, 'data/i')); fs.mkdirSync(out, { recursive: true }); let files = 0, bytes = 0;
  for (let L = 0; L <= MAXL; L++) {
    const lv = await level(L, path.join(ROOT, 'data/i')); const before = measure(lv);
    // east-west edges first, then north-south: where four packs meet, the second pass takes the mean of the two means,
    // and once more round, because the mean of two whole numbers is rounded and a corner can be left one apart
    for (let round = 0; round < 3; round++) for (const way of ['ew', 'ns']) for (const [w, a, i, b, j] of pairs(lv)) { if (w !== way || a.data[i + 3] < LAND || b.data[j + 3] < LAND) continue;
      for (let k = 0; k < 3; k++) { const m = (a.data[i + k] + b.data[j + k] + 1) >> 1; if (a.data[i + k] !== m) { a.data[i + k] = m; a.touched++; } if (b.data[j + k] !== m) { b.data[j + k] = m; b.touched++; } } }
    const after = measure(lv);
    for (const p of lv.packs.values()) { if (!p.touched) continue; const buf = await sharp(p.data, { raw: { width: p.W, height: p.H, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer();
      // (what was written is read back: the picture must come out as it went in)
      const back = await sharp(buf).ensureAlpha().raw().toBuffer(); for (let i = 0; i < back.length; i += 4) { if (back[i + 3] !== p.data[i + 3]) throw new Error(`${p.file}: the map of land and water changed in the writing`); if (p.data[i + 3] >= LAND && (back[i] !== p.data[i] || back[i + 1] !== p.data[i + 1] || back[i + 2] !== p.data[i + 2])) throw new Error(`${p.file}: the colours changed in the writing`); }
      fs.writeFileSync(path.join(out, p.file), buf); files++; bytes += buf.length; }
    console.log(`level ${L}: edges stood ${before.mean.toFixed(1)} apart on average, ${before.worst} at worst; now ${after.mean.toFixed(1)} and ${after.worst}`);
  }
  console.log(`${files} packs written, ${(bytes / 1e6).toFixed(1)} MB`);
}
const cmd = process.argv[2];
if (cmd === 'check') process.exit(await check() ? 1 : 0); else if (cmd === 'fix') await fix(); else { console.error('check | fix'); process.exit(2); }
