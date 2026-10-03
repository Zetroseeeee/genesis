// GENESIS main: boot, game flow, HUD, labels, minimap, chronicle, loop.
(function () {
  const $ = (id) => document.getElementById(id);
  const W = 720, H = 360, N = W * H;
  const esc = (s) => String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  // trade goods: small stroke glyphs, one per good
  const GOOD_ICON = { grain: 'M12 3v18M12 7l-4-2M12 7l4-2M12 11l-4-2M12 11l4-2M12 15l-4-2M12 15l4-2', fish: 'M3 12c3-4 7-6 11-5l4-4v6l3 3-3 3v6l-4-4c-4 1-8-1-11-5z', cattle: 'M4 6c2 3 5 4 8 4s6-1 8-4M8 10v4a4 4 0 0 0 8 0v-4', timber: 'M12 3l5 7h-3l4 6h-4v5h-4v-5H6l4-6H7z', stone: 'M4 16l4-8 5 3 3-5 4 10z', salt: 'M12 3l6 6-6 12-6-12zM6 9h12', copper: 'M4 16l2-6h12l2 6zM6 10l2-3h8l2 3', tin: 'M4 16l2-6h12l2 6zM9 13h6', iron: 'M6 20l7-7M10 4l6 6-3 3-6-6z', horses: 'M5 20v-6l3-6h5l3-4 3 1-1 3 1 4v8M9 14v6', gold: 'M8 10a5 3 0 1 0 10 0a5 3 0 1 0-10 0M6 14a5 3 0 1 0 10 0', gems: 'M6 9l3-4h6l3 4-6 11zM6 9h12', wine: 'M8 3h8l-1 7a3 3 0 0 1-6 0zM12 13v6M9 20h6', spices: 'M4 20C6 10 12 5 20 4c-1 8-6 14-16 16zM4 20l10-10', silk: 'M5 6h10a3 3 0 0 1 0 6H5zM5 12h12a3 3 0 0 1 0 6H5z', furs: 'M12 3c-3 0-5 3-5 6 0 5 2 8 5 12 3-4 5-7 5-12 0-3-2-6-5-6zM12 3v18', ivory: 'M5 19c1-7 5-13 13-15-3 6-6 10-9 15z', cotton: 'M8 7a3 3 0 1 1 4-2 3 3 0 1 1 4 2 3 3 0 1 1-2 4 3 3 0 1 1-4 0 3 3 0 1 1-2-4zM12 14v7', coal: 'M6 13l3-6 4 2 3-3 3 7-3 5H8z', oil: 'M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z' };
  const goodSvg = (key) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="${GOOD_ICON[key] || GOOD_ICON.stone}"/></svg>`;
  const knownGoods = () => { const pc = sim && sim.playerCiv(); return sim ? sim.ERA_MASKS[pc ? pc.era : 8] : 0; }; // what your age understands of the land
  const goodChip = (g, imp) => `<span class="goodchip ${g.kind}${imp ? ' imp' : ''}" title="${esc(g.name)}${imp ? ' (traded in)' : ''} · ${g.kind}">${goodSvg(g.key)}${esc(g.name)}</span>`;
  const fmtPop = (k) => { const p = k * 1000; return p >= 1e9 ? (p / 1e9).toFixed(2) + ' bn' : p >= 1e6 ? (p / 1e6).toFixed(1) + ' m' : p >= 1e3 ? Math.round(p / 1e3) + ' k' : String(Math.round(p)); };
  const fmtInt = (n) => Math.round(n).toLocaleString();
  const fmtSigned = (n, d = 1) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(d);
  // population deltas arrive in thousands; show them in the unit that reads best
  const fmtDeltaK = (dk) => { const a = Math.abs(dk); const s = dk >= 0 ? '+' : '−'; return a >= 1000 ? s + (a / 1000).toFixed(1) + ' m' : a >= 10 ? s + Math.round(a) + ' k' : a >= 1 ? s + a.toFixed(1) + ' k' : s + Math.round(a * 1000); };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  const SPEEDS = [1, 3, 10, 30, 100, 300, 1000];

  // ---------- state ----------
  let sim = null, terrain = null, world = null, mapcam = null, decal = null, trees = null, life = null, movers = null, fx = null;
  let mode = 'intro', tool = null, speedIdx = 3, paused = true, selected = -1, selectedCiv = -1, hoverCell = -1, pendingFound = null;
  // turn system: the world stands still between presses of the big button
  const turnRun = { active: false, start: 0, target: 0, evIdx: 0, capital: -1, wars: '', era: 0, towns: 0, townSet: null, reason: '' };
  const seen = { wars: new Set(), era: -1, ack: new Set(), turns: 0 };
  const view = { political: true, soil: false, clouds: true, labels: true };
  const settings = { uiScale: 1, tipDelay: 300, glass: false, autoTilt: true, quality: 'high', continuous: false, textures: true };
  const worldData = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
  const TURN_YEARS = [200, 120, 80, 50, 40, 30, 20, 10, 5];
  const speed = () => settings.continuous ? (paused ? 0 : SPEEDS[speedIdx]) : (turnRun.active ? 600 : 0);
  function setMode(m) {
    mode = m; document.body.dataset.mode = m;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (m === 'intro' && w > 900) camera.setViewOffset(w, h, -w * 0.24, 0, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  // ---------- renderer ----------
  const stage = $('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  if (window.SHADOWS) {      // the sun's depth map: 4096 texels across on a real GPU, a quarter of that when the browser is drawing in software
    let soft = false; try { const gl = renderer.getContext(); const x = gl.getExtension('WEBGL_debug_renderer_info'); soft = /SwiftShader|llvmpipe|Software/i.test(String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))); } catch (e) {}
    SHADOWS.init(renderer, window.GENESIS_SHADOW || (soft ? 1024 : 4096));
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  renderer.setClearColor(0x05070c, 1);
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, stage.clientWidth / stage.clientHeight, 1e-5, 20);
  let resizeT = 0; const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(() => { renderer.setSize(stage.clientWidth, stage.clientHeight); camera.aspect = stage.clientWidth / stage.clientHeight; setMode(mode); }, 60); };
  window.addEventListener('resize', onResize); if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

  const globals = {
    uSun: { value: new THREE.Vector3(1, 0.3, 0.2).normalize() }, uTime: { value: 0 }, uCamAlt: { value: 1 }, uDayMix: { value: 1 },
    uOwner: { value: null }, uPal: { value: null }, uSim: { value: null }, uInfo: { value: null }, uNoise: { value: null },
    uDetA: { value: null }, uDetB: { value: null }, uDetC: { value: null }, uDetD: { value: null }, uDet: { value: null },
    uSimRes: { value: new THREE.Vector2(W, H) }, uSel: { value: new THREE.Vector2(-9, -9) }, uHover: { value: new THREE.Vector2(-9, -9) },
    uFertView: { value: 0 }, uPolitical: { value: 1 }, uLabelsOn: { value: 1 },
    uClouds: { value: null }, uCloudShift: { value: 0 }, uCloudVis: { value: 0 },
    uDecal: { value: null }, uDecalRect: { value: new THREE.Vector4(0, 0, 0, 0) }, uDecalOn: { value: 0 }, uQuality: { value: 1 }, uDecal2: { value: null }, uWaterN: { value: null },
    uSeason: { value: new THREE.Vector4(1, 0, 0, 0) },
    uGround: { value: null }, uLanduse: { value: null }, uShallows: { value: null }, uTexMix: { value: 0 },   // generated ground textures (textures.js)
  };
  if (window.SHADOWS) Object.assign(globals, SHADOWS.uniforms);     // the sun's depth map (shadows.js): the same uniform objects everywhere

  // ---------- loading ----------
  function setLoad(pct, step) { $('loadbar').style.transform = `scaleX(${pct / 100})`; if (step) $('loadstep').textContent = step; }
  function loadTex(url, opts = {}) {
    return new Promise((res) => { new THREE.TextureLoader().load(url, (t) => { t.wrapS = t.wrapT = opts.mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping; t.anisotropy = 4; if (opts.flipY === false) t.flipY = false; res(t); }, undefined, () => { console.warn('texture missing', url); res(null); }); });
  }
  // The terrain's photographic detail (forest, dunes, rock, grass), and the shallows once the generated art has loaded,
  // as layers of one array texture: one texture unit instead of five.
  let detImages = null;
  function buildDetArray(extra) {
    if (!renderer.capabilities.isWebGL2 || !THREE.DataTexture2DArray || !detImages) return;
    try {
      const S = 1024, srcs = extra ? detImages.concat([extra]) : detImages; const cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d', { willReadFrequently: true });
      const data = new Uint8Array(S * S * 4 * srcs.length); srcs.forEach((im, k) => { ctx.clearRect(0, 0, S, S); ctx.drawImage(im, 0, 0, S, S); data.set(ctx.getImageData(0, 0, S, S).data, k * S * S * 4); });
      const arr = new THREE.DataTexture2DArray(data, S, S, srcs.length); arr.format = THREE.RGBAFormat; arr.type = THREE.UnsignedByteType; arr.wrapS = arr.wrapT = THREE.MirroredRepeatWrapping;
      arr.minFilter = THREE.LinearMipmapLinearFilter; arr.magFilter = THREE.LinearFilter; arr.generateMipmaps = true; arr.anisotropy = 4; arr.needsUpdate = true;
      const old = globals.uDet.value; globals.uDet.value = arr; if (old) old.dispose();
    } catch (e) { console.warn('detail array unavailable', e); }
  }
  const _shC = new THREE.Vector3();
  function loadImageData(url) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(im, 0, 0); res(ctx.getImageData(0, 0, im.width, im.height)); }; im.onerror = () => rej(new Error('failed ' + url)); im.src = url; });
  }
  async function boot() {
    try {
      loadSettings(); setMode('intro');
      setLoad(6, 'terrain index');
      const index = await (await fetch('data/index.json')).json();
      setLoad(14, 'surface data');
      const [info, noise, detA, detB, detC, detD, waterN] = await Promise.all([loadTex('data/info.png', { flipY: false }), loadTex('data/noise.png'), loadTex('data/det_forest.jpg', { mirror: true }), loadTex('data/det_dunes.jpg', { mirror: true }), loadTex('data/det_rock.jpg', { mirror: true }), loadTex('data/det_grass.jpg', { mirror: true }), loadTex('data/waternormals.jpg')]);
      info.wrapS = THREE.RepeatWrapping; info.wrapT = THREE.ClampToEdgeWrapping; info.minFilter = THREE.LinearFilter; info.generateMipmaps = false;
      globals.uInfo.value = info; globals.uNoise.value = noise; globals.uClouds.value = noise; globals.uWaterN.value = waterN || noise; globals.uDetA.value = detA || noise; globals.uDetB.value = detB || noise; globals.uDetC.value = detC || noise; globals.uDetD.value = detD || noise;
      // one array texture for the four detail photographs (WebGL2): the terrain shader then fits the 16 textures an Apple GPU allows
      detImages = [detA, detB, detC, detD].map((t) => (t || noise).image); buildDetArray(null);
      setLoad(34, 'the world');
      const wd = await loadImageData('data/world.png');
      loadImageData('data/noise.png').then((nd) => { if (terrain) terrain.noiseData = nd; }).catch(() => {});
      for (let i = 0; i < N; i++) { worldData.elev[i] = wd.data[i * 4]; worldData.fert[i] = wd.data[i * 4 + 1] / 255; worldData.flags[i] = wd.data[i * 4 + 2]; worldData.land[i] = wd.data[i * 4 + 2] & 1; }
      setLoad(50, 'peoples');
      world = new WORLD.World({ scene, terrain: { exag: 2.0, heightAt: () => 0 } });
      terrain = new TERRAIN.Terrain({ scene, index, base: 'data/', globals, exag: 2.0, anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
      world.terrain = terrain;
      decal = new DECAL.Decal({ renderer, globals }); decal.terrain = terrain; decal.load('data/rivers.png').catch((e) => console.warn('rivers', e)); world.decal = decal;
      trees = new TREES.Trees({ scene, terrain, renderer }); trees.load('data/veg.jpg', 'data/noise.png').catch((e) => console.warn('veg', e));
      life = new LIFE.Life({ scene, terrain }); movers = new MOVERS.Movers({ scene, terrain, world }); fx = new EVENTS.Effects({ scene, terrain, world });
      globals.uOwner.value = world.ownerTex; globals.uPal.value = world.palTex; globals.uSim.value = world.simTex;
      mapcam = new MAPCAM.MapCamera(camera, renderer.domElement, terrain);
      mapcam.onClick = onClick; mapcam.locked = true; mapcam.autoTilt = settings.autoTilt;
      window.__G = { settings, get sim() { return sim; }, get decal() { return decal; }, get trees() { return trees; }, get life() { return life; }, get movers() { return movers; }, get fx() { return fx; }, startTurn, endTurn, turnRun, terrain, world, mapcam, camera, renderer, globals, select, cellOf, openChronicle, start: (lon, lat, name) => { const i = cellOf(lon, lat); const y = (i / W) | 0, x = i - y * W; startPlayer(i, name || '', [(lon + 180) / 360 * W - x, (90 - lat) / 180 * H - y], true); mapcam.fly = null; }, run: (n) => { for (let k = 0; k < n; k++) sim.tick(); world.refreshTextures(); world.updateBuildings(mapcam, true); refreshAll(true); }, setPaused: (p) => { paused = p; updateClock(); }, setSeason: (p) => { seasonPhase = p; }, get season() { return seasonPhase; }, get labelDbg() { return labelDbg; } };
      buildEconomy(); buildDock(); buildMinimapBase(); bindUI();
      newWorld((Math.random() * 2 ** 31) | 0);
      setLoad(80, 'first light');
      $('btn-load').hidden = !hasSave();
      requestAnimationFrame(frame);
      setTimeout(() => { setLoad(100); $('loading').hidden = true; }, 900);
      // generated materials and art arrive after first light; the world recompiles its shaders when they are in
      if (window.MODELS && settings.models !== false) MODELS.load(window.GENESIS_MODELS_URL).then((M) => { if (M.ready) { world.lastBuild.t = -1e9; console.log('models: ' + Object.keys(M.defs).length + ' in the library'); } });
      if (window.TEX) TEX.load(renderer, TEX_URL).then((T) => { applyArt(); applyTextures(); if (T.ready) toast('Materials loaded'); else if (T.unsupported) console.warn('textures need WebGL2'); });
      try { sampleFn = window.claude && window.claude.use ? await window.claude.use('sample') : null; } catch (e) { sampleFn = null; }
      if (!sampleFn) $('btn-chronicle').textContent = 'Show the record';
    } catch (e) { console.error(e); $('loading').innerHTML = 'The Earth could not be assembled: ' + esc(e.message || e); }
  }

  // ---------- game flow ----------
  function newWorld(seed) {
    sim = createSim(worldData, seed); world.setSim(sim);
    deselect(); feedIdx = 0; seen.wars.clear(); seen.ack.clear(); seen.era = -1; seen.turns = 0; turnRun.active = false; turnRun.townSet = null; turnRun.capital = -1; paused = true; $('report').hidden = true; lastSample.year = -1e9;
    refreshAll(true);
  }
  function cellOf(lon, lat) { const x = Math.floor((lon + 180) / 360 * W), y = Math.floor((90 - lat) / 180 * H); return clamp(y, 0, H - 1) * W + (((x % W) + W) % W); }
  function cellCenter(i) { const y = (i / W) | 0, x = i - y * W; return [(x + 0.5) / W * 360 - 180, 90 - (y + 0.5) / H * 180]; }
  function siteOf(i) { return world.siteOf(i); }
  function placeOf(i) { return sim.level[i] ? siteOf(i) : cellCenter(i); }
  function viewDist(i) { const c = sim.owner[i] >= 0 ? sim.civs[sim.owner[i]] : null; const R = c && sim.level[i] ? TOWN.radiusM(sim, i, c) : 2500; return clamp(R * 3.4 / 6371000, 0.0009, 0.03); }
  function seedOtherTribes(n, avoid) {
    const LI = sim.LI; let placed = 0, tries = 0; const homes = [avoid];
    while (placed < n && tries < 20000) {
      tries++; const i = LI[Math.floor(sim.rnd() * LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue;
      if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue;
      let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } }
      if (!ok) continue;
      if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; }
    }
  }
  function startPlayer(i, name, site, fromClick) {
    const c = sim.setPlayer(i, name, site); if (!c) { toast('Could not settle there'); return; }
    setMode('play'); banner(null); mapcam.locked = false; mapcam.idleSpin = false; paused = true;
    seedOtherTribes(24, i); sim.recount(); world.refreshTextures(); world.updateBuildings(mapcam, true); snapshotTurn();
    setTimeout(() => toast('Your village stands. Open City to build, Expand to claim land, then press Advance to let the years run.'), 2600);
    const [lon, lat] = siteOf(i);
    mapcam.flyTo(lon, lat, viewDist(i), { duration: fromClick ? 2.4 : 3.8, tilt: 0.9, heading: mapcam.heading });
    select(i); $('intro').hidden = true; refreshAll(true);
    bigBanner(`${sim.fullName(c)}`, `settle ${sim.cellName.get(i)} · ${sim.fmtYear(sim.year)}`);
  }
  function randomStart() {
    const LI = sim.LI; let best = -1, bs = -1;
    for (let t = 0; t < 6000; t++) { const i = LI[Math.floor(sim.rnd() * LI.length)]; const s = sim.fert[i] * (1 + ((sim.flags[i] & 2) ? 0.8 : 0)) * (1 + ((sim.flags[i] & 4) ? 0.15 : 0)) * sim.rnd(); if (s > bs) { bs = s; best = i; } }
    startPlayer(best, '', null, false);
  }
  function chooseMode() { setMode('choose'); $('intro').hidden = true; mapcam.locked = false; mapcam.idleSpin = false; banner('Fly anywhere. Click the ground where your people begin.', true); setSoil(true); }
  function setSoil(on) { view.soil = on; globals.uFertView.value = on ? 0.6 : 0; $('v-soil').classList.toggle('on', on); }
  function showFoundCard(hit, i, cx, cy) {
    pendingFound = { hit, i }; const f = sim.flags[i]; const fert = sim.fert[i];
    const terrainTxt = (f & 8) ? 'Ice' : (fert < 0.12 ? 'Desert or barren' : fert < 0.35 ? 'Marginal land' : fert < 0.6 ? 'Good land' : 'Rich land') + ((f & 2) ? ' · river' : '') + ((f & 4) ? ' · coast' : '');
    const slopeTxt = hit.h > 2500 ? 'high mountain' : hit.h > 1200 ? 'highland' : hit.h > 400 ? 'hills' : 'lowland';
    $('found-kv').innerHTML = `<span class="micro">Place</span><span>${esc(sim.cellName.get(i) || sim.describeCell(i))}</span><span class="micro">Elevation</span><span class="num">${Math.round(hit.h)} m · ${slopeTxt}</span><span class="micro">Land</span><span>${terrainTxt}</span><span class="micro">Fertility</span><span class="num">${Math.round(fert * 100)} / 100</span>`;
    $('found-hint').textContent = fert < 0.2 ? 'Hard country. Your people will grow slowly here, but nobody will contest it.' : (f & 2) ? 'A river valley. Fields will feed cities here; so will everyone else want it.' : hit.h > 1500 ? 'A mountain home. Easy to defend, slow to grow, and the view is yours.' : 'Fair land. Room to grow.';
    const card = $('found'); card.hidden = false; const r = stage.getBoundingClientRect();
    card.style.left = clamp(cx + 18, 16, r.width - 336) + 'px'; card.style.top = clamp(cy - 40, 90, r.height - 320) + 'px'; $('found-name').value = '';
  }

  // ---------- globe input ----------
  function onClick(cx, cy) {
    if (!sim || mode === 'intro') return;
    const hit = mapcam.pickAt(cx, cy); if (!hit) return;
    const i = cellOf(hit.lon, hit.lat);
    if (mode === 'choose') { if (!sim.land[i] || (sim.flags[i] & 8)) { toast('Your people need land to stand on'); return; } if (sim.owner[i] >= 0) { toast('Someone already lives here'); return; } showFoundCard(hit, i, cx, cy); return; }
    if (placing) { cancelPlacing(); return; }
    if (tool) {
      let msg;
      if (tool === 'settle') {
        msg = sim.act(tool, i);
        if (msg && msg.startsWith('Settled')) { const y = (i / W) | 0, x = i - y * W; sim.siteU[i] = clamp((hit.lon + 180) / 360 * W - x, 0.05, 0.95); sim.siteV[i] = clamp((90 - hit.lat) / 180 * H - y, 0.05, 0.95); }
      }
      else if (tool === 'spawn') { const c = sim.spawnTribe(i); msg = c ? `${sim.fullName(c)} arrive` : 'Needs empty land'; }
      else if (tool === 'plague') { sim.plague(i, 10, false); msg = 'Plague unleashed'; }
      else if (tool === 'meteor') { sim.meteor(i); msg = 'Impact'; }
      else if (tool === 'bounty') { sim.bounty(i); msg = 'The land turns green'; }
      else if (tool === 'prophet') msg = sim.prophet(i);
      else if (tool === 'enlighten') msg = sim.enlighten(i);
      toast(msg); world.refreshTextures(); world.updateBuildings(mapcam, true); refreshAll(true);
      if (tool !== 'settle') setTool(null);
      return;
    }
    if (sim.owner[i] < 0 && !sim.land[i]) { deselect(); return; }
    select(i);
  }
  function select(i) { selected = i; selectedCiv = sim.owner[i]; const y = (i / W) | 0, x = i - y * W; globals.uSel.value.set(x, y); $('left').classList.add('open'); updateInspector(true); }
  function deselect() { selected = -1; selectedCiv = -1; globals.uSel.value.set(-9, -9); $('left').classList.remove('open'); cancelPlacing(); }
  let hoverT = 0;
  renderer.domElement.addEventListener('pointermove', (e) => {
    const now = performance.now(); if (now - hoverT < 40) return; hoverT = now;
    if (!sim || mode === 'intro' || matchMedia('(hover: none)').matches) return;
    const hit = mapcam.pickAt(e.clientX, e.clientY); const chip = $('hover');
    if (!hit) { hoverCell = -1; globals.uHover.value.set(-9, -9); chip.hidden = true; return; }
    const i = cellOf(hit.lon, hit.lat); hoverCell = i; const y = (i / W) | 0, x = i - y * W; globals.uHover.value.set(x, y);
    const o = sim.owner[i]; const c = o >= 0 ? sim.civs[o] : null; const name = sim.cellName.get(i);
    const lvl = ['', 'Village', 'Town', 'City', 'Metropolis'][sim.level[i]];
    const rows = [];
    if (c) rows.push(['Realm', esc(sim.fullName(c))]);
    if (sim.land[i]) { rows.push(['People', fmtPop(sim.pop[i]) + (c ? ' / ' + fmtPop(sim.capacity(i, c)) + ' fed' : '')]); rows.push(['Elevation', Math.round(hit.h) + ' m']); if (sim.goods[i] && (knownGoods() & (1 << sim.goods[i]))) rows.push(['Yields', esc(sim.GOODS[sim.goods[i]].name)]); }
    if (sim.infra[i] || sim.walls[i] || sim.special[i]) rows.push(['Works', [sim.infra[i] ? 'developed ' + sim.infra[i] : '', sim.walls[i] ? 'walls ' + sim.walls[i] : '', sim.special[i] & 1 ? 'port' : '', sim.special[i] & 2 ? 'academy' : '', sim.special[i] & 4 ? 'temple' : '', sim.special[i] & 8 ? 'market' : '', sim.special[i] & 16 ? 'wonder' : ''].filter(Boolean).join(', ')]);
    chip.innerHTML = `<b>${esc(name || (sim.land[i] ? (c ? 'Land of the ' + c.name : 'Wild land') : 'Open sea'))}${lvl ? ' <span class="micro" style="color:var(--text-3)">' + lvl + (c && c.capital === i ? ' · capital' : '') + '</span>' : ''}</b><div class="kv">${rows.map(r => `<span class="micro">${r[0]}</span><span class="num">${r[1]}</span>`).join('')}</div>`;
    chip.hidden = false; const r = stage.getBoundingClientRect(); const cw = chip.offsetWidth, chh = chip.offsetHeight;
    chip.style.left = (e.clientX + 14 + cw > r.width - 12 ? e.clientX - 14 - cw : e.clientX + 14) + 'px'; chip.style.top = (e.clientY + 14 + chh > r.height - 12 ? e.clientY - 14 - chh : e.clientY + 14) + 'px';
  });
  renderer.domElement.addEventListener('pointerleave', () => { $('hover').hidden = true; hoverCell = -1; globals.uHover.value.set(-9, -9); });

  // ---------- generic tooltip (delay configurable) ----------
  let tipTimer = 0, tipTarget = null;
  function attachTip(el, fn) {
    el.addEventListener('pointerenter', (e) => { clearTimeout(tipTimer); tipTarget = el; tipTimer = setTimeout(() => showTip(el, fn(), e), settings.tipDelay); });
    el.addEventListener('pointerleave', () => { clearTimeout(tipTimer); if (tipTarget === el) { $('tip').hidden = true; tipTarget = null; } });
  }
  function showTip(el, html) {
    if (!html) return; const t = $('tip'); t.innerHTML = html; t.hidden = false;
    const r = el.getBoundingClientRect(); const vw = innerWidth, vh = innerHeight; const tw = t.offsetWidth, th = t.offsetHeight;
    let x = r.left, y = r.bottom + 8; if (x + tw > vw - 12) x = vw - 12 - tw; if (y + th > vh - 12) y = r.top - 8 - th;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }

  // ---------- economy strip ----------
  const ECO = [
    { id: 'coin', cls: 'coin', icon: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h4a1.75 1.75 0 0 1 0 3.5h-3a1.75 1.75 0 0 0 0 3.5h4" fill="none" stroke="#101318" stroke-width="1.6"/>', tip: 'Treasury' },
    { id: 'pop', cls: 'pop', icon: '<circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.4"/><path d="M3 19c0-4 2.5-6 6-6s6 2 6 6zM14 19c0-3 1.5-4.5 3.5-4.5S21 16 21 19z"/>', tip: 'People' },
    { id: 'land', cls: 'land', icon: '<path d="M3 18l5-9 4 6 3-4 6 7z"/>', tip: 'Territory' },
    { id: 'stab', cls: 'stab', icon: '<path d="M12 3v18M5 9l7-3 7 3M5 9l-2 6h4zM19 9l-2 6h4z"/><path d="M8 21h8" stroke="#101318" stroke-width="1.5"/>', tip: 'Stability' },
  ];
  const ecoEls = {};
  function buildEconomy() {
    const host = $('economy');
    for (const e of ECO) {
      const d = document.createElement('div'); d.className = 'eco ' + e.cls; d.innerHTML = `<svg viewBox="0 0 24 24">${e.icon}</svg><div class="stack"><span class="v" id="eco-${e.id}">—</span><span class="d" id="eco-${e.id}-d"></span></div>`;
      host.appendChild(d); ecoEls[e.id] = d; attachTip(d, () => ecoTip(e.id));
    }
  }
  const lastSample = { pop: 0, cells: 0, year: -1e9, dPop: 0, dCells: 0 };
  function ecoTip(id) {
    const c = sim && sim.playerCiv(); if (!c) return `<b>${ECO.find(x => x.id === id).tip}</b>No realm yet.`;
    const P = c.policy; const pop = sim.popOf[c.id];
    const row = (k, v) => `<div class="row"><span>${k}</span><span class="num">${v}</span></div>`;
    switch (id) {
      case 'coin': { const gross = pop * (0.06 + c.tech * 0.3) * P.tax * (1 + sim.ports[c.id] * 0.05); const mil = pop * 0.05 * (P.military - 1); return `<b>Treasury ${fmtInt(c.wealth)}</b>${row('Taxes', fmtSigned(gross))}${row('Ports ×' + sim.ports[c.id], '+' + (sim.ports[c.id] * 5) + '%')}${row('Markets ×' + sim.markets[c.id], '+' + Math.min(30, sim.markets[c.id] * 4) + '%')}${row('Army upkeep', fmtSigned(-mil))}${row('Net per year', fmtSigned(c.income || 0))}<div class="hint">Taxes at ${P.tax.toFixed(1)}×, military at ${P.military.toFixed(1)}×. Change both in Realm › Policy.</div>`; }
      case 'pop': { const fed = sim.settlementsOf(c.id).length; return `<b>${fmtPop(pop)} people</b>${row('Settlements', fed)}${row('Change / 20 yrs', fmtSigned(lastSample.dPop, 1) + ' k')}<div class="hint">People grow towards what the land feeds. Develop cells and advance knowledge to feed more.</div>`; }
      case 'land': return `<b>${fmtInt(sim.cellsOf[c.id])} regions</b>${row('Reach from capital', Math.round(sim.reachOf(c.tech) + sim.ports[c.id] * 2) + ' cells')}${row('Peak', fmtInt(c.peakCells))}<div class="hint">Regions beyond your reach may break away when stability is low.</div>`;
      case 'mil': return `<b>Strength ${fmtInt(sim.strength(c))}</b>${row('People', fmtPop(pop))}${row('Knowledge factor', (0.25 + c.tech * 1.6).toFixed(2) + '×')}${row('Military spending', P.military.toFixed(1) + '×')}${row('Army', sim.year < c.army ? `raised, ${c.army - sim.year} yrs` : 'none')}<div class="hint">Wars are won cell by cell by the stronger side. Walls double a cell's defence.</div>`;
      case 'stab': { const wars = Object.keys(c.wars).length; const over = Math.max(0, sim.cellsOf[c.id] / (40 + c.tech * 3000) - 1); return `<b>Stability ${Math.round(c.stability * 100)}%</b>${row('Wars', wars ? `−${(wars * 12)}%` : '0')}${row('Overreach', over > 0 ? `−${Math.round(over * 50)}%` : '0')}${row('Taxes', P.tax > 1 ? `−${Math.round((P.tax - 1) * 30)}%` : P.tax < 1 ? `+${Math.round((1 - P.tax) * 30)}%` : '0')}${row('Temples ×' + sim.temples[c.id], '+' + Math.min(15, sim.temples[c.id] * 3) + '%')}${row('Wonders ×' + sim.wonders[c.id], '+' + Math.min(15, sim.wonders[c.id] * 5) + '%')}<div class="hint">Below 30% the realm may fracture.</div>`; }
      case 'sci': { const next = sim.ERAS[c.era + 1]; return `<b>Knowledge ${(c.tech * 100).toFixed(1)}%</b>${row('Era', sim.ERAS[c.era][0])}${next ? row('Next era at', (next[1] * 100) + '%') : ''}${row('Academies', sim.acad[c.id])}${row('Research spending', P.research.toFixed(1) + '×')}<div class="hint">Knowledge also spreads from neighbours you touch.</div>`; }
    }
    return '';
  }
  function updateEconomy() {
    const c = sim && sim.playerCiv();
    const set = (id, v, d, dcls) => { const el = $('eco-' + id); if (!el) return; el.textContent = v; const de = $('eco-' + id + '-d'); de.textContent = d || ''; de.className = 'd ' + (dcls || ''); };
    if (!c) { for (const e of ECO) set(e.id, '—', ''); $('id-name').textContent = mode === 'choose' ? 'Choosing a homeland' : 'The World'; $('id-era').textContent = 'Before history'; $('id-sw').style.background = '#5b6779'; return; }
    if (sim.year - lastSample.year >= 20) { if (lastSample.year > -1e8) { lastSample.dPop = sim.popOf[c.id] - lastSample.pop; lastSample.dCells = sim.cellsOf[c.id] - lastSample.cells; } lastSample.pop = sim.popOf[c.id]; lastSample.cells = sim.cellsOf[c.id]; lastSample.year = sim.year; }
    const inc = c.income || 0;
    set('coin', fmtInt(c.wealth), fmtSigned(inc), inc >= 0 ? 'pos' : 'neg');
    set('pop', fmtPop(sim.popOf[c.id]), Math.abs(lastSample.dPop) >= 0.02 ? fmtDeltaK(lastSample.dPop) : '', lastSample.dPop >= 0 ? 'pos' : 'neg');
    set('land', fmtInt(sim.cellsOf[c.id]), lastSample.dCells ? fmtSigned(lastSample.dCells, 0) : '', lastSample.dCells >= 0 ? 'pos' : 'neg');
    set('mil', fmtInt(sim.strength(c)), sim.year < c.army ? 'army' : '', 'pos');
    set('stab', Math.round(c.stability * 100) + '%', '', c.stability < 0.3 ? 'neg' : c.stability < 0.5 ? 'warn' : '');
    set('sci', (c.tech * 100).toFixed(1) + '%', '', '');
    $('id-name').textContent = sim.fullName(c); $('id-era').textContent = sim.ERAS[c.era][0] + ' · ' + c.gov; $('id-sw').style.background = c.color;
  }

  // ---------- attention queue + the turn button ----------
  const T_ICON = { disaster: '<path d="M12 3l9 16H3z M12 9v5M12 16v1"/>', war: '<path d="M4 4l16 16M20 4L4 20"/>', capital: '<path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z"/>', split: '<path d="M6 6l6 6-6 6M12 6l6 6-6 6"/>', stab: '<path d="M12 4v9M12 17v2"/>', debt: '<path d="M12 5v14M8 9h5a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h6"/>', era: '<path d="M12 3l2.4 5.4 5.6.6-4.2 3.8 1.2 5.6L12 15.6 7 18.4l1.2-5.6L4 9l5.6-.6z"/>', grow: '<path d="M4 20h16M7 20V8h4v12M13 20v-7h4v7"/>', gone: '<path d="M5 5l14 14M19 5L5 19"/>', play: '<path d="M6 4l14 8-14 8z"/>', stop: '<path d="M6 6h12v12H6z"/>', pause: '<path d="M8 5v14M16 5v14"/>' };
  function computeAttention() {
    const c = sim && sim.playerCiv(); if (!c) return [];
    const out = []; const yb = Math.floor(sim.year / 20);
    const wars = Object.keys(c.wars).map(k => +k).filter(k => sim.civs[k]);
    const fresh = wars.filter(k => !seen.wars.has(k));
    for (const k of fresh) { const w = sim.civs[k]; out.push({ id: 'war' + k, kind: 'war', cls: 'war', t1: 'War', t2: `${sim.fullName(w)} · at war with you`, body: 'Fly to their capital. Offer peace from their panel, or raise a levy and fight.', act: () => { seen.wars.add(k); if (w.capital >= 0) { const [lon, lat] = placeOf(w.capital); mapcam.flyTo(lon, lat, Math.min(Math.max(mapcam.dist, 0.02), 0.08)); select(w.capital); } } }); }
    for (const k of [...seen.wars]) if (!wars.includes(k)) seen.wars.delete(k);
    if (turnRun.capital >= 0 && turnRun.capital !== c.capital && !seen.ack.has('cap' + c.capital)) out.push({ id: 'cap', kind: 'capital', cls: 'war', t1: 'Capital', t2: `The court now sits at ${sim.cellName.get(c.capital) || 'a new seat'}`, act: () => { seen.ack.add('cap' + c.capital); goHome(); } });
    const recent = c.events.slice(-12).filter(e => sim.year - e.year <= Math.max(60, TURN_YEARS[c.era] * 2));
    const split = recent.find(e => /breaks away/.test(e.text)); if (split && !seen.ack.has('split' + split.year)) out.push({ id: 'split', kind: 'split', cls: 'war', t1: 'Revolt', t2: split.text.replace(/ from .*$/, ''), act: () => { seen.ack.add('split' + split.year); if (split.loc >= 0) { const [lon, lat] = placeOf(split.loc); mapcam.flyTo(lon, lat, Math.min(Math.max(mapcam.dist, 0.02), 0.08)); select(split.loc); } } });
    if (c.stability < 0.3 && !seen.ack.has('stab' + yb)) out.push({ id: 'stab', kind: 'stab', cls: 'warn', t1: 'Unrest', t2: `Stability ${Math.round(c.stability * 100)}% · the realm may fracture`, body: 'Lower taxes, end wars, build temples.', act: () => { seen.ack.add('stab' + yb); openRealm(); } });
    if (c.wealth < 0 && !seen.ack.has('debt' + yb)) out.push({ id: 'debt', kind: 'debt', cls: 'warn', t1: 'Empty treasury', t2: `Losing ${Math.abs(c.income || 0).toFixed(1)} a year`, body: 'Raise taxes or cut military spending.', act: () => { seen.ack.add('debt' + yb); openRealm(); } });
    if (seen.era >= 0 && c.era > seen.era) out.push({ id: 'era', kind: 'era', cls: 'good', t1: 'New era', t2: `Your people enter the ${sim.ERAS[c.era][0]}`, act: () => { seen.era = c.era; bigBanner(sim.ERAS[c.era][0], sim.fullName(c) + ' · ' + sim.fmtYear(sim.year), eraArt(c.era)); } });
    const dis = c.events.slice(-12).filter(e => e.type === 'disaster' && sim.year - e.year <= 6 && !seen.ack.has('dis' + e.year + e.loc));
    for (const e of dis.slice(0, 2)) out.push({ id: 'dis' + e.year, kind: 'disaster', cls: 'warn', t1: 'Disaster', t2: e.text, body: 'Fly there to see the damage. Treasuries rebuild walls and works.', act: () => { seen.ack.add('dis' + e.year + e.loc); if (e.loc >= 0) { const [lon, lat] = placeOf(e.loc); mapcam.flyTo(lon, lat, Math.max(viewDist(e.loc), 0.0012)); select(e.loc); } } });
    return out;
  }
  // soft advice: never blocks the turn
  function computeAdvice() {
    const c = sim && sim.playerCiv(); if (!c) return null;
    if (turnRun.townSet) { const grown = sim.settlementsOf(c.id).find(i => sim.level[i] >= 2 && !turnRun.townSet.has(i) && !seen.ack.has('grow' + i)); if (grown) return { text: `${sim.cellName.get(grown)} has grown into a ${['', '', 'town', 'city', 'metropolis'][sim.level[grown]]}`, go: grown, ack: 'grow' + grown }; }
    const towns = sim.settlementsOf(c.id).filter(i => sim.level[i] >= 2);
    const can = (k) => c.wealth >= sim.costOf(k);
    if (can('academy') && towns.some(i => !(sim.special[i] & 2))) return { text: 'You can afford an Academy (+8% knowledge)', tool: 'academy' };
    if (can('temple') && c.stability < 0.7 && sim.settlementsOf(c.id).some(i => !(sim.special[i] & 4))) return { text: 'A Temple would steady the realm', tool: 'temple' };
    if (can('port') && sim.settlementsOf(c.id).some(i => (sim.flags[i] & 4) && !(sim.special[i] & 1))) return { text: 'A coastal town could take a Port', tool: 'port' };
    if (c.era >= 1 && can('market') && sim.settlementsOf(c.id).some(i => !(sim.special[i] & 8))) return { text: 'A Market would lift your income', tool: 'market' };
    if (can('wonder') && c.capital >= 0 && sim.level[c.capital] >= 2 && !(sim.special[c.capital] & 16)) return { text: 'Your treasury could raise a Wonder in the capital', tool: 'wonder' };
    if (can('farm') && c.wealth > sim.costOf('farm') * 4) return { text: 'Treasury is full: lay out Farms around a town', tool: 'farm' };
    if (c.policy.stance !== 'aggressive' && can('settle') && c.wealth > sim.costOf('settle') * 3) return { text: 'You could Expand: settle new land', tool: 'settle' };
    return null;
  }
  function turnLength() { const c = sim && sim.playerCiv(); return TURN_YEARS[c ? c.era : 0]; }
  function snapshotTurn() {
    const c = sim.playerCiv(); turnRun.start = sim.year; turnRun.seq = sim.evSeq; turnRun.evIdx = sim.worldEvents.length;
    turnRun.capital = c ? c.capital : -1; turnRun.era = c ? c.era : 0; turnRun.wars = c ? Object.keys(c.wars).sort().join(',') : '';
    turnRun.townSet = c ? new Set(sim.settlementsOf(c.id).filter(i => sim.level[i] >= 2)) : null; turnRun.towns = turnRun.townSet ? turnRun.townSet.size : 0;
    turnRun.pop0 = c ? sim.popOf[c.id] : 0; turnRun.cells0 = c ? sim.cellsOf[c.id] : 0; turnRun.wealth0 = c ? c.wealth : 0;
    if (c) { if (seen.era < 0) seen.era = c.era; for (const k of Object.keys(c.wars)) seen.wars.add(+k); }
  }
  function startTurn() {
    if (!sim || mode !== 'play' || turnRun.active) return;
    $('report').hidden = true; deselectTool();
    snapshotTurn(); turnRun.target = sim.year + turnLength(); turnRun.reason = ''; turnRun.active = true; paused = false; acc = 0; seen.turns++;
    updateTurnButton();
  }
  function endTurn(reason) {
    if (!turnRun.active) return; turnRun.active = false; paused = true; turnRun.reason = reason || '';
    world.refreshTextures(); world.updateBuildings(mapcam, true); refreshAll(true); showReport();
  }
  function deselectTool() { if (tool) setTool(null); }
  // interrupts: things that should stop the clock so you can react
  function checkInterrupts() {
    const c = sim.playerCiv(); if (!c) { endTurn('gone'); return; }
    const wars = Object.keys(c.wars).sort().join(','); if (wars !== turnRun.wars && Object.keys(c.wars).some(k => !seen.wars.has(+k))) { endTurn('war'); return; }
    if (c.capital !== turnRun.capital) { endTurn('capital'); return; }
    if (c.era !== turnRun.era) { endTurn('era'); return; }
    if (c.stability < 0.25 && !seen.ack.has('stab' + Math.floor(sim.year / 20))) { endTurn('stab'); return; }
    // everything logged since the last look (several years can pass between frames)
    const since = turnRun.seq || 0; const recent = c.events.filter(e => (e.seq || 0) > since); turnRun.seq = sim.evSeq;
    if (recent.some(e => /breaks away/.test(e.text))) { endTurn('split'); return; }
    if (recent.some(e => e.type === 'disaster' && !seen.ack.has('dis' + e.year + e.loc))) { endTurn('disaster'); return; }
  }
  function updateTurnButton() {
    const b = $('turn'); const l1 = $('turn1'), l2 = $('turn2'), ico = $('turnico'), badge = $('turnbadge'), fill = $('turnfill');
    const c = sim && sim.playerCiv();
    const setState = (cls, t1, t2, icon) => { b.className = 'state-' + cls; l1.textContent = t1; l2.textContent = t2; ico.innerHTML = T_ICON[icon] || T_ICON.play; };
    const eraP = () => { const ref = c || { tech: 0, era: 0 }; const next = sim.ERAS[ref.era + 1]; const from = sim.ERAS[ref.era][1]; return next ? clamp((ref.tech - from) / (next[1] - from), 0, 1) : 1; };
    badge.hidden = true;
    if (!sim) return;
    if (!c) { setState('over', 'Gone', 'Your people are no more · menu', 'gone'); fill.style.strokeDashoffset = '295.3'; return; }
    const av = $('advisor');
    const softAdvice = () => { av.classList.remove('att'); av.dataset.att = ''; av.dataset.tool = ''; av.dataset.go = ''; av.dataset.ack = ''; const adv = computeAdvice(); if (adv) { av.hidden = false; $('advisor-text').textContent = adv.text; av.dataset.tool = adv.tool || ''; av.dataset.go = adv.go >= 0 ? adv.go : ''; av.dataset.ack = adv.ack || ''; } else av.hidden = true; };
    if (settings.continuous) {
      setState(paused ? 'advance' : 'running', paused ? 'Play' : 'Pause', '', paused ? 'play' : 'pause'); fill.style.strokeDashoffset = (295.3 * (1 - eraP())).toFixed(1); b.title = paused ? 'Run time (Enter)' : 'Pause (Enter)';
      const q = computeAttention();
      if (q.length) { av.hidden = false; av.classList.add('att'); av.dataset.att = '1'; av.dataset.tool = ''; av.dataset.go = ''; av.dataset.ack = ''; $('advisor-text').textContent = `${q[0].t1}: ${q[0].t2}`; } else softAdvice();
      return;
    }
    if (turnRun.active) { const p = clamp((sim.year - turnRun.start) / Math.max(1, turnRun.target - turnRun.start), 0, 1); setState('running', sim.fmtYear(sim.year), 'click to stop', 'stop'); fill.style.strokeDashoffset = (295.3 * (1 - p)).toFixed(1); av.hidden = true; return; }
    const q = computeAttention();
    if (q.length) { const a = q[0]; setState(a.cls, a.t1, 'click to see', a.kind); if (q.length > 1) { badge.hidden = false; badge.textContent = q.length; } fill.style.strokeDashoffset = '0'; b.title = a.body || a.t2; av.hidden = false; av.classList.add('att'); av.dataset.att = '1'; av.dataset.tool = ''; av.dataset.go = ''; av.dataset.ack = ''; $('advisor-text').textContent = a.t2; }
    else { const n = turnLength(); setState('advance', 'Advance', `${n} years`, 'play'); fill.style.strokeDashoffset = (295.3 * (1 - eraP())).toFixed(1); b.title = `Advance ${n} years to ${sim.fmtYear(sim.year + n)} (Enter)`;
      if (!seen.turns) { av.hidden = false; av.classList.remove('att'); av.dataset.att = ''; av.dataset.tool = ''; av.dataset.go = ''; av.dataset.ack = ''; $('advisor-text').textContent = `Press Advance: ${n} years pass while you watch, and time stops if anything needs you.`; return; }
      softAdvice(); }
  }
  function onTurnClick() {
    if (!sim || mode !== 'play') return;
    const c = sim.playerCiv();
    if (!c) { openMenu(); return; }
    if (settings.continuous) { paused = !paused; updateTurnButton(); updateClock(); return; }
    if (turnRun.active) { endTurn('stopped'); return; }
    const q = computeAttention();
    if (q.length) { q[0].act(); updateTurnButton(); return; }
    startTurn();
  }
  function showReport() {
    const c = sim.playerCiv(); const box = $('report'); if (!c) { box.hidden = true; return; }
    const ev = sim.worldEvents.slice(turnRun.evIdx); const mine = ev.filter(e => e.mine).map(e => { e._s = scoreEvent(e); return e; }).sort((a, b) => b._s - a._s).slice(0, 5).sort((a, b) => a.year - b.year); const others = ev.filter(e => !e.mine).map(e => { e._s = scoreEvent(e); return e; }).sort((a, b) => b._s - a._s).slice(0, 3).sort((a, b) => a.year - b.year);
    const list = [...mine, ...others];
    const why = { war: 'War declared on you', capital: 'Your capital changed', era: 'A new era', stab: 'Unrest', split: 'A province broke away', stopped: 'Stopped early', gone: 'Your people are gone', disaster: 'Disaster strikes your lands' }[turnRun.reason] || '';
    $('report-title').textContent = `${sim.fmtYear(turnRun.start)} → ${sim.fmtYear(sim.year)}`;
    const wy = $('report-why'); wy.hidden = !why; wy.textContent = why; wy.className = 'why ' + (turnRun.reason || '');
    // a painted strip for the moment that stopped the clock
    const art = $('report-art'); const artUrl = why ? reportArt(turnRun.reason, mine) : '';
    if (art) { art.hidden = !artUrl; art.style.backgroundImage = artUrl ? `url("${artUrl}")` : ''; }
    const dP = sim.popOf[c.id] - (turnRun.pop0 || 0), dC = sim.cellsOf[c.id] - (turnRun.cells0 || 0), dW = c.wealth - (turnRun.wealth0 || 0);
    $('report-delta').innerHTML = `<span><b>${fmtPop(sim.popOf[c.id])}</b> people <span class="${dP >= 0 ? 'pos' : 'neg'}">${fmtDeltaK(dP)}</span></span><span><b>${fmtInt(sim.cellsOf[c.id])}</b> regions <span class="${dC >= 0 ? 'pos' : 'neg'}">${fmtSigned(dC, 0)}</span></span><span><b>${fmtInt(c.wealth)}</b> treasury <span class="${dW >= 0 ? 'pos' : 'neg'}">${fmtSigned(dW, 0)}</span></span>`;
    const fe = (e, k) => `<div class="fe ${e.type}${e.mine ? ' mine' : ''}" data-k="${k}"><svg viewBox="0 0 24 24">${FEED_ICON[e.type] || FEED_ICON.city}</svg><div><span class="y">${sim.fmtYear(e.year)}</span>${esc(e.text)}</div></div>`;
    let html = '';
    if (mine.length) html += `<div class="rg">Your realm</div>` + mine.map((e, k) => fe(e, k)).join('');
    if (others.length) html += `<div class="rg">Elsewhere</div>` + others.map((e, k) => fe(e, mine.length + k)).join('');
    $('report-body').innerHTML = html || (why ? '' : '<div class="hint" style="padding:4px 6px">A quiet stretch of years. Your people grew, and nothing else happened worth recording.</div>');
    $('report-body').hidden = !html && !!why;
    $('report-body').querySelectorAll('.fe').forEach(el => el.addEventListener('click', () => { const e = list[+el.dataset.k]; if (e && e.loc >= 0) { const [lon, lat] = placeOf(e.loc); mapcam.flyTo(lon, lat, Math.min(Math.max(mapcam.dist, 0.02), 0.2)); select(e.loc); } }));
    box.hidden = false;
  }

  // ---------- chronometer ----------
  function updateClock() {
    const y = sim.year; $('year').textContent = Math.abs(y).toLocaleString(); $('yearera').textContent = y < 0 ? 'BC' : 'AD';
    $('speedval').firstChild.textContent = paused ? '❚❚' : SPEEDS[speedIdx] + '×';
    $('btn-pause').classList.toggle('on', paused);
    let best = 0; for (const c of sim.civs) if (c && c.tech > best) best = c.tech;
    $('worldera').textContent = sim.st.civCount ? sim.ERAS[sim.eraOf(best)][0] : 'Before history';
  }
  function setSpeedIdx(i) { speedIdx = clamp(i, 0, SPEEDS.length - 1); paused = false; updateClock(); updateTurnButton(); }

  // ---------- inspector ----------
  let chronicleCiv = -1;
  function updateInspector(force) {
    if (!sim || selected < 0) return;
    const i = selected; const o = sim.owner[i]; const c = o >= 0 ? sim.civs[o] : null; const name = sim.cellName.get(i);
    const lvl = ['Wild', 'Village', 'Town', 'City', 'Metropolis'][sim.level[i]]; const f = sim.flags[i];
    const terrainTxt = !sim.land[i] ? 'Open water' : (f & 8) ? 'Ice' : (sim.fert[i] < 0.12 ? 'Desert or barren' : sim.fert[i] < 0.35 ? 'Marginal land' : sim.fert[i] < 0.6 ? 'Good land' : 'Rich land') + ((f & 2) ? ', river' : '') + ((f & 4) ? ', coast' : '');
    const hCell = terrain.heightAt(...placeOf(i)); const isSea = !sim.land[i];
    const works = [sim.infra[i] ? 'developed ' + sim.infra[i] : '', sim.walls[i] ? 'walls ' + sim.walls[i] : '', sim.special[i] & 1 ? 'port' : '', sim.special[i] & 2 ? 'academy' : '', sim.special[i] & 4 ? 'temple' : '', sim.special[i] & 8 ? 'market' : '', sim.special[i] & 16 ? 'wonder' : ''].filter(Boolean).join(', ');
    // header: the place is the title; who holds it is the subtitle
    $('sel-title').textContent = name || (isSea ? 'Open sea' : c ? 'Land of the ' + c.name : 'Unclaimed land'); $('sel-sw').style.background = c ? c.color : '#5b6779';
    $('sel-sub').textContent = c ? `${sim.level[i] ? lvl : 'Territory'}${c.capital === i ? ' · capital' : ''} of ${sim.fullName(c)}` : (isSea ? '' : 'Nobody lives here yet');
    $('sel-cell').innerHTML = `<span class="micro">Land</span><span>${terrainTxt}</span><span class="micro">Elevation</span><span class="num">${Math.round(hCell)} m</span>${isSea ? '' : `<span class="micro">People</span><span class="num">${fmtPop(sim.pop[i])} / ${fmtPop(sim.capacity(i, c))} fed</span>`}${sim.goods[i] && (knownGoods() & (1 << sim.goods[i])) ? `<span class="micro">Yields</span><span><span class="goodchips">${goodChip(sim.GOODS[sim.goods[i]])}</span></span>` : ''}${works ? `<span class="micro">Works</span><span>${works}</span>` : ''}`;
    renderBuild(i);
    if (!c) { $('sel-civ').hidden = true; scrollHint(); return; }
    $('sel-civ').hidden = false; $('sc-name').textContent = sim.fullName(c);
    $('sc-era').textContent = sim.ERAS[c.era][0]; $('sc-gov').textContent = c.gov + (c.player ? ' · yours' : '');
    const wars = Object.keys(c.wars).map(k => sim.civs[+k]).filter(Boolean).map(x => sim.fullName(x)).join(', ');
    $('sc-tiles').innerHTML = `<div class="tile"><span class="micro">People</span><span class="k">${fmtPop(sim.popOf[c.id])}</span><span class="d">${fmtInt(sim.cellsOf[c.id])} regions</span></div><div class="tile"><span class="micro">Strength</span><span class="k">${fmtInt(sim.strength(c))}</span><span class="d">${sim.year < c.army ? 'army raised' : 'no standing army'}</span></div><div class="tile"><span class="micro">Stability</span><span class="k ${c.stability < 0.3 ? 'neg' : c.stability < 0.5 ? 'warn' : ''}">${Math.round(c.stability * 100)}%</span><div class="bar"><i style="transform:scaleX(${c.stability.toFixed(2)});background:${c.stability > 0.5 ? 'var(--pos)' : c.stability > 0.3 ? 'var(--warn)' : 'var(--neg)'}"></i></div></div><div class="tile"><span class="micro">Knowledge</span><span class="k">${(c.tech * 100).toFixed(1)}%</span><div class="bar"><i style="transform:scaleX(${c.tech.toFixed(3)})"></i></div></div>`;
    renderRuler(c);
    const tr = c.trade || { own: 0, imp: 0, n: 0 }; const known = sim.ERA_MASKS[c.era]; const ownG = sim.goodsList(tr.own & known), impG = sim.goodsList(tr.imp & known);
    const tradeHtml = ownG.length || impG.length ? `<span class="goodchips">${ownG.map(g => goodChip(g)).join('')}${impG.map(g => goodChip(g, true)).join('')}</span><div class="hint" style="margin-top:3px">+${Math.round(Math.min(0.4, tr.n * 0.025) * (1 + Math.min(0.5, sim.markets[c.id] * 0.1)) * 100)}% income${(tr.own | tr.imp) & known & sim.LUXMASK ? ', luxuries steady the people' : ''}. Markets raise it; wars cut imports.</div>` : '<span class="hint">nothing yet</span>';
    $('sc-kv').innerHTML = `${c.capital !== i ? `<span class="micro">Capital</span><span>${esc(sim.cellName.get(c.capital) || '—')}</span>` : ''}<span class="micro">Faith</span><span>${esc(c.religion || 'none yet')}</span><span class="micro">Wars</span><span>${esc(wars || 'nobody')}</span><span class="micro">Trade</span><span>${tradeHtml}</span><span class="micro">Founded</span><span class="num">${sim.fmtYear(c.founded)}</span>`;
    const p = sim.playerCiv(); const acts = $('sc-actions');
    acts.innerHTML = (p && c !== p) ? `<button class="btn ${sim.isAtWar(p, c.id) ? '' : 'danger'}" id="btn-war">${sim.isAtWar(p, c.id) ? 'Offer peace' : 'Declare war'}</button>` : '';
    const bw = $('btn-war'); if (bw) bw.addEventListener('click', () => { sim.playerWar(c.id); if (sim.isAtWar(sim.playerCiv(), c.id)) seen.wars.add(c.id); world.refreshTextures(); refreshAll(true); });
    $('policy').hidden = !c.player;
    updateOutliner();
    $('sc-events').innerHTML = eventsHtml(c.events, 25);
    if (chronicleCiv !== c.id) { $('chronicle').textContent = ''; chronicleCiv = c.id; }
    scrollHint();
  }
  // fade the bottom of the inspector while there is more to scroll to
  const pbodyEl = document.querySelector('#left .pbody');
  function scrollHint() { requestAnimationFrame(() => pbodyEl.classList.toggle('more', pbodyEl.scrollTop + pbodyEl.clientHeight < pbodyEl.scrollHeight - 2)); }
  pbodyEl.addEventListener('scroll', scrollHint, { passive: true }); window.addEventListener('resize', scrollHint);
  function eventsHtml(list, n) { return list.slice(-n).reverse().map(e => `<div><b>${sim.fmtYear(e.year)}</b><span>${esc(e.text)}</span></div>`).join(''); }
  let portraitKey = '';
  function renderRuler(c) {
    const r = c.ruler; if (!r) { $('sc-ruler').hidden = true; return; } $('sc-ruler').hidden = false;
    const T = sim.TRAITS[r.trait]; const reign = sim.year - r.since; const age = reign + 22 + ((r.seed || 0) % 24);
    const key = `${c.id}:${r.seed}:${c.era}:${Math.floor(age / 10)}:${c.color}`;
    if (key !== portraitKey) { portraitKey = key; if (window.PORTRAIT) PORTRAIT.draw($('sc-portrait'), { seed: r.seed || (r.name.length * 7919), culture: TOWN.CULTURES[TOWN.civCulture(sim, c)], era: c.era, fem: !!r.fem, trait: r.trait, color: c.color, age }); }
    $('sc-ruler-name').textContent = `${r.title} ${r.name}`;
    $('sc-ruler-sub').textContent = `${T ? T.label : 'Ruler'} · ${reign < 1 ? 'new to the throne' : reign + ' year' + (reign === 1 ? '' : 's') + ' on the throne'}`;
    $('sc-ruler-trait').innerHTML = T ? `<b>${esc(T.label)}.</b> ${esc(T.desc)}` : '';
  }
  function openRealm() { const c = sim.playerCiv(); if (!c) { toast('No realm yet'); return; } select(c.capital); $('policy').open = true; }
  function openCity() { const c = sim.playerCiv(); if (!c) { toast('No realm yet'); return; } const i = selected >= 0 && sim.owner[selected] === c.id && sim.level[selected] ? selected : c.capital; select(i); const [lon, lat] = placeOf(i); if (GEO.distKm(lon, lat, mapcam.lon, mapcam.lat) > 40 || mapcam.dist > viewDist(i) * 3) mapcam.flyTo(lon, lat, viewDist(i), { duration: 1.6 }); setTimeout(() => $('sel-build').scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); }

  // ---------- right rail: outliner + feed ----------
  function updateOutliner() {
    const c = sim.playerCiv(); const host = $('ol-body'); const sect = $('sc-towns-sect');
    if (!c || selectedCiv !== c.id) { sect.hidden = true; return; }
    sect.hidden = false;
    const cells = sim.settlementsOf(c.id).filter(i => sim.level[i] >= 2 || i === c.capital).slice(0, 14);
    const wars = Object.keys(c.wars).map(k => sim.civs[+k]).filter(Boolean);
    let html = '';
    if (wars.length) html += '<div class="micro" style="padding:2px 6px 4px;color:var(--mil)">At war with</div>';
    for (const w of wars) html += `<div class="ol war" data-cell="${w.capital}"><span class="t">⚔ ${esc(sim.fullName(w))}</span><span class="s">strength ${fmtInt(sim.strengthOf[w.id])}</span></div>`;
    if (wars.length && cells.length) html += '<div class="micro" style="padding:8px 6px 4px">Settlements</div>';
    for (const i of cells) html += `<div class="ol" data-cell="${i}"><span class="t">${i === c.capital ? '★ ' : ''}${esc(sim.cellName.get(i) || '')}</span><span class="s">${fmtPop(sim.pop[i])}</span></div>`;
    if (!cells.length) html += '<div class="hint" style="padding:4px 6px">Villages become towns as they grow; towns appear here.</div>';
    host.innerHTML = html;
    host.querySelectorAll('.ol').forEach(el => el.addEventListener('click', () => { const i = +el.dataset.cell; if (i >= 0) { const [lon, lat] = placeOf(i); mapcam.flyTo(lon, lat, Math.min(mapcam.dist, viewDist(i))); select(i); } }));
  }
  const FEED_ICON = { war: '<path d="M4 4l16 16M20 4L4 20"/>', ruler: '<path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z"/>', disaster: '<path d="M12 3l9 16H3z M12 9v5M12 16v1"/>', era: '<path d="M12 3l2.4 5.4 5.6.6-4.2 3.8 1.2 5.6L12 15.6 7 18.4l1.2-5.6L4 9l5.6-.6z"/>', faith: '<path d="M12 21c4 0 6-3 6-6 0-4-4-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8 0 3 2 6 6 6z"/>', state: '<path d="M4 20h16M6 20V9l6-5 6 5v11"/>', city: '<path d="M4 20h16M7 20V8h4v12M13 20v-7h4v7"/>' };
  function scoreEvent(e) { const base = { war: 3, era: 3, state: 2.2, disaster: 2, faith: 1.2, city: 1, ruler: 0.4 }[e.type] || 1; const c = e.civ >= 0 ? sim.civs[e.civ] : null; const size = c ? Math.min(2, sim.cellsOf[c.id] / 150) : 1; let near = 0; if (e.loc >= 0) { const [lon, lat] = cellCenter(e.loc); near = 1 - clamp(GEO.distKm(lon, lat, mapcam.lon, mapcam.lat) / 6000, 0, 1); } return base + size + near + (e.mine ? 10 : 0); }
  // continuous mode keeps a light live wire of the biggest events as toasts
  let feedIdx = 0, lastFeedAt = 0;
  function pumpFeed(now) {
    const ev = sim.worldEvents; if (ev.length < feedIdx) feedIdx = 0;
    while (feedIdx < ev.length) { const e = ev[feedIdx++]; if (settings.continuous && e.mine && (e.type === 'war' || e.type === 'era' || e.type === 'disaster') && now - lastFeedAt > 2500) { lastFeedAt = now; bigBanner(e.type === 'era' ? e.text.replace(/^.*enters the /, '') : e.text, sim.fmtYear(e.year), e.type === 'era' ? eraArt(sim.civs[e.civ] ? sim.civs[e.civ].era : 0) : e.type === 'war' ? artOf('ev_war') : ''); } }
  }

  // ---------- notifications ----------
  let bannerT = 0;
  function toast(msg) { if (!msg) return; const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('tc').appendChild(t); setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, 2600); }
  function bigBanner(title, sub, art) { const now = performance.now(); if (now - bannerT < 4500) return; bannerT = now; const t = document.createElement('div'); t.className = 'toast big' + (art ? ' art' : ''); if (art) t.style.backgroundImage = `linear-gradient(to right, rgb(8 11 18 / 0.92), rgb(8 11 18 / 0.55) 40%, rgb(8 11 18 / 0.55) 60%, rgb(8 11 18 / 0.92)), url("${art}")`; t.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`; $('tc').appendChild(t); setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 420); }, art ? 5200 : 4000); }
  // ---------- generated art and materials ----------
  const TEX_URL = window.GENESIS_TEX_URL || 'data/tex/atlas.json';
  const artOf = (key) => (window.TEX && TEX.art(key)) || '';
  const eraArt = (era) => artOf('era' + Math.max(0, Math.min(8, era | 0)));
  function reportArt(reason, events) {
    if (reason === 'era') { const c = sim.playerCiv(); return eraArt(c ? c.era : 0); }
    if (reason === 'war') return artOf('ev_war');
    if (reason === 'disaster') { const txt = (events || []).filter(e => e.type === 'disaster').map(e => e.text).join(' ').toLowerCase(); const k = /erupt|volcan|lava|ash/.test(txt) ? 'ev_volcano' : /flood|river|rains/.test(txt) ? 'ev_flood' : /plague|pestilence|sickness|disease/.test(txt) ? 'ev_plague' : /comet|sky|star/.test(txt) ? 'ev_comet' : /famine|drought|harvest|hunger/.test(txt) ? 'ev_famine' : 'ev_flood'; return artOf(k); }
    return '';
  }
  function applyArt() {
    if (!window.TEX || !TEX.ui) return;
    const hero = artOf('hero'); if (hero) $('intro-art').style.backgroundImage = `url("${hero}")`;
    document.body.classList.add('has-art');
    if (selected >= 0) renderBuild(selected);
  }
  function applyTextures() {
    if (!window.TEX) return; const on = settings.textures !== false && TEX.ready;
    if (on && TEX.misc && TEX.misc.shallows && TEX.misc.shallows.image && globals.uDet.value && globals.uDet.value.image.depth < 5) buildDetArray(TEX.misc.shallows.image);
    if (world) world.setTextures(TEX, on); if (terrain) terrain.setTextures(TEX, on);
  }
  function banner(msg, cancel) { const b = $('banner'); if (msg) { $('bannertext').textContent = msg; b.hidden = false; $('bannercancel').hidden = !cancel; } else b.hidden = true; }

  // ---------- dock ----------
  const ICONS = {
    mine: '<path d="M4 20l9-9M11 4c3-1 7 0 9 3M9 6c-1 3 0 7 3 9"/><path d="M13 11l1-1"/>',
    settle: '<path d="M6 21V4h10l-2 3 2 3H6"/>', develop: '<path d="M12 21V9M12 13c-3 0-5-2-5-5 3 0 5 2 5 5zm0-4c3 0 5-2 5-5-3 0-5 2-5 5z"/><path d="M4 21h16"/>', fortify: '<path d="M4 21V9h3V6h3v3h4V6h3v3h3v12z"/><path d="M10 21v-5h4v5"/>', port: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13c0 4 3 7 7 7s7-3 7-7M3 13h4M17 13h4"/>', academy: '<path d="M4 21h16M6 21V10M10 21V10M14 21V10M18 21V10M3 10l9-6 9 6z"/>', temple: '<path d="M12 21c4 0 6-3 6-6 0-4-4-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8 0 3 2 6 6 6z"/>', capital: '<path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z"/><path d="M4 21h16"/>', market: '<path d="M4 10l2-5h12l2 5M4 10h16v3H4zM6 13v8h12v-8M10 21v-5h4v5"/>', wonder: '<path d="M12 3l3 6 6 1-4.5 4.2 1.2 6.3L12 17.5 6.3 20.5l1.2-6.3L3 10l6-1z"/>', levy: '<path d="M12 3l8 3v6c0 5-3 8-8 9-5-1-8-4-8-9V6z"/><path d="M12 8v8M8 12h8"/>',
    spawn: '<circle cx="12" cy="6" r="3"/><path d="M5 21c0-5 3-8 7-8s7 3 7 8"/>', plague: '<path d="M12 3a7 7 0 0 0-7 7c0 3 2 5 3 6v4h8v-4c1-1 3-3 3-6a7 7 0 0 0-7-7z"/><circle cx="9.5" cy="10.5" r="1"/><circle cx="14.5" cy="10.5" r="1"/>', meteor: '<path d="M20 4l-9 9M20 4l-5 1M20 4l-1 5"/><circle cx="8" cy="16" r="4"/>', bounty: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>', prophet: '<path d="M12 3l2.7 6 6.3.6-4.8 4.3 1.5 6.4L12 17l-5.7 3.3 1.5-6.4L3 9.6l6.3-.6z"/>', enlighten: '<path d="M9 21h6M10 18h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  };
  const GODS = [
    { id: 'spawn', n: 'Spawn', tip: 'Drop a new people on empty land.' }, { id: 'plague', n: 'Plague', tip: 'A great dying, anywhere.' }, { id: 'meteor', n: 'Meteor', tip: 'Fire from the sky. Erases what it hits.' }, { id: 'bounty', n: 'Bounty', tip: 'Make land fertile.' }, { id: 'prophet', n: 'Prophet', tip: 'Found a religion in the state you click.' }, { id: 'enlighten', n: 'Enlighten', tip: 'Hand a state a burst of knowledge.' },
  ];
  function buildDock() {
    const mk = (t, god) => { const b = document.createElement('button'); b.className = 'dg' + (god ? ' god' : ''); b.dataset.tool = t.id; b.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[t.id]}</svg><span class="n">${t.n}</span><span class="c" id="cost-${t.id}"></span><span class="tip"><b>${t.n}</b>${t.tip}</span>`; b.addEventListener('click', () => setTool(t.id)); return b; };
    for (const t of GODS) $('dock-god').appendChild(mk(t, true));
  }
  function setTool(t) {
    tool = (tool === t) ? null : t;
    document.querySelectorAll('.dg').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    const names = { settle: 'Settle: click land touching your border', develop: 'Develop: click one of your cells', fortify: 'Fortify: click one of your cells', port: 'Port: click one of your coastal cells', academy: 'Academy: click one of your towns', temple: 'Temple: click one of your settlements', capital: 'Move capital: click one of your towns', market: 'Market: click one of your settlements', wonder: 'Wonder: click your capital', spawn: 'Spawn: click empty land', plague: 'Plague: click anywhere', meteor: 'Meteor: click anywhere', bounty: 'Bounty: click land', prophet: 'Prophet: click a state', enlighten: 'Enlighten: click a state' };
    if (tool) cancelPlacing();
    banner(tool ? names[tool] : null, !!tool); renderer.domElement.style.cursor = tool ? 'crosshair' : 'grab';
    $('l-expand').classList.toggle('on', tool === 'settle');
    if (tool && tool !== 'settle') { document.body.classList.add('dockopen'); $('l-build').classList.add('on'); }
  }
  function updateDock() {
    const c = sim.playerCiv();
    for (const t of GODS) { const b = document.querySelector(`.dg[data-tool="${t.id}"]`); if (!b) continue; b.disabled = !c; }
    if (selected >= 0 && !$('chron').open && !$('menu').open && !$('sel-build').hidden) renderBuild(selected);
  }

  // ---------- the city build panel: what a town can raise, and where ----------
  const BUILD_ORDER = ['farm', 'walls', 'port', 'market', 'temple', 'academy', 'mine', 'wonder', 'capital', 'levy'];
  const BUILD_ICON = (k) => ICONS[k] || ICONS[{ farm: 'develop', walls: 'fortify' }[k]] || ICONS.settle;
  let placing = null; // { kind, i } while the player chooses a plot
  function renderBuild(i) {
    const c = sim.playerCiv(); const host = $('sel-build'); const own = c && sim.owner[i] === c.id && sim.land[i] && sim.level[i] > 0;
    if (!own) { host.hidden = true; if (placing && placing.i === i) cancelPlacing(); return; }
    host.hidden = false; const grid = $('bgrid'); const B = sim.BUILD; const lvl = sim.level[i];
    $('bhead-note').textContent = `${sim.cellName.get(i) || ''} · treasury ${fmtInt(c.wealth)}`;
    let html = '';
    for (const k of BUILD_ORDER) {
      const b = B[k]; const why = sim.cannot(k, i); const cost = sim.costOf(k); const dur = sim.durOf(k, c.era); const prog = sim.inProgress(i, k);
      const poor = !why && c.wealth < cost; const dis = !!why || poor;
      const lvlTxt = k === 'farm' && sim.infra[i] ? ` · level ${sim.infra[i] + 1}` : k === 'walls' && sim.walls[i] ? ` · level ${sim.walls[i] + 1}` : '';
      const reason = prog ? `building · ${Math.max(0, prog.start + prog.dur - sim.year)} yrs left` : why ? why : poor ? `needs ${cost}` : '';
      const cardArt = artOf('card_' + k);
      html += `<button class="bq${prog ? ' building' : ''}${placing && placing.i === i && placing.kind === k ? ' on' : ''}${cardArt ? ' art' : ''}" data-kind="${k}" ${dis ? 'disabled' : ''} title="${esc(b.desc)}"${cardArt ? ` style="--art:url(&quot;${cardArt}&quot;)"` : ''}><svg viewBox="0 0 24 24">${BUILD_ICON(k)}</svg><span class="n">${esc(b.name)}${lvlTxt}</span><span class="m"><b>${cost}</b>${dur ? ` · ${dur} yr${dur === 1 ? '' : 's'}` : ''}</span>${reason ? `<span class="why">${esc(reason)}</span>` : ''}</button>`;
    }
    if (grid.dataset.html !== html) { grid.dataset.html = html; grid.innerHTML = html; grid.querySelectorAll('.bq').forEach(btn => btn.addEventListener('click', () => startBuild(btn.dataset.kind, i))); }
    const wl = sim.works.get(i) || []; const q = $('bqueue');
    const qh = wl.map(w => { const left = Math.max(0, w.start + w.dur - sim.year); const pr = clamp((sim.year - w.start) / w.dur, 0, 1); return `<div class="bw"><svg viewBox="0 0 24 24">${BUILD_ICON(w.k)}</svg><span class="t"><span>${esc(B[w.k].name)}${w.slot >= 0 ? ` · plot ${w.slot + 1}` : ''}</span><span class="bar"><i style="transform:scaleX(${pr.toFixed(3)})"></i></span></span><span class="y">${left} yr${left === 1 ? '' : 's'}</span></div>`; }).join('');
    if (q.dataset.html !== qh) { q.dataset.html = qh; q.innerHTML = qh; }
  }
  function startBuild(kind, i) {
    const c = sim.playerCiv(); if (!c) return; const why = sim.cannot(kind, i); if (why) { toast(why); return; }
    if (sim.BUILD[kind].slot) {
      if (placing && placing.kind === kind && placing.i === i) { cancelPlacing(); return; }
      placing = { kind, i }; banner(`Place the ${sim.BUILD[kind].name.toLowerCase()}: click a plot around ${sim.cellName.get(i) || 'the town'}`, true);
      const [lon, lat] = placeOf(i); if (GEO.distKm(lon, lat, mapcam.lon, mapcam.lat) > 30 || mapcam.dist > 0.02) mapcam.flyTo(lon, lat, Math.min(mapcam.dist, viewDist(i)), { duration: 1.2 });
      renderBuild(i); return;
    }
    const msg = sim.act(kind, i); toast(msg); afterAct();
  }
  function afterAct() { world.refreshTextures(); world.updateBuildings(mapcam, true); refreshAll(true); if (selected >= 0) updateInspector(true); }
  function cancelPlacing() { if (!placing) return; const i = placing.i; placing = null; banner(null); $('plots').textContent = ''; if (selected === i) renderBuild(i); }
  function placePlot(slot) {
    if (!placing) return; const { kind, i } = placing; const msg = sim.act(kind, i, slot); toast(msg); placing = null; banner(null); $('plots').textContent = ''; afterAct();
  }
  // plot markers follow the camera every frame while placing
  const plotEls = [];
  function updatePlots() {
    const host = $('plots');
    if (!placing || !sim) { if (host.childElementCount) host.textContent = ''; plotEls.length = 0; return; }
    const i = placing.i; const c = sim.playerCiv(); if (!c || sim.owner[i] !== c.id) { cancelPlacing(); return; }
    const L = TOWN.layout(sim, i, c, {}); const [sLon, sLat] = siteOf(i); const cl = Math.max(0.15, Math.cos(sLat * GEO.D2R));
    const taken = {}; for (const k of ['temple', 'academy', 'market', 'mine']) { const sl = sim.slotOf(i, k); if (sl >= 0) taken[sl] = k; } for (const w of (sim.works.get(i) || [])) if (w.slot >= 0) taken[w.slot] = w.k;
    if (plotEls.length !== L.plots.length) { host.textContent = ''; plotEls.length = 0; for (const pl of L.plots) { const el = document.createElement('div'); el.className = 'plot'; el.dataset.slot = pl.slot; el.addEventListener('click', (e) => { e.stopPropagation(); if (!el.classList.contains('used')) placePlot(+el.dataset.slot); }); host.appendChild(el); plotEls.push(el); } }
    for (let k = 0; k < L.plots.length; k++) {
      const pl = L.plots[k]; const el = plotEls[k]; const lon = sLon + pl.x / (6371000 * cl * GEO.D2R), lat = sLat + pl.z / (6371000 * GEO.D2R);
      const p = project(lon, lat, terrain.heightAt(lon, lat)); if (!p) { el.style.display = 'none'; continue; } el.style.display = '';
      const used = taken[pl.slot]; const sig = used || '+';
      if (el.dataset.sig !== sig) { el.dataset.sig = sig; el.classList.toggle('used', !!used); el.innerHTML = used ? `<svg viewBox="0 0 24 24">${BUILD_ICON(used)}</svg><span class="tipn">${esc(sim.BUILD[used].name)}</span>` : `+<span class="tipn">Plot ${pl.slot + 1}</span>`; }
      el.style.transform = `translate3d(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px,0)`; el.style.opacity = (0.5 + 0.5 * p[2]).toFixed(2);
    }
  }
  // the advisor points at a build: open the right town's panel and pulse the card
  function openBuildFor(kind) {
    const c = sim.playerCiv(); if (!c) return; const towns = sim.settlementsOf(c.id); let i = c.capital;
    const need = { academy: (j) => sim.level[j] >= 2 && !(sim.special[j] & 2), temple: (j) => !(sim.special[j] & 4), port: (j) => (sim.flags[j] & 4) && !(sim.special[j] & 1), market: (j) => !(sim.special[j] & 8), wonder: (j) => j === c.capital, farm: (j) => sim.infra[j] < 5, develop: (j) => sim.infra[j] < 5 }[kind];
    if (need) { const j = towns.find(need); if (j !== undefined) i = j; }
    if (kind === 'settle') { setTool('settle'); return; }
    select(i); const [lon, lat] = placeOf(i); mapcam.flyTo(lon, lat, Math.min(Math.max(mapcam.dist, viewDist(i) * 0.8), viewDist(i) * 2), { duration: 1.4 });
    setTimeout(() => { const btn = document.querySelector(`.bq[data-kind="${kind === 'develop' ? 'farm' : kind === 'fortify' ? 'walls' : kind}"]`); if (btn) { btn.classList.add('pulse'); btn.scrollIntoView({ block: 'nearest' }); } }, 80);
  }

  // ---------- minimap ----------
  const mm = $('minimap'), mmctx = mm.getContext('2d'); const mmBase = document.createElement('canvas'); mmBase.width = 440; mmBase.height = 220;
  let mmVersion = -1, mmSnap = null;
  function buildMinimapBase() {
    const ctx = mmBase.getContext('2d'); const img = ctx.createImageData(440, 220);
    for (let y = 0; y < 220; y++) for (let x = 0; x < 440; x++) { const sx = Math.floor(x / 440 * W), sy = Math.floor(y / 220 * H); const i = sy * W + sx; const o = (y * 440 + x) * 4; const land = worldData.land[i]; const ice = worldData.flags[i] & 8; if (land) { const f = worldData.fert[i]; img.data[o] = ice ? 200 : 60 + f * 30; img.data[o + 1] = ice ? 208 : 62 + f * 50; img.data[o + 2] = ice ? 216 : 52 + f * 20; } else { img.data[o] = 12; img.data[o + 1] = 22; img.data[o + 2] = 38; } img.data[o + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }
  function updateMinimap(force) {
    if (!sim) return;
    if (force || world.texVersion !== mmVersion || !mmSnap) {
      mmVersion = world.texVersion; mmctx.drawImage(mmBase, 0, 0);
      const img = mmctx.getImageData(0, 0, 440, 220); const d = img.data; const owner = sim.owner; const player = sim.player;
      for (let y = 0; y < 220; y++) for (let x = 0; x < 440; x++) { const i = Math.floor(y / 220 * H) * W + Math.floor(x / 440 * W); const o = owner[i]; if (o < 0) continue; const c = sim.civs[o]; if (!c) continue; const k = (y * 440 + x) * 4; const a = o === player ? 0.9 : 0.62; d[k] = d[k] * (1 - a) + c.rgb[0] * 255 * a; d[k + 1] = d[k + 1] * (1 - a) + c.rgb[1] * 255 * a; d[k + 2] = d[k + 2] * (1 - a) + c.rgb[2] * 255 * a; }
      mmctx.putImageData(img, 0, 0); mmSnap = mmctx.getImageData(0, 0, 440, 220);
    } else mmctx.putImageData(mmSnap, 0, 0);
    const x = (mapcam.lon + 180) / 360 * 440, y = (90 - mapcam.lat) / 180 * 220;
    const r = clamp(mapcam.dist * 2 * Math.tan(camera.fov * 0.5 * GEO.D2R) * 6371 / 40075 * 440, 3, 200);
    mmctx.strokeStyle = 'rgba(255,255,255,0.85)'; mmctx.lineWidth = 1.2; mmctx.beginPath(); mmctx.ellipse(x, y, Math.min(r * 1.35, 219), Math.min(r, 109), 0, 0, Math.PI * 2); mmctx.stroke();
    mmctx.fillStyle = '#fff'; mmctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    const c = sim.playerCiv(); if (c && c.capital >= 0) { const [clon, clat] = cellCenter(c.capital); const cx = (clon + 180) / 360 * 440, cy = (90 - clat) / 180 * 220; mmctx.strokeStyle = '#D6B25E'; mmctx.lineWidth = 1.5; mmctx.strokeRect(cx - 3, cy - 3, 6, 6); }
  }
  mm.addEventListener('click', (e) => { const r = mm.getBoundingClientRect(); const lon = (e.clientX - r.left) / r.width * 360 - 180, lat = 90 - (e.clientY - r.top) / r.height * 180; mapcam.flyTo(lon, lat, mapcam.dist, { duration: 1.6 }); });

  // ---------- labels ----------
  const labelLayer = $('labels'); const labelEls = new Map(); const labelState = new Map();
  const _pv = new THREE.Vector3();
  function project(lon, lat, h) {
    const v = GEO.toVec(lon, lat, _pv).multiplyScalar(1 + (h * terrain.exag) / GEO.R_M);
    const cp = camera.position; const rP = v.length(), rC = cp.length();
    const cosA = Math.max(-1, Math.min(1, v.dot(cp) / (rP * rC)));
    const ang = Math.acos(cosA), lim = Math.acos(1 / rC) + Math.acos(1 / rP);
    if (ang > lim - 0.004) return null;
    v.project(camera); if (v.z > 1 || v.z < -1) return null;
    const r = stage.getBoundingClientRect(); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height, 1 - clamp((ang - lim * 0.8) / (lim * 0.2), 0, 1)];
  }
  let labelTick = 0; const hudRects = []; let hudRectsT = 0;
  function updateLabels() {
    if (!view.labels || !sim || mode === 'intro') { if (labelEls.size) { for (const el of labelEls.values()) el.remove(); labelEls.clear(); labelState.clear(); } return; }
    if (++labelTick % 3 !== 0) return;
    const altKm = mapcam.alt * 6371; const cands = []; const player = sim.player;
    if (altKm > 250 && altKm < 9000) {
      const list = []; for (const [id, ct] of world.centroids) { const c = sim.civs[id]; if (!c || ct.n < 4) continue; list.push([id, ct]); }
      list.sort((a, b) => b[1].n - a[1].n);
      list.forEach(([id, ct], rank) => {
        const c = sim.civs[id]; if (altKm > 4000 && rank >= 8 && !c.player) return; if (ct.n < 12 && altKm > 1500) return;
        const len = Math.hypot(ct.x, ct.y, ct.z) || 1; const v = new THREE.Vector3(ct.x / len, ct.y / len, ct.z / len); let [lon, lat] = GEO.fromVec(v);
        const cc = cellOf(lon, lat); if (sim.owner[cc] !== id && c.capital >= 0) [lon, lat] = cellCenter(c.capital);
        const size = clamp(13 + Math.log2(ct.n + 1) * 1.6, 14, 24) * settings.uiScale;
        cands.push({ id: 'r' + id, cls: 'realm' + (c.player ? ' mine' : ''), text: c.player ? c.name : sim.fullName(c).replace(/^the /, ''), lon, lat, h: 0, size, pri: 1000 + ct.n + (c.player ? 1e6 : 0), color: c.color });
      });
    }
    if (altKm < 4500) {
      const rad = Math.round(clamp(mapcam.dist * 220, 6, 140)); const cy0 = Math.floor((90 - mapcam.lat) / 180 * H), cx0 = Math.floor((mapcam.lon + 180) / 360 * W);
      const minLvl = altKm > 1200 ? 4 : altKm > 300 ? 3 : altKm > 60 ? 2 : 1;
      for (let dy = -rad; dy <= rad; dy++) { const y = cy0 + dy; if (y < 0 || y >= H) continue; const cl = Math.max(0.15, Math.cos((90 - (y + 0.5) / H * 180) * GEO.D2R)); const rx = Math.ceil(rad / cl);
        for (let dx = -rx; dx <= rx; dx++) { const x = ((cx0 + dx) % W + W) % W; const i = y * W + x; const lvl = sim.level[i]; if (!lvl) continue; const o = sim.owner[i]; const c = o >= 0 ? sim.civs[o] : null; if (!c) continue; const cap = c.capital === i; const mine = o === player;
          if (lvl < minLvl && !(cap && altKm < 4000 && (sim.cellsOf[o] > 40 || mine)) && !(mine && altKm < 400 && lvl >= minLvl - 1)) continue;
          const [lon, lat] = siteOf(i);
          let sub = ''; if (mine && altKm < 400) { const wl = sim.works.get(i); if (wl && wl.length) { const w = wl[0]; sub = `${sim.BUILD[w.k].name} · ${Math.max(0, w.start + w.dur - sim.year)} yrs${wl.length > 1 ? ` +${wl.length - 1}` : ''}`; } }
          cands.push({ id: 'c' + i, cls: 'city' + (cap ? ' cap' : '') + (lvl < 2 ? ' town' : '') + (mine ? ' mine' : ''), text: sim.cellName.get(i) || '', sub, lon, lat, h: terrain.heightAt(lon, lat), size: (cap ? 14 : lvl >= 3 ? 13 : 12) * settings.uiScale, pri: (cap ? 60 : 0) + lvl * 12 + (mine ? 40 : 0) + Math.min(20, sim.pop[i] * 0.01) }); } }
    }
    if (altKm < 320 && sim.goods) { // what the land yields, once close enough to see the country (nearest first, icons only from high up)
      const rad = Math.round(clamp(mapcam.dist * 220, 4, 14)); const cy0 = Math.floor((90 - mapcam.lat) / 180 * H), cx0 = Math.floor((mapcam.lon + 180) / 360 * W);
      const pc = sim.playerCiv(); const known = sim.ERA_MASKS[pc ? pc.era : 8]; const gs = [];
      for (let dy = -rad; dy <= rad; dy++) { const y = cy0 + dy; if (y < 0 || y >= H) continue; const cl = Math.max(0.15, Math.cos((90 - (y + 0.5) / H * 180) * GEO.D2R)); const rx = Math.ceil(rad / cl);
        for (let dx = -rx; dx <= rx; dx++) { const x = ((cx0 + dx) % W + W) % W; const i = y * W + x; const gk = sim.goods[i]; if (!gk || !(known & (1 << gk))) continue; gs.push([dx * dx * cl * cl + dy * dy, i, gk]); } }
      gs.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < gs.length && k < 60; k++) { const [, i, gk] = gs[k]; const g = sim.GOODS[gk]; const [lon, lat] = cellCenter(i);
        cands.push({ id: 'g' + i, cls: 'good ' + g.kind, icon: g.key, text: altKm < 45 ? g.name : '', lon, lat, h: terrain.heightAt(lon, lat), size: 10 * settings.uiScale, pri: 3 + (sim.owner[i] === player ? 1 : 0) + (g.kind === 'strategic' || g.kind === 'luxury' ? 1 : 0) }); }
    }
    if (altKm < 400 && sim.ruins && sim.ruins.size) { for (const [i, ru] of sim.ruins) { const [lon, lat] = cellCenter(i); if (GEO.distKm(lon, lat, mapcam.lon, mapcam.lat) > altKm * 2.5 + 40) continue; if (!ru.wonder && altKm > 150) continue; cands.push({ id: 'u' + i, cls: 'ruin', text: (ru.wonder ? 'Ruins of the wonder of ' : 'Ruins of ') + (ru.name || 'a lost town'), lon, lat, h: terrain.heightAt(lon, lat), size: 11 * settings.uiScale, pri: ru.wonder ? 30 : 5 }); } }
    cands.sort((a, b) => b.pri - a.pri);
    const r = stage.getBoundingClientRect(); const GRID = 32; const cols = Math.ceil((r.width + 200) / GRID), rows = Math.ceil((r.height + 200) / GRID); const occ = new Uint8Array(cols * rows);
    // HUD panels reserve their cells so labels never sit under the interface
    if (labelTick % 30 === 0 || !hudRects.length || performance.now() - hudRectsT > 1500) { hudRectsT = performance.now(); hudRects.length = 0; for (const id of ['tl', 'tr', 'left', 'right', 'bl', 'bc', 'report', 'advisor', 'turn', 'mapwrap']) { const el = $(id); if (!el || (id === 'left' && !el.classList.contains('open'))) continue; const b = el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) hudRects.push([b.left - r.left, b.top - r.top, b.right - r.left, b.bottom - r.top]); } }
    for (const [x0, y0, x1, y1] of hudRects) { const gx0 = Math.max(0, Math.floor((x0 + 100) / GRID)), gx1 = Math.min(cols - 1, Math.floor((x1 + 100) / GRID)), gy0 = Math.max(0, Math.floor((y0 + 100) / GRID)), gy1 = Math.min(rows - 1, Math.floor((y1 + 100) / GRID)); for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) occ[gy * cols + gx] = 1; }
    const placedIds = new Set(); let n = 0; let nProjNull = 0, nBlocked = 0;
    for (const c of cands) {
      if (n >= 140) break; const p = project(c.lon, c.lat, c.h); if (!p) { nProjNull++; continue; }
      const w = Math.max(c.text.length, c.sub ? c.sub.length * 0.8 : 0) * c.size * (c.cls.startsWith('realm') ? 0.95 : 0.6) + (c.icon ? 26 : 18), h = c.icon ? Math.max(20, c.size * 1.8) : c.size * (c.sub ? 2.6 : 1.6); if ((c.cls === 'ruin' || c.icon) && n > 100) continue;
      const lift = c.cls.startsWith('city') ? -Math.round(c.size * (altKm < 60 ? 1.6 : 0.9)) : 0; const x0 = p[0] - w / 2 + 100, y0 = p[1] + lift - h / 2 + 100;
      const gx0 = Math.max(0, Math.floor(x0 / GRID)), gx1 = Math.min(cols - 1, Math.floor((x0 + w) / GRID)), gy0 = Math.max(0, Math.floor(y0 / GRID)), gy1 = Math.min(rows - 1, Math.floor((y0 + h) / GRID));
      let free = true; for (let gy = gy0; gy <= gy1 && free; gy++) for (let gx = gx0; gx <= gx1; gx++) if (occ[gy * cols + gx]) { free = false; break; }
      let st = labelState.get(c.id); if (!st) { st = { hits: 0, shown: false }; labelState.set(c.id, st); }
      if (!free) { nBlocked++; if (st.shown) { st.hits--; if (st.hits <= -2) { st.shown = false; st.hits = 0; continue; } } else { st.hits = 0; continue; } }
      else st.hits = Math.min(3, st.hits + 1);
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) occ[gy * cols + gx] = 1;
      n++; placedIds.add(c.id);
      let el = labelEls.get(c.id); if (!el) { el = document.createElement('div'); labelLayer.appendChild(el); labelEls.set(c.id, el); el.dataset.id = c.id; }
      if (st.hits >= 2) st.shown = true;
      el.className = 'lbl ' + c.cls + (st.shown ? ' show' : '');
      if (c.icon) { const sig = c.icon + '|' + c.text; if (el.dataset.sig !== sig) { el.dataset.sig = sig; el.innerHTML = goodSvg(c.icon) + (c.text ? `<span>${esc(c.text)}</span>` : ''); } } else if (c.sub !== undefined) { const sig = c.text + '|' + c.sub; if (el.dataset.sig !== sig) { el.dataset.sig = sig; el.innerHTML = esc(c.text) + (c.sub ? `<span class="sub">${esc(c.sub)}</span>` : ''); } } else if (el.textContent !== c.text) el.textContent = c.text;
      el.style.transform = `translate3d(${p[0].toFixed(1)}px,${(p[1] + lift).toFixed(1)}px,0) translate(-50%,-50%)`; el.style.fontSize = c.size + 'px';
      el.style.opacity = st.shown ? (0.92 * p[2]).toFixed(2) : '0';
      if (c.color) el.style.color = lighten(c.color);
    }
    for (const [id, el] of labelEls) { if (!placedIds.has(id)) { const st = labelState.get(id); if (st) { st.shown = false; st.hits = 0; } el.remove(); labelEls.delete(id); } }
    labelDbg = { altKm: Math.round(altKm), cands: cands.length, placed: n, offscreen: nProjNull, blocked: nBlocked, hud: hudRects.map(r => r.map(Math.round).join(',')) };
  }
  let labelDbg = null;
  function lighten(rgb) { const m = rgb.match(/\d+/g); if (!m) return '#fff'; const [r, g, b] = m.map(Number); return `rgb(${Math.round(r * 0.5 + 255 * 0.5)},${Math.round(g * 0.5 + 255 * 0.5)},${Math.round(b * 0.5 + 255 * 0.5)})`; }

  // ---------- chronicle screen ----------
  const LOGF = [['all', 'All'], ['mine', 'Mine'], ['war', 'Wars'], ['state', 'States'], ['era', 'Eras'], ['faith', 'Faith'], ['disaster', 'Disasters'], ['ruler', 'Rulers']];
  let logFilter = 'all';
  function openChronicle(tab) {
    const dlg = $('chron'); if (!dlg.open) dlg.showModal();
    $('logfilters').innerHTML = LOGF.map(([k, l]) => `<button class="btn ${logFilter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('');
    $('logfilters').querySelectorAll('.btn').forEach(b => b.addEventListener('click', () => { logFilter = b.dataset.f; openChronicle('log'); }));
    setCTab(tab || 'log');
    $('chron-sub').textContent = `${sim.fmtYear(-10000)} → ${sim.fmtYear(sim.year)}`;
    const ev = sim.worldEvents.filter(e => logFilter === 'all' || (logFilter === 'mine' ? e.mine : e.type === logFilter)).slice(-300).reverse();
    $('log').innerHTML = ev.map((e, k) => `<div class="fe ${e.type}${e.mine ? ' mine' : ''}" data-k="${k}"><svg viewBox="0 0 24 24">${FEED_ICON[e.type] || FEED_ICON.city}</svg><div><span class="y">${sim.fmtYear(e.year)}</span>${esc(e.text)}</div></div>`).join('') || '<div class="hint">Nothing recorded yet.</div>';
    $('log').querySelectorAll('.fe').forEach(el => el.addEventListener('click', () => { const e = ev[+el.dataset.k]; if (e && e.loc >= 0) { dlg.close(); const [lon, lat] = placeOf(e.loc); mapcam.flyTo(lon, lat, Math.min(Math.max(mapcam.dist, 0.02), 0.2)); select(e.loc); } }));
    const living = sim.civs.filter(c => c).sort((a, b) => sim.popOf[b.id] - sim.popOf[a.id]).slice(0, 16); const top = living.length ? sim.popOf[living[0].id] : 1;
    $('powers').innerHTML = living.map((c, k) => `<div class="pw" data-c="${c.id}"><i style="background:${c.color}"></i><span>${k + 1}. ${esc(sim.fullName(c))}${c.player ? ' <span class="micro" style="color:var(--gold)">yours</span>' : ''} <span class="micro" style="color:var(--text-3)">${sim.ERAS[c.era][0]}</span></span><span class="num">${fmtPop(sim.popOf[c.id])}</span><span class="num" style="color:var(--text-3)">${fmtInt(sim.cellsOf[c.id])} rg</span><div class="bar"><i style="transform:scaleX(${(sim.popOf[c.id] / top).toFixed(3)});background:${c.color}"></i></div></div>`).join('') || '<div class="hint">No states yet.</div>';
    $('powers').querySelectorAll('.pw').forEach(el => el.addEventListener('click', () => { const c = sim.civs[+el.dataset.c]; if (c && c.capital >= 0) { dlg.close(); const [lon, lat] = placeOf(c.capital); mapcam.flyTo(lon, lat, 0.12); select(c.capital); } }));
    drawGraphs();
    const pc = sim.playerCiv(); const hist = sim.history; const rank = pc ? living.indexOf(pc) + 1 : 0;
    let biggest = null, bp = 0; for (let k = 0; k < sim.LI.length; k++) { const i = sim.LI[k]; if (sim.pop[i] > bp && sim.level[i]) { bp = sim.pop[i]; biggest = i; } }
    let wars = 0; for (const c of sim.civs) if (c) wars += Object.keys(c.wars).length; wars /= 2;
    let best = 0; for (const c of sim.civs) if (c && c.tech > best) best = c.tech;
    const last = hist.length ? hist[hist.length - 1] : null;
    const st = [['World age', fmtInt(sim.year + 10000) + ' years'], ['People on Earth', last ? fmtPop(last.pop + last.wild) : '—'], ['Living states', sim.st.civCount], ['Wars under way', wars], ['Frontier', sim.ERAS[sim.eraOf(best)][0]], ['Largest state', living[0] ? sim.fullName(living[0]) : '—'], ['Largest city', biggest !== null ? `${sim.cellName.get(biggest)} · ${fmtPop(bp)}` : '—'], ['Your rank', rank ? `${rank} of ${living.length}` : '—']];
    $('stats').innerHTML = st.map(([k, v]) => `<div class="tile"><span class="micro">${k}</span><span class="k" style="font-size:var(--fs-body)">${esc(String(v))}</span></div>`).join('');
  }
  function setCTab(t) { document.querySelectorAll('#chron .tabs button').forEach(b => b.classList.toggle('on', b.dataset.ctab === t)); document.querySelectorAll('#chron [data-cpane]').forEach(p => { p.hidden = p.dataset.cpane !== t; }); if (t === 'graphs') requestAnimationFrame(drawGraphs); }
  function drawGraphs() {
    const hist = sim.history; if (!hist.length) return;
    const setup = (cv) => { const r = cv.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return null; cv.width = r.width * dpr; cv.height = r.height * dpr; const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, r.width, r.height); return { ctx, w: r.width, h: r.height }; };
    const years = hist.map(h => h.year); const y0 = years[0], y1 = Math.max(years[years.length - 1], y0 + 100);
    const axes = (g, maxV, log) => { const { ctx, w, h } = g; ctx.font = '11px Noto Sans, sans-serif'; ctx.fillStyle = 'rgba(236,233,226,0.45)'; ctx.strokeStyle = 'rgba(255,255,255,0.08)'; const L = 48, R = 10, T = 12, B = 22; const X = (yr) => L + (yr - y0) / (y1 - y0) * (w - L - R); const Y = (v) => { const t = log ? Math.log10(v + 1) / Math.log10(maxV + 1) : v / maxV; return T + (1 - clamp(t, 0, 1)) * (h - T - B); }; for (let k = 0; k <= 4; k++) { const yy = T + k / 4 * (h - T - B); ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(w - R, yy); ctx.stroke(); const v = log ? Math.pow(10, Math.log10(maxV + 1) * (1 - k / 4)) - 1 : maxV * (1 - k / 4); ctx.fillText(fmtPop(v), 2, yy + 4); } for (let yr = Math.ceil(y0 / 2000) * 2000; yr <= y1; yr += 2000) { const x = X(yr); ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, h - B); ctx.stroke(); ctx.fillText(yr < 0 ? Math.abs(yr) + ' BC' : yr + ' AD', x - 18, h - 6); } return { X, Y }; };
    const line = (g, pts, color, width) => { const { ctx } = g; ctx.strokeStyle = color; ctx.lineWidth = width || 1.6; ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); };
    const g1 = setup($('g-world')); if (g1) { const maxP = Math.max(1, ...hist.map(h => h.pop + h.wild)); const { X, Y } = axes(g1, maxP, true); line(g1, hist.map(h => [X(h.year), Y(h.pop + h.wild)]), '#7BD36B', 2); const maxC = Math.max(1, ...hist.map(h => h.civs)); const Yc = (v) => 12 + (1 - v / maxC) * (g1.h - 34); line(g1, hist.map(h => [X(h.year), Yc(h.civs)]), '#5DA9F5', 1.4); g1.ctx.fillStyle = '#7BD36B'; g1.ctx.fillText('people (log)', g1.w - 150, 20); g1.ctx.fillStyle = '#5DA9F5'; g1.ctx.fillText(`states (max ${maxC})`, g1.w - 150, 34); }
    const g2 = setup($('g-civs')); if (g2) { const last = hist[hist.length - 1]; const ids = last.top.slice(0, 8).map(t => t[0]); const pc = sim.playerCiv(); if (pc && !ids.includes(pc.id)) ids.push(pc.id); let maxP = 1; for (const h of hist) for (const t of h.top) if (ids.includes(t[0])) maxP = Math.max(maxP, t[1]); const { X, Y } = axes(g2, maxP, false); ids.forEach((id, k) => { const c = sim.civs[id]; if (!c) return; const segs = []; let cur = []; for (const h of hist) { const t = h.top.find(t => t[0] === id); if (t) cur.push([X(h.year), Y(t[1])]); else if (cur.length) { segs.push(cur); cur = []; } } if (cur.length) segs.push(cur); for (const s of segs) line(g2, s, c.color, c.player ? 2.6 : 1.5); g2.ctx.fillStyle = c.color; g2.ctx.fillText((c.player ? '★ ' : '') + sim.fullName(c), g2.w - 190, 20 + k * 14); }); }
  }

  // ---------- chronicle (Claude) ----------
  let sampleFn = null, chronCtl = null;
  async function writeChronicle() {
    if (!sim || selectedCiv < 0 || !sim.civs[selectedCiv]) return;
    const c = sim.civs[selectedCiv]; const out = $('chronicle');
    const facts = [`State: ${sim.fullName(c)} (people called the ${c.name}). Founded ${sim.fmtYear(c.founded)}; it is now ${sim.fmtYear(sim.year)}.`, `Era: ${sim.ERAS[c.era][0]}. Government: ${c.gov}. Capital: ${sim.cellName.get(c.capital) || 'unknown'} at ${sim.describeCell(c.capital)}. Population ${fmtPop(sim.popOf[c.id])}, territory ${sim.cellsOf[c.id]} regions, stability ${Math.round(c.stability * 100)}%.`, `Faith: ${c.religion || 'none'}. Current ruler: ${c.ruler.title} ${c.ruler.name} (since ${sim.fmtYear(c.ruler.since)}). Earlier rulers: ${c.rulers.slice(-8, -1).map(r => r.title + ' ' + r.name).join(', ') || 'lost to memory'}.`, `At war with: ${Object.keys(c.wars).map(k => sim.civs[+k]).filter(Boolean).map(x => sim.fullName(x)).join(', ') || 'nobody'}.`, `Recorded events (oldest first):\n${c.events.slice(-40).map(e => `${sim.fmtYear(e.year)}: ${e.text}`).join('\n')}`].join('\n');
    if (!sampleFn) { out.textContent = facts; return; }
    const prompt = `You are the court chronicler of a simulated world called Genesis, which runs on the real Earth from 10,000 BC. Write the history of one state in about 220 words, as a vivid, concrete chronicle: name the rulers, the wars, the faith, the era transitions, what the land is like where its capital stands (use the coordinates to place it on the real Earth and name the real region, river or mountains). Do not invent events that contradict the record, but you may colour them. Plain prose, two or three paragraphs, no headings, no bullet points, no preamble.\n\nRECORD:\n${facts}`;
    chronCtl = new AbortController(); out.textContent = 'The chronicler is thinking…'; $('btn-chronicle').disabled = true; $('btn-chronicle-stop').hidden = false;
    try { const r = await sampleFn(prompt, { signal: chronCtl.signal, onText: ({ text }) => { out.textContent = text; }, cache: false }); out.textContent = r.text; }
    catch (e) { const msg = { not_granted: 'Chronicles need permission to ask Claude; showing the raw record instead.', rate_limited: 'Too many requests right now. Try again in a moment.', cancelled: '' }[e && e.code]; out.textContent = (e && e.text) ? e.text : (msg === undefined ? facts : msg || facts); if (e && e.code === 'not_granted') sampleFn = null; }
    finally { $('btn-chronicle').disabled = false; $('btn-chronicle-stop').hidden = true; }
  }

  // ---------- settings ----------
  function loadSettings() { try { Object.assign(settings, JSON.parse(localStorage.getItem('genesis-settings') || '{}')); } catch (e) {} applySettings(); }
  function applySettings() { document.body.classList.toggle('continuous', !!settings.continuous); globals.uQuality.value = settings.quality === 'high' ? 1 : 0; if (trees) trees.enabled = settings.quality === 'high'; if (movers) movers.enabled = settings.quality === 'high'; if (fx) fx.enabled = true; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.quality === 'high' ? 2 : 1.25)); if (window.MODELS) MODELS.lodBias = renderer.getPixelRatio();   /* model detail is chosen by device pixels */ document.documentElement.style.setProperty('--ui-scale', settings.uiScale); document.body.classList.toggle('glass', !!settings.glass && !matchMedia('(pointer: coarse)').matches); if (mapcam) mapcam.autoTilt = settings.autoTilt; if (window.TEX && TEX.ready) applyTextures(); try { localStorage.setItem('genesis-settings', JSON.stringify(settings)); } catch (e) {} }

  // ---------- UI binding ----------
  function bindUI() {
    $('btn-pause').addEventListener('click', () => { paused = !paused; updateClock(); updateTurnButton(); });
    $('btn-slower').addEventListener('click', () => setSpeedIdx(speedIdx - 1)); $('btn-faster').addEventListener('click', () => setSpeedIdx(speedIdx + 1));
    $('turn').addEventListener('click', onTurnClick);
    attachTip($('turn'), () => { if (!sim || !sim.playerCiv()) return ''; if (turnRun.active) return '<b>Time is running</b>Click to stop early.'; const q = computeAttention(); if (q.length) return `<b>${esc(q[0].t1)}</b>${esc(q[0].body || q[0].t2)}<div class="hint">Click to deal with it${q.length > 1 ? `; ${q.length - 1} more after this` : ''}.</div>`; const c = sim.playerCiv(); const next = sim.ERAS[c.era + 1]; return `<b>Advance ${turnLength()} years</b>To ${sim.fmtYear(sim.year + turnLength())}. The world moves while you watch, and stops if war, revolt or a new era needs you.<div class="hint">${next ? `Ring: ${next[0]} at ${next[1] * 100}% knowledge (now ${(c.tech * 100).toFixed(1)}%).` : ''}</div>`; });
    $('advisor').addEventListener('click', () => { const av = $('advisor'); const t = av.dataset.tool; if (av.dataset.ack) seen.ack.add(av.dataset.ack); if (av.dataset.att) { const q = computeAttention(); if (q.length) q[0].act(); updateTurnButton(); return; } if (av.dataset.go) { const i = +av.dataset.go; const [lon, lat] = placeOf(i); mapcam.flyTo(lon, lat, viewDist(i)); select(i); updateTurnButton(); return; } if (!t) { onTurnClick(); return; } openBuildFor(t); });
    $('report-close').addEventListener('click', () => { $('report').hidden = true; }); $('report-open').addEventListener('click', () => openChronicle('log'));
    $('l-build').addEventListener('click', () => { const on = document.body.classList.toggle('dockopen'); $('l-build').classList.toggle('on', on); if (!on) deselectTool(); });
    $('l-expand').addEventListener('click', () => setTool('settle'));
    $('l-city').addEventListener('click', () => openCity());
    $('lensbtn').addEventListener('click', () => { $('lensmenu').hidden = !$('lensmenu').hidden; });
    $('opt-continuous').checked = settings.continuous; $('opt-continuous').addEventListener('change', (e) => { settings.continuous = e.target.checked; if (turnRun.active) endTurn('stopped'); paused = true; applySettings(); updateTurnButton(); updateClock(); });
    attachTip($('date'), () => `<b>${sim.fmtYear(sim.year)}</b>${fmtInt(sim.year + 10000)} years since the first spring.`);
    document.querySelectorAll('.stance').forEach(b => b.addEventListener('click', () => { const c = sim && sim.playerCiv(); if (!c) return; c.policy.stance = b.dataset.stance; document.querySelectorAll('.stance').forEach(x => x.classList.toggle('on', x === b)); }));
    for (const k of ['research', 'military', 'tax']) { const inp = $('pol-' + k); inp.addEventListener('input', () => { $('pol-' + k + '-v').textContent = (+inp.value).toFixed(1); const c = sim && sim.playerCiv(); if (c) c.policy[k] = +inp.value; }); }
    $('btn-rename').addEventListener('click', () => { sim.renamePlayer($('in-name').value); refreshAll(true); });
    $('btn-menu').addEventListener('click', () => openMenu());
    $('m-close').addEventListener('click', () => $('menu').close()); $('m-resume').addEventListener('click', () => $('menu').close());
    $('m-save').addEventListener('click', () => { saveLocal(true); $('menu').close(); }); $('m-load').addEventListener('click', () => { if (loadLocal()) $('menu').close(); });
    $('m-new').addEventListener('click', () => { $('menu').close(); newWorld((Math.random() * 2 ** 31) | 0); setMode('intro'); $('intro').hidden = false; mapcam.locked = true; mapcam.idleSpin = true; mapcam.tDist = 2.7; mapcam.tTilt = 0; mapcam.autoTilt = settings.autoTilt; world.updateBuildings(mapcam, true); });
    $('ui-scale').value = settings.uiScale; $('ui-scale-v').textContent = settings.uiScale.toFixed(2); $('ui-scale').addEventListener('input', (e) => { settings.uiScale = +e.target.value; $('ui-scale-v').textContent = settings.uiScale.toFixed(2); applySettings(); });
    $('tip-delay').value = settings.tipDelay; $('tip-delay-v').textContent = settings.tipDelay; $('tip-delay').addEventListener('input', (e) => { settings.tipDelay = +e.target.value; $('tip-delay-v').textContent = settings.tipDelay; applySettings(); });
    $('opt-glass').checked = settings.glass; $('opt-glass').addEventListener('change', (e) => { settings.glass = e.target.checked; applySettings(); });
    $('opt-autotilt').checked = settings.autoTilt; $('opt-autotilt').addEventListener('change', (e) => { settings.autoTilt = e.target.checked; applySettings(); });
    $('opt-textures').checked = settings.textures !== false; $('opt-textures').addEventListener('change', (e) => { settings.textures = e.target.checked; applySettings(); });
    $('opt-quality').value = settings.quality; $('opt-quality').addEventListener('change', (e) => { settings.quality = e.target.value; settings.qualityPinned = true; applySettings(); });
    $('btn-choose').addEventListener('click', chooseMode); $('btn-random').addEventListener('click', () => { mapcam.locked = false; randomStart(); }); $('btn-load').addEventListener('click', () => loadLocal());
    $('found-ok').addEventListener('click', () => { if (!pendingFound) return; const { hit, i } = pendingFound; const y = (i / W) | 0, x = i - y * W; const su = clamp((hit.lon + 180) / 360 * W - x, 0.02, 0.98), sv = clamp((90 - hit.lat) / 180 * H - y, 0.02, 0.98); $('found').hidden = true; setSoil(false); startPlayer(i, $('found-name').value.trim(), [su, sv], true); pendingFound = null; });
    $('found-cancel').addEventListener('click', () => { $('found').hidden = true; pendingFound = null; });
    $('bannercancel').addEventListener('click', () => { if (tool) setTool(null); else if (mode === 'choose') { setMode('intro'); $('intro').hidden = false; banner(null); mapcam.locked = true; mapcam.idleSpin = true; setSoil(false); } });
    $('btn-close').addEventListener('click', deselect);
    $('btn-fly').addEventListener('click', () => { if (selected < 0) return; const [lon, lat] = placeOf(selected); mapcam.flyTo(lon, lat, Math.min(mapcam.dist, viewDist(selected)), { duration: 1.8 }); });
    $('l-chronicle').addEventListener('click', () => openChronicle('log')); $('l-empire').addEventListener('click', () => openRealm());
    $('chron-close').addEventListener('click', () => $('chron').close());
    document.querySelectorAll('#chron .tabs button').forEach(b => b.addEventListener('click', () => setCTab(b.dataset.ctab)));
    $('v-pol').addEventListener('click', () => { view.political = !view.political; globals.uPolitical.value = view.political ? 1 : 0; $('v-pol').classList.toggle('on', view.political); });
    $('v-soil').addEventListener('click', () => setSoil(!view.soil));
    $('v-clouds').addEventListener('click', () => { view.clouds = !view.clouds; world.cloudsOn = view.clouds; $('v-clouds').classList.toggle('on', view.clouds); });
    $('v-labels').addEventListener('click', () => { view.labels = !view.labels; $('v-labels').classList.toggle('on', view.labels); });
    $('northbtn').addEventListener('click', () => { mapcam.tHeading = 0; }); $('topbtn').addEventListener('click', () => { mapcam.tTilt = 0; mapcam.autoTilt = false; });
    $('homebtn').addEventListener('click', goHome); $('orbitbtn').addEventListener('click', () => { mapcam.flyTo(mapcam.lon, mapcam.lat, 2.6, { tilt: 0, heading: 0, duration: 2 }); mapcam.autoTilt = settings.autoTilt; });
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' || e.key === 'Enter') { if ($('chron').open || $('menu').open) return; e.preventDefault(); onTurnClick(); }
      else if (e.key === '+' || e.key === '=') { if (settings.continuous) setSpeedIdx(speedIdx + 1); } else if (e.key === '-' || e.key === '_') { if (settings.continuous) setSpeedIdx(speedIdx - 1); }
      else if (e.key === 'b' || e.key === 'B') { if (mode === 'play') openCity(); } else if (e.key === 'g' || e.key === 'G') $('l-build').click(); else if (e.key === 'r' || e.key === 'R') { if (mode === 'play') openRealm(); } else if (e.key === 'c' || e.key === 'C') { if (mode === 'play') openChronicle('log'); }
      else if (e.key === 'Escape') { if (mapcam.fly) mapcam.fly = null; else if (placing) cancelPlacing(); else if (tool) setTool(null); else if (!$('found').hidden) { $('found').hidden = true; pendingFound = null; } else if ($('chron').open) $('chron').close(); else if ($('menu').open) $('menu').close(); else if (!$('lensmenu').hidden) $('lensmenu').hidden = true; else if (document.body.classList.contains('dockopen')) $('l-build').click(); else if (selected >= 0) deselect(); else if (mode === 'play') openMenu(); }
      else if (e.key === '`') { const d = $('debug'); d.style.display = d.style.display === 'block' ? 'none' : 'block'; }
      else if (e.key === 'p' || e.key === 'P') $('v-pol').click(); else if (e.key === 'l' || e.key === 'L') $('v-labels').click();
      else if (e.key === 'n' || e.key === 'N') mapcam.tHeading = 0; else if (e.key === 'u' || e.key === 'U') { mapcam.tTilt = 0; mapcam.autoTilt = false; }
      else if (e.key === 'h' || e.key === 'H') goHome(); else if (e.key === 'F9') { e.preventDefault(); document.body.classList.toggle('hidehud'); }
    });
    $('btn-chronicle').addEventListener('click', writeChronicle); $('btn-chronicle-stop').addEventListener('click', () => { if (chronCtl) chronCtl.abort(); });
    let compassIdle = 0; const wake = () => { $('compass').classList.remove('idle'); clearTimeout(compassIdle); compassIdle = setTimeout(() => $('compass').classList.add('idle'), 3000); }; renderer.domElement.addEventListener('pointermove', wake); renderer.domElement.addEventListener('wheel', wake, { passive: true }); wake();
    // labels are pointer-transparent except for double-click fly-to
    labelLayer.addEventListener('dblclick', (e) => { const el = e.target.closest('.lbl'); if (!el) return; const id = el.dataset.id; if (id[0] === 'c') { const i = +id.slice(1); const [lon, lat] = placeOf(i); mapcam.flyTo(lon, lat, viewDist(i)); select(i); } else { const c = sim.civs[+id.slice(1)]; if (c && c.capital >= 0) { const [lon, lat] = placeOf(c.capital); mapcam.flyTo(lon, lat, 0.15); select(c.capital); } } });
  }
  function goHome() { const c = sim.playerCiv(); if (!c || c.capital < 0) { toast('No capital yet'); return; } const [lon, lat] = placeOf(c.capital); mapcam.flyTo(lon, lat, viewDist(c.capital), { duration: 2 }); select(c.capital); }
  function openMenu() { $('m-info').textContent = `Tiles ${terrain.stats.tiles} · imagery packs ${terrain.stats.packsI} · elevation packs ${terrain.stats.packsE} · buildings ${world.buildingCount}`; $('menu').showModal(); }
  function refreshAll(force) { updateEconomy(); updateTurnButton(); updateClock(); updateDock(); if (selected >= 0) { updateInspector(force); updateOutliner(); } updateMinimap(force); }

  // ---------- persistence ----------
  const SAVE_KEY = 'genesis-save-v2';
  function saveLocal(announce) {
    if (!sim || mode !== 'play') { if (announce) toast('Nothing to save yet'); return; }
    try { const s = sim.save(); s.cam = { lon: mapcam.lon, lat: mapcam.lat, dist: mapcam.dist, tilt: mapcam.tilt, heading: mapcam.heading }; localStorage.setItem(SAVE_KEY, JSON.stringify(s)); if (announce) toast('World saved to this browser'); } catch (e) { if (announce) toast('Could not save here (storage blocked or full)'); }
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(SAVE_KEY); if (!raw) { toast('No saved world in this browser'); return false; }
      const s = JSON.parse(raw); sim = createSim(worldData, s.seed || 1); sim.load(s); world.setSim(sim);
      setMode('play'); $('intro').hidden = true; banner(null); mapcam.locked = false; mapcam.idleSpin = false; paused = true;
      if (s.cam) { mapcam.tLon = mapcam.lon = s.cam.lon; mapcam.tLat = mapcam.lat = s.cam.lat; mapcam.tDist = mapcam.dist = s.cam.dist; mapcam.tTilt = mapcam.tilt = s.cam.tilt; mapcam.tHeading = mapcam.heading = s.cam.heading; }
      feedIdx = sim.worldEvents.length; seen.wars.clear(); seen.ack.clear(); seen.era = -1; seen.turns = 1; turnRun.active = false; turnRun.townSet = null; turnRun.capital = -1; paused = true; snapshotTurn(); refreshAll(true); world.updateBuildings(mapcam, true);
      toast(`Welcome back. It is ${sim.fmtYear(sim.year)}.`); return true;
    } catch (e) { console.warn('save could not be read', e); toast('The saved world could not be read'); return false; }
  }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  setInterval(() => saveLocal(false), 60000);

  // ---------- loop ----------
  let last = performance.now(), acc = 0, texAge = 0, uiAge = 0, tpsCount = 0, tpsT = 0, sunAngle = 0.6, mmT = 0, olT = 0, seasonPhase = 0.45;
  let frameEMA = 16, playSince = 0, autoQualityDone = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    // auto graphics: if the first seconds of play run slowly, drop to Balanced once (the menu can put it back)
    frameEMA += (dt * 1000 - frameEMA) * 0.05;
    if (mode === 'play' && !autoQualityDone) { if (!playSince) playSince = now; else if (now - playSince > 5000) { autoQualityDone = true; if (frameEMA > 34 && settings.quality === 'high' && !settings.qualityPinned) { settings.quality = 'balanced'; $('opt-quality').value = 'balanced'; applySettings(); toast('Graphics set to Balanced for smoother flying (Menu › Graphics to change)'); } } }
    const modalOpen = $('chron').open || $('menu').open;
    mapcam.update(dt);
    // seasons: one year every four minutes of real time; the sun's declination swings with it and the ground follows
    seasonPhase = (seasonPhase + dt / 240) % 1; const decl = -0.4 * Math.cos(seasonPhase * Math.PI * 2);
    { const wN = 0.5 + 0.5 * Math.cos(seasonPhase * Math.PI * 2); const gauss = (x, c) => Math.exp(-Math.pow(((x - c + 1.5) % 1) - 0.5, 2) / 0.006); globals.uSeason.value.set(wN, gauss(seasonPhase, 0.82), 1 - wN, gauss(seasonPhase, 0.32)); if (trees) trees.season = globals.uSeason.value; }
    if (!window.__sunLock) { sunAngle += dt * 0.012; const cd = Math.sqrt(1 - decl * decl); globals.uSun.value.set(Math.cos(sunAngle) * cd, decl, Math.sin(sunAngle) * cd).normalize(); }
    globals.uTime.value = now / 1000; globals.uCamAlt.value = mapcam.alt;
    const sp = speed();
    if (sim && mode === 'play' && sp > 0) {
      acc += sp * dt; const t0 = performance.now(); let n = 0;
      while (acc >= 1 && performance.now() - t0 < (turnRun.active ? 22 : 12)) { sim.tick(); acc -= 1; n++; tpsCount++; }
      if (acc > 5) acc = 5; texAge += n; uiAge += n;
      if (texAge >= 3 && n > 0) { world.refreshTextures(); texAge = 0; }
      if (uiAge >= 4) { updateEconomy(); updateClock(); updateDock(); updateTurnButton(); if (selected >= 0 && !modalOpen) updateInspector(false); uiAge = 0; }
      if (turnRun.active) { checkInterrupts(); if (turnRun.active && sim.year >= turnRun.target) endTurn(''); }
    }
    if (sim && mode === 'play') pumpFeed(now);
    terrain.dispOn = settings.quality === 'high' && mapcam.alt < 0.06;
    terrain.update(camera, stage.clientHeight);
    if (decal) decal.update(mapcam, sim, now, sim ? sim.year + ':' + world.texVersion : 0, globals.uSun.value, world, trees);
    if (trees) trees.update(mapcam, sim, now);
    if (life && mode === 'play') life.update(mapcam, sim, now, world.bUniforms.uDay.value, stage.clientHeight, camera.fov);
    const day = world.updateSky(mapcam, globals.uSun.value, now / 1000);
    if (movers && mode === 'play') movers.update(mapcam, sim, decal, now, dt, world.bUniforms.uDay.value, stage.clientHeight, camera.fov);
    if (fx && mode === 'play') { fx.update(mapcam, sim, now, dt, world.bUniforms.uDay.value, stage.clientHeight, camera.fov); if (fx.shake > 0.001) { const a = fx.shake * fx.shake * mapcam.dist * 0.02; camera.position.x += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a; camera.position.z += (Math.random() - 0.5) * a; camera.updateMatrixWorld(); } }
    if (world.cloudTex && globals.uClouds.value !== world.cloudTex) globals.uClouds.value = world.cloudTex;
    globals.uCloudShift.value = world.cloudShift; globals.uCloudVis.value = world.cloudVis;
    world.updateBuildings(mapcam, false);
    // sun shadows: a depth map of what stands around the point the camera looks at, pushed a little way down the view
    if (window.SHADOWS && SHADOWS.ready) {
      if (mapcam.alt < 0.03 && settings.quality === 'high') {
        const f = GEO.enu(mapcam.lon, mapcam.lat); const hC = Math.max(0, terrain.heightAt(mapcam.lon, mapcam.lat));
        const half = clamp(mapcam.dist * 2.2, 250 / GEO.R_M, 9000 / GEO.R_M);
        const c = _shC.copy(f.up).multiplyScalar(1 + hC * terrain.exag / GEO.R_M).addScaledVector(f.north, Math.cos(mapcam.heading) * half * 0.4 * Math.min(1, mapcam.tilt)).addScaledVector(f.east, Math.sin(mapcam.heading) * half * 0.4 * Math.min(1, mapcam.tilt));
        SHADOWS.enabled = true;
        SHADOWS.update(renderer, scene, camera, c, half, globals.uSun.value, f.up, world.castersVersion + ':' + (trees ? trees.castersVersion : 0) + ':' + (window.MODELS ? MODELS.stats.loaded : 0), day);
      } else SHADOWS.uniforms.uShadowP.value.x = 0;
    }
    const low = clamp(1 - mapcam.alt / 0.05, 0, 1) * day;
    renderer.setClearColor(new THREE.Color(0.02 + 0.5 * low, 0.027 + 0.62 * low, 0.047 + 0.85 * low), 1);
    updateLabels(); updatePlots();
    if (now - mmT > 700) { mmT = now; updateMinimap(false); }
    tpsT += dt; if (tpsT > 1) { $('yps').textContent = tpsCount + ' yr/s'; tpsCount = 0; tpsT = 0; const d = $('debug'); if (d.style.display === 'block') d.textContent = `elev ${JSON.stringify(terrain.stats.elevLevels)} tiles ${terrain.stats.tiles} sse ${terrain.stats.sse | 0} packs i${terrain.stats.packsI} e${terrain.stats.packsE} loading ${terrain.stats.loading} buildings ${world.buildingCount} trees ${trees ? trees.count : 0} labels ${labelEls.size} movers ${movers ? movers.stats.agents + '/' + movers.stats.walkers + '/' + movers.stats.ships : 0} alt ${(mapcam.alt * 6371).toFixed(1)}km dist ${(mapcam.dist * 6371).toFixed(1)}km tilt ${(mapcam.tilt * 57.3).toFixed(0)}`; }
    if (!modalOpen || (now | 0) % 6 === 0) renderer.render(scene, camera);
  }
  boot();
})();
