// The weather that is seen (weather.js; window.WEATHER). Classic script.
//
// Rain and snow fall where the Earth's own clouds (sky.js: the Blue Marble's, drifting round the world) stand thick over the place
// looked at, as far as its climate lets them (a desert's cloud seldom rains): showers that come and go as the clouds go by, and that
// swell and slacken on their own as they pass. Close to the ground the rain is seen as streaks and the snow as flakes, in a volume
// about the eye whose size goes with how far the eye is from what it looks at - as a town is drawn many times larger than life, the
// rain is drawn for the picture, and a streak reads as rain at every height. Under it the light goes grey and the distance into murk
// (post.js: uMurk), and the ground darkens with the wet, drying slowly when the rain has passed (terrain.js: uWet). In the warm wet
// lands, and in the summer of the continents, a heavy shower is a thunderstorm: the sky flashes (post.js: uFlash), now and then a
// bolt comes down to the ground within sight, and its thunder comes after it, by how far away it struck (sound.js: SOUND.thunder).
// Snow falls where it is cold enough to lie (trees.js: lyingAt).
(() => {
  'use strict';
  const R_M = 6371000, D2R = Math.PI / 180, MAX = 16000, RAIN_N = 9000;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lsm = (a, b, x) => smooth(Math.log(a), Math.log(b), Math.log(Math.max(x, 1e-9)));
  // a slow wandering of its own (two sines out of step): how a shower swells and slackens
  const wander = (t, k) => 0.5 + 0.3 * Math.sin(t * 0.071 + k) + 0.2 * Math.sin(t * 0.193 + k * 2.3);

  // A streak (or a flake) is a quad about a point in a box of metres round the eye, east, up and north. The box is anchored to the
  // ground (uOff: where the eye is, wrapped by the box), so the rain does not travel with the eye; the points fall through it and
  // come in again at its top. A streak lies along the way the rain falls and turns about it to face the eye; a flake faces the eye.
  // Snow's box stands ahead of the eye (uC: the way it looks), so that most of its flakes are in the picture: a flake is a point, not
  // a streak, and about the eye a few hundred in sight were a pattern of dots. None comes nearer than a fifth of the box (a flake by
  // the eye is a blot).
  const VERT = `
    attribute vec4 aSeed;                  // where in the box (x, z), the phase of its fall, its own size
    uniform float uTime, uBox, uLen, uWid, uFall, uSnow, uRM;
    uniform vec2 uWind;                    // metres a second, east and north
    uniform vec3 uOff;                     // where the box stands (the eye and uC), metres east, up and north, wrapped by the box
    uniform vec3 uC;                       // the box's middle from the eye
    uniform mat3 uFrame;                   // east, up and north as the view has them
    varying vec2 vQ; varying float vA;
    void main() {
      float B = uBox, B2 = 2.0 * B;
      vec3 p = vec3(fract(aSeed.x - uOff.x / B2), 1.0 - fract(aSeed.z + uTime * uFall / B2 + uOff.y / B2), fract(aSeed.y - uOff.z / B2)) * B2 - B + uC;
      float sz = 0.6 + 0.8 * aSeed.w;
      if (uSnow > 0.5) { p.x += sin(uTime * 0.9 + aSeed.w * 40.0) * B * 0.025; p.z += cos(uTime * 0.7 + aSeed.x * 30.0) * B * 0.025; }
      float r = length(p), r0 = uSnow > 0.5 ? 0.2 : 0.04;
      vA = smoothstep(r0 * B, 3.0 * r0 * B, r) * (1.0 - smoothstep(0.7 * B, B, length(p - uC)));      // (nothing in the eye itself; the box's edge a sphere)
      vQ = position.xy;
      vec3 v;
      if (uSnow > 0.5) {
        v = uFrame * p / uRM; v.xy += position.xy * uWid * 2.0 * sz / uRM;
      } else {
        vec3 d = normalize(vec3(uWind.x, -uFall, uWind.y));
        vec3 side = cross(d, -p); side = length(side) > 1e-6 ? normalize(side) : vec3(1.0, 0.0, 0.0);
        vec3 w = p + d * (position.y * uLen * sz) + side * (position.x * uWid);
        v = uFrame * w / uRM;
      }
      gl_Position = projectionMatrix * vec4(v, 1.0);
    }`;
  const FRAG = `
    precision highp float;      // (uSnow is the vertex shader's too: one uniform, one precision)
    uniform float uSnow, uAlpha; uniform vec3 uCol; varying vec2 vQ; varying float vA;
    void main() {
      float a;
      if (uSnow > 0.5) { float r = length(vQ) * 2.0; a = 1.0 - smoothstep(0.25, 1.0, r); }
      else a = (1.0 - smoothstep(0.15, 0.5, abs(vQ.x))) * smoothstep(-0.5, -0.25, vQ.y) * (1.0 - smoothstep(0.1, 0.5, vQ.y));
      a *= vA * uAlpha; if (a < 0.003) discard;
      gl_FragColor = vec4(uCol * a, a);      // (premultiplied)
    }`;
  // A bolt: a jagged ribbon from the cloud's base to the ground, brighter than white (post.js lets it glow), there for a moment
  const BOLT_VERT = `
    attribute float aW; uniform float uRM; varying float vW;
    void main() { vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const BOLT_FRAG = `
    precision mediump float; uniform float uOn, uGlow; varying float vW;
    void main() {
      float w = abs(vW), core = 1.0 - smoothstep(0.12, 0.4, w), halo = (1.0 - w) * (1.0 - w) * 0.25;      // (a white-hot channel in a blue glow; post.js's glow blooms it)
      vec3 c = (vec3(0.85, 0.9, 1.0) * core * (1.0 + 4.0 * uGlow) + vec3(0.5, 0.62, 1.0) * halo) * uOn; if (max(c.r, c.b) < 0.004) discard;
      gl_FragColor = vec4(c, 1.0);
    }`;

  class Weather {
    constructor({ scene, terrain }) {
      this.scene = scene; this.terrain = terrain; this.enabled = true;
      const quad = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry(); g.index = quad.index; g.setAttribute('position', quad.attributes.position);
      const seed = new Float32Array(MAX * 4); let s = 12345; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < MAX * 4; i++) seed[i] = r();
      g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4)); g.instanceCount = 0;
      this.uniforms = { uTime: { value: 0 }, uBox: { value: 20 }, uLen: { value: 1 }, uWid: { value: 0.02 }, uFall: { value: 9 }, uSnow: { value: 0 }, uRM: { value: R_M }, uWind: { value: new THREE.Vector2() }, uOff: { value: new THREE.Vector3() }, uC: { value: new THREE.Vector3() }, uFrame: { value: new THREE.Matrix3() }, uAlpha: { value: 0.3 }, uCol: { value: new THREE.Color(0.7, 0.74, 0.8) } };
      this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, side: THREE.DoubleSide });
      this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 7; this.mesh.visible = false; scene.add(this.mesh);
      // the bolt: a ribbon of 24 pieces, made anew for each strike
      const N = 25, bg = new THREE.BufferGeometry(); this.boltPos = new Float32Array(N * 2 * 3); const w = new Float32Array(N * 2); for (let i = 0; i < N; i++) { w[i * 2] = -1; w[i * 2 + 1] = 1; }
      const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      bg.setAttribute('position', new THREE.BufferAttribute(this.boltPos, 3).setUsage(THREE.DynamicDrawUsage)); bg.setAttribute('aW', new THREE.BufferAttribute(w, 1)); bg.setIndex(idx);
      this.boltU = { uOn: { value: 0 }, uGlow: { value: 0 }, uRM: { value: R_M } };
      this.bolt = new THREE.Mesh(bg, new THREE.ShaderMaterial({ uniforms: this.boltU, vertexShader: BOLT_VERT, fragmentShader: BOLT_FRAG, transparent: true, depthWrite: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide }));      // (it writes its depth: the rain's murk is reckoned at the bolt, not at the sky behind it)
      this.bolt.frustumCulled = false; this.bolt.visible = false; this.bolt.renderOrder = 8; scene.add(this.bolt);
      // what is happening: cover (0..1 cloud overhead), rain and snow (0..1, how hard), storm (0..1), wet (the ground), flash (0..)
      this.state = { cover: 0, rain: 0, snow: 0, storm: 0, wet: 0, flash: 0, murk: 0, near: 0 };
      this.rain = 0; this.snowK = 0; this.wet = 0; this.flash = 0; this.nextStrike = 0; this.strikes = 0; this.onThunder = null; this._t = 0; this._q = 0;
      this.extra = null;      // for pictures and tests: { rain, snow, storm } held where asked (and holdBolt: the next bolt stays)
    }
    // the weather where the eye looks: o = { trees, world, globals, terrain, season, glow }
    update(cam, sim, now, dt, o) {
      const U = this.uniforms, S = this.state, t = now / 1000; U.uTime.value = t; this._t = t;
      const agl = (cam.agl || cam.alt || 1) * R_M, dist = cam.dist * R_M;
      if (!this.enabled || !sim) { this.mesh.visible = false; this.bolt.visible = false; S.rain = S.snow = S.murk = S.flash = 0; return S; }
      // how much cloud stands overhead, and how much of it falls (worked out a few times a second: it changes as the clouds go by)
      if ((this._q -= dt) <= 0) {
        this._q = 0.25;
        const W = o.world, SK = window.SKY; let cover = 0;
        if (SK && SK.cloudMap && W) cover = SK.less(SK.cloudAt(cam.lon, cam.lat, W.cloudShift), W.cloudNear) * clamp(W.cloudVis * 1.5, 0, 1);
        let kc = 0, arid = 0, cold = 0, lying = 0, hgt = 0;
        if (o.trees && o.trees.ready) { kc = o.trees.climateAt(cam.lon, cam.lat); const T = window.TREES && TREES.Trees; arid = T ? T.ARID[kc] || 0 : 0; cold = T ? T.COLD[kc] || 0 : 0; hgt = o.terrain ? Math.max(0, o.terrain.heightAt(cam.lon, cam.lat)) : 0; const cy = o.globals ? (cam.lat >= 0 ? o.globals.uBare.value.z : o.globals.uBare.value.w) : 0.5; lying = o.trees.lyingAt(cam.lon, cam.lat, cy, hgt); }
        const wet = 1 - 0.85 * arid;
        // (and as the year is there, climate.js: a drought holds the rain off whatever the clouds, a good year brings it more often)
        const CL = sim.climate, ci = clamp(Math.floor((90 - cam.lat) / 180 * 360), 0, 359) * 720 + ((Math.floor((cam.lon + 180) / 360 * 720) % 720) + 720) % 720, hv = CL && CL.hv ? (CL.ice && CL.ice[ci] ? 1 : CL.hv[ci]) : 1;      // (over the ice the harvest is nought, and it snows there all the same)
        let rain = smooth(0.58, 0.88, cover) * wet * clamp(0.55 + 0.7 * wander(t, cam.lon * 0.1), 0, 1) * smooth(0.62, 0.95, hv || 0) * (hv > 1.05 ? 1.2 : 1);
        let snow = smooth(0.2, 0.5, lying);      // (it snows where snow is lying, or as good as)
        const ph = ((o.season || 0.45) + (cam.lat < 0 ? 0.5 : 0)) % 1, summer = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
        let storm = (kc >= 1 && kc <= 4 ? 1 : kc === 9 || kc === 15 || kc === 18 || kc === 22 || kc === 26 ? smooth(0.6, 0.9, summer) : 0) * smooth(0.55, 0.85, rain) * (1 - snow);
        const X = this.extra; if (X) { if (X.rain !== undefined) rain = X.rain; if (X.snow !== undefined) snow = X.snow; if (X.storm !== undefined) storm = X.storm; }
        S.cover = cover; S.target = rain; S.snow = snow; S.storm = storm; S.kc = kc; S.cold = cold;
      }
      // a shower comes in and goes over some seconds; the ground wets fast and dries slowly
      this.rain += (S.target - this.rain) * (1 - Math.exp(-dt / 4)); S.rain = this.rain;
      this.wet += (this.rain > this.wet ? (this.rain - this.wet) * (1 - Math.exp(-dt / 6)) : (this.rain - this.wet) * (1 - Math.exp(-dt / 60))); S.wet = this.wet * (1 - S.snow);
      // what is seen of it: the streaks or flakes about the eye while it is under the clouds' base
      const near = 1 - lsm(1800, 5000, agl); S.near = near;
      const amount = this.rain * near, N = Math.round((S.snow > 0.5 ? MAX : RAIN_N) * clamp(amount * 1.15, 0, 1));
      this.mesh.geometry.instanceCount = N; this.mesh.visible = N > 20;
      if (this.mesh.visible) {
        const B = clamp(dist * 0.12, 8, 260); U.uBox.value = B; U.uSnow.value = S.snow > 0.5 ? 1 : 0;
        U.uFall.value = S.snow > 0.5 ? B * 0.12 : B * 1.15; U.uLen.value = B * 0.05 * (0.7 + 0.5 * this.rain); U.uWid.value = B * (S.snow > 0.5 ? 0.0009 : 0.0016);
        // the wind slants the rain: from the west in the middle latitudes, from the east in the trades (as the surf has it), stronger in a storm
        const aLat = Math.abs(cam.lat), west = aLat > 30 && aLat < 62 ? 1 : aLat < 28 ? -1 : 0.3, ws = (2 + 6 * S.storm) * B / 9; U.uWind.value.set(west * ws, ws * 0.3 * Math.sin(t * 0.05));
        // the frame: east, up and north at the point looked at, as the view turns them; the eye's place in it, wrapped by the box
        const f = GEO.enu(cam.lon, cam.lat), cp = cam.camera.position, mv = cam.camera.matrixWorldInverse.elements;
        const rot = (v) => [mv[0] * v.x + mv[4] * v.y + mv[8] * v.z, mv[1] * v.x + mv[5] * v.y + mv[9] * v.z, mv[2] * v.x + mv[6] * v.y + mv[10] * v.z];
        const e = rot(f.east), u = rot(f.up), n = rot(f.north);
        U.uFrame.value.set(e[0], u[0], n[0], e[1], u[1], n[1], e[2], u[2], n[2]);
        const B2 = 2 * B, wrap = (x) => ((x % B2) + B2) % B2, C = U.uC.value;
        if (S.snow > 0.5) { const m = cam.camera.matrixWorld.elements, k = -0.75 * B; C.set(k * (m[8] * f.east.x + m[9] * f.east.y + m[10] * f.east.z), k * (m[8] * f.up.x + m[9] * f.up.y + m[10] * f.up.z), k * (m[8] * f.north.x + m[9] * f.north.y + m[10] * f.north.z)); }
        else C.set(0, 0, 0);
        U.uOff.value.set(wrap((cp.x * f.east.x + cp.y * f.east.y + cp.z * f.east.z) * R_M + C.x), wrap((cp.x * f.up.x + cp.y * f.up.y + cp.z * f.up.z) * R_M + C.y), wrap((cp.x * f.north.x + cp.y * f.north.y + cp.z * f.north.z) * R_M + C.z));
        // the colour of rain against the light it falls in: pale in the day, dark at night, lit by the lightning
        const day = o.day !== undefined ? o.day : 1, fl = Math.min(1, this.flash);
        if (S.snow > 0.5) { U.uCol.value.setRGB(0.6 + 0.35 * day + fl * 0.3, 0.62 + 0.35 * day + fl * 0.3, 0.66 + 0.33 * day + fl * 0.3); U.uAlpha.value = 0.6; }
        else { U.uCol.value.setRGB(0.22 + 0.5 * day + fl * 0.5, 0.24 + 0.52 * day + fl * 0.5, 0.28 + 0.55 * day + fl * 0.5); U.uAlpha.value = 0.2 + 0.14 * this.rain; }
      }
      // the murk: what is far fades into the grey of the falling rain (post.js), while the eye is down in it
      S.murk = this.rain * (1 - lsm(2500, 9000, agl)) * (S.snow > 0.5 ? 0.85 : 0.7);
      // lightning: a flash now and then in a storm, sometimes a bolt to the ground within sight, the thunder after it
      this.flash = Math.max(0, this.flash - dt * 5);
      if (S.storm > 0.2 && this.rain > 0.4 && near > 0.05 && now >= this.nextStrike) {
        if (this.nextStrike > 0) this.strike(cam, o);
        this.nextStrike = now + (6 + Math.random() * 18) * 1000 / Math.max(0.3, S.storm);
      }
      if (!this.holdBolt) this.boltLife = Math.max(0, (this.boltLife || 0) - dt);      // (holdBolt: a bolt kept for a picture)
      this.boltU.uOn.value = this.boltLife > 0 ? Math.min(1, this.boltLife * 8) * (0.6 + 0.4 * Math.sin(this.boltLife * 90)) : 0; this.bolt.visible = this.boltLife > 0; this.boltU.uGlow.value = o.glow ? 1 : 0;
      S.flash = this.flash;
      return S;
    }
    // a strike: the sky flashes twice; one in three comes down within sight as a bolt; its thunder is heard after it
    strike(cam, o, bolt) {
      this.strikes++;
      const d = 1500 + Math.random() * 9000, a = Math.random() * Math.PI * 2;
      this.flash = 0.9 + Math.random() * 0.6; this.last = { d, at: performance.now(), flash: this.flash }; setTimeout(() => { this.flash = Math.max(this.flash, 0.7 + Math.random() * 0.5); }, 110 + Math.random() * 120);
      if ((bolt || Math.random() < 0.4) && cam.dist * R_M < 30000) {
        // the bolt stands toward where the eye looks, a few kilometres off, from the cloud's base (some 2 km up) to the ground
        const cl = Math.max(0.2, Math.cos(cam.lat * D2R)), dd = Math.min(d, Math.max(800, cam.dist * R_M * 0.9)), fwd = cam.heading || 0;
        const lon = cam.lon + Math.sin(fwd + (Math.random() - 0.5) * 1.2) * dd / (R_M * cl * D2R), lat = cam.lat + Math.cos(fwd + (Math.random() - 0.5) * 1.2) * dd / (R_M * D2R);
        const T = (o && o.terrain) || this.terrain, h0 = T ? Math.max(0, T.heightAt(lon, lat)) * (T.exag || 2) : 0, top = h0 + 2200 + Math.random() * 1200;
        const f = GEO.enu(lon, lat), P = this.boltPos, N = P.length / 6, wid = (8 + dd * 0.0025) * 1.8, cp = cam.camera.position;
        const side = new THREE.Vector3().crossVectors(f.up, new THREE.Vector3().copy(cp).sub(f.up)).normalize();      // (the ribbon turned across the eye's line)
        let x = 0, z = 0;
        for (let i = 0; i < N; i++) {
          const k = i / (N - 1), h = top + (h0 - top) * k; if (i > 0 && i < N - 1) { x += (Math.random() - 0.5) * 140; z += (Math.random() - 0.5) * 140; }
          const c = f.up.clone().multiplyScalar(1 + h / R_M).addScaledVector(f.east, x / R_M).addScaledVector(f.north, z / R_M);
          const sx = side.x * wid / R_M, sy = side.y * wid / R_M, sz = side.z * wid / R_M;
          P[i * 6] = c.x - sx; P[i * 6 + 1] = c.y - sy; P[i * 6 + 2] = c.z - sz; P[i * 6 + 3] = c.x + sx; P[i * 6 + 4] = c.y + sy; P[i * 6 + 5] = c.z + sz;
        }
        this.bolt.geometry.attributes.position.needsUpdate = true; this.boltLife = 0.32;
        if (this.onThunder) this.onThunder(dd, true);
      } else if (this.onThunder) this.onThunder(d, false);
    }
    clear() { this.mesh.visible = false; this.bolt.visible = false; this.rain = 0; this.flash = 0; this.state.rain = this.state.murk = this.state.flash = 0; }
  }
  window.WEATHER = { Weather };
})();
