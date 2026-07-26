# PLAN_update-tools-route — next-bridge

## Title
Update the tools route

## Plan
- [x] Add `tpip_pipelinelog` table — SQL given to user to run manually via pgAdmin4, and append to `scripts/schema.sql`
- [x] Add `src/lib/actions/pipelineLog.ts` — `logPipelineStep()`, `resolvePipRunId()`, `getLatestPipelineRuns()`, `getRecentRunIds()`
- [x] Extract cron route's Phase A+B+C (automatic discover + scrape missing run_ids → ts1+ts2, no manual date/source params — matches the existing "Raw Data Scraping" step already being one combined action) into `src/lib/actions/pipelineScrape.ts` → `scrapeNewSessions()`, logs to `tpip_pipelinelog` step 1, exposed via new route `/api/build/scrape`
- [x] Add `logPipelineStep()` calls to existing `/api/build/sessions-nzb`, `/api/build/results-nzb`, `/api/build/partners` routes (steps 2–4)
- [x] Extract cron route's Phase E (full stats rebuild, all groups, player+partner) into `src/lib/actions/stats.ts` → `rebuildAllStats()`, logs step 5, exposed via new route `/api/build/stats`
- [x] Refactor `/api/cron/update-sessions` to call the extracted functions above instead of inline duplicate SQL, so the scheduled cron run logs to `tpip_pipelinelog` too
- [x] Build `src/ui/admin/PipelineTable.tsx` — one row per step (Scrape, Build Sessions, Build Results, Build Partners, Update Stats): description, last-run info from `tpip_pipelinelog`, Run button with local running/result state (mirrors existing `BuildTables.tsx` pattern), plus a "Run All" button that client-sequences all 5 steps with `await` (mirrors chess `handleRunAll`)
- [x] Keep granular per-group stats controls — mount existing `PlayerRefresh` component in a collapsible "Advanced" section below the main table on the new page
- [x] Add `src/app/owner/pipeline/page.tsx` rendering `PipelineTable`
- [x] Merge `Ts0Links`, `Ts1Table`, `Ts2Table` into `BuildDataViewer.tsx` as additional tabs
- [x] Remove `/owner/scrape`, `/owner/build`, `/owner/stats`, `/owner/cron` pages and their now-unused components (`ScrapeTabs`, `RawScrape`, `StagingBar`, `PopulateTs2`, `BuildTables`, `CronRun`) — keep the moved viewer/stats components
- [x] Update `TOOLS` array in `src/app/owner/page.tsx` — remove the 4 old entries, add single "Pipeline" entry
- [x] Update `.claude/CLAUDE.md` Admin routes table to reflect the new `/owner/pipeline` route
- [x] Add a "Pipeline Jobs" summary table above the existing "Run" table on `/owner/pipeline`, mirroring chess: one row per step (Step, Last Run, Input Table/Recs, Output Table/Recs, Duration, Status badge), joined against a selected run_id, with a `MySelect` run-id dropdown (last 5 runs via `getRecentRunIds()`, defaulting to the most recent) — add `getPipelineRunStatus(runId)` to `pipelineLog.ts` to fetch that run's rows
- [x] Rebuild the "Run Pipeline" table's columns to match chess exactly: Step, Description, **Help** (`MyHelpStep` popover: input/processing/output/consumers prose per step), **Processed** (last-run result summary — already have this, rename), **SQL** (`MyHelp` popover showing the exact status-check query), **Refresh** (↻ button per row that re-runs that step's "remaining" count), **Remaining** (live count, not from `tpip_pipelinelog`), **Status** (badge: Completed when remaining === 0), Result/error, Run. Add a header-row "Refresh All" and keep the existing "Run All".
  - Add `src/lib/actions/pipelineStatus.ts` with one `refreshXStatus()` function per step, returning `{ remaining: number }`:
    - Build Sessions: `SELECT COUNT(*) FROM ts1_sessions WHERE s1_date IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tse_sessions WHERE se_run_id = s1_run_id)`
    - Build Results: `SELECT COUNT(*) FROM tse_sessions WHERE NOT EXISTS (SELECT 1 FROM tre_results WHERE re_seid = se_seid)`
    - Build Partners: `SELECT COUNT(*) FROM (SELECT DISTINCT s2_plid1, s2_plid2 FROM ts2_results) t WHERE NOT EXISTS (SELECT 1 FROM tpa_partners WHERE pa_plid1 = t.s2_plid1 AND pa_plid2 = t.s2_plid2)`
    - Scrape: no SQL-only equivalent exists (missing run_ids are only knowable via live HTTP calls to nzbridge.co.nz) — add `countMissingSessions()` to `pipelineScrape.ts` that runs the discovery half of `scrapeNewSessions()` (Phase A+B only, no actual scrape) and returns the missing-run_id count. This row's Refresh is therefore slower (network calls) than the others (pure SQL).
    - Update Stats: **no Remaining/Status** per your decision — this row only shows Processed (last rebuild's row counts), no incremental backlog concept applies since it's a full truncate+rebuild every run.
  - Write the actual `input`/`processing`/`output`/`consumers` prose per step (accurate to next-bridge's schema, not copied verbatim from chess) for the `MyHelpStep` popovers.
- [x] Add a top-of-page **Pipeline Help** component (`src/ui/admin/PipelineHelp.tsx`, mirroring chess's `PipelineHelp.tsx`) — a wider popover listing all 5 steps' input/processing/output, plus a row-count SQL snippet across `ts1_sessions, ts2_results, tse_sessions, tre_results, tpa_partners, ta1_player_stats, ta2_partner_stats`. Placed next to the "Pipeline" page heading.
- [x] Add the missing ↻ refresh button next to the run-id `MySelect` in the "Pipeline Jobs" summary table (mirrors chess's `doRefreshRuns` button) — currently the summary only has the dropdown, no manual refresh
- [x] Wrap both the "Pipeline Jobs" summary and the "Run Pipeline" table in `nextjs-shared/MyBox` (with a `title` prop) instead of the current hand-rolled bordered `<div>`s, matching chess and this project's existing shared-component-adoption convention
- [x] Move "Refresh All" and "Run All" into the Run Pipeline table's own header row (as `<th>` cells), matching chess's exact layout, instead of floating them as separate buttons above the table
- [x] `rebuildAllStats()` logs 8 sub-steps under step 5 instead of one aggregate row — one `logPipelineStep()` call per INSERT, each with its own row count and duration:
  - `a` Player Stats — Group A, `b` Player Stats — Group B, `c` Player Stats — Group C, `d` Player Stats — All (all `output_table: 'ta1_player_stats'`)
  - `e` Partner Stats — Group A, `f` Partner Stats — Group B, `g` Partner Stats — Group C, `h` Partner Stats — All (all `output_table: 'ta2_partner_stats'`)
  - The "Run Pipeline" bottom table still has just one Run button/row for Update Stats (per chess's pattern — e.g. Game Sync is one button despite having 4 internal sub-steps); the 8-way breakdown only shows in the Pipeline Jobs summary.
  - Update `PipelineJobsSummary` to render step 5 as a grouped row (bold "5 — Update Stats" header row) with its 8 sub-steps indented underneath, mirroring chess's `JOB_GROUPS`/`Fragment` rendering for multi-sub-step groups — steps 1–4 keep their current single-row rendering (no sub-steps).
- [x] Extract the duplicated per-group stats SQL out of `recalculate/route.ts` and `stats.ts` into shared helpers — `computePlayerGroupStats(grp: string): Promise<number>` and `computePartnerGroupStats(grp: string): Promise<number>` (new file, e.g. `src/lib/actions/statsCompute.ts`) — containing just the query, parameterized on group/`isAll`. `recalculate/route.ts` calls it once per SSE-wrapped button click; `stats.ts`'s `rebuildAllStats()` calls it in its loop for the 8 sub-steps above. Neither file's outer shape changes (SSE streaming vs. batch/logged) — only the duplicated query text is removed.
- [x] Remove the `max-w-3xl` constraint on `PipelineTable`'s outer wrapper — it's forcing the 8-column Pipeline Jobs summary table into an unnecessary horizontal scrollbar. Chess's equivalent page has no max-width constraint (`<div className='space-y-4 relative'>`); match that so both tables can use the full available width.
- [x] Remove the Remaining/SQL/Refresh/Status cells from the Raw Data Scraping row (row 1) of the Run Pipeline table — not valid for this step, since "remaining" can only be computed via live HTTP calls to nzbridge.co.nz (not a real SQL count), and that discovery call was firing automatically on every page load via `doRefreshAll()`, making `/owner/pipeline` slow to open. Row 1 keeps only Description, Help, Processed, Result, Run — matching how the Update Stats row already shows `—` for those columns. Remove `countMissingSessions()` (`pipelineScrape.ts`) and `refreshScrapeStatus()` (`pipelineStatus.ts`) since they become unused, and drop Scrape from `doRefreshAll()`/the header "Refresh All" button's scope.
- [x] Roll the "Advanced — manual stats controls" section (`PlayerRefresh.tsx`, 10 buttons: player truncate/A/B/C/all, partner truncate/A/B/C/all) into the Run Pipeline table itself as 10 extra rows under Update Stats, per your decision — each with its own Run button, Description, Processed, Result (Help/SQL/Remaining/Status all `—`, same minimal pattern as Update Stats' own row).
  - Convert `/api/players/recalculate` from an SSE stream to a plain JSON POST (it only ever sent one final `{done:true,...}` event anyway — the streaming was unused complexity) so these new rows can use the table's existing plain `runStep()`/`run()` helper like every other row, no new fetch/SSE-reading code needed.
  - Add a `logPipelineStep()` call inside `recalculate/route.ts` for every mode, per your decision to log individual runs the same as the full Update Stats run: the 8 group ops reuse `stats.ts`'s existing sub-step letters (`a`–`h`, since they're literally the same `computePlayerGroupStats`/`computePartnerGroupStats` calls whichever way they're triggered); the 2 truncate ops get new sub-steps `i` (Player Stats — Truncate) and `j` (Partner Stats — Truncate).
  - Extend `PipelineJobsSummary`'s `STEP5_SUBSTEPS` array with the 2 new truncate sub-steps (`i`, `j`) so the Pipeline Jobs summary reflects everything now logged under step 5, not just the automatic 8.
  - Delete `PlayerRefresh.tsx` and the `<details>` "Advanced" wrapper on `src/app/owner/pipeline/page.tsx` — fully replaced by the new rows.
- [x] Switch `computePlayerGroupStats()`/`computePartnerGroupStats()` (`statsCompute.ts`) from plain `INSERT` to `INSERT ... ON CONFLICT (a1_plid, a1_group) DO UPDATE SET ... = EXCLUDED...` (and the `a2_paid, a2_group` equivalent), per your decision, so each group can be re-run independently with no truncate needed first — accepting the known tradeoff (a player/partnership no longer appearing in a group's current computation keeps its old row instead of being cleaned up, unlike truncate+reinsert).
  - Remove the `TRUNCATE ta1_player_stats, ta2_partner_stats RESTART IDENTITY` call from `rebuildAllStats()` (`stats.ts`) — no longer needed once every group write is an upsert.
  - Remove the `player_truncate`/`partner_truncate` modes from `recalculate/route.ts` entirely (including their `logPipelineStep` sub-steps `i`/`j`) — truncate is being removed, not just hidden.
  - Remove the 2 "Truncate" rows from `STATS_SUB_ROWS` in `PipelineTable.tsx` (back to 8 rows: Player/Partner Stats × A/B/C/All) and remove `i`/`j` from `PipelineJobsSummary`'s `STEP5_SUBSTEPS`.
- [x] **Ongoing fix only** — in `scrapeRunId()` (`pipelineScrape.ts`), after processing a run_id's rows, if zero pairs were found *within that same scrape call*, delete that run_id's `ts1_sessions` row (`DELETE FROM ts1_sessions WHERE s1_run_id = $1` — scoped single-row delete, same pattern already used in `players/merge/route.ts` and `lookup.ts`, not a bulk operation) so a session with genuinely no pair data on nzbridge.co.nz never reaches Build Sessions/`tse_sessions` in the first place. This check is safe because it's evaluated in real time against the pairs just scraped for that run_id, not by querying `ts2_results` afterward.
  - ~~One-off correction~~ **RETRACTED — do not use.** The original SQL (`DELETE FROM tse_sessions/ts1_sessions WHERE NOT EXISTS (... ts2_results ...)`) was based on a wrong premise: `ts2_results` is a staging table that gets `TRUNCATE`d and refilled on *every* Scrape run, so it only ever holds the latest batch — not a cumulative history. "No matching `ts2_results` row" is true for essentially every session older than the most recent scrape batch, not just genuinely broken ones. Running this against the local DB on 2026-07-25 deleted ~14,074 legitimate historical `tse_sessions` rows (241 remained afterward, matching the size of the most recent scrape batch) — recovered by restoring `tse_sessions` from production via next-dbadmin. Do not reuse this query pattern for any future cleanup.
- [x] **Split the single monolithic cron into 5 independently-scheduled crons, one per pipeline step** — mirroring chess's proven pattern (its own `tpip_pipelinelog` shows 9 steps completing cleanly across ~3 hours on independent schedules). Root cause being fixed: the current single `/api/cron/update-sessions` request runs all 5 steps in one Vercel function invocation, and Scrape alone can take 20+ minutes when there's backlog — almost certainly getting killed by the platform's function timeout before Update Stats ever runs, with no error logged (a platform-level kill doesn't hit the route's own `catch` block).
  - Add a `GET` handler alongside the existing `POST` on each of the 5 per-step routes (`/api/build/scrape`, `sessions-nzb`, `results-nzb`, `partners`, `stats`) — Vercel Cron Jobs only trigger `GET`. Both handlers share the same core logic (extract into one function each route calls from both exports) so the UI's existing `POST` calls are unaffected.
  - Match chess's exact auth pattern per your decision: only the first route (`/api/build/scrape`, playing the same role as chess's `/api/cron/sync`) checks `CRON_SECRET` (same `if (secret && !isDev)` shape already used in `/api/cron/update-sessions`); the other 4 routes get no auth check at all, same accepted-risk precedent chess uses for its other 8 routes.
  - Update `vercel.json`'s `crons` array — uniform 20-minute spacing, matching chess exactly:
    ```json
    { "path": "/api/build/scrape",       "schedule": "0 14 * * *" },
    { "path": "/api/build/sessions-nzb", "schedule": "20 14 * * *" },
    { "path": "/api/build/results-nzb",  "schedule": "40 14 * * *" },
    { "path": "/api/build/partners",     "schedule": "0 15 * * *" },
    { "path": "/api/build/stats",        "schedule": "20 15 * * *" }
    ```
    Remove the existing single `{ "path": "/api/cron/update-sessions", "schedule": "0 14 * * *" }` entry so the two schedules don't overlap/double-process.
  - Keep the `/api/cron/update-sessions` route file itself (unscheduled) as a manual "run everything in one shot" fallback — e.g. for a one-off curl-triggered full catch-up run — rather than deleting it.
  - No change needed to `resolvePipRunId()`'s run-id grouping logic — step 1 already always allocates a new run_id regardless of the `forceNewRun` flag, and steps 2–5 already reuse the current max, so independently-scheduled invocations group under one `pip_run_id` exactly like chess's model, with no code change required.
- [x] Remove `ts0_scraped` entirely — not written to by the active pipeline (`scrapeNewSessions()` never touches it), only by older unlinked routes. Per your decision, remove the viewer and every remaining code reference:
  - Remove the "ts0" tab from `BuildDataViewer.tsx` (`TABS` array + import + conditional render)
  - Delete `src/ui/admin/Ts0Links.tsx` and `src/app/api/scrape/ts0/route.ts`
  - Strip `ts0_scraped` references (INSERT/TRUNCATE/SELECT) from: `scrape/staging/route.ts`, `scrape/discover/nzb-by-flagged/route.ts`, `scrape/raw/nzb-by-flagged/route.ts`, `scrape/discover/nzb-by-date/route.ts`, `scrape/raw/nzb-from-ts1sessions/route.ts` — these routes stay otherwise unchanged (still unlinked from any page, still work for their actual purpose)
  - Not touching the actual `ts0_scraped` table or `scripts/schema.sql` — the table itself can stay in the database unused, or you can drop it separately whenever you're ready (SQL for that, if wanted, given in chat only, never run by Claude)
- [x] Replace `table_query` calls in the new pipeline code with the dedicated generic function they actually match (found by checking `table_write`/`table_upsert`/`table_truncate`'s real signatures against the project's own "raw SQL only when genuinely too complex" convention):
  - `logPipelineStep()` (`pipelineLog.ts`) — plain single-row INSERT into `tpip_pipelinelog` → `table_write`
  - `scrapeRunId()`'s `ts1_sessions` upsert (`pipelineScrape.ts`) — `ON CONFLICT (s1_run_id) DO UPDATE SET` every non-conflict column → `table_upsert({ conflictColumns: ['s1_run_id'] })` (no `updateColumns` needed — its default already updates every other provided column)
  - `scrapeRunId()`'s `ts2_results` insert — `ON CONFLICT (...) DO NOTHING` → `table_write({ conflictColumn: 's2_run_id, s2_plid1, s2_plid2' })` (the composite key as one comma-separated string, since `table_write` just interpolates it into the parens)
  - `scrapeNewSessions()`'s `TRUNCATE ts1_sessions, ts2_results RESTART IDENTITY` → two separate `table_truncate('ts1_sessions')` / `table_truncate('ts2_results')` calls (that function only takes one table at a time)
  - Also found and fixed a 5th spot during implementation matching the identical pattern (not separately called out beforehand): `getOrCreatePlayer()`'s `tpl_players` insert (`ON CONFLICT (pl_name) DO NOTHING`) → `table_write({ conflictColumn: 'pl_name' })`
- [x] Add an optional `to_date` override to the Scrape step, so you can manually catch up a large backlog in smaller date-range chunks instead of one long run, per your decision (simpler than a full batch/queue redesign — `nzbridge.co.nz` discovery already loops one day at a time internally, so this just shortens that existing loop, no structural change to how it scrapes):
  - `scrapeNewSessions(forceNewRun = false, toDateOverride?: string)` (`pipelineScrape.ts`) — `getDateRange()` uses `toDateOverride` in place of "today" when provided; unchanged when omitted (cron never passes it, so cron behavior is identical to today)
  - `/api/build/scrape` accepts an optional `?to_date=YYYY-MM-DD` query param (both `GET` and `POST`), passed through to `scrapeNewSessions()`
  - Add a date input next to the Scrape row's Run button in `PipelineTable.tsx` — blank by default (normal behavior, scrapes to today); setting a date caps that run's range, so you can advance it a few days at a time and re-run until caught up
  - Also show the automatic `from_date` (`MAX(se_date)` in `tse_sessions`) as read-only info in the Scrape row, via a new `getScrapeFromDate()` export, per your follow-up request — refreshes after every Scrape run and on page load
  - Per your follow-up: moved From/To onto the same row as the "Run Pipeline" box title (not the Scrape table row) — `MyBox`'s `title` prop only accepts a plain string, so the box no longer uses that prop; a custom header `<div>` renders the title plus "From: dd/mm/yyyy" plus the "To:" date input, all in one row. "From" is formatted dd/mm/yyyy (fully our own text); the "To" `<input type="date">`'s displayed format is controlled by browser/OS locale, not something CSS/JS can force to dd/mm/yyyy — its underlying value stays yyyy-mm-dd regardless of display, which is the HTML date input spec, not something within our control.
- [x] **Split Scrape into two independent steps (AKBC club, and tracked players) and fix redundant re-scraping**, per extended discussion — root cause: tracked-player discovery isn't date-bound (fetches each player's entire NZB history every run) and `batchCheckMissing()` only checked against `tse_sessions` (built), so re-running Scrape without Build Sessions in between (or before AKBC's own sessions were built) re-fetched the same sessions from NZB repeatedly, sometimes redundantly across many tracked players sharing one session. Final agreed design:
  - **New 8-row / 6-step-number sequence**, replacing today's 5: 1. Scrape AKBC → 2. Build Sessions → 3. Build Results → 4. Scrape Tracked Players → 2. Build Sessions *(again)* → 3. Build Results *(again)* → 5. Build Partners *(was step 4)* → 6. Update Stats *(was step 5, sub-steps `a`–`h` unchanged)*. Steps 2/3 keep the same step number both times they run — the Pipeline Jobs summary shows the latest of the two invocations, same as any other re-run.
  - Split `scrapeNewSessions()` (`pipelineScrape.ts`) into `scrapeClubSessions(toDateOverride?)` (step 1 — truncates `ts1_sessions`/`ts2_results` at the start, since it's the start of a new coordinated run) and `scrapeTrackedPlayerSessions()` (step 4 — no date param, **does not truncate**, just adds to whatever's already staged)
  - Update `batchCheckMissing()` to exclude a run_id if it exists in **either** `tse_sessions` (already built) **or** `ts1_sessions` (already scraped, not yet built) — not `tse_sessions` alone. This is what actually prevents redundant re-fetching from NZB regardless of run order, truncate timing, or how many tracked players share one session (the existing `Set<number>` for `allMissingIds` already dedupes *within* one discovery pass — this fixes the *across-runs* case)
  - Add an optional `from_date`/`to_date` filter to `buildSessionsFromStaging()`/`buildResultsFromStaging()` (`buildSteps.ts`), per your decision — an explicit safeguard, not just relying on truncate-timing. Passed the same range as the preceding Scrape step when called after AKBC; omitted (unfiltered) when called after Tracked Players
  - New route `/api/build/scrape-tracked` for step 4 (`GET`/`POST`, no `CRON_SECRET` check — matching the "only the first step is protected" pattern already used for `/api/build/scrape`)
  - Renumber existing `logPipelineStep()` calls: `partners/route.ts` step 4→5; `stats.ts`/`recalculate/route.ts` step 5→6 (sub-step letters `a`–`h` unchanged, just the parent step number)
  - `PipelineTable.tsx` gets 8 rows (2 of which — Build Sessions/Results — appear twice, labelled to distinguish the AKBC-batch run from the Tracked-batch run); `PipelineJobsSummary`'s hardcoded step list becomes `[1,2,3,4,5]` simple rows + step 6's existing 8-sub-step group
  - `vercel.json` gets 8 cron entries, uniform 20-minute spacing per your decision, in sequence order (Scrape AKBC 14:00 → Build Sessions 14:20 → Build Results 14:40 → Scrape Tracked 15:00 → Build Sessions 15:20 → Build Results 15:40 → Build Partners 16:00 → Update Stats 16:20, all UTC)
  - `resolvePipRunId()` unchanged — only step 1 (Scrape AKBC) always allocates a new run_id; steps 2–6 (including the new step 4) reuse the current max, same pattern already used for every other step
- [x] Default the Scrape "To" date to 1 week after the automatic "From" date (`MAX(se_date)`), instead of matching "From" exactly — per your decision, gives a starting point closer to a realistic catch-up window. New `SCRAPE_DEFAULT_TO_DATE_WINDOW_DAYS = 7` constant in `src/lib/constants.ts`; only applied when the "To" field is empty, so it never clobbers a date you're actively editing.
- [x] Make the Scrape "From" date editable/overridable, mirroring the existing "To" field — root cause: `getScrapeFromDate()`/`MAX(se_date)` is a global max across all of `tse_sessions`, but tracked-player sessions (steps 4–6) have no date scoping and can push that max forward with a recent date even while the AKBC club backlog is still behind. With "From" previously read-only, there was no way to wind it back to actually process that backlog. Changed:
  - `scrapeClubSessions()`/`getDateRange()` (`pipelineScrape.ts`) now take an optional `fromDateOverride` (new first param, `toDateOverride` shifts to second) — falls back to the automatic `MAX(se_date)` when omitted, unchanged from before.
  - `/api/build/scrape` (`GET`/`POST`) reads an optional `?from_date=` query param alongside the existing `?to_date=`.
  - `PipelineTable.tsx`: "From" is now a `MyInput type='date'`, same as "To" — defaults to the automatic value only when empty (never resets after a completed run, so a manual backward override survives across catch-up runs), and both dates are sent as query params when set. Removed the now-unused `formatDDMMYYYY()` helper (the field no longer needs custom dd/mm/yyyy display now that it's a native date input like "To").
- [x] **Split the single header "Run All" button into 3 independent group actions**, per your decision — you'll run AKBC's catch-up first, then Tracked Players afterward, on your own timing, rather than always running all 8 steps as one chain. Cron scheduling for this 3-way split is deliberately deferred (not part of this step) — `vercel.json` is untouched.
  - **Run All (AKBC)** — Scrape AKBC → Build Sessions (AKBC batch) → Build Results (AKBC batch), i.e. today's `runAll()` steps 1–3.
  - **Run All (Tracked)** — Scrape Tracked Players → Build Sessions (Tracked batch) → Build Results (Tracked batch), i.e. today's steps 4–6.
  - **Finish Pipeline** — Build Partners → Update Stats, i.e. today's steps 7–8. Runs Update Stats' full recompute regardless of which of the other two groups ran most recently, since it isn't incremental.
  - Remove the existing single `runAll()`/"Run All" header button; replace with 3 separate handler functions and 3 buttons, each awaiting its own steps in sequence the same way `runAll()` does today (no polling/SSE, same client-sequenced model).
  - Per-row Run buttons and the existing "Refresh All" button are unaffected — this only changes what the group-run buttons do.
- [x] **Renumber the pipeline into 4 real top-level steps and split both the Run Pipeline table and the Jobs Summary into 3 panels matching them**, per your decision — resolves steps 2/3 (Build Sessions/Results) being ambiguously shared between the AKBC and Tracked batches under the old numbering.
  - New scheme written to `tpip_pipelinelog`: **Step 1 — AKBC** (`a` Scrape, `b` Build Sessions, `c` Build Results), **Step 2 — Tracked Players** (`a` Scrape, `b` Build Sessions, `c` Build Results), **Step 3 — Build Partners** (single row, `a`), **Step 4 — Update Stats** (`a`-`h`, unchanged letters, renumbered from step 6).
  - `buildSessionsFromStaging()`/`buildResultsFromStaging()` (`buildSteps.ts`) take a new `group: 'akbc' | 'tracked'` param (default `'akbc'`) — selects step 1 vs step 2 and sub_step `b`/`c` accordingly, since one shared function currently logs both batches under the same hardcoded step.
  - `/api/build/sessions-nzb`, `/api/build/results-nzb` routes read a new `?group=akbc|tracked` query param and pass it through.
  - `scrapeTrackedPlayerSessions()` (`pipelineScrape.ts`): step 4 → step 2, `sub_step: 'a'`.
  - `partners/route.ts`: step 5 → 3.
  - `stats.ts`/`recalculate/route.ts`: step 6 → 4 (sub-steps `a`-`h` unchanged).
  - `vercel.json`: the Tracked time-slot's `sessions-nzb`/`results-nzb` cron entries get `?group=tracked` appended; the AKBC time-slot's get `?group=akbc`.
  - `PipelineTable.tsx`: full split into 3 `MyBox` panels — **AKBC** (step 1 rows + its own Run-All button + From/To date inputs, since dates only apply here), **Tracked** (step 2 rows + its own Run-All button), **Finish** (step 3 + step 4 rows, including the 8 stats sub-rows, + its own Run-All button). Each panel gets its own mini "Jobs Summary" table scoped to its own step number(s) — Finish panel's summary covers both step 3 and step 4.
  - Known one-time transition gap: existing `tpip_pipelinelog` history was written under the old step numbers, so summary panels will look empty/stale for a step until it's run at least once post-renumbering — not a bug, just noted here so it isn't mistaken for one later.
- [x] **Fix a run_id-allocation regression introduced by the step renumbering above**: `resolvePipRunId()`'s `step === 1 || forceNewRun` rule was written when step 1 meant only Scrape AKBC — now that Build Sessions/Build Results (AKBC batch) are also step 1 (sub-steps `b`/`c`), every one of the 3 AKBC sub-steps independently matches `step === 1` and allocates its own fresh run_id (observed: sub-steps a/b/c logged as run_id 10/11/12 instead of sharing one number), instead of only the true first sub-step doing so.
  - `resolvePipRunId(step, forceNewRun)`: drop the `step === 1` auto-trigger — allocate a new run_id only when `forceNewRun` is explicitly `true`.
  - `scrapeClubSessions()` (`pipelineScrape.ts`, the one genuine "start of a coordinated run"): change its call from `resolvePipRunId(1, false)` to `resolvePipRunId(1, true)`.
  - Every other call site (`buildSessionsFromStaging`/`buildResultsFromStaging` for both groups, `scrapeTrackedPlayerSessions`, `partners/route.ts`, `stats.ts`/`recalculate/route.ts`) already passes `false` (or a `forceNewRun` param that's always `false` in practice) — no other call site needs to change, since none of them should ever force a new run.
- [x] **Log one `xlg_logging` message per tracked player during Scrape Tracked Players**, per your decision — visibility into per-player progress during a potentially long-running loop over many players. Not written to `tpip_pipelinelog` — that table's `pip_sub_step` is a single character (already fully used for `a`-`h`/`a`-`c`) and it's a completion ledger (one row per finished step with counts/duration), not a fit for an unbounded per-item progress log.
  - Use a new severity `'P'` (not `'I'`) — confirmed `write_logging()` only gates `'I'`/`'D'` behind `NEXT_PUBLIC_APPENV_LOG_I`/`_LOG_D`; any other character (including `'P'`) always writes regardless of that flag. No `nextjs-shared` change needed — `lg_severity` is a free `character(1)` column with no `CHECK` constraint, and the TS prop type is a plain `string`.
  - `scrapeTrackedPlayerSessions()` (`pipelineScrape.ts`): add `pl_name` to the existing flagged-players `SELECT` (currently only selects `pl_nz_bridge_number`), then call `write_logging()` once per player inside the loop with a message like `Player {name}: {n} new run_ids found`.

- [x] **Replace the per-player `xlg_logging` messages with per-player rows in `tpip_pipelinelog` itself**, per your decision (supersedes the previous step's `write_logging('P', ...)` approach, which is removed) — shown as a collapsible detail list under the existing "Scrape Tracked Players" summary row, using a new `pip_sub_sub` column rather than overloading `pip_sub_step`.
  - `scripts/schema.sql` + manual SQL (given in chat, not run by Claude): add `pip_sub_sub character varying(4)` (nullable) to `tpip_pipelinelog` — `NULL` for every existing row/step, populated only for per-player detail rows. `pip_sub_step` is untouched, no widening needed.
  - `pipelineLog.ts`: `PipelineStatus` type gets `pip_sub_sub: string | null`; `logPipelineStep()` takes an optional `sub_sub` arg, included in the `tpip_pipelinelog` INSERT (`NULL` when omitted); `getPipelineRunStatus()`'s query changes from `DISTINCT ON (pip_step, pip_sub_step)` to `DISTINCT ON (pip_step, pip_sub_step, pip_sub_sub)` — Postgres groups all-`NULL` rows together for `DISTINCT ON`, so the existing aggregate row (the only one with `sub_sub IS NULL` for that key) is unaffected, while each per-player row (distinct `sub_sub`) now also survives instead of collapsing to just the latest.
  - `pipelineScrape.ts`: remove the `write_logging({ ..., lg_severity: 'P' })` call added in the previous step. Instead, inside `scrapeTrackedPlayerSessions()`'s per-player loop, call `logPipelineStep({ run_id, step: 2, sub_step: 'a', sub_sub: <zero-padded index, '01'/'02'/... in the existing `pl_name ASC` order>, step_name: player.pl_name, output_recs: missing.length, duration_ms: <per-player timing> })` — same `step`/`sub_step` as the aggregate row, distinguished only by `sub_sub`.
  - `PipelineTable.tsx`'s `PipelineJobsSummary`: the step-2 "Scrape Tracked Players" row (`sub_step: 'a'`, `sub_sub: null`) gets a ▶/▼ toggle (local expand/collapse state). Expanded, it lists every row for that run/step/sub_step with `pip_sub_sub` not null, sorted by `pip_sub_sub`, each showing that player's run_ids-found count and timestamp.

- [x] **Switch the 3 stacked panel-pairs to tabs**, per your decision — `MyTab` (already used in `BuildDataViewer.tsx` for its Production/ts1/ts2 tabs) selects one of AKBC / Tracked Players / Finish; the selected tab shows that group's Jobs Summary panel + Run Pipeline table together (not 6 separate tabs — each tab is the full self-contained view for that group).

## Changes

### scripts/schema.sql
- Added `tpip_pipelinelog` table (between `tpa_partners` and `tpl_players`) — completion-log table
  for the pipeline, mirroring the chess project's `tpip_pipelinelog`: `pip_run_id`, `pip_step`,
  `pip_sub_step`, `pip_step_name`, input/output table+record counts, `pip_duration_ms`,
  `pip_created`. No FKs/CASCADE, `GENERATED BY DEFAULT AS IDENTITY` PK, per convention.

### src/lib/actions/pipelineLog.ts (new)
- `resolvePipRunId()` — allocates the run_id shared across one coordinated run (step 1 or a forced
  new run always takes `MAX+1`; every other step reuses the current max).
- `logPipelineStep()` — single INSERT once a step finishes.
- `getRecentRunIds()` — last 5 distinct run_ids.
- `getPipelineRunStatus(runId)` — latest row per `(step, sub_step)` within one run_id (not
  collapsed to one row per step, so Update Stats' 8 sub-steps all show up). Its earlier sibling
  `getLatestPipelineRuns()` (latest per step across all runs) was removed once the bottom "Run
  Pipeline" table stopped reading last-run info from the log at all — chess's own "Processed"
  column reads from the immediate API result, not the log, so that data source turned out to be
  dead code once the columns were rebuilt to match.

### src/lib/actions/pipelineScrape.ts (new)
- `scrapeNewSessions()` — combines the old cron route's Phase A (club-by-date discover), Phase B
  (tracked-player discover), and Phase C (scrape each missing run_id → ts1_sessions +
  ts2_results) into one function. Automatic date range only (last built session date → today) —
  per your decision, the manual date-range/source picker from the old `RawScrape.tsx` was dropped,
  not carried over. Logs to `tpip_pipelinelog` step 1.

### src/lib/actions/buildSteps.ts (new)
- `buildSessionsFromStaging()` and `buildResultsFromStaging()` — the actual INSERT logic
  previously duplicated between `/api/build/sessions-nzb` + `/api/build/results-nzb` and the cron
  route's Phase D. Now a single implementation each, called by both the API routes and the cron
  route. Each logs to `tpip_pipelinelog` (steps 2–3).

### src/lib/actions/stats.ts (new)
- `rebuildAllStats()` — the cron route's old Phase E (truncate + rebuild `ta1_player_stats` /
  `ta2_partner_stats` for groups A/B/C/all), now a single implementation shared by the new
  `/api/build/stats` route and the cron route. Logs step 5.

### src/app/api/build/sessions-nzb/route.ts, results-nzb/route.ts
- Thinned to call the new `buildSteps.ts` functions instead of inlining SQL directly.

### src/app/api/build/partners/route.ts
- Added a `logPipelineStep()` call (step 4). Note: this route only counts existing
  `tpa_partners` rows (`buildAllPartnerStats()`) — it doesn't insert anything new itself (the
  actual partner upsert happens inside `buildResultsFromStaging()`). Kept as its own pipeline row
  since that's how it was already presented in the old Tools list ("Build Partners").

### src/app/api/build/scrape/route.ts, stats/route.ts (new)
- Thin routes wrapping `scrapeNewSessions()` and `rebuildAllStats()` for the pipeline table.

### src/app/api/cron/update-sessions/route.ts
- Rewritten to call `scrapeNewSessions(true)`, `buildSessionsFromStaging()`,
  `buildResultsFromStaging()`, `buildAllPartnerStats()`, `rebuildAllStats()` instead of duplicating
  all the SQL inline. The scheduled cron run now logs to `tpip_pipelinelog` the same way manual
  per-step runs do.

### src/ui/admin/PipelineTable.tsx (new)
- One row per step (Scrape, Build Sessions, Build Results, Build Partners, Update Stats):
  description, last-run info read from `tpip_pipelinelog` (timestamp, row count, duration), a Run
  button with local running/result state, and a "Run All" button that client-sequences every step
  with `await`, refreshing the latest-run info after each — mirrors the chess project's
  client-sequenced model (no polling, no SSE, no server-side "current status").

### src/app/owner/pipeline/page.tsx (new)
- Renders `PipelineTable`, plus the existing `PlayerRefresh` (granular per-group stats
  truncate/recalc controls) inside a collapsible `<details>` "Advanced" section, per your decision
  to keep that control alongside the simplified one-click pipeline row.

### src/ui/admin/BuildDataViewer.tsx
- Turned into a tabbed component (`MyTab`, mirroring the old `ScrapeTabs.tsx` pattern): a
  "Production" tab (the existing players/sessions/partners viewer, unchanged), plus new `ts0`,
  `ts1`, `ts2` tabs rendering the existing `Ts0Links`, `Ts1Table`, `Ts2Table` components — per your
  decision to merge the staging viewers here rather than keep them on their own page.

### Removed
- `/owner/scrape`, `/owner/build`, `/owner/stats`, `/owner/cron` pages, and their now-orphaned
  components: `ScrapeTabs.tsx`, `RawScrape.tsx`, `StagingBar.tsx`, `PopulateTs2.tsx`,
  `BuildTables.tsx`, `CronRun.tsx`.
- `AdminPageClient.tsx` — also removed. It imported `RawScrape` but was itself unused by any
  route (no page imported it) — confirmed dead code before deleting, not part of the original
  removal list but left in place would have broken the build with a dangling import.
- The older parameterized routes (`scrape/discover/nzb-by-date`, `scrape/discover/nzb-by-flagged`,
  `scrape/raw/nzb-from-ts1sessions`, `scrape/raw/nzb-by-date`, `scrape/raw/nzb-by-runid`,
  `scrape/raw/nzb-by-flagged`) were left in place, unlinked from any page — not deleted, since only
  the 4 owner pages were in scope, not their underlying API routes. They still work if called
  directly.

### src/app/owner/page.tsx
- `TOOLS` array: removed "Full Pipeline Run", "Raw Data Scraping", "Build Tables", "Update Stats";
  added a single "Pipeline" entry pointing to `/owner/pipeline`. Kept "Players" and renumbered
  "Build Data Viewer" to step 1 (now the only remaining inspection tool alongside Pipeline).

### src/lib/actions/pipelineLog.ts
- Added `getPipelineRunStatus(runId)` — latest row per step within one specific `run_id`, for the
  new summary table's run-id picker (distinct from `getLatestPipelineRuns()`, which is latest per
  step across all runs regardless of which run they belong to).

### src/ui/admin/PipelineTable.tsx
- Added a "Pipeline Jobs" summary table above the existing per-step Run table, mirroring chess's
  layout: one row per step (Last Run, Input Table/Recs, Output Table/Recs, Duration, Status badge),
  scoped to a single selected `run_id` via a `MySelect` dropdown (last 5 runs via
  `getRecentRunIds()`, defaulting to the most recent). Refreshes automatically after any step (or
  Run All) completes, via a `refreshKey` counter passed down from the parent.

### .claude/CLAUDE.md
- Rewrote the "Pipeline" section to describe the new 5-step `/owner/pipeline` table and the shared
  lib functions behind it.
- Renamed "Admin routes" → "Owner routes" and corrected it to the actual `/owner/*` paths (it
  previously listed `/admin/*` paths that don't exist in this codebase — pre-existing stale
  documentation, fixed while already touching this section).
- Added a note to "Scrape API routes" that those routes are now unlinked from any page (manual/curl
  use only).

### src/lib/actions/pipelineScrape.ts
- Extracted the club-by-date + tracked-player discovery loop (previously inline in
  `scrapeNewSessions()`) into a private `discoverMissingRunIds()`, shared with a new
  `countMissingSessions()` — a read-only "remaining" count for the Scrape row's Refresh button.
  This is the one row whose Refresh is genuinely slower than the others: it makes the same live
  HTTP calls to nzbridge.co.nz as the Run action itself, just without the final scrape-and-write
  step, since there's no SQL-only way to know what's missing.

### src/lib/actions/pipelineStatus.ts (new)
- `refreshScrapeStatus()`, `refreshSessionsStatus()`, `refreshResultsStatus()`,
  `refreshPartnersStatus()` — each returns `{ remaining: number }` for one Run Pipeline row. Update
  Stats has no equivalent function — it has no Remaining/Status per your decision (full
  truncate+rebuild every run, no incremental backlog concept applies).

### src/lib/actions/statsCompute.ts (new)
- `computePlayerGroupStats(grp)` / `computePartnerGroupStats(grp)` — the per-group INSERT query
  (previously duplicated between `recalculate/route.ts` and `stats.ts`), now written once and
  parameterized on group/`'all'`. Both callers keep their own outer shape (SSE-streamed single
  group vs. batch/logged loop over all groups) — only the query text was deduplicated.

### src/app/api/players/recalculate/route.ts
- `player_grp`/`partner_grp` modes now call `computePlayerGroupStats`/`computePartnerGroupStats`
  instead of inlining the INSERT — same SSE response shape, no behavior change.

### src/lib/actions/stats.ts
- `rebuildAllStats()` rewritten to loop over both tables' 4 groups (A/B/C/all) via the new
  `statsCompute.ts` helpers, logging each of the 8 group computations as its own
  `tpip_pipelinelog` sub-step (`a`–`d` for `ta1_player_stats`, `e`–`h` for `ta2_partner_stats`)
  instead of one aggregate row at the end — per your decision to log at the actual-write
  granularity.

### src/ui/admin/PipelineHelp.tsx (new)
- Top-of-page wide help popover (mirroring chess's `PipelineHelp.tsx`) — one card per step with
  input/processing/output prose specific to next-bridge's schema, plus a row-count SQL snippet
  across all 7 pipeline-relevant tables. Mounted next to the "Pipeline" `<h1>` on
  `/owner/pipeline`.

### src/ui/admin/PipelineTable.tsx (rewritten)
- Full rebuild of the "Run Pipeline" table to match chess's column set exactly: Step, Description,
  Help (`MyHelpStep` per-step popover), Processed (from the immediate run result, not the log),
  SQL (`MyHelp` popover — explanatory text instead of a query for Scrape, since it has no
  SQL-only status check), Refresh (per-row ↻, plus a header "Refresh All"), Remaining (live count),
  Status (badge), Result (error only), Run — with Update Stats' Refresh/Remaining/Status cells
  showing `—` per your decision.
- `PipelineJobsSummary` now renders step 5 as a bold group header row with its 8 sub-steps
  indented underneath (mirroring chess's `JOB_GROUPS`/`Fragment` pattern) instead of one collapsed
  row; steps 1–4 are unchanged single rows. Added the missing ↻ refresh button next to the run-id
  `MySelect`.
- Both sections now use `nextjs-shared/MyBox` instead of hand-rolled bordered `<div>`s.
- "Refresh All" and "Run All" moved into the table's own header row (as `<th>` cells), matching
  chess's layout, instead of floating above the table.
- Removed the `max-w-3xl` constraint on the outer wrapper (now `<div className='space-y-4
  relative'>`, matching chess) — the 8-column Jobs summary no longer needs a horizontal scrollbar.

### src/app/owner/pipeline/page.tsx
- Added `<PipelineHelp />` next to the `<h1>Pipeline</h1>` heading; removed the page's own
  `max-w-3xl` wrapper for the same width reason as above.

### src/lib/actions/pipelineScrape.ts, pipelineStatus.ts, src/ui/admin/PipelineTable.tsx
- Removed `countMissingSessions()` and `refreshScrapeStatus()` — there is no valid SQL-only
  "remaining" count for the Scrape step, and computing one via live HTTP calls to nzbridge.co.nz
  was firing automatically on every `/owner/pipeline` page load (`doRefreshAll()`'s mount-time
  `useEffect`), making the page slow to open every time regardless of whether anyone needed that
  number. Row 1 (Raw Data Scraping) now shows `—` for Remaining/SQL/Refresh/Status, same as Update
  Stats' row — it still has Description, Help, Processed, Result, and Run.

### src/app/api/players/recalculate/route.ts
- Converted from an SSE stream to a plain JSON `NextResponse` — it only ever sent one final
  `{done:true,...}` event, so the streaming was unused complexity once nothing needed live
  progress. Added a `logPipelineStep()` call for every mode: the 8 group ops (`player_grp`/
  `partner_grp` × A/B/C/all) log under the same step 5 sub-steps `a`–`h` that `stats.ts`'s full
  rebuild already uses (they're literally the same `computePlayerGroupStats`/
  `computePartnerGroupStats` calls); the 2 truncate modes log under new sub-steps `i` (Player
  Stats — Truncate) and `j` (Partner Stats — Truncate). Every call reuses the current run_id via
  `resolvePipRunId(5, false)` rather than starting a new one.

### src/ui/admin/PipelineTable.tsx
- Added 10 sub-rows under the Update Stats row (`STATS_SUB_ROWS`, driven by a `.map()` unlike the
  5 main hand-written rows, since these are structurally identical) — one per manual operation,
  each with its own Run button hitting `/api/players/recalculate` via the table's existing plain
  `run()`/`runStep()` helper. Same minimal column treatment as Update Stats itself: Help/SQL/
  Remaining/Status all `—`, only Description/Processed/Result/Run are live. Truncate rows show
  "cleared" in Processed instead of a row count.
- Extended `STEP5_SUBSTEPS` (used by `PipelineJobsSummary`) with the 2 new truncate sub-steps
  (`i`, `j`) so the Pipeline Jobs summary reflects everything logged under step 5, not just the
  original automatic 8.

### Removed
- `src/ui/admin/PlayerRefresh.tsx` and the `<details>` "Advanced — manual stats controls" wrapper
  on `src/app/owner/pipeline/page.tsx` — fully replaced by the 10 new table rows.

### src/lib/actions/statsCompute.ts, stats.ts, src/app/api/players/recalculate/route.ts, src/ui/admin/PipelineTable.tsx
- `computePlayerGroupStats()`/`computePartnerGroupStats()` switched from plain `INSERT` to
  `INSERT ... ON CONFLICT (a1_plid, a1_group) DO UPDATE SET ... = EXCLUDED...` (and the
  `a2_paid, a2_group` equivalent), per your decision — each group can now be re-run independently
  with no truncate needed first. Accepted tradeoff: a player/partnership that no longer appears in
  a group's current computation keeps its old row instead of being cleaned up (unlike
  truncate+reinsert, which guarantees a clean slate).
- Removed the `TRUNCATE ta1_player_stats, ta2_partner_stats RESTART IDENTITY` call from
  `rebuildAllStats()` — no longer needed once every group write is an upsert.
- Removed the `player_truncate`/`partner_truncate` modes from `recalculate/route.ts` entirely
  (including their `i`/`j` `logPipelineStep` sub-steps) — truncate is fully removed, not hidden.
- Removed the 2 "Truncate" rows from `STATS_SUB_ROWS` (`PipelineTable.tsx`) — back to 8 rows
  (Player/Partner Stats × A/B/C/All) — and removed `i`/`j` from `PipelineJobsSummary`'s
  `STEP5_SUBSTEPS`.

### src/lib/actions/pipelineScrape.ts
- `scrapeRunId()` now deletes a run_id's `ts1_sessions` row if zero pairs were found for it during
  that same scrape call (a session with genuinely no player/pair data on nzbridge.co.nz) — so it
  never reaches Build Sessions with nothing for Build Results to ever fill in. This check is
  real-time (evaluated against the pairs just scraped for that run_id), not a later comparison
  against `ts2_results` — see the retracted one-off correction above for why that distinction
  matters.

### Incident note (not a code change)
- On 2026-07-25, a since-retracted "one-off correction" query (see the struck-through plan item
  above) was run against the local DB and deleted ~14,074 legitimate `tse_sessions` rows, based on
  a wrong premise about `ts2_results` being a cumulative history rather than a per-run staging
  table. Recovered by restoring `tse_sessions` from production via next-dbadmin. No production data
  was affected. Flagging here so the reasoning behind the ongoing fix's real-time-only check isn't
  lost if this file is read later without the surrounding conversation.

### vercel.json
- Replaced the single `/api/cron/update-sessions` entry with 5 independently-scheduled crons, one
  per pipeline step (`scrape` 14:00 UTC, `sessions-nzb` 14:20, `results-nzb` 14:40, `partners`
  15:00, `stats` 15:20 — uniform 20-minute spacing, matching chess exactly). Fixes the likely root
  cause of stale prod data: the old single request ran all 5 steps in one Vercel function
  invocation, and Scrape alone can take 20+ minutes during backlog catch-up — almost certainly
  killed by the platform's function timeout before Update Stats ever ran, with no error logged
  (a platform-level kill doesn't hit the route's own `catch` block).

### src/app/api/build/scrape/route.ts
- Added a `GET` handler (Vercel Cron only triggers `GET`) alongside the existing `POST`, both
  calling the same `run()` function. Added `checkCronAuth()` — the same `if (secret && !isDev)`
  `CRON_SECRET` check already used in `/api/cron/update-sessions` — applied to both `GET` and
  `POST`. This is the only one of the 5 build routes with an auth check, matching chess's
  `/api/cron/sync` role as the pipeline's first step.

### src/app/api/build/sessions-nzb/route.ts, results-nzb/route.ts, partners/route.ts, stats/route.ts
- Added a `GET` handler alongside the existing `POST` on each, both calling the same `run()`
  function — no auth check on any of these 4, matching chess's accepted-risk precedent for its
  other 8 analysis routes (only the first step in the chain is protected).

### src/app/api/cron/update-sessions/route.ts
- Left as-is, just unscheduled (removed from `vercel.json`) — kept as a manual "run everything in
  one shot" fallback rather than deleted.

### Removed
- `ts0_scraped` viewer and every remaining code reference to it: `src/ui/admin/Ts0Links.tsx`,
  `src/app/api/scrape/ts0/route.ts`, the "ts0" tab in `BuildDataViewer.tsx`, and the
  INSERT/TRUNCATE/SELECT statements referencing it in `scrape/staging/route.ts`,
  `scrape/discover/nzb-by-flagged/route.ts`, `scrape/raw/nzb-by-flagged/route.ts`,
  `scrape/discover/nzb-by-date/route.ts`, `scrape/raw/nzb-from-ts1sessions/route.ts` — those 5
  routes otherwise unchanged (still unlinked, still work). Also removed a `source` request-body
  param in `nzb-from-ts1sessions/route.ts` that only existed to feed the now-removed `ts0_scraped`
  insert. Table itself and `scripts/schema.sql` untouched — can be dropped separately later if
  wanted.

### src/lib/actions/pipelineLog.ts, pipelineScrape.ts
- Replaced 5 `table_query` calls with the dedicated generic function they match: `logPipelineStep()`
  now uses `table_write`; `scrapeRunId()`'s `ts1_sessions` upsert now uses `table_upsert`; its
  `ts2_results` insert and `getOrCreatePlayer()`'s `tpl_players` insert now use `table_write` with
  a `conflictColumn`; `scrapeNewSessions()`'s combined `TRUNCATE ts1_sessions, ts2_results` is now
  two separate `table_truncate()` calls. No behavior change — same SQL shape, generated by the
  shared functions instead of hand-written.

### src/lib/actions/pipelineScrape.ts, src/app/api/build/scrape/route.ts, src/ui/admin/PipelineTable.tsx
- `scrapeNewSessions()` takes an optional `toDateOverride` (second param), used in place of "today"
  when computing the scrape's date range — omitted, it behaves exactly as before (cron never
  passes it). `getDateRange()`'s `MAX(se_date)` query was factored into a shared
  `getMaxSessionDate()` helper, reused by a new exported `getScrapeFromDate()` for UI display.
- `/api/build/scrape`'s `GET`/`POST` read an optional `?to_date=YYYY-MM-DD` query param and pass it
  through.
- "From: {date}" (read-only, dd/mm/yyyy, the automatic starting point) and a "To:" date input now
  sit on the "Run Pipeline" box's own header row (next to the title), not in the Scrape table row
  — moved there per follow-up request. Leave "To" blank for normal behavior, or set a date to cap
  that run's range and advance it in smaller chunks to manually catch up a backlog. Refreshes
  after every Scrape run and on page load. `MyBox` no longer uses its `title` prop here (it only
  accepts a plain string) — replaced with a custom header `<div>`.

### src/lib/actions/pipelineScrape.ts
- Split into `scrapeClubSessions(toDateOverride?)` (step 1 — truncates `ts1_sessions`/`ts2_results`
  at the start, date-scoped club-by-date discovery only) and `scrapeTrackedPlayerSessions()` (step
  4 — no truncate, no date scoping, full player history as before). Removed the old
  `scrapeNewSessions()`/`ScrapeNewSessionsResult` — nothing references them anymore. The `pairs`
  loop was factored into a shared `scrapeRunIds()` used by both.
- `batchCheckMissing()` now excludes a run_id if it exists in **either** `tse_sessions` (built) or
  `ts1_sessions` (scraped, not yet built) — a `UNION` query instead of checking `tse_sessions`
  alone. This is the actual fix for redundant re-scraping: a session already captured by a
  previous run (whichever step found it) is never re-fetched from nzbridge.co.nz again, regardless
  of truncate timing or how many tracked players share one session (the existing `Set<number>` for
  `allMissingIds` already deduped *within* one discovery pass — this fixes the *across-runs* case).
- Dropped the `forceNewRun` parameter that `scrapeNewSessions()` used to take — it was always a
  no-op, since `resolvePipRunId(1, forceNewRun)`'s `step === 1 || forceNewRun` condition already
  forces a new run for step 1 unconditionally. Found and removed while rewriting this function.

### src/lib/actions/buildSteps.ts
- `buildSessionsFromStaging()`/`buildResultsFromStaging()` take optional `fromDate`/`toDate`
  parameters — an explicit date-range safeguard (via `s1_date`/`se_date BETWEEN`) on top of the
  natural ordering, per your decision. Only meaningfully populated by the UI's "Run All" and the
  `/api/cron/update-sessions` fallback route (both know the actual date range in JS after Scrape
  AKBC returns it) — the 8 separately-scheduled Vercel crons can't pass a dynamic value from a
  previous step's result, so those invocations run unfiltered, relying on the natural
  truncate+ordering instead. Not a correctness gap — just means the explicit safeguard is inactive
  for that specific invocation path.

### New route: src/app/api/build/scrape-tracked/route.ts
- `GET`/`POST` wrapping `scrapeTrackedPlayerSessions()` — no `CRON_SECRET` check, same as every
  build route except `/api/build/scrape` (the actual first step in the sequence).

### src/app/api/build/scrape/route.ts
- Now calls `scrapeClubSessions()` instead of the removed `scrapeNewSessions()` — otherwise
  unchanged (still the only route with the `CRON_SECRET` check, still takes `?to_date=`).

### src/app/api/build/sessions-nzb/route.ts, results-nzb/route.ts
- `GET`/`POST` now also read optional `?from_date=`/`?to_date=` query params and pass them through
  to the corresponding `buildSteps.ts` function.

### Step renumbering
- `partners/route.ts`: step 4 → 5.
- `stats.ts`, `recalculate/route.ts`: step 5 → 6 (sub-step letters `a`–`h` unchanged, only the
  parent step number).
- `PipelineTable.tsx`'s `PipelineJobsSummary`: simple-row step list is now `[1,2,3,4,5]`; the
  8-sub-step group is now step 6 (`STEP6_SUBSTEPS`, renamed from `STEP5_SUBSTEPS`). `STEP_LABELS`
  updated: 1 Scrape AKBC, 2 Build Sessions, 3 Build Results, 4 Scrape Tracked Players, 5 Build
  Partners, 6 Update Stats.

### src/app/api/cron/update-sessions/route.ts
- Rewritten for the new 8-stage sequence: `scrapeClubSessions()` → `buildSessionsFromStaging()` /
  `buildResultsFromStaging()` (both passed the club result's `from_date`/`to_date`) →
  `scrapeTrackedPlayerSessions()` → `buildSessionsFromStaging()` / `buildResultsFromStaging()`
  (unfiltered this time) → `buildAllPartnerStats()` → `rebuildAllStats()`. Summary response now
  sums both scrape/build passes' counts together.

### src/ui/admin/PipelineTable.tsx (rewritten)
- 8 rows now: Scrape AKBC, Build Sessions (AKBC batch), Build Results (AKBC batch), Scrape Tracked
  Players, Build Sessions (Tracked batch), Build Results (Tracked batch), Build Partners, Update
  Stats. The two "batch" pairs share the same step number/Remaining/Status state as their
  counterpart (there's one shared backlog concept, not two) but have independent Processed/Result/
  Run state per row (distinct `results` keys: `scrape-club`/`sessions-club`/`results-club` vs
  `scrape-tracked`/`sessions-tracked`/`results-tracked`).
- `run()` now returns the fetched JSON data (not just void), so `runAll()` can thread the Club
  scrape's actual `from_date`/`to_date` directly into the two AKBC-batch build calls without
  relying on React state having settled yet — reading back from `results` state inside the same
  synchronous sequence would see stale closures from before the state update landed. Standalone
  row clicks (not part of Run All) fall back to reading the last completed `scrape-club` result
  from `results` state, which is safe there since it's a separate render by the time you click.
- `runAll()` sequence: Scrape AKBC → Build Sessions (AKBC) → Build Results (AKBC) → Scrape Tracked
  → Build Sessions (Tracked) → Build Results (Tracked) → Build Partners → Update Stats.

### vercel.json
- 8 cron entries, uniform 20-minute spacing, matching the new sequence order (`/api/build/scrape`
  14:00 → `/api/build/sessions-nzb` 14:20 → `/api/build/results-nzb` 14:40 →
  `/api/build/scrape-tracked` 15:00 → `/api/build/sessions-nzb` 15:20 → `/api/build/results-nzb`
  15:40 → `/api/build/partners` 16:00 → `/api/build/stats` 16:20, all UTC). The same two paths each
  appear twice at different times — that's expected, matching the two separately-scheduled build
  passes.

### src/lib/constants.ts
- Added `SCRAPE_DEFAULT_TO_DATE_WINDOW_DAYS = 7` — the Pipeline page's "To" date default span
  ahead of the automatic "From" date.

### src/ui/admin/PipelineTable.tsx
- `doRefreshAll()`'s "To" default changed from matching "From" exactly to `addDays(rFromDate,
  SCRAPE_DEFAULT_TO_DATE_WINDOW_DAYS)` (1 week ahead), via a new `addDays()` helper. Only applied
  when "To" is empty, same as before.
- "From" is now an editable `MyInput type='date'` (was a read-only `formatDDMMYYYY()`-formatted
  `<span>`), matching "To" exactly: defaults to the automatic `getScrapeFromDate()` value only when
  empty, and is never reset after a completed Scrape run — so a manual backward override (needed
  when tracked-player sessions have pushed the automatic `MAX(se_date)` ahead of where the AKBC
  club backlog actually is) persists across repeated catch-up runs instead of snapping back.
  Removed the now-unused `formatDDMMYYYY()` helper.
- `handleScrapeClub()` now builds its query string with `URLSearchParams`, including `from_date`
  whenever "From" is set (previously only `to_date` was ever sent).

### src/lib/actions/pipelineScrape.ts
- `getDateRange()` and `scrapeClubSessions()` both take a new optional `fromDateOverride` param
  (first positional param now, `toDateOverride` shifted to second) — falls back to the existing
  automatic `MAX(se_date)` behavior when omitted, so the cron route's argument-less call is
  unaffected.

### src/app/api/build/scrape/route.ts
- `GET`/`POST` now also read an optional `?from_date=` query param, passed through as
  `scrapeClubSessions`'s new first argument.

### scripts/schema.sql
- Added `pip_sub_sub character varying(4)` (nullable) to `tpip_pipelinelog` — populated only for
  per-item detail rows (currently: one per tracked player under step 2's "Scrape" sub-step);
  `NULL` for every other existing row. `pip_sub_step` untouched, no widening needed.

### src/lib/actions/pipelineLog.ts
- `PipelineStatus` type gets `pip_sub_sub: string | null`. `logPipelineStep()` takes an optional
  `sub_sub` arg (`NULL` when omitted). `getPipelineRunStatus()`'s `DISTINCT ON (pip_step,
  pip_sub_step)` becomes `DISTINCT ON (pip_step, pip_sub_step, pip_sub_sub)` — Postgres groups
  all-`NULL` rows together for `DISTINCT ON`, so every existing step/sub-step (which only ever had
  one `NULL`-`sub_sub` row) is unaffected; per-player rows (each a distinct `sub_sub`) now survive
  instead of collapsing to just the latest.

### src/lib/actions/pipelineScrape.ts
- `scrapeTrackedPlayerSessions()`'s flagged-players query now also selects `pl_name` (was just
  `pl_nz_bridge_number`). Removed the previous step's `write_logging({ lg_severity: 'P', ... })`
  call — replaced with one `logPipelineStep()` call per player inside the loop: same `step: 2,
  sub_step: 'a'` as the existing aggregate "Scrape Tracked Players" row, but with a unique
  `sub_sub` (zero-padded index, `'01'`/`'02'`/…, matching the existing `pl_name ASC` order),
  `step_name` the player's name, `output_recs` the missing-count, and per-player `duration_ms`.
  Tracked in `tpip_pipelinelog` now, not `xlg_logging`.

### src/lib/actions/pipelineLog.ts
- `resolvePipRunId()` no longer treats `step === 1` as an automatic "start a new run" trigger —
  that rule only worked when step 1 meant exclusively Scrape AKBC; after the renumbering, Build
  Sessions/Build Results (AKBC batch) are also step 1 (sub-steps `b`/`c`), so all 3 sub-steps were
  independently matching `step === 1` and each grabbing its own fresh `MAX(pip_run_id)+1` instead
  of sharing one number (observed: sub-steps a/b/c logged as run_id 10/11/12). Now only an explicit
  `forceNewRun: true` allocates a new run_id.

### src/lib/actions/pipelineScrape.ts
- `scrapeClubSessions()` — the one genuine "start of a coordinated run" — now calls
  `resolvePipRunId(1, true)` instead of `resolvePipRunId(1, false)`, since the automatic trigger it
  used to rely on is gone. No other call site changes: every other step already passed `false` (or
  a `forceNewRun` param that's always `false` in practice), so they're unaffected by removing the
  `step === 1` special case.

### src/ui/admin/PipelineTable.tsx
- Added a `MyTab` bar (AKBC / Tracked Players / Finish, matching `BuildDataViewer.tsx`'s existing
  tab pattern) above the 3 panel-pairs — only the active tab's `PipelineJobsSummary` + `MyBox` Run
  Pipeline table pair renders (`activeTab === 'akbc' | 'tracked' | 'finish'` guards), instead of all
  3 stacked permanently. New `Tab` type + `TABS` array; new `activeTab` state, default `'akbc'`.

### src/lib/actions/buildSteps.ts
- `buildSessionsFromStaging()`/`buildResultsFromStaging()` take a new `group: 'akbc' | 'tracked' =
  'akbc'` param — selects step 1 vs step 2 and sub_step `b`/`c` accordingly, since one shared
  function logs completion for both the AKBC and Tracked batches under the same call site.

### src/app/api/build/sessions-nzb/route.ts, results-nzb/route.ts
- `GET`/`POST` now also read an optional `?group=akbc|tracked` query param (defaulting to `akbc`)
  and pass it through as the new 4th argument to the corresponding `buildSteps.ts` function.

### src/lib/actions/pipelineScrape.ts
- `scrapeTrackedPlayerSessions()`: step 4 → step 2 (`sub_step: 'a'`), matching the new numbering
  (Tracked Players is now its own top-level step, not appended after AKBC's 3 steps).

### src/app/api/build/partners/route.ts
- Step 5 → 3.

### src/lib/actions/stats.ts, src/app/api/players/recalculate/route.ts
- Step 6 → 4 (sub-step letters `a`-`h` unchanged).

### src/app/api/cron/update-sessions/route.ts
- Tracked-batch `buildSessionsFromStaging()`/`buildResultsFromStaging()` calls now pass
  `group: 'tracked'` explicitly (4th arg) so the fallback route logs correctly under the new
  scheme; AKBC-batch calls rely on the `'akbc'` default.

### vercel.json
- The Tracked time-slot's `sessions-nzb`/`results-nzb` cron paths get `?group=tracked` appended;
  the AKBC time-slot's get `?group=akbc` (explicit, though `akbc` is also the route's default).

### src/ui/admin/PipelineTable.tsx
- `PipelineJobsSummary` now takes `steps: number[]` and `title: string` props instead of always
  rendering all 6 old steps — module-level `STEP_LABELS`/`STEP_SUBSTEPS` config replaces the old
  hardcoded `[1,2,3,4,5]` array + single step-6-only `STEP6_SUBSTEPS` special case, so any step
  with sub-steps (1, 2, or 4) renders as a bold group header + indented sub-rows, and step 3
  (no sub-steps) renders as a single bold row — driven generically by `steps.map()`.
- Split the single "Run Pipeline" `MyBox`/table into 3 separate `MyBox` panels: **AKBC** (rows
  1a/1b/1c, its own "Run All (AKBC)" header button, From/To date inputs — the only panel where
  dates apply), **Tracked Players** (rows 2a/2b/2c, "Run All (Tracked)"), **Finish** (Build
  Partners + Update Stats + its 8 stats sub-rows, "Finish Pipeline"). Each panel keeps its own
  "Refresh" header button (all three call the same shared `doRefreshAll()` — the underlying
  sessions/results/partners status counts are global, not per-panel).
  Also split the single "Pipeline Jobs" summary into 3 matching `PipelineJobsSummary` instances
  (`steps={[1]}`, `steps={[2]}`, `steps={[3,4]}`), each with its own run-id picker.
- Row/title text and `MyHelpStep`/`consumers` cross-references renumbered throughout to match:
  1a Scrape AKBC, 1b Build Sessions — AKBC batch, 1c Build Results — AKBC batch, 2a Scrape Tracked
  Players, 2b Build Sessions — Tracked batch, 2c Build Results — Tracked batch, 3 Build Partners,
  4 Update Stats.
- Replaced the single `runAll()`/"Run All" header button with 3 independent group actions:
  `runAllAkbc()` (Scrape AKBC → Build Sessions → Build Results), `runAllTracked()` (Scrape Tracked
  Players → Build Sessions → Build Results), and `runFinishPipeline()` (Build Partners → Update
  Stats). `runningAll` state changed from a boolean to `'akbc' | 'tracked' | 'finish' | null` so
  only the active group's button shows "Running…" while all three (plus every per-row Run button)
  are disabled during any run. Per-row Run buttons and "Refresh All" are unchanged. `vercel.json`
  untouched — cron scheduling for this split is deferred to a later decision.

### scripts/schema.sql
- Added `pip_sub_sub character varying(4)` (nullable) to `tpip_pipelinelog` — populated only for
  per-item detail rows (currently: one per tracked player under step 2's "Scrape" sub-step);
  `NULL` for every other existing row. `pip_sub_step` untouched, no widening needed.

### src/lib/actions/pipelineLog.ts
- `PipelineStatus` type gets `pip_sub_sub: string | null`. `logPipelineStep()` takes an optional
  `sub_sub` arg (`NULL` when omitted). `getPipelineRunStatus()`'s `DISTINCT ON (pip_step,
  pip_sub_step)` becomes `DISTINCT ON (pip_step, pip_sub_step, pip_sub_sub)` — Postgres groups
  all-`NULL` rows together for `DISTINCT ON`, so every existing step/sub-step (which only ever had
  one `NULL`-`sub_sub` row) is unaffected; per-player rows (each a distinct `sub_sub`) now survive
  instead of collapsing to just the latest.

### src/lib/actions/pipelineScrape.ts
- `scrapeTrackedPlayerSessions()`'s flagged-players query now also selects `pl_name` (was just
  `pl_nz_bridge_number`). Removed the previous step's `write_logging({ lg_severity: 'P', ... })`
  call — replaced with one `logPipelineStep()` call per player inside the loop: same `step: 2,
  sub_step: 'a'` as the existing aggregate "Scrape Tracked Players" row, but with a unique
  `sub_sub` (zero-padded index, `'01'`/`'02'`/…, matching the existing `pl_name ASC` order),
  `step_name` the player's name, `output_recs` the missing-count, and per-player `duration_ms`.
  Tracked in `tpip_pipelinelog` now, not `xlg_logging`.

### src/ui/admin/PipelineTable.tsx
- `PipelineJobsSummary`'s aggregate/sub-step lookups now also filter `pip_sub_sub === null`, so
  they correctly isolate the aggregate row now that per-player rows can share the same
  `(step, sub_step)` key. Added a `playersExpanded` local state and a ▶/▼ toggle button on the
  step-2 "Scrape Tracked Players" row (rendered only when player detail rows exist) — expanded, it
  lists every row with `pip_step = 2, pip_sub_step = 'a', pip_sub_sub` not null, sorted by
  `pip_sub_sub`, each showing that player's name, timestamp, run_ids-found count, and duration.

## Testing
- [ ] Run the SQL below manually via pgAdmin4 (on whichever database you're testing against)
  before opening the app:
    ```sql
    CREATE TABLE public.tpip_pipelinelog (
        pip_pipid        integer NOT NULL,
        pip_run_id       integer DEFAULT 0 NOT NULL,
        pip_step         smallint NOT NULL,
        pip_sub_step     character varying(1) NOT NULL,
        pip_step_name    character varying(64) DEFAULT ''::character varying NOT NULL,
        pip_input_table  character varying(64),
        pip_input_recs   integer DEFAULT 0 NOT NULL,
        pip_output_table character varying(64),
        pip_output_recs  integer DEFAULT 0 NOT NULL,
        pip_duration_ms  integer DEFAULT 0 NOT NULL,
        pip_created      timestamp DEFAULT now() NOT NULL
    );

    ALTER TABLE public.tpip_pipelinelog ALTER COLUMN pip_pipid ADD GENERATED BY DEFAULT AS IDENTITY (
        SEQUENCE NAME public.tpip_pipelinelog_pip_pipid_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1
    );

    ALTER TABLE ONLY public.tpip_pipelinelog
        ADD CONSTRAINT tpip_pipelinelog_pkey PRIMARY KEY (pip_pipid);
    ```
- [ ] Open `/owner` and confirm the Tools tab now shows "Pipeline", "Players", "Build Data Viewer"
      (no more separate Raw Data Scraping / Build Tables / Update Stats / Full Pipeline Run tiles)
- [ ] Open `/owner/pipeline` — confirm no horizontal scrollbar on the Pipeline Jobs table (page
      now uses full width, no `max-w-3xl`)
- [ ] Confirm the "Help" button next to the "Pipeline" heading opens the wide data-flow popover
      with all 5 steps and the row-count SQL snippet
- [ ] In the Pipeline Jobs summary, confirm the ↻ refresh button next to the run-id dropdown works,
      the dropdown lists past runs, and switching runs updates the table
- [ ] Confirm step 5 ("Update Stats") renders as a bold group row with 8 indented sub-steps
      (Player Stats A/B/C/All, Partner Stats A/B/C/All) once it's been run at least once
- [ ] Confirm `/owner/pipeline` loads quickly now (no more automatic live HTTP calls to
      nzbridge.co.nz on page mount)
- [ ] Confirm row 1 (Raw Data Scraping) shows `—` for Remaining/SQL/Refresh/Status, same as Update
      Stats' row — only Description, Help, Processed, Result, and Run remain, and clicking Run
      still works and updates Processed
- [ ] In the Run Pipeline table, for each of steps 2–4: click the row's Help button (input
      /processing/output/consumers), the SQL button (status-check query), the ↻ refresh button
      (updates Remaining/Status), and Run (updates Processed/Result)
- [ ] Click the header "Refresh" button and confirm steps 2–4's Remaining/Status update together
- [ ] Confirm Update Stats' Remaining/Status/SQL/Refresh cells show `—` (no incremental backlog
      concept for a full rebuild), but Processed still shows player/partner row counts after a run
- [ ] Click "Run All" (header button) and confirm all 5 steps run in sequence, Pipeline Jobs
      updates after each, and the 8 Update Stats sub-steps all get logged
- [ ] Expand "Advanced — manual stats controls" and confirm the existing per-group
      truncate/recalculate buttons (player + partner, A/B/C/all) still work as before — same SSE
      response shape, now backed by the shared `statsCompute.ts` helpers instead of inline SQL
- [ ] Open `/owner/builddata` and confirm the new `ts0` / `ts1` / `ts2` tabs load the staging
      table viewers correctly alongside the existing "Production" tab
- [ ] Trigger `/api/cron/update-sessions` (or wait for the scheduled run) and confirm it still
      returns the same summary shape and that it now also writes rows to `tpip_pipelinelog`
      (including the 8 Update Stats sub-steps)
- [ ] Confirm `tse_sessions`/`tre_results` counts are fully restored from production before testing
      anything else in this checklist
- [ ] Run Scrape once and confirm it completes normally (this can't be directly verified without a
      real session on nzbridge.co.nz that has no pair data, but confirm no errors and that
      `ts1_sessions` row counts look sane afterward)
- [ ] After deploying: confirm all 5 crons appear in Vercel's Cron Jobs dashboard with the right
      schedule/paths, and that only `/api/build/scrape` returns 401 when called without the
      `CRON_SECRET` bearer token (the other 4 should respond normally with no auth)
- [ ] Confirm the Owner UI's Run buttons (POST) still work exactly as before for all 5 steps —
      adding the GET handlers/auth check should be fully transparent to the existing UI
- [ ] After the next scheduled run: confirm each step's `tpip_pipelinelog` timestamps are now
      spread ~20 minutes apart (not all within a few seconds of one request), and that Update
      Stats' 8 sub-steps actually get logged this time (the thing that was likely never
      completing before)
- [ ] Confirm `/owner/builddata` no longer shows a "ts0" tab, and the remaining tabs
      (Production/ts1/ts2) still work
- [ ] Run Scrape once and confirm it still correctly writes `ts1_sessions`/`ts2_results` and
      creates new players as needed — behavior should be identical, just backed by
      `table_write`/`table_upsert`/`table_truncate` instead of raw SQL
- [ ] Confirm the Scrape row shows "From: {date}" matching `MAX(se_date)` in `tse_sessions`
- [ ] Set a "To:" date a few days after the From date, click Run, and confirm it only scrapes up
      to that date (fewer sessions than a full catch-up run) and completes quickly
- [ ] Leave "To:" blank and click Run — confirm it behaves exactly as before (scrapes to today)
- [ ] Open `/owner/pipeline` and confirm the table now shows 8 rows in the new order (Scrape AKBC,
      Build Sessions/Results ×2 with "AKBC batch"/"Tracked batch" labels, Scrape Tracked Players,
      Build Partners, Update Stats)
- [ ] Click "Run All" and confirm all 8 steps run in the right order, the AKBC-batch Build
      Sessions/Results calls actually get `from_date`/`to_date` query params (check the network
      tab or `tpip_pipelinelog`'s `pip_input_recs`/`pip_output_recs` look scoped, not the full
      backlog), and the Tracked-batch calls run unfiltered afterward
- [ ] Run "Scrape Tracked Players" a second time shortly after a completed run (without running
      Build Sessions in between) and confirm it does **not** re-fetch the same sessions from NZB —
      should complete much faster the second time, and `run_ids_new` in its Processed result
      should be near zero
- [ ] Confirm the Pipeline Jobs summary shows steps 1–5 as simple rows (with "Scrape Tracked
      Players" now appearing as step 4) and step 6 (Update Stats) still expands into its 8
      sub-steps
- [ ] After deploying: confirm all 8 cron entries appear in Vercel's dashboard with the right
      schedule, and that `/api/build/scrape`/`/api/build/scrape-tracked` behave correctly
      (only `/api/build/scrape` requires the `CRON_SECRET` bearer token)
- [ ] Open `/owner/pipeline` and confirm "To" now defaults to 1 week after "From" (not matching it
      exactly)
- [ ] Confirm "From" is now an editable date input (not read-only text), pre-filled with the
      automatic `MAX(se_date)` value
- [ ] Manually set "From" to an earlier date, click Run on Scrape AKBC, and confirm it scrapes from
      that earlier date instead of the automatic value
- [ ] After that run completes, confirm "From" still shows your manually-entered earlier date (not
      reset back to the automatic value) — this only holds within the same page session; a full
      browser refresh resets the field back to the automatic value, same as "To" already behaves
- [ ] Open `/owner/pipeline` and confirm the header now shows 3 stacked buttons — "Run All (AKBC)",
      "Run All (Tracked)", "Finish Pipeline" — instead of a single "Run All"
- [ ] Click "Run All (AKBC)" and confirm only Scrape AKBC, Build Sessions, and Build Results (AKBC
      batch) run — Tracked/Partners/Stats rows are untouched
- [ ] Click "Run All (Tracked)" and confirm only Scrape Tracked Players, Build Sessions, and Build
      Results (Tracked batch) run
- [ ] Click "Finish Pipeline" and confirm only Build Partners and Update Stats run (including all 8
      Update Stats sub-steps in `tpip_pipelinelog`)
- [ ] While one group button is running, confirm all other buttons (the other 2 group buttons, and
      every per-row Run button) are disabled until it finishes
- [ ] Confirm `vercel.json`'s 8 cron entries are unchanged — this step was UI-only
- [ ] Open `/owner/pipeline` and confirm 3 "Pipeline Jobs" summary panels (AKBC, Tracked Players,
      Finish) and 3 "Run Pipeline" panels (AKBC, Tracked Players, Finish) instead of one of each
- [ ] Confirm the AKBC panel shows rows 1a/1b/1c, the Tracked panel shows 2a/2b/2c, and the Finish
      panel shows step 3 (Build Partners) + step 4 (Update Stats with its 8 sub-rows)
- [ ] Click "Run All (AKBC)" in the AKBC panel and confirm the AKBC Jobs summary panel populates
      steps 1a/1b/1c after it completes
- [ ] Click "Run All (Tracked)" in the Tracked panel and confirm the Tracked Jobs summary panel
      populates steps 2a/2b/2c
- [ ] Click "Finish Pipeline" and confirm the Finish Jobs summary panel populates step 3 and step
      4's 8 sub-steps
- [ ] Confirm From/To date inputs only appear on the AKBC panel (not Tracked or Finish)
- [ ] Confirm each panel's own "Refresh" button still updates the shared Remaining/Status columns
      (Build Sessions/Results rows in both AKBC and Tracked panels reflect the same global counts)
- [ ] Note: existing `tpip_pipelinelog` history was logged under the old step numbers (5/6, etc.) —
      expect the new summary panels to show "—"/no data for a step until it's run at least once
      after this change; this is expected, not a bug
- [ ] Open `/owner/pipeline` and confirm a tab bar (AKBC / Tracked Players / Finish) replaces the 3
      permanently-stacked panel-pairs, defaulting to the AKBC tab
- [ ] Click each tab and confirm it shows that group's Jobs Summary + Run Pipeline table together
      (not the other groups' panels)
- [ ] Run a step on one tab, switch to another tab and back, and confirm the first tab's state
      (Processed/Result/Remaining) is preserved (not reset just from switching tabs)
- [ ] Click "Run All (AKBC)" and confirm all 3 sub-steps (1a Scrape, 1b Build Sessions, 1c Build
      Results) log to `tpip_pipelinelog` under the **same** `pip_run_id` (query the table directly
      or check the Jobs Summary — they should no longer show 3 different consecutive run_ids)
- [ ] Click "Run All (Tracked)" afterward and confirm its 3 sub-steps (2a/2b/2c) reuse that same
      run_id too (still the "everything since the last AKBC run" grouping)
- [ ] Run "Run All (AKBC)" a second time and confirm it allocates a genuinely new run_id (one
      higher than the previous run), and all 3 of its own sub-steps share that new number
- [ ] Run the SQL below manually via pgAdmin4 before testing the per-player rows:
    ```sql
    ALTER TABLE tpip_pipelinelog ADD COLUMN pip_sub_sub character varying(4);
    ```
- [ ] Run "Run All (Tracked)" and confirm the Tracked Jobs Summary panel's "Scrape Tracked Players"
      row now shows a ▶ toggle and "(N players)" label
- [ ] Click the ▶ toggle and confirm it expands to show one row per tracked player (name,
      timestamp, run_ids-found count, duration), sorted in the same order as the players list
- [ ] Confirm the aggregate "Scrape Tracked Players" row's own Last Run/Output Recs/Duration/Status
      still reflect the overall step (not one player's), unaffected by the new per-player rows
- [ ] Confirm `/owner/logging` no longer receives new `P`-severity rows from tracked-player
      scraping (that approach was replaced by this step)
