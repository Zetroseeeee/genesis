// House types as the game draws them (houses.js, with the generated materials): a sheet of the types a town of a style is built
// from, each from the front and a little to the right, 25 degrees up.
//   node tools/houses/sheet.cjs <style[:ctx[:lod]]> ...   ->  shots/houses/<style>_<ctx>.png      (npm run build first)
//   ctx: urban, rural or rich (default rural); lod 0, 1 or 2 (default 0). Region timelines: <region>@<era>[.<f>] (e.g. brit@5.9)
// Look here before believing a style: a sheet shows a dozen houses of it in a few seconds, where the game needs minutes.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..'), DIST = path.join(ROOT, 'dist'), OUT = path.join(ROOT, 'shots', 'houses');
const args = process.argv.slice(2); if (!args.length) { console.log('usage: node tools/houses/sheet.cjs <style[:ctx[:lod]]> ...'); process.exit(1); }
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.normalize(path.join(DIST, decodeURIComponent(req.url.split('?')[0])));
  if (!p.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, b) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
const COLS = 4, ROWS = 3, CW = 420, CH = 340;
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#cfd3d6;font:600 13px system-ui}#w{position:relative;width:${COLS * CW}px;height:${ROWS * CH + 26}px}
#w canvas{position:absolute;left:0;top:26px}.l{position:absolute;color:#222;font-weight:500;font-size:11px}#t{position:absolute;left:8px;top:5px}</style>
<script src="three.min.js"></script><script src="textures.js"></script><script src="vern.js"></script><script src="houses.js"></script></head><body><div id="w"><span id="t"></span></div></body></html>`;

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}/`;
  fs.writeFileSync(path.join(DIST, '_houses.html'), PAGE);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: COLS * CW, height: ROWS * CH + 26 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('  page: ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('  page error: ' + e.message));
  await page.goto(base + '_houses.html');
  fs.mkdirSync(OUT, { recursive: true });
  const tex = fs.existsSync(path.join(ROOT, 'data/tex/atlas.offline.json')) ? 'data/tex/atlas.offline.json' : 'data/tex/atlas.json';
  for (const a of args) {
    const [spec, ctx0, lod0] = a.split(':'); const ctx = ctx0 || 'rural', lod = +(lod0 || 0);
    const r = await page.evaluate(async ({ spec, ctx, lod, tex, COLS, ROWS, CW, CH }) => {
      const T = window.THREE; document.querySelectorAll('#w canvas, #w .l').forEach((c) => c.remove());
      const ren = window._ren || (window._ren = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })); ren.setSize(COLS * CW, ROWS * CH); ren.setClearColor(0xcfd3d6); ren.outputEncoding = T.LinearEncoding;
      document.getElementById('w').appendChild(ren.domElement);
      if (!window._tex) { TEX.groundOn = false; window._tex = await TEX.load(ren, tex); }
      // which style: a key, or a region at an age (and how far into it)
      let style = spec, st = null;
      if (spec.includes('@')) { const [reg, ef] = spec.split('@'); const era = Math.floor(+ef), f = +ef - era; st = { region: reg, tl: VERN.T[reg], fam: VERN.FAM[reg], sub: 0, mount: 0, snow: 0, wet: 0, hot: 0, dry: 0, wood: -1 }; style = VERN.styleAt(st, era, f, st.fam, 0.3); }
      document.getElementById('t').textContent = spec + (style !== spec ? ' = ' + style : '') + ' (' + ctx + ', level ' + lod + ')';
      const types = VERN.types(style, ctx, st, COLS * ROWS);
      const mat = new T.ShaderMaterial({ vertexShader: HOUSES.VERT, fragmentShader: HOUSES.FRAG, defines: TEX.ready ? { USE_TEXARR: 1 } : {},
        uniforms: { uSunV: { value: new T.Vector3(0.55, 0.62, 0.55).normalize() }, uUpV: { value: new T.Vector3(0, 1, 0) }, uSunCol: { value: new T.Vector3(1.0, 0.96, 0.9) }, uGround: { value: new T.Vector3(0.42, 0.4, 0.3) },
          uDay: { value: 1 }, uCamAlt: { value: 100 }, uTime: { value: 0 }, uRiseT: { value: 8 }, uSnow: { value: 0 }, uDusk: { value: 0 }, uGlow: { value: 0 }, uTexMix: { value: TEX.ready ? 1 : 0 }, uMetres: { value: 1 },
          uWallTex: { value: TEX.arrays.wall }, uRoofTex: { value: TEX.arrays.roof }, uWallM: { value: Array.from(TEX.scale.wall || new Float32Array(16).fill(3)) }, uRoofM: { value: Array.from(TEX.scale.roof || new Float32Array(16).fill(3)) },
          uWallMean: { value: Array.from({ length: 16 }, (_, i) => new T.Vector3(...(TEX.mean.wall ? [TEX.mean.wall[i * 3], TEX.mean.wall[i * 3 + 1], TEX.mean.wall[i * 3 + 2]] : [0.5, 0.5, 0.5]))) },
          uRoofMean: { value: Array.from({ length: 16 }, (_, i) => new T.Vector3(...(TEX.mean.roof ? [TEX.mean.roof[i * 3], TEX.mean.roof[i * 3 + 1], TEX.mean.roof[i * 3 + 2]] : [0.5, 0.5, 0.5]))) } } });
      ren.setScissorTest(true); ren.clear(); const info = [];
      types.forEach((g, k) => {
        const scene = new T.Scene(); const geo = HOUSES.geometry(g, lod).clone();
        const m = new T.InstancedMesh(geo, mat, 1); m.setMatrixAt(0, new T.Matrix4()); const c = VERN.colours(g, 1234 + k * 77);
        m.instanceColor = new T.InstancedBufferAttribute(new Float32Array([(c[0] >> 16 & 255) / 255, (c[0] >> 8 & 255) / 255, (c[0] & 255) / 255]), 3);
        geo.setAttribute('aInfo', new T.InstancedBufferAttribute(new Float32Array([7, 0.37 + k * 0.11, 0, 1]), 4)); geo.setAttribute('aPal', new T.InstancedBufferAttribute(new Float32Array([c[1], c[2], c[3], c[4]]), 4)); geo.setAttribute('aRise', new T.InstancedBufferAttribute(new Float32Array([-1e9, 1e9, window.__prog !== undefined ? window.__prog : 1, VERN.heightOf(g)]), 4));
        scene.add(m);
        const gr = new T.Mesh(new T.PlaneGeometry(80, 80), new T.MeshBasicMaterial({ color: 0x8f9a72 })); gr.rotation.x = -Math.PI / 2; gr.position.y = -0.02; scene.add(gr);
        const box = geo.boundingBox; const size = new T.Vector3(); box.getSize(size); const cc = new T.Vector3(); box.getCenter(cc); const rad = Math.max(4, size.length() / 2);
        const cam = new T.PerspectiveCamera(34, CW / CH, 0.5, 400); const el = 24 * Math.PI / 180, az = 0.62, dist = rad / Math.sin(17 * Math.PI / 180);
        cam.position.set(cc.x + Math.sin(az) * Math.cos(el) * dist, cc.y + Math.sin(el) * dist, cc.z + Math.cos(az) * Math.cos(el) * dist); cam.lookAt(cc);
        const x = (k % COLS) * CW, y = (ROWS - 1 - Math.floor(k / COLS)) * CH; ren.setViewport(x, y, CW, CH); ren.setScissor(x, y, CW, CH); ren.render(scene, cam);
        const lab = document.createElement('span'); lab.className = 'l'; lab.style.left = (x + 6) + 'px'; lab.style.top = (26 + Math.floor(k / COLS) * CH + 4) + 'px';
        lab.textContent = `${g.plan} ${g.fl}fl ${g.roof} ${g.pitch | 0}deg ${g.wall}/${g.roofm} ${g.w}x${g.d} ${geo.userData.tris}t`; document.getElementById('w').appendChild(lab);
        info.push(geo.userData.tris);
      });
      return { style, tris: info };
    }, { spec, ctx, lod, tex, COLS, ROWS, CW, CH });
    const out = path.join(OUT, `${spec.replace(/[@.]/g, '_')}_${ctx}${lod ? '_l' + lod : ''}.png`); await page.locator('#w').screenshot({ path: out });
    console.log(`${out}  ${r.style}: ${r.tris.join(' ')} triangles`);
  }
  await browser.close(); server.close(); fs.rmSync(path.join(DIST, '_houses.html'), { force: true });
})().catch((e) => { console.error(e); process.exit(1); });
