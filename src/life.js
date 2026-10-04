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
    attribute vec3 aBase, aUp, aEast, aNorth; attribute vec4 aSeed;   // seed.x phase, seed.y rise (m), seed.z size (m), seed.w what it is: 1 hearth smoke, 0 a furnace chimney's, 2 a flame in the open, 3 the light a fire throws on the ground
    uniform float uTime, uFovK, uWind;
    varying float vAge, vHeat, vSeed, vFade; varying vec2 vQ;
    void main() {
      float age = fract(uTime * 0.05 + aSeed.x);               // twenty seconds from the smoke hole to nothing
      vAge = age; vHeat = aSeed.w; vSeed = aSeed.x * 91.0; vQ = position.xy;
      if (aSeed.w > 2.5) {
        // the pool of light at a fire's foot lies on the ground, in pieces that each follow the slope where they are
        // (aUp: where this piece sits in the whole pool, and its share of the width), and breathes with the flame
        vAge = 0.8 + 0.13 * sin(uTime * 9.0 + aSeed.x * 60.0) + 0.07 * sin(uTime * 23.0 + aSeed.x * 31.0); vFade = 1.0;
        vQ = position.xy * aUp.z + aUp.xy;
        vec3 w = aBase + (aEast * position.x + aNorth * position.y) * (aSeed.z / ${R_M.toFixed(1)});
        gl_Position = projectionMatrix * (modelViewMatrix * vec4(w, 1.0));
      } else {
        float rise = aSeed.y * age * (2.0 - age);
        float lean = aSeed.y * 0.6 * uWind * age * age;
        float sway = sin(age * 7.0 + aSeed.x * 40.0 + uTime * 0.35) * aSeed.z * 0.55 * age;
        vec3 c = aBase + (aUp * rise + aEast * (lean + sway) + aNorth * (lean * 0.3 - sway * 0.4)) / ${R_M.toFixed(1)};
        float size = aSeed.z * (0.45 + 3.0 * age) / ${R_M.toFixed(1)};
        vec2 q = position.xy;
        if (aSeed.w > 1.5) { c = aBase; size = aSeed.z / ${R_M.toFixed(1)}; q.y += 0.5; }      // a flame stands where it burns, its foot on the ground
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        vFade = smoothstep(0.7, 2.5, size * uFovK / max(-mv.z, 1e-7));      // a puff under a pixel across is noise: let it go
        mv.xy += q * size;                                        // a square facing the eye, as wide as the puff (no limit on its size, as points have)
        gl_Position = projectionMatrix * mv;
      }
    }`;
  const FRAG = `
    precision mediump float; uniform float uDay; uniform highp float uTime; varying float vAge, vHeat, vSeed, vFade; varying vec2 vQ;      // (uTime as the vertex shader has it: one uniform, one precision)
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
    // colours leave here already multiplied by their alpha: smoke covers what is behind it, light is added to it
    void main() {
      vec2 d = vQ; float r = length(d) * 2.0;
      if (vHeat > 1.5) {                                        // fires in the open are lit as the light goes and burn till morning
        float lit = 1.0 - smoothstep(0.3, 0.62, uDay); if (lit < 0.02) discard;
        if (vHeat > 2.5) {                                      // the light on the ground: strongest at the fire's foot, gone ten paces out
          float f = max(1.0 - r, 0.0); f = f * f * (0.55 + 0.45 * f);
          gl_FragColor = vec4(vec3(1.0, 0.5, 0.19) * (f * 0.6 * lit * vAge), 0.0); return;
        }
        float y = d.y + 0.5, t = uTime * 2.4 + vSeed;         // 0 at the ground, 1 at the tip
        float n1 = vn(vec2(d.x * 7.0 + vSeed, y * 5.0 - t * 1.7)), n2 = vn(vec2(d.x * 15.0 - vSeed, y * 11.0 - t * 3.1));
        float wide = 0.27 * pow(max(1.0 - y, 0.0), 0.7) * smoothstep(-0.02, 0.1, y) * (0.78 + 0.5 * n2 * y);      // tongues: broad at the foot, licking to a point
        float body = (1.0 - smoothstep(wide * 0.3, wide + 0.004, abs(d.x + (n1 - 0.5) * 0.24 * y))) * step(0.004, wide);
        float heat = body * (1.0 - y * 0.75);
        vec3 fc = mix(vec3(0.95, 0.24, 0.04), mix(vec3(1.0, 0.6, 0.13), vec3(1.0, 0.94, 0.68), smoothstep(0.45, 0.92, heat)), smoothstep(0.08, 0.45, heat));
        float a = smoothstep(0.02, 0.3, body) * lit * vFade;
        float glow = max(1.0 - r, 0.0); glow *= glow * 0.3 * lit * vFade;
        gl_FragColor = vec4(fc * a + vec3(1.0, 0.5, 0.18) * glow * (1.0 - a), a * 0.8); return;
      }
      if (r > 1.25) discard;
      float ca = cos(vSeed), sa = sin(vSeed); vec2 q = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
      float n = vn(q * 4.0 + vSeed) * 0.65 + vn(q * 9.0 - vSeed * 1.7) * 0.35;        // each puff ragged in its own way
      float body = 1.0 - smoothstep(0.1, 1.0, r + (n - 0.5) * 0.9);
      float alpha = body * smoothstep(0.0, 0.05, vAge) * pow(1.0 - vAge, 1.5) * mix(0.55, 0.36, min(vHeat, 1.0)) * vFade;
      if (alpha < 0.004) discard;
      // wood smoke is grey with a little blue in it, paler where it thins; a furnace chimney's is sooty
      vec3 smoke = mix(vec3(0.15, 0.16, 0.20), mix(vec3(0.36, 0.34, 0.33), vec3(0.72, 0.73, 0.76), vHeat), uDay) * (0.82 + 0.36 * n);
      vec3 ember = vec3(1.0, 0.5, 0.18) * pow(1.0 - vAge, 6.0) * vHeat * (1.0 - uDay) * 0.9;
      gl_FragColor = vec4((smoke + ember) * alpha, alpha);
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
      this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide });
      this.points = new THREE.Mesh(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points);
      this.last = { lon: 999, lat: 999, t: -1e9 }; this.count = 0; this.enabled = true; this.budget = 1;
    }
    // viewportH: the height of the picture in pixels (to tell when a puff is too small to draw)
    update(cam, sim, now, day, viewportH, fovDeg) {
      this.sim = sim; this.uniforms.uTime.value = now / 1000; this.uniforms.uDay.value = day;
      this.uniforms.uFovK.value = viewportH / (2 * Math.tan(fovDeg * 0.5 * D2R));
      if (!sim || !this.enabled || cam.alt > 0.03) { if (this.count) { this.points.geometry.instanceCount = 0; this.count = 0; this.sig = ''; } return; }
      const moved = GEO.distKm(cam.lon, cam.lat, this.last.lon, this.last.lat) > 1.5;
      if (!moved && now - this.last.t < 4000) return;
      const full = moved || now - (this.lastFull || -1e9) > 30000;
      this.last = { lon: cam.lon, lat: cam.lat, t: now };
      if (this.rebuild(cam, sim, full)) this.lastFull = now;
    }
    // force: rebuild whatever; otherwise only if a town near by has changed (its plan, or which of its plots stand)
    rebuild(cam, sim, force) {
      const T = this.terrain; const exag = this.exag; let n = 0;
      const cy0 = Math.floor((90 - cam.lat) / 180 * H), cx0 = Math.floor((cam.lon + 180) / 360 * W);
      const towns = []; let sig = '';
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const y = cy0 + dy; if (y < 0 || y >= H) continue; const x = ((cx0 + dx) % W + W) % W; const i = y * W + x;
        const lvl = sim.level[i]; if (!lvl || sim.owner[i] < 0) continue;
        const c = sim.civs[sim.owner[i]]; if (!c) continue;
        const [sLon, sLat] = TOWN.siteOf(sim, i, c, T, null);
        if (GEO.distKm(cam.lon, cam.lat, sLon, sLat) > 120) continue;
        const L = TOWN.layout(sim, i, c, { coarse: false }); if (!L.items.length) continue;
        towns.push({ i, lvl, y, sLon, sLat, L }); sig += i + '|' + L.key + '|' + (L.fitEra || '') + (L.mask ? 'm' : '') + ';';
      }
      if (!force && sig === this.sig) return false; this.sig = sig;
      for (const tw of towns) {
        const { i, lvl, y, sLon, sLat, L } = tw; const items = L.items; const kS = L.k || 1;
        const cl = Math.max(0.15, Math.cos((90 - (y + 0.5) / H * 180) * D2R));         // as the world places the town's buildings
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
        // fires in the open after dark, until towns have lamps: a great one on the square, braziers either side of
        // each gate and before the great buildings, and a few before the doors of houses where there is room to sit round one
        if (L.era <= 5) {
          const spots = [];      // x, z (drawn metres from the centre), the flame's height in true metres
          const sq = (L.axis || 0) + Math.PI * 0.9; spots.push([Math.cos(sq) * L.plaza * 0.24, Math.sin(sq) * L.plaza * 0.24, 2.3]);      // on the landmark's side of the square (the well stands on the other)
          for (let k = 0; k < items.length; k++) {
            const it = items[k]; if (it.prog !== undefined || it.off || (L.mask && L.mask[k])) continue;
            if (it.kind === 'gatehouse') { const r = Math.hypot(it.x, it.z) || 1, ox = it.x / r, oz = it.z / r; for (const sd of [-1, 1]) spots.push([it.x + ox * 3.5 * kS - oz * sd * 4.2 * kS, it.z + oz * 3.5 * kS + ox * sd * 4.2 * kS, 1.2]); }
            else if (Math.floor(it.style / 1024) & 1) { const yaw = it.fyaw === undefined ? it.yaw : it.fyaw, fz = (it.fd || it.d) * 0.5 + 2.5 * kS, fw = (it.fw || it.w) * 0.3; for (const sd of [-1, 1]) spots.push([it.x + Math.sin(yaw) * fz + Math.cos(yaw) * fw * sd, it.z - Math.cos(yaw) * fz + Math.sin(yaw) * fw * sd, 1.3]); }
          }
          const want = Math.min(houses.length, Math.round((2 + lvl * 2) * this.budget)); let got = 0;
          for (let k = 0; k < want * 5 && got < want; k++) {
            const hi = houses[Math.floor(hash(i, 900 + k) * houses.length) % houses.length], it = items[hi]; const yaw = it.fyaw === undefined ? it.yaw : it.fyaw; const out = (it.fd || it.d) * 0.5 + 3.5 * kS;
            const fx = it.x + Math.sin(yaw) * out, fz = it.z - Math.cos(yaw) * out; let clear = true;
            for (let q = 0; q < items.length && clear; q++) { const o = items[q]; if (q === hi || o.kind === 'gatehouse' || o.kind === 'wall' || o.kind === 'palisade') continue; if (Math.hypot(o.x - fx, o.z - fz) < Math.max(o.fw || o.w, o.fd || o.d) * 0.5 + 2 * kS) clear = false; }
            if (clear) { spots.push([fx, fz, 0.85 + 0.3 * hash(i, 930 + k)]); got++; }
          }
          const put = (b, e, nn, u, sx, sy, sz, sw) => { const j = n * 3; this.pos[j] = b.x; this.pos[j + 1] = b.y; this.pos[j + 2] = b.z; this.up[j] = u.x; this.up[j + 1] = u.y; this.up[j + 2] = u.z; this.east[j] = e.x; this.east[j + 1] = e.y; this.east[j + 2] = e.z; this.north[j] = nn.x; this.north[j + 1] = nn.y; this.north[j + 2] = nn.z; const s4 = n * 4; this.seed[s4] = sx; this.seed[s4 + 1] = sy; this.seed[s4 + 2] = sz; this.seed[s4 + 3] = sw; n++; };
          const _p = new THREE.Vector3(), _e = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3();
          for (let k = 0; k < spots.length; k++) {
            const [fx, fz, fh] = spots[k]; const lon = sLon + fx / (R_M * cl * D2R), lat = sLat + fz / (R_M * D2R);
            if (T.isWater(lon, lat)) continue;                   // not on the water
            const f = GEO.enu(lon, lat); const h = T.heightAt(lon, lat) * exag; const base = f.up.clone().multiplyScalar(1 + h / R_M);
            // the light on the ground: eight flame-heights out each way, in pieces that each lie on the ground where they
            // are (one flat sheet that wide would cut into every rise and hang over every dip)
            const rad = fh * 8 * kS, N = rad > 180 ? 4 : 3, step = rad * 2 / N, ph = hash(i, 950 + k), lift = 0.5 * kS; if (n + N * N + 1 > MAXP) break;
            const hs = []; for (let b = 0; b <= N; b++) for (let a = 0; a <= N; a++) hs.push(T.heightAt(lon + (a / N - 0.5) * 2 * rad / (R_M * cl * D2R), lat + (b / N - 0.5) * 2 * rad / (R_M * D2R)) * exag);
            for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
              const h00 = hs[b * (N + 1) + a], h10 = hs[b * (N + 1) + a + 1], h01 = hs[(b + 1) * (N + 1) + a], h11 = hs[(b + 1) * (N + 1) + a + 1];
              const sE = (h10 + h11 - h00 - h01) / (2 * step), sN = (h01 + h11 - h00 - h10) / (2 * step), u0 = (a + 0.5) / N - 0.5, v0 = (b + 0.5) / N - 0.5;
              _p.copy(base).addScaledVector(f.east, u0 * 2 * rad / R_M).addScaledVector(f.north, v0 * 2 * rad / R_M).addScaledVector(f.up, ((h00 + h10 + h01 + h11) / 4 - h + lift) / R_M);
              _e.copy(f.east).addScaledVector(f.up, sE); _n.copy(f.north).addScaledVector(f.up, sN); _u.set(u0, v0, 1 / N);
              put(_p, _e, _n, _u, ph, 0, step, 3);
            }
            put(base, f.east, f.north, f.up, ph, 0, fh * 1.25 * kS, 2);
          }
        }
      }
      const g = this.points.geometry; for (const k of ['aBase', 'aUp', 'aEast', 'aNorth', 'aSeed']) GEO.touch(g.attributes[k], n);
      g.instanceCount = n; this.count = n; return true;
    }
  }
  window.LIFE = { Life };
})();
