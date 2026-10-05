if (window.__G && __G.settings) __G.settings.qualityPinned = true; // software GL would otherwise drop to balanced and hide movers
// helpers evaluated inside the page for screenshot tests
window.__T = {
  cam(lon, lat, dist, tilt, heading) { const M = __G.mapcam; M.fly = null; M.lon = M.tLon = lon; M.lat = M.tLat = lat; M.dist = M.tDist = dist; M.tilt = M.tTilt = tilt; M.heading = M.tHeading = heading; M.autoTilt = false; },
  // a realm's knowledge set by hand needs the discoveries that go with it: everything up to its age (or the one given)
  teach(c, upto) { const S = __G.sim; const e = upto === undefined ? S.eraOf(c.tech) : upto; for (const D of KNOW.LIST) if (D.era <= e) S.know.learn(c.id, c, D.id, true); S.know.lastT[c.id] = c.tech; S.know.pool[c.id] = 0; },
  era(tech, pop, walls, special) { const S = __G.sim; const c = S.playerCiv(); const cap = c.capital; c.tech = tech; c.era = S.eraOf(tech); __T.teach(c); if (pop !== undefined) S.pop[cap] = pop; if (walls !== undefined) S.walls[cap] = walls; if (special !== undefined) S.special[cap] = special; __G.run(3); return cap; },
  capital() { const S = __G.sim; const c = S.playerCiv(); return __G.world.siteOf(c.capital); },
};
// camera above a street of the capital: k-th street, 'back' metres behind its midpoint along the street, alt metres up
window.__T.street = function (k, back, alt) { const S = __G.sim; const c = S.playerCiv(); const cap = c.capital; const [sLon, sLat] = __G.world.siteOf(cap); const L = TOWN.layout(S, cap, c, {}); const st = L.streets[k % L.streets.length]; const cl = Math.cos(sLat * Math.PI / 180); const mLon = 1 / (6371000 * cl * Math.PI / 180), mLat = 1 / (6371000 * Math.PI / 180); const mx = (st[0] + st[2]) / 2, mz = (st[1] + st[3]) / 2; const dx = st[2] - st[0], dz = st[3] - st[1]; const len = Math.hypot(dx, dz) || 1; const ux = dx / len, uz = dz / len; const px = mx - ux * back, pz = mz - uz * back; const M = __G.mapcam; const lon = sLon + px * mLon, lat = sLat + pz * mLat; const heading = Math.atan2(ux, uz); __T.cam(lon, lat, alt / 6371000 / Math.cos(1.25), 1.25, heading); return { lon, lat, heading, len, n: L.streets.length }; };
// push the whole world into an era: every state gets the tech, capitals get the people for a city
window.__T.world = function (tech, capPop) { const S = __G.sim; for (const c of S.civs) { if (!c) continue; c.tech = tech; c.era = S.eraOf(tech); __T.teach(c); if (c.capital >= 0) S.pop[c.capital] = capPop; c.wealth += 5000; } __G.run(4); __G.world.refreshTextures(); };
// make the cell 2 east of the capital a town of the same realm (for rails/roads tests)
window.__T.twin = function (pop) { const S = __G.sim; const c = S.playerCiv(); const cap = c.capital; const j = cap + 2; S.owner[j] = c.id; S.pop[j] = pop; S.land[j] = 1; __G.run(3); __G.world.refreshTextures(); return j; };
// camera over the first plane
window.__T.plane = function (dist) { const M = __G.movers; const s = M.planes[0]; if (!s) return null; const p = s.a.clone().lerp(s.b, s.t).normalize(); const [lon, lat] = GEO.fromVec(p); __T.cam(lon, lat, dist, 0.6, 0.4); return [lon, lat, M.planes.length]; };
// camera over the middle of the first inter-town road
window.__T.road = function (dist, t) { const r = __G.decal.roads && __G.decal.roads[0]; if (!r) return null; const [lon, lat] = r.f(t === undefined ? 0.5 : t); const [lon2, lat2] = r.f((t === undefined ? 0.5 : t) + 0.02); const heading = Math.atan2((lon2 - lon) * Math.cos(lat * Math.PI / 180), lat2 - lat); __T.cam(lon, lat, dist, 1.15, heading); return [lon, lat, r.rail, r.lenKm, __G.decal.roads.length]; };
// force the living world: an eruption of a named volcano, a wildfire at a point, a battle at the capital
window.__T.erupt = function (name, strength) { const S = __G.sim; const v = S.volcanoes.find(v => v.name === name); v.erupting = S.year; v.last = S.year; v.strength = strength || 2.5; return [v.lon, v.lat]; };
window.__T.fire = function (lon, lat, r) { const S = __G.sim; const i = (() => { const x = Math.floor((lon + 180) / 360 * 720), y = Math.floor((90 - lat) / 180 * 360); return y * 720 + x; })(); S.fires.push({ i, year: S.year, r: r || 2, dur: 2 }); return i; };
window.__T.battle = function (siege) { const S = __G.sim; const c = S.playerCiv(); const cap = c.capital; const e = S.civs.find(x => x && x !== c); if (siege) S.walls[cap] = 2; S.battles.push({ i: cap, from: cap + 1, year: S.year, a: e.id, b: c.id, siege: !!siege }); c.wars[e.id] = S.year; e.wars[c.id] = S.year; return cap; };
window.__T.quake = function (lon, lat, mag) { const S = __G.sim; const x = Math.floor((lon + 180) / 360 * 720), y = Math.floor((90 - lat) / 180 * 360); S.quakes.push({ i: y * 720 + x, year: S.year, mag: mag || 8 }); };
window.__T.flood = function () { const S = __G.sim; const c = S.playerCiv(); const cap = c.capital; const y = (cap / 720) | 0, x = cap - y * 720; const cells = []; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = (y + dy) * 720 + x + dx; if (S.land[j] && (S.flags[j] & 2)) cells.push(j); } S.floods.push({ i: cap, year: S.year, cells }); return cells.length; };
// heading (rad, from north toward east as the camera uses it) toward a world direction from the camera point
window.__T.headingTo = function (v) { const f = GEO.enu(__G.mapcam.lon, __G.mapcam.lat); return Math.atan2(f.east.dot(v), f.north.dot(v)); };
