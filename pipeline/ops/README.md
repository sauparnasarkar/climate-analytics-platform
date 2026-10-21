# `pipeline/ops/`: the refresh job

`ghg-data-refresh.sh` is the monthly data-refresh job. It runs on the Mac Mini, started by the launchd job
`com.ghgemissions.datarefresh`, whose template is in [`deploy/launchd/`](../../deploy/launchd/README.md) (the script is run
from this repository, not from a copy). What it does:

1. **Schedule: monthly, day 10 at 03:30.** The plist's `Day` value sets it. Annual-release
   datasets (PRIMAP-hist, OWID) don't need a weekly cycle (`SPEC.md` §5.26); day 10 lets NOAA's
   monthly file (published in the first days of the month) and Berkeley Earth's monthly update land first. Change the
   `Day` value for another day (launchd can't express "first Sunday").
2. **A new stage, `pipeline_stage`,** that runs `python -m pipeline.run --source all` (NOAA GML, Berkeley Earth,
   PRIMAP-hist, OWID registration; **EDGAR is shelved and not part of `all`**) once the OWID file is final —
   after week 1 validates it, or after a week-1 failure restores the backup. It is its own failure domain: it never
   blocks the notebook weeks, and its outcome is **appended to whichever notification goes out**
   (`pipeline.run` writes `data/climate/last_run.{priority,title,message}`; the script just reads them).
   - `urgent` if a source failed outright, or the stage could not run / produced no summary;
   - `high` if any source reported deviations from norm (stale source, completeness exclusions beyond one year,
     licence change, row-count drop, reconciliation gaps, …);
   - otherwise the notebook outcome's own priority is unchanged. The ntfy title gains a suffix
     (` + pipeline flagged` / ` + pipeline FAILED` / ` + pipeline NOT RUN`) when it isn't clean.
   - Stale summaries are deleted before each run, so a crash can never re-report the previous run's result.

3. **A post-refresh API restart (`restart_api`)**. The API's loaders are process-lifetime `@lru_cache`, and
   nothing in the live job restarts it, so refreshed CSVs are not served until the process happens to restart
  . After a **validated** refresh (status `clean` or
   `soft_flag`, notebooks all reran) the script runs `launchctl kickstart -k gui/$(id -u)/com.ghgemissions.uvicorn`;
   `KeepAlive` brings it straight back. Semantics copied from the companion apps: only after a genuinely successful
   refresh (never after a restored-backup failure, where nothing new is live), and **never fatal** — a failed
   restart is reported in the notification (`+ API restart FAILED`, priority at least `high`) but does not turn a
   successful refresh into a failed run. Only the API is restarted: the agent keeps per-conversation state in memory
   that a restart would wipe, the MCP server holds no data cache, and `vitepreview` serves static files off disk.
   Set `GHG_SKIP_API_RESTART=1` to skip it (e.g. an on-demand run you don't want to interrupt the API for).
   The restart also fires after a **week-1 failure
   (backup restored)** when the Area 2 stage produced a summary that is not `urgent` (`PIPE_OK=1`), because the notebook CSVs
   are untouched there but the new Area 2 files are only served after a restart (`restart_if_pipeline_ok`). It never
   fires after a **weeks 2-5 failure**: those CSVs may be partially regenerated and a restart would load them (the
   notification says so).

4. **The Area 2 stage runs after the notebook weeks, not after week 1.** Its `scenario_temperature` stage reads
   `data/scenario_projections.csv`, which week 5 regenerates; run before the weeks it translated the *previous* month's
   scenarios (one month behind, and unavailable via the stale-scenario guard whenever OWID gained a year). It still runs
   in both failure branches (its own failure domain), so Area 2 files are refreshed even when a notebook fails.

The OWID step **does not download**: the script's existing backup → download → week-1 validation → restore
flow stays the single authority for that file; `pipeline/owid.py` only verifies and registers what is on disk
(provenance, checksum, completeness of the latest year) and publishes `data/climate/owid_world_co2_annual.csv`.

## Installing and running it

Render and install the plist as described in [`deploy/launchd/README.md`](../../deploy/launchd/README.md). Before the
first scheduled run, check on the host, in this order:

1. **Dry-run the stage alone** (does not touch the OWID file or notebooks): `.venv/bin/python -m pipeline.run --source all`,
   then read `data/climate/last_run.message`. Expect `owid` to be fine only if the file is fresh.
2. **Trigger one full run** (`pipeline/ops/ghg-data-refresh.sh`; it restarts the API at the end, so expect a few seconds of
   failed requests: prefix `GHG_SKIP_API_RESTART=1` for a run that must not). Read `~/.ghg-data-refresh/logs/<date>.log` and
   the ntfy push: both the notebook outcome and the `Area 2 pipeline:` section should be present. Confirm
   `launchctl list | grep ghgemissions.uvicorn` shows a **new PID** and that the log says `Restarted com.ghgemissions.uvicorn`.

The notebooks are executed to copies under `data/notebook-runs/` (untracked); the committed notebooks carry no outputs.
`GHG_STATE_DIR` and `NTFY_TOPIC_FILE` redirect the logs and the notification topic, so a trial run does not touch the real ones.
Rollback: `bootout` the job, restore the previous plist, `bootstrap` it again.
