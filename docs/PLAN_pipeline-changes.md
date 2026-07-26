# PLAN_pipeline-changes — next-bridge

## Title
Pipeline changes

## Plan
- [x] Add a new "Overview" tab to `/owner/pipeline`, positioned first (before AKBC / Tracked Players / Finish) — shows just the 3 groups' Jobs Summary panels (AKBC, Tracked Players, Finish) stacked together, with no Run Pipeline tables/buttons on this tab.
  - `PipelineTable.tsx`: extend `Tab` type to `'overview' | 'akbc' | 'tracked' | 'finish'`; add an `{ id: 'overview', label: 'Overview' }` entry at the front of `TABS`.
  - Overview tab content: render all 3 existing `PipelineJobsSummary` instances (`steps={[1]}` AKBC, `steps={[2]}` Tracked Players, `steps={[3, 4]}` Finish) together — reuses the component as-is, no new summary logic needed.
  - Default `activeTab` changes from `'akbc'` to `'overview'`, since it's the new first tab and a natural landing view.
- [x] **Simplify the per-group panel titles** on the AKBC / Tracked Players / Finish tabs, per your decision — the tab itself already identifies the group, so repeating it in the panel heading is redundant.
  - `PipelineJobsSummary`: heading changes from `Pipeline Jobs — {title}` to just `Summary` when rendered on a per-group tab. Add an optional prop (e.g. `showGroupName?: boolean`, default `false`) so the not-yet-built Overview tab (previous plan step) can still request `Pipeline Jobs — {title}`-style labels when it needs to distinguish its 3 stacked summaries — pass `showGroupName` there when that step is implemented.
  - `PipelineTable.tsx`'s 3 Run Pipeline panel headings (`Run Pipeline — AKBC`, `Run Pipeline — Tracked Players`, `Finish Pipeline`) all become just `Pipeline`.
