"""The Data Explorer's data set switcher (SPEC.md §5.37): `/api/explorer/datasets` and the `dataset` parameter on the four explorer endpoints.

Contract fixture: the climate directory is produced by running the REAL `pipeline` harmonize stage on small stubbed inputs (the same writer the pipeline's own tests use), as
`test_correlation.py` does, so a change to the pipeline's output schema breaks these tests rather than production. Only what the stage does not write (the crosswalk, the monthly
CSV, a few provenance fields) is added by hand. Nothing touches the real data/climate.
"""

import io
import json
import shutil
import zipfile

import pytest
from fastapi.testclient import TestClient

from api import climate_loaders as cl
from api import explorer_datasets as ed
from api.main import app
from pipeline.tests.test_harmonize import run as run_harmonize

CHAIN = ["owid_country", "primap_country", "owid_world", "primap_global", "co2_annual", "co2_monthly", "temperature"]

# The crosswalk maps only some of the stub's 210 areas (A000..A209): unmapped areas must not appear as countries.
CROSSWALK = (
    "iso3,primap_name,owid_name,entity_type,match,name_differs,note,expanded\n"
    "A000,Aland,Aland,country,exact,False,,True\n"
    "A001,Bland,,country,primap_only,False,,False\n"  # blank owid_name: falls back to the PRIMAP name
    "A002,Worldia,World,country,exact,False,,False\n"  # an OWID aggregate name that slipped in as a country: NON_SOVEREIGN removes it
    "A003,Blocland,Blocland,aggregate,exact,False,,False\n"  # not a country at all
    "A004,Cland,Cland,country,exact,False,,False\n"
)
MONTHLY = "year,month,co2_ppm,co2_deseasonalized_ppm\n1958,4,317.4,315.1\n1958,3,315.7,314.4\n2024,2,424.0,\n2024,1,422.8,422.5\n"  # deliberately unsorted

# Real provenance strings (the Mac Studio's data/climate/provenance.json, 2026-11-24), for the licence class.
REAL_LICENCES = [
    ("owid_country_co2", "CC BY 4.0 (OWID compilation)", "CC BY 4.0 for OWID's compilation (OWID's README). Per that README, third-party data it republishes", "open"),
    ("co2_concentration_annual", "Public domain (NOAA); cite Law Dome", "NOAA GML: public domain, citation requested. Law Dome: cite Etheridge et al. 2010", "open"),
    ("co2_concentration_monthly_mlo", "Public domain; cite NOAA GML", "NOAA GML: public domain, citation requested.", "open"),
    ("primap_country_annual", "CC BY-NC-SA 4.0 · non-commercial", "CC BY-NC-SA 4.0 (Zenodo/description; since v2.8). The dataset's YAML 'rights' field omits ShareAlike", "non_commercial_share_alike"),
    ("temperature_anomaly_annual", "CC BY-NC 4.0 · non-commercial", "CC BY-NC 4.0 International (Berkeley Earth's data page: 'in general ... for non-commercial use only'", "non_commercial"),
]


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    d = tmp_path_factory.mktemp("explorer_climate")
    run_harmonize(d)
    (d / "country_crosswalk.csv").write_text(CROSSWALK)
    (d / "co2_concentration_monthly_mlo.csv").write_text(MONTHLY)
    prov = json.loads((d / "provenance.json").read_text())
    prov["co2_concentration_monthly_mlo"] = {"source": "NOAA GML Mauna Loa monthly mean", "coverage": [1958, 2024], "license": "NOAA GML: public domain, citation requested.",
                                             "short_license": "Public domain; cite NOAA GML", "retrieved_at": "2026-11-10T09:30:49+00:00", "source_release": {"noaa_last_modified": "2026-10-09"},
                                             "source_urls": ["https://example.org/mlo.csv"], "landing_links": [{"label": "NOAA", "url": "https://gml.noaa.gov/ccgg/trends/"}]}
    prov["owid_country_co2"] = {"source": "Our World in Data CO2 and GHG emissions dataset", "coverage": [1750, 2024], "license": "CC BY 4.0 for OWID's compilation.",
                                "short_license": "CC BY 4.0 (OWID compilation)", "retrieved_at": "2026-11-10T09:30:06+00:00", "short_citation": "Our World in Data",
                                "required_citation_format": "Global Carbon Project. (<year>).", "source_urls": ["https://example.org/owid.csv"]}
    for pid in ("primap_country_annual", "primap_global_composition_annual"):
        prov[pid]["short_license"] = "CC BY-NC-SA 4.0 · non-commercial"
        prov[pid]["caveats"] = ["National totals exclude international aviation and shipping."]
        prov[pid]["excluded_incomplete_years"] = [{"year": 2025, "reasons": "total -28.3% vs prior year"}]
    prov["temperature_anomaly_annual"]["short_license"] = "CC BY-NC 4.0 · non-commercial"
    (d / "provenance.json").write_text(json.dumps(prov))
    return d


