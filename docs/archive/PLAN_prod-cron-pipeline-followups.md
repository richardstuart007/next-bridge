# PLAN_prod-cron-pipeline-followups — next-bridge

## Title
Prod cron pipeline follow-ups — Vercel verification, restore failure logging, prod schema + backfill

## Background

Follow-up to `PLAN_prod-cron-pipeline-not-running` (archived, commit `8d74f19` / v0.1.18). That
change: fixed the `.gitignore` so `src/app/api/build/*` routes are tracked (the likely prod
root cause — Vercel deploys from git, so `/api/build/scrape` etc. had always been 404); added the
dedicated `start-run` step 0; added the To-date cap + soft time budget (`SCRAPE_TIME_BUDGET_MS`)
+ per-fetch timeout (`FETCH_TIMEOUT_MS`) + hard `maxDuration = 300`; the `pip_to_date` column;
and the "run in progress" UI.

These items were identified but **not** implemented / not triggered:

- **Phase 1** — verify on Vercel what the `/api/build/*` crons were actually doing (404 vs
  timeout) and confirm they respond after the v0.1.18 deploy.
- **Phase 4** — prod has had **no `'E'`/`'W'` rows in `xlg_logging` since 2026-07-25**, so cron
  failures are invisible. `write_logging` swallows its own errors. Need to (a) confirm
  `write_logging('E')` actually persists against prod, (b) decide whether pipeline progress
  should log at a severity `NEXT_PUBLIC_APPENV_LOG_I=false` doesn't suppress.
- **Phase 5** — prod schema is behind (`pip_to_date` column, plus the pre-existing 2026-07-31
  `re_score` / `ta1`-`ta2` restructure), and there is a ~4-week session backlog to backfill.
- **Deferred** — `pipelineToDate` `localStorage` persistence; optional mid-scrape progress row.

## Plan

### Phase 1 — Confirm on Vercel (user, code-free)

Prod DB check 2026-08-30 21:55 (read-only SQL via `.env.localprod`): `pip_run_id` has advanced to
**17** with a full **steps 0,1,2,3,4** run completing 21:41 (step 0 "Start Run" present, step 4
stats rebuilt — `ta1_player_stats` 47,547 rows, `ta2_partner_stats` 139,866). `tse_sessions`
`MAX(se_date)` = **2026-08-29** (was 2026-08-04). `pip_to_date` column present on prod. So the
pipeline is running end-to-end on prod again — the remaining Phase 1 items are Vercel-dashboard
confirmation of *how* (scheduled crons vs. the localprod backfill run).

- [ ] User opens Vercel → project → **Cron Jobs**: for `/api/build/start-run`, `/api/build/scrape`,
      `/api/build/scrape-tracked`, `/api/build/stats` note last run time + HTTP status — confirm
      each now returns 200 on its schedule (post-v0.1.18 deploy).
- [ ] User opens Vercel → **Logs**, filtered to those routes, and notes whether historical
      failures were `404` (route missing — expected, pre-v0.1.18) or `FUNCTION_INVOCATION_TIMEOUT`.
- [ ] User confirms `CRON_SECRET` is set on prod and whether `NEXT_PUBLIC_APPENV_ISDEV` is `true`
      or unset (only `/api/build/scrape` checks the secret).
- [ ] Record findings back in this file.

### Phase 5a — Prod schema catch-up (user, manual SQL) — DONE 2026-08-30

- [x] User ran on **prod**: `ALTER TABLE tpip_pipelinelog ADD COLUMN pip_to_date date;`
- [x] User applied the pre-existing 2026-07-31 migration to prod (`re_score`
      add/backfill/drop; `ta1_player_stats` / `ta2_partner_stats` backup/drop/recreate; Update
      Stats re-run).
- [x] Both confirmed complete by user (2026-08-30). Prod schema now matches local. The
      corresponding project `.claude/CLAUDE.md` Outstanding items are cleared.

### Phase 4 — Restore prod failure visibility (code)

Prod `xlg_logging` is still frozen at 2026-07-25 even after run 17 completed a full pipeline —
because `.env.localprod` / prod has `NEXT_PUBLIC_APPENV_LOG_I=false`, so all `'I'` progress/success
lines are suppressed, and no error has thrown since the v0.1.18 fix. `write_logging` does **not**
suppress `'P'` (pipeline) or `'E'`/`'W'`.

**Decision:** move pipeline progress/success logging from `'I'` → `'P'` so prod cron runs leave a
visible trail (agreed via `#code`).

- [x] `/api/cron/update-sessions` — `log(msg, severity)` helper default `'I'` → `'P'`; comment
      updated. Catch still passes `'E'` explicitly.
- [x] `/api/build/*` success `write_logging` `lg_severity: 'I'` → `'P'` in `scrape`,
      `scrape-tracked`, `stats`, `start-run`, `partners`, `sessions-nzb`, `results-nzb`. All 7
      (and `cleanup`) already log `'E'` with `String(err)` on catch — none missing. `cleanup` left
      as `'I'` (manual admin route, not a scheduled cron).
- [ ] Verify (user, post-deploy): after a scheduled cron run, prod `xlg_logging` has fresh `'P'`
      rows from `cron/update-sessions` / `build/*` — which also proves `write_logging` is writable
      on prod, so the `'E'` path is trustworthy (no deliberate-throw test needed). If **no** `'P'`
      rows appear, `write_logging` itself is failing on prod → investigate its catch path / DB
      perms, raise in `nextjs-shared` rather than working around locally.
- [x] `npx tsc --noEmit` + `npm run build` clean.

### Phase 5b — Backfill prod data (user) — DONE 2026-08-30

- [x] User walked the backlog forward from `npm run localprod` using the To-date + Time-budget
      inputs.
- [x] Verified on prod (2026-08-30 21:55): `tse_sessions` `MAX(se_date)` = 2026-08-29 (≈ today),
      `ta1_player_stats` 47,547 / `ta2_partner_stats` 139,866 rows (Update Stats ran, step-4 rows
      at 21:41), `pip_run_id` advanced to 17 with a full steps 0–4 run.
- [ ] Over the next few days, user confirms the deployed Vercel crons keep pace on their own
      (each daily window tiny; no `vercel.json` `to_date` — prod crons never carry one). — pending
      observation.

### Phase 6 — Deferred niceties

- [x] `pipelineToDate` browser persistence — `PIPELINE_TO_DATE_STORAGE_KEY = 'pipeline_to_date'`
      module const in `PipelineTable.tsx`; a mount `useEffect` restores it from `localStorage`
      (guarded try/catch, not the `useState` initializer — SSR), a `useEffect` on `pipelineToDate`
      writes it back (removes the key when cleared).
- [ ] Intermediate `tpip_pipelinelog` progress row every N run_ids inside `scrapeRunIds` so the
      Jobs summary advances mid-scrape. **Still needs N agreed** (new constant) — and it partly
      overlaps the "run in progress" strip (live `ts1`/`ts2` counts), so may not be worth doing.
      Left un-done.

### Phase 7 — Split the two slow scrapes into many short, self-contained cron jobs — DONE 2026-08-31 (code, `#code`)

**Motivation.** In a real prod run the only slow steps are Scrape AKBC (~96 s) and Scrape tracked
(~76 s); everything else is < 10 s. Splitting each into small self-contained jobs keeps every
invocation to a few seconds, well under `maxDuration`, and makes a backlog drain over successive
cron runs instead of one giant run.

**Investigation (2026-08-30/31).**
- nzbridge's `results.html?…&mp_results=Search` is **hard-capped at 100 result rows** (newest
  first, no pagination) *regardless* of date range — server-side, not our code (1-week / 1-month /
  4-week queries returned byte-identical 100-row responses; a 1-day query returned 61). So the
  AKBC scrape **must** always request `date_start = date_end` (one day) and never widen.
- The AKBC day-search page carries the **full pair detail** (same `nzbtable` as the `?run_id=`
  page), so the per-`run_id` `scrapeRunId` fetch is redundant for AKBC.
- The **tracked** discovery page `online-points.html?mp_user=X` is only the player's own row per
  session — no partner, no other pairs (`Date | Location | Event | Placing | Score | …`). So a
  `ts2_results` row **cannot** be built from it; tracked keeps its `?run_id=N` fetch per session.

**One `run_id` per day, split across cron jobs only because one invocation would exceed
`maxDuration`. Duplicate jobs within a step are distinguished by `pip_sub_step` (option B).**

- **`/api/build/start-run`** is a cron again (earliest, `50 12`): `startPipelineRun(undefined,
  true)` — `MAX(pip_run_id)+1` + truncate `ts1`/`ts2` + the step-0 marker. The **only** place a
  run_id is created and staging is truncated.
- Every other cron job reuses that run_id via `resolvePipRunId(step, false)` — no `startPipelineRun`,
  no truncate. Staging accumulates through the day; the once-per-day truncate keeps it bounded.
- **`pip_sub_step` layout — one combined row per invocation** (scrape + Build Sessions + Build
  Results happen inside the one cron call, builds run with `skipLog = true` so only the cron's
  own combined row is logged):
  | step | job | `pip_sub_step` | `pip_sub_sub` | `pip_step_name` |
  |---|---|---|---|---|
  | 0 | Start Run | `a` | — | `Start Run` |
  | 1 (AKBC) | `?slot=0` | `0` | — | `Scrape AKBC <yyyy-mm-dd>` |
  | 1 (AKBC) | `?slot=1` | `1` | — | `Scrape AKBC <yyyy-mm-dd>` |
  | 2 (Tracked) | `?batch=0` | `0` | — | `Tracked batch 0` |
  | 2 (Tracked) | `?batch=0` per-player | `0` | `01`–`05` | player name |
  | 2 (Tracked) | `?batch=1..5` | `1`–`5` | `01`–`05` | `Tracked batch <N>` / player name |
  | 3 | Build Partners | `a` | — | `Build Partners` |
  | 4 | Player Stats | `a`–`d` | — | `Player Stats — Group A/B/C/All` |
  | 5 | Partner Stats | `a`–`d` | — | `Partner Stats — Group A/B/C/All` |
- `?slot` / `?batch` map straight to `pip_sub_step` (`String(slot)` / `String(batch)`). Per-player
  `pip_sub_sub` is the **local** index within the batch (`String(i + 1).padStart(2, '0')`).
- `buildSessionsFromStaging` / `buildResultsFromStaging` gain an optional `skipLog` arg (default
  `false`, so existing callers are unchanged) — the two new cron routes pass `true`.
- Partner Stats moved from `pip_step 4` `e`–`h` to its own **`pip_step 5`** `a`–`d`, mirroring
  Player Stats' `a`–`d`.
- `PipelineTable.tsx`'s `JobsTable` is reworked to render the run's rows **data-driven** — a
  `SINGLE_ROW_STEPS` set (0, 3) renders one bold line; every other step renders a header + one
  row per `pip_sub_step` actually present (ordered, label from `pip_step_name`), with the `▶`
  per-player expand for any sub-step that has `pip_sub_sub`-non-null children — instead of the
  hardcoded `STEP_SUBSTEPS` a/b/c map.
