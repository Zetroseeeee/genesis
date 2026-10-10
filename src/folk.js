// Holocene folk (classic script; exposes window.FOLK): the Peoples tab of the laws screen. Who lives in the realm (its peoples, the
// rulers' own first), where the rulers' people live beyond it, who came in the last decade and from where, who left and for where,
// the world's great migrations; and what the realm says of its borders and of its people leaving (migrate.js's policies). It reads
// sim.people and sim.mig and calls sim.migPolicy; gov.js draws it while its tab is open.
window.FOLK = (function () {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
  const FOLKS = 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 2.5-5 5-5s5 2 5 5M11 20c0-3 2.5-5 5-5s5 2 5 5';
  const ROAD = 'M4 20l4-16M20 20l-4-16M12 6v2M12 11v2M12 16v2';
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="${d}"/></svg>`;
  const css = (rgb) => `rgb(${Math.round(rgb[0] * 255)} ${Math.round(rgb[1] * 255)} ${Math.round(rgb[2] * 255)})`;
  // thousands of people, as the page says them
  const many = (k) => { const n = k * 1000; return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' million' : n >= 1000 ? (Math.round(n / 1000) * 1000).toLocaleString() : Math.max(10, Math.round(n / 10) * 10).toLocaleString(); };
  const pct = (v) => (v >= 0.995 ? '100%' : v >= 0.01 ? Math.round(v * 100) + '%' : v > 0 ? '<1%' : '0%');
  // (a row with a share has its bar; one without has its number in full)
  const row = (dot, name, sub, share, n) => `<div class="gv-frow fk-row${share === undefined ? ' n' : ''}"><i style="background:${dot}"></i><span><b>${esc(name)}</b><small>${esc(sub)}</small></span>${share === undefined ? '' : `<span class="gv-bar"><i style="width:${(Math.min(1, share) * 100).toFixed(1)}%;background:${dot}"></i></span>`}<em>${n}</em></div>`;
  const fld = (t, note) => `<div class="gv-field">${svg(FOLKS)}<b>${t}</b><small>${note}</small></div>`;

  // where a people lives outside a realm: [[realm, thousands], ...], the largest first (a pass over the land, made when the page is drawn)
  function abroad(s, P, c, p) {
    if (!p) return []; const m = new Map(); for (const i of s.LI) { if (P.ppl[i] !== p) continue; const o = s.owner[i]; if (o === c || o < 0 || !s.civs[o]) continue; m.set(o, (m.get(o) || 0) + s.pop[i]); }
    return [...m].sort((a, b) => b[1] - a[1]);
  }
  function render(host, info, s, c) {
    const P = s.people, M = s.mig; if (!P) { host.innerHTML = '<p class="gv-text">The world has no peoples yet.</p>'; info.innerHTML = ''; return; }
    // (the peoples of a realm, the largest first; those under one in two hundred of it together in one line)
    const mine = P.ruling[c.id], all = P.peoplesOf(c.id, 4096), realm = s.fullName(c);
    const ofMine = all.filter(([p, v], k) => k < 8 && (v >= 0.005 || p === mine)), rest = all.filter((q) => !ofMine.includes(q)), restV = rest.reduce((a, q) => a + q[1], 0);
    const rows = ofMine.map(([p, v]) => row(css(P.rgbOf(p)), cap(P.nameOf(p)), p === mine ? 'your rulers\' people' : 'under your rule', v, pct(v))).join('')
      + (rest.length ? row('var(--text-3)', rest.length === 1 ? cap(P.nameOf(rest[0][0])) : `${rest.length} other peoples`, rest.length === 1 ? 'under your rule' : rest.slice(0, 3).map((q) => cap(P.nameOf(q[0]))).join(', ') + (rest.length > 3 ? ' ...' : ''), restV, pct(restV)) : '');
    const away = abroad(s, P, c.id, mine); const awayAll = away.reduce((a, q) => a + q[1], 0);
    const awayRows = away.slice(0, 6).map(([o, v]) => row(css(P.rgbOf(mine)), s.fullName(s.civs[o]), `${pct(v / Math.max(1e-6, s.popOf[o]))} of their people`, undefined, many(v))).join('');
    const fl = M ? M.of(c.id) : { to: [], from: [] }, m = c.mig || {};
    const came = fl.from.slice(0, 6).map(([o, v]) => { const ov = s.civs[o]; return ov ? row(css(P.rgbOf(P.ruling[o])), s.fullName(ov), cap(P.nameOf(P.ruling[o])), undefined, many(v)) : ''; }).join('');
    const went = fl.to.slice(0, 6).map(([o, v]) => { const ov = s.civs[o]; return ov ? row(css(P.rgbOf(P.ruling[o])), s.fullName(ov), cap(P.nameOf(P.ruling[o])), undefined, many(v)) : ''; }).join('');
    const world = M ? M.flows.slice(0, 6).map(([a, b, v]) => { const A = s.civs[a], B = s.civs[b]; return A && B ? row(css(P.rgbOf(P.ruling[a])), `${s.fullName(A)} to ${s.fullName(B)}`, cap(P.nameOf(P.ruling[a])), undefined, many(v)) : ''; }).join('') : '';
    host.innerHTML = `<div class="gv-row">${fld('Your peoples', 'who lives in ' + esc(realm))}<div class="gv-flist">${rows || '<span class="mk-dim">Nobody yet</span>'}</div></div>
      <div class="gv-row">${fld('Abroad', awayAll > 0 ? many(awayAll) + ' of your rulers\' people live beyond your borders' : 'your rulers\' people beyond your borders')}<div class="gv-flist">${awayRows || '<span class="mk-dim">None live beyond your borders</span>'}</div></div>
      <div class="gv-row">${fld('Who came', 'in the last ten years')}<div class="gv-flist">${came || '<span class="mk-dim">Nobody came from other realms</span>'}</div></div>
      <div class="gv-row">${fld('Who left', 'in the last ten years')}<div class="gv-flist">${went || '<span class="mk-dim">Nobody left for other realms</span>'}</div></div>
      <div class="gv-row">${fld('The world', 'its great migrations of the last ten years')}<div class="gv-flist">${world || '<span class="mk-dim">People stay where they are born</span>'}</div></div>`;
    info.innerHTML = policies(s, c, M, m);
  }
  // the borders and the leaving: what the realm says, what it does, and what it costs now
  function policies(s, c, M, m) {
    const MG = window.MIGRATE; if (!M || !MG) return '<p class="gv-text">People go where their feet take them.</p>';
    const pol = M.policy(c), sh = M.share(c.id), u = M.unrest(c), pop = s.popOf[c.id];
    const opt = (what, list, on) => list.map(([k, name, text], i) => `<button class="gv-tenet${i === on ? ' on' : ''}" data-mig-${what}="${k}"><b>${esc(name)}</b><small>${esc(text)}</small></button>`).join('');
    const last = m && (m.li || m.lo) ? `In the last ten years ${many(m.li || 0)} came to live in your realm and ${many(m.lo || 0)} of your people left it.` : 'In the last ten years hardly anyone came or left.';
    const new0 = Math.round(MG.NEW0 * 100);
    return `<div class="gv-head"><span class="ic">${svg(ROAD)}</span><div><h3>People on the move</h3><div class="micro">${esc(s.fullName(c))} · ${pop >= 1000 ? (pop / 1000).toFixed(1) + ' million' : Math.round(pop) + ' thousand'} people</div></div></div>
      <p class="gv-text">People go from land that cannot feed them to land with room and a better living: to your own far land, over the border, along your roads and by your ships. A famine sends its hungry away, a war its refugees. Where newcomers come to outnumber those who were there, the place is of their people and their faith.</p>
      <div class="gv-state">${last}${sh > 0 ? ` The newcomers are ${pct(sh)} of your people.` : ''}${u < -0.005 ? ` Stability ${Math.round(u * 100)}%.` : ''}</div>
      <div class="gv-sect"><div class="micro">Your borders</div><div class="gv-tenets">${opt('b', MG.BORDERS, pol.b)}</div><div class="gv-state">Newcomers bring hands for the merchants' ventures and what they know; the farmers count them as strangers on the land. More than ${new0} in a hundred of your people in ten years unsettle the realm.</div></div>
      <div class="gv-sect"><div class="micro">Your people leaving</div><div class="gv-tenets">${opt('l', MG.LEAVING, pol.l)}</div><div class="gv-state">Those your land cannot feed go hungry if they may not go, and are restless.</div></div>`;
  }
  function click(e, s, toast) {
    const b = e.target.closest('[data-mig-b]'), l = e.target.closest('[data-mig-l]'); if (!b && !l) return false;
    const r = b ? s.migPolicy('b', b.dataset.migB) : s.migPolicy('l', l.dataset.migL);
    if (r) toast(r); else { const MG = window.MIGRATE; const x = b ? MG.BORDERS[MG.BK[b.dataset.migB]] : MG.LEAVING[MG.LK[l.dataset.migL]]; toast(b ? `Your borders: ${x[1].toLowerCase()}` : `Your people leaving: ${x[1].toLowerCase()}`); }
    return true;
  }
  return { render, click };
})();
