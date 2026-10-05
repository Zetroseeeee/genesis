// The market as the player sees it. Options in window.__scene (all optional):
//   lon, lat: where the realm is founded     years: how long the world then runs (7,600 = to 2,400 BC, by itself)
//   tech: every realm is first brought at least to this (0.1 Bronze, 0.2 Iron ...): history then runs far ahead of its dates
//   tab: board, trade, works or ledger       good: the good whose page is open
//   lens: true = no screen; the trade lens on the globe instead, seen from alt metres above the capital
//   ind: workshops of the capital, as in tools/scenes/town.js (ten plots; 0 = none)
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ lon: 31.25, lat: 29.9, tech: 0, years: 7600, tab: 'board', good: 'tin', lens: false, alt: 3200000 }, window.__scene || {});
  if (!G.sim.playerCiv || !G.sim.playerCiv()) G.start(P.lon, P.lat, 'Kemet');
  const S = G.sim, c = S.playerCiv(); G.mapcam.fly = null;
  for (const o of S.civs) if (o && o.tech < P.tech) { o.tech = P.tech; o.era = S.eraOf(o.tech); if (window.__T && __T.teach) __T.teach(o); }
  c.wealth += 5000; if (P.ind) S.ind.set(c.capital, Uint8Array.from(P.ind));
  G.run(P.years);
  const intro = document.getElementById('intro'); if (intro) intro.hidden = true;
  const show = () => {
    const M = G.mapcam; M.fly = null;
    if (P.lens) {
      const [lon, lat] = G.world.siteOf(S.playerCiv().capital); M.autoTilt = false;
      M.lon = M.tLon = lon; M.lat = M.tLat = lat; M.dist = M.tDist = P.alt / 6371000; M.tilt = M.tTilt = 0; M.heading = M.tHeading = 0;
      const left = document.getElementById('left'); if (left) left.style.display = 'none';
      const b = document.getElementById('v-trade'); if (b && !b.classList.contains('on')) b.click();
    } else { MARKET.open(P.tab); if (P.good && P.tab === 'board') MARKET.showGood(S.GOOD_ID[P.good]); }
  };
  setTimeout(show, 2500); setTimeout(() => { if (P.lens) show(); }, 6000);
  return { year: S.year, realms: S.civs.filter(Boolean).length, links: S.market.links ? S.market.links.length : 0 };
})();
