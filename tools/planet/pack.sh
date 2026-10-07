#!/bin/sh
# Runs the Planet workflow on GitHub (NASA's servers are out of reach from here) and brings back what it says:
#   MODE=probe tools/planet/pack.sh [args]      looks at the sources (shots/peek/planet_probe.log, planet_probe.jpg)
#   MODE=imagery tools/planet/pack.sh [args]    makes the picture of the Earth (tools/planet/imagery.py; its header says what it is told)
# REF=<branch> runs that branch's tools. TAG=<release> keeps the result elsewhere than in "planet". RUN=<id> waits for a
# run already started. What a run made stays in the release; tools/planet/fetch.mjs brings the game's packs into data/.
set -eu
repo="$(node -p "require('./assets/models/models.json').repo")"; tag="${TAG:-planet}"; mode="${MODE:-probe}"
run="${RUN:-}"
if [ -z "$run" ]; then
  before="$(gh api "repos/$repo/actions/workflows/planet.yml/runs?per_page=1" --jq '.workflow_runs[0].id // 0' 2>/dev/null || echo 0)"
  gh api -X POST "repos/$repo/actions/workflows/planet.yml/dispatches" -f "ref=${REF:-main}" -f "inputs[tag]=$tag" -f "inputs[mode]=$mode" -f "inputs[args]=$*" >/dev/null
  for i in $(seq 1 30); do sleep 4; run="$(gh api "repos/$repo/actions/workflows/planet.yml/runs?per_page=1" --jq '.workflow_runs[0].id')"; [ "$run" != "$before" ] && break; done
fi
echo "run $run"
st=""; for i in $(seq 1 ${WAIT:-900}); do
  st="$(gh api "repos/$repo/actions/runs/$run" --jq '.status + " " + (.conclusion // "")')"
  case "$st" in completed*) echo "run $run: $st"; break;; esac
  sleep 10
done
mkdir -p shots/peek
curl -fsSL -o "shots/peek/planet_$mode.log" "https://github.com/$repo/releases/download/$tag/planet_$mode.log" || echo "no log"
tail -${TAIL:-60} "shots/peek/planet_$mode.log" 2>/dev/null | cut -c1-${COLS:-240}
for f in ${PICS:-planet_$mode.jpg}; do curl -fsSL -o "shots/peek/$f" "https://github.com/$repo/releases/download/$tag/$f" 2>/dev/null && echo "shots/peek/$f" || true; done
case "$st" in "completed success") ;; *) echo "run $run did not end well ($st)" >&2; exit 1;; esac
