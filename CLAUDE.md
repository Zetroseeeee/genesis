# GENESIS — project notes for Claude

God-game on the real Earth from 10,000 BC: autopilot civilisations plus one player-run empire. Owner: Emile.
Quality bar: Civ 6/7 × The Sims. Target: a **downloadable desktop game for high-end Apple Silicon Macs** (no need to
hold back for phones or weak GPUs); a lighter web build may be published as a preview.

## Commands (run from the repo root)

- `npm run build` — `tools/build.js` copies `src/` to `dist/`, links `dist/data → data/`, writes `dist/local.html`.
- `ONLY=2,7 node tools/test_sim.js` — headless simulation checks (sections selectable with `ONLY`).
- `node tools/test_e2e.js ["filter|filter"]` — Playwright end-to-end suite on software GL (~45–60 min for all 28).
  Never run two browser harnesses at once: software GL starves and scenarios time out.
- `node tools/shot2.js <name> "<script>" <t1> <t2> ["<script2>"]` — two screenshots into `shots/`.
- `node tools/dbg3.js "<script>" "<probe>" <wait>` — run a script in the page and print a probe object.
- `npm start` — desktop window (Electron).

Details and the debug hooks (`window.__G`, `window.__T`) are in `docs/TESTING.md`.

## Architecture (all classic scripts, each exposes one global)

| File | Global | Role |
| --- | --- | --- |
| `src/sim.js` | `SIM` | World simulation on a 720×360 grid: civilisations, growth, war, tech/eras, works, disasters |
| `src/terrain.js` | `TERRAIN` | Quadtree globe tiles, elevation, biome shader, fields/roads/urban ground |
| `src/town.js` | `TOWN` | Pure-data settlement plans in true metres: which building stands where, for a culture, era, size |
| `src/buildings.js` | `BKIT` | Procedural building kit (unit archetypes) and its material shader |
| `src/models.js` | `MODELS` | Real 3D model library: manifest, loading, LODs, instancing (replaces kit archetypes when a model exists) |
| `src/world.js` | `WORLD` | Turns town plans into instances near the camera; sky, clouds, atmosphere |
| `src/textures.js` | `TEX` | Generated material atlases as texture arrays; UI art |
| `src/decal.js`, `trees.js`, `life.js`, `movers.js`, `events.js` | | Roads/rivers decals, vegetation, people, vehicles, disasters and battles |
| `src/main.js` | `__G` | Boot, camera, HUD, turn loop, build panel, saves |

Conventions that matter:
- **Units.** The globe has radius 1 (Earth radius = 6,371,000 m = `R_M`). Town plans are in metres from the town centre.
- **Representational scale.** Towns are planned at true scale and drawn `scaleOf(Rt) = 20/(1+Rt/1200)` times larger
  (a village ~19×, a metropolis ~3×) so they read from region height. Shader patterns divide by that factor.
- **Eras** 0–8: Stone, Bronze, Iron, Classical, Medieval, Renaissance, Industrial, Modern, Information.
  **Cultures** 0–9: med, north, east, mena, africa, sasia, easia, seasia, america, namerica.
- **Style packing.** `wall + roof*8 + culture*64 + flags*1024`; flags: landmark 1, block 2, neon 4, wonder 8, ruin 16, site 32.
- Keep modules independent (pure data in `town.js` and `sim.js`, rendering elsewhere): the game will grow to tens of GB of assets.

## Assets

- Generated with Higgsfield on Emile's account. Textures: `assets/textures/` (prompts, job ids, atlas builder).
  3D models: `assets/models/` (concept prompts, job ids, source GLB URLs, processing settings).
- Generated files live on Higgsfield's CDN; the cloud workspace cannot reach that host directly, so GitHub Actions
  (`.github/workflows/`) fetches and processes them and publishes asset packs as release assets.
- Never commit multi-hundred-MB binaries to git; asset packs go to Releases.

## Working with Emile

Blunt, decisive, one recommendation. He wants to see things in the game, not read about them.
