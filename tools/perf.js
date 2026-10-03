// measure CPU cost of the settlement rebuild near a big city
const { chromium } = require("playwright"); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve('dist'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data); }); });
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_TUNNEL/.test(m.text())) logs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/local.html`, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  const tc = fs.readFileSync('tools/testcam.js', 'utf8');
  const r = await page.evaluate(tc + `; (() => { __G.settings.qualityPinned = true; __G.start(-74.0, 40.7, 'Lenape'); __G.run(60); __T.era(0.95, 2000, 0, 1|2|4|8|16|(8<<5)); const [lon, lat] = __T.capital(); __T.cam(lon + 0.01, lat - 0.01, 0.0004, 1.0, 2.4);
    return new Promise(res => setTimeout(() => { const W = __G.world; const M = __G.mapcam; const out = {};
      let t0 = performance.now(); W.updateBuildings(M, true); out.firstMs = performance.now() - t0; out.count = W.buildingCount;
      t0 = performance.now(); W.updateBuildings(M, true); out.rebuildMs = performance.now() - t0;
      t0 = performance.now(); for (let k = 0; k < 5; k++) W.updateBuildings(M, true); out.rebuild5Ms = performance.now() - t0;
      out.cache = TOWN.cacheSize(); out.stats = __G.terrain.stats.packsE; res(out); }, 3000)); })()`);
  console.log(JSON.stringify(r)); console.log(logs.slice(0, 5).join('\n'));
  await browser.close(); server.close();
});
