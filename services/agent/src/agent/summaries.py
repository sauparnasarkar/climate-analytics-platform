"""Widget key figures -- SPEC.md §15.11.

`WidgetSpec.summary` is what `compose_response_node` quotes: a small dict of the numbers an answer's
lead should state. Area 2 tools already return one (`summary` in the tool result); the Stage 1
emissions tools do not, so the ones that answers lead with get one built here: profile, historical, top
emitters and forecast summary (SPEC.md §15.11), then the forecast, model-comparison, change-summary,
gas-by-decade and scenario tools (§15.16). Without one, the compose step has no figures to quote and every
model -- Sonnet included -- answers "no figures were provided". All deterministic Python from the tool
result -- the model never derives a figure from a series.
"""

from __future__ import annotations

from .state import ToolCallRecord

AREA2_TOOLS = {
    "get_co2_concentration",
    "get_temperature_anomaly",
    "get_correlation_metadata",
    "get_emissions_temperature_relationship",
    "get_ghg_composition",
    "get_country_cumulative_share",
    "get_scenario_temperature",
}
MAX_SUMMARY_SERIES = 12
MAX_COMPARISON_ROWS = 50


def _ok(record: ToolCallRecord) -> dict | None:
    r = record.result
    return r if isinstance(r, dict) and "error" not in r else None


def _first_last(values: list, years: list) -> tuple | None:
    pairs = [(y, v) for y, v in zip(years, values) if v is not None]
    return (pairs[0], pairs[-1]) if pairs else None


def _profile_summary(r: dict) -> dict | None:
    fl = _first_last(r.get("co2") or [], r.get("years") or [])
    if fl is None:
        return None
    (y0, v0), (y1, v1) = fl
    table = r.get("table") or []
    yoy = table[-1].get("co2_yoy_pct_change") if table else None
    pc = _first_last(r.get("co2_per_capita") or [], r.get("years") or [])
    return {
        "country": r.get("country"),
        "year": y1,
        "co2_mt": round(v1, 1),
        "per_capita_t": round(pc[1][1], 2) if pc else None,
        "yoy_pct": round(yoy, 1) if yoy is not None else None,
        "first_year": y0,
        "multiple_of_first_year": round(v1 / v0, 1) if v0 else None,
    }


def _historical_summary(r: dict) -> dict | None:
    rows = []
    for s in (r.get("series") or [])[:MAX_SUMMARY_SERIES]:
        fl = _first_last(s.get("values") or [], s.get("years") or [])
        if fl:
            (y0, v0), (y1, v1) = fl
            rows.append({"name": s.get("name"), "first_year": y0, "first_value": round(v0, 1), "last_year": y1, "last_value": round(v1, 1)})
    if not rows:
        return None
    # A rank is among the series shown, so a lone series has none: "rank 1" would be read as a world rank (seen live: a model
    # called India "the world's largest annual emitter" off a one-country chart).
    if len(rows) > 1:
        for rank, row in enumerate(sorted(rows, key=lambda x: x["last_value"], reverse=True), start=1):
            row["rank"] = rank
    return {"gas": r.get("gas"), "series": rows}


def _top_emitters_summary(r: dict) -> dict | None:
    emitters = r.get("emitters") or []
    if not emitters:
        return None
    out = {
        "year": r.get("year"),
        "top": [{"rank": i, "name": e.get("country"), "co2": round(e["co2"], 1)} for i, e in enumerate(emitters[:5], start=1)],
    }
    for key in ("n_ranked", "top_n_share_pct", "total_mt"):
        if r.get(key) is not None:
            out[key] = r[key]
    out["top_n"] = len(emitters)
    return out


def _forecast_summary(r: dict) -> dict | None:
    """The forecast snapshot's countries in the order the tool ranked them (`ranked_by`), each with the
    figures an answer quotes -- so "the top 10 forecasted emitters in 2040" is read from the data, not
    from a grid the model never sees."""
    rows = [row for row in (r.get("rows") or []) if row.get("country")]
    if not rows:
        return None
    ranked_by = r.get("ranked_by") or "actual_2020"
    ordered = sorted(rows, key=lambda row: row.get(ranked_by) if row.get(ranked_by) is not None else float("-inf"), reverse=True)
    out = {
        "ranked_by": ranked_by,
        # The scope the tool actually served (not the one requested: the API falls back to the featured ten when its expanded list is missing).
        # 'featured' is the 10 curated countries, 'expanded' the ~40 major emitters; a ranking over the featured ten is a ranking of those ten, not
        # of the world. A result without the field (an older server) is treated as featured, the conservative reading.
        "scope": r.get("effective_scope") or "featured",
        "unit": "Mt CO\u2082",
        "top": [
            {
                "rank": i,
                "name": row["country"],
                "forecast_2030": row.get("forecast_2030"),
                "forecast_2040": row.get("forecast_2040"),
                "actual_2020": row.get("actual_2020"),
                "pct_change_2020_2040": row.get("pct_change_2020_2040"),
            }
            for i, row in enumerate(ordered[:10], start=1)
        ],
        "n_rows": len(rows),
    }
    if r.get("scope_note"):
        out["scope_note"] = r["scope_note"]
    return out


