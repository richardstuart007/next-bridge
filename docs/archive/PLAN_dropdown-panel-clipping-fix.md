# PLAN_dropdown-panel-clipping-fix — next-bridge

## Title
Fix MySelectMulti dropdown panel getting clipped when a filtered table has few/no rows

## Plan
- [x] User reported: filtering a table down to 0 (or very few) rows causes other `MySelectMulti`-
      backed dropdowns on that same table to render truncated, making some options impossible to
      select. Root cause: the table's `overflow-x-auto` scroll wrapper — added for horizontal
      column scrolling — silently also clips vertically per the CSS spec rule that promotes a
      `visible` overflow axis to `auto` when the other axis is non-`visible`. The wrapper's height
      shrinks to fit whatever content (row count) is currently inside it, so a short/empty table
      leaves no room below the header for an open dropdown panel to render into, and the wrapper's
      now-vertical clipping cuts it off.
- [x] Considered a portal/floating-ui-based fix (dropdown escapes the DOM hierarchy entirely) but
      the user redirected to a simpler, fully local fix: give the wrapper a minimum height that's
      always tall enough to contain a fully-open dropdown panel, regardless of how many rows the
      table currently has.
- [x] Identified a prerequisite this project depends on but can't implement itself: the dropdown
      panel (`MySelectMulti`, from `nextjs-shared`) currently has no height cap at all, so a long
      option list (Club has 110 distinct values on local data) would need an impractically tall
      wrapper to never clip. A companion `nextjs-shared` change (capping the panel's height with
      its own internal scrollbar) is required for this fix to fully work for large option lists —
      tracked and implemented separately in that project, not here (project isolation; this
      session only produced chat instructions for it, which belong in nextjs-shared's own plan).
- [x] Agreed the next-bridge-side fix (this session executes this part):
      - Add to `src/lib/constants.ts`: `TABLE_MIN_VISIBLE_ROWS = 8` (agreed after checking that
        4 rows' worth of headroom — ~132px — isn't enough to contain a 240px capped panel without
        clipping; 8 rows fully contains it), `TABLE_ROW_HEIGHT_PX = 33` (measured from the
        `text-sm` + `py-1.5` + 1px border row styling used by these tables),
        `TABLE_HEADER_HEIGHT_PX = 90` (covers the tallest 2-row filter header among the affected
        tables — Home Players' stacked NZ#-input-plus-checkbox cell is the worst case), and
        `TABLE_MIN_HEIGHT_PX = TABLE_HEADER_HEIGHT_PX + TABLE_MIN_VISIBLE_ROWS * TABLE_ROW_HEIGHT_PX`
        (= 354).
      - Apply `style={{ minHeight: TABLE_MIN_HEIGHT_PX }}` to the `overflow-x-auto` wrapper `div`
        in the 4 places found with this exact pattern (a `MySelectMulti`-backed dropdown inside an
        `overflow-x-auto`-wrapped table): `src/ui/home/HomePageClient.tsx` (Players tab),
        `src/ui/player/PartnersTable.tsx`, `src/ui/player/PlayerPageClient.tsx` (Player History
        tab), `src/ui/admin/DataTableShared.tsx` (`DataTable`, shared by all 8 `/owner/builddata`
        tabs). Tailwind can't generate a class from this computed constant (same reasoning as the
        earlier `HOME_MAX_WIDTH_PX` case), hence the inline `style`.
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build
- [x] While testing the reinstalled version, user requested specific trigger widths for several
      Home page dropdowns (Rank/Grade/Club w-40/w-96, Day/Type/Scoring/Summary w-40, Tournament
      Name search w-96), as named constants in `src/lib/constants.ts`. First pass wired these in as
      per-call-site `overrideClass` props (only at the Home page call sites) — user caught that
      this left `GradeSelect`/`ClubSelect` inconsistent on Rankings (same shared component, never
      updated). Corrected: `WIDTH_RANK`/`WIDTH_GRADE`/`WIDTH_CLUB` are now each baked in as the
      *default* `overrideClass` inside `RankSelect`/`GradeSelect`/`ClubSelect` themselves
      (`src/ui/shared/LookupSelects.tsx`), so every existing and future call site of these
      components gets the same width automatically — no per-page wiring needed. Day/Type/Scoring/
      Summary/Tournament-Name widths stay as call-site `overrideClass` props since those filters
      are Home-Sessions-tab-only (no cross-page reuse today).
- [x] User separately reported: Home Sessions tab's "no rows" branch replaced the *entire* table
      (including the header/filter row) with a plain message whenever the current filter matched
      zero sessions — unlike the Players tab, which always keeps the table+filters rendered and
      only the body content changes. This blocked correcting an over-narrow filter, since the
      filter controls themselves disappeared along with the table. Fixed in
      `src/ui/home/HomePageClient.tsx`: the table (with its header/filter row) now always renders
      past the initial loading state; the empty case is a single `colSpan` row inside `<tbody>`,
      matching the Players tab.
- [x] Audited every other filtered table in the project for the same structural bug (whole table
      disappearing on 0 filtered rows, as opposed to just showing an empty-state row): Home Players
      tab, Rankings (both sub-tabs), and `DataTable` (`DataTableShared.tsx`, shared by all 8
      `/owner/builddata` tabs) were already correct. `PartnersTable.tsx` and `PlayerPageClient.tsx`
      (Player History tab) were structurally fine but had no "no rows match filter" placeholder at
      all (tbody would just render empty) — added one to each, matching the others.
- [x] Consolidated the "no rows match filter" `<tr><td colSpan>` message, which by this point had
      3 independently-hand-written near-duplicate copies (with 2 more pre-existing bespoke versions
      in Rankings) into one shared `TableEmptyRow` component
      (`src/ui/shared/TableEmptyRow.tsx`), used by all 6 tables. Kept local to next-bridge for now
      per user's explicit direction (no project-specific dependency, so a nextjs-shared promotion
      is a reasonable later step, just not now).
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build
- [x] User converted the Home Sessions tab's Scoring filter from a single-select (`ScoringTypeSelect`,
      one value or "All") to a multi-select, matching Day/Tournament-Type's existing `StringMultiSelect`
      pattern. Changes: `scoringFilter` state is now `Set<string>` (default the full `SCORING_TYPES`
      set, matching the "every selected = no filter" convention); `SessionFilters.scoring` in
      `src/lib/actions/sessions.ts` changed from `string` to `string[]`, with `buildSessionFilters`
      switched from a `=` comparison to an `IN` filter (matching `days`/`clubs`/`tournamentTypes`,
      already array-based); the query-sending check uses `isSelectionFiltering` like the other
      Sessions-tab multi-selects. First pass wired this as an inline `<StringMultiSelect
      options={[...SCORING_TYPES]} .../>` at the one call site — user caught that `SCORING_TYPES`
      is a fixed, reusable value set (like `TOURNAMENT_TYPES`) and should be its own dedicated
      component, per the standing "build once, use many" rule. Corrected: added
      `ScoringTypeMultiSelect` to `src/ui/shared/ScoringTypeSelects.tsx` (wrapping
      `StringMultiSelect` with `SCORING_TYPES` and `WIDTH_SCORING` baked in), alongside the
      existing `ScoringTypeSelect`/`ScoringTypeToggle`; `HomePageClient.tsx` now uses
      `<ScoringTypeMultiSelect selected={scoringFilter} onChange={setScoringFilter} />`.
