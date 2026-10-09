// GENESIS dynasties: the people who rule, the houses they are of, and who comes after them. Pure data, no drawing (the Court is
// a tab of the laws screen: court.js; the faces are portrait.js's). Classic script; exposes window.DYNASTY.
//
// Every ruler is a person: born in a year, of a house where power passes by blood, with a father and a mother, a spouse and
// children, a character (the sim's traits) and a face (a seed; a house has a look of its own, and its children mostly have it).
// A ruler's death comes with his years: the sim's yearly roll is held against a hazard that rises with age, more at war and
// less in the modern ages. Where power passes by blood the throne goes down the line by descent: the eldest son and his line,
// then the next, then the daughters and theirs (those the ruler passed over last), then his brothers and sisters and theirs;
// failing all of them, a kinsman of the house from a branch far off, else the house dies out and another takes the throne. An
// emperor names his ablest grown child. A child on the throne rules under a regent (his mother, his father, an uncle or a
// noble), whose character is the realm's until the child is sixteen. Where rulers are chosen, elected or seize power each is
// a person of no house; one whose realm comes to be ruled by blood founds a house of his name, and a house that loses its
// throne (put down, or its realm ended) is remembered as it ended. Rulers and their children marry at about eighteen into the
// nobility, or into a house the realm has sworn a royal marriage with; children come in the years after (their years and their
// fates are thrown at the wedding), and some die young. A child's character shows from birth (as often as not its father's)
// and is fixed at sixteen; the player may have his children raised otherwise. Children are named in their people's tongue,
// as often as not after a forebear, and a ruler takes the number of his name on his realm's throne (Eadric III). A house is
// named for its founder in its tongue's manner (the House of ..., the ...ids, the ... dynasty) and keeps the line of its
// rulers. The player chooses how his children are raised, passes over an heir, marries a child into the nobility.
// The module throws its own dice, except the yearly roll of a ruler's death, which is the sim's (as it always was).
(function () {
  'use strict';
  const TRAITS = ['conqueror', 'builder', 'pious', 'scholar', 'merchant', 'tyrant', 'steward', 'navigator'];
  const ADULT = 16, WED = 18, FERTILE = [16, 42];
  // how a house is named, by the kind of its people's tongue (sim.js's name styles)
  const HOUSE_FORMS = {
    latinic: ['the House of {N}', 'the {N}ians', 'the House of {N}'], norse: ['the House of {N}', 'the {N}ings', 'the {N}ings'], semitic: ['the House of {N}', 'the Banu {N}', 'the {N}ids'],
    sinitic: ['the {N} dynasty', 'the {N} dynasty', 'the House of {N}'], bantu: ['the House of {N}', 'the line of {N}', 'the House of {N}'], polynesian: ['the line of {N}', 'the House of {N}'],
    turkic: ['the {N}ids', 'the House of {N}', 'the {N}ids'], nahuatl: ['the House of {N}', 'the line of {N}'], hellenic: ['the {N}ids', 'the House of {N}', 'the {N}ads'],
    indic: ['the {N} dynasty', 'the House of {N}', 'the {N} dynasty'], celtic: ['the House of {N}', 'the Uí {N}', 'the Clan {N}'], nilotic: ['the House of {N}', 'the line of {N}'],
  };
  const ROMAN = ['', '', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X', ' XI', ' XII', ' XIII', ' XIV', ' XV', ' XVI', ' XVII', ' XVIII', ' XIX', ' XX'];
  const MAXLINE = 6;        // (the reigns a house keeps in its line: forty for the player's; it counts them all)
  // the kinds of succession the sim tells apart: blood (an heir), named (an emperor names one), seized, chosen (by elders),
  // holy (by priests), elected (terms of years), party (named by the party or the experts)
  const dynastic = (kind) => kind === 'blood' || kind === 'named';
  const numbered = (kind) => dynastic(kind) || kind === 'holy';
  // how old a ruler is who comes to power from outside a line, by how he comes to it
  // (young enough that a reign lasts about as long as one by blood: the world was fitted to rulers who reigned some thirty-four years)
  const AGE = { blood: [24, 45], named: [24, 45], seized: [26, 42], chosen: [26, 42], holy: [30, 46], elected: [40, 62], party: [30, 46] };
  const KIN_SHARE = 0.4;    // (a house of two reigns or more has branches: how often one of them gives the throne a kinsman when the line fails)

  function create(h) {
    const { civs, MAXC } = h;
    const year = () => h.year();
    const P = new Map();                       // id -> person { id, n, f, b, d, h, p, m, s, k: [], t, sd, c, r: [from, to] | null, ep, rz, w, kd }
    const houses = new Map();                  // id -> house { id, name, base, founded, founder, seed, kind, line: [[name, from, to, epithet, female]], n (reigns), ended, fate, c }
    const court = new Array(MAXC).fill(null);  // per realm: { ruler, house, regent: { pid, who, until } | null, passed: [pid], nums: { name: n } }
    let nextP = 1, nextH = 1;
    const stats = { born: 0, died: 0, houses: 0, ended: 0, extinct: 0, deposed: 0, regencies: 0, matches: 0, royal: 0, reigns: 0, reignYears: 0, how: { clear: 0, child: 0, kin: 0, extinct: 0, new: 0 }, ms: 0 };
    const news = [];

    // ---------- the module's own dice ----------
    let rs = ((h.seed || 1) ^ 0x5f3759df) >>> 0;
    const rnd = () => { rs += 0x6D2B79F5; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const eraOf = (cv) => Math.min(8, Math.max(0, cv ? cv.era | 0 : 0));
    const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const kindOf = (cv) => (h.kind ? h.kind(cv) : 'blood');
    // a people's tongue (people.js), else the realm's name style
    function tongueOf(cv) {
      const Pp = h.people; if (Pp && cv) { const p = Pp.list[(cv.capital >= 0 && Pp.ppl[cv.capital]) || Pp.ruling[cv.id] || 0]; if (p && p.t) return p.t; }
      const st = cv ? cv.style : 0, S = h.STYLES[st] || h.STYLES[0]; return S.syl ? { st, syl: S.syl } : { st, on: S.on, vow: S.vow, end: S.end };
    }
    function nameIn(t, minS, maxS) {
      const n = minS + Math.floor(rnd() * (maxS - minS + 1));
      if (t.syl) { let s = ''; for (let i = 0; i < n; i++) s += pick(t.syl); return cap1(s); }
      let s = ''; for (let i = 0; i < n; i++) s += pick(t.on) + pick(t.vow); s += rnd() < 0.85 ? pick(t.end) : pick(t.on);
      return cap1(s.replace(/(.)\1\1/g, '$1$1'));
    }
    const bare = (n) => n.replace(/ [IVXL]+$/, '');
    // a character by the sim's weights for the realm as it is (what pickTrait weighs), drawn with the module's dice
    function drawTrait(cv) {
      const w = h.traitW && cv ? h.traitW(cv) : null; if (!w) return pick(TRAITS);
      let sum = 0; for (const k in w) sum += w[k]; let r = rnd() * sum; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return 'steward';
    }
    // ages: how long one born now lives (a grown person: how long, having grown up), and the yearly chance a ruler dies
    const modern = (e) => e >= 6;
    const youngDeath = (e) => (modern(e) ? 0.05 : e >= 4 ? 0.28 : 0.35);
    function lifespan(e, grown) { if (!grown && rnd() < youngDeath(e)) return 1 + Math.floor(rnd() * 14); const m = modern(e) ? 76 : 62, s = modern(e) ? 10 : 12; const a = m + s * (rnd() + rnd() + rnd() - 1.5) * 1.4; return Math.max(ADULT + 4, Math.min(98, Math.round(a))); }
    // (Gompertz: a little at any age, and doubling every eight years; a war adds to it. Reigns by blood come out at some
    // thirty-four years, as the old flat roll of one in 34 gave: the world's wars, risings and breakaways were fitted to that
    // many deaths a year. tools/dynasty/probe.js measures them)
    function hazard(age, e, war) { const A = modern(e) ? 0.002 : 0.0035, B = modern(e) ? 0.00035 : 0.0006; return Math.min(0.9, A + B * Math.exp(0.085 * (age - 20)) + (war ? 0.006 : 0)); }
    // the year one now living dies, by the same hazard (one who steps down, a regent from among the nobles)
    function deathFrom(p, cv) { const e = eraOf(cv), yr = year(); let a = Math.max(0, yr - p.b); for (let n = 0; n < 90; n++, a++) if (rnd() < hazard(a, e, false)) return yr + 1 + n; return yr + 90; }

    // ---------- people and houses ----------
    // (a face is the person's number, scrambled, unless it was given: a ruler from a world saved before dynasties keeps his)
    const sdOf = (id) => (Math.imul(id ^ 0x2545f491, 0x9e3779b1) >>> 0) % 1000000;
    function person(o) { const p = Object.assign({ id: nextP++, n: '', f: false, b: year(), d: 0, h: 0, p: 0, m: 0, s: 0, k: [], t: '', sd: 0, c: -1, r: null, ep: '', rz: 0, w: 0, kd: 0 }, o); if (!p.sd) p.sd = sdOf(p.id); P.set(p.id, p); return p; }
    function styleKind(cv) { const t = tongueOf(cv); const S = h.STYLES[t.st !== undefined ? t.st : cv ? cv.style : 0] || h.STYLES[0]; return S.k || 'latinic'; }
    function houseName(form, base) { const m = form.match(/\{N\}([a-z]+)/); if (m && /^[aeiou]/.test(m[1])) base = base.replace(/[aeiouy]+$/, '') || base; return form.replace('{N}', base); }
    function house(cv, base) {
      const kind = styleKind(cv); base = bare(base || nameIn(tongueOf(cv), 2, 3)); const form = pick(HOUSE_FORMS[kind] || HOUSE_FORMS.latinic);
      const H = { id: nextH++, name: houseName(form, base), base, founded: year(), founder: 0, seed: Math.floor(rnd() * 1e6), kind, line: [], n: 0, ended: 0, fate: '', c: cv ? cv.id : -1 };
      houses.set(H.id, H); stats.houses++; return H;
    }
    function closeHouse(H, yr, fate) { if (!H || H.ended) return; H.ended = yr; H.fate = fate; stats.ended++; if (fate === 'extinct') stats.extinct++; else if (fate === 'deposed') stats.deposed++; news.push({ kind: 'ended', c: H.c, h: H.id, fate, year: yr }); }
    const alive = (p, yr) => !!p && p.b <= yr && (p.d === 0 || p.d > yr);
    const ageOf = (p, yr) => (p ? (yr === undefined ? year() : yr) - p.b : 0);
    const of = (id) => (id ? P.get(id) || null : null);
    // a reign in its house's line: begun when he takes the throne, closed when he leaves it (the last ten kept, forty of the player's)
    const lineCap = (H) => (civs[H.c] && civs[H.c].player ? 40 : MAXLINE);
    function lineRec(p) { const H = houses.get(p.h); if (!H) return null; let L = H.line.length ? H.line[H.line.length - 1] : null; if (!L || L[2]) { L = [p.n, p.r ? p.r[0] : year(), 0, '', p.f ? 1 : 0]; H.line.push(L); H.n++; while (H.line.length > lineCap(H)) H.line.shift(); } return L; }
    function endLine(p, yr) { const H = houses.get(p.h); if (!H || !H.line.length) return; const L = H.line[H.line.length - 1]; if (!L[2]) { L[0] = p.n; L[2] = yr; L[3] = p.ep; } }
    // a name for a child: as often as not a forebear's (a ruling line reuses its names)
    function childName(cv, fem, father, mother) {
      const kin = []; for (const a of [father, mother]) { if (!a) continue; if (a.f === fem) kin.push(bare(a.n)); for (const g of [of(a.p), of(a.m)]) if (g && g.f === fem) kin.push(bare(g.n)); }
      return kin.length && rnd() < 0.45 ? pick(kin) : nameIn(tongueOf(cv), 2, 3);
    }
    // the children of a marriage, from a year on: their years, their fates and their leanings are thrown now
    function children(man, wife, cv, from0) {
      const e = eraOf(cv), yr = year(); const from = Math.max(from0, wife.b + FERTILE[0], man.b + ADULT), to = Math.min(wife.b + FERTILE[1], (wife.d || 1e9) - 1, (man.d || 1e9) - 1);
      if (to < from) return; const want = (modern(e) ? 2.2 : 4.3) * (to - from + 1) / (FERTILE[1] - FERTILE[0]); let n = 0; const L = Math.exp(-want); let pp = rnd(); while (pp > L && n < 9) { n++; pp *= rnd(); }
      const years = []; for (let i = 0; i < n; i++) years.push(from + Math.floor(rnd() * (to - from + 1))); years.sort((x, y) => x - y);
      const ruler = man.r && !man.r[1] ? man : wife.r && !wife.r[1] ? wife : man;      // (the parent whose character a child takes, as often as not: the one who rules)
      for (const by of years) {
        const fem = rnd() < 0.5; const kid = person({ n: childName(cv, fem, man, wife), f: fem, b: by, h: man.h || wife.h, p: man.id, m: wife.id, c: cv ? cv.id : -1 });
        kid.t = ruler.t && rnd() < 0.45 ? ruler.t : drawTrait(cv); kid.d = by + lifespan(e, false);
        if (by < yr && kid.d <= yr && by + ADULT > yr - 1) kid.d = yr + 1 + Math.floor(rnd() * 40);      // (one already born when the family comes into the story lives at least to be seen)
        man.k.push(kid.id); wife.k.push(kid.id);
      }
    }
    // a marriage (since: the year children may come from); where they cannot matter (a ruler of a realm that is not ruled by blood,
    // and not the player's) the children are left unthrown until they do: ensureKids
    function wed(a, b, cv, since, kids) { if (!a || !b || a.s || b.s) return; a.s = b.id; b.s = a.id; a.w = b.w = since === undefined ? year() + 1 : since; if (kids !== false) ensureKids(a, cv); }
    function ensureKids(p, cv) { const sp = of(p.s); if (!sp || p.kd) return; const man = p.f ? sp : p, wife = p.f ? p : sp; man.kd = wife.kd = 1; children(man, wife, cv, p.w || year()); }
    const fertileKind = (kind, cv) => dynastic(kind) || kind === 'seized' || !!(cv && cv.player);      // (whose children are thrown at once)
    // a match from the nobility of the realm, a little younger than a man or a little older than a woman
    function spouseFor(p, cv) { const e = eraOf(cv), yr = year(); const gap = Math.floor(rnd() * 9); const sp = person({ n: nameIn(tongueOf(cv), 2, 3), f: !p.f, b: p.f ? p.b - gap : p.b + gap, h: 0, c: cv ? cv.id : -1, t: drawTrait(cv) }); sp.d = Math.max(yr + 2, sp.b + lifespan(e, true)); return sp; }
    function matchNoble(p, cv, kids) { const sp = spouseFor(p, cv); wed(p, sp, cv, undefined, kids); stats.matches++; return sp; }
    // the living children of a person, eldest first
    function kidsOf(p, yr) { if (!p) return []; return p.k.map(of).filter((k) => alive(k, yr)).sort((x, y) => x.b - y.b); }
    // the line of succession, by descent: each child followed by its own line, sons before daughters, the eldest first,
    // those the ruler passed over (and their lines) last; then the ruler's brothers and sisters and theirs. One who already
    // rules a realm of his own is passed by (two crowns on one head are diplomacy's affair: a union, diplo.heir).
    function order(p, yr, out, n, passed, skip, depth) {
      const kids = p.k.map(of).filter((k) => k && k.b <= yr && k.id !== skip).sort((x, y) => (x.f - y.f) || (x.b - y.b));
      if (passed && passed.length) kids.sort((x, y) => (passed.includes(x.id) ? 1 : 0) - (passed.includes(y.id) ? 1 : 0));
      for (const k of kids) { if (alive(k, yr) && !(k.r && !k.r[1])) { out.push(k); if (out.length >= n) return; } if (depth < 4) { order(k, yr, out, n, null, 0, depth + 1); if (out.length >= n) return; } }      // (one who rules elsewhere is passed by: his line is not)
    }
    function lineFor(c, yr, n) {
      const C = court[c]; const r = C && of(C.ruler); if (!r) return []; yr = yr === undefined ? year() : yr; n = n || 1;
      const out = []; order(r, yr, out, n, C.passed, 0, 0); if (out.length < n) { const par = of(r.p) || of(r.m); if (par) order(par, yr, out, n, null, r.id, 1); }
      return out;
    }
    // who comes after a ruler: the line; an emperor names the ablest of his grown children
    function heirOf(c, yr, kind) {
      const C = court[c]; const r = C && of(C.ruler); if (!r) return null; yr = yr === undefined ? year() : yr; kind = kind || kindOf(civs[c]);
      if (kind === 'named') { const able = kidsOf(r, yr).filter((k) => ageOf(k, yr) >= ADULT && !C.passed.includes(k.id) && !(k.r && !k.r[1]) && (k.t === 'builder' || k.t === 'scholar' || k.t === 'steward' || k.t === 'conqueror')); if (able.length) return able[0]; }
      return lineFor(c, yr, 1)[0] || null;
    }

    // ---------- a realm's rulers ----------
    // a ruler come from outside the line: a realm's first, one chosen, elected or risen, a kinsman from a far branch, the founder
    // of a new house; grown, married as often as not, with what children he or she has had
    function outsider(c, kind, opts) {
      const cv = civs[c]; const yr = year(); const e = eraOf(cv); opts = opts || {};
      const fem = opts.fem !== undefined ? opts.fem : rnd() < (e >= 7 ? 0.3 : 0.12); const [lo, hi] = AGE[kind] || AGE.blood; const age = lo + Math.floor(rnd() * (hi - lo + 1));
      const name = opts.name || nameIn(tongueOf(cv), 2, 3);
      let hid = opts.house || 0; if (!hid && dynastic(kind)) hid = house(cv, name).id;
      const r = person({ n: name, f: fem, b: yr - age, h: hid, c, t: opts.trait || drawTrait(cv), sd: opts.seed !== undefined ? opts.seed : Math.floor(rnd() * 1e6) });
      const H = houses.get(hid); if (H && !H.founder) H.founder = r.id;
      if (rnd() < 0.85) { const sp = spouseFor(r, cv); wed(r, sp, cv, Math.max(r.b, sp.b) + WED + Math.floor(rnd() * 6), fertileKind(kind, cv)); }
      return r;
    }
    // a regent for a child on the throne: the mother, the father, an uncle or an aunt grown, else one of the great nobles
    function regentFor(c, heir, old, yr) {
      const cv = civs[c]; const mum = of(heir.m), dad = of(heir.p); let p = null, who = 'noble';
      if (mum && mum !== old && alive(mum, yr)) { p = mum; who = 'mother'; } else if (dad && dad !== old && alive(dad, yr)) { p = dad; who = 'father'; }
      else if (old) { const g = of(old.p) || of(old.m); if (g) for (const id of g.k) { const u = of(id); if (u && u !== old && alive(u, yr) && ageOf(u, yr) >= 20) { p = u; who = u.f ? 'aunt' : 'uncle'; break; } } }
      if (!p) { p = person({ n: nameIn(tongueOf(cv), 2, 3), f: rnd() < 0.1, b: yr - 35 - Math.floor(rnd() * 20), c, t: drawTrait(cv) }); p.d = deathFrom(p, cv); }
      if (!p.t) p.t = drawTrait(cv);
      return { pid: p.id, who, until: heir.b + ADULT };
    }
    // Who now takes a realm's throne. why: 'death' (the ruler died), 'term' (his years in office are up), 'fall' (he was put down:
    // a rising, the army, a victor), 'reform' (the realm's government came to be one in which rulers come otherwise, and he stepped
    // aside), 'first' (a new realm). Answers the person, how it
    // went ('clear': a grown heir; 'child': a regency; 'kin': a kinsman; 'extinct': the line failed, a new house; 'new': no line),
    // and the character the realm is ruled by now (a child's regent's).
    function succeed(c, kind, why, ep) {
      const cv = civs[c]; if (!cv) return null; const yr = year();
      const C = court[c] || (court[c] = { ruler: 0, house: 0, regent: null, passed: [], nums: {} });
      const old = why === 'first' ? null : of(C.ruler);
      if (old) {
        if (ep) old.ep = ep; if (old.r) { old.r[1] = yr; stats.reigns++; stats.reignYears += yr - old.r[0]; } endLine(old, yr);
        if (why === 'death') { old.d = yr; stats.died++; old.k = old.k.filter((id) => { const k = of(id); if (k && k.b > yr + 1) { P.delete(id); const w = of(k.m === old.id ? k.p : k.m); if (w) w.k = w.k.filter((x) => x !== id); return false; } return true; }); }      // (none are born to him after he is gone)
        else old.d = deathFrom(old, cv);      // (he steps down, or is put down, and lives out his years)
      }
      const H0 = old && old.h ? houses.get(old.h) : null;
      let heir = null, how = 'new';
      if (old && why === 'death' && dynastic(kind)) {
        ensureKids(old, cv); heir = heirOf(c, yr, kind);
        if (heir) how = ageOf(heir, yr) < ADULT ? 'child' : 'clear';
        else if (H0 && !H0.ended && H0.n >= 2 && rnd() < KIN_SHARE) { heir = outsider(c, kind, { house: H0.id, name: rnd() < 0.5 ? bare(pick(H0.line)[0]) : undefined }); how = 'kin'; }
        else { how = 'extinct'; if (H0) closeHouse(H0, yr, 'extinct'); }
      } else if (H0 && !H0.ended && H0.c === c) closeHouse(H0, yr, why === 'fall' ? 'deposed' : 'gave way');      // (its time is over: rulers come otherwise now)
      if (!heir) heir = outsider(c, kind);
      // (a line that had no house founds one: in the name of the one it came from)
      if (dynastic(kind) && !heir.h) {
        const src = old && why === 'death' ? old : heir; const H = house(cv, src.n); H.founder = src.id;
        const tag = (p, d) => { if (!p || p.h || d > 4) return; p.h = H.id; for (const k of p.k) tag(of(k), d + 1); };
        if (src === old) { H.founded = old.r ? old.r[0] : yr; tag(old, 0); H.line.push([old.n, old.r ? old.r[0] : yr, yr, old.ep, old.f ? 1 : 0]); H.n++; }
        tag(heir, 0);
      }
      if (!heir.t) heir.t = drawTrait(cv);
      heir.c = c; heir.r = [yr, 0]; heir.d = 0;      // (how long a ruler lives is the year's roll now: diesNow)
      // (a number for his name on this throne, once the realm keeps records: the last twelve names counted, forty-eight of the player's)
      const base = bare(heir.n); if (numbered(kind) && eraOf(cv) >= 1) { const N = C.nums; const n = (N[base] || 0) + 1; delete N[base]; N[base] = n; const ks = Object.keys(N); if (ks.length > (cv.player ? 48 : 12)) delete N[ks[0]]; heir.n = base + (n > 1 ? ROMAN[n] || ' ' + n : ''); } else heir.n = base;
      C.ruler = heir.id; C.passed = []; C.house = heir.h; C.regent = null;
      const H = houses.get(heir.h); if (H) { H.c = c; if (H.ended) { H.ended = 0; H.fate = ''; } lineRec(heir); }      // (a house can come back)
      if (how === 'child') { C.regent = regentFor(c, heir, old, yr); stats.regencies++; news.push({ kind: 'regency', c, p: heir.id, year: yr }); }
      stats.how[how]++;
      if (!heir.s && ageOf(heir, yr) >= WED && rnd() < 0.8) matchNoble(heir, cv, fertileKind(kind, cv)); else if (fertileKind(kind, cv)) ensureKids(heir, cv);
      return { p: heir, how, trait: C.regent ? of(C.regent.pid).t : heir.t, old };
    }
    // the ruler stays on the throne while his realm's government changes about him: where it comes to pass by blood, he founds a
    // house of his name (a chief whose people grow into a kingdom; a consul who makes himself king)
    function recrown(c, kind) {
      const cv = civs[c], C = court[c]; const r = C && of(C.ruler); if (!cv || !r) return;
      if (dynastic(kind)) ensureKids(r, cv);
      if (dynastic(kind) && !r.h) { const H = house(cv, r.n); H.founder = r.id; H.founded = r.r ? r.r[0] : year(); C.house = H.id; const tag = (p, d) => { if (!p || p.h || d > 4) return; p.h = H.id; for (const k of p.k) tag(of(k), d + 1); }; tag(r, 0); lineRec(r); }
    }
    // the sim's yearly roll of a ruler's death, held against his years (and a war)
    function diesNow(cv, roll) { const C = court[cv.id]; const r = C && of(C.ruler); if (!r) return roll < 1 / 34; return roll < hazard(ageOf(r), eraOf(cv), h.warsN ? h.warsN(cv) > 0 : false); }
    // the character a realm is ruled by: its ruler's, or while a child reigns, the regent's
    function traitOf(c) { const C = court[c]; if (!C) return ''; const p = of(C.regent ? C.regent.pid : C.ruler); return p ? p.t : ''; }

    // ---------- a year ----------
    function step() {
      const t0 = performance.now(), yr = year();
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c], C = court[c]; if (!cv || !C) continue; const r = of(C.ruler); if (!r) continue;
        if (C.regent && yr >= C.regent.until) { C.regent = null; news.push({ kind: 'ofage', c, p: r.id, year: yr }); }
        if (cv.player) {      // (the player hears of his family: children and grandchildren born and lost, who comes of age, a spouse's death)
          for (const id of r.k) { const k = of(id); if (!k) continue; if (k.b === yr) { stats.born++; news.push({ kind: 'born', c, p: k.id, year: yr }); } else if (k.d === yr) news.push({ kind: 'died', c, p: k.id, year: yr }); else if (k.b + ADULT === yr && k.d > yr) news.push({ kind: 'grown', c, p: k.id, year: yr });
            for (const g of k.k) { const q = of(g); if (q && q.b === yr) news.push({ kind: 'grand', c, p: q.id, year: yr }); } }
          const sp = of(r.s); if (sp && sp.d === yr) news.push({ kind: 'widowed', c, p: sp.id, year: yr });
        }
        if (((yr + c) & 3) !== 0) continue;
        // (the ruler, widowed or never wed, and his children of an age to marry: into a house the realm has sworn a royal marriage
        // with, else into the nobility; the player's own are left to him a few years longer)
        { const sp = of(r.s); if (r.s && (!sp || !alive(sp, yr))) r.s = 0; }
        const kids = fertileKind(kindOf(cv), cv);
        if (!r.s && ageOf(r, yr) >= WED && ageOf(r, yr) < 55 && rnd() < 0.5) { if (!(kids && royalMatch(c, r))) matchNoble(r, cv, kids); }
        if (!kids) continue; const late = cv.player ? 4 : 0;
        for (const k of kidsOf(r, yr)) { if (k.s || ageOf(k, yr) < WED + late + (k.id % 5) || rnd() > 0.35) continue; if (!royalMatch(c, k)) matchNoble(k, cv); }
      }
      const t1 = performance.now(); if (yr % 20 === 0) prune(yr);
      stats.ms = performance.now() - t0; stats.pr = performance.now() - t1;
    }
    // a royal marriage: where the realm has sworn one with a realm ruled by blood, a child of each house is matched
    function royalMatch(c, k) {
      const yr = year(); for (const o of (h.marriedTo ? h.marriedTo(c) : [])) { const Co = court[o]; const ro = Co && of(Co.ruler); if (!ro) continue;
        const sp = [ro].concat(kidsOf(ro, yr)).find((x) => x.f !== k.f && !x.s && alive(x, yr) && ageOf(x, yr) >= ADULT && Math.abs(x.b - k.b) < 14); if (sp) { wed(k, sp, civs[c]); stats.royal++; news.push({ kind: 'royal', c, o, a: k.id, b: sp.id, year: yr }); return sp; } }
      return null;
    }
    // two realms swear a royal marriage: an heir (or an unmarried child, or the ruler) of one weds one of the other's
    function married(a, b) {
      const yr = year(); const Ca = court[a.id], Cb = court[b.id]; const ra = Ca && of(Ca.ruler), rb = Cb && of(Cb.ruler); if (!ra || !rb) return null;
      const pool = (r, c) => [heirOf(c, yr), ...kidsOf(r, yr), r].filter((x, i, arr) => x && arr.indexOf(x) === i && !x.s && alive(x, yr) && ageOf(x, yr) >= ADULT - 2);
      const A = pool(ra, a.id), B = pool(rb, b.id); for (const x of A) { const y = B.find((z) => z.f !== x.f && Math.abs(z.b - x.b) < 16); if (y) { wed(x, y, a, Math.max(yr + 1, x.b + ADULT, y.b + ADULT)); stats.royal++; news.push({ kind: 'royal', c: a.id, o: b.id, a: x.id, b: y.id, year: yr }); return [x, y]; } }
      return null;
    }
    // the dead who are of no use any more are let go: those not of a living court's close family (parents, brothers and sisters
    // and their children, children and theirs, a regent)
    function prune(yr) {
      const keep = new Set(); const add = (id) => { if (id) keep.add(id); };
      const down = (p, d) => { if (!p) return; add(p.id); add(p.s); if (d < 3) for (const k of p.k) down(of(k), d + 1); };
      for (let c = 0; c < MAXC; c++) { const C = court[c]; if (!C || !civs[c]) continue; const r = of(C.ruler); if (!r) continue; down(r, 0); add(r.p); add(r.m); if (C.regent) add(C.regent.pid);
        const par = of(r.p) || of(r.m); if (par) for (const s of par.k) down(of(s), 2); }
      for (const [id, H] of houses) if (H.ended && yr - H.ended > (civs[H.c] && civs[H.c].player ? 400 : H.n >= 6 ? 150 : 60)) houses.delete(id);      // (a great house is remembered longer, and those that ruled the player's realm longest)
      for (const [id, p] of P) if (!keep.has(id) && p.d && p.d <= yr) P.delete(id);
    }
    // a realm is no more: its house, if it ruled there, loses its throne; its ruler lives out his days in exile, or not long
    function gone(c) { const C = court[c]; if (C) { const yr = year(); const H = houses.get(C.house); if (H && !H.ended && H.c === c) closeHouse(H, yr, 'fallen'); const r = of(C.ruler); if (r) { if (r.r && !r.r[1]) { r.r[1] = yr; endLine(r, yr); } if (!r.d) r.d = yr + Math.floor(rnd() * 12); } } court[c] = null; }
    function born(c) { court[c] = null; }

    // ---------- what the Court shows, what the sim asks ----------
    function familyOf(c) {
      const C = court[c]; if (!C) return null; const yr = year(); const r = of(C.ruler); if (!r) return null; const par = of(r.p) || of(r.m); const kind = kindOf(civs[c]);
      return { ruler: r, spouse: of(r.s), kids: r.k.map(of).filter((k) => k && k.b <= yr).sort((x, y) => x.b - y.b), heir: heirOf(c, yr, kind), line: lineFor(c, yr, 6), father: of(r.p), mother: of(r.m),
        siblings: par ? par.k.map(of).filter((x) => x && x.id !== r.id && x.b <= yr).sort((x, y) => x.b - y.b) : [], house: houses.get(C.house) || null, regent: C.regent ? Object.assign({ p: of(C.regent.pid) }, C.regent) : null, passed: C.passed.slice(), kind };
    }
    const houseOf = (c) => { const C = court[c]; return C ? houses.get(C.house) || null : null; };
    const rulerOf = (c) => { const C = court[c]; return C ? of(C.ruler) : null; };
    const regentOf = (c) => { const C = court[c]; return C && C.regent ? Object.assign({ p: of(C.regent.pid) }, C.regent) : null; };
    // how one person stands to another: his son, her granddaughter, his brother, a kinsman
    function kinOf(a, b) {
      const W = (m, f) => (b && b.f ? f : m); if (!a || !b) return W('kinsman', 'kinswoman');
      const sib = (x, y) => !!x && !!y && x.id !== y.id && ((!!x.p && x.p === y.p) || (!!x.m && x.m === y.m));
      if (a.s === b.id) return W('husband', 'wife'); if (b.p === a.id || b.m === a.id) return W('son', 'daughter'); if (a.p === b.id || a.m === b.id) return W('father', 'mother');
      const pbs = [of(b.p), of(b.m)].filter(Boolean), pa = of(a.p) || of(a.m);      // (through either parent)
      if (pbs.some((x) => x.p === a.id || x.m === a.id)) return W('grandson', 'granddaughter'); if (sib(a, b)) return W('brother', 'sister');
      if (pbs.some((x) => sib(a, x))) return W('nephew', 'niece'); if (pa && sib(pa, b)) return W('uncle', 'aunt'); if (pa && pbs.some((x) => sib(pa, x))) return 'cousin';
      return W('kinsman', 'kinswoman');
    }
    // a regency unsettles a realm a little (the sim's stability asks)
    function unrest(cv) { const C = court[cv.id]; return C && C.regent ? -0.03 : 0; }

    // ---------- what the player does (court.js; sim.courtAct) ----------
    const raiseCost = (cv) => Math.round(60 + 40 * eraOf(cv));
    function mine(c, id) { const C = court[c]; const r = C && of(C.ruler); const k = of(+id); if (!r || !k) return null; if (r.k.includes(k.id)) return k; for (const x of r.k) { const q = of(x); if (q && q.k.includes(k.id)) return k; } return null; }
    function act(c, what, a, b) {
      const cv = civs[c], C = court[c]; if (!cv || !C) return 'No court'; const yr = year(); const r = of(C.ruler); if (!r) return 'No ruler';
      if (what === 'raise') { const k = mine(c, a); if (!k) return 'Not of your family'; if (!TRAITS.includes(b)) return 'No such upbringing'; if (!alive(k, yr)) return `${k.n} is dead`; if (ageOf(k, yr) >= ADULT) return `${k.n} is grown, and is what ${k.f ? 'she' : 'he'} is`;
        if (k.t === b && k.rz) return `${k.n} is being raised so already`; const cost = raiseCost(cv); if (cv.wealth < cost) return `Needs ${cost} coin`; cv.wealth -= cost; k.t = b; k.rz = 1; news.push({ kind: 'raise', c, p: k.id, t: b, year: yr }); return null; }
      if (what === 'pass') { const k = of(+a); if (!k || !r.k.includes(k.id)) return 'Only your own children can be passed over'; if (!alive(k, yr)) return `${k.n} is dead`; if (C.passed.includes(k.id)) return null;
        const before = heirOf(c, yr); C.passed.push(k.id); if (before === k && heirOf(c, yr) === k) { C.passed.pop(); return 'There is nobody else to come after you'; } news.push({ kind: 'pass', c, p: k.id, year: yr }); return null; }
      if (what === 'unpass') { C.passed = C.passed.filter((x) => x !== +a); return null; }
      if (what === 'match') { const k = mine(c, a); if (!k) return 'Not of your family'; if (!alive(k, yr)) return `${k.n} is dead`; if (k.s && alive(of(k.s), yr)) return `${k.n} is married`; if (ageOf(k, yr) < ADULT) return `${k.n} is a child`; k.s = 0; const sp = matchNoble(k, cv); news.push({ kind: 'match', c, p: k.id, s: sp.id, year: yr }); return null; }
      return 'Nothing to do';
    }

    // ---------- saved with the world ----------
    // (a person: [id, name, female, born, died, house, father, mother, spouse, character, face, realm + 1, [reign], epithet, raised,
    // wedded and children not yet thrown (only while that is so)];
    // children are found again from their parents, trailing blanks are left off)
    function save() {
      const trim = (a) => { while (a.length && (a[a.length - 1] === 0 || a[a.length - 1] === '' || a[a.length - 1] === null)) a.pop(); return a; };
      const ps = []; for (const p of P.values()) ps.push(trim([p.id, p.n, p.f ? 1 : 0, p.b, p.d, p.h, p.p, p.m, p.s, TRAITS.indexOf(p.t) + 1, p.sd === sdOf(p.id) ? 0 : p.sd, p.c + 1, p.r, p.ep, p.rz, p.kd || !p.s ? 0 : p.w, p.kd || !p.s ? 0 : 1]));
      const hs = []; for (const H of houses.values()) hs.push([H.id, H.name, H.base, H.founded, H.founder, H.seed, H.kind, H.line, H.ended, H.fate, H.c, H.n]);
      const cs = []; for (let c = 0; c < MAXC; c++) { const C = court[c]; if (C && civs[c]) cs.push([c, C.ruler, C.house, C.regent, C.passed, C.nums]); }
      return { v: 1, rs, p: ps, h: hs, c: cs, n: [nextP, nextH], st: stats };
    }
    function load(s) {
      P.clear(); houses.clear(); court.fill(null); nextP = 1; nextH = 1;
      if (!s || s.v !== 1) return false; if (s.rs !== undefined) rs = s.rs >>> 0;
      for (const x of s.p || []) P.set(x[0], { id: x[0], n: x[1] || '', f: !!x[2], b: x[3] || 0, d: x[4] || 0, h: x[5] || 0, p: x[6] || 0, m: x[7] || 0, s: x[8] || 0, k: [], t: TRAITS[(x[9] || 0) - 1] || '', sd: x[10] || sdOf(x[0]), c: (x[11] || 0) - 1, r: x[12] || null, ep: x[13] || '', rz: x[14] || 0, w: x[15] || 0, kd: x[16] ? 0 : 1 });
      const all = [...P.values()].sort((a, b) => a.b - b.b || a.id - b.id); for (const p of all) { const f = of(p.p), m = of(p.m); if (f) f.k.push(p.id); if (m && m !== f) m.k.push(p.id); }
      for (const x of s.h || []) houses.set(x[0], { id: x[0], name: x[1], base: x[2], founded: x[3], founder: x[4], seed: x[5], kind: x[6], line: x[7] || [], ended: x[8] || 0, fate: x[9] || '', c: x[10], n: x[11] || (x[7] || []).length });
      for (const x of s.c || []) court[x[0]] = { ruler: x[1], house: x[2], regent: x[3] || null, passed: x[4] || [], nums: x[5] || {} };
      if (s.n) { nextP = s.n[0]; nextH = s.n[1]; } if (s.st) Object.assign(stats, s.st);
      return true;
    }
    // a world saved before dynasties: every living ruler is made a person, with his name, sex, character and face, of a house of
    // his name where he rules by blood, with a family of the years he would have had; his realm's names are counted
    function settle() {
      for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv || !cv.ruler) continue; const r = cv.ruler; const kind = kindOf(cv);
        const p = outsider(c, kind, { name: bare(r.name), fem: !!r.fem, trait: r.trait, seed: r.seed }); p.n = r.name; p.r = [r.since === undefined ? year() : r.since, 0]; p.b = Math.min(p.b, p.r[0] - 18);
        const nums = {}; if (numbered(kind)) for (const x of cv.rulers || []) if (x && x.name) { const b = bare(x.name); nums[b] = (nums[b] || 0) + 1; }
        court[c] = { ruler: p.id, house: p.h, regent: null, passed: [], nums }; const H = houses.get(p.h); if (H) { H.founded = p.r[0]; lineRec(p); } r.pid = p.id; }
    }

    return { P, houses, court, stats, news, step, succeed, recrown, diesNow, traitOf, married, gone, born, settle, heirOf, lineFor, familyOf, houseOf, rulerOf, regentOf, kinOf, unrest, act, raiseCost,
      ageOf, alive, of, save, load, hazard, lifespan, make: person, wed, TRAITS, ADULT, dynastic, numbered };
  }

  window.DYNASTY = { create, ADULT, WED, ROMAN, HOUSE_FORMS, dynastic, numbered };
})();
