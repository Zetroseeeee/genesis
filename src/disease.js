// Holocene sickness (classic script; exposes window.DISEASE): pestilence that travels. A kind of sickness (smallpox, measles,
// plague, typhus, influenza, cholera) can arise once people live crowded enough, in the age that bred it; an outbreak begins in a
// crowded realm and goes where people go: over borders, along the market's roads and sea lanes, with armies. In each realm it
// reaches it burns for some years, taking a share of the people of its settlements (more in towns, far more among a people that
// never had it, less where medicine is ahead of its age), and leaves those who lived through it spared for some turns. A people
// cut off from the rest of the world never meets the sicknesses of the crowded lands, until the first ships come: then it meets
// all of them at once. A realm may shut itself against the sick (its harbours, or everything), at a price in trade.
// Deaths are taken from the realm's settlements (the host's popScale); everything else is flat arrays, realm by outbreak.
//   DISEASE.create(h) -> { step, seed, view, lens, incF, setQ, save, load, ... } for one world.
window.DISEASE = (function () {
  'use strict';
  const PACE = [200, 100, 50, 50, 40, 20, 10, 5, 5];
  // the kinds: the age in which one can first arise (from), how readily it passes (spread), the share of those who catch it that it
  // kills before medicine (dead), the share of a realm that catches it (attack), the years it burns in a realm (burn), the turns those
  // who lived through it are spared (keep), how much worse among a people that never had it (virgin), in towns (towns), on ships and
  // caravans (ships), with armies (war), and how much less where it has been before (endemic: only those born since catch it)
  const KINDS = [
    { key: 'pox', name: 'smallpox', from: 1, spread: 0.9, dead: 0.22, attack: 0.35, burn: 4, keep: 4, virgin: 3, endemic: 0.25, towns: 1.25, ships: 1, war: 1.3,
      text: 'A fever, then the pustules. A third of the children who catch it die; those who live are marked, and never catch it again.' },
    { key: 'measles', name: 'measles', from: 1, spread: 1.25, dead: 0.04, attack: 0.5, burn: 3, keep: 4, virgin: 6, endemic: 0.2, towns: 1.3, ships: 1, war: 1,
      text: 'A rash and a cough that passes from room to room. A childhood sickness where it has always been; a slaughter where it never was.' },
    { key: 'plague', name: 'plague', from: 2, spread: 0.8, dead: 0.45, attack: 0.3, burn: 5, keep: 1, virgin: 1.4, endemic: 0.45, towns: 1.7, ships: 2, war: 1,
      text: 'It comes with the rats of the granaries and the ships. Black swellings, and death in three days.' },
    { key: 'typhus', name: 'typhus', from: 2, spread: 0.5, dead: 0.15, attack: 0.25, burn: 3, keep: 1, virgin: 1.7, endemic: 0.35, towns: 1.1, ships: 1.2, war: 3,
      text: 'The fever of camps, gaols and sieges: armies carry it, and lose more men to it than to the enemy.' },
    { key: 'flu', name: 'influenza', from: 4, spread: 1.7, dead: 0.025, attack: 0.5, burn: 2, keep: 1, virgin: 3, endemic: 0.35, towns: 1.2, ships: 1.5, war: 1.6,
      text: 'A fever that goes round the world in a season. Most get up again.' },
    { key: 'cholera', name: 'cholera', from: 6, spread: 0.9, dead: 0.35, attack: 0.15, burn: 3, keep: 1, virgin: 1, endemic: 0.45, towns: 2.2, ships: 1.6, war: 1.4,
      text: 'It lives in water: wherever the wells and the sewers are one, it kills in a day.' },
  ];
  const KK = {}; KINDS.forEach((k, i) => { k.id = i; KK[k.key] = k; }); const NK = KINDS.length;
  // how much less a sickness kills as the ages learn to fight it (a realm's own medicine is measured against this, as every edge is)
  const AGE = [1, 1, 0.95, 0.9, 0.8, 0.65, 0.35, 0.12, 0.05];
  // (from the age a kind is fought by name - vaccines, sewers, rat-catching - it arises a third as often)
  const FADE = { pox: 7, measles: 7, plague: 6, typhus: 7, flu: 9, cholera: 7 };
  const NAMES = { pox: ['the Speckled Monster', 'the Red Pox', 'the Spotted Death'], measles: ['the Red Rash', 'the Morbilli', 'the Spotted Fever'],
    plague: ['the Great Pestilence', 'the Black Death', 'the Great Mortality', 'the Plague of the Ports'], typhus: ['the Camp Fever', 'the Gaol Fever', 'the Spotted Typhus'],
    flu: ['the Great Influenza', 'the Grippe', 'the Sweating Sickness'], cholera: ['the Blue Death', 'the Cholera', 'the Flux'] };
  const MAXO = 6;      // (outbreaks at once, at most)
  // the lens of sickness: how each realm is painted (world.js; main.js's key)
  const BANDS = [['clear', 'No pestilence', '#4A525C'], ['spared', 'Spared lately', '#5FA493'], ['burning', 'A pestilence burning', '#E0762F'], ['height', 'At its height', '#E2313F']].map(([key, name, css]) => ({ key, name, css, rgb: [parseInt(css.slice(1, 3), 16) / 255, parseInt(css.slice(3, 5), 16) / 255, parseInt(css.slice(5, 7), 16) / 255] }));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function create(h) {
    const civs = h.civs, MAXC = h.MAXC, year = h.year;
    let rs = ((h.seed || 1) ^ 0x7a3c19e5) >>> 0;
    const rnd = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const turnOf = (cv) => PACE[clamp(cv.era | 0, 0, 8)];
    const NEVER = -1e9;
    const killF = new Float32Array(MAXC); let anyKill = false;      // (the share of each realm's people the year's sickness takes)      // (a year BC is negative: "spared until nought" would be spared through all of them)
    const imm = new Float64Array(MAXC * NK).fill(NEVER);      // (the year until which a realm's people are spared a kind)
    const had = new Uint8Array(MAXC * NK);       // (how many waves of it they have lived through, up to three: a people learns to live with a sickness over three)
    const out = [];                              // (outbreaks under way: { id, k, name, at, from, year, dead, inf: Float32Array, since: Float64Array, n })
    const past = [];                             // (the last that are over: { id, k, name, at, year, end, dead, realms, worst })
    const stats = { begun: 0, reached: 0, dead: 0, by: {}, ms: 0 };
    const news = [];
    let seq = 0;
    // a new outbreak of kind k, in realm c
    function begin(k, c, at) {
      const K = KINDS[k], cv = civs[c]; if (!cv) return null; const names = NAMES[K.key]; const used = new Set(out.map((o) => o.name).concat(past.slice(-12).map((o) => o.name)));
      let name = names.find((n) => !used.has(n)); if (!name) name = `the fever of ${h.cellName(at >= 0 ? at : cv.capital) || 'the east'}`;
      const o = { id: ++seq, k, name, at: at >= 0 ? at : cv.capital, from: c, year: year(), dead: 0, inf: new Float32Array(MAXC), since: new Float64Array(MAXC), cure: new Float32Array(MAXC).fill(1), n: 0, realms: 0, fromName: h.name(cv) };
      out.push(o); stats.begun++; stats.by[K.key] = (stats.by[K.key] || 0) + 1; infect(o, c); return o;
    }
    function infect(o, c) {
      if (o.inf[c] > 0) return; o.inf[c] = 0.3; o.since[c] = year(); o.cure[c] = 1; o.n++; o.realms++; stats.reached++; const cv = civs[c]; if (!cv) return;
      if (cv.player) news.push({ kind: 'reached', o: o.id, year: year(), text: `${cap(o.name)} reaches your realm` });
      // (the autopilot's neighbours that know what a hospital is shut their harbours to it for a turn, now and then)
      const nb = h.nb(c); if (nb) for (const d of nb) { const dv = civs[d]; if (!dv || dv.player || o.inf[d] > 0 || (dv.sick && dv.sick.q) || dv.era < 4 || rnd() > 0.3) continue; quarantine(dv, 1, turnOf(dv)); }
      h.reached(cv, o);
    }
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    // how long it burns in a realm: its years, longer in a large realm
    const burnOf = (o, cv) => KINDS[o.k].burn * (1 + Math.log10(Math.max(1, h.cells(cv.id))) / 3);
    // how fierce it is now, by how long it has burned: up in its first year, the height, then down to nothing
    const curve = (t, b) => (t < 1 ? 0.5 + 0.5 * t : t < b * 0.45 ? 1 : t < b ? 1 - (t - b * 0.45) / (b * 0.55) : 0);
    // the share of a realm's people it takes in a year at full height (what the realm's medicine, its towns and its past make of it)
    function deadly(o, cv) {
      const K = KINDS[o.k], c = cv.id; const towns = 1 + (K.towns - 1) * h.urban(c); const w = had[c * NK + o.k]; const seen = w >= 3 ? K.endemic : K.virgin * Math.pow(K.endemic / K.virgin, w / 3);
      return clamp(K.dead * K.attack * towns * seen * AGE[clamp(cv.era | 0, 0, 8)] / h.health(c), 0, 0.85) * o.cure[c] / burnOf(o, cv);
    }
    // ----- a year -----
    function step() {
      const t0 = performance.now(), yr = year();
      killF.fill(0); anyKill = false;
      // new outbreaks: a kind arises where people live crowded, in the age that bred it, while no outbreak of it is under way
      if (out.length < MAXO) for (let k = 0; k < NK; k++) {
        if (out.some((o) => o.k === k)) continue; const K = KINDS[k];
        if (rnd() > 0.012) continue;      // (looked at about once in eighty years for each kind)
        // (a sickness of crowds is bred where people have long lived crowded among their cattle, pigs and fowl: the lands of the old world,
        // not the Americas or Australia, whose peoples met them only when the ships came)
        let best = -1, bw = 0;
        for (let c = 0; c < MAXC; c++) { const cv = civs[c]; if (!cv || cv.era < K.from || imm[c * NK + k] > yr || !h.cradle(c)) continue; const w = h.crowd(c) * (0.5 + rnd()) * (cv.era >= FADE[K.key] ? 0.33 : 1); if (w > bw) { bw = w; best = c; } }
        if (best >= 0 && bw > 0 && rnd() < Math.min(1, bw / 40)) begin(k, best, -1);
      }
      // carriers: a people that lives with a sickness (it has had three waves of it) carries it wherever it meets one that never had it,
      // over a border or along the market's roads and sea lanes, outbreak or none (a tenth of the realms looked at each year)
      for (let c = 0; c < MAXC; c++) {
        const cv = civs[c]; if (!cv || rnd() > 0.1) continue; const o0 = c * NK; let virgin = false; for (let k = 0; k < NK; k++) if (!had[o0 + k] && imm[o0 + k] <= yr) { virgin = true; break; } if (!virgin) continue;
        const nb = h.nb(c), tp = h.partners(c), q = h.shut(cv);
        for (let k = 0; k < NK; k++) {
          if (had[o0 + k] || imm[o0 + k] > yr) continue; let by = -1;
          if (nb) for (const d of nb) if (civs[d] && had[d * NK + k] >= 3) { by = d; break; }
          if (by < 0) for (const d of tp) if (civs[d] && had[d * NK + k] >= 3) { by = d; break; }
          if (by < 0 || rnd() > 0.25 * KINDS[k].spread * (1 - q)) continue;
          const o = out.find((x) => x.k === k); if (o) infect(o, c); else if (out.length < MAXO + 2) begin(k, c, -1);
        }
      }
      // quarantines run out
      for (let n = shutL.length - 1; n >= 0; n--) { const cv = civs[shutL[n]]; if (!cv || !cv.sick || !cv.sick.q || (cv.sick.until && cv.sick.until <= yr)) { if (cv && cv.sick) { cv.sick.q = 0; cv.sick.until = 0; } shutL.splice(n, 1); } }
      // what each outbreak does where it is, and where it goes next
      for (let n = out.length - 1; n >= 0; n--) {
        const o = out[n], K = KINDS[o.k];
        for (let c = 0; c < MAXC; c++) {
          if (!(o.inf[c] > 0)) continue; const cv = civs[c]; if (!cv) { o.inf[c] = 0; o.n--; continue; }
          const b = burnOf(o, cv), t = yr - o.since[c], f = curve(t, b);
          // (burned out: those who lived through it are spared it for some turns; a people new to it, only until a generation has been born since)
          if (f <= 0) { o.inf[c] = 0; o.n--; const w = had[c * NK + o.k]; imm[c * NK + o.k] = yr + (w >= 2 ? K.keep * turnOf(cv) : 40); if (w < 3) had[c * NK + o.k] = w + 1; if (cv.player) news.push({ kind: 'over', o: o.id, year: yr, text: `${cap(o.name)} has burned itself out in your realm` }); continue; }
          o.inf[c] = f;
          const share = deadly(o, cv) * f, lost = share * h.pop(c); killF[c] = 1 - (1 - killF[c]) * (1 - share); anyKill = true; o.dead += lost; stats.dead += lost;
          // where it goes: over the borders, along the market's roads and sea lanes, with armies; a realm shut against it is passed by
          const go = (d, p) => { if (d === c || o.inf[d] > 0) return; const dv = civs[d]; if (!dv || imm[d * NK + o.k] > yr) return; const q = h.shut(dv), qs = h.shut(cv); if (rnd() < p * f * K.spread * (1 - q) * (1 - 0.5 * qs)) infect(o, d); };
          const nb = h.nb(c); if (nb) for (const d of nb) go(d, 0.15);
          const tp = h.partners(c); for (const d of tp) go(d, 0.08 * K.ships);
          for (const k2 in cv.wars) go(+k2, 0.15 * K.war);
        }
        if (o.n <= 0) { out.splice(n, 1); past.push({ id: o.id, k: o.k, name: o.name, at: o.at, from: o.from, fromName: o.fromName, year: o.year, end: yr, dead: Math.round(o.dead), realms: o.realms }); if (past.length > 24) past.shift(); }
      }
      if (anyKill) h.killAll(killF);      // (the year's dead, every realm's share taken from all its land in one pass)
      stats.ms = performance.now() - t0;
    }
    // ----- the player's hand, and the god's -----
    function seed(cell, kind) { const o0 = h.ownerOf(cell); if (o0 < 0 || !civs[o0]) return 'Nobody lives there'; const k = kind !== undefined ? (typeof kind === 'string' ? KK[kind].id : kind) : (KK.plague.id); if (out.length >= MAXO + 2) return 'The world has sickness enough'; const o = begin(k, o0, cell); return o ? null : 'Nothing happened'; }
    // a new realm: what its people have had is what the realm it came from had, or the land about it
    function born(c, from, around) {
      for (let k = 0; k < NK; k++) { imm[c * NK + k] = NEVER; had[c * NK + k] = 0; }
      if (from >= 0) for (let k = 0; k < NK; k++) { imm[c * NK + k] = imm[from * NK + k]; had[c * NK + k] = had[from * NK + k]; }
      else if (around) for (const d of around) for (let k = 0; k < NK; k++) if (had[d * NK + k] > had[c * NK + k]) had[c * NK + k] = had[d * NK + k];
      for (const o of out) { o.inf[c] = 0; o.since[c] = 0; }
    }
    function gone(c) { for (const o of out) if (o.inf[c] > 0) { o.inf[c] = 0; o.n--; } for (let k = 0; k < NK; k++) { imm[c * NK + k] = NEVER; had[c * NK + k] = 0; } }
    // what it costs a realm to shut itself (the market's links are not cut: what comes over them is less)
    const incF = (c) => { const cv = civs[c]; const q = cv && cv.sick ? cv.sick.q : 0; return q === 2 ? 0.88 : q === 1 ? 0.95 : 1; };
    const shutL = [];      // (the realms shut against the sick just now)
    // a realm shuts its harbours (1) or everything (2) against the sick, for some years (0: until it opens them again)
    function quarantine(cv, q, years) { if (!cv) return 'No realm'; const S = cv.sick || (cv.sick = { q: 0, until: 0 }); S.q = q; S.until = q && years ? year() + Math.round(years) : 0; if (q && shutL.indexOf(cv.id) < 0) shutL.push(cv.id); return null; }
    const setQ = (cv, q) => quarantine(cv, q, 0);
    // what a realm does against an outbreak in it (physicians, the bedding burned, the gates shut): its dead are so many times fewer
    function cure(cv, oid, f) { const o = out.find((q) => q.id === oid); if (!o || !cv) return 'It is over'; o.cure[cv.id] = Math.min(o.cure[cv.id], f); return null; }
    // the fear an outbreak brings: a share off the realm's stability while it burns
    function unrest(c) { let f = 0; for (const o of out) if (o.inf[c] > f) f = o.inf[c]; return -0.05 * f; }
    // ----- what the player sees -----
    function view(c) {
      const cv = civs[c]; const yr = year();
      const mine = []; for (const o of out) if (cv && o.inf[c] > 0) mine.push({ id: o.id, name: o.name, kind: KINDS[o.k].name, since: o.since[c], f: o.inf[c], share: deadly(o, cv) * o.inf[c] });
      const all = out.map((o) => ({ id: o.id, k: KINDS[o.k].key, name: o.name, kind: KINDS[o.k].name, text: KINDS[o.k].text, year: o.year, from: o.fromName, realms: o.n, reached: o.realms, dead: Math.round(o.dead), here: !!cv && o.inf[c] > 0 }));
      const spared = cv ? KINDS.map((K) => ({ name: K.name, until: imm[c * NK + K.id] > yr ? imm[c * NK + K.id] : NEVER, had: had[c * NK + K.id] })) : [];
      return { mine, all, past: past.slice().reverse(), spared, q: cv && cv.sick ? cv.sick.q : 0 };
    }
    // the lens: for each realm, how fierce the worst outbreak in it is (0..1); whether it is spared some kind just now
    function lens(into) { into.fill(0); for (const o of out) for (let c = 0; c < MAXC; c++) if (o.inf[c] > into[c]) into[c] = o.inf[c]; return into; }
    function spared(c) { const yr = year(); for (let k = 0; k < NK; k++) if (imm[c * NK + k] > yr) return true; return false; }
    const bandOf = (f, c) => (f > 0.6 ? 3 : f > 0 ? 2 : spared(c) ? 1 : 0);
    function save() {
      const pack = (o) => { const l = []; for (let c = 0; c < MAXC; c++) if (o.inf[c] > 0) l.push(c, Math.round(o.inf[c] * 1000), o.since[c], Math.round(o.cure[c] * 1000)); return l; };
      const im = [], hd = []; for (let i = 0; i < MAXC * NK; i++) { if (imm[i] > year()) im.push(i, imm[i]); if (had[i]) hd.push(i, had[i]); }
      return { v: 1, rs, seq, shut: shutL.slice(), out: out.map((o) => ({ id: o.id, k: o.k, name: o.name, at: o.at, from: o.from, fromName: o.fromName, year: o.year, dead: Math.round(o.dead), realms: o.realms, l: pack(o) })), past, im, hd, stats: { begun: stats.begun, reached: stats.reached, dead: Math.round(stats.dead), by: stats.by } };
    }
    function load(s) {
      out.length = 0; past.length = 0; imm.fill(NEVER); had.fill(0); shutL.length = 0;
      if (!s || s.v !== 1) return false; rs = s.rs >>> 0; seq = s.seq || 0;
      for (const q of s.out || []) { const o = { id: q.id, k: q.k, name: q.name, at: q.at, from: q.from, fromName: q.fromName, year: q.year, dead: q.dead, realms: q.realms, inf: new Float32Array(MAXC), since: new Float64Array(MAXC), cure: new Float32Array(MAXC).fill(1), n: 0 }; for (let i = 0; i < q.l.length; i += 4) { o.inf[q.l[i]] = q.l[i + 1] / 1000; o.since[q.l[i]] = q.l[i + 2]; o.cure[q.l[i]] = q.l[i + 3] / 1000; o.n++; } if (o.n) out.push(o); }
      shutL.length = 0; for (const c of s.shut || []) if (civs[c] && civs[c].sick && civs[c].sick.q) shutL.push(c);
      for (const p of s.past || []) past.push(p); for (let i = 0; i < (s.im || []).length; i += 2) imm[s.im[i]] = s.im[i + 1]; for (let i = 0; i < (s.hd || []).length; i += 2) had[s.hd[i]] = s.hd[i + 1];
      if (s.stats) Object.assign(stats, s.stats); return true;
    }
    return { step, seed, born, gone, view, lens, spared, bandOf, incF, setQ, quarantine, cure, unrest, save, load, stats, news, out, past, imm, had, deadly, KINDS };
  }
  return { create, KINDS, KK, NK, AGE, BANDS };
})();
