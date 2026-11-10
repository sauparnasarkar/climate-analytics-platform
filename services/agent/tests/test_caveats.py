"""SPEC.md §15.3 rule 1: deterministic climate-context notes."""

from agent.caveats import (
    ALL_GAS_NOTE,
    COMPOSITION_NOTE,
    LONG_RUN_NOTE,
    PRELIMINARY_TEMPERATURE_NOTE,
    SCENARIO_NOTE,
    mandatory_notes,
)
from agent.state import ToolCallRecord


def _rec(name, result, args=None):
    return ToolCallRecord(tool_name=name, args=args or {}, result=result, progress_label="x")


def test_temperature_tool_carries_the_preliminary_note():
    assert mandatory_notes([_rec("get_temperature_anomaly", {"points": []})]) == [PRELIMINARY_TEMPERATURE_NOTE]


def test_headline_relationship_has_preliminary_and_long_run_but_not_the_all_gas_note():
    notes = mandatory_notes([_rec("get_emissions_temperature_relationship", {"summary": {"source": "owid_co2"}})])
    assert notes == [PRELIMINARY_TEMPERATURE_NOTE, LONG_RUN_NOTE]


def test_all_gas_relationship_adds_the_distinction_note():
    notes = mandatory_notes([_rec("get_emissions_temperature_relationship", {"summary": {"source": "primap_ghg"}})])
    assert notes == [PRELIMINARY_TEMPERATURE_NOTE, LONG_RUN_NOTE, ALL_GAS_NOTE]
    assert "TCRE" not in ALL_GAS_NOTE


def test_scenario_composition_and_share_notes():
    assert SCENARIO_NOTE in mandatory_notes([_rec("get_scenario_temperature", {})])
    assert mandatory_notes([_rec("get_ghg_composition", {})]) == [COMPOSITION_NOTE]
    share = _rec("get_country_cumulative_share", {"interpretation_note": "Not a contribution to warming."})
    assert mandatory_notes([share]) == ["Not a contribution to warming."]


def test_concentration_note_reads_the_splice_year_from_the_result():
    rec = _rec("get_co2_concentration", {"details": {"splice": {"splice_year": 1959}}})
    assert "1959" in mandatory_notes([rec])[0]
    assert mandatory_notes([_rec("get_co2_concentration", {"details": {}})]) == []


def test_failed_calls_and_emissions_tools_contribute_nothing():
    assert mandatory_notes([_rec("get_temperature_anomaly", {"error": "503"})]) == []
    assert mandatory_notes([_rec("get_historical_emissions", {"series": []})]) == []


def test_notes_are_deduplicated_across_calls_in_order():
    recs = [_rec("get_temperature_anomaly", {}), _rec("get_scenario_temperature", {}), _rec("get_temperature_anomaly", {})]
    assert mandatory_notes(recs) == [PRELIMINARY_TEMPERATURE_NOTE, SCENARIO_NOTE]


# root SPEC.md §5.35 E: the registry's Paris note, only when the question names the goals
_PARIS_RESULT = {"summary": {"paris_note": "The goals refer to long-term global warming, which the IPCC assesses on 20-year averages."}}


def test_the_paris_note_is_added_only_to_a_question_about_the_goals():
    from agent.caveats import PARIS_QUESTION  # noqa: F401 -- the pattern is part of the contract
    rec = [_rec("get_scenario_temperature", _PARIS_RESULT)]
    note = _PARIS_RESULT["summary"]["paris_note"]
    for q in ("What do the projections mean for the Paris targets?", "Will we stay below 1.5°C?", "Is 2 °C still possible?", "Can we keep warming well below 2?",
              "Are we on track for 1.5 degrees?"):
        assert note in mandatory_notes(rec, q), q
    for q in ("How do temperature outcomes vary based on different emissions pathways?", "Emissions fell 1.5% in 2020", None):
        assert note not in mandatory_notes(rec, q), q


def test_no_paris_note_when_the_summary_has_none_or_the_tool_failed():
    q = "What about the Paris goals?"
    assert mandatory_notes([_rec("get_scenario_temperature", {"summary": {}})], q) == mandatory_notes([_rec("get_scenario_temperature", {})])
    assert mandatory_notes([_rec("get_scenario_temperature", {"error": "x"})], q) == []