@pytest.fixture
def climate(built, tmp_path, monkeypatch):
    d = tmp_path / "climate"
    shutil.copytree(built, d)
    monkeypatch.setattr(cl, "CLIMATE_DIR", str(d))
    cl.clear_caches()
    ed.clear_caches()
    yield d
    cl.clear_caches()
    ed.clear_caches()


@pytest.fixture
def ex(climate, full_data):
    """A client with both stores present: the OWID fixture CSVs and the climate directory."""
    return TestClient(app)


def datasets(client):
    r = client.get("/api/explorer/datasets")
    assert r.status_code == 200
    return {d["id"]: d for d in r.json()["datasets"]}, [d["id"] for d in r.json()["datasets"]]


# --- the list ---


def test_datasets_are_listed_in_chain_order_and_all_available(ex):
    by_id, order = datasets(ex)
    assert order == CHAIN
    assert all(d["available"] and d["unavailable_reason"] is None for d in by_id.values())
    assert [by_id[i]["chain_step"] for i in CHAIN] == ["emissions"] * 4 + ["concentration"] * 2 + ["temperature"]


def test_every_figure_on_the_card_is_read_not_hard_coded(ex):
    by_id, _ = datasets(ex)
    assert by_id["owid_country"]["coverage"] == {"first": "1990", "last": "2023", "countries": 4}
    assert by_id["temperature"]["coverage"] == {"first": "1850", "last": "2024", "countries": None}
    assert by_id["co2_monthly"]["coverage"] == {"first": "1958-03", "last": "2024-02", "countries": None}  # YYYY-MM for a monthly data set
    assert by_id["primap_country"]["coverage"]["countries"] == 3  # Aland, Bland, Cland: the aggregate and the NON_SOVEREIGN name are not countries
    assert by_id["temperature"]["source"]["short_license"] == "CC BY-NC 4.0 · non-commercial"
    assert by_id["temperature"]["source"]["provenance_id"] == "temperature_anomaly_annual"


def test_primap_opens_at_1970_and_the_others_at_full_coverage(ex):
    by_id, _ = datasets(ex)
    assert by_id["primap_country"]["default_year_range"] == [1970, 2024]
    assert by_id["primap_global"]["default_year_range"][0] == 1970
    assert by_id["temperature"]["default_year_range"] == [1850, 2024]
    assert by_id["owid_country"]["default_year_range"] == [1990, 2023]
    meta = ex.get("/api/explorer/meta", params={"dataset": "primap_global"}).json()
    assert meta["year_min"] == 1750  # the slider still reaches the first year


def test_licence_class_and_excluded_years_come_from_provenance(ex):
    by_id, _ = datasets(ex)
    assert [by_id[i]["licence_class"] for i in CHAIN] == ["open", "non_commercial_share_alike", "open", "non_commercial_share_alike", "open", "open", "non_commercial"]
    assert by_id["primap_global"]["excluded_incomplete_years"] == [2025]
    assert by_id["temperature"]["excluded_incomplete_years"] == []
    assert [c["path"] for c in by_id["owid_country"]["charted_on"]] == ["/historical", "/country-profile"]


def test_without_the_climate_store_only_the_owid_table_stays_available(full_data, tmp_path, monkeypatch):
    monkeypatch.setattr(cl, "CLIMATE_DIR", str(tmp_path / "nope"))
    cl.clear_caches()
    ed.clear_caches()
    c = TestClient(app)
    by_id, order = datasets(c)
    assert order == CHAIN
    assert by_id["owid_country"]["available"] and by_id["owid_country"]["source"] is None and by_id["owid_country"]["licence_class"] is None
    for i in CHAIN[1:]:
        assert by_id[i]["available"] is False and "has not been generated" in by_id[i]["unavailable_reason"]
    assert c.get("/api/explorer/meta", params={"dataset": "temperature"}).status_code == 503
    assert c.get("/api/explorer/meta").status_code == 200  # the default data set never depends on the climate store


@pytest.mark.parametrize("pid,short,full,expected", REAL_LICENCES)
def test_licence_class_derives_from_each_real_provenance_string(pid, short, full, expected):
    assert ed.licence_class({"short_license": short, "license": full}) == expected
    assert ed.licence_class({"license": full}) == expected  # the full string alone gives the same class
    assert ed.licence_class(None) is None and ed.licence_class({}) is None


