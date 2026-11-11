"""SPEC.md §15.11: summaries, KPIs, scenario lead, source lines and prompt chips."""

from agent.follow_up_prompts import MAX_FOLLOW_UP_PROMPTS, P_REL, P_SCEN, follow_up_prompts
from agent.kpis import build_kpis, scenario_lead
from agent.source_lines import source_line
from agent.state import ToolCallRecord
from agent.summaries import widget_summary
from agent.ui_selection import SCENARIO_BADGE, build_widget


def _rec(name, result, args=None):
    return ToolCallRecord(tool_name=name, args=args or {}, result=result, progress_label="x")


PROFILE = {
    "country": "China",
    "years": [1990, 2023, 2024],
    "co2": [2483.5, 12166.0, 12289.0],
    "co2_per_capita": [2.15, 8.5, 8.66],
    "table": [{"year": 2024, "co2": 12289.0, "co2_per_capita": 8.66, "co2_yoy_pct_change": 1.01}],
}
TOP = {"year": 2024, "emitters": [{"country": "China", "co2": 12289.0}, {"country": "United States", "co2": 4900.0}], "n_ranked": 218, "total_mt": 37000.0, "top_n_share_pct": 46.5}


# --- summaries ------------------------------------------------------------------------------------


def test_profile_summary_has_the_latest_figures_and_the_multiple_of_the_first_year():
    s = widget_summary(_rec("get_country_profile", PROFILE))
    assert s == {"country": "China", "year": 2024, "co2_mt": 12289.0, "per_capita_t": 8.66, "yoy_pct": 1.0, "first_year": 1990, "multiple_of_first_year": 4.9}


def test_historical_summary_ranks_series_by_latest_value_and_skips_null_ends():
    result = {"gas": "co2", "series": [
        {"name": "India", "years": [1990, 2024], "values": [578.0, 3200.0]},
        {"name": "China", "years": [1990, 2023, 2024], "values": [2483.5, 12166.0, None]},  # trailing null: last valid is 2023
        {"name": "Empty", "years": [1990], "values": [None]},
    ]}
    rows = {r["name"]: r for r in widget_summary(_rec("get_historical_emissions", result))["series"]}
    assert rows["China"]["last_year"] == 2023 and rows["China"]["rank_among_shown"] == 1 and rows["India"]["rank_among_shown"] == 2 and "Empty" not in rows


def test_top_emitters_summary_carries_the_share_fields_when_present_and_omits_them_when_not():
    s = widget_summary(_rec("get_top_emitters", TOP))
    assert s["top_n_share_pct"] == 46.5 and s["n_ranked"] == 218 and s["top"][0] == {"rank": 1, "name": "China", "co2": 12289.0}
    old = widget_summary(_rec("get_top_emitters", {"year": 2020, "emitters": TOP["emitters"]}))
    assert "top_n_share_pct" not in old and old["top_n"] == 2


def test_area2_summary_passes_through_and_failures_and_other_tools_have_none():
    assert widget_summary(_rec("get_temperature_anomaly", {"summary": {"last_value": 1.45}})) == {"last_value": 1.45}
    assert widget_summary(_rec("get_country_profile", {"error": "x"})) is None
    assert widget_summary(_rec("get_forecast", {"anything": 1})) is None


# --- KPIs -----------------------------------------------------------------------------------------


def test_profile_kpis_match_the_briefs_three_cards_from_the_data():
    kpis = build_kpis([_rec("get_country_profile", PROFILE, {"country": "China"})])
    assert [(k.label, k.value, k.unit, k.decimals, k.year) for k in kpis] == [
        ("CO₂ emissions", 12289.0, "Mt", 0, 2024),
        ("Per capita", 8.66, "t", 2, 2024),
        ("Change vs 2023", 1.0, "%", 1, 2024),
    ]
    assert kpis[0].sub is None  # no ranking in this turn: the rank is not guessed
    assert kpis[2].sub == "4.9× the 1990 level"


def test_rank_sub_comes_from_a_same_year_top_emitters_result_only():
    with_rank = build_kpis([_rec("get_top_emitters", TOP), _rec("get_country_profile", PROFILE)])
    assert with_rank[0].sub == "Largest of 218 countries"
    second = {**PROFILE, "country": "United States"}
    assert build_kpis([_rec("get_top_emitters", TOP), _rec("get_country_profile", second)])[0].sub == "#2 of 218 countries"
    other_year = {**TOP, "year": 2020}
    assert build_kpis([_rec("get_top_emitters", other_year), _rec("get_country_profile", PROFILE)])[0].sub is None


