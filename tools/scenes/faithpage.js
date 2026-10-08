// Scene for screenshots and checks: the Faith page of the laws screen, as the player sees it. A world begun at random is run
// window.__scene.years forward (default 9,800: to 200 BC), a few hundred years at a time; the player's realm is then set
// down at lon, lat among the realms there (on a region given up for it), given the Classical age and the regions round it
// with whatever faiths their people keep. page: 'new' - its land keeps the old ways and a prophet waits: the founding page,
// two tenets chosen; 'mine' - the faith most of its people keep is taken up and its page is open; 'world' - the page of
// the world's largest faith. Answers in window.__faithPage.
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ years: 9800, lon: 35.2, lat: 31.8, page: 'new', tenets: ['mission', 'pilgrim'], land: 24 }, window.__scene || {});
  document.getElementById('btn-random').click(); G.mapcam.fly = null;
  let done = 0;
  const run = () => { const n = Math.min(400, P.years - done); if (n > 0) { G.run(n); done += n; setTimeout(run, 30); return; } setTimeout(setup, 300); };
  const setup = () => {
    const S = G.sim, F = S.faith, W = S.W;
    const ll = (i) => [((i % W) + 0.5) / W * 360 - 180, 90 - (((i / W) | 0) + 0.5) / S.H * 180];
    const nb = (i, k) => { const y = (i / W) | 0, x = i - y * W, dy = k < 3 ? -1 : k < 5 ? 0 : 1, dx = k === 0 || k === 3 || k === 5 ? -1 : k === 1 || k === 6 ? 0 : 1, yy = y + dy; return yy < 0 || yy >= S.H ? -1 : yy * W + ((x + dx + W) % W); };
    // a populated region near the place, not a capital, given up for the player's seat
    let at = -1, bd = 1e9; const x0 = Math.floor((P.lon + 180) / 360 * W), y0 = Math.floor((90 - P.lat) / 180 * S.H);
    for (const i of S.LI) { const x = i % W, y = (i / W) | 0; const d = Math.hypot(Math.min(Math.abs(x - x0), W - Math.abs(x - x0)), y - y0); if (d > 12 || d >= bd || !(S.pop[i] > 0.5) || (S.flags[i] & 8)) continue; const o = S.owner[i]; if (o >= 0 && S.civs[o] && S.civs[o].capital === i) continue; bd = d; at = i; }
    if (at < 0) { window.__faithPage = { error: 'no place' }; return; }
    S.owner[at] = -1; S.recount(); const [lon, lat] = ll(at); G.start(lon, lat, 'Salem');
    const c = S.playerCiv(); if (!c) { window.__faithPage = { error: 'no realm' }; return; }
    const cl = S.ERAS[3][1] + 0.01; c.tech = cl; c.era = S.eraOf(cl); if (window.__T) __T.teach(c, 3, true);
    // the regions round its seat, with their people and their faiths
    const q = [c.capital], seen = new Set(q); let got = 0;
    while (q.length && got < P.land) { const i = q.shift(); for (let k = 0; k < 8; k++) { const n = nb(i, k); if (n < 0 || seen.has(n) || !S.land[n] || (S.flags[n] & 8)) continue; seen.add(n); const o = S.owner[n]; if (o >= 0 && S.civs[o] && S.civs[o].capital === n) continue; if (o !== c.id) { S.claim(n, c, i); got++; } S.pop[n] = Math.max(S.pop[n], 2); q.push(n); } }
    S.recount(); G.run(12); c.wealth = 4000; S.rule.ruleOf(c).auth = 120;      // (a few years, for the realms round it to be within reach)
    let f = 0;
    if (P.page === 'new') { F.gone(c.id); c.religion = null; F.prophet(c.id, c.capital, 'prophet'); S.faithNews(); GOV.openFaith('new'); for (const t of P.tenets) { const b = document.querySelector(`#gv-fthinfo .gv-tenet[data-tenet="${t}"]`); if (b) b.click(); } }
    else if (P.page === 'mine') { const fs = F.faithsOf(c.id, 6).filter((x) => x[0]); f = fs.length ? fs[0][0] : F.state[c.id]; if (f && F.state[c.id] !== f) F.adopt(c.id, f, 'chosen'); S.faithNews(); GOV.openFaith(f); }
    else { const big = F.list.filter((x) => x && x.n > 0).sort((a, b) => b.pop - a.pop)[0]; f = big ? big.id : 0; GOV.openFaith(f); }
    G.mapcam.lon = G.mapcam.tLon = lon; G.mapcam.lat = G.mapcam.tLat = lat;
    window.__faithPage = { year: S.year, at, realm: S.fullName(c), regions: S.cellsOf[c.id], faith: f ? F.nameOf(f) : '', faiths: F.list.filter((x) => x && x.n > 0).length };
  };
  setTimeout(run, 500);
  return 'running';
})();
