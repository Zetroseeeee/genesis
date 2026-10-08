// Scene for screenshots and checks: the lens of peoples. A world begun at random is run window.__scene.years forward
// (default 8,000: to 2000 BC), a few hundred years at a time so that the page keeps drawing, and its peoples are painted
// on the map (the lens, I); the camera looks down from window.__scene.alt kilometres over lon, lat. Options: years, lon,
// lat, alt, tilt, heading, clouds (false: none, so that the map can be read).
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ years: 8000, lon: 35, lat: 38, alt: 7000, tilt: 0, heading: 0, clouds: false }, window.__scene || {});
  document.getElementById('btn-random').click(); G.mapcam.fly = null;
  const put = () => { const M = G.mapcam; M.fly = null; M.autoTilt = false; M.lon = M.tLon = P.lon; M.lat = M.tLat = P.lat; M.dist = M.tDist = P.alt * 1000 / 6371000 / Math.cos(P.tilt); M.tilt = M.tTilt = P.tilt; M.heading = M.tHeading = P.heading; };
  let done = 0;
  const run = () => {
    const n = Math.min(400, P.years - done); if (n > 0) { G.run(n); done += n; put(); setTimeout(run, 30); return; }
    if (P.clouds === false) G.world.cloudsOn = false;
    if (!document.getElementById('v-ppl').classList.contains('on')) document.getElementById('v-ppl').click();
    put(); setTimeout(put, 3000);
    window.__peoplesDone = { year: G.sim.year, peoples: G.sim.people.list.filter((p) => p && p.n > 0).length };
  };
  put(); setTimeout(run, 500);
  return 'running';
})();
