// What the courts have learned of the player, as the diplomacy screen shows it (learn.js). After tools/scenes/dip.js: a history laid
// down by hand - twenty turns watched, in which the player fell on the small realm three times and on the foe once, broke two oaths,
// answered two calls to arms of three, made the beaten his vassals and joined one to his crown; his court saw him take coin and quiet
// when stories came, and chose war and the land for his scholars - then the screen opens at Your name, or at a realm's page.
// Options in window.__scene: tab ('name' by default), pick (dip.js's names: 'war', 'vassal', 'cold', 'asker' ...: that realm's page).
(() => {
  const G = window.__G, S = G && G.sim, L = S && S.learn, sc = window.__dipScene; if (!L || !sc) return 'no learner';
  const P = Object.assign({ tab: 'name', pick: '' }, window.__scene || {}); const c = S.playerCiv(); const who = (k) => (sc.who && sc.who[k] && S.civs[sc.who[k].id]) || null;
  const small = who('vassal'), foe = who('war');
  // twenty turns watched
  for (let t = 0; t < 20; t++) {
    L.st.next = -1e12; L.step();
    if ((t === 2 || t === 7 || t === 12) && small) L.declared(c, small);
    if (t === 16 && foe) L.declared(c, foe);
  }
  L.st.next = -1e12; L.step();
  L.oath(1); L.oath(1); L.called(true, 1); L.called(true, 1); L.called(false, 1); L.terms(3, 1); L.terms(1, 1); L.annexed();
  for (const x of S.civs) if (x && x !== c) L.st.heard[x.id] = Math.max(L.st.heard[x.id], 210);
  // his court: coin and quiet when stories came; his scholars know him for war and for the land
  const phi = [[1, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 1.2, 0, 0, 0, 0, 0, 0, 0, 0], [0, -0.4, 0, 0, 1, 0, 0, 0, 0, 0]];
  for (let k = 0; k < 6; k++) L.chose(phi, k % 3 === 2 ? 0 : 1);
  const KB = window.KNOW.BRANCHES.map((b) => b.key); for (let k = 0; k < 6; k++) L.studied(KB.indexOf('war')); for (let k = 0; k < 3; k++) L.studied(KB.indexOf('land'));
  // a league against him: the two that dread him most (besides those at war with him or sworn to him) swear to defend one another
  const D = S.diplo; const F = L.fearful(1.2).map(([b]) => b).filter((b) => !S.isAtWar(b, c.id) && D.D(b).lord < 0 && b !== c);
  if (F.length >= 2 && !D.bound(F[0], F[1])) { D.seal(F[0], F[1], 'defence'); S.logEvent(c, `Fearing ${S.fullName(c)}, ${S.fullName(F[0])} and ${S.fullName(F[1])} swear to defend one another`, false, 'pact'); }
  setTimeout(() => { if (P.pick && who(P.pick)) ENVOYS.open('realms', who(P.pick).id); else ENVOYS.open(P.tab); }, 3500);
  const out = { T: L.st.T, n: L.st.n, fearful: L.fearful(1.2).map(([b, f, f0]) => [S.fullName(b), +f.toFixed(3), +f0.toFixed(3)]), profile: L.profile() };
  window.__learnScene = out; return out;
})();
