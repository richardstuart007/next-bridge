# PLAN_function-headers-order — next-bridge

## Title
Perform function-headers and function-order across the whole project

## Plan

Scope: all 90 `.ts`/`.tsx` files under `src/`. Two passes per file, in this order (conversion
first, so any newly `function`-declared helper picks up its header on the same headers pass):

1. **function-order** — convert eligible `const` arrow functions to `function` declarations
   (skip `useCallback`/`useMemo` wrappers and inline prop/arg callbacks); reorder to
   `useEffect`s → main export → helpers by first use; `npx tsc --noEmit` after each individual
   move/conversion.
2. **function-headers** — add/reposition the numbered `1)/2)/3)` main header between the
   directive and imports; add plain single-dash titles (+ `Params:`/`Returns:` where the title
   alone is not enough) to every helper; leave already-canonical headers untouched. No
   `3) CHANGE HISTORY` entries (pure reformat — never fabricated).
3. `npx tsc --noEmit` after each file.

Batches (type-check + brief pause between groups):

- [x] Batch 1 — `src/lib/`: `constants.ts`, `actions/` (12 files), `scrape/` (4 files), `scrapeUtils.ts`
- [x] Batch 2 — `src/app/api/`: 28 `route.ts` files (many are thin wrappers with no single main export → plain headers only, no reorder)
- [x] Batch 3 — `src/app/`: 8 page/layout files
- [x] Batch 4 — `src/ui/admin/`: 8 files
- [x] Batch 5 — `src/ui/shared/`: 13 files
- [x] Batch 6 — `src/ui/` remainder: player, home, rankings, session, owner, graphs, dataflow (14 files)
- [x] Final `npx tsc --noEmit` clean across the whole tree

Flags to surface (not guess):

