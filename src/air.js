// Holocene: the air (classic script; exposes window.AIR).
//
// One atmosphere for everything that is drawn. The sky seen from the ground, the haze between the eye and a far hill, the blue rim
// of the planet from orbit and the red edge of night are one sum, taken along the line of sight:
//   the sunlight that reaches each stretch of that line (dimmed on its way down through the air: that is what reddens a low sun),
//   the share of it the air turns toward the eye (the gas scatters blue every way; dust and water scatter pale and mostly forward),
//   the light that has been scattered before and comes from all round (a small table by the sun's height: AIR.psi),
//   and what the air between takes away again on the way to the eye.
// Shaders take it as a piece of GLSL (AIR.GLSL) with its uniforms (AIR.uniforms): there are no textures in it, so it costs no
// sampler (the ground's shader has none to spare). The same sums are here in JavaScript: tools/air/sky.js draws with them, and the
// game asks them what colour the sun's light has when it reaches the ground.
//
// Lengths are in Earth radii, like the scene. The ground is drawn twice as tall as it is (terrain.js: exag), so the air is given
// twice its height and half its density: a mountain stands in the air it really stands in, and what a column of air does is unchanged.
(function () {
  'use strict';
  const R_M = 6371000, THICK = 2;
  const RG = 1, RT = 1 + 100000 * THICK / R_M;                 // sea level; where the air is taken to end
  const HR = 8000 * THICK / R_M, HM = 1200 * THICK / R_M;      // the heights over which the gas and the haze thin out e times
  const BR = [5.802e-6, 13.558e-6, 33.1e-6].map((v) => v * R_M / THICK);      // what the gas scatters at sea level, red green blue
  const MS = 3.996e-6 * R_M / THICK, ME = (3.996e-6 + 4.40e-6) * R_M / THICK;    // what the haze scatters, and what it takes away in all, on a clear day
  const BO = [0.650e-6, 1.881e-6, 0.085e-6].map((v) => v * R_M / THICK);      // ozone only absorbs (orange most): it keeps the sky overhead blue at dusk
  const OC = 25000 * THICK / R_M, OW = 15000 * THICK / R_M;   // its layer: the middle, and half its depth
  const G = 0.8;                                               // how forward the haze scatters
  const PSI_N = 16, GROUND = 0.3;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const A = { THICK, RG, RT, HR, HM, BR, MS, ME, BO, OC, OW, G, haze: 1, expose: 7.5, exposeHigh: 6, down: 0.35, night: [0.007, 0.012, 0.032], disc: 1, steps: 1, psi: [], uniforms: null, on: true };

  // ---------- the sums, in JavaScript ----------
  // how much air a ray passes on its way out to space, from radius r, at mu = the cosine of its angle from straight up, for a
  // layer that thins out over H (the Chapman function, by its closed form for a large planet; below the horizon the ray first goes down to
  // its lowest point, where the air is thicker: under the ground that grows without end, which is the planet's shadow)
  const col = (r, mu, H) => {
    const x = r / H, c = Math.sqrt(1.5707963 * x), e = Math.exp(Math.min(-(r - RG) / H, 60)), y = Math.sqrt(0.5 * x) * Math.abs(mu);
    const up = H * e * c * 2.911 / (3.3871094 * y + Math.sqrt(3.1415927 * y * y + 8.473921));      // straight up: H e; level: H e c; between: c erfcx(y), to a part in two hundred
    if (mu >= 0) return up;
    const r0 = r * Math.sqrt(Math.max(1 - mu * mu, 0)), c0 = Math.sqrt(1.5707963 * r0 / H);
    return H * 2 * c0 * Math.exp(Math.min(-(r0 - RG) / H, 60)) - up;
  };
  A.col = col;
  const ozUp = (h) => { const x = Math.min(1, Math.max(-1, (h - OC) / OW)); return x < 0 ? 1 - 0.5 * (x + 1) * (x + 1) : 0.5 * (1 - x) * (1 - x); };      // the share of the ozone that lies above h
  // what is left of the sun's light at a point (radius r, the sun at mu from straight up), red green blue
  A.sun = (r, mu, haze, out) => {
    const r0 = r * Math.sqrt(Math.max(1 - mu * mu, 0)), k = r0 / (RG + OC), f = ozUp(r - RG);
    const oz = OW / Math.sqrt(Math.max(1 - k * k, 0.004)) * (mu >= 0 ? f : 2 * ozUp(r0 - RG) - f);
    const cr = col(r, mu, HR), cm = col(r, mu, HM) * ME * (haze === undefined ? A.haze : haze); out = out || [0, 0, 0];
    for (let i = 0; i < 3; i++) out[i] = Math.exp(-(BR[i] * cr + cm + BO[i] * oz));
    return out;
  };
  const psiX = (mu) => Math.min(1, Math.max(0, (mu / (Math.abs(mu) + 0.25) + 0.55) / 1.35)) * (PSI_N - 1);      // where the table keeps a height of the sun: finest about the horizon
  const psiMu = (i) => { const w = -0.55 + 1.35 * i / (PSI_N - 1); return w >= 0 ? 0.25 * w / (1 - w) : 0.25 * w / (1 + w); };
  A.psiAt = (mu, out) => { const x = psiX(mu), i = Math.min(Math.floor(x), PSI_N - 2), f = x - i, a = A.psi[i], b = A.psi[i + 1]; out = out || [0, 0, 0]; for (let k = 0; k < 3; k++) out[k] = a[k] + (b[k] - a[k]) * f; return out; };
  // where the steps of a line of sight fall: u from 0 to 1 along a stretch from tA to tB, set closest together about tq, its lowest point
  const warp = (u, tA, tq, tB, us) => u < us ? tq - (tq - tA) * ((us - u) / us) * ((us - u) / us) : tq + (tB - tq) * ((u - us) / (1 - us)) * ((u - us) / (1 - us));
  const _ts = [0, 0, 0], _ps = [0, 0, 0];
  // The line of sight. C: the planet's centre seen from the eye; rd: the way the eye looks (unit); tMax: how far (Infinity: out to
  // space); n: steps; S: the way to the sun (unit); flat: the haze scatters evenly (for the table). Returns what the air lets
  // through (T) and what it adds (L, for a sun of strength one), and F: the share of light sent along the line that is scattered on it.
  A.march = (C, rd, tMax, n, S, opt) => {
    const o = opt || {}, haze = o.haze === undefined ? A.haze : o.haze, nk = o.near || [1, 1, 1]; const T = [1, 1, 1], L = [0, 0, 0], F = [0, 0, 0], res = { T, L, F, hit: false };
    const q = rd[0] * C[0] + rd[1] * C[1] + rd[2] * C[2], c2 = C[0] * C[0] + C[1] * C[1] + C[2] * C[2], rp2 = c2 - q * q;
    const dT = RT * RT - rp2; if (dT <= 0) return res;
    const sT = Math.sqrt(dT); let tA = Math.max(q - sT, 0), tB = Math.min(q + sT, tMax);
    if (o.ground && rp2 < RG * RG && q > 0) { const tg = q - Math.sqrt(RG * RG - rp2); if (tg > 0 && tg < tB) { tB = tg; res.hit = true; } }
    if (tB <= tA) return res;
    const tq = Math.min(tB, Math.max(tA, q)), s1 = Math.sqrt(tq - tA), s2 = Math.sqrt(tB - tq), us = Math.min(0.9999, Math.max(0.0001, s1 / Math.max(s1 + s2, 1e-20)));
    const rdS = rd[0] * S[0] + rd[1] * S[1] + rd[2] * S[2], cS = C[0] * S[0] + C[1] * S[1] + C[2] * S[2];
    const steep = 1 + (nk[2] - 1) * sm(0.04, 0.5, (q - tB) / Math.sqrt(Math.max(tB * tB - 2 * q * tB + c2, 1e-12)));
    const phR = o.flat ? 1 / (4 * Math.PI) : 3 / (16 * Math.PI) * (1 + rdS * rdS), phM = o.flat ? 1 / (4 * Math.PI) : 3 / (8 * Math.PI) * (1 - G * G) * (1 + rdS * rdS) / ((2 + G * G) * Math.pow(1 + G * G - 2 * G * rdS, 1.5));
    for (let i = 0; i < n; i++) {
      const t0 = warp(i / n, tA, tq, tB, us), t1 = warp((i + 1) / n, tA, tq, tB, us), t = warp((i + 0.5) / n, tA, tq, tB, us), dt = t1 - t0;
      const r = Math.sqrt(Math.max(t * t - 2 * q * t + c2, 1e-12)), h = r - RG, mus = (t * rdS - cS) / r;
      const dR = Math.exp(Math.min(-h / HR, 60)), dM = Math.exp(Math.min(-h / HM, 60)) * haze, dO = Math.max(0, 1 - Math.abs(h - OC) / OW);
      A.sun(r, mus, haze, _ts); if (!o.single) A.psiAt(mus, _ps); else _ps[0] = _ps[1] = _ps[2] = 0;
      const thin = (nk[0] + (1 - nk[0]) * sm(nk[1], nk[1] * 4, t)) * steep;
      for (let k = 0; k < 3; k++) {
        const sR = BR[k] * dR, sM = MS * dM, ext = sR + ME * dM + BO[k] * dO, src = (sR * phR + sM * phM) * _ts[k] + (sR + sM) * _ps[k];
        const tr = Math.exp(-ext * dt * thin), w = ext > 1e-9 ? (1 - tr) / ext : dt * thin;
        L[k] += T[k] * src * w; F[k] += T[k] * (sR + sM) * w; T[k] *= tr;
      }
    }
    res.tB = tB; return res;
  };
  // the light that has been scattered more than once, as the air about (this high) holds it, for sixteen heights of the sun: what
  // every direction would send in from one scattering if the air scattered evenly, and what the ground throws back, summed over all
  // the scatterings after (Hillaire 2020). It is why shade is not black, dusk is not sudden and the horizon is pale.
  A.table = (haze, height) => {
    const hz = haze === undefined ? A.haze : haze, r = RG + (height === undefined ? 1500 * THICK / R_M : height), out = [];
    for (let i = 0; i < PSI_N; i++) {
      const mu = psiMu(i), S = [Math.sqrt(Math.max(1 - mu * mu, 0)), 0, mu], C = [0, 0, -r]; const L2 = [0, 0, 0], F = [0, 0, 0];
      for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
        const th = 2 * Math.PI * (a + 0.5) / 8, cz = 1 - 2 * (b + 0.5) / 8, sz = Math.sqrt(1 - cz * cz), rd = [sz * Math.cos(th), sz * Math.sin(th), cz];
        const m = A.march(C, rd, Infinity, 24, S, { haze: hz, flat: true, single: true, ground: true });
        if (m.hit) { const p = [rd[0] * m.tB, rd[1] * m.tB, rd[2] * m.tB + r], pr = Math.hypot(p[0], p[1], p[2]), mug = (p[0] * S[0] + p[1] * S[1] + p[2] * S[2]) / pr; if (mug > 0) { const ts = A.sun(RG, mug, hz); for (let k = 0; k < 3; k++) m.L[k] += m.T[k] * ts[k] * mug * GROUND / Math.PI; } }
        for (let k = 0; k < 3; k++) { L2[k] += m.L[k] / 64; F[k] += m.F[k] / 64; }
      }
      out.push([0, 1, 2].map((k) => L2[k] / (1 - Math.min(F[k], 0.95))));
    }
    return out;
  };
  A.psi = A.table();

  // ---------- the same, for shaders ----------
  const f = (v) => { const s = (+v).toPrecision(9); return /[.e]/.test(s) ? s : s + '.0'; }, v3 = (a) => `vec3(${a.map(f).join(', ')})`;
  // the uniforms and what is done with what the air leaves and adds (a colour as the screen shows it, in and out): for every shader that draws something in the air
  A.MIX = `
    vec3 airOver(vec3 c, vec3 T, vec3 L) { return pow(pow(max(c, 0.0), vec3(2.2)) * T + L, vec3(0.4545)); }`;
  A.GLSL = `
    uniform vec3 uAirC, uAirS, uAirN; uniform vec4 uAirE; uniform vec3 uAirK; uniform vec3 uAirPsi[${PSI_N}];      // the planet's centre and the way to the sun, as the camera sees them; the night's own glow; x: how strongly the sun lights the air (0: no air), y: the haze, z: the sun's disc, w: the share of the steps to take
    const float A_RG = ${f(RG)}, A_RT = ${f(RT)}, A_HR = ${f(HR)}, A_HM = ${f(HM)}, A_MS = ${f(MS)}, A_ME = ${f(ME)}, A_OC = ${f(OC)}, A_OW = ${f(OW)};
    const vec3 A_BR = ${v3(BR)}, A_BO = ${v3(BO)};
    float airCol(float r, float mu, float H) {
      float x = r / H, c = sqrt(1.5707963 * x), e = exp(min(-(r - A_RG) / H, 60.0)), y = sqrt(0.5 * x) * abs(mu);
      float up = H * e * c * 2.911 / (3.3871094 * y + sqrt(3.1415927 * y * y + 8.473921));
      if (mu >= 0.0) return up;
      float r0 = r * sqrt(max(1.0 - mu * mu, 0.0)), c0 = sqrt(1.5707963 * r0 / H);
      return H * 2.0 * c0 * exp(min(-(r0 - A_RG) / H, 60.0)) - up;
    }
    float airOzUp(float h) { float x = clamp((h - A_OC) / A_OW, -1.0, 1.0); return x < 0.0 ? 1.0 - 0.5 * (x + 1.0) * (x + 1.0) : 0.5 * (1.0 - x) * (1.0 - x); }
    vec3 airSun(float r, float mu) {
      float r0 = r * sqrt(max(1.0 - mu * mu, 0.0)), k = r0 / (A_RG + A_OC), f = airOzUp(r - A_RG);
      float oz = A_OW / sqrt(max(1.0 - k * k, 0.004)) * (mu >= 0.0 ? f : 2.0 * airOzUp(r0 - A_RG) - f);
      return exp(-(A_BR * airCol(r, mu, A_HR) + A_ME * uAirE.y * airCol(r, mu, A_HM) + A_BO * oz));
    }
    vec3 airPsi(float mu) { float x = clamp((mu / (abs(mu) + 0.25) + 0.55) / 1.35, 0.0, 1.0) * ${f(PSI_N - 1)}; float i = min(floor(x), ${f(PSI_N - 2)}); int k = int(i); return mix(uAirPsi[k], uAirPsi[k + 1], x - i); }
    float airWarp(float u, float tA, float tq, float tB, float us) { float a = (us - u) / us, b = (u - us) / (1.0 - us); return u < us ? tq - (tq - tA) * a * a : tq + (tB - tq) * b * b; }
    // the line of sight from the eye along rd (unit, the camera's space) as far as tMax, in so many steps (fewer where the game
    // says so: uAirE.w): T what the air lets through, L what it adds
    void airMarch(vec3 rd, float tMax, float steps, out vec3 T, out vec3 L) {
      T = vec3(1.0); L = vec3(0.0); if (uAirE.x <= 0.0) return;
      float q = dot(rd, uAirC), c2 = dot(uAirC, uAirC), dT = A_RT * A_RT - (c2 - q * q); if (dT <= 0.0) return;
      float sT = sqrt(dT), tA = max(q - sT, 0.0), tB = min(q + sT, tMax); if (tB <= tA) return;
      float tq = clamp(q, tA, tB), s1 = sqrt(tq - tA), s2 = sqrt(tB - tq), us = clamp(s1 / max(s1 + s2, 1e-20), 0.0001, 0.9999);      // (never 0 or 1: the steps are laid out by dividing by it and by what is left of it)
      float rdS = dot(rd, uAirS), cS = dot(uAirC, uAirS), fn = max(2.0, floor(steps * uAirE.w + 0.5)); int n = int(fn);
      // (looked down through, the air is shown thinner than it is: uAirK.z. How steeply the line comes down on what it ends at: 1 straight down, 0 along the ground or out to the sky)
      float steep = mix(1.0, uAirK.z, smoothstep(0.04, 0.5, (q - tB) / sqrt(max(tB * tB - 2.0 * q * tB + c2, 1e-12))));
      float phR = 0.0596831 * (1.0 + rdS * rdS), phM = 0.1193662 * ${f(1 - G * G)} * (1.0 + rdS * rdS) / (${f(2 + G * G)} * pow(${f(1 + G * G)} - ${f(2 * G)} * rdS, 1.5));
      for (int i = 0; i < n; i++) {
        float fi = float(i), t0 = airWarp(fi / fn, tA, tq, tB, us), t1 = airWarp((fi + 1.0) / fn, tA, tq, tB, us), t = airWarp((fi + 0.5) / fn, tA, tq, tB, us), dt = t1 - t0;
        float r = sqrt(max(t * t - 2.0 * q * t + c2, 1e-12)), h = r - A_RG, mus = (t * rdS - cS) / r;
        float dM = exp(min(-h / A_HM, 60.0)) * uAirE.y; vec3 sR = A_BR * exp(min(-h / A_HR, 60.0)); float sM = A_MS * dM;
        vec3 ext = sR + A_ME * dM + A_BO * max(0.0, 1.0 - abs(h - A_OC) / A_OW);
        vec3 src = (sR * phR + sM * phM) * airSun(r, mus) + (sR + sM) * airPsi(mus);
        vec3 tr = exp(-ext * dt * steep * mix(uAirK.x, 1.0, smoothstep(uAirK.y, uAirK.y * 4.0, t)));      // (thinner about the eye, too, when it is down among things drawn larger than life: uAirK.x as far as uAirK.y)
        L += T * src * (1.0 - tr) / max(ext, vec3(1e-9)); T *= tr;
      }
      L = L * uAirE.x + uAirN * (1.0 - T);
    }
    // what lies between the eye and a point (the camera's space)
    void air(vec3 pv, float steps, out vec3 T, out vec3 L) { float d = length(pv); airMarch(pv / max(d, 1e-12), d, steps, T, L); }
    ${A.MIX}`;

  // how many steps a line of sight is given: the sky (it is all air), the ground (per pixel), a thing standing on it (per corner)
  A.SKY = '16.0'; A.LAND = '8.0'; A.THING = '3.0';
  // A thing that stands on the ground is small against the air: it works the air out at its corners (vertex shader: A.VERT, then
  // air(viewPos, steps, vAirT, vAirL)) and lays it over its colour (fragment shader: A.FRAG, then airOver(colour, vAirT, vAirL)).
  A.VERT = A.GLSL + '\n    varying vec3 vAirT, vAirL;';
  A.FRAG = '\n    varying vec3 vAirT, vAirL;' + A.MIX;

  // ---------- what the game sets each frame ----------
  if (typeof THREE !== 'undefined') {
    A.uniforms = { uAirC: { value: new THREE.Vector3(0, 0, -3) }, uAirS: { value: new THREE.Vector3(0, 1, 0) }, uAirN: { value: new THREE.Vector3(0, 0, 0) }, uAirE: { value: new THREE.Vector4(A.expose, 1, 0, 0) }, uAirK: { value: new THREE.Vector3(1, 1, 1) },
      uAirPsi: { value: A.psi.map((p) => new THREE.Vector3(p[0], p[1], p[2])) } };
  }
  // The eye opens as the light goes: how much brighter the air is shown than it is, by the sun's height where the camera stands
  // (its sine) and by how high the camera is (from orbit day and night are seen together, and nothing is opened up).
  // [degrees of the sun above the horizon, stops]
  A.OPEN = [[-18, 8.5], [-12, 8.5], [-9, 6.8], [-6, 4.6], [-3, 2.6], [0, 1.4], [3, 0.8], [8, 0.35], [16, 0.1], [30, 0]];
  A.open = (sunUp, alt) => {
    const deg = Math.asin(Math.min(1, Math.max(-1, sunUp))) * 180 / Math.PI, O = A.OPEN; let s = O[0][1];
    if (deg >= O[O.length - 1][0]) s = O[O.length - 1][1]; else for (let i = 1; i < O.length; i++) if (deg < O[i][0]) { if (deg > O[i - 1][0]) s = O[i - 1][1] + (O[i][1] - O[i - 1][1]) * (deg - O[i - 1][0]) / (O[i][0] - O[i - 1][0]); else s = O[i - 1][1]; break; }
    return Math.pow(2, s * (1 - sm(0.004, 0.03, alt)));
  };
  // A planet under its true veil is a pale blue ball, and the game is played on its face. So the air is shown thinner than it is
  // wherever it is looked down through (A.down: straight down a third of it, along the ground all of it: the horizon and the
  // planet's rim keep their haze), and a little fainter from far out (A.exposeHigh, from 1,000 km).
  A.exposure = (alt) => A.expose + (A.exposeHigh - A.expose) * sm(0.01, 0.16, alt);
  // Down among the houses the game shows things many times larger than life (town.js: a village nineteen times, a great city
  // three), and the air between the eye and the far side of a town would be the air of a day's march. So the air about the eye
  // is thinned by that much, as far out as the things the camera is looking at (three times its distance to what it looks at),
  // and comes to its true thickness beyond: a town stands clear, the hills behind it stand in haze.
  A.near = (dist) => [1 / (1 + 11 * (1 - sm(0.0005, 0.006, dist))), Math.min(0.02, Math.max(0.0004, 3 * dist))];
  // camera: its matrixWorld must be this frame's; sun: the way to the sun in the world (unit); dist: how far the camera is from what it looks at
  A.update = (camera, sun, alt, dist) => {
    const U = A.uniforms, e = camera.matrixWorld.elements, px = e[12], py = e[13], pz = e[14];
    U.uAirC.value.set(-(e[0] * px + e[1] * py + e[2] * pz), -(e[4] * px + e[5] * py + e[6] * pz), -(e[8] * px + e[9] * py + e[10] * pz));
    U.uAirS.value.set(e[0] * sun.x + e[1] * sun.y + e[2] * sun.z, e[4] * sun.x + e[5] * sun.y + e[6] * sun.z, e[8] * sun.x + e[9] * sun.y + e[10] * sun.z);
    const r = Math.hypot(px, py, pz), sunUp = (px * sun.x + py * sun.y + pz * sun.z) / r, a = alt === undefined ? r - 1 : alt;
    A.opened = A.open(sunUp, a); A.sunUp = sunUp;
    const night = (1 - sm(-0.3, -0.08, sunUp)) * (1 - sm(0.004, 0.03, a));      // (below, and only there: the night's own faint light, enough to tell the sky from the hills)
    U.uAirE.value.set(A.on ? A.exposure(a) * A.opened : 0, A.haze, A.disc, A.steps);
    U.uAirN.value.set(A.night[0] * night, A.night[1] * night, A.night[2] * night);
    const nk = A.near(dist === undefined ? 1 : dist); U.uAirK.value.set(A.clear === false ? 1 : nk[0], nk[1], A.clear === false ? 1 : A.down);
  };
  // set the haze (1: a clear day) and work the table out again for it
  A.setHaze = (h) => { A.haze = h; A.psi = A.table(h); if (A.uniforms) A.psi.forEach((p, i) => A.uniforms.uAirPsi.value[i].set(p[0], p[1], p[2])); };
  // the colour of sunlight on the ground where the sun stands this high (its sine), and of the light of the sky there (both for a sun of strength one)
  A.light = (sunUp, height) => ({ sun: A.sun(RG + (height || 0), sunUp), sky: A.psiAt(sunUp) });
  window.AIR = A;
})();
