import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from ..explorer_datasets import (
    COUNTRY_YEAR,
    DATASET_IDS,
    DEFAULT_DATASET,
    REGISTRY,
    SUMMARY_COLUMNS,
    Dataset,
    Table,
    build_zip,
    get_dataset,
    listing,
    load_table,
    source_block,
    summary_rows,
)
from ..params import distinct
from ..data_loaders import DataNotFoundError
from ..schemas import ExplorerDataResponse, ExplorerDatasetsResponse, ExplorerMetaResponse, ModelComparisonResponse

router = APIRouter()


def dataset_param(dataset: str = Query(default=DEFAULT_DATASET)) -> Dataset:
    """The `dataset` query parameter, validated against the registry: an unknown id is a 422 naming the valid ones, never an empty answer."""
    ds = get_dataset(dataset)
    if ds is None:
        raise HTTPException(status_code=422, detail=f"unknown dataset {dataset!r}; one of: {', '.join(DATASET_IDS)}")
    return ds


def _table(ds: Dataset) -> Table:
    try:
        return load_table(ds)
    except DataNotFoundError as e:
        raise HTTPException(status_code=503, detail=e.message)


def _select_columns(df: pd.DataFrame, requested: list[str] | None) -> pd.DataFrame:
    """Absent/empty `requested` means "all columns" — an explicit API default distinct from
    any one UI's own default selection (the page asks for the data set's `default` columns itself,
    rather than the API deciding that for every consumer).
    Any requested name that isn't a real column is silently dropped rather than erroring —
    kept forgiving, consistent with this being an exploratory browsing endpoint."""
    if not requested:
        return df
    known = [c for c in requested if c in df.columns]
    return df[known] if known else df


def _filter(
    ds: Dataset,
    countries: list[str] | None,
    year_min: int | None,
    year_max: int | None,
    columns: list[str] | None,
) -> tuple[Table, pd.DataFrame]:
    countries = distinct(countries)
    columns = distinct(columns, "columns")
    if countries and ds.grain != COUNTRY_YEAR:
        raise HTTPException(status_code=422, detail="countries does not apply to a global data set")
    table = _table(ds)
    df = table.df
    if countries:
        df = df[df["country"].isin(countries)]
    if year_min is not None:
        df = df[df["year"] >= year_min]
    if year_max is not None:
        df = df[df["year"] <= year_max]

    return table, _select_columns(df, columns)


def _to_rows(df: pd.DataFrame) -> list[dict]:
    # Bulk NaN -> None so every dtype's missing values serialize as valid JSON null,
    # matching this API's existing per-value _nan_to_none convention (bulk version, since
    # this endpoint's column set is user-selected and arbitrary rather than a fixed schema).
    return df.astype(object).where(pd.notnull(df), None).to_dict("records")


@router.get("/explorer/datasets", response_model=ExplorerDatasetsResponse)
def get_explorer_datasets():
    """The seven data sets in chain order, joined with provenance and availability. One data set whose source is missing is `available: false`
    with the reason; it never takes the others down."""
    return ExplorerDatasetsResponse(datasets=[listing(ds) for ds in REGISTRY])


@router.get("/explorer/meta", response_model=ExplorerMetaResponse)
def get_explorer_meta(ds: Dataset = Depends(dataset_param)):
    table = _table(ds)
    return ExplorerMetaResponse(
        countries=list(table.countries),
        columns=table.df.columns.tolist(),
        year_min=table.first_year,
        year_max=table.last_year,
        dataset=ds.id,
        grain=ds.grain,
        keys=list(ds.keys),
        columns_detail=list(table.detail),
    )


@router.get("/explorer/data", response_model=ExplorerDataResponse)
def get_explorer_data(
    ds: Dataset = Depends(dataset_param),
    countries: list[str] | None = Query(default=None),
    year_min: int | None = Query(default=None),
    year_max: int | None = Query(default=None),
    columns: list[str] | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
):
    _, df = _filter(ds, countries, year_min, year_max, columns)
    total_rows = len(df)
    start = (page - 1) * page_size
    page_df = df.iloc[start : start + page_size]

    return ExplorerDataResponse(
        columns=page_df.columns.tolist(),
        rows=_to_rows(page_df),
        total_rows=total_rows,
        page=page,
        page_size=page_size,
    )


@router.get("/explorer/summary", response_model=ModelComparisonResponse)
def get_explorer_summary(
    ds: Dataset = Depends(dataset_param),
    countries: list[str] | None = Query(default=None),
    year_min: int | None = Query(default=None),
    year_max: int | None = Query(default=None),
    columns: list[str] | None = Query(default=None),
):
    """One row per selected non-key numeric column over the filtered rows (SPEC.md §5.37); keys and text columns are not summarised."""
    table, df = _filter(ds, countries, year_min, year_max, columns)
    return ModelComparisonResponse(columns=SUMMARY_COLUMNS, rows=summary_rows(table, df))


@router.get("/explorer/download")
def download_explorer_data(
    ds: Dataset = Depends(dataset_param),
    countries: list[str] | None = Query(default=None),
    year_min: int | None = Query(default=None),
    year_max: int | None = Query(default=None),
    columns: list[str] | None = Query(default=None),
):
    """A zip of the selected CSV and `ATTRIBUTION.txt`, so the licence and citation travel with the data (SPEC.md §5.37)."""
    table, df = _filter(ds, countries, year_min, year_max, columns)
    if ds.needs_climate_store and source_block(ds) is None:
        # Fail closed: these data sets are shared under licences that require the notice and citation to travel with them (PRIMAP-hist's CC BY-NC-SA above all), so a
        # download without its provenance is refused rather than shipped bare. Browsing the table is unaffected.
        raise HTTPException(status_code=503, detail=f"{ds.title} cannot be downloaded: its provenance (licence and citation) is not available.")
    body, name = build_zip(ds, table, df, distinct(countries), year_min, year_max)
    return Response(content=body, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{name}"'})
