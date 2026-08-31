# PLAN_table-query-log-table — next-bridge

## Title
Populate the `table:` arg on every `table_query` call so `xlg_logging` shows the table

## Background

`table_query` (nextjs-shared) accepts an optional `table?: string` (defaults to `''`) which it
forwards to `write_logging` as the `lg_table` column — the "Table" column on `/owner` → Logging.
Confirmed against `node_modules/nextjs-shared/src/tables/tableGeneric/table_query.ts`.

**Finding (xlg query, 2026-08-31):** every `table_query` call in next-bridge omits `table:` — 73
distinct callers, all with a blank `lg_table`, and **zero** `table_query` log rows that populate
it. Every other `table_*` function (`table_fetch` / `table_write` / `table_update` / `table_upsert`
/ `table_delete` / `table_count` / `table_check`) already passes it correctly — 0 blanks. So this
is scoped entirely to `table_query`.

**Count:** 126 `table_query({` call sites across 28 files.

**Convention:** for a single-table query the table is obvious. For a multi-table JOIN, use the
primary `FROM` table — matching the nextjs-shared `CONSUMING_PROJECTS.md` example which tags a
`tpos_positions JOIN tins_insights` query as `table: 'tpos_positions'`.

## Plan

- [x] Added `table: '<name>'` to all **126** `table_query({ … })` calls across 28 files, right
  after `caller:` (inline for single-line calls, its own line for multi-line). Tables per the
  `## Table mapping` below; multi-table JOINs use the primary `FROM` table.
- [x] `.claude/CLAUDE.md` — added a line under "nextjs-shared package": always pass `table:` to
  `table_query` (primary `FROM` table for a join) for `xlg_logging` visibility.
- [x] `npx tsc --noEmit` + `npm run build` clean.
- [ ] Spot-check on `npm run locallocal`: run the pipeline (or hit a page), then `/owner` →
  Logging — `table_query` rows now show a Table value; `SELECT DISTINCT lg_caller FROM
  xlg_logging WHERE lg_functionname='table_query' AND COALESCE(lg_table,'')='' AND lg_datetime >
  now() - interval '10 min'` returns nothing.

## Table mapping

### `src/lib/actions/`

| File | caller | table |
|---|---|---|
| `pipelineLog.ts` | `getPipelineRunStatus`, `getRecentRunIds`, `resolvePipRunId/current`, `resolvePipRunId/new` | `tpip_pipelinelog` |
| `pipelineScrape.ts` | `pipelineScrape/check`, `pipelineScrape/from-date` | `tse_sessions` |
| `pipelineScrape.ts` | `pipelineScrape/flagged`, `pipelineScrape/lookup`, `pipelineScrape/reselect` | `tpl_players` |
| `pipelineScrape.ts` | `pipelineScrape/create` (getOrCreatePlayer insert) | `tpl_players` |
| `pipelineScrape.ts` | `pipelineScrape/delete-empty-ts1` | `ts1_sessions` |
| `pipelineStatus.ts` | `pipelineStatus/sessions`, `pipelineStatus/staging` | `ts1_sessions` |
| `pipelineStatus.ts` | `pipelineStatus/results` | `tse_sessions` |
| `pipelineStatus.ts` | `pipelineStatus/partners` | `ts2_results` |
| `buildSteps.ts` | `buildSteps/sessions/count` | `ts1_sessions` |
| `buildSteps.ts` | `buildSteps/sessions/insert` | `tse_sessions` |
| `buildSteps.ts` | `buildSteps/results/insert` | `tre_results` |
| `buildSteps.ts` | `buildSteps/results/upsert-partners` | `tpa_partners` |
| `statsCompute.ts` | `player-{A,B,C,all}`, `player-*-rank`, `player-*-rank-reset` | `ta1_player_stats` |
| `statsCompute.ts` | `partner-{A,B,C,all}`, `partner-*-rank`, `partner-*-rank-reset` | `ta2_partner_stats` |
| `statsCompute.ts` | `player-*-input`, `partner-*-input` (the `SELECT COUNT(*) … FROM tre_results JOIN tse_sessions` cache-key counts) | `tre_results` ⚖ |
| `players.ts` | `getPlayerByName` | `tpl_players` |
| `players.ts` | `buildAllPartnerStats/count` | `tpa_partners` |
| `players.ts` | `getPlayerAllGroupStats` | `ta1_player_stats` |
| `players.ts` | `getPartnerStats` | `ta2_partner_stats` |
| `sessions.ts` | `getSessionCatalogueForYear`, `getSessionsByYear`, `getSkippedRunIds` | `tse_sessions` |
| `lookup.ts` | `populateClubs`, `populateClubs/count`, `mergeClubs/delete` | `tcl_clubs` |
| `lookup.ts` | `mergeClubs` (UPDATE `tpl_players`) | `tpl_players` |
| `lookup.ts` | `populateGrades`, `populateGrades/count` | `tgr_grades` |
| `lookup.ts` | `populateRanks`, `populateRanks/count` | `trk_ranks` |
| `lookup.ts` | `populateEventTypes`, `populateEventTypes/count` | `tet_event_types` |
| `build-viewer.ts` | `allPartners` | `tpa_partners` |
| `build-viewer.ts` | `allPlayerStats`, `playerStatsByPlid` | `ta1_player_stats` |
| `build-viewer.ts` | `allPartnerStats` | `ta2_partner_stats` |
| `build-viewer.ts` | `allResults`, `resultsBySeid`, `resultsByPlid` | `tre_results` ⚖ (join to `tpl_players` for names — primary is `tre_results`) |

