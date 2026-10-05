// GENESIS events layer: what the chronicle says, shown on the ground. Volcanoes erupting, wildfire fronts, armies
// clashing at the border (soldiers, camps, siege engines, smoke and musket flashes), plague pyres, festival fireworks
// and bonfires, earthquake dust. One GPU particle system with typed particles, plus instanced camp pieces and a
// soldier point layer. Classic script; exposes window.EVENTS.
(function () {
  const R_M = 6371000, D2R = Math.PI / 180;
  const W = 720, H = 360;
  function hash(i, k) { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const MAXP = 24000, MAXS = 6000;
  // particle types: 0 smoke, 1 ash column, 2 flame, 3 ember, 4 dust, 5 firework, 6 lava glow, 7 musket smoke puff, 8 steam
  const VERT = `
    attribute vec3 aUp, aEast, aNorth; attribute vec4 aSeed; attribute vec3 aCol;   // seed: phase, rise(m), size(m), type
    uniform float uTime, uExag, uFovK, uWind;
    varying float vAge, vType; varying vec3 vCol;
    void main() {
      float type = floor(aSeed.w + 0.5); vType = type; vCol = aCol;
      float period = type == 1.0 ? 60.0 : type == 2.0 ? 2.2 : type == 3.0 ? 3.5 : type == 4.0 ? 9.0 : type == 5.0 ? 4.5 : type == 6.0 ? 6.0 : type == 7.0 ? 5.0 : 22.0;
      float age = fract(uTime / period + aSeed.x); vAge = age;
      vec3 p = position; float sizeM = aSeed.z;
      if (type == 0.0 || type == 1.0 || type == 8.0) {                      // smoke and ash: rise, drift with the wind, swell
        float rise = aSeed.y * (type == 1.0 ? pow(age, 0.7) : age);
        float sway = sin(age * 9.0 + aSeed.x * 40.0) * 6.0 * age;
        p += aUp * (rise * uExag / ${R_M.toFixed(1)}) + (aEast * (age * age * (type == 1.0 ? 1400.0 : 55.0) * uWind + sway) + aNorth * (age * (type == 1.0 ? 300.0 : 18.0) * uWind)) / ${R_M.toFixed(1)};
        sizeM *= (type == 1.0 ? 0.3 + 3.2 * age : 0.6 + 2.6 * age);
      } else if (type == 2.0) {                                              // flame: short lick upward, shrinking
        p += aUp * (aSeed.y * age * uExag / ${R_M.toFixed(1)}); sizeM *= 1.0 - age * 0.7;
      } else if (type == 3.0) {                                              // ember: up and away in an arc
        float a = aSeed.x * 6.283; p += (aUp * (aSeed.y * (age - age * age * 0.6)) * uExag + (aEast * cos(a) + aNorth * sin(a)) * (aSeed.y * 0.5 * age)) / ${R_M.toFixed(1)}; sizeM *= 1.0 - age;
      } else if (type == 4.0 || type == 7.0) {                               // dust / musket smoke: a low puff that drifts and fades
        float a = aSeed.x * 6.283; p += (aUp * (aSeed.y * age * 0.6) * uExag + (aEast * cos(a) + aNorth * sin(a)) * (aSeed.y * age)) / ${R_M.toFixed(1)}; sizeM *= 0.5 + 2.0 * age;
      } else if (type == 5.0) {                                              // firework: climb, then burst outward
        float t = age; float burst = smoothstep(0.35, 0.4, t); float a = aSeed.x * 6.283; float el = fract(aSeed.x * 7.3) * 3.1416 - 1.5708;
        vec3 dir = aEast * cos(a) * cos(el) + aNorth * sin(a) * cos(el) + aUp * sin(el);
        float r = burst * (1.0 - exp(-(t - 0.38) * 6.0)) * aSeed.y * 0.45; float climb = aSeed.y * min(t, 0.38) / 0.38;
        p += (aUp * climb * uExag + dir * r - aUp * burst * (t - 0.38) * (t - 0.38) * 90.0) / ${R_M.toFixed(1)}; sizeM *= mix(0.25, 1.0, burst) * (1.0 - smoothstep(0.75, 1.0, t));
      } else if (type == 6.0) {                                              // lava glow: static, pulsing
        sizeM *= 0.8 + 0.4 * sin(uTime * 2.0 + aSeed.x * 20.0);
      }
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = clamp(sizeM / ${R_M.toFixed(1)} * uFovK / max(-mv.z, 1e-7), 1.0, 420.0);
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    precision mediump float; uniform float uDay; varying float vAge, vType; varying vec3 vCol;
    void main() {
      vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float soft = smoothstep(1.0, 0.25, r);
      float t = floor(vType + 0.5); vec3 col; float a;
      if (t == 0.0) { col = mix(vec3(0.5, 0.5, 0.55), vec3(0.93, 0.93, 0.95), uDay); a = soft * (1.0 - vAge) * (0.4 + 0.3 * (1.0 - vAge)); }
      else if (t == 1.0) { col = mix(vec3(0.16, 0.14, 0.13), vec3(0.42, 0.38, 0.35), uDay) * (0.7 + 0.5 * (1.0 - vAge)); col += vec3(1.0, 0.45, 0.1) * (1.0 - uDay) * smoothstep(0.08, 0.0, vAge) * 2.0; a = soft * (0.85 - 0.6 * vAge * vAge); }
      else if (t == 2.0) { col = mix(vec3(1.0, 0.95, 0.5), vec3(1.0, 0.35, 0.05), smoothstep(0.1, 0.8, vAge)); a = smoothstep(1.0, 0.1, r) * (1.0 - vAge * vAge) * 0.95; }
      else if (t == 3.0) { col = vec3(1.0, 0.6, 0.2); a = smoothstep(1.0, 0.3, r) * (1.0 - vAge); }
      else if (t == 4.0) { col = mix(vec3(0.5, 0.42, 0.32), vec3(0.78, 0.7, 0.58), uDay); a = soft * (1.0 - vAge) * 0.55; }
      else if (t == 5.0) { col = vCol * (1.4 - vAge * 0.8); a = smoothstep(1.0, 0.2, r) * smoothstep(0.36, 0.4, vAge) * (1.0 - smoothstep(0.7, 1.0, vAge)) + smoothstep(1.0, 0.4, r) * (1.0 - smoothstep(0.3, 0.38, vAge)) * 0.8; }
      else if (t == 6.0) { col = vec3(1.0, 0.42, 0.08) * (1.2 - uDay * 0.6); a = smoothstep(1.0, 0.0, r) * 0.9; }
      else if (t == 7.0) { col = mix(vec3(0.6, 0.6, 0.62), vec3(0.95, 0.95, 0.96), uDay); a = soft * (1.0 - vAge) * 0.7 * smoothstep(0.0, 0.08, vAge); }
      else { col = vec3(0.92, 0.94, 0.97); a = soft * (1.0 - vAge) * 0.5; }
      if (a < 0.02) discard;
      gl_FragColor = vec4(col, a);
    }`;
  const S_VERT = `
    attribute vec3 aCol; attribute float aPhase; uniform float uFovK; varying vec3 vCol; varying float vSize, vPhase;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float sz = 14.0 / ${R_M.toFixed(1)} * uFovK / max(-mv.z, 1e-7); vSize = sz; vCol = aCol; vPhase = aPhase; gl_PointSize = clamp(sz, 1.5, 16.0); gl_Position = projectionMatrix * mv; }`;
  const S_FRAG = `
    precision mediump float; uniform float uDay, uTime; varying vec3 vCol; varying float vSize, vPhase;
    void main() { vec2 p = gl_PointCoord; float x = abs(p.x - 0.5); float head = step(p.y, 0.28) * step(x, 0.15); float body = step(0.28, p.y) * step(x, 0.24); float spear = step(x + 0.3, 0.33) * step(0.3, x) * step(p.y, 0.9); float a = max(max(head, body), spear * 0.8) * smoothstep(1.2, 3.0, vSize) * (0.4 + 0.6 * uDay); if (a < 0.05) discard; vec3 col = mix(vCol, vec3(0.35, 0.33, 0.3), head) ; col = mix(col, vec3(0.6, 0.6, 0.62), spear) * (0.4 + 0.6 * uDay); gl_FragColor = vec4(col, a); }`;

  class Effects {
    constructor({ scene, terrain, world }) {
      this.scene = scene; this.terrain = terrain; this.world = world; this.exag = terrain.exag; this.enabled = true;
      const g = new THREE.BufferGeometry();
      this.pos = new Float32Array(MAXP * 3); this.up = new Float32Array(MAXP * 3); this.east = new Float32Array(MAXP * 3); this.north = new Float32Array(MAXP * 3); this.seed = new Float32Array(MAXP * 4); this.col = new Float32Array(MAXP * 3);
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aUp', new THREE.BufferAttribute(this.up, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aEast', new THREE.BufferAttribute(this.east, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aNorth', new THREE.BufferAttribute(this.north, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 4).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage)); g.setDrawRange(0, 0);
      this.uniforms = { uTime: { value: 0 }, uExag: { value: this.exag }, uFovK: { value: 1000 }, uWind: { value: 1 }, uDay: { value: 1 } };
      this.points = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false })); this.points.frustumCulled = false; this.points.renderOrder = 6; scene.add(this.points);
      // soldiers
      const sg = new THREE.BufferGeometry();
      this.spos = new Float32Array(MAXS * 3); this.scol = new Float32Array(MAXS * 3); this.sph = new Float32Array(MAXS);
      sg.setAttribute('position', new THREE.BufferAttribute(this.spos, 3).setUsage(THREE.DynamicDrawUsage)); sg.setAttribute('aCol', new THREE.BufferAttribute(this.scol, 3).setUsage(THREE.DynamicDrawUsage)); sg.setAttribute('aPhase', new THREE.BufferAttribute(this.sph, 1).setUsage(THREE.DynamicDrawUsage)); sg.setDrawRange(0, 0);
      this.suni = { uFovK: { value: 1000 }, uDay: { value: 1 }, uTime: { value: 0 } };
      this.soldiers = new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: this.suni, vertexShader: S_VERT, fragmentShader: S_FRAG, transparent: true, depthWrite: false })); this.soldiers.frustumCulled = false; this.soldiers.renderOrder = 4; scene.add(this.soldiers);
      this.columns = [];   // marching columns: { sLon, sLat, cl, pts (x,z metres pairs), h (heights), colour, n, t, speed, side }
      // camp pieces share the building kit and material
      this.inst = {}; this.counts = {};
      for (const k of ['tent', 'bigtent', 'catapult', 'cannon', 'ship', 'boat']) { const geo = world.arche[k].clone(); const cap = { tent: 2500, bigtent: 400, catapult: 300, cannon: 400, ship: 300, boat: 300 }[k]; const info = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); info.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aInfo', info); const m = new THREE.InstancedMesh(geo, world.bMat, cap); m.count = 0; m.frustumCulled = false; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); this.inst[k] = { mesh: m, info, cap }; scene.add(m); }
      this.last = { lon: 999, lat: 999, t: -1e9, year: -1e9, dist: 0 }; this.count = 0; this.stats = { particles: 0, soldiers: 0, scenes: 0 };
      this.shake = 0; this.lastQuakeYear = -1e9; this.rep = 6;
    }
    update(cam, sim, now, dt, day, viewportH, fovDeg) {
      if (!sim || !this.enabled) { this.clear(); return; }
      this.uniforms.uTime.value = now / 1000; this.uniforms.uDay.value = day; this.uniforms.uFovK.value = viewportH / (2 * Math.tan(fovDeg * 0.5 * D2R));
      this.suni.uDay.value = day; this.suni.uFovK.value = this.uniforms.uFovK.value; this.suni.uTime.value = now / 1000;
      // comet in the sky
      this.world.cometOn = sim.comet > -1e8 && sim.year - sim.comet <= 2;
      // earthquake: a shake when one strikes within reach of the camera
      const q = sim.quakes.length ? sim.quakes[sim.quakes.length - 1] : null;
      if (q && q.year !== this.lastQuakeYear && sim.year - q.year <= 1) { this.lastQuakeYear = q.year; const y = (q.i / W) | 0, x = q.i - y * W; const d = GEO.distKm(cam.lon, cam.lat, (x + 0.5) / W * 360 - 180, 90 - (y + 0.5) / H * 180); if (d < 500 && cam.dist < 0.08) this.shake = Math.min(1, (q.mag - 5) / 3) * (1 - d / 500); }
      this.shake = Math.max(0, this.shake - dt * 0.45);
      if (cam.dist > 0.12) { this.clear(); return; }
      const moved = GEO.distKm(cam.lon, cam.lat, this.last.lon, this.last.lat) > Math.max(0.3, cam.dist * 6371 * 0.25) || Math.abs(Math.log((cam.dist || 1e-6) / (this.last.dist || 1e-6))) > 0.5;
      if (moved || now - this.last.t > 5000 || sim.year !== this.last.year) { this.last = { lon: cam.lon, lat: cam.lat, t: now, year: sim.year, dist: cam.dist }; this.rebuild(cam, sim, now); }
      this.animateSoldiers(dt);
    }
    clear() { if (this.count || this.columns.length) { this.points.geometry.setDrawRange(0, 0); this.soldiers.geometry.setDrawRange(0, 0); for (const k in this.inst) this.inst[k].mesh.count = 0; this.count = 0; this.columns = []; this.stats = { particles: 0, soldiers: 0, scenes: 0 }; } }
    // ---------- particle emitters ----------
    emit(n, lon, lat, hAbove, type, spreadM, rise, size, seedBase, color) {
      const T = this.terrain; const h = T.heightAt(lon, lat); const f = GEO.enu(lon, lat); const cl = Math.max(0.15, Math.cos(lat * D2R));
      for (let k = 0; k < n && this.n < MAXP; k++) {
        const a = hash(seedBase, k) * Math.PI * 2, rr = Math.sqrt(hash(seedBase, k + 100)) * spreadM;
        const lo = lon + Math.cos(a) * rr / (R_M * cl * D2R), la = lat + Math.sin(a) * rr / (R_M * D2R);
        const hh = spreadM > 60 ? T.heightAt(lo, la) : h;
        const v = GEO.toVec(lo, la).multiplyScalar(1 + (hh * this.exag + hAbove) / R_M);
        const j = this.n * 3; this.pos[j] = v.x; this.pos[j + 1] = v.y; this.pos[j + 2] = v.z;
        this.up[j] = f.up.x; this.up[j + 1] = f.up.y; this.up[j + 2] = f.up.z; this.east[j] = f.east.x; this.east[j + 1] = f.east.y; this.east[j + 2] = f.east.z; this.north[j] = f.north.x; this.north[j + 1] = f.north.y; this.north[j + 2] = f.north.z;
        const s4 = this.n * 4; this.seed[s4] = hash(seedBase, k + 200); this.seed[s4 + 1] = rise * (0.7 + 0.6 * hash(seedBase, k + 300)); this.seed[s4 + 2] = size * (0.8 + 0.5 * hash(seedBase, k + 400)); this.seed[s4 + 3] = type;
        const c = color || 0xffffff; this.col[j] = ((c >> 16) & 255) / 255; this.col[j + 1] = ((c >> 8) & 255) / 255; this.col[j + 2] = (c & 255) / 255;
        this.n++;
      }
    }
    place(kind, lon, lat, w, h, d, yaw, color, era) {
      const I = this.inst[kind]; if (!I) return; const idx = this.counts[kind] || 0; if (idx >= I.cap) return;
      const rep = this.rep || 1; w *= rep; h *= rep; d *= rep;   // camp and siege pieces drawn to match the towns
      const hg = this.terrain.meshHeightAt(lon, lat, this._vc) + (kind === 'ship' || kind === 'boat' ? h * 0.3 : 0);
      this.world.placeInstance(I.mesh, idx, lon, lat, hg, { kind: null, x: 0, z: 0, w, h, d, yaw, color, style: TOWN.packStyle(kind === 'cannon' ? 4 : 7, 0, 0, 0), k: this.rep || 1 }, era, (idx % 89) / 89, I.info);
      this.counts[kind] = idx + 1;
    }
    rebuild(cam, sim, now) {
      this.n = 0; const T = this.terrain; const yr = sim.year; this._vc = new Map(); for (const k in this.inst) this.counts[k] = 0; this.columns = []; let scenes = 0;
      const cellLL = (i) => { const y = (i / W) | 0, x = i - y * W; return [(x + 0.5) / W * 360 - 180, 90 - (y + 0.5) / H * 180]; };
      const near = (lon, lat, km) => GEO.distKm(cam.lon, cam.lat, lon, lat) < km;
      const reach = Math.min(400, 60 + cam.dist * 6371 * 3);
      // volcanoes: ash column and lava glow while erupting; a thin steam plume between eruptions when close
      for (const v of sim.volcanoes) {
        if (!near(v.lon, v.lat, reach + 100)) continue; scenes++;
        const summit = T.heightAt(v.lon, v.lat);
        if (v.erupting > -1e8 && yr - v.erupting <= 3) { const k = v.strength; this.emit(Math.round(110 * k), v.lon, v.lat, 40, 1, 350 * k, 9000 + 7000 * k, 1500 * k, v.cell, 0); this.emit(60, v.lon, v.lat, 20, 3, 300 * k, 900 * k, 40, v.cell + 1); this.emit(50, v.lon, v.lat, 6, 6, 420 * k, 0, 90 * k, v.cell + 2); this.emit(30, v.lon, v.lat, 15, 2, 300 * k, 300, 60, v.cell + 3); }
        else if (cam.dist < 0.03 && summit > 800) this.emit(10, v.lon, v.lat, 20, 8, 80, 900, 150, v.cell + 4);
      }
      // wildfires: a ring of flame at the burning edge, smoke above it, embers in the wind
      for (const f of sim.fires) { if (yr - f.year > f.dur) continue; const [lon, lat] = cellLL(f.i); if (!near(lon, lat, reach)) continue; scenes++; const radM = f.r * 12000; const n = Math.min(90, 24 + f.r * 20); for (let k = 0; k < n; k++) { const a = hash(f.i, k) * Math.PI * 2, rr = radM * (0.8 + 0.2 * hash(f.i, k + 50)); const cl = Math.cos(lat * D2R); const lo = lon + Math.cos(a) * rr / (R_M * cl * D2R), la = lat + Math.sin(a) * rr / (R_M * D2R); if (T.heightAt(lo, la) < 0.5) continue; this.emit(6, lo, la, 2, 2, 700, 90, 160, f.i * 7 + k); this.emit(6, lo, la, 40, 0, 600, 2200, 420, f.i * 7 + k + 3); this.emit(4, lo, la, 10, 3, 500, 500, 30, f.i * 7 + k + 5); } }
      // battles: two lines of soldiers, dust, camp fires, siege engines before walls, musket smoke from the Renaissance on
      const recentB = sim.battles.filter(b => yr - b.year <= 2);
      const seenCells = new Set();
      for (const b of recentB) {
        if (seenCells.has(b.i)) continue; seenCells.add(b.i);
        const A = sim.civs[b.a], B = sim.civs[b.b]; if (!A || !B) continue;
        const [tLon, tLat] = sim.level[b.i] ? TOWN.siteOf(sim, b.i, sim.civs[sim.owner[b.i]] || B, T, null) : cellLL(b.i); if (!near(tLon, tLat, reach)) continue; scenes++;
        const [fLon, fLat] = cellLL(b.from); const cl = Math.max(0.15, Math.cos(tLat * D2R));
        const dx = (fLon - tLon) * cl, dy = fLat - tLat; const L = Math.hypot(dx, dy) || 1e-9; const ux = dx / L, uy = dy / L;   // unit toward the attacker's land (degrees frame)
        const R = sim.level[b.i] ? TOWN.radiusM(sim, b.i, sim.civs[sim.owner[b.i]] || B) : 300;
        const era = Math.max(A.era, B.era); const mLon = 1 / (R_M * cl * D2R), mLat = 1 / (R_M * D2R);
        // the field of battle lies just outside the town toward the attacker
        const fieldD = R * 1.3 + 250; const fx = tLon + ux * fieldD * mLon, fy = tLat + uy * fieldD * mLat;
        const px = -uy, py = ux;  // across the line
        const width = 220 + Math.min(600, (sim.mightOf[b.a] + sim.mightOf[b.b]) * 0.4);
        const nA = Math.min(500, 140 + Math.round(sim.mightOf[b.a] * 0.6)), nB = Math.min(500, 140 + Math.round(sim.mightOf[b.b] * 0.6));
        const colA = A.rgb, colB = B.rgb;
        const mkLine = (civCol, n, off, dir) => { const pts = []; const vc = this._vc; for (let k = 0; k < n; k++) { const across = (hash(b.i, k + off) - 0.5) * width; const rank = hash(b.i, k + off + 1000) * 60; const x0 = fx + (px * across + ux * (dir * (90 + rank))) * mLon, y0 = fy + (py * across + uy * (dir * (90 + rank))) * mLat; pts.push(x0, y0, T.meshHeightAt(x0, y0, vc)); } this.columns.push({ pts, col: civCol, n, phase: hash(b.i, off), dir: -dir, ux, uy, mLon, mLat, speed: era >= 6 ? 0.6 : 0.9 }); };
        mkLine(colA, nA, 11, 1); mkLine(colB, nB, 77, -1);
        // dust between the lines; musket/cannon smoke from the Renaissance; campfires behind the attacker
        this.emit(era >= 5 ? 14 : 24, fx, fy, 2, 4, width * 0.5, 18, 26, b.i * 3 + 1);
        if (era >= 5) this.emit(50, fx, fy, 2, 7, width * 0.5, 14, 24, b.i * 3 + 2);
        const campD = fieldD + 700 + R * 0.4; const cx = tLon + ux * campD * mLon, cy = tLat + uy * campD * mLat;
        const nT = Math.min(90, 14 + Math.round(nA / 6));
        for (let k = 0; k < nT; k++) { const a = hash(b.i, k + 300) * Math.PI * 2, rr = Math.sqrt(hash(b.i, k + 400)) * (120 + nT * 6); const lo = cx + Math.cos(a) * rr * mLon, la = cy + Math.sin(a) * rr * mLat; if (T.heightAt(lo, la) < 0.5) continue; this.place(k === 0 ? 'bigtent' : 'tent', lo, la, k === 0 ? 14 : 6.5 + hash(b.i, k + 500) * 2.5, k === 0 ? 8 : 4.2, k === 0 ? 12 : 6.5, hash(b.i, k + 600) * 3, k === 0 ? (((colA[0] * 255) << 16) | ((colA[1] * 255) << 8) | (colA[2] * 255)) : [0xd9cfb4, 0xc9b99a, 0xb9a88a][k % 3], era); if (k % 5 === 0) this.emit(8, lo + 6 * mLon, la, 1, 0, 3, 40, 6, b.i * 5 + k); }
        // siege: engines before the walls, breach dust on the rampart
        if (b.siege && sim.walls[b.i]) { const nE = 3 + Math.min(6, sim.walls[b.i] * 2); for (let k = 0; k < nE; k++) { const across = (k - (nE - 1) / 2) * 40; const lo = tLon + (ux * (R * 1.15 + 90) + px * across) * mLon, la = tLat + (uy * (R * 1.15 + 90) + py * across) * mLat; if (T.heightAt(lo, la) < 0.5) continue; this.place(era >= 5 ? 'cannon' : 'catapult', lo, la, era >= 5 ? 3.2 : 5, era >= 5 ? 1.6 : 4, era >= 5 ? 2.4 : 3, Math.atan2(-uy, -ux * 1) , era >= 5 ? 0x3a3a3a : 0x6a553a, era); } this.emit(30, tLon + ux * R * 1.06 * mLon, tLat + uy * R * 1.06 * mLat, 4, 4, 90, 40, 60, b.i * 11); if (era >= 5) this.emit(16, tLon + ux * (R * 1.15 + 80) * mLon, tLat + uy * (R * 1.15 + 80) * mLat, 2, 7, 120, 20, 30, b.i * 13); }
        if (b.taken && sim.level[b.i]) { this.emit(40, tLon, tLat, 10, 0, R * 0.6, 500, 120, b.i * 17); this.emit(24, tLon, tLat, 3, 2, R * 0.5, 40, 30, b.i * 19); }   // the sacked town burns
      }
      // naval battles: when two realms with harbours are at war, their fleets meet between their nearest ports
      const seenPairs = new Set(); this.fleets = [];
      for (const A of sim.civs) { if (!A || !sim.ports[A.id]) continue; for (const bidS of Object.keys(A.wars)) { const B = sim.civs[+bidS]; if (!B || !sim.ports[B.id] || B.id < A.id) continue; const key = A.id * 1000 + B.id; if (seenPairs.has(key)) continue; seenPairs.add(key);
        const portsOf = (c) => { const out = []; for (let k = 0; k < sim.LI.length && out.length < 40; k += 7) { const i = sim.LI[k]; if (sim.owner[i] === c.id && (sim.special[i] & 1) && sim.level[i]) out.push(i); } return out; };
        const pa = portsOf(A), pb = portsOf(B); if (!pa.length || !pb.length) continue;
        let best = null; for (const i of pa) for (const j of pb) { const [l1, a1] = cellLL(i), [l2, a2] = cellLL(j); const d = GEO.distKm(l1, a1, l2, a2); if (d < 2500 && (!best || d < best.d)) best = { i, j, d }; }
        if (!best) continue; const va = GEO.toVec(...cellLL(best.i)), vb = GEO.toVec(...cellLL(best.j)); const mid = va.clone().lerp(vb, 0.5).normalize(); const [mlon, mlat] = GEO.fromVec(mid);
        if (!near(mlon, mlat, reach + 60) || !T.isWater(mlon, mlat)) continue; scenes++;
        const era = Math.max(A.era, B.era); const cl = Math.max(0.15, Math.cos(mlat * D2R)); const mLon = 1 / (R_M * cl * D2R), mLat = 1 / (R_M * D2R); const seed = best.i;
        const nS = era >= 6 ? 4 : 6; const kind = era >= 3 ? 'ship' : 'boat'; const w = era >= 6 ? 90 : era >= 3 ? 34 : 12, h = era >= 6 ? 18 : era >= 3 ? 9 : 3, d = era >= 6 ? 16 : era >= 3 ? 8 : 4;
        const hexOf = (c) => ((c.rgb[0] * 255) << 16) | ((c.rgb[1] * 255) << 8) | (c.rgb[2] * 255);
        for (let side = 0; side < 2; side++) { const C = side ? B : A; for (let k = 0; k < nS; k++) { const a = (side ? Math.PI : 0) + (k - (nS - 1) / 2) * 0.35 + hash(seed, k + side * 50) * 0.2; const rr = 500 + hash(seed, k + side * 70) * 500; const lo = mlon + Math.cos(a) * rr * mLon, la = mlat + Math.sin(a) * rr * mLat; if (!T.isWater(lo, la)) continue; this.place(kind, lo, la, w, h, d, a + Math.PI / 2 + (hash(seed, k) - 0.5) * 0.6, era >= 6 ? 0x4a5058 : hexOf(C), era); if (era >= 4) { this.emit(10, lo, la, h * 0.6, 7, w * 0.4, 12, w * 0.3, seed * 3 + k + side * 9); } if (hash(seed, k + side * 90 + 7) < 0.25) { this.emit(16, lo, la, h * 0.5, 2, w * 0.3, h * 2, w * 0.25, seed * 5 + k + side * 11); this.emit(14, lo, la, h, 0, w * 0.3, 400, w * 1.2, seed * 5 + k + side * 13); } } }
      } }
      // plague: pyres at the edge of stricken towns
      for (const pl of sim.plagues) { if (yr - pl.year > 2) continue; const [lon, lat] = cellLL(pl.i); if (!near(lon, lat, reach)) continue; scenes++; const y0 = (pl.i / W) | 0, x0 = pl.i - y0 * W; for (let dy = -pl.r; dy <= pl.r; dy += 2) for (let dx = -pl.r; dx <= pl.r; dx += 2) { const yy = y0 + dy; if (yy < 0 || yy >= H) continue; const j = yy * W + ((x0 + dx + W) % W); if (!sim.level[j] || sim.owner[j] < 0) continue; const c = sim.civs[sim.owner[j]]; if (!c) continue; const [sl, sa] = TOWN.siteOf(sim, j, c, T, null); const Rj = TOWN.radiusM(sim, j, c); const cl = Math.cos(sa * D2R); for (let k = 0; k < 3; k++) { const a = hash(j, k + 70) * Math.PI * 2; const lo = sl + Math.cos(a) * Rj * 1.2 / (R_M * cl * D2R), la = sa + Math.sin(a) * Rj * 1.2 / (R_M * D2R); this.emit(10, lo, la, 2, 2, 8, 12, 9, j * 3 + k); this.emit(14, lo, la, 8, 0, 10, 220, 50, j * 3 + k + 1); } } }
      // festivals: fireworks over a capital in the year its people enter a new era (Renaissance on); bonfires before that
      for (let k = sim.worldEvents.length - 1; k >= 0 && k > sim.worldEvents.length - 80; k--) { const e = sim.worldEvents[k]; if (e.type !== 'era' || yr - e.year > 1 || e.civ < 0) continue; const c = sim.civs[e.civ]; if (!c || c.capital < 0) continue; const [lon, lat] = TOWN.siteOf(sim, c.capital, c, T, null); if (!near(lon, lat, reach)) continue; scenes++; const R = TOWN.radiusM(sim, c.capital, c); if (c.era >= 5) { const cols = [0xffd36a, 0xff6a6a, 0x7ad0ff, 0xb8ff7a, 0xffffff, 0xff9ad0]; for (let q = 0; q < 9; q++) { const a = hash(c.capital, q) * Math.PI * 2, rr = hash(c.capital, q + 9) * R * 0.7; const cl = Math.cos(lat * D2R); this.emit(70, lon + Math.cos(a) * rr / (R_M * cl * D2R), lat + Math.sin(a) * rr / (R_M * D2R), 4, 5, 6, 220 + 120 * hash(c.capital, q + 20), 14, c.capital * 7 + q, cols[q % cols.length]); } } else { this.emit(30, lon, lat, 1, 2, 10, 14, 7, c.capital * 9); this.emit(20, lon, lat, 6, 3, 8, 60, 3, c.capital * 9 + 1); this.emit(16, lon, lat, 12, 0, 6, 160, 30, c.capital * 9 + 2); } }
      // earthquake: dust rising from every struck town for a year, and small fires among the rubble
      for (const [ci, y0] of sim.rubble) { if (yr - y0 > 1) continue; if (!sim.level[ci] || sim.owner[ci] < 0) continue; const c = sim.civs[sim.owner[ci]]; if (!c) continue; const [lon, lat] = TOWN.siteOf(sim, ci, c, T, null); if (!near(lon, lat, reach)) continue; scenes++; const R = TOWN.radiusM(sim, ci, c); this.emit(50, lon, lat, 4, 4, R * 0.9, 40, R * 0.12, ci * 23); this.emit(10, lon, lat, 10, 0, R * 0.8, 300, 40, ci * 29); this.emit(16, lon, lat, 2, 2, R * 0.8, 8, 6, ci * 31); }
      const g = this.points.geometry; for (const k of ['position', 'aUp', 'aEast', 'aNorth', 'aSeed', 'aCol']) GEO.touch(g.attributes[k], this.n); g.setDrawRange(0, this.n); this.count = this.n;
      for (const k in this.inst) { const I = this.inst[k]; const c = this.counts[k] || 0; I.mesh.count = c; GEO.touch(I.mesh.instanceMatrix, c); GEO.touch(I.mesh.instanceColor, c); GEO.touch(I.info, c); }
      this.stats = { particles: this.n, soldiers: 0, scenes };
    }
    animateSoldiers(dt) {
      let n = 0; const sp = this.spos, sc = this.scol, ph = this.sph; const exag = this.exag;
      for (const col of this.columns) {
        col.phase = (col.phase + dt * 0.02 * col.speed) % 1;
        const adv = Math.sin(col.phase * Math.PI * 2) * 25;    // the lines surge and fall back
        for (let k = 0; k < col.n && n < MAXS; k++) {
          const x0 = col.pts[k * 3] + col.ux * adv * col.dir * col.mLon, y0 = col.pts[k * 3 + 1] + col.uy * adv * col.dir * col.mLat; const hg = col.pts[k * 3 + 2];
          const lo = x0 * D2R, la = y0 * D2R; const cla = Math.cos(la); const rr = 1 + (Math.max(hg, 0) * exag + 1.0) / R_M;
          sp[n * 3] = cla * Math.cos(lo) * rr; sp[n * 3 + 1] = Math.sin(la) * rr; sp[n * 3 + 2] = -cla * Math.sin(lo) * rr;
          sc[n * 3] = col.col[0]; sc[n * 3 + 1] = col.col[1]; sc[n * 3 + 2] = col.col[2]; ph[n] = hash(k, 3); n++;
        }
      }
      const g = this.soldiers.geometry; GEO.touch(g.attributes.position, n); GEO.touch(g.attributes.aCol, n); GEO.touch(g.attributes.aPhase, n); g.setDrawRange(0, n); this.stats.soldiers = n;
    }
  }
  window.EVENTS = { Effects };
})();
