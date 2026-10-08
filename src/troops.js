// GENESIS troops: the hosts and fleets of army.js on the map. Soldiers in their ranks (instanced figures with spear,
// shield and helmet, a musket from the Renaissance, a rifle in the modern age), a standard in their realm's colours, their
// tents while they rest or lie before a town, the ships of a fleet; a banner on the screen for every host in view, and the
// road the selected one is sent along. Classic script; exposes window.TROOPS.
(function () {
  const R_M = 6371000, D2R = Math.PI / 180, W = 720, H = 360;
  const MAXS = 6000, MAXF = 64;      // soldiers and standards drawn at most
  const K = 9;                       // a soldier is drawn this many times life size (the towns are drawn three to twenty times)
  const SEE = 0.012;                 // the camera nearer than this (in Earth radii, some 76 km) sees the soldiers themselves
  function hash(i, k) { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const cellLL = (i) => { const y = (i / W) | 0, x = i - y * W; return [(x + 0.5) / W * 360 - 180, 90 - (y + 0.5) / H * 180]; };
  const hexOf = (rgb) => ((Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255)) >>> 0;
  const dyed = (rgb) => { const l = 0.3 * rgb[0] + 0.55 * rgb[1] + 0.15 * rgb[2]; return rgb.map((v) => (l + (v - l) * 0.7) * 0.82); };      // (a realm's colour as cloth takes it)
  const css = (rgb) => `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`;

  // ---------- a soldier: the walker of movers.js with his kit ----------
  // forward +X, up +Y. aPart: x = which part moves with what (0 body, 1 head, 2/3 legs, 4 the right arm and what it holds,
  // 5 the left arm and the shield, 6 the spear, 7 the shield, 8 the helmet, 9 the gun), y = the height of the joint it swings
  // from, z = what it is made of (0 cloth in the realm's colour, 1 skin, 2 metal, 3 wood, 4 the shield's face)
  function soldierGeometry() {
    const pos = [], nor = [], part = [];
    const box = (cx, cy, cz, sx, sy, sz, id, piv, mat, taper) => {
      const hx = sx / 2, hy = sy / 2, hz = sz / 2; const t = taper === undefined ? 1 : taper;
      const c = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [-hx * t, hy, -hz * t], [hx * t, hy, -hz * t], [hx * t, hy, hz * t], [-hx * t, hy, hz * t]];
      const faces = [[0, 1, 2, 3, 0, -1, 0], [7, 6, 5, 4, 0, 1, 0], [4, 5, 1, 0, 0, 0, -1], [6, 7, 3, 2, 0, 0, 1], [5, 6, 2, 1, 1, 0, 0], [7, 4, 0, 3, -1, 0, 0]];
      for (const f of faces) for (const k of [0, 1, 2, 0, 2, 3]) { const v = c[f[k]]; pos.push(cx + v[0], cy + v[1], cz + v[2]); nor.push(f[4], f[5], f[6]); part.push(id, piv, mat); }
    };
    const mesh = (g, id, piv, mat, f) => { g = g.toNonIndexed(); const p = g.attributes.position.array, n = g.attributes.normal.array; for (let i = 0; i < p.length; i += 3) { const v = f(p[i], p[i + 1], p[i + 2]); pos.push(v[0], v[1], v[2]); nor.push(n[i], n[i + 1], n[i + 2]); part.push(id, piv, mat); } };
    box(0, 1.13, 0, 0.21, 0.54, 0.37, 0, 0, 0, 0.9);              // chest
    box(0, 0.74, 0, 0.25, 0.32, 0.36, 0, 0, 0, 0.82);             // the skirt of the tunic
    box(0, 0.40, 0.09, 0.11, 0.80, 0.12, 2, 0.80, 1); box(0, 0.40, -0.09, 0.11, 0.80, 0.12, 3, 0.80, 1);   // legs
    box(0.08, 1.12, 0.235, 0.09, 0.52, 0.09, 4, 1.36, 1); box(0, 1.10, -0.235, 0.09, 0.56, 0.09, 5, 1.36, 1);  // arms
    mesh(new THREE.IcosahedronGeometry(0.118, 1), 1, 0, 1, (x, y, z) => [x, y * 1.12 + 1.57, z]);                 // head
    mesh(new THREE.SphereGeometry(0.135, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), 8, 0, 2, (x, y, z) => [x, y + 1.6, z]);      // helmet
    box(0.13, 1.40, 0.30, 0.035, 2.70, 0.035, 6, 1.36, 3); box(0.13, 2.82, 0.30, 0.06, 0.18, 0.05, 6, 1.36, 2, 0.2);         // spear and its head
    mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.05, 14), 7, 1.36, 4, (x, y, z) => [0.2 + y, 1.05 + x, -0.24 + z]);           // shield, round, on the left arm
    box(0.1, 1.62, 0.27, 0.05, 1.25, 0.05, 9, 1.36, 3, 0.8);      // a musket or rifle on the shoulder
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 3));
    return g;
  }
  const AIR_V = window.AIR ? AIR.VERT : '\n    varying vec3 vAirT, vAirL; void air(vec3 p, float n, out vec3 T, out vec3 L) { T = vec3(1.0); L = vec3(0.0); }';
  const AIR_F = window.AIR ? AIR.FRAG : '\n    varying vec3 vAirT, vAirL; vec3 airOver(vec3 c, vec3 T, vec3 L) { return c; }';
  // aGear: x the arms (0 spear and shield, 1 musket, 2 rifle), y the helmet (0 none, 1 bronze, 2 iron, 3 steel), z 1 while it
  // marches, w its own dice
  const S_VERT = `
    attribute vec3 aPart; attribute vec4 aGear;
    uniform float uTime; varying vec3 vN, vCol, vView; varying float vMat, vY, vGear, vHelm;
    ${AIR_V}
    void main() {
      vec3 p = position, n = normal; float id = aPart.x;
      // what this one does not carry is folded away
      bool hide = (id > 5.5 && id < 7.5 && aGear.x > 0.5) || (id > 8.5 && aGear.x < 0.5) || (id > 7.5 && id < 8.5 && aGear.y < 0.5);
      if (hide) p *= 0.0;
      float walk = aGear.z, swing = sin(uTime * 6.0 + aGear.w * 6.2832) * walk;
      float a = id > 1.5 && id < 2.5 ? swing * 0.55 : id > 2.5 && id < 3.5 ? -swing * 0.55 : id > 4.5 && id < 5.5 || (id > 6.5 && id < 7.5) ? swing * 0.15 : 0.0;      // (the arms that carry do not swing)
      if (a != 0.0) { float c = cos(a), s = sin(a); vec2 q = vec2(p.x, p.y - aPart.y); p.x = q.x * c - q.y * s; p.y = aPart.y + q.x * s + q.y * c; n.xy = vec2(n.x * c - n.y * s, n.x * s + n.y * c); }
      p.y += abs(swing) * 0.025;
      if (walk < 0.5) { float sway = sin(uTime * 1.1 + aGear.w * 6.2832) * 0.025; p.x += sway * max(p.y - 0.2, 0.0); }      // (men standing in the ranks shift their weight)
      vMat = aPart.z; vY = position.y; vCol = instanceColor; vGear = aGear.x; vHelm = aGear.y;
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vView = mv.xyz;
      vN = normalize(normalMatrix * (mat3(instanceMatrix) * n));
      air(mv.xyz, 3.0, vAirT, vAirL);
      gl_Position = projectionMatrix * mv;
    }`;
  const S_FRAG = `
    precision highp float; uniform vec3 uSunV, uUpV, uSunCol; uniform float uDay, uDusk;
    varying vec3 vN, vCol, vView; varying float vMat, vY, vGear, vHelm;
    ${AIR_F}
    void main() {
      vec3 n = normalize(vN); vec3 col;
      vec3 metal = vHelm < 1.5 ? vec3(0.62, 0.45, 0.22) : vHelm < 2.5 ? vec3(0.52, 0.53, 0.55) : vec3(0.30, 0.33, 0.27);
      vec3 dyed = mix(vec3(dot(vCol, vec3(0.3, 0.55, 0.15))), vCol, 0.62) * 0.78;      // (the realm's colour as dyed wool: duller and darker than the map's paint)
      if (vMat < 0.5) col = mix(dyed, vec3(0.42, 0.40, 0.30), vGear > 1.5 ? 0.6 : 0.0);                      // (a modern soldier wears drab, with a touch of his colours)
      else if (vMat < 1.5) { col = vec3(0.74, 0.56, 0.42); if (vY < 0.8 && vGear > 0.5) col = vGear > 1.5 ? vec3(0.32, 0.31, 0.24) : vec3(0.22, 0.2, 0.22); if (vY > 1.60) col = vec3(0.16, 0.12, 0.09); }      // (skin; breeches and trousers from the age of muskets; hair)
      else if (vMat < 2.5) col = metal;
      else if (vMat < 3.5) col = vGear > 0.5 ? vec3(0.18, 0.14, 0.11) : vec3(0.45, 0.33, 0.2);
      else col = vCol * 0.8 + vec3(0.02);      // (the shield's face: the realm's colour, painted)
      float diff = max(dot(n, uSunV), 0.0), sky = 0.5 + 0.5 * dot(n, uUpV);
      vec3 amb = mix(vec3(0.25, 0.31, 0.49) * (0.7 + 0.5 * sky), vec3(0.32, 0.34, 0.38) * (0.45 + 0.75 * sky) + vec3(0.27, 0.22, 0.155) * (1.0 - sky), uDay) + vec3(0.27, 0.19, 0.20) * uDusk * (0.5 + 0.6 * sky);
      float spec = vMat > 1.5 && vMat < 2.5 ? pow(max(dot(reflect(-uSunV, n), normalize(-vView)), 0.0), 24.0) * 0.6 : 0.0;
      vec3 lit = col * (amb + diff * 0.82 * uSunCol) + spec * uSunCol;
      gl_FragColor = vec4(airOver(lit, vAirT, vAirL), 1.0);
    }`;

  // ---------- a standard: a pole and a cloth that waves, in the realm's colour ----------
  function standardGeometry() {
    const pos = [], uv = []; const NX = 10, NY = 5;
    // the pole: a thin box (uv.x = -1 marks it)
    const pole = new THREE.BoxGeometry(0.1, 6.0, 0.1).toNonIndexed(); const pp = pole.attributes.position.array;
    for (let i = 0; i < pp.length; i += 3) { pos.push(pp[i], pp[i + 1] + 3.0, pp[i + 2]); uv.push(-1, 0); }
    // the cloth: a grid from the pole outward (x), down from the top (y)
    const o = pos.length / 3;
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { pos.push(i / NX * 2.2, 5.9 - j / NY * 1.4, 0); uv.push(i / NX, j / NY); }
    const ix = []; for (let k = 0; k < pp.length / 3; k++) ix.push(k);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = o + j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; ix.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix);
    return g;
  }
  const F_VERT = `
    attribute float aSeed; uniform float uTime; varying vec2 vUv; varying vec3 vCol, vView;
    ${AIR_V}
    void main() {
      vec3 p = position; vUv = uv; vCol = instanceColor;
      if (uv.x >= 0.0) { float w = uv.x; p.z += sin(uTime * 3.2 - uv.x * 5.0 + aSeed * 6.0) * 0.28 * w; p.x *= 1.0 - 0.06 * w * (0.5 + 0.5 * sin(uTime * 2.1 + aSeed * 3.0)); p.y -= w * w * 0.15; }
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vView = mv.xyz;
      air(mv.xyz, 3.0, vAirT, vAirL);
      gl_Position = projectionMatrix * mv;
    }`;
  const F_FRAG = `
    precision highp float; uniform vec3 uSunCol; uniform float uDay; varying vec2 vUv; varying vec3 vCol, vView;
    ${AIR_F}
    void main() {
      vec3 cloth = mix(vec3(dot(vCol, vec3(0.3, 0.55, 0.15))), vCol, 0.8) * 0.86;      // (dyed, not the map's paint)
      float edge = step(0.4, abs(vUv.y - 0.5)), dev = 1.0 - smoothstep(0.15, 0.18, length((vUv - vec2(0.4, 0.5)) * vec2(1.55, 1.0)));      // (a darker hem top and bottom; a pale device, a disc, near the pole)
      vec3 col = vUv.x < 0.0 ? vec3(0.35, 0.26, 0.17) : mix(mix(cloth, cloth * 0.5, edge), vec3(0.9, 0.86, 0.74), dev * (1.0 - edge));
      vec3 lit = col * (0.35 + 0.75 * uSunCol * mix(0.5, 1.0, uDay));
      gl_FragColor = vec4(airOver(lit, vAirT, vAirL), 1.0);
    }`;

  class Troops {
    constructor({ scene, terrain, world }) {
      this.scene = scene; this.terrain = terrain; this.world = world; this.exag = terrain.exag; this.enabled = true;
      const bu = world.bUniforms;
      this.uni = { uSunV: bu.uSunV, uUpV: bu.uUpV, uDay: bu.uDay, uSunCol: bu.uSunCol, uDusk: bu.uDusk, uTime: { value: 0 } }; if (window.AIR) Object.assign(this.uni, AIR.uniforms);
      // the soldiers
      { const g = soldierGeometry(); const gear = new THREE.InstancedBufferAttribute(new Float32Array(MAXS * 4), 4); gear.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aGear', gear); this.gear = gear;
        const m = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: S_VERT, fragmentShader: S_FRAG }), MAXS); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXS * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage); this.men = m; scene.add(m);
        // and each one's shadow: the walkers' streak from the feet away from the sun (movers.js), on the same matrices
        if (window.MOVERS && MOVERS.SHADOW_VERT) { const su = { uSunV: bu.uSunV, uDay: bu.uDay }; if (window.SHADOWS) Object.assign(su, SHADOWS.uniforms);
          const ps = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: su, vertexShader: MOVERS.SHADOW_VERT, fragmentShader: MOVERS.SHADOW_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), MAXS);
          ps.count = 0; ps.frustumCulled = false; ps.instanceMatrix = m.instanceMatrix; scene.add(ps); this.shade = ps; } }
      // the standards
      { const g = standardGeometry(); const sd = new THREE.InstancedBufferAttribute(new Float32Array(MAXF), 1); g.setAttribute('aSeed', sd); this.fseed = sd;
        const m = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: F_VERT, fragmentShader: F_FRAG, side: THREE.DoubleSide }), MAXF); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage); this.flags = m; scene.add(m); }
      // tents and ships: the building kit, as events.js has them
      this.inst = {}; this.counts = {};
      for (const k of ['tent', 'bigtent', 'ship', 'boat']) { if (!world.arche[k]) continue; const geo = world.arche[k].clone(); const cap = { tent: 1200, bigtent: 120, ship: 200, boat: 200 }[k]; const info = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); info.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aInfo', info); const m = new THREE.InstancedMesh(geo, world.bMat, cap); m.count = 0; m.frustumCulled = false; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); this.inst[k] = { mesh: m, info, cap }; scene.add(m); }
      // the road of the selected host: dots on the ground
      { const g = new THREE.BufferGeometry(); this.roadPos = new Float32Array(3 * 600); g.setAttribute('position', new THREE.BufferAttribute(this.roadPos, 3).setUsage(THREE.DynamicDrawUsage)); g.setDrawRange(0, 0);
        this.road = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffe6a0, size: 7, sizeAttenuation: false, transparent: true, opacity: 0.9, depthTest: false })); this.road.frustumCulled = false; this.road.renderOrder = 9; scene.add(this.road); }
      this.vis = new Map();      // host id -> where it is drawn { lon, lat, head, walk }
      this.camps = { key: '' }; this.selected = -1; this.onPick = null; this._m = new THREE.Matrix4(); this._vc = new Map(); this._k = new Map(); this.fleetAt = new Map();      // (fleet id -> where it is drawn: lon, lat, heading)
      this.stats = { men: 0, hosts: 0, banners: 0 };
      // the banners on the screen
      this.host = document.getElementById('hosts'); this.banners = new Map();
    }
    // where a host stands: the middle of its region, or the town there, or the nearest dry ground
    siteOf(sim, a) {
      const T = this.terrain; const i = a.cell; let [lon, lat] = cellLL(i);
      if (a.state === 'siege' && a.siegeAt >= 0) {      // (just before the walls of the town it besieges, on the side it came from)
        const c = sim.civs[sim.owner[a.siegeAt]]; if (c && sim.level[a.siegeAt]) { const [tl, ta] = TOWN.siteOf(sim, a.siegeAt, c, T, null); const R = TOWN.radiusM(sim, a.siegeAt, c) * 1.1 + 250, cl = Math.max(0.15, Math.cos(ta * D2R)); const dx = (lon - tl) * cl, dy = lat - ta, L = Math.hypot(dx, dy) || 1; return [tl + dx / L * R / (R_M * cl * D2R), ta + dy / L * R / (R_M * D2R)]; }
      }
      if (sim.level[i] && sim.civs[sim.owner[i]]) { const [tl, ta] = TOWN.siteOf(sim, i, sim.civs[sim.owner[i]], T, null); const R = TOWN.radiusM(sim, i, sim.civs[sim.owner[i]]) * 1.3 + 400, cl = Math.max(0.15, Math.cos(ta * D2R)); const ang = hash(a.id, 7) * Math.PI * 2; return [tl + Math.cos(ang) * R / (R_M * cl * D2R), ta + Math.sin(ang) * R / (R_M * D2R)]; }
      if (T.isWater(lon, lat)) { for (let r = 1; r <= 4; r++) for (let k = 0; k < 8; k++) { const ang = k / 8 * Math.PI * 2, lo = lon + Math.cos(ang) * r * 0.08, la = lat + Math.sin(ang) * r * 0.08; if (!T.isWater(lo, la)) return [lo, la]; } }
      return [lon, lat];
    }
    update(cam, sim, now, dt, project) {
      this.uni.uTime.value = now / 1000;
      const A = sim && sim.army; if (!A || !this.enabled) { this.clear(); return; }
      const T = this.terrain, camLon = cam.lon, camLat = cam.lat, close = cam.dist < SEE;
      // where each host is drawn: it walks toward where the simulation has it, and is put there at once from far
      const live = new Set();
      for (const a of A.list) {
        live.add(a.id); let v = this.vis.get(a.id); const [tl, ta] = a.state === 'sea' && a.fleet >= 0 ? cellLL(a.cell) : this.siteOf(sim, a);
        if (!v) { v = { lon: tl, lat: ta, head: 0, walk: 0 }; this.vis.set(a.id, v); }
        const d = GEO.distKm(v.lon, v.lat, tl, ta);
        if (d > 600) { v.lon = tl; v.lat = ta; v.walk = 0; }
        else if (d > 0.05) { const k = 1 - Math.exp(-dt * 0.8); const cl = Math.max(0.15, Math.cos(v.lat * D2R)); v.head = Math.atan2(ta - v.lat, (tl - v.lon) * cl); v.lon += (tl - v.lon) * k; v.lat += (ta - v.lat) * k; v.walk = 1; }
        else { v.walk = 0; if (a.path && a.path.length) { const [nl, na] = cellLL(a.path[0]); const cl = Math.max(0.15, Math.cos(v.lat * D2R)); v.head = Math.atan2(na - v.lat, (nl - v.lon) * cl); } else if (a.foe >= 0 && sim.civs[a.foe] && sim.civs[a.foe].capital >= 0) { const [fl, fa] = cellLL(sim.civs[a.foe].capital); const cl = Math.max(0.15, Math.cos(v.lat * D2R)); v.head = Math.atan2(fa - v.lat, (fl - v.lon) * cl); } }
        if (a.state === 'march' && a.path && a.path.length) v.walk = 1;
      }
      for (const id of [...this.vis.keys()]) if (!live.has(id)) { this.vis.delete(id); this._k.delete(id); }
      // the soldiers and the standards of the hosts near the eye
      let n = 0, nf = 0; const mm = this.men, me = this._m.elements, mc = mm.instanceColor.array, mg = this.gear.array, fc = this.flags.instanceColor.array, fs = this.fseed.array;
      const reach = Math.min(160, 25 + cam.dist * R_M / 1000 * 2.5);
      const near = close ? A.list.filter((a) => { const v = this.vis.get(a.id); return v && a.state !== 'sea' && GEO.distKm(camLon, camLat, v.lon, v.lat) < reach; }) : [];
      near.sort((p, q) => (q.c === sim.player) - (p.c === sim.player));
      for (const a of near) {
        const v = this.vis.get(a.id), c = sim.civs[a.c]; if (!c) continue;
        const era = a.era, gear = era >= 7 ? 2 : era >= 5 ? 1 : 0, helm = era === 0 ? 0 : era <= 2 ? 1 : era <= 5 ? 2 : 3;
        const want = clamp(Math.round(3 * Math.sqrt(a.men)), 24, 480), N = Math.min(want, MAXS - n); if (N <= 0) break;
        const kH = this.scaleAt(sim, a, v, dt); v.k = kH;
        // in blocks of six ranks by ten files while it stands, abreast; on the march a column four abreast, a company of
        // forty-eight behind another
        const march = v.walk > 0.5, line = Math.max(1, Math.round(N / 72)), files = march ? 4 : Math.ceil(N / line / 6), ranks = march ? 12 : 6, per = files * ranks, blocks = Math.ceil(N / per), gap = 1.7 * kH, bw = files * gap, bd = ranks * gap;      // (standing, the blocks are of one size)
        const ch = Math.cos(v.head), sh = Math.sin(v.head), cl = Math.max(0.15, Math.cos(v.lat * D2R)), mLon = 1 / (R_M * cl * D2R), mLat = 1 / (R_M * D2R);
        const col = c.rgb;
        for (let k = 0; k < N; k++) {
          const b = (k / per) | 0, r = ((k % per) / files) | 0, f = k % files;
          let fwd, side;
          if (march) { fwd = -b * (bd + gap * 2) - r * gap; side = (f - (files - 1) / 2) * gap * 0.8; }
          else { const across = blocks; fwd = -r * gap; side = (b - (across - 1) / 2) * (bw + gap * 2) + (f - (files - 1) / 2) * gap; }
          fwd += (hash(a.id * 977 + k, 1) - 0.5) * gap * 0.3; side += (hash(a.id * 977 + k, 2) - 0.5) * gap * 0.3;
          const ex = fwd * ch - side * sh, ny = fwd * sh + side * ch;      // (east, north) metres
          const lon = v.lon + ex * mLon, lat = v.lat + ny * mLat; const hg = T.meshHeightAt(lon, lat, this._vc);
          if (hg < 0.5 && T.isWater(lon, lat)) continue;
          const hk = hash(a.id * 977 + k, 3), sk = 0.93 + 0.14 * hk, ck = 0.88 + 0.24 * hash(a.id * 977 + k, 4);      // (no two men of a size, nor two tunics of one dye)
          this.setFigure(mm, n, lon, lat, hg, ch, sh, kH * sk);
          mc[n * 3] = col[0] * ck; mc[n * 3 + 1] = col[1] * ck; mc[n * 3 + 2] = col[2] * ck;
          mg[n * 4] = gear; mg[n * 4 + 1] = helm; mg[n * 4 + 2] = march ? 1 : 0; mg[n * 4 + 3] = hash(a.id, k); n++;
        }
        // the standard: at the head of the column, or before the middle of the line
        if (nf < MAXF) { const lon = v.lon + (ch * gap * 2.5) * mLon, lat = v.lat + (sh * gap * 2.5) * mLat; const hg = T.meshHeightAt(lon, lat, this._vc); this.setFigure(this.flags, nf, lon, lat, hg, Math.cos(v.head + 1.2), Math.sin(v.head + 1.2), kH * (a.c === sim.player ? 1.1 : 0.95)); fc[nf * 3] = col[0]; fc[nf * 3 + 1] = col[1]; fc[nf * 3 + 2] = col[2]; fs[nf] = hash(a.id, 3); nf++; }
      }
      mm.count = n; GEO.touch(mm.instanceMatrix, n); GEO.touch(mm.instanceColor, n); GEO.touch(this.gear, n); if (this.shade) this.shade.count = n;
      this.flags.count = nf; GEO.touch(this.flags.instanceMatrix, nf); GEO.touch(this.flags.instanceColor, nf); GEO.touch(this.fseed, nf);
      if (this._vc.size > 20000) this._vc.clear();
      // camps and ships: placed again when what is near changes
      this.placeCamps(sim, A, near, cam, close);
      this.drawRoad(sim, A);
      this.drawBanners(sim, A, cam, project);
      this.stats = { men: n, hosts: near.length, banners: this.banners.size };
    }
    // the scale a host is drawn at: the place's own, as its trees and its townsfolk have it (a village is drawn many times
    // life size; open country at K), eased so that a host that marches past a town does not jump in size
    scaleAt(sim, a, v, dt) {
      let e = this._k.get(a.id); const now = performance.now();
      if (!e || e.cell !== a.cell || now - e.t > 2000) {
        const T = this.terrain; let k = K; const y0 = (a.cell / W) | 0, x0 = a.cell - y0 * W;
        for (let dy = -2; dy <= 2; dy++) { const y = y0 + dy; if (y < 0 || y >= H) continue; for (let dx = -2; dx <= 2; dx++) {
          const j = y * W + ((x0 + dx + W) % W); if (!sim.level[j]) continue; const c = sim.civs[sim.owner[j]]; if (!c) continue;
          const kT = TOWN.scaleOf(TOWN.radiusTrue(sim, j, c)); if (kT <= k) continue;
          const [sl, sa] = TOWN.siteOf(sim, j, c, T, null), R = TOWN.radiusM(sim, j, c), d = GEO.distKm(v.lon, v.lat, sl, sa) * 1000;
          const f = 1 - clamp((d - R * 1.4) / (R * 1.4), 0, 1); if (f > 0) k = Math.max(k, K + (kT - K) * f * f * (3 - 2 * f));
        } }
        if (!e) { e = { k, now: k }; this._k.set(a.id, e); } e.cell = a.cell; e.t = now; e.k = k;
      }
      e.now += (e.k - e.now) * (1 - Math.exp(-(dt || 0.016) * 1.5)); return e.now;
    }
    setFigure(im, idx, lon, lat, hg, fx, fz, k0) {
      const k = k0 / R_M, el = this._m.elements; const lo = lon * D2R, la = lat * D2R; const slo = Math.sin(lo), clo = Math.cos(lo), sla = Math.sin(la), cla = Math.cos(la);
      const Ex = -slo, Ez = -clo; const Nx = -sla * clo, Ny = cla, Nz = sla * slo; const Ux = cla * clo, Uy = sla, Uz = -cla * slo; const rr = 1 + Math.max(hg, 0) * this.exag / R_M;
      el[0] = (fx * Ex + fz * Nx) * k; el[1] = (fz * Ny) * k; el[2] = (fx * Ez + fz * Nz) * k; el[3] = 0;
      el[4] = Ux * k; el[5] = Uy * k; el[6] = Uz * k; el[7] = 0;
      el[8] = (fz * Ex - fx * Nx) * k; el[9] = (-fx * Ny) * k; el[10] = (fz * Ez - fx * Nz) * k; el[11] = 0;
      el[12] = Ux * rr; el[13] = Uy * rr; el[14] = Uz * rr; el[15] = 1;
      im.setMatrixAt(idx, this._m);
    }
    placeCamps(sim, A, near, cam, close) {
      const key = close ? near.filter((a) => a.state !== 'march').map((a) => a.id + ':' + a.cell + ':' + a.state + ':' + (this.vis.get(a.id).walk ? 1 : 0)).join(',') + '|' + A.fleets.map((f) => f.id + ':' + f.cell + ':' + f.ships + ':' + f.state).join(',') + '|' + Math.round(cam.lon * 20) + ',' + Math.round(cam.lat * 20) : '';
      if (key === this.camps.key) return; this.camps.key = key;
      for (const k in this.inst) this.counts[k] = 0;
      // (sizes in metres as drawn; k is the scale they are drawn at, which the kit's patterns divide by)
      const T = this.terrain, place = (kind, lon, lat, w, h, d, yaw, color, era, hAdd, k) => { const I = this.inst[kind]; if (!I) return; const idx = this.counts[kind] || 0; if (idx >= I.cap) return; const hg = T.meshHeightAt(lon, lat, this._vc) + (hAdd || 0); this.world.placeInstance(I.mesh, idx, lon, lat, hg, { kind: null, x: 0, z: 0, w, h, d, yaw, color, style: TOWN.packStyle(7, 0, 0, 64), k: k || 6 }, era, (idx % 89) / 89, I.info); this.counts[kind] = idx + 1; };
      if (close) for (const a of near) {
        const v = this.vis.get(a.id); if (!v || v.walk || a.state === 'march') continue; const c = sim.civs[a.c]; if (!c) continue;
        const cl = Math.max(0.15, Math.cos(v.lat * D2R)), mLon = 1 / (R_M * cl * D2R), mLat = 1 / (R_M * D2R);
        const nT = clamp(Math.round(Math.sqrt(a.men) / 3), 6, 60), ch = Math.cos(v.head), sh = Math.sin(v.head);
        // (the camp lies behind the host's ranks: as deep as they are, a lane, and its own breadth)
        const kH = v.k || K, back = 6 * 1.7 * kH + 40 + (60 + nT * 12) * kH / K, cx = v.lon - ch * back * mLon, cy = v.lat - sh * back * mLat;
        for (let k = 0; k < nT; k++) { const ang = hash(a.id, k + 30) * Math.PI * 2, rr = Math.sqrt(hash(a.id, k + 60)) * (60 + nT * 12) * kH / K; const lo = cx + Math.cos(ang) * rr * mLon, la = cy + Math.sin(ang) * rr * mLat; if (T.isWater(lo, la)) continue; place('tent', lo, la, 3 * kH, 2.2 * kH, 3.4 * kH, ang, [0xd9cfb4, 0xc9b99a, 0xb9a88a][k % 3], a.era, 0, kH); }
        place('bigtent', cx, cy, 7 * kH, 4.4 * kH, 7 * kH, v.head, hexOf(dyed(c.rgb)), a.era, 0, kH);      // (the captain's pavilion, in the realm's colour)
      }
      // the fleets near the eye: ships in a wedge, the realm's colour on them
      // (drawn SHIP_K times life size, as the ships of movers.js are; in harbour off its town, at sea where it sails, its
      // bows the way it goes)
      const SK = 6;
      for (const f of A.fleets) {
        const c = sim.civs[f.c]; if (!c) continue; let [lon, lat] = cellLL(f.cell); let head = hash(f.id, 1) * Math.PI * 2;
        if (f.state === 'port' && f.port >= 0 && sim.level[f.port] && sim.civs[sim.owner[f.port]]) {
          const pc = sim.civs[sim.owner[f.port]], [tl, ta] = TOWN.siteOf(sim, f.port, pc, T, null), R = TOWN.radiusM(sim, f.port, pc), cl = Math.max(0.15, Math.cos(ta * D2R));
          const dx = (lon - tl) * cl, dy = lat - ta, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
          for (let r = R * 0.8; r < R * 0.8 + 25000; r += 400) { const lo = tl + ux * r / (R_M * cl * D2R), la = ta + uy * r / (R_M * D2R); if (T.isWater(lo, la)) { lon = tl + ux * (r + 900) / (R_M * cl * D2R); lat = ta + uy * (r + 900) / (R_M * D2R); break; } }
          head = Math.atan2(uy, ux);
        } else if (f.path && f.path.length) { const [nl, na] = cellLL(f.path[0]); head = Math.atan2(na - lat, (nl - lon) * Math.max(0.15, Math.cos(lat * D2R))); }
        this.fleetAt.set(f.id, [lon, lat, head]);
        if (GEO.distKm(cam.lon, cam.lat, lon, lat) > Math.min(400, 60 + cam.dist * 6371 * 3)) continue;
        const kind = f.era >= 3 ? 'ship' : 'boat', w = (f.era >= 6 ? 90 : f.era >= 3 ? 34 : 12) * SK, h = (f.era >= 6 ? 18 : f.era >= 3 ? 9 : 3) * SK, d = (f.era >= 6 ? 16 : f.era >= 3 ? 8 : 4) * SK;
        const cl = Math.max(0.15, Math.cos(lat * D2R)), mLon = 1 / (R_M * cl * D2R), mLat = 1 / (R_M * D2R), nS = clamp(f.ships, 3, 24), sp = w * 1.6;
        const dc = dyed(c.rgb), base = f.era >= 6 ? [0.29, 0.31, 0.34] : [0.42, 0.3, 0.19], hull = hexOf(base.map((v, q) => v * 0.72 + dc[q] * 0.28));      // (timber or steel, washed with the realm's colour)
        for (let k = 0; k < nS; k++) { const row = Math.floor((k + 1) / 2), side = k % 2 ? 1 : -1; const fw = -row * sp, sd = side * row * sp * 0.7; const ex = fw * Math.cos(head) - sd * Math.sin(head), ny = fw * Math.sin(head) + sd * Math.cos(head); const lo = lon + ex * mLon, la = lat + ny * mLat; if (!this.terrain.isWater(lo, la)) continue; place(kind, lo, la, w, h, d, head, hull, f.era, h * 0.3, SK); }
      }
      for (const k in this.inst) { const I = this.inst[k]; const c = this.counts[k] || 0; I.mesh.count = c; GEO.touch(I.mesh.instanceMatrix, c); GEO.touch(I.mesh.instanceColor, c); GEO.touch(I.info, c); }
    }
    // the road the selected host is sent along, as dots a little above the ground
    drawRoad(sim, A) {
      const a = this.selected >= 0 ? A.byId(this.selected) : null; const g = this.road.geometry;
      const key = a ? a.id + ':' + a.cell + ':' + (a.path ? a.path.length : 0) + ':' + a.goal + ':' + (a.legs ? 1 : 0) : '';
      if (key === this.roadKey) return; this.roadKey = key;
      if (!a || ((!a.path || !a.path.length) && !a.legs)) { g.setDrawRange(0, 0); return; }
      const cells = [a.cell, ...(a.path || [])]; if (a.legs) cells.push(...a.legs.sea, a.legs.landAt, ...a.legs.ashore);
      const T = this.terrain, P = this.roadPos; let n = 0;
      for (let k = 0; k + 1 < cells.length && n < 600; k++) {
        const [l0, a0] = cellLL(cells[k]), [l1, a1] = cellLL(cells[k + 1]); if (Math.abs(l1 - l0) > 180) continue;
        for (let s = 0; s < 4 && n < 600; s++) { const t = s / 4, lo = l0 + (l1 - l0) * t, la = a0 + (a1 - a0) * t; const h = Math.max(0, T.heightAt(lo, la)) + 120; const v = GEO.toVec(lo, la).multiplyScalar(1 + h * this.exag / R_M); P[n * 3] = v.x; P[n * 3 + 1] = v.y; P[n * 3 + 2] = v.z; n++; }
      }
      GEO.touch(g.attributes.position, n); g.setDrawRange(0, n);
    }
    // a banner on the screen for every host in view: its colours, its men, what it is doing; a click selects it
    drawBanners(sim, A, cam, project) {
      if (!this.host || !project) return; const seen = new Set();
      const far = cam.dist > 0.6;
      for (const a of A.list) {
        const mine = a.c === sim.player; if (!mine && (far || cam.dist > 0.15)) continue;
        const v = this.vis.get(a.id); if (!v) continue;
        if (!mine && GEO.distKm(cam.lon, cam.lat, v.lon, v.lat) > Math.min(2500, 300 + cam.dist * 6371 * 2)) continue;
        // (it stands over the top of the standard while the soldiers are drawn, else over the ground where the host is)
        const top = cam.dist < SEE ? 6.2 * (v.k || K) * (mine ? 1.1 : 0.95) / this.exag : 0;
        const p = project(v.lon, v.lat, Math.max(0, this.terrain.meshHeightAt(v.lon, v.lat, this._vc)) + top); if (!p) continue;
        let el = this.banners.get(a.id);
        if (!el) { el = document.createElement('div'); el.className = 'hostb'; el.addEventListener('click', (e) => { e.stopPropagation(); if (this.onPick) this.onPick(a.id); }); this.host.appendChild(el); this.banners.set(a.id, el); }
        const c = sim.civs[a.c]; const st = a.state === 'siege' ? 'siege' : a.state === 'sea' ? 'sea' : a.state === 'march' ? 'march' : 'camp';
        const html = `<i style="background:${css(c.rgb)}"></i><b>${fmtK(a.men)}</b><span class="st"><svg viewBox="0 0 24 24"><path d="${ST_ICON[st]}"/></svg></span>`;
        if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; el.title = `${a.name} · ${A.fmtMen(a.men)}`; }
        el.classList.toggle('mine', mine); el.classList.toggle('sel', a.id === this.selected);
        el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`; el.style.opacity = (0.25 + 0.75 * p[2]).toFixed(2);
        seen.add(a.id);
      }
      for (const [id, el] of this.banners) if (!seen.has(id)) { el.remove(); this.banners.delete(id); }
    }
    clear() {
      this.men.count = 0; if (this.shade) this.shade.count = 0; this.flags.count = 0; for (const k in this.inst) this.inst[k].mesh.count = 0; this.road.geometry.setDrawRange(0, 0); this.roadKey = ''; this.camps.key = '';
      for (const el of this.banners.values()) el.remove(); this.banners.clear();
    }
  }
  // what a host is doing, as a small mark on its banner: marching, laying siege, encamped, at sea
  const ST_ICON = { march: 'M5 6l6 6-6 6M12 6l6 6-6 6', siege: 'M5 21V9l3-2 3 2V5l3-2 3 2v4l2-2v14z', camp: 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 0 2 1 3 2 3.5 0-3-.5-5.5.5-8.5zM5 21h14', sea: 'M3 14c3 3 6 3 9 0s6-3 9 0M3 19c3 3 6 3 9 0s6-3 9 0' };
  const fmtK = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'm' : n >= 1e4 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
  window.TROOPS = { Troops, K, SEE };
})();
