# PLAN_adopt-nextjs-shared-ui-components — next-bridge

## Title
Adopt nextjs-shared UI components (MyButton, MyInput, MySelect, MyTab, MyConfirmDialog)

## Judgment calls made while scoping this plan (please confirm)

- **"Tab-switching" vs "filter toggle" classification.** The task excludes "segmented
  pill-style filter toggles" from conversion. I've classified controls as follows —
  please flag any you'd classify differently:
  - **Convert to MyTab** (switches which whole content section/view is shown):
    `ScrapeTabs` (Scrape/ts0/ts1/ts2), `HomePageClient` (Players/Sessions),
    `PlayerPageClient` (History/Partners, and its Data/Graph sub-tabs),
    `PartnersTable` (Data/Graph view), `RankingsPageClient` (Players/Partnerships).
  - **Leave as-is** (a display/filter parameter shown as a pill/chip group or toggle
    chip, not a content switch): MP/VP scoring toggles, group (All/A/B/C) toggles,
    and the "partner chips" / "show on graph" chip selectors in `PartnersChart`,
    `PerformanceChart`, `PartnersTable`, `PlayerPageClient`, `RankingsPageClient`.
- **Confirmed.** Back buttons (`router.back()` in `SessionPageClient`,
  `PlayerPageClient`) are migrated to `MyBackHomeNav`, replicating the same
  sessionStorage pattern `nextjs-shared` already uses for `OwnerLayout`/
  `DevLayoutHeader` (`ownerFrom` key: writer sets it right before navigating, reader
  pulls it out on mount and clears it) — scoped to next-bridge's own routes since
  there's no generic exported version of this in `nextjs-shared`.
  - Key: `nbBackFrom` (project-local sessionStorage key).
  - Write site: every navigation into `/session/[id]` or `/player/[id]` (via
    `router.push`, `window.location.href`, or a `<Link onClick>`) sets
    `sessionStorage.setItem('nbBackFrom', window.location.pathname + window.location.search)`
    immediately before navigating — capturing whichever page/state the link was
    actually clicked from, regardless of which component embeds it.
  - Read site: `SessionPageClient`/`PlayerPageClient` read `nbBackFrom` once on
    mount into local `backPath` state, then `sessionStorage.removeItem('nbBackFrom')`
    so a direct reload/deep-link shows only the Home link (no stale back-target).
  - Render `<MyBackHomeNav backPath={backPath} />` in place of each raw back
    `<button>`; for `PlayerPageClient`'s partnership-mode button (currently labelled
    "← {player.pl_name}"), pass `backLabel={player.pl_name}` to preserve that text.
  - Write sites needed (in addition to the two read sites above):
    `HomePageClient.tsx:321,434`, `PerformanceChart.tsx:223-224`,
    `PartnersChart.tsx:322-323`, `RankingsPageClient.tsx:302,365,368`,
    `PartnersTable.tsx:352,355,366`, `PlayersAdmin.tsx:98`,
    `SessionPageClient.tsx:132,136,142`, `PlayerPageClient.tsx:630,636`.
- **Superseded by Pass 4.** `FMultiSelect` in `BuildDataViewer.tsx` (native `<select
  multiple size={4}>`) was converted to `MySelect` in Pass 3 — `MySelect` forwards all
  native `<select>` attributes via `...rest`, so `multiple`/`size`/array `value` passed
  through fine even though the props table only documented the single-select case. The
  `MyMultiSelect` spec proposed at the time has since been implemented in
  `nextjs-shared` as `MySelectMulti` (checkbox-dropdown) and pulled in via
  `#reinstall` — Pass 4 swaps `FMultiSelect` over to it.

## Plan

### Pass 1 — `/owner` page → `OwnerPage`
- [x] Rewrite `src/app/owner/page.tsx`: remove the local `TABS`/`activeTab` state and
      hand-rolled `<nav>` tab bar; use `OwnerPage` from `nextjs-shared/OwnerPage` with
      three tabs — `Tools` (existing `TOOLS` list content, unchanged), `Logging`
      (`OwnerTableLogging`), `Cache` (`OwnerTableCache`) — per the "Projects with
      additional tabs" example in CONSUMING_PROJECTS.md. Drop the outer `px-8`/`pt-6`
      wrapper divs `OwnerPage`/`OwnerLayout` already handle.
