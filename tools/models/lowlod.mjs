// Far LODs for generated meshes. Generated meshes come with thousands of tiny UV islands, so an ordinary simplifier
// stalls long before a building is cheap enough to draw by the thousand. This builds each far LOD from scratch instead:
// simplify on position alone, split normals at creases, unwrap a fresh atlas, then bake the colour of the detailed
// model into it (closest point on the detailed surface for every texel).
import { Document } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as watlas from 'watlas';
import sharp from 'sharp';

let ready = null;
const init = () => (ready = ready || Promise.all([MeshoptSimplifier.ready, watlas.Initialize()]).then(() => { MeshoptSimplifier.useExperimentalFeatures = true; }));     // Prune (drop loose fragments) is behind the experimental switch

// ---------- geometry ----------
function firstPrimitive(doc) {
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const idx = prim.getIndices();
  const P = Float32Array.from(prim.getAttribute('POSITION').getArray());
  const uvA = prim.getAttribute('TEXCOORD_0');
  const I = idx ? Uint32Array.from(idx.getArray()) : Uint32Array.from({ length: P.length / 3 }, (_, i) => i);
  return { P, UV: uvA ? Float32Array.from(uvA.getArray()) : null, I, material: prim.getMaterial() };
}
function bounds(P) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { const v = P[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  return { mn, mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
}
// merge vertices that share a position (whatever their UVs or normals), drop collapsed triangles
function weldPositions(P, I, eps) {
  const map = new Map(); const remap = new Uint32Array(P.length / 3); const out = []; const inv = 1 / eps;
  for (let v = 0, n = P.length / 3; v < n; v++) {
    const x = Math.round(P[v * 3] * inv), y = Math.round(P[v * 3 + 1] * inv), z = Math.round(P[v * 3 + 2] * inv);
    const key = x * 73856093 + y * 19349663 + z * 83492791;       // exact in a double for the grids used here; collisions resolved below
    let list = map.get(key), id = -1;
    if (list) { for (let k = 0; k < list.length; k++) { const o = list[k] * 3; if (Math.round(out[o] * inv) === x && Math.round(out[o + 1] * inv) === y && Math.round(out[o + 2] * inv) === z) { id = list[k]; break; } } } else { list = []; map.set(key, list); }
    if (id < 0) { id = out.length / 3; out.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); list.push(id); }
    remap[v] = id;
  }
  const idx = [];
  for (let t = 0; t < I.length; t += 3) { const a = remap[I[t]], b = remap[I[t + 1]], c = remap[I[t + 2]]; if (a !== b && b !== c && a !== c) idx.push(a, b, c); }
  return { P: new Float32Array(out), I: new Uint32Array(idx) };
}
function compact(P, I) {
  const remap = new Int32Array(P.length / 3).fill(-1); const out = []; const idx = new Uint32Array(I.length);
  for (let k = 0; k < I.length; k++) { const v = I[k]; if (remap[v] < 0) { remap[v] = out.length / 3; out.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } idx[k] = remap[v]; }
  return { P: new Float32Array(out), I: idx };
}
// last resort for meshes made of many separate pieces: snap vertices to a grid coarse enough to meet the budget
function clusterTo(P, I, targetTris) {
  const b = bounds(P); const span = Math.max(b.size[0], b.size[1], b.size[2]);
  const build = (n) => {
    const cell = span / n; const map = new Map(); const rep = new Uint32Array(P.length / 3); const sum = [];
    for (let v = 0, nv = P.length / 3; v < nv; v++) {
      const x = Math.floor((P[v * 3] - b.mn[0]) / cell), y = Math.floor((P[v * 3 + 1] - b.mn[1]) / cell), z = Math.floor((P[v * 3 + 2] - b.mn[2]) / cell);
      const key = (x * 1024 + y) * 1024 + z; let id = map.get(key);
      if (id === undefined) { id = sum.length / 4; map.set(key, id); sum.push(0, 0, 0, 0); }
      sum[id * 4] += P[v * 3]; sum[id * 4 + 1] += P[v * 3 + 1]; sum[id * 4 + 2] += P[v * 3 + 2]; sum[id * 4 + 3]++; rep[v] = id;
    }
    const seen = new Set(); const idx = [];
    for (let t = 0; t < I.length; t += 3) { const a = rep[I[t]], c = rep[I[t + 1]], d = rep[I[t + 2]]; if (a === c || c === d || a === d) continue; const lo = Math.min(a, c, d), hi = Math.max(a, c, d), mid = a + c + d - lo - hi; const k = lo + ',' + mid + ',' + hi; if (seen.has(k)) continue; seen.add(k); idx.push(a, c, d); }
    const pos = new Float32Array(sum.length / 4 * 3); for (let i = 0; i < sum.length / 4; i++) { pos[i * 3] = sum[i * 4] / sum[i * 4 + 3]; pos[i * 3 + 1] = sum[i * 4 + 1] / sum[i * 4 + 3]; pos[i * 3 + 2] = sum[i * 4 + 2] / sum[i * 4 + 3]; }
    return { P: pos, I: new Uint32Array(idx) };
  };
  let lo = 2, hi = 200, best = build(2);
  for (let it = 0; it < 9; it++) { const n = Math.round((lo + hi) / 2); const r = build(n); if (r.I.length / 3 > targetTris) hi = n; else { best = r; lo = n; } if (hi - lo <= 1) break; }
  return best;
}
function simplifyTo(P, I, targetTris) {
  let idx = I, err = 0.01;
  for (let pass = 0; pass < 6 && idx.length / 3 > targetTris * 1.1; pass++) {
    const next = MeshoptSimplifier.simplify(idx, P, 3, targetTris * 3, err, pass < 3 ? ['Prune'] : [])[0];
    if (next.length / 3 < targetTris * 0.6) break;      // pruned or collapsed too far (a model made of thin separate parts): keep the step before
    idx = next; err *= 2.5;
  }
  let m = compact(P, idx);
  if (m.I.length / 3 > targetTris * 1.6) { const c = clusterTo(m.P, m.I, targetTris); if (c.I.length >= 36) m = compact(c.P, c.I); }
  if (m.I.length < 36) throw new Error('nothing left after simplification');
  return m;
}
// normals with hard edges where faces meet at more than the crease angle (walls against roofs), smooth elsewhere
function splitNormals(P, I, creaseDeg) {
  const T = I.length / 3, V = P.length / 3; const fn = new Float32Array(T * 3); const cosC = Math.cos(creaseDeg * Math.PI / 180);
  for (let t = 0; t < T; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    fn[t * 3] = uy * vz - uz * vy; fn[t * 3 + 1] = uz * vx - ux * vz; fn[t * 3 + 2] = ux * vy - uy * vx;      // length = 2 x area: an area weight for free
  }
  const start = new Uint32Array(V + 1); for (let k = 0; k < I.length; k++) start[I[k] + 1]++; for (let v = 0; v < V; v++) start[v + 1] += start[v];
  const fill = start.slice(0, V), inc = new Uint32Array(I.length); for (let k = 0; k < I.length; k++) inc[fill[I[k]]++] = k;      // corners (index slots) around each vertex
  const pos = [], nor = [], idx = new Uint32Array(I.length);
  for (let v = 0; v < V; v++) {
    const groups = [];                                                   // [sumx, sumy, sumz, corners...]
    for (let s = start[v]; s < start[v + 1]; s++) {
      const corner = inc[s], t = (corner / 3) | 0; const nx = fn[t * 3], ny = fn[t * 3 + 1], nz = fn[t * 3 + 2]; const nl = Math.hypot(nx, ny, nz) || 1;
      let g = null;
      for (const q of groups) { const ql = Math.hypot(q.n[0], q.n[1], q.n[2]) || 1; if ((q.n[0] * nx + q.n[1] * ny + q.n[2] * nz) / (ql * nl) > cosC) { g = q; break; } }
      if (!g) { g = { n: [0, 0, 0], corners: [] }; groups.push(g); }
      g.n[0] += nx; g.n[1] += ny; g.n[2] += nz; g.corners.push(corner);
    }
    for (const g of groups) { const id = pos.length / 3; const l = Math.hypot(g.n[0], g.n[1], g.n[2]) || 1; pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); nor.push(g.n[0] / l, g.n[1] / l, g.n[2] / l); for (const c of g.corners) idx[c] = id; }
  }
  return { P: new Float32Array(pos), N: new Float32Array(nor), I: idx };
}
function unwrapAtlas(P, N, I, size) {
  const atlas = new watlas.Atlas();
  try {
    atlas.addMesh({ vertexPositionData: P, vertexCount: P.length / 3, vertexPositionStride: 12, vertexNormalData: N, vertexNormalStride: 12, indexData: I, indexCount: I.length });
    atlas.generate({}, { resolution: size, padding: 2, bilinear: true, blockAlign: false, rotateCharts: true });
    const mesh = atlas.getMesh(0); const W = atlas.width, H = atlas.height;
    const idx = new Uint32Array(mesh.indexCount); mesh.getIndexArray(idx);
    const n = mesh.vertexCount; const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let j = 0; j < n; j++) { const v = mesh.getVertex(j); const x = v.xref * 3; pos[j * 3] = P[x]; pos[j * 3 + 1] = P[x + 1]; pos[j * 3 + 2] = P[x + 2]; nor[j * 3] = N[x]; nor[j * 3 + 1] = N[x + 1]; nor[j * 3 + 2] = N[x + 2]; uv[j * 2] = v.uv[0] / W; uv[j * 2 + 1] = v.uv[1] / H; }
    return { P: pos, N: nor, UV: uv, I: idx, W, H, atlases: atlas.atlasCount };
  } finally { atlas.delete(); }
}

