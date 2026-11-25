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
#   PREVIEW_LAUNCHD_PLIST  the launchd plist of the preview's own job, $HOME/Library/LaunchAgents/com.ghgemissions.preview.plist by default. When it exists,
#                      is loaded, names this checkout's climate-dashboard-react as its working directory and the same port, the script restarts
#                      that job (launchctl kickstart -k) instead of starting its own server. Any other case falls back to the pid-file server.
#                      The production job's label is refused.
#   PREVIEW_API_LAUNCHD_PLIST  the launchd plist of the preview's own API job, $HOME/Library/LaunchAgents/com.ghgemissions.previewapi.plist by default. When it
#                      exists and plainly runs THIS checkout's api/ (its label is com.ghgemissions.previewapi, its working directory is this checkout) the script
#                      restarts it after the build, so the preview's API and front end move together; the front end reaches it through API_PROXY_TARGET in the
#                      preview job's environment. Any other case leaves it alone and says so. The production API job's label is never touched.
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

# The preview may have its own API job: this checkout's api/ on its own port, reading production's data read-only, so the preview shows this checkout's API
# changes without touching production's. Restart it with the front end so the two stay in step. Used only when it is plainly that job for this checkout.
api_plist="${PREVIEW_API_LAUNCHD_PLIST:-$HOME/Library/LaunchAgents/com.ghgemissions.previewapi.plist}"
api_proxy_target=""  # set once a verified preview API job is being restarted: the front end must call it, not production's API
if [[ -f "$api_plist" ]]; then
  api_info="$(python3 - "$api_plist" <<'PY' 2>/dev/null || true
import plistlib, sys
d = plistlib.load(open(sys.argv[1], "rb"))
args = d.get("ProgramArguments", [])
port = args[args.index("--port") + 1] if "--port" in args and args.index("--port") + 1 < len(args) else ""
print(d.get("Label", ""), port, d.get("WorkingDirectory", ""), args[0] if args else "", sep="|")
PY
)"
  IFS='|' read -r api_label api_port api_dir api_exec <<< "$api_info"
  if [[ "$api_label" != "com.ghgemissions.previewapi" ]]; then
    echo "warning: $api_plist is not the preview's API job (label '${api_label:-unreadable}'); leaving it alone" >&2
  elif [[ -z "$api_port" || -z "$api_dir" || ! -d "$api_dir" || "$(cd "$api_dir" && pwd -P)" != "$(cd "$repo" && pwd -P)" ]]; then
    echo "warning: $api_label does not run this checkout (or names no --port); leaving it alone" >&2
  elif [[ "$dry" == 1 ]] || launchctl print "gui/$(id -u)/$api_label" >/dev/null 2>&1; then
    # `kickstart` restarts the definition launchd has LOADED, not the file on disk: a plist edited since it was bootstrapped still runs its old working directory,
    # possibly another checkout, and the pid and health checks below would then pass for the wrong API. So the loaded definition is verified, and when it cannot
    # be, the job is left alone (a plist's changes need the job reloaded: deploy/launchd/README.md).
    loaded_problem=""
    if [[ "$dry" != 1 ]]; then
      # One comparison of the LOADED definition (`launchctl print`) with the plist on disk, on everything this script acts on or reports: the working directory (this
      # checkout), the command (so the interpreter whose packages are checked below is the one that runs), and GHG_DATA_DIR (the data it reads). Anything that differs, or
      # that cannot be read, means the job needs reloading first.
      # The output goes in through the environment: the script itself arrives on stdin (the heredoc), so a pipe into the same stdin would be silently ignored.
      loaded_text="$(launchctl print "gui/$(id -u)/$api_label" 2>/dev/null || true)"
      loaded_problem="$(LOADED_TEXT="$loaded_text" python3 - "$api_plist" "$repo" <<'PY' 2>/dev/null || echo "its loaded definition could not be read"
import os, plistlib, re, sys
disk = plistlib.load(open(sys.argv[1], "rb"))
repo = os.path.realpath(sys.argv[2])
text = os.environ.get("LOADED_TEXT", "")


