// What a town of each people, age and size is made of, from the planner alone (plots.js, vern.js, town.js; no page, seconds): its radius as planned and
// as drawn, how many buildings of each kind stand in it, its parks, the tallest thing in it (drawn metres) and how long it took to plan.
//   node tools/towns/census.js [eras, e.g. 6,7,8] [peoples, e.g. med,north,easia,namerica] [sizes in thousands, e.g. 60,800,4000]
// After touching how cities are laid out (the rings of a city of the machine age and after, the kit's clusters), look at it here, then
// at the city_* pictures on the Mac. A plan of a city of millions takes some tens of milliseconds; keep it under a tenth of a second.
//   houses: the houses of the place's own (vern.js: types fitted to the plots), yard: the things in their yards (props)
global.window = global; const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..');
for (const f of ['know.js', 'vern.js', 'plots.js', 'town.js']) (0, eval)(fs.readFileSync(path.join(root, 'src', f), 'utf8'));
TOWN.budget.on = false;      // (a page plans a town at a time; here every plan at once)
const ERA_TECH = [0.04, 0.12, 0.24, 0.35, 0.48, 0.6, 0.72, 0.86, 0.95, 1.05];
const args = process.argv.slice(2), list = (k, d) => (args[k] || d).split(',');
const eras = list(0, '6,7,8').map(Number), peoples = list(1, 'med,north,east,mena,africa,sasia,easia,seasia,america,namerica'), sizes = list(2, '60,800,4000').map(Number);
const PLACE = { med: [12.5, 41.9], north: [-0.12, 51.5], east: [37.62, 55.75], mena: [31.24, 30.04], africa: [3.38, 6.52], sasia: [77.2, 28.6], easia: [121.47, 31.23], seasia: [106.8, -6.2], america: [-99.13, 19.43], namerica: [-87.63, 41.88] };
const W = 720, H = 360, N = W * H;
for (const p of peoples) {
  const [lon, lat] = PLACE[p]; const i = Math.floor((90 - lat) / 180 * H) * W + Math.floor((lon + 180) / 360 * W);
  for (const era of eras) for (const popK of sizes) {
    const lvl = popK >= 500 ? 4 : popK >= 50 ? 3 : popK >= 5 ? 2 : 1;
    const S = { W, H, pop: new Float32Array(N), level: new Uint8Array(N), walls: new Uint8Array(N), special: new Uint16Array(N), infra: new Uint8Array(N), land: new Uint8Array(N).fill(1), elev: new Uint8Array(N).fill(20), flags: new Uint8Array(N), year: 1950, works: new Map(), rubble: new Map(), civs: [] };
    S.pop[i] = popK; S.level[i] = lvl; S.special[i] = 14;
    // (founded in the Iron Age at the latest; a city of the machine age since it had half its people)
    const rec = [-1000, Math.min(era, 2), i, era >= 6 && lvl >= 3 ? Math.round(Math.log2(popK * 1000 * 0.5 + 1) * 3) : 0, 0]; S.townRec = () => rec;
    const c = { id: 0, era, tech: ERA_TECH[era], capital: i, home: i, eraSince: -2000 };
    TOWN.clearCache(); PLOTS.clear();
    const t0 = process.hrtime.bigint(); const L = TOWN.layout(S, i, c, { coarse: false }); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const n = {}; let hmax = 0, nH = 0, nY = 0; const styles = new Set(); for (const it of L.items) { if (it.kind === 'vh') { nH++; styles.add(it.g.style); } else if (it.prop) nY++; else n[it.kind] = (n[it.kind] || 0) + 1; if (it.h > hmax) hmax = it.h; }
    const top = Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ' ' + v).join(', ');
    console.log(`${p.padEnd(8)} era ${era} ${String(popK).padStart(5)}k ${L.morph.padEnd(8)}: ${String(Math.round(L.Rt)).padStart(5)} m, drawn x${L.k.toFixed(1).padStart(4)} | ${String(L.items.length).padStart(5)} built: ${String(nH).padStart(5)} houses (${styles.size} manners), ${String(nY).padStart(5)} yard, ${String(L.parks ? L.parks.length : 0).padStart(3)} parks, tallest ${String(Math.round(hmax)).padStart(4)} m drawn | ${top} | ${ms.toFixed(0)} ms`);
  }
}
