# next-bridge — Claude guidance

## nextjs-shared reference
Read `node_modules/nextjs-shared/CONSUMING_PROJECTS.md` before implementing any feature from nextjs-shared. It contains all component APIs, database function signatures, coding conventions, and setup instructions.

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
| `tre_results` | One row per player per session; `re_percentage` NULL for VP, `re_vp` NULL for MP |
| `tpa_partners` | Partnership rows; `pa_paid` is FK from `tre_results.re_paid` |
| `ta1_player_stats` | Pre-computed player stats |
| `ta2_partner_stats` | Pre-computed partner stats |
| `tcl_clubs`, `tgr_grades`, `trk_ranks`, `tet_event_types` | Lookup tables |

## Pipeline

```
Scrape (admin/scrape)
  → ts1_sessions (discover)
  → ts2_results  (raw scrape via nzb-from-ts1sessions)

Build (admin/build)
  → tse_sessions  (from ts2_results DISTINCT ON s2_run_id, ordered by date)
  → tre_results   (from ts2_results JOIN tse_sessions)
  → tpa_partners  (from tre_results)

Stats (admin/stats)
  → ta1_player_stats, ta2_partner_stats, re_paid linkage
```

Stats page only recalculates from existing prod data — it does not re-import or re-build.

## Key field notes

- `re_percentage`: NULL for VP sessions (use `re_vp` instead); clamped to 25–75 for MP
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

## Admin routes

| Route | Purpose |
|---|---|
| `/admin/scrape` | Scrape NZB by date/run_id/flagged players |
| `/admin/build` | Build prod tables from staging |
| `/admin/builddata` | Inspect build output |
| `/admin/stats` | Recalculate stats |
| `/admin/db-tools` | Compare schemas, copy tables between local and prod |

## Scrape API routes

| Route | Purpose |
|---|---|
| `scrape/discover/nzb-by-date` | Finds missing run_ids → ts1_sessions |
| `scrape/raw/nzb-from-ts1sessions` | Fetches ts1_sessions → ts2_results (main flow) |
| `scrape/raw/nzb-by-date` | Direct date-range scrape → ts2_results |
| `scrape/raw/nzb-by-runid` | Direct run_id scrape → ts2_results |
| `scrape/raw/nzb-by-flagged` | Flagged players → ts2_results |

## Cron

`/api/cron/update-sessions` — full pipeline in one request: discover → scrape → build sessions → build results → build stats. Secured with `CRON_SECRET`.

## Schema file

`scripts/schema.sql` is the single source of truth for the database structure. Every new table and index must be added here.

## Silent file updates — never ask permission

**PLAN.md and CHANGES.md are always updated silently.**  
Never ask before checking off a step in `.claude/PLAN.md` or appending to `.claude/CHANGES.md`. These are mechanical parts of execution — no confirmation needed.