def test_indicator_and_scenario_kpis():
    t = build_kpis([_rec("get_temperature_anomaly", {"summary": {"last_value": 1.451, "last_year": 2025, "reference": "1850-1900"}})])
    assert (t[0].label, t[0].value, t[0].year, t[0].sub) == ("Temperature anomaly", 1.451, 2025, "vs 1850-1900")
    c = build_kpis([_rec("get_co2_concentration", {"summary": {"last_value": 427.35, "last_year": 2025}})])
    assert (c[0].unit, c[0].decimals) == ("ppm", 1)
    assert build_kpis([_rec("get_scenario_temperature", {"summary": {"final_year_by_scenario": {"Aggressive": {"year": 2040, "headline_level_c": 1.58}, "BAU": {"year": 2040, "headline_level_c": 1.68, "annual_global_fossil_mt": 44877.4}}}})])[0].series == "BAU"


def test_kpis_are_capped_at_three_and_failures_are_skipped():
    many = [_rec("get_country_profile", PROFILE), _rec("get_temperature_anomaly", {"summary": {"last_value": 1.4, "last_year": 2025}})]
    assert len(build_kpis(many)) == 3
    assert build_kpis([_rec("get_country_profile", {"error": "x"})]) == []


# --- deterministic scenario lead ------------------------------------------------------------------


_SCEN = {"reading_note": "Note.", "summary": {"final_year_by_scenario": {
    "BAU": {"year": 2040, "headline_level_c": 1.68}, "Moderate": {"year": 2040, "headline_level_c": 1.64}, "Aggressive": {"year": 2040, "headline_level_c": 1.58}}}}


def test_scenario_lead_states_the_range_then_the_pipelines_own_note():
    assert scenario_lead([_rec("get_scenario_temperature", _SCEN)]) == (
        "By 2040 the platform's three emissions pathways imply 1.58–1.68 °C above 1850–1900. Note."
    )


def test_scenario_lead_only_when_the_scenario_result_is_the_only_data():
    other = _rec("get_top_emitters", TOP)
    assert scenario_lead([_rec("get_scenario_temperature", _SCEN), other]) is None
    assert scenario_lead([_rec("list_countries", {}), _rec("get_scenario_temperature", _SCEN)]) is not None  # lookups don't count
    assert scenario_lead([_rec("get_scenario_temperature", {"error": "503"})]) is None


def test_scenario_lead_for_a_subset_omits_the_all_pathway_note_and_for_fossil_only_defers():
    one = {"reading_note": "Note.", "summary": {"final_year_by_scenario": {"Aggressive": {"year": 2040, "headline_level_c": 1.58}}}}
    assert scenario_lead([_rec("get_scenario_temperature", one)]) == "By 2040 the Aggressive pathway implies 1.58 °C above 1850–1900."
    fossil = {"reading_note": "Note.", "summary": {"final_year_by_scenario": {"BAU": {"year": 2040, "headline_level_c": None}}}}
    assert scenario_lead([_rec("get_scenario_temperature", fossil)]) is None


def _vp(margin, first, straddle=False):
    return {"horizon_year": 2040, "margin_c": margin, "first_year_implied_level_at_or_above": first, "ci95_straddles_goal": straddle}


# The production figures of 2026-11-10 (headline line): every pathway above 1.5 degC, below 2 degC.
_VS_PARIS = {
    "BAU": {"headline": {"1.5": _vp(0.19, 2032), "2": _vp(-0.31, None)}, "fossil_only": {"1.5": _vp(0.331, 2030), "2": _vp(-0.169, None)}},
    "Moderate": {"headline": {"1.5": _vp(0.144, 2033), "2": _vp(-0.356, None)}},
    "Aggressive": {"headline": {"1.5": _vp(0.09, 2034), "2": _vp(-0.41, None)}},
}
_SCEN_PARIS = {**_SCEN, "summary": {**_SCEN["summary"], "vs_paris": _VS_PARIS}}
_PARIS_Q = "What do the emissions projections indicate about our pathways to the Paris framework targets?"


