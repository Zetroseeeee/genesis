# HOLOCENE — project notes for Claude

God-game on the real Earth from 10,000 BC: autopilot civilisations plus one player-run empire. Owner: Emile.
The game is called **Holocene** (it was first called GENESIS). Only what a player sees carries the new name: the app,
its window, the wordmark, the disk image. Everything inside keeps the old one and must go on keeping it - the
repository, the `genesis://` scheme, `GENESIS_*` environment variables, `GENESIS-SMOKE`, the save keys, `window.__G`,
the bundle id `com.emilemajed.genesis` and the folder the saves live in (`~/Library/Application Support/GENESIS`,
pinned in `desktop/main.js`): a new name must never cost anyone their worlds.
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
  (options in `window.__scene`: place, age, size, walls, works, camera; then `__sceneLook('palace', 4)` etc.) and
  `tools/scenes/forest.js` (`__forest(lon, lat, alt, tilt, heading, season)`). Software GL is slow: models take
  minutes to arrive and until then plots stand empty, so wait ~170 s before the first shot, run it in the
  background (`nohup ... &`), and judge nothing from a frame taken while files are still coming in.
  `SHADOW=4096` turns the shadow map on at its real size (software GL goes without), `TREES=1` and `LOD=1` give full forests and the finest models, `GRID=1` the terrain mesh at its real fineness, `DIST=<dir>` serves a snapshot build.
  What the software renderer gets less of, so that a frame takes a second and not a minute: a quarter of the pixels
  (not for screenshots), a terrain mesh a quarter as fine each way (the vertex shader's texture lookups run on the
  CPU), few trees and none that fill the picture (`trees.coverCap`), coarser models, no shadow map. Instance buffers
  are sent with `GEO.touch(attr, n)` (the used part only): whole-buffer uploads stalled it for half a minute at a time.
- `tools/peek.sh <name> <url> ...` — contact sheet of generated images via the Peek workflow (`shots/peek/<name>.jpg`).
- `node tools/coverage.js [eras] [--all] [--wonder]` — which planned buildings are real models and which still fall
  back to the kit, for a capital of every culture with every work built. Run it after touching the manifest or the
  planner: eras 0–2 must show nothing but `stall` (the market model brings its own) and `rubble`, and so must the
  later eras of the peoples who keep the old ways (`node tools/coverage.js 3,4,5`). `node tools/density.js` reports
  how much of a town's ground its houses cover.
- `node tools/dbg3.js "<script>" "<probe>" <wait>` — run a script in the page and print a probe object.
- `tools/macshots.sh [scene names]` — the real thing: pictures of this commit taken on an Apple GPU by the Scenes
  workflow (`tools/scenes/tour.txt` lists the scenes: towns of every people and age, forests, seasons, dusk and night,
  dry countries, rivers). Look at these before believing anything about how the game looks.
- `npm start` — desktop window (Electron).
- `node tools/test_update.js` — the updater under plain Node: small games in folders, the publishing step writing a
  feed, a web server that misbehaves on demand (270 checks, a few seconds). Run it after touching `desktop/updater.js`
  or `tools/update/`.
- `node tools/update/drill.js --xvfb` — the update drill in the real app: it takes an update from a feed on this
  machine, keeps it across a restart, and undoes one that cannot start (four starts, ~2 minutes under software GL).
  `--app <Holocene.app>` runs it on a packed app (the build does). `xvfb-run -a -s "-screen 0 1920x1200x24" node
  tools/update/walk.js` takes pictures of everything a player sees of an update (`shots/up_*.png`), with made-up
  versions; `tools/update/realwalk.js` (its header says how) takes them of the update that is really out, in a
  checkout of the version before it, from a copy of the real feed (`tools/update/mirror.mjs`).