// ---------- closest point on the detailed mesh ----------
function makeGrid(P, I, cells) {
  const b = bounds(P); const span = Math.max(b.size[0], b.size[1], b.size[2]); const cs = span / cells;
  const nx = Math.max(1, Math.ceil(b.size[0] / cs)), ny = Math.max(1, Math.ceil(b.size[1] / cs)), nz = Math.max(1, Math.ceil(b.size[2] / cs));
  const T = I.length / 3; const counts = new Uint32Array(nx * ny * nz + 1);
  const range = (t, visit) => {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) { const o = I[t * 3 + k] * 3; x0 = Math.min(x0, P[o]); x1 = Math.max(x1, P[o]); y0 = Math.min(y0, P[o + 1]); y1 = Math.max(y1, P[o + 1]); z0 = Math.min(z0, P[o + 2]); z1 = Math.max(z1, P[o + 2]); }
    const a = Math.max(0, Math.floor((x0 - b.mn[0]) / cs)), A = Math.min(nx - 1, Math.floor((x1 - b.mn[0]) / cs)), c = Math.max(0, Math.floor((y0 - b.mn[1]) / cs)), C = Math.min(ny - 1, Math.floor((y1 - b.mn[1]) / cs)), d = Math.max(0, Math.floor((z0 - b.mn[2]) / cs)), D = Math.min(nz - 1, Math.floor((z1 - b.mn[2]) / cs));
    for (let z = d; z <= D; z++) for (let y = c; y <= C; y++) for (let x = a; x <= A; x++) visit((z * ny + y) * nx + x);
  };
  for (let t = 0; t < T; t++) range(t, (c) => { counts[c + 1]++; });
  for (let c = 0; c < nx * ny * nz; c++) counts[c + 1] += counts[c];
  const fill = counts.slice(0, nx * ny * nz), list = new Uint32Array(counts[nx * ny * nz]);
  for (let t = 0; t < T; t++) range(t, (c) => { list[fill[c]++] = t; });
  return { b, cs, nx, ny, nz, start: counts, list };
}
// closest point on triangle (a, b, c) to p: writes barycentrics into out, returns squared distance (Ericson, RTCD 5.1.5)
function closestTri(px, py, pz, P, ia, ib, ic, out) {
  const ax = P[ia], ay = P[ia + 1], az = P[ia + 2], bx = P[ib], by = P[ib + 1], bz = P[ib + 2], cx = P[ic], cy = P[ic + 1], cz = P[ic + 2];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let u, v, w;
  if (d1 <= 0 && d2 <= 0) { u = 1; v = 0; w = 0; }
  else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz; const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { u = 0; v = 1; w = 0; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { v = d1 / (d1 - d3); u = 1 - v; w = 0; }
      else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz; const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { u = 0; v = 0; w = 1; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { w = d2 / (d2 - d6); u = 1 - w; v = 0; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); u = 0; v = 1 - w; }
            else { const den = 1 / (va + vb + vc); v = vb * den; w = vc * den; u = 1 - v - w; }
          }
        }
      }
    }
  }
  out[0] = u; out[1] = v; out[2] = w;
  const qx = ax * u + bx * v + cx * w - px, qy = ay * u + by * v + cy * w - py, qz = az * u + bz * v + cz * w - pz;
  return qx * qx + qy * qy + qz * qz;
}

