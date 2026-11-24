"""The Data Explorer's data sets (SPEC.md §5.37): one table per published source series, each with its own grain, columns, units, source and licence.

The registry below holds only fixed copy (titles, descriptions, the row label, the owning pages). Everything else is read at request time:
- the climate data sets read the harmonized layer (through `climate_loaders`' readers, uncached: see below); a data set's columns are every catalog indicator whose `source_series` and `scope` match, so a
  new indicator in the pipeline appears here with no change to this file. Nothing is recomputed;
- `owid_country` is `ghg_filtered.csv`, unchanged, with each column's unit from OWID's codebook;
- coverage, release, licence, citation and caveats come from `provenance.json`.

Each table is built from its input files **and the provenance that describes them, read together**, and cached on those files' modification stamps. Reading through the shared loader
caches would let a table pair data cached earlier (by another endpoint) with provenance read later, so the Explorer reads its own inputs fresh: data and attribution are always one snapshot,
and a refresh is picked up with no restart.

The data sets are never joined: a global value is never repeated on country rows. A missing climate store makes only the climate data sets unavailable.
"""

from __future__ import annotations

import io
import os
import re
import zipfile
from dataclasses import dataclass, replace
from datetime import datetime, timezone

import pandas as pd

from . import climate_loaders as cl
from . import data_loaders
from .constants import NON_SOVEREIGN
from .data_loaders import DataNotFoundError
from .routers.correlation import SOURCE_KEYS

SITE_URL = "https://degreesofcarbon.syena.io"
DEFAULT_DATASET = "owid_country"

COUNTRY_YEAR, GLOBAL_YEAR, GLOBAL_MONTH = "country_year", "global_year", "global_month"
OPEN, NON_COMMERCIAL, NON_COMMERCIAL_SHARE_ALIKE = "open", "non_commercial", "non_commercial_share_alike"

# The Data Explorer's long-standing default selection for the OWID table (it used to live in the page).
OWID_DEFAULT_COLUMNS = ("country", "year", "co2", "co2_per_capita", "population", "gdp", "total_ghg")
# A catalog indicator of these kinds is a base series and shown by default; derived ones (yoy, 5-year mean, index) and cumulative ones are offered, not shown.
BASE_KINDS = ("level", "anomaly", "uncertainty")

KEY_LABELS = {"country": "Country", "iso3": "ISO code", "year": "Year", "month": "Month"}
# Units of the monthly Mauna Loa file, which is not in the indicator catalog (it is read from its own CSV).
MONTHLY_COLUMNS = {"co2_ppm": ("Monthly mean CO2 concentration", "ppm"), "co2_deseasonalized_ppm": ("Deseasonalised CO2 concentration", "ppm")}


@dataclass(frozen=True)
class Dataset:
    id: str
    title: str
    source_label: str
    description: str
    row_label: str
    grain: str
    keys: tuple[str, ...]
    provenance_id: str
    chain_step: str
    series: str | None  # the catalog `source_series`; None for the two data sets that are not catalog-driven
    method_note: str
    charted_on: tuple[tuple[str, str], ...] = ()
    default_year_min: int | None = None  # opens here, though the slider still reaches the first year
    extra_default_columns: tuple[str, ...] = ()
    needs_climate_store: bool = True
    methods_anchor: str = "sources"
    # A licence this data set must be published under: a download whose provenance says otherwise (or nothing) is refused, never shipped without its notice.
    expected_licence_class: str | None = None


