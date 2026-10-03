// GENESIS streamed terrain: quadtree of equirectangular tiles, imagery + elevation packs loaded on demand.
// Classic script; exposes window.TERRAIN.
(function () {
  const TILE = 512, GRID = 32;
  const R_M = 6371000;

  // ---------- shared tile geometry (u, v, skirt) ----------
  function buildTileGeometry(GRID) {
    const n = GRID + 1; const pos = []; const idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pos.push(i / GRID, j / GRID, 0);
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
    // skirts: ring of duplicated edge vertices with flag 1
    const edge = [];
    for (let i = 0; i < n; i++) edge.push(i);                    // top row (v=0), left->right
    for (let j = 1; j < n; j++) edge.push(j * n + (n - 1));        // right col downward
    for (let i = n - 2; i >= 0; i--) edge.push((n - 1) * n + i);   // bottom row right->left
    for (let j = n - 2; j >= 1; j--) edge.push(j * n);             // left col upward
    const base = pos.length / 3;
    for (let k = 0; k < edge.length; k++) { const e = edge[k]; pos.push(pos[e * 3], pos[e * 3 + 1], 1); }
    for (let k = 0; k < edge.length; k++) {
      const e0 = edge[k], e1 = edge[(k + 1) % edge.length]; const s0 = base + k, s1 = base + (k + 1) % edge.length;
      idx.push(e0, e1, s0, e1, s1, s0);                             // wound to face outward: a skirt is seen from outside its own tile, through the gap it closes
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  const VERT = `
    uniform float uLon0, uDLon, uLat0, uDLat, uLatC, uLonC; uniform vec2 uGeoC, uPhaseB;
    uniform float uDLon0, uDLat0, uMercA, uTanA, uCosA;   // tile-centre-relative offsets and the Mercator terms for the fine (metre-scale) texture frame
    uniform sampler2D uElev, uNoise; uniform vec4 uElevRect; uniform vec2 uElevTexel; uniform float uElevMin, uElevScale, uExag, uSkirt, uCamAlt, uQuality;
    varying vec2 vUV, vGL, vGLf; varying float vLon, vLat, vH; varying vec3 vUnit; varying vec3 vViewPos; varying mat3 vNM;
    const float R_MV = ${R_M.toFixed(1)};
    float hAtV(vec2 uv) { return max(uElevMin + texture2D(uElev, uElevRect.xy + uv * uElevRect.zw).r * 255.0 * uElevScale, 0.0); }
    void main() {
      vNM = normalMatrix;
      float u = position.x, v = position.y;
      float lon = uLon0 + u * uDLon; float lat = uLat0 + v * uDLat;
      float ev = texture2D(uElev, uElevRect.xy + vec2(u, v) * uElevRect.zw).r;
      float h = max(uElevMin + ev * 255.0 * uElevScale, 0.0);
      float cl0 = cos(lat);
      vec2 gl0 = vec2(lon * cl0 - uGeoC.x, lat - uGeoC.y);
      // micro-relief displacement: the same two noise octaves the fragment shader shades with, so silhouettes match
      float dispOn = smoothstep(0.06, 0.004, uCamAlt) * step(0.5, uQuality);
      if (h > 1.0 && dispOn > 0.001) {
        vec2 tuv = uElevTexel * 1.6 / uElevRect.zw;
        float dhx = (hAtV(vec2(u + tuv.x, v)) - hAtV(vec2(u - tuv.x, v))) / (2.0 * tuv.x * abs(uDLon) * R_MV * max(cl0, 0.02));
        float dhy = (hAtV(vec2(u, v - tuv.y)) - hAtV(vec2(u, v + tuv.y))) / (2.0 * tuv.y * abs(uDLat) * R_MV);
        float sl = 1.0 - 1.0 / sqrt(1.0 + (dhx * dhx + dhy * dhy) * uExag * uExag);
        float st = smoothstep(0.05, 0.35, sl);
        vec2 c1 = fract(uPhaseB * 30.0) + gl0 * 1500.0, c2 = fract(uPhaseB * 180.0) + gl0 * 9000.0;
        float n1 = texture2D(uNoise, c1).r - 0.5, n2 = texture2D(uNoise, c2).g - 0.5;
        float amp = 0.55 + 0.9 * (texture2D(uNoise, fract(uPhaseB * 3.0) + gl0 * 150.0).r);
        h += (n1 * 90.0 * (0.08 + st) + n2 * 9.0 * (0.08 + 1.2 * st)) * amp * dispOn;
        h = max(h, 0.5);
      }
      vH = h;
      float hh = h * uExag / ${R_M.toFixed(1)};
      float dlon = lon - uLonC, dlat = lat - uLatC;
      float cl = cos(lat), slc = sin(uLatC), clc = cos(uLatC);
      float sh = sin(dlon * 0.5); float s2 = 2.0 * sh * sh;
      float sdl = sin(dlat * 0.5);
      float east = cl * sin(dlon);
      float north = sin(dlat) + cl * slc * s2;
      float up = -2.0 * sdl * sdl - cl * clc * s2;
      vec3 unitv = vec3(east, north, up + 1.0);
      vec3 local = vec3(east, north, up) + unitv * hh;
      if (position.z > 0.5) local -= unitv * uSkirt;
      vUV = vec2(u, v); vLon = lon; vLat = lat; vUnit = unitv; vGL = vec2(lon * cl - uGeoC.x, lat - uGeoC.y);
      // precise Mercator offset from the tile centre (everything here is small, so float32 keeps centimetres): x = dlon, y = ln(tan(a+d)/tan(a))
      { float dl = uDLon0 + u * uDLon, dla = uDLat0 + v * uDLat; float dd = dla * 0.5; float td = sin(dd) / max(cos(uMercA + dd) * uCosA, 1e-4); vGLf = vec2(dl, log(max(1.0 + td / uTanA, 1e-4))); }
      vec4 mv = modelViewMatrix * vec4(local, 1.0);
      vViewPos = mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;

  const FRAG = `
    precision highp float;
    uniform sampler2D uElev; uniform vec4 uElevRect; uniform vec2 uElevTexel; uniform float uElevMin, uElevScale, uExag;
    uniform sampler2D uImg; uniform vec4 uImgRect;
    uniform float uDLon, uDLat, uLevel;
    uniform vec3 uSun; uniform float uTime, uCamAlt, uDayMix; uniform vec4 uSeason;   // winter N, autumn N, winter S, autumn S (0..1)
    uniform sampler2D uOwner, uPal, uSim, uInfo, uNoise;
    // the four photographic detail textures (forest, dunes, rock, grass) travel as one array where the GPU has arrays:
    // Apple's GPUs allow a fragment shader 16 textures, and this one needs every unit it can spare
    #ifdef USE_DETARR
    precision highp sampler2DArray;
    uniform sampler2DArray uDet;
    #else
    uniform sampler2D uDetA, uDetB, uDetC, uDetD;
    #endif
    uniform vec2 uSimRes, uSel, uHover; uniform float uFertView, uPolitical, uLabelsOn;
    uniform sampler2D uClouds; uniform float uCloudShift, uCloudVis; uniform vec2 uPhaseB, uPhaseRot;
    uniform sampler2D uDecal, uDecal2, uWaterN; uniform vec4 uDecalRect; uniform float uDecalOn, uQuality;
    varying vec2 vUV, vGL, vGLf; varying float vLon, vLat, vH; varying vec3 vUnit; varying vec3 vViewPos; varying mat3 vNM;
    const float PI = 3.14159265;
    ${window.SHADOWS ? SHADOWS.GLSL : 'float sunHidden(vec3 p) { return 0.0; }'}
    #ifdef USE_TEXARR
    // generated ground and land-use tiles (textures.js), sampled in a metric Mercator frame: a phase computed in double precision
    // at the tile centre (uPhN whole cells mod 16, uPhF the fraction) plus the precise local offset vGLf, in base cells of 1.5 m
    precision highp sampler2DArray;
    uniform sampler2DArray uGround, uLanduse; uniform float uTexMix;
    #ifndef DET_SHALLOWS
    uniform sampler2D uShallows;
    #endif
    uniform vec2 uPhF, uPhN, uPhR; uniform float uK0, uKR;
    vec2 gcf(float n) { return (uPhN + uPhF + vGLf * uK0) / n; }
    vec2 gcr() { return uPhR + (mat2(0.8, 0.6, -0.6, 0.8) * vGLf) * uKR; }
    vec3 gtex(sampler2DArray T, float L, float n) { return texture(T, vec3(gcf(n), L)).rgb; }
    vec3 gtexS(sampler2DArray T, float L, float n, float swap) { vec2 c = gcf(n); c = mix(c, c.yx, swap); return texture(T, vec3(c, L)).rgb; }
    #endif
    float hAt(vec2 uv) { return max(uElevMin + texture2D(uElev, uElevRect.xy + uv * uElevRect.zw).r * 255.0 * uElevScale, 0.0); }
    vec4 noise2(vec2 p) { return texture2D(uNoise, p); }
    // geographic texture coordinate at scale k = m*50 (per radian): tile-centre phase (double precision, CPU) + precise local offset
    vec2 gc(float m) { return fract(uPhaseB * m) + vGL * (m * 50.0); }
    float hash21(vec2 p) { p = mod(p, 1024.0); vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    void main() {
      // ---------- geometry ----------
      float cl = cos(vLat);
      float tileWm = abs(uDLon) * ${R_M.toFixed(1)} * max(cl, 0.02);
      float tileHm = abs(uDLat) * ${R_M.toFixed(1)};
      vec2 tex = uElevTexel * 1.6;                          // in pack uv
      vec2 tuv = tex / uElevRect.zw;                        // in tile uv
      float hE = hAt(vUV + vec2(tuv.x, 0.0)), hW = hAt(vUV - vec2(tuv.x, 0.0));
      float hS = hAt(vUV + vec2(0.0, tuv.y)), hN = hAt(vUV - vec2(0.0, tuv.y));
      float dhdx = (hE - hW) / (2.0 * tuv.x * tileWm);
      float dhdy = (hN - hS) / (2.0 * tuv.y * tileHm);     // toward north
      vec3 nEnu = normalize(vec3(-dhdx * uExag, -dhdy * uExag, 1.0));
      float slope = 1.0 - nEnu.z;                           // 0 flat .. ~1 cliff
      // ---------- imagery ----------
      // magnification estimate first (needed for the warp)
      vec2 duv0 = fwidth(vUV * uImgRect.zw * 4096.0);
      float texPerPx0 = max(duv0.x, duv0.y);
      float mag = clamp(1.0 - texPerPx0 * 1.2, 0.0, 1.0);            // 1 when strongly magnified
      vec2 wp0 = gc(60.0);
      vec4 wn = noise2(wp0) - 0.5;
      vec4 wn2 = noise2(wp0 * 4.7) - 0.5;
      vec4 wn3 = noise2(gc(8.0)) - 0.5;                                          // ~16 km swell: bends the 5 km texel staircase into coastlines
      vec2 texelP = uImgRect.zw / 512.0;                                          // one imagery texel in pack uv
      vec2 warp = (wn.rg * 0.18 + wn2.rg * 0.08 + wn3.rg * 0.95) * mag * texelP;
      vec4 img = texture2D(uImg, uImgRect.xy + vUV * uImgRect.zw + warp);
      float closeFade0 = max(clamp(1.0 - texPerPx0 * 0.25, 0.0, 1.0), smoothstep(0.03, 0.003, uCamAlt));
      float a = img.a;                                   // 1 land, 0.75 raster river band, 0.5 lake, 0 sea
      float aw = fwidth(a);
      float kSea = clamp(aw * 1.2, 0.01, 0.12);                        // crisp, anti-aliased coastline at any zoom
      float seaW = 1.0 - smoothstep(0.36 - kSea, 0.36 + kSea, a);
      float landW = 1.0 - seaW;
      float minify = clamp(texPerPx0 * 0.5 - 0.25, 0.0, 1.0);          // 1 when imagery is minified (mip-averaged classes are unreliable)
      float win = 0.05 + max(0.09, min(aw * 1.6, 0.14)) * (1.0 - minify);
      // lakes and river bands are flat plateaus of alpha; a coast is a steep ramp that merely passes through those values
      float plateau = 1.0 - smoothstep(0.12, 0.35, aw / max(texPerPx0, 1e-4));
      float lakeW = (1.0 - smoothstep(0.04, win, abs(a - 0.5))) * step(0.2, a) * (1.0 - step(0.62, a)) * plateau;
      float bandW = (1.0 - smoothstep(0.03, 0.06 + min(aw * 1.2, 0.08) * (1.0 - minify), abs(a - 0.75))) * step(0.64, a) * (1.0 - step(0.9, a)) * plateau;
      bandW *= mix(1.0, smoothstep(0.015, 0.06, aw), minify);        // far away only true thin lines count, not mip-averaged river country
      // camera-local decal: vector rivers and roads painted straight onto the ground
      vec2 dcu = (vec2(vLon, vLat) - uDecalRect.xy) * uDecalRect.zw;
      float inDecal = uDecalOn * step(0.0, dcu.x) * step(dcu.x, 1.0) * step(0.0, dcu.y) * step(dcu.y, 1.0);
      vec4 dec = inDecal > 0.5 ? texture2D(uDecal, dcu) : vec4(0.0);
      vec4 dec2 = inDecal > 0.5 ? texture2D(uDecal2, dcu) : vec4(0.0);   // r burn/ash, b cast shadows, a flood water
      float castS = dec2.b; float burnW = dec2.r; float floodW = dec2.a;
      float riverLine = bandW * (1.0 - inDecal) * (1.0 - smoothstep(0.3, 0.7, closeFade0));   // raster river water only from a distance; close in it is floodplain
      float vecRiver = dec.r * inDecal;
      float inlandW = max(lakeW, max(riverLine, max(vecRiver, floodW * 0.95)));
      vec2 geo = vec2((vLon / PI + 1.0) * 0.5, 0.5 - vLat / PI);   // global equirect uv (v down)
      vec4 info = texture2D(uInfo, geo);                             // r shelf, g ice, b land
      // magnification: how many screen pixels per imagery texel (approx via derivatives)
      vec2 duv = fwidth(vUV * uImgRect.zw * 4096.0);
      float texPerPx = max(duv.x, duv.y);                            // >1 minified, <1 magnified
      float detailFade = clamp(1.0 - texPerPx * 0.9, 0.0, 1.0);      // 0 far, 1 close
      float closeFade = max(clamp(1.0 - texPerPx * 0.25, 0.0, 1.0), smoothstep(0.03, 0.003, uCamAlt));
      // variation noise in geographic space (stable across tiles and LODs)
      vec4 nMac = noise2(gc(3.0));
      vec4 nMid = noise2(gc(24.0));
      vec4 nMic = noise2(gc(180.0));
      vec4 nFin = noise2(gc(800.0));
      // procedural micro-relief: hillsides are gullied and rocky at this scale, not smooth
      float bumpA = detailFade * smoothstep(0.06, 0.004, uCamAlt) * step(0.5, uQuality);
      if (bumpA > 0.001) {
        vec2 b1 = gc(30.0), b2 = gc(180.0); float e = 0.0078;
        float n10 = noise2(b1).r, n20 = noise2(b2).g;
        vec2 g1 = vec2(noise2(b1 + vec2(e, 0.0)).r - n10, noise2(b1 + vec2(0.0, e)).r - n10) / e;
        vec2 g2 = vec2(noise2(b2 + vec2(e, 0.0)).g - n20, noise2(b2 + vec2(0.0, e)).g - n20) / e;
        float st = smoothstep(0.05, 0.35, slope);
        vec2 add = (g1 * 0.021 * (0.08 + st) + g2 * 0.0127 * (0.08 + st * 1.2)) * bumpA * (0.55 + 0.9 * nMac.r);
        nEnu = normalize(vec3(nEnu.xy - add, nEnu.z));
        slope = 1.0 - nEnu.z;
      }
      // ---------- land colour: biome splatting driven by imagery + terrain ----------
      vec3 base = img.rgb;
      float lum = dot(base, vec3(0.299, 0.587, 0.114));
      float green = clamp((base.g - max(base.r, base.b) * 0.92) * 6.0 + 0.25, 0.0, 1.0);
      float warm = clamp((base.r - base.b) * 4.0, 0.0, 1.0);
      float white = smoothstep(0.66, 0.9, lum) * (1.0 - warm) * (1.0 - green);
      float latN0 = abs(vLat) / (0.5 * PI);
      // seasons: the hemisphere's winter pulls the snow line down (to the coast in the far north), autumn colours the deciduous belt
      float hemi = smoothstep(-0.03, 0.03, vLat);
      float winter = mix(uSeason.z, uSeason.x, hemi) * smoothstep(0.18, 0.4, latN0);
      float autumn = mix(uSeason.w, uSeason.y, hemi);
      float decid = smoothstep(0.26, 0.4, latN0) * (1.0 - smoothstep(0.56, 0.74, latN0)) * (1.0 - smoothstep(1200.0, 2400.0, vH));
      float seasonK = 900.0 + 5200.0 * pow(latN0, 1.5);
      float snowLine0 = max(-900.0, 5100.0 - 4800.0 * pow(latN0, 1.3) - max(0.0, winter - 0.4) * seasonK + max(0.0, 0.4 - winter) * seasonK * 0.35);
      float treeLine = 4100.0 - 3900.0 * pow(latN0, 1.4);
      float ice = max(info.g, white * max(smoothstep(snowLine0 - 900.0, snowLine0 + 200.0, vH), smoothstep(0.7, 0.8, latN0)));
      // biome weights
      float aboveTree = smoothstep(treeLine - 300.0, treeLine + 200.0, vH);
      float steep = smoothstep(0.12, 0.42, slope);
      float wForest = green * (1.0 - smoothstep(0.32, 0.6, lum)) * (1.0 - aboveTree) * (1.0 - steep * 0.7);
      float wGrass  = green * smoothstep(0.28, 0.55, lum) * (1.0 - steep * 0.6) + green * aboveTree * 0.6 * (1.0 - steep);
      float wDesert = warm * (1.0 - green) * (1.0 - steep) * (1.0 - smoothstep(1800.0, 3000.0, vH));
      float wRock   = max(steep, smoothstep(treeLine + 400.0, treeLine + 1400.0, vH) * (1.0 - green * 0.5)) + (1.0 - green) * (1.0 - warm) * 0.5;
      // dithered transitions: land cover breaks up instead of fading
      wForest = pow(max(wForest + (nMid.r - 0.5) * 0.5 + (nMic.g - 0.5) * 0.25 + (nFin.r - 0.5) * 0.15, 0.0), 3.0);
      wGrass  = pow(max(wGrass  + (nMid.g - 0.5) * 0.5 + (nMic.r - 0.5) * 0.25 + (nFin.g - 0.5) * 0.15, 0.0), 3.0);
      wDesert = pow(max(wDesert + (nMac.b - 0.5) * 0.3 + (nMic.b - 0.5) * 0.2 + (nFin.b - 0.5) * 0.1, 0.0), 3.0);
      wRock   = pow(max(wRock   + (nMid.a - 0.5) * 0.4 + (nMic.a - 0.5) * 0.25 + (nFin.a - 0.5) * 0.2, 0.0), 3.0);
      float ws = wForest + wGrass + wDesert + wRock + 1e-4;
      wForest /= ws; wGrass /= ws; wDesert /= ws; wRock /= ws;
      // photographic detail at three scales; rotated finest copy hides the tiling
      vec2 dp1 = gc(6.0);
      vec2 dp2 = gc(32.0);
      vec2 dp3 = fract(uPhaseRot) + (mat2(0.83, 0.56, -0.56, 0.83) * vGL) * 9000.0;
      float near3 = smoothstep(0.0004, 0.0001, uCamAlt) * step(0.5, uQuality);
      detailFade *= smoothstep(0.08, 0.02, uCamAlt);
      #ifdef USE_DETARR
      #define DET(L) mix(texture(uDet, vec3(dp2, L)).rgb * (0.7 + 0.6 * texture(uDet, vec3(dp1, L)).g), texture(uDet, vec3(dp3, L)).rgb * (0.7 + 0.6 * texture(uDet, vec3(dp2, L)).g), near3)
      vec3 dF = DET(0.0), dG = DET(3.0), dS = DET(1.0), dR = DET(2.0) * 0.78;
      #else
      #define DET(t) mix(texture2D(t, dp2).rgb * (0.7 + 0.6 * texture2D(t, dp1).g), texture2D(t, dp3).rgb * (0.7 + 0.6 * texture2D(t, dp2).g), near3)
      vec3 dF = DET(uDetA), dG = DET(uDetD), dS = DET(uDetB), dR = DET(uDetC) * 0.78;
      #endif
      #undef DET
      vec3 det = dF * wForest + dG * wGrass + dS * wDesert + dR * wRock;
      float dl = dot(det, vec3(0.299, 0.587, 0.114));
      det = mix(vec3(dl) * 0.5 + det * 0.5, det, smoothstep(0.0012, 0.0002, uCamAlt));   // photo grain only reads from low altitude
      float dl2 = dl;
      // the imagery keeps regional hue and brightness; the photo detail supplies the structure
      vec3 chroma = base / max(lum, 0.03);
      float chromaMix = 0.5 * (wForest + wGrass) + 0.3 * wDesert + 0.08 * wRock;
      vec3 synth = det * pow(max(lum, 0.03) / max(dl, 0.05), 0.55) * 1.1 * mix(vec3(1.0), chroma, chromaMix);
      synth = mix(synth, det * 1.1, 0.2);
      vec3 land = mix(base * (0.8 + 0.4 * dl), synth, detailFade * 0.9);
      // bare rock on steep ground, snow on high cold ground
      vec3 rock = dR * (0.9 + 0.3 * dl);
      land = mix(land, rock, smoothstep(0.3, 0.6, slope) * (1.0 - ice) * 0.5 * detailFade);
      // autumn and winter colours for the deciduous belt; grass dries off in winter
      float fall = autumn * decid; float bare = winter * decid;
      land = mix(land, land * vec3(1.38, 0.96, 0.5), fall * (wForest * 0.8 + wGrass * 0.12));
      land = mix(land, mix(land, vec3(0.42, 0.36, 0.3), 0.6), bare * wForest * 0.7);
      land = mix(land, land * vec3(1.06, 0.96, 0.74), winter * wGrass * 0.55);
      float snow = smoothstep(snowLine0 - 150.0, snowLine0 + 700.0, vH) * (1.0 - smoothstep(0.35, 0.7, slope)) * mix(0.25 + 0.75 * white, 0.85, winter * 0.8);
      land = mix(land, vec3(0.92, 0.94, 0.97) * (0.8 + dl * 0.2), max(snow, ice * 0.95));
      #ifdef USE_TEXARR
      // ---------- generated ground: real grass, sand, rock and snow under the biome weights, from ~30 km down ----------
      float gOn = smoothstep(0.005, 0.0012, uCamAlt) * uTexMix;
      if (gOn > 0.002) {
        float dith = (nMic.r - 0.5) * 0.35 + (nFin.g - 0.5) * 0.15;
        float gL = (latN0 + dith < 0.3 && warm > 0.3) ? 9.0 : (lum + dith > 0.5 && green < 0.7) ? 1.0 : 0.0;    // savanna, steppe, meadow
        float fL = (vH > treeLine - 600.0 || latN0 + dith > 0.62) ? 8.0 : 7.0;                                  // tundra above the trees and in the far north, else forest floor
        float dL = (lum > 0.62 && green < 0.25 && warm < 0.4) ? 15.0 : (nMid.b + dith > 0.62 ? 4.0 : 3.0);       // salt flat, stony desert, sand
        float rL = (nMid.a + dith > 0.58) ? 11.0 : 5.0;                                                           // scree, bare rock
        float wD = wDesert > 0.02 ? wDesert : 0.0, wR = wRock > 0.02 ? wRock : 0.0;
        vec3 tex = gtex(uGround, gL, 4.0) * wGrass + gtex(uGround, fL, 4.0) * wForest;
        if (wD > 0.0) tex += gtex(uGround, dL, 4.0) * wD;
        if (wR > 0.0) tex += gtex(uGround, rL, 4.0) * wR;
        tex /= max(wGrass + wForest + wD + wR, 1e-3);
        float bl = dot(texture(uGround, vec3(gcr(), gL)).rgb, vec3(0.299, 0.587, 0.114));                       // a rotated coarse copy breaks the repeat
        tex *= 0.74 + 0.52 * bl;
        float snowW = max(snow, ice * 0.95); if (snowW > 0.01) tex = mix(tex, gtex(uGround, 6.0, 4.0) * 1.04, snowW);
        float tl = dot(tex, vec3(0.299, 0.587, 0.114)), ll = dot(land, vec3(0.299, 0.587, 0.114));
        vec3 texLand = tex * pow(max(ll, 0.03) / max(tl, 0.05), 0.65);                                          // the imagery keeps its regional brightness
        texLand = mix(texLand, texLand * land / max(ll, 0.03), 0.3);                                             // and lends a share of its hue
        land = mix(land, texLand, gOn * 0.85);
      }
      #endif
      // cultivation patchwork near settlements (sim channel b)
      vec4 sim = texture2D(uSim, geo);
      float cult = sim.b;
      // under the trees it is dim: where the forest stands the ground lies in the canopy's shade, dappled with light
      // (from the height at which single trees are drawn; farmland has cleared its share)
      { float canopy = wForest * smoothstep(0.0085, 0.005, uCamAlt) * (1.0 - cult * 0.6) * (1.0 - max(snow, ice));
        land *= 1.0 - canopy * (0.30 + 0.26 * nFin.a) * mix(1.0, 0.45, bare); }
      if (cult > 0.03 && closeFade > 0.0) {
        // fields cluster around the settlement site (sim.a? no: site is unknown here) -> use noise clusters within the cell
        vec2 sc0 = geo * uSimRes; vec2 cellId0 = floor(sc0); vec2 inCell = sc0 - cellId0;
        vec2 site = vec2(0.3 + 0.4 * hash21(cellId0 + 11.0), 0.3 + 0.4 * hash21(cellId0 + 17.0));
        float dSite = length((inCell - site) * vec2(1.0, 1.0));
        float near = 1.0 - smoothstep(0.08 + cult * 0.25, 0.2 + cult * 0.4, dSite);
        near = mix(near, clamp(dec.a * 1.5, 0.0, 1.0), inDecal);   // inside the decal, fields hug the real settlement
        near *= (0.3 + 0.7 * smoothstep(0.1, 0.45, sim.a)) * (0.45 + 0.55 * green);   // farmland follows fertile, watered ground
        float fine = smoothstep(0.0012, 0.0004, uCamAlt);                 // close in, every field shows its plots
        // fields are long rectangles on lines that bend with the land, not with the map; each is cut into plots, three by two,
        // most of them under the field's own crop. Farmland comes in stretches (neighbouring fields share their luck), not as a chequerboard.
        vec2 fq = sc0 * vec2(96.0, 150.0) + (nMac.rg - 0.5) * 5.0 + (nMid.rg - 0.5) * 0.8;
        vec2 bigId = floor(fq), bf = fract(fq); vec2 sq = fq * vec2(3.0, 2.0); vec2 smallId = floor(sq), sf = fract(sq);
        float own = step(hash21(smallId + 2.2), 0.42) * fine;              // this plot grows something of its own
        float fieldOn = step(1.0 - cult * 0.8, mix(hash21(bigId), hash21(floor(bigId * 0.34) + 41.0), 0.5)) * near;
        fieldOn *= 1.0 - 0.85 * fine * step(hash21(smallId + 8.8), 0.1);  // the odd plot lies fallow
        fieldOn *= (1.0 - smoothstep(0.05, 0.13, slope)) * (1.0 - smoothstep(treeLine - 900.0, treeLine - 300.0, vH)) * smoothstep(0.03, 0.012, uCamAlt);
        vec3 colB = mix(vec3(0.60, 0.55, 0.30), vec3(0.45, 0.56, 0.24), hash21(bigId + 3.1)) * (0.85 + 0.3 * hash21(bigId + 7.7));
        vec3 colS = mix(vec3(0.60, 0.55, 0.30), vec3(0.45, 0.56, 0.24), hash21(smallId + 3.1)) * (0.85 + 0.3 * hash21(smallId + 7.7));
        vec3 fieldCol = mix(colB, colS, own) * (1.0 + (hash21(smallId + 4.4) - 0.5) * 0.14 * fine);
        float fbB = smoothstep(0.0, 0.03, min(min(bf.x, 1.0 - bf.x), min(bf.y, 1.0 - bf.y)));
        float fbS = smoothstep(0.0, 0.07, min(min(sf.x, 1.0 - sf.x), min(sf.y, 1.0 - sf.y)));
        float fb = fbB * mix(1.0, fbS, fine * 0.75);                       // tracks and hedges between fields, balks between plots
        float fieldA = 0.7;
        #ifdef USE_TEXARR
        if (gOn > 0.002 && fieldOn > 0.001) {
          // every plot grows something: paddies where it is warm and wet, orchards and vines in the temperate belt, grain everywhere
          float wet = step(0.45, green) * step(warm, 0.35) * step(latN0, 0.45);
          float hcB = hash21(bigId + 5.3), hsB = hash21(bigId + 9.1);
          float flB = (wet > 0.5 && hcB < 0.6) ? 3.0 : hcB < 0.35 ? 0.0 : hcB < 0.55 ? 1.0 : hcB < 0.68 ? 2.0 : hcB < 0.84 ? 6.0 : (latN0 > 0.3 && latN0 < 0.55 && hcB < 0.92) ? 4.0 : 5.0;
          vec3 ft = gtexS(uLanduse, flB, flB == 5.0 ? 16.0 : 8.0, step(0.5, hsB)) * (0.9 + 0.2 * hash21(bigId + 7.7));
          if (own > 0.01) {
            float hc = hash21(smallId + 5.3), hs = hash21(smallId + 9.1);
            float fl = (wet > 0.5 && hc < 0.6) ? 3.0 : hc < 0.35 ? 0.0 : hc < 0.55 ? 1.0 : hc < 0.68 ? 2.0 : hc < 0.84 ? 6.0 : (latN0 > 0.3 && latN0 < 0.55 && hc < 0.92) ? 4.0 : 5.0;
            ft = mix(ft, gtexS(uLanduse, fl, fl == 5.0 ? 16.0 : 8.0, step(0.5, hs)) * (0.9 + 0.2 * hash21(smallId + 7.7)), own);
          }
          fieldCol = mix(fieldCol, ft * (1.0 + (hash21(smallId + 4.4) - 0.5) * 0.14 * fine), gOn); fieldA = mix(0.7, 0.92, gOn);
        }
        #endif
        land = mix(land, fieldCol * (0.8 + 0.2 * fb), fieldOn * closeFade * fieldA * (1.0 - ice) * landW);
      }
      // floodplain along raster river bands (the real channel is drawn by the decal), fertile halo along big rivers, roads
      land = mix(land, land * vec3(0.88, 0.97, 0.78), bandW * inDecal * 0.45 * (1.0 - ice));
      land = mix(land, land * vec3(0.78, 0.98, 0.66) + vec3(0.01, 0.05, 0.0), dec.a * 0.45 * (1.0 - ice) * (1.0 - cult));
      // built-up ground (dec.b low values: packed earth, courtyards, lanes) and roads (high values)
      // what a town stands on follows its age: bare trodden earth until the classical world, stone flags in its
      // built-up heart from then on, concrete paving in the industrial and modern city
      float paves = smoothstep(0.26, 0.34, sim.g); float modernGround = smoothstep(0.6, 0.7, sim.g);
      float paved = smoothstep(0.3, 0.42, dec.b) * paves;
      float arid = clamp(wDesert * 1.6, 0.0, 1.0);                         // dry country: trodden ground is pale dust, not dark earth
      vec3 urbanCol = mix(mix(vec3(0.40, 0.35, 0.29), vec3(0.60, 0.52, 0.40), arid), mix(vec3(0.47, 0.45, 0.41), vec3(0.43, 0.43, 0.43), modernGround), paved);
      #ifdef USE_TEXARR
      if (gOn > 0.002 && dec.b > 0.04) {
        vec3 flags = mix(gtex(uLanduse, 9.0, 4.0), gtex(uLanduse, 12.0, 2.0), modernGround);
        urbanCol = mix(urbanCol, mix(mix(gtex(uGround, 14.0, 4.0) * 1.06, gtex(uGround, 3.0, 4.0) * 0.9, arid * 0.75), flags, paved), gOn);
      }
      #endif
      land = mix(land, urbanCol * (0.8 + 0.4 * dl2), smoothstep(0.04, 0.22, dec.b) * mix(0.7, 0.9, smoothstep(0.3, 0.45, dec.b)) * (1.0 - ice));
      // burnt and ash-covered ground (fresh fire black, old scars grey-brown with new green coming through)
      vec3 burnCol = mix(vec3(0.30, 0.27, 0.22), vec3(0.11, 0.1, 0.095), smoothstep(0.3, 0.9, burnW)) * (0.75 + 0.5 * nMic.g);
      land = mix(land, burnCol * (0.8 + 0.4 * dl2), smoothstep(0.03, 0.25, burnW) * (0.7 + 0.3 * nMid.r) * (0.75 + 0.25 * smoothstep(0.3, 0.6, nMic.a)) * (1.0 - ice));
      vec3 roadCol = mix(mix(mix(vec3(0.44, 0.36, 0.26), vec3(0.58, 0.50, 0.38), arid), vec3(0.56, 0.53, 0.48), smoothstep(0.55, 0.75, dec.b)), vec3(0.30, 0.30, 0.31), smoothstep(0.8, 0.95, dec.b));
      #ifdef USE_TEXARR
      if (gOn > 0.002 && dec.b > 0.4) {   // dirt tracks, then cobbles, then asphalt; railway lines run on ballast
        vec3 rt = dec.b > 0.95 ? gtex(uGround, 11.0, 4.0) * 0.8 : dec.b > 0.8 ? gtex(uLanduse, 10.0, 4.0) : dec.b > 0.62 ? gtex(uLanduse, 8.0, 2.0) : mix(gtex(uGround, 14.0, 4.0) * 0.9, gtex(uGround, 3.0, 4.0) * 0.8, arid * 0.75);   // a track through dry country is beaten dust
        roadCol = mix(roadCol, rt, gOn);
      }
      #endif
      land = mix(land, roadCol * (0.85 + 0.3 * dl), smoothstep(0.4, 0.7, dec.b) * (1.0 - ice));
      // beach: a sand strip where the land runs down into the sea
      float beach = (1.0 - smoothstep(0.42, 0.8, a)) * landW * closeFade * (1.0 - ice) * (1.0 - lakeW) * (1.0 - bandW);
      vec3 beachCol = vec3(0.82, 0.76, 0.6) * (0.85 + 0.3 * dl);
      #ifdef USE_TEXARR
      if (gOn > 0.002 && beach > 0.01) beachCol = mix(beachCol, gtex(uGround, nMid.g > 0.55 ? 13.0 : 3.0, 4.0) * 1.08, gOn);
      #endif
      land = mix(land, beachCol, beach * 0.75);
      // ---------- water ----------
      float shelf = info.r;
      vec3 deep = vec3(0.02, 0.09, 0.20), shallow = vec3(0.05, 0.32, 0.42), coast = vec3(0.10, 0.45, 0.50);
      vec3 water = mix(deep, shallow, pow(shelf, 1.6));
      water = mix(water, coast, smoothstep(0.86, 1.0, shelf) * 0.6);
      #ifdef USE_TEXARR
      { float shal = smoothstep(0.9, 1.0, shelf) * seaW * gOn;   // sunlit sand and caustics in the shallows, drifting slowly
        #ifdef DET_SHALLOWS
        if (shal > 0.01) water = mix(water, texture(uDet, vec3(gcf(8.0) + vec2(uTime * 0.012, -uTime * 0.008), 4.0)).rgb * 0.85, shal * 0.5); }
        #else
        if (shal > 0.01) water = mix(water, texture2D(uShallows, gcf(8.0) + vec2(uTime * 0.012, -uTime * 0.008)).rgb * 0.85, shal * 0.5); }
        #endif
      #endif
      // waves: animated normal perturbation
      vec2 wp = gc(180.0);
      vec4 n1 = noise2(wp + vec2(uTime * 0.02, 0.0)), n2 = noise2(gc(486.0) - vec2(0.0, uTime * 0.03));
      vec3 nWater = normalize(vec3((n1.r - 0.5 + n2.r - 0.5) * 0.25 * closeFade, (n1.g - 0.5 + n2.g - 0.5) * 0.25 * closeFade, 1.0));
      // close to the water: real wave normals (two scrolling scales), stronger on open sea than on rivers
      float waveMix = smoothstep(0.02, 0.002, uCamAlt) * (0.6 + 0.4 * seaW);
      if (waveMix > 0.01) {
        vec3 w1 = texture2D(uWaterN, gc(600.0) + vec2(uTime * 0.03, uTime * 0.017)).rgb * 2.0 - 1.0;
        vec3 w2 = texture2D(uWaterN, gc(2400.0) * mat2(0.8, 0.6, -0.6, 0.8) - vec2(uTime * 0.05, -uTime * 0.021)).rgb * 2.0 - 1.0;
        vec3 wn = normalize(vec3((w1.xy + w2.xy * 0.7) * 0.55 * (0.4 + 0.6 * seaW), 1.0));
        nWater = normalize(mix(nWater, wn, waveMix));
      }
      float foam = smoothstep(0.55, 0.9, n2.b) * smoothstep(0.35, 0.6, a) * (1.0 - smoothstep(0.6, 0.75, a)) * closeFade;
      vec3 inland = mix(vec3(0.07, 0.30, 0.38), vec3(0.12, 0.42, 0.45), n1.r);
      // vector rivers: shallow bright banks, dark deep channel, a pale wet bank line
      float rdepth = smoothstep(0.3, 1.0, dec.r) * (0.45 + 0.55 * dec.g);
      vec3 riverCol = mix(vec3(0.16, 0.40, 0.40), vec3(0.03, 0.16, 0.30), rdepth);
      riverCol += vec3(0.25, 0.22, 0.15) * smoothstep(0.28, 0.42, dec.r) * (1.0 - smoothstep(0.42, 0.62, dec.r));
      inland = mix(inland, riverCol, vecRiver * inDecal);
      inland = mix(inland, vec3(0.36, 0.33, 0.22), floodW * 0.85);
      // polar sea ice
      float iceEdge = 0.86 - 0.22 * winter;                               // the pack ice spreads toward the equator in the hemisphere's winter
      float seaIce = smoothstep(iceEdge - 0.08, iceEdge + 0.04, latN0 + (nMac.r - 0.5) * 0.08) * seaW;
      float floe = smoothstep(0.35, 0.65, nMid.b + 0.3 * nMic.a) * smoothstep(0.0, 0.08, latN0 - iceEdge + 0.1);
      vec3 iceCol = mix(vec3(0.74, 0.82, 0.9), vec3(0.9, 0.93, 0.96), floe);
      water = mix(water, iceCol, seaIce * mix(0.55, 1.0, floe));
      // ---------- compose surface ----------
      float inlandMix = inlandW * mix(0.9, 0.7, closeFade);
      vec3 col = mix(land, inland, inlandMix) * landW + water * seaW;
      col += vec3(0.9) * foam * 0.5;
      float flatW = max(1.0 - landW, min(1.0, inlandW * 1.4));        // rivers and lakes lie flat and ripple, whatever the slope they cross
      vec3 nLocal = normalize(mix(nEnu, nWater, flatW));
      // ---------- lighting ----------
      vec3 upL = normalize(vUnit);
      vec3 northL = normalize(vec3(0.0, 1.0, 0.0) - upL.y * upL);
      vec3 eastL = cross(northL, upL);
      vec3 nTile = normalize(eastL * nLocal.x + northL * nLocal.y + upL * nLocal.z);
      vec3 upV = normalize(vNM * upL);
      vec3 nV = normalize(vNM * nTile);
      vec3 sunV = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);
      float sunUp = dot(upV, sunV);
      float day = smoothstep(-0.15, 0.25, sunUp);
      float diff = max(dot(nV, sunV), 0.0);
      // ---------- terrain self-shadowing: march the heightmap toward the sun ----------
      float shadow = 1.0;
      float shadowMix = smoothstep(0.15, 0.08, uCamAlt) * step(0.5, uQuality);
      if (shadowMix > 0.0) {
        vec3 sunL = vec3(dot(vNM[0], sunV), dot(vNM[1], sunV), dot(vNM[2], sunV));   // sun in the tile frame (east, north, up)
        float horiz = length(sunL.xy);
        if (sunL.z > 0.015 && horiz > 1e-4) {
          vec2 dirUV = vec2(sunL.x / tileWm, -sunL.y / tileHm) / horiz;               // tile uv per horizontal metre
          float rise = sunL.z / horiz / uExag;                                         // unexaggerated metres up per metre out
          float h0 = vH + 1.5;
          float tm = max(tileWm * tuv.x, tileHm * tuv.y) * 1.2;
          for (int i = 0; i < 10; i++) {
            vec2 p = vUV + dirUV * tm;
            vec2 puv = uElevRect.xy + p * uElevRect.zw;
            if (puv.x < 0.0 || puv.x > 1.0 || puv.y < 0.0 || puv.y > 1.0) break;
            float ht = hAt(p);
            float ray = h0 + rise * tm;
            shadow = min(shadow, clamp((ray - ht) * 6.0 / tm + 0.5, 0.0, 1.0));
            tm *= 1.4;
          }
        }
        shadow = mix(1.0, shadow, shadowMix);
      }
      shadow = min(shadow, 1.0 - 0.62 * max(castS, sunHidden(vViewPos)));       // block shadows far off, true ones from the sun's depth map near the camera
      // cloud shadows (same texture the cloud shell uses, same drift)
      float cloudA = texture2D(uClouds, vec2(fract((vLon - uCloudShift) / (2.0 * PI)), vLat / PI + 0.5)).g;
      float cloudShadow = 1.0 - 0.55 * smoothstep(0.3, 0.8, cloudA) * uCloudVis;
      diff *= shadow * cloudShadow;
      vec3 ambC = vec3(0.16 + 0.1 * day) * mix(vec3(1.0), vec3(0.9, 0.95, 1.1), 1.0 - shadow * 0.7);
      vec3 lit = col * (ambC + diff * 1.05 * mix(1.0, 0.5, seaW * 0.3));
      // specular on water
      vec3 viewDir = normalize(-vViewPos);
      vec3 refl = reflect(-sunV, nV);
      float spec = pow(max(dot(refl, viewDir), 0.0), 90.0) * (seaW + inlandW * 0.14) * day;   // a river glints; it is not a mirror
      lit += vec3(0.9, 0.95, 1.0) * spec * 0.9;
      // night side: keep a little moonlight and city lights
      float night = 1.0 - smoothstep(-0.22, 0.02, sunUp);
      float light = sim.r; float highUp = smoothstep(0.003, 0.014, uCamAlt);   // orbital city lights fade out as real windows take over
      if (light > 0.002 && highUp > 0.001) {
        vec2 lp = gc(440.0);
        float sp = smoothstep(0.42, 0.8, noise2(lp).a) * 1.6 + 0.15;
        float lp2 = smoothstep(0.5, 0.9, noise2(gc(58.0)).r);
        vec3 lcol = mix(vec3(1.0, 0.62, 0.25), vec3(1.0, 0.92, 0.75), sim.g);
        lit += lcol * light * sp * (0.5 + lp2) * night * landW * 1.4 * highUp;
      }
      // closer in, the built-up ground itself glows softly under the lamps and hearths
      lit += mix(vec3(1.0, 0.62, 0.25), vec3(1.0, 0.9, 0.7), sim.g) * smoothstep(0.08, 0.3, dec.b) * night * (1.0 - highUp) * (0.06 + 0.22 * sim.g);
      lit += col * night * 0.045;
      // fresh fire glows through the night
      float front = smoothstep(0.08, 0.5, dec2.g) * (1.0 - smoothstep(0.7, 0.97, dec2.g));    // the fire front: the fringe of what is burning now
      lit += vec3(1.0, 0.42, 0.1) * (night * 0.9 + 0.15) * front * (0.3 + 0.7 * nMic.r) * (0.6 + 0.4 * nFin.g);
      // ---------- political overlay (smoothed, coast-clipped) ----------
      if (uPolitical > 0.0) {
        vec2 sc = geo * uSimRes;                  // cell coords
        vec2 cellC = floor(sc);
        vec4 o = texture2D(uOwner, (cellC + 0.5) / uSimRes);
        if (o.a > 0.5) {
          float id = o.r * 255.0 + o.g * 255.0 * 256.0;
          vec2 p = sc - 0.5; vec2 i0 = floor(p); vec2 f = p - i0;
          float w = 0.0;
          for (int dy = 0; dy < 2; dy++) for (int dx = 0; dx < 2; dx++) {
            vec2 c2 = i0 + vec2(float(dx), float(dy));
            vec4 o2 = texture2D(uOwner, (c2 + 0.5) / uSimRes);
            float same = (o2.a > 0.5 && abs(o2.r * 255.0 + o2.g * 255.0 * 256.0 - id) < 0.5) ? 1.0 : 0.0;
            float bw = (dx == 0 ? 1.0 - f.x : f.x) * (dy == 0 ? 1.0 - f.y : f.y);
            w += same * bw;
          }
          float fw = max(fwidth(w), 1e-4);                         // never a zero-width smoothstep (undefined in GLSL)
          float inside = smoothstep(0.5 - fw * 0.8, 0.5 + fw * 0.8, w);
          float border = 1.0 - smoothstep(0.0, min(fw * 2.2, 0.1), abs(w - 0.5));
          vec3 pc = texture2D(uPal, vec2((id + 0.5) / 512.0, 0.5)).rgb;
          float isPlayer = step(0.5, o.b) * step(o.b, 0.75);   // b: 0.6 player, 1.0 other, 0.3 at war
          float atWar = step(0.2, o.b) * step(o.b, 0.45);
          float band = 1.0 - smoothstep(0.5, 0.98, w);            // inner glow along the frontier
          float polClose = max(closeFade, smoothstep(0.06, 0.006, uCamAlt));   // altitude-driven so far hills do not flip to full tint
          float fillA = (mix(0.18, 0.03, polClose) + mix(0.16, 0.05, polClose) * band) * uPolitical;
          float clip = smoothstep(0.45, 0.65, a) + ice * 0.0;
          vec3 tinted = lit * 0.55 + pc * 0.5;
          lit = mix(lit, tinted, inside * fillA * clip);
          vec3 bc = pc * 1.6 + 0.2; bc = mix(bc, vec3(1.0, 0.86, 0.5), isPlayer * (0.55 + 0.45 * sin(uTime * 2.5)));
          bc = mix(bc, vec3(1.0, 0.35, 0.3), atWar * (0.5 + 0.5 * sin(uTime * 6.0)));
          lit = mix(lit, bc, border * inside * clip * (0.55 + 0.45 * uPolitical) * mix(1.0, 0.5, polClose));
        }
        // selection + hover rings
        vec2 cellF = fract(sc);
        float edge = min(min(cellF.x, 1.0 - cellF.x), min(cellF.y, 1.0 - cellF.y));
        float fws = max(fwidth(sc.x), 1e-5); float ring = 1.0 - smoothstep(0.0, fws * 2.5, edge - fws * 1.5);
        ring *= smoothstep(0.003, 0.02, uCamAlt);                      // map-level cue: fades out near the ground
        if (all(lessThan(abs(cellC - uSel), vec2(0.5)))) lit = mix(lit, vec3(0.55, 0.9, 1.0), ring * (0.7 + 0.3 * sin(uTime * 5.0)));
        else if (all(lessThan(abs(cellC - uHover), vec2(0.5)))) lit = mix(lit, vec3(1.0), ring * 0.5);
      }
      // fertility view
      if (uFertView > 0.0) {
        float fert = sim.a;
        vec3 fc = mix(vec3(0.6, 0.18, 0.1), vec3(0.25, 0.95, 0.4), fert);
        lit = mix(lit, fc * (0.35 + 0.65 * day), uFertView * landW * 0.6);
      }
      // ---------- aerial perspective ----------
      float distKm = length(vViewPos) * 6371.0;
      float low = smoothstep(0.035, 0.002, uCamAlt);
      float fog = (1.0 - exp(-distKm / 260.0)) * low * 0.75;
      vec3 sky = mix(vec3(0.01, 0.015, 0.035), vec3(0.70, 0.80, 0.92), day);
      lit = mix(lit, sky, fog);
      gl_FragColor = vec4(lit, 1.0);
    }`;

  // ---------- pack loading ----------
  class Pack {
    constructor(kind, L, px, py) { this.kind = kind; this.L = L; this.px = px; this.py = py; this.key = `${kind}${L}/${px}/${py}`; this.state = 'new'; this.texture = null; this.data = null; this.w = 0; this.h = 0; this.min = 0; this.scale = 0; this.lastUsed = 0; this.users = 0; }
  }

  class Terrain {
    constructor(opts) {
      this.noiseData = null; this.dispOn = false;
      this.opts = opts; this.index = opts.index; this.base = opts.base || 'data/';
      this.scene = opts.scene; this.group = new THREE.Group(); this.scene.add(this.group);
      // denser meshes for the close tiles, so the finer regional elevation and the micro-relief actually show as geometry
      this.geoms = { 32: buildTileGeometry(32), 64: buildTileGeometry(64), 128: buildTileGeometry(128) };
      this.tiles = new Map(); this.packs = new Map(); this.loading = 0; this.maxLoading = 6;
      this.exag = opts.exag || 2.0;
      this.frame = 0; this.visible = [];
      this.sseThreshold = 360; this.maxTiles = 380; this.maxLevel = 9;
      this.stats = { tiles: 0, packsI: 0, packsE: 0, loading: 0 };
      // flat elevation texture for absent packs (sea)
      const flat = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); flat.needsUpdate = true;
      this.flatTex = flat;
      const white = new THREE.DataTexture(new Uint8Array([40, 60, 80, 0]), 1, 1, THREE.RGBAFormat); white.needsUpdate = true;
      this.blankImg = white;
      this.globals = opts.globals; // shared uniform objects
      this.frustum = new THREE.Frustum(); this._m = new THREE.Matrix4();
      this._sphere = new THREE.Sphere(); this._v = new THREE.Vector3();
      this.elevMax = this.index.elev.maxLevel; this.imgMax = this.index.img.maxLevel;
      this.l6 = new Set((this.index.elev.l6 || []).map(([x, y]) => `${x}/${y}`));
      this.l7 = new Set((this.index.elev.l7 || []).map(([x, y]) => `${x}/${y}`));
    }
    // ----- packs -----
    packInfo(kind, L, px, py) {
      const key = `${L}/${px}/${py}`;
      if (kind === 'e') { if (L === 7) return this.l7.has(`${px}/${py}`) ? this.index.elev.packs[key] : undefined; if (L === 6) return this.l6.has(`${px}/${py}`) ? this.index.elev.packs[key] : undefined; return this.index.elev.packs[key]; }
      return this.index.img.packs[key];
    }
    getPack(kind, L, px, py, priority) {
      const key = `${kind}${L}/${px}/${py}`;
      let p = this.packs.get(key);
      if (!p) { p = new Pack(kind, L, px, py); const info = this.packInfo(kind, L, px, py); if (info === undefined || info === 0) { p.state = 'absent'; } else { p.info = info; } this.packs.set(key, p); }
      p.lastUsed = this.frame; if (priority !== undefined) p.priority = Math.max(p.priority || 0, priority);
      if (p.state === 'new') this.queue.push(p);
      return p;
    }
    async loadPack(p) {
      p.state = 'loading'; this.loading++;
      const url = this.base + (p.kind === 'e' ? `e/${p.L}_${p.px}_${p.py}.png` : `i/${p.L}_${p.px}_${p.py}.webp`);
      try {
        const r = await fetch(url); if (!r.ok) throw new Error('http ' + r.status);
        const blob = await r.blob();
        const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        p.w = bmp.width; p.h = bmp.height;
        const tex = new THREE.Texture(bmp);
        tex.flipY = false; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false;
        if (p.kind === 'e') {
          tex.format = THREE.LuminanceFormat; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
          p.min = p.info[0]; p.scale = p.info[1];
          // CPU copy for height queries
          const cv = document.createElement('canvas'); cv.width = p.w; cv.height = p.h; const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
          const d = ctx.getImageData(0, 0, p.w, p.h).data; const out = new Uint8Array(p.w * p.h); for (let i = 0; i < out.length; i++) out[i] = d[i * 4]; p.data = out;
        } else {
          tex.format = THREE.RGBAFormat; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = this.opts.anisotropy || 4;
          // CPU copy of the water mask (alpha) at the finest imagery level, so buildings and ships agree with the drawn coast
          if (p.L === this.imgMax) { const cv = document.createElement('canvas'); cv.width = p.w; cv.height = p.h; const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0); const d = ctx.getImageData(0, 0, p.w, p.h).data; const out = new Uint8Array(p.w * p.h); for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3]; p.alpha = out; }
        }
        tex.needsUpdate = true; p.texture = tex; p.state = 'ready';
      } catch (e) { console.warn('pack failed', url, e); p.state = 'error'; }
      this.loading--;
    }
    pumpQueue() {
      if (!this.queue.length) return;
      this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      while (this.loading < this.maxLoading && this.queue.length) { const p = this.queue.shift(); if (p.state === 'new') this.loadPack(p); }
      this.queue.length = 0; // re-queued each frame by visible tiles
    }
    evictPacks() {
      const limits = { i: 30, e: 56 };
      for (const kind of ['i', 'e']) {
        const list = [...this.packs.values()].filter(p => p.kind === kind && p.state === 'ready' && p.users === 0);
        if (list.length <= limits[kind]) continue;
        list.sort((a, b) => a.lastUsed - b.lastUsed);
        const n = list.length - limits[kind];
        for (let i = 0; i < n; i++) { const p = list[i]; if (this.frame - p.lastUsed < 30) break; p.texture.dispose(); if (p.texture.image && p.texture.image.close) p.texture.image.close(); this.packs.delete(p.key); }
      }
    }
    // best available pack for tile (L,tx,ty); requests the ideal one. Returns {pack, rect} or null
    bindPack(kind, L, tx, ty, priority) {
      let maxL;
      if (kind === 'e') { const s5 = Math.max(0, L - 5), s4 = Math.max(0, L - 4); maxL = (L >= 7 && this.l7.has(`${tx >> s5}/${ty >> s5}`)) ? 7 : (L >= 6 && this.l6.has(`${tx >> s4}/${ty >> s4}`)) ? 6 : Math.min(L, this.elevMax); }
      else maxL = Math.min(L, this.imgMax);
      const per = kind === 'e' ? this.index.elev.packTiles : this.index.img.packTiles;
      let ideal = null;
      for (let l = maxL; l >= 0; l--) {
        const sh = L - l; const txl = tx >> sh, tyl = ty >> sh;
        const px = Math.floor(txl / per), py = Math.floor(tyl / per);
        const p = this.getPack(kind, l, px, py, priority - (maxL - l));
        if (!ideal) ideal = p;
        if (p.state === 'absent') { return { pack: p, rect: [0, 0, 1, 1], level: l, absent: true }; }
        if (p.state === 'ready') {
          const tilesX = 2 << l, tilesY = 1 << l;
          const ptx = Math.min(per, tilesX - px * per), pty = Math.min(per, tilesY - py * per);
          const within = 1 / (1 << sh);
          const u0 = ((txl % per) + (tx - (txl << sh)) * within) / ptx, v0 = ((tyl % per) + (ty - (tyl << sh)) * within) / pty;
          return { pack: p, rect: [u0, v0, within / ptx, within / pty], level: l };
        }
      }
      return null;
    }
    // ----- tiles -----
    tileKey(L, tx, ty) { return `${L}/${tx}/${ty}`; }
    makeTile(L, tx, ty) {
      const b = GEO.tileBounds(L, tx, ty);
      const lonC = (b.lon0 + b.lon1) / 2, latC = (b.lat0 + b.lat1) / 2;
      const gx = lonC * GEO.D2R * Math.cos(latC * GEO.D2R), gy = latC * GEO.D2R; const fr = (x) => ((x % 1) + 1) % 1;
      const center = GEO.toVec(lonC, latC);
      const f = GEO.enu(lonC, latC);
      const m = new THREE.Matrix4().makeBasis(f.east, f.north, f.up);
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      // the fine texture frame: Mercator (conformal, so metre tiles stay square), base cell 1.5 m at the tile's 5-degree latitude band,
      // phase at the tile centre in double precision (whole cells mod 16 and the fraction) so neighbouring tiles agree to the centimetre
      const latR = latC * GEO.D2R, lonR = lonC * GEO.D2R; const aM = Math.PI / 4 + Math.min(Math.max(latR, -1.52), 1.52) / 2;
      const cosB = Math.max(0.1, Math.cos(Math.round(latC / 5) * 5 * GEO.D2R)); const k0 = Math.round(R_M * cosB / 1.5), kR = k0 / 32;
      const gX = lonR, gY = Math.log(Math.tan(aM)); const m16 = (v) => ((Math.floor(v) % 16) + 16) % 16;
      const rX = 0.8 * gX - 0.6 * gY, rY = 0.6 * gX + 0.8 * gY;
      const uniforms = {
        uLon0: { value: b.lon0 * GEO.D2R }, uDLon: { value: b.w * GEO.D2R }, uLat0: { value: b.lat0 * GEO.D2R }, uDLat: { value: -b.h * GEO.D2R },
        uLatC: { value: latC * GEO.D2R }, uLonC: { value: lonC * GEO.D2R }, uLevel: { value: L },
        uGeoC: { value: new THREE.Vector2(gx, gy) }, uPhaseB: { value: new THREE.Vector2(fr(gx * 50), fr(gy * 50)) }, uPhaseRot: { value: new THREE.Vector2(fr((0.83 * gx - 0.56 * gy) * 9000), fr((0.56 * gx + 0.83 * gy) * 9000)) },
        uDLon0: { value: (b.lon0 - lonC) * GEO.D2R }, uDLat0: { value: (b.lat0 - latC) * GEO.D2R }, uMercA: { value: aM }, uTanA: { value: Math.tan(aM) }, uCosA: { value: Math.cos(aM) },
        uPhF: { value: new THREE.Vector2(fr(gX * k0), fr(gY * k0)) }, uPhN: { value: new THREE.Vector2(m16(gX * k0), m16(gY * k0)) }, uPhR: { value: new THREE.Vector2(fr(rX * kR), fr(rY * kR)) }, uK0: { value: k0 }, uKR: { value: kR },
        uElev: { value: this.flatTex }, uElevRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uElevTexel: { value: new THREE.Vector2(1, 1) }, uElevMin: { value: 0 }, uElevScale: { value: 0 },
        uImg: { value: this.blankImg }, uImgRect: { value: new THREE.Vector4(0, 0, 1, 1) },
        uExag: { value: this.exag }, uSkirt: { value: Math.max(b.w, b.h) * GEO.D2R * 0.06 + 0.00002 },
      };
      Object.assign(uniforms, this.globals);
      const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, extensions: { derivatives: true }, defines: this.defines() });
      const mesh = new THREE.Mesh(this.geoms[L >= 9 ? 128 : L >= 7 ? 64 : 32], mat);
      mesh.position.copy(center); mesh.quaternion.copy(q); mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      // world-space extent
      const corners = [GEO.toVec(b.lon0, b.lat0), GEO.toVec(b.lon1, b.lat0), GEO.toVec(b.lon0, b.lat1), GEO.toVec(b.lon1, b.lat1)];
      let rad = 0; for (const c of corners) rad = Math.max(rad, c.distanceTo(center));
      const t = { key: this.tileKey(L, tx, ty), L, tx, ty, b, lonC, latC, center, mesh, uniforms, radius: rad, extent: Math.max(b.w * GEO.D2R * Math.max(Math.cos(Math.min(Math.abs(b.lat0), Math.abs(b.lat1)) * GEO.D2R), 0.02), b.h * GEO.D2R), lastUsed: 0, minH: 0, maxH: 9000, ePack: null, iPack: null, inScene: false };
      return t;
    }
    getTile(L, tx, ty) { const k = this.tileKey(L, tx, ty); let t = this.tiles.get(k); if (!t) { t = this.makeTile(L, tx, ty); this.tiles.set(k, t); } return t; }
    // generated ground textures (textures.js): every tile material recompiles with the texture arrays; new tiles get them from the start
    setTextures(T, on = true) {
      const g = this.globals; const ok = !!(T && T.ready && on && T.arrays.ground && T.arrays.landuse && g.uGround);
      if (ok) { g.uGround.value = T.arrays.ground; g.uLanduse.value = T.arrays.landuse; g.uShallows.value = (T.misc && T.misc.shallows) || this.flatTex; g.uTexMix.value = 1; }
      else if (g.uTexMix) g.uTexMix.value = 0;
      this.texDefines = ok ? { USE_TEXARR: 1 } : {}; this.textured = ok;
      for (const t of this.tiles.values()) { const m = t.mesh.material; m.defines = this.defines(); m.needsUpdate = true; }
    }
    // shader switches for every tile material: the detail array when the globals carry one, the generated ground when it has loaded
    defines() { const d = this.globals.uDet && this.globals.uDet.value; return Object.assign(d ? (d.image.depth >= 5 ? { USE_DETARR: 1, DET_SHALLOWS: 1 } : { USE_DETARR: 1 }) : {}, this.texDefines || {}); }
    // ----- per frame -----
    update(camera, viewportH) {
      this.frame++; this.queue = [];
      const cam = camera.position; const camLen = cam.length();
      this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this._m);
      const K = viewportH / (2 * Math.tan(camera.fov * 0.5 * GEO.D2R));
      const horizonAng = Math.acos(Math.min(1, 1 / camLen));
      const visible = []; const stack = [this.getTile(0, 0, 0), this.getTile(0, 1, 0)];
      let budget = 4000;
      while (stack.length && budget-- > 0) {
        const t = stack.pop();
        // bounding sphere incl. elevation
        const hMax = (t.maxH || 9000) * this.exag / R_M;
        this._sphere.center.copy(t.center).multiplyScalar(1 + hMax * 0.5); this._sphere.radius = t.radius + hMax;
        if (!this.frustum.intersectsSphere(this._sphere)) continue;
        // horizon cull
        const ang = Math.acos(Math.max(-1, Math.min(1, t.center.dot(cam) / camLen)));
        const angRad = Math.asin(Math.min(1, t.radius)) + 0.02;
        if (ang - angRad > horizonAng + Math.acos(1 / (1 + hMax)) + 0.01) continue;
        const dist = Math.max(this._sphere.center.distanceTo(cam) - this._sphere.radius, 1e-5);
        const sse = t.extent / dist * K;
        t.sse = sse;
        if (sse > this.sseThreshold && t.L < this.maxLevel) {
          const L = t.L + 1; stack.push(this.getTile(L, t.tx * 2, t.ty * 2), this.getTile(L, t.tx * 2 + 1, t.ty * 2), this.getTile(L, t.tx * 2, t.ty * 2 + 1), this.getTile(L, t.tx * 2 + 1, t.ty * 2 + 1));
        } else visible.push(t);
      }
      // adapt threshold to keep tile count sane
      if (visible.length > this.maxTiles) this.sseThreshold = Math.min(900, this.sseThreshold * 1.08); else if (visible.length < this.maxTiles * 0.5 && this.sseThreshold > 360) this.sseThreshold = Math.max(360, this.sseThreshold * 0.97);
      // release users
      for (const p of this.packs.values()) p.users = 0;
      // bind packs + scene membership
      const now = this.frame; const seen = new Set();
      for (const t of visible) {
        seen.add(t.key); t.lastUsed = now;
        const pri = t.sse;
        const eb = this.bindPack('e', t.L, t.tx, t.ty, pri);
        const ib = this.bindPack('i', t.L, t.tx, t.ty, pri);
        const u = t.uniforms;
        if (eb) {
          if (eb.absent) { u.uElev.value = this.flatTex; u.uElevMin.value = 0; u.uElevScale.value = 0; u.uElevRect.value.set(0, 0, 1, 1); u.uElevTexel.value.set(1, 1); t.minH = 0; t.maxH = 0; }
          else { const p = eb.pack; p.users++; u.uElev.value = p.texture; u.uElevMin.value = p.min; u.uElevScale.value = p.scale; u.uElevRect.value.set(eb.rect[0], eb.rect[1], eb.rect[2], eb.rect[3]); u.uElevTexel.value.set(1 / p.w, 1 / p.h); t.minH = Math.max(0, p.min); t.maxH = Math.max(0, p.min + 255 * p.scale); }
          t.ePack = eb;
        }
        if (ib) { const p = ib.pack; if (!ib.absent) { p.users++; u.uImg.value = p.texture; u.uImgRect.value.set(ib.rect[0], ib.rect[1], ib.rect[2], ib.rect[3]); } t.iPack = ib; }
        if (!t.inScene) { this.group.add(t.mesh); t.inScene = true; }
      }
      // remove tiles not visible; dispose stale
      for (const [k, t] of this.tiles) {
        if (!seen.has(k)) {
          if (t.inScene) { this.group.remove(t.mesh); t.inScene = false; }
          if (now - t.lastUsed > 600 && t.L > 2) { t.mesh.material.dispose(); this.tiles.delete(k); }
        }
      }
      this.visible = visible;
      // a version for everything that stands on the drawn surface: bumps when the set of drawn tiles or their elevation packs change
      { let sig = ''; for (const t of visible) sig += t.key + (t.ePack ? (t.ePack.absent ? 'a' : t.ePack.level) : '-') + ';'; if (sig !== this.meshSig) { this.meshSig = sig; this.meshVersion = (this.meshVersion || 0) + 1; } }
      const hist = {}; for (const t of visible) { const l = t.ePack ? (t.ePack.absent ? 'sea' : t.ePack.level) : '-'; hist[l] = (hist[l] || 0) + 1; } this.stats.elevLevels = hist;
      this.pumpQueue();
      if (now % 30 === 0) this.evictPacks();
      let pi = 0, pe = 0; for (const p of this.packs.values()) if (p.state === 'ready') { if (p.kind === 'i') pi++; else pe++; }
      this.stats.tiles = visible.length; this.stats.packsI = pi; this.stats.packsE = pe; this.stats.loading = this.loading; this.stats.sse = this.sseThreshold;
    }
    // ----- height queries (CPU) -----
    heightAt(lon, lat, wantLevel) {
      const per = this.index.elev.packTiles;
      let best = null, bestL = -1;
      const top = wantLevel !== undefined ? wantLevel : 7;
      for (let l = Math.min(top, 7); l >= 0; l--) {
        const [tx, ty] = GEO.tileAt(l, lon, lat);
        if (l === 7 && !this.l7.has(`${tx >> 2}/${ty >> 2}`)) continue;
        if (l === 6 && !this.l6.has(`${tx >> 2}/${ty >> 2}`)) continue;
        const px = Math.floor(tx / per), py = Math.floor(ty / per);
        const p = this.packs.get(`e${l}/${px}/${py}`);
        if (!p) continue;
        if (p.state === 'absent') return 0;
        if (p.state === 'ready') { best = p; bestL = l; break; }
      }
      if (!best) return 0;
      const l = bestL; const tilesX = 2 << l, tilesY = 1 << l;
      const px = Math.floor(GEO.tileAt(l, lon, lat)[0] / per), py = Math.floor(GEO.tileAt(l, lon, lat)[1] / per);
      const ptx = Math.min(per, tilesX - px * per), pty = Math.min(per, tilesY - py * per);
      // pack covers lon range
      const lonW = 360 / tilesX * ptx, latH = 180 / tilesY * pty;
      const lon0 = -180 + px * per * 360 / tilesX, lat0 = 90 - py * per * 180 / tilesY;
      const fx = ((lon - lon0) / lonW) * best.w - 0.5, fy = ((lat0 - lat) / latH) * best.h - 0.5;
      const x0 = Math.max(0, Math.min(best.w - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(best.h - 2, Math.floor(fy)));
      const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0));
      const d = best.data, w = best.w;
      const v = (d[y0 * w + x0] * (1 - ax) + d[y0 * w + x0 + 1] * ax) * (1 - ay) + (d[(y0 + 1) * w + x0] * (1 - ax) + d[(y0 + 1) * w + x0 + 1] * ax) * ay;
      const h0 = Math.max(0, best.min + v * best.scale);
      return h0 > 1 ? h0 + this.dispAt(lon, lat, h0, bestL) : h0;
    }
    // CPU twin of the vertex-shader micro-relief (so trees and buildings sit on the displaced ground)
    dispAt(lon, lat, h0, level) {
      const n = this.noiseData; if (!n || !this.dispOn) return 0;
      const rad = GEO.D2R; const cl = Math.cos(lat * rad);
      const gx = lon * rad * cl, gy = lat * rad;
      // the GPU texture is uploaded with flipY, so v runs from the bottom row of the image
      const samp = (u, v, ch) => { const w = n.width, hh = n.height; u -= Math.floor(u); v = 1 - (v - Math.floor(v)); const fx = u * w - 0.5, fy = v * hh - 0.5; let x0 = Math.floor(fx), y0 = Math.floor(fy); const ax = fx - x0, ay = fy - y0; const X0 = ((x0 % w) + w) % w, X1 = (X0 + 1) % w, Y0 = ((y0 % hh) + hh) % hh, Y1 = (Y0 + 1) % hh; const d = n.data; return ((d[(Y0 * w + X0) * 4 + ch] * (1 - ax) + d[(Y0 * w + X1) * 4 + ch] * ax) * (1 - ay) + (d[(Y1 * w + X0) * 4 + ch] * (1 - ax) + d[(Y1 * w + X1) * 4 + ch] * ax) * ay) / 255; };
      // slope from the raw heightmap (two neighbours ~600 m apart)
      const dm = 0.004; const hx = this.rawHeight(lon + dm / Math.max(cl, 0.02), lat, level) - this.rawHeight(lon - dm / Math.max(cl, 0.02), lat, level);
      const hy = this.rawHeight(lon, lat + dm, level) - this.rawHeight(lon, lat - dm, level);
      const dist = 2 * dm * rad * R_M; const dhx = hx / dist, dhy = hy / dist;
      const sl = 1 - 1 / Math.sqrt(1 + (dhx * dhx + dhy * dhy) * this.exag * this.exag);
      const t = Math.min(1, Math.max(0, (sl - 0.05) / 0.3)); const st = t * t * (3 - 2 * t);
      const n1 = samp(gx * 1500, gy * 1500, 0) - 0.5, n2 = samp(gx * 9000, gy * 9000, 1) - 0.5, amp = 0.55 + 0.9 * samp(gx * 150, gy * 150, 0);
      return (n1 * 90 * (0.08 + st) + n2 * 9 * (0.08 + 1.2 * st)) * amp;
    }
    rawHeight(lon, lat, level) { const d = this.dispOn; this.dispOn = false; const h = this.heightAt(lon, lat, level); this.dispOn = d; return h; }
    // ----- the drawn surface, replicated on the CPU -----
    // Exactly what the vertex shader computes for the tile currently drawn at lon/lat: its bound elevation pack
    // sampled through the same rect, the same slope estimate and the same micro-relief noise, then the same
    // triangle interpolation. Buildings, trees and people stand on this, so they meet the ground the eye sees.
    tileAtPoint(lon, lat) {
      let best = null;
      for (const t of this.visible) { if (best && t.L <= best.L) continue; const b = GEO.tileBounds(t.L, t.tx, t.ty); if (lon >= b.lon0 && lon < b.lon1 && lat <= b.lat0 && lat > b.lat1) best = t; }
      return best;
    }
    gpuVertexH(t, u, v) {
      const U = t.uniforms; const eb = t.ePack; if (!eb || eb.absent || !eb.pack || !eb.pack.data) return 0;
      const p = eb.pack; const R = U.uElevRect.value; const TX = U.uElevTexel.value;
      const samp = (uu, vv) => { let fx = uu * p.w - 0.5, fy = vv * p.h - 0.5; const x0 = Math.max(0, Math.min(p.w - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(p.h - 2, Math.floor(fy))); const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0)); const d = p.data, w = p.w; return (d[y0 * w + x0] * (1 - ax) + d[y0 * w + x0 + 1] * ax) * (1 - ay) + (d[(y0 + 1) * w + x0] * (1 - ax) + d[(y0 + 1) * w + x0 + 1] * ax) * ay; };
      const hAt = (uu, vv) => Math.max(U.uElevMin.value + samp(R.x + uu * R.z, R.y + vv * R.w) * U.uElevScale.value, 0);
      let h = hAt(u, v);
      const camAlt = this.globals.uCamAlt.value; const q = this.globals.uQuality.value;
      const t1 = Math.min(1, Math.max(0, (camAlt - 0.06) / (0.004 - 0.06))); const dispOn = t1 * t1 * (3 - 2 * t1) * (q > 0.5 ? 1 : 0);
      if (h > 1 && dispOn > 0.001 && this.noiseData) {
        const b = GEO.tileBounds(t.L, t.tx, t.ty); const lonR = (b.lon0 + u * b.w) * GEO.D2R, latR = (b.lat0 - v * b.h) * GEO.D2R;
        const cl0 = Math.cos(latR); const geo = U.uGeoC.value, ph = U.uPhaseB.value; const glx = lonR * cl0 - geo.x, gly = latR - geo.y;
        const tux = TX.x * 1.6 / R.z, tuy = TX.y * 1.6 / R.w; const dLon = Math.abs(U.uDLon.value), dLat = Math.abs(U.uDLat.value);
        const dhx = (hAt(u + tux, v) - hAt(u - tux, v)) / (2 * tux * dLon * R_M * Math.max(cl0, 0.02));
        const dhy = (hAt(u, v - tuy) - hAt(u, v + tuy)) / (2 * tuy * dLat * R_M);
        const sl = 1 - 1 / Math.sqrt(1 + (dhx * dhx + dhy * dhy) * this.exag * this.exag);
        const tt = Math.min(1, Math.max(0, (sl - 0.05) / 0.3)); const st = tt * tt * (3 - 2 * tt);
        const n = this.noiseData; const fr = (x) => x - Math.floor(x);
        const nz = (cx, cy, ch) => { const w = n.width, hh = n.height; const ux = fr(cx), vy = 1 - fr(cy); const fx = ux * w - 0.5, fy = vy * hh - 0.5; let x0 = Math.floor(fx), y0 = Math.floor(fy); const ax = fx - x0, ay = fy - y0; const X0 = ((x0 % w) + w) % w, X1 = (X0 + 1) % w, Y0 = ((y0 % hh) + hh) % hh, Y1 = (Y0 + 1) % hh; const d = n.data; return ((d[(Y0 * w + X0) * 4 + ch] * (1 - ax) + d[(Y0 * w + X1) * 4 + ch] * ax) * (1 - ay) + (d[(Y1 * w + X0) * 4 + ch] * (1 - ax) + d[(Y1 * w + X1) * 4 + ch] * ax) * ay) / 255; };
        const n1 = nz(fr(ph.x * 30) + glx * 1500, fr(ph.y * 30) + gly * 1500, 0) - 0.5, n2 = nz(fr(ph.x * 180) + glx * 9000, fr(ph.y * 180) + gly * 9000, 1) - 0.5;
        const amp = 0.55 + 0.9 * nz(fr(ph.x * 3) + glx * 150, fr(ph.y * 3) + gly * 150, 0);
        h += (n1 * 90 * (0.08 + st) + n2 * 9 * (0.08 + 1.2 * st)) * amp * dispOn; h = Math.max(h, 0.5);
      }
      return h;
    }
    gpuHeightAt(lon, lat, vcache) {
      const t = this.tileAtPoint(lon, lat); if (!t) return this.meshHeightAt0(lon, lat, vcache);
      const b = GEO.tileBounds(t.L, t.tx, t.ty); const G = t.L >= 9 ? 128 : t.L >= 7 ? 64 : 32;
      const fx = (lon - b.lon0) / b.w * G, fy = (b.lat0 - lat) / b.h * G; const i = Math.min(G - 1, Math.max(0, Math.floor(fx))), j = Math.min(G - 1, Math.max(0, Math.floor(fy))); const fu = fx - i, fv = fy - j;
      const vh = (ii, jj) => { const key = t.key + ':' + ii + ':' + jj; if (vcache && vcache.has(key)) return vcache.get(key); const h = this.gpuVertexH(t, ii / G, jj / G); if (vcache) vcache.set(key, h); return h; };
      const ha = vh(i, j), hb = vh(i + 1, j), hc = vh(i, j + 1), hd = vh(i + 1, j + 1);
      return fu + fv <= 1 ? ha + (hb - ha) * fu + (hc - ha) * fv : hd + (hc - hd) * (1 - fu) + (hb - hd) * (1 - fv);
    }
    meshHeightAt(lon, lat, vcache) { return this.gpuHeightAt(lon, lat, vcache); }
    // fallback when no drawn tile covers the point yet: the finest grid, analytically
    meshHeightAt0(lon, lat, vcache) {
      const sp = 360 / (2 << this.maxLevel) / 128;
      const fx = (lon + 180) / sp, fy = (90 - lat) / sp; const i = Math.floor(fx), j = Math.floor(fy); const fu = fx - i, fv = fy - j;
      const vh = (ii, jj) => { const key = ii * 1048576 + jj; if (vcache && vcache.has(key)) return vcache.get(key); const h0 = this.heightAt(-180 + ii * sp, 90 - jj * sp); const h = h0 > 1 ? Math.max(h0, 0.5) : h0; if (vcache) vcache.set(key, h); return h; };
      const ha = vh(i, j), hb = vh(i + 1, j), hc = vh(i, j + 1), hd = vh(i + 1, j + 1);
      return fu + fv <= 1 ? ha + (hb - ha) * fu + (hc - ha) * fv : hd + (hc - hd) * (1 - fu) + (hb - hd) * (1 - fv);
    }
    // water as the shader draws it: imagery alpha (land 1, river 0.75, lake 0.5, sea 0) at the finest imagery level; -1 if unknown yet
    waterAlpha(lon, lat) {
      const l = this.imgMax; const per = this.index.img.packTiles; const [tx, ty] = GEO.tileAt(l, lon, lat);
      const px = Math.floor(tx / per), py = Math.floor(ty / per); const p = this.packs.get(`i${l}/${px}/${py}`);
      if (!p || p.state !== 'ready' || !p.alpha) return -1;
      const tilesX = 2 << l, tilesY = 1 << l; const ptx = Math.min(per, tilesX - px * per), pty = Math.min(per, tilesY - py * per);
      const lonW = 360 / tilesX * ptx, latH = 180 / tilesY * pty; const lon0 = -180 + px * per * 360 / tilesX, lat0 = 90 - py * per * 180 / tilesY;
      const fx = ((lon - lon0) / lonW) * p.w - 0.5, fy = ((lat0 - lat) / latH) * p.h - 0.5;
      const x0 = Math.max(0, Math.min(p.w - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(p.h - 2, Math.floor(fy)));
      const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0)); const d = p.alpha, w = p.w;
      return ((d[y0 * w + x0] * (1 - ax) + d[y0 * w + x0 + 1] * ax) * (1 - ay) + (d[(y0 + 1) * w + x0] * (1 - ax) + d[(y0 + 1) * w + x0 + 1] * ax) * ay) / 255;
    }
    isWater(lon, lat) { const a = this.waterAlpha(lon, lat); return a >= 0 ? a < 0.62 : this.heightAt(lon, lat) < 0.5; }
    // radius (units) of the rendered surface at lon/lat
    surfaceRadius(lon, lat) { return 1 + this.heightAt(lon, lat) * this.exag / R_M; }
    // ray-march pick against the rendered terrain. ray: THREE.Ray (world). returns {lon, lat, h, point} or null
    pick(ray) {
      const o = ray.origin, d = ray.direction; const maxR = 1 + 9000 * this.exag / R_M;
      // sphere intersection with maxR
      const b = o.dot(d), c = o.dot(o) - maxR * maxR; const disc = b * b - c; if (disc < 0) return null;
      const t0 = Math.max(0, -b - Math.sqrt(disc)), t1 = -b + Math.sqrt(disc);
      const p = new THREE.Vector3();
      const f = (t) => { p.copy(o).addScaledVector(d, t); const [lon, lat] = GEO.fromVec(p); return p.length() - this.surfaceRadius(lon, lat); };
      let tPrev = t0, fPrev = f(t0); if (fPrev < 0) { const [lon, lat] = GEO.fromVec(p); return { lon, lat, h: this.heightAt(lon, lat), point: p.clone(), t: t0 }; }
      const steps = 96; const span = t1 - t0;
      // adaptive: step finer when close to the surface
      let t = t0;
      for (let i = 1; i <= steps; i++) {
        const step = Math.max(span / steps, Math.min(fPrev * 0.9, span / 8));
        t = Math.min(t1, tPrev + step);
        const ft = f(t);
        if (ft <= 0) { // refine by bisection
          let a = tPrev, bb = t;
          for (let k = 0; k < 18; k++) { const m = (a + bb) / 2; if (f(m) <= 0) bb = m; else a = m; }
          p.copy(o).addScaledVector(d, bb); const [lon, lat] = GEO.fromVec(p);
          return { lon, lat, h: this.heightAt(lon, lat), point: p.clone(), t: bb };
        }
        tPrev = t; fPrev = ft; if (t >= t1) break;
      }
      return null;
    }
  }
  window.TERRAIN = { Terrain, TILE };
})();
