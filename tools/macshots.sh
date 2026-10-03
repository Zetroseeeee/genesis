#!/bin/sh
# Pictures of this commit on a real Apple GPU, via the Scenes workflow: tools/macshots.sh [scene names ...]
# (no names = the whole tour, tools/scenes/tour.txt). Pictures land in shots/mac/<name>.png, frame rates in shots/mac/scenes.log.
set -eu
repo="$(node -p "require('./assets/models/models.json').repo")"
before="$(gh api "repos/$repo/actions/workflows/scenes.yml/runs?per_page=1" --jq '.workflow_runs[0].id // 0' 2>/dev/null || echo 0)"
gh api -X POST "repos/$repo/actions/workflows/scenes.yml/dispatches" -f ref=main -f "inputs[only]=$*" >/dev/null
echo "dispatched; waiting for the build Mac"
run=""; for i in $(seq 1 30); do sleep 5; run="$(gh api "repos/$repo/actions/workflows/scenes.yml/runs?per_page=1" --jq '.workflow_runs[0].id')"; [ "$run" != "$before" ] && break; done
for i in $(seq 1 ${WAIT:-110}); do
  st="$(gh api "repos/$repo/actions/runs/$run" --jq '.status + " " + (.conclusion // "")')"
  case "$st" in completed*) echo "run $run: $st"; break;; esac
  sleep 30
done
mkdir -p shots/mac
curl -fsSL -o shots/mac/scenes.log "https://github.com/$repo/releases/download/scenes/scenes.log" || true
names="$*"; [ -z "$names" ] && names="$(grep -v '^#' tools/scenes/tour.txt | cut -d'|' -f1 | xargs)"
for n in $names; do curl -fsSL -o "shots/mac/$n.png" "https://github.com/$repo/releases/download/scenes/scene-$n.png" && echo "shots/mac/$n.png" || echo "no picture for $n"; done
cat shots/mac/scenes.log | cut -c1-260
