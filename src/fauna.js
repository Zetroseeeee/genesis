// GENESIS fauna: the beasts of the land, wild and kept. Herds of the wild beasts of each kind of land and age - mammoths, reindeer
// and musk oxen at the edge of the ice in the first millennia, bison and wild horses on the steppe and the prairie, aurochs and deer
// in the woods, zebra, wildebeest and elephants on the savanna, guanacos in the Andes - thinning where people live; and the herds of
// those who keep them (cattle, sheep and goats from the first herders, horses once they are tamed, camels in the dry lands, water
// buffalo where rice grows, yaks on the high plateaus, llamas in the Andes, reindeer in the far north) in the country about their
// towns. Drawn near the eye, at the place's own scale as its townsfolk and its hosts are; grazing heads down, now and then walking a
// little way to better grass, the herd drifting over the days. Pure drawing: the simulation knows nothing of them.
// Classic script; exposes window.FAUNA.
(function () {
  const R_M = 6371000, D2R = Math.PI / 180, W = 720, H = 360;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function hash(i, k) { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const K_OPEN = 6;          // open country: drawn this many times life size (near a town, the town's own scale)
  const K_EYE = 470;         // and never smaller than the eye's distance over this (metres): a herd must still read from kilometres away
  const K_MAX = 16;
  const SLOT = 0.016;        // a herd's place: a lattice of the world's, about 1.8 kilometres (degrees of latitude)
  const REACH = 10;          // kilometres from what the eye looks at within which herds are kept
  const SEE_M = 18000;       // the eye nearer than this to what it looks at sees the beasts
  const CAP = 700;           // beasts of one kind drawn at most, finely and coarsely each
  const FINE_PX = 40, SPECK_PX = 12;      // a beast drawn finely while it is longer than about this many pixels, coarsely down to the second, and below it as a speck

  // ---------- the beasts' shapes ----------
  // A beast is a little sculpture of rounded pieces, each an ellipsoid, in true metres: forward +x, up +y, its side z, the ground at
  // y = 0. A piece moves with a part: 0 the body, 1 the head and neck (turning at the neck's root to graze), 2..5 the legs (front left,
  // front right, hind left, hind right: turning at the hip), 6 the tail (swishing at its root). Its shade: 1 the coat (times the beast's
  // own colour), less than 1 darker, more lighter; 2 ivory, 3 horn, 4 stripes across the body, 4.5 stripes round a leg, 5 near black (a
  // hoof, a dark face), 6 the coat with patches of white (on some of the cattle), 7 antler (borne by some of a herd), 8 wool.
  const SPHERES = {};
  function sphere(nLon, nLat) {      // a unit sphere's triangles, outward and counter-clockwise from outside (the poles as fans)
    const key = nLon + 'x' + nLat; if (SPHERES[key]) return SPHERES[key];
    const P = (i, j) => { const th = j / nLat * Math.PI, ph = i / nLon * 2 * Math.PI; return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; };
    const t = [];
    for (let j = 0; j < nLat; j++) for (let i = 0; i < nLon; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      if (j > 0) t.push(a, b, c);
      if (j < nLat - 1) t.push(a, c, d);
    }
    return (SPHERES[key] = t);
  }
  class Sculpt {
    constructor(fine) { this.pos = []; this.nor = []; this.part = []; this.fine = fine; this.tip = null; this.piv = [0, 0]; this.pieces = []; this.reach = 0.1; }
    // an ellipsoid: its middle, its half sizes (along its own x, y, z), turned nose-up by pitch (about z) and then about the upright (yaw)
    e(c, r, pitch, yaw, id, piv, shade) {
      const big = Math.max(r[0], r[1], r[2]), q = this.fine === true ? 0 : this.fine === false ? 1 : this.fine;      // (0 finely, 1 coarsely, 2 a speck)
      const nLon = q === 0 ? (big > 0.25 ? 9 : 6) : q === 1 ? (big > 0.4 ? 6 : 4) : (big > 0.4 ? 5 : 3), nLat = q === 0 ? (big > 0.25 ? 6 : 4) : q === 1 ? (big > 0.4 ? 4 : 3) : (big > 0.4 ? 3 : 2);
      const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw || 0), sy = Math.sin(yaw || 0), pv = piv || [0, 0];
      const rot = (x, y, z) => { const x1 = x * cp - y * sp, y1 = x * sp + y * cp; return [x1 * cy + z * sy, y1, -x1 * sy + z * cy]; };
      const v0 = this.pos.length / 3;
      for (const n of sphere(nLon, nLat)) {
        const p = rot(n[0] * r[0], n[1] * r[1], n[2] * r[2]); let m = rot(n[0] / r[0], n[1] / r[1], n[2] / r[2]); const l = Math.hypot(m[0], m[1], m[2]) || 1;
        this.pos.push(c[0] + p[0], c[1] + p[1], c[2] + p[2]); this.nor.push(m[0] / l, m[1] / l, m[2] / l); this.part.push(id, pv[1], pv[0], shade);
      }
      // (horn, ivory and antler stay crisp, and so does whatever is thin beside the blending's reach - ears, a mane, a tail - which
      // the blending would swallow: the rest are blended into one surface, below)
      this.pieces.push({ c, r, cp, sp, cy, sy, id, v0, v1: this.pos.length / 3, hard: shade >= 1.5 && shade < 3.5 || shade > 6.5 && shade < 7.5 || Math.min(r[0], r[1], r[2]) < 0.3 * this.reach });
    }
    // how far inside the beast a point lies (metres, negative inside), its pieces joined smoothly over this.reach: the body's pieces and
    // those of one part (a leg's surface is blended into the body, not into the other legs); the pieces' own sizes give their distances
    field(x, y, z, part) {
      const k = this.reach; let f = 1e9;
      for (const q of this.pieces) {
        if (q.hard || (part !== 0 && q.id !== 0 && q.id !== part)) continue;
        const dx = x - q.c[0], dy = y - q.c[1], dz = z - (q.c[2] || 0);
        const x1 = dx * q.cy - dz * q.sy, z1 = dx * q.sy + dz * q.cy; const lx = x1 * q.cp + dy * q.sp, ly = -x1 * q.sp + dy * q.cp, lz = z1;
        const a = lx / q.r[0], b = ly / q.r[1], cc = lz / q.r[2], k0 = Math.sqrt(a * a + b * b + cc * cc), k1 = Math.sqrt(a * a / (q.r[0] * q.r[0]) + b * b / (q.r[1] * q.r[1]) + cc * cc / (q.r[2] * q.r[2]));
        const d = k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(q.r[0], q.r[1], q.r[2]);
        const h = Math.max(k - Math.abs(f - d), 0) / k; f = Math.min(f, d) - h * h * k * 0.25;
      }
      return f;
    }
    // every soft piece's surface moved out onto the blended one where two meet (a fillet where there was a crease), and lit by it
    blend() {
      const P = this.pos, N = this.nor, k = this.reach, e = k * 0.04;
      for (const q of this.pieces) { if (q.hard) continue;
        for (let v = q.v0; v < q.v1; v++) {
          let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; const id = q.id;
          let f = this.field(x, y, z, id); if (f < -0.6 * k) continue;      // (deep inside another piece: hidden, left as it is)
          for (let it = 0; it < 2 && Math.abs(f) > 1e-4; it++) {
            const gx = (this.field(x + e, y, z, id) - f) / e, gy = (this.field(x, y + e, z, id) - f) / e, gz = (this.field(x, y, z + e, id) - f) / e, g2 = gx * gx + gy * gy + gz * gz;
            if (g2 < 1e-6) break; x -= f * gx / g2; y -= f * gy / g2; z -= f * gz / g2; f = this.field(x, y, z, id);
          }
          if (Math.hypot(x - P[v * 3], y - P[v * 3 + 1], z - P[v * 3 + 2]) > 0.7 * k || Math.abs(f) > 0.05 * k) continue;      // (a step that went astray: the piece's own surface is kept)
          const gx = this.field(x + e, y, z, id) - this.field(x - e, y, z, id), gy = this.field(x, y + e, z, id) - this.field(x, y - e, z, id), gz = this.field(x, y, z + e, id) - this.field(x, y, z - e, id), gl = Math.hypot(gx, gy, gz);
          P[v * 3] = x; P[v * 3 + 1] = Math.max(y, -0.01); P[v * 3 + 2] = z; if (gl > 1e-9) { N[v * 3] = gx / gl; N[v * 3 + 1] = gy / gl; N[v * 3 + 2] = gz / gl; }
        }
      }
    }
    // an ellipsoid from point a to point b (a little longer, to close the joints), ra thick up and down, rb across
    seg(a, b, ra, rb, id, piv, shade) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = (b[2] || 0) - (a[2] || 0), l = Math.hypot(dx, dy, dz) || 1e-3;
      this.e([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ((a[2] || 0) + (b[2] || 0)) / 2], [l * 0.6, ra, rb === undefined ? ra : rb], Math.asin(clamp(dy / l, -1, 1)), Math.atan2(-dz, dx), id, piv, shade);
    }
    // a chain of points, its thickness from r0 at the first to r1 at the last
    chain(pts, r0, r1, id, piv, shade, flat) {
      for (let k = 0; k + 1 < pts.length; k++) { const f = pts.length > 2 ? k / (pts.length - 2) : 0, r = r0 + (r1 - r0) * f; this.seg(pts[k], pts[k + 1], r, r * (flat || 1), id, piv, shade); }
    }
    geometry() {
      this.blend();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 4));
      // how far the head goes down to graze: until the muzzle is at the grass (an elephant's trunk does the reaching)
      let graze = -0.2;
      if (this.tip && !this.trunk) { const [mx, my] = this.tip, r = Math.hypot(mx, my), f0 = Math.atan2(my, mx), sn = ((this.browse || 0.1) - this.piv[1]) / r; graze = Math.max(-2.3, (Math.abs(sn) < 0.97 ? Math.asin(sn) : -1.33) - f0); }
      g.setAttribute('aGrz', new THREE.Float32BufferAttribute(new Float32Array(this.pos.length / 3).fill(graze), 1)); g.userData.graze = graze;
      return g;
    }
  }
  const add = (p, x, y, z) => [p[0] + x, p[1] + y, (p[2] || 0) + (z || 0)];
  // a beast on four legs, from its measures (metres): L the trunk's length, S the shoulder's height, W its breadth, leg the legs' share
  // of the height, legT their thickness; the neck (nA its angle up, nL its length, nT its thickness, or a chain of its own: neck(B)), the
  // head (hA its angle, nose down negative; hL, hT, hW its length, depth and breadth), and what this kind has besides
  function quad(s, o) {
    const L = o.L, S = o.S, Wd = o.W, legH = S * o.leg, D = S - legH, yc = legH + D * 0.5, coat = o.coat || 1, fr = o.front || 1;
    const B = [L * 0.4, yc + D * (o.neckY === undefined ? 0.2 : o.neckY)]; s.piv = B; s.reach = 0.07 * S + 0.02; s.browse = o.browse || 0.1;
    // the trunk of the body: barrel, chest, rump, the belly a shade lighter, the withers
    s.e([0, yc, 0], [L * 0.5, D * 0.5, Wd * 0.5], 0, 0, 0, null, coat);
    s.e([L * 0.27, yc + D * 0.04 * fr, 0], [L * 0.26 * fr, D * 0.55 * fr, Wd * 0.53 * fr], 0, 0, 0, null, coat);
    s.e([-L * 0.29, yc + D * (0.03 + (o.rump || 0)), 0], [L * 0.25, D * 0.5 * (o.rumpK || 1), Wd * 0.5 * (o.rumpK || 1)], 0, 0, 0, null, coat);
    s.e([L * 0.02, yc - D * 0.22, 0], [L * 0.36, D * 0.33, Wd * 0.45], 0, 0, 0, null, o.belly || (coat === 1 ? 1.14 : coat));
    s.e([L * 0.3, yc + D * 0.32, 0], [L * 0.2, D * 0.32 * fr, Wd * 0.38 * fr], 0.1, 0, 0, null, coat);
    if (o.hump) s.e([L * (o.humpX === undefined ? 0.24 : o.humpX), yc + D * 0.35 + o.hump * 0.55, 0], [L * (o.humpL || 0.22), D * 0.22 + o.hump * 0.6, Wd * 0.36], 0, 0, 0, null, coat);
    if (o.shag) s.e([L * 0.1, yc - D * 0.15 - o.shag * legH * 0.3, 0], [L * 0.46, D * 0.42 + o.shag * legH * 0.3, Wd * 0.56], 0, 0, 0, null, o.shagShade || 0.86);
    if (o.wool) { for (const [x, y, z, r] of [[0.3, 0.25, 0.25, 0.4], [-0.3, 0.25, -0.25, 0.4], [0, 0.4, 0, 0.45], [0.3, 0.1, -0.3, 0.38], [-0.3, 0.1, 0.3, 0.38], [0, 0.0, 0.32, 0.38], [0, 0.0, -0.32, 0.38]])
      s.e([L * x, yc + D * y, Wd * z], [L * r * 0.55, D * r * 1.05, Wd * r * 1.2], 0, 0, 0, null, 8); }
    // the legs, each turning at its hip; a hind leg's thigh deep and running into the rump
    const lt = o.legT, fx = L * 0.31, hx = -L * 0.31, lz = Wd * 0.3, sock = o.sock || (coat === 4 ? 4.5 : 0.86);
    for (const [x, z, id, hind] of [[fx, -lz, 2, 0], [fx, lz, 3, 0], [hx, -lz, 4, 1], [hx, lz, 5, 1]]) {
      const piv = [x, hind ? legH + D * 0.4 : legH + D * 0.35];
      if (o.column) {      // an elephant's: columns
        s.e([x, legH * 0.72, z], [lt, legH * 0.4 + D * 0.2, lt], 0, 0, id, piv, coat);
        s.e([x, legH * 0.28, z], [lt * 0.9, legH * 0.3, lt * 0.9], 0, 0, id, piv, coat * 0.96);
        s.e([x + lt * 0.08, lt * 0.32, z], [lt * 1.02, lt * 0.33, lt * 1.02], 0, 0, id, piv, 0.82);
        continue;
      }
      if (hind) s.e([x + L * 0.03, legH * 0.95, z * 0.95], [lt * 1.5, legH * 0.3 + D * 0.22, lt * 1.05], -0.2, 0, id, piv, coat);
      else s.e([x, legH * 0.82, z], [lt * 1.0, legH * 0.27 + D * 0.12, lt * 0.88], 0, 0, id, piv, coat);
      const lx = hind ? x - lt * 0.35 : x;
      s.seg([hind ? x - lt * 0.1 : x, legH * 0.68], [lx, legH * 0.1], lt * 0.45, lt * 0.42, id, piv, sock);
      if (hind) s.seg([x - lt * 0.1, legH * 0.72], [x + lt * 0.2, legH * 0.95], lt * 0.55, lt * 0.5, id, piv, coat);      // the hock up into the thigh
      s.e([lx + lt * 0.12, lt * 0.33, z], [lt * 0.55, lt * 0.35, lt * 0.5], 0, 0, id, piv, o.hoof || 5);
    }
    // the neck, a chain from its root (straight unless the kind has its own), and the head at its end
    const chain = o.neck ? o.neck(B) : [B, add(B, Math.cos(o.nA) * o.nL * 0.5, Math.sin(o.nA) * o.nL * 0.5), add(B, Math.cos(o.nA) * o.nL, Math.sin(o.nA) * o.nL)];
    s.chain(chain, o.nT * 0.5, o.nT * 0.36, 1, B, coat, 0.82);
    const E = chain[chain.length - 1], hA = o.hA, hd = [Math.cos(hA), Math.sin(hA)], hn = [-Math.sin(hA), Math.cos(hA)];
    if (o.dewlap) s.e([B[0] + (E[0] - B[0]) * 0.55, Math.min(B[1], E[1]) - o.nT * 0.35, 0], [o.nL * 0.32, o.nT * 0.42, o.nT * 0.2], -0.3, 0, 1, B, coat);
    const at = (u, v, z) => [E[0] + hd[0] * u + hn[0] * v, E[1] + hd[1] * u + hn[1] * v, z || 0];      // a point of the head: u along it, v up from it
    s.e(at(o.hL * 0.32, o.hT * 0.08), [o.hL * 0.4, o.hT * 0.5, o.hW * 0.5], hA, 0, 1, B, o.face || coat);      // the skull
    s.e(at(o.hL * 0.76, -o.hT * 0.1), [o.hL * 0.27, o.hT * 0.34, o.hW * 0.36], hA, 0, 1, B, o.muzzle || o.face || coat);      // the muzzle
    const tip = at(o.hL * 1.0, -o.hT * 0.15); s.tip = [tip[0] - B[0], tip[1] - B[1]];
    if (o.ear) for (const z of [-1, 1]) { const p = at(o.hL * 0.06, o.hT * 0.42, z * o.hW * 0.38); s.e([p[0], p[1] + o.ear * 0.25, p[2]], [o.ear * 0.16, o.ear * 0.5, o.ear * 0.08], o.earA === undefined ? 0.6 : o.earA, z * (o.earOut || 0.6), 1, B, o.face || coat); }
    if (o.bigEars) for (const z of [-1, 1]) { const p = at(o.hL * 0.0, o.hT * 0.05, z * o.hW * 0.55); s.e(p, [o.bigEars * 0.4, o.bigEars * 0.5, 0.05], 0.1, z * 0.35, 1, B, coat * 0.95); }
    if (o.mane) { const n = chain.length; for (let k = 0; k + 1 < n; k++) { const a = chain[k], b = chain[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l, r = o.nT * (0.5 - 0.14 * k / Math.max(1, n - 2));
      s.seg(add(a, nx * r * 0.85, ny * r * 0.85), add(b, nx * r * 0.85, ny * r * 0.85), o.nT * 0.12, o.nT * 0.07, 1, B, o.maneShade || 0.42); } }
    if (o.beard) s.seg(at(o.hL * 0.1, -o.hT * 0.45), at(-o.hL * 0.2, -o.hT * 0.45 - o.beard), o.hT * 0.18, o.hT * 0.12, 1, B, 0.45);
    if (o.horns) o.horns(s, at, B, o);
    if (o.trunk) { s.trunk = 1; const p0 = at(o.hL * 0.7, -o.hT * 0.2), T = o.trunk; s.chain([p0, add(p0, T * 0.08, -T * 0.35), add(p0, T * 0.1, -T * 0.7), add(p0, T * 0.2, -T * 0.98)], o.hT * 0.22, o.hT * 0.08, 1, B, coat * 0.95); }
    // the tail, hanging from the rump, a tuft at its end where the kind has one
    const tr = [-L * 0.52, yc + D * (0.28 + (o.rump || 0))], tl = o.tail || 0.3;
    s.chain([tr, add(tr, -tl * 0.12, -tl * 0.5), add(tr, -tl * 0.14, -tl)], o.tT || 0.04, (o.tT || 0.04) * (o.bushy ? 1.4 : 0.8), 6, tr, o.tailShade || coat);
    if (o.tuft) s.e(add(tr, -tl * 0.14, -tl * 1.02), [o.tT * 1.4, tl * 0.14, o.tT * 1.4], 0, 0, 6, tr, 0.4);
  }
  // horns and antlers, from the top of the head (at(u, v, z): a point along the head, up from it, out to the side)
  const H_LYRE = (fwd) => (s, at, B, o) => { const h = o.hornL; for (const z of [-1, 1]) { const p0 = at(o.hL * 0.05, o.hT * 0.45, z * o.hW * 0.32);
    s.chain([p0, add(p0, 0.0, 0.04, z * h * 0.45), add(p0, h * 0.25 * fwd, h * 0.35, z * h * 0.62), add(p0, h * 0.45 * fwd, h * 0.62, z * h * 0.5)], 0.06 * h + 0.02, 0.012, 1, B, 3); } };
  const HORNS = {
    lyre: H_LYRE(1), aurochs: H_LYRE(1.6),
    swept: (s, at, B, o) => { const h = o.hornL; for (const z of [-1, 1]) { const p0 = at(o.hL * 0.02, o.hT * 0.42, z * o.hW * 0.25); s.chain([p0, add(p0, -h * 0.1, 0.02, z * h * 0.45), add(p0, -h * 0.35, h * 0.12, z * h * 0.72), add(p0, -h * 0.55, h * 0.3, z * h * 0.6)], 0.09, 0.02, 1, B, 3); } },
    hook: (s, at, B, o) => { const h = o.hornL; for (const z of [-1, 1]) { const p0 = at(o.hL * 0.0, o.hT * 0.5, z * o.hW * 0.1); s.chain([p0, add(p0, -0.05, -0.02, z * h * 0.4), add(p0, 0.02, -h * 0.45, z * h * 0.52), add(p0, h * 0.2, -h * 0.4, z * h * 0.58)], 0.09, 0.025, 1, B, 3); } },
    yak: (s, at, B, o) => { const h = o.hornL; for (const z of [-1, 1]) { const p0 = at(o.hL * 0.0, o.hT * 0.45, z * o.hW * 0.3); s.chain([p0, add(p0, 0, h * 0.1, z * h * 0.45), add(p0, h * 0.08, h * 0.5, z * h * 0.5), add(p0, -h * 0.05, h * 0.75, z * h * 0.35)], 0.06, 0.015, 1, B, 3); } },
    bison: (s, at, B, o) => { const h = o.hornL; for (const z of [-1, 1]) { const p0 = at(o.hL * 0.05, o.hT * 0.4, z * o.hW * 0.42); s.chain([p0, add(p0, 0, 0.02, z * h * 0.5), add(p0, h * 0.1, h * 0.5, z * h * 0.55)], 0.05, 0.015, 1, B, 5); } },
    gnu: (s, at, B, o) => { const h = o.hornL; for (const z of [-1, 1]) { const p0 = at(o.hL * 0.05, o.hT * 0.45, z * o.hW * 0.25); s.chain([p0, add(p0, 0, -h * 0.1, z * h * 0.45), add(p0, h * 0.05, h * 0.25, z * h * 0.6), add(p0, -h * 0.1, h * 0.45, z * h * 0.45)], 0.05, 0.012, 1, B, 5); } },
    goat: (s, at, B, o) => { const h = o.hornL; for (const z of [-1, 1]) { const p0 = at(o.hL * 0.1, o.hT * 0.45, z * o.hW * 0.2); s.chain([p0, add(p0, -h * 0.15, h * 0.4, z * h * 0.12), add(p0, -h * 0.5, h * 0.55, z * h * 0.2), add(p0, -h * 0.8, h * 0.35, z * h * 0.25)], 0.03, 0.008, 1, B, 3); } },
    antlers: (s, at, B, o) => { const h = o.hornL; for (const z of [-1, 1]) { const p0 = at(o.hL * 0.08, o.hT * 0.45, z * o.hW * 0.22), p1 = add(p0, -h * 0.08, h * 0.35, z * h * 0.22), p2 = add(p0, -h * 0.22, h * 0.72, z * h * 0.35), p3 = add(p0, -h * 0.1, h * 1.0, z * h * 0.32);
      s.chain([p0, p1, p2, p3], 0.035, 0.015, 1, B, 7); s.seg(p1, add(p1, h * 0.3, h * 0.08, z * 0.02), 0.018, 0.018, 1, B, 7); s.seg(p2, add(p2, h * 0.25, h * 0.12, z * 0.03), 0.016, 0.016, 1, B, 7);
      if (o.brow) s.seg(add(p0, -0.02, h * 0.12, z * 0.03), add(p0, h * 0.35, h * 0.05, z * 0.02), 0.02, 0.035, 1, B, 7); } },
    tusks: (s, at, B, o) => { const h = o.hornL, m = o.mammoth; for (const z of [-1, 1]) { const p0 = at(o.hL * 0.55, -o.hT * 0.32, z * o.hW * 0.22);
      s.chain(m ? [p0, add(p0, h * 0.16, -h * 0.22, z * h * 0.06), add(p0, h * 0.36, -h * 0.33, z * h * 0.16), add(p0, h * 0.56, -h * 0.28, z * h * 0.25), add(p0, h * 0.7, -h * 0.13, z * h * 0.25), add(p0, h * 0.74, h * 0.04, z * h * 0.17), add(p0, h * 0.66, h * 0.17, z * h * 0.06)]
        : [p0, add(p0, h * 0.35, -h * 0.4, z * 0.04), add(p0, h * 0.75, -h * 0.35, z * 0.06), add(p0, h * 0.95, -h * 0.12, z * 0.04)], 0.1 * Math.min(1.4, h), 0.04, 1, B, 2); } },
  };
  // the kinds: their measures and colours (n: how many to a herd, the fewest and the most)
  const SP = {
    mammoth:   { L: 3.0, S: 3.0, W: 1.6, leg: 0.5, legT: 0.3, column: 1, hump: 0.35, humpX: 0.3, rump: -0.22, rumpK: 0.9, shag: 0.75, shagShade: 0.8, nA: 0.25, nL: 0.2, nT: 1.1, hA: -0.25, hL: 0.95, hT: 1.15, hW: 0.85, ear: 0.3, earA: 0.2, trunk: 1.9, horns: HORNS.tusks, hornL: 2.0, mammoth: 1, tail: 0.4, tT: 0.06, tuft: 1, col: [0x4b3423, 0x3e2b1d, 0x5a4029], n: [3, 8] },
    elephant:  { L: 3.2, S: 3.1, W: 1.55, leg: 0.52, legT: 0.3, column: 1, rump: -0.05, nA: 0.2, nL: 0.22, nT: 1.0, hA: -0.3, hL: 1.0, hT: 0.95, hW: 0.8, bigEars: 1.3, trunk: 1.9, horns: HORNS.tusks, hornL: 0.9, tail: 1.0, tT: 0.04, tuft: 1, col: [0x77716b, 0x6b6660, 0x807a72], n: [4, 10] },
    bison:     { L: 1.9, S: 1.8, W: 0.75, leg: 0.42, legT: 0.15, front: 1.22, hump: 0.3, humpX: 0.3, rump: -0.14, rumpK: 0.85, shag: 0.45, nA: -0.35, nL: 0.45, nT: 0.75, neckY: 0.05, hA: -1.05, hL: 0.55, hT: 0.5, hW: 0.42, face: 0.72, beard: 0.25, horns: HORNS.bison, hornL: 0.28, ear: 0.08, tail: 0.5, tT: 0.03, tuft: 1, col: [0x3d2a1b, 0x45301f, 0x33241a], n: [8, 26] },
    muskox:    { L: 1.3, S: 1.3, W: 0.75, leg: 0.36, legT: 0.12, hump: 0.15, shag: 1.15, shagShade: 0.8, nA: 0.0, nL: 0.25, nT: 0.5, neckY: 0.1, hA: -0.85, hL: 0.45, hT: 0.36, hW: 0.32, horns: HORNS.hook, hornL: 0.45, tail: 0.12, tT: 0.04, sock: 0.95, col: [0x2b2119, 0x33281e], n: [6, 14] },
    yak:       { L: 1.7, S: 1.6, W: 0.7, leg: 0.42, legT: 0.13, hump: 0.22, shag: 0.85, nA: 0.0, nL: 0.4, nT: 0.55, hA: -0.7, hL: 0.5, hT: 0.32, hW: 0.28, horns: HORNS.yak, hornL: 0.5, ear: 0.1, tail: 0.7, tT: 0.06, bushy: 1, col: [0x231c17, 0x2e241c, 0x5a4a3c, 0xd8d0c4], n: [4, 10] },
    aurochs:   { L: 2.0, S: 1.75, W: 0.65, leg: 0.52, legT: 0.14, nA: 0.3, nL: 0.55, nT: 0.55, hA: -0.6, hL: 0.6, hT: 0.32, hW: 0.27, dewlap: 1, horns: HORNS.aurochs, hornL: 0.75, ear: 0.12, earA: 1.3, earOut: 1.2, tail: 0.8, tT: 0.03, tuft: 1, col: [0x2a1f17, 0x3a2a1c, 0x5c3f27], n: [4, 10] },
    cattle:    { L: 1.75, S: 1.35, W: 0.62, leg: 0.5, legT: 0.12, coat: 6, nA: 0.25, nL: 0.5, nT: 0.46, hA: -0.75, hL: 0.5, hT: 0.28, hW: 0.24, dewlap: 1, horns: HORNS.lyre, hornL: 0.32, ear: 0.12, earA: 1.3, earOut: 1.2, tail: 0.8, tT: 0.03, tuft: 1, col: [0x6e4a2e, 0x2a221d, 0xd8d0c2, 0x8c5a32, 0xb9a88f], n: [6, 16] },
    buffalo:   { L: 1.9, S: 1.5, W: 0.75, leg: 0.45, legT: 0.14, nA: 0.05, nL: 0.5, nT: 0.55, hA: -0.45, hL: 0.55, hT: 0.32, hW: 0.28, horns: HORNS.swept, hornL: 0.9, ear: 0.12, earA: 1.4, earOut: 1.3, tail: 0.7, tT: 0.03, tuft: 1, col: [0x3a3a3c, 0x2f3031, 0x46464a], n: [4, 9] },
    horse:     { L: 1.55, S: 1.45, W: 0.55, leg: 0.56, legT: 0.1, nA: 0.85, nL: 0.85, nT: 0.38, hA: -1.0, hL: 0.6, hT: 0.25, hW: 0.2, ear: 0.13, mane: 1, tail: 0.8, tT: 0.07, tailShade: 0.42, sock: 0.78, col: [0x7a5235, 0x5a3a24, 0x3a2a20, 0x9b7a55, 0xc9b8a0], n: [4, 12] },
    zebra:     { L: 1.5, S: 1.32, W: 0.52, leg: 0.56, legT: 0.095, coat: 4, nA: 0.8, nL: 0.75, nT: 0.36, hA: -1.0, hL: 0.55, hT: 0.24, hW: 0.19, muzzle: 5, ear: 0.17, mane: 1, maneShade: 4, tail: 0.55, tT: 0.03, tuft: 1, col: [0xe8e4dc], n: [8, 20] },
    wildebeest:{ L: 1.5, S: 1.35, W: 0.5, leg: 0.55, legT: 0.09, front: 1.1, rump: -0.12, rumpK: 0.9, nA: 0.45, nL: 0.5, nT: 0.4, hA: -1.1, hL: 0.55, hT: 0.26, hW: 0.2, face: 0.6, mane: 1, beard: 0.25, horns: HORNS.gnu, hornL: 0.4, ear: 0.1, tail: 0.65, tT: 0.04, tailShade: 0.4, col: [0x52504c, 0x47443f, 0x5c5850], n: [14, 36] },
    reindeer:  { L: 1.35, S: 1.15, W: 0.45, leg: 0.56, legT: 0.075, nA: 0.6, nL: 0.55, nT: 0.32, hA: -0.9, hL: 0.42, hT: 0.2, hW: 0.17, ear: 0.12, mane: 1, maneShade: 1.3, horns: HORNS.antlers, hornL: 1.0, brow: 1, tail: 0.12, tT: 0.04, belly: 1.3, col: [0x837a6c, 0x6f6658, 0x9a9182, 0xcfc8bb], n: [10, 28] },
    deer:      { L: 1.4, S: 1.2, W: 0.42, leg: 0.6, legT: 0.07, nA: 0.75, nL: 0.6, nT: 0.28, hA: -0.95, hL: 0.42, hT: 0.2, hW: 0.16, ear: 0.16, horns: HORNS.antlers, hornL: 0.85, tail: 0.12, tT: 0.03, belly: 1.25, col: [0x8c5a34, 0x7a4e2e, 0x9b6a40], n: [3, 8] },
    camel:     { L: 1.6, S: 2.0, W: 0.55, leg: 0.62, browse: 0.9, legT: 0.09, hump: 0.45, humpX: 0.0, humpL: 0.3, nT: 0.3, nL: 1.3, neck: (B) => [B, add(B, 0.45, -0.25), add(B, 0.8, 0.1), add(B, 0.92, 0.55)], hA: -0.15, hL: 0.55, hT: 0.22, hW: 0.18, ear: 0.08, tail: 0.5, tT: 0.04, tuft: 1, col: [0xb38a5a, 0xa47b4c, 0xc49a68], n: [3, 8] },
    llama:     { L: 1.15, S: 1.1, W: 0.42, leg: 0.55, browse: 0.25, legT: 0.075, wool: 1, nA: 1.3, nL: 0.75, nT: 0.26, hA: -0.25, hL: 0.32, hT: 0.17, hW: 0.15, ear: 0.17, earA: 0.15, earOut: 0.3, tail: 0.2, tT: 0.06, col: [0xd8cbb4, 0x8a6a4a, 0xece6da, 0x5a4636], n: [5, 14] },
    sheep:     { L: 1.0, S: 0.75, W: 0.55, leg: 0.4, legT: 0.05, wool: 1, nA: 0.35, nL: 0.25, nT: 0.3, hA: -0.9, hL: 0.28, hT: 0.16, hW: 0.13, face: 0.92, ear: 0.1, earA: 1.5, earOut: 1.4, sock: 0.9, hoof: 0.4, tail: 0.2, tT: 0.04, col: [0xdcd5c6, 0xe6e0d2, 0xcfc6b4, 0x3a3430], n: [14, 38] },
    goat:      { L: 0.95, S: 0.75, W: 0.36, leg: 0.55, legT: 0.05, nA: 0.55, nL: 0.35, nT: 0.2, hA: -0.75, hL: 0.3, hT: 0.15, hW: 0.12, beard: 0.12, horns: HORNS.goat, hornL: 0.3, ear: 0.1, earA: 1.2, earOut: 1.0, tail: 0.12, tT: 0.03, col: [0x6e5a46, 0xd8d0c2, 0x3a302a, 0x9b8064], n: [5, 14] },
  };
  const KINDS = Object.keys(SP);
  function beastGeometry(o, q) { const s = new Sculpt(q === undefined ? 0 : q === true ? 0 : q === false ? 1 : q); quad(s, o); return s.geometry(); }

  const AIR_V = window.AIR ? AIR.VERT : '\n    varying vec3 vAirT, vAirL; void air(vec3 p, float n, out vec3 T, out vec3 L) { T = vec3(1.0); L = vec3(0.0); }', AIR_F = window.AIR ? AIR.FRAG : '\n    varying vec3 vAirT, vAirL; vec3 airOver(vec3 c, vec3 T, vec3 L) { return c; }', AIR_N = window.AIR ? AIR.THING : '3.0';
  const VERT = `
    attribute vec4 aPart; attribute vec2 aWalk; attribute float aGrz;      // aWalk: the beast's own dice (and its stride's phase), how much it walks (0 grazing, 1 walking)
    uniform float uTime; varying vec3 vN, vCol, vView, vLocal; varying float vShade, vSeed;
    ${AIR_V}
    vec2 turn(vec2 q, float a) { float c = cos(a), s = sin(a); return vec2(q.x * c - q.y * s, q.x * s + q.y * c); }
    void main() {
      vec3 p = position, n = normal; float id = aPart.x, walk = max(aWalk.y, 0.0), seed = aWalk.x; vec2 piv = vec2(aPart.z, aPart.y);
      float ph = uTime * 6.0 + seed * 6.2832;
      // antlers on some of a herd only (the stags; among reindeer most of a herd): the others' are gathered to a point
      if (aPart.w > 6.5 && aPart.w < 7.5 && fract(seed * 13.7) > 0.45) p = vec3(piv, 0.0);
      if (id > 5.5) {
        // the tail swishes now and then, from side to side
        float a = sin(uTime * 2.3 + seed * 40.0) * 0.35 * smoothstep(0.3, 0.9, sin(uTime * 0.4 + seed * 17.0));
        vec2 q = turn(vec2(p.z, p.y - piv.y), a); p.z = q.x; p.y = piv.y + q.y; vec2 m = turn(vec2(n.z, n.y), a); n.z = m.x; n.y = m.y;
      } else if (id > 1.5) {
        // a walk: each leg swings at its hip, the diagonal pairs together
        float sgn = (id < 2.5 || id > 4.5) ? 1.0 : -1.0; float a = sin(ph) * 0.42 * walk * sgn;
        p.xy = piv + turn(p.xy - piv, a); n.xy = turn(n.xy, a);
      } else if (id > 0.5) {
        // grazing: the head down at the grass, and now and then up a while to look about (one standing for a picture: up)
        float up = smoothstep(0.55, 0.85, sin(uTime * 0.21 + seed * 23.0)), g = aWalk.y < 0.0 ? 0.0 : (1.0 - walk) * (1.0 - up); float a = aGrz * g + 0.06 * sin(ph) * walk;
        p.xy = piv + turn(p.xy - piv, a); n.xy = turn(n.xy, a);
      }
      p.y += abs(sin(ph)) * 0.04 * walk;      // (the whole beast rises a little with each stride)
      vShade = aPart.w; vSeed = seed; vCol = instanceColor; vLocal = position;
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vView = mv.xyz;
      vN = normalize(normalMatrix * (mat3(instanceMatrix) * n));
      air(mv.xyz, ${AIR_N}, vAirT, vAirL);
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    precision highp float; uniform vec3 uSunV, uUpV, uSunCol; uniform float uDay, uDusk;
    varying vec3 vN, vCol, vView, vLocal; varying float vShade, vSeed;
    ${AIR_F}
    ${window.SHADOWS ? SHADOWS.GLSL : 'float sunHidden(vec3 p) { return 0.0; }'}
    float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vnoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                 mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
    void main() {
      vec3 n = normalize(vN); vec3 col = vCol; float sh = vShade; const vec3 PALE = vec3(0.9, 0.88, 0.84);
      if (sh > 7.5) col = vCol * (0.88 + 0.2 * vnoise(vLocal * 11.0));                                                     // wool, in locks
      else if (sh > 6.5) col = vec3(0.5, 0.42, 0.33);                                                                    // antler
      else if (sh > 5.5) { if (fract(vSeed * 7.31) < 0.4) col = mix(col, PALE, step(0.58, vnoise(vLocal * 2.4 + vSeed * 31.0))); }      // patches of white on some
      else if (sh > 4.75) col = vec3(0.1, 0.09, 0.08);                                                                   // a hoof, a dark face
      else if (sh > 4.25) col = mix(PALE, vec3(0.07), step(0.5, fract(vLocal.y * 7.0)));                                 // a zebra's legs, banded
      else if (sh > 3.5) col = mix(PALE, vec3(0.07), step(0.5, fract(vLocal.x * 3.4 + sin(vLocal.y * 5.0) * 0.25)));    // a zebra's coat
      else if (sh > 2.5) col = vec3(0.58, 0.54, 0.46);                                                                   // horn
      else if (sh > 1.5) col = vec3(0.86, 0.82, 0.7);                                                                    // ivory
      else col = sh > 1.0 ? mix(vCol, PALE, (sh - 1.0) * 1.6) : vCol * sh;                                               // a pale belly, darker legs
      float diff = max(dot(n, uSunV), 0.0) * (1.0 - sunHidden(vView + n * 0.2)), sky = 0.5 + 0.5 * dot(n, uUpV);
      vec3 amb = mix(vec3(0.25, 0.31, 0.49) * (0.7 + 0.5 * sky), vec3(0.32, 0.34, 0.38) * (0.45 + 0.75 * sky) + vec3(0.27, 0.22, 0.155) * (1.0 - sky), uDay) + vec3(0.27, 0.19, 0.20) * uDusk * (0.5 + 0.6 * sky);
      vec3 lit = col * (amb + diff * 0.82 * uSunCol);
      gl_FragColor = vec4(airOver(lit, vAirT, vAirL), 1.0);
    }`;

  // a beast's shadow: the instance's x is half its length, z half its width, y the height of its body (all as drawn); the quad covers
  // the footprint swept away from the sun to where the body's shadow falls, and the fragment keeps what lies within the swept outline
  const SH_VERT = `
    uniform vec3 uSunV; varying vec2 vQ, vS; varying vec3 vView;
    void main() {
      mat4 mvi = modelViewMatrix * instanceMatrix;
      vec3 c = (mvi * vec4(0.0, 0.0, 0.0, 1.0)).xyz, fw = (mvi * vec4(1.0, 0.0, 0.0, 0.0)).xyz, sd = (mvi * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
      vec3 up = (mvi * vec4(0.0, 1.0, 0.0, 0.0)).xyz; float h = length(up); vec3 upN = up / h;
      float se = max(dot(uSunV, upN), 0.12); vec3 dH = -(uSunV - upN * dot(uSunV, upN)); float cl = length(dH);
      vec3 w = cl > 1e-4 ? dH / cl * min(h * cl / se, 5.0 * h) : vec3(0.0);
      vec2 s = vec2(dot(w, fw) / dot(fw, fw), dot(w, sd) / dot(sd, sd));
      vec2 lo = min(vec2(0.0), s) - 1.1, hi = max(vec2(0.0), s) + 1.1, q = mix(lo, hi, position.xy + 0.5);
      vec3 p = c + fw * q.x + sd * q.y + upN * 0.04 * h;
      vQ = q; vS = s; vView = p;
      gl_Position = projectionMatrix * vec4(p, 1.0);
    }`;
  const SH_FRAG = `
    precision highp float; uniform float uDay; varying vec2 vQ, vS; varying vec3 vView;
    ${window.SHADOWS ? SHADOWS.GLSL : 'float sunHidden(vec3 p) { return 0.0; }'}
    void main() {
      float t = clamp(dot(vQ, vS) / max(dot(vS, vS), 1e-6), 0.0, 1.0); float d = length(vQ - vS * t) / mix(0.75, 1.0, smoothstep(0.0, 0.6, t));
      float a = (1.0 - smoothstep(0.6, 1.0, d)) * 0.45 * uDay * (1.0 - sunHidden(vView));
      if (a < 0.01) discard;
      gl_FragColor = vec4(0.03, 0.035, 0.05, a);
    }`;

  // ---------- which beasts, where and when ----------
  // the continent of a place, roughly: 0 Eurasia, 1 Africa, 2 the Americas (north of the isthmus), 3 South America, 4 Australia
  function continent(lon, lat) {
    if (lon < -30) return lat > 9 ? 2 : 3;
    if (lon > 110 && lat < -10 && lon < 156) return 4;
    if (lat < 36 && lon > -20 && lon < 52 && !(lon > 34 && lat > 12)) return 1;      // (Arabia stays with Eurasia)
    return 0;
  }
  const L_TUNDRA = 2, L_BOREAL = 3, L_DESERT = 4, L_STEPPE = 5, L_GRASS = 6, L_OCWOOD = 7, L_MEDIT = 8, L_MONSOON = 9, L_SAVANNA = 10, L_RAIN = 11, L_HIGH = 12, L_PLATEAU = 13, L_COWOOD = 14, L_TASIA = 15;
  // the wild: [kind, weight] for a kind of land, a continent and a year (the mammoths go between 9000 and 7500 BC; the aurochs in AD 1627);
  // where the land is given back (rule.js's 'rewilded', a law of the Space Age) the bison come back to the plains and cattle bred back to
  // the aurochs roam the woods
  function wildOf(cls, ct, year, rew) {
    const mam = year < -7500 ? clamp((-7500 - year) / 1500, 0, 1) : 0, aur = year < 1600 ? 1 : rew ? 0.7 : 0;
    const bis = rew ? 0.9 : year < 1850 ? 1 : year < 1890 ? (1890 - year) / 40 + 0.03 : 0.03;      // the bison of the plains were shot out in forty years
    if (ct === 4) return null;
    if (ct === 2) {
      if (cls === L_GRASS || cls === L_STEPPE) return [['bison', bis], ['mammoth', 0.25 * mam], ['deer', 0.15]];
      if (cls === L_TUNDRA) return [['reindeer', 1], ['muskox', 0.35], ['mammoth', 0.25 * mam]];
      if (cls === L_BOREAL) return [['reindeer', 0.5], ['deer', 0.7]];
      if (cls === L_OCWOOD || cls === L_COWOOD || cls === L_MEDIT) return [['deer', 1], ['bison', 0.2 * bis]];
      if (cls === L_DESERT || cls === L_HIGH || cls === L_PLATEAU) return [['deer', 0.4]];
      return [['deer', 0.4]];
    }
    if (ct === 3) {
      if (cls === L_HIGH || cls === L_PLATEAU || cls === L_STEPPE || cls === L_DESERT) return [['llama', 1]];
      return [['deer', 0.5]];
    }
    if (ct === 1) {
      if (cls === L_SAVANNA || cls === L_GRASS || cls === L_STEPPE) return [['wildebeest', 1], ['zebra', 0.9], ['elephant', 0.35]];
      if (cls === L_RAIN || cls === L_TASIA || cls === L_MONSOON) return [['elephant', 0.4]];
      if (cls === L_DESERT) return [['deer', 0.15]];
      return [['deer', 0.5], ['zebra', 0.2]];
    }
    // Eurasia
    if (cls === L_TUNDRA) return [['reindeer', 1], ['muskox', 0.3 * (year < -6000 ? 1 : 0.2)], ['mammoth', 0.3 * mam]];
    if (cls === L_BOREAL) return [['reindeer', 0.6], ['deer', 0.7]];
    if (cls === L_STEPPE) return [['horse', 0.9], ['bison', 0.35 * (year < -3000 ? 1 : 0.2)], ['deer', 0.3], ['mammoth', 0.15 * mam]];
    if (cls === L_GRASS) return [['horse', 0.7], ['aurochs', 0.45 * aur], ['bison', 0.3]];
    if (cls === L_OCWOOD || cls === L_COWOOD) return [['deer', 1], ['aurochs', 0.4 * aur], ['bison', 0.15]];
    if (cls === L_MEDIT) return [['deer', 0.6], ['goat', 0.4], ['aurochs', 0.25 * aur]];
    if (cls === L_DESERT) return [['camel', 0.35], ['deer', 0.2]];
    if (cls === L_PLATEAU) return [['yak', 0.8], ['goat', 0.4]];
    if (cls === L_MONSOON || cls === L_TASIA || cls === L_RAIN) return [['elephant', 0.35], ['buffalo', 0.45], ['deer', 0.5]];
    if (cls === L_SAVANNA) return [['elephant', 0.3], ['deer', 0.5], ['buffalo', 0.3]];
    if (cls === L_HIGH) return [['goat', 0.5], ['deer', 0.3]];
    return [['deer', 0.4]];
  }
  // what a people keeps: by its land, its continent, what it knows (herding; horses once tamed) and whether the old world's beasts
  // have come to it (the Americas and Australia once their people have met the old world, as the land's crops and beasts do: land.js)
  function keptOf(cls, ct, horse, era, met) {
    const H = horse ? 0.45 : 0;
    if (ct === 4) return met ? [['sheep', 1], ['cattle', 0.6]] : null;
    if (ct === 2 || ct === 3) {
      if (cls === L_HIGH || cls === L_PLATEAU) return met ? [['llama', 1], ['sheep', 0.5], ['cattle', 0.4]] : ct === 3 ? [['llama', 1]] : null;
      return met ? [['cattle', 1], ['horse', 0.4], ['sheep', 0.4]] : null;
    }
    if (cls === L_TUNDRA || cls === L_BOREAL) return [['reindeer', 1], ['cattle', cls === L_BOREAL ? 0.3 : 0]];
    if (cls === L_DESERT) return era >= 2 ? [['camel', 1], ['goat', 0.6], ['sheep', 0.4]] : [['goat', 1], ['sheep', 0.6]];
    if (cls === L_STEPPE) return [['sheep', 1], ['horse', H * 2], ['cattle', 0.4], ['camel', era >= 2 && ct === 0 ? 0.25 : 0]];
    if (cls === L_PLATEAU) return [['yak', 1], ['sheep', 0.6], ['goat', 0.4]];
    if (cls === L_MONSOON || cls === L_TASIA) return [['buffalo', 0.8], ['cattle', 0.8], ['goat', 0.3]];
    if (cls === L_SAVANNA) return [['cattle', 1], ['goat', 0.6], ['sheep', 0.4]];
    if (cls === L_RAIN) return [['goat', 0.6], ['cattle', 0.3]];
    if (cls === L_MEDIT || cls === L_HIGH) return [['sheep', 1], ['goat', 0.8], ['cattle', 0.5], ['horse', H]];
    return [['cattle', 1], ['sheep', 0.8], ['goat', 0.3], ['horse', H]];
  }
  const pick = (list, u) => { if (!list) return null; let s = 0; for (const e of list) s += e[1]; if (s <= 0) return null; let x = u * s; for (const e of list) { x -= e[1]; if (x <= 0 && e[1] > 0) return e[0]; } return null; };

  class Fauna {
    constructor({ scene, terrain, world }) {
      this.scene = scene; this.terrain = terrain; this.world = world; this.exag = terrain.exag; this.enabled = true;
      const bu = world.bUniforms; this.uni = { uSunV: bu.uSunV, uUpV: bu.uUpV, uDay: bu.uDay, uSunCol: bu.uSunCol, uDusk: bu.uDusk, uSnow: bu.uSnow, uTime: { value: 0 } };
      if (window.AIR) Object.assign(this.uni, AIR.uniforms); if (window.SHADOWS) Object.assign(this.uni, SHADOWS.uniforms);
      this.mat = new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: VERT, fragmentShader: FRAG });
      this.inst = {}; this.lodK = 1; this.budget = 1; this.kEye = 0;      // a kind's meshes, fine, coarse and a speck, are made when first wanted
      // their shadows: the body's own outline cast on the ground away from the sun (a capsule from the feet to where the body's falls)
      { const su = { uSunV: bu.uSunV, uDay: bu.uDay }; if (window.SHADOWS) Object.assign(su, SHADOWS.uniforms);
        this.smat = new THREE.ShaderMaterial({ uniforms: su, vertexShader: SH_VERT, fragmentShader: SH_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
        this.shadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.smat, CAP * 4); this.shadow.count = 0; this.shadow.visible = false; this.shadow.frustumCulled = false; this.shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(this.shadow); }
      this.herds = []; this.last = { lon: 999, lat: 999, t: -1e9, yr: -1e9 }; this._m = new THREE.Matrix4(); this._v = new THREE.Vector3(); this._vc = null; this._vcV = -1; this.stats = { herds: 0, beasts: 0 };
    }
    // every kind standing in rows, for a look at them (the scenes): side on to the eye when it looks north
    zoo(lon, lat, k) { k = k || K_OPEN; const dLat = 9 * k / 111000, dLon = dLat / Math.max(0.2, Math.cos(lat * D2R)); this.extra = KINDS.map((kind, i) => ({ kind, lon: lon + ((i % 6) - 2.5) * dLon, lat: lat + (Math.floor(i / 6) - 1) * dLat, n: 1, k, still: true, yaw: Math.PI })); this.last.t = -1e9; return this.extra.length; }
    meshOf(kind, lod) {
      const I = this.inst[kind] || (this.inst[kind] = [null, null, null]); if (I[lod]) return I[lod];
      const g = beastGeometry(SP[kind], lod); const walk = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2), 2); walk.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aWalk', walk);
      const m = new THREE.InstancedMesh(g, this.mat, CAP); m.count = 0; m.visible = false; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m); return (I[lod] = { mesh: m, walk, n: 0 });
    }
    // the herds about the eye: a lattice of the world's places, each hashed to a herd or none by what lives there
    respawn(cam, sim) {
      const T = this.terrain, yr = sim.year, cl0 = Math.max(0.2, Math.cos(cam.lat * D2R));
      const dLat = REACH / 111, dLon = dLat / cl0; const old = new Map(); for (const h of this.herds) old.set(h.key, h);
      const herds = []; const vc = this._vc || (this._vc = new Map()); const KH = sim.know && sim.know.ID ? sim.know.ID.herding : -1, KHo = sim.know && sim.know.ID ? sim.know.ID.horse : -1;
      const j0 = Math.floor((cam.lat - dLat) / SLOT), j1 = Math.ceil((cam.lat + dLat) / SLOT);
      for (let j = j0; j <= j1; j++) {
        const lat0 = j * SLOT, sl = SLOT / Math.max(0.2, Math.cos(lat0 * D2R)); const i0 = Math.floor((cam.lon - dLon) / sl), i1 = Math.ceil((cam.lon + dLon) / sl);
        for (let i = i0; i <= i1; i++) {
          const key = j * 100003 + i; const u = hash(key, 17); if (u > 0.7 * this.budget) continue;      // (most places have no herd at any one time)
          const lat = lat0 + (hash(key, 23) - 0.5) * SLOT * 0.8, lon = i * sl + (hash(key, 29) - 0.5) * sl * 0.8; if (lat > 84 || lat < -60) continue;
          if (GEO.distKm(cam.lon, cam.lat, lon, lat) > REACH) continue;
          const cell = Math.floor((90 - lat) / 180 * H) * W + (((Math.floor((lon + 180) / 360 * W)) % W) + W) % W; if (!sim.land[cell]) continue;
          if (sim.iced && sim.iced(cell)) continue;
          if (T.isWater && T.isWater(lon, lat)) continue;
          const cls = sim.landClass ? sim.landClass(cell) : -1; if (cls <= 1) continue;
          const o = sim.owner[cell], cv = o >= 0 ? sim.civs[o] : null, p = sim.pop[cell] || 0, ct = continent(lon, lat);
          // keepers: a realm that herds, where its people live; the wild: where few do
          const knows = cv && KH >= 0 && sim.know.has[o * sim.know.ND + KH];
          const rew = !!(cv && cv.rule && cv.rule.laws && cv.rule.laws.land === 'rewilded');
          let kind = null, kept = false;
          if (knows && p > 0.3 && hash(key, 31) < clamp(p / 4, 0.25, 0.85) * (rew ? 0.3 : 1)) { kind = pick(keptOf(cls, ct, KHo >= 0 && sim.know.has[o * sim.know.ND + KHo], cv.era | 0, ct < 2 || !!(sim.disease && sim.disease.met && sim.disease.met(o))), hash(key, 37)); kept = !!kind; }
          if (!kind) { const wildP = rew ? 0.6 * (1 - clamp(p / 8, 0, 0.7)) : (1 - clamp(p / 3, 0, 1)) * (cv ? (cv.era >= 6 ? 0.15 : cv.era >= 3 ? 0.5 : 0.8) : 1); if (hash(key, 41) < wildP) kind = pick(wildOf(cls, ct, yr, rew), hash(key, 43)); }
          if (!kind) continue;
          // not in a town: the built-up ground of the region's town and its neighbours'
          let inTown = false, k = K_OPEN;
          for (let dy = -1; dy <= 1 && !inTown; dy++) for (let dx = -1; dx <= 1 && !inTown; dx++) {
            const cy = Math.floor(cell / W) + dy; if (cy < 0 || cy >= H) continue; const c2 = cy * W + ((cell % W) + dx + W) % W; if (!sim.level[c2]) continue; const tc = sim.civs[sim.owner[c2]]; if (!tc) continue;
            const [sLon, sLat] = TOWN.siteOf(sim, c2, tc, T, this.decal), R = TOWN.radiusM(sim, c2, tc), d = GEO.distKm(lon, lat, sLon, sLat) * 1000;
            if (d < R * 1.15) inTown = true; else { const kT = TOWN.scaleOf(TOWN.radiusTrue(sim, c2, tc)), f = 1 - clamp((d - R * 1.4) / (R * 1.4), 0, 1); if (f > 0 && kT > k) k = K_OPEN + (kT - K_OPEN) * f * f * (3 - 2 * f); }
          }
          if (inTown) continue;
          const prev = old.get(key);
          if (prev && prev.kind === kind) { prev.k = k; herds.push(prev); continue; }
          herds.push(this.herd(key, kind, kept, lon, lat, k));
        }
      }
      // herds asked for by hand (the scenes, the tests): { kind, lon, lat, n, k }
      for (const e of this.extra || []) { if (e.lon === undefined) { e.lon = cam.lon + (e.dx || 0); e.lat = cam.lat + (e.dy || 0); }      // (a herd asked for without a place: where the eye looks)
        const key = -1 - Math.round((e.lon + 180) * 1e4) * 7 - Math.round((e.lat + 90) * 1e4) * 13; const prev = old.get(key);
        herds.push(prev && prev.kind === e.kind ? prev : this.herd(key, e.kind, !!e.kept, e.lon, e.lat, e.k || K_OPEN, e.n, e.still, e.yaw)); }
      this.herds = herds;
    }
    herd(key, kind, kept, lon, lat, k, n, still, yaw) {
      const sp = SP[kind]; if (!n) n = sp.n[0] + Math.floor(hash(key, 47) * (sp.n[1] - sp.n[0] + 1));
      const spread = Math.sqrt(n) * (sp.L + 0.5) * 2.2;      // (true metres: a herd stands a few body lengths apart; where the beasts stand is kept in true metres and drawn k times)
      const h = { key, kind, kept, lon, lat, cl: Math.max(0.2, Math.cos(lat * D2R)), k, n, spread, drift: hash(key, 53) * 6.2832, beasts: [], still: !!still };
      for (let b = 0; b < n; b++) { const a = hash(key, 100 + b) * 6.2832, r = n > 1 ? Math.sqrt(hash(key, 200 + b)) * spread : 0; const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
        const col = sp.col[Math.floor(hash(key, 300 + b) * sp.col.length)];
        h.beasts.push({ x: bx, z: bz, tx: bx, tz: bz, yaw: yaw !== undefined ? yaw : hash(key, 400 + b) * 6.2832, walk: 0, rest: still ? Infinity : 2 + hash(key, 500 + b) * 14, ph: hash(key, 600 + b), col, shade: 0.85 + 0.3 * hash(key, 700 + b), hg: 0, hx: 1e9, hz: 1e9, hv: -1, wet: false }); }
      return h;
    }
    update(cam, sim, now, dt) {
      if (!sim || !this.enabled || !sim.landClass) { this.clear(); return; }
      const near = (cam.agl !== undefined ? cam.agl : cam.alt) * R_M < SEE_M && cam.dist * R_M < SEE_M; if (!near) { this.clear(); return; }      // (the camera's heights are in Earth radii)
      this.kEye = Math.min(K_MAX, cam.dist * R_M / K_EYE);
      this.uni.uTime.value = now / 1000;
      const moved = GEO.distKm(cam.lon, cam.lat, this.last.lon, this.last.lat) > 2.5;
      if (moved || now - this.last.t > 9000 || sim.year !== this.last.yr) { this.last = { lon: cam.lon, lat: cam.lat, t: now, yr: sim.year }; this.respawn(cam, sim); }
      if (this._vcV !== this.terrain.meshVersion || !this._vc || this._vc.size > 30000) { this._vc = new Map(); this._vcV = this.terrain.meshVersion; }
      this.animate(Math.min(0.1, dt || 0.016), now / 1000, cam.camera ? cam.camera.position : null, cam.camera ? cam.camera.fov : 50);
    }
    clear() { if (this.stats.beasts) { for (const k in this.inst) for (const I of this.inst[k]) if (I) { I.mesh.count = 0; I.mesh.visible = false; } if (this.shadow) { this.shadow.count = 0; this.shadow.visible = false; } this.stats = { herds: 0, beasts: 0 }; } this.herds = []; this.last.t = -1e9; }
    animate(dt, t, eye, fov) {
      for (const k in this.inst) for (const I of this.inst[k]) if (I) I.n = 0;
      const T = this.terrain, exag = this.exag, m = this._m, el = m.elements; let ns = 0, nb = 0;
      const focal = 1 / Math.tan((fov || 50) * D2R / 2) * (window.innerHeight || 900) / 2;      // pixels to a radian, about
      const sh = this.shadow, she = sh ? sh.instanceMatrix.array : null;
      for (const h of this.herds) {
        const sp = SP[h.kind], k = Math.max(h.k, this.kEye);
        // finely or coarsely, by how long its beasts are in the picture
        let lod = 1; if (eye) { const b0 = h.beasts[0], dM = GEO.toVec(h.lon, h.lat, this._v).multiplyScalar(1 + (b0 ? b0.hg : 0) * exag / R_M).distanceTo(eye) * R_M; const px = (sp.L * 1.6 * k) / Math.max(1, dM) * focal; if (px < 1) continue; lod = px * this.lodK > FINE_PX ? 0 : px * this.lodK > SPECK_PX ? 1 : 2; }      // (a herd too far to make out is not drawn)
        const I = this.meshOf(h.kind, lod);
        // the herd drifts over the days, slowly, wandering about its place (a tenth of a metre a second, as drawn k times the true pace)
        const A = h.still ? 0 : h.spread * 1.1, w = 0.1 / Math.max(1, A), hcx = A * Math.sin(t * w + h.drift), hcz = A * Math.sin(t * w * 0.77 + h.drift * 2.3);
        for (const b of h.beasts) {
          // graze, then now and then walk a little way to better grass, keeping with the herd
          if (b.walk < 0.5) { b.rest -= dt; if (b.rest <= 0) { const a = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * h.spread; b.tx = Math.cos(a) * r; b.tz = Math.sin(a) * r; b.walk = 1; } }
          if (b.walk >= 0.5) {
            const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz), v = (sp.L > 3 ? 1.1 : 1.3) * dt;
            if (d <= v) { b.x = b.tx; b.z = b.tz; b.walk = 0.49; b.rest = 4 + Math.random() * 18; }
            else { b.x += dx / d * v; b.z += dz / d * v; const want = Math.atan2(dz, dx); let dy = want - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); b.yaw += clamp(dy, -2 * dt, 2 * dt); }
          } else b.walk = Math.max(0, b.walk - dt * 2);
          const gait = b.walk >= 0.5 ? 1 : b.walk * 2;
          const x = (b.x + hcx) * k, z = (b.z + hcz) * k; const lon = h.lon + x / (R_M * h.cl * D2R), lat = h.lat + z / (R_M * D2R);
          if (Math.abs(x - b.hx) + Math.abs(z - b.hz) > 2 * k || b.hv !== T.meshVersion) { b.hg = Math.max(0, T.meshHeightAt(lon, lat, this._vc)); b.wet = !!(T.isWater && T.isWater(lon, lat)); b.hx = x; b.hz = z; b.hv = T.meshVersion; }
          if (b.wet) continue;      // (a herd that has wandered to a shore: those in the water are not drawn)
          const idx = I.n; if (idx >= CAP) continue; I.n = idx + 1;
          const lo = lon * D2R, la = lat * D2R; const slo = Math.sin(lo), clo = Math.cos(lo), sla = Math.sin(la), cla = Math.cos(la);
          const Ex = -slo, Ez = -clo; const Nx = -sla * clo, Ny = cla, Nz = sla * slo; const Ux = cla * clo, Uy = sla, Uz = -cla * slo;
          const fx = Math.cos(b.yaw), fz = Math.sin(b.yaw), s = k / R_M, rr = 1 + b.hg * exag / R_M;
          el[0] = (fx * Ex + fz * Nx) * s; el[1] = (fz * Ny) * s; el[2] = (fx * Ez + fz * Nz) * s; el[3] = 0;
          el[4] = Ux * s; el[5] = Uy * s; el[6] = Uz * s; el[7] = 0;
          el[8] = (fz * Ex - fx * Nx) * s; el[9] = (-fx * Ny) * s; el[10] = (fz * Ez - fx * Nz) * s; el[11] = 0;
          el[12] = Ux * rr; el[13] = Uy * rr; el[14] = Uz * rr; el[15] = 1;
          I.mesh.setMatrixAt(idx, m); const c = b.col, ca = I.mesh.instanceColor.array, q = b.shade;
          ca[idx * 3] = ((c >> 16) & 255) / 255 * q; ca[idx * 3 + 1] = ((c >> 8) & 255) / 255 * q; ca[idx * 3 + 2] = (c & 255) / 255 * q;
          I.walk.setXY(idx, b.ph, h.still ? -1 : gait); nb++;
          // its shadow: half its length forward, the body's height up, half its width (and a little for the legs) to the side
          if (sh && ns < CAP * 4) { const hl = sp.L * 0.72 * k / R_M, hb = sp.S * 0.72 * k / R_M, hw = sp.W * 0.62 * k / R_M, o = ns * 16;
            she[o] = (fx * Ex + fz * Nx) * hl; she[o + 1] = (fz * Ny) * hl; she[o + 2] = (fx * Ez + fz * Nz) * hl; she[o + 3] = 0;
            she[o + 4] = Ux * hb; she[o + 5] = Uy * hb; she[o + 6] = Uz * hb; she[o + 7] = 0;
            she[o + 8] = (fz * Ex - fx * Nx) * hw; she[o + 9] = (-fx * Ny) * hw; she[o + 10] = (fz * Ez - fx * Nz) * hw; she[o + 11] = 0;
            she[o + 12] = Ux * rr; she[o + 13] = Uy * rr; she[o + 14] = Uz * rr; she[o + 15] = 1; ns++; }
        }
      }
      for (const k in this.inst) for (const I of this.inst[k]) if (I) { const c = I.n; I.mesh.count = c; I.mesh.visible = c > 0; GEO.touch(I.mesh.instanceMatrix, c); GEO.touch(I.mesh.instanceColor, c); GEO.touch(I.walk, c); }
      if (sh) { sh.count = ns; sh.visible = ns > 0; GEO.touch(sh.instanceMatrix, ns); }
      this.stats = { herds: this.herds.length, beasts: nb };
    }
  }

  // ---------- birds ----------
  // A bird: a body of rounded pieces and two flat wings, each beating about its root at the body's side (aPart.x 7 the left wing, 8 the
  // right; aPart.y how far out the root is, aPart.z how fast the wings beat). True metres; drawn kB times life size.
  const BIRDS = {
    goose:    { span: 1.6, len: 0.8, neck: 0.3, beat: 9, tip: 0.35, col: [0x77715f, 0x6b6656, 0x837b69] },                 // the greylag: grey-brown, dark tips
    gull:     { span: 1.3, len: 0.55, neck: 0.06, beat: 7, tip: 0.25, wing: 0.72, col: [0xeceae6] },                         // white, a grey back, black tips
    crow:     { span: 0.95, len: 0.45, neck: 0.04, beat: 11, col: [0x1b1b1e, 0x232326] },
    vulture:  { span: 2.6, len: 0.95, neck: 0.12, beat: 4, tip: 0.6, col: [0x3d3026, 0x4a3a2c, 0x56483a] },
    starling: { span: 0.4, len: 0.2, neck: 0.02, beat: 16, col: [0x17171a] },
  };
  const BKINDS = Object.keys(BIRDS);
  function birdGeometry(o) {
    const s = new Sculpt(false); s.reach = 0.001; const L = o.len, sp = o.span, ch = sp * 0.18, root = L * 0.12;
    s.e([0, 0, 0], [L * 0.42, L * 0.13, L * 0.14], 0, 0, 0, null, 1);                                                    // the body
    if (o.neck > 0.1) s.seg([L * 0.32, 0.01], [L * 0.32 + o.neck, 0.04], L * 0.06, L * 0.06, 0, null, 1);           // a long neck
    s.e([L * 0.36 + o.neck, 0.04, 0], [L * 0.11, L * 0.08, L * 0.08], 0, 0, 0, null, o.neck > 0.1 ? 0.45 : 1);       // the head
    // the tail, flat, and the wings: an inner part as deep as the body is long and an outer one tapering to the tip; each a face up and a face
    // down, wound so that the one seen is the one turned to the eye
    const P = s.pos, N = s.nor, A = s.part; const tri = (a, b, c, id, sh) => { if ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) < 0) { const t = b; b = c; c = t; } for (const up of [1, -1]) { const q = up > 0 ? [a, b, c] : [a, c, b]; for (const v of q) { P.push(v[0], v[1] + up * 0.003, v[2]); N.push(0, up, 0); A.push(id, root, o.beat, sh); } } };
    tri([-L * 0.3, 0, -L * 0.08], [-L * 0.62, 0, -L * 0.14], [-L * 0.62, 0, L * 0.14], 0, 1); tri([-L * 0.3, 0, -L * 0.08], [-L * 0.62, 0, L * 0.14], [-L * 0.3, 0, L * 0.08], 0, 1);
    for (const z of [-1, 1]) {
      const id = z < 0 ? 7 : 8, mid = sp * 0.27, tipS = o.tip ? 0.3 : 1, wsh = o.wing || 1;
      const a = [ch * 0.45, 0, z * root], b = [ch * 0.5, 0, z * mid], c = [-ch * 0.55, 0, z * mid], d = [-ch * 0.6, 0, z * root];
      const e = [ch * 0.25, 0, z * sp * 0.5], f = [-ch * 0.1, 0, z * sp * 0.5];
      tri(a, b, c, id, wsh); tri(a, c, d, id, wsh); tri(b, e, f, id, o.tip ? tipS : wsh); tri(b, f, c, id, o.tip ? tipS : wsh);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 4));
    return g;
  }
  const BVERT = `
    attribute vec4 aPart; attribute vec2 aWing;      // aWing: the beat's phase, how hard the wings beat (0: they are held out to glide)
    uniform float uTime; varying vec3 vN, vCol, vView, vLocal; varying float vShade, vSeed;
    ${AIR_V}
    void main() {
      vec3 p = position, n = normal; float id = aPart.x;
      if (id > 6.5) {
        float side = id > 7.5 ? 1.0 : -1.0, a = (sin(uTime * aPart.z + aWing.x * 6.2832) * 0.85 * aWing.y + 0.1) * side, c = cos(a), s = sin(a), hz = side * aPart.y;
        vec2 q = vec2(p.z - hz, p.y); p.z = hz + q.x * c - q.y * s; p.y = q.x * s + q.y * c; vec2 m = vec2(n.z * c - n.y * s, n.z * s + n.y * c); n.z = m.x; n.y = m.y;
      }
      vShade = aPart.w; vSeed = aWing.x; vCol = instanceColor; vLocal = position;
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vView = mv.xyz;
      vN = normalize(normalMatrix * (mat3(instanceMatrix) * n));
      air(mv.xyz, ${AIR_N}, vAirT, vAirL);
      gl_Position = projectionMatrix * mv;
    }`;
  const B_CAP = 600;
  class Flocks {
    constructor({ scene, terrain, world }) {
      this.scene = scene; this.terrain = terrain; this.world = world; this.exag = terrain.exag; this.enabled = true;
      const bu = world.bUniforms; this.uni = { uSunV: bu.uSunV, uUpV: bu.uUpV, uDay: bu.uDay, uSunCol: bu.uSunCol, uDusk: bu.uDusk, uTime: { value: 0 } };
      if (window.AIR) Object.assign(this.uni, AIR.uniforms); if (window.SHADOWS) Object.assign(this.uni, SHADOWS.uniforms);
      this.mat = new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: BVERT, fragmentShader: FRAG });
      this.inst = {}; this.flocks = []; this.next = 0; this._m = new THREE.Matrix4(); this.stats = { flocks: 0, birds: 0 }; this.extra = null; this.budget = 1;
    }
    meshOf(kind) {
      if (this.inst[kind]) return this.inst[kind];
      const g = birdGeometry(BIRDS[kind]); const wing = new THREE.InstancedBufferAttribute(new Float32Array(B_CAP * 2), 2); wing.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aWing', wing);
      const m = new THREE.InstancedMesh(g, this.mat, B_CAP); m.count = 0; m.visible = false; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(B_CAP * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m); return (this.inst[kind] = { mesh: m, wing, n: 0 });
    }
    clear() { for (const k in this.inst) { const I = this.inst[k]; I.mesh.count = 0; I.mesh.visible = false; } this.flocks = []; this.stats = { flocks: 0, birds: 0 }; }
    // what flies here now: a place near the eye, the season (0 midwinter in the north), the light
    choose(sim, lon, lat, season, day, dusk) {
      const T = this.terrain; if (day < 0.25 && dusk < 0.2) return null;
      const cell = Math.floor((90 - lat) / 180 * H) * W + (((Math.floor((lon + 180) / 360 * W)) % W) + W) % W;
      const wet = T.isWater && T.isWater(lon, lat), shore = T.shoreAt ? T.shoreAt(lon, lat) : null;
      const cls = sim.landClass ? sim.landClass(cell) : -1, p = sim.pop[cell] || 0, o = sim.owner[cell], cv = o >= 0 ? sim.civs[o] : null, ct = continent(lon, lat);
      const spring = season > 0.17 && season < 0.36, autumn = season > 0.7 && season < 0.86, nh = lat > 0;
      const opts = [];
      if (wet || (shore !== null && shore < 2500)) opts.push(['gull', 'wheel', 3]);
      if (!wet && (spring || autumn) && Math.abs(lat) > 25 && Math.abs(lat) < 72 && ct !== 4 && nh) opts.push(['goose', 'skein', 2.5]);
      if (!wet && cls >= 2) {
        if (p > 0.2 || (cv && sim.level[cell])) opts.push(['crow', 'cross', 2]);
        if ((cls === 10 || cls === 5 || cls === 4 || cls === 13 || cls === 12 || cls === 8) && p < 2) opts.push(['vulture', 'soar', 2]);
        if (dusk > 0.25 && (season > 0.72 || season < 0.12) && nh && lat > 35 && lat < 62 && (cls === 7 || cls === 14 || cls === 6 || cls === 8) && p > 0.1) opts.push(['starling', 'cloud', 6]);
      }
      if (!opts.length) return null; let sum = 0; for (const x of opts) sum += x[2]; let r = Math.random() * sum; for (const x of opts) { r -= x[2]; if (r <= 0) return x; } return opts[0];
    }
    spawn(sim, cam, season, day, dusk) {
      const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * 3.5, cl = Math.max(0.2, Math.cos(cam.lat * D2R));
      const lon = cam.lon + Math.cos(a) * d / 111 / cl, lat = cam.lat + Math.sin(a) * d / 111;
      const c = this.choose(sim, lon, lat, season, day, dusk); if (!c) return;
      this.flocks.push(this.flock(c[0], c[1], lon, lat, season));
    }
    // a flock: where it is (an anchor and its offset, true metres east and north), how high it flies (metres above the ground, as drawn), its birds
    flock(kind, mode, lon, lat, season) {
      const B = BIRDS[kind], f = { kind, mode, lon, lat, cl: Math.max(0.2, Math.cos(lat * D2R)), x: 0, z: 0, t0: performance.now() / 1000, life: 70 + Math.random() * 80, birds: [], g: 0, gT: -1e9, fade: 0 };
      const R = () => Math.random();
      if (mode === 'skein') {      // geese in their V, going north in spring and south in autumn, across the eye's ground
        const n = 9 + Math.floor(R() * 22), north = season < 0.5; f.head = (north ? Math.PI / 2 : -Math.PI / 2) + (R() - 0.5) * 0.9; f.v = 16; f.h = 260 + R() * 260;
        f.x = -Math.cos(f.head) * 5000; f.z = -Math.sin(f.head) * 5000; f.life = 900;      // (it comes in from beyond the eye's ground and leaves it)
        for (let i = 0; i < n; i++) { const row = Math.ceil(i / 2), side = i === 0 ? 0 : (i % 2 ? 1 : -1); f.birds.push({ fx: -row * 2.2 + (R() - 0.5) * 0.4, fz: side * row * 1.7 + (R() - 0.5) * 0.4, fy: (R() - 0.5) * 0.8, ph: R(), amp: 1, col: B.col[Math.floor(R() * B.col.length)] }); }
      } else if (mode === 'wheel' || mode === 'soar') {      // gulls wheeling over a shore; vultures circling high on a warm updraught
        const n = mode === 'wheel' ? 3 + Math.floor(R() * 9) : 2 + Math.floor(R() * 6); f.h = mode === 'wheel' ? 50 + R() * 70 : 300 + R() * 350;
        for (let i = 0; i < n; i++) f.birds.push({ cx: (R() - 0.5) * 30, cz: (R() - 0.5) * 30, r: (mode === 'wheel' ? 8 : 20) + R() * (mode === 'wheel' ? 20 : 40), w: (R() < 0.5 ? 1 : -1), ph: R(), a0: R() * 6.2832, dh: (R() - 0.5) * (mode === 'wheel' ? 40 : 120), amp: 0, col: B.col[Math.floor(R() * B.col.length)] });
      } else if (mode === 'cross') {      // crows going over from field to field, a loose band
        const n = 4 + Math.floor(R() * 14); f.head = R() * 6.2832; f.v = 11; f.h = 30 + R() * 50; f.x = -Math.cos(f.head) * 600; f.z = -Math.sin(f.head) * 600;
        for (let i = 0; i < n; i++) f.birds.push({ fx: (R() - 0.5) * 25, fz: (R() - 0.5) * 15, fy: (R() - 0.5) * 6, ph: R(), amp: 1, col: B.col[Math.floor(R() * B.col.length)] });
      } else {      // starlings gathering at dusk, a cloud that folds and turns
        const n = 420 + Math.floor(R() * 320); f.h = 90 + R() * 70;
        for (let i = 0; i < n; i++) { let u, v, w; do { u = R() * 2 - 1; v = R() * 2 - 1; w = R() * 2 - 1; } while (u * u + v * v + w * w > 1); f.birds.push({ u, v, w, ph: R(), amp: 1, col: B.col[0] }); }
      }
      return f;
    }
    update(cam, sim, now, dt, season) {
      if (!sim || !this.enabled) { this.clear(); return; }
      const near = (cam.agl !== undefined ? cam.agl : cam.alt) * R_M < 12000 && cam.dist * R_M < 14000; if (!near) { if (this.flocks.length) this.clear(); return; }
      const t = now / 1000; this.uni.uTime.value = t; const day = this.uni.uDay.value, dusk = this.uni.uDusk.value;
      // flocks come now and then, up to a few at once, and go when their time is up or they are far from the eye
      const want = Math.round(4 * this.budget);
      this.flocks = this.flocks.filter((f) => { const dk = GEO.distKm(cam.lon, cam.lat, f.lon + f.x / (R_M * f.cl * D2R), f.lat + f.z / (R_M * D2R)); return t - f.t0 < f.life && dk < 9 && (f.mode === 'skein' || dk < 6); });
      if (this.extra) { for (const e of this.extra) this.flocks.push(this.flock(e.kind, e.mode, e.lon === undefined ? cam.lon + (e.dx || 0) : e.lon, e.lat === undefined ? cam.lat + (e.dy || 0) : e.lat, season)); this.extra = null; }      // (a flock asked for without a place: where the eye looks)
      if (this.flocks.length < want && t > this.next) { this.spawn(sim, cam, season === undefined ? 0.45 : season, day, dusk); this.next = t + 2 + Math.random() * 8; }
      this.kB = Math.max(8, Math.min(30, cam.dist * R_M / 150));      // (birds are small: drawn 8 to 30 times life size, by the eye's distance)
      this.animate(Math.min(0.1, dt || 0.016), t);
    }
    animate(dt, t) {
      for (const k in this.inst) this.inst[k].n = 0;
      const T = this.terrain, exag = this.exag, m = this._m, el = m.elements, kB = this.kB, hk = Math.max(1, kB / 8); let nb = 0;
      for (const f of this.flocks) {
        const B = BIRDS[f.kind], I = this.meshOf(f.kind), age = t - f.t0;
        if (f.v) { f.x += Math.cos(f.head) * f.v * kB * dt; f.z += Math.sin(f.head) * f.v * kB * dt; }
        const fl = f.lon + f.x / (R_M * f.cl * D2R), fa = f.lat + f.z / (R_M * D2R);
        if (t - f.gT > 1) { f.g = Math.max(0, T.meshHeightAt(fl, fa)); f.gT = t; }      // (the ground under the flock, now and then)
        const ins = Math.min(1, age / 4, (f.life - age) / 4);      // (it comes in and goes out: higher and away)
        for (const b of f.birds) {
          let x, z, y, yaw, bank = 0, amp = b.amp;
          if (f.mode === 'skein' || f.mode === 'cross') {
            const cy = Math.cos(f.head), sy = Math.sin(f.head), wob = Math.sin(t * 0.7 + b.ph * 20) * 0.6;
            x = f.x + (b.fx * cy - (b.fz + wob) * sy) * kB; z = f.z + (b.fx * sy + (b.fz + wob) * cy) * kB; y = f.h + b.fy * kB + Math.sin(t * 0.5 + b.ph * 9) * kB * 0.4; yaw = f.head;
            if (f.mode === 'cross') amp = Math.sin(t * 0.6 + b.ph * 13) > -0.4 ? 1 : 0;      // (a crow beats and glides by turns)
          } else if (f.mode === 'wheel' || f.mode === 'soar') {
            const v = f.mode === 'wheel' ? 8 : 10, om = v / b.r * b.w, a = b.a0 + om * t;
            x = f.x + (b.cx + Math.cos(a) * b.r) * kB; z = f.z + (b.cz + Math.sin(a) * b.r) * kB; y = f.h + b.dh * Math.sin(t * 0.13 + b.ph * 7);
            yaw = a + b.w * Math.PI / 2; bank = 0.35 * b.w;
            amp = f.mode === 'wheel' ? (Math.sin(t * 0.45 + b.ph * 17) > 0.55 ? 0.9 : 0) : 0;      // (a gull beats its wings now and then; a vulture glides)
          } else {
            const th = t * 0.17 + f.lat, s1 = 1 + 0.55 * Math.sin(t * 0.31 + b.v * 2.1), s2 = 1 + 0.45 * Math.sin(t * 0.23 + b.u * 2.7), A = 40 + 4 * kB;
            const ux = b.u * s1 * 1.6 + 0.4 * Math.sin(t * 0.4 + b.w * 2), uz = b.w * s2, cth = Math.cos(th), sth = Math.sin(th);
            x = f.x + (ux * cth - uz * sth) * A; z = f.z + (ux * sth + uz * cth) * A; y = f.h + b.v * A * 0.45 * (1 + 0.4 * Math.sin(t * 0.37 + b.u * 3)); yaw = th + Math.PI / 2;
          }
          y = f.g * exag + (y * ins + (1 - ins) * 300) * hk;      // (the ground is drawn twice as tall: the flock keeps its height over it; and flies higher as it is
          // drawn larger, over the roofs of towns drawn many times larger than life)
          const lon = f.lon + x / (R_M * f.cl * D2R), lat = f.lat + z / (R_M * D2R);
          const idx = I.n; if (idx >= B_CAP) break; I.n = idx + 1;
          const lo = lon * D2R, la = lat * D2R; const slo = Math.sin(lo), clo = Math.cos(lo), sla = Math.sin(la), cla = Math.cos(la);
          const Ex = -slo, Ez = -clo; const Nx = -sla * clo, Ny = cla, Nz = sla * slo; const Ux = cla * clo, Uy = sla, Uz = -cla * slo;
          const fx = Math.cos(yaw), fz = Math.sin(yaw), s = kB / R_M, rr = 1 + y / R_M, cb = Math.cos(bank), sb = Math.sin(bank);
          const Fx = fx * Ex + fz * Nx, Fy = fz * Ny, Fz = fx * Ez + fz * Nz, Sx = fz * Ex - fx * Nx, Sy = -fx * Ny, Sz = fz * Ez - fx * Nz;
          el[0] = Fx * s; el[1] = Fy * s; el[2] = Fz * s; el[3] = 0;
          el[4] = (Ux * cb + Sx * sb) * s; el[5] = (Uy * cb + Sy * sb) * s; el[6] = (Uz * cb + Sz * sb) * s; el[7] = 0;
          el[8] = (Sx * cb - Ux * sb) * s; el[9] = (Sy * cb - Uy * sb) * s; el[10] = (Sz * cb - Uz * sb) * s; el[11] = 0;
          el[12] = Ux * rr; el[13] = Uy * rr; el[14] = Uz * rr; el[15] = 1;
          I.mesh.setMatrixAt(idx, m); const c = b.col, ca = I.mesh.instanceColor.array;
          ca[idx * 3] = ((c >> 16) & 255) / 255; ca[idx * 3 + 1] = ((c >> 8) & 255) / 255; ca[idx * 3 + 2] = (c & 255) / 255;
          I.wing.setXY(idx, b.ph, amp); nb++;
        }
      }
      for (const k in this.inst) { const I = this.inst[k], c = I.n; I.mesh.count = c; I.mesh.visible = c > 0; GEO.touch(I.mesh.instanceMatrix, c); GEO.touch(I.mesh.instanceColor, c); GEO.touch(I.wing, c); }
      this.stats = { flocks: this.flocks.length, birds: nb };
    }
  }
  window.FAUNA = { Fauna, Flocks, SP, KINDS, BIRDS, wildOf, keptOf, continent };
})();
