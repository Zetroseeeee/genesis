// Holocene legacies (classic script; exposes window.LEGACY): what a people is remembered for. Every age sets every realm six
// ambitions, one in each of six paths (arms, wealth, splendour, learning, faith, reach): hold so much land, keep markets, raise
// a wonder, be the first to know something, see your faith kept abroad, swear oaths far away. An ambition fulfilled in its age is
// remembered for ever (points in its path, worth more in later ages, and a little authority); one left undone when the age ends
// is lost with it. The world keeps its firsts: the first realm into each age, the first faith, the first wonder, the first to learn
// writing or spaceflight, the first realm of a million people; each is remembered once, by whoever came first. And when a realm
// enters a new age it chooses what it carries from the last (a story of its own, story.js: one of the three paths it did most in,
// for the whole of the age to come). The score of a realm is what it is remembered for; the great legacies of the world are kept
// when the realms that made them are gone.
//   LEGACY.create(h) -> { step, view, save, load, won, colony, ... } for one world; the host h (sim.js) answers what a realm has.
window.LEGACY = (function () {
  'use strict';
  const PATHS = [
    { key: 'arms', name: 'Arms', what: 'its arms', heir: 'the wars it won and the land it held' },
    { key: 'wealth', name: 'Wealth', what: 'its wealth', heir: 'its markets, its coin and its trade' },
    { key: 'splendour', name: 'Splendour', what: 'its splendour', heir: 'its great works and its renown' },
    { key: 'learning', name: 'Learning', what: 'its learning', heir: 'its scholars and what they found' },
    { key: 'faith', name: 'Faith', what: 'its faith', heir: 'its temples and its faith' },
    { key: 'reach', name: 'Reach', what: 'its reach', heir: 'its envoys, its oaths and its ships' },
  ];
  const PI = {}; PATHS.forEach((p, i) => { PI[p.key] = i; });
  const AGES = ['Stone Age', 'Bronze Age', 'Iron Age', 'Classical Age', 'Middle Ages', 'Renaissance', 'Industrial Age', 'Modern Age', 'Information Age'];
  // how far a realm has come toward n of something (a share, 0 to 1); a place among the realms of the world (1 within the first n)
  const upTo = (v, n) => Math.max(0, Math.min(1, v / n));
  const rank = (r, n) => (r >= 1 && r <= n ? 1 : r > n ? Math.max(0, n / r) * 0.9 : 0);
  const A = (era, path, key, name, ask, test) => ({ era, path: PI[path], key, name, ask, test });
  // among the first n realms of the world to learn a discovery (the order is kept as realms learn: learned()); once others have
  // been first, it cannot be fulfilled any more
  const early = (x, key, n) => { const at = x.g.at && x.g.at[key]; return at ? (at <= n ? 1 : 0) : 0; };
  const RACE = ['writing', 'alphabet', 'railways', 'flight', 'spaceflight'];
  // ----- the ambitions of every age (x: what the realm has, from the host; test -> how far it has come, 1 when fulfilled) -----
  const AMB = [
    A(0, 'arms', 'valleys', 'A people of many valleys', 'Hold 8 regions', (x) => upTo(x.cells(), 8)),
    A(0, 'wealth', 'granaries', 'Full granaries', 'Grow to 15,000 people', (x) => upTo(x.pop(), 15)),
    A(0, 'splendour', 'stones', 'Stones raised to the sky', 'Learn to raise megaliths', (x) => (x.knows('megaliths') ? 1 : 0)),
    A(0, 'learning', 'fields', 'The first fields', 'Learn farming and herding', (x) => ((x.knows('farming') ? 1 : 0) + (x.knows('herding') ? 1 : 0)) / 2),
    A(0, 'faith', 'spirits', 'The spirits honoured', 'Learn the old rites', (x) => (x.knows('ritual') ? 1 : 0)),
    A(0, 'reach', 'kin', 'Kin beyond the hills', 'Trade with 2 other peoples', (x) => upTo(x.trade(), 2)),
    A(1, 'arms', 'victory', 'A victory remembered', 'Win a war', (x) => upTo(x.winsAge(), 1)),
    A(1, 'wealth', 'markets', 'The first markets', 'Keep markets in 2 towns', (x) => upTo(x.markets(), 2)),
    A(1, 'splendour', 'great', 'A great person', 'Bring forth a great person', (x) => upTo(x.greats(), 1)),
    A(1, 'learning', 'writing', 'Words that last', 'Be among the first ten realms to write', (x) => early(x, 'writing', 10)),
    A(1, 'faith', 'ownfaith', 'A faith of our own', 'Found a faith, or hold its holy city', (x) => (x.founded() || x.holy() ? 1 : 0)),
    A(1, 'reach', 'oaths', 'Envoys and oaths', 'Be sworn to 3 realms', (x) => upTo(x.pacts(), 3)),
    A(2, 'arms', 'frontier', 'The iron frontier', 'Hold 60 regions', (x) => upTo(x.cells(), 60)),
    A(2, 'wealth', 'caravans', 'Caravans and coin', 'Strike coin and trade with 6 realms', (x) => ((x.knows('coinage') ? 1 : 0) + upTo(x.trade(), 6)) / 2),
    A(2, 'splendour', 'songs', 'Songs of the realm', 'Renown half again the usual for the age', (x) => upTo(x.rel(), 1.5)),
    A(2, 'learning', 'letters', 'Letters for all', 'Be among the first ten realms to learn the alphabet', (x) => early(x, 'alphabet', 10)),
    A(2, 'faith', 'temples', 'Temples in the towns', 'Keep temples in 3 towns', (x) => upTo(x.temples(), 3)),
    A(2, 'reach', 'vassal', 'A vassal', 'Take a realm as your vassal', (x) => upTo(x.vassals(), 1)),
    A(3, 'arms', 'empire', 'Empire', 'Hold 120 regions', (x) => upTo(x.cells(), 120)),
    A(3, 'wealth', 'harbours', 'Roads and harbours', 'Keep 2 harbours and trade with 6 realms', (x) => (upTo(x.ports(), 2) + upTo(x.trade(), 6)) / 2),
    A(3, 'splendour', 'wonder', 'A wonder of the world', 'Raise a wonder', (x) => upTo(x.wonders(), 1)),
    A(3, 'learning', 'wisdom', 'Lovers of wisdom', 'Learn philosophy and keep 3 academies', (x) => ((x.knows('philosophy') ? 1 : 0) + upTo(x.acad(), 3)) / 2),
    A(3, 'faith', 'spread', 'The faith spreads', 'See your faith kept by 5 realms', (x) => upTo(x.faithRealms(), 5)),
    A(3, 'reach', 'friends', 'Friends far away', 'Be sworn to 5 realms', (x) => upTo(x.pacts(), 5)),
    A(4, 'arms', 'sword', 'Crown and sword', 'Win two wars in this age', (x) => upTo(x.winsAge(), 2)),
    A(4, 'wealth', 'guilds', 'Guilds and fairs', 'Keep a workshop at work for every two towns, and at least 5', (x) => upTo(x.workshops(), Math.max(5, x.towns() / 2))),
    A(4, 'splendour', 'golden', 'A golden age', 'Live a golden age', (x) => (x.goldenAge() ? 1 : 0)),
    A(4, 'learning', 'universities', 'Universities', 'Learn universities and keep 4 academies', (x) => ((x.knows('universities') ? 1 : 0) + upTo(x.acad(), 4)) / 2),
    A(4, 'faith', 'holycity', 'The holy city', 'Hold the holy city of your faith', (x) => (x.holy() ? 1 : 0)),
    A(4, 'reach', 'marriage', 'A royal marriage', 'Join your house to another by marriage', (x) => (x.marriage() ? 1 : 0)),
    A(5, 'arms', 'pikeshot', 'Pike and shot', 'Be among the five mightiest realms', (x) => rank(x.mightRank(), 5)),
    A(5, 'wealth', 'bankers', 'Bankers', 'Keep a banking house of your own', (x) => upTo(x.houses(), 1)),
    A(5, 'splendour', 'masterpieces', 'Masterpieces', 'Hold 4 masterpieces', (x) => upTo(x.masters(), 4)),
    A(5, 'learning', 'firstknow', 'First to know', 'Be the first in the world to a discovery of this age', (x) => upTo(x.firstsAge(), 1)),
    A(5, 'faith', 'missions', 'Missions', 'See your faith kept by 10 realms', (x) => upTo(x.faithRealms(), 10)),
    A(5, 'reach', 'oversea', 'Beyond the sea', 'Found a colony across the sea', (x) => upTo(x.coloniesAge(), 1)),
    A(6, 'arms', 'steam', 'Iron and steam', 'Be among the three mightiest realms', (x) => rank(x.mightRank(), 3)),
    A(6, 'wealth', 'workshop', 'The workshop of the world', 'Be among the three greatest economies', (x) => rank(x.gdpRank(), 3)),
    A(6, 'splendour', 'admired', 'Admired', 'Be among the five most renowned realms', (x) => rank(x.renownRank(), 5)),
    A(6, 'learning', 'railways', 'The railway age', 'Be among the first ten realms to build railways', (x) => early(x, 'railways', 10)),
    A(6, 'faith', 'devout', 'Faith endures', 'Keep temples in half your towns', (x) => upTo(x.temples(), Math.max(2, x.towns() / 2))),
    A(6, 'reach', 'everytrade', 'Markets everywhere', 'Trade with 10 realms', (x) => upTo(x.trade(), 10)),
    A(7, 'arms', 'power', 'A great power', 'Be among the two mightiest realms', (x) => rank(x.mightRank(), 2)),
    A(7, 'wealth', 'plenty', 'Prosperity', 'Give your people all they want', (x) => upTo(x.ls(), 0.98)),
    A(7, 'splendour', 'watched', 'The world watches', 'Be among the three most renowned realms', (x) => rank(x.renownRank(), 3)),
    A(7, 'learning', 'wings', 'Wings', 'Be among the first ten realms to fly', (x) => early(x, 'flight', 10)),
    A(7, 'faith', 'worldfaith', 'A faith of the world', 'See your faith kept by 12 realms', (x) => upTo(x.faithRealms(), 12)),
    A(7, 'reach', 'alliances', 'Alliances', 'Keep 2 alliances or defensive pacts', (x) => upTo(x.alliances(), 2)),
    A(8, 'arms', 'mightiest', 'The mightiest', 'Be the mightiest realm in the world', (x) => rank(x.mightRank(), 1)),
    A(8, 'wealth', 'richest', 'The richest', 'Be the greatest economy in the world', (x) => rank(x.gdpRank(), 1)),
    A(8, 'splendour', 'renowned', 'The most renowned', 'Be the most renowned realm in the world', (x) => rank(x.renownRank(), 1)),
    A(8, 'learning', 'sky', 'Beyond the sky', 'Be among the first five realms to go into space', (x) => early(x, 'spaceflight', 5)),
    A(8, 'faith', 'calm', 'A people at peace with itself', 'Keep nine tenths of stability', (x) => upTo(x.stability(), 0.9)),
    A(8, 'reach', 'everywhere', 'Friends everywhere', 'Be sworn to 8 realms', (x) => upTo(x.pacts(), 8)),
  ];
  AMB.forEach((a, i) => { a.id = i; });
  const AK = {}; AMB.forEach((a) => { AK[a.key] = a; });
  const OF = []; for (let e = 0; e < 9; e++) OF.push(AMB.filter((a) => a.era === e));
  const worth = (era) => 10 + 5 * era;      // what an ambition of an age is worth: more in later ages, as the ages are shorter
  // ----- the world's firsts: once, for whoever is first (test on a realm; or a discovery: whoever first learned it) -----
  const F = (key, era, name, test, know) => ({ key, era, name, test, know });
  const FIRSTS = [
    ...AGES.slice(1).map((n, k) => F('age' + (k + 1), k + 1, `First into the ${n}`, (x) => x.era >= k + 1)),
    F('faith', 1, 'The first faith', (x) => x.founded()),
    F('great', 1, 'The first great person', (x) => x.greats() >= 1),
    F('wonder', 2, 'The first wonder of the world', (x) => x.wonders() >= 1),
    F('golden', 2, 'The first golden age', (x) => x.goldenAge()),
    F('land100', 3, 'The first realm of a hundred regions', (x) => x.cells() >= 100),
    F('million', 3, 'The first realm of a million people', (x) => x.pop() >= 1000),
    F('oversea', 4, 'The first colony across the sea', (x) => x.colonies() >= 1),
    F('bank', 4, 'The first banking house', (x) => x.houses() >= 1),
    F('writing', 1, 'The first to write', null, 'writing'), F('coinage', 2, 'The first coin', null, 'coinage'), F('philosophy', 3, 'The first philosophers', null, 'philosophy'),
    F('printing', 5, 'The first printing press', null, 'printing'), F('navigation', 5, 'The first ocean pilots', null, 'navigation'), F('steam', 6, 'The first steam engine', null, 'steam'),
    F('railways', 6, 'The first railway', null, 'railways'), F('electricity', 6, 'The first electric light', null, 'electricity'), F('flight', 7, 'The first flight', null, 'flight'),
    F('fission', 7, 'The first split atom', null, 'fission'), F('computers', 8, 'The first computer', null, 'computers'), F('spaceflight', 8, 'The first into space', null, 'spaceflight'),
    F('internet', 8, 'The first network of networks', null, 'internet'), F('ai', 8, 'The first thinking machine', null, 'ai'),
  ];
  FIRSTS.forEach((f, i) => { f.id = i; });
  const FK = {}; FIRSTS.forEach((f) => { FK[f.key] = f; });
  const firstWorth = (era) => 15 + 5 * era;
  // what each path leaves for the age to come (the heritage story's choices): the lasting effect, and the line the chronicle keeps
  const HEIR = [
    { str: 0.06, auth: 0, text: 'Its armies are feared', chip: '+6% strength in arms' },
    { inc: 0.05, text: 'Its merchants are trusted', chip: '+5% income' },
    { ren: 0.06, text: 'Its works are admired', chip: 'more renown' },
    { ins: 0.05, text: 'Its scholars are sought out', chip: '+5% insight' },
    { stab: 0.04, text: 'Its people keep the faith', chip: '+4 stability' },
    { inc: 0.025, stab: 0.02, auth: 30, text: 'Its word carries far', chip: '+30 authority, +2.5% income, +2 stability' },
  ];

  function create(h) {
    const civs = h.civs, MAXC = h.MAXC; const year = h.year;
    const firsts = new Array(FIRSTS.length).fill(null);      // [year, realm id, realm name] of each first, once it is taken
    const hall = [];      // the great legacies of realms that are gone: [name, points, born, fell, best path]
    const news = [];      // for the player: { kind: 'ambition' | 'first' | 'lost', key, year, text }
    const stats = { got: 0, firsts: 0, lost: 0, heritages: 0, ms: 0 };
    let ranks = null, ranksY = -1e9;
    const L = (cv) => cv.legacy || (cv.legacy = { pts: [0, 0, 0, 0, 0, 0], got: {}, age: cv.era, from: year(), wins: 0, winsA: 0, col: 0, colA: 0, fA: 0, gold: 0, her: [] });
    const total = (cv) => { const g = cv.legacy; if (!g) return 0; let s = 0; for (const p of g.pts) s += p; return s; };
    // the places of the realms of the world by might, by what they make and by renown (once a year, when asked)
    function placeOf() {
      const y = year(); if (ranks && y - ranksY < 5 && y >= ranksY) return ranks; ranksY = y;      // (once in five years: a realm's ambitions are looked at once in five)
      const ids = []; for (let c = 0; c < MAXC; c++) if (civs[c]) ids.push(c);
      const by = (f) => { const r = new Int16Array(MAXC); ids.slice().sort((a, b) => f(b) - f(a)).forEach((c, k) => { r[c] = k + 1; }); return r; };
      ranks = { might: by((c) => h.might(c)), gdp: by((c) => h.gdp(c)), renown: by((c) => h.renown(c)) };
      return ranks;
    }
    // what a realm has, as the ambitions ask it (each answered when asked, once)
    // (an object of methods on a prototype made once a world: what a realm has is asked of the host when an ambition asks it, and
    // what costs a search is asked once; a realm is looked at hundreds of times a year, so nothing is made for each look but this)
    function X(cv) { this.cv = cv; this.c = cv.id; this.era = cv.era; this.g = L(cv); this.m = {}; }
    const memo = (k, f) => function () { const m = this.m; return k in m ? m[k] : (m[k] = f(this)); };
    Object.assign(X.prototype, {
      cells() { return h.cells(this.c); }, pop() { return h.pop(this.c); }, towns() { return h.towns(this.c); }, temples() { return h.temples(this.c); }, markets() { return h.markets(this.c); },
      ports() { return h.ports(this.c); }, acad() { return h.acad(this.c); }, wonders() { return h.wonders(this.c); }, knows(k) { return h.knows(this.c, k); }, rel() { return h.rel(this.c); },
      ls() { return h.ls(this.c); }, stability() { return this.cv.stability; }, goldenAge() { return this.g.gold > 0 || h.golden(this.c); },
      winsAge() { return this.g.winsA; }, coloniesAge() { return this.g.colA; }, colonies() { return this.g.col; }, firstsAge() { return this.g.fA; },
      mightRank() { return placeOf().might[this.c]; }, gdpRank() { return placeOf().gdp[this.c]; }, renownRank() { return placeOf().renown[this.c]; },
      greats: memo('gr', (x) => h.greats(x.c)), masters: memo('ma', (x) => h.masters(x.c)), founded: memo('fo', (x) => h.founded(x.c)), holy: memo('ho', (x) => h.holy(x.c)),
      faithRealms: memo('fr', (x) => h.faithRealms(x.c)), vassals: memo('va', (x) => h.vassals(x.cv)), pacts: memo('pa', (x) => h.pacts(x.cv)), marriage: memo('mr', (x) => h.marriage(x.cv)),
      alliances: memo('al', (x) => h.alliances(x.cv)), houses: memo('hs', (x) => h.houses(x.c)), workshops: memo('ws', (x) => h.workshops(x.c)), trade: memo('tr', (x) => h.trade(x.c)),
    });
    const ctx = (cv) => new X(cv);
    const progressOf = (a, x) => { try { return Math.max(0, Math.min(1, a.test(x) || 0)); } catch (e) { return 0; } };
    // an ambition fulfilled: remembered in its path, a little authority, the chronicle's line
    function fulfil(cv, a, yr) {
      const g = L(cv); if (g.got[a.key]) return; g.got[a.key] = yr; g.pts[a.path] += worth(a.era); stats.got++;
      h.addAuth(cv, 6 + 2 * a.era);
      if (cv.player) { news.push({ kind: 'ambition', key: a.key, year: yr, text: `${a.name}: ${PATHS[a.path].name.toLowerCase()} remembered` }); h.log(cv, `${h.name(cv)} is remembered for ${a.name.charAt(0).toLowerCase() + a.name.slice(1)}`, false); }
      else if (h.cells(cv.id) >= 60) h.log(cv, `${h.name(cv)} is remembered for ${a.name.charAt(0).toLowerCase() + a.name.slice(1)}`, false);
    }
    function takeFirst(f, cv, yr) {
      if (firsts[f.id]) return; firsts[f.id] = [yr, cv.id, h.name(cv)]; stats.firsts++;
      const g = L(cv); g.pts[f.know ? PI.learning : f.key.startsWith('age') ? PI.learning : f.key === 'faith' ? PI.faith : f.key === 'great' || f.key === 'wonder' || f.key === 'golden' ? PI.splendour : f.key === 'oversea' ? PI.reach : f.key === 'bank' ? PI.wealth : PI.arms] += firstWorth(f.era);
      if (f.know && f.era >= 5) g.fA++;
      h.log(cv, `${f.name}: ${h.name(cv)}`, cv.player || f.era >= 3, 'legacy');
      if (cv.player) news.push({ kind: 'first', key: f.key, year: yr, text: f.name });
    }
    // a realm comes into a new age: what it did not do in the last is lost; it chooses what it carries into the next
    function newAge(cv, from, yr) {
      const g = L(cv); let lost = 0; for (const a of OF[from] || []) if (!g.got[a.key]) lost++; stats.lost += lost;
      if (cv.player && lost) news.push({ kind: 'lost', key: 'age' + from, year: yr, text: `${lost} ambition${lost === 1 ? '' : 's'} of the ${AGES[from]} left undone` });
      // the three paths it did most in, in the age just gone (what it was remembered for in it, then in all its history)
      const inAge = PATHS.map(() => 0); for (const a of OF[from] || []) if (g.got[a.key]) inAge[a.path] += 1;
      const order = PATHS.map((p, i) => i).sort((a, b) => (inAge[b] - inAge[a]) || (g.pts[b] - g.pts[a]) || (a - b));
      g.age = cv.era; g.from = yr; g.winsA = 0; g.colA = 0; g.fA = 0; g.gold = 0;
      if (cv.era < 1 || !h.tellAge) return;
      const why = h.tellAge(cv, { from, to: cv.era, paths: order.slice(0, 3), did: order.slice(0, 3).map((p) => inAge[p]) });
      if (!why) stats.heritages++;
    }
    // ----- a year: the autopilot's realms looked at once in ten years (their ambitions), the player every year; the firsts once in five -----
    function step() {
      const t0 = performance.now(), yr = year();
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; if (!cv) continue; const g = L(cv);
        if (cv.era > g.age) newAge(cv, g.age, yr); else if (cv.era < g.age) g.age = cv.era;
        if (!cv.player && (c + yr) % 10) continue;      // (the autopilot's realms once in ten years, the player every year)
        if (!g.gold && h.golden(c)) g.gold = 1;      // (a golden age lasts longer than that: seen when the realm is looked at)
        const list = OF[cv.era]; if (!list) continue; let x = null;
        for (const a of list) { if (g.got[a.key]) continue; if (!x) x = ctx(cv); if (progressOf(a, x) >= 1) fulfil(cv, a, yr); }
      }
      const t1 = performance.now(); stats.msA = t1 - t0;
      {
        // (a discovery's first is whoever first learned it, as the knowledge keeps it, looked at once in five years; the rest are asked
        // of each realm in its own year of the five, as its ambitions are)
        const open = []; let minEra = 9;
        for (const f of FIRSTS) { if (firsts[f.id]) continue; if (f.know) { if (yr % 5 === 0) { const at = h.firstOf(f.know); if (at && at.id >= 0 && civs[at.id]) takeFirst(f, civs[at.id], at.y > -1e8 ? at.y : yr); } continue; } open.push(f); if (f.era - 1 < minEra) minEra = f.era - 1; }
        if (open.length) for (let c = (5 - (yr % 5)) % 5; c < MAXC; c += 5) {
          const cv = civs[c]; if (!cv || cv.era < minEra) continue; let x = null;
          for (const f of open) { if (firsts[f.id] || cv.era < f.era - 1) continue; if (!x) x = ctx(cv); let ok = false; try { ok = f.test(x); } catch (e) { ok = false; } if (ok) takeFirst(f, cv, yr); }
        }
      }
      stats.ms = performance.now() - t0; stats.msF = stats.ms - stats.msA;
    }
    // ----- what the world's history hands it -----
    const raced = {}; for (const k of RACE) raced[k] = 0;
    function learned(cv, key) { if (!(key in raced)) return; raced[key]++; const g = L(cv); (g.at || (g.at = {}))[key] = raced[key]; }
    function won(w) { const g = L(w); g.wins++; g.winsA++; }
    function colony(cv) { const g = L(cv); g.col++; g.colA++; }
    function gone(cv) { const p = total(cv); if (p >= 60) { const g = cv.legacy; const best = g.pts.indexOf(Math.max(...g.pts)); hall.push([h.name(cv), p, cv.founded || 0, year(), best]); hall.sort((a, b) => b[1] - a[1]); if (hall.length > 24) hall.length = 24; } }
    // ----- what the player sees: this age's ambitions and how far each has come, what is remembered, the world's firsts and greatest -----
    function view(c) {
      const cv = civs[c]; if (!cv) return null; const g = L(cv); const x = ctx(cv);
      const now = (OF[cv.era] || []).map((a) => ({ key: a.key, name: a.name, ask: a.ask, path: a.path, pathName: PATHS[a.path].name, worth: worth(a.era), got: g.got[a.key] || 0, p: g.got[a.key] ? 1 : progressOf(a, x) }));
      const past = []; for (let e = 0; e < cv.era; e++) for (const a of OF[e]) past.push({ key: a.key, era: e, name: a.name, path: a.path, got: g.got[a.key] || 0, worth: worth(e) });
      const living = []; for (let k = 0; k < MAXC; k++) if (civs[k]) living.push([k, total(civs[k])]);
      living.sort((a, b) => b[1] - a[1]);
      const place = living.findIndex((q) => q[0] === c) + 1;
      return { era: cv.era, age: AGES[cv.era], pts: g.pts.slice(), total: total(cv), place, of: living.length, now, past, her: g.her.slice(),
        firsts: FIRSTS.map((f) => ({ key: f.key, name: f.name, era: f.era, at: firsts[f.id] })).filter((f) => f.at),
        great: living.slice(0, 12).map(([k, p]) => ({ id: k, name: h.name(civs[k]), pts: p, best: civs[k].legacy ? civs[k].legacy.pts.indexOf(Math.max(...civs[k].legacy.pts)) : 0, mine: k === c })), hall: hall.slice(0, 12) };
    }
    function scoreOf(c) { const cv = civs[c]; return cv ? total(cv) : 0; }
    function save() { return { f: firsts.map((q) => q || 0), hall: hall.slice(), raced }; }
    function load(s) { if (!s) return; if (s.f) s.f.forEach((q, i) => { if (i < firsts.length) firsts[i] = q || null; }); if (s.hall) { hall.length = 0; hall.push(...s.hall); } if (s.raced) for (const k in s.raced) if (k in raced) raced[k] = s.raced[k]; }
    // a world from before legacies: every realm begins in its own age with nothing remembered, and the firsts the knowledge
    // already holds are given to those who made them
    function settle() { for (const cv of civs) if (cv) { const g = L(cv); g.age = cv.era; } }
    return { step, view, ctx, won, colony, gone, learned, raced, scoreOf, total, save, load, settle, news, stats, firsts, hall, worth, firstWorth, progressOf, fulfil };
  }
  return { create, PATHS, PI, AMB, AK, OF, FIRSTS, FK, HEIR, AGES, worth };
})();
