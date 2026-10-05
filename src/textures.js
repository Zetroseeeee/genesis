// GENESIS textures: the generated material atlases (walls, roofs, ground, land use, water) as WebGL2 texture arrays,
// plus the UI art. Classic script; exposes window.TEX.
//
// Each atlas is a 2048x2048 WebP of 4x4 tileable 512px cells. In the browser the cells are split into a
// DataTexture2DArray so each material repeats and mipmaps cleanly (no atlas bleeding). Without WebGL2 (or if the
// atlases fail to load) nothing is set up and the shaders keep their procedural look.
(function () {
  const TEX = { ready: false, unsupported: false, failed: false, ui: {}, arrays: {}, scale: {}, mean: {}, layers: {}, misc: {}, manifest: null, loading: null, ground: null };

  function loadImg(url) {
    return new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => { console.warn('texture atlas failed', url); res(null); }; im.src = url; });
  }
  // split an atlas image into a texture array; returns { tex, mean: Float32Array(3*n), n }
  function toArray(img, cell, n, anisotropy, half) {
    const layers = n * n; const cv = document.createElement('canvas'); cv.width = half ? img.width >> 1 : img.width; cv.height = half ? img.height >> 1 : img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const sx = cv.width / (n * cell);                      // the atlas may be served smaller than nominal
    const C = Math.round(cell * sx);
    const data = new Uint8Array(C * C * 4 * layers); const mean = new Float32Array(layers * 3);
    for (let l = 0; l < layers; l++) {
      const id = ctx.getImageData((l % n) * C, Math.floor(l / n) * C, C, C); data.set(id.data, l * C * C * 4);
      let r = 0, g = 0, b = 0; const d = id.data; const step = 16;        // mean colour of the layer (sparse sample)
      for (let p = 0; p < d.length; p += 4 * step) { r += d[p]; g += d[p + 1]; b += d[p + 2]; }
      const cnt = d.length / (4 * step); mean[l * 3] = r / cnt / 255; mean[l * 3 + 1] = g / cnt / 255; mean[l * 3 + 2] = b / cnt / 255;
    }
    const tex = new THREE.DataTexture2DArray(data, C, C, layers);
    tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; tex.anisotropy = anisotropy || 4; tex.needsUpdate = true;
    return { tex, mean, n: layers, size: C };
  }
  // an atlas of cols x rows cells as a texture array, at 1 / shrink of its size; `more` (canvases or images) are added as further
  // layers, each drawn to the size of a cell
  function toGrid(img, cell, cols, rows, anisotropy, shrink, more) {
    const k = 1 / (shrink || 1), W = Math.round(img.width * k), H = Math.round(img.height * k), C = Math.round(W / cols), extra = more || [], layers = cols * rows + extra.length;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, W, H);
    const data = new Uint8Array(C * C * 4 * layers);
    for (let l = 0; l < cols * rows; l++) data.set(ctx.getImageData((l % cols) * C, Math.floor(l / cols) * C, C, C).data, l * C * C * 4);
    extra.forEach((e, i) => { const c2 = document.createElement('canvas'); c2.width = c2.height = C; const x2 = c2.getContext('2d', { willReadFrequently: true }); x2.drawImage(e, 0, 0, C, C); data.set(x2.getImageData(0, 0, C, C).data, (cols * rows + i) * C * C * 4); });
    const tex = new THREE.DataTexture2DArray(data, C, C, layers);
    tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; tex.anisotropy = anisotropy || 4; tex.needsUpdate = true;
    return { tex, n: layers, size: C };
  }
  // The ground's own materials (the manifest's "ground": a list packed by tools/ground/build.py, with two atlases beside it): the
  // colours, and in a second array the relief (red and green: the normal map) and the heights (blue). The shallows' caustics ride
  // along as one more layer of the colours, so that the ground's shader needs no texture of its own for them. Where the pack is
  // not there, TEX.ground stays null and the ground is drawn as it was.
  async function loadGround(url, aniso, shrink, shallows) {
    let man; try { const r = await fetch(url); if (!r.ok) return null; man = await r.json(); } catch (e) { return null; }
    const base = url.replace(/[^/]*$/, ''); const [a, nm] = await Promise.all([loadImg(base + man.albedo), loadImg(base + man.normal)]); if (!a || !nm) return null;
    const cols = man.cols || 4, rows = man.rows || 4, A = toGrid(a, man.cell, cols, rows, aniso, shrink, shallows ? [shallows] : []), N = toGrid(nm, man.cell, cols, rows, aniso, shrink);
    const L = man.layers || [], count = cols * rows, cells = new Float32Array(count * 2), mean = new Float32Array(count * 3);
    // (a layer's two sizes, in the ground's cells of a metre and a half: powers of two, so that they repeat across the tiles' edges)
    const pow2 = (m) => Math.min(1024, Math.max(1, Math.pow(2, Math.round(Math.log2(Math.max(1.5, m) / 1.5)))));
    for (let i = 0; i < count; i++) { const l = L[i] || {}; cells[i * 2] = pow2(l.near || 12); cells[i * 2 + 1] = pow2(l.far || 96); const m = l.mean || [0.5, 0.5, 0.5]; mean[i * 3] = m[0]; mean[i * 3 + 1] = m[1]; mean[i * 3 + 2] = m[2]; }
    return { albedo: A.tex, relief: N.tex, size: A.size, count, cells, mean, shallows: shallows ? count : -1, layers: L, made: man.made };
  }
  // one cell of an atlas as a plain repeating 2D texture (water, clouds)
  function cellTexture(img, cell, n, idx, anisotropy) {
    const sx = img.width / (n * cell); const C = Math.round(cell * sx);
    const cv = document.createElement('canvas'); cv.width = C; cv.height = C; const ctx = cv.getContext('2d');
    ctx.drawImage(img, (idx % n) * C, Math.floor(idx / n) * C, C, C, 0, 0, C, C);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anisotropy || 4; t.needsUpdate = true; return t;
  }
  // a tangent-space normal map from the luminance of a cell (small waves from the ocean tile)
  function normalFromCell(img, cell, n, idx, strength, anisotropy) {
    const sx = img.width / (n * cell); const C = Math.round(cell * sx);
    const cv = document.createElement('canvas'); cv.width = C; cv.height = C; const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, (idx % n) * C, Math.floor(idx / n) * C, C, C, 0, 0, C, C);
    const src = ctx.getImageData(0, 0, C, C).data; const lum = new Float32Array(C * C);
    for (let p = 0; p < C * C; p++) lum[p] = (src[p * 4] * 0.299 + src[p * 4 + 1] * 0.587 + src[p * 4 + 2] * 0.114) / 255;
    const out = ctx.createImageData(C, C); const d = out.data; const k = strength || 2.5;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const l = lum[y * C + ((x + C - 1) % C)], r = lum[y * C + ((x + 1) % C)], u = lum[((y + C - 1) % C) * C + x], dn = lum[((y + 1) % C) * C + x];
      let nx = -(r - l) * k, ny = -(dn - u) * k, nz = 1; const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz); nx *= inv; ny *= inv; nz *= inv;
      const o = (y * C + x) * 4; d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anisotropy || 4; t.needsUpdate = true; return t;
  }

  // load the manifest and build everything; resolves to TEX whatever happens (check .ready)
  TEX.load = function (renderer, url, onProgress) {
    if (TEX.loading) return TEX.loading;
    TEX.loading = (async () => {
      try {
        const man = await (await fetch(url || 'data/tex/atlas.json')).json();
        TEX.manifest = man; TEX.ui = man.ui || {};
        const webgl2 = !!(renderer && renderer.capabilities && renderer.capabilities.isWebGL2);
        if (!webgl2) { TEX.unsupported = true; return TEX; }
        const aniso = Math.min(window.GENESIS_ANISO || 8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);      // (main.js says how fine: all the card can do, unless it is a software renderer)
        // phones and small GPUs get 256px cells (a quarter of the memory); desktops the full 512
        const half = (renderer.capabilities.maxTextureSize || 4096) < 8192 || (window.matchMedia && matchMedia('(pointer: coarse)').matches) || !!TEX.forceHalf;
        TEX.half = half;
        const names = Object.keys(man.atlases || {}); let done = 0;
        const imgs = await Promise.all(names.map((nm) => loadImg(man.atlases[nm].url).then((im) => { done++; if (onProgress) onProgress(done / names.length, nm); return im; })));
        const cell = man.cell || 512, n = man.n || 4;
        for (let k = 0; k < names.length; k++) {
          const nm = names[k], img = imgs[k], A = man.atlases[nm]; if (!img) continue;
          TEX.layers[nm] = A.layers;
          if (nm === 'misc') {
            const id = (s) => A.layers.findIndex((L) => L.id === s);
            if (id('ocean') >= 0) { TEX.misc.ocean = cellTexture(img, cell, n, id('ocean'), aniso); TEX.misc.oceanN = normalFromCell(img, cell, n, id('ocean'), 3.0, aniso); }
            if (id('shallows') >= 0) TEX.misc.shallows = cellTexture(img, cell, n, id('shallows'), aniso);
            if (id('clouds') >= 0) TEX.misc.clouds = cellTexture(img, cell, n, id('clouds'), aniso);
            continue;
          }
          const arr = toArray(img, cell, n, aniso, half);
          TEX.arrays[nm] = arr.tex; TEX.mean[nm] = arr.mean;
          const sc = new Float32Array(16); for (let i = 0; i < 16; i++) sc[i] = (A.layers[i] && A.layers[i].m) || 3; TEX.scale[nm] = sc;
        }
        // (the ground's materials, where the manifest names them: a software renderer takes them at half size)
        if (man.ground && TEX.groundOn !== false) { try { const mi = names.indexOf('misc'), sh = mi >= 0 && imgs[mi] ? man.atlases.misc.layers.findIndex((L) => L.id === 'shallows') : -1; let cvS = null;
          if (sh >= 0) { const im = imgs[mi], C = Math.round(cell * im.width / (n * cell)); cvS = document.createElement('canvas'); cvS.width = cvS.height = C; cvS.getContext('2d').drawImage(im, (sh % n) * C, Math.floor(sh / n) * C, C, C, 0, 0, C, C); }
          TEX.ground = await loadGround(man.ground, aniso, TEX.groundShrink || (half ? 2 : 1), cvS); } catch (e) { console.warn('ground materials unavailable', e); TEX.ground = null; } }
        TEX.ready = !!(TEX.arrays.wall && TEX.arrays.roof);
        if (!TEX.ready) TEX.failed = true;
      } catch (e) { console.warn('textures unavailable', e); TEX.failed = true; }
      return TEX;
    })();
    return TEX.loading;
  };
  // handy for the UI: url of a piece of art or ''
  TEX.art = (key) => (TEX.ui && TEX.ui[key]) || '';
  window.TEX = TEX;
})();
