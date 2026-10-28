# STATUS

Follow-ups recorded so they are not lost. Not a changelog: `SPEC.md` has the history.

## Deploy order for the sources metadata

- **Run `python -m pipeline.presentation` on production before the dashboard build that deletes `SOURCE_INFO`.** The landing pages, short citations and short licences now come from `provenance.json` (`landing_links`, `short_citation`, `short_license`), which only gains them on the next pipeline refresh or by this command, run once from the repo root with the pipeline's Python; it refetches nothing and is safe to repeat. Until it has run, the Methods & data sources table shows no links, citations or short licences (the full licence wording still shows). Once the production `provenance.json` has them, delete this note.

## Small loose ends

- **Scenario Comparison's country picker** still stacks its label above the dropdown; the Overview and Historical Trends put the label on one line with the control (`pickerLabel` in each page). Match it if the page's filters are touched again.
