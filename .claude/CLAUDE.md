# next-bridge — Claude guidance

## Project overview

Next.js app that tracks NZ Bridge club results scraped from nzbridge.co.nz.

## Running locally

```
npm run locallocal   # port 3030, local DB
npm run localprod    # port 3032, prod DB (read-only testing)
npm run copy:prod    # copy local → prod via pg_dump/psql
npm run schema:compare locallocal localprod
```

Env files: `.env.locallocal` (local Postgres) and `.env.localprod` (Neon/prod).  
The selected env is copied to `.env` before `next dev` starts.

## Table naming conventions

- All tables: `txx_name`, all columns: `xx_columnname`
- Shared/cross-project tables use `x` prefix: `xlg_logging`, `xsc_schema`
- Staging tables (ts*) are the **source of truth** from scraping — data fixes go here, never directly on prod tables
- Production tables are built from staging; stats are computed from prod tables

## Staging tables (scrape layer)

| Table | Purpose | Feeds |
|---|---|---|
| `ts1_sessions` (cols: `s1_*`) | Discovered sessions not yet imported | `tse_sessions` |
| `ts2_results` (cols: `s2_*`) | Raw scraped pair results | `tre_results` |

## Production tables (build layer)

| Table | Purpose |
|---|---|
| `tpl_players` | Players |
| `tse_sessions` | One row per session; `se_run_id` is the NZB run_id |
| `tre_results` | One row per player per session; `re_score` holds the value regardless of scoring type — interpretation comes from the session's `tse_sessions.se_scoring` |
| `tpa_partners` | Partnership rows; `pa_paid` is FK from `tre_results.re_paid` |
| `ta1_player_stats` | Pre-computed player stats |
| `ta2_partner_stats` | Pre-computed partner stats |
| `tcl_clubs`, `tgr_grades`, `trk_ranks`, `tet_event_types` | Lookup tables |

## Pipeline

All pipeline steps run from the single `/owner/pipeline` page (`PipelineTable.tsx`), one row per
step, each with its own Run button plus a "Run All" that client-sequences every step. Every
completed step logs a row to `tpip_pipelinelog` (run_id, duration, input/output record counts).

```
1. Scrape        /api/build/scrape        → ts1_sessions, ts2_results (auto date range: last built session → today)
2. Build Sessions /api/build/sessions-nzb → tse_sessions (from ts1_sessions)
3. Build Results  /api/build/results-nzb  → tre_results, tpa_partners (from ts2_results)
4. Build Partners /api/build/partners      → tpa_partners row count (status only, no new writes)
5. Player Stats   /api/build/stats-player  → ta1_player_stats (all groups)
6. Partner Stats  /api/build/stats-partner → ta2_partner_stats (all groups)
   (/api/build/stats = combined rebuildAllStats(), manual/localprod full run only)
```

The underlying logic lives in `src/lib/actions/pipelineScrape.ts` (`scrapeNewSessions`),
`src/lib/actions/buildSteps.ts` (`buildSessionsFromStaging`, `buildResultsFromStaging`), and
`src/lib/actions/stats.ts` (`rebuildPlayerStats` / `rebuildPartnerStats`, wrapped by
`rebuildAllStats`) — shared between the manual per-step API routes and `/api/cron/update-sessions`
(the scheduled full-pipeline run), so both paths log identically.

The Update Stats step only recalculates from existing prod data — it does not re-import or re-build.

The older parameterized routes (`scrape/discover/nzb-by-date`, `scrape/discover/nzb-by-flagged`,
`scrape/raw/nzb-from-ts1sessions`, etc. — manual date-range/source selection) are no longer linked
from any page but still work if called directly; see "Scrape API routes" below.

## Key field notes

- `re_score`: single value column for any scoring type; clamped to 25–75 for MP, hard-capped at 999 for VP
- `re_paid`: NULL until "Build partner stats" runs; links `tre_results` → `tpa_partners`
- `se_run_id`: the NZB run_id stored on `tse_sessions` (was `se_source_id` before rename)

## nextjs-shared package

Installed from `github:richardstuart007/nextjs-shared`. Ships raw `.ts` files — tsx can transform it in Next.js but NOT in standalone scripts (inline the logic instead).

