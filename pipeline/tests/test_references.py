"""The reference registry (pipeline/references.json), its checks, and the Paris comparison (SPEC.md §5.35)."""

import datetime as dt
import json

import pytest

from pipeline import references, run
from pipeline.common import RunReport
from pipeline.scenario_temperature import vs_paris

# What correlation.py published as ar6_reference before the registry: the move must not change a value.
OLD_AR6 = {
    "unit": "°C per 1,000 GtCO2", "best_estimate": 0.45, "very_likely_range": [0.27, 0.63], "as_per_1000_gtc": {"best_estimate": 1.65, "very_likely_range": [1.0, 2.3]},
    "source": "IPCC AR6 WGI: transient climate response to cumulative CO2 emissions (very likely range 1.0-2.3 °C per 1,000 GtC, best estimate 1.65).",
    "note": "Derived from CO2-only forcing in Earth-system models with land-use emissions included; this platform's figure is a simplified, data-driven analog, not a restatement.",
}
TODAY = dt.date(2026, 11, 10)
NOW = dt.datetime(2026, 11, 10, 12, tzinfo=dt.timezone.utc)


def write(tmp_path, mutate=None):
    doc = json.loads(open(references.REFERENCES_PATH, encoding="utf-8").read())
    if mutate:
        mutate(doc)
    path = tmp_path / "references.json"
    path.write_text(json.dumps(doc), encoding="utf-8")
    return str(path)


def test_the_shipped_registry_is_valid_and_ar6_is_unchanged_by_the_move():
    assert references.ar6_tcre() == {**OLD_AR6, "edition": "IPCC AR6 WGI, 2021"}
    p = references.paris_goals()
    assert p["goals_c"] == [1.5, 2.0] and p["edition"] == "Paris Agreement, 2015" and "20-year" in p["note"]


@pytest.mark.parametrize("mutate, message", [
    (lambda d: d["references"]["ipcc_ar6_tcre"].pop("edition"), "missing edition"),
    (lambda d: d["references"]["paris_temperature_goals"].update(review_by="next year"), "not an ISO date"),
    (lambda d: d["heartbeat"].update(max_age_days=0), "max_age_days"),
    (lambda d: d["heartbeat"].update(issue="12"), "issue number"),
    (lambda d: d["references"]["paris_temperature_goals"]["values"].update(goals_c=[]), "goals_c"),
])
def test_a_malformed_registry_is_an_error_not_a_default(tmp_path, mutate, message):
    path = write(tmp_path, mutate)
    with pytest.raises(references.RegistryError, match=message):
        references.paris_goals(path) if "goals_c" in message else references.load(path)


def test_a_reference_past_its_review_date_is_a_deviation_and_an_unset_heartbeat_only_a_note(tmp_path):
    path = write(tmp_path, lambda d: d["references"]["ipcc_ar6_tcre"].update(review_by="2026-11-01"))
    r = RunReport("references")
    references.check(r, today=TODAY, now=NOW, path=path)
    assert len(r.deviations) == 1 and "ipcc_ar6_tcre" in r.deviations[0] and "IPCC AR7 WGI" in r.deviations[0]
    assert any("heartbeat not configured" in n for n in r.notes)


def test_the_shipped_dates_are_not_due_yet():
    r = RunReport("references")
    references.check(r, today=TODAY, now=NOW)
    assert r.deviations == []


@pytest.mark.parametrize("response, deviates, text", [
    ([{"id": 1}], False, "heartbeat ok"),
    ([], True, "heartbeat missed"),
    ({"message": "Not Found"}, True, "unexpected response"),
])
def test_the_heartbeat_is_read_from_the_tracking_issue(tmp_path, monkeypatch, response, deviates, text):
    path = write(tmp_path, lambda d: d["heartbeat"].update(issue=7))
    seen = []
    monkeypatch.setattr(references, "_get_json", lambda url, timeout=15: seen.append(url) or response)
    r = RunReport("references")
    references.check(r, today=TODAY, now=NOW, path=path)
    assert seen == ["https://api.github.com/repos/sauparnasarkar/climate-analytics-platform/issues/7/comments?since=2026-09-26T12:00:00Z&per_page=1"]
    assert bool(r.deviations) is deviates and text in " ".join(r.deviations + r.notes)


def test_unreachable_github_is_a_deviation_never_a_failure(tmp_path):
    path = write(tmp_path, lambda d: d["heartbeat"].update(issue=7))  # the conftest fixture makes _get_json raise
    r = RunReport("references")
    references.check(r, today=TODAY, now=NOW, path=path)
    assert "could not be read from GitHub" in r.deviations[0]


def test_the_references_stage_is_registered_and_a_broken_registry_does_not_fail_the_run(tmp_path, monkeypatch):
    assert run.SOURCES["references"] is references.run and "references" in run.DERIVED_SOURCES
    monkeypatch.setattr(references, "REFERENCES_PATH", str(tmp_path / "missing.json"))
    r = references.run()
    assert "unreadable" in r.deviations[0]


def _rows(levels, ci=0.002):
    return [{"year": 2025 + i, "headline": {"level_c": v, "level_ci95": [v - ci, v + ci]}, "fossil_only": None} for i, v in enumerate(levels)]


def test_vs_paris_margins_first_year_and_straddling():
    out = vs_paris({"BAU": _rows([1.40, 1.48, 1.50, 1.69]), "Aggressive": _rows([1.40, 1.45, 1.4985])}, [1.5, 2.0])
    bau15, bau20 = out["BAU"]["headline"]
    assert bau15 == {"goal_c": 1.5, "horizon_year": 2028, "implied_level_c": 1.69, "margin_c": 0.19, "implied_level_above_goal": True,
                     "ci95_straddles_goal": False, "first_year_implied_level_at_or_above": 2027}
    assert bau20["implied_level_above_goal"] is False and bau20["first_year_implied_level_at_or_above"] is None and bau20["margin_c"] == -0.31
    agg15 = out["Aggressive"]["headline"][0]
    assert agg15["implied_level_above_goal"] is False and agg15["first_year_implied_level_at_or_above"] is None and agg15["ci95_straddles_goal"] is True
    assert "fossil_only" not in out["BAU"]  # a line with no levels is left out, not filled with nulls


def test_a_broken_registry_fails_the_scenario_stage_instead_of_nulling_the_translation(tmp_path, monkeypatch):
    from pipeline import scenario_temperature
    monkeypatch.setattr(references, "REFERENCES_PATH", str(tmp_path / "missing.json"))
    with pytest.raises(references.RegistryError):
        scenario_temperature.build(str(tmp_path), str(tmp_path / "notices.json"), str(tmp_path / "s.csv"), str(tmp_path / "o.csv"), RunReport("scenario_temperature"))