- [x] `npx tsc --noEmit` and `npm run build`; view `/owner` in the browser and check
      the tab bar still switches Tools/Logging/Cache correctly. (tsc/build passed;
      browser check left for user — see Testing section)

### Pass 2 — `StagingBar` truncate confirmation (safety fix)
- [x] In `src/ui/admin/StagingBar.tsx`: replace the raw `<button>` with `MyButton`.
      Add local `useState<ConfirmDialogInt>` for a confirm dialog (self-contained —
      no prop changes needed elsewhere) and render `MyConfirmDialog` with the truncate
      button's `onClick` opening the dialog (`isOpen: true`) instead of calling
      `onTruncate` directly; the dialog's `onConfirm` calls the existing `onTruncate`
      prop. Use `title`/`subTitle` text that makes clear this wipes ts0/ts1/ts2.
- [x] `npx tsc --noEmit` and `npm run build`; on `/owner/scrape` (or wherever
      `StagingBar` renders), confirm clicking Truncate now shows a Yes/No dialog and
      only truncates on Yes. (tsc/build passed; browser check left for user — see
      Testing section)

### Pass 3 — bulk sweep (file by file)
- [x] `src/ui/admin/BuildDataViewer.tsx` — fix the local wrapper internals: `FText` to
      use `MyInput`, `FSelect` to use `MySelect` (children passthrough), `FMultiSelect`
      to use `MySelect` with `multiple`/`size` passed through; convert the 3 raw
      "load players/sessions/partners" buttons to `MyButton`.
- [x] `src/ui/shared/LookupSelects.tsx` — convert `DropdownPanel`'s raw toggle
      `<button>` to `MyButton` (this fixes `ClubSelect`/`GradeSelect`/`RankSelect`/
      `EventTypeSelect`/`MultiSelect`/`StringMultiSelect` in one place). Leave the
      checkbox `<input>`s untouched (filter checkboxes).
- [x] `src/ui/player/PartnersChart.tsx` — convert the Smoothing `<select>` to
      `MySelect` and the Export CSV `<button>` to `MyButton`. Leave the Scoring/Group
      pill toggles and partner chips as-is (filters, see judgment calls above).
- [x] `src/ui/session/SessionPageClient.tsx` — convert the `<select>` to `MySelect`;
      replace the "← Back" `<button>` with `MyBackHomeNav` reading/clearing the
      `nbBackFrom` sessionStorage key (see judgment calls above); add the
      `nbBackFrom` write to its own two player links (lines 132, 136, 142).
- [x] `src/ui/rankings/RankingsPageClient.tsx` — convert `HeaderTypeahead`'s text
      `<input>` to `MyInput` and its clear (`×`) + suggestion-row `<button>`s to
      `MyButton`; convert `SessionsSelect`, the `topN` `<select>`, and the
      `partnerTopN` `<select>` to `MySelect`; convert the Players/Partnerships tab bar
      to `MyTab`; add the `nbBackFrom` sessionStorage write to its 3 player links
      (lines 302, 365, 368). Leave `ScoringToggle`/`GroupToggle` and the tracked-only
      checkboxes as-is.
- [x] `src/ui/player/PlayerPageClient.tsx` — fix the local `PartnerSelect` wrapper's
      toggle `<button>` to `MyButton` (leave its checkboxes); replace both back
      `<button>`s with `MyBackHomeNav` reading/clearing `nbBackFrom` (partnership-mode
      one gets `backLabel={player.pl_name}`); add the `nbBackFrom` write to its own
      session link (line 630) and partner link (line 636); convert the History/Partners
      tab bar and the Data/Graph sub-tabs to `MyTab`; convert
      Clear-filters/Export-CSV/Export-Graph-CSV buttons to `MyButton`; convert the two
      date `<input>`s, `dayFilter` select, `sessionNameFilter` text input,
      `scoringFilter` select, `summaryFilter` select, and `itemsPerPage` select to
      `MyInput`/`MySelect` as appropriate. Leave the MP/VP scoring pill toggle as-is.