REGISTRY: tuple[Dataset, ...] = (
    Dataset(
        id="owid_country", title="Country emissions", source_label="Our World in Data",
        description="CO₂, other greenhouse gases and economic context for every sovereign country.",
        row_label="a country in a year", grain=COUNTRY_YEAR, keys=("country", "year"), provenance_id="owid_country_co2", chain_step="emissions", series=None,
        method_note="Every column is from the Our World in Data CO₂ dataset (Global Carbon Project) or derived from it, for sovereign countries; regional and income-group aggregates are removed.",
        charted_on=(("Historical Trends", "/historical"), ("Country Profile", "/country-profile")), needs_climate_store=False),
    Dataset(
        id="primap_country", title="Country emissions by gas", source_label="PRIMAP-hist",
        description="National greenhouse gas emissions by country and gas, in CO₂-equivalent (AR5 GWP-100).",
        row_label="a country in a year", grain=COUNTRY_YEAR, keys=("country", "iso3", "year"), provenance_id="primap_country_annual", chain_step="emissions", series="primap_country_annual",
        method_note="From PRIMAP-hist, country-reported scenario, excluding land use. Sovereign countries only, as in the Our World in Data table.",
        charted_on=(("Overview", "/overview"), ("Country Profile", "/country-profile")), default_year_min=1970, expected_licence_class=NON_COMMERCIAL_SHARE_ALIKE),
    Dataset(
        id="owid_world", title="World CO₂ emissions", source_label="Our World in Data",
        description="The world's annual CO₂ emissions, fossil and land-use, with their cumulative totals.",
        row_label="the world in a year", grain=GLOBAL_YEAR, keys=("year",), provenance_id="owid_world_co2_annual", chain_step="emissions", series="owid_world_co2_annual",
        method_note="From the World row of the Our World in Data CO₂ dataset; fossil CO₂ includes international aviation and shipping.",
        charted_on=(("Climate Correlation", "/climate-correlation"),)),
    Dataset(
        id="primap_global", title="Global emissions by gas", source_label="PRIMAP-hist",
        description="The world's national greenhouse gas emissions each year, by gas, in CO₂-equivalent (AR5 GWP-100).",
        row_label="the world (sum of national totals) in a year", grain=GLOBAL_YEAR, keys=("year",), provenance_id="primap_global_composition_annual", chain_step="emissions",
        series="primap_global_composition_annual",
        method_note="From PRIMAP-hist, country-reported scenario, excluding land use: the sum of the national totals, not a world aggregate.",
        charted_on=(("Climate Correlation", "/climate-correlation"),), default_year_min=1970, expected_licence_class=NON_COMMERCIAL_SHARE_ALIKE),
    Dataset(
        id="co2_annual", title="Atmospheric CO₂, annual", source_label="NOAA and Law Dome",
        description="The yearly average CO₂ concentration of the atmosphere, with its uncertainty where the source gives one.",
        row_label="the world in a year", grain=GLOBAL_YEAR, keys=("year",), provenance_id="co2_concentration_annual", chain_step="concentration", series="co2_concentration_annual",
        method_note="Mauna Loa annual means, joined to the Law Dome ice-core record for earlier years. See Methods & data for the splice.",
        charted_on=(("Climate Correlation", "/climate-correlation"),)),
    Dataset(
        id="co2_monthly", title="Atmospheric CO₂, monthly", source_label="Mauna Loa",
        description="Monthly mean CO₂ concentration at Mauna Loa, with a second column that removes the seasonal cycle.",
        row_label="the world in a month", grain=GLOBAL_MONTH, keys=("year", "month"), provenance_id="co2_concentration_monthly_mlo", chain_step="concentration", series=None,
        method_note="NOAA's monthly mean record at Mauna Loa, a single Northern-Hemisphere station.",
        charted_on=(("Climate Correlation", "/climate-correlation"),)),
    Dataset(
        id="temperature", title="Global temperature", source_label="Berkeley Earth",
        description="The global land and ocean temperature anomaly each year, against two reference periods, with its 95% interval.",
        row_label="the whole world in a year", grain=GLOBAL_YEAR, keys=("year",), provenance_id="temperature_anomaly_annual", chain_step="temperature", series="temperature_anomaly_annual",
        method_note="From Berkeley Earth's annual file. The 1850–1900 reference is computed from Berkeley Earth's own record.",
        charted_on=(("Climate Correlation", "/climate-correlation"),), extra_default_columns=("temperature_anomaly_1850_1900_c__mean5y",)),
)
_BY_ID = {d.id: d for d in REGISTRY}
DATASET_IDS = tuple(d.id for d in REGISTRY)


def get_dataset(dataset_id: str) -> Dataset | None:
    return _BY_ID.get(dataset_id)


# --- fresh readers: the loaders' own validation, without their caches ---


def _csv(name: str) -> pd.DataFrame:
    return cl._read_csv.__wrapped__(name, cl.climate_dir())  # `__wrapped__`: the cached function's uncached original


def _catalog() -> dict:
    return cl._read_json.__wrapped__("indicator_catalog.json", cl.climate_dir())


# --- labels and licence class ---