// ---------- the bake ----------
// hi: { P, UV, I } and its colour image { data (RGBA), w, h }. Returns an RGBA buffer size x size and its mean colour.
function bakeColour(lo, hi, img, size) {
  const grid = makeGrid(hi.P, hi.I, 96); const { b, cs, nx, ny, nz, start, list } = grid;
  const out = new Uint8Array(size * size * 4), filled = new Uint8Array(size * size); const bary = [0, 0, 0], bestB = [0, 0, 0];
  const sample = (u, v, o) => {             // bilinear, clamped
    const x = Math.min(img.w - 1.001, Math.max(0, u * img.w - 0.5)), y = Math.min(img.h - 1.001, Math.max(0, v * img.h - 0.5)); const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0; const d = img.data, w4 = img.w * 4, p = (y0 * img.w + x0) * 4;
    for (let k = 0; k < 3; k++) out[o + k] = (d[p + k] * (1 - fx) + d[p + 4 + k] * fx) * (1 - fy) + (d[p + w4 + k] * (1 - fx) + d[p + w4 + 4 + k] * fx) * fy;
    out[o + 3] = 255;
  };
  const lookup = (px, py, pz, o) => {
    const gx = Math.min(nx - 1, Math.max(0, Math.floor((px - b.mn[0]) / cs))), gy = Math.min(ny - 1, Math.max(0, Math.floor((py - b.mn[1]) / cs))), gz = Math.min(nz - 1, Math.max(0, Math.floor((pz - b.mn[2]) / cs)));
    let best = Infinity, bt = -1;
    for (let r = 0; r <= 10; r++) {
      for (let z = Math.max(0, gz - r); z <= Math.min(nz - 1, gz + r); z++) for (let y = Math.max(0, gy - r); y <= Math.min(ny - 1, gy + r); y++) for (let x = Math.max(0, gx - r); x <= Math.min(nx - 1, gx + r); x++) {
        if (r > 0 && Math.max(Math.abs(x - gx), Math.abs(y - gy), Math.abs(z - gz)) < r) continue;         // inner cells were done on earlier rings
        const c = (z * ny + y) * nx + x;
        for (let s = start[c]; s < start[c + 1]; s++) { const t = list[s]; const d = closestTri(px, py, pz, hi.P, hi.I[t * 3] * 3, hi.I[t * 3 + 1] * 3, hi.I[t * 3 + 2] * 3, bary); if (d < best) { best = d; bt = t; bestB[0] = bary[0]; bestB[1] = bary[1]; bestB[2] = bary[2]; } }
      }
      if (bt >= 0 && best <= r * cs * r * cs) break;      // nothing in the rings still unvisited can be nearer
    }
    if (bt < 0) return false;
    const a = hi.I[bt * 3] * 2, c2 = hi.I[bt * 3 + 1] * 2, d2 = hi.I[bt * 3 + 2] * 2;
    sample(hi.UV[a] * bestB[0] + hi.UV[c2] * bestB[1] + hi.UV[d2] * bestB[2], hi.UV[a + 1] * bestB[0] + hi.UV[c2 + 1] * bestB[1] + hi.UV[d2 + 1] * bestB[2], o);
    return true;
  };
  const { P, UV, I } = lo;
  for (let t = 0; t < I.length; t += 3) {
    const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2];
    const x0 = UV[i0 * 2] * size, y0 = UV[i0 * 2 + 1] * size, x1 = UV[i1 * 2] * size, y1 = UV[i1 * 2 + 1] * size, x2 = UV[i2 * 2] * size, y2 = UV[i2 * 2 + 1] * size;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (Math.abs(area) < 1e-9) continue; const inv = 1 / area;
    const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2) - 1)), xb = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2) + 1)), ya = Math.max(0, Math.floor(Math.min(y0, y1, y2) - 1)), yb = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2) + 1));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const o = y * size + x; if (filled[o] === 2) continue;
      const px = x + 0.5, py = y + 0.5;
      let w1 = ((px - x0) * (y2 - y0) - (x2 - x0) * (py - y0)) * inv, w2 = ((x1 - x0) * (py - y0) - (px - x0) * (y1 - y0)) * inv, w0 = 1 - w1 - w2;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;      // texel centres inside the triangle; the border is bled outward afterwards
      if (lookup(P[i0 * 3] * w0 + P[i1 * 3] * w1 + P[i2 * 3] * w2, P[i0 * 3 + 1] * w0 + P[i1 * 3 + 1] * w1 + P[i2 * 3 + 1] * w2, P[i0 * 3 + 2] * w0 + P[i1 * 3 + 2] * w1 + P[i2 * 3 + 2] * w2, o * 4)) filled[o] = 2;
    }
  }
  // mean colour of the covered texels, then bleed colour outward so mip levels never pick up empty texels
  let r = 0, g = 0, bl = 0, n = 0; for (let o = 0; o < size * size; o++) if (filled[o] === 2) { r += out[o * 4]; g += out[o * 4 + 1]; bl += out[o * 4 + 2]; n++; }
  const mean = n ? [r / n / 255, g / n / 255, bl / n / 255] : [0.5, 0.5, 0.5];
  let cur = filled.map((f) => (f ? 1 : 0));
  for (let pass = 0; pass < Math.max(4, size >> 4); pass++) {
    const next = cur.slice(); let any = false;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const o = y * size + x; if (cur[o]) continue; let sr = 0, sg = 0, sb = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue; const q = yy * size + xx; if (cur[q]) { sr += out[q * 4]; sg += out[q * 4 + 1]; sb += out[q * 4 + 2]; c++; } }
      if (c) { out[o * 4] = sr / c; out[o * 4 + 1] = sg / c; out[o * 4 + 2] = sb / c; out[o * 4 + 3] = 255; next[o] = 1; any = true; }
    }
    cur = next; if (!any) break;
  }
  for (let o = 0; o < size * size; o++) if (!cur[o]) { out[o * 4] = mean[0] * 255; out[o * 4 + 1] = mean[1] * 255; out[o * 4 + 2] = mean[2] * 255; out[o * 4 + 3] = 255; }
  return { data: out, mean, coverage: n / (size * size) };
}

