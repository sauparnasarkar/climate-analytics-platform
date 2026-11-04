"""The UI battery analyzer's answer-vs-page matching (`evals/ui/analyze_ui_battery.py`).

Only the pure matching helper is tested; the battery itself makes real queries and is run by hand (`evals/ui/README.md`).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_PATH = Path(__file__).resolve().parents[1] / "evals" / "ui" / "analyze_ui_battery.py"
_spec = importlib.util.spec_from_file_location("analyze_ui_battery", _PATH)
analyze = importlib.util.module_from_spec(_spec)
sys.modules["analyze_ui_battery"] = analyze
_spec.loader.exec_module(analyze)


def test_a_rendered_heading_and_paragraph_match_their_markdown_source():
    answer = "## The greenhouse effect\n\nGreenhouse gases retain heat."
    assert analyze.answer_in_page(answer, "+ New question\nWhat is the greenhouse effect?\n\nThe greenhouse effect\n\nGreenhouse gases retain heat.")


def test_emphasis_links_lists_and_code_do_not_cause_false_mismatches():
    assert analyze.answer_in_page("*Net zero* means [balancing](https://example.com/x) emissions.", "Net zero means balancing emissions.")
    assert analyze.answer_in_page("- first point about `CO2`\n- second", "first point about CO2\nsecond")
    assert analyze.answer_in_page("1. Step one is to measure.", "Step one is to measure.")


def test_typography_does_not_matter():
    # a narrow no-break space inside a number, a typographic quote and a subscript against their plain renderings
    assert analyze.answer_in_page("China emitted 12,289 MtCO₂ – the world’s largest.", "China emitted 12,289 MtCO₂ – the world’s largest.")


def test_text_that_is_not_on_the_page_is_still_a_mismatch():
    assert not analyze.answer_in_page("Greenhouse gases retain heat.", "Something else entirely, about banana bread recipes.")


def test_an_empty_answer_has_nothing_to_match():
    assert analyze.answer_in_page("", "anything")
    assert analyze.answer_in_page("##  ", "anything")  # only markup left once stripped