def _r1(x):
    return round(x, 1) if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def _value_at(years: list, values: list, year: int):
    for y, v in zip(years, values):
        if y == year and v is not None:
            return v
    return None


def _forecast_one(r: dict) -> dict | None:
    """One country's forecast: the last observed value, and the forecast (mean and interval) at 2030, 2040 and the final year."""
    fy, fm = r.get("forecast_years") or [], r.get("forecast_mean") or []
    if not fy or len(fy) != len(fm):
        return None
    lo, hi = r.get("ci_lower") or [], r.get("ci_upper") or []
    observed = _first_last(
        (r.get("hist_co2") or []) + (r.get("holdout_co2") or []), (r.get("hist_years") or []) + (r.get("holdout_years") or [])
    )

    def point(year: int) -> dict | None:
        mean = _value_at(fy, fm, year)
        if mean is None:
            return None
        return {"year": year, "mean": _r1(mean), "lower": _r1(_value_at(fy, lo, year)), "upper": _r1(_value_at(fy, hi, year))}

    final_year = fy[-1]
    # "interval" is stated, not left for the model to guess: Week 4 builds ci_lower/ci_upper as the 2.5% and 97.5% quantiles of
    # simulated paths (notebook/week4_ets_forecasting.ipynb), i.e. a 95% interval.
    out: dict = {"country": r.get("country"), "unit": "Mt CO\u2082", "interval": "95% simulated interval (lower to upper)"}
    for year in (2030, 2040):
        if (pt := point(year)) is not None:
            out[f"forecast_{year}"] = pt
    if "forecast_2030" not in out and "forecast_2040" not in out:
        # The interval widens with the horizon (a far-end lower bound can even go negative), so the final year is quoted only
        # when neither of the usual milestone years is in the forecast.
        out["final"] = point(final_year)
    if observed:
        (_, _), (oy, ov) = observed
        out["last_observed_year"], out["last_observed"] = oy, _r1(ov)
        target = out.get("forecast_2040") or out.get("forecast_2030") or out.get("final")
        if target and ov:
            out["pct_change_to_forecast_year"] = {"year": target["year"], "pct": round((target["mean"] - ov) / ov * 100, 1)}
    return out


def _forecast_tool_summary(r: dict) -> dict | None:
    return _forecast_one(r)


def _forecast_comparison_summary(r: dict) -> dict | None:
    rows = [row for row in (_forecast_one(f) for f in (r.get("forecasts") or [])[:MAX_SUMMARY_SERIES]) if row]
    return {"forecasts": rows} if rows else None


_MODEL_MAE_COLUMNS = ("baseline_mae", "lr_mae", "rf_pc_mae", "rf_mae", "ets_mae")


def _model_comparison_rows(rows: list) -> list[dict]:
    """Per-country {country, best_model, mae: {model: value}} from either row shape the endpoint can serve.

    The real artifact (Week 4's `df_comparison_full`, served unchanged) is wide: one row per country with a `*_mae` column per model
    and a `best_model`. The API's own test fixture is long-form (`country`, `model`, `mae`, one row per country and model), and the
    API passes whatever CSV it is given through, so both are read rather than assuming one.
    """
    if rows and "model" in rows[0]:
        per_country: dict[str, dict[str, float]] = {}
        for row in rows:
            if row.get("country") and row.get("model") and isinstance(row.get("mae"), (int, float)):
                per_country.setdefault(row["country"], {})[row["model"]] = row["mae"]
        return [
            {"country": c, "best_model": min(maes, key=maes.get), "mae": {m: _r1(v) for m, v in maes.items()}}
            for c, maes in per_country.items()
        ]
    return [
        {"country": row["country"], "best_model": row.get("best_model"), "mae": {c[: -len("_mae")]: _r1(row.get(c)) for c in _MODEL_MAE_COLUMNS}}
        for row in rows
        if row.get("country")
    ]


def _model_comparison_summary(r: dict) -> dict | None:
    # The bound is on countries, applied after grouping: long-form input has one row per country AND model, so capping the raw rows
    # would cut countries off partway through their models and skew the counts.
    by_country = _model_comparison_rows(r.get("rows") or [])[:MAX_COMPARISON_ROWS]
    if not by_country:
        return None
    counts: dict[str, int] = {}
    for row in by_country:
        if row["best_model"]:
            counts[row["best_model"]] = counts.get(row["best_model"], 0) + 1
    return {"metric": "holdout MAE, Mt CO\u2082", "n_countries": len(by_country), "best_model_counts": counts, "by_country": by_country}


