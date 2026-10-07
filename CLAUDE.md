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
- `node tools/test_e2e.js ["filter|filter"]` — Playwright end-to-end suite on software GL (~26 min for all 35).
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
  CPU), few trees and none that fill the picture (`trees.coverCap`), coarser models, no shadow map, plain water
  (no waves or surf; all of it with `POST=1`). With `TREES=1` and `GRID=1` together a frame down in a wood takes
  minutes: ask for full forests only where the trees are the question. Instance buffers
  are sent with `GEO.touch(attr, n)` (the used part only): whole-buffer uploads stalled it for half a minute at a time.
- `tools/peek.sh <name> <url> ...` — contact sheet of generated images via the Peek workflow (`shots/peek/<name>.jpg`).
- `node tools/coverage.js [eras] [--all] [--wonder]` — which planned buildings are real models and which still fall
  back to the kit, for a capital of every culture with every work built. Run it after touching the manifest or the
  planner: eras 0–2 must show nothing but `stall` (the market model brings its own) and `rubble`, and so must the
  later eras of the peoples who keep the old ways (`node tools/coverage.js 3,4,5`). `node tools/density.js` reports
  how much of a town's ground its houses cover.
- `node tools/dbg3.js "<script>" "<probe>" <wait>` — run a script in the page and print a probe object.
- `node tools/live.js "<setup script>" [wait ms]` — a page that stays up, to look again and again without starting the
  game each time (run it with `nohup ... &`; it answers on 127.0.0.1:8791): `curl -s localhost:8791/eval --data-binary
  '<js>'`, `/shot?name=x&pause=3000` (`shots/x.png`), `/load?file=post.js` (reads `src/<file>` again: good for
  `post.js`, then `/eval "POST.init(__G.renderer)"`; a shader that lives in a material needs a new page), `/logs`,
  `/quit`. The switches of `shotn.js`, and `POST=1` (the picture's last steps, which a software renderer goes
  without), `AIR=1` (every step through the air), `GROUND=<n>` (the ground's materials at 1/n of their size; a
  software renderer takes 4). One command with one `/shot` in it: a picture takes a minute, a tool call two at
  most. The ground's shader needs no new page: `/load?file=terrain.js`, then `/eval "__T.reshade()"` gives every
  tile the new one (`__T.reshade({ uNew: 1 })` when it has a uniform the page's game does not know yet), and
  `/eval "__T.reground()"` reads the ground's materials again after a new pack.
- `tools/ground/pack.sh` — packs the ground's materials on GitHub (the Ground workflow: `assets/ground/materials.json`
  into the `ground` release) and brings the pack here: `data/tex/ground.json` and two atlases, which are fetched
  (`npm run fetch`), never committed. `REF=<branch>` packs a branch's list; a run that fails fetches nothing. A pack
  is kept under the name of the list it was made from (twelve digits of the SHA-256 of `materials.json` and
  `tools/ground/build.py` together), and `tools/ground/fetch.mjs` asks for the pack of the list beside it: packing a
  branch changes nothing for the game that is out, and **after any change to the list or the packer the pack must
  be made before `main` is pushed** (the game's build stops if its pack is not there; elsewhere the pack made last is
  taken, with a warning). Look at `shots/peek/ground_native.jpg` (a piece of every material texel for pixel, the
  candidates under `try` after them) and `ground_sheet.jpg` before believing a material.
  `tools/materials.sh` lists what the free libraries have, with a sheet of their previews.
- `node tools/air/sky.js check | sheet [name] | orbit [name]` — the air without the game, from the same sums the
  shaders use (`src/air.js`): `check` prints how close the quick sums are to slow exact ones (the column of air to
  space; a line of sight in few steps: within a hundredth, or the air is wrong); `sheet` and `orbit` draw
  `shots/air/<name>.png`, the sky over a plain country for a row of sun heights, and the planet's rim from outside.
  Seconds, not minutes: settle a change to the air here before looking at it in the game.
- `tools/macshots.sh [scene names]` — the real thing: pictures of this commit taken on an Apple GPU by the Scenes
  workflow (`tools/scenes/tour.txt` lists the scenes: towns of every people and age, forests, seasons, dusk and night,
  dry countries, rivers). Look at these before believing anything about how the game looks. `REF=<branch>` takes
  them of a pushed branch before it is on `main` (nothing is given out to players by it).
  `tools/macshots.sh cost_town cost_far cost_alps` writes frame rates into the pictures: one page, the parts of the
  picture turned off in turn (`__T.costs` in `tools/testcam.js`; `__T.cost([[name, set], ...])` for other questions).
  The build Mac is a virtual GPU, 1680 by 1050 with one pixel to a point: its numbers hold one build against another
  (two starts of the app differ too much: compare inside one page), they do not say how fast a real Mac is.
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
  long the market takes a year. `node tools/econ/calibrate.js [seed,seed] --write` measures how much each raw good's land
  must yield and writes the table into `src/econ.js` (between its CAL marks): run it after changing where goods lie
  (`PLACES`), what people want (`CATS`) or how things are made (`RECIPES`), or a good will be far too scarce or too plenty.
  Measure over two seeds (12345,777: the table is their mean): the goods few places yield are sized by a handful of realms.
