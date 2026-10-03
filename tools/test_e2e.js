// GENESIS browser end-to-end suite. One Chromium (SwiftShader) session; every scenario runs in the same page unless it
// needs a fresh load. Collects page errors, console errors, WebGL shader errors, and assertion failures.
//   node test_e2e.js [filter]        screenshots on failure go to shots/e2e_*.png, report to shots/test_e2e.log
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve('dist'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data); }); });
const filter = process.argv[2] || '';
const results = []; let page, browser, port; const errors = []; const t0 = Date.now();
const log = (...a) => { const line = `[${((Date.now() - t0) / 1000).toFixed(0)}s] ` + a.join(' '); console.log(line); fs.appendFileSync('shots/test_e2e.log', line + '\n'); };
const TC = fs.readFileSync('tools/testcam.js', 'utf8');

async function fresh(viewport) {
  if (page) await page.close();
  page = await browser.newPage({ viewport: viewport || { width: 1024, height: 640 } });
  await page.addInitScript(() => { window.GENESIS_TEX_URL = 'data/tex/atlas_local.json'; });   // the CDN atlases are unreachable from the test box: use the labelled synthetic set
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_TUNNEL|googleapis/.test(m.text())) errors.push('CONSOLE ' + m.text().slice(0, 300)); else if (/THREE.WebGLProgram|Shader Error|GL_INVALID/.test(m.text())) errors.push('GL ' + m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${port}/local.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__G && window.__G.sim && document.getElementById('loading').hidden, null, { timeout: 60000 });
  await page.evaluate(TC); await installToastLog();
}
const installToastLog = () => page.evaluate(() => { window.__toasts = []; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }).observe(document.getElementById('tc'), { childList: true }); });
const ev = (fn, arg) => page.evaluate(fn, arg);
async function scenario(name, fn) {
  if (filter && !filter.split('|').some(f => name.includes(f))) return;
  if (!page && /^intro/.test(name)) await fresh();
  if (!/^(boot|intro)/.test(name)) { // scenarios after the intro expect a running game; when filtered, start one
    if (!page) await fresh();
    if ((await ev(() => document.body.dataset.mode)) !== 'play') { await ev(() => __G.start(31.25, 29.9, 'Kemet')); await wait(300); await frames(3); }
  }
  if (page) await ev(() => { if (window.__toasts) window.__toasts.length = 0; });
  const before = errors.length; const t = Date.now(); const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  try { await fn(check); } catch (e) { fails.push('threw: ' + (e.message || e).toString().slice(0, 400)); }
  const newErr = errors.slice(before); errors.length = before;
  const ok = !fails.length && !newErr.length; results.push({ name, ok, fails, newErr, ms: Date.now() - t });
  log(`${ok ? 'PASS' : 'FAIL'} ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)` + (ok ? '' : '\n   ' + [...fails, ...newErr].join('\n   ')));
  if (!ok) { try { await page.screenshot({ path: `shots/e2e_${name.replace(/[^a-z0-9]+/gi, '_')}.png`, timeout: 120000 }); } catch (e) {} }
}
const wait = (ms) => page.waitForTimeout(ms);
const frames = async (n) => { for (let k = 0; k < n; k++) await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r()))); };
const state = () => ev(() => ({ mode: document.body.dataset.mode, year: __G.sim.year, turn: document.getElementById('turn').className, t1: document.getElementById('turn1').textContent, report: !document.getElementById('report').hidden, left: document.getElementById('left').classList.contains('open'), dock: document.body.classList.contains('dockopen'), banner: document.getElementById('banner').hidden ? '' : document.getElementById('bannertext').textContent, toasts: [...new Set([...(window.__toasts || []), ...[...document.querySelectorAll('.toast')].map(t => t.textContent)])], player: __G.sim.player, dist: __G.mapcam.dist }));

