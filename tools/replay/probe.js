// The atlas of history in numbers (replay.js): how many frames a world keeps through the ages, how many realms' lives, how many
// bytes they take in a save, and what a year of it costs.
//   node tools/replay/probe.js [seed] [last year]
// What to hold it to: 240 frames from 10,000 BC to AD 2150 (24 an age); the whole of it a few hundred kilobytes in a save (a save
// lives in the page's storage beside the rest of the world: tools/test_sim.js holds the whole save under 4.5 MB); a frame a
// millisecond or two, which in a whole history is nothing.
global.window = {}; global.atob = (s) => Buffer.from(s, 'base64').toString('binary'); global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..'); const PNG = require(path.join(root, 'node_modules/pngjs')).PNG;
const src = process.env.SRC ? path.resolve(process.env.SRC) : path.join(root, 'src');
for (const f of ['econ', 'know', 'rule', 'diplo', 'army', 'people', 'faith', 'culture', 'finance', 'dynasty', 'story', 'legacy', 'intrigue', 'disease', 'land', 'climate', 'migrate', 'woods', 'replay', 'sim']) { const p = path.join(src, f + '.js'); if (fs.existsSync(p)) (0, eval)(fs.readFileSync(p, 'utf8')); }
const args = process.argv.slice(2).map(Number); const seed = args[0] || 12345, last = args[1] === undefined ? 2150 : args[1];
const W = 720, H = 360, N = W * H; const png = PNG.sync.read(fs.readFileSync(path.join(root, 'data/world.png')));
const wd = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { wd.elev[i] = png.data[i * 4]; wd.fert[i] = png.data[i * 4 + 1] / 255; wd.flags[i] = png.data[i * 4 + 2]; wd.land[i] = png.data[i * 4 + 2] & 1; }
{ const sp = PNG.sync.read(fs.readFileSync(path.join(root, 'data/soil.png'))); wd.soil = new Uint8Array(N * 3); for (let i = 0; i < N; i++) { wd.soil[i * 3] = sp.data[i * 4]; wd.soil[i * 3 + 1] = sp.data[i * 4 + 1]; wd.soil[i * 3 + 2] = sp.data[i * 4 + 2]; } }
const sim = window.createSim(wd, seed);
{ let placed = 0, tries = 0; const homes = []; while (placed < 25 && tries < 20000) { tries++; const i = sim.LI[Math.floor(sim.rnd() * sim.LI.length)]; const f = sim.homeOf(i); if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue; let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue; if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } sim.recount(); }
const RP = sim.replay; if (!RP) { console.log('no replay.js'); process.exit(1); }
const AGES = ['Stone Age', 'Bronze Age', 'Iron Age', 'Classical Age', 'Middle Ages', 'Renaissance', 'Industrial Age', 'Modern Age', 'Information Age', 'Space Age'];
let age = 0, f0 = 0, b0 = 0, ms = 0; const t0 = Date.now();
const step = RP.step; RP.step = () => { const t = process.hrtime.bigint(); step(); ms += Number(process.hrtime.bigint() - t) / 1e6; };
const report = (label) => {
  const s = RP.stats(); const fr = RP.frames.slice(f0); const big = fr.reduce((m, f) => Math.max(m, f.d.length), 0);
  console.log(`${label.padEnd(16)} ${String(s.frames - f0).padStart(3)} frames, ${((s.bytes - b0) / 1024).toFixed(1).padStart(6)} KB (the largest ${(big / 1024).toFixed(1)} KB); ${s.lives} lives so far; ${(ms).toFixed(0)} ms in all; ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  f0 = s.frames; b0 = s.bytes;
};
while (sim.year < last) {
  sim.tick();
  const a = window.REPLAY.ageOf(sim.year); if (a !== age) { report(AGES[age]); age = a; }
}
report(AGES[age]);
const s = sim.save(); const js = JSON.stringify(s), jr = JSON.stringify(s.replay || {});
console.log(`\nthe save: ${(js.length / 1024).toFixed(0)} KB, of it the atlas ${(jr.length / 1024).toFixed(0)} KB (frames ${(s.replay.d.length / 1024).toFixed(0)} KB as text, lives ${(JSON.stringify(s.replay.l).length / 1024).toFixed(0)} KB)`);
// the round trip: a world loaded keeps its history, frame for frame
const sim2 = window.createSim(wd, seed); sim2.load(JSON.parse(js)); const R2 = sim2.replay; let same = R2.frames.length === RP.frames.length;
const g1 = RP.at(RP.frames.length - 1), g2 = R2.at(R2.frames.length - 1); for (let i = 0; i < g1.length && same; i++) if (g1[i] !== g2[i]) same = false;
console.log(`loaded again: ${R2.frames.length} frames, ${R2.lives.length} lives, the last frame ${same ? 'the same' : 'DIFFERENT'}`);
// the last frame against the world as it is: how many places of the grid have the holder the world has there
{ let ok = 0, n = 0; for (let y = 0; y < 180; y++) for (let x = 0; x < 360; x++) { const o = sim.owner[(y * 2) * W + x * 2]; if (o < 0) continue; n++; if (g1[y * 360 + x] === o) ok++; } console.log(`the last frame agrees with the world on ${(100 * ok / Math.max(1, n)).toFixed(1)}% of held places`); }
