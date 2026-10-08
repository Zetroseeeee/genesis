// Which call to the card fails? node tools/glerr.js "<script run in the page>" [wait ms]
// A page of the built game (dist/) in which every call that can raise an error is asked at once whether it did: prints what was
// called, with what, the picture last handed to the card and where the call came from. WebGL keeps its errors to itself until
// somebody asks (the end-to-end suite asks once, long after): this says which call it was.
// (How "GL error 1281, 1282" in the suite was found: a pack of the picture let go while a tile still drew from it.)
const { chromium } = require("playwright"); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve('dist'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data); }); });
server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  await page.addInitScript(() => {
    window.GENESIS_TEX_URL = 'data/tex/atlas_local.json'; window.__glerr = [];
    const P = WebGL2RenderingContext.prototype, ge = P.getError;
    const sum = (a) => Array.from(a).map((x) => x == null ? 'null' : typeof x === 'number' ? x : (x.constructor && x.constructor.name) + (x.width ? ' ' + x.width + 'x' + x.height : x.length ? ' n' + x.length : '')).join(', ');
    for (const fn of ['generateMipmap', 'texImage2D', 'texImage3D', 'texSubImage2D', 'texSubImage3D', 'texStorage2D', 'texStorage3D', 'texParameterf', 'texParameteri', 'pixelStorei', 'readPixels', 'framebufferTexture2D', 'compressedTexImage2D', 'bindTexture', 'activeTexture', 'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'useProgram', 'uniform1i', 'bindFramebuffer', 'blitFramebuffer', 'renderbufferStorageMultisample', 'viewport', 'clear']) {
      const o = P[fn]; if (!o) continue; let last = null;
      P[fn] = function () { const r = o.apply(this, arguments); const heavy = fn.startsWith('draw') || fn === 'bindTexture' || fn === 'activeTexture' || fn === 'useProgram' || fn === 'uniform1i' || fn === 'viewport' || fn === 'clear';
        if (fn === 'texImage2D' || fn === 'texImage3D' || fn === 'texStorage2D') this.__lastUp = fn + '(' + sum(arguments) + ')';
        if (!heavy || window.__glerrAll) { const e = ge.call(this); if (e) window.__glerr.push({ fn, e, args: sum(arguments), lastUp: this.__lastUp, stack: (new Error().stack || '').split('\n').slice(2, 7).map((s) => s.trim().replace(/http:\/\/127.0.0.1:\d+\//, '')).join(' | ') }); }
        return r; };
    }
  });
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_TUNNEL/.test(m.text())) logs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/local.html`, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  const tc = fs.readFileSync('tools/testcam.js', 'utf8'); const script = process.argv[2] || ''; const wait = +(process.argv[3] || 60000);
  const r = await page.evaluate(tc + `; (() => { let scriptErr = null; try { ${script} } catch (e) { scriptErr = String(e && e.stack || e); }
    return new Promise(res => setTimeout(() => res({ errs: window.__glerr.slice(0, 12), n: window.__glerr.length, scriptErr }), ${wait})); })()`);
  console.log(JSON.stringify(r, null, 1)); console.log(logs.slice(0, 5).join('\n'));
  await browser.close(); server.close();
});
