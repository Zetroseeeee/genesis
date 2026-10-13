// Scene for screenshots and checks: the woods (woods.js). A world begun at random is run window.__scene.years forward (default 11,300:
// to AD 1300), a few hundred years at a time so that the page keeps drawing; then the realm at `as` [lon, lat] (or the largest) is made
// the player's (by way of a save: the world as it stands, with that realm in the player's hands), and either the Land tab of the laws
// screen is opened (look: 'tab'), or the globe is seen from alt metres above lon, lat with the lens of the woods on (look: 'lens'), or the
// country itself, the lens off (look: 'ground': the fields where the woods were cleared, the wildwood where nobody farms). Answers in
// window.__woods: the year, the realm, its woods against nature's, the world's.
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ years: 11300, as: null, look: 'tab', lon: 10, lat: 50, alt: 4500000, tilt: 0, heading: 0, clouds: false }, window.__scene || {});
  document.getElementById('btn-random').click(); G.mapcam.fly = null;
  const intro = document.getElementById('intro'); if (intro) intro.hidden = true;
  let done = 0;
  const run = () => { const n = Math.min(400, P.years - done); if (n > 0) { G.run(n); done += n; setTimeout(run, 30); return; } setTimeout(take, 300); };
  const cellAt = (lon, lat) => Math.floor((90 - lat) / 180 * G.sim.H) * G.sim.W + Math.floor((lon + 180) / 360 * G.sim.W);
  const pick = () => {
    const S = G.sim; if (P.as) { const o = S.owner[cellAt(P.as[0], P.as[1])]; if (o >= 0 && S.civs[o]) return o; }
    let best = S.player, bv = -1; for (const c of S.civs) { if (!c || c.capital < 0) continue; const v = S.cellsOf[c.id]; if (v > bv) { bv = v; best = c.id; } }
    return best;
  };
  const take = () => {
    const S = G.sim, id = pick();
    if (id >= 0 && id !== S.player) {
      const s = S.save(); if (s.civs[s.player]) s.civs[s.player].player = false; s.civs[id].player = true; s.player = id;
      const [lon, lat] = P.look === 'tab' ? G.world.siteOf(S.civs[id].capital) : [P.lon, P.lat]; s.cam = { lon, lat, dist: P.alt / 6371000, tilt: P.tilt, heading: P.heading };
      try { G.enter(JSON.parse(JSON.stringify(s))); } catch (e) { window.__woods = { error: String(e) }; return; }
    }
    setTimeout(show, 1500);
  };
  const show = () => {
    const S = G.sim, c = S.playerCiv(), X = S.woods; if (!X) { window.__woods = { error: 'no woods' }; return; }
    const C = X.census(c ? c.id : -1);
    window.__woods = { year: S.fmtYear(S.year), realm: c ? S.fullName(c) : '', mine: C.meNature > 0 ? +(C.meNow / C.meNature).toFixed(3) : null, world: +(C.now / C.nature).toFixed(3) };
    if (P.clouds === false) G.world.cloudsOn = false;
    if (P.look === 'tab') { GOV.open('land'); return; }
    const Mc = G.mapcam; Mc.fly = null; Mc.autoTilt = false; Mc.lon = Mc.tLon = P.lon; Mc.lat = Mc.tLat = P.lat; Mc.dist = Mc.tDist = P.alt / 6371000; Mc.tilt = Mc.tTilt = P.tilt; Mc.heading = Mc.tHeading = P.heading;
    const left = document.getElementById('left'); if (left) left.style.display = 'none';
    if (P.look === 'lens') { const b = document.getElementById('v-wds'); if (b && !b.classList.contains('on')) b.click(); }
  };
  setTimeout(run, 500);
  return 'running';
})();
