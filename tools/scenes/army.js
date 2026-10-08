// Scene for screenshots and checks: hosts in the field. Evaluated in the page after tools/testcam.js and
// tools/scenes/town.js (the player's capital as window.__scene has it). window.__army(opts) lays out a war by hand:
// a realm of the same age a few regions off (opts.off: [dx, dy] in regions, default east), at war with the player; the
// player's levy raised at his capital and sent against their capital; opts.years of the war run (default 6); the camera
// put over the player's host (opts.alt metres, opts.tilt). Returns what is in the field.
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
      foe.aggression = 0; foe.dip.think = 1e12; S.touchAll(); G.run(1);
    }
    c.wealth = Math.max(c.wealth, 1e6); if (window.__T && __T.teach) __T.teach(c, undefined, true);
    if (!S.isAtWar(c, foe.id)) S.diplo.declare(c, foe, 'none');
    if (!S.army.of(c.id).length) S.act('levy', cap);
    const h = S.army.of(c.id)[0]; if (!h) return 'no host: ' + S.cannot('levy', cap);
    if (o.goal !== false) S.army.order(h.id, foe.capital);
    if (o.years) G.run(o.years);
    const put = () => {
      const A = S.army, a = o.look === 'foe' ? A.list.find((q) => q.c === foe.id) || h : A.byId(h.id) || A.of(c.id)[0] || h;
      const v = G.troops && G.troops.vis.get(a.id); const [lon, lat] = v ? [v.lon, v.lat] : A.cellLL(a.cell);
      const M = G.mapcam; M.fly = null; M.autoTilt = false; M.lon = M.tLon = lon - 0.02; M.lat = M.tLat = lat - 0.02; M.tilt = M.tTilt = o.tilt; M.dist = M.tDist = o.alt / 6371000 / Math.cos(o.tilt); M.heading = M.tHeading = o.heading || 0.6;
      return { host: a.name, men: a.men, state: a.state, cell: a.cell };
    };
    window.__armyLook = put; setTimeout(put, 3000); setTimeout(put, 8000);
    return Object.assign(put(), { foe: S.fullName(foe), hosts: S.army.list.length, year: S.year });
  };
  return 'ok';
})();