- [x] `src/ui/player/PartnersTable.tsx` — fix the local `PlayerSelect` wrapper's
      toggle `<button>` to `MyButton` (leave its checkboxes); convert the Data/Graph
      `view` toggle to `MyTab`; convert Export-CSV button, the two date inputs,
      `dayFilter`/`scoringFilter`/`summaryFilter`/`itemsPerPage` selects, and
      `sessionNameFilter` text input to `MyButton`/`MyInput`/`MySelect`; add the
      `nbBackFrom` sessionStorage write to its session link (352) and 2 player links
      (355, 366). Leave the graph-scoring pill toggle as-is.
- [x] `src/ui/player/PerformanceChart.tsx` — convert Export CSV button and the
      Smoothing select to `MyButton`/`MySelect`; add the `nbBackFrom` sessionStorage
      write to its session/player navigation callbacks (lines 223, 224). Leave the
      "show on graph" chip toggles as-is.
- [x] `src/ui/home/HomePageClient.tsx` — convert the Players/Sessions tab bar to
      `MyTab`; convert Clear-filters button to `MyButton`; convert all filter text
      inputs (`fName`, `fNz`, `fRatingMin`, `fAMin`, `fSessMin`, `sessNameFilter`), the
      two date inputs, and the scoring/summary/other selects to `MyInput`/`MySelect`;
      add the `nbBackFrom` sessionStorage write to its player link (321) and session
      link (434). Leave the checkbox inputs (`fExcludeNz0`, `fTracked`) as-is.
- [x] `src/ui/admin/RawScrape.tsx` — convert the two date inputs to `MyInput`; convert
      each of the 3 source action buttons (club/tracked/both) to `MyButton`.
- [x] `src/ui/admin/TrackedPlayers.tsx` — convert the two date inputs to `MyInput` and
      the Discover button to `MyButton`.
- [x] `src/ui/admin/PlayersAdmin.tsx` — convert the name-filter text input to
      `MyInput`; add the `nbBackFrom` sessionStorage write to its player link (98).
      Leave the `pl_all_results` checkbox as-is.
- [x] `src/ui/admin/ScrapeTabs.tsx` — convert the Scrape/ts0/ts1/ts2 tab bar to
      `MyTab`.
- [x] `src/ui/admin/Ts0Links.tsx`, `Ts1Table.tsx`, `Ts2Table.tsx`, `PopulateTs2.tsx`,
      `PlayerRefresh.tsx`, `CronRun.tsx`, `BuildTables.tsx` — convert each file's raw
      action button(s) (Load / Run / Run All / etc.) to `MyButton`.
- [x] `npx tsc --noEmit` and `npm run build`; browse `/`, `/rankings`, a player page,
      a session page, and `/owner/scrape` + `/owner/build` + `/owner/builddata` to
      check for layout/spacing/width shifts from the swapped-in shared components,
      since `MyInput`/`MySelect`/`MyButton` ship their own default sizing that differs
      from the hand-rolled Tailwind classes being replaced. (tsc/build passed; browser
      check left for user — see Testing section)

### Pass 4 — swap `FMultiSelect` to the new `MySelectMulti` component
`nextjs-shared` now ships a dedicated native-multi-select-replacement component,
`MySelectMulti` (checkbox-dropdown, `options`/`selected: string[]`/`onChange` props),
confirmed present in the reinstalled package (`node_modules/nextjs-shared/src/components/MySelectMulti.tsx`,
exported at `nextjs-shared/MySelectMulti`). This supersedes Pass 3's `MySelect`-based
`FMultiSelect` (a stopgap using native `<select multiple>` attribute passthrough,
noted in the judgment calls above) with the purpose-built replacement.
- [x] `src/ui/admin/BuildDataViewer.tsx:37-46` (originally) — replace the
      `MySelect`-based `FMultiSelect` wrapper with:
      ```tsx
      import MySelectMulti from 'nextjs-shared/MySelectMulti'

      function FMultiSelect({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
        return (
          <MySelectMulti
            options={options}
            selected={value}
            onChange={onChange}
            overrideClass='w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:outline-none h-auto md:h-auto'
          />
        )
      }
      ```
      The `overrideClass` string matches this file's sibling `FSelect`/`FText`
      wrappers exactly (visual consistency across the 3 filter controls in this
      table, not a new style decision).
