// The sound of the world (sound.js; window.SOUND). Classic script.
//
// Nothing here is a recording. Every sound is made as it is heard, by the Web Audio API, out of noise, oscillators and filters: the
// wind and the sea out of noise shaped as wind and surf shape it, a bird's song out of a whistle bent the way that bird bends it, a
// bell out of the partials a bell rings with, a plucked string by Karplus and Strong's delay line. So the world can be heard wherever
// it is seen, in every age and every climate, and the game carries no sound files.
//
// What is heard is what the camera looks at (`scene`, worked out four times a second from the game): the wind, stronger the higher
// the eye and the more open the country, rushing past when the eye moves fast; the sea, by how far the shore is and how open the
// water lies (surf on an open coast, laps on a lake); the leaves of a wood in the gusts; birds by day - the kinds of each flora zone
// (trees.js), each in its season, most at dawn - and after dark crickets, frogs by fresh water, owls and the beasts of the night;
// cicadas through a hot summer's day; a town's murmur, the work of its age (flint knapped, an axe, a smithy, a mason, a bell, a steam
// whistle, traffic) and its fires after dark; the din of a battle. It fades as the eye rises: birds and insects within a kilometre or
// two, a town while it is large in the picture, the surf a few kilometres up; over the clouds only the wind of the heights, and from
// space nothing at all.
//
// Some voices are many at once and are rendered once, off the page's thread (an OfflineAudioContext), into a loop that is played and
// faded as the scene asks: the crickets of a summer night, a chorus of frogs, cicadas, a crowd's murmur, a fire's crackle. Birds and
// beasts are singers: each a kind, a place to the left or the right, a distance, singing its song again every so often until the eye
// goes elsewhere, as one bird in a hedge does.
//
// The interface has a voice too, in the age's own instruments (`KIT`: a wooden knock and a bone flute in the Stone Age, a lyre and
// bronze bells, a lute and church bells, a piano, an electric piano, glass): a click, a page that opens and closes, the turn, and what
// the age brings (a discovery, a new age, a war and a peace, a great person, a wonder, a golden age, a disaster, a town founded). Its
// melodies keep to the scale of the player's people (`SCALE`).
//
// Buses: the world, the interface and music under the master, through a gentle compressor; two rooms, the open air's (short, dark)
// for the world and a hall for the interface. The volumes are the player's (`setVolume`), kept with the settings.
(() => {
  'use strict';
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lsm = (a, b, x) => smooth(Math.log(a), Math.log(b), Math.log(Math.max(x, 1e-9)));      // smoothstep on a log scale (heights, distances)
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // the scales of the peoples (semitones above the key note), by TOWN's cultures: med, north, east, mena, africa, sasia, easia,
  // seasia, america, namerica
  const SCALE = [[0, 2, 3, 5, 7, 9, 10], [0, 3, 5, 7, 10], [0, 2, 3, 5, 7, 8, 10], [0, 1, 4, 5, 7, 8, 10], [0, 2, 4, 7, 9], [0, 1, 4, 5, 7, 8, 11], [0, 2, 4, 7, 9], [0, 1, 3, 7, 8], [0, 3, 5, 7, 10], [0, 2, 4, 7, 9]];
  // the age's instruments: what leads a melody, what rings, what is struck; the click's material
  const KIT = [
    { lead: 'flute', bell: 'stone', drum: 'frame', tick: 'wood' },     // Stone Age: bone flute, lithophone, frame drum
    { lead: 'lyre', bell: 'bronze', drum: 'frame', tick: 'bronze' },   // Bronze Age
    { lead: 'lyre', bell: 'bronze', drum: 'frame', tick: 'bronze' },   // Iron Age
    { lead: 'lyre', bell: 'bronze', drum: 'frame', tick: 'bronze' },   // Classical
    { lead: 'lute', bell: 'church', drum: 'tabor', tick: 'wood' },     // Medieval
    { lead: 'lute', bell: 'church', drum: 'tabor', tick: 'wood' },     // Renaissance
    { lead: 'piano', bell: 'church', drum: 'timp', tick: 'metal' },    // Industrial
    { lead: 'piano', bell: 'chime', drum: 'timp', tick: 'metal' },     // Modern
    { lead: 'epiano', bell: 'chime', drum: 'timp', tick: 'soft' },     // Information
    { lead: 'glass', bell: 'glass', drum: 'deep', tick: 'soft' },      // Space Age
  ];

  const TEXCACHE = {};
  // partials of struck things: [ratio, loudness, seconds]
  const BELLS = {
    church: [[0.5, 0.7, 5], [1, 0.8, 3.6], [1.19, 0.55, 2.8], [1.5, 0.3, 2.2], [2, 0.55, 2], [2.52, 0.25, 1.4], [3, 0.2, 1.1], [4.2, 0.12, 0.7], [5.4, 0.08, 0.5]],
    bronze: [[1, 1, 2.4], [2.02, 0.45, 1.6], [2.8, 0.3, 1.1], [4.1, 0.18, 0.7], [5.4, 0.1, 0.45]],
    temple: [[1, 1, 9], [2.42, 0.45, 6], [2.93, 0.3, 4.5], [4.12, 0.2, 3], [5.6, 0.12, 2]],
    stone: [[1, 1, 0.9], [2.7, 0.35, 0.35], [4.9, 0.15, 0.18]],
    chime: [[1, 1, 1.8], [2.01, 0.25, 1], [3.02, 0.12, 0.6], [4.2, 0.08, 0.4]],
    glass: [[1, 1, 2.6], [2.76, 0.3, 1.2], [5.4, 0.12, 0.6], [8.93, 0.06, 0.3]],
    anvil: [[1, 1, 0.9], [1.62, 0.7, 0.7], [2.41, 0.5, 0.5], [3.17, 0.35, 0.35], [4.3, 0.2, 0.25]],
  };
  // ---------------------------------------------------------------------------------------------------------------------------------
  // The engine: everything that sounds, on one AudioContext (the page's, or an OfflineAudioContext for the tools)
  function Engine(ctx, seed) {
    const E = { ctx, sr: ctx.sampleRate, R: rng(seed || 20260412), stats: { voices: 0, calls: 0 } };
    const R = E.R, sr = E.sr;
    const now = () => ctx.currentTime;

    // buses
    E.master = ctx.createGain(); E.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.25;
    E.master.connect(comp); comp.connect(ctx.destination);
    const bus = (g) => { const n = ctx.createGain(); n.gain.value = g; n.connect(E.master); return n; };
    E.world = bus(0.8); E.ui = bus(0.7); E.mduck = bus(1); E.music = ctx.createGain(); E.music.gain.value = 0.6; E.music.connect(E.mduck);      // (the music steps back under what the age brings: mduck)
    E.duck = ctx.createGain(); E.duck.connect(E.world);      // (the world is quieter while a page is open over it)

    // rooms: a convolver with a tail of noise made here, darkening as it dies away (the high frequencies first, as in air and halls)
    function room(len, damp, wet, out) {
      const n = Math.floor(len * sr), b = ctx.createBuffer(2, n, sr), pre = Math.floor(0.011 * sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch); let lp = 0;
        for (let i = pre; i < n; i++) {
          const u = (i - pre) / (n - pre), k = clamp(0.1 + damp * u * 1.7, 0, 0.985);
          lp = lp * k + (R() * 2 - 1) * (1 - k);
          d[i] = lp * Math.exp(-6.9 * u) * Math.sqrt((1 + k) / (1 - k));
        }
        for (let r = 0; r < 9; r++) { const i = pre + Math.floor((0.003 + R() * 0.07) * sr); if (i < n) d[i] += (R() < 0.5 ? -1 : 1) * (0.6 - r * 0.05); }      // early reflections
      }
      const c = ctx.createConvolver(); c.normalize = true; c.buffer = b;
      const g = ctx.createGain(); g.gain.value = wet; c.connect(g); g.connect(out);
      return c;
    }
    E.air = room(1.4, 0.6, 0.55, E.duck); E.hall = room(2.8, 0.45, 0.42, E.master);

    // noise, a few seconds of it (mono), its end faded into its start so that it loops without a seam
    function seam(d, n, x) { for (let i = 0; i < x; i++) { const u = i / x; d[i] = d[i] * Math.sqrt(u) + d[n + i] * Math.sqrt(1 - u); } }
    function noise(kind, secs) {
      const n = Math.floor(secs * sr), x = Math.floor(0.05 * sr), raw = new Float32Array(n + x);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
      for (let i = 0; i < n + x; i++) {
        const w = R() * 2 - 1;
        if (kind === 'white') raw[i] = w * 0.5;
        else if (kind === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
        else { br = (br + 0.02 * w) / 1.02; raw[i] = br * 3.5; }
      }
      seam(raw, n, x);
      const b = ctx.createBuffer(1, n, sr); b.getChannelData(0).set(raw.subarray(0, n)); return b;
    }
    E.white = noise('white', 5.3); E.pink = noise('pink', 6.1); E.brown = noise('brown', 7.3);

    // ---- placing a sound: how loud, from where (-1 left .. 1 right), how far (metres: far sounds lose their high frequencies and
    //      gain the room)
    function place(level, pan, dist, wet) {
      const g = ctx.createGain(); g.gain.value = level;
      let o = g;
      if (dist > 40) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = clamp(22000 / (1 + dist / 260), 900, 20000); f.Q.value = 0.5; g.connect(f); o = f; }
      const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); o.connect(p); p.connect(E.duck);
      const s = ctx.createGain(); s.gain.value = clamp(wet !== undefined ? wet : 0.12 + dist / 1500, 0, 0.8); p.connect(s); s.connect(E.air);
      return g;
    }
    function uiOut(level, wet) { const g = ctx.createGain(); g.gain.value = level; g.connect(E.ui); if (wet) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(E.hall); } return g; }
    E.place = place; E.uiOut = uiOut;

    // ---- the elements every sound is made of
    const curve = (n, f) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = f(i / (n - 1)); return a; };
    // an envelope: up in `at` of the length (a quarter sine), held, down in `rl` of it
    const envA = (a, at, rl) => curve(48, (u) => a * Math.min(1, u < at ? Math.sin(u / at * Math.PI / 2) : 1, u > 1 - rl ? Math.sin((1 - u) / rl * Math.PI / 2) : 1));
    function src(buf, t, dur, rate, off) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; if (rate) s.playbackRate.value = rate; s.start(t, off !== undefined ? off : R() * buf.duration * 0.9); s.stop(t + dur); return s; }
    function filt(type, f, q, gain) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; if (gain !== undefined) b.gain.value = gain; return b; }
    // a whistle: a sine bent from f0 (through fm) to f1, loud a for d seconds; h2/h3 the second and third harmonics' shares; tr a
    // trill (Hz, the loudness beating), vib [Hz, share] a vibrato, at/rl the envelope's ends (shares of the length), breath a share of
    // noise about the note (a dove's, a flute's)
    function whistle(o, t, d, f0, f1, a, op) {
      op = op || {}; E.stats.voices++;
      const fm = op.fm, fc = curve(40, (u) => fm !== undefined ? (u < 0.5 ? f0 * Math.pow(fm / f0, smooth(0, 1, u * 2)) : fm * Math.pow(f1 / fm, smooth(0, 1, u * 2 - 1))) : f0 * Math.pow(f1 / f0, op.ease ? smooth(0, 1, u) : u));
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(envA(a, op.at || 0.12, op.rl || 0.3), t, d);
      let out = g;
      if (op.tr) { const m = ctx.createGain(); m.gain.value = 0.5; const l = ctx.createOscillator(); l.frequency.value = op.tr; const lg = ctx.createGain(); lg.gain.value = 0.5; l.connect(lg); lg.connect(m.gain); l.start(t); l.stop(t + d + 0.02); g.connect(m); out = m; }
      out.connect(o);
      const parts = [[1, 1]]; if (op.h2) parts.push([2, op.h2]); if (op.h3) parts.push([3, op.h3]);
      for (const [k, s] of parts) {
        const v = ctx.createOscillator(); v.type = op.type || 'sine'; v.frequency.value = f0 * k; v.frequency.setValueCurveAtTime(k === 1 ? fc : fc.map((x) => x * k), t, d);
        if (op.vib) { const l = ctx.createOscillator(); l.frequency.value = op.vib[0]; const lg = ctx.createGain(); lg.gain.value = op.vib[1] * f0 * k; l.connect(lg); lg.connect(v.frequency); l.start(t); l.stop(t + d + 0.02); }
        if (s === 1) v.connect(g); else { const sg = ctx.createGain(); sg.gain.value = s; v.connect(sg); sg.connect(g); }
        v.start(t); v.stop(t + d + 0.02);
      }
      if (op.breath) { const n = src(E.white, t, d + 0.02); const bp = filt('bandpass', (f0 + f1) / 2, 2.5), lo = filt('lowpass', (f0 + f1) * 1.5, 0.7); const ng = ctx.createGain(); ng.gain.value = 0; ng.gain.setValueCurveAtTime(envA(a * op.breath * 3, 0.3, 0.4), t, d); n.connect(bp); bp.connect(lo); lo.connect(ng); ng.connect(o); }      // (the breath about a note: a band of noise about it, nothing high)
      return d;
    }
    // a harsh voice (a crow, a gull, a parrot, a beast): a sawtooth bent as a whistle is, through formants, with noise for the rasp
    function rasp(o, t, d, f0, f1, a, op) {
      op = op || {}; E.stats.voices++;
      const fm = op.fm, fc = curve(40, (u) => fm !== undefined ? (u < 0.5 ? f0 * Math.pow(fm / f0, smooth(0, 1, u * 2)) : fm * Math.pow(f1 / fm, smooth(0, 1, u * 2 - 1))) : f0 * Math.pow(f1 / f0, u));
      const v = ctx.createOscillator(); v.type = op.type || 'sawtooth'; v.frequency.value = f0; v.frequency.setValueCurveAtTime(fc, t, d);
      if (op.vib) { const l = ctx.createOscillator(); l.frequency.value = op.vib[0]; const lg = ctx.createGain(); lg.gain.value = op.vib[1] * f0; l.connect(lg); lg.connect(v.frequency); l.start(t); l.stop(t + d + 0.02); }
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(envA(a, op.at || 0.1, op.rl || 0.35), t, d);
      const F = op.f || [[1200, 2, 1], [2600, 4, 0.4]];
      for (const [f, q, s] of F) { const b = filt('bandpass', f, q); const sg = ctx.createGain(); sg.gain.value = s; v.connect(b); b.connect(sg); sg.connect(g); }
      if (op.noise) { const n = src(E.white, t, d + 0.02); const b = filt('bandpass', F[0][0], 1.2); const ng = ctx.createGain(); ng.gain.value = op.noise; n.connect(b); b.connect(ng); ng.connect(g); }
      if (op.lp) { const l = filt('lowpass', op.lp, 0.7); g.connect(l); l.connect(o); } else g.connect(o);
      v.start(t); v.stop(t + d + 0.02);
      return d;
    }
    // a knock: a short burst of noise through a resonance (wood f ~ 600..1600, stone and flint higher), ringing for `ring` seconds
    function knock(o, t, f, a, ring, q) {
      E.stats.voices++;
      const n = src(E.white, t, 0.012 + ring); const b = filt('bandpass', f, q || 6);
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * 2.2, t + 0.0015); g.gain.exponentialRampToValueAtTime(0.0003, t + 0.006 + ring);
      n.connect(b); b.connect(g); g.connect(o);
    }
    // partials struck at once (a bell, a bar, a gong, an anvil): [ratio, loudness, seconds]
    function partials(o, t, f, a, P, op) {
      op = op || {}; E.stats.voices++;
      for (const [r, s, d] of P) {
        const v = ctx.createOscillator(); v.frequency.value = f * r * (1 + (R() - 0.5) * 0.003);
        const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * s, t + (op.at || 0.002)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        v.connect(g);
        if (op.beat && r < 3) {      // (a great bell's low partials beat slowly, as its two halves are not quite alike)
          const m = ctx.createGain(); m.gain.value = 1; const l = ctx.createOscillator(); l.frequency.value = op.beat * (0.7 + R() * 0.6); const lg = ctx.createGain(); lg.gain.value = 0.3; l.connect(lg); lg.connect(m.gain); l.start(t); l.stop(t + d); g.connect(m); m.connect(o);
        } else g.connect(o);
        v.start(t); v.stop(t + d + 0.02);
      }
    }
    E.whistle = whistle; E.rasp = rasp; E.knock = knock; E.partials = partials; E.src = src; E.filt = filt; E.envA = envA; E.curve = curve;

    // ---- plucked strings (Karplus-Strong, tuned by an all-pass, its decay set in seconds); the buffers are kept
    const plucks = new Map();
    function pluckBuf(f, dur, bright, t60) {
      const key = Math.round(f * 4) + ':' + dur + ':' + bright + ':' + t60; let b = plucks.get(key); if (b) return b;
      const n = Math.floor(dur * sr), d = new Float32Array(n), r = rng(Math.round(f * 1000) + 7);
      const D = sr / f - 0.5, N = Math.max(2, Math.floor(D - 0.01)), fr = D - N, C = (1 - fr) / (1 + fr);
      const line = new Float32Array(N); let lp = 0, mean = 0;
      for (let i = 0; i < N; i++) { lp += ((r() * 2 - 1) - lp) * bright; line[i] = lp; mean += lp; }
      mean /= N; for (let i = 0; i < N; i++) line[i] -= mean;
      const rho = Math.min(0.99995, Math.pow(10, -3 / (f * t60)) / Math.max(0.5, Math.cos(Math.PI * f / sr)));
      let p = 0, x1 = 0, y1 = 0, prev = line[N - 1];
      for (let i = 0; i < n; i++) {
        const cur = line[p], avg = rho * 0.5 * (cur + prev); prev = cur;
        const y = C * avg + x1 - C * y1; x1 = avg; y1 = y;       // (the all-pass that puts the string in tune between two samples)
        line[p] = y; d[i] = cur; p = (p + 1) % N;
      }
      const fade = Math.floor(0.03 * sr); for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
      let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i])); for (let i = 0; i < n; i++) d[i] /= pk || 1;
      b = ctx.createBuffer(1, n, sr); b.getChannelData(0).set(d); plucks.set(key, b); if (plucks.size > 160) plucks.delete(plucks.keys().next().value);
      return b;
    }
    // body: the sound box's resonances (a lyre's tortoiseshell, a lute's bowl)
    function pluck(o, t, f, a, kind) {
      E.stats.voices++;
      const K = kind === 'lyre' ? [2.2, 0.5, 2.6, [[210, 3, 4], [520, 2.5, 3]]] : kind === 'lute' ? [2.4, 0.42, 2.2, [[180, 3, 5], [440, 2, 3], [1900, 1.5, -3]]] : kind === 'harp' ? [3.2, 0.55, 3.5, [[300, 2, 2]]] : kind === 'koto' ? [2.6, 0.6, 2.4, [[260, 2.5, 3]]] : [2, 0.5, 2, []];
      const s = ctx.createBufferSource(); s.buffer = pluckBuf(f, K[0], K[1], K[2]);
      let x = s; for (const [ff, q, gn] of K[3]) { const p = filt('peaking', ff, q, gn); x.connect(p); x = p; }
      const g = ctx.createGain(); g.gain.value = a; x.connect(g); g.connect(o); s.start(t);
    }
    // a flute (of bone, of cane, a recorder): a sine and a little of its harmonics, breathy, its vibrato coming in after the attack
    function flute(o, t, f, d, a) {
      E.stats.voices++;
      whistle(o, t, d, f, f * 0.998, a, { h2: 0.1, h3: 0.05, at: Math.min(0.4, 0.07 / d), rl: Math.min(0.5, 0.18 / d), vib: [5.2, 0.006], breath: 0.12 });
      knock(o, t, f * 2, a * 0.25, 0.04, 2);      // (the chiff of the breath against the edge)
    }
    // a struck string (a piano): partials a little sharp of the harmonic series, each dying the faster the higher it is, with the
    // hammer's knock
    function piano(o, t, f, a, len) {
      E.stats.voices++; const dk = len ? clamp(len / 1.6, 0.35, 1) : 1;      // (len: how long the note is meant to be held - a quick figure's notes are damped sooner)
      const P = []; for (let k = 1; k <= 6; k++) P.push([k * Math.sqrt(1 + 0.0004 * k * k), 1 / Math.pow(k, 1.25), 3.2 / Math.pow(k, 0.75) * clamp(300 / f, 0.35, 1.4) * dk]);
      partials(o, t, f, a * 0.5, P, { at: 0.003 }); partials(o, t, f * 1.0015, a * 0.25, P.slice(0, 2), { at: 0.003 });      // (six partials and a second string beside the first two: a piano's notes are many at once)
      knock(o, t, Math.min(4000, f * 3), a * 0.12, 0.03, 1.5);
    }
    // an electric piano (frequency modulation: the tine's bell in the attack, then a round tone)
    function epiano(o, t, f, a) {
      E.stats.voices++;
      const c = ctx.createOscillator(); c.frequency.value = f; const m = ctx.createOscillator(); m.frequency.value = f; const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 1.1); m.connect(mg); mg.connect(c.frequency);
      const t2 = ctx.createOscillator(); t2.frequency.value = f * 14; const tg = ctx.createGain(); tg.gain.setValueAtTime(f * 1.5, t); tg.gain.exponentialRampToValueAtTime(1, t + 0.08); t2.connect(tg); tg.connect(c.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.004); g.gain.exponentialRampToValueAtTime(a * 0.35, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      c.connect(g); g.connect(o); for (const v of [c, m, t2]) { v.start(t); v.stop(t + 2.7); }
    }
    // glass: a bell of frequency modulation at an inharmonic ratio, as a struck glass or a crystal rings
    function glass(o, t, f, a) {
      E.stats.voices++;
      const c = ctx.createOscillator(); c.frequency.value = f; const m = ctx.createOscillator(); m.frequency.value = f * 3.5; const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 2); m.connect(mg); mg.connect(c.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      c.connect(g); g.connect(o); c.start(t); m.start(t); c.stop(t + 3.3); m.stop(t + 3.3);
      partials(o, t, f * 2, a * 0.2, [[1, 1, 1.6], [2.76, 0.4, 0.9]]);
    }
    function bell(o, t, f, a, kind) { if (kind === 'glass') { glass(o, t, f, a); return; } partials(o, t, f, a, BELLS[kind] || BELLS.chime, kind === 'temple' || kind === 'church' ? { beat: 1.3 } : null); }
    // a drum: a skin's tone falling as it dies away, and the slap of the hand or the stick
    function drum(o, t, f0, a, dec, slap) {
      E.stats.voices++;
      const v = ctx.createOscillator(); v.frequency.setValueAtTime(f0 * 1.6, t); v.frequency.exponentialRampToValueAtTime(f0, t + 0.04); v.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + dec);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      v.connect(g); g.connect(o); v.start(t); v.stop(t + dec + 0.02);
      if (slap) knock(o, t, slap, a * 0.5, 0.05, 1.2);
    }
    // a horn (a bronze lur, a trumpet, brass): sawtooths a little apart, their brightness opening as the note swells
    function horn(o, t, f, d, a) {
      E.stats.voices++;
      const lp = filt('lowpass', 300, 1.2); lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(Math.min(5000, f * 7), t + 0.35); lp.frequency.exponentialRampToValueAtTime(Math.min(3000, f * 4), t + d);
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(envA(a, Math.min(0.4, 0.2 / d), Math.min(0.5, 0.6 / d)), t, d);
      for (const k of [1, 1.004, 0.996]) { const v = ctx.createOscillator(); v.type = 'sawtooth'; v.frequency.value = f * k; const l = ctx.createOscillator(); l.frequency.value = 4.8; const lg = ctx.createGain(); lg.gain.value = f * 0.004; l.connect(lg); lg.connect(v.frequency); v.connect(lp); v.start(t); v.stop(t + d + 0.02); l.start(t); l.stop(t + d + 0.02); }
      lp.connect(g); g.connect(o);
    }
    // a choir's "ah": sawtooths through the formants of the vowel, swelling slowly
    function choir(o, t, f, d, a) {
      E.stats.voices++;
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(envA(a, Math.min(0.45, 0.9 / d), Math.min(0.5, 1.4 / d)), t, d);
      const F = [[730, 7, 1], [1090, 9, 0.5], [2440, 12, 0.25]]; const bs = F.map(([ff, q, s]) => { const b = filt('bandpass', ff, q); const sg = ctx.createGain(); sg.gain.value = s * 3; b.connect(sg); sg.connect(g); return b; });
      for (let k = 0; k < 4; k++) { const v = ctx.createOscillator(); v.type = 'sawtooth'; v.frequency.value = f * (1 + (k - 1.5) * 0.004); const l = ctx.createOscillator(); l.frequency.value = 5 + R(); const lg = ctx.createGain(); lg.gain.value = f * 0.005; l.connect(lg); lg.connect(v.frequency); for (const b of bs) v.connect(b); v.start(t); v.stop(t + d + 0.02); l.start(t); l.stop(t + d + 0.02); }
      g.connect(o);
    }
    // a swish of paper (a page, a scroll), up or down
    function swish(o, t, d, f0, f1, a) {
      const n = src(E.white, t, d + 0.02); const b = filt('bandpass', f0, 0.9); b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(f1, t + d);
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(envA(a, 0.3, 0.6), t, d); n.connect(b); b.connect(g); g.connect(o);
    }
    // a rumble (an earthquake, thunder far off, a fall): brown noise swelling and dying, low
    function rumble(o, t, d, f, a) {
      const n = src(E.brown, t, d + 0.05); const b = filt('lowpass', f, 0.8);
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(envA(a, 0.2, 0.6), t, d); n.connect(b); b.connect(g); g.connect(o);
    }
    // what leads a melody in an age
    function lead(o, t, f, a, kind) {
      if (kind === 'flute') flute(o, t, f * 2, 0.5, a * 0.8);
      else if (kind === 'piano') piano(o, t, f, a);
      else if (kind === 'epiano') epiano(o, t, f, a * 0.8);
      else if (kind === 'glass') glass(o, t, f * 2, a * 0.6);
      else pluck(o, t, f, a, kind);
    }
    Object.assign(E, { pluck, flute, piano, epiano, glass, bell, drum, horn, choir, swish, rumble, lead, pluckBuf });

    // ---- what many voices make together, rendered once into a loop (OfflineAudioContext: off the page's thread)
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    E.loops = {};
    function texture(name, secs, build) {
      if (!OAC) return Promise.resolve(null);
      const ck = name + ':' + sr + ':' + secs; if (TEXCACHE[ck]) return Promise.resolve(E.loops[name] = TEXCACHE[ck]);      // (a buffer belongs to no context: the tools render many engines, and the textures once)
      const x = 1.5, n = Math.floor((secs + x) * sr), oc = new OAC(2, n, sr), sub = Engine.sub(oc, rng((seed || 1) + name.length * 977 + name.charCodeAt(0)));
      build(sub, secs + x);
      return oc.startRendering().then((buf) => {
        const m = Math.floor(secs * sr), xs = Math.floor(x * sr), out = ctx.createBuffer(2, m, sr);
        for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch).slice(); seam(d, m, xs); let pk = 0; for (let i = 0; i < m; i++) pk = Math.max(pk, Math.abs(d[i])); const k = pk > 0 ? 0.9 / pk : 1; const o = out.getChannelData(ch); for (let i = 0; i < m; i++) o[i] = d[i] * k; }
        E.loops[name] = out; TEXCACHE[ck] = out; return out;
      }).catch((e) => { console.warn('sound: ' + name, e); return null; });
    }
    E.texture = texture;
    return E;
  }
  // a small engine for rendering a texture: the elements, without buses or rooms, straight into the context's output
  Engine.sub = function (oc, R) {
    const E = { ctx: oc, sr: oc.sampleRate, R, stats: { voices: 0 } };
    const sr = oc.sampleRate;
    const mk = (kind, secs) => { const n = Math.floor(secs * sr), b = oc.createBuffer(1, n, sr), d = b.getChannelData(0); let br = 0; for (let i = 0; i < n; i++) { const w = R() * 2 - 1; if (kind === 'brown') { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; } else d[i] = w * 0.5; } return b; };
    E.white = mk('white', 3.1); E.brown = mk('brown', 4.3);
    E.out = oc.destination;
    E.pan = (p, level) => { const g = oc.createGain(); g.gain.value = level; const s = oc.createStereoPanner(); s.pan.value = clamp(p, -1, 1); g.connect(s); s.connect(oc.destination); return g; };
    return E;
  };

  // ---------------------------------------------------------------------------------------------------------------------------------
  // Textures: what is heard as a crowd of voices (built on a sub-engine `S` into an OfflineAudioContext of `len` seconds)
  function osc(S, type, f) { const v = S.ctx.createOscillator(); v.type = type; v.frequency.value = f; return v; }
  const TEX = {
    // field crickets: a carrier near 4.5 kHz, chirps of three to five pulses, each cricket at its own pace; and a few that trill
    crickets(S, len) {
      const R = S.R, ctx = S.ctx;
      for (let k = 0; k < 26; k++) {
        const out = S.pan(R() * 1.8 - 0.9, 0.04 + 0.9 * Math.pow(R(), 2.2)), f = 3900 + R() * 1300, trill = k < 4;
        const v = osc(S, 'sine', f), v2 = osc(S, 'sine', f * 2), g2 = ctx.createGain(); g2.gain.value = 0.08; v2.connect(g2);
        const g = ctx.createGain(); g.gain.value = 0; v.connect(g); g2.connect(g); g.connect(out); v.start(0); v2.start(0); v.stop(len); v2.stop(len);
        const P = trill ? 0 : 0.42 + R() * 0.55, n = trill ? 0 : 3 + (R() * 3 | 0), pr = 0.026 + R() * 0.012, pd = pr * 0.6;
        let t = R() * 1.2;
        while (t < len - 0.3) {
          if (trill) { const end = Math.min(len - 0.1, t + 2 + R() * 5); for (let u = t; u < end; u += 0.02) { g.gain.setValueAtTime(0, u); g.gain.linearRampToValueAtTime(1, u + 0.003); g.gain.linearRampToValueAtTime(0, u + 0.012); } t = end + 1 + R() * 3; continue; }
          for (let q = 0; q < n; q++) { const u = t + q * pr; g.gain.setValueAtTime(0, u); g.gain.linearRampToValueAtTime(1, u + 0.004); g.gain.setValueAtTime(1, u + pd - 0.006); g.gain.linearRampToValueAtTime(0, u + pd); }
          t += P * (0.95 + R() * 0.1) + (R() < 0.05 ? R() * 2 : 0);
        }
      }
    },
    // frogs: peepers' rising whistles, croakers' grating pulses, a toad's long trill
    frogs(S, len) {
      const R = S.R, ctx = S.ctx;
      for (let k = 0; k < 14; k++) {      // peepers
        const out = S.pan(R() * 1.8 - 0.9, 0.05 + 0.6 * Math.pow(R(), 2)), f = 2600 + R() * 500; let t = R();
        while (t < len - 0.2) { const v = osc(S, 'sine', f), g = ctx.createGain(); g.gain.value = 0; v.frequency.setValueAtTime(f * 0.86, t); v.frequency.linearRampToValueAtTime(f, t + 0.09); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.02); g.gain.linearRampToValueAtTime(0, t + 0.11); v.connect(g); g.connect(out); v.start(t); v.stop(t + 0.12); t += 0.8 + R() * 0.9; }
      }
      for (let k = 0; k < 7; k++) {       // croakers
        const out = S.pan(R() * 1.6 - 0.8, 0.1 + 0.5 * R()), f = 280 + R() * 300; let t = R() * 2;
        while (t < len - 0.6) {
          const bout = 1 + (R() * 3 | 0);
          for (let b = 0; b < bout; b++) {
            const d = 0.18 + R() * 0.3, rate = 28 + R() * 22, v = osc(S, 'sawtooth', f), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2.6; bp.Q.value = 3;
            const g = ctx.createGain(); g.gain.value = 0; for (let u = 0; u < d; u += 1 / rate) { g.gain.setValueAtTime(0, t + u); g.gain.linearRampToValueAtTime(1, t + u + 0.006); g.gain.linearRampToValueAtTime(0, t + u + 0.7 / rate); }
            v.connect(bp); bp.connect(g); g.connect(out); v.start(t); v.stop(t + d + 0.05); t += d + 0.12 + R() * 0.2;
          }
          t += 1 + R() * 3;
        }
      }
      for (let k = 0; k < 2; k++) {       // a toad's trill
        const out = S.pan(R() * 1.4 - 0.7, 0.25), f = 1500 + R() * 400; let t = R() * 4;
        while (t < len - 1) { const d = 3 + R() * 5, v = osc(S, 'sine', f), g = ctx.createGain(); g.gain.value = 0; for (let u = 0; u < Math.min(d, len - t - 0.2); u += 1 / 34) { g.gain.setValueAtTime(0, t + u); g.gain.linearRampToValueAtTime(1, t + u + 0.004); g.gain.linearRampToValueAtTime(0, t + u + 0.02); } v.connect(g); g.connect(out); v.start(t); v.stop(t + d); t += d + 4 + R() * 6; }
      }
    },
    // cicadas: noise through a narrow band, beaten fast, each insect swelling up, holding and dying away
    cicadas(S, len) {
      const R = S.R, ctx = S.ctx;
      for (let k = 0; k < 6; k++) {
        const out = S.pan(R() * 1.8 - 0.9, 0.2 + 0.8 * R()); let t = R() * 4;
        while (t < len - 2) {
          const d = Math.min(len - t - 0.1, 5 + R() * 9), n = S.ctx.createBufferSource(); n.buffer = S.white; n.loop = true;
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4800 + R() * 2400; bp.Q.value = 4;
          const am = ctx.createGain(); am.gain.value = 0.5; const l = osc(S, 'square', 140 + R() * 180), lg = ctx.createGain(); lg.gain.value = 0.5; l.connect(lg); lg.connect(am.gain);
          const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + d * 0.35); g.gain.setValueAtTime(1, t + d * 0.8); g.gain.linearRampToValueAtTime(0, t + d);
          n.connect(bp); bp.connect(am); am.connect(g); g.connect(out); n.start(t, R() * 2); n.stop(t + d); l.start(t); l.stop(t + d);
          t += d + 2 + R() * 7;
        }
      }
    },
    // a crowd's murmur: voices, each a glottal sawtooth through the formants of one vowel after another, in syllables, phrases and
    // pauses; so many together and so far off that no word can be made out
    murmur(S, len) {
      const R = S.R, ctx = S.ctx;
      const V = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240], [660, 1720, 2410], [490, 1350, 1690]];
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.5; lp.connect(ctx.destination);
      for (let k = 0; k < 12; k++) {
        const f0 = R() < 0.5 ? 100 + R() * 45 : 175 + R() * 60, pan = R() * 1.8 - 0.9, lvl = 0.25 + 0.75 * R();
        const sp = ctx.createStereoPanner(); sp.pan.value = pan; sp.connect(lp);
        const v = osc(S, 'sawtooth', f0); const g = ctx.createGain(); g.gain.value = 0; const fs = [0, 1, 2].map((j) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 6 + j * 3; b.frequency.value = V[0][j]; const s = ctx.createGain(); s.gain.value = [1, 0.5, 0.22][j] * lvl; v.connect(b); b.connect(s); s.connect(g); return b; });
        g.connect(sp); v.start(0); v.stop(len);
        let t = R() * 2;
        while (t < len - 0.5) {
          const syl = 3 + (R() * 10 | 0); let p = f0 * (1 + R() * 0.15);
          for (let s = 0; s < syl && t < len - 0.3; s++) {
            const d = 0.11 + R() * 0.14, vw = V[(R() * V.length) | 0];
            for (let j = 0; j < 3; j++) fs[j].frequency.setTargetAtTime(vw[j] * (0.95 + R() * 0.1), t, 0.025);
            p *= 0.97 + R() * 0.05; v.frequency.setTargetAtTime(p, t, 0.04);
            g.gain.setTargetAtTime(0.8 + R() * 0.4, t, 0.015); g.gain.setTargetAtTime(0.05, t + d * 0.75, 0.02);
            t += d;
          }
          g.gain.setTargetAtTime(0, t, 0.05); t += 0.4 + R() * 2.2;
        }
      }
    },
    // a fire: the breath of the flames and their crackle, now and then a pop
    fire(S, len) {
      const R = S.R, ctx = S.ctx;
      for (let ch = 0; ch < 2; ch++) { const n = ctx.createBufferSource(); n.buffer = S.brown; n.loop = true; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; const g = ctx.createGain(); g.gain.value = 0.5; const l = osc(S, 'sine', 0.23 + R() * 0.2), lg = ctx.createGain(); lg.gain.value = 0.25; l.connect(lg); lg.connect(g.gain); const p = S.pan(ch ? 0.5 : -0.5, 1); n.connect(lp); lp.connect(g); g.connect(p); n.start(0, R()); l.start(0); n.stop(len); l.stop(len); }
      let t = 0.05;
      while (t < len - 0.05) {
        const big = R() < 0.07, out = S.pan(R() * 1.2 - 0.6, big ? 0.9 : 0.15 + 0.5 * R()), n = ctx.createBufferSource(); n.buffer = S.white;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = big ? 700 + R() * 600 : 1600 + R() * 5000; bp.Q.value = 1.5 + R() * 3;
        const g = ctx.createGain(), d = big ? 0.03 : 0.004 + R() * 0.008; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.001); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.01);
        n.connect(bp); bp.connect(g); g.connect(out); n.start(t, R() * 2); n.stop(t + d + 0.02);
        t += R() < 0.15 ? 0.01 + R() * 0.04 : -Math.log(1 - R() * 0.999) / 7;
      }
    },
    // a battle far off: a roar of men, the clash of arms
    din(S, len) {
      const R = S.R, ctx = S.ctx;
      for (let ch = 0; ch < 2; ch++) { const n = ctx.createBufferSource(); n.buffer = S.brown; n.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.7; const g = ctx.createGain(); g.gain.value = 0.6; const l = osc(S, 'sine', 0.12 + R() * 0.1), lg = ctx.createGain(); lg.gain.value = 0.35; l.connect(lg); lg.connect(g.gain); n.connect(bp); bp.connect(g); g.connect(S.pan(ch ? 0.6 : -0.6, 1)); n.start(0, R()); l.start(0); n.stop(len); l.stop(len); }
      for (let k = 0; k < 9; k++) {      // shouts: short vowels, high and strained
        const out = S.pan(R() * 1.6 - 0.8, 0.2 + 0.4 * R()); let t = R() * 2;
        while (t < len - 1) { const d = 0.3 + R() * 0.5, f = 190 + R() * 140, v = osc(S, 'sawtooth', f), b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 800 + R() * 300; b.Q.value = 3; const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6, t + 0.06); g.gain.linearRampToValueAtTime(0, t + d); v.frequency.setValueAtTime(f, t); v.frequency.linearRampToValueAtTime(f * (0.85 + R() * 0.3), t + d); v.connect(b); b.connect(g); g.connect(out); v.start(t); v.stop(t + d + 0.02); t += d + 0.5 + R() * 2.5; }
      }
    },
  };

  // ---------------------------------------------------------------------------------------------------------------------------------
  // Birds: each a song, sung at t into o (a placed input), its length returned; r: the singer's own dice
  const BIRD = {
    // great tit: "tea-cher tea-cher": a high note and a lower one, three to six times
    tit(E, o, t, r) { const hi = 5800 + r() * 900, lo = hi * (0.62 + r() * 0.08), n = 3 + (r() * 4 | 0), p = 0.23 + r() * 0.06; for (let k = 0; k < n; k++) { E.whistle(o, t + k * p, 0.075, hi * 1.03, hi * 0.97, 0.45); E.whistle(o, t + k * p + 0.1, 0.09, lo * 1.04, lo * 0.98, 0.55); } return n * p; },
    // chiffchaff: "chiff chaff chaff chiff": quick falling notes on two pitches in no set order
    chiff(E, o, t, r) { const a = 5400 + r() * 500, b = a * 0.8, n = 6 + (r() * 7 | 0); let u = t; for (let k = 0; k < n; k++) { const f = r() < 0.5 ? a : b; E.whistle(o, u, 0.07, f * 1.14, f * 0.86, 0.45); u += 0.31 + r() * 0.12; } return u - t; },
    // cuckoo: "cu-coo", a falling third, again and again, in spring
    cuckoo(E, o, t, r) { const f = 630 + r() * 90, n = 5 + (r() * 9 | 0); for (let k = 0; k < n; k++) { const u = t + k * (0.98 + r() * 0.08); E.whistle(o, u, 0.17, f * 1.03, f, 0.6, { at: 0.25, rl: 0.3, h2: 0.05 }); E.whistle(o, u + 0.27, 0.3, f * 0.8, f * 0.76, 0.55, { at: 0.2, rl: 0.5, h2: 0.05 }); } return n; },
    // wood pigeon: "coo-COO-coo, coo-coo", soft hoots, a few times over
    pigeon(E, o, t, r) { const f = 380 + r() * 60, rh = [[0, 0.32, 0.5], [0.42, 0.52, 0.85], [1.05, 0.28, 0.6], [1.5, 0.24, 0.5], [1.85, 0.3, 0.55]], n = 2 + (r() * 3 | 0); for (let k = 0; k < n; k++) for (const [s, d, a] of rh) E.whistle(o, t + k * 2.5 + s, d, f * 0.96, f * 1.01, a * 0.6, { fm: f * 1.05, at: 0.35, rl: 0.45, h2: 0.1, breath: 0.12 }); return n * 2.5; },
    // blackbird: a few fluted, slurred notes, often ending in a squeaky twitter
    blackbird(E, o, t, r) { let u = t; const n = 3 + (r() * 5 | 0); for (let k = 0; k < n; k++) { const f0 = 1500 + r() * 1300, f1 = f0 * (0.78 + r() * 0.45), d = 0.12 + r() * 0.25; E.whistle(o, u, d, f0, f1, 0.5, { fm: f0 * (0.9 + r() * 0.35), h2: 0.12, at: 0.12, rl: 0.3 }); u += d + 0.03 + r() * 0.07; } if (r() < 0.7) { const m = 3 + (r() * 6 | 0); for (let k = 0; k < m; k++) { const f = 5000 + r() * 3000; E.whistle(o, u, 0.035, f, f * (0.7 + r() * 0.6), 0.22); u += 0.045; } } return u - t; },
    // song thrush: a phrase repeated two or three times, then another
    thrush(E, o, t, r) { let u = t; const P = 2 + (r() * 3 | 0); for (let p = 0; p < P; p++) { const nn = 2 + (r() * 4 | 0), ph = []; for (let k = 0; k < nn; k++) ph.push([2000 + r() * 3000, 0.06 + r() * 0.12, r() * 0.6 - 0.3]); const rep = 2 + (r() < 0.6 ? 1 : 0); for (let q = 0; q < rep; q++) { for (const [f, d, b] of ph) { E.whistle(o, u, d, f, f * (1 + b), 0.45, { h2: 0.15, at: 0.1, rl: 0.3 }); u += d + 0.035; } u += 0.12; } u += 0.35 + r() * 0.4; } return u - t; },
    // robin: thin high warbling, a phrase at a time (it sings in winter too)
    robin(E, o, t, r) { let u = t; const n = 6 + (r() * 10 | 0); for (let k = 0; k < n; k++) { const f = 2800 + r() * 4500, d = 0.04 + r() * 0.12; E.whistle(o, u, d, f, f * (0.7 + r() * 0.7), 0.3 + r() * 0.15, { fm: f * (0.8 + r() * 0.5), tr: r() < 0.25 ? 50 + r() * 50 : 0 }); u += d + 0.01 + r() * 0.05; } return u - t; },
    // skylark: a long torrent of notes high over open fields
    lark(E, o, t, r) { let u = t; const end = t + 7 + r() * 9; while (u < end) { const f = 2400 + r() * 3600, d = 0.03 + r() * 0.08; E.whistle(o, u, d, f, f * (0.8 + r() * 0.45), 0.22 + r() * 0.16, { tr: r() < 0.2 ? 40 + r() * 40 : 0 }); u += d + r() * 0.03; } return u - t; },
    // willow warbler: a sweet falling cascade
    warbler(E, o, t, r) { let u = t, f = 6200 + r() * 800; const n = 10 + (r() * 6 | 0); for (let k = 0; k < n; k++) { const d = 0.07 + r() * 0.04; E.whistle(o, u, d, f * 1.06, f * 0.92, 0.35, { fm: f * 1.1 }); u += d + 0.035; f *= 0.95; } return u - t; },
    // crow: "kraa", harsh, two to four times
    crow(E, o, t, r) { const f = 480 + r() * 180, n = 2 + (r() * 3 | 0); for (let k = 0; k < n; k++) E.rasp(o, t + k * (0.5 + r() * 0.2), 0.28 + r() * 0.12, f, f * 0.82, 0.5, { fm: f * 1.04, f: [[1300, 2, 1], [2500, 3, 0.4]], noise: 0.3 }); return n * 0.62; },
    // raven: a deep, hollow croak
    raven(E, o, t, r) { const f = 280 + r() * 80, n = 1 + (r() * 3 | 0); for (let k = 0; k < n; k++) E.rasp(o, t + k * 0.7, 0.32, f, f * 0.9, 0.55, { f: [[700, 3, 1], [1500, 4, 0.3]], noise: 0.15, vib: [28, 0.06] }); return n * 0.7; },
    // great spotted woodpecker: a short roll of knocks on a dead branch
    woodpecker(E, o, t, r) { const n = 12 + (r() * 10 | 0), rate = 16 + r() * 6, f = 900 + r() * 700; let u = t; for (let k = 0; k < n; k++) { E.knock(o, u, f, 1.4 * (1 - k / n * 0.5), 0.014, 5); E.knock(o, u, f * 0.45, 0.6 * (1 - k / n * 0.5), 0.02, 3); u += 1 / rate * (1 + k / n * 0.3); } return u - t; },
    // gull: "kee-ow" calls and a laughing series
    gull(E, o, t, r) { let u = t; const f = 850 + r() * 250; if (r() < 0.5) { E.rasp(o, u, 0.45, f * 1.1, f * 0.95, 0.55, { fm: f * 1.6, f: [[1700, 3, 1], [3200, 4, 0.4]] }); u += 0.6; } const n = 3 + (r() * 6 | 0); for (let k = 0; k < n; k++) { E.rasp(o, u, 0.13, f * 1.3, f * 1.1, 0.45, { f: [[1600, 3, 1], [3000, 4, 0.35]] }); u += 0.17 + k * 0.006; } return u - t; },
    // swifts: screaming parties wheeling over a summer town
    swift(E, o, t, r) { const n = 2 + (r() * 4 | 0); for (let k = 0; k < n; k++) { const f = 5500 + r() * 2000, u = t + k * 0.12 + r() * 0.3; E.rasp(o, u, 0.4 + r() * 0.4, f, f * 0.9, 0.3, { type: 'square', f: [[f, 6, 1]], vib: [55 + r() * 20, 0.04] }); } return 1.2; },
    // hoopoe: "hoop-hoop-hoop", soft and low
    hoopoe(E, o, t, r) { const f = 470 + r() * 80, n = 2 + (r() * 3 | 0), rep = 2 + (r() * 3 | 0); let u = t; for (let q = 0; q < rep; q++) { for (let k = 0; k < n; k++) { E.whistle(o, u, 0.14, f * 1.02, f * 0.98, 0.6, { h2: 0.08, at: 0.3, rl: 0.4, breath: 0.04 }); u += 0.24; } u += 1.6 + r(); } return u - t; },
    // nightingale (spring, by day and by night): repeated notes swelling, rising whistles, a rattle
    nightingale(E, o, t, r) { let u = t; const P = 3 + (r() * 3 | 0); for (let p = 0; p < P; p++) { const kind = r(); if (kind < 0.4) { const f = 1400 + r() * 900, n = 4 + (r() * 6 | 0); for (let k = 0; k < n; k++) { E.whistle(o, u, 0.07, f, f * 0.95, 0.2 + 0.4 * k / n, { h2: 0.1 }); u += 0.1; } } else if (kind < 0.75) { const n = 3 + (r() * 3 | 0); for (let k = 0; k < n; k++) { E.whistle(o, u, 0.32, 1300 + k * 120, 1900 + k * 140, 0.5, { at: 0.5, rl: 0.2 }); u += 0.42; } } else { for (let k = 0; k < 14; k++) { E.knock(o, u, 3500 + r() * 1500, 0.25, 0.01, 4); u += 0.03; } } u += 0.25 + r() * 0.3; } return u - t; },
    // tawny owl: "hooo ... hu-hu-hooooo"
    owl(E, o, t, r) { const f = 360 + r() * 70; E.whistle(o, t, 0.75, f * 0.98, f * 0.94, 0.55, { fm: f * 1.03, at: 0.2, rl: 0.5, h2: 0.08, breath: 0.08 }); const u = t + 2.4 + r() * 0.6; E.whistle(o, u, 0.16, f * 0.95, f, 0.35, { h2: 0.08 }); E.whistle(o, u + 0.32, 0.12, f * 0.95, f, 0.3, { h2: 0.08 }); E.whistle(o, u + 0.6, 1.1, f, f * 0.93, 0.55, { at: 0.08, rl: 0.5, vib: [7, 0.012], h2: 0.08, breath: 0.08 }); return u + 1.8 - t; },
    // scops owl: one soft "pew", over and over
    scops(E, o, t, r) { const f = 1150 + r() * 150, n = 4 + (r() * 6 | 0), p = 2.2 + r() * 0.8; for (let k = 0; k < n; k++) E.whistle(o, t + k * p, 0.2, f * 0.96, f * 1.02, 0.45, { at: 0.3, rl: 0.5, h2: 0.05 }); return n * p; },
    // loon: a long wail over a northern lake at dusk
    loon(E, o, t, r) { const f = 760 + r() * 120; E.whistle(o, t, 1.6, f, f * 1.25, 0.5, { at: 0.25, rl: 0.15, h2: 0.15, h3: 0.06 }); E.whistle(o, t + 1.6, 1.4, f * 1.25, f * 1.4, 0.5, { at: 0.05, rl: 0.4, h2: 0.15, h3: 0.06, vib: [6, 0.01] }); E.whistle(o, t + 3.1, 1.2, f * 1.38, f * 1.22, 0.42, { at: 0.1, rl: 0.6, h2: 0.15 }); return 4.4; },
    // nightjar: a long dry churring
    nightjar(E, o, t, r) { const d = 5 + r() * 7, f = 1300 + r() * 300; E.whistle(o, t, d, f, f * 0.96, 0.3, { tr: 36 + r() * 6, h2: 0.25, at: 0.05, rl: 0.08 }); return d; },
    // whip-poor-will (America's woods at night)
    whip(E, o, t, r) { const n = 6 + (r() * 10 | 0); for (let k = 0; k < n; k++) { const u = t + k * 0.95; E.whistle(o, u, 0.12, 1700, 1500, 0.45); E.whistle(o, u + 0.22, 0.1, 1100, 1000, 0.3); E.whistle(o, u + 0.42, 0.22, 1300, 2300, 0.55, { fm: 1350 }); } return n * 0.95; },
    // emerald-spotted wood dove: a falling, quickening cascade of coos (Africa)
    wooddove(E, o, t, r) { let u = t, f = 620 + r() * 80, gap = 0.62; const n = 10 + (r() * 6 | 0); for (let k = 0; k < n; k++) { E.whistle(o, u, Math.min(0.24, gap * 0.45), f, f * 0.97, 0.5 * (1 - k / n * 0.6), { h2: 0.08, at: 0.3, rl: 0.5, breath: 0.08 }); u += gap; gap *= 0.86; f *= 0.985; } return u - t; },
    // a dove's "work-HAR-der" (Africa and the south) or a mourning dove's "coo-OO-oo-oo" (America)
    dove(E, o, t, r) { const f = 480 + r() * 80, n = 2 + (r() * 3 | 0); for (let k = 0; k < n; k++) { const u = t + k * 2.2; E.whistle(o, u, 0.25, f * 0.95, f, 0.4, { h2: 0.08, breath: 0.1 }); E.whistle(o, u + 0.32, 0.45, f * 1.1, f * 1.04, 0.6, { fm: f * 1.18, h2: 0.08, breath: 0.1 }); E.whistle(o, u + 0.85, 0.3, f, f * 0.95, 0.45, { h2: 0.08, breath: 0.1 }); } return n * 2.2; },
    mdove(E, o, t, r) { const f = 470 + r() * 50; E.whistle(o, t, 0.45, f * 0.9, f * 1.02, 0.45, { h2: 0.08, breath: 0.1, at: 0.3 }); E.whistle(o, t + 0.5, 0.55, f * 1.12, f, 0.55, { h2: 0.08, breath: 0.1, fm: f * 1.15 }); for (let k = 0; k < 3; k++) E.whistle(o, t + 1.25 + k * 0.6, 0.48, f, f * 0.95, 0.42, { h2: 0.08, breath: 0.1 }); return 3.1; },
    // hornbill: "tok tok tok tokok-tokok", quickening
    hornbill(E, o, t, r) { let u = t, gap = 0.36; const f = 750 + r() * 250, n = 8 + (r() * 8 | 0); for (let k = 0; k < n; k++) { E.rasp(o, u, 0.06, f, f * 0.9, 0.5, { f: [[f * 1.5, 4, 1]] }); u += gap; gap = Math.max(0.12, gap * 0.9); } return u - t; },
    // coucal: a deep bubbling "hoop-hoop-hoop", falling
    coucal(E, o, t, r) { let u = t, f = 420 + r() * 60; const n = 6 + (r() * 6 | 0); for (let k = 0; k < n; k++) { E.whistle(o, u, 0.16, f, f * 0.96, 0.6, { h2: 0.12, breath: 0.1, at: 0.25 }); u += 0.22; f *= 0.965; } return u - t; },
    // barbet: "kutroo kutroo kutroo", on and on
    barbet(E, o, t, r) { const f = 720 + r() * 160, n = 6 + (r() * 10 | 0); for (let k = 0; k < n; k++) { const u = t + k * 0.55; E.whistle(o, u, 0.08, f * 1.1, f, 0.45, { h2: 0.1 }); E.whistle(o, u + 0.12, 0.22, f, f * 0.92, 0.5, { h2: 0.1, tr: 30 }); } return n * 0.55; },
    // parrots: harsh squawks
    parrot(E, o, t, r) { const n = 1 + (r() * 4 | 0); let u = t; for (let k = 0; k < n; k++) { const f = 900 + r() * 900; E.rasp(o, u, 0.12 + r() * 0.15, f, f * (0.7 + r() * 0.5), 0.45, { f: [[2200 + r() * 800, 2, 1], [4000, 3, 0.4]], noise: 0.45 }); u += 0.25 + r() * 0.4; } return u - t; },
    // bulbul: a cheerful bubbling phrase
    bulbul(E, o, t, r) { let u = t; const n = 4 + (r() * 4 | 0); for (let k = 0; k < n; k++) { const f = 1600 + r() * 1400, d = 0.07 + r() * 0.1; E.whistle(o, u, d, f, f * (0.8 + r() * 0.5), 0.45, { fm: f * (1.1 + r() * 0.3), h2: 0.15 }); u += d + 0.02; } return u - t; },
    // Japanese bush warbler: a long rising whistle and a flourish, "hooo-hokekyo" (spring, East Asia)
    uguisu(E, o, t, r) { const f = 1050 + r() * 150; E.whistle(o, t, 1.1, f * 0.85, f * 1.05, 0.5, { at: 0.4, rl: 0.1, h2: 0.05 }); E.whistle(o, t + 1.2, 0.09, f * 2.4, f * 2.2, 0.55); E.whistle(o, t + 1.34, 0.08, f * 2.0, f * 1.8, 0.5); E.whistle(o, t + 1.48, 0.35, f * 2.9, f * 2.2, 0.55, { fm: f * 3.1 }); return 1.9; },
    // white-throated sparrow: "old Sam Peabody Peabody" (America's north)
    sparrow(E, o, t, r) { const f = 3200 + r() * 600; E.whistle(o, t, 0.6, f, f, 0.45); E.whistle(o, t + 0.65, 0.6, f * 1.33, f * 1.33, 0.45); let u = t + 1.35; for (let k = 0; k < 3; k++) { E.whistle(o, u, 0.12, f * 1.42, f * 1.42, 0.4); E.whistle(o, u + 0.14, 0.12, f * 1.33, f * 1.33, 0.35); E.whistle(o, u + 0.28, 0.12, f * 1.26, f * 1.26, 0.35); u += 0.42; } return u - t; },
    // cardinal: loud slurred whistles, "birdie birdie birdie"
    cardinal(E, o, t, r) { const n = 4 + (r() * 6 | 0), f = 2400 + r() * 800; for (let k = 0; k < n; k++) E.whistle(o, t + k * 0.24, 0.18, f * 1.6, f * 0.7, 0.5, { at: 0.08, rl: 0.3 }); return n * 0.24; },
    // American robin: caroling phrases, "cheerily cheer-up"
    arobin(E, o, t, r) { let u = t; const n = 3 + (r() * 4 | 0); for (let k = 0; k < n; k++) { const f = 2000 + r() * 1000; E.whistle(o, u, 0.25, f * 0.9, f * 1.05, 0.45, { fm: f * 1.15, h2: 0.1 }); u += 0.38 + r() * 0.1; } return u - t; },
  };
  // the beasts: [kind] of the night, of the herds, of the towns
  const BEAST = {
    // wolves: a howl rising and falling, others joining it
    wolf(E, o, t, r) { const n = 1 + (r() * 3 | 0); let end = t; for (let k = 0; k < n; k++) { const u = t + k * (0.8 + r() * 1.5), f = 380 + r() * 220, d = 2.5 + r() * 2.5; E.whistle(o, u, d, f * 0.8, f * 0.85, 0.45, { fm: f * 1.3, at: 0.25, rl: 0.45, h2: 0.25, h3: 0.08, vib: [5, 0.008] }); end = Math.max(end, u + d); } return end - t; },
    // hyena: a whoop, rising, several times
    hyena(E, o, t, r) { const n = 3 + (r() * 4 | 0); for (let k = 0; k < n; k++) E.whistle(o, t + k * 1.6, 0.9, 260 + r() * 40, 850 + r() * 150, 0.5, { at: 0.3, rl: 0.3, h2: 0.3, h3: 0.1, ease: true }); return n * 1.6; },
    // lion: roars, then grunts, slower and quieter
    lion(E, o, t, r) { let u = t; const n = 3 + (r() * 3 | 0); for (let k = 0; k < n; k++) { const f = k < 2 ? 170 + r() * 30 : 130, d = k < 2 ? 1.3 : 0.5; E.rasp(o, u, d, f * 1.2, f * 0.75, k < 2 ? 0.9 : 0.6, { f: [[380, 2, 1], [900, 3, 0.4]], noise: 0.5, at: 0.2, rl: 0.6, lp: 1300 }); u += d + 0.6 + k * 0.25; } return u - t; },
    // elephant: a trumpet
    elephant(E, o, t, r) { const f = 420 + r() * 140, d = 1 + r() * 0.6; E.rasp(o, t, d, f * 0.8, f * 0.7, 0.55, { fm: f * 1.35, f: [[1500, 2, 1], [3100, 3, 0.5]], noise: 0.3, vib: [11, 0.03], at: 0.15, rl: 0.4 }); return d; },
    // cattle: a moo, the vowel moving from "o" to "u"
    cow(E, o, t, r) { const f = 105 + r() * 30, d = 1.2 + r() * 0.6; E.rasp(o, t, d, f, f * 0.92, 0.7, { fm: f * 1.3, f: [[480, 4, 1], [900, 6, 0.35]], at: 0.15, rl: 0.4, lp: 1500 }); return d; },
    // sheep and goats: a bleat with its quaver
    sheep(E, o, t, r) { const f = 260 + r() * 80, d = 0.6 + r() * 0.4; E.rasp(o, t, d, f, f * 0.95, 0.55, { f: [[750, 4, 1], [1250, 5, 0.5]], vib: [7 + r() * 2, 0.06], at: 0.12, rl: 0.4, lp: 3000 }); return d; },
    goat(E, o, t, r) { const f = 380 + r() * 120, d = 0.5 + r() * 0.3; E.rasp(o, t, d, f, f * 0.9, 0.5, { f: [[900, 4, 1], [1700, 5, 0.5]], vib: [9 + r() * 3, 0.09], at: 0.1, rl: 0.4, lp: 3500 }); return d; },
    // dogs: two or three barks
    dog(E, o, t, r) { const f = 380 + r() * 200, n = 1 + (r() * 3 | 0); for (let k = 0; k < n; k++) E.rasp(o, t + k * (0.3 + r() * 0.2), 0.11, f * 1.2, f * 0.8, 0.5, { f: [[800, 3, 1], [1800, 4, 0.4]], noise: 0.4, at: 0.1, rl: 0.5 }); return n * 0.45; },
    // a cock crowing at dawn
    rooster(E, o, t, r) { const f = 620 + r() * 100; const seg = [[0.12, 0.85, 1], [0.12, 1, 1.1], [0.18, 1.1, 1.15], [0.6, 1.15, 0.85]]; let u = t; for (const [d, a, b] of seg) { E.rasp(o, u, d, f * a, f * b, 0.45, { f: [[1500, 3, 1], [3000, 4, 0.4]], noise: 0.15 }); u += d + 0.02; } return u - t; },
  };
  // who lives where: [song, weight] by flora zone; `s` the seasons it sings in (spring only, or all year), `w` its habitat
  // (woods, open, water, town)
  const SINGERS = {
    temperate: [['blackbird', 3, 'w'], ['thrush', 2, 'w'], ['tit', 3, 'w'], ['chiff', 2, 'w', 'spring'], ['robin', 2, 'w', 'all'], ['cuckoo', 1.2, 'w', 'spring'], ['pigeon', 2, 'w'], ['woodpecker', 1, 'w', 'spring'], ['lark', 2.5, 'o'], ['crow', 1.2, 'o', 'all'], ['warbler', 1.2, 'w', 'spring']],
    boreal: [['thrush', 3, 'w'], ['warbler', 3, 'w', 'spring'], ['chiff', 1.5, 'w', 'spring'], ['cuckoo', 1.5, 'w', 'spring'], ['woodpecker', 1.5, 'w', 'all'], ['raven', 1, 'o', 'all'], ['lark', 1, 'o']],
    med: [['blackbird', 2.5, 'w'], ['tit', 2, 'w'], ['nightingale', 2, 'w', 'spring'], ['hoopoe', 1.5, 'o'], ['pigeon', 1.5, 'w'], ['lark', 1.5, 'o'], ['crow', 1, 'o', 'all']],
    easia: [['uguisu', 2, 'w', 'spring'], ['tit', 2, 'w'], ['bulbul', 2.5, 'w'], ['pigeon', 1.5, 'w'], ['cuckoo', 1, 'w', 'spring'], ['crow', 1.5, 'o', 'all'], ['lark', 1, 'o']],
    dry: [['lark', 2, 'o'], ['hoopoe', 1.5, 'o'], ['dove', 2, 'w'], ['bulbul', 1, 'w'], ['raven', 0.6, 'o', 'all']],
    savanna: [['wooddove', 2.5, 'w', 'all'], ['dove', 2, 'w', 'all'], ['hornbill', 1.5, 'w', 'all'], ['bulbul', 1.5, 'w', 'all'], ['lark', 1, 'o', 'all'], ['parrot', 0.8, 'w', 'all']],
    rain: [['bulbul', 2, 'w', 'all'], ['coucal', 1.5, 'w', 'all'], ['barbet', 2, 'w', 'all'], ['parrot', 1.8, 'w', 'all'], ['hornbill', 1.2, 'w', 'all'], ['wooddove', 1, 'w', 'all']],
    tundra: [['lark', 1, 'o'], ['raven', 0.5, 'o', 'all']],
    ice: [],
  };
  // the Americas sing their own: [old world's song, new world's]
  const NEW_WORLD = { blackbird: 'arobin', thrush: 'arobin', robin: 'cardinal', pigeon: 'mdove', tit: 'cardinal', chiff: 'sparrow', cuckoo: 'mdove', hoopoe: 'mdove', nightingale: 'cardinal', warbler: 'sparrow', uguisu: 'sparrow', wooddove: 'mdove', dove: 'mdove' };
  const NIGHT = {
    temperate: [['owl', 2, 'all'], ['nightjar', 0.7, 'summer'], ['nightingale', 0.8, 'spring']],
    boreal: [['owl', 1.5, 'all'], ['loon', 1.5, 'summer', 'water']],
    med: [['scops', 2.5, 'summer'], ['owl', 1, 'all'], ['nightingale', 1.2, 'spring'], ['nightjar', 0.6, 'summer']],
    easia: [['owl', 1.5, 'all'], ['scops', 1, 'summer']],
    dry: [['scops', 1, 'summer']],
    savanna: [['scops', 1, 'all'], ['nightjar', 1, 'all']],
    rain: [['owl', 1, 'all'], ['nightjar', 0.5, 'all']],
    tundra: [], ice: [],
  };

  // the work of a town, by its age (style era): [kind, per minute]
  const WORK = [
    [['knap', 3], ['chop', 2], ['drums', 0.35]],
    [['chop', 2], ['smith', 2], ['mason', 1], ['drums', 0.3]],
    [['chop', 1.5], ['smith', 2.5], ['mason', 1.5], ['hooves', 1]],
    [['chop', 1], ['smith', 2.5], ['mason', 2], ['hooves', 1.5], ['cart', 1]],
    [['chop', 1], ['smith', 2], ['mason', 1.5], ['hooves', 1.5], ['cart', 1.2], ['bells', 0.5]],
    [['smith', 2], ['mason', 1.5], ['hooves', 2], ['cart', 1.5], ['bells', 0.6]],
    [['hooves', 1.5], ['cart', 1], ['steam', 0.6], ['factory', 0.8], ['bells', 0.4]],
    [['car', 3], ['horn', 0.8], ['factory', 0.4]],
    [['car', 3.5], ['horn', 0.4]],
    [['ev', 3]],
  ];

  // ---------------------------------------------------------------------------------------------------------------------------------
  // The soundscape: beds (looped noise and textures, faded to the levels the scene asks for) and spots (singers, waves, the work of a
  // town), on an engine
  function Scape(E) {
    const ctx = E.ctx, R = E.R, X = { E, lv: {}, singers: [], night: [], beasts: [], last: -1, waveAt: 0, workAt: 0, battleAt: 0, gust: [0.4, 0.4], gv: [0, 0] };
    // a bed: a looped buffer through filters into a gain
    function bed(buf, chain, pan, wet) {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(ctx.currentTime + 0.01, R() * buf.duration * 0.9);
      let x = s; for (const f of chain) { x.connect(f); x = f; }
      const g = ctx.createGain(); g.gain.value = 0; x.connect(g);
      const p = ctx.createStereoPanner(); p.pan.value = pan || 0; g.connect(p); p.connect(E.duck);
      if (wet) { const w = ctx.createGain(); w.gain.value = wet; p.connect(w); w.connect(E.air); }
      return { s, g, chain };
    }
    const lp = (f, q) => E.filt('lowpass', f, q === undefined ? 0.7 : q), hp = (f, q) => E.filt('highpass', f, q === undefined ? 0.7 : q), pk = (f, q, g) => E.filt('peaking', f, q, g), bp = (f, q) => E.filt('bandpass', f, q);
    X.wind = [bed(E.pink, [lp(500, 0.6), pk(400, 2.5, 7)], -0.55), bed(E.pink, [lp(500, 0.6), pk(400, 2.5, 7)], 0.55)];
    X.leaves = [bed(E.white, [hp(1700), lp(6500)], -0.5, 0.15), bed(E.white, [hp(1700), lp(6500)], 0.5, 0.15)];
    X.sea = [bed(E.pink, [lp(800, 0.5), hp(70)], -0.45), bed(E.pink, [lp(800, 0.5), hp(70)], 0.45)];
    X.high = bed(E.brown, [lp(240, 0.6), pk(110, 1.5, 5)], 0);
    X.rush = bed(E.pink, [bp(900, 0.5)], 0);
    X.tex = {};      // the textures as they come: rendered once the sound is first heard (a page nobody listens to renders nothing)
    const want = { crickets: 16, frogs: 18, cicadas: 22, murmur: 20, fire: 12, din: 14 };
    X.load = () => X.ready || (X.ready = Object.keys(want).reduce((p, k) => p.then(() => E.texture(k, want[k], (S, len) => TEX[k](S, len)).then((buf) => { if (buf) X.tex[k] = bed(buf, [], 0, k === 'murmur' || k === 'din' ? 0.25 : 0.1); })), Promise.resolve()));

    // set a bed's level (smoothly: tc seconds)
    const set = (b, v, tc) => { if (!b) return; v = Math.max(0, v); if (b.v !== undefined && Math.abs(v - b.v) < 0.0005 + 0.01 * v) return; b.v = v; b.g.gain.setTargetAtTime(v, ctx.currentTime, tc || 0.8); };      // (only when it has changed: every event is kept on the parameter's timeline until it is past)

    // ---- the singers: up to n of a list near the eye, each singing again after its own pause
    function choose(list, pick) { let tot = 0; for (const it of list) tot += pick(it); let u = R() * tot; for (const it of list) { u -= pick(it); if (u <= 0) return it; } return list[list.length - 1]; }
    function tend(arr, n, list, pick, make, sc) {
      const t = ctx.currentTime;
      for (let k = arr.length - 1; k >= 0; k--) { const s = arr[k]; if (s.key !== sc.key || (arr.length > n && R() < 0.1) || !list.some((it) => it[0] === s.kind)) arr.splice(k, 1); }
      while (arr.length < n && list.length) { const it = choose(list, pick); if (!it || pick(it) <= 0) break; arr.push({ kind: it[0], pan: R() * 1.7 - 0.85, dist: 25 + Math.pow(R(), 1.5) * 260, key: sc.key, next: t + 0.5 + R() * 6, r: rng((R() * 1e9) | 0) }); }
      for (const s of arr) {
        if (s.next > t + 0.4) continue;
        const at = Math.max(t + 0.05, s.next), dur = make(s, at);
        s.next = at + dur + (s.gap || 2.5) + R() * 8;
      }
    }

    // ---- the scene, heard: levels for the beds, singers and spots
    X.update = function (sc, dt) {
      const t = ctx.currentTime, L = X.lv, agl = Math.max(1, sc.agl);
      const ground = 1 - lsm(400, 5000, agl), near = 1 - lsm(120, 2200, agl), air = lsm(1500, 9000, agl) * (1 - lsm(60000, 400000, agl));
      const play = sc.mode === 'play' ? 1 : 0, day = sc.day, night = 1 - day;
      // the wind: gusts as a slow random walk each side
      for (let s = 0; s < 2; s++) { X.gv[s] += (R() - 0.5) * dt * 1.4 - X.gv[s] * dt * 0.6; X.gust[s] = clamp(X.gust[s] + X.gv[s] * dt + (sc.windy * 0.7 - X.gust[s]) * dt * 0.12, 0.02, 1); }
      const exposure = clamp(0.35 + sc.water * 0.4 + smooth(800, 3000, sc.hgt) * 0.5 + sc.cold * 0.25 - sc.woods * 0.2, 0.15, 1.2);
      const solo = (k) => !X.solo || X.solo.has(k) ? 1 : 0;
      L.wind = solo('wind') * play * (0.07 + ground * 0.32 * exposure + air * 0.42) * (1 - lsm(100000, 600000, agl));
      for (let s = 0; s < 2; s++) { const g = X.gust[s], w = X.wind[s]; set(w, L.wind * (0.25 + 0.95 * g * g), 0.35); w.chain[0].frequency.setTargetAtTime(170 + 1150 * g * (agl > 3000 ? 0.6 : 1), t, 0.4); w.chain[1].frequency.setTargetAtTime(150 + 900 * g, t, 0.4); }
      L.leaves = solo('leaves') * play * near * sc.woods * sc.leafy * 0.3;
      for (let s = 0; s < 2; s++) set(X.leaves[s], L.leaves * (0.04 + 0.96 * X.gust[s] * X.gust[s]) * (0.5 + exposure), 0.5);      // (a still dawn in a wood is still)
      L.rush = solo('rush') * play * clamp(sc.speed - 0.4, 0, 3) * 0.05 * (1 - lsm(80000, 300000, agl));
      set(X.rush, L.rush, 0.25); X.rush.chain[0].frequency.setTargetAtTime(500 + clamp(sc.speed, 0, 4) * 400, t, 0.3);
      L.high = solo('high') * play * air * 0.19;
      set(X.high, L.high, 1.5);
      // the sea: by how far its edge is, the surf the louder the more open the water lies; a lake laps
      const shoreK = Math.exp(-Math.max(0, sc.shore - 40) / (350 + agl * 1.2)) * (1 - lsm(2500, 12000, agl));
      const openSea = sc.water * (1 - lsm(1500, 9000, agl)) * (1 - sc.fresh);
      L.surf = solo('surf') * play * shoreK * (sc.fresh > 0.5 ? 0.25 : 0.4 + 0.6 * sc.open) * 0.55;
      L.sea = solo('sea') * play * Math.max(shoreK * (sc.fresh > 0.5 ? 0.03 : 0.1 + 0.1 * sc.open), openSea * 0.2);
      for (const b of X.sea) set(b, L.sea, 1.2);
      // the night's insects: crickets where it is warm and the ground is not under snow; frogs by fresh water in spring and summer
      const warm = sc.warmth, landK = 1 - sc.water * 0.8;
      L.crickets = play * near * smooth(0.35, 0.85, night) * smooth(0.25, 0.65, warm) * landK * (1 - sc.snow) * (sc.grass + sc.woods * 0.7 + 0.2) * 0.18;
      L.frogs = play * near * smooth(0.2, 0.8, 1 - day) * smooth(0.3, 0.7, warm) * sc.wet * (1 - sc.snow) * 0.6 * (sc.zone === 'rain' ? 1.6 : 1);
      L.cicadas = play * near * day * smooth(0.65, 0.9, sc.heat) * (sc.woods + sc.grass * 0.5) * 0.22 * (sc.zone === 'med' || sc.zone === 'easia' || sc.zone === 'rain' || sc.zone === 'savanna' ? 1 : 0.35);
      // a town: its murmur while it is large in the picture, quieter at night; its fires after dark, where nobody yet has lamps
      const tw = sc.town; const tk = tw ? tw.k * (1 - lsm(3000, 30000, agl)) : 0;
      L.murmur = play * tk * (0.25 + 0.75 * day) * (tw && tw.era >= 7 ? 0.5 : 1) * 0.24;
      L.fire = play * tk * smooth(0.35, 0.8, night) * (tw && tw.style <= 5 ? 1 : 0) * 0.25;
      L.din = play * sc.battle * 0.36;
      if (X.solo) for (const k in L) if (!X.solo.has(k)) L[k] = 0;
      for (const k of ['crickets', 'frogs', 'cicadas', 'murmur', 'fire', 'din']) set(X.tex[k], L[k], k === 'din' ? 0.6 : 1.5);
      if (!play) { X.singers.length = 0; X.night.length = 0; X.beasts.length = 0; return; }

      // ---- spots
      // waves: on an open coast a breaker every eight seconds or so; on a lake or in a harbour small laps
      if (L.surf > 0.01 && t + 0.3 >= X.waveAt) {
        const at = Math.max(t + 0.05, X.waveAt), lake = sc.fresh > 0.5 || sc.open < 0.3;
        if (lake) { wave(at, L.surf * 0.6, true); X.waveAt = at + 0.7 + R() * 1.8; }
        else { wave(at, L.surf, false); X.waveAt = at + 5.5 + R() * 6 * (1.2 - sc.open * 0.4); }
      }
      // birds by day: more where there are woods and in spring, most at dawn; few in winter, none on the ice
      const zone = sc.zone, list0 = (SINGERS[zone] || []).filter((it) => it[3] === 'all' || (it[3] === 'spring' ? sc.spring > 0.35 : sc.summerish > 0.3));
      const list = sc.america ? list0.map((it) => [NEW_WORLD[it[0]] || it[0], it[1], it[2], it[3]]) : list0;
      const habitat = (it) => it[1] * (it[2] === 'w' ? sc.woods + 0.15 : it[2] === 'o' ? sc.grass + sc.farm * 0.8 + 0.1 : 1);
      const birdy = near * day * (0.25 + 0.75 * sc.summerish) * (1 + 1.8 * sc.dawn) * (1 - sc.snow * 0.7) * (sc.woods + sc.grass * 0.7 + sc.farm * 0.4) * (1 - sc.water * 0.7) * (tk > 0.4 ? 0.6 : 1);
      tend(X.singers, Math.round(clamp(birdy * 7, 0, 6)) * solo('birds'), list, habitat, (s, at) => sing(s, at, BIRD[s.kind], 0.36 * near), sc);
      // night birds
      const nlist = (NIGHT[zone] || []).filter((it) => (it[2] === 'all' || (it[2] === 'spring' ? sc.spring > 0.35 : sc.summerish > 0.3)) && (it[3] !== 'water' || sc.fresh > 0.3 || sc.wet > 0.3));
      const nl = sc.america ? nlist.map((it) => [it[0] === 'nightjar' || it[0] === 'scops' ? 'whip' : it[0], it[1], it[2], it[3]]) : nlist;
      tend(X.night, Math.round(clamp(near * smooth(0.5, 0.9, night) * (sc.woods + sc.grass * 0.4) * 3, 0, 2)) * solo('night'), nl, (it) => it[1], (s, at) => { s.gap = 6 + R() * 14; return sing(s, at, BIRD[s.kind], 0.4 * near); }, sc);
      // beasts: wolves in the northern woods at night while there are wolves to speak of, the lions and hyenas of the savanna, the
      // herds that graze near by, a village's dogs and cocks
      const B = [];
      if (sc.era < 7 && (zone === 'boreal' || zone === 'temperate' || zone === 'tundra') && night > 0.5 && tk < 0.2) B.push(['wolf', 1]);
      if (zone === 'savanna' && night > 0.5 && sc.era < 7) B.push(['hyena', 1.2], ['lion', 0.7]);
      for (const h of sc.herds) { const k = h.kind; const m = k === 'cattle' || k === 'aurochs' || k === 'buffalo' || k === 'yak' || k === 'bison' ? 'cow' : k === 'sheep' ? 'sheep' : k === 'goat' ? 'goat' : k === 'elephant' || k === 'mammoth' ? 'elephant' : null; if (m) B.push([m, 0.8 * h.k]); }
      if (tk > 0.1 && sc.era >= 1) { B.push(['dog', 0.8 * tk]); if (sc.dawn > 0.3) B.push(['rooster', 1.5 * tk]); }
      const beasty = near * (B.length ? 1 : 0);
      tend(X.beasts, B.length ? Math.round(clamp(beasty * 2, 0, 2)) * solo('beasts') : 0, B, (it) => it[1], (s, at) => { s.gap = s.kind === 'wolf' ? 20 + R() * 40 : s.kind === 'lion' ? 30 + R() * 40 : 5 + R() * 16; s.dist = Math.max(s.dist, s.kind === 'wolf' || s.kind === 'lion' || s.kind === 'hyena' ? 300 : 60); return sing(s, at, BEAST[s.kind], 1.8 * near); }, sc);
      // the town's work
      if (tw && tk > 0.05 && day > 0.25 && solo('work') && t + 0.3 >= X.workAt) {
        const W = WORK[clamp(tw.style, 0, 9)], it = choose(W, (x) => x[1]), at = Math.max(t + 0.05, X.workAt), rate = W.reduce((a, x) => a + x[1], 0) / 60 * (0.5 + tw.size);
        work(it[0], at, tk, tw); X.workAt = at - Math.log(1 - R() * 0.99) / rate;
      }
      // a battle's clash
      if (sc.battle > 0.05 && solo('clash') && t + 0.3 >= X.battleAt) { const at = Math.max(t + 0.05, X.battleAt); clash(at, sc.battle, sc.battleEra); X.battleAt = at + 0.25 + R() * 1.4; }
    };
    function sing(s, at, fn, level) { if (!fn) return 5; E.stats.calls++; const o = E.place(level * 30 / (s.dist + 30), s.pan, s.dist); return fn(E, o, at, s.r) || 3; }
    function wave(at, a, small) {
      const pan = R() * 1.2 - 0.6, o = E.place(1, pan, 60, 0.08);
      if (small) { const d = 0.35 + R() * 0.5; const n = E.src(E.pink, at, d + 0.1); const b = E.filt('bandpass', 700 + R() * 900, 1.4); const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(E.envA(a * 0.9, 0.35, 0.6), at, d); n.connect(b); b.connect(g); g.connect(o); if (R() < 0.4) E.knock(o, at + d * 0.4, 500 + R() * 700, a * 0.3, 0.05, 9); return; }
      const rise = 1.3 + R() * 1.1, wash = 3.2 + R() * 2.8, big = 0.55 + R() * 0.6, tc = at + rise;
      // the wave coming in: a low roar growing as it curls
      const n1 = E.src(E.pink, at, rise + 0.4), b1 = E.filt('bandpass', 380, 0.8); b1.frequency.setValueAtTime(380, at); b1.frequency.exponentialRampToValueAtTime(900, tc);
      const g1 = ctx.createGain(); g1.gain.setValueAtTime(0.0001, at); g1.gain.exponentialRampToValueAtTime(a * big * 0.45, tc); g1.gain.setTargetAtTime(0.0001, tc + 0.05, 0.12);
      n1.connect(b1); b1.connect(g1); g1.connect(o);
      // the crash: everything at once, darkening as it spreads
      const n2 = E.src(E.pink, tc - 0.02, 5.6), b2 = E.filt('lowpass', 7000, 0.6); b2.frequency.setValueAtTime(7000, tc); b2.frequency.exponentialRampToValueAtTime(1400, tc + 1.8);
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, tc - 0.02); g2.gain.linearRampToValueAtTime(a * big * 1.5, tc + 0.12); g2.gain.setTargetAtTime(0.0001, tc + 0.2, 0.75);
      n2.connect(b2); b2.connect(g2); g2.connect(o);
      // the wash running up the beach, a fizz of foam dying away slowly
      const n3 = E.src(E.white, tc, 1.2 + wash * 2.4), b3 = E.filt('bandpass', 3800, 0.45), g3 = ctx.createGain(); g3.gain.setValueAtTime(0.0001, tc); g3.gain.linearRampToValueAtTime(a * big * 0.55, tc + 0.7); g3.gain.setTargetAtTime(0.0001, tc + 0.9, wash * 0.33);
      n3.connect(b3); b3.connect(g3); g3.connect(o);
      E.rumble(o, tc - 0.15, 1.3, 130, a * big * 0.9);
    }
    function work(kind, at, k, tw) {
      const dist = 60 + R() * 220, o = E.place(k * 3.2 * 40 / (dist + 40), R() * 1.6 - 0.8, dist); E.stats.calls++;
      if (kind === 'knap') { const n = 2 + (R() * 4 | 0); for (let i = 0; i < n; i++) E.knock(o, at + i * (0.5 + R() * 0.6), 2800 + R() * 2200, 0.55, 0.01, 3); }
      else if (kind === 'chop') { const n = 3 + (R() * 5 | 0); for (let i = 0; i < n; i++) { const u = at + i * (0.85 + R() * 0.25); E.knock(o, u, 420 + R() * 160, 0.8, 0.06, 2.5); E.knock(o, u, 1800, 0.2, 0.02, 2); } }
      else if (kind === 'smith') { const n = 3 + (R() * 6 | 0); for (let i = 0; i < n; i++) { const u = at + i * (0.42 + R() * 0.08); E.partials(o, u, 1250 + R() * 60, i % 3 === 2 ? 0.12 : 0.3, BELLS.anvil); E.knock(o, u, 2500, 0.3, 0.01, 2); } }
      else if (kind === 'mason') { const n = 6 + (R() * 10 | 0); for (let i = 0; i < n; i++) E.knock(o, at + i * (0.22 + R() * 0.06), 3200 + R() * 2600, 0.4, 0.008, 4); }
      else if (kind === 'drums') { const p = [0, 0.5, 0.75, 1, 1.5, 1.75]; for (let rep = 0; rep < 3; rep++) for (const q of p) E.drum(o, at + rep * 2 + q, q === 0 ? 80 : 120, 0.7, 0.35, 900); }
      else if (kind === 'hooves') { const d = 3 + R() * 3, step = 0.32; for (let u = 0; u < d; u += step) { const a = Math.sin(Math.PI * u / d); E.knock(o, at + u, 700 + R() * 200, 0.5 * a, 0.03, 4); E.knock(o, at + u + 0.09, 1100 + R() * 200, 0.35 * a, 0.02, 4); } }
      else if (kind === 'cart') { const d = 3.5 + R() * 2, n = E.src(E.brown, at, d), b = E.filt('bandpass', 180, 1.2), g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(E.envA(0.9, 0.45, 0.45), at, d); n.connect(b); b.connect(g); g.connect(o); for (let u = 0.3; u < d - 0.3; u += 0.18 + R() * 0.2) E.knock(o, at + u, 900 + R() * 600, 0.15 * Math.sin(Math.PI * u / d), 0.02, 5); }
      else if (kind === 'bells') { const big = tw.cul === 6 || tw.cul === 7, n = big ? 1 + (R() * 2 | 0) : 3 + (R() * 6 | 0), f = big ? 70 + R() * 30 : 330 + R() * 120; for (let i = 0; i < n; i++) E.bell(o, at + i * (big ? 9 : 2.1), f, 0.35, big ? 'temple' : 'church'); }
      else if (kind === 'steam') { const d = 1.4 + R(); for (const f of [520, 650]) E.rasp(o, at, d, f, f * 0.99, 0.3, { f: [[f * 2, 3, 1]], noise: 0.4, at: 0.15, rl: 0.3 }); }
      else if (kind === 'factory') { const n = 8 + (R() * 8 | 0); for (let i = 0; i < n; i++) E.drum(o, at + i * 0.75, 55, 0.6, 0.25, 300); }
      else if (kind === 'car' || kind === 'ev') {
        const d = 3 + R() * 2, n = E.src(E.pink, at, d), b = E.filt('bandpass', 700, 0.8), g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(E.envA(0.8, 0.5, 0.5), at, d); n.connect(b); b.connect(g); g.connect(o);
        const v = ctx.createOscillator(); v.type = kind === 'ev' ? 'sine' : 'sawtooth'; const f = kind === 'ev' ? 620 : 90 + R() * 40; v.frequency.setValueAtTime(f * 1.06, at); v.frequency.setValueAtTime(f * 1.06, at + d * 0.45); v.frequency.linearRampToValueAtTime(f * 0.94, at + d * 0.55);
        const vl = E.filt('lowpass', kind === 'ev' ? 2000 : 500, 1), vg = ctx.createGain(); vg.gain.value = 0; vg.gain.setValueCurveAtTime(E.envA(kind === 'ev' ? 0.06 : 0.3, 0.5, 0.5), at, d); v.connect(vl); vl.connect(vg); vg.connect(o); v.start(at); v.stop(at + d + 0.05);
      }
      else if (kind === 'horn') { for (const f of [415, 523]) E.rasp(o, at, 0.35, f, f, 0.2, { type: 'square', f: [[1200, 1, 1]], at: 0.05, rl: 0.15 }); }
    }
    function clash(at, a, era) {
      const dist = 150 + R() * 400, o = E.place(a * 2.2 * 60 / (dist + 60), R() * 1.6 - 0.8, dist);
      if (era >= 7) { if (R() < 0.6) { const n = 4 + (R() * 10 | 0); for (let i = 0; i < n; i++) E.knock(o, at + i * 0.09, 1200, 0.5, 0.05, 1); } else E.rumble(o, at, 2.5, 200, 1.2); }
      else if (era >= 5 && R() < 0.5) { if (R() < 0.3) E.rumble(o, at, 2, 160, 1.3); else { const n = 6 + (R() * 20 | 0); for (let i = 0; i < n; i++) E.knock(o, at + R() * 1.2, 900 + R() * 600, 0.5, 0.06, 1); } }
      else { const n = 1 + (R() * 3 | 0); for (let i = 0; i < n; i++) { const u = at + R() * 0.5; if (era >= 1) E.partials(o, u, 1500 + R() * 900, 0.25, BELLS.anvil.slice(0, 4).map(([r, s, d]) => [r, s, d * 0.4])); else E.knock(o, u, 900 + R() * 500, 0.6, 0.04, 3); } }
    }
    return X;
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // The interface's voice: ui(kind) and what the age brings (sting(kind))
  function Voice(E) {
    const ctx = E.ctx, R = E.R, V = { era: 0, cul: 0 };
    const kit = () => KIT[clamp(V.era | 0, 0, 9)];
    const scale = () => SCALE[clamp(V.cul | 0, 0, 9)] || SCALE[0];
    const key = () => 196 * Math.pow(2, ((V.cul * 5) % 7 - 3) / 12);      // (each people's key a little different)
    const note = (deg, oct) => { const S = scale(), n = S.length, o = Math.floor(deg / n), d = ((deg % n) + n) % n; return key() * Math.pow(2, (oct || 0) + o + S[d] / 12); };
    V.note = note;
    V.ui = function (kind) {
      const t = ctx.currentTime + 0.005, K = kit(), o = E.uiOut(0.5);
      if (kind === 'click' || kind === 'tab') {
        const a = kind === 'tab' ? 0.75 : 1;
        if (K.tick === 'wood') { E.knock(o, t, 1300, 0.9 * a, 0.03, 4); E.knock(o, t, 520, 0.45 * a, 0.04, 3); }
        else if (K.tick === 'bronze') { E.knock(o, t, 2100, 0.75 * a, 0.02, 5); E.partials(o, t, 3100, 0.05 * a, [[1, 1, 0.12], [1.48, 0.5, 0.08]]); }
        else if (K.tick === 'metal') { E.knock(o, t, 3200, 0.7 * a, 0.012, 3); E.knock(o, t + 0.012, 1800, 0.4 * a, 0.01, 4); }
        else { E.whistle(o, t, 0.035, 1500, 1250, 0.14 * a); }
      } else if (kind === 'open') { E.swish(o, t, 0.16, 1100, 3400, 0.2); E.drum(o, t + 0.04, 95, 0.15, 0.08); }
      else if (kind === 'close') { E.swish(o, t, 0.12, 3000, 1200, 0.25); }
      else if (kind === 'deny') { E.drum(o, t, 140, 0.15, 0.09); E.knock(o, t, 380, 0.15, 0.05, 2); }
      else if (kind === 'ok') { E.lead(E.uiOut(0.22, 0.15), t, note(4), 0.3, K.lead); E.lead(E.uiOut(0.22, 0.15), t + 0.07, note(7), 0.25, K.lead); }
    };
    V.sting = function (kind) {
      const t = ctx.currentTime + 0.02, K = kit(), o = E.uiOut(0.55, 0.35);
      switch (kind) {
        case 'turn': E.drum(o, t, 72, 0.32, 0.6, 700); break;
        case 'stop': E.lead(o, t, note(4), 0.35, K.lead); E.lead(o, t + 0.16, note(2), 0.3, K.lead); break;
        case 'alert': E.drum(o, t, 90, 0.22, 0.35, 600); E.lead(o, t + 0.02, note(2), 0.35, K.lead); E.lead(o, t + 0.2, note(1), 0.35, K.lead); break;
        case 'know': [0, 2, 4].forEach((d, i) => E.lead(o, t + i * 0.13, note(d), 0.38, K.lead)); E.bell(o, t + 0.4, note(7, 1), 0.12, K.bell); break;
        case 'age': {
          if (V.era >= 4) [0, 4, 7].forEach((d, i) => E.horn(o, t + i * 0.08, note(d === 4 ? 2 : d === 7 ? 4 : 0, -1), 3.6, 0.13));
          else { for (let i = 0; i < 6; i++) E.drum(o, t + i * 0.16, 70, 0.25 + i * 0.05, 0.4, 800); E.lead(o, t + 1, note(0), 0.4, K.lead); E.lead(o, t + 1.2, note(4), 0.4, K.lead); }
          E.bell(o, t + 1.1, note(0, 1), 0.2, K.bell); E.bell(o, t + 1.6, note(4, 1), 0.15, K.bell); E.choir(o, t + 0.3, note(0, -1), 4, 0.06); break;
        }
        case 'war': E.drum(o, t, 52, 0.7, 1.4, 400); E.drum(o, t + 0.55, 48, 0.75, 1.6, 400); if (V.era >= 1) E.horn(o, t + 0.9, note(0, -2) * 2, 2.2, 0.12); break;
        case 'peace': E.bell(o, t, note(0, 1), 0.2, K.bell); E.bell(o, t + 0.3, note(4, 1), 0.16, K.bell); E.lead(o, t + 0.6, note(7), 0.3, K.lead); break;
        case 'great': [0, 1, 2, 3, 4, 5].forEach((d, i) => E.lead(o, t + i * 0.09, note(d), 0.3, V.era >= 6 ? K.lead : 'harp')); break;
        case 'wonder': E.choir(o, t, note(0, -1), 3.5, 0.08); E.choir(o, t + 0.2, note(4, -1), 3.3, 0.06); E.bell(o, t + 1.2, note(0, 1), 0.2, K.bell); break;
        case 'golden': [7, 6, 5, 4, 3, 2].forEach((d, i) => E.bell(o, t + i * 0.18, note(d, 1), 0.14, K.bell)); E.choir(o, t + 0.4, note(0, -1), 3, 0.05); break;
        case 'disaster': E.rumble(o, t, 3, 140, 0.9); E.drum(o, t + 0.1, 45, 0.5, 1.5); break;
        case 'found': for (let i = 0; i < 3; i++) E.knock(o, t + i * 0.22, 700 + i * 40, 0.4, 0.05, 3); E.bell(o, t + 0.75, note(4, 1), 0.14, K.bell); break;
        case 'story': E.swish(o, t, 0.25, 900, 2800, 0.14); E.lead(o, t + 0.2, note(2), 0.3, K.lead); break;
        case 'fall': for (let i = 0; i < 3; i++) E.bell(o, t + i * 2.4, note(0, -1), 0.3, V.era >= 4 ? 'church' : 'temple'); break;
        case 'end': E.choir(o, t, note(0, -1), 6, 0.08); E.choir(o, t + 0.5, note(4, -1), 5.5, 0.06); for (let i = 0; i < 5; i++) E.bell(o, t + 1 + i * 0.6, note(7 - i, 1), 0.14, K.bell); break;
        default: break;
      }
    };
    return V;
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  // The game, heard: SOUND.init(game) once; SOUND.update(dt) every frame (the scene is worked out four times a second)
  const SOUND = {
    vol: { master: 0.8, world: 0.8, ui: 0.7, music: 0.6 }, on: false, E: null, X: null, V: null, scene: null, KIT, SCALE, BIRD, BEAST, TEX, Engine, Scape, Voice,
    get state() { return this.E ? this.E.ctx.state : 'none'; },
  };
  let G = null, acc = 0, sAcc = 1, lastCam = null, seenSeq = -1, lastEra = -1, lastMe = null;
  SOUND.init = function (game) {
    G = game || {};
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC || SOUND.E || window.GENESIS_MUTE) return;
    let ctx; try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { console.warn('sound: no audio', e); return; }
    SOUND.E = Engine(ctx, (Date.now() & 0xffffff) | 1); SOUND.X = Scape(SOUND.E); SOUND.V = Voice(SOUND.E); SOUND.on = true;
    SOUND.setVolume(G.volume || SOUND.vol);
    const wake = () => { if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {}); };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, wake, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) ctx.suspend().catch(() => {}); else wake(); });
    wake();
  };
  SOUND.setVolume = function (v) {
    Object.assign(SOUND.vol, v || {}); const E = SOUND.E; if (!E) return; const t = E.ctx.currentTime, V = SOUND.vol;
    E.master.gain.setTargetAtTime(Math.pow(clamp(V.master, 0, 1), 1.6) * 1.1, t, 0.05); E.world.gain.setTargetAtTime(Math.pow(clamp(V.world, 0, 1), 1.6), t, 0.05); E.ui.gain.setTargetAtTime(Math.pow(clamp(V.ui, 0, 1), 1.6), t, 0.05); E.music.gain.setTargetAtTime(Math.pow(clamp(V.music, 0, 1), 1.6), t, 0.05);
  };
  SOUND.ui = function (kind) { if (SOUND.V && SOUND.E.ctx.state === 'running') SOUND.V.ui(kind); };
  SOUND.sting = function (kind) {
    if (!SOUND.V || SOUND.E.ctx.state !== 'running') return;
    SOUND.V.sting(kind);
    if (/^(age|war|wonder|golden|end|fall|disaster)$/.test(kind)) { const g = SOUND.E.mduck.gain, t = SOUND.E.ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(0.3, t, 0.08); g.setTargetAtTime(1, t + 3.5, 1); }
  };

  // what the camera looks at, as the soundscape asks it (worked out from the game, a few times a second)
  const cellOf = (lon, lat) => clamp(Math.floor((90 - lat) / 180 * 360), 0, 359) * 720 + ((Math.floor((lon + 180) / 360 * 720) % 720) + 720) % 720;      // (the simulation's grid: 720 by 360)
  function sceneOf(dtS) {
    const cam = G.cam, T = G.terrain, sim = G.sim && G.sim(), RM = window.GEO ? GEO.R_M : 6371000;
    const sc = { mode: G.mode ? G.mode() : 'play', agl: 1e7, hgt: 0, lon: 0, lat: 0, day: 1, dawn: 0, spring: 0, summerish: 0.5, warmth: 0.5, heat: 0, cold: 0, snow: 0, leafy: 1, woods: 0, grass: 0, farm: 0, water: 0, shore: 1e9, open: 0, fresh: 0, wet: 0, zone: 'temperate', america: false, windy: 0.5, speed: 0, town: null, battle: 0, battleEra: 0, herds: [], era: 0, key: '' };
    if (!cam || !T) return sc;
    sc.agl = (cam.agl || cam.alt || 1) * RM; sc.lon = cam.lon; sc.lat = cam.lat; sc.hgt = Math.max(0, T.heightAt ? T.heightAt(cam.lon, cam.lat) : 0);
    // how fast the eye moves against how high it is (the rush of air when it flies)
    if (lastCam && dtS > 0) { const dKm = GEO.distKm(cam.lon, cam.lat, lastCam[0], lastCam[1]), dz = Math.abs(Math.log(Math.max(1e-6, cam.dist) / Math.max(1e-6, lastCam[2]))); sc.speed = (dKm * 1000 / Math.max(50, sc.agl) + dz * 2) / dtS; }
    lastCam = [cam.lon, cam.lat, cam.dist];
    // the sun where the eye looks, and the time of year there (seasonPhase: 0 the depth of the northern winter)
    const sun = G.sun && G.sun(), up = window.GEO ? GEO.toVec(cam.lon, cam.lat) : null;
    if (sun && up) { const su = sun.x * up.x + sun.y * up.y + sun.z * up.z; sc.day = smooth(-0.1, 0.12, su); const prev = SOUND._su === undefined ? su : SOUND._su; SOUND._su = su; sc.dawn = (su > prev ? 1 : 0.35) * smooth(-0.08, 0.04, su) * (1 - smooth(0.12, 0.35, su)); }
    const ph = ((G.season ? G.season() : 0.45) + (cam.lat < 0 ? 0.5 : 0)) % 1, tropic = 1 - smooth(18, 32, Math.abs(cam.lat));
    const summer = 0.5 - 0.5 * Math.cos(ph * TAU);
    sc.spring = tropic * 0.6 + (1 - tropic) * Math.exp(-Math.pow(((ph - 0.36 + 1.5) % 1) - 0.5, 2) / 0.008);
    sc.summerish = tropic + (1 - tropic) * smooth(0.25, 0.75, summer);
    if (sc.agl < 60000 && G.trees && G.trees.ready) {
      const fw = G.trees.forestAt(cam.lon, cam.lat, Math.max(1, sc.hgt));
      if (fw && fw.warm !== undefined) {
        sc.woods = clamp(fw.f || 0, 0, 1); sc.grass = clamp(fw.g || 0, 0, 1);
        const kc = fw.kc | 0; const Z = window.TREES && TREES.zoneOf ? TREES.zoneOf(cam.lon, cam.lat, sc.hgt, fw, 0.5, 0.5) : 'temperate';
        sc.zone = kc === 31 ? 'tundra' : kc === 30 ? 'ice' : Z;
        const Tz = { rain: 1, savanna: 0.95, dry: 0.85, med: 0.7, easia: 0.6, temperate: 0.5, boreal: 0.3, tundra: 0.1, ice: 0 }[sc.zone];
        sc.warmth = clamp(Tz * 0.6 + summer * 0.55 * (1 - tropic) + tropic * 0.45 - smooth(1500, 3500, sc.hgt) * 0.3, 0, 1);
        sc.heat = clamp((sc.zone === 'rain' || sc.zone === 'savanna' ? 0.85 : sc.zone === 'med' || sc.zone === 'dry' || sc.zone === 'easia' ? 0.35 + summer * 0.6 : 0.2 + summer * 0.55) - smooth(1200, 3000, sc.hgt) * 0.4, 0, 1);
        sc.cold = G.cold ? G.cold(cam.lat) : (1 - summer) * (1 - tropic);
        sc.leafy = sc.zone === 'boreal' ? 0.7 : 1 - (G.bare ? G.bare(cam.lat) : 0) * 0.75;
        sc.snow = G.snow ? G.snow() : 0;
        if (sc.snow > 0.3) sc.leafy *= 0.6;
        sc.wet = sc.zone === 'rain' ? 0.8 : 0;
      }
      const cl = sim && sim.climate; if (cl && cl.ice && cl.ice[cellOf(cam.lon, cam.lat)]) sc.zone = 'ice';
    }
    sc.america = cam.lon < -30 && cam.lon > -170;
    // the water about the eye: the point looked at and six round it, as far out as the eye is high
    if (sc.agl < 15000 && T.shoreAt) {
      const rM = clamp(sc.agl * 0.9, 250, 4000), dLat = rM / RM / D2R, dLon = dLat / Math.max(0.2, Math.cos(cam.lat * D2R));
      let wN = 0, best = 1e9, open = 0, fresh = 0;
      for (let k = 0; k < 7; k++) {
        const a = k * TAU / 6, lo = cam.lon + (k ? Math.cos(a) * dLon : 0), la = cam.lat + (k ? Math.sin(a) * dLat : 0);
        let d = T.shoreAt(lo, la); if (d === null) d = T.isWater && T.isWater(lo, la) ? -500 : 500;
        if (d < 0) wN++;
        const off = k ? rM * 0.5 : 0, ad = Math.max(0, Math.abs(d) - 0) + off;
        if (ad < best) { best = ad; open = T.wOpen || 0; fresh = T.wKind || 0; }
      }
      sc.water = wN / 7; sc.shore = best; sc.open = open; sc.fresh = fresh;
      if (fresh > 0.5 && best < 1500) sc.wet = Math.max(sc.wet, 1 - best / 1500);
    }
    sc.windy = clamp(0.45 + sc.cold * 0.3 + sc.water * 0.2 - sc.woods * 0.15, 0.1, 1);
    // the town nearest the point looked at, and how large it is in the picture
    const tw = G.world && G.world.nearTowns; if (tw && tw.length && sc.agl < 40000) {
      let best = null, bk = 0;
      for (const x of tw) { const dM = GEO.distKm(cam.lon, cam.lat, x.lon, x.lat) * 1000, rr = Math.sqrt(dM * dM + sc.agl * sc.agl), k = smooth(0.04, 0.45, x.R / rr); if (k > bk) { bk = k; best = x; } }
      if (best) sc.town = { k: bk, era: best.era, style: best.style, cul: best.cul, size: clamp(best.lvl / 4, 0.2, 1.5) };
    }
    // a battle near by (drawn as one while it is two years old or younger)
    if (sim && sim.battles && sc.agl < 60000) {
      let bb = 0, era = 0;
      for (const b of sim.battles) { if (sim.year - b.year > 2) continue; const lo = ((b.i % 720) + 0.5) / 720 * 360 - 180, la = 90 - (((b.i / 720) | 0) + 0.5) / 360 * 180; const dM = GEO.distKm(cam.lon, cam.lat, lo, la) * 1000, k = (1 - lsm(8000, 45000, Math.sqrt(dM * dM + sc.agl * sc.agl))); if (k > bb) { bb = k; const c = sim.civs[b.a]; era = c ? c.era : 0; } }
      sc.battle = bb; sc.battleEra = era;
    }
    // the herds near by (fauna.js)
    if (G.fauna && G.fauna.near && sc.agl < 5000) sc.herds = G.fauna.near(cam.lon, cam.lat, 3000);
    const me = sim && sim.playerCiv ? sim.playerCiv() : null; sc.era = me ? me.era : (sim ? 0 : 0);
    // what the singers belong to: they are let go when the eye goes elsewhere
    sc.key = sc.zone + ':' + Math.round(cam.lon * 20) + ':' + Math.round(cam.lat * 20) + ':' + (sc.agl < 2500 ? 'n' : 'f') + (sc.america ? 'a' : '');
    return sc;
  }
  SOUND.sceneOf = sceneOf;
  SOUND.update = function (dt) {
    const E = SOUND.E; if (!E || !SOUND.X) return;
    acc += dt; sAcc += dt; if (acc < 0.1) return;
    const d = acc; acc = 0;
    if (E.ctx.state !== 'running') return;
    const t0 = performance.now();
    SOUND.X.load();
    if (sAcc >= 0.25 || !SOUND.scene) { SOUND.scene = sceneOf(sAcc); sAcc = 0; }
    const sc = SOUND.scene;
    // a page open over the world: the world steps back
    E.duck.gain.setTargetAtTime(G.modal && G.modal() ? 0.4 : 1, E.ctx.currentTime, 0.3);
    SOUND.X.update(sc, d);
    // the interface follows the player's age and people
    const sim = G.sim && G.sim(), me = sim && sim.playerCiv ? sim.playerCiv() : null;
    if (me && SOUND.V) { SOUND.V.era = me.era; SOUND.V.cul = window.TOWN && TOWN.civCulture ? TOWN.civCulture(sim, me) : 0; }
    // what the realm hears of its own news: a discovery, a war, a peace, a great person, a wonder, a golden age, a disaster
    if (me && me.events && sc.mode === 'play') {
      const ev = me.events; const top = ev.length ? ev[ev.length - 1].seq || 0 : 0;
      if (seenSeq < 0 || lastEra < 0 || me !== lastMe || top < seenSeq) { seenSeq = top; lastEra = me.era; lastMe = me; return; }      // (a world begun or loaded: nothing of its past is news)
      if (top > seenSeq) {
        let best = null, rank = 0;
        for (let k = ev.length - 1; k >= 0 && (ev[k].seq || 0) > seenSeq; k--) { const e = ev[k], s = stingFor(e); if (s && s[1] > rank) { rank = s[1]; best = s[0]; } }
        seenSeq = top; if (best && me.era === lastEra) SOUND.sting(best);
      }
      if (me.era !== lastEra) { if (me.era > lastEra) SOUND.sting('age'); lastEra = me.era; }
    }
    const ms = performance.now() - t0; SOUND.ms = SOUND.ms === undefined ? ms : SOUND.ms * 0.95 + ms * 0.05;      // (what a tenth of a second of the soundscape costs the page, on the whole)
  };
  SOUND.reset = function () { seenSeq = -1; lastEra = -1; };
  // a piece of news, as the interface would sound it, and how much it matters against others that come at once
  function stingFor(e) {
    const tx = e.text || '';
    if (e.type === 'know') return ['know', 2];
    if (e.type === 'war') return /peace|white peace|truce/i.test(tx) ? ['peace', 4] : /declares war|war on|marches|attacks/i.test(tx) ? ['war', 5] : null;
    if (e.type === 'culture') return /golden age/i.test(tx) ? ['golden', 6] : /is born/i.test(tx) ? ['great', 3] : null;
    if (e.type === 'wonder' || /wonder/i.test(tx) && /completed|built|raised|finished/i.test(tx)) return ['wonder', 6];
    if (e.type === 'disaster' && !e.calm) return ['disaster', 4];
    if (/founded|is founded/i.test(tx) && e.type !== 'faith') return ['found', 1];
    return null;
  }
  SOUND.stingFor = stingFor;

  // ---------------------------------------------------------------------------------------------------------------------------------
  // For the tools: render `secs` of the world as a scene would sound (and stings or clicks at given times) into an AudioBuffer, off
  // the page. o: { scene: {...}, secs, stings: [[t, kind], ...], ui: [[t, kind], ...], era, cul, seed }
  SOUND.render = async function (o) {
    const OAC = window.OfflineAudioContext; const sr = o.rate || 44100, secs = o.secs || 20;
    const ctx = new OAC(2, Math.floor(sr * secs), sr), E = Engine(ctx, o.seed || 7), X = Scape(E), V = Voice(E);
    await X.load(); if (o.solo) X.solo = new Set(o.solo);
    E.master.gain.value = 0.9; V.era = o.era || 0; V.cul = o.cul || 0;
    const base = { mode: 'play', agl: 300, hgt: 100, day: 1, dawn: 0, spring: 0.5, summerish: 0.8, warmth: 0.6, heat: 0.5, cold: 0.2, snow: 0, leafy: 1, woods: 0.5, grass: 0.3, farm: 0.2, water: 0, shore: 1e9, open: 0, fresh: 0, wet: 0, zone: 'temperate', america: false, windy: 0.5, speed: 0, town: null, battle: 0, battleEra: 0, herds: [], era: 0, key: 'render' };
    const sc = Object.assign(base, o.scene || {});
    const step = 0.1; const marks = [];
    for (let t = 0.1; t < secs - 0.2; t += step) marks.push(t);
    const errs = [];
    for (const t of marks) ctx.suspend(t).then(() => { try { X.update(sc, step); for (const [ts, k] of o.stings || []) if (ts >= t - step && ts < t) V.sting(k); for (const [ts, k] of o.ui || []) if (ts >= t - step && ts < t) V.ui(k); for (const [ts, k] of o.calls || []) if (ts >= t - step && ts < t) (BIRD[k] || BEAST[k])(E, E.place(0.5, 0, 40), ts + 0.05, rng(k.length * 31 + 7)); } catch (e) { if (errs.length < 3) errs.push(String(e && e.stack || e)); } ctx.resume(); });
    const buf = await ctx.startRendering();
    if (errs.length) throw new Error(errs.join('\n'));
    return { buf, stats: E.stats, levels: X.lv };
  };
  window.SOUND = SOUND;
})();
