// Holocene country (classic script; exposes window.COUNTRY): the Land tab of the laws screen. The realm's woods (how much of what
// would stand by nature stands now, in the lens's bands: wildwood, woods with clearings, thinned, cleared, growing back), its kinds
// of land, this year's harvest on it, its timber at the market, the world's woods and the realms that keep most and least of
// theirs; and the realm's word on its woods (woods.js's policies: cleared as the farmers will, kept for the crown, planted). It reads
// sim.woods, sim.climate and the market and calls sim.woodsPolicy; gov.js draws it while its tab is open.
window.COUNTRY = (function () {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const TREE = 'M12 3l5 7h-3l4 6h-5v5h-2v-5H6l4-6H7z', HILLS = 'M3 18l5-7 4 5 3-4 6 6zM3 18h18', WHEAT = 'M12 21V8M12 8c0-3 2-5 5-5 0 3-2 5-5 5zM12 13c0-3-2-5-5-5 0 3 2 5 5 5zM12 17c0-3 2-5 5-5 0 3-2 5-5 5z';
  const LOG = 'M5 9h11a3 3 0 0 1 0 6H5a3 3 0 0 1 0-6zM16 9a3 3 0 0 0 0 6', GLOBE = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18';
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="${d}"/></svg>`;
  const pct = (v) => (v >= 0.995 ? '100%' : v >= 0.01 ? Math.round(v * 100) + '%' : v > 0 ? '<1%' : '0%');
  const km2 = (v) => (v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + ' million km²' : (v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v)).toLocaleString() + ' km²');
  // (a row with a share has its bar; one without has its number in full: as the Peoples tab has them)
  const row = (dot, name, sub, share, n) => `<div class="gv-frow fk-row${share === undefined ? ' n' : ''}"><i style="background:${dot}"></i><span><b>${esc(name)}</b><small>${esc(sub)}</small></span>${share === undefined ? '' : `<span class="gv-bar"><i style="width:${(Math.min(1, Math.max(0, share)) * 100).toFixed(1)}%;background:${dot}"></i></span>`}<em>${n}</em></div>`;
  const fld = (ic, t, note) => `<div class="gv-field">${svg(ic)}<b>${t}</b><small>${note}</small></div>`;
  // the land's kinds, a colour each (by what grows there: the woods dark, the grass and the fields gold, the dry lands sand)
  const KIND_CSS = ['#3a5f86', '#dfe8ef', '#a9b59a', '#2f5a3a', '#d8b878', '#b9a86a', '#c9b45c', '#4f7d3d', '#8b8d4a', '#7da04a', '#b49a4e', '#246b3a', '#6d8a4b', '#a5967a', '#3f6b40', '#3b7a46'];

  function render(host, info, s, c) {
    const X = s.woods, WD = window.WOODS;
    if (!X || !WD) { host.innerHTML = '<p class="gv-text">A world from before the land had kinds keeps no count of its land and its woods.</p>'; info.innerHTML = ''; return; }
    const C = X.census(c.id), B = WD.BANDS, share = C.meNature > 0 ? C.meNow / C.meNature : 1, realm = s.fullName(c);
    // (the realm's woods by the lens's bands, as shares of what would stand by nature)
    const woods = C.meNature > 0 ? B.map((b, k) => (k === 0 || !(C.mine[k] > 0) ? '' : row(b.css, b.name.replace(/ \(.*\)$/, ''), b.key === 'regrow' ? 'where people have left the land' : b.name.replace(/^[^(]*\(|\)$/g, '') + ' of nature\'s woods', C.mine[k] / C.meNature, pct(C.mine[k] / C.meNature)))).join('') : '';
    // (its kinds of land, the largest first)
    const L = s.landOf ? s.landOf(c.id) : [], lt = L.reduce((a, x) => a + x[1], 0);
    const kinds = window.LAND ? L.slice(0, 6).map(([k, n]) => row(KIND_CSS[k] || 'var(--text-3)', LAND.CLASSES[k].name, LAND.CLASSES[k].text || '', n / Math.max(1, lt), pct(n / Math.max(1, lt)))).join('') : '';
    // (this year's harvest and the weather on the realm's land: climate.js)
    const CL = s.climate, hv = s.harvestOf ? s.harvestOf(c.id) : 1, dead = s.starvedOf ? s.starvedOf(c.id) : 0, sp = CL ? CL.spellsIn(c.id) : [], ep = CL ? CL.epoch() : null;
    const harvest = row(hv < 0.95 ? 'var(--neg)' : hv > 1.02 ? 'var(--pos)' : 'var(--text-3)', `${Math.round(hv * 100)} in a hundred of an ordinary year`, dead > 0.01 ? `${Math.round(dead * 1000).toLocaleString()} starved this year` : 'nobody starved this year', undefined, '')
      + sp.slice(0, 3).map((x) => row(x.kind === 'drought' ? '#c27a34' : '#4f8f3c', x.kind === 'drought' ? `A drought, its ${ord(x.years)} year` : `Good harvests, their ${ord(x.years)} year`, `over ${x.cells} of your regions, ${Math.round(x.worst * 100)} in a hundred at the ${x.kind === 'drought' ? 'worst' : 'best'}`, undefined, '')).join('');
    // (timber: what the woods yield against what they would, and its price at home against the usual)
    const m = s.market, g = window.ECON ? ECON.ID.timber : 0; const pr = m && g ? m.price(c.id, g) / ECON.GOODS[g].base : 1;
    const timber = row('#8a6a44', `Your woods yield ${pct(0.25 + 0.75 * share)} of the timber they would`, 'hedgerows, coppices and orchards keep a quarter where the woods are gone', undefined, '')
      + (m && g ? row(pr > 1.15 ? 'var(--neg)' : pr < 0.87 ? 'var(--pos)' : 'var(--text-3)', `Timber costs ${pr >= 1 ? pct(pr - 1) + ' more' : pct(1 - pr) + ' less'} than usual`, pr > 1.15 ? 'your builders and smiths buy it dear, or from abroad' : 'at home, against the usual price', undefined, '') : '');
    // (the world's woods, and the realms that keep most and least of theirs: of those with a large share of the world's woods)
    const R = X.realms(); const big = []; for (const cv of s.civs) if (cv && R.nature[cv.id] >= 20000) big.push(cv);
    const most = big.slice().sort((a, b) => R.now[b.id] - R.now[a.id]).slice(0, 4), least = big.filter((cv) => !most.includes(cv)).sort((a, b) => R.now[a.id] / R.nature[a.id] - R.now[b.id] / R.nature[b.id]).slice(0, 3);
    const rrow = (cv, sub) => row(cv.color || 'var(--text-3)', s.fullName(cv) + (cv.id === c.id ? ' (you)' : ''), sub, R.now[cv.id] / R.nature[cv.id], pct(R.now[cv.id] / R.nature[cv.id]));
    const world = most.map((cv) => rrow(cv, km2(R.now[cv.id]) + ' of wood')).join('') + least.map((cv) => rrow(cv, 'has cleared the most of its woods')).join('');
    host.innerHTML = `<div class="gv-row">${fld(TREE, 'Your woods', C.meNature > 0 ? `${km2(C.meNow)} of wood in ${esc(realm)}: ${pct(share)} of what would stand by nature` : 'your land has next to no wood by nature')}<div class="gv-flist">${woods || '<span class="mk-dim">Steppe, desert and tundra: little wood grows here</span>'}</div></div>
      <div class="gv-row">${fld(HILLS, 'Your land', 'its kinds, by the regions of each')}<div class="gv-flist">${kinds || '<span class="mk-dim">No land yet</span>'}</div></div>
      <div class="gv-row">${fld(WHEAT, 'This year', ep ? esc(ep.name.charAt(0).toUpperCase() + ep.name.slice(1)) : 'the harvest')}<div class="gv-flist">${harvest}</div></div>
      <div class="gv-row">${fld(LOG, 'Timber', 'for houses, ships, charcoal and the forges')}<div class="gv-flist">${timber}</div></div>
      <div class="gv-row">${fld(GLOBE, 'The world', `${pct(C.now / Math.max(1e-9, C.nature))} of nature's woods still stand`)}<div class="gv-flist">${world || '<span class="mk-dim">No realm holds much of the world\'s woods yet</span>'}</div></div>`;
    info.innerHTML = word(s, c, X, WD, share);
  }
  const ord = (n) => { const k = n % 100, t = ['th', 'st', 'nd', 'rd']; return n + (k >= 11 && k <= 13 ? 'th' : t[n % 10] || 'th'); };
  // the realm's word on its woods: what each does and costs, the planting from the Industrial age
  function word(s, c, X, WD, share) {
    const on = X.policy(c), plantOk = (c.era | 0) >= WD.PLANT_ERA;
    const opt = WD.POLICY.map(([k, name, text], i) => { const off = k === 'plant' && !plantOk; return `<button class="gv-tenet${i === on ? ' on' : ''}" data-woods="${k}"${off ? ' disabled' : ''}><b>${esc(name)}</b><small>${esc(text)}${off ? ` From the ${esc(s.ERAS[WD.PLANT_ERA][0])} age.` : ''}</small></button>`; }).join('');
    return `<div class="gv-head"><span class="ic">${svg(TREE)}</span><div><h3>The woods</h3><div class="micro">${esc(s.fullName(c))} · ${pct(share)} of nature's woods stand</div></div></div>
      <p class="gv-text">Where people farm they clear the woods for fields, pasture and fallow, so much land a head as their age farms it, as fast as their tools allow: fire and stone axes first, iron axes and the plough, at last machines. Where they leave, the woods grow back, half in some sixty years. A realm that has cleared its woods buys its timber from those that kept theirs.</p>
      <div class="gv-sect"><div class="micro">Your word on your woods</div><div class="gv-tenets">${opt}</div><div class="gv-state">Royal forests please the nobles, who hunt in them, and anger the farmers kept out of them.</div></div>`;
  }
  function click(e, s, toast) {
    const b = e.target.closest('[data-woods]'); if (!b || b.disabled) return false;
    const WD = window.WOODS, r = s.woodsPolicy(b.dataset.woods);
    if (r) toast(r); else toast(`Your woods: ${WD.POLICY[WD.PK[b.dataset.woods]][1].toLowerCase()}`);
    return true;
  }
  return { render, click };
})();
