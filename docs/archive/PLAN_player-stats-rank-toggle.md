# PLAN_player-stats-rank-toggle — next-bridge

## Title
Show performance rank alongside average on player stats table, with a scoring-type toggle

## Plan
- [x] `src/lib/actions/players.ts` — `getPlayerAllGroupStats()`: add two window functions to the
      existing `all_ranked` CTE (which already computes `pct_rank` for consistency):
      `RANK() OVER (PARTITION BY a1_group, a1_scoring ORDER BY a1_avg DESC) AS avg_rank` and
      `COUNT(*) OVER (PARTITION BY a1_group, a1_scoring) AS group_total`. Select both in the outer
      query and add `avg_rank: number` / `group_total: number` to the function's return type.
      Volume/activity rank (ranking by session count) is explicitly not needed — confirmed with
      the user, only the performance (average) rank matters.
- [x] `src/ui/player/PlayerPageClient.tsx` — add a `statsScoring` state (default `'MP'`),
      persisted via the same `sessionStorage` save/restore pattern this page already uses for its
      other filters (`playerStorageKey`/`loadPlayerSaved`/the existing save effect) — confirmed
      with the user that the selection should be remembered across visits, same as other filters
      on this page.
- [x] Add a `ScoringTypeToggle` control (already imported on this page, already used for the Graph
      view) above the stats table, bound to `statsScoring`.
- [x] Restructure the stats table from "3 scoring types × 3 metrics side by side" (current
      2-row header with `SCORING_TYPES.map` column groups) to one flat table for whichever scoring
      type is currently toggled: rows stay Tournament Type (A/B/C/All), columns become Avg,
      Sessions, Consistency (dropping the per-scoring-type column repetition and the `Fragment`
      grouping logic, since only one scoring type renders at a time now).
- [x] Avg column shows the rank fraction alongside the value, e.g. `54.83% · 42 of 4,597`
      (smaller/secondary text for the fraction part) — only when `sessions > 0`, matching the
      existing "—" placeholder pattern for groups/scoring types with no data.
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build
- [ ] User flagged that `consistencyLabel()`'s thresholds/labels in `PlayerPageClient.tsx` are
      hardcoded decisions (percentile cutoffs 0.25/0.50/0.75, plus the label text and Tailwind
      color class for each band) that belong in `src/lib/constants.ts`, not buried inline in the
      component. Confirmed via grep this logic isn't duplicated anywhere else yet. Plan: add a
      `CONSISTENCY_LEVELS` constant (an ordered array of `{ max, text, cls }`, ending with
      `Infinity` for the "Wild" catch-all) to `constants.ts`, and rewrite `consistencyLabel()` to
      find the first matching level instead of the current if/else chain of literals
- [x] Implemented and verified (`npx tsc --noEmit` + `npm run build` both pass)
- [ ] User asked for the rank to be in its own column, not inline within the Avg cell as secondary
      text. Plan: add a new "Rank" column (header + `td`) between Avg and Sessions, showing
      `{avg_rank} of {group_total}`; Avg cell goes back to showing only the formatted value
- [x] Implemented and verified (`npx tsc --noEmit` + `npm run build` both pass)
- [ ] User asked to move the top "Player info" panel's Club/Rank/Grade/Rating/A-B-C-points row and
      the Scoring-toggle stats table into a new tab called "Player Stats", alongside the existing
      "Player History"/"All Partners History" tabs. Plan: keep the back-nav link + name/NZ#/
      Tracked-badge row as the persistent header (identifies which player regardless of active
      tab); widen `activeTab` from `'history' | 'partners'` to `'history' | 'partners' | 'stats'`
      (including the sessionStorage restore-guard check); add "Player Stats" as a new tab —
      positioned first, since this was the info always shown immediately before — rendering the
      moved Club/Rank/Grade/Rating/points block plus the Scoring toggle and stats table, gated on
      `activeTab === 'stats'` the same way the other two tabs are gated. Default `activeTab`
      stays `'history'` (unchanged) unless told otherwise
