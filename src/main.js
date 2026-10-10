// Holocene main: boot, home screen, game flow, HUD, labels, minimap, chronicle, updates, loop.
(function () {
  const $ = (id) => document.getElementById(id);
  const W = 720, H = 360, N = W * H;
  const esc = (s) => String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  // trade goods: their glyphs and chips are the market screen's (market.js)
  const goodSvg = MARKET.svg, goodChip = MARKET.chip;
  const knowsCell = (i) => { if (!sim || !sim.goods[i] || (sim.iced && sim.iced(i))) return false;      /* (nothing is yielded under the ice sheets: climate.js) */ const pc = sim.playerCiv(); return pc ? pc.era >= sim.gera[i] : true; };      // what your age understands of the land
  const fmtPop = (k) => { const p = k * 1000; return p >= 1e9 ? (p / 1e9).toFixed(2) + ' bn' : p >= 1e6 ? (p / 1e6).toFixed(1) + ' m' : p >= 1e3 ? Math.round(p / 1e3) + ' k' : String(Math.round(p)); };
  const fmtInt = (n) => Math.round(n).toLocaleString();
  const fmtSigned = (n, d = 1) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(d);
  // population deltas arrive in thousands; show them in the unit that reads best
  const fmtDeltaK = (dk) => { const a = Math.abs(dk); const s = dk >= 0 ? '+' : '−'; return a >= 1000 ? s + (a / 1000).toFixed(1) + ' m' : a >= 10 ? s + Math.round(a) + ' k' : a >= 1 ? s + a.toFixed(1) + ' k' : s + Math.round(a * 1000); };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  const SPEEDS = [1, 3, 10, 30, 100, 300, 1000];

  // ---------- state ----------
  let sim = null, terrain = null, world = null, mapcam = null, decal = null, trees = null, life = null, movers = null, fx = null, troops = null;
  let mode = 'intro', tool = null, speedIdx = 3, paused = true, selected = -1, selectedCiv = -1, hoverCell = -1, pendingFound = null;
  // turn system: the world stands still between presses of the big button
  const turnRun = { active: false, start: 0, target: 0, evIdx: 0, capital: -1, wars: '', era: 0, towns: 0, townSet: null, reason: '' };
  const seen = { wars: new Set(), era: -1, ack: new Set(), turns: 0 };
  const view = { political: true, soil: false, clouds: true, labels: true, trade: false, gov: false, rel: false, ppl: false, fth: false, ren: false, sick: false, hrv: false };
  const settings = { uiScale: 1, tipDelay: 300, glass: false, autoTilt: true, quality: 'high', continuous: false, textures: true, stories: true };
  const worldData = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N), soil: null };
  const TURN_YEARS = RULE.PACE;      // a turn, by age (200 years in the Stone Age down to 5): about a discovery, or a reform, to a turn at history's pace; a hundred and seventy turns from the first fields to the present
  const speed = () => settings.continuous ? (paused ? 0 : SPEEDS[speedIdx]) : (turnRun.active ? 600 : 0);
  // The home screen: the Earth stands large and runs off the right and the bottom of the picture, the edge of night
  // keeps its place while the planet turns under it (the way it really turns: dusk travels west), and the list has the left.
  const HOME = { dist: 1.02, cx: 0.8, cy: 0.76, lat: 10, spin: -0.3, sun: [-0.9, 0.36, 0.0] };
  let homeK = 1, sunEase = 0;      // how far the picture is shifted for the home screen (1) or centred (0); seconds of easing left for the sun
  function frameHome() {
    const w = stage.clientWidth, h = stage.clientHeight; const wide = w > 900;
    const cx = Math.min(0.92, Math.max(HOME.cx, (430 + 0.72 * h) / w));      // (in a small window the planet moves right, clear of the list)
    if (homeK < 0.002) camera.clearViewOffset(); else camera.setViewOffset(w, h, -w * (wide ? cx - 0.5 : 0.1) * homeK, -h * (wide ? HOME.cy - 0.5 : 0.3) * homeK, w, h);
  }
  function setMode(m) {
    const was = mode; mode = m; document.body.dataset.mode = m;
    frameHome(); camera.updateProjectionMatrix();
    globals.uPolitical.value = m === 'intro' ? 0 : (view.political ? 1 : 0); globals.uLens.value = m === 'intro' ? 0 : (view.gov || view.rel ? 1 : 0);
    if ((was === 'intro') !== (m === 'intro')) { sunEase = 2.5; if (m !== 'intro' && mapcam) sunFor(mapcam.tLon); }      // leaving the home screen: morning where the camera is
    renderUpdate();
  }
  // mid-morning at this longitude (the sun stands over the meridian 32 degrees to its east)
  function sunFor(lon) { sunAngle = -(lon + 32) * Math.PI / 180; }

  // ---------- renderer ----------
  const stage = $('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  const msaa = (() => { try { const gl = renderer.getContext(); return !!gl.getContextAttributes().antialias && gl.getParameter(gl.SAMPLES) > 1; } catch (e) { return false; } })();      // (whether the window itself is drawn with several samples a pixel)
  // a browser drawing in software (the test harness) gets a lighter load: a quarter of the pixels, no shadow map, thinner forests, coarser models
  let softGL = false; try { const gl = renderer.getContext(); const x = gl.getExtension('WEBGL_debug_renderer_info'); softGL = /SwiftShader|llvmpipe|Software/i.test(String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))); } catch (e) {}
  if (window.SHADOWS && (window.GENESIS_SHADOW || !softGL)) SHADOWS.init(renderer, window.GENESIS_SHADOW || 4096);      // the sun's depth map, 4096 texels across (a software renderer goes without unless asked)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // what a frame goes through after the scene is drawn: shade, glow, the developing (post.js). A software renderer goes without unless asked.
  const postOk = !!window.POST && (window.GENESIS_POST || !softGL) && POST.init(renderer); if (postOk && window.GENESIS_POST && typeof window.GENESIS_POST === 'object') Object.assign(POST, window.GENESIS_POST);
  // how finely textures are filtered where the ground runs away from the eye: all the card can do (16 taps on an Apple GPU); a software renderer pays for every tap and keeps what it had
  const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4; const ANISO = softGL ? Math.min(8, maxAniso) : maxAniso; window.GENESIS_ANISO = ANISO;      // (models.js and textures.js read it)
  // The ground's shader looks into the noise fifteen times a pixel and into the photographs of detail sixteen, and at sixteen ways each
  // that was a fifth of the frame in a view to the horizon, for a difference nobody can find in the picture (they only vary what the
  // ground's own pictures show): they get by with two ways and four. The ground's own pictures and the roads keep all the card can do.
  const ANISO_NOISE = softGL ? 4 : Math.min(2, maxAniso), ANISO_SMALL = softGL ? 4 : Math.min(4, maxAniso);
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  renderer.setClearColor(0x05070c, 1);
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, stage.clientWidth / stage.clientHeight, 1e-5, 20);
  let resizeT = 0; const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(() => { renderer.setSize(stage.clientWidth, stage.clientHeight); camera.aspect = stage.clientWidth / stage.clientHeight; setMode(mode); }, 60); };
  window.addEventListener('resize', onResize); if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

  const GND_PX = 600;      // (how many pixels across a repeat of the ground's materials is laid, on a screen of one device pixel to a pixel)
  const globals = {
    uSun: { value: new THREE.Vector3(1, 0.3, 0.2).normalize() }, uTime: { value: 0 }, uCamAlt: { value: 1 }, uDayMix: { value: 1 },
    uOwner: { value: null }, uPal: { value: null }, uSim: { value: null }, uInfo: { value: null }, uNoise: { value: null },
    uDetA: { value: null }, uDetB: { value: null }, uDetC: { value: null }, uDetD: { value: null }, uDet: { value: null },
    uSimRes: { value: new THREE.Vector2(W, H) }, uSel: { value: new THREE.Vector2(-9, -9) }, uHover: { value: new THREE.Vector2(-9, -9) },
    uFertView: { value: 0 }, uPolitical: { value: 1 }, uLens: { value: 0 }, uLabelsOn: { value: 1 },
    uClouds: { value: null }, uCloudShift: { value: 0 }, uCloudVis: { value: 0 }, uCloudNear: { value: 0 },
    uDecal: { value: null }, uDecalRect: { value: new THREE.Vector4(0, 0, 0, 0) }, uDecalOn: { value: 0 }, uQuality: { value: 1 }, uDecal2: { value: null }, uWaterN: { value: null },
    uSeason: { value: new THREE.Vector4(1, 0, 0, 0) }, uBare: { value: new THREE.Vector4(0, 0, 0, 0) }, uIceCold: { value: new THREE.Vector4(1, 0, 1, 0) },
    uGround: { value: null }, uLanduse: { value: null }, uShallows: { value: null }, uTexMix: { value: 0 },   // generated ground textures (textures.js)
    // the ground's materials (textures.js: TEX.ground), laid at a ladder of sizes in a frame of cells a metre and a half across at the equator
    uGnd: { value: null }, uGndN: { value: null }, uGndShal: { value: 20 }, uGndFar: { value: new Float32Array(24) }, uGndFarD: { value: new Float32Array(48) }, uGndFarN: { value: 512 }, uGndMean: { value: new Float32Array(75).fill(0.5) }, uLadK: { value: 6371000 / 1.5 }, uGndK: { value: new THREE.Vector4(1, 1, 0.4, GND_PX) }, uGndT: { value: new THREE.Vector4(1, 1, 0.25, 3) }, uWaterK: { value: new THREE.Vector4(1, 1, 1, 1) }, uSkyR: { value: new Float32Array(45).fill(0.3) }, uSeaK: { value: new THREE.Vector4(1, 1, 1, 0) }, uGndShow: { value: -1 }, uGndV: { value: 1 }, uWild: { value: 1 }, uGndDbg: { value: 0 }, uGndFine: { value: new THREE.Vector3(0.75, 0.6, 2.25) }, uGndCls: { value: new Float32Array(24) },      // uGndK: how strong the relief, how much of the materials is shown, how far the repeats are bent, pixels to a repeat; uGndT: how far a material's brightness follows the photograph of the Earth (0..1), and its hue (a factor), how wide the span in which one step of the ladder gives way to the next (0.1: a patchwork of the two; 0.25 and more: they lie over each other), how ragged its edge; uGndShow: one layer everywhere (to look at it), or -1; uGndV: how much the ground varies from stretch to stretch (lusher, drier); uGndDbg: parts left out, to measure them (terrain.js); uGndFine: how many steps of the ladder lower the fine kinds of ground stand: at the closest, how fast that grows with height, at the most (uGndCls: which they are, from textures.js)
    uGlow: { value: 0 },      // 1 while the picture goes through post.js, which can hold light brighter than white and lets it bleed
    // the weather (climate.js, terrain.js): the ice sheets as they stand (the middle as a unit vector, the square of the angular
    // radius; the long way as a unit vector, how long), how green each region of the dry lands is, the deepest droughts (the same,
    // and how deep), how much colder than our own day the age is
    uDome: { value: new Float32Array(4 * (window.CLIMATE ? CLIMATE.ND : 1)) }, uDomeA: { value: new Float32Array(4 * (window.CLIMATE ? CLIMATE.ND : 1)).fill(1) }, uGreenS: { value: new THREE.Vector4(0, 0, 0, 0) }, uDryC: { value: new Float32Array(4 * (window.CLIMATE ? CLIMATE.MAXV : 1)) }, uDryS: { value: new Float32Array(window.CLIMATE ? CLIMATE.MAXV : 1) }, uChill: { value: 0 },
  };
  if (window.SHADOWS) Object.assign(globals, SHADOWS.uniforms);     // the sun's depth map (shadows.js): the same uniform objects everywhere
  if (window.AIR) { Object.assign(globals, AIR.uniforms); if (softGL) AIR.steps = window.GENESIS_AIR || 0.4; }      // the air (air.js); a software renderer takes fewer steps through it

  // ---------- loading ----------
  function setLoad(pct, step) { $('loadbar').style.transform = `scaleX(${pct / 100})`; if (step) $('loadstep').textContent = step; }
  // The bytes of a picture exactly as its file has them (w x h: made that size if it is another). Through the card, not a 2D
  // canvas: a canvas keeps colour multiplied by its alpha and gives nothing back where alpha is nought, and info.png's alpha is
  // how dry the country is - the deserts would lose their winters.
  async function pixelsOf(url, w, h) {
    const r = await fetch(url); if (!r.ok) throw new Error('http ' + r.status + ' ' + url);
    let bmp = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    if (bmp.width !== w || bmp.height !== h) { const b2 = await createImageBitmap(bmp, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); if (bmp.close) bmp.close(); bmp = b2; }
    const gl = renderer.getContext(), tex = gl.createTexture(), fb = gl.createFramebuffer(), out = new Uint8Array(w * h * 4);
    try {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('the card will not read a picture back');
      gl.pixelStorei(gl.PACK_ALIGNMENT, 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    } finally { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindTexture(gl.TEXTURE_2D, null); gl.deleteFramebuffer(fb); gl.deleteTexture(tex); if (bmp.close) bmp.close(); renderer.resetState(); }
    return out;
  }
  // The planet's own maps as one texture of two layers (a fragment shader has sixteen textures on an Apple GPU, and the ground's
  // has them all): info.png (the sea's shelf, the ice, how hard the winters are, how dry the country is: tools/climate/build.py)
  // and under it veg.jpg, what grows there by nature (how green, how light, how warm-coloured: the map the trees are planted
  // by), at info's size, with snow.png in its alpha and its green (where snow lies in winter and where the sea freezes, as
  // the Earth has it; the map's own green, how light the country is by nature, is not used by the shader). Where that cannot
  // be made, info.png alone, as it was.
  async function planetMaps() {
    const W = 2048, H = 1024;
    try {
      if (!renderer.capabilities.isWebGL2 || !THREE.DataTexture2DArray) throw new Error('no texture arrays');
      const [a, b, c] = [await pixelsOf('data/info.png', W, H), await pixelsOf('data/veg.jpg', W, H), await pixelsOf('data/snow.png', W, H)], data = new Uint8Array(W * H * 8); data.set(a, 0); data.set(b, W * H * 4);
      for (let i = 0, o = W * H * 4 + 3; i < W * H; i++, o += 4) { data[o] = c[i * 4]; data[o - 2] = c[i * 4 + 1]; }      // (the second layer's alpha: for how much of its winter snow lies there; its green, which the map of what grows has no use for here: for how much of it the sea is ice - tools/planet/snow.py)
      const t = new THREE.DataTexture2DArray(data, W, H, 2); t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
      return t;
    } catch (e) { console.warn('the planet\'s maps as one texture: ' + e.message + '; info.png alone'); const t = await loadTex('data/info.png', { flipY: false }); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; }
  }
  function loadTex(url, opts = {}) {
    return new Promise((res) => { new THREE.TextureLoader().load(url, (t) => { t.wrapS = t.wrapT = opts.mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping; t.anisotropy = opts.aniso || ANISO_SMALL; if (opts.flipY === false) t.flipY = false; res(t); }, undefined, () => { console.warn('texture missing', url); res(null); }); });
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
      arr.minFilter = THREE.LinearMipmapLinearFilter; arr.magFilter = THREE.LinearFilter; arr.generateMipmaps = true; arr.anisotropy = ANISO_SMALL; arr.needsUpdate = true;
      const old = globals.uDet.value; globals.uDet.value = arr; if (old) old.dispose();
    } catch (e) { console.warn('detail array unavailable', e); }
  }
  const _shC = new THREE.Vector3(), _sun = new THREE.Vector3();
  function loadImageData(url) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(im, 0, 0); res(ctx.getImageData(0, 0, im.width, im.height)); }; im.onerror = () => rej(new Error('failed ' + url)); im.src = url; });
  }
  async function boot() {
    try {
      loadSettings(); setMode('intro'); homeInit();
      setLoad(6, 'terrain index');
      const index = await (await fetch('data/index.json')).json();
      // (the water's edge: fetched with the art, not kept in the repository; without it the coasts are the picture's own)
      let water = null; try { const r = await fetch('data/w/index.json'); if (r.ok) water = await r.json(); } catch (e) { water = null; }
      // (the picture of the Earth: fetched likewise, tools/planet/fetch.mjs; its own list says what packs it has)
      let img = null; try { const r = await fetch('data/i/index.json'); if (r.ok) img = await r.json(); } catch (e) { img = null; }
      // (and the heights, likewise: tools/planet/heights.py; without them the old packs of data/e serve)
      let heights = null; try { const r = await fetch('data/h/index.json'); if (r.ok) heights = await r.json(); } catch (e) { heights = null; }
      setLoad(14, 'surface data');
      const [info, noise, detA, detB, detC, detD, waterN] = await Promise.all([planetMaps(), loadTex('data/noise.png', { aniso: ANISO_NOISE }), loadTex('data/det_forest.jpg', { mirror: true }), loadTex('data/det_dunes.jpg', { mirror: true }), loadTex('data/det_rock.jpg', { mirror: true }), loadTex('data/det_grass.jpg', { mirror: true }), loadTex('data/waternormals.jpg')]);
      globals.uInfo.value = info; globals.uNoise.value = noise; globals.uClouds.value = noise; globals.uWaterN.value = waterN || noise; globals.uDetA.value = detA || noise; globals.uDetB.value = detB || noise; globals.uDetC.value = detC || noise; globals.uDetD.value = detD || noise;
      // one array texture for the four detail photographs (WebGL2): the terrain shader then fits the 16 textures an Apple GPU allows
      detImages = [detA, detB, detC, detD].map((t) => (t || noise).image); buildDetArray(null);
      setLoad(34, 'the world');
      const wd = await loadImageData('data/world.png');
      loadImageData('data/noise.png').then((nd) => { if (terrain) terrain.noiseData = nd; }).catch(() => {});
      for (let i = 0; i < N; i++) { worldData.elev[i] = wd.data[i * 4]; worldData.fert[i] = wd.data[i * 4 + 1] / 255; worldData.flags[i] = wd.data[i * 4 + 2]; worldData.land[i] = wd.data[i * 4 + 2] & 1; }
      // (what the land feeds, by its kind: land.js; without it a world feeds by the old map)
      try { const sd = await loadImageData('data/soil.png'); const so = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { so[i * 3] = sd.data[i * 4]; so[i * 3 + 1] = sd.data[i * 4 + 1]; so[i * 3 + 2] = sd.data[i * 4 + 2]; } worldData.soil = so; } catch (e) { console.warn('soil', e); }
      setLoad(50, 'peoples');
      world = new WORLD.World({ scene, terrain: { exag: 2.0, heightAt: () => 0 } });
      SKY.load({ soft: softGL && !window.GENESIS_SKY });      // the stars, the Milky Way, the Moon, the clouds (sky.js): each put to use as it comes; a software renderer takes the lighter half unless asked
      terrain = new TERRAIN.Terrain({ scene, index, water, img, heights, base: 'data/', globals, exag: 2.0, anisotropy: ANISO, soft: softGL && !window.GENESIS_GRID, plainWater: softGL && !window.GENESIS_POST, slow: softGL });
      world.terrain = terrain;
      decal = new DECAL.Decal({ renderer, globals }); decal.terrain = terrain; decal.load('data/rivers.png').catch((e) => console.warn('rivers', e)); world.decal = decal;
      trees = new TREES.Trees({ scene, terrain, renderer }); trees.decal = decal; if (window.GENESIS_TREES || softGL) trees.budget = window.GENESIS_TREES || 0.25; if (softGL) trees.slice = 1e9; if (softGL && !window.GENESIS_TREES) { trees.coverCap = 0.6; trees.coverMin = 0; }      /* (a software renderer shades every pixel of every card: each ring of trees may cover no more than half the picture in all) */ trees.load('data/veg.jpg', 'data/noise.png', 'data/climate.png', 'data/snow.png').catch((e) => console.warn('veg', e));
      life = new LIFE.Life({ scene, terrain }); if (softGL) life.budget = 0.5; movers = new MOVERS.Movers({ scene, terrain, world }); fx = new EVENTS.Effects({ scene, terrain, world }); troops = new TROOPS.Troops({ scene, terrain, world }); troops.onPick = (id) => selectHost(id);
      globals.uOwner.value = world.ownerTex; globals.uPal.value = world.palTex; globals.uSim.value = world.simTex;
      mapcam = new MAPCAM.MapCamera(camera, renderer.domElement, terrain);
      mapcam.onClick = onClick; mapcam.locked = true; mapcam.autoTilt = settings.autoTilt;
      window.__G = { settings, loadSettings, get sim() { return sim; }, climateRefresh: () => { climYear = NaN; climateUniforms(); }, get decal() { return decal; }, get trees() { return trees; }, get life() { return life; }, get movers() { return movers; }, get fx() { return fx; }, get troops() { return troops; }, selectHost: (id) => selectHost(id), get hostSel() { return hostSel; }, startTurn, endTurn, turnRun, attention: () => computeAttention(), terrain, world, mapcam, camera, renderer, globals, select, cellOf, openChronicle, start: (lon, lat, name) => { const i = cellOf(lon, lat); const y = (i / W) | 0, x = i - y * W; startPlayer(i, name || '', [(lon + 180) / 360 * W - x, (90 - lat) / 180 * H - y], true); mapcam.fly = null; }, run: (n) => { for (let k = 0; k < n; k++) sim.tick(); world.refreshTextures(); world.updateBuildings(mapcam, true); refreshAll(true); }, setPaused: (p) => { paused = p; updateClock(); }, setSeason: (p) => { seasonPhase = p; }, get season() { return seasonPhase; }, get labelDbg() { return labelDbg; } };
      buildEconomy(); buildDock(); buildMinimapBase(); bindUI();
      newWorld((Math.random() * 2 ** 31) | 0);
      previewSave(); homeAim(false);                // a saved world is shown on the home screen as it was left
      setLoad(80, 'first light');
      await versionReady; homeRefresh();
      // an update was just put to use while a world was being played: straight back into it
      let resume = false; try { resume = sessionStorage.getItem('holocene-resume') === '1'; sessionStorage.removeItem('holocene-resume'); } catch (e) {}
      if (resume && hasSave()) loadLocal(true);
      requestAnimationFrame(frame);
      setTimeout(() => { setLoad(100); const L = $('loading'); L.classList.add('gone'); if (mode === 'intro') $('intro').classList.add('enter'); setTimeout(() => { L.hidden = true; afterUpdate(); }, 750); }, 900);
      // generated materials and art arrive after first light; the world recompiles its shaders when they are in
      if (window.MODELS && settings.models !== false) MODELS.load(window.GENESIS_MODELS_URL).then((M) => { if (M.ready) { world.lastBuild.t = -1e9; console.log('models: ' + Object.keys(M.defs).length + ' in the library'); } });
      // (should the card lose its picture memory and get it back, the ground's materials are read again: their pixels are not kept once the card has them)
      renderer.domElement.addEventListener('webglcontextrestored', () => { if (window.TEX && TEX.ground && TEX.reloadGround) TEX.reloadGround().then(() => applyTextures()); });
      if (window.TEX && softGL) { TEX.groundShrink = window.GENESIS_GROUND || 4; TEX.groundAniso = 2; }      // (a software renderer takes the ground's materials at a quarter of their size unless told otherwise, and looks at them two ways, not sixteen)
      if (window.TEX) TEX.load(renderer, TEX_URL).then((T) => { applyArt(); applyTextures(); if (T.unsupported) console.warn('textures need WebGL2'); });
      try { sampleFn = window.claude && window.claude.use ? await window.claude.use('sample') : null; } catch (e) { sampleFn = null; }
      if (!sampleFn) $('btn-chronicle').textContent = 'Show the record';
    } catch (e) { console.error(e); $('loading').innerHTML = 'The Earth could not be assembled: ' + esc(e.message || e); }
  }

  // ---------- game flow ----------
  function newWorld(seed) {
    sim = createSim(worldData, seed); world.setSim(sim); previewing = false; if (sim.setStories) sim.setStories(settings.stories !== false);
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
      tries++; const i = LI[Math.floor(sim.rnd() * LI.length)]; const f = sim.homeOf(i); if (f < 0.45 || sim.owner[i] >= 0) continue;
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
    const [lon, lat] = siteOf(i); sunFor(lon);
    mapcam.flyTo(lon, lat, viewDist(i), { duration: fromClick ? 2.4 : 3.8, tilt: 0.9, heading: mapcam.heading });
    select(i); $('intro').hidden = true; refreshAll(true);
    bigBanner(`${sim.fullName(c)}`, `settle ${sim.cellName.get(i)} · ${sim.fmtYear(sim.year)}`);
  }
  function randomStart() {
    freshWorld(); const LI = sim.LI; let best = -1, bs = -1;
    for (let t = 0; t < 6000; t++) { const i = LI[Math.floor(sim.rnd() * LI.length)]; const s = sim.homeOf(i) * (1 + ((sim.flags[i] & 2) ? 0.8 : 0)) * (1 + ((sim.flags[i] & 4) ? 0.15 : 0)) * sim.rnd(); if (s > bs) { bs = s; best = i; } }
    startPlayer(best, '', null, false);
  }
  function chooseMode() { freshWorld(); setMode('choose'); $('intro').hidden = true; mapcam.locked = false; mapcam.idleSpin = false; mapcam.flyTo(mapcam.lon, mapcam.lat, 2.4, { duration: 1.8, tilt: 0, heading: 0 }); banner('Fly anywhere. Click the ground where your people begin.', true); setSoil(true); }
  // the world shown on the home screen is the saved one: a new game begins on a new Earth
  let previewing = false;
  function freshWorld() { if (previewing) { newWorld((Math.random() * 2 ** 31) | 0); world.refreshTextures(); world.updateBuildings(mapcam, true); } }
  // back to the home screen (from a game, which is saved first, or from choosing a homeland)
  function goHomeScreen(save) {
    if (save) { if (turnRun.active) endTurn('stopped'); saveLocal(false); }
    if (tool) setTool(null); deselect(); $('found').hidden = true; pendingFound = null; banner(null); setSoil(false); document.body.classList.remove('dockopen'); $('l-build').classList.remove('on'); $('report').hidden = true;
    setMode('intro'); $('intro').hidden = false; $('intro').classList.remove('enter');
    mapcam.locked = true; mapcam.autoTilt = settings.autoTilt;
    if (save) previewing = true; else previewSave();
    homeAim(true); world.updateBuildings(mapcam, true); homeRefresh();
  }
  // Where the home screen looks: the saved world's capital stands in the last of the daylight, a little above the
  // middle of what is seen of the planet (with no saved world: Mesopotamia). Then the Earth turns on from there.
  function homeAim(fly) {
    const pc = previewing && sim ? sim.playerCiv() : null; let lon = 72, lat = HOME.lat;
    if (pc && pc.capital >= 0) { const [cl, ca] = cellCenter(pc.capital); lon = GEO.wrapLon(cl + 30); lat = clamp(ca - 22, -50, 40); }
    mapcam.spin = HOME.spin;
    if (fly) mapcam.flyTo(lon, lat, HOME.dist, { duration: 2.4, tilt: 0, heading: 0, onDone: () => { if (mode === 'intro') mapcam.idleSpin = true; } });
    else { mapcam.fly = null; mapcam.tLon = mapcam.lon = lon; mapcam.tLat = mapcam.lat = lat; mapcam.tDist = mapcam.dist = HOME.dist; mapcam.tTilt = mapcam.tilt = 0; mapcam.tLift = mapcam.lift = 0; mapcam.tHeading = mapcam.heading = 0; mapcam.idleSpin = true; }
  }
  function setSoil(on) { view.soil = on; globals.uFertView.value = on ? 0.6 : 0; $('v-soil').classList.toggle('on', on); }
  function showFoundCard(hit, i, cx, cy) {
    pendingFound = { hit, i }; const f = sim.flags[i]; const fert = sim.fert[i]; const lk = sim.landClass ? sim.landClass(i) : -1, fl = sim.farmland ? sim.farmland(i) : fert;
    const terrainTxt = (f & 8) ? 'Ice' : (lk > 0 && window.LAND ? `${LAND.CLASSES[lk].name}${fl > 0.04 ? `, ${Math.round(Math.min(1, fl) * 100)}% farmland` : ''}` : (fert < 0.12 ? 'Desert or barren' : fert < 0.35 ? 'Marginal land' : fert < 0.6 ? 'Good land' : 'Rich land')) + ((f & 2) ? ' · river' : '') + ((f & 4) ? ' · coast' : '');
    const wx = sim.climateHere ? weatherOf(sim.climateHere(i)) : null;
    const slopeTxt = hit.h > 2500 ? 'high mountain' : hit.h > 1200 ? 'highland' : hit.h > 400 ? 'hills' : 'lowland';
    $('found-kv').innerHTML = `<span class="micro">Place</span><span>${esc(sim.cellName.get(i) || sim.describeCell(i))}</span><span class="micro">Elevation</span><span class="num">${Math.round(hit.h)} m · ${slopeTxt}</span><span class="micro">Land</span><span${lk > 0 && window.LAND ? ` title="${esc(LAND.CLASSES[lk].text)}"` : ''}>${terrainTxt}</span>${wx ? `<span class="micro">These years</span><span title="${esc(wx.tip)}">${esc(wx.t)}</span>` : ''}<span class="micro">Feeds</span><span class="num">${fmtPop(sim.homeOf ? sim.capacity(i, null) : fert * 30)} who hunt and gather</span>`;
    $('found-hint').textContent = fert < 0.2 ? 'Hard country. Your people will grow slowly here, but nobody will contest it.' : (f & 2) ? 'A river valley. Fields will feed cities here; so will everyone else want it.' : hit.h > 1500 ? 'A mountain home. Easy to defend, slow to grow, and the view is yours.' : 'Fair land. Room to grow.';
    const card = $('found'); card.hidden = false; const r = stage.getBoundingClientRect();
    card.style.left = clamp(cx + 18, 16, r.width - 336) + 'px'; card.style.top = clamp(cy - 40, 90, r.height - 320) + 'px'; $('found-name').value = '';
  }

  // ---------- globe input ----------
  function onClick(cx, cy) {
    if (!sim || mode === 'intro') return;
    const hit = mapcam.pickAt(cx, cy); if (!hit) return;
    const i = cellOf(hit.lon, hit.lat);
    if (mode === 'choose') { if (!sim.land[i] || (sim.flags[i] & 8)) { toast('Your people need land to stand on'); return; } if (sim.iced && sim.iced(i)) { toast(sim.lakeAt(i) ? 'The great lake covers this land' : 'The ice still lies here: nothing lives on it yet'); return; } if (sim.lakeWill && sim.lakeWill(i)) { toast('The great lake of the wet centuries will rise over this land: settle on its shore'); return; } if (sim.owner[i] >= 0) { toast('Someone already lives here'); return; } showFoundCard(hit, i, cx, cy); return; }
    if (placing) { cancelPlacing(); return; }
    if (marching >= 0) { orderMarch(i); return; }
    if (tool) {
      let msg;
      if (tool === 'settle') {
        msg = sim.act(tool, i);
        if (msg && msg.startsWith('Settled')) { const y = (i / W) | 0, x = i - y * W; sim.siteU[i] = clamp((hit.lon + 180) / 360 * W - x, 0.05, 0.95); sim.siteV[i] = clamp((90 - hit.lat) / 180 * H - y, 0.05, 0.95); }
      }
      else if (tool === 'spawn') { const c = sim.spawnTribe(i); msg = c ? `${sim.fullName(c)} arrive` : sim.iced && sim.iced(i) ? (sim.lakeAt(i) ? 'The great lake lies here' : 'The ice lies here') : 'Needs empty land'; }
      else if (tool === 'plague') { sim.plague(i, 10, false); msg = 'Plague unleashed'; }
      else if (tool === 'drought') msg = sim.drought(i);
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
  function select(i) { if (hostSel >= 0) closeHost(); selected = i; selectedCiv = sim.owner[i]; const y = (i / W) | 0, x = i - y * W; globals.uSel.value.set(x, y); $('left').classList.add('open'); updateInspector(true); }
  function deselect() { selected = -1; selectedCiv = -1; globals.uSel.value.set(-9, -9); $('left').classList.remove('open'); cancelPlacing(); }
  // ---------- hosts in the field (army.js; troops.js draws them): a card for the one selected, the player's orders ----------
  let hostSel = -1, marching = -1, hostCardKey = '';
  function selectHost(id) {
    if (!sim || !sim.army.byId(id)) return; if (selected >= 0) deselect(); hostSel = id; troops.selected = id; marching = -1; $('hostcard').hidden = false; hostCardKey = ''; updateHostCard();
  }
  function closeHost() { hostSel = -1; if (troops) troops.selected = -1; $('hostcard').hidden = true; if (marching >= 0) { marching = -1; banner(null); } }
  // the player's host: selected and flown to, or how to raise one
  function findHost() {
    const c = sim.playerCiv(); if (!c) return; const a = sim.army.of(c.id)[0];
    if (!a) { toast(sim.cannot('levy', c.capital) || 'No host in the field. Raise the levy in a town of yours (B).'); return; }
    selectHost(a.id); const [lon, lat] = sim.army.cellLL(a.cell); mapcam.flyTo(lon, lat, Math.min(Math.max(mapcam.dist, 0.004), 0.03), { duration: 1.4 });
  }
  function orderMarch(i) {
    const a = sim.army.byId(marching); marching = -1; banner(null); if (!a) return;
    const why = sim.army.order(a.id, i); const name = sim.cellName.get(i) || (sim.owner[i] >= 0 && sim.civs[sim.owner[i]] ? 'the land of ' + sim.civs[sim.owner[i]].name : 'there');
    toast(why || `${a.name} marches on ${name}`); hostCardKey = ''; updateHostCard();
  }
  const HOST_ST = { march: 'On the march', siege: 'Laying siege', camp: 'Encamped', sea: 'At sea', embark: 'Waiting for its ships' };
  function updateHostCard() {
    if (hostSel < 0 || !sim) return; const A = sim.army, a = A.byId(hostSel); if (!a) { closeHost(); return; }
    const c = sim.civs[a.c]; if (!c) { closeHost(); return; } const mine = a.c === sim.player;
    const goalName = (i) => i >= 0 ? sim.cellName.get(i) || (sim.owner[i] >= 0 && sim.civs[sim.owner[i]] ? 'the land of ' + sim.civs[sim.owner[i]].name : 'open country') : '';
    const st = a.state === 'march' ? `Marching on ${goalName(a.goal)} · ${a.path.length} region${a.path.length === 1 ? '' : 's'} to go${a.legs ? ', then over the sea' : ''}` : a.state === 'siege' ? `Besieging ${goalName(a.siegeAt)} · ${Math.round(a.siege * 100)}% of the way to its fall` : a.state === 'sea' ? `At sea, on its way to ${goalName(a.goal)}` : a.state === 'embark' ? `At the harbour, boarding the fleet` : a.ai ? `On the front against ${a.foe >= 0 && sim.civs[a.foe] ? sim.fullName(sim.civs[a.foe]) : 'the enemy'}` : `Encamped near ${goalName(a.cell) || 'its last march'}`;
    const left = mine ? Math.max(0, c.army - sim.year) : 0;
    const key = [a.id, a.men, Math.round(a.morale * 20), a.state, a.path.length, Math.round(a.siege * 50), left, a.won, a.lost, marching].join(':'); if (key === hostCardKey) return; hostCardKey = key;
    $('hc-sw').style.background = c.color; $('hc-title').textContent = a.name; $('hc-sub').textContent = `${HOST_ST[a.state] || ''} · ${sim.fullName(c)}${mine ? ' · yours' : ''}`;
    const tile = (k, v, d) => `<div class="tile"><span class="micro">${k}</span><span class="k">${v}</span>${d ? `<span class="d">${d}</span>` : ''}</div>`;
    $('hc-tiles').innerHTML = tile('Men', fmtInt(a.men), `raised ${fmtInt(a.raised)}`) + `<div class="tile"><span class="micro">Spirit</span><span class="k">${Math.round(a.morale * 100)}%</span><div class="bar"><i style="transform:scaleX(${clamp(a.morale, 0, 1).toFixed(2)});background:${a.morale > 0.6 ? 'var(--pos)' : a.morale > 0.35 ? 'var(--warn)' : 'var(--neg)'}"></i></div></div>`
      + tile('Arms', c.era >= 1 ? `${Math.round(sim.satOf(c.id, 'arms') * 100)}%` : '—', c.era >= 1 ? 'of what it wants' : 'stone and wood') + tile(mine ? 'Years left' : 'Battles', mine ? String(left) : `${a.won} won`, mine ? 'of the levy' : `${a.lost} lost`);
    $('hc-state').textContent = st + (mine && a.won + a.lost ? ` · battles: ${a.won} won, ${a.lost} lost` : '');
    $('hc-acts').hidden = !mine; $('hc-march').classList.toggle('on', marching === a.id);
  }
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
    if (sim.land[i]) { rows.push(['People', fmtPop(sim.pop[i]) + (c ? ' / ' + fmtPop(sim.capacity(i, c)) + ' fed' : '')]); rows.push(['Elevation', Math.round(hit.h) + ' m']); if (knowsCell(i)) rows.push(['Yields', esc(sim.GOODS[sim.goods[i]].name) + ((sim.special[i] & 512) ? ' · ' + sim.workName(i).toLowerCase() : '')]); }
    if (sim.infra[i] || sim.walls[i] || sim.special[i]) rows.push(['Works', [sim.infra[i] ? 'developed ' + sim.infra[i] : '', sim.walls[i] ? 'walls ' + sim.walls[i] : '', sim.special[i] & 1 ? 'port' : '', sim.special[i] & 2 ? 'academy' : '', sim.special[i] & 4 ? 'temple' : '', sim.special[i] & 8 ? 'market' : '', sim.special[i] & 16 ? 'wonder' : '', ...indNames(i)].filter(Boolean).join(', ')]);
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
    { id: 'live', cls: 'live', icon: '<path d="M4 10h16l-2 9H6zM8 10l4-6 4 6"/>', tip: 'How your people live' },
    { id: 'rule', cls: 'cul', icon: '<path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z"/>', tip: 'Laws and authority' },
    { id: 'know', cls: 'sci', icon: '<path d="M12 6c-2-1.500-5-2-8-2v14c3 0 6 .500 8 2 2-1.500 5-2 8-2V4c-3 0-6 .500-8 2z"/><path d="M12 6v14" stroke="#101318" stroke-width="1.5"/>', tip: 'What your people study' },
    { id: 'art', cls: 'art', icon: '<path d="M5.500 3.500c-2 4.500-1.500 9.500 1.500 13h10c3-3.500 3.500-8.500 1.500-13l-2 .800c1.500 3.500 1.200 7.200-.800 10.200H8.300C6.300 11.500 6 7.800 7.500 4.300z"/><rect x="6.500" y="17.800" width="11" height="2.700" rx="1"/><path d="M9.100 6.600h1.300v7.900H9.100zM11.350 6h1.300v8.500h-1.300zM13.600 6.600h1.300v7.900h-1.300z"/>', tip: 'Renown' },
  ];
  const ecoEls = {};
  function buildEconomy() {
    const host = $('economy');
    for (const e of ECO) {
      const d = document.createElement('div'); d.className = 'eco ' + e.cls; d.innerHTML = `<svg viewBox="0 0 24 24">${e.icon}</svg><div class="stack"><span class="v" id="eco-${e.id}">—</span><span class="d" id="eco-${e.id}-d"></span></div>`;
      host.appendChild(d); ecoEls[e.id] = d; attachTip(d, () => ecoTip(e.id));
      if (e.id === 'live' || e.id === 'coin') { d.style.cursor = 'pointer'; d.addEventListener('click', () => { if (sim && sim.playerCiv()) MARKET.open('ledger'); }); }
      if (e.id === 'know') { d.style.cursor = 'pointer'; d.addEventListener('click', () => { if (sim && sim.playerCiv()) TREE.open(); }); }
      if (e.id === 'rule') { d.style.cursor = 'pointer'; d.addEventListener('click', () => { if (sim && sim.playerCiv()) GOV.open(); }); }
      if (e.id === 'art') { d.style.cursor = 'pointer'; d.addEventListener('click', () => { if (sim && sim.playerCiv()) WORKS.open(); }); }
    }
  }
  const lastSample = { pop: 0, cells: 0, year: -1e9, dPop: 0, dCells: 0 };
  function ecoTip(id) {
    const c = sim && sim.playerCiv(); if (!c) return `<b>${ECO.find(x => x.id === id).tip}</b>No realm yet.`;
    const P = c.policy; const pop = sim.popOf[c.id];
    const row = (k, v) => `<div class="row"><span>${k}</span><span class="num">${v}</span></div>`;
    switch (id) {
      case 'coin': { const ip = sim.incomeParts(c); return `<b>Treasury ${fmtInt(c.wealth)}</b>${row('Taxes', fmtSigned(ip.taxes))}${row('Harbours ×' + sim.ports[c.id], fmtSigned(ip.ports))}${row('Markets ×' + sim.markets[c.id], fmtSigned(ip.markets))}${ip.mines ? row('Mines and estates', fmtSigned(ip.mines)) : ''}${row('Prosperity', fmtSigned(ip.living))}${row('Customs', fmtSigned(ip.customs))}${ip.upkeep ? row('Army upkeep', fmtSigned(-ip.upkeep)) : ''}${ip.scholars ? row('Scholars', fmtSigned(-ip.scholars)) : ''}${Math.abs(ip.state) >= 0.05 ? row('What the laws spend', fmtSigned(-ip.state)) : ''}${Math.abs(ip.tribute) >= 0.05 ? row(ip.tribute >= 0 ? 'Tribute paid to you' : 'Tribute you pay', fmtSigned(ip.tribute)) : ''}${ip.paid >= 0.05 ? row('Interest to lenders', fmtSigned(-ip.paid)) : ''}${ip.got >= 0.05 ? row('Interest and dividends', fmtSigned(ip.got)) : ''}${row('Net per year', fmtSigned(c.income || 0))}${sim.finance && sim.finance.debt[c.id] > 0 ? row('Debts', fmtInt(sim.finance.debt[c.id]) + ' at ' + (100 * sim.finance.rateOf[c.id]).toFixed(1) + '%') : ''}<div class="hint">Taxes at ${P.tax.toFixed(1)}×, military at ${P.military.toFixed(1)}×. Change both in Realm › Policy. Click for the ledger; borrow in its Treasury.</div>`; }
      case 'live': { const M = sim.market, NC = M.NC, CATS = ECON.CATS; const rows = CATS.filter((C) => M.Bk[c.id * NC + C.id] > 0).map((C) => { const v = M.sat[c.id * NC + C.id]; return `<div class="row"><span>${C.name}${C.state ? ' (the state)' : ''}</span><span class="num ${v < 0.5 ? 'neg' : v < 0.8 ? 'warn' : ''}">${Math.round(v * 100)}%</span></div>`; }).join(''); return `<b>Your people have ${Math.round(M.LS[c.id] * 100)}% of what they want</b>${rows}<div class="hint">What the land yields, what your towns make and what merchants bring. Well-supplied people pay more tax; hungry ones grow restless. Click for the ledger; M opens the market.</div>`; }
      case 'pop': { const fed = sim.settlementsOf(c.id).length; return `<b>${fmtPop(pop)} people</b>${row('Settlements', fed)}${row('Change / 20 yrs', fmtSigned(lastSample.dPop, 1) + ' k')}<div class="hint">People grow towards what the land feeds. Develop cells and advance knowledge to feed more.</div>`; }
      case 'land': return `<b>${fmtInt(sim.cellsOf[c.id])} regions</b>${row('Reach from capital', Math.round(sim.reachFor(c)) + ' cells')}${row('Peak', fmtInt(c.peakCells))}<div class="hint">Regions beyond your reach may break away when stability is low.</div>`;
      case 'mil': return `<b>Strength ${fmtInt(sim.mightOf[c.id])}</b>${row('People', fmtPop(pop))}${row('Knowledge factor', (0.25 + c.tech * 1.6).toFixed(2) + '×')}${row('Military spending', P.military.toFixed(1) + '×')}${row('Army', sim.year < c.army ? `raised, ${c.army - sim.year} yrs` : 'none')}<div class="hint">Wars are won region by region along the border, by the better armed side. A wall makes a region two and a half times as hard to take, three walls five and a half.</div>`;
      case 'stab': { const sp = sim.stabilityParts(c); const pt = (v) => Math.abs(v) < 0.005 ? '0' : (v > 0 ? '+' : '−') + Math.round(Math.abs(v) * 100); const r = (k, v) => Math.abs(v) >= 0.005 ? row(k, pt(v)) : '';
        return `<b>Stability ${Math.round(c.stability * 100)}%</b>${row('It is heading for', Math.round(Math.max(0, Math.min(1, sp.target)) * 100) + '%')}${r('Wars', sp.wars)}${r('More land than can be held', sp.overreach)}${r('Taxes', sp.taxes)}${r('A warlike stance', sp.stance)}${r('Temples ×' + sim.temples[c.id], sp.temples)}${r('Wonders ×' + sim.wonders[c.id], sp.wonders)}${r('Luxuries', sp.luxuries)}${r('Hunger', sp.hunger)}${r('The ruler', sp.ruler)}${r('What your people know', sp.knowledge)}${r('Laws, government and the estates', sp.rule)}${r('Other peoples than yours', sp.peoples)}${r('Other faiths than the realm\'s', sp.faiths)}${r(sim.culture && sim.culture.isGolden(c.id) ? 'Renown, and a golden age' : 'Renown, against the usual for the age', sp.culture)}${r('Money: dear bread, a panic, a default', sp.finance)}${r('What your choices left behind', sp.story)}${r('Pestilence', sp.sickness)}${r('Newcomers, and those kept from leaving', sp.newcomers)}<div class="hint">Below 30% the realm may fracture. V opens the laws and the estates.</div>`; }
      case 'rule': { const g = GOV.tile(); if (!g) return ''; const k = sim.rule, Q = k.ruleOf(c), ES = RULE.ESTATES.map((E, e) => e).sort((a, b) => k.power[c.id * RULE.NE + b] - k.power[c.id * RULE.NE + a]).slice(0, 4);
        return `<b>Authority ${Math.floor(g.auth)} of ${g.max}</b>${row('Gathers', '+' + g.perTurn.toFixed(g.perTurn < 10 ? 1 : 0) + ' a turn')}${row('Government', esc(g.form.name))}${g.reform ? row('Reform', esc(g.reform.x.name) + ' · ' + g.reform.left + ' yrs') : row('Reform', 'none under way')}${g.demand ? row(esc(g.demand.who) + ' demand', esc(g.demand.law.name)) : ''}${ES.map((e) => row(esc(RULE.estateName(e, c.era)) + ' · ' + Math.round(k.power[c.id * RULE.NE + e] * 100) + '% of power', GOV.moodWord(Q.mood[e]))).join('')}<div class="hint">Authority is what your word can change: a law, or the form of government. Click, or press V.</div>`; }
      case 'art': { const K = sim.culture; if (!K) return ''; const e = c.era, held = K.heldBy(c.id), master = held.filter((w) => w.value >= K.MASTER).length, G = K.goldenNeed(c.id), p = K.pace(c.id), left = p > 0 ? Math.ceil((K.threshold(c.id) - K.prog[c.id]) / p) : -1, pr = K.unrest(c);
        return `<b>Renown ${fmtInt(K.renown[c.id])}</b>${row('Works held', held.length + (master ? ` (${master} masterpiece${master === 1 ? '' : 's'})` : ''))}${sim.wonders[c.id] ? row('Wonders ×' + sim.wonders[c.id], '+' + 4 * sim.wonders[c.id]) : ''}${row('The usual realm of your age', fmtInt(K.NORM[e]))}${row('Pride', (pr >= 0 ? '+' : '−') + Math.round(Math.abs(pr) * 100) + ' stability')}${row('Great people living', K.livingOf(c.id).length)}${row('The next', left < 0 ? 'not before masonry' : left > 2000 ? 'not in living memory' : 'in about ' + left + ' yrs')}${row('Golden age', K.isGolden(c.id) ? 'until ' + sim.fmtYear(G.until) : `${G.have} of ${G.need} born within ${G.win} yrs`)}<div class="hint">Great people make works; whoever holds a city holds its works. Z opens Culture.</div>`; }
      case 'know': { const t = TREE.tile(); if (!t) return ''; const ip = sim.insightParts(c); const U = KNOW.UNIT; const next = sim.ERAS[c.era + 1]; const from = c.era ? sim.ERAS[c.era][1] : KNOW.T0;
        return `<b>${t.d ? esc(t.d.name) + ' · ' + Math.round(t.prog * 100) + '%' : t.waiting ? 'Your scholars await your word' : 'Nothing left to study in this age'}</b>${t.d ? row('Learned in', TREE.yrs(t.years)) : ''}${row('Insight a year', '+' + t.perYear.toFixed(t.perYear < 10 ? 2 : 1))}${row('For its age', (ip.base * U).toFixed(2))}${row('People', '×' + ip.people.toFixed(2))}${row('Scholars\' pay ' + P.research.toFixed(1) + '×', '×' + ip.spend.toFixed(2))}${row('Academies ' + sim.acad[c.id] + ' in ' + sim.townsOf[c.id] + ' towns', '×' + ip.acads.toFixed(2))}${row('Peace at home', '×' + ip.calm.toFixed(2))}${ip.ruler !== 1 ? row('Ruler', '×' + ip.ruler.toFixed(2)) : ''}${row('What you know of learning', '×' + ip.known.toFixed(2))}${Math.abs(ip.time - 1) >= 0.005 ? row(ip.time < 1 ? 'Ahead of your time' : 'First in a world behind its time', '×' + ip.time.toFixed(2)) : ''}${ip.tales && Math.abs(ip.tales - 1) >= 0.005 ? row('What your choices left behind', '×' + ip.tales.toFixed(2)) : ''}${ip.taught * U >= 0.005 ? row('Taught by neighbours', '+' + (ip.taught * U).toFixed(2)) : ''}${row('Discoveries', t.known + ' of ' + t.total)}${next ? row('To the ' + next[0], Math.round(100 * clamp((c.tech - from) / (next[1] - from), 0, 1)) + '%') : ''}${t.queue ? row('In the queue', t.queue) : ''}<div class="hint">What your neighbours know is learned half again as fast. Click for the tree; K opens it.</div>`; }
    }
    return '';
  }
  function updateEconomy() {
    const c = sim && sim.playerCiv();
    const set = (id, v, d, dcls) => { const el = $('eco-' + id); if (!el) return; el.textContent = v; const de = $('eco-' + id + '-d'); de.textContent = d || ''; de.className = 'd ' + (dcls || ''); };
    if (!c) { for (const e of ECO) set(e.id, '—', ''); $('id-name').textContent = mode === 'choose' ? 'Choosing a homeland' : 'The World'; $('id-era').textContent = 'Before history'; $('id-sw').style.background = '#5b6779'; $('id-who').textContent = ''; if (sealKey) { sealKey = ''; const g = $('id-face').getContext('2d'); g.clearRect(0, 0, 112, 112); } delete document.body.dataset.age; return; }
    if (sim.year - lastSample.year >= 20) { if (lastSample.year > -1e8) { lastSample.dPop = sim.popOf[c.id] - lastSample.pop; lastSample.dCells = sim.cellsOf[c.id] - lastSample.cells; } lastSample.pop = sim.popOf[c.id]; lastSample.cells = sim.cellsOf[c.id]; lastSample.year = sim.year; }
    const inc = c.income || 0;
    set('coin', fmtInt(c.wealth), fmtSigned(inc), inc >= 0 ? 'pos' : 'neg');
    set('pop', fmtPop(sim.popOf[c.id]), Math.abs(lastSample.dPop) >= 0.02 ? fmtDeltaK(lastSample.dPop) : '', lastSample.dPop >= 0 ? 'pos' : 'neg');
    set('land', fmtInt(sim.cellsOf[c.id]), lastSample.dCells ? fmtSigned(lastSample.dCells, 0) : '', lastSample.dCells >= 0 ? 'pos' : 'neg');
    set('mil', fmtInt(sim.mightOf[c.id]), sim.year < c.army ? 'army' : '', 'pos');
    set('stab', Math.round(c.stability * 100) + '%', '', c.stability < 0.3 ? 'neg' : c.stability < 0.5 ? 'warn' : '');
    { const ls = sim.market.LS[c.id]; const sh = MARKET.shortages(); set('live', Math.round(ls * 100) + '%', sh.length ? sh.length + ' short' : '', sh.length ? 'neg' : ''); }
    { const t = TREE.tile(); if (t) set('know', t.d ? Math.round(t.prog * 100) + '%' : '—', t.d ? TREE.yrs(t.years) : t.waiting ? 'choose' : '', t.waiting ? 'neg' : ''); }
    { const g = GOV.tile(); if (g) set('rule', String(Math.floor(g.auth)), g.demand ? 'demand' : g.reform ? g.reform.left + ' yrs' : g.angry ? 'unrest' : g.army ? 'the army' : '', g.demand || g.angry || g.army ? 'neg' : ''); }
    { const K = sim.culture; if (K) { const rel = K.rel(c.id), gold = K.isGolden(c.id); set('art', fmtInt(K.renown[c.id]), gold ? 'golden age' : K.pace(c.id) > 0 || K.renown[c.id] > 0 ? (rel >= 10 ? Math.round(rel) : rel.toFixed(1)) + '× usual' : '', gold ? 'pos' : rel < 0.67 ? 'warn' : ''); } }
    $('id-name').textContent = sim.fullName(c); $('id-era').textContent = sim.ERAS[c.era][0] + ' · ' + sim.govName(c); $('id-sw').style.background = c.color;
    if (document.body.dataset.age !== String(c.era)) document.body.dataset.age = c.era;      // (the interface is set in the metal of the player's age)
    renderSeal(c);
  }
  // the seal: the ruler's face, as the court and the realm's card have it, and who rules
  let sealKey = '';
  function renderSeal(c) {
    const r = c.ruler; if (!r) return; const D = sim.dynasty, p = D && r.pid ? D.of(r.pid) : null, H = p && p.h ? D.houses.get(p.h) : null;
    const age = p ? sim.year - p.b : (sim.year - r.since) + 22 + ((r.seed || 0) % 24); const R = D ? D.regentOf(c.id) : null;
    const key = `${c.id}:${r.seed}:${c.era}:${Math.floor(age / 10)}:${c.color}:${H ? H.seed : 0}:${r.trait}`;
    if (key !== sealKey && window.PORTRAIT) { sealKey = key; PORTRAIT.draw($('id-face'), { seed: r.seed || (r.name.length * 7919), culture: TOWN.CULTURES[TOWN.civCulture(sim, c)], era: c.era, fem: !!r.fem, trait: p && age < 16 ? 'steward' : r.trait, color: c.color, age, house: H ? H.seed : 0, child: !!p && age < 16 }); }
    $('id-who').textContent = `${r.title} ${r.name}${p ? ', ' + age : ''}${R ? ' · ' + (R.n || 'a regent') + ' rules for ' + (r.fem ? 'her' : 'him') : ''}`;
  }

  // ---------- what is under way (the plate on the right, under the date): a story waiting, what the scholars study, a demand, the
  // reform, the works nearest done, the hosts in the field, the wars and how they stand, a golden age, debts. Each line opens its page.
  const TK_ICON = { mig: '<path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 2.5-5 5-5s5 2 5 5M14 9h7M18 6l3 3-3 3"/>', work: '<path d="M14.5 4.5l5 5-2 2-5-5zM12.5 6.5l-8.5 8.5v4h4l8.5-8.5"/>', host: '<path d="M6 21V3.5M6 4.5h11l-2.5 3.5L17 11.5H6"/>', war: '<path d="M4 4l11 11M15.5 4L4.5 15M3 21l3.5-3.5M21 21l-3.5-3.5M14 14l7 7M10 14l-7 7"/>', gold: '<path d="M7 20c-3.5-3-4.500-8.500-2-13M17 20c3.5-3 4.500-8.500 2-13M5.5 11.5c1.5 0 2.500 1 3 2.500M18.5 11.5c-1.5 0-2.500 1-3 2.500M6 7.500c1.200.300 2 1.200 2.300 2.300M18 7.500c-1.200.300-2 1.200-2.300 2.300M12 6l1.100 2.300 2.400.300-1.800 1.600.500 2.400L12 11.400 9.800 12.600l.500-2.400L8.500 8.600l2.400-.300z"/>', reform: '<path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z"/>', sick: '<path d="M12 7.500a4.500 4.500 0 1 0 0 9a4.500 4.500 0 1 0 0-9M12 3v4.500M12 16.500V21M3 12h4.500M16.500 12H21M5.600 5.600l2.900 2.900M15.500 15.500l2.900 2.900M5.600 18.400l2.900-2.900M15.500 8.500l2.900-2.900"/>', spy: '<path d="M2.500 12s3.500-6.500 9.500-6.500S21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6"/>',
    dry: '<path d="M12 2.5v2M5.300 5.300l1.400 1.400M18.700 5.300l-1.400 1.400M2.500 12h2M19.500 12h2M8 12a4 4 0 0 1 8 0M3 15.500h18M6.500 21l2-5.500M12.500 21l-1-5.500M17.500 21l-1.500-5.500"/>',
    cold: '<path d="M12 2.500v19M3.800 7.250l16.400 9.500M3.800 16.750l16.400-9.500M9.500 4l2.500 2.500L14.500 4M9.500 20l2.500-2.500 2.500 2.500"/>' };
  // (the weather of a place, in a line: the ice, a drought and its year, a great drought or cold, a good year, the green lands: climate.js)
  function weatherOf(w) {
    if (!w) return null; const hv = Math.round(w.hv * 100);
    if (w.lake) return { t: 'Under the great lake', tip: 'Mega-Chad: in the wet centuries the basin of Lake Chad holds a lake as large as the Caspian, with fish, hippopotamus and the fishermen on its shores. Nobody lives on the water; it falls back as the Sahara dries, and the land comes out again.', cls: 'pos' };
    if (w.ice) return { t: `Under the ice${w.iceLeft > -1e8 ? `, until about ${sim.fmtYear(Math.round(w.iceLeft / 100) * 100)}` : ''}`, tip: `${w.iceDome ? w.iceDome.charAt(0).toUpperCase() + w.iceDome.slice(1) : 'The ice'}: the last of the great ice sheets of the cold still lies here, and withdraws a few kilometres a year. Nothing lives on it.` };
    if (w.event && w.event.share > 0.25 && (w.event.kind !== 'warm' || hv > 101)) return { t: `${w.event.name.charAt(0).toUpperCase() + w.event.name.slice(1)}: the harvest ${hv} in a hundred`, tip: `${w.event.text} (${sim.fmtYear(w.event.y0)} to ${sim.fmtYear(w.event.y1)})`, cls: w.event.kind === 'warm' ? 'pos' : 'neg' };
    if (w.spell && w.spell.kind === 'drought') return { t: `A drought, the ${ordinal(w.spell.years)} year: the harvest ${hv} in a hundred`, tip: 'The rains have failed here: the land feeds fewer this year, and those it no longer feeds starve unless granaries, grain from abroad or the court\'s bread keep them. Crops are fewer at the market, and dearer.', cls: 'neg' };
    if (w.spell && w.spell.kind === 'plenty') return { t: `A good year: the harvest ${hv} in a hundred`, tip: 'Rain when it was wanted and sun when it was wanted: the granaries are full.', cls: 'pos' };
    if (w.wet > 0.25) return { t: 'Green: grass, lakes and herds', tip: `In these centuries the monsoon reaches deep into ${w.greenName || 'the dry lands'}: grassland with lakes, herds and fishermen where there will be desert. It will dry within a few centuries of ${sim.fmtYear(Math.round(w.greenEnd / 100) * 100)}.`, cls: 'pos' };
    return null;
  }
  let tkKey = '', tkRows = [];
  function updateTracker() {
    const el = $('tracker'); const c = sim && mode === 'play' ? sim.playerCiv() : null;
    if (!c) { if (!el.hidden) el.hidden = true; return; }
    const rows = [];
    const v = c.story && c.story.q && window.TALES ? TALES.waiting() : null;
    if (v) rows.push({ k: 'story', cls: 'good', t: v.title, n: '', s: 'A story waits before your court', act: 'story' });
    const t = TREE.tile(); if (t) { if (t.d) rows.push({ k: 'study', t: t.d.name, n: TREE.yrs(t.years), bar: t.prog, act: 'study' }); else if (t.waiting) rows.push({ k: 'study', cls: 'warn', t: 'Choose what to study', n: '', s: 'Your scholars await your word', act: 'study' }); }
    const g = GOV.tile(); if (g) { if (g.demand) rows.push({ k: 'demand', cls: 'warn', t: `${g.demand.who} demand ${g.demand.law.name}`, n: g.demand.left + ' yrs', s: 'Grant it, or refuse it', act: 'gov' }); if (g.reform) rows.push({ k: 'reform', t: g.reform.x.name, n: g.reform.left + ' yrs', bar: g.reform.prog, act: 'gov' }); }
    const works = []; for (const [i, wl] of sim.works) { if (sim.owner[i] !== c.id || !wl || !wl.length) continue; const w = wl[0]; works.push([w.start + w.dur - sim.year, i, w, wl.length]); }
    works.sort((a, b) => a[0] - b[0]);
    for (const [left, i, w, n] of works.slice(0, 3)) rows.push({ k: 'work', icon: BUILD_ICON(w.k), t: buildName(w.k, i), n: Math.max(0, left) + ' yrs', s: (sim.cellName.get(i) || 'a settlement') + (n > 1 ? ` · then ${n - 1} more` : ''), bar: clamp((sim.year - w.start) / Math.max(1, w.dur), 0, 1), act: 'cell', i });
    if (works.length > 3) rows.push({ k: 'work', t: `${works.length - 3} more works under way`, n: '', s: 'Your settlements, in the realm\'s panel', act: 'realm', small: true });
    for (const a of sim.army.of(c.id).slice(0, 2)) rows.push({ k: 'host', t: a.name, n: sim.army.fmtMen(a.men), s: (HOST_ST[a.state] || 'In the field') + (a.state === 'siege' ? ' · ' + Math.round(a.siege * 100) + '%' : ''), act: 'host', id: a.id });
    for (const k of Object.keys(c.wars)) { const b = sim.civs[+k]; if (!b) continue; const sc = sim.diplo ? sim.diplo.score(c, b) : 0; rows.push({ k: 'war', cls: 'war', t: sim.fullName(b), n: Math.abs(sc) < 0.005 ? 'even' : (sc > 0 ? '+' : '−') + Math.round(Math.abs(sc) * 100), s: `At war since ${sim.fmtYear(c.wars[k])}`, act: 'war', id: b.id, tip: 'How the war stands: the share of its land the other side has lost since it began, less yours' }); }
    { const v = sim.legacyView ? sim.legacyView() : null; if (v && v.now.length) { const n = v.now.filter((a) => a.got).length, next = v.now.filter((a) => !a.got).sort((a, b) => b.p - a.p)[0]; rows.push({ k: 'gold', icon: TK_ICON.gold, t: 'Ambitions of the age', n: `${n} of ${v.now.length}`, s: next ? `Nearest: ${next.name}, ${next.p >= 0.995 ? 'all but done' : Math.round(next.p * 100) + '%'}` : 'All fulfilled', act: 'legacy', tip: `The ambitions of the ${v.age}: fulfilled in their age, remembered for ever` }); } }
    { const DV = sim.diseaseView ? sim.diseaseView() : null; if (DV) { for (const m of DV.mine.slice(0, 2)) rows.push({ k: 'sick', cls: 'war', t: m.name.charAt(0).toUpperCase() + m.name.slice(1), n: Math.round(m.f * 100) + '%', s: `${m.kind} · since ${sim.fmtYear(m.since)}`, act: 'sick', tip: 'How fiercely it burns in your realm now; Shift+P shows where else' }); if (DV.q) rows.push({ k: 'sick', cls: 'warn', t: DV.q === 2 ? 'Shut against the sick' : 'Harbours shut to the sick', n: DV.q === 2 ? '−12%' : '−5%', s: 'Income, while it lasts', act: 'sick', small: true }); } }
    { const CL = sim.climate; if (CL) { const hv = sim.harvestOf(c.id), dead = sim.starvedOf(c.id), sp = CL.spellsIn(c.id).find((x) => x.kind === 'drought'), W_ = c.capital >= 0 ? sim.climateHere(c.capital) : null, ev = W_ && W_.event && W_.event.kind !== 'warm' ? W_.event : null;
        if (hv < 0.95 || dead > 0.05) rows.push({ k: ev && ev.kind !== 'drought' ? 'cold' : 'dry', cls: hv < 0.85 || dead > 0.05 ? 'war' : 'warn', t: ev ? ev.name.charAt(0).toUpperCase() + ev.name.slice(1) : sp ? `A drought, the ${ordinal(sp.years)} year` : 'A poor harvest', n: Math.round(hv * 100) + '%', s: `The harvest, against an ordinary year's${dead > 0.05 ? ` · ${fmtPop(dead)} starved` : ''}`, act: 'hrv', i: sp ? sp.at : -1, tip: ev ? ev.text : 'The rains have failed over part of your land. Granaries, grain from abroad and the court\'s bread keep the hungry alive.' }); } }
    { const X = sim.intrigueView ? sim.intrigueView() : null, q = X && X.s; if (q) rows.push({ k: 'spy', t: `${q.scheme} · ${q.realm}`, n: q.left + ' yrs', bar: q.p, act: 'intrigue', tip: `Your agents in ${q.realm}: ${Math.round(q.odds * 100)}% to succeed, ${Math.round(q.risk * 100)}% to be found out on the way` }); }
    { const m = c.mig, P0 = Math.max(1, sim.popOf[c.id]); if (sim.mig && m && ((m.li || 0) > 0.02 * P0 || (m.lo || 0) > 0.02 * P0)) rows.push({ k: 'mig', t: (m.li || 0) >= (m.lo || 0) ? 'Newcomers' : 'Your people leaving', n: Math.round(100 * Math.max(m.li || 0, m.lo || 0) / P0) + '%', s: `${m.li > 0 ? fmtPop(m.li) + ' came' : ''}${m.li > 0 && m.lo > 0 ? ' · ' : ''}${m.lo > 0 ? fmtPop(m.lo) + ' left' : ''} in ten years`, act: 'folk', tip: 'Who came, who left, and what your borders say: the Peoples tab of the laws.' }); }
    const K = sim.culture; if (K && K.isGolden(c.id)) rows.push({ k: 'gold', cls: 'good', t: 'A golden age', n: '', s: 'Until ' + sim.fmtYear(K.goldenNeed(c.id).until), act: 'cult' });
    const F = sim.finance; if (F && F.debt[c.id] > 0.5) rows.push({ k: 'debt', cls: c.wealth < 0 ? 'warn' : '', t: 'Debts of ' + fmtInt(F.debt[c.id]), n: (100 * F.rateOf[c.id]).toFixed(1) + '%', s: 'Interest ' + fmtInt(F.debt[c.id] * F.rateOf[c.id]) + ' a year', act: 'fin' });
    const key = rows.map((r) => [r.k, r.cls, r.t, r.n, r.s, r.bar === undefined ? '' : Math.round(r.bar * 40)].join('|')).join('/') + ':' + (settings.trackerFolded ? 1 : 0);
    el.hidden = !rows.length; el.classList.toggle('folded', !!settings.trackerFolded); $('tk-fold').setAttribute('aria-expanded', String(!settings.trackerFolded));
    if (key === tkKey) return; tkKey = key; tkRows = rows;
    $('tk-body').innerHTML = rows.map((r, k) => `<button class="trk ${r.k} ${r.cls || ''}${r.small ? ' small' : ''}" data-tk="${k}"${r.tip ? ` title="${esc(r.tip)}"` : ''}><span class="ic"><svg viewBox="0 0 24 24">${r.icon || TK_ICON[r.k] || T_ICON[r.k] || T_ICON.story}</svg></span><span class="t">${esc(r.t)}</span><span class="n">${esc(r.n || '')}</span>${r.bar !== undefined ? `<span class="bar"><i style="width:${Math.round(r.bar * 100)}%"></i></span>` : `<span class="s">${esc(r.s || '')}</span>`}</button>`).join('');
  }
  function trackerAct(r) {
    if (!r || !sim) return;
    switch (r.act) {
      case 'story': TALES.open(); break;
      case 'study': TREE.open(); break;
      case 'gov': GOV.open(); break;
      case 'folk': GOV.open('folk'); break;
      case 'cell': { const [lon, lat] = placeOf(r.i); mapcam.flyTo(lon, lat, viewDist(r.i), { duration: 1.4 }); select(r.i); break; }
      case 'realm': openRealm(); break;
      case 'host': { const a = sim.army.byId(r.id); if (a) { selectHost(a.id); const [lon, lat] = sim.army.cellLL(a.cell); mapcam.flyTo(lon, lat, Math.min(Math.max(mapcam.dist, 0.004), 0.03), { duration: 1.4 }); } break; }
      case 'war': ENVOYS.open(null, r.id); break;
      case 'cult': WORKS.open(); break;
      case 'fin': MARKET.open('fin'); break;
      case 'legacy': openChronicle('legacy'); break;
      case 'intrigue': ENVOYS.open('intrigue'); break;
      case 'sick': if (!view.sick) setLens('sick'); break;
      case 'hrv': if (!view.hrv) setLens('hrv'); if (r.i >= 0) { const [lon, lat] = placeOf(r.i); mapcam.flyTo(lon, lat, Math.max(mapcam.dist, 0.25), { duration: 1.4 }); } break;
    }
    updateTurnButton();
  }

  // ---------- attention queue + the turn button ----------
  const T_ICON = { story: '<path d="M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2zM6 18a2 2 0 0 1 2-2h11M10 8h6M10 11h5"/>', faith: '<path d="M12 21c4 0 6-3 6-6 0-4-4-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8 0 3 2 6 6 6z"/>', demand: '<path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z"/>', rising: '<path d="M12 3l9 16H3z M12 9v5M12 16v1"/>', study: '<path d="M12 6c-2-1.500-5-2-8-2v14c3 0 6 .500 8 2 2-1.500 5-2 8-2V4c-3 0-6 .500-8 2zM12 6v14"/>', disaster: '<path d="M12 3l9 16H3z M12 9v5M12 16v1"/>', war: '<path d="M4 4l16 16M20 4L4 20"/>', capital: '<path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z"/>', envoy: '<path d="M4 6h16v12H4zM4 7l8 6 8-6"/>', split: '<path d="M6 6l6 6-6 6M12 6l6 6-6 6"/>', stab: '<path d="M12 4v9M12 17v2"/>', debt: '<path d="M12 5v14M8 9h5a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h6"/>', era: '<path d="M12 3l2.4 5.4 5.6.6-4.2 3.8 1.2 5.6L12 15.6 7 18.4l1.2-5.6L4 9l5.6-.6z"/>', grow: '<path d="M4 20h16M7 20V8h4v12M13 20v-7h4v7"/>', gone: '<path d="M5 5l14 14M19 5L5 19"/>', play: '<path d="M6 4l14 8-14 8z"/>', stop: '<path d="M6 6h12v12H6z"/>', pause: '<path d="M8 5v14M16 5v14"/>' };
  function computeAttention() {
    const c = sim && sim.playerCiv(); if (!c) return [];
    const out = []; const yb = Math.floor(sim.year / 20);
    // a story before the court: it waits for an answer, and the turn with it
    { const v = c.story && c.story.q && window.TALES ? TALES.waiting() : null; if (v) out.push({ id: 'story', kind: 'story', cls: 'good', t1: 'A story', t2: v.title, body: 'Choose what your court does. The turn goes on when you have answered.', act: () => TALES.open() }); }
    const wars = Object.keys(c.wars).map(k => +k).filter(k => sim.civs[k]);
    const fresh = wars.filter(k => !seen.wars.has(k));
    for (const k of fresh) { const w = sim.civs[k]; out.push({ id: 'war' + k, kind: 'war', cls: 'war', t1: 'War', t2: `${sim.fullName(w)} · at war with you`, body: 'Fly to their capital. How the war stands and what peace would take: War and peace, in their panel. Or raise a levy and fight.', act: () => { seen.wars.add(k); if (w.capital >= 0) { const [lon, lat] = placeOf(w.capital); mapcam.flyTo(lon, lat, Math.min(Math.max(mapcam.dist, 0.02), 0.08)); select(w.capital); } } }); }
    for (const k of [...seen.wars]) if (!wars.includes(k)) seen.wars.delete(k);
    // news of the host in the field: the newest of it, until it is looked at
    { const N = sim.army.news; const n = N.length ? N[N.length - 1] : null; if (n && sim.year - n.year <= Math.max(30, TURN_YEARS[c.era] * 2) && !seen.ack.has('host' + n.seq)) out.push({ id: 'host' + n.seq, kind: 'war', cls: n.kind === 'won' || n.kind === 'taken' ? 'good' : 'war', t1: 'Host', t2: n.text, act: () => { seen.ack.add('host' + n.seq); const a = sim.army.of(c.id)[0]; const [lon, lat] = sim.army.cellLL(n.cell); mapcam.flyTo(lon, lat, Math.min(Math.max(mapcam.dist, 0.004), 0.03)); if (a) selectHost(a.id); } }); }
    // envoys waiting on an answer: the weightiest first (a peace offered, a call to arms, a demand), then what is merely proposed
    { const t = ENVOYS.tile(); if (t) { const heavy = (o) => o.kind === 'peace' || o.kind === 'call' || o.kind === 'submit' ? 0 : 1; for (const o of t.offers.filter((o) => !seen.ack.has('offer' + o.id)).sort((a, b) => heavy(a) - heavy(b)).slice(0, 3)) out.push({ id: 'offer' + o.id, kind: 'envoy', cls: heavy(o) ? 'good' : 'warn', t1: 'Envoys', t2: o.text, body: `Answer them in Diplomacy. They wait until ${sim.fmtYear(o.until)}, then go home.`, act: () => { seen.ack.add('offer' + o.id); ENVOYS.open('envoys'); } }); } }
    if (turnRun.capital >= 0 && turnRun.capital !== c.capital && !seen.ack.has('cap' + c.capital)) out.push({ id: 'cap', kind: 'capital', cls: 'war', t1: 'Capital', t2: `The court now sits at ${sim.cellName.get(c.capital) || 'a new seat'}`, act: () => { seen.ack.add('cap' + c.capital); goHome(); } });
    const recent = c.events.slice(-12).filter(e => sim.year - e.year <= Math.max(60, TURN_YEARS[c.era] * 2));
    const split = recent.find(e => /breaks? away/.test(e.text));      // (a realm breaks away; the people of a province break away: people.js) if (split && !seen.ack.has('split' + split.year)) out.push({ id: 'split', kind: 'split', cls: 'war', t1: 'Revolt', t2: split.text.replace(/ from .*$/, ''), act: () => { seen.ack.add('split' + split.year); if (split.loc >= 0) { const [lon, lat] = placeOf(split.loc); mapcam.flyTo(lon, lat, Math.min(Math.max(mapcam.dist, 0.02), 0.08)); select(split.loc); } } });
    if (c.stability < 0.3 && !seen.ack.has('stab' + yb)) out.push({ id: 'stab', kind: 'stab', cls: 'warn', t1: 'Unrest', t2: `Stability ${Math.round(c.stability * 100)}% · the realm may fracture`, body: 'Lower taxes, end wars, build temples.', act: () => { seen.ack.add('stab' + yb); openRealm(); } });
    { const food = sim.satOf(c.id, 'food'); if (food >= 0.65) seen.ack.delete('food'); if (food < 0.55 && sim.market.steps > 30 && !seen.ack.has('food')) out.push({ id: 'food', kind: 'stab', cls: 'warn', t1: 'Hunger', t2: `Your people get ${Math.round(food * 100)}% of the food they want`, body: 'Buy food for the reserve and release it, raise a granary, or settle land that feeds.', act: () => { seen.ack.add('food'); MARKET.open('board', sim.GOOD_ID.grain); } }); }
    if (c.wealth < 0 && !seen.ack.has('debt' + yb)) { const F = sim.finance, can = F && F.canBorrow(c.id) && F.room(c.id) > 1; out.push({ id: 'debt', kind: 'debt', cls: 'warn', t1: 'Empty treasury', t2: (c.income || 0) < 0 ? `Losing ${Math.abs(c.income || 0).toFixed(1)} a year` : `${fmtInt(c.wealth)} in the treasury`, body: can ? `Raise taxes, cut military spending, or borrow: lenders would give you up to ${fmtInt(F.room(c.id))} (Market, Treasury).` : 'Raise taxes or cut military spending.', act: () => { seen.ack.add('debt' + yb); if (can) MARKET.open('fin'); else openRealm(); } }); }
    { const t = TREE.tile(); if (t && !t.waiting) seen.ack.delete('study'); if (t && t.waiting && !seen.ack.has('study')) out.push({ id: 'study', kind: 'study', cls: 'good', t1: 'Knowledge', t2: t.pool >= 250 ? `Your people can learn something at once: choose what` : 'Your scholars await your word: choose what to study', body: 'Open the tree and choose a discovery. Left alone for a generation, the scholars choose for themselves.', act: () => { seen.ack.add('study'); TREE.open('tree'); } }); }
    // a prophet has arisen and waits for the court: the player founds his faith (faith.js; the Faith page of the laws screen)
    { const F = sim.faith, at = F ? F.pending[c.id] : -1; if (at >= 0 && !F.state[c.id] && !seen.ack.has('prophet' + at)) out.push({ id: 'prophet', kind: 'faith', cls: 'good', t1: 'A prophet', t2: `A prophet has arisen in ${sim.cellName.get(at) || 'your capital'}: found his faith`, body: 'Choose its name and two tenets: how it spreads, how it suffers others, whether it fights for its holy city.', act: () => { seen.ack.add('prophet' + at); GOV.openFaith('new'); } }); }
    { const g = GOV.tile(); if (g && g.demand && !seen.ack.has('demand' + g.demand.since)) out.push({ id: 'demand', kind: 'demand', cls: 'warn', t1: 'A demand', t2: `${g.demand.who} demand a new law: ${g.demand.law.name}`, body: 'Grant it and they are content for a while; refuse and they remember. Unanswered, it lapses as a refusal.', act: () => { seen.ack.add('demand' + g.demand.since); GOV.open('estates'); } });
      if (g && g.rose > -1e8 && sim.year - g.rose <= TURN_YEARS[c.era] && !seen.ack.has('rose' + g.rose)) out.push({ id: 'rising', kind: 'rising', cls: 'war', t1: 'A rising', t2: (c.events.slice().reverse().find(e => e.type === 'law' && e.year === g.rose) || { text: 'An estate has risen against you' }).text, body: 'See who is angry, and why: open the estates.', act: () => { seen.ack.add('rose' + g.rose); GOV.open('estates'); } });
      const yb = Math.floor(sim.year / (TURN_YEARS[c.era] * 3)); if (g && g.army && !seen.ack.has('army' + yb)) out.push({ id: 'army', kind: 'rising', cls: 'warn', t1: 'The army is watching', t2: `Stability ${Math.round(c.stability * 100)}: where a government cannot hold, ${g.army.who.toLowerCase()} march on the capital`, body: 'Steady the realm (lower taxes, end a war, content the estates) before someone else offers to.', act: () => { seen.ack.add('army' + yb); GOV.open('estates'); } }); }
    if (seen.era >= 0 && c.era > seen.era) out.push({ id: 'era', kind: 'era', cls: 'good', t1: 'New era', t2: `Your people enter the ${sim.ERAS[c.era][0]}`, act: () => { seen.era = c.era; bigBanner(sim.ERAS[c.era][0], sim.fullName(c) + ' · ' + sim.fmtYear(sim.year), eraArt(c.era)); } });
    const dis = c.events.slice(-12).filter(e => e.type === 'disaster' && !e.calm && sim.year - e.year <= 6 && !seen.ack.has('dis' + e.year + e.loc));
    for (const e of dis.slice(0, 2)) out.push({ id: 'dis' + e.year, kind: 'disaster', cls: 'warn', t1: 'Disaster', t2: e.text, body: 'Fly there to see the damage. Treasuries rebuild walls and works.', act: () => { seen.ack.add('dis' + e.year + e.loc); if (e.loc >= 0) { const [lon, lat] = placeOf(e.loc); mapcam.flyTo(lon, lat, Math.max(viewDist(e.loc), 0.0012)); select(e.loc); } } });
    return out;
  }
  // soft advice: never blocks the turn
  function computeAdvice() {
    const c = sim && sim.playerCiv(); if (!c) return null;
    if (turnRun.townSet) { const grown = sim.settlementsOf(c.id).find(i => sim.level[i] >= 2 && !turnRun.townSet.has(i) && !seen.ack.has('grow' + i)); if (grown) return { text: `${sim.cellName.get(grown)} has grown into a ${['', '', 'town', 'city', 'metropolis'][sim.level[grown]]}`, go: grown, ack: 'grow' + grown }; }
    const towns = sim.settlementsOf(c.id).filter(i => sim.level[i] >= 2);
    const can = (k) => c.wealth >= sim.costOf(k);
    if (can('academy') && towns.some(i => !sim.cannot('academy', i))) return { text: 'You can afford an Academy: more insight every year', tool: 'academy' };
    if (can('temple') && c.stability < 0.7 && sim.settlementsOf(c.id).some(i => !sim.cannot('temple', i))) return { text: 'A Temple would steady the realm', tool: 'temple' };
    if (can('port') && sim.settlementsOf(c.id).some(i => !sim.cannot('port', i))) return { text: 'A coastal town could take a Port', tool: 'port' };
    if (can('market') && sim.settlementsOf(c.id).some(i => !sim.cannot('market', i))) return { text: 'A Market would lift your income', tool: 'market' };
    if (can('wonder') && c.capital >= 0 && !sim.cannot('wonder', c.capital)) return { text: 'Your treasury could raise a Wonder in the capital', tool: 'wonder' };
    // what the market is short of, and the building that would mend it
    { const short = MARKET.shortages(); const fix = { cloth: ['weaver', 'Your people lack clothing: raise a Weaving house'], wares: ['workshop', 'Your people lack wares: raise Workshops'], comfort: ['brewery', 'Your people have little to drink: raise a Brewery'], arms: ['smithy', 'Your army lacks arms: raise a Smithy'], ships: ['shipyard', 'Your harbours lack ships: raise a Shipyard'], food: ['granary', 'Food runs short in bad years: raise a Granary'] };
      for (const [C] of short) { const f = fix[C.key]; if (!f) continue; const need = sim.needFor(f[0], c.capital); if (need && need.era <= c.era && !seen.ack.has('learn' + need.key)) return { text: `${C.name}: your people go short. ${need.name} would mend it`, know: need.key, ack: 'learn' + need.key }; if (can(f[0]) && towns.concat(sim.settlementsOf(c.id)).some(i => !sim.cannot(f[0], i))) return { text: f[1], tool: f[0] }; }
      if (short.length && !seen.ack.has('short' + short[0][0].key + Math.floor(sim.year / 40))) return { text: `${short[0][0].name}: your people have ${Math.round(short[0][1] * 100)}% of what they want. See the market`, market: short[0][0].key }; }
    { const g = GOV.tile(); const yb3 = Math.floor(sim.year / (TURN_YEARS[c.era] * 3)); if (g && !g.reform && g.auth >= 60 && !seen.ack.has('auth' + yb3)) { const b = sim.rule.best(c.id, c, false); if (b) return { text: `Your word carries: ${b.x.name} is within your authority`, gov: b.x.key, ack: 'auth' + yb3 }; } }
    if (can('farm') && c.wealth > sim.costOf('farm') * 4 && sim.settlementsOf(c.id).some(i => !sim.cannot('farm', i))) return { text: 'Treasury is full: lay out Farms around a town', tool: 'farm' };
    if (c.policy.stance !== 'aggressive' && can('settle') && c.wealth > sim.costOf('settle') * 3) return { text: 'You could Expand: settle new land', tool: 'settle' };
    return null;
  }
  function turnLength() { const c = sim && sim.playerCiv(); return TURN_YEARS[c ? c.era : 0]; }
  function snapshotTurn() {
    const c = sim.playerCiv(); turnRun.start = sim.year; turnRun.seq = sim.evSeq; turnRun.evIdx = sim.worldEvents.length; turnRun.rose = c ? sim.rule.ruleOf(c).rose : -1e9;
    turnRun.capital = c ? c.capital : -1; turnRun.era = c ? c.era : 0; turnRun.wars = c ? Object.keys(c.wars).sort().join(',') : '';
    turnRun.townSet = c ? new Set(sim.settlementsOf(c.id).filter(i => sim.level[i] >= 2)) : null; turnRun.towns = turnRun.townSet ? turnRun.townSet.size : 0;
    turnRun.pop0 = c ? sim.popOf[c.id] : 0; turnRun.cells0 = c ? sim.cellsOf[c.id] : 0; turnRun.wealth0 = c ? c.wealth : 0; turnRun.live0 = c ? sim.market.LS[c.id] : 0;
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
    if (reason === 'story') setTimeout(() => { if (!turnRun.active && mode === 'play') TALES.show(() => updateTurnButton()); }, 380);      // (the story is read as soon as the turn has stopped)
  }
  function deselectTool() { if (tool) setTool(null); }
  // interrupts: things that should stop the clock so you can react
  function checkInterrupts() {
    const c = sim.playerCiv(); if (!c) { endTurn('gone'); return; }
    const wars = Object.keys(c.wars).sort().join(','); if (wars !== turnRun.wars && Object.keys(c.wars).some(k => !seen.wars.has(+k))) { endTurn('war'); return; }
    if (c.capital !== turnRun.capital) { endTurn('capital'); return; }
    if (c.era !== turnRun.era) { endTurn('era'); return; }
    { const q = c.story && c.story.q; if (q && q.y >= turnRun.start && turnRun.tale !== q.k + q.y) { turnRun.tale = q.k + q.y; endTurn('story'); return; } }
    if (c.stability < 0.25 && !seen.ack.has('stab' + Math.floor(sim.year / 20))) { endTurn('stab'); return; }
    // everything logged since the last look (several years can pass between frames)
    const since = turnRun.seq || 0; const recent = c.events.filter(e => (e.seq || 0) > since); turnRun.seq = sim.evSeq;
    if (recent.some(e => /breaks? away/.test(e.text))) { endTurn('split'); return; }
    { const N = sim.army.news; const fresh = N.filter((n) => n.seq > (turnRun.hostSeq || 0)); if (fresh.length) { turnRun.hostSeq = N[N.length - 1].seq; if (fresh.some((n) => n.kind === 'broken' || n.kind === 'lost' || n.kind === 'taken' || n.kind === 'siege')) { endTurn('host'); return; } } }
    { const Q = sim.rule.ruleOf(c); if (Q.rose > turnRun.rose) { turnRun.rose = Q.rose; endTurn('rising'); return; } if (Q.demand && Q.demand.since > turnRun.start && !seen.ack.has('demand' + Q.demand.since)) { endTurn('demand'); return; } }
    { const t = TREE.tile(); if (t && t.waiting && recent.some(e => e.type === 'know')) { seen.ack.delete('study'); endTurn('study'); return; } }
    // (envoys with something that cannot wait: a peace offered, a call to arms, a demand to submit. What is merely proposed waits for the turn's end)
    { const t = ENVOYS.tile(); if (t && t.offers.some((o) => o.since > turnRun.start && (o.kind === 'peace' || o.kind === 'call' || o.kind === 'submit') && !seen.ack.has('offer' + o.id))) { endTurn('envoy'); return; } }
    if (recent.some(e => e.type === 'disaster' && !e.calm && !seen.ack.has('dis' + e.year + e.loc))) { endTurn('disaster'); return; }      // (not a calm one: a drought is told, and only a story of it stops the turn - with one in every few decades a turn of the Stone Age stopped four times)
  }
  // what needs the player, as a row of seals beside the turn button: the nearest is what the button opens; each opens its own
  let notesKey = '', notesList = [];
  function renderNotes(q) {
    const key = q.map((a) => a.id + ':' + a.cls + ':' + a.t2).join('|'); if (key === notesKey) return; notesKey = key; notesList = q.slice(0, 7);
    const box = $('notes'); box.innerHTML = notesList.map((a, k) => `<button class="note ${a.cls || ''}" data-note="${k}" aria-label="${esc(a.t1 + ': ' + a.t2)}"><svg viewBox="0 0 24 24">${T_ICON[a.kind] || T_ICON.era}</svg></button>`).join('') + (q.length > 7 ? `<span class="more">+${q.length - 7}</span>` : '');
    box.querySelectorAll('.note').forEach((el) => { const a = notesList[+el.dataset.note]; attachTip(el, () => `<b>${esc(a.t1)}</b>${esc(a.t2)}${a.body ? `<div class="hint">${esc(a.body)}</div>` : ''}`); });
  }
  function updateTurnButton() {
    const b = $('turn'); const l1 = $('turn1'), l2 = $('turn2'), ico = $('turnico'), badge = $('turnbadge'), fill = $('turnfill');
    const c = sim && sim.playerCiv();
    const setState = (cls, t1, t2, icon) => { b.className = 'state-' + cls; l1.textContent = t1; l2.textContent = t2; ico.innerHTML = T_ICON[icon] || T_ICON.play; };
    const eraP = () => { const ref = c || { tech: 0, era: 0 }; const next = sim.ERAS[ref.era + 1]; const from = sim.ERAS[ref.era][1]; return next ? clamp((ref.tech - from) / (next[1] - from), 0, 1) : 1; };
    badge.hidden = true;
    if (!sim) return;
    if (!c) { setState('over', 'Gone', 'Your people are no more · menu', 'gone'); fill.style.strokeDashoffset = '295.3'; renderNotes([]); return; }
    const av = $('advisor');
    const softAdvice = () => { av.classList.remove('att'); av.dataset.att = ''; av.dataset.tool = ''; av.dataset.go = ''; av.dataset.ack = ''; av.dataset.market = ''; av.dataset.know = ''; av.dataset.gov = ''; const adv = computeAdvice(); if (adv) { av.hidden = false; $('advisor-text').textContent = adv.text; av.dataset.tool = adv.tool || ''; av.dataset.go = adv.go >= 0 ? adv.go : ''; av.dataset.ack = adv.ack || ''; av.dataset.market = adv.market || ''; av.dataset.know = adv.know || ''; av.dataset.gov = adv.gov || ''; } else av.hidden = true; };
    if (settings.continuous) {
      setState(paused ? 'advance' : 'running', paused ? 'Play' : 'Pause', '', paused ? 'play' : 'pause'); fill.style.strokeDashoffset = (295.3 * (1 - eraP())).toFixed(1); b.title = paused ? 'Run time (Enter)' : 'Pause (Enter)';
      const q = computeAttention(); renderNotes(q);
      if (q.length) { av.hidden = false; av.classList.add('att'); av.dataset.att = '1'; av.dataset.tool = ''; av.dataset.go = ''; av.dataset.ack = ''; $('advisor-text').textContent = `${q[0].t1}: ${q[0].t2}`; } else softAdvice();
      return;
    }
    if (turnRun.active) { const p = clamp((sim.year - turnRun.start) / Math.max(1, turnRun.target - turnRun.start), 0, 1); setState('running', sim.fmtYear(sim.year), 'click to stop', 'stop'); fill.style.strokeDashoffset = (295.3 * (1 - p)).toFixed(1); av.hidden = true; renderNotes([]); return; }
    const q = computeAttention(); renderNotes(q);
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
    const why = { war: 'War declared on you', capital: 'Your capital changed', era: 'A new era', stab: 'Unrest', split: 'A province broke away', stopped: 'Stopped early', gone: 'Your people are gone', disaster: 'Disaster strikes your lands', study: 'A discovery: your scholars await your word', demand: 'An estate of your realm makes a demand', rising: 'An estate of your realm has risen', envoy: 'Envoys wait on your answer', story: (() => { const v = window.TALES && TALES.waiting(); return v ? 'A story: ' + v.title : 'A story before your court'; })(), host: (() => { const N = sim.army.news; return N.length ? N[N.length - 1].text : 'News of your host'; })() }[turnRun.reason] || '';
    $('report-title').textContent = `${sim.fmtYear(turnRun.start)} → ${sim.fmtYear(sim.year)}`;
    const wy = $('report-why'); wy.hidden = !why; wy.textContent = why; wy.className = 'why ' + (turnRun.reason || '');
    // a painted strip for the moment that stopped the clock
    const art = $('report-art'); const artUrl = why ? reportArt(turnRun.reason, mine) : '';
    if (art) { art.hidden = !artUrl; art.style.backgroundImage = artUrl ? `url("${artUrl}")` : ''; }
    const dP = sim.popOf[c.id] - (turnRun.pop0 || 0), dC = sim.cellsOf[c.id] - (turnRun.cells0 || 0), dW = c.wealth - (turnRun.wealth0 || 0), dL = sim.market.LS[c.id] - (turnRun.live0 || 0);
    $('report-delta').innerHTML = `<span><b>${fmtPop(sim.popOf[c.id])}</b> people <span class="${dP >= 0 ? 'pos' : 'neg'}">${fmtDeltaK(dP)}</span></span><span><b>${fmtInt(sim.cellsOf[c.id])}</b> regions <span class="${dC >= 0 ? 'pos' : 'neg'}">${fmtSigned(dC, 0)}</span></span><span><b>${fmtInt(c.wealth)}</b> treasury <span class="${dW >= 0 ? 'pos' : 'neg'}">${fmtSigned(dW, 0)}</span></span>${sim.market.steps > 20 ? `<span><b>${Math.round(sim.market.LS[c.id] * 100)}%</b> living <span class="${dL >= 0 ? 'pos' : 'neg'}">${fmtSigned(dL * 100, 0)}</span></span>` : ''}`;
    const fe = (e, k) => `<div class="fe ${e.type}${e.mine ? ' mine' : ''}" data-k="${k}"><svg viewBox="0 0 24 24">${FEED_ICON[e.type] || FEED_ICON.city}</svg><div><span class="y">${sim.fmtYear(e.year)}</span>${esc(e.text)}</div></div>`;
    let html = '';
    if (mine.length) html += `<div class="rg">Your realm</div>` + mine.map((e, k) => fe(e, k)).join('');
    if (others.length) html += `<div class="rg">Elsewhere</div>` + others.map((e, k) => fe(e, mine.length + k)).join('');
    // the market: what moved at home over these years, and what is short
    { const mv = MARKET.movers(Math.min(60, Math.max(5, sim.year - turnRun.start))); const sh = MARKET.shortages().slice(0, 2); const G = sim.GOODS;
      if (mv.length || sh.length) html += `<div class="rg">Market</div>` + mv.map(([g, d]) => `<div class="fe mk" data-good="${g}">${goodSvg(G[g].key)}<div>${esc(G[g].name)} ${d > 0 ? 'dearer' : 'cheaper'} by ${Math.abs(d * 100).toFixed(0)}%: now ${MARKET.fp(sim.market.price(c.id, g))} a lot</div></div>`).join('') + sh.map(([C, v]) => `<div class="fe mk disaster" data-cat="${C.key}"><svg viewBox="0 0 24 24">${FEED_ICON.disaster}</svg><div>Short of ${esc(C.name.toLowerCase())}: ${Math.round(v * 100)}% of what ${C.state ? 'the state wants' : 'your people want'}</div></div>`).join(''); }
    $('report-body').innerHTML = html || (why ? '' : '<div class="hint" style="padding:4px 6px">A quiet stretch of years. Your people grew, and nothing else happened worth recording.</div>');
    $('report-body').hidden = !html && !!why;
    $('report-body').querySelectorAll('.fe.mk').forEach(el => el.addEventListener('click', () => { if (el.dataset.good) MARKET.open('board', +el.dataset.good); else MARKET.open('ledger'); }));
    $('report-body').querySelectorAll('.fe:not(.mk)').forEach(el => el.addEventListener('click', () => { const e = list[+el.dataset.k]; if (e && e.loc >= 0) { const [lon, lat] = placeOf(e.loc); mapcam.flyTo(lon, lat, Math.min(Math.max(mapcam.dist, 0.02), 0.2)); select(e.loc); } }));
    box.hidden = false;
  }

  // ---------- chronometer ----------
  function updateClock() {
    const y = sim.year; $('year').textContent = Math.abs(y).toLocaleString(); $('yearera').textContent = y < 0 ? 'BC' : 'AD';
    $('speedval').firstChild.textContent = paused ? '❚❚' : SPEEDS[speedIdx] + '×';
    $('btn-pause').classList.toggle('on', paused);
    let best = 0; for (const c of sim.civs) if (c && c.tech > best) best = c.tech;
    $('worldera').textContent = sim.st.civCount ? sim.ERAS[sim.eraOf(best)][0] : 'Before history';
    // the nine ages: the player's (or, without a realm, the world's front) as far as it has come, and where the world's front is
    { const pc = sim.playerCiv(), t = pc ? pc.tech : best, e = sim.eraOf(t), lead = sim.eraOf(best), from = e ? sim.ERAS[e][1] : 0, next = sim.ERAS[e + 1];
      const p = next ? clamp((t - from) / (next[1] - from), 0, 1) : 1; const key = `${e}:${Math.round(p * 50)}:${lead}:${pc ? 1 : 0}`;
      if (key !== agesKey) { agesKey = key; [...$('ages').children].forEach((el, k) => { el.className = (k < e ? 'past' : k === e ? 'now' : '') + (pc && k === lead && lead > e ? ' lead' : ''); if (k === e) el.style.setProperty('--p', Math.round(p * 100) + '%'); }); } }
  }
  let agesKey = '';
  // the weather as the ground's shader is told it (climate.js): once a year of the world, not every frame
  let climV = null, climYear = NaN, climSim = null;
  function climateUniforms() {
    const CL = sim && !window.__noWeather ? sim.climate : null, g = globals;      // (window.__noWeather: the ground's shader told there is none, to measure what it costs: __T.costsClimate)
    if (!CL) { if (climYear !== -1e9) { g.uDome.value.fill(0); g.uGreenS.value.set(0, 0, 0, 0); g.uDryC.value.fill(0); g.uDryS.value.fill(0); g.uChill.value = 0; climYear = -1e9; } return; }
    if (CL.ver === climYear && climSim === sim) return; climYear = CL.ver; climSim = sim; climV = CL.view(climV);      // (again whenever the weather has moved: a year, or a world loaded)
    const unit = (lon, lat, out, k) => { const a = lon * Math.PI / 180, b = lat * Math.PI / 180; out[k] = Math.cos(b) * Math.cos(a); out[k + 1] = Math.cos(b) * Math.sin(a); out[k + 2] = Math.sin(b); };
    g.uDome.value.set(climV.domes); g.uDomeA.value.set(climV.domeA);
    const C = g.uDryC.value, S = g.uDryS.value; for (let k = 0; k < CLIMATE.MAXV; k++) { if (k < climV.nDry) { unit(climV.dry[k * 4], climV.dry[k * 4 + 1], C, k * 4); const r = climV.dry[k * 4 + 2] / 6371; C[k * 4 + 3] = r * r; S[k] = climV.dry[k * 4 + 3]; } else { C[k * 4 + 3] = 0; S[k] = 0; } }
    g.uGreenS.value.set(climV.green[0], climV.green[1], climV.green[2], climV.green[3]); g.uChill.value = climV.chill;
  }
  function climTip() {
    const CL = sim && sim.climate; if (!CL) return ''; const ep = CL.epoch(), evs = window.CLIMATE.EVENTS.filter((e) => sim.year >= e.y0 && sim.year < e.y1);
    return `<div class="hint"><b>The climate: ${esc(ep.name)}.</b> ${esc(ep.text)}${evs.length ? ` Now: ${evs.map((e) => esc(e.name)).join(', ')}.` : ''}</div>`;
  }
  function agesTip() {
    const pc = sim && sim.playerCiv(); let best = 0; for (const c of sim.civs) if (c && c.tech > best) best = c.tech;
    const t = pc ? pc.tech : best, e = sim.eraOf(t), lead = sim.eraOf(best);
    const rows = sim.ERAS.map((E, k) => `<div class="row"><span>${k === e ? '<b style="display:inline;color:var(--m-hi)">' + E[0] + '</b>' : E[0]}</span><span class="num">${k === 0 ? 'from the first fields' : 'at ' + Math.round(E[1] * 100) + '% knowledge'}</span></div>`).join('');
    const next = sim.ERAS[e + 1], from = e ? sim.ERAS[e][1] : 0;
    return `<b>${pc ? 'Your people are in the ' + sim.ERAS[e][0] : 'The world is in the ' + sim.ERAS[lead][0]}</b>${rows}<div class="hint">${next ? `${Math.round(100 * clamp((t - from) / (next[1] - from), 0, 1))}% of the way to the ${next[0]}. ` : ''}${pc && lead > e ? `The most learned realm of the world is in the ${sim.ERAS[lead][0]}. ` : ''}Click for where you stand in knowledge.</div>${climTip()}`;
  }
  function setSpeedIdx(i) { speedIdx = clamp(i, 0, SPEEDS.length - 1); paused = false; updateClock(); updateTurnButton(); }

  // ---------- inspector ----------
  let chronicleCiv = -1;
  function updateInspector(force) {
    if (!sim || selected < 0) return;
    const i = selected; const o = sim.owner[i]; const c = o >= 0 ? sim.civs[o] : null; const name = sim.cellName.get(i);
    const lvl = ['Wild', 'Village', 'Town', 'City', 'Metropolis'][sim.level[i]]; const f = sim.flags[i];
    const lk = sim.landClass ? sim.landClass(i) : -1, fl = sim.farmland ? sim.farmland(i) : sim.fert[i];
    // (a realm of the Americas or Australia farms without the old world's beasts and crops until its people have met the old world)
    const apart = lk > 0 && c && c.capital >= 0 && window.LAND && sim.disease && !sim.disease.met(c.id) && LAND.worldAt(...cellCenter(c.capital)) > 0;
    const terrainTxt = !sim.land[i] ? 'Open water' : (f & 8) ? 'Ice' : (lk > 0 && window.LAND ? `${LAND.CLASSES[lk].name}${fl > 0.04 ? `, ${Math.round(Math.min(1, fl) * 100)}% farmland` : ''}` : (sim.fert[i] < 0.12 ? 'Desert or barren' : sim.fert[i] < 0.35 ? 'Marginal land' : sim.fert[i] < 0.6 ? 'Good land' : 'Rich land')) + ((f & 2) ? ', river' : '') + ((f & 4) ? ', coast' : '') + (apart ? ' · no beast of the plough yet' : '');
    const hCell = terrain.heightAt(...placeOf(i)); const isSea = !sim.land[i];
    const works = [sim.infra[i] ? 'developed ' + sim.infra[i] : '', sim.walls[i] ? 'walls ' + sim.walls[i] : '', sim.special[i] & 1 ? 'port' : '', sim.special[i] & 2 ? 'academy' : '', sim.special[i] & 4 ? 'temple' : '', sim.special[i] & 8 ? 'market' : '', sim.special[i] & 16 ? 'wonder' : '', sim.special[i] & 512 ? sim.workName(i).toLowerCase() : '', ...indNames(i)].filter(Boolean).join(', ');
    // header: the place is the title; who holds it is the subtitle
    $('sel-title').textContent = name || (isSea ? 'Open sea' : c ? 'Land of the ' + c.name : 'Unclaimed land'); $('sel-sw').style.background = c ? c.color : '#5b6779';
    $('sel-sub').textContent = c ? `${sim.level[i] ? lvl : 'Territory'}${c.capital === i ? ' · capital' : ''} of ${sim.fullName(c)}` : (isSea ? '' : 'Nobody lives here yet');
    const landTip = lk > 0 && window.LAND ? LAND.CLASSES[lk].text + (apart ? ' Its people farm without the beasts of the plough and the crops of the old world until they have met it.' : '') : '';
    const wx = !isSea && sim.climateHere ? weatherOf(sim.climateHere(i)) : null;
    $('sel-cell').innerHTML = `<span class="micro">Land</span><span${landTip ? ` title="${esc(landTip)}"` : ''}>${terrainTxt}</span>${wx ? `<span class="micro">This year</span><span class="${wx.cls || ''}" title="${esc(wx.tip)}">${esc(wx.t)}</span>` : ''}<span class="micro">Elevation</span><span class="num">${Math.round(hCell)} m</span>${isSea ? '' : `<span class="micro">People</span><span class="num">${fmtPop(sim.pop[i])} / ${fmtPop(sim.capacity(i, c))} fed</span>`}${(() => { const P = sim.people, p = P && P.ppl[i] && P.list[P.ppl[i]]; if (!p || isSea) return ''; const fam = P.list[p.fam]; return `<span class="micro">Who</span><span>the ${esc(p.name)}${fam && fam !== p ? `, of the ${esc(fam.name)} family` : ''}</span>`; })()}${(() => { const F = sim.faith; if (!F || isSea || !(sim.pop[i] > 0.02)) return ''; const f = F.fth[i], h = F.holyAt.get(i); return `<span class="micro">Faith</span><span>${f ? `<button class="linkish" data-faith="${f}">${esc(F.nameOf(f))}</button>` : 'the old ways'}${h ? ` · <b class="holy">holy city</b>${h !== f ? ` of <button class="linkish" data-faith="${h}">${esc(F.nameOf(h))}</button>` : ''}` : ''}</span>`; })()}${knowsCell(i) ? `<span class="micro">Yields</span><span><span class="goodchips">${goodChip(sim.GOODS[sim.goods[i]])}</span></span>` : ''}${works ? `<span class="micro">Works</span><span>${works}</span>` : ''}`;
    renderBuild(i);
    if (!c) { $('sel-civ').hidden = true; scrollHint(); return; }
    $('sel-civ').hidden = false; $('sc-name').textContent = sim.fullName(c);
    $('sc-era').textContent = sim.ERAS[c.era][0]; $('sc-gov').textContent = sim.govName(c) + (c.player ? ' · yours' : '');
    const wars = Object.keys(c.wars).map(k => sim.civs[+k]).filter(Boolean).map(x => sim.fullName(x)).join(', ');
    // its laws: for the player's own realm the way to the screen; for another, those that are not the player's
    const lawsLine = (() => { const mine = sim.playerCiv(); const q = sim.rule.ruleOf(c); if (c === mine) return `<button class="linkish" data-gopen="1">${RULE.CATS.filter(C => q.laws[C.key] !== C.laws[0].key).length} of ${RULE.CATS.length} fields reformed: open the laws</button>`; const mq = mine ? sim.rule.ruleOf(mine) : null; const other = RULE.CATS.map(C => RULE.LAW[q.laws[C.key]]).filter(L => !mq || mq.laws[L.cat] !== L.key); return other.length ? other.slice(0, 3).map(L => `<button class="linkish" data-ggo="${L.key}">${esc(L.name)}</button>`).join(', ') + (other.length > 3 ? ` and ${other.length - 3} more that are not yours` : mq ? ', unlike yours' : '') : 'the same as yours'; })();
    const kn = sim.know; const me0 = sim.playerCiv(); const ahead = []; if (me0 && c !== me0) for (const D of KNOW.LIST) if (kn.has[c.id * kn.ND + D.id] && !kn.has[me0.id * kn.ND + D.id]) ahead.push(D);      // what this realm knows that the player's does not
    $('sc-tiles').innerHTML = `<div class="tile"><span class="micro">People</span><span class="k">${fmtPop(sim.popOf[c.id])}</span><span class="d">${fmtInt(sim.cellsOf[c.id])} regions</span></div><div class="tile"><span class="micro">Strength</span><span class="k">${fmtInt(sim.mightOf[c.id])}</span><span class="d">${sim.year < c.army ? 'army raised' : 'no standing army'}${c.era >= 1 ? ` · armed ${Math.round(sim.satOf(c.id, 'arms') * 100)}%` : ''}</span></div><div class="tile"><span class="micro">Stability</span><span class="k ${c.stability < 0.3 ? 'neg' : c.stability < 0.5 ? 'warn' : ''}">${Math.round(c.stability * 100)}%</span><div class="bar"><i style="transform:scaleX(${c.stability.toFixed(2)});background:${c.stability > 0.5 ? 'var(--pos)' : c.stability > 0.3 ? 'var(--warn)' : 'var(--neg)'}"></i></div></div><div class="tile"><span class="micro">Knowledge</span><span class="k">${kn.count[c.id]}</span><span class="d">${c.player ? (kn.cur[c.id] >= 0 ? 'studying ' + esc(KNOW.LIST[kn.cur[c.id]].name) : 'discoveries') : 'discoveries'}</span></div>`;
    renderRuler(c);
    const gs = sim.market.goodsOf(c.id); const GG = sim.GOODS; const living = sim.market.LS[c.id]; const more = Math.max(0, gs.own.length - 8) + Math.max(0, gs.imp.length - 5);
    const tradeHtml = gs.own.length || gs.imp.length ? `<span class="goodchips">${gs.own.slice(0, 8).map(g => goodChip(GG[g])).join('')}${gs.imp.slice(0, 5).map(g => goodChip(GG[g], true)).join('')}${more ? `<span class="hint">+${more} more</span>` : ''}</span><div class="hint" style="margin-top:3px">Its people have ${Math.round(living * 100)}% of what they want. ${c.player ? '<button class="linkish" id="sc-market">Open the market</button>' : 'Dashed: comes from abroad.'}</div>` : '<span class="hint">nothing yet</span>';
    $('sc-kv').innerHTML = `${c.capital !== i ? `<span class="micro">Capital</span><span>${esc(sim.cellName.get(c.capital) || '—')}</span>` : ''}${(() => { const P = sim.people; if (!P) return ''; const ps = P.peoplesOf(c.id, 4), r = P.ruling[c.id]; if (!ps.length) return ''; const big = ps[0][0]; return `<span class="micro">Peoples</span><span>${ps.map(([p, sh]) => `${esc(P.nameOf(p))} <span class="num hint">${Math.max(1, Math.round(sh * 100))}%</span>`).join(', ')}${r && r !== big ? `<span class="hint"> · ruled by the ${esc(P.nameOf(r))}</span>` : ''}</span>`; })()}${(() => { const F = sim.faith; if (!F) return `<span class="micro">Faith</span><span>${esc(c.religion || 'none yet')}</span>`; const s0 = F.state[c.id], fs = F.faithsOf(c.id, 4).filter((q) => q[1] >= 0.01); return `<span class="micro">Faith</span><span>${s0 ? `<button class="linkish" data-faith="${s0}">${esc(F.nameOf(s0))}</button>` : 'the old ways'}${fs.length > 1 || (fs.length && fs[0][0] !== s0) ? `<span class="hint"> · its people: ${fs.map(([f, sh]) => `${esc(f ? F.shortOf(f) : 'the old ways')} ${Math.max(1, Math.round(sh * 100))}%`).join(', ')}</span>` : ''}</span>`; })()}${(() => { const K = sim.culture; if (!K || !K.pace(c.id) && !K.renown[c.id]) return ''; const B = CULTURE.BAND[CULTURE.band(K.rel(c.id), false)]; const live = K.livingOf(c.id).length; return `<span class="micro">Renown</span><span>${me0 === c ? `<button class="linkish" data-cult="1">${Math.round(K.renown[c.id])}</button>` : Math.round(K.renown[c.id])} <span class="hint">· ${esc(B.name.split(':')[0].toLowerCase())}${K.isGolden(c.id) ? ' · <b class="gold">a golden age</b>' : ''}${live ? ` · ${live} great ${live === 1 ? 'person' : 'people'} living` : ''}</span></span>`; })()}${(() => { const r = me0 && c !== me0 ? ENVOYS.standing(c) : null; return r ? `<span class="micro">With you</span><span><b class="rel-${r.cls || 'none'}">${esc(r.key === 'war' ? 'at war' : r.mood)}</b> <span class="num hint">${r.o > 0 ? '+' : r.o < 0 ? '−' : ''}${Math.abs(r.o)}</span>${r.pacts.length ? ' · ' + esc(r.pacts.join(', ').toLowerCase()) : ''}</span>` : ''; })()}${(() => { const X = sim.disease; if (!X) return ''; const L = X.out.filter((o) => o.inf[c.id] > 0); return L.length ? `<span class="micro">Sickness</span><span>${L.map((o) => `<b class="rel-neg">${esc(o.name)}</b> <span class="hint">· ${esc(DISEASE.KINDS[o.k].name)}, since ${sim.fmtYear(o.since[c.id])}</span>`).join('<br>')}</span>` : ''; })()}${(() => { const l = sim.landOf ? sim.landOf(c.id) : []; if (!l.length || !window.LAND) return ''; const tot = l.reduce((a, x) => a + x[1], 0); return `<span class="micro">Land</span><span>${l.slice(0, 3).map(([k, n]) => `${esc(LAND.CLASSES[k].name.toLowerCase())} ${Math.round(100 * n / tot)}%`).join(' · ')}${sim.apart && sim.apart(c.id) ? ' <span class="hint">· no beast of the plough yet</span>' : ''}</span>`; })()}${(() => { const CL = sim.climate; if (!CL) return ''; const hv = sim.harvestOf(c.id), dead = sim.starvedOf(c.id), sp = CL.spellsIn(c.id)[0]; if (Math.abs(hv - 1) < 0.02 && !(dead > 0.01)) return ''; return `<span class="micro">Harvest</span><span class="${hv < 0.95 ? 'neg' : hv > 1.02 ? 'pos' : ''}">${Math.round(hv * 100)} in a hundred of an ordinary year${sp ? ` · ${sp.kind === 'drought' ? `a drought, the ${ordinal(sp.years)} year` : 'a good year'}` : ''}${dead > 0.01 ? ` · ${fmtPop(dead)} starved` : ''}</span>`; })()}${(() => { const m = c.mig; if (!sim.mig || !m || !((m.li || 0) + (m.lo || 0) > 0.05 * Math.max(1, sim.popOf[c.id]) / 100)) return ''; return `<span class="micro">On the move</span><span>${m.li > 0 ? `${fmtPop(m.li)} came` : ''}${m.li > 0 && m.lo > 0 ? ' · ' : ''}${m.lo > 0 ? `${fmtPop(m.lo)} left` : ''} <span class="hint">in ten years</span></span>`; })()}<span class="micro">Wars</span><span>${esc(wars || 'nobody')}</span><span class="micro">Trade</span><span>${tradeHtml}</span>${me0 && c !== me0 ? `<span class="micro">Knows</span><span>${ahead.length ? ahead.slice(-4).map(D => `<button class="linkish" data-kgo="${D.key}">${esc(D.name)}</button>`).join(', ') + (ahead.length > 4 ? ` and ${ahead.length - 4} more that your people do not` : ', which your people do not') : 'nothing that your people do not'}</span>` : ''}<span class="micro">Laws</span><span>${lawsLine}</span><span class="micro">Founded</span><span class="num">${sim.fmtYear(c.founded)}</span>`;
    { const b = $('sc-market'); if (b) b.addEventListener('click', () => MARKET.open('board')); }
    const p = sim.playerCiv(); const acts = $('sc-actions'); const rel = p && c !== p ? ENVOYS.standing(c) : null;
    acts.innerHTML = rel ? (rel.within || sim.isAtWar(p, c.id) ? `<button class="btn" id="btn-dip" data-dgo="${c.id}" title="What they think of you and why, treaties, gifts, war and peace (F)">${sim.isAtWar(p, c.id) ? 'War and peace' : 'Diplomacy'}</button>` : '<span class="hint">Your envoys cannot reach them yet: they deal with the realms you touch and those your merchants reach.</span>') : '';
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
  // the ruler's card: the face (with the house's look), the house, the age and the years on the throne, the character the realm
  // is ruled by (a regent's, for a child), and the heir; the player's opens the court
  function renderRuler(c) {
    const r = c.ruler; if (!r) { $('sc-ruler').hidden = true; return; } $('sc-ruler').hidden = false;
    const D = sim.dynasty, p = D && r.pid ? D.of(r.pid) : null, H = p && p.h ? D.houses.get(p.h) : null;
    const T = sim.TRAITS[r.trait]; const reign = sim.year - r.since; const age = p ? sim.year - p.b : reign + 22 + ((r.seed || 0) % 24);
    const key = `${c.id}:${r.seed}:${c.era}:${Math.floor(age / 10)}:${c.color}:${H ? H.seed : 0}:${r.trait}`;
    if (key !== portraitKey) { portraitKey = key; if (window.PORTRAIT) PORTRAIT.draw($('sc-portrait'), { seed: r.seed || (r.name.length * 7919), culture: TOWN.CULTURES[TOWN.civCulture(sim, c)], era: c.era, fem: !!r.fem, trait: p && age < 16 ? 'steward' : r.trait, color: c.color, age, house: H ? H.seed : 0, child: !!p && age < 16 }); }
    $('sc-ruler-name').textContent = `${r.title} ${r.name}`;
    $('sc-ruler-sub').textContent = `${H ? H.name.charAt(0).toUpperCase() + H.name.slice(1) + ' · ' : ''}${p ? 'aged ' + age + ' · ' : ''}${reign < 1 ? 'new to the throne' : reign + ' year' + (reign === 1 ? '' : 's') + ' on the throne'}`;
    const R = D ? D.regentOf(c.id) : null, heir = D && H ? D.heirOf(c.id) : null; const mine = c.player;
    $('sc-ruler-trait').innerHTML = (R && R.p ? `<b>A regency.</b> ${esc(R.who === 'noble' ? 'The noble' : (r.fem ? 'Her ' : 'His ') + R.who)} ${esc(R.p.n)} rules until ${esc(sim.fmtYear(R.until))}: ${esc(T ? T.a : '')}.` : T ? `<b>${esc(T.label)}.</b> ${esc(T.desc)}` : '') + (heir ? ` <span class="hint">Heir: ${esc(heir.n)}, ${sim.year - heir.b}.</span>` : H ? ' <span class="hint">No heir.</span>' : '') + (mine && D ? ' <button class="linkish" data-court="0">The court</button>' : '');
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
    for (const w of wars) html += `<div class="ol war" data-cell="${w.capital}"><span class="t">⚔ ${esc(sim.fullName(w))}</span><span class="s">might ${fmtInt(sim.mightOf[w.id])}</span></div>`;
    if (wars.length && cells.length) html += '<div class="micro" style="padding:8px 6px 4px">Settlements</div>';
    for (const i of cells) html += `<div class="ol" data-cell="${i}"><span class="t">${i === c.capital ? '★ ' : ''}${esc(sim.cellName.get(i) || '')}</span><span class="s">${fmtPop(sim.pop[i])}</span></div>`;
    if (!cells.length) html += '<div class="hint" style="padding:4px 6px">Villages become towns as they grow; towns appear here.</div>';
    host.innerHTML = html;
    host.querySelectorAll('.ol').forEach(el => el.addEventListener('click', () => { const i = +el.dataset.cell; if (i >= 0) { const [lon, lat] = placeOf(i); mapcam.flyTo(lon, lat, Math.min(mapcam.dist, viewDist(i))); select(i); } }));
  }
  const FEED_ICON = { intrigue: '<path d="M2.500 12s3.500-6.500 9.500-6.500S21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6"/>', legacy: '<path d="M7 20c-3.5-3-4.500-8.500-2-13M17 20c3.5-3 4.500-8.500 2-13M5.5 11.5c1.5 0 2.500 1 3 2.500M18.5 11.5c-1.5 0-2.500 1-3 2.500M6 7.500c1.200.300 2 1.200 2.300 2.300M18 7.500c-1.200.300-2 1.200-2.300 2.300"/>', story: '<path d="M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2zM6 18a2 2 0 0 1 2-2h11M10 8h6M10 11h5"/>', culture: '<path d="M7 4c-2 3-2 9 0 13M17 4c2 3 2 9 0 13M7 17h10M9 7v10M12 6v11M15 7v10"/>', law: '<path d="M4 20h16M5 9h14M12 4l8 5H4zM7 9v11M12 9v11M17 9v11"/>', war: '<path d="M4 4l16 16M20 4L4 20"/>', ruler: '<path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z"/>', disaster: '<path d="M12 3l9 16H3z M12 9v5M12 16v1"/>', era: '<path d="M12 3l2.4 5.4 5.6.6-4.2 3.8 1.2 5.6L12 15.6 7 18.4l1.2-5.6L4 9l5.6-.6z"/>', faith: '<path d="M12 21c4 0 6-3 6-6 0-4-4-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8 0 3 2 6 6 6z"/>', state: '<path d="M4 20h16M6 20V9l6-5 6 5v11"/>', city: '<path d="M4 20h16M7 20V8h4v12M13 20v-7h4v7"/>', know: '<path d="M12 6c-2-1.500-5-2-8-2v14c3 0 6 .500 8 2 2-1.500 5-2 8-2V4c-3 0-6 .500-8 2zM12 6v14"/>', pact: '<path d="M4 6h16v12H4zM4 7l8 6 8-6"/>' };
  function scoreEvent(e) { const base = (e.type === 'culture' && /golden age/.test(e.text) ? 2.4 : 0) || { war: 3, era: 3, state: 2.2, pact: 2, disaster: 2, law: 1.8, know: 1.6, culture: 1.4, faith: 1.2, city: 1, ruler: 0.4 }[e.type] || 1; const c = e.civ >= 0 ? sim.civs[e.civ] : null; const size = c ? Math.min(2, sim.cellsOf[c.id] / 150) : 1; let near = 0; if (e.loc >= 0) { const [lon, lat] = cellCenter(e.loc); near = 1 - clamp(GEO.distKm(lon, lat, mapcam.lon, mapcam.lat) / 6000, 0, 1); } return base + size + near + (e.mine ? 10 : 0); }
  // continuous mode keeps a light live wire of the biggest events as toasts
  let feedIdx = 0, lastFeedAt = 0;
  function pumpFeed(now) {
    const ev = sim.worldEvents; if (ev.length < feedIdx) feedIdx = 0;
    while (feedIdx < ev.length) { const e = ev[feedIdx++]; if (settings.continuous && e.mine && (e.type === 'war' || e.type === 'era' || (e.type === 'disaster' && !e.calm)) && now - lastFeedAt > 2500) { lastFeedAt = now; bigBanner(e.type === 'era' ? e.text.replace(/^.*enters the /, '') : e.text, sim.fmtYear(e.year), e.type === 'era' ? eraArt(sim.civs[e.civ] ? sim.civs[e.civ].era : 0) : e.type === 'war' ? artOf('ev_war') : ''); } }
  }

  // ---------- notifications ----------
  let bannerT = 0;
  function toast(msg, ms) { if (!msg) return; const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('tc').appendChild(t); setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, ms || 2600); }
  function bigBanner(title, sub, art) { const now = performance.now(); if (now - bannerT < 4500) return; bannerT = now; const t = document.createElement('div'); t.className = 'toast big' + (art ? ' art' : ''); if (art) t.style.backgroundImage = `linear-gradient(to right, rgb(8 11 18 / 0.92), rgb(8 11 18 / 0.55) 40%, rgb(8 11 18 / 0.55) 60%, rgb(8 11 18 / 0.92)), url("${art}")`; t.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`; $('tc').appendChild(t); setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 420); }, art ? 5200 : 4000); }
  // ---------- generated art and materials ----------
  const TEX_URL = window.GENESIS_TEX_URL || 'data/tex/atlas.json';
  const artOf = (key) => (window.TEX && TEX.art(key)) || '';
  const eraArt = (era) => artOf('era' + Math.max(0, Math.min(8, era | 0)));
  function reportArt(reason, events) {
    if (reason === 'era') { const c = sim.playerCiv(); return eraArt(c ? c.era : 0); }
    if (reason === 'war') return artOf('ev_war');
    if (reason === 'story') { const v = window.TALES && TALES.waiting(); return v ? artOf(v.art) : ''; }
    if (reason === 'disaster') { const txt = (events || []).filter(e => e.type === 'disaster').map(e => e.text).join(' ').toLowerCase(); const k = /erupt|volcan|lava|ash/.test(txt) ? 'ev_volcano' : /famine|drought|harvest|hunger|starve|rains fail/.test(txt) ? 'ev_famine' : /flood|river|rains/.test(txt) ? 'ev_flood' : /plague|pestilence|sickness|disease/.test(txt) ? 'ev_plague' : /comet|sky|star/.test(txt) ? 'ev_comet' : 'ev_flood'; return artOf(k); }
    return '';
  }
  function applyArt() {
    if (!window.TEX || !TEX.ui) return;
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
    settle: '<path d="M6 21V4h10l-2 3 2 3H6"/>', develop: '<path d="M12 21V9M12 13c-3 0-5-2-5-5 3 0 5 2 5 5zm0-4c3 0 5-2 5-5-3 0-5 2-5 5z"/><path d="M4 21h16"/>', fortify: '<path d="M4 21V9h3V6h3v3h4V6h3v3h3v12z"/><path d="M10 21v-5h4v5"/>', port: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13c0 4 3 7 7 7s7-3 7-7M3 13h4M17 13h4"/>', academy: '<path d="M4 21h16M6 21V10M10 21V10M14 21V10M18 21V10M3 10l9-6 9 6z"/>', temple: '<path d="M12 21c4 0 6-3 6-6 0-4-4-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8 0 3 2 6 6 6z"/>', capital: '<path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z"/><path d="M4 21h16"/>', market: '<path d="M4 10l2-5h12l2 5M4 10h16v3H4zM6 13v8h12v-8M10 21v-5h4v5"/>', wonder: '<path d="M12 3l3 6 6 1-4.5 4.2 1.2 6.3L12 17.5 6.3 20.5l1.2-6.3L3 10l6-1z"/>', levy: '<path d="M12 3l8 3v6c0 5-3 8-8 9-5-1-8-4-8-9V6z"/><path d="M12 8v8M8 12h8"/>', fleet: '<path d="M12 3v12M12 4l6 9h-6M4 16h16l-2 4H6z"/>',
    spawn: '<circle cx="12" cy="6" r="3"/><path d="M5 21c0-5 3-8 7-8s7 3 7 8"/>', plague: '<path d="M12 3a7 7 0 0 0-7 7c0 3 2 5 3 6v4h8v-4c1-1 3-3 3-6a7 7 0 0 0-7-7z"/><circle cx="9.5" cy="10.5" r="1"/><circle cx="14.5" cy="10.5" r="1"/>', meteor: '<path d="M20 4l-9 9M20 4l-5 1M20 4l-1 5"/><circle cx="8" cy="16" r="4"/>', bounty: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>', prophet: '<path d="M12 3l2.7 6 6.3.6-4.8 4.3 1.5 6.4L12 17l-5.7 3.3 1.5-6.4L3 9.6l6.3-.6z"/>', enlighten: '<path d="M9 21h6M10 18h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  };
  ICONS.drought = TK_ICON.dry;
  const GODS = [
    { id: 'spawn', n: 'Spawn', tip: 'Drop a new people on empty land.' }, { id: 'plague', n: 'Plague', tip: 'A great dying, and a pestilence that goes on from there.' }, { id: 'drought', n: 'Drought', tip: 'The rains fail for three years over some five hundred kilometres: the harvest withers, and those it no longer feeds starve.' }, { id: 'meteor', n: 'Meteor', tip: 'Fire from the sky. Erases what it hits.' }, { id: 'bounty', n: 'Bounty', tip: 'Make land fertile.' }, { id: 'prophet', n: 'Prophet', tip: 'Found a religion in the state you click.' }, { id: 'enlighten', n: 'Enlighten', tip: 'Hand a state a burst of knowledge.' },
  ];
  function buildDock() {
    const mk = (t, god) => { const b = document.createElement('button'); b.className = 'dg' + (god ? ' god' : ''); b.dataset.tool = t.id; b.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[t.id]}</svg><span class="n">${t.n}</span><span class="c" id="cost-${t.id}"></span><span class="tip"><b>${t.n}</b>${t.tip}</span>`; b.addEventListener('click', () => setTool(t.id)); return b; };
    for (const t of GODS) $('dock-god').appendChild(mk(t, true));
  }
  function setTool(t) {
    tool = (tool === t) ? null : t;
    document.querySelectorAll('.dg').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    const names = { settle: 'Settle: click land touching your border', develop: 'Develop: click one of your cells', fortify: 'Fortify: click one of your cells', port: 'Port: click one of your coastal cells', academy: 'Academy: click one of your towns', temple: 'Temple: click one of your settlements', capital: 'Move capital: click one of your towns', market: 'Market: click one of your settlements', wonder: 'Wonder: click your capital', spawn: 'Spawn: click empty land', plague: 'Plague: click anywhere', drought: 'Drought: click land', meteor: 'Meteor: click anywhere', bounty: 'Bounty: click land', prophet: 'Prophet: click a state', enlighten: 'Enlighten: click a state' };
    if (tool) cancelPlacing();
    banner(tool ? names[tool] : null, !!tool); renderer.domElement.style.cursor = tool ? 'crosshair' : 'grab';
    $('l-expand').classList.toggle('on', tool === 'settle');
    if (tool && tool !== 'settle') { document.body.classList.add('dockopen'); $('l-build').classList.add('on'); }
  }
  function updateDock() {
    const c = sim.playerCiv();
    for (const t of GODS) { const b = document.querySelector(`.dg[data-tool="${t.id}"]`); if (!b) continue; b.disabled = !c; }
    if (selected >= 0 && !$('chron').open && !$('menu').open && !$('market').open && !$('know').open && !$('gov').open && !$('dip').open && !$('sel-build').hidden) renderBuild(selected);
  }

  // ---------- the city build panel: what a town can raise, and where ----------
  const BUILD_ORDER = ['farm', 'walls', 'port', 'market', 'temple', 'academy', 'mine', 'workshop', 'weaver', 'smithy', 'brewery', 'granary', 'warehouse', 'shipyard', 'factory', 'refinery', 'lab', 'wonder', 'capital', 'levy', 'fleet'];
  Object.assign(ICONS, { workshop: `<path d="${MARKET.ICON.tools}"/>`, weaver: `<path d="${MARKET.ICON.cloth}"/>`, smithy: '<path d="M4 9h13c0 3-2 4-5 4v3h3v3H7v-3h3v-3C7 13 5 11 4 9zM17 9h3"/>', brewery: `<path d="${MARKET.ICON.beer}"/>`, granary: '<path d="M5 21V10l7-6 7 6v11zM9 21v-6h6v6M9 11h6"/>', warehouse: '<path d="M3 21V9l9-5 9 5v12zM7 21v-8h10v8M7 17h10"/>', shipyard: `<path d="${MARKET.ICON.ships}"/>`, factory: '<path d="M3 21V11l6 3v-3l6 3V6h4v15zM7 17h2M12 17h2"/>', refinery: '<path d="M5 21V8h4v13M11 21V4h4v17M17 21v-9h3v9M3 21h18"/>', lab: `<path d="${MARKET.ICON.electronics}"/>` });
  const BUILD_ICON = (k) => ICONS[k] || ICONS[{ farm: 'develop', walls: 'fortify' }[k]] || ICONS.settle;
  const buildName = (k, i) => k === 'mine' ? sim.workName(i) : sim.BUILD[k].name;
  const indNames = (i) => sim.ind && sim.ind.has(i) ? sim.IND.filter((k) => sim.indAt(i, k)).map((k) => sim.BUILD[k].name.toLowerCase()) : [];
  let placing = null; // { kind, i } while the player chooses a plot
  function renderBuild(i) {
    const c = sim.playerCiv(); const host = $('sel-build'); const own = c && sim.owner[i] === c.id && sim.land[i] && sim.level[i] > 0;
    if (!own) { host.hidden = true; if (placing && placing.i === i) cancelPlacing(); return; }
    host.hidden = false; const grid = $('bgrid'); const B = sim.BUILD; const lvl = sim.level[i];
    $('bhead-note').textContent = `${sim.cellName.get(i) || ''} · treasury ${fmtInt(c.wealth)}`;
    let html = '';
    for (const k of BUILD_ORDER) {
      const b = B[k]; const why = sim.cannot(k, i); const need = why ? sim.needFor(k, i) : null;
      if (why && !sim.inProgress(i, k) && ((need && need.era > c.era) || /yields nothing/.test(why))) continue;      // (what a later age will teach, and land with nothing to work, are left off the list)
      const cost = sim.costOf(k); const dur = sim.durOf(k, c.era); const prog = sim.inProgress(i, k);
      const poor = !why && c.wealth < cost; const dis = (!!why && !need) || poor;      // (a work that waits on a discovery stays live: a click opens the tree there)
      const lvlTxt = k === 'farm' && sim.infra[i] ? ` · level ${sim.infra[i] + 1}` : k === 'walls' && sim.walls[i] ? ` · level ${sim.walls[i] + 1}` : '';
      const reason = prog ? `building · ${Math.max(0, prog.start + prog.dur - sim.year)} yrs left` : why ? why : poor ? `needs ${cost}` : '';
      const cardArt = artOf('card_' + k);
      html += `<button class="bq${prog ? ' building' : ''}${placing && placing.i === i && placing.kind === k ? ' on' : ''}${cardArt ? ' art' : ''}${need ? ' need' : ''}" data-kind="${k}"${need ? ` data-need="${need.key}"` : ''} ${dis ? 'disabled' : ''} title="${esc(b.desc)}"${cardArt ? ` style="--art:url(&quot;${cardArt}&quot;)"` : ''}><svg viewBox="0 0 24 24">${BUILD_ICON(k)}</svg><span class="n">${esc(buildName(k, i))}${lvlTxt}</span><span class="m"><b>${cost}</b>${dur ? ` · ${dur} yr${dur === 1 ? '' : 's'}` : ''}</span>${reason ? `<span class="why">${esc(reason)}</span>` : ''}</button>`;
    }
    if (grid.dataset.html !== html) { grid.dataset.html = html; grid.innerHTML = html; grid.querySelectorAll('.bq').forEach(btn => btn.addEventListener('click', () => { if (btn.dataset.need) TREE.open('tree', btn.dataset.need); else startBuild(btn.dataset.kind, i); })); }
    const wl = sim.works.get(i) || []; const q = $('bqueue');
    const qh = wl.map(w => { const left = Math.max(0, w.start + w.dur - sim.year); const pr = clamp((sim.year - w.start) / w.dur, 0, 1); return `<div class="bw"><svg viewBox="0 0 24 24">${BUILD_ICON(w.k)}</svg><span class="t"><span>${esc(buildName(w.k, i))}${w.slot >= 0 ? ` · plot ${w.slot + 1}` : ''}</span><span class="bar"><i style="transform:scaleX(${pr.toFixed(3)})"></i></span></span><span class="y">${left} yr${left === 1 ? '' : 's'}</span></div>`; }).join('');
    if (q.dataset.html !== qh) { q.dataset.html = qh; q.innerHTML = qh; }
  }
  function startBuild(kind, i) {
    const c = sim.playerCiv(); if (!c) return; const why = sim.cannot(kind, i); if (why) { toast(why); return; }
    if (sim.BUILD[kind].slot) {
      if (placing && placing.kind === kind && placing.i === i) { cancelPlacing(); return; }
      placing = { kind, i }; banner(`Place the ${buildName(kind, i).toLowerCase()}: click a plot around ${sim.cellName.get(i) || 'the town'}`, true);
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
    const taken = {}; for (const k of ['temple', 'academy', 'market', 'mine', ...sim.IND]) { const sl = sim.slotOf(i, k); if (sl >= 0) taken[sl] = k; } for (const w of (sim.works.get(i) || [])) if (w.slot >= 0) taken[w.slot] = w.k;
    if (plotEls.length !== L.plots.length) { host.textContent = ''; plotEls.length = 0; for (const pl of L.plots) { const el = document.createElement('div'); el.className = 'plot'; el.dataset.slot = pl.slot; el.addEventListener('click', (e) => { e.stopPropagation(); if (!el.classList.contains('used')) placePlot(+el.dataset.slot); }); host.appendChild(el); plotEls.push(el); } }
    for (let k = 0; k < L.plots.length; k++) {
      const pl = L.plots[k]; const el = plotEls[k]; const lon = sLon + pl.x / (6371000 * cl * GEO.D2R), lat = sLat + pl.z / (6371000 * GEO.D2R);
      const p = project(lon, lat, terrain.heightAt(lon, lat)); if (!p) { el.style.display = 'none'; continue; } el.style.display = '';
      const used = taken[pl.slot]; const sig = used || '+';
      if (el.dataset.sig !== sig) { el.dataset.sig = sig; el.classList.toggle('used', !!used); el.innerHTML = used ? `<svg viewBox="0 0 24 24">${BUILD_ICON(used)}</svg><span class="tipn">${esc(buildName(used, i))}</span>` : `+<span class="tipn">Plot ${pl.slot + 1}</span>`; }
      el.style.transform = `translate3d(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px,0)`; el.style.opacity = (0.5 + 0.5 * p[2]).toFixed(2);
    }
  }
  // the advisor points at a build: open the right town's panel and pulse the card
  function openBuildFor(kind) {
    const c = sim.playerCiv(); if (!c) return; const towns = sim.settlementsOf(c.id); let i = c.capital;
    const need = { workshop: (j) => !sim.cannot('workshop', j), weaver: (j) => !sim.cannot('weaver', j), smithy: (j) => !sim.cannot('smithy', j), brewery: (j) => !sim.cannot('brewery', j), granary: (j) => !sim.cannot('granary', j), shipyard: (j) => !sim.cannot('shipyard', j), academy: (j) => sim.level[j] >= 2 && !(sim.special[j] & 2), temple: (j) => !(sim.special[j] & 4), port: (j) => (sim.flags[j] & 4) && !(sim.special[j] & 1), market: (j) => !(sim.special[j] & 8), wonder: (j) => j === c.capital, farm: (j) => sim.infra[j] < 5, develop: (j) => sim.infra[j] < 5 }[kind];
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

  // ---------- trade on the globe: an arc to every realm the merchants reach, as thick as what crosses ----------
  // (gold where more goes out than comes in, blue where more comes in; the dashes run the way the goods do)
  const flowsEl = $('flows'); let flowsKey = '', flowsList = []; const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fv = new THREE.Vector3();
  // an arc over the globe from one place to another, as the path of an svg (a great circle, lifted in the middle by a tenth of its
  // length, at most 260 km; what is behind the globe is left out)
  function arcD(i0, i1) {
    const [lon0, lat0] = placeOf(i0), [lon1, lat1] = placeOf(i1); GEO.toVec(lon0, lat0, _fa).normalize(); GEO.toVec(lon1, lat1, _fb).normalize(); const ang = Math.max(1e-4, _fa.angleTo(_fb)), sn = Math.sin(ang); let d = '', pen = false;
    for (let q = 0; q <= 20; q++) { const t = q / 20, s0 = Math.sin((1 - t) * ang) / sn, s1 = Math.sin(t * ang) / sn; _fv.set(_fa.x * s0 + _fb.x * s1, _fa.y * s0 + _fb.y * s1, _fa.z * s0 + _fb.z * s1); const [lo, la] = GEO.fromVec(_fv);
      const p = project(lo, la, Math.sin(t * Math.PI) * Math.min(260000, ang * 6371000 * 0.1) / terrain.exag + 400); if (!p) { pen = false; continue; } d += (pen ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); pen = true; }
    return d || 'M0 0';
  }
  // under the lens of peoples, the decade's great migrations as streams from realm to realm, in the colour of the people that went
  // (migrate.js: sim.mig.flows), as wide as they were many
  function updateMigrations() {
    const M = sim.mig, P = sim.people, key = 'm' + Math.floor(sim.year / 10) + ':' + M.flows.length + ':' + (M.flows[0] ? M.flows[0][2].toFixed(1) : '');
    if (key !== flowsKey) {
      flowsKey = key;
      flowsList = M.flows.slice(0, 24).filter(([a, b]) => sim.civs[a] && sim.civs[b] && sim.civs[a].capital >= 0 && sim.civs[b].capital >= 0).map(([a, b, v]) => ({ from: sim.civs[a].capital, to: sim.civs[b].capital, w: 1.2 + 1.6 * Math.log10(1 + v / 20), rgb: P.rgbOf(P.ruling[a]) }));
      flowsEl.innerHTML = flowsList.map((f) => `<path class="mig" style="stroke-width:${f.w.toFixed(1)}px;stroke:rgb(${Math.round(f.rgb[0] * 255)} ${Math.round(f.rgb[1] * 255)} ${Math.round(f.rgb[2] * 255)})"/>`).join('');
    }
    const paths = flowsEl.children; for (let k = 0; k < flowsList.length; k++) paths[k].setAttribute('d', arcD(flowsList[k].from, flowsList[k].to));
  }
  function updateFlows() {
    if (!view.trade && view.ppl && sim && mode === 'play' && sim.mig && sim.people) { updateMigrations(); return; }
    if (flowsKey && flowsKey.charAt(0) === 'm') { flowsEl.textContent = ''; flowsKey = ''; flowsList = []; }
    const c = view.trade && sim && mode === 'play' ? sim.playerCiv() : null;
    if (!c || c.capital < 0) { if (flowsKey) { flowsEl.textContent = ''; flowsKey = ''; flowsList = []; } return; }
    const key = sim.year + ':' + c.capital + ':' + sim.market.steps;
    if (key !== flowsKey) {
      flowsKey = key; const M = sim.market, NG = M.NG, G = sim.GOODS; const ps = M.partners(c.id).filter(p => !p.war && p.v > 0 && sim.civs[p.id] && sim.civs[p.id].capital >= 0).sort((a, b) => b.v - a.v).slice(0, 18); const top = ps.length ? ps[0].v : 1;
      flowsList = ps.map((p) => { let inV = 0, outV = 0; for (let g = 1; g < NG; g++) { inV += M.pfIn[p.id * NG + g] * G[g].base; outV += M.pfOut[p.id * NG + g] * G[g].base; } return { to: sim.civs[p.id].capital, w: 1.4 + 3.4 * Math.sqrt(p.v / top), out: outV > inV }; });
      flowsEl.innerHTML = flowsList.map((f) => `<path class="${f.out ? 'out' : 'in'}" style="stroke-width:${f.w.toFixed(1)}px"/>`).join('');
    }
    const [lon0, lat0] = placeOf(c.capital); GEO.toVec(lon0, lat0, _fa).normalize(); const paths = flowsEl.children;
    for (let k = 0; k < flowsList.length; k++) {
      const [lon1, lat1] = placeOf(flowsList[k].to); GEO.toVec(lon1, lat1, _fb).normalize(); const ang = Math.max(1e-4, _fa.angleTo(_fb)), sn = Math.sin(ang); let d = '', pen = false;
      for (let q = 0; q <= 20; q++) { const t = q / 20, s0 = Math.sin((1 - t) * ang) / sn, s1 = Math.sin(t * ang) / sn; _fv.set(_fa.x * s0 + _fb.x * s1, _fa.y * s0 + _fb.y * s1, _fa.z * s0 + _fb.z * s1); const [lo, la] = GEO.fromVec(_fv);
        const p = project(lo, la, Math.sin(t * Math.PI) * Math.min(260000, ang * 6371000 * 0.1) / terrain.exag + 400); if (!p) { pen = false; continue; } d += (pen ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); pen = true; }
      paths[k].setAttribute('d', d || 'M0 0');
    }
  }

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
  // the lands under a lens (world.pcentroids: id -> summed unit vectors) whose middles are in the picture, the largest first:
  // [[id, ct, lon, lat], ...] (ranked among all of the world, the largest were as often as not on the far side of it)
  function inView(cents, ok) {
    const out = []; for (const [id, ct] of cents) { if (ct.n < 3 || !ok(id)) continue; const len = Math.hypot(ct.x, ct.y, ct.z) || 1; const [lon, lat] = GEO.fromVec(new THREE.Vector3(ct.x / len, ct.y / len, ct.z / len)); const p = project(lon, lat, 0); if (!p || p[0] < -40 || p[1] < -30 || p[0] > window.innerWidth + 40 || p[1] > window.innerHeight + 30) continue; out.push([id, ct, lon, lat]); }
    return out.sort((a, b) => b[1].n - a[1].n);
  }
  function updateLabels() {
    if (!view.labels || !sim || mode === 'intro') { if (labelEls.size) { for (const el of labelEls.values()) el.remove(); labelEls.clear(); labelState.clear(); } return; }
    if (++labelTick % 3 !== 0) return;
    const altKm = mapcam.alt * 6371; const cands = []; const player = sim.player;
    if (altKm > 250 && altKm < 9000 && view.ppl && world.pcentroids && sim.people) {
      // (under the lens of peoples, the peoples' names across their lands, in their colours: people.js)
      const PP = sim.people, list = inView(world.pcentroids, (id) => !!PP.list[id]);
      list.forEach(([id, ct, lon, lat], rank) => {
        if (rank >= (altKm > 4000 ? 14 : altKm > 1500 ? 30 : 80)) return;      // (the largest peoples in the picture from far out, more of them closer)
        const rgb = PP.rgbOf(id);
        cands.push({ id: 'p' + id, cls: 'realm folk', text: PP.list[id].name, lon, lat, h: 0, size: clamp(12 + Math.log2(ct.n + 1) * 1.5, 13, 22) * settings.uiScale, pri: 1000 + ct.n, color: `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})` });
      });
    } else if (altKm > 250 && altKm < 9000 && view.fth && world.pcentroids && sim.faith) {
      // (under the lens of faiths, the faiths' names across their lands, and a star at each great faith's holy city: faith.js)
      const F = sim.faith, list = inView(world.pcentroids, (id) => !!F.list[id]);
      const css = (id) => { const rgb = F.rgbOf(id); return `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`; };
      list.forEach(([id, ct, lon, lat], rank) => {
        if (rank >= (altKm > 4000 ? 10 : altKm > 1500 ? 24 : 60)) return;
        cands.push({ id: 'p' + id, cls: 'realm faith', text: F.shortOf(id), lon, lat, h: 0, size: clamp(12 + Math.log2(ct.n + 1) * 1.4, 13, 21) * settings.uiScale, pri: 1000 + ct.n, color: css(id) });
        const X = F.list[id]; if (X.home >= 0 && rank < (altKm > 4000 ? 6 : 16) && ct.n >= 12) { const [hl, ha] = cellCenter(X.home); cands.push({ id: 'h' + id, cls: 'holy', text: '✦', sub: sim.cellName.get(X.home) || '', lon: hl, lat: ha, h: 0, size: 15 * settings.uiScale, pri: 2000 + ct.n, color: css(id) }); }
      });
    } else if (altKm > 250 && altKm < 9000) {
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
          let sub = ''; if (mine && altKm < 400) { const wl = sim.works.get(i); if (wl && wl.length) { const w = wl[0]; sub = `${buildName(w.k, i)} · ${Math.max(0, w.start + w.dur - sim.year)} yrs${wl.length > 1 ? ` +${wl.length - 1}` : ''}`; } }
          cands.push({ id: 'c' + i, cls: 'city' + (cap ? ' cap' : '') + (lvl < 2 ? ' town' : '') + (mine ? ' mine' : ''), text: sim.cellName.get(i) || '', sub, lon, lat, h: terrain.heightAt(lon, lat), size: (cap ? 14 : lvl >= 3 ? 13 : 12) * settings.uiScale, pri: (cap ? 60 : 0) + lvl * 12 + (mine ? 40 : 0) + Math.min(20, sim.pop[i] * 0.01) }); } }
    }
    if (altKm < 320 && sim.goods) { // what the land yields, once close enough to see the country (nearest first, icons only from high up)
      const rad = Math.round(clamp(mapcam.dist * 220, 4, 14)); const cy0 = Math.floor((90 - mapcam.lat) / 180 * H), cx0 = Math.floor((mapcam.lon + 180) / 360 * W);
      const gs = [];
      for (let dy = -rad; dy <= rad; dy++) { const y = cy0 + dy; if (y < 0 || y >= H) continue; const cl = Math.max(0.15, Math.cos((90 - (y + 0.5) / H * 180) * GEO.D2R)); const rx = Math.ceil(rad / cl);
        for (let dx = -rx; dx <= rx; dx++) { const x = ((cx0 + dx) % W + W) % W; const i = y * W + x; const gk = sim.goods[i]; if (!gk || !knowsCell(i)) continue; gs.push([dx * dx * cl * cl + dy * dy, i, gk]); } }
      gs.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < gs.length && k < 60; k++) { const [, i, gk] = gs[k]; const g = sim.GOODS[gk]; const [lon, lat] = cellCenter(i);
        cands.push({ id: 'g' + i, cls: 'good ' + g.kind, icon: g.key, text: altKm < 45 ? g.name : '', lon, lat, h: terrain.heightAt(lon, lat), size: 10 * settings.uiScale, pri: 3 + (sim.owner[i] === player ? 1 : 0) + (g.kind === 'strategic' || g.kind === 'luxury' ? 1 : 0) }); }
    }
    if (altKm < 400 && sim.ruins && sim.ruins.size) { for (const [i, ru] of sim.ruins) { const [lon, lat] = cellCenter(i); if (GEO.distKm(lon, lat, mapcam.lon, mapcam.lat) > altKm * 2.5 + 40) continue; if (!ru.wonder && altKm > 150) continue; cands.push({ id: 'u' + i, cls: 'ruin', text: (ru.wonder ? 'Ruins of the wonder of ' : 'Ruins of ') + (ru.name || 'a lost town'), lon, lat, h: terrain.heightAt(lon, lat), size: 11 * settings.uiScale, pri: ru.wonder ? 30 : 5 }); } }
    cands.sort((a, b) => b.pri - a.pri);
    const r = stage.getBoundingClientRect(); const GRID = 32; const cols = Math.ceil((r.width + 200) / GRID), rows = Math.ceil((r.height + 200) / GRID); const occ = new Uint8Array(cols * rows);
    // HUD panels reserve their cells so labels never sit under the interface
    if (labelTick % 30 === 0 || !hudRects.length || performance.now() - hudRectsT > 1500) { hudRectsT = performance.now(); hudRects.length = 0; for (const id of ['tl', 'tr', 'tracker', 'left', 'right', 'bl', 'bc', 'report', 'advisor', 'notes', 'turn', 'mapwrap']) { const el = $(id); if (!el || (id === 'left' && !el.classList.contains('open'))) continue; const b = el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) hudRects.push([b.left - r.left, b.top - r.top, b.right - r.left, b.bottom - r.top]); } }
    for (const [x0, y0, x1, y1] of hudRects) { const gx0 = Math.max(0, Math.floor((x0 + 100) / GRID)), gx1 = Math.min(cols - 1, Math.floor((x1 + 100) / GRID)), gy0 = Math.max(0, Math.floor((y0 + 100) / GRID)), gy1 = Math.min(rows - 1, Math.floor((y1 + 100) / GRID)); for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) occ[gy * cols + gx] = 1; }
    const placedIds = new Set(); let n = 0; let nProjNull = 0, nBlocked = 0, nMeasured = 0;
    for (const c of cands) {
      if (n >= 140) break; const p = project(c.lon, c.lat, c.h); if (!p) { nProjNull++; continue; }
      if (p[0] < -80 || p[0] > r.width + 80 || p[1] < -50 || p[1] > r.height + 50) { nProjNull++; continue; }      // outside the picture: not laid out (such labels used to pile up unseen above the top edge, and to use up the count)
      // the room a label takes: its real size once it has been drawn and measured (a guess from its length until then:
      // names in wide letters, a second line or an icon made the guess too small, and labels ran into each other)
      const dimKey = c.size + '|' + c.text + '|' + (c.sub || '') + '|' + (c.icon || ''); const el0 = labelEls.get(c.id); const dm = el0 && el0._dimKey === dimKey ? el0._dim : null;
      const w = dm ? dm[0] + 6 : Math.max(c.text.length, c.sub ? c.sub.length * 0.8 : 0) * c.size * (c.cls.startsWith('realm') ? 0.95 : 0.6) + (c.icon ? 26 : 18), h = dm ? dm[1] + 2 : c.icon ? Math.max(20, c.size * 1.8) : c.size * (c.sub ? 2.6 : 1.6); if ((c.cls === 'ruin' || c.icon) && n > 100) continue;
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
      if (el._dimKey !== dimKey && nMeasured < 10) { el._dim = [el.offsetWidth, el.offsetHeight]; el._dimKey = dimKey; nMeasured++; }      // (a few each round: measuring makes the browser lay the page out)
      el.style.opacity = st.shown ? (0.92 * p[2]).toFixed(2) : '0';
      if (c.color) el.style.color = lighten(c.color);
    }
    for (const [id, el] of labelEls) { if (!placedIds.has(id)) { const st = labelState.get(id); if (st) { st.shown = false; st.hits = 0; } el.remove(); labelEls.delete(id); } }
    labelDbg = { altKm: Math.round(altKm), cands: cands.length, placed: n, offscreen: nProjNull, blocked: nBlocked, hud: hudRects.map(r => r.map(Math.round).join(',')) };
  }
  let labelDbg = null;
  function lighten(rgb) { const m = rgb.match(/\d+/g); if (!m) return '#fff'; const [r, g, b] = m.map(Number); return `rgb(${Math.round(r * 0.5 + 255 * 0.5)},${Math.round(g * 0.5 + 255 * 0.5)},${Math.round(b * 0.5 + 255 * 0.5)})`; }

  // ---------- chronicle screen ----------
  const LOGF = [['all', 'All'], ['mine', 'Mine'], ['war', 'Wars'], ['pact', 'Treaties'], ['state', 'States'], ['law', 'Laws'], ['era', 'Eras'], ['know', 'Knowledge'], ['faith', 'Faith'], ['culture', 'Culture'], ['legacy', 'Legacy'], ['intrigue', 'Intrigue'], ['disaster', 'Disasters'], ['ruler', 'Rulers']];
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
    const st = [['World age', fmtInt(sim.year + 10000) + ' years'], ['People on Earth', last ? fmtPop(last.pop + last.wild) : '—'], ['Living states', sim.st.civCount], ['World product', MARKET.fc(sim.market.worldGdp) + ' a year'], ['Crossing borders', sim.market.worldGdp > 0 ? Math.round(100 * sim.market.worldTrade / sim.market.worldGdp) + '% of it' : '—'], ['Wars under way', wars], ['Frontier', sim.ERAS[sim.eraOf(best)][0]], ['Largest state', living[0] ? sim.fullName(living[0]) : '—'], ['Largest city', biggest !== null ? `${sim.cellName.get(biggest)} · ${fmtPop(bp)}` : '—'], ['Your rank', rank ? `${rank} of ${living.length}` : '—']];
    $('stats').innerHTML = st.map(([k, v]) => `<div class="tile"><span class="micro">${k}</span><span class="k" style="font-size:var(--fs-body)">${esc(String(v))}</span></div>`).join('');
  }
  function setCTab(t) { document.querySelectorAll('#chron .tabs button').forEach(b => b.classList.toggle('on', b.dataset.ctab === t)); document.querySelectorAll('#chron [data-cpane]').forEach(p => { p.hidden = p.dataset.cpane !== t; }); if (t === 'graphs') requestAnimationFrame(drawGraphs); if (t === 'legacy') renderLegacy(); }
  // ---------- the Legacy tab: this age's ambitions and how far each has come, what the realm carries from its past ages, the paths it
  // is remembered in, the world's firsts and its greatest legacies, living and fallen (legacy.js) ----------
  const PATH_ICON = ['<path d="M4 4l11 11M15.5 4L4.5 15M3 21l3.5-3.5M21 21l-3.5-3.5M14 14l7 7M10 14l-7 7"/>', '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h4a1.75 1.75 0 0 1 0 3.5h-3a1.75 1.75 0 0 0 0 3.5h4"/>', '<path d="M4 20h16M6 20V9M10 20V9M14 20V9M18 20V9M3 9h18M12 3l9 6H3z"/>', '<path d="M12 6c-2-1.500-5-2-8-2v14c3 0 6 .500 8 2 2-1.500 5-2 8-2V4c-3 0-6 .500-8 2zM12 6v14"/>', '<path d="M12 21c4 0 6-3 6-6 0-4-4-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8 0 3 2 6 6 6z"/>', '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'];
  function renderLegacy() {
    const box = $('legacy'); const v = sim && sim.legacyView ? sim.legacyView() : null; const LG = window.LEGACY;
    if (!v || !LG) { box.innerHTML = '<div class="hint">A realm is remembered for what it does. Found your people first.</div>'; return; }
    const P = LG.PATHS, most = Math.max(1, ...v.pts);
    const head = `<div class="lg-head"><div class="lg-score"><b>${fmtInt(v.total)}</b><span>remembered · ${v.place ? ordinal(v.place) + ' of ' + v.of + ' realms' : ''}</span></div><div class="lg-paths">${P.map((p, i) => `<div class="lg-path" title="${esc(p.name)}: ${esc(p.heir)}"><div class="top"><svg viewBox="0 0 24 24">${PATH_ICON[i]}</svg>${esc(p.name)}<b>${fmtInt(v.pts[i])}</b></div><div class="bar"><i style="width:${Math.round(100 * v.pts[i] / most)}%"></i></div></div>`).join('')}</div></div>`;
    const cards = v.now.map((a) => `<div class="lg-card${a.got ? ' got' : ''}"><span class="lg-ic"><svg viewBox="0 0 24 24">${PATH_ICON[a.path]}</svg></span><span class="nm">${esc(a.name)}</span><span class="ask">${esc(a.ask)}</span><span class="pr">${a.got ? `Remembered since ${sim.fmtYear(a.got)} · ${a.worth}` : `<span class="bar"><i style="width:${Math.round(a.p * 100)}%"></i></span>${Math.round(a.p * 100)}% · ${a.worth}`}</span></div>`).join('');
    const her = v.her.length ? v.her.map(([e, p, y]) => `<div>Into the <b>${esc(LG.AGES[e])}</b>, ${sim.fmtYear(y)}: ${esc(P[p].what)}</div>`).join('') : '<div>Nothing yet: what an age leaves is chosen as the next begins.</div>';
    const ages = []; for (let e = 0; e < v.era; e++) { const row = v.past.filter((a) => a.era === e); ages.push(`<span>${esc(LG.AGES[e])}</span>${P.map((p, i) => { const a = row.find((q) => q.path === i); return `<i class="dot${a && a.got ? ' on' : ''}" title="${a ? esc(a.name) + (a.got ? ', ' + sim.fmtYear(a.got) : ': left undone') : ''}"></i>`; }).join('')}<span class="n">${row.filter((a) => a.got).reduce((t, a) => t + a.worth, 0)}</span>`); }
    const firsts = v.firsts.length ? v.firsts.sort((a, b) => a.at[0] - b.at[0]).map((f) => `<div class="lg-row${sim.civs[f.at[1]] && sim.civs[f.at[1]].player ? ' mine' : ''}"><span>${esc(f.name)}<br><span class="w">${esc(f.at[2])}</span></span><span class="v">${sim.fmtYear(f.at[0])}</span></div>`).join('') : '<div class="hint">Nobody has done anything first yet.</div>';
    const great = v.great.map((g, k) => `<div class="lg-row${g.mine ? ' mine' : ''}"><span>${k + 1}. ${esc(g.name)}${g.pts > 0 ? ` <span class="w">· ${esc(P[g.best].what)}</span>` : ''}</span><span class="v">${fmtInt(g.pts)}</span></div>`).join('') + v.hall.map((q) => `<div class="lg-row gone"><span>${esc(q[0])} <span class="w">· gone ${sim.fmtYear(q[3])}</span></span><span class="v">${fmtInt(q[1])}</span></div>`).join('');
    box.innerHTML = head + `<div><h3>The ambitions of the ${esc(v.age)}<small>fulfilled in their age, remembered for ever</small></h3><div class="lg-amb">${cards}</div>`
      + `<h3 style="margin-top:18px">What your people carry</h3><div class="lg-her">${her}</div>`
      + (ages.length ? `<h3 style="margin-top:18px">The ages behind you</h3><div class="lg-ages">${ages.join('')}</div>` : '') + `</div>`
      + `<div class="lg-side"><div><h3>The world's firsts</h3><div class="lg-list">${firsts}</div></div><div><h3>The great legacies</h3><div class="lg-list">${great}</div></div></div>`;
  }
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
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
    const facts = [`State: ${sim.fullName(c)} (people called the ${c.name}). Founded ${sim.fmtYear(c.founded)}; it is now ${sim.fmtYear(sim.year)}.`, `Era: ${sim.ERAS[c.era][0]}. Government: ${sim.govName(c)}. Capital: ${sim.cellName.get(c.capital) || 'unknown'} at ${sim.describeCell(c.capital)}. Population ${fmtPop(sim.popOf[c.id])}, territory ${sim.cellsOf[c.id]} regions, stability ${Math.round(c.stability * 100)}%.`, `Faith: ${c.religion || 'none'}. Current ruler: ${c.ruler.title} ${c.ruler.name} (since ${sim.fmtYear(c.ruler.since)}). Earlier rulers: ${c.rulers.slice(-8, -1).map(r => r.title + ' ' + r.name).join(', ') || 'lost to memory'}.`, `At war with: ${Object.keys(c.wars).map(k => sim.civs[+k]).filter(Boolean).map(x => sim.fullName(x)).join(', ') || 'nobody'}.`, `Recorded events (oldest first):\n${c.events.slice(-40).map(e => `${sim.fmtYear(e.year)}: ${e.text}`).join('\n')}`].join('\n');
    if (!sampleFn) { out.textContent = facts; return; }
    const prompt = `You are the court chronicler of a simulated world called Genesis, which runs on the real Earth from 10,000 BC. Write the history of one state in about 220 words, as a vivid, concrete chronicle: name the rulers, the wars, the faith, the era transitions, what the land is like where its capital stands (use the coordinates to place it on the real Earth and name the real region, river or mountains). Do not invent events that contradict the record, but you may colour them. Plain prose, two or three paragraphs, no headings, no bullet points, no preamble.\n\nRECORD:\n${facts}`;
    chronCtl = new AbortController(); out.textContent = 'The chronicler is thinking…'; $('btn-chronicle').disabled = true; $('btn-chronicle-stop').hidden = false;
    try { const r = await sampleFn(prompt, { signal: chronCtl.signal, onText: ({ text }) => { out.textContent = text; }, cache: false }); out.textContent = r.text; }
    catch (e) { const msg = { not_granted: 'Chronicles need permission to ask Claude; showing the raw record instead.', rate_limited: 'Too many requests right now. Try again in a moment.', cancelled: '' }[e && e.code]; out.textContent = (e && e.text) ? e.text : (msg === undefined ? facts : msg || facts); if (e && e.code === 'not_granted') sampleFn = null; }
    finally { $('btn-chronicle').disabled = false; $('btn-chronicle-stop').hidden = true; }
  }

  // ---------- settings ----------
  function loadSettings() {
    try { Object.assign(settings, JSON.parse(localStorage.getItem('genesis-settings') || '{}')); } catch (e) {}
    // (the game used to drop itself to Balanced when its first five seconds ran slow, as they do while models load, and stay there: whoever did not choose
    // that by hand gets the whole picture back)
    if (settings.quality !== 'high' && !settings.qualityPinned) settings.quality = 'high';
    applySettings();
  }
  function applySettings() { document.body.classList.toggle('continuous', !!settings.continuous); globals.uQuality.value = settings.quality === 'high' ? 1 : 0; if (trees) trees.enabled = settings.quality === 'high'; if (movers) movers.enabled = settings.quality === 'high'; if (fx) fx.enabled = true; renderer.setPixelRatio(softGL ? (window.GENESIS_PIXELS || 0.5) : Math.min(window.devicePixelRatio || 1, settings.quality === 'high' ? 2 : 1.25));      /* (a software renderer draws a quarter of the pixels unless asked) */ if (window.MODELS) MODELS.lodBias = softGL && !window.GENESIS_LOD ? 0.45 : renderer.getPixelRatio();   /* model detail is chosen by device pixels (a software renderer gets coarser models) */ document.documentElement.style.setProperty('--ui-scale', settings.uiScale); document.body.classList.toggle('glass', !!settings.glass && !matchMedia('(pointer: coarse)').matches); if (mapcam) mapcam.autoTilt = settings.autoTilt; if (window.TEX && TEX.ready) applyTextures(); try { localStorage.setItem('genesis-settings', JSON.stringify(settings)); } catch (e) {} }

  // ---------- UI binding ----------
  function bindUI() {
    $('btn-pause').addEventListener('click', () => { paused = !paused; updateClock(); updateTurnButton(); });
    $('btn-slower').addEventListener('click', () => setSpeedIdx(speedIdx - 1)); $('btn-faster').addEventListener('click', () => setSpeedIdx(speedIdx + 1));
    $('turn').addEventListener('click', onTurnClick);
    attachTip($('turn'), () => { if (!sim || !sim.playerCiv()) return ''; if (turnRun.active) return '<b>Time is running</b>Click to stop early.'; const q = computeAttention(); if (q.length) return `<b>${esc(q[0].t1)}</b>${esc(q[0].body || q[0].t2)}<div class="hint">Click to deal with it${q.length > 1 ? `; ${q.length - 1} more after this` : ''}.</div>`; const c = sim.playerCiv(); const next = sim.ERAS[c.era + 1]; return `<b>Advance ${turnLength()} years</b>To ${sim.fmtYear(sim.year + turnLength())}. The world moves while you watch, and stops if war, revolt or a new era needs you.<div class="hint">${next ? `Ring: ${next[0]} at ${next[1] * 100}% knowledge (now ${(c.tech * 100).toFixed(1)}%).` : ''}</div>`; });
    $('advisor').addEventListener('click', () => { const av = $('advisor'); const t = av.dataset.tool; if (av.dataset.ack) seen.ack.add(av.dataset.ack); if (av.dataset.att) { const q = computeAttention(); if (q.length) q[0].act(); updateTurnButton(); return; } if (av.dataset.go) { const i = +av.dataset.go; const [lon, lat] = placeOf(i); mapcam.flyTo(lon, lat, viewDist(i)); select(i); updateTurnButton(); return; } if (av.dataset.know) { TREE.open('tree', av.dataset.know); updateTurnButton(); return; } if (av.dataset.gov) { GOV.open(null, av.dataset.gov); updateTurnButton(); return; } if (av.dataset.market) { seen.ack.add('short' + av.dataset.market + Math.floor(sim.year / 40)); MARKET.open('ledger'); updateTurnButton(); return; } if (!t) { onTurnClick(); return; } openBuildFor(t); });
    $('report-close').addEventListener('click', () => { $('report').hidden = true; }); $('report-open').addEventListener('click', () => openChronicle('log'));
    $('l-build').addEventListener('click', () => { const on = document.body.classList.toggle('dockopen'); $('l-build').classList.toggle('on', on); if (!on) deselectTool(); });
    $('l-expand').addEventListener('click', () => setTool('settle'));
    $('l-city').addEventListener('click', () => openCity());
    MARKET.init({ sim: () => sim, fmtInt, fmtPop, toast, turnYears: () => turnLength(), cellDist: (a, b) => sim.cellDist(a, b), afterAct: () => refreshAll(true), flyTo: (i, d) => { const [lon, lat] = placeOf(i); mapcam.flyTo(lon, lat, d || viewDist(i), { duration: 1.8 }); select(i); } });
    $('l-market').addEventListener('click', () => { if (sim && mode === 'play') MARKET.open(); });
    TREE.init({ sim: () => sim, toast, afterAct: () => refreshAll(true), openGood: (g) => MARKET.open('board', g), openLaw: (key) => GOV.open(null, key) });
    $('l-know').addEventListener('click', () => { if (sim && mode === 'play') TREE.open(); });
    GOV.init({ sim: () => sim, toast, afterAct: () => refreshAll(true), openTree: (key) => TREE.open('tree', key) });
    $('l-gov').addEventListener('click', () => { if (sim && mode === 'play' && sim.playerCiv()) GOV.open(); });
    ENVOYS.init({ sim: () => sim, toast, fmtPop, afterAct: () => refreshAll(true), redraw: () => { world.refreshTextures(); world.updateBuildings(mapcam, true); }, openTree: (key) => TREE.open('tree', key), onWar: (id) => seen.wars.add(id),
      flyTo: (i) => { const [lon, lat] = placeOf(i); mapcam.flyTo(lon, lat, Math.min(Math.max(mapcam.dist, 0.02), 0.08), { duration: 1.8 }); select(i); } });
    $('l-dip').addEventListener('click', () => { if (sim && mode === 'play' && sim.playerCiv()) ENVOYS.open(); });
    WORKS.init({ sim: () => sim, toast, afterAct: () => refreshAll(true), lens: (k) => { if (k === 'renown' && !view.ren) setLens('ren'); },
      flyTo: (i) => { const [lon, lat] = placeOf(i); mapcam.flyTo(lon, lat, Math.min(Math.max(mapcam.dist, 0.004), 0.03), { duration: 1.8 }); select(i); } });
    $('l-cult').addEventListener('click', () => { if (sim && mode === 'play' && sim.playerCiv()) WORKS.open(); });
    // the host card: march (the next click on the map is where), halt, send home, close
    $('hc-march').addEventListener('click', () => { if (hostSel < 0) return; if (marching === hostSel) { marching = -1; banner(null); } else { marching = hostSel; banner('Click where your host should march: an enemy town to take, or a place on the way', true); } hostCardKey = ''; updateHostCard(); });
    $('hc-halt').addEventListener('click', () => { if (hostSel < 0) return; sim.army.halt(hostSel); toast('Your host halts and makes camp'); hostCardKey = ''; updateHostCard(); });
    $('hc-home').addEventListener('click', () => { if (hostSel < 0) return; sim.army.disband(hostSel); toast('Your host goes home: the levy is over'); closeHost(); refreshAll(true); });
    $('hc-x').addEventListener('click', () => closeHost());
    $('left').addEventListener('click', (e) => { const ch = e.target.closest('.goodchip[data-good]'); if (ch && mode === 'play') MARKET.open('board', +ch.dataset.good); const kg = e.target.closest('[data-kgo]'); if (kg && mode === 'play') TREE.open('tree', kg.dataset.kgo); const go = e.target.closest('[data-gopen]'); if (go && mode === 'play') GOV.open('laws'); const gg = e.target.closest('[data-ggo]'); if (gg && mode === 'play' && sim.playerCiv()) GOV.open(null, gg.dataset.ggo); const dg = e.target.closest('[data-dgo]'); if (dg && mode === 'play' && sim.playerCiv()) ENVOYS.open('realms', +dg.dataset.dgo); const fg = e.target.closest('[data-faith]'); if (fg && mode === 'play' && sim.playerCiv()) GOV.openFaith(+fg.dataset.faith); const cu = e.target.closest('[data-cult]'); if (cu && mode === 'play' && sim.playerCiv()) WORKS.open('mine'); const ct = e.target.closest('[data-court]'); if (ct && mode === 'play' && sim.playerCiv()) GOV.openCourt(+ct.dataset.court || 0); });
    $('lensbtn').addEventListener('click', () => { $('lensmenu').hidden = !$('lensmenu').hidden; });
    $('opt-stories').checked = settings.stories !== false; $('opt-stories').addEventListener('change', (e) => { settings.stories = e.target.checked; if (sim && sim.setStories) sim.setStories(settings.stories); applySettings(); });
    TALES.init({ sim: () => sim, toast, afterAct: () => { refreshAll(true); updateTurnButton(); }, onClose: () => updateTurnButton(), artOf });
    $('opt-continuous').checked = settings.continuous; $('opt-continuous').addEventListener('change', (e) => { settings.continuous = e.target.checked; if (turnRun.active) endTurn('stopped'); paused = true; applySettings(); updateTurnButton(); updateClock(); });
    attachTip($('date'), () => `<b>${sim.fmtYear(sim.year)}</b>${fmtInt(sim.year + 10000)} years since the first spring.`);
    document.querySelectorAll('.stance').forEach(b => b.addEventListener('click', () => { const c = sim && sim.playerCiv(); if (!c) return; c.policy.stance = b.dataset.stance; document.querySelectorAll('.stance').forEach(x => x.classList.toggle('on', x === b)); }));
    for (const k of ['research', 'military', 'tax']) { const inp = $('pol-' + k); inp.addEventListener('input', () => { $('pol-' + k + '-v').textContent = (+inp.value).toFixed(1); const c = sim && sim.playerCiv(); if (c) c.policy[k] = +inp.value; }); }
    $('btn-rename').addEventListener('click', () => { sim.renamePlayer($('in-name').value); refreshAll(true); });
    $('btn-menu').addEventListener('click', () => openMenu());
    $('m-close').addEventListener('click', () => $('menu').close()); $('m-resume').addEventListener('click', () => $('menu').close());
    $('m-save').addEventListener('click', () => { saveLocal(true); $('menu').close(); }); $('m-load').addEventListener('click', () => { if (loadLocal()) $('menu').close(); });
    $('m-new').addEventListener('click', () => { $('menu').close(); goHomeScreen(true); });
    $('ui-scale').value = settings.uiScale; $('ui-scale-v').textContent = settings.uiScale.toFixed(2); $('ui-scale').addEventListener('input', (e) => { settings.uiScale = +e.target.value; $('ui-scale-v').textContent = settings.uiScale.toFixed(2); applySettings(); });
    $('tip-delay').value = settings.tipDelay; $('tip-delay-v').textContent = settings.tipDelay; $('tip-delay').addEventListener('input', (e) => { settings.tipDelay = +e.target.value; $('tip-delay-v').textContent = settings.tipDelay; applySettings(); });
    $('opt-glass').checked = settings.glass; $('opt-glass').addEventListener('change', (e) => { settings.glass = e.target.checked; applySettings(); });
    $('opt-autotilt').checked = settings.autoTilt; $('opt-autotilt').addEventListener('change', (e) => { settings.autoTilt = e.target.checked; applySettings(); });
    $('opt-textures').checked = settings.textures !== false; $('opt-textures').addEventListener('change', (e) => { settings.textures = e.target.checked; applySettings(); });
    $('opt-quality').value = settings.quality; $('opt-quality').addEventListener('change', (e) => { settings.quality = e.target.value; settings.qualityPinned = true; applySettings(); });
    $('btn-choose').addEventListener('click', chooseMode); $('btn-random').addEventListener('click', () => { mapcam.locked = false; randomStart(); }); $('btn-load').addEventListener('click', () => loadLocal());
    $('btn-settings').addEventListener('click', () => openMenu()); $('btn-news').addEventListener('click', () => openNews()); $('news-close').addEventListener('click', () => $('news').close());
    $('btn-quit').addEventListener('click', () => { if (desktop) desktop.quit(); });
    $('found-ok').addEventListener('click', () => { if (!pendingFound) return; const { hit, i } = pendingFound; const y = (i / W) | 0, x = i - y * W; const su = clamp((hit.lon + 180) / 360 * W - x, 0.02, 0.98), sv = clamp((90 - hit.lat) / 180 * H - y, 0.02, 0.98); $('found').hidden = true; setSoil(false); startPlayer(i, $('found-name').value.trim(), [su, sv], true); pendingFound = null; });
    $('found-cancel').addEventListener('click', () => { $('found').hidden = true; pendingFound = null; });
    $('bannercancel').addEventListener('click', () => { if (tool) setTool(null); else if (mode === 'choose') goHomeScreen(false); });
    $('btn-close').addEventListener('click', deselect);
    $('btn-fly').addEventListener('click', () => { if (selected < 0) return; const [lon, lat] = placeOf(selected); mapcam.flyTo(lon, lat, Math.min(mapcam.dist, viewDist(selected)), { duration: 1.8 }); });
    $('l-chronicle').addEventListener('click', () => openChronicle('log')); $('l-empire').addEventListener('click', () => openRealm());
    // the seal opens the realm; the date and its ages, where the realm stands in knowledge; the plate on the right, what each line names
    $('id-seal').addEventListener('click', () => { if (sim && mode === 'play' && sim.playerCiv()) openRealm(); });
    attachTip($('id-seal'), () => { const c = sim && sim.playerCiv(); if (!c || !c.ruler) return ''; const D = sim.dynasty, p = D && c.ruler.pid ? D.of(c.ruler.pid) : null, H = p && p.h ? D.houses.get(p.h) : null, heir = D && H ? D.heirOf(c.id) : null; const T = sim.TRAITS[c.ruler.trait];
      return `<b>${esc(sim.fullName(c))}</b><div>${esc(sim.ERAS[c.era][0] + ' · ' + sim.govName(c))}</div><div class="row" style="margin-top:6px"><span>${esc(c.ruler.title + ' ' + c.ruler.name)}</span><span>${p ? sim.year - p.b : ''}</span></div>${H ? `<div>${esc(H.name.charAt(0).toUpperCase() + H.name.slice(1))}</div>` : ''}${T ? `<div>${esc(T.label)}: ${esc(T.desc)}</div>` : ''}${heir ? `<div class="row"><span>Heir</span><span>${esc(heir.n)}, ${sim.year - heir.b}</span></div>` : ''}<div class="hint">Click for your realm; the Court (V) has your family.</div>`; });
    $('date').addEventListener('click', () => { if (sim && mode === 'play' && sim.playerCiv()) TREE.open('stand'); });
    attachTip($('date'), () => (sim ? agesTip() : ''));
    $('notes').addEventListener('click', (e) => { const b = e.target.closest('[data-note]'); if (!b) return; const a = notesList[+b.dataset.note]; if (a && a.act) { $('tip').hidden = true; a.act(); } notesKey = ''; updateTurnButton(); });
    $('tk-body').addEventListener('click', (e) => { const b = e.target.closest('[data-tk]'); if (b) trackerAct(tkRows[+b.dataset.tk]); });
    $('tk-fold').addEventListener('click', () => { settings.trackerFolded = !settings.trackerFolded; try { localStorage.setItem('genesis-settings', JSON.stringify(settings)); } catch (e) {} tkKey = ''; updateTracker(); });
    // the ornaments of the age at the corners of the great plates
    for (const el of document.querySelectorAll('.modal.panel, #tracker')) for (const k of ['tl', 'tr', 'bl', 'br']) { const o = document.createElement('i'); o.className = 'orn ' + k; o.setAttribute('aria-hidden', 'true'); el.appendChild(o); }
    $('chron-close').addEventListener('click', () => $('chron').close());
    document.querySelectorAll('#chron .tabs button').forEach(b => b.addEventListener('click', () => setCTab(b.dataset.ctab)));
    $('v-pol').addEventListener('click', () => { view.political = !view.political; globals.uPolitical.value = view.political ? 1 : 0; $('v-pol').classList.toggle('on', view.political); });
    $('v-soil').addEventListener('click', () => setSoil(!view.soil));
    // the lens of government: every realm in the colour of the kind of rule it lives under, with a key to the colours
    $('v-gov').addEventListener('click', () => setLens(view.gov ? '' : 'gov'));
    // the lens of relations: every realm in the colour of how it stands with you (at war, sworn to you, friendly, wary, hostile, out of reach)
    $('v-ppl').addEventListener('click', () => setLens(view.ppl ? '' : 'ppl'));
    $('v-fth').addEventListener('click', () => setLens(view.fth ? '' : 'fth'));
    $('v-ren').addEventListener('click', () => setLens(view.ren ? '' : 'ren'));
    $('v-sick').addEventListener('click', () => setLens(view.sick ? '' : 'sick'));
    $('v-hrv').addEventListener('click', () => setLens(view.hrv ? '' : 'hrv'));
    $('v-rel').addEventListener('click', () => { if (!view.rel && !(sim && sim.playerCiv())) { toast('You have no realm for anyone to stand with yet'); return; } setLens(view.rel ? '' : 'rel'); });
    $('v-clouds').addEventListener('click', () => { view.clouds = !view.clouds; world.cloudsOn = view.clouds; $('v-clouds').classList.toggle('on', view.clouds); });
    $('v-labels').addEventListener('click', () => { view.labels = !view.labels; $('v-labels').classList.toggle('on', view.labels); });
    $('v-trade').addEventListener('click', () => { view.trade = !view.trade; $('v-trade').classList.toggle('on', view.trade); if (view.trade && sim && sim.playerCiv() && !sim.market.partners(sim.playerCiv().id).some(p => p.v > 0)) toast('No merchants reach you yet: touch another realm, or build a harbour'); });
    $('northbtn').addEventListener('click', () => { mapcam.tHeading = 0; }); $('topbtn').addEventListener('click', () => { mapcam.tTilt = 0; mapcam.tLift = 0; mapcam.autoTilt = false; });
    $('homebtn').addEventListener('click', goHome); $('orbitbtn').addEventListener('click', () => { mapcam.flyTo(mapcam.lon, mapcam.lat, 2.6, { tilt: 0, heading: 0, duration: 2 }); mapcam.autoTilt = settings.autoTilt; });
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (mode === 'intro') { homeKey(e); return; }
      if ($('tale').open || e.defaultPrevented) return;      // (a story has the keyboard while it is open: 1, 2, 3 choose, Esc puts it off; the Enter that closes it is its own, not the turn button's)
      if ($('market').open) { if (e.key === 'm' || e.key === 'M') MARKET.close(); return; }      // (the market has the keyboard while it is open; Esc closes it, as it does any dialog)
      if ($('know').open) { if (e.key === 'k' || e.key === 'K') TREE.close(); return; }
      if ($('gov').open) { if (e.key === 'v' || e.key === 'V') GOV.close(); return; }
      if ($('dip').open) { if (e.key === 'f' || e.key === 'F') ENVOYS.close(); return; }
      if ($('cult').open) { if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) WORKS.close(); return; }
      if (e.code === 'Space' || e.key === 'Enter') { if ($('chron').open || $('menu').open) return; e.preventDefault(); onTurnClick(); }
      else if (e.key === '+' || e.key === '=') { if (settings.continuous) setSpeedIdx(speedIdx + 1); } else if (e.key === '-' || e.key === '_') { if (settings.continuous) setSpeedIdx(speedIdx - 1); }
      else if (e.key === 'b' || e.key === 'B') { if (mode === 'play') openCity(); } else if (e.key === 'g' || e.key === 'G') $('l-build').click(); else if (e.key === 'r' || e.key === 'R') { if (mode === 'play') openRealm(); } else if (e.key === 'c' || e.key === 'C') { if (mode === 'play') openChronicle('log'); } else if (e.key === 'm' || e.key === 'M') { if (mode === 'play') MARKET.open(); } else if (e.key === 'k' || e.key === 'K') { if (mode === 'play') TREE.open(); } else if (e.key === 'v' || e.key === 'V') { if (mode === 'play' && sim.playerCiv()) GOV.open(); } else if (e.key === 'f' || e.key === 'F') { if (mode === 'play' && sim.playerCiv()) ENVOYS.open(); } else if (e.key === 'z' || e.key === 'Z') { if (e.shiftKey) $('v-ren').click(); else if (mode === 'play' && sim.playerCiv()) WORKS.open(); }
      else if (e.key === 'Escape') { if (mapcam.fly) mapcam.fly = null; else if (marching >= 0) { marching = -1; banner(null); } else if (hostSel >= 0) closeHost(); else if (placing) cancelPlacing(); else if (tool) setTool(null); else if (!$('found').hidden) { $('found').hidden = true; pendingFound = null; } else if ($('chron').open) $('chron').close(); else if ($('menu').open) $('menu').close(); else if (!$('lensmenu').hidden) $('lensmenu').hidden = true; else if (document.body.classList.contains('dockopen')) $('l-build').click(); else if (selected >= 0) deselect(); else if (mode === 'play') openMenu(); }
      else if (e.key === '`') { const d = $('debug'); d.style.display = d.style.display === 'block' ? 'none' : 'block'; }
      else if (e.key === 'P' && e.shiftKey) $('v-sick').click(); else if (e.key === 'p' || e.key === 'P') $('v-pol').click(); else if (e.key === 'l' || e.key === 'L') $('v-labels').click(); else if (e.key === 't' || e.key === 'T') $('v-trade').click(); else if (e.key === 'o' || e.key === 'O') $('v-gov').click(); else if (e.key === 'x' || e.key === 'X') $('v-rel').click(); else if (e.key === 'i' || e.key === 'I') $('v-ppl').click(); else if (e.key === 'j' || e.key === 'J') $('v-fth').click();
      else if (e.key === 'n' || e.key === 'N') mapcam.tHeading = 0; else if (e.key === 'u' || e.key === 'U') { mapcam.tTilt = 0; mapcam.tLift = 0; mapcam.autoTilt = false; }
      else if (e.key === 'H' && e.shiftKey) $('v-hrv').click(); else if (e.key === 'h' || e.key === 'H') goHome(); else if (e.key === 'y' || e.key === 'Y') { if (mode === 'play') findHost(); } else if (e.key === 'F9') { e.preventDefault(); document.body.classList.toggle('hidehud'); }
    });
    $('btn-chronicle').addEventListener('click', writeChronicle); $('btn-chronicle-stop').addEventListener('click', () => { if (chronCtl) chronCtl.abort(); });
    let compassIdle = 0; const wake = () => { $('compass').classList.remove('idle'); clearTimeout(compassIdle); compassIdle = setTimeout(() => $('compass').classList.add('idle'), 3000); }; renderer.domElement.addEventListener('pointermove', wake); renderer.domElement.addEventListener('wheel', wake, { passive: true }); wake();
    // labels are pointer-transparent except for double-click fly-to
    labelLayer.addEventListener('dblclick', (e) => { const el = e.target.closest('.lbl'); if (!el) return; const id = el.dataset.id;
      if (id[0] === 'p') { if (view.fth && sim.playerCiv() && mode === 'play') GOV.openFaith(+id.slice(1)); return; }      // (a faith's name, under its lens: its page; a people's: nothing)
      if (id[0] === 'h') { const X = sim.faith && sim.faith.list[+id.slice(1)]; if (X) { const [lon, lat] = placeOf(X.home); mapcam.flyTo(lon, lat, viewDist(X.home)); select(X.home); } return; } if (id[0] === 'c') { const i = +id.slice(1); const [lon, lat] = placeOf(i); mapcam.flyTo(lon, lat, viewDist(i)); select(i); } else { const c = sim.civs[+id.slice(1)]; if (c && c.capital >= 0) { const [lon, lat] = placeOf(c.capital); mapcam.flyTo(lon, lat, 0.15); select(c.capital); } } });
  }
  function goHome() { const c = sim.playerCiv(); if (!c || c.capital < 0) { toast('No capital yet'); return; } const [lon, lat] = placeOf(c.capital); mapcam.flyTo(lon, lat, viewDist(c.capital), { duration: 2 }); select(c.capital); }
  function openMenu() { $('m-title').textContent = mode === 'intro' ? 'Settings' : 'Menu'; $('m-info').textContent = `Tiles ${terrain.stats.tiles} · imagery packs ${terrain.stats.packsI} · elevation packs ${terrain.stats.packsE} · buildings ${world.buildingCount}`; $('menu').showModal(); }
  // a lens paints every realm by one thing about it, in place of its own colour: how it is governed, or how it stands with you
  function setLens(which) {
    view.gov = which === 'gov'; view.rel = which === 'rel'; view.ppl = which === 'ppl'; view.fth = which === 'fth'; view.ren = which === 'ren'; view.sick = which === 'sick'; view.hrv = which === 'hrv'; $('v-hrv').classList.toggle('on', view.hrv); $('v-gov').classList.toggle('on', view.gov); $('v-rel').classList.toggle('on', view.rel); $('v-ppl').classList.toggle('on', view.ppl); $('v-fth').classList.toggle('on', view.fth); $('v-ren').classList.toggle('on', view.ren); $('v-sick').classList.toggle('on', view.sick);
    world.palMode = view.gov ? 'form' : view.rel ? 'rel' : view.ppl ? 'people' : view.fth ? 'faith' : view.ren ? 'renown' : view.sick ? 'sick' : view.hrv ? 'harvest' : 'realm'; globals.uLens.value = which ? 1 : 0; if (which && !view.political) $('v-pol').click(); world.refreshTextures(); renderGovKey();
  }
  function renderGovKey() {
    const el = $('govkey'); el.hidden = !((view.gov || view.rel || view.ppl || view.fth || view.ren || view.sick || view.hrv) && sim && mode === 'play'); if (el.hidden) return;
    if (view.hrv) {
      // (this year's harvest place by place, in bands: climate.js; world.js paints by the same bands. The droughts under way, the great events, the age's climate)
      const CL = sim.climate; if (!CL) { el.innerHTML = '<span class="micro">The weather</span><span class="gk-note">A world from before the land had kinds has no weather of its own.</span>'; return; }
      const B = window.CLIMATE.BANDS, me = sim.playerCiv(), n = new Array(B.length).fill(0), mine = new Array(B.length).fill(0); for (const i of sim.LI) { const b = CL.bandOf(i); n[b]++; if (me && sim.owner[i] === me.id) mine[b]++; }
      const ep = CL.epoch(), evs = window.CLIMATE.EVENTS.filter((e) => sim.year >= e.y0 && sim.year < e.y1), dr = CL.spells.filter((x) => x.kind === 'drought').length;
      const hv = me ? sim.harvestOf(me.id) : 1;
      el.innerHTML = `<span class="micro">This year's harvest${me ? ` · yours ${Math.round(hv * 100)} in a hundred` : ''}</span>` + B.map((b, k) => (k === 0 ? '' : `<i class="${n[k] ? '' : 'off'}" style="background:${b.css}"></i><span class="${n[k] ? '' : 'none'}">${b.name}${mine[k] ? ' · you' : ''}</span><b>${n[k] ? Math.round(100 * n[k] / sim.LI.length) + '%' : ''}</b>`)).join('')
        + `<span class="gk-note"><b>${esc(ep.name.charAt(0).toUpperCase() + ep.name.slice(1))}</b>: ${esc(ep.text)}${evs.length ? ' Now: ' + evs.map((e) => esc(e.name)).join(', ') + '.' : ''} ${dr} drought${dr === 1 ? '' : 's'} under way in the world.</span>`;
      return;
    }
    if (view.sick) {
      // (the outbreaks under way, how far each has gone and how many it has killed; the player's realm shut against the sick, or not: disease.js)
      const V = sim.diseaseView(), q = V ? V.q : 0, B = window.DISEASE.BANDS;
      el.innerHTML = `<span class="micro">${V && V.all.length ? `Pestilence: ${V.all.length} under way` : 'No pestilence under way'}</span>` + (V ? V.all.map((o) => `<i style="background:${B[o.here ? 3 : 2].css}"></i><span class="gk-sick"><span>${esc(o.name.charAt(0).toUpperCase() + o.name.slice(1))}${o.here ? ' · <b>here</b>' : ''}</span><b>${o.realms}</b><small>${esc(o.kind)}, from ${esc(o.from)} in ${sim.fmtYear(o.year)} · ${fmtPop(o.dead)} dead</small></span>`).join('') : '')
        + B.map((b) => `<i style="background:${b.css}"></i><span class="none">${b.name}</span><b></b>`).join('')
        + `<span class="gk-row"><button class="btn${q === 0 ? ' on' : ''}" data-shut="0" title="Trade as usual">Open</button><button class="btn${q === 1 ? ' on' : ''}" data-shut="1" title="Ships and caravans from sick lands are turned away: half as likely to catch a pestilence; 5% less income">Harbours</button><button class="btn${q === 2 ? ' on' : ''}" data-shut="2" title="Nobody comes in: a pestilence seldom does; 12% less income">Everything</button></span><span class="gk-note">Shut your realm against the sick, at a price in trade.</span>`;
      el.querySelectorAll('[data-shut]').forEach((b) => b.addEventListener('click', () => { const why = sim.shutAgainst(+b.dataset.shut); toast(why || (+b.dataset.shut === 0 ? 'Your gates and harbours are open' : +b.dataset.shut === 1 ? 'Your harbours are shut to the sick' : 'Your realm is shut against the sick')); renderGovKey(); updateTracker(); }));
      return;
    }
    if (view.ren) {
      // (how renowned the realms are for their age, in bands: culture.js; world.js paints by the same bands)
      const K = sim.culture, n = {}; let gold = 0; for (const b of sim.civs) { if (!b) continue; const k = CULTURE.band(K.rel(b.id), K.isGolden(b.id)); n[k] = (n[k] || 0) + 1; if (K.isGolden(b.id)) gold++; }
      const me = sim.playerCiv(), mine = me ? CULTURE.band(K.rel(me.id), K.isGolden(me.id)) : '';
      el.innerHTML = `<span class="micro">Renown, against the usual for each age</span>` + CULTURE.BANDS.map((B) => { const on = n[B.key]; return `<i class="${on ? '' : 'off'}" style="background:${B.css}"></i><span class="${on ? '' : 'none'}">${B.name}${B.key === mine ? ' · you' : ''}</span><b>${n[B.key] || ''}</b>`; }).join(''); return;
    }
    if (view.fth) {
      // (the world's largest faiths, by their people; the player's own if it is not among them; and the old ways)
      const F = sim.faith, alive = F.list.filter((f) => f && f.n > 0), fams = new Set(alive.map((f) => f.fam)); let all = 0, kept = 0; for (let q = 0; q < sim.LI.length; q++) all += sim.pop[sim.LI[q]]; for (const f of alive) kept += f.pop;
      const mine = sim.playerCiv() ? F.state[sim.playerCiv().id] : 0; const top = alive.slice().sort((a, b) => b.pop - a.pop).slice(0, 7); if (mine && !top.some((f) => f.id === mine) && F.list[mine]) top.push(F.list[mine]);
      const sw = (f) => { const c = F.rgbOf(f.id); return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`; };
      el.innerHTML = `<span class="micro">The world's faiths: ${alive.length} in ${fams.size} families</span>` + top.map((f) => `<i style="background:${sw(f)}"></i><span>${esc(F.shortOf(f.id))}${f.id === mine ? ' · yours' : f.world ? '' : ''}</span><b>${Math.round(100 * f.pop / Math.max(1e-9, all))}%</b>`).join('') + (all - kept > all * 0.005 ? `<i class="off" style="background:rgb(120 112 98)"></i><span class="none">The old ways</span><b>${Math.round(100 * (all - kept) / Math.max(1e-9, all))}%</b>` : ''); return;
    }
    if (view.ppl) {
      // (the world's largest peoples, by their people; the player's own first if it is not among them)
      const P = sim.people, alive = P.list.filter((p) => p && p.n > 0), fams = new Set(alive.map((p) => p.fam)); let all = 0; for (const p of alive) all += p.pop;
      const mine = sim.playerCiv() ? P.ruling[sim.playerCiv().id] : 0; const top = alive.slice().sort((a, b) => b.pop - a.pop).slice(0, 7); if (mine && !top.some((p) => p.id === mine) && P.list[mine]) top.push(P.list[mine]);
      const sw = (p) => { const c = P.rgbOf(p.id); return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`; };
      el.innerHTML = `<span class="micro">The world's peoples: ${alive.length} in ${fams.size} families</span>` + top.map((p) => `<i style="background:${sw(p)}"></i><span>${esc(p.name)}${p.id === mine ? ' · yours' : ''}</span><b>${Math.round(100 * p.pop / Math.max(1e-9, all))}%</b>`).join('') + (sim.mig && sim.mig.flows.length ? `<span class="micro">Streams: the great migrations of the last ten years, in the colour of the people that went</span>` : ''); return;
    }
    if (view.rel) {
      const c = sim.playerCiv(); const n = {}; if (c) { const within = new Set(sim.diplo.reach(c.id)); for (const b of sim.civs) { if (!b || b === c) continue; const k = within.has(b.id) ? sim.diplo.standing(c, b) : 'far'; n[k] = (n[k] || 0) + 1; } }
      el.innerHTML = '<span class="micro">How the world stands with you</span>' + Object.keys(DIPLO.STAND).map((k) => { const on = n[k] || k === 'self'; return `<i class="${on ? '' : 'off'}" style="background:${DIPLO.STAND[k][1]}"></i><span class="${on ? '' : 'none'}">${DIPLO.STAND[k][0]}</span><b>${n[k] || ''}</b>`; }).join(''); return;
    }
    const n = {}, pp = {}; let pop = 0; for (const c of sim.civs) { if (!c) continue; const k = RULE.FORM[sim.rule.ruleOf(c).gov].kind; n[k] = (n[k] || 0) + 1; pp[k] = (pp[k] || 0) + sim.popOf[c.id]; pop += sim.popOf[c.id]; }
    el.innerHTML = '<span class="micro">How the world is governed</span>' + Object.keys(RULE.KINDS).map((k) => `<i class="${n[k] ? '' : 'off'}" style="background:${RULE.KINDS[k][1]}"></i><span class="${n[k] ? '' : 'none'}">${RULE.KINDS[k][0]}</span><b>${n[k] ? Math.round(100 * pp[k] / Math.max(1e-9, pop)) + '%' : ''}</b>`).join('');
  }
  // what the player's people will be remembered for, as it happens (legacy.js: an ambition fulfilled, a first, an age's ambitions lost)
  function legacyNews() { const L = sim && sim.legacy; if (!L || !L.news.length) return; const N = L.news.splice(0, L.news.length); for (const n of N.slice(-3)) toast(n.kind === 'first' ? `A first for your people: ${n.text}` : n.kind === 'lost' ? n.text : `Remembered: ${n.text}`); if (N.length && $('chron').open) renderLegacy(); }
  // what the realm's agents did, and what foreign ones did to it: told as it happens (the chronicle keeps the rest)
  function intrigueNews() { const X = sim && sim.intrigue; if (!X || !X.news.length) return; const N = X.news.splice(0, X.news.length); for (const n of N.slice(-3)) toast(n.text); }
  // a pestilence that reaches the realm, or burns itself out there (disease.js); the map under the lens of sickness changes with it
  function diseaseNews() { const X = sim && sim.disease; if (!X || !X.news.length) return; const N = X.news.splice(0, X.news.length); for (const n of N.slice(-2)) toast(n.text); if (view.sick) world.refreshTextures(); }
  function refreshAll(force) { legacyNews(); intrigueNews(); diseaseNews(); updateEconomy(); updateTurnButton(); updateClock(); updateDock(); updateTracker(); if (selected >= 0) { updateInspector(force); updateOutliner(); } updateMinimap(force); MARKET.renderMovers(); MARKET.refresh(); TREE.refresh(); GOV.refresh(); ENVOYS.refresh(); WORKS.refresh(); if (view.gov || view.rel || view.ppl || view.fth || view.ren || view.sick) renderGovKey(); }

  // ---------- home screen, version, updates ----------
  // version.json is written by the build: what this game is and what changed lately. window.desktop is the app's
  // bridge (desktop/preload.js); in a browser there is none, and with it no updates and no Quit.
  let VERSION = { name: 'Holocene', version: '', commit: '', built: '', seq: 0, notes: [] }; window.GENESIS_VERSION = VERSION;
  const desktop = window.desktop && window.desktop.update ? window.desktop : null;
  const versionReady = fetch('version.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((v) => { if (v && v.version) { VERSION = v; window.GENESIS_VERSION = v; } }).catch(() => {});
  const upd = { state: null, open: false, later: '', told: '' };
  const fmtBytes = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';
  const fmtDate = (d) => { const t = new Date(d + 'T12:00:00'); return isNaN(t) ? String(d || '') : t.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); };
  const firstPara = (b) => { const t = String(b || '').split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim(); return t.length > 460 ? t.slice(0, 440).replace(/\s+\S*$/, '') + '…' : t; };
  const seenKey = 'holocene-news-seen';
  function homeInit() {
    document.querySelectorAll('.home-menu > *').forEach((el, k) => el.style.setProperty('--i', k));
    if (desktop) {
      $('btn-quit').hidden = false;
      desktop.update.on((st) => { upd.state = st; onUpdateState(); }); desktop.update.onOpen(() => { upd.open = true; upd.later = ''; upd.asked = true; renderUpdate(); });
      desktop.update.state().then((st) => { upd.state = st; onUpdateState(); }).catch(() => {});
    }
    $('home-status').addEventListener('click', () => { const st = upd.state; if (!st || !desktop) return; if (updLive(st) || st.notice) { upd.open = true; renderUpdate(); } else desktop.update.check(); });
    $('upd-chip').addEventListener('click', () => { upd.open = true; renderUpdate(); });
    $('up-close').addEventListener('click', () => closeUpdate()); $('up-alt').addEventListener('click', () => updateAlt()); $('up-go').addEventListener('click', () => updateGo());
  }
  // what the home screen says about the saved world, the version and updates
  function homeRefresh() {
    const has = hasSave(); const pc = has && previewing && sim ? sim.playerCiv() : null;
    $('btn-load').hidden = !has; $('btn-load').classList.toggle('first', has); $('btn-choose').classList.toggle('first', !has);
    $('home-save').textContent = !has ? '' : pc ? `${sim.fullName(pc)}, ${sim.fmtYear(sim.year)}${pc.ruler ? ' · ' + pc.ruler.title + ' ' + pc.ruler.name : ''}` : previewing && sim ? `Your world, ${sim.fmtYear(sim.year)}` : 'Your saved world';      // (who rules it now)
    $('home-eras').hidden = !pc; if (pc) $('home-eras').innerHTML = sim.ERAS.map((e, k) => `<i class="${k < pc.era ? 'past' : k === pc.era ? 'now' : ''}"></i>`).join('') + `<span>${esc(sim.ERAS[pc.era][0])}</span>`;
    { const tape = $('home-tape'); const line = pc ? MARKET.homeLine() : ''; tape.hidden = !line; if (line) tape.innerHTML = line; }
    $('home-new-s').textContent = has ? 'Choose where your people begin (replaces your saved world)' : 'Choose where your people begin';
    $('home-version').textContent = VERSION.version ? `${VERSION.name || 'Holocene'} ${VERSION.version}` : (VERSION.name || 'Holocene');
    let seenC = ''; try { seenC = localStorage.getItem(seenKey) || ''; } catch (e) {}
    const newest = VERSION.notes && VERSION.notes[0] ? VERSION.notes[0].commit : ''; if (!seenC && newest) { seenC = newest; try { localStorage.setItem(seenKey, newest); } catch (e) {} }      // (a first start has nothing "new")
    $('btn-news').classList.toggle('fresh', !!newest && newest !== seenC);
    renderUpdate();
  }
  // up and down move through the list; Enter with nothing chosen takes the first entry
  function homeKey(e) {
    if ($('menu').open || $('news').open) return;
    const items = [...document.querySelectorAll('.home-menu .hm')].filter((b) => !b.hidden); const at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = items.length; items[at < 0 ? (e.key === 'ArrowDown' ? 0 : n - 1) : (at + (e.key === 'ArrowDown' ? 1 : n - 1)) % n].focus(); }
    else if (e.key === 'Enter' && at < 0 && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) { e.preventDefault(); const b = document.querySelector('.home-menu .hm.first:not([hidden])'); if (b) b.click(); }
  }
  function openNews(notes, sub) {
    const mine = !notes; notes = (notes || VERSION.notes || []).slice(0, 30); let seenC = ''; try { seenC = localStorage.getItem(seenKey) || ''; } catch (e) {}
    $('news-sub').textContent = sub || (VERSION.version ? 'Version ' + VERSION.version : '');
    let fresh = mine && !!seenC && notes.some((n) => n.commit === seenC);      // everything above the last note read is new
    $('news-body').innerHTML = notes.length ? notes.map((n) => { if (n.commit === seenC) fresh = false; const b = firstPara(n.body); return `<div class="note${fresh ? ' new' : ''}"><time>${esc(fmtDate(n.date))}</time><h3>${esc(n.title)}</h3>${b ? `<p>${esc(b)}</p>` : ''}</div>`; }).join('') : '<div class="hint">Nothing is recorded for this version.</div>';
    if (mine && notes[0]) { try { localStorage.setItem(seenKey, notes[0].commit); } catch (e) {} $('btn-news').classList.remove('fresh'); }
    const dlg = $('news'); if (!dlg.open) dlg.showModal(); $('news-body').scrollTop = 0;
  }
  // ---- updates (the app fetches them: desktop/updater.js; this is what the player sees of it) ----
  const updLive = (st) => !!st && (st.phase === 'available' || st.phase === 'downloading' || st.phase === 'ready' || st.phase === 'app-required');
  function onUpdateState() {
    const st = upd.state; if (!st) return;
    // a newly found update, or word that one was undone, shows itself once; "Later" keeps it to the spark
    const id = st.notice ? 'notice:' + st.notice : updLive(st) && st.latest ? st.latest.commit + ':' + (st.phase === 'app-required' ? 'app' : 'files') : '';
    if (id && id !== upd.told && id !== upd.later) { upd.told = id; upd.open = true; }
    if (!id && st.phase !== 'checking') upd.open = false;      // (looking again does not put the note away)
    // asked for from the menu: say how it came out even when there is nothing to show
    if (upd.asked && st.phase !== 'checking') { upd.asked = false; if (!id) toast(st.checkError && st.checkError !== 'none published' ? 'Could not check for updates. Is this Mac online?' : `Holocene ${VERSION.version} is up to date`, 4000); }
    renderUpdate();
  }
  function closeUpdate() { const st = upd.state; upd.open = false; if (st && st.notice && desktop) desktop.update.ack(); else if (st && st.latest) upd.later = upd.told; renderUpdate(); }
  function renderUpdate() {
    const st = upd.state; const box = $('update'), chip = $('upd-chip'), stat = $('home-status'); if (!box) return;
    const live = updLive(st), pct = st && st.progress && st.progress.total ? Math.round(100 * st.progress.bytes / st.progress.total) : 0;
    // the line at the foot of the home screen
    if (!st || st.phase === 'off') stat.hidden = true; else {
      stat.hidden = false; const v = st.latest ? st.latest.version : '';
      const text = st.phase === 'checking' ? 'Checking for updates…' : st.phase === 'available' ? `Update ${v} is ready to fetch` : st.phase === 'downloading' ? `Fetching update ${v}, ${pct}%` : st.phase === 'ready' ? `Update ${v} is fetched. Restart to use it` : st.phase === 'app-required' ? `Version ${v} needs a new copy of the app` : st.checkError && st.checkError !== 'none published' ? 'Could not check for updates. Try again' : 'Up to date';
      stat.innerHTML = (live ? '<i class="ember"></i>' : '') + esc(text); stat.disabled = st.phase === 'checking';
    }
    chip.hidden = !(live && !upd.open && mode !== 'intro'); if (!chip.hidden) $('upd-chip-t').textContent = st.phase === 'downloading' ? `Update ${pct}%` : st.phase === 'ready' ? 'Restart to update' : 'Update';
    if (!st || !upd.open || !$('loading').hidden) { box.hidden = true; return; }
    if (!(live || st.notice)) { if (st.phase !== 'checking') box.hidden = true; return; }      // (while it looks again, the note stays as it was)
    box.hidden = false; const L = st.latest, go = $('up-go'), alt = $('up-alt'), bar = $('up-bar'), notes = $('up-notes'), err = $('up-err');
    const set = (title, line, goText, altText) => { $('up-title').textContent = title; $('up-line').innerHTML = line; go.hidden = !goText; go.textContent = goText || ''; alt.hidden = !altText; alt.textContent = altText || ''; };
    bar.hidden = true; notes.hidden = true; err.hidden = true; go.disabled = false;
    if (st.notice) { set(st.notice === 'undone' ? 'The update was undone' : 'An update was removed', st.notice === 'undone' ? 'The new version did not start, so the game went back to the one that works. It will not be offered again.' : 'Files of the last update had gone missing, so the game is running the version the app came with. The update can be fetched again.', 'OK', ''); return; }
    const list = () => { const n = L.notes || []; if (!n.length) return; notes.hidden = false; notes.innerHTML = n.slice(0, 4).map((x) => `<li>${esc(x.title)}</li>`).join('') + (n.length > 4 ? `<li class="more"><button class="linkish" id="up-more">and ${n.length - 4} more</button></li>` : ''); const m = $('up-more'); if (m) m.addEventListener('click', () => openNews(L.notes, 'Version ' + L.version)); };
    if (st.error) { err.hidden = false; err.textContent = st.error; }
    if (st.phase === 'available') { set('Update ready', `<b>Version ${esc(L.version)}</b> is out. ${L.files} ${L.files === 1 ? 'file' : 'files'} to fetch, ${fmtBytes(L.bytes)}.`, st.error ? 'Try again' : 'Update now', 'Later'); list(); }
    else if (st.phase === 'downloading') { set('Fetching the update', `${fmtBytes(st.progress.bytes)} of ${fmtBytes(st.progress.total)}`, '', 'Stop'); bar.hidden = false; $('up-fill').style.transform = `scaleX(${Math.max(0.02, pct / 100)})`; }
    else if (st.phase === 'ready') { set('Update fetched', `<b>Version ${esc(L.version)}</b> is ready to use${mode === 'play' ? ': your world is saved first, and you carry on where you were.' : '.'} Left for later, it goes in the next time the game is started.`, 'Restart now', 'Later'); list(); }
    else if (st.phase === 'app-required') {
      const a = st.app || {}, size = L.app ? fmtBytes(L.app.bytes) : '';
      if (a.error) { err.hidden = false; err.textContent = a.error; }
      if (a.phase === 'downloading') { const p = a.total ? a.bytes / a.total : 0; set('Fetching the new app', `${fmtBytes(a.bytes)} of ${fmtBytes(a.total)}`, '', 'Stop'); bar.hidden = false; $('up-fill').style.transform = `scaleX(${Math.max(0.02, p)})`; }
      else if (a.phase === 'ready') set('The new app is here', 'Its disk image is open in Finder. Quit Holocene, drag the new Holocene onto Applications, and start it again. Your worlds are kept.', 'Quit Holocene', 'Show the file');
      else { set('A new app is needed', `<b>Version ${esc(L.version)}</b> changes the app itself, so it comes as a fresh download${size ? ' (' + size + ')' : ''} instead of an update.`, a.error ? 'Try again' : 'Download it', 'Later'); list(); }
    }
  }
  function updateGo() {
    const st = upd.state; if (!st || !desktop) return;
    if (st.notice) { closeUpdate(); return; }
    if (st.phase === 'available') desktop.update.start();
    else if (st.phase === 'ready') applyUpdate();
    else if (st.phase === 'app-required') { if (st.app && st.app.phase === 'ready') desktop.quit(); else desktop.update.getApp(); }
  }
  function updateAlt() {
    const st = upd.state; if (!st || !desktop) return;
    if (st.phase === 'downloading') desktop.update.cancel();
    else if (st.phase === 'app-required' && st.app && st.app.phase === 'downloading') desktop.update.cancelApp();
    else if (st.phase === 'app-required' && st.app && st.app.phase === 'ready') desktop.update.showApp();
    else closeUpdate();
  }
  // put a fetched update to use: the world is saved, the page comes up again on the new files, and play carries on
  async function applyUpdate() {
    try { sessionStorage.setItem('holocene-updated', VERSION.commit || '?'); if (mode === 'play') { if (turnRun.active) endTurn('stopped'); saveLocal(false); sessionStorage.setItem('holocene-resume', '1'); } } catch (e) {}
    $('up-go').disabled = true;
    let ok = false; try { ok = await desktop.update.apply(); } catch (e) {}
    if (!ok) { try { sessionStorage.removeItem('holocene-updated'); sessionStorage.removeItem('holocene-resume'); } catch (e) {} $('up-go').disabled = false; toast('The update could not be put to use. Try fetching it again'); }
  }
  // after the page has come up again: say so if it is on a new version
  function afterUpdate() {
    try { sessionStorage.removeItem('holocene-updated'); const was = +localStorage.getItem('holocene-seq') || 0; if (VERSION.seq) { if (was && VERSION.seq > was) toast(`Updated to version ${VERSION.version}`, 6000); localStorage.setItem('holocene-seq', String(VERSION.seq)); } } catch (e) {}
    renderUpdate();
  }

  // ---------- persistence ----------
  const SAVE_KEY = 'genesis-save-v2';
  function saveLocal(announce) {
    if (!sim || mode !== 'play') { if (announce) toast('Nothing to save yet'); return; }
    try { const s = sim.save(); s.cam = { lon: mapcam.lon, lat: mapcam.lat, dist: mapcam.dist, tilt: mapcam.tilt, heading: mapcam.heading }; localStorage.setItem(SAVE_KEY, JSON.stringify(s)); if (announce) toast('World saved'); } catch (e) { if (announce) toast('Could not save here (storage blocked or full)'); }
  }
  function readSave() { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; }
  function loadLocal(quiet) {
    try {
      const s = readSave(); if (!s) { toast('No saved world here'); return false; }
      sim = createSim(worldData, s.seed || 1); sim.load(s); world.setSim(sim); previewing = false; if (sim.setStories) sim.setStories(settings.stories !== false);
      const fromHome = mode === 'intro';
      setMode('play'); $('intro').hidden = true; banner(null); mapcam.locked = false; mapcam.idleSpin = false; mapcam.fly = null; paused = true;
      if (s.cam) {
        sunFor(s.cam.lon);
        // from the home screen the camera flies down to where the world was left; otherwise it is simply there
        if (fromHome && !quiet) mapcam.flyTo(s.cam.lon, s.cam.lat, s.cam.dist, { duration: 2.8, tilt: s.cam.tilt, heading: s.cam.heading });
        else { mapcam.tLon = mapcam.lon = s.cam.lon; mapcam.tLat = mapcam.lat = s.cam.lat; mapcam.tDist = mapcam.dist = s.cam.dist; mapcam.tTilt = mapcam.tilt = s.cam.tilt; mapcam.tLift = mapcam.lift = 0; mapcam.tHeading = mapcam.heading = s.cam.heading; }
      }
      feedIdx = sim.worldEvents.length; seen.wars.clear(); seen.ack.clear(); seen.era = -1; seen.turns = 1; turnRun.active = false; turnRun.townSet = null; turnRun.capital = -1; paused = true; snapshotTurn(); refreshAll(true); world.updateBuildings(mapcam, true);
      if (!quiet) toast(`Welcome back. It is ${sim.fmtYear(sim.year)}.`); return true;
    } catch (e) { console.warn('save could not be read', e); toast('The saved world could not be read'); return false; }
  }
  // the saved world, shown on the home screen without being entered: its lands, its towns, its lights after dark
  function previewSave() {
    let s = null; try { s = readSave(); } catch (e) {} if (!s) return false;
    try {
      sim = createSim(worldData, s.seed || 1); sim.load(s); world.setSim(sim); previewing = true; refreshAll(true);
      return true;
    } catch (e) { console.warn('the saved world could not be shown', e); newWorld((Math.random() * 2 ** 31) | 0); return false; }
  }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  setInterval(() => saveLocal(false), 60000);
  window.addEventListener('beforeunload', () => saveLocal(false));      // closing the window or restarting the game keeps the world as it is

  // ---------- loop ----------
  let frameNo = 0; let last = performance.now(), acc = 0, texAge = 0, uiAge = 0, tpsCount = 0, tpsT = 0, sunAngle = 0.6, mmT = 0, olT = 0, seasonPhase = 0.45;
  let framesDrawn = 0, lastReal = performance.now();
  // The sky as water mirrors it (the ground's shader: uSkyR). Its light from five heights above the horizon, toward the sun,
  // across and away from it, where the camera stands, by the same sum the sky itself is drawn with: fifteen lines of sight a
  // frame, here, instead of one at every pixel of the sea.
  const _skyDir = [0, 0, 0], _skyC = [0, 0, 0], _skyS = [0, 0, 0], _skyOpt = { near: [1, 1, 1] };
  function skyMirror() {
    const U = AIR.uniforms, E = U.uAirE.value.x, N = U.uAirN.value, K = U.uAirK.value, out = globals.uSkyR.value;
    const su = Math.min(1, Math.max(-1, AIR.sunUp)), sh = Math.sqrt(Math.max(1 - su * su, 0));
    _skyS[0] = sh; _skyS[1] = 0; _skyS[2] = su; _skyC[0] = 0; _skyC[1] = 0; _skyC[2] = -(AIR.RG + 1e-6);
    _skyOpt.near[0] = K.x; _skyOpt.near[1] = K.y; _skyOpt.near[2] = K.z;
    for (let ie = 0; ie < 5; ie++) {
      const sinE = Math.max(ie * ie / 16, 0.012), cosE = Math.sqrt(1 - sinE * sinE);      // (the lowest a little above the horizon itself: along the ground the air has no end)
      for (let ia = 0; ia < 3; ia++) {
        const ca = 1 - ia, sa = ia === 1 ? 1 : 0;
        _skyDir[0] = cosE * ca; _skyDir[1] = cosE * sa; _skyDir[2] = sinE;
        const r = AIR.march(_skyC, _skyDir, Infinity, 12, _skyS, _skyOpt), o = (ie * 3 + ia) * 3;
        out[o] = r.L[0] * E + N.x * (1 - r.T[0]); out[o + 1] = r.L[1] * E + N.y * (1 - r.T[1]); out[o + 2] = r.L[2] * E + N.z * (1 - r.T[2]);
      }
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const modalOpen = $('chron').open || $('menu').open || $('news').open || $('market').open || $('know').open || $('gov').open || $('dip').open || $('cult').open || $('tale').open;
    mapcam.update(dt);
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();      // everything this frame (sun in view space, shadow lookup) works from the camera where it now is
    // seasons: one year every four minutes of real time; the sun's declination swings with it and the ground follows
    if (!window.__seasonLock) seasonPhase = (seasonPhase + dt / 240) % 1; const decl = -0.4 * Math.cos(seasonPhase * Math.PI * 2);
    { const wN = 0.5 + 0.5 * Math.cos(seasonPhase * Math.PI * 2); const gauss = (x, c) => Math.exp(-Math.pow(((x - c + 1.5) % 1) - 0.5, 2) / 0.006); globals.uSeason.value.set(wN, gauss(seasonPhase, 0.82), 1 - wN, gauss(seasonPhase, 0.32)); 
      // the leaves are down from late autumn until spring is well under way (north; the south half a year later): not with the sun's height, which is halfway down at the height of the autumn colours
      const leafOff = (p) => { const t = p >= 0.5 ? (p - 0.86) / 0.08 : 1 - (p - 0.27) / 0.09; const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
      // and the cold of the year runs a month behind the sun: the depth of winter is late January, not the solstice
      const coldN = 0.5 + 0.5 * Math.cos((seasonPhase - 0.08) * Math.PI * 2);
      globals.uBare.value.set(leafOff(seasonPhase), leafOff((seasonPhase + 0.5) % 1), coldN, 1 - coldN);
      // (and the sea is slower still: its ice is at its widest when winter ends, early in March and in September, eleven weeks behind the sun)
      // (the sea's ice is widest eleven weeks behind the sun; a lake freezes on that clock but thaws on one five weeks behind it, the
      //  two joined over a few weeks either side of the turn: terrain.js, lakeOff)
      { const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }, cl = (ph) => 0.5 + 0.5 * Math.cos((ph - 0.21) * Math.PI * 2);
        const lake = (ph) => { const t = sm(0.15, 0.3, ph) * (1 - sm(0.55, 0.7, ph)); return cl(ph) + (0.5 + 0.5 * Math.cos((ph - 0.13) * Math.PI * 2) - cl(ph)) * t; };
        const iceN = cl(seasonPhase); globals.uIceCold.value.set(iceN, 1 - iceN, lake(seasonPhase), lake((seasonPhase + 0.5) % 1)); }
      if (trees) { trees.season = globals.uSeason.value; trees.bareness = globals.uBare.value; } }
    climateUniforms();
    const real = Math.min(1.5, (now - lastReal) / 1000); lastReal = now;      // (the step above is capped for the simulation's sake; these go by the clock, so a slow machine is not left with a half-moved picture)
    { const want = mode === 'intro' ? 1 : 0; if (Math.abs(want - homeK) > 0.0005) { homeK += (want - homeK) * (1 - Math.exp(-real * 3)); if (Math.abs(want - homeK) < 0.004) homeK = want; frameHome(); camera.updateProjectionMatrix(); } }
    if (!window.__sunLock) {
      // on the home screen the sun keeps its place in the picture; in the game it goes round once in nine minutes
      if (mode === 'intro') _sun.set(HOME.sun[0], HOME.sun[1], HOME.sun[2]).normalize().transformDirection(camera.matrixWorld);
      else { sunAngle += dt * 0.012; const cd = Math.sqrt(1 - decl * decl); _sun.set(Math.cos(sunAngle) * cd, decl, Math.sin(sunAngle) * cd).normalize(); }
      if (sunEase > 0) { sunEase -= real; globals.uSun.value.lerp(_sun, 1 - Math.exp(-real * 3.5)).normalize(); } else globals.uSun.value.copy(_sun);
    }
    globals.uTime.value = now / 1000; globals.uCamAlt.value = mapcam.agl === undefined ? mapcam.alt : mapcam.agl;      // (above the ground looked at: camera.js)
    const sp = speed();
    if (sim && mode === 'play' && sp > 0) {
      acc += sp * dt; const t0 = performance.now(); let n = 0;
      while (acc >= 1 && performance.now() - t0 < (turnRun.active ? 22 : 12)) { sim.tick(); acc -= 1; n++; tpsCount++; }
      if (acc > 5) acc = 5; texAge += n; uiAge += n;
      if (texAge >= 3 && n > 0) { world.refreshTextures(); texAge = 0; }
      if (uiAge >= 4) { updateEconomy(); updateClock(); updateDock(); updateTurnButton(); if (selected >= 0 && !modalOpen) updateInspector(false); uiAge = 0; if ($('know').open) TREE.refresh(); if ($('gov').open) GOV.refresh(); if ($('dip').open) ENVOYS.refresh(); if ($('cult').open) WORKS.refresh(); if ($('market').open) MARKET.refresh(); }
      if (turnRun.active) { checkInterrupts(); if (turnRun.active && sim.year >= turnRun.target) endTurn(''); }
      // (in continuous time a story stops the clock and is read at once)
      else if (settings.continuous && !paused) { const c = sim.playerCiv(); if (c && c.story && c.story.q && !$('tale').open) { paused = true; updateTurnButton(); updateClock(); TALES.show(); } }
    }
    if (sim && mode === 'play') pumpFeed(now);
    terrain.dispOn = settings.quality === 'high' && mapcam.alt < 0.06;
    terrain.update(camera, stage.clientHeight);
    if (decal) decal.update(mapcam, sim, now, sim ? sim.year + ':' + world.texVersion : 0, globals.uSun.value, world, trees);
    if (trees) trees.update(mapcam, sim, now);
    globals.uGndK.value.w = GND_PX * Math.sqrt(renderer.getPixelRatio());      // (the ground's materials: a repeat is so many device pixels across; on a screen of twice the pixels a little more of them, so that what the materials show is neither half the size nor half as sharp there)
    const devH = stage.clientHeight * renderer.getPixelRatio();      // point sprites are sized in device pixels
    world.starUniforms.uPx.value = renderer.getPixelRatio();
    world.seasonPhase = seasonPhase; world.viewH = devH;
    const day = world.updateSky(mapcam, globals.uSun.value, now / 1000);
    if (life && mode === 'play') life.update(mapcam, sim, now, world.bUniforms.uDay.value, devH, camera.fov);      // (after the sky: smoke and fires take this frame's light, not the last one's)
    if (movers && mode === 'play') movers.update(mapcam, sim, decal, now, dt, world.bUniforms.uDay.value, devH, camera.fov);
    if (troops) { if (mode === 'play') { troops.update(mapcam, sim, now, dt, project); updateHostCard(); } else troops.clear(); }
    if (fx && mode === 'play') { fx.update(mapcam, sim, now, dt, world.bUniforms.uDay.value, devH, camera.fov); if (fx.shake > 0.001) { const a = fx.shake * fx.shake * mapcam.dist * 0.02; camera.position.x += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a; camera.position.z += (Math.random() - 0.5) * a; camera.updateMatrixWorld(); } }
    if (world.cloudTex && globals.uClouds.value !== world.cloudTex) globals.uClouds.value = world.cloudTex;
    globals.uCloudShift.value = world.cloudShift; globals.uCloudVis.value = world.cloudVis; globals.uCloudNear.value = world.cloudNear;
    world.updateBuildings(mapcam, false);
    // whether snow lies here now (by the climate of the place and the time of year): roofs go white with the ground
    if (trees && trees.ready && mapcam.alt < 0.03) world.bUniforms.uSnow.value = trees.lyingAt(mapcam.lon, mapcam.lat, mapcam.lat >= 0 ? globals.uBare.value.z : globals.uBare.value.w, mapcam.agl === undefined ? 0 : (mapcam.alt - mapcam.agl) * GEO.R_M / terrain.exag);
    // the colour of the ground hereabouts, for the light it throws back onto walls in shade (looked up now and then)
    if (trees && trees.ready && ((frameNo = (frameNo + 1) % 20) === 0) && mapcam.alt < 0.03) {
      const fw = trees.forestAt(mapcam.lon, mapcam.lat, Math.max(1, terrain.heightAt(mapcam.lon, mapcam.lat))); const g = world.bUniforms.uGround.value;
      if (fw && fw.warm !== undefined) { const o = Math.max(0, 1 - fw.f - fw.g), w = fw.warm;
        g.set(fw.f * 0.16 + fw.g * (0.36 + 0.19 * w) + o * (0.5 + 0.36 * w), fw.f * 0.22 + fw.g * (0.40 + 0.06 * w) + o * (0.48 + 0.16 * w), fw.f * 0.10 + fw.g * (0.20 + 0.06 * w) + o * (0.44 - 0.06 * w)); const sn = world.bUniforms.uSnow.value; if (sn > 0.01) g.set(g.x + (0.85 - g.x) * sn, g.y + (0.88 - g.y) * sn, g.z + (0.93 - g.z) * sn); }      // (snow throws back far more light than earth)
    }
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
    // the air for this frame (air.js): where the planet and the sun are from the camera, how far the eye is opened. The sky is drawn through it, so behind everything is the black of space
    if (window.AIR) { camera.updateMatrixWorld(); AIR.update(camera, globals.uSun.value, mapcam.alt, mapcam.dist); }
    if (window.AIR) skyMirror();
    const posted = postOk && !POST.off && !POST.broken && settings.quality === 'high'; globals.uGlow.value = world.bUniforms.uGlow.value = posted ? 1 : 0; if (life) life.uniforms.uGlow.value = posted ? 1 : 0;
    updateLabels(); updatePlots(); updateFlows();
    if (now - mmT > 700) { mmT = now; updateMinimap(false); }
    tpsT += dt; if (tpsT > 1) { $('yps').textContent = tpsCount + ' yr/s'; tpsCount = 0; tpsT = 0; const d = $('debug'); if (d.style.display === 'block') d.textContent = `elev ${JSON.stringify(terrain.stats.elevLevels)} tiles ${terrain.stats.tiles} sse ${terrain.stats.sse | 0} packs i${terrain.stats.packsI} e${terrain.stats.packsE} loading ${terrain.stats.loading} buildings ${world.buildingCount} trees ${trees ? trees.count : 0} labels ${labelEls.size} movers ${movers ? movers.stats.agents + '/' + movers.stats.walkers + '/' + movers.stats.ships : 0} alt ${(mapcam.alt * 6371).toFixed(1)}km dist ${(mapcam.dist * 6371).toFixed(1)}km tilt ${(mapcam.tilt * 57.3).toFixed(0)}`; }
    if (trees) trees.uCover.value = !trees.coverOff && (posted ? POST.samples > 1 : msaa) ? 1 : 0;      // (cut-out trees: several samples a pixel smooth their outlines)
    if (!modalOpen || (now | 0) % 6 === 0) { if (posted) POST.render(renderer, scene, camera, mapcam.alt, now / 1000); else renderer.render(scene, camera); }
    if (++framesDrawn === 3 && desktop) desktop.ready();      // the game is up: an update put to use just now is kept
  }
  boot();
})();
