# PLAN_owner-constants — next-bridge

## Title
Add /owner/constants page

## Plan

**Resolved decisions (this session):** `ConstantsViewer` will be a **local** component in this
project (`src/ui/owner/ConstantsViewer.tsx`, copied from chess and adapted to use `MyTab` directly
— next-bridge has no local `AppTab` wrapper), not promoted to `nextjs-shared` for this task. A full
constants-centralization audit was run first (per your decision) and its findings, below, are
agreed exactly as listed.

- [x] Add the following to `src/lib/constants.ts` (exact names/values agreed):
  ```ts
  // Scrape
  export const BRIDGE_CLUB_ID = 106
  export const FETCH_TIMEOUT_MS = 15_000
  export const SCRAPE_FALLBACK_LOOKBACK_DAYS = 30

  // Score normalization
  export const MP_PERCENTAGE_MIN = 25
  export const MP_PERCENTAGE_MAX = 75
  export const VP_SCORE_SANITY_MAX = 20
  export const VP_SCORE_SANITY_RESET = 10
  export const VP_SCORE_HARD_CAP = 999

  // Player search
  export const PLAYER_SEARCH_LIMIT = 20
  export const PLAYER_SEARCH_ALL_LIMIT = 30

  // Pipeline
  export const PIPELINE_RECENT_RUN_IDS_LIMIT = 5

  // UI
  export const EARLIEST_DATA_DATE = '2024-01-01'
  export const CHART_TOP_N_PRESELECTED = 5
  export const ROWS_PER_PAGE = 20
  export const VALUE_DISPLAY_MAX_LENGTH = 40
  ```
- [x] Update consumers to import each value instead of the inline literal:
  - `BRIDGE_CLUB_ID`: `pipelineScrape.ts` (remove local const), `scrape/discover/nzb-by-date/route.ts`
    and `scrape/raw/nzb-by-date/route.ts` (replace `club_id = 106` default), `PipelineTable.tsx` help
    text ("club 106" → interpolate the constant)
  - `FETCH_TIMEOUT_MS`: `src/lib/scrape/fetchHtml.ts` (remove local const)
  - `SCRAPE_FALLBACK_LOOKBACK_DAYS`: `pipelineScrape.ts`'s `getDateRange`
  - `MP_PERCENTAGE_MIN`/`MP_PERCENTAGE_MAX`: `pipelineScrape.ts`'s `normaliseScore` and
    `buildSteps.ts`'s SQL clamp
  - `VP_SCORE_SANITY_MAX`/`VP_SCORE_SANITY_RESET`: `pipelineScrape.ts`'s `normaliseScore`
  - `VP_SCORE_HARD_CAP`: `buildSteps.ts`'s SQL cap
  - `PLAYER_SEARCH_LIMIT`/`PLAYER_SEARCH_ALL_LIMIT`: `players.ts`
  - `PIPELINE_RECENT_RUN_IDS_LIMIT`: `pipelineLog.ts`
  - `EARLIEST_DATA_DATE`: date-picker `min` in `HomePageClient.tsx`, `PartnersTable.tsx`,
    `PlayerPageClient.tsx`
  - `CHART_TOP_N_PRESELECTED`: `PartnersChart.tsx`, `PerformanceChart.tsx`
  - `ROWS_PER_PAGE`: remove from `src/lib/tableUtils.ts`, re-point its 5 consumers
    (`HomePageClient.tsx`, `SessionPageClient.tsx`, `PartnersTable.tsx`, `DataTableShared.tsx`,
    `PlayerPageClient.tsx`) to `constants.ts`
- [x] Copy `ConstantsViewer.tsx` from chess into `src/ui/owner/ConstantsViewer.tsx`, swapping its
  `AppTab` usage for `MyTab` directly (with the same `TAB_ACTIVE`/`TAB_PASSIVE` underline classes
  already used in `BuildDataViewer.tsx`, `variant='pill'` for the section-tab row)
- [x] Write `CONSTANTS_SECTIONS` — one section per logical grouping of the full constants.ts list
  above (existing 4 + newly centralized 14), each entry with an accurate `description` and real
  `consumers` (file:function) verified by this session's codebase pass
- [x] Write `envSections` — `POSTGRES_URL`, `POSTGRES_DATABASE_LOCATION`, `NEXT_PUBLIC_APPENV_ISDEV`,
  `NEXT_PUBLIC_APPENV_DBHANDLER`, `NEXT_PUBLIC_APPENV_LOG_I`, `CRON_SECRET` — same
  description/consumers treatment, verified against `.env.locallocal`/`.env.localprod` and actual
  `process.env.*` call sites