- [x] User requested the Sessions tab's Summary filter (previously a single-select
      All/Summary/Session) become the same standard multi-select component. Added
      `SUMMARY_TYPES = ['Summary', 'Session']` to `constants.ts` and a new
      `SummaryTypeMultiSelect` (`src/ui/shared/SummaryTypeSelects.tsx`, same pattern as
      `ScoringTypeMultiSelect`) built as a dedicated component from the start this time, not
      inlined. `summaryFilter` is now `Set<string>` (both selected = no filter). Server side:
      `SessionFilters.summary: 'all'|'summary'|'session'` replaced with `summaryTypes?: string[]`
      in `src/lib/actions/sessions.ts`; since `se_is_summary` is a boolean column (not a literal
      IN-able value), `buildSessionFilters` only pushes a filter when exactly one of the two is
      selected (`summaryTypes.length === 1`), translating to `= 'true'` or `<> 'true'` — the "both
      or neither selected" cases never reach this branch since the caller only sends `summaryTypes`
      when `isSelectionFiltering` is true, which for a 2-item set means exactly one is selected.
- [x] User reported a real bug on the Players tab: selecting a Rank/Grade/Club value that matched
      zero players, then changing the filter again, caused the filter selections to silently reset
      back to "All" ("it waits, then rebuilds back to all"). Root cause: the Players tab's loading
      gate was `loadingPlayers && players.length === 0` — intended to only show a full-page
      "Loading…" (replacing the whole table) before the very first fetch, but it re-fired on *any*
      subsequent fetch too, as long as the *previous* result happened to be empty (a common state
      right after narrowing a filter to zero matches). Each re-fire unmounted the whole table,
      including `RankSelect`/`GradeSelect`/`ClubSelect` — remounting them from scratch, which
      re-ran their `onOptionsLoaded` callback and reset the live selection back to the full option
      set (since `savedRef.current` only reflects the original sessionStorage snapshot, not the
      current in-session selection). Fixed by adding a `hasLoadedPlayersOnce` flag (set once,
      permanently, after the first fetch completes) and gating the full-page loading branch on
      `!hasLoadedPlayersOnce` instead — the table now only unmounts before the very first load,
      never again afterward, so `RankSelect`/`GradeSelect`/`ClubSelect` only ever mount once.
      Audited the Sessions tab for the identical latent bug (`loadingSessions && sessions.length
      === 0`, with `ClubSelect`'s `onOptionsLoaded` similarly resetting unconditionally) — not yet
      reported by the user but the exact same shape — fixed the same way with
      `hasLoadedSessionsOnce`.
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build
- [x] User reported the Summary dropdown showed a nonsense count (e.g. "4 selected") instead of
      "All". Root cause: the sessionStorage restore code for `fDays`/`scoringFilter`/`summaryFilter`
      blindly trusted whatever was in storage (`setSummaryFilter(new Set(s.summaryFilter))`) with
      no validation — unlike Rank/Grade/Club, which already filter restored values against the
      live option list. A stale `home_state` blob saved before today's Summary/Scoring conversion
      (when these were plain strings, not arrays) would have `new Set("someString")` silently
      produce a set of that string's unique characters instead of erroring. Fixed by validating
      restored `fDays`/`scoringFilter`/`summaryFilter` values against `DAYS`/`SCORING_TYPES`/
      `SUMMARY_TYPES` before applying them (only setting state if at least one valid value remains),
      matching the pattern Rank/Grade/Club already used.
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build
- [x] User requested Rankings page changes (both Players and Partnerships tabs, which share the
      `scoring`/`min` state): (1) the MP/VP/XIMP picker should be a simple dropdown, not the
      `ScoringTypeToggle` pill/button-group it was — swapped to the existing `ScoringTypeSelect`
      component (already built, no new component needed) at both tab headers. (2) The "≥ N
      sessions" dropdown, previously a closure-based inline function (`SessionsSelect`, recreated
      every render, referencing `min`/`setMin` via closure) was extracted into a proper standalone
      component `SessionsMinSelect({ value, onChange })` at module scope, with its option list
      promoted to a named `SESSIONS_MIN_OPTIONS` constant. (3) User then asked for Tournament Type
      (currently `GroupToggle`, a single-select All/A/B/C toggle) to also become a multi-select
      component — investigated first and found this doesn't fit the data model: `ta1_player_stats`/
      `ta2_partner_stats` only ever store one row per player per group, where group is exactly one
      of `'A'`/`'B'`/`'C'`/`'all'` (`'all'` being a separately, independently computed aggregate —
      not a union of A/B/C at query time, confirmed in `statsCompute.ts`). A true multi-select
      allowing e.g. just "A+B" selected has no corresponding precomputed row. Flagged this to the
      user before implementing; user agreed to drop the idea — `GroupToggle` stays as a single-select
      toggle, unchanged.
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build