Key exports: `table_fetch`, `table_query`, `table_update`, `table_count`, `table_upsert`, `write_Logging`, `MyPagination`, `StringMultiSelect`.

**Always pass `table:` to `table_query`** — it's optional in the signature (defaults to `''`) but
must be set to the primary `FROM` table (for a multi-table JOIN, pick the main one) so the
`xlg_logging` "Table" column shows which table the raw query hit, the same as every other
`table_*` function. Every `table_query` call in this project carries it as of
`PLAN_table-query-log-table`.

## nextjs-shared route exports

The db-tools route handlers live in nextjs-shared and are re-exported here as thin wrappers:

```typescript
// src/app/api/admin/db-tools/schema-compare/route.ts
export { GET } from 'nextjs-shared/routes/schema-compare'

// src/app/api/admin/db-tools/copy/route.ts
export { POST } from 'nextjs-shared/routes/copy'
```

Other projects reuse them the same way. The route files in nextjs-shared are at:
- `src/backup/routes/schema-compare/route.ts`
- `src/backup/routes/copy/route.ts`

**After editing nextjs-shared source** (in node_modules for local testing): commit and push the nextjs-shared GitHub repo, then run `npm install` in consuming projects to pick up the changes.

## Owner routes

| Route | Purpose |
|---|---|
| `/owner` | Tools / Logging / Cache tabs |
| `/owner/pipeline` | Run pipeline steps individually or all at once (see Pipeline above) |
| `/owner/players` | Manage tracked players |
| `/owner/builddata` | Inspect staging (ts0/ts1/ts2) and production tables — tabbed |

### Build Data Viewer — design principle

`/owner/builddata` exists to investigate data errors directly against the raw tables — a faster
alternative to pgAdmin/SQL for the common case of "click through player → sessions → results →
stats to see what's actually stored." Two things follow from that purpose:

- **Each tab shows one table's raw, unmodified columns** — no joins that combine an independently-
  computed table (e.g. `ta1_player_stats`, `ta2_partner_stats`) into the same row as the table
  being inspected. If two tables are joined and one of them has its own faulty logic, that logic
  gets baked into every row of the combined view — making the exact kind of bug this page exists to
  catch harder to spot, not easier. `tpl`/`tpa` used to join in `ta1`/`ta2` stats directly and hit
  this: `ta2_partner_stats` has up to 4 rows per partnership (one per tournament group), so joining
  it onto `tpa_partners` forced picking one group to collapse the duplication back to one row per
  partnership — silently hardcoded to `'C'` with no record that a decision had even been made.
  Fixed by un-joining: `tpl`/`tpa` show only their own table's columns, with a click-to-expand
  panel (keyed by `pl_plid`/`pa_paid`) showing the related `ta1`/`ta2` rows separately instead.
- **1:1 lookups are fine, row-multiplying joins are not** — resolving `pa_plid1`/`pa_plid2` to
  player names via `tpl_players` (as `getAllPartners()`/`getResultsBySeid()`/`getResultsByPlid()`
  already do) doesn't multiply rows or combine two independently-computed datasets, so it doesn't
  have this problem. The distinction is whether the join could make one row represent more than
  one underlying fact.
- **Click-through over retyping IDs, filters over scrolling** — every tab's rows are clickable
  where a natural next table exists (player → results, session → results, partnership → stats),
  and every displayed column gets its own filter — both exist specifically so investigating an
  error is a few clicks instead of writing SQL by hand.

## Scrape API routes (unlinked from any page — manual/curl use only)

| Route | Purpose |
|---|---|
| `scrape/discover/nzb-by-date` | Finds missing run_ids → ts1_sessions (manual date range) |
| `scrape/discover/nzb-by-flagged` | Finds missing run_ids for tracked players (manual date range) |
| `scrape/raw/nzb-from-ts1sessions` | Fetches ts1_sessions → ts2_results |
| `scrape/raw/nzb-by-date` | Direct date-range scrape → ts2_results |
| `scrape/raw/nzb-by-runid` | Direct run_id scrape → ts2_results |
| `scrape/raw/nzb-by-flagged` | Flagged players → ts2_results |