_ACRONYMS = ("co2", "ch4", "n2o", "ghg", "gdp", "gnp", "gni", "mae", "rmse", "ets", "iso")


def humanize_column(field: str) -> str:
    """Mirrors the front end's `humanize` (snake_case to Title Case, known acronyms upper-cased) so the OWID headers read as they always have."""
    titled = re.sub(r"\b\w", lambda m: m.group(0).upper(), field.replace("_", " "))
    return re.sub(r"\b(" + "|".join(_ACRONYMS) + r")\b", lambda m: m.group(0).upper(), titled, flags=re.I)


def licence_class(provenance_entry: dict | None) -> str | None:
    """open, non_commercial or non_commercial_share_alike, from the provenance licence string, in this one place. Read from the short licence first
    ("CC BY-NC-SA 4.0 · non-commercial"), the full one as a fallback; None when the entry names no licence at all."""
    if not provenance_entry:
        return None
    for key in ("short_license", "license"):
        text = provenance_entry.get(key)
        if not isinstance(text, str) or not text.strip():
            continue
        if re.search(r"\bBY-NC-SA\b", text, re.I):
            return NON_COMMERCIAL_SHARE_ALIKE
        if re.search(r"\bBY-NC\b", text, re.I):
            return NON_COMMERCIAL
        return OPEN
    return None


# --- tables ---


@dataclass(frozen=True)
class Table:
    df: pd.DataFrame  # the key columns first, sorted by the keys
    detail: tuple[dict, ...]  # one dict per column, in `df` order: id, label, unit, kind, decimals, is_key, default
    countries: tuple[str, ...]  # () for a global data set
    first: str
    last: str
    first_year: int
    last_year: int
    provenance: dict | None = None  # the provenance entry as it was when this table was built, so data and attribution describe the same snapshot


def _detail(id_: str, label: str, unit: str | None, kind: str | None, decimals: int | None, is_key: bool, default: bool) -> dict:
    return {"id": id_, "label": label, "unit": unit, "kind": kind, "decimals": decimals, "is_key": is_key, "default": default}


def _in_default_order(ds: Dataset, detail: list[dict], default_order: list[str]) -> list[dict]:
    """Keys first (in the data set's declared key order), then the default columns in the order given, then every other column as it came. The table's columns, `meta.columns` and `columns_detail` all follow this, so
    the picker lists the common columns first and the opening selection reads in a sensible order (not the source file's)."""
    rank = {c: i for i, c in enumerate(default_order)}
    keys = sorted((d for d in detail if d["is_key"]), key=lambda d: ds.keys.index(d["id"]) if d["id"] in ds.keys else len(ds.keys))
    defaults = sorted((d for d in detail if d["default"] and not d["is_key"]), key=lambda d: rank.get(d["id"], len(rank)))
    return keys + defaults + [d for d in detail if not d["default"] and not d["is_key"]]


def _finish(ds: Dataset, df: pd.DataFrame, detail: list[dict], default_order: list[str] | tuple[str, ...] = ()) -> Table:
    detail = _in_default_order(ds, detail, list(default_order))
    df = df[[d["id"] for d in detail]].sort_values(list(ds.keys), kind="stable").reset_index(drop=True)
    if df.empty:
        raise DataNotFoundError(f"{ds.title} has no rows")
    years = df["year"].astype(int)
    first_year, last_year = int(years.min()), int(years.max())
    if ds.grain == GLOBAL_MONTH:
        a, b = df.iloc[0], df.iloc[-1]
        first, last = f"{int(a['year'])}-{int(a['month']):02d}", f"{int(b['year'])}-{int(b['month']):02d}"
    else:
        first, last = str(first_year), str(last_year)
    countries = tuple(sorted(df["country"].dropna().unique().tolist())) if ds.grain == COUNTRY_YEAR else ()
    return Table(df, tuple(detail), countries, first, last, first_year, last_year)


def _owid_table(ds: Dataset) -> Table:
    df = data_loaders.load_filtered.__wrapped__()
    units = data_loaders.load_owid_codebook.__wrapped__()
    detail = [
        _detail(c, humanize_column(c), None if c in ds.keys else units.get(c), "key" if c in ds.keys else None, None, c in ds.keys, c in OWID_DEFAULT_COLUMNS)
        for c in df.columns
    ]
    return _finish(ds, df, detail, OWID_DEFAULT_COLUMNS)


