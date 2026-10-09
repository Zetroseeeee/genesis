// Holocene treasury (classic script; exposes window.BANK): the Treasury tab of the market screen - the realm's debts and who
// holds them, what it may still borrow and at what rate, its coin and what it is worth, the banking houses and the chartered
// companies of the world and the realm's shares in them, the panics of late. It reads the simulation's finance (sim.finance,
// finance.js) and calls its actions through sim.financeAct.
window.BANK = (function () {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const fc = (v) => { const a = Math.abs(v); return (v < 0 ? '−' : '') + (a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e4 ? Math.round(a / 1e3) + 'k' : Math.round(a).toLocaleString()); };
  const pc = (v, d) => (100 * v).toFixed(d === undefined ? 1 : d) + '%';
  let ctx = null, bound = null, armed = 0;
  const S = () => ctx.sim(); const F = () => S().finance;
  const me = () => { const s = S(); return s ? s.playerCiv() : null; };
  // who lends a realm when no house does, by what it knows
  function home(c) { const s = S(), k = s.know, has = (key) => k.has[c * k.ND + window.KNOW.ID[key]] === 1; return has('bourse') ? 'your bondholders' : has('banking') ? 'your own bankers' : has('coinage') ? 'the moneylenders' : 'the temples'; }
  // a little line of a company's share price over the last turns
  function spark(h) {
    if (!h || h.length < 2) return '<svg class="bk-spark" viewBox="0 0 80 22"></svg>'; const lo = Math.min(...h), hi = Math.max(...h), span = Math.max(1e-6, hi - lo);
    const pts = h.map((v, k) => `${(k / (h.length - 1) * 78 + 1).toFixed(1)},${(20 - (v - lo) / span * 18).toFixed(1)}`).join(' '); const up = h[h.length - 1] >= h[0];
    return `<svg class="bk-spark ${up ? 'up' : 'dn'}" viewBox="0 0 80 22"><polyline points="${pts}"/></svg>`;
  }

  function act(what, a, b) {
    const s = S(), c = me(); if (!s || !c) return;
    if (what === 'default' && armed < Date.now() - 4000) { armed = Date.now(); render(); return; }      // (asked twice: it cannot be undone)
    armed = 0; const why = s.financeAct(what, a, b);
    const done = { borrow: 'The court borrows', repay: 'The court repays its lenders', default: 'The court repudiates its debts', debase: F().fine[c.id] < 1 && s.know.has[c.id * s.know.ND + window.KNOW.ID.centralbank] ? 'Money is printed' : 'The coin is debased', restore: 'The coin is restored to its full weight', house: 'A banking house opens its doors', company: 'A company is chartered', buy: 'Shares bought', sell: 'Shares sold' }[what];
    if (ctx.toast) ctx.toast(why || done || 'Done'); if (ctx.afterAct) ctx.afterAct(); render();
  }
  function onClick(e) { const b = e.target.closest('[data-fact]'); if (!b || b.disabled) return; act(b.dataset.fact, b.dataset.k, b.dataset.q); }

  let lastEl = null;
  function render(el, c0) {
    if (c0) ctx = c0; if (el) lastEl = el; el = lastEl; if (!el || !ctx) return;
    if (bound !== el) { el.addEventListener('click', onClick); bound = el; }
    const s = S(), c = me(); if (!s || !c) { el.innerHTML = '<div class="hint">You hold no realm.</div>'; return; }
    const K = F(), id = c.id, k = s.know, knows = (key) => k.has[id * k.ND + window.KNOW.ID[key]] === 1, e = Math.min(8, c.era | 0);
    const g = Math.max(1e-3, c.gross || c.income || 1), debt = K.debt[id], room = K.room(id), r = K.rateOf[id] || K.rate(id), canB = K.canBorrow(id);
    const T = K.TURN[e] || 50, yr = s.year, recentDef = K.lastDef[id] > -1e8 && yr - K.lastDef[id] < 3 * T;
    // ----- the head: debts, the coin, the world's money -----
    const amounts = [[g, 'a year of income'], [3 * g, 'three years'], [room, 'all they will lend']].filter((x, i, a) => x[0] > 1 && x[0] <= room + 1e-6 && (i === 2 || x[0] < room * 0.98));
    const borrowBtns = canB ? amounts.map(([v, t]) => `<button class="btn" data-fact="borrow" data-k="${Math.floor(v)}" title="${esc(t)}: at about ${pc(K.rate(id, v))} a year">${fc(v)}</button>`).join('') : '';
    const repayBtns = debt > 0 ? [[Math.min(debt, g), 'a year of income'], [debt, 'all of it']].filter((x, i, a) => i === 1 || x[0] < debt * 0.98).map(([v, t]) => `<button class="btn" data-fact="repay" data-k="${Math.ceil(v)}" ${c.wealth < Math.min(v, 1) ? 'disabled' : ''} title="${esc(t)}">${fc(v)}</button>`).join('') : '';
    const debtCard = `<div class="bk-card"><span class="micro">Debts</span><b class="bk-big">${debt > 0 ? fc(debt) : 'None'}</b>
      <small>${debt > 0 ? `at ${pc(r)} a year: ${fc(K.paid[id] || debt * r)} a year in interest, ${(debt / g).toFixed(1)} years of your income` : canB ? `Lenders would ask ${pc(r)} a year` : 'Nobody lends before there are tribute lists to lend against'}</small>
      ${canB ? `<span class="bk-stand" title="Your standing with lenders: what they make of your word"><i style="width:${(100 * K.stand[id]).toFixed(0)}%"></i></span><small>Standing with lenders ${Math.round(100 * K.stand[id])}${recentDef ? ` · you defaulted in ${s.fmtYear(K.lastDef[id])}` : ''}${K.panic[id] > 0.2 ? ' · <span class="neg">a panic in your markets</span>' : ''}</small>` : ''}
      ${canB ? `<div class="bk-row"><span class="micro">Borrow</span>${borrowBtns || '<small>Nobody will lend you more</small>'}</div>` : ''}
      ${debt > 0 ? `<div class="bk-row"><span class="micro">Repay</span>${repayBtns}<button class="btn danger${armed ? ' armed' : ''}" data-fact="default" title="Repudiate every debt: they are wiped, your lenders ruined, your standing gone for many years">${armed ? 'Repudiate: certain?' : 'Repudiate'}</button></div>` : ''}</div>`;
    const coin = K.coin(id), fine = K.fine[id], dear = K.dear[id], cb = knows('centralbank');
    const coinCard = `<div class="bk-card"><span class="micro">The coin</span>${knows('coinage') ? `<b class="bk-big">the ${esc(coin || 'coin')}</b>
      <span class="bk-fine" title="What is in it, against what it says"><i style="width:${(100 * fine).toFixed(0)}%"></i></span><small>${fine >= 0.999 ? (cb ? 'The currency holds its worth' : 'Full weight: worth what it says') : `${Math.round(100 * fine)}% of its ${cb ? 'worth' : 'weight'}`}${dear > 0.01 ? ` · prices ${Math.round(100 * dear)}% ahead of what people earn, settling` : ' · prices steady'}</small>
      <div class="bk-row"><button class="btn" data-fact="debase" ${fine < 0.3 ? 'disabled' : ''} title="Coin now, about ${fc((1 - window.FINANCE.DEBASE) * g * Math.min(T, 20) * 0.8)}; then prices rise, real taxes fall, people live worse and lenders trust the coin less">${cb ? 'Print money' : 'Debase the coin'}</button>${fine < 0.999 ? `<button class="btn" data-fact="restore" ${c.wealth < K.restoreCost(id) ? 'disabled' : ''} title="Back to full ${cb ? 'worth' : 'weight'}: lenders trust it again and prices settle sooner">Restore · ${fc(K.restoreCost(id))}</button>` : ''}</div>`
      : `<small>Your people strike no coin yet: coinage makes one, and moneylenders lend it.</small>`}</div>`;
    let worldPanic = 0; for (const x of s.civs) if (x && K.panic[x.id] > 0.2) worldPanic++;
    const cut = K.BASE[e] ? (K.rate(id) / K.BASE[e]) : 1;
    const worldCard = `<div class="bk-card"><span class="micro">The price of money</span><b class="bk-big">${pc(K.BASE[e] || 0)}</b><small>a year, in the ${esc(s.ERAS[e][0])}${K.BASE[e] ? `; to you ${pc(K.rate(id))} (${cut < 1 ? 'what your people know of money brings it down' : 'what lenders make of your realm puts it up'})` : ''}</small>
      <small>${worldPanic ? `<span class="neg">${worldPanic} realm${worldPanic === 1 ? '' : 's'} in a panic</span>` : 'No panic in the world'} · ${K.houses.filter((x) => !x.fail).length} banking houses · ${K.companies.filter((y) => !y.gone).length} companies</small>
      <small class="bk-know">${['coinage', 'banking', 'bourse', 'centralbank', 'finance'].map((key) => `<span class="${knows(key) ? 'on' : ''}" title="${esc(window.KNOW.LIST[window.KNOW.ID[key]].name)}${knows(key) ? ': known' : ': not yet known'}">${esc(window.KNOW.LIST[window.KNOW.ID[key]].name)}</span>`).join('')}</small></div>`;
    // ----- who holds the debt -----
    const owed = K.owesOf(id).sort((a, b) => b.amt - a.amt);
    const lenders = owed.length ? owed.map((o) => { const x = o.house, hc = x && x.c >= 0 ? s.civs[x.c] : null; return `<div class="bk-line"><span class="nm"><b>${esc(x ? x.name : home(id).replace(/^./, (m) => m.toUpperCase()))}</b><small>${x ? `${esc(s.cellName.get(x.at) || '?')}${hc ? ' · ' + esc(s.fullName(hc)) : ''}` : 'a quarter dearer than a house'}</small></span><span class="gv-bar"><i style="width:${(100 * o.amt / Math.max(1e-9, debt)).toFixed(1)}%"></i></span><em>${fc(o.amt)}</em></div>`; }).join('') : `<div class="hint">You owe nobody. ${canB ? `Lenders would give you up to ${fc(room)} at ${pc(r)} a year: banking houses first (yours, then those of the realms you touch or trade with), then ${home(id)}.` : ''}</div>`;
    // ----- banking houses -----
    const hs = K.houses.filter((x) => !x.fail).sort((a, b) => (b.c === id) - (a.c === id) || b.cap - a.cap).slice(0, 12);
    const houseRows = hs.map((x) => { const hc = x.c >= 0 ? s.civs[x.c] : null; return `<div class="bk-line${x.c === id ? ' me' : ''}"><span class="nm"><b>${esc(x.name)}</b><small>${esc(s.cellName.get(x.at) || '?')}${hc ? ' · ' + esc(s.fullName(hc)) : ''} · since ${s.fmtYear(x.born)}</small></span><em title="Its capital">${fc(x.cap)}</em><em title="What it has lent">${fc(x.lent)} lent</em></div>`; }).join('');
    const fails = K.houses.filter((x) => x.fail).sort((a, b) => b.failAt - a.failAt).slice(0, 3);
    const houseCost = K.houseCost(c);
    // ----- companies -----
    const cos = K.companies.filter((y) => !y.gone).sort((a, b) => (K.sharesOf(b, id) > 0) - (K.sharesOf(a, id) > 0) || b.cap * b.val - a.cap * a.val).slice(0, 12);
    const stake = Math.max(50, Math.round(g));
    const coRows = cos.map((y) => { const yc = y.c >= 0 ? s.civs[y.c] : null; const sh = K.sharesOf(y, id), mine = sh > 0 && y.c !== id ? sh * K.parOf(y) * y.val : 0;
      return `<div class="bk-co${y.c === id ? ' me' : ''}${y.heat > 0.3 ? ' hot' : ''}"><span class="nm"><b>${esc(y.name)}</b><small>${yc ? esc(s.fullName(yc)) : '?'} · returns ${pc(y.ret)} a year${y.heat > 0.3 ? ' · <span class="warn">a mania</span>' : yr - y.crash < 3 * T ? ` · crashed in ${s.fmtYear(y.crash)}` : ''}${mine ? ` · <b class="gold">yours: ${fc(mine)}</b>` : ''}</small></span>${spark(y.hist)}<em title="A share against its first price">${y.val.toFixed(2)}</em><span class="bk-btns"><button class="btn" data-fact="buy" data-k="${y.id}" data-q="${stake}" ${c.wealth < stake ? 'disabled' : ''} title="Buy ${fc(stake)} of its shares">Buy</button>${mine ? `<button class="btn" data-fact="sell" data-k="${y.id}" data-q="1" title="Sell all you hold, for ${fc(mine)}">Sell</button>` : ''}</span></div>`; }).join('');
    const coCost = K.companyCost(c);
    const crises = K.crises.slice(-8).reverse().map((x) => { const xc = s.civs[x.c]; return `<div class="dp-log-row"><b>${s.fmtYear(x.year)}</b><span>${esc(x.text || x.what)}${xc ? ` · ${esc(s.fullName(xc))}` : ''}</span></div>`; }).join('');
    el.innerHTML = `<div class="bk-head">${debtCard}${coinCard}${worldCard}</div>
      <div class="bk-cols"><div class="bk-sect"><span class="micro">Who holds your debt</span>${lenders}
        <span class="micro bk-sub">Banking houses${hs.length ? ` · the greatest of ${K.houses.filter((x) => !x.fail).length}` : ''}</span>${houseRows || `<div class="hint">${knows('banking') ? 'No house anywhere in the world yet.' : 'None of your people can lend a letter in one city to be paid in another: banking makes houses.'}</div>`}
        ${knows('banking') ? `<div class="bk-row"><button class="btn" data-fact="house" ${c.wealth < houseCost ? 'disabled' : ''} title="A house in your capital: it lends to you first, and to the realms you trade with, and pays you a share of its interest">Charter a banking house · ${fc(houseCost)}</button></div>` : ''}
        ${fails.length ? `<span class="micro bk-sub">Failed</span>${fails.map((x) => `<div class="bk-line dead"><span class="nm"><b>${esc(x.name)}</b><small>${esc(s.cellName.get(x.at) || '?')} · failed in ${s.fmtYear(x.failAt)}</small></span></div>`).join('')}` : ''}</div>
        <div class="bk-sect"><span class="micro">Chartered companies</span>${coRows || `<div class="hint">${knows('companies') ? 'No company has been chartered yet.' : 'Chartered companies: hundreds of investors share the cost of a voyage and its profit. Your people do not know of them yet.'}</div>`}
        ${knows('companies') ? `<div class="bk-row"><button class="btn" data-fact="company" ${c.wealth < coCost || !(s.ports[id] > 0) ? 'disabled' : ''} title="${s.ports[id] > 0 ? 'A company for the far trade, from one of your harbours: you hold all of it' : 'Needs a harbour'}">Charter a company · ${fc(coCost)}</button>${K.holdingValue(id) > 0 ? `<small>Your shares abroad: ${fc(K.holdingValue(id))}</small>` : ''}</div>` : ''}
        <span class="micro bk-sub">Panics of late</span>${crises || '<div class="hint">None that the world remembers.</div>'}</div></div>`;
  }
  return { render };
})();