- [x] Implemented and verified (`npx tsc --noEmit` + `npm run build` both pass)
- [ ] User reported "All Partners History" on `/player/[id]` shows data unrelated to the player
      being viewed. Confirmed real bug in `PartnersTable.tsx` line 133: each partner's fetch is
      `` `/api/players/${p.id}/results` `` with no `partner_id` filter, so it pulls that partner's
      *entire* history with *all* their own partners, not just sessions played with the main
      player. Fix: the route already supports a `partner_id` query param (ANDs an additional
      `(pa_plid1 = $partner_id OR pa_plid2 = $partner_id)` filter) — add a `playerId: number` prop
      to `PartnersTable` and change the fetch to
      `` `/api/players/${p.id}/results?partner_id=${playerId}` ``, restricting each partner's rows
      to sessions played specifically with the viewed player. Consequence: the table's "Partner"
      column (`r.partner_name`) will then show the main player's own name on every row (redundant,
      since the partnership is now always exactly {that partner, this player}) — remove that
      column. `PlayerPageClient.tsx`'s `<PartnersTable partners={uniquePartners} />` call needs
      `playerId={playerId}` added
- [x] Implemented and verified (`npx tsc --noEmit` + `npm run build` both pass)
- [x] **Superseded** — user asked for selected items to float to the top of the Club dropdown
      (then confirmed it should apply to Grade/Rank too), but then redirected: this is a
      requirement the user has already implemented in other projects, and belongs as a prop on
      `nextjs-shared`'s `MySelectMulti` component, not hand-rolled again in this project's local
      `src/ui/shared/LookupSelects.tsx`. Confirmed via `nextjs-shared` git history: this landed
      there directly (commit `04c1d04`, "MySelectMulti floating selections") as unconditional
      default behavior, not an opt-in prop as originally proposed — `next-bridge` picked it up via
      `/reinstall` (nextjs-shared 2.1.52).
