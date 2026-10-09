// Scene for screenshots and checks: the Culture screen as the player sees it, in a world that has made its own great people.
// A world begun at random is run window.__scene.years forward (default 10,300: to AD 300), a few hundred years at a time; the
// player's realm is then set down at lon, lat among the realms there (on a region given up for it), given the Classical age,
// the regions round it and towns in them, and great people of the last few turns by culture.js's own dice, with their works
// set back in time; one work lost to a sack, one in another realm's city. Options in window.__scene:
//   years, lon, lat, land (regions)     tab: 'mine' or 'world'     gold: the realm in a golden age (default true)
//   lens: true = no screen; the lens of renown on the globe instead, seen from alt kilometres above the capital
// Answers in window.__cultScene.
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ years: 10300, lon: 23.0, lat: 38.5, land: 36, tab: 'mine', gold: true, lens: false, alt: 2600 }, window.__scene || {});
  document.getElementById('btn-random').click(); G.mapcam.fly = null;
  let done = 0;
  const run = () => { const n = Math.min(400, P.years - done); if (n > 0) { G.run(n); done += n; setTimeout(run, 30); return; } setTimeout(setup, 300); };
  const setup = () => {
    const S = G.sim, K = S.culture, W = S.W;
    const ll = (i) => [((i % W) + 0.5) / W * 360 - 180, 90 - (((i / W) | 0) + 0.5) / S.H * 180];
    const nb = (i, k) => { const y = (i / W) | 0, x = i - y * W, dy = k < 3 ? -1 : k < 5 ? 0 : 1, dx = k === 0 || k === 3 || k === 5 ? -1 : k === 1 || k === 6 ? 0 : 1, yy = y + dy; return yy < 0 || yy >= S.H ? -1 : yy * W + ((x + dx + W) % W); };
    // a populated region near the place, not a capital, given up for the player's seat
    let at = -1, bd = 1e9; const x0 = Math.floor((P.lon + 180) / 360 * W), y0 = Math.floor((90 - P.lat) / 180 * S.H);
    for (const i of S.LI) { const x = i % W, y = (i / W) | 0; const d = Math.hypot(Math.min(Math.abs(x - x0), W - Math.abs(x - x0)), y - y0); if (d > 12 || d >= bd || !(S.pop[i] > 0.5) || (S.flags[i] & 8)) continue; const o = S.owner[i]; if (o >= 0 && S.civs[o] && S.civs[o].capital === i) continue; bd = d; at = i; }
    if (at < 0) { window.__cultScene = { error: 'no place' }; return; }
    S.owner[at] = -1; S.recount(); const [lon, lat] = ll(at); G.start(lon, lat, 'Hellas');
    const c = S.playerCiv(); if (!c) { window.__cultScene = { error: 'no realm' }; return; }
    const cl = S.ERAS[3][1] + 0.02; c.tech = Math.max(c.tech, cl); c.era = S.eraOf(c.tech); if (window.__T) __T.teach(c, undefined, true);
    if (S.rule && window.RULE) { S.rule.setForm(c.id, c, RULE.FORM.kingdom, 'quiet'); if (c.ruler && S.rule.naming) c.ruler.title = S.rule.naming(c, 'kingdom').titles[0]; }
    // the regions round its seat, every third a town
    const q = [c.capital], seen = new Set(q); let got = 0;
    while (q.length && got < P.land) { const i = q.shift(); for (let k = 0; k < 8; k++) { const n = nb(i, k); if (n < 0 || seen.has(n) || !S.land[n] || (S.flags[n] & 8)) continue; seen.add(n); const o = S.owner[n]; if (o >= 0 && S.civs[o] && S.civs[o].capital === n) continue; if (o !== c.id) { S.claim(n, c, i); got++; } S.pop[n] = Math.max(S.pop[n], got % 3 === 0 ? 30 : 4); q.push(n); } }
    S.pop[c.capital] = Math.max(S.pop[c.capital], 40); c.stability = 0.9; c.wealth = 4000; S.recount(); G.run(4);
    // great people of the last few turns, born, working and dying; their works made in their years
    const T = K.TURN[c.era] || 50;
    const past = (n, span) => { for (let k = 0; k < n; k++) { const g = K.bear(c.id); if (!g) continue; const back = Math.floor(span * (n - k) / n) + (k * 7) % 9; g.born -= back; g.dies -= back; g.next = Math.max(S.year + 2, g.born + 20);
      const life = g.dies - g.born; for (let m = 0; m < 3; m++) { const yr = g.born + 12 + Math.floor((life - 12) * (m + 0.5) / 3); if (yr > S.year) break; const w = K.make(g); if (w) w.year = yr; } } };
    past(7, T * 4.5);
    c.stability = 0.9; K.golden[c.id] = -1e9;
    for (let k = 0; k < (P.gold ? 4 : 2); k++) { const g = K.bear(c.id); if (!g) continue; g.born -= Math.floor(T * 1.6 * k / 4); g.dies = Math.max(g.dies, S.year + 10); const w = K.make(g); if (w) w.year = Math.max(g.born + 6, S.year - 3); }
    { const mine = K.works.filter((w) => w.c === c.id); const other = S.civs.filter((x) => x && x !== c && x.capital >= 0).sort((a, b) => S.cellDist(a.capital, c.capital) - S.cellDist(b.capital, c.capital))[0];
      if (mine.length > 3) { mine[0].lost = S.year - Math.floor(T * 1.2); if (other) mine[1].at = other.capital; } }
    K.tally(S.year); S.cultureNews(); S.recount(); G.world.refreshTextures();
    const M = G.mapcam; M.fly = null; M.lon = M.tLon = lon; M.lat = M.tLat = lat;
    window.__cultScene = { year: S.year, realm: S.fullName(c), regions: S.cellsOf[c.id], living: K.livingOf(c.id).length, works: K.heldBy(c.id).length, renown: Math.round(K.renown[c.id]), rel: +K.rel(c.id).toFixed(2), golden: K.isGolden(c.id), greats: K.greats.length, all: K.works.length, born: K.stats.born };
    if (P.lens) { M.dist = M.tDist = P.alt * 1000 / 6371000; M.tilt = M.tTilt = 0; M.autoTilt = false; G.world.cloudsOn = false; if (!document.getElementById('v-ren').classList.contains('on')) document.getElementById('v-ren').click(); }
    else WORKS.open(P.tab);
  };
  setTimeout(run, 500);
  return 'running';
})();
