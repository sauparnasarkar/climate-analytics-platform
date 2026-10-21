#!/bin/bash
# Fills in the placeholders of the launchd templates in this folder and writes the result to an output folder.
# It never installs or loads anything: copy the files you want into ~/Library/LaunchAgents yourself (see README.md).
#
# Usage:  REPO_DIR=... CF_ACCESS_TEAM_DOMAIN=... CF_ACCESS_AUD=... ANTHROPIC_KEY_FILE=... \
#         LLM_PROVIDER=... LOCAL_LLM_MODEL=... NTFY_TOPIC_FILE=... TUNNEL_TOKEN_FILE=... deploy/launchd/render.sh [output-folder]
# Optional: LABEL_SUFFIX (appended to every label and log name, for a side-by-side trial), API_PORT, MCP_PORT, AGENT_PORT, WEB_PORT.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="${1:-$here/rendered}"
: "${REPO_DIR:?}" "${CF_ACCESS_TEAM_DOMAIN:?}" "${CF_ACCESS_AUD:?}" "${ANTHROPIC_KEY_FILE:?}" "${LLM_PROVIDER:?}" "${LOCAL_LLM_MODEL:?}" "${NTFY_TOPIC_FILE:?}" "${TUNNEL_TOKEN_FILE:?}"
LABEL_SUFFIX="${LABEL_SUFFIX:-}"; API_PORT="${API_PORT:-8081}"; MCP_PORT="${MCP_PORT:-8765}"; AGENT_PORT="${AGENT_PORT:-8766}"; WEB_PORT="${WEB_PORT:-4173}"

mkdir -p "$out"
for template in "$here"/*.plist; do
  target="$out/$(basename "$template")"
  sed -e "s|__REPO_DIR__|$REPO_DIR|g" -e "s|__HOME__|$HOME|g" \
      -e "s|__LABEL_SUFFIX__|$LABEL_SUFFIX|g" \
      -e "s|__API_PORT__|$API_PORT|g" -e "s|__MCP_PORT__|$MCP_PORT|g" -e "s|__AGENT_PORT__|$AGENT_PORT|g" -e "s|__WEB_PORT__|$WEB_PORT|g" \
      -e "s|__CF_ACCESS_TEAM_DOMAIN__|$CF_ACCESS_TEAM_DOMAIN|g" -e "s|__CF_ACCESS_AUD__|$CF_ACCESS_AUD|g" \
      -e "s|__ANTHROPIC_KEY_FILE__|$ANTHROPIC_KEY_FILE|g" -e "s|__LLM_PROVIDER__|$LLM_PROVIDER|g" -e "s|__LOCAL_LLM_MODEL__|$LOCAL_LLM_MODEL|g" -e "s|__NTFY_TOPIC_FILE__|$NTFY_TOPIC_FILE|g" \
      -e "s|__TUNNEL_TOKEN_FILE__|$TUNNEL_TOKEN_FILE|g" "$template" > "$target"
  if grep -q "__[A-Z_]*__" "$target"; then echo "unfilled placeholder in $target" >&2; exit 1; fi
  if command -v plutil >/dev/null 2>&1; then plutil -lint "$target" >/dev/null; fi
  echo "wrote $target"
done
