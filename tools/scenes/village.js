// Scene for screenshots and the packaged-app check: a Stone Age village in Tuscany with a palisade, seen from outside
// its first gate. Evaluated in the page (after tools/testcam.js).
(() => {
  const G = window.__G; if (!G) return 'no game';
  if (!G.sim.playerCiv || !G.sim.playerCiv()) G.start(11.25, 43.77, 'Test');
  const S = G.sim, c = S.playerCiv(), cap = c.capital;
  S.walls[cap] = 1;                                          // a finished palisade
  S.gPrev[cap] = Math.max(0, S.gBand[cap] - 2); S.gYear[cap] = S.year - 4;   // the newest ring of houses still going up
  if (G.world) G.world.lastBuild.t = -1e9;
  const intro = document.getElementById('intro'); if (intro) intro.hidden = true;
  const cam = () => {
    const [lon, lat] = G.world.siteOf(cap); const L = TOWN.layout(S, cap, c, {});
    const g = L.gates[0]; const cl = Math.cos(lat * Math.PI / 180); const mLon = 1 / (6371000 * cl * Math.PI / 180), mLat = 1 / (6371000 * Math.PI / 180);
    const r = L.wallR * (window.__sceneOut || 1.0); const M = G.mapcam; M.fly = null; M.autoTilt = false; const tilt = window.__sceneTilt || 1.2;
    M.lon = M.tLon = lon + Math.cos(g) * r * mLon; M.lat = M.tLat = lat + Math.sin(g) * r * mLat;
    M.dist = M.tDist = (window.__sceneAlt || 900) / 6371000 / Math.cos(tilt); M.tilt = M.tTilt = tilt;
    M.heading = M.tHeading = Math.atan2(-Math.cos(g), -Math.sin(g)) + (window.__sceneTurn || 0);   // looking back at the town through the gate
  };
  window.__sceneCam = cam;
  cam(); setTimeout(cam, 2500); setTimeout(cam, 6000);     // the opening flight to the capital would otherwise take the camera back
  return 'ok';
})();
