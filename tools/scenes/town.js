// Scene for screenshots and checks: the player's capital, pushed to a chosen age and size, seen from outside a gate.
// Evaluated in the page after tools/testcam.js. Options in window.__scene (all optional):
//   lon, lat: where to found the realm      tech: 0..1 (0.1 Bronze, 0.2 Iron, 0.33 Classical, 0.45 Medieval ...)
//   pop: thousands of people in the capital  walls: wall level (0 none)   special: works bitmask (1 port, 2 academy, 4 temple, 8 market, 16 wonder, 512 mine)
//   ind: the town's workshops, one plot (1..) for each of sim.IND in order (workshop, weaver, smithy, brewery, granary, warehouse, shipyard, factory, refinery, lab); 0 = none
//   grow: newest ring of houses still going up   settled: the age has been here long enough for every house to be rebuilt
//   alt (m), tilt (rad), out (fraction of the wall radius the camera looks at; 0 = the square), turn (rad), gate (index)
//   sun: [height, bearing] in radians (default an afternoon sun from the west, so shadows show from most angles), null = let the day run
//   season: 0..1 through the year (0 midwinter in the north, 0.5 midsummer, 0.82 the height of autumn); unset = let the year run
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ lon: 11.25, lat: 43.77, tech: 0, pop: 1, walls: 1, special: 0, grow: true, settled: true, alt: 900, tilt: 1.2, out: 1, turn: 0, gate: 0, sun: [0.75, 4.6] }, window.__scene || {});
  // the day runs round in nine minutes: hold the sun where the scene wants it (sun: [height, bearing] in radians, bearing
  // from north through east; null lets the clock run)
  window.__sceneSun = (el, az) => { const f = GEO.enu(P.lon, P.lat); window.__sunLock = true; G.globals.uSun.value.copy(f.up).multiplyScalar(Math.sin(el)).addScaledVector(f.east, Math.sin(az) * Math.cos(el)).addScaledVector(f.north, Math.cos(az) * Math.cos(el)).normalize(); return [el, az]; };
  if (P.sun) window.__sceneSun(P.sun[0], P.sun[1]);
  if (P.season !== undefined) { window.__seasonLock = true; G.setSeason(P.season); }
  if (!G.sim.playerCiv || !G.sim.playerCiv()) G.start(P.lon, P.lat, 'Test');
  const S = G.sim, c = S.playerCiv(), cap = c.capital;
  c.tech = P.tech; c.era = S.eraOf(c.tech); if (window.__T && __T.teach) __T.teach(c); S.pop[cap] = P.pop; S.walls[cap] = P.walls; if (P.special) S.special[cap] |= P.special;
  if (P.ind) S.ind.set(cap, Uint8Array.from(P.ind));
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
  // look at the whole town ('town') or at one building of it (by role or kind: 'palace', 'market', 'temple', 'landmark',
  // 'gatehouse' ...): k = camera distance in town radii (town) or in building sizes (a building)
  window.__sceneLook = (what, k, tilt, turn) => {
    const [lon, lat] = G.world.siteOf(cap); const L = TOWN.layout(S, cap, c, {});
    const cl = Math.cos(lat * Math.PI / 180); const mLon = 1 / (6371000 * cl * Math.PI / 180), mLat = 1 / (6371000 * Math.PI / 180);
    let x = 0, z = 0, it = null, d = L.R * (k || 2.6);
    if (what !== 'town') { it = L.items.find((q) => q.tag === what || q.as === what || q.kind === what); if (!it) return { missing: what }; x = it.x; z = it.z; d = Math.max(it.w, it.d, it.h * 1.5) * (k || 5); }
    const M = G.mapcam; M.fly = null; M.autoTilt = false; M.lon = M.tLon = lon + x * mLon; M.lat = M.tLat = lat + z * mLat;
    M.tilt = M.tTilt = tilt === undefined ? 1.0 : tilt; M.dist = M.tDist = d / 6371000; M.heading = M.tHeading = turn || 0;
    return it ? { what, kind: it.kind, as: it.as, w: Math.round(it.w), h: Math.round(it.h), d: Math.round(it.d) } : { what, R: Math.round(L.R), k: +L.k.toFixed(1), items: L.items.length };
  };
  const intro = document.getElementById('intro'); if (intro) intro.hidden = true;
  const left = document.getElementById('left'); if (left && P.clean !== false) left.style.display = 'none';      // the city panel hides a third of the picture
  setTimeout(cam, 2500); setTimeout(cam, 6000);     // the opening flight to the capital would otherwise take the camera back
  return cam();
})();
