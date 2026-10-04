// The home screen as the game shows it at start. With window.__scene = { years, tech, pop, turn } a world is first
// begun, run forward (and pushed to an age: tech 0..1, people in each capital), saved and left for the main menu, so
// that the saved world is on the globe and "Continue" heads the list; turn (degrees) then turns the Earth on.
(() => {
  const P = window.__scene; if (!P) return;
  document.getElementById('btn-random').click(); __G.mapcam.fly = null;
  __G.run(P.years || 300); if (P.tech) __T.world(P.tech, P.pop || 60); __G.run(6);
  document.getElementById('btn-menu').click(); document.getElementById('m-new').click();
  // (the camera flies back up to the home view: put it there at once, then turn the Earth on)
  const M = __G.mapcam, f = M.fly; if (f) { M.fly = null; M.lon = M.tLon = f.lon1; M.lat = M.tLat = f.lat1; M.dist = M.tDist = f.d1; M.tilt = M.tTilt = 0; M.heading = M.tHeading = 0; M.idleSpin = true; }
  if (P.turn) { M.tLon = M.lon = GEO.wrapLon(M.lon + P.turn); }
})();