def block(name):
    m = re.search(r"^\s*" + re.escape(name) + r" = \{\n(.*?)^\s*\}", text, re.M | re.S)
    return None if m is None else [line.strip() for line in m.group(1).splitlines() if line.strip()]


wd = re.search(r"^\s*working directory = (.+)$", text, re.M)
loaded_dir = wd.group(1).strip() if wd else ""
args, env = block("arguments"), block("environment")
problems = []
if not loaded_dir or not os.path.isdir(loaded_dir) or os.path.realpath(loaded_dir) != repo:
    problems.append(f"it runs from '{loaded_dir or 'an unknown directory'}', not this checkout")
if args is None or args != [str(a) for a in disk.get("ProgramArguments", [])]:
    problems.append("its loaded command differs from the plist on disk, or could not be read")
loaded_env = dict(line.split(" => ", 1) for line in (env or []) if " => " in line)
if loaded_env.get("GHG_DATA_DIR") != disk.get("EnvironmentVariables", {}).get("GHG_DATA_DIR"):
    problems.append("its loaded GHG_DATA_DIR differs from the plist on disk")
print("; ".join(problems))
PY
)"
    fi
    if [[ -n "$loaded_problem" ]]; then
      echo "warning: the LOADED definition of $api_label is not what is expected ($loaded_problem); leaving it alone. A plist's changes need the job reloaded (deploy/launchd/README.md)" >&2
    else
    # The preview API runs in its own Python environment (not production's), so nothing here updates it; say so when it has fallen behind this checkout's pins.
    api_py="$(dirname "${api_exec:-/nonexistent/x}")/python"
    if [[ -x "$api_py" && -f "$repo/requirements.txt" ]]; then
      drift="$("$api_py" - "$repo/requirements.txt" <<'PY' 2>/dev/null || true
import re, sys
from importlib import metadata


def below(have, floor):
    """Whether `have` is below `floor`, PEP 440 aware: 4.5.11rc1 is below 4.5.11, 4.14.2.post1 is not below 4.14.2, 4.5 equals 4.5.0."""
    try:
        from packaging.version import Version
        return Version(have) < Version(floor)
    except Exception:
        pass

    def key(v):
        # The fallback PEP 440 order, used only when `packaging` cannot be imported: release numbers (trailing zeros dropped), then dev < alpha < beta < rc < final
        # with their numbers, then post-releases above the final, then a .dev build below the version it precedes.
        v = v.split("+", 1)[0]  # a local label (+cu118, +r123) never decides whether a floor is met, and its letters are not release markers
        m = re.match(r"(\d+(?:\.\d+)*)(.*)", v)
        nums = [int(x) for x in m.group(1).split(".")] if m else [0]
        while len(nums) > 1 and nums[-1] == 0:
            nums.pop()
        rest = (m.group(2) if m else "").lower()
        number = lambda g: int(g) if g else 0
        pm = re.search(r"(alpha|beta|preview|pre|rc|a|b|c)[.\-_]?(\d*)", rest)
        if pm:
            rest = rest[:pm.start()] + rest[pm.end():]  # so the "r" of "rc" is not mistaken for a post-release marker
        post = re.search(r"(?:post|rev|r)[.\-_]?(\d*)", rest)
        dev = re.search(r"dev[.\-_]?(\d*)", rest)
        rank = {"a": 0, "alpha": 0, "b": 1, "beta": 1, "c": 2, "rc": 2, "pre": 2, "preview": 2}
        pre_key = (rank[pm.group(1)], number(pm.group(2))) if pm else ((-1, 0) if dev and not post else (3, 0))
        post_key = (1, number(post.group(1))) if post else (0, 0)
        dev_key = (0, number(dev.group(1))) if dev else (1, 0)
        return nums, pre_key, post_key, dev_key

    return key(have) < key(floor)


out = []
for line in open(sys.argv[1]):
    m = re.match(r"^\s*([A-Za-z0-9_.\-]+)(?:\[[^\]]*\])?\s*(==|>=)\s*([^\s;#]+)", line)
    if not m:
        continue
    name, op, want = m.groups()
    try:
        have = metadata.version(name)
    except metadata.PackageNotFoundError:
        have = None
    behind = have is None or (have != want if op == "==" else below(have, want))
    if behind:
        out.append(f"{name} {have or 'missing'} (requirements.txt wants {'at least ' if op == '>=' else ''}{want})")
