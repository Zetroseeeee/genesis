// GENESIS world layer: sim textures, 3D settlements, labels, clouds, atmosphere. Classic script; exposes window.WORLD.
(function () {
  const R_M = 6371000, KM = 1 / 6371;
  const W = 720, H = 360;
  function hash(i, k) { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  class World {
    constructor(opts) {
      this.scene = opts.scene; this.terrain = opts.terrain; this.sim = null; this.exag = opts.terrain.exag;
      // sim textures
      this.ownerData = new Uint8Array(W * H * 4); this.simData = new Uint8Array(W * H * 4); this.palData = new Uint8Array(512 * 4);
      this.ownerTex = new THREE.DataTexture(this.ownerData, W, H, THREE.RGBAFormat); this.ownerTex.magFilter = this.ownerTex.minFilter = THREE.NearestFilter; this.ownerTex.wrapS = THREE.RepeatWrapping;
      this.simTex = new THREE.DataTexture(this.simData, W, H, THREE.RGBAFormat); this.simTex.magFilter = this.simTex.minFilter = THREE.LinearFilter; this.simTex.wrapS = THREE.RepeatWrapping;
      this.palTex = new THREE.DataTexture(this.palData, 512, 1, THREE.RGBAFormat); this.palTex.magFilter = this.palTex.minFilter = THREE.NearestFilter;
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
    }
    refreshTextures() {
      const sim = this.sim; if (!sim) return;
      const civs = sim.civs, owner = sim.owner, pop = sim.pop, player = sim.player; const pc = sim.playerCiv();
      const od = this.ownerData, sd = this.simData; const cents = this.centroids; cents.clear();
      const cosLat = new Float32Array(H), sinLat = new Float32Array(H); for (let y = 0; y < H; y++) { const la = (90 - (y + 0.5) / H * 180) * GEO.D2R; cosLat[y] = Math.cos(la); sinLat[y] = Math.sin(la); }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, j = i * 4; const o = owner[i]; const c = o >= 0 ? civs[o] : null;
        if (c) {
          od[j] = o & 255; od[j + 1] = o >> 8; od[j + 2] = o === player ? 153 : (pc && sim.isAtWar(pc, o) ? 77 : 255); od[j + 3] = 255;
          let ct = cents.get(o); if (!ct) { ct = { x: 0, y: 0, z: 0, n: 0 }; cents.set(o, ct); }
          const lo = ((x + 0.5) / W * 360 - 180) * GEO.D2R; ct.x += cosLat[y] * Math.cos(lo); ct.y += sinLat[y]; ct.z += -cosLat[y] * Math.sin(lo); ct.n++;
        } else { od[j] = 0; od[j + 1] = 0; od[j + 2] = 0; od[j + 3] = 0; }
        const p = pop[i]; let light = 0;
        if (p > 0.2) { const t = c ? c.tech : 0; light = Math.min(1, Math.log10(p + 1) * (0.12 + t * 0.55)); if (t < 0.12) light *= 0.35; }
        // (green: how far along a people is, for the look of its ground - paving comes with the Classical age, but not where the old ways last)
        sd[j] = light * 255; sd[j + 1] = (c ? (TOWN.styleEra(c.era, TOWN.civCulture(sim, c)) < c.era ? Math.min(c.tech, 0.25) : c.tech) : 0) * 255; sd[j + 2] = c ? Math.round(sim.cultivation(i) * 255 * (sim.level[i] ? 1 : 0.6)) : 0;
      }
      // (each realm in its own colour; or, under the lens of government, in the colour of the kind of rule it lives under)
      // (or, under the lens of relations, in the colour of how it stands with the player's realm: diplo.js STAND)
      const byForm = this.palMode === 'form' && sim.rule && window.RULE; const me = this.palMode === 'rel' && sim.diplo && window.DIPLO ? sim.playerCiv() : null; let stand = null;
      if (me) { if (!this.relRgb) { this.relRgb = {}; for (const k in DIPLO.STAND) { const h = DIPLO.STAND[k][1]; this.relRgb[k] = [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]; } }
        const within = new Uint8Array(sim.MAXC); for (const b of sim.diplo.reach(me.id)) within[b] = 1; within[me.id] = 1; stand = (c) => this.relRgb[within[c.id] ? sim.diplo.standing(me, c) : 'far']; }
      for (const c of civs) if (c) { const rgb = byForm ? RULE.FORM[sim.rule.ruleOf(c).gov].rgb : stand ? stand(c) : c.rgb; this.palData[c.id * 4] = rgb[0] * 255; this.palData[c.id * 4 + 1] = rgb[1] * 255; this.palData[c.id * 4 + 2] = rgb[2] * 255; this.palData[c.id * 4 + 3] = 255; }
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
      if (!show) { if (this.buildingCount) { for (const k in this.inst) this.inst[k].count = 0; this.buildingCount = 0; this.casters = []; this.castersVersion = (this.castersVersion || 0) + 1; this._casterSig = null; if (window.MODELS && MODELS.ready) { MODELS.begin(); MODELS.end(); } } return; }
      const moved = GEO.distKm(cam.lon, cam.lat, this.lastBuild.lon, this.lastBuild.lat) > Math.max(0.15, dist * 6371 * 0.12);
      const stale = now - this.lastBuild.t > 1500 || this.lastBuild.tex !== this.texVersion;
      const arrived = window.MODELS && MODELS.dirty;       // a model file finished loading: swap it in
      if (!force && !moved && !stale && !arrived && Math.abs(Math.log(dist / (this.lastBuild.dist || 1))) < 0.15) return;
      this.lastBuild = { lon: cam.lon, lat: cam.lat, dist, t: now, tex: this.texVersion };
      const T = this.terrain; const counts = {}; for (const k in this.inst) counts[k] = 0;
      const casters = this.casters = []; this._kitSig = 0;
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
      for (const [dKm, i, cLon, cLat, cl, c] of cells) {
        if (total >= TOTAL_MAX) break;
        const R = TOWN.radiusM(sim, i, c); const Rk = R / 1000;
        if (dKm - Rk > 520) continue;
        const coarse = dKm - Rk > 150;
        const L = TOWN.layout(sim, i, c, { coarse });
        const items = L.items; const n = items.length;
        // a harbour belongs on the shore: found once the coast is on screen, and again when finer terrain arrives
        if (L.harbour && !coarse && L.shoreKey !== T.meshVersion + ':' + T.stats.packsI) { L.shoreKey = T.meshVersion + ':' + T.stats.packsI; this.placeHarbour(L, cLon, cLat, cl); L.hts = null; L.mask = null; L.fitEra = null; }
        // per-plan caches: ground heights (refreshed when finer elevation arrives) and river masks (once)
        if (!L.hts || L.meshV !== T.meshVersion || L.dispOn !== T.dispOn) {
          // ground heights per item; a town re-planned while it grows keeps the heights of the plots it already had
          let hm = this.htMaps.get(i); if (!hm || hm.meshV !== T.meshVersion || hm.dispOn !== T.dispOn) { hm = { meshV: T.meshVersion, dispOn: T.dispOn, map: new Map() }; this.htMaps.set(i, hm); if (this.htMaps.size > 300) this.htMaps.delete(this.htMaps.keys().next().value); }
          L.hts = new Float32Array(n); L.meshV = T.meshVersion; L.dispOn = T.dispOn; const vc = new Map(); const hmap = hm.map;
          for (let k = 0; k < n; k++) { const it = items[k]; const key = ((it.x * 0.2) | 0) * 100003 + ((it.z * 0.2) | 0); let h = hmap.get(key); if (h === undefined) { h = T.meshHeightAt(cLon + it.x / (R_M * cl * GEO.D2R), cLat + it.z / (R_M * GEO.D2R), vc); if (hmap.size < 40000) hmap.set(key, h); } L.hts[k] = h; }
        }
        if ((!L.mask || L.maskI !== T.stats.packsI) && this.decal && this.decal.rivers && this.decal.rivers.length) { L.mask = new Uint8Array(n); L.maskI = T.stats.packsI; for (let k = 0; k < n; k++) { const it = items[k]; if (it.kind === 'pier' || it.kind === 'boat' || it.kind === 'ship') continue;
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
        const era = L.era === undefined ? c.era : L.era; const seed = (i % 997) / 997; const kRep = L.k || 1; const cul = L.culture || 0;      // the era whose manner the town is built in (TOWN.styleEra: the old ways last)
        const wantCasters = dKm < 40 && !coarse;
        for (let k = 0; k < n; k++) {
          if (mask && mask[k] === 1) continue;
          const cut = !!(mask && mask[k] === 2);               // a wall that runs into the river: drawn up to the bank
          if (fits && fits[k]) continue;                       // its model would stand in a neighbour's
          if (items[k].off) continue;                          // a harbour with no shore to stand on
          const it = items[k]; const im = this.inst[it.kind]; if (!im) continue;
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
            this._cut = cut;
            const nPut = def ? this.placeModel(def, it, lon, lat, hg, era, seed + k * 0.013, mprog, kRep, camPos, pxPerRad, cl, fitTo) : 0;
            this._cut = false;
            if (nPut) {
              total += nPut; const md = this._md; it.top = md[1]; it.fw = md[0]; it.fd = md[2]; it.fyaw = md[3]; if (it.as === 'market') L.marketModel = this.buildPass;      // (the model's drawn size, for whoever needs to know what really stands here: smoke leaves from its top, trees keep off its ground)
              if (prog < 1 && prog > 0.05 && prog < 0.97) {
                if (!staged && def.fit !== 'run' && def.fit !== 'gate') { const sc = this.inst.scaffold; const si = counts.scaffold; if (sc && si < sc.instanceMatrix.count) { this.setInst(sc, si, lon, lat, hg, md[0] * 1.1, md[1] * Math.min(1, prog + 0.3) * 1.03, md[2] * 1.1, md[3], era >= 6 ? 0x8f949a : 0x8a6a44, era, seed + k * 0.013, TOWN.packStyle(era >= 6 ? 5 : 2, 3, 0, 32), kRep); counts.scaffold = si + 1; total++; } }
                if (sites.length < SITE_MAX && dKm < 120) sites.push({ lon, lat, w: md[0], d: md[2], k: kRep, prog, era });
              }
              // a block shadow for now: a model's roof slopes away from its eaves, so the block is lower and narrower than its bounds; open monuments (stone circles) cast none
              if (wantCasters && nCasters < 5000 && prog > 0.3 && !def.open) { casters.push(lon, lat, md[0] * 0.86, md[1] * 0.6 * Math.min(1, prog + 0.2), md[2] * 0.86, md[3]); nCasters++; }
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
          this.setInst(im, idx, lon, lat, hg, it.w, it.h, it.d, it.yaw, it.color, era, seed + k * 0.013, it.style, kRep);
          counts[it.kind] = idx + 1; total++;
          if (wantCasters && nCasters < 5000 && it.h > 3 * kRep && it.kind !== 'lamp' && it.kind !== 'pier') { casters.push(lon, lat, it.w, it.h, it.d, it.yaw); nCasters++; }
        }
      }
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
      const sig = (this._kitSig ^ Math.imul(total + 1, 2654435761) ^ (useModels ? MODELS.sig : 0)) | 0;
      if (sig !== this._casterSig) { this._casterSig = sig; this.castersVersion = (this.castersVersion || 0) + 1; }
      this.buildingCount = total;
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
      const T = this.terrain; const store = it._rw || (it._rw = {}); const e = store[tag]; const key = T.stats.packsI + ':' + n;
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
      for (let k = 0; k < n; k++) { const it = items[k]; if (!great(it)) continue; const def = defOf(it, k); if (!def || def.fit === 'run' || def.fit === 'gate') continue; add(rectOf(def, it, Math.floor(it.style / 1024))); }
      for (let k = 0; k < n; k++) {
        const it = items[k]; if (great(it)) continue; const flags = Math.floor(it.style / 1024); if (flags & (2 | 16)) continue;       // far-town blocks and ruins are the kit's
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
      if (!this.putModel(def, lon, lat, hg, yaw, u, u, u, era, seed, mf, prog, camPos, pxPerRad)) return 0;
      md[0] = def.w * u; md[1] = def.h * u; md[2] = def.d * u; md[3] = yaw; return 1;
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
      { // stars: a sphere of points round the camera, drawn at the far plane (so anything at all hides them), fixed to the
        // heavens while the camera moves. Most are faint; a share of them crowd one great circle, the Milky Way.
        const n = 5200; const pos = new Float32Array(n * 3); const mag = new Float32Array(n * 2); let sd = 20261004; const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
        const pole = new THREE.Vector3(0.48, 0.47, -0.74).normalize(), ax = new THREE.Vector3(0, 1, 0).cross(pole).normalize(), ay = pole.clone().cross(ax), v = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
          if (i < n * 0.42) { const a = rnd() * Math.PI * 2, off = (rnd() + rnd() + rnd() - 1.5) * 0.3; v.copy(ax).multiplyScalar(Math.cos(a)).addScaledVector(ay, Math.sin(a)).addScaledVector(pole, off).normalize(); }
          else { const t = rnd() * Math.PI * 2, y = rnd() * 2 - 1, r = Math.sqrt(1 - y * y); v.set(r * Math.cos(t), y, r * Math.sin(t)); }
          pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
          const m = Math.pow(rnd(), 5.0); mag[i * 2] = 0.16 + 0.84 * m; mag[i * 2 + 1] = rnd();      // brightness (few are bright), colour (blue-white to amber)
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aMag', new THREE.BufferAttribute(mag, 2));
        this.starUniforms = { uAlpha: { value: 1 }, uPx: { value: 1 }, uLow: { value: 0 }, uTime: { value: 0 }, uUp: { value: new THREE.Vector3(0, 1, 0) } };
        this.stars = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.starUniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
          vertexShader: `attribute vec2 aMag; uniform float uPx, uLow, uTime; uniform vec3 uUp; varying vec3 vCol;
            void main(){ vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z = p.w * 0.9999995; gl_Position = p; float b = aMag.x; gl_PointSize = (1.5 + 2.4 * b * b) * uPx;
              // from the ground (uLow): none in the thick air along the horizon, and they twinkle
              float seen = mix(1.0, smoothstep(0.02, 0.24, dot(normalize(position), uUp)) * (0.78 + 0.22 * sin(uTime * 2.3 + aMag.y * 97.0)), uLow);
              vCol = mix(vec3(0.74, 0.83, 1.0), vec3(1.0, 0.86, 0.68), smoothstep(0.55, 1.0, aMag.y)) * (0.42 + 0.9 * b + 1.4 * b * b * b) * seen; }`,      // (the few brightest are brighter than white: post.js gives them a little glow)
          fragmentShader: `uniform float uAlpha; varying vec3 vCol; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.08, d); gl_FragColor = vec4(vCol * a * uAlpha, 1.0); }`,
        })); this.stars.frustumCulled = false; this.stars.renderOrder = -4; scene.add(this.stars);
      }
      // clouds: a shell a little above the highest ground, white in the sun, warm along the edge of night and dark after it, and
      // behind the same air as everything else
      const cl = new THREE.TextureLoader().load('data/clouds.jpg', (t) => { t.wrapS = THREE.RepeatWrapping; this.cloudTex = t; });
      this.cloudTex = null; this.cloudShift = 0; this.cloudVis = 0;
      const AIR_V = window.AIR ? AIR.VERT : '\n varying vec3 vAirT, vAirL; void air(vec3 p, float n, out vec3 T, out vec3 L) { T = vec3(1.0); L = vec3(0.0); }', AIR_F = window.AIR ? AIR.FRAG : '\n varying vec3 vAirT, vAirL; vec3 airOver(vec3 c, vec3 T, vec3 L) { return c; }';
      this.cloudUniforms = Object.assign({ uMap: { value: cl }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uOpacity: { value: 0.6 } }, window.AIR ? AIR.uniforms : {});
      this.cloudMat = new THREE.ShaderMaterial({ uniforms: this.cloudUniforms, transparent: true, depthWrite: false,
        vertexShader: `varying vec2 vUv; varying vec3 vWn; ${AIR_V}
          void main(){ vUv = uv; vWn = normalize((modelMatrix * vec4(position, 0.0)).xyz); vec4 mv = modelViewMatrix * vec4(position, 1.0); air(mv.xyz, 5.0, vAirT, vAirL); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D uMap; uniform vec3 uSun; uniform float uOpacity; varying vec2 vUv; varying vec3 vWn; ${AIR_F}
          void main(){
            float a = texture2D(uMap, vUv).g * uOpacity; if (a < 0.004) discard;
            float sunUp = dot(normalize(vWn), uSun);
            vec3 col = mix(vec3(0.03, 0.04, 0.065), mix(vec3(1.0, 0.5, 0.3), vec3(1.0), smoothstep(0.0, 0.32, sunUp)), smoothstep(-0.1, 0.22, sunUp));
            gl_FragColor = vec4(airOver(col, vAirT, vAirL), a); }`,
      });
      this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.004, 192, 96), this.cloudMat); this.clouds.rotation.y = Math.PI; scene.add(this.clouds);
      this.cloudsOn = true;
      // The sky: every line of sight that ends on nothing, out through the air (air.js): blue by day, the colours of dusk, the
      // planet's glowing rim from outside, black in space. It is a mesh of directions round the camera, drawn last and only where
      // nothing else was (at the far plane), and the air is worked out at its corners, which are set where the sky changes
      // fastest: a fan of rings by how high above the ground a line of sight passes (from under the horizon up to the camera's own
      // height or the top of the air: the horizon's haze from the ground, the whole thin rim from orbit), then rings by angle on up
      // to straight overhead. What turns with the angle to the sun is done per pixel (the haze's bright ring round the sun), and
      // so are the sun's own disc, the moon, the northern lights and a comet when there is one.
      this.skyUniforms = Object.assign({ uSun: { value: new THREE.Vector3(1, 0, 0) }, uCamPos: { value: new THREE.Vector3() }, uAlpha: { value: 0 }, uMoon: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 }, uComet: { value: 0 }, uLat: { value: 0 } }, window.AIR ? AIR.uniforms : {});
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
        fragmentShader: `uniform vec3 uSun, uCamPos, uMoon, uAirS; uniform vec4 uAirE; uniform float uAlpha, uTime, uComet, uLat; varying vec3 vW, vV, vT, vLR, vLM, vLS;
          ${window.AIR ? AIR.PHASE : 'float airPhR(float c) { return 0.0; } float airPhM(float c) { return 0.0; }'}
          float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
          float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
          void main(){
            vec3 dir = normalize(vW); vec3 up = normalize(uCamPos); vec3 sun = normalize(uSun); vec3 rd = normalize(vV);
            float cSun = dot(rd, uAirS); vec3 T = vT, L = vLR * airPhR(cSun) + vLM * airPhM(cSun) + vLS;
            float el = dot(dir, up); float sunEl = dot(sun, up);
            float night = (1.0 - smoothstep(-0.17, -0.05, sunEl)) * uAlpha; vec3 add = vec3(0.0);      // (what belongs to a sky seen from the ground fades as the camera leaves it: uAlpha)
            // the moon: a lit disc with a soft halo, phase from its angle to the sun
            vec3 moon = normalize(uMoon); float md = dot(dir, moon);
            if (md > 0.99975) { vec3 e = normalize(cross(moon, up)); vec3 n2 = normalize(cross(e, moon)); vec3 off = dir - moon * md; vec2 uv = vec2(dot(off, e), dot(off, n2)) / 0.022; float r2 = dot(uv, uv); if (r2 < 1.0) { vec3 nrm = vec3(uv, sqrt(1.0 - r2)); vec3 toSun = normalize(vec3(dot(sun, e), dot(sun, n2), dot(sun, moon))); float lit = max(dot(nrm, toSun), 0.0); float mare = 0.75 + 0.25 * vn(uv * 4.0 + 7.0); add += vec3(0.93, 0.93, 0.9) * mare * (0.22 + 1.1 * lit) * (1.0 - smoothstep(0.92, 1.0, r2)) * (0.22 + 0.78 * night); } }      // (two and a half degrees across: five times life, as a painter would have it; by day a pale ghost)
            add += vec3(0.8, 0.85, 0.95) * pow(max(md, 0.0), 600.0) * 0.25 * night;
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
            vec3 lin = L + (add * add + disc) * T;
            gl_FragColor = vec4(sqrt(max(lin, 0.0)), 1.0); }`,      // (light to the colours of the screen as airOver does it: a root)
      }));
      this.sky.renderOrder = 40; this.sky.frustumCulled = false; scene.add(this.sky);
    }
    updateSky(cam, sun, time) {
      this.clouds.rotation.y = Math.PI + time * 0.0012; this.cloudShift = time * 0.0012;
      const fade = Math.min(1, Math.max(0, (cam.alt - 0.006) / 0.02));
      this.cloudUniforms.uOpacity.value = 0.6 * fade; this.cloudUniforms.uSun.value.copy(sun); this.clouds.visible = this.cloudsOn && fade > 0.01; this.cloudVis = this.cloudsOn ? 1 : 0;
      const skyA = Math.min(1, Math.max(0, (0.06 - cam.alt) / 0.04));
      this.skyUniforms.uAlpha.value = skyA; this.skyUniforms.uSun.value.copy(sun);
      // the moon circles the sky once a game-month, offset from the sun so phases run their course
      { const a = time * 0.0025; const ax = new THREE.Vector3(0.06, 1, 0.04).normalize(); this.skyUniforms.uMoon.value.copy(sun).applyAxisAngle(ax, 2.6 + a).normalize(); this.skyUniforms.uTime.value = time; this.skyUniforms.uLat.value = cam.lat; this.skyUniforms.uComet.value = this.cometOn ? 1 : 0; }
      this.skyUniforms.uCamPos.value.copy(cam.camera.position);
      const camUp0 = cam.camera.position.clone().normalize(); const dayHere = Math.min(1, Math.max(0, (camUp0.dot(sun) + 0.12) / 0.32));
      // (from the ground the stars come out as the sky darkens; from high up the field is only dimmed on the day side, where the lit ground fills the eye)
      { const su = this.starUniforms, dark = 1 - Math.min(1, Math.max(0, (camUp0.dot(sun) + 0.17) / 0.12)); su.uAlpha.value = (1 - skyA) * (1 - 0.55 * dayHere) + skyA * dark * dark * (3 - 2 * dark); su.uLow.value = skyA; su.uTime.value = time; su.uUp.value.copy(camUp0);
        this.stars.position.copy(cam.camera.position); this.stars.updateMatrixWorld(); this.stars.visible = su.uAlpha.value > 0.004; }
      // lights follow the sun; hemisphere dims at night for the camera's local sun elevation
      this.sunLight.position.copy(sun).multiplyScalar(10); this.sunLight.target.position.set(0, 0, 0);
      const camUp = cam.camera.position.clone().normalize(); const sunUp = camUp.dot(sun);
      const day = Math.min(1, Math.max(0, (sunUp + 0.15) / 0.4));
      { const bu = this.bUniforms; const vm = cam.camera.matrixWorldInverse; bu.uSunV.value.copy(sun).transformDirection(vm); bu.uUpV.value.copy(camUp).transformDirection(vm); bu.uCamAlt.value = cam.alt || 1; bu.uTime.value = time;
        // the light of the hour, for everything that stands on the ground (the terrain works the same out per pixel):
        // a low sun is warm and, the eye opening to it, strong; below the horizon it is gone. Dusk lends a rose glow.
        const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        const kW = sm(0.02, 0.42, sunUp), k = sm(-0.03, 0.05, sunUp) * (1 + 1.1 * (1 - sm(0.04, 0.5, sunUp)));
        bu.uSunCol.value.set(k, k * (0.56 + 0.44 * kW), k * (0.30 + 0.70 * kW)); bu.uDusk.value = sm(-0.12, 0.02, sunUp) * (1 - sm(0.08, 0.4, sunUp)); bu.uDay.value = sm(-0.1, 0.16, sunUp); }
      this.sunLight.intensity = 1.5 * day; this.hemi.intensity = 0.25 + 0.8 * day;
      return day;
    }
  }
  window.WORLD = { World };
})();
