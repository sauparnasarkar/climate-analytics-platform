#!/bin/bash
# Starts the agent service with its API key read from a file, so the launchd plist never carries the key.
# launchd plists have no way to read an environment variable from a file; this wrapper does it, then execs uvicorn.
# To rotate the key, overwrite the key file: no plist or script change is needed.
#
# Reads: ANTHROPIC_KEY_FILE (required, a chmod 600 file holding only the key) and AGENT_PORT (default 8766).
# Runs from the repository this script sits in (deploy/launchd/ is two levels below the repository root).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${ANTHROPIC_KEY_FILE:?ANTHROPIC_KEY_FILE is not set}"
if [ ! -r "$ANTHROPIC_KEY_FILE" ]; then
  echo "ghg-agent-launch.sh: missing or unreadable key file: $ANTHROPIC_KEY_FILE" >&2
  exit 1
fi

export ANTHROPIC_API_KEY
ANTHROPIC_API_KEY=$(cat "$ANTHROPIC_KEY_FILE")

cd "$REPO_DIR/services/agent"
exec "$REPO_DIR/services/agent/.venv/bin/uvicorn" \
  agent.server:app --host 127.0.0.1 --port "${AGENT_PORT:-8766}" --log-config "$REPO_DIR/uvicorn-log-config.json"
