// Holocene culture screen (classic script; exposes window.WORKS): the realm's great people and the works it holds, its renown
// against its age, its golden age and its patronage; the world's renowned realms, its greatest works and its great people of
// late. It reads the simulation's culture (sim.culture, culture.js) and calls its few actions: patronage and commissions.
window.WORKS = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="${d}"/></svg>`;
  // a glyph for each kind of great person, 24 x 24
  const ICON = {
    artist: 'M12 3c-4 0-8 3-8 8 0 3 2 5 4 5 1.500 0 2-1 2-2s1-2 2-2h3c3 0 5-2 5-5 0-2-3-4-8-4zM7.500 10.500h.01M10.500 7h.01M15 7.500h.01',
    builder: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6M3 10h18',
    poet: 'M4 20c4-1 8-5 10-9 1-2 2-5 6-7-1 4-3 6-5 7 2 0 3-1 4-1-2 3-5 4-8 4M4 20l6-6',
    sage: 'M12 3a5 5 0 0 1 5 5c0 2-1 3-2 4v3H9v-3C8 11 7 10 7 8a5 5 0 0 1 5-5zM9 18h6M10 21h4',
    playwright: 'M4 5c3 0 5 1 8 1s5-1 8-1v6c0 4-4 7-8 7s-8-3-8-7zM8.500 10l1.500 1M15.500 10L14 11M9 14c2 1.500 4 1.500 6 0',
    historian: 'M6 4h10l2 2v14H6zM9 9h6M9 12h6M9 15h4',
    composer: 'M9 18a3 3 0 1 1-3-3h3V5l11-2v12a3 3 0 1 1-3-3h3',
    novelist: 'M12 6c-2-1.500-5-2-8-2v14c3 0 6 .500 8 2 2-1.500 5-2 8-2V4c-3 0-6 .500-8 2zM12 6v14',
    film: 'M4 6h16v12H4zM4 10h16M8 6v4M12 6v4M16 6v4',
  };
  const LYRE = 'M7 4c-2 3-2 9 0 13M17 4c2 3 2 9 0 13M7 17h10M9 7v10M12 6v11M15 7v10';
  const PATRON = [['Neglect', 'The court pays for nothing: great people come less often'], ['Custom', 'What a court of your age gives as a matter of course'], ['Generous', 'Commissions and pensions: half again as often, for a twelfth of your income'], ['Lavish', 'Academies, theatres and prizes: more than twice as often, for a fifth of your income']];
  // what a kind's works bring the realm (culture.js: boon)
  const BRINGS = { insight: ['insight', 'His works bring your scholars insight'], auth: ['authority', 'His works bring the crown authority: a realm\'s glory sung is its ruler\'s free hand'], build: ['cheaper works', 'While he lives your works cost less'] };
  const stars = (fame) => '★'.repeat(Math.max(1, Math.min(5, Math.round(fame * 1.8))));

  let ctx = null, tab = 'mine', lastSig = '';
  const S = () => ctx.sim(); const C = () => S().culture;
  const me = () => { const s = S(); return s ? s.playerCiv() : null; };

  // ----- the frame -----
  function init(c) {
    ctx = c;
    $('cu-close').addEventListener('click', close);
    document.querySelectorAll('#cu-tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.utab)));
    $('cult').addEventListener('close', () => { lastSig = ''; });
    $('cult').addEventListener('click', (e) => {
      const a = e.target.closest('[data-uact]'); if (a) { if (!a.disabled) act(a.dataset.uact, a.dataset.k); return; }
      const g = e.target.closest('[data-ugo]'); if (g && ctx.flyTo) { close(); ctx.flyTo(+g.dataset.ugo); }
    });
  }
  const isOpen = () => $('cult').open;
  function open(t) { const s = S(); if (!s || !me()) return; const dlg = $('cult'); if (!dlg.open) { dlg.showModal(); dlg.firstElementChild.focus({ preventScroll: true }); } setTab(t || tab); }
  function close() { const d = $('cult'); if (d.open) d.close(); }
  function setTab(t) { tab = t; document.querySelectorAll('#cu-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.utab === t)); document.querySelectorAll('#cult [data-upane]').forEach((p) => { p.hidden = p.dataset.upane !== t; }); render(); }

  // ----- what the player does -----
  function act(what, key) {
    const s = S(), c = me(); if (!s || !c) return; const K = C(); let msg = null;
    if (what === 'patron') { K.setPatron(c.id, +key); msg = `Patronage: ${PATRON[+key][0].toLowerCase()}`; }
    else if (what === 'commission') { const gp = K.greatOf(+key); const why = K.commission(c.id, +key); msg = why || `${gp ? gp.name : 'The master'} makes ${(K.works[K.works.length - 1] || {}).name || 'a work'}`; }
    else if (what === 'lens') { close(); if (ctx.lens) ctx.lens('renown'); return; }
    if (msg && ctx.toast) ctx.toast(msg);
    if (ctx.afterAct) ctx.afterAct(); render();
  }

  // ----- drawing -----
  const yrs = (n) => n + (n === 1 ? ' year' : ' years');
  const kindIcon = (K, k) => svg(ICON[K.KINDS[k].key] || LYRE);
  // a work in one line: its kind, its name, who made it and when, where it is, what it is worth
  function workRow(s, K, w, c) {
    const g = K.greatOf(w.by), held = w.held >= 0 ? s.civs[w.held] : null; const master = w.value >= K.MASTER;
    const where = w.lost ? `<span class="neg">lost in ${s.fmtYear(w.lost)}</span>` : held && held !== c ? `in ${esc(s.cellName.get(w.at) || '?')}, held by ${esc(s.fullName(held))}` : `in ${esc(s.cellName.get(w.at) || '?')}`;
    return `<div class="cu-work${w.lost ? ' lost' : ''}${master ? ' master' : ''}"><span class="ic">${kindIcon(K, w.kind)}</span><span class="nm"><b>${esc(w.name)}</b><small>${esc(g ? g.name + ', ' + K.kindName(g).toLowerCase() : 'a master')} · ${s.fmtYear(w.year)} · ${where}</small></span><em title="${master ? 'A masterpiece: it is never forgotten. ' : 'Forgotten some turns after it was made. '}What it adds to renown">${master ? '<i>✦</i>' : ''}${w.value.toFixed(1)}</em>${w.lost ? '<span></span>' : `<button class="btn icon ghost" data-ugo="${w.at}" title="Fly there">⌖</button>`}</div>`;
  }
  // what brings a realm's great people forth, and how much each part counts
  function parts(s, K, c) {
    const id = c.id, T = s.townsOf[id], a = s.acad[id], t = s.temples[id], m = s.markets[id], w = s.wonders[id]; const bits = [];
    bits.push(`${T} town${T === 1 ? '' : 's'}`); if (a) bits.push(`${a} academ${a === 1 ? 'y' : 'ies'} ×3`); if (t) bits.push(`${t} temple${t === 1 ? '' : 's'} ×2`); if (m) bits.push(`${m} market${m === 1 ? '' : 's'} ×2`); if (w) bits.push(`${w} wonder${w === 1 ? '' : 's'} ×5`);
    const law = K.lawF(id), lvl = K.patronOf(c), mult = [];
    if (Math.abs(law - 1) > 0.01) mult.push(`laws ×${law.toFixed(2)}`); mult.push(`steadiness ×${(0.5 + c.stability).toFixed(2)}`); if (lvl !== 1) mult.push(`patronage ×${K.PATRON[lvl]}`); if (K.isGolden(id)) mult.push(`golden age ×${K.GOLD.boost}`);
    return `${bits.join(' · ')} <span class="cu-x">${mult.join(' · ')}</span>`;
  }
  function renderMine() {
    const s = S(), c = me(), K = C(); const e = Math.min(8, c.era | 0); const rel = K.rel(c.id), ren = K.renown[c.id], norm = K.NORM[e];
    const p = K.pace(c.id), T = K.threshold(c.id), left = p > 0 ? Math.ceil((T - K.prog[c.id]) / p) : -1; const gold = K.isGolden(c.id), G = K.goldenNeed(c.id); const turn = K.TURN[e];
    const lvl = c.patron === undefined ? 1 : c.patron;
    const pride = K.unrest(c);
    const relTxt = rel >= 1.05 ? `${rel >= 10 ? Math.round(rel) : rel.toFixed(1)} times the renown of the usual realm of your age (${Math.round(norm)})` : rel <= 0.95 ? `${Math.round(rel * 100)}% of the renown of the usual realm of your age (${Math.round(norm)})` : `the renown of the usual realm of your age (${Math.round(norm)})`;
    // (where the realm stands, on a scale of halvings and doublings of the usual)
    const at = Math.max(0, Math.min(1, (Math.log2(rel) + 4) / 8));
    const pips = Array.from({ length: G.need }, (_, k) => `<i class="${k < Math.min(G.need, G.have) ? 'on' : ''}"></i>`).join('');
    const goldTxt = gold ? `Until ${s.fmtYear(G.until)}: great people come almost twice as often, and the realm is the steadier for it`
      : G.rest > s.year ? `The last ended in ${s.fmtYear(G.until)}; none can begin again before ${s.fmtYear(G.rest)}`
      : `${G.need} great people born within ${yrs(G.win)}, in a realm at least ${Math.round(G.stab * 100)} steady, begin one: you have had ${G.have}${c.stability < G.stab ? `, and your stability is ${Math.round(c.stability * 100)}` : ''}`;
    const head = `<div class="cu-head">
      <div class="cu-stat"><span class="micro">Renown</span><b>${Math.round(ren)}</b><span class="cu-scale" title="Halvings and doublings of the usual renown of your age"><i style="left:${(at * 100).toFixed(1)}%"></i><u></u></span><small>${relTxt}. ${pride >= 0.004 ? `Pride steadies the realm (+${Math.round(pride * 100)})` : pride <= -0.004 ? `Its want of renown unsettles it (${Math.round(pride * 100)})` : 'Neither pride nor shame moves it'}.</small><button class="linkish" data-uact="lens">See every realm's on the map</button></div>
      <div class="cu-stat"><span class="micro">The next great person</span><span class="kn-prog"><i style="width:${(100 * Math.min(1, K.prog[c.id] / T)).toFixed(1)}%"></i></span><small>${left < 0 ? `Not before your people know ${esc(window.KNOW.LIST[window.KNOW.ID.masonry].name.toLowerCase())}` : left > 2000 ? 'Not in living memory, as things are' : `In about ${yrs(left)}${turn > 1 ? ` (${Math.max(1, Math.round(left / turn))} turn${Math.round(left / turn) > 1 ? 's' : ''})` : ''}, as things are`}</small><small class="cu-parts">${parts(s, K, c)}</small></div>
      <div class="cu-stat${gold ? ' gold' : ''}"><span class="micro">${gold ? 'A golden age' : 'No golden age'}</span>${gold ? `<span class="kn-prog" title="How much of it is left"><i style="width:${(100 * Math.max(0, Math.min(1, (G.until - s.year) / G.len))).toFixed(1)}%"></i></span>` : ''}<small>${goldTxt}</small><span class="cu-pips" title="Great people born within ${yrs(G.win)}">${pips}<em>${G.have} born within ${yrs(G.win)}</em></span></div></div>
      <div class="cu-patron"><span class="micro">Patronage</span>${PATRON.map(([n, t], k) => `<button class="btn${k === lvl ? ' on' : ''}" data-uact="patron" data-k="${k}" title="${esc(t)}">${n}</button>`).join('')}<small>${esc(PATRON[lvl][1])}</small></div>`;
    const living = K.livingOf(c.id).sort((a, b) => b.fame - a.fame); const cost = K.commissionCost(c); const wait = Math.max(5, turn);
    const people = living.length ? living.map((g) => { const why = g.made >= 3 ? `${g.name} has made all there is in him` : g.asked && s.year - g.asked < wait ? 'Asked lately: give it a turn' : c.wealth < cost ? `Needs ${cost} coin` : ''; const b = K.KINDS[g.kind].boon;
      return `<div class="cu-great live"><span class="ic">${kindIcon(K, g.kind)}</span><span class="nm"><b>${esc(g.name)}</b><small>${esc(K.kindName(g))} · <span class="cu-st">${stars(g.fame)}</span> · ${g.made} of 3 works · of ${esc(s.cellName.get(g.at) || '?')}, born ${s.fmtYear(g.born)}</small></span><span class="cu-boon ${b}" title="${esc((BRINGS[b] || ['', ''])[1])}">${(BRINGS[b] || [''])[0]}</span><button class="btn" data-uact="commission" data-k="${g.id}" ${why ? 'disabled' : ''} title="${why ? esc(why) : `Ask for a work now, for ${cost} coin`}">Commission · ${cost}</button></div>`; }).join('')
      : '<div class="hint">Nobody of note lives in your realm now. Towns, temples, academies, markets and wonders bring great people forth, and laws that let people learn and speak.</div>';
    const before = K.greatsOf(c.id).filter((g) => g.dies < s.year).sort((a, b) => b.dies - a.dies).slice(0, 6);
    const held = K.heldBy(c.id).sort((a, b) => b.value - a.value); const gone = K.madeBy(c.id).filter((w) => w.lost || (w.held >= 0 && w.held !== c.id)).sort((a, b) => b.year - a.year).slice(0, 8);
    const masters = held.filter((w) => w.value >= K.MASTER).length;
    $('cu-mine').innerHTML = head + `<div class="cu-cols"><div class="cu-sect"><div class="micro">Your great people, living · ${living.length}</div>${people}
      ${before.length ? `<div class="micro cu-sub">Remembered</div>${before.map((g) => `<div class="cu-great dead"><span class="ic">${kindIcon(K, g.kind)}</span><span class="nm"><b>${esc(g.name)}</b><small>${esc(K.kindName(g))} · <span class="cu-st">${stars(g.fame)}</span> · ${s.fmtYear(g.born)} to ${s.fmtYear(g.dies)} · ${g.made} work${g.made === 1 ? '' : 's'}</small></span></div>`).join('')}` : ''}
      <div class="cu-key">Sages' works bring insight; poets', artists', playwrights', historians', composers', novelists' and filmmakers' bring authority; a master builder makes your works cheaper while he lives. A lesser work is forgotten ${Math.round(K.TURN[e] * 6)} years after it was made; a masterpiece (✦) never is.</div></div>
      <div class="cu-sect"><div class="micro">The works you hold · ${held.length}${masters ? ` · ${masters} masterpiece${masters === 1 ? '' : 's'}` : ''}</div>${held.slice(0, 30).map((w) => workRow(s, K, w, c)).join('') || '<div class="hint">None yet. A great person makes up to three works; whoever holds the city holds the work.</div>'}
      ${gone.length ? `<div class="micro cu-sub">Yours no longer</div>${gone.map((w) => workRow(s, K, w, c)).join('')}` : ''}</div></div>`;
  }
  function renderWorld() {
    const s = S(), c = me(), K = C(); const realms = s.civs.filter(Boolean).sort((a, b) => K.renown[b.id] - K.renown[a.id]); const top = realms.length ? Math.max(1, K.renown[realms[0].id]) : 1;
    const mine = realms.indexOf(c); const list = realms.slice(0, 12); if (mine >= 12) list.push(c);
    const rows = list.map((b) => `<div class="cu-realm${b === c ? ' me' : ''}"><i class="dp-sw" style="background:${b.color}"></i><span>${b === c && mine >= 12 ? `${mine + 1}. ` : ''}${esc(s.fullName(b))}${K.isGolden(b.id) ? ' <b class="gold" title="A golden age">✦</b>' : ''}</span><span class="gv-bar"><i style="width:${(100 * K.renown[b.id] / top).toFixed(1)}%"></i></span><em>${Math.round(K.renown[b.id])}</em></div>`).join('');
    const golden = realms.filter((b) => K.isGolden(b.id));
    const best = K.works.filter((w) => !w.lost).sort((a, b) => b.value - a.value).slice(0, 16);
    const lost = K.works.filter((w) => w.lost).sort((a, b) => b.value - a.value).slice(0, 4);
    const late = K.greats.slice().sort((a, b) => b.born - a.born || b.fame - a.fame).slice(0, 10).map((g) => `<div class="cu-great${g.dies < s.year ? ' dead' : ''}"><span class="ic">${kindIcon(K, g.kind)}</span><span class="nm"><b>${esc(g.name)}</b><small>${esc(K.kindName(g))} · <span class="cu-st">${stars(g.fame)}</span> · born ${s.fmtYear(g.born)}${g.of ? ' · ' + esc(g.of) : ''}</small></span></div>`).join('');
    $('cu-world').innerHTML = `<div class="cu-cols"><div class="cu-sect"><div class="micro">The most renowned realms</div>${rows || '<div class="hint">No realm has any renown yet.</div>'}
      <div class="micro cu-sub">In a golden age · ${golden.length}</div>${golden.length ? `<div class="cu-gold">${golden.slice(0, 12).map((b) => `<span><i class="dp-sw" style="background:${b.color}"></i>${esc(s.fullName(b))}</span>`).join('')}</div>` : '<div class="hint">No realm, now.</div>'}
      <div class="micro cu-sub">Great people of late</div>${late || '<div class="hint">Nobody yet.</div>'}</div>
      <div class="cu-sect"><div class="micro">The greatest works of the world</div>${best.map((w) => workRow(s, K, w, c)).join('') || '<div class="hint">Nothing has been made that the world remembers.</div>'}
      ${lost.length ? `<div class="micro cu-sub">Lost for ever</div>${lost.map((w) => workRow(s, K, w, c)).join('')}` : ''}</div></div>`;
  }
  function render() {
    if (!ctx || !isOpen()) return; const s = S(); if (!s) return; const c = me(); if (!c) return;
    $('cu-sub').textContent = `${s.fullName(c)} · ${s.fmtYear(s.year)}`;
    const K = C(); $('cu-ren').innerHTML = `<span class="cu-chip" title="Renown: the works your realm holds, and its wonders">${svg(LYRE)}<b>${Math.round(K.renown[c.id])}</b> renown${K.isGolden(c.id) ? ' · <span class="gold">a golden age</span>' : ''}</span>`;
    if (tab === 'world') renderWorld(); else renderMine();
    lastSig = sig();
  }
  const sig = () => { const s = S(), c = me(), K = C(); if (!c || !K) return String(s.year); return `${s.year}:${K.stats.born}:${K.stats.works}:${K.stats.lost}:${c.patron}:${Math.floor(c.wealth / 20)}:${Math.round(c.stability * 50)}`; };
  function refresh() { if (!ctx || !isOpen()) return; const s = S(); if (!s) return; if (sig() !== lastSig) render(); }
  return { init, open, close, isOpen, refresh, render, ICON, LYRE };
})();
