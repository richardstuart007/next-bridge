# PLAN_prod-cron-pipeline-not-running — next-bridge

## Title
Production cron pipeline not running — scrape/stats steps dying silently on Vercel; add a To-date bound to the "Run All Cron" catch-up; plus the /owner/pipeline date-format fix

## Background (from prod DB investigation, 2026-08-30)

Read-only SQL against **prod** (Neon) `tpip_pipelinelog` / `xlg_logging`:

- `pip_run_id` frozen at **16** since **2026-07-27 14:08** (266 rows under run 16). It only
  advances when "Scrape AKBC" completes (`resolvePipRunId` is the only `forceNewRun` caller), so a
  frozen run_id means that step has not finished since.
- Last successful prod run per step:
  | Step | Route | Last success on prod |
  |---|---|---|
  | 1a Scrape AKBC | `/api/build/scrape` | 2026-07-27 14:08 |
  | 2a Scrape Tracked Players | `/api/build/scrape-tracked` | 2026-07-28 11:11 |
  | 1b/1c/2b/2c Build Sessions/Results | `/api/build/*-nzb` | runs daily, **0 output every day** |
  | 3a Build Partners | `/api/build/partners` | runs daily (status only) |
  | 4 Update Stats (a–h) | `/api/build/stats` | 2026-08-05 23:03 (looks manual/local, not the 16:20 cron) |
- `xlg_logging` frozen at **2026-07-25 22:25** (556 rows). Table structure is fine (identical to
  local). Prod `.env` has `NEXT_PUBLIC_APPENV_LOG_I=false`, so all `'I'` logs are suppressed by
  design — but there are also **no `'E'`/`'W'` rows**, i.e. the failing steps abort without logging.
- `tse_sessions` max `se_date` = **2026-08-04**; `ts1_not_in_tse` = 0 — nothing new scraped since
  late July, so the daily build steps have nothing to build.

**Interpretation:** the 8 split Vercel crons are firing (the 5 fast DB-only steps log daily). The
3 dead ones are exactly the slow / outbound-HTTP ones — `scrape`, `scrape-tracked` (loop ~27
tracked players + club run_ids, each an external fetch to nzbridge.co.nz) and `stats`
(`rebuildAllStats` aggregates ~280k `tre_results` rows × 4 groups × 2). No `maxDuration` is set on
any route, so they get Vercel's default (~10–15 s); `FETCH_TIMEOUT_MS` alone is 15 s. The function
is killed mid-run with no `catch` → no pipeline row, no error log. `scrape-tracked` and `stats` do
no auth check, so this is not a `CRON_SECRET`/401 problem — the handlers themselves abort.

**Catch-up / overflow constraint:** there is now a ~4-week backlog (no sessions since 2026-08-04).
A single unbounded catch-up run will overflow any function limit (dozens of day-fetches + hundreds
of run_id fetches + sequential per-pair `getOrCreatePlayer` + `table_write`).

- **The backlog is cleared from local** (`npm run localprod`, no Vercel time limit), using the
  `/owner/pipeline` panel's **To-date** + **time-budget** inputs to walk `[MAX(se_date) .. today]`
  forward in as many passes as needed.
- **The deployed Vercel crons never carry a `to_date`.** In production `from_date` is always
  automatic (`MAX(se_date)`) and there is no cap — the window self-heals as `MAX(se_date)`
  advances daily, and the only overflow protection is the soft time budget
  (`SCRAPE_TIME_BUDGET_MS`, loops stop + commit + resume next run) backstopped by
  `maxDuration = 300`.
- The `to_date` query param on the routes exists purely for that local catch-up (and ad-hoc
  manual use); it is never pinned in `vercel.json`.

**How `from_date` / `to_date` currently resolve** (`getDateRange` in `pipelineScrape.ts`):
`from_date = override ?? MAX(se_date) ?? (today − SCRAPE_FALLBACK_LOOKBACK_DAYS)`;
`to_date = override ?? today`. So `scrapeClubSessions` already honours a to-date on its own. The
AKBC build steps get `clubResult.from_date/to_date` threaded through, so bounding the scrape
already bounds the AKBC build. The gaps are: (a) the **build steps only filter when BOTH
`from_date` and `to_date` are given** — a `to_date`-only cap needs `s1_date <= to_date` /
`se_date <= to_date` support; (b) `scrape-tracked` has no date param and `buildSessionsFromStaging`
has **no group filter in its SQL**, so tracked history dumped into staging would be built
regardless — the tracked build calls must also be `to_date`-capped so beyond-bound tracked rows
are **scraped into staging but not processed** until the cap is lifted.

