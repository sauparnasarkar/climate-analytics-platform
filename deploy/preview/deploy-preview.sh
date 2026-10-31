#!/usr/bin/env bash
# Rebuilds and restarts a preview of the front end from this checkout. It is not the production job: it listens on its own
# port, never touches the launchd jobs, and leaves the data and the three back-end services alone (the preview talks to
# the ones already running on this machine, through the proxy settings in vite.config.ts).
#
# Run it on the machine that hosts the preview, from a clone of this repository:
#   deploy/preview/deploy-preview.sh
# Steps: fast-forward the checkout, put the design system at the commit in climate-dashboard-react/syena-design-system.pin
# (scripts/setup-design-system.sh), npm ci, build with DEPLOY_BASE_PATH=/, stop the preview this script started before, start it.
#
# Settings (environment):
#   PREVIEW_PORT       port to listen on, 4273 by default; 4173 is the production front end's and is refused
#   PREVIEW_STATE_DIR  where the pid file and the build and server logs go, $HOME/.climate-preview by default
#   SITE_ORIGIN        the preview's own public origin, https://degreesofcarbon-preview.syena.io by default: the build writes it into the page's
#                      og:url, og:image and twitter:image, so a link to the preview shows the preview's own card
#   NODE_BIN_DIR       a folder with node and npm, put first on PATH when set
#   NO_PULL=1          skip the git step (deploy what is checked out)
#   SYN_DS_PATH        where the design system checkout lives; read by the setup script, vite (the build and the dev server) and vitest.
#                      Not by the type check: tsc -b, which `npm run build` runs first, reads fixed ../../syena-design-system paths from
#                      tsconfig.app.json and tsconfig.test.json, so the build needs the design system at that sibling position whatever this says.
#   DRY_RUN=1          print each step as "+ ..." and run nothing
#   PRODUCTION_FRONTEND_PLIST  the launchd plist of the production front-end job, $HOME/Library/LaunchAgents/com.ghgemissions.vitepreview.plist by default;
#                      the script refuses to run in the folder that plist names as its working directory (see the guard below)
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
app="$repo/climate-dashboard-react"
port="${PREVIEW_PORT:-4273}"
state="${PREVIEW_STATE_DIR:-$HOME/.climate-preview}"
dry="${DRY_RUN:-0}"
site_origin="${SITE_ORIGIN:-https://degreesofcarbon-preview.syena.io}"

if [[ "$port" == "4173" ]]; then
  echo "refusing: port 4173 is the production front end's; set PREVIEW_PORT to another port" >&2
  exit 2
fi
[[ -z "${NODE_BIN_DIR:-}" ]] || export PATH="$NODE_BIN_DIR:$PATH"

# The production front-end job serves climate-dashboard-react/dist of the checkout its plist names, and this script rebuilds dist/:
# run in that checkout it would replace what production serves. Refuse, and say where to run it instead. A machine with no such plist
# (a laptop, a fresh clone before the jobs exist) has nothing to guard; a plist that cannot be read does not block, but is said out loud.
prod_plist="${PRODUCTION_FRONTEND_PLIST:-$HOME/Library/LaunchAgents/com.ghgemissions.vitepreview.plist}"
if [[ -f "$prod_plist" ]]; then
  if ! prod_dir="$(python3 -c 'import plistlib, sys; print(plistlib.load(open(sys.argv[1], "rb")).get("WorkingDirectory", ""))' "$prod_plist" 2>/dev/null)"; then
    echo "warning: could not read $prod_plist; the production-folder guard did not run" >&2
    prod_dir=""
  fi
  if [[ -n "$prod_dir" && -d "$prod_dir" && "$(cd "$prod_dir" && pwd -P)" == "$(cd "$app" && pwd -P)" ]]; then
    echo "refusing: $app is the folder the production front-end job serves (named by $prod_plist); a preview rebuild here would change production. Run the preview from a separate clone." >&2
    exit 2
  fi
fi

run() { if [[ "$dry" == 1 ]]; then echo "+ $*"; else "$@"; fi; }
say() { if [[ "$dry" == 1 ]]; then echo "+ $*"; else echo "$*"; fi; }

[[ "${NO_PULL:-0}" == 1 ]] || run git -C "$repo" pull --ff-only
run "$app/scripts/setup-design-system.sh"
(cd "$app" && run npm ci)
[[ "$dry" == 1 ]] || mkdir -p "$state"
if [[ "$dry" == 1 ]]; then
  (cd "$app" && run env DEPLOY_BASE_PATH=/ SITE_ORIGIN="$site_origin" npm run build)
else
  (cd "$app" && DEPLOY_BASE_PATH=/ SITE_ORIGIN="$site_origin" npm run build) > "$state/build.log" 2>&1 || { echo "build failed; see $state/build.log" >&2; exit 1; }
  echo "build ok"
fi

# Stop the preview this script started earlier, and only that: the pid must still belong to a vite server on this port.
if [[ "$dry" == 1 ]]; then
  echo "+ kill the process in $state/preview.pid if it is a vite server on --port $port"
elif [[ -f "$state/preview.pid" ]]; then
  old="$(cat "$state/preview.pid")"
  if ps -p "$old" -o command= 2>/dev/null | grep -q -- "node_modules/.bin/vite preview.*--port $port"; then
    kill "$old"
    sleep 2
  fi
fi

if [[ "$dry" == 1 ]]; then
  echo "+ PREVIEW_NOINDEX=1 nohup $app/node_modules/.bin/vite preview --port $port --strictPort --host 127.0.0.1 > $state/preview.log 2>&1 &"
  echo "+ curl http://127.0.0.1:$port/ until it answers"
else
  # The server is started directly (not through npx), so the pid kept is the server's own and a later run can find and stop it.
  (
    cd "$app"
    PREVIEW_NOINDEX=1 nohup "$app/node_modules/.bin/vite" preview --port "$port" --strictPort --host 127.0.0.1 > "$state/preview.log" 2>&1 &
    echo $! > "$state/preview.pid"
  )
  pid="$(cat "$state/preview.pid")"
  sleep 2 # a server that cannot bind its port exits at once; give it the moment it needs before an answer is believed
  for _ in $(seq 1 30); do
    # An answer only counts while the server started here is still running: with the port taken, something else may be answering.
    kill -0 "$pid" 2>/dev/null || { echo "preview exited at start; see $state/preview.log" >&2; exit 1; }
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/" || true)"
    [[ "$code" == 200 ]] && { echo "preview up on 127.0.0.1:$port (HTTP 200)"; exit 0; }
    sleep 1
  done
  echo "preview did not answer on port $port; see $state/preview.log" >&2
  exit 1
fi
