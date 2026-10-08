# Holocene — test suites

Two suites. Both exit 1 on any failure and print a summary line.

## 1. Headless simulation — `node test_sim.js`
Runs `src/sim.js` in node (no browser). ~4 minutes.

| section | what it checks |
|---|---|
| 1 autopilot | 12,000 years on seed 7, 4,000 on two more; invariants every 2,000 years (finite population, valid owners, era == eraOf(tech), war symmetry, bounded event/ruin lists, settlement levels), a year's speed against the machine's own (`workUnit`: the same game takes 9.9 ms a year on one box and 13.1 on the next) |
| 2 actions | every build tool, capital move, levy, rename, war/peace, all god powers, cost gating |
| 3 save/load | round trip through JSON: owners, population (log-quantised), levels, ruins, volcanoes, comet, wonder era bits, per-realm totals rebuilt by `recount()`, save < 4.5 MB |
| 4 determinism | same seed ⇒ identical worlds |
| 5 edge cases | no player, sea cells, long names, player death, ruins vs rebuilt towns, overpopulation decline |
| 6 rulers & goods | fixed goods placement, coverage, every good present, trade imports, personalities on every ruler, epithets, coveting wars, personality survives save/load, old saves still load |
| 7 construction & planner | works start, finish and apply after their years (farms, walls, harbour, temple on a chosen plot, market, academy, wonder, mine); AI realms build through the same sites; representational scale tapers; growth rings open building sites that close; works appear in the plan with progress; era waves rebuild a town over decades; works, plots and growth survive save/load |
| 8 market | the goods and recipes tables; a year's step conserves what it moves; prices answer to scarcity and stay in their bounds; trade follows the price gap and stops at an embargo; workshops grow while they pay and obey what the realm knows; customs, bans, the reserve and standing orders; the market's effect on income, stability and strength; save/load, and a world saved before the market |
| 9 knowledge | the table of discoveries (every one stands on earlier ones, an age's costs sum to its length, every gated good, craft and work has its discovery); a people's start (nothing known, 1,000 insight); study, the queue, the scholars choosing for themselves after a generation; what is learned opens land, crafts and works and nothing else does; edges against the age (a realm in step is at 1); neighbours teach; who was first; save/load, a world saved before knowledge, and its speed |
| 10 laws and government | the tables (every form and law stands on real discoveries, every field's first law asks nothing, every age opens some, the norms are measured); a new people is a band under its first laws; what it lacks and why; a reform costs authority, takes its years and comes into force; a change of form renames the realm and its ruler; names in the people's tongue; laws put power in some hands (and the page can say whose), a form's own ways cost less; estates' power sums to one, a hated law lowers content, a demand granted or refused or lapsed, a rising; stability's and the ledger's parts add up; the mills make workers harder to content, what was seized passes at a death (never the player's), a people's republic proclaimed by those who have only heard of one; the autopilot's world is sound and reforms, and is level with its age; save/load, a world saved before laws, and its speed |
| 11 diplomacy | the tables (every pact stands on a real discovery); a hand-made world of nine realms that keep still: an opinion is the sum of its reasons, what each proposal needs, gifts and their limit, a sworn peace that binds, a refusal and the wait after it, a trade agreement and closed markets on the market's own links, a claim, what a war costs with and without a reason, arms and might as two figures, a vassal beside its lord, one peace for all, the truce, terms from the score, reparations and tribute paid and received, a call to arms answered and declined, a separate peace, a demand, release, a vassal joined to the crown after six turns, rebellion, offers laid before the player and lapsing, renewal and expiry, marriage and inheritance; save/load and a world saved before diplomacy; then a world left to itself to 800 BC: realms swear, marry and stand together, vassals are made and freed, wars are begun beside friends and ended on terms, every record is sound (pacts on both sides, lords alive, tribute paid = received), and a year of diplomacy costs under 1 ms |

`ONLY=2,5 node test_sim.js` runs chosen sections. Every section's invariants also check each realm's diplomatic record. A test that sets a realm's `tech` by hand must teach it as well (`teach(sim, c)` in the file): an age without its discoveries can build and make almost nothing. The harness must load the sim with indirect eval
(`(0, eval)(src)`): a direct `eval` inside a CommonJS module makes every `Math`/typed-array lookup dynamic and the sim runs 8× slower.

## 2. Browser end-to-end — `node build.js && node test_e2e.js [filter]`
Playwright + headless Chromium on SwiftShader (software GL, so slow: ~26 minutes for all 35 scenarios; filter with `|`-separated substrings, e.g. `node test_e2e.js "disaster|labels:"`). Serves `dist/` locally, loads `local.html`, injects `testcam.js` (`__T` helpers) and records page errors, console errors and WebGL program errors per scenario. Screenshots of failures go to `shots/e2e_*.png`, the log to `shots/test_e2e.log`.

Scenarios: boot; intro (choose homeland, sea click refused, random start); turns (advance/report, Enter/stop early, war/era/disaster interrupts, continuous mode and speed keys); laws (the fields and their laws, a law's page with whose hand it strengthens, a reform begun and in force, a form's page with its ways, a chiefdom proclaimed, the estates and where their power comes from, a demand granted, the lens of government with its key and the layers' menu beside it); diplomacy (the realms within reach in their groups, a realm's page with what it thinks and why, a sworn peace proposed and agreed, a gift, a claim, war declared with its price told first, the war's page and a peace, envoys answered, the wars and the standing pages, the lens of relations with its key); city build panel (cards with cost/years/reasons, farm start, temple placement on a plot marker, queue, scaffolding at the site, completion, levy; broke/rich gating); god powers via the Powers dock; inspector (own/foreign/wild/sea, ruler card and portrait, trade row, policy sliders, stance, rename, war button); chronicle modal; menu settings persistence; save → reload → continue (+ no-save and corrupt-save handling); camera limits/pick/compass/minimap; hotkeys; labels (realms high up, towns at region height, no overlaps); goods markers; hover chip; HUD layout at 800×500 and 1920×1080; orbit→street render sweep with instance-cap and `gl.getError()` checks; six cultures draw their own towns; 30 s live run.

The game no longer changes its own graphics setting (until 0.16.1 a slow first five seconds dropped it to the light one, and it stayed there: `loadSettings` puts back any light setting that was not chosen by hand). The harnesses still set `__G.settings.qualityPinned = true` (testcam.js, shot2.js): harmless now.

Timing caveats under SwiftShader: camera flights are paced by frame `dt` (capped at 0.1 s), so tests wait for `!__G.mapcam.fly` rather than the clock; toasts are recorded with a MutationObserver because they fade before slow frames catch them.

## 3. Updates — `node tools/test_update.js`, `node tools/update/drill.js`

`tools/test_update.js` runs `desktop/updater.js` under plain Node against a feed that the build's own publishing code
(`tools/update/publish.js`) writes into a folder and a local web server hands out. It covers: the rules a list must
meet; the first build of a line (nothing shelved); an update found, fetched, put to use and kept across a restart;
an update that does not come up, undone after two tries and not offered again (and undone to the game before it,
not all the way to the app); a file whose content went back to an earlier one; files that moved; a checksum that
does not match; a line that drops part way (carried on with a Range request); server errors; a download stopped by
the player; a shelved file that is gone; lists that cannot be read; an update fetched and then applied at the next
start; a newer app installed over an updated copy; a store with a file missing; a newer list arriving while one is
waiting; a build that needs a newer shell (the whole app is fetched, resumed, checked); and, over fourteen random
builds, that every app of the line reaches the game in force with exactly its files. Exit code 1 on any failure.

`tools/update/drill.js` does the same in the real app (`--xvfb` under Electron in a checkout, `--app <Holocene.app>`
on a packed app): the shell's self-check (`--smoke` with `GENESIS_SMOKE_UPDATE=1`) takes whatever the feed offers
and reports `update.result`; `GENESIS_SMOKE_EXPECT` names the result that passes (`updated`, `current`, `undone`,
`app-required`, `nothing offered`). Environment the shell reads: `GENESIS_UPDATE_FEED` (where releases are downloaded
from), `GENESIS_UPDATE_MANIFEST` (the list's name: the build's field test uses `manifest-next.json`),
`GENESIS_USERDATA` (a folder of its own for saves and the store), `GENESIS_CONTENT` (the app's own list, for a
checkout, which has none), `GENESIS_UPDATE_GUARD` (seconds an update is given to come up).

`tools/update/walk.js` (under `xvfb-run`) clicks through what a player sees - the note on the home screen, fetching,
the restart, "What's new", the spark while playing, the case where a whole new app is needed - and keeps pictures.

## Debug hooks
`window.__G` (settings, sim, terrain, world, mapcam, movers, fx, turnRun, run(n), start(lon, lat, name), select(i), labelDbg, attention(): what waits on the player, in the order the turn button lays it before him) and `testcam.js` (`__T.cam/era/capital/erupt/fire/battle/quake/flood…`; `__T.teach(c, upto)` gives a realm every discovery of its ages, `__T.era` and `__T.world` do so by themselves; `__T.quiet()` sends home whoever waits on the player and stops the realms that rule themselves from proposing anything: the suite calls it before every scenario after the opening ones, so that the turn button is the scenario's; the diplomacy scenario then lays its own envoys before the player, and makes room for its two neighbours on the player's border if the world has closed in by then: how far the world has come when a scenario starts depends on how fast the machine draws. For the same reason the market scenario makes peace for the player first and keeps the others still (a realm at war sells nothing), and the label scenario looks at the place the player's realm is named at, with no panel open). `__T.costs()` measures what the parts of the picture cost, in the page (`__T.cost([[name, set], ...])` for a list of one's own; the frame rates are written into the picture: the tour's `cost_town`, `cost_far`, `cost_alps`), and `__T.aniso(n, textures...)` sets how many ways textures are filtered, on the card as they are.
`node dbg3.js "<script>" "<probe returning an object>" <wait ms>` runs a script in the page and prints the probe.
`node tools/live.js "<setup>" [wait]` keeps one page up and answers on port 8791 (`/eval`, `/shot`, `/load`, `/logs`, `/quit`): the way to try a look twenty times without twenty starts. `window.POST` (shade, glow, develop: 0..1; `show = 1` the shade by itself, `2` the glow; `off`; `reach`, `far`, `wide`) and `window.AIR` (`expose`, `haze` through `setHaze`, `down`, `night`, `disc`, `steps`, `on`, `clear = false` for the true air about the eye) can be turned while it runs. `GRID=1` gives a software renderer the ground's real meshes, chosen as on a real GPU (`__G.terrain.quadPx`: 4, or 0 for the finest everywhere; `stats.quads`; each drawn tile carries `grid`, `lie`, `relief`, `standPx`): slow, a frame takes seconds.
`node tools/air/sky.js check` holds the air's quick sums against exact ones; `sheet` and `orbit` draw it without the game.
The ground's shader can be changed under a live page: `curl -s 'localhost:8791/load?file=terrain.js'`, then `/eval "__T.reshade()"` hands every tile the new shaders (seconds, where a new page takes minutes; `__T.reshade({ uNew: 1 })` when the shader has a uniform the page's game was started without). `/eval "__T.reground()"` reads the ground's materials again (after `tools/ground/pack.sh` has brought a new pack). What can be turned while it runs, all in `__G.globals`: `uGndShow` (a layer's number: that material everywhere; -1: as the country has it), `uGndK` (x how strong the relief, y how much of the materials is shown over the old ground, z how far the repeats are bent, w pixels to a repeat: set every frame from `GND_PX`), `uGndT` (x how far brightness follows the photograph of the Earth, y how far hue does, z how wide the span in which one step of the ladder gives way to the next, w how ragged it is), `uGndV` (how much a meadow varies from stretch to stretch), `uGndFine` (how many steps lower the fine materials stand: near, how fast that grows, at most), `uGndCls` (which are fine), `uGndDbg` (parts left out: 1 no relief, 2 nor a second material, 3 nor any colour looked up, 4 nor the bend, 5 none of it). `TEX.ground` says what was loaded (`made`, `count`, `size`, `id`: the number of each material, `cls`). `__T.costsGround()` goes through `uGndDbg` and the ground drawn the old way and writes the frame rates into the picture, `__T.costsMesh()` does the same for how fine the ground's meshes are (`terrain.quadPx`); the tour has them as `costg_*` and `costm_*`. `GROUND=1` gives a software renderer the materials whole (it takes a quarter: at that size nothing can be said about how sharp the ground is).
The water: `__G.terrain.shoreAt(lon, lat)` (metres to the water's edge, water negative, `null` where the field's pack is not here;
then `wKind` 0 sea .. 1 fresh, `wOpen` how open the water lies, `wLevel` a lake's level or -1), `stats.packsW`, `waterOff = true`
(the coasts by the picture's mask, as before 0.21), `__G.globals.uSeaK.value` (x waves, y surf, z how clear; w = 1 no waves, 2
nothing mirrored), `uWaterK.value` (x how ragged the shore, y how wide a beach), `uSkyR.value` (the fifteen colours the water
mirrors). `__T.costsWater()` writes frame rates with its parts left out one by one. A shader that does not compile leaves the
ground undrawn and says nothing loud: ask `__G.renderer.info.programs` for those whose `diagnostics.runnable` is false.
The planet: `__G.globals.uWild.value = 0` shows the photograph as it is (today's fields and all; 1 is the country before the
plough), `__G.world.cloudsOn = false` takes the clouds away (from 300 km up they hide what is asked about), `__forest(lon, lat,
height in metres, 0, 0, season)` with a height of 60,000 to 14,000,000 looks straight down on a country, a continent, the
planet (season 0.08 is the depth of the northern winter, 0.58 of the southern; 0.24 the thaw). `__G.terrain.imgMax` is the
finest level of the picture (6), `stats.packsI` how many of its packs are here; `node tools/planet/fetch.mjs check` says
whether what lies in `data/i` is whole. A page just started takes minutes to fetch and read its packs on a software renderer:
ask nothing of it until an `/eval` answers at once, or the answers queue up behind one another and the pictures are of half
a planet.
`node tools/glerr.js "<script>" [wait ms]` says which call to the card fails (the suite's "GL error 1281" names none): every
call that can raise one is asked at once, and the first twelve are printed with their arguments, the picture last handed to the
card and where the call came from. `__T.costsPlanet()` writes frame rates with the picture looked at in fewer ways and no finer
than it used to be (`costp_*` in the tour); `__T.costsWinter()` with the shader as it is, compiled without the maps' second layer
(the rules for snow and ice the game had until 0.21) and over a second layer of the old rules' numbers, turn and turn about (`costi_*`;
`window.__costOld = 1` stops at the old rules, to see what they draw). `__T.watch()` writes into the picture, once a second, the frame rate, the packs by kind and
state and what every tile in view is drawn with (the picture, the heights and the water's edge by level): a view is whole
when nothing is loading and the levels stand still (`load_*` in the tour; on the build Mac the ground of a view from 300 km
is whole in six to nine seconds, the trees of a town in forty-five). The frame rate the smoke run reports is of the three seconds before its picture: where packs are still
arriving then it is far too low (11 for a view that holds 20) - believe the `cost*` scenes, which wait.
The packs of the water's edge lie in bundles (`data/w/<level>_b<x>_<y>.bin`; `node tools/water/fetch.mjs check` says whether
they are whole; `WATER_DIR=<folder>` tries the fetching and bundling on a copy). `__G.terrain.wBundles` are those in hand; a
drawn tile's `wPack` is `{ pack, level, rect }`, or `{ flat: 'L' | 'S' }` where its piece of the pack is nothing but land
far from a shore or open sea (the shader looks nothing up there), or null (no field: the picture's mask).
The rivers: `__G.world.decal.stats` (`rivers` drawn, `along`: pieces left to the field's own water), `nearestRiver(lon, lat)`
(`d` metres to the line, `hw` half the drawn width); `decal.rect = null` draws them again. The tour's `river_bend` (a great
river's ribbon through a bend: its banks must be smooth), `river_wide` (a river the field has in pieces beside the ribbon: one
water), `river_pool`, `lake_geneva` (a river's line runs the length of the lake: no stripe), `lake_garda`, `lake_andes`.
A software renderer's sine is rough: its tiles do not meet to the metre, and with `POST=1` the shade between things draws a
soft dark line along a tile's edge across still water (the skirt behind the gap). Not on a real card; nothing to chase here.

The trees: `__G.trees` (`modelCount`: how many of each tier stand; `imps[ti]`: a tier's kinds, each a mesh with `count` and `userData.cap`; `last[ti]`: where and when a tier was last placed, `partial` while a picture was still coming; `holes`: where the tier inside each has its trees; `slice`: milliseconds a frame for placing, `1e9` on a software renderer; `buildTier(ti, cam, now)` places one at once, for measuring; `coverOff`: cut-outs' edges pixel by pixel). `__T.costsTrees()` writes into the picture what the frame rate is with all of them, without what grows under them, without the far ones, without any (the tour's `costt_*`: in a wood the trees are cheaper than the ground they hide). `TREES=1` gives a software renderer whole forests. The tour's woods: `woods`, `woods_edge`, `taiga_shore`, `maquis`, `jungle` from low down, `woods_high` and `woods_top` from 3 and 5 km (the trees round the eye must not show as a plate, nor the tiers' meeting as a circle); water from low down: `lake_low`, `coast_low` (a software renderer weighs texels finely: what a real card makes of the magnified water mask can only be seen there); `high_town`, a town on a high plain.
`node shot2.js <name> "<script>" <t1> <t2>` takes two screenshots (`shots/<name>_a.png`, `_b.png`).

## Textures
`src/textures.js` loads `data/tex/atlas.json` and turns the five 2048² WebP atlases (4×4 cells of 512 px: walls, roofs, ground, land use, misc) into WebGL2 texture arrays; `world.setTextures` / `terrain.setTextures` recompile the shaders with `USE_TEXARR`. Without WebGL2 or with the atlases unreachable the procedural look stays (nothing else changes). The atlases live on the Higgsfield CDN until they are pulled into `data_out/tex/` (then `atlas.json` points at local files).

The ground's own materials are a second set (`TEX.ground`): the manifest's `pack` names a list (`data/tex/ground.json`, made by the Ground workflow from `assets/ground/materials.json`) with two atlases beside it, fetched by `npm run fetch` (`tools/ground/fetch.mjs`) and never committed. `terrain.setTextures` then compiles the ground's shader with `USE_GROUND`; without the pack the ground is drawn as before it. `atlas_local.json` names the pack too, so the suite runs on the shader the game ships with (a software renderer takes the materials at a quarter size: `GROUND=<n>` for another).

The test box cannot reach the CDN, so every harness sets `window.GENESIS_TEX_URL = 'data/tex/atlas_local.json'` before the page loads: a labelled synthetic set (`data_out/tex/test_*.png`, one hue and pattern per cell, generated by the snippet in the session log) that proves the mapping — walls, roofs, streets, fields and ground each pick up their own cell. Real-texture looks are judged in the published artifact.

Asset generation and packing: `assets/manifest.json` (prompts, metres per tile), `assets/jobs.jsonl` (Higgsfield job ids), `assets/build_atlas.py` (ran in the Higgsfield sandbox: download, seam-fix by offset cross-fade sized from the measured seam, pack, resize UI art).