def test_scenario_lead_quotes_the_paris_comparison_for_a_paris_question():
    # SPEC.md §5.35 E: this lead never reaches an LLM, so the comparison must be part of it (the dq11 runs of 2026-11-10 lacked it).
    assert scenario_lead([_rec("get_scenario_temperature", _SCEN_PARIS)], _PARIS_Q) == (
        "By 2040 the platform's three emissions pathways imply 1.58–1.68 °C above 1850–1900. "
        "Against the Paris Agreement goals, each pathway's implied level in 2040 is "
        "above 1.5 °C (BAU +0.19 °C, at or above it from 2032; Moderate +0.14 °C, at or above it from 2033; Aggressive +0.09 °C, at or above it from 2034), "
        "and below 2 °C (BAU by 0.31 °C; Moderate by 0.36 °C; Aggressive by 0.41 °C). Note."
    )


def test_the_paris_sentence_never_says_breached_exceeded_or_met():
    text = scenario_lead([_rec("get_scenario_temperature", _SCEN_PARIS)], "will we breach 1.5°C?").lower()
    assert "implied level" in text and not any(w in text for w in ("breach", "exceed", " met", "cross"))


def test_scenario_lead_has_no_paris_sentence_for_other_questions_or_without_the_comparison():
    assert "Paris" not in scenario_lead([_rec("get_scenario_temperature", _SCEN_PARIS)], "how do temperature outcomes vary by pathway?")
    assert "Paris" not in scenario_lead([_rec("get_scenario_temperature", _SCEN_PARIS)])
    assert scenario_lead([_rec("get_scenario_temperature", _SCEN)], _PARIS_Q) == scenario_lead([_rec("get_scenario_temperature", _SCEN)])


def test_the_paris_sentence_handles_a_mixed_goal_a_straddling_interval_and_a_single_pathway():
    mixed = {"BAU": {"headline": {"2": _vp(0.05, 2039, straddle=True)}}, "Moderate": {"headline": {"2": _vp(-0.2, None)}},
             "Aggressive": {"headline": {"2": _vp(-0.3, None)}}}
    text = scenario_lead([_rec("get_scenario_temperature", {**_SCEN, "summary": {**_SCEN["summary"], "vs_paris": mixed}})], "2 degrees?")
    assert "above 2 °C for BAU +0.05 °C, at or above it from 2039, and below it for Moderate by 0.20 °C; Aggressive by 0.30 °C." in text
    assert "The 95% interval spans the goal for BAU at 2 °C." in text
    one = {"reading_note": "Note.", "summary": {"final_year_by_scenario": {"Aggressive": {"year": 2040, "headline_level_c": 1.58}}, "vs_paris": _VS_PARIS}}
    assert scenario_lead([_rec("get_scenario_temperature", one)], "Paris?") == (
        "By 2040 the Aggressive pathway implies 1.58 °C above 1850–1900. Against the Paris Agreement goals, the Aggressive pathway's implied level "
        "in 2040 is above 1.5 °C (Aggressive +0.09 °C, at or above it from 2034), and below 2 °C (Aggressive by 0.41 °C)."
    )


def test_a_pathway_that_reached_the_goal_but_ends_below_it_is_described_as_below():
    # Copilot on #108: the first year at or above the goal must not decide above/below; the horizon margin does.
    dip = {n: {"headline": {"2": _vp(m, y)}} for n, m, y in (("BAU", -0.04, 2036), ("Moderate", -0.2, None), ("Aggressive", -0.3, None))}
    text = scenario_lead([_rec("get_scenario_temperature", {**_SCEN, "summary": {**_SCEN["summary"], "vs_paris": dip}})], "2 degrees?")
    assert "below 2 °C (BAU by 0.04 °C, though at or above it in 2036; Moderate by 0.20 °C; Aggressive by 0.30 °C)" in text
    assert "+-" not in text


def test_a_pathway_missing_from_the_comparison_drops_the_paris_sentence_rather_than_part_of_it():
    partial = {k: v for k, v in _VS_PARIS.items() if k != "Moderate"}
    assert "Paris" not in scenario_lead([_rec("get_scenario_temperature", {**_SCEN, "summary": {**_SCEN["summary"], "vs_paris": partial}})], _PARIS_Q)


# --- source lines ---------------------------------------------------------------------------------


