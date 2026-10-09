// The interface as the player sees it in the middle of a game: the realm tools/scenes/dip.js makes (an Iron Age kingdom with a
// war, friends on both sides, a vassal and envoys waiting), given works going up, a host in the field, a reform and a discovery
// under way, and looked at from above its capital. Run after dip.js (in the tour: "tools/scenes/dip.js tools/scenes/hud.js", with
// lens: true there, so that dip.js opens no screen). Options in window.__scene (beside dip.js's own):
//   hudAlt: metres above the capital (900,000)     hudTilt: how far the view leans (0.42)
//   age: an age to dress the interface in, for its metal (the realm is taught up to it; -1: the Iron Age dip.js gives)
//   screen: a screen to open over it: '' (none), 'gov', 'market', 'know', 'dip', 'cult', 'chron', 'legacy' (the Chronicle's Legacy tab)
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
    const open = { gov: () => GOV.open(), market: () => MARKET.open(), know: () => TREE.open(), dip: () => ENVOYS.open('realms'), cult: () => WORKS.open(), chron: () => G.openChronicle('log'), legacy: () => G.openChronicle('legacy') }[P.screen];
    if (open) setTimeout(open, 1500);
    window.__hud = Object.assign(got, { age: document.body.dataset.age, under: [...document.querySelectorAll('#tk-body .trk .t')].map((e) => e.textContent), needs: [...document.querySelectorAll('#notes .note')].map((n) => n.getAttribute('aria-label')) });
  };
  setTimeout(go, 7000);
  return 'hud';
})();
