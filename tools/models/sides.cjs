// A model from its four sides, as the game has it after the pipeline: its front (+Z, the side a plan turns toward its street or
// square), its right (+X), its back and its left, each from 25 degrees up.
//   node tools/models/sides.cjs <id> [<id> ...]   ->  shots/models/<id>.png      (npm run build and the model's files fetched first)
// Look at it before believing a model's yaw: a generated mesh comes out facing whichever way the generator read its photograph.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..'), DIST = path.join(ROOT, 'dist'), OUT = path.join(ROOT, 'shots', 'models');
const ids = process.argv.slice(2); if (!ids.length) { console.log('usage: node tools/models/sides.cjs <id> [<id> ...]'); process.exit(1); }
const TYPES = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const p = path.normalize(path.join(DIST, decodeURIComponent(req.url.split('?')[0])));
  if (!p.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, b) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#d8d8d4;font:600 15px system-ui}#w{position:relative;width:1024px;height:1048px}
#w canvas{position:absolute;left:0;top:24px}.l{position:absolute;color:#333}#t{position:absolute;left:8px;top:3px}</style>
<script src="three.min.js"></script><script src="GLTFLoader.js"></script><script src="meshopt_decoder.js"></script></head><body><div id="w"><span id="t"></span>
<span class="l" style="left:8px;top:30px">front (+z)</span><span class="l" style="left:520px;top:30px">right (+x)</span><span class="l" style="left:8px;top:542px">back (-z)</span><span class="l" style="left:520px;top:542px">left (-x)</span></div></body></html>`;

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}/`;
  fs.writeFileSync(path.join(DIST, '_sides.html'), PAGE);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 1048 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('  page: ' + m.text().slice(0, 200)); });
  await page.goto(base + '_sides.html');
  fs.mkdirSync(OUT, { recursive: true });
  for (const id of ids) {
    const lod = fs.existsSync(path.join(ROOT, 'data/models', id + '.l1.glb')) ? 'l1' : 'l0';
    const r = await page.evaluate(async ({ id, lod }) => {
      const T = window.THREE; document.querySelectorAll('#w canvas').forEach((c) => c.remove());
      const ren = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); ren.setSize(1024, 1024); ren.setClearColor(0xd8d8d4); ren.outputEncoding = T.sRGBEncoding;
      document.getElementById('w').appendChild(ren.domElement); document.getElementById('t').textContent = id;
      const scene = new T.Scene(); scene.add(new T.HemisphereLight(0xffffff, 0x8a8478, 0.9)); const sun = new T.DirectionalLight(0xffffff, 0.8); sun.position.set(0.4, 1, 0.6); scene.add(sun);
      const loader = new T.GLTFLoader(); if (window.MeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);
      const g = await new Promise((res, rej) => loader.load(`data/models/${id}.${lod}.glb`, res, undefined, rej)); scene.add(g.scene);
      const box = new T.Box3().setFromObject(g.scene), size = box.getSize(new T.Vector3()), c = box.getCenter(new T.Vector3()), rad = size.length() / 2;
      // the ground line and a mark at its front
      const ground = new T.Mesh(new T.PlaneGeometry(rad * 3, rad * 3), new T.MeshBasicMaterial({ color: 0xc4c2bb })); ground.rotation.x = -Math.PI / 2; ground.position.y = box.min.y - 0.01; scene.add(ground);
      const mark = new T.Mesh(new T.BoxGeometry(rad * 0.08, rad * 0.01, rad * 0.4), new T.MeshBasicMaterial({ color: 0xc03020 })); mark.position.set(c.x, box.min.y, box.max.z + rad * 0.3); scene.add(mark);
      const cam = new T.PerspectiveCamera(30, 1, rad * 0.05, rad * 20); const el = 25 * Math.PI / 180, dist = rad / Math.sin(15 * Math.PI / 180);
      ren.setScissorTest(true);
      [[0, 0], [Math.PI / 2, 1], [Math.PI, 2], [-Math.PI / 2, 3]].forEach(([az, k]) => {
        cam.position.set(c.x + Math.sin(az) * Math.cos(el) * dist, c.y + Math.sin(el) * dist, c.z + Math.cos(az) * Math.cos(el) * dist); cam.lookAt(c);
        const x = (k % 2) * 512, y = k < 2 ? 512 : 0; ren.setViewport(x, y, 512, 512); ren.setScissor(x, y, 512, 512); ren.render(scene, cam);
      });
      return { w: +size.x.toFixed(1), h: +size.y.toFixed(1), d: +size.z.toFixed(1) };
    }, { id, lod });
    const out = path.join(OUT, id + '.png'); await page.locator('#w').screenshot({ path: out });
    console.log(`${out}  ${r.w} x ${r.h} x ${r.d} m (${lod})`);
  }
  await browser.close(); server.close(); fs.rmSync(path.join(DIST, '_sides.html'), { force: true });
})().catch((e) => { console.error(e); process.exit(1); });
