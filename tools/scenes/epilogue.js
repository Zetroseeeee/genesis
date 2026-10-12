// Scene for screenshots and checks: the epilogue (epilogue.js). A world begun with the player's people at `player` is run `years`
// forward from 10,000 BC, a few hundred years at a time (the player's realm left to itself, at peace if `calm`); then, if `fall`, its
// last lands are taken from it; then the epilogue is opened (`why`: 'story', 'end', 'fall'; by default as the realm stands). Answers in
// window.__epi: the year, whether the realm lives, how many annals and moments it has.
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ years: 3000, player: [31.25, 29.9], name: 'Kemet', calm: true, fall: false, why: null }, window.__scene || {});
  if (!G.sim.playerCiv || !G.sim.playerCiv()) G.start(P.player[0], P.player[1], P.name);
  G.mapcam.fly = null; const intro = document.getElementById('intro'); if (intro) intro.hidden = true;
  const S0 = G.sim, me = S0.playerCiv(); if (P.calm && me) { me.aggression = 0; if (me.dip) me.dip.think = 1e12; } if (S0.setStories) S0.setStories(false);
  let done = 0;
  const run = () => { const n = Math.min(400, P.years - done); if (n > 0) { G.run(n); done += n; setTimeout(run, 20); return; } setTimeout(show, 300); };
  const show = () => {
    const S = G.sim, c = S.playerCiv();
    if (P.fall && c) { for (const i of S.LI) if (S.owner[i] === c.id) { S.owner[i] = -1; S.level[i] = 0; } S.recount(); G.run(2); }
    const v = S.epilogue ? S.epilogue() : null;
    window.__epi = { year: S.fmtYear(S.year), alive: !!S.playerCiv(), annals: v ? v.annals.length : 0, marks: v ? v.marks.length : 0, name: v ? v.name : '' };
    for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== 'epi') d.close();
    if (window.EPILOGUE) EPILOGUE.open(P.why || (S.playerCiv() ? (S.year >= 2150 ? 'end' : 'story') : 'fall'));
  };
  run();
  return 'ok';
})();
