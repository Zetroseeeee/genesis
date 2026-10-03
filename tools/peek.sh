#!/bin/sh
# Contact sheet of generated images, via the Peek workflow: tools/peek.sh <name> <url> [<url> ...]  ->  shots/peek/<name>.jpg
# (The workspace cannot reach the generator's CDN; GitHub can.)
set -eu
name="$1"; shift
repo="$(node -p "require('./assets/models/models.json').repo")"
gh api -X POST "repos/$repo/actions/workflows/peek.yml/dispatches" -f ref=main -f "inputs[name]=$name" -f "inputs[urls]=$*" -f "inputs[columns]=${COLS:-2}" -f "inputs[size]=${SIZE:-1024}" >/dev/null
mkdir -p shots/peek; rm -f "shots/peek/$name.jpg"
for i in $(seq 1 40); do
  sleep 5
  if curl -fsSL -o "shots/peek/$name.jpg.tmp" "https://github.com/$repo/releases/download/peek/$name.jpg" 2>/dev/null; then mv "shots/peek/$name.jpg.tmp" "shots/peek/$name.jpg"; echo "shots/peek/$name.jpg"; exit 0; fi
done
echo "peek: no sheet after 200 s" >&2; exit 1