- [x] Write `FUNCTION_DESCRIPTIONS` — one-line description per function/module-scope reference
  appearing in any entry's `consumers` list (the Functions tab's reverse index)
- [x] Add `src/app/owner/constants/page.tsx` rendering the local `ConstantsViewer` with the above data
- [x] Add a "Constants" entry to the `TOOLS` array in `src/app/owner/page.tsx`, same pattern as
  Pipeline/Players/Build Data Viewer (not an `OwnerPage` tab — matches how chess links to its own
  Constants page)
- [x] **Revision (post-testing feedback):** move Constants out of the Tools list and into
  `OwnerPage`'s `tabs` array instead, next to Dataflow — remove the `TOOLS` entry added above, add
  `{ label: 'Constants', content: <ConstantsPage /> }` alongside Tools/Logging/Cache/Dataflow.
  Confirmed: remove `src/app/owner/constants/page.tsx` (the standalone route) entirely, matching
  how Logging/Cache/Dataflow are tabs-only with no separate route.
- [x] **Revision (post-testing feedback):** rename the `OwnerPage` tab currently labeled `'Tools'`
  to `'Data'` in `src/app/owner/page.tsx` (label text only — `ToolsPanel`/`TOOLS` identifiers in
  code are unaffected, per the "never rename functions/variables" rule; this only changes the
  displayed tab text).

## Changes

### src/lib/constants.ts
- Added 14 new centralized constants: `BRIDGE_CLUB_ID`, `FETCH_TIMEOUT_MS`,
  `SCRAPE_FALLBACK_LOOKBACK_DAYS`, `MP_PERCENTAGE_MIN`, `MP_PERCENTAGE_MAX`,
  `VP_SCORE_SANITY_MAX`, `VP_SCORE_SANITY_RESET`, `VP_SCORE_HARD_CAP`, `PLAYER_SEARCH_LIMIT`,
  `PLAYER_SEARCH_ALL_LIMIT`, `PIPELINE_RECENT_RUN_IDS_LIMIT`, `EARLIEST_DATA_DATE`,
  `CHART_TOP_N_PRESELECTED`, `ROWS_PER_PAGE` (moved here from the now-deleted `tableUtils.ts`),
  and `VALUE_DISPLAY_MAX_LENGTH`.

### src/lib/actions/pipelineScrape.ts
- Removed local `BRIDGE_CLUB_ID` const; imports it from `constants.ts` instead.
- `normaliseScore` and `getDateRange` now use `MP_PERCENTAGE_MIN`/`MAX`, `VP_SCORE_SANITY_MAX`/
  `RESET`, and `SCRAPE_FALLBACK_LOOKBACK_DAYS` instead of inline literals.

### src/lib/actions/buildSteps.ts
- `buildResultsFromStaging`'s SQL clamp now interpolates `MP_PERCENTAGE_MIN`/`MAX` and
  `VP_SCORE_HARD_CAP` instead of hardcoding `25.0`/`75.0`/`999.0`.

### src/app/api/scrape/discover/nzb-by-date/route.ts, src/app/api/scrape/raw/nzb-by-date/route.ts
- Legacy manual routes' `club_id = 106` default now uses `BRIDGE_CLUB_ID`; the raw route's own
  duplicate `normaliseScore` also now uses the shared MP/VP constants (found during
  implementation — same duplicated logic as `pipelineScrape.ts`, not previously listed).

### src/ui/admin/PipelineTable.tsx
- Help-text string ("club 106") now interpolates `BRIDGE_CLUB_ID`.

### src/lib/scrape/fetchHtml.ts
- Removed local `FETCH_TIMEOUT_MS` const; imports it from `constants.ts` instead.

### src/lib/actions/players.ts
- `searchPlayers`/`searchAllPlayers` now use `PLAYER_SEARCH_LIMIT`/`PLAYER_SEARCH_ALL_LIMIT`
  instead of inline `20`/`30`.

### src/lib/actions/pipelineLog.ts
- `getRecentRunIds` now uses `PIPELINE_RECENT_RUN_IDS_LIMIT` instead of inline `LIMIT 5`.

### src/ui/home/HomePageClient.tsx, src/ui/player/PartnersTable.tsx, src/ui/player/PlayerPageClient.tsx
- Date-picker `min` attributes now use `EARLIEST_DATA_DATE` instead of the literal `'2024-01-01'`
  repeated across all three files.

