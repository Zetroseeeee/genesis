// The diplomacy screen as the player sees it, with something on the table. A world is made by hand around a new realm: seven
// neighbours set down round its border, everyone given the Iron Age and a king, and between them a war with friends on both sides,
// an alliance, a marriage, a trade agreement, a vassal, closed markets and a claim, and envoys waiting. Options in window.__scene:
//   lon, lat: where the realm is founded     year: the year the scene is set in (the realms are given the Iron Age)
//   tab: realms, envoys, wars or standing     pick: whose page is open: 'war', 'ally', 'spouse', 'trader', 'vassal', 'cold', 'asker'
//   lens: true = no screen; the lens of relations on the globe instead, seen from alt metres above the capital
// It answers with what it made (window.__dipScene too): how many neighbours, who is who, what is on the table.
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ lon: 44.4, lat: 33.3, tab: 'realms', pick: 'asker', lens: false, alt: 1600000, year: -884 }, window.__scene || {});
  if (!G.sim.playerCiv || !G.sim.playerCiv()) G.start(P.lon, P.lat, 'Akkad');
  const S = G.sim, D = S.diplo, W = S.W; G.mapcam.fly = null;
  if (S.year < P.year - 50) { const sv = S.save(); sv.year = P.year; S.load(sv); }      // (the world is as young as it was; only the calendar is moved)
  const c = S.playerCiv();
  const free = (i) => i >= 0 && i < S.N && S.land[i] && !(S.flags[i] & 8) && S.owner[i] < 0 && S.fert[i] > 0.03, near4 = (i) => [i - 1, i + 1, i - W, i + W];
  // land for a realm: its seat and the free regions round it, nearest first (a few at a time, so that neighbours share what there is)
  const front = new Map(); const grow = (t, n, pop) => { let st = front.get(t); if (!st) { st = { q: [t.capital], seen: new Set([t.capital]) }; front.set(t, st); } let k = 0;
    while (st.q.length && k < n) { const i = st.q.shift(); if (S.owner[i] >= 0 && S.owner[i] !== t.id) continue; if (S.owner[i] < 0) { S.owner[i] = t.id; k++; } S.pop[i] = Math.max(S.pop[i], pop); for (const j of near4(i)) if (!st.seen.has(j) && (free(j) || S.owner[j] === t.id)) { st.seen.add(j); st.q.push(j); } } return k; };
  grow(c, 45, 3);
  // seven seats round its border, evenly, clockwise from the north: the foe, the foe's friend, an ally, a small one, a trader, one who asks, a house to marry into
  const cx = c.capital % W, cy = (c.capital / W) | 0, TAU = 2 * Math.PI; const ang = (i) => { const a = Math.atan2((i % W) - cx, cy - ((i / W) | 0)); return a < 0 ? a + TAU : a; };
  const ring = []; for (const i of S.LI) if (free(i) && near4(i).some((j) => S.owner[j] === c.id)) ring.push(i);
  const made = []; for (let k = 0; k < 7; k++) { let best = -1, bd = 9; for (const i of ring) { if (S.owner[i] >= 0) continue; const d = Math.abs(((ang(i) - k * TAU / 7 + 3 * Math.PI) % TAU) - Math.PI); if (d < bd) { bd = d; best = i; } } if (best < 0) break; const t = S.spawnTribe(best, {}); if (t) made.push(t); }
  const [foe, cold, friend, small, trader, asker, spouse] = made; const size = new Map(); [[foe, [52, 3.5]], [cold, [30, 3]], [friend, [24, 3]], [small, [6, 1.6]], [trader, [18, 3]], [asker, [14, 2.6]], [spouse, [34, 3.2]]].forEach(([t, v]) => { if (t) size.set(t, v); });
  const got = new Map(made.map((t) => [t, 1])); for (let round = 0; round < 14; round++) for (const t of made) { const [n, pop] = size.get(t); const need = n - got.get(t); if (need > 0) got.set(t, got.get(t) + grow(t, Math.min(Math.ceil(n / 10), need), pop)); }
  const king = (x) => { if (x.ruler && S.rule.naming) x.ruler.title = S.rule.naming(x, 'kingdom').titles[0]; };
  const iron = S.ERAS[2][1] + 0.015; for (const x of [c, ...made]) { x.tech = iron; x.era = S.eraOf(iron); if (window.__T) __T.teach(x, 2, true); S.rule.setForm(x.id, x, RULE.FORM.kingdom, 'quiet'); king(x); x.religion = x === cold ? 'the Way of Ashur' : 'the Old Faith'; if (x !== c) { x.aggression = 0; x.dip.think = 1e12; } }
  c.wealth = 6000; S.recount(); S.touchAll(); G.run(6); S.touchAll();
  for (const x of [c, ...made]) king(x); if (friend) friend.ruler.trait = 'steward'; if (foe) foe.ruler.trait = 'conqueror';
  // the table
  const seal = (b, kind) => { if (b) D.seal(c, b, kind); };
  if (trader) { seal(trader, 'trade'); D.remember(trader, c.id, 14); }
  if (spouse) { seal(spouse, 'marriage'); seal(spouse, 'nap'); D.remember(spouse, c.id, 10); }
  if (small) D.seal(c, small, 'vassal');
  if (cold) { D.embargo(c, cold, true); D.claim(c, cold); D.remember(cold, c.id, -28); if (foe) D.seal(cold, foe, 'alliance'); }
  if (friend) { seal(friend, 'alliance'); seal(friend, 'trade'); D.remember(friend, c.id, 30); }
  if (asker) { D.remember(asker, c.id, 22); D.propose(asker, c, 'nap'); }
  const out = { year: S.year, made: made.length, reach: D.reach(c.id).length };
  if (foe) { D.remember(foe, c.id, -30); D.D(foe).claim[c.id * 4] = S.year + 300; const no = D.declare(foe, c, 'claim'); out.war = no || 'declared';
    if (!no) { // (a generation of war, going the player's way a little: his ally and his vassal beside him, their friend beside them; and they send envoys)
      if (friend && !S.isAtWar(friend, foe.id)) D.join(friend, c, foe); if (friend && !D.has(c, friend.id, 'alliance')) D.seal(c, friend, 'alliance'); if (cold && !S.isAtWar(cold, c.id)) D.join(cold, foe, c);
      const y0 = S.year - 30; for (const x of [c, friend, small]) if (x && x.wars[foe.id] !== undefined) x.wars[foe.id] = foe.wars[x.id] = y0; if (cold && cold.wars[c.id] !== undefined) cold.wars[c.id] = c.wars[cold.id] = y0;
      foe.warStart[c.id] = Math.round(S.cellsOf[foe.id] * 1.22); c.dip.offers = c.dip.offers.filter((o) => o.kind !== 'call'); D.D(c).offers.push({ id: ++D.D(c).seq, from: foe.id, kind: 'peace', terms: 'tribute', winner: c.id, since: S.year, until: S.year + 60 }); } }
  D.tick();      // (this year's tribute is reckoned)
  out.offers = D.D(c).offers.map((o) => o.kind).join(','); out.wars = Object.keys(c.wars).length;
  const by = { war: foe, ally: friend, spouse, trader, vassal: small, cold, asker }; const sel = (by[P.pick] || asker || foe || made[0] || { id: -1 }).id;
  out.who = {}; for (const k in by) if (by[k]) out.who[k] = { id: by[k].id, name: by[k].name, regions: S.cellsOf[by[k].id], ratio: +D.ratio(by[k], c).toFixed(2), opinion: Math.round(D.opinion(by[k], c)), stands: D.standing(c, by[k]) };
  window.__dipScene = out;
  G.world.refreshTextures(); G.world.updateBuildings(G.mapcam, true);
  const intro = document.getElementById('intro'); if (intro) intro.hidden = true;
  const show = () => {
    if (!P.lens) { if (P.tab === 'realms' && sel >= 0) ENVOYS.open('realms', sel); else ENVOYS.open(P.tab); return; }
    const M = G.mapcam; M.fly = null; const [lon, lat] = G.world.siteOf(c.capital); M.autoTilt = false; M.lon = M.tLon = lon; M.lat = M.tLat = lat; M.dist = M.tDist = P.alt / 6371000; M.tilt = M.tTilt = 0; M.heading = M.tHeading = 0;
    const left = document.getElementById('left'); if (left) left.style.display = 'none'; const b = document.getElementById('v-rel'); if (b && !b.classList.contains('on')) b.click();
  };
  setTimeout(show, 2500); setTimeout(() => { if (P.lens) show(); }, 6000);
  return out;
})();