# --- one data set at a time ---


def test_unknown_dataset_is_422_on_every_endpoint(ex):
    for path in ("meta", "data", "summary", "download"):
        r = ex.get(f"/api/explorer/{path}", params={"dataset": "nope"})
        assert r.status_code == 422 and "owid_country" in r.json()["detail"], path


def test_countries_on_a_global_data_set_is_422(ex):
    for ds in ("temperature", "co2_monthly", "owid_world"):
        r = ex.get("/api/explorer/data", params={"dataset": ds, "countries": ["China"]})
        assert r.status_code == 422 and "global data set" in r.json()["detail"], ds
    assert ex.get("/api/explorer/summary", params={"dataset": "temperature", "countries": ["x"]}).status_code == 422
    assert ex.get("/api/explorer/download", params={"dataset": "temperature", "countries": ["x"]}).status_code == 422


def test_meta_for_a_global_year_grain_carries_units_from_the_catalog(ex):
    m = ex.get("/api/explorer/meta", params={"dataset": "temperature"}).json()
    assert (m["dataset"], m["grain"], m["keys"], m["countries"]) == ("temperature", "global_year", ["year"], [])
    assert m["columns"][0] == "year"
    d = {c["id"]: c for c in m["columns_detail"]}
    assert d["year"]["is_key"] and d["year"]["unit"] is None
    assert d["temperature_anomaly_1850_1900_c"]["unit"] == "°C" and d["temperature_anomaly_1850_1900_c"]["label"].startswith("Global temperature anomaly")
    assert d["temperature_anomaly_1850_1900_c"]["default"] is True
    assert d["temperature_anomaly_1850_1900_c__mean5y"]["default"] is True  # temperature also opens on the 5-year mean
    assert d["temperature_anomaly_1850_1900_c__mean5y"]["kind"] == "derived"
    assert [c["id"] for c in m["columns_detail"]] == m["columns"]


def test_global_data_sets_default_to_base_series_not_derived_or_cumulative(ex):
    m = ex.get("/api/explorer/meta", params={"dataset": "primap_global"}).json()
    default = {c["id"] for c in m["columns_detail"] if c["default"]}
    assert {"year", "primap_ghg_total_mtco2e", "primap_co2_mt", "primap_ch4_mtco2e", "primap_n2o_mtco2e", "primap_fgas_mtco2e"} <= default
    assert not any(c["kind"] in ("derived", "cumulative") for c in m["columns_detail"] if c["default"])
    assert any(c["kind"] == "derived" for c in m["columns_detail"])  # offered, just not shown


def test_monthly_grain_has_year_and_month_keys_sorted_and_units_from_the_registry(ex):
    m = ex.get("/api/explorer/meta", params={"dataset": "co2_monthly"}).json()
    assert (m["grain"], m["keys"], m["columns"]) == ("global_month", ["year", "month"], ["year", "month", "co2_ppm", "co2_deseasonalized_ppm"])
    assert {c["id"]: c["unit"] for c in m["columns_detail"]}["co2_ppm"] == "ppm"
    rows = ex.get("/api/explorer/data", params={"dataset": "co2_monthly"}).json()["rows"]
    assert [(r["year"], r["month"]) for r in rows] == [(1958, 3), (1958, 4), (2024, 1), (2024, 2)]
    assert rows[-1]["co2_deseasonalized_ppm"] is None  # a missing value is null, never NaN
    assert [r["year"] for r in ex.get("/api/explorer/data", params={"dataset": "co2_monthly", "year_min": 2000}).json()["rows"]] == [2024, 2024]


def test_country_grain_names_countries_and_filters_by_country_and_year(ex):
    m = ex.get("/api/explorer/meta", params={"dataset": "primap_country"}).json()
    assert m["countries"] == ["Aland", "Bland", "Cland"]  # blank owid_name -> primap_name; "World" (NON_SOVEREIGN) and the aggregate are out
    assert m["keys"] == ["country", "iso3", "year"] and m["columns"][:3] == ["country", "iso3", "year"]
    r = ex.get("/api/explorer/data", params={"dataset": "primap_country", "countries": ["Bland"], "year_min": 2020, "year_max": 2022}).json()
    assert r["total_rows"] == 3 and {row["country"] for row in r["rows"]} == {"Bland"} and [row["year"] for row in r["rows"]] == [2020, 2021, 2022]
    assert {row["iso3"] for row in r["rows"]} == {"A001"}


