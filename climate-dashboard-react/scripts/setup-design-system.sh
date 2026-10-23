#!/usr/bin/env bash
# Puts the design system where the app expects it: a checkout of syena-design-system beside this repository
# (../../syena-design-system from this folder), at the commit pinned in syena-design-system.pin, with its tokens generated.
# Set SYN_DS_PATH to use a different location; this script, vite (the build) and vitest read the variable. The type check does not: tsc -b reads
# fixed ../../syena-design-system paths from tsconfig.app.json and tsconfig.test.json, so `npm run build` needs the sibling position anyway.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="${SYN_DS_PATH:-$here/../../syena-design-system}"
read -r commit url < <(grep -v '^#' "$here/syena-design-system.pin" | head -n 1)

if [[ ! -d "$dest/.git" ]]; then
  git clone "$url" "$dest"
fi
git -C "$dest" fetch --quiet origin
git -C "$dest" checkout --quiet --detach "$commit"
(cd "$dest" && npm ci && npm run tokens)
echo "design system at $(git -C "$dest" rev-parse --short HEAD), tokens generated: $dest"
