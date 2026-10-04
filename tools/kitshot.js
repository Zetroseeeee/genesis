// kit viewer screenshot: node kitshot.js <name> "<query>"
const { chromium } = require("playwright"); const http = require('http'); const fs = require('fs'); const path = require('path');
const name = process.argv[2], query = process.argv[3] || '';
const root = path.resolve('dist'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data); }); });
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 1400), height: +(process.env.H || 900) } });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message)); page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/${process.env.PAGE || 'kitview.html'}?${query}`, { waitUntil: 'load' }); await page.waitForFunction(() => window.__ready, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(500); await page.screenshot({ path: `shots/${name}.png`, timeout: 120000 });
  console.log(logs.slice(0, 5).join('\n')); await browser.close(); server.close();
});