- [x] `npx tsc --noEmit` and `npm run build`; open `/owner/builddata`, use the
      tournament-type filter (the only caller of `FMultiSelect`, on `tse_sessions`)
      and confirm the checkbox-dropdown behaves the same as the old native
      multi-select (multi-select toggling, filter still narrows the sessions table).
      (tsc/build passed; browser check left for user — see Testing section)

## Could not convert
Nothing — every raw element targeted in Pass 3 converted cleanly to its shared
equivalent (including `FMultiSelect`'s native multi-select, via `MySelect`'s
attribute passthrough).

## Changes

### src/app/owner/page.tsx
- Replaced the local `TABS`/`activeTab` state and hand-rolled tab `<nav>` with
  `OwnerPage` from `nextjs-shared/OwnerPage`, passing Tools/Logging/Cache as
  `tabs`, per CONSUMING_PROJECTS.md's "Projects with additional tabs" example.
  Renamed the default export from `OwnerPage` to `Page` to avoid colliding with
  the imported `OwnerPage` component; extracted the Tools list into a local
  `ToolsPanel` component.

### src/ui/admin/StagingBar.tsx
- Replaced the raw truncate `<button>` with `MyButton`.
- Added a local `MyConfirmDialog` (via `useState<ConfirmDialogInt>`) so the
  truncate button now opens a Yes/No confirmation dialog instead of calling
  `onTruncate` directly — `onConfirm` calls the existing `onTruncate` prop.

### src/lib/constants.ts
- Added `NB_BACK_FROM_KEY = 'nbBackFrom'` — the sessionStorage key used across
  ~12 files to implement a "back to wherever you came from" link for
  `/session/[id]` and `/player/[id]`, replicating the pattern nextjs-shared uses
  for `OwnerLayout`'s back-link (`ownerFrom`).

### src/ui/admin/BuildDataViewer.tsx
- `FText` now renders `MyInput`, `FSelect` now renders `MySelect` (children
  passthrough).
- Converted the 3 "Load" buttons (players/sessions/partners) to `MyButton`.
- (Pass 4) `FMultiSelect` switched from the `MySelect`-with-native-`multiple`
  stopgap to the new `nextjs-shared` `MySelectMulti` (checkbox-dropdown)
  component — `options`/`selected`/`onChange` props, `overrideClass` copied
  verbatim from the sibling `FSelect`/`FText` wrappers for visual consistency.

### src/ui/shared/LookupSelects.tsx
- Converted `DropdownPanel`'s toggle `<button>` to `MyButton` — fixes
  `ClubSelect`/`GradeSelect`/`RankSelect`/`EventTypeSelect`/`MultiSelect`/
  `StringMultiSelect` in one place, since they all share this component.
  Checkbox filter inputs left untouched.

### src/ui/player/PartnersChart.tsx
- Converted the Smoothing `<select>` to `MySelect` and Export CSV `<button>` to
  `MyButton`.
- Added `nbBackFrom` sessionStorage writes to the chart's point-click
  (→ session) and legend-click (→ player) navigation callbacks.
- Left the Scoring/Group pill toggles and partner chips as raw buttons (filters,
  not tabs).

### src/ui/session/SessionPageClient.tsx
- Converted the rows-per-page `<select>` to `MySelect`.
- Replaced the "← Back" `<button>` with `MyBackHomeNav`, reading `nbBackFrom`
  from sessionStorage on mount (and clearing it) into local `backPath` state.
- Added `nbBackFrom` writes to the row click and the two player `<Link>`s.
- Removed the now-unused `useRouter` import.

### src/ui/rankings/RankingsPageClient.tsx
- `HeaderTypeahead`'s text `<input>` converted to `MyInput`; its clear (`×`) and
  suggestion-row buttons converted to `MyButton`.
- `SessionsSelect`, the `topN` select, and the `partnerTopN` select converted to
  `MySelect`.
- Players/Partnerships tab bar converted to `MyTab`.
- Added `nbBackFrom` writes to the 3 player `<Link>`s.
- `ScoringToggle`/`GroupToggle` and tracked-only checkboxes left as-is.

