from fastapi.testclient import TestClient

from api.main import app


def test_explorer_meta_happy_path(client):
    resp = client.get("/api/explorer/meta")
    assert resp.status_code == 200
    body = resp.json()
    assert sorted(body["countries"]) == ["China", "Germany", "Kenya", "United States"]
    assert body["columns"] == ["country", "year", "co2", "population"]
    assert body["year_min"] == 1990
    assert body["year_max"] == 2023


def test_explorer_data_defaults_to_all_countries_and_years(client):
    resp = client.get("/api/explorer/data")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_rows"] == 12
    assert body["page"] == 1
    assert body["page_size"] == 50
    assert len(body["rows"]) == 12


def test_explorer_data_filters_by_country(client):
    resp = client.get("/api/explorer/data", params={"countries": ["Kenya"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_rows"] == 3
    assert all(row["country"] == "Kenya" for row in body["rows"])


def test_explorer_data_filters_by_year_range(client):
    resp = client.get("/api/explorer/data", params={"year_min": 2000, "year_max": 2015})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_rows"] == 4
    assert all(row["year"] == 2010 for row in body["rows"])


def test_explorer_data_unknown_column_is_silently_dropped(client):
    resp = client.get("/api/explorer/data", params={"columns": ["country", "bogus"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["columns"] == ["country"]
    assert all(list(row.keys()) == ["country"] for row in body["rows"])


def test_explorer_data_pagination(client):
    resp = client.get("/api/explorer/data", params={"page": 1, "page_size": 5})
    body = resp.json()
    assert body["total_rows"] == 12
    assert len(body["rows"]) == 5

    resp = client.get("/api/explorer/data", params={"page": 3, "page_size": 5})
    body = resp.json()
    assert len(body["rows"]) == 2


def test_explorer_summary_is_one_row_per_non_key_numeric_column(client):
    # SPEC.md §5.37: replaces the transposed describe(include="all") table. Keys (country, year) are not summarised.
    resp = client.get("/api/explorer/summary", params={"countries": ["Kenya"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["columns"] == ["column", "label", "unit", "count", "missing", "min", "p25", "median", "mean", "p75", "max"]
    rows = {row["column"]: row for row in body["rows"]}
    assert set(rows) == {"co2", "population"}
    assert rows["co2"]["count"] == 3 and rows["co2"]["missing"] == 0
    assert (rows["co2"]["min"], rows["co2"]["median"], rows["co2"]["max"]) == (5, 12, 18)
    assert rows["co2"]["label"] == "CO2"


def test_explorer_download_is_a_zip_of_the_csv_and_an_attribution_file(client):
    import io
    import zipfile

    resp = client.get("/api/explorer/download", params={"countries": ["Kenya"]})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert 'attachment; filename="degrees-of-carbon_owid_country_1990-2023.zip"' == resp.headers["content-disposition"]
    z = zipfile.ZipFile(io.BytesIO(resp.content))
    assert sorted(z.namelist()) == ["ATTRIBUTION.txt", "owid_country.csv"]
    csv_text = z.read("owid_country.csv").decode()
    assert "Kenya" in csv_text and "China" not in csv_text
    assert "Our World in Data" in z.read("ATTRIBUTION.txt").decode()


def test_explorer_meta_503_when_missing(data_dir):
    resp = TestClient(app).get("/api/explorer/meta")
    assert resp.status_code == 503
    assert "ghg_filtered.csv" in resp.json()["detail"]


def test_explorer_data_503_when_missing(data_dir):
    resp = TestClient(app).get("/api/explorer/data")
    assert resp.status_code == 503


def test_explorer_summary_503_when_missing(data_dir):
    resp = TestClient(app).get("/api/explorer/summary")
    assert resp.status_code == 503


def test_explorer_download_503_when_missing(data_dir):
    resp = TestClient(app).get("/api/explorer/download")
    assert resp.status_code == 503
