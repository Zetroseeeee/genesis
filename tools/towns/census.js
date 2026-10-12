// What a town of each people, age and size is made of, from the planner alone (town.js; no page, seconds): its radius as planned and
// as drawn, how many buildings of each kind stand in it, its parks, the tallest thing in it (drawn metres) and how long it took to plan.
//   node tools/towns/census.js [eras, e.g. 6,7,8] [peoples, e.g. med,north,easia,namerica] [sizes in thousands, e.g. 60,800,4000]
// After touching how cities are laid out (the rings of a city of the machine age and after, the kit's clusters), look at it here, then
// at the city_* pictures on the Mac. A plan of a city of millions takes some tens of milliseconds; keep it under a tenth of a second.
global.window = global; const fs = require('fs'); const path = require('path'); const root = path.join(__dirname, '..', '..');
(0, eval)(fs.readFileSync(path.join(root, 'src/town.js'), 'utf8'));
const args = process.argv.slice(2), list = (k, d) => (args[k] || d).split(',');
const eras = list(0, '6,7,8').map(Number), peoples = list(1, 'med,north,east,mena,africa,sasia,easia,seasia,america,namerica'), sizes = list(2, '60,800,4000').map(Number);
const PLACE = { med: [12.5, 41.9], north: [-0.12, 51.5], east: [37.62, 55.75], mena: [31.24, 30.04], africa: [3.38, 6.52], sasia: [77.2, 28.6], easia: [121.47, 31.23], seasia: [106.8, -6.2], america: [-99.13, 19.43], namerica: [-87.63, 41.88] };
const W = 720, H = 360, N = W * H;
for (const p of peoples) {
  const [lon, lat] = PLACE[p]; const i = Math.floor((90 - lat) / 180 * H) * W + Math.floor((lon + 180) / 360 * W);
  for (const era of eras) for (const popK of sizes) {
    const lvl = popK >= 500 ? 4 : popK >= 50 ? 3 : popK >= 5 ? 2 : 1;
    const S = { pop: new Float32Array(N), level: new Uint8Array(N), walls: new Uint8Array(N), special: new Uint16Array(N), infra: new Uint8Array(N), land: new Uint8Array(N).fill(1), year: 1950, works: new Map(), rubble: new Map(), civs: [] };
    S.pop[i] = popK; S.level[i] = lvl; S.special[i] = 14;
    const c = { id: 0, era, capital: i, home: i, eraSince: -2000 };
    const t0 = process.hrtime.bigint(); const L = TOWN.layout(S, i, c, { coarse: false }); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const n = {}; let hmax = 0; for (const it of L.items) { n[it.kind] = (n[it.kind] || 0) + 1; if (it.h > hmax) hmax = it.h; }
    const top = Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, v]) => k + ' ' + v).join(', ');
    console.log(`${p.padEnd(8)} era ${era} ${String(popK).padStart(5)}k: ${String(Math.round(L.Rt)).padStart(5)} m, drawn x${L.k.toFixed(1).padStart(4)} | ${String(L.items.length).padStart(5)} built, ${String(L.parks ? L.parks.length : 0).padStart(3)} parks, tallest ${String(Math.round(hmax)).padStart(4)} m drawn | ${top} | ${ms.toFixed(0)} ms`);
  }
}