def test_owid_lines_state_the_land_use_scope_and_read_the_coverage_from_the_data():
    line = source_line(_rec("get_country_profile", PROFILE))
    assert line == "Source: OWID, 1990–2024 · territorial CO₂ from fossil fuels and cement; land-use change excluded"
    assert source_line(_rec("get_top_emitters", TOP)).startswith("Source: OWID, 2024")
    methane = {"gas": "methane", "gas_label": "methane", "series": [{"years": [1990, 2024]}]}
    assert "land-use" not in source_line(_rec("get_historical_emissions", methane)) and "methane" in source_line(_rec("get_historical_emissions", methane))


def test_share_source_lines_name_the_denominator_world_total_for_owid_and_the_sources_own_total_for_primap():
    """An OWID share is of the World total (bunkers included); a PRIMAP-hist share is of its own total (it has no world aggregate)."""
    owid = source_line(_rec("get_country_cumulative_share", {"source": "owid_co2", "gas_scope": "co2", "rows": []}))
    assert owid.startswith("Source: OWID") and "share of the World total, international aviation and shipping included" in owid and "excluded" not in owid
    prim = source_line(_rec("get_country_cumulative_share", {"source": "primap_hist", "gas_scope": "total_ghg", "rows": []}))
    assert "PRIMAP-hist" in prim and "share of the source's own total, which excludes international aviation and shipping" in prim


def test_headline_relationship_line_says_land_use_is_included_and_fossil_variant_says_excluded():
    head = source_line(_rec("get_emissions_temperature_relationship", {"summary": {"relationship": "headline long-run relationship (...)", "window": [1850, 2024]}}))
    assert "land use" in head and "land use excluded" not in head and "1850–2024" in head and "preliminary release" in head
    fossil = source_line(_rec("get_emissions_temperature_relationship", {"summary": {"relationship": "secondary fossil-fuel-and-cement-only variant", "window": [1850, 2024]}}))
    assert "land use excluded" in fossil


def test_all_gas_and_other_area2_lines():
    gas = source_line(_rec("get_emissions_temperature_relationship", {"summary": {"relationship": "recent all-gas relationship (...)", "window": [1970, 2024]}}))
    assert "PRIMAP-hist" in gas and "1970–2024" in gas and "TCRE" not in gas
    assert "1959" in source_line(_rec("get_co2_concentration", {"details": {"splice": {"splice_year": 1959}}}))
    assert "preliminary release" in source_line(_rec("get_temperature_anomaly", {"summary": {"reference": "1850-1900"}}))
    assert "PRIMAP-hist" in source_line(_rec("get_country_cumulative_share", {"source": "primap_hist", "gas_scope": "total_ghg"}))
    assert "OWID" in source_line(_rec("get_country_cumulative_share", {"source": "owid_co2"}))


def test_no_source_line_for_methodology_metadata_or_failed_calls():
    assert source_line(_rec("get_methodology_notes", {"a": 1})) is None
    assert source_line(_rec("get_correlation_metadata", {"a": 1})) is None
    assert source_line(_rec("get_country_profile", {"error": "x"})) is None


def test_build_widget_attaches_source_summary_and_the_scenario_badge():
    w = build_widget(_rec("get_country_profile", PROFILE), "q")
    assert w.source_line.startswith("Source: OWID") and w.summary["co2_mt"] == 12289.0 and w.badge is None
    s = build_widget(_rec("get_scenario_temperature", _SCEN), "q")
    assert s.badge == SCENARIO_BADGE and "climate-model projections" in s.badge


# --- follow-up prompt chips -----------------------------------------------------------------------


def test_a_country_trend_leads_to_that_countrys_share_then_the_climate_relationship():
    chips = follow_up_prompts([_rec("get_historical_emissions", {"series": [{"name": "China"}]}, {"countries": ["China", "India"]})], "q")
    assert chips[0] == "What share of historical emissions comes from China?" and P_REL in chips and len(chips) <= MAX_FOLLOW_UP_PROMPTS


def test_chips_skip_the_current_query_and_anything_the_turn_already_answered():
    ran = [_rec("get_emissions_temperature_relationship", {"summary": {}})]
    assert P_REL not in follow_up_prompts(ran, "q")  # the relationship tool already ran
    asked = follow_up_prompts([_rec("get_forecast", {})], P_SCEN.upper())  # case-insensitive match to the query
    assert P_SCEN not in asked
    share_ran = [_rec("get_country_profile", PROFILE, {"country": "China"}), _rec("get_country_cumulative_share", {"rows": []})]
    assert not any(p.startswith("What share of historical") for p in follow_up_prompts(share_ran, "q"))


