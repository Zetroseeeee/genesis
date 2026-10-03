// Headless smoke test of the GENESIS sim: extracts the sim block from genesis.html and runs 12,000 years.
const fs = require('fs');
const { PNG } = require('pngjs');
const html = fs.readFileSync('genesis.html', 'utf8');
const s0 = html.indexOf('// @@SIM_START'), s1 = html.indexOf('// @@SIM_END');
const simSrc = html.slice(s0, s1);
// full-script syntax check
const scr = html.slice(html.indexOf('<script>\n// @@SIM_START') + 9, html.lastIndexOf('</script>'));
new Function(scr); // throws on syntax error
console.log('syntax ok, script chars', scr.length);
const createSim = new Function('btoa', 'atob', simSrc + '\nreturn createSim;')((s) => Buffer.from(s, 'binary').toString('base64'), (s) => Buffer.from(s, 'base64').toString('binary'));

const W = 720, H = 360, N = W * H;
const png = PNG.sync.read(fs.readFileSync('out_world.png'));
const world = { land: new Uint8Array(N), fert: new Float32Array(N), elev: new Uint8Array(N), flags: new Uint8Array(N) };
for (let i = 0; i < N; i++) { world.elev[i] = png.data[i * 4]; world.fert[i] = png.data[i * 4 + 1] / 255; world.flags[i] = png.data[i * 4 + 2]; world.land[i] = png.data[i * 4 + 2] & 1; }
const sim = createSim(world, 12345);
const cellOf = (lon, lat) => Math.floor((90 - lat) / 180 * H) * W + Math.floor((lon + 180) / 360 * W);
// player on the Nile near Luxor
const home = cellOf(32.6, 25.7);
console.log('home land?', world.land[home], 'fert', world.fert[home].toFixed(2), 'flags', world.flags[home]);
const pc = sim.setPlayer(home, 'Kemet');
// seed 24 tribes like the page does
{ const LI = sim.LI; let placed = 0, tries = 0; const homes = [home];
  while (placed < 24 && tries < 20000) { tries++; const i = LI[Math.floor(sim.rnd() * LI.length)]; const f = sim.fert[i]; if (f < 0.45 || sim.owner[i] >= 0) continue; if (sim.rnd() > f * f * ((sim.flags[i] & 2) ? 1.6 : 1)) continue;
    let ok = true; for (const h of homes) { const dy = Math.abs(((i / W) | 0) - ((h / W) | 0)); let dx = Math.abs((i % W) - (h % W)); if (dx > W / 2) dx = W - dx; if (dx * dx + dy * dy < 22 * 22) { ok = false; break; } } if (!ok) continue;
    if (sim.spawnTribe(i, { tech: 0.018 + sim.rnd() * 0.017 })) { homes.push(i); placed++; } } console.log('seeded', placed); }
let t0 = Date.now(); let ticks = 0;
const report = () => {
  const civs = sim.civs.filter(c => c);
  let total = 0, wild = 0; for (const c of civs) total += sim.popOf[c.id]; for (const i of sim.LI) if (sim.owner[i] < 0) wild += sim.pop[i];
  const eras = {}; for (const c of civs) eras[sim.ERAS[c.era][0]] = (eras[sim.ERAS[c.era][0]] || 0) + 1;
  let wars = 0; for (const c of civs) wars += Object.keys(c.wars).length; wars /= 2;
  let owned = 0; for (const i of sim.LI) if (sim.owner[i] >= 0) owned++;
  const big = civs.slice().sort((a, b) => sim.cellsOf[b.id] - sim.cellsOf[a.id]).slice(0, 5).map(c => `${sim.fullName(c)}[${sim.cellsOf[c.id]}c ${Math.round(sim.popOf[c.id])}k t${(c.tech * 100).toFixed(0)}]`).join(' | ');
  console.log(`${sim.fmtYear(sim.year).padStart(9)} civs ${civs.length} owned ${owned} pop ${Math.round(total + wild)}k (states ${Math.round(total)}k) wars ${wars} eras ${JSON.stringify(eras)} ms/tick ${((Date.now() - t0) / Math.max(1, ticks)).toFixed(2)}`);
  console.log('   ', big);
  console.log('    player:', sim.fullName(pc), sim.cellsOf[pc.id], 'cells', Math.round(sim.popOf[pc.id]) + 'k', 'tech', (pc.tech * 100).toFixed(1), 'wealth', Math.round(pc.wealth), 'stab', pc.stability.toFixed(2), 'wars', Object.keys(pc.wars).length);
};
for (let y = 0; y < 12000; y++) { sim.tick(); ticks++; if (y % 1500 === 0 || y === 11999) { report(); t0 = Date.now(); ticks = 0; } }
console.log('world events sample:'); for (const e of sim.worldEvents.slice(-12)) console.log('  ', sim.fmtYear(e.year), e.text);
console.log('player events:'); for (const e of pc.events.slice(-10)) console.log('  ', sim.fmtYear(e.year), e.text);
// save/load roundtrip
const saved = JSON.stringify(sim.save()); console.log('save bytes', saved.length);
const sim2 = createSim(world, 1); sim2.load(JSON.parse(saved)); console.log('reloaded year', sim2.year, 'civs', sim2.st.civCount); sim2.tick(); console.log('tick after load ok');
