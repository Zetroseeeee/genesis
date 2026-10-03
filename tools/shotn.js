// Several screenshots in one browser session: node tools/shotn.js <name> <setup script> <wait ms> <label=script> [<label=script> ...]
// After the setup script and the wait, each step's script runs, 'pause' ms pass (env PAUSE, default 4000), and shots/<name>_<label>.png is saved.
// TEX=<manifest> picks the texture set (default: the labelled synthetic one); W/H set the viewport; CLIP=x,y,w,h crops;
// SHADOW=4096 gives the shadow map its full size (software GL gets a quarter by default); DIST=<dir> serves another build.
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const name = process.argv[2], script = process.argv[3] || '', t1 = +(process.argv[4] || 8000); const steps = process.argv.slice(5).map((s) => { const k = s.indexOf('='); return [s.slice(0, k), s.slice(k + 1)]; });
const root = path.resolve(process.env.DIST || 'dist'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data); }); });
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 800) } });
  await page.addInitScript(([u, sh]) => { window.GENESIS_TEX_URL = u; if (sh) window.GENESIS_SHADOW = sh; }, [process.env.TEX || 'data/tex/atlas_local.json', +(process.env.SHADOW || 0)]);      // SHADOW=4096: the shadow map a real GPU gets
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_TUNNEL/.test(m.text())) logs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/local.html`, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  try { await page.evaluate(fs.readFileSync('tools/testcam.js', 'utf8')); } catch (e) { logs.push('TESTCAM ' + e.message); }
  if (script) { try { await page.evaluate(script); } catch (e) { logs.push('EVALERR ' + e.message); } }
  await page.waitForTimeout(t1);
  const clip = process.env.CLIP ? (([x, y, width, height]) => ({ x, y, width, height }))(process.env.CLIP.split(',').map(Number)) : undefined;
  for (const [label, js] of steps) {
    let r; try { r = await page.evaluate(js); } catch (e) { logs.push(`EVALERR ${label} ` + e.message); }
    await page.waitForTimeout(+(process.env.PAUSE || 4000)); await page.screenshot({ path: `shots/${name}_${label}.png`, timeout: 240000, clip });
    if (r !== undefined) console.log(label, JSON.stringify(r));
  }
  console.log(logs.slice(0, 6).join('\n'));
  await browser.close(); server.close();
});
