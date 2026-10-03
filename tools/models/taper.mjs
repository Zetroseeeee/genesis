#!/usr/bin/env node
// How far each wall of a model leans in or out, in degrees from upright, measured between a low and a high band of
// the walls. A generator reading a three-quarter photograph tends to lean the far walls in (a box becomes a wedge);
// the pipeline option "straighten": true stands them up again.
//   node tools/models/taper.mjs [id ...]        (reads data/models/<id>.l1.glb)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions'; import { MeshoptDecoder } from 'meshoptimizer';
// The wall lines of a model: for each of its four sides, where the wall stands in a low and in a high band.
// points: xyz in metres with the base at y = 0. Returns { yL, yH, lo: [x0, x1, z0, z1], hi: [...], lean: [deg x4] }.
export function wallLines(points, h, bands) {
  const B = bands || [[0.1, 0.26], [0.56, 0.8]];
  const ext = (y0, y1) => { const xs = [], zs = []; for (let i = 0; i < points.length; i += 3) { const y = points[i + 1]; if (y >= y0 * h && y <= y1 * h) { xs.push(points[i]); zs.push(points[i + 2]); } } xs.sort((a, b) => a - b); zs.sort((a, b) => a - b); const q = (a, f) => a.length ? a[Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * f)))] : 0; return [q(xs, 0.01), q(xs, 0.99), q(zs, 0.01), q(zs, 0.99), xs.length]; };
  const lo = ext(B[0][0], B[0][1]), hi = ext(B[1][0], B[1][1]); const yL = (B[0][0] + B[0][1]) / 2 * h, yH = (B[1][0] + B[1][1]) / 2 * h;
  const lean = [0, 1, 2, 3].map((k) => Math.atan2((hi[k] - lo[k]) * (k % 2 ? -1 : 1), yH - yL) * 180 / Math.PI);     // + = leaning in
  return { yL, yH, lo, hi, lean, n: Math.min(lo[4], hi[4]) };
}
if (process.argv[1] && process.argv[1].endsWith('taper.mjs')) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); const OUT = path.join(ROOT, 'data/models');
  await MeshoptDecoder.ready; const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const idx = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')); const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(idx.models);
  const rows = [];
  for (const id of ids) { const e = idx.models[id]; if (!e || !e.lods || e.lods.length < 2) continue; const f = path.join(OUT, e.lods[1].file); if (!fs.existsSync(f)) continue;
    const doc = await io.read(f); const pts = []; for (const node of doc.getRoot().listNodes()) { const mesh = node.getMesh(); if (!mesh) continue; const M = node.getWorldMatrix(); for (const p of mesh.listPrimitives()) { const a = p.getAttribute('POSITION'); const v = [0, 0, 0]; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); pts.push(M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13], M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]); } } }
    const t = wallLines(new Float32Array(pts), e.h); rows.push([id, t.lean, Math.max(...t.lean.map(Math.abs))]); }
  rows.sort((a, b) => b[2] - a[2]);
  for (const r of rows) console.log(r[0].padEnd(28), 'lean  -x ' + r[1][0].toFixed(1).padStart(6), ' +x ' + r[1][1].toFixed(1).padStart(6), ' -z ' + r[1][2].toFixed(1).padStart(6), ' +z ' + r[1][3].toFixed(1).padStart(6));
}
