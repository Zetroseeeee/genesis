// GENESIS textures: the generated material atlases (walls, roofs, ground, land use, water) as WebGL2 texture arrays,
// plus the UI art. Classic script; exposes window.TEX.
//
// Each atlas is a 2048x2048 WebP of 4x4 tileable 512px cells. In the browser the cells are split into a
// DataTexture2DArray so each material repeats and mipmaps cleanly (no atlas bleeding). Without WebGL2 (or if the
// atlases fail to load) nothing is set up and the shaders keep their procedural look.
(function () {
  const TEX = { ready: false, unsupported: false, failed: false, ui: {}, arrays: {}, scale: {}, mean: {}, layers: {}, misc: {}, manifest: null, loading: null };

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
