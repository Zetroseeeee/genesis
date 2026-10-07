#!/bin/sh
# Makes the water's edge on GitHub (the Water workflow) and brings it here: tools/water/pack.sh
#   ->  data/w/ (index.json and the packs); shots/peek/water_sheet.jpg and water_build.log to look at
# REF=<branch> runs that branch's builder. BBOX=lon0,lat0,lon1,lat1 or ONLY=7/36/4,7/31/8 makes some blocks only (a trial:
# it comes here as it is, and is not the game's pack). MODE=probe only looks at the source. SHEET="36,4 31,8": blocks for the picture.
# The whole Earth takes about an hour; it is kept under the name of the builder that made it, so a branch's pack changes
# nothing for the game that is out.
set -eu
repo="$(node -p "require('./assets/models/models.json').repo")"; tag="${TAG:-water}"
run="${RUN:-}"      # (RUN=<id>: wait for a run already started, and fetch what it made)
if [ -z "$run" ]; then
  before="$(gh api "repos/$repo/actions/workflows/water.yml/runs?per_page=1" --jq '.workflow_runs[0].id // 0' 2>/dev/null || echo 0)"
  gh api -X POST "repos/$repo/actions/workflows/water.yml/dispatches" -f "ref=${REF:-main}" -f "inputs[tag]=$tag" -f "inputs[mode]=${MODE:-build}" -f "inputs[bbox]=${BBOX:-}" -f "inputs[only]=${ONLY:-}" -f "inputs[sheet]=${SHEET:-}" >/dev/null
  for i in $(seq 1 30); do sleep 4; run="$(gh api "repos/$repo/actions/workflows/water.yml/runs?per_page=1" --jq '.workflow_runs[0].id')"; [ "$run" != "$before" ] && break; done
fi
echo "run $run"
st=""; for i in $(seq 1 ${WAIT:-900}); do
  st="$(gh api "repos/$repo/actions/runs/$run" --jq '.status + " " + (.conclusion // "")')"
  case "$st" in completed*) echo "run $run: $st"; break;; esac
  sleep 10
done
mkdir -p shots/peek
curl -fsSL -o shots/peek/water_build.log "https://github.com/$repo/releases/download/$tag/water_build.log" || echo "no log"
tail -40 shots/peek/water_build.log 2>/dev/null | cut -c1-220
case "$st" in "completed success") ;; *) echo "run $run made nothing ($st)" >&2; exit 1;; esac
[ "${MODE:-build}" = "probe" ] && exit 0
curl -fsSL -o shots/peek/water_sheet.jpg "https://github.com/$repo/releases/download/$tag/water_sheet.jpg" || echo "no sheet"
if [ -n "${BBOX:-}${ONLY:-}" ]; then TAG="$tag" PART=1 node tools/water/fetch.mjs; else TAG="$tag" FRESH=1 node tools/water/fetch.mjs; fi
