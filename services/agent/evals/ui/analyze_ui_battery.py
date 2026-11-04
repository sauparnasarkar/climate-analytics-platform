"""Scores the UI battery runs (`ui_battery.mjs`) and writes `results.json` per model plus a side-by-side `REVIEW.md`.

    cd services/agent
    .venv/bin/python evals/ui/analyze_ui_battery.py --export-cases evals/ui/cases.json      # the cases the runner reads
    .venv/bin/python evals/ui/analyze_ui_battery.py <results dir> "<label>=<subdir>" ["<label>=<subdir>" ...]

Cases, expected classifications and expected-tool sets come from `evals/run_battery.py`, so the in-process and UI batteries
cannot drift apart. Classification and tools are INFERRED from the SSE `result` event, which carries neither:
widget source_tool_call == "general_climate" -> general_climate; any other widget -> data_query (tools = the prefixes);
no widgets and text == OFF_TOPIC_RESPONSE -> off_topic; no widgets otherwise -> opinion.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from types import SimpleNamespace

AGENT_DIR = Path(__file__).resolve().parents[2]  # services/agent
sys.path.insert(0, str(AGENT_DIR / "evals"))
sys.path.insert(0, str(AGENT_DIR / "src"))

import run_battery as rb  # noqa: E402
from agent.prompts import OFF_TOPIC_RESPONSE  # noqa: E402

CASES = {c.id: c for c in rb.CASES}


def infer(widgets, text):
    sources = [w.get("source_tool_call", "") for w in widgets]
    if any(s == "general_climate" for s in sources):
        return "general_climate", []
    tools = [s.split(":", 1)[0] for s in sources if s and s != "context_reuse"]
    if tools:
        return "data_query", tools
    return ("off_topic" if text.strip() == OFF_TOPIC_RESPONSE.strip() else "opinion"), []


def _plain(s: str) -> str:
    """Markdown- and typography-insensitive form for matching raw answer text against the rendered page: link/image syntax reduced
    to its label and per-line list markers dropped, then only letters and digits kept (so headings, list markers, emphasis, backticks, quotes and the various
    spaces all fall away)."""
    s = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"(?m)^\s*(?:[-*+]|\d+[.)])\s+", "", s)  # a list marker is rendered as a bullet/number, not as text
    return re.sub(r"[\W_]+", "", s.casefold())


def answer_in_page(answer: str, ui_text: str, n: int = 40) -> bool:
    """True when the start of the answer (the first `n` letters/digits) appears in the rendered page text."""
    head = _plain(answer)[:n]
    return not head or head in _plain(ui_text)


def score(rec):
    case = CASES[rec["id"]]
    out = {k: rec.get(k) for k in ("id", "group", "prompt", "http_status", "stream_seconds", "ui_seconds", "seconds", "screenshot")}
    out["expected_cls"] = case.cls
    problems = []
    sse = rec.get("sse") or {}
    res = sse.get("result")
    if rec.get("ui_error"):
        problems.append(f"UI error: {rec['ui_error']}")
    if not res:
        problems.append(f"no result event (error event: {sse.get('error')})")
        out.update(cls=None, tools=[], answer="", widgets=[], scope_notes=[], suggested_prompts=[], ungrounded=[], progress=sse.get("progress", []), ui_text=rec.get("ui_text", ""))
    else:
        widgets, text = res.get("widgets", []), res.get("response_text", "")
        cls, tools = infer(widgets, text)
        ung = []
        if case.cls == "data_query":
            # a narrow/no-break/thin space BETWEEN digits is a thousands separator ("2\u202f615.5" is 2,615.5), not two numbers
            grouped = re.sub(r"(?<=\d)[\u202f\u00a0\u2009](?=\d)", "", text)
            ung = rb.ungrounded_numbers(grouped, [SimpleNamespace(result=w.get("props"), args={}) for w in widgets], [SimpleNamespace(summary=w.get("summary")) for w in widgets])
        out.update(cls=cls, tools=tools, answer=text, widgets=[w.get("title") for w in widgets], scope_notes=res.get("scope_notes", []),
                   suggested_prompts=res.get("suggested_prompts", []), ungrounded=ung, progress=sse.get("progress", []), ui_text=rec.get("ui_text", ""))
        if cls != case.cls:
            problems.append(f"inferred {cls}, expected {case.cls}")
        if case.cls == "data_query":
            if case.any_tool and not (case.any_tool & set(tools)):
                problems.append(f"expected one of {sorted(case.any_tool)}, widgets from {tools or 'none'}")
            if ung:
                problems.append(f"ungrounded numbers {ung}")
        elif tools:
            problems.append(f"widgets from tools on a {case.cls} query: {tools}")
        if not text.strip():
            problems.append("empty answer")
        if text.strip() and not answer_in_page(text, rec.get("ui_text", "")):
            problems.append("answer text not found in the rendered page")
    out["problems"], out["ok"] = problems, not problems
    return out


def summarize(results):
    g = lambda grp: round(sum(r["seconds"] for r in results if r["group"] == grp) / max(1, sum(1 for r in results if r["group"] == grp)), 1)
    return {"passed": sum(r["ok"] for r in results), "total_cases": len(results), "total_seconds": round(sum(r["seconds"] for r in results)),
            "slowest": max(r["seconds"] for r in results), "data_query_avg": g("data_query"), "starter_avg": g("starter"),
            "ungrounded_cases": [r["id"] for r in results if r["ungrounded"]]}


def export_cases(out: Path) -> None:
    out.write_text(json.dumps([{"id": c.id, "group": c.group, "prompt": c.prompt} for c in rb.CASES], indent=1))
    print(f"wrote {len(rb.CASES)} cases to {out}")


def main():
    if sys.argv[1:2] == ["--export-cases"]:
        export_cases(Path(sys.argv[2]))
        return
    root = Path(sys.argv[1])
    models = [a.split("=", 1) for a in sys.argv[2:]]
    scored = {}
    for label, sub in models:
        raw = json.loads((root / sub / "raw.json").read_text())
        res = [score(r) for r in raw["results"]]
        scored[label] = res
        (root / sub / "results.json").write_text(json.dumps({"summary": summarize(res), "results": res}, indent=1))
    lines = ["# UI battery review", "",
             f"36 cases driven through the real Ask page, one fresh browser context per case. Raw SSE + rendered text + screenshot per case in each model's folder (`screens/<id>.png`).", "",
             "| Model | Passed | Total (s) | Slowest (s) | Data-query avg (s) | Starter avg (s) | Cases with ungrounded numbers |", "|---|---|---|---|---|---|---|"]
    for label, res in scored.items():
        s = summarize(res)
        lines.append(f"| {label} | {s['passed']}/{s['total_cases']} | {s['total_seconds']} | {s['slowest']} | {s['data_query_avg']} | {s['starter_avg']} | {', '.join(s['ungrounded_cases']) or 'none'} |")
    lines += ["", "Automated checks are coarse (expected-tool sets, inferred classification, numbers not in tool data). **Read the answers below.**", ""]
    labels = list(scored)
    by_id = {l: {r["id"]: r for r in scored[l]} for l in labels}
    for cid, case in CASES.items():
        lines += [f"## {cid} [{case.group}] — {case.prompt}", f"*expected: {case.cls}*", ""]
        for l in labels:
            r = by_id[l].get(cid)
            if r is None:
                lines += [f"**{l}**: (not run)", ""]
                continue
            lines += [f"**{l}** — {'OK' if r['ok'] else 'FAIL'} · {r['seconds']}s · inferred `{r['cls']}` · tools {r['tools'] or '-'} · widgets {r['widgets'] or '-'}"]
            if r["problems"]:
                lines += [f"- problems: {'; '.join(r['problems'])}"]
            lines += ["", "> " + (r["answer"] or "(no answer)").strip().replace("\n", "\n> "), ""]
            if r["scope_notes"]:
                lines += [f"- scope notes: {' | '.join(r['scope_notes'])[:400]}", ""]
    (root / "REVIEW.md").write_text("\n".join(lines))
    print((root / "REVIEW.md"), len(lines), "lines")
    for l in labels:
        print(l, summarize(scored[l]))


if __name__ == "__main__":
    main()
