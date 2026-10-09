// The interface as the player sees it in the middle of a game: the realm tools/scenes/dip.js makes (an Iron Age kingdom with a
// war, friends on both sides, a vassal and envoys waiting), given works going up, a host in the field, a reform and a discovery
// under way, and looked at from above its capital. Run after dip.js (in the tour: "tools/scenes/dip.js tools/scenes/hud.js", with
// lens: true there, so that dip.js opens no screen). Options in window.__scene (beside dip.js's own):
//   hudAlt: metres above the capital (900,000)     hudTilt: how far the view leans (0.42)
//   age: an age to dress the interface in, for its metal (the realm is taught up to it; -1: the Iron Age dip.js gives)
//   screen: a screen to open over it: '' (none), 'gov', 'market', 'know', 'dip', 'cult', 'chron', 'legacy' (the Chronicle's Legacy tab),
//           'schemes' (a neighbour's page, at what the realm's agents could do there), 'intrigue' (Diplomacy's Intrigue tab: the realm's agents at
//           work against its enemy, foreign agents caught twice), 'sick' (the lens of sickness: plague begun in the enemy's capital and
//           smallpox in the realm's own, some years on)
// Answers in window.__hud: what is under way and what needs the player, as the interface lists them.
(() => {
  const P = Object.assign({ hudAlt: 900000, hudTilt: 0.42, age: -1, screen: '' }, window.__scene || {});
  const go = () => {
    const G = window.__G, S = G && G.sim, c = S && S.playerCiv(); if (!c) { window.__hud = { error: 'no realm' }; return; }
    // (dip.js's lens mode: the lens of relations on, the inspector hidden; the political map and the inspector again)
    const rel = document.getElementById('v-rel'); if (rel && rel.classList.contains('on')) rel.click();
    const left = document.getElementById('left'); if (left) left.style.display = '';
    if (P.age >= 0 && S.ERAS[P.age]) { const t = S.ERAS[P.age][1] + 0.01; if (c.tech < t) { c.tech = t; c.era = S.eraOf(t); } if (window.__T) __T.teach(c, undefined, true); }
    c.wealth = Math.max(c.wealth, 6000); const Q = S.rule.ruleOf(c); Q.auth = Math.max(Q.auth, 120);
    const towns = S.settlementsOf(c.id); const got = {};
    got.walls = S.act('walls', c.capital) || 'ok'; got.temple = S.act('temple', c.capital) || 'ok'; if (towns[1] !== undefined) got.market = S.act('market', towns[1]) || 'ok';
    got.levy = S.act('levy', c.capital) || 'ok';
    // a discovery to study and a law to reform: the first the realm may take
    for (const D of KNOW.LIST) { if (!S.know.study(c.id, c, D.key)) { got.study = D.key; break; } }      // (null when it is being studied, else why not)
    for (const key of Object.keys(RULE.LAW)) { const x = RULE.LAW[key]; if (S.rule.lacks(c.id, c, x)) continue; const why = S.rule.begin(c.id, c, key); if (!why && Q.reform) { got.reform = key; break; } }
    G.run(1);
    const M = G.mapcam; M.fly = null; const [lon, lat] = G.world.siteOf(c.capital); M.autoTilt = false; M.lon = M.tLon = lon; M.lat = M.tLat = lat - 2.2; M.dist = M.tDist = P.hudAlt / 6371000; M.tilt = M.tTilt = P.hudTilt; M.heading = M.tHeading = 0;
    // (spies and schemes: the realm's agents some way into a scheme against its enemy, and two lots of foreign agents caught)
    const X = S.intrigue, near = S.diplo.reach(c.id).map((id) => S.civs[id]).filter(Boolean); const foe = near.find((b) => S.isAtWar(c, b.id)) || near[0], calm = near.find((b) => !S.isAtWar(c, b.id) && S.diplo.touches(c, b.id)) || near.find((b) => b !== foe) || foe;
    if (X && foe && P.screen === 'intrigue') {
      if (c.intrigue) c.intrigue.s = null; for (const k of ['discord', 'learn', 'murder', 'claim']) if (!X.begin(c, foe, k)) { got.scheme = k; break; }
      const s = c.intrigue && c.intrigue.s; if (s) { const len = s.until - s.from; s.from -= Math.round(len * 0.4); s.until -= Math.round(len * 0.4); }
      const F = X.I(c).found, nm = (b) => S.fullName(b); F.length = 0; F.push([S.year - 3 * RULE.PACE[c.era], calm.id, 'learn'], [S.year - 4, foe.id, 'discord']);
      c.events.push({ year: S.year - 3 * RULE.PACE[c.era], text: `Agents of ${nm(calm)} are caught in ${nm(c)} copying the letters of its scholars`, type: 'intrigue', loc: c.capital, civ: c.id }, { year: S.year - 4, text: `Agents of ${nm(foe)} are caught in ${nm(c)} carrying gold to its great families`, type: 'intrigue', loc: c.capital, civ: c.id });
    }
    // (pestilence: plague in the enemy's capital, smallpox in the realm's own, a few years on; the court's story put by)
    if (S.disease && foe && P.screen === 'sick') { const X = S.disease; X.out.length = 0; X.seed(foe.capital, 'plague'); X.seed(calm.capital, 'measles'); X.seed(c.capital, 'pox'); for (let y = 0; y < 3; y++) { if (c.story) c.story.q = null; G.run(1); } if (c.story) c.story.q = null; got.sick = X.out.map((o) => o.name + ' ' + o.n); }
    const open = { gov: () => GOV.open(), market: () => MARKET.open(), know: () => TREE.open(), dip: () => ENVOYS.open('realms'), cult: () => WORKS.open(), chron: () => G.openChronicle('log'), legacy: () => G.openChronicle('legacy'),
      intrigue: () => ENVOYS.open('intrigue'), sick: () => { const b = document.getElementById('v-sick'); if (b && !b.classList.contains('on')) b.click(); }, schemes: () => { if (!calm) return; ENVOYS.open(null, calm.id); setTimeout(() => { const el = document.querySelector('#dp-info .dp-spyhead'); if (el) el.closest('.gv-sect').scrollIntoView({ block: 'start' }); }, 400); } }[P.screen];
    if (open) setTimeout(open, 1500);
    window.__hud = Object.assign(got, { age: document.body.dataset.age, under: [...document.querySelectorAll('#tk-body .trk .t')].map((e) => e.textContent), needs: [...document.querySelectorAll('#notes .note')].map((n) => n.getAttribute('aria-label')) });
  };
  setTimeout(go, 7000);
  return 'hud';
})();
