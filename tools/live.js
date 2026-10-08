// A page that stays up, to look at the game again and again without starting it each time (models take minutes to arrive under
// software GL): node tools/live.js "<setup script>" [wait ms]     (run it with nohup ... &; it listens on 127.0.0.1:8791)
//   curl -s localhost:8791/eval --data-binary '<js>'           run a script in the page, answer with what it returns (JSON)
//   curl -s 'localhost:8791/shot?name=look1&pause=3000'        wait, then save shots/look1.png
//   curl -s 'localhost:8791/load?file=post.js'                 read src/<file> again and run it in the page (a classic script that sets
//                                                              its global afresh); then /eval whatever makes the game take it up
//   curl -s localhost:8791/logs                                page errors so far
//   curl -s localhost:8791/quit
// The same switches as tools/shotn.js: TEX, SHADOW, TREES, LOD, GRID, POST, AIR, GROUND, W, H, RES, DIST. Never beside another browser harness.
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const script = process.argv[2] || '', t1 = +(process.argv[3] || 8000);
const root = path.resolve(process.env.DIST || 'dist'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data); }); });
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 800) } });
  await page.addInitScript(([u, sh, tr, lod, px, grid, post, air, gnd, sky]) => { if (gnd) window.GENESIS_GROUND = gnd; if (sky) window.GENESIS_SKY = 1; window.GENESIS_TEX_URL = u; if (sh) window.GENESIS_SHADOW = sh; if (tr) window.GENESIS_TREES = tr; if (lod) window.GENESIS_LOD = lod; if (grid) window.GENESIS_GRID = 1; window.GENESIS_PIXELS = px; if (post) window.GENESIS_POST = post; if (air) window.GENESIS_AIR = air; }, [process.env.TEX || 'data/tex/atlas_local.json', +(process.env.SHADOW || 0), +(process.env.TREES || 0), +(process.env.LOD || 0), +(process.env.RES || 1), +(process.env.GRID || 0), process.env.POST ? (process.env.POST === '1' ? 1 : JSON.parse(process.env.POST)) : 0, +(process.env.AIR || 0), +(process.env.GROUND || 0), +(process.env.SKY || 0)]);
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message)); page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/fonts|ERR_TUNNEL/.test(m.text())) logs.push(m.type() + ': ' + m.text().slice(0, 1500)); });
  await page.goto(`http://127.0.0.1:${port}/local.html`, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  try { await page.evaluate(fs.readFileSync('tools/testcam.js', 'utf8')); } catch (e) { logs.push('TESTCAM ' + e.message); }
  if (script) { try { await page.evaluate(script); } catch (e) { logs.push('EVALERR ' + e.message); } }
  await page.waitForTimeout(t1);
  const body = (req) => new Promise((ok) => { let s = ''; req.on('data', (d) => { s += d; }); req.on('end', () => ok(s)); });
  let busy = Promise.resolve();
  const ctl = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); const done = (code, text) => { res.writeHead(code, { 'Content-Type': 'text/plain' }); res.end(text + '\n'); };
    busy = busy.then(async () => {
      try {
        if (u.pathname === '/eval') { const js = await body(req); const r = await page.evaluate(js); done(200, JSON.stringify(r === undefined ? null : r)); }
        else if (u.pathname === '/shot') { const name = u.searchParams.get('name') || 'live'; await page.waitForTimeout(+(u.searchParams.get('pause') || 3000)); const clip = u.searchParams.get('clip') ? (([x, y, width, height]) => ({ x, y, width, height }))(u.searchParams.get('clip').split(',').map(Number)) : undefined; await page.screenshot({ path: `shots/${name}.png`, timeout: 600000, clip }); done(200, `shots/${name}.png`); }
        else if (u.pathname === '/load') { const f = u.searchParams.get('file'); await page.evaluate(fs.readFileSync(path.join('src', f), 'utf8')); done(200, 'loaded ' + f); }
        else if (u.pathname === '/logs') done(200, logs.slice(-12).join('\n') || 'no errors');
        else if (u.pathname === '/quit') { done(200, 'bye'); setTimeout(() => process.exit(0), 4000); await browser.close(); server.close(); ctl.close(); process.exit(0); }      // (a browser that will not close is left behind after four seconds)
        else done(404, 'eval, shot, load, logs or quit');
      } catch (e) { done(500, 'ERR ' + (e.message || e).toString().slice(0, 1500)); }
    });
  });
  ctl.listen(8791, '127.0.0.1', () => console.log('live on 8791'));
});
