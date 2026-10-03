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
- `node tools/shotn.js <name> "<setup>" <wait ms> <label=script> ...` — several screenshots in one session
  (`TEX=data/tex/atlas.offline.json` for the real materials). Scenes to start from: `tools/scenes/town.js`
  (options in `window.__scene`: place, age, size, walls, works, camera). Software GL is slow: models take a
  minute or two to arrive, so wait ~150 s before the first shot, and run it in the background (`nohup ... &`).
- `tools/peek.sh <name> <url> ...` — contact sheet of generated images via the Peek workflow (`shots/peek/<name>.jpg`).
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
| `src/shadows.js` | `SHADOWS` | Sun depth map of everything standing near the camera; terrain and models read it (true shadows) |
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
- **Apple GPUs allow a fragment shader 16 textures.** The terrain shader is at 15 with everything on. Adding a
  sampler there means freeing one (pack into an array layer). The Mac launch check reports `samplers` and fails on
  any shader error; software GL (the local harness) allows 32 and will not warn you.
- **Models are chosen by role**: `MODELS.pick(it.as || it.kind, era, culture)`. A plan item can carry `as`
  (`market`, `palace`, `mine`, `watchtower`) where the kit kind is shared by different buildings.
  Placement: houses at life size × the town's scale; landmarks likewise with more give; `fit: 'run'` walls end to
  end following the ground; `fit: 'gate'` a gate with wall on both sides; `site` = the building-site model shown
  while a building goes up, laid out on the finished building's footprint.
- Trees are models too (`tree_broad`, `tree_conifer`, `tree_savanna`, `tree_palm`), meshes near the camera and
  picture cards of the same model beyond; near a town they are drawn at the town's scale.

## Assets

- Generated with Higgsfield on Emile's account. Textures: `assets/textures/` (prompts, job ids, atlas builder).
  3D models: `assets/models/` (concept prompts, job ids, source GLB URLs, processing settings).
- One building ≈ 16 credits (1 concept image + 15 for the mesh). Consistency: every concept uses the same prompt
  frame (`style` in the manifest) and a reference image — the set's anchor, or, for an upgrade or a matching piece
  (a wall's gate, the next age's house), the concept of the building it follows. Look at every concept
  (`tools/peek.sh`) before paying for its mesh. True sizes in metres go in the manifest (`h`, or `w` with
  `scaleBy: 'w'`, or `plan: [w, d]` where the mesh got its proportions wrong).
- Generated files live on Higgsfield's CDN; the cloud workspace cannot reach that host directly, so GitHub Actions
  (`.github/workflows/`) fetches and processes them and publishes asset packs as release assets.
- Never commit multi-hundred-MB binaries to git; asset packs go to Releases.

## Working with Emile

Blunt, decisive, one recommendation. He wants to see things in the game, not read about them.
