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
    uniform sampler2D uMap, uNormalMap, uOrmMap; uniform float uHasN, uHasOrm, uH, uUnits;
    uniform vec3 uSunV, uUpV; uniform float uDay, uCamAlt, uTime;
    varying vec3 vN, vView, vLocal; varying vec2 vUv; varying vec4 vInfo;
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
      vec3 col = texture2D(uMap, vUv).rgb;
      vec3 n = normalize(vN);
      if (uHasN > 0.5) n = bump(n, vView, vUv, texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0);
      float rough = 0.88, metal = 0.0;
      if (uHasOrm > 0.5) { vec3 orm = texture2D(uOrmMap, vUv).rgb; rough = clamp(orm.g, 0.08, 1.0); metal = orm.b; }
      // repeats of one model should not read as copies: a little tone and warmth per building
      float t1 = fract(seed * 7.31), t2 = fract(seed * 13.7);
      col *= (0.90 + 0.18 * t1) * mix(vec3(1.03, 1.0, 0.96), vec3(0.97, 1.0, 1.03), t2);
      // fresh work near the build line is paler and dustier than the finished wall
      if (prog < 0.999) { float raw = smoothstep(0.25 * uH, 0.0, prog * uH - vLocal.y); col = mix(col, vec3(dot(col, vec3(0.3, 0.6, 0.1))) * vec3(1.04, 1.0, 0.94) + 0.06, raw * 0.45); }
      float isRuin = mod(flags, 2.0);
      if (isRuin > 0.5) { float moss = smoothstep(0.4 * uH, 0.0, vLocal.y) * vnoise(vLocal.xz * 0.6 + seed) * 0.6; col = mix(col, vec3(0.42, 0.4, 0.34), 0.35); col = mix(col, vec3(0.3, 0.38, 0.2), moss); }
      // lighting: the same sun and sky terms as the kit and the terrain, so everything sits in one light
      float diff = max(dot(n, uSunV), 0.0);
      float sky = 0.5 + 0.5 * dot(n, uUpV);
      vec3 amb = mix(vec3(0.07, 0.08, 0.12), vec3(0.40, 0.43, 0.5), uDay) * (0.7 + 0.5 * sky);
      float foot = 1.0 - 0.2 * smoothstep(0.05 * uH, 0.0, vLocal.y);
      vec3 lit = col * (amb + diff * 1.15 * uDay) * foot;
      vec3 v = normalize(-vView); vec3 hv = normalize(v + uSunV);
      float gloss = (1.0 - rough) * (1.0 - rough);
      lit += mix(vec3(0.35), col, metal) * pow(max(dot(n, hv), 0.0), mix(6.0, 90.0, 1.0 - rough)) * gloss * uDay * step(0.0, dot(n, uSunV));
      // generated textures already carry their own highlights: roll the brightest values off instead of clipping them
      { vec3 x = max(lit - 0.78, 0.0) / 0.22; vec3 e = exp(-2.0 * x); lit = mix(lit, 0.78 + 0.22 * (1.0 - e) / (1.0 + e), step(0.78, lit)); }
      // night: hearth and lamp light spills low around lived-in buildings
      float night = 1.0 - uDay;
      float home = step(0.35, fract(seed * 91.7)) * (1.0 - isRuin) * step(0.999, prog);
      vec3 lamp = era >= 6.0 ? vec3(1.0, 0.86, 0.62) : vec3(1.0, 0.58, 0.26);
      lit += col * lamp * night * home * 0.55 * smoothstep(0.45 * uH, 0.0, vLocal.y) * (0.85 + 0.15 * sin(uTime * 7.0 + seed * 50.0));
      // aerial perspective shared with the terrain and the kit
      float distKm = length(vView) * uUnits; float low = smoothstep(0.035, 0.002, uCamAlt);
      float fog = (1.0 - exp(-distKm / 260.0)) * low * 0.92;
      vec3 skyCol = mix(vec3(0.01, 0.015, 0.035), vec3(0.70, 0.80, 0.92), uDay);
      gl_FragColor = vec4(mix(lit, skyCol, fog), 1.0);
    }`;

  const M = {
    ready: false, failed: false, defs: {}, byKind: {}, base: 'data/models/', group: null, shared: null, loader: null,
    // pixel heights at which each LOD takes over (l0 above the first, l1 above the second, ...)
    lodPx: [520, 190, 60, 18, 0], lodBias: 1, maxLoads: 6, loading: 0, queue: [], dirty: false, anisotropy: 8,
    stats: { instances: 0, tris: 0, draws: 0, loaded: 0 }, VERT, FRAG,
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
        const e = idx.models[id]; if (!e.lods || !e.lods.length) continue;
        const def = { id, w: e.w, h: e.h, d: e.d, kinds: e.kinds || [], cultures: e.cultures || null, eras: e.eras || [0, 8], fit: e.fit || '', site: e.site || '', sides: e.sides || '', open: !!e.open, mean: e.mean || null, lods: e.lods.map((l, k) => ({ k, file: l.file, tris: l.tris, state: '', mesh: null, mat: null, count: 0, cap: 0 })) };
        M.defs[id] = def; for (const kind of def.kinds) (M.byKind[kind] = M.byKind[kind] || []).push(def);
      }
      M.ready = Object.keys(M.defs).length > 0;
      // the two coarsest steps of every model are a few kilobytes each: fetch them all now (coarsest first), so no town
      // ever opens on kit boxes and what stands in while the finer files arrive already has the model's shape
      for (const id in M.defs) { const d = M.defs[id]; request(d, d.lods[d.lods.length - 1], false); }
      for (const id in M.defs) { const d = M.defs[id]; if (d.lods.length > 1) request(d, d.lods[d.lods.length - 2], false); }
    } catch (e) { console.warn('models unavailable', e); M.failed = true; }
    return M;
  };
  // the model for a kit kind in a culture and era, or null. seed in [0,1) picks among variants.
  const CULT = ['med', 'north', 'east', 'mena', 'africa', 'sasia', 'easia', 'seasia', 'america', 'namerica'];
  M.pick = function (kind, era, culture, seed) {
    const list = M.byKind[kind]; if (!list) return null;
    const cn = CULT[culture]; let n = 0; const ok = M._ok || (M._ok = []);
    for (let i = 0; i < list.length; i++) { const d = list[i]; if (era < d.eras[0] || era > d.eras[1]) continue; if (d.cultures && d.cultures.indexOf(cn) < 0) continue; ok[n++] = d; }
    if (!n) return null;
    return ok[Math.min(n - 1, Math.floor((seed - Math.floor(seed)) * n))];
  };

  function makeLod(def, L, gltf) {
    let mesh = null; gltf.scene.updateMatrixWorld(true); gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) { L.state = 'failed'; return; }
    const src = mesh.material; const tex = (t) => { if (t) { t.anisotropy = M.anisotropy; t.needsUpdate = true; } return t || null; };
    const map = tex(src.map), nrm = tex(src.normalMap), orm = tex(src.roughnessMap || src.metalnessMap);
    const sh = M.shared;
    const uniforms = {
      uSunV: sh.uSunV, uUpV: sh.uUpV, uDay: sh.uDay, uCamAlt: sh.uCamAlt, uTime: sh.uTime,
      uMap: { value: map }, uNormalMap: { value: nrm }, uOrmMap: { value: orm }, uHasN: { value: nrm ? 1 : 0 }, uHasOrm: { value: orm ? 1 : 0 },
      uGeo: { value: mesh.matrixWorld.clone() }, uH: { value: def.h }, uSkirt: { value: Math.max(1.5, def.h * 0.18) }, uUnits: { value: M.units },
    };
    L.mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, extensions: { derivatives: true } });
    L.geo = mesh.geometry; L.tris = L.geo.index ? L.geo.index.count / 3 : L.geo.attributes.position.count / 3;
    grow(L, 64);
    L.state = 'ready'; M.stats.loaded++; M.dirty = true;
  }
  function grow(L, cap) {
    if (L.mesh) { M.group.remove(L.mesh); L.mesh.dispose && L.mesh.dispose(); }
    const info = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); info.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry(); geo.index = L.geo.index; for (const k in L.geo.attributes) geo.setAttribute(k, L.geo.attributes[k]);   // vertex data shared by reference; only the instance buffers are new
    geo.setAttribute('aInfo', info);
    const im = new THREE.InstancedMesh(geo, L.mat, cap); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    L.mesh = im; L.info = info; L.cap = cap; M.group.add(im);
  }
  function pump() {
    while (M.loading < M.maxLoads && M.queue.length) {
      const [def, L] = M.queue.shift(); M.loading++;
      M.loader.load(M.base + L.file, (g) => { M.loading--; try { makeLod(def, L, g); } catch (e) { console.warn('model', L.file, e); L.state = 'failed'; } pump(); }, undefined, (e) => { M.loading--; L.state = 'failed'; console.warn('model failed', L.file); pump(); });
    }
  }
  function request(def, L, urgent) { if (L.state) return; L.state = 'loading'; if (urgent) M.queue.unshift([def, L]); else M.queue.push([def, L]); pump(); }
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
  M.begin = function () { for (const id in M.defs) for (const L of M.defs[id].lods) L.count = 0; };
  M.push = function (L, matrix, era, seed, flags, prog) {
    if (L.count >= L.cap) { const old = L.mesh, oi = L.info; grow(L, L.cap * 2); L.mesh.instanceMatrix.array.set(old.instanceMatrix.array); L.info.array.set(oi.array); }
    L.mesh.setMatrixAt(L.count, matrix); L.info.setXYZW(L.count, era, seed, flags || 0, prog === undefined ? 1 : prog); L.count++;
  };
  M.end = function () {
    let inst = 0, tris = 0, draws = 0;
    for (const id in M.defs) for (const L of M.defs[id].lods) { if (!L.mesh) continue; L.mesh.count = L.count; if (L.count) { L.mesh.instanceMatrix.needsUpdate = true; L.info.needsUpdate = true; inst += L.count; tris += L.count * L.tris; draws++; } }
    M.stats.instances = inst; M.stats.tris = tris; M.stats.draws = draws; M.dirty = false;
  };
  window.MODELS = M;
})();