- `partners` / `stats` unchanged re: run_id — reuse the current `MAX(pip_run_id)` (the day's run).
- **Boundary + trace logging (`PHASE7-TRACE`).** New `src/lib/actions/cronTrace.ts` —
  `cronStart(route, params)` / `cronEnd(route, summary)` / `cronFail(route, err)`, writing
  `START … / END OK … / END ERROR …` to `xlg_logging` at severity `P`/`E` (not `I`, so prod keeps
  them). Every cron route (`start-run`, `scrape-akbc-day`, `scrape-tracked-batch`, `partners`,
  `stats`, plus `scrape` / `scrape-tracked` / `update-sessions`) calls them. `pipelineScrape.ts`
  also gets a `trace(where, msg)` helper logging `phase7` detail lines at `P`. All tagged
  `// PHASE7-TRACE` for one-grep removal once the split is proven on prod.
- **`SCRAPE_TIME_BUDGET_MS` dropped entirely** (constant, `ConstantsPage` entry, all call sites,
  the `time_budget_ms` query param, the `timed_out` result field, the mid-loop deadline break).
  `FETCH_TIMEOUT_MS` (per-fetch `AbortController` timeout) stays.

**Shared write function `persistSessionsFromPage(html)`:** parse a results-table page
(`parsePage` → `Map<run_id, ParsedRow[]>`) and, for every `run_id`, write its `ts1_sessions`
header row + all its `ts2_results` pair rows — one function, both tables. Replaces the ts1/ts2
writes currently inside `scrapeRunId`. AKBC feeds it the day-search page (many sessions per
call); tracked feeds it each `?run_id=N` page (one session per call).

**AKBC — 2 cron jobs.**
- Each job: `day = MAX(se_date) + 1`, read fresh at the job's start. Job 1 does the next
  un-built day; job 2 (staggered ~1 h later) re-reads the now-advanced `MAX(se_date)` and does
  the day after. So functionally job 1 = +1, job 2 = +2, but each computed sequentially — a
  failed job 1 leaves `MAX(se_date)` unmoved, so job 2 **retries** that day rather than skipping
  it (no hole). `day > today` / no sessions → finds nothing, ignored (still logged, 0 output).
- Scrape = **one fetch** of `results.html?mp_filter_club=106&date_start=D&date_end=D&mp_results=Search`
  → `persistSessionsFromPage`. **No `scrapeRunId`, no per-`run_id` fetch, no separate ts2 step.**
- Then Build Sessions + Build Results for that day → `se_date` advances.
- Recovers ≤ 2 days per day. Deeper backlog + all gap repair → the separate **fix-data
  pipeline** (own plan, out of scope here), never the standard run.
- Residual risk: a single AKBC day with > 100 masterpoint rows would be silently truncated by
  the server cap. ~60 rows/day today; revisit (sub-split the day) only if that changes.

**Tracked — 6 cron jobs, batches of 5.**
- `scrapeTrackedPlayerSessions` gets a `batch?: number` param → `flagged` query becomes
  `… WHERE pl_tracked AND pl_nzb > 0 ORDER BY pl_name ASC LIMIT TRACKED_SCRAPE_BATCH_SIZE
  OFFSET batch * TRACKED_SCRAPE_BATCH_SIZE`. No `batch` → all players (manual path). List stays
  live from `tpl_players` — **no hardcoded array**.
- Each batch reuses the day's run_id (`resolvePipRunId(2, false)`, **no** truncate — only
  `start-run` truncates) → scrape its 5 players (`online-points.html` discovery → `?run_id=N` per
  missing session → `persistSessionsFromPage`) → Build Sessions → Build Results (`skipLog`).
- Per-player `logPipelineStep` `sub_sub` = **local** index within the batch
  `String(i + 1).padStart(2, '0')` (`01`–`05`), under `pip_sub_step` = the batch number.
- A failed batch → those 5 players retried next day (`batchCheckMissing` re-finds their missing
  sessions). Empty batch (past the tracked count) → fast no-op.

**Daily order (all staggered, UTC):** start-run (`50 12`) → AKBC slot 0 (`5 13`) → AKBC slot 1
(`35 13`) → tracked batch 0…5 (`0 14`–`50 14`, every 10 min) → Build Partners (`10 15`) → Update
Stats (`20 15`). **11 cron entries.**

**Constants:** `TRACKED_SCRAPE_BATCH_SIZE = 5` in `constants.ts` + `/owner/constants`.

**Kept for manual / `npm run localprod` use:** `/api/cron/update-sessions` and the standalone
`/api/build/scrape`, `sessions-nzb`, `results-nzb`, `scrape-tracked`, `start-run` routes — all
as-is. `scrapeClubSessions` keeps its own truncate for that catch-up path.

**Decisions made for #code:**
- **New dedicated routes** (not params on existing): `/api/build/scrape-akbc-day?slot=N`,
  `/api/build/scrape-tracked-batch?batch=N`.
- `start-run` is a cron again (`50 12`) and is the **only** run_id-creator + staging-truncator:
  `startPipelineRun(toDate?, truncateStaging = false)`, called `true` by `start-run` and by
  `update-sessions`. The two new split routes call `resolvePipRunId(step, false)` and never
  truncate. `scrapeClubSessions` / `scrapeTrackedPlayerSessions` keep their own truncate + `'a'`
  summary row for the manual multi-day / all-players path.
- Tracked per-batch summary row **kept** (written by the route, `step_name` = `Tracked batch
  <N>`); `scrapeTrackedPlayerSessions` writes only the per-player `sub_sub` rows when `batch` is
  passed (its `'a'` summary row is written only in the un-batched path).
- Partner Stats relocated to its own `pip_step 5` `a`–`d`.
- `SCRAPE_TIME_BUDGET_MS` removed; `FETCH_TIMEOUT_MS` kept.
- New `cronTrace.ts` boundary logging + `pipelineScrape.ts` `trace()` detail lines, all `P`/`E`,
  all tagged `// PHASE7-TRACE`.
- Schedule: the 11 entries above.

### Phase 8 — Real nzbridge club number on `tcl_clubs` + `tse_sessions` (not started)

**Motivation.** `getMaxSessionDate()` is `SELECT MAX(se_date) FROM tse_sessions` with **no club
filter**, so the AKBC per-day cron's target (`getNextScrapeDay()` = `MAX(se_date) + 1`) is skewed
by non-AKBC sessions the tracked-player scrape pulls in (e.g. "South Island Pairs" / Otago). A
tracked player's regional event dated ahead of AKBC's real last club day makes the AKBC day
scrape skip real AKBC days. Need a reliable "is this an AKBC session" test → store the actual
nzbridge club number on each session.

**Facts established (2026-08-31).**
- The results table's club cell is plain text (`<td class="nw_text">Remuera Bowls & Bridge Inc</td>`)
  — no number, no link. The per-session scrape can't read a club number.
- Every nzbridge results page carries the full club dropdown: `<select name="mp_filter_club">`
  with `<option value="106">Remuera…</option>` for every club — a complete name→number map.
- `ts1_sessions.s1_club_id` exists in the schema but is **never populated** (build writes only
  `s1_club`, the name).
- `tcl_clubs` is `cl_clid` (local IDENTITY PK) + `cl_club` (name, UNIQUE); populated by
  `populateClubs()` from `DISTINCT tpl_players.pl_club` — nothing feeds it from session clubs.
- `cl_clid` is a local surrogate, **read by no code at all** (only the schema definition and the
  `02_import_prod.ps1` `setval` line) — every consumer keys on the `cl_club` name.

**Design (agreed 2026-08-31).**
- **Drop `cl_clid`**; `cl_club` (already `UNIQUE NOT NULL`) becomes the primary key. `tcl_clubs`
  ends as two columns: `cl_nzb integer` (nullable, `UNIQUE`, nzbridge club number), `cl_club` (PK).
  `cl_nzb` **must be unique** — Postgres `UNIQUE` still permits multiple `NULL`s, so a not-yet-
  numbered club is fine, but no two clubs may share a real number or a sentinel. A rename like
  `Wanganui`→`Whanganui` is a real merge (repoint + delete the old row), not two rows on 348.
- **`cl_nzb`** nullable so an unmatched club just stays unmapped.
- **`tse_sessions.se_club_nzb integer`** (nullable) — the same number carried onto every session.
  Filter AKBC with `WHERE se_club_nzb = 106`, no join. Keep `se_club` (name) for display.
- Drop the dormant `ts1_sessions.s1_club_id`.
- `getMaxSessionDate()` → `SELECT MAX(se_date) FROM tse_sessions WHERE se_club_nzb = BRIDGE_CLUB_ID`.

**Decisions (resolved 2026-08-31).**
1. **No `scrapeClubList()`, no automatic club maintenance.** The nzb club→number map is a
   one-off: the user supplied the full club list and it's applied by a single manual `UPDATE …
   FROM (VALUES …)` (see `## Changes` → Phase 8). New clubs are rare and the user adds
   `cl_nzb` by hand with SQL when one appears.
2. **Name matching (revised 2026-08-31): EXACT.** The scrape's club number is never in the
   scraped HTML (confirmed on both the results page and the tracked-player `online-points` page —
   club is plain text, no number/link/attribute), so `cl_nzb` can only be resolved by club name.
   The parser already trims the club cell (`.text().trim()`) and now also collapses internal
   whitespace, so `tcl_clubs.cl_club` must exactly equal the scraped name. Build Sessions'
   `cl_nzb` subquery is `c.cl_club = src.club_name` (no `LOWER`/`BTRIM`). A newly built session
   whose club doesn't match logs a `'W'` (`write_logging`, one per distinct club) — an exact miss
   = an nzbridge label change or a genuinely new club, fixed by adding the `tcl_clubs` row. The
   one-off `se_club_nzb` backfill still uses `LOWER(BTRIM(...))` (existing data was already clean;
   harmless).
3. **`populateClubs()` unchanged** — not extended (decision 1). Session-host clubs with no
   `tcl_clubs` row just get `se_club_nzb = NULL` until the user adds a row.
4. **Club numbers come from the live `<select name="mp_filter_club">` list** (124 clubs, all
   numbered) — not the club-directory page the user first pasted. `cl_nzb` is `UNIQUE`, so every
   value is distinct: real numbers as-is; **distinct** sentinels for the handful with no nzb
   club — `Archive` → `997` (dead-player pseudo-club), `Taranaki Bridge Congress` → `998` (event
   name in the club column), `Kawerau` → `999` (defunct/unknown club). `Wanganui` is **merged**
   into `Whanganui` (348) — its `tse_sessions` / `tpl_players` rows repointed, its `tcl_clubs`
   row deleted — not co-assigned 348. `Kawerau` / `Taranaki Bridge Congress` get their own
   `tcl_clubs` rows so future sessions resolve to the sentinel (no `'W'` log). None are AKBC.