def _movers(rows: list) -> list[dict]:
    return [
        {"country": m.get("country"), "pct_change": _r1(m.get("pct_change")), "absolute_change_mt": _r1(m.get("absolute_change"))}
        for m in (rows or [])[:10]
        if m.get("country")
    ]


def _change_summary(r: dict) -> dict | None:
    if r.get("increased_count") is None and not r.get("top_increases"):
        return None
    return {
        "scope": r.get("scope"),
        "baseline_year": r.get("baseline_year"),
        "latest_year": r.get("latest_year"),
        "countries_with_data": r.get("countries_with_data"),
        "increased_count": r.get("increased_count"),
        "decreased_count": r.get("decreased_count"),
        "top_increases": _movers(r.get("top_increases")),
        "top_decreases": _movers(r.get("top_decreases")),
    }


def _gas_by_decade_summary(r: dict) -> dict | None:
    decades = r.get("decades") or []
    shares = {
        (s.get("gas_label") or s.get("gas")): [_r1(v) for v in (s.get("share") or [])]
        for s in (r.get("series") or [])
        if (s.get("gas_label") or s.get("gas")) and len(s.get("share") or []) == len(decades)
    }
    return {"decades": decades, "unit": "% share", "share_by_gas": shares} if decades and shares else None


def _scenario_comparison_summary(r: dict) -> dict | None:
    """Per country: the pathways' shared starting point (the last year they still coincide) and each pathway's final-year value."""
    scenarios = r.get("scenarios") or {}
    names = list(scenarios)
    if not names:
        return None
    by_country: dict[str, dict[str, dict]] = {}
    for scenario, series in scenarios.items():
        for s in series or []:
            by_country.setdefault(s.get("name"), {})[scenario] = s
    countries = []
    for name, per in list(by_country.items())[:MAX_SUMMARY_SERIES]:
        final = {sc: _r1((s.get("values") or [None])[-1]) for sc, s in per.items()}
        final_year = next(((s.get("years") or [None])[-1] for s in per.values()), None)
        row: dict = {"name": name, "final_year": final_year, "final_by_scenario": final}
        series = [s for s in per.values() if s.get("years") and s.get("values")]
        if len(series) >= 2:
            ref, other = series[0], series[-1]
            shared = [(y, v) for y, v, w in zip(ref["years"], ref["values"], other["values"]) if v is not None and w is not None and abs(v - w) < 1e-6]
            if shared:
                # The last year the pathways coincide is where they start to diverge -- the projection's starting point (the
                # first projected year), not the last observed year, so it is never labelled "observed".
                row["starting_year"], row["starting_value"] = shared[-1][0], _r1(shared[-1][1])
        countries.append(row)
    return {"unit": "Mt CO\u2082", "scenarios": names, "countries": countries} if countries else None


def _cumulative_impact_summary(r: dict) -> dict | None:
    rows = [
        {
            "country": row.get("country"),
            "cumulative_by_scenario": {k: _r1(v) for k, v in (row.get("values") or {}).items()},
            "year_2040_by_scenario": {k: _r1(v) for k, v in (row.get("year_2040") or {}).items()},
            "current_level": _r1(row.get("current_level")),
        }
        for row in (r.get("rows") or [])[:10]
        if row.get("country")
    ]
    if not rows:
        return None
    out = {"sort_by": r.get("sort_by"), "scenarios": r.get("scenarios"), "rows": rows}
    if r.get("scope_note"):
        out["scope_note"] = r["scope_note"]
    return out


def widget_summary(record: ToolCallRecord) -> dict | None:
    r = _ok(record)
    if r is None:
        return None
    if record.tool_name in AREA2_TOOLS:
        s = r.get("summary")
        return s if isinstance(s, dict) else None
    if record.tool_name == "get_country_profile":
        return _profile_summary(r)
    if record.tool_name == "get_historical_emissions":
        return _historical_summary(r)
    if record.tool_name == "get_top_emitters":
        return _top_emitters_summary(r)
    if record.tool_name == "get_forecast_summary":
        return _forecast_summary(r)
    if record.tool_name == "get_forecast":
        return _forecast_tool_summary(r)
    if record.tool_name == "get_forecast_comparison":
        return _forecast_comparison_summary(r)
    if record.tool_name == "get_model_comparison":
        return _model_comparison_summary(r)
    if record.tool_name == "get_emissions_change_summary":
        return _change_summary(r)
    if record.tool_name == "get_gas_composition_by_decade":
        return _gas_by_decade_summary(r)
    if record.tool_name == "compare_scenarios_across_countries":
        return _scenario_comparison_summary(r)
    if record.tool_name == "get_scenario_cumulative_impact":
        return _cumulative_impact_summary(r)
    return None
