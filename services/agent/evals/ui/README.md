# UI battery

The agent's 36-case battery ([`../run_battery.py`](../run_battery.py): 5 off-topic, 5 opinion, 5 general climate,
5 boundary, 10 data query, 6 starter prompts) driven through the **real Ask page** with Playwright, instead of calling
the graph in-process. It exercises what a user actually hits: the page, the streamed `/query` response, the proxy and
Cloudflare, the admission limiter, and whichever model the admin panel has selected. Use it to compare models on the
deployed app; use `run_battery.py` to compare models without touching the deployment.

## Run

```
cd services/agent
.venv/bin/python evals/ui/analyze_ui_battery.py --export-cases evals/ui/cases.json   # cases come from run_battery.py
cd evals/ui && npm install && npx playwright install chromium
node ui_battery.mjs results/<model> [baseUrl]            # default https://degreesofcarbon.syena.io; ONLY=id1,id2 limits cases
cd ../.. && .venv/bin/python evals/ui/analyze_ui_battery.py evals/ui/results "<label>=<model>" ["<label2>=<model2>"]
```

Switch the model in the admin panel between runs (it is an in-process swap, no restart). The model is whatever the
app is serving; the runner does not choose it.

Output per model: `raw.json` (the SSE the page received, the rendered answer text, timings), `screens/<id>.png`, `run.log`;
the analyzer adds `results.json` (scored) and a side-by-side `REVIEW.md`. `results/` is gitignored.

## Things to know

- **Each case gets a fresh browser context**, so no conversation thread carries over. A pass is 36 real queries against the app:
  keep to one pass per model per hour, because the app admits 60 queries per client per hour (`limits.py`) and Cloudflare has an
  edge rule. Expect ~8 minutes on a local model.
- **The stream is tapped from inside the page** (an init script wraps `window.fetch`, which `fetchEventSource` calls). Playwright's
  `Response.text()` cannot read a long-running streamed body, so it is not used. The UI still streams as it would for a user.
- **A case waits at most 3 minutes** for its stream to finish. A dropped stream (seen once: Cloudflare cancelled one `/agent/query`)
  otherwise stalls the whole run; the case is then recorded as a UI error and the run continues.
- **The SSE `result` event carries no classification or tool list**, so both are inferred from the widgets (see the analyzer's
  docstring). The expected-tool sets are coarse: a different but valid tool shows as a FAIL to read, not a verdict.
- The "numbers not in the tool data" check treats a narrow/no-break/thin space between digits as a thousands separator
  (`2 615.5` is 2,615.5). It catches fabricated figures, not a real figure misread: **read the answers in `REVIEW.md`**.
- The runner finds the input by its accessible name, `Ask about climate emissions` (`AgentPage.tsx`'s `PromptBar`); rename it
  there and this fails at the first case.