def _indicators(ds: Dataset, scope: str) -> list[dict]:
    found = [i for i in _catalog().get("indicators", []) if isinstance(i, dict) and i.get("source_series") == ds.series and i.get("scope") == scope]
    if not found:
        raise cl.ClimateDataUnavailable(f"indicator_catalog.json lists no {scope} indicators for {ds.series}")
    return found


def _series(sub: pd.DataFrame, index) -> pd.Series:
    return pd.Series(sub["value"].to_numpy(dtype=float), index=index)


def _climate_detail(ds: Dataset, inds: list[dict], present: set[str], keys_detail: list[dict]) -> list[dict]:
    detail = list(keys_detail)
    for i in inds:
        if i["id"] not in present:
            continue
        default = i.get("kind") in BASE_KINDS or i["id"] in ds.extra_default_columns
        detail.append(_detail(i["id"], i.get("name") or humanize_column(i["id"]), i.get("unit"), i.get("kind"), i.get("decimals"), False, default))
    return detail


def _climate_default_order(ds: Dataset, inds: list[dict]) -> list[str]:
    """The base series in catalog order, then the data set's extra defaults (the temperature 5-year mean) last."""
    return [i["id"] for i in inds if i.get("kind") in BASE_KINDS] + list(ds.extra_default_columns)


def _global_table(ds: Dataset) -> Table:
    inds = _indicators(ds, "global")
    long = _csv("harmonized_global_annual.csv")
    if not {"indicator_id", "year", "value"} <= set(long.columns):
        raise cl.ClimateDataUnavailable("harmonized_global_annual.csv lacks indicator_id/year/value columns")
    cols = {}
    for i in inds:
        sub = long[long["indicator_id"] == i["id"]].drop_duplicates("year", keep="last")
        if not sub.empty:
            cols[i["id"]] = _series(sub, sub["year"].astype(int).to_numpy())
    if not cols:
        raise cl.ClimateDataUnavailable(f"harmonized_global_annual.csv has no rows for {ds.series}")
    # An outer join of one series per indicator, not a pivot: the pipeline README warns off dense reshapes.
    wide = pd.concat(cols, axis=1).sort_index()
    wide.index.name = "year"
    df = wide.reset_index()
    keys = [_detail("year", KEY_LABELS["year"], None, "key", None, True, True)]
    return _finish(ds, df, _climate_detail(ds, inds, set(cols), keys), _climate_default_order(ds, inds))


def _country_names() -> dict[str, str]:
    """iso3 -> display name for sovereign countries: the crosswalk's `entity_type == "country"` rows, named as OWID names them (`owid_name`, else `primap_name`),
    minus `NON_SOVEREIGN`, so the two country data sets offer comparable country lists."""
    cw = _csv("country_crosswalk.csv")
    if not {"iso3", "primap_name", "owid_name", "entity_type"} <= set(cw.columns):
        raise cl.ClimateDataUnavailable("country_crosswalk.csv lacks iso3/primap_name/owid_name/entity_type columns")
    cw = cw[cw["entity_type"] == "country"]
    names: dict[str, str] = {}
    for iso3, owid_name, primap_name in zip(cw["iso3"], cw["owid_name"], cw["primap_name"]):
        name = owid_name if isinstance(owid_name, str) and owid_name.strip() else primap_name
        if isinstance(iso3, str) and isinstance(name, str) and name not in NON_SOVEREIGN:
            names[iso3] = name
    return names


def _country_table(ds: Dataset) -> Table:
    inds = _indicators(ds, "country")
    long = _csv("harmonized_country_annual.csv")
    if not {"indicator_id", "iso3", "year", "value"} <= set(long.columns):
        raise cl.ClimateDataUnavailable("harmonized_country_annual.csv lacks indicator_id/iso3/year/value columns")
    cols = {}
    for i in inds:
        sub = long[long["indicator_id"] == i["id"]].drop_duplicates(["iso3", "year"], keep="last")
        if not sub.empty:
            cols[i["id"]] = _series(sub, pd.MultiIndex.from_arrays([sub["iso3"].to_numpy(), sub["year"].astype(int).to_numpy()], names=["iso3", "year"]))
    if not cols:
        raise cl.ClimateDataUnavailable(f"harmonized_country_annual.csv has no rows for {ds.series}")
    df = pd.concat(cols, axis=1).sort_index().reset_index()
    names = _country_names()
    df.insert(0, "country", df["iso3"].map(names))
    df = df[df["country"].notna()]
    keys = [_detail(k, KEY_LABELS[k], None, "key", None, True, True) for k in ("country", "iso3", "year")]
    return _finish(ds, df, _climate_detail(ds, inds, set(cols), keys), _climate_default_order(ds, inds))


