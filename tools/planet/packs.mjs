// The picture of the Earth for whoever needs it outside the game (tools/brand/icon.mjs): a pack out of its bundle
// (data/i/<level>_b<x>_<y>.bin, written by tools/planet/imagery.py and read by src/terrain.js the same way).
//   const earth = openPicture('data/i'); earth.ix (its index.json); earth.pack(3, px, py) -> the pack's WebP, rim and all, or null
import fs from 'node:fs';
import path from 'node:path';

export function openPicture(dir) {
  const ix = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), n = ix.bundle, files = new Map();
  return { ix, pack(L, px, py) {
    const lv = ix.levels[L]; if (!lv || px < 0 || py < 0 || px >= lv.nx || py >= lv.ny || lv.packs[py * lv.nx + px] !== 'P') return null;
    const f = path.join(dir, `${L}_b${Math.floor(px / n)}_${Math.floor(py / n)}.bin`); let b = files.get(f); if (!b) { b = fs.readFileSync(f); files.set(f, b); }
    if (b.toString('latin1', 0, 4) !== 'HWB1' || b.readUInt32LE(4) !== n * n) throw new Error(path.basename(f) + ' is not a bundle');
    const at = 8 + ((py % n) * n + px % n) * 8, off = b.readUInt32LE(at), len = b.readUInt32LE(at + 4); if (!len) return null;
    return b.subarray(off, off + len);
  } };
}
