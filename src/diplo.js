// Holocene diplomacy (classic script; exposes window.DIPLO): what realms think of one another, what they have sworn, why they
// go to war and on what terms they stop. Tables and arithmetic: the simulation asks it who would fight whom, calls tick() once a
// year and step() for every realm, and lets it open and close wars. What a realm has agreed, remembers and is owed lives on the
// realm (civ.dip) and is saved with it.
window.DIPLO = (function () {
  'use strict';
  // how long matters between realms take, by age: a turn (rule.js keeps the table; main.js takes its turns from there too)
  const PACE = window.RULE ? window.RULE.PACE : [200, 100, 50, 50, 40, 20, 10, 5, 5];

  // ---------- what two realms can agree ----------
  // [key, name, the discovery it stands on, how many turns it holds, what it is]
  const RAW_PACTS = [
    ['nap', 'Sworn peace', 'laws', 4, 'Neither makes war on the other while it holds. Whoever breaks it is trusted by nobody for a long time.'],
    ['trade', 'Trade agreement', 'markets', 5, 'The merchants of each pay half the customs in the other\'s markets.'],
    ['defence', 'Defensive pact', 'envoys', 4, 'If either is attacked, the other goes to war beside it.'],
    ['alliance', 'Alliance', 'envoys', 5, 'Each joins the other\'s wars, whoever began them.'],
    ['marriage', 'Royal marriage', 'kingship', 2, 'Two houses are joined for a lifetime. Neither makes war on the other, and now and then one house inherits the other. Both realms must be ruled by blood.'],
  ];
  const PACTS = RAW_PACTS.map(([key, name, need, turns, text], id) => ({ id, key, name, need, turns, text })); const PACT = {}; PACTS.forEach((p) => { PACT[p.key] = p; });
  // a vassal is not a pact between equals: it is kept on the vassal (dip.lord), pays a tenth of its taxes and follows its lord to war
  const VASSAL = { key: 'vassal', name: 'Vassalage', need: 'kingship', text: 'The vassal pays a tenth of its income and follows its lord to war. The lord defends it, and in time may join it to the crown.' };
  // what else a discovery opens between realms (the knowledge tree's page says so; the pacts say their own)
  const OPENS = {
    laws: 'Your scribes can draw up <b>a claim</b> on a neighbour\'s borderland: a reason for war',
    kingship: 'A far weaker neighbour can be asked to <b>bend the knee</b>, and a beaten one made to',
    embassies: 'Your envoys reach <b>the neighbours of your neighbours</b>',
    radio: 'Your envoys reach <b>every realm on Earth</b>',
    nationalism: '<b>Unification</b> is a reason for war against realms of your own people',
  };
  const TRIBUTE = 0.1, REPARATION = 0.12, REPARATION_TURNS = 3, CLAIM_TURNS = 3, UNION_TURNS = 6, NEVER = 1e12;
  // how much readier a realm that rules itself is to fight a neighbour it has a reason against than one it has none; and how much less ready to fight
  // without any, by age (the ages before writing kept no accounts of such things)
  const WAR_CAUSE = 1.5, WAR_BARE = [1, 1, 0.95, 0.9, 0.9, 0.85, 0.8, 0.7, 0.6];
  // what a realm that rules itself dares: a side (friends counted) up to two and a half times as mighty as its own, and no mightier
  const DARE = 0.4;
  // how many vassals a realm that rules itself asks for, and takes under its protection without thinking twice
  const HOLD = 3;

  // ---------- why realms go to war, and what the winner may ask ----------
  // goal: what a clear win brings beyond the land taken (tribute: reparations; vassal: the loser submits; regime: its government is changed)
  const CAUSES = {
    none: { name: 'No cause', goal: 'land', text: 'War for its own sake. In the early ages nobody asks for more; later it costs trust abroad and quiet at home.' },
    reconquest: { name: 'Reconquest', goal: 'land', text: 'They hold land that was yours within living memory.' },
    claim: { name: 'A claim', goal: 'land', text: 'Your scribes have found, or made, a right to their borderland.' },
    holy: { name: 'Holy war', goal: 'land', text: 'They keep another faith, and yours is the law of your realm.' },
    holycity: { name: 'The holy city', goal: 'land', text: 'They hold the holy city of your faith, and keep another.' },
    covet: { name: 'A war for goods', goal: 'tribute', text: 'They hold what your people cannot do without, and you have none.' },
    kin: { name: 'Unification', goal: 'land', text: 'They are your own people under another flag.' },
    refused: { name: 'Tribute refused', goal: 'vassal', text: 'You asked them to bend the knee, and they would not.' },
    creed: { name: 'A war of creeds', goal: 'regime', text: 'They are ruled by a creed yours cannot live beside.' },
    ally: { name: 'An ally\'s war', goal: 'none', text: 'Sworn to stand beside a friend.' },
    rebel: { name: 'Rebellion', goal: 'vassal', text: 'A vassal that has thrown off its lord.' },
  };
  // what an unprovoked war costs, by age: quiet at home, and trust abroad (the ages before writing kept no such accounts)
  const UNJUST_STAB = [0, 0, 0.02, 0.04, 0.05, 0.07, 0.1, 0.14, 0.16], UNJUST_REP = [0, 0, 3, 5, 6, 8, 12, 16, 18];
  // what the winner may ask, least first
  const TERMS = { white: 'Peace as things stand', tribute: 'Reparations', regime: 'A change of government', vassal: 'Submission' };
  const RANK = { white: 0, tribute: 1, regime: 2, vassal: 3 };
  const TERM_TEXT = { white: 'Each keeps what it holds.', tribute: 'The loser pays the winner an eighth of its income for three turns.', regime: 'The loser is given a government of the winner\'s kind.', vassal: 'The loser becomes the winner\'s vassal.' };
  // how realms regard one another, in a word
  const MOODS = [[60, 'devoted'], [35, 'friendly'], [12, 'warm'], [-12, 'indifferent'], [-35, 'wary'], [-60, 'hostile'], [-1e9, 'bitter']];
  const moodOf = (o) => { for (const [min, w] of MOODS) if (o >= min) return w; return 'bitter'; };
  // what a realm's standing with another comes to on the map (the lens of relations), most telling first
  const STAND = { self: ['Your realm', '#EFE9DA'], war: ['At war with you', '#E2313F'], vassal: ['Your vassals', '#A9D94A'], lord: ['Your lord', '#B48CE0'], ally: ['Sworn to you', '#35C277'], friend: ['Friends', '#4AA3F0'], neutral: ['Indifferent', '#98A1AC'], wary: ['Wary of you', '#E6BC45'], hostile: ['Hostile', '#E0762F'], far: ['Beyond your envoys', '#4A525C'] };
  // kinds of rule that cannot live beside one another once nations and parties exist (rule.js KINDS): [a, b, how much they dislike it]
  const CREEDS = [['party', 'council', 16], ['party', 'crown', 14], ['party', 'empire', 14], ['party', 'faith', 16], ['sword', 'council', 8], ['experts', 'faith', 6]];
  const creedGap = (ka, kb) => { for (const [x, y, v] of CREEDS) if ((ka === x && kb === y) || (ka === y && kb === x)) return v; return 0; };

  // ---------- one world's diplomacy ----------
  // host: { MAXC, civs, year(), rnd(), knows(c, discovery), discovery(key): its name, popOf, cellsOf, strengthOf: how good each realm's arms are (what its fights turn on), mightOf: its arms and its numbers (what envoys weigh), nbOf(c): the realms it touches,
  //         links(): the market's links ({ a, b, v }), gdp(c), atWar(a, bId), truce(a, bId): the year a truce ends, declareWar(a, b, why),
  //         makePeace(a, b, text, quiet), won(winner, loser), event(cv, text, important, other), shake(cv, by), tongue(cv), kind(cv): its kind
  //         of rule, blood(cv): rulers follow by blood, faithLaw(cv), tradeLaw(cv), covets(a, b): the name of a good b holds that a lacks and
  //         needs, or '', absorb(lord, vassal, why), setForm(cv, key), formFor(loser, winner): a form of the winner's kind the loser can be
  //         given, or null, alarm(cv, kind), trait(cv), aggression(cv), ruler(cv): 'King Aldo', nameOf(cv), income(cv), fmtYear(y) }
  function create(host) {
    const { MAXC, civs } = host; const year = () => host.year();
    const stats = { pacts: {}, wars: {}, peace: {}, how: {}, appetite: { asked: 0, old: 0, open: 0, shut: 0, kept: 0 }, vassals: 0, freed: 0, unions: 0, heirs: 0, joined: 0, refused: 0, offers: 0, broken: 0, embargo: 0 };
    const count = (o, k) => { o[k] = (o[k] || 0) + 1; };
    // who each realm's merchants reach, and the market's link to each: the market's links sorted by realm (realm c's are pIds[pStart[c] .. pStart[c + 1]],
    // and pIdx says which link each is), made again when the market draws its links anew. Typed arrays: nothing is allocated, nothing chased
    let linkList = null, pIds = new Int32Array(64), pIdx = new Int32Array(64); const pStart = new Int32Array(MAXC + 1), pFill = new Int32Array(MAXC);
    function indexLinks(links) {
      linkList = links; pStart.fill(0); const n = links ? links.length : 0; if (pIds.length < 2 * n) { pIds = new Int32Array(2 * n + 256); pIdx = new Int32Array(2 * n + 256); }
      for (let i = 0; i < n; i++) { const L = links[i]; pStart[L.a + 1]++; pStart[L.b + 1]++; }
      for (let c = 0; c < MAXC; c++) { pStart[c + 1] += pStart[c]; pFill[c] = pStart[c]; }
      for (let i = 0; i < n; i++) { const L = links[i]; let k = pFill[L.a]++; pIds[k] = L.b; pIdx[k] = i; k = pFill[L.b]++; pIds[k] = L.a; pIdx[k] = i; }
    }
    const partnersOf = (c) => Array.from(pIds.subarray(pStart[c], pStart[c + 1]));
    // how often what each realm has sworn or shut has changed (the market looks again at a link only when either end's number has moved)
    const ver = new Uint32Array(MAXC);
    // how many vassals each realm has (counted again whenever anybody's lord changes: `stale`)
    const nVass = new Int16Array(MAXC); let stale = true;
    // what each realm receives and pays this year in tribute and reparations (the simulation adds it to their income), and what it earned of its own
    const trIn = new Float32Array(MAXC), trOut = new Float32Array(MAXC), ownInc = new Float32Array(MAXC), payers = new Int32Array(MAXC), pays = new Uint8Array(MAXC);
    const seen = new Uint8Array(MAXC);
    // what a realm has asked of another, and when: kept under one number for the two of them and the thing asked (as its claims are: whom, times four, plus
    // 0 a claim found or made, 1 land that was its own, 2 tribute refused, 3 a rebel vassal)
    const ASK = { nap: 0, trade: 1, defence: 2, alliance: 3, marriage: 4, vassal: 5, protect: 6 };
    const fresh = () => ({ rep: 50, inf: 0, pact: {}, mem: {}, claim: {}, lord: -1, since: 0, ask: {}, goal: {}, side: {}, owes: {}, owing: 0, ban: {}, offers: [], think: -1e9, next: NEVER, seq: 0 });
    const D = (cv) => cv.dip || (cv.dip = fresh());
    // (something of this realm's runs out then: its record is looked through no sooner)
    const soon = (cv, until) => { const d = D(cv); if (until < d.next) d.next = until; };
    const setClaim = (a, key, until) => { const d = D(a); d.claim[key] = until; if (until < d.next) d.next = until; };
    // a claim come by otherwise than by paying for it: raiders over the border, a holy city demanded (story.js)
    const grantClaim = (a, bid) => { if (!a || !civs[bid] || bid === a.id) return; setClaim(a, bid * 4, Math.max(D(a).claim[bid * 4] || -Infinity, year() + CLAIM_TURNS * pace(a))); };
    const era = (cv) => Math.max(0, Math.min(8, cv.era | 0)), pace = (cv) => PACE[era(cv)];
    const nameOf = (cv) => host.nameOf(cv);
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    const pick = (l) => l[Math.floor(host.rnd() * l.length)];

    // ----- memory: what a realm holds against another, or owes it; it fades by half in three turns -----
    function memOf(a, bid) { const m = D(a).mem[bid]; if (!m) return 0; return m[0] * Math.pow(0.5, (year() - m[1]) / (3 * pace(a))); }
    function remember(a, bid, by) { if (!a || a.id === bid) return; let v = memOf(a, bid) + by; v = v > 80 ? 80 : v < -80 ? -80 : v; D(a).mem[bid] = [Math.round(v * 100) / 100, year()]; }

    // ----- pacts -----
    const pactOf = (a, bid) => D(a).pact[bid] || null;
    function has(a, bid, key) { const p = D(a).pact[bid]; if (!p) return false; const u = p[key]; return u !== undefined && u > year(); }
    const anyPact = (a, bid) => { const p = D(a).pact[bid]; if (!p) return false; const y = year(); for (const k in p) if (p[k] > y) return true; return false; };
    function setPact(a, b, key, until) { (D(a).pact[b.id] || (D(a).pact[b.id] = {}))[key] = until; (D(b).pact[a.id] || (D(b).pact[a.id] = {}))[key] = until; ver[a.id]++; ver[b.id]++; soon(a, until); soon(b, until); }
    function dropPact(a, b, key) { drop1(a, b.id, key); drop1(b, a.id, key); }
    function drop1(x, yid, key) { const p = D(x).pact[yid]; if (!p) return; if (key) { if (p[key] === undefined) return; delete p[key]; } else for (const k in p) delete p[k]; ver[x.id]++; for (const _ in p) return; delete D(x).pact[yid]; }
    // how long a pact agreed now would hold: its turns, at the pace of the slower of the two (a marriage: a lifetime at least)
    const termOf = (a, b, kind) => { const P = PACT[kind], t = Math.round(P.turns * Math.max(pace(a), pace(b))); return kind === 'marriage' ? Math.max(40, t) : t; };
    const lordOf = (cv) => { const l = D(cv).lord; return l >= 0 && civs[l] ? civs[l] : null; };
    const setLord = (v, id) => { D(v).lord = id; stale = true; ver[v.id]++; if (id >= 0) pays[v.id] = 1; };
    const NONE = [];
    function vassalsOf(c) {
      if (stale) { nVass.fill(0); for (let k = 0; k < MAXC; k++) { const v = civs[k]; if (v && v.dip && v.dip.lord >= 0) { if (civs[v.dip.lord]) nVass[v.dip.lord]++; else v.dip.lord = -1; } } stale = false; }
      if (!nVass[c]) return NONE; const out = []; for (let k = 0; k < MAXC; k++) { const v = civs[k]; if (v && v.dip && v.dip.lord === c) out.push(v); } return out;
    }
    // bound to one another so that neither may attack: a pact that forbids it, a marriage, lord and vassal
    const bound = (a, b) => has(a, b.id, 'nap') || has(a, b.id, 'defence') || has(a, b.id, 'alliance') || has(a, b.id, 'marriage') || D(a).lord === b.id || D(b).lord === a.id;
    // those who would go to war beside a realm that is attacked (defenders), or beside one that attacks (only allies and vassals)
    function friends(cv, attack) {
      const out = [], d = D(cv), y = year(); for (const k in d.pact) { const p = d.pact[k], o = civs[+k]; if (!o) continue; if (p.alliance > y || (!attack && p.defence > y)) out.push(o); }
      const l = lordOf(cv); if (l && out.indexOf(l) < 0) out.push(l); for (const v of vassalsOf(cv.id)) if (out.indexOf(v) < 0) out.push(v); return out;
    }
    // markets closed: either has shut the other's merchants out (the market asks, link by link)
    const closed = (a, b) => { const ca = civs[a], cb = civs[b]; return !!((ca && ca.dip && ca.dip.ban[b]) || (cb && cb.dip && cb.dip.ban[a])); };
    const agreed = (a, b) => { const ca = civs[a]; if (!ca || !ca.dip) return false; const p = ca.dip.pact[b]; return !!p && p.trade > year(); };

    // ----- who a realm can deal with: those it touches or trades with, those it is bound to or fights; with embassies their neighbours too; with wireless, everyone -----
    function reach(c) {
      const cv = civs[c]; if (!cv) return []; const out = []; const add = (b) => { if (b !== c && civs[b] && !seen[b]) { seen[b] = 1; out.push(b); } };
      if (cv.era >= 7 || host.knows(c, 'radio')) { for (let b = 0; b < MAXC; b++) if (civs[b] && b !== c) out.push(b); return out; }
      const nb = host.nbOf(c); if (nb) for (const b of nb) add(b); for (let k = pStart[c], e = pStart[c + 1]; k < e; k++) add(pIds[k]);
      const d = D(cv); for (const k in d.pact) add(+k); for (const k in cv.wars) add(+k); if (d.lord >= 0) add(d.lord); for (const v of vassalsOf(c)) add(v.id);
      for (const o of d.offers) add(o.from);
      if (host.knows(c, 'embassies')) { const first = out.length; for (let i = 0; i < first; i++) { const b = out[i]; const n2 = host.nbOf(b); if (n2) for (const x of n2) add(x); for (let k = pStart[b], e = pStart[b + 1]; k < e; k++) add(pIds[k]); } }
      for (const b of out) seen[b] = 0; return out;
    }
    const touches = (a, bid) => { const nb = host.nbOf(a.id); return !!nb && nb.indexOf(bid) >= 0; };
    const tradeShare = (a, bid) => { const c = a.id; for (let k = pStart[c], e = pStart[c + 1]; k < e; k++) if (pIds[k] === bid) { const L = linkList[pIdx[k]], g = host.gdp(c); return L && g > 0 && L.v > 0 ? Math.min(0.5, L.v / g) : 0; } return 0; };
    const ratio = (a, b) => (host.mightOf[a.id] + 0.01) / (host.mightOf[b.id] + 0.01);      // (how a's might stands to b's: its arms and its numbers)

    // ----- opinion: how a regards b, from -100 to 100; with `out` the reasons are listed too: [what, by how much] -----
    // (The reasons are worded for the one who is thought of, who is the one that reads them - "what they think of you": "you" is b, "they" a.)
    const faithOf = (cv) => (host.faith ? host.faith(cv) : cv.religion ? cv.religion : 0);
    // (what one faith is worth between two realms: since faiths spread region by region (faith.js) a few faiths for all
    // peoples hold much of the world, and neighbours share one far oftener than when every realm took up a faith of its own)
    const SAME_FAITH = host.faith ? 4 : 6;
    function opinion(a, b, out) {
      if (!a || !b || a === b) return 0; const da = D(a), db = D(b), y = year(); let o = 0; const put = (t, v) => { if (!v) return; o += v; if (out) out.push([t, v]); };
      const m = memOf(a, b.id); if (Math.abs(m) >= 0.5) put(m > 0 ? 'Old favours' : 'Old wrongs', Math.round(m));
      // (one faith; another church of it, nearly as bad; another faith, as a's laws of faith and its faith's tenets make it; the holy city of a's faith in b's hands: faith.js)
      { const fa = faithOf(a), fb = faithOf(b);
        if (fa && fb) { if (fa === fb) put('The same faith', SAME_FAITH); else { const fl = host.faithLaw(a), base = fl === 'orthodoxy' ? -16 : fl === 'established' ? -10 : fl === 'tolerance' || fl === 'secular' || fl === 'godless' ? 0 : -6; const kin = !!host.faithKin && host.faithKin(a, b);
          put(kin ? 'Another church of the same faith' : 'Another faith', Math.round(base * (host.trait(a) === 'pious' ? 1.5 : 1) * (kin ? 0.8 : 1) + (host.faithT ? host.faithT(a, 'hate') : 0))); } }
        if (fa && host.holyHeld && host.holyHeld(a) === b.id) put('You hold the holy city of their faith', -Math.round(10 * Math.max(1, host.faithT(a, 'holy')))); }
      // (the works of a realm of renown are admired by those of little: culture.js)
      if (host.renownOf) { const ra = host.renownOf(a), rb = host.renownOf(b); if (rb > 2 * Math.max(4, ra) && host.renownRel(b) > 1.5) put('They admire your works', rb > 6 * Math.max(4, ra) ? 5 : 3); }
      const ka = host.kind(a), kb = host.kind(b); if (ka === kb && ka !== 'kin') put('Ruled alike', 4); else if (a.era >= 6 || b.era >= 6) put('Ruled by another creed', -creedGap(ka, kb));
      const near = touches(a, b.id); { const fa = host.folk ? host.folk(a) : 0; if (fa && fa === host.folk(b)) put('One people', 3); }      // (two realms of one people: people.js)
      { const ta = host.tongue(a); if (ta && ta === host.tongue(b)) put('Kindred speech', 5); else if (near && (a.era >= 6 || b.era >= 6)) put('Another nation on their border', -8); }      // (once peoples think of themselves as nations)
      const ts = tradeShare(a, b.id); if (ts > 0.005) put('Trade between you', Math.min(10, Math.round(50 * ts)));
      const p = da.pact[b.id]; let bind = false;
      if (p) { if (p.nap > y) { put('A sworn peace', 4); bind = true; } if (p.trade > y) put('A trade agreement', 5); if (p.alliance > y) { put('An alliance', 20); bind = true; } else if (p.defence > y) { put('A defensive pact', 12); bind = true; } if (p.marriage > y) { put('A royal marriage', 12); bind = true; } }
      if (db.lord === a.id) put('You are their vassal', 10);
      else if (da.lord === b.id) {      // (a lord is a shield while there is somebody to be shielded from; else a tax; and a yoke where he is not even the stronger)
        const big = host.mightOf[b.id] > host.mightOf[a.id] * 2, need = big && !!threatTo(a); put(need ? 'Your protection' : big ? 'The tribute they pay you' : 'Your yoke', need ? 6 : big ? -6 : -12); }
      else if (!bind && near) {      // (neighbours are rivals first: the border itself, a neighbour of one's own weight, a strong one with an appetite)
        put('A shared border', -5); const r = ratio(b, a);
        if (r > 2) { if (host.aggression(b) > 0.6 || db.inf > 5) put('Your strength, and your appetite', -10); } else if (r > 0.67 && r < 1.5) put('A rival of their own weight', -6);
      }
      // (peace kept is trust earned: two points for every turn since they last fought, or since the younger of them was founded; six at most)
      if (near && a.wars[b.id] === undefined) { const t = a.truce ? a.truce[b.id] : undefined, since = t !== undefined ? t - 100 : Math.max(a.founded || 0, b.founded || 0), v = Math.floor(2 * (y - since) / pace(a)); if (v > 0) put('A long peace', v > 6 ? 6 : v); }
      if (db.ban[a.id]) put('Your markets are closed to them', -10);
      if (db.inf > 1) put('Your conquests', -Math.min(40, Math.round(db.inf * (near ? 0.8 : 0.4))));
      if (db.rep !== 50) put(db.rep > 50 ? 'Your word is good' : 'Your word is worth little', Math.round((db.rep - 50) * 0.4));
      if (da.claim[b.id * 4] > y) put('Their claim on your land', -8); if (db.claim[a.id * 4] > y) put('Your claim on their land', -12);
      if (da.claim[b.id * 4 + 1] > y) put('You hold land that was theirs', -10);
      if (near) { const g = host.covets(a, b); if (g) put(out ? 'You hold ' + g.toLowerCase() + ', and they have none' : 'covet', -8); }
      const wb = host.warsN(b); if (wb && host.warsN(a)) for (const k in a.wars) if (b.wars[k] !== undefined && +k !== a.id && +k !== b.id) { put('A common enemy', 12); break; }
      if (wb) { let w = 0; for (const k in b.wars) { const e = civs[+k]; if (e && e !== a && (has(a, e.id, 'alliance') || has(a, e.id, 'defence') || D(e).lord === a.id || da.lord === e.id)) { w = 1; break; } } if (w) put('You are at war with their friends', -14); }
      const t = host.trait(a); if (t === 'conqueror' && near) put('A conqueror\'s eye', -6); else if (t === 'steward') put('A ruler who keeps the peace', 4); else if (t === 'tyrant') put('A ruler who trusts nobody', -4);
      return o > 100 ? 100 : o < -100 ? -100 : o;
    }
    const reasons = (a, b) => { const out = []; const o = opinion(a, b, out); out.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])); return { o, why: out }; };

    // ----- whom a realm fears: the strongest of those it touches that it has cause to dread -----
    function threatTo(a) {
      const nb = host.nbOf(a.id); if (!nb) return null; let best = null, bs = 1.25;
      for (const bid of nb) { const b = civs[bid]; if (!b || bound(a, b)) continue; const s = ratio(b, a) * (1 + D(b).inf / 30) * (host.atWar(a, bid) ? 1.5 : 1) * (host.aggression(b) > 0.7 ? 1.15 : 1); if (s > bs) { bs = s; best = b; } }
      return best;
    }

    // ----- would b agree to what a proposes? { ok, score, why: [[what, by how much]] } -----
    function judge(b, a, kind, ta0) {      // (ta0: whom a fears, if the caller has already worked that out)
      const why = []; let s = 0; const put = (t, v) => { if (v) { s += v; why.push([t, Math.round(v)]); } };
      const o = opinion(b, a), r = ratio(a, b);
      if (kind === 'vassal') {      // (a asks b to bend the knee)
        put('They would rather be their own masters', -70); put(r > 1 ? 'Your strength against theirs' : 'Their strength against yours', Math.max(-40, Math.min(90, 30 * Math.log2(r))));
        if (host.atWar(b, a.id)) put('The war goes against them', Math.max(0, 80 * score(a, b)));
        const t = threatTo(b); if (t && t !== a && o > 0) put('They need a protector against ' + nameOf(t), 18);
        if (lordOf(b)) put('They have a lord already', -50); if (vassalsOf(b.id).length) put('They are a lord of vassals themselves', -30); put('What they think of you', o * 0.3);
      } else if (kind === 'protect') {      // (a asks to become b's vassal)
        put('A vassal pays', 15); put('What they think of you', o * 0.5); if (!b.player && vassalsOf(b.id).length >= HOLD) put('They have vassals enough to defend', -30); if (r > 0.7) put('You are too strong to be anyone\'s vassal', -40); if (lordOf(b)) put('A vassal takes no vassals', -100);
      } else {
        put('What they think of you', o);
        if (kind === 'nap') { put('Peace costs little', 10); if (r > 1.3) put('They fear your strength', 15); else if (r < 0.67 && host.aggression(b) * (host.trait(b) === 'conqueror' ? 1.8 : 1) > 0.6) put('They mean to have your land', -22); if (D(b).claim[a.id * 4] > year()) put('They claim your land', -25); if (touches(b, a.id) && host.covets(b, a)) put('They want what you hold', -12); }
        else if (kind === 'trade') { put('Trade profits both', 6); const tl = host.tradeLaw(b); if (tl === 'monopoly' || tl === 'planned' || tl === 'protected') put('Their laws keep foreign merchants out', -18); if (tradeShare(b, a.id) > 0.03) put('Their merchants already trade with you', 8); if (D(b).ban[a.id] || D(a).ban[b.id]) put('Markets are closed between you', -40); }
        else if (kind === 'defence' || kind === 'alliance') {
          put(kind === 'alliance' ? 'An alliance binds them to all your wars' : 'A pact binds them to your defence', kind === 'alliance' ? -34 : -18);
          const tb = threatTo(b), ta = ta0 !== undefined ? ta0 : threatTo(a); if (tb && (tb === ta || host.atWar(a, tb.id))) put('You fear the same enemy', 26); else if (tb && r > 0.8) put('They need friends', 10);
          let w = 0; for (const _ in a.wars) w++; if (w) put('You are at war', kind === 'alliance' ? -8 : -20); if (r < 0.4) put('You would be a burden', -12); else if (r > 1.5) put('Your strength', 8);
          if (lordOf(b) || lordOf(a)) put('A vassal follows its lord', -100);
        } else if (kind === 'marriage') { put('A match takes thought', -5); if (!host.blood(a) || !host.blood(b)) put('Both realms must be ruled by blood', -200); { const fa = faithOf(a), fb = faithOf(b); if (fa && fb) put(fa === fb ? 'The same faith' : 'Another faith', fa === fb ? 8 : -12); } }
      }
      return { ok: s >= 0, score: Math.round(s), why: why.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])) };
    }
    // why a cannot propose this to b now (null: it can)
    function cannot(a, b, kind) {
      if (!a || !b || a === b) return 'Nobody there'; const P = kind === 'vassal' || kind === 'protect' ? VASSAL : PACT[kind]; if (!P) return 'No such thing';
      if (!host.knows(a.id, P.need)) return 'Needs ' + host.discovery(P.need); if (host.atWar(a, b.id)) return 'You are at war';
      if (kind === 'vassal') { if (D(b).lord === a.id) return 'Already your vassal'; if (lordOf(a)) return 'A vassal takes no vassals'; if (D(a).lord === b.id) return 'They are your lord'; }
      else if (kind === 'protect') { if (D(a).lord === b.id) return 'Already your lord'; if (lordOf(a)) return 'You have a lord already'; if (vassalsOf(a.id).length) return 'A lord of vassals kneels to nobody'; if (D(b).lord === a.id) return 'They are your vassal'; }
      else { if (kind === 'nap' && (D(b).lord === a.id || D(a).lord === b.id)) return D(b).lord === a.id ? 'Your vassal is sworn to you already' : 'You are sworn to your lord already';
        if (has(a, b.id, kind) && D(a).pact[b.id][kind] - year() > Math.max(pace(a), pace(b))) return 'Already in force';      // (it can be sworn again in its last turn)
        if (kind === 'defence' && has(a, b.id, 'alliance')) return 'Your alliance covers it'; if (kind === 'marriage' && (!host.blood(a) || !host.blood(b))) return 'Both realms must be ruled by blood'; if ((kind === 'defence' || kind === 'alliance') && (lordOf(a) || lordOf(b))) return D(b).lord === a.id ? 'Your vassal follows you to war already' : 'A vassal follows its lord'; }
      return null;
    }
    // it is agreed
    function seal(a, b, kind) {
      const y = year(), big = host.cellsOf[a.id] + host.cellsOf[b.id] > 160 || a.player || b.player;
      if (kind === 'vassal' || kind === 'protect') { const lord = kind === 'vassal' ? a : b, v = kind === 'vassal' ? b : a; count(stats.how, kind === 'vassal' ? 'asked' : 'sought'); subject(lord, v, kind === 'vassal' ? `${cap(nameOf(v))} bends the knee to ${nameOf(lord)}` : `${cap(nameOf(v))} puts itself under the protection of ${nameOf(lord)}`); return; }
      setPact(a, b, kind, y + termOf(a, b, kind)); if (kind === 'alliance') dropPact(a, b, 'defence'); count(stats.pacts, kind);
      remember(a, b.id, 4); remember(b, a.id, 4);
      const text = kind === 'nap' ? `${cap(nameOf(a))} and ${nameOf(b)} swear peace` : kind === 'trade' ? `${cap(nameOf(a))} and ${nameOf(b)} open their markets to one another` : kind === 'defence' ? `${cap(nameOf(a))} and ${nameOf(b)} swear to defend one another` : kind === 'alliance' ? `${cap(nameOf(a))} and ${nameOf(b)} are allies` : `The houses of ${nameOf(a)} and ${nameOf(b)} are joined by marriage`;
      host.event(a, text, a.player || b.player || (big && (kind === 'alliance' || kind === 'marriage')), b);
      if (kind === 'marriage' && host.married) host.married(a, b);      // (two of the houses' people are wed: dynasty.js)
    }
    function subject(lord, v, text) {
      const dv = D(v); dropPact(lord, v); for (const x of vassalsOf(v.id)) { setLord(x, -1); stats.freed++; }
      setLord(v, lord.id); dv.since = year(); stats.vassals++; delete D(lord).ban[v.id]; delete dv.ban[lord.id]; ver[lord.id]++;      // (those who had sworn to it swore to a sovereign: they are free)
      for (const k in dv.pact) { const o = civs[+k]; if (o) { dropPact(v, o, 'alliance'); dropPact(v, o, 'defence'); } }      // (a vassal's sword is its lord's)
      for (let k = 0; k < 4; k++) { delete D(lord).claim[v.id * 4 + k]; delete dv.claim[lord.id * 4 + k]; }
      if (text) host.event(lord, text, host.cellsOf[lord.id] + host.cellsOf[v.id] > 120 || lord.player || v.player, v);
    }

    // ----- what the player's realm does (the autopilot's use the same doors): null when done, else why not -----
    // a proposal: answered at once by a realm that rules itself; laid before the player when it is made to him
    function propose(a, b, kind) {
      const no = cannot(a, b, kind); if (no) return no; const da = D(a), y = year();
      const ak = b.id * 8 + ASK[kind]; if (a.player && da.ask[ak] !== undefined && y - da.ask[ak] < pace(a) / 2) return 'They have only just answered that';
      da.ask[ak] = y;
      if (b.player) { offer(b, { from: a.id, kind: kind === 'vassal' ? 'submit' : kind }); return null; }
      const j = judge(b, a, kind); if (!j.ok) { stats.refused++; if (kind === 'vassal') { remember(b, a.id, -10); setClaim(a, b.id * 4 + 2, y + CLAIM_TURNS * pace(a)); } return 'They refuse'; }
      seal(a, b, kind); return null;
    }
    // something laid before the player: { id, from, kind, since, until, ... }
    function offer(p, o) {
      const d = D(p), y = year(); if (d.offers.some((x) => x.from === o.from && x.kind === o.kind)) return; if (d.offers.length >= 6) d.offers.shift();
      o.id = ++d.seq; o.since = y; o.until = y + Math.round(1.5 * pace(p)); d.offers.push(o); stats.offers++; host.alarm(p, 'offer');
    }
    function answer(p, id, yes) {
      const d = D(p), i = d.offers.findIndex((x) => x.id === id); if (i < 0) return 'That has lapsed'; const o = d.offers[i]; d.offers.splice(i, 1); const a = civs[o.from]; if (!a) return 'They are no more';
      if (!yes) return turnDown(p, a, o, false);
      if (o.kind === 'peace') { if (!host.atWar(p, a.id)) return 'The war is over'; conclude(o.winner === p.id ? p : a, o.winner === p.id ? a : p, o.terms); return null; }
      if (o.kind === 'call') { const e = civs[o.vs]; if (!e || !host.atWar(a, e.id)) return 'The war is over'; if (host.atWar(p, e.id)) return null; join(p, a, e); return null; }
      if (o.kind === 'submit') { if (lordOf(p)) return 'You have a lord already'; if (host.atWar(p, a.id)) return 'You are at war'; subject(a, p, `${cap(nameOf(p))} bends the knee to ${nameOf(a)}`); return null; }
      if (o.kind === 'protect') { if (lordOf(p)) return 'A vassal takes no vassals'; if (host.atWar(p, a.id)) return 'You are at war'; subject(p, a, `${cap(nameOf(a))} puts itself under the protection of ${nameOf(p)}`); return null; }
      const no = cannot(a, p, o.kind); if (no) return no; seal(a, p, o.kind); return null;
    }
    // the player says no, or says nothing until the envoys go home (lapsed): a friend left to fight alone remembers it either way
    function turnDown(p, a, o, lapsed) {
      if (o.kind === 'call') { remember(a, p.id, lapsed ? -10 : -20); if (!lapsed) { dropPact(a, p, 'alliance'); dropPact(a, p, 'defence'); D(p).rep = Math.max(0, D(p).rep - 10); host.event(p, `${cap(nameOf(p))} leaves ${nameOf(a)} to fight alone`, true, a); } }
      else if (o.kind === 'submit') { remember(a, p.id, -6); setClaim(a, p.id * 4 + 2, year() + CLAIM_TURNS * pace(a)); }
      else if (o.kind === 'peace') { if (lapsed && o.terms === 'white' && host.atWar(p, a.id) && (year() - p.wars[a.id]) > 2 * pace(p)) conclude(p, a, 'white'); }      // (a long war nobody will end: the envoys settle it as things stand)
      else remember(a, p.id, lapsed ? -2 : -3);
      return null;
    }
    // a pact thrown over before its time: nobody forgets it
    function breakPact(a, b, kind) {
      if (kind === 'vassal') { if (D(b).lord !== a.id) return 'Not your vassal'; release(a, b); return null; }
      if (!has(a, b.id, kind)) return 'Not in force'; dropPact(a, b, kind); stats.broken++;
      const cost = kind === 'trade' ? 6 : kind === 'marriage' ? 10 : 18; D(a).rep = Math.max(0, D(a).rep - cost); remember(b, a.id, kind === 'trade' ? -10 : -25);
      host.event(a, `${cap(nameOf(a))} throws over its ${PACT[kind].name.toLowerCase()} with ${nameOf(b)}`, a.player || b.player || host.cellsOf[a.id] > 150, b); return null;
    }
    // a vassal let go by its lord; or one that walks away (and is a rebel in its lord's eyes)
    function release(lord, v) { setLord(v, -1); stats.freed++; remember(v, lord.id, 15); D(lord).rep = Math.min(100, D(lord).rep + 3); host.event(lord, `${cap(nameOf(lord))} releases ${nameOf(v)} from its oath`, lord.player || v.player, v); }
    function rebel(v) { const lord = lordOf(v); if (!lord) return 'You have no lord'; setLord(v, -1); stats.freed++; remember(lord, v.id, -30); setClaim(lord, v.id * 4 + 3, year() + CLAIM_TURNS * pace(lord)); D(v).rep = Math.max(0, D(v).rep - 8); host.event(v, `${cap(nameOf(v))} throws off the yoke of ${nameOf(lord)}`, true, lord); return null; }
    // a vassal long held and well disposed is joined to the crown: why it cannot be yet (null: it can)
    function cannotJoin(lord, v) {
      if (D(v).lord !== lord.id) return 'Not your vassal'; const left = D(v).since + UNION_TURNS * pace(lord) - year(); if (left > 0) return `Not before ${host.fmtYear(year() + left)}: an oath must grow old first`;
      if (opinion(v, lord) < 25) return 'They would not have it: they must think well of you'; if (ratio(lord, v) < 2) return 'They are too strong to be swallowed'; return null;
    }
    function annex(lord, v) { const no = cannotJoin(lord, v); if (no) return no; union(lord, v, `${cap(nameOf(v))} is joined to ${nameOf(lord)}, whose vassal it long was`); return null; }
    // coin sent with fair words: it buys goodwill by what it is to the one who gets it (a turn of their income, or more, is a great gift)
    function giftWorth(b, coin) { const turn = Math.max(20, Math.abs(host.income(b)) * pace(b)); return Math.round(22 * Math.pow(Math.min(1, coin / turn), 0.6)); }
    function gift(a, b, coin) {
      coin = Math.floor(coin); if (!(coin > 0)) return 'Nothing to send'; if (a.wealth < coin) return 'The treasury does not hold that'; if (host.atWar(a, b.id)) return 'You are at war';
      a.wealth -= coin; b.wealth += coin; const w = giftWorth(b, coin); const had = Math.max(0, memOf(b, a.id)), add = Math.min(Math.max(1, w), 45 - had); if (add > 0) remember(b, a.id, add);      // (no more than 45 of goodwill can be bought)
     
      if (a.player || b.player) host.event(a, `${cap(nameOf(a))} sends ${coin} coin to ${nameOf(b)}`, false, b); return null;
    }
    // a claim on a neighbour's land, found or made: it costs coin, sours them, and gives a war its reason for three turns
    const claimCost = (a, b) => Math.round(Math.max(30, 0.5 * Math.abs(host.income(a)) * pace(a) + 2 * Math.sqrt(host.cellsOf[b.id])));
    function claim(a, b) {
      if (!touches(a, b.id)) return 'You share no border'; if (!host.knows(a.id, 'laws')) return 'Needs ' + host.discovery('laws'); if (D(a).claim[b.id * 4] > year()) return 'You hold a claim already'; if (bound(a, b)) return 'You are sworn not to';
      const cost = claimCost(a, b); if (a.wealth < cost) return `Needs ${cost} coin`; a.wealth -= cost; setClaim(a, b.id * 4, year() + CLAIM_TURNS * pace(a)); remember(b, a.id, -10);
      if (a.player || b.player) host.event(a, `${cap(nameOf(a))} lays claim to the borderlands of ${nameOf(b)}`, true, b); return null;
    }
    // markets shut to another realm's merchants, or opened again: nothing passes between the two either way
    function embargo(a, b, on) {
      const da = D(a); if (on) { if (da.ban[b.id]) return 'Already closed'; if (D(b).lord === a.id || da.lord === b.id) return 'Lord and vassal trade freely'; da.ban[b.id] = year() || 1; ver[a.id]++; ver[b.id]++; stats.embargo++;      // (the year it was done; never nothing)
        dropPact(a, b, 'trade'); remember(b, a.id, -8); if (a.player || b.player || host.cellsOf[a.id] + host.cellsOf[b.id] > 300) host.event(a, `${cap(nameOf(a))} closes its markets to ${nameOf(b)}`, a.player || b.player, b); }
      else { if (!da.ban[b.id]) return 'Not closed'; delete da.ban[b.id]; ver[a.id]++; ver[b.id]++; if (a.player || b.player) host.event(a, `${cap(nameOf(a))} opens its markets to ${nameOf(b)} again`, false, b); }
      return null;
    }
    // the reasons a might give for a war on b: [{ key, name, text, just }], the best first
    function causes(a, b) {
      const out = [], da = D(a), y = year(); const add = (key) => out.push(Object.assign({ key, just: true }, CAUSES[key]));
      if (da.claim[b.id * 4 + 3] > y) add('rebel'); if (da.claim[b.id * 4 + 1] > y) add('reconquest'); if (da.claim[b.id * 4] > y) add('claim'); if (da.claim[b.id * 4 + 2] > y) add('refused');
      { const fa = faithOf(a), fb = faithOf(b), fl = host.faithLaw(a); if (fa && fb && fa !== fb && (fl === 'established' || fl === 'orthodoxy' || (host.sword && host.sword(a)))) add('holy');      // (a faith that holds with the sword needs no law to make it just)
        if (fa && host.holyHeld && host.holyHeld(a) === b.id && touches(a, b.id)) add('holycity'); }
      if (touches(a, b.id) && host.covets(a, b)) add('covet'); if (host.knows(a.id, 'nationalism')) { const fa = host.folk ? host.folk(a) : host.tongue(a); if (fa && fa === (host.folk ? host.folk(b) : host.tongue(b))) add('kin'); }      // (one people under two flags)
      if ((a.era >= 6 || b.era >= 6) && creedGap(host.kind(a), host.kind(b)) >= 14) add('creed');
      out.push(Object.assign({ key: 'none', just: a.era < 2 }, CAUSES.none)); return out;
    }
    // what an unprovoked war on b would cost a now: { stab, rep }, and which oath it would break (or null)
    function warCost(a, b, key) {
      const cs = causes(a, b), C = cs.find((x) => x.key === key) || cs[0], e = era(a); let broke = null; for (const k of ['nap', 'defence', 'alliance', 'marriage']) if (has(a, b.id, k)) broke = k;
      return { cause: C, stab: C.just ? 0 : UNJUST_STAB[e], rep: (C.just ? 0 : UNJUST_REP[e]) + (broke ? 30 : 0), broke };
    }
    // what stands between a and a war on b (null: nothing)
    function cannotFight(a, b) {
      if (!a || !b || a === b) return 'Nobody there'; if (host.atWar(a, b.id)) return 'Already at war'; if (D(a).lord === b.id) return 'They are your lord: throw off the yoke first'; if (D(b).lord === a.id) return 'They are your vassal';
      const t = host.truce(a, b.id); if (t > year()) return 'A truce holds until ' + host.fmtYear(t); const l = lordOf(a); if (l && !l.wars[b.id]) return 'A vassal makes no wars of its own'; return null;
    }
    // war: sworn peace and friendship between the two are broken (and remembered), friends are called, and an unjust war is paid for
    function declare(a, b, key) {
      const no = cannotFight(a, b); if (no) return no; const W = warCost(a, b, key), C = W.cause, da = D(a);
      if (W.broke) { stats.broken++; for (const x of reach(b.id)) if (civs[x] && x !== a.id) remember(civs[x], a.id, -8); }
      dropPact(a, b);
      if (W.stab) host.shake(a, W.stab); if (W.rep) da.rep = Math.max(0, da.rep - W.rep);
      da.goal[b.id] = C.key; delete da.side[b.id]; delete D(b).side[a.id]; delete D(b).goal[a.id]; remember(b, a.id, W.broke ? -40 : -22); count(stats.wars, C.key);
      const g = C.key === 'covet' ? host.covets(a, b) : '';
      host.declareWar(a, b, C.key === 'none' ? (a.player ? 'by decree' : pick(['over a border dispute', 'for glory', 'to seize its fields', 'after an insult to its ruler', 'to punish raids', '', ''])) : C.key === 'covet' ? `for its ${g.toLowerCase()}` : C.key === 'holy' ? 'for the faith' : C.key === 'holycity' ? 'for the holy city of its faith' : C.key === 'claim' ? 'to make good its claim' : C.key === 'reconquest' ? 'to win back what it lost' : C.key === 'kin' ? 'to unite its people' : C.key === 'refused' ? 'for tribute refused' : C.key === 'creed' ? 'against a creed it cannot abide' : C.key === 'rebel' ? 'to bring a rebel vassal to heel' : '');
      if (W.broke) host.event(a, `${cap(nameOf(a))} breaks its ${PACT[W.broke].name.toLowerCase()} with ${nameOf(b)}`, true, b);
      // friends: those sworn to b's defence; a's allies and vassals
      for (const x of friends(b, false)) if (x !== a && !host.atWar(x, a.id) && !bound(x, a) && D(x).lord !== a.id) call(x, b, a);
      for (const x of friends(a, true)) if (x !== b && !host.atWar(x, b.id) && !bound(x, b)) call(x, a, b);
      return null;
    }
    // x is asked to fight beside its friend against the enemy: the player is asked; a realm that rules itself weighs it
    function call(x, friend, enemy) {
      const sworn = D(x).lord === friend.id || D(friend).lord === x.id;
      if (host.truce(x, enemy.id) > year() && !sworn) return;
      if (x.player) { offer(x, { from: friend.id, kind: 'call', vs: enemy.id }); return; }
      const o = opinion(x, friend);
      if (sworn || host.rnd() < (o > 20 ? 0.92 : o > -10 ? 0.7 : 0.35)) join(x, friend, enemy);
      else { dropPact(x, friend, 'alliance'); dropPact(x, friend, 'defence'); D(x).rep = Math.max(0, D(x).rep - 10); remember(friend, x.id, -20); if (friend.player) host.event(x, `${cap(nameOf(x))} leaves ${nameOf(friend)} to fight alone`, true, friend); }
    }
    function join(x, friend, enemy) {
      if (host.atWar(x, enemy.id)) return; D(x).side[enemy.id] = friend.id; delete D(x).goal[enemy.id]; D(x).rep = Math.min(100, D(x).rep + 2); remember(friend, x.id, 10); remember(enemy, x.id, -15); stats.joined++; count(stats.wars, 'ally');
      dropPact(x, enemy); host.declareWar(x, enemy, `to stand by ${nameOf(friend)}`);
    }
    // a realm that came into a friend's war goes home on its own: the friend does not forget
    function abandon(x, enemy) {
      const fid = D(x).side[enemy.id]; if (fid === undefined) return 'This war is your own'; if (!host.atWar(x, enemy.id)) return 'You are not at war'; const f = civs[fid];
      delete D(x).side[enemy.id]; host.makePeace(x, enemy, `${cap(nameOf(x))} makes a peace of its own with ${nameOf(enemy)}`);
      if (f) { remember(f, x.id, -25); D(x).rep = Math.max(0, D(x).rep - 12); if (D(x).lord !== f.id && D(f).lord !== x.id) { dropPact(x, f, 'alliance'); dropPact(x, f, 'defence'); } }
      return null;
    }

    // ----- how a war stands: from a's side, -1 (lost) to 1 (won), by the land each has lost since it began -----
    function score(a, b) {
      const sa = a.warStart ? a.warStart[b.id] : 0, sb = b.warStart ? b.warStart[a.id] : 0; if (!sa || !sb) return 0;
      const la = 1 - host.cellsOf[a.id] / Math.max(1, sa), lb = 1 - host.cellsOf[b.id] / Math.max(1, sb); const s = lb - la; return s > 1 ? 1 : s < -1 ? -1 : s;
    }
    // what the winner may ask of the loser when the war stands at s (0 to 1), most first: beyond the land already taken
    function termsFor(w, l, s) {
      const out = ['white']; if (s > 0.12) out.unshift('tribute');
      if (s > 0.3 && (w.era >= 6 || l.era >= 6) && creedGap(host.kind(w), host.kind(l)) >= 8 && host.formFor(l, w)) out.unshift('regime');
      if (host.knows(w.id, 'kingship') && !lordOf(w) && !lordOf(l) && (s > 0.55 || (s > 0.35 && host.cellsOf[l.id] < host.cellsOf[w.id] * 0.5))) out.unshift('vassal'); return out;
    }
    // would x accept peace with y on these terms (w: who is to be the winner)?
    function wouldEnd(x, y, w, terms) {
      const s = score(w, w === x ? y : x), len = (year() - (x.wars[y.id] === undefined ? year() : x.wars[y.id])) / pace(x); const tired = len >= 2 || x.stability < 0.45;
      if (w === x) {      // (x is offered a win: it takes it, unless the war is going so well that it means to have more)
        if (terms !== 'white' || tired) return { ok: true, why: 'They take what is offered' }; const best = termsFor(x, y, s)[0];
        return RANK[best] > 0 ? { ok: false, why: 'They are winning, and mean to have more than that' } : { ok: true, why: 'They take what is offered' };
      }
      if (terms === 'white') return s > -0.08 || tired ? { ok: true, why: tired ? 'They are tired of the war' : s > 0.08 ? 'The war is not going their way' : 'Neither side is winning' } : { ok: false, why: 'They are winning' };
      const need = terms === 'tribute' ? 0.15 : terms === 'regime' ? 0.35 : host.cellsOf[x.id] < host.cellsOf[y.id] * 0.5 ? 0.38 : 0.58;
      return s >= need - (tired ? 0.08 : 0) ? { ok: true, why: 'They are beaten' } : { ok: false, why: s > 0.05 ? 'They are not beaten badly enough for that' : 'They are not beaten' };
    }
    // peace between a and b, a the winner (terms 'white': nobody is), and for everyone who fought beside either
    function conclude(w, l, terms) {
      if (!host.atWar(w, l.id)) return; const s = score(w, l), y = year(); const taken = Math.max(0, host.cellsOf[w.id] - (w.warStart[l.id] || host.cellsOf[w.id])), lost = Math.max(0, (l.warStart[w.id] || host.cellsOf[l.id]) - host.cellsOf[l.id]);
      const goal = D(w).goal[l.id] || D(l).goal[w.id] || 'none'; count(stats.peace, terms);
      const text = terms === 'vassal' ? `${cap(nameOf(l))} is beaten, and bends the knee to ${nameOf(w)}` : terms === 'tribute' ? `${cap(nameOf(l))} sues for peace, and will pay ${nameOf(w)} for it` : terms === 'regime' ? `${cap(nameOf(w))} wins its war, and remakes the government of ${nameOf(l)}` : s > 0.1 ? `${cap(nameOf(w))} wins its war against ${nameOf(l)}` : s < -0.1 ? `${cap(nameOf(l))} wins its war against ${nameOf(w)}` : null;
      // (everyone who came in on either side goes home with them)
      const ends = []; for (const k in l.wars) { const x = civs[+k]; if (x && x !== w && x.dip && x.dip.side[l.id] === w.id) ends.push([x, l]); } for (const k in w.wars) { const x = civs[+k]; if (x && x !== l && x.dip && x.dip.side[w.id] === l.id) ends.push([x, w]); }
      host.makePeace(w, l, text); for (const [x, e] of ends) { delete D(x).side[e.id]; host.makePeace(x, e, null, true); }
      delete D(w).goal[l.id]; delete D(l).goal[w.id]; remember(w, l.id, -6); remember(l, w.id, lost > 3 ? -18 : -8);
      // the land taken makes others wary (less for a war with a reason); what was lost may be claimed back
      const real = s >= 0 ? w : l, other = s >= 0 ? l : w, got = s >= 0 ? taken : Math.max(0, host.cellsOf[l.id] - (l.warStart[w.id] || host.cellsOf[l.id]));
      if (got > 0) { const just = goal !== 'none' && goal !== 'ally'; D(real).inf = Math.min(80, D(real).inf + Math.min(30, got / 5) * (just ? 0.6 : 1)); for (const k of [0, 1, 3]) delete D(real).claim[other.id * 4 + k]; if (got > 3) setClaim(other, real.id * 4 + 1, y + CLAIM_TURNS * pace(other)); }
      delete D(w).claim[l.id * 4 + 2];
      if (Math.abs(s) > 0.1 || terms !== 'white') host.won(s >= 0 || terms !== 'white' ? w : l, s >= 0 || terms !== 'white' ? l : w);
      if (terms === 'tribute') { D(l).owes[w.id] = y + REPARATION_TURNS * pace(l); D(l).owing = 1; pays[l.id] = 1; }
      else if (terms === 'vassal') { count(stats.how, 'beaten'); subject(w, l, null); }
      else if (terms === 'regime') { const f = host.formFor(l, w); if (f) host.setForm(l, f); }
    }
    // a realm has lost its last land in a war: no peace is made with the dead, so whoever took the land is marked for it here (the simulation
    // calls this just before it strikes the realm off)
    function fell(l) {
      for (const k in l.wars) { const w = civs[+k]; if (!w) continue; const taken = Math.max(0, host.cellsOf[w.id] - (w.warStart[l.id] || host.cellsOf[w.id])); if (taken <= 0) continue;
        const goal = D(w).goal[l.id] || 'none', just = goal !== 'none' && goal !== 'ally'; D(w).inf = Math.min(80, D(w).inf + (Math.min(30, taken / 5) + 4) * (just ? 0.6 : 1)); count(stats.peace, 'conquest'); host.won(w, l); }
    }
    // the player sues for peace on terms (winner: the id of whoever is to be the winner); a realm that rules itself answers at once
    function cannotSue(p, b) {
      if (!host.atWar(p, b.id)) return 'You are not at war'; if (D(p).side[b.id] !== undefined) return 'This is ' + nameOf(civs[D(p).side[b.id]] || p) + '\'s war to end'; if (D(b).side[p.id] !== undefined) return 'They fight for ' + nameOf(civs[D(b).side[p.id]] || b) + ': make peace there'; return null;
    }
    function sue(p, b, terms, winner) {
      const no = cannotSue(p, b); if (no) return no; const w = winner === b.id ? b : p, l = w === p ? b : p; if (!TERMS[terms]) return 'No such terms'; if (terms !== 'white' && termsFor(w, l, 1).indexOf(terms) < 0) return 'That cannot be asked';
      const j = wouldEnd(b, p, w, terms); if (!j.ok) return 'They refuse: ' + j.why.charAt(0).toLowerCase() + j.why.slice(1); conclude(w, l, terms); return null;
    }

    // ----- the autopilot: wars. Called by the simulation when a realm looks about it (as before, every ten years) -----
    // wars end: as they always did (after a generation, sooner when one side is broken), now on terms; a war the player is in is his to end,
    // though the other side may offer
    function warsEnd(a) {
      let any = false; for (const _ in a.wars) { any = true; break; } if (!any) return; const y = year(), da = D(a);
      for (const k of Object.keys(a.wars)) {
        const b = civs[+k]; if (!b) { delete a.wars[k]; continue; } const len = y - a.wars[k];
        if (da.side[b.id] !== undefined) { const f = civs[da.side[b.id]]; if (!f || !host.atWar(f, b.id)) { delete da.side[b.id]; host.makePeace(a, b, null, true); } continue; }
        if (D(b).side[a.id] !== undefined) continue;      // (b fights for someone else: that war ends with its principal's)
        const la = 1 - host.cellsOf[a.id] / Math.max(1, a.warStart[b.id] || 1), lb = 1 - host.cellsOf[b.id] / Math.max(1, b.warStart[a.id] || 1);
        if (!(len > 25 && (host.rnd() < 0.15 || len > 90 || la > 0.4 || lb > 0.4))) continue;
        const s = lb - la, w = s >= 0 ? a : b, l = s >= 0 ? b : a, sw = Math.abs(s); const goal = D(w).goal[l.id] || 'none';
        let terms = 'white'; if (sw > 0.1) { const opts = termsFor(w, l, sw); const G = (CAUSES[goal] || CAUSES.none).goal; terms = opts.indexOf(G) >= 0 ? G : opts.indexOf('vassal') >= 0 && host.rnd() < 0.3 ? 'vassal' : opts.indexOf('tribute') >= 0 && host.rnd() < 0.6 ? 'tribute' : 'white'; }
        if (a.player || b.player) { const p = a.player ? a : b, o = p === a ? b : a; offer(p, { from: o.id, kind: 'peace', terms, winner: terms === 'white' ? p.id : w.id }); continue; }
        conclude(w, l, terms);
      }
    }
    // would a go to war with b, who touches it? the reason it would give and how readily, or null. (The simulation has already asked whether a's
    // arms are the better: that is what its fights turn on. Here: whether it dares - nobody falls on a side two and a half times as mighty
    // as its own, friends counted on both - and whether it is free to.)
    function warWith(a, b) {
      if (cannotFight(a, b)) return null; let oath = 1;
      if (bound(a, b)) { const t = host.trait(a); if (!(t === 'tyrant' || t === 'conqueror') || has(a, b.id, 'alliance') || has(a, b.id, 'defence') || has(a, b.id, 'marriage') || D(a).lord === b.id || D(b).lord === a.id) return null; oath = 0.12; }      // (only the faithless break a sworn peace)
      let sa = host.mightOf[a.id], sb = host.mightOf[b.id]; for (const x of friends(a, true)) if (x !== b && !bound(x, b)) sa += 0.7 * host.mightOf[x.id]; for (const x of friends(b, false)) if (x !== a && !bound(x, a)) sb += 0.7 * host.mightOf[x.id];
      if (sa < sb * DARE) return null; const cs = causes(a, b); const C = cs.length > 2 ? cs[Math.floor(host.rnd() * (cs.length - 1))] : cs[0]; const o = opinion(a, b);      // (of several reasons, any)
      // (how readily: more with a reason, less against a friend, less once the world keeps accounts of unprovoked wars)
      // f: how this neighbour weighs against the others it could fight (more with a reason to give, more against those it hates, less against a friend);
      // g: what holds it back whoever else there is (an oath to break; a war without a reason, once the world keeps accounts of them)
      const f = (C.key !== 'none' ? WAR_CAUSE : 1) * (o <= -35 ? 2 : o <= -12 ? 1.4 : o >= 35 ? 0.2 : o >= 12 ? 0.6 : 1) * (oath === 1 && anyPact(a, b.id) ? 0.8 : 1);
      return { key: C.key, f, g: oath * (C.just ? 1 : WAR_BARE[era(a)]) };
    }

    // ----- the autopilot: what a realm that rules itself proposes, now and then -----
    function think(c, a) {
      const da = D(a), y = year(), P = pace(a); const lord = lordOf(a);
      // a vassal whose lord has grown weak, or who hates the yoke, throws it off
      if (lord) { if (y - da.since > 2 * P) { const o = opinion(a, lord); if (((ratio(lord, a) < 2 || lord.stability < 0.4) && o < 5 && host.rnd() < 0.5) || (o < 0 && host.warsN(lord) > 0 && host.rnd() < 0.35)) rebel(a); } return; }
      const nb = host.nbOf(c) || NONE, np = pStart[c + 1] - pStart[c]; if (!nb.length && !np && a.era < 7) return;
      const t = threatTo(a); const agg = host.aggression(a) * (host.trait(a) === 'conqueror' ? 1.8 : host.trait(a) === 'steward' ? 0.4 : 1);
      const ok = (b, kind) => { const v = da.ask[b.id * 8 + ASK[kind]]; return !(v !== undefined && y - v < 2 * P) && !cannot(a, b, kind); };
      // (ask: a realm that rules itself answers at once; the player has it laid before him, if the asker would itself agree to it)
      const go = (b, kind) => {
        da.ask[b.id * 8 + ASK[kind]] = y;
        if (b.player) { if (kind === 'vassal' || kind === 'protect' || judge(a, b, kind).ok) offer(b, { from: a.id, kind: kind === 'vassal' ? 'submit' : kind }); return true; }
        const j = judge(b, a, kind, t); if (j.ok) { seal(a, b, kind); return true; } stats.refused++; if (kind === 'vassal') { remember(b, a.id, -10); setClaim(a, b.id * 4 + 2, y + CLAIM_TURNS * P); } return false;
      };
      // (a handful of those it can deal with: two of those it touches, one of those its merchants reach, its vassals, and with wireless one from anywhere)
      const order = []; const add = (b) => { if (b !== c && civs[b] && order.indexOf(b) < 0) order.push(b); };
      { const n = nb.length, o0 = n ? Math.floor(host.rnd() * n) : 0; for (let i = 0; i < n && i < 2; i++) add(nb[(o0 + i) % n]); if (np) add(pIds[pStart[c] + Math.floor(host.rnd() * np)]); }
      for (const v of vassalsOf(c)) add(v.id); for (const k in da.ban) add(+k); if (a.era >= 7 || host.knows(c, 'radio')) add(Math.floor(host.rnd() * MAXC));
      let dread; const held = vassalsOf(c).length;
      for (const bid of order) {
        const b = civs[bid]; if (!b || host.atWar(a, bid)) continue; const o = opinion(a, b), near = nb.indexOf(bid) >= 0, r = ratio(a, b);
        if (D(b).lord === c) {      // its own vassal: in time, and where there is goodwill, joined to the crown
          if (!b.player && r > 6 && host.rnd() < 0.12 && !cannotJoin(a, b)) { union(a, b, `${cap(nameOf(b))} is joined to ${nameOf(a)}, whose vassal it long was`); return; } continue; }
        // markets closed to a creed it cannot abide, and opened again when tempers cool
        if (da.ban[bid]) { if (o > -25) embargo(a, b, false); } else if (a.era >= 2 && tradeShare(a, bid) < 0.05 && (o <= -60 || (a.era >= 6 && o <= -30 && creedGap(host.kind(a), host.kind(b)) >= 14)) && host.rnd() < 0.6) { embargo(a, b, true); return; }
        if (lordOf(b)) continue;
        // a protector against what it fears
        if (dread === undefined) dread = !!t && ratio(t, a) > 3 && (host.atWar(a, t.id) || D(t).inf > 5 || D(t).claim[c * 4] > y || opinion(t, a) <= -12);      // (a neighbour that could swallow it, and means to)
        if (dread && t !== b && r < 0.45 && o > 10 && ratio(b, t) > 0.9 && ok(b, 'protect') && host.rnd() < 0.3) { go(b, 'protect'); return; }
        if (t && t !== b && o > 0 && ok(b, 'defence') && !has(a, bid, 'alliance') && (threatTo(b) === t || host.atWar(b, t.id)) && go(b, 'defence')) return;
        if (has(a, bid, 'defence') && o > 30 && ok(b, 'alliance') && host.rnd() < 0.5 && go(b, 'alliance')) return;
        if (near && r < 0.8 && o > -20 && agg < 1 && ok(b, 'nap') && host.rnd() < 0.8 && go(b, 'nap')) return;
        if (tradeShare(a, bid) > 0.02 && o > 0 && ok(b, 'trade') && host.rnd() < 0.5 && go(b, 'trade')) return;
        if (o > 12 && host.blood(a) && host.blood(b) && ok(b, 'marriage') && host.rnd() < 0.35 && go(b, 'marriage')) return;
        if (near && r > 6 && agg > 0.7 && held < HOLD && !anyPact(a, bid) && ok(b, 'vassal') && host.rnd() < 0.3) { go(b, 'vassal'); return; }      // (a realm that rules itself is content with a few vassals)
        if (near && agg > 0.7 && o < -15 && r > 1.1 && !bound(a, b) && !(da.claim[bid * 4] > y) && host.knows(c, 'laws') && a.wealth > claimCost(a, b) * 2 && host.rnd() < 0.35) { claim(a, b); return; }
      }
    }
    // two realms become one: the lesser's land goes to the greater
    function union(big, small, text) { stats.unions++; host.event(big, text, true, small); host.absorb(big, small, 'joined to ' + nameOf(big)); }
    // a ruler by blood has died: where houses are joined by marriage, now and then one inherits the other (the simulation calls this
    // at a succession, saying how the throne passed: dynasty.js). Above all where the line failed; seldom where it held.
    const INHERIT = { extinct: 0.05, kin: 0.012, child: 0.0025, clear: 0.0015 };      // (on the whole what it was before dynasties, a flat 0.006: the war-and-peace probe counts the vassals and unions it makes)
    function heir(c, cv, how) {
      if (cv.player || !host.blood(cv)) return; const d = D(cv); const p = how ? INHERIT[how] || 0 : 0.006;
      for (const k in d.pact) { const o = civs[+k]; if (!o || !has(cv, o.id, 'marriage')) continue; if (!host.blood(o)) { dropPact(cv, o, 'marriage'); continue; }
        // (the player's house, joined to one whose line fails, has a claim on its throne: a cause for war, for some turns)
        if (o.player && (how === 'extinct' || how === 'kin')) { setClaim(o, cv.id * 4 + CLAIMS.claim, year() + CLAIM_TURNS * pace(o)); host.event(o, `The line of ${nameOf(cv)} has failed${how === 'kin' ? ' and a far kinsman sits its throne' : ''}: your house, joined to its own by marriage, has a claim on it`, true, cv); continue; }
        if (host.rnd() < p && !lordOf(cv) && !lordOf(o) && !host.atWar(cv, o.id)) { const big = host.cellsOf[o.id] >= host.cellsOf[c] ? o : cv, small = big === o ? cv : o; if (small.player || big.player) continue;
          const failed = how === 'extinct' || how === 'kin';      // (the throne of cv came open: its own line failed, or held by a thread)
          if (host.cellsOf[small.id] < host.cellsOf[big.id] * 0.35 && opinion(small, big) > 20) { stats.heirs++; union(big, small, small === cv && failed ? `The line of ${nameOf(cv)} fails, and ${host.ruler(big)}, of a house joined to it by marriage, inherits its lands` : `By the marriage of their houses, ${host.ruler(big)} inherits the crown of ${nameOf(small)}: its lands are joined to ${nameOf(big)}`); }
          else { count(stats.how, 'inherited'); subject(big, small, `${cap(host.ruler(big))} inherits the crown of ${nameOf(small)}${small === cv && failed ? ', whose line has failed' : ''}: two realms, one ruler`); } return; } }
    }

    // ----- a year -----
    // once, before the realms: who trades with whom and how much; what tribute and reparations change hands (by last year's incomes)
    function tick() {
      const links = host.links() || null;
      if (links !== linkList) indexLinks(links);      // (the market has drawn its links anew: every few years)
      // (those who pay: vassals and the beaten, a tenth or an eighth of what they earned of their own last year. `pays` marks them, so that nobody
      // else's record is opened; it is set when a realm comes to owe, cleared here when it no longer does, and counted afresh now and then)
      const y = year(); let np = 0;
      if ((y & 127) === 0) for (let c = 0; c < MAXC; c++) { const cv = civs[c], d = cv && cv.dip; pays[c] = d && (d.lord >= 0 || d.owing) ? 1 : 0; }
      for (let c = 0; c < MAXC; c++) { if (!pays[c]) continue; const cv = civs[c], d = cv && cv.dip; if (!d || (d.lord < 0 && !d.owing)) { pays[c] = 0; continue; } payers[np] = c; ownInc[np++] = Math.max(0, (cv.income || 0) - trIn[c] + trOut[c]); }
      trIn.fill(0); trOut.fill(0);
      for (let i = 0; i < np; i++) { const c = payers[i], cv = civs[c], d = cv.dip, inc = ownInc[i];
        if (d.lord >= 0) { const l = civs[d.lord]; if (!l) setLord(cv, -1); else { const amt = TRIBUTE * inc; trOut[c] += amt; trIn[l.id] += amt; } }
        if (d.owing) { let n = 0; for (const k in d.owes) { const o = civs[+k]; if (!o || d.owes[k] <= y) { delete d.owes[k]; continue; } n++; const amt = REPARATION * inc; trOut[c] += amt; trIn[o.id] += amt; } if (!n) d.owing = 0; } }
    }
    function step(c, cv) {
      const d = cv.dip || D(cv); const y = year();
      // every fourth year: conquests are forgotten and a realm's word mends (or its halo fades)
      if (((y + c) & 3) === 0 && (d.inf > 0 || d.rep !== 50)) {
        const P = pace(cv);
        if (d.inf > 0) { d.inf *= Math.pow(0.5, 4 / (3 * P)); if (d.inf < 0.05) d.inf = 0; }
        if (d.rep !== 50) { const by = Math.min(Math.abs(50 - d.rep), 20 / P); d.rep += d.rep < 50 ? by : -by; }      // (five points a turn)
      }
      // what has run its course is put away: pacts and claims (the record knows when its next one does, and is not looked through before)
      if (y >= d.next) {
        let next = NEVER;
        for (const k in d.pact) { const o = civs[+k], p = d.pact[k]; if (!o) { delete d.pact[k]; continue; } for (const kind in p) { if (p[kind] > y) { if (p[kind] < next) next = p[kind]; continue; } dropPact(cv, o, kind); if (cv.player || o.player) host.event(cv.player ? cv : o, `The ${PACT[kind].name.toLowerCase()} between ${nameOf(cv)} and ${nameOf(o)} has run its course`, false, cv.player ? o : cv); } }
        for (const k in d.claim) { if (d.claim[k] <= y) delete d.claim[k]; else if (d.claim[k] < next) next = d.claim[k]; }
        d.next = next;
      }
      if (cv.player) { if (d.offers.length) for (let i = d.offers.length - 1; i >= 0; i--) { const o = d.offers[i]; if (o.until > y && civs[o.from]) continue; d.offers.splice(i, 1); const a = civs[o.from]; if (a) turnDown(cv, a, o, true); } }
      else if (y >= d.think) { const P = pace(cv); d.think = y + Math.max(8, Math.round(P * (0.5 + 0.5 * host.rnd()))); think(c, cv); }      // (three times in two turns or so)
    }
    // a new realm: one cut from another is a rebel in its parent's eyes for a while; a number may have been a dead realm's
    function born(c, cv, from) {
      died(c); cv.dip = fresh(); trIn[c] = trOut[c] = 0; pays[c] = 0; ver[c]++; stale = true; const p = from >= 0 ? civs[from] : null;
      if (p) { remember(p, c, -20); remember(cv, from, -12); setClaim(p, c * 4 + 1, year() + CLAIM_TURNS * pace(p)); }
    }
    // a realm is gone: nobody is bound to it, owes it or follows it any longer
    function died(id) {
      stale = true; ver[id]++;
      for (let k = 0; k < MAXC; k++) { const x = civs[k]; if (!x || !x.dip || k === id) continue; const d = x.dip; delete d.pact[id]; delete d.mem[id]; delete d.goal[id]; delete d.side[id]; delete d.owes[id]; delete d.ban[id];
        for (let q = 0; q < 4; q++) delete d.claim[id * 4 + q]; for (let q = 0; q < 8; q++) delete d.ask[id * 8 + q]; if (d.lord === id) d.lord = -1; ver[k]++; for (const kk in d.side) if (d.side[kk] === id) delete d.side[kk];
        if (d.offers.length) d.offers = d.offers.filter((o) => o.from !== id && o.vs !== id); }
    }
    // after a load: every realm's record made whole (a world saved before this has none: everyone begins with a clean slate)
    function wake(c, cv) {
      const had = !!cv.dip; const d = D(cv), f = fresh(); for (const k in f) if (d[k] === undefined) d[k] = f[k];
      for (const k in d.pact) if (!civs[+k]) delete d.pact[k]; if (d.lord >= 0 && !civs[d.lord]) d.lord = -1; d.offers = d.offers.filter((o) => civs[o.from]); d.owing = 0; for (const _ in d.owes) { d.owing = 1; break; } pays[c] = d.lord >= 0 || d.owing ? 1 : 0; d.next = -1e9; if (!(d.think > -1e12)) d.think = -1e9; stale = true; ver[c]++; return had;      // (its record is looked through once, to find what runs out next)
    }
    // for the screen: until when a holds a reason of this kind against b ('claim', 'land', 'refused', 'rebel'), or any at all; and when it last asked b for something
    const CLAIMS = { claim: 0, land: 1, refused: 2, rebel: 3 };
    const claimUntil = (a, bid, what) => { const v = D(a).claim[bid * 4 + CLAIMS[what]]; return v === undefined ? -Infinity : v; };
    const holds = (a, bid) => { const q = D(a).claim; let u = -Infinity; for (let k = 0; k < 4; k++) { const v = q[bid * 4 + k]; if (v !== undefined && v > u) u = v; } return u; };
    const askedAt = (a, bid, kind) => D(a).ask[bid * 8 + ASK[kind]];
    // where b stands with p, for the map and the lists: one of STAND's keys
    function standing(p, b) {
      if (!p || !b) return 'far'; if (p === b) return 'self'; if (host.atWar(p, b.id)) return 'war'; if (D(b).lord === p.id) return 'vassal'; if (D(p).lord === b.id) return 'lord';
      if (has(p, b.id, 'alliance') || has(p, b.id, 'defence') || has(p, b.id, 'marriage')) return 'ally'; const o = opinion(b, p);
      return o >= 12 || has(p, b.id, 'nap') || has(p, b.id, 'trade') ? (o < -12 ? 'wary' : 'friend') : o >= -12 ? 'neutral' : o >= -35 ? 'wary' : 'hostile';
    }
    return { stats, D, tick, step, born, died, wake, heir, reach, opinion, reasons, judge, cannot, propose, answer, breakPact, release, rebel, annex, cannotJoin, gift, giftWorth, claim, claimCost, embargo, causes, warCost, cannotFight, declare,
      abandon, score, termsFor, wouldEnd, cannotSue, sue, conclude, fell, warsEnd, warWith, think, has, pactOf, anyPact, bound, friends, lordOf, vassalsOf, threatTo, standing, memOf, remember, tradeShare, trIn, trOut, touches, ratio, seal, subject,
      union, join, closed, agreed, termOf, ver, partnersOf, claimUntil, holds, askedAt, grantClaim, CLAIMS };
  }
  return { PACE, PACTS, PACT, VASSAL, OPENS, CAUSES, TERMS, TERM_TEXT, RANK, MOODS, moodOf, STAND, TRIBUTE, REPARATION, REPARATION_TURNS, CLAIM_TURNS, UNION_TURNS, UNJUST_STAB, UNJUST_REP, creedGap, create };
})();
