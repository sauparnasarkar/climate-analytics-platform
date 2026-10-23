# `deploy/launchd/`: running the platform as launchd jobs

Templates for the jobs that run the platform on a Mac (the production host is a Mac Mini): the API, the MCP server, the
agent, the front end, the Cloudflare tunnel, and the monthly data refresh. Nothing here is installed by cloning or merging.
Every value that is specific to a machine or secret is a placeholder; `render.sh` fills them in.

| File | Label | Runs | Port |
|---|---|---|---|
| `com.ghgemissions.uvicorn.plist` | `com.ghgemissions.uvicorn` | `api.main:app` with uvicorn | `__API_PORT__` (8081) |
| `com.ghgemissions.mcpserver.plist` | `com.ghgemissions.mcpserver` | `python -m mcp_server` (Streamable HTTP) | `__MCP_PORT__` (8765) |
| `com.ghgemissions.agent.plist` | `com.ghgemissions.agent` | `ghg-agent-launch.sh`, then `agent.server:app` | `__AGENT_PORT__` (8766) |
| `com.ghgemissions.vitepreview.plist` | `com.ghgemissions.vitepreview` | `vite preview` over the built `climate-dashboard-react/dist` | `__WEB_PORT__` (4173) |
| `com.ghgemissions.cloudflared.plist` | `com.ghgemissions.cloudflared` | `cloudflared tunnel run` | none |
| `com.ghgemissions.datarefresh.plist` | `com.ghgemissions.datarefresh` | `pipeline/ops/ghg-data-refresh.sh`, monthly on day 10 at 03:30 | none |
| `ghg-agent-launch.sh` | | reads the API key from a file, then execs the agent's uvicorn | |

The refresh job runs the script **in this repository**, not from a copy: `pipeline/ops/ghg-data-refresh.sh` finds the repository
from its own location. The agent wrapper does the same.

## Placeholders

| Placeholder | Meaning | Where it comes from |
|---|---|---|
| `__REPO_DIR__` | absolute path of this repository's checkout | where you cloned it |
| `__HOME__` | the home directory of the user the jobs run as | `$HOME` |
| `__CF_ACCESS_TEAM_DOMAIN__`, `__CF_ACCESS_AUD__` | the Cloudflare Access team domain and the application audience tag that protect the admin routes. **Both are required**: without either, every admin request is refused with 403 | the Cloudflare Access application |
| `__LLM_PROVIDER__`, `__LOCAL_LLM_MODEL__` | the agent's startup provider and local model (for example `anthropic`, or `ollama` with a model name); a live admin choice, when one is stored, overrides them at runtime | you choose |
| `__ANTHROPIC_KEY_FILE__` | path of a `chmod 600` file holding only the Anthropic API key | you create it |
| `__NTFY_TOPIC_FILE__` | path of a `chmod 600` file holding only the ntfy topic the refresh job notifies | you create it |
| `__TUNNEL_TOKEN_FILE__` | path of a `chmod 600` file holding the Cloudflare tunnel token | the Cloudflare dashboard |
| `__API_PORT__`, `__MCP_PORT__`, `__AGENT_PORT__`, `__WEB_PORT__` | ports, defaults in parentheses above | `render.sh` defaults |
| `__LABEL_SUFFIX__` | appended to a label and its log names; empty for a real install | `render.sh` (for side-by-side trials) |

The three secrets (the API key, the ntfy topic and the tunnel token) live in files, never in a plist. Rotating one means
overwriting its file.

## Render, install, start

```bash
REPO_DIR=$HOME/ClaudeWorkspace/climate-analytics-platform \
CF_ACCESS_TEAM_DOMAIN=... CF_ACCESS_AUD=... \
ANTHROPIC_KEY_FILE=$HOME/.ghg-emissions-agent/anthropic-api-key \
LLM_PROVIDER=... LOCAL_LLM_MODEL=... \
NTFY_TOPIC_FILE=$HOME/.ghg-data-refresh/ntfy-topic.txt \
TUNNEL_TOKEN_FILE=$HOME/.cloudflared/tunnel-token \
  deploy/launchd/render.sh                      # writes deploy/launchd/rendered/ (gitignored) and lints each file

cp deploy/launchd/rendered/com.ghgemissions.uvicorn.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ghgemissions.uvicorn.plist
```

Start the jobs in dependency order: API, MCP server, agent, front end, then (once) the tunnel and the refresh job.
**Changing a plist's environment needs `launchctl bootout gui/$(id -u)/<label>` and `bootstrap`**, not `kickstart`, which
re-runs the already-loaded definition and keeps the old environment. Before the first start, create the three virtual
environments (the repository root, `services/mcp-server`, `services/agent`; to get the versions the running services hold, add `-c constraints/<root|mcp-server|agent>.txt` to the `pip install`), run `npm ci` and the build in
`climate-dashboard-react/` with `DEPLOY_BASE_PATH=/`, and set up the design system (see the root `README.md`).

## Trying a stack beside a running one

Set `LABEL_SUFFIX=.trial` and spare ports (for example `API_PORT=18081 MCP_PORT=18765 AGENT_PORT=18766 WEB_PORT=14173`) when
rendering. The trial jobs then have their own labels, logs and ports and can run beside the real ones. Do not render or
start a second tunnel. The front end's built-in proxy still points at the standard API and agent ports, so check the trial
backends directly with `curl` on their spare ports.

## Rollback

Keep the previous plists as `<name>.plist.pre-<date>` before replacing a live one. To go back, `bootout` the label,
restore the saved file, `bootstrap` it again, in the same dependency order.