5. **`getMaxSessionDate()` scope split (agreed 2026-08-31).** Give it a `scope` arg:
   - `'akbc'` → `WHERE se_club_nzb = BRIDGE_CLUB_ID` — used by all **current** callers:
     `getDateRange` (→ `scrapeClubSessions`), `getScrapeFromDate` (→ AKBC "From" input),
     `getNextScrapeDay` (→ `scrape-akbc-day`). This is the bug fix.
   - `'tracked'` → `WHERE se_club_nzb IS DISTINCT FROM BRIDGE_CLUB_ID` (NULL-safe: **includes**
     sessions whose club didn't resolve to an nzb number — the tracked scrape is deliberately
     cross-club and many of its clubs won't be in the nzb `<select>` list). No caller today;
     added now for a future tracked-day scrape (**agreed 2026-08-31**).
6. **AKBC filter value** — `BRIDGE_CLUB_ID = 106` **already exists** in `src/lib/constants.ts`
   (line 44, "NZB club id for AKBC"). Reuse it directly in `getMaxSessionDate` — no new constant,
   no `tcl_clubs` lookup. (Name stays `BRIDGE_CLUB_ID` unless the user asks to rename.)

**Plan steps.**
- [x] User ran the schema SQL on **locallocal**: rebuilt `tcl_clubs` (dropped `cl_clid`,
  `cl_club` PK, added `cl_nzb`), added `tse_sessions.se_club_nzb`, dropped `ts1_sessions.s1_club_id`.
- [x] `scripts/schema.sql` / `lib/create_prod_tables.sql` / `scripts/02_import_prod.ps1` updated to
  match (drop `cl_clid` + its sequence, `cl_club` PK, `cl_nzb` / `se_club_nzb` columns).
- [x] `buildSessionsFromStaging` — the insert `SELECT` computes `se_club_nzb` per row via an
  **exact** correlated subquery on `tcl_clubs` (`c.cl_club = src.club_name`, `club_name` = the
  `'Auckland'`-fixed session club). A just-built session that resolves to NULL logs a `'W'` line
  naming the club. `parsePage` collapses internal whitespace in the scraped club name so the
  exact match holds.
- [x] `getMaxSessionDate(scope)` — `'akbc'` → `se_club_nzb = BRIDGE_CLUB_ID`, `'tracked'` →
  `se_club_nzb IS DISTINCT FROM BRIDGE_CLUB_ID`. All 3 current callers (`getDateRange`,
  `getScrapeFromDate`, `getNextScrapeDay`) pass `'akbc'`.
- [x] User ran all the one-off backfill SQL on **locallocal**: `cl_nzb` from the live `<select>`
  VALUES list; sentinels `Archive` 997 / `Taranaki Bridge Congress` 998 / `Kawerau` 999;
  `2020 Waiheke`→`Waiheke` (160) and `Wanganui`→`Whanganui` (348) merges; `se_club_nzb` backfill;
  `ALTER TABLE tcl_clubs ADD CONSTRAINT tcl_clubs_cl_nzb_key UNIQUE (cl_nzb)`. Verified: 0 NULL
  `se_club_nzb`, 0 duplicate `cl_nzb`, AKBC-only `MAX(se_date)` (28th) < raw max (29th).
- [ ] Prod picks up the new `tcl_clubs` shape + `se_club_nzb` + backfilled data via
  `npm run copy:prod` (user is overwriting prod from local) — no separate prod DDL/backfill.
- [x] `npx tsc --noEmit` + `npm run build` clean.

### Phase 9 — "Run All Cron" drives `vercel.json`'s `crons` (not started)

**Motivation.** The `/owner/pipeline` **Run All Cron** button currently POSTs
`/api/cron/update-sessions` — the legacy monolithic path. That diverges from what Vercel actually
runs (the 11 split routes from Phase 7): different code (`scrapeClubSessions` /
`scrapeTrackedPlayerSessions()` vs `scrape-akbc-day` / `scrape-tracked-batch?batch=N`), tracked
players in one 27-player pass instead of 6 batches, different `pip_sub_step` shape, `start-run`
without its truncate. So local "run the whole thing" testing isn't exercising the production code
paths — exactly the failure "UI replicas of production cron jobs must be exact" warns about.

**Design (agreed 2026-08-31).** Make the button *read* `vercel.json`'s `crons` array and fire
each entry's `path` in turn, interactively — in sync with prod by construction, so a schedule
change needs no button change.

- **Load** — `import vercelConfig from '@/vercel.json'` (Next.js JSON import; bundled at build,
  fine — `vercel.json` only changes on deploy). Use `vercelConfig.crons`.
- **Order — array order, no schedule parsing** (decision 4). A manual run doesn't care what time
  each cron fires; it just needs to run them in the right sequence, which is exactly the order
  they're listed in `vercel.json` today (`start-run` → `scrape-akbc-day?slot=0/1` →
  `scrape-tracked-batch?batch=0..5` → `partners` → `stats`). Soft constraint: keep `crons` in
  execution order in the file. Real time-overlap problems are diagnosed from `tpip_pipelinelog` +
  `xlg_logging` (`cronStart`/`cronEnd` timestamps), not simulated by the button.
- **Run each** — `POST` the entry's `path` verbatim (query string already in it), `await`, store
  the result under a key derived from `path`, bump `refreshKey` so the Jobs summary reloads, then
  the next. Same client-sequencer pattern as the per-tab "Run All" buttons.
- **Fire every `crons` entry, no filtering** (decision 3) — the button's contract is "run exactly
  what `vercel.json` says". If a non-pipeline cron is ever added it runs too; revisit only then.
- **On failure** — record it, show it, **continue** to the next entry (prod crons are independent;
  a failed one just waits for its next slot). No abort.
- **Progress UI** — keep the "run in progress" strip (elapsed + live `ts1`/`ts2` counts); add a
  "running `<path>` (n/N)" line.
- `/api/cron/update-sessions` is **no longer called by the button** — stays only as the
  `CRON_SECRET`-secured curl / `npm run localprod` whole-pipeline path.

**UI testing overrides (decisions 1 & 2) — the `vercel.json` paths ARE the commands the button
runs.** Each pipeline cron `path` carries the override params **with empty values** in
`vercel.json` — `&to_date=` on `start-run` / `scrape-akbc-day` / `scrape-tracked-batch`,
`&fetch_timeout_ms=` on the two scrape routes. In prod they fire empty → routes treat an empty
string the same as absent (`searchParams.get(x) || undefined`) → zero behaviour change. The
button POSTs each `path` **verbatim**, except: when the Overview "To date" field is set it
string-substitutes the empty `to_date=` value in any path that has one, and likewise
`fetch_timeout_ms=` from the timeout field. So a test run is literally "the cron values with the
date inserted" — the button needs no per-route knowledge of which param goes where.

- **`to_date`** — `start-run` records it on the step-0 `pip_to_date` row; `scrape-akbc-day` treats
  it as a **day cap** (`getNextScrapeDay(toDate?)` → `null` logged no-op when `MAX(se_date)+1 >
  toDate`, same shape as its existing future-day no-op); `scrape-tracked-batch` forwards it to
  `scrapeTrackedPlayerSessions`'s existing `toDateOverride`.
- **`fetch_timeout_ms`** — only `scrape-akbc-day` / `scrape-tracked-batch` act on it.

**Plan steps.**
- [x] `vercel.json` — `start-run` path gains `?to_date=`; `scrape-akbc-day?slot=0/1` and
  `scrape-tracked-batch?batch=0..5` gain `&to_date=&fetch_timeout_ms=`. All empty. `partners` /
  `stats` unchanged. `crons` kept in execution order.
- [x] Routes `start-run` / `scrape-akbc-day` / `scrape-tracked-batch` — query parse uses
  `|| undefined` (and a merged `params()` helper on the two scrape routes) so an empty
  `to_date=` / `fetch_timeout_ms=` reads as unset.
- [x] `getNextScrapeDay(toDate?: string)` — `cap = toDate && toDate < today ? toDate : today`;
  returns `null` (trace: "past cap, nothing to scrape") when `next > cap`. `scrape-akbc-day`
  passes `to_date` in and `fetch_timeout_ms` to `scrapeAkbcDay`.
- [x] `scrape-tracked-batch` route — forwards `to_date` + `fetch_timeout_ms` into
  `scrapeTrackedPlayerSessions(toDate, fetchTimeoutMs, batch)`.
- [x] `PipelineTable.tsx` — `import vercelConfig from '@/vercel.json'`; module-level `CRON_JOBS`
  (`vercelConfig.crons` in file order → `{ path, key, label }`) + `fillCronParams(path, toDate,
  timeoutSec)` (substitutes only non-empty field values into existing `to_date=` /
  `fetch_timeout_ms=` placeholders).
- [x] `handleRunFullCron` rewritten — loops `CRON_JOBS`, `setRunning('full-cron')`, per job
  `fillCronParams` → POST → store `{data|error}` under `job.key`, `refreshKey++`, continue on
  error; `cronProgress` state drives a "running `<label>` (n/N)" line in the progress strip;
  `finally` clears state + `doRefreshAll()`. Overview error area lists any failed cron job.
  `/api/cron/update-sessions` no longer referenced by the button.
- [x] `tsconfig.json` — `resolveJsonModule: true` already set; `@/*` → `./*` so `@/vercel.json`
  resolves.
- [x] `npx tsc --noEmit` + `npm run build` clean.
- [ ] Manual on `npm run locallocal`: **Run All Cron** with both fields empty fires all 11 routes
  in order, Jobs summary fills step 0→5 like a real prod day; a deliberately-failing route
  doesn't abort the rest; setting "To date" to a past day makes `scrape-akbc-day` no-op past it.

### Phase 10 — Show AKBC / Tracked `MAX(se_date)` on `/owner/pipeline` — DONE 2026-08-31

- [x] `pipelineScrape.ts` — new `getPipelineMaxDates(): { akbc, tracked }` — `getMaxSessionDate('akbc')`
  + `getMaxSessionDate('tracked')` in parallel.
- [x] `PipelineTable.tsx` — `maxDates` state, loaded in `doRefreshAll` and re-polled during a
  full-cron run; rendered on the Overview under the "Fetch timeout" row as
  `MAX(se_date) — AKBC (106): <date>   Tracked: <date>`.
- [x] `npx tsc --noEmit` + `npm run build` clean.
- [ ] Verify on `/owner/pipeline` — the two dates show and match the manual
  `SELECT MAX(se_date) … WHERE se_club_nzb = 106` / `… IS DISTINCT FROM 106`; they update after a
  Run All Cron.

### Phase 11 — `scrape-akbc-day` catch-up loop (not started)

**Problem (observed 2026-08-31).** `getNextScrapeDay()` = `MAX(se_date WHERE se_club_nzb=106) + 1`
scrapes exactly one day. On an empty AKBC day (a **weekend** — routine, every week) nothing gets
built, `MAX(se_date)` doesn't advance, and the next run targets the same empty day again —
**permanently stuck**; real sessions on the following Monday never get scraped. Both `?slot=0/1`
just logged the same `Scrape AKBC 2026-08-30` twice.

**Fix.** `scrape-akbc-day` loops days from `MAX(se_date WHERE se_club_nzb=106) + 1` forward to
today (or the `to_date` cap), scraping + building each — empty days included, they advance the
cursor. `maxDuration = 300` is the only bound: if slot 0 runs out of time mid-backlog, **slot 1
(≈30 min later) re-reads the advanced `MAX(se_date)` and continues from where slot 0 stopped**.
That's the whole point of two AKBC crons — one day per run would never catch up a backlog; two
runs give it a chance (user, 2026-08-31). Normal daily op: slot 0 does 1 day, slot 1 no-ops. A
gap longer than a couple of `maxDuration` runs can drain is still the separate fix-data pipeline's
job (Phase 7 note).

- [ ] `scrape-akbc-day` route — replace the single `getNextScrapeDay` + one `scrapeAkbcDay` with a
  `while day <= cap` loop (`cap` = `to_date` or today); per-day `scrapeAkbcDay(day)` +
  `buildSessionsFromStaging`/`buildResultsFromStaging` scoped to `day` (`skipLog`); a soft
  in-loop elapsed check (leave headroom under `maxDuration`) breaks the loop so slot 1 continues.
- [ ] Logging — one `pip_step 1` row per slot (`pip_sub_step` = slot), per-day `pip_sub_sub`
  children `01`, `02`, … each `pip_step_name = Scrape AKBC <date>` (mirrors the tracked-batch
  per-player children). `JobsTable` already renders that shape.
- [ ] Decide: keep the route name `scrape-akbc-day` (now multi-day) or rename.
- [ ] `getNextScrapeDay` — either keep as the loop's start-day helper, or fold into the route.

### Phase 12 — `PipelineTable.tsx` component consolidation (not started)

**Problem (user, 2026-08-31).** The `/owner/pipeline` tabs re-implement the same two things
instead of reusing one component each, so their output drifts — e.g. the AKBC tab's data-driven
summary shows one combined `Scrape AKBC <date>` row (post-Phase-7) while the manual runner below
it still shows `1a` / `1b` / `1c`. Five hand-written variants where there should be two components
plus composition:

| concern | current duplicates |
|---|---|
| summary (JobsTable + run-id picker) | `OverviewSummary` (Overview) **and** `PipelineJobsSummary` (AKBC/Tracked/Finish) — near-identical, separate state |
| detail (manual per-step Run-button table) | 3 bespoke tables — AKBC `1a/1b/1c` + From-date, Tracked `2a/2b/2c`, Finish step 3 + step 4 with 8 stats sub-rows |

**Target.**
- **`<PipelineSummary steps={number[]} refreshKey />`** — the single summary (JobsTable + its own
  run-id picker). `OverviewSummary` + `PipelineJobsSummary` collapse into it. Overview → `[0..5]`,
  AKBC → `[1]`, Tracked → `[2]`, Finish → `[3,4,5]`.
- **`<PipelineStepRunner steps={number[]} />`** — the single manual runner, driven by a per-step
  config array (`{ step, label, route, hasFromDate?, subRows?, statusFn?, sqlText? }`) so the
  AKBC From-date input, the Finish stats sub-rows, and the SQL popovers become *config*, not
  forked JSX. Its Run buttons should call the **current** routes (the Phase-7 split
  `scrape-akbc-day` / `scrape-tracked-batch` where applicable), not the legacy standalone ones —
  resolve which per step.
- **`<PipelinePanel scope="akbc" | "tracked" | "finish" />`** = `<PipelineSummary>` +
  `<PipelineStepRunner>` for that scope's steps.
- **AKBC / Tracked / Finish tabs** = the matching `<PipelinePanel>`.
- **Overview tab** = the Start Run / Run All Cron controls + the max-dates strip, then
  `<PipelinePanel scope="akbc" />` + `scope="tracked"` + `scope="finish"` stacked — no bespoke
  Overview layout.

- [x] `PipelineSummary({ refreshKey, steps })` — merged from `OverviewSummary` +
  `PipelineJobsSummary`; both deleted. `JobsTable` body unchanged.
