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
`window.__G` (settings, sim, terrain, world, mapcam, movers, fx, turnRun, run(n), start(lon, lat, name), select(i), labelDbg, attention(): what waits on the player, in the order the turn button lays it before him) and `testcam.js` (`__T.cam/era/capital/erupt/fire/battle/quake/flood…`; `__T.teach(c, upto)` gives a realm every discovery of its ages, `__T.era` and `__T.world` do so by themselves; `__T.quiet()` sends home whoever waits on the player and stops the realms that rule themselves from proposing anything: the suite calls it before every scenario that is not about envoys, so that the turn button is the scenario's).
`node dbg3.js "<script>" "<probe returning an object>" <wait ms>` runs a script in the page and prints the probe.
`node shot2.js <name> "<script>" <t1> <t2>` takes two screenshots (`shots/<name>_a.png`, `_b.png`).

## Textures
`src/textures.js` loads `data/tex/atlas.json` and turns the five 2048² WebP atlases (4×4 cells of 512 px: walls, roofs, ground, land use, misc) into WebGL2 texture arrays; `world.setTextures` / `terrain.setTextures` recompile the shaders with `USE_TEXARR`. Without WebGL2 or with the atlases unreachable the procedural look stays (nothing else changes). The atlases live on the Higgsfield CDN until they are pulled into `data_out/tex/` (then `atlas.json` points at local files).

The test box cannot reach the CDN, so every harness sets `window.GENESIS_TEX_URL = 'data/tex/atlas_local.json'` before the page loads: a labelled synthetic set (`data_out/tex/test_*.png`, one hue and pattern per cell, generated by the snippet in the session log) that proves the mapping — walls, roofs, streets, fields and ground each pick up their own cell. Real-texture looks are judged in the published artifact.

Asset generation and packing: `assets/manifest.json` (prompts, metres per tile), `assets/jobs.jsonl` (Higgsfield job ids), `assets/build_atlas.py` (ran in the Higgsfield sandbox: download, seam-fix by offset cross-fade sized from the measured seam, pack, resize UI art).
