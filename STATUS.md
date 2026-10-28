# STATUS

Follow-ups recorded so they are not lost. Not a changelog: `SPEC.md` has the history.

## After the Nov 9–11 freeze

- **Move the source landing pages into pipeline metadata.** `climate-dashboard-react/src/lib/sources.ts` (`SOURCE_INFO`) holds each dataset's landing-page URL and short citation, keyed by the source id in `/api/correlation/meta`. It lives in the front end only so item 2 of the page consolidation needed no pipeline change before the freeze. Add `landing_url` and `citation` to each source in the pipeline's metadata, read them in `lib/methodology.ts` `buildSources`, and delete `SOURCE_INFO`. Landing URLs were last fetched and checked on 2026-10-28.

## Small loose ends

- **Scenario Comparison's country picker** still stacks its label above the dropdown; the Overview and Historical Trends put the label on one line with the control (`pickerLabel` in each page). Match it if the page's filters are touched again.
