// GENESIS movers: the small life of a place, Sims-style. People walking the streets, carts and cars on the roads,
// boats and ships between harbours. Everything is spawned from the town plans and road net near the camera and
// animated on the CPU each frame (a few thousand agents at most). Classic script; exposes window.MOVERS.
(function () {
  const R_M = 6371000, D2R = Math.PI / 180;
  const W = 720, H = 360;
  function hash(i, k) { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const CAPS = { car: 900, cart: 300, ship: 160, boat: 200, plane: 120, train: 80 };
  const TRAIL_N = 36, TRAIL_DT = 0.35;
  const MAXPEOPLE = 3000;
  const ROAD_K = 8, SHIP_K = 6;   // carts, cars and trains on the long roads, and ships at sea, are drawn this many times life size
  // clothes by era band: earthy early, dyed later, everything in the modern age
  const CLOTHES = [[0x6b5a44, 0x8a7355, 0x5a4a3a, 0xa08868], [0x8a5a3a, 0x6b6b4a, 0xb0925e, 0x5a3a5a, 0xa03a2a], [0xc9c0a8, 0x8a2a2a, 0x2a3a6a, 0x6a5a3a, 0xd9d0b8], [0x3a3a3a, 0x8a2a2a, 0x2a3a6a, 0x6a5a3a, 0xd9d0b8], [0x2a2a4a, 0x8a2a2a, 0x1a4a3a, 0xd9d0b8, 0x5a3a2a], [0x2a2a2a, 0x4a3a2a, 0x6a6a6a, 0x3a3a5a], [0x2a2a2a, 0x3a4a8a, 0xd9d9d9, 0x8a2a2a, 0x2a6a3a], [0x2a2a2a, 0x3a4a8a, 0xf0f0f0, 0xd93a2a, 0x2aa05a, 0xf0c02a]];
  const CARS = [0xd9d9d9, 0x2a2a2a, 0x8a8a8a, 0xb02a2a, 0x2a3a8a, 0xe0e0e0, 0x3a6a3a, 0xd0b040];

  // ---------- people: small articulated figures (tunic, head, limbs), instanced; arms and legs swing as they walk ----------
  // forward is +X, up +Y. aPart: x = which part (0 body, 1 head, 2/3 legs, 4/5 arms), y = height of the joint it swings from, z = 1 for bare skin
  function figureGeometry() {
    const pos = [], nor = [], part = [];
    const box = (cx, cy, cz, sx, sy, sz, id, piv, skin, taper) => {
      const hx = sx / 2, hy = sy / 2, hz = sz / 2; const t = taper === undefined ? 1 : taper;           // taper: the top is this much narrower than the bottom
      const c = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [-hx * t, hy, -hz * t], [hx * t, hy, -hz * t], [hx * t, hy, hz * t], [-hx * t, hy, hz * t]];
      const faces = [[0, 1, 2, 3, 0, -1, 0], [7, 6, 5, 4, 0, 1, 0], [4, 5, 1, 0, 0, 0, -1], [6, 7, 3, 2, 0, 0, 1], [5, 6, 2, 1, 1, 0, 0], [7, 4, 0, 3, -1, 0, 0]];
      for (const f of faces) for (const k of [0, 1, 2, 0, 2, 3]) { const v = c[f[k]]; pos.push(cx + v[0], cy + v[1], cz + v[2]); nor.push(f[4], f[5], f[6]); part.push(id, piv, skin); }
    };
    box(0, 1.13, 0, 0.21, 0.54, 0.37, 0, 0, 0, 0.9);              // chest
    box(0, 0.74, 0, 0.25, 0.32, 0.36, 0, 0, 0, 0.82);             // the skirt of the tunic
    box(0, 0.40, 0.09, 0.11, 0.80, 0.12, 2, 0.80, 1); box(0, 0.40, -0.09, 0.11, 0.80, 0.12, 3, 0.80, 1);   // legs
    box(0, 1.10, 0.235, 0.09, 0.56, 0.09, 4, 1.36, 1); box(0, 1.10, -0.235, 0.09, 0.56, 0.09, 5, 1.36, 1);  // arms
    const head = new THREE.IcosahedronGeometry(0.118, 1).toNonIndexed(); const hp = head.attributes.position.array, hn = head.attributes.normal.array;
    for (let i = 0; i < hp.length; i += 3) { pos.push(hp[i], hp[i + 1] * 1.12 + 1.57, hp[i + 2]); nor.push(hn[i], hn[i + 1], hn[i + 2]); part.push(1, 0, 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 3));
    return g;
  }
  const P_VERT = `
    attribute vec3 aPart; attribute float aPhase;      // instanceColor is declared by three.js for an instanced mesh that has colours
    uniform float uTime; varying vec3 vN, vCol, vView; varying float vSkin, vY;
    void main() {
      vec3 p = position, n = normal;
      float swing = sin(uTime * 7.0 + aPhase * 6.2832);
      float a = aPart.x < 1.5 ? 0.0 : (aPart.x < 2.5 ? swing : aPart.x < 3.5 ? -swing : aPart.x < 4.5 ? -swing * 0.7 : swing * 0.7) * 0.55;
      if (a != 0.0) { float c = cos(a), s = sin(a); vec2 q = vec2(p.x, p.y - aPart.y); p.x = q.x * c - q.y * s; p.y = aPart.y + q.x * s + q.y * c; n.xy = vec2(n.x * c - n.y * s, n.x * s + n.y * c); }
      p.y += abs(swing) * 0.025;                                    // the bob of a walk
      vSkin = aPart.z; vY = position.y; vCol = instanceColor;
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vView = mv.xyz;
      vN = normalize(normalMatrix * (mat3(instanceMatrix) * n));
      gl_Position = projectionMatrix * mv;
    }`;
  const P_FRAG = `
    precision highp float; uniform vec3 uSunV, uUpV; uniform float uDay, uCamAlt;
    varying vec3 vN, vCol, vView; varying float vSkin, vY;
    void main() {
      vec3 n = normalize(vN);
      vec3 col = mix(vCol, vec3(0.74, 0.56, 0.42), vSkin);
      if (vSkin > 0.5 && vY > 1.60) col = vec3(0.16, 0.12, 0.09);                  // hair
      float diff = max(dot(n, uSunV), 0.0), sky = 0.5 + 0.5 * dot(n, uUpV);
      vec3 amb = mix(vec3(0.07, 0.08, 0.12) * (0.7 + 0.5 * sky), vec3(0.32, 0.34, 0.38) * (0.45 + 0.75 * sky) + vec3(0.27, 0.22, 0.155) * (1.0 - sky), uDay);
      vec3 lit = col * (amb + diff * 0.82 * uDay);
      float distKm = length(vView) * 6371.0; float low = smoothstep(0.035, 0.002, uCamAlt);
      float fog = (1.0 - exp(-distKm / 260.0)) * low * 0.92;
      gl_FragColor = vec4(mix(lit, mix(vec3(0.01, 0.015, 0.035), vec3(0.70, 0.80, 0.92), uDay), fog), 1.0);
    }`;

  const C_VERT = `
    attribute float aAge, aSize; uniform float uFovK; varying float vAge;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vAge = aAge; float sz = aSize / ${R_M.toFixed(1)} * uFovK / max(-mv.z, 1e-7); gl_PointSize = clamp(sz, 1.5, 40.0); gl_Position = projectionMatrix * mv; }`;
  const C_FRAG = `
    precision mediump float; uniform float uDay; varying float vAge;
    void main() { float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.2, r) * (1.0 - vAge) * 0.55 * (0.3 + 0.7 * uDay); if (a < 0.02) discard; gl_FragColor = vec4(vec3(0.97), a); }`;

  class Movers {
    constructor({ scene, terrain, world }) {
      this.scene = scene; this.terrain = terrain; this.world = world; this.exag = terrain.exag;
      this.inst = {}; this.counts = {};
      for (const k in CAPS) {
        const geo = world.arche[k] ? world.arche[k].clone() : null; if (!geo) continue;
        const info = new THREE.InstancedBufferAttribute(new Float32Array(CAPS[k] * 4), 4); info.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aInfo', info);
        const m = new THREE.InstancedMesh(geo, world.bMat, CAPS[k]); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPS[k] * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
        this.inst[k] = { mesh: m, info }; scene.add(m);
      }
      // people: one instanced figure
      { const g = figureGeometry(); const ph = new THREE.InstancedBufferAttribute(new Float32Array(MAXPEOPLE), 1); ph.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aPhase', ph); this.pphase = ph;
        const bu = world.bUniforms; this.puni = { uSunV: bu.uSunV, uUpV: bu.uUpV, uDay: bu.uDay, uCamAlt: bu.uCamAlt, uTime: { value: 0 } };
        const pm = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({ uniforms: this.puni, vertexShader: P_VERT, fragmentShader: P_FRAG }), MAXPEOPLE); pm.count = 0; pm.frustumCulled = false; pm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        pm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXPEOPLE * 3).fill(1), 3); pm.instanceColor.setUsage(THREE.DynamicDrawUsage);
        this.people = pm; scene.add(pm); if (window.SHADOWS) SHADOWS.caster(pm); this._pm = new THREE.Matrix4(); }
      // contrails: a ring buffer of puffs per plane
      const cg = new THREE.BufferGeometry(); const NC = CAPS.plane * TRAIL_N;
      this.cpos = new Float32Array(NC * 3); this.cage = new Float32Array(NC); this.csize = new Float32Array(NC);
      cg.setAttribute('position', new THREE.BufferAttribute(this.cpos, 3).setUsage(THREE.DynamicDrawUsage)); cg.setAttribute('aAge', new THREE.BufferAttribute(this.cage, 1).setUsage(THREE.DynamicDrawUsage)); cg.setAttribute('aSize', new THREE.BufferAttribute(this.csize, 1).setUsage(THREE.DynamicDrawUsage)); cg.setDrawRange(0, 0);
      this.cuni = { uFovK: { value: 1000 }, uDay: { value: 1 } };
      this.contrails = new THREE.Points(cg, new THREE.ShaderMaterial({ uniforms: this.cuni, vertexShader: C_VERT, fragmentShader: C_FRAG, transparent: true, depthWrite: false })); this.contrails.frustumCulled = false; this.contrails.renderOrder = 6; scene.add(this.contrails);
      this.planes = []; this.lastPlanes = { lon: 999, lat: 999, t: -1e9 }; this.trailT = 0;
      this.agents = []; this.walkers = []; this.last = { lon: 999, lat: 999, t: -1e9, dist: 0 }; this.lastShips = { lon: 999, lat: 999, t: -1e9 }; this.ships = [];
      this.enabled = true; this.stats = { agents: 0, walkers: 0, ships: 0 };
      this._m = new THREE.Matrix4();
    }
    // ---------- spawning ----------
    respawn(cam, sim, decal) {
      const T = this.terrain; const agents = []; const walkers = [];
      const near = cam.dist < 0.012;                  // ~75 km: streets get their traffic (towns are drawn at strategy-map scale)
      const veryNear = cam.dist < 0.005;              // ~30 km: people
      const cy0 = Math.floor((90 - cam.lat) / 180 * H), cx0 = Math.floor((cam.lon + 180) / 360 * W);
      if (near) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const y = cy0 + dy; if (y < 0 || y >= H) continue; const x = ((cx0 + dx) % W + W) % W; const i = y * W + x;
          const lvl = sim.level[i]; if (!lvl || sim.owner[i] < 0) continue; const c = sim.civs[sim.owner[i]]; if (!c) continue;
          const [sLon, sLat] = TOWN.siteOf(sim, i, c, T, decal); const dKm = GEO.distKm(cam.lon, cam.lat, sLon, sLat);
          const L0 = TOWN.layout(sim, i, c, { coarse: false }); if (!L0.streets.length) continue;
          const cl = Math.max(0.15, Math.cos(sLat * D2R)); const kS = L0.k || 1; const kP = kS * 0.6; // people and cars are drawn big enough to see beside the big houses
          // long streets are split into ~70 m pieces so the crowd spreads evenly; heights are sampled once per piece
          if (!L0.sub) { const sub = []; for (const st of L0.streets) { const len = Math.hypot(st[2] - st[0], st[3] - st[1]); const n = Math.max(1, Math.ceil(len / (70 * kS))); for (let k = 0; k < n; k++) { const a = k / n, b = (k + 1) / n; sub.push([st[0] + (st[2] - st[0]) * a, st[1] + (st[3] - st[1]) * a, st[0] + (st[2] - st[0]) * b, st[1] + (st[3] - st[1]) * b, st[4]]); } } L0.sub = sub; }
          const L = { streets: L0.sub, streetH: L0.streetH };
          const hKey = (T.meshVersion || 0) + '|' + T.dispOn;
          if (!L0.streetH || L0.streetHKey !== hKey) { const vc = new Map(); L0.streetHKey = hKey; L0.streetH = new Float32Array(L.streets.length * 2); L.streets.forEach((st, k) => { L0.streetH[k * 2] = T.meshHeightAt(sLon + st[0] / (R_M * cl * D2R), sLat + st[1] / (R_M * D2R), vc); L0.streetH[k * 2 + 1] = T.meshHeightAt(sLon + st[2] / (R_M * cl * D2R), sLat + st[3] / (R_M * D2R), vc); }); L.streetH = L0.streetH; }
          const era = c.era; const band = era === 0 ? 0 : era <= 2 ? 1 : era === 3 ? 2 : era === 4 ? 3 : era === 5 ? 4 : era === 6 ? 5 : era === 7 ? 6 : 7;
          // pieces of street near the camera (metres from the camera point on the ground)
          const camX = (cam.lon - sLon) * R_M * cl * D2R, camZ = (cam.lat - sLat) * R_M * D2R;
          const nearIdx = []; const reach = (veryNear ? 700 : 2500) * kS;
          for (let k = 0; k < L.streets.length; k++) { const st = L.streets[k]; const d = Math.hypot((st[0] + st[2]) / 2 - camX, (st[1] + st[3]) / 2 - camZ); if (d < reach) nearIdx.push(k); }
          if (!nearIdx.length) continue;
          // the square itself: people crossing it every which way
          if (veryNear && dKm < 4 * kS && Math.hypot(camX, camZ) < L0.plaza + 600 * kS) {
            const nQ = 10 + lvl * 8; const pr = L0.plaza * 0.9;
            for (let k = 0; k < nQ && walkers.length < MAXPEOPLE; k++) { const a0 = hash(i, 5700 + k) * 6.283, r0 = Math.sqrt(hash(i, 5710 + k)) * pr, a1 = hash(i, 5720 + k) * 6.283, r1 = Math.sqrt(hash(i, 5730 + k)) * pr; const st = [Math.cos(a0) * r0, Math.sin(a0) * r0, Math.cos(a1) * r1, Math.sin(a1) * r1, 0]; const len = Math.hypot(st[2] - st[0], st[3] - st[1]); if (len < 3) continue; const vc = new Map(); const h0 = T.meshHeightAt(sLon + st[0] / (R_M * cl * D2R), sLat + st[1] / (R_M * D2R), vc), h1 = T.meshHeightAt(sLon + st[2] / (R_M * cl * D2R), sLat + st[3] / (R_M * D2R), vc); walkers.push({ sLon, sLat, cl, st, h0, h1, side: 0, len, t: hash(i, 5740 + k) * len, dir: 1, speed: (0.9 + hash(i, 5750 + k) * 0.5) * kP, color: CLOTHES[band][Math.floor(hash(i, 5760 + k) * CLOTHES[band].length)], phase: hash(i, 5770 + k), size: 2.1 * kP }); }
          }
          // people
          if (veryNear && dKm < 4 * kS) {
            const perPiece = (era >= 6 ? 2.2 : 3.2) * [0, 0.6, 1, 1.2, 1.4][lvl];
            const nP = Math.min(1400, Math.round(nearIdx.length * perPiece));
            for (let k = 0; k < nP && walkers.length < MAXPEOPLE; k++) {
              const si = nearIdx[Math.floor(hash(i, 5000 + k) * nearIdx.length) % nearIdx.length]; const st = L.streets[si];
              const len = Math.hypot(st[2] - st[0], st[3] - st[1]); if (len < 4) continue;
              const side = (hash(i, 5100 + k) - 0.5) * st[4] * 1.4;
              walkers.push({ sLon, sLat, cl, st, h0: L.streetH[si * 2], h1: L.streetH[si * 2 + 1], side, len, t: hash(i, 5200 + k) * len, dir: hash(i, 5300 + k) < 0.5 ? 1 : -1, speed: (1.0 + hash(i, 5400 + k) * 0.6) * kP, color: CLOTHES[band][Math.floor(hash(i, 5500 + k) * CLOTHES[band].length)], phase: hash(i, 5600 + k), size: 2.1 * kP });
            }
          }
          // street vehicles
          if (era >= 6 && dKm < 12 * kS) {
            const nC = Math.min(600, Math.round(nearIdx.length * 0.5 * [0, 0.3, 0.7, 1, 1.2][lvl]));
            for (let k = 0; k < nC; k++) {
              const si = nearIdx[Math.floor(hash(i, 6000 + k) * nearIdx.length) % nearIdx.length]; const st = L.streets[si];
              const len = Math.hypot(st[2] - st[0], st[3] - st[1]); if (len < 20 * kS) continue;
              const dir = hash(i, 6300 + k) < 0.5 ? 1 : -1;
              agents.push({ kind: 'car', sLon, sLat, cl, st, h0: L.streetH[si * 2], h1: L.streetH[si * 2 + 1], side: -dir * st[4] * 0.45, len, t: hash(i, 6200 + k) * len, dir, speed: (7 + hash(i, 6400 + k) * 8) * kP, color: CARS[Math.floor(hash(i, 6500 + k) * CARS.length)], w: 4.4 * kP, h: 1.5 * kP, d: 1.9 * kP, era, k: kP });
            }
          }
        }
      }
      // builders at every site near the camera: a few people working the ground around it, back and forth
      if (veryNear && this.world && this.world.sites) {
        const WORKWEAR = [[0x6b5a44, 0x8a7355, 0xa08868], [0x8a5a3a, 0x6b6b4a, 0xb0925e], [0x8a5a3a, 0x6b6b4a, 0xc9c0a8], [0x6a5a3a, 0x8a7355, 0xd9d0b8], [0x6a5a3a, 0x5a3a2a, 0xd9d0b8], [0x3a3a3a, 0x4a3a2a, 0x6a6a6a], [0xf08a1a, 0xf0c02a, 0x2a2a2a], [0xf08a1a, 0xf0c02a, 0x2aa05a]];
        for (const st0 of this.world.sites) {
          if (walkers.length >= MAXPEOPLE - 20) break;
          if (GEO.distKm(cam.lon, cam.lat, st0.lon, st0.lat) > 25 * st0.k) continue;
          const cl = Math.max(0.15, Math.cos(st0.lat * D2R)); const kP = st0.k * 0.6; const band = st0.era === 0 ? 0 : st0.era <= 2 ? 1 : st0.era === 3 ? 2 : st0.era === 4 ? 3 : st0.era === 5 ? 4 : st0.era === 6 ? 5 : st0.era === 7 ? 6 : 7;
          const hg = T.meshHeightAt(st0.lon, st0.lat, this._vc || (this._vc = new Map()));
          const n = 3 + Math.min(5, Math.round(Math.max(st0.w, st0.d) / (12 * st0.k))); const seedK = Math.round(st0.lon * 1000 + st0.lat * 7919);
          for (let k = 0; k < n; k++) {
            const a = hash(seedK, k) * 6.283, rr = Math.max(st0.w, st0.d) * (0.55 + hash(seedK, 10 + k) * 0.35); const len = 6 * kP + hash(seedK, 20 + k) * 12 * kP;
            const x0 = Math.cos(a) * rr, z0 = Math.sin(a) * rr; const b = a + 1.57 + (hash(seedK, 30 + k) - 0.5);
            const st = [x0, z0, x0 + Math.cos(b) * len, z0 + Math.sin(b) * len, 0];
            walkers.push({ sLon: st0.lon, sLat: st0.lat, cl, st, h0: hg, h1: hg, side: 0, len, t: hash(seedK, 40 + k) * len, dir: 1, speed: (0.6 + hash(seedK, 50 + k) * 0.5) * kP, color: WORKWEAR[band][k % 3], phase: hash(seedK, 60 + k), size: 2.1 * kP });
          }
        }
      }
      // fishing boats working the water off every coastal settlement
      if (cam.dist < 0.03) {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const y = cy0 + dy; if (y < 0 || y >= H) continue; const x = ((cx0 + dx) % W + W) % W; const i = y * W + x;
          const lvl = sim.level[i]; if (!lvl || sim.owner[i] < 0 || !(sim.flags[i] & 4)) continue; const c = sim.civs[sim.owner[i]]; if (!c) continue;
          const [sLon, sLat] = TOWN.siteOf(sim, i, c, T, decal); if (GEO.distKm(cam.lon, cam.lat, sLon, sLat) > 120) continue;
          const R = TOWN.radiusM(sim, i, c); const cl = Math.max(0.15, Math.cos(sLat * D2R)); const mLon = 1 / (R_M * cl * D2R), mLat = 1 / (R_M * D2R);
          // find open water: probe outward in 16 directions
          // open water: sea first (imagery alpha below 0.4), big lakes second; the spot and a ring around it must all be water
          let best = null; for (let pass = 0; pass < 2 && !best; pass++) { const lim = pass ? 0.62 : 0.4; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; for (const dist of [R * 1.6 + 400, R * 2.2 + 900, R * 3 + 1600, R * 4 + 2600]) { const lo = sLon + Math.cos(a) * dist * mLon, la = sLat + Math.sin(a) * dist * mLat; const wa = T.waterAlpha(lo, la); if (wa < 0 || wa >= lim) continue; let ok = true; for (let q = 0; q < 6 && ok; q++) { const b = q / 6 * Math.PI * 2; const w2 = T.waterAlpha(lo + Math.cos(b) * 450 * mLon, la + Math.sin(b) * 450 * mLat); if (w2 < 0 || w2 >= lim) ok = false; } if (ok && (!best || dist < best.d)) best = { lo, la, d: dist }; } } }
          if (!best) continue;
          const n = Math.min(10, 2 + lvl * 2 + ((sim.special[i] & 1) ? 3 : 0)); const era = c.era;
          for (let k = 0; k < n; k++) agents.push({ kind: era >= 6 ? 'ship' : 'boat', circle: { lon: best.lo, lat: best.la, r: (180 + hash(i, 8000 + k) * 500) * SHIP_K, phase: hash(i, 8100 + k) * 6.283, speed: (era >= 6 ? 3 : 1.5) * (0.7 + hash(i, 8200 + k) * 0.6) * SHIP_K * 0.5, dir: hash(i, 8300 + k) < 0.5 ? 1 : -1 }, color: era >= 6 ? [0xd9dde2, 0x2a4a7a, 0xb84a3a][k % 3] : 0x7c5a38, w: (era >= 6 ? 16 : 6.5) * SHIP_K, h: (era >= 6 ? 5 : 2.4) * SHIP_K, d: (era >= 6 ? 5 : 2.4) * SHIP_K, era, k: SHIP_K });
        }
      }
      // roads between towns: carts before the engine, cars after
      if (near && decal && decal.roads) {
        for (const r of decal.roads) {
          const era = r.era; const kind = era >= 6 ? 'car' : era >= 1 ? 'cart' : null; if (!kind) continue;
          const nA = Math.min(160, Math.max(2, Math.round(r.lenKm * (kind === 'car' ? 2.5 : 0.7))));
          for (let k = 0; k < nA; k++) agents.push({ kind, road: r, t: hash(r.i, 7000 + k), dir: k % 2 ? 1 : -1, speed: (kind === 'car' ? 16 + hash(r.i, 7100 + k) * 8 : 1.2 + hash(r.i, 7100 + k) * 0.6) * ROAD_K, color: kind === 'car' ? CARS[Math.floor(hash(r.i, 7200 + k) * CARS.length)] : 0x7a5a3a, w: (kind === 'car' ? 4.6 : 5) * ROAD_K, h: (kind === 'car' ? 1.5 : 1.7) * ROAD_K, d: (kind === 'car' ? 1.9 : 1.7) * ROAD_K, era, k: ROAD_K });
          if (r.rail) for (let k = 0; k < 2; k++) agents.push({ kind: 'train', road: r, t: hash(r.i, 7300 + k), dir: k ? 1 : -1, speed: (28 + hash(r.i, 7400 + k) * 10) * ROAD_K * 0.6, color: era >= 7 ? 0xd9dde2 : 0x3a3a3a, w: 90 * ROAD_K * 0.6, h: 4.2 * ROAD_K, d: 3.2 * ROAD_K, era, side: -1, k: ROAD_K });
        }
      }
      this.agents = agents; this.walkers = walkers;
    }
    // airliners between the big cities of the modern age, with contrails
    respawnPlanes(cam, sim) {
      const planes = []; const T = this.terrain;
      const rad = 40; const cy0 = Math.floor((90 - cam.lat) / 180 * H), cx0 = Math.floor((cam.lon + 180) / 360 * W);
      const cities = [];
      for (let dy = -rad; dy <= rad; dy++) { const y = cy0 + dy; if (y < 0 || y >= H) continue; for (let dx = -rad; dx <= rad; dx += 1) { const x = ((cx0 + dx) % W + W) % W; const i = y * W + x; if (sim.level[i] < 3 || sim.owner[i] < 0) continue; const c = sim.civs[sim.owner[i]]; if (!c || c.era < 7) continue; const [lon, lat] = TOWN.siteOf(sim, i, c, T, null); cities.push({ i, lon, lat, o: c.id, v: GEO.toVec(lon, lat), big: sim.level[i] >= 4 }); } }
      if (cities.length < 2) { this.planes = planes; return; }
      const seen = new Set();
      for (const a of cities) {
        const cand = cities.filter(b => b !== a && (b.o === a.o || !sim.isAtWar(sim.civs[a.o], b.o))).map(b => [GEO.distKm(a.lon, a.lat, b.lon, b.lat), b]).filter(e => e[0] > 180 && e[0] < 4500).sort((p, q) => p[0] - q[0]).slice(0, a.big ? 3 : 2);
        for (const [d, b] of cand) { const key = Math.min(a.i, b.i) * 1e6 + Math.max(a.i, b.i); if (seen.has(key)) continue; seen.add(key); if (planes.length >= CAPS.plane) break; const n = a.big && b.big ? 2 : 1; for (let k = 0; k < n; k++) planes.push({ a: a.v, b: b.v, lenKm: d, t: hash(a.i, 9000 + k * 13 + b.i % 89), dir: k ? 1 : -1, speed: 2000, trail: new Float32Array(TRAIL_N * 3), trailAge: new Float32Array(TRAIL_N).fill(1), head: 0 }); }
        if (planes.length >= CAPS.plane) break;
      }
      this.planes = planes;
    }
    respawnShips(cam, sim) {
      const ships = []; const T = this.terrain;
      const rad = 10; const cy0 = Math.floor((90 - cam.lat) / 180 * H), cx0 = Math.floor((cam.lon + 180) / 360 * W);
      const ports = [];
      for (let dy = -rad; dy <= rad; dy++) { const y = cy0 + dy; if (y < 0 || y >= H) continue; for (let dx = -rad; dx <= rad; dx++) { const x = ((cx0 + dx) % W + W) % W; const i = y * W + x; if ((sim.special[i] & 1) && sim.level[i] && sim.owner[i] >= 0) { const c = sim.civs[sim.owner[i]]; if (!c) continue; const [lon, lat] = TOWN.siteOf(sim, i, c, T, null); ports.push({ i, lon, lat, o: sim.owner[i], era: c.era, v: GEO.toVec(lon, lat) }); } } }
      const seen = new Set();
      for (const p of ports) {
        let best = null, bd = 900;
        for (const q of ports) { if (q === p) continue; const d = GEO.distKm(p.lon, p.lat, q.lon, q.lat); if (d < 25) continue; const ok = q.o === p.o || !sim.isAtWar(sim.civs[p.o], q.o); if (ok && d < bd) { bd = d; best = q; } }
        if (!best) continue; const key = Math.min(p.i, best.i) * 1e6 + Math.max(p.i, best.i); if (seen.has(key)) continue; seen.add(key);
        const era = Math.max(p.era, best.era); const kind = era < 3 ? 'boat' : 'ship'; const n = era >= 6 ? 3 : 2;
        for (let k = 0; k < n; k++) ships.push({ kind, a: p.v, b: best.v, lenKm: bd, t: hash(p.i, 8000 + k * 7 + best.i % 97), dir: k % 2 ? 1 : -1, speed: (era >= 6 ? 11 : era >= 3 ? 5 : 2.5) * SHIP_K * 0.5, color: era >= 6 ? [0x3a4048, 0x8a2a2a, 0xd9d9d9][k % 3] : 0x7c5a38, w: (era >= 6 ? 120 : era >= 3 ? 30 : 9) * SHIP_K, h: (era >= 6 ? 22 : era >= 3 ? 9 : 2.6) * SHIP_K, d: (era >= 6 ? 22 : era >= 3 ? 8 : 3) * SHIP_K, era, k: SHIP_K });
      }
      this.ships = ships;
    }
    // ---------- per frame ----------
    update(cam, sim, decal, now, dt, day, viewportH, fovDeg) {
      if (!sim || !this.enabled) { this.clear(); return; }
      this.puni.uTime.value = now / 1000;
      if (cam.dist > 0.6) { this.clear(); return; }
      const moved = GEO.distKm(cam.lon, cam.lat, this.last.lon, this.last.lat) > Math.max(0.12, cam.dist * 6371 * 0.3) || Math.abs(Math.log((cam.dist || 1e-6) / (this.last.dist || 1e-6))) > 0.4;
      if (moved || now - this.last.t > 6000) { this.last = { lon: cam.lon, lat: cam.lat, t: now, dist: cam.dist }; this.respawn(cam, sim, decal); }
      const movedS = GEO.distKm(cam.lon, cam.lat, this.lastShips.lon, this.lastShips.lat) > 60;
      if (movedS || now - this.lastShips.t > 15000) { this.lastShips = { lon: cam.lon, lat: cam.lat, t: now }; this.respawnShips(cam, sim); }
      const movedP = GEO.distKm(cam.lon, cam.lat, this.lastPlanes.lon, this.lastPlanes.lat) > 400;
      if (movedP || now - this.lastPlanes.t > 12000) { this.lastPlanes = { lon: cam.lon, lat: cam.lat, t: now }; this.respawnPlanes(cam, sim); }
      this.cuni.uDay.value = day; this.cuni.uFovK.value = viewportH / (2 * Math.tan(fovDeg * 0.5 * D2R));
      this.animate(dt, sim);
    }
    clear() { if (this.stats.agents || this.stats.walkers || this.stats.ships || this.stats.planes) { for (const k in this.inst) this.inst[k].mesh.count = 0; this.people.count = 0; this.contrails.geometry.setDrawRange(0, 0); this.agents = []; this.walkers = []; this.ships = []; this.planes = []; this.stats = { agents: 0, walkers: 0, ships: 0, planes: 0 }; } }
    // place one instance: lon/lat/height in metres, yaw from east toward north
    placeAt(kind, lon, lat, hg, yaw, w, h, d, color, era, krep) {
      const I = this.inst[kind]; if (!I) return; const idx = this.counts[kind] || 0; if (idx >= CAPS[kind]) return;
      const lo = lon * D2R, la = lat * D2R; const slo = Math.sin(lo), clo = Math.cos(lo), sla = Math.sin(la), cla = Math.cos(la);
      const Ex = -slo, Ez = -clo; const Nx = -sla * clo, Ny = cla, Nz = sla * slo; const Ux = cla * clo, Uy = sla, Uz = -cla * slo;
      const cy = Math.cos(yaw), sy = Math.sin(yaw); const ws = w / R_M, hs = h / R_M, ds = d / R_M;
      const el = this._m.elements;
      el[0] = (cy * Ex + sy * Nx) * ws; el[1] = (sy * Ny) * ws; el[2] = (cy * Ez + sy * Nz) * ws; el[3] = 0;
      el[4] = Ux * hs; el[5] = Uy * hs; el[6] = Uz * hs; el[7] = 0;
      el[8] = (sy * Ex - cy * Nx) * ds; el[9] = (-cy * Ny) * ds; el[10] = (sy * Ez - cy * Nz) * ds; el[11] = 0;
      const rr = 1 + (Math.max(hg, 0) * this.exag) / R_M; el[12] = Ux * rr; el[13] = Uy * rr; el[14] = Uz * rr; el[15] = 1;
      I.mesh.setMatrixAt(idx, this._m); const ca = I.mesh.instanceColor.array; ca[idx * 3] = ((color >> 16) & 255) / 255; ca[idx * 3 + 1] = ((color >> 8) & 255) / 255; ca[idx * 3 + 2] = (color & 255) / 255;
      I.info.setXYZW(idx, era, (idx % 97) / 97, TOWN.packStyle(kind === 'cart' ? 7 : kind === 'plane' ? 1 : 4, 4, 0, 0), krep || 1); this.counts[kind] = idx + 1;
    }
    animate(dt, sim) {
      for (const k in this.inst) this.counts[k] = 0;
      if (!this._vc || this._vcV !== this.terrain.meshVersion || this._vc.size > 20000) { this._vc = new Map(); this._vcV = this.terrain.meshVersion; }
      const exag = this.exag; const mLon = (cl) => 1 / (R_M * cl * D2R), mLat = 1 / (R_M * D2R);
      // street agents and road agents
      for (const a of this.agents) {
        if (a.st) {
          a.t += a.dir * a.speed * dt; if (a.t > a.len) { a.t = a.len; a.dir = -1; a.side = -a.side; } else if (a.t < 0) { a.t = 0; a.dir = 1; a.side = -a.side; }
          const u = a.t / a.len; const st = a.st; const dx = (st[2] - st[0]) / a.len, dz = (st[3] - st[1]) / a.len;
          const x = st[0] + dx * a.t - dz * a.side, z = st[1] + dz * a.t + dx * a.side; const hg = a.h0 + (a.h1 - a.h0) * u;
          this.placeAt(a.kind, a.sLon + x * mLon(a.cl), a.sLat + z * mLat, hg, Math.atan2(dz * a.dir, dx * a.dir), a.w, a.h, a.d, a.color, a.era, a.k);
        } else if (a.circle) {
          const cc = a.circle; cc.phase += cc.dir * cc.speed * dt / cc.r; const cl = Math.max(0.15, Math.cos(cc.lat * D2R));
          const lon = cc.lon + Math.cos(cc.phase) * cc.r / (R_M * cl * D2R), lat = cc.lat + Math.sin(cc.phase) * cc.r / (R_M * D2R);
          if (a.hT === undefined || Math.abs(lon - a.hLon) * cl + Math.abs(lat - a.hLat) > 25 / (R_M * D2R) || a.hV !== this.terrain.meshVersion) { a.hg = this.terrain.meshHeightAt(lon, lat, this._vc); a.hLon = lon; a.hLat = lat; a.hT = 1; a.hV = this.terrain.meshVersion; }   // inland water sits on the land surface
          this.placeAt(a.kind, lon, lat, a.hg, cc.phase + (cc.dir > 0 ? Math.PI / 2 : -Math.PI / 2), a.w, a.h, a.d, a.color, a.era, a.k);
        } else if (a.road) {
          const r = a.road; const lenM = r.lenKm * 1000; a.t += a.dir * a.speed * dt / lenM; if (a.t > 1) { a.t = 1; a.dir = -1; } else if (a.t < 0) { a.t = 0; a.dir = 1; }
          const [lon, lat] = r.f(a.t); const eps = 0.002; const [lon2, lat2] = r.f(clamp(a.t + eps * a.dir, 0, 1));
          const cl = Math.max(0.15, Math.cos(lat * D2R)); const yaw = Math.atan2(lat2 - lat, (lon2 - lon) * cl);
          // ground height: sampled from the drawn mesh, refreshed as the agent moves (the road's own samples are 4 km apart)
          if (a.hT === undefined || Math.abs(lon - a.hLon) * cl + Math.abs(lat - a.hLat) > 20 / (R_M * D2R) || a.hV !== this.terrain.meshVersion) { a.hg = this.terrain.meshHeightAt(lon, lat, this._vc); a.hLon = lon; a.hLat = lat; a.hT = 1; a.hV = this.terrain.meshVersion; }
          const hg = a.hg;
          // keep to the right of the road; trains run on the rail laid beside it
          const off = (a.kind === 'train' ? -22 : 2.4 * (a.kind === 'car' ? 1 : 0.6)) * (a.k || 1); const nx = -Math.sin(yaw) * off, nz = Math.cos(yaw) * off;
          this.placeAt(a.kind, lon - nx * mLon(cl), lat - nz * mLat, hg, yaw, a.w, a.h, a.d, a.color, a.era, a.k);
        }
      }
      // ships on great circles
      const va = new THREE.Vector3(), vb = new THREE.Vector3();
      for (const s of this.ships) {
        s.t += s.dir * s.speed * dt / (s.lenKm * 1000); if (s.t > 1) { s.t = 1; s.dir = -1; } else if (s.t < 0) { s.t = 0; s.dir = 1; }
        const p = va.copy(s.a).lerp(s.b, s.t).normalize(); const q = vb.copy(s.a).lerp(s.b, clamp(s.t + 0.001 * s.dir, 0, 1)).normalize();
        const [lon, lat] = GEO.fromVec(p); const [lon2, lat2] = GEO.fromVec(q); const cl = Math.max(0.15, Math.cos(lat * D2R));
        const yaw = Math.atan2(lat2 - lat, (lon2 - lon) * cl);
        this.placeAt(s.kind, lon, lat, 0, yaw, s.w, s.h, s.d, s.color, s.era, s.k);
      }
      // planes at cruising height, laying contrails behind them
      this.trailT += dt; const addPuff = this.trailT >= TRAIL_DT; if (addPuff) this.trailT = 0;
      const highUp = sim ? 1 : 0; let ci = 0; const cp = this.cpos, cag = this.cage, cs = this.csize;
      for (const s of this.planes) {
        s.t += s.dir * s.speed * dt / (s.lenKm * 1000); if (s.t > 1) { s.t = 1; s.dir = -1; s.trailAge.fill(1); } else if (s.t < 0) { s.t = 0; s.dir = 1; s.trailAge.fill(1); }
        const p = va.copy(s.a).lerp(s.b, s.t).normalize(); const q = vb.copy(s.a).lerp(s.b, clamp(s.t + 0.001 * s.dir, 0, 1)).normalize();
        const [lon, lat] = GEO.fromVec(p); const [lon2, lat2] = GEO.fromVec(q); const cl = Math.max(0.15, Math.cos(lat * D2R));
        const yaw = Math.atan2(lat2 - lat, (lon2 - lon) * cl); const cruise = 10500;
        this.placeAt('plane', lon, lat, cruise, yaw, 140, 24, 140, 0xf2f4f6, 7, 2);
        for (let k = 0; k < TRAIL_N; k++) s.trailAge[k] = Math.min(1, s.trailAge[k] + dt / 14);
        if (addPuff) { const rr = 1 + cruise * exag / R_M; const j = s.head; s.trail[j * 3] = p.x * rr; s.trail[j * 3 + 1] = p.y * rr; s.trail[j * 3 + 2] = p.z * rr; s.trailAge[j] = 0; s.head = (j + 1) % TRAIL_N; }
        for (let k = 0; k < TRAIL_N; k++) { const ag = s.trailAge[k]; if (ag >= 1) continue; cp[ci * 3] = s.trail[k * 3]; cp[ci * 3 + 1] = s.trail[k * 3 + 1]; cp[ci * 3 + 2] = s.trail[k * 3 + 2]; cag[ci] = ag; cs[ci] = 600 + 2600 * ag; ci++; }
      }
      { const g = this.contrails.geometry; g.attributes.position.needsUpdate = true; g.attributes.aAge.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.setDrawRange(0, ci); }
      for (const k in this.inst) { const I = this.inst[k]; I.mesh.count = this.counts[k] || 0; I.mesh.instanceMatrix.needsUpdate = true; I.mesh.instanceColor.needsUpdate = true; I.info.needsUpdate = true; }
      // people
      // people: each figure stands on the ground at life size on its town's scale, facing the way it walks
      let n = 0; const pm = this.people, pmat = this._pm, pe = pmat.elements, pc = pm.instanceColor.array, ph = this.pphase.array;
      for (const a of this.walkers) {
        a.t += a.dir * a.speed * dt; if (a.t > a.len) { a.t = a.len; a.dir = -1; } else if (a.t < 0) { a.t = 0; a.dir = 1; }
        const u = a.t / a.len; const st = a.st; const dx = (st[2] - st[0]) / a.len, dz = (st[3] - st[1]) / a.len;
        const x = st[0] + dx * a.t - dz * a.side, z = st[1] + dz * a.t + dx * a.side; const hg = a.h0 + (a.h1 - a.h0) * u;
        const lon = a.sLon + x * mLon(a.cl), lat = a.sLat + z * mLat;
        const k = (a.size || 2.1) * 0.79 / R_M;                                   // sizes were set for the old sprites: this makes a life-size figure on the town's scale
        const lo = lon * D2R, la = lat * D2R; const slo = Math.sin(lo), clo = Math.cos(lo), sla = Math.sin(la), cla = Math.cos(la);
        const Ex = -slo, Ez = -clo; const Nx = -sla * clo, Ny = cla, Nz = sla * slo; const Ux = cla * clo, Uy = sla, Uz = -cla * slo;
        const fx = dx * a.dir, fz = dz * a.dir;                                    // heading in (east, north)
        const rr = 1 + Math.max(hg, 0) * exag / R_M;
        pe[0] = (fx * Ex + fz * Nx) * k; pe[1] = (fz * Ny) * k; pe[2] = (fx * Ez + fz * Nz) * k; pe[3] = 0;
        pe[4] = Ux * k; pe[5] = Uy * k; pe[6] = Uz * k; pe[7] = 0;
        pe[8] = (fz * Ex - fx * Nx) * k; pe[9] = (-fx * Ny) * k; pe[10] = (fz * Ez - fx * Nz) * k; pe[11] = 0;
        pe[12] = Ux * rr; pe[13] = Uy * rr; pe[14] = Uz * rr; pe[15] = 1;
        pm.setMatrixAt(n, pmat);
        pc[n * 3] = ((a.color >> 16) & 255) / 255; pc[n * 3 + 1] = ((a.color >> 8) & 255) / 255; pc[n * 3 + 2] = (a.color & 255) / 255; ph[n] = a.phase; n++;
      }
      pm.count = n; pm.instanceMatrix.needsUpdate = true; pm.instanceColor.needsUpdate = true; this.pphase.needsUpdate = true;
      this.stats = { agents: this.agents.length, walkers: n, ships: this.ships.length, planes: this.planes.length };
    }
  }
  window.MOVERS = { Movers };
})();