def _monthly_table(ds: Dataset) -> Table:
    df = _csv("co2_concentration_monthly_mlo.csv")
    if not {"year", "month", "co2_ppm"} <= set(df.columns):
        raise cl.ClimateDataUnavailable("co2_concentration_monthly_mlo.csv lacks year/month/co2_ppm columns")
    value_cols = [c for c in MONTHLY_COLUMNS if c in df.columns]
    df = df[["year", "month", *value_cols]].copy()
    keys = [_detail(k, KEY_LABELS[k], None, "key", None, True, True) for k in ("year", "month")]
    detail = keys + [_detail(c, MONTHLY_COLUMNS[c][0], MONTHLY_COLUMNS[c][1], "level", 2, False, True) for c in value_cols]
    return _finish(ds, df, detail)


def _inputs(ds: Dataset) -> tuple[str, ...]:
    """Every file a table is built from, provenance last: the cache key is these files' stamps."""
    d = cl.climate_dir()
    prov = os.path.join(d, "provenance.json")
    if ds.id == "owid_country":
        return (data_loaders._path("ghg_filtered.csv"), data_loaders._path("owid-co2-codebook.csv"), prov)
    names = {GLOBAL_MONTH: ("co2_concentration_monthly_mlo.csv",), COUNTRY_YEAR: ("indicator_catalog.json", "harmonized_country_annual.csv", "country_crosswalk.csv"),
             GLOBAL_YEAR: ("indicator_catalog.json", "harmonized_global_annual.csv")}[ds.grain]
    return tuple(os.path.join(d, n) for n in names) + (prov,)


def _stamp(path: str):
    try:
        st = os.stat(path)
    except OSError:
        return None
    return (st.st_mtime_ns, st.st_size)


# (data set, its input paths, their stamps) -> table. Taken before reading, so a file rewritten mid-build is simply rebuilt on the next request.
_TABLES: dict[tuple, Table] = {}


def _provenance_snapshot(ds: Dataset) -> dict | None:
    path = os.path.join(cl.climate_dir(), "provenance.json")
    if not os.path.exists(path):
        return None
    try:
        entry = cl._read_provenance.__wrapped__(path, 0.0).get(ds.provenance_id)
    except cl.ClimateDataUnavailable:
        return None
    return entry if isinstance(entry, dict) else None


def _cached(ds: Dataset, build) -> Table:
    paths = _inputs(ds)
    key = (ds.id, paths, tuple(_stamp(p) for p in paths))
    hit = _TABLES.get(key)
    if hit is not None:
        return hit
    # The data and the provenance it is attributed to are read in this one build, so they cannot come from different moments.
    table = replace(build(), provenance=_provenance_snapshot(ds))
    for stale in [k for k in _TABLES if k[:2] == key[:2]]:
        del _TABLES[stale]  # an earlier build of this data set, from files that have since changed
    _TABLES[key] = table
    return table


def load_table(ds: Dataset) -> Table:
    """The data set's table. Raises DataNotFoundError (a 503 with the reason) when its source is missing or unusable; never takes another data set down."""
    if ds.id == "owid_country":
        return _cached(ds, lambda: _owid_table(ds))
    build = _country_table if ds.grain == COUNTRY_YEAR else _monthly_table if ds.grain == GLOBAL_MONTH else _global_table
    return _cached(ds, lambda: build(ds))


def clear_caches() -> None:
    _TABLES.clear()


# --- provenance ---


def source_block(ds: Dataset, table: Table) -> dict | None:
    e = table.provenance
    if e is None:
        return None
    keep = {k: e[k] for k in SOURCE_KEYS if k in e and k != "source"}
    release = keep.get("source_release")
    return {**keep, "provenance_id": ds.provenance_id, "name": e.get("source"), "source_release": release if isinstance(release, (dict, str)) else None,
            "landing_links": [x for x in (keep.get("landing_links") or []) if isinstance(x, dict)],
            "source_urls": [x for x in (keep.get("source_urls") or []) if isinstance(x, str)],
            "caveats": [x for x in (keep.get("caveats") or []) if isinstance(x, str)],
            "citations": [x for x in (keep.get("citations") or []) if isinstance(x, str)]}


