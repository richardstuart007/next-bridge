# PLAN_production-data-errors — next-bridge

## Title
production data errors

## Plan

### 1. Cron not populating although running
- [ ] **Blocked, 2026-08-05**: user checked and the Vercel dashboard only retains Cron/Function log
      history for the last 12 hours on the current (non-paid) plan — anything covering 2026-07-24
      onward is no longer available without upgrading. Direct log confirmation of the 401 vs.
      timeout vs. crash question is therefore not practically available going forward. Not yet
      decided whether to (a) treat the existing indirect evidence (below) as sufficient to move
      straight to a fix, (b) trigger a live diagnostic run (`vercel crons run /api/build/scrape`)
      for fresh, current evidence, or (c) accept the gap and monitor only the next 12h window after
      any future fix attempt
- [ ] ~~User checks Vercel dashboard Cron/Function logs for `/api/build/scrape` (14:00 UTC daily)
      and `/api/build/scrape-tracked` (15:00 UTC daily) covering 2026-07-24 onward, to confirm
      whether the daily failure is a 401 (CRON_SECRET mismatch), a timeout, or an unhandled crash~~
      — neither route has logged a completion row (success or error) since 2026-07-25 ~22:25 UTC,
      and the Sessions list confirms no session newer than 2026-07-24 has been scraped since.
      Leading theory (not yet confirmed): a serverless function timeout, not the CRON_SECRET —
      the cron is confirmed firing, the code is identical between local and prod (so a plain code
      bug would show up locally too), and neither route has a `maxDuration` override anywhere
      (confirmed via grep), so both default to Vercel's plan timeout. Both
      `scrapeTrackedPlayerSessions` (27 flagged players on prod) and `scrapeClubSessions` do fully
      sequential, unbatched `fetch` calls (one per player/day, plus one per newly-found run_id)
      with several awaited DB writes each — no concurrency at all. This is also self-reinforcing:
      `scrapeClubSessions`'s date range starts at `MAX(se_date)` from `tse_sessions`, which hasn't
      advanced since 7/24 (because Build Sessions has had nothing new to build), so the range grows
      by a day and gains more un-scraped sessions every time it runs and fails — a run that might
      have finished fine on day 1 has no chance on day 9+. `localprod` can't reproduce this even
      against the same prod DB, since a local `next dev` process has no execution time limit —
      consistent with "same code, only fails in prod". Further evidence gathered via Vercel CLI
      (already authenticated locally as richardstuart007, project `rs7-bridge` — note: this is the
      actual Vercel project name; local `.vercel/project.json` still caches the old name
      `next-bridge`):
      - `CRON_SECRET` **is** set in the Production environment (`vercel env ls production`,
        present 80 days) — Vercel's own cron dispatcher sends this automatically on every
        scheduled invocation, so a 401/CRON_SECRET mismatch is now considered unlikely, not just
        "doubted"
      - `vercel crons ls` confirms all 8 cron entries are registered correctly, matching
        `vercel.json`
      - The Vercel team is `richardstuart007's projects` (the auto-created personal/default team
        name), which is consistent with — though not 100% confirmed as — the Hobby plan. Hobby's
        *default* serverless function timeout is 10 seconds unless a route explicitly sets
        `export const maxDuration`, which neither scrape route does. A 10s default is extremely
        tight for a fully sequential loop of external `fetch` calls to nzbridge.co.nz plus DB
        writes — plausibly marginal even on a single normal day's backlog, not just today's
        9-day compounded one
      - Confirmed via `vercel ls --prod`: production has redeployed at least twice since the
        outage started (2026-07-27 and 2026-07-31) and the scrape still hasn't produced a single
        completion log since 7/25 — rules out "a bad deploy is stuck," since fresh deploys didn't
        fix it, consistent with a persistent design issue (timeout) rather than a one-off bad build
      - Raw Vercel request logs only retain the last few minutes on this plan (confirmed by
        querying `--since 2h` and `--since 7d` and getting identical, very-recent-only results) —
        too short to see historical evidence of the 7/24-25 failures directly. The **Cron Jobs**
        tab in the dashboard (a separate, longer-retained data source from raw logs) is the
        remaining way to see historical status for these two routes
      - Not attempted: actually triggering `vercel crons run /api/build/scrape` right now would
        give direct, conclusive evidence (real invocation, real timing) instead of inference — but
        this is a real production write (truncates `ts1_sessions`/`ts2_results` and scrapes live
        data), so it wasn't run without the user's explicit go-ahead. Worth considering as a
        deliberate diagnostic step, not something to trigger silently
- [ ] Based on the Vercel log findings, agree on and implement a fix for the scrape pipeline going
      silent (candidates to discuss once cause is known: `maxDuration` override, batching/limiting
      per-run scrape work, fixing `CRON_SECRET` config — not yet decided). If it is a timeout, the
      fix also needs to cope with the backlog that's built up over the outage — the first catch-up
      run may need to be chunked by date range rather than run all at once