- `node tools/econ/probe.js [seed] [last year] [goods]` — the world's economy through the ages in numbers: prices
  against the usual, output against need, who is short, how much crosses borders, what the workshops make, and how
  long the market takes a year. `node tools/econ/calibrate.js [seed] --write` measures how much each raw good's land
  must yield and writes the table into `src/econ.js` (between its CAL marks): run it after changing where goods lie
  (`PLACES`), what people want (`CATS`) or how things are made (`RECIPES`), or a good will be far too scarce or too plenty.
- `node tools/know/pace.js [seed,seed] [--fit N] [--write]` — the pace of history: when the realms in front enter each
  age, how far behind the middle realm is, how many people there are. With `--fit` it moves each age's yearly gain of
  knowledge (`RATE` in `src/sim.js`, between its marks) toward the dates history kept (bronze 3300 BC, iron 1200 BC,
  500 BC, AD 500, 1400, 1760, 1900, 1970); `--write` puts the table in. Run it over two seeds after touching what
  insight depends on (the discoveries' edges to research, towns, academies, how knowledge spreads): one world's
  dates swing by a century or two on a hair, so do not chase the last fifty years.
  `node tools/know/people.js [seed,seed] [--fit N] [--write]` does the same for how many people there are: the world's
  count against history's (4 million in 10,000 BC, 220 in the year 1, 970 in 1800, 6,140 in 2000), and with `--fit`
  the table of how many a unit of land feeds at each stage of knowledge (`FOOD` in `src/sim.js`, between its marks).
  Fit the pace first, then the people, then the market's yields (`calibrate.js`): each stands on the one before.
- `node tools/brand/icon.mjs [sheet.jpg]` — the app icon (`build/icon.png`) and the mark (`src/mark.png`), rendered
  from the game's own picture of the Earth.
- `node tools/imagery/seams.mjs check` — whether the packs of the picture of the Earth (`data/i`) end in the colours
  their neighbours begin with (they must: see "A pack is a texture of its own"); `fix` makes them.
- `node tools/terrain/voids.mjs scan` — holes in the elevation packs (`data/e`): ground at zero where the simulation's
  grid has land well above the sea. It must report none. `fix` fills them (real heights from the Terrain Tiles on AWS;
  Antarctica from the half-degree grid, made to meet the ice beside it); that host is out of reach from here, so the
  Terrain workflow runs it and publishes the changed packs to the `ci-logs` release (`terrain-fix.tar.gz`) for review.

Details and the debug hooks (`window.__G`, `window.__T`) are in `docs/TESTING.md`.

## Architecture (all classic scripts, each exposes one global)

| File | Global | Role |
| --- | --- | --- |
| `src/econ.js` | `ECON` | Goods, recipes, wants; where the Earth keeps things; one world's market: prices, workshops, trade between realms |
| `src/know.js` | `KNOW` | The discoveries (174, in nine ages and six branches), what each opens and gives; one world's knowledge: who knows what, who studies what |
| `src/sim.js` | `SIM` | World simulation on a 720×360 grid: civilisations, growth, war, tech/eras, works, disasters (steps the market and each realm's learning once a year) |
| `src/terrain.js` | `TERRAIN` | Quadtree globe tiles, elevation, biome shader, fields/roads/urban ground |
| `src/town.js` | `TOWN` | Pure-data settlement plans in true metres: which building stands where, for a culture, era, size |
| `src/buildings.js` | `BKIT` | Procedural building kit (unit archetypes) and its material shader |
| `src/models.js` | `MODELS` | Real 3D model library: manifest, loading, LODs, instancing (replaces kit archetypes when a model exists) |
| `src/shadows.js` | `SHADOWS` | Sun depth map of everything standing near the camera; terrain and models read it (true shadows) |
| `src/world.js` | `WORLD` | Turns town plans into instances near the camera; sky, clouds, atmosphere |
| `src/textures.js` | `TEX` | Generated material atlases as texture arrays; UI art |
| `src/decal.js`, `trees.js`, `life.js`, `movers.js`, `events.js` | | Roads/rivers decals, vegetation, people, vehicles, disasters and battles |
| `src/market.js` | `MARKET` | The market screen (board, a good's page and book, partners, workshops, ledger), the movers, the goods' glyphs |
| `src/tree.js` | `TREE` | The knowledge screen: the tree age by age and branch by branch, a discovery's page, the queue, where the realm stands |
| `src/main.js` | `__G` | Boot, home screen, camera, HUD, turn loop, build panel, saves, what the player sees of updates |
| `desktop/main.js`, `preload.js` | | The app's shell: one window, the game served over `genesis://`, the bridge the page may call (`window.desktop`) |
| `desktop/updater.js` | | Keeps the game's files current without replacing the app (plain Node, no Electron inside) |
| `tools/update/` | | `manifest.js` (the list of a build's files), `publish.js` (the build gives an update out), `drill.js`, `walk.js`, `realwalk.js`, `mirror.mjs` |

Conventions that matter:
- **Units.** The globe has radius 1 (Earth radius = 6,371,000 m = `R_M`). Town plans are in metres from the town centre.
- **Heights.** An elevation pack is eight bits: metres = min + byte × scale (`elev.packs` in `data/index.json`, 7–27 m
  to the step; under a low sun the steps show as contour lines on ice and plains). The packs stand 2.8 % taller than
  the Earth (every lake in them does, at every level: it came with their first build), and the ground is drawn twice
  as tall again (`exag: 2.0`). Ground put into a pack must be raised the same (`TALL` in `tools/terrain/voids.mjs`),
  or it meets the old ground in a step.
- **A pack is a texture of its own** and is not smoothed across its edge: whatever is in two packs' facing texels
  shows as a line if it differs. Edges of packs are every 45° in the picture of the Earth (`data/i`), 22.5° and finer
  in the elevation. The picture's facing texels are therefore kept equal in the data (and the packs written without
  loss, so that they stay equal): `node tools/imagery/seams.mjs check` must say every edge meets; after anything that
  rewrites `data/i`, run `seams.mjs fix`. The elevation's edges are not matched (a step of a texel's worth of height).
- **Representational scale.** Towns are planned at true scale and drawn `scaleOf(Rt) = 20/(1+Rt/1200)` times larger
  (a village ~19×, a metropolis ~3×) so they read from region height. Shader patterns divide by that factor.
- **Headings.** A plan item's `yaw` runs from east toward north (counter-clockwise), and a building's front is its
  local +z: at `yaw = a - π/2` a building standing at angle `a` from the centre faces the centre. Great buildings
  are never turned to fit their plot (their front stays on the square); houses may be.
- **Eras** 0–8: Stone, Bronze, Iron, Classical, Medieval, Renaissance, Industrial, Modern, Information.
  **Cultures** 0–9: med, north, east, mena, africa, sasia, easia, seasia, america, namerica.
- **The old ways last.** A town is planned in the manner of `TOWN.styleEra(era, culture)`, not always of its own era:
  where people went on building as their forebears had (`OLD_UNTIL` in `town.js`: the north and the steppe through
  the Classical era, the mud-brick lands, India and China likewise, Africa and south-east Asia until the Renaissance,
  the Americas until the conquest) a later town keeps its Iron Age houses, walls, shrines and lanes, so it stays fully
  modelled. Greece and Rome build anew (the kit, until their sets are generated). The medieval north and east are
  `timberTown`s: half-timbered and log houses gable by gable inside a palisade, round a great hall, a well and a
  shrine of the old kind - all models. `L.era` is the style era, `L.eraReal` the civilisation's; the world picks
  models by `it.era` if set (old houses in a new age, a wonder of an earlier one), else by `L.era`. A model's `eras`
  in the manifest therefore only cover the ages that really build that way.
- **The market** (`econ.js`; `sim.market`). 63 goods: 42 the land yields (a cell has one, `sim.goods[i]`, and the age
  in which that place begins to yield it, `sim.gera[i]`: cocoa is old in Mesoamerica and came to West Africa with the
  plantations) and 21 made by recipes. A quantity is in lots, a price in coin per lot: the treasury's coin. Every year,
  per realm: the land's yield (people living on the good's cells, more from a mine, more when the price is high),
  what people and the state want by category (within a category they take what is cheap just now), the workshops
  (each line of work grows while it pays, inside what the towns' hands can do), then trade over links (realms that
  touch; harbours within reach), goods going from where they are cheap to where they are dear until the gap is the
  freight plus the buyer's customs. A price is the usual price times (there / wanted)^-0.75, between 0.2 and 8.
  What comes back into the simulation, a year late: how well people live (`market.LS`) in the income, luxuries and
  hunger in stability, arms in strength, building materials in what works cost. The first twenty goods lie where they
  always lay (old worlds keep their mines); new places go in `PLACES`. The step must stay cheap (it is a quarter of a
  year's cost with 200 realms): flat typed arrays, no objects in the yearly loops. The player's own dealings (customs,
  bans, the reserve, standing orders) live on the realm as `civ.econ` and are saved with it; the market's state is
  saved packed (`save().econ`), and a world saved before the market finds its prices on loading (`market.warm`).
- **Knowledge** (`know.js`; `sim.know`). A realm's `tech` is still what its age comes from; what it gains in a year
  (`insightParts`: the age's pace `RATE`, how many it is, what it pays its scholars, the share of its towns with an
  academy, peace at home, its ruler, what it knows of learning) is also what it can spend on discoveries, in the same
  unit (shown times 100,000 as "insight"). The discoveries of an age cost together what the age is long, so a realm
  that studies without a pause has learned its age when the age ends. A discovery opens things outright (a good's
  land can be worked: `know.gmask`; a craft: `know.rmask`, which the market obeys; a work: `sim.cannot` says
  `Needs <discovery>` and `sim.needFor` gives it; farm and wall levels; colonies; a faith) and gives edges (food,
  growth, taxes, insight, arms, stability, cheaper works, health, trade, reach, ships, siege, walls, each kind of
  workshop, each kind of yield). **An edge is measured against the age**: the simulation multiplies by
  `(1 + what the realm knows) / (1 + what its age expects by now)` (`know.f`; stability is added), so a realm that
  keeps step is exactly where the old tables put it, one that learns farming first feeds more for a while, one that
  leaves it feeds fewer. That is what keeps history's pace whatever realms choose; do not add an edge that is not
  measured this way. What every people lives on (grain, fish, cattle, timber, stone, salt) waits on nothing.
  The autopilot picks by need (`weight` in `know.js`: what the age cannot do without, metal under its own hills, a
  craft whose goods it is short of, its ruler's leaning, what its neighbours know); what a neighbour or a trading
  partner knows is learned half again as fast, and `tech` itself still drifts toward more learned neighbours
  (`SPREAD`, faster in later ages). **History keeps its calendar** (`HIST`, `timeF` in `sim.js`): a realm ahead of
  what the first peoples of history knew in that year learns the slower the further ahead it is (nobody has gone that
  way before), and the first realm of a world that is behind learns the faster; everyone else learns at their own
  pace. That, not the rates, is what holds the ages to their dates in every world, and it is why a turn is as long as
  it is (`TURN_YEARS` in `main.js`: 200 years in the Stone Age down to 5: about 170 turns from the first fields to
  the present). The player's realm keeps a queue on the realm (`civ.know`); with nothing chosen
  its scholars wait a generation and then choose for themselves. A people begins knowing nothing, with 1,000 insight
  in hand: the first choice is the player's. Saves carry it packed by discovery key (`save().know`), so discoveries
  can be added; a world saved before knowledge is given what its `tech` is worth, the way the autopilot would have
  learned it. Tests and scenes that set `tech` by hand must teach as well (`teach` in `tools/test_sim.js`,
  `__T.teach` in `tools/testcam.js`).
- **Workshops** (`IND` in `sim.js`): works a town raises on a plot like a temple (`sim.ind`: cell -> plot + 1 for each
  kind). Each makes one kind of work (`ECON.SECTORS`) cheaper for the whole realm, a granary keeps food, a warehouse
  lets merchants hold more. The work on a cell's own good is the old `mine` (bit 512), now for any good, named by
  what it works (`sim.workName`). The planner draws them with the models every people has (barn, granary, well), so
  towns of the early ages stay fully modelled; they carry a role (`as: 'workshop'`...) for models of their own later.
- **Style packing.** `wall + roof*8 + culture*64 + flags*1024`; flags: landmark 1, block 2, neon 4, wonder 8, ruin 16, site 32, thing 64 (a cart or a boat: no door, windows or roof).
- Keep modules independent (pure data in `town.js` and `sim.js`, rendering elsewhere): the game will grow to tens of GB of assets.
- **Stars and air.** The stars are points on a sphere that goes with the camera, drawn at the far plane (anything hides
  them); the air seen from outside is a shell that glows where it is looked through edge-on (`world.js`). Both fade as
  the camera comes down into the sky dome's range.
- **Apple GPUs allow a fragment shader 16 textures.** The terrain shader is at 15 with everything on. Adding a
  sampler there means freeing one (pack into an array layer). The Mac launch check reports `samplers` and fails on
  any shader error; software GL (the local harness) allows 32 and will not warn you.
- **Models are chosen by role**: `MODELS.pick(it.as || it.kind, era, culture)`. A plan item can carry `as`
  (`market`, `palace`, `academy`, `shrine`, `mine`, `watchtower`, `wall_mud`, `gate_palisade` ...) where the kit kind
  is shared by different buildings. In the manifest one mesh can serve further roles, eras or cultures:
  `also: [{ kinds, eras, cultures }]`. Walls follow `wallStyleOf(era, culture)` in `town.js` (timber peoples keep
  the palisade into the Iron Age). While a model's files are still loading its plot stays bare (no kit stand-in).
  Placement: houses at life size × the town's scale; landmarks likewise with more give; `fit: 'run'` walls end to
  end following the ground; `fit: 'gate'` a gate with wall on both sides; `site` = the building-site model shown
  while a building goes up, laid out on the finished building's footprint.
- Trees are cut-out photographs on camera-facing cards (`card: true` in the manifest, most without a mesh). Each
  says where it grows (`tree: { zones, region, deciduous, bare }`); `zoneOf()` in `trees.js` gives the flora zone
  of a point (boreal, temperate, med, easia, dry, savanna, rain). Near a town they are drawn at the town's scale.
- **Climate.** `data/climate.png` is the Köppen-Geiger class of every eighth of a degree, and `data/info.png`
  carries two fields made from it: alpha = how dry the country is (the ground shader blends sand, stony plain,
  scrub, steppe and savanna by it; the photograph only says where the ground is bare), blue = how hard the winters
  are (snow lies on the ground and on roofs by it, in season). Trees take their zone and their density from the
  class (`zoneOf`, `Trees.THIN`). Rebuild both with `tools/climate/build.py` (the source and its licence are in the
  file's header). The year: `uSeason` (sun), `uBare` (leaves down N/S, the cold of the year N/S, a month behind the sun).
- **Rivers** are drawn wider than life (`drawnWidth()` in `decal.js`: brooks four times, great rivers twice), like
  roads and towns. The decal's red channel is a distance to the water (1 centre line, 0.5 the water's edge, 0 the end
  of the bank), from which the ground shader draws the water, a green bank and, where a road crosses, a deck.
  Everything that asks where the water is (`decal.nearestRiver`) gets the drawn width; walls are cut at the bank.
- **After dark** (`life.js`): open fires burn from dusk till morning in towns that have no lamps yet (style era ≤ 5):
  a great one on the square, braziers either side of each gate and before the great buildings, a few before house
  doors where there is room. Each is two instances of the smoke mesh: a flame (a card facing the eye) and the pool of
  light it throws on the ground (a quad laid to the slope, added to what is under it). Houses show firelight in
  their openings (`models.js`).
- **Shadows.** The sun's depth map holds what stands still (models, kit, near trees) and is redrawn only when the
  camera, the sun or the placements change (`castersVersion` follows a signature of everything placed). Things
  that move get their own cheap shadow (walkers: a streak on the ground in `movers.js`).

## The home screen

The game opens on the Earth itself, large, running off the right and the bottom of the window (`HOME` in `main.js`:
distance, where the planet's centre sits, the sun's place in the picture). The sun is fixed to the camera there, so
the edge of night stays put while the Earth turns under it the way it really turns, and towns light up as they pass
into the dark. A saved world is loaded for show (`previewSave`): its lands and lights are what is on the globe, and
"Continue" names the realm, the year and the age. Realm tints and labels are off. Leaving the home screen eases the
picture back to the centre and sets the sun to mid-morning where the camera goes (`sunFor`). The typefaces are
carried with the game (`vendor/fonts`, linked by `local.html`); the published web page still takes them from Google.

## Updates (how a push reaches a copy already installed)

- The app carries a list of every file it serves with its SHA-256 (`desktop/content.json`, made from the packed app
  by the build). The build publishes the newest list (`update/manifest.json`) and, each under its hash, the files
  that installed apps may lack (releases `content-0` ... `content-f`). An installed game asks for the list at start
  and every twenty minutes, shows a note when it is newer, fetches the changed files into a store beside the saves
  (`.../GENESIS/updates`), checks each against its hash, and on restart serves the game through the new list - a
  file the app already has from the app, anything else from the store. Nothing inside the app is written.
- A new game is on trial until its page has drawn three frames (`desktop.ready()`); if it does not come up in 150 s,
  or twice running, the update is undone and not offered again. The build runs this as a drill on the packed app, and
  then lets the app that is out now (the last published disk image) take the new build from the real feed, before
  anything is put in force. A build that fails any of it is not given out (the run goes red; see `ci-logs`).
- **Bump `version` in package.json with every push that changes the game**, and write the commit's subject and first
  paragraph for the player: they are the update note and "What's new" (`tools/build.js` -> `dist/version.json`).
- The shell (`desktop/`) only changes with a new app. If the game comes to need something new from the shell, raise
  `holocene.shellApi` in package.json: installed apps are then told to fetch the whole app (the update note downloads
  the disk image and opens it), and a new line of updates begins. The build prints a NOTE when the shell changed
  without the number being raised.
- Never delete or hand-edit the `update` and `content-*` releases; `tools/update/publish.js check --repo <repo>`
  verifies them. The whole app is `https://github.com/Zetroseeeee/genesis/releases/download/latest/Holocene-mac-arm64.dmg`.

## Assets

- Generated with Higgsfield on Emile's account. Textures: `assets/textures/` (prompts, job ids, atlas builder).
  3D models: `assets/models/` (concept prompts, job ids, source GLB URLs, processing settings).
- One building ≈ 16 credits (1 concept image + 15 for the mesh); a tree is 1 credit (card only, photographed on
  a blue screen: `style.tree`). Consistency: every concept uses the same prompt
  frame (`style` in the manifest) and a reference image — the set's anchor, or, for an upgrade or a matching piece
  (a wall's gate, the next age's house), the concept of the building it follows. Look at every concept
  (`tools/peek.sh`) before paying for its mesh. True sizes in metres go in the manifest (`h`, or `w` with
  `scaleBy: 'w'`, or `plan: [w, d]` where the mesh got its proportions wrong).
- Generated files live on Higgsfield's CDN; the cloud workspace cannot reach that host directly, so GitHub Actions
  (`.github/workflows/`) fetches and processes them and publishes asset packs as release assets.
- Never commit multi-hundred-MB binaries to git; asset packs go to Releases.

## Working with Emile

Blunt, decisive, one recommendation. He wants to see things in the game, not read about them.