def test_chips_are_deduplicated_capped_and_empty_for_methodology_or_failures():
    recs = [_rec("get_forecast", {}), _rec("get_scenario_projection", {})]
    chips = follow_up_prompts(recs, "q")
    assert len(chips) == len(set(chips)) <= MAX_FOLLOW_UP_PROMPTS
    assert follow_up_prompts([_rec("get_methodology_notes", {})], "q") == []
    assert follow_up_prompts([_rec("get_forecast", {"error": "x"})], "q") == []


# --- fossil-only / headline-only scenario lines -----------------------


def _scenario_result(line, headline, fossil):
    f = {"year": 2040, "headline_level_c": headline, "fossil_only_level_c": fossil, "annual_global_fossil_mt": 44877.4}
    return {"line": line, "summary": {"line": line, "final_year_by_scenario": {"BAU": f}}}


def test_fossil_only_scenario_still_gets_kpi_cards_and_says_which_line():
    kpis = build_kpis([_rec("get_scenario_temperature", _scenario_result("fossil_only", None, 1.823))])
    assert [(k.label, k.value, k.series) for k in kpis] == [("BAU", 1.823, "BAU")]
    assert kpis[0].sub == "44,877 MtCO\u2082 a year \u00b7 fossil-only line"


def test_headline_scenario_kpis_use_the_headline_level_and_do_not_mention_fossil():
    k = build_kpis([_rec("get_scenario_temperature", _scenario_result("both", 1.68, 1.82))])[0]
    assert k.value == 1.68 and "fossil" not in (k.sub or "")


def test_scenario_source_line_names_the_slope_that_was_actually_used():
    line = lambda name: source_line(_rec("get_scenario_temperature", _scenario_result(name, 1.7, 1.8)))
    assert "fossil-only regression slope" in line("fossil_only") and "headline" not in line("fossil_only")
    assert "the headline regression slope \u00b7" in line("headline")
    assert "headline regression slope (with a fossil-only second line)" in line("both")


# --- live-walkthrough fixes: forecast ranking and cumulative units -----------------


def _forecast_rows(n=12):
    return [
        {"country": f"C{i}", "actual_2020": 100.0 - i, "forecast_2030": 5.0 * i, "forecast_2035": 6.0 * i,
         "forecast_2040": 10.0 * i, "pct_change_2020_2040": 2.5 * i}
        for i in range(n)
    ]


def test_forecast_summary_ranks_by_the_column_the_tool_used_and_carries_the_figures():
    rows = _forecast_rows(10)
    s = widget_summary(_rec("get_forecast_summary", {"rows": rows, "ranked_by": "forecast_2040", "effective_scope": "expanded"}))
    assert s["scope"] == "expanded" and s["ranked_by"] == "forecast_2040" and s["unit"].startswith("Mt")
    # C9 has the largest 2040 forecast although C0 has the largest 2020 actual: the summary follows ranked_by.
    assert [t["name"] for t in s["top"]][:3] == ["C9", "C8", "C7"]
    assert s["top"][0]["forecast_2040"] == 90.0 and s["top"][0]["rank"] == 1
    assert widget_summary(_rec("get_forecast_summary", {"rows": []})) is None


