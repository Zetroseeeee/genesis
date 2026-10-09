// GENESIS stories: what happens to a realm between the great events, and asks its ruler to choose. Pure data, no drawing (the
// player reads them in tales.js, each with a painting). Classic script; exposes window.STORY.
//
// About once a turn something comes before the player's court: an heir with a cruel streak, a fever in the nursery, a preacher
// in the market, a vein of silver, raiders over the border, a scholar who says the earth goes round the sun. Each story is
// told from the realm as it is (its ruler and family, its towns, faith, neighbours, estates and coin) and offers two or three
// choices, each with what it costs and what it brings, said plainly before it is taken: stability now, coin (measured against
// what the realm takes in), authority, the estates' content, insight, renown, people, what another realm thinks of you, a
// claim, a change that lasts some years (a toll, a charter, a dyke, a monument), and now and then a chance (a fever breaks,
// ships come home, a plot is carried through). Some choices lead to a story later (the bastard you acknowledged comes back
// grown; the captain's ships return or do not). Unanswered, a story lapses after two turns into its quietest choice.
// The autopilot's realms meet the same stories, more rarely, and choose by what they need and what their rulers are like;
// the large ones' choices are written into their chronicles. What lasts (the realm's stability, income and learning for so
// many years) is kept on the realm (civ.story) and read by the simulation as a factor, like everything else.
// The module throws its own dice.
(function () {
  'use strict';
  const PACE = [200, 100, 50, 50, 40, 20, 10, 5, 5];      // (a turn's years, age by age: rule.js's)
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const he = (p) => (p && p.f ? 'she' : 'he'), him = (p) => (p && p.f ? 'her' : 'him'), his = (p) => (p && p.f ? 'her' : 'his'), He = (p) => cap(he(p)), His = (p) => cap(his(p));
  const kid = (p) => (p && p.f ? 'daughter' : 'son');
  const est = (x, k) => window.RULE.estateName(window.RULE.EK[k], x.era).toLowerCase();
  const court = (x) => (x.era >= 6 ? 'the government' : x.era === 0 ? 'the elders' : 'the court');
  const healers = (x) => (x.era <= 1 ? 'healers' : x.era <= 5 ? 'physicians' : 'doctors');
  const styled = (x, p) => (p ? (x.dyn && !(x.rp && x.rp.id === p.id) ? (p.f ? 'Princess ' : 'Prince ') : '') + p.n : 'the child');
  const ago = (x, p) => (p ? x.yr - p.b : 0);
  const TRAIT_A = { conqueror: 'a conqueror', builder: 'a builder', pious: 'a devout soul', scholar: 'a scholar', merchant: 'a merchant at heart', tyrant: 'a tyrant', steward: 'a careful steward', navigator: 'a sailor' };

  // ---------- the stories ----------
  // k, art (the painting's key in the art list), who ('player': the player's realm only), w(x) how likely where it can happen
  // (0: it cannot), make(x) who and where (null: it cannot after all), still(x, d) whether it can still be answered, title,
  // text, opts [{ t, hint, need(x, d) -> why not, fx(x, d) -> what it does, odds(x, d) -> [[chance, { text, fx }]], log }],
  // lapse (the choice made when nobody answers), follow (only ever comes after another story).
  // What fx can hold: stab (now), coin (in the realm's unit of coin, x.U), auth, est { estate: +-content }, ins (years of its
  // learning), ren (a share of what renown a realm of its age has), pop (a share of its people lost), popAdd (gained),
  // op [[realm, by]] (what they think of you), claim (a realm: a claim on its land), mod { k, stab, inc, ins, y } (for y years),
  // then [story, from, to, chance, data] (a story later), and the deeds: raise [person, character], pass, unpass, kill, rename
  // [person, name], bastard [name, age], abdicate, endRegency, marry (a realm), borrow (units), preach [cell, faith, regions],
  // colony, teach [realm, years], commission (a great person). debt: the coin may be spent past what the treasury holds.
  const LIST = [];
  const S = (o) => { LIST.push(o); return o; };

  // ----- the court and the family -----
  S({ k: 'heir_cruel', art: 'st_court', w: (x) => { const p = x.heir(); return x.dyn && p && p.t === 'tyrant' && ago(x, p) >= 10 && ago(x, p) <= 30 ? 1.3 : 0; },
    make: (x) => ({ p: x.heir().id }), still: (x, d) => x.living(d.p),
    title: () => 'The heir\'s cruel streak',
    text: (x, d) => { const p = x.P(d.p); return `${styled(x, p)}, your ${kid(p)} and heir, is ${ago(x, p)}. The servants are afraid of ${him(p)}: a groom flogged for a lame horse, a tutor sent away in tears, a hound killed for barking at ${him(p)}. ${cap(x.cap)} is watching to see what you will do.`; },
    opts: [
      { t: (x, d) => { const p = x.P(d.p); return ago(x, p) < 16 ? `Give ${him(p)} to the ${est(x, 'priests')} to be raised` : `Send ${him(p)} from court, and pass ${him(p)} over`; },
        hint: (x, d) => { const p = x.P(d.p); return ago(x, p) < 16 ? `${He(p)} will grow up devout.` : 'The next in line becomes your heir.'; },
        fx: (x, d) => { const p = x.P(d.p); return ago(x, p) < 16 ? { raise: [p.id, 'pious'], coin: -0.3, est: { priests: 0.05 } } : { pass: p.id, est: { priests: 0.03, nobles: -0.03 }, stab: -0.02 }; },
        log: (x, d) => { const p = x.P(d.p); return ago(x, p) < 16 ? `${styled(x, p)}, heir of ${x.realm}, is given to the ${est(x, 'priests')} to be raised` : `${styled(x, p)} is sent from the court of ${x.realm} and passed over`; } },
      { t: (x, d) => `Give ${him(x.P(d.p))} a command on the frontier`, hint: () => 'The army will make something of it.',
        fx: (x, d) => { const p = x.P(d.p); return ago(x, p) < 16 ? { raise: [p.id, 'conqueror'], est: { soldiers: 0.06 } } : { est: { soldiers: 0.06 }, stab: -0.01 }; },
        log: (x, d) => `${styled(x, x.P(d.p))} of ${x.realm} is given a command on the frontier` },
      { t: (x, d) => (x.P(d.p).f ? 'Let her be' : 'Boys will be boys'), hint: () => 'The court will remember that you did nothing.', fx: () => ({ est: { nobles: -0.04 } }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'heir_sickly', art: 'st_sickbed', w: (x) => (x.dyn && x.kids().some((k) => ago(x, k) >= 1 && ago(x, k) <= 13) ? (x.era >= 7 ? 0.15 : x.era === 6 ? 0.5 : 0.9) : 0),
    make: (x) => { const ks = x.kids().filter((k) => ago(x, k) >= 1 && ago(x, k) <= 13); return ks.length ? { p: x.pick(ks).id } : null; }, still: (x, d) => x.living(d.p),
    title: () => 'A fever in the nursery',
    text: (x, d) => { const p = x.P(d.p), a = ago(x, p); return `${styled(x, p)}, your ${kid(p)}, ${a < 2 ? 'not yet two years old' : 'aged ' + a}, has taken a fever that will not break. The ${healers(x)} shake their heads; the ${est(x, 'priests')} ask leave to pray at the bedside.`; },
    opts: [
      { t: (x) => `Send for the best ${healers(x)} in the land`, hint: () => 'Seven in ten such children live.', fx: () => ({ coin: -0.5 }),
        odds: (x, d) => { const p = x.P(d.p); return [[0.72, { text: `On the ninth night the fever breaks. ${styled(x, p)} is thin and weak, but ${he(p)} will live.` }], [0.28, { text: `The ${healers(x)} can do nothing. ${styled(x, p)} dies before the new moon, and ${x.cap} goes into mourning.`, fx: { kill: p.id, stab: -0.02 } }]]; },
        log: (x, d) => '' },
      { t: (x) => `Pray with the ${est(x, 'priests')} at the bedside`, hint: () => 'Half of them live.', fx: () => ({ est: { priests: 0.05 } }),
        odds: (x, d) => { const p = x.P(d.p); return [[0.55, { text: `The ${est(x, 'priests')} pray for three days and nights, and on the fourth morning ${styled(x, p)} asks for bread.` }], [0.45, { text: `The prayers go unanswered. ${styled(x, p)} dies in ${his(p)} mother's arms.`, fx: { kill: p.id, stab: -0.02 } }]]; },
        log: () => '' },
      { t: (x, d) => `Trust to ${his(x.P(d.p))} own strength`, hint: () => 'Fewer than half of them live.', fx: () => ({}),
        odds: (x, d) => { const p = x.P(d.p); return [[0.45, { text: `${styled(x, p)} is stronger than anyone thought. The fever breaks of itself.` }], [0.55, { text: `${styled(x, p)} dies in the night. The whole court weeps.`, fx: { kill: p.id, stab: -0.02 } }]]; },
        log: () => '' },
    ], lapse: 2 });

  S({ k: 'old_ruler', art: 'st_court', w: (x) => { const r = x.rp, p = x.heir(); return x.dyn && r && p && ago(x, r) >= 62 && ago(x, p) >= 20 && x.yr - x.R.since >= 10 && !x.regent() ? 1 : 0; },
    make: (x) => ({ p: x.heir().id, r: x.rp.id }), still: (x, d) => x.living(d.p) && !!x.rp && x.rp.id === d.r,
    title: () => 'The long reign',
    text: (x, d) => { const p = x.P(d.p), r = x.rp; return `You are ${ago(x, r)}, and have ruled for ${x.yr - x.R.since} years. Your hand shakes when you sign, and in the halls of ${x.cap} they speak of ${styled(x, p)}, your ${x.kin(r, p)}, as if ${he(p)} wore the crown already.`; },
    opts: [
      { t: (x, d) => `Step down, and crown ${x.P(d.p).n} yourself`, hint: (x, d) => { const p = x.P(d.p); return `${p.n}, ${TRAIT_A[p.t] || 'grown'}, rules from tomorrow; you live out your days in peace.`; }, fx: () => ({ abdicate: 1, stab: 0.03 }),
        log: (x, d) => '' },
      { t: (x, d) => `Seat ${x.P(d.p).n} at the council`, hint: () => 'Let the realm grow used to its next ruler.', need: (x) => x.authNeed(10), fx: () => ({ auth: -10, est: { nobles: 0.04, scholars: 0.02 } }),
        log: (x, d) => `${styled(x, x.P(d.p))} takes a seat at the council of ${x.realm}` },
      { t: () => 'Rule while you breathe', hint: () => 'The old lion keeps the throne, and the young ones wait.', fx: (x) => ({ est: { nobles: -0.05 }, mod: { k: 'old', stab: -0.02, y: x.turn } }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'regent_grasp', art: 'st_court', w: (x) => { const R = x.regent(); return R && R.p && ago(x, x.rp) >= 7 ? 1.2 : 0; },
    make: (x) => ({ g: x.regent().pid, r: x.rp.id }), still: (x, d) => { const R = x.regent(); return !!R && R.pid === d.g && !!x.rp && x.rp.id === d.r; },
    title: () => 'The regent\'s hand',
    text: (x, d) => { const g = x.P(d.g), r = x.rp; return `${x.R.title} ${x.R.name} is ${ago(x, r)}, and ${g.n} rules for ${him(r)} until ${he(r)} is grown. The regent has filled the council with friends, and the treasury pays for their feasts. Some say the regency will not end when ${x.R.name} comes of age.`; },
    opts: [
      { t: () => 'Rein the regent in', hint: () => 'The council is cleared of the regent\'s friends, and the feasts end.', need: (x) => x.authNeed(25), fx: () => ({ auth: -25, coin: 0.3, est: { nobles: -0.06 }, stab: 0.03 }),
        log: (x, d) => `The regent ${x.P(d.g).n} is reined in, and the council of ${x.realm} cleared` },
      { t: (x) => `Declare ${x.R.name} of age`, hint: (x) => `${x.R.name}, ${TRAIT_A[x.rp.t] || 'young'}, rules ${x.rp.f ? 'herself' : 'himself'} from now on.`, need: (x) => (ago(x, x.rp) < 13 ? `${x.R.name} is only ${ago(x, x.rp)}` : null),
        fx: () => ({ endRegency: 1, stab: -0.03, est: { nobles: -0.04 } }), log: (x) => `${x.R.title} ${x.R.name} is declared of age at ${ago(x, x.rp)}` },
      { t: () => 'Let the regent rule', hint: () => 'The great families do well out of it.', fx: () => ({ coin: -0.4, est: { nobles: 0.05 } }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'bastard', art: 'st_court', w: (x) => { const r = x.rp; return x.dyn && r && !r.f && ago(x, r) >= 28 && ago(x, r) <= 64 && x.era >= 1 && x.era <= 6 ? 0.6 : 0; },
    make: (x) => ({ n: x.freshName(), a: 6 + Math.floor(x.rnd() * 10), i: x.town() }),
    title: () => 'A child out of wedlock',
    text: (x, d) => `A woman of ${x.cell(d.i)} has come to ${court(x)} with a boy of ${d.a}. She says he is yours, and that his name is ${d.n}. He has your eyes, the servants whisper, and the whole court has seen it.`,
    opts: [
      { t: () => 'Acknowledge him as your son', hint: () => 'He will stand last in your line, and everyone will know whose son he is.', fx: (x, d) => ({ bastard: [d.n, d.a], est: { priests: -0.04 }, then: ['bastard_claim', Math.max(10, 16 - d.a + 2), Math.max(14, 16 - d.a + 10), 0.55] }),
        log: (x, d) => `${x.R.title} ${x.R.name} of ${x.realm} acknowledges ${d.n}, a son born out of wedlock` },
      { t: () => 'Pay the mother to take him far away', hint: () => 'Nobody will speak of it again, for a price.', fx: () => ({ coin: -0.5 }), log: () => '' },
      { t: () => 'Have them turned from the gate', hint: () => 'The story will be told in the taverns.', fx: () => ({ est: { priests: 0.02 }, stab: -0.01 }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'bastard_claim', art: 'st_plot', follow: true, w: (x, d) => { const p = d && x.P(d.p); return p && x.living(d.p) && ago(x, p) >= 16 && p.c === x.c && x.dyn && x.rp && x.rp.h === p.h && x.rp.id !== p.id ? 1 : 0; },
    make: (x, d) => d, still: (x, d) => x.living(d.p),
    title: () => 'The acknowledged son',
    text: (x, d) => { const p = x.P(d.p); const f = x.P(p.p || p.m); return `${p.n}, the acknowledged son of ${f && f.id === x.rp.id ? 'yours' : f ? f.n : 'the old king'}, is ${ago(x, p)} and grown. He has friends among the ${est(x, 'soldiers')}, and he has come to ask to be made legitimate. The ${est(x, 'nobles')} wonder what he will ask next.`; },
    opts: [
      { t: () => 'Make him legitimate', hint: () => 'He takes his place in the line by his birth.', need: (x) => x.authNeed(25), fx: (x, d) => ({ unpass: d.p, auth: -25, est: { priests: -0.06, nobles: -0.05, soldiers: 0.04 } }),
        log: (x, d) => `${x.P(d.p).n} is made legitimate in ${x.realm}` },
      { t: (x) => `Give him lands far from ${x.cap}`, hint: () => 'A lord of the marches, and out of the way.', fx: () => ({ coin: -0.8, est: { nobles: -0.02 } }), log: (x, d) => `${x.P(d.p).n} is given lands on the marches of ${x.realm}` },
      { t: () => 'Refuse him', hint: () => 'He will not forget it.', fx: (x, d) => ({ est: { soldiers: -0.05 }, stab: -0.02, then: ['plot', 3, 10, 0.45, { by: d.p }] }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'birth', art: 'st_birth', who: 'player', w: () => 0, follow: true,
    make: (x, d) => { const p = x.P(d.p); if (!p) return null; const N = x.names(p.id); if (!N) return null; const a = N.after;
      const rel = !a ? '' : a.id === p.p || a.id === p.m ? (a.f ? 'mother' : 'father') : [x.P(p.p), x.P(p.m)].some((q) => q && (q.p === a.id || q.m === a.id)) ? (a.f ? 'grandmother' : 'grandfather') : '';
      return { p: p.id, n0: N.given, n1: N.forebear || x.freshName(), why: a ? (rel ? `after ${his(p)} ${rel}` : 'after the founder of your house') : 'a name of your people', n2: N.fresh }; },
    still: (x, d) => x.living(d.p),
    title: (x, d) => `A ${kid(x.P(d.p))} is born`,
    text: (x, d) => { const p = x.P(d.p), m = x.P(p.m); return `${m && x.rp && m.id === x.rp.id ? 'You have' : (m ? m.n : 'The queen') + ' has'} given birth to a ${kid(p)}. The midwives say the child is strong, and the ${x.era >= 4 ? 'bells' : 'drums'} of ${x.cap} are sounding. ${cap(court(x))} waits for a name, and the city for a feast.`; },
    opts: [
      { t: (x, d) => `Name ${him(x.P(d.p))} ${d.n1}, ${d.why}, and feast the city`, hint: () => 'The city drinks to the child\'s health.', fx: (x, d) => ({ rename: [d.p, d.n1], coin: -0.4, stab: 0.03 }), log: () => '' },
      { t: (x, d) => `Name ${him(x.P(d.p))} ${d.n2}, and give alms in ${his(x.P(d.p))} name`, hint: () => 'The poor will bless the name.', fx: (x, d) => ({ rename: [d.p, d.n2], coin: -0.2, est: { farmers: 0.04 } }), log: () => '' },
      { t: (x, d) => `Name ${him(x.P(d.p))} ${d.n0}, quietly, at the temple`, hint: () => 'As the family has always done.', fx: (x, d) => ({ rename: [d.p, d.n0], est: { priests: 0.03 } }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'wedding', art: 'st_wedding', who: 'player', w: () => 0, follow: true,
    make: (x, d) => (x.P(d.a) && x.P(d.b) ? d : null), still: (x, d) => x.living(d.a),
    title: () => 'A wedding at court',
    text: (x, d) => { const a = x.P(d.a), b = x.P(d.b), o = x.civ(d.o); return `${styled(x, a)} is to wed ${b.n}${o ? ' of ' + x.name(o) : ''}. The cooks are hiring every pair of hands in ${x.cap}, and every family of note expects a seat at the feast.`; },
    opts: [
      { t: () => 'A feast they will speak of for a generation', hint: () => 'Renown, and the great families honoured.', fx: (x, d) => ({ coin: -1, stab: 0.03, ren: 0.06, renK: 'wedding', est: { nobles: 0.05 }, op: d.o >= 0 ? [[d.o, 6]] : [] }), log: (x, d) => `${styled(x, x.P(d.a))} of ${x.realm} weds ${x.P(d.b).n}, with a feast spoken of for a generation` },
      { t: () => 'A fitting ceremony, and no more', hint: () => 'As it should be.', fx: () => ({ coin: -0.3, est: { nobles: 0.01 } }), log: () => '' },
      { t: () => 'Bread for the poor instead of a feast', hint: () => 'The great families are put out.', fx: () => ({ coin: -0.3, est: { farmers: 0.05, nobles: -0.03 } }), log: () => '' },
    ], lapse: 1 });

  S({ k: 'suitor', art: 'st_envoys', w: (x) => (x.dyn && x.era >= 1 && x.single().length && x.suitors().length ? 0.8 : 0),
    make: (x) => { const s = x.suitors(), p = x.single(); return s.length && p.length ? { o: x.pick(s).id, p: p[0].id } : null; },
    still: (x, d) => x.living(d.p) && !!x.civ(d.o) && !x.cannotMarry(d.o),
    title: (x, d) => `A suitor from ${x.name(x.civ(d.o))}`,
    text: (x, d) => { const o = x.civ(d.o), p = x.P(d.p); return `Envoys of ${o.ruler ? o.ruler.title + ' ' + o.ruler.name : 'the ruler'} of ${x.name(o)} have come with gifts and a proposal: a marriage between their house and yours. They speak warmly of ${styled(x, p)}, and of the friendship it would seal.`; },
    opts: [
      { t: () => 'Accept the match', hint: () => 'The two houses are joined: a royal marriage between your realms.', fx: (x, d) => ({ marry: d.o, op: [[d.o, 8]] }), log: () => '' },
      { t: () => 'Accept, if they bring a dowry', hint: () => 'They will pay, and remember that you asked.', fx: (x, d) => ({ marry: d.o, coin: 0.6, op: [[d.o, -6]] }), log: () => '' },
      { t: () => 'Decline, with courtesy', hint: () => 'They will be offended.', fx: (x, d) => ({ op: [[d.o, -8]] }), log: () => '' },
    ], lapse: 2 });

  // ----- faith -----
  S({ k: 'preacher', art: 'st_preacher', w: (x) => (x.era >= 1 && x.towns() >= 1 && x.preached() ? 0.8 : 0),
    make: (x) => { const g = x.preached(); return g ? { g: g.f, o: g.o, i: x.town() } : null; }, still: (x, d) => x.faithName(d.g) !== '',
    title: (x, d) => `A preacher in ${x.cell(d.i)}`,
    text: (x, d) => { const mine = x.stateFaith(); return `In the market of ${x.cell(d.i)} a preacher of ${x.faithName(d.g)} draws a crowd every evening. He speaks against ${mine ? 'the ' + est(x, 'priests') + ' of ' + x.faithName(mine) : 'the old gods'}, and every night there are more to hear him.`; },
    opts: [
      { t: () => 'Let him preach', hint: (x, d) => `${cap(x.faithName(d.g))} will take root about ${x.cell(d.i)}.`, fx: (x, d) => ({ preach: [d.i, d.g, 2 + Math.min(6, Math.floor(x.cells() / 40))], est: { priests: -0.07, merchants: 0.03, scholars: 0.02 }, op: d.o >= 0 ? [[d.o, 8]] : [] }),
        log: (x, d) => `${cap(x.faithName(d.g))} is preached freely in ${x.cell(d.i)}` },
      { t: () => 'Have him driven out', hint: () => 'The temples are pleased; his followers are not.', fx: (x, d) => ({ est: { priests: 0.06 }, stab: -0.01, op: d.o >= 0 ? [[d.o, -6]] : [] }), log: (x, d) => `A preacher of ${x.faithName(d.g)} is driven out of ${x.cell(d.i)}` },
      { t: (x) => `Bring him to ${court(x)} to dispute with the ${est(x, 'priests')}`, hint: () => 'Whoever wins, the learned will be talking of it for years.', need: (x) => x.authNeed(10), fx: () => ({ auth: -10, ins: 0.6, est: { scholars: 0.05, priests: -0.03 } }), log: (x, d) => `A preacher of ${x.faithName(d.g)} disputes with the ${est(x, 'priests')} before the court of ${x.realm}` },
    ], lapse: 0 });

  S({ k: 'pilgrims', art: 'st_pilgrims', w: (x) => (x.era >= 1 && x.holy() ? 0.8 : 0),
    make: (x) => { const h = x.holy(); return h ? { i: h.i, f: h.f, o: h.o } : null; }, still: (x, d) => x.ownerOf(d.i) === (d.o >= 0 ? d.o : x.c),
    title: (x, d) => (d.o < 0 ? 'The road to the holy city' : `The road to ${x.cell(d.i)}`),
    text: (x, d) => (d.o < 0 ? `Pilgrims crowd the roads to ${x.cell(d.i)}, the holy city of ${x.faithName(d.f)}. They sleep in the fields, drink from the ditches and pray in the streets, and more come every spring.`
      : `Your people long to see ${x.cell(d.i)}, the holy city of ${x.faithName(d.f)}, which ${x.name(x.civ(d.o))} holds. Every year more of them set out on the road, and not all of them come home.`),
    opts: [
      { t: (x, d) => (d.o < 0 ? 'Build hostels and wells along the road' : 'Send a royal pilgrimage, with gifts for the shrines'), hint: (x, d) => (d.o < 0 ? 'The pilgrims\' coin stays in the realm.' : 'The faithful will love you for it.'),
        fx: (x, d) => (d.o < 0 ? { coin: -1, est: { priests: 0.05 }, mod: { k: 'hostels', inc: 0.05, y: 2 * x.turn } } : { coin: -0.6, est: { priests: 0.06 }, stab: 0.02, op: [[d.o, 8]] }), log: (x, d) => (d.o < 0 ? `Hostels are built on the pilgrims' road to ${x.cell(d.i)}` : `A royal pilgrimage of ${x.realm} goes to ${x.cell(d.i)}`) },
      { t: (x, d) => (d.o < 0 ? 'Charge every pilgrim a toll' : `Demand that ${x.name(x.civ(d.o))} give it up`), hint: (x, d) => (d.o < 0 ? 'Good coin, and grumbling at the shrines.' : 'A claim on their land, and their enmity.'),
        need: (x, d) => (d.o >= 0 && !x.touches(d.o) ? 'You share no border with them' : null),
        fx: (x, d) => (d.o < 0 ? { coin: 0.7, est: { priests: -0.06 } } : { claim: d.o, op: [[d.o, -15]], est: { priests: 0.08 } }), log: (x, d) => (d.o < 0 ? `A toll is laid on the pilgrims of ${x.cell(d.i)}` : `${cap(x.realm)} demands ${x.cell(d.i)} of ${x.name(x.civ(d.o))}`) },
      { t: (x, d) => (d.o < 0 ? 'Let them come as they will' : 'Let those who wish go, at their own cost'), hint: () => 'Nothing changes.', fx: () => ({}), log: () => '' },
    ], lapse: 2 });

  S({ k: 'temple_lands', art: 'st_temple', w: (x) => (x.era >= 2 && x.era <= 5 && x.temples() >= 2 && x.power('priests') >= 0.12 ? 0.7 : 0),
    make: () => ({}), title: () => 'The lands of the temples',
    text: () => 'The temples hold a fifth of the good land of the realm, and pay nothing for it. Your steward has drawn up a map of their fields and forests, and a plan.',
    opts: [
      { t: () => 'Seize the temple lands', hint: () => 'A fortune for the treasury, and the temples\' undying hatred.', need: (x) => x.authNeed(20), fx: () => ({ coin: 2, auth: -20, est: { priests: -0.16, nobles: 0.03 }, stab: -0.05 }), log: (x) => `The lands of the temples are seized by the crown of ${x.realm}` },
      { t: () => 'Tax them as other land is taxed', hint: () => 'A little more every year.', fx: (x) => ({ est: { priests: -0.08 }, mod: { k: 'templetax', inc: 0.05, y: 2 * x.turn } }), log: (x) => `The temples of ${x.realm} are taxed like other landowners` },
      { t: () => 'Confirm their lands for ever', hint: () => 'The temples will remember it in their prayers.', fx: () => ({ est: { priests: 0.1 }, auth: 5 }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'omen', art: 'ev_comet', w: (x) => (x.era <= 5 ? 0.55 : 0),
    make: () => ({}), title: () => 'A star with a tail',
    text: (x) => `A star with a burning tail hangs over ${x.cap} night after night. The people sleep badly. The ${est(x, 'priests')} say it is a sign, and will say of what for a price.`,
    opts: [
      { t: () => 'Hold great rites to turn the omen aside', hint: () => 'The people sleep again.', fx: () => ({ coin: -0.4, est: { priests: 0.05 }, stab: 0.04 }), log: (x) => `Great rites are held in ${x.cap} under the comet` },
      { t: (x) => (x.knows('astronomy') ? `Have the ${est(x, 'scholars')} chart its path` : 'Proclaim it a sign of the gods\' favour to you'), hint: (x) => (x.knows('astronomy') ? 'It will come again, they say, and they will say when.' : 'Your word carries further under such a sky.'),
        fx: (x) => (x.knows('astronomy') ? { ins: 0.5, est: { scholars: 0.06, priests: -0.03 } } : { auth: 8, est: { priests: -0.04 } }), log: (x) => (x.knows('astronomy') ? `The ${est(x, 'scholars')} of ${x.realm} chart the path of a comet` : '') },
      { t: () => 'Pay it no heed', hint: () => 'It will pass. The fear may not.', fx: () => ({ stab: -0.03 }), log: () => '' },
    ], lapse: 2 });

  // ----- culture -----
  S({ k: 'patron', art: 'st_artist', who: 'player', w: (x) => (x.era >= 2 && x.master() ? 1 : 0),
    make: (x) => { const g = x.master(); return g ? { g: g.id } : null; }, still: (x, d) => { const g = x.great(d.g); return !!g && g.c === x.c && g.dies >= x.yr; },
    title: () => 'A master seeks a patron',
    text: (x, d) => { const g = x.great(d.g); return `${g.name}, ${x.kindName(g).toLowerCase()} of ${x.cell(g.at)}, asks for an audience. ${g.fem ? 'She' : 'He'} has a work in mind that would carry the name of ${x.realm} down the ages, if ${court(x)} will pay for it.`; },
    opts: [
      { t: () => 'Commission the work', hint: (x, d) => `${x.great(d.g).name} begins at once.`, need: (x, d) => x.cannotCommission(d.g), fx: (x, d) => ({ commission: d.g }), log: () => '' },
      { t: (x, d) => `Grant ${x.great(d.g).fem ? 'her' : 'him'} a pension`, hint: () => 'Fed and housed, a master works at a master\'s pace.', fx: () => ({ coin: -0.4, ren: 0.05, renK: 'patron', est: { artisans: 0.02 } }), log: (x, d) => `${x.great(d.g).name} is granted a pension by the court of ${x.realm}` },
      { t: () => 'The treasury has other needs', hint: () => 'There are other courts.', fx: () => ({}), log: () => '' },
    ], lapse: 2 });

  S({ k: 'library_fire', art: 'st_library', w: (x) => (x.era >= 2 && x.era <= 6 && (x.acad() >= 1 || x.knows('letters')) && x.towns() >= 2 ? 0.45 : 0),
    make: (x) => ({ i: x.town('academy') }), title: () => 'Fire in the library',
    text: (x, d) => `Fire has broken out in the great library of ${x.cell(d.i)}. The ${est(x, 'scholars')} are carrying armfuls of ${x.era >= 5 ? 'books' : 'scrolls'} into the street, and the flames are already in the upper rooms.`,
    opts: [
      { t: () => 'Every hand in the city to the buckets', hint: () => 'Most of it can be saved.', fx: () => ({ coin: -0.3, est: { scholars: 0.04 } }), log: () => '' },
      { t: () => 'Build it again, greater than before', hint: () => 'The new library will draw the learned from far away.', fx: () => ({ coin: -1.3, ins: 0.4, ren: 0.05, renK: 'library', est: { scholars: 0.08 } }), log: (x, d) => `The library of ${x.cell(d.i)} burns, and is built again, greater than before` },
      { t: (x) => `Let the ${est(x, 'scholars')} save what they can`, hint: () => 'What is lost is lost.', fx: () => ({ est: { scholars: -0.07 }, stab: -0.01 }), log: (x, d) => `The library of ${x.cell(d.i)} burns` },
    ], lapse: 2 });

  S({ k: 'festival', art: 'st_festival', w: (x) => (x.cv.stability > 0.25 && x.cv.stability < 0.95 ? 0.6 : 0),
    make: () => ({}), title: (x) => (x.era >= 6 ? 'A holiday for the people' : 'The festival of the harvest'),
    text: (x) => (x.era >= 6 ? `The people of ${x.cap} want a holiday: a day of parades, fireworks over the river and dancing in the streets until morning.` : `The harvest is in, and the people of ${x.cap} want a festival such as their grandparents remember: fires in the square, music, and dancing until dawn.`),
    opts: [
      { t: () => 'Pay for it from the treasury', hint: () => 'They will remember it for years.', fx: (x) => ({ coin: -0.5, stab: 0.03, mod: { k: 'feast', stab: 0.02, y: x.turn } }), log: () => '' },
      { t: (x) => (x.era >= 2 ? `Let the ${est(x, 'merchants')} and the guilds pay` : 'Let every family bring what it can'), hint: () => 'A festival all the same.', fx: (x) => (x.era >= 2 ? { stab: 0.03, est: { merchants: -0.04, artisans: -0.02 } } : { stab: 0.02, est: { farmers: -0.02 } }), log: () => '' },
      { t: () => 'No festival this year', hint: () => 'A grey year.', fx: () => ({ stab: -0.02 }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'monument', art: 'st_monument', w: (x) => (x.era >= 1 && x.era <= 7 && x.knows('masonry') && x.cv.wealth >= 2 * x.U ? (x.trait() === 'builder' ? 1.2 : 0.45) : 0),
    make: (x) => ({ n: x.freshName() }), title: () => 'A monument for the ages',
    text: (x, d) => `You have seen the drawings of ${d.n}, the master builder: a monument greater than any in the known world, to stand over ${x.cap} for a thousand years. The quarries are ready, and so are the people, if you will pay them.`,
    opts: [
      { t: () => 'Build it', hint: () => 'A wonder of the age, and pride for generations.', need: (x) => x.coinNeed(3), fx: (x) => ({ coin: -3, ren: 0.3, renK: 'monument', renT: 6, est: { artisans: 0.05 }, mod: { k: 'monument', stab: 0.03, y: 3 * x.turn } }), log: (x) => `A great monument rises over ${x.cap}` },
      { t: () => 'Something more modest', hint: () => 'Fine work, at a sensible price.', fx: (x) => ({ coin: -1, ren: 0.1, renK: 'monument', renT: 4, mod: { k: 'monument', stab: 0.01, y: 2 * x.turn } }), log: () => '' },
      { t: () => 'Not in my lifetime', hint: () => 'The drawings go back in their case.', fx: () => ({}), log: () => '' },
    ], lapse: 2 });

  // ----- coin and trade -----
  S({ k: 'moneylenders', art: 'st_bank', w: (x) => (x.era >= 2 && x.era <= 5 && x.canBorrow() && x.towns() >= 2 ? 0.55 : 0),
    make: (x) => ({ i: x.town('market') }), title: () => 'The moneylenders\' offer',
    text: (x, d) => `The moneylenders of ${x.cell(d.i)} offer ${court(x)} a loan at a rate kinder than any it has been offered. In return they ask only to trade in ${x.cap} without paying its tolls.`,
    opts: [
      { t: () => 'Take the loan, and grant them the right', hint: () => 'Coin now, to be repaid with interest; a little less from the tolls.', fx: (x) => ({ borrow: 1.5, est: { merchants: 0.05 }, mod: { k: 'tolls', inc: -0.02, y: 2 * x.turn } }), log: () => '' },
      { t: () => 'Grant them a charter, and tax their profits', hint: () => 'More every year; the temples frown on usury.', fx: (x) => ({ est: { merchants: 0.04, priests: -0.04 }, mod: { k: 'charter', inc: 0.04, y: 2 * x.turn } }), log: (x, d) => `The moneylenders of ${x.cell(d.i)} are granted a charter` },
      { t: () => 'Send them away', hint: () => 'They will lend to someone else.', fx: () => ({ est: { merchants: -0.04 } }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'coiners', art: 'st_bank', w: (x) => (x.era >= 2 && x.era <= 5 && x.knows('coinage') && x.towns() >= 2 ? 0.45 : 0),
    make: (x) => ({ i: x.town('market') }), title: () => 'False coin',
    text: (x, d) => `Clipped and false coins are passing in the markets of ${x.cell(d.i)}. The merchants weigh every piece now, and prices climb by the week.`,
    opts: [
      { t: () => 'Call in the coin and strike it anew', hint: () => 'Costly, and honest.', fx: () => ({ coin: -0.8, est: { merchants: 0.06 } }), log: (x) => `The coin of ${x.realm} is called in and struck anew` },
      { t: () => 'Hang the coiners in the square', hint: () => 'A lesson for the rest.', fx: () => ({ auth: 6, stab: 0.01, est: { merchants: 0.02 } }), log: (x, d) => `Coiners are hanged in the square of ${x.cell(d.i)}` },
      { t: () => 'Let the market sort it out', hint: () => 'Trade will suffer for a while.', fx: (x) => ({ mod: { k: 'falsecoin', inc: -0.04, y: x.turn } }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'guild', art: 'st_bank', w: (x) => (x.era >= 4 && x.era <= 5 && x.knows('guilds') && x.towns() >= 2 && x.power('artisans') >= 0.08 ? 0.45 : 0),
    make: (x) => ({ i: x.town() }), title: () => 'The guilds ask for a monopoly',
    text: (x, d) => `The masters of the guilds of ${x.cell(d.i)} ask for a charter: nobody to work their trades anywhere in the realm unless he belongs to a guild.`,
    opts: [
      { t: () => 'Grant the charter', hint: () => 'The guilds rejoice; the merchants do not.', fx: () => ({ est: { artisans: 0.1, merchants: -0.05 } }), log: (x) => `The guilds of ${x.realm} are granted their monopoly` },
      { t: () => 'Sell them the charter', hint: () => 'A good price, and no friends made.', fx: () => ({ coin: 0.8, est: { artisans: 0.04, merchants: -0.07 } }), log: (x) => `The guilds of ${x.realm} buy their monopoly` },
      { t: () => 'Refuse them', hint: () => 'The workshops grumble.', fx: () => ({ est: { artisans: -0.07 } }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'silver', art: 'st_mine', w: (x) => (x.era >= 1 && x.era <= 6 && x.knows('mining') ? (x.mines() > 0 ? 0.8 : 0.35) : 0),
    make: (x) => ({ i: x.town() }), title: () => 'A vein of silver',
    text: (x, d) => `Miners in the hills above ${x.cell(d.i)} have struck a vein of silver as wide as a man's hand. Prospectors are already on the road.`,
    opts: [
      { t: () => 'Make it the crown\'s mine', hint: () => 'Silver for the treasury for years to come.', fx: (x) => ({ est: { nobles: -0.04, farmers: -0.02 }, mod: { k: 'silver', inc: 0.08, y: 2 * x.turn } }), log: (x, d) => `Silver is found above ${x.cell(d.i)}, and mined for the crown` },
      { t: (x) => `Lease it to the ${est(x, 'merchants')}`, hint: () => 'Coin now.', fx: () => ({ coin: 1.4, est: { merchants: 0.05 } }), log: () => '' },
      { t: () => 'Let the finders keep it', hint: () => 'A boom town in the hills, and goodwill.', fx: () => ({ est: { farmers: 0.03, artisans: 0.03 }, stab: 0.02 }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'fair', art: 'st_fair', w: (x) => (x.era >= 2 && x.era <= 6 && x.markets() >= 1 && x.partner() ? 0.55 : 0),
    make: (x) => { const o = x.partner(); return o ? { o: o.id, i: x.town('market') } : null; }, still: (x, d) => !!x.civ(d.o),
    title: () => 'A great fair',
    text: (x, d) => `Merchants from ${x.name(x.civ(d.o))} and from farther still ask leave to hold a great fair at ${x.cell(d.i)} every summer: silk, spices and wine for the realm, and coin for whoever keeps the peace of the fair.`,
    opts: [
      { t: () => 'Grant it, free of tolls', hint: () => 'Trade will grow.', fx: (x, d) => ({ est: { merchants: 0.05 }, op: [[d.o, 8]], mod: { k: 'fair', inc: 0.05, y: 2 * x.turn } }), log: (x, d) => `A great fair is held every summer at ${x.cell(d.i)}` },
      { t: () => 'Grant it, and charge tolls', hint: () => 'Coin now, and less trade.', fx: (x, d) => ({ coin: 0.7, op: [[d.o, -3]], mod: { k: 'fair', inc: 0.02, y: 2 * x.turn } }), log: (x, d) => `A fair is held at ${x.cell(d.i)}, and its tolls paid to the crown` },
      { t: () => 'Refuse: foreigners bring trouble', hint: () => 'The merchants are disappointed.', fx: () => ({ est: { merchants: -0.04, priests: 0.02 } }), log: () => '' },
    ], lapse: 2 });

  // ----- the land -----
  S({ k: 'bad_harvest', art: 'ev_famine', w: (x) => (x.era <= 6 && x.knows('farming') ? (x.food() < 0.8 ? 1 : 0.45) : 0),
    make: (x) => ({ i: x.town() }), title: () => 'The harvest fails',
    text: (x, d) => `Rain when it was not wanted and none when it was: the harvest has failed about ${x.cell(d.i)}. Bread costs twice what it did, and the poor are eating their seed corn.`,
    opts: [
      { t: () => 'Open the granaries, and buy grain abroad', hint: () => 'Nobody starves.', fx: () => ({ coin: -0.9, est: { farmers: 0.05 }, stab: 0.01 }), log: () => '' },
      { t: (x) => (x.era >= 2 ? 'Fix the price of bread' : 'Share out what there is'), hint: (x) => (x.era >= 2 ? 'The merchants will hoard.' : 'Hungry, but together.'), fx: (x) => (x.era >= 2 ? { est: { merchants: -0.07, farmers: 0.03 } } : { pop: 0.01, stab: -0.01 }), log: () => '' },
      { t: () => 'The people must endure', hint: () => 'Some will not.', fx: () => ({ pop: 0.02, stab: -0.04, est: { farmers: -0.05 } }), log: (x) => `Famine in ${x.realm}` },
    ], lapse: 2 });

  S({ k: 'plague', art: 'ev_plague', w: (x) => (x.era >= 1 && x.era <= 7 && x.towns() >= 2 ? (x.ports() ? 0.55 : 0.35) : 0),
    make: (x) => ({ i: x.town('port') }), title: (x, d) => `Sickness in ${x.cell(d.i)}`,
    text: (x, d) => (x.era >= 6 ? `A fever no doctor knows has come to ${x.cell(d.i)}. The hospitals are full, the schools are closed, and those who can are leaving the city.` : `A sickness has come to ${x.cell(d.i)} with the ${x.ports() ? 'ships' : 'caravans'}: fever, black swellings, death in three days. The dead are buried at night, and those who can are leaving.`),
    opts: [
      { t: () => 'Close the gates and the harbours', hint: () => 'Fewer will die; trade stops for a while.', fx: (x) => ({ pop: 0.01, est: { merchants: -0.05 }, mod: { k: 'quarantine', inc: -0.08, y: Math.max(3, x.turn / 2) } }), log: (x, d) => `${cap(x.cell(d.i))} is shut against the plague` },
      { t: (x) => (x.era >= 3 ? `Send the ${healers(x)}, and burn the bedding` : `Pray, and let the ${est(x, 'priests')} lead processions`), hint: (x) => (x.era >= 3 ? 'Costly, and it helps.' : 'The gods may hear.'), fx: (x) => (x.era >= 3 ? { coin: -0.7, pop: 0.02 } : { pop: 0.035, est: { priests: 0.05 } }), log: () => '' },
      { t: () => 'Let it run its course', hint: () => 'It will burn itself out.', fx: () => ({ pop: 0.05, stab: -0.03 }), log: (x, d) => `Plague in ${x.cell(d.i)}` },
    ], lapse: 2 });

  S({ k: 'flood', art: 'ev_flood', w: (x) => (x.river() >= 0 ? 0.45 : 0),
    make: (x) => ({ i: x.river() }), title: () => 'The river rises',
    text: (x, d) => `After weeks of rain the river has burst its banks above ${x.cell(d.i)}. The fields are under water, and the lower town is wading.`,
    opts: [
      { t: () => 'Raise dykes, and drain the fields', hint: () => 'The next flood will find the river held.', fx: (x) => ({ coin: -1, est: { farmers: 0.04 }, mod: { k: 'dykes', stab: 0.01, y: 3 * x.turn } }), log: (x, d) => `Dykes are raised along the river at ${x.cell(d.i)}` },
      { t: () => 'Feed those who lost their harvest', hint: () => 'The farmers will not forget it.', fx: () => ({ coin: -0.5, est: { farmers: 0.06 } }), log: () => '' },
      { t: () => 'Wait for the waters to fall', hint: () => 'They always do.', fx: () => ({ pop: 0.015, est: { farmers: -0.05 } }), log: (x, d) => `Floods at ${x.cell(d.i)}` },
    ], lapse: 2 });

  S({ k: 'bandits', art: 'st_bandits', w: (x) => (x.era >= 1 && x.era <= 6 && x.towns() >= 2 && (x.markets() > 0 || x.knows('caravans')) ? 0.55 : 0),
    make: (x) => { const a = x.town(), b = x.town(a); return b >= 0 && b !== a ? { a, b } : null; }, title: () => 'Brigands on the road',
    text: (x, d) => `Brigands hold the road between ${x.cell(d.a)} and ${x.cell(d.b)}. Two caravans have been taken this month, and the merchants travel only with armed men.`,
    opts: [
      { t: () => 'Send soldiers to clear the road', hint: () => 'Safe roads, and a busy army.', fx: () => ({ coin: -0.4, stab: 0.01, est: { soldiers: 0.04, merchants: 0.05 } }), log: (x, d) => `The road from ${x.cell(d.a)} to ${x.cell(d.b)} is cleared of brigands` },
      { t: () => 'Pardon them, and hire them as road wardens', hint: () => 'Cheaper, and the soldiers think it shameful.', fx: () => ({ coin: -0.2, est: { soldiers: -0.05, merchants: 0.03 } }), log: () => '' },
      { t: () => 'Let the merchants hire their own guards', hint: () => 'Trade suffers.', fx: (x) => ({ est: { merchants: -0.05 }, mod: { k: 'roads', inc: -0.03, y: x.turn } }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'settlers', art: 'st_settlers', w: (x) => (x.cells() >= 6 ? (x.troubled() ? 1 : 0.25) : 0),
    make: (x) => { const o = x.troubled(); return { o: o ? o.id : -1, why: o ? (o.wars && Object.keys(o.wars).length ? 'war' : 'hunger and disorder') : 'hunger', n: 200 + Math.floor(x.rnd() * 18) * 50 }; },
    title: () => 'Strangers at the border',
    text: (x, d) => `${d.n.toLocaleString()} families have come over the border${d.o >= 0 && x.civ(d.o) ? ' from ' + x.name(x.civ(d.o)) : ''}, fleeing ${d.why}. They have their oxen and their tools with them, and they ask for land to work.`,
    opts: [
      { t: () => 'Give them land on the frontier', hint: () => 'More hands, and new neighbours for your villages.', fx: () => ({ popAdd: 0.012, stab: -0.01, est: { farmers: 0.02 } }), log: (x) => `Refugees are settled on the frontier of ${x.realm}` },
      { t: (x) => (x.era >= 2 ? 'Settle them in the towns as workers' : 'Let them join our villages'), hint: () => 'They will be put to work.', fx: (x) => (x.era >= 2 ? { popAdd: 0.008, est: { artisans: 0.04 } } : { popAdd: 0.008 }), log: () => '' },
      { t: () => 'Turn them back', hint: () => 'They will go elsewhere, or nowhere.', fx: (x, d) => ({ op: d.o >= 0 ? [[d.o, -2]] : [] }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'ships', art: 'st_ships', w: (x) => (x.era >= 4 && x.era <= 6 && x.ports() > 0 && (x.knows('compass') || x.knows('navigation')) ? (x.trait() === 'navigator' ? 1.2 : 0.5) : 0),
    make: (x) => ({ n: x.freshName(), i: x.town('port'), dir: x.pick(['west', 'east', 'south', 'north']) }), title: () => 'Ships for the unknown sea',
    text: (x, d) => `${d.n}, a captain of ${x.cell(d.i)}, asks for three ships and a year's victuals. He means to sail ${d.dir} until he finds land, or the edge of the world.`,
    opts: [
      { t: () => 'Fund three ships', hint: () => 'Seven in ten such voyages find something.', fx: (x, d) => ({ coin: -1.2, then: ['ships_back', 2, 6, 1, { n: d.n, i: d.i, s: 0.7 }] }), log: (x, d) => `${d.n} sails ${d.dir} from ${x.cell(d.i)} with three ships` },
      { t: () => 'Give him one ship', hint: () => 'Four in ten.', fx: (x, d) => ({ coin: -0.5, then: ['ships_back', 2, 6, 1, { n: d.n, i: d.i, s: 0.4 }] }), log: (x, d) => `${d.n} sails ${d.dir} from ${x.cell(d.i)}` },
      { t: () => 'Keep the ships at home', hint: () => 'The sea will keep its secrets.', fx: () => ({}), log: () => '' },
    ], lapse: 2 });

  S({ k: 'ships_back', art: 'st_ships', follow: true, w: () => 1,
    make: (x, d) => Object.assign({}, d, { ok: x.rnd() < d.s ? 1 : 0 }),
    title: (x, d) => (d.ok ? `${d.n} comes home` : `No word of ${d.n}`),
    text: (x, d) => (d.ok ? `${d.n}'s ships are home, fewer than sailed, their holds full of strange woods, feathers and gold. He has found land across the sea: rivers, forests, and people who had never seen a sail.` : `There is no word of ${d.n}. A fisherman found a broken spar with the mark of ${x.cell(d.i)} on it, and the families of the crews stand on the quay every evening.`),
    opts: [
      { t: (x, d) => (d.ok ? 'Found a colony there' : 'Pay the widows a pension'), hint: (x, d) => (d.ok ? 'A settlement of your own across the sea.' : 'The harbour will remember it.'), fx: (x, d) => (d.ok ? { coin: -0.8, colony: 1 } : { coin: -0.3, stab: 0.01 }), log: () => '' },
      { t: (x, d) => (d.ok ? 'Trade with the people there' : `Raise a memorial at ${x.cell(d.i)}`), hint: (x, d) => (d.ok ? 'Goods no market has seen.' : 'The names of the lost, cut in stone.'), fx: (x, d) => (d.ok ? { est: { merchants: 0.05 }, mod: { k: 'newtrade', inc: 0.05, y: 2 * x.turn } } : { coin: -0.2, ren: 0.03, renK: 'memorial' }), log: () => '' },
      { t: (x, d) => (d.ok ? `Publish ${d.n}'s account` : 'Say a prayer for them'), hint: (x, d) => (d.ok ? 'Every scholar will want to read it.' : 'The sea takes what it takes.'), fx: (x, d) => (d.ok ? { ins: 0.8, ren: 0.12, renK: 'voyage' } : { est: { priests: 0.01 }, stab: -0.01 }), log: (x, d) => (d.ok ? `${d.n} of ${x.realm} finds land across the sea` : '') },
    ], lapse: 2 });

  // ----- the estates, war and peace -----
  S({ k: 'triumph', art: 'st_triumph', w: (x) => (x.won() ? 1.5 : 0),
    make: (x) => { const w = x.won(); return w ? { o: w[1], on: w[2] || '' } : null; }, title: () => 'Victory',
    text: (x, d) => `The war with ${d.on || 'the enemy'} is over, and the army is coming home. ${cap(x.cap)} wants to see its ${est(x, 'soldiers')}, and the ${est(x, 'soldiers')} want to be seen.`,
    opts: [
      { t: () => 'A triumph through the city', hint: () => 'Flowers, banners, and a city in love with its army.', fx: () => ({ coin: -0.7, stab: 0.05, ren: 0.08, renK: 'triumph', est: { soldiers: 0.06 } }), log: (x, d) => `${cap(x.realm)} celebrates its victory over ${d.on || 'its enemy'} with a triumph` },
      { t: () => 'Reward the veterans with land', hint: () => 'The army is grateful; the great families give up the land.', fx: () => ({ est: { soldiers: 0.1, nobles: -0.05 } }), log: () => '' },
      { t: () => 'Give thanks at the temples, and back to work', hint: () => 'Modest, and the soldiers expected more.', fx: () => ({ est: { priests: 0.04, soldiers: -0.03 } }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'unpaid', art: 'st_army', w: (x) => (x.era >= 1 && x.cv.wealth < 0.6 * x.U && (x.wars() > 0 || x.cv.policy.military > 1.1) ? 1 : 0),
    make: () => ({}), title: () => 'The soldiers want their pay',
    text: (x) => `The soldiers of the ${x.cap} garrison have not been paid for months. This morning they stood before the palace gate, and they are still there.`,
    opts: [
      { t: () => 'Pay them, whatever it costs', hint: () => 'Into debt if need be.', debt: true, fx: () => ({ coin: -0.8, est: { soldiers: 0.06 } }), log: () => '' },
      { t: () => 'Promise them land when the war is over', hint: () => 'The great families will have to give it.', fx: () => ({ est: { soldiers: 0.03, nobles: -0.05 } }), log: () => '' },
      { t: () => 'Tell them to wait', hint: () => 'Soldiers are not good at waiting.', fx: () => ({ est: { soldiers: -0.12 }, stab: -0.04 }), log: (x) => `The unpaid garrison of ${x.cap} mutters at the palace gate` },
    ], lapse: 2 });

  S({ k: 'feud', art: 'st_feud', w: (x) => (x.era >= 2 && x.era <= 5 && x.power('nobles') >= 0.12 ? 0.55 : 0),
    make: (x) => ({ a: x.freshName(), b: x.freshName() }), title: () => 'Blood in the streets',
    text: (x, d) => `The ${d.a} and the ${d.b}, two of the great families of ${x.cap}, are at each other's throats over a broken marriage contract. Last night their men fought in the street by torchlight, and a boy was killed.`,
    opts: [
      { t: () => 'Judge between them yourself', hint: () => 'Both will obey, and both will grumble.', need: (x) => x.authNeed(10), fx: () => ({ auth: -10, stab: 0.03, est: { nobles: -0.02 } }), log: (x, d) => `The feud of the ${d.a} and the ${d.b} is judged by the crown of ${x.realm}` },
      { t: () => 'Exile the heads of both families', hint: () => 'Their lands come to the crown.', fx: () => ({ coin: 0.4, auth: 8, est: { nobles: -0.1 } }), log: (x, d) => `The heads of the ${d.a} and the ${d.b} are exiled from ${x.realm}` },
      { t: () => 'Let them settle it among themselves', hint: () => 'There will be more blood.', fx: () => ({ stab: -0.03, est: { nobles: 0.02 } }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'petition', art: 'st_petition', w: (x) => (x.era >= 1 && x.era <= 6 && x.knows('taxes') && x.towns() >= 1 ? (x.cv.policy.tax > 1.05 ? 1 : 0.5) : 0),
    make: (x) => ({ i: x.town(), n: x.freshName() }), title: () => 'The villagers\' petition',
    text: (x, d) => `Elders of the villages about ${x.cell(d.i)} have walked three days to kneel before you. They say that your tax collector, ${d.n}, takes a third more than the law allows, and keeps it for himself.`,
    opts: [
      { t: () => 'Dismiss the collector, and repay them', hint: () => 'Justice, at a small price.', fx: () => ({ coin: -0.3, est: { farmers: 0.07 } }), log: (x, d) => `The tax collector ${d.n} is dismissed by the court of ${x.realm}` },
      { t: () => 'Uphold your collector', hint: () => 'The law is the law.', fx: () => ({ coin: 0.2, auth: 3, est: { farmers: -0.06 } }), log: () => '' },
      { t: () => 'Send them home', hint: () => 'They walked three days for nothing.', fx: () => ({ est: { farmers: -0.04 } }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'raid', art: 'st_raid', w: (x) => (x.era <= 5 && x.raider() ? 0.55 : 0),
    make: (x) => { const o = x.raider(); return o ? { o: o.id, i: x.border(o.id) } : null; }, still: (x, d) => !!x.civ(d.o) && !x.atWar(d.o),
    title: (x, d) => `Raiders from ${x.name(x.civ(d.o))}`,
    text: (x, d) => `Riders from ${x.name(x.civ(d.o))} crossed the border at dawn, burned the villages about ${x.cell(d.i)} and drove off the cattle. The villagers are at your gate, asking what you will do.`,
    opts: [
      { t: (x, d) => `Demand reparations from ${x.name(x.civ(d.o))}`, hint: () => 'They may pay. If not, you will have a grievance against them.', fx: (x, d) => ({ op: [[d.o, -8]] }),
        odds: (x, d) => [[0.5, { text: `${cap(x.name(x.civ(d.o)))} pays, with bad grace.`, fx: { coin: 0.5 } }], [0.5, { text: `${cap(x.name(x.civ(d.o)))} denies everything. Your envoys come home empty-handed, with a grievance the realm will remember.`, fx: { claim: d.o } }]],
        log: () => '' },
      { t: () => 'Raid them back', hint: () => 'A claim on their land, and their enmity.', fx: (x, d) => ({ claim: d.o, op: [[d.o, -20]], stab: 0.01, est: { soldiers: 0.05 } }), log: (x, d) => `${cap(x.realm)} raids ${x.name(x.civ(d.o))} in revenge` },
      { t: () => 'Let it pass', hint: () => 'The borderlands will feel abandoned.', fx: () => ({ stab: -0.02, est: { farmers: -0.04 } }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'envoys', art: 'st_envoys', w: (x) => (x.era >= 1 && x.distant() ? 0.5 : 0),
    make: (x) => { const o = x.distant(); return o ? { o: o.id, g: x.giftOf(o) } : null; }, still: (x, d) => !!x.civ(d.o),
    title: (x, d) => `Envoys from ${x.name(x.civ(d.o))}`,
    text: (x, d) => { const o = x.civ(d.o); return `Envoys from ${x.name(o)} have come with gifts: ${d.g}, a bird that speaks, and letters from ${o.ruler ? o.ruler.title + ' ' + o.ruler.name : 'their ruler'} wishing friendship between your peoples.`; },
    opts: [
      { t: () => 'Receive them with honour, and send gifts back', hint: () => 'A friendship begun.', fx: (x, d) => ({ coin: -0.3, op: [[d.o, 15]] }), log: (x, d) => `Envoys of ${x.name(x.civ(d.o))} are received with honour in ${x.cap}` },
      { t: () => 'Accept the gifts graciously', hint: () => 'Polite, and no more.', fx: (x, d) => ({ coin: 0.25, op: [[d.o, 5]] }), log: () => '' },
      { t: () => 'Keep them waiting a month', hint: () => 'Let them know who they are dealing with.', fx: (x, d) => ({ auth: 4, op: [[d.o, -8]] }), log: () => '' },
    ], lapse: 1 });

  S({ k: 'plot', art: 'st_plot', w: (x) => (x.era >= 1 && x.rp && (x.cv.stability < 0.5 || x.trait() === 'tyrant' || x.regent()) ? 0.6 : 0),
    make: (x, d) => { const by = d && d.by && x.living(d.by) ? x.P(d.by) : null; const h = x.heir(); return { a: x.freshName(), b: x.freshName(), who: by ? by.n : h ? styled(x, h) : 'a cousin of the house', r: x.rp ? x.rp.id : 0 }; },
    still: (x, d) => !!x.rp && x.rp.id === d.r,
    title: () => 'A plot uncovered',
    text: (x, d) => `A servant has come to you by night. ${d.a}, ${d.b} and others mean to put ${d.who} on the throne before the year is out. The servant names names, and wants to be paid for them.`,
    opts: [
      { t: () => 'Arrest them all', hint: () => 'The great families will be frightened, and angry.', need: (x) => x.authNeed(15), fx: () => ({ auth: -15, stab: 0.03, est: { nobles: -0.08 } }), log: (x, d) => `A plot against ${x.R.title} ${x.R.name} is uncovered: ${d.a} and ${d.b} are arrested` },
      { t: () => 'Buy them off', hint: () => 'Gold buys loyalty, for a while.', fx: () => ({ coin: -0.7, est: { nobles: 0.03 } }), log: () => '' },
      { t: () => 'Pretend you know nothing', hint: () => 'One plot in three is carried through.', fx: (x, d) => ({ then: ['coup', 1, 4, 0.35, { r: d.r }] }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'coup', art: 'st_plot', follow: true, w: (x, d) => (x.rp && d && x.rp.id === d.r ? 1 : 0),
    make: (x, d) => Object.assign({}, d || {}, { r: x.rp ? x.rp.id : 0, was: x.R ? `${x.R.title} ${x.R.name}` : 'The ruler' }),
    pre: (x, d) => x.murder(),      // (the deed is done when the story is told)
    still: () => true,
    title: () => 'Murder at the feast',
    text: (x, d) => `They struck at the feast, between the meat and the wine. ${d.was} is dead, and ${x.R.title} ${x.R.name} takes the throne of a frightened realm. The killers are known, and they have friends.`,
    opts: [
      { t: () => 'Hunt them down', hint: () => 'Justice, and fear among the great families.', fx: () => ({ auth: 10, stab: 0.02, est: { nobles: -0.08 } }), log: (x, d) => `The murderers of ${d.was} are hunted down` },
      { t: () => 'Pardon them, for the realm\'s peace', hint: () => 'The killers walk free.', fx: () => ({ auth: -10, stab: 0.03, est: { nobles: 0.05 } }), log: () => '' },
      { t: () => 'Let the judges deal with it', hint: () => 'Slowly.', fx: () => ({ stab: -0.02 }), log: () => '' },
    ], lapse: 2 });

  // ----- learning -----
  const HERESY = ['', '', '', 'the earth is a sphere, and turns', 'the old books can be wrong', 'the earth goes round the sun', 'living things change, slowly, into others', 'time itself runs slower for whatever moves fast', 'a machine may one day think'];
  S({ k: 'scholars', art: 'st_scholars', w: (x) => (x.era >= 3 && x.acad() >= 1 ? 0.55 : 0),
    make: (x) => ({ i: x.town('academy') }), title: () => 'A dispute in the academy',
    text: (x, d) => `In the academy of ${x.cell(d.i)} the ${est(x, 'scholars')} are at war with words. A young master teaches that ${HERESY[Math.max(3, x.era)]}, and the old masters demand that he be silenced.`,
    opts: [
      { t: () => 'Defend the young master', hint: () => 'New learning, and the temples\' displeasure.', fx: (x) => ({ est: { scholars: 0.06, priests: -0.07 }, mod: { k: 'learning', ins: 0.06, y: 2 * x.turn } }), log: (x, d) => `The court of ${x.realm} defends a young master of ${x.cell(d.i)} who teaches that ${HERESY[Math.max(3, x.era)]}` },
      { t: () => 'Silence him', hint: () => 'The old masters keep their chairs.', fx: () => ({ est: { priests: 0.06, scholars: -0.08 } }), log: (x, d) => `A master of ${x.cell(d.i)} is silenced for teaching that ${HERESY[Math.max(3, x.era)]}` },
      { t: () => 'Let them argue', hint: () => 'Arguments are what academies are for.', fx: () => ({ ins: 0.3, est: { scholars: 0.02 } }), log: () => '' },
    ], lapse: 2 });

  const MACHINE = ['', '', '', '', '', 'pumps water from a mine without a horse to turn it', 'spins a hundred threads at once', 'carries a voice along a wire across the country', 'solves in an hour what a hall of clerks could not do in a year'];
  S({ k: 'inventor', art: 'st_inventor', w: (x) => (x.era >= 5 ? 0.55 : 0),
    make: (x) => ({ n: x.freshName(), i: x.town(), o: x.nbAny() }), title: () => 'A remarkable machine',
    text: (x, d) => `${d.n}, a craftsman of ${x.cell(d.i)}, has built a machine of brass and wheels that ${MACHINE[Math.max(5, x.era)]}. He asks ${court(x)} for money to build a greater one.`,
    opts: [
      { t: () => 'Fund him', hint: () => 'Six in ten such machines work.', fx: (x, d) => ({ coin: -0.9, then: ['invention', 2, 5, 1, { n: d.n, i: d.i, s: 0.6 }] }), log: () => '' },
      { t: () => 'Buy his drawings outright', hint: () => 'Your own craftsmen will learn from them.', fx: () => ({ coin: -0.4, ins: 0.5 }), log: () => '' },
      { t: () => 'Send him away', hint: (x, d) => (d.o >= 0 && x.civ(d.o) ? `He will take it to ${x.name(x.civ(d.o))}.` : 'He will take it somewhere else.'), fx: (x, d) => ({ teach: d.o >= 0 ? [d.o, 1] : null }), log: () => '' },
    ], lapse: 2 });

  S({ k: 'invention', art: 'st_inventor', follow: true, w: () => 1,
    make: (x, d) => Object.assign({}, d, { ok: x.rnd() < d.s ? 1 : 0 }),
    title: (x, d) => (d.ok ? `${d.n}'s machine works` : `${d.n}'s machine fails`),
    text: (x, d) => (d.ok ? `${d.n}'s great machine works. It ran for a day and a night before the crowd at ${x.cell(d.i)}, and the ${est(x, 'scholars')} are already arguing over what else such a thing might do.` : `${d.n}'s great machine blew itself apart before the crowd at ${x.cell(d.i)}, and took the roof of the workshop with it. He swears the next one will work.`),
    opts: [
      { t: (x, d) => (d.ok ? 'Put it to work in the realm\'s workshops' : 'Give him another chance'), hint: (x, d) => (d.ok ? 'Everything made a little cheaper, for years.' : 'Half of second machines work.'), fx: (x, d) => (d.ok ? { est: { artisans: 0.05 }, mod: { k: 'machine', inc: 0.05, y: 2 * x.turn } } : { coin: -0.5, then: ['invention', 2, 4, 1, { n: d.n, i: d.i, s: 0.5 }] }), log: (x, d) => (d.ok ? `The machine of ${d.n} is put to work across ${x.realm}` : '') },
      { t: (x, d) => (d.ok ? 'Give it to the academies' : 'Enough'), hint: (x, d) => (d.ok ? 'The learned will build on it.' : 'There are other inventors.'), fx: (x, d) => (d.ok ? { ins: 1.2, est: { scholars: 0.04 } } : {}), log: (x, d) => (d.ok ? `The machine of ${d.n} is given to the academies of ${x.realm}` : '') },
      { t: (x, d) => (d.ok ? 'Sell the right to build it abroad' : 'Have him locked up for the roof'), hint: (x, d) => (d.ok ? 'Coin now.' : 'The neighbours want their roof paid for.'), fx: (x, d) => (d.ok ? { coin: 1 } : { auth: 2, est: { artisans: -0.02 } }), log: () => '' },
    ], lapse: 2 });

  const BY = {}; LIST.forEach((s, i) => { s.id = i; BY[s.k] = s; });

  // ---------- one world's stories ----------
  function create(h) {
    const { civs, MAXC } = h;
    const year = () => h.year();
    const stats = { told: 0, chosen: 0, lapsed: 0, ai: 0, by: {}, ms: 0 };
    const news = [];
    let rs = ((h.seed || 1) ^ 0x2c1b3c6d) >>> 0;
    const rnd = () => { rs += 0x6D2B79F5; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const eraOf = (cv) => Math.max(0, Math.min(8, cv.era | 0));
    const turnOf = (cv) => PACE[eraOf(cv)];
    // the realm's unit of coin: what the age asks of a court, or a year and a half of what it takes in, whichever is more
    const unitOf = (cv) => Math.round(Math.max(10 + 12 * eraOf(cv), 1.5 * Math.max(0, cv.gross || 0)));
    const ST = (cv) => cv.story || (cv.story = { n: year() + Math.round(turnOf(cv) * (cv.player ? 0.6 + rnd() * 0.6 : 1 + rnd() * 3)), q: null, m: [], f: [], s: {} });

    // what a story reads of the realm: built when it is asked, each thing looked up once
    function ctx(cv) {
      const c = cv.id, D = h.dynasty, yr = year(), era = eraOf(cv);
      const rp = D ? D.rulerOf(c) : null, kind = h.succKind(cv);
      const memo = {}; const once = (k, f) => (k in memo ? memo[k] : (memo[k] = f()));
      const x = { cv, c, era, yr, turn: PACE[era], U: unitOf(cv), me: !!cv.player, kind, dyn: !!rp && window.DYNASTY.dynastic(kind), rp, R: cv.ruler, realm: h.name(cv), rnd, pick,
        cap: (cv.capital >= 0 && h.cellName(cv.capital)) || 'the capital' };
      Object.assign(x, {
        P: (id) => (D ? D.of(id) : null), living: (id) => { const p = D && D.of(id); return !!p && D.alive(p, yr); }, kin: (a, b) => (D ? D.kinOf(a, b) : 'kinsman'),
        heir: () => once('heir', () => (D && x.dyn ? D.heirOf(c) : null)), regent: () => once('regent', () => (D ? D.regentOf(c) : null)),
        kids: () => once('kids', () => (rp ? rp.k.map((id) => D.of(id)).filter((k) => k && D.alive(k, yr)).sort((a, b) => a.b - b.b) : [])),
        single: () => once('single', () => [x.heir()].concat(x.kids()).filter((p, i, a) => p && a.indexOf(p) === i && !p.s && ago(x, p) >= 16 && ago(x, p) <= 30)),
        names: (id) => (D ? D.nameChoices(c, id) : null), freshName: () => (D ? D.freshName(c) : 'Anon'),
        trait: () => (cv.ruler ? cv.ruler.trait : ''),
        cells: () => h.cells(c), towns: () => h.towns(c), temples: () => h.temples(c), acad: () => h.acad(c), markets: () => h.markets(c), ports: () => h.ports(c), mines: () => h.mines(c),
        knows: (key) => h.knows(c, key), power: (k) => h.power(c, k), food: () => h.food(c), wars: () => h.warsN(cv),
        cell: (i) => (i >= 0 && h.cellName(i)) || x.cap, ownerOf: (i) => h.ownerOf(i), name: (o) => (o ? h.name(o) : 'a far realm'), civ: (id) => (id >= 0 ? civs[id] || null : null),
        town: (want) => h.townOf(c, want === undefined ? '' : want), river: () => once('river', () => h.riverTown(c)), border: (o) => h.borderTown(c, o),
        touches: (o) => h.touches(cv, o), atWar: (o) => cv.wars && cv.wars[o] !== undefined,
        authNeed: (n) => (h.auth(cv) < n ? `Needs ${n} authority` : null), coinNeed: (u) => (cv.wealth < u * x.U ? `Needs ${Math.round(u * x.U)} coin` : null),
        canBorrow: () => h.canBorrow(cv), partner: () => once('partner', () => { const l = h.partners(c).map((o) => civs[o]).filter(Boolean); return l.length ? pick(l) : null; }),
        won: () => (cv.lastWin && yr - cv.lastWin[0] <= Math.max(5, x.turn) && civs[cv.lastWin[1]] !== cv ? cv.lastWin : null),
        troubled: () => once('troubled', () => { const l = h.near(c).map((o) => civs[o]).filter((o) => o && o !== cv && ((o.wars && Object.keys(o.wars).length) || o.stability < 0.35 || h.food(o.id) < 0.6)); return l.length ? pick(l) : null; }),
        raider: () => once('raider', () => { const l = h.near(c).map((o) => civs[o]).filter((o) => o && o !== cv && !x.atWar(o.id) && h.touches(cv, o.id) && !h.bound(cv, o)); return l.length ? pick(l) : null; }),
        distant: () => once('distant', () => { const l = h.reach(cv).map((o) => civs[o]).filter((o) => o && o !== cv && !x.atWar(o.id) && !h.touches(cv, o.id)); return l.length ? pick(l) : null; }),
        nbAny: () => { const l = h.near(c).filter((o) => civs[o] && o !== c); return l.length ? pick(l) : -1; },
        suitors: () => once('suitors', () => (D ? h.reach(cv).concat(h.near(c)).filter((o, i, a) => a.indexOf(o) === i && civs[o] && o !== c && !x.atWar(o) && D.rulerOf(o) && !h.cannotMarry(civs[o], cv)).map((o) => civs[o]) : [])),
        cannotMarry: (o) => h.cannotMarry(civs[o], cv), giftOf: (o) => h.giftOf(o),
        stateFaith: () => h.faithOf(cv), faithName: (f) => h.faithName(f), preached: () => once('preached', () => h.otherFaith(cv)), holy: () => once('holy', () => h.holyFor(cv)),
        master: () => once('master', () => h.master(c)), great: (id) => h.great(id), kindName: (g) => h.kindName(g), cannotCommission: (id) => h.cannotCommission(c, id),
        murder: () => h.murder(cv),
      });
      return x;
    }

    // ---------- what a choice does ----------
    const EST = () => window.RULE.ESTATES.map((E) => E.key);
    function moodWord(v) { const a = Math.abs(v); return v > 0 ? (a >= 0.1 ? 'delighted' : a >= 0.05 ? 'pleased' : 'content') : (a >= 0.1 ? 'furious' : a >= 0.05 ? 'angered' : 'displeased'); }
    // what a choice will do, in words, before it is made (and what it did, after)
    function chips(x, fx) {
      if (!fx) return []; const out = []; const cv = x.cv; const add = (t, cls) => out.push({ t, cls: cls || '' });
      const pct = (v) => `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}`;
      if (fx.coin) add(`${fx.coin > 0 ? '+' : '−'}${Math.abs(Math.round(fx.coin * x.U))} coin`, fx.coin > 0 ? 'pos' : 'neg');
      if (fx.borrow) add(`+${Math.round(fx.borrow * x.U)} coin, borrowed`, 'warn');
      if (fx.stab) add(`${pct(fx.stab)} stability`, fx.stab > 0 ? 'pos' : 'neg');
      if (fx.auth) add(`${fx.auth > 0 ? '+' : '−'}${Math.abs(Math.round(fx.auth))} authority`, fx.auth > 0 ? 'pos' : 'neg');
      if (fx.ins) add(`+${Math.round(h.insightOf(cv) * fx.ins * window.KNOW.UNIT)} insight`, 'pos');
      if (fx.ren) add(`+${Math.max(1, Math.round(fx.ren * h.renownNorm(cv)))} renown for ${Math.round(x.turn * (fx.renT || 3))} years`, 'pos');
      if (fx.pop) add(`−${(fx.pop * 100).toFixed(fx.pop < 0.01 ? 1 : 0)}% of your people`, 'neg');
      if (fx.popAdd) add(`+${(fx.popAdd * 100).toFixed(1)}% people`, 'pos');
      if (fx.est) for (const k of EST()) { const v = fx.est[k]; if (v) add(`${window.RULE.estateName(window.RULE.EK[k], x.era)} ${moodWord(v)}`, v > 0 ? 'pos' : 'neg'); }
      if (fx.op) for (const [o, by] of fx.op) { const ov = civs[o]; if (ov && by) add(`${h.name(ov)} ${by > 0 ? '+' : '−'}${Math.abs(by)} opinion`, by > 0 ? 'pos' : 'neg'); }
      if (fx.claim !== undefined && fx.claim !== null && civs[fx.claim]) add(`A claim on ${h.name(civs[fx.claim])}`, 'warn');
      if (fx.mod) { const m = fx.mod, y = Math.round(m.y); if (m.stab) add(`${pct(m.stab)} stability for ${y} years`, m.stab > 0 ? 'pos' : 'neg'); if (m.inc) add(`${pct(m.inc)}% income for ${y} years`, m.inc > 0 ? 'pos' : 'neg'); if (m.ins) add(`${pct(m.ins)}% insight for ${y} years`, m.ins > 0 ? 'pos' : 'neg'); }
      if (fx.raise) add(`Raised as ${TRAIT_A[fx.raise[1]] || fx.raise[1]}`, '');
      if (fx.pass) add('Passed over', 'warn'); if (fx.unpass) add('Back in the line', '');
      if (fx.abdicate) add('A new ruler', 'warn'); if (fx.endRegency) add('The regency ends', '');
      if (fx.marry !== undefined && civs[fx.marry]) add(`Royal marriage with ${h.name(civs[fx.marry])}`, 'pos');
      if (fx.colony) add('A colony across the sea', 'pos');
      if (fx.commission) add(`−${h.commissionCost(cv)} coin`, 'neg');
      if (fx.then) add('Something will come of it', '');
      return out;
    }
    // it is done
    function apply(x, fx, d) {
      if (!fx) return; const cv = x.cv, c = x.c, S = ST(cv);
      if (fx.coin) cv.wealth += Math.round(fx.coin * x.U);
      if (fx.borrow) h.borrow(cv, Math.round(fx.borrow * x.U));
      if (fx.stab) cv.stability = Math.max(0, Math.min(1, cv.stability + fx.stab));
      if (fx.auth) h.addAuth(cv, fx.auth);
      if (fx.est) for (const k in fx.est) h.bump(cv, k, fx.est[k]);
      if (fx.ins) h.inspire(c, fx.ins);
      if (fx.ren) { const k = 'ren_' + (fx.renK || 'tale'); const pts = Math.round(fx.ren * h.renownNorm(cv) * 10) / 10; const old = S.m.find((q) => q[0] === k); if (old) { old[1] = Math.max(old[1], x.yr + Math.round(x.turn * (fx.renT || 3))); old[5] += pts; } else S.m.push([k, x.yr + Math.round(x.turn * (fx.renT || 3)), 0, 0, 0, pts]); }
      if (fx.pop) h.popScale(cv, -fx.pop);
      if (fx.popAdd) h.popScale(cv, fx.popAdd);
      if (fx.op) for (const [o, by] of fx.op) if (civs[o] && by) h.remember(civs[o], c, by);
      if (fx.claim !== undefined && fx.claim !== null && civs[fx.claim]) h.claim(cv, fx.claim);
      if (fx.mod) { const m = fx.mod; S.m = S.m.filter((q) => q[0] !== m.k); S.m.push([m.k, x.yr + Math.round(m.y), m.stab || 0, m.inc || 0, m.ins || 0, 0]); }
      const D = h.dynasty;
      if (fx.raise && D) { const p = D.of(fx.raise[0]); if (p && D.alive(p, x.yr) && ago(x, p) < 16) { p.t = fx.raise[1]; p.rz = 1; } }
      if (fx.pass && D) { const C = D.court[c]; if (C && !C.passed.includes(fx.pass)) C.passed.push(fx.pass); }
      if (fx.unpass && D) { const C = D.court[c]; if (C) C.passed = C.passed.filter((q) => q !== fx.unpass); }
      if (fx.kill && D) D.kill(fx.kill);
      if (fx.rename && D) D.rename(fx.rename[0], fx.rename[1]);
      let made = null; if (fx.bastard && D) made = D.bastard(c, fx.bastard[0], fx.bastard[1]);
      if (fx.endRegency && D) D.endRegency(c);
      if (fx.marry !== undefined && civs[fx.marry]) h.marry(civs[fx.marry], cv);
      if (fx.colony) h.colony(cv);
      if (fx.teach && civs[fx.teach[0]]) h.inspire(fx.teach[0], fx.teach[1]);
      if (fx.commission) h.commission(c, fx.commission);
      if (fx.then) { const [k, a, b, p, extra] = fx.then; if (rnd() < (p === undefined ? 1 : p)) { const dd = Object.assign({}, extra || {}); if (made) dd.p = made.id; if (d && d.p && !dd.p && k !== 'plot') dd.p = d.p; S.f.push([k, x.yr + a + Math.floor(rnd() * (b - a + 1)), dd]); } }
      if (fx.abdicate) h.abdicate(cv);      // (last: the new ruler is crowned after all the rest is done)
    }

    // ---------- choosing a story ----------
    function weightOf(st, x) { if (st.follow) return 0; if (st.who === 'player' && !x.me) return 0; const last = x.cv.story.s[st.k]; if (last && x.yr - last < 3 * x.turn) return 0; try { return st.w(x) || 0; } catch (e) { return 0; } }
    function draw(cv) {
      const x = ctx(cv); let sum = 0; const ws = []; for (const st of LIST) { const w = weightOf(st, x); ws.push(w); sum += w; }
      for (let tries = 0; tries < 3 && sum > 0; tries++) { let r = rnd() * sum, st = null; for (let i = 0; i < LIST.length; i++) { r -= ws[i]; if (r <= 0 && ws[i] > 0) { st = LIST[i]; break; } } if (!st) break; const d = st.make(x); if (d) return { st, x, d }; sum -= ws[st.id]; ws[st.id] = 0; }
      return null;
    }
    // a story begins: the player's waits for his answer, an autopilot's is answered at once
    function begin(cv, st, x, d) {
      const S = ST(cv); S.s[st.k] = x.yr; stats.told++; stats.by[st.k] = (stats.by[st.k] || 0) + 1;
      if (st.pre) st.pre(x, d);
      if (cv.player && !h.quiet()) { S.q = { k: st.k, y: x.yr, u: x.yr + Math.max(4, 2 * x.turn), U: x.U, d }; news.push({ kind: 'story', c: cv.id, k: st.k, year: x.yr }); return; }
      const x2 = st.pre ? ctx(cv) : x; x2.U = x.U; const i = aiPick(st, x2, d); resolve(cv, st, x2, d, i, 'ai');
    }
    // how the autopilot weighs a choice: what it needs (coin when poor, quiet when restless), what its ruler is like, and some chance
    function score(x, fx, st) {
      if (!fx) return 0; const cv = x.cv, t = x.trait(); let s = 0; const poor = cv.wealth < 2 * x.U;
      s += (fx.stab || 0) * (cv.stability < 0.45 ? 70 : 35); s += (fx.coin || 0) * (poor ? 9 : 3); s += (fx.borrow || 0) * (poor ? 3 : -1); s += (fx.auth || 0) * 0.12;
      if (fx.est) for (const k in fx.est) s += fx.est[k] * 22 * (0.5 + h.power(x.c, k) * 2);
      s += (fx.ins || 0) * 5 + (fx.ren || 0) * 40 - (fx.pop || 0) * 140 + (fx.popAdd || 0) * 70;
      if (fx.op) for (const [, by] of fx.op) s += by * 0.05;
      if (fx.mod) s += ((fx.mod.stab || 0) * 40 + (fx.mod.inc || 0) * 70 + (fx.mod.ins || 0) * 40) * Math.min(3, fx.mod.y / x.turn);
      if (fx.claim !== undefined && fx.claim !== null) s += (t === 'conqueror' || t === 'tyrant' ? 3 : -1.5);
      if (t === 'pious' && fx.est) s += (fx.est.priests || 0) * 40; if (t === 'merchant') s += (fx.coin || 0) * 3 + (fx.mod && fx.mod.inc ? fx.mod.inc * 60 : 0); if (t === 'builder') s += (fx.ren || 0) * 60;
      if (t === 'scholar') s += (fx.ins || 0) * 6 + (fx.est ? (fx.est.scholars || 0) * 30 : 0); if (t === 'conqueror' && fx.est) s += (fx.est.soldiers || 0) * 30; if (t === 'steward') s += (fx.stab || 0) * 30;
      if (t === 'tyrant' && fx.auth > 0) s += fx.auth * 0.2; if (t === 'navigator' && fx.then && fx.then[0] === 'ships_back') s += 3;
      if (fx.abdicate) s -= 2; if (fx.kill) s -= 5;
      return s;
    }
    function aiPick(st, x, d) {
      let best = st.lapse || 0, bs = -1e9;
      st.opts.forEach((o, i) => { if (o.need && o.need(x, d)) return; let fx = null; try { fx = o.fx(x, d); } catch (e) { return; } if (!o.debt && fx && fx.coin < 0 && x.cv.wealth < -fx.coin * x.U) return;
        let s = score(x, fx, st); if (o.odds) { for (const [p, out] of o.odds(x, d)) s += p * score(x, out.fx, st); } s += rnd() * 4; if (s > bs) { bs = s; best = i; } });
      return best;
    }
    // the choice is made: what it does, by chance what follows from it, and the chronicle's line
    function resolve(cv, st, x, d, i, how) {
      const o = st.opts[i]; const fx = o.fx(x, d); const done = chips(x, fx); apply(x, fx, d);
      let outText = ''; if (o.odds) { const L = o.odds(x, d); let r = rnd(), out = L[L.length - 1][1]; for (const [p, q] of L) { if (r < p) { out = q; break; } r -= p; } outText = out.text || ''; if (out.fx) { done.push(...chips(x, out.fx)); apply(x, out.fx, d); } }
      if (how === 'ai') stats.ai++; else if (how === 'lapse') stats.lapsed++; else stats.chosen++;
      const line = o.log ? o.log(x, d) : '';
      if (line && (cv.player || h.cells(cv.id) > 120)) h.log(cv, line, false);
      else if (cv.player && outText) h.log(cv, outText.split('. ')[0].replace(/\.$/, ''), false);
      return { text: outText, chips: done };
    }

    // ---------- a year ----------
    function step() {
      const t0 = performance.now(), yr = year();
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; if (!cv) continue; const S = ST(cv);
        if (S.m.length && S.m.some((m) => m[1] <= yr)) S.m = S.m.filter((m) => m[1] > yr);
        if (cv.player && h.quiet()) { if (S.q) S.q = null; continue; }      // (the player has asked for no stories)
        if (S.q) { if (yr >= S.q.u) lapse(cv); continue; }
        // a story that comes after another
        if (S.f.length) { const k = S.f.findIndex((f) => f[1] <= yr); if (k >= 0) { const [key, , d] = S.f.splice(k, 1)[0]; const st = BY[key]; if (st && (cv.player || st.who !== 'player')) { const x = ctx(cv); let ok = false; try { ok = st.w(x, d) > 0; } catch (e) { ok = false; } if (ok) { const dd = st.make(x, d); if (dd) { begin(cv, st, x, dd); continue; } } } } }
        if (yr < S.n) continue;
        if (!cv.player && h.cells(c) < 25) { S.n = yr + Math.round(turnOf(cv) * (1 + rnd() * 2)); continue; }
        const got = draw(cv); S.n = yr + Math.round(turnOf(cv) * (cv.player ? 0.55 + rnd() * 0.75 : 2 + rnd() * 3));
        if (got) begin(cv, got.st, got.x, got.d);
      }
      stats.ms = performance.now() - t0;
    }
    function lapse(cv) {
      const S = ST(cv), q = S.q; S.q = null; const st = BY[q.k]; if (!st) return; const x = ctx(cv); x.U = q.U || x.U;
      if (st.still && !st.still(x, q.d)) return;
      S.n = Math.max(S.n, x.yr + Math.round(x.turn * (0.4 + rnd() * 0.5))); const i = st.lapse || 0; resolve(cv, st, x, q.d, i, 'lapse');
    }
    // a story the player is told now, if it can be (a birth, a wedding: dynasty.js's news; scenes and tests)
    function tell(cv, key, d) {
      const st = BY[key]; if (!cv || !st) return 'No such story'; if (cv.player && h.quiet()) return 'Stories are off'; const S = ST(cv); if (S.q) return 'Another story waits';
      const x = ctx(cv); let dd = null; try { dd = st.make(x, d || {}); } catch (e) { dd = null; } if (!dd) return 'It cannot happen now'; begin(cv, st, x, dd); return null;
    }
    // what the player sees of the story that waits for him
    function view(c) {
      const cv = civs[c]; if (!cv || !cv.story || !cv.story.q) return null; const q = cv.story.q, st = BY[q.k]; if (!st) return null;
      const x = ctx(cv); x.U = q.U || x.U; const d = q.d;
      if (st.still && !st.still(x, d)) { cv.story.q = null; return null; }
      const opts = st.opts.map((o, i) => { let fx = {}; try { fx = o.fx(x, d) || {}; } catch (e) { fx = {}; }
        const why = (o.need && o.need(x, d)) || (!o.debt && fx.coin < 0 && cv.wealth < -fx.coin * x.U ? `Needs ${Math.round(-fx.coin * x.U)} coin` : null);
        return { i, t: o.t(x, d), hint: o.hint ? o.hint(x, d) : '', chips: chips(x, fx), why, odds: !!o.odds }; });
      return { k: st.k, art: st.art, title: st.title(x, d), text: st.text(x, d), year: q.y, until: q.u, lapse: st.lapse || 0, opts, realm: x.realm };
    }
    function choose(c, i) {
      const cv = civs[c]; if (!cv || !cv.story || !cv.story.q) return 'Nothing waits'; const q = cv.story.q, st = BY[q.k]; if (!st) { cv.story.q = null; return 'Nothing waits'; }
      const x = ctx(cv); x.U = q.U || x.U; const o = st.opts[i]; if (!o) return 'No such choice';
      if (st.still && !st.still(x, q.d)) { cv.story.q = null; return 'It is too late for that'; }
      const why = o.need && o.need(x, q.d); if (why) return why; const fx = o.fx(x, q.d); if (!o.debt && fx && fx.coin < 0 && cv.wealth < -fx.coin * x.U) return `Needs ${Math.round(-fx.coin * x.U)} coin`;
      cv.story.q = null; cv.story.n = Math.max(cv.story.n, x.yr + Math.round(x.turn * (0.4 + rnd() * 0.5)));
      return resolve(cv, st, x, q.d, i, 'chose');
    }
    // what lasts: the realm's stability, income and learning while it lasts
    function unrest(cv) { const S = cv.story; if (!S || !S.m.length) return 0; let s = 0; for (const m of S.m) s += m[2]; return s; }
    function incF(c) { const cv = civs[c], S = cv && cv.story; if (!S || !S.m.length) return 1; let f = 1; for (const m of S.m) f *= 1 + m[3]; return f; }
    function insF(c) { const cv = civs[c], S = cv && cv.story; if (!S || !S.m.length) return 1; let f = 1; for (const m of S.m) f *= 1 + m[4]; return f; }
    function renOf(c) { const cv = civs[c], S = cv && cv.story; if (!S || !S.m.length) return 0; let r = 0; for (const m of S.m) r += m[5] || 0; return r; }
    const MOD_NAME = { old: 'An old ruler who will not let go', feast: 'The festival remembered', monument: 'The monument', hostels: 'The pilgrims\' road', templetax: 'The temples taxed', tolls: 'Tolls given up to the moneylenders', charter: 'The moneylenders\' charter', falsecoin: 'False coin in the markets', silver: 'The crown\'s silver mine', fair: 'The great fair', quarantine: 'The plague gates shut', dykes: 'The dykes', roads: 'Brigands on the roads', newtrade: 'Trade across the sea', learning: 'The new learning', machine: 'The machine at work' };
    const modsOf = (c) => { const cv = civs[c], S = cv && cv.story; return S ? S.m.map((m) => ({ k: m[0], name: MOD_NAME[m[0]] || (m[0].startsWith('ren_') ? 'Renown from ' + (REN_NAME[m[0].slice(4)] || 'the realm\'s deeds') : m[0]), until: m[1], stab: m[2], inc: m[3], ins: m[4], ren: m[5] || 0 })) : []; };
    const REN_NAME = { wedding: 'a royal wedding', monument: 'the monument', library: 'the new library', triumph: 'a triumph', voyage: 'a voyage of discovery', memorial: 'a memorial', patron: 'a master\'s pension', tale: 'the realm\'s deeds' };
    function save() { return { v: 1, rs, st: stats }; }
    function load(s) { if (!s || s.v !== 1) return false; if (s.rs !== undefined) rs = s.rs >>> 0; if (s.st) Object.assign(stats, s.st); return true; }
    return { stats, news, step, view, choose, tell, unrest, incF, insF, renOf, modsOf, ctx, chips, save, load, unitOf };
  }

  window.STORY = { create, LIST, BY, PACE };
})();
