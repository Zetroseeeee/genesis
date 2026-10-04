// two-frame screenshot: <name> <script> <t1 ms> <t2 ms>
const { chromium } = require("playwright"); const http = require('http'); const fs = require('fs'); const path = require('path');
const name = process.argv[2], script = process.argv[3] || '', t1 = +(process.argv[4] || 8000), t2 = +(process.argv[5] || 6000);
const root = path.resolve('dist'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data); }); });
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 800) } });
  await page.addInitScript((u) => { window.GENESIS_TEX_URL = u; }, process.env.TEX || 'data/tex/atlas_local.json');   // the CDN atlases are unreachable from the test box: use the labelled synthetic set
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_TUNNEL/.test(m.text())) logs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/local.html`, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  await page.evaluate(() => { if (window.__G) __G.settings.qualityPinned = true; }); // keep movers and trees on under software GL
  try { await page.evaluate(fs.readFileSync('tools/testcam.js', 'utf8')); } catch (e) { logs.push('TESTCAM ' + e.message); }
  if (script) { try { await page.evaluate(script); } catch (e) { logs.push('EVALERR ' + e.message); } }
  await page.waitForTimeout(t1); await page.screenshot({ path: `shots/${name}_a.png`, timeout: 240000 });
  const script2 = process.argv[6] || ''; if (script2) { try { await page.evaluate(script2); } catch (e) { logs.push('EVALERR2 ' + e.message); } }
  await page.waitForTimeout(t2); await page.screenshot({ path: `shots/${name}_b.png`, timeout: 240000 });
  const info = await page.evaluate(() => ({ year: __G.sim.year, active: document.getElementById('turn').className, report: !document.getElementById('report').hidden, t1: document.getElementById('turn1').textContent, adv: document.getElementById('advisor-text').textContent, movers: __G.movers ? __G.movers.stats : null, buildings: __G.world.buildingCount }));
  console.log(logs.slice(0, 5).join('\n')); console.log(JSON.stringify(info));
  await browser.close(); server.close();
});