print("; ".join(out))
PY
)"
      [[ -z "$drift" ]] || echo "warning: the preview API's Python environment ($api_py) differs from requirements.txt: $drift. Install requirements.txt into that environment before relying on this preview (deploy/launchd/README.md)" >&2
    fi
    api_proxy_target="http://127.0.0.1:$api_port"
    run launchctl kickstart -k "gui/$(id -u)/$api_label"
    if [[ "$dry" == 1 ]]; then
      echo "+ curl http://127.0.0.1:$api_port/api/health until it answers"
    else
      api_up=0
      sleep 2
      for _ in $(seq 1 30); do
        # As for the front end: an answer counts only while the server on the port is the job's own process, listening on exactly the probed address. Another
        # server already holding the port would make the job fail to bind, and could still answer /api/health with a 200.
        api_pid="$(launchctl print "gui/$(id -u)/$api_label" 2>/dev/null | awk '$1 == "pid" && $2 == "=" {print $3; exit}')"
        if [[ -n "$api_pid" ]] && [[ -n "$(lsof -nP -a -p "$api_pid" -iTCP@127.0.0.1:"$api_port" -sTCP:LISTEN -t 2>/dev/null)" ]]; then
          [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$api_port/api/health" || true)" == 200 ]] && { api_up=1; break; }
        fi
        sleep 1
      done
      if [[ "$api_up" == 1 ]]; then echo "preview API restarted via $api_label (pid $api_pid), up on 127.0.0.1:$api_port (HTTP 200)"
      else echo "preview API job $api_label is not the one answering on port $api_port after the restart; see ~/Library/Logs and what holds the port (lsof -iTCP:$api_port)" >&2; exit 1; fi
    fi
    fi
  else
    echo "warning: $api_label is not loaded; leaving it alone" >&2
  fi
fi

# The preview may be a launchd job (KeepAlive, so it comes back after a reboot). Then the job, not this script, owns the port: stopping a
# server by pid would just be undone by launchd, and a second server would fail on --strictPort. Use the job only when it is plainly
# this checkout's preview; otherwise fall back to starting a server here.
job_plist="${PREVIEW_LAUNCHD_PLIST:-$HOME/Library/LaunchAgents/com.ghgemissions.preview.plist}"
job_label=""
if [[ -f "$job_plist" ]]; then
  job_info="$(python3 - "$job_plist" <<'PY' 2>/dev/null || true
import plistlib, sys
d = plistlib.load(open(sys.argv[1], "rb"))
args = d.get("ProgramArguments", [])
port = args[args.index("--port") + 1] if "--port" in args and args.index("--port") + 1 < len(args) else ""
print(d.get("Label", ""), port, "strict" if "--strictPort" in args else "", d.get("WorkingDirectory", ""), sep="|")
PY
)"
  IFS='|' read -r label_found job_port job_strict job_dir <<< "$job_info"
  if [[ -z "$label_found" ]]; then
    echo "warning: could not read $job_plist; starting a server here instead" >&2
  elif [[ "$label_found" == "com.ghgemissions.vitepreview" ]]; then
    echo "warning: $job_plist is the production front-end job; starting a server here instead" >&2
  elif [[ "$job_strict" != strict ]]; then
    echo "warning: $label_found does not pass --strictPort, so it could end up on another port; starting a server here instead" >&2
  elif [[ "$job_port" != "$port" || -z "$job_dir" || ! -d "$job_dir" || "$(cd "$job_dir" && pwd -P)" != "$(cd "$app" && pwd -P)" ]]; then
    echo "warning: $label_found does not serve this checkout on port $port; starting a server here instead" >&2
  elif [[ "$dry" == 1 ]] || launchctl print "gui/$(id -u)/$label_found" >/dev/null 2>&1; then
    job_label="$label_found"
  else
    echo "warning: $label_found is not loaded; starting a server here instead" >&2
  fi
fi

