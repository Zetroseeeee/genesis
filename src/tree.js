// Holocene knowledge screen (classic script; exposes window.TREE): the discoveries laid out age by age and branch by
// branch, what each gives and stands on, what the realm is studying and has queued, and where it stands against its
// age and the world. It reads the simulation's knowledge (sim.know, know.js) and calls its few actions: study,
// enqueue, dequeue, and whether the scholars choose for themselves.
window.TREE = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  // a glyph for each branch, 24 x 24
  const BICON = {
    land: 'M12 21V8M12 8c0-3 2-5 5-5 0 3-2 5-5 5zM12 13c0-3-2-5-5-5 0 3 2 5 5 5zM12 17c0-3 2-5 5-5 0 3-2 5-5 5z',
    craft: 'M14 4l6 6-3 3-6-6zM12.500 8.500L4 17l3 3 8.500-8.500',
    trade: 'M12 4v16M7 20h10M5 8h14M5 8l-2.500 6h5zM19 8l-2.500 6h5z',
    war: 'M12 3l2 3v9h-4V6zM8 15h8M12 15v6',
    state: 'M4 18h16l1-10-5 4-4-7-4 7-5-4z',
    mind: 'M12 6c-2-1.500-5-2-8-2v14c3 0 6 .500 8 2 2-1.500 5-2 8-2V4c-3 0-6 .500-8 2zM12 6v14',
  };
  // discoveries that have a good for their sign (the market's glyphs); the rest wear their branch's
  const GICON = { farming: 'grain', herding: 'cattle', fishing: 'fish', pottery: 'pottery', weaving: 'cloth', quarrying: 'stone', brewing: 'beer', horse: 'horses', orchards: 'wine', mining: 'gold', copper: 'copper', bronze: 'bronze', jewellery: 'jewellery', iron: 'iron', glass: 'glass', shipbuilding: 'ships', coinage: 'silver', paper: 'paper', cotton: 'cotton', silk: 'silk', gunpowder: 'gunpowder', distilling: 'spirits', firearms: 'guns', coal: 'coal', steam: 'machinery', steel: 'steel', rubber: 'rubber', drilling: 'oil', refining: 'fuel', polymers: 'plastics', electrification: 'aluminium', combustion: 'vehicles', fission: 'uranium', materials: 'lithium', semiconductors: 'electronics' };
  const glyph = (D) => { const g = GICON[D.key]; const path = g && window.MARKET && MARKET.ICON[g] ? MARKET.ICON[g] : BICON[KN().BRANCHES[D.branch].key]; return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="${path}"/></svg>`; };
  // what an edge is, in the player's words
  const pc = (v) => (v >= 0 ? '+' : '−') + Math.round(Math.abs(v) * 100) + '%';
  const CRAFT = { c_crafts: 'potters, tanners and other craftsmen', c_metal: 'smiths', c_textile: 'weavers', c_food: 'brewers and millers', c_ship: 'shipwrights', c_heavy: 'heavy industry', c_chem: 'chemical works', c_tech: 'electronics works' };
  const YIELD = { y_crop: 'crops', y_herd: 'herds', y_fish: 'fisheries', y_wood: 'forests', y_mine: 'mines and quarries', y_well: 'wells' };
  const EDGE = { food: 'food from the land', grow: 'growth of your people', income: 'taxes', research: 'insight', strength: 'strength in arms', stab: 'stability', build: 'cheaper works', health: 'health: fewer die in a plague', trade: 'goods your merchants carry', reach: 'reach of the capital', sea: 'range of your ships', siege: 'against walls', defence: 'strength of your walls' };
  const edgeName = (k) => EDGE[k] || (CRAFT[k] ? 'work of ' + CRAFT[k] : YIELD[k] ? 'yield of ' + YIELD[k] : k);
  const edgeLine = (k, v) => k === 'build' ? `Works cost ${Math.round(v * 100)}% less` : `${pc(v)} ${edgeName(k)}`;
  const CAN = { quarry: 'Quarries, saltworks and flint mines can be opened', ores: 'Mines can be sunk for ores', colonies: 'Your ships can plant colonies across the sea', faith: 'A faith of your own can arise' };

  let ctx = null, tab = 'tree', sel = null, built = false, lastSig = '', pos = null, fitH = 0;
  const S = () => ctx.sim(); const KN = () => window.KNOW; const K = () => S().know;
  const me = () => { const s = S(); return s ? s.playerCiv() : null; };
  const ins = (t) => Math.round(t * KN().UNIT).toLocaleString();
  const perYear = (c) => { const p = S().insightParts(c); return p.total + p.taught; };      // its own learning, and what its neighbours teach it
  const yrs = (n) => !isFinite(n) ? 'never' : n === 0 ? 'at once' : n >= 1000 ? Math.round(n / 100) / 10 + 'k yrs' : n + (n === 1 ? ' yr' : ' yrs');

  // ----- the layout: ages left to right, each in a few columns by what stands on what; branches top to bottom -----
  const CW = 184, GX = 38, EPAD = 20, HEAD = 40, GUT = 132; let CH = 44, GY = 6, RPAD = 10;
  // a card's height, the gap under it and a branch's padding: the roomiest of these that lets every branch stand in the window
  const FITS = [[44, 6, 10], [42, 5, 9], [40, 5, 8], [38, 4, 7]];
  function fitFor(avail) { let L = null; for (const f of FITS) { [CH, GY, RPAD] = f; L = layout(); if (!(avail > 0) || L.H <= avail) break; } return L; }
  function layout() {
    const L = KN().LIST, NE = KN().NE, NB = KN().BRANCHES.length; const rank = new Int8Array(L.length).fill(-1);
    const eraRanks = new Array(NE).fill(2);
    // first the discoveries that stand on something of their own age: one column further than what they stand on
    const rankOf = (d) => { if (rank[d] >= 0) return rank[d]; let r = 0; for (const n of L[d].need) if (L[n].era === L[d].era) r = Math.max(r, rankOf(n) + 1); rank[d] = r; return r; };
    for (const D of L) { rankOf(D.id); if (rank[D.id] + 1 > eraRanks[D.era]) eraRanks[D.era] = rank[D.id] + 1; }
    // then those that stand on nothing of their age are spread over the columns left of what they lead to, where there is most room
    const cells = new Map(); const key = (e, r, b) => e * 1000 + r * 10 + b; const put = (D, r) => { const k = key(D.era, r, D.branch); const a = cells.get(k) || []; a.push(D.id); cells.set(k, a); rank[D.id] = r; };
    for (const D of L) if (rank[D.id] > 0) put(D, rank[D.id]);
    for (const D of L) { if (rank[D.id] !== 0) continue; let lim = eraRanks[D.era]; for (const x of D.leads) if (L[x].era === D.era) lim = Math.min(lim, rank[x] > 0 ? rank[x] : lim); let best = 0, bn = 1e9; for (let r = 0; r < Math.max(1, lim); r++) { const n = (cells.get(key(D.era, r, D.branch)) || []).length; if (n < bn) { bn = n; best = r; } } put(D, best); }
    // (a discovery moved right must stay left of what stands on it in its age)
    for (let pass = 0; pass < 3; pass++) for (const D of L) for (const n of D.need) if (L[n].era === D.era && rank[n] >= rank[D.id]) { const a = cells.get(key(D.era, rank[D.id], D.branch)); a.splice(a.indexOf(D.id), 1); put(D, rank[n] + 1); if (rank[D.id] + 1 > eraRanks[D.era]) eraRanks[D.era] = rank[D.id] + 1; }
    const rowN = new Array(NB).fill(1); for (const [k, a] of cells) { const b = k % 10; if (a.length > rowN[b]) rowN[b] = a.length; }
    const rowY = [], rowH = []; let y = HEAD + 8; for (let b = 0; b < NB; b++) { rowY.push(y); rowH.push(rowN[b] * (CH + GY) - GY + RPAD * 2); y += rowH[b]; }
    const eraX = [], eraW = []; let x = 0; for (let e = 0; e < NE; e++) { eraX.push(x); eraW.push(eraRanks[e] * (CW + GX) - GX + EPAD * 2); x += eraW[e]; }
    const at = new Array(L.length);
    for (const [k, a] of cells) { const e = Math.floor(k / 1000), r = Math.floor((k % 1000) / 10), b = k % 10; const h = a.length * (CH + GY) - GY; const y0 = rowY[b] + (rowH[b] - h) / 2; a.forEach((d, j) => { at[d] = { x: eraX[e] + EPAD + r * (CW + GX), y: y0 + j * (CH + GY) }; }); }
    return { at, eraX, eraW, rowY, rowH, W: x, H: y + 10 };
  }

  // ----- the frame -----
  function init(c) {
    ctx = c;
    $('kn-close').addEventListener('click', close);
    document.querySelectorAll('#kn-tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.ktab)));
    $('know').addEventListener('close', () => { lastSig = ''; });
    const sc = $('kn-scroll');
    // drag the tree about with the mouse (a click on a card still selects it)
    let drag = null; sc.addEventListener('pointerdown', (e) => { if (e.button !== 0 || e.target.closest('.kn-card, .kn-era')) return; drag = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop }; sc.setPointerCapture(e.pointerId); sc.classList.add('drag'); });
    sc.addEventListener('pointermove', (e) => { if (!drag) return; sc.scrollLeft = drag.l - (e.clientX - drag.x); sc.scrollTop = drag.t - (e.clientY - drag.y); });
    const end = () => { drag = null; sc.classList.remove('drag'); }; sc.addEventListener('pointerup', end); sc.addEventListener('pointercancel', end);
    // a mouse's wheel moves the tree sideways, through the ages (a trackpad's two fingers go both ways by themselves)
    sc.addEventListener('wheel', (e) => { if (e.shiftKey || e.ctrlKey || e.deltaX !== 0) return; const notch = e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50; if (notch || sc.scrollHeight <= sc.clientHeight + 2) { sc.scrollLeft += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY; e.preventDefault(); } }, { passive: false });
    $('kn-canvas').addEventListener('click', (e) => { const b = e.target.closest('.kn-card'); if (b) { pick(b.dataset.k); return; } const h = e.target.closest('.kn-era'); if (h) toEra(+h.dataset.e); });
    $('kn-canvas').addEventListener('dblclick', (e) => { const b = e.target.closest('.kn-card'); if (b) act('study', b.dataset.k); });
    $('kn-canvas').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('.kn-card') && sel) { e.preventDefault(); act('study', sel); focusSel(); return; }
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!dir || !pos || !sel || e.altKey || e.metaKey || e.ctrlKey) return;
      const a = pos.at[KN().ID[sel]]; let best = null, bs = 1e18;
      for (const D of KN().LIST) { const q = pos.at[D.id]; const dx = q.x - a.x, dy = q.y - a.y; const along = dx * dir[0] + dy * dir[1]; if (along <= 0) continue; const across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]); const sc = along + across * (dir[0] ? 2 : 4); if (sc < bs) { bs = sc; best = D.key; } }
      e.preventDefault(); if (best) { pick(best, true); focusSel(); }
    });
    window.addEventListener('resize', () => { if (isOpen() && tab === 'tree') { paint(); } });
    $('know').addEventListener('click', (e) => {
      const a = e.target.closest('[data-kact]'); if (a) { act(a.dataset.kact, a.dataset.k); return; }
      const j = e.target.closest('[data-kgo]'); if (j) { pick(j.dataset.kgo, true); return; }
      const g = e.target.closest('[data-good]'); if (g && ctx.openGood) { close(); ctx.openGood(+g.dataset.good); return; }
      const l = e.target.closest('[data-ggo]'); if (l && ctx.openLaw) { close(); ctx.openLaw(l.dataset.ggo); }
    });
  }
  const isOpen = () => $('know').open;
  function open(t, key) {
    const s = S(); if (!s) return; const dlg = $('know'); const was = dlg.open; if (!was) dlg.showModal();
    if (key && KN().ID[key] !== undefined) sel = key;
    if (!sel) { const c = me(); const st = c ? K().status(c.id, c, 0) : null; sel = st && st.d ? st.d.key : firstOpen(); }
    setTab(t || 'tree'); if (!was || key) requestAnimationFrame(() => { reveal(sel, !was); focusSel(); });
  }
  function focusSel() { const el = tab === 'tree' ? document.querySelector('#kn-canvas .kn-card.sel') : $('kn-stand'); if (el) el.focus({ preventScroll: true }); }
  function close() { const d = $('know'); if (d.open) d.close(); }
  function setTab(t) { const turn = tab !== t; tab = t; document.querySelectorAll('#kn-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.ktab === t)); document.querySelectorAll('#know [data-kpane]').forEach((p) => { p.hidden = p.dataset.kpane !== t; }); render(); if (turn && t === 'tree') requestAnimationFrame(() => reveal(sel, true)); }
  function firstOpen() { const c = me(); const L = KN().LIST; if (c) { const av = K().available(c.id, c.era); if (av.length) return L[av[0]].key; } return L[0].key; }
  // bring a discovery (or the realm's own age) into view
  function reveal(key, jump) { const sc = $('kn-scroll'); if (!pos || !sc) return; const d = KN().ID[key]; const p = d !== undefined ? pos.at[d] : null; if (!p) return; const left = Math.max(0, p.x + GUT - (sc.clientWidth - CW) / 2), top = Math.max(0, p.y - (sc.clientHeight - CH) / 2); sc.scrollTo({ left, top, behavior: jump ? 'auto' : 'smooth' }); }
  function toEra(e) { const sc = $('kn-scroll'); if (pos) sc.scrollTo({ left: Math.max(0, pos.eraX[e] - 8), behavior: 'smooth' }); }
  function pick(key, show) {
    if (KN().ID[key] === undefined) return; sel = key; if (tab !== 'tree') setTab('tree'); else { paint(); renderInfo(); } if (show) reveal(key);
    const a = document.activeElement; if (a && a.classList && a.classList.contains('kn-card') && a.dataset.k !== key) focusSel();      // (the keyboard stays on the chosen card)
  }

  // ----- what the player does -----
  function act(what, key) {
    const s = S(), c = me(); if (!s || !c) return; const k = K(); let msg = null;
    if (what === 'study') { const D = KN().LIST[KN().ID[key]]; if (!D) return; const why = k.study(c.id, c, key); if (why) { if (!k.has[c.id * k.ND + D.id]) { k.enqueue(c.id, c, key); msg = `${D.name} is in the queue: ${why.toLowerCase()}`; } } else msg = k.has[c.id * k.ND + D.id] ? `Your people learn ${D.name}` : `Your scholars turn to ${D.name}`; }
    else if (what === 'queue') { k.enqueue(c.id, c, key); }
    else if (what === 'drop') { k.dequeue(c, key); }
    else if (what === 'auto') { const m = k.mind(c); m.auto = !m.auto; if (m.auto) k.step(c.id, c, 0); }
    if (msg && ctx.toast) ctx.toast(msg);
    if (ctx.afterAct) ctx.afterAct(); render();
  }

  // ----- drawing -----
  function build() {
    const L = KN().LIST, B = KN().BRANCHES; const avail = $('kn-scroll').clientHeight; pos = fitFor(avail); fitH = avail; const s = S();
    let h = `<div class="kn-side" style="height:${pos.H}px"><div class="kn-corner"></div>` + B.map((b, i) => `<div class="kn-br b-${b.key}" style="top:${pos.rowY[i]}px;height:${pos.rowH[i]}px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="${BICON[b.key]}"/></svg><b>${b.name}</b><small>${b.note}</small></div>`).join('') + '</div>';
    h += `<div class="kn-field" id="kn-field" style="width:${pos.W}px;height:${pos.H}px"><div class="kn-eras" style="width:${pos.W}px">` + pos.eraX.map((x, e) => `<button class="kn-era" data-e="${e}" style="left:${x}px;width:${pos.eraW[e]}px"><b>${esc(s.ERAS[e][0])}</b><small id="kn-era-${e}"></small></button>`).join('') + '</div>';
    h += pos.eraX.map((x, e) => `<div class="kn-col" data-e="${e}" style="left:${x}px;width:${pos.eraW[e]}px;height:${pos.H}px"></div>`).join('');
    h += B.map((b, i) => i % 2 ? `<div class="kn-band" style="top:${pos.rowY[i]}px;height:${pos.rowH[i]}px;width:${pos.W}px"></div>` : '').join('');
    let paths = ''; for (const D of L) for (const n of D.need) { const a = pos.at[n], b = pos.at[D.id]; const x1 = a.x + CW, y1 = a.y + CH / 2, x2 = b.x, y2 = b.y + CH / 2, dx = Math.max(18, (x2 - x1) * 0.5); paths += `<path data-a="${L[n].key}" data-b="${D.key}" d="M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}"/>`; }
    h += `<svg class="kn-lines" width="${pos.W}" height="${pos.H}" viewBox="0 0 ${pos.W} ${pos.H}">${paths}</svg>`;
    for (const D of L) { const p = pos.at[D.id]; h += `<button class="kn-card b-${B[D.branch].key}" data-k="${D.key}" style="left:${p.x}px;top:${p.y}px"><span class="ic">${glyph(D)}</span><span class="nm">${esc(D.name)}</span><span class="st"></span><i class="q" hidden></i><i class="bar"></i></button>`; }
    const cv = $('kn-canvas'); cv.style.setProperty('--kn-ch', CH + 'px'); cv.classList.toggle('tight', CH < 42); cv.innerHTML = h + '</div>'; built = true;
  }
  // the state of every card: known, being studied, open to study, waiting on something, or of a later age
  function stateOf(c, D) {
    const k = K(); if (!c) return 'later'; if (k.has[c.id * k.ND + D.id]) return 'known'; if (k.cur[c.id] === D.id) return 'study';
    if (D.era > c.era) return 'later'; for (const n of D.need) if (!k.has[c.id * k.ND + n]) return 'locked'; return 'open';
  }
  function paint() {
    { const avail = $('kn-scroll').clientHeight; if (!built) build(); else if (avail > 0 && avail !== fitH) { const was = CH; const keep = [CH, GY, RPAD]; const L2 = fitFor(avail); fitH = avail; if (CH !== was) { build(); requestAnimationFrame(() => reveal(sel, true)); } else { [CH, GY, RPAD] = keep; pos = L2; } } }
    const c = me(), k = K(), L = KN().LIST; const py = c ? perYear(c) : 0; const q = c ? k.mind(c).q : [];
    for (const el of document.querySelectorAll('#kn-canvas .kn-card')) {
      const D = L[KN().ID[el.dataset.k]]; const st = stateOf(c, D); el.className = `kn-card b-${KN().BRANCHES[D.branch].key} ${st}${sel === D.key ? ' sel' : ''}`;
      const sub = el.children[2], qn = el.children[3], bar = el.children[4]; let t = '', w = 0;
      if (st === 'known') t = 'known';
      else if (st === 'study') { const sx = k.status(c.id, c, py); w = sx.prog; t = `${Math.round(sx.prog * 100)}% · ${yrs(sx.years)}`; }
      else if (st === 'open') { const part = k.mind(c).part[D.key]; if (part) w = part / D.cost; t = `${ins(D.cost)} · ${yrs(k.yearsFor(c.id, D.id, py))}${k.nb[c.id * k.ND + D.id] ? ' · known nearby' : ''}`; if (k.yearsFor(c.id, D.id, py) === 0) el.classList.add('now'); }
      else if (st === 'locked') { const n = D.need.find((x) => !k.has[c.id * k.ND + x]); t = 'after ' + L[n].name; }
      else t = ins(D.cost);
      sub.textContent = t; bar.style.width = (w * 100).toFixed(1) + '%'; const qi = q.indexOf(D.key); qn.hidden = qi < 0; if (qi >= 0) qn.textContent = qi + 1;
    }
    // the lines: bright along what the chosen discovery stands on and leads to
    const S0 = sel ? L[KN().ID[sel]] : null; const up = new Set(), dn = new Set(); if (S0) { const walk = (d) => { for (const n of L[d].need) if (!up.has(n)) { up.add(n); walk(n); } }; walk(S0.id); for (const x of S0.leads) dn.add(x); }
    for (const p of document.querySelectorAll('#kn-canvas .kn-lines path')) { const a = KN().ID[p.dataset.a], b = KN().ID[p.dataset.b]; const have = c && k.has[c.id * k.ND + a]; const hot = S0 && ((b === S0.id) || (up.has(b) && up.has(a)) || (a === S0.id && dn.has(b))); p.setAttribute('class', (have ? 'have ' : '') + (hot ? (a === S0.id ? 'lead' : 'hot') : '')); }
    // the ages: how much of each the realm has learned, and which it lives in
    const NE = KN().NE; const tot = new Array(NE).fill(0), got = new Array(NE).fill(0); for (const D of L) { tot[D.era]++; if (c && k.has[c.id * k.ND + D.id]) got[D.era]++; }
    for (let e = 0; e < NE; e++) { const el = $('kn-era-' + e); if (el) el.textContent = !c ? '' : e > c.era ? 'not yet' : `${got[e]} of ${tot[e]}${e === c.era ? ' · your age' : ''}`; }
    document.querySelectorAll('#kn-canvas .kn-col').forEach((el) => { const e = +el.dataset.e; el.className = 'kn-col' + (c && e === c.era ? ' now' : c && e > c.era ? ' later' : ''); });
    document.querySelectorAll('#kn-canvas .kn-era').forEach((el) => { const e = +el.dataset.e; el.classList.toggle('now', !!c && e === c.era); el.classList.toggle('later', !!c && e > c.era); });
  }
  // what a discovery gives, as lines for the page: what it opens first, then its edges
  function givesOf(D) {
    const s = S(), E = window.ECON, G = D.gives, out = [];
    if (G.works) out.push(`Your towns can raise: <b>${G.works.map((w) => esc(s.BUILD[w] ? s.BUILD[w].name : w)).join(', ')}</b>`);
    if (G.farm) out.push(`Farms up to <b>level ${G.farm}</b>`); if (G.walls) out.push(`Walls up to <b>level ${G.walls}</b>`);
    if (G.goods) out.push(`Your land can be worked for ${G.goods.map((g) => MARKET.chip(E.GOODS[E.ID[g]])).join(' ')}`);
    if (G.recipes) { const by = new Map(); for (const r of G.recipes) { const R = E.RECIPES.find((x) => x.key === r); const a = by.get(R.out) || []; a.push(R.name); by.set(R.out, a); } for (const [g, names] of by) out.push(`${esc(names.join(', '))} can set to work, making ${MARKET.chip(E.GOODS[g])}`); }
    if (G.can) for (const a of G.can) out.push(CAN[a] || a);
    if (window.GOV) for (const line of GOV.opensLines(D.key)) out.push(line);
    for (const k of KN().KEYS) if (G[k]) out.push(edgeLine(k, G[k]));
    return out;
  }
  function renderInfo() {
    const el = $('kn-info'); const s = S(), c = me(), k = K(), L = KN().LIST; const D = sel ? L[KN().ID[sel]] : null; if (!D) { el.innerHTML = ''; return; }
    const st = stateOf(c, D); const py = c ? perYear(c) : 0; const B = KN().BRANCHES[D.branch];
    const chipD = (X) => `<button class="kn-chip ${stateOf(c, X)}" data-kgo="${X.key}">${esc(X.name)}</button>`;
    let how = '';
    if (!c) how = '';
    else if (st === 'known') how = `<div class="kn-state known">Your people know this.</div>`;
    else if (st === 'study') { const sx = k.status(c.id, c, py); how = `<div class="kn-state study">Being studied: ${Math.round(sx.prog * 100)}% · ${yrs(sx.years)} at this pace${sx.quick ? ' (known nearby: half again as fast)' : ''}</div>`; }
    else if (st === 'open') { const can = k.yearsFor(c.id, D.id, py) === 0; how = `<div class="kn-acts"><button class="btn primary" data-kact="study" data-k="${D.key}">${can ? 'Learn now' : 'Study this'}</button><button class="btn" data-kact="queue" data-k="${D.key}">Add to the queue</button></div><div class="kn-state">${ins(D.cost)} insight · ${can ? 'you hold enough to learn it at once' : yrs(k.yearsFor(c.id, D.id, py)) + ' at this pace'}${k.nb[c.id * k.ND + D.id] ? ' · known to a neighbour: half again as fast' : ''}</div>`; }
    else if (st === 'locked') { how = `<div class="kn-acts"><button class="btn" data-kact="queue" data-k="${D.key}">Queue it, and what it stands on</button></div><div class="kn-state">${ins(D.cost)} insight · first ${D.need.filter((n) => !k.has[c.id * k.ND + n]).map((n) => L[n].name).join(' and ')}</div>`; }
    else how = `<div class="kn-acts"><button class="btn" data-kact="queue" data-k="${D.key}">Queue it for when its age comes</button></div><div class="kn-state">${ins(D.cost)} insight · it belongs to the ${esc(s.ERAS[D.era][0])}${/Age$/.test(s.ERAS[D.era][0]) ? '' : ' age'}, which your people have not reached</div>`;
    if (c && k.mind(c).q.indexOf(D.key) >= 0) how += `<div class="kn-state">In the queue, number ${k.mind(c).q.indexOf(D.key) + 1}. <button class="linkish" data-kact="drop" data-k="${D.key}">Take it out</button></div>`;
    const first = k.first[D.id]; const n = k.knownBy(D.id); const total = s.st.civCount;
    const who = first && first.name ? `First: ${esc(first.name)}, ${s.fmtYear(first.y)}. ` : first ? 'Known since before anyone kept count. ' : 'No people knows this yet. ';
    el.innerHTML = `<div class="kn-head b-${B.key}"><span class="ic">${glyph(D)}</span><div><h3>${esc(D.name)}</h3><div class="micro">${B.name} · ${esc(s.ERAS[D.era][0])}</div></div></div>
      <p class="kn-text">${esc(D.text)}</p>${how}
      <div class="kn-sect"><div class="micro">It gives</div><ul class="kn-gives">${givesOf(D).map((g) => `<li>${g}</li>`).join('')}</ul></div>
      ${D.need.length ? `<div class="kn-sect"><div class="micro">It stands on</div><div class="kn-chips">${D.need.map((x) => chipD(L[x])).join('')}</div></div>` : ''}
      ${D.leads.length ? `<div class="kn-sect"><div class="micro">It leads to</div><div class="kn-chips">${D.leads.map((x) => chipD(L[x])).join('')}</div></div>` : ''}
      <div class="kn-sect kn-who">${who}${n ? `Known to ${n} of ${total} realms.` : ''}</div>`;
  }
  // the strip under the title: what is being studied, what waits, and who chooses when nothing does
  function renderNow() {
    const s = S(), c = me(), k = K(), L = KN().LIST; const el = $('kn-now'); if (!c) { el.innerHTML = '<span class="mk-dim">No realm yet.</span>'; return; }
    const P = s.insightParts(c); const py = P.total + P.taught; const sx = k.status(c.id, c, py); const m = k.mind(c);
    const av = k.available(c.id, c.era).length; let cur;
    if (sx.d) cur = `<button class="kn-cur" data-kgo="${sx.d.key}"><span class="micro">Studying</span><b>${esc(sx.d.name)}</b><span class="kn-prog"><i style="width:${(sx.prog * 100).toFixed(1)}%"></i></span><span class="num">${Math.round(sx.prog * 100)}% · ${yrs(sx.years)}</span></button>`;
    else if (av) cur = `<span class="kn-cur idle"><span class="micro">Studying</span><b>Nothing: your scholars await your word</b>${sx.pool > 1e-9 ? `<span class="num">${ins(sx.pool)} insight unspent</span>` : ''}</span>`;
    else cur = `<span class="kn-cur idle"><span class="micro">Studying</span><b>${sx.known >= k.ND ? 'What no age has known' + (sx.future ? ' · step ' + sx.future : '') : 'All that your age can teach is learned'}</b></span>`;
    const queue = m.q.length ? `<span class="micro">Then</span>` + m.q.map((key, i) => `<span class="kn-q"><button data-kgo="${key}"><i>${i + 1}</i>${esc(L[KN().ID[key]].name)}</button><button class="x" data-kact="drop" data-k="${key}" title="Take it out of the queue">✕</button></span>`).join('') : '';
    el.innerHTML = `${cur}<div class="kn-queue">${queue}</div><label class="kn-auto" title="When nothing is queued, the scholars pick what the realm seems to need. Left alone for a generation they do so anyway."><input type="checkbox" data-kact="auto" ${m.auto ? 'checked' : ''}>Scholars choose when the queue runs out</label>`;
    const rate = $('kn-rate'); const U = KN().UNIT, f2 = (v) => (v * U).toFixed(v * U < 10 ? 2 : 1);
    rate.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="${BICON.mind}"/></svg>+${f2(py)} <span>insight a year${P.taught * U >= 0.005 ? `, ${f2(P.taught)} of it from your neighbours` : ''}</span>`;
    rate.title = `For its age ${(P.base * KN().UNIT).toFixed(2)} · people ×${P.people.toFixed(2)} · scholars' pay ×${P.spend.toFixed(2)} · academies ×${P.acads.toFixed(2)} · peace at home ×${P.calm.toFixed(2)}${P.ruler !== 1 ? ' · ruler ×' + P.ruler.toFixed(2) : ''} · what you know of learning ×${P.known.toFixed(2)}${Math.abs(P.time - 1) >= 0.005 ? (P.time < 1 ? ' · ahead of your time ×' : ' · first in a world behind its time ×') + P.time.toFixed(2) : ''}`;
  }
  // where the realm stands: each edge against what its age expects, and the realm among the realms
  function renderStand() {
    const s = S(), c = me(), k = K(), L = KN().LIST; const el = $('kn-stand'); if (!c) { el.innerHTML = '<p class="mk-dim">No realm yet.</p>'; return; }
    const rows = k.standing(c.id, c.tech).filter((r) => r.own > 1e-6 || r.exp > 1e-6).map((r) => { const d = r.key === 'stab' ? r.own - r.exp : (1 + r.own) / (1 + r.exp) - 1; return { key: r.key, d }; });
    const bar = (d) => { const w = Math.min(50, Math.abs(d) * 250); return `<span class="kn-sbar"><i class="${d >= 0 ? 'up' : 'dn'}" style="${d >= 0 ? 'left:50%' : 'right:50%'};width:${w.toFixed(1)}%"></i></span>`; };
    const word = (d) => Math.abs(d) < 0.005 ? '<span class="mk-dim">level with your age</span>' : d > 0 ? `<span class="pos">${pc(d)} ahead</span>` : `<span class="neg">${pc(d).replace('−', '')} behind</span>`;
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    const table = rows.map((r) => `<div class="kn-srow"><span>${esc(cap(edgeName(r.key)))}</span>${bar(r.d)}<span class="num">${word(r.d)}</span></div>`).join('');
    const realms = []; for (const o of s.civs) if (o) realms.push([o, k.count[o.id]]); realms.sort((a, b) => b[1] - a[1]); const rank = realms.findIndex((r) => r[0] === c) + 1; const top = realms.slice(0, 7); if (rank > 7) top.push(realms[rank - 1]);
    const most = realms.length ? Math.max(1, realms[0][1]) : 1;
    const list = top.map(([o, n]) => `<div class="kn-wrow${o === c ? ' me' : ''}"><i style="background:${o.color}"></i><span>${esc(s.fullName(o))}</span><span class="kn-wbar"><i style="width:${(100 * n / most).toFixed(1)}%;background:${o.color}"></i></span><b class="num">${n}</b></div>`).join('');
    const firsts = []; L.forEach((D) => { const f = k.first[D.id]; if (D.first && f && f.name) firsts.push([f.y, D, f]); }); firsts.sort((a, b) => b[0] - a[0]);
    const fl = firsts.slice(0, 12).map(([y, D, f]) => `<div class="kn-frow${f.id === c.id && s.civs[f.id] === c ? ' me' : ''}"><button class="linkish" data-kgo="${D.key}">${esc(D.name)}</button><span>${esc(f.name)}</span><span class="num">${s.fmtYear(y)}</span></div>`).join('');
    const e = c.era, next = s.ERAS[e + 1]; const from = e ? s.ERAS[e][1] : KN().T0; const prog = next ? Math.max(0, Math.min(1, (c.tech - from) / (next[1] - from))) : 1;
    el.innerHTML = `<div class="kn-cols"><div class="kn-sect"><div class="micro">Your people against their age</div>
        <p class="kn-note">An age expects a people to have learned its discoveries by the time it ends. Learn something early and you are ahead of your age in what it gives; leave it and you fall behind, until you learn it.</p>
        <div class="kn-age"><b>${esc(s.ERAS[e][0])}</b><span class="kn-prog"><i style="width:${(prog * 100).toFixed(1)}%"></i></span><span class="num">${next ? Math.round(prog * 100) + '% of the way to the ' + esc(next[0]) : 'the last age'}</span></div>
        ${(() => { const hy = s.histYear(c.tech), d = hy - s.year, P = s.insightParts(c); if (c.tech >= 1 || Math.abs(d) < 15) return ''; return `<p class="kn-note">${s.calShift ? 'By this world\'s reckoning the first peoples knew this much in' : 'The first peoples of history knew this much in'} ${s.fmtYear(hy)}: yours are ${Math.abs(d).toLocaleString()} years ${d > 0 ? 'ahead of their time' + (P.time < 0.995 ? `, and learn the slower for it (×${P.time.toFixed(2)}): nobody has gone this way before` : '') : 'behind it' + (P.time > 1.005 ? `, in a world that is behind too: its time is ripe, and they learn the faster (×${P.time.toFixed(2)})` : '')}.</p>`; })()}
        ${table || '<p class="mk-dim">Nothing learned yet.</p>'}</div>
      <div class="kn-sect"><div class="micro">The most learned <span class="mk-dim">· you are ${rank} of ${realms.length}, with ${k.count[c.id]} of ${k.ND} discoveries</span></div>${list}
        <div class="micro" style="margin-top:14px">Who was first</div>${fl || '<p class="mk-dim">Nobody has yet been first to anything the world remembers.</p>'}</div></div>`;
  }
  function render() {
    const s = S(); if (!s || !isOpen()) return; const c = me();
    $('kn-sub').textContent = `${c ? s.fullName(c) : 'The world'} · ${s.fmtYear(s.year)}`;
    renderNow(); if (tab === 'tree') { paint(); renderInfo(); } else renderStand();
    lastSig = sig();
  }
  const sig = () => { const s = S(), c = me(); return c ? `${s.year}:${K().count[c.id]}:${K().cur[c.id]}:${K().mind(c).q.length}` : String(s.year); };
  function refresh() { const s = S(); if (!s || !isOpen()) return; if (sig() !== lastSig) render(); }
  // for the top bar: what is being studied, how far along, how long; and whether the scholars are waiting to be told
  function tile() {
    const s = S(), c = me(); if (!s || !c) return null; const k = K(); const py = perYear(c); const sx = k.status(c.id, c, py); const waiting = !sx.d && k.available(c.id, c.era).length > 0 && !k.mind(c).auto;
    return { d: sx.d, prog: sx.prog, years: sx.years, perYear: py * KN().UNIT, pool: sx.pool * KN().UNIT, known: sx.known, total: k.ND, waiting, queue: k.mind(c).q.length, self: k.mind(c).self };
  }
  return { init, open, close, isOpen, refresh, render, pick, tile, givesOf, edgeLine, edgeName, glyph, yrs, BICON, layout };
})();
