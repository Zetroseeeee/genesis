// Holocene market screen (classic script; exposes window.MARKET): the board of goods, a good's own page (price
// through the years, who sells and who buys, how it is made and what it makes), the realm's trade partners, its
// workshops and its ledger; the movers on the bottom bar; and the glyphs of the goods. It only reads the simulation's
// market (sim.market, econ.js) and calls its few actions: buy, sell, release, orders, customs, bans.
window.MARKET = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  // one stroke glyph for every good, 24 x 24 (closed shapes and straight lines, so they also read when filled)
  const ICON = {
    grain: 'M12 3v18M12 7l-4-2M12 7l4-2M12 11l-4-2M12 11l4-2M12 15l-4-2M12 15l4-2', fish: 'M3 12c3-4 7-6 11-5l4-4v6l3 3-3 3v6l-4-4c-4 1-8-1-11-5z', cattle: 'M4 6c2 3 5 4 8 4s6-1 8-4M8 10v4a4 4 0 0 0 8 0v-4', timber: 'M12 3l5 7h-3l4 6h-4v5h-4v-5H6l4-6H7z', stone: 'M4 16l4-8 5 3 3-5 4 10z', salt: 'M12 3l6 6-6 12-6-12zM6 9h12',
    copper: 'M4 16l2-6h12l2 6zM6 10l2-3h8l2 3', tin: 'M4 16l2-6h12l2 6zM9 13h6', iron: 'M6 20l7-7M10 4l6 6-3 3-6-6z', horses: 'M5 20v-6l3-6h5l3-4 3 1-1 3 1 4v8M9 14v6', gold: 'M8 10a5 3 0 1 0 10 0a5 3 0 1 0-10 0M6 14a5 3 0 1 0 10 0', gems: 'M6 9l3-4h6l3 4-6 11zM6 9h12',
    wine: 'M8 3h8l-1 7a3 3 0 0 1-6 0zM12 13v6M9 20h6', spices: 'M4 20C6 10 12 5 20 4c-1 8-6 14-16 16zM4 20l10-10', silk: 'M5 6h10a3 3 0 0 1 0 6H5zM5 12h12a3 3 0 0 1 0 6H5z', furs: 'M12 3c-3 0-5 3-5 6 0 5 2 8 5 12 3-4 5-7 5-12 0-3-2-6-5-6zM12 3v18', ivory: 'M5 19c1-7 5-13 13-15-3 6-6 10-9 15z', cotton: 'M8 7a3 3 0 1 1 4-2 3 3 0 1 1 4 2 3 3 0 1 1-2 4 3 3 0 1 1-4 0 3 3 0 1 1-2-4zM12 14v7',
    coal: 'M6 13l3-6 4 2 3-3 3 7-3 5H8z', oil: 'M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z',
    rice: 'M4 12h16a8 8 0 0 1-16 0zM9 9l1-4M13 9l1-5M16 9l2-4', maize: 'M12 3c3 2 4 6 4 10s-2 7-4 8c-2-1-4-4-4-8s1-8 4-10zM12 3v18M8.500 9h7M8 13h8M8.500 17h7', wool: 'M7 15a3 3 0 0 1 0-6 4 4 0 0 1 7-2 3.500 3.500 0 0 1 3 6 3 3 0 0 1-3 2zM9 15v5M15 15v5',
    olives: 'M4 20L20 4M8 12a2.200 3 0 1 0 0.010 0zM15 7a2.200 3 0 1 0 0.010 0z', sugar: 'M5 9l7-4 7 4v7l-7 4-7-4zM5 9l7 4 7-4M12 13v7', tea: 'M5 9h11v5a5 5 0 0 1-10 0zM16 10h2a2 2 0 0 1 0 4h-2M5 20h12M9 4v2M12 4v2',
    coffee: 'M12 4c5 0 7 4 7 8s-2 8-7 8-7-4-7-8 2-8 7-8zM12 4c-3 5 3 8 0 16', cocoa: 'M12 3c4 3 5 7 5 9s-1 6-5 9c-4-3-5-7-5-9s1-6 5-9zM12 3v18M9.500 8v8M14.500 8v8', tobacco: 'M5 19c0-8 5-14 14-15-1 9-6 15-14 15zM5 19l9-9M9 15h4M11 13V9',
    silver: 'M12 4a8 8 0 1 0 0.010 0zM14 7.500a5 5 0 0 0 0 9 6 6 0 0 1 0-9z', amber: 'M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11zM10 14l2 2 2-3z', obsidian: 'M12 3l5 9-5 9-5-9zM12 3v18M7 12h10', incense: 'M6 15h12l-2 5H8zM12 15v-3M12 9V7M12 4V3M9 12h6',
    dyes: 'M8 4c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6zM16 10c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6z', jade: 'M12 4a8 8 0 1 0 0.010 0zM12 9a3 3 0 1 0 0.010 0z', saltpetre: 'M5 20l2-9 3 5 2-11 3 9 2-4 2 10z',
    rubber: 'M12 4a8 8 0 1 0 0.010 0zM12 8.500a3.500 3.500 0 1 0 0.010 0zM12 4v4.500M12 15.500V20M4 12h4.500M15.500 12H20', gas: 'M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z', uranium: 'M4 12a8 3.500 0 1 0 16 0a8 3.500 0 1 0-16 0M12 4a3.500 8 0 1 0 0 16a3.500 8 0 1 0 0-16M12 11v2',
    bauxite: 'M4 18l3-9 5-3 6 4 2 8zM6 14h13M8 10h9', rareearth: 'M6 4v9a6 6 0 0 0 12 0V4h-4v9a2 2 0 0 1-4 0V4zM6 8h4M14 8h4', lithium: 'M7 6h10v14H7zM10 6V4h4v2zM10 11h4M12 9v4M10 16h4',
    pottery: 'M9 3h6v3c3 1 5 4 5 8a7 7 0 0 1-16 0c0-4 2-7 5-8zM5 12h14', leather: 'M7 4l3 2h4l3-2 1 5-2 3 2 4-2 4h-3l-1-2-1 2H8l-2-4 2-4-2-3z', cloth: 'M4 8l8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4', beer: 'M6 8h9v11H6zM15 10h3v6h-3zM9 11v5M12 11v5M6 8V5h9v3',
    bronze: 'M8 17c0-6 1-11 4-11s4 5 4 11zM6 17h12M12 6V4M12 19v1', tools: 'M14 4l6 6-3 3-6-6zM12.500 8.500L4 17l3 3 8.500-8.500', arms: 'M12 3l2 3v9h-4V6zM8 15h8M12 15v6', jewellery: 'M12 9a6 6 0 1 0 0.010 0zM9 5l3-2 3 2-3 4z',
    glass: 'M10 3h4v4c2 1 3 3 3 5v8H7v-8c0-2 1-4 3-5zM7 14h10', ships: 'M3 16h18l-3 4H6zM12 16V4l6 9zM12 6l-5 7h5', paper: 'M7 4h10v16H7zM10 8h4M10 12h4M10 16h2', gunpowder: 'M7 5h10l1 5-1 9H7l-1-9zM6 10h12M6.500 15h11M12 5V3',
    guns: 'M3 16l12-6 6-1v3l-6 1-3 3-3 1-4 3z', spirits: 'M10 3h4v4l2 3v10H8V10l2-3zM8 13h8M8 17h8', steel: 'M6 5h12M6 19h12M12 5v14M8 5v2M16 5v2M8 17v2M16 17v2', machinery: 'M12 8a4 4 0 1 0 0.010 0zM12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M18.400 5.600l-2.100 2.100M7.700 16.300l-2.100 2.100',
    fuel: 'M6 7l3-3h6v3l3 2v11H6zM9 4v3h6M9 12l6 5M15 12l-6 5', plastics: 'M7 4l4 2.300v4.600L7 13.200 3 10.900V6.300zM17 10.800l4 2.300v4.600l-4 2.300-4-2.300v-4.600zM11 9.500l2 3.600', aluminium: 'M7 6c0-1 2-2 5-2s5 1 5 2v12c0 1-2 2-5 2s-5-1-5-2zM7 6c0 1 2 2 5 2s5-1 5-2M7 12c0 1 2 2 5 2s5-1 5-2',
    vehicles: 'M3 15v-3l3-1 2-4h7l3 4 3 1v3zM7 15a2 2 0 1 0 0.010 0zM17 15a2 2 0 1 0 0.010 0zM8 11h9', electronics: 'M7 7h10v10H7zM10 10h4v4h-4zM9 4v3M12 4v3M15 4v3M9 17v3M12 17v3M15 17v3M4 9h3M4 12h3M4 15h3M17 9h3M17 12h3M17 15h3',
  };
  const svg = (key) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="${ICON[key] || ICON.stone}"/></svg>`;
  const escH = (s) => String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  const chip = (g, imp, extra) => `<span class="goodchip ${g.kind}${imp ? ' imp' : ''}" data-good="${g.id}" title="${escH(g.name)}${imp ? ' (comes from abroad)' : ''}">${svg(g.key)}${escH(g.name)}${extra ? `<i>${extra}</i>` : ''}</span>`;
  // numbers: a quantity in lots, a price in coin, a share in per cent
  const fq = (v) => { const a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : a >= 1e4 ? Math.round(v / 1e3) + 'k' : a >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : a >= 0.01 ? v.toFixed(3) : a > 0 ? v.toPrecision(1) : '0'; };
  const fp = (v) => { const a = Math.abs(v); return a >= 1e4 ? Math.round(v).toLocaleString() : a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(1) : a >= 10 ? v.toFixed(2) : v.toFixed(2); };
  const fc = (v) => { const a = Math.abs(v); return (v < 0 ? '−' : '') + (a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e4 ? Math.round(a / 1e3) + 'k' : a >= 100 ? Math.round(a).toLocaleString() : a >= 10 ? a.toFixed(1) : a.toFixed(2)); };
  const pct = (v) => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0) + '%';
  const arrow = (d) => d > 0.004 ? '<span class="up">▲</span>' : d < -0.004 ? '<span class="dn">▼</span>' : '<span class="fl">■</span>';
  const KM = 55;      // a cell of the simulation's grid is about this many kilometres across

  let ctx = null, tab = 'board', cur = 0, filter = 'all', sortKey = 'kind', sortDir = 1, range = 64, lastSig = '';
  const E = () => window.ECON; const S = () => ctx.sim(); const M = () => S().market;
  const me = () => { const s = S(); return s ? s.playerCiv() : null; };
  const known = (g, c) => g.era <= (c ? c.era : 8) + 1;      // what an age has heard of
  // how a good's price at home moved over the last n years (as a share), from the yearly record
  function moved(g, n) { const p = M().series(g, true); if (p.length < 2) return 0; const a = p[Math.max(0, p.length - 1 - n)][1], b = p[p.length - 1][1]; return a > 0 ? b / a - 1 : 0; }
  function cover(c, g) { const m = M(), o = c * m.NG + g; const nd = m.need[o]; return nd > 1e-9 ? (m.stock[o] + m.got[o] + m.used[o]) / nd : -1; }

  // ----- the frame of the screen -----
  function init(c) {
    ctx = c;
    $('mk-close').addEventListener('click', close);
    document.querySelectorAll('#mk-tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.mtab)));
    $('market').addEventListener('click', (e) => { const kg = e.target.closest('[data-kgo]'); if (kg && window.TREE) { e.stopPropagation(); close(); TREE.open('tree', kg.dataset.kgo); return; } const ch = e.target.closest('[data-good]'); if (ch && !ch.closest('.mk-row')) { e.stopPropagation(); showGood(+ch.dataset.good); } });
    $('market').addEventListener('close', () => { lastSig = ''; });
    const mv = $('movers'); if (mv) mv.addEventListener('click', (e) => { const b = e.target.closest('[data-good]'); open('board', b ? +b.dataset.good : 0); });
  }
  const isOpen = () => $('market').open;
  function open(t, good) {
    const s = S(); if (!s) return; const dlg = $('market'); if (!dlg.open) { dlg.showModal(); dlg.firstElementChild.focus({ preventScroll: true }); }      // (not the button that closes it)
    if (good) cur = good; if (!cur) cur = firstGood();
    setTab(t || tab);
  }
  function close() { const d = $('market'); if (d.open) d.close(); }
  function setTab(t) {
    tab = t; document.querySelectorAll('#mk-tabs button').forEach(b => b.classList.toggle('on', b.dataset.mtab === t)); document.querySelectorAll('#market [data-mpane]').forEach(p => { p.hidden = p.dataset.mpane !== t; });
    render();
  }
  function firstGood() { const c = me(); const m = M(); if (c) { let best = 0, bv = -1; for (let g = 1; g < m.NG; g++) { const v = m.out[c.id * m.NG + g] * E().GOODS[g].base; if (v > bv) { bv = v; best = g; } } return best || 1; } return 1; }
  function showGood(g) { cur = g; if (tab !== 'board') setTab('board'); else { renderTable(); renderGood(); } }
  // redraw what is open (after a turn, after a deal); cheap enough to do whole
  function render() {
    const s = S(); if (!s || !isOpen()) return; const c = me(); const m = M();
    $('mk-sub').textContent = `${c ? s.fullName(c) : 'The world'} · ${s.fmtYear(s.year)}`;
    $('mk-purse').innerHTML = c ? `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>${ctx.fmtInt(c.wealth)} <span class="${(c.income || 0) >= 0 ? 'pos' : 'neg'}">${(c.income || 0) >= 0 ? '+' : '−'}${Math.abs(c.income || 0).toFixed(1)}</span>` : '';
    renderTape();
    if (tab === 'board') { renderFilters(); renderTable(); renderGood(); } else if (tab === 'trade') renderTrade(); else if (tab === 'works') renderWorks(); else renderLedger();
    lastSig = s.year + ':' + (c ? c.wealth.toFixed(2) : '');
  }
  function refresh() { const s = S(); if (!s || !isOpen()) return; const c = me(); const sig = s.year + ':' + (c ? c.wealth.toFixed(2) : ''); if (sig !== lastSig) render(); }

  // the tape: the world's prices going by (every good the player's age has heard of that is traded somewhere)
  function renderTape() {
    const m = M(), c = me(), G = E().GOODS; const items = [];
    for (let g = 1; g < m.NG; g++) { if (!known(G[g], c) || !(m.wOut[g] > 0)) continue; const p = m.series(g); const now = p.length ? p[p.length - 1][1] : m.worldPrice(g); const then = p.length > 10 ? p[p.length - 11][1] : now; const d = then > 0 ? now / then - 1 : 0; items.push(`<button data-good="${g}"><b>${G[g].tk}</b>${fp(m.worldPrice(g))} ${arrow(d)}<i class="${d > 0.004 ? 'up' : d < -0.004 ? 'dn' : ''}">${Math.abs(d * 100).toFixed(1)}%</i></button>`); }
    const head = `<span class="mk-fig"><b>World product</b>${fc(m.worldGdp)}</span><span class="mk-fig"><b>Crossing borders</b>${fc(m.worldTrade)}</span><span class="mk-fig"><b>Realms</b>${S().st.civCount}</span>`;
    const run = items.join(''); const el = $('mk-tape'); const html = `<div class="mk-figs">${head}</div><div class="mk-run"><div class="mk-roll" style="--n:${items.length}">${run}${run}</div></div>`;
    if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
  }

  // ----- the board -----
  const FILTERS = [['all', 'All'], ['food', 'Food'], ['material', 'Materials'], ['luxury', 'Luxuries'], ['strategic', 'Strategic'], ['ours', 'We make'], ['in', 'Comes in'], ['short', 'Short']];
  const KIND_ORDER = { food: 0, material: 1, luxury: 2, strategic: 3 }; const KIND_NAME = { food: 'Food and drink', material: 'Materials', luxury: 'Luxuries', strategic: 'Strategic goods' };
  function renderFilters() {
    const el = $('mk-filters'); el.innerHTML = FILTERS.map(([k, l]) => `<button class="btn ${filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('');
    el.querySelectorAll('.btn').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; renderFilters(); renderTable(); }));
  }
  function rowsOf() {
    const m = M(), c = me(), G = E().GOODS; const rows = [];
    for (let g = 1; g < m.NG; g++) {
      const X = G[g]; if (!known(X, c)) continue;
      const o = c ? c.id * m.NG + g : -1; const r = { g, X, world: m.worldPrice(g), wOut: m.wOut[g] };
      if (c) { r.price = m.price(c.id, g); r.out = m.out[o]; r.need = m.need[o]; r.stock = m.stock[o]; r.net = m.imp[o] - m.exp[o]; r.cover = cover(c.id, g); r.chg = moved(g, 10); r.here = m.stock[o] + m.out[o] + m.imp[o] > 1e-6; }
      else { r.price = r.world; r.out = m.wOut[g]; r.need = m.wNeed[g]; r.stock = m.wStock[g]; r.net = 0; r.cover = m.wNeed[g] > 0 ? (m.wOut[g] + m.wStock[g]) / m.wNeed[g] : -1; r.chg = 0; r.here = m.wOut[g] > 0; }
      if (filter === 'ours' ? !(r.out > 1e-6) : filter === 'in' ? !(r.net > 1e-6) : filter === 'short' ? !(r.cover >= 0 && r.cover < 0.7 && r.need > 1e-6) : filter !== 'all' && X.kind !== filter) continue;
      rows.push(r);
    }
    const key = sortKey; rows.sort((a, b) => key === 'kind' ? (KIND_ORDER[a.X.kind] - KIND_ORDER[b.X.kind]) || (a.X.raw === b.X.raw ? a.g - b.g : a.X.raw ? -1 : 1) : key === 'name' ? a.X.name.localeCompare(b.X.name) * sortDir : ((a[key] || 0) - (b[key] || 0)) * sortDir);
    return rows;
  }
  function renderTable() {
    const c = me(); const rows = rowsOf(); const el = $('mk-table');
    const th = (k, l, cls) => `<button class="${cls || ''}${sortKey === k ? ' on' : ''}" data-sort="${k}">${l}${sortKey === k && k !== 'kind' ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}</button>`;
    let html = `<div class="mk-row head">${th('kind', 'Good', 'l')}${th('price', c ? 'Price' : 'World price')}${th('chg', '10 yrs')}${th('cover', 'Supply')}${th('out', 'Made')}${th('need', 'Wanted')}${th('net', 'Trade')}</div>`;
    let lastKind = '';
    for (const r of rows) {
      if (sortKey === 'kind' && r.X.kind !== lastKind) { lastKind = r.X.kind; html += `<div class="mk-group">${KIND_NAME[lastKind]}</div>`; }
      const cv = r.cover; const cls = cv < 0 ? 'none' : cv < 0.6 ? 'bad' : cv < 0.9 ? 'low' : 'ok';
      const priceTxt = r.here || !c ? fp(r.price) : '<span class="mk-dim" title="Not to be had here">—</span>';
      html += `<button class="mk-row ${r.X.kind}${r.g === cur ? ' on' : ''}" data-good="${r.g}"><span class="l">${svg(r.X.key)}<span class="nm">${escH(r.X.name)}</span><span class="tk">${r.X.tk}</span></span><span class="num">${priceTxt}</span><span class="num chg">${c && r.here && Math.abs(r.chg) >= 0.005 ? arrow(r.chg) + ' ' + Math.abs(r.chg * 100).toFixed(0) + '%' : ''}</span><span class="mk-cov ${cls}" title="${cv < 0 ? 'Nobody here wants it' : 'There is ' + Math.round(cv * 100) + '% of what is wanted'}"><i style="width:${cv < 0 ? 0 : Math.min(100, cv * 50).toFixed(0)}%"></i></span><span class="num">${r.out > 1e-6 ? fq(r.out) : '<span class="mk-dim">·</span>'}</span><span class="num">${r.need > 1e-6 ? fq(r.need) : '<span class="mk-dim">·</span>'}</span><span class="num ${r.net > 1e-6 ? 'in' : r.net < -1e-6 ? 'outg' : ''}" title="${r.net > 1e-6 ? 'More comes in than goes out' : r.net < -1e-6 ? 'More goes out than comes in' : ''}">${Math.abs(r.net) > 1e-6 ? (r.net > 0 ? 'in ' : 'out ') + fq(Math.abs(r.net)) : '<span class="mk-dim">·</span>'}</span></button>`;
    }
    if (!rows.length) html += `<div class="hint" style="padding:14px 10px">${filter === 'short' ? 'Nothing is short. Your people have what they want.' : filter === 'in' ? 'Nothing comes in from abroad. Realms you touch trade with you by land; a harbour opens the sea.' : 'Nothing here yet.'}</div>`;
    el.innerHTML = html;
    el.querySelectorAll('.mk-row.head button').forEach(b => b.addEventListener('click', () => { const k = b.dataset.sort; if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'name' || k === 'kind' ? 1 : -1; } renderTable(); }));
    el.querySelectorAll('button.mk-row[data-good]').forEach(b => b.addEventListener('click', () => { cur = +b.dataset.good; el.querySelectorAll('.mk-row.on').forEach(x => x.classList.remove('on')); b.classList.add('on'); renderGood(); }));
  }

  // ----- one good -----
  function renderGood() {
    const s = S(), m = M(), c = me(), EC = E(), G = EC.GOODS; const g = cur || 1, X = G[g]; const el = $('mk-good'); const NG = m.NG;
    const o = c ? c.id * NG + g : -1; const price = c ? m.price(c.id, g) : m.worldPrice(g); const chg = c ? moved(g, 10) : 0; const here = c ? m.stock[o] + m.out[o] + m.imp[o] > 1e-6 : true;
    let h = `<div class="mk-ghead ${X.kind}">${svg(X.key)}<div class="t"><h3>${escH(X.name)}</h3><span class="micro">${X.tk} · ${X.kind}${X.raw ? ' · from the land' : ' · made'} · wanted from the ${s.ERAS[X.era][0]}</span></div><div class="p"><span class="k">${here ? fp(price) : '—'}</span><span class="micro">${c ? (here ? `${arrow(chg)} ${Math.abs(chg * 100).toFixed(0)}% in ten years` : 'not to be had here') : 'world price'}</span></div></div>`;
    h += `<div class="mk-chartbox"><canvas id="mk-chart"></canvas><div class="mk-range">${[[64, '64 years'], [640, '640 years'], [0, 'All']].map(([n, l]) => `<button class="btn ${range === n ? 'on' : ''}" data-range="${n}">${l}</button>`).join('')}<span class="mk-key"><i class="w"></i>world${c ? '<i class="h"></i>here' : ''}<i class="b"></i>usual ${fp(X.base)}</span></div></div>`;
    if (c) {
      const w = m.wantsOf(c.id, g); const cv = cover(c.id, g);
      h += `<div class="mk-tiles"><div><span class="micro">Made a year</span><b>${fq(m.out[o])}</b></div><div><span class="micro">Wanted</span><b>${fq(m.need[o])}</b><small>${[w.people > 1e-6 ? 'people ' + fq(w.people) : '', w.works > 1e-6 ? 'workshops ' + fq(w.works) : '', w.merchants > 1e-6 ? 'merchants ' + fq(w.merchants) : ''].filter(Boolean).join(' · ')}</small></div><div><span class="micro">In store</span><b>${fq(m.stock[o])}</b></div><div><span class="micro">From abroad</span><b class="${m.imp[o] > 1e-6 ? 'in' : ''}">${fq(m.imp[o])}</b></div><div><span class="micro">Sent abroad</span><b class="${m.exp[o] > 1e-6 ? 'outg' : ''}">${fq(m.exp[o])}</b></div><div><span class="micro">Supply</span><b class="${cv < 0 ? '' : cv < 0.6 ? 'neg' : cv < 0.9 ? 'warn' : 'pos'}">${cv < 0 ? '—' : Math.round(cv * 100) + '%'}</b></div></div>`;
      // who it comes from and goes to
      const from = [], to = []; for (const cv2 of s.civs) { if (!cv2 || cv2 === c) continue; const a = m.pfIn[cv2.id * NG + g], b = m.pfOut[cv2.id * NG + g]; if (a > 1e-6) from.push([cv2, a]); if (b > 1e-6) to.push([cv2, b]); }
      from.sort((a, b) => b[1] - a[1]); to.sort((a, b) => b[1] - a[1]);
      const who = (l) => l.slice(0, 4).map(([cv2, q]) => `<button class="mk-realm" data-civ="${cv2.id}"><i style="background:${cv2.color}"></i>${escH(s.fullName(cv2))} <b>${fq(q)}</b></button>`).join('');
      if (from.length || to.length) h += `<div class="mk-flows">${from.length ? `<div><span class="micro">Comes from</span>${who(from)}</div>` : ''}${to.length ? `<div><span class="micro">Goes to</span>${who(to)}</div>` : ''}</div>`;
      // the land
      if (X.raw) { let cells = 0, worked = 0, unknown = 0, nearest = -1, nd = 1e9; for (let k = 0; k < s.LI.length; k++) { const i = s.LI[k]; if (s.goods[i] !== g) continue; if (s.owner[i] === c.id) { if (s.knows(c, i)) { cells++; if (s.special[i] & 512) worked++; } else unknown++; } else if (c.capital >= 0 && c.era >= s.gera[i]) { const d = ctx.cellDist(i, c.capital); if (d < nd) { nd = d; nearest = i; } } }
        h += `<div class="mk-land"><span class="micro">On your land</span><span>${cells ? `${cells} ${cells === 1 ? 'region yields' : 'regions yield'} ${X.name.toLowerCase()}${worked ? `, ${worked} worked in earnest` : ''}. <button class="linkish" data-show="own">Show one</button>` : `None of your land yields ${X.name.toLowerCase()}${unknown ? (s.know.gateOf(c.id, g) ? `: ${unknown === 1 ? 'one region holds' : unknown + ' regions hold'} it, but your people have yet to learn <button class="linkish" data-kgo="${s.know.gateOf(c.id, g).key}">${escH(s.know.gateOf(c.id, g).name)}</button>` : ' that your age can work') : ''}.`}${nearest >= 0 ? ` The nearest elsewhere is ${Math.round(nd * KM).toLocaleString()} km from your capital${s.owner[nearest] >= 0 && s.civs[s.owner[nearest]] ? ', in ' + escH(s.fullName(s.civs[s.owner[nearest]])) : ', in land nobody holds'}. <button class="linkish" data-show="${nearest}">Show it</button>` : ''}</span></div>`; }
    }
    // how it is made, and what it is for
    const lines = c ? m.lines(c.id) : []; const lineOf = (ri) => lines.find(l => l.r === ri);
    const recipe = (ri) => { const R = EC.RECIPES[ri]; const L = lineOf(ri); const gate = c ? s.know.craftGate(c.id, ri) : null; const locked = c && (R.era > c.era || !!gate); const ins = R.in.length ? R.in.map(([gi, q]) => `<span class="in">${q}× ${chip(G[gi])}</span>`).join('') : '<span class="mk-dim">work alone</span>';
      return `<div class="mk-rc${locked ? ' locked' : ''}"><div class="rn"><b>${escH(R.name)}</b><span class="micro">${locked && gate && gate.era <= c.era ? `your people have yet to learn <button class="linkish" data-kgo="${gate.key}">${escH(gate.name)}</button>` : locked ? 'from the ' + s.ERAS[R.era][0] : L && L.made > 1e-6 ? 'making ' + fq(L.made) + ' a year' : L ? (L.margin > 0.05 ? 'starting up' : 'not paying here') : ''}${L && !locked ? ` · ${pct(L.margin)} on a lot` : ''}</span></div><div class="rx">${ins}<span class="arr">→</span>${chip(G[R.out])}</div></div>`; };
    if (EC.MAKES[g].length) h += `<div class="mk-sect"><span class="micro">Made by</span>${EC.MAKES[g].map(recipe).join('')}</div>`;
    const usedBy = EC.USES[g]; const cats = EC.CATS.filter(C => C.m.some(mm => mm.g === g));
    if (usedBy.length || cats.length) h += `<div class="mk-sect"><span class="micro">Used for</span>${cats.length ? `<div class="mk-cats">${cats.map(C => `<span class="mk-cat">${escH(C.name)}${c ? ' <b>' + Math.round(m.sat[c.id * m.NC + C.id] * 100) + '%</b>' : ''}</span>`).join('')}</div>` : ''}${usedBy.map(recipe).join('')}</div>`;
    // the book, and the state's own hand in it
    if (c) {
      const bk = m.book(c.id, g); const e = m.econOf(c); const res = e.res[g] || 0; const nm = (who) => who < 0 ? 'Your own merchants' : s.civs[who] ? escH(s.fullName(s.civs[who])) : '—';
      const side = (list, cls) => list.length ? list.slice(0, 7).map(a => `<div class="mk-lv ${cls}"><span class="num">${fp(a.p)}</span><span class="num">${fq(a.q)}</span><span class="w">${nm(a.who)}</span></div>`).join('') : `<div class="hint">${cls === 'ask' ? 'Nobody you can reach has any to spare.' : 'Nobody you can reach is short of it.'}</div>`;
      h += `<div class="mk-sect"><span class="micro">The book <span class="mk-dim">· what the state can buy and sell this year</span></span><div class="mk-book"><div><div class="mk-lv head"><span>Price</span><span>Lots</span><span>Offered by</span></div>${side(bk.asks, 'ask')}</div><div><div class="mk-lv head"><span>Price</span><span>Lots</span><span>Wanted by</span></div>${side(bk.bids, 'bid')}</div></div>`;
      h += `<div class="mk-deal"><label class="micro" for="mk-qty">Lots</label><input type="text" id="mk-qty" inputmode="decimal" value="${fq(Math.max(bk.asks.length ? bk.asks[0].q : 0, res ? Math.min(res, 1) : 0) || 1).replace(/[kM]/, '')}"><button class="btn" id="mk-buy" ${bk.asks.length ? '' : 'disabled'}>Buy for the reserve</button><button class="btn" id="mk-sell" ${res > 1e-9 && bk.bids.length ? '' : 'disabled'}>Sell from it</button><button class="btn ghost" id="mk-release" ${res > 1e-9 ? '' : 'disabled'} title="Put it on your own market now, at four fifths of the price">Release at home</button><span class="mk-res">Reserve <b class="num">${fq(res)}</b></span></div><div class="hint" id="mk-quote"></div>`;
      const mine = e.orders.filter(od => od.g === g);
      h += `<div class="mk-orders">${mine.map(od => `<div class="mk-od"><span>${od.side === 'buy' ? 'Buy' : 'Sell'} up to <b>${fq(od.q)}</b> a year ${od.side === 'buy' ? 'at no more than' : 'at no less than'} <b>${fp(od.limit)}</b>${od.done ? ` · ${fq(od.done)} so far` : ''}</span><button class="btn ghost" data-cancel="${od.id}">Cancel</button></div>`).join('')}<div class="mk-odnew"><span class="micro">Standing order</span><select id="mk-od-side" class="btn"><option value="buy">Buy each year</option><option value="sell">Sell each year</option></select><input type="text" id="mk-od-q" inputmode="decimal" placeholder="lots" aria-label="Lots a year"><span class="micro">limit</span><input type="text" id="mk-od-p" inputmode="decimal" value="${fp(price)}" aria-label="Limit price"><button class="btn" id="mk-od-add">Place</button></div></div></div>`;
      h += `<div class="mk-sect"><span class="micro">At the border</span><div class="mk-bans"><label><input type="checkbox" id="mk-nox" ${e.noX.includes(g) ? 'checked' : ''}> No ${X.name.toLowerCase()} may leave the realm</label><label><input type="checkbox" id="mk-nom" ${e.noM.includes(g) ? 'checked' : ''}> None may come in</label></div></div>`;
    }
    el.innerHTML = h; el.scrollTop = 0;
    drawChart(g);
    el.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => { range = +b.dataset.range; renderGood(); }));
    el.querySelectorAll('[data-civ]').forEach(b => b.addEventListener('click', () => { const cv = s.civs[+b.dataset.civ]; if (cv && cv.capital >= 0) { close(); ctx.flyTo(cv.capital, 0.12); } }));
    el.querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', () => { let i = b.dataset.show === 'own' ? -1 : +b.dataset.show; if (i < 0) { let bp = -1; for (let k = 0; k < s.LI.length; k++) { const j = s.LI[k]; if (s.goods[j] === g && s.owner[j] === c.id && s.pop[j] > bp) { bp = s.pop[j]; i = j; } } } if (i >= 0) { close(); ctx.flyTo(i, 0.03); } }));
    if (!c) return;
    const qty = () => { const v = parseFloat(String($('mk-qty').value).replace(',', '.')); return isFinite(v) && v > 0 ? v : 0; };
    const quote = () => { const q = qty(); const el2 = $('mk-quote'); if (!q) { el2.textContent = ''; return; } const b = m.stateBuy(c.id, g, q, 0, true), sl = m.stateSell(c.id, g, q, 0, true); el2.innerHTML = `${b.q > 0 ? `Buying ${fq(b.q)} would cost <b>${fc(b.cost)}</b> (${fp(b.avg)} a lot${b.q < q - 1e-9 ? ', all there is' : ''}).` : 'There is none to buy.'} ${sl.q > 0 ? `Selling ${fq(sl.q)} would bring <b>${fc(sl.cost)}</b> (${fp(sl.avg)} a lot).` : ''}`; };
    $('mk-qty').addEventListener('input', quote); quote();
    const done = (r, verb) => { ctx.toast(r.q > 0 ? `${verb} ${fq(r.q)} lots of ${X.name.toLowerCase()} for ${fc(r.cost)}` : `Nothing ${verb.toLowerCase()}`); ctx.afterAct(); render(); };
    $('mk-buy').addEventListener('click', () => { const q = qty(); if (q) done(m.stateBuy(c.id, g, q), 'Bought'); });
    $('mk-sell').addEventListener('click', () => { const q = qty(); if (q) done(m.stateSell(c.id, g, q), 'Sold'); });
    $('mk-release').addEventListener('click', () => { const q = qty(); if (q) done(m.stateRelease(c.id, g, q), 'Released'); });
    $('mk-od-add').addEventListener('click', () => { const q = parseFloat(String($('mk-od-q').value).replace(',', '.')), p = parseFloat(String($('mk-od-p').value).replace(/,/g, '')); if (!(q > 0) || !(p > 0)) { ctx.toast('An order needs a number of lots and a limit price'); return; } const e = m.econOf(c); if (e.orders.length >= 24) { ctx.toast('Two dozen standing orders is all the clerks can keep'); return; } e.seq = (e.seq || 0) + 1; e.orders.push({ id: e.seq, g, side: $('mk-od-side').value, q, limit: p }); renderGood(); });
    el.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => { const e = m.econOf(c); e.orders = e.orders.filter(od => od.id !== +b.dataset.cancel); renderGood(); }));
    const ban = (key, on) => { const e = m.econOf(c); const k = e[key].indexOf(g); if (on && k < 0) e[key].push(g); else if (!on && k >= 0) e[key].splice(k, 1); };
    $('mk-nox').addEventListener('change', (ev) => ban('noX', ev.target.checked)); $('mk-nom').addEventListener('change', (ev) => ban('noM', ev.target.checked));
  }
  function drawChart(g) {
    const cv = $('mk-chart'); if (!cv) return; const r = cv.getBoundingClientRect(); if (!r.width) { requestAnimationFrame(() => { if ($('mk-chart') === cv && cv.getBoundingClientRect().width) drawChart(g); }); return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = r.width * dpr; cv.height = r.height * dpr; const x = cv.getContext('2d'); x.scale(dpr, dpr); const w = r.width, h = r.height; x.clearRect(0, 0, w, h);
    const m = M(), c = me(), X = E().GOODS[g]; let world = m.series(g), home = c ? m.series(g, true) : [];
    const span = range || (world.length ? world[0][0] : 64); world = world.filter(p => p[0] <= span); home = home.filter(p => p[0] <= span);
    const all = world.concat(home).map(p => p[1]).concat([X.base]); let lo = Math.min(...all), hi = Math.max(...all); if (!(hi > lo)) { hi = lo * 1.2 + 0.01; lo = lo * 0.8; } const padv = (hi - lo) * 0.12; lo = Math.max(0, lo - padv); hi += padv;
    const L = 46, R = 8, T = 8, B = 20; const Xp = (ago) => L + (1 - ago / Math.max(1, span)) * (w - L - R), Yp = (v) => T + (1 - (v - lo) / (hi - lo)) * (h - T - B);
    x.font = '11px Noto Sans, sans-serif'; x.fillStyle = 'rgba(236,233,226,0.45)'; x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = 1;
    for (let k = 0; k <= 3; k++) { const v = lo + (hi - lo) * k / 3, y = Yp(v); x.beginPath(); x.moveTo(L, y); x.lineTo(w - R, y); x.stroke(); x.fillText(fp(v), 2, y + 4); }
    const year = S().year; const tick = span <= 80 ? 20 : span <= 800 ? 200 : span <= 3000 ? 500 : 2000;
    for (let yr = Math.ceil((year - span) / tick) * tick; yr <= year; yr += tick) { const px = Xp(year - yr); x.fillText(yr < 0 ? -yr + ' BC' : yr + ' AD', Math.min(w - 44, Math.max(L, px - 16)), h - 5); }
    x.setLineDash([4, 4]); x.strokeStyle = 'rgba(236,233,226,0.28)'; x.beginPath(); x.moveTo(L, Yp(X.base)); x.lineTo(w - R, Yp(X.base)); x.stroke(); x.setLineDash([]);
    const line = (pts, col, wd) => { if (pts.length < 2) return; x.strokeStyle = col; x.lineWidth = wd; x.lineJoin = 'round'; x.beginPath(); pts.forEach((p, k) => { const px = Xp(p[0]), py = Yp(p[1]); if (k) x.lineTo(px, py); else x.moveTo(px, py); }); x.stroke(); };
    line(world, '#D6B25E', 1.6); line(home, '#7FE3FF', 1.8);
    if (world.length < 2 && home.length < 2) { x.fillStyle = 'rgba(236,233,226,0.45)'; x.fillText('No record yet: the first prices are being made.', L + 8, h / 2); }
  }

  // ----- trade: the realms the merchants reach -----
  function renderTrade() {
    const s = S(), m = M(), c = me(), G = E().GOODS; const el = $('mk-trade'); if (!c) { el.innerHTML = '<div class="hint">You hold no realm.</div>'; return; }
    const e = m.econOf(c); const NG = m.NG; const parts = m.partners(c.id).sort((a, b) => b.v - a.v);
    let h = `<div class="mk-tiles wide"><div><span class="micro">Comes in</span><b>${fc(m.impV[c.id])}</b><small>coin's worth a year</small></div><div><span class="micro">Goes out</span><b>${fc(m.expV[c.id])}</b></div><div><span class="micro">Balance</span><b class="${m.expV[c.id] - m.impV[c.id] >= 0 ? 'pos' : 'neg'}">${fc(m.expV[c.id] - m.impV[c.id])}</b></div><div><span class="micro">Customs taken</span><b>${fc(m.rev[c.id])}</b><small>to the treasury</small></div></div>`;
    h += `<div class="mk-customs"><span class="micro">Customs at the border</span><input type="range" id="mk-cust" min="0" max="0.4" step="0.01" value="${e.customs}"><b class="num" id="mk-cust-v">${Math.round(e.customs * 100)}%</b><span class="hint">Taken on everything that comes in. More coin on each lot, but fewer lots come, and what your people lack costs them more.</span></div>`;
    if (!parts.length) h += `<div class="hint" style="padding:10px 2px">No merchants reach you yet. Realms whose land touches yours trade with you by land; a Harbour in a coastal town opens the sea.</div>`;
    else {
      h += `<div class="mk-prow head"><span>Realm</span><span>Road</span><span>We take</span><span>We send</span><span class="num">Worth</span></div>`;
      for (const p of parts) { const cv = s.civs[p.id]; const ins = [], outs = []; for (let g = 1; g < NG; g++) { const a = m.pfIn[p.id * NG + g], b = m.pfOut[p.id * NG + g]; if (a > 1e-6) ins.push([g, a * G[g].base]); if (b > 1e-6) outs.push([g, b * G[g].base]); } ins.sort((a, b) => b[1] - a[1]); outs.sort((a, b) => b[1] - a[1]);
        const chips = (l) => l.length ? l.slice(0, 4).map(([g]) => chip(G[g])).join('') + (l.length > 4 ? `<span class="mk-dim"> +${l.length - 4}</span>` : '') : '<span class="mk-dim">nothing</span>';
        const fr = (bulk) => Math.round(Math.max(0.02, bulk * p.k) * 100);
        h += `<div class="mk-prow${p.war ? ' war' : ''}" data-civ="${p.id}"><span class="r"><i style="background:${cv.color}"></i><b>${escH(s.fullName(cv))}</b><small>${s.ERAS[cv.era][0]}</small></span><span><b>${p.sea ? 'By sea' : 'By land'}</b><small>${Math.round(p.d * KM).toLocaleString()} km · grain +${fr(1.5)}% · silk +${fr(0.1)}%</small></span><span class="gc">${p.war ? '<span class="neg">At war: nothing crosses</span>' : chips(ins)}</span><span class="gc">${p.war ? '' : chips(outs)}</span><span class="num">${fc(ins.reduce((a, x) => a + x[1], 0) + outs.reduce((a, x) => a + x[1], 0))}</span></div>`; }
    }
    el.innerHTML = h;
    const sl = $('mk-cust'); sl.addEventListener('input', () => { e.customs = +sl.value; $('mk-cust-v').textContent = Math.round(e.customs * 100) + '%'; });
    el.querySelectorAll('.mk-prow[data-civ]').forEach(b => b.addEventListener('click', (ev) => { if (ev.target.closest('[data-good]')) return; const cv = s.civs[+b.dataset.civ]; if (cv && cv.capital >= 0) { close(); ctx.flyTo(cv.capital, 0.12); } }));
  }

  // ----- workshops: what the realm's hands are making -----
  const IND_NOTE = { workshop: 'crafts', weaver: 'cloth', smithy: 'metalwork', brewery: 'brewing', granary: 'keeps food', warehouse: 'trade', shipyard: 'ships', factory: 'heavy industry', refinery: 'chemicals', lab: 'electronics' };
  function renderWorks() {
    const s = S(), m = M(), c = me(), EC = E(), G = EC.GOODS; const el = $('mk-works'); if (!c) { el.innerHTML = '<div class="hint">You hold no realm.</div>'; return; }
    const lines = m.lines(c.id); const tot = lines.reduce((a, l) => a + l.work, 0); const NI = s.IND.length;
    let h = `<div class="mk-tiles wide"><div><span class="micro">Hands at work</span><b>${Math.round(m.util[c.id] * 100)}%</b><small>of what your towns can do</small></div><div><span class="micro">A day's wage</span><b>${m.wage(c.id).toFixed(2)}</b><small>rises as hands run short</small></div><div><span class="micro">Townspeople</span><b>${ctx.fmtPop(s.urban[c.id])}</b><small>towns make; villages farm</small></div><div><span class="micro">Made, less used</span><b>${fc(m.gdp[c.id])}</b><small>coin's worth a year</small></div></div>`;
    h += `<div class="mk-sect"><span class="micro">What your towns have raised</span><div class="mk-inds">${s.IND.map((k, n) => { const cnt = s.indN[c.id * NI + n]; const B = s.BUILD[k]; const need = s.needFor(k, c.capital); const locked = !!need; return `<span class="mk-ind${cnt ? ' has' : ''}${locked ? ' locked' : ''}" title="${escH(B.desc)}"><b>${cnt || (locked ? '·' : '0')}</b>${escH(B.name)}<small>${locked ? 'needs ' + escH(need.name) : IND_NOTE[k]}</small></span>`; }).join('')}</div><div class="hint">Raise them from a town's Build panel. The first of a kind makes its work a third cheaper across the realm; more help less each.</div></div>`;
    const act = lines.filter(l => l.plan > 1e-9 || l.margin > 0).sort((a, b) => b.work - a.work || b.margin - a.margin); const idle = lines.filter(l => !(l.plan > 1e-9 || l.margin > 0));
    h += `<div class="mk-sect"><span class="micro">Lines of work</span><div class="mk-wrow head"><span>Trade</span><span>Out of</span><span class="num">Made</span><span class="num">On a lot</span><span>Share of hands</span></div>`;
    for (const l of act) { const R = EC.RECIPES[l.r]; const sh = tot > 0 ? l.work / tot : 0;
      h += `<div class="mk-wrow"><span><b>${escH(R.name)}</b>${chip(G[R.out])}</span><span class="gc">${R.in.length ? R.in.map(([g]) => chip(G[g], false, l.short.includes(g) ? 'short' : '')).join('') : '<span class="mk-dim">work alone</span>'}</span><span class="num">${fq(l.made)}${l.plan > l.made * 1.02 + 1e-9 ? `<small>of ${fq(l.plan)}</small>` : ''}</span><span class="num ${l.margin >= 0 ? 'pos' : 'neg'}">${pct(l.margin)}</span><span class="mk-bar"><i style="width:${(sh * 100).toFixed(1)}%"></i><em>${sh >= 0.005 ? Math.round(sh * 100) + '%' : ''}</em></span></div>`; }
    if (!act.length) h += `<div class="hint" style="padding:8px 2px">Nothing is being made yet. Workshops start where a trade pays: where its materials are cheap and what it makes is dear.</div>`;
    if (idle.length) h += `<div class="mk-idle"><span class="micro">Not paying here now</span>${idle.map(l => `<span title="${pct(l.margin)} on a lot">${escH(EC.RECIPES[l.r].name)}</span>`).join('')}</div>`;
    { const todo = []; EC.RECIPES.forEach((R, ri) => { const gate = R.era <= c.era ? s.know.craftGate(c.id, ri) : null; if (gate) todo.push([R, gate]); }); if (todo.length) h += `<div class="mk-idle"><span class="micro">Not yet learned</span>${todo.map(([R, gate]) => `<span>${escH(R.name)} <button class="linkish" data-kgo="${gate.key}">${escH(gate.name)}</button></span>`).join('')}</div>`; }
    const later = EC.RECIPES.filter(R => R.era === c.era + 1); if (later.length) h += `<div class="mk-idle"><span class="micro">Comes with the ${s.ERAS[Math.min(8, c.era + 1)][0]}</span>${later.map(R => `<span>${escH(R.name)}</span>`).join('')}</div>`;
    h += `</div>`; el.innerHTML = h;
  }

  // ----- the ledger: the treasury's year, and how the people live -----
  function renderLedger() {
    const s = S(), m = M(), c = me(), EC = E(), G = EC.GOODS; const el = $('mk-ledger'); if (!c) { el.innerHTML = '<div class="hint">You hold no realm.</div>'; return; }
    const p = s.incomeParts(c); const e = m.econOf(c); const NG = m.NG; const row = (k, v, cls, note) => `<div class="mk-lrow ${cls || ''}"><span>${k}${note ? `<small>${note}</small>` : ''}</span><b class="num">${v}</b></div>`;
    let h = `<div class="mk-two"><div class="mk-sect"><span class="micro">The treasury's year</span>${row('Taxes', '+' + fc(p.taxes), '', `${ctx.fmtPop(s.popOf[c.id])} people, taxed at ${c.policy.tax.toFixed(1)}×`)}${row('Harbours', '+' + fc(p.ports), '', `${s.ports[c.id]} of them`)}${row('Markets', '+' + fc(p.markets), '', `${s.markets[c.id]} of them`)}${row('Mines and estates', '+' + fc(p.mines))}${row('Prosperity', '+' + fc(p.living), '', `people live at ${Math.round(m.LS[c.id] * 100)}% of what they want`)}${row('Customs', '+' + fc(p.customs), '', `${Math.round(e.customs * 100)}% on what comes in`)}${p.upkeep ? row('The army', (p.upkeep >= 0 ? '−' : '+') + fc(Math.abs(p.upkeep)), p.upkeep >= 0 ? 'neg' : '', `military spending at ${c.policy.military.toFixed(1)}×`) : ''}${p.scholars ? row('Scholars', (p.scholars >= 0 ? '−' : '+') + fc(Math.abs(p.scholars)), p.scholars >= 0 ? 'neg' : '', `research at ${c.policy.research.toFixed(1)}×`) : ''}${Math.abs(p.state) >= 0.05 ? row('What the laws spend', (p.state >= 0 ? '−' : '+') + fc(Math.abs(p.state)), p.state >= 0 ? 'neg' : '', 'schools, doles, officials: by the laws in force') : ''}${Math.abs(p.tribute) >= 0.05 ? row(p.tribute >= 0 ? 'Tribute and reparations' : 'Tribute and reparations paid', (p.tribute >= 0 ? '+' : '−') + fc(Math.abs(p.tribute)), p.tribute >= 0 ? '' : 'neg', p.tribute >= 0 ? 'what vassals and the beaten pay you' : 'to a lord, or to a victor') : ''}${row('Net a year', (p.net >= 0 ? '+' : '−') + fc(Math.abs(p.net)), 'sum ' + (p.net >= 0 ? 'pos' : 'neg'))}${row('In the treasury', ctx.fmtInt(c.wealth), 'sum')}${e.led.bought || e.led.sold ? row('The state has bought', fc(e.led.bought), '', 'for the reserve, all told') + row('and sold', fc(e.led.sold)) : ''}</div>`;
    h += `<div class="mk-sect"><span class="micro">How your people live</span>`;
    for (const C of EC.CATS) { const B = m.Bk[c.id * m.NC + C.id]; if (!(B > 0)) continue; const v = m.sat[c.id * m.NC + C.id];
      const short = C.m.filter(mm => mm.from <= c.era + 1 && c.era <= mm.to).map(mm => [mm.g, m.fin[c.id * NG + mm.g] > 1e-9 ? m.got[c.id * NG + mm.g] / m.fin[c.id * NG + mm.g] : 1, m.sh[c.id * EC.NM + mm.idx]]).filter(x => x[1] < 0.6 && x[2] > 0.04).sort((a, b) => b[2] - a[2]).slice(0, 3);
      h += `<div class="mk-want"><span class="n">${escH(C.name)}${C.state ? '<small>the state</small>' : ''}</span><span class="mk-bar ${v < 0.5 ? 'bad' : v < 0.8 ? 'low' : 'ok'}"><i style="width:${(v * 100).toFixed(0)}%"></i></span><b class="num">${Math.round(v * 100)}%</b><span class="gc">${short.length ? '<span class="mk-dim">short of</span> ' + short.map(x => chip(G[x[0]])).join('') : ''}</span></div>`; }
    h += `<div class="hint">Food, clothing, shelter and the rest decide how well they live: that raises what they can pay in tax, and luxuries keep them content. A hungry people grows restless. Arms decide how strong the army is; timber, stone and tools what building costs.</div></div></div>`;
    const res = Object.keys(e.res).map(k => [+k, e.res[k]]).filter(x => x[1] > 1e-9).sort((a, b) => b[1] * m.price(c.id, b[0]) - a[1] * m.price(c.id, a[0]));
    h += `<div class="mk-two"><div class="mk-sect"><span class="micro">The state's reserve</span>${res.length ? res.map(([g, q]) => `<div class="mk-lrow"><span>${chip(G[g])}</span><b class="num">${fq(q)} <small>worth ${fc(q * m.price(c.id, g))}</small></b></div>`).join('') : '<div class="hint">Empty. Buy a good on its page to hold it against a bad year, or to sell when it is dear.</div>'}${e.orders.length ? `<span class="micro" style="margin-top:8px">Standing orders</span>` + e.orders.map(od => `<div class="mk-lrow"><span>${od.side === 'buy' ? 'Buy' : 'Sell'} ${chip(G[od.g])}</span><b class="num">${fq(od.q)} a year at ${fp(od.limit)}</b></div>`).join('') : ''}</div>`;
    const top = s.civs.filter(Boolean).sort((a, b) => m.gdp[b.id] - m.gdp[a.id]); const rank = top.indexOf(c) + 1; const best = top.length ? m.gdp[top[0].id] : 1;
    h += `<div class="mk-sect"><span class="micro">The world's makers <span class="mk-dim">· you are ${rank} of ${top.length}</span></span>${top.slice(0, 6).concat(rank > 6 ? [c] : []).map((cv) => `<div class="mk-want"><span class="n"><i class="sw" style="background:${cv.color}"></i>${escH(s.fullName(cv))}</span><span class="mk-bar ok"><i style="width:${(100 * m.gdp[cv.id] / Math.max(1e-9, best)).toFixed(0)}%;background:${cv.color}"></i></span><b class="num">${fc(m.gdp[cv.id])}</b><span></span></div>`).join('')}</div></div>`;
    el.innerHTML = h;
  }

  // ----- outside the screen: the movers on the bottom bar, the saved world's figures on the home screen -----
  function movers(n) {
    const s = S(), c = me(); if (!s || !c) return []; const m = M(), G = E().GOODS; const outp = [];
    for (let g = 1; g < m.NG; g++) { const o = c.id * m.NG + g; if (!known(G[g], c) || !(m.need[o] > 1e-6) || !(m.stock[o] + m.out[o] + m.imp[o] > 1e-6)) continue; const d = moved(g, n || 10); if (Math.abs(d) > 0.03) outp.push([g, d, Math.abs(d) * Math.sqrt(m.need[o] * G[g].base)]); }
    outp.sort((a, b) => b[2] - a[2]); return outp.slice(0, 3);
  }
  function renderMovers() {
    const el = $('movers'); if (!el) return; const s = S(), c = me(); if (!s || !c) { el.hidden = true; return; } const mv = movers(ctx.turnYears ? Math.min(60, Math.max(5, ctx.turnYears())) : 10); const G = E().GOODS;
    const html = mv.map(([g, d]) => `<button data-good="${g}" title="${escH(G[g].name)}: ${fp(M().price(c.id, g))} a lot here"><b>${G[g].tk}</b>${arrow(d)}<i class="${d > 0 ? 'up' : 'dn'}">${Math.abs(d * 100).toFixed(0)}%</i></button>`).join('');
    el.hidden = !mv.length; if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
  }
  // what is short in the player's realm, worst first: [category, how well it is met] (for the advisor and the report)
  function shortages() {
    const s = S(), c = me(); if (!s || !c) return []; const m = M(), outp = [];
    for (const C of E().CATS) { if (!(m.Bk[c.id * m.NC + C.id] > 0)) continue; const v = m.sat[c.id * m.NC + C.id]; if (v < 0.6) outp.push([C, v]); }
    return outp.sort((a, b) => a[1] - b[1]);
  }
  function homeLine() {
    const s = S(); if (!s || !s.market) return ''; const m = M(), G = E().GOODS; if (!(m.worldGdp > 0)) return '';
    const pick = ['grain', 'rice', 'timber', 'copper', 'tin', 'iron', 'gold', 'silk', 'spices', 'cloth', 'coal', 'oil', 'steel', 'electronics'].map(k => E().ID[k]).filter(g => m.wOut[g] > 0).slice(-7);
    return `<span><b>World product</b> ${fc(m.worldGdp)}</span>` + pick.map(g => { const p = m.series(g); const now = m.worldPrice(g), then = p.length > 10 ? p[p.length - 11][1] : now; const d = then > 0 ? now / then - 1 : 0; return `<span><b>${G[g].tk}</b> ${fp(now)} ${arrow(d)}</span>`; }).join('');
  }

  return { ICON, svg, chip, fq, fp, fc, init, open, close, isOpen, refresh, render, renderMovers, movers, shortages, homeLine, showGood };
})();
