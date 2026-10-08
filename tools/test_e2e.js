// Holocene browser end-to-end suite. One Chromium (SwiftShader) session; every scenario runs in the same page unless it
// needs a fresh load. Collects page errors, console errors, WebGL shader errors, and assertion failures.
//   node test_e2e.js [filter]        screenshots on failure go to shots/e2e_*.png, report to shots/test_e2e.log
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve('dist'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
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
  // (envoys are a matter for the scenario about them: elsewhere nobody waits on the player at the start and the neighbours keep their proposals to themselves)
  if (page && !/^(boot|intro)/.test(name)) await ev(() => { if (window.__T && __T.quiet && __G.sim && document.body.dataset.mode === 'play') __T.quiet(); });
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
    check(s.left, 'inspector opened on the new village'); check(s.t1 === 'Knowledge', 'the turn button asks what the people will learn first: ' + s.t1);
    const cap = await ev(() => { const c = __G.sim.playerCiv(); return { lvl: __G.sim.level[c.capital], owner: __G.sim.owner[c.capital] === c.id, cells: __G.sim.cellsOf[c.id] }; }); check(cap.lvl >= 1 && cap.owner, 'capital is a village the player owns');
    check((await ev(() => __G.sim.st.civCount)) >= 10, 'other tribes seeded');
    // (the HUD's figures are numbers: since diplomacy came the strength tile read 'NaN', sim.strength asked with one argument of three)
    const hud = await ev(() => Array.from(document.querySelectorAll('[id^="eco-"]')).map((e) => e.textContent).join(' | '));
    check(!/NaN|undefined/.test(hud), 'the HUD has no NaN: ' + hud);
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

  // ---------- knowledge ----------
  await scenario('knowledge: the opening choice, the tree, a study and a queue, where you stand', async (check) => {
    await ev(() => { const r = document.getElementById('report-close'); if (r) r.click(); }); await page.keyboard.press('Escape'); await frames(2);
    let r = await ev(() => { const S = __G.sim, c = S.playerCiv(), k = S.know; return { t1: document.getElementById('turn1').textContent, known: k.count[c.id], pool: Math.round(k.pool[c.id] * KNOW.UNIT), tile: document.getElementById('eco-know').textContent + '/' + document.getElementById('eco-know-d').textContent, farm: S.cannot('farm', c.capital) }; });
    check(r.t1 === 'Knowledge' && r.known === 0 && r.pool === 1000, `a new people knows nothing and has insight to spend (${r.pool}); the turn button says ${r.t1}`); check(/choose/.test(r.tile), 'the top bar says to choose: ' + r.tile); check(/Needs Farming/.test(r.farm), 'no fields yet: ' + r.farm);
    await ev(() => document.getElementById('turn').click()); await frames(3);
    r = await ev(() => { const cards = [...document.querySelectorAll('#kn-canvas .kn-card')]; const sc = document.getElementById('kn-scroll'); return { open: document.getElementById('know').open, cards: cards.length, nd: KNOW.ND, eras: document.querySelectorAll('#kn-canvas .kn-era').length, brs: document.querySelectorAll('#kn-canvas .kn-br').length, lines: document.querySelectorAll('#kn-canvas .kn-lines path').length, openN: cards.filter(b => b.classList.contains('open')).length, later: cards.filter(b => b.classList.contains('later')).length, wide: sc.scrollWidth > sc.clientWidth * 2, now: document.getElementById('kn-now').textContent, rate: document.getElementById('kn-rate').textContent, info: document.querySelector('#kn-info h3') ? document.querySelector('#kn-info h3').textContent : '',
      overlap: (() => { const rs = cards.map(b => b.getBoundingClientRect()); let n = 0; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (rs[i].left < rs[j].right - 1 && rs[j].left < rs[i].right - 1 && rs[i].top < rs[j].bottom - 1 && rs[j].top < rs[i].bottom - 1) n++; return n; })() }; });
    check(r.open, 'a click on the turn button opens the tree'); check(r.cards === r.nd && r.eras === 9 && r.brs === 6 && r.lines > 150, `every discovery has its card: ${r.cards} cards, ${r.eras} ages, ${r.brs} branches, ${r.lines} lines`); check(r.overlap === 0, `no two cards overlap (${r.overlap})`);
    check(r.openN >= 10 && r.later > 100 && r.wide, `the first age is open to study, the later ones dimmed, and the tree scrolls through the ages (${r.openN} open, ${r.later} later)`); check(/await your word/.test(r.now) && /1,000 insight unspent/.test(r.now), 'the strip says nothing is being studied: ' + r.now); check(/insight a year/.test(r.rate) && r.info.length > 2, `the pace of learning is shown (${r.rate.trim()}), and a discovery's page (${r.info})`);
    // what the people hold already pays for is marked; the keyboard is on the chosen card, and the arrows walk the tree
    r = await ev(() => { const cards = [...document.querySelectorAll('#kn-canvas .kn-card.open')]; const a = document.activeElement; return { once: cards.filter(b => /at once/.test(b.querySelector('.st').textContent)).length, open: cards.length, focus: a ? (a.id || a.className) : '', sel: document.querySelector('.kn-card.sel').dataset.k }; });
    check(r.once === r.open && r.once >= 10, `cards that can be learned out of hand say so (${r.once} of ${r.open})`); check(/kn-card/.test(r.focus) && /sel/.test(r.focus), 'the keyboard starts on the chosen discovery, not on the button that closes the screen: ' + r.focus);
    const sel0 = r.sel; await page.keyboard.press('ArrowDown'); await frames(2); const sel1 = await ev(() => document.querySelector('.kn-card.sel').dataset.k); await page.keyboard.press('ArrowRight'); await frames(2);
    r = await ev(() => ({ sel: document.querySelector('.kn-card.sel').dataset.k, focus: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.k : '', h: document.querySelector('#kn-info h3').textContent }));
    check(sel1 !== sel0 && r.sel !== sel1 && r.focus === r.sel && r.h.length > 2, `the arrow keys move from discovery to discovery (${sel0} > ${sel1} > ${r.sel})`);
    // farming: its page, then learned at once out of what the people hold
    await ev(() => document.querySelector('.kn-card[data-k="farming"]').click()); await frames(2);
    r = await ev(() => ({ h: document.querySelector('#kn-info h3').textContent, gives: [...document.querySelectorAll('#kn-info .kn-gives li')].map(li => li.textContent), btn: document.querySelector('#kn-info [data-kact="study"]') ? document.querySelector('#kn-info [data-kact="study"]').textContent : '', leads: document.querySelectorAll('#kn-info .kn-chips .kn-chip').length, sel: document.querySelector('.kn-card.sel').dataset.k, hot: document.querySelectorAll('#kn-canvas .kn-lines path.lead').length }));
    check(r.h === 'Farming' && r.sel === 'farming' && r.gives.some(g => /food from the land/.test(g)) && r.gives.some(g => /Farms up to level 2/.test(g)), 'the page says what farming gives: ' + r.gives.join(' | ')); check(r.btn === 'Learn now' && r.leads >= 4 && r.hot >= 4, `it can be learned at once, and what it leads to is shown (${r.leads} discoveries, ${r.hot} lines lit)`);
    await ev(() => document.querySelector('#kn-info [data-kact="study"]').click()); await frames(2);
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(); return { known: S.know.knows(c.id, 'farming'), cls: document.querySelector('.kn-card[data-k="farming"]').className, st: document.querySelector('.kn-card[data-k="farming"] .st').textContent, farm: S.cannot('farm', c.capital), toast: window.__toasts.slice(-1)[0] || '', state: document.querySelector('#kn-info .kn-state').textContent, pool: Math.round(S.know.pool[c.id] * KNOW.UNIT) }; });
    check(r.known && /known/.test(r.cls) && r.st === 'known' && /learn Farming/.test(r.toast), `farming is learned on the spot (${r.pool} insight left): ${r.toast}`); check(!/Needs/.test(r.farm || ''), 'and fields can be laid out'); check(/know this/.test(r.state), 'its page says so');
    // pottery by double click; then weaving has to be studied
    await ev(() => { const b = document.querySelector('.kn-card[data-k="pottery"]'); b.click(); b.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }); await frames(2);
    await ev(() => { document.querySelector('.kn-card[data-k="weaving"]').click(); }); await frames(1); await ev(() => document.querySelector('#kn-info [data-kact="study"]').click()); await frames(2);
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), k = S.know; const b = document.querySelector('.kn-card[data-k="weaving"]'); return { pot: k.knows(c.id, 'pottery'), cur: k.cur[c.id] >= 0 ? KNOW.LIST[k.cur[c.id]].key : '', cls: b.className, st: b.querySelector('.st').textContent, bar: parseFloat(b.querySelector('.bar').style.width), now: document.getElementById('kn-now').textContent, tile: document.getElementById('eco-know').textContent + ' / ' + document.getElementById('eco-know-d').textContent }; });
    check(r.pot, 'a double click learns pottery'); check(r.cur === 'weaving' && /study/.test(r.cls) && /%/.test(r.st) && r.bar > 3 && r.bar < 100, `weaving is begun with what is left (${r.st})`); check(/Studying\s*Weaving/.test(r.now), 'the strip names it: ' + r.now); check(/^\d+% \/ .*yrs/.test(r.tile), 'and so does the top bar: ' + r.tile);
    // a queue: megaliths bring what they stand on
    await ev(() => document.querySelector('.kn-card[data-k="megaliths"]').click()); await frames(1);
    r = await ev(() => ({ cls: document.querySelector('.kn-card[data-k="megaliths"]').className, st: document.querySelector('.kn-card[data-k="megaliths"] .st').textContent, btn: document.querySelector('#kn-info [data-kact="queue"]').textContent })); check(/locked/.test(r.cls) && /after /.test(r.st), 'megaliths wait on something: ' + r.st);
    await ev(() => document.querySelector('#kn-info [data-kact="queue"]').click()); await frames(2);
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(); return { q: S.know.mind(c).q.slice(), chips: [...document.querySelectorAll('#kn-now .kn-q')].map(e => e.textContent.replace('✕', '').trim()), badges: [...document.querySelectorAll('#kn-canvas .kn-card .q')].filter(e => !e.hidden).length }; });
    check(r.q.join(',') === 'ritual,quarrying,megaliths' && r.chips.length === 3 && r.badges === 3, `queued with what they stand on: ${r.chips.join(', ')}`);
    await ev(() => document.querySelector('#kn-now .kn-q .x').click()); await frames(2); check((await ev(() => __G.sim.know.mind(__G.sim.playerCiv()).q.length)) === 2, 'a discovery can be taken out of the queue');
    // a later age can be looked at but not studied
    await ev(() => document.querySelector('.kn-card[data-k="bronze"]').click()); await frames(1);
    r = await ev(() => ({ state: document.querySelector('#kn-info .kn-state').textContent, chips: document.querySelectorAll('#kn-info .goodchip').length, study: !!document.querySelector('#kn-info [data-kact="study"]') })); check(/Bronze Age/.test(r.state) && !r.study && r.chips >= 2, 'bronze belongs to a later age, and its page shows the goods it opens: ' + r.state);
    await ev(() => document.querySelector('#kn-canvas .kn-era[data-e="4"]').click());
    let sl = 0; for (let k = 0; k < 40 && sl <= 800; k++) { await wait(300); sl = await ev(() => document.getElementById('kn-scroll').scrollLeft); }      // (the tree glides there, a frame at a time: slow frames make it a slow glide)
    check(sl > 800, `a click on an age scrolls there (${Math.round(sl)} px)`);
    // where you stand
    await ev(() => document.querySelector('#kn-tabs [data-ktab="stand"]').click()); await frames(2);
    r = await ev(() => ({ rows: document.querySelectorAll('#kn-stand .kn-srow').length, world: document.querySelectorAll('#kn-stand .kn-wrow').length, me: !!document.querySelector('#kn-stand .kn-wrow.me'), age: document.querySelector('#kn-stand .kn-age').textContent, ahead: document.getElementById('kn-stand').textContent })); check(r.rows >= 3 && r.world >= 3 && r.me && /Stone Age/.test(r.age), `the standing tab lists the edges and the most learned realms (${r.rows} edges, ${r.world} realms)`); check(/ahead|behind|level/.test(r.ahead), 'and says whether the people are ahead of their age');
    // the scholars choose for themselves; K closes
    await ev(() => { document.querySelector('#kn-tabs [data-ktab="tree"]').click(); document.querySelector('#kn-now [data-kact="auto"]').click(); }); await frames(2); check(await ev(() => __G.sim.know.mind(__G.sim.playerCiv()).auto), 'the scholars can be left to choose');
    await page.keyboard.press('k'); await frames(2); r = await ev(() => ({ open: document.getElementById('know').open, t1: document.getElementById('turn1').textContent })); check(!r.open && r.t1 === 'Advance', 'K closes the tree, and the turn button is Advance again: ' + r.t1);
    await page.keyboard.press('k'); await frames(2); check(await ev(() => document.getElementById('know').open), 'K opens it'); await page.keyboard.press('Escape'); await frames(2); check(!(await ev(() => document.getElementById('know').open)), 'Esc closes it');
    // the build panel: what is known is offered, what waits on a discovery says which, and a click goes there
    await ev(() => { const S = __G.sim; __G.select(S.playerCiv().capital); }); await frames(2);
    r = await ev(() => [...document.querySelectorAll('#bgrid .bq')].map(b => ({ k: b.dataset.kind, need: b.dataset.need || '', dis: b.disabled, why: b.querySelector('.why') ? b.querySelector('.why').textContent : '' })));
    { const by = Object.fromEntries(r.map(x => [x.k, x])); check(by.farm && !by.farm.need && by.workshop && !by.workshop.need, 'farms and workshops are offered'); check(by.brewery && by.brewery.need === 'brewing' && /Needs Brewing/.test(by.brewery.why) && !by.brewery.dis, 'the brewery waits on brewing: ' + (by.brewery && by.brewery.why)); check(!by.market && !by.port && !by.academy, 'what a later age will teach is left off the list: ' + r.map(x => x.k).join()); }
    await ev(() => document.querySelector('.bq[data-kind="brewery"]').click()); await frames(2); r = await ev(() => ({ open: document.getElementById('know').open, sel: document.querySelector('.kn-card.sel') ? document.querySelector('.kn-card.sel').dataset.k : '' })); check(r.open && r.sel === 'brewing', 'a click on it opens the tree at brewing'); await page.keyboard.press('Escape'); await frames(1);
    // (the scenarios that follow build things: give the people what the Stone Age knows)
    await ev(() => { const S = __G.sim; __T.teach(S.playerCiv(), 0); __G.select(S.playerCiv().capital); });
  });

  // ---------- turns ----------
  await scenario('laws: the fields and their laws, a reform, a form of government, the estates, a demand', async (check) => {
    await ev(() => { const r = document.getElementById('report-close'); if (r) r.click(); if (TREE.isOpen()) TREE.close(); __T.teach(__G.sim.playerCiv(), 0); }); await page.keyboard.press('Escape'); await frames(2);      // (what the Stone Age knows, as the scenario before leaves it: this one can run by itself)
    let r = await ev(() => { const S = __G.sim, c = S.playerCiv(), Q = S.rule.ruleOf(c); return { tile: document.getElementById('eco-rule').textContent, auth: Math.floor(Q.auth), gov: Q.gov, btn: !!document.getElementById('l-gov'), id: document.getElementById('id-era').textContent }; });
    check(r.btn && r.gov === 'band' && r.tile === String(r.auth) && /Band of kin/.test(r.id), `the top bar shows authority (${r.tile}) and the realm is a ${r.id}`);
    await page.keyboard.press('v'); await frames(3);
    r = await ev(() => { const cards = [...document.querySelectorAll('#gv-laws .gv-card')]; const n = (cls) => cards.filter(b => b.classList.contains(cls)).length; const a = document.activeElement;
      return { open: document.getElementById('gov').open, rows: document.querySelectorAll('#gv-laws .gv-row').length, cards: cards.length, laws: RULE.LAWS.length, on: n('on'), open2: n('can') + n('dear'), later: n('later'), auth: document.getElementById('gv-auth').textContent, now: document.getElementById('gv-now').textContent, h: document.querySelector('#gv-info h3') ? document.querySelector('#gv-info h3').textContent : '', focus: a ? (a.id || a.className) : '', sub: document.getElementById('gv-sub').textContent,
        wide: (() => { const el = document.getElementById('gv-laws'); return el.scrollWidth <= el.clientWidth + 1; })() }; });
    check(r.open && r.rows === 12 && r.cards === r.laws, `V opens the laws: ${r.rows} fields, ${r.cards} laws`); check(r.on === 12 && r.open2 >= 4 && r.later > 50, `one law in force in every field, ${r.open2} within reach, ${r.later} of later ages`);
    check(/authority of 150/.test(r.auth) && /a turn/.test(r.auth) && /None under way/.test(r.now) && r.h.length > 3 && /Band of kin/.test(r.sub), `authority and the reform are shown (${r.auth.trim()}); a law's page is open (${r.h})`); check(!/gv-close/.test(r.focus) && r.wide, 'the keyboard is not on the button that closes the screen, and the list fits its width');
    // a law out of reach of the ruler's authority, then within it
    await ev(() => document.querySelector('#gv-laws .gv-card[data-law="clanland"]').click()); await frames(2);
    r = await ev(() => { const b = document.querySelector('#gv-info [data-gact="begin"]'); return { h: document.querySelector('#gv-info h3').textContent, gives: [...document.querySelectorAll('#gv-info .gv-gives li')].map(li => li.textContent), who: [...document.querySelectorAll('#gv-info .gv-who')].map(w => w.className.replace('gv-who ', '') + ' ' + w.querySelector('span').textContent), dis: b ? b.disabled : null, state: document.querySelector('#gv-info .gv-state').textContent, chips: document.querySelectorAll('#gv-info .kn-chip.known').length }; });
    check(r.h === 'Land of the clans' && r.gives.some(g => /taxes/.test(g)) && r.who.some(w => /^up/.test(w)) && r.who.some(w => /^dn/.test(w)) && r.chips === 1, `its page says what it gives and who gains and loses: ${r.gives.join(' | ')}; ${r.who.join(', ')}`);
    { const w = await ev(() => ({ sway: [...document.querySelectorAll('#gv-info .gv-office span')].map(x => x.textContent), ways: [...document.querySelectorAll('#gv-info [data-ggo]')].map(x => x.dataset.ggo) })); check(w.sway.some(t => /Clan heads ×1\.15/.test(t)) && w.ways.includes('chiefdom'), `and whose hand it strengthens (${w.sway.join(', ')}), and which governments it comes naturally to (${w.ways.join(', ')})`); } check(r.dis === true && /authority/.test(r.state) && /years until/.test(r.state), 'it costs more authority than a new chief has: ' + r.state);
    await ev(() => { const S = __G.sim; S.rule.ruleOf(S.playerCiv()).auth = 100; GOV.render(); }); await frames(2);
    await ev(() => document.querySelector('#gv-info [data-gact="begin"]').click()); await frames(2);
    r = await ev(() => { const S = __G.sim, Q = S.rule.ruleOf(S.playerCiv()); return { reform: Q.reform && Q.reform.key, auth: Q.auth, cls: document.querySelector('#gv-laws .gv-card[data-law="clanland"]').className, now: document.getElementById('gv-now').textContent, toast: window.__toasts.slice(-1)[0] || '', tile: document.getElementById('eco-rule-d').textContent }; });
    check(r.reform === 'clanland' && r.auth < 100 && /soon/.test(r.cls) && /Land of the clans/.test(r.now) && /in force in \d+ years/.test(r.now) && /brought in/.test(r.toast), `the reform is begun and the authority spent (${Math.round(r.auth)} left): ${r.now.trim()}`); check(/yrs/.test(r.tile), 'the top bar counts the years: ' + r.tile);
    await ev(() => { __G.run(125); GOV.render(); }); await frames(3);
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), Q = S.rule.ruleOf(c); return { law: Q.laws.land, cls: document.querySelector('#gv-laws .gv-card[data-law="clanland"]').className, ev: c.events.filter(e => e.type === 'law').map(e => e.text).slice(-1)[0] || '', state: document.querySelector('#gv-info .gv-state').textContent }; });
    check(r.law === 'clanland' && /\bon\b/.test(r.cls) && /Land of the clans/.test(r.ev) && /In force since/.test(r.state), `after its years the law is in force, and the chronicle has it: ${r.ev}`);
    // a law of a later age points to the discovery it stands on
    await ev(() => document.querySelector('#gv-laws .gv-card[data-law="code"]').click()); await frames(1);
    r = await ev(() => ({ state: document.querySelector('#gv-info .gv-state').textContent, link: !!document.querySelector('#gv-info .gv-state [data-kgo="laws"]'), begin: !!document.querySelector('#gv-info [data-gact="begin"]') })); check(r.link && !r.begin && /Needs Written laws/.test(r.state), 'a written code needs written laws, and says so: ' + r.state);
    await ev(() => document.querySelector('#gv-info .gv-state [data-kgo="laws"]').click()); await frames(3);
    r = await ev(() => ({ gov: document.getElementById('gov').open, know: document.getElementById('know').open, sel: (document.querySelector('.kn-card.sel') || { dataset: {} }).dataset.k, lines: [...document.querySelectorAll('#kn-info .kn-gives li')].map(li => li.textContent) }));
    check(!r.gov && r.know && r.sel === 'laws' && r.lines.some(l => /A law of justice: A written code/.test(l)), `the link opens the tree at Written laws, whose page lists what it opens here: ${r.lines.filter(l => /law|government/i.test(l)).join(' | ')}`);
    await ev(() => { TREE.pick('chiefs'); }); await frames(1); await ev(() => document.querySelector('#kn-info [data-ggo="chiefdom"]').click()); await frames(3);
    r = await ev(() => ({ gov: document.getElementById('gov').open, know: document.getElementById('know').open, tab: document.querySelector('#gv-tabs button.on').dataset.gtab, h: document.querySelector('#gv-finfo h3') ? document.querySelector('#gv-finfo h3').textContent : '', cards: document.querySelectorAll('#gv-forms .gv-card').length, forms: RULE.FORMS.length, on: (document.querySelector('#gv-forms .gv-card.on') || { dataset: {} }).dataset.form, ruler: (document.querySelector('#gv-forms .gv-ruler') || { textContent: '' }).textContent, office: document.querySelectorAll('#gv-finfo .gv-office span').length }));
    check(r.gov && !r.know && r.tab === 'form' && r.h === 'Chiefdom' && r.cards === r.forms && r.on === 'band', `and the tree's page of Chieftains leads back to the forms of government (${r.cards} of them; in force: ${r.on})`); check(/Elder/.test(r.ruler) && /chosen by the elders/.test(r.ruler) && r.office >= 2, 'the page says who rules, how rulers follow, and who holds office: ' + r.ruler.trim());
    { const w = await ev(() => [...document.querySelectorAll('#gv-finfo .gv-chips [data-ggo]')].map(x => x.dataset.ggo + (x.classList.contains('known') ? '*' : ''))); check(w.length >= 3 && w.includes('clanland*') && w.includes('bloodprice'), `and the laws that are its own ways (those in force marked): ${w.join(', ')}`); }
    // a chiefdom is proclaimed
    await ev(() => { const S = __G.sim; S.rule.ruleOf(S.playerCiv()).auth = 150; GOV.render(); }); await frames(1); await ev(() => document.querySelector('#gv-finfo [data-gact="begin"]').click()); await frames(2);
    await ev(() => { __G.run(205); GOV.render(); }); await frames(3);
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(); return { gov: c.gov, name: S.fullName(c), title: c.ruler.title, id: document.getElementById('id-name').textContent + ' / ' + document.getElementById('id-era').textContent, on: (document.querySelector('#gv-forms .gv-card.on') || { dataset: {} }).dataset.form, ev: c.events.some(e => /become a chiefdom/.test(e.text)) }; });
    check(r.gov === 'chiefdom' && /Chiefdom|Jarldom/.test(r.name) && r.on === 'chiefdom' && r.ev && /Chiefdom/.test(r.id), `two hundred years on the people are ${r.name} under a ${r.title} (${r.id})`);
    // the estates
    await ev(() => document.querySelector('#gv-tabs [data-gtab="estates"]').click()); await frames(2);
    r = await ev(() => { const es = [...document.querySelectorAll('#gv-estates .gv-estate')]; return { n: es.length, power: es.map(e => parseInt(e.querySelector('.gv-meter b').textContent, 10)).reduce((a, b) => a + b, 0), moods: es.map(e => e.querySelectorAll('.gv-meter b')[1].textContent), why: document.querySelectorAll('#gv-estates .gv-why span').length, first: es[0] ? es[0].querySelector('.gv-ehead b').textContent : '', age: /against your age/i.test(document.getElementById('gv-estates').textContent) }; });
    check(r.n === 7 && r.power >= 96 && r.power <= 104 && r.moods.every(m => /devoted|content|quiet|restless|angry|in revolt/.test(m)) && r.why >= 5 && r.age, `seven estates share the power (${r.power}%), the strongest first (${r.first}); each has a mood (${r.moods.join(', ')}) and reasons`);
    { const w = await ev(() => [...document.querySelectorAll('#gv-estates .gv-src')].map(x => x.textContent.trim())); check(w.some(t => /Chiefdom ×1\.3/.test(t) && /Land of the clans ×1\.15/.test(t)), `and where its power comes from: ${w.join(' | ')}`); }
    // one of them makes a demand
    await ev(() => { const S = __G.sim, c = S.playerCiv(), Q = S.rule.ruleOf(c); Q.demand = { e: RULE.EK.nobles, key: 'bloodprice', since: S.year, until: S.year + 400 }; __G.refreshAll ? __G.refreshAll(true) : GOV.render(); GOV.render(); }); await frames(3);
    r = await ev(() => ({ strip: (document.querySelector('#gv-now .gv-demand') || { textContent: '' }).textContent, tile: document.getElementById('eco-rule-d').textContent })); check(/want\s*Blood-price/.test(r.strip) && /Grant/.test(r.strip) && /Refuse/.test(r.strip), 'the strip shows the demand: ' + r.strip.trim());
    await ev(() => document.querySelector('#gv-now [data-gact="grant"]').click()); await frames(2);
    r = await ev(() => { const S = __G.sim, Q = S.rule.ruleOf(S.playerCiv()); return { law: Q.laws.justice, demand: !!Q.demand, toast: window.__toasts.slice(-1)[0] || '', strip: !!document.querySelector('#gv-now .gv-demand') }; }); check(r.law === 'bloodprice' && !r.demand && !r.strip && /have what they asked for/.test(r.toast), 'granted, it is law at once: ' + r.toast);
    await page.keyboard.press('v'); await frames(2); check(!(await ev(() => document.getElementById('gov').open)), 'V closes the screen');
    // the lens of government on the globe, its key, and the layers' menu beside it (both open above the minimap, and must be painted there)
    await page.keyboard.press('o'); await frames(3);
    r = await ev(() => { const k = document.getElementById('govkey'), b = k.getBoundingClientRect(), at = document.elementFromPoint(b.left + b.width / 2, b.top + 12); return { on: document.getElementById('v-gov').classList.contains('on'), hidden: k.hidden, painted: !!at && k.contains(at), kinds: k.querySelectorAll('i').length, nk: Object.keys(RULE.KINDS).length, shares: [...k.querySelectorAll('b')].map(x => x.textContent).filter(Boolean), lens: __G.globals.uLens.value, pal: __G.world.palMode }; });
    check(r.on && !r.hidden && r.painted && r.kinds === r.nk && r.shares.length >= 1 && r.lens === 1 && r.pal === 'form', `O turns the lens on: realms in the colour of how they are ruled, and a key that says how much of the world each kind holds (${r.shares.join(', ')})`);
    await ev(() => document.getElementById('lensbtn').click()); await frames(2);
    r = await ev(() => { const m = document.getElementById('lensmenu'), k = document.getElementById('govkey'), a = m.getBoundingClientRect(), b = k.getBoundingClientRect(), at = document.elementFromPoint(a.left + a.width / 2, a.top + 14); return { hidden: m.hidden, painted: !!at && m.contains(at), apart: a.right <= b.left + 1 || b.right <= a.left + 1, onScreen: a.left >= 0 && a.top >= 0, btn: !!m.querySelector('#v-gov.on') }; });
    check(!r.hidden && r.painted && r.apart && r.onScreen && r.btn, 'the layers\' menu opens beside the key, with Government lit');
    await ev(() => document.getElementById('lensbtn').click()); await page.keyboard.press('o'); await frames(2);
    r = await ev(() => ({ on: document.getElementById('v-gov').classList.contains('on'), hidden: document.getElementById('govkey').hidden, lens: __G.globals.uLens.value, pal: __G.world.palMode })); check(!r.on && r.hidden && r.lens === 0 && r.pal === 'realm', 'O turns it off again');
  });
  await scenario('turn: Advance runs years, stops on target, shows report', async (check) => {
    // (whatever already waits on the turn button - a flood, a revolt in this world - is seen to first, as a player would)
    await ev(() => { for (let n = 0; n < 10; n++) { const q = __G.attention(); if (!q.length) break; if (q[0].act) q[0].act(); else break; } for (const id of ['chron', 'know', 'gov', 'dip', 'market', 'menu']) { const d = document.getElementById(id); if (d && d.open) d.close(); } const r = document.getElementById('report-close'); if (r && !document.getElementById('report').hidden) r.click(); __G.mapcam.fly = null; }); await frames(2);
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
    // a disaster counts once the turn's first year has run: it is struck from inside the page, on the first frame after
    // that year (asked for from out here it sometimes arrived after the whole turn had run, and interrupted nothing)
    await ev(() => new Promise((res) => { const S = __G.sim; const y0 = S.year; document.getElementById('turn').click(); const f = () => { if (S.year > y0) { const c = S.playerCiv(); S.logEvent(c, 'An earthquake shakes the land in ' + S.fullName(c), true, 'disaster', c.capital); S.quakes.push({ i: c.capital, year: S.year, mag: 7.5 }); S.rubble.set(c.capital, S.year); res(); } else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
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
    await ev(() => { const S = __G.sim; S.playerCiv().wealth = 1e6; const c = S.playerCiv(); __T.teach(c); __G.select(c.capital); });
    const cards = await ev(() => [...document.querySelectorAll('#bgrid .bq')].map(b => ({ k: b.dataset.kind, dis: b.disabled, txt: b.textContent })));
    { const ks = cards.map(c => c.k); const must = ['farm', 'walls', 'port', 'market', 'temple', 'workshop', 'weaver', 'brewery', 'granary', 'wonder', 'capital', 'levy']; check(must.every(k => ks.includes(k)) && ks.indexOf('farm') === 0 && ks.indexOf('levy') === ks.length - 1, 'cards listed: ' + ks.join()); check(!ks.includes('factory') && !ks.includes('refinery') && !ks.includes('lab') && !ks.includes('academy'), 'what a later age will teach is left off the list: ' + ks.join()); }
    check(!cards.find(c => c.k === 'farm').dis && !cards.find(c => c.k === 'walls').dis && !cards.find(c => c.k === 'temple').dis, 'farms, walls and temple are buildable in a village');
    const era = await ev(() => __G.sim.playerCiv().era); const mk = cards.find(c => c.k === 'market'); check(era >= 1 && !mk.dis, 'a people that knows markets can raise one');
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
    check(sc.sites > 0, `building sites drawn (${sc.sites} sites, ${sc.scaffold} scaffold frames: a model with a building-site stage of its own needs none)`);
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
    check(!r.ePolicy && /Diplomacy|War and peace|envoys cannot reach/.test(r.eActions), 'foreign realm: no policy, and the way to its envoys: ' + r.eActions);
    check(r.wTitle === 'Unclaimed land' && r.wCiv, 'wild land: ' + r.wTitle + ' / ' + r.wSub);
    check(r.sTitle === 'Open sea', 'sea: ' + r.sTitle);
  });
  await scenario('inspector: policy sliders, stance, rename, war and peace by the old door', async (check) => {
    const r = await ev(() => { const S = __G.sim; const c = S.playerCiv(); __G.select(c.capital); document.getElementById('policy').open = true; const out = {};
      const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); }; set('pol-tax', 1.6); set('pol-military', 0.5); set('pol-research', 2); out.policy = { ...c.policy };
      document.querySelector('.stance[data-stance="aggressive"]').click(); out.stance = c.policy.stance; out.on = document.querySelector('.stance.on').dataset.stance;
      document.getElementById('in-name').value = 'Renamed'; document.getElementById('btn-rename').click(); out.name = c.name; out.header = document.getElementById('id-name').textContent;
      const e = S.civs.find(x => x && !x.player && x.capital >= 0 && S.owner[x.capital] === x.id && !S.isAtWar(c, x.id) && !((c.truce[x.id] || -1e9) > S.year) && x.dip.lord !== c.id); out.no1 = S.playerWar(e.id); out.war = S.isAtWar(c, e.id); __G.select(e.capital); out.btn = (document.getElementById('btn-dip') || { textContent: '' }).textContent; out.no2 = S.playerWar(e.id); out.peace = !S.isAtWar(c, e.id); return out; });
    check(r.policy.tax === 1.6 && r.policy.military === 0.5 && r.policy.research === 2, 'sliders write policy: ' + JSON.stringify(r.policy)); check(r.stance === 'aggressive' && r.on === 'aggressive', 'stance set'); check(r.name === 'Renamed' && /Renamed/.test(r.header), 'rename updates header: ' + r.header);
    check(r.no1 === null && r.war && /War and peace/.test(r.btn) && r.no2 === null && r.peace, `war, the panel's way to its terms (${r.btn}), then peace as things stand`);
    await ev(() => { document.querySelector('.stance[data-stance="steady"]').click(); });
  });
  await scenario('chronicle modal: tabs, filters, click-to-fly, close', async (check) => {
    await page.keyboard.press('c'); await frames(2);
    let r = await ev(() => ({ open: document.getElementById('chron').open, log: document.querySelectorAll('#log .fe').length, filters: document.querySelectorAll('#logfilters .btn').length }));
    check(r.open, 'chronicle opens with C'); check(r.log > 0, 'log has entries'); check(r.filters === 11, 'eleven filters');
    await ev(() => document.querySelector('#logfilters [data-f="mine"]').click()); const mine = await ev(() => [...document.querySelectorAll('#log .fe')].every(e => e.classList.contains('mine'))); check(mine, 'Mine filter shows only own events');
    await ev(() => document.querySelector('#chron .tabs [data-ctab="powers"]').click()); check((await ev(() => document.querySelectorAll('#powers .pw').length)) > 3, 'powers list');
    await ev(() => document.querySelector('#chron .tabs [data-ctab="graphs"]').click()); await frames(2); check((await ev(() => { const c = document.getElementById('g-world'); return c.width > 0 && c.height > 0; })), 'graphs drawn');
    await ev(() => document.querySelector('#chron .tabs [data-ctab="stats"]').click()); check((await ev(() => document.querySelectorAll('#stats .tile').length)) === 10, 'ten stat tiles');
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
    // (the game once dropped itself to the light setting after a slow start, and stayed there: a setting nobody chose is put back; one chosen by hand is kept)
    { const q = await ev(() => { const keep = localStorage.getItem('genesis-settings'); const out = {}; const st = JSON.parse(keep); st.quality = 'balanced'; st.qualityPinned = false; localStorage.setItem('genesis-settings', JSON.stringify(st)); __G.settings.qualityPinned = false; __G.loadSettings(); out.auto = __G.settings.quality; out.trees = __G.trees.enabled; out.relief = __G.globals.uQuality.value;
        st.qualityPinned = true; localStorage.setItem('genesis-settings', JSON.stringify(st)); __G.loadSettings(); out.chosen = __G.settings.quality; localStorage.setItem('genesis-settings', keep); __G.loadSettings(); out.back = __G.settings.quality; return out; });
      check(q.auto === 'high' && q.trees === true && q.relief === 1, `a light setting nobody chose is put back to full (${q.auto})`); check(q.chosen === 'balanced' && q.back === 'balanced', `one chosen by hand is kept (${q.chosen})`); }
    await ev(() => { const s = document.getElementById('ui-scale'); s.value = 1; s.dispatchEvent(new Event('input')); document.getElementById('opt-glass').click(); document.getElementById('opt-autotilt').click(); const q = document.getElementById('opt-quality'); q.value = 'high'; q.dispatchEvent(new Event('change')); document.getElementById('m-close').click(); });
    check(!(await ev(() => document.getElementById('menu').open)), 'menu closes');
  });

  // ---------- save / load ----------
  await scenario('save/load: save, reload page, continue from the intro, state restored', async (check) => {
    const before = await ev(() => { const S = __G.sim; const c = S.playerCiv(); __G.sim.ruins.set(S.LI[123], { year: S.year - 50, era: 1, culture: 0, R: 200, wonder: 0, name: 'Testruin' }); document.getElementById('btn-menu').click(); document.getElementById('m-save').click(); return { year: S.year, name: c.name, cells: S.cellsOf[c.id], civs: S.st.civCount, lon: __G.mapcam.lon, lat: __G.mapcam.lat, saved: !!localStorage.getItem('genesis-save-v2'), toast: (window.__toasts || []).slice(-1)[0] || [...document.querySelectorAll('.toast')].pop()?.textContent }; });
    check(before.saved, 'save written to localStorage'); check(/saved/i.test(before.toast || ''), 'save toast: ' + before.toast);
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__G && window.__G.sim && document.getElementById('loading').hidden, null, { timeout: 60000 }); await page.evaluate(TC); await installToastLog();
    check(!(await ev(() => document.getElementById('btn-load').hidden)), 'Continue button shown on the intro after a save');
    await ev(() => document.getElementById('btn-load').click()); await wait(800); await page.waitForFunction(() => !__G.mapcam.fly, null, { timeout: 320000 }); await frames(4);      // (from the home screen the camera flies down to where the world was left)
    const after = await ev(() => { const S = __G.sim; const c = S.playerCiv(); return { mode: document.body.dataset.mode, year: S.year, name: c && c.name, cells: c && S.cellsOf[c.id], civs: S.st.civCount, lon: __G.mapcam.lon, lat: __G.mapcam.lat, ruin: S.ruins.get(S.LI[123])?.name, turn: document.getElementById('turn1').textContent, left: document.getElementById('left').classList.contains('open') }; });
    check(after.mode === 'play', 'play mode after load'); check(after.year === before.year, `year ${after.year} == ${before.year}`); check(after.name === before.name, 'player name'); check(Math.abs(after.cells - before.cells) <= 1, `cells ${after.cells} ~ ${before.cells}`); check(after.civs === before.civs, `civs ${after.civs} == ${before.civs}`);
    check(Math.abs(after.lon - before.lon) < 1e-6 && Math.abs(after.lat - before.lat) < 1e-6, 'camera restored'); check(after.ruin === 'Testruin', 'ruins restored');
    // (the turn button is ready: for the next turn, or for envoys who were waiting when the world was saved and still are - they are answered first;
    // anything else that waited on it - scholars waiting for a word, a flood, a prophet - is seen to first, as a player would; the button itself
    // is redrawn with the HUD, so what waits on it is read from the attention list)
    if (after.turn !== 'Advance' && after.turn !== 'Envoys') {
      const q = await ev(() => { const S = __G.sim, c = S.playerCiv(); const t = TREE.tile(); if (t && t.waiting) S.know.mind(c).auto = true;
        for (let n = 0; n < 10; n++) { const a = __G.attention(); if (!a.length || a[0].kind === 'envoy') break; if (a[0].act) a[0].act(); else break; }
        for (const id of ['chron', 'know', 'gov', 'dip', 'market', 'menu']) { const d = document.getElementById(id); if (d && d.open) d.close(); }
        const a = __G.attention(); return a.length ? a[0].t1 : 'Advance'; });
      after.turn = q === 'Advance' || q === 'Envoys' ? q : after.turn + ' (still: ' + q + ')'; await frames(2);
    }
    check(after.turn === 'Advance' || after.turn === 'Envoys', 'turn button ready: ' + after.turn);
    if (after.turn === 'Envoys') { const t = await ev(() => { const S = __G.sim, c = S.playerCiv(); for (const o of [...c.dip.offers]) S.diplo.answer(c, o.id, false); ENVOYS.refresh(); return c.dip.offers.length; }); await frames(4); check(t === 0 && (await state()).t1 === 'Advance', 'envoys answered, the turn button is ready'); }
    // and a turn still runs after loading
    await ev(() => document.getElementById('turn').click()); await page.waitForFunction(() => !__G.turnRun.active, null, { timeout: 300000 }); check((await state()).year > before.year, 'time runs after load');
  });
  await scenario('home: back to the main menu, the saved world shown there, keys, what\'s new, settings, continue', async (check) => {
    const before = await ev(() => { const S = __G.sim; const c = S.playerCiv(); return { year: S.year, name: S.fullName(c), era: c.era }; });
    await ev(() => { document.getElementById('btn-menu').click(); document.getElementById('m-new').click(); }); await frames(3);
    const h = await ev(() => ({ mode: document.body.dataset.mode, intro: !document.getElementById('intro').hidden, cont: !document.getElementById('btn-load').hidden, line: document.getElementById('home-save').textContent, ticks: document.querySelectorAll('#home-eras i').length, now: [...document.querySelectorAll('#home-eras i')].findIndex((i) => i.classList.contains('now')), first: (document.querySelector('.home-menu .hm.first:not([hidden])') || {}).id, version: document.getElementById('home-version').textContent, status: document.getElementById('home-status').hidden, quit: document.getElementById('btn-quit').hidden, upd: document.getElementById('update').hidden, pol: __G.globals.uPolitical.value, locked: __G.mapcam.locked, saved: !!localStorage.getItem('genesis-save-v2'), hud: getComputedStyle(document.getElementById('tl')).display }));
    check(h.mode === 'intro' && h.intro, 'the main menu is shown'); check(h.saved, 'the world was saved on the way'); check(h.cont && h.first === 'btn-load', 'Continue is the first entry'); check(h.line.includes(before.name) && /BC|AD/.test(h.line), 'it names the realm and the year: ' + h.line);
    check(h.ticks === 9 && h.now === before.era, `nine ages, this one marked (${h.ticks}, ${h.now} against ${before.era})`); check(/Holocene \d+\.\d+\.\d+/.test(h.version), 'the version is shown: ' + h.version);
    check(h.status && h.quit && h.upd, 'no update line, no Quit and no update note in a browser'); check(h.pol === 0 && h.locked && h.hud === 'none', 'no realm tints, no HUD, the globe is not steered');
    // keys: down, down, up; Enter with nothing chosen takes the first entry
    await page.keyboard.press('ArrowDown'); const f1 = await ev(() => document.activeElement.id); await page.keyboard.press('ArrowDown'); const f2 = await ev(() => document.activeElement.id); await page.keyboard.press('ArrowUp'); const f3 = await ev(() => document.activeElement.id);
    check(f1 === 'btn-load' && f2 === 'btn-choose' && f3 === 'btn-load', `arrow keys walk the list (${f1}, ${f2}, ${f3})`);
    await ev(() => document.getElementById('btn-news').click()); await frames(2);
    const n = await ev(() => ({ open: document.getElementById('news').open, notes: document.querySelectorAll('#news .note').length, first: (document.querySelector('#news .note h3') || {}).textContent || '', sub: document.getElementById('news-sub').textContent }));
    check(n.open && n.notes > 0 && n.first.length > 5, `what's new lists the notes (${n.notes})`); check(/Version \d/.test(n.sub), 'under its version: ' + n.sub); await ev(() => document.getElementById('news-close').click());
    await ev(() => document.getElementById('btn-settings').click()); await frames(2);
    const m = await ev(() => ({ open: document.getElementById('menu').open, title: document.getElementById('m-title').textContent, game: getComputedStyle(document.querySelector('#menu .ingame')).display, scale: !!document.getElementById('ui-scale').offsetParent }));
    check(m.open && m.title === 'Settings' && m.game === 'none' && m.scale, 'Settings shows the options without the game\'s own buttons'); await ev(() => document.getElementById('m-close').click());
    await ev(() => { if (document.activeElement) document.activeElement.blur(); }); await page.keyboard.press('Enter'); await page.waitForFunction(() => document.body.dataset.mode === 'play' && !__G.mapcam.fly, null, { timeout: 320000 }); await frames(3);
    const a = await ev(() => ({ year: __G.sim.year, name: __G.sim.fullName(__G.sim.playerCiv()), pol: __G.globals.uPolitical.value, locked: __G.mapcam.locked, title: document.getElementById('m-title').textContent })); check(a.year === before.year && a.name === before.name, 'Enter continues the saved world'); check(a.pol === 1 && !a.locked, 'realm tints and steering are back');
  });
  await scenario('home: a new world leaves the saved one alone until it is replaced; cancelling comes back to it', async (check) => {
    await ev(() => { document.getElementById('btn-menu').click(); document.getElementById('m-new').click(); }); await frames(3);
    const s0 = await ev(() => ({ civs: __G.sim.st.civCount, sub: document.getElementById('home-new-s').textContent })); check(s0.civs > 0, 'the home screen shows the saved world'); check(/replaces/.test(s0.sub), 'and says a new world replaces it: ' + s0.sub);
    await ev(() => document.getElementById('btn-choose').click()); await frames(3);
    const s1 = await ev(() => ({ mode: document.body.dataset.mode, civs: __G.sim.st.civCount, player: !!__G.sim.playerCiv(), saved: !!localStorage.getItem('genesis-save-v2') })); check(s1.mode === 'choose' && s1.civs === 0 && !s1.player, `New world begins on an empty Earth (${s1.civs} states)`); check(s1.saved, 'the saved world is still in storage');
    await ev(() => document.getElementById('bannercancel').click()); await frames(3);
    const s2 = await ev(() => ({ mode: document.body.dataset.mode, civs: __G.sim.st.civCount, cont: !document.getElementById('btn-load').hidden })); check(s2.mode === 'intro' && s2.civs > 0 && s2.cont, 'cancelling comes back to the saved world on the home screen');
    await ev(() => document.getElementById('btn-load').click()); await page.waitForFunction(() => document.body.dataset.mode === 'play' && !__G.mapcam.fly, null, { timeout: 320000 }); await frames(3);
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
    // ~1000 km up: realms of a few regions get names, towns do not. (The camera stands over the place the player's own realm is
    // named at, the middle of its land or else its capital, with no panel open: where a grown realm's name falls, and what covers
    // it, is otherwise up to what the scenarios before left behind.)
    await page.keyboard.press('Escape'); await frames(1);
    await ev(() => { __G.mapcam.fly = null; const S = __G.sim, c = S.playerCiv(), ct = __G.world.centroids.get(c.id); let [lon, lat] = __T.capital();
      if (ct && ct.n >= 4) { const l = Math.hypot(ct.x, ct.y, ct.z) || 1, p = GEO.fromVec(new THREE.Vector3(ct.x / l, ct.y / l, ct.z / l)); if (S.owner[__G.cellOf(p[0], p[1])] === c.id) { lon = p[0]; lat = p[1]; } }
      __T.cam(lon, lat, 0.16, 0, 0); }); await wait(600); await frames(8);
    try { await page.waitForFunction(() => document.querySelectorAll('.lbl.realm').length > 0, null, { timeout: 60000 }); } catch (e) {}
    let n = await ev(() => ({ realm: document.querySelectorAll('.lbl.realm').length, city: document.querySelectorAll('.lbl.city:not(.cap)').length, dbg: __G.labelDbg, cells: __G.sim.cellsOf[__G.sim.player] })); check(n.realm > 0, `realm labels from high up (${n.realm}; player has ${n.cells} regions; ${JSON.stringify(n.dbg)})`); check(n.city === 0, 'no town labels from high up (only your capital)');
    await ev(() => { const [lon, lat] = __T.capital(); __T.cam(lon, lat, 0.03, 0.4, 0); }); await wait(600); await frames(8);
    try { await page.waitForFunction(() => document.querySelectorAll('.lbl.city.show').length > 0, null, { timeout: 90000 }); } catch (e) { const d = await ev(() => { const S = __G.sim; const c = S.playerCiv(); return { altKm: __G.mapcam.alt * 6371, capLvl: S.level[c.capital], labelsOn: document.getElementById('v-labels').classList.contains('on'), hud: document.body.classList.contains('hidehud'), lbls: document.querySelectorAll('.lbl').length, mode: document.body.dataset.mode }; }); check(false, 'no city labels appeared: ' + JSON.stringify(d)); }
    // a label that has just lost its place to a better one lingers for two rounds of the layout (six frames), and labels
    // shift while finer ground is still arriving under them (slowly, on the software renderer): look again until they have settled
    const lookAtLabels = () => ev(() => { const els = [...document.querySelectorAll('.lbl.show')]; const r = els.map(e => e.getBoundingClientRect()); let o = 0; const pairs = []; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (r[i].left < r[j].right && r[j].left < r[i].right && r[i].top < r[j].bottom && r[j].top < r[i].bottom) { o++; if (pairs.length < 4) pairs.push([i, j].map(k => `${els[k].className.replace('lbl ', '').replace(' show', '')} "${els[k].textContent.slice(0, 24)}" ${Math.round(r[k].left)},${Math.round(r[k].top)} ${Math.round(r[k].width)}x${Math.round(r[k].height)}`).join(' / ')); }
      return { city: document.querySelectorAll('.lbl.city').length, ruin: document.querySelectorAll('.lbl.ruin').length, overlap: o, pairs }; });
    for (let tries = 0; tries < 8; tries++) { await frames(14); n = await lookAtLabels(); if (n.overlap <= 1) break; }
    check(n.city > 0, 'city labels near the capital (' + n.city + ')'); check(n.overlap <= 1, 'labels do not overlap (' + n.overlap + ' overlaps: ' + n.pairs.join(' | ') + ')');
  });
  await scenario('goods: markers on the map and yields in the inspector', async (check) => {
    // (the nearest good on land where nobody lives, if there is any: a town's name takes the room its good's marker would stand in)
    const g = await ev(() => { const S = __G.sim; const c = S.playerCiv(); const cap = c.capital; const y0 = (cap / 720) | 0, x0 = cap - y0 * 720; let best = -1, bd = 1e9; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const i = (y0 + dy) * 720 + ((x0 + dx + 720) % 720); if (i < 0 || i >= S.N || !S.goods[i] || !S.knows(c, i)) continue; const d = dx * dx + dy * dy + (S.level[i] ? 1000 : 0); if (d < bd) { bd = d; best = i; } } if (best < 0) return { none: true }; const y = (best / 720) | 0, x = best - y * 720; const lon = (x + 0.5) / 720 * 360 - 180, lat = 90 - (y + 0.5) / 360 * 180; __G.mapcam.fly = null; __T.cam(lon, lat, 0.004, 0.5, 0); __G.select(best); return { i: best, good: S.GOODS[S.goods[best]].name, cell: document.getElementById('sel-cell').textContent }; });
    if (g.none) { check(false, 'no goods cell within 6 cells of the capital'); return; }
    check(/Yields/.test(g.cell) && g.cell.includes(g.good), `inspector lists the yield (${g.good}): ` + g.cell.replace(/\s+/g, ' ').slice(0, 80));
    await wait(500); await frames(6);
    try { await page.waitForFunction(() => document.querySelectorAll('.lbl.good').length > 0, null, { timeout: 90000 }); } catch (e) {}
    const n = await ev(() => ({ markers: document.querySelectorAll('.lbl.good').length, withText: [...document.querySelectorAll('.lbl.good')].filter(e => e.textContent.trim()).length, dbg: __G.labelDbg }));
    check(n.markers > 0, `goods markers drawn (${n.markers}; ${JSON.stringify(n.dbg)})`); check(n.withText > 0, 'markers carry the good\'s name this close');
  });
  await scenario('market: the board, a good and its book, a purchase, an order, the tabs', async (check) => {
    // (a market needs somebody to trade with: if no realm lies against the player's land, one is set down there with a few regions of its own)
    await ev(() => { const S = __G.sim, c = S.playerCiv(), W = S.W; const free = (i) => i >= 0 && i < S.N && S.land[i] && !(S.flags[i] & 8) && S.owner[i] < 0 && S.fert[i] > 0.05;
      if (!(S.diplo.reach(c.id).some((id) => S.diplo.touches(c, id)))) { for (const i of S.LI) { if (!free(i) || ![i - 1, i + 1, i - W, i + W].some((j) => S.owner[j] === c.id)) continue; const t = S.spawnTribe(i, {}); if (!t) continue; S.pop[i] = 3; for (const j of [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1]) if (free(j)) { S.owner[j] = t.id; S.pop[j] = 2; } break; } S.recount(); S.touchAll(); }
      // (and it needs peace: a realm at war with the player sells it nothing. Whoever is at war with it makes peace, and the others keep still for the years that follow.)
      const calm = () => { for (const x of S.civs) if (x && x !== c && x.dip) { x.aggression = 0; x.dip.think = 1e12; if (c.dip.ban[x.id]) S.diplo.embargo(c, x, false); if (x.dip.ban[c.id]) S.diplo.embargo(x, c, false); if (c.wars[x.id] !== undefined) S.diplo.conclude(c, x, 'white'); } };
      for (const x of S.civs) if (x && x.tech < 0.2) { x.tech = 0.2; x.era = S.eraOf(x.tech); __T.teach(x); } c.wealth = 1e6; calm(); __G.run(60); calm(); });
    await page.keyboard.press('m'); await frames(3);
    let r = await ev(() => ({ open: document.getElementById('market').open, rows: document.querySelectorAll('#mk-table button.mk-row').length, groups: document.querySelectorAll('#mk-table .mk-group').length, tape: document.querySelectorAll('#mk-tape .mk-roll button').length, figs: document.getElementById('mk-tape').textContent, sub: document.getElementById('mk-sub').textContent, realm: __G.sim.fullName(__G.sim.playerCiv()), purse: document.getElementById('mk-purse').textContent, good: document.querySelector('#mk-good h3') ? document.querySelector('#mk-good h3').textContent : '' }));
    check(r.open, 'M opens the market'); check(r.rows >= 20 && r.groups === 4, `the board lists the goods of the age in four groups (${r.rows} rows, ${r.groups} groups)`); check(r.tape >= 6 && /World product/.test(r.figs), `the tape runs the world's prices (${r.tape} entries)`); check(r.sub.includes(r.realm) && /\d/.test(r.purse), 'the head names the realm and its treasury: ' + r.sub + ' / ' + r.purse); check(r.good.length > 2, 'a good is open: ' + r.good);
    // grain: its page has a drawn chart, figures, what it is for
    await ev(() => MARKET.showGood(__G.sim.GOOD_ID.grain)); await frames(3);
    r = await ev(() => { const cv = document.getElementById('mk-chart'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let ink = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 40) ink++; return { name: document.querySelector('#mk-good h3').textContent, ink, tiles: document.querySelectorAll('#mk-good .mk-tiles > div').length, uses: [...document.querySelectorAll('#mk-good .mk-rc b')].map(b => b.textContent), on: document.querySelector('#mk-table .mk-row.on .nm').textContent, cats: document.querySelector('#mk-good .mk-cats') ? document.querySelector('#mk-good .mk-cats').textContent : '' }; });
    check(r.name === 'Grain' && r.on === 'Grain', 'the row and the page agree: ' + r.name); check(r.ink > 300, `the price chart is drawn (${r.ink} px)`); check(r.tiles === 6, 'six figures for the realm'); check(r.uses.includes('Brewers') && /Food/.test(r.cats), 'the page says what grain is for: ' + r.cats + ' / ' + r.uses.join(', '));
    // filters and sorting
    await ev(() => document.querySelector('#mk-filters [data-f="ours"]').click()); await frames(1); const ours = await ev(() => document.querySelectorAll('#mk-table button.mk-row').length);
    await ev(() => { document.querySelector('#mk-filters [data-f="all"]').click(); document.querySelector('#mk-table .mk-row.head [data-sort="price"]').click(); }); await frames(1);
    r = await ev(() => { const ps = [...document.querySelectorAll('#mk-table button.mk-row')].map(b => parseFloat(b.children[1].textContent.replace(/,/g, ''))).filter(v => isFinite(v)); return { n: ps.length, sorted: ps.every((v, k) => !k || v <= ps[k - 1] + 1e-9), groups: document.querySelectorAll('#mk-table .mk-group').length }; });
    check(ours > 0 && ours < r.n + 40, `"We make" narrows the board (${ours} goods)`); check(r.sorted && r.groups === 0, 'a click on Price sorts dearest first, without the groups');
    await ev(() => document.querySelector('#mk-table .mk-row.head [data-sort="kind"]').click());
    // a purchase for the reserve, a release, a standing order, a ban
    const g = await ev(() => { const S = __G.sim, M = S.market, c = S.playerCiv(); for (let k = 1; k < M.NG; k++) { const b = M.book(c.id, k); if (b.asks.length && b.asks[0].q > 1e-3) { MARKET.showGood(k); return { g: k, name: S.GOODS[k].name, q: b.asks[0].q * 0.5, w: c.wealth }; } } return null; });
    check(!!g, 'something is on offer in the book'); if (g) {
      await ev((q) => { const el = document.getElementById('mk-qty'); el.value = String(q); el.dispatchEvent(new Event('input')); }, g.q); await frames(1);
      const quote = await ev(() => document.getElementById('mk-quote').textContent); check(/would cost/.test(quote), 'a quote before buying: ' + quote);
      await ev(() => document.getElementById('mk-buy').click()); await frames(2);
      r = await ev((gg) => { const S = __G.sim, c = S.playerCiv(), e = S.market.econOf(c); return { res: e.res[gg] || 0, w: c.wealth, text: document.querySelector('#mk-good .mk-res').textContent, toasts: window.__toasts.slice(-1)[0] || '' }; }, g.g);
      check(r.res > 0 && r.w < g.w, `bought ${g.name} for the reserve (${r.res.toFixed(3)} lots, ${(g.w - r.w).toFixed(2)} coin)`); check(/Bought/.test(r.toasts), 'the purchase is announced: ' + r.toasts); check(/Reserve/.test(r.text) && !/Reserve 0$/.test(r.text.trim()), 'the page shows the reserve: ' + r.text);
      await ev((q) => { const el = document.getElementById('mk-qty'); el.value = String(q); el.dispatchEvent(new Event('input')); document.getElementById('mk-release').click(); }, r.res * 0.5); await frames(2);
      const after = await ev((gg) => __G.sim.market.econOf(__G.sim.playerCiv()).res[gg] || 0, g.g); check(after < r.res && after > 0, `half of it released at home (${after.toFixed(3)} left)`);
      await ev(() => { document.getElementById('mk-od-q').value = '0.5'; document.getElementById('mk-od-p').value = '99999'; document.getElementById('mk-od-add').click(); }); await frames(2);
      r = await ev(() => ({ n: __G.sim.market.econOf(__G.sim.playerCiv()).orders.length, shown: document.querySelectorAll('#mk-good .mk-od').length })); check(r.n === 1 && r.shown === 1, 'a standing order is placed and listed');
      await ev(() => document.querySelector('#mk-good [data-cancel]').click()); await frames(1); check(await ev(() => __G.sim.market.econOf(__G.sim.playerCiv()).orders.length) === 0, 'and cancelled');
      await ev(() => document.getElementById('mk-nox').click()); check(await ev((gg) => __G.sim.market.econOf(__G.sim.playerCiv()).noX.includes(gg), g.g), 'an export ban is set from the page'); await ev(() => document.getElementById('mk-nox').click());
    }
    // the other tabs
    await ev(() => document.querySelector('#mk-tabs [data-mtab="trade"]').click()); await frames(2);
    r = await ev(() => { const sl = document.getElementById('mk-cust'); sl.value = '0.2'; sl.dispatchEvent(new Event('input')); return { tiles: document.querySelectorAll('#mk-trade .mk-tiles > div').length, cust: __G.sim.market.econOf(__G.sim.playerCiv()).customs, shown: document.getElementById('mk-cust-v').textContent, rows: document.querySelectorAll('#mk-trade .mk-prow:not(.head)').length, hint: document.getElementById('mk-trade').textContent.includes('No merchants reach you') }; });
    check(r.tiles === 4 && r.cust === 0.2 && r.shown === '20%', `the customs are set from the Trade tab (${r.shown})`); check(r.rows > 0 || r.hint, `partners are listed, or the page says how to get some (${r.rows} partners)`);
    await ev(() => document.querySelector('#mk-tabs [data-mtab="works"]').click()); await frames(2);
    r = await ev(() => ({ inds: document.querySelectorAll('#mk-works .mk-ind').length, lines: document.querySelectorAll('#mk-works .mk-wrow:not(.head)').length, hands: document.querySelector('#mk-works .mk-tiles b').textContent })); check(r.inds === 10 && r.lines > 2 && /%/.test(r.hands), `the Workshops tab lists what towns can raise and the lines of work (${r.lines} lines, hands ${r.hands})`);
    await ev(() => document.querySelector('#mk-tabs [data-mtab="ledger"]').click()); await frames(2);
    r = await ev(() => ({ rows: document.querySelectorAll('#mk-ledger .mk-lrow').length, wants: document.querySelectorAll('#mk-ledger .mk-want').length, net: document.querySelector('#mk-ledger .mk-lrow.sum b').textContent, income: __G.sim.playerCiv().income })); check(r.rows >= 8 && r.wants >= 10, `the Ledger has the treasury's year and how the people live (${r.rows} rows, ${r.wants} bars)`); check(Math.abs(parseFloat(r.net.replace(/[^\d.\-]/g, '')) - Math.abs(r.income)) < Math.max(0.6, Math.abs(r.income) * 0.02), `its net is the realm's income (${r.net} vs ${r.income.toFixed(2)})`);
    await page.keyboard.press('Escape'); await frames(2); check(!(await ev(() => document.getElementById('market').open)), 'Esc closes it');
    // the top bar and the bottom bar
    r = await ev(() => { __G.run(1); return { live: document.getElementById('eco-live').textContent, movers: document.getElementById('movers').hidden ? -1 : document.querySelectorAll('#movers button').length }; }); check(/^\d+%$/.test(r.live), 'the top bar says how the people live: ' + r.live); check(r.movers >= -1, 'movers on the bottom bar: ' + r.movers);
    await ev(() => document.getElementById('l-market').click()); await frames(2); check(await ev(() => document.getElementById('market').open), 'the Market button opens it too'); await ev(() => MARKET.close());
  });
  await scenario('market: workshops are raised from the town panel and stand on their plot', async (check) => {
    await ev(() => { const S = __G.sim; const c = S.playerCiv(); c.wealth = 1e6; S.pop[c.capital] = Math.max(S.pop[c.capital], 40); __G.run(1); __G.select(c.capital); }); await frames(2);
    await ev(() => document.querySelector('.bq[data-kind="workshop"]').click()); await frames(3);
    let r = await ev(() => ({ banner: document.getElementById('bannertext').textContent, plots: document.querySelectorAll('#plots .plot').length })); check(/Place the workshops/.test(r.banner) && r.plots === 12, 'placing the workshops: ' + r.banner);
    await ev(() => { const el = [...document.querySelectorAll('#plots .plot')].find(p => !p.classList.contains('used')); el.click(); }); await frames(2);
    r = await ev(() => { const S = __G.sim; const c = S.playerCiv(); const w = S.inProgress(c.capital, 'workshop'); return { slot: w ? w.slot : -1, queue: document.getElementById('bqueue').textContent, eff: S.eff[c.id * 8] }; }); check(r.slot >= 0 && /Workshops · plot/.test(r.queue), `the workshops are going up on plot ${r.slot + 1}: ` + r.queue); const eff0 = r.eff;      // (what the crafts make without them: the realm's laws and estates have their say in it too)
    await ev(() => { const S = __G.sim; const c = S.playerCiv(); __G.run(S.durOf('workshop', c.era) + 2); __G.select(c.capital); }); await frames(2);
    r = await ev(() => { const S = __G.sim; const c = S.playerCiv(); const L = TOWN.layout(S, c.capital, c, {}); return { at: S.indAt(c.capital, 'workshop'), eff: S.eff[c.id * 8], item: L.items.some(it => it.as === 'workshop'), card: document.querySelector('.bq[data-kind="workshop"]').textContent, taken: L.plots.filter(p => p.used).length }; });
    check(r.at > 0 && r.eff > eff0 * 1.2, `the workshops stand and make the crafts cheaper (${r.eff.toFixed(2)}×, from ${eff0.toFixed(2)}×)`); check(r.item, 'the planner draws them'); check(/Already built/.test(r.card), 'the card says they are built'); check(r.taken >= 1, 'their plot is taken');
    await ev(() => MARKET.open('works')); await frames(2); const n = await ev(() => document.querySelector('#mk-works .mk-ind.has b').textContent); check(n === '1', 'the Workshops tab counts them: ' + n); await ev(() => MARKET.close());
  });
  await scenario('diplomacy: realms and what they think, a pact, a gift, a claim, war and peace, envoys, the lens', async (check) => {
    // two neighbours are set down beside the player's land, and everyone is given the Iron Age's knowledge (this scenario can run by itself)
    await ev(() => { const r = document.getElementById('report-close'); if (r) r.click(); if (TREE.isOpen()) TREE.close(); if (GOV.isOpen()) GOV.close(); });
    let r = await ev(() => { const S = __G.sim, c = S.playerCiv(), D = S.diplo, W = S.W; const free = (i) => i >= 0 && i < S.N && S.land[i] && !(S.flags[i] & 8) && S.owner[i] < 0 && S.fert[i] > 0.05; const mine = (i) => S.owner[i] === c.id;
      const made = []; for (const i of S.LI) { if (made.length >= 2) break; if (!free(i) || ![i - 1, i + 1, i - W, i + W].some(mine) || made.some(t => S.cellDist(t.capital, i) < 3)) continue; const t = S.spawnTribe(i, {}); if (t) made.push(t); }
      // (by now the world may have closed in round the player's land: then room is made on its border, at the cost of whoever holds it)
      for (const i of S.LI) { if (made.length >= 2) break; const o = S.owner[i]; if (o < 0 || o === c.id || !S.land[i] || (S.flags[i] & 8) || S.fert[i] <= 0.05 || S.civs[o].capital === i || ![i - 1, i + 1, i - W, i + W].some(mine) || made.some(t => t.id === o || S.cellDist(t.capital, i) < 3)) continue; S.owner[i] = -1; const t = S.spawnTribe(i, {}); if (t) made.push(t); else S.owner[i] = o; }
      const iron = S.ERAS[2][1] + 0.01; for (const x of made) { x.tech = iron; x.era = S.eraOf(iron); __T.teach(x, 2, true); x.aggression = 0; x.dip.think = 1e12; x.ruler.trait = 'steward'; }
      for (const k of ['laws', 'markets', 'envoys', 'kingship']) S.know.learn(c.id, c, KNOW.ID[k], true);      // (the player's people are taught only what treaties stand on: the scenarios after this one find them as they were)
      for (const k of Object.keys(c.wars)) { const e = S.civs[+k]; if (e) D.conclude(c, e, 'white'); } c.truce = {}; for (const t of made) t.truce = {};
      S.recount(); S.touchAll(); c.wealth = 5000; window.__dip = made.map(t => t.id); D.remember(made[0], c.id, 40); __G.run(1); S.touchAll();
      return { made: made.length, reach: D.reach(c.id).filter(id => made.some(t => t.id === id)).length, touch: made.every(t => D.touches(c, t.id)), btn: !!document.getElementById('l-dip') }; });
    check(r.made === 2 && r.reach === 2 && r.touch && r.btn, `two neighbours within reach of the player's envoys (${JSON.stringify(r)})`);
    // the screen: F opens it; the realms, what they think and why
    await page.keyboard.press('f'); await frames(3);
    r = await ev(() => { const rows = [...document.querySelectorAll('#dp-list .dp-row')]; return { open: document.getElementById('dip').open, rows: rows.length, mine: window.__dip.every(id => rows.some(b => +b.dataset.dsel === id)), word: document.getElementById('dp-word').textContent, tabs: [...document.querySelectorAll('#dp-tabs button')].map(b => b.textContent.trim()).join('|'), groups: [...document.querySelectorAll('#dp-list .dp-grp')].map(b => b.textContent).join('|'), filters: document.querySelectorAll('#dp-list [data-dfilter]').length }; });
    check(r.open && r.rows >= 2 && r.mine, `F opens Diplomacy with the realms within reach (${r.rows} rows)`); check(/^50/.test(r.word) && /ordinary/.test(r.word), 'the player\'s word is shown: ' + r.word); check(r.tabs === 'Realms|Envoys|Wars|Your standing' && r.filters === 5 && /On your borders/.test(r.groups), `tabs, filters and groups (${r.tabs}; ${r.groups})`);
    await ev(() => document.querySelector(`#dp-list .dp-row[data-dsel="${window.__dip[0]}"]`).click()); await frames(2);
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), a = S.civs[window.__dip[0]]; const info = document.getElementById('dp-info'); const props = [...info.querySelectorAll('.dp-prop')].map(p => ({ name: p.querySelector('b').textContent, st: p.querySelector('.st').textContent, off: p.classList.contains('off'), dis: p.querySelector('button').disabled }));
      return { name: info.querySelector('h3').textContent, full: S.fullName(a), mood: info.querySelector('.dp-mood b').textContent, o: S.diplo.opinion(a, c), why: [...info.querySelectorAll('.gv-sect .gv-why span')].slice(0, 9).map(x => x.textContent).join('; '), props, gifts: info.querySelectorAll('[data-dact="gift"]').length, war: !!info.querySelector('[data-dact="war"]'), causes: [...info.querySelectorAll('.dp-cause b')].map(x => x.textContent).join('|'), none: /Nothing is sworn/.test(info.textContent) }; });
    check(r.name === r.full && r.mood === (await ev((o) => DIPLO.moodOf(o), r.o)), `a realm's page: ${r.name}, ${r.mood} (${Math.round(r.o)})`); check(/Old favours \+\d+/.test(r.why) && /shared border −\d/.test(r.why), 'with the reasons: ' + r.why);
    { const nap = r.props.find(p => p.name === 'Sworn peace'), al = r.props.find(p => p.name === 'Alliance'), mar = r.props.find(p => p.name === 'Royal marriage');
      check(nap && /They would agree/.test(nap.st) && !nap.dis, 'a sworn peace would be agreed: ' + (nap && nap.st)); check(al && /They would (agree|refuse)/.test(al.st), 'an alliance is weighed: ' + (al && al.st)); check(mar && /ruled by blood/.test(mar.st) && mar.dis, 'a marriage needs two houses: ' + (mar && mar.st)); }
    check(r.gifts >= 2 && r.war && /No cause/.test(r.causes) && r.none, `gifts, a war with its reasons (${r.causes}), and nothing sworn yet`);
    // a pact
    await ev(() => document.querySelector('#dp-info .dp-prop [data-dact="propose"][data-k="nap"]').click()); await frames(2);
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), a = S.civs[window.__dip[0]]; const info = document.getElementById('dp-info'); return { has: S.diplo.has(c, a.id, 'nap'), line: [...info.querySelectorAll('.dp-line')].map(x => x.textContent).join(' / '), badge: !!document.querySelector(`#dp-list .dp-row[data-dsel="${a.id}"] .dp-bd.nap`), grp: document.querySelector('#dp-list .dp-grp').textContent, toast: (window.__toasts || []).slice(-1)[0] || '', again: !![...info.querySelectorAll('.dp-prop b')].find(b => b.textContent === 'Sworn peace') }; });
    check(r.has && /Sworn peace until/.test(r.line) && r.badge && /Sworn to you/.test(r.grp) && !r.again, `proposed and agreed: ${r.line}`); check(/agrees/.test(r.toast), 'and said so: ' + r.toast);
    // a gift
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), a = S.civs[window.__dip[1]]; ENVOYS.show(a.id); const o0 = S.diplo.opinion(a, c), w0 = c.wealth; const b = document.querySelector('#dp-info [data-dact="gift"]'); const coin = +b.dataset.k; b.click(); return { coin, paid: w0 - c.wealth, up: S.diplo.opinion(a, c) - o0 }; }); await frames(2);
    check(r.paid === r.coin && r.up > 0, `a gift of ${r.coin} coin buys ${r.up.toFixed(1)} of goodwill`);
    // a claim, then a war with that reason, seen from the wars' list and ended as things stand
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), b = S.civs[window.__dip[1]]; const w0 = c.wealth; document.querySelector('#dp-info [data-dact="claim"]').click(); const info = document.getElementById('dp-info');
      return { paid: w0 - c.wealth, cost: S.diplo.claimCost(c, b), causes: [...info.querySelectorAll('.dp-cause')].map(x => x.querySelector('b').textContent + (x.classList.contains('sel') ? '*' : '')).join('|'), cost0: [...info.querySelectorAll('.gv-gives li')].map(x => x.textContent).join(' / ') }; }); await frames(2);
    check(r.paid === r.cost && /^A claim\*/.test(r.causes), `a claim costs ${r.paid} coin and is the first reason offered (${r.causes})`); check(/Nobody at home or abroad holds it against you/.test(r.cost0) && /fight alone|Beside you/.test(r.cost0), 'a war with a reason costs nothing: ' + r.cost0);
    await ev(() => document.querySelector('#dp-info [data-dact="war"]').click()); await frames(2);
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), b = S.civs[window.__dip[1]]; const info = document.getElementById('dp-info'); return { war: S.isAtWar(c, b.id), goal: c.dip.goal[b.id], score: !!info.querySelector('.dp-score'), terms: [...info.querySelectorAll('.dp-prop')].map(p => p.querySelector('b').textContent + ': ' + p.querySelector('.st').textContent).join(' / '), grp: document.querySelector('#dp-list .dp-grp').textContent, sub: document.getElementById('dp-sub').textContent }; });
    check(r.war && r.goal === 'claim' && r.score && /At war with you/.test(r.grp) && /at war with/i.test(r.sub), 'war is declared, and the page turns to the war'); check(/Peace as things stand: They would accept/.test(r.terms), 'with the terms on which it could end: ' + r.terms);
    await ev(() => document.querySelector('#dp-tabs [data-dtab="wars"]').click()); await frames(2);
    r = await ev(() => ({ wars: document.querySelectorAll('#dp-wars .dp-war').length, mine: document.querySelectorAll('#dp-wars .dp-war.mine').length, text: (document.querySelector('#dp-wars .dp-war') || { textContent: '' }).textContent }));
    check(r.wars >= 1 && r.mine === 1 && /A claim/.test(r.text) && /attacks/.test(r.text) && /defends/.test(r.text), 'the wars of the known world, the player\'s first: ' + r.text.slice(0, 120));
    await ev(() => { ENVOYS.show(window.__dip[1]); }); await frames(2); await ev(() => document.querySelector('#dp-info [data-dact="sue"][data-k="white"]').click()); await frames(2);
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), b = S.civs[window.__dip[1]]; return { war: S.isAtWar(c, b.id), line: [...document.querySelectorAll('#dp-info .dp-line')].map(x => x.textContent).join(' / '), no: document.querySelector('#dp-info .gv-sect:last-child').textContent }; });
    check(!r.war && /A truce until/.test(r.line) && /truce holds/i.test(r.no), 'peace as things stand, and a truce: ' + r.line);
    // envoys: what another realm proposes waits on the player: among what the turn button lays before him, and on the tab
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), a = S.civs[window.__dip[0]]; ENVOYS.close(); S.diplo.remember(a, c.id, 40); const no = S.diplo.propose(a, c, 'trade'); const q = __G.attention(), it = q.find((x) => x.kind === 'envoy'); return { no, n: c.dip.offers.length, t1: it ? it.t1 : '', t2: it ? it.t2 : '', at: q.indexOf(it) + 1, len: q.length }; });
    check(r.no === null && r.n === 1 && r.t1 === 'Envoys' && /proposes a trade agreement/.test(r.t2), `envoys wait on the player: ${r.t1} · ${r.t2} (${r.at} of ${r.len} things that wait)`);
    await ev(() => { __G.attention().find((x) => x.kind === 'envoy').act(); }); await frames(3);      // (what a press of the turn button does when their turn comes)
    r = await ev(() => ({ open: document.getElementById('dip').open, tab: document.querySelector('#dp-tabs button.on').textContent.trim(), n: (document.querySelector('#dp-tabs .dp-n') || { textContent: '' }).textContent, card: (document.querySelector('#dp-envoys .dp-offer') || { textContent: '' }).textContent }));
    check(r.open && /^Envoys/.test(r.tab) && r.n === '1' && /proposes a trade agreement/.test(r.card) && /half the customs/.test(r.card), 'the turn button leads to them: ' + r.card.slice(0, 140));
    await ev(() => document.querySelector('#dp-envoys [data-dact="answer"][data-v="yes"]').click()); await frames(2);
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), a = S.civs[window.__dip[0]]; return { has: S.diplo.has(c, a.id, 'trade'), left: c.dip.offers.length, empty: /No envoys wait on you/.test(document.getElementById('dp-envoys').textContent), log: document.querySelector('#dp-envoys .dp-log').textContent }; });
    check(r.has && r.left === 0 && r.empty && /open their markets/.test(r.log), 'accepted: the agreement is in force and in the record');
    // where the player stands
    await ev(() => document.querySelector('#dp-tabs [data-dtab="standing"]').click()); await frames(2);
    r = await ev(() => ({ stats: [...document.querySelectorAll('#dp-standing .dp-stat b')].map(b => b.textContent.trim()).join(' | '), sworn: document.getElementById('dp-standing').textContent }));
    check(/ordinary/.test(r.stats) && /coin a year/i.test(r.stats) && /Sworn peace with/.test(r.sworn) && /Trade agreement with/.test(r.sworn) && /Truces/.test(r.sworn), 'the player\'s standing: ' + r.stats);
    await page.keyboard.press('f'); await frames(2); check(!(await ev(() => document.getElementById('dip').open)), 'F closes it');
    // the knowledge tree says what a discovery opens between realms
    r = await ev(() => { const L = KNOW.LIST, g = (k) => TREE.givesOf(L[KNOW.ID[k]]).join(' | ').replace(/<[^>]+>/g, ''); return { envoys: g('envoys'), laws: g('laws'), kingship: g('kingship') }; });
    check(/Your envoys can propose: Defensive pact, Alliance/.test(r.envoys) && /Sworn peace/.test(r.laws) && /a claim/.test(r.laws) && /Royal marriage/.test(r.kingship) && /bend the knee/.test(r.kingship), 'a discovery\'s page says what it opens between realms: ' + r.envoys.slice(0, 90));
    // the realm's panel on the map, and the lens of relations
    r = await ev(() => { const S = __G.sim, a = S.civs[window.__dip[0]]; __G.select(a.capital); return { kv: document.getElementById('sc-kv').textContent, btn: (document.getElementById('btn-dip') || { textContent: '' }).textContent }; });
    check(/With you/.test(r.kv) && /sworn peace/.test(r.kv) && r.btn === 'Diplomacy', 'the realm\'s panel says how it stands with you: ' + r.btn);
    await ev(() => document.getElementById('btn-dip').click()); await frames(2); r = await ev(() => ({ open: document.getElementById('dip').open, name: document.querySelector('#dp-info h3').textContent, full: __G.sim.fullName(__G.sim.civs[window.__dip[0]]) })); check(r.open && r.name === r.full, 'and leads to its page'); await ev(() => ENVOYS.close());
    await page.keyboard.press('x'); await frames(6);
    r = await ev(() => { const k = document.getElementById('govkey'); return { on: document.getElementById('v-rel').classList.contains('on'), mode: __G.world.palMode, lens: __G.globals.uLens.value, key: !k.hidden, text: k.textContent, gov: document.getElementById('v-gov').classList.contains('on') }; });
    check(r.on && r.mode === 'rel' && r.lens === 1 && r.key && /How the world stands with you/.test(r.text) && /Friends/.test(r.text) && !r.gov, 'X turns on the lens of relations, with its key');
    await page.keyboard.press('o'); await frames(3); r = await ev(() => ({ mode: __G.world.palMode, rel: document.getElementById('v-rel').classList.contains('on'), text: document.getElementById('govkey').textContent })); check(r.mode === 'form' && !r.rel && /How the world is governed/.test(r.text), 'one lens at a time: O swaps it for the lens of government');
    await page.keyboard.press('o'); await frames(3); r = await ev(() => ({ mode: __G.world.palMode, key: document.getElementById('govkey').hidden, lens: __G.globals.uLens.value })); check(r.mode === 'realm' && r.key && r.lens === 0, 'and off again');
    await ev(() => { __G.select(__G.sim.playerCiv().capital); });
  });
  await scenario('armies: a levy takes the field, its banner and card, a march on an enemy town, a siege and its fall, the key, halt and home', async (check) => {
    // a neighbour with one walled town, set down beside the player's land, and war with it (this scenario can run by itself)
    await ev(() => { const r = document.getElementById('report-close'); if (r) r.click(); if (TREE.isOpen()) TREE.close(); if (GOV.isOpen()) GOV.close(); if (ENVOYS.isOpen()) ENVOYS.close(); });
    let r = await ev(() => { const S = __G.sim, c = S.playerCiv(), D = S.diplo, W = S.W; const mine = (i) => S.owner[i] === c.id;
      let foe = null; for (const i of S.LI) { if (foe) break; if (!S.land[i] || (S.flags[i] & 8) || S.owner[i] >= 0 || S.fert[i] <= 0.05 || ![i - 1, i + 1, i - W, i + W].some(mine)) continue; foe = S.spawnTribe(i, {}); }
      for (const i of S.LI) { if (foe) break; const o = S.owner[i]; if (o < 0 || o === c.id || !S.land[i] || (S.flags[i] & 8) || S.civs[o].capital === i || ![i - 1, i + 1, i - W, i + W].some(mine)) continue; S.owner[i] = -1; foe = S.spawnTribe(i, {}); if (!foe) S.owner[i] = o; }
      if (!foe) return { foe: false };
      const cap = foe.capital; S.level[cap] = Math.max(S.level[cap], 1); S.walls[cap] = 1; S.pop[cap] = 1.5; foe.aggression = 0; foe.dip.think = 1e12; foe.truce = {};
      for (const k of Object.keys(c.wars)) { const e = S.civs[+k]; if (e) D.conclude(c, e, 'white'); } c.truce = {};
      S.know.learn(c.id, c, KNOW.ID.chiefs, true); S.pop[c.capital] = Math.max(S.pop[c.capital], 20); c.wealth = Math.max(c.wealth, 5000); S.recount(); S.touchAll();
      for (const a of S.army.of(c.id)) S.army.disband(a.id); c.army = Math.min(c.army || 0, S.year);      // (a levy raised by an earlier scenario goes home first)
      D.declare(c, foe, 'none'); window.__war = foe.id; window.__warCap = cap;
      const msg = S.act('levy', c.capital); const hs = S.army.of(c.id);
      return { foe: true, war: S.isAtWar(c, foe.id), msg, hosts: hs.length, men: hs[0] ? hs[0].men : 0, again: S.cannot('levy', c.capital) }; });
    check(r.foe && r.war, 'a neighbour to make war on'); check(/takes the field/.test(r.msg) && r.hosts === 1 && r.men >= 40, `the levy takes the field: ${r.msg}`); check(/already in the field/.test(r.again), 'one levy at a time: ' + r.again);
    // its banner, over the capital: the player's own, in gold; a click on it opens the host's card
    await ev(() => { const [lon, lat] = __T.capital(); __T.cam(lon, lat, 0.004, 0.6, 0); }); await wait(300); await frames(4);
    r = await ev(() => ({ mine: document.querySelectorAll('#hosts .hostb.mine').length, text: (document.querySelector('#hosts .hostb.mine') || { textContent: '' }).textContent }));
    check(r.mine === 1 && /\d/.test(r.text), `a banner for the player's host (${r.text})`);
    await ev(() => document.querySelector('#hosts .hostb.mine').click()); await frames(2);
    r = await ev(() => { const a = __G.sim.army.byId(__G.hostSel); return { open: !document.getElementById('hostcard').hidden, title: document.getElementById('hc-title').textContent, name: a ? a.name : '', tiles: [...document.querySelectorAll('#hc-tiles .tile .micro')].map(x => x.textContent).join('|'), acts: !document.getElementById('hc-acts').hidden, sub: document.getElementById('hc-sub').textContent }; });
    check(r.open && r.title === r.name && r.acts && /yours/.test(r.sub), `the banner opens its card: ${r.title} · ${r.sub}`); check(r.tiles === 'Men|Spirit|Arms|Years left', 'with its men, spirit, arms and years: ' + r.tiles);
    // March: the button asks where; a click on the enemy's town sends the host there, and its road is drawn
    await ev(() => document.getElementById('hc-march').click()); await frames(1);
    r = await ev(() => ({ banner: document.getElementById('banner').hidden ? '' : document.getElementById('bannertext').textContent, on: document.getElementById('hc-march').classList.contains('on') }));
    check(r.on && /Click where your host should march/.test(r.banner), 'March asks where to: ' + r.banner);
    await ev(() => { const [lon, lat] = __G.sim.army.cellLL(window.__warCap); __T.cam(lon, lat, 0.01, 0, 0); }); await wait(300); await frames(3);
    { const vp = page.viewportSize(); await page.mouse.click(vp.width / 2, vp.height / 2); } await frames(3);
    r = await ev(() => { const S = __G.sim, a = S.army.byId(__G.hostSel); return { goal: a.goal, cap: window.__warCap, state: a.state, path: a.path.length, road: __G.troops.road.geometry.drawRange.count, toast: (window.__toasts || []).slice(-1)[0] || '', banner: document.getElementById('banner').hidden, card: document.getElementById('hc-state').textContent }; });
    check(r.goal === r.cap && r.state === 'march' && r.path > 0, `the host marches on the enemy's town (${r.state}, ${r.path} regions; ${r.toast})`); check(r.road > 0 && r.banner, `its road is drawn (${r.road} marks) and the question is gone`); check(/Marching on/.test(r.card) && /to go/.test(r.card), 'the card says so: ' + r.card);
    // the years: it comes to the walls, lays siege, and the town falls to it
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), id = __G.hostSel, cap = window.__warCap; let siege = 0, years = 0; const kinds = new Set();
      for (; years < 40 && S.owner[cap] !== c.id; years++) { __G.run(1); const a = S.army.byId(id); if (!a) break; if (a.state === 'siege') siege++; }
      for (const n of S.army.news) kinds.add(n.kind); const a = S.army.byId(id); const att = __G.attention().find((x) => x.t1 === 'Host'), last = S.army.news[S.army.news.length - 1];
      return { years, siege, taken: S.owner[cap] === c.id, kinds: [...kinds].join(','), alive: !!a, at: a ? a.cell : -1, cap, log: c.events.slice(-20).map(e => e.text || e).join(' / '), att: att ? att.t2 : '', last: last ? last.text : '' }; });
    check(r.siege > 0 && r.taken, `the host lays siege to the walled town and takes it (${r.siege} years of siege, ${r.years} years in all)`); check(/siege/.test(r.kinds) && /taken/.test(r.kinds), 'what befell the host is news: ' + r.kinds);
    check(r.alive && /after a siege/.test(r.log), 'the chronicle tells of the town it took'); check(r.att && r.att === r.last, 'the turn button lays the last of it before the player: ' + r.att);
    // Y finds the host; Halt stops a march; Home ends the levy
    await ev(() => { document.getElementById('hc-x').click(); }); await frames(1); check(await ev(() => __G.hostSel < 0 && document.getElementById('hostcard').hidden), 'the card closes');
    await page.keyboard.press('y'); await frames(2);
    r = await ev(() => ({ sel: __G.hostSel, mine: (__G.sim.army.of(__G.sim.player)[0] || {}).id, fly: !!__G.mapcam.fly, open: !document.getElementById('hostcard').hidden })); check(r.sel === r.mine && r.open && r.fly, 'Y selects the host and flies to it');
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), a = S.army.byId(__G.hostSel); const why = S.army.order(a.id, c.capital); document.getElementById('hc-halt').click(); return { why, state: a.state, path: a.path.length, goal: a.goal }; });
    check(r.why === null && r.state === 'camp' && r.path === 0 && r.goal === -1, 'Halt: the host makes camp where it stands');
    await ev(() => document.getElementById('hc-home').click()); await frames(2);
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(); return { hosts: S.army.of(c.id).length, card: document.getElementById('hostcard').hidden, again: S.cannot('levy', c.capital), fleet: S.cannot('fleet', c.capital), toast: (window.__toasts || []).slice(-1)[0] || '' }; });
    check(r.hosts === 0 && r.card && r.again === null, `Home: the levy is over and may be raised again (${r.toast})`); check(/Needs|harbour/.test(r.fleet), 'a fleet needs shipwrights and a harbour: ' + r.fleet);
    await ev(() => { __G.select(__G.sim.playerCiv().capital); });
  });
  await scenario('peoples: who lives where, the lens of peoples with its key and names, a realm\'s peoples', async (check) => {
    await ev(() => { const r = document.getElementById('report-close'); if (r) r.click(); if (TREE.isOpen()) TREE.close(); if (GOV.isOpen()) GOV.close(); if (ENVOYS.isOpen()) ENVOYS.close(); });
    // the player's land is his people's; a neighbour's region taken is of another people, and the realm's panel says so
    let r = await ev(() => { const S = __G.sim, c = S.playerCiv(), P = S.people, W = S.W; const mine = (i) => S.owner[i] === c.id;
      let other = -1; for (const i of S.LI) { const o = S.owner[i]; if (o >= 0 && o !== c.id && P.ppl[i] && P.ppl[i] !== P.ruling[c.id] && [i - 1, i + 1, i - W, i + W].some(mine) && S.civs[o].capital !== i) { other = i; break; } }
      if (other < 0) { for (const i of S.LI) { if (S.owner[i] < 0 && S.land[i] && !(S.flags[i] & 8) && [i - 1, i + 1, i - W, i + W].some(mine)) { const t = S.spawnTribe(i, {}); if (t && P.ruling[t.id] !== P.ruling[c.id]) { other = i; break; } } } }
      const was = other >= 0 ? P.ppl[other] : 0; if (other >= 0) { S.claim(other, c, -1); S.pop[other] = Math.max(S.pop[other], 3); } S.recount(); for (let y = 0; y < 5; y++) S.tick();
      __G.select(c.capital); const kv = document.getElementById('sc-kv').textContent, cell = document.getElementById('sel-cell').textContent;
      return { mine: P.ruling[c.id], name: P.nameOf(P.ruling[c.id]), other, was, kept: other >= 0 && P.ppl[other] === was, kv, cell, share: P.foreignShare[c.id] }; });
    check(r.mine > 0 && new RegExp('Who\\s*the ' + r.name).test(r.cell), `the capital's people: the ${r.name}`); check(r.kept, 'a region taken keeps its own people');
    check(/Peoples/.test(r.kv) && r.kv.includes(r.name), 'the realm lists its peoples: ' + (r.kv.match(/Peoples(.{0,80})/) || ['', ''])[1]);
    // the lens: I paints the peoples, with a key of the largest and their names across their lands
    await ev(() => { const [lon, lat] = __T.capital(); __T.cam(lon, lat, 0.55, 0, 0); }); await wait(300); await frames(3);
    await page.keyboard.press('i'); await frames(6); for (let k = 0; k < 30 && !(await ev(() => document.querySelectorAll('.lbl.folk.show').length)); k++) await frames(1);      // (a label shows once two rounds have found room for it)
    r = await ev(() => { const k = document.getElementById('govkey'), W = __G.world; return { on: document.getElementById('v-ppl').classList.contains('on'), mode: W.palMode, lens: __G.globals.uLens.value, key: !k.hidden, text: k.textContent, rows: k.querySelectorAll('i').length, folk: document.querySelectorAll('.lbl.folk').length, pal: W.palData[__G.sim.people.ruling[__G.sim.player] * 4 + 3] }; });
    check(r.on && r.mode === 'people' && r.lens === 1 && r.key && /The world's peoples: \d+ in \d+ families/.test(r.text) && r.rows >= 3 && r.pal === 255, `I turns on the lens of peoples, with its key (${r.text.slice(0, 60)})`);
    check(r.folk > 0, `and the peoples' names across their lands (${r.folk})`);
    await page.keyboard.press('x'); await frames(3); r = await ev(() => ({ mode: __G.world.palMode, ppl: document.getElementById('v-ppl').classList.contains('on'), folk: document.querySelectorAll('.lbl.folk').length })); check(r.mode === 'rel' && !r.ppl, 'one lens at a time: X swaps it for relations');
    await page.keyboard.press('x'); await frames(3); r = await ev(() => ({ mode: __G.world.palMode, key: document.getElementById('govkey').hidden })); check(r.mode === 'realm' && r.key, 'and off again');
    await ev(() => { __G.select(__G.sim.playerCiv().capital); });
  });
  await scenario('faiths: a prophet, founding a faith with its tenets, taking up another, missionaries, the lens of faiths', async (check) => {
    await ev(() => { const r = document.getElementById('report-close'); if (r) r.click(); if (TREE.isOpen()) TREE.close(); if (GOV.isOpen()) GOV.close(); if (ENVOYS.isOpen()) ENVOYS.close(); });
    // a prophet arises in the player's realm: the attention list calls him, and the Faith page founds his faith with the tenets chosen
    let r = await ev(() => { const S = __G.sim, c = S.playerCiv(), F = S.faith; if (F.state[c.id]) F.gone(c.id); c.religion = null; F.prophet(c.id, c.capital, 'prophet'); S.faithNews();
      const att = __G.attention ? __G.attention() : []; return { pending: F.pending[c.id], cap: c.capital, att: att.map((a) => a.t1 + ': ' + a.t2) }; });
    check(r.pending === r.cap, 'a prophet arises in the player\'s capital and waits for him'); check(r.att.some((t) => /prophet/i.test(t)), 'the attention list calls him: ' + (r.att.find((t) => /prophet/i.test(t)) || r.att.join(' | ')).slice(0, 90));
    await ev(() => GOV.openFaith('new')); await frames(2);
    r = await ev(() => ({ open: GOV.isOpen(), tab: document.querySelector('#gv-tabs button.on').dataset.gtab, tenets: document.querySelectorAll('#gv-fthinfo .gv-tenet').length, dis: document.querySelector('#gv-fthinfo [data-gact="f-found"]').disabled, name: document.getElementById('gv-fname').value }));
    check(r.open && r.tab === 'faith' && r.tenets === 8 && r.dis && r.name.length > 3, `the Faith page offers eight tenets and a name (${r.name}); founding waits for two tenets`);
    await page.click('#gv-fthinfo .gv-tenet[data-tenet="mission"]'); await page.click('#gv-fthinfo .gv-tenet[data-tenet="alms"]'); await frames(1);
    await page.fill('#gv-fname', 'the Way of the Test'); await frames(1);
    r = await ev(() => ({ on: [...document.querySelectorAll('#gv-fthinfo .gv-tenet.on')].map((b) => b.dataset.tenet).join(), dis: document.querySelector('#gv-fthinfo [data-gact="f-found"]').disabled })); check(r.on === 'mission,alms' && !r.dis, 'two tenets chosen: ' + r.on);
    await page.click('#gv-fthinfo [data-gact="f-found"]'); await frames(2);
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), F = S.faith, f = F.state[c.id]; return { f, name: F.nameOf(f), tenets: f ? F.list[f].tenets.join() : '', relig: c.religion, head: (document.querySelector('#gv-fthinfo h3') || {}).textContent || '', mine: document.querySelector('#gv-faiths .gv-frow.sel') ? document.querySelector('#gv-faiths .gv-frow.sel').textContent : '' }; });
    check(r.f > 0 && r.name === 'the Way of the Test' && r.tenets === 'mission,alms' && r.relig === r.name && /Way of the Test/i.test(r.head), `founded: ${r.name}, with ${r.tenets}; its page is shown`);
    // another faith around: its page, and taking it up for authority
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(), F = S.faith; const nb = S.diplo.reach(c.id).map((b) => S.civs[b]).filter((b) => b && b !== c);
      const o = nb[0] || S.civs.find((b) => b && b !== c); const g = F.found(o.id, o.capital, { world: true, tenets: ['peace', 'monks'] }); S.faithNews(); S.rule.ruleOf(c).auth = 150; GOV.openFaith(g); return { g, name: F.nameOf(g), who: S.fullName(o) }; }); await frames(2);
    let q = await ev(() => ({ head: (document.querySelector('#gv-fthinfo h3') || {}).textContent || '', can: !!document.querySelector('#gv-fthinfo [data-gact="f-adopt"]:not([disabled])'), text: document.getElementById('gv-fthinfo').textContent }));
    check(/teaching|ism|church|creed/i.test(q.head) && q.can && /Missionaries|Monks|Peace/.test(q.text), `another faith's page, with its tenets and a way to take it up: ${q.head}`);
    await page.click('#gv-fthinfo [data-gact="f-adopt"]'); await frames(2);
    q = await ev(() => { const S = __G.sim, c = S.playerCiv(); return { f: S.faith.state[c.id], auth: S.rule.ruleOf(c).auth, mis: document.querySelectorAll('#gv-fthinfo [data-gact="f-mission"]').length }; });
    check(q.f === r.g && q.auth < 150, `taken up for authority (${Math.round(150 - q.auth)}): ${r.name}`);
    if (q.mis) { await ev(() => { __G.sim.playerCiv().wealth = 9999; GOV.render(); }); await frames(1); await page.click('#gv-fthinfo [data-gact="f-mission"]:not([disabled])'); await frames(2);
      const m = await ev(() => { const S = __G.sim, c = S.playerCiv(); return { to: S.faith.missionTo[c.id], txt: document.getElementById('gv-fthinfo').textContent }; }); check(m.to >= 0 && /missionaries are in/i.test(m.txt), 'and sends missionaries: ' + (m.txt.match(/missionaries are in [^.]*/i) || [''])[0]); }
    await ev(() => GOV.close());
    // the panels: the region keeps a faith (a holy city is marked), the realm its faith and its people's
    r = await ev(() => { const S = __G.sim, c = S.playerCiv(); __G.select(c.capital); return { cell: document.getElementById('sel-cell').textContent, kv: document.getElementById('sc-kv').textContent }; });
    check(/Faith/.test(r.cell) && /holy city/.test(r.cell), 'the capital\'s panel: its faith, and that it is a holy city'); check(/Faith/.test(r.kv), 'the realm\'s panel: ' + (r.kv.match(/Faith(.{0,70})/) || ['', ''])[1]);
    // the lens: J paints the faiths, with a key, their names across their lands and the holy cities (the realm's land of its faith, as the state would carry it in time)
    await ev(() => { const S = __G.sim, c = S.playerCiv(), F = S.faith; for (const i of S.LI) if (S.cellDist(i, c.capital) < 7 && S.pop[i] > 0.02 && !F.holyAt.has(i)) { F.fth[i] = F.state[c.id]; } const [lon, lat] = __T.capital(); __T.cam(lon, lat, 0.55, 0, 0); }); await wait(300); await frames(3);
    await page.keyboard.press('j'); await frames(6); for (let k = 0; k < 30 && !(await ev(() => document.querySelectorAll('.lbl.faith.show, .lbl.holy.show').length)); k++) await frames(1);
    r = await ev(() => { const k = document.getElementById('govkey'), W = __G.world; return { on: document.getElementById('v-fth').classList.contains('on'), mode: W.palMode, key: !k.hidden, text: k.textContent, labels: document.querySelectorAll('.lbl.faith, .lbl.holy').length }; });
    check(r.on && r.mode === 'faith' && r.key && /The world's faiths: \d+ in \d+ families/.test(r.text), `J turns on the lens of faiths, with its key (${r.text.slice(0, 70)})`);
    check(r.labels > 0, `and the faiths' names and holy cities on the map (${r.labels})`);
    await page.keyboard.press('j'); await frames(3); r = await ev(() => ({ mode: __G.world.palMode, key: document.getElementById('govkey').hidden })); check(r.mode === 'realm' && r.key, 'and off again');
    await ev(() => { __G.select(__G.sim.playerCiv().capital); });
  });
  await scenario('hover: plot chip over land and sea', async (check) => {
    await ev(() => { const [lon, lat] = __T.capital(); __T.cam(lon, lat, 0.004, 0.5, 0); }); await wait(500); await frames(5);
    const vp = page.viewportSize(); await page.mouse.move(vp.width / 2, vp.height / 2); await wait(120); await page.mouse.move(vp.width / 2 + 3, vp.height / 2 + 3); await wait(120);
    const r = await ev(() => ({ hidden: document.getElementById('hover').hidden, text: document.getElementById('hover').textContent })); check(!r.hidden && /People|Elevation|Realm/.test(r.text), 'hover chip over the capital: ' + r.text.slice(0, 80));
  });

  // ---------- layouts ----------
  await scenario('layout: from 800x500 to 1920x1080 the HUD stays inside the viewport and the launchers clear of the minimap', async (check) => {
    for (const vp of [{ width: 800, height: 500 }, { width: 1160, height: 700 }, { width: 1920, height: 1080 }]) {      // (1160: just wide enough for the launchers' names, where they come nearest the minimap)
      await page.setViewportSize(vp); await wait(300); await frames(3); await ev(() => { document.getElementById('l-build').click(); __G.select(__G.sim.playerCiv().capital); }); await frames(2);
      const r = await ev(() => { const ids = ['tl', 'tr', 'left', 'bl', 'bc', 'br', 'turn', 'minimapbox']; const out = []; for (const id of ids) { const el = document.getElementById(id); if (!el || getComputedStyle(el).display === 'none') continue; const b = el.getBoundingClientRect(); if (b.width === 0) continue; if (b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1) out.push(`${id} ${Math.round(b.left)},${Math.round(b.top)}-${Math.round(b.right)},${Math.round(b.bottom)}`); } const a = document.getElementById('left').getBoundingClientRect(), d = document.getElementById('bc').getBoundingClientRect(); const overlap = a.left < d.right && d.left < a.right && a.top < d.bottom && d.top < a.bottom;
        // (the bar of launchers stops short of the minimap and the turn button, and none of its names is cut off)
        const bar = document.getElementById('bl').getBoundingClientRect(); let meets = ''; for (const id of ['minimapbox', 'turn']) { const el = document.getElementById(id); if (!el || getComputedStyle(el).display === 'none') continue; const b = el.getBoundingClientRect(); if (b.width && bar.right > b.left - 4 && bar.bottom > b.top && bar.top < b.bottom) meets += `${id} at ${Math.round(b.left)}, the bar to ${Math.round(bar.right)}; `; }
        const cut = [...document.querySelectorAll('#bl .btn')].filter((b) => b.scrollWidth > b.clientWidth + 1).length, n = document.querySelectorAll('#bl .btn').length;
        return { out, overlap, meets, cut, n, w: innerWidth }; });
      check(r.out.length === 0, `${vp.width}px: elements outside viewport: ${r.out.join('; ')}`); check(!r.overlap, `${vp.width}px: inspector overlaps the dock`); check(!r.meets && !r.cut && r.n >= 9, `${vp.width}px: the ${r.n} launchers stop short of the minimap, none cut off (${r.meets || 'clear'}${r.cut ? r.cut + ' cut' : ''})`);
      await ev(() => document.getElementById('l-build').click());
    }
    await page.setViewportSize({ width: 1024, height: 640 }); await wait(300);
  });

  // ---------- the sky ----------
  await scenario('sky: the stars stand where they stood, the Moon and the clouds are there, the eye can be lifted to them', async (check) => {
    await page.waitForFunction(() => window.SKY && SKY.ready.stars && SKY.ready.clouds && SKY.ready.moon && SKY.ready.milkyway, null, { timeout: 60000 }).catch(() => {});
    const r = await ev(() => { const S = window.SKY, W = __G.world, out = { ready: Object.keys(S.ready).join(' '), stars: W.starField.n, india: 0, sahara: 0 };
      // (the picture's cloud over a country, its mean: a point of it may well lie in a gap between two storms)
      const mean = (l0, l1, b0, b1) => { let a = 0, n = 0; for (let l = l0; l <= l1; l += 1) for (let b = b0; b <= b1; b += 1) { a += S.cloudAt(l, b, 0); n++; } return a / n; };
      out.india = mean(72, 88, 15, 28); out.sahara = mean(0, 20, 18, 28);
      const star = (h, d) => { const a = h * 15 * Math.PI / 180, e = d * Math.PI / 180; return new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), -Math.cos(e) * Math.sin(a)); }, deg = (x) => Math.acos(Math.min(1, Math.max(-1, x))) * 180 / Math.PI;
      // where the pole of the sky stands among the stars of 2000: by the Pole Star now, by Thuban when the pyramids were built, a hand's breadth from Vega in the world's first year
      const m = new THREE.Matrix4(), x = new THREE.Vector3(1, 0, 0), off = (y, v) => { S.turn(x, 0.25, y, m); return deg(v.clone().applyMatrix4(m).y); };
      out.polaris = off(2000, star(2.530, 89.264)); out.thuban = off(-2787, star(14.073, 64.376)); out.vega = off(-10000, star(18.616, 38.784));
      // the sun's own place among the stars is where the sun is: at the solstice of June at six hours, as far north as it goes
      const sun = GEO.toVec(40, Math.asin(0.4) * 180 / Math.PI); S.turn(sun, 0.5, 2000, m); out.sun = deg(star(6, Math.asin(0.4) * 180 / Math.PI).applyMatrix4(m).dot(sun));
      // and half a year on the same hour of the day has the other half of the sky: a star that stood south at midnight stands there at noon
      const sun2 = GEO.toVec(40, -Math.asin(0.4) * 180 / Math.PI); S.turn(sun2, 0.0, 2000, m); out.sunWinter = deg(star(18, -Math.asin(0.4) * 180 / Math.PI).applyMatrix4(m).dot(sun2));
      // the Moon: opposite the sun when full, beside it when new, never far from the sun's path
      const mo = new THREE.Vector3(); S.turn(sun, 0.5, 2000, m); out.full = deg(S.moonAt(sun, m.ecl, Math.PI, mo).dot(sun)); out.fresh = deg(S.moonAt(sun, m.ecl, 0.001, mo).dot(sun)); out.offPath = Math.abs(90 - deg(S.moonAt(sun, m.ecl, 1.3, mo).dot(m.ecl)));
      return out; });
    check(/stars/.test(r.ready) && /clouds/.test(r.ready) && /moon/.test(r.ready) && /milkyway/.test(r.ready), 'the pack is here: ' + r.ready); check(r.stars > 8000, 'the stars the eye can see: ' + r.stars);
    check(r.india > 0.3 && r.sahara < 0.2, `cloud over India in the monsoon (${r.india.toFixed(2)}), little over the Sahara (${r.sahara.toFixed(2)})`);
    check(r.polaris < 1 && r.thuban < 0.6 && r.vega > 10 && r.vega < 15, `the pole: ${r.polaris.toFixed(2)} from the Pole Star now, ${r.thuban.toFixed(2)} from Thuban in 2787 BC, ${r.vega.toFixed(1)} from Vega in 10,000 BC`);
    check(r.sun < 0.05 && r.sunWinter < 0.05, `the sun stands among the stars where the year puts it (${r.sun.toFixed(3)}, ${r.sunWinter.toFixed(3)} degrees off)`);
    check(r.full > 170 && r.fresh < 6 && r.offPath < 5.5, `the Moon: full ${r.full.toFixed(0)} degrees from the sun, new ${r.fresh.toFixed(1)}, ${r.offPath.toFixed(1)} off the sun's path`);
    // from far out the clouds are the Earth's; from the ground the sky's; and the eye is lifted to them and comes down again
    await ev(() => { const [lon, lat] = __T.capital(); __T.cam(lon, lat, 2.5, 0, 0); }); await wait(400); await frames(4);
    const far = await ev(() => { const C = __G.world.cloudLayer; return { vis: C.mesh.visible, below: C.uniforms.uBelow.value, op: C.uniforms.uOpacity.value }; }); check(far.vis && far.below === 0 && far.op > 0.99, 'clouds from orbit: ' + JSON.stringify(far));
    await ev(() => { const [lon, lat] = __T.capital(); __T.cam(lon, lat, 0.0003, 1.3, 0); }); await wait(600); await frames(4);
    const low = await ev(() => { const C = __G.world.cloudLayer; return { vis: C.mesh.visible, below: C.uniforms.uBelow.value, op: C.uniforms.uOpacity.value }; }); check(low.vis && low.below === 1 && low.op > 0.99, 'clouds from the ground: ' + JSON.stringify(low));
    await ev(() => { const M = __G.mapcam; M.autoTilt = false; M.tTilt = 1.4; for (let i = 0; i < 12; i++) M.tiltBy(0.06); }); await wait(900); await frames(4);
    const up = await ev(() => { const M = __G.mapcam, c = __G.camera, d = new THREE.Vector3(); c.getWorldDirection(d); return { tilt: M.tilt, lift: M.lift, el: Math.asin(d.dot(c.position.clone().normalize())) * 180 / Math.PI, gl: __G.renderer.getContext().getError() }; });
    check(up.tilt > 1.44 && up.lift > 0.5 && up.el > 20, `the eye lifted to the sky: ${up.el.toFixed(0)} degrees above the level`); check(up.gl === 0, 'no GL error: ' + up.gl);
    await page.keyboard.press('u'); await wait(900); await frames(3);
    for (let k = 0; k < 40 && !(await ev(() => __G.mapcam.lift < 0.02 && __G.mapcam.tilt < 0.05)); k++) await frames(1);      // (the camera eases there frame by frame: slow frames take more of them)
    const dn = await ev(() => ({ tilt: __G.mapcam.tilt, lift: __G.mapcam.lift })); check(dn.lift < 0.02 && dn.tilt < 0.05, `U looks straight down again (tilt ${dn.tilt.toFixed(3)}, lift ${dn.lift.toFixed(3)})`);
  });

  // ---------- rendering sweep ----------
  await scenario('heights: two bytes a texel, Everest at 8,800 m and more, every level agrees with the one above', async (check) => {
    const r0 = await ev(() => { const T = __G.terrain, H = T.heights; return { have: !!H, top: H ? H.maxLevel : -1, levels: H ? Object.keys(H.levels).length : 0, steps: H ? Object.values(H.levels).map((l) => l.step).join(' ') : '' }; });
    check(r0.have && r0.top === 7 && r0.levels === 8, `the heights are here, levels 0 to ${r0.top} (steps ${r0.steps} m)`);
    await ev(() => { __G.mapcam.fly = null; __T.cam(86.925, 27.988, 0.004, 0.0, 0); });
    // (Everest's own pack, 7/47/11: a pack of level 7 elsewhere - the capital's - is often there first)
    await page.waitForFunction(() => { for (const p of __G.terrain.packs.values()) if (p.kind === 'e' && p.L === 7 && p.px === 47 && p.py === 11 && p.state === 'ready') return true; return false; }, null, { timeout: 120000 }).catch(() => {});
    const r = await ev(() => {
      const T = __G.terrain, out = { at: [], old: 0, top: 0 };
      for (let l = 0; l <= 7; l++) out.at.push(Math.round(T.rawHeight(86.925, 27.988, l)));
      for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) out.top = Math.max(out.top, T.rawHeight(86.925 + dx * 0.0015, 27.988 + dy * 0.0015, 7));
      for (const p of T.packs.values()) if (p.kind === 'e' && Array.isArray(p.info)) out.old++;
      return out; });
    check(r.top > 8500 && r.top < 9300, `the top of Everest at level 7: ${Math.round(r.top)} m (the Earth's 8,849 m, 2.8 % taller, over 306 m)`);
    check(r.at[7] > 7000 && r.at[5] > 5000, `under its summit, level by level: ${r.at.join(', ')} m`);
    check(r.old === 0, `no old pack drawn (${r.old})`);
    // (no country coarser than it was: wherever the old packs had level 6 or 7, so do the heights; and every pack has its rim)
    const c = await ev(() => { const T = __G.terrain, H = T.heights, E = T.index.elev, out = { miss: [], apron: H.apron };
      for (const L of [6, 7]) for (const [x, y] of E['l' + L] || []) { const l = H.levels[L]; if (l.packs[y * l.nx + x] !== 'P') out.miss.push(`${L}/${x}/${y}`); }
      return out; });
    check(c.miss.length === 0, `the old packs' levels 6 and 7 all kept (${c.miss.join(' ') || 'none missing'})`); check(c.apron === 2, `a rim of ${c.apron} texels`);
  });

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
      const r = await ev(([lon, lat, cul]) => { const S = __G.sim; const i = (() => { const x = Math.floor((lon + 180) / 360 * 720), y = Math.floor((90 - lat) / 180 * 360); return y * 720 + x; })(); let c = S.civs[S.owner[i]]; if (!c) { c = S.land[i] ? S.spawnTribe(i, {}) : null; for (let d = 1; d <= 6 && !c; d++) for (let dy = -d; dy <= d && !c; dy++) for (let dx = -d; dx <= d && !c; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const j = i + dy * 720 + dx; if (j < 0 || j >= S.N || !S.land[j]) continue; c = S.owner[j] >= 0 ? S.civs[S.owner[j]] : S.spawnTribe(j, {}); } } if (c && S.land[i] && TOWN.CULTURES[TOWN.civCulture(S, c)] !== cul) { S.owner[i] = -1; c = S.spawnTribe(i, {}) || c; }      // (an empire from elsewhere may hold the place by now: the test wants a people of the place itself)
      if (!c) return { none: true }; c.tech = 0.45; S.pop[c.capital] = 30; __G.run(3); __G.world.refreshTextures(); const [sl, sa] = __G.world.siteOf(c.capital); __T.cam(sl + 0.003, sa - 0.003, 0.0003, 1.0, 0.4); return { culture: TOWN.CULTURES[TOWN.civCulture(S, c)], cap: c.capital }; }, [lon, lat, cul]);
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
