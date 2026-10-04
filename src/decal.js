// GENESIS decal layer: vector rivers and roads rendered top-down into a camera-local texture that the
// terrain shader samples by lon/lat. Nothing floats, nothing z-fights: the water and roads are painted
// onto the ground exactly where the terrain is. Classic script; exposes window.DECAL.
(function () {
  const R_M = 6371000, D2R = Math.PI / 180;
  const SIZE = 2048;

  const VERT = `
    attribute vec3 aux;            // x: across (-1..1), y: class 0..1, z: kind (0 river, 1 road, 2 halo)
    varying vec3 vAux;
    void main() { vAux = aux; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const FRAG = `
    precision mediump float; varying vec3 vAux;
    void main() {
      float ax = abs(vAux.x); float cov = 1.0 - smoothstep(0.55, 1.0, ax);
      // a river's ribbon carries its banks: 1 on the centre line, 0.5 at the water's edge, 0 where the bank ends (a
      // distance to the water the ground shader can draw a clean edge, shallows and a green bank from); g: its size
      if (vAux.z < 0.5) { float r = 1.0 - ax; gl_FragColor = vec4(r, vAux.y * smoothstep(0.0, 0.2, r), 0.0, 0.0); }
      else if (vAux.z < 1.5) gl_FragColor = vec4(0.0, 0.0, cov * vAux.y, 0.0);
      else gl_FragColor = vec4(0.0, 0.0, 0.0, (1.0 - smoothstep(0.25, 1.0, ax)) * vAux.y);
    }`;
  // How wide a river is drawn. Towns stand many times life size and roads six times; at its true width the river
  // beside a village would be a thread. Brooks and small rivers are drawn four times as wide as they are, the great
  // rivers twice (they are wide already). Everything that asks where the water is gets this width.
  function drawnWidth(w) { const t = Math.min(1, Math.max(0, (w - 100) / 500)); return w * (4 - 2 * t * t * (3 - 2 * t)); }

  class Decal {
    constructor({ renderer, globals }) {
      this.renderer = renderer; this.globals = globals;
      this.rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      this.rt.texture.generateMipmaps = false;
      this.scene = new THREE.Scene();
      this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1); this.cam.position.z = 0.5;
      this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide });
      this.mesh = null;
      // second target: cast shadows of buildings and trees (R), painted on the ground under the same rect
      this.rt2 = new THREE.WebGLRenderTarget(SIZE, SIZE, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      this.rt2.texture.generateMipmaps = false; this.scene2 = new THREE.Scene(); this.mesh2 = null; this.lastShadow = { t: -1e9, b: -1, tr: -1, sun: new THREE.Vector3() };
      globals.uDecal2.value = this.rt2.texture;
      this.rivers = []; this.grid = new Map(); this.CELL = 4; // degrees
      this.rect = null; this.lastBuild = 0; this.lastSimStamp = -1; this.enabled = true;
      globals.uDecal.value = this.rt.texture; globals.uDecalRect.value.set(0, 0, 0, 0); globals.uDecalOn.value = 0;
      this.stats = { verts: 0, rivers: 0, roads: 0, mpp: 0 };
    }
    async load(url) {
      // the byte stream travels inside a lossless grayscale PNG (artifacts serve images, not binaries)
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
      const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data; const all = new Uint8Array(bmp.width * bmp.height); for (let i = 0; i < all.length; i++) all[i] = px[i * 4];
      const hdr = new DataView(all.buffer); const len = hdr.getUint32(0, true); if (hdr.getUint32(4, true) !== 0x52495632) throw new Error('bad rivers.png');
      const buf = all.buffer.slice(8, 8 + len); const dv = new DataView(buf);
      if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'RIV2') throw new Error('bad rivers data');
      const n = dv.getUint32(4, true); let o = 8; const lines = [];
      for (let k = 0; k < n; k++) {
        const cnt = dv.getUint16(o, true), sr = dv.getUint8(o + 2), width = dv.getUint16(o + 4, true); o += 8;
        const pts = new Float32Array(cnt * 2); let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
        for (let i = 0; i < cnt; i++) { const lon = dv.getInt32(o, true) / 1e5, lat = dv.getInt32(o + 4, true) / 1e5; o += 8; pts[i * 2] = lon; pts[i * 2 + 1] = lat; if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon; if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; }
        const line = { pts, sr, width, cls: Math.min(1, width / 1500), bbox: [minLon, minLat, maxLon, maxLat] };
        lines.push(line);
        const C = this.CELL;
        for (let gy = Math.floor((minLat + 90) / C); gy <= Math.floor((maxLat + 90) / C); gy++) for (let gx = Math.floor((minLon + 180) / C); gx <= Math.floor((maxLon + 180) / C); gx++) { const key = gy * 1000 + gx; let a = this.grid.get(key); if (!a) { a = []; this.grid.set(key, a); } a.push(line); }
      }
      this.rivers = lines;
      // fine segment index (0.1 deg cells) for CPU queries: is this point in a river, where is the bank
      const SC = 0.1; const seg = new Map();
      for (const line of lines) {
        const p = line.pts; const hw = drawnWidth(line.width) * 0.5;
        for (let i = 0; i + 3 < p.length; i += 2) {
          const x0 = Math.min(p[i], p[i + 2]), x1 = Math.max(p[i], p[i + 2]), y0 = Math.min(p[i + 1], p[i + 3]), y1 = Math.max(p[i + 1], p[i + 3]);
          for (let gy = Math.floor((y0 + 90) / SC); gy <= Math.floor((y1 + 90) / SC); gy++) for (let gx = Math.floor((x0 + 180) / SC); gx <= Math.floor((x1 + 180) / SC); gx++) { const key = gy * 10000 + gx; let a = seg.get(key); if (!a) { a = []; seg.set(key, a); } a.push(p[i], p[i + 1], p[i + 2], p[i + 3], hw); }
        }
      }
      this.segIndex = seg; this.SC = SC;
      this.rect = null;                // the next update repaints everything, rivers included
    }
    // nearest river to (lon, lat) within the surrounding cells: {d (m), hw (m), px, py (unit vector away from the river, in metre space)} or null
    nearestRiver(lon, lat) {
      if (!this.segIndex) return null; const SC = this.SC; const cl = Math.max(0.15, Math.cos(lat * D2R)); const mPerDeg = R_M * D2R;
      const gx0 = Math.floor((lon + 180) / SC), gy0 = Math.floor((lat + 90) / SC); let best = null;
      for (let gy = gy0 - 1; gy <= gy0 + 1; gy++) for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) {
        const a = this.segIndex.get(gy * 10000 + gx); if (!a) continue;
        for (let k = 0; k < a.length; k += 5) {
          const ax = (a[k] - lon) * cl * mPerDeg, ay = (a[k + 1] - lat) * mPerDeg, bx = (a[k + 2] - lon) * cl * mPerDeg, by = (a[k + 3] - lat) * mPerDeg;
          const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy; const t = L2 > 1e-6 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
          const cx = ax + dx * t, cy = ay + dy * t; const d = Math.hypot(cx, cy);
          if (!best || d - a[k + 4] < best.d - best.hw) best = { d, hw: a[k + 4], px: -cx / (d || 1), py: -cy / (d || 1) };
        }
      }
      return best;
    }
    // decide the covered rect (radians) from the camera; returns true when a rebuild is due
    plan(cam, now, simStamp) {
      const tilt = cam.tilt || 0;
      const E = Math.min(0.3, Math.max(0.0005, cam.dist * (2.5 + 7.0 * tilt * tilt)));   // extent grows with tilt: oblique views see far
      const cl = Math.max(0.15, Math.cos(cam.lat * D2R));
      const lat0 = cam.lat * D2R - E / 2, lon0 = cam.lon * D2R - E / 2 / cl;
      const r = this.rect;
      const moved = !r || Math.abs(lat0 - r.lat0) > E / 8 || Math.abs(lon0 - r.lon0) > E / 8 / cl || Math.abs(Math.log(E / r.E)) > 0.2;
      const stale = simStamp !== this.lastSimStamp && now - this.lastBuild > 2500;
      if (!moved && !stale) return 0;
      if (moved) this.rect = { lon0, lat0, E, cl, w: E / cl, h: E };
      return moved ? 2 : 1;      // 2: everything (camera moved), 1: only roads and land use (the world changed)
    }
    rebuild(cam, sim, now, simStamp, what) {
      const r = this.rect; const mpp = r.E * R_M / SIZE; this.stats.mpp = mpp;
      let pos = [], aux = [], idx = [], vi = 0;
      const lon0 = r.lon0, lat0 = r.lat0, lon1 = r.lon0 + r.w, lat1 = r.lat0 + r.h;
      const lonR = (lon) => lon * D2R, latR = (lat) => lat * D2R;
      const quad = (ax, ay, bx, by, hwLon, hwLat, cls, kind) => {
        // ribbon segment a->b in radians; hw in radians per axis, extended by half width at both ends
        let dx = (bx - ax) * r.cl, dy = by - ay; const L = Math.hypot(dx, dy); if (L < 1e-9) return;
        dx /= L; dy /= L; const nx = -dy, ny = dx;
        const exLon = dx * hwLon, exLat = dy * hwLat;
        const ax2 = ax - exLon / r.cl, ay2 = ay - exLat, bx2 = bx + exLon / r.cl, by2 = by + exLat;
        const oLon = nx * hwLon / r.cl, oLat = ny * hwLat;
        pos.push(ax2 + oLon, ay2 + oLat, 0, ax2 - oLon, ay2 - oLat, 0, bx2 + oLon, by2 + oLat, 0, bx2 - oLon, by2 - oLat, 0);
        aux.push(1, cls, kind, -1, cls, kind, 1, cls, kind, -1, cls, kind);
        idx.push(vi, vi + 1, vi + 2, vi + 2, vi + 1, vi + 3); vi += 4;
      };
      const disc = (cx, cy, rLon, rLat, cls, kind, n, core) => {
        // soft-edged polygon: centre fully covered, rim fades out (core: the share of the radius that stays fully covered; without it the fade begins half way out)
        const c0 = vi; pos.push(cx, cy, 0); aux.push(0, cls, kind); vi++;
        if (core) {
          for (let ring = 0; ring < 2; ring++) for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2, f = ring ? 1 : core; pos.push(cx + Math.cos(a) * rLon * f, cy + Math.sin(a) * rLat * f, 0); aux.push(ring ? 1 : kind === 2 ? 0.25 : 0.55, cls, kind); vi++; }      /* (the inner ring sits where each kind's fade begins) */
          const i0 = c0 + 1, o0 = c0 + 2 + n;
          for (let k = 0; k < n; k++) idx.push(c0, i0 + k, i0 + k + 1, i0 + k, o0 + k, i0 + k + 1, i0 + k + 1, o0 + k, o0 + k + 1);
          return;
        }
        for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2; pos.push(cx + Math.cos(a) * rLon, cy + Math.sin(a) * rLat, 0); aux.push(1, cls, kind); vi++; }
        for (let k = 0; k < n; k++) idx.push(c0, c0 + 1 + k, c0 + 2 + k);
      };
      // ----- rivers (only when the covered area changed) -----
      let nr = this.stats.rivers || 0;
      if (what === 2 && this.rivers.length) {
        nr = 0;
        const C = this.CELL; const seen = new Set();
        const gLon0 = lon0 / D2R, gLat0 = lat0 / D2R, gLon1 = lon1 / D2R, gLat1 = lat1 / D2R;
        for (let gy = Math.floor((gLat0 + 90) / C); gy <= Math.floor((gLat1 + 90) / C); gy++) for (let gx = Math.floor((gLon0 + 180) / C); gx <= Math.floor((gLon1 + 180) / C); gx++) {
          const a = this.grid.get(gy * 1000 + gx); if (!a) continue;
          for (const line of a) {
            if (seen.has(line)) continue; seen.add(line);
            const b = line.bbox; if (b[2] < gLon0 || b[0] > gLon1 || b[3] < gLat0 || b[1] > gLat1) continue;
            const hwW = Math.max(drawnWidth(line.width) * 0.5, mpp * 0.9);      // the water: never thinner than ~1.8 px in the decal
            if (line.width < mpp * 0.35 && line.sr > 6) continue;    // too small to matter at this scale
            const hwM = hwW * 2;                                      // the ribbon: the water and a bank as wide as half the river on either side
            const hwLat = hwM / R_M, hwLon = hwM / R_M; const resolved = hwW > mpp * 1.3;
            const p = line.pts; nr++;
            // clip to the rect (with margin), then round the corners (two Chaikin passes) so channels meander instead of zig-zagging
            const mg = hwLat * 8 + 0.002; const q = [];
            for (let i = 0; i + 1 < p.length; i += 2) { const x = lonR(p[i]), y = latR(p[i + 1]); q.push(x, y); }
            let pts = q;
            for (let pass = 0; pass < 2; pass++) {
              const out = [pts[0], pts[1]];
              for (let i = 0; i + 3 < pts.length; i += 2) { const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3]; out.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75); }
              out.push(pts[pts.length - 2], pts[pts.length - 1]); pts = out;
            }
            for (let i = 0; i + 3 < pts.length; i += 2) {
              const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
              if ((ax < lon0 - mg && bx < lon0 - mg) || (ax > lon1 + mg && bx > lon1 + mg) || (ay < lat0 - mg && by < lat0 - mg) || (ay > lat1 + mg && by > lat1 + mg)) continue;
              quad(ax, ay, bx, by, hwLon, hwLat, line.cls, 0);
              // the wet land along it: green well beyond the bank, wider along a great river
              if (resolved) { const hh = (hwW * 5 + 150) / R_M; quad(ax, ay, bx, by, hh, hh, 0.3 + 0.5 * Math.min(1, line.width / 600), 2); }
            }
          }
        }
      }
      if (what === 2) {
        if (this.meshR) { this.scene.remove(this.meshR); this.meshR.geometry.dispose(); this.meshR = null; }
        const gr = new THREE.BufferGeometry();
        gr.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gr.setAttribute('aux', new THREE.Float32BufferAttribute(aux, 3)); gr.setIndex(idx);
        this.meshR = new THREE.Mesh(gr, this.mat); this.meshR.frustumCulled = false; this.scene.add(this.meshR);
        this.stats.riverVerts = vi;
        pos = []; aux = []; idx = []; vi = 0;
      }
      // ----- roads between settlements of the same realm -----
      let nroad = 0; const roads = []; const roadCache = this.roadCache || (this.roadCache = new Map());
      if (sim) {
        const W = 720, H = 360; const level = sim.level, owner = sim.owner, land = sim.land;
        const x0 = Math.max(0, Math.floor((lon0 / D2R + 180) / 360 * W) - 3), x1 = Math.min(W - 1, Math.ceil((lon1 / D2R + 180) / 360 * W) + 3);
        const y0 = Math.max(0, Math.floor((90 - lat1 / D2R) / 180 * H) - 3), y1 = Math.min(H - 1, Math.ceil((90 - lat0 / D2R) / 180 * H) + 3);
        const site = (i) => { const [lon, lat] = TOWN.siteOf(sim, i, sim.civs[owner[i]], this.terrain, this); return [lon * D2R, lat * D2R]; };
        const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
        const settled = [];
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (level[i] > 0 && owner[i] >= 0) settled.push(i); }
        // land use around every settlement, at true scale: cultivated ring (A) and the built-up ground itself (B)
        for (const i of settled) {
          const c = sim.civs[owner[i]]; if (!c) continue; const lvl = level[i];
          const [sx, sy] = site(i); const R = TOWN.radiusM(sim, i, c); const spread = Math.max(R * 1.24, mpp * 3) / R_M;      // the trodden ground of the town itself: all of it within the walls, fading into the fields outside
          const cult = sim.cultivation(i);
          if (cult > 0.03) { const rr = Math.max(TOWN.fieldsM(sim, i, c), mpp * 4) / R_M; disc(sx, sy, rr / r.cl, rr, Math.min(1, 0.4 + cult * 0.6), 2, 24, 0.62); }      // fields all the way out to where the farmsteads stand, thinning beyond
          disc(sx, sy, spread / r.cl, spread, 0.16 + 0.05 * lvl + 0.1 * Math.min(1, c.era / 6), 1, 20, 0.85);
          // the town's own streets and square, once we are close enough for them to be more than a pixel
          if (mpp < 420) { // streets are drawn at the town's representational scale, so they show from region height
            const L = TOWN.layout(sim, i, c, { coarse: false }); const mLon = 1 / (R_M * r.cl), mLat = 1 / R_M;
            disc(sx, sy, L.plaza * mLon, L.plaza * mLat, L.streetCls, 1, 28);
            for (const st of L.streets) { const hwm = Math.max(st[4], mpp * 0.8); quad(sx + st[0] * mLon, sy + st[1] * mLat, sx + st[2] * mLon, sy + st[3] * mLat, hwm * mLon, hwm * mLat, L.streetCls, 1); }
          }
        }
        const byCell = new Map(); for (const i of settled) byCell.set(i, true);
        for (const i of settled) {
          const yi = (i / W) | 0, xi = i - yi * W; const o = owner[i]; const c = sim.civs[o]; if (!c) continue;
          const cand = [];
          for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { if (!dx && !dy) continue; const y = yi + dy; if (y < 0 || y >= H) continue; const x = ((xi + dx) % W + W) % W; const j = y * W + x; if (j <= i || !byCell.has(j) || owner[j] !== o) continue; cand.push([dx * dx + dy * dy, j]); }
          cand.sort((a, b) => a[0] - b[0]);
          const farView = mpp > 40;                                  // from high up only towns get roads, and fewer of them
          if (farView && level[i] < 2) continue;
          for (let k = 0; k < Math.min(farView ? 2 : 3, cand.length); k++) {
            const j = cand[k][1]; if (farView && level[j] < 2) continue; const [sax, say] = site(i), [sbx, sby] = site(j);
            // skip roads that would cross the sea (check the midpoint cell)
            const mx = (sax + sbx) / 2, my = (say + sby) / 2; const cx = Math.floor((mx / D2R + 180) / 360 * W), cy = Math.floor((90 - my / D2R) / 180 * H);
            if (!land[cy * W + (((cx % W) + W) % W)]) continue;
            const tech = c.tech || 0; const wM = Math.max((4 + 6 * Math.min(1, tech * 3)) * 6, mpp * (farView ? 1.1 : 1.7)); const hw = wM * 0.5 / R_M;   // roads six times life width, to match the towns
            // the road leaves each town through the gate that faces the other one (where that gate's lane ends), runs
            // straight out for a stretch, then curves gently across country
            const sep = Math.hypot((sbx - sax) * r.cl, sby - say); const be = Math.atan2(sby - say, (sbx - sax) * r.cl);
            const [ga, gra] = TOWN.gateToward(sim, i, c, be), [gb, grb] = TOWN.gateToward(sim, j, c, be + Math.PI);
            const ra = gra / R_M, rb = grb / R_M; const P = []; let q0, q3;
            if (sep > (ra + rb) * 1.5) {
              const out = Math.min(sep * 0.12, Math.max(ra, rb) * 0.5); const clA = Math.max(0.15, Math.cos(say)), clB = Math.max(0.15, Math.cos(sby));
              const cA = Math.cos(ga), sA = Math.sin(ga), cB = Math.cos(gb), sB = Math.sin(gb);
              P.push([sax + cA * ra / clA, say + sA * ra]); q0 = [sax + cA * (ra + out) / clA, say + sA * (ra + out)]; q3 = [sbx + cB * (rb + out) / clB, sby + sB * (rb + out)];
            } else { q0 = [sax, say]; q3 = [sbx, sby]; }                // towns that touch: centre to centre, as the crow flies
            const h1 = hash(i, j) - 0.5; const dx = (q3[0] - q0[0]) * r.cl, dy = q3[1] - q0[1]; const L = Math.hypot(dx, dy) || 1e-9;
            const px = -dy / L * L * 0.18 * h1 / r.cl, py = dx / L * L * 0.18 * h1;
            P.push(q0, [q0[0] + (q3[0] - q0[0]) * 0.33 + px, q0[1] + (q3[1] - q0[1]) * 0.33 + py], [q0[0] + (q3[0] - q0[0]) * 0.66 + px * 0.8, q0[1] + (q3[1] - q0[1]) * 0.66 + py * 0.8], q3);
            if (sep > (ra + rb) * 1.5) P.push([sbx + Math.cos(gb) * rb / Math.max(0.15, Math.cos(sby)), sby + Math.sin(gb) * rb]);
            const sE = TOWN.styleEra(c.era, TOWN.civCulture(sim, c)); const cls = sE <= 2 ? 0.58 : sE <= 6 ? 0.72 : 0.9;   // dirt track, cobbled road, asphalt (the terrain shader reads the class)
            for (let q = 0; q + 1 < P.length; q++) quad(P[q][0], P[q][1], P[q + 1][0], P[q + 1][1], hw, hw, cls, 1);
            nroad++;
            // the road as a curve for the movers (cached so their height samples survive rebuilds; remade when a gate moves)
            const rk = i * 1e6 + j; let rd = roadCache.get(rk); const sig = P.length + ':' + P[0][0].toFixed(7) + ',' + P[0][1].toFixed(7) + ',' + P[P.length - 1][0].toFixed(7) + ',' + P[P.length - 1][1].toFixed(7);
            if (!rd || rd.sig !== sig) {
              const nS = P.length - 1; const segL = []; let tot = 0; for (let q = 0; q < nS; q++) { const l = Math.hypot((P[q + 1][0] - P[q][0]) * r.cl, P[q + 1][1] - P[q][1]); segL.push(l); tot += l; } tot = tot || 1e-9;
              rd = { i, j, sig, era: c.era, lenKm: tot * 6371, f: (t) => { let d = t * tot; for (let q = 0; q < nS; q++) { if (d <= segL[q] || q === nS - 1) { const u = segL[q] > 0 ? Math.min(1, d / segL[q]) : 0; return [(P[q][0] + (P[q + 1][0] - P[q][0]) * u) / D2R, (P[q][1] + (P[q + 1][1] - P[q][1]) * u) / D2R]; } d -= segL[q]; } return [P[nS][0] / D2R, P[nS][1] / D2R]; } };
              roadCache.delete(rk); roadCache.set(rk, rd); if (roadCache.size > 600) roadCache.delete(roadCache.keys().next().value);
            }
            rd.era = c.era; rd.rail = c.era >= 6 && level[i] >= 2 && level[j] >= 2; roads.push(rd);
            if (rd.rail) { const ox = -dy / L * 22 / R_M / r.cl, oy = dx / L * 22 / R_M; const hwr = Math.max(2.4, mpp * 0.9) / R_M; for (let q = 0; q + 1 < P.length; q++) quad(P[q][0] + ox, P[q][1] + oy, P[q + 1][0] + ox, P[q + 1][1] + oy, hwr, hwr, 1.0, 1); }
          }
        }
      }
      // ----- geometry + render -----
      if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
      this.stats.verts = vi + (this.stats.riverVerts || 0); this.stats.rivers = nr; this.stats.roads = nroad; this.roads = roads;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aux', new THREE.Float32BufferAttribute(aux, 3)); g.setIndex(idx);
      this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.scene.add(this.mesh);
      this.cam.left = lon0; this.cam.right = lon1; this.cam.bottom = lat0; this.cam.top = lat1; this.cam.updateProjectionMatrix();
      const rd = this.renderer; const oldRT = rd.getRenderTarget(); const oldClear = rd.getClearColor(new THREE.Color()); const oldAlpha = rd.getClearAlpha();
      rd.setRenderTarget(this.rt); rd.setClearColor(0x000000, 0); rd.clear(true, false, false); rd.render(this.scene, this.cam);
      rd.setRenderTarget(oldRT); rd.setClearColor(oldClear, oldAlpha);
      this.globals.uDecalRect.value.set(lon0, lat0, 1 / r.w, 1 / r.h); this.globals.uDecalOn.value = 1;
      this.lastBuild = now; this.lastSimStamp = simStamp;
    }
    update(cam, sim, now, simStamp, sun, world, trees) {
      if (!this.enabled || cam.alt > 0.045) { this.globals.uDecalOn.value = 0; this.rect = null; return; }
      const what = this.plan(cam, now, simStamp);
      if (what) this.rebuild(cam, sim, now, simStamp, what);
      this.sim = sim;
      if (world && cam.alt < 0.03) this.updateShadows(cam, sun, world, trees, now, what === 2);
    }
    // ground shadows: every building and near tree drops a sharp shadow along the sun direction
    updateShadows(cam, sun, world, trees, now, force) {
      const L = this.lastShadow; const bv = world.castersVersion || 0, tv = trees ? (trees.castersVersion || 0) : 0;
      const simYear = this.sim ? this.sim.year : 0;
      if (!force && L.b === bv && L.tr === tv && L.y === simYear && now - L.t < 1500 && L.sun.distanceTo(sun) < 0.004) return;
      L.b = bv; L.tr = tv; L.t = now; L.sun.copy(sun); L.y = simYear;
      const r = this.rect; if (!r) return;
      const latC = r.lat0 + r.h / 2, lonC = r.lon0 + r.w / 2;
      const f = GEO.enu(lonC / D2R, latC / D2R);
      const sE = f.east.dot(sun), sN = f.north.dot(sun), sU = f.up.dot(sun);
      const pos = [], aux = [], idx = []; let vi = 0;
      // ----- marks the living world leaves on the ground -----
      if (this.sim) {
        const sim = this.sim; const yr = sim.year; const Wc = 720, Hc = 360;
        const cellLL = (i) => { const y = (i / Wc) | 0, x = i - y * Wc; return [((x + 0.5) / Wc * 360 - 180) * D2R, (90 - (y + 0.5) / Hc * 180) * D2R]; };
        const inRect = (lon, lat, m) => lon > r.lon0 - m && lon < r.lon0 + r.w + m && lat > r.lat0 - m && lat < r.lat0 + r.h + m;
        const mLon = 1 / (R_M * r.cl), mLat = 1 / R_M; const cellM = 55000;
        // burn blobs write R (kind 0): the centre vertex's 'across' value sets the coverage, so a fading scar is a fainter one
        // a blob with a flat interior and a soft fringe: centre + inner ring at the plateau value, outer ring at zero coverage
        const burnBlob = (cx, cy, radM, strength, seed, burning) => {
          const g = burning ? 1 : 0; const xc = 0.55 + 0.45 * (1 - strength); const n = 24; const c0 = vi;
          pos.push(cx, cy, 0); aux.push(xc, g, 0); vi++;
          const ring = (scale, xv) => { const base = vi; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; const rr = radM * scale * (0.86 + 0.14 * Math.sin(a * 3 + seed) * Math.cos(a * 5 - seed * 1.7) + 0.08 * Math.sin(a * 7 + seed * 2.3)); pos.push(cx + Math.cos(a) * rr * mLon, cy + Math.sin(a) * rr * mLat, 0); aux.push(xv, g, 0); vi++; } return base; };
          const r1 = ring(0.78, xc), r2 = ring(1.0, 1);
          for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; idx.push(c0, r1 + k, r1 + k2); idx.push(r1 + k, r2 + k, r2 + k2, r1 + k, r2 + k2, r1 + k2); }
        };
        for (const f of sim.fires) { const age = yr - f.year; const [lon, lat] = cellLL(f.i); const radM = f.r * 13000; if (!inRect(lon, lat, radM / R_M)) continue; const burning = age <= f.dur; const strength = burning ? 1 : Math.max(0, 1 - (age - f.dur) / 45); if (strength <= 0) continue; const n = 3 + f.r * 3; for (let k = 0; k < n; k++) { const a = k * 2.399 + f.i * 0.01, rr = k ? radM * 0.55 * Math.sqrt(k / n) : 0; burnBlob(lon + Math.cos(a) * rr * mLon, lat + Math.sin(a) * rr * mLat, radM * (0.4 + 0.25 * ((k * 7919 + f.i) % 10) / 10), strength, f.i + k, burning); } }
        for (const v of sim.volcanoes) { const age = yr - v.last; if (v.last < -1e8 || age > 35) continue; const lon = v.lon * D2R, lat = v.lat * D2R; const radM = (4000 + v.strength * 6000); if (!inRect(lon, lat, radM / R_M)) continue; const strength = age <= 3 ? 1 : Math.max(0, 1 - (age - 3) / 32); burnBlob(lon, lat, radM, strength * 0.55, v.cell, false); burnBlob(lon, lat, radM * 0.5, strength * 0.85, v.cell + 3, false); burnBlob(lon, lat, radM * 0.2, 1, v.cell + 5, age <= 3); }
        // floods: the river swells to many times its width through the flooded cells for a season or two
        for (const fl of sim.floods) { const age = yr - fl.year; if (age > 1.5) continue; const fade = age < 1 ? 1 : 1 - (age - 1) / 0.5; for (const ci of fl.cells) { const [lon, lat] = cellLL(ci); if (!inRect(lon, lat, 0.006)) continue; const C = this.CELL; const gx = Math.floor((lon / D2R + 180) / C), gy = Math.floor((lat / D2R + 90) / C); const arr = this.grid.get(gy * 1000 + gx); if (!arr) continue; const half = 0.25 * D2R; for (const line of arr) { if (line.width < 120) continue; const p = line.pts; for (let i = 0; i + 3 < p.length; i += 2) { const ax = p[i] * D2R, ay = p[i + 1] * D2R, bx = p[i + 2] * D2R, by = p[i + 3] * D2R; if (Math.abs(ax - lon) > half || Math.abs(ay - lat) > half) continue; const hwM = Math.max(line.width * 2.5, 500) * fade; let dx = (bx - ax) * r.cl, dy = by - ay; const L = Math.hypot(dx, dy); if (L < 1e-9) continue; dx /= L; dy /= L; const nx = -dy, ny = dx; const oLon = nx * hwM * mLon, oLat = ny * hwM * mLat; const c0 = vi; pos.push(ax + oLon, ay + oLat, 0, ax - oLon, ay - oLat, 0, bx + oLon, by + oLat, 0, bx - oLon, by - oLat, 0); aux.push(1, 1, 2, -1, 1, 2, 1, 1, 2, -1, 1, 2); idx.push(c0, c0 + 1, c0 + 2, c0 + 2, c0 + 1, c0 + 3); vi += 4; } } } }
      }
      if (sU > 0.04) {
        const k = 1 / Math.max(sU, 0.12);                      // shadow length per metre of height (capped at low sun)
        const offE = -sE * k, offN = -sN * k;                    // metres per metre of height
        const mLon = 1 / (R_M * r.cl), mLat = 1 / R_M;           // radians per metre
        const rect = (cx, cy, hw, hd, yaw, ox, oy) => {
          const c = Math.cos(yaw), sn = Math.sin(yaw);
          const px = [-hw, hw, hw, -hw], py = [-hd, -hd, hd, hd];
          for (let i = 0; i < 4; i++) { const x = px[i] * c - py[i] * sn + ox, y = px[i] * sn + py[i] * c + oy; pos.push(cx + x * mLon, cy + y * mLat, 0); aux.push(0, 1, 1); }
          idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3); vi += 4;
        };
        const cs = world.casters || []; const exag = world.exag;
        for (let i = 0; i + 5 < cs.length; i += 6) {
          const lon = cs[i] * D2R, lat = cs[i + 1] * D2R, w = cs[i + 2], h = cs[i + 3], d = cs[i + 4], yaw = cs[i + 5];
          if (lon < r.lon0 || lon > r.lon0 + r.w || lat < r.lat0 || lat > r.lat0 + r.h) continue;
          if (window.SHADOWS && SHADOWS.covers(GEO.toVec(cs[i], cs[i + 1], this._sv || (this._sv = new THREE.Vector3())))) continue;   // the sun's depth map draws this one's true shadow
          const len = Math.min(h, 400) ; const steps = 3;
          for (let sIdx = 0; sIdx <= steps; sIdx++) { const t = sIdx / steps; rect(lon, lat, w * 0.5, d * 0.5, yaw, offE * len * t, offN * len * t); }
        }
        const tc = trees && trees.casters ? trees.casters : [];
        const blob = (cx, cy, rad, ox, oy) => {   // soft elliptical canopy shadow, offset along the sun
          const c0 = vi; pos.push(cx + ox * mLon, cy + oy * mLat, 0); aux.push(0, 0.9, 1); vi++;
          for (let k = 0; k <= 7; k++) { const a = k / 7 * Math.PI * 2; pos.push(cx + (ox + Math.cos(a) * rad) * mLon, cy + (oy + Math.sin(a) * rad) * mLat, 0); aux.push(1, 0.9, 1); vi++; }
          for (let k = 0; k < 7; k++) idx.push(c0, c0 + 1 + k, c0 + 2 + k);
        };
        for (let i = 0; i + 3 < tc.length; i += 4) {
          const lon = tc[i] * D2R, lat = tc[i + 1] * D2R, wid = tc[i + 2], hgt = tc[i + 3];
          if (lon < r.lon0 || lon > r.lon0 + r.w || lat < r.lat0 || lat > r.lat0 + r.h) continue;
          blob(lon, lat, wid * 0.6, offE * hgt * 0.45, offN * hgt * 0.45);
        }
      }
      if (this.mesh2) { this.scene2.remove(this.mesh2); this.mesh2.geometry.dispose(); this.mesh2 = null; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aux', new THREE.Float32BufferAttribute(aux, 3)); g.setIndex(idx);
      this.mesh2 = new THREE.Mesh(g, this.mat); this.mesh2.frustumCulled = false; this.scene2.add(this.mesh2);
      const rd = this.renderer; const oldRT = rd.getRenderTarget(); const oldClear = rd.getClearColor(new THREE.Color()); const oldAlpha = rd.getClearAlpha();
      rd.setRenderTarget(this.rt2); rd.setClearColor(0x000000, 0); rd.clear(true, false, false); rd.render(this.scene2, this.cam);
      rd.setRenderTarget(oldRT); rd.setClearColor(oldClear, oldAlpha);
      this.stats.shadows = vi / 4;
    }
  }
  window.DECAL = { Decal };
})();
