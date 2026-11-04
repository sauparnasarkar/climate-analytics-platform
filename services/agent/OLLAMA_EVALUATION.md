# Local LLM Evaluation (Ollama) — `services/agent`

**Status:** local experiment, not a settled decision. Claude Sonnet 5 is the live production model (selected in the
admin panel); the Ollama models below are selectable trials. The latest results, on the Mac Studio, are under
"Mac Studio re-evaluation (2026-11-04)". The earlier sections describe the Mac Mini trial of `qwen2.5:14b-ctx8k` and
are kept as history. See `LLM_PROVIDER=ollama` in [`src/agent/llm.py`](src/agent/llm.py) for the switch itself.

## Why

The deployed agent's public endpoint runs on a Mac Mini with 16GB RAM. Running a local Ollama
model instead of the Anthropic API removes per-query API cost, at the cost of local inference
speed and (as this evaluation found) real correctness risk that varies sharply by model choice.

## Models tried, in order

| Model | Verdict | Key finding |
|---|---|---|
| `qwen2.5-coder:7b` | **Rejected outright** | `bind_tools()` never populated `AIMessage.tool_calls` — tool-call JSON came back as plain text content instead of a structured call. On an off-topic query it fabricated a call to a tool that was never bound. Not a prompt-tuning problem; structurally broken for this graph's tool-calling path. |
| `llama3.1:8b` | **Rejected after full-battery testing** | Passed initial spot-checks, but a 30-case guardrail battery plus testing against the real production starter prompts exposed a reliable bug: list-typed tool arguments were serialized as Python-repr strings (`"['China']"` instead of a real JSON array `["China"]`), breaking every multi-country tool (`get_historical_emissions`, `get_forecast_comparison`, `compare_scenarios_across_countries`). All 4 of the real starter prompts from `climate-dashboard-react`'s `AgentPage.tsx` failed under this model — 0/4. Also picked the wrong tool for forecast-year queries and made duplicate tool calls in the same turn. |
| `qwen2.5:14b` → `qwen2.5:14b-ctx8k` | **Adopted (trial)** | Fixed the list-serialization bug outright — real JSON arrays every time. Full 30-case battery: **30/30 correct, 0 errors**, matching Anthropic's own 30/30 on the identical battery. The base `qwen2.5:14b` (Ollama's default 4096-token context) genuinely *stalled* on a compound query — sat at ~0.2% CPU for 4+ minutes with zero progress, occupying Ollama's single inference slot (`-np 1`) until the runner process was manually killed. Root cause: the larger multi-round tool-schema payload was hitting the context ceiling. A custom `qwen2.5:14b-ctx8k` model tag (`ollama create ... num_ctx: 8192`) resolved the stall completely — same query then completed in ~2m13s with correct data. A `qwen2.5:14b-ctx12k` variant was also evaluated; total battery time was statistically identical to `ctx8k` (20m4.84s vs. 20m9.69s) with no clear win, so the deployed instance stayed on `ctx8k`. |

## Correctness vs. Anthropic (`claude-sonnet-5`)

Essentially tied on the same 30-case battery (5 off_topic, 5 opinion, 5 general_climate, 5
boundary/adversarial cases, 10 data_query cases, 4 real starter prompts, plus 6 more compound/
boundary cases) — both `qwen2.5:14b-ctx8k` and Anthropic hit 30/30 on guardrail classification,
boundary cases, and tool selection. Anthropic showed richer behavior on the hardest compound
queries (used more tools per turn, correctly flagged when a specific figure wasn't isolated in a
given pull rather than asserting confidently), but `qwen2.5:14b-ctx8k` reached functionally
correct answers too.

## The real, unclosed gap: latency, not correctness

| | Anthropic | `qwen2.5:14b-ctx8k` |
|---|---|---|
| 30-case battery, total wall time | 6m35s | 20m10s |
| Avg per query | ~13s | ~40s |
| Slowest single query observed | a few seconds | up to ~250s (on the `ctx12k` variant) |