- [ ] Correct the stale "Production DB migration pending" note under Outstanding items in
      `.claude/CLAUDE.md` — confirmed via direct prod query that `tre_results` already has
      `re_score` (not the old `re_percentage`/`re_vp` columns), so that migration is already done
- [ ] Separate, real hazard worth fixing regardless of today's root cause: `scrapeClubSessions()`
      unconditionally truncates `ts1_sessions` and `ts2_results` at the very start of every run,
      before doing anything else — safe only if it's guaranteed to be the first step of one clean
      sequential run. It no longer is: these 8 pipeline steps are now independently-scheduled
      Vercel crons with fixed 20-minute time offsets (`vercel.json`), relying entirely on wall-clock
      timing to stay in order. Vercel's cron invocation times are best-effort, not guaranteed — a
      delayed or reordered firing could truncate staging data that same-day build steps haven't
      consumed yet. Not believed to be today's cause (a race would still let the scrape function
      finish and log its own completion row most of the time; we see zero completion rows in
      either direction for 9 straight days, which fits "never finishes" better than "finishes at
      the wrong time" — see the timeout theory above), but worth an explicit fix once confirmed
      either way (candidates: don't unconditionally truncate every run, or otherwise make the
      per-step routes safe to run out of order — not yet decided)

### 2. Data not showing against a player
- [ ] User checks **localprod specifically** (local server pointed at the prod DB) whether Aaron
      Starr's Player History shows results there — if it does, that narrows the bug to something
      prod-environment-specific rather than a shared query/data bug. Note: a `/owner/cache`
      screenshot was checked against the plain **local database** (confirmed by the user, not
      localprod) and showed his results query returning 855 rows fine there — informative (local DB
      apparently has similar-scale data and the query itself is fine against it too) but doesn't
      resolve this step, since it's a different database from prod. Still need the localprod-against-
      prod-DB check specifically
- [ ] Investigate further based on that result. Current lead from prod-only investigation so far
      (not yet confirmed as root cause): `ta1_player_stats` shows 406 MP / 347 VP sessions for
      Aaron (plid 17199), and running the exact SQL from `/api/players/[id]/results/route.ts`
      directly against prod returns 854 rows for his plid — so the underlying data and query are
      both correct when run directly. That route's `table_query` call never passes
      `skipCache: true`, and `nextjs-shared`'s `table_query` cache has no expiry and nothing
      invalidates it when the underlying table is later written to (confirmed in
      `node_modules/nextjs-shared/src/tables/tableGeneric/table_query.ts` and
      `cache/userCache_store.ts`) — so if this player's results page was ever loaded before his
      `tre_results` rows existed, the empty result could be cached forever until a server restart
      or a manual `/owner/cache` clear
- [ ] Agree on and implement a fix once root cause is confirmed (candidates: user clears
      `/owner/cache` on prod as an immediate workaround; add `skipCache: true` to this one route
      since a player's own history must always reflect live data; or, separately and out of scope
      for this project, propose write-triggered cache invalidation to `nextjs-shared` — not yet
      decided)

### 3. Navigating Home from Owner is slow in prod (fast locally) — separate issue, next up
- [x] **Priority: work on this one first**, independently of items 1/2/4 — confirmed root cause,
      unrelated to the cron outage or the caching investigation