**Initial backfill will be done from local:** `npm run localprod` runs against the prod DB with no
Vercel time limit, so the 4-week gap can be cleared in one sitting there. After that, the daily
crons only ever process a tiny slice.

## Plan

### Phase 0 — /owner/pipeline "Last Run" date format (DONE — merged from PLAN_pipeline-date-format)

Format agreed with user: `YYYY/MM/DD HH:MM:SS` (24-hour, local time). Local implementation, not
`nextjs-shared` (one-off display format for this page; a shared date formatter is a possible
future consolidation, out of scope).

- [x] Add a `formatPipDate(value: string)` helper to `src/ui/admin/PipelineTable.tsx` (alongside
      the existing `n` / `formatDuration` / `addDays` helpers) rendering a `pip_created` timestamp
      as `YYYY/MM/DD HH:MM:SS`, 24-hour, local time — matching the file's helper comment style.
- [x] Replace the three `new Date(...pip_created).toLocaleString()` call sites (step row,
      sub-step row, per-player expand row) with `formatPipDate(...pip_created)`.
- [x] Leave the numeric `toLocaleString()` calls (record counts, `n()`, duration) unchanged.
- [x] `npx tsc --noEmit` clean.

### Phase 1 — Confirm root cause on Vercel (user, before any code change)

- [ ] User checks Vercel → project → **Cron Jobs** tab: last execution time + HTTP status for
      `/api/build/scrape`, `/api/build/scrape-tracked`, `/api/build/stats` (expect 504 timeout or 500).
- [ ] User checks Vercel → **Logs**, filtered to those three routes: look for
      `FUNCTION_INVOCATION_TIMEOUT` or a fetch error against nzbridge.co.nz.
- [ ] User confirms deployed env vars: `CRON_SECRET` is set (affects `/api/build/scrape` only),
      and note whether `NEXT_PUBLIC_APPENV_ISDEV` is `true` or unset on prod.
- [ ] Report findings back here; update this section with what Vercel actually shows before Phase 2.

### Phase 2 — Local To-date catch-up + survive-the-timeout in prod (code)  ← executing

Replaces the earlier queue/drain idea. The **To-date** cap is a *local-only* catch-up aid (panel
input / query param — never on the deployed cron). In production the **soft time budget** makes an
overflowing window resumable and `maxDuration` is the hard backstop.

**Agreed constants (`src/lib/constants.ts`):**
| Constant | Value | Overrideable at runtime? |
|---|---|---|
| `SCRAPE_MAX_DURATION_SECONDS` | `300` | No — deploy-time only. **Next.js route segment config must be a literal**, so each route writes `export const maxDuration = 300` directly; the constant is the canonical value + "keep in sync" doc. |
| `SCRAPE_TIME_BUDGET_MS` | `240_000` | Yes — `?time_budget_ms=` + panel input; scrape loops stop early (between run_ids / days) and commit, so the next run resumes |
| `FETCH_TIMEOUT_MS` | `15_000` (unchanged) | Yes — `?fetch_timeout_ms=` + panel input; the pipeline scrape's raw `fetch()` calls (previously untimed) get an `AbortController` timeout |

- [x] **Constants** — add `SCRAPE_MAX_DURATION_SECONDS = 300`, `SCRAPE_TIME_BUDGET_MS = 240_000`.
- [x] **Build steps accept a `to_date`-only cap.** `buildSessionsFromStaging` /
      `buildResultsFromStaging` (`src/lib/actions/buildSteps.ts`) — new `dateRangeFilter(column,
      from, to)` helper: both → `BETWEEN`, from only → `>=`, to only → `<=`, neither → no filter.
- [x] **`pipelineScrape.ts`** — local `fetchWithTimeout` helper (mirrors `src/lib/scrape/
      fetchHtml.ts`), replacing the three raw `fetch()` calls; `scrapeClubSessions` /
      `scrapeTrackedPlayerSessions` / `scrapeRunIds` take `timeBudgetMs` + `fetchTimeoutMs`,
      compute a `deadline`, and `break` the day / player / run_id loops once past it (checked
      between iterations, never mid-`scrapeRunId`, so a run_id is always fully done or not started).
- [x] **`/api/build/scrape` + `/api/build/scrape-tracked`** — `export const maxDuration = 300`
      (literal; see constant note above); read `time_budget_ms` / `fetch_timeout_ms` from the
      query and pass them down.
