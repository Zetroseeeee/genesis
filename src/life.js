// GENESIS life layer: hearth smoke rising from settlements near the camera (GPU-animated puffs, one square each).
// Classic script; exposes window.LIFE.
(function () {
  const R_M = 6371000, D2R = Math.PI / 180;
  const W = 720, H = 360;
  const MAXP = 9000, PER_PLUME = 30;
  function hash(i, k) { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  // where a fire burns under the roof: the kinds of building people live in
  const DWELLING = new Set(['hut', 'longhouse', 'courtyard', 'adobe', 'gable', 'hip', 'tenement', 'townhouse', 'palazzo', 'mansard', 'terrace', 'halftimber', 'domehouse', 'curved', 'courtyardc', 'stilt', 'tipi', 'pueblo']);

  // A plume is a string of puffs leaving the smoke hole one after another: each climbs fast and slows as it cools,
  // widens, leans over with the wind and thins to nothing. Close together and nearly transparent, they read as one
  // column of smoke and not as beads.
  const VERT = `
    attribute vec3 aBase, aUp, aEast, aNorth; attribute vec4 aSeed;   // seed.x phase, seed.y rise (m), seed.z size (m), seed.w heat (1 hearth, 0 furnace chimney)
    uniform float uTime, uFovK, uWind;
    varying float vAge, vHeat, vSeed, vFade; varying vec2 vQ;
    void main() {
      float age = fract(uTime * 0.05 + aSeed.x);               // twenty seconds from the smoke hole to nothing
      vAge = age; vHeat = aSeed.w; vSeed = aSeed.x * 91.0; vQ = position.xy;
      float rise = aSeed.y * age * (2.0 - age);
      float lean = aSeed.y * 0.6 * uWind * age * age;
      float sway = sin(age * 7.0 + aSeed.x * 40.0 + uTime * 0.35) * aSeed.z * 0.55 * age;
      vec3 c = aBase + (aUp * rise + aEast * (lean + sway) + aNorth * (lean * 0.3 - sway * 0.4)) / ${R_M.toFixed(1)};
      float size = aSeed.z * (0.45 + 3.0 * age) / ${R_M.toFixed(1)};
      if (aSeed.w > 1.5) {                                      // an open fire (seed.z: its width): it stays where it burns, and flickers
        vAge = 0.0; float fl = 0.82 + 0.14 * sin(uTime * 9.0 + aSeed.x * 60.0) + 0.08 * sin(uTime * 23.0 + aSeed.x * 31.0);
        c = aBase + aUp * (aSeed.z * 0.4 / ${R_M.toFixed(1)}); size = aSeed.z * 5.0 * fl / ${R_M.toFixed(1)};
      }
      vec4 mv = modelViewMatrix * vec4(c, 1.0);
      vFade = smoothstep(0.7, 2.5, size * uFovK / max(-mv.z, 1e-7));      // a puff under a pixel across is noise: let it go
      mv.xy += position.xy * size;                              // a square facing the eye, as wide as the puff (no limit on its size, as points have)
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    precision mediump float; uniform float uDay; varying float vAge, vHeat, vSeed, vFade; varying vec2 vQ;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
    void main() {
      vec2 d = vQ; float r = length(d) * 2.0; if (r > 1.25) discard;
      if (vHeat > 1.5) {                                        // an open fire at night: a bright heart, and its glow on the dark around it
        float nightF = 1.0 - uDay; if (nightF < 0.02) discard;
        float core = smoothstep(0.26, 0.0, r), halo = smoothstep(1.0, 0.0, r);
        gl_FragColor = vec4(mix(vec3(1.0, 0.42, 0.1), vec3(1.0, 0.86, 0.5), core), (core * 0.95 + halo * halo * 0.4) * nightF * vFade); return;
      }
      float ca = cos(vSeed), sa = sin(vSeed); vec2 q = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
      float n = vn(q * 4.0 + vSeed) * 0.65 + vn(q * 9.0 - vSeed * 1.7) * 0.35;        // each puff ragged in its own way
      float body = smoothstep(1.0, 0.1, r + (n - 0.5) * 0.9);
      float alpha = body * smoothstep(0.0, 0.05, vAge) * pow(1.0 - vAge, 1.5) * mix(0.55, 0.36, min(vHeat, 1.0)) * vFade;
      if (alpha < 0.004) discard;
      // wood smoke is grey with a little blue in it, paler where it thins; a furnace chimney's is sooty
      vec3 smoke = mix(vec3(0.15, 0.16, 0.20), mix(vec3(0.36, 0.34, 0.33), vec3(0.72, 0.73, 0.76), vHeat), uDay) * (0.82 + 0.36 * n);
      vec3 ember = vec3(1.0, 0.5, 0.18) * pow(1.0 - vAge, 6.0) * vHeat * (1.0 - uDay) * 0.9;
      gl_FragColor = vec4(smoke + ember, alpha);
    }`;

  class Life {
    constructor({ scene, terrain }) {
      this.scene = scene; this.terrain = terrain; this.exag = terrain.exag; this.sim = null;
      // one square per puff, drawn as instances of a single quad
      const quad = new THREE.PlaneGeometry(1, 1); const g = new THREE.InstancedBufferGeometry(); g.index = quad.index; g.setAttribute('position', quad.attributes.position);
      this.pos = new Float32Array(MAXP * 3); this.up = new Float32Array(MAXP * 3); this.east = new Float32Array(MAXP * 3); this.north = new Float32Array(MAXP * 3); this.seed = new Float32Array(MAXP * 4);
      g.setAttribute('aBase', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aUp', new THREE.InstancedBufferAttribute(this.up, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aEast', new THREE.InstancedBufferAttribute(this.east, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aNorth', new THREE.InstancedBufferAttribute(this.north, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(this.seed, 4).setUsage(THREE.DynamicDrawUsage));
      g.instanceCount = 0;
      this.uniforms = { uTime: { value: 0 }, uFovK: { value: 1000 }, uWind: { value: 1 }, uDay: { value: 1 } };
      this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide });
      this.points = new THREE.Mesh(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points);
      this.last = { lon: 999, lat: 999, t: -1e9 }; this.count = 0; this.enabled = true; this.budget = 1;
    }
    // viewportH: the height of the picture in pixels (to tell when a puff is too small to draw)
    update(cam, sim, now, day, viewportH, fovDeg) {
      this.sim = sim; this.uniforms.uTime.value = now / 1000; this.uniforms.uDay.value = day;
      this.uniforms.uFovK.value = viewportH / (2 * Math.tan(fovDeg * 0.5 * D2R));
      if (!sim || !this.enabled || cam.alt > 0.03) { if (this.count) { this.points.geometry.instanceCount = 0; this.count = 0; } return; }
      const moved = GEO.distKm(cam.lon, cam.lat, this.last.lon, this.last.lat) > 1.5;
      if (!moved && now - this.last.t < 4000) return;
      this.last = { lon: cam.lon, lat: cam.lat, t: now };
      this.rebuild(cam, sim);
    }
    rebuild(cam, sim) {
      const T = this.terrain; const exag = this.exag; let n = 0;
      const cy0 = Math.floor((90 - cam.lat) / 180 * H), cx0 = Math.floor((cam.lon + 180) / 360 * W);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const y = cy0 + dy; if (y < 0 || y >= H) continue; const x = ((cx0 + dx) % W + W) % W; const i = y * W + x;
        const lvl = sim.level[i]; if (!lvl || sim.owner[i] < 0) continue;
        const c = sim.civs[sim.owner[i]]; if (!c) continue;
        const [sLon, sLat] = TOWN.siteOf(sim, i, c, T, null);
        if (GEO.distKm(cam.lon, cam.lat, sLon, sLat) > 120) continue;
        const cl = Math.max(0.15, Math.cos((90 - (y + 0.5) / H * 180) * D2R));         // as the world places the town's buildings
        const L = TOWN.layout(sim, i, c, { coarse: false }); const items = L.items; if (!items.length) continue; const kS = L.k || 1, kH = L.kh || 1;
        // only what is really standing smokes: not a plot left empty for its neighbour's model, nor one in the river
        const chimneys = []; const houses = [];
        for (let k = 0; k < items.length; k++) { const it = items[k]; if (it.prog !== undefined || it.off || (L.fit && L.fit[k]) || (L.mask && L.mask[k])) continue; if (it.kind === 'chimney') chimneys.push(k); else if (DWELLING.has(it.kind) && !it.as && !it.tag) houses.push(k); }
        const hearths = Math.min(houses.length, Math.round((4 + lvl * 4) * this.budget)), stacks = Math.min(chimneys.length, 4);
        for (let k = 0; k < hearths + stacks && n + PER_PLUME <= MAXP; k++) {
          const industrial = k >= hearths; const pool = industrial ? chimneys : houses;
          const it = items[pool[industrial ? k - hearths : Math.floor(hash(i, 300 + k) * pool.length) % pool.length]];
          const lon = sLon + it.x / (R_M * cl * D2R), lat = sLat + it.z / (R_M * D2R);
          const h = T.heightAt(lon, lat); const f = GEO.enu(lon, lat);
          const top = (it.top || it.h) * (industrial ? 1 : 0.9);         // the model's own height where one stands (the world notes it on the plan)
          const base = f.up.clone().multiplyScalar(1 + (h * exag + top) / R_M);
          const off = hash(i, 500 + k);
          for (let q = 0; q < PER_PLUME; q++) {
            const j = n * 3; this.pos[j] = base.x; this.pos[j + 1] = base.y; this.pos[j + 2] = base.z;
            this.up[j] = f.up.x; this.up[j + 1] = f.up.y; this.up[j + 2] = f.up.z;
            this.east[j] = f.east.x; this.east[j + 1] = f.east.y; this.east[j + 2] = f.east.z;
            this.north[j] = f.north.x; this.north[j + 1] = f.north.y; this.north[j + 2] = f.north.z;
            const s = n * 4; const ph = off + (q + 0.7 * hash(i, 600 + k * 31 + q)) / PER_PLUME;     // evenly after one another, each a little early or late
            this.seed[s] = ph - Math.floor(ph); this.seed[s + 1] = (industrial ? 150 : 30) * (0.8 + 0.4 * hash(i, 700 + k)) * kS; this.seed[s + 2] = (industrial ? 14 : 4.2) * (0.8 + 0.5 * hash(i, 800 + q)) * kS; this.seed[s + 3] = industrial ? 0 : 1;
            n++;
          }
        }
        // fires in the open after dark: one on the square, others before the doors of some houses
        const fires = Math.min(houses.length, Math.round((2 + lvl * 2) * this.budget));
        for (let k = -1; k < fires && n < MAXP; k++) {
          let fx = 0, fz = 0; if (k >= 0) { const it = items[houses[Math.floor(hash(i, 900 + k) * houses.length) % houses.length]]; const yaw = it.fyaw === undefined ? it.yaw : it.fyaw; const out = (it.fd || it.d) * 0.5 + 4 * kS; fx = it.x + Math.sin(yaw) * out; fz = it.z - Math.cos(yaw) * out; }
          const lon = sLon + fx / (R_M * cl * D2R), lat = sLat + fz / (R_M * D2R); const h = T.heightAt(lon, lat); const f = GEO.enu(lon, lat); const base = f.up.clone().multiplyScalar(1 + (h * exag) / R_M);
          const j = n * 3; this.pos[j] = base.x; this.pos[j + 1] = base.y; this.pos[j + 2] = base.z; this.up[j] = f.up.x; this.up[j + 1] = f.up.y; this.up[j + 2] = f.up.z;
          this.east[j] = f.east.x; this.east[j + 1] = f.east.y; this.east[j + 2] = f.east.z; this.north[j] = f.north.x; this.north[j + 1] = f.north.y; this.north[j + 2] = f.north.z;
          const s = n * 4; this.seed[s] = hash(i, 950 + k); this.seed[s + 1] = 0; this.seed[s + 2] = (k < 0 ? 2.6 : 1.5) * kS; this.seed[s + 3] = 2; n++;
        }
      }
      const g = this.points.geometry; for (const k of ['aBase', 'aUp', 'aEast', 'aNorth', 'aSeed']) GEO.touch(g.attributes[k], n);
      g.instanceCount = n; this.count = n;
    }
  }
  window.LIFE = { Life };
})();
