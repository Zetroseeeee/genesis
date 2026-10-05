// The knowledge screen as the player sees it. Options in window.__scene (all optional):
//   lon, lat: where the realm is founded     years: how long the world then runs by itself (0 = the first day)
//   learn: discoveries the player's people learn at the start (keys)     queue: discoveries put in the queue
//   tab: tree or stand     key: the discovery whose page is open     age: scroll the tree to this age (0..8)
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ lon: 31.25, lat: 29.9, years: 0, learn: [], queue: [], tab: 'tree', key: '', age: -1 }, window.__scene || {});
  if (!G.sim.playerCiv || !G.sim.playerCiv()) G.start(P.lon, P.lat, 'Kemet');
  const S = G.sim, c = S.playerCiv(), k = S.know; G.mapcam.fly = null;
  for (const key of P.learn) k.study(c.id, c, key);
  for (const key of P.queue) k.enqueue(c.id, c, key);
  if (P.years) G.run(P.years);
  const intro = document.getElementById('intro'); if (intro) intro.hidden = true;
  const show = () => { TREE.open(P.tab, P.key || undefined); if (P.age >= 0) setTimeout(() => { const h = document.querySelector(`#kn-canvas .kn-era[data-e="${P.age}"]`); if (h) h.click(); }, 400); };
  setTimeout(show, 2500);
  return { year: S.year, known: k.count[c.id], studying: k.cur[c.id] >= 0 ? KNOW.LIST[k.cur[c.id]].key : null, queue: k.mind(c).q };
})();