- [x] **`/api/build/stats`** — `export const maxDuration = 300` (literal).
- [x] **`/api/cron/update-sessions`** — `export const maxDuration = 300` (literal);
      read `to_date` / `time_budget_ms` / `fetch_timeout_ms`; thread `to_date` into
      `scrapeClubSessions(undefined, toDate, …)` and the tracked build calls
      `buildSessionsFromStaging(false, undefined, toDate, 'tracked')` /
      `buildResultsFromStaging(false, undefined, toDate, 'tracked')`; thread the budgets into both
      scrape calls. `scrape-tracked` stays unbounded by date (full history into staging; not
      *processed* past `to_date`). `stats` stays a full recompute.
- [x] **Shared page-level To-date (all tabs).** `PipelineTable.tsx` gets one `pipelineToDate`
      state rendered **once, above the tab bar** (present on every tab). It replaces the
      Overview-only `cronToDate` **and** the AKBC tab's old "To:" input (`scrapeToDate` removed;
      AKBC "From:" `scrapeFromDate` stays). Threaded as `?to_date=` into every tab's actions:
      Overview "Run All Cron", AKBC scrape + build, tracked scrape + `sessions-nzb`/`results-nzb
      ?group=tracked`. `addDays` helper + `SCRAPE_DEFAULT_TO_DATE_WINDOW_DAYS` import removed
      (only fed the deleted To-seeding).
- [x] **Tracked scrape honours the To-date (Option A).** `scrapeRunId` / `scrapeRunIds` take
      `toDate`; after parsing `headerRow.date`, a run_id whose session is past `toDate` is skipped
      with **no write** (the page is still fetched — the online-points discovery yields run_ids
      with no date). `scrapeTrackedPlayerSessions` gains a `toDateOverride` first param;
      `scrapeClubSessions` passes its `toDateOverride` through too (harmless safeguard — its
      discovery is already date-bounded). `/api/build/scrape-tracked` reads `to_date`;
      `update-sessions` passes `toDate` to `scrapeTrackedPlayerSessions`.
- [x] **Panel inputs seeded from the constants** — `cronTimeBudgetSec` = `SCRAPE_TIME_BUDGET_MS /
      1000` (`240`), `cronFetchTimeoutSec` = `FETCH_TIMEOUT_MS / 1000` (`15`); clearing a field
      falls back to the constant. `pipelineToDate` stays empty (opt-in).
- [x] `/owner/constants` (`ConstantsPage.tsx`) updated — new `SCRAPE_MAX_DURATION_SECONDS` /
      `SCRAPE_TIME_BUDGET_MS` entries, `FETCH_TIMEOUT_MS` consumers/description refreshed,
      `SCRAPE_DEFAULT_TO_DATE_WINDOW_DAYS` marked unused, matching `FUNCTION_DESCRIPTIONS` entries.
- [x] No hardcoded catch-up date in code — the `to_date` cap is always a runtime input; the
      deployed `vercel.json` crons never carry one.

#### Testing observations (local, 2026-08-30) — to action

- [x] **"Run All Cron" gives no live feedback.** The button just showed "Running…" for the whole
      multi-minute `/api/cron/update-sessions` request; the Overview Jobs summary only refreshed
      once, after it returned.
      **Done (part 1):** `PipelineTable` gains a `useEffect` on `running` — while
      `running === 'full-cron'` a `setInterval(PIPELINE_RUN_POLL_MS = 2500)` bumps `refreshKey`,
      so `OverviewSummary` auto-selects the new run_id once Start Run (step 0) has logged and
      reloads step rows 1→2→3→4 as they complete. Interval cleared when `running` clears / on
      unmount; the final refresh is still `run()`'s `finally`. Scope: `full-cron` only. New
      constant `PIPELINE_RUN_POLL_MS` in `constants.ts` + `/owner/constants`.
- [x] **Coarse steps still log only at their end** (observed run 18, local): `scrapeClubSessions`
      / `buildSessionsFromStaging` / `buildResultsFromStaging` / `buildAllPartnerStats` each call
      `logPipelineStep` once, when the function finishes — so during a ~3-week-backlog AKBC scrape
      the Jobs summary sits on "step 0 only" for minutes even though `ts2_results` is filling.
      **Done:** while `running === 'full-cron'` the Overview shows a "Run in progress" strip —
      `formatElapsed(now − fullCronStartedAt)` + live `ts1_sessions` / `ts2_results` counts, both
      refreshed on the existing `PIPELINE_RUN_POLL_MS` timer (new `getStagingCounts()` server
      action in `pipelineStatus.ts`). Not done: the optional intermediate `tpip_pipelinelog`
      progress row every N run_ids — deferred, N not agreed.
- [ ] **`pipelineToDate` isn't persisted in the browser** — still plain React state, lost on
      reload. (`localStorage` suggestion stands; not built — separate from the DB-record below.)