## Changes

### src/lib/constants.ts
- Added `TABLE_MIN_VISIBLE_ROWS = 8`, `TABLE_ROW_HEIGHT_PX = 33`, `TABLE_HEADER_HEIGHT_PX = 90`,
  and `TABLE_MIN_HEIGHT_PX` (their sum, = 354) — see the file's own comment for the reasoning
  behind each value.

### src/ui/home/HomePageClient.tsx, src/ui/player/PartnersTable.tsx, src/ui/player/PlayerPageClient.tsx, src/ui/admin/DataTableShared.tsx
- Added `style={{ minHeight: TABLE_MIN_HEIGHT_PX }}` to each file's `overflow-x-auto` table-scroll
  wrapper `div`, so the wrapper never becomes too short to contain a fully-open `MySelectMulti`
  dropdown panel, regardless of how many rows the (possibly filtered-down) table currently has.

### Dependency on nextjs-shared (not part of this project's changes)
- This fix relies on a companion change to `nextjs-shared`'s `MySelectMulti` (capping the dropdown
  panel's height with its own internal scrollbar, currently unbounded). That change — including
  its own demo/test-harness updates — belongs in `nextjs-shared`'s own plan/history, not here; it
  was mistakenly designed in detail in this next-bridge session instead of a nextjs-shared one, so
  the implementation specifics were removed from this file. Until it's applied there, committed,
  pushed, and pulled into next-bridge via `/reinstall`, a very long option list (e.g. Club) can
  still render an impractically tall panel even with the min-height fix below in place.
