// Holocene epilogue (classic script; exposes window.EPILOGUE): the story of the player's people, told when it ends - when the realm
// falls, or when the Holocene itself ends in AD 2150 - and whenever the player asks for it (the Chronicle: "Your story"). The
// painting of the age it reached; how it began and how it ended, in the chronicle's voice; its life as a chart of its people and its
// land over the ages, each age the same width (the first ages are long and little happens in them); the moments of its story (the ages
// it entered, golden ages, wonders, masterpieces, great people, faiths, the wars that changed it, its fall); what it is remembered
// for and where that stands among every realm that ever lived; the world's firsts that were its own. It reads sim.epilogue() (sim.js:
// the realm's annals and marks, kept from 0.46 on: an older world's story begins where it was saved).
window.EPILOGUE = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  // the world's dates of the ages (sim.js's HIST): the chart gives each age the same width
  const AGE_AT = [-10000, -3300, -1200, -500, 500, 1400, 1760, 1900, 1970, 2030, 2150];
  const AGES = ['Stone Age', 'Bronze Age', 'Iron Age', 'Classical Age', 'Middle Ages', 'Renaissance', 'Industrial Age', 'Modern Age', 'Information Age', 'Space Age'];
  // each age's metal (the interface's: index.html, body[data-age])
  const METAL = ['#b08a5c', '#c58a4a', '#8f9aa6', '#d8b45c', '#c9a14f', '#cfa65a', '#b87a4b', '#b89b5e', '#9fc4d8', '#a8d6e8'];
  let ctx = null, mode = 'story';
  const S = () => (ctx ? ctx.sim() : null);

  function init(c) {
    ctx = c;
    $('epi').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ep]'); if (!b) return; const k = b.dataset.ep;
      if (k === 'close' || k === 'on') { close(); return; }
      if (k === 'new') { close(); if (ctx.onNew) ctx.onNew(); return; }
      if (k === 'menu') { close(); if (ctx.onMenu) ctx.onMenu(); }
      if (k === 'atlas') { close(); if (ctx.onAtlas) ctx.onAtlas(); }
    });
    $('epi').addEventListener('close', () => { if (ctx.onClose) ctx.onClose(mode); });
    let rt = 0; window.addEventListener('resize', () => { if (!isOpen()) return; clearTimeout(rt); rt = setTimeout(() => drawChart(S() && S().epilogue()), 120); });
  }
  const isOpen = () => $('epi').open;
  function close() { const d = $('epi'); if (d.open) d.close(); }
  // why: 'fall' (the realm is no more), 'end' (the Holocene ends), 'story' (asked for: the story so far)
  function open(why) {
    const s = S(); const v = s && s.epilogue ? s.epilogue() : null; if (!v) return false; mode = why || (v.alive ? 'story' : 'fall');
    render(v); const dlg = $('epi'); if (!dlg.open) dlg.showModal(); dlg.querySelector('.ep-page').scrollTop = 0;
    requestAnimationFrame(() => drawChart(v)); const first = dlg.querySelector('.ep-actions .btn'); if (first) first.focus({ preventScroll: true });
    return true;
  }

  // ---------- reading the story ----------
  const fmtPop = (k) => { const n = k * 1000; return n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + ' billion' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' million' : n >= 1e4 ? Math.round(n / 1000) + ' thousand' : Math.round(n / 100) * 100 + ''; };
  const fmtInt = (n) => Math.round(n).toLocaleString('en-GB');
  const span = (y0, y1) => { const n = y1 - y0; return n >= 1000 ? fmtInt(Math.round(n / 10) * 10) + ' years' : n + ' years'; };
  // what a moment of the story is, or nothing if it is not one to tell
  function kindOf(m) {
    const t = m[1], x = m[2];
    if (t === 'era') return /golden age/i.test(x) ? 'golden' : /enters the/i.test(x) ? 'age' : null;
    if (t === 'culture') return /golden age begins/i.test(x) ? 'golden' : /masterpiece/i.test(x) ? 'master' : /is born in/i.test(x) ? 'great' : null;
    if (t === 'state') return /completes a wonder/i.test(x) ? 'wonder' : /is no more/i.test(x) ? 'fall' : /breaks? away|independence/i.test(x) ? 'split' : /put down roots|is founded|founds? a (new )?(realm|state|people)/i.test(x) ? 'found' : null;
    if (t === 'ruler') return /takes the throne|comes to the throne|is chosen|is elected|seizes|is crowned|rules now|proclaim/i.test(x) ? 'reign' : null;
    if (t === 'faith') return /prophet|founds|founded|takes up|adopts|teaching|breaks with/i.test(x) ? 'faith' : null;
    if (t === 'war') return /declares? war|wins its war|make peace|falls to|takes .* from|surrender|submits/i.test(x) ? 'war' : null;
    return null;
  }
  const AGE_RE = [/Stone/, /Bronze/, /Iron/, /Classical/, /Medieval|Middle Ages/, /Renaissance/, /Industrial/, /Modern/, /Information/, /Space/];
  const cap1 = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const ICON = { age: 'era', golden: 'era', wonder: 'state', master: 'culture', great: 'culture', faith: 'faith', war: 'war', split: 'state', fall: 'disaster', found: 'city', reign: 'ruler' };      // (the chronicle's own icons: main.js's FEED_ICON)
  function moments(v) {
    const all = []; for (const m of v.marks) { const k = kindOf(m); if (k) all.push({ y: m[0], k, x: m[2] }); }
    // the wars: those that changed the realm most are many; keep twelve, spread over its life
    const wars = all.filter((m) => m.k === 'war'), keepW = new Set(); const nW = Math.min(12, wars.length);
    for (let i = 0; i < nW; i++) keepW.add(wars[Math.round(i * (wars.length - 1) / Math.max(1, nW - 1))]);
    // masterpieces and great people likewise, and the rulers who came to the throne: the story names a few of them, the figures count them all
    const some = (list, n) => { const keep = new Set(), k = Math.min(n, list.length); for (let i = 0; i < k; i++) keep.add(list[Math.round(i * (list.length - 1) / Math.max(1, k - 1))]); return keep; };
    const keepA = some(all.filter((m) => m.k === 'master' || m.k === 'great'), 14), keepR = some(all.filter((m) => m.k === 'reign'), 8);
    return all.filter((m) => (m.k !== 'war' || keepW.has(m)) && ((m.k !== 'master' && m.k !== 'great') || keepA.has(m)) && (m.k !== 'reign' || keepR.has(m)));
  }
  function figures(v) {
    const A = v.annals; let peak = null, wide = null;
    for (const a of A) { if (!peak || a[1] > peak[1]) peak = a; if (!wide || a[2] > wide[2]) wide = a; }
    const cnt = (k) => v.marks.filter((m) => kindOf(m) === k).length;
    const rulers = v.marks.filter((m) => kindOf(m) === 'reign').length;
    const best = v.pts.indexOf(Math.max(...v.pts));
    return { peak, wide, golden: cnt('golden'), wonders: cnt('wonder'), masters: cnt('master'), greats: cnt('great'), wars: cnt('war'), rulers, best, ages: Math.max(v.era, ...A.map((a) => a[3]), 0) + 1 };
  }
  function opening(v, f) {
    const s = S(), LG = window.LEGACY, P = LG ? LG.PATHS : null; const fy = (y) => s.fmtYear(y);
    const age = AGES[Math.min(9, v.era)], peak = f.peak, wide = f.wide, end = v.alive ? v.year : (v.fell ? v.fell[0] : v.year);
    const remembered = v.total > 0 && P ? ` It is remembered above all for ${P[f.best].heir}: ${ordinal(v.place)} of the ${fmtInt(v.of)} realms that ever lived.` : '';
    const atPeak = peak && (v.alive ? v.pop >= peak[1] * 0.97 : end - peak[0] <= Math.max(20, (end - v.founded) * 0.03));      // (at its height now, or nearly)
    const height = peak && peak[1] > 0 && !(v.alive && atPeak) ? ` At its height, in ${fy(peak[0])}, its people numbered ${fmtPop(peak[1])}${wide && wide[2] > 1 ? `; the realm was widest in ${fy(wide[0])}, with ${fmtInt(wide[2])} regions` : ''}.` : '';
    if (!v.alive) { const [y, why] = v.fell || [v.year, '']; return `The realm rose in ${fy(v.founded)} and fell in ${fy(y)}${why ? ' (' + why + ')' : ''}, after ${span(v.founded, y)}, in the ${age}.${height}${remembered}`; }
    const now = ` In ${fy(v.year)} its people number ${fmtPop(v.pop)}${atPeak ? ', more than ever' : ''}, in ${fmtInt(v.cells)} regions, in the ${age}.`;
    if (mode === 'end') { const H = s.history, h = H && H.length ? H[H.length - 1] : null; const world = h ? ` The world it leaves holds ${fmtPop(h.pop + h.wild)} people, in ${fmtInt(s.st.civCount)} realms.` : '';
      return `The Holocene ends. Founded in ${fy(v.founded)}, the realm has lasted ${span(v.founded, v.year)}.${now}${height}${remembered}${world}`; }
    return `Founded in ${fy(v.founded)}, ${span(v.founded, v.year)} ago.${now}${height}${remembered}`;
  }
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

  // ---------- the page ----------
  function render(v) {
    const s = S(), f = figures(v), LG = window.LEGACY, P = LG ? LG.PATHS : [];
    const end = v.alive ? v.year : (v.fell ? v.fell[0] : v.year);
    $('ep-date').textContent = `${s.fmtYear(v.founded)} – ${v.alive && mode !== 'end' ? 'now' : s.fmtYear(end)} · ${span(v.founded, end)}`;
    $('ep-title').textContent = cap1(v.name);
    { const who = ctx.face ? ctx.face($('ep-face'), v.civ) : false; $('ep-seal').hidden = !who; $('ep-who').textContent = who ? (v.alive ? who : 'Its last ruler, ' + who) : ''; }
    $('ep-kicker').textContent = mode === 'fall' ? 'The end of a people' : mode === 'end' ? 'The end of the Holocene' : 'The story so far';
    $('ep-text').textContent = opening(v, f);
    const art = ctx.artOf ? ctx.artOf('era' + Math.min(9, v.era)) : ''; const fig = $('ep-fig'); fig.hidden = !art; $('epi').querySelector('.epilogue').classList.toggle('noart', !art); $('epi').querySelector('.epilogue').classList.toggle('fell', !v.alive);
    if (art) { const img = $('ep-img'); if (img.getAttribute('src') !== art) img.src = art; }
    // the figures
    const tiles = [
      ['At its height', f.peak && f.peak[1] > 0 ? fmtPop(f.peak[1]) : '—', f.peak ? s.fmtYear(f.peak[0]) : ''],
      ['Its widest', f.wide && f.wide[2] > 0 ? fmtInt(f.wide[2]) + ' regions' : '—', f.wide ? s.fmtYear(f.wide[0]) : ''],
      ['Ages', `${f.ages} of 10`, AGES[Math.min(9, f.ages - 1)]],
      ['Golden ages', f.golden ? String(f.golden) : 'none', f.wonders ? `${f.wonders} wonder${f.wonders > 1 ? 's' : ''}` : 'no wonder'],
      ['Great people', String(f.greats + f.masters), f.masters ? `${f.masters} masterpiece${f.masters > 1 ? 's' : ''}` : 'and no masterpiece'],
      ['Remembered', fmtInt(v.total), v.total ? `${ordinal(v.place)} of ${fmtInt(v.of)}` : 'not yet'],
    ];
    $('ep-tiles').innerHTML = tiles.map(([k, a, b]) => `<div class="ep-tile"><span class="ep-k">${esc(k)}</span><span class="ep-v">${esc(a)}</span><span class="ep-s">${esc(b)}</span></div>`).join('');
    // the story, age by age
    const ms = moments(v); let html = '', lastAge = -1; const ageAt = (y) => { if (!v.annals.length) return v.era; let e = v.annals[0][3]; for (const a of v.annals) { if (a[0] > y) break; e = a[3]; } return e; };
    if (!ms.length) html = `<p class="ep-none">${v.annals.length > 2 ? 'Little that the chronicle keeps: a quiet people.' : 'Its story is kept from this version of the game on: what came before was not written down.'}</p>`;
    for (const m of ms) {
      const e = m.k === 'age' ? Math.max(0, AGE_RE.findIndex((r) => r.test(m.x))) : ageAt(m.y);
      if (e !== lastAge) { html += `<h4 class="ep-age" style="--m:${METAL[e]}"><span>${esc(AGES[e])}</span>${m.k === 'age' ? `<span class="ep-y">${esc(s.fmtYear(m.y))}</span>` : ''}</h4>`; lastAge = e; }
      if (m.k === 'age') continue;
      html += `<div class="ep-m ep-${m.k}"><span class="ep-y">${esc(s.fmtYear(m.y))}</span><svg class="ep-i" viewBox="0 0 24 24" aria-hidden="true">${(ctx.icons && ctx.icons[ICON[m.k]]) || ''}</svg><span class="ep-x">${esc(cap1(m.x))}</span></div>`;
    }
    $('ep-story').innerHTML = html;
    // what it is remembered for
    const most = Math.max(1, ...v.pts);
    $('ep-paths').innerHTML = P.map((p, i) => `<div class="ep-path${i === f.best && v.pts[i] > 0 ? ' best' : ''}"><span>${esc(p.name)}</span><i style="--w:${(v.pts[i] / most * 100).toFixed(1)}%"></i><b>${fmtInt(v.pts[i])}</b></div>`).join('');
    // the world's firsts that were its own
    const L = s.legacy, fs = []; if (L && LG) { const F = L.save().f, endY = v.alive ? Infinity : end; F.forEach((q, k) => { if (q && q[1] === v.id && q[0] >= v.founded && q[0] <= endY && LG.FIRSTS[k]) fs.push([q[0], LG.FIRSTS[k].name]); }); }
    fs.sort((a, b) => a[0] - b[0]);
    $('ep-firsts').innerHTML = fs.length ? fs.map(([y, n]) => `<div class="ep-first"><span class="ep-y">${esc(s.fmtYear(y))}</span><span>${esc(n)}</span></div>`).join('') : '<div class="ep-none">None: others were first.</div>';
    $('ep-rulers').textContent = f.rulers ? `${f.rulers} ruler${f.rulers > 1 ? 's' : ''} came to the throne in the years the chronicle keeps` : '';
    // what may be done now
    const acts = (mode === 'end' ? [['on', 'Play on', 'primary'], ['new', 'A new world', ''], ['menu', 'The main menu', '']]
      : mode === 'fall' ? [['new', 'A new world', 'primary'], ['close', 'Watch the world go on', ''], ['menu', 'The main menu', '']]
      : [['close', 'Close', 'primary']]).concat(s.replay && s.replay.frames.length > 1 ? [['atlas', 'The world through the ages', '']] : []);
    $('ep-actions').innerHTML = acts.map(([k, t, c]) => `<button class="btn ${c}" data-ep="${k}">${esc(t)}</button>`).join('');
  }

  // the realm's people and land over the ages: each age the same width, the people (log) as an area in the realm's colour, its land
  // as a line, the age it was in as a strip under them in the age's metal, golden ages and wonders marked above
  function drawChart(v) {
    const cv = $('ep-chart'); if (!cv || !v) return; const r = cv.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
    const A = v.annals; const W = r.width, H = r.height, L = 46, R = 46, T = 14, B = 34, w = W - L - R, h = H - T - B;
    const end = v.alive ? v.year : (v.fell ? v.fell[0] : v.year), e0 = ageOfYear(v.founded), e1 = Math.min(10, Math.ceil(ageX(end)));
    const X = (y) => L + (ageX(y) - e0) / Math.max(0.5, e1 - e0) * w;
    // the ages along the bottom
    g.font = '11px Noto Sans, sans-serif'; g.textBaseline = 'middle';
    for (let e = e0; e < e1; e++) { const x0 = L + (e - e0) / (e1 - e0) * w, x1 = L + (e + 1 - e0) / (e1 - e0) * w;
      g.fillStyle = 'rgba(255,255,255,0.025)'; if ((e - e0) % 2) g.fillRect(x0, T, x1 - x0, h);
      g.fillStyle = 'rgba(236,233,226,0.5)'; const nm = AGES[e]; const tw = g.measureText(nm).width; if (tw < x1 - x0 - 4) g.fillText(nm, (x0 + x1) / 2 - tw / 2, H - 9); }
    if (A.length < 2) { g.fillStyle = 'rgba(236,233,226,0.55)'; g.fillText('The chronicle has just begun to keep this realm’s numbers.', L + 8, T + h / 2); return; }
    // the strip of the realm's own ages
    for (let k = 0; k + 1 < A.length; k++) { g.fillStyle = METAL[Math.min(9, A[k][3])]; g.fillRect(X(A[k][0]), T + h + 4, Math.max(1, X(A[k + 1][0]) - X(A[k][0]) + 0.5), 6); }
    // people, on a log scale
    const maxP = Math.max(1, ...A.map((a) => a[1])), lo = Math.log10(Math.max(0.1, Math.min(...A.map((a) => a[1] || maxP)) * 0.5)), hi = Math.log10(maxP * 1.15);
    const Y = (p) => T + h - (Math.log10(Math.max(p, 0.1)) - lo) / Math.max(0.3, hi - lo) * h;
    for (let d = Math.ceil(lo); d <= Math.floor(hi); d++) { const y = Y(Math.pow(10, d)); g.strokeStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.moveTo(L, y); g.lineTo(L + w, y); g.stroke(); g.fillStyle = 'rgba(236,233,226,0.45)'; const t = fmtPop(Math.pow(10, d)).replace(' thousand', 'k').replace(' million', 'm').replace(' billion', 'bn'); g.fillText(t, L - 6 - g.measureText(t).width, y); }
    const col = v.color || '#c9a14f';
    g.beginPath(); g.moveTo(X(A[0][0]), T + h); for (const a of A) g.lineTo(X(a[0]), Y(a[1])); g.lineTo(X(A[A.length - 1][0]), T + h); g.closePath();
    const grd = g.createLinearGradient(0, T, 0, T + h); grd.addColorStop(0, hexA(col, 0.5)); grd.addColorStop(1, hexA(col, 0.06)); g.fillStyle = grd; g.fill();
    g.beginPath(); A.forEach((a, k) => k ? g.lineTo(X(a[0]), Y(a[1])) : g.moveTo(X(a[0]), Y(a[1]))); g.strokeStyle = hexA(col, 0.95); g.lineWidth = 1.8; g.stroke();
    // land, on its own scale (right)
    const maxC = Math.max(1, ...A.map((a) => a[2])), YC = (c) => T + h - c / maxC * h * 0.92;
    g.beginPath(); A.forEach((a, k) => k ? g.lineTo(X(a[0]), YC(a[2])) : g.moveTo(X(a[0]), YC(a[2]))); g.strokeStyle = 'rgba(236,233,226,0.55)'; g.setLineDash([3, 3]); g.lineWidth = 1.2; g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(236,233,226,0.45)'; g.fillText(fmtInt(maxC), L + w + 6, YC(maxC)); g.fillText('regions', L + w + 6, YC(maxC) + 13);
    // golden ages and wonders
    for (const m of v.marks) { const k = kindOf(m); if (k !== 'golden' && k !== 'wonder') continue; const x = X(m[0]); g.fillStyle = k === 'golden' ? '#F2C14E' : '#EDE3C7'; g.font = '12px Noto Sans, sans-serif'; g.fillText(k === 'golden' ? '✦' : '▲', x - 4, T + 6); }
  }
  function ageX(y) { for (let k = 0; k + 1 < AGE_AT.length; k++) if (y < AGE_AT[k + 1]) return k + Math.max(0, (y - AGE_AT[k]) / (AGE_AT[k + 1] - AGE_AT[k])); return 10 + (y - 2150) / 120; }
  const ageOfYear = (y) => Math.max(0, Math.min(9, Math.floor(ageX(y))));
  function hexA(c, a) { const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim()); if (!m) return `rgba(201,161,79,${a})`; const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

  return { init, open, close, isOpen, kindOf };
})();
