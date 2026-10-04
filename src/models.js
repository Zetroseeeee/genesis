// GENESIS model library: real 3D building models (generated meshes with a LOD ladder) drawn as instances. Where a
// model exists for a building kind, culture and era, the world layer uses it in place of the procedural kit archetype.
// Classic script; exposes window.MODELS.
//
// data/models/index.json lists every model: true size in metres, the kit kinds it stands in for, the cultures and
// eras it belongs to, and its LOD files (l0 finest). Files load on demand, coarsest first, so a town appears at once
// and sharpens as its files arrive.
(function () {
  const VERT = `
    attribute vec4 aInfo;                 // era, seed, flags (1 ruin), progress (1 = finished)
    uniform mat4 uGeo;                    // mesh node transform (undoes the file's quantisation): to model metres
    uniform float uH, uSkirt;             // model height (m); how far the footing is pushed into the ground (m)
    varying vec3 vN, vView, vLocal; varying vec2 vUv; varying vec4 vInfo;
    void main() {
      vec4 p = uGeo * vec4(position, 1.0);
      vLocal = p.xyz;
      // the footing: the lowest ring of the walls reaches down into the ground so nothing floats on a slope
      p.y -= uSkirt * (1.0 - smoothstep(0.0, 0.02 * uH + 0.02, p.y));
      vec4 mv = modelViewMatrix * instanceMatrix * p; vView = mv.xyz;
      vN = normalize(normalMatrix * (mat3(instanceMatrix) * (mat3(uGeo) * normal)));
      vUv = uv; vInfo = aInfo;
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    precision highp float;
    uniform sampler2D uMap, uNormalMap, uOrmMap; uniform float uHasN, uHasOrm, uH, uUnits, uFoliage;
    uniform vec3 uSunV, uUpV, uGround, uSunCol; uniform float uDay, uCamAlt, uTime, uSnow, uDusk, uHome;
    varying vec3 vN, vView, vLocal; varying vec2 vUv; varying vec4 vInfo;
    ${window.SHADOWS ? SHADOWS.GLSL : 'const vec4 uShadowP = vec4(0.0); float sunHidden(vec3 p) { return 0.0; }'}
    float h21(vec2 p) { p = mod(p, 512.0); vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    // tangent frame from screen-space derivatives (the files carry no tangents)
    vec3 bump(vec3 N, vec3 V, vec2 uv, vec3 mapN) {
      vec3 q0 = dFdx(V), q1 = dFdy(V); vec2 st0 = dFdx(uv), st1 = dFdy(uv);
      vec3 q1p = cross(q1, N), q0p = cross(N, q0);
      vec3 T = q1p * st0.x + q0p * st1.x, B = q1p * st0.y + q0p * st1.y;
      float det = max(dot(T, T), dot(B, B)); float sc = det == 0.0 ? 0.0 : inversesqrt(det);
      return normalize(T * (mapN.x * sc) + B * (mapN.y * sc) + N * mapN.z);
    }
    void main() {
      float era = floor(vInfo.x + 0.5), seed = vInfo.y, flags = floor(vInfo.z + 0.5), prog = vInfo.w;
      // a building going up: nothing above the build line, and the line is ragged, course by course
      if (prog < 0.999) { float rag = (vnoise(vec2(vLocal.x * 1.7 + vLocal.z * 1.3, seed * 40.0)) - 0.5) * 0.08 * uH; if (vLocal.y > prog * uH * 1.03 + rag) discard; }
      vec3 col = texture2D(uMap, vUv).rgb; float lum0 = dot(col, vec3(0.3, 0.6, 0.1));
      vec3 n = normalize(vN); vec3 ng = n;
      if (uHasN > 0.5) n = bump(n, vView, vUv, texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0);
      float rough = 0.88, metal = 0.0;
      if (uHasOrm > 0.5) { vec3 orm = texture2D(uOrmMap, vUv).rgb; rough = clamp(orm.g, 0.08, 1.0); metal = orm.b; }
      // repeats of one model should not read as copies: a little tone and warmth per building
      float t1 = fract(seed * 7.31), t2 = fract(seed * 13.7);
      col *= (0.90 + 0.18 * t1) * mix(vec3(1.03, 1.0, 0.96), vec3(0.97, 1.0, 1.03), t2);
      // a tree: its leaves turn in autumn and go in winter (vInfo.x: how far into autumn; flags: how bare, in 31 steps of two)
      if (uFoliage > 0.5) {
        float fall = clamp(vInfo.x, 0.0, 1.0), bare = floor(flags * 0.5) / 31.0;
        float leaf = smoothstep(0.015, 0.09, col.g - max(col.r, col.b) * 0.93);                 // green-dominant texels are leaves, the rest is bark
        vec3 g3 = vec3(dot(col, vec3(0.3, 0.6, 0.1)));
        col = mix(col, g3 * mix(vec3(2.2, 1.3, 0.35), vec3(2.0, 0.78, 0.26), fract(seed * 5.3)), fall * leaf);
        col = mix(col, g3 * vec3(0.84, 0.72, 0.6), bare * leaf);
      }
      // fresh work near the build line is paler and dustier than the finished wall
      if (prog < 0.999) { float raw = smoothstep(0.25 * uH, 0.0, prog * uH - vLocal.y); col = mix(col, vec3(dot(col, vec3(0.3, 0.6, 0.1))) * vec3(1.04, 1.0, 0.94) + 0.06, raw * 0.45); }
      float isRuin = mod(flags, 2.0);
      if (isRuin > 0.5) { float moss = smoothstep(0.4 * uH, 0.0, vLocal.y) * vnoise(vLocal.xz * 0.6 + seed) * 0.6; col = mix(col, vec3(0.42, 0.4, 0.34), 0.35); col = mix(col, vec3(0.3, 0.38, 0.2), moss); }
      // winter where winters are white: snow lies on what faces the sky (roofs, wall tops, the lintels of a stone circle)
      if (uSnow > 0.01 && uFoliage < 0.5) { float lie = uSnow * smoothstep(0.2, 0.58, dot(ng, uUpV) + (vnoise(vLocal.xz * 0.9 + seed * 9.0) - 0.5) * 0.3); col = mix(col, vec3(0.9, 0.92, 0.96), lie * 0.93); rough = mix(rough, 0.92, lie); }
      // lighting: the same sun and sky terms as the kit and the terrain, so everything sits in one light
      float diff = max(dot(n, uSunV), 0.0);
      if (uFoliage > 0.5) diff = diff * 0.6 + 0.4 * (0.5 + 0.5 * dot(n, uSunV));      // light gets into a crown: no hard dark side
      // what stands between this point and the sun: the map is read a little way out along the surface normal, so a wall does not shade itself
      float hid = sunHidden(vView + ng * uShadowP.w * 2.5) * (uFoliage > 0.5 ? 0.8 : 1.0);
      diff *= 1.0 - hid;
      float sky = 0.5 + 0.5 * dot(n, uUpV);
      // the generated textures are photographs of lit buildings: full sun brings a surface to about its own brightness, no more
      // sky light from above, warm light thrown back by the ground from below: a wall in shade is neutral, not blue
      // (the higher the sun, the more the lit ground gives back: a wall in shade in a sunlit town is warm, not grey)
      vec3 amb = mix(vec3(0.20, 0.25, 0.40) * (0.7 + 0.5 * sky), vec3(0.33, 0.34, 0.37) * (0.45 + 0.75 * sky) + uGround * (1.0 - sky) * (0.3 + 0.7 * max(dot(uUpV, uSunV), 0.0)) * 0.62, uDay)
        + vec3(0.27, 0.19, 0.20) * uDusk * (0.5 + 0.6 * sky);        // moonlight is blue and enough to see by; at dusk the whole sky glows and lights what the sun no longer reaches
      float foot = 1.0 - 0.2 * smoothstep(0.05 * uH, 0.0, vLocal.y);
      vec3 lit = col * (amb + diff * 0.82 * uSunCol) * foot;
      vec3 v = normalize(-vView); vec3 hv = normalize(v + uSunV);
      float gloss = (1.0 - rough) * (1.0 - rough);
      lit += mix(vec3(0.35), col, metal) * pow(max(dot(n, hv), 0.0), mix(6.0, 90.0, 1.0 - rough)) * gloss * uDay * step(0.0, dot(n, uSunV)) * (1.0 - hid);
      // generated textures already carry their own highlights: roll the brightest values off instead of clipping them
      { vec3 x = max(lit - 0.78, 0.0) / 0.22; vec3 e = exp(-2.0 * x); lit = mix(lit, 0.78 + 0.22 * (1.0 - e) / (1.0 + e), step(0.78, lit)); }
      // night: in a lived-in house the fire shows in the doorway and through every dark opening in the walls, and a
      // little of it lies on the wall beside (the texture's own darkest places low on a wall are its openings)
      float night = 1.0 - uDay;
      float home = smoothstep(0.25, 0.75, fract(seed * 91.7)) * (1.0 - isRuin) * step(0.999, prog) * uHome;      // some hearths burn high, some are embers, a quarter of the houses are dark
      vec3 lamp = era >= 6.0 ? vec3(1.0, 0.86, 0.62) : vec3(1.0, 0.56, 0.24);
      float wallish = 1.0 - smoothstep(0.2, 0.5, dot(ng, uUpV)), lowW = smoothstep(0.62 * uH, 0.12 * uH, vLocal.y);
      float opening = smoothstep(0.2, 0.06, lum0) * wallish * lowW;
      lit += lamp * night * home * (opening * 1.3 + col * 0.22 * lowW * wallish) * (0.85 + 0.15 * sin(uTime * 7.0 + seed * 50.0));
      // aerial perspective shared with the terrain and the kit
      float distKm = length(vView) * uUnits; float low = smoothstep(0.035, 0.002, uCamAlt);
      float fog = (1.0 - exp(-distKm / 260.0)) * low * 0.92;
      vec3 skyCol = mix(vec3(0.01, 0.015, 0.035), vec3(0.70, 0.80, 0.92), uDay);
      gl_FragColor = vec4(mix(lit, skyCol, fog), 1.0);
    }`;

  // the same shape drawn into the sun's depth map: same placement and footing, nothing above the build line
  const DEPTH_VERT = `
    attribute vec4 aInfo; uniform mat4 uGeo; uniform float uH, uSkirt; varying vec3 vLocal; varying float vProg;
    void main() {
      vec4 p = uGeo * vec4(position, 1.0); vLocal = p.xyz; vProg = aInfo.w;
      p.y -= uSkirt * (1.0 - smoothstep(0.0, 0.02 * uH + 0.02, p.y));
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * p;
    }`;
  const DEPTH_FRAG = `
    precision highp float; uniform float uH; varying vec3 vLocal; varying float vProg;
    void main() { if (vProg < 0.999 && vLocal.y > vProg * uH * 1.03) discard; gl_FragColor = vec4(1.0); }`;

  const M = {
    ready: false, failed: false, defs: {}, byKind: {}, base: 'data/models/', group: null, shared: null, loader: null,
    // pixel heights at which each LOD takes over (l0 above the first, l1 above the second, ...)
    lodPx: [520, 190, 60, 18, 0], lodBias: 1, maxLoads: 6, loading: 0, queue: [], dirty: false, anisotropy: 8,
    stats: { instances: 0, tris: 0, draws: 0, loaded: 0 }, sig: 0, VERT, FRAG,
  };

  // shared: { uSunV, uUpV, uDay, uCamAlt, uTime } uniform objects (the world's own, so one update lights everything)
  M.init = function (scene, shared, opts) {
    M.group = new THREE.Group(); M.group.name = 'models'; scene.add(M.group); M.shared = shared;
    M.units = (opts && opts.units) || 6371.0;            // scene units -> km for the haze (1 scene unit = Earth radius on the globe)
    if (opts && opts.anisotropy) M.anisotropy = opts.anisotropy;
    if (THREE.GLTFLoader) { M.loader = new THREE.GLTFLoader(); if (window.MeshoptDecoder) M.loader.setMeshoptDecoder(window.MeshoptDecoder); }
  };
  M.load = async function (url) {
    try {
      if (!M.loader) { M.failed = true; return M; }
      const r = await fetch(url || (M.base + 'index.json')); if (!r.ok) { M.failed = true; return M; }
      const idx = await r.json();
      for (const id of Object.keys(idx.models || {})) {
        const e = idx.models[id]; if ((!e.lods || !e.lods.length) && !e.card) continue;      // a mesh, or at least a card (trees)
        const def = { id, w: e.w, h: e.h, d: e.d, kinds: e.kinds || [], cultures: e.cultures || null, eras: e.eras || [0, 8], fit: e.fit || '', site: e.site || '', sides: e.sides || '', open: !!e.open, tree: (e.kinds || []).some((k) => k.indexOf('tree_') === 0), flora: e.tree || null, card: e.card || null, mean: e.mean || null, lods: (e.lods || []).map((l, k) => ({ k, file: l.file, tris: l.tris, state: '', mesh: null, mat: null, count: 0, cap: 0 })) };
        M.defs[id] = def;
        // where a model is used: its own kinds, eras and cultures, plus any further uses of the same mesh (also: [{ kinds, eras, cultures }])
        const use = (kinds, eras, cultures) => { for (const kind of kinds) (M.byKind[kind] = M.byKind[kind] || []).push({ def, eras, cultures }); };
        use(def.kinds, def.eras, def.cultures); for (const u of e.also || []) use(u.kinds || [], u.eras || def.eras, u.cultures === undefined ? def.cultures : u.cultures);
      }
      M.ready = Object.keys(M.defs).length > 0;
      // the two coarsest steps of every model are a few kilobytes each: fetch them all now (coarsest first), so no town
      // ever opens on kit boxes and what stands in while the finer files arrive already has the model's shape
      for (const id in M.defs) { const d = M.defs[id]; if (d.lods.length && !d.tree) request(d, d.lods[d.lods.length - 1], false); }      // (trees are drawn as cards: their meshes stay on disk)
      for (const id in M.defs) { const d = M.defs[id]; if (d.lods.length > 1 && !d.tree) request(d, d.lods[d.lods.length - 2], false); }
    } catch (e) { console.warn('models unavailable', e); M.failed = true; }
    return M;
  };
  // the model for a kit kind in a culture and era, or null. seed in [0,1) picks among variants.
  const CULT = ['med', 'north', 'east', 'mena', 'africa', 'sasia', 'easia', 'seasia', 'america', 'namerica'];
  M.pick = function (kind, era, culture, seed) {
    const list = M.byKind[kind]; if (!list) return null;
    const cn = CULT[culture]; let n = 0; const ok = M._ok || (M._ok = []);
    for (let i = 0; i < list.length; i++) { const u = list[i]; if (era < u.eras[0] || era > u.eras[1]) continue; if (u.cultures && u.cultures.indexOf(cn) < 0) continue; ok[n++] = u.def; }
    if (!n) return null;
    return ok[Math.min(n - 1, Math.floor((seed - Math.floor(seed)) * n))];
  };

  // kinds nobody lives in: no firelight in them at night
  const NOFIRE = new Set(['ziggurat', 'pyramid', 'steppyramid', 'stupa', 'mound', 'menhirs', 'well', 'pier', 'boat', 'granary', 'barn', 'palisade', 'watchtower', 'wall_mud', 'gate_mud', 'gate_palisade', 'tower_mud']);
  function makeLod(def, L, gltf) {
    let mesh = null; gltf.scene.updateMatrixWorld(true); gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) { L.state = 'failed'; return; }
    const src = mesh.material; const tex = (t) => { if (t) { t.anisotropy = M.anisotropy; t.needsUpdate = true; } return t || null; };
    const map = tex(src.map), nrm = tex(src.normalMap), orm = tex(src.roughnessMap || src.metalnessMap);
    const sh = M.shared;
    const uniforms = {
      uSunV: sh.uSunV, uUpV: sh.uUpV, uDay: sh.uDay, uCamAlt: sh.uCamAlt, uTime: sh.uTime, uGround: sh.uGround || { value: new THREE.Vector3(0.42, 0.4, 0.26) }, uSnow: sh.uSnow || { value: 0 }, uSunCol: sh.uSunCol || { value: new THREE.Vector3(1, 1, 1) }, uDusk: sh.uDusk || { value: 0 },
      uHome: { value: def.tree || def.fit || def.open || (def.kinds || []).some((k) => NOFIRE.has(k)) ? 0 : 1 },      // does anybody keep a fire in it at night
      uMap: { value: map }, uNormalMap: { value: nrm }, uOrmMap: { value: orm }, uHasN: { value: nrm ? 1 : 0 }, uHasOrm: { value: orm ? 1 : 0 },
      uGeo: { value: mesh.matrixWorld.clone() }, uH: { value: def.h }, uSkirt: { value: def.tree ? 0.4 : Math.max(1.5, def.h * 0.18) }, uUnits: { value: M.units }, uFoliage: { value: def.tree ? 1 : 0 },
    };
    if (window.SHADOWS) Object.assign(uniforms, SHADOWS.uniforms);
    L.mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, extensions: { derivatives: true } });
    L.depth = new THREE.ShaderMaterial({ uniforms: { uGeo: uniforms.uGeo, uH: uniforms.uH, uSkirt: uniforms.uSkirt }, vertexShader: DEPTH_VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide }); L.depth.colorWrite = false;
    L.geo = mesh.geometry; L.tris = L.geo.index ? L.geo.index.count / 3 : L.geo.attributes.position.count / 3;
    grow(L, 64);
    L.state = 'ready'; M.stats.loaded++; M.dirty = true;
  }
  function grow(L, cap, def) {
    if (L.mesh) { M.group.remove(L.mesh); L.mesh.dispose && L.mesh.dispose(); }
    const info = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); info.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry(); geo.index = L.geo.index; for (const k in L.geo.attributes) geo.setAttribute(k, L.geo.attributes[k]);   // vertex data shared by reference; only the instance buffers are new
    geo.setAttribute('aInfo', info);
    const im = new THREE.InstancedMesh(geo, L.mat, cap); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    L.mesh = im; L.info = info; L.cap = cap; M.group.add(im); if (window.SHADOWS) SHADOWS.caster(im, L.depth);
  }
  function pump() {
    while (M.loading < M.maxLoads && M.queue.length) {
      const [def, L] = M.queue.shift(); M.loading++;
      M.loader.load(M.base + L.file, (g) => { M.loading--; try { makeLod(def, L, g); } catch (e) { console.warn('model', L.file, e); L.state = 'failed'; } pump(); }, undefined, (e) => { M.loading--; L.state = 'failed'; console.warn('model failed', L.file); pump(); });
    }
  }
  function request(def, L, urgent) { if (L.state) return; L.state = 'loading'; if (urgent) M.queue.unshift([def, L]); else M.queue.push([def, L]); pump(); }
  // The cut-out photograph of a model (its "card"), for things drawn as a picture facing the camera. Loads on first
  // ask; returns { tex, aspect, pivot } once it is there, null until then (or if the model has none).
  M.card = function (def) {
    const c = def.card; if (!c) return null;
    if (c.state === 'ready') return c;
    if (!c.state) {
      c.state = 'loading';
      new THREE.TextureLoader().load(M.base + c.file, (t) => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; c.tex = t; c.state = 'ready'; M.stats.loaded++; }, undefined, () => { c.state = 'failed'; console.warn('card failed', c.file); });
    }
    return null;
  };
  // An independent set of instances of one LOD, for layers that rebuild on their own clock (the forests): shares the
  // LOD's vertex data and material, owns its instance buffers. push returns the batch to keep (a larger one when it grew).
  M.batch = function (L, cap) {
    const info = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); info.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry(); geo.index = L.geo.index; for (const k in L.geo.attributes) geo.setAttribute(k, L.geo.attributes[k]); geo.setAttribute('aInfo', info);
    const im = new THREE.InstancedMesh(geo, L.mat, cap); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); M.group.add(im); if (window.SHADOWS) SHADOWS.caster(im, L.depth);
    return { mesh: im, info, cap, count: 0, L };
  };
  M.batchPush = function (B, matrix, a, b, c, d) {
    if (B.count >= B.cap) { const N = M.batch(B.L, B.cap * 2); N.mesh.instanceMatrix.array.set(B.mesh.instanceMatrix.array); N.info.array.set(B.info.array); N.count = B.count; M.group.remove(B.mesh); B.mesh.dispose && B.mesh.dispose(); B = N; }
    B.mesh.setMatrixAt(B.count, matrix); B.info.setXYZW(B.count, a, b, c, d); B.count++; return B;
  };
  M.batchEnd = function (B) { B.mesh.count = B.count; GEO.touch(B.mesh.instanceMatrix, B.count); GEO.touch(B.info, B.count); };
  M.batchDrop = function (B) { M.group.remove(B.mesh); B.mesh.dispose && B.mesh.dispose(); };
  // the LOD to draw for a model seen px pixels tall: the wanted one if it is loaded, else the nearest loaded one
  // (asking for the wanted one, and for the coarsest so there is always something to show). null = nothing yet.
  M.lodFor = function (def, px) {
    const T = M.lodPx; const n = def.lods.length; const b = M.lodBias; let want = n - 1;
    for (let k = 0; k < n; k++) if (px * b >= T[Math.min(k, T.length - 1)]) { want = k; break; }
    const W = def.lods[want]; if (W.state === 'ready') return W;
    request(def, def.lods[n - 1], true); request(def, W, false);
    for (let k = want + 1; k < n; k++) if (def.lods[k].state === 'ready') return def.lods[k];
    for (let k = want - 1; k >= 0; k--) if (def.lods[k].state === 'ready') return def.lods[k];
    return null;
  };
  // true while a model has nothing to show yet but its files are on their way: the plot stays bare for that moment
  // rather than showing a stand-in from another age
  M.pending = function (def) { let loading = false; for (const L of def.lods) { if (L.state === 'ready') return false; if (L.state === 'loading') loading = true; } return loading; };
  M.begin = function () { for (const id in M.defs) for (const L of M.defs[id].lods) L.count = 0; M.sig = 0; };
  M.push = function (L, matrix, era, seed, flags, prog) {
    if (L.count >= L.cap) { const old = L.mesh, oi = L.info; grow(L, L.cap * 2); L.mesh.instanceMatrix.array.set(old.instanceMatrix.array); L.info.array.set(oi.array); }
    L.mesh.setMatrixAt(L.count, matrix); L.info.setXYZW(L.count, era, seed, flags || 0, prog === undefined ? 1 : prog); L.count++;
    // a running signature of everything placed: what stands where, at which level of detail and how far built (the shadow map is redrawn only when it changes)
    const e = matrix.elements; M.sig = Math.imul(M.sig ^ ((e[12] * 1e9) | 0), 16777619) ^ ((e[13] * 1e9) | 0); M.sig = Math.imul(M.sig ^ ((e[14] * 1e9) | 0), 16777619) ^ ((e[5] * 1e12) | 0) ^ (L.k << 20) ^ (((prog === undefined ? 1 : prog) * 1000) | 0);
  };
  M.end = function () {
    let inst = 0, tris = 0, draws = 0;
    for (const id in M.defs) for (const L of M.defs[id].lods) { if (!L.mesh) continue; L.mesh.count = L.count; if (L.count) { GEO.touch(L.mesh.instanceMatrix, L.count); GEO.touch(L.info, L.count); inst += L.count; tris += L.count * L.tris; draws++; } }
    M.stats.instances = inst; M.stats.tris = tris; M.stats.draws = draws; M.dirty = false;
  };
  window.MODELS = M;
})();
