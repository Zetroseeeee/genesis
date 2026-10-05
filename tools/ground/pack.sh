#!/bin/sh
# Packs the ground's materials on GitHub (the Ground workflow) and brings the result here: tools/ground/pack.sh
#   ->  data/tex/ground.json, ground_albedo.jpg, ground_normal.jpg; shots/peek/ground_sheet.jpg and ground_build.log to look at
# REF=<branch> packs that branch's assets/ground/materials.json (the game that is out is not touched until a build is).
set -eu
repo="$(node -p "require('./assets/models/models.json').repo")"; tag="${TAG:-ground}"
run="${RUN:-}"      # (RUN=<id>: wait for a run already started, and fetch what it made)
if [ -z "$run" ]; then
  before="$(gh api "repos/$repo/actions/workflows/ground.yml/runs?per_page=1" --jq '.workflow_runs[0].id // 0' 2>/dev/null || echo 0)"
  gh api -X POST "repos/$repo/actions/workflows/ground.yml/dispatches" -f "ref=${REF:-main}" -f "inputs[tag]=$tag" >/dev/null
  for i in $(seq 1 30); do sleep 4; run="$(gh api "repos/$repo/actions/workflows/ground.yml/runs?per_page=1" --jq '.workflow_runs[0].id')"; [ "$run" != "$before" ] && break; done
fi
st=""; for i in $(seq 1 ${WAIT:-150}); do
  st="$(gh api "repos/$repo/actions/runs/$run" --jq '.status + " " + (.conclusion // "")')"
  case "$st" in completed*) echo "run $run: $st"; break;; esac
  sleep 6
done
# (only a pack that was really made is brought here: what lies in the release is the one before, and fetching that over a newer
#  list of materials puts the wrong ground under every name)
case "$st" in "completed success") ;; *) echo "run $run did not make a pack ($st): nothing fetched. When it has, RUN=$run tools/ground/pack.sh brings it." >&2; exit 1;; esac
mkdir -p shots/peek
for f in ground_sheet.jpg ground_try.jpg ground_build.log; do curl -fsSL -o "shots/peek/$f" "https://github.com/$repo/releases/download/$tag/$f" || echo "no $f"; done
cat shots/peek/ground_build.log 2>/dev/null | cut -c1-200
TAG="$tag" FRESH=1 node tools/ground/fetch.mjs
