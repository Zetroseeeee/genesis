// Scene for screenshots: the woods of a climate, seen from just above the canopy. Evaluated in the page after
// tools/testcam.js. window.__forest(lon, lat, alt m, tilt rad, heading rad, season 0..1 or undefined) moves there.
(() => {
  const G = window.__G; if (!G) return 'no game';
  if (!G.sim.playerCiv || !G.sim.playerCiv()) G.start(11.25, 43.77, 'Test');
  const intro = document.getElementById('intro'); if (intro) intro.hidden = true; const left = document.getElementById('left'); if (left) left.style.display = 'none';
  window.__forest = (lon, lat, alt, tilt, heading, season) => {
    const M = G.mapcam; M.fly = null; M.autoTilt = false; tilt = tilt === undefined ? 1.25 : tilt;
    M.lon = M.tLon = lon; M.lat = M.tLat = lat; M.tilt = M.tTilt = tilt; M.dist = M.tDist = (alt || 500) / 6371000 / Math.cos(tilt); M.heading = M.tHeading = heading || 0;
    if (season !== undefined) G.setSeason(season);
    { const f = GEO.enu(lon, lat); const el = 0.85, az = lat >= 0 ? 3.9 : 5.5; window.__sunLock = true;      // an afternoon sun, from the side the sun is on in that hemisphere
      G.globals.uSun.value.copy(f.up).multiplyScalar(Math.sin(el)).addScaledVector(f.east, Math.sin(az) * Math.cos(el)).addScaledVector(f.north, Math.cos(az) * Math.cos(el)).normalize(); }
    return { lon, lat, season: G.season };
  };
  return 'ok';
})();