### src/ui/player/PartnersChart.tsx, src/ui/player/PerformanceChart.tsx
- Default preselected series count now uses `CHART_TOP_N_PRESELECTED` instead of inline `5`.

### src/lib/tableUtils.ts (deleted)
- Removed — its only export, `ROWS_PER_PAGE`, moved into `constants.ts`. Its 5 consumers
  (`HomePageClient.tsx`, `SessionPageClient.tsx`, `PartnersTable.tsx`, `DataTableShared.tsx`,
  `PlayerPageClient.tsx`) now import it from there instead.

### src/ui/owner/ConstantsViewer.tsx (new)
- Ported from chess's `src/ui/owner/ConstantsViewer.tsx`, adapted to use `nextjs-shared/MyTab`
  directly (with the same `TAB_ACTIVE`/`TAB_PASSIVE` underline classes already used in
  `BuildDataViewer.tsx`) instead of chess's local `AppTab` wrapper, which next-bridge doesn't have.
  Kept local to this project rather than promoted to `nextjs-shared` (per your decision this
  session) — everything else (tabbed Constants/.env/Functions display, popovers, function
  reverse-index) is unchanged.

### src/ui/owner/ConstantsPage.tsx (new; supersedes the deleted src/app/owner/constants/page.tsx)
- Renders `ConstantsViewer` with `CONSTANTS_SECTIONS` (all 18 `constants.ts` exports, grouped into
  Scrape/Club, Score Normalization, Tournament Groups, Player Search & Identity, Pipeline, and UI
  Display & Navigation), `envSections` (the 6 real env vars this project reads), and
  `FUNCTION_DESCRIPTIONS` for every consumer reference — all verified against actual codebase
  usage this session, not guessed. Moved out of `src/app/owner/constants/page.tsx` (deleted) into
  a plain component so it can render as an `OwnerPage` tab instead of a standalone route
  (post-testing feedback: Constants belongs next to Dataflow, not in the Tools list).

### src/app/owner/page.tsx
- Removed the "Constants" entry from the `TOOLS` array; added `{ label: 'Constants', content:
  <ConstantsPage /> }` to `OwnerPage`'s `tabs` array instead, next to Dataflow.
- Renamed the `'Tools'` tab label to `'Data'` (label text only — the `ToolsPanel`/`TOOLS`
  identifiers in code are unchanged).

## Testing
- [ ] Run `npm run locallocal`, open `/owner`, and confirm the tab bar now reads Data / Logging /
      Cache / Dataflow / Constants (the first tab renamed from "Tools" to "Data", Constants added
      at the end next to Dataflow)
- [ ] Confirm `/owner/constants` no longer exists as a standalone route (redirects to a 404 or
      falls through to the owner layout with nothing rendered)
- [ ] Click the Constants tab and confirm it shows 6 sections (Scrape / Club, Score Normalization,
      Tournament Groups, Player Search & Identity, Pipeline, UI Display & Navigation) with all 18
      constants and their current values
- [ ] Click a few "Show" popovers (values and consumers) and confirm they open/close correctly
- [ ] Switch to the `.env` tab and confirm Database + Application Environment sections show real
      values from your local `.env`
- [ ] Switch to the Functions tab and confirm it lists every function referenced above, each with a
      description and its matched constants (blue) / env vars (red)
- [ ] Exercise the app's existing behavior that now runs through the newly centralized constants,
      to confirm nothing changed functionally:
  - [ ] Run the Scrape AKBC pipeline step and confirm it still filters to club 106 and completes
        normally
  - [ ] Check a session with a solo player still pairs correctly with "Robot"
  - [ ] Confirm MP percentage results still display clamped between 25–75 and VP scores still cap
        sensibly (spot-check a session on `/session/[id]`)
  - [ ] Search for a player by name (both a tracked player and one only reachable via "all players"
        search) and confirm results still return
  - [ ] Confirm the Pipeline page's run-id picker still shows the 5 most recent runs
  - [ ] Confirm the date pickers on Home, Partners, and Player pages still show the same earliest
        selectable date as before
  - [ ] Confirm the Partners/Performance charts still preselect the same top 5 series by default
  - [ ] Confirm every previously-paginated table (Home sessions/players, Session results, Partners,
        Build Data Viewer, Player page) still paginates at 20 rows per page
- [ ] Confirm `npx tsc --noEmit` and `npm run build` both pass (already run this session — clean)