### `src/app/api/`

| File | caller(s) | table |
|---|---|---|
| `admin/backfill-finals/route.ts` + `…/test/route.ts` | all (`mark`, `mark-failed`, `remaining`, `sessions`; `test/before`, `test/after`, `test/mark`, `test/reset`) | `tse_sessions` |
| `admin/players/route.ts` | `admin/players`, `admin/players/count` | `tpl_players` ⚖ (joins `ta1_player_stats`) |
| `admin/players/[id]/all-results/route.ts` | `admin/players/all-results` | `tre_results` ⚖ |
| `build/cleanup/route.ts` | `build/cleanup` | `tre_results` |
| `players/[id]/results/route.ts` | `players/[id]/results` | `tre_results` ⚖ (joins `tse_sessions` / `tpa_partners`) |
| `players/merge/route.ts` | `players/merge`, `merge/transfer-nzb`, `merge/delete-player` | `tpl_players` |
| `players/merge/route.ts` | `merge/get-partnerships`, `merge/get-new-paid`, `merge/upsert-partnership`, `merge/delete-partnerships` | `tpa_partners` |
| `players/merge/route.ts` | `merge/remap-results`, `merge/delete-self-results` | `tre_results` |
| `rankings/route.ts` | `rankings players`, `rankings players/count` | `tpl_players` ⚖ |
| `rankings/route.ts` | `rankings players/groupTotal` | `ta1_player_stats` |
| `rankings/route.ts` | `rankings partnerships`, `rankings partnerships/count` | `tpa_partners` ⚖ |
| `rankings/route.ts` | `rankings partnerships/groupTotal` | `ta2_partner_stats` |
| `sessions/[id]/results/route.ts` | `sessions/[id]/results` | `tre_results` ⚖ |
| `scrape/discover/nzb-by-date/route.ts` | `check` → `tse_sessions`; `insert` → `ts1_sessions`; `truncate-ts1` → `ts1_sessions`; `truncate-ts2` → `ts2_results` | |
| `scrape/discover/nzb-by-flagged/route.ts` | `check` → `tse_sessions`; `flagged` → `tpl_players`; `upsert-ts1` → `ts1_sessions`; `truncate-ts1` → `ts1_sessions`; `truncate-ts2` → `ts2_results` | |
| `scrape/discover/nzb-by-player/route.ts` | `check` | `tse_sessions` |
| `scrape/raw/nzb-by-date/route.ts` | `check` → `tse_sessions`; `create`/`lookup`/`reselect` → `tpl_players`; `insert` → `ts2_results`; `upsert-ts1` → `ts1_sessions`; `truncate` → `ts1_sessions` | |
| `scrape/raw/nzb-by-flagged/route.ts` | `check` → `tse_sessions`; `flagged`/`create`/`lookup`/`reselect` → `tpl_players`; `insert` → `ts2_results`; `upsert-ts1` → `ts1_sessions`; `truncate-ts1` → `ts1_sessions`; `truncate-ts2` → `ts2_results` | |
| `scrape/raw/nzb-by-runid/route.ts` | `create`/`lookup`/`reselect` → `tpl_players`; `insert` → `ts2_results`; `summary-lookup`/`upsert-ts1` → `ts1_sessions`; `truncate` → `ts1_sessions` | |
| `scrape/raw/nzb-from-ts1sessions/route.ts` | `read`/`update-ts1` → `ts1_sessions`; `create`/`lookup`/`reselect`/`robot-*` → `tpl_players`; `insert` → `ts2_results` | |
| `scrape/staging/route.ts` | `count-ts1` → `ts1_sessions`; `count-ts2` → `ts2_results`; `truncate-ts1` → `ts1_sessions`; `truncate-ts2` → `ts2_results` | |
| `scrape/ts1/route.ts` | `scrape/ts1/list` | `ts1_sessions` |
| `scrape/ts2/route.ts` | `scrape/ts2/list` → `ts2_results`; `scrape/ts2/truncate` → `ts2_results` | |

