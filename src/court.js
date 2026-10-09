// Holocene court (classic script; exposes window.COURT): the Court tab of the laws screen. The ruler's family as a tree of
// faces (parents; the ruler and spouse with brothers and sisters; children; grandchildren), each with an age, a character
// and a place in the line; the line of succession; a regency; the house and the line of its rulers. A person's page says who
// they are and what can be done: raise a child to a character, pass over an heir or restore one, marry a child into the
// nobility. It reads sim.dynasty (dynasty.js) and calls sim.courtAct; gov.js draws it while its tab is open.
window.COURT = (function () {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const CROWN = 'M4 18h16l1-10-5 4-4-7-4 7-5-4z', RING = 'M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM9 5l3-3 3 3-3 3z';
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="${d}"/></svg>`;
  let sel = 0;            // the person on the page (0: the heir, or the ruler when there is none)
  const yrs = (n) => n + (n === 1 ? ' year' : ' years');

  // ----- words -----
  const royal = (D, fam) => D.dynastic(fam.kind);
  // what one of the family is called at court: Prince Eadric, the King's brother; plain names where rulers are not of a house
  function styled(D, fam, p) { if (!p) return ''; if (p === fam.ruler) return `${fam.title} ${p.n}`; if (p.r && p.r[1] && p.c === fam.c && fam.titles) return `${fam.titles[p.f ? 1 : 0]} ${p.n}`; return royal(D, fam) && p.h && p.h === fam.ruler.h ? `${p.f ? 'Princess' : 'Prince'} ${p.n}` : p.n; }      // (one who reigned here before is called by the throne's title)
  function ageText(s, D, p) { const yr = s.year; if (p.b > yr) return 'not yet born'; if (!D.alive(p, yr)) { const a = p.d - p.b; return a < 2 ? `died in infancy, ${s.fmtYear(p.d)}` : `died aged ${a}, ${s.fmtYear(p.d)}`; } const a = yr - p.b; return a < 1 ? 'born this year' : `${a} year${a === 1 ? '' : 's'} old`; }
  // a character as the court knows it: a child's shows from six, and is fixed at sixteen
  function charOf(s, D, p) {
    const T = s.TRAITS[p.t]; if (!T) return null; const a = s.year - p.b; if (!D.alive(p, s.year)) return { label: T.label, text: T.a, desc: T.desc, fixed: true };
    if (a < 6) return null; if (a < D.ADULT) return { label: T.label, text: `shows the makings of ${T.a}`, desc: T.desc, fixed: false, raised: !!p.rz };
    return { label: T.label, text: T.a, desc: T.desc, fixed: true, raised: !!p.rz };
  }

  // ----- faces -----
  // (a face is painted once the markup is in: every canvas that names a person)
  function face(p, size, s, c, D, cls) { return `<canvas class="ct-face ${cls || ''}" data-face="${p.id}" width="${size * 2}" height="${size * 2}" style="width:${size}px;height:${size}px"></canvas>`; }
  function paint(root, s, c, D) {
    if (!window.PORTRAIT) return; const cul = window.TOWN ? TOWN.CULTURES[TOWN.civCulture(s, c)] : 'north';
    const C = D.court[c.id], ruler = C ? D.of(C.ruler) : null, crown = D.dynastic(s.succKind(c));
    for (const cv of root.querySelectorAll('canvas[data-face]')) { const p = D.of(+cv.dataset.face); if (!p) continue; const H = p.h ? D.houses.get(p.h) : null;
      const rank = p === ruler ? 'ruler' : crown && ruler && (p.h === ruler.h || p.id === ruler.s) ? 'royal' : 'none';      // (the crown on the ruler's head; a circlet for his house and consort)
      const age = Math.max(1, (D.alive(p, s.year) ? s.year : p.d) - p.b); PORTRAIT.draw(cv, { seed: p.sd, culture: cul, era: c.era, fem: p.f, trait: age >= 6 ? p.t : 'steward', color: c.color, age, house: H ? H.seed : 0, child: age < D.ADULT, rank }); }
  }

  // ----- the tree -----
  function card(s, D, fam, p, c, opts) {
    opts = opts || {}; const yr = s.year, dead = !D.alive(p, yr), heir = fam.heir === p, passed = fam.passed.includes(p.id), ch = charOf(s, D, p);
    const sp = D.of(p.s); const marks = [heir ? `<i class="ct-mk heir" title="Heir to the throne">${svg(CROWN)}</i>` : '', passed ? '<i class="ct-mk passed" title="Passed over">passed over</i>' : '', sp && D.alive(sp, yr) && !opts.big ? `<i class="ct-mk wed" title="Married to ${esc(sp.n)}">${svg(RING)}</i>` : ''].join('');
    return `<button class="ct-card${dead ? ' dead' : ''}${heir ? ' heir' : ''}${opts.big ? ' big' : ''}${sel === p.id ? ' sel' : ''}" data-court="${p.id}">${face(p, opts.big ? 64 : 44, s, c, D)}<span class="ct-txt"><b>${esc(opts.name || p.n)}</b><small>${esc(opts.sub || ageText(s, D, p))}</small>${ch ? `<em class="${ch.fixed ? '' : 'young'}">${esc(ch.label)}${ch.fixed ? '' : '?'}</em>` : ''}</span>${marks}</button>`;
  }
  function render(host, info, s, c) {
    const D = s.dynasty; if (!D) { host.innerHTML = ''; info.innerHTML = ''; return; }
    const fam = D.familyOf(c.id); if (!fam) { host.innerHTML = '<div class="gv-note" style="padding:16px">Nobody rules here yet.</div>'; info.innerHTML = ''; return; }
    fam.title = c.ruler ? c.ruler.title : ''; fam.c = c.id; fam.titles = s.rule && s.rule.naming ? s.rule.naming(c).titles : null; const yr = s.year, r = fam.ruler, H = fam.house, rf = royal(D, fam);
    const field = (t, note) => `<div class="gv-field">${svg(CROWN)}<b>${t}</b><small>${note}</small></div>`;
    // (the head: the house, and how rulers come here)
    const how = { blood: 'The throne passes by blood, to the eldest son and his line, then the daughters', named: 'The emperor names his heir from among his grown children', seized: 'Whoever can take power holds it', chosen: 'The elders choose who leads', holy: 'The priests choose who leads', elected: 'Those who lead are elected for a term of years', party: 'The party names who leads' }[fam.kind] || '';
    const head = H ? `<div class="ct-house"><div><span class="micro">Your house</span><h3>${esc(cap(H.name))}</h3><small>${H.ended ? 'no longer on the throne' : `on the throne since ${s.fmtYear(H.founded)}`} · ${H.n} reign${H.n === 1 ? '' : 's'} · ${esc(how)}</small></div></div>`
      : `<div class="ct-house"><div><span class="micro">No house holds the throne</span><h3>${esc(s.fullName(c))}</h3><small>${esc(how)}</small></div></div>`;
    const R = fam.regent; const regency = R && R.p ? `<div class="ct-regency">${face(R.p, 40, s, c, D)}<span><b>A regency</b> ${esc(styled(D, fam, r))} is ${yr - r.b}: ${R.who === 'noble' ? 'the great noble' : (r.f ? 'her ' : 'his ') + R.who} ${esc(R.p.n)}, ${esc(s.TRAITS[R.p.t] ? s.TRAITS[R.p.t].a : '')}, rules until ${s.fmtYear(R.until)} <small>(${yrs(Math.max(1, R.until - yr))}). The realm is a little less settled meanwhile.</small></span></div>` : '';
    const rows = [];
    const elders = [fam.father, fam.mother].filter(Boolean); if (elders.length) rows.push(`<div class="gv-row">${field('Parents', r.f ? 'of the queen' : 'of the ruler')}<div class="ct-gen">${elders.map((p) => card(s, D, fam, p, c)).join('')}</div></div>`);
    const sibs = fam.siblings.filter((p) => p.b <= yr);
    rows.push(`<div class="gv-row">${field('The throne', r.f ? 'she who rules, and her consort' : 'he who rules, and his consort')}<div class="ct-gen">${card(s, D, fam, r, c, { big: true, name: `${fam.title} ${r.n}`, sub: `${ageText(s, D, r)} · reigns since ${s.fmtYear(r.r ? r.r[0] : c.ruler.since)}` })}${fam.spouse ? `<span class="ct-wed" title="Married">${svg(RING)}</span>${card(s, D, fam, fam.spouse, c)}` : ''}</div></div>`);
    if (sibs.length) rows.push(`<div class="gv-row">${field('Brothers and sisters', 'and their children')}<div class="ct-gen">${sibs.map((p) => card(s, D, fam, p, c, { name: styled(D, fam, p) })).join('')}</div></div>`);
    rows.push(`<div class="gv-row">${field('Children', fam.kids.length ? `${fam.kids.filter((k) => D.alive(k, yr)).length} living` : 'none yet')}<div class="ct-gen">${fam.kids.length ? fam.kids.map((p) => card(s, D, fam, p, c, { name: styled(D, fam, p) })).join('') : '<span class="gv-note">No children yet.</span>'}</div></div>`);
    const grand = []; for (const k of fam.kids) { const g = k.k.map(D.of).filter((x) => x && x.b <= yr); if (g.length) grand.push(`<div class="ct-branch"><span class="micro">of ${esc(k.n)}</span><div class="ct-gen">${g.map((p) => card(s, D, fam, p, c, { name: styled(D, fam, p) })).join('')}</div></div>`); }
    if (grand.length) rows.push(`<div class="gv-row">${field('Children\'s children', 'by their parents')}<div class="ct-grand">${grand.join('')}</div></div>`);
    // (the line of succession, and the house's rulers)
    if (rf) rows.push(`<div class="gv-row">${field('The line', 'who comes after, in order')}<ol class="ct-line">${fam.line.length ? fam.line.map((p, i) => `<li><button class="linkish" data-court="${p.id}">${esc(styled(D, fam, p))}</button> <span class="mk-dim">${esc(D.kinOf(r, p))}, ${yr - p.b}${i === 0 && yr - p.b < D.ADULT ? ' · a child: there would be a regency' : ''}${fam.passed.includes(p.id) ? ' · passed over' : ''}</span></li>`).join('') : '<li class="none">Nobody: should the ruler die now, a kinsman of the house may come, or the house will end</li>'}</ol></div>`);
    // (houses joined to this one by a royal marriage: should their line fail, a claim on their throne)
    { const ties = [], d = c.dip; if (d && s.diplo) for (const k in d.pact) { const o = s.civs[+k]; if (!o || !s.diplo.has(c, o.id, 'marriage')) continue; const oh = D.houseOf(o.id), of2 = D.familyOf(o.id); let pair = '';
        if (of2) { const B = new Set([of2.ruler, ...of2.kids].map((x) => x.id)); const x = [r, ...fam.kids].find((p) => p.s && B.has(p.s) && D.alive(p, yr)); if (x) pair = `${x.n} is wed to ${D.of(x.s).n}`; }
        ties.push(`<li><b>${esc(oh ? cap(oh.name) : s.fullName(o))}</b> <span class="mk-dim">of ${esc(s.fullName(o))}${pair ? ' · ' + esc(pair) : ''}</span></li>`); }
      if (ties.length) rows.push(`<div class="gv-row">${field('Joined by marriage', 'should their line fail: a claim on their throne')}<ul class="ct-reigns">${ties.join('')}</ul></div>`); }
    if (H && H.line.length) rows.push(`<div class="gv-row">${field('Its rulers', H.n > H.line.length ? `the last ${H.line.length} of ${H.n}` : 'from the first')}<ol class="ct-reigns">${H.line.slice().reverse().map((L) => `<li><b>${esc(L[0])}${L[3] ? ' ' + esc(L[3]) : ''}</b> <span class="num mk-dim">${s.fmtYear(L[1])} – ${L[2] ? s.fmtYear(L[2]) : 'now'}${L[2] ? ` · ${yrs(Math.max(1, L[2] - L[1]))}` : ''}</span></li>`).join('')}</ol></div>`);
    host.innerHTML = head + regency + rows.join('');
    { const near = new Set([r.id, r.s, r.p, r.m, R && R.pid, ...r.k, ...fam.siblings.map((x) => x.id)]); for (const k of fam.kids) for (const g of k.k) near.add(g); for (const k of fam.kids) near.add(k.s); if (!sel || !D.of(sel) || !near.has(sel)) sel = (fam.heir || r).id; }      // (someone of this family: after a load, or a death, the heir)
    info.innerHTML = page(s, D, fam, c, D.of(sel));
    paint(host, s, c, D); paint(info, s, c, D);
  }

  // ----- a person's page -----
  function page(s, D, fam, c, p) {
    if (!p) return ''; const yr = s.year, r = fam.ruler, alive = D.alive(p, yr), age = yr - p.b, ch = charOf(s, D, p);
    const mine = p === r || r.k.includes(p.id) || r.k.some((id) => { const k = D.of(id); return k && k.k.includes(p.id); });
    const pos = fam.line.indexOf(p); const ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
    const role = p === r ? `${fam.title} of ${c.name}` : fam.heir === p ? `Heir to the throne · ${D.kinOf(r, p)} of the ${fam.title.toLowerCase()}` : `${cap(D.kinOf(r, p))} of the ${fam.title.toLowerCase()}`;
    const head = `<div class="ct-phead">${face(p, 96, s, c, D, 'big')}<div><h3>${esc(styled(D, fam, p))}</h3><div class="micro">${esc(role)}</div><div class="ct-age">${esc(ageText(s, D, p))}${alive && p.b < yr ? ' · born ' + s.fmtYear(p.b) : ''}</div></div></div>`;
    const lines = [];
    const dad = D.of(p.p), mum = D.of(p.m); if (dad || mum) lines.push(`${p.f ? 'Daughter' : 'Son'} of ${[dad, mum].filter(Boolean).map((x) => `<button class="linkish" data-court="${x.id}">${esc(styled(D, fam, x))}</button>`).join(' and ')}`);
    const sp = D.of(p.s); if (sp) lines.push(`${D.alive(sp, yr) ? 'Married to' : 'Widowed of'} <button class="linkish" data-court="${sp.id}">${esc(sp.n)}</button>${sp.h && sp.h !== p.h && D.houses.get(sp.h) ? ' of ' + esc(D.houses.get(sp.h).name) : sp.h ? '' : ', of a great family of the realm'}`);
    const kids = p.k.map(D.of).filter((k) => k && k.b <= yr); if (kids.length) lines.push(`${kids.length} ${kids.length === 1 ? 'child' : 'children'}: ${kids.map((k) => `<button class="linkish" data-court="${k.id}">${esc(k.n)}</button>`).join(', ')}`);
    if (p === r && r.r) lines.push(`On the throne since ${s.fmtYear(r.r[0])}: ${yrs(Math.max(0, yr - r.r[0]))}`);
    if (p !== r && royal(D, fam)) lines.push(pos >= 0 ? `${ORD[pos] || (pos + 1) + 'th'} in the line of succession${fam.passed.includes(p.id) ? ', passed over' : ''}` : alive ? (fam.passed.includes(p.id) ? 'Passed over' : 'Not in the line') : '');
    const chText = ch ? `<div class="gv-sect"><div class="micro">Character</div><div class="ct-char"><b>${esc(cap(ch.text))}${ch.raised ? ', as the court had ' + (p.f ? 'her' : 'him') + ' raised' : ''}.</b> ${esc(ch.desc)}${!ch.fixed ? ` <span class="mk-dim">Fixed at sixteen, in ${yrs(D.ADULT - age)}.</span>` : ''}</div></div>` : alive && age < 6 ? `<div class="gv-sect"><div class="micro">Character</div><div class="gv-note">Too young to tell.</div></div>` : '';
    // (what can be done)
    const acts = []; const cv = c;
    if (alive && mine && p !== r && age < D.ADULT) {
      const cost = D.raiseCost(cv); acts.push(`<div class="gv-sect"><div class="micro">Raise ${p.f ? 'her' : 'him'} as · ${cost} coin</div><div class="ct-raise">${D.TRAITS.map((t) => `<button class="ct-tr${p.t === t ? (p.rz ? ' on' : ' lean') : ''}" data-cact="raise" data-p="${p.id}" data-t="${t}" ${cv.wealth >= cost && !(p.t === t && p.rz) ? '' : 'disabled'} title="${esc(s.TRAITS[t].desc)}">${esc(s.TRAITS[t].label)}</button>`).join('')}</div><div class="gv-note">Tutors, a household and the company ${p.f ? 'she' : 'he'} keeps: ${p.f ? 'her' : 'his'} character as a ruler, should ${p.f ? 'she' : 'he'} come to the throne. ${age < 6 ? '' : `${p.f ? 'She' : 'He'} leans to ${esc(s.TRAITS[p.t] ? s.TRAITS[p.t].label.toLowerCase() : 'nothing yet')} now.`}</div></div>`);
    }
    if (alive && r.k.includes(p.id) && royal(D, fam)) {
      const passed = fam.passed.includes(p.id);
      acts.push(`<div class="gv-sect"><div class="micro">The succession</div><div class="gv-acts">${passed ? `<button class="btn" data-cact="unpass" data-p="${p.id}">Restore ${p.f ? 'her' : 'him'} to the line</button>` : `<button class="btn" data-cact="pass" data-p="${p.id}">Pass ${p.f ? 'her' : 'him'} over</button>`}</div><div class="gv-note">${passed ? `${p.f ? 'She' : 'He'} and ${p.f ? 'her' : 'his'} children come last in the line.` : `${p.f ? 'She' : 'He'} and ${p.f ? 'her' : 'his'} children go to the end of the line: the throne passes to the next. Free, and it may be undone.`}</div></div>`);
    }
    if (alive && mine && p !== r && age >= D.ADULT && !(sp && D.alive(sp, yr))) acts.push(`<div class="gv-sect"><div class="micro">Marriage</div><div class="gv-acts"><button class="btn" data-cact="match" data-p="${p.id}">Marry ${p.f ? 'her' : 'him'} into the nobility</button></div><div class="gv-note">A match from a great family of the realm: children to carry the line. A royal marriage with another house is sworn with its realm (Diplomacy, F).</div></div>`);
    return `${head}<div class="ct-facts">${lines.filter(Boolean).map((t) => `<div>${t}</div>`).join('')}</div>${chText}${acts.join('')}`;
  }

  // ----- what the player does -----
  function click(e, s, toast) {
    const a = e.target.closest('[data-cact]'); if (a) { const why = s.courtAct(a.dataset.cact, +a.dataset.p, a.dataset.t); const p = s.dynasty.of(+a.dataset.p);
      if (why) toast(why); else if (p) toast(a.dataset.cact === 'raise' ? `${p.n} is to be raised as ${s.TRAITS[a.dataset.t].a}` : a.dataset.cact === 'pass' ? `${p.n} is passed over` : a.dataset.cact === 'unpass' ? `${p.n} is restored to the line` : `${p.n} is married`); return true; }
    const b = e.target.closest('[data-court]'); if (b) { sel = +b.dataset.court; return true; }
    return false;
  }
  function select(id) { sel = id || 0; }
  return { render, click, select };
})();
