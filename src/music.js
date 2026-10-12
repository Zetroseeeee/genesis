// The music of the ages (music.js; window.MUSIC). Classic script, after sound.js: it plays on the sound's engine (SOUND.E), into
// its music bus.
//
// Every piece is made as it is played, from the age of the player's realm, its people and how things stand with it. An age has its
// instruments (`ENS`: a bone flute, a frame drum and a hum in the Stone Age; a lyre, a flute and bronze bells; a recorder, a lute
// and an organ's drone; lutes over viols; a piano over strings; an electric piano over a pad; glass), and a people its own while
// its music is its own (`FLAVOUR`: an oud, a ney and a darbuka in the Near East; a kora and a balafon in Africa; a koto, a bamboo
// flute and a temple bell in the east; a sitar's glide over a tanpura, and tabla, in India; a gamelan's bronze in the islands;
// panpipes and drums in the Americas), and its scale (SOUND.SCALE). A piece is a few phrases on one motif: the motif and its
// answer, the motif again and a close, a contrast higher up, the motif once more and the close on the key note; over a drone where
// the age knew no harmony, over chords from the Renaissance on. War makes it faster, lower and drummed; a golden age brighter; hard
// times slower and sparser. Between pieces the world is heard alone for a minute or two, as in the old games of empire; the home
// screen has the game's own theme.
(() => {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pick = (R, a) => a[(R() * a.length) | 0];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // the key note of each people (MIDI; TOWN's cultures: med, north, east, mena, africa, sasia, easia, seasia, america, namerica)
  const KEY = [62, 57, 59, 62, 60, 61, 62, 60, 57, 59];
  // the ensembles of the ages: who leads, who plays the figure under it, what is held (a drone or chords), the bass, the beat, the
  // colour (bells and the like); chords: harmony that moves; bpm: how fast
  const ENS = [
    { lead: 'boneflute', fig: null, hold: 'hum', bass: null, beat: 'frame', colour: 'stone', chords: false, bpm: [58, 70] },
    { lead: 'lyre', fig: 'lyre', hold: 'drone', bass: null, beat: 'frame', colour: 'bronze', chords: false, bpm: [64, 78] },
    { lead: 'flute', fig: 'lyre', hold: 'drone', bass: null, beat: 'frame', colour: 'bronze', chords: false, bpm: [64, 78] },
    { lead: 'lyre', fig: 'harp', hold: 'drone', bass: null, beat: 'frame', colour: 'bronze', chords: false, bpm: [66, 80] },
    { lead: 'recorder', fig: 'lute', hold: 'organ', bass: null, beat: 'tabor', colour: 'church', chords: false, bpm: [62, 76] },
    { lead: 'lute', fig: 'lute', hold: 'viol', bass: 'lute', beat: 'tabor', colour: 'church', chords: true, bpm: [68, 84] },
    { lead: 'piano', fig: 'piano', hold: 'strings', bass: 'piano', beat: null, colour: 'chime', chords: true, bpm: [62, 76] },
    { lead: 'piano', fig: 'piano', hold: 'strings', bass: 'piano', beat: null, colour: 'chime', chords: true, bpm: [58, 72] },
    { lead: 'epiano', fig: 'arp', hold: 'pad', bass: 'sub', beat: 'pulse', colour: 'chime', chords: true, bpm: [80, 96] },
    { lead: 'glass', fig: 'arp', hold: 'pad', bass: 'sub', beat: null, colour: 'glass', chords: true, bpm: [58, 70] },
  ];
  // a people's own instruments, from the Bronze Age until the machine age (the lead stays theirs through the Modern age)
  const FLAVOUR = {
    1: { colour: 'bronze' },
    3: { lead: 'ney', fig: 'oud', beat: 'darbuka', chords: false },
    4: { lead: 'kora', fig: 'kora', hold: 'hum', beat: 'djembe', colour: 'balafon', chords: false },
    5: { lead: 'sitar', fig: 'sitar', hold: 'tanpura', beat: 'tabla', chords: false },
    6: { lead: 'dizi', fig: 'koto', beat: 'taiko', colour: 'temple', chords: false },
    7: { lead: 'saron', fig: 'bonang', hold: 'hum', beat: 'kendang', colour: 'gong', chords: false, gamelan: true },
    8: { lead: 'panflute', fig: null, beat: 'drum', colour: 'stone', chords: false },
    9: { lead: 'panflute', fig: 'harp', beat: 'drum', colour: 'stone', chords: false },
  };
  function ensembleOf(era, cul, mood) {
    const e = Object.assign({}, ENS[clamp(era, 0, 9)]);
    const f = FLAVOUR[cul];
    if (f && era >= 1 && era <= 5) Object.assign(e, f);
    else if (f && f.lead && (era === 6 || era === 7)) { e.lead = f.lead === 'saron' ? 'piano' : f.lead; }      // (the machine age's piano and strings under the people's own voice)
    if (era === 0 && (cul === 8 || cul === 9)) e.lead = 'panflute';
    if (mood === 'war' && !e.beat) e.beat = era >= 6 ? 'timp' : 'frame';
    return e;
  }
  // the beats: a bar in eighths ('D' the deep stroke, 't' the high one, 'k' a kick, 'h' a hat, '.' nothing)
  const BEATS = {
    frame: { 4: ['D...D.t.', 'D...D...', 'D..tD.t.'], 3: ['D...t.', 'D.t.t.'] },
    tabor: { 4: ['D.t.D.tt', 'D.t.D.t.'], 3: ['D.t.t.', 'D.tt.t'] },
    darbuka: { 4: ['D.t.tD.t', 'D.t..Dt.'], 3: ['D.t.t.'] },
    djembe: { 4: ['D.ttD.tt', 'D.t.Dtt.'], 3: ['D.ttt.'] },
    tabla: { 4: ['D.tDt.D.', 'D.t.Dtt.'], 3: ['D.tDt.'] },
    taiko: { 4: ['D.......', 'D...D...', 'D.....t.'], 3: ['D.....'] },
    kendang: { 4: ['..t.D.t.', 'D.t..tD.'], 3: ['D.t.t.'] },
    drum: { 4: ['D...D...', 'D..tD...'], 3: ['D...t.'] },
    pulse: { 4: ['k.h.k.h.', 'k.hhk.h.'], 3: ['k.h.h.'] },
    timp: { 4: ['D.......', 'D...D...'], 3: ['D.....'] },
  };
  const BEATS_WAR = { 4: ['D.D.D.tt', 'D.tDD.tt', 'DD.tD.tt'], 3: ['D.DtD.', 'DtD.t.'] };
  // chords, four bars at a time (roots as steps of the scale)
  const PROG_MAJ = [[0, 5, 3, 4], [0, 3, 4, 0], [0, 4, 5, 3], [5, 3, 0, 4], [0, 3, 0, 4], [0, 5, 1, 4]];
  const PROG_MIN = [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 4], [0, 3, 6, 2], [0, 5, 3, 4]];
  // the rhythms a bar of melody is made of (beats)
  const CELLS = { 4: [[1, 1, 1, 1], [2, 1, 1], [1, 1, 2], [1.5, 0.5, 2], [1, 0.5, 0.5, 2], [0.5, 0.5, 1, 2], [3, 1], [2, 2], [1, 1, 1, 0.5, 0.5]], 3: [[1, 1, 1], [2, 1], [1, 2], [1.5, 0.5, 1], [1, 0.5, 0.5, 1], [3]] };

  // the game's own theme (the home screen): a melody of sixteen bars in the Dorian mode on A, a bar at a time [degree, beats], over
  // its own chords (roots, a bar each)
  const THEME = {
    scale: [0, 2, 3, 5, 7, 9, 10], key: 57, bpm: 60,
    roots: [0, 3, 4, 0, 0, 3, 6, 4, 6, 3, 4, 0, 3, 6, 4, 0],
    bars: [[[0, 2], [4, 2]], [[3, 1], [2, 1], [3, 2]], [[4, 2], [6, 1], [5, 1]], [[4, 4]],
      [[0, 2], [4, 2]], [[5, 1], [6, 1], [7, 2]], [[6, 1], [5, 1], [4, 1], [2, 1]], [[3, 2], [1, 2]],
      [[7, 2], [6, 2]], [[5, 1], [4, 1], [5, 2]], [[6, 2], [4, 2]], [[3, 4]],
      [[4, 2], [2, 2]], [[3, 1], [2, 1], [1, 2]], [[2, 1], [1, 1], [0, 1], [-1, 1]], [[0, 4]]],
  };
  // ---------------------------------------------------------------------------------------------------------------------------------
  // A piece: o = { era, cul, mood: 'calm' | 'war' | 'golden' | 'dark' | 'theme', seed }. Its events: [time, instrument, MIDI, seconds,
  // loudness, role]
  function compose(o) {
    const R = rng(o.seed || 1), era = clamp(o.era | 0, 0, 9), cul = clamp(o.cul | 0, 0, 9), mood = o.mood || 'calm';
    const E = o.mood === 'theme' ? { lead: 'flute', fig: 'harp', hold: 'strings', bass: 'harp', beat: null, colour: 'church', chords: true, bpm: [60, 64] } : ensembleOf(era, cul, mood);
    const S = (window.SOUND && SOUND.SCALE ? SOUND.SCALE[cul] : null) || [0, 2, 3, 5, 7, 9, 10];
    const scale = mood === 'theme' ? THEME.scale : S, N = scale.length;
    const minor = scale.length >= 7 ? scale[2] === 3 : scale.indexOf(3) >= 0 && scale.indexOf(4) < 0;
    const key = (mood === 'theme' ? THEME.key : KEY[cul]) - (mood === 'war' ? 2 : mood === 'golden' ? -2 : 0);
    const bpm = mood === 'theme' ? THEME.bpm : lerp(E.bpm[0], E.bpm[1], R()) * (mood === 'war' ? 1.15 : mood === 'golden' ? 1.04 : mood === 'dark' ? 0.86 : 1);
    const meter = E.gamelan || mood === 'war' || mood === 'theme' ? 4 : R() < 0.3 ? 3 : 4, beat = 60 / bpm, bar = meter * beat;
    const ev = [];
    const midiOf = (deg, oct) => { const q = Math.floor(deg / N), d = deg - q * N; return key + 12 * ((oct || 0) + q) + scale[d]; };
    const fifth = (() => { let best = 0, bd = 99; for (let k = 0; k < N; k++) { const d = Math.abs(scale[k] - 7); if (d < bd) { bd = d; best = k; } } return best; })();
    const hum = (t) => t + (R() - 0.5) * 0.024;
    const push = (t, inst, m, d, v, role) => { if (inst) ev.push([t, inst, m, d, v, role]); };

    // the form: an opening, A A' B A'' (two-bar halves), a close
    const intro = E.chords || E.hold ? 2 : 1, plan = [];
    const sec = (name, bars) => { plan.push({ name, bars }); };
    sec('intro', intro); sec('A', 4); sec('A2', 4); sec('B', 4); sec('A3', 4); sec('coda', 2);
    const bars = plan.reduce((a, p) => a + p.bars, 0);
    // harmony: a root (scale step) for every bar
    const roots = new Array(bars).fill(0);
    if (E.chords) {
      const P = minor ? PROG_MIN : PROG_MAJ, pA = pick(R, P), pB = pick(R, P);
      let b = 0; for (const p of plan) { for (let k = 0; k < p.bars; k++, b++) roots[b] = p.name === 'B' ? pB[k % 4] : p.name === 'intro' || p.name === 'coda' ? 0 : pA[k % 4]; }
      // the close: the last bars of A2 and A3 come home through the fifth
      let at = 0; for (const p of plan) { if (p.name === 'A2' || p.name === 'A3') { roots[at + p.bars - 2] = fifth; roots[at + p.bars - 1] = 0; } at += p.bars; }
    } else {
      // a drone: on the key note, moving to the fourth or fifth for the contrast half the time
      const mv = R() < 0.5 ? (R() < 0.5 ? fifth : Math.max(1, fifth - 1)) : 0; let b = 0; for (const p of plan) for (let k = 0; k < p.bars; k++, b++) roots[b] = p.name === 'B' ? mv : 0;
    }
    if (mood === 'theme') { let b = 0; for (const p of plan) for (let k = 0; k < p.bars; k++, b++) roots[b] = p.name === 'intro' || p.name === 'coda' ? 0 : THEME.roots[(b - intro) % 16]; }
    const chordOf = (r) => [r, r + 2, r + 4];      // (stacked thirds of the scale; in a scale of five, its own spaced chord)

    // the motif: two bars of rhythm and steps of the scale, rising and falling
    const cells = CELLS[meter];
    const mkLine = (start, lo, hi, endOn, rh) => {
      const notes = []; let deg = start, b = 0;
      for (const cell of rh) { let tb = 0; for (const d of cell) { notes.push({ bar: b, at: tb, d, deg }); tb += d; } b++; }
      for (let k = 1; k < notes.length; k++) { const u = R(); let st = u < 0.6 ? (R() < 0.5 ? -1 : 1) : u < 0.85 ? (R() < 0.5 ? -2 : 2) : (R() < 0.5 ? -3 : 3); const prog = k / notes.length; if (prog < 0.5 && R() < 0.35) st = Math.abs(st); if (prog > 0.6 && R() < 0.35) st = -Math.abs(st); deg = clamp(deg + st, lo, hi); notes[k].deg = deg; }
      if (endOn !== undefined) { const last = notes[notes.length - 1]; last.deg = endOn; if (notes.length > 1) { const p = notes[notes.length - 2]; if (Math.abs(p.deg - endOn) > 2) p.deg = endOn + (p.deg > endOn ? 1 : -1); } }
      return notes;
    };
    const rhA = [pick(R, cells), pick(R, cells.filter((c) => c[c.length - 1] >= 1))], rhB = [pick(R, cells), pick(R, cells.filter((c) => c[c.length - 1] >= 1.5))];
    const s0 = pick(R, [0, 2, N >= 7 ? 4 : 2]);
    const motif = mkLine(s0, -2, N + 3, undefined, rhA);
    const answer = (endOn) => { const m = motif.map((n) => Object.assign({}, n)); const sh = pick(R, [1, -1, 2]); for (const n of m) n.deg = clamp(n.deg + sh, -2, N + 4); const last = m[m.length - 1]; last.deg = endOn; return m; };
    const contrast = mkLine(s0 + pick(R, [2, 3, 4]), 1, N + 5, fifth, rhB);
    const ornament = (m) => { const out = []; for (let k = 0; k < m.length; k++) { const n = m[k], nx = m[k + 1]; if (nx && n.d >= 1 && Math.abs(nx.deg - n.deg) >= 2 && R() < 0.6) { out.push(Object.assign({}, n, { d: n.d / 2 })); out.push(Object.assign({}, n, { at: n.at + n.d / 2, d: n.d / 2, deg: n.deg + Math.sign(nx.deg - n.deg) })); } else out.push(n); } return out; };
    // where each half is played
    const lines = { A: [motif, answer(fifth)], A2: [motif, answer(0)], B: [contrast, mkLine(contrast[contrast.length - 1].deg, 0, N + 4, fifth, rhA)], A3: [ornament(motif), answer(0)] };
    if (mood === 'theme') { const half = (b0) => { const out = []; for (let b = 0; b < 2; b++) { let at = 0; for (const [deg, d] of THEME.bars[b0 + b]) { out.push({ bar: b, at, d, deg }); at += d; } } return out; }; lines.A = [half(0), half(2)]; lines.A2 = [half(4), half(6)]; lines.B = [half(8), half(10)]; lines.A3 = [half(12), half(14)]; }
    const lead = E.lead, oct = { boneflute: 1, flute: 1, recorder: 1, ney: 0, dizi: 1, panflute: 1, glass: 1, epiano: 0, piano: 0, saron: 0, sitar: 0, lyre: 0, lute: 0, kora: 0, harp: 0 }[lead] ?? 0;
    let t0 = 0.3, bi = 0;
    const loud = { intro: 0.6, A: 0.8, A2: 0.85, B: 1, A3: 0.9, coda: 0.55 };
    for (const p of plan) {
      const L = loud[p.name];
      for (let k = 0; k < p.bars; k++, bi++) {
        const tb = t0 + k * bar, r = roots[bi], ch = chordOf(r);
        // the held part: a drone (the key note and its fifth) or the chord, a bar or two long
        if (E.hold && (k % (E.chords ? 1 : 2) === 0)) {
          const len = (E.chords ? 1 : 2) * bar + 0.25;
          if (E.hold === 'tanpura') { for (let q = 0; q < meter * (E.chords ? 1 : 2); q++) push(tb + q * beat, 'tanpura', q % 4 === 0 ? midiOf(fifth, -1) : q % 4 === 3 ? midiOf(0, -1) : midiOf(0, 0), beat * 2, 0.22 * L, 'hold'); }
          else if (E.chords) for (const d of ch) push(tb, E.hold, midiOf(d, -1), len, 0.2 * L, 'hold');
          else { push(tb, E.hold, midiOf(r, -1), len, 0.24 * L, 'hold'); push(tb, E.hold, midiOf(r + fifth, -1), len, 0.16 * L, 'hold'); }
        }
        // the bass
        if (E.bass && p.name !== 'intro') { push(hum(tb), E.bass, midiOf(r, -2), bar * 0.9, 0.42 * L, 'bass'); if (meter === 4 && R() < 0.5) push(hum(tb + 2 * beat), E.bass, midiOf(r + (R() < 0.5 ? fifth : 0), -2), bar * 0.45, 0.32 * L, 'bass'); }
        // the figure: an arpeggio over the chord or the drone's notes, eighths, or an ostinato that turns with the harmony
        if (E.fig && p.name !== 'coda') {
          const tones = E.chords ? [ch[0], ch[1], ch[2], ch[0] + N] : [0, fifth, N, fifth + N >= N + 3 ? N + 1 : fifth + N];
          const pat = meter === 4 ? (E.fig === 'kora' || E.fig === 'bonang' ? [0, 2, 1, 3, 2, 1, 3, 1] : p.name === 'B' ? [0, 2, 3, 2, 1, 2, 3, 2] : [0, 1, 2, 1, 3, 1, 2, 1]) : p.name === 'B' ? [0, 2, 3, 2, 1, 2] : [0, 1, 2, 3, 2, 1];
          const step = E.fig === 'piano' || E.fig === 'lute' || E.fig === 'kora' || E.fig === 'bonang' || E.fig === 'arp' || E.fig === 'koto' ? beat / 2 : beat;
          const n = Math.round(bar / step);
          for (let q = 0; q < n; q++) { if (E.fig === 'koto' && R() < 0.35) continue; const deg = tones[pat[q % pat.length]] + (E.chords ? 0 : r); push(hum(tb + q * step), E.fig, midiOf(deg, E.fig === 'arp' ? 0 : -1), step * 1.8, (q % (meter * (beat / step)) === 0 ? 0.36 : 0.26) * L, 'fig'); }
        }
        // the beat
        if (E.beat && p.name !== 'intro' && p.name !== 'coda' && (p.name !== 'A' || mood === 'war' || R() < 0.6)) {
          const pats = mood === 'war' && E.beat !== 'pulse' ? BEATS_WAR[meter] : (BEATS[E.beat] || BEATS.frame)[meter] || BEATS.frame[meter], pat = pats[(bi + (k === p.bars - 1 ? 1 : 0)) % pats.length];
          for (let q = 0; q < pat.length; q++) { const c = pat[q]; if (c === '.') continue; push(tb + q * beat / 2 + (R() - 0.5) * 0.01, E.beat, c === 'D' || c === 'k' ? 0 : c === 'h' ? 2 : 1, beat, (c === 'D' || c === 'k' ? 0.5 : 0.32) * L * (mood === 'war' ? 1.25 : 1), 'beat'); }
        }
      }
      // the melody of the section, two bars at a time
      const ls = lines[p.name];
      if (ls) for (let h = 0; h < 2; h++) for (const n of ls[h]) {
        const at = t0 + (h * 2 + n.bar) * bar + n.at * beat, r = roots[bi - p.bars + h * 2 + n.bar];
        let deg = n.deg; if (E.chords && n.at === 0) { const ch = chordOf(r).concat(chordOf(r).map((x) => x + N)).concat(chordOf(r).map((x) => x - N)); let best = deg, bd = 99; for (const c of ch) { const d = Math.abs(c - deg); if (d < bd) { bd = d; best = c; } } deg = best; }
        const lastOfHalf = n === ls[h][ls[h].length - 1];
        push(hum(at), lead, midiOf(deg, oct), n.d * beat * (lastOfHalf && n.d >= 1.5 ? 0.6 : 0.95), (n.at === 0 ? 0.62 : 0.5) * L * (0.9 + R() * 0.2), 'lead');      // (a breath at the end of a phrase)
      }
      // colour: a bell at the start of a section (a gong at the end of a gamelan's cycle)
      if (E.colour && (p.name === 'A' || p.name === 'B' || p.name === 'coda')) push(t0, E.colour, midiOf(p.name === 'B' ? fifth : 0, 1), 4, 0.25, 'colour');
      if (E.gamelan && p.name !== 'intro') for (let k = 1; k <= p.bars; k++) if (k % 4 === 0) push(t0 + k * bar - 0.02, 'gong', midiOf(0, -2), 6, 0.45, 'colour');
      t0 += p.bars * bar;
    }
    // the last note: the key note, held
    push(t0, lead, midiOf(0, oct), bar * 1.5, 0.5, 'lead'); if (E.hold && E.hold !== 'tanpura') push(t0, E.hold, midiOf(0, -1), bar * 2, 0.2, 'hold');
    ev.sort((a, b) => a[0] - b[0]);
    return { events: ev, length: t0 + bar * 2 + 3, bpm, meter, key, scale, ens: E, mood, era, cul };
  }

  // how loud each instrument is against the others (measured: tools/sound/render.js music, a part at a time)
  const GAIN = { boneflute: 0.53, flute: 0.53, recorder: 0.53, ney: 0.6, dizi: 0.53, panflute: 0.55, lyre: 1.6, harp: 2.4, lute: 1.7, oud: 2.3, kora: 1.8, sitar: 1.7, koto: 2.15,
    piano: 0.9, epiano: 0.8, arp: 1.4, glass: 1, saron: 1.15, bonang: 2.4, sub: 0.53, viol: 0.2, strings: 0.2, pad: 0.21, organ: 0.7, hum: 0.65, drone: 0.6, tanpura: 2.8,
    tabor: 1.6, pulse: 1.3, djembe: 1.4, taiko: 0.6, kendang: 1.7, chime: 1.6, temple: 0.8, gong: 0.45, balafon: 1.7 };
  const ROLE = { lead: 1, fig: 0.8, hold: 1, bass: 0.8, beat: 1, colour: 0.8 };
  // ---------------------------------------------------------------------------------------------------------------------------------
  // The instruments, on the sound's engine (E): play(E, out, t, midi, seconds, loudness)
  function Players(E) {
    const ctx = E.ctx, R = E.R;
    // the stage: each part a place in the stereo picture and a share of the hall
    const out = {};
    const bus = (name, pan, wet) => { const g = ctx.createGain(); g.gain.value = 1; const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(E.music); const s = ctx.createGain(); s.gain.value = wet; p.connect(s); s.connect(E.hall); out[name] = g; };
    bus('lead', -0.12, 0.35); bus('fig', 0.3, 0.3); bus('hold', 0, 0.4); bus('bass', 0, 0.15); bus('beat', -0.25, 0.22); bus('colour', 0.35, 0.5);
    // a held note: sawtooths a little apart through a lowpass, swelling in and dying away (strings, viols, a pad), or sines (an organ)
    function held(o, t, f, d, a, kind) {
      const g = ctx.createGain(), att = kind === 'pad' ? 0.9 : kind === 'organ' ? 0.15 : 0.45, rel = kind === 'organ' ? 0.3 : 0.8;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + Math.min(att, d * 0.5)); g.gain.setValueAtTime(a, t + Math.max(att, d - rel)); g.gain.linearRampToValueAtTime(0, t + d + rel * 0.5);
      if (kind === 'organ') { for (const [k, s] of [[1, 1], [2, 0.5], [3, 0.25], [4, 0.2], [6, 0.08]]) { const v = ctx.createOscillator(); v.frequency.value = f * k; const sg = ctx.createGain(); sg.gain.value = s * 0.35; v.connect(sg); sg.connect(g); v.start(t); v.stop(t + d + 0.4); } g.connect(o); return; }
      if (kind === 'hum') { E.choir(o, t, f, d + 0.4, a * 0.5); return; }
      const lp = E.filt('lowpass', kind === 'pad' ? 1100 : kind === 'viol' ? 1500 : 2000, 0.8); if (kind === 'pad') { const l = ctx.createOscillator(); l.frequency.value = 0.15; const lg = ctx.createGain(); lg.gain.value = 400; l.connect(lg); lg.connect(lp.frequency); l.start(t); l.stop(t + d + 1); }
      for (const k of [1, 1.004, 0.996]) { const v = ctx.createOscillator(); v.type = 'sawtooth'; v.frequency.value = f * k; const l = ctx.createOscillator(); l.frequency.value = 5 + R(); const lg = ctx.createGain(); lg.gain.value = kind === 'pad' ? 0 : f * 0.003; l.connect(lg); lg.connect(v.frequency); v.connect(lp); v.start(t); v.stop(t + d + 1); l.start(t); l.stop(t + d + 1); }
      lp.connect(g); g.connect(o);
    }
    // a drone: two reeds a hair apart (the bourdon of a pipe or a lyre's open strings ringing)
    function drone(o, t, f, d, a) { const lp = E.filt('lowpass', 900, 0.7), g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * 0.5, t + 0.8); g.gain.setValueAtTime(a * 0.5, t + d - 0.6); g.gain.linearRampToValueAtTime(0, t + d + 0.4); for (const k of [1, 1.003]) { const v = ctx.createOscillator(); v.type = 'sawtooth'; v.frequency.value = f * k; v.connect(lp); v.start(t); v.stop(t + d + 0.5); } lp.connect(g); g.connect(o); }
    // a plucked string bent at its start (a koto, a sitar's glide)
    function bent(o, t, f, a, kind, up) {
      const s = ctx.createBufferSource(); s.buffer = E.pluckBuf(f, 2.4, kind === 'sitar' ? 0.75 : 0.6, kind === 'sitar' ? 3 : 2.4);
      if (up) { s.playbackRate.setValueAtTime(Math.pow(2, -up / 12), t); s.playbackRate.setTargetAtTime(1, t + 0.05, 0.06); }
      let x = s; if (kind === 'sitar') { const p = E.filt('peaking', 2400, 3, 6); x.connect(p); x = p; }
      const g = ctx.createGain(); g.gain.value = a; x.connect(g); g.connect(o); s.start(t);
    }
    const P = {
      boneflute: (o, t, f, d, a) => { E.whistle(o, t, Math.max(0.2, d), f, f * 0.995, a * 0.45, { h2: 0.06, h3: 0.08, at: Math.min(0.4, 0.09 / d), rl: Math.min(0.5, 0.2 / d), vib: [4.5, 0.008], breath: 0.3 }); },
      flute: (o, t, f, d, a) => E.flute(o, t, f, Math.max(0.18, d), a * 0.5),
      recorder: (o, t, f, d, a) => { E.whistle(o, t, Math.max(0.15, d), f, f, a * 0.45, { h2: 0.12, h3: 0.06, at: Math.min(0.3, 0.04 / d), rl: Math.min(0.4, 0.1 / d), breath: 0.06 }); },
      dizi: (o, t, f, d, a) => { E.whistle(o, t, Math.max(0.18, d), f * 0.985, f, a * 0.45, { h2: 0.15, h3: 0.1, at: Math.min(0.4, 0.06 / d), rl: Math.min(0.5, 0.15 / d), vib: [5.8, 0.01], breath: 0.15 }); },
      ney: (o, t, f, d, a) => { E.whistle(o, t, Math.max(0.25, d), f * 0.99, f, a * 0.42, { h2: 0.05, h3: 0.04, at: Math.min(0.45, 0.15 / d), rl: Math.min(0.5, 0.25 / d), vib: [5, 0.01], breath: 0.45 }); },
      panflute: (o, t, f, d, a) => { E.whistle(o, t, Math.max(0.2, d), f, f * 0.998, a * 0.45, { h2: 0.04, at: Math.min(0.3, 0.05 / d), rl: Math.min(0.6, 0.3 / d), vib: [5, 0.006], breath: 0.38 }); },
      lyre: (o, t, f, d, a) => E.pluck(o, t, f, a * 0.7, 'lyre'),
      harp: (o, t, f, d, a) => E.pluck(o, t, f, a * 0.65, 'harp'),
      lute: (o, t, f, d, a) => E.pluck(o, t, f, a * 0.7, 'lute'),
      oud: (o, t, f, d, a) => E.pluck(o, t, f * 0.5 > 90 ? f : f, a * 0.75, 'lute'),
      kora: (o, t, f, d, a) => E.pluck(o, t, f, a * 0.6, 'harp'),
      koto: (o, t, f, d, a) => bent(o, t, f, a * 0.7, 'koto', R() < 0.25 ? 2 : 0),
      sitar: (o, t, f, d, a) => bent(o, t, f, a * 0.65, 'sitar', R() < 0.4 ? (R() < 0.5 ? 1 : 2) : 0),
      tanpura: (o, t, f, d, a) => bent(o, t, f, a * 0.5, 'sitar', 0),
      piano: (o, t, f, d, a) => E.piano(o, t, f, a * 0.7, d),
      epiano: (o, t, f, d, a) => E.epiano(o, t, f, a * 0.6),
      arp: (o, t, f, d, a) => E.epiano(o, t, f, a * 0.4),
      glass: (o, t, f, d, a) => E.glass(o, t, f, a * 0.5),
      saron: (o, t, f, d, a) => E.partials(o, t, f, a * 0.5, [[1, 1, 1.6], [2.76, 0.35, 0.8], [5.4, 0.12, 0.4]]),
      bonang: (o, t, f, d, a) => E.partials(o, t, f * 2, a * 0.35, [[1, 1, 1.1], [1.52, 0.3, 0.6], [3.9, 0.1, 0.25]]),
      sub: (o, t, f, d, a) => { E.whistle(o, t, Math.max(0.3, d), f, f, a * 0.5, { at: 0.05, rl: 0.3 }); },
      hum: (o, t, f, d, a) => held(o, t, f, d, a, 'hum'),
      drone: (o, t, f, d, a) => drone(o, t, f, d, a),
      organ: (o, t, f, d, a) => held(o, t, f, d, a, 'organ'),
      viol: (o, t, f, d, a) => held(o, t, f, d, a, 'viol'),
      strings: (o, t, f, d, a) => held(o, t, f, d, a, 'strings'),
      pad: (o, t, f, d, a) => held(o, t, f, d, a, 'pad'),
      // colour
      stone: (o, t, f, d, a) => E.bell(o, t, f, a * 0.6, 'stone'),
      bronze: (o, t, f, d, a) => E.bell(o, t, f, a * 0.45, 'bronze'),
      church: (o, t, f, d, a) => E.bell(o, t, f * 0.5, a * 0.4, 'church'),
      chime: (o, t, f, d, a) => E.bell(o, t, f, a * 0.35, 'chime'),
      temple: (o, t, f, d, a) => E.bell(o, t, f * 0.25, a * 0.5, 'temple'),
      balafon: (o, t, f, d, a) => E.partials(o, t, f, a * 0.5, [[1, 1, 0.5], [3.9, 0.3, 0.15], [9.2, 0.1, 0.05]]),
      gong: (o, t, f, d, a) => E.partials(o, t, f, a * 0.6, [[1, 1, 6], [1.98, 0.3, 4], [2.73, 0.2, 3], [4.1, 0.1, 2]], { beat: 0.8 }),
    };
    // the drums: m is the stroke (0 deep, 1 high, 2 a hat)
    const DRUM = {
      frame: (o, t, m, a) => m === 0 ? E.drum(o, t, 82, a * 0.6, 0.45, 700) : E.knock(o, t, 1400, a * 0.6, 0.04, 3),
      tabor: (o, t, m, a) => m === 0 ? E.drum(o, t, 140, a * 0.5, 0.25, 1200) : (E.knock(o, t, 2600, a * 0.5, 0.05, 1.5), E.knock(o, t, 4200, a * 0.25, 0.08, 1)),
      darbuka: (o, t, m, a) => m === 0 ? E.drum(o, t, 95, a * 0.6, 0.35, 900) : E.knock(o, t, 3200, a * 0.7, 0.03, 4),
      djembe: (o, t, m, a) => m === 0 ? E.drum(o, t, 72, a * 0.65, 0.4, 600) : E.drum(o, t, 330, a * 0.35, 0.12, 2400),
      tabla: (o, t, m, a) => { if (m === 0) { const v = ctx.createOscillator(); v.frequency.setValueAtTime(110, t); v.frequency.exponentialRampToValueAtTime(150, t + 0.2); const g = ctx.createGain(); g.gain.setValueAtTime(a * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); v.connect(g); g.connect(o); v.start(t); v.stop(t + 0.62); } E.partials(o, t, 560, a * 0.3, [[1, 1, 0.5], [2, 0.4, 0.3], [3, 0.2, 0.2]]); },
      taiko: (o, t, m, a) => m === 0 ? E.drum(o, t, 52, a * 0.9, 1.2, 400) : E.knock(o, t, 2000, a * 0.5, 0.02, 3),
      kendang: (o, t, m, a) => m === 0 ? E.drum(o, t, 90, a * 0.5, 0.3, 800) : E.drum(o, t, 260, a * 0.35, 0.1, 2000),
      drum: (o, t, m, a) => m === 0 ? E.drum(o, t, 70, a * 0.6, 0.5, 600) : E.knock(o, t, 1100, a * 0.5, 0.05, 3),
      pulse: (o, t, m, a) => m === 0 ? E.drum(o, t, 50, a * 0.6, 0.3) : m === 2 ? E.knock(o, t, 8000, a * 0.25, 0.02, 1) : E.knock(o, t, 1800, a * 0.4, 0.05, 2),
      timp: (o, t, m, a) => E.drum(o, t, 65, a * 0.7, 1.2),
    };
    return function play(e) {
      const [t, inst, m, d, a0, role] = e, o = out[role] || out.lead, a = a0 * (GAIN[inst] || 1) * (ROLE[role] || 1);
      if (role === 'beat') { (DRUM[inst] || DRUM.drum)(o, t, m, a); return; }
      const p = P[inst]; if (p) p(o, t, hz(m), d, a);
    };
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // The player: MUSIC.init() after SOUND.init(); MUSIC.update(dt) every frame
  const MUSIC = { on: false, piece: null, next: 0, at: 0, i: 0, compose, ENS, FLAVOUR, KEY, Players, stats: { pieces: 0, notes: 0 } };
  let G = null, play = null, seed = (Date.now() & 0xffff) | 1;
  MUSIC.init = function (game) { G = game || {}; if (!window.SOUND || !SOUND.E) return; play = Players(SOUND.E); MUSIC.on = true; MUSIC.next = SOUND.E.ctx.currentTime + 6; };
  // how things stand with the player's realm, as the music hears it
  MUSIC.moodOf = function (sim, me) {
    if (!me) return 'calm';
    if (me.wars && Object.keys(me.wars).length) return 'war';
    const cu = sim && sim.culture; if (cu && cu.isGolden && cu.isGolden(me.id)) return "golden";
    if (me.stability !== undefined && me.stability < 0.35) return 'dark';
    return 'calm';
  };
  MUSIC.update = function () {
    if (!MUSIC.on || !SOUND.E || SOUND.E.ctx.state !== 'running') return;
    const E = SOUND.E, now = E.ctx.currentTime, mode = G.mode ? G.mode() : 'play';
    const home = mode === 'intro';
    // a piece under way: what falls within the next second and a half is handed to the engine
    if (MUSIC.piece) {
      const P = MUSIC.piece, ev = P.events;
      while (MUSIC.i < ev.length && MUSIC.at + ev[MUSIC.i][0] < now + 1.5) { const e = ev[MUSIC.i++]; const t = MUSIC.at + e[0]; if (t >= now - 0.05) { play([t, e[1], e[2], e[3], e[4], e[5]]); MUSIC.stats.notes++; } }
      if (now > MUSIC.at + P.length) { MUSIC.piece = null; MUSIC.next = now + (home ? 25 : 70 + Math.random() * 90); }
      // (the home screen's theme gives way to the game's music when a game begins, and the game's to the theme on the way home)
      if ((home && P.mood !== 'theme') || (!home && P.mood === 'theme' && mode === 'play')) { MUSIC.fade(); }
      return;
    }
    if (now < MUSIC.next || (mode !== 'play' && !home)) return;
    const sim = G.sim && G.sim(), me = sim && sim.playerCiv ? sim.playerCiv() : null;
    const era = me ? me.era : 4, cul = me && window.TOWN && TOWN.civCulture ? TOWN.civCulture(sim, me) : 0;
    const mood = home ? 'theme' : MUSIC.moodOf(sim, me);
    MUSIC.start(compose({ era, cul, mood, seed: home ? 4011 : (seed = (seed * 48271) % 2147483647) }));
  };
  MUSIC.start = function (piece) { if (!play) return; MUSIC.piece = piece; MUSIC.i = 0; MUSIC.at = SOUND.E.ctx.currentTime + 0.4; MUSIC.stats.pieces++; };
  // fade what is playing out over a few seconds (a new game, the way home)
  MUSIC.fade = function () { const E = SOUND.E; if (!E || !MUSIC.piece) return; const g = E.music.gain, t = E.ctx.currentTime, v = g.value; g.cancelScheduledValues(t); g.setValueAtTime(v, t); g.linearRampToValueAtTime(0.0001, t + 2.5); MUSIC.piece = null; MUSIC.next = t + 3; setTimeout(() => { if (window.SOUND) SOUND.setVolume(SOUND.vol); }, 2700); };

  // For the tools: a piece rendered off the page (o: { era, cul, mood, seed, secs }) and its events
  MUSIC.render = async function (o) {
    const OAC = window.OfflineAudioContext, sr = o.rate || 44100, piece = compose(o), secs = Math.min(o.secs || piece.length, piece.length);
    const ctx = new OAC(2, Math.floor(sr * secs), sr), E = SOUND.Engine(ctx, o.seed || 7); E.master.gain.value = 0.9; E.music.gain.value = 0.6;
    // (handed over a second and a half ahead, as in the game: made all at once, thousands of notes stood in the graph together)
    const p = Players(E), ev = piece.events.filter((e) => e[0] < secs - 0.5 && (!o.roles || o.roles.indexOf(e[5]) >= 0)); let i = 0;
    const feed = (t) => { while (i < ev.length && ev[i][0] < t + 1.5) p(ev[i++]); };
    feed(0); for (let t = 1; t < secs - 0.5; t += 1) { const at = t; ctx.suspend(at).then(() => { feed(at); ctx.resume(); }); }
    const buf = await ctx.startRendering();
    return { buf, piece, stats: E.stats };
  };
  window.MUSIC = MUSIC;
})();
