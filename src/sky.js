// GENESIS sky: the stars, the Milky Way, the Moon and the clouds, as the Earth has them (data/sky: tools/planet/sky.py makes
// the pack, tools/planet/fetch.mjs brings it). Classic script; exposes window.SKY.
//
// The stars are points, a third of a million of them (every star to the tenth magnitude: the Bright Star Catalogue, Hipparcos,
// Tycho-2), each where it stands, as bright as it is and of its own colour; behind them the light of all the fainter ones, which
// is the Milky Way (a picture: NASA's Deep Star Maps). They turn as the sky turns: once a day against the ground, once a year
// against the sun (the game's sun has a place among them, which is the time of year: in June it stands in the Twins and the
// Scorpion is the night's), and once in 25,772 years about the pole of the Earth's path, which is why the world's first nights
// turn about a point near Vega and not about the Pole Star. The Moon is its near side as the orbiter's camera has it, lit by where the sun
// is, with the craters along the edge of its night. The clouds are the Blue Marble's (16,384 texels round the Earth) on a shell
// above the highest ground, with a grain of their own where the picture's texels give out, lit by the sun as the air has
// dimmed it, seen from above and from under.
(function () {
  const SIN_E = 0.4, COS_E = Math.sqrt(1 - SIN_E * SIN_E);      // the tilt of the Earth's axis, as the game's seasons have it (main.js: decl)
  const SHELL = 1.004;                                           // the clouds' shell: 25 km up as the ground is drawn (twice life), above the highest of it
  const TAU = Math.PI * 2;
  const SKY = { ready: {}, index: null, soft: false, SHELL, moonSize: 0.022, drift: 6.3e-5 };      // (drift: how fast the weather goes round, radians a second: some 400 m/s on the ground, which from under a shell 25 km up is a calm sky)

  // ---------- the pack ----------
  const bitmap = (url, flip) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + ': ' + r.status); return r.blob(); }).then((b) => createImageBitmap(b, { imageOrientation: flip === false ? 'none' : 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
  // a picture as a texture; let go of once the card has it (a pair of them are 8192 square: a quarter of a gigabyte each while they are held)
  function texOf(bm, o) {
    const t = new THREE.Texture(bm); t.flipY = false; t.format = o.format || THREE.RGBAFormat; t.wrapS = o.wrapS || THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = o.mips === false ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter; t.generateMipmaps = o.mips !== false; t.anisotropy = o.aniso || 1;
    t.onUpdate = () => { try { if (bm.close) bm.close(); } catch (e) {} t.onUpdate = null; }; t.needsUpdate = true; return t;
  }
  // Brings what the sky is made of, piece by piece, each put to use as it arrives (SKY.ready.<piece>, and SKY.onPiece(name) is
  // called). soft: a renderer that draws in software takes the stars the eye can see and the clouds' small picture, no more.
  SKY.load = function (opts) {
    const base = (opts && opts.base) || 'data/sky/'; SKY.soft = !!(opts && opts.soft); const done = (n) => { SKY.ready[n] = true; if (SKY.onPiece) SKY.onPiece(n); };
    const lost = (n) => (e) => console.warn('the sky: ' + n + ': ' + (e && e.message || e));
    return fetch(base + 'index.json').then((r) => { if (!r.ok) throw new Error('index.json: ' + r.status); return r.json(); }).then((ix) => {
      SKY.index = ix; const jobs = [];
      if (ix.stars) jobs.push(fetch(base + 'stars.bin').then((r) => r.arrayBuffer()).then((b) => { SKY.starData = b; done('stars'); }).catch(lost('the stars')));
      if (ix.milkyway) jobs.push(bitmap(base + 'milkyway.webp').then((bm) => { SKY.milky = texOf(bm, { wrapS: THREE.RepeatWrapping, mips: false }); done('milkyway'); }).catch(lost('the Milky Way')));
      if (ix.moon) jobs.push(bitmap(base + 'moon.webp').then((bm) => { SKY.moon = texOf(bm, {}); done('moon'); }).catch(lost('the Moon')));
      if (ix.clouds) {
        jobs.push(bitmap(base + ix.clouds.small).then((bm) => {
          // (the small one is also asked by the game itself: how much cloud stands over a place - SKY.cloudAt)
          try { const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.translate(0, bm.height); g.scale(1, -1); g.drawImage(bm, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data, a = new Uint8Array(c.width * c.height); for (let i = 0; i < a.length; i++) a[i] = d[i * 4]; SKY.cloudMap = { a, w: c.width, h: c.height }; } catch (e) { lost('the clouds\' map')(e); }
          SKY.cloudSmall = texOf(bm, { wrapS: THREE.RepeatWrapping }); done('clouds');
        }).catch(lost('the clouds')));
        if (!SKY.soft) jobs.push(Promise.all(ix.clouds.halves.map((f) => bitmap(base + f))).then((bms) => { SKY.cloudHalves = bms.map((bm) => texOf(bm, { format: THREE.RedFormat, aniso: 4 })); done('cloudsFine'); }).catch(lost('the clouds at their finest')));
      }
      if (ix.noise && !SKY.soft) jobs.push(fetch(base + ix.noise.file).then((r) => r.arrayBuffer()).then((b) => {
        const n = ix.noise.n, t = new THREE.DataTexture3D(new Uint8Array(b), n, n, n); t.format = THREE.RGFormat; t.internalFormat = 'RG8'; t.type = THREE.UnsignedByteType; t.unpackAlignment = 1;
        t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; SKY.grain = t; done('grain');
      }).catch(lost('the clouds\' grain')));
      return Promise.all(jobs);
    }).catch((e) => { console.warn('the sky: ' + (e && e.message || e) + ' (npm run fetch brings it: without it the sky has no stars, a plain Moon and no clouds)'); });
  };
  // how much cloud stands over a place, 0 .. 1 (the small picture, between its texels; shift: how far the weather has gone round)
  SKY.cloudAt = function (lon, lat, shift) {
    const m = SKY.cloudMap; if (!m) return 0; let u = ((lon * Math.PI / 180 - (shift || 0)) / TAU + 0.5) % 1; if (u < 0) u += 1;
    const x = u * m.w - 0.5, y = Math.min(m.h - 1.001, Math.max(0, (90 - lat) / 180 * m.h - 0.5)), x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, X = (k) => ((k % m.w) + m.w) % m.w;
    const a = m.a[y0 * m.w + X(x0)], b = m.a[y0 * m.w + X(x0 + 1)], c = m.a[(y0 + 1) * m.w + X(x0)], d = m.a[(y0 + 1) * m.w + X(x0 + 1)];
    return ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy) / 255;
  };

  // ---------- how the sky stands ----------
  // The stars are kept as they stood in the year 2000, in the frame the game's globe has (y to the north pole of the sky, right
  // ascension where longitude is). This gives the turn that carries them to where they stand now, over the game's Earth:
  //   about the pole of the Earth's path by how far the year is from 2000 (the axis goes round it once in 25,772 years);
  //   then about the Earth's own axis by the hour of the stars, which is where the sun stands among them (the time of year)
  //   less where it stands over the Earth (the time of day).
  // sun: the way to the sun (the globe's frame); phase: the time of year, 0 at the winter solstice of the north; year: the
  // world's year (negative BC). Also gives the pole of the Earth's path as it stands now (out.ecl), near enough the Moon's north.
  const _ax = new THREE.Vector3(0, COS_E, SIN_E), _m = new THREE.Matrix4(), _y = new THREE.Vector3(0, 1, 0);
  SKY.turn = function (sun, phase, year, out) {
    const L = phase * TAU - Math.PI / 2, raSun = Math.atan2(COS_E * Math.sin(L), Math.cos(L)), lonSun = Math.atan2(-sun.z, sun.x);
    out.makeRotationAxis(_y, -(raSun - lonSun)).multiply(_m.makeRotationAxis(_ax, ((year === undefined ? 2000 : year) - 2000) / 25772 * TAU));
    if (!out.ecl) out.ecl = new THREE.Vector3(); out.ecl.copy(_ax).applyMatrix4(out);      // (the path's pole turns with the Earth's hour only: the other turn is about it)
    return out;
  };
  // Where the Moon stands: round from the sun by its age (0 new, pi full) - along the Earth's path, and a little off it as it
  // goes (five degrees: its own path is tilted so much). The turn is about the pole of the Earth's path as nearly as may be
  // while still square to the sun: where the game has the sun off its path (the home screen holds it in the picture) the
  // Moon's age is still its angle from the sun, and its phase is what its age says.
  const _a = new THREE.Vector3();
  SKY.moonAt = function (sun, ecl, age, out) {
    _a.copy(ecl).addScaledVector(sun, -ecl.dot(sun)); if (_a.lengthSq() < 1e-6) _a.set(0, 1, 0).addScaledVector(sun, -sun.y); _a.normalize();
    out.copy(sun).applyAxisAngle(_a, age).addScaledVector(_a, 0.089 * Math.sin(age * 1.085 + 1.3)).normalize(); return out;
  };

  // ---------- the stars ----------
  SKY.STAR_V = `
    attribute vec2 aMag;      // how bright (V, magnitudes: the less the brighter), what colour (B-V: blue under nought, the sun 0.65, red over 1.4)
    uniform float uPx, uLow, uTime, uDeep, uGain; uniform vec3 uUp, uMoonW; uniform vec2 uMoonK; varying vec3 vCol;
    void main() {
      vec3 wd = normalize(mat3(modelMatrix) * position);
      vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z = p.w * 0.9999995; gl_Position = p;
      // (the eye takes light by something like its fourth root: a star five magnitudes fainter is a hundredth of the light, and
      //  is drawn a little under a third as bright and somewhat smaller - drawn as its light is, the sky is seven stars and nothing)
      float c = exp(-0.4145 * aMag.x), lum = 2.2 * exp(-0.25 * aMag.x), deep = 1.0 - smoothstep(uDeep - 1.3, uDeep, aMag.x);
      gl_PointSize = (1.6 + 3.4 * sqrt(c)) * uPx;      // (never under a pixel and a half: a point smaller than the pixels it falls between is a star that comes and goes as the sky turns)
      // from the ground (uLow): none in the thick air along the horizon, and they twinkle, the low ones most
      float el = dot(wd, uUp), tw = 0.5 + 0.5 * sin(uTime * (2.1 + 3.0 * fract(aMag.y * 37.0)) + position.x * 311.0 + position.z * 173.0);
      float seen = mix(1.0, smoothstep(0.015, 0.22, el) * (1.0 - (0.16 + 0.34 * (1.0 - smoothstep(0.1, 0.7, el))) * tw), uLow);
      float bv = aMag.y; vec3 t = mix(vec3(0.60, 0.71, 1.0), vec3(0.96, 0.97, 1.0), smoothstep(-0.3, 0.35, bv)); t = mix(t, vec3(1.0, 0.85, 0.66), smoothstep(0.35, 1.05, bv)); t = mix(t, vec3(1.0, 0.62, 0.38), smoothstep(1.05, 1.9, bv));
      // (not through the Moon)
      float hid = step(uMoonK.x, dot(wd, uMoonW)) * uMoonK.y;
      vCol = t * (lum * uGain * deep * seen * (1.0 - hid)); }`;      // (the few brightest are brighter than white: post.js gives them a little glow)
  SKY.STAR_F = `uniform float uAlpha; varying vec3 vCol; void main() { vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q, q) * 9.0) - 0.105; gl_FragColor = vec4(vCol * max(a, 0.0) * uAlpha, 1.0); }`;
  class Stars {
    constructor(scene) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)); g.setAttribute('aMag', new THREE.BufferAttribute(new Float32Array(2), 2)); g.setDrawRange(0, 0);
      this.uniforms = { uAlpha: { value: 1 }, uPx: { value: 1 }, uLow: { value: 0 }, uTime: { value: 0 }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uDeep: { value: 7 }, uGain: { value: 1 }, uMoonW: { value: new THREE.Vector3(0, 1, 0) }, uMoonK: { value: new THREE.Vector2(Math.cos(SKY.moonSize), 1) } };
      this.points = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.uniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, vertexShader: SKY.STAR_V, fragmentShader: SKY.STAR_F }));
      this.points.frustumCulled = false; this.points.renderOrder = -4; this.points.matrixAutoUpdate = false; scene.add(this.points); this.n = 0; this.count = [];
    }
    // the list as the pack has it: "HST1", how many, then six bytes a star, brightest first
    set(buf, ix) {
      const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x31545348) throw new Error('not a list of stars'); const all = dv.getUint32(4, true), n = SKY.soft ? Math.min(all, ix.eye || 9000) : all;
      const pos = new Float32Array(n * 3), mag = new Float32Array(n * 2), v0 = ix.v0 === undefined ? -1.5 : ix.v0, vs = ix.vStep || 0.05, b0 = ix.bv0 === undefined ? -0.4 : ix.bv0, b1 = ix.bv1 === undefined ? 2.0 : ix.bv1;
      this.count = [];      // (how many stars there are to each half magnitude: the faint ones are left off whole when nobody could see them)
      for (let i = 0, o = 8; i < n; i++, o += 6) {
        const ra = dv.getUint16(o, true) / 65536 * TAU, de = dv.getInt16(o + 2, true) / 32767 * Math.PI / 2, v = v0 + dv.getUint8(o + 4) * vs, c = Math.cos(de);
        pos[i * 3] = c * Math.cos(ra); pos[i * 3 + 1] = Math.sin(de); pos[i * 3 + 2] = -c * Math.sin(ra); mag[i * 2] = v; mag[i * 2 + 1] = b0 + dv.getUint8(o + 5) / 255 * (b1 - b0);
        const k = Math.max(0, Math.ceil((v + 1.5) * 2)); for (let j = this.count.length; j <= k; j++) this.count[j] = i; this.count[k] = i + 1;
      }
      const g = this.points.geometry; g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aMag', new THREE.BufferAttribute(mag, 2)); this.n = n; g.setDrawRange(0, n);
    }
    // deep: the faintest magnitude shown (the stars fade out over the magnitude before it)
    update(camPos, turn, deep) { const p = this.points; p.matrix.copy(turn).setPosition(camPos); p.matrixWorld.copy(p.matrix); this.uniforms.uDeep.value = deep; const k = Math.max(0, Math.ceil((deep + 1.5) * 2)); p.geometry.setDrawRange(0, k < this.count.length ? this.count[k] : this.n); }
  }

  // ---------- the Milky Way and the Moon, for the sky's own shader (world.js) ----------
  // milky(dir): the light of the faint stars along a line of sight (the world's frame): the pack's picture, which holds the
  // root of 1 - exp(-4 x), looked up where the line points among the stars. moonDisc(dir, sun): the Moon's light there and how
  // much of the pixel it covers - its near side by the orbiter's camera, lit as dust is (Lommel and Seeliger: a full Moon is as
  // bright at its rim as in its middle), each crater by the way its ground faces; the dark part by the light of the Earth.
  SKY.GLSL = `
    uniform sampler2D uMilky, uMoonTex; uniform mat3 uSkyM; uniform vec3 uMoonW, uEclW; uniform vec4 uMoonK;      // uMoonK: the cosine of its size, the size, which level of its picture, whether there is a picture
    uniform float uMilkyOn;
    vec3 milky(vec3 dir) {
      vec3 d = dir * uSkyM;      // (the turn undone: a rotation's inverse is itself laid on its side)
      vec3 s = textureLod(uMilky, vec2(0.5 - atan(-d.z, d.x) * 0.15915494, 0.5 + asin(clamp(d.y, -1.0, 1.0)) * 0.31830989), 0.0).rgb;
      return max(-log(max(1.0 - s * s, 0.02)) * 0.25 - 0.004, 0.0) * uMilkyOn; }
    vec4 moonDisc(vec3 dir, vec3 sun) {
      float md = dot(dir, uMoonW); if (md < uMoonK.x) return vec4(0.0);
      vec3 nA = normalize(uEclW - uMoonW * dot(uEclW, uMoonW)), rt = cross(uMoonW, nA), off = dir - uMoonW * md;
      vec2 xy = vec2(dot(off, rt), dot(off, nA)) / uMoonK.y; float r2 = dot(xy, xy); if (r2 >= 1.0) return vec4(0.0);
      vec3 s = vec3(dot(sun, rt), dot(sun, nA), -dot(sun, uMoonW)), n = vec3(xy, sqrt(1.0 - r2)); float alb = 0.5;
      if (uMoonK.w > 0.5) { vec3 t = textureLod(uMoonTex, xy * 0.4925 + 0.5, uMoonK.z).rgb; alb = t.r; vec2 g = t.gb * 2.0 - 1.0; n = normalize(vec3(g, sqrt(max(1.0 - dot(g, g), 0.0)))); }
      float mu0 = max(dot(n, s), 0.0), mu = sqrt(1.0 - r2), lit = 2.0 * mu0 / (mu0 + mu + 0.02) * smoothstep(-0.02, 0.06, dot(vec3(xy, mu), s));
      vec3 c = vec3(1.0, 0.985, 0.95) * alb * lit + vec3(0.55, 0.68, 0.9) * alb * 0.018 * (0.5 - 0.5 * s.z);      // (the Earth's light on the Moon's night: most when the Moon is new, and the Earth full in its sky)
      return vec4(c, 1.0 - smoothstep(0.955, 1.0, sqrt(r2))); }`;

  // ---------- the clouds ----------
  // A mesh of the shell about the eye: rings by the angle of the line of sight (from above: from straight down out to where the
  // line only brushes the shell, the rings crowding to that rim; from under it: from the ground's horizon up to straight
  // overhead, crowding to the horizon), so its corners are as close in the picture wherever the eye is, and the air between is
  // worked out at them as it is for everything else. Where a corner lies on the Earth, and so what it shows, is the fragment's.
  const NR = 112, NS = 144;
  SKY.CLOUD_V = (AIR_V) => `
    attribute vec2 aCl; uniform float uBelow, uShellR; varying vec3 vDirW, vPosV, vSunT; ${AIR_V}
    void main() {
      vec3 up = -normalize(uAirC); float rc = length(uAirC), s = aCl.x / ${NR}.0, psi, t;
      if (uBelow > 0.5) { float ph = asin(clamp(1.0 / rc, 0.0, 1.0)) - 0.06; psi = ph + (3.14159265 - ph) * pow(s, 1.7); t = rc * cos(psi) + sqrt(max(uShellR * uShellR - rc * rc * sin(psi) * sin(psi), 0.0)); }
      else { float pt = asin(clamp(uShellR / rc, 0.0, 1.0)); psi = pt * (1.0 - pow(1.0 - s, 2.2)); t = rc * cos(psi) - sqrt(max(uShellR * uShellR - rc * rc * sin(psi) * sin(psi), 0.0)); }
      vec3 ax = abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), e1 = normalize(cross(up, ax)), e2 = cross(up, e1);
      vec3 pv = (-up * cos(psi) + (e1 * cos(aCl.y) + e2 * sin(aCl.y)) * sin(psi)) * t, pc = pv - uAirC;
      vPosV = pv; vDirW = transpose(mat3(viewMatrix)) * pc;
      // the sun's light as it reaches the cloud: white while the sun is high, yellow, red and gone as the Earth's own rim comes between
      // (and as the eye takes it: opened to the low sun as it is for the sky behind them - uAirE.x, 8.6 at noon from the ground -
      //  so the clouds of a sunset are the brightest things in it, and those of the dusk after it a deep red against a sky still light)
      float r = length(pc), h = r - A_RG; vSunT = airSun(r, dot(pc / r, uAirS), exp(-h / A_HR), exp(-h / A_HM)) * (uAirE.x > 0.0 ? uAirE.x * 0.1163 : 1.0);
      air(pv, 5.0, vAirT, vAirL);
      gl_Position = projectionMatrix * vec4(pv, 1.0); }`;
  SKY.CLOUD_F = (AIR_F) => `
    precision highp sampler3D;
    uniform sampler2D uCloudS, uCloud0, uCloud1; uniform sampler3D uGrain; uniform vec3 uAirC, uAirS, uSunW;
    uniform float uFine, uGrainOn, uBelow, uOpacity, uThin, uTime, uShellR, uDown; uniform vec2 uShiftCS;
    varying vec3 vDirW, vPosV, vSunT; ${AIR_F}
    // the picture of the clouds where a line from the Earth's middle points (q: unit, the weather's turn taken out), with how
    // fast that changes across the pixel: told outright, because the picture's own edge (the date line) and the two halves of the
    // fine one would each be a line of wrong texels if the card were left to work it out
    float cover(vec3 q, vec3 dx, vec3 dy) {
      float k = 1.0 / max(q.x * q.x + q.z * q.z, 1e-4), kl = 0.31830989 / sqrt(max(1.0 - q.y * q.y, 1e-4));
      vec2 uv = vec2(atan(-q.z, q.x) * 0.15915494 + 0.5, asin(clamp(q.y, -1.0, 1.0)) * 0.31830989 + 0.5);
      vec2 gx = vec2((q.z * dx.x - q.x * dx.z) * k * 0.15915494, dx.y * kl), gy = vec2((q.z * dy.x - q.x * dy.z) * k * 0.15915494, dy.y * kl);
      if (uFine > 0.5) {
        vec2 u2 = vec2(clamp(fract(uv.x * 2.0), 0.00007, 0.99993), uv.y); gx.x *= 2.0; gy.x *= 2.0;
        return uv.x < 0.5 ? textureGrad(uCloud0, u2, gx, gy).r : textureGrad(uCloud1, u2, gx, gy).r; }
      return textureGrad(uCloudS, uv, gx, gy).r; }
    float coverS(vec3 q) { return textureLod(uCloudS, vec2(atan(-q.z, q.x) * 0.15915494 + 0.5, asin(clamp(q.y, -1.0, 1.0)) * 0.31830989 + 0.5), 1.0).r; }
    void main() {
      vec3 n = normalize(vDirW), q = vec3(n.x * uShiftCS.x - n.z * uShiftCS.y, n.y, n.z * uShiftCS.x + n.x * uShiftCS.y);
      vec3 dx = dFdx(q), dy = dFdy(q); float foot = max(length(dx), length(dy));      // (how much of the shell a pixel takes, to the unit of the globe)
      float c = cover(q, dx, dy);
      // As the picture has it: a texel's lightness is how much cloud there is. From where a texel is larger than a pixel or two
      // that is a blur, and the grain takes over: heaps of cloud, as many as leave just so much of the sky covered, their edges
      // eaten at; and what the picture has of thin high cloud stays as a veil over them.
      float a = pow(c, 0.85), thick = c, dK = (1.0 - smoothstep(0.5e-4, 1.6e-4, foot)) * uGrainOn;
      if (dK > 0.001) {
        vec3 p = q * 318.0, w = vec3(uTime * 0.004, uTime * 0.0013, -uTime * 0.0027);
        float n1 = textureGrad(uGrain, p + w, dx * 318.0, dy * 318.0).r;
        float n2 = textureGrad(uGrain, p.zxy * 5.03 + w * 3.0, dx.zxy * 1600.0, dy.zxy * 1600.0).g;
        float n3 = textureGrad(uGrain, p.yzx * 21.9, dx.yzx * 6964.0, dy.yzx * 6964.0).g;
        float m = n1 - 0.26 * (1.0 - n2) - 0.10 * (1.0 - n3), f = clamp(c * 1.05, 0.0, 1.0), x = (m - (0.84 - 1.04 * f)) / 0.07;
        float heap = smoothstep(-0.5, 0.5, x), veil = 0.4 * c;
        a = mix(a, 1.0 - (1.0 - heap) * (1.0 - veil), dK); thick = mix(thick, clamp(veil + heap * (0.35 + 0.25 * x), 0.0, 1.0), dK);      // (a heap hides what is behind it altogether: the sun's disc is thousands of times white, and a hundredth of it through a cloud is still a sun)
      }
      // (how the cloud's cover and the place change across the pixel: asked before any pixel is thrown away, while its neighbours still answer)
      vec3 Px = dFdx(vPosV), Py = dFdy(vPosV); float tx = dFdx(thick), ty = dFdy(thick);
      vec3 nV = normalize(vPosV - uAirC), vd = normalize(vPosV); float sunUp = dot(nV, uAirS), cosV = abs(dot(vd, nV));
      // (seen from above, a country under cloud is no country to rule: looked straight down through from where the game is
      //  played, the clouds are thin - uThin - and along the horizon and from far out they are as they are)
      a *= uOpacity * mix(1.0, uThin, smoothstep(0.2, 0.75, cosV));
      if (a < 0.004) discard;
      vec3 sunT = sqrt(vSunT); float day = max(max(sunT.r, sunT.g), sunT.b);
      vec3 sT = uAirS - nV * sunUp; float sl = length(sT); sT /= max(sl, 1e-4);
      vec3 col;
      if (uBelow > 0.5) {
        // from under them: what the sun sends through - bright where the cloud is thin and at its edges, grey under its
        // heart - with the glare of the sun behind an edge, and, when the sun is low, its light on their undersides
        float through = exp(-thick * 2.4), cs = max(dot(vd, uAirS), 0.0), under = 1.0 - smoothstep(0.02, 0.3, sunUp);
        vec3 body = sunT * (mix(0.36, 1.0, through) + through * (0.9 * pow(cs, 10.0) + 2.6 * pow(cs, 90.0)) + under * 0.55 * (1.0 - through));
        col = body + vec3(0.42, 0.52, 0.72) * 0.26 * (1.0 - through) * day + vec3(0.012, 0.016, 0.028);
      } else {
        // from above: lit on the side the sun is on. Which way a cloud thickens is had from how its cover changes across the
        // picture (the card knows that for nothing): thicker toward the sun, this pixel is on a far side and in shade
        float e = dot(Px, Px), fg = dot(Px, Py), g = dot(Py, Py), det = max(e * g - fg * fg, 1e-30);
        vec3 grad = ((g * tx - fg * ty) * Px + (e * ty - fg * tx) * Py) / det;
        float rise = dot(grad, sT) * 4.0e-4 * sl / max(sunUp + 0.08, 0.05) * smoothstep(0.1, 0.4, cosV);      // (4e-4: a cloud stands some two and a half kilometres tall; the lower the sun the longer its shade)
        float lit = clamp(0.62 - rise * 0.9, 0.0, 1.0);
        // and the shade of the weather beyond it, toward the sun: where more cloud stands there than here
        vec3 sW = normalize(uSunW - n * dot(n, uSunW));      // (the way to the sun along the shell, in the globe's own frame: the picture is looked up there)
        float ahead = coverS(normalize(q + vec3(sW.x * uShiftCS.x - sW.z * uShiftCS.y, sW.y, sW.z * uShiftCS.x + sW.x * uShiftCS.y) * (0.0016 * sl / max(sunUp + 0.1, 0.1))));
        lit *= 1.0 - 0.45 * clamp((ahead - c) * 2.5, 0.0, 1.0) * uDown;
        col = sunT * (0.52 + 0.56 * lit) * mix(0.9, 1.0, thick) + vec3(0.30, 0.38, 0.55) * 0.22 * (1.0 - lit) * day + vec3(0.014, 0.018, 0.03);
      }
      gl_FragColor = vec4(airOver(col, vAirT, vAirL), a); }`;
  class Clouds {
    constructor(scene, AIRX) {
      const cl = new Float32Array((NR + 1) * (NS + 1) * 2), idx = [];
      for (let r = 0; r <= NR; r++) for (let k = 0; k <= NS; k++) { cl[(r * (NS + 1) + k) * 2] = r; cl[(r * (NS + 1) + k) * 2 + 1] = k / NS * TAU; }
      for (let r = 0; r < NR; r++) for (let k = 0; k < NS; k++) { const a = r * (NS + 1) + k, b = a + NS + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
      const g = new THREE.BufferGeometry(); g.setAttribute('aCl', new THREE.BufferAttribute(cl, 2)); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((NR + 1) * (NS + 1) * 3), 3)); g.setIndex(idx);
      const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); blank.needsUpdate = true;
      const g3 = new THREE.DataTexture3D(new Uint8Array([128, 128]), 1, 1, 1); g3.format = THREE.RGFormat; g3.internalFormat = 'RG8'; g3.type = THREE.UnsignedByteType; g3.unpackAlignment = 1; g3.needsUpdate = true;
      this.uniforms = Object.assign({ uCloudS: { value: blank }, uCloud0: { value: blank }, uCloud1: { value: blank }, uGrain: { value: g3 }, uFine: { value: 0 }, uGrainOn: { value: 0 }, uBelow: { value: 0 }, uOpacity: { value: 0 }, uThin: { value: 1 }, uTime: { value: 0 },
        uShellR: { value: SHELL }, uDown: { value: 1 }, uShiftCS: { value: new THREE.Vector2(1, 0) }, uSunW: { value: new THREE.Vector3(1, 0, 0) } }, AIRX.uniforms);
      this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true }, vertexShader: SKY.CLOUD_V(AIRX.VERT), fragmentShader: SKY.CLOUD_F(AIRX.FRAG) }));
      this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; scene.add(this.mesh); this.on = true; this.shift = 0; this.vis = 0;
    }
    // alt: the eye's height above the sea (to the unit of the globe); time: seconds; sun: the way to it
    update(alt, time, sun) {
      const U = this.uniforms, h = SHELL - 1; U.uSunW.value.copy(sun);
      if (SKY.cloudSmall && U.uCloudS.value !== SKY.cloudSmall) U.uCloudS.value = SKY.cloudSmall;
      if (SKY.cloudHalves && !U.uFine.value) { U.uCloud0.value = SKY.cloudHalves[0]; U.uCloud1.value = SKY.cloudHalves[1]; U.uFine.value = 1; }
      if (SKY.grain && !U.uGrainOn.value) { U.uGrain.value = SKY.grain; U.uGrainOn.value = 1; }
      this.shift = (time * SKY.drift) % TAU; U.uShiftCS.value.set(Math.cos(this.shift), Math.sin(this.shift)); U.uTime.value = time % 4096;
      // Under the shell the clouds are the sky's; above it the Earth's. Between - the eye going up through them - there are
      // none: a shell has no inside to be in.
      const below = alt < h, sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const fade = below ? 1 - sm(0.55 * h, 0.85 * h, alt) : sm(1.15 * h, 2.4 * h, alt);
      U.uBelow.value = below ? 1 : 0; U.uOpacity.value = fade; U.uThin.value = below ? 1 : 0.4 + 0.6 * sm(0.08, 0.6, alt); U.uDown.value = below ? 0 : 1;
      this.vis = this.on && SKY.ready.clouds ? 1 : 0; this.mesh.visible = this.vis > 0 && fade > 0.004;
      // (from under them they are behind everything else that is seen through - smoke, flames, the leaves' edges - and are drawn before it; from above, in front of it all and after)
      this.mesh.renderOrder = below ? -3 : 6;
    }
  }
  SKY.Stars = Stars; SKY.Clouds = Clouds;
  window.SKY = SKY;
})();
