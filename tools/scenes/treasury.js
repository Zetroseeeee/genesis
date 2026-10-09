// Scene for screenshots and checks: the Treasury (the market screen's last tab) as the player sees it, in a world that has
// made its own banking houses and companies. A world begun at random is run window.__scene.years forward (default 11,650:
// to AD 1650), a few hundred years at a time; the player's realm is then set down at lon, lat among the realms there (on a
// region given up for it, a harbour at its seat), given the Renaissance and the regions round it with towns, and its money
// made: half of what lenders would give borrowed, a banking house and a company chartered, shares bought in the world's
// greatest company, the coin debased once. Options in window.__scene: years, lon, lat, land, debase (true), tab ('fin').
// Answers in window.__treasury.
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ years: 11650, lon: 4.9, lat: 52.4, land: 30, debase: true, tab: 'fin' }, window.__scene || {});
  document.getElementById('btn-random').click(); G.mapcam.fly = null;
  let done = 0;
  const run = () => { const n = Math.min(400, P.years - done); if (n > 0) { G.run(n); done += n; setTimeout(run, 30); return; } setTimeout(setup, 300); };
  const setup = () => {
    const S = G.sim, F = S.finance, W = S.W;
    const ll = (i) => [((i % W) + 0.5) / W * 360 - 180, 90 - (((i / W) | 0) + 0.5) / S.H * 180];
    const nb = (i, k) => { const y = (i / W) | 0, x = i - y * W, dy = k < 3 ? -1 : k < 5 ? 0 : 1, dx = k === 0 || k === 3 || k === 5 ? -1 : k === 1 || k === 6 ? 0 : 1, yy = y + dy; return yy < 0 || yy >= S.H ? -1 : yy * W + ((x + dx + W) % W); };
    // a populated coastal region near the place, not a capital, given up for the player's seat
    let at = -1, bd = 1e9; const x0 = Math.floor((P.lon + 180) / 360 * W), y0 = Math.floor((90 - P.lat) / 180 * S.H);
    for (const i of S.LI) { const x = i % W, y = (i / W) | 0; const d = Math.hypot(Math.min(Math.abs(x - x0), W - Math.abs(x - x0)), y - y0); if (d > 12 || d >= bd || !(S.pop[i] > 0.5) || (S.flags[i] & 8) || !(S.flags[i] & 4)) continue; const o = S.owner[i]; if (o >= 0 && S.civs[o] && S.civs[o].capital === i) continue; bd = d; at = i; }
    if (at < 0) { window.__treasury = { error: 'no place' }; return; }
    S.owner[at] = -1; S.recount(); const [lon, lat] = ll(at); G.start(lon, lat, 'Holland');
    const c = S.playerCiv(); if (!c) { window.__treasury = { error: 'no realm' }; return; }
    const ren = S.ERAS[5][1] + 0.02; c.tech = Math.max(c.tech, ren); c.era = S.eraOf(c.tech); if (window.__T) __T.teach(c, undefined, true);
    if (S.rule && window.RULE) { S.rule.setForm(c.id, c, RULE.FORM.republic, 'quiet'); }
    const q = [c.capital], seen = new Set(q); let got = 0;
    while (q.length && got < P.land) { const i = q.shift(); for (let k = 0; k < 8; k++) { const n = nb(i, k); if (n < 0 || seen.has(n) || !S.land[n] || (S.flags[n] & 8)) continue; seen.add(n); const o = S.owner[n]; if (o >= 0 && S.civs[o] && S.civs[o].capital === n) continue; if (o !== c.id) { S.claim(n, c, i); got++; } S.pop[n] = Math.max(S.pop[n], got % 3 === 0 ? 30 : 4); q.push(n); } }
    S.special[c.capital] |= 1 | 8; S.pop[c.capital] = Math.max(S.pop[c.capital], 40); c.stability = 0.85; S.recount(); S.touchAll(); G.run(12);
    // its money: borrowed, a house, a company, shares abroad, the coin debased once
    c.wealth = 200; F.borrow(c.id, F.room(c.id) * 0.5); c.wealth += 1e4;
    S.financeAct('house'); S.financeAct('company');
    const big = F.companies.filter((y) => !y.gone && y.c !== c.id).sort((a, b) => b.cap * b.val - a.cap * a.val)[0]; if (big) S.financeAct('buy', big.id, Math.round(c.wealth * 0.1));
    if (P.debase) S.financeAct('debase');
    G.run(3); c.wealth = Math.max(c.wealth, 1500); S.financeNews(); G.world.refreshTextures();
    const M = G.mapcam; M.fly = null; M.lon = M.tLon = lon; M.lat = M.tLat = lat;
    window.__treasury = { year: S.year, realm: S.fullName(c), debt: Math.round(F.debt[c.id]), rate: +(F.rateOf[c.id] * 100).toFixed(1), houses: F.houses.filter((x) => !x.fail).length, companies: F.companies.filter((y) => !y.gone).length, coin: F.coin(c.id), fine: F.fine[c.id] };
    MARKET.open(P.tab);
  };
  setTimeout(run, 500);
  return 'running';
})();
