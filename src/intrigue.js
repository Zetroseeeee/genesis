// Holocene intrigue (classic script; exposes window.INTRIGUE): spies and schemes. Every realm that writes keeps agents abroad, and
// its network is as good as what it knows of letters, envoys and the post (and, later, the telegraph, the wireless and the machines
// that listen), what its laws allow and what its ruler is like. A realm may set its agents on another: to steal its learning, to
// sow discord among its great families, to forge a claim to one of its provinces, to set back its works, to stir up a rising, to
// murder its heir. A scheme takes a turn or two and costs coin; it succeeds, fails, or is found out on the way. Found out, it is
// remembered: the victim thinks the worse of the schemer, the schemer's word is worth less abroad, and where the scheme was an act
// of war the victim has a reason for one for three turns. The autopilot's realms scheme against their rivals now and then (the
// more so under a ruler who likes such things), and the player hears of the agents his own people catch. What a scheme does is
// measured to the realm it falls on (a discovery, a share of stability, a work's years), so the world's numbers move as little
// as its wars allow.
//   INTRIGUE.create(h) -> { step, begin, cancel, cannot, oddsOf, view, gone, caughtFrom, save, load, ... } for one world; the host h
//   (sim.js) does the deeds: knows, knowName, netLaws, reach, touches, heirOf, worksOf, knowsMore, angriest, unitOf, remember, word,
//   log, tell, steal, discord, claim, sabotage, rise, murderHeir, rivals, atWar, cells, name, detail.
window.INTRIGUE = (function () {
  'use strict';
  // the schemes: what they need to be known, what they cost (in the coin unit of story.js, by the schemer's income), how many turns
  // they take, how likely to succeed and to be found out against an equal network, how much the victim minds when it finds out, and
  // whether it is an act of war (found out, the victim has a reason for one)
  const SCHEMES = [
    { key: 'learn', name: 'Steal their learning', need: 'writing', cost: 1, turns: 2, odds: 0.55, risk: 0.22, mind: 25, war: false, at: 'copying the letters of its scholars',
      text: 'Agents copy what their scholars know: a discovery of theirs your people lack, or, failing that, years of their learning.' },
    { key: 'discord', name: 'Sow discord', need: 'envoys', cost: 0.6, turns: 1, odds: 0.6, risk: 0.28, mind: 30, war: true, at: 'carrying gold to its great families',
      text: 'Rumours, letters and gold among their great families: their realm grows restless, and its most powerful estate angry.' },
    { key: 'claim', name: 'Forge a claim', need: 'charters', cost: 0.7, turns: 1.5, odds: 0.55, risk: 0.32, mind: 30, war: false, at: 'forging charters in its archives',
      text: 'Old charters are found, or made, that give your house a right to their borderland: a reason for war for three turns.' },
    { key: 'sabotage', name: 'Set back their works', need: 'engineering', cost: 0.7, turns: 1, odds: 0.55, risk: 0.3, mind: 25, war: false, at: 'with tinder among its works',
      text: 'A fire in the scaffolding, a bribed foreman, a ship of stone sunk in the harbour: their greatest work under way is set back by half its time.' },
    { key: 'rising', name: 'Stir up a rising', need: 'printing', cost: 1.2, turns: 2, odds: 0.4, risk: 0.4, mind: 45, war: true, at: 'with arms for its malcontents',
      text: 'Arms, money and pamphlets for their angriest estate. If it is angry enough, it rises.' },
    { key: 'murder', name: 'Murder their heir', need: 'envoys', cost: 1.5, turns: 1.5, odds: 0.34, risk: 0.5, mind: 80, war: true, at: 'with poison meant for its heir',
      text: 'A cup of wine, a hunting accident, a fever that came too quickly. Their crown passes to someone else.' },
  ];
  const SK = {}; SCHEMES.forEach((s, i) => { s.id = i; SK[s.key] = s; });
  // what a network is made of: each of these known adds one to it
  const NET = ['writing', 'envoys', 'letters', 'embassies', 'telegraph', 'radio', 'computers', 'networks'];
  const TRAIT_NET = { tyrant: [1, 'A ruler who trusts nobody'], scholar: [0.5, 'A ruler who reads every letter'], merchant: [0.5, 'A ruler with friends in every port'] };
  const PACE = [200, 100, 50, 50, 40, 20, 10, 5, 5];
  const WAR_TURNS = 3;      // (how long a scheme found out is a reason for war)
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function create(h) {
    const civs = h.civs, MAXC = h.MAXC, year = h.year;
    const stats = { begun: 0, done: 0, failed: 0, caught: 0, by: {}, out: {}, ms: 0 };
    const news = [];      // for the player: { kind: 'done' | 'failed' | 'caught' | 'foiled' | 'struck', key, on, by, year, text }
    let rs = ((h.seed || 1) ^ 0x51ed270b) >>> 0;
    const rnd = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const turnOf = (cv) => PACE[Math.max(0, Math.min(8, cv.era | 0))];
    // a realm's own record: the scheme its agents are on (s), when it next thinks of one (the autopilot), the foreign agents it caught
    const I = (cv) => cv.intrigue || (cv.intrigue = { s: null, next: year() + Math.round(turnOf(cv) * (2 + rnd() * 4)), found: [] });
    const count = (key, k) => { const o = stats.out[key] || (stats.out[key] = [0, 0, 0]); o[k]++; };
    // how good a realm's network is: what it knows of letters, envoys and the post, its laws, its ruler
    function partsOf(cv) {
      const out = []; for (const k of NET) if (h.knows(cv.id, k)) out.push([h.knowName(k), 1]);
      const t = cv.ruler && TRAIT_NET[cv.ruler.trait]; if (t) out.push([t[1], t[0]]);
      for (const p of h.netLaws(cv)) out.push(p);
      return out;
    }
    function netOf(cv) { let n = 0; for (const p of partsOf(cv)) n += p[1]; return n; }
    const costOf = (a, key) => Math.round(SK[key].cost * h.unitOf(a));
    // why a scheme cannot be begun against a realm, or nothing
    function cannot(a, b, key) {
      const S = SK[key]; if (!S) return 'No such scheme'; if (!a || !b || a === b) return 'Nobody to scheme against';
      if (!h.knows(a.id, S.need)) return `Needs ${h.knowName(S.need)}`;
      if (I(a).s) return I(a).s.on === b.id ? 'Your agents are at work there already' : 'Your agents are busy elsewhere';
      if (!h.reach(a, b)) return 'Beyond the reach of your agents';
      if (key === 'murder' && !h.heirOf(b)) return 'No heir of theirs to strike at';
      if (key === 'sabotage' && !h.worksOf(b).length) return 'They are building nothing';
      if (key === 'learn' && !h.knowsMore(b, a)) return 'They know nothing your people could learn';
      if (key === 'rising' && h.angriest(b) < 0) return 'Nobody there is angry enough';
      if (key === 'claim' && !h.touches(a, b)) return 'You share no border';
      if (a.wealth < costOf(a, key)) return `Needs ${costOf(a, key)} coin`;
      return null;
    }
    // how likely to succeed and to be found out: the scheme's own, then the two networks against each other, a shared border
    function oddsOf(a, b, key) {
      const S = SK[key], d = netOf(a) - netOf(b), near = h.touches(a, b) ? 1 : 0;
      const odds = clamp(S.odds * (1 + 0.18 * d) + 0.06 * near, 0.05, 0.9), risk = clamp(S.risk * (1 - 0.15 * d) - 0.04 * near, 0.04, 0.9);
      return { odds, risk, years: Math.max(2, Math.round(S.turns * turnOf(a))), cost: costOf(a, key) };
    }
    // a scheme begun: paid at once, under way for its years; every year a chance that it is found out
    function begin(a, b, key) {
      const why = cannot(a, b, key); if (why) return why;
      const o = oddsOf(a, b, key), yr = year(); a.wealth -= o.cost;
      I(a).s = { k: key, on: b.id, from: yr, until: yr + o.years, odds: o.odds, risk: o.risk, cost: o.cost, name: h.name(b) };
      stats.begun++; stats.by[key] = (stats.by[key] || 0) + 1;
      return null;
    }
    function cancel(a) { const g = I(a); if (!g.s) return 'Nothing under way'; g.s = null; return null; }
    // found out: the victim remembers it, the schemer's word is worth less; the victim keeps the record (a reason for war, if it was an act of one)
    function caught(a, b, s, yr) {
      const S = SK[s.k]; stats.caught++; count(s.k, 2); I(a).s = null;
      h.remember(b, a.id, -S.mind); h.word(a, -Math.round(S.mind / 6));
      const F = I(b).found; F.push([yr, a.id, s.k]); if (F.length > 8) F.shift();
      if (b.player || a.player || h.cells(a.id) + h.cells(b.id) > 160) h.log(b, `Agents of ${h.name(a)} are caught in ${h.name(b)} ${S.at}`, b.player || a.player);
      if (a.player) { news.push({ kind: 'caught', key: s.k, on: b.id, year: yr, text: `Your agents are caught in ${h.name(b)}` }); if (h.tell) h.tell(a, 'spies_ours', { o: b.id, k: s.k }); }
      if (b.player) { news.push({ kind: 'foiled', key: s.k, by: a.id, year: yr, text: `Agents of ${h.name(a)} are caught in your realm` }); if (h.tell) h.tell(b, 'spies', Object.assign({ o: a.id, k: s.k }, h.detail ? h.detail(b, s.k) : {})); }
    }
    // the scheme comes to its end: it worked or it did not
    function resolve(a, b, s, yr) {
      I(a).s = null; const S = SK[s.k];
      if (rnd() >= s.odds) { stats.failed++; count(s.k, 1); if (a.player) news.push({ kind: 'failed', key: s.k, on: b.id, year: yr, text: `${S.name}: it came to nothing in ${h.name(b)}` }); return; }
      stats.done++; count(s.k, 0); let what = '', felt = '';
      switch (s.k) {
        case 'learn': what = h.steal(a, b); felt = 'the secrets of your scholars are known abroad'; break;
        case 'discord': { const e = h.discord(b); what = `its ${e} are angry, and the realm restless`; felt = `your ${e} are angry, and nobody knows who stirred them`; break; }
        case 'claim': h.claim(a, b); what = 'a claim to its borderland'; felt = ''; break;
        case 'sabotage': what = h.sabotage(b); felt = what; break;
        case 'rising': what = h.rise(b) ? 'they rise' : 'unrest, but no rising'; felt = ''; break;
        case 'murder': { const p = h.murderHeir(b); what = p ? `${p} is dead` : 'the heir lived'; felt = p ? `${p} dies suddenly, and poison is whispered` : ''; break; }
      }
      if (a.player) news.push({ kind: 'done', key: s.k, on: b.id, year: yr, text: `${S.name} in ${h.name(b)}: ${what}` });
      if (b.player && felt) news.push({ kind: 'struck', key: s.k, year: yr, text: `Foreign agents at work: ${felt}` });
      if (a.player || h.cells(a.id) >= 120) h.log(a, `The agents of ${h.name(a)} ${s.k === 'learn' ? 'bring home the learning of' : s.k === 'claim' ? 'forge a claim against' : s.k === 'murder' ? 'strike at the house of' : 'work against'} ${h.name(b)}${a.player ? ': ' + what : ''}`, a.player);
    }
    // the autopilot: now and then a realm sets its agents on a rival (at war with it, holding a claim against it, or hating it)
    function think(cv, yr) {
      const g = I(cv); g.next = yr + Math.round(turnOf(cv) * (2 + rnd() * 4));
      if (h.cells(cv.id) < 20 || !h.knows(cv.id, 'writing')) return;
      const t = cv.ruler ? cv.ruler.trait : ''; if (rnd() > (t === 'tyrant' ? 0.9 : t === 'conqueror' ? 0.6 : t === 'pious' ? 0.25 : 0.45)) return;
      const rivals = h.rivals(cv); if (!rivals.length) return; const b = rivals[Math.floor(rnd() * rivals.length)];
      const atWar = h.atWar(cv, b), behind = h.knowsMore(b, cv);
      const wants = [];
      if (behind) wants.push('learn', 'learn'); if (atWar) wants.push('discord', 'sabotage', 'rising'); else wants.push('claim', 'discord');
      if (t === 'tyrant' || t === 'conqueror') wants.push('murder'); if (h.worksOf(b).length) wants.push('sabotage');
      for (let k = 0; k < 4 && wants.length; k++) { const i = Math.floor(rnd() * wants.length), key = wants[i]; if (!cannot(cv, b, key) && oddsOf(cv, b, key).odds >= 0.3) { begin(cv, b, key); return; } wants.splice(i, 1); }
    }
    // ----- a year -----
    function step() {
      const t0 = performance.now(), yr = year();
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; if (!cv) continue; const g = I(cv);
        if (g.s) {
          const s = g.s, b = civs[s.on]; if (!b) { g.s = null; continue; }
          const years = Math.max(1, s.until - s.from); const pYear = 1 - Math.pow(1 - s.risk, 1 / years);      // (found out within its years as often as its risk says)
          if (rnd() < pYear) { caught(cv, b, s, yr); continue; }
          if (yr >= s.until) resolve(cv, b, s, yr);
          continue;
        }
        if (!cv.player && yr >= g.next) think(cv, yr);
      }
      stats.ms = performance.now() - t0;
    }
    // a realm is gone: whatever was aimed at it comes to nothing (its number will be given to a realm born later)
    function gone(id) { for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (cv && cv.intrigue && cv.intrigue.s && cv.intrigue.s.on === id) cv.intrigue.s = null; } }
    // the last year a caught b's agents at an act of war (diplo.js: a reason for war for three turns), or -Infinity
    function caughtFrom(a, b) {
      const F = a.intrigue && a.intrigue.found; if (!F) return -Infinity; let y = -Infinity;
      for (const [yr, by, k] of F) if (by === b.id && SK[k] && SK[k].war && yr > y) y = yr;
      return y > -Infinity && year() - y <= WAR_TURNS * turnOf(a) ? y : -Infinity;
    }
    // ----- what the player sees -----
    function view(c, bid) {
      const a = civs[c]; if (!a) return null; const g = I(a), b = bid >= 0 ? civs[bid] : null, yr = year();
      const s = g.s && civs[g.s.on] ? Object.assign({}, g.s, { key: g.s.k, scheme: SK[g.s.k].name, p: clamp((yr - g.s.from) / Math.max(1, g.s.until - g.s.from), 0, 1), left: Math.max(0, g.s.until - yr), realm: h.name(civs[g.s.on]) }) : null;
      return { net: netOf(a), parts: partsOf(a), s,
        found: g.found.slice().reverse().map(([y, o, k]) => ({ year: y, by: o, name: civs[o] ? h.name(civs[o]) : 'a realm that is gone', scheme: SK[k] ? SK[k].name : k, war: !!(SK[k] && SK[k].war), open: civs[o] && SK[k] && SK[k].war && yr - y <= WAR_TURNS * turnOf(a) ? y + WAR_TURNS * turnOf(a) : 0 })),
        schemes: b ? SCHEMES.map((S) => Object.assign({ key: S.key, name: S.name, text: S.text, need: S.need, why: cannot(a, b, S.key), war: S.war, mind: S.mind }, oddsOf(a, b, S.key))) : [],
        theirs: b ? netOf(b) : 0 };
    }
    function save() { return { v: 1, rs, stats: { begun: stats.begun, done: stats.done, failed: stats.failed, caught: stats.caught, by: stats.by, out: stats.out } }; }
    function load(s) { if (!s || s.v !== 1) return false; if (s.rs !== undefined) rs = s.rs >>> 0; if (s.stats) Object.assign(stats, s.stats); return true; }
    return { step, begin, cancel, cannot, oddsOf, costOf, netOf, partsOf, view, gone, caughtFrom, save, load, news, stats, I };
  }
  return { create, SCHEMES, SK, NET, WAR_TURNS };
})();
