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
4. Build Partners /api/build/partners     → tpa_partners row count (status only, no new writes)
5. Update Stats   /api/build/stats        → ta1_player_stats, ta2_partner_stats (all groups)
```

The underlying logic lives in `src/lib/actions/pipelineScrape.ts` (`scrapeNewSessions`),
`src/lib/actions/buildSteps.ts` (`buildSessionsFromStaging`, `buildResultsFromStaging`), and
`src/lib/actions/stats.ts` (`rebuildAllStats`) — shared between the manual per-step API routes and
`/api/cron/update-sessions` (the scheduled full-pipeline run), so both paths log identically.

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

`/api/cron/update-sessions` — full pipeline in one request: discover → scrape → build sessions → build results → build stats. Secured with `CRON_SECRET`.

## Outstanding items

- **Production DB migration pending (2026-07-31)** — the `re_score` column consolidation and the
  `ta1_player_stats`/`ta2_partner_stats` scoring-type restructure (XIMP support) have been applied
  to **local** only. Production still has the old schema (`re_percentage`/`re_vp` columns on
  `tre_results`; `a1_mp_*`/`a1_vp_*`/`a2_mp_*`/`a2_vp_*` columns on `ta1_player_stats`/
  `ta2_partner_stats`). The code deployed by this commit expects the new schema, so before/when
  deploying to production, run the same manual SQL sequence against production that was already
  run on local: add + backfill `re_score`, drop `re_percentage`/`re_vp`, and the
  backup/drop/recreate for `ta1_player_stats`/`ta2_partner_stats` followed by re-running "Update
  Stats" on `/owner/pipeline` (prod). The exact SQL lived in the now-deleted
  `docs/PLAN_data-investigation-bill-leach.md` — see this commit's git history for the full text
  if it's needed again.