// detail: a normalised document (one textured primitive). Returns { doc, tris, mean } for a far LOD of ~tris triangles
// with a size x size baked colour texture.
export async function bakeLowLod(detail, tris, size) {
  await init();
  const hi = firstPrimitive(detail); if (!hi.UV) throw new Error('detailed mesh has no UVs');
  const tex = hi.material && hi.material.getBaseColorTexture(); if (!tex) throw new Error('detailed mesh has no colour texture');
  // read the colour at about four source texels per baked texel: enough to keep it sharp, little enough not to shimmer
  const src = Math.min(4096, size * 4);
  const raw = await sharp(Buffer.from(tex.getImage())).resize(src, src, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = { data: raw.data, w: raw.info.width, h: raw.info.height };
  const span = Math.max(...bounds(hi.P).size);
  const welded = weldPositions(hi.P, hi.I, span * 2e-5);
  const simple = simplifyTo(welded.P, welded.I, tris);
  const sharpened = splitNormals(simple.P, simple.I, 48);
  const un = unwrapAtlas(sharpened.P, sharpened.N, sharpened.I, size);
  const baked = bakeColour(un, hi, img, size);
  const png = await sharp(Buffer.from(baked.data.buffer), { raw: { width: size, height: size, channels: 4 } }).removeAlpha().png().toBuffer();
  const doc = new Document(); const buf = doc.createBuffer();
  const t = doc.createTexture('colour').setMimeType('image/png').setImage(png);
  const mat = doc.createMaterial('baked').setBaseColorTexture(t).setRoughnessFactor(0.9).setMetallicFactor(0);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(un.P).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(un.N).setBuffer(buf))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(un.UV).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(un.I).setBuffer(buf)).setMaterial(mat);
  doc.createScene('scene').addChild(doc.createNode('model').setMesh(doc.createMesh('model').addPrimitive(prim)));
  return { doc, tris: un.I.length / 3, mean: baked.mean.map((v) => +v.toFixed(3)), coverage: +baked.coverage.toFixed(2), atlases: un.atlases };
}
