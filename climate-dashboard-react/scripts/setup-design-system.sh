#!/usr/bin/env bash
# Puts the design system where the app expects it: a checkout of syena-design-system beside this repository
# (../../syena-design-system from this folder), at the commit pinned in syena-design-system.pin, with its tokens generated.
# Set SYN_DS_PATH to use a different location; the build, the tests and the type check read the same variable.
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
