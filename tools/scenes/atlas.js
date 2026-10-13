// Scene for screenshots and checks: the atlas of history (atlas.js). A world begun with the player's people at `player` is run `years`
// forward from 10,000 BC, a few hundred years at a time; then the atlas is opened at map `at` (a number, or 'end'), still. Answers in
// window.__atlas: the year, how many maps and lives the world has kept, and their bytes.
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ years: 6000, player: [31.25, 29.9], name: 'Kemet', at: 'end' }, window.__scene || {});
  if (!G.sim.playerCiv || !G.sim.playerCiv()) G.start(P.player[0], P.player[1], P.name);
  G.mapcam.fly = null; const intro = document.getElementById('intro'); if (intro) intro.hidden = true;
  const S0 = G.sim; if (S0.setStories) S0.setStories(false);
  let done = 0;
  const run = () => { const n = Math.min(400, P.years - done); if (n > 0) { G.run(n); done += n; setTimeout(run, 20); return; } setTimeout(show, 300); };
  const show = () => {
    const S = G.sim, st = S.replay ? S.replay.stats() : {};
    window.__atlas = { year: S.fmtYear(S.year), frames: st.frames, lives: st.lives, bytes: st.bytes };
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    if (window.ATLAS) ATLAS.open({ at: P.at });
  };
  run();
  return 'ok';
})();