- [x] List every arrow function that cannot convert, with reason — see "Flags" below
- [x] Flag any helper called by multiple helpers / mutual recursion — none needed reordering by own-first-use; all ambiguous cases were in no-main modules left in place
- [x] Note files with several equally-weighted exports — `players.ts`, `buildSteps.ts`, `statsCompute.ts`, `pipelineLog.ts`, `pipelineStatus.ts`, `lookup.ts`, `sessions.ts`, `build-viewer.ts`, `pipelineScrape.ts`, `parseHtml.ts`, `nzbridge.ts`, `DataTableShared.tsx`, `LookupSelects.tsx`, `ScoringTypeSelects.tsx`, `graph_charts.tsx`, `sections.tsx` — plain per-function headers only, no numbered header, order unchanged
- [x] Note `route.ts` re-export wrappers with nothing to do — none exist in this project (the two nextjs-shared re-export routes named in `.claude/CLAUDE.md` aren't present under `src/`)

Constraints:

- Comment/reorder-only — no logic changes, no renames
- `'use client'` / `'use server'` stays the literal first line
- `npx tsc --noEmit` is the gate; no build step until `#commit`

## Changes

### Batch 1 — src/lib/

- **constants.ts** — no functions; no change.
- **partnerships.ts** — no functions (imports only); no change.
- **pipelineLog.ts**, **pipelineStatus.ts**, **buildSteps.ts**, **statsCompute.ts** — every function already carried a canonical dash header; multi-export peers, no single main → no numbered header; no change.
- **scrapeUtils.ts** — single main export → added numbered `1) DESCRIPTION` header above imports for `extractRunIds`; removed old JSDoc.
- **scrape/fetchHtml.ts** — `fetchHtml` treated as the single main export → numbered header above imports; reordered `fetchHtml` (main) before `doFetch` then `fetchWithTimeout` (by first use); `web_cache_size`/`web_cache_clear` kept last with dash headers. Judgment call: `fetchHtml` chosen as "main" over the two one-line cache accessors.
- **scrape/parseHtml.ts** — multi-export no-main; converted every JSDoc to a canonical dash title; added dash titles to previously un-headered helpers (`capitaliseWord`, `nameParts`, `parseDecimal`, `parseDMY`, `parseNullablePoints`, `parseScore`, `parseEventFields`, `extractRunIdFromHref`, `normaliseClub`). Order unchanged (no main to anchor first-use ordering; file is section-divided).
- **scrape/nzbridge.ts** — multi-export no-main; converted every JSDoc (incl. mojibake-corrupted ones) to canonical dash titles; added a title to `fetchNzBridgePage` and to the nested `addAll` (94-dash indented). Order unchanged.
- **actions/lookup.ts** — added dash titles to all 9 un-headered exports. Order unchanged (no-main).
- **actions/pipelineScrape.ts** — added dash titles to `datesInRange`, `parseDate`, `parseScore`, `normaliseScore`, `parsePage`, `getOrCreatePlayer`, `scrapeRunId`, `getMaxSessionDate`, `getDateRange`; converted the inline `const get = idx => …` accessor inside `parsePage` to a hoisted `function get()` with a 94-dash indented title. Order unchanged.
- **actions/sessions.ts** — added dash titles to 10 un-headered exports. Order unchanged (no-main).
- **actions/players.ts** — added/converted headers on all 14 functions (JSDoc → dash title where present). Order unchanged (no-main).
- **actions/build-viewer.ts** — converted 5 one-line JSDocs to dash titles. Order unchanged.
- **actions/stats.ts** — single main export → `rebuildAllStats` dash header replaced with numbered `1) DESCRIPTION` + `2) NOTES` header above imports.

`npx tsc --noEmit` clean after Batch 1.

### Batch 2 — src/app/api/ (28 route files)

Policy applied: a route file with a single HTTP-method export (or one substantive method + a
stub) → numbered `1) DESCRIPTION` header on that handler, above imports; a file with two
co-equal method exports (GET+POST/GET+DELETE thin wrappers) → plain dash titles, no numbered
header. Nested `const send = … =>` / `const get = … =>` arrows inside `ReadableStream.start` /
`parsePage` were converted to hoisted `function` declarations with 94-dash indented titles
(the SSE `send` no longer needs to return the enqueue result, so no `return` was introduced;
`cron/update-sessions`'s `log` wrapper does return its `write_logging` promise, assigned to a
`const` first per house style).

- **build/scrape**, **build/scrape-tracked**, **build/sessions-nzb**, **build/results-nzb**, **build/partners**, **build/stats** — dash titles on `run`/`params`/`GET`/`POST`; `checkCronAuth` already headed. No reorder (helpers-then-exports kept).
- **build/cleanup** — single `POST` export → numbered header.
- **cron/update-sessions** — dash titles on `checkCronAuth`/`run`/`GET`/`POST`; converted the `log` arrow to a `function` (returns a `const`-assigned `write_logging` promise).
- **admin/players** — numbered header on `GET`; reordered `GET` above `buildWhere` (main-then-helper).
- **admin/players/[id]/all-results** — single `PATCH` → numbered header.
- **admin/backfill-finals** — `POST` (substance) numbered header + `2) NOTES` re the `GET` stub; `GET` dash title; `send` arrow → function.
- **admin/backfill-finals/test** — single `POST` → numbered header.
- **players/[id]/results**, **players/lookup**, **players/merge**, **players/recalculate** — single export → numbered header.
- **players/correct** — GET+POST co-equal → dash titles (converted from JSDoc).
- **rankings** — numbered header on `GET`; reordered `GET` above `pageParams`.
- **sessions/[id]/results** — single `GET` → numbered header.
- **scrape/staging**, **scrape/ts2** — GET+DELETE co-equal → dash titles.
- **scrape/ts1** — single `GET` → numbered header.
- **scrape/discover/nzb-by-player** — single `POST` → numbered header.
- **scrape/discover/nzb-by-date** — numbered header on `POST`; moved `datesInRange` below `POST`; `send` arrow → function.
- **scrape/discover/nzb-by-flagged**, **scrape/raw/nzb-by-date**, **scrape/raw/nzb-by-runid**, **scrape/raw/nzb-by-flagged**, **scrape/raw/nzb-from-ts1sessions** — rewritten to numbered-header-on-`POST` + `POST` first, helpers below ordered by first use, canonical dash titles on every helper (incl. former mojibake `//` headers), nested `send`/`get` arrows → `function`. Logic preserved verbatim.

`npx tsc --noEmit` clean after Batch 2.

### Batch 3 — src/app/ pages (9 files)

All are server components (no directive) → numbered `1) DESCRIPTION` header at the very top.

- **layout.tsx** (`RootLayout`), **owner/layout.tsx** (`Layout`), **page.tsx** (`HomePage`), **owner/pipeline/page.tsx**, **owner/players/page.tsx**, **owner/builddata/page.tsx**, **player/[id]/page.tsx**, **session/[id]/page.tsx** — numbered header added.
- **owner/page.tsx** — numbered header on `Page`; reordered `Page` above the `ToolsPanel` helper and gave `ToolsPanel` a dash title.

`npx tsc --noEmit` clean after Batch 3.

### Batch 4 — src/ui/admin/ (8 files)

- **PipelineHelp.tsx** — numbered header on `PipelineHelp` (between directive and imports); removed its old dash header. STEPS/ROW_COUNT_SQL const-annotation comments left as-is.
- **DataTableShared.tsx** — multi-export no-main; added dash titles to the un-headered `rowKey`, `formatDate`, `renderCell`, `FText`, `FDate`, `FSelect`, `FMultiSelect`, `SectionHeader`. `dateKey`/`numMatch`/`DataTable` kept their existing canonical headers. Order unchanged.
- **Ts1Table.tsx**, **Ts2Table.tsx** — numbered header on the component; moved the `useEffect` above `load`; added 94-dash indented titles to `load` / `handleClick`.
- **TrackedPlayers.tsx** — numbered header; indented title on `handleDiscover`.
- **PlayersAdmin.tsx** — numbered header; indented title on `toggle` (useEffects already first).
- **PipelineTable.tsx** — numbered header + `2) NOTES` explaining the deliberate top-level order (see below); dash titles on `playerStatsSql`/`partnerStatsSql`/`n`/`formatDuration`/`addDays`/`runStep`/`StatusBadge`; in `PipelineJobsSummary`/`OverviewSummary` moved `useEffect` above the helpers and titled `loadRunStatus`/`doRefreshRuns`/`handleSelectRunId`; in `PipelineTable` moved `useEffect` above the helpers, titled the helper functions, and converted the `const handleScrapeClub/handleSessionsClub/handleResultsClub/handleScrapeTracked/handleSessionsTracked/handleResultsTracked/handlePartners/handleRunFullCron` arrows to `function` declarations (bodies preserved verbatim, incl. the pre-existing `return run(...)`). **Top-level function order kept helpers-first / main-component-last** — the module-level `STATS_SUB_ROWS` constant calls `playerStatsSql`/`partnerStatsSql` at init, entangling a clean main-first reorder with const-init order; all declarations hoist so it's cosmetic. Flagged in the header for a separate review.
- **BuildDataViewer.tsx** — numbered header + `2) NOTES`; **reordered `BuildDataViewer` above all its tab components** (safe here — no module-init dependency); dash titles on the 7 tab components and on `mergeSharedFilters`/`removeSharedFilter`; 94-dash indented titles on each tab's nested `load*` / `handle*Click` and on `FiltersTab`'s `handleAdd`.

`npx tsc --noEmit` clean after Batch 4.

### Batch 5 — src/ui/shared/ (13 files)

- **FilterName.tsx**, **FilterDate.tsx**, **FilterDayOfWeek.tsx**, **FilterIsSummary.tsx**, **FilterRunId.tsx**, **FilterSeid.tsx**, **FilterTracked.tsx**, **FilterPlid.tsx**, **NumberFilterInput.tsx**, **TableEmptyRow.tsx**, **SummaryTypeSelects.tsx** — single-export files: existing dash header converted to a numbered `1) DESCRIPTION` header (with `Parameters:`) between the directive and imports. FilterPlid also got a `2) NOTES` and 94-dash indented titles on its nested `handle`/`toggleAll`/`selectTracked`/`toggle`.
- **LookupSelects.tsx** — multi-export no-main: replaced the `// ── Name ──` section comments with canonical dash titles on `StringMultiSelect`, `LookupBase`, `ClubSelect`, `GradeSelect`, `RankSelect`, `EventTypeSelect`. Order unchanged.
- **ScoringTypeSelects.tsx** — every function already had a canonical dash header; multi-export no-main → no change.

`npx tsc --noEmit` clean after Batch 5.

### Batch 6 — src/ui/ remainder (14 files)

- **graphs/graph_types.ts** — types only, no functions; no change.
- **dataflow/DataflowTabs.tsx** — numbered header on `DataflowTabs`; reordered it above the `SubTabs` helper.
- **dataflow/PipelineDiagram.tsx** — numbered header + `2) NOTES`; kept helpers/consts-first order (NODES/EDGES call `pos`/`edge` at module init).
- **dataflow/sections.tsx** — multi-export no-main; every `*Section` already had a canonical header; added a dash title to `Code`. Order unchanged.
- **owner/ConstantsPage.tsx** — numbered header on `ConstantsPage` (server component → at top).
- **owner/ConstantsViewer.tsx** — numbered header + `2) NOTES`; titled nested `addSections`/`handleTabChange`; kept helpers-first order.
- **graphs/graph_charts.tsx** — multi-export no-main; `// -- Bar/Line Chart --` comments → canonical dash titles on `MyBarChart`/`MyLineChart`; converted the `const valueLabel` arrow inside `MyBarChart` to a `function` + title; titled `handleWrapperClick`.
- **session/SessionPageClient.tsx** — numbered header; 94-dash title on the `load` inside `useEffect`.
- **player/PerformanceChart.tsx** — numbered header; titled `rollingAvg`/`fmtDate`/`escCsv`; converted `const valueOf` → `function` + title; titled `exportCSV`/`toggleId`.
- **player/PartnersChart.tsx** — numbered header; titled `grpOf`/`rollingAvg`/`fmtDate`/`escCsv`; converted `const valueOf` → `function` + title; titled `exportCSV`.
- **player/PartnersTable.tsx** — numbered header; titled nested `escCsv`/`exportCSV`.
- **home/HomePageClient.tsx** — numbered header + `2) NOTES` (replaced the `// ── Main component ──` comment); titled `loadSaved`; converted `const isTracked` → `function` + title; titled `clearPlayerFilters`.
- **player/PlayerPageClient.tsx** — numbered header (replaced `// ── Main component ──`); converted `const playerStorageKey` → `function` + title; titled `loadPlayerSaved`; converted the nested `const esc` inside `buildCSV` → `function` + title; titled `load`/`clearFilters`/`buildCSV`/`exportCSV`/`exportGraphCSV`/`consistencyLabel`.
- **rankings/RankingsPageClient.tsx** — numbered header + `2) NOTES`; titled `isTracked`; `// Compact typeahead` comment → dash title on `HeaderTypeahead`; titled nested `clear`/`GroupToggle`. The four `*MinFor`/`*OptionsFor` helpers + `SessionsMinSelect` + `TopNSelect` kept their existing headers. Order kept helpers-first.

`npx tsc --noEmit` clean after Batch 6, and clean across the whole `src/` tree.

## Flags

- **Arrow → `function` conversions made** (all straightforward — not passed inline as a
  prop/arg, not `useCallback`/`useMemo`): `get` (in `pipelineScrape.ts` `parsePage`, and in the
  four rewritten `scrape/raw|discover/*` routes' `parsePage`); `send` (in every SSE route's
  `ReadableStream.start`); `log` (`cron/update-sessions` — keeps its `write_logging` return via a
  `const`); `valueLabel` (`graph_charts.tsx`); `valueOf` (`PerformanceChart`, `PartnersChart`);
  `isTracked` (`HomePageClient`); `playerStorageKey` + nested `esc` (`PlayerPageClient`).
- **Arrows left as-is** (cannot/should-not convert): every inline JSX `onClick`/`onChange`/
  `.map`/`.filter` callback; the `(async () => { … })()` IIFEs inside several `useEffect`s
  (`LookupSelects`, `HomePageClient`, `PartnersChart`, `RankingsPageClient`, `PartnersTable`);
  the inline `(() => { … })()` in `ConstantsViewer` `buildFunctionIndex` and in `PlayerPageClient`'s
  stats JSX.
- **Top-level function order deliberately NOT changed (numbered header + `2) NOTES` added
  instead), for a separate review pass:** `PipelineTable.tsx`, `PipelineDiagram.tsx`,
  `ConstantsViewer.tsx`, `RankingsPageClient.tsx` — each has the main component last with several
  helper functions / helper-calling module constants above it; every declaration hoists so the
  order is cosmetic, but a clean main-first reorder is entangled with const-initialisation order
  and risky to do blind. `admin/players/route.ts`, `rankings/route.ts`, `owner/page.tsx`,
  `DataflowTabs.tsx`, `BuildDataViewer.tsx` **were** reordered (small / no entanglement).
- **No-main modules — order left unchanged** (no single main function to anchor "by first use"
  ordering, and the files are already section-divided): all the multi-export modules listed under
  the third "Flags to surface" checkbox above.

## Testing

- [ ] `npm run locallocal` and click through the app — Home (Players / Sessions / Rankings tabs, filters, pagination), a player page (Stats / History / Partners tabs, Data/Graph toggle, CSV export), a session page, `/owner/pipeline` (run a step, check the Jobs summary), `/owner/builddata` (each tab, row click-through, filters), `/owner/players`, `/owner` Constants/Dataflow tabs — confirm nothing renders differently or errors in the console.
- [ ] Confirm the SSE-streaming admin/scrape routes still stream (the `const send`/`const get` → `function` conversions): trigger `/owner/builddata` ts1 "Tracked players" Discover, and `/owner` backfill-finals if used.
- [ ] `npm run build` succeeds (run at `#commit` via the commit gate).
- [ ] This was a comments + function-reordering + arrow→function pass only — no behaviour change intended; `npx tsc --noEmit` is clean.