### src/ui/player/PlayerPageClient.tsx
- `PartnerSelect`'s toggle button and "Select tracked" button converted to
  `MyButton`; its checkboxes left as-is.
- Both back buttons replaced with `MyBackHomeNav` reading/clearing `nbBackFrom`;
  the partnership-mode one passes `backLabel={player.pl_name}` to preserve its
  original "← {name}" text.
- History/Partners tab bar and the Data/Graph sub-tabs converted to `MyTab`.
- Clear-filters/Export-CSV/Export-Graph-CSV buttons converted to `MyButton`.
- Date inputs, `dayFilter`/`scoringFilter`/`summaryFilter`/`itemsPerPage`
  selects, and the session-name text input converted to `MyInput`/`MySelect`.
- Added `nbBackFrom` writes to the session row click and the partner `<Link>`.
- Removed the now-unused `useRouter` import.
- MP/VP scoring pill toggle left as-is.

### src/ui/player/PartnersTable.tsx
- `PlayerSelect`'s toggle button converted to `MyButton`; checkboxes left as-is.
- Data/Graph `view` toggle converted to `MyTab`; Export CSV button converted to
  `MyButton`.
- Date inputs and the day/scoring/summary/items-per-page selects converted to
  `MyInput`/`MySelect`; session-name input converted to `MyInput`.
- Added `nbBackFrom` writes to the row click and the player/partner `<Link>`s.
- Graph-scoring pill toggle left as-is.

### src/ui/player/PerformanceChart.tsx
- Export CSV button and Smoothing select converted to `MyButton`/`MySelect`.
- Added `nbBackFrom` writes to the point-click and legend-click navigation
  callbacks.
- "Show on graph" chip toggles left as-is.

### src/ui/home/HomePageClient.tsx
- Players/Sessions tab bar converted to `MyTab`.
- Clear-filters button converted to `MyButton`.
- All player filter text inputs, both date inputs, the session-name input, and
  the scoring/summary selects converted to `MyInput`/`MySelect`.
- Added `nbBackFrom` writes to the player row click and session row click.
- `fExcludeNz0`/`fTracked` checkboxes left as-is.

### src/ui/admin/RawScrape.tsx
- Both date inputs converted to `MyInput`; the 3 source action buttons
  (club/tracked/both) converted to `MyButton`.

### src/ui/admin/TrackedPlayers.tsx
- Both date inputs converted to `MyInput`; the Discover button converted to
  `MyButton`.

### src/ui/admin/PlayersAdmin.tsx
- Name-filter text input converted to `MyInput`.
- Added an `nbBackFrom` write to the player `<Link>`.
- `pl_all_results` checkbox left as-is.

### src/ui/admin/ScrapeTabs.tsx
- Scrape/ts0/ts1/ts2 tab bar converted to `MyTab`.

### src/ui/admin/Ts0Links.tsx, Ts1Table.tsx, Ts2Table.tsx, PopulateTs2.tsx, PlayerRefresh.tsx, CronRun.tsx, BuildTables.tsx
- Each file's raw action button(s) (Refresh / Run / Run All / Truncate / Group
  X, etc.) converted to `MyButton`, preserving each button's original color/
  styling via `overrideClass`.

### src/lib/tableUtils.ts
- `ROWS_PER_PAGE` changed from `50` to `20` — the shared default page size for
  every paginated table in the app (Home Players/Sessions tabs, PartnersTable,
  PlayerPageClient, SessionPageClient).

### src/app/page.tsx
- Removed `mx-auto` from the home page's outer container so content is
  left-justified instead of centered on wide viewports.