⚖ = multi-table JOIN; table shown is the primary `FROM`. Confirm each against the actual query
when editing.

## Changes

### `table:` added to every `table_query` call (126 sites, 28 files)

`table: '<primary FROM table>'` inserted immediately after `caller:` in every `table_query({…})`
call. No other argument changed.

- `src/lib/actions/` — `pipelineLog.ts` (→ `tpip_pipelinelog`), `pipelineScrape.ts`
  (`tpl_players` / `tse_sessions` / `ts1_sessions` per call), `pipelineStatus.ts`
  (`ts1_sessions` / `tse_sessions` / `ts2_results`), `buildSteps.ts` (`tse_sessions` /
  `ts1_sessions` / `tre_results` / `tpa_partners`), `statsCompute.ts` (`ta1_player_stats` /
  `ta2_partner_stats` / `tre_results` for the `-input` counts), `players.ts`, `sessions.ts`
  (→ `tse_sessions`), `lookup.ts` (`tcl_clubs` / `tgr_grades` / `trk_ranks` / `tet_event_types` /
  `tpl_players`), `build-viewer.ts`.
- `src/app/api/` — `admin/backfill-finals` (+`/test`) → `tse_sessions`; `admin/players*` →
  `tpl_players` (⚖); `admin/players/[id]/all-results` → `tre_results` (⚖); `build/cleanup` →
  `tre_results`; `players/[id]/results` → `tre_results` (⚖); `players/merge` (`tpl_players` /
  `tpa_partners` / `tre_results` per statement); `rankings` (`tpl_players` / `tpa_partners` /
  `ta1_player_stats` / `ta2_partner_stats`); `sessions/[id]/results` → `tre_results` (⚖);
  `scrape/discover/*`, `scrape/raw/*`, `scrape/staging`, `scrape/ts1`, `scrape/ts2` (`tse_sessions`
  / `tpl_players` / `ts1_sessions` / `ts2_results` per call — `check`, `flagged`/`lookup`/
  `create`/`reselect`, `upsert-ts1`/`read`/`list`/`count-ts1`/`update-ts1`/`summary-lookup`,
  `insert`/`count-ts2`, `truncate-ts1`/`truncate-ts2`/`truncate`).
- Applied by script; two passes (a first for multi-line blocks, a second fixing 6 files that use
  single-line `table_query({ caller:…, query:… })` form). `tsc --noEmit` + `npm run build` clean.
- Verified: 0 of 126 `table_query` calls now lack `table:`.

### `.claude/CLAUDE.md`
- New paragraph under "nextjs-shared package": always pass `table:` to `table_query`.

## Testing
- [x] `npx tsc --noEmit` + `npm run build` clean.
- [ ] `npm run locallocal`, exercise the app (run the pipeline / open `/owner/builddata`,
  `/player/[id]`, `/session/[id]`, Rankings), then `/owner` → Logging: `table_query` rows show a
  populated **Table** column.
- [ ] `SELECT lg_caller, COUNT(*) FROM xlg_logging WHERE lg_functionname='table_query' AND
  COALESCE(lg_table,'')='' AND lg_datetime > now() - interval '30 min' GROUP BY lg_caller;` —
  returns **nothing**.
- [ ] Spot-check a join row: `pipelineStatus/partners` logs `Table = ts2_results`,
  `rankings players` logs `tpl_players`, `players/[id]/results` logs `tre_results`.
