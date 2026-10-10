// Scene for screenshots and checks: the weather of the Holocene (climate.js). A world begun at random is run window.__scene.years
// forward from 10,000 BC (default none), a few hundred years at a time, with the player's people set down at `player`; then, if asked,
// a drought is laid over [lon, lat, km, depth] for three years; then the globe from alt metres above lon, lat (tilt, heading), the
// lens of the harvest on if `lens`. Answers in window.__holo: the year, the age's climate, how many regions lie under the ice, how
// green the dry lands are, the droughts under way, the harvest at lon, lat.
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ years: 0, lon: -88, lat: 57, alt: 4500000, tilt: 0, heading: 0, drought: null, lens: false, player: [31.25, 29.9] }, window.__scene || {});
  if (!G.sim.playerCiv || !G.sim.playerCiv()) G.start(P.player[0], P.player[1], 'Kemet');
  G.mapcam.fly = null; const intro = document.getElementById('intro'); if (intro) intro.hidden = true;
  let done = 0;
  const run = () => { const n = Math.min(400, P.years - done); if (n > 0) { G.run(n); done += n; setTimeout(run, 30); return; } setTimeout(show, 300); };
  const cellAt = (lon, lat) => Math.floor((90 - lat) / 180 * G.sim.H) * G.sim.W + Math.floor((lon + 180) / 360 * G.sim.W);
  const show = () => {
    const S = G.sim, CL = S.climate;
    if (P.drought && CL) { const sv = CL.save(), [lon, lat, km, d] = P.drought; sv.sp.push([sv.nid + 1, 0, cellAt(lon, lat), km, -d, S.year, S.year + 3]); sv.nid += 2; CL.load(sv); }
    let ice = 0, wet = 0; if (CL) for (const i of S.LI) { ice += CL.ice[i]; wet += CL.wet[i]; }
    const here = CL ? CL.here(cellAt(P.lon, P.lat)) : null;
    window.__holo = { year: S.fmtYear(S.year), epoch: CL ? CL.epoch().name : '', ice, wet: Math.round(wet), droughts: CL ? CL.spells.filter((x) => x.kind === 'drought').length : 0, hv: here ? +here.hv.toFixed(3) : 1, event: here && here.event ? here.event.name : '' };
    const M = G.mapcam; M.fly = null; M.autoTilt = false; M.lon = M.tLon = P.lon; M.lat = M.tLat = P.lat; M.dist = M.tDist = P.alt / 6371000; M.tilt = M.tTilt = P.tilt; M.heading = M.tHeading = P.heading;
    const left = document.getElementById('left'); if (left) left.style.display = 'none';
    if (P.lens && !document.getElementById('v-hrv').classList.contains('on')) document.getElementById('v-hrv').click();
  };
  setTimeout(run, 500);
  return 'running';
})();
