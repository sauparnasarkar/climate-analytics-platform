"""Forecast interval draws are seeded per country, so a refresh on unchanged data reproduces the same bounds."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing

NOTEBOOK_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(NOTEBOOK_DIR))

from constants import FORECAST_SIMULATION_SEED, forecast_seed  # noqa: E402


def _fit():
    rng = np.random.default_rng(0)
    y = pd.Series(100 + 0.5 * np.arange(29) + rng.normal(0, 2, 29), index=range(1990, 2019))
    return ExponentialSmoothing(y, trend="add", damped_trend=True, seasonal=None).fit()


def _bounds(fit, country):
    sim = fit.simulate(nsimulations=25, repetitions=1000, error="add", random_state=forecast_seed(country))
    return sim.quantile(0.025, axis=1).to_numpy(), sim.quantile(0.975, axis=1).to_numpy()


def test_the_seed_is_stable_and_an_unsigned_32_bit_integer():
    assert forecast_seed("China") == forecast_seed("China")
    assert 0 <= forecast_seed("China") < 2**32
    assert forecast_seed("") == FORECAST_SIMULATION_SEED


def test_countries_get_different_seeds():
    countries = ["China", "United States", "India", "Germany", "United Kingdom", "Japan"]
    assert len({forecast_seed(c) for c in countries}) == len(countries)


def test_the_same_fit_and_country_give_the_same_bounds():
    fit = _fit()
    lo1, hi1 = _bounds(fit, "China")
    lo2, hi2 = _bounds(fit, "China")
    assert np.array_equal(lo1, lo2) and np.array_equal(hi1, hi2)


def test_a_different_country_seed_gives_different_draws():
    fit = _fit()
    assert not np.array_equal(_bounds(fit, "China")[0], _bounds(fit, "India")[0])


def test_the_forecast_notebook_seeds_every_simulation_call():
    cells = json.loads((NOTEBOOK_DIR / "week4_ets_forecasting.ipynb").read_text(encoding="utf-8"))["cells"]
    code = "\n".join("".join(c["source"]) for c in cells if c["cell_type"] == "code")
    assert code.count(".simulate(") >= 1
    assert code.count("random_state=forecast_seed(") == code.count(".simulate(")
