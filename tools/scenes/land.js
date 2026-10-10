// Scene for screenshots and checks: where the world's people live (land.js). A world begun at random is run window.__scene.years
// forward (default 11,000: to AD 1000), a few hundred years at a time, with the player's people set down on the Nile; then either the
// globe from alt metres above lon, lat with the realms painted (look: 'globe'), or the player's capital chosen, its land named in the
// inspector and the realm's land by kind on its panel (look: 'panel'). Answers in window.__land: the year, the people, the share of
// them in the Americas and on monsoon farmland, the five greatest realms.
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ years: 11000, lon: 31.25, lat: 29.9, look: 'globe', alt: 11000000, at: [75, 25] }, window.__scene || {});
  if (!G.sim.playerCiv || !G.sim.playerCiv()) G.start(P.lon, P.lat, 'Kemet');
  G.mapcam.fly = null; const intro = document.getElementById('intro'); if (intro) intro.hidden = true;
  let done = 0;
  const run = () => { const n = Math.min(400, P.years - done); if (n > 0) { G.run(n); done += n; setTimeout(run, 30); return; } setTimeout(show, 300); };
  const show = () => {
    const S = G.sim, W = S.W, c = S.playerCiv();
    let world = 0, am = 0, mon = 0; for (const i of S.LI) { const p = S.pop[i]; world += p; const lon = ((i % W) + 0.5) / W * 360 - 180; if (lon < -30 && lon > -170) am += p; const k = S.landClass(i); if (k === 9 || k === 15) mon += p; }
    const top = S.civs.filter(Boolean).sort((a, b) => S.popOf[b.id] - S.popOf[a.id]).slice(0, 5).map((x) => `${S.fullName(x)} ${(S.popOf[x.id] / 1000).toFixed(1)} m`);
    window.__land = { year: S.fmtYear(S.year), people: Math.round(world / 1000), americas: +(am / world).toFixed(3), monsoon: +(mon / world).toFixed(3), top };
    const M = G.mapcam; M.fly = null; M.autoTilt = false;
    if (P.look === 'panel' && c) { G.select(c.capital); const [lon, lat] = G.world.siteOf(c.capital); M.lon = M.tLon = lon; M.lat = M.tLat = lat; M.dist = M.tDist = 260000 / 6371000; M.tilt = M.tTilt = 0.6; return; }
    const left = document.getElementById('left'); if (left) left.style.display = 'none';
    M.lon = M.tLon = P.at[0]; M.lat = M.tLat = P.at[1]; M.dist = M.tDist = P.alt / 6371000; M.tilt = M.tTilt = 0; M.heading = M.tHeading = 0;
  };
  setTimeout(run, 500);
  return 'running';
})();
