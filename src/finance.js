// GENESIS finance: a realm's coin and what it is worth, its debts and who holds them, the banking houses and the chartered
// companies of the world, and the panics that run through them. Pure data, no drawing (the Treasury is a tab of the market
// screen: bank.js). Classic script; exposes window.FINANCE.
//
// Credit. From the tribute lists a realm can borrow against its income (the temples lend; from coinage the moneylenders;
// from banking the houses; from the exchange the bondholders), as much as would take four tenths of its income in interest
// at the rate it pays (LIMIT), times its standing; the rate is its age's (BASE) times what lenders make of it (its debts
// against its income, its standing, war, unrest, a panic) less what it knows of money (CUT). It pays the interest every year
// out of its income and repays when it can. Who lends: banking houses first - its own, then those of the realms it touches
// or trades with - and what they cannot, its own lenders, a quarter dearer. A realm that cannot pay defaults: its debts are
// wiped, its lenders' losses are theirs, its standing is gone for some turns, and the realms whose houses it ruined
// remember. A banking house is founded in a rich trading city of a realm that knows banking, named for its family; it
// lends its capital out several times over (LEVER), grows with the interest and pays its realm a share, and fails when its
// borrowers default on more than it has, or a panic runs on it.
// The coin. A realm that knows coinage strikes a coin, named in its people's tongue. A ruler short of money debases it: a
// windfall now, then the prices rise (dear: real taxes fall, people live worse, lenders trust the coin less) until it is
// forgotten or the coin restored; from central banking he prints money instead.
// Companies. From the chartered companies a harbour realm's merchants found companies for the far trade; they pay their
// holders out of the trade's returns, their shares rise and fall with the returns and with the mania of the hour, and a
// bubble bursts. The player may found one, and buy and sell the shares of any.
// Panics. A house's fall, a company's crash or a great default runs to the realms that lent to or borrowed from it and to
// its trading partners: credit dearer and scarcer, trade less, unrest, more houses failing; it fades in a turn or so, in
// half that where there is a central bank.
// The autopilot: a court spends what it hoards beyond a turn and a half of its income (palaces, feasts, retinues), a realm
// at war pays for it (WAR), borrows when its treasury runs low, repays when it is flush, debases and at last defaults when
// nobody will lend. Everything is paced by the turn (rule.js's PACE). The module throws its own dice.
(function () {
  'use strict';
  const TURN = (window.RULE && window.RULE.PACE) || [200, 100, 50, 50, 40, 20, 10, 5, 5];
  // the rate of interest of each age, a year (Mesopotamian silver at a fifth; the Italian banks a tenth; consols at a twentieth)
  const BASE = [0, 0.2, 0.16, 0.12, 0.1, 0.07, 0.05, 0.045, 0.035];
  // what knowing money makes of the rate (by discovery)
  const CUT = { coinage: 0.9, banking: 0.8, bourse: 0.85, centralbank: 0.8, finance: 0.9 };
  const LIMIT = 0.4;        // (a realm may owe what would take this share of its income in interest)
  const LEVER = 4;          // (a house lends out its capital so many times over)
  const HOME = 1.25;        // (its own lenders, beside a house: so much dearer)
  const HOARD = 1;         // (the autopilot's court spends what it holds beyond a turn of income: half of it in half a turn)
  const WAR = 0.8, WAR2 = 0.5;      // (an autopilot's war costs it this much of its income a year, and each war beside the first so much more)
  const MAX_YEARS = 8;      // (nobody lends a realm more than so many years of its income)
  const DEBASE = 0.85, DEAR = 0.15;      // (a debasement takes the coin to this much of its worth, and the prices up by this)
  // what fades, in years: the prices settle after a debasement (halfway in a turn, between eight years and forty), a panic
  // passes (halfway in three years; half that with a central bank), a realm's standing comes back after a default (halfway in
  // three turns, between twenty years and a hundred and twenty)
  const dearHalf = (T) => Math.max(8, Math.min(40, T)), panicHalf = (c, knowsCB) => (knowsCB ? 1.5 : 3), standHalf = (T) => Math.max(20, Math.min(120, 3 * T));
  const MAXH = 160, MAXCO = 120;

  // the forms of the names of houses and companies, by age ({F} the family, {C} the city, {R} the realm, {D} a direction, {S} a sea)
  const HOUSE_NAMES = [[4, ['the House of {F}', 'the {F} of {C}', 'the Bank of the {F}']], [6, ['{F} Brothers', '{F} and Sons', 'the {C} Bank', 'the House of {F}']], [9, ['the Bank of {C}', '{F} and Company', 'the {R} Bank', 'the {C} Savings Bank', 'the Union Bank of {C}']]];
  const COMPANY_NAMES = ['the {D} Company of {C}', 'the {C} Company of the {S}', 'the Company of Merchants of {C}', 'the {D} Trading Company', 'the {S} Company', 'the {C} Adventurers'];
  const DIRS = ['Eastern', 'Western', 'Southern', 'Northern', 'Far', 'Levant', 'Ocean'];
  const SEAS = ['Spice Islands', 'Southern Seas', 'Western Isles', 'Silk Coast', 'Gold Coast', 'Ivory Shore', 'Pearl Gulf', 'Amber Sea'];
  const COIN_END = ['a', 'o', 'el', 'ar', 'in', 'um', 'ek', 'il'];

  function create(h) {
    const { civs, MAXC, owner } = h;
    const year = () => h.year();
    const fine = new Float32Array(MAXC).fill(1);      // the coin's worth (1: full weight)
    const dear = new Float32Array(MAXC);              // how far prices have run ahead of incomes (from debasing)
    const debt = new Float64Array(MAXC);              // what it owes
    const rateOf = new Float32Array(MAXC);            // the rate it pays now
    const stand = new Float32Array(MAXC).fill(1);     // its standing with lenders, 0 .. 1
    const lastDef = new Float64Array(MAXC).fill(-1e9);      // when it last defaulted
    const panic = new Float32Array(MAXC);             // a panic in its markets, 0 .. 1
    const paid = new Float32Array(MAXC), got = new Float32Array(MAXC);      // interest paid and received last year (and dividends)
    const coinName = new Array(MAXC).fill('');
    const owes = new Array(MAXC).fill(null);          // [[house id (0: its own lenders), amount], ...]
    const houses = [];                                // { id, name, fam, at, c, born, cap, lent, fail (a flag), failAt, borrowers }
    const companies = [];                             // { id, name, c, at, born, cap, val, fund, heat, ret, hist, hold: { realm: shares }, crash (the year of the last, -1e9), gone (a flag), goneAt }
    const crises = [];                                // { year, c, what, text }
    let nextH = 1, nextCo = 1;
    const stats = { borrowed: 0, repaid: 0, defaults: 0, debased: 0, restored: 0, houses: 0, failed: 0, companies: 0, crashes: 0, panics: 0, ms: 0 };
    const news = [];

    // ---------- the module's own dice ----------
    let rs = ((h.seed || 1) ^ 0x6c8e9cf5) >>> 0;
    const rnd = () => { rs += 0x6D2B79F5; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const eraOf = (cv) => Math.min(8, Math.max(0, cv ? cv.era | 0 : 0));
    const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const city = (cell) => (cell >= 0 && h.cellName.get(cell)) || 'the city';
    function tongueOf(cv, cell) {
      const P = h.people; if (P) { const p = P.list[(cell >= 0 && P.ppl[cell]) || (cv ? P.ruling[cv.id] : 0)]; if (p && p.t) return p.t; }
      const S = h.STYLES[cv ? cv.style : 0] || h.STYLES[0]; return S.syl ? { syl: S.syl } : { on: S.on, vow: S.vow, end: S.end };
    }
    function nameIn(t, minS, maxS) {
      const n = minS + Math.floor(rnd() * (maxS - minS + 1));
      if (t.syl) { let s = ''; for (let i = 0; i < n; i++) s += pick(t.syl); return cap1(s); }
      let s = ''; for (let i = 0; i < n; i++) s += pick(t.on) + pick(t.vow); s += rnd() < 0.85 ? pick(t.end) : pick(t.on);
      return cap1(s.replace(/(.)\1\1/g, '$1$1'));
    }

    // ---------- what a realm can borrow, and at what rate ----------
    const knows = (c, k) => h.knows(c, k);
    const canBorrow = (c) => !!civs[c] && knows(c, 'taxes');
    const grossOf = (cv) => Math.max(1e-3, cv.gross || Math.max(0, cv.income || 0));
    function cutOf(c) { let f = 1; for (const k in CUT) if (knows(c, k)) f *= CUT[k]; return f; }
    // the rate lenders ask of a realm now: its age's, its load and standing, war, unrest, a panic; what it knows of money
    function rate(c, extra) {
      const cv = civs[c]; if (!cv) return 0; const e = eraOf(cv); const b = BASE[e] || BASE[1]; const g = grossOf(cv);
      const load = (debt[c] + (extra || 0)) * b / (LIMIT * g);      // (how much of what it may owe it owes: 1 at the limit)
      const risk = 1 + 1.5 * Math.max(0, load - 0.5) + 2 * (1 - stand[c]) + (h.warsN(cv) ? 0.25 : 0) + (cv.stability < 0.4 ? 0.3 : 0) + panic[c] + 0.5 * (1 - fine[c]);
      return Math.min(0.6, b * risk * cutOf(c));
    }
    // how much more it may borrow
    function room(c) { const cv = civs[c]; if (!cv || !canBorrow(c)) return 0; const b = BASE[eraOf(cv)] || BASE[1]; return Math.max(0, Math.min(MAX_YEARS, LIMIT / (b * cutOf(c))) * grossOf(cv) * stand[c] * (1 - 0.6 * panic[c]) - debt[c]); }
    // those who would lend to a realm: its own houses, then those of the realms it touches or trades with
    function lendersOf(c) {
      const near = new Set([c]); for (const b of h.near(c) || []) near.add(b); for (const b of h.partners(c) || []) near.add(b);
      return houses.filter((x) => !x.fail && x.c >= 0 && near.has(x.c) && x.cap * LEVER - x.lent > 1).sort((a, b) => (a.c === c ? -1 : 0) - (b.c === c ? -1 : 0) || (b.cap * LEVER - b.lent) - (a.cap * LEVER - a.lent));
    }
    function borrow(c, amt) {
      const cv = civs[c]; if (!cv || !(amt > 0)) return 0; amt = Math.min(amt, room(c)); if (!(amt > 1e-6)) return 0;
      let left = amt; const list = owes[c] || (owes[c] = []);
      for (const x of lendersOf(c)) { if (left <= 1e-9) break; const q = Math.min(left, x.cap * LEVER - x.lent); if (q <= 0) continue; x.lent += q; left -= q; const o = list.find((y) => y[0] === x.id); if (o) o[1] += q; else list.push([x.id, q]); x.borrowers = (x.borrowers || 0) + 1; }
      if (left > 1e-9) { const o = list.find((y) => y[0] === 0); if (o) o[1] += left; else list.push([0, left]); }
      debt[c] += amt; cv.wealth += amt; stats.borrowed += amt; rateOf[c] = rate(c); return amt;
    }
    function repay(c, amt) {
      const cv = civs[c]; if (!cv) return 0; amt = Math.min(amt, debt[c], Math.max(0, cv.wealth)); if (!(amt > 1e-9)) return 0;
      // (the dearest first: its own lenders, then the houses)
      const list = owes[c] || []; let left = amt; list.sort((a, b) => (a[0] === 0 ? -1 : 0) - (b[0] === 0 ? -1 : 0));
      for (const o of list) { if (left <= 1e-9) break; const q = Math.min(left, o[1]); o[1] -= q; left -= q; if (o[0]) { const x = houseOf(o[0]); if (x) x.lent = Math.max(0, x.lent - q); } }
      owes[c] = list.filter((o) => o[1] > 1e-6); if (!owes[c].length) owes[c] = null;
      debt[c] = Math.max(0, debt[c] - amt); if (debt[c] < 1e-6) debt[c] = 0; cv.wealth -= amt; stats.repaid += amt; return amt;
    }
    const houseOf = (id) => houses.find((x) => x.id === id) || null;
    // a realm defaults: its debts are wiped; what its houses lent is lost; its standing goes; those it ruined remember
    function defaultOn(c, why) {
      const cv = civs[c]; if (!cv || !(debt[c] > 0)) return null; const yr = year(); const lost = debt[c]; const ruined = new Set();
      for (const o of owes[c] || []) { if (!o[0]) continue; const x = houseOf(o[0]); if (!x) continue; x.lent = Math.max(0, x.lent - o[1]); x.cap -= o[1] / LEVER * 1.6; if (x.c >= 0 && x.c !== c) ruined.add(x.c); }      // (a loan lost costs a house more than its share of the house's money: the depositors run)
      owes[c] = null; debt[c] = 0; stand[c] = 0.1; lastDef[c] = yr; stats.defaults++;
      if (h.remember) for (const b of ruined) if (civs[b]) h.remember(civs[b], c, -25);
      news.push({ kind: 'default', c, amt: lost, why: why || '', year: yr, ruined: [...ruined] });
      for (const b of ruined) shake(b, 0.3, `${h.nameOf(cv)} defaults on its debts`);
      shake(c, 0.25, ''); return lost;
    }
    // a panic: in a realm's markets, and some of it in its partners'
    function shake(c, by, text, spread) {
      if (!civs[c]) return; const was = panic[c]; panic[c] = Math.min(1, panic[c] + by);
      if (by >= 0.25 && was < 0.2) { stats.panics++; const x = { year: year(), c, what: text || 'A panic', text: text || '' }; crises.push(x); if (crises.length > 60) crises.splice(0, crises.length - 60); news.push({ kind: 'panic', c, text: text || '', year: year() }); }
      if (spread !== false && by >= 0.2) for (const b of h.partners(c) || []) if (b !== c && civs[b]) panic[b] = Math.min(1, panic[b] + by * 0.35);
    }

    // ---------- the coin ----------
    function mint(c) { const cv = civs[c]; if (!cv || coinName[c]) return; const t = tongueOf(cv, cv.capital); let n = nameIn(t, 1, 2).toLowerCase(); if (n.length < 4) n += pick(COIN_END); coinName[c] = n; }
    const coin = (c) => coinName[c] || '';
    // a debasement (or, from central banking, money printed): coin now, dearer prices and less trust after
    function debase(c) {
      const cv = civs[c]; if (!cv || !knows(c, 'coinage')) return 0; if (fine[c] < 0.3) return 0; const g = grossOf(cv), T = TURN[eraOf(cv)];
      const gain = (1 - DEBASE) * g * Math.min(T, 20) * 0.8; fine[c] *= DEBASE; dear[c] = Math.min(1.5, dear[c] + DEAR); stand[c] = Math.max(0.1, stand[c] - 0.08);
      cv.wealth += gain; stats.debased++; news.push({ kind: 'debase', c, gain, year: year(), printed: knows(c, 'centralbank') }); return gain;
    }
    const restoreCost = (c) => { const cv = civs[c]; if (!cv) return 0; return Math.round((1 - fine[c]) * grossOf(cv) * Math.min(TURN[eraOf(cv)], 20) * 0.9); };
    function restore(c) { const cv = civs[c]; if (!cv || fine[c] >= 0.999) return 'The coin is whole'; const cost = restoreCost(c); if (cv.wealth < cost) return `Needs ${cost} coin`; cv.wealth -= cost; fine[c] = 1; dear[c] *= 0.5; stats.restored++; news.push({ kind: 'restore', c, year: year() }); return null; }

    // ---------- banking houses ----------
    function found(c, at, opts) {
      const cv = civs[c]; if (!cv) return null; const e = eraOf(cv); const t = tongueOf(cv, at); const fam = nameIn(t, 2, 3);
      const forms = (HOUSE_NAMES.find((f) => e <= f[0]) || HOUSE_NAMES[HOUSE_NAMES.length - 1])[1];
      const name = ((opts && opts.name) || pick(forms)).replace('{F}', fam).replace('{C}', city(at)).replace('{R}', cv.name);
      const x = { id: nextH++, name, fam, at, c, born: year(), cap: (opts && opts.cap) || grossOf(cv) * 2, lent: 0, fail: false, failAt: 0, borrowers: 0 };
      houses.push(x); stats.houses++; news.push({ kind: 'house', h: x.id, c, year: year() });
      if (houses.length > MAXH) { const old = houses.findIndex((y) => y.fail); if (old >= 0) houses.splice(old, 1); }
      return x;
    }
    function failHouse(x, why) {
      if (x.fail) return; x.fail = true; x.failAt = year(); stats.failed++; const c = x.c;
      // (what it had lent is called in at once, or written off: its borrowers must find other lenders)
      for (let b = 0; b < MAXC; b++) { const list = owes[b]; if (!list) continue; let moved = 0; const keep = []; for (const o of list) { if (o[0] === x.id) moved += o[1]; else keep.push(o); } if (!moved) continue; const dom = keep.find((o) => o[0] === 0); if (dom) dom[1] += moved; else keep.push([0, moved]); owes[b] = keep; panic[b] = Math.min(1, panic[b] + 0.15); }
      x.lent = 0; news.push({ kind: 'fail', h: x.id, c, why: why || '', year: year() });
      if (c >= 0) shake(c, 0.5, `${x.name} fails`);
    }

    // ---------- companies ----------
    function charter(c, opts) {
      const cv = civs[c]; if (!cv) return null; const at = (opts && opts.at >= 0) ? opts.at : (h.portOf ? h.portOf(c) : cv.capital); if (at < 0) return null;
      const name = ((opts && opts.name) || pick(COMPANY_NAMES)).replace('{D}', pick(DIRS)).replace('{S}', pick(SEAS)).replace('{C}', city(at));
      const capital = (opts && opts.cap) || Math.max(20, grossOf(cv) * 1.5);
      const co = { id: nextCo++, name, c, at, born: year(), cap: capital, val: 1, fund: 1, heat: 0, ret: 0, hist: [1], hold: { [c]: 1 }, crash: -1e9, gone: false, goneAt: 0 };
      companies.push(co); stats.companies++; news.push({ kind: 'company', co: co.id, c, year: year() });
      if (companies.length > MAXCO) { const old = companies.findIndex((y) => y.gone); if (old >= 0) companies.splice(old, 1); }
      return co;
    }
    const sharesOf = (co, c) => co.hold[c] || 0;
    const allShares = (co) => { let s = 0; for (const k in co.hold) s += co.hold[k]; return s; };
    // the player buys or sells shares, at the price of the hour (a share's par: the company's capital over its first shares)
    const parOf = (co) => co.cap;
    function buy(c, coId, coinAmt) { const cv = civs[c], co = companies.find((x) => x.id === coId); if (!cv || !co || co.gone) return 'No such company'; coinAmt = Math.min(coinAmt, cv.wealth); if (!(coinAmt > 0)) return 'Nothing to spend'; const sh = coinAmt / (parOf(co) * co.val); co.hold[c] = (co.hold[c] || 0) + sh; cv.wealth -= coinAmt; return null; }
    function sell(c, coId, part) { const cv = civs[c], co = companies.find((x) => x.id === coId); if (!cv || !co) return 'No such company'; const have = co.hold[c] || 0; if (!(have > 0)) return 'You hold none of it'; const sh = have * Math.max(0, Math.min(1, part === undefined ? 1 : part)); co.hold[c] = have - sh; if (co.hold[c] < 1e-9) delete co.hold[c]; cv.wealth += sh * parOf(co) * (co.gone ? 0 : co.val); return null; }

    // ---------- a year ----------
    function step() {
      const t0 = performance.now(), yr = year();
      paid.fill(0); got.fill(0);
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; if (!cv) continue; const e = eraOf(cv), T = TURN[e];
        if (!coinName[c] && knows(c, 'coinage')) mint(c);
        // interest, to its lenders (a house keeps seven tenths, its realm taxes the rest)
        if (debt[c] > 0) {
          const r = rate(c); rateOf[c] = r; let due = 0;
          for (const o of owes[c] || []) { const i = o[1] * (o[0] ? r : r * HOME); due += i; if (o[0]) { const x = houseOf(o[0]); if (x && !x.fail) { x.cap += i * 0.5; if (x.c >= 0 && civs[x.c]) { civs[x.c].wealth += i * 0.3; got[x.c] += i * 0.3; } } } }      // (half to the house, three tenths to its realm in taxes, the rest to its partners)
          cv.wealth -= due; paid[c] += due;
        } else rateOf[c] = rate(c);
        // what fades: the prices settle (in two turns halfway), a panic passes (in a turn; half that with a central bank), standing comes back
        dear[c] *= Math.pow(0.5, 1 / dearHalf(T)); if (dear[c] < 1e-4) dear[c] = 0;
        if (panic[c] > 0) { panic[c] *= Math.pow(0.5, 1 / panicHalf(c, knows(c, 'centralbank'))); if (panic[c] < 1e-3) panic[c] = 0; }
        stand[c] += (1 - 0.3 * (1 - fine[c]) - stand[c]) * (1 - Math.pow(0.5, 1 / standHalf(T)));
        if (!cv.player) think(c, cv, T, yr);
      }
      stepHouses(yr); stepCompanies(yr);
      for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv) continue; const net = got[c] - paid[c]; if (net) cv.income = (cv.income || 0) + net; }      // (the year's income, as the ledger shows it, has what the lenders took and what came back)
      stats.ms = performance.now() - t0;
    }
    // the autopilot: the court spends what it hoards; a war is paid for; it borrows when low, repays when flush, debases and defaults
    function think(c, cv, T, yr) {
      const inc = Math.max(0, cv.income || 0), g = grossOf(cv), wars = h.warsN(cv);
      const keep = Math.max(300, HOARD * T * inc); if (cv.wealth > keep) cv.wealth -= (cv.wealth - keep) * (1 - Math.pow(0.5, 2 / T));
      // a war is paid for out of the purse down to what the realm keeps for its works, and beyond that with borrowed money
      // (wars were what states borrowed for); what nobody will lend comes out of the purse all the same
      if (wars) {
        let cost = inc * (WAR + WAR2 * Math.min(3, wars - 1)); const reserve = Math.max(300, 0.5 * T * inc);
        const fromPurse = Math.max(0, Math.min(cost, cv.wealth - reserve)); cv.wealth -= fromPurse; cost -= fromPurse;
        if (cost > 0 && canBorrow(c) && panic[c] < 0.6) { const b = borrow(c, cost); cv.wealth -= b; cost -= b; }
        if (cost > 0) cv.wealth -= cost;
      }
      if (((yr + c) & 3) !== 0) return;      // (it thinks about money every fourth year)
      if (!canBorrow(c)) return;
      if (cv.wealth < 0.2 * T * inc + 20 && (wars || cv.wealth < 0)) { const want = Math.max(0.4 * T * inc, -cv.wealth + 0.3 * T * inc) + 10; const gotIt = borrow(c, want); if (gotIt > 0) news.push({ kind: 'borrow', c, amt: gotIt, year: yr }); }
      else if (debt[c] > 0 && !wars && cv.wealth > 1.5 * T * inc) repay(c, Math.min(debt[c], cv.wealth - T * inc));
      // (in a hole nobody will lend into, with interest eating a third of what it takes in: it debases, and at last defaults)
      if (cv.wealth < -0.15 * T * g && room(c) < g) {
        const due = paid[c] / g;
        if (knows(c, 'coinage') && fine[c] > 0.5 && rnd() < 0.2) debase(c);
        else if (debt[c] > 0 && due > 0.4 && cv.wealth < -0.5 * T * g && rnd() < (h.trait(cv) === 'tyrant' ? 0.08 : 0.03)) defaultOn(c, 'nobody would lend');
      }
      if (fine[c] < 0.999 && cv.wealth > 1.3 * T * inc + restoreCost(c) && rnd() < 0.15) restore(c);
    }
    function stepHouses(yr) {
      // (a house's expenses and what it pays its owners; one that has lost more than it has fails, one in a panic may)
      for (const x of houses) {
        if (x.fail) continue; if (x.c >= 0 && !civs[x.c]) x.c = -1; if (x.c >= 0 && owner[x.at] !== x.c) { const o = owner[x.at]; x.c = o >= 0 && civs[o] ? o : -1; }
        if (x.cap < 0 || (x.c >= 0 && panic[x.c] > 0.4 && x.lent > x.cap * LEVER * 0.9 && rnd() < panic[x.c] * 0.15)) { failHouse(x, x.cap < 0 ? 'its borrowers did not pay' : 'a run on it'); continue; }
        if (x.c < 0 && rnd() < 0.01) { failHouse(x, 'its city is lost'); continue; }
        x.cap = x.cap * 0.92 + (x.c >= 0 && civs[x.c] ? 0.02 * grossOf(civs[x.c]) : 0);      // (its expenses and what it pays its owners; what the realm's merchants deposit with it)
      }
      // new houses: in the realms that know banking, in a rich trading town; fewer where there are some already
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; if (!cv || ((yr + c) % 5) !== 0 || !knows(c, 'banking')) continue; const T = TURN[eraOf(cv)];
        // (as many as its share of the world's trade and its markets carry: a great trading realm several, the usual realm none)
        let mine = 0; for (const x of houses) if (!x.fail && x.c === c) mine++; const tr = h.trade ? h.trade(c) : 0; const cap = Math.floor(tr * 60 + (h.markets[c] || 0) / 8);
        if (mine >= cap) continue; const p = 5 / (T * 4) * (cv.stability > 0.5 ? 1 : 0.4);
        if (rnd() < p) { const at = rnd() < 0.5 || !h.townOf ? cv.capital : (h.townOf(c) >= 0 ? h.townOf(c) : cv.capital); if (at >= 0) found(c, at); }
      }
    }
    function stepCompanies(yr) {
      for (const co of companies) {
        if (co.gone) continue; const cv = co.c >= 0 ? civs[co.c] : null; if (!cv) { co.gone = true; co.goneAt = yr; continue; }
        const e = eraOf(cv), T = TURN[e], b = BASE[e] || 0.05; const trade = h.trade ? h.trade(co.c) : 0;
        // returns: what the far trade brings (its realm's share of the world's trade, against the company's money), and luck
        const profit = co.cap * (b + 0.02) * (0.4 + 30 * trade) * (1 - 0.6 * panic[co.c]) * (0.6 + rnd() * 0.8);
        co.ret = profit / co.cap; co.fund = Math.max(0.2, Math.min(4, co.ret / (b + 0.02)));
        // a mania now and then: the shares run ahead of what the trade brings for some years, and the bubble bursts
        if (co.heat <= 0) { if (rnd() < 0.0015) co.heat = 0.15; } else { co.heat = Math.min(1, co.heat + 0.07); if ((co.heat > 0.6 && rnd() < 0.2) || co.heat >= 1) { co.val = co.fund * 0.35; co.heat = 0; co.crash = yr; stats.crashes++; news.push({ kind: 'crash', co: co.id, c: co.c, year: yr }); shake(co.c, 0.45, `${co.name} crashes`); for (const k in co.hold) if (+k !== co.c && civs[+k]) panic[+k] = Math.min(1, panic[+k] + 0.2); } }
        const target = co.fund * (1 + 3 * co.heat); co.val = Math.max(0.05, co.val + (target - co.val) * 0.25 + co.val * (rnd() - 0.5) * 0.04);
        // dividends: to its holders by their shares (the rest of the realm's merchants' part to its realm in taxes)
        const all = allShares(co); for (const k in co.hold) { const r = civs[+k]; if (!r) { delete co.hold[k]; continue; } const d = profit * 0.6 * co.hold[k] / all * (+k === co.c ? 0.3 : 1); r.wealth += d; got[+k] += d; }
        if ((yr % Math.max(1, Math.round(T / 2))) === 0) { co.hist.push(Math.round(co.val * 1000) / 1000); if (co.hist.length > 40) co.hist.shift(); }
        if (co.val < 0.08 && rnd() < 0.05) { co.gone = true; co.goneAt = yr; news.push({ kind: 'wound', co: co.id, c: co.c, year: yr }); }
      }
      // new companies: harbour realms that know of them, as their far trade grows
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; if (!cv || cv.player || ((yr + c) % 5) !== 0 || !knows(c, 'companies') || !(h.ports[c] > 0)) continue; const T = TURN[eraOf(cv)];
        let mine = 0; for (const co of companies) if (!co.gone && co.c === c) mine++; if (mine >= 1 + Math.floor((h.ports[c] || 0) / 4)) continue;
        if (rnd() < 5 / (T * 6) * Math.min(1.5, (h.trade ? h.trade(c) : 0) * 20)) charter(c);
      }
    }

    // ---------- what the simulation asks ----------
    // the share of its taxes that is still worth what it was (prices run ahead of what is collected), and less trade in a panic
    const taxF = (c) => (1 - 0.35 * Math.min(1, dear[c])) * (1 - 0.15 * panic[c]);
    // unrest: dear bread, a panic, a default not long ago
    function unrest(cv) { const c = cv.id; const T = TURN[eraOf(cv)]; return -(0.12 * Math.min(1, dear[c]) + 0.06 * panic[c] + (year() - lastDef[c] < Math.max(5, Math.min(20, T)) ? 0.04 : 0)); }
    // a realm is gone: its debts die with it (its lenders' losses), its houses are without a realm, its companies wound up
    function gone(c) {
      if (debt[c] > 0) { for (const o of owes[c] || []) { if (!o[0]) continue; const x = houseOf(o[0]); if (x) { x.lent = Math.max(0, x.lent - o[1]); x.cap -= o[1] / LEVER; } } }
      owes[c] = null; debt[c] = 0; fine[c] = 1; dear[c] = 0; stand[c] = 1; lastDef[c] = -1e9; panic[c] = 0; coinName[c] = '';
      for (const x of houses) if (x.c === c) x.c = -1; for (const co of companies) { if (co.c === c && !co.gone) { co.gone = true; co.goneAt = year(); } delete co.hold[c]; }
    }
    // a realm is born: a breakaway strikes its own coin; it owes nothing (what it would have owed stays with its parent)
    function born(c) { owes[c] = null; debt[c] = 0; fine[c] = 1; dear[c] = 0; stand[c] = 1; lastDef[c] = -1e9; panic[c] = 0; coinName[c] = ''; }
    const debtOf = (c) => debt[c], owesOf = (c) => (owes[c] || []).map((o) => ({ house: o[0] ? houseOf(o[0]) : null, amt: o[1] }));
    const housesOf = (c) => houses.filter((x) => x.c === c && !x.fail);
    const companiesOf = (c) => companies.filter((co) => co.c === c && !co.gone);
    const heldBy = (c) => companies.filter((co) => co.hold[c] > 0);
    const holdingValue = (c) => { let v = 0; for (const co of companies) { const s = co.hold[c]; if (s && co.c !== c) v += s * parOf(co) * (co.gone ? 0 : co.val); } return v; };

    // ---------- what the player does (bank.js; sim.financeAct) ----------
    const houseCost = (cv) => Math.round(Math.max(300, grossOf(cv) * 4));
    const companyCost = (cv) => Math.round(Math.max(200, grossOf(cv) * 3));
    function act(c, what, arg, arg2) {
      const cv = civs[c]; if (!cv) return 'No realm';
      if (what === 'borrow') { if (!canBorrow(c)) return 'Nobody lends before there are tribute lists to lend against'; if (panic[c] > 0.6) return 'In a panic nobody lends'; const amt = borrow(c, +arg); if (!(amt > 0)) return 'Nobody will lend you more'; news.push({ kind: 'borrow', c, amt, year: year() }); return null; }
      if (what === 'repay') { const amt = repay(c, +arg); if (!(amt > 0)) return debt[c] > 0 ? 'The treasury has nothing to repay with' : 'You owe nothing'; news.push({ kind: 'repay', c, amt, year: year() }); return null; }
      if (what === 'default') { if (!(debt[c] > 0)) return 'You owe nothing'; defaultOn(c, 'the court would not pay'); return null; }
      if (what === 'debase') { if (!knows(c, 'coinage')) return 'Your people strike no coin yet'; if (fine[c] < 0.3) return 'There is no silver left in it'; debase(c); return null; }
      if (what === 'restore') return restore(c);
      if (what === 'house') { if (!knows(c, 'banking')) return 'Needs Banking'; const cost = houseCost(cv); if (cv.wealth < cost) return `Needs ${cost} coin`; const at = arg >= 0 && owner[arg] === c ? arg : cv.capital; cv.wealth -= cost; found(c, at, { cap: cost * 0.8, name: arg2 || undefined }); return null; }
      if (what === 'company') { if (!knows(c, 'companies')) return 'Needs Chartered companies'; if (!(h.ports[c] > 0)) return 'Needs a harbour'; const cost = companyCost(cv); if (cv.wealth < cost) return `Needs ${cost} coin`; cv.wealth -= cost; const co = charter(c, { cap: cost }); return co ? null : 'No harbour to charter it in'; }
      if (what === 'buy') return buy(c, +arg, +arg2);
      if (what === 'sell') return sell(c, +arg, arg2 === undefined ? 1 : +arg2);
      return 'Nothing to do';
    }

    // ---------- saved with the world ----------
    const r3 = (v) => Math.round(v * 1000) / 1000;
    function save() {
      const per = []; for (let c = 0; c < MAXC; c++) { if (!civs[c]) continue; if (debt[c] > 0 || fine[c] < 1 || dear[c] > 0 || stand[c] < 0.999 || panic[c] > 0 || lastDef[c] > -1e8 || coinName[c]) per.push([c, r3(fine[c]), r3(dear[c]), r3(debt[c]), r3(stand[c]), lastDef[c] > -1e8 ? lastDef[c] : 0, r3(panic[c]), coinName[c], (owes[c] || []).map((o) => [o[0], r3(o[1])])]); }
      return { v: 1, rs, per, h: houses.map((x) => [x.id, x.name, x.fam, x.at, x.c, x.born, r3(x.cap), r3(x.lent), x.fail ? 1 : 0, x.failAt]), co: companies.map((y) => [y.id, y.name, y.c, y.at, y.born, r3(y.cap), r3(y.val), r3(y.fund), r3(y.heat), r3(y.ret), y.hist, y.hold, y.crash, y.gone ? 1 : 0, y.goneAt]), cr: crises.slice(-30), n: [nextH, nextCo], st: stats };
    }
    function load(s) {
      fine.fill(1); dear.fill(0); debt.fill(0); stand.fill(1); lastDef.fill(-1e9); panic.fill(0); coinName.fill(''); owes.fill(null); houses.length = 0; companies.length = 0; crises.length = 0; nextH = 1; nextCo = 1;
      if (!s || s.v !== 1) return false; if (s.rs !== undefined) rs = s.rs >>> 0;
      for (const p of s.per || []) { const c = p[0]; fine[c] = p[1]; dear[c] = p[2]; debt[c] = p[3]; stand[c] = p[4]; lastDef[c] = p[5] || -1e9; panic[c] = p[6]; coinName[c] = p[7] || ''; owes[c] = (p[8] || []).length ? p[8].map((o) => [o[0], o[1]]) : null; }
      for (const x of s.h || []) houses.push({ id: x[0], name: x[1], fam: x[2], at: x[3], c: x[4], born: x[5], cap: x[6], lent: x[7], fail: !!x[8], failAt: x[9] || 0, borrowers: 0 });
      for (const y of s.co || []) companies.push({ id: y[0], name: y[1], c: y[2], at: y[3], born: y[4], cap: y[5], val: y[6], fund: y[7], heat: y[8], ret: y[9], hist: y[10] || [y[6]], hold: y[11] || {}, crash: y[12] === undefined ? -1e9 : y[12], gone: !!y[13], goneAt: y[14] || 0 });
      for (const x of s.cr || []) crises.push(x); if (s.n) { nextH = s.n[0]; nextCo = s.n[1]; } if (s.st) Object.assign(stats, s.st);
      for (let c = 0; c < MAXC; c++) if (civs[c]) rateOf[c] = rate(c);
      return true;
    }

    return { fine, dear, debt, rateOf, stand, lastDef, panic, paid, got, owes, houses, companies, crises, stats, news, step, rate, room, borrow, repay, defaultOn, debase, restore, restoreCost, found, failHouse, charter, buy, sell, shake,
      taxF, unrest, gone, born, coin, mint, debtOf, owesOf, housesOf, companiesOf, heldBy, holdingValue, sharesOf, allShares, parOf, houseOf, lendersOf, houseCost, companyCost, act, save, load, canBorrow, grossOf, BASE, LIMIT, LEVER, TURN };
  }

  window.FINANCE = { create, BASE, CUT, LIMIT, LEVER, HOME, WAR, DEBASE, DEAR, TURN };
})();