def test_forecast_kpis_are_the_three_largest_2040_forecasts_and_only_when_the_ranking_is_trustworthy():
    ranked = _rec("get_forecast_summary", {"rows": _forecast_rows(10), "ranked_by": "forecast_2040", "scope_note": "capped", "effective_scope": "expanded"})
    kpis = build_kpis([ranked])
    assert [k.label for k in kpis] == ["#1 C9", "#2 C8", "#3 C7"]
    assert kpis[0].value == 90.0 and kpis[0].year == 2040 and kpis[0].sub == "+22.5% vs 2020"
    # Capped by the 2020 actuals: the top three by 2040 inside that set could be wrong globally -> no cards.
    capped_wrong = _rec("get_forecast_summary", {"rows": _forecast_rows(10), "ranked_by": "actual_2020", "scope_note": "capped", "effective_scope": "expanded"})
    assert build_kpis([capped_wrong]) == []
    # Nothing capped (no scope_note): the set is complete, so ranking it here is sound.
    assert len(build_kpis([_rec("get_forecast_summary", {"rows": _forecast_rows(5), "ranked_by": "actual_2020", "effective_scope": "expanded"})])) == 3
    # The featured ten (the default scope, never capped): "#1" would be the best of those ten only -> no ranked cards, and the summary says so.
    featured = _rec("get_forecast_summary", {"rows": _forecast_rows(10), "ranked_by": "forecast_2040"})
    assert widget_summary(featured)["scope"] == "featured" and build_kpis([featured]) == []
    # Asked for 'expanded' but the API served the featured ten (its fallback): the RESULT's effective scope decides, not the request.
    degraded = _rec("get_forecast_summary", {"rows": _forecast_rows(10), "ranked_by": "forecast_2040", "effective_scope": "featured"}, {"scope": "expanded"})
    assert widget_summary(degraded)["scope"] == "featured" and build_kpis([degraded]) == []


RELATIONSHIP = {
    "summary": {
        "window": [1850, 2024],
        "baseline": "preindustrial",
        "first_pair": {"year": 1850, "cumulative_emissions": 2910.87, "temperature": -0.0757},
        "last_pair": {"year": 2024, "cumulative_emissions": 2751504.433, "temperature": 1.5503},
        "cumulative": {"unit": "GtCO₂", "first_year": 1850, "first": 3, "last_year": 2024, "last": 2752},
        "fit": {"slope": 0.4856, "ci95_hac": [0.4416, 0.5297], "r_squared": 0.888, "unit": "°C per 1,000 GtCO₂"},
    }
}


def test_relationship_kpis_state_cumulative_emissions_in_gt_not_the_raw_mt_pair():
    kpis = build_kpis([_rec("get_emissions_temperature_relationship", RELATIONSHIP)])
    assert [k.label for k in kpis] == ["Cumulative emissions", "Warming", "Slope"]
    cum, warm, slope = kpis
    assert (cum.value, cum.unit, cum.year, cum.sub) == (2752, "GtCO₂", 2024, "since 1850")
    assert (warm.value, warm.unit, warm.sub) == (1.5503, "°C", "vs 1850–1900")
    assert slope.unit == "°C per 1,000 GtCO₂" and "95% interval 0.44–0.53" in slope.sub and "R² 0.89" in slope.sub
    assert all(k.value != 2751504.433 for k in kpis)


def test_relationship_kpis_degrade_without_a_fit():
    no_fit = {"summary": {**RELATIONSHIP["summary"], "fit": None}}
    assert [k.label for k in build_kpis([_rec("get_emissions_temperature_relationship", no_fit)])] == ["Cumulative emissions", "Warming"]


def test_warming_card_always_says_1850_1900_whatever_the_emissions_window():
    # The all-gas relationship starts its cumulative emissions in 1970, but the temperature is still the anomaly vs 1850-1900.
    all_gas = {"summary": {**RELATIONSHIP["summary"], "source": "primap_ghg", "baseline": "1970", "window": [1970, 2024]}}
    warming = next(k for k in build_kpis([_rec("get_emissions_temperature_relationship", all_gas)]) if k.label == "Warming")
    assert warming.sub == "vs 1850\u20131900"


# --- SPEC.md §15.16: summaries for the Stage 1 forecast / model / change / gas / scenario tools ---------------------------------


def _years(a, b):
    return list(range(a, b + 1))


FORECAST = {
    "country": "India",
    "hist_years": _years(1990, 2018),
    "hist_co2": [500.0 + i for i in range(29)],
    "holdout_years": _years(2019, 2024),
    "holdout_co2": [2600.0, 2500.0, 2800.0, 3000.0, 3100.0, 3193.54],
    "forecast_years": _years(2019, 2043),
    "forecast_mean": [3000.0 + 100 * i for i in range(25)],
    "ci_lower": [2900.0 + 100 * i for i in range(25)],
    "ci_upper": [3100.0 + 100 * i for i in range(25)],
}


