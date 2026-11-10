"""The battery's ungrounded-number check (`evals/run_battery.py`'s `ungrounded_numbers`), shared by the in-process and UI batteries.

The fixtures are the real figures from the 2026-11-04 UI battery cases this check used to flag wrongly (dq7, dq8).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

_PATH = Path(__file__).resolve().parents[1] / "evals" / "run_battery.py"
_spec = importlib.util.spec_from_file_location("run_battery", _PATH)
rb = importlib.util.module_from_spec(_spec)
sys.modules.setdefault("run_battery", rb)
_spec.loader.exec_module(rb)

YEARS = list(range(1990, 2025))
GERMANY = {"first_year": 1990, "first_value": 1054.8, "last_year": 2024, "last_value": 572.3}
JAPAN = {"first_year": 1990, "first_value": 1154.9, "last_year": 2024, "last_value": 961.9}
BRAZIL = {"first_year": 1990, "first_value": 218.7, "last_year": 2024, "last_value": 483.0}


def _check(answer: str, *series: dict, summary: bool = True) -> list[str]:
    result = {"series": [{"years": YEARS, "values": [s["first_value"]] + [500.0] * 33 + [s["last_value"]]} for s in series]}
    widgets = [SimpleNamespace(summary={"series": list(series)})] if summary else []
    return rb.ungrounded_numbers(answer, [SimpleNamespace(result=result, args={})], widgets)


def test_a_quoted_tool_value_is_grounded():
    assert _check("Germany fell from 1,054.8 to 572.3 Mt.", GERMANY) == []


def test_a_percent_change_between_quoted_figures_is_grounded():
    # 1 - 572.3 / 1054.8 = 45.7%, quoted rounded to 46
    assert _check("Germany fell from 1,054.8 to 572.3 Mt, a cut of about 46%.", GERMANY) == []


def test_a_rounded_percent_is_judged_at_its_own_precision():
    # 1 - 961.9 / 1154.9 = 16.71%: more than 1.5% from 17, but 17 is that figure rounded to a whole percent
    assert _check("Japan fell from 1,154.9 to 961.9 Mt, about 17%.", JAPAN) == []


def test_a_difference_and_a_year_span_are_grounded():
    # 483.0 - 218.7 = 264.3; 2024 - 1990 = 34
    assert _check("Brazil rose from 218.7 Mt in 1990 to 483.0 Mt in 2024, roughly 264 Mt over the 34-year window.", BRAZIL) == []


def test_a_percent_of_figures_the_answer_does_not_quote_is_flagged():
    # the summary holds 1054.8 and 572.3, but the answer quotes neither: deriving from summaries grounded too many wrong numbers
    assert _check("Germany cut its emissions by about 46% since 1990.", GERMANY) == ["46"]


def test_small_numbers_such_as_ranks_are_not_operands():
    # 3 vs 2 is a 50% "change"; ranks must not ground a percentage
    assert _check("Germany, rank 2, fell from 1,054.8 Mt; the UK, rank 3, is 50% lower.", GERMANY) == ["50"]


def test_a_derived_value_must_round_to_the_quoted_precision():
    # 45.7% quoted as 45.0 is wrong at one decimal, though within 1.5%
    assert _check("Germany fell from 1,054.8 to 572.3 Mt, a cut of 45.0%.", GERMANY) == ["45.0"]


def test_derivation_needs_quoted_anchors_not_any_tool_value():
    # 500.0 is in the tool result but not quoted, so (1054.8 - 500) is not a figure the answer has
    assert _check("Germany fell from 1,054.8 Mt, down 554.8 Mt.", GERMANY, summary=False) == ["554.8"]


def test_a_wrong_percentage_is_still_flagged():
    assert _check("Germany fell from 1,054.8 to 572.3 Mt, a cut of about 60%.", GERMANY) == ["60"]


def test_a_fabricated_figure_is_still_flagged():
    assert _check("Germany emitted 812.4 Mt in 2024.", GERMANY) == ["812.4"]


def test_a_wrong_year_span_is_still_flagged():
    assert _check("Brazil rose from 218.7 Mt in 1990 to 483.0 Mt in 2024, over a 41-year window.", BRAZIL) == ["41"]