def test_countries_are_sovereign_only_and_matched_on_the_owid_name(ex):
    names = set(ex.get("/api/explorer/meta", params={"dataset": "primap_country"}).json()["countries"])
    assert "World" not in names and "Worldia" not in names and "Blocland" not in names


def test_columns_follow_source_series_so_a_new_indicator_appears_with_no_code_change(ex, climate):
    cat = json.loads((climate / "indicator_catalog.json").read_text())
    cat["indicators"].append({"id": "temperature_new_c", "name": "A new temperature series", "unit": "°C", "kind": "level", "scope": "global", "decimals": 2,
                              "source_series": "temperature_anomaly_annual"})
    (climate / "indicator_catalog.json").write_text(json.dumps(cat))
    with open(climate / "harmonized_global_annual.csv", "a") as f:
        f.write("temperature_new_c,2000,0.5\ntemperature_new_c,2001,0.6\n")
    cl.clear_caches()
    m = ex.get("/api/explorer/meta", params={"dataset": "temperature"}).json()
    assert "temperature_new_c" in m["columns"]
    rows = ex.get("/api/explorer/data", params={"dataset": "temperature", "columns": ["year", "temperature_new_c"], "year_min": 2000, "year_max": 2001}).json()["rows"]
    assert [r["temperature_new_c"] for r in rows] == [0.5, 0.6]
    assert "temperature_new_c" not in ex.get("/api/explorer/meta", params={"dataset": "owid_world"}).json()["columns"]  # other data sets are untouched


def test_a_missing_source_makes_only_that_data_set_unavailable(ex, climate):
    (climate / "co2_concentration_monthly_mlo.csv").unlink()
    cl.clear_caches()
    by_id, _ = datasets(ex)
    assert by_id["co2_monthly"]["available"] is False and "co2_concentration_monthly_mlo.csv" in by_id["co2_monthly"]["unavailable_reason"]
    assert all(by_id[i]["available"] for i in CHAIN if i != "co2_monthly")
    r = ex.get("/api/explorer/data", params={"dataset": "co2_monthly"})
    assert r.status_code == 503 and "co2_concentration_monthly_mlo.csv" in r.json()["detail"]


# --- summary ---


def test_summary_covers_only_non_key_numeric_columns_and_count_plus_missing_is_the_row_count(ex):
    body = ex.get("/api/explorer/summary", params={"dataset": "co2_monthly"}).json()
    rows = {r["column"]: r for r in body["rows"]}
    assert set(rows) == {"co2_ppm", "co2_deseasonalized_ppm"}  # year and month are keys
    assert rows["co2_ppm"]["count"] == 4 and rows["co2_ppm"]["missing"] == 0
    assert rows["co2_deseasonalized_ppm"]["count"] == 3 and rows["co2_deseasonalized_ppm"]["missing"] == 1
    for r in rows.values():
        assert r["count"] + r["missing"] == 4 and r["unit"] == "ppm"
    filtered = ex.get("/api/explorer/summary", params={"dataset": "co2_monthly", "year_min": 2024}).json()["rows"]
    assert all(r["count"] + r["missing"] == 2 for r in filtered)
    assert {r["column"]: r["median"] for r in filtered}["co2_ppm"] == pytest.approx(423.4)


def test_summary_of_country_data_leaves_out_country_and_iso3(ex):
    cols = {r["column"] for r in ex.get("/api/explorer/summary", params={"dataset": "primap_country"}).json()["rows"]}
    assert "country" not in cols and "iso3" not in cols and "year" not in cols and "primap_country_co2_mt" in cols


# --- download ---


def unzip(resp):
    z = zipfile.ZipFile(io.BytesIO(resp.content))
    return z, {n: z.read(n).decode() for n in z.namelist()}


def test_download_is_a_zip_of_the_csv_and_the_attribution_file(ex):
    r = ex.get("/api/explorer/download", params={"dataset": "temperature", "year_min": 2000, "year_max": 2010, "columns": ["year", "temperature_anomaly_1850_1900_c"]})
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    assert r.headers["content-disposition"] == 'attachment; filename="degrees-of-carbon_temperature_2000-2010.zip"'
    _, files = unzip(r)
    assert sorted(files) == ["ATTRIBUTION.txt", "temperature.csv"]
    assert files["temperature.csv"].splitlines()[0] == "year,temperature_anomaly_1850_1900_c" and len(files["temperature.csv"].splitlines()) == 12
    att = files["ATTRIBUTION.txt"]
    assert "CC BY-NC 4.0" in att and "Licence:" in att and "Cite as:" in att and "2000–2010" in att and "dataset=temperature" in att
    assert "CC BY-NC-SA" not in att  # the share-alike paragraph is PRIMAP's alone


