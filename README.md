# GENESIS

A god-game on the real Earth. Every civilisation starts in 10,000 BC and runs itself (WorldBox-style); you take one
people and run it — pick where to settle, what to build, when to fight — and watch the planet fill up from orbit
down to a single street.

**Status:** playable prototype (v10). The target is a downloadable desktop game for high-end Macs.

## Run it

```bash
npm install
npm run fetch        # brings what is not kept in the repository: the picture of the Earth, the water's edge, the ground's materials, the models and art
npm run build        # assembles dist/
npm start            # opens the game in its desktop window (Electron)
```

Downloadable builds are attached to this repository's [Releases](../../releases).

## Layout

| Path | What lives there |
| --- | --- |
| `src/` | The game: simulation, globe and terrain renderer, towns, buildings, UI |
| `data/` | World data: elevation, rivers, climate, vegetation; fetched into it: the picture of the Earth (`i/`), the water's edge (`w/`), textures, models |
| `assets/` | Asset pipeline: manifests and job records for generated textures and 3D models |
| `desktop/` | The desktop shell (Electron) and asset downloader |
| `tools/` | Build script, test suites, screenshot and debug harnesses |
| `docs/` | Testing guide and design notes |

See `CLAUDE.md` for the architecture and the working conventions.
