// Scene for screenshots and checks: the Court (the laws screen's last tab) as the player sees it. A world begun at random is
// run window.__scene.years forward (default 11,250: to AD 1250), a few hundred years at a time; the player's realm is then set
// down at lon, lat (on a region given up for it), given the Middle Ages and the regions round it, made a feudal monarchy (its
// ruler stays on the throne and founds a house), and its ruler given a family to show: a consort, children of every age (one
// married, with children of her own; one dead young; one raised to a character), a brother, the parents before them and the
// reigns of the house. With regency: true the ruler is a child under a regent instead. Options in window.__scene: years, lon,
// lat, land, regency (false), pick ('heir', 'ruler' or a name). Answers in window.__court.
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ years: 11250, lon: 2.35, lat: 48.85, land: 26, regency: false, pick: 'heir' }, window.__scene || {});
  document.getElementById('btn-random').click(); G.mapcam.fly = null;
  let done = 0;
  const run = () => { const n = Math.min(400, P.years - done); if (n > 0) { G.run(n); done += n; setTimeout(run, 30); return; } setTimeout(setup, 300); };
  const setup = () => {
    const S = G.sim, D = S.dynasty, W = S.W;
    const ll = (i) => [((i % W) + 0.5) / W * 360 - 180, 90 - (((i / W) | 0) + 0.5) / S.H * 180];
    const nb = (i, k) => { const y = (i / W) | 0, x = i - y * W, dy = k < 3 ? -1 : k < 5 ? 0 : 1, dx = k === 0 || k === 3 || k === 5 ? -1 : k === 1 || k === 6 ? 0 : 1, yy = y + dy; return yy < 0 || yy >= S.H ? -1 : yy * W + ((x + dx + W) % W); };
    let at = -1, bd = 1e9; const x0 = Math.floor((P.lon + 180) / 360 * W), y0 = Math.floor((90 - P.lat) / 180 * S.H);
    for (const i of S.LI) { const x = i % W, y = (i / W) | 0; const d = Math.hypot(Math.min(Math.abs(x - x0), W - Math.abs(x - x0)), y - y0); if (d > 12 || d >= bd || !(S.pop[i] > 0.5) || (S.flags[i] & 8)) continue; const o = S.owner[i]; if (o >= 0 && S.civs[o] && S.civs[o].capital === i) continue; bd = d; at = i; }
    if (at < 0) { window.__court = { error: 'no place' }; return; }
    S.owner[at] = -1; S.recount(); const [lon, lat] = ll(at); G.start(lon, lat, 'Francia');
    const c = S.playerCiv(); if (!c) { window.__court = { error: 'no realm' }; return; }
    const med = S.ERAS[4][1] + 0.02; c.tech = Math.max(c.tech, med); c.era = S.eraOf(c.tech); if (window.__T) __T.teach(c, undefined, true);
    const q = [c.capital], seen = new Set(q); let got = 0;
    while (q.length && got < P.land) { const i = q.shift(); for (let k = 0; k < 8; k++) { const n = nb(i, k); if (n < 0 || seen.has(n) || !S.land[n] || (S.flags[n] & 8)) continue; seen.add(n); const o = S.owner[n]; if (o >= 0 && S.civs[o] && S.civs[o].capital === n) continue; if (o !== c.id) { S.claim(n, c, i); got++; } S.pop[n] = Math.max(S.pop[n], got % 3 === 0 ? 30 : 4); q.push(n); } }
    S.pop[c.capital] = Math.max(S.pop[c.capital], 40); c.stability = 0.85; S.recount(); S.touchAll();
    S.rule.setForm(c.id, c, RULE.FORM.feudal, 'reform'); G.run(2);
    // the family to show
    const y = S.year, r = D.rulerOf(c.id), H = D.houseOf(c.id); r.f = false; c.ruler.fem = false; c.ruler.title = S.rule.naming(c).titles[0];
    const mk = (o) => D.make(Object.assign({ h: r.h, c: c.id, d: y + 40 + Math.floor(Math.random() * 20) }, o));
    r.b = y - 47; r.r = [y - 19, 0]; c.ruler.since = y - 19; for (const id of r.k) D.P.delete(id); r.k = [];
    { const was = D.of(r.s); if (was) { was.s = 0; was.k = []; } } const sp = mk({ n: 'Adela', f: true, b: y - 41, h: 0, t: 'pious' }); r.s = sp.id; sp.s = r.id;
    const dad = mk({ n: 'Odo', f: false, b: y - 81, d: y - 19, t: 'conqueror', ep: 'the Hammer', r: [y - 52, y - 19] }), mum = mk({ n: 'Gisela', f: true, b: y - 77, d: y - 9, h: 0, t: 'steward' });
    dad.s = mum.id; mum.s = dad.id; r.p = dad.id; r.m = mum.id; dad.k = [r.id]; mum.k = [r.id];
    const bro = mk({ n: 'Hugh', f: false, b: y - 44, p: dad.id, m: mum.id, t: 'merchant' }); dad.k.push(bro.id); mum.k.push(bro.id);
    if (H) { H.line = [['Robert', y - 120, y - 87, 'the Strong', 0], ['Eudes', y - 87, y - 52, '', 0], ['Odo', y - 52, y - 19, 'the Hammer', 0], [r.n, y - 19, 0, '', 0]]; H.n = 4; H.founded = y - 120; }
    const kid = (n, f, age, t, o) => { const k = mk(Object.assign({ n, f, b: y - age, p: r.id, m: sp.id, t }, o || {})); r.k.push(k.id); sp.k.push(k.id); return k; };
    const k1 = kid('Matilda', true, 24, 'builder'), k2 = kid('Philip', false, 21, 'scholar'), k3 = kid('Louis', false, 17, 'tyrant'), k4 = kid('Agnes', true, 12, 'merchant'), k5 = kid('Robert', false, 7, 'conqueror', { rz: 1 }), k6 = kid('Henry', false, 3, 'steward', { d: y - 1 });
    const son = mk({ n: 'Raoul', f: false, b: y - 27, h: 0, t: 'navigator' }); k1.s = son.id; son.s = k1.id;
    for (const [n, f, age] of [['Emma', true, 4], ['Baldwin', false, 2]]) { const g = mk({ n, f, b: y - age, h: 0, p: son.id, m: k1.id, t: 'steward' }); k1.k.push(g.id); son.k.push(g.id); }
    void k2; void k3; void k4; void k5; void k6;
    if (P.regency) { const was = c.ruler.name; r.k = [k5.id]; sp.k = [k5.id]; k5.b = y - 9; S.rulerDies(c); void was; }
    S.dynastyNews(); c.wealth = Math.max(c.wealth, 2500);
    const M = G.mapcam; M.fly = null; M.lon = M.tLon = lon; M.lat = M.tLat = lat;
    const fam = D.familyOf(c.id); const pick = P.pick === 'ruler' ? fam.ruler : P.pick === 'heir' ? (fam.heir || fam.ruler) : [...D.P.values()].find((p) => p.n === P.pick) || fam.heir;
    window.__court = { year: S.year, realm: S.fullName(c), ruler: c.ruler.title + ' ' + c.ruler.name, house: H ? H.name : '', heir: fam.heir ? fam.heir.n : '', kids: fam.kids.length, regent: fam.regent && fam.regent.p ? fam.regent.p.n : '' };
    GOV.openCourt(pick ? pick.id : 0);
  };
  setTimeout(run, 500);
  return 'running';
})();