def test_primap_downloads_carry_the_share_alike_notice_and_the_owid_one_does_not(ex):
    _, primap = unzip(ex.get("/api/explorer/download", params={"dataset": "primap_global"}))
    assert "shared under CC BY-NC-SA 4.0" in primap["ATTRIBUTION.txt"] and "Non-commercial use only" in primap["ATTRIBUTION.txt"]
    assert "National totals exclude international aviation and shipping." in primap["ATTRIBUTION.txt"]
    _, country = unzip(ex.get("/api/explorer/download", params={"dataset": "primap_country", "countries": ["Aland"]}))
    assert "shared under CC BY-NC-SA 4.0" in country["ATTRIBUTION.txt"] and "Aland" in country["ATTRIBUTION.txt"]
    _, owid = unzip(ex.get("/api/explorer/download", params={"countries": ["Kenya"]}))
    assert "CC BY 4.0" in owid["ATTRIBUTION.txt"] and "shared under CC BY-NC-SA" not in owid["ATTRIBUTION.txt"]
    assert "regional and income-group aggregates removed" in owid["ATTRIBUTION.txt"] and "Kenya" in owid["ATTRIBUTION.txt"]


def test_derived_columns_are_disclosed_in_the_attribution(ex):
    _, files = unzip(ex.get("/api/explorer/download", params={"dataset": "temperature", "columns": ["year", "temperature_anomaly_1850_1900_c__mean5y"]}))
    assert "computed by the Degrees of Carbon pipeline" in files["ATTRIBUTION.txt"]
    _, base = unzip(ex.get("/api/explorer/download", params={"dataset": "temperature", "columns": ["year", "temperature_anomaly_1850_1900_c"]}))
    assert "computed by the Degrees of Carbon pipeline" not in base["ATTRIBUTION.txt"]


def test_attribution_without_provenance_says_so_instead_of_inventing_a_licence(full_data, tmp_path, monkeypatch):
    monkeypatch.setattr(cl, "CLIMATE_DIR", str(tmp_path / "nope"))
    cl.clear_caches()
    ed.clear_caches()
    _, files = unzip(TestClient(app).get("/api/explorer/download"))
    assert "Provenance was not available" in files["ATTRIBUTION.txt"] and "Licence:" not in files["ATTRIBUTION.txt"]


# --- units for the OWID columns (decision O3) ---


def test_owid_units_come_from_the_codebook_exactly_as_written(ex, full_data):
    (full_data / "owid-co2-codebook.csv").write_text("column,description,unit\nco2,Annual CO2,million tonnes\npopulation,People,people\ncountry,Place,\n")
    d = {c["id"]: c for c in ex.get("/api/explorer/meta").json()["columns_detail"]}
    assert d["co2"]["unit"] == "million tonnes" and d["population"]["unit"] == "people"
    assert d["country"]["unit"] is None and d["year"]["unit"] is None
    assert d["co2"]["label"] == "CO2" and d["country"]["is_key"] and d["co2"]["default"] and d["year"]["default"]
    summary = {r["column"]: r for r in ex.get("/api/explorer/summary").json()["rows"]}
    assert summary["co2"]["unit"] == "million tonnes"


def test_a_column_absent_from_the_codebook_has_a_null_unit(ex, full_data):
    (full_data / "owid-co2-codebook.csv").write_text("column,description,unit\nco2,Annual CO2,million tonnes\n")
    d = {c["id"]: c for c in ex.get("/api/explorer/meta").json()["columns_detail"]}
    assert d["co2"]["unit"] == "million tonnes" and d["population"]["unit"] is None


def test_no_codebook_means_null_units_and_still_a_200(ex):
    r = ex.get("/api/explorer/meta")
    assert r.status_code == 200
    assert all(c["unit"] is None for c in r.json()["columns_detail"])


@pytest.mark.parametrize("text", ["", "column,description\nco2,x\n", "not,a,codebook\n1,2,3\n", "column,unit\nco2,\"unterminated\n"])
def test_an_unusable_codebook_is_never_a_503(ex, full_data, text):
    (full_data / "owid-co2-codebook.csv").write_text(text)
    r = ex.get("/api/explorer/meta")
    assert r.status_code == 200 and all(c["unit"] is None for c in r.json()["columns_detail"])


def test_humanize_column_matches_the_front_end_headers():
    assert [ed.humanize_column(c) for c in ("co2_per_capita", "total_ghg", "gdp", "population", "country", "iso_code")] == ["CO2 Per Capita", "Total GHG", "GDP", "Population", "Country", "ISO Code"]