## Cron

**Current model (v0.1.19+, `PLAN_prod-cron-pipeline-followups` Phases 7 + 13 — takes effect on the
next prod deploy).** `vercel.json` runs 12 daily crons that share **one `run_id` per day**.
`tpip_pipelinelog` columns (in order): `pip_run_id, pip_step, pip_batch, pip_sub_step, pip_sub_sub,
pip_step_name, …`. **`pip_batch`** (smallint, `DEFAULT 0 NOT NULL`) is the AKBC / Tracked batch and
is **always 1-indexed, ≥ 1** in new rows — steps 0/3/4/5 carry no URL batch param but still log
`pip_batch = 1` (`logPipelineStep` defaults an omitted `batch` to 1). `pip_batch = 0` only ever
appears on pre-Phase-13 backfilled rows; the DB `DEFAULT 0` is kept purely to mark those.
**`pip_sub_step`** (nullable) is set only where it names a real sub-step that matches
`pip_step_name` — the stats groups (`a`–`d` ↔ Group A/B/C/All); NULL for steps 0/1/2/3.
`pip_sub_sub` is the tracked per-player index. Key: `(pip_run_id, pip_step, pip_batch,
pip_sub_step, pip_sub_sub)`. Each row also gets a `cronStart` / `cronEnd` / `cronFail`
`xlg_logging` line (`P`/`E`) plus `phase7`-tagged `trace()` detail — grep `PHASE7-TRACE` to remove.

