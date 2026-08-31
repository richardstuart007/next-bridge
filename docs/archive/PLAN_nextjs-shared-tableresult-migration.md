# PLAN_nextjs-shared-tableresult-migration — next-bridge

## Title
Migrate next-bridge to the `nextjs-shared` `TableResult` API (unblocks `nextjs-shared` ≥ 2.1.80, incl. `MyBox collapsible`)

## Background

`#reinstall` moved `nextjs-shared` from **2.1.63** → **2.1.84** (needed for `MyBox collapsible`,
Phase 15 of `PLAN_prod-cron-pipeline-followups`). `nextjs-shared` commit `6908eb7` (v2.1.80,
2026-08-23) changed **every** `tableGeneric` function to return
`TableResult<T> = { ok: boolean; data: T; error: string | null }` and to **never throw** — a
failed call comes back `{ ok: false, data: <empty-ish>, error: '<message>' }`.

next-bridge is written against the old bare-return API (`const rows = await table_query(...)` then
`rows[0]`, `rows.length`, `rows.map(...)`, `... as T[]`; `table_count(...)` used directly as a
number). Result: `npx tsc --noEmit` = **102 errors across 27 files**, and every fire-and-forget
write/truncate silently lost its throw-on-failure.

New return types:

| Function | old | new |
|---|---|---|
| `table_query` / `table_fetch` / `table_write` / `table_upsert` / `table_update` / `table_delete` | `T[]` | `TableResult<any[]>` |
| `table_count` | `number` | `TableResult<number>` |
| `table_truncate` | `boolean` | `TableResult<boolean>` |
| `table_check` | `{ found, message }` | `TableResult<{ found, message }>` |

## Approach — mirror chess (already on 2.1.84)

Chess applies the same shape at **every** `table_*` call site — reads and writes alike:

```ts
const result = await table_query({ caller, table, query, params })
if (!result.ok) {
  write_logging({
    lg_functionname: '<function name>',
    lg_caller:       '<function name or caller tag>',
    lg_msg:          'Failed to <do X>: ' + result.error,
    lg_severity:     'E',
  })
  return <safe fallback>            // [] | null | 0 | {} | { inserted: 0 } … per the fn's contract
}
return result.data                 // or result.data[0] ?? null, result.data.map(...), Number(result.data[0].n), …
```

- **Reads** — `const result = …`; `if (!result.ok) { log 'E'; return fallback }`; then use
  `result.data`. Existing casts (`as SessionListRow[]`) move onto `result.data`.
- **Writes / upserts / updates / deletes / truncates** — same guard; `write_logging('E')` then
  `return` (or a `{ inserted: 0 }`-style fallback where the fn returns a shape). No silent
  swallow.
- **Thin passthrough helpers** that currently `return table_fetch({...})` (e.g. `lookup.ts`
  `getAllRanks`/`getAllClubs`/`getAllGrades`/`getAllEventTypes`) — keep their array-returning
  contract: `const result = await table_fetch({...}); if (!result.ok) { log; return [] } return
  result.data`. Callers (`LookupSelects.tsx`, `BuildDataViewer.tsx`, dropdown components) keep
  working with plain arrays — their `as T[]` casts stay, just on a real array now.
