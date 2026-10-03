// GENESIS life layer: hearth smoke rising from settlements near the camera (GPU-animated point sprites).
// Classic script; exposes window.LIFE.
(function () {
  const R_M = 6371000, D2R = Math.PI / 180;
  const W = 720, H = 360;
  const MAXP = 6000, PER_PLUME = 22;
  function hash(i, k) { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  const VERT = `
    attribute vec3 aUp, aEast, aNorth; attribute vec4 aSeed;   // seed.x phase, seed.y rise (m), seed.z size (m), seed.w heat
    uniform float uTime, uExag, uViewH, uFovK, uWind;
    varying float vAge, vHeat;
    void main() {
      float age = fract(uTime * 0.045 + aSeed.x);              // ~22 s per cycle
      vAge = age; vHeat = aSeed.w;
      float rise = aSeed.y * age;
      float sway = sin(age * 9.0 + aSeed.x * 40.0) * 6.0 * age;
      vec3 p = position + aUp * (rise * uExag / ${R_M.toFixed(1)}) + (aEast * (age * age * 55.0 * uWind + sway) + aNorth * (age * 18.0 * uWind)) / ${R_M.toFixed(1)};
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float sizeM = aSeed.z * (0.6 + 2.6 * age);
      gl_PointSize = clamp(sizeM / ${R_M.toFixed(1)} * uFovK / max(-mv.z, 1e-7), 1.0, 96.0);
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    precision mediump float; uniform float uDay; varying float vAge, vHeat;
    void main() {
      vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
      float soft = smoothstep(1.0, 0.25, r);
      float alpha = soft * (1.0 - vAge) * (0.4 + 0.3 * (1.0 - vAge));
      vec3 smoke = mix(vec3(0.5, 0.5, 0.55), vec3(0.93, 0.93, 0.95), uDay);
      vec3 ember = vec3(1.0, 0.55, 0.2) * (1.0 - vAge) * (1.0 - vAge) * vHeat * (1.0 - uDay) * 2.0;
      gl_FragColor = vec4(smoke + ember, alpha);
    }`;

  class Life {
    constructor({ scene, terrain }) {
      this.scene = scene; this.terrain = terrain; this.exag = terrain.exag; this.sim = null;
      const g = new THREE.BufferGeometry();
      this.pos = new Float32Array(MAXP * 3); this.up = new Float32Array(MAXP * 3); this.east = new Float32Array(MAXP * 3); this.north = new Float32Array(MAXP * 3); this.seed = new Float32Array(MAXP * 4);
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aUp', new THREE.BufferAttribute(this.up, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aEast', new THREE.BufferAttribute(this.east, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aNorth', new THREE.BufferAttribute(this.north, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 4).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      this.uniforms = { uTime: { value: 0 }, uExag: { value: this.exag }, uViewH: { value: 900 }, uFovK: { value: 1000 }, uWind: { value: 1 }, uDay: { value: 1 } };
      this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true });
      this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points);
      this.last = { lon: 999, lat: 999, t: -1e9 }; this.count = 0; this.enabled = true;
    }
    update(cam, sim, now, day, viewportH, fovDeg) {
      this.sim = sim; this.uniforms.uTime.value = now / 1000; this.uniforms.uDay.value = day;
      this.uniforms.uFovK.value = viewportH / (2 * Math.tan(fovDeg * 0.5 * D2R));
      if (!sim || !this.enabled || cam.alt > 0.03) { if (this.count) { this.points.geometry.setDrawRange(0, 0); this.count = 0; } return; }
      const moved = GEO.distKm(cam.lon, cam.lat, this.last.lon, this.last.lat) > 1.5;
      if (!moved && now - this.last.t < 4000) return;
      this.last = { lon: cam.lon, lat: cam.lat, t: now };
      this.rebuild(cam, sim);
    }
    rebuild(cam, sim) {
      const T = this.terrain; const exag = this.exag; let n = 0;
      const cy0 = Math.floor((90 - cam.lat) / 180 * H), cx0 = Math.floor((cam.lon + 180) / 360 * W);
      const cl = Math.max(0.15, Math.cos(cam.lat * D2R));
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const y = cy0 + dy; if (y < 0 || y >= H) continue; const x = ((cx0 + dx) % W + W) % W; const i = y * W + x;
        const lvl = sim.level[i]; if (!lvl || sim.owner[i] < 0) continue;
        const c = sim.civs[sim.owner[i]]; if (!c) continue;
        const [sLon, sLat] = TOWN.siteOf(sim, i, c, T, null);
        if (GEO.distKm(cam.lon, cam.lat, sLon, sLat) > 120) continue;
        const L = TOWN.layout(sim, i, c, { coarse: false }); const items = L.items; if (!items.length) continue; const kS = L.k || 1, kH = L.kh || 1;
        const chimneys = []; const houses = []; for (let k = 0; k < items.length; k++) { const it = items[k]; if (it.kind === 'chimney') chimneys.push(k); else if (it.h > 2.5 * kH && it.h < 40 * kH && it.prog === undefined && it.kind !== 'wall' && it.kind !== 'palisade' && it.kind !== 'pier' && it.kind !== 'lamp') houses.push(k); }
        const plumes = Math.min(10, 2 + lvl * 2 + Math.min(4, chimneys.length));
        for (let k = 0; k < plumes && n + PER_PLUME <= MAXP; k++) {
          const useChimney = k < chimneys.length; const pool = useChimney ? chimneys : houses; if (!pool.length) break;
          const it = items[pool[Math.floor(hash(i, 300 + k) * pool.length) % pool.length]];
          const lon = sLon + it.x / (R_M * cl * D2R), lat = sLat + it.z / (R_M * D2R);
          const h = T.heightAt(lon, lat); const f = GEO.enu(lon, lat);
          const base = f.up.clone().multiplyScalar(1 + (h * exag + it.h * 0.98) / R_M);
          const industrial = useChimney;
          for (let q = 0; q < PER_PLUME; q++) {
            const j = n * 3; this.pos[j] = base.x; this.pos[j + 1] = base.y; this.pos[j + 2] = base.z;
            this.up[j] = f.up.x; this.up[j + 1] = f.up.y; this.up[j + 2] = f.up.z;
            this.east[j] = f.east.x; this.east[j + 1] = f.east.y; this.east[j + 2] = f.east.z;
            this.north[j] = f.north.x; this.north[j + 1] = f.north.y; this.north[j + 2] = f.north.z;
            const s = n * 4; this.seed[s] = hash(i, 600 + k * 31 + q); this.seed[s + 1] = (industrial ? 260 : 90) * (0.7 + 0.6 * hash(i, 700 + q)) * kH; this.seed[s + 2] = (industrial ? 18 : 9) * (0.8 + 0.5 * hash(i, 800 + q)) * kH; this.seed[s + 3] = industrial ? 0 : 1;
            n++;
          }
        }
      }
      const g = this.points.geometry; for (const k of ['position', 'aUp', 'aEast', 'aNorth', 'aSeed']) g.attributes[k].needsUpdate = true;
      g.setDrawRange(0, n); this.count = n;
    }
  }
  window.LIFE = { Life };
})();