- [ ] User then asked to migrate `LookupSelects.tsx`'s hand-rolled `ClubSelect`/`GradeSelect`/
      `RankSelect`/`EventTypeSelect` onto `nextjs-shared/MySelectMulti` to actually get that
      behavior in next-bridge. Investigated call sites before touching anything and found a real
      semantic split, not a clean 1:1 swap:
      - **`mode='any'`** (RankSelect/Home, GradeSelect/Home+Rankings, ClubSelect/Home+Rankings,
        EventTypeSelect/BuildDataViewer — 4 call sites): empty selected = no filter. Maps cleanly
        onto `MySelectMulti`, which already treats empty `selected` as "All" natively.
      - **`mode='all'`** (ClubSelect/Home-Sessions+Partners+Player, EventTypeSelect/Partners+
        Player, plus direct `StringMultiSelect` for day-of-week/tournament-type — 6 call sites):
        *all* selected = no filter, with a one-click "select everything" row. This is the inverse
        of `MySelectMulti`'s native convention — inverting the stored selection at the wrapper
        boundary would work data-wise but would show checked boxes meaning "excluded" and float
        the *deselected* items to top, defeating the point of migrating.
      - User decided: don't migrate anything yet. Propose a `nextjs-shared` extension for the
        `mode='all'` convention first (see chat message with the exact instruction); only do the
        *full* migration (`any` and `all` call sites together) once that prerequisite lands.
        **Nothing touched in next-bridge for this step.**
      - Refined, then simplified further by the user: a `mode` prop isn't needed at all —
        `MySelectMulti` doesn't need to know whether empty or full selection means "no filter,"
        since that interpretation is entirely the caller's own downstream filtering logic, not the
        dropdown's concern. Final design: plain independent per-item toggling (unchanged, no
        special-casing), plus a new opt-in `showSelectAll`/`selectAllLabel` prop pair (mirroring
        the existing `showReset`/`resetLabel` pattern) that adds a "select all" convenience row —
        fully backward compatible, default off, coexists independently with `showReset`. See chat
        for the final instruction text handed to a `nextjs-shared` session.
      - **What actually landed** (nextjs-shared commit `9ddaa7d`, v2.1.53 — built independently by
        the user, differs from the instruction above but is a superset that fully covers it): kept
        a `mode?: 'any' | 'all'` prop after all (default `'any'`) rather than dropping it, plus
        `selectAllLabel?: string` (default `'All'`), plus `minSelected`/`maxSelected` caps (not
        needed here). The key part for this migration: the "select all" row now renders
        **unconditionally in both modes, with no opt-out prop** — so every existing `mode='any'`
        caller gains it automatically too. `mode='all'` replicates next-bridge's `StringMultiSelect`
        exactly (individual checkboxes show unchecked while all are selected; picking one narrows
        to just that item; `showReset` is suppressed). Confirmed installed via `/reinstall`
        (nextjs-shared 2.1.53).
      - **Migration plan** (ready to execute): next-bridge's own `LookupProps.mode: 'any' | 'all'`
        already matches `MySelectMulti`'s `mode` prop 1:1 — pass straight through. Rewrite
        `LookupBase` (and `StringMultiSelect`, called directly in 4 places for day-of-week/
        tournament-type) to render `MySelectMulti` directly, converting `Set<string>` to/from
        `string[]` at the boundary so every existing call site's external API (`selected: Set
        <string>`, `onChange: (s: Set<string>) => void`) is unchanged — no call-site edits needed
        except dropping the now-dead `placeholder` prop (5 call sites pass `placeholder='All'`,
        which MySelectMulti's `mode='any'` already hardcodes as its empty-state label, so it was
        never doing anything distinct). Delete the local `MultiSelect`/`DropdownPanel` (confirmed
        via grep: `MultiSelect` has no importers outside `LookupSelects.tsx` itself once
        `LookupBase` no longer uses it). No style-preservation attempted — adopt `MySelectMulti`'s
        own default appearance, matching the precedent set by the earlier `RowsPerPageSelect` →
        `MyPaginationFooter` swap (`PLAN_pagination-footer-swap.md`), which did the same.
- [x] Implemented and verified (`npx tsc --noEmit` + `npm run build` both pass)
- [ ] User reported the migrated dropdowns are now too wide, causing layout issues. Confirmed root
      cause: `nextjs-shared`'s `MySelectMulti_dftClass` includes a fixed `w-72` (288px), while the
      old hand-rolled trigger button used `w-full` (fills whatever narrow table-filter-row `<td>`
      it sits in). User then asked to fully replicate the old trigger button's styling, not just
      its width — checked `myMergeClasses`' actual implementation (not just the summarized doc) to
      confirm exactly which prefix groups it recognizes (`w-`, padding, `text-` with a size-vs-color
      guard, `rounded`, `border` with a width-vs-color guard, `bg-`, etc.) before writing the
      override, so it would actually take effect rather than silently no-op.
- [x] Implemented: added a `TRIGGER_OVERRIDE_CLASS` constant in `LookupSelects.tsx` replicating the
      old `DropdownPanel` trigger button's exact classes (`w-full text-left rounded border
      border-gray-300 px-1.5 py-0.5 text-xs bg-white truncate text-gray-700 justify-start h-auto
      md:h-auto`), passed as `overrideClass` on both `MySelectMulti` call sites (`LookupBase` and
      `StringMultiSelect`) — verified via `npx tsc --noEmit` + `npm run build`
- [ ] User separately reported dropdown panels being clipped by the table's own scroll container.
      Root cause: `MySelectMulti`'s panel is `position: absolute`, clipped by any scrollable
      ancestor — specifically the `max-h-[760px] overflow-y-auto` wrappers around Home's Players
      and Sessions tables (a leftover from the pre-pagination "load everything, scroll internally"
      design). Asked the user whether to fix this in next-bridge (remove the now-likely-unnecessary
      vertical constraint, since pagination already caps rows per page) or in `nextjs-shared`
      (reposition `MySelectMulti`'s panel to escape clipping). User chose the next-bridge fix.
- [x] Implemented: removed `max-h-[760px] overflow-y-auto` from both tables in
      `HomePageClient.tsx`. Players tab keeps its `overflow-x-auto` wrapper (still needed — that's
      about column width, not row count, and is unrelated to the clipping bug). Sessions tab never
      had a horizontal-scroll wrapper before this fix and doesn't get one added now (not part of
      what was asked) — its wrapper `<div>` is removed entirely, table renders directly. Verified
      via `npx tsc --noEmit` + `npm run build`
- [ ] User asked whether Players/Sessions/Rankings share a width/height restriction. Checked the
      full wrapper chain: all three share **one** width cap — `src/app/page.tsx`'s
      `<div className='w-full max-w-7xl px-4 py-6'>` (1280px, no `mx-auto` so it sits flush left
      on wider screens) — since all three tabs render inside the same `HomePageClient` on the one
      Home page. No height restriction remains (the two `max-h-[760px]` wrappers were already
      removed; root `layout.tsx` doesn't cap height either). User confirmed: widen rather than
      remove the cap. Revised after discussing reference widths (Tailwind's own largest preset
      `max-w-screen-2xl` is 1536px, actually narrower than the first number discussed; `/owner`
      pages in this project already use no cap at all, full viewport width). Final agreed value:
      `max-w-[1920px]` (full-HD display width) — up from `max-w-7xl`/1280px
- [x] Implemented and verified (`npx tsc --noEmit` + `npm run build` both pass)
- [ ] User asked to move `1920` into `constants.ts`. Technical constraint: Tailwind can't generate
      a CSS rule for a class name built from a runtime value (e.g. `` `max-w-[${N}px]` ``) — it
      only detects literal class strings via static source scanning at build time, so the constant
      can't drive a Tailwind arbitrary-value class directly. Plan: add `HOME_MAX_WIDTH_PX = 1920`
      to `constants.ts`, and in `page.tsx` drop the `max-w-[1920px]` Tailwind class in favor of an
      inline `style={{ maxWidth: HOME_MAX_WIDTH_PX }}` (React appends `px` to numeric style values
      automatically) alongside the remaining `w-full px-4 py-6` Tailwind classes — the only way to
      make the constant actually the source of truth rather than a duplicate, unused number sitting
      next to a hardcoded literal — not yet implemented, needs `#code`