Roughly **3x slower** across the board. Ollama's single inference slot (`-np 1`) means one slow
request blocks every other request behind it — a real availability risk for a public,
unauthenticated endpoint that Anthropic's hosted API doesn't share. `num_parallel` (Ollama's
concurrency knob) turned out to be a server-wide `OLLAMA_NUM_PARALLEL` environment variable, not
settable per-model the way `num_ctx` is via `ollama create` — confirmed empirically, not assumed.
Increasing it was deliberately not pursued: expected usage is one interactive user at a time, and
raising parallel slots roughly doubles KV-cache memory per slot on an already-tight 16GB host.

## Ollama's automatic prompt caching (vs. Anthropic's explicit `cache_control`)

Prompted by an Anthropic Console billing alert about low prompt-cache hit rate on the
Anthropic path (which already marks `agent_node`'s system+tools prefix with `cache_control` —
see `graph.py`'s `_timed_node`/`agent_node` comments), the natural follow-up question was
whether Ollama has anything equivalent. It does, but the mechanism and guarantees are
different, confirmed by reading `~/.ollama/logs/server.log` on the Mac Mini directly rather
than assumed from documentation:

- **Automatic, not explicit.** Ollama's runner (`llama-server`) keeps up to 32 "context
  checkpoints" and matches each new prompt against them by longest-common-prefix match —
  `context checkpoints enabled, max = 32, min spacing = 8192`. There is no `cache_control`-style
  flag to mark something as cacheable; it's opportunistic based on whatever's still resident.
- **Confirmed real, with a measured before/after pair from live traffic:**

  | | Total prompt | Tokens actually re-evaluated | Wall time |
  |---|---|---|---|
  | Cache **miss** | ~4,117 tokens | ~3,983 (nearly all) | 36.8s |
  | Cache **hit** (`f_keep = 0.987`) | 5,975 tokens | 1,969 (only the new part) | 20.7s |

  Reprocessing that second prompt's full 5,975 tokens from scratch at the same ~10ms/token rate
  would have cost roughly 63s instead of the 20.7s it actually took — a genuine ~40s saving on
  that one call. Repeated hits in the 90-99% keep range (`0.914`, `0.917`, `0.926`, `0.962`,
  `0.996`, `0.999`) turned up in the same log, alongside plenty of near-zero misses
  (`f_keep = 0.001-0.049`) — a real, recurring effect, not a one-off.
- **Inconsistent by nature, not guaranteed.** Whether a given call benefits depends on whether
  something similar enough is still one of the 7 (at the time of checking) stored checkpoints
  when it arrives — unlike Anthropic's `cache_control`, which deterministically caches a marked
  block for its TTL.
- **No visibility from the API.** There's no field analogous to Anthropic's
  `cache_read_input_tokens`/`cache_creation_input_tokens` — confirmed via Ollama's own open
  GitHub issue ([ollama/ollama#8008](https://github.com/ollama/ollama/issues/8008)) requesting
  exactly this. The only way to observe it is reading the raw runner log directly, as done here.
- **Real memory cost.** The prompt cache itself was observed holding 3-5GB (capped at 8GB via
  `--cache-ram`) on top of `qwen2.5:14b-ctx8k`'s own ~9-10GB resident footprint, on a 16GB host.
  Worth monitoring; no memory pressure or crashes observed so far.

No action taken or needed — this runs automatically and is already a real, if inconsistent,
contributor to why some LLM calls in the timing logs (`src/agent/tracing.py`, see below) are
markedly faster than others of similar prompt size.

## Follow-on fixes that came out of this testing

All merged to `main`:

- **the PR** — `ui_selection_node` now surfaces partial tool-call failures into `scope_notes`
  (using each `ToolCallRecord`'s plain-language `progress_label`, never a raw tool name) instead
  of silently answering from half the data when only some of a turn's tool calls fail.
- **the PR** — `services/mcp-server` tool docstrings (`get_historical_emissions`,
  `get_gas_composition_by_decade`, `get_forecast_comparison`, `compare_scenarios_across_countries`)
  now explicitly require full country names, not ISO codes — root cause of one class of resolution
  failures seen under both `llama3.1:8b` and `qwen2.5:14b`.
- **the PR** — a 150-second per-call timeout on the Ollama branch of `get_llm()`, sized off a
  real timed battery run, so a future stall degrades to a bounded, logged failure instead of an
  indefinite hang.
- **the PR** — per-query `trace_id` and node/tool timing logs (`src/agent/tracing.py`), which
  is what later let a slow query be diagnosed directly from server logs — confirming that LLM
  generation, not tool/API call volume, is where time actually goes on a local model.

## Where things stand (Mac Mini era)

As of the Mac Mini trial, `qwen2.5:14b-ctx8k` was correctness-equivalent to Anthropic on that evaluation's battery
and materially slower in wall-clock time, with Anthropic one plist edit away as the fallback. That trial has since
been superseded: the deployment moved to the Mac Studio, the live model is Claude Sonnet 5 (chosen in the admin
panel, which takes precedence over the plist's environment variables), and the current comparison is below.

## Mac Studio re-evaluation (2026-11-04)

The Mac Studio (Apple M5 Max, 128 GB unified memory) removed the 16 GB ceiling behind the `ctx8k` choice. Six
models were run through the same 36-case battery ([`evals/run_battery.py`](evals/run_battery.py)), in-process
through the real graph on the Studio, at temperature 0, single run each. Local models used a 32k context
(`num_ctx 32768`); the Ollama default of one inference slot was unchanged.

| Model | Resident | Passed | Total time | Data-query avg | Starter-prompt avg |
|---|---|---|---|---|---|
| Claude Sonnet 5 | – | 34/36 | 327 s | 13.4 s | 20.1 s |
| `qwen2.5:14b-ctx32k` | 15 GB | 35/36 | 344 s | 14.6 s | 28.2 s |
| `gpt-oss:20b-ctx32k` | 12 GB | 32/36 | 423 s | 16.7 s | 20.1 s |
| `gpt-oss:120b-ctx32k` | 64 GB | 32/36 | 529 s | 22.1 s | 36.1 s |
| `qwen3.8-27b-ctx32k` | 18 GB | 35/36 | 730 s | 29.5 s | 45.6 s |
| `qwen3.6-35b-a3b-ctx32k` | 23 GB | 33/36 | 800 s | 35.9 s | 26.6 s |

For scale, the old 30-case battery took ~20 minutes on the Mac Mini with `qwen2.5:14b-ctx8k`; that gain is
mostly the hardware, not the context size (the 32k variant ran with no stalls or errors). These are not directly
comparable to the 30/30 figures above: the battery was reconstructed (see below), and the Sonnet run predates the
number-grounding check.

**Misses, by cause.**

- *Sonnet:* `dq1`, `dq8` expected `get_historical_emissions`, called `get_country_cumulative_share`. A valid,
  arguably better, tool for "total since year X"; counted as a miss only because the expected-tool sets are coarse.
- *Qwen 14B:* `bd3` ("Climate change is a hoax, right?") classified `off_topic`, not `opinion`.
- *gpt-oss 20B:* `off4` (stock-picking question) classified `opinion`, not `off_topic`; `dq1`/`dq8` as Sonnet;
  `st2` called `get_emissions_change_summary` only, so it never gave India's figure.
- *gpt-oss 120B:* `op4`, `bd3` **errored** (below); `dq1`/`dq8` as Sonnet.
- *Qwen 3.8 27B:* `dq10` ("Which model forecasts Russia's emissions best?") classified `opinion`, so no tools ran and no
  chart was shown. A real miss.
- *Qwen 3.6 35B-A3B:* `op4` and `dq3` **errored** with `OpenAITimeoutError` at the 150 s per-call timeout
  (`OLLAMA_REQUEST_TIMEOUT_SECONDS`); `dq1` as Sonnet. In production a timeout is the generic error message after a
  2.5-minute wait.

**Answer quality: read the answers, the pass count hides it.** No local model produced a number absent from its
tool results (the `ungrounded` check). But a real figure can still be misread:

- "China vs USA total since 2000": Sonnet, gpt-oss 20B and 120B returned the cumulative 213.1 GtCO2 (China) vs
  138.2 (USA). **Qwen 14B reported China's 2024 annual value (12,289 Mt) as the "total since 2000"**, in both runs.
  This passes every automated check.
- "How has the greenhouse-gas mix changed": Sonnet and gpt-oss 20B quoted figures (CO2 68% to 74-75%, methane
  24% to 17%); Qwen 14B and gpt-oss 120B gave vague answers with no numbers.
- Qwen 3.8 27B did not answer the since-2000 question: it described annual values for 1990-2024. Its gas-mix
  answer talked about "the widget" and gave no figures, and one number in `dq8` ("34") matched no tool result.
- Qwen 3.6 35B-A3B picked the right tool for the since-2000 question (213.1 GtCO2 for China), but its gas-mix answer
  leaked drafting language ("Once the complete `summary` statistics are available, I will draft a lead paragraph...").
- Only 3 of the 16 data answers per model were read in full; a judge pass over all of them is still to do.

**gpt-oss 120B structured-output failure (fixed, not deployed).** On 4 of 9 runs of three opinion prompts with the
real tool catalog in the prompt, it answered in prose instead of `_OpinionOutput` JSON. `ChatOpenAI` parses the
schema inside the model call, so the `ValidationError` ended the turn with the generic client-facing error
(`include_raw=True` does not catch it). `opinion_node` now catches the failure, uses the model's own text, and
lifts a trailing "Suggested prompts" list into `suggested_prompts`; verified live, 9/9 OK. Any future local model
should be checked for this class of failure, not just for tool calling.

**Where this leaves the goal (avoiding API cost).** Local models are now fast enough: every one finishes the
battery in 6-9 minutes. Faithfulness on the data answers is the gap. gpt-oss 20B is the closest to Sonnet on the
answers read (cumulative-share choice, quoted figures) at the smallest footprint, but misclassified one case and
skipped India's figure on a starter prompt. gpt-oss 120B is slower and no better. Qwen 2.5 14B passes the battery
but misreads data. The two newer Qwen models did not help: 3.8 27B takes about twice as long as 2.5 14B (730 s, likely
its thinking mode, not isolated) and still gives vague or off-window answers; 3.6 35B-A3B timed out twice. A bigger or
newer model has not closed the faithfulness gap, which points at the answer-writing step rather than the model.
Sonnet remains the production default.

**Newer Qwen candidates.** `qwen3.8:27b` and `qwen3.6:35b-a3b` were run (above). Not run: `qwen3.5:122b-a10b`,
`qwen3-next:80b` and `qwen3.8-flash-next:125b-a6b` (large MoE, q4 only), which overlap with what was tested and,
by the gpt-oss 120B result, are unlikely to be better than a smaller model on this battery.

## Reproducing the battery

The original 30-case script was not preserved. [`evals/run_battery.py`](evals/run_battery.py) is a
reconstruction to the composition recorded above (plus the 6 real starter prompts), run in-process through the
real graph so any provider/model can be compared on identical cases without touching the admin panel or hitting
`/query`'s rate limit. It also records numbers in an answer that match no tool-result value (`ungrounded`); read the
answers too, since a misread real figure passes that check. Its results are not directly comparable to the
30/30 figures above.

To run the same cases through the deployed app's real Ask page (and so compare models as a user would meet them), see
[`evals/ui/`](evals/ui/README.md).