if [[ -n "$job_label" ]]; then
  if [[ -n "$api_proxy_target" ]]; then
    front_target="$(python3 -c 'import plistlib, sys; print(plistlib.load(open(sys.argv[1], "rb")).get("EnvironmentVariables", {}).get("API_PROXY_TARGET", ""))' "$job_plist" 2>/dev/null || true)"
    # The job's LOADED environment matters as much as the file: `kickstart` runs what is loaded, so a target added to the plist but never loaded still reaches production.
    loaded_front_target=""
    if [[ "$dry" != 1 ]]; then
      loaded_front_target="$(launchctl print "gui/$(id -u)/$job_label" 2>/dev/null | python3 -c 'import re, sys
t = sys.stdin.read()
m = re.search(r"^\s*environment = \{\n(.*?)^\s*\}", t, re.M | re.S)
lines = m.group(1).splitlines() if m else []
print(next((l.split(" => ", 1)[1].strip() for l in lines if l.strip().startswith("API_PROXY_TARGET =>")), ""))' 2>/dev/null || true)"
    fi
    if [[ "$front_target" != "$api_proxy_target" || ( "$dry" != 1 && "$loaded_front_target" != "$api_proxy_target" ) ]]; then
      echo "warning: $job_label does not have API_PROXY_TARGET=$api_proxy_target (plist: '${front_target:-unset}'; loaded: '${loaded_front_target:-unset}'), so the preview front end will still call production's API; set it and reload the job (deploy/launchd/README.md)" >&2
    fi
  fi
  run launchctl kickstart -k "gui/$(id -u)/$job_label"
  if [[ "$dry" == 1 ]]; then
    echo "+ curl http://127.0.0.1:$port/ until it answers"
  else
    sleep 2
    for _ in $(seq 1 30); do
      # An answer only counts while the server on the port is the job's own process: with the port taken by something else,
      # the job fails to bind (--strictPort) and that other server may still answer 200.
      job_pid="$(launchctl print "gui/$(id -u)/$job_label" 2>/dev/null | awk '$1 == "pid" && $2 == "=" {print $3; exit}')"
      # The address matters as much as the pid: the probe below goes to 127.0.0.1, so the job must be listening on exactly that.
      if [[ -n "$job_pid" ]] && [[ -n "$(lsof -nP -a -p "$job_pid" -iTCP@127.0.0.1:"$port" -sTCP:LISTEN -t 2>/dev/null)" ]]; then
        code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/" || true)"
        [[ "$code" == 200 ]] && { echo "preview restarted via $job_label (pid $job_pid), up on 127.0.0.1:$port (HTTP 200)"; exit 0; }
      fi
      sleep 1
    done
    echo "preview job $job_label is not the one answering on port $port after the restart; see ~/Library/Logs and what holds the port (lsof -iTCP:$port)" >&2
    exit 1
  fi
  exit 0
fi

# A preview API job is configured but was not restarted and verified above (not this checkout's, not loaded as its plist says, not loaded at all): a front end started
# here has no target to give, so it would call PRODUCTION's API, even if the preview this replaces was using the preview API. Say so rather than switch silently.
if [[ -f "$api_plist" && -z "$api_proxy_target" ]]; then
  echo "warning: a preview API job is configured ($api_plist) but was not restarted and verified above, so the front end started here will call PRODUCTION's API" >&2
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
  echo "+ PREVIEW_NOINDEX=1 ${api_proxy_target:+API_PROXY_TARGET=$api_proxy_target }nohup $app/node_modules/.bin/vite preview --port $port --strictPort --host 127.0.0.1 > $state/preview.log 2>&1 &"
  echo "+ curl http://127.0.0.1:$port/ until it answers"
else
  # The server is started directly (not through npx), so the pid kept is the server's own and a later run can find and stop it.
  (
    cd "$app"
    # The proxy target travels with the server started here too: the job's own plist is not in play on this path, and without it the front end would call production's API.
    env PREVIEW_NOINDEX=1 ${api_proxy_target:+"API_PROXY_TARGET=$api_proxy_target"} nohup "$app/node_modules/.bin/vite" preview --port "$port" --strictPort --host 127.0.0.1 > "$state/preview.log" 2>&1 &
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