### src/ui/home/HomePageClient.tsx (follow-up fixes)
- Players panel `max-h-[520px]` → `max-h-[760px]` and Sessions panel
  `max-h-[520px]` → `max-h-[760px]`, so the default 20-row page fits without
  an inner scrollbar (estimate based on Tailwind's default row/header heights).
- Removed the "Admin →" link (Sessions tab header) and the "Import one now."
  link (empty-sessions message) — both pointed at an invalid `/admin` route
  that doesn't exist in this project; the empty-sessions message is now plain
  text "No sessions found." Removed the now-unused `Link` import.
- Fixed the Sessions tab's tournament-type filter: was reading
  `(s.se_tournament ?? '')[1]` (the second character of the masterpoint code,
  e.g. `'10A'`), which only worked by accident for single-digit prefixes.
  Changed to `.slice(-1).toUpperCase()` — the tournament letter is always the
  *last* character, matching the extraction logic already used elsewhere
  (`PartnersChart.tsx`, `PlayerPageClient.tsx`, `PartnersTable.tsx`, and the
  `RIGHT(se_tournament,1)` SQL in `api/cron/update-sessions` and
  `api/players/recalculate`).

### src/ui/admin/BuildDataViewer.tsx (follow-up fix)
- Same tournament-filter bug fixed here too: `String(r.se_tournament ?? '')[1]`
  → `.slice(-1).toUpperCase()`. User confirmed this fix works.

## Testing
- [ ] On `/owner/builddata`, load Sessions and use the tournament-type
      (`se_tournament` A/B/C) filter — confirm the new `MySelectMulti`
      checkbox-dropdown opens, toggling checkboxes narrows the sessions table
      the same way the old native multi-select did, and the "All"/"N selected"
      label updates correctly.
- [ ] Open `/owner` and confirm the Tools/Logging/Cache tab bar still switches
      correctly and looks the same as before.
- [ ] On `/owner/scrape`, with staging tables non-empty, click "Truncate ts0 /
      ts1 / ts2" and confirm a Yes/No confirmation dialog now appears, and the
      tables are only truncated after clicking Yes (clicking No or the backdrop
      cancels without truncating).
- [ ] On `/`, switch between the Players and Sessions tabs and confirm they
      still switch correctly; try the player name/NZ#/rating/A-points/sessions
      filters and the date-range/day/scoring/summary/club session filters.
- [ ] Click a player row on `/` and confirm you land on `/player/[id]` with a
      working "← Back" link that returns to `/` (not just visually present —
      actually click it and confirm it navigates back to `/`).
- [ ] Click a session row and confirm the same back-link behavior on
      `/session/[id]`.
- [ ] On `/rankings`, switch between Players/Partnerships tabs, use the
      typeahead player search (including selecting a suggestion and clicking
      the × to clear), and the Top-N/sessions selects.
- [ ] On a player page: switch History/Partners tabs, switch Data/Graph
      sub-tabs, apply the date/day/session-name/scoring/summary filters and the
      partner/club/tournament/event-type multi-selects, click a partner name to
      enter partnership mode and confirm the "← {player name}" back link
      returns to the player's own page, then click a session row to confirm its
      back link returns to the player page.
- [ ] On the "All Partners History" tab, switch Data/Graph, apply filters, and
      click through to a session and a player to confirm back-links work from
      there too.
- [ ] On `/owner/scrape` (RawScrape/TrackedPlayers/ScrapeTabs/Ts0Links/
      Ts1Table/Ts2Table/PopulateTs2), `/owner/build` (BuildTables), and
      `/owner/players` (PlayersAdmin/PlayerRefresh/CronRun), exercise each
      button (Refresh, Run, Run All, Discover, source buttons) and confirm they
      still trigger the same actions.
- [ ] Generally scan every touched page for layout/spacing/width regressions —
      `MyInput`/`MySelect`/`MyButton` ship different default height/border/
      color than the hand-rolled Tailwind classes they replaced, and while
      `overrideClass` was used to preserve most original styling, some visual
      drift is possible and worth a visual pass.
- [ ] Open `http://localhost:3030/` and confirm the page content is
      left-justified (flush against the left edge), not centered.
- [ ] Confirm the Players panel and the Sessions panel on `/` each show the
      default 20 rows without an inner scrollbar.
- [ ] Confirm there is no "Admin →" link on the Sessions tab, and that the
      empty-sessions state reads "No sessions found." with no link.
- [ ] On `/owner/builddata`, check A/B/C in the Tournament filter and confirm
      the sessions table narrows correctly (user confirmed verbally this
      works, but not yet via `#tested`).
- [ ] On `/`, Sessions tab, repeat the same Tournament filter check.
