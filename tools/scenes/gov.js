// The laws screen as the player sees it. Options in window.__scene (all optional):
//   lon, lat: where the realm is founded     years: how long the world then runs by itself (the player's realm passes no law by itself)
//   age: the player's people are first given the knowledge of this age (0..8), and the laws realms of that age usually have
//   tab: laws, form or estates     key: the law or the form whose page is open     auth: the authority the ruler holds
//   demand: [estate, law]: that estate demands that law
//   lens: true = no screen; the lens of government on the globe instead, seen from alt metres above the capital
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ lon: 31.25, lat: 29.9, years: 0, age: -1, tab: 'laws', key: '', auth: -1, demand: null, lens: false, alt: 9000000 }, window.__scene || {});
  if (!G.sim.playerCiv || !G.sim.playerCiv()) G.start(P.lon, P.lat, 'Kemet');
  const S = G.sim, c = S.playerCiv(), k = S.rule; G.mapcam.fly = null;
  if (P.age >= 0) { c.tech = S.ERAS[P.age][1] + 0.02; c.era = S.eraOf(c.tech); for (const o of S.civs) if (o && o !== c && o.tech < c.tech - 0.03) { o.tech = c.tech - 0.03; o.era = S.eraOf(o.tech); if (window.__T) __T.teach(o); } if (window.__T) __T.teach(c, undefined, true); c.wealth += 3000; }
  if (P.years) G.run(P.years);
  const Q = k.ruleOf(c); if (P.auth >= 0) Q.auth = P.auth;
  if (P.demand) Q.demand = { e: RULE.EK[P.demand[0]], key: P.demand[1], since: S.year, until: S.year + 2 * RULE.PACE[c.era] };
  const intro = document.getElementById('intro'); if (intro) intro.hidden = true;
  const show = () => {
    if (!P.lens) { GOV.open(P.tab, P.key || undefined); if (P.key && P.tab !== 'laws' && RULE.LAW[P.key]) GOV.open(P.tab); return; }
    const M = G.mapcam; M.fly = null; const [lon, lat] = G.world.siteOf(c.capital); M.autoTilt = false; M.lon = M.tLon = lon; M.lat = M.tLat = lat; M.dist = M.tDist = P.alt / 6371000; M.tilt = M.tTilt = 0; M.heading = M.tHeading = 0;
    const left = document.getElementById('left'); if (left) left.style.display = 'none'; const b = document.getElementById('v-gov'); if (b && !b.classList.contains('on')) b.click();
  };
  setTimeout(show, 2500); setTimeout(() => { if (P.lens) show(); }, 6000);
  return { year: S.year, form: Q.gov, laws: Object.values(Q.laws).join(' '), auth: Math.round(Q.auth) };
})();