- [x] User ran `#reinstall` then asked to review and adjust for any `MySelectMulti` changes.
      Found a breaking change: `nextjs-shared` commit `23e06ff` (v2.1.54) removed the `mode` prop
      from `MySelectMulti` entirely (along with `showReset`/`resetLabel`) — it now unconditionally
      behaves as the former `mode='all'`: every option selected = no filter, select-all row always
      shown, individual checkboxes render unchecked while everything is selected. This broke
      `LookupSelects.tsx` (`tsc` failed: `mode` does not exist on `MySelectMulti`'s props).
      Fix: removed `mode` entirely from `LookupSelects.tsx` (`LookupProps`, `LookupBase`,
      `ClubSelect`/`GradeSelect`/`RankSelect`/`EventTypeSelect`) and every call site (11 places
      across `BuildDataViewer.tsx`, `HomePageClient.tsx`, `PartnersTable.tsx`,
      `PlayerPageClient.tsx`, `RankingsPageClient.tsx`) that passed `mode='any'`/`mode='all'`,
      since the prop is now a no-op wherever it still existed. Confirmed the actual filtering
      logic is unaffected — it lives entirely in each caller's own `.size > 0`/`.size <
      total.length` checks against the `Set<string>` state, not in the dropdown component, so
      removing `mode` doesn't change what gets filtered. Verified via `npx tsc --noEmit` +
      `npm run build`.
- [ ] **Correction**: the "0 selected instead of All" note above was wrongly assessed as purely
      cosmetic. User caught the real bug: three call sites (`HomePageClient.tsx`'s `fRanks`/
      `fGrades`/`fClubs` on the Players tab, `RankingsPageClient.tsx`'s `gradeFilter`/`clubFilter`,
      `BuildDataViewer.tsx`'s `filter_event_type`) still use the "empty selection = no filter"
      convention (`if (x.size > 0) filter`). Since `MySelectMulti` now always shows a "select all"
      row regardless of caller intent, clicking it on any of these fills `selected` with every
      option — `.size > 0` becomes true, and the *entire* option list gets sent as a `column IN
      (...)` filter (visually showing "All" while actually filtering to every known value, wasteful
      and, if the lookup list is ever stale, potentially incorrect) instead of sending no filter at
      all.
      User then asked the sharper question directly: shouldn't reaching *either* extreme (nothing
      selected, or everything selected) mean "no filter, return everything" — with only a genuine
      partial selection actually filtering? Checked the other call sites (`fSessClubs`,
      `selectedClubs`/`selectedEventTypes`/`selectedTournaments`/`fDays`/`fTournamentTypes` on
      Home/Partners/Player) already assumed to be "correct": they all use `.size < totalOptions
      .length` alone, which has the *same class* of bug from the opposite direction — a user
      manually unchecking every box down to zero (always possible, independent of the new
      select-all row) would satisfy `0 < total.length` and send an **empty** `column IN ()`
      filter, which SQL treats as "match nothing" rather than "no filter" — excluding everything
      instead of showing everything. This affects essentially every `MySelectMulti`/
      `StringMultiSelect`-backed filter in the app, not just the three originally flagged.
      (`selectedPartnerIds`/`selectedPlayerIds` in `PartnersTable.tsx`/`PlayerPageClient.tsx` are
      a separate, unrelated hand-rolled dropdown — not `MySelectMulti`-backed — out of scope here.)
      Fix (purely consumer-side, no `nextjs-shared` change needed): change every filter-active
      check from `.size > 0` or `.size < total.length` alone to the robust `0 < selected.size <
      total.length` — genuinely partial selections filter; either extreme sends no filter param
      at all, reached via the select-all row, the (removed, `mode='all'`-only) reset row, or plain
      manual checking/unchecking. Affected checks: `fRanks`/`fGrades`/`fClubs` (query-param
      sending) and `fDays`/`fSessClubs`/`fTournamentTypes` (query-param sending) in
      `HomePageClient.tsx`; `gradeFilter`/`clubFilter` (query-param sending) in
      `RankingsPageClient.tsx`; `selectedClubs`/`selectedTournaments`/`selectedEventTypes` (row
      filtering, plus `hasFilter`-style checks) in `PartnersTable.tsx` and `PlayerPageClient.tsx`;
      `filter_event_type` (row filtering) in `BuildDataViewer.tsx`. Also still pre-populate
      `fRanks`/`fGrades`/`fClubs`/`gradeFilter`/`clubFilter`/`filter_event_type` with the full
      option set via `onOptionsLoaded` (adding `rankOptions`/`gradeOptions`/`clubOptions` tracking
      state to `HomePageClient.tsx`, `gradeOptions`/`clubOptions` to `RankingsPageClient.tsx`,
      `eventTypeOptions` to `BuildDataViewer.tsx` — disambiguated from `HomePageClient.tsx`'s
      existing `sessClubOptions`, a separate Sessions-tab filter) so these six start showing "All"
      rather than "0 selected," matching the others — a visual consistency fix, not required for
      the correctness fix above, but worth doing together. `clearFilters()`-style reset functions
      should reset to the *full* set, not empty, to match "clear = show everything"

- [x] Import `isSelectionFiltering` from `nextjs-shared/isSelectionFiltering` (now implemented
      there) into every affected file and apply it as described above

## Changes

### src/lib/actions/players.ts
- `getPlayerAllGroupStats()`: added `avg_rank` (`RANK() OVER (PARTITION BY a1_group, a1_scoring
  ORDER BY a1_avg DESC)`) and `group_total` (`COUNT(*) OVER (PARTITION BY a1_group, a1_scoring)`)
  to the existing `all_ranked` CTE, selected in the outer query, and added to the return type.

### src/ui/player/PlayerPageClient.tsx
- Added `statsScoring` state (default `'MP'`), persisted via the page's existing sessionStorage
  save/restore effect alongside its other filters.
- Added a `ScoringTypeToggle` above the stats table, bound to `statsScoring`.
- Restructured the stats table: was a 2-row header with `SCORING_TYPES.map` repeating 3 columns
  (Avg/Sessions/Consistency) per scoring type side by side; now a single flat table (Tournament
  Type rows, Avg/Sessions/Consistency columns) for whichever scoring type is toggled. Removed the
  now-unused `Fragment` import along with the per-scoring-type column-grouping JSX it supported.
- `consistencyLabel()` rewritten to look up `CONSISTENCY_LEVELS` (`.find(level => pctRank <
  level.max)`) instead of an if/else chain of hardcoded thresholds/labels/classes.
- Rank moved out of the Avg cell into its own "Rank" column (between Avg and Sessions), showing
  `{avg_rank} of {group_total}`; Avg cell now shows only the formatted value again.
- Added a "Player Stats" tab (widened `activeTab` to `'stats' | 'history' | 'partners'`, positioned
  first). The top "Player info" panel now only shows the back-nav link + name/NZ#/Tracked badge;
  the Club/Rank/Grade/Rating/points row and the Scoring-toggle stats table moved into the new
  tab's content, gated on `activeTab === 'stats'` like the other two tabs.
- `<PartnersTable partners={uniquePartners} />` → `<PartnersTable partners={uniquePartners}
  playerId={playerId} />`, feeding the bug fix below.

### src/ui/player/PartnersTable.tsx
- Added a required `playerId: number` prop. Each partner's results fetch changed from
  `` `/api/players/${p.id}/results` `` to `` `/api/players/${p.id}/results?partner_id=${playerId}` ``
  — previously this pulled that partner's *entire* history with everyone they've ever played with;
  now it's restricted to sessions played specifically with the player being viewed, fixing the
  reported "All Partners History shows unrelated data" bug.
- Removed the "Partner" column (header, filter-row cell, and body cell) — with the fix above, that
  column would show the main player's own name on every row (redundant, since the partnership is
  now always exactly {that partner, this player}).

### src/lib/constants.ts
- Added `CONSISTENCY_LEVELS` — the consistency-band thresholds (0.25/0.50/0.75, plus `Infinity`
  catch-all), label text, and Tailwind color class, previously hardcoded inline in
  `PlayerPageClient.tsx`'s `consistencyLabel()`.

### src/ui/shared/LookupSelects.tsx
- Rewritten to render `nextjs-shared/MySelectMulti` instead of the local hand-rolled
  `MultiSelect`/`StringMultiSelect`/`DropdownPanel` (all three deleted). `ClubSelect`/
  `GradeSelect`/`RankSelect`/`EventTypeSelect` and the standalone `StringMultiSelect` keep their
  exact existing external API (`selected: Set<string>`, `onChange: (s: Set<string>) => void`) —
  the `Set<string>` ↔ `string[]` conversion happens at the `MySelectMulti` boundary, so no calling
  code needed to change its own state shape. `mode` passes straight through unchanged (next-bridge's
  own `'any' | 'all'` terminology already matched `MySelectMulti`'s 1:1). Removed the now-dead
  `placeholder` prop from `LookupProps` — `MySelectMulti`'s `mode='any'` hardcodes `'All'` as its
  empty-state label, which is what every caller was already passing anyway.
- Every consumer now also gets `MySelectMulti`'s "select all" row and floating-selected-to-top
  behavior for free (the original ask that started this whole chain).
- Added `TRIGGER_OVERRIDE_CLASS` (a named constant, shared by both `MySelectMulti` call sites)
  replicating the old `DropdownPanel` trigger button's exact classes — restores the narrow,
  column-filling width (`MySelectMulti`'s own default is a fixed `w-72`) plus the rest of the old
  look (border color, padding, rounding, truncate, text color).

### src/ui/admin/BuildDataViewer.tsx, src/ui/home/HomePageClient.tsx, src/ui/rankings/RankingsPageClient.tsx
- Removed the now-dead `placeholder='All'`/`placeholder='all'` props (5 call sites) from
  `RankSelect`/`GradeSelect`/`ClubSelect`/`EventTypeSelect` — no longer an accepted prop.

### src/ui/home/HomePageClient.tsx
- Removed the `max-h-[760px] overflow-y-auto` wrapper from both the Players and Sessions tables —
  a pre-pagination leftover that was clipping `MySelectMulti`'s dropdown panels. Players tab keeps
  its separate `overflow-x-auto` wrapper (column-width scrolling, unrelated and still needed);
  Sessions tab's wrapper is removed entirely (it never had horizontal-scroll protection before,
  and none is added now).

### src/app/page.tsx
- Widened the Home page's outer container from `max-w-7xl` (1280px) to `max-w-[1920px]` — the one
  shared width cap for Players, Sessions, and Rankings, since all three render inside the same
  `HomePageClient` on this one page.

### src/ui/shared/LookupSelects.tsx (nextjs-shared breaking change)
- Removed `mode` entirely (`LookupProps`, `LookupBase`, and all four exported components) —
  `nextjs-shared`'s `MySelectMulti` no longer accepts it as of v2.1.54 (commit `23e06ff`), having
  collapsed to a single unconditional "every option selected = no filter" behavior. The prop had
  become a no-op; keeping it would have been dead, misleading API surface.

### src/ui/admin/BuildDataViewer.tsx, src/ui/home/HomePageClient.tsx, src/ui/player/PartnersTable.tsx, src/ui/player/PlayerPageClient.tsx, src/ui/rankings/RankingsPageClient.tsx
- Removed `mode='any'`/`mode='all'` from all 11 call sites — no longer an accepted prop.

### src/ui/home/HomePageClient.tsx
- Imported `isSelectionFiltering` from `nextjs-shared/isSelectionFiltering`. Added `savedRef` (holds
  the sessionStorage snapshot for use by option-load callbacks) and `rankOptions`/`gradeOptions`/
  `clubOptions` tracking state.
- The mount-time restore effect no longer sets `fRanks`/`fGrades`/`fClubs` directly from saved
  state — that now happens inside each select's `onOptionsLoaded` callback once the full option
  list is known, restoring the saved partial selection if still valid or defaulting to the full set.
- `hasPlayerFilter` and `clearPlayerFilters()` now use `isSelectionFiltering(...)` against the new
  option-count state instead of raw `.size`/`.size === 0` checks; clearing resets to the full option
  sets rather than empty sets.
- Wired `onOptionsLoaded` onto `RankSelect`/`GradeSelect`/`ClubSelect` (Players tab).
- Replaced the `fRanks.size > 0` / `fGrades.size > 0` / `fClubs.size > 0` query-param checks and the
  `fDays.size < DAYS.length` / `fSessClubs.size < sessClubOptions.length` /
  `fTournamentTypes.size < TOURNAMENT_TYPES.length` checks with `isSelectionFiltering(...)`.
- Added `rankOptions.length`/`gradeOptions.length`/`clubOptions.length` to the players-fetch effect's
  dependency array.

### src/ui/rankings/RankingsPageClient.tsx
- Imported `isSelectionFiltering`. Added `gradeOptions`/`clubOptions` state, wired `onOptionsLoaded`
  onto `GradeSelect`/`ClubSelect` (defaulting to the full set — this page doesn't persist filters to
  storage, so no saved-selection restore is needed here).
- Replaced `gradeFilter.size > 0` / `clubFilter.size > 0` query-param checks with
  `isSelectionFiltering(...)`; added the new option-count state to both effects' dependency arrays.

### src/ui/player/PartnersTable.tsx
- Imported `isSelectionFiltering`. Replaced the `selectedClubs.size < clubOptions.length` /
  `selectedTournaments.size < 3` / `selectedEventTypes.size < eventTypeOptions.length` row-filter
  checks with `isSelectionFiltering(...)` (the `3` here is `['A','B','C']`'s length, matching the
  existing inline literal already used at this call site).

### src/ui/player/PlayerPageClient.tsx
- Imported `isSelectionFiltering`. Replaced the same three row-filter checks (`selectedClubs`/
  `selectedTournaments`/`selectedEventTypes`) and the equivalent lines inside the `hasFilter`
  boolean with `isSelectionFiltering(...)`. `selectedPartnerIds` (a separate, hand-rolled
  `PlayerSelect`/`PartnerSelect` dropdown, not `MySelectMulti`-backed) is unchanged — out of scope.

### src/ui/admin/BuildDataViewer.tsx
- Imported `isSelectionFiltering`. Added `eventTypeOptions` state (new — this filter previously had
  no options tracking at all) and wired `onOptionsLoaded` onto `EventTypeSelect`, defaulting to the
  full set. Replaced `filter_event_type.size > 0` with `isSelectionFiltering(...)`.

## Testing
- [ ] Open `/player/[id]` for a player with stats in multiple tournament types (e.g. A/B/C/All) —
      confirm the Scoring toggle (MP/VP/XIMP) switches the stats table between scoring types, and
      the choice persists after navigating away and back (sessionStorage)
- [ ] Confirm the new Rank column (between Avg and Sessions) shows "42 of 4,597" for every row
      that has sessions, and is blank for rows with none; confirm the Avg column shows only the
      percentage/VP/XIMP value with no rank text inside it
- [ ] Confirm Sessions and Consistency columns still render correctly (unchanged from before)
- [ ] Confirm the Consistency column's labels/colors (Consistent/Wobbly/Volatile/Wild, green
      through red) are unchanged after moving thresholds into `CONSISTENCY_LEVELS`
- [ ] Confirm `/player/[id]` shows three tabs (Player Stats, Player History, All Partners History),
      "Player Stats" is first, and it contains the Club/Rank/Grade/Rating/points row plus the
      Scoring toggle and stats table; confirm the top panel now only shows name/NZ#/Tracked badge
- [ ] Open "All Partners History" for a player with multiple partners and confirm every row shown
      genuinely involves the player being viewed (spot-check a partner with a long individual
      history — their rows here should be a small subset of their overall games, not all of them);
      confirm there's no "Partner" column showing the same name repeated on every row
- [ ] Check every migrated dropdown (Club/Grade/Rank on Home+Rankings, Club/EventType on
      Home-Sessions+Partners+Player, day-of-week/tournament-type on Home-Sessions+Partners+Player):
      confirm it still opens/closes, filters correctly, and selecting items floats them to the top
- [ ] For the `mode='any'` dropdowns (Club/Grade/Rank on Home+Rankings): confirm a new "select all"
      row now appears at the top of the panel (this is new — wasn't there before) and selects
      every option when clicked
- [ ] For the `mode='all'` dropdowns (day-of-week, tournament-type, Sessions-tab Club/EventType):
      confirm individual checkboxes appear unchecked while "All" is active, picking one narrows to
      just that item, and there's no reset-to-empty row
- [ ] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass cleanly
- [ ] Check every migrated dropdown for correct width (narrow, column-filling — not the wide
      `MySelectMulti` default) and confirm no dropdown panel is clipped by a table's scroll
      container anymore
- [ ] On a wide monitor, confirm the Home page (Players/Sessions/Rankings) now uses up to 1920px
      of width instead of stopping at 1280px, on all three tabs
- [ ] Re-check every dropdown (Club/Grade/Rank/EventType/day-of-week/tournament-type) still opens,
      filters correctly, and floats selections to the top after the `mode`-removal fix — pay
      particular attention to Home-Players' Rank/Grade/Club, Rankings' Grade/Club, and
      BuildDataViewer's EventType (the four spots that now show "0 selected" instead of "All" when
      nothing is checked — confirm this is only a label difference and filtering is still correct)
- [ ] Home page Players tab: click the "select all" row on Rank/Grade/Club (or select every option
      by hand) and confirm this returns the full unfiltered player list, not zero rows — the
      original bug this fix targets
- [ ] Home page Players tab: manually uncheck every option on Rank/Grade/Club down to zero and
      confirm this also returns the full unfiltered list (not zero rows) — the opposite-direction
      case of the same bug
- [ ] Home page Sessions tab: repeat both checks (select-all and uncheck-all) on Club, day-of-week,
      and tournament-type
- [ ] Rankings tab (Players sub-tab): repeat both checks on Grade and Club
- [ ] `/player/[id]` "All Partners History" table: repeat both checks on Club, Tournament Type, and
      Event Type
- [ ] `/owner/builddata` → Sessions tab: repeat both checks on Event Type
- [ ] Confirm Rank/Grade/Club (Home), Grade/Club (Rankings), and Event Type (BuildDataViewer) now
      show "All" (full set pre-selected) on first load instead of "0 selected"
- [ ] Confirm "Clear filters" on the Home page Players tab resets Rank/Grade/Club back to the full
      set (showing "All") rather than to empty
- [ ] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass cleanly
