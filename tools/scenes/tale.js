// Scene for screenshots and checks: a story before the player's court (tales.js). A world begun at random is run
// window.__scene.years forward (default 11,250: to AD 1250), a few hundred years at a time; the player's realm is then set
// down at lon, lat (on a region given up for it), given the Middle Ages, the regions round it, a temple, an academy and a
// market, made a feudal monarchy, and given a family (a consort, a grown heir, a daughter, a small son); then the story k is
// told (default 'heir_cruel') and its page opened. With choose: n the court answers with choice n, and the page shows what came
// of it. Options in window.__scene: years, lon, lat, land, k, choose (-1). Answers in window.__tale.
(() => {
  const G = window.__G; if (!G) return 'no game';
  const P = Object.assign({ years: 11250, lon: 2.35, lat: 48.85, land: 26, k: 'heir_cruel', choose: -1 }, window.__scene || {});
  document.getElementById('btn-random').click(); G.mapcam.fly = null;
  let done = 0;
  const run = () => { const n = Math.min(400, P.years - done); if (n > 0) { G.run(n); done += n; setTimeout(run, 30); return; } setTimeout(setup, 300); };
  const setup = () => {
    const S = G.sim, D = S.dynasty, W = S.W;
    const ll = (i) => [((i % W) + 0.5) / W * 360 - 180, 90 - (((i / W) | 0) + 0.5) / S.H * 180];
    const nb = (i, k) => { const y = (i / W) | 0, x = i - y * W, dy = k < 3 ? -1 : k < 5 ? 0 : 1, dx = k === 0 || k === 3 || k === 5 ? -1 : k === 1 || k === 6 ? 0 : 1, yy = y + dy; return yy < 0 || yy >= S.H ? -1 : yy * W + ((x + dx + W) % W); };
    let at = -1, bd = 1e9; const x0 = Math.floor((P.lon + 180) / 360 * W), y0 = Math.floor((90 - P.lat) / 180 * S.H);
    for (const i of S.LI) { const x = i % W, y = (i / W) | 0; const d = Math.hypot(Math.min(Math.abs(x - x0), W - Math.abs(x - x0)), y - y0); if (d > 12 || d >= bd || !(S.pop[i] > 0.5) || (S.flags[i] & 8)) continue; const o = S.owner[i]; if (o >= 0 && S.civs[o] && S.civs[o].capital === i) continue; bd = d; at = i; }
    if (at < 0) { window.__tale = { error: 'no place' }; return; }
    S.owner[at] = -1; S.recount(); const [lon, lat] = ll(at); G.start(lon, lat, 'Francia');
    const c = S.playerCiv(); if (!c) { window.__tale = { error: 'no realm' }; return; }
    const med = S.ERAS[4][1] + 0.02; c.tech = Math.max(c.tech, med); c.era = S.eraOf(c.tech); if (window.__T) __T.teach(c, undefined, true);
    const q = [c.capital], seen = new Set(q); let got = 0; const mine = [];
    while (q.length && got < P.land) { const i = q.shift(); for (let k = 0; k < 8; k++) { const n = nb(i, k); if (n < 0 || seen.has(n) || !S.land[n] || (S.flags[n] & 8)) continue; seen.add(n); const o = S.owner[n]; if (o >= 0 && S.civs[o] && S.civs[o].capital === n) continue; if (o !== c.id) { S.claim(n, c, i); got++; } S.pop[n] = Math.max(S.pop[n], got % 3 === 0 ? 30 : 4); mine.push(n); q.push(n); } }
    S.pop[c.capital] = Math.max(S.pop[c.capital], 40); c.stability = 0.8; S.special[c.capital] |= 2 | 4 | 8; S.recount(); S.touchAll();
    // (the neighbours keep still: a realm cut out of theirs in a world at random could be gone again before its story is told)
    for (const x of S.civs) if (x && !x.player) { x.aggression = 0; if (x.dip) x.dip.think = 1e12; }
    S.rule.setForm(c.id, c, RULE.FORM.feudal, 'reform'); G.run(2);
    const y = S.year, r = D.rulerOf(c.id); r.f = false; c.ruler.fem = false; c.ruler.title = S.rule.naming(c).titles[0]; r.b = y - 52; r.r = [y - 21, 0]; c.ruler.since = y - 21;
    for (const id of r.k) D.P.delete(id); r.k = []; { const was = D.of(r.s); if (was) { was.s = 0; was.k = []; } }
    const mk = (o) => D.make(Object.assign({ h: r.h, c: c.id, d: y + 40 + Math.floor(Math.random() * 20) }, o));
    const sp = mk({ n: 'Adela', f: true, b: y - 44, h: 0, t: 'pious' }); r.s = sp.id; sp.s = r.id;
    const kid = (n, f, age, t) => { const k = mk({ n, f, b: y - age, p: r.id, m: sp.id, t }); r.k.push(k.id); sp.k.push(k.id); return k; };
    kid('Louis', false, 19, 'tyrant'); kid('Agnes', true, 17, 'merchant'); kid('Robert', false, 6, 'conqueror');
    c.wealth = Math.max(c.wealth, 4000); S.rule.ruleOf(c).auth = 90; if (c.story) c.story.q = null;
    const M = G.mapcam; M.fly = null; M.lon = M.tLon = lon; M.lat = M.tLat = lat;
    const why = S.storyTell(P.k);
    const v = S.storyView(); window.__tale = { year: S.year, realm: S.fullName(c), k: P.k, why: why || '', title: v ? v.title : '', opts: v ? v.opts.map((o) => o.t) : [] };
    if (v) { TALES.open(); if (P.choose >= 0) setTimeout(() => { const b = document.querySelector(`#tl-choices [data-tl="${P.choose}"]`); if (b) b.click(); window.__tale.out = document.getElementById('tl-outtext').textContent; }, 1500); }
  };
  setTimeout(run, 500);
  return 'running';
})();