- Also found a second, related issue: an open dropdown panel can widen its table's
  `overflow-x-auto` scrollbar sideways (the panel is an absolutely-positioned descendant, which
  still counts toward that ancestor's scrollable width even though it's out of normal flow). Same
  root cause as the vertical clipping above, just in the other axis — being addressed in
  nextjs-shared, not here.
- **Update:** `nextjs-shared@2.1.57` picked up via `/reinstall` — `npx tsc --noEmit` and
  `npm run build` both pass with zero code changes required (fully backward compatible). Also
  fixes the horizontal-scrollbar issue above: the panel no longer sizes to its own content
  (`min-w-max` removed) — it now defaults to the trigger button's rendered width, so it can't
  inflate a table's scrollable width sideways anymore. Tradeoff: option labels wider than the
  panel are now silently clipped (`whitespace-nowrap` + `overflow-x-hidden`, no scrollbar, no
  ellipsis) — documented in `CONSUMING_PROJECTS.md` as intentional, fix on demand via a new
  `mergePanelWidthClass` prop. `LookupSelects.tsx` doesn't forward that prop yet — not added
  speculatively; see Testing below for the specific case to watch for first.

### src/lib/constants.ts
- Added `WIDTH_RANK`, `WIDTH_GRADE`, `WIDTH_CLUB` (`'w-40'`, `'w-40'`, `'w-96'`), and
  `WIDTH_DAY`, `WIDTH_TOURNAMENT_TYPE`, `WIDTH_SCORING`, `WIDTH_SUMMARY` (all `'w-40'`), and
  `WIDTH_TOURNAMENT_NAME` (`'w-96'`) — named per dropdown, per the project's constants convention.

### src/ui/shared/LookupSelects.tsx
- Added an `overrideClass?: string` pass-through prop to `LookupProps`/`LookupBase`/
  `StringMultiSelect`, merged against the shared `TRIGGER_OVERRIDE_CLASS` via `myMergeClasses`.
- `ClubSelect`/`GradeSelect`/`RankSelect` now default `overrideClass` to `WIDTH_CLUB`/
  `WIDTH_GRADE`/`WIDTH_RANK` respectively (`overrideClass ?? WIDTH_X`) — baked into the component
  itself, not left to each call site, so every current and future usage gets the same width
  automatically. `EventTypeSelect` has no default width yet (none requested).

### src/ui/home/HomePageClient.tsx
- Sessions tab: table (with header/filter row) now always renders past initial load; "No sessions
  found" moved to a single `colSpan={8}` row inside `<tbody>` instead of replacing the whole table.
- Applied `WIDTH_DAY`/`WIDTH_TOURNAMENT_TYPE`/`WIDTH_SCORING`/`WIDTH_SUMMARY` to the Sessions tab's
  Day/Tournament-Type/Scoring/Summary filters, and `WIDTH_TOURNAMENT_NAME` to the Tournament Name
  column header and its search input (via `myMergeClasses`, replacing just the width piece of the
  shared `SELECT_CLS`/`INPUT_CLS` constants at these call sites).
- Removed the Rank/Grade/Club `overrideClass` props added in an earlier pass at this file's call
  sites, now that those widths are baked into the components themselves.

