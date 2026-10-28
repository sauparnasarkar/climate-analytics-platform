"""How each public dataset is introduced on the Methods & data page: where to read about it, how to cite it, and its licence in a few words.

These travel in the provenance store beside the raw data-file URLs and the full licence wording, so the API serves them from `/correlation/meta` and the dashboard keeps
no list of its own. Landing pages were last fetched and checked on 2026-10-28; a source's own script may set any of these fields itself, and then its value wins.

    python -m pipeline.presentation            # add them to the existing provenance store without refetching any source
"""
from __future__ import annotations

import json
import os
import sys

from .common import PROVENANCE_PATH

_NOAA_GML = {"label": "NOAA GML: Trends in CO₂", "url": "https://gml.noaa.gov/ccgg/trends/"}
_OWID = {"label": "OWID CO₂ data (GitHub)", "url": "https://github.com/owid/co2-data"}
_PRIMAP = {"label": "PRIMAP-hist v2.8 (Zenodo)", "url": "https://zenodo.org/records/22876287"}

_OWID_CITATION = "Our World in Data, CO₂ and Greenhouse Gas Emissions; Global Carbon Budget"
_OWID_LICENCE = "CC BY 4.0 (OWID compilation)"
_PRIMAP_CITATION = "Gütschow & Pflüger, PRIMAP-hist v2.8"
_PRIMAP_LICENCE = "CC BY-NC-SA 4.0 · non-commercial"

SOURCE_PRESENTATION: dict[str, dict] = {
    "owid_country_co2": {"landing_links": [_OWID], "short_citation": _OWID_CITATION, "short_license": _OWID_LICENCE},
    "owid_world_co2_annual": {"landing_links": [_OWID], "short_citation": _OWID_CITATION, "short_license": _OWID_LICENCE},
    "co2_concentration_annual": {
        "landing_links": [_NOAA_GML, {"label": "NCEI: Law Dome 2000-year record", "url": "https://www.ncei.noaa.gov/access/paleo-search/study/9959"}],
        "short_citation": "NOAA GML Mauna Loa; Etheridge et al. 2010 and MacFarling Meure et al. 2006 (Law Dome)",
        "short_license": "Public domain (NOAA); cite Law Dome",
    },
    "co2_concentration_monthly_mlo": {"landing_links": [_NOAA_GML], "short_citation": "NOAA GML Mauna Loa", "short_license": "Public domain; cite NOAA GML"},
    "primap_country_annual": {"landing_links": [_PRIMAP], "short_citation": _PRIMAP_CITATION, "short_license": _PRIMAP_LICENCE},
    "primap_global_composition_annual": {"landing_links": [_PRIMAP], "short_citation": _PRIMAP_CITATION, "short_license": _PRIMAP_LICENCE},
    "temperature_anomaly_annual": {
        "landing_links": [{"label": "Berkeley Earth data", "url": "https://berkeleyearth.org/data/"}],
        "short_citation": "Rohde & Hausfather 2020, ESSD 12, 3469–3479",
        "short_license": "CC BY-NC 4.0 · non-commercial",
    },
}


def with_presentation(series_id: str, entry: dict) -> dict:
    """The entry with its series' presentation fields added; a field the entry already carries is kept, and a series with none (a derived or shelved one) is returned as it is."""
    extra = SOURCE_PRESENTATION.get(series_id)
    return entry if extra is None else {**extra, **entry}


def backfill(path: str = PROVENANCE_PATH) -> list[str]:
    """Add the presentation fields to an existing provenance store in place, refetching nothing; returns the series ids it changed. Safe to run again."""
    with open(path) as f:
        store = json.load(f)
    changed = [sid for sid, entry in store.items() if isinstance(entry, dict) and with_presentation(sid, entry) != entry]
    for sid in changed:
        store[sid] = with_presentation(sid, store[sid])
    if changed:
        tmp = path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(store, f, indent=2, sort_keys=True)
        os.replace(tmp, path)
    return changed


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else PROVENANCE_PATH
    done = backfill(target)
    print(f"{target}: {len(done)} series updated" + (f" ({', '.join(done)})" if done else ""))