def test_forecast_summary_quotes_milestone_years_and_the_change_from_the_last_observed_value():
    s = widget_summary(_rec("get_forecast", FORECAST))
    assert s["country"] == "India" and s["unit"] == "Mt CO\u2082"
    assert (s["last_observed_year"], s["last_observed"]) == (2024, 3193.5)
    assert s["forecast_2030"] == {"year": 2030, "mean": 4100.0, "lower": 4000.0, "upper": 4200.0}
    assert s["forecast_2040"]["mean"] == 5100.0
    assert s["pct_change_to_forecast_year"] == {"year": 2040, "pct": round((5100.0 - 3193.54) / 3193.54 * 100, 1)}
    assert "final" not in s  # the far-end interval is only quoted when no milestone year exists


def test_forecast_summary_falls_back_to_the_final_year_when_no_milestone_year_is_in_range():
    short = {**FORECAST, "forecast_years": [2025, 2026], "forecast_mean": [1.0, 2.0], "ci_lower": [0.0, 1.0], "ci_upper": [2.0, 3.0]}
    s = widget_summary(_rec("get_forecast", short))
    assert s["final"]["year"] == 2026 and "forecast_2040" not in s


def test_forecast_comparison_summary_has_one_entry_per_country():
    s = widget_summary(_rec("get_forecast_comparison", {"forecasts": [FORECAST, {**FORECAST, "country": "China"}]}))
    assert [f["country"] for f in s["forecasts"]] == ["India", "China"]
    assert widget_summary(_rec("get_forecast_comparison", {"forecasts": []})) is None


def test_model_comparison_summary_counts_the_best_model_and_keeps_each_countrys_mae():
    rows = [
        {"country": "Russia", "baseline_mae": 44.2, "lr_mae": 37.2, "rf_pc_mae": 45.1, "rf_mae": 34.0, "ets_mae": 40.8, "best_model": "RF"},
        {"country": "Algeria", "baseline_mae": 9.5, "lr_mae": 9.3, "rf_pc_mae": 14.1, "rf_mae": 10.6, "ets_mae": 6.6, "best_model": "ETS"},
    ]
    s = widget_summary(_rec("get_model_comparison", {"columns": [], "rows": rows}))
    assert s["n_countries"] == 2 and s["best_model_counts"] == {"RF": 1, "ETS": 1}
    russia = next(c for c in s["by_country"] if c["country"] == "Russia")
    assert russia["best_model"] == "RF" and russia["mae"] == {"baseline": 44.2, "lr": 37.2, "rf_pc": 45.1, "rf": 34.0, "ets": 40.8}
    assert widget_summary(_rec("get_model_comparison", {"rows": []})) is None


def test_change_summary_carries_the_counts_and_the_named_movers():
    r = {
        "scope": "sovereign", "baseline_year": 1990, "latest_year": 2024, "countries_with_data": 209,
        "increased_count": 154, "decreased_count": 55,
        "top_increases": [{"country": "India", "co2_1990": 578.0, "co2_latest": 3193.5, "absolute_change": 2615.5, "pct_change": 452.52}],
        "top_decreases": [{"country": "Russia", "absolute_change": -755.76, "pct_change": -29.798}],
    }
    s = widget_summary(_rec("get_emissions_change_summary", r))
    assert (s["increased_count"], s["decreased_count"], s["countries_with_data"]) == (154, 55, 209)
    assert s["top_increases"] == [{"country": "India", "pct_change": 452.5, "absolute_change_mt": 2615.5}]
    assert s["top_decreases"][0]["pct_change"] == -29.8


def test_gas_by_decade_summary_maps_each_gas_to_its_shares_by_decade():
    r = {"decades": [1990, 2000], "series": [{"gas": "co2", "gas_label": "CO\u2082", "share": [71.32, 78.96]}, {"gas": "bad", "share": [1.0]}]}
    s = widget_summary(_rec("get_gas_composition_by_decade", r))
    assert s == {"decades": [1990, 2000], "unit": "% share", "share_by_gas": {"CO\u2082": [71.3, 79.0]}}  # a series that does not line up is dropped


def test_scenario_comparison_summary_labels_the_common_point_as_a_start_not_an_observation():
    years = [2024, 2025, 2026]
    r = {"countries": ["China"], "scenarios": {
        "BAU": [{"name": "China", "years": years, "values": [12289.0, 12492.8, 13000.0]}],
        "Aggressive": [{"name": "China", "years": years, "values": [12289.0, 12492.8, 11000.0]}],
    }}
    c = widget_summary(_rec("compare_scenarios_across_countries", r))["countries"][0]
    assert c["final_by_scenario"] == {"BAU": 13000.0, "Aggressive": 11000.0} and c["final_year"] == 2026
    assert (c["starting_year"], c["starting_value"]) == (2025, 12492.8)
    assert "last_observed" not in c and "last_observed_year" not in c


