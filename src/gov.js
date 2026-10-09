// Holocene laws screen (classic script; exposes window.GOV): the laws in force field by field and what could replace
// them, the forms of government, the estates of the realm (who holds power, how content they are and why), what the
// ruler's authority allows, the reform under way and whatever an estate is demanding; and the faith of the realm (the
// faiths of its people and around it, a faith's page, founding one, taking up another, missionaries, a church of one's
// own); and the court (court.js: the ruling family, the line of succession, the house). It reads the simulation's rule and
// faiths (sim.rule, rule.js; sim.faith, faith.js) and calls their few actions.
window.GOV = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="${d}"/></svg>`;
  // a glyph for each field of law and each estate, 24 x 24
  const FLAME = 'M12 21c4 0 6-3 6-6 0-4-4-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8 0 3 2 6 6 6z', BOOK = 'M12 6c-2-1.500-5-2-8-2v14c3 0 6 .500 8 2 2-1.500 5-2 8-2V4c-3 0-6 .500-8 2zM12 6v14', WHEAT = 'M12 21V8M12 8c0-3 2-5 5-5 0 3-2 5-5 5zM12 13c0-3-2-5-5-5 0 3 2 5 5 5zM12 17c0-3 2-5 5-5 0 3-2 5-5 5z';
  const HAMMER = 'M14 4l6 6-3 3-6-6zM12.500 8.500L4 17l3 3 8.500-8.500', SWORD = 'M12 3l2 3v9h-4V6zM8 15h8M12 15v6', SCALES = 'M12 4v16M7 20h10M5 8h14M5 8l-2.500 6h5zM19 8l-2.500 6h5z', CROWN = 'M4 18h16l1-10-5 4-4-7-4 7-5-4z';
  const CICON = { land: WHEAT, labour: HAMMER, tax: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v8M10 10h3a1.500 1.500 0 0 1 0 3h-2a1.500 1.500 0 0 0 0 3h3', army: SWORD, justice: SCALES, admin: 'M4 20h16M5 9h14M12 4l8 5H4zM7 9v11M12 9v11M17 9v11',
    rights: 'M9 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 19c0-4 2.500-6 6-6s6 2 6 6M16 7a2.400 2.400 0 1 0 0 4.800M15.500 13.500c3 0 5.500 1.500 5.500 5.500', faith: FLAME, trade: 'M4 17h16l-2 3H6zM11 3v12M11 4l7 9h-7', learning: BOOK, speech: 'M4 5h16v10H10l-5 4v-4H4z', welfare: 'M12 20s-7-4.500-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 10c0 5.500-7 10-7 10z' };
  const EICON = { nobles: CROWN, priests: FLAME, merchants: 'M4 17h16l-2 3H6zM11 3v12M11 4l7 9h-7', artisans: HAMMER, farmers: WHEAT, soldiers: SWORD, scholars: BOOK };
  // what a form or a law gives, in the player's words; and for which of them more is worse
  const pc = (v) => (v >= 0 ? '+' : '−') + Math.round(Math.abs(v) * 100) + '%', pa = (v) => Math.round(Math.abs(v) * 100) + '%';
  const GIVE = {
    tax: (v) => `${pc(v)} taxes`, customs: (v) => `${pc(v)} customs at the border`, upkeep: (v) => `An army costs ${pa(v)} ${v > 0 ? 'more' : 'less'} to keep`, cost: (v) => v > 0 ? `Costs ${pa(v)} of what the taxes bring` : `Saves ${pa(v)} of what the taxes bring`,
    stab: (v) => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)} stability`, auth: (v) => `${pc(v)} authority`, food: (v) => `${pc(v)} food from the land`, grow: (v) => `${pc(v)} growth of your people`, health: (v) => `${pc(v)} health: fewer die in a plague`,
    strength: (v) => `${pc(v)} strength in arms`, levy: (v) => `A levy costs ${pa(v)} ${v > 0 ? 'more' : 'less'}`, research: (v) => `${pc(v)} insight`, build: (v) => `Works cost ${pa(v)} ${v > 0 ? 'more' : 'less'}`, reach: (v) => `${pc(v)} reach of the capital`,
    trade: (v) => `${pc(v)} goods your merchants carry`, work: (v) => `${pc(v)} work of your workshops`, yield: (v) => `${pc(v)} yield of mines and estates`, expand: (v) => `${pc(v)} settling of new land`,
    breakaway: (v) => `Far provinces break away ${pa(v)} ${v > 0 ? 'more' : 'less'} readily`, unrest: (v) => `Risings and disputed successions ${pa(v)} ${v > 0 ? 'likelier' : 'rarer'}`, hunger: (v) => `Hunger shakes the realm ${pa(v)} ${v > 0 ? 'more' : 'less'}`,
  };
  const WORSE = { upkeep: 1, cost: 1, levy: 1, build: 1, breakaway: 1, unrest: 1, hunger: 1 };
  const NAME = { tax: 'Taxes', customs: 'Customs', upkeep: 'What an army costs', cost: 'What the state spends', stab: 'Stability', food: 'Food from the land', grow: 'Growth of your people', health: 'Health', strength: 'Strength in arms', levy: 'What a levy costs', research: 'Insight', build: 'What works cost', reach: 'Reach of the capital', trade: 'Goods your merchants carry', work: 'Work of your workshops', yield: 'Yield of mines and estates', expand: 'Settling of new land', breakaway: 'Provinces breaking away', unrest: 'Risings', hunger: 'What hunger does' };
  const mult = (v) => '×' + Math.round(v * 100) / 100;
  const SUCC = { chosen: 'chosen by the elders: never disputed', blood: 'an heir by blood: sometimes disputed', seized: 'whoever can take it: often disputed', elected: 'elected for a term of years: never disputed', named: 'named by the one before: seldom disputed' };

  let ctx = null, tab = 'laws', selLaw = null, selForm = null, lastSig = '';
  let selFaith = 0; const founding = { tenets: [], name: '' };      // (the faith on the page: an id, or 'new' for founding one)
  const S = () => ctx.sim(); const RL = () => window.RULE; const RU = () => S().rule;
  const me = () => { const s = S(); return s ? s.playerCiv() : null; };
  const yrs = (n) => n + (n === 1 ? ' year' : ' years');
  const gives = (g) => RL().KEYS.filter((k) => g[k]).map((k) => `<li class="${(WORSE[k] ? g[k] < 0 : g[k] > 0) ? 'good' : 'bad'}">${GIVE[k](g[k])}</li>`).join('');
  const discovery = (key) => window.KNOW.LIST[window.KNOW.ID[key]];
  // why a form or a law cannot be had now, in words (with a way to the knowledge tree where a discovery is wanting)
  function whyNot(why, s) {
    if (!why) return ''; if (why.know) { const D = discovery(why.know); return `Needs <button class="linkish" data-kgo="${D.key}">${esc(D.name)}</button> <span class="mk-dim">(${esc(s.ERAS[D.era][0])})</span>`; }
    if (why.era !== undefined) return `Not before the ${esc(s.ERAS[why.era][0])}`; if (why.faith) return 'Needs a faith of the realm'; if (why.port) return 'Needs a harbour'; return `Needs a realm of ${why.size} regions`;
  }
  // in force, being brought in, open (and whether authority covers it), wanting something, or of a later age
  function stateOf(c, x) {
    const k = RU(), R = k.ruleOf(c); const cur = x.cat === undefined ? R.gov : R.laws[x.cat]; if (cur === x.key) return 'on'; if (R.reform && R.reform.key === x.key) return 'soon';
    const why = k.lacks(c.id, c, x); if (!why) return k.costOf(c.id, c, x) <= R.auth ? 'can' : 'dear';
    if (why.era !== undefined || (why.know && discovery(why.know).era > c.era)) return 'later'; return 'need';
  }
  function cardSub(c, x, st, s) {
    const k = RU(), R = k.ruleOf(c);
    if (st === 'on') return 'in force'; if (st === 'soon') return 'in ' + yrs(Math.max(1, R.reform.start + R.reform.dur - s.year));
    if (st === 'can' || st === 'dear') return k.costOf(c.id, c, x) + ' authority'; const why = k.lacks(c.id, c, x);
    return why.know ? 'needs ' + discovery(why.know).name : why.era !== undefined ? s.ERAS[why.era][0] : why.faith ? 'needs a faith' : why.port ? 'needs a harbour' : `needs ${why.size} regions`;
  }

  // ----- the frame -----
  function init(c) {
    ctx = c;
    $('gv-close').addEventListener('click', close);
    document.querySelectorAll('#gv-tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.gtab)));
    $('gov').addEventListener('close', () => { lastSig = ''; });
    $('gov').addEventListener('click', (e) => {
      if (tab === 'court' && window.COURT && COURT.click(e, S(), (m) => { if (ctx.toast) ctx.toast(m); })) { if (ctx.afterAct) ctx.afterAct(); render(); return; }
      const a = e.target.closest('[data-gact]'); if (a) { act(a.dataset.gact, a.dataset.k); return; }
      const j = e.target.closest('[data-kgo]'); if (j && ctx.openTree) { close(); ctx.openTree(j.dataset.kgo); return; }
      const g = e.target.closest('[data-ggo]'); if (g) { show(g.dataset.ggo); return; }
      const fr = e.target.closest('[data-faith]'); if (fr) { selFaith = fr.dataset.faith === 'new' ? 'new' : +fr.dataset.faith; render(); return; }
      const tn = e.target.closest('[data-tenet]'); if (tn) { const k = tn.dataset.tenet, i = founding.tenets.indexOf(k); if (i >= 0) founding.tenets.splice(i, 1); else { founding.tenets.push(k); if (founding.tenets.length > 2) founding.tenets.shift(); } render(); return; }
      const card = e.target.closest('.gv-card'); if (card) { if (card.dataset.form) { selForm = card.dataset.form; } else { selLaw = card.dataset.law; } render(); }
    });
    $('gov').addEventListener('dblclick', (e) => { const card = e.target.closest('.gv-card'); if (card && (card.dataset.form || card.dataset.law)) act('begin', card.dataset.form || card.dataset.law); });
    $('gov').addEventListener('input', (e) => { if (e.target.id === 'gv-fname') founding.name = e.target.value; });
  }
  const isOpen = () => $('gov').open;
  // open the screen; at a tab, or at a form or a law by its key
  function open(t, key) {
    const s = S(); if (!s || !me()) return; const dlg = $('gov'); if (!dlg.open) { dlg.showModal(); dlg.firstElementChild.focus({ preventScroll: true }); }
    if (key) show(key); else setTab(t || tab);
  }
  function show(key) { const R = RL(); if (R.FORM[key]) { selForm = key; setTab('form'); } else if (R.LAW[key]) { selLaw = key; setTab('laws'); requestAnimationFrame(() => { const el = document.querySelector(`#gv-laws .gv-card[data-law="${key}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }); } }
  function close() { const d = $('gov'); if (d.open) d.close(); }
  // open the screen at the faith of the realm, or at a faith's page ('new': founding one)
  function openFaith(f) { if (f !== undefined) selFaith = f; open('faith'); }
  // open the screen at the court, at a person of the family (or the heir)
  function openCourt(id) { if (window.COURT) COURT.select(id || 0); open('court'); }
  function setTab(t) { tab = t; document.querySelectorAll('#gv-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.gtab === t)); document.querySelectorAll('#gov [data-gpane]').forEach((p) => { p.hidden = p.dataset.gpane !== t; }); render(); }

  // ----- what the player does -----
  function act(what, key) {
    const s = S(), c = me(); if (!s || !c) return; const k = RU(); let msg = null;
    if (what === 'begin') { const x = RL().LAW[key] || RL().FORM[key]; if (!x) return; const why = k.begin(c.id, c, key); msg = why || (x.cat === undefined ? `${x.name}: the change is begun` : `${x.name}: the law is being brought in`); }
    else if (what === 'cancel') { k.cancel(c); msg = 'The reform is given up'; }
    else if (what === 'grant') { const D = k.ruleOf(c).demand; if (D) { k.grant(c.id, c); msg = `${RL().estateName(D.e, c.era)} have what they asked for`; } }
    else if (what === 'refuse') { const D = k.ruleOf(c).demand; if (D) { k.refuse(c.id, c, false); msg = `${RL().estateName(D.e, c.era)} are refused`; } }
    else if (what === 'f-found') { const why = s.faithAct('found', founding.tenets.slice(), founding.name.trim() || undefined); if (why) msg = why; else { const f = s.faith.state[c.id]; selFaith = f; founding.tenets = []; founding.name = ''; msg = `${cap(s.faith.nameOf(f))} is founded`; } }
    else if (what === 'f-name') { founding.name = s.faith.suggest(c.id); }
    else if (what === 'f-adopt') { const f = +key; const why = s.faithAct('adopt', f); msg = why || `${cap(s.faith.nameOf(f))} is the faith of your realm`; }
    else if (what === 'f-mission') { const why = s.faithAct('mission', +key); msg = why || `Your missionaries set out for ${s.fullName(s.civs[+key])}`; }
    else if (what === 'f-church') { const was = s.faith.state[c.id]; const why = s.faithAct('church'); if (!why) selFaith = s.faith.state[c.id]; msg = why || `Your realm breaks with ${s.faith.nameOf(was)}: ${s.faith.nameOf(s.faith.state[c.id])} is its own`; }
    if (msg && ctx.toast) ctx.toast(msg);
    if (ctx.afterAct) ctx.afterAct(); render();
  }

  // ----- drawing -----
  const card = (c, x, s, sel) => { const st = stateOf(c, x); return `<button class="gv-card ${st}${sel === x.key ? ' sel' : ''}" data-${x.cat === undefined ? 'form' : 'law'}="${x.key}"><span class="nm">${esc(x.name)}</span><span class="st">${esc(cardSub(c, x, st, s))}</span></button>`; };
  function renderLaws() {
    const s = S(), c = me(), R = RL(); const cur = RU().ruleOf(c);
    if (!selLaw || !R.LAW[selLaw]) selLaw = cur.reform && R.LAW[cur.reform.key] ? cur.reform.key : cur.laws[R.CATS[0].key];
    $('gv-laws').innerHTML = R.CATS.map((C) => `<div class="gv-row"><div class="gv-field">${svg(CICON[C.key])}<b>${esc(C.name)}</b><small>${esc(C.note)}</small></div><div class="gv-cards">${C.laws.map((L) => card(c, L, s, selLaw)).join('')}</div></div>`).join('');
    $('gv-info').innerHTML = page(c, R.LAW[selLaw]);
  }
  function renderForms() {
    const s = S(), c = me(), R = RL(); const cur = RU().ruleOf(c);
    if (!selForm || !R.FORM[selForm]) selForm = cur.reform && R.FORM[cur.reform.key] ? cur.reform.key : cur.gov;
    const byAge = []; for (const F of R.FORMS) (byAge[F.era] || (byAge[F.era] = [])).push(F);
    const ruler = c.ruler ? `<div class="gv-ruler"><span class="micro">Who rules</span><b>${esc(c.ruler.title)} ${esc(c.ruler.name)}</b><span>${esc(s.TRAITS[c.ruler.trait] ? s.TRAITS[c.ruler.trait].a : '')}, since ${s.fmtYear(c.ruler.since)}</span><span class="mk-dim">${esc(SUCC[R.FORM[cur.gov].succ])}</span></div>` : '';
    $('gv-forms').innerHTML = ruler + byAge.map((list, e) => list ? `<div class="gv-row"><div class="gv-field age${e > c.era ? ' later' : ''}"><b>${esc(s.ERAS[e][0])}</b></div><div class="gv-cards">${list.map((F) => card(c, F, s, selForm)).join('')}</div></div>` : '').join('');
    $('gv-finfo').innerHTML = page(c, R.FORM[selForm]);
  }
  // the page of a form or a law: what it is, what it gives, who gains and who loses by the change, and what it would take
  function page(c, x) {
    const s = S(), R = RL(), k = RU(), Q = k.ruleOf(c); const isForm = x.cat === undefined; const cur = isForm ? R.FORM[Q.gov] : R.LAW[Q.laws[x.cat]]; const st = stateOf(c, x); const p = c.id * R.NE;
    const head = `<div class="gv-head"><span class="ic">${svg(isForm ? CROWN : CICON[x.cat])}</span><div><h3>${esc(x.name)}</h3><div class="micro">${isForm ? 'Form of government' : esc(R.CAT[x.cat].name) + ' · ' + esc(R.CAT[x.cat].note)}</div></div></div><p class="gv-text">${esc(x.text)}</p>`;
    let how;
    if (st === 'on') how = `<div class="gv-state on">In force${isForm ? ' since ' + s.fmtYear(Q.since) : Q.at[x.cat] !== undefined ? ' since ' + s.fmtYear(Q.at[x.cat]) : ', as it has always been'}.</div>`;
    else if (st === 'soon') how = `<div class="gv-state soon">Being brought in: in force in ${yrs(Math.max(1, Q.reform.start + Q.reform.dur - s.year))}. <button class="linkish" data-gact="cancel">Give it up</button></div>`;
    else if (st === 'can' || st === 'dear') { const cost = k.costOf(c.id, c, x), n = k.yearsOf(c, x); const busy = !!Q.reform;
      const way = !isForm && R.FORM[Q.gov].way[x.id] ? ` · a quarter off: it is one of the ways of a ${esc(R.FORM[Q.gov].name.toLowerCase())}` : '';
      how = `<div class="gv-acts"><button class="btn primary" data-gact="begin" data-k="${x.key}" ${busy || st === 'dear' ? 'disabled' : ''}>${isForm ? 'Proclaim it' : 'Bring it in'}</button></div><div class="gv-state">${cost} authority <span class="mk-dim">(you hold ${Math.floor(Q.auth)})</span>${way} · in force after ${yrs(n)}${busy ? ' · one reform at a time: another is under way' : st === 'dear' ? ` · ${Math.ceil((cost - Q.auth) / Math.max(1e-6, k.gainOf(c.id, c)))} years until your word carries that far` : ''}</div>`; }
    else how = `<div class="gv-state need">${whyNot(k.lacks(c.id, c, x), s)}</div>`;
    // who gains and who loses, against what is in force (for the thing in force: against nothing)
    const rows = []; for (let e = 0; e < R.NE; e++) { let d = st === 'on' ? x.likes[e] : x.likes[e] - cur.likes[e]; if (isForm && st !== 'on') d += 0.12 * (x.weights[e] - cur.weights[e]); if (Math.abs(d) >= 0.025) rows.push([e, d]); }
    rows.sort((a, b) => b[1] - a[1]);
    const who = rows.map(([e, d]) => `<div class="gv-who ${d > 0 ? 'up' : 'dn'}"><i>${d > 0 ? (d > 0.13 ? '▲▲' : '▲') : (d < -0.13 ? '▼▼' : '▼')}</i><span>${esc(R.estateName(e, c.era))}</span><small>${Math.round(k.power[p + e] * 100)}% of power</small></div>`).join('');
    const office = isForm ? `<div class="gv-sect"><div class="micro">Who holds office under it</div><div class="gv-office">${R.ESTATES.map((E, e) => x.weights[e] !== 1 ? `<span class="${x.weights[e] > 1 ? 'up' : 'dn'}">${esc(R.estateName(e, c.era))} ${mult(x.weights[e])}</span>` : '').filter(Boolean).join('') || '<span class="mk-dim">Nobody more than another</span>'}</div><div class="gv-note">Its ruler is ${esc(SUCC[x.succ])}.${x.hi < 1e8 ? ` It holds up to ${x.hi} regions easily.` : ''}${x.lo ? ` It takes a realm of ${x.lo} regions to proclaim.` : ''}</div></div>` : '';
    // (and what it does to the peoples a realm rules who are not its rulers': people.js)
    const PL = !isForm && window.PEOPLE && PEOPLE.LAW[x.key];
    const g = gives(x.gives) + (PL ? (PL.minor !== undefined ? `<li class="${PL.minor < 1 ? 'good' : 'bad'}">Other peoples than yours ${PL.minor < 1 ? 'are quieter under it' : 'are more restless under it'} (${mult(PL.minor)})</li>` : '') + (PL.assim !== undefined ? `<li class="${PL.assim > 1 ? 'good' : 'bad'}">Other peoples are taken into yours ${PL.assim > 1 ? 'faster' : 'more slowly'} (${mult(PL.assim)})</li>` : '') : '');
    // a law puts power in some hands and takes it from others; a form has laws that come naturally under it
    const sway = !isForm && x.swayed ? `<div class="gv-sect"><div class="micro">Whose hand it strengthens</div><div class="gv-office">${R.ESTATES.map((E, e) => x.sway[e] !== 1 ? `<span class="${x.sway[e] > 1 ? 'up' : 'dn'}">${esc(R.estateName(e, c.era))} ${mult(x.sway[e])}</span>` : '').join('')}</div><div class="gv-note">Their share of power, for as long as it is in force.</div></div>` : '';
    const ways = isForm && x.ways.length ? `<div class="gv-sect"><div class="micro">Its ways</div><div class="gv-chips">${x.ways.map((L) => `<button class="kn-chip ${Q.laws[L.cat] === L.key ? 'known' : ''}" data-ggo="${L.key}">${esc(L.name)}</button>`).join('')}</div><div class="gv-note">Laws that come naturally under it: they cost a quarter less authority.</div></div>`
      : !isForm && x.wayOf.length ? `<div class="gv-sect"><div class="micro">Comes naturally to</div><div class="gv-chips">${x.wayOf.map((F) => `<button class="kn-chip ${Q.gov === F.key ? 'known' : ''}" data-ggo="${F.key}">${esc(F.name)}</button>`).join('')}</div></div>` : '';
    return `${head}${how}<div class="gv-sect"><div class="micro">It gives</div><ul class="gv-gives">${g || '<li class="none">Nothing but what custom gives.</li>'}</ul></div>
      ${office}${sway}${ways}<div class="gv-sect"><div class="micro">${st === 'on' ? 'Who is glad of it' : 'Who gains and who loses by the change'}</div>${who || '<div class="gv-note">Nobody much cares.</div>'}</div>
      ${x.need.length ? `<div class="gv-sect"><div class="micro">It stands on</div><div class="gv-chips">${x.need.map((key) => { const D = discovery(key); return `<button class="kn-chip ${k.lacks(c.id, c, { need: [key] }) ? '' : 'known'}" data-kgo="${D.key}">${esc(D.name)}</button>`; }).join('')}</div></div>` : ''}`;
  }
  const moodWord = (m) => m >= 0.75 ? 'devoted' : m >= 0.6 ? 'content' : m >= 0.45 ? 'quiet' : m >= 0.3 ? 'restless' : m >= 0.18 ? 'angry' : 'in revolt';
  const moodCls = (m) => m >= 0.6 ? 'pos' : m >= 0.45 ? '' : m >= 0.3 ? 'warn' : 'neg';
  function renderEstates() {
    const s = S(), c = me(), R = RL(), k = RU(), Q = k.ruleOf(c); const p = c.id * R.NE, o = c.id * R.NK;
    const order = R.ESTATES.map((E, e) => e).sort((a, b) => k.power[p + b] - k.power[p + a]);
    const rows = order.map((e) => {
      const E = R.ESTATES[e], pw = k.power[p + e], m = Q.mood[e], to = k.heading(c.id, c, e); const why = k.reasons(c.id, c, e).filter((r) => r[0] !== 'The times').concat(k.times(c.id, c, e)).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);
      const lever = E.k * (m - 0.5) * 2 * Math.min(1, pw * 4); const lv = E.lever === 'stab' ? `${lever >= 0 ? '+' : '−'}${Math.abs(lever * 50).toFixed(1)} stability` : `${pc(lever)} ${NAME[E.lever].toLowerCase()}`;
      const idle = E.lever === 'stab' ? Math.abs(lever * 50) < 0.05 : Math.abs(lever) < 0.005;      // (what would be written as nothing is said as nothing)
      const wish = k.wish(c.id, c, e); const src = k.sways(c, e).sort((a, b) => Math.abs(Math.log(b[1])) - Math.abs(Math.log(a[1]))).slice(0, 4);
      return `<div class="gv-estate"><div class="gv-ehead" style="--tone:${E.tone}"><span class="ic">${svg(EICON[E.key])}</span><div><b>${esc(R.estateName(e, c.era))}</b><small>${esc(E.note)}</small></div></div>
        <div class="gv-meter"><span class="micro">Power</span><span class="gv-bar"><i style="width:${(pw * 100).toFixed(1)}%;background:${E.tone}"></i></span><b class="num">${Math.round(pw * 100)}%</b></div>
        ${src.length ? `<div class="gv-src">${src.map(([t, v]) => `<span class="${v > 1 ? 'up' : 'dn'}">${esc(t)} ${mult(v)}</span>`).join('')}</div>` : ''}
        <div class="gv-meter"><span class="micro">Content</span><span class="gv-bar mood"><i class="${moodCls(m)}" style="width:${(m * 100).toFixed(1)}%"></i><u style="left:${(to * 100).toFixed(1)}%" title="Where it is heading"></u></span><b class="${moodCls(m)}">${moodWord(m)}</b></div>
        <div class="gv-why">${why.map(([t, v]) => `<span class="${v > 0 ? 'up' : 'dn'}">${v > 0 ? '+' : '−'} ${esc(t)}</span>`).join('') || '<span class="mk-dim">Nothing moves them</span>'}</div>
        <div class="gv-lever"><span class="${idle ? 'mk-dim' : lever > 0 ? 'pos' : 'neg'}">${idle ? 'They neither help nor hinder' : 'Now: ' + lv}</span>${wish ? `<span class="mk-dim">would like</span> <button class="linkish" data-ggo="${wish.key}">${esc(wish.name)}</button>` : ''}</div></div>`;
    }).join('');
    // the realm's rule against its age (a row that would be written as nothing is left out)
    const srows = R.KEYS.map((key, q) => { if (!NAME[key] || !R.NORMED[q]) return null; const v = k.f[o + q]; const d = R.ADDED[key] ? v : v - 1; if (Math.abs(d) < 0.005) return null; const good = WORSE[key] ? d < 0 : d > 0; return { key, d, good }; }).filter(Boolean).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const stand = srows.map((r) => `<div class="kn-srow"><span>${esc(NAME[r.key])}</span><span class="kn-sbar"><i class="${r.good ? 'up' : 'dn'}" style="${r.d >= 0 ? 'left:50%' : 'right:50%'};width:${Math.min(50, Math.abs(r.d) * 200).toFixed(1)}%"></i></span><span class="num ${r.good ? 'pos' : 'neg'}">${r.key === 'stab' ? (r.d >= 0 ? '+' : '−') + Math.round(Math.abs(r.d) * 100) : pc(r.d)}</span></div>`).join('');
    $('gv-estates').innerHTML = `<div class="gv-ecols"><div class="gv-elist">${rows}</div><div class="kn-sect"><div class="micro">Your rule against your age</div>
      <p class="kn-note">Every age has its usual laws. What yours give is set against what realms of your age mostly get from theirs: keep the ways of your forebears and you fall behind, reform well and you are ahead.</p>
      ${stand || '<p class="mk-dim">Level with your age in everything.</p>'}</div></div>`;
  }
  // ----- the faith of the realm (faith.js) -----
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const pct = (v) => (v >= 0.995 ? '100' : v > 0 && v < 0.01 ? '<1' : Math.round(v * 100)) + '%';
  const rgbCss = (F, f) => { const c = F.rgbOf(f); return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`; };
  const kindOf = (s, F, f) => { const X = F.list[f]; if (!X) return ''; const P = s.people && s.people.list[X.people]; return X.world ? 'A faith for all peoples' : `A faith of its people${P && P.name ? ', the ' + P.name : ''}`; };
  // a faith as one line of a list: its colour, its name, what it is to the list, and a bar of its share
  const frow = (s, F, f, sub, share, sel) => `<button class="gv-frow${sel === f ? ' sel' : ''}" data-faith="${f}" title="${esc(f ? cap(F.nameOf(f)) : 'The old ways')}"><i style="background:${f ? rgbCss(F, f) : 'rgb(120 112 98)'}"></i><span><b>${esc(f ? F.shortOf(f) : 'The old ways')}</b><small>${esc(sub)}</small></span>${share === undefined ? '' : `<span class="gv-bar"><i style="width:${(Math.min(1, share) * 100).toFixed(1)}%;background:${f ? rgbCss(F, f) : 'rgb(120 112 98)'}"></i></span><em>${pct(share)}</em>`}</button>`;
  function renderFaith() {
    const s = S(), c = me(), F = s.faith; if (!F) { $('gv-faiths').innerHTML = ''; $('gv-fthinfo').innerHTML = ''; return; }
    const K = s.faithCosts(), mine = F.state[c.id], ofMine = F.faithsOf(c.id, 8); let world = 0; for (const X of F.list) if (X && X.n > 0) world += X.pop;
    if (selFaith === 'new' && !K.canFound) selFaith = 0;      // (a realm with a faith founds none)
    if (selFaith !== 'new' && !(selFaith && F.list[selFaith])) selFaith = mine || (ofMine.find((q) => q[0]) || [0])[0] || (K.canFound ? 'new' : 0);
    // what the realm keeps, and what it could do about it
    const prophet = F.pending[c.id] >= 0 ? (s.cellName.get(F.pending[c.id]) || 'your capital') : null;
    const head = mine ? frow(s, F, mine, `${kindOf(s, F, mine)} · your realm's`, ofMine.reduce((a, q) => a + (q[0] === mine ? q[1] : 0), 0), selFaith)
      : `<div class="gv-fnone"><b>Your realm keeps the old ways</b><small>${prophet ? `A prophet has arisen in ${esc(prophet)}: his faith waits for you to found it.` : K.canFound ? 'Your priests could found a faith of the realm.' : `No faith can be founded before ${esc(discovery('priesthood').name)}.`}</small>${K.canFound ? `<button class="btn ${prophet ? 'primary' : ''}" data-faith="new">Found a faith${prophet ? '' : ` · ${K.found} authority`}</button>` : `<button class="linkish" data-kgo="priesthood">${esc(discovery('priesthood').name)}</button>`}</div>`;
    const people = ofMine.map(([f, v]) => frow(s, F, f, f === mine ? 'your realm\'s' : f ? (F.list[f].world ? 'for all peoples' : 'of its people') : 'their own gods and dead', v, selFaith)).join('');
    // the faiths of the realms within reach
    const around = new Map(); for (const b of s.diplo.reach(c.id)) { const bv = s.civs[b]; if (!bv || b === c.id) continue; const f = F.state[b]; if (!around.has(f)) around.set(f, []); around.get(f).push(bv); }
    const near = [...around].sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([f, list]) => frow(s, F, f, `${list.length === 1 ? s.fullName(list[0]) : list.length + ' realms: ' + list.slice(0, 2).map((x) => s.fullName(x)).join(', ') + (list.length > 2 ? ' ...' : '')}`, undefined, selFaith)).join('');
    const great = F.list.filter((X) => X && X.n > 0).sort((a, b) => b.pop - a.pop).slice(0, 8).map((X) => frow(s, F, X.id, `${X.realms} realm${X.realms === 1 ? '' : 's'} · ${X.world ? 'for all peoples' : 'of its people'}`, X.pop / Math.max(1e-9, world), selFaith)).join('');
    const fld = (t, note) => `<div class="gv-field">${svg(FLAME)}<b>${t}</b><small>${note}</small></div>`;
    $('gv-faiths').innerHTML = `<div class="gv-row">${fld('Your faith', 'the faith of the realm')}<div class="gv-flist">${head}</div></div>
      <div class="gv-row">${fld('Your people', 'what they keep')}<div class="gv-flist">${people || '<span class="mk-dim">Nobody yet</span>'}</div></div>
      <div class="gv-row">${fld('Around you', 'the realms within reach')}<div class="gv-flist">${near || '<span class="mk-dim">Nobody within reach</span>'}</div></div>
      <div class="gv-row">${fld('The world', 'its great faiths')}<div class="gv-flist">${great || '<span class="mk-dim">The world keeps the old ways</span>'}</div></div>`;
    $('gv-fthinfo').innerHTML = selFaith === 'new' ? foundPage(s, c, F, K, prophet) : selFaith ? faithPage(s, c, F, K, selFaith, ofMine, world) : `<div class="gv-head"><span class="ic">${svg(FLAME)}</span><div><h3>The old ways</h3><div class="micro">Each people its own gods</div></div></div><p class="gv-text">Each family keeps its own dead and its own holy places. No faith is preached here, and nobody asks a neighbour what he believes.</p>`;
  }
  // founding a faith: two tenets and a name
  function foundPage(s, c, F, K, prophet) {
    if (!founding.name) founding.name = F.suggest(c.id);
    const tenets = F.TENETS.map((T) => `<button class="gv-tenet${founding.tenets.indexOf(T.key) >= 0 ? ' on' : ''}" data-tenet="${T.key}"><b>${esc(T.name)}</b><small>${esc(T.text)}</small></button>`).join('');
    const ok = founding.tenets.length === 2 && K.canFound && K.auth >= K.found;
    return `<div class="gv-head"><span class="ic">${svg(FLAME)}</span><div><h3>A new faith</h3><div class="micro">${prophet ? 'A prophet has arisen in ' + esc(prophet) : 'Founded by the priests of your realm'}</div></div></div>
      <p class="gv-text">${prophet ? 'He preaches, and the court listens.' : 'Your priests would set down what the realm believes.'} ${K.world ? 'It will be a faith for all peoples: its preachers will go over every border.' : `It will be a faith of your people: it goes slowly among others, until your realm knows ${esc(discovery('scripture').name.toLowerCase())}.`}</p>
      <div class="gv-sect"><div class="micro">Its name</div><div class="gv-fname"><input id="gv-fname" maxlength="40" value="${esc(founding.name)}" spellcheck="false"><button class="btn icon ghost" data-gact="f-name" title="Another name">↻</button></div></div>
      <div class="gv-acts"><button class="btn primary" data-gact="f-found" ${ok ? '' : 'disabled'}>Found ${esc(founding.name || 'the faith')}</button></div>
      <div class="gv-state">${founding.tenets.length < 2 ? `Choose ${founding.tenets.length ? 'one more tenet' : 'two tenets'} below. ` : ''}${K.found ? `${K.found} authority <span class="mk-dim">(you hold ${Math.floor(K.auth)})</span>` : 'The prophet asks nothing'} · its holy city will be ${esc(s.cellName.get(prophet ? F.pending[c.id] : c.capital) || 'your capital')}</div>
      <div class="gv-sect"><div class="micro">Two tenets · ${founding.tenets.length} of 2 chosen</div><div class="gv-tenets">${tenets}</div></div>`;
  }
  // a faith's page: what it is, where it came from, its tenets, where it is kept, and what the realm can do about it
  function faithPage(s, c, F, K, f, ofMine, world) {
    const X = F.list[f], mine = F.state[c.id] === f; const holder = X.home >= 0 ? s.owner[X.home] : -1, hv = holder >= 0 ? s.civs[holder] : null;
    const here = (ofMine.find((q) => q[0] === f) || [0, 0])[1];
    const founder = X.founder >= 0 && s.civs[X.founder] ? ` by ${esc(s.fullName(s.civs[X.founder]))}` : '';
    const lines = [`First preached at ${esc(s.cellName.get(X.home) || 'a holy city')} in ${s.fmtYear(X.born)}${founder}.`];
    lines.push(hv ? (hv === c ? (mine ? 'Its holy city is yours.' : 'Its holy city is in your hands, and you keep another faith.') : `Its holy city is held by ${esc(s.fullName(hv))}${F.state[holder] === f ? ', who keep the faith' : ', who keep another'}.`) : 'Its holy city lies in nobody\'s land.');
    if (X.gone) lines.push(`Nobody has kept it since ${s.fmtYear(X.gone)}.`);
    const line = F.lineage(f).slice(1); const fam = line.length ? `<div class="gv-sect"><div class="micro">It came out of</div><div class="gv-chips">${line.map((q) => `<button class="kn-chip" data-faith="${q}">${esc(cap(F.nameOf(q)))}</button>`).join('')}</div></div>` : '';
    const sects = F.list.filter((Y) => Y && Y.parent === f && Y.n > 0); const kids = sects.length ? `<div class="gv-sect"><div class="micro">Churches broken from it</div><div class="gv-chips">${sects.map((Y) => `<button class="kn-chip" data-faith="${Y.id}">${esc(cap(Y.name))}</button>`).join('')}</div></div>` : '';
    const tenets = `<div class="gv-sect"><div class="micro">Its tenets</div><ul class="gv-gives">${X.tenets.map((k) => F.TK[k] ? `<li><b>${esc(F.TK[k].name)}.</b> ${esc(F.TK[k].text)}</li>` : '').join('')}</ul></div>`;
    const kept = `<div class="gv-sect"><div class="micro">Where it is kept</div><div class="gv-note">${X.n} regions · ${pct(X.pop / Math.max(1e-9, world))} of the world's people · the faith of ${X.realms} realm${X.realms === 1 ? '' : 's'}${here ? ` · ${pct(here)} of your people` : ''}</div></div>`;
    let how = '';
    if (!mine && !X.gone) { const cost = K.adopt(f); how = `<div class="gv-acts"><button class="btn primary" data-gact="f-adopt" data-k="${f}" ${K.auth >= cost ? '' : 'disabled'}>Take it up</button></div><div class="gv-state">${cost} authority <span class="mk-dim">(you hold ${Math.floor(K.auth)})</span>${here ? ` · ${pct(here)} of your people keep it already` : ' · none of your people keep it yet'}${K.shake && F.state[c.id] ? ` · the priests of ${esc(F.nameOf(F.state[c.id]))}, whom most of your people follow, will not forgive it: −${Math.round(K.shake * 100)} stability` : ''}</div>`; }
    if (mine) {
      const to = F.missionTo[c.id], tv = to >= 0 ? s.civs[to] : null;
      const targets = X.world ? s.diplo.reach(c.id).map((b) => s.civs[b]).filter((bv) => bv && bv !== c && F.state[bv.id] !== f).slice(0, 8) : [];
      const mis = !X.world ? '<div class="gv-note">A faith of its people sends no missionaries.</div>'
        : `${tv ? `<div class="gv-state on">Your missionaries are in ${esc(s.fullName(tv))} until ${s.fmtYear(F.missionUntil[c.id])}.</div>` : ''}${targets.length ? targets.map((bv) => `<div class="gv-mis"><span>${esc(s.fullName(bv))}<small>${esc(F.state[bv.id] ? cap(F.nameOf(F.state[bv.id])) : 'the old ways')}</small></span><button class="btn" data-gact="f-mission" data-k="${bv.id}" ${c.wealth >= K.mission && to !== bv.id ? '' : 'disabled'}>Send · ${K.mission} coin</button></div>`).join('') : '<div class="gv-note">Every realm within reach keeps it already.</div>'}<div class="gv-note">For ${K.missionYears} years its people hear them three times as often, and its ruler is readier to listen.</div>`;
      how = `<div class="gv-state on">The faith of your realm.</div><div class="gv-sect"><div class="micro">Missionaries</div>${mis}</div>
        <div class="gv-sect"><div class="micro">A church of your own</div>${K.canChurch ? `<div class="gv-acts"><button class="btn" data-gact="f-church" ${K.auth >= K.church ? '' : 'disabled'}>Break with it</button></div><div class="gv-state">${K.church} authority <span class="mk-dim">(you hold ${Math.floor(K.auth)})</span> · your people go with you, and the realms near you may follow</div>` : `<div class="gv-note">Not while your capital lies this near its holy city, before books are printed.</div>`}</div>`;
    }
    return `<div class="gv-head"><span class="ic" style="color:${rgbCss(F, f)}">${svg(FLAME)}</span><div><h3>${esc(cap(X.name))}</h3><div class="micro">${esc(kindOf(s, F, f))}</div></div></div>
      <p class="gv-text">${lines.join(' ')}</p>${how}${tenets}${kept}${fam}${kids}`;
  }
  // the strip under the title: authority, the reform under way, and what an estate demands
  function renderNow() {
    const s = S(), c = me(), R = RL(), k = RU(), Q = k.ruleOf(c); const pace = R.PACE[c.era]; const gain = k.gainOf(c.id, c);
    $('gv-auth').innerHTML = `${svg(CROWN)}<b>${Math.floor(Q.auth)}</b> <span>authority of ${R.AUTH_MAX} · +${(gain * pace).toFixed(gain * pace < 10 ? 1 : 0)} a turn</span>`;
    $('gv-auth').title = 'What your word can change. It gathers faster in a steady realm, under a ruler long on the throne, and under forms of government that put power in one hand.';
    const x = Q.reform ? (R.LAW[Q.reform.key] || R.FORM[Q.reform.key]) : null;
    const ref = x ? `<button class="gv-cur" data-ggo="${x.key}"><span class="micro">Reform</span><b>${esc(x.name)}</b><span class="kn-prog"><i style="width:${(100 * Math.min(1, (s.year - Q.reform.start) / Q.reform.dur)).toFixed(1)}%"></i></span><span class="num">in force in ${yrs(Math.max(1, Q.reform.start + Q.reform.dur - s.year))}</span></button>` : `<span class="gv-cur idle"><span class="micro">Reform</span><b>None under way</b></span>`;
    const D = Q.demand, L = D ? R.LAW[D.key] : null;
    const dem = D && L ? `<span class="gv-demand"><span class="micro">Demand</span><span>${esc(R.estateName(D.e, c.era))} want <button class="linkish" data-ggo="${L.key}">${esc(L.name)}</button> <span class="mk-dim">· ${yrs(Math.max(1, D.until - s.year))} to answer</span></span><button class="btn" data-gact="grant">Grant</button><button class="btn" data-gact="refuse">Refuse</button></span>` : '';
    $('gv-now').innerHTML = ref + dem;
  }
  function render() {
    const s = S(); if (!s || !isOpen()) return; const c = me(); if (!c) return;
    $('gv-sub').textContent = `${s.fullName(c)} · ${RL().FORM[RU().ruleOf(c).gov].name} · ${s.fmtYear(s.year)}`;
    renderNow(); if (tab === 'laws') renderLaws(); else if (tab === 'form') renderForms(); else if (tab === 'faith') renderFaith(); else if (tab === 'court') { if (window.COURT) COURT.render($('gv-court'), $('gv-ctinfo'), s, c); } else renderEstates();
    lastSig = sig();
  }
  const sig = () => { const s = S(), c = me(); if (!c) return String(s.year); const Q = RU().ruleOf(c); const F = s.faith; return `${s.year}:${Q.gov}:${Object.values(Q.laws).join(',')}:${Q.reform ? Q.reform.key : ''}:${Q.demand ? Q.demand.key : ''}:${Math.floor(Q.auth)}:${F ? F.state[c.id] + '/' + F.pending[c.id] + '/' + F.missionTo[c.id] : ''}:${Math.floor(c.wealth)}`; };
  function refresh() { const s = S(); if (!s || !isOpen()) return; if (sig() !== lastSig) render(); }
  // for the top bar and the turn button: authority, the reform under way, what is demanded, the angriest estate that matters
  function tile() {
    const s = S(), c = me(); if (!s || !c) return null; const R = RL(), k = RU(), Q = k.ruleOf(c); const p = c.id * R.NE;
    const x = Q.reform ? (R.LAW[Q.reform.key] || R.FORM[Q.reform.key]) : null; let worst = -1, ws = 0; for (let e = 0; e < R.NE; e++) { const v = k.power[p + e] * Math.max(0, 0.45 - Q.mood[e]); if (v > ws) { ws = v; worst = e; } }
    return { auth: Q.auth, max: R.AUTH_MAX, perTurn: k.gainOf(c.id, c) * R.PACE[c.era], form: R.FORM[Q.gov], reform: x ? { x, left: Math.max(1, Q.reform.start + Q.reform.dur - s.year) } : null,
      demand: Q.demand && R.LAW[Q.demand.key] ? { e: Q.demand.e, who: R.estateName(Q.demand.e, c.era), law: R.LAW[Q.demand.key], since: Q.demand.since, left: Math.max(1, Q.demand.until - s.year) } : null,
      angry: worst >= 0 && Q.mood[worst] < 0.35 && k.power[p + worst] >= 0.08 ? { who: R.estateName(worst, c.era), mood: Q.mood[worst] } : null, rose: Q.rose,
      // (where a realm is coming apart, someone marches on the capital: rule.js)
      army: c.stability < 0.65 && R.FORM[Q.gov].succ !== 'seized' && k.known(c.id, R.FORM.tyranny) ? { who: R.estateName(R.EK.soldiers, c.era) } : null };
  }
  // what a discovery opens here, as lines for its page in the knowledge tree
  function opensLines(key) { const R = RL(); return R.opens(key).map((x) => x.cat === undefined ? `A form of government: <button class="linkish" data-ggo="${x.key}">${esc(x.name)}</button>` : `A law of ${esc(R.CAT[x.cat].name.toLowerCase())}: <button class="linkish" data-ggo="${x.key}">${esc(x.name)}</button>`); }
  return { init, open, openFaith, openCourt, close, isOpen, refresh, render, show, tile, opensLines, gives, moodWord, mult, GIVE, NAME, CICON, EICON, svg };
})();
