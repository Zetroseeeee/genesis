// GENESIS world layer: sim textures, 3D settlements, labels, clouds, atmosphere. Classic script; exposes window.WORLD.
(function () {
  const R_M = 6371000, KM = 1 / 6371;
  const W = 720, H = 360;
  // what is never made a little larger or smaller than its fellows (see placeModel)
  const NOVARY = new Set(['pier', 'boat', 'ship', 'well', 'mine', 'stall', 'lamp', 'menhirs']);
  function hash(i, k) { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  class World {
    constructor(opts) {
      this.scene = opts.scene; this.terrain = opts.terrain; this.sim = null; this.exag = opts.terrain.exag;
      // sim textures
      this.ownerData = new Uint8Array(W * H * 4); this.simData = new Uint8Array(W * H * 4); this.palData = new Uint8Array(4096 * 4);      // (realms, or under the lens of peoples the peoples: people.js)
      this.ownerTex = new THREE.DataTexture(this.ownerData, W, H, THREE.RGBAFormat); this.ownerTex.magFilter = this.ownerTex.minFilter = THREE.NearestFilter; this.ownerTex.wrapS = THREE.RepeatWrapping;
      this.simTex = new THREE.DataTexture(this.simData, W, H, THREE.RGBAFormat); this.simTex.magFilter = this.simTex.minFilter = THREE.LinearFilter; this.simTex.wrapS = THREE.RepeatWrapping;
      this.palTex = new THREE.DataTexture(this.palData, 4096, 1, THREE.RGBAFormat); this.palTex.magFilter = this.palTex.minFilter = THREE.NearestFilter;
      this.centroids = new Map(); // civ id -> {x,y,z,n}
      // buildings
      this.arche = BKIT.makeKit();
      this.buildingGroup = new THREE.Group(); this.scene.add(this.buildingGroup);
      this.inst = {}; const MAXI = BKIT.MAXI;
      this.bUniforms = { uSunV: { value: new THREE.Vector3(0, 1, 0) }, uUpV: { value: new THREE.Vector3(0, 1, 0) }, uDay: { value: 1 }, uCamAlt: { value: 1 }, uTime: { value: 0 }, uMetres: { value: R_M }, uTexMix: { value: 0 }, uGround: { value: new THREE.Vector3(0.42, 0.4, 0.26) }, uSnow: { value: 0 }, uSunCol: { value: new THREE.Vector3(1, 1, 1) }, uDusk: { value: 0 }, uGlow: { value: 0 } };      // uGround: the colour of the land around, for bounced light; uSnow: how much snow lies here now; uGlow: 1 where lights may be brighter than white
      if (window.SHADOWS) Object.assign(this.bUniforms, SHADOWS.uniforms);      // the kit takes the sun's depth map as the models do
      if (window.AIR) Object.assign(this.bUniforms, AIR.uniforms);              // and stands in the same air as everything else (air.js)
      this.bMat = new THREE.ShaderMaterial({ uniforms: this.bUniforms, vertexShader: BKIT.VERT, fragmentShader: BKIT.FRAG });
      this.textured = false;
      this.info = {};
      for (const k of Object.keys(this.arche)) {
        const geo = this.arche[k];
        if (!MAXI[k]) MAXI[k] = 500;
        const info = new THREE.InstancedBufferAttribute(new Float32Array(MAXI[k] * 4), 4); info.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aInfo', info); this.info[k] = info;
        const m = new THREE.InstancedMesh(geo, this.bMat, MAXI[k]); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // allocate instance colours up front so the shader compiles with per-instance colour from the first frame
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXI[k] * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
        m.userData.kind = k; this.inst[k] = m; this.buildingGroup.add(m); if (window.SHADOWS && k !== 'lamp') SHADOWS.caster(m);
      }
      this.sunLight = new THREE.DirectionalLight(0xfff2dc, 1.4); this.scene.add(this.sunLight); this.scene.add(this.sunLight.target);
      this.hemi = new THREE.HemisphereLight(0xbcd3f2, 0x5a4a3a, 0.9); this.scene.add(this.hemi);
      this.lastBuild = { lon: 999, lat: 999, dist: 0, t: -1e9, tick: -1 }; this.htMaps = new Map();
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
      this.buildingCount = 0;
      // real 3D models (models.js) share the kit's light uniforms and replace kit archetypes where a model exists
      if (window.MODELS) MODELS.init(this.scene, { uSunV: this.bUniforms.uSunV, uUpV: this.bUniforms.uUpV, uDay: this.bUniforms.uDay, uCamAlt: this.bUniforms.uCamAlt, uTime: this.bUniforms.uTime, uGround: this.bUniforms.uGround, uSnow: this.bUniforms.uSnow, uSunCol: this.bUniforms.uSunCol, uDusk: this.bUniforms.uDusk, uGlow: this.bUniforms.uGlow }, { units: 6371.0 });
      this.modelsOn = true; this._pv = new THREE.Vector3();
      // the houses of the place's own (vern.js, houses.js): a mesh for each type and level of detail, as many of it as stand near
      if (window.HOUSES) {
        this.hUniforms = Object.assign({}, this.bUniforms, { uRiseT: { value: 8 } });
        this.hMat = new THREE.ShaderMaterial({ uniforms: this.hUniforms, vertexShader: HOUSES.VERT, fragmentShader: HOUSES.FRAG });
        this.hDepth = new THREE.ShaderMaterial({ uniforms: { uTime: this.bUniforms.uTime, uRiseT: this.hUniforms.uRiseT }, side: THREE.DoubleSide,
          vertexShader: `attribute vec4 aRise; uniform float uTime, uRiseT; void main() { float p = min(aRise.z, clamp((uTime - aRise.x) / uRiseT, 0.0, 1.0)); vec3 q = position; q.y = min(q.y, p * aRise.w);
            gl_Position = uTime > aRise.y || p < 0.03 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * instanceMatrix * vec4(q, 1.0); }`,
          fragmentShader: `void main() { gl_FragColor = vec4(1.0); }` });
        this.hDepth.colorWrite = false;
      }
      this.vh = new Map(); this.rev = new Map();
      this.initSky();
    }
    setSim(sim) { this.sim = sim; for (let i = 0; i < W * H; i++) this.simData[i * 4 + 3] = Math.min(255, Math.round(sim.fert[i] * 255)); this.refreshTextures(); }
    // generated materials (textures.js): the building shader recompiles with the wall and roof texture arrays
    setTextures(T, on = true) {
      const u = this.bUniforms;
      if (T && T.ready && on) {
        const v3 = (arr) => { const out = []; for (let i = 0; i < 16; i++) out.push(new THREE.Vector3(arr[i * 3] || 0.5, arr[i * 3 + 1] || 0.5, arr[i * 3 + 2] || 0.5)); return out; };
        u.uWallTex = { value: T.arrays.wall }; u.uRoofTex = { value: T.arrays.roof };
        u.uWallM = { value: Array.from(T.scale.wall) }; u.uRoofM = { value: Array.from(T.scale.roof) };
        u.uWallMean = { value: v3(T.mean.wall) }; u.uRoofMean = { value: v3(T.mean.roof) };
        u.uTexMix.value = 1; this.bMat.defines = { USE_TEXARR: 1 }; this.textured = true;
      } else { u.uTexMix.value = 0; this.bMat.defines = {}; this.textured = false; }
      this.bMat.needsUpdate = true;
      if (this.hMat) { for (const k of ['uWallTex', 'uRoofTex', 'uWallM', 'uRoofM', 'uWallMean', 'uRoofMean']) if (u[k]) this.hUniforms[k] = u[k]; this.hMat.defines = this.textured ? { USE_TEXARR: 1 } : {}; this.hMat.needsUpdate = true; }
    }
    refreshTextures() {
      const sim = this.sim; if (!sim) return;
      const civs = sim.civs, owner = sim.owner, pop = sim.pop, player = sim.player; const pc = sim.playerCiv();
      const od = this.ownerData, sd = this.simData; const cents = this.centroids; cents.clear();
      const cosLat = new Float32Array(H), sinLat = new Float32Array(H); for (let y = 0; y < H; y++) { const la = (90 - (y + 0.5) / H * 180) * GEO.D2R; cosLat[y] = Math.cos(la); sinLat[y] = Math.sin(la); }
      // (under the lens of peoples every region is painted by the people that lives there, and the lines are drawn between
      // peoples, not realms: people.js; under the lens of faiths by the faith its people keep, the old ways unpainted: faith.js)
      let PP = this.palMode === 'people' && sim.people ? { map: sim.people.ppl, list: sim.people.list, rgbOf: sim.people.rgbOf } : this.palMode === 'faith' && sim.faith ? { map: sim.faith.fth, list: sim.faith.list, rgbOf: sim.faith.rgbOf } : null;
      // (under the lens of the harvest every place is painted by this year's harvest there, in bands, an ordinary year unpainted: climate.js)
      if (this.palMode === 'harvest' && sim.climate && window.CLIMATE) { const CL = sim.climate, B = window.CLIMATE.BANDS; if (!this.hrvMap || this.hrvMap.length !== W * H) this.hrvMap = new Uint16Array(W * H); const m = this.hrvMap; for (const i of sim.LI) m[i] = CL.bandOf(i); PP = { map: m, list: B, rgbOf: (p) => B[p].rgb }; }
      // (under the lens of the woods by how much of nature's woods stands there, and where they grow back: woods.js)
      if (this.palMode === 'woods' && sim.woods && window.WOODS) { const X = sim.woods, B = window.WOODS.BANDS; if (!this.hrvMap || this.hrvMap.length !== W * H) this.hrvMap = new Uint16Array(W * H); const m = this.hrvMap; for (const i of sim.LI) m[i] = X.bandOf(i); PP = { map: m, list: B, rgbOf: (p) => B[p].rgb }; }
      const pcents = this.pcentroids = PP ? new Map() : null;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, j = i * 4; const o = owner[i]; const c = o >= 0 ? civs[o] : null;
        if (PP) { const p = PP.map[i] & 4095; if (p && sim.land[i] && (!sim.faith || PP.map !== sim.faith.fth || pop[i] > 0.02)) { od[j] = p & 255; od[j + 1] = p >> 8; od[j + 2] = 255; od[j + 3] = 255;
            let ct = pcents.get(p); if (!ct) { ct = { x: 0, y: 0, z: 0, n: 0 }; pcents.set(p, ct); } const lo = ((x + 0.5) / W * 360 - 180) * GEO.D2R; ct.x += cosLat[y] * Math.cos(lo); ct.y += sinLat[y]; ct.z += -cosLat[y] * Math.sin(lo); ct.n++; }
          else { od[j] = od[j + 1] = od[j + 2] = od[j + 3] = 0; } }
        if (c) {
          if (!PP) { od[j] = o & 255; od[j + 1] = o >> 8; od[j + 2] = o === player ? 153 : (pc && sim.isAtWar(pc, o) ? 77 : 255); od[j + 3] = 255; }
          let ct = cents.get(o); if (!ct) { ct = { x: 0, y: 0, z: 0, n: 0 }; cents.set(o, ct); }
          const lo = ((x + 0.5) / W * 360 - 180) * GEO.D2R; ct.x += cosLat[y] * Math.cos(lo); ct.y += sinLat[y]; ct.z += -cosLat[y] * Math.sin(lo); ct.n++;
        } else if (!PP) { od[j] = 0; od[j + 1] = 0; od[j + 2] = 0; od[j + 3] = 0; }
        const p = pop[i]; let light = 0;
        if (p > 0.2) { const t = c ? c.tech : 0; light = Math.min(1, Math.log10(p + 1) * (0.12 + t * 0.55)); if (t < 0.12) light *= 0.35; }
        // (green: how far along a people is, for the look of its ground - paving comes with the Classical age, but not where the old ways last)
        sd[j] = light * 255; sd[j + 1] = (c ? (TOWN.styleEra(c.era, TOWN.civCulture(sim, c)) < c.era ? Math.min(c.tech, 0.25) : c.tech) : 0) * 255; sd[j + 2] = sim.woods ? Math.round(sim.woods.cleared(i) * 255) : c ? Math.round(sim.cultivation(i) * 255 * (sim.level[i] ? 1 : 0.6)) : 0;      // (blue: how far the land is cleared - the woods that stand, woods.js, or else who farms it this year)
      }
      // (each realm in its own colour; or, under the lens of government, in the colour of the kind of rule it lives under)
      // (or, under the lens of relations, in the colour of how it stands with the player's realm: diplo.js STAND)
      const byForm = this.palMode === 'form' && sim.rule && window.RULE; const me = this.palMode === 'rel' && sim.diplo && window.DIPLO ? sim.playerCiv() : null; let stand = null;
      // (or, under the lens of renown, in the colour of how renowned it is against the usual for its age: culture.js BANDS)
      if (this.palMode === 'renown' && sim.culture && window.CULTURE) { const K = sim.culture; stand = (c) => CULTURE.BAND[CULTURE.band(K.rel(c.id), K.isGolden(c.id))].rgb; }
      // (or, under the lens of sickness, by how fiercely a pestilence burns in it, or whether it is spared one lately: disease.js BANDS)
      if (this.palMode === 'sick' && sim.disease && window.DISEASE) { const X = sim.disease, L = X.lens(new Float32Array(sim.MAXC)); stand = (c) => DISEASE.BANDS[X.bandOf(L[c.id], c.id)].rgb; }
      if (me) { if (!this.relRgb) { this.relRgb = {}; for (const k in DIPLO.STAND) { const h = DIPLO.STAND[k][1]; this.relRgb[k] = [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]; } }
        const within = new Uint8Array(sim.MAXC); for (const b of sim.diplo.reach(me.id)) within[b] = 1; within[me.id] = 1; stand = (c) => this.relRgb[within[c.id] ? sim.diplo.standing(me, c) : 'far']; }
      if (PP) { for (let p = 1; p < Math.min(4096, PP.list.length); p++) { const rgb = PP.rgbOf(p); this.palData[p * 4] = rgb[0] * 255; this.palData[p * 4 + 1] = rgb[1] * 255; this.palData[p * 4 + 2] = rgb[2] * 255; this.palData[p * 4 + 3] = 255; } }
      else for (const c of civs) if (c) { const rgb = byForm ? RULE.FORM[sim.rule.ruleOf(c).gov].rgb : stand ? stand(c) : c.rgb; this.palData[c.id * 4] = rgb[0] * 255; this.palData[c.id * 4 + 1] = rgb[1] * 255; this.palData[c.id * 4 + 2] = rgb[2] * 255; this.palData[c.id * 4 + 3] = 255; }
      this.ownerTex.needsUpdate = true; this.simTex.needsUpdate = true; this.palTex.needsUpdate = true;
      this.texVersion = (this.texVersion || 0) + 1;
    }
    // ---------- buildings ----------
    // Settlements are laid out once at true scale by TOWN (metres from the centre) and cached; each rebuild only
    // turns the cached plan into instance matrices for the towns near the camera. Far towns get the coarse plan
    // (landmarks, walls and one instance per block); towns beyond ~70 km are only their label and ground decal.
    updateBuildings(cam, force) {
      const sim = this.sim; if (!sim) { return; }
      const dist = cam.dist; const now = performance.now();
      const show = dist < 0.12;   // towns are drawn at strategy-map scale, so they read from ~750 km up
      if (!show) { this.nearTowns = []; for (const r of this.vh.values()) if (r.mesh && r.mesh.count) { r.mesh.count = 0; r.mesh.visible = false; } if (this.buildingCount) { for (const k in this.inst) this.inst[k].count = 0; this.buildingCount = 0; this.casters = []; this.castersVersion = (this.castersVersion || 0) + 1; this._casterSig = null; if (window.MODELS && MODELS.ready) { MODELS.begin(); MODELS.end(); } } return; }
      const moved = GEO.distKm(cam.lon, cam.lat, this.lastBuild.lon, this.lastBuild.lat) > Math.max(0.15, dist * 6371 * 0.12);
      const stale = now - this.lastBuild.t > 1500 || this.lastBuild.tex !== this.texVersion;
      const arrived = window.MODELS && MODELS.dirty;       // a model file finished loading: swap it in
      if (!force && !moved && !stale && !arrived && Math.abs(Math.log(dist / (this.lastBuild.dist || 1))) < 0.15) return;
      this.lastBuild = { lon: cam.lon, lat: cam.lat, dist, t: now, tex: this.texVersion };
      const T = this.terrain; const counts = {}; for (const k in this.inst) counts[k] = 0;
      const casters = this.casters = []; this._kitSig = 0;
      for (const r of this.vh.values()) { r.n = 0; r.data.length = 0; } const nowS = now / 1000; this._geoMs = 0; this._vhSig = 0;
      const rad = Math.max(3, Math.min(12, Math.ceil(dist * 6371 / 55) + 1)); // cells (0.5 deg ~ 55 km)
      const cy0 = Math.floor((90 - cam.lat) / 180 * H), cx0 = Math.floor((cam.lon + 180) / 360 * W);
      const exag = this.exag; const m = this._m; const el = m.elements;
      const packsE = T.stats ? T.stats.packsE : 0; void packsE;
      let total = 0; const TOTAL_MAX = 70000; let nCasters = 0; const sites = this.sites = []; const SITE_MAX = 60;
      const useModels = !!(window.MODELS && MODELS.ready && this.modelsOn); if (useModels) MODELS.begin(); this.buildPass = (this.buildPass || 0) + 1;
      const camPos = cam.camera.position; const pxPerRad = (window.innerHeight || 800) / (2 * Math.tan((cam.camera.fov || 45) * Math.PI / 360));
      // settlements nearest the camera first, so the town you are looking at always gets its full budget
      const cells = [];
      for (let dy = -rad; dy <= rad; dy++) {
        const y = cy0 + dy; if (y < 0 || y >= H) continue;
        const cl = Math.max(0.15, Math.cos((90 - (y + 0.5) / H * 180) * GEO.D2R)); const rx = Math.ceil(rad / cl);
        for (let dx = -rx; dx <= rx; dx++) { const x = ((cx0 + dx) % W + W) % W; const i = y * W + x; if (!sim.level[i] || sim.owner[i] < 0) continue; const c = sim.civs[sim.owner[i]]; if (!c) continue; const [cLon, cLat] = this.siteOf(i); cells.push([GEO.distKm(cam.lon, cam.lat, cLon, cLat), i, cLon, cLat, cl, c]); }
      }
      cells.sort((a, b) => a[0] - b[0]);
      // (the nearest few, for the sound of the world: where they stand, how large they are drawn, the age and the people they are built by)
      this.nearTowns = cells.slice(0, 6).map(([dKm, i, cLon, cLat, cl, c]) => { const cul = TOWN.civCulture(sim, c); return { lon: cLon, lat: cLat, R: TOWN.radiusM(sim, i, c), era: c.era, style: TOWN.styleEra ? TOWN.styleEra(c.era, cul) : c.era, cul, lvl: sim.level[i] }; });
      for (const [dKm, i, cLon, cLat, cl, c] of cells) {
        if (total >= TOTAL_MAX) break;
        const R = TOWN.radiusM(sim, i, c); const Rk = R / 1000;
        if (dKm - Rk > 520) continue;
        const coarse = dKm - Rk > 150;
        const L = TOWN.layout(sim, i, c, { coarse });
        const items = L.items; const n = items.length;
        // a harbour belongs on the shore: found once the coast is on screen, and again when finer terrain arrives
        if (L.harbour && !coarse && L.shoreKey !== T.meshVersion + ':' + T.stats.packsI + ':' + (T.stats.packsW || 0)) { L.shoreKey = T.meshVersion + ':' + T.stats.packsI + ':' + (T.stats.packsW || 0); this.placeHarbour(L, cLon, cLat, cl); L.hts = null; L.mask = null; L.fitEra = null; }
        // per-plan caches: ground heights (refreshed when finer elevation arrives) and river masks (once)
        if (!L.hts || L.meshV !== T.meshVersion || L.dispOn !== T.dispOn) {
          // ground heights per item; a town re-planned while it grows keeps the heights of the plots it already had
          let hm = this.htMaps.get(i); if (!hm || hm.meshV !== T.meshVersion || hm.dispOn !== T.dispOn) { hm = { meshV: T.meshVersion, dispOn: T.dispOn, map: new Map() }; this.htMaps.set(i, hm); if (this.htMaps.size > 300) this.htMaps.delete(this.htMaps.keys().next().value); }
          L.hts = new Float32Array(n); L.meshV = T.meshVersion; L.dispOn = T.dispOn; const vc = new Map(); const hmap = hm.map;
          for (let k = 0; k < n; k++) { const it = items[k]; const key = ((it.x * 0.2) | 0) * 100003 + ((it.z * 0.2) | 0); let h = hmap.get(key); if (h === undefined) { h = T.meshHeightAt(cLon + it.x / (R_M * cl * GEO.D2R), cLat + it.z / (R_M * GEO.D2R), vc); if (hmap.size < 40000) hmap.set(key, h); } L.hts[k] = h; }
        }
        if ((!L.mask || L.maskI !== T.stats.packsI + 1000 * (T.stats.packsW || 0)) && this.decal && this.decal.rivers && this.decal.rivers.length) { L.mask = new Uint8Array(n); L.maskI = T.stats.packsI + 1000 * (T.stats.packsW || 0);      // (what is water is the picture's to say, and the field's of the water's edge: whenever either has more to say, ask again)
          for (let k = 0; k < n; k++) { const it = items[k]; if (it.kind === 'pier' || it.kind === 'boat' || it.kind === 'ship') continue;
          // a long thing (a stretch of wall, a longhouse) is tried along its length, so one that only runs near the river stays
          const long = Math.max(it.w, it.d), short = Math.min(it.w, it.d); const ns = long > short * 1.8 ? Math.min(7, Math.ceil(long / short)) : 1; const ax = it.w >= it.d ? Math.cos(it.yaw) : Math.sin(it.yaw), az = it.w >= it.d ? Math.sin(it.yaw) : -Math.cos(it.yaw);
          let wet = 0, mid = false;
          for (let q = 0; q < ns; q++) { const o = ns > 1 ? (q / (ns - 1) - 0.5) * (long - short) : 0; const lo = cLon + (it.x + ax * o) / (R_M * cl * GEO.D2R), la = cLat + (it.z + az * o) / (R_M * GEO.D2R);
            let w = T.isWater(lo, la); if (!w) { const rv = this.decal.nearestRiver(lo, la); w = !!(rv && rv.d < rv.hw + short * 0.5 + 4); }
            if (w) { wet++; if (ns === 1 || q === (ns - 1) / 2) mid = true; } }
          // a wall that reaches the river is cut at the bank (2: its lengths are tried one by one when it is drawn); a gate whose own ground is dry stands
          if (wet) L.mask[k] = (it.kind === 'palisade' || it.kind === 'wall' || (it.kind === 'gatehouse' && !mid)) && wet < ns ? 2 : 1; } }
        const mask = L.mask; const hts = L.hts;
        if (useModels && !coarse && L.fitEra !== c.era + ':' + Object.keys(MODELS.defs).length) { L.fit = this.fitHouses(L, i, L.era === undefined ? c.era : L.era, L.culture || 0); L.fitEra = c.era + ':' + Object.keys(MODELS.defs).length; }
        const fits = useModels && !coarse ? L.fit : null;
        const Rv = !coarse && L.fine ? this.reveal(i, L, nowS, c) : null;      // (as you look: what has just been built rises, what was pulled down goes)
        if (Rv && Rv.camp && nowS < Rv.camp.until) { L.camp = Rv.camp; if (dKm < 60) this.drawCamp(Rv.camp, L, cLon, cLat, cl, L.k || 1, counts, nowS); } else if (L.camp) L.camp = null;
        const era = L.era === undefined ? c.era : L.era; const seed = (i % 997) / 997; const kRep = L.k || 1; const cul = L.culture || 0;      // the era whose manner the town is built in (TOWN.styleEra: the old ways last)
        const wantCasters = dKm < 40 && !coarse;
        for (let k = 0; k < n; k++) {
          if (mask && mask[k] === 1) continue;
          const cut = !!(mask && mask[k] === 2);               // a wall that runs into the river: drawn up to the bank
          if (fits && fits[k]) continue;                       // its model would stand in a neighbour's
          if (items[k].off) continue;                          // a harbour with no shore to stand on
          const it = items[k];
          if (it.prop && (dKm > 30 || coarse)) continue;      // (a yard's things are too small to see from further)
          const rv = Rv && it.pk !== undefined ? Rv.seen.get(it.pk) : null; const tUp = rv && rv.t0 > nowS - 9 ? rv.t0 : 0;
          if (it.kind === 'vh' || (rv && rv.old && rv.oldEnd > nowS && rv.old.kind === 'vh')) {
            const lon = cLon + it.x / (R_M * cl * GEO.D2R), lat = cLat + it.z / (R_M * GEO.D2R); const hg = hts[k]; if (hg < 0.5) continue;
            const sd = hash(i, 3000 + k);
            if (rv && rv.old && rv.oldEnd > nowS && rv.old.kind === 'vh') { this.pushHouse(rv.old, cLon, cLat, cl, hg, kRep, camPos, pxPerRad, -1e9, rv.oldEnd, sd); total++; }
            else if (it.kind === 'vh' && rv && rv.old && rv.oldEnd > nowS && useModels) { const o = rv.old; const od = (o.as && MODELS.pick(o.as, o.era !== undefined ? o.era : era, cul, hash(i, 4000 + k))) || MODELS.pick(o.kind, o.era !== undefined ? o.era : era, cul, hash(i, 4000 + k)); if (od && !od.fit) { this._vi = i; this._vk = k; this._cul = cul; this.placeModel(od, o, cLon + o.x / (R_M * cl * GEO.D2R), cLat + o.z / (R_M * GEO.D2R), hg, era, seed + k * 0.013, -(2 + rv.oldEnd), kRep, camPos, pxPerRad, cl, null); } }      // (the old house of the people's own, till the new one is begun)
            if (it.kind !== 'vh') { if (rv && rv.old && rv.oldEnd > nowS) { /* (and what replaces it is drawn below) */ } else continue; }
            else {
              const prog = it.prog === undefined ? 1 : it.prog;
              this.pushHouse(it, cLon, cLat, cl, hg, kRep, camPos, pxPerRad, tUp || -1e9, 1e9, sd, prog); total++;
              if (tUp && tUp + 8 > nowS && sites.length < SITE_MAX && dKm < 120) sites.push({ lon, lat, w: it.w, d: it.d, k: kRep, prog: 0.5, era });
              if (tUp && tUp + 8 > nowS) { const sc = this.inst.scaffold; const si = counts.scaffold; if (sc && si < sc.instanceMatrix.count && it.h > 4 * kRep) { this.setInst(sc, si, lon, lat, hg, it.w * 1.08, it.h * 0.85, it.d * 1.08, it.yaw, it.era >= 6 ? 0x8f949a : 0x8a6a44, era, -(tUp + 8.5), TOWN.packStyle(it.era >= 6 ? 5 : 2, 3, 0, 32), kRep); counts.scaffold = si + 1; total++; } this._animUntil = Math.max(this._animUntil || 0, tUp + 9); }
              if (wantCasters && nCasters < 5000 && !(tUp && tUp + 8 > nowS)) { casters.push(lon, lat, it.w * 0.9, it.h * 0.7, it.d * 0.9, it.yaw); nCasters++; }      // (no shadow on the ground for a house still to rise)
              continue;
            }
          }
          const im = this.inst[it.kind]; if (!im) continue;
          const idx = counts[it.kind]; if (idx >= im.instanceMatrix.count) continue;
          const lon = cLon + it.x / (R_M * cl * GEO.D2R), lat = cLat + it.z / (R_M * GEO.D2R);
          const hg = hts[k]; if (hg < 0.5 && it.kind !== 'pier' && it.kind !== 'boat' && it.kind !== 'ship') continue;
          const prog = it.prog === undefined ? 1 : it.prog;
          if (useModels) {
            if (it.kind === 'stall' && L.marketModel === this.buildPass) continue;      // the market model brings its own stalls
            const mEra = it.era !== undefined ? it.era : era; let def = (it.as && MODELS.pick(it.as, mEra, cul, hash(i, 4000 + k))) || MODELS.pick(it.kind, mEra, cul, hash(i, 4000 + k)), mprog = prog, staged = false;
            // a model with its own building-site stage: the frame goes up first (rising from the ground), then the finished building replaces it
            let fitTo = null;
            if (def && prog < 1 && def.site && MODELS.defs[def.site]) { staged = true; if (prog < 0.72) { fitTo = def; def = MODELS.defs[def.site]; mprog = Math.min(1, prog / 0.3); } else mprog = 1; }
            if (cut && !(def && (def.fit === 'run' || def.fit === 'gate'))) continue;
            this._cut = cut; this._vi = i; this._vk = k; this._cul = cul;
            if (rv && rv.old && rv.oldEnd > nowS && rv.old.kind !== 'vh') { const od = (rv.old.as && MODELS.pick(rv.old.as, rv.old.era !== undefined ? rv.old.era : era, cul, hash(i, 4000 + k))) || MODELS.pick(rv.old.kind, rv.old.era !== undefined ? rv.old.era : era, cul, hash(i, 4000 + k)); if (od && !od.fit) this.placeModel(od, rv.old, lon, lat, hg, era, seed + k * 0.013, -(2 + rv.oldEnd), kRep, camPos, pxPerRad, cl, null); }      // (the house pulled down to make way for this one)
            if (tUp && !staged && !fitTo) { mprog = 2 + tUp; this._animUntil = Math.max(this._animUntil || 0, tUp + 9); }      // (going up as you look)
            const nPut = def ? this.placeModel(def, it, lon, lat, hg, era, seed + k * 0.013, mprog, kRep, camPos, pxPerRad, cl, fitTo) : 0;
            this._cut = false;
            if (nPut) {
              total += nPut; const md = this._md; it.top = md[1]; it.fw = md[0]; it.fd = md[2]; it.fyaw = md[3]; if (it.as === 'market') L.marketModel = this.buildPass;      // (the model's drawn size, for whoever needs to know what really stands here: smoke leaves from its top, trees keep off its ground)
              if (prog < 1 && prog > 0.05 && prog < 0.97) {
                if (!staged && def.fit !== 'run' && def.fit !== 'gate') { const sc = this.inst.scaffold; const si = counts.scaffold; if (sc && si < sc.instanceMatrix.count) { this.setInst(sc, si, lon, lat, hg, md[0] * 1.1, md[1] * Math.min(1, prog + 0.3) * 1.03, md[2] * 1.1, md[3], era >= 6 ? 0x8f949a : 0x8a6a44, era, seed + k * 0.013, TOWN.packStyle(era >= 6 ? 5 : 2, 3, 0, 32), kRep); counts.scaffold = si + 1; total++; } }
                if (sites.length < SITE_MAX && dKm < 120) sites.push({ lon, lat, w: md[0], d: md[2], k: kRep, prog, era });
              }
              // a block shadow for now: a model's roof slopes away from its eaves, so the block is lower and narrower than its bounds; open monuments (stone circles) cast none
              if (wantCasters && nCasters < 5000 && prog > 0.3 && !def.open && !(tUp && tUp + 8 > nowS)) { casters.push(lon, lat, md[0] * 0.86, md[1] * 0.6 * Math.min(1, prog + 0.2), md[2] * 0.86, md[3]); nCasters++; }
              continue;
            }
            if (def && MODELS.pending(def)) continue;      // its files are on their way: bare ground for a moment, not a stand-in
          }
          if (cut) continue;
          if (prog < 1) {
            // a building site: the walls up to the current height in bare material, scaffolding around them, a crane in later ages
            const hf = Math.max(0.08, prog); const raw = (1 - prog) * 0.5;
            const col = ((Math.round(((it.color >> 16) & 255) * (1 - raw) + 0x9a * raw)) << 16) | ((Math.round(((it.color >> 8) & 255) * (1 - raw) + 0x8f * raw)) << 8) | Math.round((it.color & 255) * (1 - raw) + 0x80 * raw);
            this.setInst(im, idx, lon, lat, hg, it.w, it.h * hf, it.d, it.yaw, col, era, seed + k * 0.013, it.style + (prog < 0.95 ? 32 * 1024 : 0), kRep); counts[it.kind] = idx + 1; total++;
            if (prog > 0.05 && prog < 0.97) {
              const sc = this.inst.scaffold; const si = counts.scaffold; if (sc && si < sc.instanceMatrix.count) { this.setInst(sc, si, lon, lat, hg, it.w * 1.12, it.h * Math.min(1, prog + 0.3) * 1.03, it.d * 1.12, it.yaw, era >= 6 ? 0x8f949a : 0x8a6a44, era, seed + k * 0.013, TOWN.packStyle(era >= 6 ? 5 : 2, 3, 0, 32), kRep); counts.scaffold = si + 1; total++; }
              if (era >= 6 && it.h > 25 * kRep && prog < 0.9) { const cr = this.inst.crane; const ci = counts.crane; if (cr && ci < cr.instanceMatrix.count) { this.setInst(cr, ci, cLon + (it.x + it.w * 0.75) / (R_M * cl * GEO.D2R), lat, hg, 6 * kRep, it.h * 1.25 + 12 * kRep, 6 * kRep, it.yaw, 0xd9552f, era, seed, TOWN.packStyle(5, 3, 0, 0), kRep); counts.crane = ci + 1; total++; } }
              if (sites.length < SITE_MAX && dKm < 120) sites.push({ lon, lat, w: it.w, d: it.d, k: kRep, prog, era });
            }
            continue;
          }
          this.setInst(im, idx, lon, lat, hg, it.w, it.h, it.d, it.yaw, it.color, era, tUp ? 10000 + tUp : seed + k * 0.013, it.style, kRep);      // (a yard's things come with their house: not there till its work begins)
          counts[it.kind] = idx + 1; total++;
          if (wantCasters && nCasters < 5000 && it.h > 3 * kRep && it.kind !== 'lamp' && it.kind !== 'pier') { casters.push(lon, lat, it.w, it.h, it.d, it.yaw); nCasters++; }
        }
      }
      // what was pulled down (a town that shrank, a plot a great building took): it stands till its time comes
      for (const [ti, Rv] of this.rev) { if (!Rv.gone.length || Rv.pass !== this.buildPass) continue; const c = sim.civs[sim.owner[ti]]; if (!c) continue; const [cLon, cLat] = this.siteOf(ti); const cl = Math.max(0.15, Math.cos(cLat * GEO.D2R)); const vc = new Map();
        Rv.gone = Rv.gone.filter((g) => g.t > nowS); for (const g of Rv.gone) { if (g.it.kind !== 'vh') continue; const lon = cLon + g.it.x / (R_M * cl * GEO.D2R), lat = cLat + g.it.z / (R_M * GEO.D2R); const hg = T.meshHeightAt(lon, lat, vc); if (hg < 0.5) continue; this.pushHouse(g.it, cLon, cLat, cl, hg, Rv.k || 1, camPos, pxPerRad, -1e9, g.t, 0.5); total++; } }
      this.finishHouses();
      // ruins: the dead towns of the region, as long as something still stands
      if (sim.ruins && sim.ruins.size) {
        for (const [i, ru] of sim.ruins) {
          if (total >= TOTAL_MAX) break;
          const y = (i / W) | 0, x = i - y * W; if (Math.abs(y - cy0) > rad) continue; let dx = Math.abs(x - cx0); if (dx > W / 2) dx = W - dx; if (dx > rad * 2.2) continue;
          const [cLon, cLat] = this.siteOf(i); const cl = Math.max(0.15, Math.cos(cLat * GEO.D2R)); const dKm = GEO.distKm(cam.lon, cam.lat, cLon, cLat); if (dKm > 60) continue;
          const L = TOWN.ruinLayout(i, ru, sim); const items = L.items; const n = items.length;
          if (!L.hts || L.meshV !== T.meshVersion) { L.hts = new Float32Array(n); L.meshV = T.meshVersion; const vc = new Map(); for (let k = 0; k < n; k++) { const it = items[k]; L.hts[k] = T.meshHeightAt(cLon + it.x / (R_M * cl * GEO.D2R), cLat + it.z / (R_M * GEO.D2R), vc); } }
          const era = ru.era || 0; const seed = (i % 991) / 991;
          for (let k = 0; k < n; k++) {
            const it = items[k]; const im = this.inst[it.kind]; if (!im) continue; const idx = counts[it.kind]; if (idx >= im.instanceMatrix.count) continue;
            const lon = cLon + it.x / (R_M * cl * GEO.D2R), lat = cLat + it.z / (R_M * GEO.D2R); const hg = L.hts[k]; if (hg < 0.5) continue;
            this.setInst(im, idx, lon, lat, hg, it.w, it.h, it.d, it.yaw, it.color, era, seed + k * 0.013, it.style, L.k || 1); counts[it.kind] = idx + 1; total++;
          }
        }
      }
      for (const k in this.inst) { const im = this.inst[k]; im.count = counts[k]; GEO.touch(im.instanceMatrix, counts[k]); GEO.touch(im.instanceColor, counts[k]); GEO.touch(this.info[k], counts[k]); }
      if (useModels) MODELS.end();
      // what throws shadows changed only if something was placed differently: the sun's depth map and the ground shadows are redrawn then, not on every refresh
      const sig = (this._kitSig ^ Math.imul(total + 1, 2654435761) ^ (useModels ? MODELS.sig : 0) ^ this._vhSig ^ (nowS < (this._animUntil || 0) ? Math.floor(nowS / 2) : 0)) | 0;      // (while houses rise, the sun's map of them is drawn again every two seconds)
      if (sig !== this._casterSig) { this._casterSig = sig; this.castersVersion = (this.castersVersion || 0) + 1; }
      this.buildingCount = total;
    }
    // As you look, a town that grows or is rebuilt does so before your eyes. What its last plan had not is raised one thing after
    // another over the next half minute (a house rises from its footings, its timbers first, the roof last; its yard's things come
    // with it); a house rebuilt in a new manner stands until the work on the new one begins; what is gone is pulled down in its
    // turn. What it had is simply there, and a town that was not in sight a moment ago is shown as it is. A people's first village
    // begins as a camp: a fire and shelters, and its houses go up one by one about it.
    reveal(i, L, now, c) {
      let R = this.rev.get(i); const fresh = !R || R.pass < this.buildPass - 3;
      if (fresh) { R = { pass: this.buildPass, key: null, seen: new Map(), gone: [], camp: null, k: L.k || 1 }; this.rev.set(i, R); if (this.rev.size > 160) for (const [j, r] of this.rev) { if (r.pass < this.buildPass - 3) this.rev.delete(j); if (this.rev.size <= 120) break; } }
      R.pass = this.buildPass; R.k = L.k || 1;
      if (R.key === L.key) return R;
      const first = R.key === null, seen = new Map(), changes = [];
      for (const it of L.items) {
        if (it.pk === undefined) continue;
        const sig = it.kind + ':' + (it.g ? it.g.id : '') + ':' + (it.era === undefined ? '' : it.era); const o = R.seen.get(it.pk);
        if (!o) { const r = { sig, t0: -1e9, it }; seen.set(it.pk, r); if (!first) changes.push(r); }
        else if (o.sig !== sig) { const r = { sig, t0: -1e9, it, old: o.it.kind === 'vh' || !it.prop ? o.it : null, oldEnd: 0 }; seen.set(it.pk, r); if (!first) changes.push(r); }
        else { o.it = it; seen.set(it.pk, o); }
      }
      const sim = this.sim, rec = L.rec;
      if (first && this.campFor === i && c && sim && c.capital === i) {
        this.campFor = -1;
        // the founding: the camp is pitched, then the houses go up one after another about the fire
        let t = now + 7; R.camp = { t0: now, until: 0, x: 0, z: 0 }; let nh = 0; for (const r of seen.values()) if (!r.it.prop && !r.it.as && !r.it.tag) nh++;
        const gap = Math.max(0.45, Math.min(6, 80 / Math.max(1, nh)));      // (a minute or so for the whole village, however many households came)
        for (const r of seen.values()) { if (r.it.kind === 'stall' || r.it.as || r.it.tag) continue; r.t0 = t; t += r.it.prop ? 0.1 : gap * (0.75 + 0.5 * hash(i, 6100 + nh--)); }
        R.camp.until = t + 12;
      } else if (!first) {
        // one after another, the nearest the middle first: a second or so apart, half a minute for a turn's worth
        const gap = Math.min(1.3, 26 / Math.max(1, changes.length)); let t = now + 0.6;
        for (const r of changes) { r.t0 = t; if (r.old) r.oldEnd = t + 0.2; if (!r.it.prop) t += gap * (0.6 + 0.8 * hash(i, 6200 + changes.length)); }
        for (const [pk, o] of R.seen) if (!seen.has(pk) && o.it.kind === 'vh') { R.gone.push({ it: o.it, t }); t += gap * 0.5; }
      }
      R.seen = seen; R.key = L.key;
      return R;
    }
    // a house of the place's own (houses.js): its type at a level of detail by how large it is on the screen, as an instance; t0:
    // when it began to rise (the page's clock), tEnd: when it is gone
    pushHouse(it, cLon, cLat, cl, hg, k, camPos, pxPerRad, t0, tEnd, seed, prog) {
      const g = it.g; if (!g) return;
      const u = k * (it.sc || 1); const kx = u / R_M; const yaw = it.yaw, cy = Math.cos(yaw), sy = Math.sin(yaw);
      const ox = it.ofx || 0, oz = it.ofz || 0; const pe = it.x + ox * cy + oz * sy, pn = it.z + ox * sy - oz * cy;      // (its origin: the footprint's middle and the offset in its own frame)
      const lon = cLon + pe / (R_M * cl * GEO.D2R), lat = cLat + pn / (R_M * GEO.D2R);
      const lo = lon * GEO.D2R, la = lat * GEO.D2R; const slo = Math.sin(lo), clo = Math.cos(lo), sla = Math.sin(la), cla = Math.cos(la);
      const Ex = -slo, Ez = -clo; const Nx = -sla * clo, Ny = cla, Nz = sla * slo; const Ux = cla * clo, Uy = sla, Uz = -cla * slo;
      const rr = 1 + (Math.max(hg, 0) * this.exag - 0.12 * u) / R_M;
      const tx = Ux * rr, ty = Uy * rr, tz = Uz * rr;
      const H = VERN.heightOf(g); const dx = camPos.x - tx, dy = camPos.y - ty, dz = camPos.z - tz;
      const px = H * kx / Math.max(1e-9, Math.sqrt(dx * dx + dy * dy + dz * dz)) * pxPerRad;
      let lod = px > 85 ? 0 : px > 20 ? 1 : 2;
      // (a type's finer meshes are made when first wanted: a few milliseconds a pass for them, the rest drawn coarser meanwhile)
      if (lod < 2 && !HOUSES.has(g, lod)) { if (this._geoMs > 14) lod = HOUSES.has(g, 1) ? 1 : 2; else { const t = performance.now(); HOUSES.geometry(g, lod); this._geoMs += performance.now() - t; } }
      const key = g.id + '/' + lod; let r = this.vh.get(key); if (!r) { r = { g, lod, mesh: null, cap: 0, data: [], n: 0 }; this.vh.set(key, r); }
      const D = r.data, p = it.pal;
      D.push((cy * Ex + sy * Nx) * kx, (sy * Ny) * kx, (cy * Ez + sy * Nz) * kx, Ux * kx, Uy * kx, Uz * kx, (sy * Ex - cy * Nx) * kx, (-cy * Ny) * kx, (sy * Ez - cy * Nz) * kx, tx, ty, tz,
        ((it.color >> 16) & 255) / 255, ((it.color >> 8) & 255) / 255, (it.color & 255) / 255,
        p ? p[1] : 0xffffff, p ? p[2] : 0x404040, p ? p[3] : 0x503828, p ? p[4] : 0xffffff,
        it.era === undefined ? 4 : it.era, seed, it.style, k, t0, tEnd, prog === undefined ? 1 : prog, H);
      r.n++; this._vhSig = Math.imul(this._vhSig ^ ((tx * 1e9) | 0), 16777619) ^ ((tz * 1e9) | 0) ^ (lod << 3);
    }
    // the instances of every type and level of detail, into their meshes (a mesh made, or made larger, as it needs)
    finishHouses() {
      const STRIDE = 27;      // (12 of the matrix, 3 of the paint, 4 each of the trim and the rest, the instance, the rising)
      for (const r of this.vh.values()) {
        if (!r.n) { if (r.mesh && r.mesh.count) { r.mesh.count = 0; r.mesh.visible = false; } continue; }
        if (!r.mesh || r.cap < r.n) {
          const cap = Math.max(16, 1 << Math.ceil(Math.log2(r.n * 1.3))); const geo = HOUSES.geometry(r.g, r.lod);
          if (r.mesh) this.buildingGroup.remove(r.mesh);
          const m = new THREE.InstancedMesh(geo, this.hMat, cap); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
          const att = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, a); return a; };
          m.userData.a = { pal: att('aPal'), info: att('aInfo'), rise: att('aRise') }; m.userData.kind = 'vh';
          if (window.SHADOWS) SHADOWS.caster(m, this.hDepth);
          this.buildingGroup.add(m); r.mesh = m; r.cap = cap;
        }
        const m = r.mesh, A = m.userData.a, M = m.instanceMatrix.array, C = m.instanceColor.array, Pa = A.pal.array, In = A.info.array, Ri = A.rise.array, D = r.data;
        for (let q = 0; q < r.n; q++) {
          const o = q * STRIDE, j = q * 16;
          M[j] = D[o]; M[j + 1] = D[o + 1]; M[j + 2] = D[o + 2]; M[j + 3] = 0; M[j + 4] = D[o + 3]; M[j + 5] = D[o + 4]; M[j + 6] = D[o + 5]; M[j + 7] = 0;
          M[j + 8] = D[o + 6]; M[j + 9] = D[o + 7]; M[j + 10] = D[o + 8]; M[j + 11] = 0; M[j + 12] = D[o + 9]; M[j + 13] = D[o + 10]; M[j + 14] = D[o + 11]; M[j + 15] = 1;
          C[q * 3] = D[o + 12]; C[q * 3 + 1] = D[o + 13]; C[q * 3 + 2] = D[o + 14];
          Pa[q * 4] = D[o + 15]; Pa[q * 4 + 1] = D[o + 16]; Pa[q * 4 + 2] = D[o + 17]; Pa[q * 4 + 3] = D[o + 18];
          In[q * 4] = D[o + 19]; In[q * 4 + 1] = D[o + 20]; In[q * 4 + 2] = D[o + 21]; In[q * 4 + 3] = D[o + 22];
          Ri[q * 4] = D[o + 23]; Ri[q * 4 + 1] = D[o + 24]; Ri[q * 4 + 2] = D[o + 25]; Ri[q * 4 + 3] = D[o + 26];
        }
        m.count = r.n; m.visible = true;
        GEO.touch(m.instanceMatrix, r.n); GEO.touch(m.instanceColor, r.n); GEO.touch(A.pal, r.n); GEO.touch(A.info, r.n); GEO.touch(A.rise, r.n);
      }
    }
    // a people's first night: the fire, the shelters about it, the firewood, a rack for hides; gone when the houses stand
    drawCamp(camp, L, cLon, cLat, cl, k, counts, now) {
      const T = this.terrain; const put = (kind, x, z, w, h, d, yaw, col, style) => { const im = this.inst[kind]; if (!im) return; const idx = counts[kind]; if (idx >= im.instanceMatrix.count) return;
        const lon = cLon + x * k / (R_M * cl * GEO.D2R), lat = cLat + z * k / (R_M * GEO.D2R); const hg = T.meshHeightAt(lon, lat); if (hg < 0.5) return;
        this.setInst(im, idx, lon, lat, hg, w * k, h * k, d * k, yaw, col, 0, -camp.until, style, k); counts[kind] = idx + 1; };
      const st = TOWN.packStyle(7, 0, L.culture || 0, 64), hide = TOWN.packStyle(1, 0, L.culture || 0, 64);
      const a0 = (L.axis || 0) + 0.4;
      for (let q = 0; q < 5; q++) { const a = a0 + q * 1.26 + 0.2 * Math.sin(q * 3.1), r = 11 + 3 * ((q * 7) % 3); put('tent', Math.cos(a) * r, Math.sin(a) * r, q === 0 ? 6 : 4.2, q === 0 ? 3.6 : 3, q === 0 ? 5 : 4, a + Math.PI / 2, [0x9a8466, 0x8a7458, 0xa58f6c, 0x7f6a4e, 0x96805e][q], hide); }
      put('firepit', 0, 0, 2.2, 0.5, 2.2, 0, 0x6f6a62, TOWN.packStyle(3, 3, L.culture || 0, 64));
      put('woodpile', Math.cos(a0 + 0.7) * 6, Math.sin(a0 + 0.7) * 6, 2.6, 1.3, 1.1, a0, 0x6e5238, st);
      put('rack', Math.cos(a0 + 3.3) * 8, Math.sin(a0 + 3.3) * 8, 3.2, 2.1, 0.8, a0 + 1.2, 0x7a6248, st);
    }
    // one model instance at lon/lat: sx, sy, sz are drawn metres per model metre along the model's own axes.
    // false = none of its files has loaded yet.
    putModel(def, lon, lat, hg, yaw, sx, sy, sz, era, seed, mflags, prog, camPos, pxPerRad, shear, shearZ) {
      const m = this._m; const el = m.elements; const kx = sx / R_M, ky = sy / R_M, kz = sz / R_M;
      const lo = lon * GEO.D2R, la = lat * GEO.D2R; const slo = Math.sin(lo), clo = Math.cos(lo), sla = Math.sin(la), cla = Math.cos(la);
      const Ex = -slo, Ez = -clo; const Nx = -sla * clo, Ny = cla, Nz = sla * slo; const Ux = cla * clo, Uy = sla, Uz = -cla * slo;
      const cy = Math.cos(yaw), sy2 = Math.sin(yaw);
      const rr = 1 + Math.max(hg, 0) * this.exag / R_M;
      el[0] = (cy * Ex + sy2 * Nx) * kx; el[1] = (sy2 * Ny) * kx; el[2] = (cy * Ez + sy2 * Nz) * kx; el[3] = 0;
      el[4] = Ux * ky; el[5] = Uy * ky; el[6] = Uz * ky; el[7] = 0;
      el[8] = (sy2 * Ex - cy * Nx) * kz; el[9] = (-cy * Ny) * kz; el[10] = (sy2 * Ez - cy * Nz) * kz; el[11] = 0;
      el[12] = Ux * rr; el[13] = Uy * rr; el[14] = Uz * rr; el[15] = 1;
      // a stretch of wall on a slope: its far end stands higher than its near end, posts still upright (a shear, not a tilt)
      if (shear) { const q = shear / R_M; if (shearZ) { el[8] += Ux * q; el[9] += Uy * q; el[10] += Uz * q; } else { el[0] += Ux * q; el[1] += Uy * q; el[2] += Uz * q; } }
      const dx = camPos.x - el[12], dy = camPos.y - el[13], dz = camPos.z - el[14];
      const px = def.h * ky / Math.max(1e-9, Math.sqrt(dx * dx + dy * dy + dz * dz)) * pxPerRad;
      const L = MODELS.lodFor(def, px); if (!L) return false;
      MODELS.push(L, m, era, seed, mflags, prog);
      return true;
    }
    // ground heights at the joints of a run, kept on the plan item until finer elevation arrives
    runHeights(it, tag, lon, lat, planYaw, len, n, cl) {
      const T = this.terrain; const store = it._rh || (it._rh = {}); const e = store[tag];
      if (e && e.v === T.meshVersion && e.d === T.dispOn && e.h.length === n + 1) return e.h;
      const h = new Float32Array(n + 1); const cy = Math.cos(planYaw), sy = Math.sin(planYaw); const vc = new Map();
      for (let j = 0; j <= n; j++) { const o = (j / n - 0.5) * len; h[j] = Math.max(0, T.meshHeightAt(lon + o * cy / (R_M * cl * GEO.D2R), lat + o * sy / (R_M * GEO.D2R), vc)); }
      store[tag] = { v: T.meshVersion, d: T.dispOn, h }; return h;
    }
    // which lengths of a run stand in water (kept on the plan item with the heights)
    wetLengths(it, tag, lon, lat, cy, sy, len, n, oneM, cl) {
      const T = this.terrain; const store = it._rw || (it._rw = {}); const e = store[tag]; const key = T.stats.packsI + ':' + (T.stats.packsW || 0) + ':' + n;
      if (e && e.key === key) return e.w;
      const w = new Uint8Array(n);
      for (let j = 0; j < n; j++) { const o = (j - (n - 1) / 2) * (len / n); const lo = lon + o * cy / (R_M * cl * GEO.D2R), la = lat + o * sy / (R_M * GEO.D2R);
        if (T.isWater(lo, la)) { w[j] = 1; continue; } const rv = this.decal ? this.decal.nearestRiver(lo, la) : null; if (rv && rv.d < rv.hw + oneM * 0.5 + 3) w[j] = 1; }
      store[tag] = { key, w }; return w;
    }
    // a run of one model end to end along a line (walls, fences): as many life-size copies as fit, stretched a
    // little so they meet exactly, each one following the ground from joint to joint. len in drawn metres.
    runModel(def, it, tag, lon, lat, planYaw, len, kRep, cl, era, seed, mflags, prog, camPos, pxPerRad) {
      const alongZ = def.d > def.w; const one = alongZ ? def.d : def.w; const n = Math.max(1, Math.round(len / (one * kRep))); const stretch = len / (n * one);
      const kUp = kRep * (it.th ? Math.max(0.8, Math.min(1.5, it.th / def.h)) : 1);       // a wall stands as high as it was planned: each level adds to it
      const cy = Math.cos(planYaw), sy = Math.sin(planYaw); const yaw = planYaw + (alongZ ? Math.PI / 2 : 0); let ok = false;
      const hs = this.runHeights(it, tag, lon, lat, planYaw, len, n, cl);
      const wet = this._cut ? this.wetLengths(it, tag, lon, lat, cy, sy, len, n, one * kRep, cl) : null;
      for (let j = 0; j < n; j++) {
        if (wet && wet[j]) continue;                       // this length would stand in the river
        const o = (j - (n - 1) / 2) * (len / n); const hA = hs[j], hB = hs[j + 1];
        ok = this.putModel(def, lon + o * cy / (R_M * cl * GEO.D2R), lat + o * sy / (R_M * GEO.D2R), (hA + hB) / 2, yaw, alongZ ? kRep : stretch, kUp, alongZ ? stretch : kRep, era, seed + j * 0.171, mflags,
          prog, camPos, pxPerRad, (hB - hA) * this.exag / one, alongZ) || ok;
      }
      return ok ? n : 0;
    }
    // The planner puts a harbour at the town's edge toward the nearest sea; where the water really begins it cannot
    // know. Walk out from the town that way (and, failing that, a little to either side) until land gives way to water,
    // and move piers, boats and sheds there as one group, turned to face the water. No shore within reach: no harbour.
    placeHarbour(L, cLon, cLat, cl) {
      const Hb = L.harbour, T = this.terrain; const items = L.items; const step = Math.max(40, L.R / 70); let found = null;
      for (const da of [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.3, -1.3]) {
        const a = Hb.a + da, ca = Math.cos(a), sa = Math.sin(a); let land = 0;
        for (let r = L.R * 0.2; r <= L.R * 3.2; r += step) { const w = T.isWater(cLon + ca * r / (R_M * cl * GEO.D2R), cLat + sa * r / (R_M * GEO.D2R)); if (!w) land++; else if (land >= 3) { found = { a, r, da }; break; } else land = 0; }
        if (found) break;
      }
      const c = found ? Math.cos(found.da) : 1, s = found ? Math.sin(found.da) : 0; const nx = found ? Math.cos(found.a) * found.r : 0, nz = found ? Math.sin(found.a) * found.r : 0;
      for (let k = 0; k < items.length; k++) { const it = items[k]; if (!it.hb) continue;
        if (it._x0 === undefined) { it._x0 = it.x; it._z0 = it.z; it._yaw0 = it.yaw; }
        if (!found) { it.off = true; continue; }
        const rx = it._x0 - Hb.x, rz = it._z0 - Hb.z; it.x = nx + rx * c - rz * s; it.z = nz + rx * s + rz * c; it.yaw = it._yaw0 + found.da; it.off = false; if (it._rh) it._rh = null;
      }
      L.shore = found;
    }
    // How a model sits on its plot: turned so its long side lies along the plot's long side, at life size on the town's
    // drawn scale with a little give to suit the plot (more for the building a town gathers around; a wonder may be
    // the outsized version of its kind). u: drawn metres per model metre.
    modelFit(B, it, kRep, flags) {
      const landmark = flags & 1; const F = this._fit || (this._fit = { turn: false, u: 1 });
      // (a house may be turned to lie along its plot; a great building keeps its front where the plan put it: toward the square)
      F.turn = !landmark && ((B.d > B.w * 1.2 && it.w > it.d * 1.2) || (B.w > B.d * 1.2 && it.d > it.w * 1.2));
      const pw = F.turn ? it.d : it.w, pd = F.turn ? it.w : it.d;
      if (B.fit === 'box') F.u = Math.min(pw / B.w, pd / B.d);
      else { const f = Math.min(pw / (B.w * kRep), pd / (B.d * kRep)); F.u = kRep * Math.max(landmark ? 0.75 : 0.8, Math.min((flags & 8) ? 2.2 : landmark ? 1.4 : 1.25, f)); }
      return F;
    }
    // Plots are planned for the kit's sizes; the models have their own (a longhouse is 24 m long whatever its plot). So
    // that no two stand in each other: the great buildings keep their ground, then each house in turn, from the centre
    // out, stays only if it clears what already stands. Returns one flag per plan item (1 = leave this plot empty).
    fitHouses(L, i, era, cul) {
      const items = L.items, n = items.length; const skip = new Uint8Array(n); const kRep = L.k || 1;
      const cell = 28 * kRep; const grid = new Map(); const rects = [];
      const rectOf = (def, it, flags) => { const f = this.modelFit(def, it, kRep, flags); const yaw = it.yaw + (f.turn ? Math.PI / 2 : 0); const hw = def.w * f.u * 0.45, hd = def.d * f.u * 0.45; return { x: it.x, z: it.z, ax: Math.cos(yaw), az: Math.sin(yaw), hw, hd, r: Math.hypot(hw, hd) }; };
      const span = (R, a, b) => R.hw * Math.abs(a * R.ax + b * R.az) + R.hd * Math.abs(a * R.az - b * R.ax);      // half the rectangle's shadow on a direction
      const apart = (P, Q, a, b) => Math.abs((Q.x - P.x) * a + (Q.z - P.z) * b) > span(P, a, b) + span(Q, a, b);
      const overlap = (P, Q) => { const dx = Q.x - P.x, dz = Q.z - P.z; if (dx * dx + dz * dz > (P.r + Q.r) * (P.r + Q.r)) return false; return !(apart(P, Q, P.ax, P.az) || apart(P, Q, P.az, -P.ax) || apart(P, Q, Q.ax, Q.az) || apart(P, Q, Q.az, -Q.ax)); };
      const cells = (R, fn) => { const x0 = Math.floor((R.x - R.r) / cell), x1 = Math.floor((R.x + R.r) / cell), z0 = Math.floor((R.z - R.r) / cell), z1 = Math.floor((R.z + R.r) / cell); for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) if (fn(cx * 73856093 ^ cz * 19349663)) return true; return false; };
      const add = (R) => { const id = rects.length; rects.push(R); cells(R, (key) => { let a = grid.get(key); if (!a) grid.set(key, a = []); a.push(id); return false; }); };
      const defOf = (it, k) => { const mEra = it.era !== undefined ? it.era : era; return (it.as && MODELS.pick(it.as, mEra, cul, hash(i, 4000 + k))) || MODELS.pick(it.kind, mEra, cul, hash(i, 4000 + k)); };
      const great = (it) => { const flags = Math.floor(it.style / 1024); return (flags & 1) || it.as || it.tag; };
      for (let k = 0; k < n; k++) { const it = items[k]; if (it.kind !== 'vh') continue; const hw = it.w * 0.45, hd = it.d * 0.45; add({ x: it.x, z: it.z, ax: Math.cos(it.yaw), az: Math.sin(it.yaw), hw, hd, r: Math.hypot(hw, hd) }); }      // (the houses of the place's own stand where their plots are)
      for (let k = 0; k < n; k++) { const it = items[k]; if (!great(it)) continue; const def = defOf(it, k); if (!def || def.fit === 'run' || def.fit === 'gate') continue; add(rectOf(def, it, Math.floor(it.style / 1024))); }
      for (let k = 0; k < n; k++) {
        const it = items[k]; if (great(it) || it.kind === 'vh' || it.prop) continue; const flags = Math.floor(it.style / 1024); if (flags & (2 | 16)) continue;       // far-town blocks and ruins are the kit's
        const def = defOf(it, k); if (!def || def.fit) continue;
        const R = rectOf(def, it, flags);
        if (cells(R, (key) => { const a = grid.get(key); if (a) for (let j = 0; j < a.length; j++) if (overlap(R, rects[a[j]])) return true; return false; })) { skip[k] = 1; continue; }
        add(R);
      }
      return skip;
    }
    // a real model on a plan item. Houses stand at life size times the town's drawn scale (a little give either way to
    // suit the plot); landmarks fill the plot they were planned for; walls run end to end; a gate stands life-size in
    // the middle of its stretch of wall. Leaves the drawn size in this._md; returns instances placed (0 = not loaded).
    placeModel(def, it, lon, lat, hg, era, seed, prog, kRep, camPos, pxPerRad, cl, fitTo) {
      const flags = Math.floor(it.style / 1024); const landmark = flags & 1; const mf = (flags & 16) ? 1 : 0; const md = this._md || (this._md = [0, 0, 0, 0]);
      if (def.fit === 'run') {
        const n = this.runModel(def, it, 'r', lon, lat, it.yaw, it.w, kRep, cl, era, seed, mf, prog, camPos, pxPerRad);
        md[0] = it.w; md[1] = def.h * kRep; md[2] = Math.min(def.w, def.d) * kRep; md[3] = it.yaw; return n;
      }
      if (def.fit === 'gate') {
        const gw = Math.max(def.w, def.d) * kRep; const alongZ = def.d > def.w; const yaw = it.yaw + (alongZ ? Math.PI / 2 : 0);
        const side = def.sides ? MODELS.defs[def.sides] : null;
        const up = it.th && side ? Math.max(0.8, Math.min(1.5, it.th / side.h)) : 1;      // the gate rises with the wall it stands in
        if (!this.putModel(def, lon, lat, hg, yaw, kRep, kRep * up, kRep, era, seed, mf, prog, camPos, pxPerRad)) return 0;
        let n = 1; const rest = (it.w - gw) / 2;
        if (side && rest > gw * 0.2) { const cy = Math.cos(it.yaw), sy = Math.sin(it.yaw); for (const sgn of [-1, 1]) { const o = sgn * (gw / 2 + rest / 2); n += this.runModel(side, it, sgn < 0 ? 'a' : 'b', lon + o * cy / (R_M * cl * GEO.D2R), lat + o * sy / (R_M * GEO.D2R), it.yaw, rest, kRep, cl, era, seed + sgn * 0.31, mf, prog, camPos, pxPerRad); } }
        md[0] = it.w; md[1] = def.h * kRep; md[2] = Math.min(def.w, def.d) * kRep; md[3] = it.yaw; return n;
      }
      const B = fitTo || def;                 // a building site is laid out for the building it will become
      const fit = this.modelFit(B, it, kRep, flags); const turn = fit.turn, u = fit.u;
      let yaw = it.yaw + (turn ? Math.PI / 2 : 0);
      if (fitTo) {
        // the site fills the footprint of the finished building, its long side along the building's
        const swap = (def.d > def.w * 1.15) !== (B.d > B.w * 1.15) && Math.abs(B.d - B.w) > 0.15 * Math.max(B.d, B.w);
        const us = Math.min(B.w * u / (swap ? def.d : def.w), B.d * u / (swap ? def.w : def.d)); if (swap) yaw += Math.PI / 2;
        if (!this.putModel(def, lon, lat, hg, yaw, us, us, us, era, seed, mf, prog, camPos, pxPerRad)) return 0;
        md[0] = B.w * u; md[1] = def.h * us; md[2] = B.d * u; md[3] = it.yaw + (turn ? Math.PI / 2 : 0); return 1;
      }
      // no two houses alike: one a little narrower or shorter than the next, one a storey's worth lower or higher (great
      // buildings, open monuments and things keep their size; a house never grows past the ground fitHouses gave it), and
      // the shader is told the town's people (mflags / 2 - 1), whose ways of washing a wall and keeping a roof it follows
      let ux = u, uy = u, uz = u;
      if (!landmark && !(flags & 8) && !it.as && !it.tag && !def.open && !NOVARY.has(it.kind)) { const i = this._vi | 0, k = this._vk | 0; ux = u * (0.9 + 0.12 * hash(i, 9001 + k * 3)); uz = u * (0.9 + 0.12 * hash(i, 9002 + k * 3)); uy = u * (0.84 + 0.32 * hash(i, 9003 + k * 3)); }
      if (!this.putModel(def, lon, lat, hg, yaw, ux, uy, uz, era, seed, mf + 2 * ((this._cul | 0) + 1), prog, camPos, pxPerRad)) return 0;
      md[0] = def.w * ux; md[1] = def.h * uy; md[2] = def.d * uz; md[3] = yaw; return 1;
    }
    // one instance matrix at lon/lat on ground height hg (metres): size w,h,d in drawn metres, krep = drawn/true scale for the shader's patterns
    setInst(im, idx, lon, lat, hg, wM, hM, dM, yaw, color, era, seed, style, krep, infoAttr) {
      const m = this._m; const el = m.elements; const exag = this.exag;
      const sink = Math.min(hM * 0.3, 0.35 + 0.06 * Math.max(wM, dM));
      const lo = lon * GEO.D2R, la = lat * GEO.D2R; const slo = Math.sin(lo), clo = Math.cos(lo), sla = Math.sin(la), cla = Math.cos(la);
      const Ex = -slo, Ey = 0, Ez = -clo; const Nx = -sla * clo, Ny = cla, Nz = sla * slo; const Ux = cla * clo, Uy = sla, Uz = -cla * slo;
      const cy = Math.cos(yaw), sy = Math.sin(yaw); const w = wM / R_M, h = hM / R_M, d = dM / R_M;
      const Xx = (cy * Ex + sy * Nx) * w, Xy = (cy * Ey + sy * Ny) * w, Xz = (cy * Ez + sy * Nz) * w;
      const Zx = (sy * Ex - cy * Nx) * d, Zy = (sy * Ey - cy * Ny) * d, Zz = (sy * Ez - cy * Nz) * d;
      const rr = 1 + (Math.max(hg, 0) * exag - sink) / R_M;
      el[0] = Xx; el[1] = Xy; el[2] = Xz; el[3] = 0; el[4] = Ux * h; el[5] = Uy * h; el[6] = Uz * h; el[7] = 0; el[8] = Zx; el[9] = Zy; el[10] = Zz; el[11] = 0; el[12] = Ux * rr; el[13] = Uy * rr; el[14] = Uz * rr; el[15] = 1;
      im.setMatrixAt(idx, m); this._kitSig = Math.imul((this._kitSig | 0) ^ ((el[12] * 1e9) | 0), 16777619) ^ ((el[13] * 1e9) | 0) ^ ((el[5] * 1e12) | 0);
      const ca = im.instanceColor.array; ca[idx * 3] = ((color >> 16) & 255) / 255; ca[idx * 3 + 1] = ((color >> 8) & 255) / 255; ca[idx * 3 + 2] = (color & 255) / 255;
      const ia = infoAttr || this.info[im.userData.kind]; if (ia) ia.setXYZW(idx, era, seed, style, krep || 1);
    }
    // the older entry point (events, movers): a plan item
    placeInstance(im, idx, lon, lat, hg, it, era, seed, infoAttr) { this.setInst(im, idx, lon, lat, hg, it.w, it.h, it.d, it.yaw, it.color, era, seed, it.style, it.k || 1, infoAttr); }
    siteOf(i) { const sim = this.sim; const c = sim.civs[sim.owner[i]]; return TOWN.siteOf(sim, i, c, this.terrain, this.decal); }
    // ---------- sky / clouds / atmosphere ----------
    initSky() {
      const scene = this.scene;
      // The stars (sky.js): a third of a million points round the camera, each where it stands and as bright as it is, drawn at the
      // far plane (so anything at all hides them), turning as the sky turns: with the hour, the time of year and the year itself.
      this.starField = new SKY.Stars(scene); this.stars = this.starField.points; this.starUniforms = this.starField.uniforms;
      this.orbits = SKY.Orbits ? new SKY.Orbits(scene) : null;      // (what people have put in orbit: satellites from the first spaceflight, stations of the Space Age)
      this.skyTurn = new THREE.Matrix4(); this.seasonPhase = 0.45; this.viewH = 1000; this._moon = new THREE.Vector3(0, 1, 0);
      // The clouds (sky.js): the Earth's own, on a shell a little above the highest ground, white in the sun, the colours of the
      // sun's light along the edge of night and dark after it, behind the same air as everything else; seen from under, too.
      this.cloudLayer = window.AIR ? new SKY.Clouds(scene, AIR) : null; this.cloudTex = null; this.cloudShift = 0; this.cloudVis = 0; this.cloudNear = 0; this.cloudsOn = true;
      SKY.onPiece = (n) => { if (n === 'stars') { try { this.starField.set(SKY.starData, SKY.index.stars); } catch (e) { console.warn('the stars: ' + e.message); } SKY.starData = null; } };
      if (SKY.starData) SKY.onPiece('stars');
      // The sky: every line of sight that ends on nothing, out through the air (air.js): blue by day, the colours of dusk, the
      // planet's glowing rim from outside, black in space. It is a mesh of directions round the camera, drawn last and only where
      // nothing else was (at the far plane), and the air is worked out at its corners, which are set where the sky changes
      // fastest: a fan of rings by how high above the ground a line of sight passes (from under the horizon up to the camera's own
      // height or the top of the air: the horizon's haze from the ground, the whole thin rim from orbit), then rings by angle on up
      // to straight overhead. What turns with the angle to the sun is done per pixel (the haze's bright ring round the sun), and
      // so are the sun's own disc, the moon, the northern lights and a comet when there is one.
      const dark1 = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); dark1.needsUpdate = true;
      this.skyUniforms = Object.assign({ uSun: { value: new THREE.Vector3(1, 0, 0) }, uCamPos: { value: new THREE.Vector3() }, uAlpha: { value: 0 }, uTime: { value: 0 }, uComet: { value: 0 }, uLat: { value: 0 },
        uMilky: { value: dark1 }, uMoonTex: { value: dark1 }, uSkyM: { value: new THREE.Matrix3() }, uMoonW: { value: new THREE.Vector3(0, 1, 0) }, uEclW: { value: new THREE.Vector3(0, 1, 0) }, uMoonK: { value: new THREE.Vector4(Math.cos(SKY.moonSize), SKY.moonSize, 0, 0) }, uMilkyOn: { value: 0 }, uStars: { value: 0 } }, window.AIR ? AIR.uniforms : {});
      const NP = 24, NA = 40, NS = 96, skyGeo = new THREE.BufferGeometry();
      { const rings = NP + NA + 2, sky = new Float32Array(rings * (NS + 1) * 2), idx = [];
        for (let r = 0; r < rings; r++) for (let k = 0; k <= NS; k++) { sky[(r * (NS + 1) + k) * 2] = r; sky[(r * (NS + 1) + k) * 2 + 1] = k / NS * Math.PI * 2; }
        for (let r = 0; r < rings - 1; r++) for (let k = 0; k < NS; k++) { const a = r * (NS + 1) + k, b = a + NS + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
        skyGeo.setAttribute('aSky', new THREE.BufferAttribute(sky, 2)); skyGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rings * (NS + 1) * 3), 3)); skyGeo.setIndex(idx); }
      this.sky = new THREE.Mesh(skyGeo, new THREE.ShaderMaterial({
        uniforms: this.skyUniforms, side: THREE.DoubleSide, transparent: false, depthWrite: false, depthTest: true,
        vertexShader: `attribute vec2 aSky; varying vec3 vW, vV, vT, vLR, vLM, vLS;
          ${window.AIR ? AIR.GLSL : 'const float A_RG = 1.0, A_RT = 1.03; const vec3 uAirC = vec3(0.0, 0.0, -3.0); void airParts(vec3 rd, float tMax, float n, out vec3 T, out vec3 LR, out vec3 LM, out vec3 LS) { T = vec3(1.0); LR = vec3(0.0); LM = vec3(0.0); LS = vec3(0.0); }'}
          void main(){
            vec3 nad = normalize(uAirC); float rc = length(uAirC), hc = rc - A_RG, under = 0.0022, hEnd = clamp(hc, 0.0, A_RT - A_RG);
            // (sine and cosine of the angle from straight down: for a line that passes hp above the ground they come without an arcsine, which is blind near the horizontal)
            float j = clamp(aSky.x - 1.0, 0.0, ${NP}.0) / ${NP}.0, hp = (hEnd + under) * pow(j, 1.5) - under;
            float sn = clamp((A_RG + hp) / rc, 0.0, 1.0), cs = sqrt(max((hc - hp) * (rc + A_RG + hp), 0.0)) / rc;
            if (aSky.x > ${NP + 1}.5) { float hE = hEnd, s0 = clamp((A_RG + hE) / rc, 0.0, 1.0), c0 = sqrt(max((hc - hE) * (rc + A_RG + hE), 0.0)) / rc; float p0 = atan(s0, c0), psi = p0 + (3.14159265 - p0) * pow((aSky.x - ${NP + 1}.0) / ${NA}.0, 2.4); sn = sin(psi); cs = cos(psi); }
            if (aSky.x < 0.5) { sn = 0.0; cs = 1.0; }
            vec3 ax = abs(nad.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), e1 = normalize(cross(nad, ax)), e2 = cross(nad, e1);
            vec3 d = nad * cs + (e1 * cos(aSky.y) + e2 * sin(aSky.y)) * sn;
            vV = d; vW = transpose(mat3(viewMatrix)) * d;
            airParts(d, 1e9, ${window.AIR ? AIR.SKY : '16.0'}, vT, vLR, vLM, vLS);
            vec4 p = projectionMatrix * vec4(d, 1.0); p.z = p.w * 0.9999998; gl_Position = p; }`,
        fragmentShader: `uniform vec3 uSun, uCamPos, uAirS; uniform vec4 uAirE; uniform float uAlpha, uTime, uComet, uLat, uStars; varying vec3 vW, vV, vT, vLR, vLM, vLS;
          ${SKY.GLSL}
          ${window.AIR ? AIR.PHASE : 'float airPhR(float c) { return 0.0; } float airPhM(float c) { return 0.0; }'}
          float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
          float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
          void main(){
            vec3 dir = normalize(vW); vec3 up = normalize(uCamPos); vec3 sun = normalize(uSun); vec3 rd = normalize(vV);
            float cSun = dot(rd, uAirS); vec3 T = vT, L = vLR * airPhR(cSun) + vLM * airPhM(cSun) + vLS;
            float el = dot(dir, up); float sunEl = dot(sun, up);
            float night = (1.0 - smoothstep(-0.17, -0.05, sunEl)) * uAlpha; vec3 add = vec3(0.0);      // (what belongs to a sky seen from the ground fades as the camera leaves it: uAlpha)
            // The Moon (sky.js): its near side as it is, lit by where the sun stands; two and a half degrees across - five times
            // life, as a painter would have it. By day a pale ghost, by night brighter than white (post.js gives it its glow), from
            // out in space as bright as lit rock is. And the light of the faint stars, the Milky Way, where the Moon is not.
            vec4 mo = moonDisc(dir, sun); float md = dot(dir, uMoonW), nightG = 1.0 - smoothstep(-0.17, -0.05, sunEl);
            vec3 beyond = mo.rgb * mo.a * mix(1.25, mix(0.2, 1.6, nightG), uAlpha) + milky(dir) * (uStars * mix(0.3, 0.22, uAlpha)) * (1.0 - mo.a);
            add += vec3(0.8, 0.85, 0.95) * pow(max(md, 0.0), 600.0) * 0.25 * night * (0.5 - 0.5 * dot(sun, uMoonW));
            // aurora: curtains to the pole on clear nights at high latitude
            float auroraLat = smoothstep(52.0, 66.0, abs(uLat));
            if (auroraLat > 0.0 && night > 0.3) {
              vec3 northish = normalize(vec3(0.0, 1.0, 0.0) - up * up.y); if (uLat < 0.0) northish = -northish;
              float toward = dot(dir, northish); float band = smoothstep(0.08, 0.3, el) * (1.0 - smoothstep(0.45, 0.8, el)) * smoothstep(-0.2, 0.5, toward);
              vec3 e = normalize(cross(northish, up)); float az = atan(dot(dir, e), toward);
              float curtain = vn(vec2(az * 6.0 + uTime * 0.05, el * 3.0 - uTime * 0.02)) * vn(vec2(az * 23.0 - uTime * 0.11, 1.7)) ;
              curtain = pow(curtain, 1.4) * band * auroraLat * night;
              add += mix(vec3(0.1, 0.9, 0.45), vec3(0.6, 0.25, 0.8), smoothstep(0.35, 0.6, el)) * curtain * 3.2;
            }
            // a comet, when the chronicle says one hangs in the sky
            if (uComet > 0.0) { vec3 eastW = normalize(cross(vec3(0.0, 1.0, 0.0), up)); vec3 northW = cross(up, eastW); vec3 cdir = normalize(up * 0.55 + eastW * 0.6 - northW * 0.5); float cd = dot(dir, cdir); vec3 tail = normalize(-sun - cdir * dot(-sun, cdir)); vec3 perp = dir - cdir * cd; float along = dot(perp, tail); float side = length(perp - tail * along); float tl = smoothstep(0.0, 0.02, along) * (1.0 - smoothstep(0.05, 0.34, along)); float width = 0.006 + along * 0.12; float coma = pow(max(cd, 0.0), 4000.0) * 3.0 + pow(max(cd, 0.0), 300.0) * 0.5; float tailG = exp(-pow(side / width, 2.0)) * tl * (0.55 + 0.45 * vn(vec2(along * 40.0, side * 80.0 + uTime * 0.1))); add += vec3(0.85, 0.95, 1.0) * (coma + tailG) * uComet * (0.25 + 0.75 * night); }
            // the sun's own disc (drawn half as large again as it is), darker toward its edge, as red as the air it is seen through makes it, and
            // thousands of times brighter than white: post.js spreads that into the glare round it
            vec3 ds = rd - uAirS; float u = dot(ds, ds) / 5.6e-5;
            vec3 disc = vec3(1300.0 * uAirE.z) * (1.0 - smoothstep(0.82, 1.0, u)) * (0.45 + 0.55 * sqrt(max(1.0 - u, 0.0)));
            vec3 lin = L + (add * add + disc + beyond) * T;
            gl_FragColor = vec4(sqrt(max(lin, 0.0)), 1.0); }`,      // (light to the colours of the screen as airOver does it: a root)
      }));
      this.sky.renderOrder = 40; this.sky.frustumCulled = false; scene.add(this.sky);
    }
    updateSky(cam, sun, time) {
      // how the sky stands: its hour from where the sun is over the Earth and among the stars (the time of year), and the year
      // (the world's own: its first nights turn about a point near Vega). The Moon goes round the Earth's path, through all its
      // phases in some forty minutes of play, and its age is its phase.
      const turn = SKY.turn(sun, this.seasonPhase, window.__skyYear !== undefined ? window.__skyYear : this.sim ? this.sim.year : -10000, this.skyTurn), moon = SKY.moonAt(sun, turn.ecl, window.__moonAge !== undefined ? window.__moonAge : 2.6 + time * 0.0025, this._moon);
      // (how much moonlight there is where the eye is: the Moon's lit share, which is not its light - a half moon gives a tenth of a full one's - and none from under the horizon)
      const moonUp = moon.dot(this._pv.copy(cam.camera.position).normalize()), moonLit = 0.5 - 0.5 * moon.dot(sun); this.moonLight = Math.pow(moonLit, 2.2) * Math.min(1, Math.max(0, (moonUp + 0.05) / 0.25));
      if (this.cloudLayer) { this.cloudLayer.on = this.cloudsOn; this.cloudLayer.update(cam.alt, time, sun, this.moonLight); this.cloudShift = this.cloudLayer.shift; this.cloudVis = this.cloudLayer.vis; this.cloudNear = this.cloudLayer.near; if (SKY.cloudSmall) this.cloudTex = SKY.cloudSmall; }
      const skyA = Math.min(1, Math.max(0, (0.06 - cam.alt) / 0.04));
      this.skyUniforms.uAlpha.value = skyA; this.skyUniforms.uSun.value.copy(sun);
      { const U = this.skyUniforms; U.uTime.value = time; U.uLat.value = cam.lat; U.uComet.value = this.cometOn ? 1 : 0; U.uSkyM.value.setFromMatrix4(turn); U.uMoonW.value.copy(moon); U.uEclW.value.copy(turn.ecl);
        if (SKY.milky && !U.uMilkyOn.value) { U.uMilky.value = SKY.milky; U.uMilkyOn.value = 1; }
        if (SKY.moon && !U.uMoonK.value.w) { U.uMoonTex.value = SKY.moon; U.uMoonK.value.w = 1; }
        // (which level of the Moon's picture: its disc is so many pixels across)
        const px = 2 * SKY.moonSize / (cam.camera.fov * Math.PI / 180 / Math.max(1, this.viewH)); U.uMoonK.value.z = Math.max(0, Math.log2(1008 / Math.max(1, px))); }
      this.skyUniforms.uCamPos.value.copy(cam.camera.position);
      const camUp0 = cam.camera.position.clone().normalize(); const dayHere = Math.min(1, Math.max(0, (camUp0.dot(sun) + 0.12) / 0.32));
      // (from the ground the stars come out as the sky darkens; from high up the field is only dimmed on the day side, where the lit ground fills the eye)
      { const su = this.starUniforms, dark = 1 - Math.min(1, Math.max(0, (camUp0.dot(sun) + 0.17) / 0.12)); su.uAlpha.value = (1 - skyA) * (1 - 0.55 * dayHere) + skyA * dark * dark * (3 - 2 * dark); su.uLow.value = skyA; su.uTime.value = time; su.uUp.value.copy(camUp0);
        su.uMoonW.value.copy(moon); this.skyUniforms.uStars.value = su.uAlpha.value;
        // (how faint a star is shown: more of them from out in space than through the air, and more where a screen's pixels are small enough to hold them apart)
        this.starField.update(cam.camera.position, turn, SKY.soft ? 6.5 : 8.7 - 1.5 * skyA + 0.9 * Math.log2(Math.max(1, su.uPx.value)));
        this.stars.visible = su.uAlpha.value > 0.004; }
      if (this.orbits) this.orbits.update(this.sim, time, sun, this.starUniforms.uPx.value, this.starUniforms.uAlpha.value, cam.alt);
      // lights follow the sun; hemisphere dims at night for the camera's local sun elevation
      this.sunLight.position.copy(sun).multiplyScalar(10); this.sunLight.target.position.set(0, 0, 0);
      const camUp = cam.camera.position.clone().normalize(); const sunUp = camUp.dot(sun);
      const day = Math.min(1, Math.max(0, (sunUp + 0.15) / 0.4));
      { const bu = this.bUniforms; const vm = cam.camera.matrixWorldInverse; bu.uSunV.value.copy(sun).transformDirection(vm); bu.uUpV.value.copy(camUp).transformDirection(vm); bu.uCamAlt.value = cam.agl === undefined ? cam.alt : cam.agl || 1; bu.uTime.value = time;
        // the light of the hour, for everything that stands on the ground (the terrain works the same out per pixel):
        // a low sun is warm and, the eye opening to it, strong; below the horizon it is gone. Dusk lends a rose glow.
        const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        const kW = sm(0.02, 0.42, sunUp), k = sm(-0.03, 0.05, sunUp) * (1 + 1.1 * (1 - sm(0.04, 0.5, sunUp)));
        bu.uSunCol.value.set(k, k * (0.56 + 0.44 * kW), k * (0.30 + 0.70 * kW)); bu.uDusk.value = sm(-0.12, 0.02, sunUp) * (1 - sm(0.08, 0.4, sunUp)); bu.uDay.value = sm(-0.1, 0.16, sunUp);
        // (and under a cloud the sun is dimmed for whatever stands there as it is for the ground: by the cloud over the place the eye is at - a town is small under a sky)
        if (this.cloudVis && cam.alt < 0.03) { this.cloudShade = 0.6 * this.cloudVis * sm(0.12, 0.7, SKY.less(SKY.cloudAt(cam.lon, cam.lat, this.cloudShift), this.cloudNear)); bu.uSunCol.value.multiplyScalar(1 - this.cloudShade); } else this.cloudShade = 0;
        if (this.rainShade > 0.01) bu.uSunCol.value.multiplyScalar(1 - this.rainShade); }      // (and under the rain: weather.js, main.js)
      this.sunLight.intensity = 1.5 * day; this.hemi.intensity = 0.25 + 0.8 * day;
      return day;
    }
  }
  window.WORLD = { World };
})();
