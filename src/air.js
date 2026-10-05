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
  const A = { THICK, RG, RT, HR, HM, BR, MS, ME, BO, OC, OW, G, haze: 1, expose: 8.6, exposeHigh: 6.9, down: 0.12, downHigh: 0.3, night: [0.0095, 0.016, 0.042], disc: 1, steps: 1, psi: [], uniforms: null, on: true };

  // ---------- the sums, in JavaScript ----------
  // how much air a ray passes on its way out to space, from radius r, at mu = the cosine of its angle from straight up, for a
  // layer that thins out over H (the Chapman function, by its closed form for a large planet; below the horizon the ray first goes down to
  // its lowest point, where the air is thicker: under the ground that grows without end, which is the planet's shadow)
  const CR = Math.sqrt(1.5707963 / HR), CM = Math.sqrt(1.5707963 / HM);
  // (e: how thin the layer is at the point against sea level, which whoever asks has at hand; cH: the root of the planet's size in
  // the layer's heights. The root of the radius itself is taken as 1 + half of what it is over 1: right to a part in ten thousand.)
  const col = (r, mu, e, H, cH) => {
    const c = cH * (0.5 + 0.5 * r), y = c * 0.5641896 * Math.abs(mu);
    const up = H * e * c * 2.911 / (3.3871094 * y + Math.sqrt(3.1415927 * y * y + 8.473921));      // straight up: H e; level: H e c; between: c erfcx(y), to a part in two hundred
    if (mu >= 0) return up;
    const r0 = r * Math.sqrt(Math.max(1 - mu * mu, 0));
    return H * 2 * cH * (0.5 + 0.5 * r0) * Math.exp(Math.min(-(r0 - RG) / H, 60)) - up;
  };
  A.col = (r, mu, H) => col(r, mu, Math.exp(Math.min(-(r - RG) / H, 60)), H, Math.sqrt(1.5707963 / H));
  const ozUp = (h) => { const x = Math.min(1, Math.max(-1, (h - OC) / OW)); return x < 0 ? 1 - 0.5 * (x + 1) * (x + 1) : 0.5 * (1 - x) * (1 - x); };      // the share of the ozone that lies above h
  // what is left of the sun's light at a point (radius r, the sun at mu from straight up), red green blue
  A.sun = (r, mu, haze, out) => {
    const r0 = r * Math.sqrt(Math.max(1 - mu * mu, 0)), k = r0 / (RG + OC), f = ozUp(r - RG);
    const oz = OW / Math.sqrt(Math.max(1 - k * k, 0.004)) * (mu >= 0 ? f : 2 * ozUp(r0 - RG) - f);
    const cr = col(r, mu, Math.exp(Math.min(-(r - RG) / HR, 60)), HR, CR), cm = col(r, mu, Math.exp(Math.min(-(r - RG) / HM, 60)), HM, CM) * ME * (haze === undefined ? A.haze : haze); out = out || [0, 0, 0];
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
    // Each step takes the air it passes as it really thins along it (two straight pieces of an exponential, from the heights at
    // its ends and its middle), not as it is at one point of it: a few long steps then come out as many short ones would.
    const mean = (e0, e1, d) => Math.abs(d) < 1e-3 ? 0.5 * (e0 + e1) : (e0 - e1) / d;
    const hAt = (t) => Math.sqrt(Math.max(t * t - 2 * q * t + c2, 1e-12)) - RG, eOf = (h, H) => Math.exp(Math.min(-h / H, 60));
    let t0 = tA, h0 = hAt(t0), eR0 = eOf(h0, HR), eM0 = eOf(h0, HM);
    for (let i = 0; i < n; i++) {
      const t1 = warp((i + 1) / n, tA, tq, tB, us), t = warp((i + 0.5) / n, tA, tq, tB, us), dt = t1 - t0;
      const r = Math.sqrt(Math.max(t * t - 2 * q * t + c2, 1e-12)), h = r - RG, mus = (t * rdS - cS) / r, h1 = hAt(t1);
      const eRm = eOf(h, HR), eMm = eOf(h, HM), eR1 = eOf(h1, HR), eM1 = eOf(h1, HM), wa = dt > 0 ? (t - t0) / dt : 0.5;
      const dR = mean(eR0, eRm, (h - h0) / HR) * wa + mean(eRm, eR1, (h1 - h) / HR) * (1 - wa), dM = (mean(eM0, eMm, (h - h0) / HM) * wa + mean(eMm, eM1, (h1 - h) / HM) * (1 - wa)) * haze, dO = Math.max(0, 1 - Math.abs(h - OC) / OW);
      A.sun(r, mus, haze, _ts); if (!o.single) A.psiAt(mus, _ps); else _ps[0] = _ps[1] = _ps[2] = 0;
      const thin = (nk[0] + (1 - nk[0]) * sm(nk[1], nk[1] * 4, t)) * steep;
      for (let k = 0; k < 3; k++) {
        const sR = BR[k] * dR, sM = MS * dM, ext = sR + ME * dM + BO[k] * dO, src = (sR * phR + sM * phM) * _ts[k] + (sR + sM) * _ps[k];
        const tr = Math.exp(-ext * dt * thin), w = ext > 1e-9 ? (1 - tr) / ext : dt * thin;
        L[k] += T[k] * src * w; F[k] += T[k] * (sR + sM) * w; T[k] *= tr;
      }
      t0 = t1; h0 = h1; eR0 = eR1; eM0 = eM1;
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
    vec3 airOver(vec3 c, vec3 T, vec3 L) { return sqrt(max(c * c * T + L, 0.0)); }`;      // (a colour of the screen is taken as the root of the light: near enough to the screen's own curve, and a square and a root cost a fraction of two powers at every pixel)
  // how much of the light the gas, and the haze, turn by an angle (its cosine): the gas evenly fore and aft, the haze mostly onward
  A.PHASE = `
    float airPhR(float c) { return 0.0596831 * (1.0 + c * c); }
    float airPhM(float c) { return 0.1193662 * ${f(1 - G * G)} * (1.0 + c * c) / (${f(2 + G * G)} * pow(${f(1 + G * G)} - ${f(2 * G)} * c, 1.5)); }`;
  A.GLSL = `
    uniform vec3 uAirC, uAirS, uAirN; uniform vec4 uAirE; uniform vec3 uAirK, uAirSunC, uAirPsiC; uniform float uAirQ; uniform vec3 uAirPsi[${PSI_N}];      // the planet's centre and the way to the sun, as the camera sees them; the night's own glow; x: how strongly the sun lights the air (0: no air), y: the haze, z: the sun's disc, w: the share of the steps to take
    const float A_RG = ${f(RG)}, A_RT = ${f(RT)}, A_HR = ${f(HR)}, A_HM = ${f(HM)}, A_MS = ${f(MS)}, A_ME = ${f(ME)}, A_OC = ${f(OC)}, A_OW = ${f(OW)};
    const vec3 A_BR = ${v3(BR)}, A_BO = ${v3(BO)};
    float airCol(float r, float mu, float e, float H, float cH) {      // e: how thin the layer is at the point against sea level; cH: the root of the planet's size in the layer's heights
      float c = cH * (0.5 + 0.5 * r), y = c * 0.5641896 * abs(mu);
      float up = H * e * c * 2.911 / (3.3871094 * y + sqrt(3.1415927 * y * y + 8.473921));
      if (mu >= 0.0) return up;
      float r0 = r * sqrt(max(1.0 - mu * mu, 0.0));
      return H * 2.0 * cH * (0.5 + 0.5 * r0) * exp(min(-(r0 - A_RG) / H, 60.0)) - up;
    }
    float airOzUp(float h) { float x = clamp((h - A_OC) / A_OW, -1.0, 1.0); return x < 0.0 ? 1.0 - 0.5 * (x + 1.0) * (x + 1.0) : 0.5 * (1.0 - x) * (1.0 - x); }
    vec3 airSun(float r, float mu, float eR, float eM) {      // (eR, eM: how thin the gas and the haze are at the point, which the caller has worked out already)
      float r0 = r * sqrt(max(1.0 - mu * mu, 0.0)), k = r0 / (A_RG + A_OC), f = airOzUp(r - A_RG);
      float oz = A_OW / sqrt(max(1.0 - k * k, 0.004)) * (mu >= 0.0 ? f : 2.0 * airOzUp(r0 - A_RG) - f);
      return exp(-(A_BR * airCol(r, mu, eR, A_HR, ${f(CR)}) + A_ME * uAirE.y * airCol(r, mu, eM, A_HM, ${f(CM)}) + A_BO * oz));
    }
    vec3 airPsi(float mu) { float x = clamp((mu / (abs(mu) + 0.25) + 0.55) / 1.35, 0.0, 1.0) * ${f(PSI_N - 1)}; float i = min(floor(x), ${f(PSI_N - 2)}); int k = int(i); return mix(uAirPsi[k], uAirPsi[k + 1], x - i); }
    float airMean(float e0, float e1, float d) { return abs(d) < 1e-3 ? 0.5 * (e0 + e1) : (e0 - e1) / d; }      // the mean of an exponential between two points of it, d scale heights apart
    float airWarp(float u, float tA, float tq, float tB, float us) { float a = (us - u) / us, b = (u - us) / (1.0 - us); return u < us ? tq - (tq - tA) * a * a : tq + (tB - tq) * b * b; }
    ${A.PHASE}
    // The line of sight from the eye along rd (unit, the camera's space) as far as tMax, in so many steps (fewer where the game
    // says so: uAirE.w, and where there is little air on it). T: what the air lets through. What it adds, in three parts, so that
    // whoever works this out at a few points only (the sky does, at the corners of its mesh) can still turn the sun's light by the
    // true angle at every pixel: LR the gas's share and LM the haze's, each still to be multiplied by its phase, LS what needs none.
    void airParts(vec3 rd, float tMax, float steps, out vec3 T, out vec3 LR, out vec3 LM, out vec3 LS) {
      T = vec3(1.0); LR = vec3(0.0); LM = vec3(0.0); LS = vec3(0.0); if (uAirE.x <= 0.0) return;
      float q = dot(rd, uAirC), c2 = dot(uAirC, uAirC);
      // (Most of what is drawn from down in the air stands with next to none of it on the line: the ground under the camera, a town
      // looked down on. The most there could be - the length, thinned as below, in sea-level air - comes with one root; under a
      // five-hundredth of what would show, nothing more is worked out. The ground has millions of corners, and this is nearly all of them.)
      if (uAirQ > 0.5 && tMax < 0.02) {
        float tightest = (A_BR.b + A_ME * uAirE.y) * 1.5 * tMax * mix(1.0, uAirK.z, smoothstep(0.04, 0.5, (q - tMax) / sqrt(max(tMax * tMax - 2.0 * q * tMax + c2, 1e-12)))) * mix(uAirK.x, 1.0, smoothstep(uAirK.y, uAirK.y * 4.0, tMax));
        if (tightest < 0.002) return;
      }
      float dT = A_RT * A_RT - (c2 - q * q); if (dT <= 0.0) return;
      float sT = sqrt(dT), tA = max(q - sT, 0.0), tB = min(q + sT, tMax); if (tB <= tA) return;
      float tq = clamp(q, tA, tB), s1 = sqrt(tq - tA), s2 = sqrt(tB - tq), us = clamp(s1 / max(s1 + s2, 1e-20), 0.0001, 0.9999);      // (never 0 or 1: the steps are laid out by dividing by it and by what is left of it)
      float rdS = dot(rd, uAirS), cS = dot(uAirC, uAirS);
      // (looked down through, the air is shown thinner than it is: uAirK.z. How steeply the line comes down on what it ends at: 1 straight down, 0 along the ground or out to the sky)
      float rB = sqrt(max(tB * tB - 2.0 * q * tB + c2, 1e-12)), steep = mix(1.0, uAirK.z, smoothstep(0.04, 0.5, (q - tB) / rB));
      // (where there is little air on the line - a house across the square, the ground under a low camera - two steps tell as much as six)
      float hA = sqrt(max(tA * tA - 2.0 * q * tA + c2, 1e-12)) - A_RG, hB = rB - A_RG, hLow = min(hA, hB);
      float most = (A_BR.b * exp(min(-hLow / A_HR, 60.0)) + A_ME * uAirE.y * exp(min(-hLow / A_HM, 60.0))) * (tB - tA) * steep * mix(uAirK.x, 1.0, smoothstep(uAirK.y, uAirK.y * 4.0, tB));
      if (most < 0.05 && uAirQ > 0.5 && tB - tA < 0.02) {
        // Little air on a short line, seen from down in it (a house across the square, the ground under a low camera): one piece,
        // the air as it thins between its two ends, lit by the sun as it stands where the camera is (uAirSunC, uAirPsiC: worked out
        // once a frame). A town has a million corners, and this is a fifth of the work of two steps.
        float d = (hB - hA), eRA = exp(min(-hA / A_HR, 60.0)), eRB = exp(min(-hB / A_HR, 60.0)), eMA = exp(min(-hA / A_HM, 60.0)), eMB = exp(min(-hB / A_HM, 60.0));
        vec3 sR = A_BR * airMean(eRA, eRB, d / A_HR); float dM = airMean(eMA, eMB, d / A_HM) * uAirE.y, sM = A_MS * dM; vec3 ext = sR + A_ME * dM;
        float tm = 0.5 * (tA + tB), thin = (mix(uAirK.x, 1.0, smoothstep(uAirK.y, uAirK.y * 4.0, tA)) + 4.0 * mix(uAirK.x, 1.0, smoothstep(uAirK.y, uAirK.y * 4.0, tm)) + mix(uAirK.x, 1.0, smoothstep(uAirK.y, uAirK.y * 4.0, tB))) / 6.0;
        T = exp(-ext * (tB - tA) * steep * thin); vec3 w = (1.0 - T) / max(ext, vec3(1e-9)) * uAirE.x;
        LR = w * sR * uAirSunC; LM = w * sM * uAirSunC; LS = w * (sR + sM) * uAirPsiC + uAirN * (1.0 - T);
        return;
      }
      float fn = max(2.0, floor(steps * uAirE.w * (most < 0.05 ? 0.34 : most < 0.25 ? 0.67 : 1.0) + 0.5)); int n = int(fn);
      // (each step takes the air it passes as it really thins along it - two straight pieces of an exponential, from the heights at
      // its ends and its middle - so a few long steps come out as many short ones would, and a house stands in the same air as its street)
      float t0 = tA, h0 = hA, eR0 = exp(min(-h0 / A_HR, 60.0)), eM0 = exp(min(-h0 / A_HM, 60.0));
      for (int i = 0; i < n; i++) {
        float fi = float(i), t1 = airWarp((fi + 1.0) / fn, tA, tq, tB, us), t = airWarp((fi + 0.5) / fn, tA, tq, tB, us), dt = t1 - t0;
        float r = sqrt(max(t * t - 2.0 * q * t + c2, 1e-12)), h = r - A_RG, mus = (t * rdS - cS) / r, h1 = sqrt(max(t1 * t1 - 2.0 * q * t1 + c2, 1e-12)) - A_RG;
        float eRm = exp(min(-h / A_HR, 60.0)), eMm = exp(min(-h / A_HM, 60.0)), eR1 = exp(min(-h1 / A_HR, 60.0)), eM1 = exp(min(-h1 / A_HM, 60.0)), wa = dt > 0.0 ? (t - t0) / dt : 0.5;
        float dM = (airMean(eM0, eMm, (h - h0) / A_HM) * wa + airMean(eMm, eM1, (h1 - h) / A_HM) * (1.0 - wa)) * uAirE.y;
        vec3 sR = A_BR * (airMean(eR0, eRm, (h - h0) / A_HR) * wa + airMean(eRm, eR1, (h1 - h) / A_HR) * (1.0 - wa)); float sM = A_MS * dM;
        vec3 ext = sR + A_ME * dM + A_BO * max(0.0, 1.0 - abs(h - A_OC) / A_OW);
        vec3 sun = airSun(r, mus, eRm, eMm);
        vec3 tr = exp(-ext * dt * steep * mix(uAirK.x, 1.0, smoothstep(uAirK.y, uAirK.y * 4.0, t)));      // (thinner about the eye, too, when it is down among things drawn larger than life: uAirK.x as far as uAirK.y)
        vec3 w = T * (1.0 - tr) / max(ext, vec3(1e-9));
        LR += w * sR * sun; LM += w * sM * sun; LS += w * (sR + sM) * airPsi(mus); T *= tr;
        t0 = t1; h0 = h1; eR0 = eR1; eM0 = eM1;
      }
      LR *= uAirE.x; LM *= uAirE.x; LS = LS * uAirE.x + uAirN * (1.0 - T);
    }
    void airMarch(vec3 rd, float tMax, float steps, out vec3 T, out vec3 L) { vec3 LR, LM, LS; airParts(rd, tMax, steps, T, LR, LM, LS); float c = dot(rd, uAirS); L = LR * airPhR(c) + LM * airPhM(c) + LS; }
    // what lies between the eye and a point (the camera's space)
    void air(vec3 pv, float steps, out vec3 T, out vec3 L) { float d = length(pv); airMarch(pv / max(d, 1e-12), d, steps, T, L); }
    ${A.MIX}`;

  // how many steps a line of sight is given: the sky (it is all air), the ground, a thing standing on it. All of them work the air
  // out at the corners of their meshes, not at every pixel: it changes slowly, and a march at every pixel of a large screen is dear.
  A.SKY = '16.0'; A.LAND = '4.0'; A.THING = '3.0';
  // A thing that stands on the ground is small against the air: it works the air out at its corners (vertex shader: A.VERT, then
  // air(viewPos, steps, vAirT, vAirL)) and lays it over its colour (fragment shader: A.FRAG, then airOver(colour, vAirT, vAirL)).
  // (Both are taken where the pixel is really covered ("centroid"), not at its middle: with four samples a pixel, the middle of a pixel on
  // the edge of a triangle can lie outside it, and along the planet's rim, where a triangle is seen edge-on and holds a hundred
  // kilometres of air in a pixel's width, what was reckoned on from there came out as single pixels of pure blue.)
  A.VERT = A.GLSL + '\n    centroid varying vec3 vAirT, vAirL;';
  A.FRAG = '\n    centroid varying vec3 vAirT, vAirL;' + A.MIX;

  // ---------- what the game sets each frame ----------
  if (typeof THREE !== 'undefined') {
    A.uniforms = { uAirC: { value: new THREE.Vector3(0, 0, -3) }, uAirS: { value: new THREE.Vector3(0, 1, 0) }, uAirN: { value: new THREE.Vector3(0, 0, 0) }, uAirE: { value: new THREE.Vector4(A.expose, 1, 0, 0) }, uAirK: { value: new THREE.Vector3(1, 1, 1) }, uAirSunC: { value: new THREE.Vector3(1, 1, 1) }, uAirPsiC: { value: new THREE.Vector3(0, 0, 0) }, uAirQ: { value: 0 },
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
  // wherever it is looked down through (A.down: straight down an eighth of it, along the ground all of it, so the horizon and
  // the planet's rim keep their haze; from far out, where it is the whole planet that is looked at, a third: A.downHigh),
  // and a little fainter from far out (A.exposeHigh, from 1,000 km).
  A.exposure = (alt) => A.expose + (A.exposeHigh - A.expose) * sm(0.01, 0.16, alt);
  // Down among the houses the game shows things many times larger than life (town.js: a village nineteen times, a great city
  // three), and the air between the eye and the far side of a town would be the air of a day's march. So the air about the eye
  // is thinned by that much, as far out as the things the camera is looking at (half as far again as what it looks at), and
  // comes to its true thickness by four times that: a town stands clear, the country behind it goes into haze.
  A.near = (dist) => [1 / (1 + 11 * (1 - sm(0.0005, 0.006, dist))), Math.min(0.02, Math.max(0.0003, 1.5 * dist))];
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
    // (for short lines of sight from down in the air: the sun's light where the camera is, worked out here once instead of at every corner of every house)
    { const hC = Math.min(Math.max(a, 0), 0.004) * 0.5, sc = A.sun(RG + hC, sunUp), pc = A.psiAt(sunUp); U.uAirSunC.value.set(sc[0], sc[1], sc[2]); U.uAirPsiC.value.set(pc[0], pc[1], pc[2]); U.uAirQ.value = A.quick !== false && a < 0.004 ? 1 : 0; }
    const nk = A.near(dist === undefined ? 1 : dist); U.uAirK.value.set(A.clear === false ? 1 : nk[0], nk[1], A.clear === false ? 1 : A.down + (A.downHigh - A.down) * sm(0.05, 0.5, a));
  };
  // set the haze (1: a clear day) and work the table out again for it
  A.setHaze = (h) => { A.haze = h; A.psi = A.table(h); if (A.uniforms) A.psi.forEach((p, i) => A.uniforms.uAirPsi.value[i].set(p[0], p[1], p[2])); };
  // the colour of sunlight on the ground where the sun stands this high (its sine), and of the light of the sky there (both for a sun of strength one)
  A.light = (sunUp, height) => ({ sun: A.sun(RG + (height || 0), sunUp), sky: A.psiAt(sunUp) });
  window.AIR = A;
})();
