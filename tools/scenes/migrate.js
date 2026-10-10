// Scene for screenshots and checks: people on the move (migrate.js). A world begun at random is run window.__scene.years forward
// (default 11,880: to AD 1880), a few hundred years at a time so that the page keeps drawing; then the realm at `as` [lon, lat] - or,
// with `as` null, the realm that most people came to or left in the last ten years - is made the player's (by way of a save: the
// world as it stands, with that realm in the player's hands), and either the Peoples tab of the laws screen is opened (look: 'tab')
// or the globe is seen from alt metres above lon, lat (null: over the greatest stream) with the lens of peoples on (look: 'globe'),
// its streams the migrations of the last ten years. Answers in window.__mig: the year, the realm, its newcomers and leavers, how
// many streams, the greatest.
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ years: 11880, as: null, look: 'tab', lon: null, lat: null, alt: 9000000, tilt: 0, heading: 0, clouds: false }, window.__scene || {});
  document.getElementById('btn-random').click(); G.mapcam.fly = null;
  const intro = document.getElementById('intro'); if (intro) intro.hidden = true;
  let done = 0;
  const run = () => { const n = Math.min(400, P.years - done); if (n > 0) { G.run(n); done += n; setTimeout(run, 30); return; } setTimeout(take, 300); };
  const cellAt = (lon, lat) => Math.floor((90 - lat) / 180 * G.sim.H) * G.sim.W + Math.floor((lon + 180) / 360 * G.sim.W);
  // the realm to be: the one at `as`, or the one with the most people come and gone in the last ten years (of those with a capital)
  const pick = () => {
    const S = G.sim; if (P.as) { const o = S.owner[cellAt(P.as[0], P.as[1])]; return o >= 0 && S.civs[o] ? o : S.player; }
    let best = S.player, bv = -1; for (const c of S.civs) { if (!c || c.capital < 0 || !c.mig) continue; const v = (c.mig.li || 0) + (c.mig.lo || 0); if (v > bv) { bv = v; best = c.id; } }
    return best;
  };
  // (a save with another realm in the player's hands, loaded as the menu's Load does)
  const take = () => {
    const S = G.sim, id = pick();
    if (id >= 0 && id !== S.player) {
      const s = S.save(); if (s.civs[s.player]) s.civs[s.player].player = false; s.civs[id].player = true; s.player = id;
      const [lon, lat] = G.world.siteOf(S.civs[id].capital); s.cam = { lon, lat, dist: P.alt / 6371000, tilt: P.tilt, heading: P.heading };
      try { localStorage.setItem('genesis-save-v2', JSON.stringify(s)); document.getElementById('m-load').click(); } catch (e) { window.__mig = { error: String(e) }; return; }
    }
    setTimeout(show, 1500);
  };
  const show = () => {
    const S = G.sim, c = S.playerCiv(), M = S.mig, fl = M ? M.flows : [];
    window.__mig = { year: S.fmtYear(S.year), realm: c ? S.fullName(c) : '', came: c && c.mig ? Math.round(c.mig.li || 0) : 0, left: c && c.mig ? Math.round(c.mig.lo || 0) : 0, streams: fl.length,
      top: fl.slice(0, 5).map(([a, b, v]) => `${S.civs[a] ? S.fullName(S.civs[a]) : a} > ${S.civs[b] ? S.fullName(S.civs[b]) : b}: ${Math.round(v)}`) };
    if (P.clouds === false) G.world.cloudsOn = false;
    if (P.look === 'tab') { GOV.open('folk'); return; }
    let lon = P.lon, lat = P.lat;
    if (lon === null && fl.length && S.civs[fl[0][0]] && S.civs[fl[0][1]]) { const a = G.world.siteOf(S.civs[fl[0][0]].capital), b = G.world.siteOf(S.civs[fl[0][1]].capital); lon = (a[0] + b[0]) / 2; lat = (a[1] + b[1]) / 2; }
    if (lon === null && c) [lon, lat] = G.world.siteOf(c.capital);
    const Mc = G.mapcam; Mc.fly = null; Mc.autoTilt = false; Mc.lon = Mc.tLon = lon; Mc.lat = Mc.tLat = lat; Mc.dist = Mc.tDist = P.alt / 6371000; Mc.tilt = Mc.tTilt = P.tilt; Mc.heading = Mc.tHeading = P.heading;
    const left = document.getElementById('left'); if (left) left.style.display = 'none';
    const b = document.getElementById('v-ppl'); if (b && !b.classList.contains('on')) b.click();
  };
  setTimeout(run, 500);
  return 'running';
})();
