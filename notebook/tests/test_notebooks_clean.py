"""Committed notebooks carry no outputs and no execution counts.

Executing a notebook writes its outputs into the file, so a run from a working checkout (a data refresh, a
local `nbconvert --execute --inplace`) leaves tracked notebooks modified. The refresh job writes its executed
copies under `data/notebook-runs/` (untracked) instead; this test is the backstop that fails the moment an
executed notebook is committed.
"""
import json
from pathlib import Path

import pytest

NOTEBOOKS = sorted(Path(__file__).resolve().parents[1].rglob("*.ipynb"))


@pytest.mark.parametrize("path", NOTEBOOKS, ids=lambda p: p.name)
def test_notebook_has_no_outputs_or_execution_counts(path):
    cells = json.loads(path.read_text(encoding="utf-8"))["cells"]
    dirty = [
        i for i, c in enumerate(cells)
        if c["cell_type"] == "code" and (c.get("outputs") or c.get("execution_count") is not None)
    ]
    assert not dirty, f"{path.name}: cells {dirty} carry outputs or an execution count; strip them before committing"


def test_there_are_notebooks_to_check():
    assert len(NOTEBOOKS) >= 5
