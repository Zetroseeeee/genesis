// Scene for screenshots and checks: the player's capital, pushed to a chosen age and size, seen from outside a gate.
// Evaluated in the page after tools/testcam.js. Options in window.__scene (all optional):
//   lon, lat: where to found the realm      tech: 0..1 (0.1 Bronze, 0.2 Iron, 0.33 Classical, 0.45 Medieval ...)
//   pop: thousands of people in the capital  walls: wall level (0 none)   special: works bitmask (1 port, 2 academy, 4 temple, 8 market, 16 wonder, 512 mine)
//   grow: newest ring of houses still going up   settled: the age has been here long enough for every house to be rebuilt
//   alt (m), tilt (rad), out (fraction of the wall radius the camera looks at; 0 = the square), turn (rad), gate (index)
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ lon: 11.25, lat: 43.77, tech: 0, pop: 1, walls: 1, special: 0, grow: true, settled: true, alt: 900, tilt: 1.2, out: 1, turn: 0, gate: 0 }, window.__scene || {});
  if (!G.sim.playerCiv || !G.sim.playerCiv()) G.start(P.lon, P.lat, 'Test');
  const S = G.sim, c = S.playerCiv(), cap = c.capital;
  c.tech = P.tech; S.pop[cap] = P.pop; S.walls[cap] = P.walls; if (P.special) S.special[cap] |= P.special;
  G.run(3);
  if (P.settled) c.eraSince = S.year - 200;
  if (P.grow) { S.gPrev[cap] = Math.max(0, S.gBand[cap] - 2); S.gYear[cap] = S.year - 4; }
  if (G.world) { G.world.refreshTextures(); G.world.lastBuild.t = -1e9; }
  const cam = () => {
    const Q = Object.assign(P, window.__scene || {});
    const [lon, lat] = G.world.siteOf(cap); const L = TOWN.layout(S, cap, c, {});
    const g = L.gates[Q.gate % L.gates.length]; const cl = Math.cos(lat * Math.PI / 180); const mLon = 1 / (6371000 * cl * Math.PI / 180), mLat = 1 / (6371000 * Math.PI / 180);
    const r = (L.wallR || L.R * 1.06) * Q.out; const M = G.mapcam; M.fly = null; M.autoTilt = false;
    M.lon = M.tLon = lon + Math.cos(g) * r * mLon; M.lat = M.tLat = lat + Math.sin(g) * r * mLat;
    M.dist = M.tDist = Q.alt / 6371000 / Math.cos(Q.tilt); M.tilt = M.tTilt = Q.tilt;
    M.heading = M.tHeading = Math.atan2(-Math.cos(g), -Math.sin(g)) + Q.turn;   // looking back at the town through the gate
    return { era: c.era, culture: L.culture, R: Math.round(L.R), k: +L.k.toFixed(2), items: L.items.length };
  };
  window.__sceneCam = cam;
  setTimeout(cam, 2500); setTimeout(cam, 6000);     // the opening flight to the capital would otherwise take the camera back
  return cam();
})();
