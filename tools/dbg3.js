const { chromium } = require("playwright"); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve('dist'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data); }); });
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  await page.addInitScript(() => { window.GENESIS_TEX_URL = 'data/tex/atlas_local.json'; });   // the CDN atlases are unreachable from the test box: use the labelled synthetic set
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_TUNNEL/.test(m.text())) logs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/local.html`, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  const tc = fs.readFileSync('tools/testcam.js', 'utf8'); const script = process.argv[2]; const probe = process.argv[3]; const wait = +(process.argv[4] || 8000);
  const r = await page.evaluate(tc + `; (() => { let scriptErr = null; try { ${script} } catch (e) { scriptErr = String(e && e.stack || e); }
    return new Promise(res => setTimeout(() => { try { const o = (() => { ${probe} })(); if (scriptErr) o.scriptErr = scriptErr; res(o); } catch (e) { res({ err: String(e), scriptErr }); } }, ${wait})); })()`);
  console.log(JSON.stringify(r)); console.log(logs.slice(0, 5).join('\n'));
  await browser.close(); server.close();
});
