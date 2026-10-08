// Scene for screenshots and checks: hosts in the field. Evaluated in the page after tools/testcam.js and
// tools/scenes/town.js (the player's capital as window.__scene has it; the tour lists both files). window.__army(opts)
// lays out a war by hand: a realm of the same age a few regions off (opts.off: [dx, dy] in regions, default east), at war
// with the player; the player's levy raised at his capital and sent against their capital; opts.years of the war run
// (default 6), or until the host lays siege (opts.until: 'siege', at most twelve years); the host halted where it is if
// opts.halt. opts.walls gives their capital walls, opts.weak leaves them few people (and so a small host), opts.fleet
// builds a fleet at the player's capital (a harbour). The camera (opts.alt metres up, opts.tilt) by opts.look:
//   'mine'  over the player's host (default)        'side'  the player's host from its flank, its column across the picture
//   'siege' behind the host, the walls beyond it    'foe'   over their host
//   'fleet' over the player's fleet                 'high'  the hosts' banners from high up (opts.alt)
// Returns what is in the field.
(() => {
  const G = window.__G; if (!G) return 'no game';
  window.__army = (opts) => {
    const o = Object.assign({ off: [4, 0], years: 6, alt: 2500, tilt: 1.15, look: 'mine' }, opts || {});
    const S = G.sim, c = S.playerCiv(); if (!c) return 'no player';
    const W = S.W, cap = c.capital, y0 = (cap / W) | 0, x0 = cap - y0 * W;
    const at = (dx, dy) => (y0 + dy) * W + ((x0 + dx + W) % W);
    // their realm: a block of land a few regions off, peopled, of the player's age, with a town in the middle
    let foe = S.civs.find((x) => x && x !== c && x.capital === at(o.off[0], o.off[1]));
    if (!foe) {
      const mid = at(o.off[0], o.off[1]); if (!S.land[mid]) return 'their land is sea';
      if (S.owner[mid] >= 0 && S.civs[S.owner[mid]] && S.civs[S.owner[mid]] !== c) foe = S.civs[S.owner[mid]];
      else { S.owner[mid] = -1; foe = S.spawnTribe(mid, {}); }
      if (!foe) return 'no realm could be placed';
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const i = at(o.off[0] + dx, o.off[1] + dy); if (S.land[i] && S.owner[i] !== c.id) { S.owner[i] = foe.id; S.pop[i] = Math.max(S.pop[i], 1.5); } }
      // the land between is the player's, so that the two touch
      for (let k = 1; k < Math.abs(o.off[0]) + Math.abs(o.off[1]) - 2; k++) { const i = at(Math.round(o.off[0] * k / (Math.abs(o.off[0]) + Math.abs(o.off[1]))), Math.round(o.off[1] * k / (Math.abs(o.off[0]) + Math.abs(o.off[1])))); if (S.land[i] && S.owner[i] < 0) { S.owner[i] = c.id; S.pop[i] = Math.max(S.pop[i], 1); } }
      foe.capital = mid; S.pop[mid] = Math.max(S.pop[mid], 8); foe.tech = c.tech; foe.era = c.era; if (window.__T && __T.teach) __T.teach(foe);
      if (o.walls) { S.walls[mid] = o.walls; S.level[mid] = Math.max(S.level[mid], 2); }      // (a walled town to lay siege to)
      if (o.weak) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const i = at(o.off[0] + dx, o.off[1] + dy); if (S.owner[i] === foe.id && i !== mid) S.pop[i] = 0.3; }      // (few to hold it: the player's host carries the day)
      foe.aggression = 0; foe.dip.think = 1e12; S.touchAll(); G.run(1);
    }
    c.wealth = Math.max(c.wealth, 1e6); if (window.__T && __T.teach) __T.teach(c, undefined, true);
    if (!S.isAtWar(c, foe.id)) S.diplo.declare(c, foe, 'none');
    if (!S.army.of(c.id).length) S.act('levy', cap);
    const h = S.army.of(c.id)[0]; if (!h) return 'no host: ' + S.cannot('levy', cap);
    let fleet = null; if (o.fleet) { const why = S.cannot('fleet', cap); if (!why) S.act('fleet', cap); fleet = S.army.fleetsOf(c.id)[0] || null; if (!fleet) return 'no fleet: ' + why; }
    if (o.goal !== false) S.army.order(h.id, foe.capital);
    if (o.until === 'siege') { for (let y = 0; y < 12 && S.army.byId(h.id) && S.army.byId(h.id).state !== 'siege'; y++) G.run(1); }
    else if (o.years) G.run(o.years);
    if (o.halt && S.army.byId(h.id)) S.army.halt(h.id);
    const put = () => {
      const A = S.army, M = G.mapcam; M.fly = null; M.autoTilt = false;
      if (o.look === 'fleet' && fleet) {
        const T = G.troops, f = A.fleetById(fleet.id) || fleet; let lon, lat; [lon, lat] = A.cellLL(f.cell);
        if (f.port >= 0 && S.level[f.port]) { const [tl, ta] = TOWN.siteOf(S, f.port, S.civs[S.owner[f.port]], G.terrain, null); lon = (lon + tl * 2) / 3; lat = (lat + ta * 2) / 3; }
        M.lon = M.tLon = lon; M.lat = M.tLat = lat; M.tilt = M.tTilt = o.tilt; M.dist = M.tDist = o.alt / 6371000 / Math.cos(o.tilt); M.heading = M.tHeading = o.heading || 0;
        return { fleet: f.name, ships: f.ships, state: f.state, drawn: T ? T.counts : null };
      }
      const a = o.look === 'foe' ? A.list.find((q) => q.c === foe.id) || h : A.byId(h.id) || A.of(c.id)[0] || h;
      const v = G.troops && G.troops.vis.get(a.id); let [lon, lat] = v ? [v.lon, v.lat] : A.cellLL(a.cell); let heading = o.heading === undefined ? 0.6 : o.heading;
      if (o.look === 'side' && v) heading = v.head + Math.PI / 2 + 0.6;
      if (o.look === 'siege' && a.siegeAt >= 0 && S.level[a.siegeAt]) {
        const [tl, ta] = TOWN.siteOf(S, a.siegeAt, S.civs[S.owner[a.siegeAt]], G.terrain, null);
        heading = Math.atan2((tl - lon) * Math.cos(ta * Math.PI / 180), ta - lat) - 0.5; lon += (tl - lon) * 0.04; lat += (ta - lat) * 0.04;
      }
      M.lon = M.tLon = lon; M.lat = M.tLat = lat; M.tilt = M.tTilt = o.tilt; M.dist = M.tDist = o.alt / 6371000 / Math.cos(o.tilt); M.heading = M.tHeading = heading;      // (the camera looks at the host itself)
      return { host: a.name, men: a.men, state: a.state, cell: a.cell };
    };
    window.__armyLook = put; setTimeout(put, 3000); setTimeout(put, 8000); setTimeout(put, 16000);
    return Object.assign(put(), { foe: S.fullName(foe), hosts: S.army.list.length, year: S.year });
  };
  return 'ok';
})();
