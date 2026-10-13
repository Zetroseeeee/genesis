// Renders the sound of the world (src/sound.js) as scenes would sound, without the game: each scene into shots/sound/<name>.wav, with
// its loudness, and (tools/sound/sheet.py) a picture of it - how loud through time, and a spectrogram.
//   node tools/sound/render.js [scene names | all] [--secs N]
// Nothing is listened to here: hold the numbers to what a scene should be (its loudness against the others, nothing clipping) and
// look at the pictures (a bird's song is a run of bent lines, a wave a swell and a long hiss, crickets a row of dots at 4.5 kHz).
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const T = { mode: 'play' };
const SCENES = {
  coast_day: { secs: 30, scene: { agl: 220, zone: 'temperate', day: 1, summerish: 0.9, woods: 0.1, grass: 0.5, water: 0.45, shore: 60, open: 0.9, fresh: 0 } },
  lake_dusk: { secs: 30, scene: { agl: 260, zone: 'boreal', day: 0.25, summerish: 0.8, woods: 0.7, grass: 0.2, water: 0.4, shore: 80, open: 0.3, fresh: 1, wet: 0.8, warmth: 0.5 } },
  wood_dawn: { secs: 40, scene: { agl: 180, zone: 'temperate', day: 0.7, dawn: 1, spring: 1, summerish: 0.7, woods: 0.85, grass: 0.1 } },
  meadow_noon: { secs: 30, scene: { agl: 220, zone: 'temperate', day: 1, summerish: 1, spring: 0.2, woods: 0.1, grass: 0.7, farm: 0.5, heat: 0.6 } },
  summer_night: { secs: 30, scene: { agl: 200, zone: 'temperate', day: 0, summerish: 1, warmth: 0.75, woods: 0.4, grass: 0.5 } },
  savanna_night: { secs: 40, scene: { agl: 300, zone: 'savanna', day: 0, summerish: 1, warmth: 0.9, heat: 0.9, woods: 0.3, grass: 0.6 } },
  rain_day: { secs: 30, scene: { agl: 200, zone: 'rain', day: 1, summerish: 1, warmth: 1, heat: 0.95, woods: 0.95, grass: 0.05, wet: 0.8 } },
  med_summer: { secs: 30, scene: { agl: 200, zone: 'med', day: 1, summerish: 1, warmth: 0.8, heat: 0.9, woods: 0.5, grass: 0.4 } },
  winter_wood: { secs: 25, scene: { agl: 250, zone: 'temperate', day: 1, summerish: 0, spring: 0, warmth: 0.1, cold: 0.9, snow: 0.8, leafy: 0.2, woods: 0.7, grass: 0.2, windy: 0.8 } },
  town_stone: { secs: 30, scene: { agl: 700, zone: 'temperate', day: 0.9, summerish: 0.7, woods: 0.4, grass: 0.4, town: { k: 0.8, era: 0, style: 0, cul: 0, size: 0.5 }, era: 0 } },
  town_iron: { secs: 30, scene: { agl: 700, zone: 'med', day: 0.9, summerish: 0.7, woods: 0.2, grass: 0.4, town: { k: 0.85, era: 2, style: 2, cul: 0, size: 0.8 }, era: 2 } },
  town_medieval: { secs: 30, scene: { agl: 700, zone: 'temperate', day: 0.9, summerish: 0.6, woods: 0.2, grass: 0.4, town: { k: 0.85, era: 4, style: 4, cul: 1, size: 1 }, era: 4 } },
  town_night: { secs: 25, scene: { agl: 600, zone: 'temperate', day: 0, summerish: 0.8, warmth: 0.6, woods: 0.2, grass: 0.4, town: { k: 0.8, era: 3, style: 3, cul: 0, size: 0.8 }, era: 3 } },
  town_industrial: { secs: 30, scene: { agl: 800, zone: 'temperate', day: 0.9, summerish: 0.6, woods: 0.1, grass: 0.3, town: { k: 0.9, era: 6, style: 6, cul: 1, size: 1.2 }, era: 6 } },
  town_modern: { secs: 30, scene: { agl: 900, zone: 'temperate', day: 0.9, summerish: 0.6, woods: 0.05, grass: 0.2, town: { k: 0.9, era: 7, style: 7, cul: 9, size: 1.4 }, era: 7 } },
  battle_iron: { secs: 25, scene: { agl: 2500, zone: 'med', day: 1, battle: 0.8, battleEra: 2, grass: 0.5 } },
  battle_modern: { secs: 25, scene: { agl: 3000, zone: 'temperate', day: 1, battle: 0.8, battleEra: 7, grass: 0.5 } },
  heights: { secs: 25, scene: { agl: 14000, zone: 'temperate', day: 1, woods: 0.3, grass: 0.4 } },
  orbit: { secs: 10, scene: { agl: 2000000, zone: 'temperate', day: 1 } },
  herds: { secs: 30, scene: { agl: 400, zone: 'temperate', day: 1, summerish: 0.8, grass: 0.7, herds: [{ kind: 'cattle', k: 1 }, { kind: 'sheep', k: 1 }], town: { k: 0.15, era: 2, style: 2, cul: 0, size: 0.3 }, era: 2 } },
  birds: { secs: 0, scene: { mode: 'menu' }, calls: [] },
  beasts: { secs: 0, scene: { mode: 'menu' }, calls: [] },
  // (a scene may also carry thunder: [[t, metres, bolt], ...])
  rain_wood: { secs: 25, scene: { agl: 220, zone: 'temperate', day: 0.8, summerish: 0.8, woods: 0.8, grass: 0.2, rain: 0.9 } },
  rain_town: { secs: 25, scene: { agl: 700, zone: 'temperate', day: 0.8, summerish: 0.6, woods: 0.2, grass: 0.4, rain: 1, town: { k: 0.85, era: 4, style: 4, cul: 1, size: 1 }, era: 4 } },
  storm: { secs: 36, scene: { agl: 300, zone: 'rain', day: 0.6, summerish: 1, warmth: 1, heat: 0.95, woods: 0.9, rain: 1 }, thunder: [[1, 900, true], [10, 4000, false], [22, 9000, false]] },
  stings_stone: { secs: 34, era: 0, cul: 4, scene: { mode: 'menu' }, ui: [[0.5, 'click'], [1, 'tab'], [1.5, 'open'], [2.2, 'close'], [2.8, 'deny'], [3.3, 'ok']], stings: [[4, 'turn'], [5.5, 'stop'], [7, 'know'], [9.5, 'age'], [15, 'war'], [18.5, 'peace'], [21, 'great'], [23, 'wonder'], [27, 'disaster'], [30.5, 'found'], [32, 'story']] },
  stings_medieval: { secs: 34, era: 4, cul: 0, scene: { mode: 'menu' }, ui: [[0.5, 'click'], [1, 'tab'], [1.5, 'open'], [2.2, 'close'], [2.8, 'deny'], [3.3, 'ok']], stings: [[4, 'turn'], [5.5, 'stop'], [7, 'know'], [9.5, 'age'], [15, 'war'], [18.5, 'peace'], [21, 'great'], [23, 'wonder'], [27, 'golden'], [30.5, 'found'], [32, 'story']] },
  stings_modern: { secs: 34, era: 7, cul: 9, scene: { mode: 'menu' }, ui: [[0.5, 'click'], [1, 'tab'], [1.5, 'open'], [2.2, 'close'], [2.8, 'deny'], [3.3, 'ok']], stings: [[4, 'turn'], [5.5, 'stop'], [7, 'know'], [9.5, 'age'], [15, 'war'], [18.5, 'peace'], [21, 'great'], [23, 'wonder'], [27, 'fall'], [31, 'story']] },
  stings_space: { secs: 34, era: 9, cul: 6, scene: { mode: 'menu' }, ui: [[0.5, 'click'], [1, 'tab'], [1.5, 'open'], [2.2, 'close'], [2.8, 'deny'], [3.3, 'ok']], stings: [[4, 'turn'], [5.5, 'stop'], [7, 'know'], [9.5, 'age'], [15, 'war'], [18.5, 'peace'], [21, 'great'], [23, 'wonder'], [27, 'end']] },
};
// (the galleries: every bird's song and every beast's call in turn, a few seconds apart)
{ const g = (name, kinds, gap) => { let t = 0.5; for (const k of kinds) { SCENES[name].calls.push([t, k]); t += gap; } SCENES[name].secs = t + 2; };
  g('birds', ['tit', 'chiff', 'cuckoo', 'pigeon', 'blackbird', 'thrush', 'robin', 'lark', 'warbler', 'crow', 'raven', 'woodpecker', 'gull', 'swift', 'hoopoe', 'nightingale', 'owl', 'scops', 'loon', 'nightjar', 'whip', 'wooddove', 'dove', 'mdove', 'hornbill', 'coucal', 'barbet', 'parrot', 'bulbul', 'uguisu', 'sparrow', 'cardinal', 'arobin'], 6);
  g('beasts', ['wolf', 'hyena', 'lion', 'elephant', 'cow', 'sheep', 'goat', 'dog', 'rooster'], 6); }