- `/api/build/start-run` (12:50 UTC) — the **only** job that creates a run_id and truncates
  staging: `startPipelineRun(undefined, true)` → `MAX(pip_run_id)+1`, truncate `ts1_sessions` +
  `ts2_results`, write the step-0 marker (`pip_step 0`, `pip_batch 1`, `pip_sub_step` NULL,
  `pip_to_date` = the run's cap).
- `/api/build/scrape-akbc-day?batch=1` (13:05), `?batch=2` (13:35) — each: `resolvePipRunId(1,
  false)` (reuse the day's run_id, no truncate) → `getNextScrapeDay()` (`MAX(se_date)+1`, or a
  logged no-op when that's in the future / past the `to_date` cap) → scrape that day in **one**
  club/date search fetch (no per-run_id fetch) → Build Sessions + Build Results for that day
  (`skipLog`) → one combined `pip_step 1` row, `pip_batch` = 1/2, `pip_sub_step` NULL,
  `pip_step_name` = `Scrape AKBC <day>`. Batch 2 re-reads the now-advanced `MAX(se_date)`, so a
  failed batch 1 is retried, not skipped. Recovers ≤ 2 days/day; deeper backlog → a separate
  fix-data pipeline (not built).
- `/api/build/scrape-tracked-batch?batch=1..6` (14:00–14:50, every 10 min) — each:
  `resolvePipRunId(2, false)` → scrape a `TRACKED_SCRAPE_BATCH_SIZE`-player slice (`LIMIT
  SIZE OFFSET (batch-1)*SIZE` on the `pl_name`-ordered tracked list) via `online-points.html`
  discovery + `?run_id=` fetch per session → Build Sessions + Build Results (`skipLog`) → one
  combined `pip_step 2` row, `pip_batch` = 1..6, `pip_sub_step` NULL, `pip_step_name` = `Tracked
  batch <N>`, plus a per-player child each (`pip_batch` same, `pip_sub_sub` `01`–`05`,
  `pip_step_name` = the player name).
- `/api/build/partners` (15:10) — `pip_step 3`, `pip_batch 1`, `pip_sub_step` NULL. Reuses
  `MAX(pip_run_id)`.
- `/api/build/stats-player` (15:20) — `rebuildPlayerStats()`: `pip_step 4` `pip_sub_step a`–`d`
  (Player Stats, group A/B/C/All), `pip_batch 1`. Reuses `MAX(pip_run_id)`.
- `/api/build/stats-partner` (15:25) — `rebuildPartnerStats()`: `pip_step 5` `pip_sub_step a`–`d`
  (Partner Stats, group A/B/C/All), `pip_batch 1`. Reuses `MAX(pip_run_id)`. Split from step 4 so
  a slow half can't starve the other's `maxDuration`.
- `/api/players/recalculate?mode=player_grp|partner_grp&grp=` re-runs one group → `pip_step 4`/`5`,
  `pip_sub_step` = that group's letter. `/api/build/stats` (`rebuildAllStats()`, both steps in one
  call) is kept for the manual / `npm run localprod` full-run path — not scheduled.

Every pipeline `crons` path in `vercel.json` carries **empty** `?to_date=` (all three scrape/
start routes) and `&fetch_timeout_ms=` (the two scrape routes) placeholders. In prod they fire
empty → routes parse with `|| undefined` → treated as absent, zero behaviour change. They exist
so the `/owner/pipeline` **Run All Cron** button can substitute UI test values without knowing
which route takes what (Phase 9).

`/owner/pipeline` **Run All Cron** (Phase 9, `PipelineTable.tsx` `handleRunFullCron`) iterates
`vercel.json`'s `crons` array in file order and POSTs each `path` one at a time — so a manual
"whole pipeline" run fires the exact routes Vercel schedules, no parallel implementation.
`fillCronParams()` fills the empty `to_date=` / `fetch_timeout_ms=` placeholders from the
Overview fields only when non-empty. A failing job is shown and the loop continues.

Shared: `persistSessionsFromPage()` in `pipelineScrape.ts` writes `ts1`+`ts2` for every session on
a parsed results page (used by both the AKBC day search and the tracked per-run_id page).

`PipelineTable.tsx`'s `JobsTable` renders a run's `tpip_pipelinelog` rows **data-driven** — one
bold line for `SINGLE_ROW_STEPS` (0, 3), a header + one row per `pip_sub_step` present for the
rest, with a `▶` toggle that expands a tracked batch's per-player `pip_sub_sub` children.

**Still exists for `CRON_SECRET` curl / `npm run localprod` catch-up (no longer wired to any
button):** `/api/cron/update-sessions` (whole pipeline in one request, `CRON_SECRET`-secured —
calls `startPipelineRun` itself), and the standalone `/api/build/scrape`, `sessions-nzb`,
`results-nzb`, `scrape-tracked`, `start-run`, `stats` (combined `rebuildAllStats()`) routes.
`scrapeClubSessions` / `scrapeTrackedPlayerSessions` (the multi-day / all-players functions) keep
their own truncate + `pip_sub_step 'a'`/`'b'`/`'c'` summary rows for that path.

## Outstanding items

- **`src/app/api/build/*` routes were never in git until 2026-08-30** — `~/.gitignore_global`'s
  bare `build/` rule matched `src/app/api/build/`, so `scrape`, `scrape-tracked`, `stats`, and the
  new `start-run` route files had never been committed. This is the likely reason the production
  `/api/build/*` cron jobs (in `vercel.json`) had been dead — Vercel deploys from git, so those
  routes returned 404 with no log trace. Fixed 2026-08-30 (commit `8d74f19` / v0.1.18) by adding
  `!src/app/api/build/` to the project `.gitignore` and committing all four. **Still to verify on
  the Vercel dashboard** that the scheduled `/api/build/*` crons now return 200 on their schedule
  (Phase 1 of `PLAN_prod-cron-pipeline-followups`).

- **Not yet done from `PLAN_prod-cron-pipeline-followups`:** Phase 4 — make prod `write_logging('E')`
  actually persist so cron failures aren't invisible (`xlg_logging` had no `'E'`/`'W'` rows since
  2026-07-25); has open decisions, never `#code`'d. Also deferred: `pipelineToDate` browser
  persistence via `localStorage`; an optional mid-scrape `tpip_pipelinelog` progress row.

- **Resolved 2026-08-30:** the 2026-07-31 prod schema migration (`re_score` / `ta1`-`ta2`
  restructure) is applied to prod; `pip_to_date` column added to prod `tpip_pipelinelog`; the
  ~4-week prod session backlog is backfilled (`tse_sessions` `MAX(se_date)` ≈ current, stats
  rebuilt, `pip_run_id` advancing). Note: the old `re_percentage` / `re_vp` columns on prod
  `tre_results` were left in place (unused by current code — harmless dead columns).


