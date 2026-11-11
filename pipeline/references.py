"""External reference values (SPEC.md §5.35): the one registry, `pipeline/references.json`, and the monthly checks on it.

The values -- the IPCC AR6 TCRE range, the Paris temperature goals -- come from dated publications, not data sources, so they are versioned
(edition, `review_by`, successor) rather than refreshed. Stages read them through `ar6_tcre()` / `paris_goals()`; a malformed registry raises
`RegistryError`, which fails the stage that needs it (its last good output is left untouched), never a silent default.

The `references` stage of `pipeline.run` checks, without failing the refresh:
- an entry past its `review_by` date is a deviation (a long, edition-based backstop);
- the reference-search routine's heartbeat -- its last comment on the pinned tracking issue, read unauthenticated from the public repository --
  older than `max_age_days` is a deviation, and so is not being able to reach GitHub. Before the routine exists (`issue` null) it is only noted.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import urllib.request
from functools import lru_cache

from .common import ROOT, USER_AGENT, RunReport

REFERENCES_PATH = os.path.join(ROOT, "pipeline", "references.json")
REQUIRED = ("values", "unit", "citation", "edition", "published", "what_it_is", "what_it_is_not", "review_by", "successor")
GITHUB_API = "https://api.github.com"


class RegistryError(ValueError):
    """The registry is missing, unreadable or has an entry without a required field or with an invalid date."""


def _date(value, where: str) -> dt.date:
    try:
        return dt.date.fromisoformat(value)
    except (TypeError, ValueError):
        raise RegistryError(f"{where}: not an ISO date: {value!r}") from None


def validate(doc) -> dict:
    if not isinstance(doc, dict) or not isinstance(doc.get("references"), dict) or not doc["references"]:
        raise RegistryError("references.json: no 'references' object")
    for rid, e in doc["references"].items():
        if not isinstance(e, dict):
            raise RegistryError(f"references.json: {rid} is not an object")
        missing = [k for k in REQUIRED if e.get(k) in (None, "", [], {})]
        if missing:
            raise RegistryError(f"references.json: {rid} is missing {', '.join(missing)}")
        _date(e["published"], f"{rid}.published")
        _date(e["review_by"], f"{rid}.review_by")
    hb = doc.get("heartbeat")
    if not isinstance(hb, dict) or not hb.get("repo") or not isinstance(hb.get("max_age_days"), int) or hb["max_age_days"] < 1:
        raise RegistryError("references.json: heartbeat needs 'repo' and a positive integer 'max_age_days'")
    if hb.get("issue") is not None and (not isinstance(hb["issue"], int) or hb["issue"] < 1):
        raise RegistryError("references.json: heartbeat.issue must be null or an issue number")
    return doc


@lru_cache(maxsize=None)
def _load_cached(path: str, mtime: float) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


def load(path: str | None = None) -> dict:
    path = path or REFERENCES_PATH
    try:
        text = _load_cached(path, os.path.getmtime(path))
        doc = json.loads(text)
    except (OSError, ValueError) as e:
        raise RegistryError(f"references.json unreadable: {type(e).__name__}: {e}") from None
    return validate(doc)


def entry(rid: str, path: str | None = None) -> dict:
    refs = load(path)["references"]
    if rid not in refs:
        raise RegistryError(f"references.json: no entry {rid!r}")
    return refs[rid]


def ar6_tcre(path: str | None = None) -> dict:
    """The AR6 TCRE range in the shape `correlation.py` has always published as `ar6_reference`, plus its edition."""
    e = entry("ipcc_ar6_tcre", path)
    v = e["values"]
    lo, hi = v.get("likely_range") or [None, None]
    if not (isinstance(v.get("best_estimate"), (int, float)) and isinstance(lo, (int, float)) and isinstance(hi, (int, float)) and lo <= v["best_estimate"] <= hi):
        raise RegistryError("references.json: ipcc_ar6_tcre needs best_estimate within likely_range")
    return {"unit": e["unit"], "best_estimate": v["best_estimate"], "likely_range": [lo, hi], "as_per_1000_gtc": v.get("as_per_1000_gtc"),
            "source": e["citation"], "note": e["what_it_is_not"], "edition": e["edition"]}


def paris_goals(path: str | None = None) -> dict:
    """The Paris temperature goals as published beside the scenario translation (`paris_reference`)."""
    e = entry("paris_temperature_goals", path)
    goals = e["values"].get("goals_c")
    if not (isinstance(goals, list) and goals and all(isinstance(g, (int, float)) and g > 0 for g in goals)):
        raise RegistryError("references.json: paris_temperature_goals needs a non-empty list of positive goals_c")
    return {"goals_c": sorted(goals), "unit": e["unit"], "baseline": e.get("baseline"), "source": e["citation"], "edition": e["edition"],
            "what_it_is": e["what_it_is"], "note": e["what_it_is_not"]}


def _get_json(url: str, timeout: int = 15):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 -- a fixed https URL to GitHub's API
        return json.load(resp)


def check(report: RunReport, today: dt.date | None = None, now: dt.datetime | None = None, path: str | None = None) -> None:
    """The review-date backstop and the heartbeat check, as deviations/notes on `report`. A malformed registry is a deviation here too
    (the stages that use it fail on their own)."""
    today = today or dt.date.today()
    now = now or dt.datetime.now(dt.timezone.utc)
    try:
        doc = load(path)
    except RegistryError as e:
        report.deviate(str(e))
        return
    for rid, e in doc["references"].items():
        due = _date(e["review_by"], f"{rid}.review_by")
        if due < today:
            report.deviate(f"reference {rid} ({e['edition']}) was due for review by {due.isoformat()}: check whether {e['successor']} has superseded it, "
                           f"then update pipeline/references.json and set a new review_by (SPEC.md §5.35)")
    report.count("references", len(doc["references"]))
    hb = doc["heartbeat"]
    if hb.get("issue") is None:
        report.note("reference-search heartbeat not configured (references.json heartbeat.issue is null): the monthly routine is not set up yet")
        return
    since = (now - dt.timedelta(days=hb["max_age_days"])).strftime("%Y-%m-%dT%H:%M:%SZ")
    url = f"{GITHUB_API}/repos/{hb['repo']}/issues/{hb['issue']}/comments?since={since}&per_page=1"
    try:
        recent = _get_json(url)
    except Exception as e:  # noqa: BLE001 -- unreachable GitHub is reported, never fatal
        report.deviate(f"reference-search heartbeat could not be read from GitHub ({hb['repo']}#{hb['issue']}): {type(e).__name__}: {e}")
        return
    if not isinstance(recent, list):
        report.deviate(f"reference-search heartbeat: unexpected response from GitHub for {hb['repo']}#{hb['issue']}")
    elif not recent:
        report.deviate(f"reference-search heartbeat missed: no comment on {hb['repo']}#{hb['issue']} in the last {hb['max_age_days']} days; "
                       f"the monthly reference-search routine may have stopped (SPEC.md §5.35 H)")
    else:
        report.note(f"reference-search heartbeat ok: {hb['repo']}#{hb['issue']} commented within {hb['max_age_days']} days")


def run() -> RunReport:
    report = RunReport("references")
    check(report)
    return report