- [x] **Record the run's To-date cap on `tpip_pipelinelog`.** New nullable `pip_to_date date`
      column, written **only on the step-0 "Start Run" row** (NULL on every other step, and NULL
      for any run with no cap — which is always the case for the deployed Vercel crons).
      `logPipelineStep` gains a `to_date?` arg; `startPipelineRun(toDate?)` passes it;
      `/api/build/start-run` reads `?to_date=` (and `handleStartRun()` sends `pipelineToDate`);
      `/api/cron/update-sessions` passes its `toDate`. `PipelineStatus` type +
      `getPipelineRunStatus` (`SELECT *`) carry it. Shown as a **"To date"** column in the
      `/owner/pipeline` Jobs summary table (populated on the Start Run row, `—` elsewhere).
      **Manual SQL** (below) must be run on local now, and on prod before/at deploy.

### Phase 3 — Dedicated "start run" cron (code)  ← executing

Agreed with user: a new, first-in-the-day cron whose *only* job is to create the run — so run_id
allocation never depends on a heavy job (Scrape AKBC) completing.

Agreed decisions:
- Route: **`/api/build/start-run`** (`src/app/api/build/start-run/route.ts`), matching the
  `/api/build/*` family; no auth check (matches `stats` / `scrape-tracked` siblings).
- Marker row: **`pip_step = 0`, `pip_sub_step = 'a'`, `pip_step_name = 'Start Run'`** — sorts
  first on `/owner/pipeline` (orders by `pip_step`). No schema change (0 is a valid smallint;
  the row is just data).
- UI: **row + Run button**. Step 0 shows in the Overview Jobs summary; a "Start Run" button is
  added on the Overview tab; the Overview "Run All Cron" and the AKBC-tab "Run All" call
  start-run first.
- Cron schedule: **`50 13 * * *`** (10 min before the `0 14` scrape).

- [x] `startPipelineRun()` in `src/lib/actions/pipelineLog.ts` — `resolvePipRunId(0, true)` (bumps
      `MAX(pip_run_id)+1`) + `logPipelineStep({ step: 0, sub_step: 'a', step_name: 'Start Run' })`,
      returns `{ run_id }`.
- [x] New route `src/app/api/build/start-run/route.ts` (GET/POST → `startPipelineRun()`), modelled
      on `stats/route.ts`.
- [x] `vercel.json` — add `{ "path": "/api/build/start-run", "schedule": "50 13 * * *" }` as the
      first cron entry.
- [x] `scrapeClubSessions` (`src/lib/actions/pipelineScrape.ts`) — `resolvePipRunId(1, true)` →
      `resolvePipRunId(1, false)`; the AKBC scrape no longer creates the run.
- [x] `/api/cron/update-sessions` `run()` — call `startPipelineRun()` first, so the Overview
      "Run All Cron" full run gets a fresh run_id.
- [x] `src/ui/admin/PipelineTable.tsx` — `STEP_LABELS[0]='Start Run'`, `STEP_SUBSTEPS[0]=null`,
      `OverviewSummary` `JobsTable steps={[0,1,2,3,4]}`, `handleStartRun()` +
      "Start Run" button on the Overview tab, `runAllAkbc()` calls `handleStartRun()` first.

### Phase 4 — Restore failure visibility (code)

- [ ] Ensure each cron route logs an `'E'` row to `xlg_logging` that actually persists when a step
      throws — verify `write_logging({ lg_severity: 'E' })` works against prod (it swallows its own
      errors, so a silent failure there would also explain the gap). Confirm a fresh `'E'` row
      appears after a deliberate failure.
- [ ] Consider whether `NEXT_PUBLIC_APPENV_LOG_I=false` on prod is hiding useful pipeline progress
      logging, or whether progress should log at a severity that isn't suppressed.
      **OPEN — agree before #code.**

### Phase 5 — Recover prod data (user)

- [ ] User runs the catch-up from local against prod (`npm run localprod`) — no Vercel time limit.
      Use the panel's **To-date** + **time-budget** inputs to walk `[MAX(se_date) .. today]`
      forward in as many passes as needed. This is the **only** place a To-date is ever used — the
      deployed Vercel crons never carry one.
- [ ] Once local catch-up has `MAX(se_date)` at ~today, the deployed crons keep pace on their own:
      each daily window is tiny; the soft time budget + `maxDuration` are the only overflow
      protection needed, no `vercel.json` changes.
- [ ] Verify `tse_sessions` max `se_date` advances to ~current, `ta1_player_stats` /
      `ta2_partner_stats` are rebuilt, and `pip_run_id` advances daily.