fs.writeFileSync('shots/test_e2e.log', '');
server.listen(0, async () => {
  port = server.address().port;
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // ---------- boot & intro ----------
  await scenario('boot: page loads, intro visible, no errors', async (check) => {
    await fresh();
    const s = await ev(() => ({ intro: !document.getElementById('intro').hidden, loading: document.getElementById('loading').hidden, mode: document.body.dataset.mode, tiles: __G.terrain.stats.tiles, civs: __G.sim.st.civCount, three: !!window.THREE, scripts: ['GEO', 'TERRAIN', 'MAPCAM', 'WORLD', 'DECAL', 'TREES', 'LIFE', 'MOVERS', 'EVENTS', 'TOWN', 'BKIT'].filter(k => !window[k]) }));
    check(s.intro, 'intro card shown'); check(s.loading, 'loading screen hidden'); check(s.mode === 'intro', 'mode intro'); check(s.tiles > 0, 'tiles rendered'); check(s.scripts.length === 0, 'missing modules: ' + s.scripts.join(','));
    await frames(5);
  });
  await scenario('intro: choose homeland → click land → found card → found', async (check) => {
    await ev(() => document.getElementById('btn-choose').click()); await frames(3);
    let s = await state(); check(s.mode === 'choose', 'mode choose after Choose my homeland'); check(/Click the ground/.test(s.banner), 'banner asks to click the ground: ' + s.banner);
    // fly to Egypt and click the centre of the screen
    await ev(() => { __G.mapcam.flyTo(31.25, 29.9, 0.02, { duration: 0.1, tilt: 0.2 }); }); await wait(1500); await frames(5);
    const vp = page.viewportSize(); await page.mouse.click(vp.width / 2, vp.height / 2); await frames(3);
    s = await ev(() => ({ found: !document.getElementById('found').hidden, kv: document.getElementById('found-kv').textContent, title: document.getElementById('found-title').textContent }));
    check(s.found, 'found card appears on click'); check(/Elevation/.test(s.kv) && /Fertility/.test(s.kv), 'found card lists elevation and fertility');
    await ev(() => { document.getElementById('found-name').value = 'Kemet'; document.getElementById('found-ok').click(); }); await wait(2600); await frames(5);
    s = await state(); check(s.mode === 'play', 'mode play after founding'); check(s.player >= 0, 'player set');
    const nm = await ev(() => __G.sim.playerCiv().name); check(nm === 'Kemet', 'custom name used: ' + nm);
    check(s.left, 'inspector opened on the new village'); check(s.t1 === 'Advance', 'turn button says Advance: ' + s.t1);
    const cap = await ev(() => { const c = __G.sim.playerCiv(); return { lvl: __G.sim.level[c.capital], owner: __G.sim.owner[c.capital] === c.id, cells: __G.sim.cellsOf[c.id] }; }); check(cap.lvl >= 1 && cap.owner, 'capital is a village the player owns');
    check((await ev(() => __G.sim.st.civCount)) >= 10, 'other tribes seeded');
  });
  await scenario('intro: click on sea / on an owned cell is refused', async (check) => {
    await fresh(); await ev(() => document.getElementById('btn-choose').click()); await ev(() => { __G.mapcam.flyTo(-30, 30, 0.3, { duration: 0.1, tilt: 0 }); }); await wait(1200); await frames(4);
    const vp = page.viewportSize(); await page.mouse.click(vp.width / 2, vp.height / 2); await frames(2);
    const s = await state(); check(!(await ev(() => !document.getElementById('found').hidden)), 'no found card on the Atlantic'); check(s.toasts.some(t => /land to stand on/.test(t)), 'toast explains: ' + s.toasts.join('|'));
    await ev(() => document.getElementById('bannercancel').click()); await frames(2); check((await state()).mode === 'intro', 'cancel returns to intro');
  });
  await scenario('intro: random river start', async (check) => {
    await ev(() => document.getElementById('btn-random').click()); await wait(500); await page.waitForFunction(() => !__G.mapcam.fly, null, { timeout: 320000 }); await frames(5); // the flight is paced by frame dt (capped), so wait for it rather than the clock
    const s = await state(); check(s.mode === 'play' && s.player >= 0, 'random start enters play');
    const cap = await ev(() => { const c = __G.sim.playerCiv(); const i = c.capital; return { river: !!(__G.sim.flags[i] & 2), fert: __G.sim.fert[i] }; }); check(cap.fert > 0.3, 'random start on decent land (fert ' + cap.fert.toFixed(2) + ')');
    check(s.dist < 0.006, 'camera flew in to town height (dist ' + s.dist.toFixed(5) + ')');
  });

  // ---------- turns ----------
  await scenario('turn: Advance runs years, stops on target, shows report', async (check) => {
    const y0 = (await state()).year;
    await ev(() => document.getElementById('turn').click()); await frames(2);
    let s = await state(); check(/state-running/.test(s.turn), 'button in running state: ' + s.turn);
    await page.waitForFunction(() => !__G.turnRun.active, null, { timeout: 320000 });
    s = await state(); check(s.year - y0 === 200 || s.report, `200 years passed or an interrupt stopped it (${s.year - y0})`); check(s.report, 'report shown');
    const rep = await ev(() => ({ title: document.getElementById('report-title').textContent, body: document.getElementById('report-body').textContent.length, delta: document.getElementById('report-delta').textContent })); check(/→/.test(rep.title), 'report title has a range'); check(/people/.test(rep.delta), 'report delta lists people');
    await ev(() => document.getElementById('report-close').click()); check(!(await state()).report, 'report closes');
  });
  await scenario('turn: Enter key advances, click while running stops early', async (check) => {
    await ev(() => document.getElementById('report-close').click()); for (let k = 0; k < 6 && (await state()).t1 !== 'Advance'; k++) { await ev(() => document.getElementById('turn').click()); await wait(400); await frames(2); await ev(() => { const r = document.getElementById('report-close'); if (r) r.click(); }); } // acknowledge anything the first turn raised
    const y0 = (await state()).year; await page.keyboard.press('Enter'); await frames(2); check(/running/.test((await state()).turn), 'Enter starts a turn');
    await wait(600); await ev(() => document.getElementById('turn').click()); await frames(2); const s = await state(); check(!/running/.test(s.turn), 'click stops'); check(s.year > y0 && s.year - y0 < 200, `stopped early (${s.year - y0} yrs)`); check(/Stopped early/.test(await ev(() => document.getElementById('report-why').textContent)), 'report says stopped early');
    await page.keyboard.press('Escape');
  });
  await scenario('turn: war declared on you interrupts and the button turns red', async (check) => {
    await ev(() => document.getElementById('report-close').click());
    await ev(() => { document.getElementById('turn').click(); setTimeout(() => { const S = __G.sim; const p = S.playerCiv(); const e = S.civs.find(x => x && x !== p); p.wars[e.id] = S.year; e.wars[p.id] = S.year; p.warStart[e.id] = S.cellsOf[p.id]; e.warStart[p.id] = S.cellsOf[e.id]; }, 300); });
    await page.waitForFunction(() => !__G.turnRun.active, null, { timeout: 60000 }); await frames(2);
    const s = await state(); check(/state-war/.test(s.turn), 'red war state: ' + s.turn); check(s.t1 === 'War', 'label War');
    const why = await ev(() => document.getElementById('report-why').textContent); check(/War declared/.test(why), 'report reason: ' + why);
    await ev(() => document.getElementById('turn').click()); await wait(800); await frames(3);
    const s2 = await state(); check(!/state-war/.test(s2.turn), 'clicking the alert acknowledges it: ' + s2.turn); check(s2.left, 'enemy capital selected');
  });
  await scenario('turn: new era interrupt and green state', async (check) => {
    await ev(() => { const S = __G.sim; const c = S.playerCiv(); document.getElementById('turn').click(); setTimeout(() => { c.tech = 0.09; }, 300); });
    await page.waitForFunction(() => !__G.turnRun.active, null, { timeout: 60000 }); await frames(2);
    const s = await state(); check(/state-good/.test(s.turn) && s.t1 === 'New era', 'green New era state: ' + s.turn + ' ' + s.t1);
    await ev(() => document.getElementById('turn').click()); await frames(2); check((await state()).t1 === 'Advance', 'back to Advance after acknowledging');
    check((await ev(() => document.getElementById('id-era').textContent)).includes('BRONZE') || /Bronze/i.test(await ev(() => document.getElementById('id-era').textContent)), 'identity strip shows Bronze Age');
  });
  await scenario('turn: disaster on your land interrupts with an amber alert', async (check) => {
    const yStart = await ev(() => { document.getElementById('turn').click(); return __G.sim.year; });
    await page.waitForFunction((y) => __G.sim.year > y, yStart, { timeout: 60000 }); // a disaster counts once the turn's first year has run
    await ev(() => { const S = __G.sim; const c = S.playerCiv(); S.logEvent(c, 'An earthquake shakes the land in ' + S.fullName(c), true, 'disaster', c.capital); S.quakes.push({ i: c.capital, year: S.year, mag: 7.5 }); S.rubble.set(c.capital, S.year); });
    await page.waitForFunction(() => !__G.turnRun.active, null, { timeout: 60000 }); await frames(2);
    const s = await state(); check(/state-warn/.test(s.turn) && s.t1 === 'Disaster', 'amber Disaster state: ' + s.turn + ' ' + s.t1);
    await ev(() => document.getElementById('turn').click()); await wait(500); await frames(2); check((await state()).t1 !== 'Disaster', 'acknowledged');
    await ev(() => { __G.mapcam.fly = null; const [lon, lat] = __T.capital(); __T.cam(lon, lat, 0.003, 0.6, 0); __G.world.updateBuildings(__G.mapcam, true); }); await frames(3);
    const rb = await ev(() => { const S = __G.sim; const c = S.playerCiv(); const L = TOWN.layout(S, c.capital, c, 0); const kinds = {}; for (const it of L.items) kinds[it.kind] = (kinds[it.kind] || 0) + 1; return { inst: __G.world.inst.rubble.count, total: __G.world.buildingCount, kinds, age: S.rubble.has(c.capital) ? S.year - S.rubble.get(c.capital) : -1, level: S.level[c.capital], dist: __G.mapcam.dist, active: __G.turnRun.active, year: S.year }; });
    check(rb.inst > 0, 'rubble drawn in the struck capital: ' + JSON.stringify(rb));
  });
  await scenario('turn: continuous mode play/pause and speed keys', async (check) => {
    await ev(() => document.getElementById('opt-continuous').click()); await frames(2);
    let s = await state(); check(s.t1 === 'Play', 'button says Play in continuous mode: ' + s.t1); check(await ev(() => getComputedStyle(document.getElementById('clock')).display !== 'none'), 'speed controls visible');
    const y0 = s.year; await ev(() => document.getElementById('turn').click()); await wait(1500); await frames(3); s = await state(); check(s.t1 === 'Pause' && s.year > y0, `time runs (${s.year - y0} yrs)`);
    await page.keyboard.press('+'); await page.keyboard.press('+'); const sp = await ev(() => document.getElementById('speedval').firstChild.textContent); check(/×/.test(sp), 'speed label: ' + sp);
    await page.keyboard.press(' '); await frames(2); check((await state()).t1 === 'Play', 'space pauses');
    await ev(() => document.getElementById('opt-continuous').click()); await frames(2); check((await state()).t1 === 'Advance', 'back to turns');
  });

  // ---------- build tools ----------
  await scenario('city: build panel lists works with cost and years, starts them, places on a plot, shows the queue', async (check) => {
    await ev(() => { const S = __G.sim; S.playerCiv().wealth = 1e6; const c = S.playerCiv(); __G.select(c.capital); });
    const cards = await ev(() => [...document.querySelectorAll('#bgrid .bq')].map(b => ({ k: b.dataset.kind, dis: b.disabled, txt: b.textContent })));
    check(cards.map(c => c.k).join() === 'farm,walls,port,market,temple,academy,mine,wonder,capital,levy', 'cards listed: ' + cards.map(c => c.k).join());
    check(!cards.find(c => c.k === 'farm').dis && !cards.find(c => c.k === 'walls').dis && !cards.find(c => c.k === 'temple').dis, 'farms, walls and temple are buildable in a village');
    const era = await ev(() => __G.sim.playerCiv().era); const mk = cards.find(c => c.k === 'market'); check(era >= 1 ? !mk.dis : (mk.dis && /Bronze/.test(mk.txt)), era >= 1 ? 'market buildable from the Bronze Age' : 'market card says it needs the Bronze Age');
    check(/\d+ · \d+ yrs?/.test(cards.find(c => c.k === 'farm').txt), 'cards show cost and years: ' + cards.find(c => c.k === 'farm').txt);
    // farms: immediate start, shows in the queue
    await ev(() => document.querySelector('.bq[data-kind="farm"]').click()); await frames(2);
    let r = await ev(() => { const S = __G.sim; const c = S.playerCiv(); return { prog: !!S.inProgress(c.capital, 'farm'), queue: document.getElementById('bqueue').textContent, card: document.querySelector('.bq[data-kind="farm"]').textContent, toasts: window.__toasts.slice(-1)[0] }; });
    check(r.prog && /Farms/.test(r.queue) && /yrs/.test(r.queue), 'farm site started and queued: ' + r.queue); check(/building/.test(r.card), 'farm card shows it is building');
    // temple: placement mode with plot markers, click one
    await ev(() => document.querySelector('.bq[data-kind="temple"]').click()); await frames(3);
    r = await ev(() => ({ banner: document.getElementById('bannertext').textContent, plots: document.querySelectorAll('#plots .plot').length, visible: [...document.querySelectorAll('#plots .plot')].filter(p => p.style.display !== 'none').length, on: !!document.querySelector('.bq[data-kind="temple"].on') }));
    check(/Place the temple/.test(r.banner), 'placement banner: ' + r.banner); check(r.plots === 12, `twelve plots drawn (${r.plots})`); check(r.on, 'temple card highlighted while placing');
    await ev(() => { const el = [...document.querySelectorAll('#plots .plot')].find(p => !p.classList.contains('used')); el.click(); }); await frames(2);
    r = await ev(() => { const S = __G.sim; const c = S.playerCiv(); const w = S.inProgress(c.capital, 'temple'); return { slot: w ? w.slot : -1, plots: document.querySelectorAll('#plots .plot').length, banner: document.getElementById('banner').hidden, queue: document.getElementById('bqueue').textContent }; });
    check(r.slot >= 0, `temple started on plot ${r.slot + 1}`); check(r.plots === 0 && r.banner, 'plots and banner cleared after placing'); check(/Temple · plot/.test(r.queue), 'queue names the plot: ' + r.queue);
    // works finish with the years: effects land, queue empties, site drawn meanwhile
    await ev(() => { __G.mapcam.fly = null; const [lon, lat] = __T.capital(); __T.cam(lon, lat, 0.002, 0.6, 0); __G.run(2); __G.world.updateBuildings(__G.mapcam, true); }); await frames(2);
    const sc = await ev(() => ({ scaffold: __G.world.inst.scaffold.count, sites: __G.world.sites.length }));
    check(sc.scaffold > 0 && sc.sites > 0, `scaffolding drawn at the sites (${sc.scaffold} frames, ${sc.sites} sites)`);
    await ev(() => { const S = __G.sim; const c = S.playerCiv(); __G.run(S.durOf('temple', c.era) + 2); __G.select(c.capital); });
    r = await ev(() => { const S = __G.sim; const c = S.playerCiv(); return { temple: !!(S.special[c.capital] & 4), infra: S.infra[c.capital], queue: document.getElementById('bqueue').textContent, card: document.querySelector('.bq[data-kind="temple"]').textContent }; });
    check(r.temple && r.infra === 1, `temple and farms finished (temple ${r.temple}, farms ${r.infra})`); check(!/Temple/.test(r.queue), 'queue no longer lists the temple'); check(/Already has a temple/.test(r.card), 'temple card now says it is built');
    // levy and the other instant works
    await ev(() => document.querySelector('.bq[data-kind="levy"]').click()); check(await ev(() => __G.sim.playerCiv().army > __G.sim.year), 'levy raises an army');
    await page.keyboard.press('Escape'); await frames(1);
  });
  await scenario('city: broke realm has every card disabled; rich realm re-enables', async (check) => {
    await ev(() => { const S = __G.sim; S.playerCiv().wealth = 0; __G.select(S.playerCiv().capital); __G.run(1); }); await frames(2);
    const d = await ev(() => ({ disabled: [...document.querySelectorAll('#bgrid .bq')].filter(b => b.disabled).length, total: document.querySelectorAll('#bgrid .bq').length, note: document.getElementById('bhead-note').textContent }));
    check(d.disabled === d.total, `all ${d.total} cards disabled when broke (${d.disabled})`); check(/treasury \d/.test(d.note), 'panel header shows the treasury: ' + d.note);
    await ev(() => { __G.sim.playerCiv().wealth = 5000; __G.run(1); }); await frames(2);
    const en = await ev(() => [...document.querySelectorAll('#bgrid .bq')].filter(b => !b.disabled).map(b => b.dataset.kind)); check(en.includes('farm') && en.includes('walls'), 'cards enabled again when rich: ' + en.join());
  });
  await scenario('god powers: spawn, plague, meteor, bounty, prophet, enlighten', async (check) => {
    const r = await ev(() => { const S = __G.sim; document.getElementById('l-build').click(); const out = {}; const useAt = (tool, lon, lat) => { document.querySelector(`.dg[data-tool="${tool}"]`).click(); const hit = { lon, lat, h: 10 }; const pick = __G.mapcam.pickAt; __G.mapcam.pickAt = () => hit; __G.mapcam.onClick(0, 0); __G.mapcam.pickAt = pick; return [...document.querySelectorAll('.toast')].pop()?.textContent; };
      const e = S.civs.find(x => x && !x.player); const y = (e.capital / 720) | 0, x = e.capital - y * 720; const lon = (x + 0.5) / 720 * 360 - 180, lat = 90 - (y + 0.5) / 360 * 180;
      const empty = S.LI.find(i => S.owner[i] < 0 && S.fert[i] > 0.5 && !(S.flags[i] & 8)); const ye = (empty / 720) | 0, xe = empty - ye * 720;
      const n0 = S.st.civCount; out.spawn = useAt('spawn', (xe + 0.5) / 720 * 360 - 180, 90 - (ye + 0.5) / 360 * 180); out.spawnOk = S.st.civCount === n0 + 1;
      const p0 = S.pop[e.capital]; out.plague = useAt('plague', lon, lat); out.plagueOk = S.pop[e.capital] < p0;
      out.bounty = useAt('bounty', lon, lat); out.bountyOk = S.bonusFert[e.capital] > 0;
      out.prophet = useAt('prophet', lon, lat); out.prophetOk = !!e.religion;
      const t0 = e.tech; out.enlighten = useAt('enlighten', lon, lat); out.enlightenOk = e.tech > t0;
      out.meteor = useAt('meteor', lon, lat); out.meteorOk = S.owner[e.capital] === -1 || !S.civs[e.id];
      out.godVisible = document.body.classList.contains('dockopen') && !document.getElementById('dock-god').hidden; return out; });
    for (const k of ['spawn', 'plague', 'bounty', 'prophet', 'enlighten', 'meteor']) check(r[k + 'Ok'], `${k}: ${r[k]}`);
    check(r.godVisible, 'powers dock visible');
    await ev(() => document.getElementById('l-build').click()); check(!(await state()).dock, 'powers dock closes');
  });

  // ---------- panels ----------
  await scenario('inspector: owned capital, foreign city, wild land, sea', async (check) => {
    const r = await ev(() => { const S = __G.sim; const c = S.playerCiv(); const out = {}; __G.select(c.capital); out.title = document.getElementById('sel-title').textContent; out.sub = document.getElementById('sel-sub').textContent; out.policy = !document.getElementById('policy').hidden; out.towns = !document.getElementById('sc-towns-sect').hidden; out.actions = document.getElementById('sc-actions').textContent;
      const e = S.civs.find(x => x && !x.player && x.capital >= 0 && S.owner[x.capital] === x.id); __G.select(e.capital); out.eTitle = document.getElementById('sel-title').textContent; out.ePolicy = !document.getElementById('policy').hidden; out.eActions = document.getElementById('sc-actions').textContent;
      const wild = S.LI.find(i => S.owner[i] < 0 && S.fert[i] > 0.3); __G.select(wild); out.wTitle = document.getElementById('sel-title').textContent; out.wSub = document.getElementById('sel-sub').textContent; out.wCiv = document.getElementById('sel-civ').hidden;
      __G.select(0); out.sTitle = document.getElementById('sel-title').textContent; return out; });
    const ru = await ev(() => { const S = __G.sim; const c = S.playerCiv(); __G.select(c.capital); const cv = document.getElementById('sc-portrait'); const ctx = cv.getContext('2d'); const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let painted = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 0) painted++; return { name: document.getElementById('sc-ruler-name').textContent, sub: document.getElementById('sc-ruler-sub').textContent, trait: document.getElementById('sc-ruler-trait').textContent, painted: painted / (d.length / 4), trade: document.getElementById('sc-kv').textContent.includes('Trade') }; });
    check(ru.name.length > 3 && /throne/.test(ru.sub) && ru.trait.length > 10, `ruler card: ${ru.name} · ${ru.sub} · ${ru.trait.slice(0, 40)}`); check(ru.painted > 0.9, `portrait painted (${(ru.painted * 100).toFixed(0)}% of pixels)`); check(ru.trade, 'trade row in the realm panel');
    check(/capital of/.test(r.sub), 'own capital subtitle: ' + r.sub); check(r.policy, 'policy shown for own realm'); check(r.towns, 'settlement list for own realm'); check(r.actions === '', 'no war button on yourself');
    check(!r.ePolicy && /Declare war|Offer peace/.test(r.eActions), 'foreign realm: no policy, war button: ' + r.eActions);
    check(r.wTitle === 'Unclaimed land' && r.wCiv, 'wild land: ' + r.wTitle + ' / ' + r.wSub);
    check(r.sTitle === 'Open sea', 'sea: ' + r.sTitle);
  });
  await scenario('inspector: policy sliders, stance, rename, declare war and peace', async (check) => {
    const r = await ev(() => { const S = __G.sim; const c = S.playerCiv(); __G.select(c.capital); document.getElementById('policy').open = true; const out = {};
      const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); }; set('pol-tax', 1.6); set('pol-military', 0.5); set('pol-research', 2); out.policy = { ...c.policy };
      document.querySelector('.stance[data-stance="aggressive"]').click(); out.stance = c.policy.stance; out.on = document.querySelector('.stance.on').dataset.stance;
      document.getElementById('in-name').value = 'Renamed'; document.getElementById('btn-rename').click(); out.name = c.name; out.header = document.getElementById('id-name').textContent;
      const e = S.civs.find(x => x && !x.player && x.capital >= 0 && S.owner[x.capital] === x.id); __G.select(e.capital); document.getElementById('btn-war').click(); out.war = S.isAtWar(c, e.id); out.btn = document.getElementById('btn-war').textContent; document.getElementById('btn-war').click(); out.peace = !S.isAtWar(c, e.id); return out; });
    check(r.policy.tax === 1.6 && r.policy.military === 0.5 && r.policy.research === 2, 'sliders write policy: ' + JSON.stringify(r.policy)); check(r.stance === 'aggressive' && r.on === 'aggressive', 'stance set'); check(r.name === 'Renamed' && /Renamed/.test(r.header), 'rename updates header: ' + r.header);
    check(r.war && /peace/i.test(r.btn) && r.peace, 'war then peace via button');
    await ev(() => { document.querySelector('.stance[data-stance="steady"]').click(); });
  });
  await scenario('chronicle modal: tabs, filters, click-to-fly, close', async (check) => {
    await page.keyboard.press('c'); await frames(2);
    let r = await ev(() => ({ open: document.getElementById('chron').open, log: document.querySelectorAll('#log .fe').length, filters: document.querySelectorAll('#logfilters .btn').length }));
    check(r.open, 'chronicle opens with C'); check(r.log > 0, 'log has entries'); check(r.filters === 8, 'eight filters');
    await ev(() => document.querySelector('#logfilters [data-f="mine"]').click()); const mine = await ev(() => [...document.querySelectorAll('#log .fe')].every(e => e.classList.contains('mine'))); check(mine, 'Mine filter shows only own events');
    await ev(() => document.querySelector('#chron .tabs [data-ctab="powers"]').click()); check((await ev(() => document.querySelectorAll('#powers .pw').length)) > 3, 'powers list');
    await ev(() => document.querySelector('#chron .tabs [data-ctab="graphs"]').click()); await frames(2); check((await ev(() => { const c = document.getElementById('g-world'); return c.width > 0 && c.height > 0; })), 'graphs drawn');
    await ev(() => document.querySelector('#chron .tabs [data-ctab="stats"]').click()); check((await ev(() => document.querySelectorAll('#stats .tile').length)) === 8, 'eight stat tiles');
    await ev(() => document.querySelector('#chron .tabs [data-ctab="log"]').click()); await ev(() => document.querySelector('#logfilters [data-f="all"]').click());
    const d0 = (await state()).dist; await ev(() => { const fe = [...document.querySelectorAll('#log .fe')].find(e => e); fe.click(); }); await frames(2);
    r = await ev(() => ({ open: document.getElementById('chron').open, fly: !!__G.mapcam.fly })); check(!r.open, 'clicking an event closes the modal'); check(r.fly, 'and flies there'); void d0;
    await page.keyboard.press('c'); await page.keyboard.press('Escape'); check(!(await ev(() => document.getElementById('chron').open)), 'Esc closes');
  });
  await scenario('menu: open, settings persist, new world', async (check) => {
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await ev(() => document.getElementById('btn-menu').click()); check(await ev(() => document.getElementById('menu').open), 'menu opens');
    await ev(() => { const s = document.getElementById('ui-scale'); s.value = 1.25; s.dispatchEvent(new Event('input')); document.getElementById('opt-glass').click(); document.getElementById('opt-autotilt').click(); const q = document.getElementById('opt-quality'); q.value = 'balanced'; q.dispatchEvent(new Event('change')); });
    const r = await ev(() => ({ scale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(), glass: document.body.classList.contains('glass'), tilt: __G.mapcam.autoTilt, q: __G.settings.quality, trees: __G.trees.enabled, stored: JSON.parse(localStorage.getItem('genesis-settings')).uiScale }));
    check(r.scale === '1.25', 'ui scale applied: ' + r.scale); check(r.glass, 'glass on'); check(r.tilt === false, 'auto tilt off'); check(r.q === 'balanced' && r.trees === false, 'balanced quality disables trees'); check(r.stored === 1.25, 'settings persisted');
    await ev(() => { const s = document.getElementById('ui-scale'); s.value = 1; s.dispatchEvent(new Event('input')); document.getElementById('opt-glass').click(); document.getElementById('opt-autotilt').click(); const q = document.getElementById('opt-quality'); q.value = 'high'; q.dispatchEvent(new Event('change')); document.getElementById('m-close').click(); });
    check(!(await ev(() => document.getElementById('menu').open)), 'menu closes');
  });

  // ---------- save / load ----------
  await scenario('save/load: save, reload page, continue from the intro, state restored', async (check) => {
    const before = await ev(() => { const S = __G.sim; const c = S.playerCiv(); __G.sim.ruins.set(S.LI[123], { year: S.year - 50, era: 1, culture: 0, R: 200, wonder: 0, name: 'Testruin' }); document.getElementById('btn-menu').click(); document.getElementById('m-save').click(); return { year: S.year, name: c.name, cells: S.cellsOf[c.id], civs: S.st.civCount, lon: __G.mapcam.lon, lat: __G.mapcam.lat, saved: !!localStorage.getItem('genesis-save-v2'), toast: (window.__toasts || []).slice(-1)[0] || [...document.querySelectorAll('.toast')].pop()?.textContent }; });
    check(before.saved, 'save written to localStorage'); check(/saved/i.test(before.toast || ''), 'save toast: ' + before.toast);
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__G && window.__G.sim && document.getElementById('loading').hidden, null, { timeout: 60000 }); await page.evaluate(TC); await installToastLog();
    check(!(await ev(() => document.getElementById('btn-load').hidden)), 'Continue button shown on the intro after a save');
    await ev(() => document.getElementById('btn-load').click()); await wait(800); await frames(4);
    const after = await ev(() => { const S = __G.sim; const c = S.playerCiv(); return { mode: document.body.dataset.mode, year: S.year, name: c && c.name, cells: c && S.cellsOf[c.id], civs: S.st.civCount, lon: __G.mapcam.lon, lat: __G.mapcam.lat, ruin: S.ruins.get(S.LI[123])?.name, turn: document.getElementById('turn1').textContent, left: document.getElementById('left').classList.contains('open') }; });
    check(after.mode === 'play', 'play mode after load'); check(after.year === before.year, `year ${after.year} == ${before.year}`); check(after.name === before.name, 'player name'); check(Math.abs(after.cells - before.cells) <= 1, `cells ${after.cells} ~ ${before.cells}`); check(after.civs === before.civs, `civs ${after.civs} == ${before.civs}`);
    check(Math.abs(after.lon - before.lon) < 1e-6 && Math.abs(after.lat - before.lat) < 1e-6, 'camera restored'); check(after.ruin === 'Testruin', 'ruins restored'); check(after.turn === 'Advance', 'turn button ready');
    // and a turn still runs after loading
    await ev(() => document.getElementById('turn').click()); await page.waitForFunction(() => !__G.turnRun.active, null, { timeout: 300000 }); check((await state()).year > before.year, 'time runs after load');
  });
  await scenario('save/load: loading with no save is handled; corrupt save is handled', async (check) => {
    await ev(() => { localStorage.removeItem('genesis-save-v2'); document.getElementById('btn-menu').click(); document.getElementById('m-load').click(); });
    check((await state()).toasts.some(t => /No saved world/.test(t)), 'no-save toast');
    await ev(() => { localStorage.setItem('genesis-save-v2', '{"v":2,"year":1'); document.getElementById('m-load').click(); });
    check((await state()).toasts.some(t => /could not be read/.test(t)), 'corrupt-save toast'); await ev(() => { localStorage.removeItem('genesis-save-v2'); document.getElementById('m-close').click(); });
  });

  // ---------- camera, labels, minimap, keys ----------
  await scenario('camera: zoom limits, pick, fly, compass buttons, minimap click', async (check) => {
    const r = await ev(() => { const M = __G.mapcam; const out = {}; M.fly = null; M.tDist = 1e-9; M.update(0.1); out.min = M.tDist >= M.minDist; M.tDist = 99; M.update(0.1); out.max = M.tDist <= M.maxDist; M.tDist = M.dist = 0.05; M.update(0.1);
      const vp = { w: innerWidth, h: innerHeight }; const hit = M.pickAt(vp.w / 2, vp.h / 2); out.pick = hit && isFinite(hit.lon) && isFinite(hit.lat) && isFinite(hit.h); out.pickDist = hit ? GEO.distKm(hit.lon, hit.lat, M.lon, M.lat) : -1;
      document.getElementById('northbtn').click(); out.north = M.tHeading === 0; document.getElementById('topbtn').click(); out.top = M.tTilt === 0; document.getElementById('orbitbtn').click(); out.orbit = !!M.fly; M.fly = null; document.getElementById('homebtn').click(); out.home = !!M.fly; M.fly = null;
      const mm = document.getElementById('minimap'); const rect = mm.getBoundingClientRect(); mm.dispatchEvent(new MouseEvent('click', { clientX: rect.left + rect.width * 0.75, clientY: rect.top + rect.height * 0.4, bubbles: true })); out.mmFly = !!M.fly; M.fly = null; return out; });
    check(r.min && r.max, 'zoom clamped to [min,max]'); check(r.pick && r.pickDist < 5, 'pick under the screen centre returns the camera point (' + r.pickDist.toFixed(2) + ' km)'); check(r.north && r.top, 'north/top buttons'); check(r.orbit && r.home && r.mmFly, 'orbit/home/minimap fly');
  });
  await scenario('keys: P L B G R F9 H toggles and Expand', async (check) => {
    const r = {};
    r.pol0 = await ev(() => __G.globals.uPolitical.value); await page.keyboard.press('p'); r.pol1 = await ev(() => __G.globals.uPolitical.value); await page.keyboard.press('p'); check(r.pol0 === 1 && r.pol1 === 0, 'P toggles political');
    await page.keyboard.press('l'); r.lab = await ev(() => document.getElementById('v-labels').classList.contains('on')); await page.keyboard.press('l'); check(r.lab === false, 'L toggles labels');
    await page.keyboard.press('b'); await frames(1); check((await state()).left && (await ev(() => !document.getElementById('sel-build').hidden)), 'B opens the city panel with the build grid');
    await page.keyboard.press('g'); check((await state()).dock, 'G opens powers'); await page.keyboard.press('g'); check(!(await state()).dock, 'G closes powers');
    await page.waitForFunction(() => !__G.mapcam.fly, null, { timeout: 320000 }); await ev(() => document.getElementById('l-expand').click()); check(/Settle/.test((await state()).banner), 'Expand starts settling: ' + (await state()).banner); await page.keyboard.press('Escape'); check(!(await state()).banner, 'Esc cancels settling');
    await page.keyboard.press('r'); check((await state()).left && (await ev(() => document.getElementById('policy').open)), 'R opens realm with policy'); await page.keyboard.press('Escape');
    await page.keyboard.press('F9'); check(await ev(() => document.body.classList.contains('hidehud')), 'F9 hides HUD'); await page.keyboard.press('F9');
    await page.keyboard.press('h'); check(await ev(() => !!__G.mapcam.fly), 'H flies home');
  });
  await scenario('labels: realms from orbit, cities from region height, ruins near', async (check) => {
    await ev(() => { __G.mapcam.fly = null; const [lon, lat] = __T.capital(); __T.cam(lon, lat, 0.16, 0, 0); }); await wait(600); await frames(8); // ~1000 km up: realms of a few regions get names, towns do not
    try { await page.waitForFunction(() => document.querySelectorAll('.lbl.realm').length > 0, null, { timeout: 60000 }); } catch (e) {}
    let n = await ev(() => ({ realm: document.querySelectorAll('.lbl.realm').length, city: document.querySelectorAll('.lbl.city:not(.cap)').length, dbg: __G.labelDbg, cells: __G.sim.cellsOf[__G.sim.player] })); check(n.realm > 0, `realm labels from high up (${n.realm}; player has ${n.cells} regions; ${JSON.stringify(n.dbg)})`); check(n.city === 0, 'no town labels from high up (only your capital)');
    await ev(() => { const [lon, lat] = __T.capital(); __T.cam(lon, lat, 0.03, 0.4, 0); }); await wait(600); await frames(8);
    try { await page.waitForFunction(() => document.querySelectorAll('.lbl.city.show').length > 0, null, { timeout: 90000 }); } catch (e) { const d = await ev(() => { const S = __G.sim; const c = S.playerCiv(); return { altKm: __G.mapcam.alt * 6371, capLvl: S.level[c.capital], labelsOn: document.getElementById('v-labels').classList.contains('on'), hud: document.body.classList.contains('hidehud'), lbls: document.querySelectorAll('.lbl').length, mode: document.body.dataset.mode }; }); check(false, 'no city labels appeared: ' + JSON.stringify(d)); }
    await frames(14);      // a label that has just lost its place to a better one lingers for two rounds of the layout (six frames): let those pass
    n = await ev(() => ({ city: document.querySelectorAll('.lbl.city').length, ruin: document.querySelectorAll('.lbl.ruin').length, overlap: (() => { const r = [...document.querySelectorAll('.lbl.show')].map(e => e.getBoundingClientRect()); let o = 0; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (r[i].left < r[j].right && r[j].left < r[i].right && r[i].top < r[j].bottom && r[j].top < r[i].bottom) o++; return o; })() })); check(n.city > 0, 'city labels near the capital (' + n.city + ')'); check(n.overlap <= 1, 'labels do not overlap (' + n.overlap + ' overlaps)');
  });
  await scenario('goods: markers on the map and yields in the inspector', async (check) => {
    const g = await ev(() => { const S = __G.sim; const c = S.playerCiv(); const cap = c.capital; const y0 = (cap / 720) | 0, x0 = cap - y0 * 720; let best = -1, bd = 1e9; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const i = (y0 + dy) * 720 + ((x0 + dx + 720) % 720); if (i < 0 || i >= S.N || !S.goods[i] || !(S.ERA_MASKS[c.era] & (1 << S.goods[i]))) continue; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } } if (best < 0) return { none: true }; const y = (best / 720) | 0, x = best - y * 720; const lon = (x + 0.5) / 720 * 360 - 180, lat = 90 - (y + 0.5) / 360 * 180; __G.mapcam.fly = null; __T.cam(lon, lat, 0.004, 0.5, 0); __G.select(best); return { i: best, good: S.GOODS[S.goods[best]].name, cell: document.getElementById('sel-cell').textContent }; });
    if (g.none) { check(false, 'no goods cell within 6 cells of the capital'); return; }
    check(/Yields/.test(g.cell) && g.cell.includes(g.good), `inspector lists the yield (${g.good}): ` + g.cell.replace(/\s+/g, ' ').slice(0, 80));
    await wait(500); await frames(6);
    try { await page.waitForFunction(() => document.querySelectorAll('.lbl.good').length > 0, null, { timeout: 90000 }); } catch (e) {}
    const n = await ev(() => ({ markers: document.querySelectorAll('.lbl.good').length, withText: [...document.querySelectorAll('.lbl.good')].filter(e => e.textContent.trim()).length, dbg: __G.labelDbg }));
    check(n.markers > 0, `goods markers drawn (${n.markers}; ${JSON.stringify(n.dbg)})`); check(n.withText > 0, 'markers carry the good\'s name this close');
  });
  await scenario('hover: plot chip over land and sea', async (check) => {
    await ev(() => { const [lon, lat] = __T.capital(); __T.cam(lon, lat, 0.004, 0.5, 0); }); await wait(500); await frames(5);
    const vp = page.viewportSize(); await page.mouse.move(vp.width / 2, vp.height / 2); await wait(120); await page.mouse.move(vp.width / 2 + 3, vp.height / 2 + 3); await wait(120);
    const r = await ev(() => ({ hidden: document.getElementById('hover').hidden, text: document.getElementById('hover').textContent })); check(!r.hidden && /People|Elevation|Realm/.test(r.text), 'hover chip over the capital: ' + r.text.slice(0, 80));
  });

  // ---------- layouts ----------
  await scenario('layout: narrow 800x500 and wide 1920x1080 keep the HUD inside the viewport', async (check) => {
    for (const vp of [{ width: 800, height: 500 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(vp); await wait(300); await frames(3); await ev(() => { document.getElementById('l-build').click(); __G.select(__G.sim.playerCiv().capital); }); await frames(2);
      const r = await ev(() => { const ids = ['tl', 'tr', 'left', 'bl', 'bc', 'br', 'turn', 'minimapbox']; const out = []; for (const id of ids) { const el = document.getElementById(id); if (!el || getComputedStyle(el).display === 'none') continue; const b = el.getBoundingClientRect(); if (b.width === 0) continue; if (b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1) out.push(`${id} ${Math.round(b.left)},${Math.round(b.top)}-${Math.round(b.right)},${Math.round(b.bottom)}`); } const a = document.getElementById('left').getBoundingClientRect(), d = document.getElementById('bc').getBoundingClientRect(); const overlap = a.left < d.right && d.left < a.right && a.top < d.bottom && d.top < a.bottom; return { out, overlap, w: innerWidth }; });
      check(r.out.length === 0, `${vp.width}px: elements outside viewport: ${r.out.join('; ')}`); check(!r.overlap, `${vp.width}px: inspector overlaps the dock`);
      await ev(() => document.getElementById('l-build').click());
    }
    await page.setViewportSize({ width: 1024, height: 640 }); await wait(300);
  });

  // ---------- rendering sweep ----------
  await scenario('render: orbit→street at the capital, instance caps respected, no GL errors', async (check) => {
    const caps = await ev(() => { const out = {}; for (const k in __G.world.inst) out[k] = __G.world.inst[k].instanceMatrix.count; return out; });
    for (const [dist, tilt] of [[2.5, 0], [0.3, 0.3], [0.03, 0.6], [0.003, 0.9], [0.0003, 1.1], [0.00005, 1.3]]) {
      await ev(([d, t]) => { const [lon, lat] = __T.capital(); __T.cam(lon + d * 0.3, lat - d * 0.3, d, t, 0.4); }, [dist, tilt]); await wait(dist < 0.01 ? 2500 : 800); await frames(6);
      const r = await ev((caps) => { const out = { tiles: __G.terrain.stats.tiles, loading: __G.terrain.stats.loading, buildings: __G.world.buildingCount, trees: __G.trees.count, movers: __G.movers.stats, fx: __G.fx.stats, over: [] }; for (const k in __G.world.inst) if (__G.world.inst[k].count > caps[k]) out.over.push(k); const gl = __G.renderer.getContext(); out.glErr = gl.getError(); return out; }, caps);
      check(r.tiles > 0 && r.tiles <= 400, `dist ${dist}: tiles ${r.tiles}`); check(r.over.length === 0, `dist ${dist}: instance overflow ${r.over}`); check(r.glErr === 0, `dist ${dist}: GL error ${r.glErr}`);
      if (dist <= 0.003) check(r.buildings > 0, `dist ${dist}: buildings drawn (${r.buildings})`);
      if (dist <= 0.0003) check(r.movers.walkers > 0 || r.movers.agents > 0, `dist ${dist}: street life (${JSON.stringify(r.movers)})`);
    }
  });
  await scenario('render: six regions at town height draw towns of their own culture', async (check) => {
    const spots = [[2.3, 48.8, 'north'], [31.25, 29.9, 'mena'], [108.9, 34.3, 'easia'], [-99.1, 19.4, 'america'], [77.2, 28.6, 'sasia'], [3.9, 6.5, 'africa']];
    for (const [lon, lat, cul] of spots) {
      const r = await ev(([lon, lat]) => { const S = __G.sim; const i = (() => { const x = Math.floor((lon + 180) / 360 * 720), y = Math.floor((90 - lat) / 180 * 360); return y * 720 + x; })(); let c = S.civs[S.owner[i]]; if (!c) { c = S.land[i] ? S.spawnTribe(i, {}) : null; for (let d = 1; d <= 6 && !c; d++) for (let dy = -d; dy <= d && !c; dy++) for (let dx = -d; dx <= d && !c; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const j = i + dy * 720 + dx; if (j < 0 || j >= S.N || !S.land[j]) continue; c = S.owner[j] >= 0 ? S.civs[S.owner[j]] : S.spawnTribe(j, {}); } } if (!c) return { none: true }; c.tech = 0.45; S.pop[c.capital] = 30; __G.run(3); __G.world.refreshTextures(); const [sl, sa] = __G.world.siteOf(c.capital); __T.cam(sl + 0.003, sa - 0.003, 0.0003, 1.0, 0.4); return { culture: TOWN.CULTURES[TOWN.civCulture(S, c)], cap: c.capital }; }, [lon, lat]);
      if (r.none) { check(false, `${cul}: no realm could be placed`); continue; }
      await wait(2500); await frames(6);
      const b = await ev(() => ({ n: __G.world.buildingCount, kinds: Object.keys(__G.world.inst).filter(k => __G.world.inst[k].count > 0) }));
      check(r.culture === cul, `${cul}: culture classified as ${r.culture}`); check(b.n > 200, `${cul}: ${b.n} buildings`);
    }
  });
  await scenario('render: long live run (continuous, 30 s real time) stays error-free', async (check) => {
    await ev(() => { __G.mapcam.fly = null; const [lon, lat] = __T.capital(); __T.cam(lon, lat, 0.02, 0.6, 0); document.getElementById('opt-continuous').click(); document.getElementById('turn').click(); for (let k = 0; k < 4; k++) document.getElementById('btn-faster').click(); });
    const y0 = await ev(() => __G.sim.year); await wait(30000);
    const r = await ev(() => ({ year: __G.sim.year, fps: 1000 / (window.__frameEMA || 16), paused: document.getElementById('turn1').textContent })); check(r.year > y0, `years advanced in continuous mode (${r.year - y0} in 30 s; software rendering paces the clock by frames)`);
    await ev(() => { document.getElementById('turn').click(); document.getElementById('opt-continuous').click(); });
  });

  // ---------- summary ----------
  const passed = results.filter(r => r.ok).length; log(`\n${passed}/${results.length} scenarios passed`);
  if (passed < results.length) log('FAILED: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
  await browser.close(); server.close(); process.exit(passed === results.length ? 0 : 1);
});
