// GENESIS streamed terrain: quadtree of equirectangular tiles, imagery + elevation packs loaded on demand.
// Classic script; exposes window.TERRAIN.
(function () {
  const TILE = 512, GRID = 32;
  const R_M = 6371000;

  const GRID_CH = { 8: '!', 16: ':', 32: '.', 64: ',', 128: ';' };      // (a tile's mesh, in the signature of the drawn surface)
  // how much of the ground's small relief there is, by the water mask of the picture of the Earth (1 land, 0.75 a river's band, 0.5 a lake)
  const WET = (a) => { const t = Math.min(1, Math.max(0, (a - 0.66) / 0.3)); return t * t * (3 - 2 * t); };
  // the code of the water's edge (tools/water/build.py writes it into data/w/index.json; a pack made otherwise is not read)
  const WCODE = { step: 16, near: 480, deep: 3600, quad: 1.55, land: 158, knee: 98, water: 58 };
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

  // a texel of the water's edge to metres from the shore, water negative (tools/water/build.py has the code, wDecF below is its twin here)
  const WLEV = { max: 6000, pow: 1.5 };      // a lake's level from its byte (tools/water/build.py: LEVEL_MAX, LEVEL_POW)
  const wLevF = (b) => WLEV.max * Math.pow(Math.max(b, 0) / 255, WLEV.pow);
  // The three bytes of a texel of the water's edge, read in both shaders: wDec, the distance in metres (land positive; times the
  // level's scale); wKO, what water (0 the sea .. 1 fresh) in the upper four bits and how open it lies (0..1) in the lower;
  // wLev, how high the nearest fresh water stands, metres.
  const WDEC = `float wDec(float v) { float c = v * 255.0, u = max(${WCODE.knee.toFixed(1)} - c, 0.0); return c >= ${WCODE.knee.toFixed(1)} ? (min(c, ${WCODE.land.toFixed(1)}) - 128.0) * ${WCODE.step.toFixed(1)} : -(${WCODE.near.toFixed(1)} + ${WCODE.step.toFixed(1)} * u + ${WCODE.quad.toFixed(4)} * u * u); }
    vec2 wKO(float g) { float b = floor(g * 255.0 + 0.5), k = floor(b / 16.0); return vec2(k, b - k * 16.0) / 15.0; }
    float wLev(float b) { return ${WLEV.max.toFixed(1)} * pow(max(b, 0.0), ${WLEV.pow.toFixed(2)}); }`;
  const wDecF = (c) => { const u = Math.max(WCODE.knee - c, 0); return c >= WCODE.knee ? (Math.min(c, WCODE.land) - 128) * WCODE.step : -(WCODE.near + WCODE.step * u + WCODE.quad * u * u); };
  const sm01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // Where the field of the water's edge is here, the ground's corners go by it. The sea lies at nought, a lake at its level, and
  // the land comes up out of the water over SHORE_RISE metres (the heights have a coast of their own, a texel or two from the true one: a strip of sea lay
  // tilted up a hillside, and a strip of land flat at the sea's level); and the ground's small relief begins at the water's edge
  // and has its full height WET_RISE metres inland (still water lies level). The vertex shader and the CPU's twins of it.
  const SHORE_RISE = 220, WET_RISE = 90;
  // And the rise begins a little inland, not at the water's edge: a triangle of the mesh that has one corner in the water must
  // lie flat, or the water in it climbs toward the corner on land (the sea stood up the shore like a wave about to break). So the
  // ground keeps to the water's level for a quad and a half of the tile's mesh as it is at the moment (uShoreQ, metres), and never
  // for less than SHORE_FLAT: the mesh asks the field between four texels, the picture among sixteen and roughened, and the two
  // lines lie that far apart.
  const SHORE_FLAT = 60;
  // the air between the eye and the ground (air.js), worked out at the corners of the mesh: it changes slowly, and the mesh is fine where the eye is near
  const AIR_V = window.AIR ? AIR.VERT : '\n    varying vec3 vAirT, vAirL; void air(vec3 p, float n, out vec3 T, out vec3 L) { T = vec3(1.0); L = vec3(0.0); }', AIR_F = window.AIR ? AIR.FRAG : '\n    varying vec3 vAirT, vAirL; vec3 airOver(vec3 c, vec3 T, vec3 L) { return c; }', AIR_N = window.AIR ? AIR.LAND : '4.0';
  const VERT = `
    uniform float uLon0, uDLon, uLat0, uDLat, uLatC, uLonC; uniform vec2 uGeoC, uPhaseB;
    uniform float uDLon0, uDLat0, uMercA, uTanA, uCosA;   // tile-centre-relative offsets and the Mercator terms for the fine (metre-scale) texture frame
    uniform sampler2D uElev, uNoise, uImg, uWater; uniform vec4 uElevRect, uImgRect, uWaterRect, uWaterP; uniform vec2 uElevTexel; uniform float uElevMin, uElevScale, uExag, uSkirt, uCamAlt, uQuality, uShoreQ, uWaterL;
    varying vec2 vUV, vGL, vGLf;
    ${WDEC} varying float vLon, vLat, vH; varying vec3 vUnit; varying vec3 vViewPos; varying mat3 vNM;
    ${AIR_V}
    const float R_MV = ${R_M.toFixed(1)};
    float hAtV(vec2 uv) { return max(uElevMin + texture2D(uElev, uElevRect.xy + uv * uElevRect.zw).r * 255.0 * uElevScale, 0.0); }
    void main() {
      vNM = normalMatrix;
      float u = position.x, v = position.y;
      float lon = uLon0 + u * uDLon; float lat = uLat0 + v * uDLat;
      float ev = texture2D(uElev, uElevRect.xy + vec2(u, v) * uElevRect.zw).r;
      float h = max(uElevMin + ev * 255.0 * uElevScale, 0.0);
      // (the water's edge, where the field of it is here: how far inland this corner lies, and what water lies off it)
      float wdv = 1e4, wkv = 0.0, wlv = h;      // (how far to the water's edge, what water it is, how high it stands: its own ground where that is not known)
      if (uWaterP.x > 1.5) { wdv = uWaterP.z; wkv = uWaterP.w; }
      else if (uWaterP.x > 0.5) { vec2 wc = uWaterRect.xy + vec2(u, v) * uWaterRect.zw, wsz = vec2(textureSize(uWater, 0)); vec3 wt = texture2D(uWater, wc).rgb; wdv = wDec(wt.r) * uWaterP.y; if (uWaterL > 0.5) wlv = wLev(wt.b); wkv = wKO(texelFetch(uWater, ivec2(clamp(floor(wc * wsz), vec2(0.0), wsz - 1.0)), 0).g).x; }      // (the distance and the level weighed between texels by the card; what water it is from the nearest texel: its byte holds two things)
      // The sea lies at nought and a lake at its level, and the ground comes up from the water's own level, a little way in
      // from the shore (SHORE_FLAT, uShoreQ). Where the packs carry no levels a lake lies as the heights have it.
      // (not for fresh water where the tile's lakes are smaller than its quads, uWaterP.z: see update())
      if (uWaterP.x > 0.5 && !(uWaterP.x < 1.5 && uWaterP.z > 0.5 && wkv > 0.5)) h = mix(wlv * wkv, h, smoothstep(uShoreQ, uShoreQ + ${SHORE_RISE.toFixed(1)}, wdv));
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
        // Still water lies level: the small relief ends where the picture of the Earth has water, and the shore runs down
        // to it. (A lake heaved as the land is was a sheet of bumps, ten metres up and down, under a flat picture of
        // water. WET in the height queries below is the same.)
        float wet = uWaterP.x > 0.5 ? smoothstep(uShoreQ, uShoreQ + ${WET_RISE.toFixed(1)}, wdv) : smoothstep(0.66, 0.96, texture2D(uImg, uImgRect.xy + vec2(u, v) * uImgRect.zw).a);
        h += (n1 * 90.0 * (0.08 + st) + n2 * 9.0 * (0.08 + 1.2 * st)) * amp * dispOn * wet;
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
      vec4 mvTop = modelViewMatrix * vec4(local, 1.0);      // (where the ground itself is: a skirt's lower edge hangs far below it, and has the ground's air, not that of the deep)
      if (position.z > 0.5) local -= unitv * uSkirt;
      vUV = vec2(u, v); vLon = lon; vLat = lat; vUnit = unitv; vGL = vec2(lon * cl - uGeoC.x, lat - uGeoC.y);
      // precise Mercator offset from the tile centre (everything here is small, so float32 keeps centimetres): x = dlon, y = ln(tan(a+d)/tan(a))
      { float dl = uDLon0 + u * uDLon, dla = uDLat0 + v * uDLat; float dd = dla * 0.5; float td = sin(dd) / max(cos(uMercA + dd) * uCosA, 1e-4); vGLf = vec2(dl, log(max(1.0 + td / uTanA, 1e-4))); }
      vec4 mv = position.z > 0.5 ? modelViewMatrix * vec4(local, 1.0) : mvTop;
      vViewPos = mv.xyz;
      air(mvTop.xyz, ${AIR_N}, vAirT, vAirL);
      gl_Position = projectionMatrix * mv;
    }`;

  const FRAG = `
    precision highp float;
    uniform sampler2D uElev; uniform vec4 uElevRect; uniform vec2 uElevTexel; uniform float uElevMin, uElevScale, uExag;
    uniform sampler2D uImg; uniform vec4 uImgRect; uniform vec2 uImgK;
    uniform vec4 uWaterK;      // (x: how ragged the shore; y, z, w: to try things by)
    // The sky as still water would mirror it: its light at five heights above the horizon (the root of the height's sine: 0, a
    // quarter .. 1) toward the sun, across and away from it, worked out once a frame where the camera stands (main.js: skyMirror).
    uniform float uWild;      // (how far the country nobody farms is given back the colours it had before the plough: 1 wholly, 0 the photograph as it is)
    uniform vec3 uSkyR[15]; uniform vec4 uSeaK;      // (uSeaK: x how high the waves run, y how much surf, z how clear the water; w to ask what things cost: 1 no waves, 2 no waves and nothing mirrored)
    vec3 skyAt(float sinE, float cosAz) {
      float x = sqrt(clamp(sinE, 0.0, 1.0)) * 4.0, i = min(floor(x), 3.0); int k = int(i) * 3;
      vec3 lo = cosAz >= 0.0 ? mix(uSkyR[k + 1], uSkyR[k], cosAz) : mix(uSkyR[k + 1], uSkyR[k + 2], -cosAz);
      vec3 hi = cosAz >= 0.0 ? mix(uSkyR[k + 4], uSkyR[k + 3], cosAz) : mix(uSkyR[k + 4], uSkyR[k + 5], -cosAz);
      return mix(lo, hi, x - i);
    }
    uniform sampler2D uWater; uniform vec4 uWaterRect, uWaterP;      // the water's edge (data/w): P = 0 the picture's map, 1 a pack, 2 no shore near; the level's scale; for 2 the distance and the kind
    uniform float uDLon, uDLat, uLevel;
    uniform vec3 uSun; uniform float uTime, uCamAlt, uDayMix; uniform vec4 uSeason; uniform vec4 uBare; uniform vec2 uIceCold;   // winter N, autumn N, winter S, autumn S (0..1); leaves down N, S, the cold of the year N, S
    uniform sampler2D uOwner, uPal, uSim, uNoise;
    // (the planet's own maps travel as one texture of two layers where they could be made one: info.png, and what grows there by
    //  nature - the map the trees are planted by)
    #ifdef INFO2
    precision highp sampler2DArray;
    uniform sampler2DArray uInfo;
    #else
    uniform sampler2D uInfo;
    #endif
    // the four photographic detail textures (forest, dunes, rock, grass) travel as one array where the GPU has arrays:
    // Apple's GPUs allow a fragment shader 16 textures, and this one needs every unit it can spare
    #ifndef USE_GROUND
    #ifdef USE_DETARR
    precision highp sampler2DArray;
    uniform sampler2DArray uDet;
    #else
    uniform sampler2D uDetA, uDetB, uDetC, uDetD;
    #endif
    #endif
    uniform vec2 uSimRes, uSel, uHover; uniform float uFertView, uPolitical, uLens, uLabelsOn;
    uniform sampler2D uClouds; uniform float uCloudShift, uCloudVis; uniform vec2 uPhaseB, uPhaseRot;
    uniform sampler2D uDecal, uDecal2, uWaterN; uniform vec4 uDecalRect; uniform float uDecalOn, uQuality, uGlow;      // uGlow: 1 where the picture can hold light brighter than white (post.js lets it bleed), else 0
    varying vec2 vUV, vGL, vGLf; varying float vLon, vLat, vH; varying vec3 vUnit; varying vec3 vViewPos; varying mat3 vNM;
    const float PI = 3.14159265;
    ${window.SHADOWS ? SHADOWS.GLSL : 'float sunHidden(vec3 p) { return 0.0; }'}
    ${AIR_F}
    #ifdef USE_TEXARR
    // generated ground and land-use tiles (textures.js), sampled in a metric Mercator frame: a phase computed in double precision
    // at the tile centre (uPhN whole cells mod 16, uPhF the fraction) plus the precise local offset vGLf, in base cells of 1.5 m
    precision highp sampler2DArray;
    uniform sampler2DArray uLanduse; uniform float uTexMix;
    #ifdef USE_GROUND
    uniform sampler2DArray uGnd, uGndN; uniform vec2 uLadN, uLadF; uniform float uLadK, uGndShal, uGndFar[24], uGndFarN; uniform vec2 uGndFarD[24]; uniform vec3 uGndMean[25]; uniform vec4 uGndK, uGndT; uniform float uGndShow, uGndV, uGndDbg, uGndCls[24]; uniform vec3 uGndFine;
    #else
    uniform sampler2DArray uGround;
    #ifndef DET_SHALLOWS
    uniform sampler2D uShallows;
    #endif
    #endif
    uniform vec2 uPhF, uPhN, uPhR; uniform float uK0, uKR;
    vec2 gcf(float n) { return (uPhN + uPhF + vGLf * uK0) / n; }
    vec2 gcr() { return uPhR + (mat2(0.8, 0.6, -0.6, 0.8) * vGLf) * uKR; }
    vec3 gtex(sampler2DArray T, float L, float n) { return texture(T, vec3(gcf(n), L)).rgb; }
    vec3 gtexS(sampler2DArray T, float L, float n, float swap) { vec2 c = gcf(n); c = mix(c, c.yx, swap); return texture(T, vec3(c, L)).rgb; }
    #endif
    float hAt(vec2 uv) { return max(uElevMin + texture2D(uElev, uElevRect.xy + uv * uElevRect.zw).r * 255.0 * uElevScale, 0.0); }
    vec4 noise2(vec2 p) { return texture2D(uNoise, p); }
    ${WDEC}
    #ifdef USE_GROUND
    // ---------- the ground's materials (textures.js: scans of real ground with their relief and heights), laid at a ladder of sizes ----------
    // A material repeats every twelve metres, every twenty-four, and so on, doubling, up to two hundred kilometres; a pixel is given
    // the two sizes that suit how much ground it covers. So there is ground to look at from every height (a meadow from a mile up
    // is the same picture as the grass at one's feet, laid out larger: ground looks much alike at every scale), a repeat is never
    // more than a few hundred pixels across and never fewer, and nothing is ever magnified into mush. The frame is the Mercator one
    // of the land-use tiles without their bands: whole cells at the tile's centre (uLadN, exact) plus the fraction plus the precise
    // offset from the centre.
    // The steps are held in two places, the even ones in one and the odd ones in the other: as the eye draws back each place
    // changes its step only while the other has the whole of the picture, so where anything of a place shows, the place the
    // material is looked up at runs on without a break from pixel to pixel. That is what lets the card work out for itself how
    // large a pixel is in the material (an ordinary lookup), and need not be told for every one.
    // (uGndDbg leaves parts of this out, to measure what they cost: 1 no relief, 2 nor a second material, 3 nor any colour looked
    //  up, 4 nor the noise that bends the ladder, 5 nothing of it at all. __T.costsGround in tools/testcam.js goes through them.)
    // Two ladders. What a scan shows has a size: a blade of grass, a stone, a face of rock. Laid at the same size on the screen
    // (a repeat some 600 pixels across), grass is drawn with blades as long as a barn where rock looks like rock. So the fine
    // kinds (uGndCls: scans of a metre or two of ground: grass, pebbles, scree, cracked mud; the others are taken from the air)
    // stand lower on the ladder than the coarse ones: a little lower while the eye is near (up to the fifth step, a farm
    // filling the window: the blades can be seen, and stand as tall against a barn as hay does), and more the further it draws
    // back, up to two steps and a quarter (uGndFine: the least, how fast it grows, the most): from a mile up a meadow is a
    // grain, not a picture of grass. Not lower than that: a repeat under a hundred and fifty pixels across is seen as a row of
    // repeats, whatever is done to hide it. (c: 0 the coarse ladder, 1 the fine.)
    float gMixC[2], gLvC[2], gRelC[2], gFarOn, gDistM, gFk, gFarLow, gFar2, gFarPx, gToneL, gToneH; vec2 gUaC[2], gUbC[2], gUf, gUg, gLoc, gDx, gDy; vec3 gToneB, gToneG;
    // One step: where a material is looked up for it, and the step's share of the noise (for the ragged edge between two steps).
    // The repeats are bent a little, slowly, so that they do not stand in rows; each step is moved, and the odd ones laid the other
    // way round, so that no two of them fall on top of each other. The bend comes from the noise of the place that the shader has
    // looked up already (n: the one of the four whose grain is a few repeats of this step long; three lookups a pixel less than a
    // noise of the step's own), by as much as keeps the bend as steep whatever the two sizes are to each other (uGndK.z: how steep).
    void ladStep(float j, float odd, vec4 nF, vec4 nC, vec4 nD, vec4 nA, float cl, out vec2 uv, out float pick) {
      float inv = exp2(-j) * 0.125; vec4 n; float per;      // (inv: one over the cells to a repeat, 8 times 2 to the j; per: the noise's grain in metres)
      // (the noise is the one at least fourteen repeats long: with a shorter one its fine grain wriggles inside a repeat, and what
      //  the scan shows is drawn out into streaks. The top steps have no noise that long, and are bent the less for it.)
      if (j < 0.5) { n = nF; per = 159.3; } else if (j < 2.5) { n = nC; per = 707.9; } else if (j < 5.5) { n = nD; per = 5309.0; } else { n = nA; per = 42473.0; }
      vec3 w = uGndDbg < 3.5 ? n.rgb - vec3(0.5, 0.5, 0.43) : vec3(0.0);
      float rat = per * inv / (12.0 * cl), short_ = min(rat / 1.7, 1.0);      // (rat: an eighth of how many repeats the noise is long)
      vec2 p = fract(uLadN * inv) + (uLadF + gLoc) * inv + w.rg * (uGndK.z * rat * short_ * short_) + j * vec2(0.618, 0.382);
      pick = w.r * 2.2 + w.b * 0.9; uv = odd > 0.5 ? p.yx : p;
    }
    // one ladder at level l (0..14): its two places, how much of the odd one, and how much a scan's relief counts there
    void ladAt(int c, float l, vec4 nF, vec4 nC, vec4 nD, vec4 nA, float cl) {
      float fl = min(floor(l), 13.0), f = l - fl, h2 = floor(fl * 0.5); bool lowE = fl - 2.0 * h2 < 0.5; float pE, pO, jE = 2.0 * h2 + (lowE ? 0.0 : 2.0), jO = 2.0 * h2 + 1.0;      // (the lower of the two steps is the even one)
      ladStep(jE, 0.0, nF, nC, nD, nA, cl, gUaC[c], pE); ladStep(jO, 1.0, nF, nC, nD, nA, cl, gUbC[c], pO);
      // Between two steps the one gives way to the other: at either end of the span it is all one step, and in the middle they lie
      // over each other, here more of the one and there of the other, in stretches a repeat or so across (uGndT.w: how ragged;
      // a row of the same stones into the distance is what gives a repeat away, and here every other stretch has them at another
      // size and the other way round). uGndT.z is how wide the giving way is: narrow (0.1), the ground is a patchwork of the
      // two; wide (0.25 and more), all of it changes slowly together. It must stay under 0.5: at a whole step nothing of the
      // other may be left, or the break in the place that changes there would show.
      float m = smoothstep(-uGndT.z, uGndT.z, f - 0.5 + (lowE ? pO : pE) * uGndT.w * f * (1.0 - f));
      gMixC[c] = lowE ? m : 1.0 - m; float lv = fl + m; gLvC[c] = lv;      // (the share of the odd step; how far up the ladder)
      // A scan's relief is that of ground a few metres across. Laid out a hundred times larger it would be hills that are not
      // there, with faces turned from the sun: from the step of the ladder where a stone would be a house it counts for less
      // and less, and from where it would be a hill for nothing (and is not looked up: half the lookups of ground seen from high up)
      gRelC[c] = 0.75 * (1.0 - smoothstep(2.5, 6.5, lv)) + 0.25 * (1.0 - smoothstep(6.5, 9.0, lv));
    }
    // which steps: from how many cells a pixel covers across its narrow way (the card's own filtering has the long way, where the
    // ground runs away from the eye). And the one size at which the far layers are laid.
    void ladder(vec4 nF, vec4 nC, vec4 nD, vec4 nA, float cl) {
      gLoc = vGLf * uLadK; vec2 dx = gDx, dy = gDy;
      float a = dot(dx, dx), d = dot(dy, dy), b = dot(dx, dy), det = dx.x * dy.y - dx.y * dy.x;
      float s1 = max(0.5 * (a + d + sqrt(max((a - d) * (a - d) + 4.0 * b * b, 0.0))), 1e-14), s2 = det * det / s1;      // (the long way and the narrow way, squared)
      float l = clamp(0.5 * log2(max(s2, s1 / 144.0) * uGndK.w * uGndK.w / 64.0), 0.0, 14.0);
      ladAt(0, l, nF, nC, nD, nA, cl); ladAt(1, max(l - clamp(uGndFine.x + (l - 5.0) * uGndFine.y, uGndFine.x, uGndFine.z), 0.0), nF, nC, nD, nA, cl);
      // the far layers: one size, and two copies of it moved apart, of which the higher shows (two woods laid over each other are
      // a wood). Which two changes slowly across the country, so the same crowns do not come round every repeat: and they too are
      // held in an even and an odd place, each changing only while nothing of it shows
      float invF = 1.0 / uGndFarN; vec3 w = uGndDbg < 3.5 ? nD.rgb - 0.5 : vec3(0.0);
      float kf = w.g * 9.0 + 4.0, kl = floor(kf), kh = floor(kl * 0.5); bool lowK = kl - 2.0 * kh < 0.5;
      vec2 pf = fract(uLadN * invF) + (uLadF + gLoc) * invF + (uGndDbg < 3.5 ? nA.rg - 0.5 : vec2(0.0)) * (0.6 * uGndK.z * 42473.0 * invF / (12.0 * cl));      // (bent by the longest noise: fifty of its repeats)
      gUf = pf + (2.0 * kh + (lowK ? 0.0 : 2.0)) * vec2(0.37, 0.71); gUg = pf + (2.0 * kh + 1.0) * vec2(0.37, 0.71); gFk = kf - kl; gFarLow = lowK ? 1.0 : 0.0;
      gDistM = length(vViewPos) * ${R_M.toFixed(1)}; gFar2 = 0.0; gFarPx = sqrt(s1) * invF;      // (gFarPx: repeats of the far layer to a pixel)
    }
    // A lookup of a material is an ordinary one, and both places of its ladder are always looked up. (Measured on the build Mac
    // against lookups that are told how large a pixel is, textureGrad, with branches round them: those were a tenth slower;
    // and against ordinary lookups inside branches, which were no quicker and leave the card guessing where a branch begins.)
    #define GTEXA(T, L, c) texture(T, vec3(gUaC[c], L))
    #define GTEXB(T, L, c) texture(T, vec3(gUbC[c], L))
    #define GTEXF(T, uv, L) texture(T, vec3(uv, L))
    int gndC(float L) { return uGndCls[int(L + 0.5)] > 0.5 ? 1 : 0; }      // (which ladder a layer stands on)
    float gndNear(float L) { return 1.0 - smoothstep(2.5, 6.5, gLvC[gndC(L)]); }      // (how much a scan's heights count there: see the block)
    // A material as the ladder shows it: what it adds to its own mean colour (rgb, about 1) and its height (a). Away from the eye
    // another layer may stand for it, at a size of its own (a wood's canopy for its floor; the floor still lends it its light and
    // dark, which is what a wood from high up has of pattern). gndFarK: how much of what is shown is that other layer; gndMean:
    // the colour the layer has on the whole, as it is shown here.
    // (A second material, the relief, a far layer and the snow are each inside a branch, entered only where they have a share.
    //  Where such a branch begins and ends, the card's idea of how large a pixel is may be wrong for a pixel's width: but there
    //  the share is nothing, or next to it.)
    float gndFarK(float L) { vec2 d = uGndFarD[int(L + 0.5)]; return d.y > 0.0 ? gFarOn * smoothstep(d.x, d.y, gDistM) : 0.0; }
    vec4 gnd(float L) {
      if (uGndDbg > 2.5) return vec4(1.0, 1.0, 1.0, 0.5);
      int i = int(L + 0.5), k = uGndCls[i] > 0.5 ? 1 : 0; vec3 m = uGndMean[i]; float fk = gndFarK(L);
      // (where the far layer has wholly taken over, the layer under it only lends it light and dark: one step of it will do)
      float mx = fk > 0.997 ? step(0.5, gMixC[k]) : gMixC[k];
      // (two sizes over each other: each keeps the share of its light and dark that leaves the whole as rich as one alone. An
      // even mix of two photographs is flatter than either, which is what made a ground laid this way look out of focus)
      vec4 c = GTEXA(uGnd, L, k), o = GTEXB(uGnd, L, k); float wa = sqrt(1.0 - mx), wb = sqrt(mx);
      c = vec4(max(1.0 + (c.rgb / m - 1.0) * wa + (o.rgb / m - 1.0) * wb, 0.0), 0.5 + (c.a - 0.5) * wa + (o.a - 0.5) * wb);
      if (fk > 0.003) {
        float Lf = uGndFar[i]; vec4 fE = GTEXF(uGnd, gUf, Lf), fO = GTEXF(uGnd, gUg, Lf);
        // (of the two copies the upper comes in where it stands higher, and wholly once the lower has had its turn)
        float hl = gFarLow > 0.5 ? fE.a : fO.a, hu = gFarLow > 0.5 ? fO.a : fE.a, up = smoothstep(-0.12, 0.12, hu - hl + (gFk - 0.5) * 2.3);
        gFar2 = gFarLow > 0.5 ? up : 1.0 - up; vec4 f = mix(fE, fO, gFar2);
        f.rgb *= mix(1.0, dot(c.rgb, vec3(0.299, 0.587, 0.114)), 0.5) / uGndMean[int(Lf + 0.5)]; c = mix(c, f, fk);
      }
      return c;
    }
    vec3 gndMean(float L) { int i = int(L + 0.5); vec3 m = uGndMean[i]; float fk = gndFarK(L); if (fk > 0.0) m = mix(m, uGndMean[int(uGndFar[i] + 0.5)], fk); return m; }
    // which way its surface leans (east, north; the maps have green up the picture, and the picture's top is the south), as far as
    // relief counts at this distance. Call it after gnd() of the same layer: the far layer's two copies are weighed there (gFar2).
    // A far layer's relief has the size it has (a wood's crowns): it counts until a crown is a pixel.
    vec2 gndN(float L) {
      vec2 a = vec2(0.0); if (uGndDbg > 0.5) return a;
      int k = gndC(L); float mx = gMixC[k], on = gRelC[k];
      if (on > 0.01) {
        vec2 e = GTEXA(uGndN, L, k).rg - 0.5, c = GTEXB(uGndN, L, k).rg - 0.5;
        a = (vec2(e.x, -e.y) * sqrt(1.0 - mx) + vec2(-c.y, c.x) * sqrt(mx)) * on;      // (the odd steps lie the other way round)
      }
      float fk = gndFarK(L);
      if (fk > 0.003) {
        float fn = 1.0 - smoothstep(0.06, 0.2, gFarPx); vec2 f = vec2(0.0);
        if (fn > 0.01) { float Lf = uGndFar[int(L + 0.5)]; f = (mix(GTEXF(uGndN, gUf, Lf).rg, GTEXF(uGndN, gUg, Lf).rg, gFar2) - 0.5) * fn; }
        a = mix(a, vec2(f.x, -f.y) + a * 0.35, fk);
      }
      return a * 2.0;
    }
    // A material takes the brightness the photograph of the Earth has there (up to the cap of its kind: h.y) and some of its hue
    // (h.x). The hue is for what gives the material its colour (the grass of a meadow, the sand of a dune), not for what merely
    // lies in it: a texel is tinted as far as it is as coloured as its material on the whole (a grey stone in the grass stays
    // grey: tinted with the grass it turns blue), and what is not gets a little of the country's colour as a grey thing would
    // (gToneG: bare ground between the tufts is tan in the savanna). And nothing is tinted past grey into blue: where the
    // photograph is blue it shows shade, haze or snow, not ground. (gToneB: the photograph's colour over its brightness;
    // gToneL: that brightness; gToneH: how far hue is followed here. Set once for the pixel.)
    vec3 tone(vec3 c, float L, vec2 h) {
      vec3 m = gndMean(L), t = c * m; float lm = dot(m, vec3(0.299, 0.587, 0.114)), q = gToneL / h.y, lt = gToneL / sqrt(sqrt(1.0 + q * q * q * q));
      vec3 ct = t / max(dot(t, vec3(0.299, 0.587, 0.114)), 1e-3) - 1.0, cm = m / lm - 1.0; float am = dot(cm, cm);
      float like = mix(1.0, smoothstep(0.09, 0.64, dot(ct, ct) / max(am, 1e-4)), smoothstep(0.02, 0.12, am));
      vec3 k = mix(vec3(1.0), mix(gToneG, clamp(gToneB * (lm / m), 0.4, 2.5), like), min(h.x * gToneH, 1.0));
      vec3 o = t * k; o.b = min(o.b, min(max(t.b * max(k.r, k.g), min(o.r, o.g)), o.g));      // (and bare ground is never bluer than it is green: the mauve earth and the lilac shade in some scans are their light, not their ground)
      return o * mix(1.0, lt / lm, uGndT.x);
    }
    // What people have made of the ground (the land-use tiles: crops in their rows, paving) has a size too, and it is the size the
    // game draws a village at, some twenty times life: a plot takes one repeat of its crop, a cobble is as wide as a doorway there.
    // n: cells to a repeat (a power of two); swap: the other way round.
    vec3 ltex(float L, float n, float swap) {
      vec2 p = fract(uLadN / n) + (uLadF + gLoc) / n; if (swap > 0.5) p = p.yx;
      return texture(uLanduse, vec3(p, L)).rgb;
    }
    #endif
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
      // variation noise in geographic space (stable across tiles and LODs)
      #ifdef USE_GROUND
      // (read three levels coarser than the card would: here they choose which material lies where, and a choice made of grain a
      // pixel or two across is a snow of single pixels. So a patch is never drawn smaller than some eight pixels: before it comes
      // to that it has faded into the mean, and the next coarser of the four carries on)
      // (Told the level outright, and never finer than the third: asked only to go three coarser than the card would, a noise seen
      // from close to is still read at its finest, since the card's own answer there is far below nought. The ladder bends its
      // repeats by these, and bent by a noise's fine grain a scan is drawn out into streaks.)
      float nLod; { vec2 gx = dFdx(vGL), gy = dFdy(vGL); nLod = 0.5 * log2(max(max(dot(gx, gx), dot(gy, gy)), 1e-30)) + 17.64; }      // (the level the card would take for one repeat a radian, and three more)
      vec4 nMac = textureLod(uNoise, gc(3.0), max(nLod + 1.585, 3.0));
      vec4 nMid = textureLod(uNoise, gc(24.0), max(nLod + 4.585, 3.0));
      vec4 nMic = textureLod(uNoise, gc(180.0), max(nLod + 7.492, 3.0));
      vec4 nFin = textureLod(uNoise, gc(800.0), max(nLod + 9.644, 3.0));
      #else
      vec4 nMac = noise2(gc(3.0));
      vec4 nMid = noise2(gc(24.0));
      vec4 nMic = noise2(gc(180.0));
      vec4 nFin = noise2(gc(800.0));
      #endif
      // ---------- imagery ----------
      // magnification estimate first (needed for the warp)
      // (uImgK: 4096 to a pack of the picture's four coarsest levels, and from there down as many as a pack of the fourth would have
      //  had - the picture is finer now than the five kilometres to a texel all of this was fitted to, and "how many of the
      //  picture's texels to a pixel" is this shader's measure of how near the eye is: it is kept in the old texels.)
      vec2 duv0 = fwidth(vUV * uImgRect.zw * uImgK);
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
      // The water's mask between the texels of the picture. A texel of it is five kilometres: from close to, thousands of
      // pixels wide, and a card does not weigh four texels finely: it gives what lies between two of them in 256 steps.
      // A coast was a flight of stairs; and since a lake is told from a shore by how level the mask lies (aw), with every
      // tread of the stairs dead level and every riser a cliff, a lake near its shore was crossed by a lattice of lines of
      // dry land, nine metres by nineteen. Magnified, the four texels are fetched and weighed here, and the slope is theirs.
      // (texPerPx0 counts 4096 texels to a pack, which has 1024: it is four times the texels to a pixel. At the picture's finer
      //  levels the mask is the same mask, weighed between its texels by the builder as a card weighed it: its slope is still
      //  told by the old texel.)
      { vec2 isz = vec2(textureSize(uImg, 0)), tx = dFdx(vUV) * uImgRect.zw * isz, ty = dFdy(vUV) * uImgRect.zw * isz;
        if (texPerPx0 < 0.6 && a > 0.004 && a < 0.996) {
          vec2 t0 = uImgRect.xy * isz, ti = floor(t0), q = (t0 - ti) + (vUV * uImgRect.zw + warp) * isz - 0.5, qi = floor(q), f = q - qi;
          ivec2 i0 = ivec2(ti + qi), mx = ivec2(isz) - 1, i1 = min(i0 + 1, mx); i0 = max(i0, ivec2(0));
          float a00 = texelFetch(uImg, i0, 0).a, a10 = texelFetch(uImg, ivec2(i1.x, i0.y), 0).a, a01 = texelFetch(uImg, ivec2(i0.x, i1.y), 0).a, a11 = texelFetch(uImg, i1, 0).a;
          vec2 g = vec2(mix(a10 - a00, a11 - a01, f.y), mix(a01 - a00, a11 - a10, f.x));      // (its slope, to the texel)
          float k = smoothstep(0.6, 0.4, texPerPx0);
          a = mix(a, mix(mix(a00, a10, f.x), mix(a01, a11, f.x), f.y), k); aw = mix(aw, abs(dot(g, tx)) + abs(dot(g, ty)), k);
        } }
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
      // ---------- the water's edge ----------
      // Where the field of distances is here (data/w), it and not the picture says what is water: metres to the shore (wD,
      // water negative), what water it is (wK: 0 the sea .. 1 fresh), and how many of those metres a pixel spans (wPx).
      // Its four texels are fetched and weighed here: a texel is three hundred metres, from a hilltop a thousand pixels, and
      // a card's own weighing has 256 steps. The line where the distance passes nought lies true between the texels; what
      // roughens it at the scale of a cove or a rock is the noise of the place (a beach runs smooth, a steep shore ragged).
      float wOn = step(0.5, uWaterP.x), wD = 0.0, wK = 0.0, wPx = 1.0, wCov = 0.0, wBend = 0.0, wOpen = 1.0; vec2 wLand = vec2(0.0);      // (wLand: the way to the nearest land, in the tile's own measure for a metre)
      if (wOn > 0.5) {
        if (uWaterP.x > 1.5) { wD = uWaterP.z; wK = uWaterP.w; }      // (all land or all water, and wPx one metre: with a pixel called a kilometre wide, a fiftieth of every pixel of far land was sea, and had its waves reckoned)
        else {
          vec2 wsz = vec2(textureSize(uWater, 0)), wq = (uWaterRect.xy + vUV * uWaterRect.zw) * wsz - 0.5, wi = floor(wq), wf = wq - wi;
          ivec2 iLast = ivec2(wsz) - 1, i0 = ivec2(wi), i1 = min(i0 + 1, iLast); i0 = max(i0, ivec2(0));
          vec2 t00 = texelFetch(uWater, i0, 0).rg, wx = dFdx(vUV) * uWaterRect.zw * wsz, wy = dFdy(vUV) * uWaterRect.zw * wsz;      // (how the field's texels run across the pixel: asked here, before the ways part)
          // (Far inland by its nearest texel - most pixels of most pictures - a pixel needs neither that texel's neighbours nor
          //  anything reckoned from them: the field says no more there than "land, and no shore within reach".)
          if (t00.r > ${((WCODE.land - 0.5) / 255).toFixed(5)}) wD = ${WCODE.near.toFixed(1)} * uWaterP.y;
          else {
          vec2 t10 = texelFetch(uWater, ivec2(i1.x, i0.y), 0).rg, t01 = texelFetch(uWater, ivec2(i0.x, i1.y), 0).rg, t11 = texelFetch(uWater, i1, 0).rg;
          float d00 = wDec(t00.r), d10 = wDec(t10.r), d01 = wDec(t01.r), d11 = wDec(t11.r);
          wD = mix(mix(d00, d10, wf.x), mix(d01, d11, wf.x), wf.y); { vec2 ko = mix(mix(wKO(t00.g), wKO(t10.g), wf.x), mix(wKO(t01.g), wKO(t11.g), wf.x), wf.y); wK = ko.x; wOpen = ko.y; }
          vec2 wg = vec2(mix(d10 - d00, d11 - d01, wf.y), mix(d01 - d00, d11 - d10, wf.x));
          // Weighed between four texels the shore is a run of straight pieces, a texel long each. Near it, and from close enough
          // to see that, sixteen texels give a line that curves (Catmull-Rom: it still passes where the field has it, so a rock
          // a texel across stays), and how the shore bends there (wBend, 1/m: a bay positive, a headland negative; from the
          // second differences of a smoother weighing, which does not jump from texel to texel).
          float wNear = (1.0 - smoothstep(300.0, 420.0, abs(wD))) * (1.0 - smoothstep(0.2, 0.35, max(length(wx), length(wy))));
          #ifndef WATER_PLAIN
          if (wNear > 0.0) {
            vec2 f = wf, f2 = f * f, f3 = f2 * f, g = 1.0 - f;
            vec4 cx = vec4(-0.5 * f3.x + f2.x - 0.5 * f.x, 1.5 * f3.x - 2.5 * f2.x + 1.0, -1.5 * f3.x + 2.0 * f2.x + 0.5 * f.x, 0.5 * f3.x - 0.5 * f2.x), cy = vec4(-0.5 * f3.y + f2.y - 0.5 * f.y, 1.5 * f3.y - 2.5 * f2.y + 1.0, -1.5 * f3.y + 2.0 * f2.y + 0.5 * f.y, 0.5 * f3.y - 0.5 * f2.y);
            vec4 dx4 = vec4(-1.5 * f2.x + 2.0 * f.x - 0.5, 4.5 * f2.x - 5.0 * f.x, -4.5 * f2.x + 4.0 * f.x + 0.5, 1.5 * f2.x - f.x), dy4 = vec4(-1.5 * f2.y + 2.0 * f.y - 0.5, 4.5 * f2.y - 5.0 * f.y, -4.5 * f2.y + 4.0 * f.y + 0.5, 1.5 * f2.y - f.y);
            vec4 bx = vec4(g.x * g.x * g.x, 3.0 * f3.x - 6.0 * f2.x + 4.0, -3.0 * f3.x + 3.0 * f2.x + 3.0 * f.x + 1.0, f3.x) / 6.0, by = vec4(g.y * g.y * g.y, 3.0 * f3.y - 6.0 * f2.y + 4.0, -3.0 * f3.y + 3.0 * f2.y + 3.0 * f.y + 1.0, f3.y) / 6.0;
            vec4 ex = vec4(g.x, 3.0 * f.x - 2.0, 1.0 - 3.0 * f.x, f.x), ey = vec4(g.y, 3.0 * f.y - 2.0, 1.0 - 3.0 * f.y, f.y);
            vec2 wm = vec2(tileWm, tileHm) / (uWaterRect.zw * wsz);          // a texel, metres east-west and north-south (as the pack's level has them)
            float v = 0.0, lap = 0.0; vec2 gr = vec2(0.0); ivec2 ib = ivec2(wi) - 1;
            for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
              float d = (i == 1 || i == 2) && (j == 1 || j == 2) ? (i == 1 ? (j == 1 ? d00 : d01) : (j == 1 ? d10 : d11)) : wDec(texelFetch(uWater, clamp(ib + ivec2(i, j), ivec2(0), iLast), 0).r);
              v += cx[i] * cy[j] * d; gr += vec2(dx4[i] * cy[j], cx[i] * dy4[j]) * d; lap += (ex[i] * by[j] / (wm.x * wm.x) + bx[i] * ey[j] / (wm.y * wm.y)) * d;
            }
            wD = mix(wD, v, wNear); wg = mix(wg, gr, wNear); wBend = lap * wNear * uWaterP.y;      // (the texels' metres are those of the finest level: uWaterP.y times them is the truth, and wm has it already)
          }
          #endif
          wD *= uWaterP.y; wg *= uWaterP.y;
          { vec2 gm = wg * (uWaterRect.zw * wsz) / vec2(tileWm, tileHm); wLand = gm / max(length(gm), 1e-4) / vec2(tileWm, tileHm); }
          wPx = max(length(vec2(dot(wg, wx), dot(wg, wy))), 1e-3);
          float rough = mix(9.0, 42.0, smoothstep(0.02, 0.2, slope)) * uWaterK.x;
          wD += ((nMic.b - 0.5) * 2.0 + (nFin.b - 0.5) * 0.6) * rough * (1.0 - smoothstep(300.0, 480.0, abs(wD)));
          // the sea's edge comes up the beach and runs back (a few metres; a lake's lies still)
          wD += sin(uTime * 0.55 + nMid.r * 31.0 + nMic.g * 5.0) * 3.5 * (1.0 - wK) * smoothstep(0.3, 0.9, wOpen) * uSeaK.y * (1.0 - smoothstep(60.0, 160.0, abs(wD))) * (1.0 - smoothstep(4.0, 14.0, wPx));
          }
        }
        wCov = clamp(0.5 - wD / wPx, 0.0, 1.0);
        seaW = wCov * (1.0 - wK); landW = 1.0 - seaW; lakeW = wCov * wK; bandW *= 1.0 - wCov;
      }
      // camera-local decal: vector rivers and roads painted straight onto the ground
      vec2 dcu = (vec2(vLon, vLat) - uDecalRect.xy) * uDecalRect.zw;
      float inDecal = uDecalOn * step(0.0, dcu.x) * step(dcu.x, 1.0) * step(0.0, dcu.y) * step(dcu.y, 1.0);
      vec4 dec = inDecal > 0.5 ? texture2D(uDecal, dcu) : vec4(0.0);
      vec4 dec2 = inDecal > 0.5 ? texture2D(uDecal2, dcu) : vec4(0.0);   // r burn/ash, b cast shadows, a flood water
      float castS = dec2.b; float burnW = dec2.r; float floodW = dec2.a;
      float riverLine = bandW * (1.0 - inDecal) * (1.0 - smoothstep(0.3, 0.7, closeFade0));   // raster river water only from a distance; close in it is floodplain
      // a river in the decal: 1 on its centre line, 0.5 at the water's edge, 0 where its bank ends. The edge wanders a
      // little, and the river narrows where the land rises steeply from it (it is drawn wider than life: see decal.js)
      float rivR = dec.r * inDecal * (1.0 + wn2.b * 0.2 + wn.a * 0.22);
      float vecRiver = smoothstep(0.47, 0.53, rivR - smoothstep(0.05, 0.2, slope) * 0.27);
      float bankW = smoothstep(0.03, 0.42, rivR) * (1.0 - vecRiver);
      float bridgeW = smoothstep(0.34, 0.46, dec.b) * vecRiver;           // where a road meets the river it crosses: a causeway of timber, later a bridge of stone
      vecRiver *= 1.0 - bridgeW;
      float inlandW = max(lakeW, max(riverLine, max(vecRiver, floodW * 0.95)));
      vec2 geo = vec2((vLon / PI + 1.0) * 0.5, 0.5 - vLat / PI);   // global equirect uv (v down)
      #ifdef INFO2
      vec4 info = texture(uInfo, vec3(geo, 0.0));                    // r shelf, g ice, b how hard the winters are, a how humid the climate (tools/climate/build.py)
      vec4 natv = texture(uInfo, vec3(geo, 1.0));                    // by nature: how green the country is and how warm-coloured (r, b: data/veg.jpg, what the trees are planted by); for how much of the year the sea is ice (g) and of its cold season snow would lie at the level of the sea (a: data/snow.png)
      #else
      vec4 info = texture2D(uInfo, geo); vec4 natv = vec4(0.0, 0.5, 1.0, 1.0);
      #endif
      // magnification: how many screen pixels per imagery texel (approx via derivatives)
      vec2 duv = fwidth(vUV * uImgRect.zw * uImgK);
      float texPerPx = max(duv.x, duv.y);                            // >1 minified, <1 magnified
      float detailFade = clamp(1.0 - texPerPx * 0.9, 0.0, 1.0);      // 0 far, 1 close
      float closeFade = max(clamp(1.0 - texPerPx * 0.25, 0.0, 1.0), smoothstep(0.03, 0.003, uCamAlt));
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
      float latN0 = abs(vLat) / (0.5 * PI);
      float treeLine = 4100.0 - 3900.0 * pow(latN0, 1.4);
      vec4 sim = texture2D(uSim, geo);
      float cult = sim.b;
      // the climate of the place (info.a, from the Koppen-Geiger map): how dry the country really is, whatever today's
      // photograph shows. 1 true desert, ~0.6 steppe, ~0.3 savanna and the lands of dry summers, 0 humid.
      float clim = clamp(1.0 - info.a + (nMac.b - 0.5) * 0.12 + (nMid.a - 0.5) * 0.06, 0.0, 1.0);
      // ---------- the country before the plough ----------
      // The photograph is of our own day. In the lands where woods would stand, half of what it shows is field and pasture:
      // tan with stubble under a July sun, and from the photograph alone that is dry ground. The world begins in 10,000 BC.
      // So where nobody farms (the simulation knows who does), ground that is lighter than a wood is given back the colour of
      // the woods and glades that stood there, and keeps a share of its own light and dark (the grain of the country stays:
      // it is a remapping of each texel, not a smoothing); where the game's people have cleared the land, the photograph's
      // own fields show. Only where woods would stand (a steppe is tan of its own, and so is a Mediterranean
      // summer), below the trees' line, and not on rock faces or snow.
      float ploughed = smoothstep(0.05, 0.4, cult + (nMid.r - 0.5) * 0.2);
      float lum0 = dot(base, vec3(0.299, 0.587, 0.114));      // (the photograph's own light and dark, before anything is made of it)
      { float l0 = lum0;
        // (Where woods would stand: by the map the trees are planted by - green by nature and not warm-coloured, which a steppe, a
        //  prairie and a savanna are. A climate's class cannot say it: the wheat of Kansas and the wheat of Picardy grow under
        //  the same letters, and the plains were a green wall from Texas to the Dakotas with a ruled edge where the class
        //  changes. Not in the taiga or beyond it, where what is light in the photograph is bog, burn and tundra, and was so then.)
        float woods = smoothstep(0.55, 0.9, natv.r) * (1.0 - smoothstep(0.3, 0.6, natv.b)) * (1.0 - smoothstep(0.78, 0.92, info.b)) * (1.0 - smoothstep(treeLine - 500.0, treeLine - 100.0, vH));
        float field = smoothstep(0.13, 0.24, l0) * (1.0 - smoothstep(0.5, 0.7, l0)) * (1.0 - smoothstep(0.25, 0.5, slope));
        float ln = mix(0.15, l0, 0.45);          // (a glade is lighter than the wood round it, as the field was: by less)
        vec3 nat = mix(vec3(0.78, 1.20, 0.40), vec3(0.96, 1.12, 0.44), smoothstep(0.16, 0.30, ln)) * ln;
        base = mix(base, nat, woods * field * (1.0 - ploughed) * uWild); }
      float lum = dot(base, vec3(0.299, 0.587, 0.114));
      float green = clamp((base.g - max(base.r, base.b) * 0.92) * 6.0 + 0.25, 0.0, 1.0);
      float warm = clamp((base.r - base.b) * 4.0, 0.0, 1.0);
      float white = smoothstep(0.66, 0.9, lum) * (1.0 - warm) * (1.0 - green);
      // seasons: the hemisphere's winter pulls the snow line down (to the coast in the far north), autumn colours the deciduous belt
      float hemi = smoothstep(-0.03, 0.03, vLat);
      float winter = mix(uSeason.z, uSeason.x, hemi) * smoothstep(0.18, 0.4, latN0);
      float autumn = mix(uSeason.w, uSeason.y, hemi);
      float decid = smoothstep(0.26, 0.4, latN0) * (1.0 - smoothstep(0.56, 0.74, latN0)) * (1.0 - smoothstep(1200.0, 2400.0, vH));
      float seasonK = 900.0 + 5200.0 * pow(latN0, 1.5);
      // (dry air keeps its mountains bare far higher: the hills of the Altiplano, three hundred metres under a snow line reckoned
      //  by latitude alone, were white the year round)
      // (and a winter brings the snow line down only where it brings snow: natv.a, the Earth's own winter. Tibet is high, dry
      //  and all but bare in January; by the latitude's rule alone it was an ice cap for half the year.)
      // For how much of its cold season snow lies here: 1 all seven months of it, and a little more where it lies into the summer.
      // The map (natv.a: tools/planet/snow.py) has how long it would lie at the level of the sea, of cells twenty kilometres
      // across, and every place adds its own height: half the season more for each thousand metres. (By the map's cells alone
      // the snow of the Alps ended at one line over ridge and valley alike; here a valley is green for most of its winter under
      // white mountains, and the ranges of a dry plateau have their winter snow while the plateau has none.)
      float noiseL = 0.5 * log2(max(max(dot(dFdx(vGL), dFdx(vGL)), dot(dFdy(vGL), dFdy(vGL))), 1e-30)) + 9.0;      // (the level the card would take of the noise at one repeat a radian)
      // (Its height by the heights' own texels, not by the mesh's corners: from far out a quad of the mesh is tens of kilometres,
      //  and by the corners the snow's edge was a smooth line that moved as the mesh grew finer under the eye. By the texels it
      //  is as ragged as the country, from every height the same.)
      float snowHere = clamp(natv.a * 4.0 - 3.0 + 0.25 * (hE + hW + hS + hN) * 0.0005, 0.0, 1.25);
      float winterSnow = winter * mix(0.12, 1.0, smoothstep(0.05, 0.5, snowHere));
      float snowLine0 = max(-900.0, 5100.0 - 4800.0 * pow(latN0, 1.3) - max(0.0, winterSnow - 0.4) * seasonK + max(0.0, 0.4 - winter) * seasonK * 0.35) + clim * 700.0 * (1.0 - smoothstep(0.5, 0.75, latN0));
      float ice = max(info.g, white * max(smoothstep(snowLine0 - 900.0, snowLine0 + 200.0, vH), smoothstep(0.7, 0.8, latN0)));
      // biome weights
      float aboveTree = smoothstep(treeLine - 300.0, treeLine + 200.0, vH);
      float steep = smoothstep(0.12, 0.42, slope);
      // the wildwood: land that is green and not dry was forest until somebody cleared it; today's pictures show the
      // fields that came later. So where nobody farms, the lighter greens count as forest too.
      float desertK = smoothstep(0.7, 0.86, clim), steppeK = smoothstep(0.44, 0.56, clim) * (1.0 - desertK);
      float wild = (1.0 - smoothstep(0.22, 0.48, warm)) * (1.0 - clamp(cult * 1.4, 0.0, 1.0)) * (1.0 - smoothstep(0.35, 0.6, clim));
      float wForest = green * (1.0 - smoothstep(0.32 + 0.2 * wild, 0.6 + 0.3 * wild, lum)) * (1.0 - aboveTree) * (1.0 - steep * 0.7);
      float wGrass  = green * smoothstep(0.28 + 0.2 * wild, 0.55 + 0.3 * wild, lum) * (1.0 - steep * 0.6) + green * aboveTree * 0.6 * (1.0 - steep);
      float wDesert = warm * (1.0 - green) * (1.0 - steep) * (1.0 - smoothstep(1800.0, 3000.0, vH));
      float wRock   = max(steep, smoothstep(treeLine + 400.0, treeLine + 1400.0, vH) * (1.0 - green * 0.5)) + (1.0 - green) * (1.0 - warm) * 0.5;
      // dithered transitions: land cover breaks up instead of fading
      { float v = max(wForest + (nMid.r - 0.5) * 0.5 + (nMic.g - 0.5) * 0.25 + (nFin.r - 0.5) * 0.15, 0.0); wForest = v * v * v; }
      { float v = max(wGrass  + (nMid.g - 0.5) * 0.5 + (nMic.r - 0.5) * 0.25 + (nFin.g - 0.5) * 0.15, 0.0); wGrass = v * v * v; }
      { float v = max(wDesert + (nMac.b - 0.5) * 0.3 + (nMic.b - 0.5) * 0.2 + (nFin.b - 0.5) * 0.1, 0.0); wDesert = v * v * v; }
      #ifdef USE_GROUND
      { float v = max(wRock   + (nMid.b - 0.5) * 0.4 + (0.5 - nMic.b) * 0.25 + (0.5 - nFin.b) * 0.2, 0.0); wRock = v * v * v; }      // (the noise's fourth channel is single texels: of no use read coarse)
      #else
      { float v = max(wRock   + (nMid.a - 0.5) * 0.4 + (nMic.a - 0.5) * 0.25 + (nFin.a - 0.5) * 0.2, 0.0); wRock = v * v * v; }
      #endif
      // (the trees stand back from the sea behind its beach, thinly at first: the ground there is the grass of the dunes, not the dark floor of a wood without its wood)
      if (wOn > 0.5) { float back = wForest * (1.0 - wK) * (1.0 - smoothstep(50.0, 170.0, wD)); wForest -= back; wGrass += back; }
      float ws = wForest + wGrass + wDesert + wRock + 1e-4;
      wForest /= ws; wGrass /= ws; wDesert /= ws; wRock /= ws;
      #ifdef USE_GROUND
      // ---------- what the ground is made of: its materials under the biome weights, at every height up to where the planet is one thing ----------
      // (not on the last four degrees round a pole: the frame the materials lie in has no place for a pole, and what lies there is
      //  plain white; and not under the sea or a lake, where nothing of the land is seen)
      float gOn0 = uTexMix * smoothstep(0.085, 0.02, uCamAlt), gOn = gOn0 * (1.0 - smoothstep(1.47, 1.5, abs(vLat))) * step(max(seaW, lakeW), 0.996) * step(uGndDbg, 4.5);
      float snow = smoothstep(snowLine0 - 150.0, snowLine0 + 700.0, vH) * (1.0 - smoothstep(0.35, 0.7, slope)) * mix(0.06 + 0.94 * white, 0.85, winterSnow * 0.8) * (1.0 - 0.55 * wForest);      // (in summer, where the photograph has it: at 611 m to a texel it knows every snowfield; a wood under snow is dark from above, its floor white between the trees)
      float fall = autumn * decid; float bare = mix(uBare.y, uBare.x, hemi) * smoothstep(0.18, 0.4, latN0) * decid;
      float dl = 0.45, dl2 = 0.45, forestFar = 1.0, forestOpen = 1.0, gHU = 0.5; vec2 gRel = vec2(0.0); float gRelK = 0.0; vec4 gSnow = vec4(1.0); vec2 gSnowN = vec2(0.0); float gSnowOn = 0.0;      // (gSnow: the snow, once it has been looked up; gHU: how high the ground's own material stands at this pixel)
      vec3 land = base * 0.98;
      gDx = dFdx(vGLf) * uLadK; gDy = dFdy(vGLf) * uLadK;
      if (gOn > 0.002) {
        ladder(nFin, nMic, nMid, nMac, max(cl, 0.02));
        // settled country is cleared country: most of what would be wood there is pasture with trees standing in it (the game draws
        // those), and what wood is left is open and grazed, with no closed canopy over it
        float lift = 1.0;      // (grazed and mown ground is lighter than the wood that stood there, which is what the photograph of the Earth shows of it)
        { float settled = smoothstep(0.03, 0.22, cult); gFarOn = 1.0 - settled; float cleared = wForest * settled * 0.85; wForest -= cleared; wGrass += cleared; lift += 0.3 * cleared; }
        float dith = (nMic.r - 0.5) * 0.35 + (nFin.g - 0.5) * 0.15;
        float tropic = 1.0 - smoothstep(0.27, 0.31, latN0 + dith * 0.1);
        float savK = (clim + dith * 0.3 > 0.22 && tropic > 0.5 && warm > 0.3) ? 1.0 : 0.0;
        float gL = (savK > 0.5 || clim + dith * 0.3 > 0.42 || (lum + dith > 0.5 && green < 0.7)) ? 1.0 : 0.0;    // savanna and steppe (dry grass), meadow
        float fL = (vH > treeLine - 600.0 || latN0 + dith > 0.62) ? 8.0 : 7.0;                                  // tundra above the trees and in the far north, else the floor of the wood (and from afar its canopy)
        // in stretches a meadow is stony pasture, and more so where the land slopes
        float stony = gL < 0.5 ? smoothstep(0.5, 0.64, nMid.b * 0.45 + nMid.r * 0.25 + nMic.b * 0.3 + smoothstep(0.02, 0.2, slope) * 0.2) : 0.0;
        float redK = 0.0; if (savK > 0.5) redK = smoothstep(0.5, 0.8, nMac.g * 0.45 + nMid.b * 0.4 + nMic.r * 0.15) * 0.5 * (1.0 - desertK) * (1.0 - steppeK);      // savanna: in stretches the red earth shows between the tufts
        // The two that count most here; how far the regional colour of the photograph may tint each (a rock stays the colour of rock),
        // and how bright each may be at most (where the photograph is bright with snow or haze, grass under it is still grass).
        // (Each kind of ground is gone into only where there is any of it: the arithmetic of this choosing was a fifth of the frame.)
        float L1 = gL, w1 = wGrass * (1.0 - redK) * (1.0 - stony), L2 = fL, w2 = wForest; vec2 h1 = vec2(gL > 0.5 ? 0.5 : 0.75, 0.42), h2 = fL > 7.5 ? vec2(0.7, 0.45) : vec2(0.8, 0.32);      // (dry grass is straw whatever the earth under it: the red of a red country is its soil's; the fell is open ground, lighter than the floor of a wood)
        forestOpen = fL > 7.5 ? 0.3 : 1.0;
        if (w2 > w1) { float t; t = L1; L1 = L2; L2 = t; t = w1; w1 = w2; w2 = t; vec2 th = h1; h1 = h2; h2 = th; }
        #define CAND(L, w, h) { float wc = w; if (wc > w1) { L2 = L1; w2 = w1; h2 = h1; L1 = L; w1 = wc; h1 = h; } else if (wc > w2) { L2 = L; w2 = wc; h2 = h; } }
        if (wRock > 0.003) {
          // crags with moss on them where the country is green, the warm rock of dry country, else bare grey rock
          float rL = green + (nMic.b - 0.5) * 0.3 > 0.4 ? 17.0 : (clim + (nMid.b - 0.43) * 0.25 > 0.52 ? 20.0 : 5.0);
          // scree lies where the rock is not too steep to hold it, in fields
          float screeK = (1.0 - smoothstep(0.2, 0.36, slope)) * smoothstep(0.42, 0.58, nMid.b * 0.55 + nMic.g * 0.3 + nFin.r * 0.15);
          CAND(rL, wRock * (1.0 - screeK), rL > 19.0 ? vec2(0.6, 0.8) : vec2(0.2, 0.62))      // (the rock of dry country takes the colour of the country: red, ochre or pale)
          CAND(11.0, wRock * screeK, vec2(mix(0.2, 0.75, smoothstep(0.4, 0.6, clim)), 0.62))      // (loose stone is the colour of the rock it broke from: grey in the mountains of green countries, the country's own in the dry ones)
        }
        if (stony > 0.003) CAND((latN0 + dith * 0.2 > 0.6 || vH > treeLine - 500.0) ? 18.0 : 16.0, wGrass * (1.0 - redK) * stony, vec2(0.75, 0.42))      // (stony pasture; in the north and on the heights dark moor with slabs of rock in it)
        if (wDesert > 0.003) {
          // the dry ground of the place. True desert: dunes where the photograph is brightest, stony plain and stretches of scrub
          // elsewhere, salt flats where it is white; steppe: dry grass and bare earth here and there; savanna: straw grass
          float patchN = smoothstep(0.36, 0.64, nMac.g * 0.5 + nMid.b * 0.32 + nMic.r * 0.18);
          float isDesert = step(0.5, desertK + dith * 0.4), isSteppe = step(0.5, steppeK + dith * 0.4) * (1.0 - isDesert);
          float isSav = step(0.22, clim + dith * 0.3) * step(0.5, tropic) * (1.0 - isDesert) * (1.0 - isSteppe);
          float salt = isDesert * step(0.62, lum) * step(green, 0.25) * step(warm, 0.4);
          float sandW = isDesert * (1.0 - salt) * smoothstep(0.46, 0.7, lum + (nMac.r - 0.5) * 0.26 + (nMid.g - 0.5) * 0.035 + (nMic.g - 0.5) * 0.035);
          float LA = mix(1.0, mix(4.0, 15.0, salt), isDesert), LB = mix(mix(1.0, 14.0, isSteppe), 2.0, isDesert);
          float wB = patchN * (isDesert * (1.0 - salt) * (1.0 - sandW) + isSteppe * 0.4 + isSav * 0.45);
          CAND(LA, wDesert * (1.0 - wB - sandW) * (1.0 - redK), vec2(0.85, 2.0))
          CAND(LB, wDesert * wB * (1.0 - redK), vec2(0.85, 2.0))
          CAND(3.0, wDesert * sandW, vec2(0.9, 2.0))
        }
        if (redK > 0.003) CAND(9.0, (wGrass + wDesert) * redK, vec2(0.3, 0.5))
        #undef CAND
        if (uGndShow >= 0.0) { L1 = uGndShow; w1 = 1.0; w2 = 0.0; }
        // (what tone() is told of the pixel; in dry country what is bare is dusted with the country's earth: grey stone goes tan there;
        //  where the photograph shows snow or cloud its colour says nothing of the ground's)
        gToneL = max(lum, 0.03); gToneB = base / gToneL; gToneH = (1.0 - white) * uGndT.y; gToneL *= lift;
        gToneG = mix(vec3(1.0), clamp(gToneB, 0.6, 1.6), 0.6) * mix(vec3(1.0), vec3(1.10, 1.0, 0.82), smoothstep(0.35, 0.65, clim));
        // A scan's heights are those of ground a few metres across. Laid out a hundred times larger they would put patches a mile
        // wide of one material into another's hollows: from the step of the ladder where a stone would be a house they count for
        // less and less (gndNear: 1 near, 0 far), and what is left to say where one ground ends and the next begins is the lie of
        // the land itself. (The relief goes the same way: gRelC in ladAt().)
        // (dry grass is straw and olive, never the lime of the mossy ground it was scanned from; and what grows in dry country is
        //  grey with it: sage, not the green-gold of a wet meadow gone dry)
        float sage = 0.72 * (1.0 - 0.4 * smoothstep(0.4, 0.7, clim)); const vec3 STRAW = vec3(1.07, 1.0, 0.9);
        // (ground that lies wholly under snow is not looked up at all: the snow is)
        float snowW = max(snow, ice * 0.95); bool snowed = snowW > 0.76;
        float hU = 0.5, t2 = w2 / max(w1 + w2, 1e-4), kB = 0.0; vec3 tex = vec3(0.5);
        // (nor what lies under a road; and under the trodden ground of a town, of which a little shows through, one material
        // will do, and its relief is not looked up: trodden earth has its own)
        float townK = inDecal * smoothstep(0.04, 0.22, dec.b) * (1.0 - ice); bool roaded = inDecal * dec.b > 0.72;
        if (!snowed && !roaded) {
          float nearA = gndNear(L1), nearB = gndNear(L2), gNear = min(nearA, nearB);
          vec4 A = gnd(L1); vec3 ca = tone(A.rgb, L1, h1); if (L1 == 1.0) ca = mix(vec3(dot(ca, vec3(0.299, 0.587, 0.114))), ca, sage) * STRAW;
          hU = mix(0.5, A.a, nearA); tex = ca; dl = 0.45 * dot(A.rgb, vec3(0.299, 0.587, 0.114));
          if (townK < 0.99) gRel = gndN(L1);
          // one lies in the hollows of the other: the higher of the two shows, each raised by its share. (The second is looked up
          // only where its share is large enough for any of it to stand above the first: 0.34 far off, 0.13 close to)
          if (t2 > 0.34 - 0.21 * gNear && L2 != L1 && townK < 0.99 && uGndDbg < 1.5) {
            vec4 B = gnd(L2); vec3 cb = tone(B.rgb, L2, h2); if (L2 == 1.0) cb = mix(vec3(dot(cb, vec3(0.299, 0.587, 0.114))), cb, sage) * STRAW;
            float hB = mix(0.5, B.a, nearB), ha = hU + (1.0 - t2) * 1.6, hb = hB + t2 * 1.6, top = max(ha, hb) - mix(0.5, 0.16, gNear), ba = max(ha - top, 0.0), bb = max(hb - top, 0.0);
            kB = bb / (ba + bb); tex = mix(ca, cb, kB); hU = mix(hU, hB, kB); dl = mix(dl, 0.45 * dot(B.rgb, vec3(0.299, 0.587, 0.114)), kB);
            if (kB > 0.03) gRel = mix(gRel, gndN(L2), kB);
          }
        }
        tex *= 1.0 + 0.18 * wDesert;      // (dry ground is bright ground: the photograph of the Earth has the deserts darker than they stand in the sun)
        // No two stretches of a meadow are one green: here it is lusher, there drier and yellower, in stretches from a stone's
        // throw to a mile across. These lie where they lie (the noise of the place, not of the ladder), so they are what the eye
        // holds on to while the grain of the ground changes under it as it draws back.
        { float veg = wGrass + wForest, lush = (nMic.g - 0.5) * 0.5 + (nFin.r - 0.5) * 0.35 + (nMid.b - 0.43) * 0.35, dryish = (nMic.r - 0.5) * 0.6 + (nFin.g - 0.5) * 0.4;
          tex *= (1.0 + lush * (0.36 + 0.44 * veg) * uGndV) * mix(vec3(1.0), vec3(1.0 + dryish * 0.45, 1.0, 1.0 - dryish * 0.6), veg * uGndV); }
        dl = clamp(dl, 0.12, 0.9); dl2 = dl; gHU = hU;
        forestFar = 1.0 - gndFarK(7.0);      // (how much of a wood's floor is seen, and not its canopy: only the floor lies in the trees' shade)
        land = mix(land, tex, gOn * uGndK.y);
        // autumn and winter colours for the deciduous belt; grass dries off in winter
        land = mix(land, land * vec3(1.38, 0.96, 0.5), fall * (wForest * 0.8 + wGrass * 0.12));
        land = mix(land, mix(land, vec3(0.42, 0.36, 0.3), 0.6), bare * wForest * 0.7);
        land = mix(land, land * vec3(1.06, 0.96, 0.74), winter * wGrass * 0.55);
        // snow on high cold ground and ice: it fills the hollows first, and what stands up in the ground shows through it longest
        if (snowW > 0.01) {
          // (near: by the hollows of the ground under it; far: by broken stretches, the size the eye can make out)
          float gNear = gndNear(6.0); gSnow = gnd(6.0); float sc = snowed ? 1.0 : smoothstep(0.35, 0.65, snowW + ((0.5 - hU) * 0.5 + (gSnow.a - 0.5) * 0.08 * gNear + (nMid.b + nMic.b - 0.87) * 0.22 * (1.0 - gNear)) * (1.0 - snowW));
          gSnowN = gndN(6.0); gSnowOn = 1.0;
          land = mix(land, mix(vec3(0.92, 0.94, 0.97), min(gSnow.rgb * vec3(0.9, 0.925, 0.96), vec3(1.02)), gOn), sc); gRel = mix(gRel, gSnowN, sc);
        }
        gRelK = gOn * uGndK.x;
      } else {
        land = mix(land, land * vec3(1.38, 0.96, 0.5), fall * (wForest * 0.8 + wGrass * 0.12));
        land = mix(land, mix(land, vec3(0.42, 0.36, 0.3), 0.6), bare * wForest * 0.7);
        land = mix(land, vec3(0.92, 0.94, 0.97), max(snow, ice * 0.95));
      }
      #else
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
      // bare dry ground is sand and stone only in true desert; in steppe and savanna it is dry grass
      float dryGrass = 1.0 - desertK;
      dS = mix(dS, dG * vec3(1.18, 1.02, 0.72), dryGrass);
      vec3 det = dF * wForest + dG * wGrass + dS * wDesert + dR * wRock;
      float dl = dot(det, vec3(0.299, 0.587, 0.114));
      det = mix(vec3(dl) * 0.5 + det * 0.5, det, smoothstep(0.0012, 0.0002, uCamAlt));   // photo grain only reads from low altitude
      float dl2 = dl, gHU = 0.5;
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
      float fall = autumn * decid; float bare = mix(uBare.y, uBare.x, hemi) * smoothstep(0.18, 0.4, latN0) * decid;
      land = mix(land, land * vec3(1.38, 0.96, 0.5), fall * (wForest * 0.8 + wGrass * 0.12));
      land = mix(land, mix(land, vec3(0.42, 0.36, 0.3), 0.6), bare * wForest * 0.7);
      land = mix(land, land * vec3(1.06, 0.96, 0.74), winter * wGrass * 0.55);
      float snow = smoothstep(snowLine0 - 150.0, snowLine0 + 700.0, vH) * (1.0 - smoothstep(0.35, 0.7, slope)) * mix(0.06 + 0.94 * white, 0.85, winterSnow * 0.8) * (1.0 - 0.55 * wForest);      // (in summer, where the photograph has it: at 611 m to a texel it knows every snowfield; a wood under snow is dark from above, its floor white between the trees)
      land = mix(land, vec3(0.92, 0.94, 0.97) * (0.8 + dl * 0.2), max(snow, ice * 0.95));
      #ifdef USE_TEXARR
      // ---------- generated ground: real grass, sand, rock and snow under the biome weights, from ~30 km down ----------
      float gOn = smoothstep(0.005, 0.0012, uCamAlt) * uTexMix;
      if (gOn > 0.002) {
        float dith = (nMic.r - 0.5) * 0.35 + (nFin.g - 0.5) * 0.15;
        float tropic = 1.0 - smoothstep(0.27, 0.31, latN0 + dith * 0.1);
        float savK = (clim + dith * 0.3 > 0.22 && tropic > 0.5 && warm > 0.3) ? 1.0 : 0.0;
        float gL = (savK > 0.5 || clim + dith * 0.3 > 0.42 || (lum + dith > 0.5 && green < 0.7)) ? 1.0 : 0.0;    // savanna and steppe (straw), meadow
        float fL = (vH > treeLine - 600.0 || latN0 + dith > 0.62) ? 8.0 : 7.0;                                  // tundra above the trees and in the far north, else forest floor
        float rL = (nMid.a + dith > 0.58) ? 11.0 : 5.0;                                                           // scree, bare rock
        float wD = wDesert > 0.02 ? wDesert : 0.0, wR = wRock > 0.02 ? wRock : 0.0;
        vec3 tex = gtex(uGround, gL, 4.0) * wGrass + gtex(uGround, fL, 4.0) * wForest;
        if (wD > 0.0) {
          // the dry ground of the place. True desert: dunes where the photograph is brightest, stony plain and stretches of
          // scrub elsewhere, salt flats where it is white; steppe: dry grass and scrub; savanna: straw grass, red earth in places;
          // a humid country lying bare: pale dry grass. Kinds of ground run into each other, they do not meet at an edge.
          float patchN = smoothstep(0.36, 0.64, nMac.g * 0.5 + nMid.b * 0.32 + nMic.r * 0.18);      // broad stretches with ragged edges, not spots of one size
          float isDesert = step(0.5, desertK + dith * 0.4), isSteppe = step(0.5, steppeK + dith * 0.4) * (1.0 - isDesert);
          float isSav = step(0.22, clim + dith * 0.3) * step(0.5, tropic) * (1.0 - isDesert) * (1.0 - isSteppe);
          float salt = isDesert * step(0.62, lum) * step(green, 0.25) * step(warm, 0.4);
          float sandW = isDesert * (1.0 - salt) * smoothstep(0.46, 0.7, lum + (nMac.r - 0.5) * 0.26 + (nMid.g - 0.5) * 0.035 + (nMic.g - 0.5) * 0.035);
          // three layers and their shares, chosen without branching (the texture lookups stay in step with their neighbours)
          float LA = mix(1.0, mix(4.0, 15.0, salt), isDesert);
          float LB = mix(mix(1.0, 2.0, isSteppe), 2.0, isDesert);
          float wB = patchN * (isDesert * (1.0 - salt) * (1.0 - sandW) + isSteppe * 0.8 + isSav * 0.45);
          vec3 dryTex = gtex(uGround, LA, 4.0) * (1.0 - wB - sandW) + gtex(uGround, LB, 4.0) * wB + gtex(uGround, 3.0, 4.0) * sandW;
          tex += dryTex * wD;
        }
        if (wR > 0.0) tex += gtex(uGround, rL, 4.0) * wR;
        tex /= max(wGrass + wForest + wD + wR, 1e-3);
        // savanna is tall straw-coloured grass; in stretches the red earth shows between the tufts (softly: no edge to it)
        { float redK = savK * smoothstep(0.5, 0.8, nMac.g * 0.45 + nMid.b * 0.4 + nMic.r * 0.15) * 0.5 * (wGrass + wD) / max(wGrass + wForest + wD + wR, 1e-3) * (1.0 - desertK) * (1.0 - steppeK);
          tex = mix(tex, gtex(uGround, 9.0, 4.0) * vec3(0.92, 0.95, 0.9), redK); }
        float bl = dot(texture(uGround, vec3(gcr(), gL)).rgb, vec3(0.299, 0.587, 0.114));                       // a rotated coarse copy breaks the repeat
        tex *= 0.74 + 0.52 * bl;
        float snowW = max(snow, ice * 0.95); if (snowW > 0.01) tex = mix(tex, gtex(uGround, 6.0, 4.0) * 1.04, snowW);
        float tl = dot(tex, vec3(0.299, 0.587, 0.114)), ll = dot(land, vec3(0.299, 0.587, 0.114));
        vec3 texLand = tex * pow(max(ll, 0.03) / max(tl, 0.05), 0.65);                                          // the imagery keeps its regional brightness
        texLand = mix(texLand, texLand * land / max(ll, 0.03), 0.3);                                             // and lends a share of its hue
        land = mix(land, texLand, gOn * 0.85);
      }
      #endif
      #endif
      // cultivation patchwork near settlements (sim channel b)
      // under the trees it is dim: where the forest stands the ground lies in the canopy's shade, dappled with light
      // (from the height at which single trees are drawn; farmland has cleared its share)
      { float canopy = wForest * smoothstep(0.0085, 0.005, uCamAlt) * (1.0 - cult * 0.6) * (1.0 - max(snow, ice));
        #ifdef USE_GROUND
        canopy *= forestFar * forestOpen;      // (few trees stand on the fell, and they throw little shade)
        land *= 1.0 - canopy * (0.30 + 0.26 * smoothstep(0.3, 0.58, nFin.b)) * mix(1.0, 0.45, bare); }      // (flecks of sun a few paces across)
        #else
        land *= 1.0 - canopy * (0.30 + 0.26 * nFin.a) * mix(1.0, 0.45, bare); }
        #endif
      if (cult > 0.03 && closeFade > 0.0) {
        // fields cluster around the settlement site (sim.a? no: site is unknown here) -> use noise clusters within the cell
        vec2 sc0 = geo * uSimRes; vec2 cellId0 = floor(sc0); vec2 inCell = sc0 - cellId0;
        vec2 site = vec2(0.3 + 0.4 * hash21(cellId0 + 11.0), 0.3 + 0.4 * hash21(cellId0 + 17.0));
        float dSite = length((inCell - site) * vec2(1.0, 1.0));
        float near = 1.0 - smoothstep(0.08 + cult * 0.25, 0.2 + cult * 0.4, dSite);
        near = mix(near, clamp(dec.a * 1.5, 0.0, 1.0), inDecal);   // inside the decal, fields hug the real settlement
        near *= 1.0 - smoothstep(0.04, 0.15, dec.b) * inDecal;      // and nothing is sown on the trodden ground of the town itself, nor on a road
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
          #ifdef USE_GROUND
          #define FT(L, sw) ltex(L, L == 5.0 ? 256.0 : 128.0, sw)
          #else
          #define FT(L, sw) gtexS(uLanduse, L, L == 5.0 ? 16.0 : 8.0, sw)
          #endif
          vec3 ft = FT(flB, step(0.5, hsB)) * (0.9 + 0.2 * hash21(bigId + 7.7));
          if (own > 0.01) {
            float hc = hash21(smallId + 5.3), hs = hash21(smallId + 9.1);
            float fl = (wet > 0.5 && hc < 0.6) ? 3.0 : hc < 0.35 ? 0.0 : hc < 0.55 ? 1.0 : hc < 0.68 ? 2.0 : hc < 0.84 ? 6.0 : (latN0 > 0.3 && latN0 < 0.55 && hc < 0.92) ? 4.0 : 5.0;
            ft = mix(ft, FT(fl, step(0.5, hs)) * (0.9 + 0.2 * hash21(smallId + 7.7)), own);
          }
          #undef FT
          fieldCol = mix(fieldCol, ft * (1.0 + (hash21(smallId + 4.4) - 0.5) * 0.14 * fine), gOn); fieldA = mix(0.7, 0.92, gOn);
        }
        #endif
        land = mix(land, fieldCol * (0.8 + 0.2 * fb), fieldOn * closeFade * fieldA * (1.0 - ice) * landW);
        #ifdef USE_GROUND
        gRelK *= 1.0 - 0.8 * fieldOn * closeFade * fieldA;      // (a field is worked ground: what lay there is ploughed in)
        #endif
      }
      // floodplain along raster river bands (the real channel is drawn by the decal), fertile halo along big rivers, roads
      land = mix(land, land * vec3(0.88, 0.97, 0.78), bandW * inDecal * 0.45 * (1.0 - ice));
      land = mix(land, land * vec3(0.78, 0.98, 0.66) + vec3(0.01, 0.05, 0.0), dec.a * 0.45 * (1.0 - ice) * (1.0 - cult));
      // the riverbank: grass and reeds in wet ground, green even where the country is desert (and greener along a great
      // river's whole valley floor there); a dark wet margin at the water's edge
      { float dry0 = clamp(wDesert * 1.6, 0.0, 1.0);
        float wet = max(bankW * (0.55 + 0.4 * dry0), dec.a * inDecal * dry0 * 0.55 * (1.0 - cult)) * (1.0 - ice) * (0.75 + 0.5 * nMic.g);
        #ifdef USE_GROUND
        // marsh at the water, dry grass taking over up the bank
        vec3 reed = vec3(0.30, 0.38, 0.16);
        if (gOn > 0.002 && wet > 0.01) { float up = smoothstep(0.2, 0.42, rivR + (nMic.b - 0.5) * 0.2); vec3 rd = vec3(0.0);
          if (up < 0.99) rd = gnd(1.0).rgb * vec3(0.42, 0.43, 0.20) * (1.0 - up);
          if (up > 0.01) { rd += gnd(10.0).rgb * vec3(0.27, 0.35, 0.15) * up; gRel = mix(gRel, gndN(10.0), up * clamp(wet, 0.0, 0.9)); }
          reed = mix(reed, rd, gOn); }
        #else
        vec3 reed = dG * vec3(0.62, 0.82, 0.48);
        #ifdef USE_TEXARR
        // marsh grass at the water, dry grass and scrub taking over up the bank
        if (gOn > 0.002) reed = mix(reed, mix(gtex(uGround, 1.0, 4.0) * vec3(0.82, 0.9, 0.62), gtex(uGround, 10.0, 4.0) * vec3(0.9, 0.95, 0.8), smoothstep(0.2, 0.42, rivR + (nMic.b - 0.5) * 0.2)), gOn);
        #endif
        #endif
        land = mix(land, reed * (0.85 + 0.3 * dl2), clamp(wet, 0.0, 0.9) * (0.55 + 0.45 * smoothstep(0.25, 0.6, nMid.g + (nMic.r - 0.5) * 0.5)));
        land *= 1.0 - 0.3 * smoothstep(0.38, 0.5, rivR) * (1.0 - vecRiver) * (1.0 - bridgeW); }
      // built-up ground (dec.b low values: packed earth, courtyards, lanes) and roads (high values)
      // what a town stands on follows its age: bare trodden earth until the classical world, stone flags in its
      // built-up heart from then on, concrete paving in the industrial and modern city
      float paves = smoothstep(0.26, 0.34, sim.g); float modernGround = smoothstep(0.6, 0.7, sim.g);
      float paved = smoothstep(0.3, 0.42, dec.b) * paves;
      #ifdef USE_GROUND
      // dry country: trodden ground is pale dust, not dark earth. The climate says so too, not only the photograph: a town of the
      // dry lands stands on dust even where the river has made the country round it green
      float arid = max(clamp(wDesert * 1.6, 0.0, 1.0), smoothstep(0.32, 0.6, clim));
      #else
      float arid = clamp(wDesert * 1.6, 0.0, 1.0);                         // dry country: trodden ground is pale dust, not dark earth
      #endif
      vec3 urbanCol = mix(mix(vec3(0.40, 0.35, 0.29), vec3(0.60, 0.52, 0.40), arid), mix(vec3(0.47, 0.45, 0.41), vec3(0.43, 0.43, 0.43), modernGround), paved);
      #ifdef USE_TEXARR
      if (gOn > 0.002 && dec.b > 0.04) {
        #ifdef USE_GROUND
        vec3 flags = vec3(0.5); if (paved > 0.004) { if (modernGround < 0.99) flags = ltex(9.0, 32.0, 0.0); if (modernGround > 0.01) flags = mix(flags, ltex(12.0, 32.0, 0.0), modernGround); }
        #else
        vec3 flags = mix(gtex(uLanduse, 9.0, 4.0), gtex(uLanduse, 12.0, 2.0), modernGround);
        #endif
        // (trodden earth: paler where the land is dry, and sand only in true desert)
        #ifdef USE_GROUND
        // (trodden earth has the relief of trodden earth, whatever grew there before; paving has none)
        // (and where feet go most, along the lanes and across the yards, it is beaten pale and bare)
        float trod = smoothstep(0.24, 0.4, dec.b);
        vec3 earth = vec3(0.5);
        if (paved < 0.996) { earth = gnd(14.0).rgb * mix(mix(vec3(0.40, 0.345, 0.27), vec3(0.53, 0.46, 0.36), trod), vec3(0.68, 0.565, 0.395), arid); float uw = smoothstep(0.04, 0.22, dec.b) * (1.0 - ice); gRel = mix(gRel, gndN(14.0), uw);
          if (desertK > 0.01) earth = mix(earth, gnd(3.0).rgb * vec3(0.70, 0.61, 0.43), desertK * 0.75); }
        urbanCol = mix(urbanCol, mix(earth, flags, paved), gOn);
        gRelK *= 1.0 - 0.85 * paved * smoothstep(0.04, 0.22, dec.b) * (1.0 - ice);
        #else
        urbanCol = mix(urbanCol, mix(mix(gtex(uGround, 14.0, 4.0) * (1.06 + 0.3 * arid), gtex(uGround, 3.0, 4.0) * 0.9, desertK * 0.75), flags, paved), gOn);
        #endif
      }
      #endif
      #ifdef USE_GROUND
      // (between the houses of a town that is not paved the ground is not all bare: off the beaten ways grass and weeds hold on, in patches)
      { float green0 = (1.0 - paves) * (1.0 - arid) * smoothstep(0.42, 0.6, nMic.b * 0.6 + nFin.r * 0.4 + nFin.b * 0.25) * (1.0 - smoothstep(0.2, 0.34, dec.b));
        land = mix(land, urbanCol * (0.8 + 0.4 * dl2), smoothstep(0.04, 0.22, dec.b) * mix(mix(0.72, 0.88, arid) - 0.42 * green0, 0.9, smoothstep(0.3, 0.45, dec.b)) * (1.0 - ice)); }
      #else
      land = mix(land, urbanCol * (0.8 + 0.4 * dl2), smoothstep(0.04, 0.22, dec.b) * mix(0.7, 0.9, smoothstep(0.3, 0.45, dec.b)) * (1.0 - ice));
      #endif
      // burnt and ash-covered ground (fresh fire black, old scars grey-brown with new green coming through)
      vec3 burnCol = mix(vec3(0.30, 0.27, 0.22), vec3(0.11, 0.1, 0.095), smoothstep(0.3, 0.9, burnW)) * (0.75 + 0.5 * nMic.g);
      land = mix(land, burnCol * (0.8 + 0.4 * dl2), smoothstep(0.03, 0.25, burnW) * (0.7 + 0.3 * nMid.r) * (0.75 + 0.25 * smoothstep(0.3, 0.6, nMic.a)) * (1.0 - ice));
      vec3 roadCol = mix(mix(mix(vec3(0.44, 0.36, 0.26), vec3(0.58, 0.50, 0.38), arid), vec3(0.56, 0.53, 0.48), smoothstep(0.55, 0.75, dec.b)), vec3(0.30, 0.30, 0.31), smoothstep(0.8, 0.95, dec.b));
      #ifdef USE_TEXARR
      if (gOn > 0.002 && dec.b > 0.4) {   // dirt tracks, then cobbles, then asphalt; railway lines run on ballast
        #ifdef USE_GROUND
        vec3 rt;
        if (dec.b > 0.95) rt = gnd(11.0).rgb * vec3(0.36, 0.34, 0.31); else if (dec.b > 0.8) rt = ltex(10.0, 32.0, 0.0); else if (dec.b > 0.62) rt = ltex(8.0, 32.0, 0.0);
        else { rt = gnd(14.0).rgb * vec3(0.40, 0.33, 0.25); if (arid > 0.01) rt = mix(rt, gnd(3.0).rgb * vec3(0.62, 0.54, 0.39), arid * 0.75); }   // a track through dry country is beaten dust
        gRelK *= 1.0 - 0.7 * smoothstep(0.55, 0.75, dec.b);
        #else
        vec3 rt = dec.b > 0.95 ? gtex(uGround, 11.0, 4.0) * 0.8 : dec.b > 0.8 ? gtex(uLanduse, 10.0, 4.0) : dec.b > 0.62 ? gtex(uLanduse, 8.0, 2.0) : mix(gtex(uGround, 14.0, 4.0) * 0.9, gtex(uGround, 3.0, 4.0) * 0.8, arid * 0.75);   // a track through dry country is beaten dust
        #endif
        roadCol = mix(roadCol, rt, gOn);
      }
      #endif
      land = mix(land, roadCol * (0.85 + 0.3 * dl), smoothstep(0.4, 0.7, dec.b) * (1.0 - ice));
      // winter where winters are white: snow lies over the country for as long as the climate keeps it (weeks in a mild
      // one, and then in patches; half the year in the taiga). Beaten tracks and trodden town ground show through.
      float snowLying = 0.0, snowCov = 0.0;
      { float cold = info.b, coldNow = mix(uBare.w, uBare.z, hemi);
        #ifdef INFO2
        // (Where, and for how much of the year: as the Earth has it - snowHere, above. By the climate's class alone a cold desert
        //  lay white from the Tarim to the Namib and a tundra from Siberia to the Puna of the Andes, and Tibet, dry and all but
        //  bare in winter, was an ice cap. Snow of so much of the season lies for just so long about the depth of winter:
        //  snowOff is how far the year is from that, 0 late in January and 1 half a year on, and the cold season is 0.58 of
        //  the year. It comes and goes over three weeks, and where there is little of it in any winter it is thin in all of
        //  them: it does not end at a line but thins out over a hundred kilometres and more, lying on open ground long after
        //  the woods show dark through it. The noise of the place roughens its edge from close to, and is left out long
        //  before a repeat of it is small in the picture (the largest repeats every forty kilometres: from six hundred up,
        //  the thinning snow of Poland was a wallpaper of dark dots). Nor is there any noise the size of a country in it:
        //  thinning out by that, the snow of a plain seen from far out was white puffs on green, like cloud.)
        float rag = (nMac.g - 0.512) * 0.5 * (1.0 - smoothstep(0.0, 1.5, noiseL + 7.23)) + (nMid.g - 0.512) * 0.3 * (1.0 - smoothstep(0.0, 1.5, noiseL + 10.23)) + (nMic.g - 0.512) * 0.2 * (1.0 - smoothstep(0.0, 1.5, noiseL + 13.13)) + (nFin.g - 0.512) * 0.12 * (1.0 - smoothstep(0.0, 1.5, noiseL + 15.29));
        float sn = snowHere + rag * smoothstep(0.02, 0.2, snowHere), snowOff = acos(clamp(2.0 * coldNow - 1.0, -1.0, 1.0)) * 0.31831;
        float lying = clamp((sn * 0.58 - snowOff) / 0.2 + 0.5, 0.0, 1.0) * smoothstep(0.02, 0.4, sn); snowLying = lying;
        #else
        // (Snow lies on low ground only well away from the tropics. By the climate's map a cold desert is the Namib too, and a tundra
        //  the Puna of the Andes: each lay under a white sheet all its winter. Climates of mild winters keep snow from some forty
        //  degrees, or high up; the hard ones wherever they are found outside the tropics.)
        cold *= smoothstep(0.30, 0.42, latN0) * mix(smoothstep(0.34, 0.46, latN0 + max(vH - 800.0, 0.0) / 7000.0), 1.0, smoothstep(0.55, 0.72, cold));
        float thr = 1.02 - 0.55 * cold;
        float lying = smoothstep(thr, thr + 0.1, coldNow) * smoothstep(0.08, 0.5, cold); snowLying = lying;
        #endif
        if (lying > 0.003) {
          // (where it thins out it lies on open ground before the woods - the photograph's own light and dark say which is which,
          //  field by field - and from close to in the hollows of the ground, in patches, as the snow of the heights does. That
          //  grain is what tells snow from cloud: laid on evenly as it thinned, the snow of a plain seen from far out was a white
          //  haze over the country.)
          // (How sharply a patch ends goes by how large the grain is in the picture: where a field of the photograph is a pixel, the
          //  snow fades as it thins; where it is many - from a hundred kilometres down - a patch has an edge, or thinning snow is
          //  a white mist over the country.)
          float open = clamp((lum0 - 0.2) * 3.0, -0.3, 0.4) * smoothstep(0.2, 0.6, green);      // (in green country: bare ground is light and says nothing by it)
          float edgeW = mix(0.05, 0.2, smoothstep(-7.5, -4.5, noiseL)) + 0.25 * smoothstep(-4.5, -2.5, noiseL);      // (and from where a country is a hand's breadth it fades as it thins: there is no grain left to make patches of, and the snow of Poland ended at a shore)
          // (and on the slopes that face away from the sun before those that face it - in bare country, where the photograph has no
          //  fields and woods to tell apart, the lie of the land is the grain: by height alone the thin snow of a high plain
          //  was a white pancake cut out along a contour)
          float shady = clamp(nEnu.y * (vLat >= 0.0 ? 1.0 : -1.0) * 1.6, -0.5, 0.5);
          float cover = smoothstep(0.5 - edgeW, 0.5 + edgeW, lying + ((0.5 - gHU) * 0.6 + open * 0.6 + shady * 0.7) * (1.0 - lying) * smoothstep(0.0, 0.25, lying));
          // (a wood under snow is dark from above: the snow is on its floor, and the eye sees the trees - through bare boughs more of it)
          cover *= (1.0 - smoothstep(0.3, 0.65, slope)) * (1.0 - 0.75 * smoothstep(0.4, 0.7, dec.b)) * (1.0 - 0.45 * smoothstep(0.04, 0.22, dec.b)) * (1.0 - wForest * (1.0 - smoothstep(0.14, 0.32, lum0)) * mix(0.55, 0.3, bare));      // (the darker the photograph has it, the more of a wood it is)
          vec3 snowCol = vec3(0.92, 0.94, 0.97) * (0.82 + dl2 * 0.2);
          #ifdef USE_TEXARR
          #ifdef USE_GROUND
          if (gOn > 0.002 && cover > 0.004) { if (gSnowOn < 0.5) { gSnow = gnd(6.0); gSnowN = gndN(6.0); } snowCol = mix(snowCol, min(gSnow.rgb * vec3(0.9, 0.925, 0.96), vec3(1.02)), gOn * 0.85); gRel = mix(gRel, gSnowN, cover * 0.9 * (1.0 - ice)); }
          #else
          if (gOn > 0.002) snowCol = mix(snowCol, gtex(uGround, 6.0, 4.0) * 1.04, gOn * 0.85);
          #endif
          #endif
          snowCov = cover * 0.96 * (1.0 - ice); land = mix(land, snowCol, snowCov);
        } }
      // beach: a sand strip where the land runs down into the sea
      // (only on the sea's side of the shore line: a lake's shore is grass or forest to the water, and snow lies on a beach as on anything)
      float beach = (1.0 - smoothstep(0.40, 0.52, a)) * landW * closeFade * (1.0 - ice) * (1.0 - lakeW) * (1.0 - bandW) * (1.0 - snowLying * 0.85);
      // (By the field of the water's edge a beach has a width in metres: wide where the land comes down flat to the sea, none
      //  under a steep shore, and not the same all along a coast. Seen from so far that a pixel is wider than the beach, it
      //  has its share of the pixel.)
      float beachW = mix(120.0, 12.0, smoothstep(0.03, 0.17, slope)) * (0.3 + 1.4 * nMid.g) * uWaterK.y;
      beachW *= clamp(0.75 + wBend * 220.0, 0.12, 1.6);      // (sand gathers in a bay and is washed off a headland: a rock in the sea is rock)
      if (wOn > 0.5) beach = (1.0 - smoothstep(beachW * 0.45, beachW, wD)) * step(0.0, wD + wPx) * (1.0 - wK) * landW * (1.0 - ice) * (1.0 - snowLying * 0.85) * clamp(beachW / max(wPx, 1e-3), 0.0, 1.0);
      vec3 beachCol = vec3(0.82, 0.76, 0.6) * (0.85 + 0.3 * dl);
      #ifdef USE_TEXARR
      #ifdef USE_GROUND
      if (gOn > 0.002 && beach > 0.01) { float bl = nMid.g > 0.55 && (wOn < 0.5 || slope > 0.05 || wBend < -0.0015) ? 13.0 : 19.0;      /* (shingle under a steep shore and round a headland; a long flat beach is sand) */ beachCol = mix(beachCol, gnd(bl).rgb * (bl < 15.0 ? vec3(0.60, 0.56, 0.50) : vec3(0.86, 0.79, 0.62)), gOn); gRel = mix(gRel, gndN(bl), beach * 0.75); }
      #else
      if (gOn > 0.002 && beach > 0.01) beachCol = mix(beachCol, gtex(uGround, nMid.g > 0.55 ? 13.0 : 3.0, 4.0) * 1.08, gOn);
      #endif
      #endif
      land = mix(land, beachCol, beach * 0.75);
      // ---------- water ----------
      // How deep it is: by the field, the metres out from the shore times how fast the bottom falls there (gently on a shelf,
      // fast where the deep sea comes up to the coast); without the field, by the shelf alone. Through the first metres the
      // bottom shows: pale where sand lies (a bay), dark under a headland; red light goes first, then green, and what is left
      // of deep water is its own blue. All of it is what comes up out of the water: what the surface mirrors is added last.
      float shelf = info.r, off = max(-wD, 0.0), shelf2 = shelf * shelf;
      float depthFar = mix(400.0, 14.0, smoothstep(0.6, 1.0, shelf));        // (what the shelf says, far from any shore and where the field is not: a shelf sea is a lighter, greener blue than the deep)
      // (The bottom falls away as the land above the shore rises: under a hill the water is deep a stone's throw out, off a flat
      //  coast one can wade for a furlong. The ground's height a little way inland of the nearest shore tells which.)
      float bedFall = 0.03;
      #ifndef WATER_PLAIN
      if (wOn > 0.5 && uWaterP.x < 1.5 && off > 0.0 && off < (wK > 0.5 ? 1800.0 : 900.0)) bedFall = clamp((hAt(vUV + wLand * (off + 260.0)) - vH) / 260.0 * 0.7, 0.016, 0.45);      // (above the water's own level, which is what the mesh has here: a lake a mile up is not deep at once for standing high)
      #endif
      float depthSea = wOn > 0.5 ? min(off * max(bedFall, mix(0.09, 0.0, shelf2)) + off * off * mix(4e-4, 8e-6, shelf2), depthFar) : depthFar;
      float clear = uSeaK.z * mix(1.0, 0.5, smoothstep(0.42, 0.62, abs(vLat) / (0.5 * PI)));      // (warm seas are clear; the green seas of the north are not)
      float sandy = wOn > 0.5 ? mix(clamp(0.62 + wBend * 260.0, 0.12, 1.0), 0.62, smoothstep(4.0, 12.0, depthSea)) : 0.8;      // (sand in a bay, rock under a headland - where the bed can be seen. Deeper, one bed for all: a shelf sea is tinted by its bed everywhere, and round every islet the rock's tint was a dark stain a quarter of a mile wide)
      vec3 seaDeep = mix(vec3(0.016, 0.070, 0.165), vec3(0.030, 0.150, 0.215), pow(shelf, 1.5)) * mix(1.0, 0.82, 1.0 - clear);
      vec3 seaBed = mix(vec3(0.15, 0.18, 0.15), vec3(0.66, 0.63, 0.47), sandy);      // (wet sand under water is no longer the pale of a beach)
      #ifdef USE_TEXARR
      #ifdef USE_GROUND
      #define gOnS gOn0
      #else
      #define gOnS gOn
      #endif
      { float shal = (1.0 - smoothstep(4.0, 9.0, depthSea)) * seaW * gOnS;   // sunlit sand and caustics in the shallows, drifting slowly
        #ifdef USE_GROUND
        #define SHAL(c) texture(uGnd, vec3(c, uGndShal)).rgb
        #else
        #ifdef DET_SHALLOWS
        #define SHAL(c) texture(uDet, vec3(c, 4.0)).rgb
        #else
        #define SHAL(c) texture2D(uShallows, c).rgb
        #endif
        #endif
        if (shal > 0.01) {
          // seen from higher up the same square of caustics repeats into a grid of dots: a coarser copy takes over with
          // height, and a turned one lays its own light and dark across both
          vec2 drift = vec2(uTime * 0.012, -uTime * 0.008); float farK = smoothstep(0.00003, 0.00016, uCamAlt);
          vec3 sh = mix(SHAL(gcf(8.0) + drift), SHAL(gcf(16.0) + drift * 0.5), farK) * (0.72 + 0.56 * dot(SHAL(gcr() - drift * 0.3), vec3(0.299, 0.587, 0.114)));
          seaBed = mix(seaBed, sh * vec3(1.0, 1.0, 0.9), shal * sandy * mix(0.85, 0.5, farK));
        } }
        #undef SHAL
      #endif
      vec3 water = mix(seaDeep, seaBed, exp(-vec3(0.46, 0.095, 0.060) * depthSea / max(clear, 0.05)));
      // lakes: clear and blue-green where the summers are warm, dark as tea in the north (peat, and depth); high in the
      // mountains milky with what the ice grinds. Their shallows are a few metres of mud and stones.
      float depthLake = wOn > 0.5 ? off * clamp(bedFall * 0.8, 0.045, 0.3) : 30.0;      // (never shallower than that: the heights are in steps of seven metres and more, and by them alone the shallows of a river through flat country came and went in scallops)
      float highDry = max(arid, smoothstep(2600.0, 3600.0, vH));      // (the lakes of the high plateaus, Tibet's and the Altiplano's, and of dry mountains: clear and very blue, where a taiga lake is dark with peat and a lake under a glacier milky)
      float peat = smoothstep(0.2, 0.9, info.b) * (1.0 - highDry);
      vec3 lakeDeep = mix(mix(vec3(0.030, 0.125, 0.160), vec3(0.032, 0.090, 0.120), peat), mix(vec3(0.085, 0.300, 0.330), vec3(0.040, 0.205, 0.410), highDry), smoothstep(1500.0, 3000.0, vH) * (1.0 - peat * 0.5));
      // (A great river is in the field as fresh water too, bank to bank, and often in pieces, where it is wide enough: narrow
      //  water between flat banks. It is given a river's water, as the game's own rivers have it beside it and between its
      //  pieces: shallows a furlong wide, pale and green, over a blue channel; brown with silt in dry country. A small lake of
      //  the plain is the same water. Not the peat lakes of the north, nor a lake between mountains, deep from the shore.)
      float riverish = wOn * (1.0 - smoothstep(0.30, 0.62, wOpen)) * (1.0 - smoothstep(0.06, 0.16, bedFall)) * (1.0 - peat);      // (flat: not turned by one step of the heights, seven to twenty-seven metres - by those alone a pool had the two waters in patches, cut where its nearest bank changes)
      lakeDeep = mix(lakeDeep, mix(vec3(0.03, 0.15, 0.25), vec3(0.36, 0.34, 0.24), arid * 0.4), riverish);
      depthLake = mix(depthLake, off * 0.015, riverish);
      vec3 inland = mix(lakeDeep, mix(vec3(0.40, 0.38, 0.27), vec3(0.23, 0.41, 0.36), riverish), exp(-vec3(0.60, 0.20, 0.16) * (depthLake * (1.0 + 3.0 * peat))) * 0.85);      // (peat water hides its bed within a step from the shore)
      // ---------- waves ----------
      // Four sizes of one picture of a ruffled surface, each drifting its own way (repeats of 40 m, 160 m, 640 m and 2.5 km:
      // ripples, waves, the swell, the wind's patches). The card averages each as it grows small in the picture, and what is
      // averaged away is not gone: it is how rough the water is within a pixel (the shorter the averaged normal, the more),
      // which is what spreads the sun's image into a path and lifts what the sea mirrors at the horizon above the horizon.
      float seaShare = seaW / max(seaW + lakeW + vecRiver * (1.0 - seaW), 1e-3);
      // (the wind does not lie evenly on the water. Its patches are the noise of the place, which repeats every forty kilometres
      //  and every five: from far out they were a lattice of dots in the sun's path, so each size gives way to its mean
      //  before its repeat is small in the picture)
      float gust = mix(0.45, 1.15, smoothstep(0.25, 0.75, mix(nMid.g, 0.512, smoothstep(0.0, 1.5, noiseL + 10.23)) * 0.65 + mix(nMac.g, 0.512, smoothstep(0.0, 1.5, noiseL + 7.23)) * 0.35));
      float lee = smoothstep(0.25, 0.9, wOpen);                                                     // (0 in a harbour, a cove, a narrow sound; 1 where the water lies open)
      float fetch = wOn > 0.5 ? mix(0.35, 1.0, smoothstep(40.0, 900.0, off)) * mix(0.4, 1.0, lee) : 1.0;      // (nor do waves grow in the lee of a shore)
      float amp = uSeaK.x * gust * mix(mix(0.14, 0.5, smoothstep(0.5, 1.0, wOpen)), fetch, seaShare);      // (a pond lies still, a great lake has its waves)
      vec2 wSlope = vec2(0.0); float wRough = mix(0.0003, 0.0010, seaShare);
      vec2 gdx = dFdx(vGL) * 50.0, gdy = dFdy(vGL) * 50.0;      // (how the place runs across the pixel: taken here, where every pixel passes; the lookups below are only made on water)
      #ifndef WATER_PLAIN
      if (max(max(seaW, lakeW), max(vecRiver, floodW)) > 0.003 && uSeaK.w < 0.5) {
        // (Each size is laid askew by the noise of the place, as the ground's materials are: one picture repeated straight
        //  across twenty miles of sea showed in the sun's path as a lattice, and on a lake from a mile up as rows of dots.
        //  A size is bent by noise some four of its repeats long and more, and by half a repeat or so: bent by grain as
        //  small as itself the waves are smeared, by less than that the rows stay rows.)
        #define WAVES(m, M, drift) (textureGrad(uWaterN, gc(m) * M + drift, (gdx * m) * M, (gdy * m) * M).rgb * 2.0 - 1.0)
        vec3 o1 = WAVES(3200.0, mat2(1.0, 0.0, 0.0, 1.0), (nMid.bg - 0.5) * 1.2 + (nMic.bg - 0.5) * 0.2 + vec2(uTime * 0.046, uTime * 0.021));
        vec3 o2 = WAVES(800.0, mat2(0.8, 0.6, -0.6, 0.8), (nMid.gb - 0.5) * 1.3 + (nMic.rg - 0.5) * 0.12 - vec2(uTime * 0.017, -uTime * 0.009));
        vec3 o3 = WAVES(200.0, mat2(0.6, -0.8, 0.8, 0.6), (nMac.rb - 0.5) * 1.6 + (nMid.rg - 0.5) * 0.2 + vec2(uTime * 0.0061, uTime * 0.0034));
        vec3 o4 = WAVES(50.0, mat2(-0.28, 0.96, -0.96, -0.28), (nMac.gr - 0.5) * 0.7 - vec2(uTime * 0.0019, uTime * 0.0011));
        #undef WAVES
        vec4 ak = vec4(0.55, 0.62, 0.50, 0.34) * amp; ak.zw *= mix(0.4, 1.0, seaShare);      // (a lake has little swell: but one size alone on the water is a lattice)
        wSlope = o1.xy / max(o1.z, 0.4) * ak.x + (o2.xy / max(o2.z, 0.4)) * mat2(0.8, -0.6, 0.6, 0.8) * ak.y + (o3.xy / max(o3.z, 0.4)) * mat2(0.6, 0.8, -0.8, 0.6) * ak.z + (o4.xy / max(o4.z, 0.4)) * mat2(-0.28, -0.96, 0.96, -0.28) * ak.w;
        vec4 lost = clamp(1.0 - vec4(dot(o1, o1), dot(o2, o2), dot(o3, o3), dot(o4, o4)) - 0.03, 0.0, 0.07);
        wRough += dot(lost, ak * ak);
      }
      #endif
      vec3 nWater = normalize(vec3(-wSlope, 1.0));
      // ---------- surf ----------
      // Where the bottom comes up under them the waves of the sea break: lines of white water running in along the shore,
      // more of them on a coast that lies open and under a headland than in a bay, none on a lake. From too far to tell
      // the lines apart, a pale fringe.
      float foam = 0.0, wetSand = 0.0;
      float surfK = mix(0.45 * smoothstep(0.8, 1.0, wOpen), smoothstep(0.30, 0.95, wOpen), 1.0 - wK);      // (the sea breaks where it comes in from the open; of lakes only the great ones have surf, and less)
      #ifndef WATER_PLAIN
      if (wOn > 0.5 && uWaterP.x < 1.5 && surfK > 0.01 && wD > -260.0 && wD < 14.0) {
        float open = clamp(0.85 - wBend * 200.0, 0.25, 1.5) * (1.0 - 0.75 * smoothstep(0.0045, 0.009, -wBend)) * (0.55 + 0.8 * nMac.b) * uSeaK.y * surfK;      // (round a rock a few steps across the lines of surf were rings of chain)
        // (The swell comes from one side: a shore that looks toward it has the surf, a lee shore a third of it - lines of surf
        //  all round an islet were rings, like a target. It comes as the winds of the Earth blow: out of the west between
        //  thirty and sixty degrees, with the trades out of the east in the tropics, a little toward the equator in both,
        //  and turned some way by the noise of the place.)
        { float la = abs(vLat) * 57.2958, hs = vLat >= 0.0 ? 1.0 : -1.0, wst = smoothstep(24.0, 34.0, la) * (1.0 - smoothstep(60.0, 68.0, la)), sa = (nMac.r - 0.5) * 1.6;
          vec2 sw = normalize(mix(vec2(-0.8, 0.5 * hs), vec2(0.9, 0.3 * hs), wst)); sw = vec2(sw.x * cos(sa) - sw.y * sin(sa), sw.x * sin(sa) + sw.y * cos(sa));      // the way the swell goes: east, south
          vec2 toLand = wLand * vec2(tileWm, tileHm);
          open *= mix(0.3, 1.0, smoothstep(-0.4, 0.5, dot(toLand, sw))); }      // (a lee shore keeps a third: the east coasts of the continents have their surf too, only less)
        float zone = mix(48.0, 125.0, shelf2) * (0.7 + 0.6 * nMid.b);                // how far out they begin to break, metres
        float inZone = (1.0 - smoothstep(zone * 0.35, zone, off)) * step(0.0, off - 0.01);
        float lam = 34.0, ph = off / lam + uTime * 0.11 + (nMic.g - 0.5) * 1.6 + (nMid.b - 0.5) * 4.0, f = fract(ph);
        vec4 fz = textureLod(uNoise, gc(180.0) + vec2(floor(ph) * 0.37, uTime * 0.004), max(log2(max(length(gdx), length(gdy)) * 184320.0), 2.0));        // (what breaks a line of surf into pieces, another for every wave; its level is told, for the pieces change from one wave to the next)
        // a wave breaks along a stretch of itself at a time, not from end to end of the coast; white at its front, a trail behind
        float piece = smoothstep(0.40, 0.56, fz.r * 0.6 + fz.b * 0.4 + (open - 0.8) * 0.2);
        float line = (exp(-f * 4.2) + 0.3 * exp(-(1.0 - f) * 18.0)) * piece * mix(0.6, 1.0, 1.0 - smoothstep(0.0, zone, off));
        float lace = smoothstep(0.42, 0.78, fz.g * 0.6 + nFin.r * 0.4) * 0.6 * (1.0 - smoothstep(0.0, zone * 0.55, off));       // the lace the last wave left behind, close in
        float fine = 1.0 - smoothstep(lam * 0.10, lam * 0.26, wPx);
        foam = clamp(mix(0.14 * (0.4 + 1.2 * nMid.g), max(line * 1.3, lace), fine) * inZone * open, 0.0, 1.0) * wCov;
        // the edge itself: white where the water runs out on the sand or is thrown up a rock, here and there
        foam = max(foam, (1.0 - smoothstep(0.0, 2.6, abs(wD + 0.8))) * smoothstep(0.42, 0.68, fz.g * 0.5 + nFin.g * 0.5) * 0.8 * fine * clamp(open, 0.0, 1.0) * step(wPx, 2.5));
        wetSand = (1.0 - smoothstep(1.0, 11.0, wD)) * step(0.0, wD) * (1.0 - wK);
      }
      #endif
      // vector rivers: shallow bright banks, dark deep channel, a pale wet bank line
      float rdepth = smoothstep(0.52, 0.95, rivR) * (0.5 + 0.5 * dec.g);
      vec3 riverCol = mix(vec3(0.20, 0.37, 0.34), vec3(0.03, 0.15, 0.25), rdepth);
      riverCol = mix(riverCol, vec3(0.36, 0.34, 0.24), arid * 0.4 * (1.0 - rdepth * 0.5));        // the rivers of dry countries run brown with silt
      // (where the field has the water, a lake or a great river, it has its colour too: the game's own line of a river runs the
      //  length of Lake Geneva, and with a river's pale banks about it that was a stripe of shallows down the middle of the lake)
      inland = mix(inland, riverCol, wOn > 0.5 ? vecRiver * (1.0 - lakeW) : vecRiver);
      inland = mix(inland, vec3(0.36, 0.33, 0.22), floodW * 0.85);
      // where the snow lies long, still water freezes: lakes and rivers under white ice (blown clear in places), and in
      // the hardest winters the sea stands fast along the shore
      #ifdef INFO2
      // (by the snow of its shores, counted for a third as much again - a lake freezes where snow would lie on open ground, and the
      //  map has too little of it among woods - and on the sea's slower clock: a lake freezes weeks after the first snow and
      //  is open weeks after the last. By the snow lying at the moment, Ladoga was open water in March. Not where a month of
      //  snow is all the winter there is: from far out the Danish straits are a lake to the picture's map.)
      float iceOff = acos(clamp(2.0 * mix(uIceCold.y, uIceCold.x, hemi) - 1.0, -1.0, 1.0)) * 0.31831;      // (how far the year is from the end of winter: 0 early in March, 1 half a year on)
      // (Where the sea beside it freezes, a water freezes as that sea does and not by this rule: from far out a strait is a lake to
      //  the picture's map, and by the snow of Sweden the Danish belts were ice into April.)
      float iceIn = natv.g * 1.2 - 0.1 - iceOff;
      // (High dry country has its hard winters without the snow: the lakes of Tibet freeze under a sky that brings none. And a
      //  lake freezes from its shores: out in a great one the ice comes weeks later and goes weeks sooner.)
      float coldShare = smoothstep(0.85, 1.0, info.b) * smoothstep(0.27, 0.36, latN0) * 0.55;
      float lakeSeason = max(snowHere, coldShare) * 0.75 - 0.08 - (wOn > 0.5 ? 0.07 * smoothstep(300.0, 3000.0, off) : 0.0);
      float frozen = max(smoothstep(0.0, 0.06, lakeSeason - iceOff) * max(smoothstep(0.3, 0.6, info.b), smoothstep(0.5, 0.8, snowHere)) * (1.0 - smoothstep(0.02, 0.06, natv.g)), smoothstep(0.01, 0.05, iceIn));      // (hard winters from 0.6 by the climate's class - Winnipeg's are 0.72 - or wherever snow lies for four months and more: a tarn of the Alps, a lake of the Qilian)
      #else
      float frozen = snowLying * smoothstep(0.5, 0.85, info.b);
      #endif
      // (blown clear in places, of a size the eye can make out: each size of the noise gives way to its mean before its repeat is
      //  small in the picture - from forty kilometres up Ladoga's ice was a wallpaper of blots)
      vec3 lakeIce = mix(vec3(0.70, 0.78, 0.84), vec3(0.90, 0.93, 0.96), smoothstep(0.3, 0.7, mix(nMac.b, 0.434, smoothstep(0.0, 1.5, noiseL + 7.23)) * 0.6 + mix(nMid.b, 0.434, smoothstep(0.0, 1.5, noiseL + 10.23)) * 0.25 + nMic.a * 0.15)) * (0.86 + 0.2 * dl);
      inland = mix(inland, lakeIce, frozen * 0.94);
      nWater = normalize(mix(nWater, vec3(0.0, 0.0, 1.0), frozen * 0.85));       // ice does not ripple
      // ice on the sea
      #ifdef INFO2
      // (Where, and for how much of the year: the sea's own - natv.g is the share of the year's twelve months in which the sea
      //  there is ice (tools/planet/snow.py, from the Sea Ice Index). By the latitude alone, in winter there was ice off
      //  Scotland, where the sea never freezes, as in Hudson Bay, where it does for seven months. The sea is slow: its ice is
      //  widest eleven weeks behind the sun (uIceCold), and ice of so many months lies for just so many about that time:
      //  iceOff is how far the year is from it, 0 at the end of winter and 1 half a year on. A month and more is asked
      //  before there is any (a radiometer's cell on a shore sees the land with the sea and takes it for some ice: the
      //  Danish straits froze every March), and what is ice all the year stays.)
      float seaIce = smoothstep(0.01, 0.05, iceIn) * seaW;
      float floe = smoothstep(0.35, 0.65, mix(nMid.b, 0.434, smoothstep(0.0, 1.5, noiseL + 10.23)) + 0.3 * nMic.a) * smoothstep(0.02, 0.22, iceIn);
      #else
      float iceEdge = 0.86 - 0.22 * winter;                               // the pack ice spreads toward the equator in the hemisphere's winter
      float seaIce = smoothstep(iceEdge - 0.08, iceEdge + 0.04, latN0 + (nMac.r - 0.5) * 0.08 * (1.0 - smoothstep(0.0, 1.5, noiseL + 7.23))) * seaW;
      float floe = smoothstep(0.35, 0.65, nMid.b + 0.3 * nMic.a) * smoothstep(0.0, 0.08, latN0 - iceEdge + 0.1);
      #endif
      vec3 iceCol = mix(vec3(0.74, 0.82, 0.9), vec3(0.9, 0.93, 0.96), floe);
      water = mix(water, iceCol, seaIce * mix(0.55, 1.0, floe));
      #ifdef INFO2
      float seaFast = 0.0;      // (the sea's ice is the sea's own now: none along a shore because the land beside it is white)
      #else
      float seaFast = frozen * (wOn > 0.5 ? 1.0 - smoothstep(300.0, 1500.0, off) : smoothstep(0.86, 0.97, shelf));
      water = mix(water, lakeIce, seaFast * 0.94);
      #endif
      float iced = max(max(seaIce * mix(0.55, 1.0, floe), seaFast) * seaShare, frozen * (1.0 - seaShare));      // how much of the water here is ice (it mirrors nothing)
      foam *= 1.0 - iced;
      land = mix(land, land * vec3(0.66, 0.68, 0.72), wetSand * beach);          // the sand the last wave wetted
      // ---------- compose surface ----------
      float inlandMix = max(max(inlandW * mix(0.9, 0.7, closeFade), lakeW * (wOn > 0.5 ? 1.0 : 0.95)), vecRiver * 0.97);   // a river is water from bank to bank, and a lake from shore to shore, not a tint on the ground
      vec3 col = mix(land, inland, inlandMix) * landW + water * seaW;
      float wetAll = clamp(seaW + max(lakeW, max(vecRiver * 0.97, floodW * 0.8)) * landW, 0.0, 1.0);      // how much of the pixel is water that mirrors (not the far river country)
      col = mix(col, mix(vec3(0.33, 0.25, 0.17), vec3(0.50, 0.48, 0.44), paves) * (0.78 + 0.44 * nFin.r), bridgeW * landW);     // the deck of the crossing
      col = mix(col, vec3(0.94, 0.95, 0.96), foam);
      float flatW = max(1.0 - landW, min(1.0, inlandW * 1.4));        // rivers and lakes lie flat and ripple, whatever the slope they cross
      #ifdef USE_GROUND
      // the relief of what the ground is made of, laid over the lie of the land
      { vec2 r = gRel * gRelK; nEnu = normalize(vec3(nEnu.xy * sqrt(max(1.0 - dot(r, r), 0.04)) + r * nEnu.z, nEnu.z * sqrt(max(1.0 - dot(r, r), 0.04)))); }
      #endif
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
      float diff = mix(max(dot(nV, sunV), 0.0), max(sunUp, 0.0), wetAll * (1.0 - foam));      // (what comes up out of water is lit by how high the sun stands, not by the lie of a wave)
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
      float sunVis = shadow * cloudShadow; diff *= sunVis;
      // the light of the hour (models.js, buildings.js and the trees take the same from the world's uniforms): a low sun
      // is warm and, the eye opening to it, strong; night is blue and enough to see by; dusk lends a rose glow
      // (from far out day and night are seen together: the eye is not opened to the low sun there, and the edge of night is a narrow band)
      float downHere = 1.0 - smoothstep(0.02, 0.25, uCamAlt);
      float kW = smoothstep(0.02, mix(0.22, 0.42, downHere), sunUp);
      vec3 sunCol = vec3(1.0, 0.56 + 0.44 * kW, 0.30 + 0.70 * kW) * (smoothstep(-0.03, 0.05, sunUp) * (1.0 + 1.1 * downHere * (1.0 - smoothstep(0.04, 0.5, sunUp))));
      float dusk = smoothstep(-0.12, 0.02, sunUp) * (1.0 - smoothstep(0.08, 0.4, sunUp)) * (0.35 + 0.65 * downHere);
      vec3 ambC = (mix(mix(vec3(0.24, 0.30, 0.48), vec3(0.10, 0.12, 0.19), smoothstep(0.02, 0.2, uCamAlt)), vec3(0.26), day)      /* (from orbit the night side stays dark under its lights) */ + vec3(0.24, 0.17, 0.18) * dusk) * mix(vec3(1.0), vec3(0.9, 0.95, 1.1), 1.0 - shadow * 0.7);
      #ifdef USE_GROUND
      ambC *= 0.7 + 0.3 * nLocal.z;      // (the light of the sky comes from above: what leans away from it, a slope or the side of a stone, has less of it)
      #endif
      // (snow lights its own shade: what a white slope across the valley and the blue sky throw into it. Shaded as other ground
      //  is, the mountains of a winter were white and navy, like marbled paper.)
      // (and the eye closes a little to it: under a high sun every slope of a snowfield was past white, and the Himalaya a sheet
      //  of paper with no hills in it)
      float snowAll = max(max(snow, ice * 0.95), snowCov) * landW * day;
      ambC *= mix(vec3(1.0), vec3(1.55, 1.75, 2.15), snowAll * (1.0 - 0.6 * diff));
      vec3 lit = col * (ambC + diff * (1.05 - 0.16 * snowAll) * sunCol * mix(1.0, 0.5, seaW * 0.3));
      // ---------- what the water mirrors ----------
      // Still water is a mirror, dark looked down into and bright along the eye's level (Fresnel): it shows the sky that
      // stands where its light comes from, and the sun as a path of sparks as wide as the water is rough. Reckoned in
      // light, as the air is (the colours here are roots of light).
      vec3 viewDir = normalize(-vViewPos); float highK = smoothstep(0.02, 0.4, uCamAlt);
      float mirror = wetAll * (1.0 - foam) * (1.0 - iced * 0.9);
      if (mirror > 0.003 && uSeaK.w < 1.5) {
        float nv = max(dot(nV, viewDir), 0.0), rgh = sqrt(wRough);
        float fres = (0.02 + 0.98 * pow(1.0 - nv, 5.0)) / (1.0 + 2.2 * rgh);      // (a rough sea turns its faces to the eye: it never mirrors as flatly as a pond)
        vec3 rf = reflect(-viewDir, nV); float sinE = dot(rf, upV);
        vec3 rH = rf - upV * sinE, sHz = sunV - upV * sunUp;
        float cosAz = dot(rH, sHz) / max(length(rH) * length(sHz), 1e-4);
        vec3 sky = skyAt(abs(sinE) + 0.55 * rgh, cosAz);
        // (from far out the camera's own sky is not the sky over the water it sees: there, a day's sky by how high the sun stands over that water)
        sky = mix(sky, vec3(0.20, 0.36, 0.66) * smoothstep(-0.08, 0.25, sunUp), highK) * mix(1.0, 0.55, cloudShadow < 0.999 ? 1.0 - cloudShadow : 0.0);
        vec3 hv = normalize(sunV + viewDir); float nh = max(dot(nV, hv), 0.0), nl = max(dot(nV, sunV), 0.0), vh = max(dot(viewDir, hv), 0.0);
        float a2 = max(wRough, 2e-4), dd = nh * nh * (a2 - 1.0) + 1.0, D = a2 / (PI * dd * dd);
        float sunF = 0.02 + 0.98 * pow(1.0 - vh, 5.0);
        float glit = min(D * sunF * 0.25 / (vh * vh + 0.02) * nl, mix(1.2, 60.0, uGlow)) * step(0.0, sunUp + 0.02);
        vec3 light = mix(lit * lit, sky, fres * mirror) + sunCol * sunCol * (5.4 * sunVis * glit * mirror);
        lit = sqrt(max(light, 0.0));
      }
      // night side: keep a little moonlight and city lights
      float night = 1.0 - smoothstep(-0.22, 0.02, sunUp);
      float light = sim.r; float highUp = smoothstep(0.003, 0.014, uCamAlt);   // orbital city lights fade out as real windows take over
      if (light > 0.002 && highUp > 0.001) {
        vec2 lp = gc(440.0);
        float sp = smoothstep(0.42, 0.8, noise2(lp).a) * 1.6 + 0.15;
        float lp2 = smoothstep(0.5, 0.9, noise2(gc(58.0)).r);
        vec3 lcol = mix(vec3(1.0, 0.62, 0.25), vec3(1.0, 0.92, 0.75), sim.g);
        lit += lcol * light * sp * (0.5 + lp2) * night * landW * 1.4 * highUp;
        // from far out the single lamps cannot be told apart (the sparkle above averages away to almost nothing): the
        // lights of a country run together into warm points where its towns are, strung along where people live
        float farUp = smoothstep(0.1, 0.45, uCamAlt);
        if (farUp > 0.001) { vec4 nz = noise2(gc(0.6)); float pts = smoothstep(0.35, 0.95, nz.r * 0.6 + nz.g * 0.6); lit += mix(vec3(1.0, 0.6, 0.24), vec3(1.0, 0.8, 0.48), sim.g) * light * light * (0.3 + 1.9 * pts) * night * landW * farUp * 1.1; }
      }
      // closer in, the built-up ground itself glows softly under the lamps and hearths
      lit += mix(vec3(1.0, 0.62, 0.25), vec3(1.0, 0.9, 0.7), sim.g) * smoothstep(0.08, 0.3, dec.b) * night * (1.0 - highUp) * (0.02 + 0.26 * sim.g);      // (a town without lamps is dark but for its fires)
      lit += col * night * 0.045;
      // fresh fire glows through the night
      float front = smoothstep(0.08, 0.5, dec2.g) * (1.0 - smoothstep(0.7, 0.97, dec2.g));    // the fire front: the fringe of what is burning now
      lit += vec3(1.0, 0.42, 0.1) * (night * 0.9 + 0.15) * front * (0.3 + 0.7 * nMic.r) * (0.6 + 0.4 * nFin.g) * (1.0 + 1.6 * uGlow);
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
          fillA = mix(fillA, mix(0.7, 0.22, polClose) + 0.12 * band, uLens);      // under a lens the colour is what is being read: the land shows through, no more
          float clip = wOn > 0.5 ? 1.0 - wCov : smoothstep(0.45, 0.65, a);
          // (under a lens the colour is the realm's own, as light or dark as the ground under it: laid over sand as a wash it went pale)
          vec3 tinted = mix(lit * 0.55 + pc * 0.5, pc * (0.42 + 0.72 * dot(lit, vec3(0.3, 0.59, 0.11))), uLens);
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
      // ---------- the air between (air.js): what it takes from the ground's light on the way to the eye, and the light of its own it adds ----------
      gl_FragColor = vec4(airOver(lit, vAirT, vAirL), 1.0 - 0.85 * wetAll * (1.0 - iced));      // (the fourth: how much of the pixel is not open water. post.js shades by it: the shade between things is not laid on water, where an island stood in a dark stain. Nothing else reads it.)
    }`;

  // ---------- pack loading ----------
  class Pack {
    constructor(kind, L, px, py) { this.kind = kind; this.L = L; this.px = px; this.py = py; this.key = `${kind}${L}/${px}/${py}`; this.state = 'new'; this.texture = null; this.data = null; this.w = 0; this.h = 0; this.min = 0; this.scale = 0; this.lastUsed = 0; this.users = 0; this.flat = null; this.dist = null; }
  }

  class Terrain {
    constructor(opts) {
      this.noiseData = null; this.dispOn = false;
      this.opts = opts; this.index = opts.index; this.base = opts.base || 'data/';
      this.scene = opts.scene; this.group = new THREE.Group(); this.scene.add(this.group);
      // denser meshes for the close tiles, so the finer regional elevation and the micro-relief actually show as geometry
      this.geoms = { 8: buildTileGeometry(8), 16: buildTileGeometry(16), 32: buildTileGeometry(32), 64: buildTileGeometry(64), 128: buildTileGeometry(128) };
      // how finely a tile of a level is meshed. A software renderer runs the vertex shader (five elevation lookups and
      // three of noise per vertex) on the CPU: it gets a quarter of the grid each way, and stands everything on that.
      this.soft = !!opts.soft; this.gridOf = (L) => this.soft ? (L >= 9 ? 32 : 16) : (L >= 9 ? 128 : L >= 7 ? 64 : 32);
      // That is the finest a tile is meshed. Where it is drawn small it gets a coarser mesh, so that a quad of it is quadPx pixels
      // or more each way (gridFor). In a view to the horizon most of the ground's tiles lie almost edge-on to the eye: at full
      // fineness their triangles were slivers a tenth of a pixel deep, dozens to a pixel. That cost the vertex shader (elevation,
      // relief, the air: a million and a half corners a frame) and, far more, the fragment shader: with four samples a pixel it
      // runs for every triangle that touches the pixel, and for the three pixels beside it each time. Flat country seen from the
      // side needs next to no corners; what stands up in a tile (its own relief, from the elevation it is drawn with) keeps it
      // nearly as fine as it is wide, so the line of the hills against the sky stays as it was.
      // (4 pixels at first; 8 since the ground's shader grew: with four samples a pixel the shader runs for every triangle that
      // touches a pixel, so a triangle costs its area and half its edge again, and at 4 pixels that is nearly twice the area. On
      // the build Mac the Alps went from 11 frames a second to 15 by it, and the pictures cannot be told apart: tools/scenes/
      // tour.txt has alps_q4 and ridge_q4 to hold against alps and ridge, and __T.costsMesh measures.)
      this.quadPx = 8;
      this.tiles = new Map(); this.packs = new Map(); this.loading = 0; this.maxLoading = 6;
      this.exag = opts.exag || 2.0;
      this.frame = 0; this.visible = [];
      this.sseThreshold = 360; this.maxTiles = 380; this.maxLevel = 9;
      this.stats = { tiles: 0, packsI: 0, packsE: 0, packsW: 0, loading: 0 };
      // flat elevation texture for absent packs (sea)
      const flat = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); flat.needsUpdate = true;
      this.flatTex = flat;
      const white = new THREE.DataTexture(new Uint8Array([40, 60, 80, 0]), 1, 1, THREE.RGBAFormat); white.needsUpdate = true;
      this.blankImg = white;
      this.globals = opts.globals; // shared uniform objects
      this.frustum = new THREE.Frustum(); this._m = new THREE.Matrix4();
      this._sphere = new THREE.Sphere(); this._v = new THREE.Vector3();
      // The picture of the Earth (data/i, tools/planet/imagery.py): its list says which packs there are, level by level (P a pack,
      // S nothing but sea), how wide a pack's rim is and how many packs lie in a bundle.
      this.img = opts.img && opts.img.levels ? opts.img : null;
      if (!this.img) console.error('the picture of the Earth is not here (data/i/index.json): npm run fetch brings it');
      this.elevMax = this.index.elev.maxLevel; this.imgMax = this.img ? this.img.maxLevel : -1; this.bundles = new Map();
      this.l6 = new Set((this.index.elev.l6 || []).map(([x, y]) => `${x}/${y}`));
      this.l7 = new Set((this.index.elev.l7 || []).map(([x, y]) => `${x}/${y}`));
      // The water's edge (data/w, tools/water/build.py): a field of distances to the nearest shore, far finer than the
      // picture's own map of land and water. Where it has not been fetched, or a pack of it is still on its way, the
      // picture's map serves as it always did.
      this.uWaterL = { value: 0 };      // (1: the packs say how high every lake stands)
      this.water = opts.water && opts.water.levels && opts.water.code ? opts.water : null; this.wMin = 99; this.wMax = -1;
      if (this.water && Object.keys(WCODE).some((k) => Math.abs(this.water.code[k] - WCODE[k]) > 1e-6)) { console.warn('water: the pack has another code than this game reads; the coasts are the picture\'s own'); this.water = null; }
      if (this.water && this.water.level && (Math.abs(this.water.level.max - WLEV.max) > 1e-6 || Math.abs(this.water.level.pow - WLEV.pow) > 1e-6)) { console.warn('water: the pack counts its lakes\' levels another way than this game reads; lakes lie as the heights have them'); this.water = Object.assign({}, this.water, { level: null }); }
      this.uWaterL.value = this.water && this.water.level ? 1 : 0;
      if (this.water) {
        for (const k of Object.keys(this.water.levels)) { this.wMin = Math.min(this.wMin, +k); this.wMax = Math.max(this.wMax, +k); }
        const c = this.water.code, dec = this.wDec = new Float32Array(256);      // a byte's metres (the shader's wDec is the twin of this)
        for (let i = 0; i < 256; i++) { const u = Math.max(c.knee - i, 0); dec[i] = i >= c.knee ? (Math.min(i, c.land) - 128) * c.step : -(c.near + c.step * u + c.quad * u * u); }
      }
      const wflat = new THREE.DataTexture(new Uint8Array([158, 0, 0]), 1, 1, THREE.RGBFormat, THREE.UnsignedByteType); wflat.unpackAlignment = 1; wflat.needsUpdate = true; this.waterTex = wflat;
      this.wKind = 0; this.wOpen = 1; this.wLevel = -1; this.stats.packsW = 0;
    }
    // ----- packs -----
    packInfo(kind, L, px, py) {
      const key = `${L}/${px}/${py}`;
      if (kind === 'w') { const l = this.water && this.water.levels[L]; if (!l || px < 0 || py < 0 || px >= l.nx || py >= l.ny) return undefined; const c = l.packs[py * l.nx + px]; return c === 'P' ? 1 : c; }      // (L, S, F: no shore in it; ?: not made)
      if (kind === 'e') { if (L === 7) return this.l7.has(`${px}/${py}`) ? this.index.elev.packs[key] : undefined; if (L === 6) return this.l6.has(`${px}/${py}`) ? this.index.elev.packs[key] : undefined; return this.index.elev.packs[key]; }
      const l = this.img && this.img.levels[L]; if (!l || px < 0 || py < 0 || px >= l.nx || py >= l.ny) return undefined;
      return l.packs[py * l.nx + px] === 'P' ? 1 : 0;
    }
    getPack(kind, L, px, py, priority) {
      const key = `${kind}${L}/${px}/${py}`;
      let p = this.packs.get(key);
      if (!p) { p = new Pack(kind, L, px, py); const info = this.packInfo(kind, L, px, py); if (info === undefined || info === 0) { p.state = 'absent'; } else if (kind === 'w' && info !== 1) { p.state = 'absent'; p.flat = info === '?' ? null : info; } else { p.info = info; } this.packs.set(key, p); }
      p.lastUsed = this.frame; if (priority !== undefined) p.priority = Math.max(p.priority || 0, priority);
      if (p.state === 'new') this.queue.push(p);
      return p;
    }
    async loadPack(p) {
      p.state = 'loading'; this.loading++;
      const url = this.base + (p.kind === 'e' ? `e/${p.L}_${p.px}_${p.py}.png` : p.kind === 'w' ? `w/${p.L}_${p.px}_${p.py}.${this.water.ext || 'webp'}` : `i/${p.L}_${p.px}_${p.py}.webp`);
      try {
        let blob;
        if (p.kind === 'w' && this.water.bundle) blob = await this.bundleBlob(p, 'w', this.water.bundle, this.water.ext);
        else if (p.kind === 'i' && this.img.bundle) blob = await this.bundleBlob(p, 'i', this.img.bundle, this.img.ext);
        else { const r = await fetch(url); if (!r.ok) throw new Error('http ' + r.status); blob = await r.blob(); }
        const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        p.w = bmp.width; p.h = bmp.height;
        let tex = new THREE.Texture(bmp);
        tex.flipY = false; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false;
        if (p.kind === 'e') {
          tex.format = THREE.LuminanceFormat; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
          p.min = p.info[0]; p.scale = p.info[1];
          // CPU copy for height queries
          const cv = document.createElement('canvas'); cv.width = p.w; cv.height = p.h; const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
          const d = ctx.getImageData(0, 0, p.w, p.h).data; const out = new Uint8Array(p.w * p.h); for (let i = 0; i < out.length; i++) out[i] = d[i * 4]; p.data = out;
        } else if (p.kind === 'w') {
          // the water's edge: red the distance's code, green what water it is (0 the sea .. 255 fresh). Looked at between its
          // texels as it is: there is a coarser level for the eye further off.
          p.scale = this.water.levels[p.L].scale;
          // (Three bytes a texel, the same store for the card and for whoever asks here where the water is: the distance; what
          //  water and how open it lies, four bits each; how high a lake stands. Packs made before the last two were reckoned
          //  are brought to the same shape: all water open, no levels.)
          // (Read out of the picture a strip at a time, with the frame let through between two: a pack is four million texels,
          //  and drawn, read and copied in one piece it held a frame up for a twentieth of a second and more each time one came.
          //  Not on a software renderer, whose frames take a second each: there the waiting between strips was the longer.)
          const ROWS = 512, cv = document.createElement('canvas'); cv.width = p.w; cv.height = Math.min(ROWS, p.h); const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.globalCompositeOperation = 'copy';      // (each strip in place of the one before, not over it)
          const three = new Uint8Array(p.w * p.h * 3), W = this.water;
          for (let y0 = 0; y0 < p.h; y0 += ROWS) {
            const hh = Math.min(ROWS, p.h - y0), m = p.w * hh; ctx.drawImage(bmp, 0, y0, p.w, hh, 0, 0, p.w, hh);
            const d = ctx.getImageData(0, 0, p.w, hh).data; let o = y0 * p.w * 3;
            if (W.level) for (let i = 0; i < m; i++, o += 3) { three[o] = d[i * 4]; three[o + 1] = d[i * 4 + 1]; three[o + 2] = d[i * 4 + 2]; }
            else for (let i = 0; i < m; i++, o += 3) { three[o] = d[i * 4]; three[o + 1] = (Math.round(d[i * 4 + 1] / 17) << 4) | (W.open ? Math.round(d[i * 4 + 2] / 17) : 15); }
            if (y0 + ROWS < p.h && !this.opts.slow) await new Promise((r) => setTimeout(r, 0));
          }
          p.dist = three;
          if (bmp.close) bmp.close();
          tex = new THREE.DataTexture(three, p.w, p.h, THREE.RGBFormat, THREE.UnsignedByteType); tex.flipY = false; tex.unpackAlignment = 1; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
        } else {
          tex.format = THREE.RGBAFormat; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = this.opts.anisotropy || 4;
          // CPU copy of the water mask (alpha), so buildings and ships agree with the drawn coast while the water's edge is on its way.
          // From the level the picture always had: above it the mask is the same mask weighed finer, and whichever is here answers.
          // (A strip at a time, as the water's packs are read.)
          if (p.L >= Math.min(3, this.imgMax)) {
            const ROWS = 512, cv = document.createElement('canvas'); cv.width = p.w; cv.height = Math.min(ROWS, p.h); const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.globalCompositeOperation = 'copy';
            const out = new Uint8Array(p.w * p.h);
            for (let y0 = 0; y0 < p.h; y0 += ROWS) {
              const hh = Math.min(ROWS, p.h - y0), m = p.w * hh; ctx.drawImage(bmp, 0, y0, p.w, hh, 0, 0, p.w, hh);
              const d = ctx.getImageData(0, 0, p.w, hh).data; for (let i = 0, o = y0 * p.w; i < m; i++, o++) out[o] = d[i * 4 + 3];
              if (y0 + ROWS < p.h && !this.opts.slow) await new Promise((r) => setTimeout(r, 0));
            }
            p.alpha = out;
          }
        }
        tex.needsUpdate = true; p.texture = tex; p.state = 'ready';
      } catch (e) { console.warn('pack failed', url, e); p.state = 'error'; }
      this.loading--;
    }
    // A pack out of its bundle (the water's edge: tools/water/fetch.mjs, sixteen packs to a file; the picture of the Earth:
    // tools/planet/imagery.py, sixty-four - the packs' own files end to end behind a table of where each begins,
    // data/<w or i>/<level>_b<x>_<y>.bin: thousands of small files were more than an update can carry). A bundle is fetched
    // whole, once, and kept while its packs are being asked for: the eye seldom needs one pack alone.
    bundleBlob(p, dir, n, ext) {
      const url = this.base + `${dir}/${p.L}_b${Math.floor(p.px / n)}_${Math.floor(p.py / n)}.bin`, B = this.bundles;
      let b = B.get(url);
      if (!b) {
        b = { url, used: 0, ready: fetch(url).then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); }).then(async (blob) => {
          const head = new DataView(await blob.slice(0, 8 + n * n * 8).arrayBuffer());
          if (head.byteLength < 8 + n * n * 8 || head.getUint32(0, true) !== 0x31425748 || head.getUint32(4, true) !== n * n) throw new Error('not a bundle');      // ('HWB1')
          return { blob, head };
        }) };
        b.ready.catch(() => { if (B.get(url) === b) B.delete(url); });      // (one that did not come is asked for again by the next pack that needs it)
        B.set(url, b);
      }
      b.used = this.frame;
      return b.ready.then(({ blob, head }) => { const at = 8 + ((p.py % n) * n + p.px % n) * 8, off = head.getUint32(at, true), len = head.getUint32(at + 4, true); if (!len || off + len > blob.size) throw new Error('no such pack in its bundle'); return blob.slice(off, off + len, 'image/' + (ext || 'webp')); });
    }
    pumpQueue() {
      if (!this.queue.length) return;
      this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      while (this.loading < this.maxLoading && this.queue.length) { const p = this.queue.shift(); if (p.state === 'new') this.loadPack(p); }
      this.queue.length = 0; // re-queued each frame by visible tiles
    }
    evictPacks() {
      const limits = { i: 40, e: 56, w: 10 };
      for (const kind of ['i', 'e', 'w']) {
        // (The three coarsest levels of the picture and of the heights are kept whatever happens: they are what a tile shows while
        //  its own pack is on its way, and nothing asks for them by name while finer ones are here - so they were the first to
        //  go, and a tile that then found no pack at all went on drawing from the one it had last, which was closed. With
        //  forty-three packs of the picture in all that hardly ever came up; with seventeen hundred it did at once.)
        const list = [...this.packs.values()].filter(p => p.kind === kind && p.state === 'ready' && p.users === 0 && (kind === 'w' || p.L > 2));
        if (list.length <= limits[kind]) continue;
        list.sort((a, b) => a.lastUsed - b.lastUsed);
        const n = list.length - limits[kind];
        for (let i = 0; i < n; i++) { const p = list[i]; if (this.frame - p.lastUsed < 30) break; p.texture.dispose(); if (p.texture.image && p.texture.image.close) p.texture.image.close(); this.packs.delete(p.key); }
      }
      // (the bundles packs came out of: megabytes each, let go when none of their packs has been asked for in a while)
      if (this.bundles.size > 6) { const old = [...this.bundles.values()].sort((a, b) => a.used - b.used); for (let i = 0; i < old.length - 6; i++) if (this.frame - old[i].used > 600) this.bundles.delete(old[i].url); }
    }
    // best available pack for tile (L,tx,ty); requests the ideal one. Returns {pack, rect} or null
    bindPack(kind, L, tx, ty, priority) {
      let maxL;
      if (kind === 'e') { const s5 = Math.max(0, L - 5), s4 = Math.max(0, L - 4); maxL = (L >= 7 && this.l7.has(`${tx >> s5}/${ty >> s5}`)) ? 7 : (L >= 6 && this.l6.has(`${tx >> s4}/${ty >> s4}`)) ? 6 : Math.min(L, this.elevMax); }
      else maxL = Math.min(L, this.imgMax);
      if (kind === 'i' && !this.img) return null;
      const per = kind === 'e' ? this.index.elev.packTiles : this.img.packTiles;
      const ap = kind === 'i' ? this.img.apron || 0 : 0, ts = kind === 'i' ? this.img.tile || 512 : 1;      // (the picture's packs have a rim of texels all round; the heights' have none)
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
          if (kind === 'i') {
            const sx = ptx * ts + 2 * ap, sy = pty * ts + 2 * ap, f = 4096 * Math.pow(2, Math.min(0, 3 - l));
            return { pack: p, rect: [(ap + u0 * ptx * ts) / sx, (ap + v0 * pty * ts) / sy, within * ts / sx, within * ts / sy], level: l, k: [f * sx / (ptx * ts), f * sy / (pty * ts)] };
          }
          return { pack: p, rect: [u0, v0, within / ptx, within / pty], level: l };
        }
      }
      return null;
    }
    // The water's edge for a tile: { pack, rect, level } from the finest level that has arrived, { flat: 'L' | 'S' | 'F' } where
    // there is no shore near (the index says so), or nothing: then the picture's own map of land and water is used.
    bindWater(L, tx, ty, priority) {
      const W = this.water; if (!W || L < this.wMin) return null;
      const per = W.packTiles, ap = W.apron, ts = W.tile, top = Math.min(L, this.wMax);
      for (let l = top; l >= this.wMin; l--) {
        const sh = L - l, txl = tx >> sh, tyl = ty >> sh, px = Math.floor(txl / per), py = Math.floor(tyl / per);
        const p = this.getPack('w', l, px, py, priority - (top - l));
        if (p.state === 'absent') return p.flat ? { flat: p.flat, level: l } : null;
        if (p.state === 'ready') {
          const within = 1 / (1 << sh), side = per * ts + 2 * ap;
          return { pack: p, level: l, rect: [(ap + ((txl % per) + (tx - (txl << sh)) * within) * ts) / side, (ap + ((tyl % per) + (ty - (tyl << sh)) * within) * ts) / side, within * ts / side, within * ts / side] };
        }
      }
      return null;
    }
    // Is a pack's piece under a tile (rect: its place in the pack) nothing but land far from any shore ('L') or nothing but the
    // open sea ('S')? '' where there is a shore in it or near it, or fresh water (a lake has a level of its own).
    waterFlat(p, rect) {
      const d = p.dist, w = p.w, h = p.h; if (!d) return '';
      const x0 = Math.max(0, Math.floor(rect[0] * w - 1.5)), x1 = Math.min(w - 1, Math.ceil((rect[0] + rect[2]) * w + 1.5)), y0 = Math.max(0, Math.floor(rect[1] * h - 1.5)), y1 = Math.min(h - 1, Math.ceil((rect[1] + rect[3]) * h + 1.5));
      const i0 = (y0 * w + x0) * 3, land = d[i0] >= WCODE.land; if (!land && (d[i0] > WCODE.water || (d[i0 + 1] >> 4) !== 0)) return '';
      for (let y = y0; y <= y1; y++) { let i = (y * w + x0) * 3; for (let x = x0; x <= x1; x++, i += 3) if (land ? d[i] < WCODE.land : (d[i] > WCODE.water || (d[i + 1] >> 4) !== 0)) return ''; }
      return land ? 'L' : 'S';
    }
    // How wide is the widest fresh water in a pack's piece under a tile? Metres from its shore to its middle (0: none there).
    // A tarn among mountains is a few hundred metres across, and from far off the mesh's quads are kilometres: see update().
    waterWide(p, rect) {
      const d = p.dist, w = p.w, h = p.h; if (!d) return 0;
      const x0 = Math.max(0, Math.floor(rect[0] * w)), x1 = Math.min(w - 1, Math.ceil((rect[0] + rect[2]) * w)), y0 = Math.max(0, Math.floor(rect[1] * h)), y1 = Math.min(h - 1, Math.ceil((rect[1] + rect[3]) * h));
      let low = 255;      // (the lowest code of the distance among the fresh water there: the lower, the further from any shore)
      for (let y = y0; y <= y1; y++) { let i = (y * w + x0) * 3; for (let x = x0; x <= x1; x++, i += 3) if (d[i] < low && d[i] < 128 && (d[i + 1] >> 4) > 7) low = d[i]; }
      return low > 127 ? 0 : Math.max(0.5 * WCODE.step, -wDecF(low)) * p.scale;
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
      // the ground's materials lie in one frame the world over (no bands: the same K at every latitude, so nothing meets at an edge;
      // toward the poles its cells are smaller, and the ladder of sizes takes a step up): whole cells at the tile's centre, kept
      // below 2^22 so that a float holds them exactly, and the fraction
      const LADK = R_M / 1.5, LADM = 4194304, lx = gX * LADK, ly = gY * LADK, mL = (v) => ((Math.floor(v) % LADM) + LADM) % LADM;
      const uniforms = {
        uLon0: { value: b.lon0 * GEO.D2R }, uDLon: { value: b.w * GEO.D2R }, uLat0: { value: b.lat0 * GEO.D2R }, uDLat: { value: -b.h * GEO.D2R },
        uLatC: { value: latC * GEO.D2R }, uLonC: { value: lonC * GEO.D2R }, uLevel: { value: L },
        uGeoC: { value: new THREE.Vector2(gx, gy) }, uPhaseB: { value: new THREE.Vector2(fr(gx * 50), fr(gy * 50)) }, uPhaseRot: { value: new THREE.Vector2(fr((0.83 * gx - 0.56 * gy) * 9000), fr((0.56 * gx + 0.83 * gy) * 9000)) },
        uDLon0: { value: (b.lon0 - lonC) * GEO.D2R }, uDLat0: { value: (b.lat0 - latC) * GEO.D2R }, uMercA: { value: aM }, uTanA: { value: Math.tan(aM) }, uCosA: { value: Math.cos(aM) },
        uLadN: { value: new THREE.Vector2(mL(lx), mL(ly)) }, uLadF: { value: new THREE.Vector2(lx - Math.floor(lx), ly - Math.floor(ly)) },
        uPhF: { value: new THREE.Vector2(fr(gX * k0), fr(gY * k0)) }, uPhN: { value: new THREE.Vector2(m16(gX * k0), m16(gY * k0)) }, uPhR: { value: new THREE.Vector2(fr(rX * kR), fr(rY * kR)) }, uK0: { value: k0 }, uKR: { value: kR },
        uElev: { value: this.flatTex }, uElevRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uElevTexel: { value: new THREE.Vector2(1, 1) }, uElevMin: { value: 0 }, uElevScale: { value: 0 },
        uImg: { value: this.blankImg }, uImgRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uImgK: { value: new THREE.Vector2(4096, 4096) },
        uWater: { value: this.waterTex }, uWaterRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uWaterP: { value: new THREE.Vector4(0, 1, 0, 0) }, uShoreQ: { value: SHORE_FLAT }, uWaterL: this.uWaterL,      // (P: 0 the picture's map, 1 a pack, 2 no shore near; the level's scale; and for 2 the distance and the kind)
        uExag: { value: this.exag }, uSkirt: { value: Math.max(b.w, b.h) * GEO.D2R * 0.06 + 0.00002 },
      };
      Object.assign(uniforms, this.globals);
      const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, extensions: { derivatives: true }, defines: this.defines() });
      const grid = this.gridOf(L); const mesh = new THREE.Mesh(this.geoms[grid], mat);
      mesh.position.copy(center); mesh.quaternion.copy(q); mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      // world-space extent
      const corners = [GEO.toVec(b.lon0, b.lat0), GEO.toVec(b.lon1, b.lat0), GEO.toVec(b.lon0, b.lat1), GEO.toVec(b.lon1, b.lat1)];
      let rad = 0; for (const c of corners) rad = Math.max(rad, c.distanceTo(center));
      const t = { key: this.tileKey(L, tx, ty), L, tx, ty, b, lonC, latC, center, mesh, uniforms, radius: rad, extent: Math.max(b.w * GEO.D2R * Math.max(Math.cos(Math.min(Math.abs(b.lat0), Math.abs(b.lat1)) * GEO.D2R), 0.02), b.h * GEO.D2R), lastUsed: 0, minH: 0, maxH: 9000, ePack: null, iPack: null, wPack: null, inScene: false, grid, quadM: b.h * GEO.D2R * R_M, relief: 0, midH: 0, reliefOf: null, lie: 1, standPx: 0, dist: 1 };
      return t;
    }
    // How finely a tile is meshed this frame. t.sse: how many pixels it is across; t.lie: how its ground lies to the eye (the sine
    // of the angle it is seen at: 1 from above, next to 0 far off and seen from near the ground); t.standPx: how many pixels tall
    // what stands up in it is. Flat ground gets quads quadPx pixels deep as it lies (seen from the side that is very few of them);
    // a tile with something standing in it (three pixels tall and more) keeps quads quadPx pixels wide however shallow it
    // lies, for the line it draws against the sky. A tile keeps the mesh it has until it has passed the step between
    // two by an eighth, so that it does not go back and forth as the camera drifts. The fewest: eight a side, more for the great
    // tiles seen from far out, which carry the planet's curve.
    gridFor(t) {
      const max = this.gridOf(t.L); if (this.soft || !this.quadPx) return max;
      const wide = t.sse, deep = Math.min(wide, wide * t.lie + t.standPx);
      const want = Math.max(deep, wide * Math.min(1, Math.max(0, (t.standPx - 3) / 5))) / this.quadPx;
      const min = Math.min(max, t.L <= 1 ? 32 : t.L === 2 ? 16 : 8);
      let g = max; while (g > min && want < g) g >>= 1;
      const was = t.grid; if (was !== g && was <= max && was >= min && (was === g * 2 || g === was * 2)) { const step = Math.max(g, was); if (want > step * 0.88 && want < step * 1.12) return was; }
      return g;
    }
    // how much a tile's own ground rises and falls (t.relief, metres) and its middle height (t.midH), from the elevation it is drawn
    // with: looked up once for each pack it is bound to, at up to twenty-four places a side
    measure(t, eb) {
      if (t.reliefOf === eb.pack) return; t.reliefOf = eb.pack; t.relief = 0; t.midH = 0;
      const p = eb.pack; if (eb.absent || !p.data) return;
      const R = eb.rect, x0 = Math.max(0, Math.floor(R[0] * p.w)), y0 = Math.max(0, Math.floor(R[1] * p.h)), x1 = Math.min(p.w - 1, Math.ceil((R[0] + R[2]) * p.w)), y1 = Math.min(p.h - 1, Math.ceil((R[1] + R[3]) * p.h));
      const sx = Math.max(1, ((x1 - x0) / 24) | 0), sy = Math.max(1, ((y1 - y0) / 24) | 0), d = p.data, w = p.w; let lo = 255, hi = 0;
      for (let y = y0; y <= y1; y += sy) for (let x = x0; x <= x1; x += sx) { const v = d[y * w + x]; if (v < lo) lo = v; if (v > hi) hi = v; }
      const hLo = Math.max(0, p.min + lo * p.scale), hHi = Math.max(0, p.min + hi * p.scale);
      t.relief = (hHi - hLo) * 1.3; t.midH = (hHi + hLo) / 2;      // (a third more: a peak can stand between two of the places looked at)
    }
    getTile(L, tx, ty) { const k = this.tileKey(L, tx, ty); let t = this.tiles.get(k); if (!t) { t = this.makeTile(L, tx, ty); this.tiles.set(k, t); } return t; }
    // generated ground textures (textures.js): every tile material recompiles with the texture arrays; new tiles get them from the start
    setTextures(T, on = true) {
      const g = this.globals; const ok = !!(T && T.ready && on && T.arrays.ground && T.arrays.landuse && g.uGround);
      if (ok) { g.uGround.value = T.arrays.ground; g.uLanduse.value = T.arrays.landuse; g.uShallows.value = (T.misc && T.misc.shallows) || this.flatTex; g.uTexMix.value = 1; }
      else if (g.uTexMix) g.uTexMix.value = 0;
      // the ground's own materials, where the pack is there (textures.js): the shader then takes its ground from them, and has no use for the photographs of detail
      const gnd = ok && T.ground && g.uGnd ? T.ground : null;
      if (gnd) { g.uGnd.value = gnd.albedo; g.uGndN.value = gnd.relief; g.uGndShal.value = gnd.shallows; g.uGndFar.value = gnd.far; g.uGndFarD.value = gnd.farD; g.uGndFarN.value = gnd.farSize; g.uGndMean.value = gnd.mean; if (g.uGndCls) g.uGndCls.value = gnd.cls; }
      this.texDefines = ok ? (gnd ? { USE_TEXARR: 1, USE_GROUND: 1 } : { USE_TEXARR: 1 }) : {}; this.textured = ok; this.grounded = !!gnd;
      for (const t of this.tiles.values()) { const m = t.mesh.material; m.defines = this.defines(); m.needsUpdate = true; }
    }
    // shader switches for every tile material: the detail array when the globals carry one, the generated ground when it has loaded
    // (WATER_PLAIN: the water without what is dear to a software renderer, which runs both arms of every branch at every pixel: the
    //  sixteen texels of the shore, the bed's fall, waves and surf. The test suite's pages; the shore, the depths' colours and the mirror stay.)
    defines() { const d = this.globals.uDet && this.globals.uDet.value, i = this.globals.uInfo && this.globals.uInfo.value; return Object.assign(d ? (d.image.depth >= 5 ? { USE_DETARR: 1, DET_SHALLOWS: 1 } : { USE_DETARR: 1 }) : {}, this.texDefines || {}, this.opts.plainWater ? { WATER_PLAIN: 1 } : {}, i && i.isDataTexture2DArray ? { INFO2: 1 } : {}); }
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
        t.sse = sse; t.dist = dist;
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
      const low = 1 - Math.min(1, Math.max(0, (camLen - 1 - 0.02) / 0.04));      // 1 below 130 km, 0 from 380 km up
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
        } else if (t.ePack) { u.uElev.value = this.flatTex; u.uElevMin.value = 0; u.uElevScale.value = 0; u.uElevRect.value.set(0, 0, 1, 1); u.uElevTexel.value.set(1, 1); t.ePack = null; }      // (as with the picture, below)
        if (ib) { const p = ib.pack; if (!ib.absent) { p.users++; u.uImg.value = p.texture; u.uImgRect.value.set(ib.rect[0], ib.rect[1], ib.rect[2], ib.rect[3]); u.uImgK.value.set(ib.k[0], ib.k[1]); } t.iPack = ib; }
        // (no pack of the picture here at any level, not the coarsest: the tile must not go on showing the one it had - that one may
        //  have been let go since, its picture closed, and a card asked to draw from it answers with an error at every frame)
        else if (t.iPack) { u.uImg.value = this.blankImg; u.uImgRect.value.set(0, 0, 1, 1); t.iPack = null; }
        if (this.water) {
          let wb = this.waterOff ? null : this.bindWater(t.L, t.tx, t.ty, pri);
          // (Most of the land of the Earth is far from any shore, and so is most of the sea: where a tile's piece of its pack says
          //  nothing but that, the tile is told so and the shader looks nothing up - four lookups at every pixel, which over
          //  open country was a tenth of the frame and more. Asked once of each pack a tile is given; the pack stays in use.)
          if (wb && wb.pack) { const p = wb.pack; p.users++; if (t.wScan !== p.key) { t.wScan = p.key; t.wFlat = this.waterFlat(p, wb.rect); t.wWide = t.wFlat ? 0 : this.waterWide(p, wb.rect); } if (t.wFlat) wb = { flat: t.wFlat, level: wb.level, of: p }; }
          if (wb && wb.pack) { const p = wb.pack; u.uWater.value = p.texture; u.uWaterRect.value.set(wb.rect[0], wb.rect[1], wb.rect[2], wb.rect[3]); u.uWaterP.value.set(1, p.scale, 0, 0); }
          else if (wb) { u.uWater.value = this.waterTex; u.uWaterP.value.set(2, 1, wb.flat === 'L' ? 480 : -3600, wb.flat === 'F' ? 1 : 0); }
          else { u.uWater.value = this.waterTex; u.uWaterP.value.set(0, 1, 0, 0); }
          t.wPack = wb;
        }
        // how the tile lies to the eye, for its mesh (gridFor). From far out the planet's rim is where the air changes fastest, and the
        // air is worked out at the mesh's corners: there every tile counts as seen from above.
        if (eb) this.measure(t, eb);
        { const dC = Math.max(t.center.distanceTo(cam), 1e-6), over = t.center.dot(cam) - 1 - t.midH * this.exag / R_M; t.lie = 1 - low + low * Math.min(1, Math.max(0, over / dC)); t.standPx = t.relief * this.exag / R_M / t.dist * K; }
        const g = this.gridFor(t); if (g !== t.grid) { t.grid = g; t.mesh.geometry = this.geoms[g]; }
        // (how far in the ground keeps to the water's level: a quad and a half of this mesh - but the field knows the land only so far
        //  from the shore, 480 m by the finest level and twice and four times that by the coarser, and the rise must end inside that)
        u.uShoreQ.value = Math.min(Math.max(SHORE_FLAT, 1.5 * t.quadM / t.grid), Math.max(SHORE_FLAT, (WCODE.near * (t.wPack && t.wPack.pack ? t.wPack.pack.scale : 1) - SHORE_RISE) * 0.9));
        // (And where the tile's lakes are smaller than its quads, the ground is left as the heights have it: a tarn among
        //  mountains is a few hundred metres across, the quads from far off are kilometres, and every corner within a quad
        //  and a half of it was taken down to its level - a pit miles wide with walls in shadow, dark blue dots all over
        //  the snows of the Himalaya. A lake that small may lie a little aslant on its triangle: nobody can see that.)
        //  (Not where the field has reached its limit in the middle of a water - 3.6 km from any shore at the finest level, twice
        //  and four times that at the coarser: that is a great lake, however wide, and lies level as it did.)
        if (t.wPack && t.wPack.pack) u.uWaterP.value.z = t.wWide > 0 && t.wWide < 0.75 * t.quadM / t.grid && t.wWide < 0.8 * WCODE.deep * t.wPack.pack.scale ? 1 : 0;
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
      // a version for everything that stands on the drawn surface: bumps when the set of drawn tiles, their meshes or their elevation packs change
      { let sig = ''; for (const t of visible) sig += t.key + (t.ePack ? (t.ePack.absent ? 'a' : t.ePack.level) : '-') + GRID_CH[t.grid] + (t.wPack ? (t.wPack.pack ? t.wPack.level : t.wPack.flat) : ''); if (sig !== this.meshSig) { this.meshSig = sig; this.meshVersion = (this.meshVersion || 0) + 1; } }
      const hist = {}; for (const t of visible) { const l = t.ePack ? (t.ePack.absent ? 'sea' : t.ePack.level) : '-'; hist[l] = (hist[l] || 0) + 1; } this.stats.elevLevels = hist;
      this.pumpQueue();
      if (now % 30 === 0) this.evictPacks();
      let pi = 0, pe = 0, pw = 0; for (const p of this.packs.values()) if (p.state === 'ready') { if (p.kind === 'i') pi++; else if (p.kind === 'w') pw++; else pe++; }
      this.stats.packsW = pw;
      { let q = 0; for (const t of visible) q += t.grid * t.grid; this.stats.quads = q; }
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
      let h0 = Math.max(0, best.min + v * best.scale);
      if (this.dispOn !== null) { const sd = this.shoreAt(lon, lat); this._sd = sd; if (sd !== null) { const sh = sm01(SHORE_FLAT, SHORE_FLAT + SHORE_RISE, sd); h0 = (this.wLevel >= 0 ? this.wLevel : h0) * this.wKind * (1 - sh) + h0 * sh; } }      // (the sea lies at nought: see SHORE_RISE; not for rawHeight)
      return h0 > 1 ? h0 + this.dispAt(lon, lat, h0, bestL) : h0;
    }
    // CPU twin of the vertex-shader micro-relief (so trees and buildings sit on the displaced ground)
    dispAt(lon, lat, h0, level) {
      const n = this.noiseData; if (!n || !this.dispOn) return 0;
      const sd0 = this._sd;      // (how far inland, as heightAt just found it; the slopes below ask for raw heights and would lose it)
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
      // (still water lies level: see the vertex shader)
      let wet; if (sd0 !== null && sd0 !== undefined) wet = sm01(SHORE_FLAT, SHORE_FLAT + WET_RISE, sd0); else { const a = this.waterAlpha(lon, lat); wet = a < 0 ? 1 : WET(a); }
      return (n1 * 90 * (0.08 + st) + n2 * 9 * (0.08 + 1.2 * st)) * amp * wet;
    }
    rawHeight(lon, lat, level) { const d = this.dispOn; this.dispOn = null; const h = this.heightAt(lon, lat, level); this.dispOn = d; return h; }      // (null: neither the small relief nor the shore's levelling)
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
      // (the water's edge as the vertex shader has it: the tile's own pack, weighed between its texels as the card weighs them)
      let wdv = null, wkv = 0, wlv = h; { const wb = t.wPack;
        if (wb && wb.pack) { const p = wb.pack, r = wb.rect, fx = (r[0] + u * r[2]) * p.w - 0.5, fy = (r[1] + v * r[3]) * p.h - 0.5, x0 = Math.max(0, Math.min(p.w - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(p.h - 2, Math.floor(fy))), ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0)), d = p.dist, i = (y0 * p.w + x0) * 3, j = i + p.w * 3;
          wdv = wDecF((d[i] * (1 - ax) + d[i + 3] * ax) * (1 - ay) + (d[j] * (1 - ax) + d[j + 3] * ax) * ay) * p.scale;
          if (this.uWaterL.value) wlv = wLevF((d[i + 2] * (1 - ax) + d[i + 5] * ax) * (1 - ay) + (d[j + 2] * (1 - ax) + d[j + 5] * ax) * ay);
          { const xn = Math.max(0, Math.min(p.w - 1, Math.floor((r[0] + u * r[2]) * p.w))), yn = Math.max(0, Math.min(p.h - 1, Math.floor((r[1] + v * r[3]) * p.h))); wkv = (d[(yn * p.w + xn) * 3 + 1] >> 4) / 15; } }
        else if (wb) { wdv = wb.flat === 'L' ? 480 : -3600; wkv = wb.flat === 'F' ? 1 : 0; } }
      const sq = U.uShoreQ.value; if (wdv !== null && !(t.wPack && t.wPack.pack && U.uWaterP.value.z > 0.5 && wkv > 0.5)) { const sh = sm01(sq, sq + SHORE_RISE, wdv); h = wlv * wkv * (1 - sh) + h * sh; }
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
        // (still water lies level; the tile's own picture of the Earth says where, as it does to the vertex shader)
        let wet = 1; if (wdv !== null) wet = sm01(sq, sq + WET_RISE, wdv); else { const ib = t.iPack, ip = ib && !ib.absent ? ib.pack : null; if (ip && ip.alpha) { const r = ib.rect, fx = (r[0] + u * r[2]) * ip.w - 0.5, fy = (r[1] + v * r[3]) * ip.h - 0.5; const x0 = Math.max(0, Math.min(ip.w - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(ip.h - 2, Math.floor(fy))), ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0)), d = ip.alpha, w = ip.w;
          wet = WET(((d[y0 * w + x0] * (1 - ax) + d[y0 * w + x0 + 1] * ax) * (1 - ay) + (d[(y0 + 1) * w + x0] * (1 - ax) + d[(y0 + 1) * w + x0 + 1] * ax) * ay) / 255); } else if (ib && !ib.absent) { const a = this.waterAlpha(lonR / GEO.D2R, latR / GEO.D2R); if (a >= 0) wet = WET(a); } }
        h += (n1 * 90 * (0.08 + st) + n2 * 9 * (0.08 + 1.2 * st)) * amp * dispOn * wet; h = Math.max(h, 0.5);
      }
      return h;
    }
    gpuHeightAt(lon, lat, vcache) {
      const t = this.tileAtPoint(lon, lat); if (!t) return this.meshHeightAt0(lon, lat, vcache);
      const b = GEO.tileBounds(t.L, t.tx, t.ty); const G = t.grid;
      const fx = (lon - b.lon0) / b.w * G, fy = (b.lat0 - lat) / b.h * G; const i = Math.min(G - 1, Math.max(0, Math.floor(fx))), j = Math.min(G - 1, Math.max(0, Math.floor(fy))); const fu = fx - i, fv = fy - j;
      const vh = (ii, jj) => { const key = t.key + ':' + G + ':' + ii + ':' + jj; if (vcache && vcache.has(key)) return vcache.get(key); const h = this.gpuVertexH(t, ii / G, jj / G); if (vcache) vcache.set(key, h); return h; };
      const ha = vh(i, j), hb = vh(i + 1, j), hc = vh(i, j + 1), hd = vh(i + 1, j + 1);
      return fu + fv <= 1 ? ha + (hb - ha) * fu + (hc - ha) * fv : hd + (hc - hd) * (1 - fu) + (hb - hd) * (1 - fv);
    }
    meshHeightAt(lon, lat, vcache) { return this.gpuHeightAt(lon, lat, vcache); }
    // fallback when no drawn tile covers the point yet: the finest grid, analytically
    meshHeightAt0(lon, lat, vcache) {
      const sp = 360 / (2 << this.maxLevel) / this.gridOf(this.maxLevel);
      const fx = (lon + 180) / sp, fy = (90 - lat) / sp; const i = Math.floor(fx), j = Math.floor(fy); const fu = fx - i, fv = fy - j;
      const vh = (ii, jj) => { const key = ii * 1048576 + jj; if (vcache && vcache.has(key)) return vcache.get(key); const h0 = this.heightAt(-180 + ii * sp, 90 - jj * sp); const h = h0 > 1 ? Math.max(h0, 0.5) : h0; if (vcache) vcache.set(key, h); return h; };
      const ha = vh(i, j), hb = vh(i + 1, j), hc = vh(i, j + 1), hd = vh(i + 1, j + 1);
      return fu + fv <= 1 ? ha + (hb - ha) * fu + (hc - ha) * fv : hd + (hc - hd) * (1 - fu) + (hb - hd) * (1 - fv);
    }
    // water as the shader draws it without the field of the water's edge: the picture's alpha (land 1, river 0.75, lake 0.5, sea 0)
    // from the finest of its packs that is here (the mask is one mask at every level from the third up); -1 if unknown yet
    waterAlpha(lon, lat) {
      const I = this.img; if (!I) return -1; const per = I.packTiles, ap = I.apron || 0, ts = I.tile || 512;
      for (let l = this.imgMax; l >= Math.min(3, this.imgMax); l--) {
        const [tx, ty] = GEO.tileAt(l, lon, lat), px = Math.floor(tx / per), py = Math.floor(ty / per), lv = I.levels[l];
        if (lv && lv.packs[py * lv.nx + px] === 'S') return 0;      // (nothing but sea: no pack was made)
        const p = this.packs.get(`i${l}/${px}/${py}`); if (!p || p.state !== 'ready' || !p.alpha) continue;
        const tilesX = 2 << l, tilesY = 1 << l, ptx = Math.min(per, tilesX - px * per), pty = Math.min(per, tilesY - py * per);
        const lonW = 360 / tilesX * ptx, latH = 180 / tilesY * pty, lon0 = -180 + px * per * 360 / tilesX, lat0 = 90 - py * per * 180 / tilesY;
        const fx = ap + ((lon - lon0) / lonW) * ptx * ts - 0.5, fy = ap + ((lat0 - lat) / latH) * pty * ts - 0.5;
        const x0 = Math.max(0, Math.min(p.w - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(p.h - 2, Math.floor(fy)));
        const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0)), d = p.alpha, w = p.w;
        return ((d[y0 * w + x0] * (1 - ax) + d[y0 * w + x0 + 1] * ax) * (1 - ay) + (d[(y0 + 1) * w + x0] * (1 - ax) + d[(y0 + 1) * w + x0 + 1] * ax) * ay) / 255;
      }
      return -1;
    }
    // How far it is to the water's edge, metres (water negative), from the finest pack of the field that is here; this.wKind
    // (and this.wOpen: how open that water lies, 0..1; this.wLevel: how high it stands if it is fresh, metres, -1 where not known;
    // this.wPending: the answer is null only because a pack that has a shore here is still on its way)
    // is then what water that is (0 the sea .. 1 fresh). null where the field does not say (not fetched, not made, a pack still
    // on its way): the picture's own map answers then (waterAlpha). Only what has been drawn has its packs: this asks for none.
    shoreAt(lon, lat) {
      this.wPending = false; const W = this.water; if (!W || this.waterOff) return null;
      const per = W.packTiles, ap = W.apron, ts = W.tile;
      for (let l = this.wMax; l >= this.wMin; l--) {
        const lv = W.levels[l], [tx, ty] = GEO.tileAt(l, lon, lat), px = Math.floor(tx / per), py = Math.floor(ty / per), c = lv.packs[py * lv.nx + px];
        if (c === 'L') { this.wKind = 0; this.wOpen = 0; this.wLevel = -1; return 480 * lv.scale; }
        if (c === 'S' || c === 'F') { this.wKind = c === 'F' ? 1 : 0; this.wOpen = 1; this.wLevel = c === 'F' ? -1 : 0; return -3600 * lv.scale; }
        if (c !== 'P') return null;
        const p = this.packs.get(`w${l}/${px}/${py}`); if (!p || p.state !== 'ready') { this.wPending = true; continue; }      // (there is a shore here, and its pack has not come yet)
        const span = per * 360 / (2 << l), fx = ap + (lon + 180 - px * span) / span * per * ts - 0.5, fy = ap + (90 - py * span - lat) / span * per * ts - 0.5;
        const x0 = Math.max(0, Math.min(p.w - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(p.h - 2, Math.floor(fy))), ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0));
        const D = this.wDec, d = p.dist, i = (y0 * p.w + x0) * 3, j = i + p.w * 3;
        this.wKind = (((d[i + 1] >> 4) * (1 - ax) + (d[i + 4] >> 4) * ax) * (1 - ay) + ((d[j + 1] >> 4) * (1 - ax) + (d[j + 4] >> 4) * ax) * ay) / 15;
        this.wOpen = (((d[i + 1] & 15) * (1 - ax) + (d[i + 4] & 15) * ax) * (1 - ay) + ((d[j + 1] & 15) * (1 - ax) + (d[j + 4] & 15) * ax) * ay) / 15;
        this.wPending = false; this.wLevel = this.uWaterL.value ? wLevF((d[i + 2] * (1 - ax) + d[i + 5] * ax) * (1 - ay) + (d[j + 2] * (1 - ax) + d[j + 5] * ax) * ay) : -1;      // (-1: not known)
        return ((D[d[i]] * (1 - ax) + D[d[i + 3]] * ax) * (1 - ay) + (D[d[j]] * (1 - ax) + D[d[j + 3]] * ax) * ay) * lv.scale;
      }
      return null;
    }
    isWater(lon, lat) { const d = this.shoreAt(lon, lat); if (d !== null) return d < 0; const a = this.waterAlpha(lon, lat); return a >= 0 ? a < 0.62 : this.heightAt(lon, lat) < 0.5; }
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
  window.TERRAIN = { Terrain, TILE, VERT, FRAG };      // (the shaders too: a tool can read this file again and hand a running page its new ones)
})();