- [x] **All 3 tabs' group-run button just says "Run All"** (drop "(AKBC)"/"(Tracked)"/"Finish Pipeline" suffixes) — the tab already identifies the group, per the same reasoning as the panel-title simplification above. `runningAll === 'akbc' | 'tracked' | 'finish'` state/logic is unchanged, only the button label text changes (still shows "Running…" while active).
- [x] **Add Input Recs to Update Stats' 8 sub-steps**, per your decision (minimal overhead, worth it) — `computePlayerGroupStats(grp)`/`computePartnerGroupStats(grp)` (`statsCompute.ts`) each run one extra `SELECT COUNT(*)` query first, matching the same `WHERE`/`JOIN` shape as the actual upsert (before `GROUP BY`) — i.e. how many `tre_results` rows qualified for that group, before any player/partnership grouping. Both functions' return type changes from `Promise<number>` to `Promise<{ inserted: number; inputRecs: number }>`. `stats.ts`'s `rebuildAllStats()` and `recalculate/route.ts` both pass `inputRecs` as `input_recs` to `logPipelineStep()`. Build Partners' step is NOT changed — confirmed earlier it doesn't read `tre_results` at all (just recounts its own `tpa_partners` output), so `input_table: 'tre_results'` there is dropped (was mislabeled, not just missing a count).
- [x] **Populate the Run Pipeline table's 8 stats sub-rows regardless of how Update Stats was triggered**, per your decision — currently they only show a Processed value if run individually via their own button; running via "Run All"/"Finish Pipeline" leaves them blank even though the data was already computed and is visible in the Jobs Summary. `rebuildAllStats()`'s return type gains a `groups: Record<string, number>` breakdown keyed by the same strings `STATS_SUB_ROWS` already uses (`'player-a'`, `'player-b'`, …, `'partner-all'`). `/api/build/stats` passes this through unchanged. `PipelineTable.tsx`'s `handleStats()` applies each entry from `data.groups` into the corresponding `results[key]` after the aggregate run resolves, so all 8 sub-rows populate at once — same `{ data: { updated } }` shape the individual per-row mode already produces, no other rendering change needed. Their Status badge naturally shows "Completed" once `results[key]?.data` exists, matching every other row's pattern.
- [x] **Add an SQL popover to each of the 8 stats sub-rows** — each `MyHelp` button shows that row's actual query (mirroring `statsCompute.ts` exactly, with the literal group value substituted in place of `$1`, and the `'all'`-group variant omitting the `WHERE ... = $1` clause, matching the real `isAll` branching).
- [x] **Fix stale "Truncates ta1_player_stats..." text** in the Update Stats `MyHelpStep` popover (`PipelineTable.tsx`) — leftover from before the truncate→upsert switch earlier in this project; rewrite to describe the actual current behavior (per-group upsert, no truncate, each group independently re-runnable).
- [x] **Add a "Run All Cron" button to the Overview tab**, wired to `/api/cron/update-sessions` — the existing unscheduled "full pipeline in one shot" fallback route, kept around specifically to imitate the real 8-cron production sequence in a single click, sharing one run# throughout (already guaranteed by the run_id-allocation fix from earlier — only `scrapeClubSessions()` forces a new run_id, everything else in the chain reuses it).
  - **Fix a logging gap found while checking this**: the route calls `buildAllPartnerStats()` directly (the raw counting function from `players.ts`), not the `/api/build/partners` route wrapper that actually has the `logPipelineStep()` call for step 3 — so Build Partners currently never gets logged to `tpip_pipelinelog` when run through this path, unlike when the real Vercel cron hits `/api/build/partners` as its own request. Add the matching `logPipelineStep({ step: 3, sub_step: 'a', step_name: 'Build Partners', ... })` call directly in `update-sessions/route.ts`, same shape as `partners/route.ts`.
  - Add a `POST` handler alongside the existing `GET` (extract the core logic into a shared `run()` function, matching the pattern already used by every other build route) so the UI's existing POST-based `runStep()` helper works against it without any special-casing.
  - `PipelineTable.tsx`: new `handleRunFullCron()` using the existing generic `run('full-cron', '/api/cron/update-sessions', async () => {})` helper (already disables every other button via `anyRunning` while it's in flight). New "Run All Cron" `MyButton` + error display, placed above the 3 Jobs Summary panels on the Overview tab.
- [x] **Give the Overview tab one shared run# instead of 3 independent pickers, and consolidate into a single combined table** — per your decisions, refined over a few iterations: first shared-picker-with-3-panels, then collapsed further into just one panel/one table since it's all one output.
  - Extracted `JobsTable({ steps, runs })` out of `PipelineJobsSummary` — pure presentational (the `<table>` body + its `playersExpanded` toggle), no `MyBox`, no run-id fetching of its own.
  - `PipelineJobsSummary` (still used by the AKBC/Tracked Players/Finish tabs, unaffected) keeps its own self-managed run-id picker, just renders `<JobsTable>` internally instead of the inline table — pure refactor, no behavior change there. Its now-unused `showGroupName`/`title` props removed entirely (only ever needed for the old 3-panel Overview design).
  - New `OverviewSummary({ refreshKey })` — one shared `recentRunIds`/`selectedRunId`/`runs` state, fetched once via `getPipelineRunStatus()` (already returns all 4 steps for one run_id in a single query, so no per-group refetching). Renders the picker once, below "Run All Cron", then a single `<JobsTable steps={[1, 2, 3, 4]} runs={runs} />` — no `MyBox` wrapper, no "Pipeline Jobs" heading, since it's one combined output now.
  - Overview tab's JSX simplified from 3 `<PipelineJobsSummary>` calls to one `<OverviewSummary refreshKey={refreshKey} />`.
- [x] **Fix the "running" button color being weaker than idle, on all 4 "Run All"-style buttons** ("Run All Cron" on Overview, "Run All" on AKBC/Tracked/Finish) — currently idle is `bg-red-500 hover:bg-red-600` (strong) and running swaps to `bg-red-300 hover:bg-red-300` (pale), backwards from what you'd want for a state that needs attention. Change the running state to `bg-red-700 hover:bg-red-700 animate-pulse` (darker + a pulsing animation, both plain Tailwind, no new dependency) on all 4 buttons.
- [x] **Fix all 4 run-id pickers always jumping to the newest run# after a fresh run, instead of getting stuck on a previously-selected older one** — `doRefreshRuns()` (duplicated in `OverviewSummary` and `PipelineJobsSummary`) preserves the current `selectedRunId` whenever it's still present in the refreshed list, which is *always* true (old run#s never disappear, a new one just gets prepended) — so it never actually advances to a run# a button just created. Add an `isNewRun` check (`ids[0] !== undefined && !recentRunIds.includes(ids[0])`) that jumps to the new run# when one genuinely appeared, falling back to the existing preserve-selection behavior only when nothing new showed up (e.g. a plain ↻ click with no run in between). Applied identically in both `OverviewSummary` and `PipelineJobsSummary`, so all 4 tabs get the fix.
- [x] **Reformat the run# dropdown option text and narrow the dropdown, in all 4 pickers** — option text changes from `Run #${id}` to `Run # (${id})`. Since that makes the separate standalone "Run" `<h3>` label in `OverviewSummary` redundant, remove it entirely (the dropdown text alone now reads clearly). Dropdown width narrowed from `w-28` to `w-20` in both `OverviewSummary` and `PipelineJobsSummary`.
- [x] **Reorganize `/owner/builddata` tabs** (merged in from a separate `PLAN_builddata-tabs.md`, per your decision to commit everything together) — split `ProductionTables()` (`BuildDataViewer.tsx`) into 3 separate tab components (`PlayersTab`/`SessionsTab`/`PartnersTab`, one per `tpl`/`tse`/`tpa`), each with its own local state/filters instead of the previous single shared component. Removed the `Production` tab entirely; tab order is now `ts1, ts2, tse, tpl, tpa`. Each tab keeps its own local `error` state (matching `Ts1Table`/`Ts2Table`'s existing pattern) instead of one shared error banner. The page-level `<h2>Build Data Viewer</h2>` heading moved to `BuildDataViewer`'s own wrapper, shown once regardless of active tab. Default active tab is now `ts1` (first in the new order).
- [x] **General `/owner/builddata` viewer overhaul** — applies across every tab (`ts1`, `ts2`, `tse`, `tpl`, `tpa`, and a new `tre`), per your decisions:
  - **Fix a bug from the previous step**: `BuildDataViewer.tsx`'s new `<h2>Build Data Viewer</h2>` duplicates `builddata/page.tsx`'s existing `<h1>Build Data Viewer</h1>` — remove the `h2`, the page-level `h1` already covers it.
  - **Extract shared table/filter machinery into a new file** `src/ui/admin/DataTableShared.tsx` — `DataTable`, `SectionHeader`, `FText`, `FSelect`, `FMultiSelect`, a new `FDate` (single exact-date picker, `MyInput type='date'`), `rowKey`, and `renderCell` (now auto-formats any `YYYY-MM-DD...`-prefixed string value as `dd/mm/yyyy`, and any boolean as `Yes`/`No`, generically for every table — no per-column config needed). Needed since `ts1`/`ts2`/`tre` are separate files from `BuildDataViewer.tsx` and need the same components `tse`/`tpl`/`tpa` already use.
  - **Full width, no bottom scroll**: remove `max-w-6xl` from `builddata/page.tsx`; remove `DataTable`'s `whitespace-nowrap` (was forcing columns wide enough to need horizontal scroll) and its `max-h-80 overflow-y-auto` row-scroll wrapper (superseded by pagination below).
  - **Pagination, 20 rows/page**: `DataTable` gains its own `page` state and slices its (already-filtered) `rows` prop into pages of 20, rendering `nextjs-shared/MyPagination` below the table. Resets down when a filter shrinks the total below the current page.
  - **`tse` tab**: add `se_date` filter (single exact-date picker via the new `FDate`, matches on the date portion only) and `se_is_summary` filter (All/Yes/No `FSelect`). Convert `se_club` (was free-text `FText`), `se_day_of_week`, and `se_scoring` (both were single-select `FSelect`) to `FMultiSelect` — `se_tournament`/`se_event_type` already were.
  - **`ts1` tab rewritten** to the same `DataTableShared` pattern (full parity, per your decision) — columns `s1_run_id, s1_date, s1_club, s1_event_name, s1_score_type, s1_event_type` (unchanged from the existing `/api/scrape/ts1` route's `SELECT`), with a filter per column: `s1_run_id` text, `s1_date` exact-date, `s1_club` multi-select, `s1_event_name` text, `s1_score_type` multi-select (MP/VP), `s1_event_type` multi-select (pairs/teams). Still fetched via the existing `/api/scrape/ts1` route.
  - **`ts2` tab rewritten** the same way — columns `s2_run_id, s2_plid1, s2_plid2, s2_score_value`, filter per column (all text/numeric). The route's `LIMIT 200` cap is removed (full dataset needed for accurate client-side pagination/filtering now that we paginate properly) — its unrelated, uncalled `DELETE` (truncate) handler is left untouched.
  - **New `tre` tab** (for `tre_results`), same pattern as `tse` — new `getAllResults()` action in `build-viewer.ts` (raw columns: `re_reid, re_seid, re_paid, re_percentage, re_vp` — no joins, matching how `ts1`/`ts2` show raw IDs rather than resolved names), filter per column (all text/numeric). Placed right after `tse` in tab order (results naturally follow sessions): `ts1, ts2, tse, tre, tpl, tpa`.
- [x] **Standardize `/owner/builddata` pagination on the project's existing convention, and fix a cross-table dropdown inconsistency**, per your decisions:
  - Confirmed (by checking `HomePageClient`/`PlayerPageClient`/`SessionPageClient`/`PartnersTable`) that none of them use `fetchFiltered`/`fetchTotalPages` (nextjs-shared's true server-side paginated fetch) — all 4 use the same client-side `ROWS_PER_PAGE` constant + `MyPagination` pattern already built into `DataTableShared.tsx`. So the only real gap was a locally hardcoded `PAGE_SIZE = 20` instead of importing the actual shared `ROWS_PER_PAGE` from `src/lib/tableUtils.ts` — swapped, so page size is now genuinely shared with the rest of the project, not just duplicated.
  - `pl_club` (`PlayersTab`, the `tpl` tab) was the one filter inconsistent with its counterparts elsewhere — `se_club`/`s1_club` are already multi-select, `pl_club` was still plain free-text. Converted to `FMultiSelect` with options derived from the loaded `players` data, matching the others.
  - Noted but not converted: `pl_rank` stays free-text — no other table has a comparable "rank" filter to match against, so there's no cross-table inconsistency to fix there.
  - Separately flagged (not part of this step): `tpa`'s underlying query (`getAllPartners()`) returns 46,520+ rows — confirmed via `/owner/cache` — genuinely large enough that true server-side pagination (filters moved into SQL, `LIMIT`/`OFFSET` per page) would help that specific tab; deferred pending a decision on which tables actually need it.
- [x] **Fix a real date-formatting/date-filtering bug** — `se_date`/`s1_date` were not actually being formatted as `dd/mm/yyyy`, and the exact-date filter wasn't matching either, despite the earlier step claiming both were done. Root cause: `renderCell`'s date detection only checked `typeof val === 'string'`, but `se_date` (fetched via a direct `'use server'` action call, not a JSON API route) arrives as a native JS `Date` object — Next.js Server Actions preserve real types like `Date` over the wire, unlike a `fetch()`/`NextResponse.json()` response which always stringifies to ISO. So the string-only check silently failed and fell through to plain `String(val)` (the JS default `Date.toString()` format), and the same `String(...).slice(0, 10)` pattern used for the filter and the selected-session date display was slicing that wrong string too.
- [x] **Add `pl_grade` (multi-select) and `pl_all_results` (tracked Yes/No) filters to the `tpl` tab** — `PlayersTab` (`BuildDataViewer.tsx`). `pl_grade` follows the same "derive options from loaded data" multi-select pattern as `pl_club`/`se_club`/`s1_club`; `pl_all_results` (boolean) follows the same All/Yes/No pattern as `se_is_summary`.
- [x] **`tpa` tab: split the combined player-name search into separate `player1`/`player2` filters, and expose every `ta2_partner_stats` column** — implemented ahead of a `#code` trigger (process slip, flagged to you separately), per your decisions: dropped the `a2_group = 'C'` restriction entirely rather than just adding columns alongside it, so each partnership can now appear once per group (A/B/C/all), with `a2_group` itself as a real multi-select filter.
  - `getAllPartners()` (`build-viewer.ts`): query now selects `a2_paid, a2_group, a2_mp_sessions, a2_mp_avg_pct, a2_mp_stddev, a2_vp_sessions, a2_vp_avg_vp, a2_vp_stddev` (the full raw column set) instead of a pre-computed group-C-only subset; ordered by `a2_group` then combined sessions descending.
  - `PartnersTab`: `player1`/`player2` are now independent `FText` filters (previously one combined box searching both). Added a filter for every new ta2 column — `a2_paid`/`a2_mp_sessions`/`a2_mp_avg_pct`/`a2_mp_stddev`/`a2_vp_sessions`/`a2_vp_avg_vp`/`a2_vp_stddev` as `FText`, `a2_group` as `FMultiSelect` (options derived from loaded data) — matching the "every displayed column gets its own filter" pattern already established on every other tab.
- [x] **Add player ID next to the name column on `tpl` and `tpa`, filterable** — `pl_plid` on `tpl` (already present via `filter_plid`), and `plid1`/`plid2` on `tpa` — `getAllPartners()` now selects `pa_plid1 AS plid1, pa_plid2 AS plid2` right after each player name, and `PartnersTab` gained `filter_plid1`/`filter_plid2` text filters alongside `player1`/`player2`.
- [x] **Rename every filter variable to `filter_<column>` (DD column name, table prefix stripped), and every tab's loaded-rows variable to match its table's name**, per your naming-convention feedback — applies across all 6 `/owner/builddata` tabs.
  - Filter renames (state + setter, e.g. `plClubFilter`/`setPlClubFilter` → `filter_club`/`setFilter_club`):
    - `PlayersTab`: `plNameFilter`→`filter_name`, `plNzFilter`→`filter_nz_bridge_number`, `plClubFilter`→`filter_club`, `plRankFilter`→`filter_rank` (plus the new `pl_grade`/`pl_all_results` filters above are added directly as `filter_grade`/`filter_all_results` — no separate rename needed for those).
    - `SessionsTab`: `sessNameFilter`→`filter_name`, `sessDateFilter`→`filter_date`, `sessScoringFilter`→`filter_scoring`, `sessClubFilter`→`filter_club`, `sessTournamentFilter`→`filter_tournament`, `sessEventTypeFilter`→`filter_event_type`, `sessDayFilter`→`filter_day_of_week`, `sessSourceFilter`→`filter_run_id`, `sessSummaryFilter`→`filter_is_summary`. `sessYear` is left as-is — it's a fetch parameter (which year to load), not a display filter over already-loaded rows, so the `filter_` convention doesn't apply to it.
    - `ResultsTab`: `reidFilter`→`filter_reid`, `seidFilter`→`filter_seid`, `paidFilter`→`filter_paid`, `percentageFilter`→`filter_percentage`, `vpFilter`→`filter_vp`.
    - `PartnersTab`: `player1Filter`→`filter_player1`, `player2Filter`→`filter_player2`, `paidFilter`→`filter_paid`, `groupFilter`→`filter_group`, `mpSessionsFilter`→`filter_mp_sessions`, `mpAvgPctFilter`→`filter_mp_avg_pct`, `mpStddevFilter`→`filter_mp_stddev`, `vpSessionsFilter`→`filter_vp_sessions`, `vpAvgVpFilter`→`filter_vp_avg_vp`, `vpStddevFilter`→`filter_vp_stddev`.
    - `Ts1Table`: `runIdFilter`→`filter_run_id`, `dateFilter`→`filter_date`, `clubFilter`→`filter_club`, `eventNameFilter`→`filter_event_name`, `scoreTypeFilter`→`filter_score_type`, `eventTypeFilter`→`filter_event_type`.
    - `Ts2Table`: `runIdFilter`→`filter_run_id`, `plid1Filter`→`filter_plid1`, `plid2Filter`→`filter_plid2`, `scoreFilter`→`filter_score_value`.
  - Table-name-matching row-array renames: `Ts1Table`'s `rows`/`setRows` → `sessions`/`setSessions` (table is `ts1_sessions`); `Ts2Table`'s `rows`/`setRows` → `results`/`setResults` (table is `ts2_results`). The other 4 tabs (`players`/`sessions`/`results`/`partners`) already match their table names, no change needed there.
- [x] **Fix a hardcoded-decision bug: the tournament-group classification ("A"/"B", else default to "C") was duplicated verbatim in two places** (`statsCompute.ts`'s `GRP_EXPR` and `PipelineTable.tsx`'s `GRP_EXPR_SQL`, the latter added earlier this project for the stats sub-rows' SQL popover), with no shared constant — flagged as unacceptable per your "never make assumptions when coding which have not been agreed" feedback. Extracted `TOURNAMENT_GROUPS`/`TOURNAMENT_DEFAULT_GROUP`/`TOURNAMENT_GROUP_SQL_EXPR` into `src/lib/constants.ts`; `statsCompute.ts`, `PipelineTable.tsx`, `stats.ts` (its two `['A','B','C','all']` group loops), and `BuildDataViewer.tsx`'s `tournamentTypes` all now derive from the shared constant instead of a locally hardcoded literal. A separate pre-existing hardcoded `a2_group = 'C'` in `src/lib/actions/players.ts`'s `getPartnerStats()` was found but deliberately left unchanged — it predates this project's work and changing its behavior would be a functional decision outside what's been agreed.
- [x] **Un-join `tpa` from `ta2_partner_stats`, and add a proper click-to-expand link instead** — per your decision, the `tpa` tab's row-per-group multiplication (the reason `a2_group = 'C'` got hardcoded in the first place) comes from joining a group-multiplied table (`ta2_partner_stats`, up to 4 rows per `pa_paid`) directly onto a single-row-per-partnership table (`tpa_partners`). `tpl` has the same latent problem (never joined to `ta1_player_stats`, which is also group-multiplied per `pl_plid`) — fix both the same way:
  - `getAllPartners()` (`build-viewer.ts`): drop the `ta2_partner_stats` join entirely — back to one row per partnership, just `tpa_partners` joined to `tpl_players` twice (1:1 lookups for `player1`/`plid1`/`player2`/`plid2`, which don't multiply rows).
  - `PartnersTab`: remove the now-gone `a2_*` columns/filters. Make partnership rows clickable (`isClickable`, matching `PlayersTab`/`SessionsTab`) — clicking expands a panel showing that partnership's `ta2_partner_stats` rows (all groups) via a new `getPartnerStatsByPaid(paid)` action (`build-viewer.ts`), keyed on `a2_paid = pa_paid`.
  - `PlayersTab`: add a new `getPlayerStatsByPlid(plid)` action (`build-viewer.ts`) returning all `ta1_player_stats` rows (all groups) for that `pl_plid`. Shown as a second panel alongside the existing `tre_results` expand panel when a player row is clicked — `getAllPlayers()`/`tpl_players` columns themselves are unaffected, already join-free.
- [x] **Add `ta1` and `ta2` as full raw-table tabs**, same pattern as `tre`/`tse` (own component, own local attribute filters, own pagination) — `ta1_player_stats` tab: `a1_plid, a1_group, a1_mp_sessions, a1_mp_avg_pct, a1_mp_stddev, a1_vp_sessions, a1_vp_avg_vp, a1_vp_stddev`, filter per column (`a1_group` multi-select, rest text/numeric). `ta2_partner_stats` tab: `a2_paid, a2_group, a2_mp_sessions, a2_mp_avg_pct, a2_mp_stddev, a2_vp_sessions, a2_vp_avg_vp, a2_vp_stddev`, same filter treatment. New actions `getAllPlayerStats()`/`getAllPartnerStats()` in `build-viewer.ts` (plain `SELECT * FROM ta1_player_stats`/`ta2_partner_stats`, no joins — both already have their own natural key column). `Tab` type/`TABS` gain `ta1`/`ta2` entries, placed after `tpl`/`tpa` respectively (full order: `ts1, ts2, tse, tre, tpl, tpa, ta1, ta2, filters`).
- [x] **Remove the inline expand panels added in the previous step, now redundant** — since `tre`/`ta1`/`ta2` are all full tabs reachable via the shared-filter jump below, the bespoke inline panels are no longer needed: `PlayersTab` drops its `ta1_player_stats` panel (and the `tre_results` one — same reasoning, `tre` is already its own tab) and the `getPlayerStatsByPlid`/`getResultsByPlid` calls driving them; `PartnersTab` drops its `ta2_partner_stats` panel and the `getPartnerStatsByPaid` call. `SessionsTab`'s inline `tre_results` panel (click a session → see its results) is unaffected — kept as a deliberate exception since removing it isn't part of what's being discussed here (only `tpl`/`tpa`'s panels were flagged as redundant with the new tab set).
- [x] **Add shared cross-tab key-filter state to `BuildDataViewer`** — a single object holding only true identity/FK-style keys, each stored as `{ value, label }` (`label` populated from the clicked row when available, e.g. `pl_name` alongside `pl_plid`; absent/raw-value-only when set manually via the Filters tab): `plid`, `plid1`, `plid2`, `paid`, `seid`, `run_id`. Attribute filters (club, grade, tournament, event_type, day_of_week, is_summary, name-text-search, percentage, etc.) are explicitly NOT part of this shared state — they stay exactly as they are today, local to each tab.
  - Every row-click handler across all 8 data tabs (`ts1`, `ts2`, `tse`, `tre`, `tpl`, `tpa`, `ta1`, `ta2`) is updated to, in addition to highlighting the row (existing `isClickable`/`selected` styling — no more expand panels, no auto-navigation), extract whichever shared keys exist on that row and merge them into the shared state. E.g. a `tpl` row contributes `plid` (from `pl_plid`, label `pl_name`); a `tpa` row contributes `plid1`/`plid2`/`paid`; a `tse` row contributes `seid`/`run_id`; a `tre` row contributes `seid`/`paid`; `ta1` contributes `plid`; `ta2` contributes `paid`; `ts1`/`ts2` contribute `run_id`/`plid1`/`plid2` as applicable to their own raw columns.
  - Every tab, on mount and whenever the shared state changes, seeds its own matching local `filter_<key>` state from the shared object if present and relevant to its own columns — a one-time seed the user can still freely edit or clear locally afterward without it snapping back.
  - `tpa` gains a new "involves player" filter (OR semantics: `plid1 = X OR plid2 = X`), distinct from and in addition to the existing `filter_plid1`/`filter_plid2` AND-pair — this is what gets seeded from a shared `plid` value (e.g. arriving from a `tpl`/`ta1` click), since `tpa` has no plain `plid` column of its own.
- [x] **Add a dedicated "Filters" tab** (not a data table) — the 9th tab, listing every currently-set shared key filter as a row/chip (showing its `label` when known, otherwise the raw value), each with a way to remove it, plus a way to manually type in a raw value for any of the 6 shared keys to add one without having clicked a row first.
- [x] **Wherever a raw `plid` or `paid` column is shown on a tab, also show and make filterable the corresponding `pl_name`(s)** — per your decision, extending the same "ID next to name" treatment `tpl`/`tpa` already got to the remaining tabs that still show a bare ID with no name. All joins involved are 1:1 lookups (one player per `plid`, exactly two players per `paid` via `tpa_partners`), so none of them multiply rows — consistent with the project's "1:1 lookups are fine, row-multiplying joins are not" design principle (documented in `.claude/CLAUDE.md`'s Build Data Viewer section).
  - `ts2` tab: `Ts2Table`'s data source (`/api/scrape/ts2/route.ts`'s `GET`) joins `tpl_players` twice to resolve `s2_plid1`/`s2_plid2` to `player1`/`player2` names, placed next to their respective ID column. `Ts2Table` gains `filter_player1`/`filter_player2` text filters alongside the existing `filter_plid1`/`filter_plid2`.
  - `tre` tab: `getAllResults()` (`build-viewer.ts`) joins `tpa_partners` + `tpl_players` (×2) to resolve `re_paid` to `player1`/`player2` names. `ResultsTab` gains `filter_player1`/`filter_player2` text filters alongside the existing `filter_paid`.
  - `ta1` tab: `getAllPlayerStats()` (`build-viewer.ts`) joins `tpl_players` to resolve `a1_plid` to `player`. `PlayerStatsTab` gains a `filter_player` text filter alongside the existing `filter_plid`.
  - `ta2` tab: `getAllPartnerStats()` (`build-viewer.ts`) joins `tpa_partners` + `tpl_players` (×2) to resolve `a2_paid` to `player1`/`player2` names. `PartnerStatsTab` gains `filter_player1`/`filter_player2` text filters alongside the existing `filter_paid`.
  - `ts1`, `tse`, `tpl`, `tpa` are unaffected — `ts1`/`tse` have no `plid`/`paid` columns, and `tpl`/`tpa` already show and filter on names (added earlier this session).
- [x] **Fix numeric text filters matching by substring instead of by value** — found on `ta2_mp_sessions` while testing the above (typing "1" matched "18"), same bug present in every numeric measure filter on the new `ta1`/`ta2` tabs (`mp_sessions`, `mp_avg_pct`, `mp_stddev`, `vp_sessions`, `vp_avg_vp`, `vp_stddev` × 2 tabs) since they all used the same `!String(val).includes(filter)` pattern built for text columns. New shared `numMatch(filter, val)` helper (`DataTableShared.tsx`) does exact numeric equality instead (empty filter always matches, non-numeric filter matches nothing) — applied to all 12 of those measure filters. ID-style filters (`a1_plid`, `a2_paid`, `pa_paid`, `plid1`/`plid2`, `run_id`, `reid`, `seid`) are deliberately left as substring text matching — not part of what was reported, and partial-ID search is a reasonable, likely-intended pattern for identifiers. Flagging that the same substring-match issue technically exists on other numeric columns elsewhere in the viewer (`re_percentage`, `re_vp`, `pl_nz_bridge_number`, `s2_score_value`) in case you want those fixed too.

## Changes

### src/ui/admin/PipelineTable.tsx
- `Tab` type extended to `'overview' | 'akbc' | 'tracked' | 'finish'`, with `'overview'` first in
  `TABS` and the new default `activeTab`. Overview tab renders all 3 `PipelineJobsSummary`
  instances (steps `[1]`/`[2]`/`[3, 4]`) stacked, each with `showGroupName` so they show
  `Pipeline Jobs — AKBC` etc. — no Run Pipeline tables on this tab.
- `PipelineJobsSummary` takes a new `showGroupName?: boolean` (default `false`) prop — its heading
  is `Summary` on the per-group tabs (AKBC/Tracked/Finish, where the tab itself already identifies
  the group) and `Pipeline Jobs — {title}` on Overview (where 3 summaries need distinguishing).
- All 3 Run Pipeline panel headings (`Run Pipeline — AKBC`, `Run Pipeline — Tracked Players`,
  `Finish Pipeline`) simplified to just `Pipeline`, same reasoning.
- All 3 group-run buttons ("Run All (AKBC)", "Run All (Tracked)", "Finish Pipeline") simplified to
  just "Run All" (still shows "Running…" while active) — `runningAll` state/logic unchanged.
- Fixed the Update Stats `MyHelpStep` popover's stale "Truncates ta1_player_stats..." text —
  leftover from before the truncate→upsert switch; now describes the actual per-group upsert
  behavior and mentions the new Input/Output Recs per sub-step.
- `STATS_SUB_ROWS` gained a `sql` field per row (`playerStatsSql(grp)`/`partnerStatsSql(grp)`
  helpers, mirroring `statsCompute.ts`'s actual query with the literal group value substituted) —
  rendered via a new `MyHelp` "SQL" button on each of the 8 rows (previously `—`).
- The 8 stats sub-rows' Status column now shows a real `StatusBadge` (`Completed` once
  `results[key]?.data` exists) instead of always `—`.
- `handleStats()` now applies `data.groups` (see `stats.ts` below) into each of the 8
  `STATS_SUB_ROWS`' own `results[key]` state after the aggregate "Run All"/"Finish Pipeline" run
  resolves — so all 8 rows show their Processed/Status regardless of whether they were run via the
  aggregate action or their own individual button, matching what the Jobs Summary already showed.

### src/lib/actions/statsCompute.ts
- `computePlayerGroupStats(grp)`/`computePartnerGroupStats(grp)` return type changed from
  `Promise<number>` to `Promise<{ inserted: number; inputRecs: number }>` — each now runs one
  extra `SELECT COUNT(*)` first, matching the same `WHERE`/`JOIN` shape as the actual upsert
  (before `GROUP BY`), giving a genuine "how many `tre_results` rows qualified for this group"
  count instead of leaving it at 0.

### src/lib/actions/stats.ts
- `RebuildAllStatsResult` gained a `groups: Record<string, number>` field, keyed the same way
  `PipelineTable.tsx`'s `STATS_SUB_ROWS` already is (`'player-a'`, …, `'partner-all'`) — each
  group's row count, computed once during the existing loop, no extra queries beyond the new
  input-count ones above. `rebuildAllStats()` now passes `input_recs` (from the new
  `computePlayerGroupStats`/`computePartnerGroupStats` return shape) to `logPipelineStep()` for
  each of the 8 sub-steps.

### src/app/api/players/recalculate/route.ts
- Updated for `computePlayerGroupStats`/`computePartnerGroupStats`'s new `{ inserted, inputRecs }`
  return shape — passes `input_recs` to `logPipelineStep()` the same way `stats.ts` now does; the
  route's own JSON response shape (`{ updated }`) is unchanged.

### src/app/api/build/partners/route.ts
- Dropped the `input_table: 'tre_results'` claim on the Build Partners `logPipelineStep()` call —
  confirmed `buildAllPartnerStats()` only ever runs `SELECT COUNT(*) FROM tpa_partners`, it never
  reads `tre_results` at all, so the label was mislabeled (not just missing a count).

### src/app/api/cron/update-sessions/route.ts
- Added the missing `logPipelineStep()` call for Build Partners (step 3) — previously called
  `buildAllPartnerStats()` directly, bypassing the logging that only lived in `/api/build/partners`'
  route wrapper. Restructured into a shared `run()` function with a `POST` handler added alongside
  the existing `GET`, matching every other build route's pattern, so the UI's existing POST-based
  helper works against it directly.

### src/ui/admin/PipelineTable.tsx
- New `JobsTable({ steps, runs })` — extracted the table body (and its `playersExpanded` toggle)
  out of `PipelineJobsSummary`, pure presentational with no run-id fetching of its own.
- `PipelineJobsSummary` (AKBC/Tracked Players/Finish tabs) unchanged in behavior — still manages
  its own run-id picker, now just renders `<JobsTable>` internally. Removed its now-unused
  `showGroupName`/`title` props (only needed for the old per-group-labelled Overview design).
- New `OverviewSummary({ refreshKey })` — one shared run-id picker (`recentRunIds`/`selectedRunId`/
  `runs`, one `getPipelineRunStatus()` fetch covering all 4 steps) instead of 3 independent ones.
  Renders the picker once below "Run All Cron", then a single `<JobsTable steps={[1, 2, 3, 4]}>`
  — no `MyBox`, no "Pipeline Jobs" heading, since Overview is one combined output, not 3 panels.
- New `handleRunFullCron()` (`run('full-cron', '/api/cron/update-sessions', async () => {})`) and a
  "Run All Cron" button + error display at the top of the Overview tab, above `OverviewSummary`.
- All 4 "Run All"-style buttons' running-state class changed from `bg-red-300 hover:bg-red-300`
  (paler than idle) to `bg-red-700 hover:bg-red-700 animate-pulse` (darker + pulsing), so an
  in-progress run visibly stands out instead of fading.
- `doRefreshRuns()` (both `OverviewSummary` and `PipelineJobsSummary`) gained an `isNewRun` check —
  `ids[0] !== undefined && !recentRunIds.includes(ids[0])` — so a freshly-allocated run# always
  takes precedence over a preserved manual selection; previously the "stay on my current
  selection if it's still present" logic always won, since old run#s never disappear from the
  list, so it never actually advanced to a run a button just created.
- Run# dropdown option text changed from `Run #${id}` to `Run # (${id})` in both components (the
  `onChange` parser updated from stripping the literal `'Run #'` prefix to `replace(/\D/g, '')`,
  since the new format has extra characters around the digits). Dropdown width narrowed from
  `w-28` to `w-20`. `OverviewSummary`'s separate standalone "Run" `<h3>` label removed — redundant
  now that the dropdown text itself reads clearly on its own.

### src/ui/admin/BuildDataViewer.tsx
- `ProductionTables()` (previously one component covering `tpl_players`, `tse_sessions`, and
  `tpa_partners` all under a single `Production` tab) split into 3 standalone components —
  `PlayersTab`, `SessionsTab`, `PartnersTab` — each with its own local state, filters, and `error`
  state (matching how `Ts1Table`/`Ts2Table` already work independently), instead of one shared
  `error` banner and shared state object across all 3 sections.
- `Tab` type and `TABS` changed from `'production' | 'ts1' | 'ts2'` to `'ts1' | 'ts2' | 'tse' |
  'tpl' | 'tpa'`, reordered to `ts1, ts2, tse, tpl, tpa`. Default active tab changed from
  `'production'` to `'ts1'` (first in the new order).
- The `<h2>Build Data Viewer</h2>` heading (previously inside `ProductionTables()`, so only shown
  on that one tab) moved to `BuildDataViewer`'s own top-level wrapper, shown once regardless of
  which tab is active.

### src/ui/admin/DataTableShared.tsx (new)
- Extracted `DataTable`, `SectionHeader`, `FText`, `FSelect`, `FMultiSelect`, `rowKey`, and
  `renderCell` out of `BuildDataViewer.tsx` so `Ts1Table`/`Ts2Table`/the new results tab can share
  them too. Added `FDate` (single exact-date picker). `renderCell` now auto-formats any
  `YYYY-MM-DD...`-prefixed string as `dd/mm/yyyy` and any boolean as `Yes`/`No`, generically for
  every table with no per-column configuration needed.
- `DataTable` gained its own pagination (20 rows/page, `nextjs-shared/MyPagination`), clamping down
  when a filter shrinks the total below the current page. Dropped `whitespace-nowrap` and the
  `max-h-80 overflow-y-auto` row-scroll wrapper — full width, no bottom scroll, superseded by
  pagination.

### src/app/owner/builddata/page.tsx
- Removed `max-w-6xl` from the page wrapper, matching the same full-width fix already applied to
  `/owner/pipeline`.

### src/ui/admin/BuildDataViewer.tsx
- Fixed a bug from the previous step: removed the duplicate `<h2>Build Data Viewer</h2>` — the
  page-level `<h1>` in `builddata/page.tsx` already covers it.
- Now imports the shared components from `DataTableShared.tsx` instead of defining them locally.
- `Tab`/`TABS` extended to `ts1, ts2, tse, tre, tpl, tpa` (added `tre`, after `tse`).
- `SessionsTab` (`tse`): added `se_date` filter (exact-date picker) and `se_is_summary` filter
  (All/Yes/No). Converted `se_club` (was free-text), `se_day_of_week`, and `se_scoring` (both were
  single-select) to multi-select — `se_tournament`/`se_event_type` already were.
- New `ResultsTab` (`tre`) — raw `tre_results` columns (`re_reid, re_seid, re_paid, re_percentage,
  re_vp`, no joins, matching how `ts1`/`ts2` show raw IDs rather than resolved names), filter per
  column via the new `getAllResults()` action (`build-viewer.ts`).

### src/lib/actions/build-viewer.ts
- Added `getAllResults()` — `SELECT re_reid, re_seid, re_paid, re_percentage, re_vp FROM
  tre_results ORDER BY re_reid`, for the new `tre` tab.

### src/ui/admin/Ts1Table.tsx, Ts2Table.tsx (rewritten)
- Both rebuilt on the shared `DataTableShared` pattern (full parity with `tse`/`tpl`/`tpa`, per
  your decision) — a filter per column (`s1_run_id` text, `s1_date` exact-date, `s1_club`/
  `s1_score_type`/`s1_event_type` multi-select derived from the loaded data, `s1_event_name` text;
  `s2_run_id`/`s2_plid1`/`s2_plid2`/`s2_score_value` all text/numeric), pagination, dd/mm/yyyy
  dates. Still fetched via their existing `/api/scrape/ts1`/`ts2` routes.

### src/app/api/scrape/ts2/route.ts
- Removed the `LIMIT 200` cap and the separate count query/wrapper response shape — now returns
  the full row array directly (matching `ts1`'s route shape), since accurate client-side
  pagination/filtering needs the complete dataset. Its unrelated, uncalled `DELETE` (truncate)
  handler is untouched.

### src/ui/admin/DataTableShared.tsx
- Removed the locally hardcoded `PAGE_SIZE = 20`, replaced with the project's actual shared
  `ROWS_PER_PAGE` constant (`src/lib/tableUtils.ts`) — the same one already used by
  `HomePageClient`/`PlayerPageClient`/`SessionPageClient`/`PartnersTable`'s pagination, confirmed
  by checking each of those rather than assuming `fetchFiltered`/`fetchTotalPages` was "the
  standard" (it isn't used anywhere in this project).

### src/ui/admin/BuildDataViewer.tsx
- `PlayersTab`'s `pl_club` filter converted from free-text (`FText`) to `FMultiSelect` (options
  derived from loaded player data), matching `se_club`/`s1_club`'s existing multi-select treatment
  — the one cross-table dropdown inconsistency found. `pl_rank` left as-is (no comparable
  multi-select elsewhere to match).

### src/ui/admin/DataTableShared.tsx
- New exported `dateKey(val)` — extracts the `yyyy-mm-dd` portion from a date-shaped value
  regardless of whether it's a native `Date` object (server-action calls) or an ISO string (JSON
  API routes), returning `null` for anything else. `renderCell` now uses it instead of a
  string-only regex check, so `Date` objects are actually detected and formatted as `dd/mm/yyyy`.

### src/ui/admin/BuildDataViewer.tsx, Ts1Table.tsx
- `se_date`/`s1_date` exact-date filters, and the selected-session date display in `SessionsTab`,
  switched from `String(val ?? '').slice(0, 10)` (broken for `Date` objects — slices the JS
  default `Date.toString()` text, not an ISO date) to the new shared `dateKey()`.

### src/lib/actions/build-viewer.ts
- `getAllPartners()` no longer restricts to `a2_group = 'C'` — now selects every raw
  `ta2_partner_stats` column (`a2_paid, a2_group, a2_mp_sessions, a2_mp_avg_pct, a2_mp_stddev,
  a2_vp_sessions, a2_vp_avg_vp, a2_vp_stddev`) for all 4 groups, ordered by `a2_group` then
  combined sessions descending. Each partnership can now appear up to 4 times (once per group).

### src/ui/admin/BuildDataViewer.tsx
- `PartnersTab`: split the single combined player-name search into independent `player1`/
  `player2` filters. Added a filter for every new ta2 column exposed above (`a2_group` as
  `FMultiSelect`, the rest as `FText`), matching the "every column gets a filter" pattern already
  used on every other tab.

### src/ui/admin/DataTableShared.tsx
- New exported `SharedKey` (`'plid' | 'plid1' | 'plid2' | 'paid' | 'seid' | 'run_id'`),
  `SharedFilterEntry` (`{ value, label? }`), `SharedFilters` (`Partial<Record<SharedKey,
  SharedFilterEntry>>`), and `SHARED_KEYS` (the ordered array of all 6) — the cross-tab identity-
  key filter model, deliberately excluding attribute filters (club, grade, etc.) since same-named
  columns across tables aren't necessarily the same relationship.

### src/lib/actions/build-viewer.ts
- Removed `getResultsByPlid`, `getPartnerStatsByPaid`, `getPlayerStatsByPlid` — no longer called
  now that the inline expand panels they powered are gone (`tre`/`ta1`/`ta2` are reachable as full
  tabs instead).
- New `getAllPlayerStats()` / `getAllPartnerStats()` — raw `SELECT` (no joins) of every
  `ta1_player_stats` / `ta2_partner_stats` column (excluding the internal `a1_a1id`/`a2_a2id`
  surrogate key), for the new `ta1`/`ta2` tabs.

### src/ui/admin/BuildDataViewer.tsx
- `Tab`/`TABS` extended to `ts1, ts2, tse, tre, tpl, tpa, ta1, ta2, filters` (added `ta1`, `ta2`,
  and a non-data `filters` tab, labelled "Filters").
- Every tab component now takes `{ sharedFilters, onKeyClick }` props (`TabProps` type). Each
  tab's row-click handler now merges that row's identity-key columns into the shared state via
  `onKeyClick` in addition to (or instead of, where the old expand panel was removed) its previous
  behavior — `tpl` contributes `plid`; `tse` contributes `seid`/`run_id` (unchanged expand-panel
  behavior otherwise); `tre` contributes `seid`/`paid` (newly made clickable, no expand panel);
  `tpa` contributes `plid1`/`plid2`/`paid`; `ta1` contributes `plid`; `ta2` contributes `paid`.
  Each tab also seeds its own matching `filter_<key>` local state from `sharedFilters` via a lazy
  `useState` initializer (one-time seed on mount, since tabs fully unmount/remount on switch —
  freely editable afterward, doesn't snap back).
- `PlayersTab`: removed `selectedPlayer`'s `tre_results`/`ta1_player_stats` expand panels and the
  `playerResults`/`playerStats` state/fetches driving them — `pl_plid` click now just highlights
  the row and sets the shared `plid`.
- `PartnersTab`: removed the `ta2_partner_stats` expand panel and `partnerStats` state/fetch. Added
  a new `filter_involves_plid` `FText` filter (OR semantics — matches when `plid1` OR `plid2`
  equals the value), placed in the `SectionHeader`'s action area (not a per-column filter, since it
  doesn't correspond to one specific column) rather than the per-column filter row — seeded from
  the shared `plid` when arriving from a `tpl`/`ta1` click.
- New `PlayerStatsTab` (`ta1`) and `PartnerStatsTab` (`ta2`) — same `DataTable`/filter/pagination
  pattern as every other tab, group options derived dynamically from loaded data (not hardcoded),
  clicking a row sets the shared `plid`/`paid` respectively.
- New `FiltersTab` — lists every currently-set shared key (from `SHARED_KEYS`) as a row showing its
  `label` (if known) or raw value, with a remove button, plus a small key-select + value-input +
  Add control to set one manually without a prior row click.

### src/ui/admin/Ts1Table.tsx, Ts2Table.tsx
- Both now take `{ sharedFilters, onKeyClick }` props and are clickable (previously neither had
  any click handling) — `Ts1Table` contributes `run_id` (`s1_run_id`) on click and seeds
  `filter_run_id` from the shared state; `Ts2Table` contributes `run_id`/`plid1`/`plid2`
  (`s2_run_id`/`s2_plid1`/`s2_plid2`) and seeds all three matching local filters.

### src/app/api/scrape/ts2/route.ts
- `GET`'s SELECT now `LEFT JOIN`s `tpl_players` twice to resolve `s2_plid1`/`s2_plid2` to
  `player1`/`player2` names (1:1 lookup, doesn't multiply rows) — `LEFT JOIN` rather than `JOIN` so
  a row with a non-resolving plid still shows (with a blank name) instead of silently disappearing,
  matching the viewer's "surface errors, don't hide them" purpose.

### src/lib/actions/build-viewer.ts
- `getAllResults()`: now `LEFT JOIN`s `tpa_partners` + `tpl_players` (×2) to resolve `re_paid` to
  `player1`/`player2` names.
- `getAllPlayerStats()`: now `LEFT JOIN`s `tpl_players` to resolve `a1_plid` to `player`.
- `getAllPartnerStats()`: now `LEFT JOIN`s `tpa_partners` + `tpl_players` (×2) to resolve `a2_paid`
  to `player1`/`player2` names.

### src/ui/admin/Ts2Table.tsx
- Added `filter_player1`/`filter_player2` text filters (name search) alongside the existing
  `filter_plid1`/`filter_plid2`. Click handler now also captures `player1`/`player2` as the
  `label` on the shared `plid1`/`plid2` entries.

### src/ui/admin/BuildDataViewer.tsx
- `ResultsTab` (`tre`): added `filter_player1`/`filter_player2` text filters alongside `filter_paid`.
- `PlayerStatsTab` (`ta1`): added a `filter_player` text filter alongside `filter_plid`; click
  handler now captures `player` as the `label` on the shared `plid` entry.
- `PartnerStatsTab` (`ta2`): added `filter_player1`/`filter_player2` text filters alongside
  `filter_paid`.

### src/ui/admin/DataTableShared.tsx
- New exported `numMatch(filter, val)` — exact numeric equality for a text filter against a
  numeric column (empty filter always matches, non-numeric filter matches nothing), replacing the
  substring `String(val).includes(filter)` check that wrongly matched e.g. `"1"` against `18`.

### src/ui/admin/BuildDataViewer.tsx
- `PlayerStatsTab`/`PartnerStatsTab`: all 6 measure filters each (`mp_sessions`, `mp_avg_pct`,
  `mp_stddev`, `vp_sessions`, `vp_avg_vp`, `vp_stddev`) switched from substring matching to
  `numMatch`. ID-style filters (`a1_plid`/`a2_paid`) intentionally left as substring text search.

### src/ui/admin/BuildDataViewer.tsx
- `PlayersTab`: added `filter_grade` (`FMultiSelect`, options derived from loaded `players` data)
  and `filter_all_results` (`FSelect` All/Yes/No) filters for `pl_grade`/`pl_all_results`.
- `PartnersTab`: added `filter_plid1`/`filter_plid2` (`FText`) filters, displayed right after
  `player1`/`player2` respectively (matching the SELECT column order below).
- All remaining filter state renamed to the `filter_<column>` convention: `PartnersTab`
  (`player1Filter`→`filter_player1`, `player2Filter`→`filter_player2`, `paidFilter`→`filter_paid`,
  `groupFilter`→`filter_group`, `mpSessionsFilter`→`filter_mp_sessions`, `mpAvgPctFilter`→
  `filter_mp_avg_pct`, `mpStddevFilter`→`filter_mp_stddev`, `vpSessionsFilter`→
  `filter_vp_sessions`, `vpAvgVpFilter`→`filter_vp_avg_vp`, `vpStddevFilter`→`filter_vp_stddev`).

### src/lib/actions/build-viewer.ts
- `getAllPartners()`: SELECT now includes `pa_plid1 AS plid1, pa_plid2 AS plid2` right after each
  player name, so `plid1`/`plid2` are available as columns/filters on the `tpa` tab.

### src/ui/admin/Ts1Table.tsx, Ts2Table.tsx
- Filter state renamed to `filter_<column>` (`Ts1Table`: `runIdFilter`→`filter_run_id`,
  `dateFilter`→`filter_date`, `clubFilter`→`filter_club`, `eventNameFilter`→`filter_event_name`,
  `scoreTypeFilter`→`filter_score_type`, `eventTypeFilter`→`filter_event_type`; `Ts2Table`:
  `runIdFilter`→`filter_run_id`, `plid1Filter`→`filter_plid1`, `plid2Filter`→`filter_plid2`,
  `scoreFilter`→`filter_score_value`). Loaded-rows state renamed to match each table's name:
  `Ts1Table`'s `rows`/`setRows` → `sessions`/`setSessions` (`ts1_sessions`); `Ts2Table`'s
  `rows`/`setRows` → `results`/`setResults` (`ts2_results`).

### src/lib/constants.ts
- New `TOURNAMENT_GROUPS` (`['A', 'B', 'C'] as const`), `TOURNAMENT_DEFAULT_GROUP` (`'C'`), and
  `TOURNAMENT_GROUP_SQL_EXPR` (the `CASE WHEN RIGHT(se_tournament,1)=...` SQL fragment) — extracted
  so the "default to C" classification decision is a visible, single-sourced constant instead of a
  literal duplicated across files.

### src/lib/actions/statsCompute.ts
- `GRP_EXPR` now assigned from the shared `TOURNAMENT_GROUP_SQL_EXPR` instead of its own locally
  typed copy of the same SQL expression.

### src/lib/actions/stats.ts
- Both group loops (`for (const grp of ['A', 'B', 'C', 'all'])`, player stats and partner stats)
  changed to `for (const grp of [...TOURNAMENT_GROUPS, 'all'])`.

### src/ui/admin/PipelineTable.tsx
- `GRP_EXPR_SQL` (used to build the stats sub-rows' SQL popover text) now assigned from the shared
  `TOURNAMENT_GROUP_SQL_EXPR` instead of an independently-typed duplicate — this was the actual
  bug: two copies of the same hardcoded business rule that could silently drift apart.

### src/ui/admin/BuildDataViewer.tsx
- `SessionsTab`'s `tournamentTypes` now derived as `[...TOURNAMENT_GROUPS]` instead of a locally
  hardcoded `['A', 'B', 'C']` array.

### src/lib/actions/build-viewer.ts
- `getAllPartners()` no longer joins `ta2_partner_stats` — back to one row per partnership
  (`pa_paid, player1, plid1, player2, plid2`), joined only to `tpl_players` (1:1 lookups, don't
  multiply rows), ordered by player name. This is the actual fix for the root cause behind the
  earlier hardcoded `a2_group = 'C'`: joining a group-multiplied table directly onto a
  single-row-per-partnership table forced a group to be picked to collapse the duplication.
- New `getPartnerStatsByPaid(paid)` — `SELECT a2_group, a2_mp_sessions, a2_mp_avg_pct,
  a2_mp_stddev, a2_vp_sessions, a2_vp_avg_vp, a2_vp_stddev FROM ta2_partner_stats WHERE a2_paid =
  $1`, all groups for one partnership, keyed by `pa_paid`/`a2_paid`.
- New `getPlayerStatsByPlid(plid)` — same pattern for `ta1_player_stats`, keyed by `pl_plid`/
  `a1_plid`, all groups for one player.

### src/ui/admin/BuildDataViewer.tsx
- `PartnersTab`: removed all `a2_*` columns/filters (`filter_group`, `filter_mp_sessions`,
  `filter_mp_avg_pct`, `filter_mp_stddev`, `filter_vp_sessions`, `filter_vp_avg_vp`,
  `filter_vp_stddev`) — no longer part of the un-joined `getAllPartners()` result. Rows are now
  clickable (`isClickable`, matching `PlayersTab`/`SessionsTab`) — clicking a partnership expands a
  new panel below the table showing that partnership's `ta2_partner_stats` rows (all groups) via
  `getPartnerStatsByPaid(pa_paid)`.
- `PlayersTab`: clicking a player row now also fetches `getPlayerStatsByPlid(pl_plid)` and shows a
  new `ta1_player_stats` panel (all groups) alongside the existing `tre_results` panel.
  `getAllPlayers()`/`tpl_players` columns themselves are unaffected — that query was already
  join-free.

## Testing
- [ ] Open `/owner/pipeline` and confirm a 4th "Overview" tab appears first, and it's the default
      tab on page load
- [ ] Click Overview and confirm it shows one combined table (all 4 steps together) with a single
      shared "Run #" picker above it, not 3 separate panels/pickers, and no Run Pipeline tables
- [ ] Click the AKBC/Tracked Players/Finish tabs and confirm their summary panels now just say
      "Summary" (not "Pipeline Jobs — AKBC" etc.), and their Run Pipeline panels just say "Pipeline"
- [ ] Confirm all 3 tabs' group-run buttons just say "Run All" (not "Run All (AKBC)"/"Finish
      Pipeline")
- [ ] Run "Run All" on the Finish tab and confirm Build Partners and each of the 8 Update Stats
      sub-steps now show a non-zero Input Recs in the Jobs Summary (previously always 0)
- [ ] Confirm Build Partners' Jobs Summary row no longer shows `tre_results` as its Input Table
- [ ] Confirm all 8 stats sub-rows in the Finish tab's Pipeline table now show their Processed row
      count and a "Completed" Status badge after running via "Run All" (not just when run
      individually via their own button)
- [ ] Click the SQL button on a couple of the 8 stats sub-rows and confirm it shows that row's
      actual query with the right group value substituted in
- [ ] Open the Update Stats row's Help popover and confirm it no longer says "Truncates
      ta1_player_stats..." and instead describes the upsert behavior
- [ ] Open the Overview tab and confirm a "Run All Cron" button appears above the shared "Run #"
      picker and combined table
- [ ] Click it and confirm it runs the full 8-stage sequence (Scrape AKBC → Build Sessions/Results
      → Scrape Tracked → Build Sessions/Results → Build Partners → Update Stats) end to end
- [ ] Confirm all 4 steps (including Build Partners, step 3) log to `tpip_pipelinelog` under the
      **same** `pip_run_id` — the Overview table should show one new run# with all 4 steps present
- [ ] Confirm every other button (all 3 tabs' "Run All", every per-row Run button) is disabled
      while "Run All Cron" is in progress
- [ ] Confirm the button still works calling the route as a `POST` (not just the cron's own `GET`)
- [ ] Confirm the Overview tab's "Run #" dropdown and ↻ refresh button appear once, above the
      table, not once per group — switching the run# updates all 4 steps' rows together
- [ ] Confirm the AKBC/Tracked Players/Finish tabs' own Jobs Summary panels are unaffected — each
      still has its own independent "Run #" picker, still labelled "Summary"
- [ ] Click any of the 4 "Run All"-style buttons and confirm the running state is now a darker,
      pulsing red (not the previous pale pink) — visibly more prominent than idle
- [ ] Run something on any tab and confirm the run# dropdown (that tab's own picker, and
      Overview's shared one) jumps to the newly-created run# automatically, even if you'd
      previously selected an older run manually
- [ ] Click ↻ with nothing new having run and confirm your manually-selected run# is still
      preserved (not reset to the latest) — the fix should only override on a genuinely new run
- [ ] Confirm all 4 run# dropdowns now show options like "Run # (18)" instead of "Run #18", are
      visibly narrower, and Overview no longer has a separate "Run" label next to its dropdown
- [ ] Open `/owner/builddata` and confirm 6 tabs in this order: ts1, ts2, tse, tre, tpl, tpa — no
      "Production" tab
- [ ] Confirm only one "Build Data Viewer" heading shows (the page-level one), not a duplicate
- [ ] Confirm the page is full width with no horizontal/bottom scrollbar on any tab
- [ ] Click ts1, click Refresh, and confirm filters (run_id, date, club, event name, score type,
      event type) all work, dates show dd/mm/yyyy, and pagination (20 rows/page) works
- [ ] Click ts2, click Refresh, and confirm filters (run_id, plid1, plid2, score) work and it's no
      longer capped at 200 rows
- [ ] Click the tse tab, load sessions, click a row to expand its results, and confirm all filters
      work — including the new se_date (exact-date) and se_is_summary (All/Yes/No) filters, and
      confirm se_club/se_day_of_week/se_scoring are now multi-select
- [ ] Click the new tre tab, click Load, and confirm all 5 columns (re_reid, re_seid, re_paid,
      re_percentage, re_vp) show with working filters
- [ ] Click the tpl tab, load players, confirm pl_club is now a multi-select (not free-text),
      click a row to expand their results, confirm other filters still work
- [ ] Click the tpa tab, load partners, confirm the name filter works
- [ ] Confirm each tab's own error state is independent — trigger an error on one tab (if possible)
      and confirm it doesn't show up on a different tab
- [ ] Confirm pagination on every tab uses the same page size (`ROWS_PER_PAGE`) — no tab shows a
      different number of rows per page than another
- [ ] On the tse tab, confirm `se_date` now genuinely displays as `dd/mm/yyyy` in the table (not
      a JS default date string) and the exact-date filter actually narrows results when set
- [ ] Confirm the selected-session detail line ("tre_results — {name} {date} (...)") shows a
      correct `yyyy-mm-dd` date, not a garbled/wrong one
- [ ] On the ts1 tab, confirm `s1_date` still displays and filters correctly (was already string-
      based via its JSON API route, so should be unaffected, but confirm no regression)
- [ ] On the tpa tab, confirm player1 and player2 now have independent filters (searching one no
      longer matches the other)
- [ ] Confirm the tpa tab shows all 4 groups (A/B/C/all) per partnership, with a working
      `a2_group` multi-select filter and a filter for every other ta2 column
      (`a2_paid`/`a2_mp_sessions`/`a2_mp_avg_pct`/`a2_mp_stddev`/`a2_vp_sessions`/`a2_vp_avg_vp`/
      `a2_vp_stddev`)
- [ ] On the tpl tab, confirm `pl_grade` (multi-select) and `pl_all_results` (All/Yes/No) filters
      appear and actually narrow the player list
- [ ] On the tpa tab, confirm `plid1`/`plid2` columns show next to `player1`/`player2` and their
      text filters narrow the list correctly
- [ ] On the ts1 and ts2 tabs, confirm every filter still works after the internal renames (no
      behavior change expected, renames only)
- [ ] Confirm `/owner/pipeline`'s stats sub-rows' SQL popovers still show the correct
      group-classification `CASE WHEN...` expression after the constant extraction (no visible
      change expected)
- [ ] Confirmed via `npx tsc --noEmit` and `npm run build` (both passed) — the constant extraction
      and all renames are otherwise a pure internal refactor with no new user-facing behavior to
      verify beyond the items above
- [ ] On the tpa tab, confirm partnerships now show once each (not once per group A/B/C/all), with
      only `pa_paid`/`player1`/`plid1`/`player2`/`plid2` columns and filters (no `a2_*` columns)
- [ ] Click a partnership row on the tpa tab and confirm it just highlights (no expand panel
      appears below it anymore — that's now the `ta2` tab's job)
- [ ] Click a player row on the tpl tab and confirm it just highlights (no `tre_results`/
      `ta1_player_stats` expand panels appear below it anymore)
- [ ] Confirm 9 tabs appear in this order: ts1, ts2, tse, tre, tpl, tpa, ta1, ta2, Filters
- [ ] Click the ta1 tab, click Load, and confirm all 8 columns (a1_plid, a1_group, a1_mp_sessions,
      a1_mp_avg_pct, a1_mp_stddev, a1_vp_sessions, a1_vp_avg_vp, a1_vp_stddev) show with working
      filters (a1_group as multi-select)
- [ ] Click the ta2 tab, click Load, and confirm all 8 columns (a2_paid, a2_group, and its
      mp/vp columns) show with working filters (a2_group as multi-select)
- [ ] Click a player row on the tpl tab, then switch to the ta1 tab and click Load — confirm
      `a1_plid`'s filter is pre-filled with that player's plid, narrowing to just their rows
- [ ] Click a partnership row on the tpa tab, then switch to the ta2 tab and click Load — confirm
      `a2_paid`'s filter is pre-filled with that partnership's paid
- [ ] Click a partnership row on the tpa tab, then switch to the tpl tab — confirm `pl_plid`'s
      filter is NOT pre-filled (tpa contributes plid1/plid2/paid, not a plain plid) — then switch
      to the ta1 tab and confirm it also isn't pre-filled, for the same reason
- [ ] Click a player row on the tpl tab, then switch to the tpa tab — confirm the new "Player
      (either side)" filter is pre-filled with that player's plid, and the partnership list
      narrows to only partnerships involving them (checking both the plid1 and plid2 sides)
- [ ] Click a session row on the tse tab, then switch to the tre tab — confirm `re_seid`'s filter
      is pre-filled with that session's seid
- [ ] Click a result row on the tre tab, then switch to the tse tab — confirm `se_run_id`'s filter
      is pre-filled with that result's session's run_id (via the shared run_id, set when the tse
      row was originally clicked) — if this is the first click, click a ts1 or ts2 row instead to
      confirm run_id propagates from there
- [ ] Click the Filters tab and confirm every shared key you've set during this testing session
      appears listed, each showing a readable label where one was captured (e.g. player name) or
      the raw value otherwise
- [ ] On the Filters tab, click a key's × and confirm it's removed from the list; switch to a tab
      that reads that key and confirm its filter is no longer pre-filled on next load
- [ ] On the Filters tab, manually pick a key (e.g. paid) and type a raw value, click Add, and
      confirm it appears in the list (with no label, just the raw value) and pre-fills the
      matching tab's filter
- [ ] Confirm attribute filters (club, grade, tournament, event_type, day_of_week, is_summary, name
      searches, percentage, etc.) never get pre-filled from another tab — only the 6 shared keys do
- [ ] On the ts2 tab, confirm player1/player2 names now show next to plid1/plid2 and both are
      filterable by name
- [ ] On the tre tab, confirm player1/player2 names now show next to re_paid and both are
      filterable by name
- [ ] On the ta1 tab, confirm the player's name shows next to a1_plid and is filterable
- [ ] On the ta2 tab, confirm player1/player2 names show next to a2_paid and both are filterable
- [ ] On the ta1/ta2 tabs, type "1" into any of the mp/vp sessions/avg/stddev filters and confirm
      it does NOT match a row whose value is 18 (or any other number containing "1") — only rows
      whose value is exactly 1
