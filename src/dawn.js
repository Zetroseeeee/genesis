// The dawn of an age (dawn.js; window.DAWN): the page that opens when the player's people enter a new age. The painting of the age,
// what the age was in the world's history in a few lines, and what it brings the realm: how its towns will be built, the works that
// come within reach and the discoveries they stand on, the forms of government and the laws its learning opens, the six ambitions it
// sets (legacy.js), and where the realm stands among the world's peoples in it - the first into it, how many are there already.
window.DAWN = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const AGES = ['Stone Age', 'Bronze Age', 'Iron Age', 'Classical Age', 'Middle Ages', 'Renaissance', 'Industrial Age', 'Modern Age', 'Information Age', 'Space Age'];
  // the age in the world's history, as the chronicle tells it
  const TEXT = [
    'Bands of kin follow the herds and the seasons; the first fields are sown where the floods leave the earth soft. Everything is still to be learned.',
    'Copper and tin are smelted into bronze, and with it come walled towns, temples, writing and kings. The river plains feed the first cities.',
    'Iron is common where bronze was rare: every farmer can own a blade and a ploughshare. Coin, roads and ships draw the world together, and empires reach further.',
    'Philosophers, engineers and physicians; aqueducts, theatres and great libraries. Empires span the seas, and the faiths of all peoples are born.',
    'The heavy plough opens the northern forests; castles, cathedrals and guilds rise. Gunpowder and the compass come out of the East.',
    'The press spreads learning; ships cross every ocean, and worlds that never knew each other meet. Banks and companies follow the ships.',
    'Coal and steam: factories, railways and steel. Cities swell with those who leave the fields, and the workers ask for their share.',
    'Engines, electricity and oil; the world is wired and flown over. Cities rise in towers, and wars are fought by whole nations.',
    'Computers and networks; the green revolution feeds billions. The world trades as one market, and machines begin to think.',
    'Fusion lights the cities and thinking machines work beside people. Towns rise beyond the Earth, and the road to the stars is opened.',
  ];
  let ctx = null;
  function init(c) {
    ctx = c;
    $('dawn').addEventListener('click', (e) => { const b = e.target.closest('[data-dw]'); if (!b) return; const k = b.dataset.dw;
      if (k === 'close') close(); else if (k === 'atlas') { close(); if (ctx.onAtlas) ctx.onAtlas(); } else if (k === 'know') { close(); if (ctx.onKnow) ctx.onKnow(); } });
    $('dawn').addEventListener('close', () => { if (ctx.onClose) ctx.onClose(); });
  }
  const isOpen = () => !!$('dawn') && $('dawn').open;
  function close() { const d = $('dawn'); if (d && d.open) d.close(); }
  // the age a realm has just entered (or any age it has reached, to look at again)
  function open(era) {
    const s = ctx && ctx.sim(), c = s && s.playerCiv(); if (!c) return false;
    const e = Math.max(0, Math.min(AGES.length - 1, era === undefined ? c.era : era)), K = window.KNOW, R = window.RULE, L = s.legacy, LG = window.LEGACY;
    const art = ctx.artOf ? ctx.artOf(e) : ''; $('dw-img').src = art || ''; $('dw-fig').hidden = !art;
    $('dw-kicker').textContent = `A new age · ${s.fmtYear(s.year)}`;
    $('dw-title').textContent = `The ${AGES[e]}`;
    $('dw-text').textContent = TEXT[e];
    // what it brings: the towns, the works, the discoveries, the government
    const rows = [];
    const cul = window.TOWN && TOWN.civCulture ? TOWN.civCulture(s, c) : -1, style = cul >= 0 && TOWN.styleEra ? TOWN.styleEra(e, cul) : e;
    rows.push(['Your towns', style < e ? `Your people go on building as their forebears did: the houses, walls and shrines of the ${AGES[style]}.` : 'Your towns are built anew in the manner of the age, plot by plot, as they grow.']);
    if (K) {
      const disc = K.LIST.filter((d) => d.era === e), known = (d) => !!(s.know && s.know.knows && s.know.knows(c.id, d.key));
      const works = Object.keys(K.WORK_BY || {}).filter((w) => K.LIST[K.WORK_BY[w]] && K.LIST[K.WORK_BY[w]].era === e && s.BUILD && s.BUILD[w]);
      if (works.length) rows.push(['To build', works.map((w) => `${s.BUILD[w].name} <span class="dw-n">(${esc(K.LIST[K.WORK_BY[w]].name)})</span>`).join(', ')]);
      if (disc.length) { const kn = disc.filter(known).length; rows.push(['To discover', `${disc.length} discoveries${kn ? `, ${kn} known already` : ''}: ${disc.slice(0, 6).map((d) => esc(d.name)).join(', ')} and more`]); }
    }
    if (R && R.age) {
      R.age(); const forms = [...new Set(R.FORMS.filter((f) => f.era === e).map((f) => f.name))], laws = R.LAWS.filter((l) => l.era === e).length;
      if (forms.length || laws) rows.push(['To rule', `${forms.length ? forms.map(esc).join(', ') : ''}${forms.length && laws ? '; and ' : ''}${laws ? `${laws} laws` : ''}`]);
    }
    $('dw-brings').innerHTML = rows.map(([k, v]) => `<div class="dw-row"><span class="dw-k">${esc(k)}</span><span class="dw-v">${k === 'To build' || k === 'To discover' || k === 'To rule' ? v : esc(v)}</span></div>`).join('');
    // the ambitions of the age (legacy.js): what this age will remember a people for
    let amb = '';
    if (L && L.view) { const v = L.view(c.id); if (v && v.now && v.now.length) amb = v.now.map((a) => `<div class="dw-amb"><b>${esc(a.name)}</b><span>${esc(a.ask || '')}</span><i>${esc(a.pathName || '')} · ${a.worth}</i></div>`).join(''); }
    $('dw-amb').innerHTML = amb || '<p class="ep-none">This age asks nothing of a people yet.</p>';
    $('dw-ambs').hidden = !amb;
    // where the realm stands in it among the world's peoples
    let first = null; if (L && LG) { const F = L.save().f, k = LG.FIRSTS.findIndex((f) => f.key === 'age' + e); if (k >= 0 && F[k]) first = F[k]; }
    let there = 0, all = 0; for (const o of s.civs) if (o) { all++; if (o.era >= e) there++; }
    $('dw-world').textContent = first ? (first[1] === c.id ? `${s.fullName(c)} is the first people of the world to enter it. ` : `The first into it was ${first[2]}, in ${s.fmtYear(first[0])}. `) + `${there} of the world's ${all} peoples are in it now.`
      : e === 0 ? '' : `${there} of the world's ${all} peoples are in it now.`;
    $('dw-actions').innerHTML = '<button class="btn primary" data-dw="close">Onward</button><button class="btn" data-dw="know">What to discover</button>' + (s.replay && s.replay.frames.length > 1 ? '<button class="btn" data-dw="atlas">The world through the ages</button>' : '');
    const d = $('dawn'); if (!d.open) d.showModal(); d.querySelector('.dw-page').scrollTop = 0; const b = d.querySelector('[data-dw="close"]'); if (b) b.focus({ preventScroll: true });
    return true;
  }
  return { init, open, close, isOpen, AGES, TEXT };
})();