## Changes

### src/ui/admin/PipelineTable.tsx
- Added `formatPipDate(value: string)` helper (after `addDays`) — parses the timestamp and
  returns `YYYY/MM/DD HH:MM:SS` using local-time getters with a nested `pad` helper, so the
  output no longer depends on the browser locale (was `7/27/2026, 2:08:08 PM`).
- Replaced all three `new Date(pip_created).toLocaleString()` date cells — the step row, the
  sub-step row, and the per-player expand row — with `formatPipDate(pip_created)`.
- Numeric `toLocaleString()` calls (input/output record counts, duration) left unchanged.
- Phase 3: `STEP_LABELS[0] = 'Start Run'`, `STEP_SUBSTEPS[0] = null` (single row), and updated the
  block comment above them to describe step 0.
- Phase 3: `OverviewSummary`'s `JobsTable` now covers `steps={[0, 1, 2, 3, 4]}` so the Start Run
  row shows in the Overview Jobs summary.
- Phase 3: added `handleStartRun()` (POSTs `/api/build/start-run`), a "Start Run" button on the
  Overview tab next to "Run All Cron" (+ its error line), and a `handleStartRun()` call at the
  front of `runAllAkbc()` so the AKBC-tab "Run All" still produces a fresh run now that the scrape
  step no longer creates one.

### src/lib/actions/pipelineLog.ts
- Added `startPipelineRun()` — `resolvePipRunId(0, true)` (bumps `MAX(pip_run_id)+1`) then
  `logPipelineStep({ step: 0, sub_step: 'a', step_name: 'Start Run' })`; returns `{ run_id }`.
  This is now the only place a pipeline run is created.

### src/app/api/build/start-run/route.ts (new)
- GET/POST → `startPipelineRun()`, logs an `'I'`/`'E'` line, returns `{ run_id }`. Modelled on
  `stats/route.ts` (no auth check). This is the route the new earliest Vercel cron hits.

### src/lib/actions/pipelineScrape.ts
- `scrapeClubSessions` — `resolvePipRunId(1, true)` → `resolvePipRunId(1, false)`; the AKBC scrape
  no longer forces a new run. Added a comment explaining that step 0 (`/api/build/start-run`) owns
  run creation now.

### src/app/api/cron/update-sessions/route.ts
- `run()` calls `startPipelineRun()` first (after the START log), so the Overview "Run All Cron"
  full-pipeline run gets a fresh run_id. Imported `startPipelineRun`.

### vercel.json
- Added `{ "path": "/api/build/start-run", "schedule": "50 13 * * *" }` as the first cron entry
  (10 min before the `0 14` AKBC scrape).

