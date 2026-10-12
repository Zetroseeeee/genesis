// Pieces of the music of the ages (src/music.js) rendered without the game: each into shots/sound/music/<name>.wav with its events
// (<name>.json), for tools/sound/roll.py (a piano roll of the parts) and tools/sound/sheet.py (loudness, spectrogram).
//   node tools/sound/music.js name:era:culture:mood:seed[:seconds[:parts]] ...
//   mood: calm, war, golden, dark, theme; parts: lead,fig,hold,bass,beat,colour (only those)
// e.g. node tools/sound/music.js stone:0:0:calm:11 renaissance:5:0:calm:15 sasia:2:5:calm:20 theme:4:0:theme:4011
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const list = process.argv.slice(2); const out = path.resolve('shots/sound/music');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(); const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('about:blank'); await page.addScriptTag({ content: 'window.GEO = { R_M: 6371000 };' + fs.readFileSync('src/sound.js', 'utf8') + '\n' + fs.readFileSync('src/music.js', 'utf8') });
  for (const spec of list) {
    const [name, era, cul, mood, seed, secs, roles] = spec.split(':'); const t0 = Date.now();
    let r; try { r = await page.evaluate(async (o) => {
      const { buf, piece } = await MUSIC.render(o);
      const L = buf.getChannelData(0), Rr = buf.getChannelData(1), n = L.length, pcm = new Int16Array(n * 2);
      for (let i = 0; i < n; i++) { pcm[2 * i] = Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))); pcm[2 * i + 1] = Math.max(-32767, Math.min(32767, Math.round(Rr[i] * 32767))); }
      let bin = ''; const u8 = new Uint8Array(pcm.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return { b64: btoa(bin), sr: buf.sampleRate, ev: piece.events, info: { bpm: piece.bpm, meter: piece.meter, key: piece.key, scale: piece.scale, ens: piece.ens, length: piece.length } };
    }, { era: +era, cul: +cul, mood, seed: +seed, secs: secs ? +secs : 0, roles: roles ? roles.split(',') : null }); } catch (e) { console.log(name, 'FAILED', String(e.message || e).slice(0, 500)); continue; }
    const pcm = Buffer.from(r.b64, 'base64'); const hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(r.sr, 24); hdr.writeUInt32LE(r.sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(path.join(out, name + '.wav'), Buffer.concat([hdr, pcm])); fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ ev: r.ev, info: r.info }));
    const E = r.info.ens; console.log(`${name.padEnd(14)} ${r.ev.length} notes, ${r.info.length.toFixed(0)} s, ${r.info.bpm.toFixed(0)} a minute in ${r.info.meter}, key ${r.info.key}: ${E.lead} / ${E.fig} / ${E.hold} / ${E.bass} / ${E.beat} / ${E.colour}${E.chords ? ', chords' : ''} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  if (errs.length) console.log('page: ' + errs.slice(0, 6).join('\n'));
  await browser.close();
})();