def test_cumulative_impact_summary_keeps_the_rows_and_the_scope_note():
    r = {"sort_by": "BAU", "scenarios": ["BAU"], "scope_note": "Showing 1 of 40", "rows": [
        {"country": "China", "values": {"BAU": 222817.0}, "year_2040": {"BAU": 15293.645}, "current_level": 12289.037}]}
    s = widget_summary(_rec("get_scenario_cumulative_impact", r))
    assert s["rows"][0]["year_2040_by_scenario"] == {"BAU": 15293.6} and s["scope_note"] == "Showing 1 of 40"


def test_the_new_summaries_return_none_for_an_error_or_a_malformed_result():
    for tool in ("get_forecast", "get_forecast_comparison", "get_model_comparison", "get_emissions_change_summary",
                 "get_gas_composition_by_decade", "compare_scenarios_across_countries", "get_scenario_cumulative_impact"):
        assert widget_summary(_rec(tool, {"error": "x"})) is None
        assert widget_summary(_rec(tool, {})) is None


def test_forecast_summary_states_the_interval_level_so_the_model_does_not_guess_it():
    assert "95%" in widget_summary(_rec("get_forecast", FORECAST))["interval"]


def test_historical_summary_gives_a_lone_series_no_rank_but_ranks_several():
    one = {"gas": "co2", "series": [{"name": "India", "years": [1990, 2024], "values": [578.0, 3193.5]}]}
    lone = widget_summary(_rec("get_historical_emissions", one))
    assert not any(k.startswith("rank") for k in lone["series"][0]) and "rank_note" not in lone
    two = {"gas": "co2", "series": one["series"] + [{"name": "China", "years": [1990, 2024], "values": [2483.5, 12289.0]}]}
    s = widget_summary(_rec("get_historical_emissions", two))
    assert {r["name"]: r["rank_among_shown"] for r in s["series"]} == {"China": 1, "India": 2}


def test_historical_ranks_are_labelled_as_among_the_series_shown_not_world_ranks():
    # seen live: "Germany ... rank 4" quoted beside a world top-10 (it is 10th in the world) off a plain `rank` key
    two = {"gas": "co2", "series": [{"name": "Germany", "years": [1990, 2024], "values": [1054.8, 572.3]},
                                    {"name": "United Kingdom", "years": [1990, 2024], "values": [601.9, 312.9]}]}
    s = widget_summary(_rec("get_historical_emissions", two))
    assert all("rank" not in row for row in s["series"])
    assert "not a world rank" in s["rank_note"] and "2 countries" in s["rank_note"]


def test_model_comparison_summary_also_reads_the_long_form_rows_the_api_fixture_uses():
    rows = [
        {"country": "China", "model": "Linear Regression", "mae": 120.5, "rmse": 150.2},
        {"country": "China", "model": "RF Pooled", "mae": 95.3, "rmse": 110.7},
        {"country": "United States", "model": "Linear Regression", "mae": 80.1, "rmse": 95.4},
    ]
    s = widget_summary(_rec("get_model_comparison", {"columns": ["country", "model", "mae", "rmse"], "rows": rows}))
    assert s["n_countries"] == 2  # two countries, not three rows
    assert s["best_model_counts"] == {"RF Pooled": 1, "Linear Regression": 1}
    china = next(c for c in s["by_country"] if c["country"] == "China")
    assert china["best_model"] == "RF Pooled" and china["mae"] == {"Linear Regression": 120.5, "RF Pooled": 95.3}


def test_model_comparison_summary_caps_countries_not_raw_long_form_rows():
    models = ["Baseline", "Linear Regression", "RF Per-Country", "RF Pooled", "ETS"]
    rows = [{"country": f"C{i:02d}", "model": m, "mae": float(j + 1), "rmse": 1.0} for i in range(60) for j, m in enumerate(models)]
    s = widget_summary(_rec("get_model_comparison", {"rows": rows}))
    assert s["n_countries"] == 50  # the cap, in countries
    assert all(len(c["mae"]) == 5 for c in s["by_country"])  # none cut off partway through its models
    assert sum(s["best_model_counts"].values()) == 50