const args = process.argv.slice(2); const si = args.indexOf('--secs'); const secsArg = si >= 0 ? +args[si + 1] : 0; if (si >= 0) args.splice(si, 2);
const so = args.indexOf('--solo'); const solo = so >= 0 ? args[so + 1].split(',') : null; if (so >= 0) args.splice(so, 2);      // (only these layers: wind, leaves, rush, high, sea, surf, crickets, frogs, cicadas, murmur, fire, din, birds, night, beasts, work, clash)
const names = !args.length || args[0] === 'all' ? Object.keys(SCENES) : args;
(async () => {
  const out = path.resolve('shots/sound'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await page.goto('about:blank'); await page.addScriptTag({ content: 'window.GEO = { R_M: 6371000 };' + fs.readFileSync('src/sound.js', 'utf8') });
  for (const name of names) {
    const S = SCENES[name]; if (!S) { console.log('no scene ' + name); continue; }
    const o = Object.assign({}, S, { secs: secsArg || S.secs, scene: Object.assign({}, T, S.scene), solo }); const file = solo ? name + '_' + solo.join('+') : name;
    const t0 = Date.now();
    let r; try { r = await page.evaluate(async (o) => {
      const { buf, stats, levels } = await SOUND.render(o);
      const L = buf.getChannelData(0), Rr = buf.getChannelData(1), n = L.length, pcm = new Int16Array(n * 2);
      let pk = 0, ss = 0; const win = Math.floor(buf.sampleRate * 0.4); let wmax = 0, ws = 0;
      for (let i = 0; i < n; i++) { const a = L[i], b = Rr[i]; pk = Math.max(pk, Math.abs(a), Math.abs(b)); ss += a * a + b * b; ws += a * a + b * b; if (i % win === win - 1) { wmax = Math.max(wmax, ws / (2 * win)); ws = 0; } pcm[2 * i] = Math.max(-32767, Math.min(32767, Math.round(a * 32767))); pcm[2 * i + 1] = Math.max(-32767, Math.min(32767, Math.round(b * 32767))); }
      let bin = ''; const u8 = new Uint8Array(pcm.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      const db = (x) => (x > 0 ? 10 * Math.log10(x) : -200);
      return { b64: btoa(bin), sr: buf.sampleRate, peak: 20 * Math.log10(Math.max(pk, 1e-9)), rms: db(ss / (2 * n)), loud: db(wmax), stats, levels };
    }, o); } catch (e) { console.log(`${name.padEnd(16)} FAILED: ${String(e.message || e).slice(0, 600)}`); continue; }
    const pcm = Buffer.from(r.b64, 'base64'); const hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(r.sr, 24); hdr.writeUInt32LE(r.sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(path.join(out, file + '.wav'), Buffer.concat([hdr, pcm]));
    const lv = Object.entries(r.levels || {}).filter(([, v]) => v > 0.005).map(([k, v]) => k + ' ' + v.toFixed(2)).join(', ');
    console.log(`${file.padEnd(16)} peak ${r.peak.toFixed(1).padStart(6)} dBFS  mean ${r.rms.toFixed(1).padStart(6)}  loudest 0.4 s ${r.loud.toFixed(1).padStart(6)}  voices ${r.stats.voices} calls ${r.stats.calls}  (${((Date.now() - t0) / 1000).toFixed(1)} s)  ${lv}`);
  }
  if (errs.length) console.log('page: ' + errs.slice(0, 8).join('\n'));
  await browser.close();
})();
