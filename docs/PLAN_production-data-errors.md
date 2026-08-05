# PLAN_production-data-errors — next-bridge

## Title
production data errors

## Plan

### 1. Cron not populating although running
- [ ] User checks Vercel dashboard Cron/Function logs for `/api/build/scrape` (14:00 UTC daily)
      and `/api/build/scrape-tracked` (15:00 UTC daily) covering 2026-07-24 onward, to confirm
      whether the daily failure is a 401 (CRON_SECRET mismatch), a timeout, or an unhandled crash
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
- [ ] Confirmed baseline (prod query): zero sessions are currently classified as `XIMP` (or the
      `UNK` sentinel) anywhere in `ts1_sessions` or `tse_sessions`, going all the way back to the
      earliest data (2024-01-02) — every historical session is currently `MP` or `VP` only. XIMP
      support already exists going forward in the scraper (`parseScore()` in `pipelineScrape.ts`
      recognizes `XIMP`/`XIMPS` suffixes, and `SCORING_TYPES` in `constants.ts` already lists it),
      so this is specifically about *historical* sessions scraped before that support existed —
      any of them that were actually XIMP-scored on nzbridge.co.nz would have been captured as the
      wrong type (or possibly not captured at all)
- [ ] Design discussion needed before any implementation (not yet decided): how to identify which
      historical run_ids were actually XIMP-scored without re-scraping everything (currently
      14,000+ sessions), whether re-scraping the full historical range is acceptable, and how
      correcting an already-built session's scoring type should ripple through `tse_sessions`,
      `tre_results`, and the dependent `ta1`/`ta2` stats tables

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