### src/ui/shared/TableEmptyRow.tsx (new)
- New local component: `<TableEmptyRow colSpan={N} message="..." />`, a single `<tr><td colSpan>`
  empty-state row. Local to next-bridge for now (no project-specific dependency — a nextjs-shared
  promotion is a reasonable later step per the user's direction, not done now).

### src/ui/player/PartnersTable.tsx, src/ui/player/PlayerPageClient.tsx
- Added a "No results match the current filters." empty-state row (`TableEmptyRow`) to each
  table's `<tbody>` — previously these just rendered no rows at all, no message.

### src/ui/rankings/RankingsPageClient.tsx
- Both existing empty-state rows (Players/Partnerships) now use `TableEmptyRow` instead of each
  hand-writing its own `<tr><td colSpan>` markup.

### src/ui/admin/DataTableShared.tsx
- `DataTable`'s "No rows match filter" row now uses `TableEmptyRow` instead of its own bespoke
  markup (previously slightly different padding/text size from the other tables).

### src/lib/constants.ts
- Added `SUMMARY_TYPES = ['Summary', 'Session']`.

### src/ui/shared/ScoringTypeSelects.tsx
- Added `ScoringTypeMultiSelect` — wraps `StringMultiSelect` with `SCORING_TYPES`/`WIDTH_SCORING`
  baked in as defaults.

### src/ui/shared/SummaryTypeSelects.tsx (new)
- New file, same pattern as `ScoringTypeSelects.tsx`: `SummaryTypeMultiSelect` wraps
  `StringMultiSelect` with `SUMMARY_TYPES`/`WIDTH_SUMMARY` baked in.

### src/lib/actions/sessions.ts
- `SessionFilters.scoring` changed from `string` to `string[]`; `SessionFilters.summary:
  'all'|'summary'|'session'` replaced with `summaryTypes?: string[]`.
- `buildSessionFilters`: scoring filter switched from `=` to `IN` (array-based, matching
  `days`/`clubs`/`tournamentTypes`). Summary filter rewritten to only push a filter when exactly
  one of `SUMMARY_TYPES`' two values is selected, translating to `se_is_summary::text = 'true'` or
  `<> 'true'` (a boolean column can't take a literal `IN` against string labels).

### src/ui/home/HomePageClient.tsx
- `scoringFilter`/`summaryFilter` are now `Set<string>` (previously a single string each), with
  matching sessionStorage save/restore and `isSelectionFiltering`-gated query params. Scoring's
  `<ScoringTypeSelect>` and Summary's raw `<MySelect>` (with hardcoded `<option>`s) replaced with
  `<ScoringTypeMultiSelect>`/`<SummaryTypeMultiSelect>`. Removed the now-unused `MySelect` import
  and `SELECT_CLS` constant (both filters that used them are now `MySelectMulti`-backed).
- Fixed a real bug: added `hasLoadedPlayersOnce`/`hasLoadedSessionsOnce` state (set once, after
  each tab's first fetch ever completes) and changed both tabs' full-page loading gates from
  `loading && data.length === 0` to `!hasLoadedOnce` — previously, any refetch that happened while
  the *previous* result was empty (e.g. right after narrowing a filter to zero matches) re-fired
  the same condition, unmounting the whole table including `RankSelect`/`GradeSelect`/`ClubSelect`.
  Remounting those components re-ran their `onOptionsLoaded` callback, which silently reset the
  user's live filter selection back to "select all" — the reported "selection reverts to All" bug.
- Added restore-time validation for `fDays`/`scoringFilter`/`summaryFilter` against
  `DAYS`/`SCORING_TYPES`/`SUMMARY_TYPES` (filtering out anything not a currently-valid option
  before applying, only setting state if at least one valid value remains) — fixes stale
  sessionStorage from before today's Scoring/Summary conversion producing a nonsense selected
  count instead of "All".

### src/ui/rankings/RankingsPageClient.tsx
- Replaced `ScoringTypeToggle` with `ScoringTypeSelect` (a plain dropdown, already existed — no
  new component) at both the Players and Partnerships tab headers' MP/VP/XIMP picker.
- Extracted the "≥ N sessions" dropdown from a closure-based inline function (`SessionsSelect`,
  redefined every render) into a proper module-level component, `SessionsMinSelect({ value,
  onChange })`, with its `[5, 10, 20, 50]` option list promoted to a named `SESSIONS_MIN_OPTIONS`
  constant. Also lifted the shared `sel` select-styling string to module scope (`SEL_CLS`) so the
  new component can use it outside the main component's closure.
- Considered converting Tournament Type (`GroupToggle`) to a multi-select + dedicated component,
  matching today's other conversions — investigated the stats tables first and found this doesn't
  fit the data model (only single-group or a separately-computed 'all' aggregate exist, no
  precomputed combination for an arbitrary subset like "A+B"). Flagged to the user; dropped.
  `GroupToggle` is unchanged.

## Testing
- [ ] Home page → Players tab: filter Club (110 options) down to a single value that produces 0
      matching players, then open the Rank or Grade dropdown — confirm the full panel (including
      its own internal scrollbar, once the nextjs-shared dependency above is applied) is visible
      with nothing cut off at the bottom
- [ ] Home page → Players tab: repeat the same check by filtering Rank or Grade down to 0 rows,
      then opening the Club dropdown
- [ ] `/player/[id]` → Player History tab: filter down to 0 rows via any filter, then open the Club
      dropdown and confirm it isn't clipped
- [ ] `/player/[id]` → All Partners History: filter down to 0 rows, then open the Club or Event
      Type dropdown and confirm it isn't clipped
- [ ] `/owner/builddata`: pick any tab (e.g. `tse`), filter a column down to 0 matching rows, then
      open a `MySelectMulti`-backed filter dropdown (e.g. `se_club`) on that same tab and confirm
      it isn't clipped
- [ ] Spot-check a table with plenty of rows (no filters applied) on each of the 4 pages above and
      confirm there's no visible layout change — the `min-height` should only matter when a table
      is short, not when it's already tall
- [ ] Open the Club dropdown anywhere it appears (110 options, some up to 26 characters like
      "Remuera Bowls & Bridge Inc") and check for clipped/cut-off club names — especially on a
      page where the widest club name isn't currently visible in the column's own data. If any
      are clipped, the fix is adding `mergePanelWidthClass` pass-through to `ClubSelect`/
      `LookupBase` in `src/ui/shared/LookupSelects.tsx` (not yet added — confirm the need first)
- [x] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass cleanly (re-confirmed after
      `/reinstall` to nextjs-shared@2.1.57, zero code changes required)
- [ ] Home page → Players tab: confirm Rank/Grade/Club triggers render at their new widths
      (w-40/w-40/w-96), and confirm Rankings' Grade/Club dropdowns now match the same widths
      (previously only Home's were updated — now baked into the components themselves)
- [ ] Home page → Sessions tab: confirm Day/Type/Scoring/Summary triggers are w-40, Tournament Name
      column/search is w-96
- [ ] Home page → Sessions tab: filter down to 0 matching sessions and confirm the table header and
      all filter dropdowns remain visible and usable (previously the whole table, filters included,
      was replaced by a plain message — this was the reported bug)
- [ ] Confirm a "No results match the current filters." message now appears (instead of a silently
      empty table body) when filtering `/player/[id]`'s Player History tab or All Partners History
      down to 0 rows
- [ ] Spot-check that Rankings' Players/Partnerships empty states and `/owner/builddata`'s "No rows
      match filter" still look correct after switching them to the shared `TableEmptyRow` component
- [x] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass cleanly
- [ ] Home page → Sessions tab: confirm Scoring and Summary now open as checkbox multi-selects
      (not single native dropdowns), each showing "All" by default
- [ ] Home page → Players tab: select a Rank/Grade/Club value that matches 0 players, then change
      the filter again (e.g. pick a different Rank) — confirm the selection updates correctly and
      does **not** silently reset back to "All" (the reported bug)
- [ ] Home page → Sessions tab: repeat the same 0-match-then-change check on Club
- [x] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass cleanly
- [ ] Home page → Summary filter: confirm it now shows "All" by default (not a stale/nonsense
      count) — clear sessionStorage first (or use "Clear filters") if it still shows a stale value
      from before today's changes
- [ ] Rankings page → both Players and Partnerships tabs: confirm the MP/VP/XIMP picker is now a
      plain dropdown (not the pill toggle), and confirm changing it on one tab is reflected on the
      other (shared `scoring` state)
- [ ] Rankings page → both tabs: confirm the "≥ N sessions" dropdown still works identically after
      being extracted into `SessionsMinSelect`
- [ ] Rankings page: confirm Tournament Type (All/A/B/C) is unchanged — still a single-select toggle
- [x] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass cleanly