def excluded_incomplete_years(table: Table) -> list[int]:
    """Years the pipeline held back as incomplete (PRIMAP-hist's latest year, today), straight from the provenance entry."""
    e = table.provenance or {}
    out = {int(x["year"]) for x in (e.get("excluded_incomplete_years") or []) if isinstance(x, dict) and isinstance(x.get("year"), (int, float))}
    return sorted(out)


def _text(x) -> bool:
    return isinstance(x, str) and bool(x.strip())


def attribution_gap(ds: Dataset, table: Table) -> str | None:
    """Why this data set's download cannot carry the licence and citation it needs, or None. The data sets read from the climate store are shared under licences that
    require both to travel with them (PRIMAP-hist's CC BY-NC-SA above all), so an absent or incomplete provenance entry means no download, never a bare one."""
    if not ds.needs_climate_store:
        return None
    e = table.provenance
    if not e:
        return "its provenance (licence and citation) is not available"
    if not (_text(e.get("license")) or _text(e.get("short_license"))):
        return "its provenance names no licence"
    if not (_text(e.get("required_citation_format")) or _text(e.get("short_citation")) or any(_text(c) for c in (e.get("citations") or []))):
        return "its provenance names no citation"
    if ds.expected_licence_class and licence_class(e) != ds.expected_licence_class:
        return f"its provenance does not give the {ds.expected_licence_class.replace('_', '-')} licence this data set is published under"
    return None


def default_year_range(ds: Dataset, table: Table) -> list[int]:
    lo = max(table.first_year, ds.default_year_min) if ds.default_year_min else table.first_year
    return [min(lo, table.last_year), table.last_year]


def listing(ds: Dataset) -> dict:
    """One entry of GET /explorer/datasets."""
    base = {
        "id": ds.id, "title": ds.title, "source_label": ds.source_label, "description": ds.description, "row_label": ds.row_label, "grain": ds.grain, "keys": list(ds.keys),
        "chain_step": ds.chain_step, "charted_on": [{"label": a, "path": b} for a, b in ds.charted_on], "method_note": ds.method_note, "methods_anchor": ds.methods_anchor,
    }
    try:
        table = load_table(ds)
    except DataNotFoundError as e:
        return {**base, "available": False, "unavailable_reason": e.message, "coverage": None, "default_year_range": None, "licence_class": None, "source": None,
                "excluded_incomplete_years": []}
    source = source_block(ds, table)
    return {**base, "available": True, "unavailable_reason": None,
            "coverage": {"first": table.first, "last": table.last, "countries": len(table.countries) if ds.grain == COUNTRY_YEAR else None},
            "default_year_range": default_year_range(ds, table), "licence_class": licence_class(table.provenance), "source": source,
            "excluded_incomplete_years": excluded_incomplete_years(table)}


# --- summary and download ---


def _num(x) -> float | None:
    return None if pd.isna(x) else float(x)


def summary_rows(table: Table, df: pd.DataFrame) -> list[dict]:
    """One row per selected non-key numeric column over the filtered rows; keys and text columns are not summarised."""
    by_id = {d["id"]: d for d in table.detail}
    rows = []
    for c in df.columns:
        d = by_id.get(c, {})
        if d.get("is_key") or not pd.api.types.is_numeric_dtype(df[c]) or pd.api.types.is_bool_dtype(df[c]):
            continue
        s = df[c]
        n = int(s.notna().sum())
        q = s.quantile([0.25, 0.5, 0.75]) if n else pd.Series([float("nan")] * 3, index=[0.25, 0.5, 0.75])
        rows.append({"column": c, "label": d.get("label", c), "unit": d.get("unit"), "count": n, "missing": int(len(s) - n),
                     "min": _num(s.min()) if n else None, "p25": _num(q[0.25]), "median": _num(q[0.5]), "mean": _num(s.mean()) if n else None,
                     "p75": _num(q[0.75]), "max": _num(s.max()) if n else None})
    return rows