- [x] **Root cause confirmed** by the user directly from the local `/owner/cache` panel: pagination
      on the Home page (`HomePageClient.tsx`) is client-side only. The underlying queries —
      `admin/players` (11,170 rows) and `getSessionsByYear` (14,316 rows) — load the *entire* table
      every single time regardless of how many rows are actually displayed per page; pagination
      just slices the already-fully-loaded array in the browser. This means the full table is
      queried and the full JSON payload is sent over the network on every Home page visit,
      independent of caching. Locally this crosses loopback and is imperceptible; over a real
      network connection to prod, transferring 11k+ and 14k+ row payloads repeatedly is inherently
      slow — this alone explains "fast locally, slow in prod" without needing the
      serverless-cache-coldness theory (which may still be a secondary factor, but isn't required
      to explain what's observed)
- [x] A `/pagination` skill was created (`~/.claude/skills/pagination/SKILL.md`) to operationalize
      the correct pattern going forward — see `docs/PLAN_pagination-skill.md` for that work
- [x] **Correction, 2026-08-03**: a UI-only change already landed on disk for Players/Sessions
      (`RowsPerPageSelect` + separate `MyPagination` replaced with `nextjs-shared/MyPaginationFooter`,
      confirmed via `git diff`) — this is **not** the real fix. `filteredPlayers`/`sessions` are
      still full client-side arrays, and the page count is still computed client-side from the full
      array length. The actual bug (full-table load) remains open
- [x] Scope agreed with user: implement the **real fix across all three list views** — Players and
      Sessions (Home page) and Rankings (both its Players and Partnerships tabs), which has the
      identical anti-pattern (`/api/rankings` returns 7,588 player rows and 4,495 partnership rows
      unfiltered every time, confirmed via `/owner/cache`) plus no pagination UI at all currently
- [x] Implement real server-side pagination — per-route plan (checked `nextjs-shared`'s
      `fetchFiltered`/`fetchTotalPages` against each route's actual query shape before deciding):
      - **`getSessionsByYear`/Sessions tab** — reasonable fit for `fetchFiltered`/`fetchTotalPages`
        (already a plain `SELECT * FROM tse_sessions`). Filters (date range, day-of-week `IN`,
        scoring, session name `LIKE`, club `IN`, event type `IN`, summary) map onto `Filter[]`
        reasonably well; the one exception is the tournament-type filter, currently derived from
        `se_tournament`'s last character client-side — needs either a `LIKE` pattern per selected
        letter or moving that derivation server-side
      - **`/api/admin/players`/Players tab** — does **not** fit `fetchFiltered` as-is: it
        `LEFT JOIN`s an aggregating subquery (`SELECT a1_plid, SUM(...), MAX(...) ... GROUP BY
        a1_plid`) and aliases columns, but `fetchFiltered` only supports `SELECT *` plus plain
        `{table, on}` joins, no subqueries/aggregation. Per `nextjs-shared`'s own documented
        fallback rule ("too complex for the generic helpers → `table_query`"), implement this one
        directly: explicit `LIMIT`/`OFFSET` params plus a companion `SELECT COUNT(*)` query for the
        total page count — same real-pagination outcome, without forcing an ill-fitting helper
      - **`/api/rankings` (players + partnerships)** — same situation as admin/players: multi-join
        with compound `ON` conditions plus column aliasing, doesn't fit `fetchFiltered`'s shape.
        Same approach: raw `table_query` with explicit `LIMIT`/`OFFSET` + a companion `COUNT(*)`
        query, for both the players and partnerships queries
      - All three routes: add `page`/`itemsPerPage` (and per-tab filter) query params; each route
        returns both the current page's rows and a total-page-count (or total-row-count) value
      - Client side (`HomePageClient.tsx`, `RankingsPageClient.tsx`): move existing client-side
        filters to become request params instead of filtering an already-loaded array; only ever
        fetch the current page; Rankings needs a pagination UI added (`nextjs-shared/
        MyPaginationFooter`) since it currently has none
- [x] Note: item 2's theory (cache staleness) and item 3's original cache-coldness theory pulled in
      opposite directions — now resolved, since item 3 has a simpler, directly-confirmed cause that
      doesn't depend on cache behavior at all. Item 2's caching theory stands on its own and still
      needs the localprod-against-prod-DB check above to confirm

### 4. Historical XIMP data needs to be picked up
- [x] Confirmed baseline (prod query): zero sessions are currently classified as `XIMP` (or the
      `UNK` sentinel) anywhere in `ts1_sessions` or `tse_sessions`, going all the way back to the
      earliest data (2024-01-02) — every historical session is currently `MP` or `VP` only. XIMP
      support already exists going forward in the scraper (`parseScore()` in `pipelineScrape.ts`
      recognizes `XIMP`/`XIMPS` suffixes, and `SCORING_TYPES` in `constants.ts` already lists it),
      so this is specifically about *historical* sessions scraped before that support existed —
      any of them that were actually XIMP-scored on nzbridge.co.nz would have been captured as the
      wrong type (or possibly not captured at all)
- [x] **Design question resolved via direct investigation (local DB + git history), 2026-08-05.**
      `git log -S"XIMP"` on `pipelineScrape.ts` shows the pre-fix `parseScore()` (commit
      `1b5f52e`'s parent) matched only `/^([\d.]+)\s*(PCT|VP)$/i` and returned `null` for anything
      else — including an `XIMP`/`XIMPS` suffix. In `parsePage()`, `if (!score) return` means that
      row was dropped **before** ever being added to `rowsByRunId`, so `scrapeRunId()` saw
      `rows.length === 0` for that run_id and never wrote a `ts1_sessions` header row at all. This
      is confirmed as "never captured", not "captured as the wrong type" — there is no trace of a
      dropped XIMP run_id anywhere in the DB to correct; it's a missing row, not a wrong one. That
      resolves the "how does correcting an already-built session ripple through `tre_results`/
      `ta1`/`ta2`" question from below — it doesn't apply, since nothing was ever built for these
      run_ids in the first place
- [x] **Also discovered while investigating: this has already partially self-healed in local.**
      Local `tse_sessions` currently has 19 `XIMP` rows (`se_scoring = 'XIMP'`), all dated *before*
      the `parseScore()` fix landed (Feb 25 / Mar 4 / Mar 11 / Mar 18 / Jul 3 / Jul 9 2026 — the fix
      landed 2026-07-31). Reason: `scrapeTrackedPlayerSessions()` (pipeline step "Scrape Tracked
      Players") has no date bound — it re-fetches each of the 27 tracked players' **entire** match
      history every run. `batchCheckMissing()` only excludes run_ids already present in
      `ts1_sessions`/`tse_sessions`; since a dropped XIMP run_id was never recorded anywhere, it
      stayed "missing" indefinitely and got picked up automatically the next time this step ran
      after the fix — no special backfill code needed for this path
- [x] **Coverage analysis**: the other scrape path, `scrapeClubSessions()` (pipeline step "Scrape
      AKBC"), is scoped to a single hardcoded club (`BRIDGE_CLUB_ID = 106`, confirmed = **Tokoroa**
      via `tcl_clubs`) and only scans forward from `MAX(se_date)` in `tse_sessions` by default — it
      will **not** auto-backfill historical Tokoroa-only sessions the way the tracked-player step
      does. However `/api/build/scrape` (the route wrapping it) already accepts `from_date`/
      `to_date` query params (confirmed in `route.ts`), so a manual call with a historical range
      (e.g. `from_date=2024-01-02&to_date=2026-07-30`) would re-scan Tokoroa's date-search pages
      the same way and pick up any dropped XIMP run_ids there too — no new code needed, just an
      explicit historical-range invocation. The vast majority of clubs seen in `tse_sessions`
      (East Coast Bays, Mt Albert, Christchurch, Wellington, etc.) are captured incidentally via
      tracked-player *opponents*, not via the Tokoroa club scrape, so the tracked-player re-run is
      expected to cover most of the gap on its own
- [x] **Correction, 2026-08-05**: the "just re-run Scrape Tracked Players" conclusion above was
      wrong — verified by live-fetching `online-points.html?mpsr=1&mp_user=X` for 3 real tracked
      players. That endpoint (used by both `scrapeTrackedPlayerSessions()` and
      `scrape/discover/nzb-by-flagged`) is capped to a rolling **~12-month window**, not a
      player's full history — Aaron Starr's page only went back to 6 Aug 2025, Ant Hopkins to
      8 Aug 2025, Ashley Bach to 11 Oct 2025. The 19 local XIMP sessions found earlier (Feb–Jul
      2026) happened to fall inside that window; anything older will never surface through this
      path no matter how many times it's re-run. Neither existing scrape mechanism
      (tracked-player, ~12-month window; club-scoped `scrapeClubSessions`/Tokoroa-only) can reach
      the full 2024-01-02 range
- [x] **New capability confirmed**: `results.html?date_start=X&date_end=X&mp_results=Search` with
      `mp_filter_club` **omitted entirely** returns nationwide results for that day (verified live
      for 2025-03-04 — 5 events across 4 different clubs: Auckland, Tauranga, New Plymouth,
      United), not scoped to any single club. No pagination markers found; row count for that day
      matched exactly the sum of each event's full pairs list, consistent with one complete page
      per day. This is the mechanism needed to reach genuinely historical dates for XIMP, since it
      isn't scoped to a player's rolling window or a single club
- [x] **Design agreed with user, 2026-08-05**: a one-off script (not committed app code, run
      locally by the user — matches how the user wants scrape operations triggered, per their
      earlier "I prefer to run it from the pipeline" note in this same session), scoped to
      **XIMP-only** capture (not a general missing-session backfill — non-XIMP historical data is
      already confirmed correctly captured, so broadening scope would be unbounded extra work for
      no confirmed bug). For each day from **2024-01-02 to 2026-07-30** (day before the
      `parseScore` fix landed): fetch the nationwide date search (no club filter), scan score
      cells for an `XIMP`/`XIMPS` suffix; skip the day entirely if none found (no DB writes); for
      any hit, run the matching run_id(s) through the same `scrapeRunId()`-equivalent logic
      (already XIMP-aware) to write `ts1_sessions`/`ts2_results` for real. Script lives in the
      scratchpad directory, not the repo, since standalone Node scripts can't import
      `nextjs-shared`'s `'use server'` table functions — logic is inlined against `pg` directly
      (same pattern as this session's earlier investigation scripts)
- [x] **Testability added per user request**: date range is a CLI arg (`--from=`/`--to=`), default
      is a small 2-week test window (2024-06-01 to 2024-06-14) rather than the full range, so
      correctness can be checked on a small sample before committing to the full ~940-day sweep.
      Each captured hit logs the involved player names, so a tracked player can be spotted directly
      in the output and cross-checked against their `/player/[id]` page afterward
- [x] Script written: `ximp_backfill.mjs` at the project root (untracked, not committed — delete
      after use). Not run by Claude, per the user's earlier stated preference to trigger scrape
      operations themselves
- [x] **Run completed, 2026-08-05 (local), executed by Claude per explicit user authorization to
      run unattended.** Test range (2024-06-01–2024-06-14, 14 days) came back clean: no errors, 0
      XIMP hits (a valid result). Full range (2024-01-02–2026-07-30, 941 days) then run in the
      background: **13 days had an XIMP hit, 28 run_ids newly captured (517 pairs), 11 already-
      known run_ids correctly skipped** (idempotency check against `ts1_sessions`/`tse_sessions`
      worked as designed — no duplicates). Full log: `ximp_backfill_full.log` (project root,
      untracked).
- [x] Build Sessions → Build Results → Build Partners → Update Stats run afterward via the same
      API routes `/owner/pipeline`'s buttons call (`/api/build/sessions-nzb`,
      `/api/build/results-nzb`, `/api/build/partners`, `/api/build/stats`), dev server on port
      4040: 28 inserted/29 skipped (sessions), 517 inserted (results), stats rebuilt across all
      groups (`player-all`: 16,053 rows, `partner-all`: 53,109 rows).
- [x] **Verified via direct DB query**: `tse_sessions` XIMP count went from 19 (all dated
      Feb–Jul 2026, inside the previously-known ~12-month window) to **47**, now spanning
      **2024-01-10 to 2026-07-11** — genuinely reaching the historical gap. Spot-checked the
      earliest recovered session (run_id 164822, 2024-01-10, Otago club, 7 pairs) — present in
      `tse_sessions`/`tre_results` with correct row counts, and one of its players (Pip Weber) now
      shows `a1_scoring='XIMP', a1_sessions=9` in `ta1_player_stats` (group `all` and group `C`),
      confirming the stats rebuild picked it up correctly. No duplicate player rows created
      despite heavy name reuse across the newly-captured sessions (spot-checked 4 names, each
      `COUNT(*) = 1` in `tpl_players`). Score values for XIMP sessions are in a sane 0–100-ish
      range, no clamping corruption.
- [x] **Correction**: unlike the earlier assumption, this does not need to be separately repeated
      against prod — user confirmed local will be copied to prod via the existing
      `npm run copy:prod` once this backfill is verified locally, so item 1's cron/timeout
      investigation is no longer a prerequisite for fixing prod's XIMP gap specifically (it's
      still open for the separate "cron stopped populating new sessions" problem)
- [x] `ximp_backfill.mjs` and `ximp_backfill_full.log` are still sitting in the project root,
      untracked (`git status` confirms not staged). Left in place for the user to review — should
      be deleted before any `git add`/commit
- [x] **User asked to continue, 2026-08-05: extend to ALL sessions (not XIMP-only), up to current
      date, in batches.** New script `session_backfill_all.mjs` (project root, untracked) reuses
      the same proven nationwide (no club filter) date-search mechanism, but captures every
      run_id found each day that isn't already in `ts1_sessions`/`tse_sessions`, regardless of
      scoring type — not just XIMP hits. This is a broader operation than the confirmed XIMP bug:
      it will also pick up any other session gap the two narrower existing mechanisms
      (Tokoroa-only club scrape; ~12-month tracked-player window) never could have reached,
      anywhere in NZ, for the full historical range. Run in 5 batches (2024-01-02–2024-06-30,
      2024-07-01–2024-12-31, 2025-01-01–2025-06-30, 2025-07-01–2025-12-31,
      2026-01-01–2026-08-05/today), executed sequentially by Claude per the user's standing
      "continue without prompting" authorization
- [x] **⚠️ Scale finding, flagged prominently — read before `npm run copy:prod`.** This turned out
      far larger than the original XIMP-only fix: batch 1 alone (6 months) found 940 new sessions
      (17,035 pairs) — more than the *entire* 2.5-year XIMP-only sweep found. **Total across all 5
      batches: 6,028 run_ids found nationwide, 3,585 newly captured (61,937 pairs), 2,443
      already-existing correctly skipped.** Root cause of the scale: the app's existing scrape
      mechanisms were never comprehensive — they only ever captured sessions tied to the 27
      tracked players (plus incidental opponents) or the single Tokoroa club. This nationwide
      sweep is a genuine superset covering all of NZ bridge, which the app had never captured
      before at all (not a bug — the app was never designed to be comprehensive; this is a
      deliberate scope expansion the user requested).
- [x] Build Sessions → Build Results → Build Partners → Update Stats run afterward: 3,572
      sessions inserted (57 skipped — already built from the earlier XIMP-only run), 61,905
      results inserted, stats rebuilt (`player-all`: 18,673 rows, `partner-all`: 66,446 rows).
- [x] **Final verification via direct DB query**: `tse_sessions` grew from 14,316 to **17,916**
      rows, now spanning 2024-01-02 to 2026-08-03 (nearly to today). Scoring breakdown: MP 14,445 /
      VP 3,423 / XIMP 48. `tre_results` now 356,208 rows. `tpl_players` grew from ~11,170 to
      **13,117** (+1,947 new players, 2,231 total with `pl_nz_bridge_number = 0` — new players
      created by name-only lookup, as designed). **Distinct clubs in `tse_sessions` jumped from
      ~20 to 119** — concrete confirmation this now covers nationwide NZ bridge activity, not just
      the previously-tracked slice. All numbers cross-check consistently with no errors across
      every batch and every pipeline step.
- [ ] `session_backfill_all.mjs` and `backfill_batch1.log` through `backfill_batch5.log` are
      sitting untracked in the project root alongside `ximp_backfill.mjs`/
      `ximp_backfill_full.log` — all should be reviewed and deleted before any `git add`/commit.
      **Given the scale of this expansion (119 clubs, +3,585 sessions, +1,947 players, all
      previously never captured by this app at all), review the data carefully in `/owner/builddata`
      before running `npm run copy:prod`** — this is a much bigger change to what the app's
      database represents than the original XIMP bug fix was scoped to be

### 6. Regression: `/owner/players` crashes — `players.filter is not a function`
- [x] Root cause confirmed: item 3's pagination rewrite of `/api/admin/players` (this same plan)
      changed its response shape from a bare array to `{ rows, totalPages, totalCount }`, with a
      default `LIMIT ROWS_PER_PAGE`. `HomePageClient.tsx` was updated to match at the time, but
      `PlayersAdmin.tsx` (`/owner/players` — the "manage which players are tracked" admin page)
      was missed — it still does `setPlayers(rows)` on the raw response, so `players` becomes an
      object and `players.filter(...)` at `PlayersAdmin.tsx:61` throws at runtime
- [x] Second issue found while fixing the first: even after unwrapping `.rows`, the route now
      defaults to `ROWS_PER_PAGE` (~20) rows per call — `PlayersAdmin.tsx` needs the *entire*
      player list loaded for its existing client-side name/NZB# search and per-row tracked-toggle
      checkboxes, so a naive unwrap would silently truncate the manageable list to one page
- [x] Also found, not the cause of this crash: `TrackedPlayers.tsx` has the identical broken
      `/api/admin/players` call shape, but it isn't imported/rendered anywhere (confirmed via
      grep) — dead code, left as-is
- [x] **Fix approach agreed**: convert `PlayersAdmin.tsx` to the same real server-side
      search/pagination pattern this plan already applied to `HomePageClient.tsx`/
      `RankingsPageClient.tsx` — debounced `name`/`nz` search sent as request params against the
      existing `/api/admin/players` route (already supports both), paginated results via
      `nextjs-shared/MyPaginationFooter`, instead of loading the full list client-side.
- [x] Implemented and verified (`npx tsc --noEmit` + `npm run build` both pass)

### 5. Rankings tab filter/column misalignment
- [x] Confirmed real bug (not just a style nit) in `RankingsPageClient.tsx`, both tables: per
      `.claude/CLAUDE.md`'s Filters convention ("a filter control must be positioned directly
      above that column's heading"), the players table has **8 filter cells** (Top N, player
      search, `ScoringTypeToggle`, `GroupToggle`, min-sessions, Grade, Club, Tracked) but only
      **7 header columns** (#, Name, Avg%, Sessions, Grade, Club, Tracked) — `GroupToggle` has no
      corresponding column at all, and shifts every filter after it one column out of alignment
      (min-sessions currently sits above "Grade", Grade above "Club", Club above "Tracked", and
      the Tracked checkbox has no column under it at all). The partnerships table has the same
      shape of problem: 6 filter cells vs 5 header columns, same `GroupToggle` culprit
- [ ] Agreed fix approach: `GroupToggle` (and, on reflection, `topN`/`partnerTopN`) don't filter
      any single displayed column's *value* — they're global scope selectors (which stats
      snapshot to read; how many total rows to cap to), not column filters. Per the user's
      instruction, `GroupToggle` moves out of the table header entirely into the existing tab bar
      (shared across both tabs, since group applies to both identically) rather than getting a
      second header row, since it's one shared control rather than several. `ScoringTypeToggle`
      stays column-aligned above Avg%/`{scoringAvgLabel}` since it does change that column's
      displayed value/label — a legitimate 1:1 relationship, not a "no column" case. After
      removing `GroupToggle` from both tables' filter rows, remaining filter cells line up 1:1
      with their header columns in both tables (Top N→#, search→Name, Scoring→Avg%,
      min-sessions→Sessions, Grade→Grade, Club→Club, Tracked→Tracked for players; equivalent for
      partnerships) — not yet implemented, needs `#code`
- [x] Implemented and verified (`npx tsc --noEmit` + `npm run build` both pass)
- [ ] User asked what "Group" means, then asked to rename the label to "Tournament Type" — it's
      derived from the last character of `se_tournament` (A/B, else defaulting to `TOURNAMENT_
      DEFAULT_GROUP` = 'C'), which the Sessions tab's "Type" column already shows (e.g. `5A`,
      `8B`, `40C`), so "Tournament Type" is a more accurate label than the generic "Group". Scope:
      the visible label text next to the toggle in the tab bar only ("Group" → "Tournament Type")
      — not a rename of the underlying `group`/`setGroup`/`Group` type/`GroupToggle` identifiers in
      `RankingsPageClient.tsx`, and not the `a1_group`/`a2_group` DB columns (established schema
      naming, out of scope and not what was asked)
- [x] Implemented — label text changed, no identifier/column renames
- [ ] User flagged that pagination may have broken filters that used to work against the whole
      loaded dataset, specifically "filter by name" on the Rankings Players tab. Confirmed and
      scoped precisely: this affects **only** the Players tab's "Find player…" box — it was never
      a real filter, even before this session's changes, only a highlight/scroll-to-match within
      whatever's currently loaded (`matchesSearch` + `data-highlight` + `scrollIntoView`). That
      worked fine when the whole ~7,588-row dataset loaded at once (a match was always somewhere
      in the DOM); now that only one page loads at a time, a match outside the current page just
      silently fails to highlight. By contrast, Partnerships' search (`partnerSearch`) and Home's
      Players-tab `fName` are both already real server-side filters and are unaffected. Agreed
      fix: convert Players-tab search into a real server-side name filter (matching the pattern
      Partnerships and Home already use), replacing the highlight/scroll-to behavior entirely
      (which can't work correctly under real pagination regardless)
- [x] Implemented and verified (`npx tsc --noEmit` + `npm run build` both pass)

## Changes

### src/lib/constants.ts
- Added `FILTER_DEBOUNCE_MS = 300` — delay before a filter change triggers a paginated re-fetch,
  so typing into a text filter doesn't fire a request per keystroke.
- Updated `ROWS_PER_PAGE`'s comment (no longer "client-side" — now the default page size for
  real server-side pagination too).

### src/lib/actions/sessions.ts
- Added `SessionFilters` type, `SessionListRow` type, `buildSessionFilters()`, and
  `getSessionsPaged(page, itemsPerPage, filters)` — a new server action using `fetchFiltered`/
  `fetchTotalPages` to return only the current page's rows plus total page count. Filters map
  onto `Filter[]`; the tournament-type filter uses `RIGHT(se_tournament, 1)` and the summary
  filter uses `se_is_summary::text` as the "column" expression (both work since `Filter.column`
  is interpolated directly into the generated SQL). Existing `getSessionsByYear` is untouched —
  still used by `BuildDataViewer.tsx`'s per-year (already-bounded) view, out of scope here.

### src/app/api/admin/players/route.ts
- Rewritten: now accepts `name`, `nz`, `ranks`, `grades`, `clubs`, `ratingMin`, `aMin`, `sessMin`,
  `tracked`, `excludeNz0`, `page`, `itemsPerPage` query params (previously only `name`/`club`/
  `grade`, none of which the client actually sent). Query now uses explicit `LIMIT`/`OFFSET` plus
  a companion `COUNT(*)` query sharing the same `WHERE` clause, instead of loading the entire
  `tpl_players` table every time. The rank filter replicates the same normalization CASE
  expression `populateRanks()`/`normalizeRank()` already use elsewhere, so filtering by "No Rank"
  still matches raw `'n/a'`/`'unknown'`/`''` values correctly. Returns `{ rows, totalPages,
  totalCount }`.

### src/app/api/rankings/route.ts
- Rewritten: both the players and partnerships queries now take `LIMIT`/`OFFSET` (derived from
  new `playersPage`/`playersItemsPerPage`/`partnersPage`/`partnersItemsPerPage` params) plus a
  companion `COUNT(*)` query each, instead of returning the entire result set every time (7,588
  and 4,495 rows respectively, confirmed via `/owner/cache`). Added `grades`/`clubs`/`tracked`
  filters for the players query and `partnerSearch`/`partnerTracked` for the partnerships query
  (previously only filtered client-side). A `playersTopN`/`partnersTopN` param preserves the
  existing "Top N" concept — when set, it overrides `itemsPerPage` and forces a single page.
  Returns `{ players, playersTotalPages, playersTotalCount, partnerships, partnersTotalPages,
  partnersTotalCount }`.

### src/ui/home/HomePageClient.tsx
- Players and Sessions tabs no longer fetch the entire table into a client array and
  slice/filter it in memory. Both now fetch only the current page from the server (debounced
  `FILTER_DEBOUNCE_MS` after any filter/page/itemsPerPage change), with all filters sent as
  request params. Removed `filteredPlayers`/`sessions` client-side `useMemo` filtering entirely.
  Pagination footers now gate on the server-reported `totalPages` instead of a client-computed
  array length.

### src/ui/rankings/RankingsPageClient.tsx
- Added real pagination (previously none at all): `playersPage`/`playersItemsPerPage` and
  `partnersPage`/`partnersItemsPerPage` state, wired to `nextjs-shared/MyPaginationFooter` for
  both tabs. Grade/club/tracked (players) and partner-search/tracked (partnerships) filters moved
  from client-side array filtering to server-side request params, debounced the same way as the
  Home page. ~~**Known behavior change**: the player-search typeahead still highlights and
  scrolls to a matching player, but only if that player is on the currently loaded page.~~
  **Resolved below** — this turned out to matter in practice (user-reported) and was fixed by
  converting the Players-tab search into a real filter instead.
- Also noted: both tabs' pagination/filter state changes trigger one combined `/api/rankings`
  fetch (matching the route's existing combined-response shape) — changing a partnerships-only
  filter also re-fetches the (unchanged) players page. A minor inefficiency, not a correctness
  issue; splitting into two independent requests would be a reasonable future optimization if the
  extra round-trip ever matters.
- **Filter/column alignment fix**: `GroupToggle` moved out of both tables' filter rows into the
  shared tab bar (with a small "Group" label, since outside table context the bare A/B/C/All
  buttons needed one), since it applies to both tabs identically and filters no single displayed
  column. Players table filter row is now 7 cells (Top N, search, Scoring, min-sessions, Grade,
  Club, Tracked) matching its 7 header columns exactly; partnerships is now 5 cells (Top N,
  search, Scoring, min-sessions, Tracked) matching its 5 header columns exactly.
- **Label rename**: the tab-bar "Group" label now reads "Tournament Type" — text only, no
  identifier or DB column renamed.
- **Players-tab search converted to a real filter**: removed `matchesSearch`, the `data-highlight`
  attribute, the scroll-into-view effect, and `trimmed` entirely — all dead once the highlight
  approach was retired. `search` is now sent as a `playerSearch` query param
  (`src/app/api/rankings/route.ts` adds `pl_name ILIKE $n` to the players query, same pattern as
  the existing `partnerSearch` handling for partnerships). The "no results" row now shows the
  searched term, matching the partnerships tab's existing wording. Placeholder text changed from
  "Find player…" to "Filter by player…" to match its new actual behavior.

### src/ui/admin/PlayersAdmin.tsx
- Fixed the `players.filter is not a function` crash: `/api/admin/players` now returns
  `{ rows, totalPages, totalCount }` (from item 3's pagination work), not a bare array.
- Converted to real server-side search/pagination, matching `HomePageClient.tsx`'s Players tab:
  the single combined "Search by name or NZB#" box is split into two debounced inputs (`name`,
  `nz`) sent as request params, since the route ANDs its `name`/`nz` filters separately rather
  than OR-matching a single free-text term the way the old client-side filter did. Only the
  current page's rows are fetched (`FILTER_DEBOUNCE_MS` debounce, `ROWS_PER_PAGE` default,
  `nextjs-shared/MyPaginationFooter` for page/rows-per-page controls) instead of loading all
  players into a client array.
- The header's "N tracked" count previously came from `players.filter(p => p.pl_tracked).length`
  over the full in-memory array — no longer possible once only one page is loaded. Replaced with
  a one-time `tracked=true&itemsPerPage=1` fetch on mount (reusing the route's existing
  `totalCount`) adjusted locally by `±1` inside `toggle()`, so the count still reflects the whole
  roster regardless of the current page/filter.
- `TrackedPlayers.tsx` has the identical broken response-shape assumption but is not imported
  anywhere (confirmed via grep) — left untouched, out of scope as dead code.

## Testing
- [ ] Open `/` (Home page) locally, Players tab: confirm the list loads, filters (name, NZ#,
      rank, grade, club, rating/A-points/sessions minimums, tracked-only, exclude-NZ#-0) narrow
      the results, and pagination/rows-per-page work correctly
- [ ] Same page, Sessions tab: confirm date range, day-of-week, tournament type, scoring,
      summary, club, and name filters all narrow the results correctly, and pagination works
- [ ] Open the Rankings tab: confirm Players and Partnerships sub-tabs both show data, the new
      pagination footer works on both, and grade/club/tracked (players) and search/tracked
      (partnerships) filters narrow results correctly. Confirm "Top N" still shows exactly N rows
      with no separate pagination needed
- [ ] Open the browser Network tab while on each of these three lists and confirm the
      request/response size for the rows query scales with the selected rows-per-page, not with
      the total table size (this was the entire point of the fix)
- [ ] Confirm `npx tsc --noEmit` and `npm run build` both pass (already verified during this run)
- [ ] Once deployed, re-check whether navigating Home ↔ Owner in prod is now fast — this was the
      original complaint that started this investigation
- [ ] Rankings tab: confirm "Tournament Type" label reads correctly in the tab bar, and typing a
      player name into the Players-tab "Filter by player…" box (and selecting a suggestion)
      actually narrows the players list to matching names — including for a player who wouldn't
      be on the first page (confirming the original bug report is fixed)
- [ ] On the Rankings tab, confirm every filter now sits directly above the column it filters (Top
      N above #, search above Name/Players, Scoring above Avg%, min-sessions above Sessions, and
      for the players table Grade above Grade / Club above Club) for both the Players and
      Partnerships sub-tables, and confirm the "Group" toggle (now in the tab bar, not either
      table) still correctly switches which group's stats are shown
- [ ] Open `/owner/players` and confirm it no longer crashes — the player list loads, the
      "N tracked · M total" count shows correct numbers, and pagination works
- [ ] On `/owner/players`, type into "Filter by name…" and separately into "Filter by NZB#…" and
      confirm each narrows the list correctly (including for a player who wouldn't be on the
      first page)
- [ ] On `/owner/players`, toggle a player's Track checkbox on and off and confirm the "N tracked"
      count updates immediately and correctly, and the row's highlight (green background) follows
      the checkbox state
