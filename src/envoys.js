// Holocene diplomacy screen (classic script; exposes window.ENVOYS): the realms your envoys can reach, what each thinks of you and why,
// what is sworn between you, what you could propose and how they would answer, gifts, claims and closed markets, war (the reasons you
// could give and what each costs) and peace (the terms, and whether they would take them); what envoys have laid before you; the wars
// of the known world; and your own standing. It reads the simulation's diplomacy (sim.diplo, diplo.js) and goes through its doors.
window.ENVOYS = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="${d}"/></svg>`;
  // a glyph for everything two realms can be to one another, 24 x 24
  const ICON = {
    nap: 'M5 19c0-8 5-13 14-14 0 9-5 14-14 14zM5 19l8-8', trade: 'M4 17h16l-2 3H6zM11 3v12M11 4l7 9h-7', defence: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z',
    alliance: 'M5 5l14 14M19 5L5 19M5 5h3.500M5 5v3.500M19 5h-3.500M19 5v3.500', marriage: 'M5 13a4 4 0 1 0 8 0a4 4 0 1 0-8 0M11 13a4 4 0 1 0 8 0a4 4 0 1 0-8 0M9 9l-1-3h2zM15 9l-1-3h2z',
    vassal: 'M4 18h16l1-10-5 4-4-7-4 7-5-4z', lord: 'M4 18h16l1-10-5 4-4-7-4 7-5-4zM4 21h16', war: 'M4 4l16 16M20 4L4 20', ban: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M6.500 6.500l11 11',
    gift: 'M4 10h16v10H4zM12 10v10M3 10h18M12 10c-2-4-6-3-4 0M12 10c2-4 6-3 4 0', claim: 'M6 21V4h11l-2.500 3.500L17 11H6', peace: 'M5 19c0-8 5-13 14-14 0 9-5 14-14 14zM5 19l8-8',
    envoy: 'M4 6h16v12H4zM4 7l8 6 8-6', spy: 'M2.500 12s3.500-6.500 9.500-6.500S21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
    learn: 'M12 6c-2-1.500-5-2-8-2v14c3 0 6 .500 8 2 2-1.500 5-2 8-2V4c-3 0-6 .500-8 2zM12 6v14', discord: 'M3.500 5h11v7.500H8l-4.500 3.500zM9.500 15.500V17h6l4.500 3.500V11h-3', sabotage: 'M12 21c4 0 6-3 6-6 0-4-4-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8 0 3 2 6 6 6z',
    rising: 'M12 21V9M7.500 3v4a4.500 4.500 0 0 0 9 0V3M12 3v6', murder: 'M12 2.500l2 3v9.500h-4V5.500zM7.500 15h9M12 15v6.500', truce: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 8v4l3 2', word: 'M6 4h12v13H6zM9 8h6M9 11h6M12 17v3.500l-2-1.500', owes: 'M12 5v14M8 9h5a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h6',
  };
  const MOOD_CLS = { devoted: 'pos', friendly: 'pos', warm: 'good', indifferent: '', wary: 'warn', hostile: 'neg', bitter: 'neg' };
  const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  // an offer laid before the player, in a line and in full
  const OFFER = {
    nap: ['proposes a sworn peace', null], trade: ['proposes a trade agreement', null], defence: ['proposes a defensive pact', null], alliance: ['proposes an alliance', null], marriage: ['proposes a royal marriage', null],
    submit: ['demands that you bend the knee', 'You would pay them a tenth of your income and follow them to war; they would defend you. Refuse, and they hold it against you: a reason for war for three turns.'],
    protect: ['asks for your protection', 'They would become your vassal: a tenth of their income is yours, and their sword in your wars. You defend them, and in time may join them to your crown.'],
    peace: ['offers peace', null], call: ['calls you to war', null],
  };

  let ctx = null, tab = 'realms', sel = -1, filter = 'all', lastSig = '', cause = '', picked = false;      // (cause: the reason a war would be given; picked: the player chose it himself - else it is the best there is)
  const S = () => ctx.sim(); const DP = () => window.DIPLO; const DK = () => S().diplo;
  const me = () => { const s = S(); return s ? s.playerCiv() : null; };
  const pace = (c) => DP().PACE[Math.max(0, Math.min(8, c.era | 0))];
  const turns = (years, c) => { const n = Math.max(1, Math.round(years / pace(c))); return n + (n === 1 ? ' turn' : ' turns'); };
  const upto = (y, c) => { const s = S(); return `until ${s.fmtYear(y)} <span class="mk-dim">(${turns(y - s.year, c)})</span>`; };
  const nm = (b) => esc(S().fullName(b));
  const sw = (b) => `<i class="dp-sw" style="background:${b.color}"></i>`;
  const link = (b) => `<button class="linkish" data-dsel="${b.id}">${nm(b)}</button>`;
  const names = (list) => list.map((b) => link(b)).join(', ');
  const coin = (v) => v >= 10 ? String(Math.round(v)) : v >= 0.05 ? v.toFixed(1) : '0';      // (a small realm's tenth is less than a coin: say how much less)
  const arms = (r) => r >= 1.5 ? 'far better than yours' : r >= 1.15 ? 'better than yours' : r > 0.87 ? 'as good as yours' : r > 0.67 ? 'worse than yours' : 'far worse than yours';
  const weight = (r) => r >= 3 ? 'far stronger than you' : r >= 1.5 ? 'stronger than you' : r > 0.67 ? 'about your match' : r > 0.33 ? 'weaker than you' : 'far weaker than you';
  const wordOf = (rep) => rep >= 70 ? 'trusted' : rep >= 55 ? 'good' : rep >= 45 ? 'ordinary' : rep >= 30 ? 'doubted' : 'worth little';
  const dreadOf = (inf) => inf < 1 ? 'forgotten' : inf < 10 ? 'remembered' : inf < 30 ? 'feared' : 'dreaded';
  const why = (list, n) => list.slice(0, n).map(([t, v]) => `<span class="${v > 0 ? 'up' : 'dn'}">${esc(t)} ${signed(Math.round(v))}</span>`).join('');
  const lc = (t) => t.charAt(0).toLowerCase() + t.slice(1);

  // ----- the frame -----
  function init(c) {
    ctx = c;
    $('dp-close').addEventListener('click', close);
    document.querySelectorAll('#dp-tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.dtab)));
    $('dip').addEventListener('close', () => { lastSig = ''; });
    $('dip').addEventListener('click', (e) => {
      const a = e.target.closest('[data-dact]'); if (a) { if (!a.disabled) act(a.dataset.dact, a.dataset.k, a.dataset.v); return; }
      const j = e.target.closest('[data-kgo]'); if (j && ctx.openTree) { close(); ctx.openTree(j.dataset.kgo); return; }
      const f = e.target.closest('[data-dfilter]'); if (f) { filter = f.dataset.dfilter; render(); return; }
      const c2 = e.target.closest('[data-dcause]'); if (c2) { cause = c2.dataset.dcause; picked = true; render(); return; }
      const r = e.target.closest('[data-dsel]'); if (r) { show(+r.dataset.dsel); }
    });
  }
  const isOpen = () => $('dip').open;
  // open the screen: at a tab, or at a realm's page
  function open(t, id) {
    const s = S(); if (!s || !me()) return; const dlg = $('dip'); if (!dlg.open) { dlg.showModal(); dlg.firstElementChild.focus({ preventScroll: true }); }
    if (id !== undefined && id >= 0 && s.civs[id] && s.civs[id] !== me()) show(id); else setTab(t || tab);
  }
  function show(id) { sel = id; cause = ''; picked = false; setTab('realms'); requestAnimationFrame(() => { const el = document.querySelector(`#dp-list .dp-row[data-dsel="${id}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }); }
  function close() { const d = $('dip'); if (d.open) d.close(); }
  function setTab(t) { tab = t; document.querySelectorAll('#dp-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.dtab === t)); document.querySelectorAll('#dip [data-dpane]').forEach((p) => { p.hidden = p.dataset.dpane !== t; }); render(); }

  // ----- what the player does -----
  function act(what, k, v) {
    const s = S(), c = me(); if (!s || !c) return; const d = DK(), P = DP(); const b = sel >= 0 ? s.civs[sel] : null; let msg = null, map = false;
    if (what === 'answer') { const o = d.D(c).offers.find((x) => x.id === +k); const from = o ? s.civs[o.from] : null; const no = d.answer(c, +k, v === 'yes'); msg = no || (from ? (v === 'yes' ? `Agreed with ${s.fullName(from)}` : `${s.fullName(from)} is turned away`) : null); map = true; }
    else if (what === 'fly') { if (b && b.capital >= 0 && ctx.flyTo) { close(); ctx.flyTo(b.capital); } return; }
    else if (what === 'unscheme') { msg = s.unscheme() || 'Your agents are called home'; }
    else if (!b) return;
    else if (what === 'propose') { const no = d.propose(c, b, k); msg = no ? (no === 'They refuse' ? `${s.fullName(b)} refuses` : no) : k === 'vassal' ? `${s.fullName(b)} bends the knee` : k === 'protect' ? `${s.fullName(b)} takes you under its protection` : `${s.fullName(b)} agrees: ${P.PACT[k].name.toLowerCase()}`; map = !no; }
    else if (what === 'break') { const no = d.breakPact(c, b, k); msg = no || (k === 'vassal' ? `${s.fullName(b)} is released from its oath` : `${P.PACT[k].name} thrown over`); map = true; }
    else if (what === 'gift') { const no = d.gift(c, b, +k); msg = no || `${k} coin sent to ${s.fullName(b)}`; }
    else if (what === 'claim') { msg = d.claim(c, b) || `You now claim the borderlands of ${s.fullName(b)}`; }
    else if (what === 'ban') { msg = d.embargo(c, b, k === 'on') || (k === 'on' ? `Your markets are closed to ${s.fullName(b)}` : `Your markets are open to ${s.fullName(b)} again`); }
    else if (what === 'war') { const no = d.declare(c, b, k || undefined); msg = no || `War with ${s.fullName(b)}`; map = !no; if (!no && ctx.onWar) ctx.onWar(b.id); }
    else if (what === 'sue') { const no = d.sue(c, b, k, v === 'them' ? b.id : c.id); msg = no || `Peace with ${s.fullName(b)}`; map = !no; }
    else if (what === 'abandon') { msg = d.abandon(c, b) || `A peace of your own with ${s.fullName(b)}`; map = true; }
    else if (what === 'annex') { const name = s.fullName(b); const no = d.annex(c, b); msg = no || `${name} is joined to your crown`; if (!no) sel = -1; map = !no; }
    else if (what === 'rebel') { msg = d.rebel(c) || `You have thrown off the yoke of ${s.fullName(b)}`; map = true; }
    else if (what === 'scheme') { const no = s.scheme(b.id, k); const S = window.INTRIGUE && window.INTRIGUE.SK[k]; msg = no || `Your agents set out for ${s.fullName(b)}: ${S ? lc(S.name) : k}`; }
    if (msg && ctx.toast) ctx.toast(msg);
    if (map && ctx.redraw) ctx.redraw(); if (ctx.afterAct) ctx.afterAct(); render();
  }

  // ----- the realms within reach, as the list shows them -----
  function rows(c) {
    const s = S(), d = DK(); const out = [];
    for (const id of d.reach(c.id)) { const b = s.civs[id]; if (!b) continue; const st = d.standing(c, b), near = d.touches(c, id);
      out.push({ b, st, o: d.opinion(b, c), near, r: (s.mightOf[id] + 0.01) / (s.mightOf[c.id] + 0.01), grp: st === 'war' ? 0 : st === 'lord' || st === 'vassal' || st === 'ally' || d.anyPact(c, id) ? 1 : near ? 2 : 3 }); }
    out.sort((x, y) => x.grp - y.grp || y.r - x.r); return out;
  }
  const GROUPS = ['At war with you', 'Sworn to you', 'On your borders', 'Further off'];
  const FILTERS = [['all', 'All'], ['near', 'Neighbours'], ['sworn', 'Sworn'], ['war', 'At war'], ['hostile', 'Hostile']];
  function badges(c, b) {
    const d = DK(), P = DP(); const out = []; const put = (k, t) => out.push(`<span class="dp-bd ${k}" title="${esc(t)}">${svg(ICON[k])}</span>`);
    if (S().isAtWar(c, b.id)) put('war', 'At war'); if (d.D(b).lord === c.id) put('vassal', 'Your vassal'); if (d.D(c).lord === b.id) put('lord', 'Your lord');
    for (const p of P.PACTS) if (d.has(c, b.id, p.key)) put(p.key, p.name); if (d.D(c).ban[b.id] || d.D(b).ban[c.id]) put('ban', 'Markets closed');
    return out.join('');
  }
  function renderList(c) {
    const all = rows(c); const pass = (x) => filter === 'all' || (filter === 'near' && x.near) || (filter === 'sworn' && x.grp === 1) || (filter === 'war' && x.grp === 0) || (filter === 'hostile' && x.o <= -35);
    const list = all.filter(pass); if (sel < 0 || !S().civs[sel] || !all.some((x) => x.b.id === sel)) sel = list.length ? list[0].b.id : all.length ? all[0].b.id : -1;
    const P = DP(); let html = `<div class="filters dp-filters">${FILTERS.map(([k, l]) => `<button class="btn ${filter === k ? 'on' : ''}" data-dfilter="${k}">${l}<span class="mk-dim">${all.filter((x) => k === 'all' || (k === 'near' && x.near) || (k === 'sworn' && x.grp === 1) || (k === 'war' && x.grp === 0) || (k === 'hostile' && x.o <= -35)).length}</span></button>`).join('')}</div>`;
    if (!all.length) html += `<div class="dp-empty"><b>Your envoys know of nobody yet.</b>They can deal with the realms you touch and those your merchants reach. Settle towards your neighbours, or raise a harbour.</div>`;
    else if (!list.length) html += `<div class="dp-empty"><b>Nobody.</b>No realm within reach of your envoys is ${filter === 'war' ? 'at war with you' : filter === 'sworn' ? 'sworn to you' : filter === 'hostile' ? 'hostile to you' : 'on your borders'}.</div>`;
    let g = -1;
    for (const x of list) {
      if (x.grp !== g) { g = x.grp; html += `<div class="dp-grp">${GROUPS[g]}</div>`; } const b = x.b, mood = P.moodOf(x.o);
      html += `<button class="dp-row${b.id === sel ? ' sel' : ''}" data-dsel="${b.id}">${sw(b)}<span class="nm"><b>${nm(b)}</b><small>${esc(S().govName(b))} · ${esc(S().ERAS[b.era][0])}</small></span><span class="md ${MOOD_CLS[mood]}"><b>${mood}</b><small>${signed(Math.round(x.o))}</small></span><span class="st"><span class="gv-bar"><i style="width:${Math.max(4, Math.min(100, 50 + 25 * Math.log2(x.r))).toFixed(0)}%"></i><u style="left:50%"></u></span><small>${weight(x.r).replace(' than you', '').replace('about your match', 'your match')}</small></span><span class="bds">${badges(c, b)}</span></button>`;
    }
    const el = $('dp-list'); const top = el.scrollTop; el.innerHTML = html; el.scrollTop = top;
  }

  // ----- a realm's page -----
  function page(c, b) {
    const s = S(), d = DK(), P = DP(); const y = s.year; const dc = d.D(c), db = d.D(b); const atWar = s.isAtWar(c, b.id);
    const R = d.reasons(b, c), mood = P.moodOf(R.o); const r = (s.mightOf[b.id] + 0.01) / (s.mightOf[c.id] + 0.01), ar = (s.strengthOf[b.id] + 0.01) / (s.strengthOf[c.id] + 0.01); const T = b.ruler ? s.TRAITS[b.ruler.trait] : null;
    let h = `<div class="gv-head dp-head"><span class="ic" style="background:${b.color}"></span><div><h3>${nm(b)}</h3><div class="micro">${esc(s.govName(b))} · ${esc(s.ERAS[b.era][0])} · ${esc(b.religion || 'no faith')}</div></div></div>`;
    // (the ruler, of his house, his age; who rules for a child; the heir; who of the two houses are wed)
    const DY = s.dynasty, rp = DY && b.ruler ? DY.of(b.ruler.pid) : null, rh = rp && rp.h ? DY.houses.get(rp.h) : null, rg = DY ? DY.regentOf(b.id) : null, hr = DY && rh ? DY.heirOf(b.id) : null;
    const wed = (() => { if (!DY || !rp) return ''; const mine = DY.familyOf(c.id), theirs = DY.familyOf(b.id); if (!mine || !theirs) return ''; const A = [mine.ruler, ...mine.kids], B = new Set([theirs.ruler, ...theirs.kids].map((x) => x.id)); const x = A.find((p) => p.s && B.has(p.s) && DY.alive(p, s.year)); return x ? `${x.n} of your house is wed to ${DY.of(x.s).n} of theirs` : ''; })();
    h += `<div class="dp-facts">${b.ruler ? `<span class="micro">Ruler</span><span>${esc(b.ruler.title)} ${esc(b.ruler.name)}${rp ? ', ' + (s.year - rp.b) : ''}${T ? ', ' + esc(T.a) : ''}${rh ? ` <span class="mk-dim">· ${esc(rh.name)}${rg && rg.p ? ` · ${esc(rg.p.n)} rules for ${rp.f ? 'her' : 'him'}` : ''}${hr ? ` · heir ${esc(hr.n)}, ${s.year - hr.b}` : ''}</span>` : ''}${wed ? `<br><span class="mk-dim">${esc(wed)}</span>` : ''}</span>` : ''}<span class="micro">People</span><span class="num">${ctx.fmtPop ? ctx.fmtPop(s.popOf[b.id]) : Math.round(s.popOf[b.id])} in ${s.cellsOf[b.id]} regions</span><span class="micro">Might</span><span title="Its arms and its numbers together: what it can put in the field, and afford to lose.">${weight(r)} <span class="mk-dim">(${r >= 10 ? Math.round(r) : r.toFixed(1)} to 1)</span></span><span class="micro">Arms</span><span title="What a fight over a region turns on, whoever has more people: knowledge, weapons, pay, order at home.">${arms(ar)}</span></div>`;
    h += `<div class="gv-acts"><button class="btn" data-dact="fly">Fly to their capital</button></div>`;
    // what they think of you
    h += `<div class="gv-sect"><span class="micro">What they think of you</span><div class="dp-mood ${MOOD_CLS[mood]}"><b>${mood}</b><span class="num">${signed(Math.round(R.o))}</span></div>${R.why.length ? `<div class="gv-why">${why(R.why, 8)}</div>` : '<div class="gv-note">They have no reason to think anything of you yet.</div>'}</div>`;
    // what is between you
    const lines = [];
    if (atWar) lines.push(`<div class="dp-line war">${svg(ICON.war)}<span>At war since ${s.fmtYear(c.wars[b.id])}</span></div>`);
    if (db.lord === c.id) { const no = d.cannotJoin(c, b); lines.push(`<div class="dp-line tall">${svg(ICON.vassal)}<span>Your vassal since ${s.fmtYear(db.since)}: pays you ${coin(d.trOut[b.id])} coin a year, and follows you to war<small>${no ? esc(no) : 'It could be joined to your crown now.'}</small></span><span class="dp-btns"><button class="btn" data-dact="annex"${no ? ' disabled' : ''}>Join to the crown</button><button class="btn" data-dact="break" data-k="vassal">Release</button></span></div>`); }
    if (dc.lord === b.id) lines.push(`<div class="dp-line tall">${svg(ICON.lord)}<span>Your lord since ${s.fmtYear(dc.since)}: you pay a tenth of your income, and follow them to war</span><span class="dp-btns"><button class="btn danger" data-dact="rebel">Throw off the yoke</button></span></div>`);
    for (const p of P.PACTS) if (d.has(c, b.id, p.key)) lines.push(`<div class="dp-line">${svg(ICON[p.key])}<span>${esc(p.name)} ${upto(dc.pact[b.id][p.key], c)}</span><span class="dp-btns"><button class="btn" data-dact="break" data-k="${p.key}" title="They will not forget it, and nobody will trust your word so readily">Break</button></span></div>`);
    if (dc.ban[b.id]) lines.push(`<div class="dp-line">${svg(ICON.ban)}<span>Your markets are closed to them since ${s.fmtYear(dc.ban[b.id])}</span><span class="dp-btns"><button class="btn" data-dact="ban" data-k="off">Open them</button></span></div>`);
    if (db.ban[c.id]) lines.push(`<div class="dp-line">${svg(ICON.ban)}<span>Their markets are closed to you</span></div>`);
    if (!atWar && s.civs[b.id] && (c.truce[b.id] || -1e9) > y) lines.push(`<div class="dp-line">${svg(ICON.truce)}<span>A truce ${upto(c.truce[b.id], c)}: neither may attack</span></div>`);
    { const u = d.claimUntil(c, b.id, 'claim'); if (u > y) lines.push(`<div class="dp-line">${svg(ICON.claim)}<span>You claim their borderland ${upto(u, c)}</span></div>`); }
    { const u = d.claimUntil(c, b.id, 'land'); if (u > y) lines.push(`<div class="dp-line">${svg(ICON.claim)}<span>They hold land that was yours: yours to win back ${upto(u, c)}</span></div>`); }
    { const u = d.claimUntil(c, b.id, 'refused'); if (u > y) lines.push(`<div class="dp-line">${svg(ICON.claim)}<span>They refused you tribute: a reason for war ${upto(u, c)}</span></div>`); }
    { const u = d.claimUntil(c, b.id, 'rebel'); if (u > y) lines.push(`<div class="dp-line">${svg(ICON.claim)}<span>A rebel vassal: yours to bring to heel ${upto(u, c)}</span></div>`); }
    { const u = d.holds(b, c.id); if (u > y) lines.push(`<div class="dp-line warn">${svg(ICON.claim)}<span>They hold a reason for war against you ${upto(u, c)}</span></div>`); }
    if (db.owes[c.id] > y) lines.push(`<div class="dp-line">${svg(ICON.owes)}<span>They pay you reparations ${upto(db.owes[c.id], c)}</span></div>`);
    if (dc.owes[b.id] > y) lines.push(`<div class="dp-line warn">${svg(ICON.owes)}<span>You pay them reparations ${upto(dc.owes[b.id], c)}</span></div>`);
    h += `<div class="gv-sect"><span class="micro">Between you</span>${lines.join('') || '<div class="gv-note">Nothing is sworn between you, and nothing is owed.</div>'}</div>`;
    h += atWar ? warPage(c, b) : peacePage(c, b);      // (what your agents could do comes between pressing a realm and fighting it: schemesSect)
    return h;
  }
  // (what your agents could do there, how likely it is to work and to be found out, what it costs; or what they are about there now)
  const pct = (v) => `${Math.round(v * 100)}%`;
  function schemesSect(c, b) {
    const s = S(), IN = window.INTRIGUE; if (!IN || !s.intrigueView) return ''; const V = s.intrigueView(b.id); if (!V) return '';
    const kn = s.know; if (!kn.has[c.id * kn.ND + window.KNOW.ID.writing]) return `<div class="gv-sect"><span class="micro">Your agents</span><div class="gv-note">A realm keeps agents abroad once its people can write: <button class="linkish" data-kgo="writing">Writing</button>.</div></div>`;
    const head = `<div class="dp-spyhead"><span>Your network <b class="num">${V.net.toFixed(1).replace(/\.0$/, '')}</b></span><span>theirs <b class="num">${V.theirs.toFixed(1).replace(/\.0$/, '')}</b></span><span class="mk-dim">${V.net > V.theirs + 0.4 ? 'Your agents are the better' : V.net + 0.4 < V.theirs ? 'Their watchmen are the better' : 'An even match'}</span></div>`;
    if (V.s && V.s.on === b.id) return `<div class="gv-sect"><span class="micro">Your agents</span>${head}${underWay(V.s)}</div>`;
    const card = (x) => { const no = x.why, key = no && /^Needs [A-Z]/.test(no) && !/coin$/.test(no) ? x.need : null;
      const st = no ? (key ? `Needs <button class="linkish" data-kgo="${key}">${esc(no.slice(6))}</button>` : `<span class="mk-dim">${esc(no)}</span>`) : `<span><b class="${x.odds >= 0.5 ? 'pos' : x.odds < 0.3 ? 'neg' : ''}">${pct(x.odds)}</b> to succeed</span><span><b class="${x.risk >= 0.4 ? 'neg' : x.risk < 0.2 ? 'pos' : ''}">${pct(x.risk)}</b> to be found out</span><span>${turns(x.years, c)}</span><span>${x.cost} coin</span>`;
      return `<div class="dp-prop dp-scheme${no ? ' off' : ''}"><span class="ic">${svg(ICON[x.key] || ICON.spy)}</span><div><b>${esc(x.name)}</b><small>${esc(x.text)}${x.war ? ' Found out, it is a reason for war against you.' : ''}</small><div class="st">${st}</div></div><button class="btn" data-dact="scheme" data-k="${x.key}"${no ? ' disabled' : ''}>Begin</button></div>`; };
    return `<div class="gv-sect"><span class="micro">Your agents</span>${head}${V.s ? `<div class="gv-note">Your agents are at work in ${link(s.civs[V.s.on])}: ${esc(lc(V.s.scheme))}. Call them home first.</div>` : ''}${V.schemes.map(card).join('')}</div>`;
  }
  // (a scheme under way: how far along, the odds, a way to call it off)
  function underWay(x) {
    const s = S(), c = me(); const b = s.civs[x.on];
    return `<div class="dp-prop dp-scheme on"><span class="ic">${svg(ICON[x.key] || ICON.spy)}</span><div><b>${esc(x.scheme)}</b><small>In ${b ? link(b) : esc(x.realm)} since ${s.fmtYear(x.from)}: done ${x.left > 0 ? 'in ' + x.left + ' year' + (x.left === 1 ? '' : 's') : 'this year'}. Every year it might be found out.</small><span class="gv-bar"><i style="width:${Math.max(3, Math.round(x.p * 100))}%"></i></span><div class="st"><span><b>${pct(x.odds)}</b> to succeed</span><span><b>${pct(x.risk)}</b> to be found out</span><span class="mk-dim">${x.cost || 0} coin spent</span></div></div><button class="btn" data-dact="unscheme" title="The coin spent is not returned">Call them home</button></div>`;
  }
  // (at peace: what could be proposed, sent or pressed, and what a war would take)
  function peacePage(c, b) {
    const s = S(), d = DK(), P = DP(); const dc = d.D(c); let h = '';
    const prop = (kind, name, text) => {
      const no = d.cannot(c, b, kind); if (no === 'Already in force' || no === 'Already your vassal' || no === 'Already your lord' || no === 'Your alliance covers it') return '';
      const key = no && /^Needs /.test(no) ? (kind === 'vassal' || kind === 'protect' ? P.VASSAL.need : P.PACT[kind].need) : null;
      const j = no ? null : d.judge(b, c, kind); const at = d.askedAt(c, b.id, kind), asked = at !== undefined && s.year - at < pace(c) / 2;
      const state = no ? (key ? `Needs <button class="linkish" data-kgo="${key}">${esc(no.slice(6))}</button>` : esc(no)) : `<b class="${j.ok ? 'pos' : 'neg'}">${j.ok ? 'They would agree' : 'They would refuse'}</b><span class="gv-why">${why(j.why, 3)}</span>`;
      return `<div class="dp-prop${no ? ' off' : ''}"><span class="ic">${svg(ICON[kind === 'protect' ? 'lord' : kind])}</span><div><b>${esc(name)}</b><small>${esc(text)}</small><div class="st">${state}</div></div><button class="btn" data-dact="propose" data-k="${kind}"${no || asked ? ' disabled' : ''}${asked ? ' title="They have only just answered that"' : ''}>${kind === 'vassal' ? 'Demand' : kind === 'protect' ? 'Ask' : d.has(c, b.id, kind) ? 'Swear again' : 'Propose'}</button></div>`;
    };
    const props = P.PACTS.map((p) => prop(p.key, p.name, p.text)).join('') + prop('vassal', 'Their submission', 'They become your vassal. Refused, it is a reason for war for three turns.') + prop('protect', 'Their protection', 'You become their vassal: a tenth of your income, and your sword in their wars.');
    if (props) h += `<div class="gv-sect"><span class="micro">Propose</span>${props}</div>`;
    // gifts: by what they are to the one who gets them
    { const turn = Math.max(20, Math.abs(b.income || 0) * pace(b)); const sizes = [0.15, 0.4, 1].map((f) => Math.max(5, Math.round(turn * f / 5) * 5)).filter((v, i, a) => a.indexOf(v) === i); const had = Math.max(0, d.memOf(b, c.id));
      h += `<div class="gv-sect"><span class="micro">Send a gift</span><div class="gv-acts">${sizes.map((v) => { const w = Math.max(1, Math.min(d.giftWorth(b, v), 45 - Math.round(had))); return `<button class="btn" data-dact="gift" data-k="${v}"${c.wealth < v || had >= 44 ? ' disabled' : ''} title="${c.wealth < v ? 'The treasury does not hold that' : had >= 44 ? 'Coin can buy no more goodwill here' : 'What they think of you: ' + signed(w)}">${v} coin <span class="pos">${signed(w)}</span></button>`; }).join('')}</div><div class="gv-note">Goodwill bought fades by half in three turns, and no more than 45 of it can be bought.</div></div>`; }
    // pressure: a claim, closed markets
    { const near = d.touches(c, b.id), has = d.claimUntil(c, b.id, 'claim') > s.year, cost = d.claimCost(c, b); const cl = !near ? 'You share no border' : has ? 'You hold a claim already' : d.bound(c, b) ? 'You are sworn not to' : null; const kn = S().know, needLaws = !kn.has[c.id * kn.ND + window.KNOW.ID.laws];
      h += `<div class="gv-sect"><span class="micro">Press them</span><div class="gv-acts"><button class="btn" data-dact="claim"${cl || needLaws || c.wealth < cost ? ' disabled' : ''} title="${esc(needLaws ? 'Needs Written laws' : cl || (c.wealth < cost ? 'Needs ' + cost + ' coin' : 'A right to their borderland, found or made: a reason for war for three turns. They will not like it.'))}">Lay claim to their borderland <span class="mk-dim">${cost} coin</span></button>${dc.ban[b.id] ? '' : `<button class="btn" data-dact="ban" data-k="on" title="Nothing passes between your markets and theirs, either way. It ends any trade agreement, and they will not like it.">Close your markets to them</button>`}</div></div>`; }
    h += schemesSect(c, b);
    // war: what stands in the way, the reasons that could be given, what each costs, who would come in
    { const no = d.cannotFight(c, b); let w = '';
      if (no) w = `<div class="gv-note">${esc(no)}.</div>`;
      else { const cs = d.causes(c, b); if (!picked || !cs.some((x) => x.key === cause)) cause = cs[0].key; const W = d.warCost(c, b, cause);
        const theirs = d.friends(b, false).filter((x) => x !== c && !d.bound(x, c)), ours = d.friends(c, true).filter((x) => x !== b && !d.bound(x, b)); const sa = s.mightOf[c.id] + ours.reduce((t, x) => t + s.mightOf[x.id], 0), sb = s.mightOf[b.id] + theirs.reduce((t, x) => t + s.mightOf[x.id], 0);
        w = cs.map((x) => `<button class="dp-cause${x.key === cause ? ' sel' : ''}" data-dcause="${x.key}"><b>${esc(x.name)}</b><small>${esc(x.text)}</small></button>`).join('');
        w += `<ul class="gv-gives">${W.stab ? `<li class="bad">−${Math.round(W.stab * 100)} stability: your people see no reason for it</li>` : ''}${W.rep ? `<li class="bad">Your word falls by ${W.rep}${W.broke ? ': it breaks your ' + P.PACT[W.broke].name.toLowerCase() : ''}</li>` : ''}${!W.stab && !W.rep ? '<li class="good">Nobody at home or abroad holds it against you</li>' : ''}<li class="${theirs.length ? 'bad' : 'none'}">${theirs.length ? 'Beside them: ' + names(theirs) : 'Nobody is sworn to defend them'}</li><li class="${ours.length ? 'good' : 'none'}">${ours.length ? 'Beside you: ' + names(ours) : 'You would fight alone'}</li><li class="${sa > sb * 1.15 ? 'good' : sa * 1.15 < sb ? 'bad' : 'none'}">Your side ${sa > sb * 1.15 ? 'is the stronger' : sa * 1.15 < sb ? 'is the weaker' : 'is about their match'}: ${(sa / Math.max(0.01, sb)).toFixed(1)} to 1</li><li class="none">A clear win could bring: ${esc(lc(P.CAUSES[cause].goal === 'land' ? 'the land you take' : P.CAUSES[cause].goal === 'tribute' ? 'reparations, besides the land you take' : P.CAUSES[cause].goal === 'vassal' ? 'their submission' : 'a government of your kind in their capital'))}</li></ul>`;
        w += `<div class="gv-acts"><button class="btn danger" data-dact="war" data-k="${cause}">Declare war</button></div>`; }
      h += `<div class="gv-sect"><span class="micro">War</span>${w}</div>`; }
    return h;
  }
  // (at war: how it stands, and the terms on which it could end)
  function warPage(c, b) {
    const s = S(), d = DK(), P = DP(); const sc = d.score(c, b), len = s.year - c.wars[b.id]; const side = d.D(c).side[b.id], their = d.D(b).side[c.id]; let h = '';
    const goal = d.D(c).goal[b.id] || d.D(b).goal[c.id]; const mine = d.D(c).goal[b.id] !== undefined;
    h += `<div class="gv-sect"><span class="micro">The war</span><div class="dp-score"><span>Lost</span><span class="gv-bar"><i class="${sc > 0.05 ? 'pos' : sc < -0.05 ? 'neg' : ''}" style="margin-left:${sc >= 0 ? 50 : 50 + 50 * sc}%;width:${Math.abs(50 * sc)}%"></i><u style="left:50%"></u></span><span>Won</span></div><div class="gv-note">${turns(len, c)} of war. ${sc > 0.1 ? 'It goes your way' : sc < -0.1 ? 'It goes against you' : 'Neither side is winning'}: each side is judged by the land it has lost since the war began.${goal && goal !== 'ally' ? ' ' + (mine ? 'You' : 'They') + ' began it: ' + esc(lc(P.CAUSES[goal].name)) + '.' : ''}</div></div>`;
    h += schemesSect(c, b);
    const no = d.cannotSue(c, b);
    if (side !== undefined) { const f = s.civs[side]; h += `<div class="gv-sect"><span class="micro">Peace</span><div class="gv-note">You fight beside ${f ? link(f) : 'a friend'}: the war ends when theirs does. You can go home on your own, but they will not forget it, and your word suffers.</div><div class="gv-acts"><button class="btn" data-dact="abandon">Make a peace of your own</button></div></div>`; return h; }
    if (their !== undefined) { const f = s.civs[their]; h += `<div class="gv-sect"><span class="micro">Peace</span><div class="gv-note">They fight beside ${f ? link(f) : 'a friend'}: make peace there, and this war ends with it.</div></div>`; return h; }
    if (no) { h += `<div class="gv-sect"><span class="micro">Peace</span><div class="gv-note">${esc(no)}.</div></div>`; return h; }
    const term = (t, winner) => { const w = winner === 'me' ? c : b, l = winner === 'me' ? b : c; const j = d.wouldEnd(b, c, t === 'white' ? c : w, t);
      const text = t === 'white' ? P.TERM_TEXT.white : t === 'tribute' ? (winner === 'me' ? 'They pay you an eighth of their income for three turns.' : 'You pay them an eighth of your income for three turns.') : t === 'vassal' ? (winner === 'me' ? 'They become your vassal.' : 'You become their vassal.') : (winner === 'me' ? 'They are given a government of your kind.' : 'You are given a government of their kind.');
      return `<div class="dp-prop"><span class="ic">${svg(ICON[t === 'white' ? 'peace' : t === 'tribute' ? 'owes' : t === 'vassal' ? (winner === 'me' ? 'vassal' : 'lord') : 'word'])}</span><div><b>${esc(t === 'white' ? P.TERMS.white : winner === 'me' ? 'Ask: ' + lc(P.TERMS[t]) : 'Offer: ' + lc(P.TERMS[t]))}</b><small>${esc(text)}</small><div class="st"><b class="${j.ok ? 'pos' : 'neg'}">${j.ok ? 'They would accept' : 'They would refuse'}</b> <span class="mk-dim">${esc(lc(j.why))}</span></div></div><button class="btn${winner === 'them' && t !== 'white' ? ' danger' : ''}" data-dact="sue" data-k="${t}" data-v="${winner === 'me' ? 'me' : 'them'}">${t === 'white' ? 'Offer' : winner === 'me' ? 'Demand' : 'Concede'}</button></div>`; };
    const ask = d.termsFor(c, b, 1).filter((t) => t !== 'white').reverse(), give = d.termsFor(b, c, 1).filter((t) => t !== 'white').reverse();
    h += `<div class="gv-sect"><span class="micro">Peace</span>${term('white', 'me')}${ask.map((t) => term(t, 'me')).join('')}${sc < -0.05 ? give.map((t) => term(t, 'them')).join('') : ''}</div>`;
    return h;
  }

  // ----- what envoys have laid before you -----
  function offerCard(c, o) {
    const s = S(), d = DK(), P = DP(); const a = s.civs[o.from]; if (!a) return ''; const O = OFFER[o.kind] || ['sends envoys', '']; let text = O[1], title = O[0];
    if (P.PACT[o.kind]) text = `${P.PACT[o.kind].text} It would hold until ${s.fmtYear(s.year + d.termOf(a, c, o.kind))}.`;
    else if (o.kind === 'peace') { const win = o.winner === c.id; title = o.terms === 'white' ? 'offers peace as things stand' : win ? (o.terms === 'tribute' ? 'sues for peace, and will pay for it' : o.terms === 'vassal' ? 'is beaten, and offers to bend the knee' : 'is beaten, and will take a government of your kind') : (o.terms === 'tribute' ? 'offers peace, at a price' : o.terms === 'vassal' ? 'offers peace, if you bend the knee' : 'offers peace, if your government is remade');
      text = o.terms === 'white' ? 'Each keeps what it holds, and a truce follows.' : o.terms === 'tribute' ? (win ? 'They pay you an eighth of their income for three turns.' : 'You pay them an eighth of your income for three turns.') : o.terms === 'vassal' ? (win ? 'They become your vassal.' : 'You become their vassal: a tenth of your income, and your sword in their wars.') : (win ? 'They are given a government of your kind.' : 'You are given a government of their kind.'); text += ' Decline, and the war goes on.'; }
    else if (o.kind === 'call') { const e = s.civs[o.vs]; title = `calls you to its war${e ? ' against ' + s.fullName(e) : ''}`; text = `You are sworn to it. Come, and ${e ? s.fullName(e) : 'their enemy'} is your enemy too until the war ends. Decline, and what you swore is void: nobody will trust your word so readily.`; }
    const R = d.reasons(a, c); const yes = o.kind === 'submit' ? 'Bend the knee' : o.kind === 'call' ? 'Go to war' : 'Accept';
    return `<div class="dp-offer"><div class="dp-ohead">${sw(a)}<div><b>${link(a)}</b> ${esc(title)}<small>${P.moodOf(R.o)} towards you · ${weight((s.mightOf[a.id] + 0.01) / (s.mightOf[c.id] + 0.01))}</small></div></div><p class="gv-text">${esc(text)}</p><div class="dp-ofoot"><span class="mk-dim">The envoys wait until ${s.fmtYear(o.until)}</span><button class="btn${o.kind === 'submit' || o.kind === 'call' ? ' danger' : ''}" data-dact="answer" data-k="${o.id}" data-v="yes">${yes}</button><button class="btn" data-dact="answer" data-k="${o.id}" data-v="no">Decline</button></div></div>`;
  }
  function renderEnvoys(c) {
    const s = S(), d = DK(), P = DP(); const dc = d.D(c); const offers = dc.offers.slice().reverse(); const y = s.year;
    let h = `<div class="dp-cols"><div><div class="micro dp-h">Waiting on your answer</div>${offers.length ? offers.map((o) => offerCard(c, o)).join('') : `<div class="dp-empty"><b>No envoys wait on you.</b>Realms that rule themselves send them when they want something of you: peace, a pact, your sword beside theirs, your submission.</div>`}</div>`;
    // what is running out, and what has lately passed between you and others
    const soon = []; for (const k in dc.pact) { const b = s.civs[+k]; if (!b) continue; for (const kind in dc.pact[k]) { const u = dc.pact[k][kind]; if (u > y && u - y <= pace(c) * 1.5) soon.push([u, b, kind]); } } soon.sort((x, z) => x[0] - z[0]);
    const ev = c.events.filter((e) => e.type === 'pact' || (e.type === 'war' && /declares war|peace|wins its war/.test(e.text))).slice(-10).reverse();
    h += `<div><div class="micro dp-h">Running out</div>${soon.length ? soon.map(([u, b, kind]) => `<div class="dp-line">${svg(ICON[kind])}<span>${esc(P.PACT[kind].name)} with ${link(b)} ${upto(u, c)}<small>It can be sworn again in its last turn.</small></span></div>`).join('') : '<div class="gv-note">Nothing you have sworn runs out within a turn.</div>'}<div class="micro dp-h" style="margin-top:18px">Lately</div>${ev.length ? `<div class="dp-log">${ev.map((e) => `<div><b>${s.fmtYear(e.year)}</b><span>${esc(e.text)}</span></div>`).join('')}</div>` : '<div class="gv-note">Nothing has passed between you and anybody yet.</div>'}</div></div>`;
    $('dp-envoys').innerHTML = h;
  }

  // ----- the wars of the known world -----
  function renderWars(c) {
    const s = S(), d = DK(), P = DP(); const known = new Set(d.reach(c.id)); known.add(c.id); const wars = [];
    for (const a of s.civs) { if (!a) continue; for (const k in a.wars) { const b = s.civs[+k]; if (!b || a.id > b.id) continue; if (d.D(a).side[b.id] !== undefined || d.D(b).side[a.id] !== undefined) continue; if (!known.has(a.id) && !known.has(b.id)) continue;
      const att = d.D(b).goal[a.id] !== undefined ? b : a, def = att === a ? b : a; const withA = [], withD = [];
      for (const x of s.civs) { if (!x || x === a || x === b) continue; const sd = d.D(x).side; if (sd[def.id] === att.id && s.isAtWar(x, def.id)) withA.push(x); else if (sd[att.id] === def.id && s.isAtWar(x, att.id)) withD.push(x); }
      wars.push({ att, def, withA, withD, since: a.wars[k], goal: d.D(att).goal[def.id] || 'none', sc: d.score(att, def), mine: att === c || def === c || withA.indexOf(c) >= 0 || withD.indexOf(c) >= 0 }); } }
    wars.sort((x, z) => (z.mine ? 1 : 0) - (x.mine ? 1 : 0) || z.since - x.since);
    // (a war of the player's own is coloured and told from his side; anybody else's from the attacker's)
    const row = (w) => { const you = w.att === c || w.withA.indexOf(c) >= 0 ? 1 : w.def === c || w.withD.indexOf(c) >= 0 ? -1 : 0; const mine = you * w.sc;
      const how = you ? (mine > 0.1 ? 'your side is winning' : mine < -0.1 ? 'your side is losing' : 'neither side is winning') : (w.sc > 0.1 ? 'the attacker is winning' : w.sc < -0.1 ? 'the defender is winning' : 'neither is winning');
      return `<div class="dp-war${w.mine ? ' mine' : ''}"><div class="who">${sw(w.att)}<span>${link(w.att)}<small>attacks${w.withA.length ? ', with ' + names(w.withA) : ''}</small></span></div><div class="mid"><span class="micro">${esc(P.CAUSES[w.goal].name)} · since ${s.fmtYear(w.since)}</span><span class="gv-bar"><i class="${you ? (mine > 0.05 ? 'pos' : mine < -0.05 ? 'neg' : '') : ''}" style="margin-left:${w.sc >= 0 ? 50 : 50 + 50 * w.sc}%;width:${Math.abs(50 * w.sc)}%"></i><u style="left:50%"></u></span><small>${how}</small></div><div class="who r"><span>${link(w.def)}<small>defends${w.withD.length ? ', with ' + names(w.withD) : ''}</small></span>${sw(w.def)}</div></div>`; };
    $('dp-wars').innerHTML = wars.length ? `<div class="micro dp-h">${wars.length} war${wars.length === 1 ? '' : 's'} within reach of your envoys${wars.some((w) => w.mine) ? ', yours first' : ''}</div>${wars.map(row).join('')}` : `<div class="dp-empty"><b>The known world is at peace.</b>No realm your envoys can reach is at war.</div>`;
  }

  // ----- where you stand -----
  function renderStanding(c) {
    const s = S(), d = DK(), P = DP(); const dc = d.D(c), y = s.year; const lord = d.lordOf(c), vass = d.vassalsOf(c.id);
    const meter = (v, max, cls) => `<span class="gv-bar"><i class="${cls}" style="width:${Math.max(2, Math.min(100, 100 * v / max)).toFixed(0)}%"></i></span>`;
    let h = `<div class="dp-cols"><div><div class="dp-stat"><span class="ic">${svg(ICON.word)}</span><div><span class="micro">Your word</span><b>${wordOf(dc.rep)} <span class="num">${Math.round(dc.rep)}</span></b>${meter(dc.rep, 100, dc.rep >= 55 ? 'pos' : dc.rep < 45 ? 'neg' : '')}<p class="gv-note">Every realm weighs it when you propose something. Standing by a friend raises it; breaking an oath costs 30, leaving a friend to fight alone 10, and in the later ages a war without a reason up to 18. It finds its way back to 50 by five a turn.</p></div></div>`;
    h += `<div class="dp-stat"><span class="ic">${svg(ICON.war)}</span><div><span class="micro">Your conquests</span><b>${dreadOf(dc.inf)} <span class="num">${Math.round(dc.inf)}</span></b>${meter(dc.inf, 80, dc.inf >= 10 ? 'neg' : '')}<p class="gv-note">Land taken in war makes others wary, your neighbours most of all, and less when the war had a reason. It is forgotten by half in three turns.</p></div></div>`;
    const inn = d.trIn[c.id], out = d.trOut[c.id];
    h += `<div class="dp-stat"><span class="ic">${svg(ICON.owes)}</span><div><span class="micro">Tribute and reparations</span><b><span class="num ${inn - out > 0 ? 'pos' : inn - out < 0 ? 'neg' : ''}">${Math.abs(inn - out) < 0.05 ? '0' : (inn > out ? '+' : '−') + coin(Math.abs(inn - out))}</span> coin a year</b><p class="gv-note">${inn > 0.05 ? `Paid to you: ${coin(inn)}. ` : ''}${out > 0.05 ? `Paid by you: ${coin(out)}. ` : ''}A vassal pays a tenth of what it earns; the beaten pay an eighth for three turns.</p></div></div></div>`;
    const sect = (title, body) => `<div class="gv-sect"><span class="micro">${title}</span>${body}</div>`; let r = '';
    if (lord) r += sect('Your lord', `<div class="dp-line">${svg(ICON.lord)}<span>${link(lord)} since ${s.fmtYear(dc.since)}</span></div>`);
    r += sect('Your vassals', vass.length ? vass.map((v) => `<div class="dp-line">${svg(ICON.vassal)}<span>${link(v)} since ${s.fmtYear(d.D(v).since)}<small>pays ${coin(d.trOut[v.id])} coin a year</small></span></div>`).join('') : '<div class="gv-note">None. A much weaker neighbour may bend the knee if asked, or put itself under your protection; a beaten one can be made to.</div>');
    const pacts = []; for (const k in dc.pact) { const b = s.civs[+k]; if (!b) continue; for (const p of P.PACTS) if (d.has(c, b.id, p.key)) pacts.push([dc.pact[k][p.key], b, p]); } pacts.sort((x, z) => x[0] - z[0]);
    r += sect('What you have sworn', pacts.length ? pacts.map(([u, b, p]) => `<div class="dp-line">${svg(ICON[p.key])}<span>${esc(p.name)} with ${link(b)} ${upto(u, c)}</span></div>`).join('') : '<div class="gv-note">Nothing yet.</div>');
    const WHAT = { claim: 'a claim on their borderland', land: 'land that was yours', refused: 'tribute refused', rebel: 'a rebel vassal' };
    const claims = [], against = []; for (const b of s.civs) { if (!b || b === c || !b.dip) continue; for (const what in WHAT) { const u = d.claimUntil(c, b.id, what); if (u > y) claims.push(`<div class="dp-line">${svg(ICON.claim)}<span>Against ${link(b)}: ${WHAT[what]} ${upto(u, c)}</span></div>`); }
      const u = d.holds(b, c.id); if (u > y) against.push(`<div class="dp-line warn">${svg(ICON.claim)}<span>${link(b)} holds one against you ${upto(u, c)}</span></div>`); }
    r += sect('Reasons for war', (claims.join('') + against.join('')) || '<div class="gv-note">You hold none, and nobody holds one against you.</div>');
    const bans = []; for (const k in dc.ban) { const b = s.civs[+k]; if (b) bans.push(`<div class="dp-line">${svg(ICON.ban)}<span>Yours to ${link(b)} since ${s.fmtYear(dc.ban[k])}</span></div>`); } for (const b of s.civs) if (b && b !== c && b.dip && b.dip.ban[c.id]) bans.push(`<div class="dp-line warn">${svg(ICON.ban)}<span>${link(b)}'s to you</span></div>`);
    if (bans.length) r += sect('Markets closed', bans.join(''));
    const truces = []; for (const k in c.truce) { const b = s.civs[+k]; if (b && c.truce[k] > y && !s.isAtWar(c, b.id)) truces.push([c.truce[k], b]); } truces.sort((x, z) => x[0] - z[0]);
    if (truces.length) r += sect('Truces', truces.map(([u, b]) => `<div class="dp-line">${svg(ICON.truce)}<span>With ${link(b)} ${upto(u, c)}</span></div>`).join(''));
    $('dp-standing').innerHTML = h + `<div>${r}</div></div>`;
  }

  // ----- spies and schemes: your network and what makes it, your agents, the foreign agents caught in your realm -----
  function renderIntrigue(c) {
    const s = S(), IN = window.INTRIGUE; const V = s.intrigueView ? s.intrigueView() : null; if (!V || !IN) { $('dp-intrigue').innerHTML = ''; return; }
    const y = s.year, d = DK(); const kn = s.know, writes = !!kn.has[c.id * kn.ND + window.KNOW.ID.writing];
    let L = `<div class="dp-stat"><span class="ic">${svg(ICON.spy)}</span><div><span class="micro">Your network</span><b>${V.net >= 6 ? 'formidable' : V.net >= 4 ? 'strong' : V.net >= 2 ? 'able' : V.net >= 1 ? 'young' : 'none'} <span class="num">${V.net.toFixed(1).replace(/\.0$/, '')}</span></b><span class="gv-bar"><i style="width:${Math.max(2, Math.min(100, V.net * 10)).toFixed(0)}%"></i></span>`;
    L += V.parts.length ? `<div class="dp-parts">${V.parts.map(([t, v]) => `<span>${esc(t)}<em>+${v}</em></span>`).join('')}</div>` : '';
    L += `<p class="gv-note">Each point of yours over theirs makes a scheme likelier to work and less likely to be found out, and theirs over yours the other way; a shared border helps your agents. Writing, envoys, letters, embassies, the telegraph, the wireless and the machines that listen each add one; so do some laws (police, intendants, the censor) and a ruler who trusts nobody.</p></div></div>`;
    L += `<div class="micro dp-h">Your agents</div>`;
    if (!writes) L += `<div class="gv-note">A realm keeps agents abroad once its people can write: <button class="linkish" data-kgo="writing">Writing</button>.</div>`;
    else if (V.s) L += underWay(V.s);
    else L += `<div class="dp-empty"><b>Your agents wait for orders.</b>Choose a realm under Realms: what they could do there, and how likely it is to work, is at the foot of its page.</div>`;
    const near = d.reach(c.id).map((id) => s.civs[id]).filter(Boolean).map((b) => [b, s.intrigue.netOf(b)]).sort((a, z) => z[1] - a[1]).slice(0, 6);
    if (near.length) L += `<div class="micro dp-h" style="margin-top:8px">The best watched within reach</div>${near.map(([b, n]) => `<div class="dp-line">${sw(b)}<span>${link(b)}<small>${n > V.net + 0.4 ? 'better than yours' : n + 0.4 < V.net ? 'weaker than yours' : 'a match for yours'}</small></span><span class="num">${n.toFixed(1).replace(/\.0$/, '')}</span></div>`).join('')}`;
    let R = `<div class="micro dp-h">Caught in your realm</div>`;
    R += V.found.length ? V.found.map((f) => `<div class="dp-line${f.open ? ' warn' : ''}">${svg(ICON.spy)}<span>Agents of ${s.civs[f.by] ? link(s.civs[f.by]) : esc(f.name)} ${esc(f.at || lc(f.scheme))}<small>${s.fmtYear(f.year)}${f.open ? ` · a reason for war ${upto(f.open, c)}` : f.war ? '' : ' · not an act of war'}</small></span></div>`).join('') : '<div class="gv-note">No foreign agents have been caught in your realm. That is not to say there are none.</div>';
    const ev = c.events.filter((e) => e.type === 'intrigue').slice(-10).reverse();
    R += `<div class="micro dp-h" style="margin-top:18px">Lately</div>${ev.length ? `<div class="dp-log">${ev.map((e) => `<div><b>${s.fmtYear(e.year)}</b><span>${esc(e.text)}</span></div>`).join('')}</div>` : '<div class="gv-note">Nothing your agents have done, and nothing done to you that you know of.</div>'}`;
    $('dp-intrigue').innerHTML = `<div class="dp-cols"><div>${L}</div><div>${R}</div></div>`;
  }

  function render() {
    const s = S(); if (!s || !isOpen()) return; const c = me(); if (!c) return; const d = DK(); const dc = d.D(c);
    const wars = Object.keys(c.wars).length; $('dp-sub').textContent = `${s.fullName(c)} · ${s.fmtYear(s.year)}${wars ? ` · at war with ${wars === 1 ? s.fullName(s.civs[+Object.keys(c.wars)[0]] || c) : wars + ' realms'}` : ' · at peace'}`;
    $('dp-word').innerHTML = `${svg(ICON.word)}<b>${Math.round(dc.rep)}</b><span>your word: ${wordOf(dc.rep)}</span>`;
    { const b = document.querySelector('#dp-tabs [data-dtab="envoys"]'); if (b) b.innerHTML = `Envoys${dc.offers.length ? `<span class="dp-n">${dc.offers.length}</span>` : ''}`; }
    if (tab === 'realms') { renderList(c); const b = sel >= 0 ? s.civs[sel] : null; const el = $('dp-info'); const top = el.scrollTop; el.innerHTML = b ? page(c, b) : `<div class="dp-empty"><b>Nobody to deal with yet.</b></div>`; el.scrollTop = top; }
    else if (tab === 'envoys') renderEnvoys(c); else if (tab === 'wars') renderWars(c); else if (tab === 'intrigue') renderIntrigue(c); else renderStanding(c);
    lastSig = sig();
  }
  const sig = () => { const s = S(), c = me(); if (!c) return String(s.year); const d = DK(), dc = d.D(c); return `${s.year}:${tab}:${sel}:${filter}:${cause}:${dc.offers.map((o) => o.id).join(',')}:${d.ver[c.id]}:${Object.keys(c.wars).join(',')}:${Math.floor(c.wealth / 5)}:${Math.round(dc.rep)}:${c.intrigue && c.intrigue.s ? c.intrigue.s.k + c.intrigue.s.on : ''}:${c.intrigue ? c.intrigue.found.length : 0}`; };
  function refresh() { const s = S(); if (!s || !isOpen()) return; if (sig() !== lastSig) render(); }
  // for the turn button and the realm's panel: what waits on the player, and how he stands with another realm
  function tile() {
    const s = S(), c = me(); if (!s || !c || !s.diplo) return null; const d = DK(), dc = d.D(c);
    return { offers: dc.offers.map((o) => { const a = s.civs[o.from]; const O = OFFER[o.kind] || ['sends envoys']; const e = o.kind === 'call' ? s.civs[o.vs] : null; return { id: o.id, kind: o.kind, from: o.from, since: o.since, until: o.until, text: a ? `${s.fullName(a)} ${o.kind === 'peace' ? (o.terms === 'white' ? 'offers peace' : o.winner === c.id ? 'sues for peace' : 'offers peace, at a price') : o.kind === 'call' ? 'calls you to war' + (e ? ' against ' + s.fullName(e) : '') : O[0]}` : '' }; }), rep: dc.rep, lord: d.lordOf(c), vassals: d.vassalsOf(c.id).length };
  }
  // how another realm stands with the player, for its panel on the map: { key, name, mood, o, pacts: [names] }
  function standing(b) {
    const s = S(), c = me(); if (!s || !c || !b || b === c || !s.diplo) return null; const d = DK(), P = DP(); const o = d.opinion(b, c), key = d.standing(c, b);
    return { key, name: P.STAND[key][0], mood: P.moodOf(o), cls: MOOD_CLS[P.moodOf(o)], o: Math.round(o), within: d.reach(c.id).indexOf(b.id) >= 0, pacts: P.PACTS.filter((p) => d.has(c, b.id, p.key)).map((p) => p.name).concat(d.D(b).lord === c.id ? ['your vassal'] : d.D(c).lord === b.id ? ['your lord'] : []) };
  }
  // what a discovery opens between realms, as lines for its page in the knowledge tree
  function opensLines(key) {
    const P = DP(); const out = []; const named = P.PACTS.filter((p) => p.need === key).map((p) => `<b>${esc(p.name)}</b>`);
    if (named.length) out.push(`Your envoys can propose: ${named.join(', ')}`); if (P.OPENS[key]) out.push(P.OPENS[key]);
    const IN = window.INTRIGUE; if (IN) { const sc = IN.SCHEMES.filter((x) => x.need === key).map((x) => `<b>${esc(x.name)}</b>`); if (sc.length) out.push(`Your agents can: ${sc.join(', ')}`); if (IN.NET.indexOf(key) >= 0) out.push('Your agents abroad grow <b>better at their work</b>, and foreign ones are caught more often'); }
    return out;
  }
  return { init, open, close, isOpen, refresh, render, show, tile, standing, opensLines, ICON, svg, MOOD_CLS };
})();