SUMMARY_COLUMNS = ["column", "label", "unit", "count", "missing", "min", "p25", "median", "mean", "p75", "max"]


def _release_text(source: dict) -> str:
    rel = source.get("source_release")
    if isinstance(rel, dict) and rel:
        return "; ".join(f"{k}: {v}" for k, v in rel.items())
    if isinstance(rel, str) and rel.strip():
        return rel
    return f"retrieved {source['retrieved_at']}" if source.get("retrieved_at") else "not recorded"


def attribution_text(ds: Dataset, table: Table, countries: list[str] | None, year_range: tuple[int, int], columns: list[str], now: datetime | None = None) -> str:
    """ATTRIBUTION.txt, built only from provenance and the request (SPEC.md §5.37)."""
    now = now or datetime.now(timezone.utc)
    source = source_block(ds, table)
    lines = [f"Degrees of Carbon: {ds.title} ({ds.source_label})", f"Downloaded {now.strftime('%Y-%m-%d %H:%M:%S')} UTC from {SITE_URL}/data-explorer?dataset={ds.id}", ""]
    if source:
        links = [x.get("url") for x in source["landing_links"] if x.get("url")] + source["source_urls"]
        lines += [f"Source:    {source.get('name') or ds.source_label}", f"Release:   {_release_text(source)}",
                  f"Cite as:   {source.get('required_citation_format') or source.get('short_citation') or 'see the source'}",
                  f"Licence:   {source.get('license') or source.get('short_license') or 'see the source'}", f"Links:     {', '.join(dict.fromkeys(links)) or 'none recorded'}"]
        if _text(source.get("land_use_license_note")):
            lines.append(f"Land-use CO2: {source['land_use_license_note']}")
        if source["citations"]:
            lines += ["", "Citations:"] + [f"- {c}" for c in source["citations"]]
    else:
        lines += [f"Source:    {ds.source_label}", "Provenance was not available for this download: see the source's own page for its licence and citation."]
    by_id = {d["id"]: d for d in table.detail}
    lines += ["", "Changes made by Degrees of Carbon:",
              f"- Filtered to {', '.join(countries) if countries else 'all countries' if ds.grain == COUNTRY_YEAR else 'the whole series'}, {year_range[0]}–{year_range[1]}, columns: {', '.join(columns)}"]
    if any(by_id.get(c, {}).get("kind") in ("derived", "cumulative") for c in columns):
        # The catalog does not say which cumulative series a source publishes itself (only OWID's own fossil CO2 cumulative is one), so all are disclosed.
        lines.append("- Year-on-year %, trailing 5-year means, indices and cumulative totals are computed by the Degrees of Carbon pipeline from the source series (see Methods & data); "
                     "a cumulative column the source publishes itself is noted in its catalog description.")
    if ds.id == "owid_country":
        lines.append("- Sovereign countries only; regional and income-group aggregates removed.")
    if ds.id == "primap_country":
        lines.append("- Sovereign countries only; areas that are not sovereign countries removed.")
    caveats = (source or {}).get("caveats") or []
    if caveats:
        lines += ["", "Caveats:"] + [f"- {c}" for c in caveats]
    if licence_class(table.provenance) == NON_COMMERCIAL_SHARE_ALIKE:
        lines += ["", "This file contains data derived from PRIMAP-hist and is shared under CC BY-NC-SA 4.0. Any data you publish from it must carry the same licence and this "
                      "attribution. Non-commercial use only."]
    return "\n".join(lines) + "\n"


def build_zip(ds: Dataset, table: Table, df: pd.DataFrame, countries: list[str] | None, year_min: int | None, year_max: int | None) -> tuple[bytes, str]:
    """(the zip, its file name): `<dataset>.csv` (the selected columns and filters) and `ATTRIBUTION.txt`."""
    lo = int(df["year"].min()) if "year" in df.columns and len(df) else (year_min if year_min is not None else table.first_year)
    hi = int(df["year"].max()) if "year" in df.columns and len(df) else (year_max if year_max is not None else table.last_year)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{ds.id}.csv", df.to_csv(index=False))
        z.writestr("ATTRIBUTION.txt", attribution_text(ds, table, countries, (lo, hi), df.columns.tolist()))
    return buf.getvalue(), f"degrees-of-carbon_{ds.id}_{lo}-{hi}.zip"