- `node tools/know/pace.js [seed,seed] [--fit N] [--write]` — the pace of history: when the realms in front enter each
  age, how far behind the middle realm is, how many people there are. With `--fit` it moves each age's yearly gain of
  knowledge (`RATE` in `src/sim.js`, between its marks) toward the dates history kept (bronze 3300 BC, iron 1200 BC,
  500 BC, AD 500, 1400, 1760, 1900, 1970); `--write` puts the table in. Run it over two seeds after touching what
  insight depends on (the discoveries' edges to research, towns, academies, how knowledge spreads): one world's
  dates swing by a century or two on a hair, so do not chase the last fifty years.
  `node tools/know/people.js [seed,seed] [--fit N] [--write]` does the same for how many people there are: the world's
  count against history's (4 million in 10,000 BC, 220 in the year 1, 970 in 1800, 6,140 in 2000), and with `--fit`
  the table of how many a unit of land feeds at each stage of knowledge (`FOOD` in `src/sim.js`, between its marks).
  One fit moves the world a long way (fewer people learn more slowly, and feed fewer still): take the fit that
  measures best, not the last. A world keeps the table it was saved under when a refit lowers it (`FOOD_015`,
  `save().food`): an update must not starve anyone's people.
  Fit the pace first, then what the ages expect of rule (`tools/rule/norm.js`), then the people, then the market's
  yields (`calibrate.js`): each stands on the one before.
- `node tools/rule/probe.js [seed] [last year]` — how the world is governed through the ages: which forms of
  government and which laws its people live under, how much power each estate holds and how content it is, how many
  laws are passed, demands made and risings break out. `node tools/rule/norm.js [seed,seed] --write` measures what
  realms of each age get from their rule and writes the table into `src/rule.js` (between its NORM marks): run it
  twice over two seeds after changing what forms and laws give, who likes them, or how the autopilot chooses.
- `node tools/diplo/probe.js [seed] [last year]` — war and peace through the ages in numbers: how many realms there are,
  how often they go to war and why, on what terms they stop, what they have sworn, who is whose vassal, what they
  think of one another, how much of the old appetite for war finds somebody it may fall on. Run it over seeds 12345
  and 777 after touching `diplo.js` or the simulation's wars, and hold it against the numbers in its header: the world
  must go on fighting about as often as it did, and keep about as many realms.
- `node tools/brand/icon.mjs [sheet.jpg]` — the app icon (`build/icon.png`) and the mark (`src/mark.png`), rendered
  from the game's own picture of the Earth.
- `node tools/imagery/seams.mjs check` — whether the packs of the picture of the Earth (`data/i`) end in the colours
  their neighbours begin with (they must: see "A pack is a texture of its own"); `fix` makes them.
- `tools/water/pack.sh` — makes the water's edge on GitHub (the Water workflow runs `tools/water/build.py`: its sources
  are on AWS, out of reach from here) and brings it here: `data/w/` (`index.json` and 1,484 packs, kept in 157
  bundles of sixteen: `<level>_b<x>_<y>.bin`, a table and then the packs' own files; `fetch.mjs` makes them, always
  the same bytes, and `terrain.waterBlob` reads a pack out of its bundle), fetched (`npm run fetch`), never
  committed. In bundles because of the updates: a game that is out fetches what changed file by file, and past 400
  files that differ `tools/update/publish.js` begins a new line (everybody fetches the whole app again); 1,500
  small files were that at once. **Data that comes in many small files goes into bundles.** `node
  tools/water/fetch.mjs check` says whether what is here is whole (the game's build asks). About an hour and a quarter for the whole Earth. `ONLY=7/36/4,7/31/8` or
  `BBOX=lon0,lat0,lon1,lat1` makes some blocks only (a trial: a minute or two; it comes here as it is and is nobody's
  pack), `MODE=probe` only looks at the sources, `REF=<branch>` runs a branch's builder. A pack is kept under the
  name of what it was made from (twelve digits of the SHA-256 of `tools/water/build.py`, `data/rivers.png` and
  `data/index.json` together), and `tools/water/fetch.mjs` asks for the pack of the files beside it: **after any
  change to the builder, to the rivers the game draws or to the list of its heights, the pack must be made before
  `main` is pushed** (the game's build stops without it: `WATER_STRICT`; elsewhere the pack that is here is kept,
  with a warning). Look at `shots/peek/water_sheet.jpg` and the end of `shots/peek/water_build.log`. In a workflow
  never write `ls | head` under `pipefail`: with more files than `head` takes, `ls` fails on the closed pipe (the
  first whole build was thrown away by its own listing, after 33 minutes).
- `python3 tools/imagery/under.py` — carries the land's colour on under the water in the picture of the Earth
  (`data/i`) and the land's green in `data/veg.jpg`: the true shore runs a texel or two inside and outside the
  picture's own. Run it after anything that remakes `data/i`, then `seams.mjs check`.
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
| `src/rule.js` | `RULE` | Forms of government (24), laws (100 in twelve fields), the seven estates, authority; one world's rule: what every realm has chosen, who holds power in it, reforms, demands, risings |
| `src/diplo.js` | `DIPLO` | What two realms can swear, why they go to war and what a winner may ask; one world's diplomacy: what every realm thinks of every other and why, pacts, vassals, claims, wars with friends on both sides, offers to the player |
| `src/sim.js` | `SIM` | World simulation on a 720×360 grid: civilisations, growth, war, tech/eras, works, disasters (steps the market and each realm's learning once a year) |
| `src/terrain.js` | `TERRAIN` | Quadtree globe tiles, elevation, the ground's shader: its materials at a ladder of sizes, fields/roads/urban ground |
| `src/town.js` | `TOWN` | Pure-data settlement plans in true metres: which building stands where, for a culture, era, size |
| `src/buildings.js` | `BKIT` | Procedural building kit (unit archetypes) and its material shader |
| `src/models.js` | `MODELS` | Real 3D model library: manifest, loading, LODs, instancing (replaces kit archetypes when a model exists) |
| `src/shadows.js` | `SHADOWS` | Sun depth map of everything standing near the camera; terrain and models read it (true shadows) |
| `src/air.js` | `AIR` | The air: one sum along the line of sight for the sky, the haze before far hills, the planet's rim and the edge of night; as GLSL for every shader and as JavaScript |
| `src/post.js` | `POST` | What a frame goes through between the scene and the screen: shade between things (from the depth), the glow of what is brighter than white, the developed picture |
| `src/world.js` | `WORLD` | Turns town plans into instances near the camera; sky, clouds, atmosphere |
| `src/textures.js` | `TEX` | Generated material atlases as texture arrays; the ground's scanned materials (`TEX.ground`); UI art |
| `src/decal.js`, `trees.js`, `life.js`, `movers.js`, `events.js` | | Roads/rivers decals, vegetation, people, vehicles, disasters and battles |
| `src/market.js` | `MARKET` | The market screen (board, a good's page and book, partners, workshops, ledger), the movers, the goods' glyphs |
| `src/tree.js` | `TREE` | The knowledge screen: the tree age by age and branch by branch, a discovery's page, the queue, where the realm stands |
| `src/gov.js` | `GOV` | The laws screen: the fields and their laws, the forms of government, the estates, the reform under way, a demand |
| `src/envoys.js` | `ENVOYS` | The diplomacy screen: the realms within reach and what they think, a realm's page (what can be proposed and how it would be answered, war and its price, peace and its terms), envoys waiting, the wars, the realm's standing |
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
- **Rule** (`rule.js`; `sim.rule`). A realm has a form of government and one law in force in each of twelve fields
  (land, labour, taxes, arms, justice, provinces, standing, faith, trade, learning, speech, care), all on the realm
  as `civ.rule` (form, laws, authority, the estates' content, the reform under way, a demand) and saved with it.
  Each form and law stands on discoveries (the knowledge tree's page lists what a discovery opens here), gives
  factors (`RULE.KEYS`: taxes, customs, an army's cost, what the state spends, stability, food, growth, health,
  strength, a levy's cost, insight, works' cost, reach, trade, workshops, yields, expansion, breakaway, unrest,
  hunger) and is liked or hated by some of the seven estates (nobles, priests, merchants, artisans, farmers,
  soldiers, scholars: their names change with the ages). An estate's power is what the realm is made of (towns,
  temples, markets, academies, the army's pay) times who holds office under the form, times whose hand each law
  in force strengthens (`SWAY`: a standing army the soldiers', intendants nobody's but the crown's; so a ruler can
  cut an estate down law by law before he takes its government away, `rule.sways` says where a share comes from).
  Its content drifts to what the form, the laws and the times add up to: taxes, hunger, war, luxuries; from the
  Industrial age the mills (`FACTORY`: workers are hard to content until laws protect them); and, once there are
  presses anywhere, agitation where the land is other people's and workers have no say (`abroad`, saved as
  `save().heard`). Content estates give (farmers food, artisans work, merchants trade, scholars insight, nobles and
  soldiers strength, priests stability), angry ones withhold, demand a law (grant or refuse) and rise; a rising
  that carries the day changes the government (nobles to what suits them, towns and country to a republic, or to a
  people's republic once any realm knows how one is run, even where nobody at home does: `civ.rule.brought`), and
  where a realm is coming apart the army marches on the capital. Every form has **its own ways** (`WAYS`): laws
  that cost a quarter less under it and that its rulers reach for first.
  **Authority** is what change costs: it gathers by the turn (`AUTH_TURN`), a law costs 15 to 90 by how much those
  with power lose by it, a form 40 to 150, and a reform takes about a turn (`RULE.PACE`, which is also the length of
  a turn: `main.js` takes it from there; everything in rule that happens "now and then" is paced by it). **Rule is
  measured against the age**, as knowledge is: the simulation reads `rule.f` = what a realm's rule gives (`rule.own`)
  over what realms of its age usually get (`NORM`, measured by `tools/rule/norm.js`), so the world's numbers stay
  where they were whatever realms choose, a realm under the laws of its forebears falls behind, and one that
  reforms well gets ahead; after changing what forms or laws give, measure again. The autopilot reforms by weight
  (`lawWeight`, `formWeight`: what a later age offers, what those in power want, what the realm is short of, its
  ruler's leaning, a leaning of the people's own, the form's ways; a ruler who answers to nobody also wants a
  freer hand and cuts down whichever estate holds a third of the power) and saves up for a change of form. Power is
  open, inherited or closed (`RULE.kindOf`), and those who hold it one way seldom reform themselves into another
  unless the ground is giving way (`trouble` in `formWeight`); what was seized seldom outlives the one who seized
  it (`rule.passes`, at a ruler's death: his heirs make a crown of it, or the old order returns). The player's
  realm changes its form only by his reform, a rising or the army. `tools/rule/probe.js` prints which forms turn
  into which: look at it after touching any of this, then measure the norms again. A people begins as a band of
  kin under the first law of every field; a breakaway keeps its parent's laws, and its form unless that is too
  grand for a province; a world saved before this is given the form its old name says and the laws of its age
  (`rule.settle`). Realm names and rulers' titles come from the form, in the
  people's tongue (`TONGUE`). Tests and scenes that set `tech` by hand give other realms the laws of their age
  through `__T.teach` (the player's own only when asked). The screen is `gov.js` (V); the lens of government (O)
  paints realms in the colour of the kind of rule they live under (`RULE.KINDS`; `world.palMode = 'form'`, and
  `uLens` makes the ground shader's fill strong enough to read), with a key above the minimap.
- **Diplomacy** (`diplo.js`; `sim.diplo`). What a realm has sworn, remembers, claims and is owed is on the realm as
  `civ.dip` and saved with it. Its keys are numbers (`claim[id * 4 + kind]`, `ask[id * 8 + what]`), and a year BC is
  negative: "never" is not 0 (`holds`, `claimUntil` answer -Infinity; `d.next` is the year the next thing of a realm's
  runs out, so that nothing is looked through until then). **Opinion** (-100 to 100) is a sum of reasons the page can
  list (`reasons`): what is remembered (it halves in three turns), faith, kind of rule, speech, trade, what is sworn,
  a border and who is the stronger across it, conquests, a realm's word, claims, enemies in common. Five things can
  be sworn (sworn peace, trade agreement, defensive pact, alliance, royal marriage: `PACTS`), each standing on a
  discovery and holding some turns; a **vassal** (kept on the vassal: `dip.lord`) pays a tenth and follows its lord to
  war, and after six turns a loyal one can be joined to the crown. A proposal is weighed by `judge` (a score and its
  reasons, which the page shows before the player asks). War needs no reason but is dearer without one (`causes`:
  a claim, land that was one's own, another faith, goods, kin, a creed, tribute refused, a rebel vassal; without, it
  costs quiet at home and the realm's word from the Iron Age on). Friends are called (`join`), a war is scored by
  the land each side has lost since it began, and a winner may ask reparations, a change of government or
  submission (`termsFor`, `wouldEnd`); one peace ends it for all who came in beside the two.
  **A realm has two strengths** (`strength` in `sim.js`). `strengthOf` is how good its arms are, and a fight over a
  region turns on that alone: every world's wars were fitted so, and counting heads there would let the largest realm
  roll up the map. `mightOf` is arms and numbers together: what envoys weigh (`ratio`), what a neighbour fears, what
  the player is told ("far weaker than you"), how large the armies are drawn. A realm that rules itself attacks whom
  its arms can beat (the simulation's old rule), if it dares (`DARE`: never a side, friends counted, two and a half
  times as mighty as its own) and is free to (`warWith`); and **the world keeps its appetite for war**: what a realm
  may not fall on, it falls on its other neighbours the more (`WAR_RATE` and the loop beside it). Pacts move wars
  about; they do not end them. The numbers to hold it to are in the header of `tools/diplo/probe.js`.
  The autopilot (`think`) looks at a handful of realms about once a turn: asks for peace on a border, a market, a
  marriage, a friend against whoever it dreads, a protector, a vassal (`HOLD`: it is content with three), a claim. It
  must stay cheap (a year of diplomacy is about 3 % of a year with 300 realms): the market's links are indexed once a
  year (`pIds`), a realm's `ver` says when the market must ask again whether two realms have opened or closed their
  markets to one another (`L.fr` halves the customs, `L.shut` stops the link), tribute is paid from a list of those
  who owe any. What is offered to the player waits in `dip.offers` (the HUD shows it; an offer of peace, a call to
  arms and a demand end the turn). The screen is `envoys.js` (F); the lens of relations (X) paints realms by how they
  stand with the player (`DIPLO.STAND`; `world.palMode = 'rel'`). A world saved before diplomacy begins with clean
  records. Tests and scenes that need the others to keep still set their `aggression = 0` and `dip.think = 1e12`
  (`tools/scenes/dip.js` lays a whole table by hand: a war with friends on both sides, a vassal, a claim, envoys).
- **Workshops** (`IND` in `sim.js`): works a town raises on a plot like a temple (`sim.ind`: cell -> plot + 1 for each
  kind). Each makes one kind of work (`ECON.SECTORS`) cheaper for the whole realm, a granary keeps food, a warehouse
  lets merchants hold more. The work on a cell's own good is the old `mine` (bit 512), now for any good, named by
  what it works (`sim.workName`). The planner draws them with the models every people has (barn, granary, well), so
  towns of the early ages stay fully modelled; they carry a role (`as: 'workshop'`...) for models of their own later.
- **Style packing.** `wall + roof*8 + culture*64 + flags*1024`; flags: landmark 1, block 2, neon 4, wonder 8, ruin 16, site 32, thing 64 (a cart or a boat: no door, windows or roof).
- Keep modules independent (pure data in `town.js` and `sim.js`, rendering elsewhere): the game will grow to tens of GB of assets.
- **The air** (`air.js`). There is one atmosphere, and everything drawn stands in it: sky, haze, the planet's blue rim
  and the red edge of night are the same sum along the line of sight (sunlight dimmed on its way in, the share the gas
  and the haze turn toward the eye, light scattered before from a table by the sun's height, what the air between takes
  away). It has no textures (the ground's shader has no sampler to spare): the column of air to space is a closed form,
  and each step takes the air as it really thins along it, so four steps do for the ground and three for a house, and a
  house stands in the same air as its street. Where next to no air is on a short line (most of what is seen from
  down among things) nothing is worked out at all, and a short line with a little air is one piece. **It is worked out at the corners of meshes, never per pixel** (a march
  at every pixel of a large screen cost two thirds of the frame rate): the ground and the things on it in their vertex
  shaders (`AIR.VERT`: `air(viewPos, steps, vAirT, vAirL)`, then `airOver(colour, vAirT, vAirL)` from `AIR.FRAG`), the
  sky on a mesh of directions round the camera (`world.js`: rings set by how high above the ground a line of sight
  passes, so the horizon from the ground and the whole thin rim from orbit get most of them; drawn last, at the far
  plane, with the sun's disc and the moon on it). Only what turns with the angle to the sun is per pixel there
  (`airParts` gives the gas's and the haze's shares apart, the phases are applied in the fragment shader: the bright
  ring round the sun is sharp). Shaders still write the colours of the screen; `airOver` takes them to light and back.
  `vAirT` and `vAirL` are `centroid` varyings: with four samples a pixel, a pixel on a triangle's edge is otherwise
  reckoned from outside the triangle, and along the planet's rim (triangles seen edge-on, a hundred kilometres of air
  to a pixel) that came out as single pixels of pure blue. A tile's skirt takes the air of the ground above it.
  Three things are not as in nature, each for the game's sake: the air is twice as tall and half as dense (the ground
  is drawn twice as tall: `THICK`); it is thinned about the eye when the camera is down among towns drawn many times
  larger than life (`AIR.near`: a town stands clear, the hills behind it in haze); and it is thinned where it is
  looked down through (`AIR.down`: the map stays readable from high up, the horizon and the rim keep their haze). The
  eye opens as the light goes (`AIR.OPEN`: stops by the sun's height), which is what shows dusk and a moonlit night
  at all. `AIR.update` runs once a frame after the camera is final. Change the air in `tools/air/sky.js` first. The
  stars are points on a sphere that goes with the camera, at every height: from the ground they come out as the sky
  darkens, thin out toward the horizon and twinkle.
- **The picture's last steps** (`post.js`; on a real GPU at full quality, `POST=1` in the harnesses). The scene is
  drawn into a target that holds light brighter than white (half floats, four samples) and its depth, then: shade
  (ambient occlusion from the depth alone, two reaches, a share of the distance wide so it reads at every height;
  fades with the haze and with height), glow (what is above white bleeds, the wider rings weighed more: `POST.wide`),
  develop (a little contrast and colour, a shoulder into white, darker corners, grain). 0 to 1 is the picture as the
  shaders made it; only what they write above 1 is "more than white", and they write it where `uGlow` is 1 (the sun's
  image on water, flames, lit windows, a fire front; the sun's disc is thousands). Depth here is ordinary perspective
  depth: the game's own shaders never took the renderer's logarithmic depth. The developing turns about a dark grey
  (0.30): shadows stay where the shaders put them, lit ground gains. After its first frame the stage asks the card
  whether its targets are whole; if not (`POST.broken`) the game draws straight to the screen as it used to.
- **A ground tile's mesh** follows how the tile is drawn (`gridFor` in `terrain.js`), up to the finest its level has
  (`gridOf`: 128 a side at the deepest level). What costs is not corners but slivers: with four samples a pixel the
  fragment shader runs for every triangle that touches a pixel (and for its three neighbours each time), so country
  seen from the side at full fineness, triangles a tenth of a pixel deep, cost more than the rest of the frame. A
  tile's quads are therefore `quadPx` (8) pixels or more each way as it lies to the eye (`t.lie`); only where
  something stands up in it (`t.relief`, measured from the elevation it is drawn with; three pixels tall and more)
  does it keep quads `quadPx` wide however shallow it lies, for the line it draws against the sky. (A triangle costs
  its area and half its edge again: at quads of 4 pixels that is nearly twice the area, at 8 less than half as much
  again. The Alps went from 11 frames a second to 15 by it on the build Mac, and the pictures cannot be told apart:
  the tour keeps `alps_q4` and `ridge_q4` to hold against `alps` and `ridge`.) From far out every tile
  counts as seen from above (the air is worked out at the corners, and changes fastest along the rim). Whatever
  stands on the ground asks `gpuHeightAt`, which uses the mesh a tile has at the moment (`t.grid`), and
  `meshVersion` follows the meshes as it follows the tiles. A software renderer keeps its two fixed grids.
  `terrain.stats.quads` counts what is drawn; `terrain.quadPx = 0` is the old way (to compare).
- **The ground's shader is the frame.** It is what a view costs: by pixels, not by corners (on the build Mac a
  view to the horizon takes 37 ms, of which the ground 20 and more: `cost_far`). Two things were found to count far more
  than they show, and both are per texture and per tile, not per shader line: slivers (above), and how many ways a
  texture is looked at where it runs away from the eye (`anisotropy`). The noise has 2 ways and, where the ground
  is drawn the old way, the photographs of detail 4 (`ANISO_NOISE`, `ANISO_SMALL` in `main.js`); at 16 each they
  cost a fifth of the frame for nothing the eye finds. The ground's materials, the generated arrays, the imagery
  and the models keep 16 (for the materials 8 and 4 measured no faster: `costa_far`). Measure before adding a
  lookup, and after.
- **What the ground is made of** (`USE_GROUND` in `terrain.js`, `TEX.ground` in `textures.js`). Twenty-one
  materials, each with its colours, its relief and its heights: twenty scans of real ground from the free libraries
  (public domain: Poly Haven, ambientCG; the list is `assets/ground/materials.json`) and the canopy of a wood, which
  the packer makes. They come as two texture arrays (colour with the height beside it; relief, two channels) in
  place of the old detail photographs, so the shader is still at 15 textures. Without the pack the ground is drawn
  the old way, which stays in the shader (`#else`). The shader knows a material by its number, the loader by its
  name (`GROUND` in `textures.js`, with the one that stands in where a pack was made before it): a new material is
  added in both, and in the list.
  **A ladder of sizes.** A material repeats every 12 m, every 24, and so on doubling, up to 200 km, in a frame of
  cells a metre and a half across (`uLadN`, `uLadF`, `vGLf * uLadK`: whole cells at the tile's centre, exact, plus
  the offset). A pixel takes the step at which a repeat is some 600 pixels across its narrow way (`uGndK.w`), so
  the ground is sharp from every height and a repeat is never seen as one. The steps are held in two places, the
  even ones and the odd ones: a place changes its step only while the other has the whole picture, so wherever a
  place shows, where it is looked up runs on unbroken from pixel to pixel, and the lookups are ordinary ones.
  Between two steps the one gives way to the other over a ragged span (`uGndT.z`, `.w`), each keeping the share of
  its light and dark that leaves the whole as rich as one alone (an even mix of two photographs is flat: it looked
  out of focus).
  **Two ladders.** What a scan shows has a size (`size` in the list: metres of real ground). Most are taken from
  the air and show fifteen metres and more; seven show a metre or two (`fine`: grass, marsh, scree, shingle, red
  earth, cracked mud, the gravel of the stony desert). Laid as large on the screen as the others, grass has blades
  as long as a barn. So the fine ones stand lower on the ladder (`uGndCls`, `uGndFine`): three quarters of a step
  while the eye is near, so that blades can be seen and stand against a house as hay does, up to two and a quarter
  from high up, where a meadow is a grain. Not lower: a repeat under a hundred and fifty pixels across is seen as
  rows of itself, whatever is done to hide it (an aerial scan put on the fine ladder was a field of dots from a
  mile up).
  **Which material** comes from what the shader always weighed (wood, grass, dry ground, rock), the climate and the
  slope. The two that count most are laid one in the other's hollows, by their heights. A material takes the
  brightness the photograph of the Earth has there, up to a cap of its kind (grass under a bright haze is still
  grass), and a share of its hue: but only what is as coloured as the material on the whole is tinted (a grey
  stone in the grass stays grey; tinted with the grass it went blue, and brown earth mauve), and nothing past grey
  into blue.
  What each of these cost to learn. The noise of the place (`nMac` ... `nFin`) both *chooses* (which material, where
  the scree lies) and *bends* the repeats so that they do not stand in rows. It is read at a stated level
  (`textureLod`), three coarser than the card would take and never finer than the third, and never from its fourth
  channel, which is single texels: chosen by grain a pixel across, the ground is a snow of single pixels from a
  mile up; bent by fine grain, a scan is drawn out into streaks. (A bias, `texture(s, p, 3.0)`, does not do it:
  seen from close to, the card's own level is far below nought and the bias leaves it at the finest.) A step is
  bent by the noise that is at least fourteen of its repeats long. A scan's heights and relief count for less from
  the step where a stone would be a house (`gndNear`, `gRelC`), or there are hills that are not there, with faces
  turned from the sun. What should stay where it is while the eye draws back (lusher and drier stretches of a
  meadow, stony patches, scree) hangs on the noise of the place, never on the ladder: only the grain may change
  under the eye. And a scan must be what it is called: the first "meadow" was moss with twigs in it, and from a
  barn's height the twigs were logs. `shots/peek/ground_native.jpg` shows a piece of every material texel for
  pixel: look there, not at the small sheet. A repeat is `GND_PX` (600) device pixels across times the root of the
  screen's pixel ratio: on a screen of twice the pixels the materials are neither half the size nor half as sharp.
  A wood's floor gives way to its canopy between 2.2 and 4.2 km from the eye (`far` in the list: one size, by
  distance, because a crown has a size as grass has not), except in settled country, which is cleared to pasture
  with trees standing in it. What people have made of the ground (crops in their rows, paving) is laid at the size
  the game draws a village at (`ltex`); between the houses of a town that is not paved the beaten ways are pale and
  grass holds on beside them. A software renderer takes the pack at a quarter of its size (`GROUND=1`: whole).
  `uGndShow = <layer>` shows one material everywhere; `uGndV` is how much a meadow varies.
  **What it costs** (the build Mac, a virtual GPU, 1680 by 1050; `costg_*` holds the materials against the ground
  drawn the old way in one page): looking down on a town 28 frames a second against 31, on a meadow 29 against
  31, over a town to the horizon 26 against 38, the Alps from 19 km 15 against 25. Half of it is the lookups
  (twelve to twenty of them a pixel) and half the arithmetic of choosing and toning, which is why a kind of ground
  is gone into only where there is any of it, nothing is looked up that cannot show (under water, under snow,
  under a road, a second material too small to appear, relief from the step where it no longer counts), and the
  meshes went to quads of 8 pixels. Three things that were tried and measured no faster on that card: lookups
  told how large a pixel is (`textureGrad`: a tenth slower), branches round the two places of a ladder, fewer ways
  of filtering. `__T.costsGround()` goes through the parts (`uGndDbg`).
- **A card does not weigh four texels finely.** Between two texels a GPU gives 256 steps and no more (the software
  renderer here weighs finely and shows none of this). The picture of the Earth is 1024 pixels to 45 degrees
  (`data/i`: five kilometres to a texel; the `4096` in the shader's `texPerPx0` is four times the truth), so from
  close to a texel is thousands of pixels wide and what is looked up between two of them is a flight of stairs,
  dead level on every tread: nine metres by nineteen in Finland. Never take `fwidth` of such a lookup for its
  slope, and put no threshold on one: a lake is told from a shore by how level the water's mask lies, and every
  riser of the stairs was a line of dry land across the water (a lattice over every lake near its shore, in every
  release up to 0.19). Where the picture is magnified the mask's four texels are fetched and weighed in the shader
  and its slope is theirs (`terrain.js`, at `img`). Look at water from low down on the Mac (`taiga_shore`,
  `lake_low`, `coast_low`, `port`) after touching the mask. The mask itself is no coast: its texels on a coast are
  mixtures (64, 96, 128 ...), and 128 is also what a lake is, so off many coasts there was a blue band and a bar
  of sand. Since 0.21 the water's edge is the field's (below); the mask draws the coasts only from far out (tiles
  under level 5) and while a pack is on its way.
- **The water's edge** (`data/w`, `tools/water/build.py`; `uWater` in `terrain.js`). A field of distances: how
  many metres it is from every place to the nearest shore (land positive), 305 m to a texel at level 7 and the
  same at half and a quarter the fineness (levels 6 and 5), in packs of 2052 texels with a rim of two. Its nought
  is the shore, and lies true far below the texel. Three bytes a texel: the distance (a step is 16 m out to 480 m
  either way, then ever coarser to 3.6 km of water; times 2 and 4 at the coarser levels); what water the nearest
  water is (sea 0 .. fresh 15) and how open it lies (15 on an open coast, half and less in a harbour, a sound, a
  fjord, a small lake), four bits each; and how high the nearest fresh water stands, by the game's own heights.
  Packs without a shore are not kept: the list says land, sea or fresh.
  *Where it comes from.* The water mask of the Copernicus DEM (90 m; it knows sea from lake from river) and, for
  what that lacks, the water of ESA WorldCover (read at 80 m): the first was made by radar, much of the north in
  winter, and a frozen lake is land to a radar (a square degree of Finland had a fortieth of water where a tenth
  is, the Taymyr none). A river is water only where it is 1.2 km wide; narrower, the game draws it itself
  (`decal.js`), and what the second source has along the game's own river lines follows the same rule. Lakes under
  0.4 km² are left out. Both notices are in the game's menu ("Where the world comes from"): they must stay there.
  *In the shader.* The fragment shader fetches the four texels about a pixel and weighs them itself (a card's 256
  steps: see above); near the shore and from close, sixteen (Catmull-Rom: weighed between four the shore is a run
  of straight pieces a texel long), which also gives how the shore bends (`wBend`: a bay positive, a headland
  negative: sand gathers in the one and is washed off the other) and the way to the nearest land (`wLand`). The
  noise of the place roughens the line (a beach runs smooth, a steep shore ragged) and the sea's edge comes and
  goes a few metres. `wD`, `wK`, `wOpen`, `wCov` (the pixel's share of water) are what everything after reads.
  *In the mesh.* The sea lies at nought and a lake at its level, and the ground comes up from the water's own
  level, beginning a little inland (`uShoreQ`: a quad and a half of the tile's mesh as it is, never under 60 m): a
  triangle with one corner in the water and one on a hill carried the water up the hill. Without the levels a lake
  under a mountain climbed it; with them the game cuts the lake's bed into its own (coarse) heights. The byte the
  card cannot weigh (two things in one) is fetched from the nearest texel. `shoreAt` (metres; then `wKind`,
  `wOpen`, `wLevel`), `isWater`, `heightAt` and `gpuVertexH` are the CPU's twins: trees, harbours, piers, ships,
  town sites and walls ask them, and ask again whenever more packs have come (`stats.packsW`).
  **The terrain shader is at 16 textures with it, which is all an Apple GPU allows**: the next one must take the
  place of another.
- **Water** (`terrain.js`, from `// ---------- water`). What comes up out of it, then what it mirrors. *Depth*:
  the metres out from the shore times how fast the bottom falls, and it falls as the land above the shore rises
  (the ground's height 260 m inland of the nearest shore: under a hill the strait is deep a stone's throw out, off
  a flat coast the shallows run a furlong), never deeper than the shelf allows (`info.r`; far from any shore and
  where there is no field the shelf alone says). *Colour*: the bed (sand in a bay, dark rock under a headland,
  the photograph of sunlit shallows from close) seen through that much water, red going first, then the deep's own
  blue; lakes blue-green, dark as tea where the winters are hard and wet (`peat`), milky high in wet mountains,
  clear and very blue on the high dry plateaus. A lake's bed falls as the land above its shore rises above the
  water's own level (`vH` there), never more gently than a floor (the heights come in steps of seven metres and
  more); peat hides the bed within a step from the shore. A great river is in the field as fresh water too, often
  in pieces (where it is 1.2 km wide), with the game's own ribbon of it beside them and between them: narrow water
  between flat banks (`riverish`) is therefore given a river's water as the decal's rivers have it, shallows a
  furlong wide, pale and green, over a blue channel, brown with silt in dry country; a small lake of the plain
  likewise. *Waves*: one
  picture of a ruffled surface at four sizes (repeats of 40 m, 160 m, 640 m, 2.5 km), each drifting its own way,
  less in the lee of a shore and in sheltered water, in patches as the wind lies. Each size is bent by the noise
  of the place that is some four of its repeats long and more, by half a repeat or so (bent by grain as small as
  itself the waves are smeared; laid straight, or one size alone, they are a lattice from a mile up: a lake keeps
  a little of the two large sizes for that). What the card averages away as a
  size grows small in the picture is not thrown away: the averaged normal is shorter, and by that much the water
  is rougher within the pixel (`wRough`), which spreads the sun's image into a path and lifts what the horizon's
  sea mirrors above the horizon. *Surf*: where the sea comes in from the open (`wOpen`, and more under a headland
  than in a bay) lines of white run in along the shore, 34 m apart, each breaking along a stretch of itself; a
  pale fringe from too far to tell them apart; great lakes a little, small ones none. *The mirror*: Fresnel, the
  sky from a table of fifteen colours made once a frame where the camera stands (`skyMirror` in `main.js`: the
  air's own sum at five heights, toward the sun, across and away), the sun by a lobe as wide as `wRough`; in
  light, as the air is (`lit` is a root of light: mixed as squares). A river of the decal and a flood mirror too.
  `uSeaK`: x how high the waves run, y how much surf, z how clear the water (w: 1 no waves, 2 nothing mirrored, to
  ask what they cost: `__T.costsWater()`, `costw_*` in the tour). Look at `sea_air`, `sea_cove`, `sea_low`, `surf`,
  `sea_dusk`, `sea_glint`, `lakes`, `lake_fin`, `lakes_radar`, `lake_alp`, `fjord`, `delta`, `lagoon`, `tundra`,
  `sea_region` and `planet` on the Mac after touching any of it; here, start the live page with `GRID=1` (the
  mesh at its real fineness: with the coarse one the shore's flat strip is as wide as the field allows and no
  wider than a quad, and the sea stands up the shore again).
  A software renderer runs both arms of every branch at every pixel, so what a real card skips (the sixteen
  texels away from a shore, waves and surf on dry land) it pays for everywhere: the frame took twice as long. The
  test suite's pages (a software renderer without `POST`) therefore compile the water plain (`WATER_PLAIN`: the
  shore from four texels, no waves, no surf, the bed falling evenly); the harnesses with `POST=1` have all of it.
- **Still water lies level.** The ground's small relief (`dispAt`, the vertex shader) begins `WET_RISE` metres
  inland of the flat strip along every shore (by the picture's mask where there is no field: `WET`): a lake heaved
  as the land is was a sheet of bumps under a flat picture of water.
- **How near the eye is** is `mapcam.agl`, its height above the ground it looks at; `mapcam.alt` is its height above
  the sea. `uCamAlt` and whatever is shown only from close to go by the first: the ground is drawn twice as tall, a
  town at 1,600 m stands three kilometres up, and by the height above the sea the high plains of Iran, Ethiopia,
  Mexico and the Andes never showed a field's plots, the scrub or anything else that is for near.
- **Apple GPUs allow a fragment shader 16 textures.** The terrain shader is at 16 with everything on (the water's
  edge took the last). Adding a sampler there means freeing one (pack into an array layer). The Mac launch check reports `samplers` and fails on
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
  **A wood is not a lawn with trees on it** (`trees.js`). Three tiers of trees round the eye (40 m apart within
  3 km, so that crowns meet; 110 m to 12 km; 380 m to 36 km: many small ones far off, not a few giants) and a
  fourth of what grows under and between them within a kilometre: young trees and bushes in a wood, scrub on open
  ground as the climate has it (`SCRUB`). A bush has no picture of its own: it is the crown of one of the place's
  trees without the trunk, small, on the ground (`CROWN`: how far up its picture a tree's crown begins). A wood is
  made of **stands**: over a few hundred metres some of the zone's trees have the ground and the rest are the odd
  one among them, and a stand has its own height and its own green (sown one by one at random, every wood was the
  same even mix). Each tree carries `aTree`: how deep in a wood it stands, its own dice, how much of its picture
  is left off. In a wood the shader takes its light away from below (trunks and the under sides of crowns stand in
  the dark, the tops in the sun: the photographs are all softly lit from the front, and a wood of them unshaded is
  a table of model trees). Two things about the pictures themselves: what lies round the tree in a card is given
  the tree's own colour on loading (`MODELS.card`: it was the pale of the screen they were cut from, and drawn
  small a picture is an average of its texels, so far trees were pale and haloed), and where the frame has several
  samples a pixel the cut-out's edge is drawn by coverage (`alphaToCoverage`, `uCover`), not pixel by pixel. Trees
  stand up to the water (the water mask climbs over a kilometre: only its lower half is shore).
  **How they are placed.** A tier is tens of thousands of plots, each asking the country what grows there: a tenth
  of a second and more. It is done a slice a frame (`trees.slice`, milliseconds; a software renderer does it at
  once) into a store the picture does not see, and shown when it is whole; and only when the eye has moved or what
  the trees stand in has changed (season and leaves at once; the ground's heights and water, which arrive piece by
  piece, and the years of the world no oftener than every second or two). The plots are the world's, not the eye's:
  rows along the parallels, spaced by their own latitude in bands of half a degree (spaced by the eye's latitude,
  every tree of a wood changed places each time the eye had gone a few hundred metres north). The tiers hand over
  in the shader (`uHole`: the outer one draws nothing where the inner one's trees stand now; placed at different
  times with a hole left at placing, a moving eye had a bare crescent of wood behind it), and not at a line: each
  thins out over the last fifth of its reach as the next comes in, and what grows under the trees thins from a
  third of its reach and as the eye rises. The nearest tier draws in as the eye rises from six kilometres to
  twelve, and from there the next has all the ground. A pass that places what stands already (most do: the ground
  was looked at again, a year went by) hands nothing over: nothing is sent to the card and the sun's shadows are
  not drawn again (`_sums`). A kind of tree has room for what a pass placed of it and is given more when it needs
  more (`impMesh`; with room for a whole tier each, the trees of a journey held hundreds of megabytes).
  **From above** a tree is its crown (`uCrown`, `vTop`): the pictures are of trees from the side, and laid under
  the eye whole they showed the trunk and the dark under side of every crown, so that from a mile up the trees
  round the eye were a black plate on the country. The higher the eye, the more of the picture's foot is left off,
  the more the crown is lit as its top is, and the wider a tree in a wood is drawn (half again: from the side the
  trees of a wood stand one behind another, from above each has only its own ground to cover). And a wood is as
  light or as dark as the photograph of the Earth has it there, with the ground's own lusher and drier stretches
  (`trees.stretch`): the canopy that stands for a wood from afar is toned so, and trees of one green everywhere
  lay on the lighter woods of the plain as a dark patch about the eye. Look at a wood from 3, 5, 7 and 9 km
  (`woods_high`, `woods_top`, `woods_7k`, `woods_9k`) after touching how trees are shaded.
- **Climate.** `data/climate.png` is the Köppen-Geiger class of every eighth of a degree, and `data/info.png`
  carries two fields made from it: alpha = how dry the country is (the ground shader blends sand, stony plain,
  scrub, steppe and savanna by it; the photograph only says where the ground is bare), blue = how hard the winters
  are (snow lies on the ground and on roofs by it, in season). Trees take their zone and their density from the
  class (`zoneOf`, `Trees.THIN`). Rebuild both with `tools/climate/build.py` (the source and its licence are in the
  file's header). The year: `uSeason` (sun), `uBare` (leaves down N/S, the cold of the year N/S, a month behind the sun).
- **Rivers** are drawn wider than life (`drawnWidth()` in `decal.js`: brooks four times, great rivers twice), like
  roads and towns. A river's ribbon is one strip, mitred at every point of its line (as boxes run on past their
  ends, a great river's two kilometres of ribbon threw a corner out at every least turn: its banks were saws).
  Where a river is wide enough to be water in the field of the water's edge (1.2 km) and the line of it held here
  runs in that water, the ribbon lay out over both banks as a second river's shallows: a line that keeps in the
  field's water, or within 150 m of it, for 1.5 km either way is left to the field (`ALONG_*` in `decal.js`;
  `stats.along` counts the pieces), one that only comes down to a shore or leaves one is drawn to the water's
  edge. A line that runs beside the field's water is drawn: the field has such a river in pieces, and there is no
  telling its own water from a lake it passes (asked for a mile to either side, the Yangtze at Nanjing was cut in
  two). The cure is in the builder: a river kept whole or not at all. `nearestRiver` answers by the line. The decal's red channel is a distance to the water (1 centre line, 0.5 the water's edge, 0 the end
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
