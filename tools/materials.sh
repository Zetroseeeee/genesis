#!/bin/sh
# What the free material libraries have, via the Materials workflow: tools/materials.sh <name> <polyhaven|ambientcg> "<query>" [limit]
#   ->  shots/peek/<name>.jpg (the previews, with names) and shots/peek/<name>.json (sizes, tags, maps)
# Poly Haven takes categories, comma separated ("terrain", "terrain,sand", "rock"); ambientCG takes search words ("grass", "forest floor").
# REF=<branch> runs the branch's own tools/ground/catalog.py.
set -eu
name="$1"; src="${2:-polyhaven}"; query="${3:-}"; limit="${4:-60}"
repo="$(node -p "require('./assets/models/models.json').repo")"
mkdir -p shots/peek; rm -f "shots/peek/$name.jpg" "shots/peek/$name.json"
before="$(gh api "repos/$repo/actions/workflows/materials.yml/runs?per_page=1" --jq '.workflow_runs[0].id // 0' 2>/dev/null || echo 0)"
gh api -X POST "repos/$repo/actions/workflows/materials.yml/dispatches" -f "ref=${REF:-main}" -f "inputs[name]=$name" -f "inputs[source]=$src" -f "inputs[query]=$query" -f "inputs[limit]=$limit" >/dev/null
run=""; for i in $(seq 1 30); do sleep 4; run="$(gh api "repos/$repo/actions/workflows/materials.yml/runs?per_page=1" --jq '.workflow_runs[0].id')"; [ "$run" != "$before" ] && break; done
for i in $(seq 1 60); do
  st="$(gh api "repos/$repo/actions/runs/$run" --jq '.status + " " + (.conclusion // "")')"
  case "$st" in completed*) echo "run $run: $st"; break;; esac
  sleep 5
done
curl -fsSL -o "shots/peek/$name.json" "https://github.com/$repo/releases/download/peek/$name.json" || echo "no list"
curl -fsSL -o "shots/peek/$name.jpg" "https://github.com/$repo/releases/download/peek/$name.jpg" && echo "shots/peek/$name.jpg" || echo "no sheet"
