// Holocene stories (classic script; exposes window.TALES): the page on which a story comes before the player's court. A
// painting, the story told in the chronicle's voice, and two or three choices, each with what it brings and what it costs
// said before it is taken; then what came of it. It reads the simulation's stories (sim.storyView, story.js) and answers them
// (sim.storyChoose). A story waits for its answer: the turn does not go on until it is given.
window.TALES = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  let ctx = null, shown = '', after = null;
  const S = () => (ctx ? ctx.sim() : null);

  function init(c) {
    ctx = c;
    $('tale').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tl]'); if (b) { if (!b.disabled && !b.getAttribute('aria-disabled')) choose(+b.dataset.tl); return; }
      if (e.target.closest('#tl-done')) { close(); return; }
    });
    $('tale').addEventListener('keydown', (e) => {
      if (!$('tl-out').hidden) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); } return; }
      const n = +e.key; if (n >= 1 && n <= 3) { const b = document.querySelector(`#tl-choices [data-tl="${n - 1}"]`); if (b && !b.getAttribute('aria-disabled')) { e.preventDefault(); choose(n - 1); } }
    });
    $('tl-x').addEventListener('click', close);
    $('tale').addEventListener('close', () => { shown = ''; if (after) { const f = after; after = null; f(); } });
  }
  const isOpen = () => $('tale').open;
  // the story that waits, if there is one
  const waiting = () => { const s = S(); return s && s.storyView ? s.storyView() : null; };
  function open() {
    const v = waiting(); if (!v) return false; render(v);
    const dlg = $('tale'); if (!dlg.open) dlg.showModal();
    const first = document.querySelector('#tl-choices .tl-choice:not([aria-disabled])'); (first || dlg.firstElementChild).focus({ preventScroll: true });
    return true;
  }
  function close() { const d = $('tale'); if (d.open) d.close(); }

  const chipsHtml = (list) => list.map((q) => `<span class="tl-chip ${q.cls || ''}">${esc(q.t)}</span>`).join('');
  function render(v) {
    const s = S(); shown = v.k + ':' + v.year;
    const art = ctx.artOf ? ctx.artOf(v.art) : ''; const fig = $('tl-fig');
    fig.hidden = !art; if (art) { const img = $('tl-img'); if (img.getAttribute('src') !== art) img.src = art; }
    $('tale').querySelector('.tale').classList.toggle('noart', !art);
    $('tl-date').textContent = `${s.fmtYear(v.year)} · ${v.realm}`;
    $('tl-title').textContent = v.title;
    $('tl-text').textContent = v.text;
    $('tl-choices').innerHTML = v.opts.map((o) => `<button class="tl-choice" data-tl="${o.i}"${o.why ? ' aria-disabled="true"' : ''}><span class="tl-n">${o.i + 1}</span><span class="tl-c"><span class="tl-t">${esc(o.t)}</span>${o.hint ? `<span class="tl-h">${esc(o.hint)}</span>` : ''}<span class="tl-chips">${o.why ? `<span class="tl-chip why">${esc(o.why)}</span>` : ''}${chipsHtml(o.chips)}</span></span></button>`).join('');
    $('tl-choices').hidden = false; $('tl-out').hidden = true;
    const L = v.opts[v.lapse]; $('tl-foot').textContent = L ? `Unanswered by ${s.fmtYear(v.until)}, the court decides for you: ${L.t.charAt(0).toLowerCase() + L.t.slice(1)}.` : ''; $('tl-foot').hidden = !L;
  }
  function choose(i) {
    const s = S(); if (!s) return; const v = waiting(); if (!v) { close(); return; }
    const o = v.opts[i]; const r = s.storyChoose(i);
    if (typeof r === 'string') { if (ctx.toast) ctx.toast(r); return; }
    // what came of it: the choice, a chance that fell one way or the other, and what it did
    $('tl-choices').hidden = true; $('tl-foot').hidden = true;
    $('tl-outchoice').textContent = o ? o.t : '';
    $('tl-outtext').textContent = r.text || ''; $('tl-outtext').hidden = !r.text;
    $('tl-outchips').innerHTML = chipsHtml(r.chips || []);
    $('tl-out').hidden = false; $('tl-done').focus({ preventScroll: true });
    if (ctx.afterAct) ctx.afterAct();
  }
  // a story that came while the turn ran: shown when the turn has stopped (then: what to do once it is closed)
  function show(then) { if (open()) { after = then || null; return true; } return false; }
  return { init, open, close, isOpen, show, waiting, get shown() { return shown; } };
})();