- **`write_logging`** is already the project's logger (`import { write_logging } from
  'nextjs-shared/write_logging'`), lowercase. Add the import to any migrated file that doesn't
  have it.
- This doubles as **Phase 4** of `PLAN_prod-cron-pipeline-followups` ("restore prod failure
  visibility") — DB failures now surface as `'E'` `xlg_logging` rows instead of silent throws.

**Not doing:** a project-local wrapper around `table_*` (explicitly forbidden by
`~/.claude/CLAUDE.md` — "never build a project-local wrapper that reimplements what a `table_`
function already does"). Every call site keeps calling the shared function directly.

## Plan

- [x] `src/lib/actions/lookup.ts` — 5 errors (`populateRanks`/`populateClubs`/`populateGrades`/
  `populateEventTypes` count reads, `mergeClubs` `.length`). Also guard the INSERT `table_query`s
  in those fns.
- [x] `src/lib/actions/sessions.ts` — 11 errors (`.data`/`[0]`/`.map`/iterator/`TableResult<number>`).
- [x] `src/lib/actions/players.ts` — 11 errors.
- [x] `src/lib/actions/pipelineScrape.ts` — 6 errors.
- [x] `src/lib/actions/pipelineStatus.ts` — 4 errors.
- [x] `src/lib/actions/pipelineLog.ts` — 4 errors (`resolvePipRunId`, `getPipelineRunStatus`, …).
- [x] `src/lib/actions/statsCompute.ts` — 4 errors.
- [x] `src/lib/actions/buildSteps.ts` — 3 errors.
- [x] `src/app/api/scrape/raw/nzb-from-ts1sessions/route.ts` — 7 errors.
- [x] `src/app/api/scrape/raw/nzb-by-flagged/route.ts` — 5 errors.
- [x] `src/app/api/scrape/raw/nzb-by-runid/route.ts` — 4 errors.
- [x] `src/app/api/scrape/raw/nzb-by-date/route.ts` — 4 errors.
- [x] `src/app/api/scrape/discover/nzb-by-flagged/route.ts` — 2 errors.
- [x] `src/app/api/scrape/discover/nzb-by-date/route.ts` — 1 error.
- [x] `src/app/api/scrape/discover/nzb-by-player/route.ts` — 1 error.
- [x] `src/app/api/scrape/staging/route.ts` — 2 errors.
- [x] `src/app/api/scrape/ts1/route.ts` — 1 error.
- [x] `src/app/api/scrape/ts2/route.ts` — 1 error.
- [x] `src/app/api/rankings/route.ts` — 4 errors.
- [x] `src/app/api/players/merge/route.ts` — 4 errors.
- [x] `src/app/api/admin/backfill-finals/route.ts` — 2 errors.
- [x] `src/app/api/admin/backfill-finals/test/route.ts` — 2 errors.
- [x] `src/app/api/admin/players/route.ts` — 1 error.
- [x] `src/app/api/build/cleanup/route.ts` — 1 error.
- [x] `src/ui/admin/BuildDataViewer.tsx` — 7 errors.
- [x] `src/ui/shared/LookupSelects.tsx` — 4 errors.
- [x] `src/ui/rankings/RankingsPageClient.tsx` — 1 error.
- [x] Sweep for fire-and-forget `table_write` / `table_upsert` / `table_update` / `table_truncate`
  calls with **no** tsc error (result unused) in the touched files + `src/lib/actions/*` — add the
  `if (!result.ok) write_logging('E')` guard so a failed write is no longer silent.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` clean (completes `#reinstall` steps 6–7).
- [x] Phase 15 of `PLAN_prod-cron-pipeline-followups` now compiles on 2.1.84 — check off its last
  two boxes and run its testing checklist.

## Changes

Every migrated `table_*` call site now follows the chess pattern: `const <name>Result = await
table_x(...)` → `if (!<name>Result.ok) { … }` → `const <name> = <name>Result.data`. The `if
(!ok)` branch either `write_logging('E', 'Failed to …: ' + …error)` + returns a safe fallback
(actions / UI-facing routes), or `throw new Error('<caller>: ' + …error)` (deep scrape helpers +
destructive routes whose outer `try/catch` already logs `'E'` and returns 500 — preserves the
pre-2.1.80 throw-on-DB-error behaviour exactly). `write_logging` import added where missing.

### Package
- `#reinstall` (user) — `nextjs-shared` `2.1.63` → **`2.1.84`** (commit `f4f1fafe`);
  `package-lock.json` regenerated. `@heroicons/react@2.2.0` already a direct dep, so `MyBox`'s
  chevron resolves.

### `src/lib/actions/`
- **`lookup.ts`** — `getAllRanks`/`getAllClubs`/`getAllGrades`/`getAllEventTypes` unwrap `.data`
  (fallback `[]`); `populateRanks`/`populateClubs`/`populateGrades`/`populateEventTypes` guard both
  their INSERT and COUNT `table_query`s (fallback `{ inserted: 0 }`); `mergeClubs` guards its
  UPDATE + DELETE (fallback `{ updated: 0 }`).
- **`sessions.ts`** — 11 functions: `getSessionsPaged` (both `fetchFiltered` + `fetchTotalPages`,
  now `TableResult`, fallback `{ rows: [], totalPages: 0 }`), `getRecentSessions`,
  `getSessionsByYear`, `getSessionById`, `sessionExistsByRunId`, `getSkippedRunIds`,
  `getImportedRunIds`, `getSessionByRunId`, `fixUnknownDays` (also guards the per-row
  `table_update`), `sessionCount`, `getSessionCatalogueForYear`.
- **`players.ts`** — `getPlayerById`/`ByNzb`/`ByName`, `searchPlayers`/`searchAllPlayers`,
  `getAllPlayers`, `getPlayersWithoutNzb`, `playerCount`, `getPlayerCounts` (two `table_count`),
  `getPlayerAllGroupStats`, `upsertPlayer` (all 3 branches guarded, returns the `TableResult`),
  `buildAllPartnerStats`, `getOrCreatePartnerRow`, `getPartnerStats`.
- **`pipelineScrape.ts`** — `getOrCreatePlayer` (lookup/create/reselect → `throw`),
  `batchCheckMissing` (→ `throw`), `getMaxSessionDate` (→ log + `null`),
  `scrapeTrackedPlayerSessions` flagged read (→ log + `throw`); `persistSessionsFromPage`'s
  `upsert-ts1` / `insert-ts2` / `delete-empty-ts1` writes guarded (log, continue);
  `scrapeClubSessions` truncate guarded (log).
- **`pipelineStatus.ts`** — `getStagingCounts`, `refreshSessionsStatus`, `refreshResultsStatus`,
  `refreshPartnersStatus` (fallback `{ remaining: 0 }` / zeroed counts).
- **`pipelineLog.ts`** — `resolvePipRunId` (both branches → `throw`, no safe run_id fallback),
  `logPipelineStep` `table_write` (log), `startPipelineRun` truncate (log), `getRecentRunIds`
  (→ `[]`), `getPipelineRunStatus` (→ `[]`). `write_logging` import added.
- **`statsCompute.ts`** — `computePlayerGroupStats` / `computePartnerGroupStats`: input COUNT +
  main upsert guarded (fallback `{ inserted: 0, inputRecs }`), rank + rank-reset UPDATEs guarded
  (log only). `write_logging` import added.
- **`buildSteps.ts`** — `buildSessionsFromStaging` (insert → `{0,0,0}`, count → `[]` + log),
  `buildResultsFromStaging` (partners upsert + results insert → `{ inserted: 0 }`).
- **`build-viewer.ts`** — all 5 (`getResultsBySeid`, `getAllResults`, `getAllPartners`,
  `getAllPlayerStats`, `getAllPartnerStats`) unwrap `.data`, fallback `[]`, `'E'` log.
  `write_logging` import added. Fixes the `BuildDataViewer.tsx` `as Row[]` errors at source.

### `src/app/api/`
- **`scrape/raw/nzb-from-ts1sessions`, `nzb-by-runid`, `nzb-by-flagged`, `nzb-by-date`** —
  `getRobotPlid` / `getOrCreatePlayer` helpers + the top-level `ts1Rows` / `flagged` / `existing`
  / `summaryRows` reads → `throw new Error('<caller>: ' + err)` (caught by each route's SSE
  `try/catch`).
- **`scrape/discover/nzb-by-date`, `nzb-by-flagged`, `nzb-by-player`** — the `flagged` +
  `existing` (`ANY($1)`) reads → `throw`.
- **`scrape/staging`, `scrape/ts1`, `scrape/ts2`** — GET/DELETE handlers: `.ok` check → `'E'` log
  + `500 { error }`.
- **`rankings/route.ts`** — the 6-way `Promise.all` destructure renamed to `*Result`; one
  combined `if (!…ok) throw`; `players` / `partnerships` / group-total / count all read off
  `.data` (the un-flagged `players`/`partnerships` too, so the response is a real array not a
  `TableResult`).
- **`players/merge/route.ts`** — every `table_query` in the merge (2 reads + 7 mutations) guarded
  with `throw` (destructive op; a half-merge must abort, and the route `try/catch` logs `'E'` +
  500).
- **`admin/backfill-finals/route.ts` + `/test/route.ts`** — `sessions` / `remaining` / `before` /
  `after` reads → `throw`.
- **`admin/players/route.ts`** — `Promise.all` → `*Result`, combined `if (!ok) throw`, `.data`.
- **`build/cleanup/route.ts`** — DELETE …RETURNING → `if (!ok) throw`, `.data`.

### Not migrated (deliberate scope limit)
- Fire-and-forget `table_query` writes inside the **curl-only** `scrape/raw/*` and
  `scrape/discover/*` routes (their `TRUNCATE`s, per-row `upsert-ts1`/`insert-ts2`, the ts1-header
  DELETEs) and `admin/backfill-finals`'s per-session `UPDATE` — unlinked from any page, each
  wrapped in a `try/catch` that returns an error response. A failed write there no longer throws,
  so it's logged only via the route's own success/failure summary line, not a per-write `'E'`.
  Left for a follow-up if those routes are ever re-linked.

## Testing
- [x] `npx tsc --noEmit` clean (0 errors, was 102).
- [x] `npm run build` clean.
- [ ] `npm run locallocal` → `/owner/pipeline` **Run All Cron** end-to-end — steps 0–5 log to
  `tpip_pipelinelog` as before (see `PLAN_prod-cron-pipeline-followups` Phase 13 testing), and
  `xlg_logging` gets **no** new `'E'` rows (i.e. no DB call is silently failing post-migration).
- [ ] Home page **Sessions** tab paginates (`getSessionsPaged` / `fetchFiltered` /
  `fetchTotalPages`), **Players** tab loads (`admin/players`), filters work.
- [ ] `/rankings` — players + partnerships tables populate, totals + group totals correct, tab
  switch + Top-N still work (`rankings/route.ts` `Promise.all` rewrite).
- [ ] `/owner/builddata` — all tabs load (players / sessions / results / partners / ta1 / ta2),
  click-through player→results, session→results, partnership→stats still expands
  (`build-viewer.ts`).
- [ ] `/owner/players` — grade/club/rank/event-type dropdowns populate (`lookup.ts` +
  `LookupSelects.tsx`), a **Merge** of two test players still works and logs an `'I'` line.
- [ ] Player + Session detail pages render their result lists.
- [ ] Update Stats (`/api/build/stats-player` + `-partner`) — `ta1`/`ta2` row counts match a
  pre-migration run; `/api/players/recalculate` for one group still works.
- [ ] Force a failure (e.g. rename a table in a scratch DB) and confirm the affected read logs a
  `'E'` row naming the function + error, and the page shows an empty state rather than a crash.