### src/lib/constants.ts (Phase 2)
- Added `SCRAPE_MAX_DURATION_SECONDS = 300` (canonical value / doc; routes must use the literal
  because Next.js route segment config isn't statically analyzable through an import) and
  `SCRAPE_TIME_BUDGET_MS = 240_000`. Reworded the `FETCH_TIMEOUT_MS` comment (now also used by
  `pipelineScrape.ts` and overrideable per run).

### src/lib/actions/buildSteps.ts (Phase 2)
- New `dateRangeFilter(column, fromDate, toDate)` helper: both → `BETWEEN`, `toDate` only →
  `<= $1`, `fromDate` only → `>= $1`, neither → no filter. `buildSessionsFromStaging` (`s1_date`)
  and `buildResultsFromStaging` (`se_date`) both use it instead of their old both-required inline
  filter, so a `to_date`-only cap now works. Header comments updated.

### src/lib/actions/pipelineScrape.ts (Phase 2)
- New `fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS)` helper (AbortController) replacing the
  three raw untimed `fetch()` calls; a timed-out/failed fetch is skipped (like a non-OK response),
  not fatal.
- `ScrapeSessionsResult` gains `timed_out: boolean`.
- `scrapeClubSessions` / `scrapeTrackedPlayerSessions` take `timeBudgetMs?` / `fetchTimeoutMs?`,
  compute a `deadline`, and `break` the day / player loop and the `scrapeRunIds` run_id loop once
  past it (checked between iterations only — never mid-`scrapeRunId`). `scrapeRunIds` takes
  `deadline` + `fetchTimeoutMs` and returns `timed_out`. All defaults fall back to the constants.
- **To-date (Option A):** `scrapeRunId` / `scrapeRunIds` take `toDate?`; after parsing the
  session's `headerRow.date` (or `rows[0].date`), a run_id past `toDate` returns `{pairs:0,
  created:0}` with no `ts1`/`ts2` write (ISO strings compare lexicographically). The page is
  still fetched. `scrapeTrackedPlayerSessions` gains a `toDateOverride` **first** param and
  passes it through; `scrapeClubSessions` passes its `toDateOverride` through as well.

### src/app/api/build/scrape/route.ts, scrape-tracked/route.ts (Phase 2)
- `export const maxDuration = 300` (literal + keep-in-sync comment). `params()` helper reads
  `to_date` + `time_budget_ms` + `fetch_timeout_ms` (plus `from_date` for `scrape`); `run()`
  threads them into the scrape function (`scrape-tracked` now passes `toDate` as the new first
  arg). Log line notes when a run stopped at the time budget.

### src/app/api/build/stats/route.ts (Phase 2)
- `export const maxDuration = 300` (literal + keep-in-sync comment).

### src/app/api/cron/update-sessions/route.ts (Phase 2)
- `export const maxDuration = 300`. `run(toDate?, timeBudgetMs?, fetchTimeoutMs?)`: `to_date`
  threaded into `scrapeClubSessions`, `scrapeTrackedPlayerSessions` (new first arg), and **both
  tracked build calls** (`…(false, undefined, toDate, 'tracked')`); budgets threaded into both
  scrape calls. `params()` helper for GET/POST; `summary.timed_out` added; log lines note
  time-budget stops.

### src/ui/admin/PipelineTable.tsx (Phase 2)
- One shared `pipelineToDate` state rendered **above the tab bar** (present on every tab),
  replacing the Overview-only `cronToDate` **and** the AKBC tab's "To:" input (`scrapeToDate`
  removed; AKBC "From:" `scrapeFromDate` kept). Threaded as `?to_date=` into `handleScrapeClub`,
  `handleScrapeTracked`, `handleSessionsTracked`, `handleResultsTracked`, `handleRunFullCron`.
- `cronTimeBudgetSec` / `cronFetchTimeoutSec` seeded from `SCRAPE_TIME_BUDGET_MS` / `FETCH_TIMEOUT_MS`
  (÷ 1000); Overview keeps the "Time budget (s)" / "Fetch timeout (s)" row (To-date removed from it).
- `addDays` helper + `SCRAPE_DEFAULT_TO_DATE_WINDOW_DAYS` import removed (only fed the deleted
  To-date seeding); `doRefreshAll` now seeds only the AKBC "From".

### src/ui/owner/ConstantsPage.tsx (Phase 2)
- Added `SCRAPE_MAX_DURATION_SECONDS` (consumers `[]` — routes use the literal) and
  `SCRAPE_TIME_BUDGET_MS` entries; refreshed `FETCH_TIMEOUT_MS` description/consumers;
  `SCRAPE_DEFAULT_TO_DATE_WINDOW_DAYS` marked unused; matching `FUNCTION_DESCRIPTIONS` entries for
  `pipelineScrape.ts: fetchWithTimeout` / `scrapeTrackedPlayerSessions`, and the `doRefreshAll`
  description corrected.
- Added a `PIPELINE_RUN_POLL_MS` entry under the Pipeline heading.

### Live feedback for "Run All Cron" (Phase 2, testing follow-up)
- `src/lib/constants.ts` — new `PIPELINE_RUN_POLL_MS = 2500`.
- `src/lib/actions/pipelineStatus.ts` — new `getStagingCounts()` server action:
  `{ ts1_sessions, ts2_results }` raw row counts, one `table_query` with `skipCache: true`.
- `src/ui/admin/PipelineTable.tsx`
  - `useEffect` on `running`: while `running === 'full-cron'` a `setInterval` every
    `PIPELINE_RUN_POLL_MS` bumps `refreshKey` (so `OverviewSummary` picks up the new run_id once
    Start Run logs, then each completing step) **and** reloads `getStagingCounts()`; interval
    cleared + `stagingCounts` reset on `running` change / unmount.
  - `fullCronStartedAt` / `stagingCounts` state; `handleRunFullCron` stamps
    `fullCronStartedAt = Date.now()` before `run()`.
  - New `formatElapsed(ms)` → `"M:SS"` helper.
  - Overview renders a "Run in progress" strip (elapsed + `ts1_sessions` + `ts2_results`) between
    the budget inputs and `OverviewSummary`, only while `running === 'full-cron'`.

### Record the run's To-date on tpip_pipelinelog (Phase 2, testing follow-up)
- `scripts/schema.sql` — `pip_to_date date` added to `tpip_pipelinelog` (after `pip_created`).
- `src/lib/actions/pipelineLog.ts` — `PipelineStatus` gains `pip_to_date: string | null`;
  `logPipelineStep` gains `to_date?` → `{ column: 'pip_to_date', value: … ?? null }`;
  `startPipelineRun(toDate?)` passes it (step-0 row only).
- `src/app/api/build/start-run/route.ts` — `run(toDate?)`; `toDateParam()` reads `?to_date=`;
  GET/POST take `NextRequest`; log line notes the cap.
- `src/app/api/cron/update-sessions/route.ts` — `startPipelineRun(toDate)`.
- `src/ui/admin/PipelineTable.tsx` — `handleStartRun()` sends `?to_date=<pipelineToDate>`; new
  `formatPipToDate(v)` → `"YYYY-MM-DD"`; `JobsTable` gains a **"To date"** column (header +
  single-row / sub-step / per-player cells + `colSpan` 7→8 on the step header row).
- **Bugfix (testing):** the `pg` driver returns a `date` column as a `Date` at *local* midnight,
  so `formatPipToDate`'s `.toISOString().slice(0,10)` (UTC) showed the previous day on a UTC+1
  machine. Now reads local `getFullYear/getMonth/getDate`; `PipelineStatus.pip_to_date` widened
  to `string | Date | null`. Stored value was always correct — display only.

### Manual SQL — run on local now, prod before/at deploy

```sql
ALTER TABLE tpip_pipelinelog ADD COLUMN pip_to_date date;
```

(Appends at the end — matches `scripts/schema.sql`; no column reorder needed. Until it is run,
`startPipelineRun` / every `logPipelineStep` call will fail with "column pip_to_date does not
exist".)

### .gitignore — un-ignore src/app/api/build/ (discovered during #commit)

- `git add -A` was about to silently drop 4 route files: `src/app/api/build/scrape/route.ts`,
  `scrape-tracked/route.ts`, `stats/route.ts`, and the **new** `start-run/route.ts`. `~/.gitignore_global`
  has a bare `build/` rule (for CRA/Vite output) that also matches this app's
  `src/app/api/build/` folder. `git log --all` confirmed those 4 have **never been committed on
  any branch** (only `cleanup` / `partners` / `results-nzb` / `sessions-nzb` under that folder are).
- **This is the likely production root cause:** `vercel.json` schedules crons at
  `/api/build/scrape`, `/api/build/scrape-tracked`, `/api/build/stats` — but Vercel deploys from
  git, so those routes have always been **404 in production** → every invocation fails with no
  pipeline-log row and no error log, exactly the observed "scrape and stats steps dying silently".
  `/api/cron/update-sessions` (tracked, under `api/cron/`) is why the older single-cron path and
  the 2026-07-27 "Scrape AKBC" row worked.
- **Fix:** project `.gitignore` now has `!src/app/api/build/`, so all 4 route files are tracked
  and committed in this change and will deploy.

## Remaining after this commit (not done)

- **Phase 1** — user checks the Vercel Cron Jobs tab + Logs for `/api/build/scrape`,
  `/api/build/scrape-tracked`, `/api/build/stats` (now expected: they were 404, not timeout).
- **Phase 4** — restore prod failure visibility (`write_logging('E')` actually persisting); never
  agreed/triggered.
- **Phase 5** — the ~4-week prod backlog backfill from `npm run localprod`.
- `pipelineToDate` browser persistence (`localStorage`) — deferred by user.
- **Prod deploy prerequisites:** run `ALTER TABLE tpip_pipelinelog ADD COLUMN pip_to_date date;`
  on prod; the pre-existing 2026-07-31 prod schema migration (`re_score`, `ta1`/`ta2`
  restructure) is still pending on prod — see project `.claude/CLAUDE.md` Outstanding items.

## Testing

### Phase 0 — date format (ready to verify now)
- [ ] Open http://localhost:4040/owner/pipeline and check the "Last Run" column shows
      e.g. `2026/08/30 16:50:36` instead of `8/30/2026, 4:50:36 PM`.
- [ ] Expand the tracked-players sub-step (▶) and confirm each per-player row's date is in the
      same `YYYY/MM/DD HH:MM:SS` format.
- [ ] Confirm the time-of-day still matches what it showed before (local time, not shifted to UTC).
- [ ] Confirm the Input Recs / Output Recs / Duration columns still show thousands separators.

### Phase 3 — dedicated "start run" step (ready to verify now)
- [ ] Open http://localhost:4040/owner/pipeline (Overview tab). Click **Start Run**. Confirm a new
      run_id appears in the run-id picker and a `0 Start Run` row shows in the Jobs summary with a
      Last Run time and a green status.
- [ ] Click **Run All Cron**. Confirm it creates one fresh run_id and every step (0–4) logs under
      that same run_id (no reuse of the previous run).
- [ ] On the **AKBC** tab click **Run All**. Confirm it now starts with a Start Run (new run_id)
      then scrape → build sessions → build results, all under the one new run_id.
- [ ] On the AKBC tab click just **Scrape AKBC** on its own. Confirm it now *reuses* the current
      run_id (does not create a new one) — run creation only happens via Start Run / Run All.
- [ ] Query `tpip_pipelinelog` and confirm the `Start Run` rows are `pip_step = 0`,
      `pip_sub_step = 'a'`, and that `pip_run_id` increments once per Start Run.
- [ ] `vercel.json` — confirm `/api/build/start-run` is the first cron entry at `50 13 * * *`.

### Phase 2 — shared To-date (all tabs) + time budget + fetch timeout (verify locally against prod: `npm run localprod`)
- [ ] `npx tsc --noEmit` and `npm run build` both clean (build confirms the `maxDuration` literals
      are accepted as route segment config).
- [ ] http://localhost:4040/owner/pipeline — a **"To date (caps every step, all tabs)"** input
      sits above the tab bar and stays visible on all four tabs; a **clear** link appears once set.
- [ ] The **Overview** tab shows **Time budget (s)** = `240` and **Fetch timeout (s)** = `15`
      pre-filled (from the constants). The **AKBC** tab still has its own **From:** input but no
      **To:** input (it now reads "To: the shared 'To date' above").
- [ ] Set the shared **To date** a few days after the current `MAX(se_date)` and click **Run All
      Cron**. Confirm: new `tse_sessions` rows all have `se_date <=` the cap; **no** `tre_results`
      past the cap; `ts1_sessions` may have rows past the cap (AKBC won't discover them; tracked
      may fetch-then-skip) with no matching `tse_sessions`.
- [ ] With the same To date still set, run the **AKBC** tab's "Run All" and the **Tracked Players**
      tab's "Run All" individually — each also stops at the cap (nothing dated past it is written
      or built).
- [ ] Clear the To date, set **Time budget (s)** = `5` with a real backlog present, **Run All
      Cron**. Confirm `timed_out: true`, the log line says "stopped at time budget", and a second
      run continues where it left off (more sessions, no duplicates / no errors).
- [ ] Set **Fetch timeout (s)** = `3` and run — it still completes (or skips slow pages) rather
      than hanging; normal pages unaffected.
- [ ] Clear all three — behaves exactly as before this phase (window `[MAX(se_date) .. today]`,
      no early stop).
- [ ] Individual routes still work with query params:
      `POST /api/build/scrape?to_date=YYYY-MM-DD`,
      `POST /api/build/scrape-tracked?to_date=YYYY-MM-DD&time_budget_ms=5000`.
- [ ] `/owner/constants` (Constants tab) lists `SCRAPE_MAX_DURATION_SECONDS`,
      `SCRAPE_TIME_BUDGET_MS`, and `PIPELINE_RUN_POLL_MS` with sensible descriptions.
- [ ] Click **Run All Cron** and stay on the Overview tab. Within a few seconds the Jobs summary
      switches to the new run_id and shows the `0 Start Run` row; as the run proceeds, rows for
      steps 1→2→3→4 appear/refresh without reloading the page. When it finishes, the summary shows
      the completed run and polling stops (no continued network calls).
- [ ] During the run, a **"Run in progress"** strip shows an **elapsed** timer (M:SS, advancing
      ~every 2.5 s) and **ts1_sessions** / **ts2_results** counts that climb during the AKBC
      scrape (before step 1a logs). The strip disappears when the run finishes.
- [ ] Switch away to another tab mid-run and back — no console errors, polling still behaves.
- [ ] **Run `ALTER TABLE tpip_pipelinelog ADD COLUMN pip_to_date date;` on local first.** Then:
      with the shared **To date** set, click **Run All Cron** — the Jobs summary's **"To date"**
      column shows that date on the `0 Start Run` row (and `—` on every other step). Clear the
      To date, run again — the Start Run row's "To date" is `—`.
- [ ] `SELECT pip_run_id, pip_to_date FROM tpip_pipelinelog WHERE pip_step = 0 ORDER BY pip_run_id DESC;`
      — capped runs show the date, uncapped show NULL.
- [ ] The **"To date"** column on the Start Run row now shows the **same** date you typed in the
      shared To-date input (no off-by-one) — e.g. input `2026-08-25` → column shows `2026-08-25`.

### Phase 4 — to be written when that phase executes
