// GENESIS building kit: unit-sized procedural archetypes (footprint 1x1, height 1, origin at ground centre) and the
// material shader that dresses them by wall/roof material, culture and era. Classic script; exposes window.BKIT.
(function () {
  const R_M = 6371000;
  // ---------- geometry helpers ----------
  function nonIdx(g) { return g.index ? g.toNonIndexed() : g; }
  function merge(list) {
    const geos = list.map(nonIdx); let n = 0; for (const x of geos) n += x.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
    for (const x of geos) { if (!x.attributes.normal) x.computeVertexNormals(); pos.set(x.attributes.position.array, o * 3); nor.set(x.attributes.normal.array, o * 3); o += x.attributes.position.count; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return g;
  }
  const box = (w, h, d, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g; };
  const cyl = (rt, rb, h, seg, x = 0, y = 0, z = 0) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y + h / 2, z); return g; };
  const cone = (r, h, seg, x = 0, y = 0, z = 0, rotY = 0) => { const g = new THREE.ConeGeometry(r, h, seg); if (rotY) g.rotateY(rotY); g.translate(x, y + h / 2, z); return g; };
  const dome = (r, x = 0, y = 0, z = 0, sy = 1) => { const g = new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, sy, 1); g.translate(x, y, z); return g; };
  const onionDome = (r, x = 0, y = 0, z = 0) => { const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12; const rr = r * Math.sin(t * Math.PI * 0.86) * (1 + 0.28 * Math.sin(t * Math.PI)); pts.push(new THREE.Vector2(Math.max(rr, 0.001), t * r * 1.9)); } const g = new THREE.LatheGeometry(pts, 14); g.translate(x, y, z); return g; };
  // triangular prism roof: ridge along x at height h, eaves at y=0, spanning z in [-d/2, d/2], x in [-w/2, w/2]
  function gableRoof(w, h, d, x = 0, y = 0, z = 0) {
    const hw = w / 2, hd = d / 2;
    const v = [-hw, 0, hd, hw, 0, hd, hw, h, 0, -hw, 0, hd, hw, h, 0, -hw, h, 0, hw, 0, -hd, -hw, 0, -hd, -hw, h, 0, hw, 0, -hd, -hw, h, 0, hw, h, 0, -hw, 0, -hd, -hw, 0, hd, -hw, h, 0, hw, 0, hd, hw, 0, -hd, hw, h, 0];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); g.translate(x, y, z); return g;
  }
  // hipped roof: ridge along x shortened by 'hip' on each end
  function hipRoof(w, h, d, hip, x = 0, y = 0, z = 0) {
    const hw = w / 2, hd = d / 2, rw = Math.max(0, hw - hip);
    const q = (a, b, c) => { v.push(...a, ...b, ...c); };
    const v = [];
    const A = [-hw, 0, hd], B = [hw, 0, hd], C = [hw, 0, -hd], D = [-hw, 0, -hd], E = [-rw, h, 0], F = [rw, h, 0];
    q(A, B, F); q(A, F, E);          // front slope
    q(C, D, E); q(C, E, F);          // back slope
    q(D, A, E);                       // left hip
    q(B, C, F);                       // right hip
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); g.translate(x, y, z); return g;
  }
  // east-asian roof: concave slopes with upturned eaves (two segments per slope), ridge along x
  function curvedRoof(w, h, d, x = 0, y = 0, z = 0) {
    const hw = w / 2, hd = d / 2, mz = hd * 0.5, mh = h * 0.32;
    const v = []; const q = (a, b, c) => { v.push(...a, ...b, ...c); };
    const slope = (sgn) => { const A = [-hw * 1.08, 0.06 * h, sgn * hd * 1.12], B = [hw * 1.08, 0.06 * h, sgn * hd * 1.12], M1 = [-hw * 1.0, mh, sgn * mz], M2 = [hw * 1.0, mh, sgn * mz], E = [-hw * 0.9, h, 0], F = [hw * 0.9, h, 0]; if (sgn > 0) { q(A, B, M2); q(A, M2, M1); q(M1, M2, F); q(M1, F, E); } else { q(B, A, M1); q(B, M1, M2); q(M2, M1, E); q(M2, E, F); } };
    slope(1); slope(-1);
    // gable ends
    q([-hw * 1.08, 0.06 * h, -hd * 1.12], [-hw * 1.08, 0.06 * h, hd * 1.12], [-hw * 0.9, h, 0]); q([hw * 1.08, 0.06 * h, hd * 1.12], [hw * 1.08, 0.06 * h, -hd * 1.12], [hw * 0.9, h, 0]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); g.translate(x, y, z); return g;
  }
  const pyramid = (w, h, d, x = 0, y = 0, z = 0) => { const g = new THREE.ConeGeometry(0.7071, h, 4); g.rotateY(Math.PI / 4); g.scale(w, 1, d); g.translate(x, y + h / 2, z); return g; };
  const merlons = (w, d, y, hgt, n) => { const out = []; for (let k = 0; k < n; k++) { const t = -w / 2 + (k + 0.5) * (w / n); out.push(box(w / n * 0.5, hgt, 0.08, t, y, d / 2 - 0.04)); out.push(box(w / n * 0.5, hgt, 0.08, t, y, -d / 2 + 0.04)); } return out; };
  const ring = (rOut, rIn, h, seg, x = 0, y = 0, z = 0, hTop) => { const pts = [new THREE.Vector2(rIn, 0), new THREE.Vector2(rOut, 0), new THREE.Vector2(rOut, hTop !== undefined ? hTop : h), new THREE.Vector2(rIn, h), new THREE.Vector2(rIn, 0)]; const g = new THREE.LatheGeometry(pts, seg); g.translate(x, y, z); return g; };
  const columns = (n, r, h, x0, x1, z, y = 0) => { const out = []; for (let k = 0; k < n; k++) out.push(cyl(r, r, h, 6, x0 + (x1 - x0) * (n === 1 ? 0.5 : k / (n - 1)), y, z)); return out; };

  // ---------- archetypes ----------
  function makeKit() {
    const g = {};
    // houses
    g.hut = merge([cyl(0.5, 0.55, 0.5, 9), cone(0.66, 0.5, 9, 0, 0.5)]);
    g.tipi = merge([cone(0.55, 1, 8)]);
    g.longhouse = merge([box(1, 0.32, 1), gableRoof(1.06, 0.68, 1.12, 0, 0.32)]);
    g.stilt = merge([box(0.06, 0.32, 0.06, -0.4, 0, -0.4), box(0.06, 0.32, 0.06, 0.4, 0, -0.4), box(0.06, 0.32, 0.06, -0.4, 0, 0.4), box(0.06, 0.32, 0.06, 0.4, 0, 0.4), box(0.06, 0.32, 0.06, 0, 0, 0), box(1, 0.3, 1, 0, 0.32), gableRoof(1.1, 0.42, 1.16, 0, 0.6)]);
    g.adobe = merge([box(1, 0.86, 1), box(1.02, 0.14, 0.06, 0, 0.86, 0.48), box(1.02, 0.14, 0.06, 0, 0.86, -0.48), box(0.06, 0.14, 1.02, 0.48, 0.86), box(0.06, 0.14, 1.02, -0.48, 0.86), box(0.3, 0.1, 0.3, 0.2, 0.86, -0.15)]);
    g.pueblo = merge([box(1, 0.5, 1), box(0.65, 0.3, 0.7, -0.15, 0.5, 0.05), box(0.35, 0.2, 0.4, -0.25, 0.8, -0.1), box(0.05, 0.25, 0.05, 0.42, 0.5, 0.42)]);
    g.courtyard = merge([box(1, 0.7, 0.3, 0, 0, 0.35), box(1, 0.7, 0.3, 0, 0, -0.35), box(0.3, 0.7, 0.4, 0.35, 0, 0), box(0.3, 0.7, 0.4, -0.35, 0, 0), box(1.02, 0.12, 0.05, 0, 0.7, 0.49), box(1.02, 0.12, 0.05, 0, 0.7, -0.49), box(0.05, 0.12, 1.02, 0.49, 0.7), box(0.05, 0.12, 1.02, -0.49, 0.7), box(0.38, 0.22, 0.38, 0, 0, 0)]);
    g.courtyardc = merge([box(1, 0.5, 0.3, 0, 0, 0.35), curvedRoof(1.04, 0.34, 0.32, 0, 0.5, 0.35), box(1, 0.5, 0.3, 0, 0, -0.35), curvedRoof(1.04, 0.34, 0.32, 0, 0.5, -0.35), box(0.3, 0.45, 0.4, 0.35, 0, 0), box(0.3, 0.45, 0.4, -0.35, 0, 0), box(1.02, 0.35, 0.03, 0, 0, 0.5), box(1.02, 0.35, 0.03, 0, 0, -0.5)]);
    g.domehouse = merge([box(1, 0.55, 1), dome(0.42, 0, 0.55, 0, 0.9)]);
    g.gable = merge([box(1, 0.6, 1), gableRoof(1.1, 0.4, 1.12, 0, 0.6), box(0.1, 0.22, 0.1, 0.3, 0.78, 0.2)]);
    g.hip = merge([box(1, 0.62, 1), hipRoof(1.12, 0.36, 1.12, 0.3, 0, 0.62), box(0.1, 0.18, 0.1, 0.25, 0.8, -0.2)]);
    g.curved = merge([box(1, 0.6, 1), curvedRoof(1.1, 0.4, 1.12, 0, 0.6)]);
    g.halftimber = merge([box(0.94, 0.34, 0.94), box(1, 0.3, 1.06, 0, 0.34), box(1.04, 0.24, 1.12, 0, 0.62), gableRoof(1.14, 0.42, 1.22, 0, 0.86, 0), box(0.1, 0.3, 0.1, -0.3, 0.95, 0.25)]);
    g.townhouse = merge([box(1, 0.66, 1), gableRoof(1.04, 0.34, 1.06, 0, 0.66), box(0.08, 0.2, 0.08, 0.35, 0.86, 0.3)]);
    g.mansard = merge([box(1, 0.6, 1), box(0.92, 0.26, 0.92, 0, 0.6), hipRoof(0.96, 0.14, 0.96, 0.2, 0, 0.86), box(0.08, 0.2, 0.08, 0.3, 0.86, -0.3), box(0.08, 0.2, 0.08, -0.3, 0.86, 0.3)]);
    g.palazzo = merge([box(1, 0.78, 1), box(1.06, 0.06, 1.06, 0, 0.78), hipRoof(1.08, 0.16, 1.08, 0.3, 0, 0.84), box(0.1, 0.16, 0.1, 0.35, 0.9, 0.35), box(0.1, 0.16, 0.1, -0.35, 0.9, -0.35)]);
    g.terrace = merge([box(1, 0.62, 1), gableRoof(1.02, 0.38, 1.1, 0, 0.62), box(0.06, 0.24, 0.1, -0.35, 0.78, 0), box(0.06, 0.24, 0.1, 0, 0.78, 0), box(0.06, 0.24, 0.1, 0.35, 0.78, 0)]);
    g.tenement = merge([box(1, 0.94, 1), box(1.06, 0.06, 1.06, 0, 0.94), box(0.3, 0.1, 0.3, 0.2, 0.94, 0.2)]);
    g.block = merge([box(1, 0.92, 1), box(0.4, 0.08, 0.4, 0.2, 0.92, -0.15), box(0.2, 0.06, 0.3, -0.25, 0.92, 0.2)]);
    // a pre-industrial block seen from afar: four roofs in a cluster
    g.blockold = merge([box(0.46, 0.62, 0.46, -0.26, 0, -0.26), gableRoof(0.5, 0.38, 0.5).translate(-0.26, 0.62, -0.26), box(0.46, 0.55, 0.46, 0.26, 0, -0.26), gableRoof(0.5, 0.36, 0.5).rotateY(Math.PI / 2).translate(0.26, 0.55, -0.26), box(0.46, 0.6, 0.46, -0.26, 0, 0.26), gableRoof(0.5, 0.36, 0.5).rotateY(Math.PI / 2).translate(-0.26, 0.6, 0.26), box(0.46, 0.66, 0.46, 0.26, 0, 0.26), gableRoof(0.5, 0.34, 0.5).translate(0.26, 0.66, 0.26)]);
    g.tower = merge([box(1, 0.96, 1), box(0.5, 0.04, 0.5, 0, 0.96)]);
    g.skyscraper = merge([box(1, 0.55, 1), box(0.78, 0.25, 0.78, 0, 0.55), box(0.56, 0.13, 0.56, 0, 0.8), cyl(0.02, 0.05, 0.07, 6, 0, 0.93)]);
    g.granary = merge([cyl(0.42, 0.46, 0.6, 9), cone(0.56, 0.4, 9, 0, 0.6)]);
    g.chimney = merge([cyl(0.35, 0.5, 1, 8)]);
    g.barn = merge([box(1, 0.5, 1), gableRoof(1.08, 0.5, 1.1, 0, 0.5)]);
    g.warehouse = merge([box(1, 0.7, 1), gableRoof(0.5, 0.3, 1.04, -0.25, 0.7), gableRoof(0.5, 0.3, 1.04, 0.25, 0.7)]);
    g.windmill = merge([cyl(0.28, 0.42, 0.6, 8), cone(0.34, 0.16, 8, 0, 0.6), box(0.06, 0.9, 0.03, 0, 0.2, 0.36), box(0.9, 0.06, 0.03, 0, 0.62, 0.36)]);
    g.turbine = merge([cyl(0.05, 0.1, 0.72, 6), box(0.16, 0.08, 0.1, 0, 0.72, 0.02), box(0.03, 0.56, 0.015, 0, 0.76, 0.08), box(0.5, 0.03, 0.015, -0.24, 0.76, 0.08), box(0.5, 0.03, 0.015, 0.24, 0.76, 0.08)]);
    g.lamp = merge([cyl(0.5, 0.6, 0.9, 5), box(1.2, 0.5, 1.2, 0, 0.9)]);
    g.stall = merge([box(0.08, 0.6, 0.08, -0.42, 0, -0.42), box(0.08, 0.6, 0.08, 0.42, 0, -0.42), box(0.08, 0.6, 0.08, -0.42, 0, 0.42), box(0.08, 0.6, 0.08, 0.42, 0, 0.42), box(1, 0.2, 1, 0, 0.3), gableRoof(1.1, 0.3, 1.1, 0, 0.7)]);
    g.well = merge([cyl(0.5, 0.5, 0.45, 8), box(0.06, 1, 0.06, -0.4, 0, 0), box(0.06, 1, 0.06, 0.4, 0, 0), gableRoof(1, 0.3, 0.9, 0, 0.75)]);
    g.fountain = merge([cyl(0.5, 0.5, 0.25, 12), cyl(0.06, 0.08, 0.6, 6, 0, 0.25), cyl(0.26, 0.2, 0.06, 10, 0, 0.6), cyl(0.05, 0.06, 0.34, 6, 0, 0.66)]);
    g.statue = merge([box(0.6, 0.35, 0.6), box(0.4, 0.3, 0.4, 0, 0.35), box(0.18, 0.35, 0.14, 0, 0.65)]);
    g.obelisk = merge([box(0.7, 0.1, 0.7), cyl(0.08, 0.2, 0.84, 4, 0, 0.1), cone(0.09, 0.06, 4, 0, 0.94)]);
    g.pier = merge([box(1, 0.6, 1, 0, 0.4), box(0.08, 1, 0.08, -0.4, 0, -0.35), box(0.08, 1, 0.08, 0, 0, -0.35), box(0.08, 1, 0.08, 0.4, 0, -0.35), box(0.08, 1, 0.08, -0.4, 0, 0.35), box(0.08, 1, 0.08, 0, 0, 0.35), box(0.08, 1, 0.08, 0.4, 0, 0.35)]);
    g.boat = merge([box(1, 0.35, 1), cone(0.5, 0.35, 4, 0.6, 0, 0, Math.PI / 4), box(0.04, 1, 0.04, 0.05, 0.35, 0)]);
    g.ship = merge([box(1, 0.45, 1), box(0.4, 0.35, 0.7, -0.15, 0.45), cyl(0.04, 0.05, 0.4, 6, -0.05, 0.8), box(0.03, 0.55, 0.03, 0.3, 0.45)]);
    // movers
    g.car = merge([box(1, 0.4, 1, 0, 0.12), box(0.55, 0.3, 0.86, -0.05, 0.52), box(0.16, 0.12, 0.16, -0.3, 0, -0.42), box(0.16, 0.12, 0.16, 0.3, 0, -0.42), box(0.16, 0.12, 0.16, -0.3, 0, 0.42), box(0.16, 0.12, 0.16, 0.3, 0, 0.42)]);
    g.cart = merge([box(0.55, 0.3, 0.9, -0.2, 0.3), cyl(0.28, 0.28, 0.08, 8, -0.2, 0.02, -0.5).rotateX(Math.PI / 2).translate(0, 0.28, 0), cyl(0.28, 0.28, 0.08, 8, -0.2, 0.02, 0.5).rotateX(Math.PI / 2).translate(0, 0.28, 0), box(0.4, 0.55, 0.3, 0.3, 0, 0), box(0.14, 0.2, 0.2, 0.55, 0.45, 0)]);
    g.plane = merge([cyl(0.045, 0.045, 1, 8).rotateZ(Math.PI / 2).translate(0, 0.08, 0), box(0.16, 0.02, 0.9, -0.05, 0.07, 0), box(0.12, 0.02, 0.3, -0.42, 0.09, 0), box(0.1, 0.16, 0.02, -0.46, 0.08, 0), cone(0.045, 0.1, 8, 0.5, 0.08, 0).rotateZ(-Math.PI / 2).translate(0.55, 0.16, 0)]);
    g.train = merge([box(0.19, 0.9, 0.9, 0.4, 0, 0), box(0.19, 0.75, 0.85, 0.19, 0, 0), box(0.19, 0.75, 0.85, -0.02, 0, 0), box(0.19, 0.75, 0.85, -0.23, 0, 0), box(0.19, 0.75, 0.85, -0.44, 0, 0)]);
    // ruins, camps, siege
    // a collapsed house: one wall still standing, the rest a heap with timbers poking out
    g.rubble = merge([box(0.9, 0.08, 0.9), cone(0.5, 0.7, 7).scale(1.2, 1, 1).translate(-0.05, 0.08, 0.05), box(0.08, 0.95, 0.5, 0.42, 0, 0.05), box(0.3, 0.06, 0.06, -0.1, 0.5, -0.2).rotateZ(0.5), box(0.06, 0.06, 0.5, 0.1, 0.42, 0.1).rotateX(0.6), box(0.4, 0.2, 0.08, -0.25, 0, 0.44)]);
    g.wallstub = merge([box(1, 0.55, 1, 0, 0, 0), box(0.3, 0.45, 1.04, -0.35, 0.55), box(0.2, 0.2, 1.04, 0.3, 0.55)]);
    g.pillars = merge([cyl(0.06, 0.07, 1, 6, -0.4, 0, 0), cyl(0.06, 0.07, 0.7, 6, -0.13, 0, 0), cyl(0.06, 0.07, 1, 6, 0.13, 0, 0), cyl(0.06, 0.07, 0.45, 6, 0.4, 0, 0), box(1, 0.08, 0.3, 0, 0)]);
    g.tent = merge([cone(0.55, 1, 6).scale(1, 1, 0.8), box(0.9, 0.04, 0.9, 0, 0)]);
    g.bigtent = merge([box(1, 0.5, 1), gableRoof(1.1, 0.5, 1.1, 0, 0.5), box(0.04, 1.4, 0.04, 0, 0, 0)]);
    g.catapult = merge([box(0.5, 0.15, 0.9), box(0.08, 0.7, 0.08, 0, 0.15, -0.2).rotateX(-0.5).translate(0, 0.1, 0.1), box(0.6, 0.05, 0.05, 0, 0.7, 0.05)]);
    g.cannon = merge([cyl(0.09, 0.13, 1, 8).rotateZ(Math.PI / 2).translate(0.1, 0.4, 0), cyl(0.3, 0.3, 0.1, 10).rotateX(Math.PI / 2).translate(-0.2, 0.3, 0.32), cyl(0.3, 0.3, 0.1, 10).rotateX(Math.PI / 2).translate(-0.2, 0.3, -0.32)]);
    g.crane = merge([box(0.5, 0.1, 0.5), box(0.3, 0.9, 0.3, 0, 0.1), box(0.3, 0.08, 2.4, 0, 0.9, 0.4), box(0.1, 0.6, 0.1, 0, 0.98, 1.0)]);
    // scaffolding: an open frame of posts and ledgers that wraps a building while it goes up
    { const ms = []; const P = 0.05; for (const sx of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) ms.push(box(P, 1, P, sx, 0, sz)); for (const y of [0.3, 0.62, 0.94]) { ms.push(box(1 + P, P * 0.8, P * 0.8, 0, y, -0.5), box(1 + P, P * 0.8, P * 0.8, 0, y, 0.5), box(P * 0.8, P * 0.8, 1 + P, -0.5, y, 0), box(P * 0.8, P * 0.8, 1 + P, 0.5, y, 0)); } ms.push(box(0.3, 0.03, 0.3, 0, 0.98, 0)); g.scaffold = merge(ms); }
    // civic and landmarks
    { const ms = []; const nS = 12; for (let k = 0; k < nS; k++) { const a = k / nS * Math.PI * 2; const c = cyl(0.025, 0.035, 1, 5, Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45); c.rotateY(a); ms.push(c); } for (let k = 0; k < nS; k += 2) { const a = (k + 0.5) / nS * Math.PI * 2; ms.push(box(0.14, 0.05, 0.03, Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45)); } ms.push(cyl(0.03, 0.05, 0.6, 5, 0, 0, 0)); g.menhirs = merge(ms); }
    g.ziggurat = merge([box(1, 0.3, 1), box(0.74, 0.25, 0.74, 0, 0.3), box(0.5, 0.22, 0.5, 0, 0.55), box(0.28, 0.23, 0.28, 0, 0.77), box(0.12, 0.6, 0.28, 0.44, 0, 0.25)]);
    g.pyramid = merge([pyramid(1, 1, 1)]);
    g.steppyramid = merge([box(1, 0.2, 1), box(0.82, 0.18, 0.82, 0, 0.2), box(0.64, 0.16, 0.64, 0, 0.38), box(0.48, 0.14, 0.48, 0, 0.54), box(0.34, 0.12, 0.34, 0, 0.68), box(0.24, 0.2, 0.2, 0, 0.8), box(0.16, 0.86, 0.1, 0, 0, 0.5)]);
    g.temple = merge([box(1.1, 0.14, 1.1), box(0.72, 0.6, 0.86, 0, 0.14), ...columns(6, 0.045, 0.6, -0.45, 0.45, 0.48, 0.14), ...columns(6, 0.045, 0.6, -0.45, 0.45, -0.48, 0.14), ...columns(4, 0.045, 0.6, -0.48, 0.48, 0, 0.14).map(c => { c.rotateY(Math.PI / 2); return c; }), box(1.06, 0.08, 1.06, 0, 0.74), gableRoof(1.1, 0.18, 1.08, 0, 0.82)]);
    g.colosseum = merge([ring(0.5, 0.36, 1, 24, 0, 0, 0, 0.94), ring(0.36, 0.28, 0.35, 24), ring(0.2, 0.12, 0.08, 16)]);
    g.cathedral = merge([box(0.5, 0.55, 1), gableRoof(0.56, 0.22, 1.04, 0, 0.55), box(0.9, 0.5, 0.3, 0, 0, 0.05), gableRoof(0.94, 0.2, 0.34, 0, 0.5, 0.05).rotateY(Math.PI / 2).translate(0, 0, 0), box(0.16, 0.8, 0.16, -0.16, 0, -0.44), box(0.16, 0.8, 0.16, 0.16, 0, -0.44), cone(0.11, 0.2, 4, -0.16, 0.8, -0.44, Math.PI / 4), cone(0.11, 0.2, 4, 0.16, 0.8, -0.44, Math.PI / 4), cyl(0.02, 0.06, 0.5, 6, 0, 0.5, 0.05), dome(0.14, 0, 0.55, 0.05, 0.8)]);
    g.church = merge([box(0.6, 0.6, 1), gableRoof(0.66, 0.26, 1.04, 0, 0.6), box(0.22, 0.8, 0.22, 0, 0, -0.42), cone(0.16, 0.2, 4, 0, 0.8, -0.42, Math.PI / 4)]);
    g.basilica = merge([box(0.6, 0.5, 1), gableRoof(0.66, 0.16, 1.04, 0, 0.5), box(0.9, 0.42, 0.34, 0, 0, 0.08), cyl(0.28, 0.28, 0.22, 16, 0, 0.5, 0.08), dome(0.28, 0, 0.72, 0.08, 0.85), cyl(0.03, 0.03, 0.06, 6, 0, 0.95, 0.08), ...columns(6, 0.03, 0.42, -0.25, 0.25, -0.52, 0)]);
    g.mosque = merge([box(1, 0.5, 1), cyl(0.36, 0.36, 0.1, 16, 0, 0.5, 0), dome(0.36, 0, 0.6, 0, 0.9), cyl(0.04, 0.05, 1, 8, -0.44, 0, -0.44), cyl(0.04, 0.05, 1, 8, 0.44, 0, -0.44), cone(0.06, 0.08, 8, -0.44, 1, -0.44), cone(0.06, 0.08, 8, 0.44, 1, -0.44), box(0.3, 0.6, 0.06, 0, 0, 0.5), dome(0.1, -0.35, 0.5, 0.35, 0.8), dome(0.1, 0.35, 0.5, 0.35, 0.8)]);
    g.tajmosque = merge([box(1, 0.12, 1), box(0.66, 0.42, 0.66, 0, 0.12), cyl(0.3, 0.3, 0.16, 16, 0, 0.54), onionDome(0.3, 0, 0.7), cyl(0.035, 0.045, 0.9, 8, -0.46, 0.12, -0.46), cyl(0.035, 0.045, 0.9, 8, 0.46, 0.12, -0.46), cyl(0.035, 0.045, 0.9, 8, -0.46, 0.12, 0.46), cyl(0.035, 0.045, 0.9, 8, 0.46, 0.12, 0.46), dome(0.08, -0.26, 0.54, -0.26), dome(0.08, 0.26, 0.54, -0.26), dome(0.08, -0.26, 0.54, 0.26), dome(0.08, 0.26, 0.54, 0.26)]);
    g.mudmosque = merge([box(1, 0.55, 1), cone(0.16, 0.45, 4, -0.3, 0.55, 0, Math.PI / 4), cone(0.2, 0.55, 4, 0, 0.55, 0.1, Math.PI / 4), cone(0.16, 0.45, 4, 0.3, 0.55, 0, Math.PI / 4), box(0.06, 0.7, 0.06, 0.46, 0, 0.46), box(0.06, 0.7, 0.06, -0.46, 0, 0.46), box(0.06, 0.7, 0.06, 0.46, 0, -0.46), box(0.06, 0.7, 0.06, -0.46, 0, -0.46)]);
    g.onion = merge([box(0.62, 0.5, 1), gableRoof(0.68, 0.16, 1.04, 0, 0.5), cyl(0.16, 0.16, 0.24, 12, 0, 0.62, 0.1), onionDome(0.19, 0, 0.86, 0.1), box(0.2, 0.7, 0.2, 0, 0, -0.42), onionDome(0.12, 0, 0.72, -0.42), cyl(0.1, 0.1, 0.16, 10, -0.25, 0.62, 0.35), onionDome(0.12, -0.25, 0.78, 0.35), cyl(0.1, 0.1, 0.16, 10, 0.25, 0.62, 0.35), onionDome(0.12, 0.25, 0.78, 0.35)]);
    g.hall = merge([box(1.16, 0.18, 1.2), box(0.98, 0.5, 0.8, 0, 0.18), curvedRoof(1.1, 0.32, 0.96, 0, 0.68), ...columns(7, 0.025, 0.5, -0.46, 0.46, 0.44, 0.18)]);
    { const parts = [box(0.7, 0.16, 0.7)]; const tiers = 5; for (let t = 0; t < tiers; t++) { const y = 0.16 + t * 0.168; const sc = 1 - t * 0.14; parts.push(box(0.5 * sc, 0.12, 0.5 * sc, 0, y)); parts.push(curvedRoof(0.86 * sc, 0.06, 0.86 * sc, 0, y + 0.1)); } parts.push(cyl(0.015, 0.025, 0.16, 6, 0, 0.16 + tiers * 0.168)); g.pagoda = merge(parts); }
    g.stupa = merge([cyl(0.5, 0.5, 0.18, 16), cyl(0.4, 0.42, 0.14, 16, 0, 0.18), dome(0.4, 0, 0.32, 0, 0.9), box(0.14, 0.12, 0.14, 0, 0.68), cone(0.09, 0.2, 8, 0, 0.8)]);
    { const pts = []; for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(new THREE.Vector2(0.28 * Math.pow(1 - t, 0.55) + 0.01, t * 1)); } g.shikhara = merge([box(0.9, 0.12, 1), box(0.6, 0.3, 0.6, 0, 0.12, -0.15), new THREE.LatheGeometry(pts, 6).translate(0, 0.12, -0.15), box(0.5, 0.36, 0.3, 0, 0.12, 0.3), pyramid(0.56, 0.16, 0.36, 0, 0.48, 0.3)]); }
    g.stepped = merge([box(1, 0.3, 1), box(0.72, 0.28, 0.72, 0, 0.3), box(0.44, 0.26, 0.44, 0, 0.58), cone(0.12, 0.2, 8, 0, 0.84), cone(0.07, 0.14, 8, 0.25, 0.58, 0.25), cone(0.07, 0.14, 8, -0.25, 0.58, -0.25), cone(0.07, 0.14, 8, 0.25, 0.58, -0.25), cone(0.07, 0.14, 8, -0.25, 0.58, 0.25)]);
    g.mound = merge([cone(0.5, 1, 10).scale(1, 1, 0.8), box(0.3, 0.4, 0.3, 0, 0.7)]);
    g.palace = merge([box(1, 0.6, 1), box(0.3, 0.86, 0.5, 0, 0, 0), hipRoof(1.06, 0.2, 1.06, 0.3, 0, 0.6), hipRoof(0.36, 0.14, 0.56, 0.1, 0, 0.86), ...columns(9, 0.02, 0.6, -0.42, 0.42, 0.5, 0)]);
    g.keep = merge([box(1, 0.9, 1), ...merlons(1.02, 1.02, 0.9, 0.1, 6), box(0.02, 0.1, 1.02, 0.5, 0.9), box(0.02, 0.1, 1.02, -0.5, 0.9), box(0.2, 0.35, 0.2, 0.3, 0.9, 0.3)]);
    g.roundtower = merge([cyl(0.5, 0.52, 0.8, 10), cone(0.6, 0.2, 10, 0, 0.8)]);
    g.gatehouse = merge([box(0.24, 1, 1, -0.36), box(0.24, 1, 1, 0.36), box(0.5, 0.42, 0.9, 0, 0.58), ...merlons(0.24, 1.02, 1, 0.08, 2).map(m => m.translate(-0.36, 0, 0)), ...merlons(0.24, 1.02, 1, 0.08, 2).map(m => m.translate(0.36, 0, 0)), cone(0.17, 0.2, 4, -0.36, 1.06, 0, Math.PI / 4), cone(0.17, 0.2, 4, 0.36, 1.06, 0, Math.PI / 4)]);
    g.wall = merge([box(1, 0.86, 1), ...merlons(1.0, 1.0, 0.86, 0.14, 4)]);
    { const ps = []; for (let k = 0; k < 9; k++) ps.push(cyl(0.05, 0.05, 1, 4, -0.44 + k * 0.11, 0, 0)); ps.push(box(1, 0.06, 0.14, 0, 0.5)); g.palisade = merge(ps); }
    g.bastion = merge([new THREE.CylinderGeometry(0.5, 0.56, 1, 5).translate(0, 0.5, 0)]);
    g.station = merge([box(1, 0.55, 1), gableRoof(0.5, 0.25, 1.04, -0.25, 0.55), gableRoof(0.5, 0.25, 1.04, 0.25, 0.55), box(0.2, 1, 0.2, -0.4, 0, -0.4), cone(0.14, 0.2, 4, -0.4, 1, -0.4, Math.PI / 4)]);
    g.crystal = merge([box(1, 0.55, 1), box(0.3, 0.9, 0.3, 0, 0), gableRoof(1.02, 0.3, 1.04, 0, 0.55), dome(0.2, 0, 0.9, 0, 0.6)]);
    g.irontower = merge([cyl(0.02, 0.09, 0.62, 4, -0.34, 0, -0.34).rotateY(0), cyl(0.02, 0.09, 0.62, 4, 0.34, 0, -0.34), cyl(0.02, 0.09, 0.62, 4, -0.34, 0, 0.34), cyl(0.02, 0.09, 0.62, 4, 0.34, 0, 0.34), box(0.9, 0.04, 0.9, 0, 0.3), box(0.5, 0.04, 0.5, 0, 0.62), cyl(0.03, 0.12, 0.34, 4, 0, 0.62), box(0.14, 0.04, 0.14, 0, 0.94), cyl(0.008, 0.02, 0.06, 4, 0, 0.94)]);
    g.stadium = merge([ring(0.5, 0.36, 1, 28, 0, 0, 0, 0.75), ring(0.36, 0.3, 0.3, 28), ring(0.52, 0.5, 0.06, 28, 0, 1.0)]);
    g.spire = merge([box(1, 0.6, 1), box(0.7, 0.2, 0.7, 0, 0.6), box(0.42, 0.1, 0.42, 0, 0.8), cyl(0.005, 0.12, 0.1, 6, 0, 0.9)]);
    g.lighthouse = merge([cyl(0.28, 0.5, 0.8, 10), cyl(0.34, 0.3, 0.04, 10, 0, 0.8), cyl(0.2, 0.2, 0.12, 8, 0, 0.84), cone(0.26, 0.04, 8, 0, 0.96)]);
    g.factory = merge([box(1, 0.7, 1), gableRoof(0.34, 0.3, 1.04, -0.33, 0.7), gableRoof(0.34, 0.3, 1.04, 0, 0.7), gableRoof(0.34, 0.3, 1.04, 0.33, 0.7)]);
    return g;
  }

  // ---------- material shader ----------
  const VERT = `
    attribute vec4 aInfo;                 // era, seed, style (wall + roof*8 + culture*64 + flags*1024), representational scale (drawn size / true size)
    uniform float uMetres;                // scene units -> metres (R_M on the globe, 1 in the kit viewer)
    varying vec3 vN, vLN, vLocal, vScale, vCol, vInfo, vView;
    void main() {
      mat4 im = instanceMatrix;
      float rep = aInfo.w > 0.05 ? aInfo.w : 1.0;   // patterns (windows, courses, planks) stay at life size however big the town is drawn
      vScale = vec3(length(im[0].xyz), length(im[1].xyz), length(im[2].xyz)) * uMetres / rep;
      vLocal = position; vLN = normal;
      vN = normalize(normalMatrix * (mat3(im) * normal));
      vCol = instanceColor; vInfo = aInfo.xyz;
      vec4 mv = modelViewMatrix * im * vec4(position, 1.0); vView = mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    precision highp float;
    uniform vec3 uSunV, uUpV; uniform float uDay, uCamAlt, uTime;
    varying vec3 vN, vLN, vLocal, vScale, vCol, vInfo, vView;
    const vec3 LUM = vec3(0.299, 0.587, 0.114);
    #ifdef USE_TEXARR
    // generated materials (textures.js): 16 wall and 16 roof tiles, metres per tile and the mean colour of each
    precision highp sampler2DArray;
    uniform sampler2DArray uWallTex, uRoofTex; uniform float uWallM[16], uRoofM[16], uTexMix; uniform vec3 uWallMean[16], uRoofMean[16];
    // which tile a wall gets: material class, then culture, era and a little per-building variety (cultures: 0 med 1 north 2 east 3 mena 4 africa 5 sasia 6 easia 7 seasia 8 america 9 namerica)
    float wallLayer(float mat, float cul, float era, float landmark, float seed) {
      if (mat == 0.0) return (cul == 4.0 && seed > 0.35) ? 11.0 : 0.0;                                   // adobe; the Sahel builds in rammed earth
      if (mat == 1.0) return 1.0;                                                                           // lime plaster
      if (mat == 2.0) return 2.0;                                                                           // daub between the timbers
      if (mat == 3.0) {                                                                                     // stone
        if (landmark > 0.5) return (cul == 0.0 && era <= 4.0) ? 9.0 : (cul == 3.0 || cul == 4.0) ? 15.0 : 8.0;   // marble temples, sandstone in the desert, dressed ashlar elsewhere
        if (cul == 8.0) return 12.0; if (cul == 3.0 && seed > 0.5) return 15.0; return seed > 0.75 ? 8.0 : 3.0;
      }
      if (mat == 4.0) return ((cul == 0.0 || cul == 5.0) && seed > 0.4) ? 10.0 : 4.0;                      // red brick; yellow stock in the south
      if (mat == 5.0) return 5.0;
      if (mat == 6.0) return 6.0;
      return (cul == 9.0 && era >= 4.0) ? 13.0 : (era >= 5.0 && seed > 0.8) ? 14.0 : 7.0;                  // planks; clapboard in North America, the odd tin shack later
    }
    float roofLayer(float mat, float cul, float era, float landmark, float seed) {
      if (mat == 0.0) return (cul == 7.0 || cul == 4.0 || cul == 8.0) ? 12.0 : 0.0;                         // straw or palm thatch
      if (mat == 1.0) { if (cul == 1.0 || cul == 2.0 || cul == 9.0) return 8.0; if (cul == 0.0 && era <= 3.0) return 13.0; return 1.0; }   // plain tile in the north, Roman tile in antiquity, pan tile elsewhere
      if (mat == 2.0) return (cul == 0.0 && era >= 4.0 && seed > 0.6) ? 15.0 : 2.0;                         // slate, zinc on some mansards
      if (mat == 3.0) { if (era >= 7.0 && seed > 0.7) return 10.0; return era >= 5.0 ? 3.0 : 9.0; }           // flat: packed earth, then bitumen, then solar
      if (mat == 4.0) return 4.0;
      if (mat == 5.0) return (landmark > 0.5) ? 11.0 : 5.0;                                                  // glazed tile: green on temples, grey tube tile on houses
      if (mat == 6.0) return 6.0;
      return (landmark > 0.5 && seed > 0.5) ? 14.0 : 7.0;                                                    // copper, gilt on some domes
    }
    #endif
    float h21(vec2 p) { p = mod(p, 512.0); vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    // a line pattern that fades out when it would alias
    float lines(float x, float period, float width, float px) { float f = fract(x / period); float l = step(f, width); return l * (1.0 - smoothstep(period * 0.35, period * 1.2, px)); }
    void main() {
      // aInfo is constant per instance but arrives through varyings: round before decoding so exact comparisons hold
      vec3 n = normalize(vN); float era = floor(vInfo.x + 0.5), seed = vInfo.y, style = floor(vInfo.z + 0.5);
      float wallMat = mod(style, 8.0); float roofMat = mod(floor(style / 8.0), 8.0); float culture = mod(floor(style / 64.0), 16.0); float flags = floor(style / 1024.0);
      float isBlock = mod(floor(flags / 2.0), 2.0), isNeon = mod(floor(flags / 4.0), 2.0), isLandmark = mod(flags, 2.0), isRuin = mod(floor(flags / 16.0), 2.0), isSite = mod(floor(flags / 32.0), 2.0);
      float roof = smoothstep(0.22, 0.4, vLN.y);                        // sloped and flat tops
      float bottom = step(vLN.y, -0.5);
      // face coordinates in metres
      vec2 fuv = abs(vLN.x) > 0.5 ? vec2(vLocal.z * vScale.z, vLocal.y * vScale.y) : abs(vLN.z) > 0.5 ? vec2(vLocal.x * vScale.x, vLocal.y * vScale.y) : vec2(vLocal.x * vScale.x, vLocal.z * vScale.z);
      vec2 ruv = abs(vLN.x) > abs(vLN.z) ? vec2(vLocal.z * vScale.z, vLocal.y * vScale.y * 1.4) : vec2(vLocal.x * vScale.x, vLocal.y * vScale.y * 1.4);
      float faceId = vLN.x > 0.5 ? 1.0 : vLN.x < -0.5 ? 2.0 : vLN.z > 0.5 ? 3.0 : vLN.z < -0.5 ? 4.0 : 5.0;
      float flatWall = step(0.96, max(abs(vLN.x), abs(vLN.z)));      // windows and doors only on true flat walls, not domes or towers
      float px = max(fwidth(fuv.x), fwidth(fuv.y)) + 1e-4;
      // ---------- walls ----------
      vec3 col = vCol; float beamMask = 0.0;
      float wallH = vScale.y; float yM = vLocal.y * vScale.y;
      if (wallMat == 0.0) { col *= 0.94 + 0.1 * vnoise(fuv * 0.9 + seed * 9.0); col *= 1.0 - 0.08 * smoothstep(0.5, 0.0, yM); }               // adobe: streaky, dusty foot
      else if (wallMat == 1.0) { col *= 0.96 + 0.06 * vnoise(fuv * 0.4 + seed * 5.0); }                                                             // plaster
      else if (wallMat == 2.0) { float beamV = lines(fuv.x + 0.6, 2.2, 0.08, px); float beamH = lines(yM + 0.15, 3.0, 0.09, px); float bay = floor((fuv.x + 0.6) / 2.2); float hasDiag = step(0.55, h21(vec2(bay, floor(yM / 3.0)) + seed)); float diag = step(0.9, fract((fuv.x + 0.6 - yM * 0.73) / 2.2)) * hasDiag * (1.0 - smoothstep(0.2, 0.6, px)); beamMask = max(max(beamV, beamH), diag) * 0.9 * (1.0 - roof); col = mix(col, vec3(0.26, 0.19, 0.13), beamMask); }  // timber frame: bays with the odd brace
      else if (wallMat == 3.0) { float course = floor(yM / 0.5); float mortar = max(lines(yM, 0.5, 0.07, px), lines(fuv.x + course * 0.45, 1.05, 0.06, px)); float vfade = 1.0 - smoothstep(0.25, 0.9, px); col *= 0.95 + 0.1 * vfade * h21(vec2(floor((fuv.x + course * 0.45) / 1.05), course) + seed); col = mix(col, col * 0.7, mortar); }   // stone courses
      else if (wallMat == 4.0) { float course = floor(yM / 0.3); float mortar = max(lines(yM, 0.3, 0.14, px), lines(fuv.x + course * 0.35, 0.7, 0.1, px)); float vfade = 1.0 - smoothstep(0.15, 0.6, px); col *= 0.95 + 0.08 * vfade * h21(vec2(floor((fuv.x + course * 0.35) / 0.7), course) + seed); col = mix(col, col * 0.75, mortar * 0.8); }   // brick
      else if (wallMat == 5.0) { float panel = max(lines(yM, 3.2, 0.03, px), lines(fuv.x, 4.0, 0.03, px)); col *= 0.97 + 0.05 * vnoise(fuv * 0.2); col = mix(col, col * 0.8, panel); }   // concrete
      else if (wallMat == 6.0) { float mull = max(lines(yM, 3.4, 0.08, px), lines(fuv.x, 2.4, 0.08, px)); vec3 glass = mix(vec3(0.16, 0.22, 0.3), vec3(0.55, 0.66, 0.78), 0.5 + 0.5 * dot(n, uUpV)); col = mix(glass * (0.8 + 0.4 * vCol.b), vCol * 0.75, mull); }   // glass curtain wall
      else { float plank = lines(fuv.x, 0.28, 0.12, px); col *= 0.9 + 0.14 * h21(vec2(floor(fuv.x / 0.28), 0.0) + seed); col = mix(col, col * 0.7, plank); }   // wood planks
      #ifdef USE_TEXARR
      {
        // the generated material replaces the procedural pattern; painted surfaces keep the palette colour and take only the
        // texture's relief, materials with a colour of their own (stone, brick, wood) keep theirs with a hint of the palette
        float wl = wallLayer(wallMat, culture, era, isLandmark, seed); int wi = int(wl + 0.5);
        vec3 tw = texture(uWallTex, vec3(fuv / uWallM[wi], wl)).rgb; vec3 mw = max(uWallMean[wi], vec3(0.05));
        float relief = dot(tw, LUM) / max(dot(mw, LUM), 0.05);
        float painted = (wallMat == 0.0 || wallMat == 1.0 || wallMat == 2.0 || wallMat == 5.0 || wl == 13.0) ? 1.0 : 0.0;
        vec3 texCol = mix(tw * mix(vec3(1.0), vCol / mw, 0.3), vCol * relief, painted);
        if (wallMat == 6.0) texCol = mix(col, tw * 1.08, 0.45);                                   // glass keeps its sky reflection, gains the mullion grid
        if (wallMat == 0.0) texCol *= 1.0 - 0.08 * smoothstep(0.5, 0.0, yM);
        col = mix(col, texCol, uTexMix * (1.0 - isRuin * 0.4));
        col = mix(col, vec3(0.26, 0.19, 0.13), beamMask * uTexMix);                                // timber frames keep their beams over the daub
      }
      #endif
      // windows: none before the Classical era (huts have no glass), sparse until Medieval, dense from the Industrial era
      float density = era < 1.0 ? 0.0 : era < 3.0 ? 0.2 : era < 4.0 ? 0.45 : era < 6.0 ? 0.6 : era < 7.0 ? 0.8 : 0.9;
      if (wallMat == 6.0 || isSite > 0.5) density = 0.0;
      vec2 cellSz = isLandmark > 0.5 ? vec2(4.5, 6.0) : era >= 7.0 ? vec2(2.4, 3.1) : era >= 6.0 ? vec2(2.6, 3.4) : vec2(2.8, 3.2);
      vec2 g = vec2(fuv.x, yM) / cellSz; vec2 gi = floor(g); vec2 gf = fract(g);
      float floors = floor(wallH / cellSz.y);
      float rowOk = step(0.5, gi.y) * step(gi.y, floors - 0.5) + step(wallH, cellSz.y * 1.5) * step(0.0, gi.y) * step(gi.y, 0.5) * step(3.0, wallH);
      float wsz = era >= 7.0 ? 0.36 : isLandmark > 0.5 ? 0.16 : 0.22;
      float wtall = isLandmark > 0.5 ? 0.62 : 0.42;
      float win = step(0.5 - wsz, gf.x) * step(gf.x, 0.5 + wsz) * step(0.5 - wtall, gf.y) * step(gf.y, 0.5 + wtall * 0.55) * rowOk * (1.0 - roof) * (1.0 - bottom) * step(faceId, 4.5) * flatWall;
      win *= step(h21(gi + seed * 7.0 + faceId * 13.0), density) * (1.0 - smoothstep(0.5, 1.6, px));
      // a door on the front face
      float door = step(abs(fuv.x - 0.9), 0.55) * step(yM, 2.1) * (1.0 - roof) * flatWall * step(abs(faceId - 3.0), 0.5) * step(2.6, vScale.x) * step(era, 6.5) * (1.0 - smoothstep(0.4, 1.2, px)) * (1.0 - isSite);
      col = mix(col, vec3(0.13, 0.1, 0.08), win * 0.88 * (1.0 - isRuin * 0.6));
      col = mix(col, vec3(0.16, 0.11, 0.07), door);
      // ---------- roofs ----------
      vec3 rc;
      if (roofMat == 0.0) { rc = vec3(0.55, 0.44, 0.26) * (0.82 + 0.28 * vnoise(vec2(ruv.x * 2.2, ruv.y * 0.5) + seed) + 0.12 * vnoise(vec2(ruv.x * 9.0, ruv.y * 1.5) + seed * 3.0)); rc *= 0.94 + 0.12 * step(0.5, fract(ruv.y / 0.9 + 0.3 * vnoise(vec2(ruv.x * 4.0, 0.0)))) * (1.0 - smoothstep(0.3, 1.0, px)); }            // thatch: streaks down the slope, ragged courses
      else if (roofMat == 1.0) { rc = vec3(0.70, 0.36, 0.24) * (0.88 + 0.2 * h21(floor(ruv / vec2(0.32, 0.36)) + seed)); rc = mix(rc, rc * 0.7, lines(ruv.y, 0.36, 0.18, px)); }   // terracotta tiles
      else if (roofMat == 2.0) { rc = vec3(0.30, 0.31, 0.35) * (0.88 + 0.22 * h21(floor(ruv / vec2(0.5, 0.3)) + seed)); rc = mix(rc, rc * 0.7, lines(ruv.y, 0.3, 0.16, px)); }     // slate
      else if (roofMat == 3.0) { rc = vCol * 0.82 * (0.94 + 0.1 * vnoise(fuv * 0.5 + seed)); }                                                                                       // flat
      else if (roofMat == 4.0) { rc = vec3(0.62, 0.64, 0.66) * (0.9 + 0.12 * lines(ruv.x, 0.9, 0.5, px)); }                                                                          // corrugated metal
      else if (roofMat == 5.0) { rc = vec3(0.24, 0.27, 0.3) * (0.88 + 0.2 * h21(floor(ruv / vec2(0.3, 0.3)) + seed)); rc = mix(rc, rc * 0.75, lines(ruv.x, 0.3, 0.2, px)); if (culture == 6.0 && isLandmark > 0.5) rc = mix(rc, vec3(0.62, 0.5, 0.16), 0.55); }   // glazed tile (imperial yellow on palaces)
      else if (roofMat == 6.0) { rc = vec3(0.42, 0.32, 0.22) * (0.86 + 0.26 * h21(floor(ruv / vec2(0.25, 0.5)) + seed)); }                                                          // shingles
      else { rc = vec3(0.36, 0.55, 0.48) * (0.92 + 0.12 * vnoise(ruv * 0.5)); }                                                                                                       // weathered copper
      #ifdef USE_TEXARR
      {
        float rl = roofLayer(roofMat, culture, era, isLandmark, seed); int ri = int(rl + 0.5);
        vec3 tr = texture(uRoofTex, vec3(ruv / uRoofM[ri], rl)).rgb; float rrel = dot(tr, LUM) / max(dot(uRoofMean[ri], LUM), 0.05);
        vec3 trc = tr;
        if (roofMat == 3.0 && rl != 10.0) trc = vCol * 0.85 * rrel;                                                                     // flat roofs are the wall's own material
        if (culture == 6.0 && isLandmark > 0.5 && roofMat == 5.0) trc = mix(trc, vec3(0.74, 0.56, 0.16) * rrel, 0.7);                   // imperial yellow glaze on palaces
        rc = mix(rc, trc, uTexMix);
      }
      #endif
      if (isBlock > 0.5) { float sub = step(0.55, vnoise(fuv * 0.12 + seed * 3.0)); rc = mix(rc * 0.9, vCol * 0.7, sub * 0.6); }
      col = mix(col, rc, roof);
      // building sites: bare material, no finish, a dusty foot
      if (isSite > 0.5) { col = mix(col, vec3(0.62, 0.56, 0.47), 0.45 + 0.45 * roof) * (0.9 + 0.2 * vnoise(fuv * 1.3 + seed * 4.0)); col *= 1.0 - 0.15 * smoothstep(0.3, 0.0, vLocal.y); }
      // ruins: weathered, mossy at the foot, roofs gone to the same stone
      if (isRuin > 0.5) { float moss = smoothstep(0.5, 0.0, vLocal.y) * vnoise(fuv * 0.6 + seed) * 0.6; col = mix(col, vec3(0.42, 0.4, 0.34), 0.5 + 0.3 * vnoise(fuv * 0.3 + seed * 2.0)); col = mix(col, vec3(0.3, 0.38, 0.2), moss); }
      // ---------- cheap ambient occlusion: dark under the eaves, dark at the foot ----------
      float ao = 1.0 - 0.28 * (1.0 - roof) * smoothstep(0.86, 1.0, vLocal.y) - 0.18 * smoothstep(0.08, 0.0, vLocal.y);
      // ---------- lighting ----------
      float diff = max(dot(n, uSunV), 0.0);
      float sky = 0.5 + 0.5 * dot(n, uUpV);
      vec3 amb = mix(vec3(0.07, 0.08, 0.12), vec3(0.40, 0.43, 0.5), uDay) * (0.7 + 0.5 * sky);
      vec3 lit = col * (amb + diff * 1.15 * uDay) * ao;
      // night: oil light from the Bronze Age, electric from the Industrial era; glass towers glow
      float night = 1.0 - uDay;
      float lampOn = step(era >= 6.0 ? 0.66 : 0.55, h21(gi * 3.1 + seed * 11.0 + faceId));
      vec3 lampCol = era >= 6.0 ? vec3(1.0, 0.86, 0.62) : vec3(1.0, 0.62, 0.3);
      lit += lampCol * win * lampOn * night * (era >= 6.0 ? 0.8 : 0.45) * (1.0 - isRuin);
      // far away, single windows are below a pixel: let the facade glow evenly instead of sparkling
      lit += lampCol * smoothstep(0.5, 1.6, px) * density * (1.0 - roof) * (1.0 - bottom) * night * (era >= 6.0 ? 0.16 : 0.05);
      if (wallMat == 6.0) { float fl = floor(yM / 3.4); float floorLit = step(0.5, h21(vec2(fl, seed * 5.0))); float cell = step(0.5, h21(floor(vec2(fuv.x / 2.4, yM / 3.4)) + seed * 3.0)) * floorLit + step(0.9, h21(floor(vec2(fuv.x / 2.4, fl)) + seed * 7.0)) * (1.0 - floorLit); cell *= 1.0 - smoothstep(0.5, 1.6, px); float glow = smoothstep(0.5, 1.6, px) * 0.22; lit += (vec3(0.95, 0.9, 0.72) * (cell * 0.26 + glow) + vec3(0.2, 0.26, 0.36) * 0.06) * night * (1.0 - roof); }
      if (era >= 1.0 && era < 3.0) lit += vec3(1.0, 0.6, 0.3) * night * 0.1 * (1.0 - roof) * step(0.8, h21(vec2(seed, faceId)));
      if (isNeon > 0.5) lit += vec3(1.0, 0.85, 0.55) * night * 1.4 * smoothstep(0.75, 1.0, vLocal.y);
      // aerial perspective shared with the terrain
      float distKm = length(vView) * 6371.0; float low = smoothstep(0.035, 0.002, uCamAlt);
      float fog = (1.0 - exp(-distKm / 260.0)) * low * 0.92;
      vec3 skyCol = mix(vec3(0.01, 0.015, 0.035), vec3(0.70, 0.80, 0.92), uDay);
      gl_FragColor = vec4(mix(lit, skyCol, fog), 1.0);
    }`;

  // instance caps: enough for the biggest city in view plus its neighbours
  const MAXI = { scaffold: 4000, hut: 6000, tipi: 2500, longhouse: 4000, stilt: 4000, adobe: 9000, pueblo: 2500, courtyard: 6000, courtyardc: 5000, domehouse: 2500, gable: 12000, hip: 7000, curved: 7000, halftimber: 5000, townhouse: 6000, mansard: 2500, palazzo: 1500, terrace: 7000, tenement: 6000, block: 12000, blockold: 8000, tower: 4000, skyscraper: 1000, granary: 1200, chimney: 1200, barn: 1500, warehouse: 800, windmill: 400, turbine: 500, lamp: 2500, stall: 800, well: 200, fountain: 200, statue: 300, obelisk: 200, pier: 400, boat: 400, ship: 300, crane: 300, menhirs: 300, ziggurat: 300, pyramid: 200, steppyramid: 300, temple: 500, colosseum: 150, cathedral: 300, church: 500, basilica: 200, mosque: 400, tajmosque: 100, mudmosque: 300, onion: 300, hall: 400, pagoda: 400, stupa: 300, shikhara: 300, stepped: 300, mound: 200, palace: 300, keep: 800, roundtower: 2500, gatehouse: 600, wall: 5000, palisade: 3000, bastion: 500, station: 200, crystal: 100, irontower: 100, stadium: 150, spire: 200, lighthouse: 200, factory: 1200, car: 200, cart: 100, plane: 100, train: 100, rubble: 6000, wallstub: 3000, pillars: 600, tent: 2500, bigtent: 400, catapult: 300, cannon: 400 };
  window.BKIT = { makeKit, VERT, FRAG, MAXI };
})();
