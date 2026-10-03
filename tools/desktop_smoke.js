// Launch the desktop shell (Electron) and check the game boots inside it: node tools/desktop_smoke.js
// Needs a display; on a headless box run it under xvfb-run. Software GL, so allow it a minute.
const { _electron } = require('playwright');
(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: ['.', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], env: Object.assign({}, process.env, { ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }) });
  const win = await app.firstWindow(); const logs = [];
  win.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message)); win.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  await win.waitForFunction(() => window.__G && window.__G.sim, null, { timeout: 120000 });
  await win.waitForTimeout(8000);
  const info = await win.evaluate(() => ({ url: location.href, intro: !document.getElementById('intro').hidden, models: window.MODELS ? Object.keys(MODELS.defs).length : -1, tex: !!(window.TEX && TEX.manifest), webgl2: !!document.querySelector('canvas').getContext('webgl2'), storage: (() => { try { localStorage.setItem('_t', '1'); return localStorage.getItem('_t') === '1'; } catch (e) { return false; } })() }));
  await win.screenshot({ path: 'shots/desktop_smoke.png' });
  console.log(JSON.stringify(info)); console.log(logs.slice(0, 8).join('\n'));
  await app.close();
  process.exit(info.models >= 0 && info.storage ? 0 : 1);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