- [x] `StepRow` (one runner row, every column `undefined` → shared `dashCell()`, `indent` = the
  stats sub-row style) + `StepTable` (the `MyBox` + "Pipeline" heading + the one `<thead>` with
  its Refresh / Run All buttons; `headerExtra` slot = AKBC's "From" input). One definition each.
- [x] `akbcRows()` / `trackedRows()` / `finishRows()` — closure helpers returning the scope's
  `<StepRow>` list (help text / result key / handler are per-step data). **Deviation from the
  plan's "single config array":** kept as three small `*Rows()` functions rather than one array —
  the per-step `<MyHelpStep>` content is long prose, and inline-in-a-list reads far better than
  the same text stuffed into object literals. Same net result: one `StepRow`, one `StepTable`,
  one column structure.
- [x] `renderPanel(scope)` — `<PipelineSummary steps>` + `<StepTable>{rows}` for one scope.
  AKBC summary steps = `[0, 1]` (Start Run belongs to the run's start); Tracked `[2]`; Finish
  `[3,4,5]`.
- [x] `return()` rewritten — AKBC / Tracked / Finish tabs are each `renderPanel(scope)`; Overview
  is the Start Run / Run All Cron controls + max-dates strip + progress strip, then
  `renderPanel('akbc')` `renderPanel('tracked')` `renderPanel('finish')` stacked. The 3 bespoke
  ~440-line tab tables deleted.
- [x] **Manual-runner Run buttons kept on the legacy standalone routes** (`/api/build/scrape`,
  `sessions-nzb`, `results-nzb`, `scrape-tracked`) — deliberate: the per-step buttons run
  scrape / build-sessions / build-results *individually* with a custom From date, which the
  Phase-7 split routes (one combined call, auto-picked day) can't express. Those routes stay
  reachable for `CRON_SECRET` curl regardless. Not re-pointed.
- [x] `npx tsc --noEmit` + `npm run build` clean.
- [ ] `/owner/pipeline` — every tab's summary + detail render identically for its step range;
  Overview is visibly the three panels stacked; per-step Run / Refresh / Run All still work on
  each tab; the stats 8 sub-rows still run individually.

### Phase 13 — `pip_batch` column: stop overloading `pip_sub_step` — DONE 2026-08-31 (code, `#code`; base + stats-split expansion)

**Problem (user, 2026-08-31).** `pip_sub_step` carries three different meanings: the AKBC slot
(`0`/`1`) for step 1, the tracked batch (`0`–`5`) for step 2, and the stats group letter (`a`–`d`)
for steps 4/5 — plus `'a'` everywhere else. The batch/slot is a real, separate dimension of the
cron and isn't recorded as such, so `(run_id, step, sub_step)` isn't a clean key and the AKBC
"slot" vs tracked "batch" naming is inconsistent.

**Design (agreed 2026-08-31).**
- New `tpip_pipelinelog.pip_batch smallint DEFAULT 0 NOT NULL` **positioned after `pip_step`,
  before `pip_sub_step`** — Postgres can't insert a column mid-table, so this is the backup /
  drop / recreate / copy-back procedure (per global CLAUDE.md), not a plain `ADD COLUMN`. The
  `DEFAULT 0` matches the table's other int counters and means "no batch" (steps 0/3/4/5);
  `1..N` is the AKBC slot / Tracked batch.
- **Batch is 1-indexed and always ≥ 1 in new rows.** AKBC's two crons become `?batch=1` /
  `?batch=2` (the `?slot=` param is renamed to `?batch=`); Tracked's six become `?batch=1`…
  `?batch=6` (was `0`–`5`). Steps 0/3/4/5 have no URL batch param but log `pip_batch = 1` — an
  omitted `batch` in `logPipelineStep` defaults to **1**, not 0. `pip_batch = 0` therefore only
  ever appears on pre-Phase-13 backfilled rows; the DB column keeps `DEFAULT 0 NOT NULL` purely to
  document "legacy/unknown". (Expanded 2026-08-31: was `0` for steps 0/3/4/5.)
- **`pip_sub_step` becomes nullable and is only set where it names a real sub-step that aligns
  with `pip_step_name`** — i.e. steps 4 & 5, where `a`/`b`/`c`/`d` ↔ "Group A / B / C / All" in
  the name. Steps 0, 1, 2, 3 have no sub-step → `pip_sub_step` NULL; the row's identity is
  `pip_batch` (AKBC/Tracked) or just the single row, and `pip_step_name` carries the description.
  Tracked per-player rows: `pip_sub_step` NULL, `pip_sub_sub` `01`–`05`, `pip_step_name` = player.
- **Player stats and partner stats split into their own cron entries** (Expanded 2026-08-31). One
  `/api/build/stats` cron currently fires `rebuildAllStats()` (step 4 + step 5 back-to-back in one
  invocation). Split into `/api/build/stats-player` (step 4) and `/api/build/stats-partner`
  (step 5), scheduled 5 min apart, so either can fail/retry without the other and neither eats the
  other's `maxDuration`. `/api/build/stats` stays as the combined route for the manual
  `npm run localprod` / `cron/update-sessions` full-run path.
- New key shape: `(pip_run_id, pip_step, pip_batch, pip_sub_step, pip_sub_sub)` — `(run_id, step,
  batch)` names a summary row + its `pip_sub_sub` children.

| step | `pip_batch` | `pip_sub_step` | `pip_sub_sub` | `pip_step_name` |
|---|---|---|---|---|
| 0 Start Run | 1 | NULL | NULL | "Start Run" |
| 1 AKBC `?batch=1/2` | 1 / 2 | NULL | NULL | "Scrape AKBC \<day\>" |
| 2 Tracked `?batch=1..6` — summary | 1..6 | NULL | NULL | "Tracked batch N" |
| 2 Tracked — per player | 1..6 | NULL | `01`–`05` | "\<player name\>" |
| 3 Build Partners | 1 | NULL | NULL | "Build Partners" |
| 4 Player Stats (`/api/build/stats-player`) | 1 | `a`–`d` | NULL | "Player Stats — Group A/B/C/All" |
| 5 Partner Stats (`/api/build/stats-partner`) | 1 | `a`–`d` | NULL | "Partner Stats — Group A/B/C/All" |

- [x] Manual SQL (user, locallocal; prod via `npm run copy:prod`): `CREATE TABLE
  bk_tpip_pipelinelog AS SELECT * FROM tpip_pipelinelog;` → `DROP TABLE tpip_pipelinelog;` →
  recreate with column order `pip_pipid, pip_run_id, pip_step, pip_batch, pip_sub_step,
  pip_sub_sub, pip_step_name, pip_input_table, pip_input_recs, pip_output_table, pip_output_recs,
  pip_duration_ms, pip_created, pip_to_date`; `pip_batch smallint DEFAULT 0 NOT NULL`,
  `pip_sub_step` **nullable** → `INSERT … SELECT` explicit column lists (old rows get `pip_batch`
  via the default) → `setval('tpip_pipelinelog_pip_pipid_seq', MAX(pip_pipid))`. Then `DROP TABLE
  bk_tpip_pipelinelog`. Update `scripts/schema.sql`.
- [x] `logPipelineStep()` (`pipelineLog.ts`) — optional `batch?: number` → `pip_batch`; an omitted
  `batch` defaults to **1** (not 0); `sub_step` becomes optional (NULL when omitted). Header
  comment updated for the "always ≥ 1, 0 = legacy only" model.
- [x] `src/app/api/build/scrape-akbc-day/route.ts` — `?slot=` → `?batch=` (default 1); log with
  `batch`, no `sub_step`.
- [x] `src/app/api/build/scrape-tracked-batch/route.ts` — `?batch=` now 1-indexed; log with
  `batch`, no `sub_step`.
- [x] `scrapeTrackedPlayerSessions` — `sliceClause` `OFFSET (batch - 1) * TRACKED_SCRAPE_BATCH_SIZE`;
  per-player `logPipelineStep({ batch, sub_sub: '01'.. })` (no `sub_step`); the un-batched manual
  path (`batch == null`) → `pip_batch` 0, still writes its summary row.
- [x] `stats.ts` — extract `rebuildPlayerStats()` + `rebuildPartnerStats()` from the two existing
  group loops in `rebuildAllStats()`; `rebuildAllStats()` now just calls both (signature + return
  shape unchanged — still used by `/api/build/stats` and `cron/update-sessions`). Both keep
  `sub_step: 'a'..'d'`, `batch` omitted (→ 1). Drop the now-unused `PLAYER_SUB_STEP` /
  `PARTNER_SUB_STEP` duplication in favour of one `GROUP_SUB_STEP` map (matches
  `players/recalculate/route.ts`). Header comment updated.
- [x] New `src/app/api/build/stats-player/route.ts` — `cronStart`/`cronEnd`/`cronFail` with
  `ROUTE = 'build/stats-player'`, calls `rebuildPlayerStats()`. GET + POST.
- [x] New `src/app/api/build/stats-partner/route.ts` — same shape, `ROUTE = 'build/stats-partner'`,
  calls `rebuildPartnerStats()`.
- [x] `pipelineLog.ts` `startPipelineRun` / `partners` route / `cron/update-sessions` route — drop
  `sub_step: 'a'` (→ NULL); `batch` omitted (→ 1 via the new default).
- [x] `vercel.json` — AKBC `?batch=1` / `?batch=2`, Tracked `?batch=1`…`?batch=6` (keep the
  `&to_date=&fetch_timeout_ms=` placeholders). Replace the single `/api/build/stats` entry
  (`20 15 * * *`) with `/api/build/stats-player` (`20 15 * * *`) + `/api/build/stats-partner`
  (`25 15 * * *`) → **12 crons**.
- [x] `getPipelineRunStatus` `DISTINCT ON` + `ORDER BY` → `(pip_step, pip_batch, pip_sub_step,
  pip_sub_sub)`; `PipelineStatus` type gains `pip_batch: number`, `pip_sub_step` → `string | null`.
- [x] `PipelineTable.tsx` `JobsTable` / `SINGLE_ROW_STEPS` / the `pip_sub_step === 'a'` finds —
  rework: steps 0 & 3 match on `pip_sub_step === null && pip_sub_sub === null` (no `pip_batch === 0`
  test — batch is always ≥ 1 now); steps 1 & 2 group by `pip_batch`; steps 4 & 5 group by
  `pip_sub_step`. "Sub" column shows `batch N` or the group letter. `CRON_JOBS` map gains
  `/api/build/stats-player` + `/api/build/stats-partner` entries; drop `/api/build/stats`.
- [x] `.claude/CLAUDE.md` Cron section — the `pip_batch` model + 1-indexed batches + nullable
  `pip_sub_step`.
- [x] `npx tsc --noEmit` + `npm run build` clean.

### Phase 14 — Overview: all summaries first, then all pipeline tables — DONE 2026-08-31 (code, `#code`)

**Problem (user, 2026-08-31).** On the Overview tab `renderPanel(scope)` renders each scope's
`<PipelineSummary>` immediately followed by its `<StepTable>`, so the tab reads
summary→pipeline→summary→pipeline→summary→pipeline. The user wants all three summaries stacked
first, then all three pipeline tables.

**Design (agreed 2026-08-31).** Split `renderPanel(scope)` into `renderScopeSummary(scope)` +
`renderScopeSteps(scope)`. `renderPanel` (used by the AKBC / Tracked / Finish single-scope tabs)
= both, unchanged order. Overview instead composes them separately:
`renderScopeSummary('akbc') renderScopeSummary('tracked') renderScopeSummary('finish')` then
`renderScopeSteps('akbc') renderScopeSteps('tracked') renderScopeSteps('finish')`. Three separate
`<PipelineSummary>` boxes are kept (each with its own run-id picker) — not merged into one.

- [x] `PipelineTable.tsx` — split `renderPanel` into `renderScopeSummary` + `renderScopeSteps`
  (`renderPanel` = both in order, for the single-scope tabs). Overview `activeTab === 'overview'`
  block: the three summaries, then the three step tables.
- [x] `npx tsc --noEmit` + `npm run build` clean.

### Phase 15 — Collapsible pipeline panels via `MyBox collapsible` — DONE 2026-08-31 (code, `#code`)

**Problem (user, 2026-08-31).** Each panel on `/owner/pipeline` should be individually
hide/show-able. There is no collapsible `My*` component in the installed `nextjs-shared@2.1.63`,
**but a newer version already has one** — the chess project (`nextjs-shared@2.1.84`,
`/analyze` route → `ChessBoardView_shared`) uses `<MyBox title='…' collapsible>` throughout. Mirror
that: no local hand-rolled toggle, no `nextjs-shared` change needed beyond a version bump.

**`MyBox` (v2.1.84+) API:** `collapsible?: boolean` (needs `title` present to show the toggle),
`defaultOpen?: boolean` (default `true`), `toggleButtonClass?`, `chevronClass?`. When
`collapsible && title`, it renders `<button><h3>{title}</h3><ChevronDownIcon/></button>` then
`{isOpen && children}` — the toggle replaces the static `<h3>`. `ChevronDownIcon` comes from
`@heroicons/react/24/outline`, already a direct dep of next-bridge (`@heroicons/react@2.2.0`).

**Granularity (agreed):** each box independently — the 3 Summary boxes + the 3 Pipeline step
tables on Overview each get their own toggle (6 total).

- [x] **User ran `#reinstall`** — `nextjs-shared` `2.1.63` → `2.1.84` (commit `f4f1fafe`);
  `node_modules/nextjs-shared/src/components/MyBox.tsx` has the `collapsible` prop. This surfaced
  a 2.1.63→2.1.84 breaking change (every `table_*` fn now returns `TableResult<T>`) → migrated in
  `PLAN_nextjs-shared-tableresult-migration.md` (done 2026-08-31).
- [x] `PipelineSummary` — added `title: string` prop; `<MyBox>` → `<MyBox title={title}
  collapsible>`; dropped the internal `<h3>Summary</h3>` (the run-id `<MySelect>` + `↻` stay as the
  first children, hidden with the rest when collapsed).
- [x] `StepTable` — added `title: string` prop; `<MyBox>` → `<MyBox title={title} collapsible>`;
  dropped the internal `<h3>Pipeline</h3>`; the `headerExtra` flex row now renders only when
  `headerExtra` is set.
- [x] `renderScopeSummary(scope)` / `renderScopeSteps(scope)` — pass
  `title={\`${SCOPE_LABEL[scope]} — Summary\`}` / `… — Pipeline`. New module const `SCOPE_LABEL`
  (akbc → `AKBC`, tracked → `Tracked Players`, finish → `Finish`). Applies on the Overview and the
  single-scope tabs.
- [x] `npx tsc --noEmit` + `npm run build` clean (after the `TableResult` migration landed).

## Changes

### Phase 4 — pipeline logging severity 'I' → 'P' (visible on prod)
- `src/app/api/cron/update-sessions/route.ts` — `log()` helper default severity `'I'` → `'P'`;
  comment updated to explain (prod suppresses `'I'` via `NEXT_PUBLIC_APPENV_LOG_I=false`; `'P'`
  is not suppressed). Catch still `'E'`.
- `src/app/api/build/{scrape,scrape-tracked,stats,start-run,partners,sessions-nzb,results-nzb}/route.ts`
  — success-path `write_logging` `lg_severity: 'I'` → `'P'`. Catch-path `'E'` unchanged. `cleanup`
  route left `'I'` (manual admin route, not a scheduled cron).

### Phase 6 — pipelineToDate localStorage persistence
- `src/ui/admin/PipelineTable.tsx` — new module const `PIPELINE_TO_DATE_STORAGE_KEY =
  'pipeline_to_date'`; a mount `useEffect` restores `pipelineToDate` from `localStorage` (guarded
  try/catch); a `useEffect` on `pipelineToDate` writes it back, removing the key when cleared.

### Phase 7 — many short self-contained scrape cron jobs

- `src/lib/constants.ts` — added `TRACKED_SCRAPE_BATCH_SIZE = 5`; **removed** `SCRAPE_TIME_BUDGET_MS`.
- `src/lib/actions/pipelineLog.ts` — `startPipelineRun(toDate?, truncateStaging = false)`; when
  `truncateStaging`, truncates `ts1_sessions` + `ts2_results` (via `table_truncate`) before the
  step-0 marker row. `logPipelineStep` already writes `pip_to_date` from its `to_date?` arg.
- `src/lib/actions/cronTrace.ts` (new) — `cronStart(route, params)` / `cronEnd(route, summary)` /
  `cronFail(route, err)`, writing `START … / END OK … / END ERROR …` to `xlg_logging` at severity
  `'P'` / `'P'` / `'E'`. Header tagged `// PHASE7-TRACE`.
- `src/lib/actions/pipelineScrape.ts`
  - New `persistSessionsFromPage(rowsByRunId, toDate?)` — refactored out of `scrapeRunId`; loops
    every run_id on a parsed page, upserts the `ts1_sessions` header + inserts its `ts2_results`
    pairs, deletes the ts1 header for a pairless run_id, skips a run_id dated past `toDate`.
    `scrapeRunId(run_id, fetchTimeoutMs?, toDate?)` now just fetches its `?run_id=` page and calls
    it with a one-entry map.
  - `scrapeRunIds` — **removed** the `deadline` param + the `Date.now() > deadline` loop break +
    the `timed_out` result field. `ScrapeSessionsResult` lost `timed_out`.
  - New `addOneDay(iso)` + `getNextScrapeDay()` — `MAX(se_date) + 1` (fallback-lookback + 1 when
    empty), returns `null` when that day is in the future.
  - New `scrapeAkbcDay(day, fetchTimeoutMs?)` — one club/date search fetch → `parsePage` →
    `persistSessionsFromPage`; returns `{ run_ids, pairs_total, players_created }`.
  - `scrapeClubSessions` — dropped `timeBudgetMs` / `deadline` / `timed_out` / the loop break;
    keeps its own `ts1`/`ts2` truncate for the manual catch-up path.
  - `scrapeTrackedPlayerSessions(toDateOverride?, fetchTimeoutMs?, batch?)` — **removed**
    `timeBudgetMs` (param order changed). `batch != null` → `LIMIT/OFFSET` slice on the `flagged`
    query and `pip_sub_step` = `String(batch)`; per-player `sub_sub` = **local**
    `String(i + 1).padStart(2, '0')`; the `pip_sub_step 'a'` summary row is written only when
    `batch == null`.
  - New `trace(where, msg)` helper — `phase7` detail lines at severity `'P'`, tagged `// PHASE7-TRACE`.
- `src/lib/actions/buildSteps.ts` — `buildSessionsFromStaging` / `buildResultsFromStaging` gain a
  trailing `skipLog = false` arg; when `true`, the `pip_sub_step 'b'` / `'c'` `logPipelineStep`
  call is skipped (so a split cron logs only its own combined row).
- `src/lib/actions/stats.ts` — `PARTNER_SUB_STEP` map now `A/B/C/all → a/b/c/d` (was `e/f/g/h`);
  the partner loop logs `step: 5` (was `step: 4`), `step_name` `Partner Stats — Group …`.
- `src/app/api/build/scrape-akbc-day/route.ts` (new) — `maxDuration = 300`, cron auth,
  `?slot=` (default 0), `?fetch_timeout_ms=`. `cronStart` → `getNextScrapeDay()` (future → `cronEnd`
  no-op) → `resolvePipRunId(1, false)` → `scrapeAkbcDay` → `buildSessionsFromStaging` /
  `buildResultsFromStaging` (`skipLog`) scoped to `day` → one `logPipelineStep` (`step 1`,
  `sub_step` = slot, `step_name` = `Scrape AKBC <day>`) → `cronEnd` / `cronFail`.
- `src/app/api/build/scrape-tracked-batch/route.ts` (new) — `maxDuration = 300`, cron auth,
  `?batch=` (default 0), `?fetch_timeout_ms=`. `cronStart` → `resolvePipRunId(2, false)` →
  `scrapeTrackedPlayerSessions(undefined, undefined, batch)` → tracked `buildSessionsFromStaging` /
  `buildResultsFromStaging` (`skipLog`) → one `logPipelineStep` (`step 2`, `sub_step` = batch,
  `step_name` = `Tracked batch <N>`) → `cronEnd` / `cronFail`.
- `src/app/api/build/start-run/route.ts` — now `cronStart` → `startPipelineRun(toDate, true)` →
  `cronEnd` / `cronFail`; `?to_date=` param.
- `src/app/api/build/{scrape,scrape-tracked}/route.ts` — dropped `time_budget_ms` param; call the
  time-budget-free scrape functions; `params()` returns `[…, fetch_timeout_ms]`; `maxDuration = 300`.
- `src/app/api/build/{partners,stats}/route.ts` — wrapped in `cronStart` / `cronEnd` / `cronFail`
  (replacing their ad-hoc `write_logging`); `stats` gets `maxDuration = 300`.
- `src/app/api/cron/update-sessions/route.ts` — dropped `timeBudgetMs` / `time_budget_ms` /
  `timed_out`; still calls `startPipelineRun(toDate)` first; `log()` default `'P'`.
- `vercel.json` — 11 cron entries: `start-run` (`50 12`), `scrape-akbc-day?slot=0/1` (`5 13` /
  `35 13`), `scrape-tracked-batch?batch=0..5` (`0 14`–`50 14`), `partners` (`10 15`), `stats`
  (`20 15`).
- `src/ui/owner/ConstantsPage.tsx` — removed `SCRAPE_TIME_BUDGET_MS` entry; added
  `TRACKED_SCRAPE_BATCH_SIZE` entry.
- `src/ui/admin/PipelineTable.tsx`
  - Removed `SCRAPE_TIME_BUDGET_MS` import, the `cronTimeBudgetSec` state, the `time_budget_ms`
    param in `handleRunFullCron`, and the "Time budget (s)" input (kept "Fetch timeout (s)").
  - `STEP_LABELS` — `4: 'Player Stats'`, added `5: 'Partner Stats'`. Replaced the hardcoded
    `STEP_SUBSTEPS` map with a `SINGLE_ROW_STEPS = new Set([0, 3])`.
  - `JobsTable` reworked data-driven: `SINGLE_ROW_STEPS` render one bold line; every other step
    renders a header + one row per `pip_sub_step` present in the run (ordered, label from
    `pip_step_name`), with a `▶` toggle (keyed `"<step>-<sub>"`) expanding any sub-step's
    `pip_sub_sub` children. Shared `dataCells()` helper for the 8 value cells.
  - `OverviewSummary` `JobsTable steps` `[0,1,2,3,4]` → `[0,1,2,3,4,5]`; Finish-tab
    `PipelineJobsSummary steps` `[3,4]` → `[3,4,5]`.
- `.claude/CLAUDE.md` — Cron section rewritten to the one-run_id / 11-cron / `cronTrace` model.
- `scripts/schema.sql` — `pip_to_date date` added to `tpip_pipelinelog` (already, earlier phase).

### Phase 8 — nzbridge club number on clubs + sessions

**Schema SQL (user runs manually on locallocal, then prod; not executed by Claude).**

`tcl_clubs` is rebuilt: `cl_clid` dropped, `cl_club` becomes the PK, `cl_nzb` added as
column 1.

```sql
-- ── tcl_clubs: rebuild without cl_clid, cl_club as PK ────────────────────────
-- 1. data-only backup
CREATE TABLE bk_tcl_clubs AS SELECT * FROM tcl_clubs;

-- 2. drop original (also drops its owned sequence + constraints)
DROP TABLE tcl_clubs;

-- 3. recreate: cl_nzb first (UNIQUE), cl_club (PK) second — no surrogate id
CREATE TABLE tcl_clubs (
    cl_nzb  integer,
    cl_club character varying(100) NOT NULL,
    CONSTRAINT tcl_clubs_pkey PRIMARY KEY (cl_club),
    CONSTRAINT tcl_clubs_cl_nzb_key UNIQUE (cl_nzb)
);

-- 4. copy the names back
INSERT INTO tcl_clubs (cl_club)
SELECT cl_club FROM bk_tcl_clubs;

-- 5. seed AKBC (the one-off cl_nzb VALUES backfill also sets this; harmless either way)
UPDATE tcl_clubs SET cl_nzb = 106 WHERE cl_club = 'Remuera Bowls & Bridge Inc';

-- 6. once verified:  DROP TABLE bk_tcl_clubs;

-- ── tse_sessions: carry the number onto each session (append is fine) ─────────
ALTER TABLE tse_sessions ADD COLUMN se_club_nzb integer;

-- ── ts1_sessions: drop the dead column (never populated) ─────────────────────
-- take a CopyTable backup of ts1_sessions first
ALTER TABLE ts1_sessions DROP COLUMN s1_club_id;
```

`populateClubs` already inserts with an explicit `(cl_club)` list and `ON CONFLICT (cl_club)`
(still valid — PK is a unique constraint); every other reader is name-based; nothing referenced
`cl_clid`. So dropping it breaks no caller.

**One-off `cl_nzb` backfill (user runs).** Source of truth = the `<select name="mp_filter_club">`
option list scraped live from a `results.html` page (124 clubs, every one has a real number —
`Australia=820`, `NZ Youth=801`, `Overseas not AU=819`, `2020 Waiheke=173`, etc., which the
directory-page table the user first pasted was missing). One
`UPDATE tcl_clubs t SET cl_nzb = v.nzb FROM (VALUES (name, nzb), …) v WHERE
LOWER(BTRIM(t.cl_club)) = LOWER(BTRIM(v.name))`. On local this resolves every `tcl_clubs` row
except `Archive` (internal dead-player pseudo-club → sentinel `cl_nzb = 999`) and `Wanganui`
(renamed → `Whanganui`; set `cl_nzb = 348`). Full VALUES list is in this session's chat
transcript.

**One-off `se_club_nzb` backfill (user runs after `cl_nzb`):**

```sql
UPDATE tse_sessions s
SET    se_club_nzb = c.cl_nzb
FROM   tcl_clubs c
WHERE  LOWER(BTRIM(s.se_club)) = LOWER(BTRIM(c.cl_club))
  AND  c.cl_nzb IS NOT NULL;

SELECT DISTINCT se_club FROM tse_sessions WHERE se_club_nzb IS NULL ORDER BY se_club;
```

- `scripts/schema.sql` — `tcl_clubs` CREATE rewritten: `cl_nzb integer` + `cl_club` (PK), no
  `cl_clid`, no identity/sequence. `se_club_nzb integer` added to `tse_sessions` (after
  `se_is_summary`). `s1_club_id` removed from `ts1_sessions`.
- `scripts/02_import_prod.ps1` — removed the `setval('tcl_clubs_cl_clid_seq', …)` line.
- `lib/create_prod_tables.sql` (stale, unreferenced) — `tcl_clubs` → `cl_nzb` + `cl_club` PK;
  `tse_sessions` gains `se_club_nzb`. Left otherwise as-is.
- `src/lib/actions/buildSteps.ts` — `buildSessionsFromStaging` insert wrapped in a `WITH src`
  CTE that computes the `'Auckland'`-fixed `club_name` once; the `SELECT` adds `se_club_nzb` via
  `(SELECT c.cl_nzb FROM tcl_clubs c WHERE c.cl_club = src.club_name)` (exact match). `RETURNING`
  extended to `se_seid, se_club, se_club_nzb`; after the insert, one `write_logging('W')` per
  distinct just-built club that resolved to NULL (`import { write_logging }` added). Header
  comment updated.
- `src/lib/actions/pipelineScrape.ts` —
  - `getMaxSessionDate(scope: 'akbc' | 'tracked')`: adds `WHERE se_club_nzb = $1` /
    `WHERE se_club_nzb IS DISTINCT FROM $1` (`$1 = BRIDGE_CLUB_ID`). `getDateRange` /
    `getScrapeFromDate` / `getNextScrapeDay` call it with `'akbc'`.
  - `parsePage` — `club: get(colClub)` → `get(colClub).replace(/\s+/g, ' ')` so a scraped club
    name has no internal whitespace, matching how player names are normalised; keeps the
    build-time exact match robust.

### Phase 9 — "Run All Cron" drives `vercel.json`'s `crons`

- `vercel.json` — `start-run` path → `?to_date=`; each `scrape-akbc-day?slot=N` and
  `scrape-tracked-batch?batch=N` path → `&to_date=&fetch_timeout_ms=` (all empty). `partners` /
  `stats` unchanged. Order preserved (= execution order).
- `src/app/api/build/start-run/route.ts` — `toDateParam` now `|| undefined` (empty `?to_date=`
  reads as no cap).
- `src/app/api/build/scrape-akbc-day/route.ts` — `run(slot, toDate?, fetchTimeoutMs?)`; a
  `params()` helper parses `[slot, to_date, fetch_timeout_ms]` (`|| undefined` on the latter
  two); `getNextScrapeDay(toDate)` + `scrapeAkbcDay(day, fetchTimeoutMs)`; `cronStart` logs the
  extra params.
- `src/app/api/build/scrape-tracked-batch/route.ts` — same `params()` shape; forwards
  `to_date` + `fetch_timeout_ms` into `scrapeTrackedPlayerSessions(toDate, fetchTimeoutMs, batch)`.
- `src/lib/actions/pipelineScrape.ts` — `getNextScrapeDay(toDate?)`: `cap = toDate && toDate <
  today ? toDate : today`, returns `null` (trace "past cap, nothing to scrape") when `next > cap`.
- `src/ui/admin/PipelineTable.tsx`
  - `import vercelConfig from '@/vercel.json'`; module-level `CRON_JOBS` (from `vercelConfig.crons`,
    file order, `{ path, key, label }`) + `fillCronParams(path, toDate, fetchTimeoutSec)` —
    substitutes non-empty Overview values into existing `to_date=` / `fetch_timeout_ms=`
    placeholders only.
  - `handleRunFullCron` rewritten: loop `CRON_JOBS`, `setRunning('full-cron')`, per job POST
    `fillCronParams(...)` → store `{data|error}` under `job.key` → `refreshKey++`, continue on
    error; `cronProgress` state → "running `<label>` (n/N)" in the run-in-progress strip;
    `finally` clears state + `doRefreshAll()`.
  - Overview error area: `results['full-cron']` line replaced by a per-failed-cron-job list keyed
    off `CRON_JOBS`.
  - New `cronProgress` state. `/api/cron/update-sessions` no longer referenced by the component.
- `.claude/CLAUDE.md` — Cron section notes the empty `to_date=` / `fetch_timeout_ms=` placeholders
  in every `vercel.json` cron path and that **Run All Cron** now iterates that array;
  `update-sessions` re-labelled "no longer wired to any button".

### Phase 10 — AKBC / Tracked MAX(se_date) on the Overview
- `src/lib/actions/pipelineScrape.ts` — `getPipelineMaxDates()` → `{ akbc, tracked }`
  (`getMaxSessionDate('akbc')` + `('tracked')`).
- `src/ui/admin/PipelineTable.tsx` — `maxDates` state; loaded in `doRefreshAll`, re-polled in the
  full-cron poll; rendered on the Overview under "Fetch timeout".

### Phase 12 — PipelineTable.tsx component consolidation
- `src/ui/admin/PipelineTable.tsx`
  - `OverviewSummary` + `PipelineJobsSummary` → one `PipelineSummary({ refreshKey, steps })`
    (both deleted; `JobsTable` unchanged).
  - New `dashCell()` (the shared em-dash `<td>`), `StepRow` (one runner row), `StepTable` (the
    `MyBox` + "Pipeline" heading + the single `<thead>` with Refresh / Run All; `headerExtra`
    slot for AKBC's From date).
  - `akbcRows()` / `trackedRows()` / `finishRows()` closure helpers → the scope's `<StepRow>`
    list (all `<MyHelpStep>` prose kept verbatim). `renderPanel(scope)` = `PipelineSummary` +
    `StepTable`; AKBC summary steps `[0,1]`, Tracked `[2]`, Finish `[3,4,5]`.
  - `finishRows()` — the stale single `4. Update Stats` + 8 flat `STATS_SUB_ROWS` split into
    `4. Player Stats` + rows `4a`–`4d` and `5. Partner Stats` + rows `5a`–`5d`, matching the
    summary and the DB (Phase 7/8). Both `4.`/`5.` Run buttons call `/api/build/stats` (the one
    route rebuilds both); the `4a`–`5d` rows still re-run a single group via
    `/api/players/recalculate`. `StepRow.run` made optional (unused here but a header-only row is
    now possible).
  - `JobsTable` — new dedicated **Sub** column (after Step): single-row steps show `a`; sub-rows
    show `pip_sub_step` (`0`/`1`, `a`–`d`) next to the ▶ toggle, with the step number in Step;
    per-player child rows show `<pip_sub_step>·<pip_sub_sub>` (e.g. `0·01`). 10 → 11 columns.
  - `return()` — AKBC / Tracked / Finish tabs = `renderPanel(scope)`; Overview = controls +
    max-dates + progress strip + the three panels stacked. ~440 lines of bespoke tab JSX removed.
  - Manual Run buttons still call the legacy standalone routes (`/api/build/scrape`, `sessions-nzb`,
    `results-nzb`, `scrape-tracked`) — the per-step tool runs sub-steps individually with a From
    date, which the Phase-7 split routes can't express. Header comment + two stale comments updated.
  - Net: `PipelineTable.tsx` ~1560 → ~1120 lines.

### Phase 13 — `pip_batch` column + stats-cron split
**DB / schema**
- User (local done; prod via `npm run copy:prod`) — `tpip_pipelinelog` backed up, dropped,
  recreated with `pip_batch smallint DEFAULT 0 NOT NULL` in position 4 (after `pip_step`, before
  `pip_sub_step`) and `pip_sub_step` made **nullable**; old rows copied back (get `pip_batch 0`
  via the default); sequence re-`setval`'d; `bk_tpip_pipelinelog` dropped.
- `scripts/schema.sql` — `tpip_pipelinelog` CREATE updated: `pip_batch smallint DEFAULT 0 NOT NULL`
  after `pip_step`; `pip_sub_step character varying(1)` (dropped `NOT NULL`).

**`src/lib/actions/pipelineLog.ts`**
- `PipelineStatus` — added `pip_batch: number`; `pip_sub_step: string` → `string | null`.
- `logPipelineStep` — new optional `batch?: number` → `pip_batch`; **an omitted `batch` defaults
  to `1`** (not 0). `sub_step` now optional → `pip_sub_step` NULL when omitted. Header comment
  rewritten: batch always ≥ 1 in new rows, `0` = pre-Phase-13 legacy only; `sub_step` only where
  it names a real sub-step aligned with `step_name` (stats groups).
- `startPipelineRun` — step-0 log drops `sub_step: 'a'` (→ NULL), no `batch` (→ 1).
- `getPipelineRunStatus` — `DISTINCT ON` + `ORDER BY` → `(pip_step, pip_batch, pip_sub_step,
  pip_sub_sub)`.

**Scrape cron routes**
- `src/app/api/build/scrape-akbc-day/route.ts` — `?slot=0/1` → `?batch=1/2` (`run(batch, …)`,
  `params()` clamps to `≥ 1` default 1); `logPipelineStep({ step: 1, batch, … })`, no `sub_step`;
  `cronStart`/`cronEnd`/skip payload all say `batch`.
- `src/app/api/build/scrape-tracked-batch/route.ts` — `?batch=` now 1-indexed (`params()` clamps
  `≥ 1` default 1); `logPipelineStep({ step: 2, batch, … })`, no `sub_step`.
- `src/lib/actions/pipelineScrape.ts` `scrapeTrackedPlayerSessions` — `sliceClause`
  `OFFSET (batch - 1) * TRACKED_SCRAPE_BATCH_SIZE`; per-player log `batch: batch ?? 1`, no
  `sub_step`; un-batched manual summary row unchanged (→ `pip_batch 1` via the default). Header
  comment updated. `scrapeClubSessions` legacy multi-day summary keeps its `sub_step: 'a'` (+
  buildSteps `'b'`/`'c'`) — that manual path is unchanged.

**Stats split**
- `src/lib/actions/stats.ts` — `rebuildAllStats()` split into `rebuildPlayerStats()` (step 4,
  `ta1_player_stats`) + `rebuildPartnerStats()` (step 5, `ta2_partner_stats`), each with its own
  `resolvePipRunId` and group loop; `rebuildAllStats()` now just calls both and merges the result
  (signature + return shape unchanged — still used by `/api/build/stats` and
  `cron/update-sessions`). New `RebuildPlayerStatsResult` / `RebuildPartnerStatsResult` types.
  `PLAYER_SUB_STEP` + `PARTNER_SUB_STEP` (identical) collapsed to one `GROUP_SUB_STEP`. Unified
  numbered header + change-history entry.
- `src/app/api/build/stats-player/route.ts` — **new**. `ROUTE = 'build/stats-player'`,
  `cronStart`/`cronEnd`/`cronFail`, calls `rebuildPlayerStats()`. GET + POST, `maxDuration = 300`.
- `src/app/api/build/stats-partner/route.ts` — **new**. Same shape,
  `ROUTE = 'build/stats-partner'`, calls `rebuildPartnerStats()`.
- `src/app/api/build/stats/route.ts` — unchanged (combined `rebuildAllStats()`, manual full-run
  path, no longer scheduled).

**`partners` / `update-sessions` routes**
- `src/app/api/build/partners/route.ts` — step-3 `logPipelineStep` already dropped `sub_step: 'a'`
  in the base pass; now also gets `pip_batch 1` via the new default (no code change).
- `src/app/api/cron/update-sessions/route.ts` — step-3 log dropped `sub_step: 'a'`; still calls
  `rebuildAllStats()`.

**`vercel.json`**
- AKBC `?slot=0/1` → `?batch=1/2`; Tracked `?batch=0..5` → `?batch=1..6`.
- The single `{ "/api/build/stats", "20 15" }` → `{ "/api/build/stats-player", "20 15" }` +
  `{ "/api/build/stats-partner", "25 15" }`. **11 → 12 crons.**

**`src/ui/admin/PipelineTable.tsx`**
- `JobsTable` single-row steps (0, 3) — match dropped the `pip_batch === 0` test (batch is always
  ≥ 1); now `pip_sub_step === null && pip_sub_sub === null`.
- `CRON_JOBS` is `vercelConfig.crons.map(...)` so it picks up `stats-player` / `stats-partner`
  automatically; the `slot` handling was already removed in the base pass.
- `handleStats` → split into `handlePlayerStats` (`/api/build/stats-player`, key `stats-player`) +
  `handlePartnerStats` (`/api/build/stats-partner`, key `stats-partner`); shared
  `fanGroupsToSubRows()` helper for the 4a–4d / 5a–5d result cells. `runFinishPipeline` now awaits
  both in turn. `finishRows()` reads `results['stats-player']` / `results['stats-partner']`; step 4
  Run button → `handlePlayerStats`, step 5 → `handlePartnerStats`; the two `MyHelpStep`
  `processing=` texts rewritten (each route does one step now).

**`.claude/CLAUDE.md`**
- Pipeline overview list + Cron section rewritten for the `pip_batch` (always ≥ 1) model, nullable
  `pip_sub_step`, 12 crons, and the `stats-player` / `stats-partner` split.

### Phase 14 — Overview: summaries first, then step tables
- `src/ui/admin/PipelineTable.tsx` — `renderPanel(scope)` split into `renderScopeSummary(scope)`
  (`<PipelineSummary steps>`) + `renderScopeSteps(scope)` (`<StepTable>` + the scope's runner
  rows). `renderPanel` now just calls both in order — the AKBC / Tracked / Finish single-scope
  tabs are unchanged. The Overview block renders `renderScopeSummary('akbc'/'tracked'/'finish')`
  (three summary boxes) then `renderScopeSteps('akbc'/'tracked'/'finish')` (three step tables),
  instead of three interleaved `renderPanel` calls.

### Phase 15 — Collapsible pipeline panels
- `package.json` / `package-lock.json` — `nextjs-shared` bumped (user, `npm update nextjs-shared`)
  to the version with `MyBox` `collapsible` / `defaultOpen` support (chess already on 2.1.84).
- `src/ui/admin/PipelineTable.tsx`
  - New module const `SCOPE_LABEL` (`akbc` → `AKBC`, `tracked` → `Tracked Players`,
    `finish` → `Finish`).
  - `PipelineSummary` — new required `title: string`; `<MyBox>` → `<MyBox title={title}
    collapsible>`; removed the internal `<h3>Summary</h3>` (run-id picker + `↻` are now children,
    collapsed with the JobsTable).
  - `StepTable` — new required `title: string`; `<MyBox>` → `<MyBox title={title} collapsible>`;
    removed the internal `<h3>Pipeline</h3>`; the `headerExtra` flex row renders only when
    `headerExtra` is passed (was always rendered, just to hold the heading).
  - `renderScopeSummary` / `renderScopeSteps` pass `"<label> — Summary"` / `"<label> — Pipeline"`.
    Each of the 6 Overview boxes (and the 2 on each single-scope tab) is now an independently
    collapsible `MyBox`, open by default.

## Testing
- [ ] `npx tsc --noEmit` + `npm run build` clean (done).
- [ ] Set the shared **To date** on `/owner/pipeline`, reload the page — it comes back pre-filled.
      Clear it, reload — it stays empty.
- [ ] From `npm run locallocal`, run a step (e.g. **Start Run** or **Run All Cron**) and check
      `xlg_logging` (or `/owner` Logging tab) shows the success line at severity **`P`** (not `I`).
- [ ] Post-deploy on prod: after a scheduled cron, `xlg_logging` gets fresh `P` rows from
      `cron/update-sessions` / `build/*` (confirms prod logging is alive; makes the `E` error path
      trustworthy).

### Phase 7 — self-contained scrape cron jobs (verify with `npm run locallocal`, then localprod)
- [ ] `npx tsc --noEmit` + `npm run build` clean (done; `/api/build/scrape-akbc-day` and
      `scrape-tracked-batch` register).
- [ ] `POST /api/build/start-run` — creates a new `pip_run_id`, truncates `ts1_sessions` /
      `ts2_results`, writes the step-0 row (`pip_sub_step 'a'`). `xlg_logging` has a `START
      build/start-run` + `END OK build/start-run` pair at severity `P`.
- [ ] `POST /api/build/scrape-akbc-day?slot=0` (with local `MAX(se_date)` a day or two back) —
      reuses the current run_id (no new one, no truncate), scrapes `MAX(se_date)+1` in one fetch,
      Build Sessions / Build Results run for that day, and one `pip_step 1` row lands with
      `pip_sub_step 0`, `pip_step_name = Scrape AKBC <date>`. `/owner/pipeline` Overview shows it
      under **AKBC** with no separate b/c sub-rows.
- [ ] `POST …?slot=1` — `MAX(se_date)` has advanced, so it does the next day; logs `pip_sub_step
      1`. When caught up it returns `{ skipped: "future" }` and still logs `START`/`END OK`.
- [ ] `POST /api/build/scrape-tracked-batch?batch=0` then `?batch=1` — each reuses the day's
      run_id; the Overview **Tracked Players** step shows a `Tracked batch 0` / `Tracked batch 1`
      row, each with a `▶` that expands 5 per-player child rows (`pip_sub_sub 01–05` for both
      batches — local index); Build Sessions / Results run per batch.
- [ ] `POST /api/build/partners` then `/api/build/stats` — `partners` logs `pip_step 3 'a'`;
      `stats` logs `pip_step 4 a–d` (Player Stats) **and** `pip_step 5 a–d` (Partner Stats). All
      four surface on the Overview / Finish tabs under **Player Stats** / **Partner Stats**.
- [ ] Run the full sequence via the Overview **Run All Cron** button — the Jobs summary renders
      steps 0–5 with the right sub-rows and the run-in-progress strip still updates.
- [ ] Delete-and-re-add test: back up + snapshot a normal built day (e.g. 3 sessions), delete
      its `tre_results` then `tse_sessions` (leave `tpa_partners`), then `start-run` + `POST
      /api/build/scrape-akbc-day?slot=0` and confirm the day's rows come back matching the
      snapshot; run `/api/build/stats` and confirm `ta1`/`ta2` return to prior values.
- [ ] Existing `/api/build/scrape`, `sessions-nzb`, `results-nzb`, `scrape-tracked`,
      `/api/cron/update-sessions` still work unchanged (regression) — no `time_budget_ms` needed,
      no `timed_out` in the response.
- [ ] `/owner/constants` lists `TRACKED_SCRAPE_BATCH_SIZE` and no longer lists
      `SCRAPE_TIME_BUDGET_MS`.
- [ ] After the prod deploy: `vercel.json` shows the 11 crons; over a day, `tpip_pipelinelog`
      gets one shared `pip_run_id` with rows across steps 0–5, `MAX(se_date)` advances, and
      `xlg_logging` has `START`/`END OK` pairs per cron.

### Phase 8 — nzb club number on clubs + sessions (verify on `npm run locallocal`)
- [ ] `npx tsc --noEmit` + `npm run build` clean (done).
- [ ] Schema on local: `\d tcl_clubs` shows `cl_nzb`, `cl_club` (PK), **no** `cl_clid`;
      `\d tse_sessions` shows `se_club_nzb`; `\d ts1_sessions` has **no** `s1_club_id`.
- [ ] Run the one-off `cl_nzb` `UPDATE … FROM (VALUES …)` (from the live `<select>` list) plus the
      `Archive = 999` / `Wanganui = 348` lines — `SELECT cl_club FROM tcl_clubs WHERE cl_nzb IS
      NULL` returns **nothing**. `SELECT cl_nzb FROM tcl_clubs WHERE cl_club = 'Remuera Bowls &
      Bridge Inc'` = 106.
- [ ] Run the `se_club_nzb` backfill `UPDATE` — every AKBC session
      (`se_club = 'Remuera Bowls & Bridge Inc'`) now has `se_club_nzb = 106`; the "still NULL"
      report lists only non-AKBC clubs with no `tcl_clubs` row.
- [ ] `SELECT MAX(se_date) FROM tse_sessions` vs. `… WHERE se_club_nzb = 106` — with a recent
      non-AKBC session present, the AKBC-filtered max is **earlier**, i.e. the AKBC-only cutoff.
- [ ] `POST /api/build/scrape-akbc-day?slot=0` — `getNextScrapeDay()` now advances off the
      **AKBC-only** `MAX(se_date)` (a non-AKBC tracked session dated later no longer blocks it).
- [ ] Build a fresh AKBC day (Scrape AKBC → Build Sessions): the new `tse_sessions` rows have
      `se_club_nzb = 106` filled automatically by `buildSessionsFromStaging` (exact `cl_club`
      match).
- [ ] Force an unmatched club (temporarily rename a `tcl_clubs` row, or build a `Kawerau`
      session) — `buildSessionsFromStaging` writes a `'W'` `xlg_logging` row naming the club and
      `se_club_nzb` stays NULL; not a silent miss.
- [ ] `/owner` club filter dropdown (Players / Home / Rankings) still loads and filters — the
      `tcl_clubs` rebuild didn't break `getAllClubs` / `ClubSelect`.
- [ ] `npm run copy:prod` (overwrite prod from local) — confirm it carries schema + data, so prod
      ends up with the `tcl_clubs` rebuild, `se_club_nzb`, the `cl_nzb` UNIQUE constraint and all
      backfilled values. Then a `SELECT` on prod: `se_club_nzb IS NULL` count matches local (only
      Kawerau/Taranaki, both sentinel-mapped → 0), `MAX(se_date) WHERE se_club_nzb = 106` is the
      AKBC cutoff.

### Phase 9 — "Run All Cron" drives `vercel.json` (verify on `npm run locallocal`)
- [ ] `npx tsc --noEmit` + `npm run build` clean (done).
- [ ] `/owner/pipeline` → **Run All Cron** with **both** Overview fields empty: it fires all 11
      routes in `vercel.json` order (`start-run` → `scrape-akbc-day` ×2 → `scrape-tracked-batch`
      ×6 → `partners` → `stats`). The run-in-progress strip shows "running `<label>` (n/N)"
      stepping 1→11; the Jobs summary fills steps 0–5 like a real prod day; `xlg_logging` shows a
      `START`/`END OK` pair per route.
- [ ] Network tab: each POST URL is the literal `vercel.json` path (e.g.
      `/api/build/scrape-akbc-day?slot=0&to_date=&fetch_timeout_ms=`) — empty params, unchanged.
- [ ] Set **To date** to a past day, **Run All Cron** again: the POSTs now carry
      `&to_date=<that day>`; `scrape-akbc-day` logs a "past cap" no-op once `MAX(se_date)+1`
      exceeds it; `start-run`'s step-0 row shows that `pip_to_date`.
- [ ] Set **Fetch timeout (s)** to e.g. `5`, **Run All Cron**: the two scrape routes' POSTs carry
      `&fetch_timeout_ms=5000`; `start-run` / `partners` / `stats` URLs are unchanged.
- [ ] Temporarily break one route (e.g. rename `scrape-tracked-batch` folder), **Run All Cron**:
      that job shows a red error line in the Overview, the loop **continues** through the
      remaining jobs, `partners` / `stats` still run.
- [ ] `git grep update-sessions src/ui` — `PipelineTable.tsx` no longer references it; the route
      still exists for the `CRON_SECRET` curl path.

### Phase 10 — max dates on Overview
- [ ] `/owner/pipeline` Overview shows `MAX(se_date) — AKBC (106): <date>   Tracked: <date>` and
      they match the manual `SELECT MAX(se_date) … WHERE se_club_nzb = 106` / `… IS DISTINCT FROM 106`.
- [ ] The two dates update after a Run All Cron.

### Phase 12 — component consolidation (verify on `npm run locallocal`)
- [ ] `npx tsc --noEmit` + `npm run build` clean (done).
- [ ] Each of the AKBC / Tracked / Finish tabs shows: the **Summary** box (run-id picker + the
      same JobsTable) then the **Pipeline** step table — identical column layout on all three.
- [ ] Overview = the Start Run / Run All Cron controls + max-dates + progress strip, then the
      AKBC, Tracked and Finish panels **stacked** (each with its own Summary + Pipeline table).
- [ ] AKBC tab still has the "From" date input in the Pipeline header; Tracked / Finish don't.
- [ ] Per-step **Run** buttons work on every tab; the ↻ **Refresh** cells update the Remaining
      counts; each tab's **Run All** sequences its steps; the Finish tab's 8 stats sub-rows each
      run individually and show their row count.
- [ ] `grep -c "table_query\|<thead>" ` on the file — one `<thead>` for JobsTable, one for
      StepTable; no third.

### Phase 13 — `pip_batch` column + stats-cron split (verify on `npm run locallocal`)
- [x] `npx tsc --noEmit` + `npm run build` clean; `/api/build/stats-player` and
      `/api/build/stats-partner` both register in the build route list.
- [ ] `\d tpip_pipelinelog` on local — `pip_batch smallint NOT NULL DEFAULT 0` sits between
      `pip_step` and `pip_sub_step`; `pip_sub_step` is nullable. Existing rows still there.
- [ ] `POST /api/build/start-run` — step-0 row has `pip_batch = 1`, `pip_sub_step` NULL,
      `pip_sub_sub` NULL. `/owner/pipeline` Overview / Jobs summary still shows it as one bold
      "Start Run" line (the `pip_batch === 0` match removal didn't hide it).
- [ ] `POST /api/build/scrape-akbc-day?batch=1` then `?batch=2` — each logs `pip_step 1` with
      `pip_batch` 1 / 2, `pip_sub_step` NULL. Jobs "Sub" column shows `batch 1` / `batch 2`. A
      bare `POST …/scrape-akbc-day` (no `batch`) defaults to `batch 1`.
- [ ] `POST /api/build/scrape-tracked-batch?batch=1` then `?batch=2` — `pip_step 2` rows with
      `pip_batch` 1 / 2, `pip_sub_step` NULL; `▶` expands 5 per-player children with
      `pip_sub_sub 01`–`05` and the same `pip_batch`. The `OFFSET (batch-1)*5` slice means
      `batch=1` is players 1–5, `batch=2` is 6–10.
- [ ] `POST /api/build/partners` — `pip_step 3`, `pip_batch 1`, `pip_sub_step` NULL; shows as one
      bold "Build Partners" line.
- [ ] `POST /api/build/stats-player` — logs **only** `pip_step 4` `pip_sub_step a`–`d`
      (`pip_batch 1`); response `{ player_rows, groups }` with only `player-*` keys. No `pip_step 5`
      rows written.
- [ ] `POST /api/build/stats-partner` — logs **only** `pip_step 5` `pip_sub_step a`–`d`
      (`pip_batch 1`); response `{ partner_rows, groups }` with only `partner-*` keys.
- [ ] `/owner/pipeline` Finish tab — step **4. Player Stats** Run button hits
      `/api/build/stats-player` and fills the 4a–4d row counts; step **5. Partner Stats** Run
      button hits `/api/build/stats-partner` and fills 5a–5d; the two run independently (running
      one doesn't flip the other's row to "active"). The Finish tab **Run All** runs partners →
      player stats → partner stats in order.
- [ ] `POST /api/build/stats` (combined, still there) — logs step 4 a–d **and** step 5 a–d in one
      call; `/api/players/recalculate?mode=player_grp&grp=A` still logs a single `pip_step 4`
      `pip_sub_step a` row.
- [ ] `/owner/pipeline` → **Run All Cron** with both Overview fields empty — iterates the **12**
      `vercel.json` entries in order: `start-run` → `scrape-akbc-day` ×2 → `scrape-tracked-batch`
      ×6 → `partners` → `stats-player` → `stats-partner`. The progress strip steps 1→12; the Jobs
      summary fills steps 0–5 with the right Sub values (`batch 1/2`, `batch 1..6`, `a`–`d`).
- [ ] `git grep "'stats'" src/ui/admin/PipelineTable.tsx` — no stale combined-stats key; only
      `stats-player` / `stats-partner`.
- [ ] After `npm run copy:prod`: prod `\d tpip_pipelinelog` matches local (batch column, nullable
      sub_step); `vercel.json` on the deploy shows 12 crons; over a prod day `tpip_pipelinelog`
      gets one `pip_run_id` with `pip_batch ≥ 1` on every new row.

### Phase 14 — Overview layout (verify on `npm run locallocal`)
- [x] `npx tsc --noEmit` + `npm run build` clean.
- [ ] `/owner/pipeline` **Overview** tab — the three Summary boxes (AKBC steps 0/1, Tracked step 2,
      Finish steps 3/4/5) stack together at the top, then the three Pipeline step tables stack
      below them. No summary sits between two step tables.
- [ ] The **AKBC**, **Tracked**, **Finish** single-scope tabs are unchanged — each still shows its
      own Summary box directly above its own Pipeline table.
- [ ] Each Overview Summary still has its own working run-id picker; the AKBC step table still has
      the "From" date input in its header.

### Phase 15 — collapsible panels (verify on `npm run locallocal`)
- [x] `#reinstall` run; `nextjs-shared` 2.1.84; `MyBox.tsx` has the `collapsible` prop.
- [x] `npx tsc --noEmit` + `npm run build` clean (the two `<MyBox … collapsible>` errors are gone;
      the `TableResult` migration is also clean).
- [ ] `/owner/pipeline` **Overview** — 6 boxes, each with a title (`AKBC — Summary`,
      `AKBC — Pipeline`, `Tracked Players — Summary`, …) and a chevron; clicking the title
      collapses/expands just that box, others unaffected. All open on load.
- [ ] Collapsing a Summary hides its run-id picker + JobsTable; collapsing a Pipeline hides its
      From-date row (AKBC) + the step table. Expanding restores them with state intact.
- [ ] **AKBC / Tracked / Finish** single-scope tabs — the 2 boxes there are titled + collapsible
      too; the AKBC "From" date input still shows when that Pipeline box is open.
- [ ] Per-step Run / Refresh / Run All still work after a collapse-expand cycle.
