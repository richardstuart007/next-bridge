# PLAN_data-investigation-bill-leach — next-bridge

## Title
Data investigation - Bill Leach always shows 12 records to process in tracked player scrape step, suspected orphaned data

## Plan
- [x] Investigate why Bill Leach always shows 12 records to process in the tracked-player scrape step
- [x] Add `re_score numeric(5,2)` column to `tre_results` (manual SQL, appended at end — no
      reorder needed since it's a brand-new column, not a repositioning of existing ones) —
      confirmed run by user; verified via query (2026-07-28) that the column exists
- [x] Backfill `re_score = COALESCE(re_percentage, re_vp)` for all existing rows (manual SQL) —
      confirmed run by user; verified via query (2026-07-28): 293,471/293,471 rows populated,
      0 mismatches against `COALESCE(re_percentage, re_vp)`
- [x] Update every function that reads/writes `re_percentage`/`re_vp` to use `re_score` instead,
      deriving the value's meaning from `tse_sessions.se_scoring` (already joined or joinable in
      every case) rather than from which of two columns is non-null:
  - `src/lib/actions/buildSteps.ts` — `buildResultsFromStaging`'s INSERT writes `re_score`
    (existing MP clamp / VP hard-cap CASE branches preserved as-is; the XIMP branch is added later,
    see blocked item below)
  - `src/lib/actions/statsCompute.ts` — read `re_score` filtered by `se_scoring` instead of
    separately filtering `re_percentage`/`re_vp`
  - `src/lib/actions/build-viewer.ts` — raw-table viewer selects `re_score`
  - `src/app/api/sessions/[id]/results/route.ts` — select `re_score`; the existing
    `ORDER BY COALESCE(re_percentage, re_vp) DESC` simplifies to `ORDER BY re_score DESC`
  - `src/app/api/players/[id]/results/route.ts` — select `re_score`
  - `src/ui/session/SessionPageClient.tsx` — read a single `score` field; display formatting
    stays keyed on `se_scoring` as it already is today
  - `src/ui/admin/BuildDataViewer.tsx` — update the raw column list for the `tre` tab
  - `src/ui/owner/ConstantsPage.tsx`, `src/ui/dataflow/sections.tsx` — update descriptions of the
    `tre_results` schema/columns. (`src/lib/Data flow.md` was checked and left alone — it already
    describes a different, non-current schema with columns like `re_imp_score`/`re_plid` that
    don't exist today, so it predates this design and is a pre-existing stale doc, not something
    this change should touch.)
  - `.claude/CLAUDE.md` — updated the `tre_results` table description and "Key field notes" to
    describe `re_score` instead of `re_percentage`/`re_vp`
- [ ] Drop `re_percentage` and `re_vp` columns (manual SQL, only after the above code changes are
      verified working against `re_score`) — **SQL given to user in chat, not yet confirmed run**
- [x] Add an "unknown score type" safety net — historically, any row whose score suffix wasn't
      `PCT`/`VP` was silently dropped in `parsePage()`, and if every row on a run_id's page failed
      this way the whole session vanished with zero trace (this is exactly how the historical XIMP
      data was later deleted "without knowing what we were deleting" — nothing recorded it existed
      in the first place). Fix, independent of the still-undecided XIMP clamp:
  - New constant `UNKNOWN_SCORE_TYPE = 'UNK'` in `src/lib/constants.ts` (a named sentinel, not a
    literal duplicated across files — same reasoning as `TOURNAMENT_DEFAULT_GROUP`)
  - `parseScore()` (`pipelineScrape.ts`) — when the suffix isn't `PCT`/`VP` (or `XIMP` once that
    exists), still extract the leading numeric value and return `{ value, type: UNKNOWN_SCORE_TYPE }`
    instead of `null`. Only genuinely unparseable text (no leading number at all) still returns
    `null`/gets dropped.
  - `buildSessionsFromStaging` (`buildSteps.ts`) — `se_scoring` CASE gets an `UNKNOWN_SCORE_TYPE`
    branch alongside the existing VP/MP one
  - `buildResultsFromStaging` (`buildSteps.ts`) — `re_score` CASE gets an `UNKNOWN_SCORE_TYPE`
    branch that writes the **raw, unclamped** scraped value (agreed 2026-07-28 — forensic
    visibility over guessing at a sanity bound for a format we don't understand yet)
  - No change needed in `statsCompute.ts` — it already filters explicitly on
    `se_scoring = 'MP'`/`'VP'`, so `'UNK'`-scored sessions are automatically excluded from stats
  - No UI surfacing for now (agreed 2026-07-28) — an unknown-type session is found by querying
    `WHERE se_scoring = 'UNK'`, same as how this was investigated. Revisit if it becomes a
    recurring need.
  - Side effect: once this ships, the 12 currently-missing XIMP sessions for Bill Leach (and likely
    more for other tracked players) start being captured under `'UNK'` instead of vanishing —
    partially resolving the original symptom even before real XIMP-specific handling exists.
  - **Required acceptance test (2026-07-28, user's explicit priority before anything else in this
    step counts as done): PASSED.** Ran the exact same code path the "Tracked Players" pipeline
    step uses (`scrapeTrackedPlayerSessions()` → `buildSessionsFromStaging(false, undefined,
    undefined, 'tracked')` → `buildResultsFromStaging(false, undefined, undefined, 'tracked')`),
    then verified: all 12 of Bill Leach's known run_ids (238086, 238085, 238084, 238083, 238082,
    238081, 238080, 238079, 227128, 226457, 225894, 225292) now exist in `tse_sessions` with
    `se_scoring = 'UNK'`, each with populated (unclamped) `re_score` values in `tre_results`
    (e.g. 37.00, 72.80, 46.80 — not forced into the 25–75 MP range). Also checked project-wide:
    19 sessions total now carry `se_scoring = 'UNK'` — Bill Leach's 12 (run_ids 225292/225894/
    226457/227128 "Wed RB Feb IMPs" + 238079–238086 "MatarikiSwissFinalResults"), plus 7 more
    previously-silently-dropped sessions for other tracked players (run_ids 236792–236798,
    "Barfoot Thompson Sixes Open") — confirming this is a general fix, not just a
    Bill-Leach-specific patch.
- [x] Add real `XIMP`/`XIMPS` recognition (reclassifying future-scraped XIMP rows from `'UNK'` to
      a dedicated `XIMP` type with proper clamping):
  - New constant `XIMP_SCORE_HARD_CAP = 200` in `src/lib/constants.ts` (agreed 2026-07-28 — a
    single build-stage hard cap only, no separate scrape-stage sanity-reset step, mirroring
    `VP_SCORE_HARD_CAP`'s role but with a tighter ceiling appropriate to XIMP's observed range)
  - `parseScore()` (`pipelineScrape.ts`) — recognize `XIMP`/`XIMPS` suffixes (normalize both to
    type `'XIMP'`), same pattern as the existing `PCT`/`VP` regex branch
  - `normaliseScore()` — no scrape-stage clamp for `XIMP` (per the agreed single-hard-cap-only
    decision — value passes through unchanged, same as it does today for `UNKNOWN_SCORE_TYPE`)
  - `buildSessionsFromStaging` (`buildSteps.ts`) — `se_scoring` CASE gets an `XIMP` branch
    alongside the existing VP/UNK/MP ones
  - `buildResultsFromStaging` (`buildSteps.ts`) — `re_score` CASE gets an `XIMP` branch:
    `LEAST(${XIMP_SCORE_HARD_CAP}.0, s2_score_value)`
  - **Result:** verified via unit-style regex check (all known raw strings: `93.25XIMPS` →
    `XIMP`/93.25, `72.80XIMP` → `XIMP`/72.8, `54.53PCT` → `PCT`/54.53, `6.49VP` → `VP`/6.49,
    `93.25GARBAGE` → `UNK`/93.25, `notanumber` → `null` — all correct). Re-ran the real
    tracked-player scrape+build pipeline: 2 genuinely new run_ids were found and captured
    correctly (neither happened to be XIMP-scored). Confirmed via live fetch that all 7 "Barfoot
    Thompson Sixes Open" sessions (run_ids 236792–236798) are also genuinely XIMP-scored (e.g.
    `19.44XIMPS`), same as Bill Leach's 12 — so all 19 currently-`'UNK'` sessions are confirmed
    XIMP, none are a different unrecognized format.
  - **Known limitation, not a bug:** the 19 already-captured `'UNK'` sessions do **not**
    self-correct via a normal pipeline re-run — `batchCheckMissing()` excludes any run_id already
    present in `ts1_sessions`/`tse_sessions` from ever being re-scraped, and
    `buildSessionsFromStaging`'s `ON CONFLICT (se_run_id) DO NOTHING` /
    `buildResultsFromStaging`'s `WHERE NOT EXISTS (...)` guard both skip rows that already exist.
    Confirmed via query after the re-scrape: all 19 remain `se_scoring = 'UNK'`, unchanged.
  - Confirmed via query that `MAX(re_score)` across these 19 sessions is `93.25` — well under the
    `200` `XIMP_SCORE_HARD_CAP`, so the one-time correction needed is a pure classification-label
    fix (`'UNK'` → `'XIMP'`), not a value change. **Manual SQL for this is in `## Changes` below —
    not yet run.**
- [x] Consolidate the MP/VP scoring-type option list into shared components, so adding `XIMP` (or
      any future type) is a one-line change instead of hunting down every duplicate. User's
      explicit scope decision (2026-07-28): cover all three UI shapes found, not just the
      `<select>` dropdowns.
  - New constant `SCORING_TYPES = ['MP', 'VP'] as const` in `src/lib/constants.ts` — single
    source of truth for the option list
  - New `ScoringTypeSelect` component (`src/ui/shared/`, alongside the existing
    `LookupSelects.tsx` reusable-selector convention) — a `<select>` wrapping `MySelect`, with an
    `includeAll` prop for the one call site that needs an `'all'` option. Replaces 3 identical
    hardcoded `<option value='MP'>`/`<option value='VP'>` blocks in `PlayerPageClient.tsx`,
    `PartnersTable.tsx`, `HomePageClient.tsx`
  - New `ScoringTypeToggle` component (`src/ui/shared/`) — the button/pill toggle-group pattern.
    Replaces 3 identical `(['MP', 'VP'] as const).map(...)` blocks in `PlayerPageClient.tsx`,
    `PartnersTable.tsx`, `PartnersChart.tsx`
  - `BuildDataViewer.tsx`'s admin `se_scoring` filter — no new component needed (it already uses
    the generic reusable `FMultiSelect`); just change `options={['MP', 'VP']}` to
    `options={[...SCORING_TYPES]}`
  - `PerformanceChart.tsx`'s `scoring: 'MP' | 'VP'` prop type — widen to derive from
    `SCORING_TYPES` rather than a separate hardcoded union
- [x] Consolidate the rows-per-page dropdown into a shared `RowsPerPageSelect` component
      (`src/ui/shared/`), per user's refinement (2026-07-28): standard settings via a constant,
      overrideable per call site.
  - New constant `ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100]` in `src/lib/constants.ts` — the
    standard dropdown choice list (distinct from the existing `ROWS_PER_PAGE = 20`, which is the
    default *selected* page size, already used correctly as the initial `itemsPerPage` state in
    all 5 call sites — confirmed via grep, no change needed there)
  - `RowsPerPageSelect` component: `value`/`onChange` props plus an `options` prop that **defaults
    to `ROWS_PER_PAGE_OPTIONS`** but can be overridden per call site
  - Replaces 5 duplicated instances: `SessionPageClient.tsx`, `PartnersTable.tsx`,
    `PlayerPageClient.tsx`, and two in `HomePageClient.tsx` — the sessions-table one uses the
    default; the players-table one overrides with `options={[15, 20, 50, 100]}` (its existing,
    already-different list)
- [x] **Restructure `ta1_player_stats`/`ta2_partner_stats` — normalize scoring type into the key**
      (2026-07-28). Both tables currently repeat a full set of columns per scoring type
      (`a1_mp_sessions`/`a1_mp_avg_pct`/`a1_mp_stddev` and `a1_vp_sessions`/`a1_vp_avg_vp`/
      `a1_vp_stddev`) — the same anti-pattern `tre_results` had before its `re_score`
      consolidation. User's explicit decision: move scoring type into the key so the structure is
      identical for every type, exactly like the `tre_results` redesign, and a future 4th scoring
      type needs zero schema/query changes ever again.
  - **New schema** (keys first, per user's explicit instruction — via backup/drop/recreate, not
    an appended column, since this changes the unique key and column count, not just adds one):
    ```sql
    CREATE TABLE public.ta1_player_stats (
        a1_a1id     integer NOT NULL,
        a1_plid     integer NOT NULL,
        a1_group    character varying(3) NOT NULL,
        a1_scoring  character varying(5) NOT NULL,
        a1_sessions integer DEFAULT 0 NOT NULL,
        a1_avg      numeric(5,2) DEFAULT 0 NOT NULL,
        a1_stddev   numeric(5,2)
    );
    -- IDENTITY on a1_a1id (as today); UNIQUE (a1_plid, a1_group, a1_scoring) replaces the old
    -- UNIQUE (a1_plid, a1_group); PRIMARY KEY (a1_a1id); same idx_ta1_player_stats_plid index

    CREATE TABLE public.ta2_partner_stats (
        a2_a2id     integer NOT NULL,
        a2_paid     integer NOT NULL,
        a2_group    character varying(3) NOT NULL,
        a2_scoring  character varying(5) NOT NULL,
        a2_sessions integer DEFAULT 0 NOT NULL,
        a2_avg      numeric(5,2) DEFAULT 0 NOT NULL,
        a2_stddev   numeric(5,2)
    );
    -- a2_paid moves right after a2_a2id (was last before) — keys-first ordering, matching a1's
    -- convention. UNIQUE (a2_paid, a2_group, a2_scoring) replaces UNIQUE (a2_paid, a2_group).
    ```
  - **Manual SQL — backup/drop/recreate/rebuild, per user's explicit instruction (2026-07-28), not
    yet run:**
    1. `CREATE TABLE bk1_ta1_player_stats AS SELECT * FROM ta1_player_stats;` /
       `CREATE TABLE bk1_ta2_partner_stats AS SELECT * FROM ta2_partner_stats;` (pure rollback
       safety net — never read from again once step 4 below runs)
    2. `DROP TABLE ta1_player_stats;` / `DROP TABLE ta2_partner_stats;`
    3. Recreate both from the schema above (exact `CREATE TABLE`/constraint SQL to be given in
       chat once this step is reached)
    4. **No data-migration SQL** — unlike `tre_results` (irreplaceable scraped data), these two
       tables are pure computed caches, fully rebuildable from `tre_results` at any time. "Building
       the data back into the tables" = simply re-running the existing `/owner/pipeline` "Update
       Stats" step (`rebuildAllStats()`) once the empty tables exist — confirmed via reading
       `stats.ts` that it already just calls `computePlayerGroupStats`/`computePartnerGroupStats`
       per group and logs whatever `inserted` count comes back, fully agnostic to row shape.
  - **`src/lib/actions/statsCompute.ts`** — both functions rewritten to a single generic INSERT,
    `GROUP BY u.plid, se_scoring` (or `re_paid, se_scoring`) instead of separate `FILTER (WHERE
    se_scoring = 'MP')`/`'VP'` branches — this becomes fully type-agnostic; a future scoring type
    needs **zero** changes here, it just appears as another `GROUP BY` bucket automatically.
  - **`src/lib/actions/players.ts`**:
    - `getPlayerAllGroupStats` — rewritten to return one flat row per `(group, scoring)` instead
      of one row per group with paired mp/vp columns; `pct_rank` becomes one generic column via
      `PERCENT_RANK() OVER (PARTITION BY a1_group, a1_scoring ORDER BY a1_stddev NULLS LAST)`
      instead of two separately-computed `mp_pct_rank`/`vp_pct_rank` columns.
    - `getPartnerStats` — currently assumes exactly one row (`WHERE a2_group = 'C'`); with the new
      shape that filter can match up to 3 rows (one per scoring type) — becomes an array return
      instead of a single object.
  - **`src/app/api/rankings/route.ts`** — per user's decision to unify: remove the `SCORING_COLS`
    lookup table entirely; `scoring` query param becomes any `SCORING_TYPES` value directly (join
    condition becomes `a1_scoring = $3`/`a2_scoring = $3`, no per-type column-name branching).
  - **`src/ui/rankings/RankingsPageClient.tsx`** — per user's decision to unify: replace the local
    lowercase `type Scoring = 'mp' | 'vp'` + hardcoded toggle with the shared
    `SCORING_TYPES`/`ScoringTypeToggle` (uppercase, consistent with every other page) — changes the
    `/api/rankings?scoring=` query param casing to match (`MP`/`VP`/`XIMP`), and table headers/cell
    formatting branch on all 3 types (XIMP as a plain number, per the agreed display format).
  - **`src/ui/player/PlayerPageClient.tsx`** — per user's decision to generalize: extract the
    hand-built MP-columns/VP-columns table layout (Avg/Sessions/Consistency, `mp_pct_rank`/
    `vp_pct_rank`-driven "Consistent/Wobbly/Volatile/Wild" labels) into a reusable block rendered
    once per scoring type present, rather than duplicating the column-block a third time for XIMP.
  - **`SCORING_TYPES` constant** — updated to `['MP', 'VP', 'XIMP'] as const` (previously
    deliberately excluded XIMP since stats/UI support didn't exist yet — it does now, this is the
    point of this whole step). This automatically surfaces XIMP as a real option in every existing
    `ScoringTypeSelect`/`ScoringTypeToggle` call site built earlier in this plan, with no further
    per-file change needed there.
  - **`src/lib/actions/build-viewer.ts` + `src/ui/admin/BuildDataViewer.tsx`** — `getAllPlayerStats`/
    `getAllPartnerStats` column lists updated to the new generic shape (`a1_scoring`, `a1_sessions`,
    `a1_avg`, `a1_stddev` instead of the six old mp/vp columns); add a filter for the new
    `a1_scoring`/`a2_scoring` column, consistent with this project's "every displayed column gets
    its own filter" convention.
  - **`src/app/api/admin/players/route.ts`** — the single-row `LEFT JOIN ... AND a1_group = 'all'`
    can no longer assume one row; rewritten as a `LEFT JOIN` to a small aggregating subquery
    (`SUM(a1_sessions)` across all scoring types for the total, `a1_avg` specifically `WHERE
    a1_scoring = 'MP'` for the existing MP-only quick-glance average — preserving this admin
    list's existing display choice, not expanding it to show all 3 types).
  - **`src/ui/admin/PipelineTable.tsx`** — descriptive help-text strings referencing the old column
    names updated to match (text only, no logic change).

## Agreed so far
- New consolidated column: `re_score`, type `numeric(5,2)` (matches existing `re_percentage`/
  `re_vp` precision — no data loss migrating current values, and comfortably covers XIMP samples
  seen so far, max ~93).
- `ta1_player_stats`/`ta2_partner_stats` restructure (2026-07-28): scoring type moves into the
  unique key (`a1_plid, a1_group, a1_scoring` / `a2_paid, a2_group, a2_scoring`), one generic
  `sessions`/`avg`/`stddev` triplet instead of a repeated set per type. Via backup/drop/recreate
  with keys-first column order (user's explicit instruction), not an appended column. No data
  migration SQL — these tables are pure computed caches, rebuilt via the existing "Update Stats"
  pipeline step after recreation. `rankings/route.ts`/`RankingsPageClient.tsx` unify onto
  `SCORING_TYPES` too. `PlayerPageClient.tsx`'s stats table generalizes into a per-scoring-type
  block instead of duplicating MP/VP columns a third time. `SCORING_TYPES` grows to
  `['MP', 'VP', 'XIMP']` once this ships, since stats/UI support for XIMP now genuinely exists.
- XIMP will get its own dedicated hard-cap clamp (not reusing/repurposing the VP one) — settled
  2026-07-28: `XIMP_SCORE_HARD_CAP = 200`, a single build-stage cap only, no separate scrape-stage
  sanity-reset step.

## Changes
- Investigated via query — root cause found, no code changed yet:
  - User queried `ts2_results` for `s2_plid1/2 = 4318` and found nothing. 4318 turned out to be
    Bill Leach's `pl_nz_bridge_number`, not his `pl_plid` (actual `pl_plid = 11317`). Not itself a
    bug — `ts2_results` is staging and gets consumed/truncated during the pipeline, so it's
    normally near-empty between runs.
  - Checked `tpa_partners`/`tre_results` for `pl_plid = 11317` — Bill Leach has ~700+ production
    result rows. His historical data is not orphaned; production build is fine.
  - The recurring "12" in the tracked-player scrape step is `missing.length` in
    `scrapeTrackedPlayerSessions()` (`src/lib/actions/pipelineScrape.ts:343`) — the count of
    run_ids on his live NZB history page not yet present in `tse_sessions`/`ts1_sessions`.
  - Live-fetched his NZB `online-points.html` page and diffed the 472 run_ids found there against
    `tse_sessions`/`ts1_sessions`: exactly the same 12 run_ids are missing right now
    (238086, 238085, 238084, 238083, 238082, 238081, 238080, 238079, 227128, 226457, 225894, 225292).
  - Fetched each of those 12 run_ids' `results.html` pages directly: all 12 are sessions scored in
    **cross-IMPs**, with score cells like `93.25XIMPS` / `72.80XIMP`.
  - Root cause: `parseScore()` (`src/lib/actions/pipelineScrape.ts:58`) only matches
    `PCT` or `VP` score suffixes. A row with `XIMPS`/`XIMP` fails the regex, so `parseScore`
    returns null and the row is silently dropped in `parsePage()` (line 119: `if (!score) return`).
    Since every row on these 12 run_ids' pages uses this scoring, `rows.length` ends up `0` for
    each run_id, so `scrapeRunId()` returns `{ pairs: 0, created: 0 }` immediately (line 191) —
    before it ever reaches the `ts1_sessions` upsert. Nothing is written for that run_id anywhere.
  - Because nothing is ever written, `batchCheckMissing()` (line 171) never finds these run_ids in
    `tse_sessions` or `ts1_sessions`, so they are reported as "missing" again on every future run,
    forever — not orphaned rows, but a permanent scrape gap for cross-IMP-scored sessions.
  - Not yet decided: whether/how to extend `parseScore`/`normaliseScore` to support `XIMP`/`XIMPS`
    scores (and what normalisation, if any, an IMP score needs vs. the existing VP sanity-reset
    logic) — this needs to be agreed before any `#code` change.
  - 2026-07-27: initially proposed treating `XIMP`/`XIMPS` as a `VP` session, but the existing
    `VP_SCORE_SANITY_MAX = 20` / `VP_SCORE_SANITY_RESET = 10` clamp would silently corrupt real
    cross-IMP scores (samples fetched: 93.25, 72.80, 62.30, 56.10, 46.80 — all legitimately > 20).
    User decided XIMP should instead be its own separate class, not folded into VP — still
    thinking through what that class needs (storage column, `score_type` value, sanity
    thresholds if any). Nothing agreed yet; do not implement until the user comes back with a
    decision.

### scripts/schema.sql
- `tre_results` now defines `re_score numeric(5,2)` in place of `re_percentage`/`re_vp`, reflecting
  the target end-state once the manual SQL below has been run.

### src/lib/actions/buildSteps.ts
- `buildResultsFromStaging`'s INSERT now writes a single `re_score` column via one `CASE WHEN
  s1_score_type = 'VP'` expression (VP hard-cap branch / MP clamp branch preserved exactly as
  before, just merged into one column instead of two).

### src/lib/actions/statsCompute.ts
- Both `computePlayerGroupStats` and `computePartnerGroupStats` now `AVG`/`STDDEV_SAMP` over
  `re_score` (still `FILTER`ed by `se_scoring = 'MP'`/`'VP'` exactly as before) instead of
  separately aggregating `re_percentage` and `re_vp`.

### src/lib/actions/build-viewer.ts
- `getResultsBySeid` and `getAllResults` now select `re_score` (aliased to `score` in the former)
  instead of `re_percentage`/`re_vp`.

### src/app/api/sessions/[id]/results/route.ts
- Selects `re_score AS score` instead of both columns; `ORDER BY COALESCE(re_percentage, re_vp)
  DESC` simplified to `ORDER BY re_score DESC`.

### src/app/api/players/[id]/results/route.ts
- **Judgment call, surfaced here rather than silently made:** this route's `percentage`/`vp`
  response fields are also consumed by `PlayerPageClient.tsx`, `PartnersTable.tsx`,
  `PerformanceChart.tsx`, and `PartnersChart.tsx` — none of which were in the original plan.
  Rather than expanding scope to refactor those 4 additional files, the route's response shape
  was kept unchanged (still `percentage`/`vp`); only its query changed, now deriving both via
  `CASE WHEN se_scoring = 'MP'/'VP' THEN re_score END` instead of reading two separate DB columns.
  This satisfies "use the new column" at the data-access layer without touching UI files that were
  never discussed.

### src/ui/session/SessionPageClient.tsx
- `ResultRow` now has a single `score: number | null` field (was `percentage`/`re_vp`); both
  branches of the display ternary now read `r.score`.

### src/ui/admin/BuildDataViewer.tsx
- `ResultsTab`: `filter_percentage`/`filter_vp` merged into one `filter_score`; the `re_score`
  column has a single filter/render entry instead of two.

### src/ui/owner/ConstantsPage.tsx
- Updated the `buildResultsFromStaging` description to say "clamps/caps `re_score`" instead of
  naming the two old columns.

### src/ui/dataflow/sections.tsx
- `TreResultsSection`'s purpose text rewritten to describe `re_score` as a single value column
  whose interpretation depends on the session's `se_scoring`, instead of the old NULL-one-or-
  the-other description.

### .claude/CLAUDE.md
- Production tables table and "Key field notes" updated to describe `re_score` instead of
  `re_percentage`/`re_vp`.

### Verification
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds, all routes compile.
- Confirmed via `grep` that no remaining code references `re_percentage`/`re_vp` anywhere in
  `src/` (only the pre-existing, already-stale `src/lib/Data flow.md` still mentions similarly-
  named but different, non-current columns — left untouched, out of scope).

### src/lib/constants.ts
- Added `UNKNOWN_SCORE_TYPE = 'UNK'` — the sentinel `s1_score_type`/`se_scoring` value for a
  scraped score whose suffix isn't a recognized type, used instead of duplicating the literal
  across `pipelineScrape.ts` and `buildSteps.ts`.

### src/lib/actions/pipelineScrape.ts
- `parseScore()` no longer returns `null` for a recognized-numeric-but-unrecognized-suffix score
  (e.g. `93.25XIMPS`). It now falls back to extracting the leading numeric value and returning
  `{ value, type: UNKNOWN_SCORE_TYPE }`. Only genuinely unparseable text (no leading number at all)
  still returns `null` and gets dropped in `parsePage()`.
- `normaliseScore()` and `ParsedRow.score_type` widened to accept `UNKNOWN_SCORE_TYPE` — no clamp
  logic needed there since neither the `PCT` nor `VP` branch matches it, so the raw value passes
  through unchanged (the "store raw, unclamped" behavior agreed for unknown types).

### src/lib/actions/buildSteps.ts
- `buildSessionsFromStaging`'s `se_scoring` CASE gets an `UNKNOWN_SCORE_TYPE` branch alongside the
  existing VP/MP one.
- `buildResultsFromStaging`'s `re_score` CASE gets an `UNKNOWN_SCORE_TYPE` branch that writes the
  scraped value unclamped (no `LEAST`/`GREATEST`), per the "forensic visibility over guessing at a
  sanity bound" decision.

### Acceptance test — PASSED (2026-07-28)
Ran the real tracked-player scrape+build pipeline (same functions the "Tracked Players" pipeline
step calls) directly via a throwaway script (not committed): `scrapeTrackedPlayerSessions()` →
`buildSessionsFromStaging(false, undefined, undefined, 'tracked')` →
`buildResultsFromStaging(false, undefined, undefined, 'tracked')`. Result: 20 new run_ids scraped,
19 sessions built, 293 result rows inserted. Verified:
- All 12 of Bill Leach's previously-missing run_ids now exist in `tse_sessions` with
  `se_scoring = 'UNK'`, each with a populated, unclamped `re_score` (e.g. 37.00, 72.80, 46.80 —
  correctly not forced into the 25–75 MP range).
- Project-wide, 19 sessions now carry `se_scoring = 'UNK'` — Bill Leach's 12 plus 7 more for other
  tracked players (run_ids 236792–236798, "Barfoot Thompson Sixes Open") that were also silently
  vanishing before this fix, confirming the fix is general, not Bill-Leach-specific.
- `npx tsc --noEmit` and `npm run build` re-verified clean after these changes.

### src/lib/constants.ts (XIMP + consolidation)
- Added `XIMP_SCORE_HARD_CAP = 200` — single build-stage clamp for XIMP, agreed 2026-07-28.
- Added `SCORING_TYPES = ['MP', 'VP'] as const` — single source of truth for scoring-type UI
  (deliberately does NOT include `'XIMP'` yet — XIMP sessions are still structurally excluded from
  stats/player-facing UI; adding it there is separate, not-yet-agreed scope).
- Added `ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100]` — standard rows-per-page dropdown choices,
  distinct from the existing `ROWS_PER_PAGE = 20` (default selected value).

### src/lib/actions/pipelineScrape.ts (XIMP recognition)
- `parseScore()` now recognizes `XIMP`/`XIMPS` suffixes (regex `(PCT|VP|XIMPS?)`), normalizing
  both to type `'XIMP'`, before falling back to the `UNKNOWN_SCORE_TYPE` case for anything else.
- `normaliseScore()`/`ParsedRow.score_type` widened to include `'XIMP'` — no scrape-stage clamp
  applied (value passes through unchanged), per the agreed single-hard-cap-only decision.

### src/lib/actions/buildSteps.ts (XIMP recognition)
- `buildSessionsFromStaging`'s `se_scoring` CASE gets an `XIMP` branch (alongside VP/UNK/MP).
- `buildResultsFromStaging`'s `re_score` CASE gets an `XIMP` branch:
  `LEAST(200.0, s2_score_value)`.

### src/ui/shared/ScoringTypeSelects.tsx (new file)
- `ScoringTypeSelect` — `<select>` dropdown over `SCORING_TYPES`, with an `includeAll` prop (plus
  overridable `allValue`/`allLabel`) for the one call site needing an "all" option.
- `ScoringTypeToggle` — pill/toggle button group over `SCORING_TYPES`, exact visual match to the
  previously-duplicated inline version.

### src/ui/shared/RowsPerPageSelect.tsx (new file)
- `RowsPerPageSelect` — `<select>` dropdown of page-size choices; `options` prop defaults to
  `ROWS_PER_PAGE_OPTIONS`, overridable per call site.

### src/ui/player/PlayerPageClient.tsx
- Replaced the inline MP/VP toggle-button block with `<ScoringTypeToggle>`, the `scoringFilter`
  `<select>` with `<ScoringTypeSelect includeAll>`, and the rows-per-page `<select>` with
  `<RowsPerPageSelect>`.

### src/ui/player/PartnersTable.tsx
- Same three replacements as `PlayerPageClient.tsx` (toggle, scoringFilter select, rows-per-page).

### src/ui/player/PartnersChart.tsx
- Replaced the inline MP/VP toggle-button block with `<ScoringTypeToggle>`; local `type Scoring`
  now derives from `SCORING_TYPES` instead of a separately hardcoded `'MP' | 'VP'` union.

### src/ui/player/PerformanceChart.tsx
- `Props.scoring` type now derives from `SCORING_TYPES` instead of a separately hardcoded
  `'MP' | 'VP'` union.

### src/ui/home/HomePageClient.tsx
- Replaced the `scoringFilter` `<select>` with `<ScoringTypeSelect includeAll allValue=''>` (this
  call site's existing "no filter" sentinel is `''`, not `'all'` — handled via the `allValue` prop
  rather than forcing every call site to the same sentinel). Replaced both rows-per-page
  `<select>`s with `<RowsPerPageSelect>` — the sessions-table one uses the default options, the
  players-table one overrides with `options={[15, 20, 50, 100]}` (its pre-existing, already
  different list).

### src/ui/session/SessionPageClient.tsx
- Replaced the rows-per-page `<select>` with `<RowsPerPageSelect>`.

### src/ui/admin/BuildDataViewer.tsx
- `se_scoring` admin filter now uses `options={[...SCORING_TYPES]}` instead of the hardcoded
  `['MP', 'VP']` literal — no new component needed since it already used the generic
  `FMultiSelect`.

### Verification (XIMP + consolidation)
- `npx tsc --noEmit` and `npm run build` — clean.
- `grep` confirms no remaining hardcoded `'MP', 'VP'` option pairs anywhere in `src/ui/`.

### ~/.claude/CLAUDE.md (global, outside this project's repo)
- Added a new standing principle, "Reusable UI components — build once, use many": a hardcoded
  value list likely to be needed in more than one place should be extracted into a reusable
  component (constant option list + default, overridable via props) up front rather than waiting
  for the second/third duplicate. Grounded in this session's real incident (MP/VP duplicated 7
  times, rows-per-page duplicated 5 times with one silently-diverged list). Cross-referenced
  against the existing "Constants" section's "UI dropdown option lists stay local" guidance, which
  now explicitly carves out the multi-use case.

### Manual SQL — status on local (2026-07-28)

1. Add the new column — **confirmed run on local**, verified via query (column exists):

ALTER TABLE tre_results ADD COLUMN re_score numeric(5,2);

2. Backfill it from the existing split columns — **confirmed run on local**, verified via query
   (293,471/293,471 rows populated, 0 mismatches):

UPDATE tre_results SET re_score = COALESCE(re_percentage, re_vp);

3. Drop the old columns — **NOT yet run on local.** Verified via query (2026-07-28): `re_percentage`
   and `re_vp` still exist on `tre_results` alongside `re_score`. Only run this once everything in
   `## Testing` below checks out:

ALTER TABLE tre_results DROP COLUMN re_percentage;
ALTER TABLE tre_results DROP COLUMN re_vp;

4. Reclassify the 19 already-captured sessions confirmed as genuinely XIMP-scored (Bill Leach's 12
   + 7 more for other tracked players) — **confirmed run on local**, verified via query: all 19
   known run_ids now show `se_scoring = 'XIMP'` in `tse_sessions`; local's `se_scoring` distribution
   is now `MP: 11341, VP: 2956, XIMP: 19`, zero remaining `'UNK'`:

UPDATE ts1_sessions SET s1_score_type = 'XIMP'
WHERE s1_run_id IN (225292,225894,226457,227128,236792,236793,236794,236795,236796,236797,236798,238079,238080,238081,238082,238083,238084,238085,238086);

UPDATE tse_sessions SET se_scoring = 'XIMP'
WHERE se_run_id IN (225292,225894,226457,227128,236792,236793,236794,236795,236796,236797,236798,238079,238080,238081,238082,238083,238084,238085,238086);

### ta1_player_stats / ta2_partner_stats restructure — code changes (2026-07-28)

### scripts/schema.sql
- `ta1_player_stats`: `a1_plid, a1_group, a1_scoring, a1_sessions, a1_avg, a1_stddev` (keys first),
  replacing the six `a1_mp_*`/`a1_vp_*` columns. Unique key now `(a1_plid, a1_group, a1_scoring)`.
- `ta2_partner_stats`: `a2_paid` moved right after `a2_a2id` (was last); same generic
  `a2_scoring, a2_sessions, a2_avg, a2_stddev` shape. Unique key now
  `(a2_paid, a2_group, a2_scoring)`.

### src/lib/constants.ts
- `SCORING_TYPES` grows to `['MP', 'VP', 'XIMP'] as const` — XIMP now has real stats/UI support.

### src/lib/actions/statsCompute.ts
- Both `computePlayerGroupStats`/`computePartnerGroupStats` rewritten to one generic INSERT each,
  `GROUP BY ..., se_scoring` instead of separate `FILTER (WHERE se_scoring = 'MP'/'VP')` branches.
  Fully type-agnostic now — a future 4th scoring type needs zero changes here.

### src/lib/actions/players.ts
- `getPlayerAllGroupStats` — returns one flat row per `(group, scoring)` instead of one row per
  group with paired mp/vp columns; `pct_rank` is one generic `PERCENT_RANK() OVER (PARTITION BY
  a1_group, a1_scoring ...)` column instead of two separately-computed ones.
- `getPartnerStats` — now returns an array (one row per scoring type present in group C) instead
  of assuming a single row.

### src/app/api/players/[id]/results/route.ts
- Added `CASE WHEN se_scoring = 'XIMP' THEN re_score END AS ximp` alongside the existing
  `percentage`/`vp` fields — reopening the route whose shape was deliberately kept stable earlier,
  now that XIMP display is genuinely in scope.

### src/app/api/rankings/route.ts
- Removed the `SCORING_COLS` lookup table entirely (per user's decision to unify) — `scoring` query
  param is now any `SCORING_TYPES` value directly, joined via `a1_scoring = $3`/`a2_scoring = $3`.

### src/ui/rankings/RankingsPageClient.tsx
- Replaced the local lowercase `type Scoring = 'mp' | 'vp'` and hardcoded toggle with
  `SCORING_TYPES`/`ScoringTypeToggle` (uppercase, consistent with every other page). Header
  label/cell formatting now use the new shared `scoringAvgLabel`/`formatScoringValue` helpers.

### src/ui/shared/ScoringTypeSelects.tsx
- Added `formatScoringValue(scoring, value)` (MP → percentage, everything else → plain number)
  and `scoringAvgLabel(scoring)` — shared formatting helpers now used by `RankingsPageClient.tsx`
  and `PlayerPageClient.tsx`, avoiding a third copy of the same "MP shows %, others don't" logic.

### src/ui/player/PlayerPageClient.tsx
- Generalized the hand-built MP-columns/VP-columns stats table into one block rendered per
  `SCORING_TYPES` entry (via `Fragment`), instead of duplicating the column-block a third time.
- `partnerStats` reshaped from a single MP/VP object to an array (one entry per scoring type);
  the partnership-mode summary line now iterates over it instead of hardcoding two spans.
  `ResultRow` gained a `ximp` field; CSV export and the raw session-history table both gained a
  third XIMP column.

### src/ui/player/PartnersTable.tsx
- Same three changes as `PlayerPageClient.tsx` (`ResultRow.ximp`, CSV column, table column) —
  this file didn't have the group-stats table so no equivalent generalization needed there.

### src/ui/player/PartnersChart.tsx / PerformanceChart.tsx
- `valueOf`/`unit` logic widened from a binary VP-vs-MP check to a 3-way check (MP/VP/XIMP);
  CSV export in `PartnersChart.tsx` gained a third XIMP column.

### src/lib/actions/build-viewer.ts + src/ui/admin/BuildDataViewer.tsx
- `getAllPlayerStats`/`getAllPartnerStats` updated to the new generic column shape. Both admin
  tabs (`ta1_player_stats`/`ta2_partner_stats`) gained an `a1_scoring`/`a2_scoring` filter
  (consistent with "every displayed column gets its own filter"), replacing the six separate
  mp/vp filter fields with four generic ones (group, scoring, sessions, avg, stddev).

### src/app/api/admin/players/route.ts
- The single-row `LEFT JOIN ... AND a1_group = 'all'` replaced with a `LEFT JOIN` to an
  aggregating subquery (`SUM(a1_sessions)` across all scoring types for the total, `a1_avg`
  specifically `WHERE a1_scoring = 'MP'` for the existing MP-only quick-glance average) —
  preserves this admin list's existing display choice unchanged.

### src/ui/admin/PipelineTable.tsx
- `playerStatsSql`/`partnerStatsSql` help-text generators updated to describe the new column
  shape and 3-column `ON CONFLICT` target (text only, no logic change).

### src/ui/dataflow/sections.tsx
- `UpdateStatsSection`, `Ta1PlayerStatsSection`, `Ta2PartnerStatsSection` text updated to describe
  the generic per-scoring-type row shape instead of paired mp/vp columns, and the corrected
  max-rows-per-partnership count (12, not 4, now that scoring type multiplies group count).

### Verification
- `npx tsc --noEmit` and `npm run build` — clean.
- `grep` confirms zero remaining `a1_mp_`/`a1_vp_`/`a2_mp_`/`a2_vp_`/`mp_pct_rank`/`vp_pct_rank`
  references anywhere in `src/`.

### Manual SQL — ta1/ta2 restructure, not yet run, run these in pgAdmin4 in this order

1. Backup both tables:

CREATE TABLE bk1_ta1_player_stats AS SELECT * FROM ta1_player_stats;
CREATE TABLE bk1_ta2_partner_stats AS SELECT * FROM ta2_partner_stats;

2. Drop both tables:

DROP TABLE ta1_player_stats;
DROP TABLE ta2_partner_stats;

3. Recreate both from the new schema:

CREATE TABLE public.ta1_player_stats (
    a1_a1id integer NOT NULL,
    a1_plid integer NOT NULL,
    a1_group character varying(3) NOT NULL,
    a1_scoring character varying(5) NOT NULL,
    a1_sessions integer DEFAULT 0 NOT NULL,
    a1_avg numeric(5,2) DEFAULT 0 NOT NULL,
    a1_stddev numeric(5,2)
);

ALTER TABLE public.ta1_player_stats ALTER COLUMN a1_a1id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.ta1_player_stats_a1_a1id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.ta1_player_stats
    ADD CONSTRAINT ta1_player_stats_a1_plid_a1_group_a1_scoring_key UNIQUE (a1_plid, a1_group, a1_scoring);

ALTER TABLE ONLY public.ta1_player_stats
    ADD CONSTRAINT ta1_player_stats_pkey PRIMARY KEY (a1_a1id);

CREATE INDEX idx_ta1_player_stats_plid ON public.ta1_player_stats USING btree (a1_plid);

CREATE TABLE public.ta2_partner_stats (
    a2_a2id integer NOT NULL,
    a2_paid integer NOT NULL,
    a2_group character varying(3) NOT NULL,
    a2_scoring character varying(5) NOT NULL,
    a2_sessions integer DEFAULT 0 NOT NULL,
    a2_avg numeric(5,2) DEFAULT 0 NOT NULL,
    a2_stddev numeric(5,2)
);

ALTER TABLE public.ta2_partner_stats ALTER COLUMN a2_a2id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.ta2_partner_stats_a2_a2id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.ta2_partner_stats
    ADD CONSTRAINT ta2_partner_stats_a2_paid_a2_group_a2_scoring_key UNIQUE (a2_paid, a2_group, a2_scoring);

ALTER TABLE ONLY public.ta2_partner_stats
    ADD CONSTRAINT ta2_partner_stats_pkey PRIMARY KEY (a2_a2id);

4. No data-copy SQL — rebuild both tables by going to `/owner/pipeline` and running "Update Stats"
   (or "Run All"). This recomputes fully from `tre_results`, which already has correct, generic
   `re_score`/`se_scoring` data for all three scoring types (MP/VP/XIMP).

## Testing
- [x] Run SQL statements 1 and 2 above against the local DB — confirmed run and verified
      (293,471/293,471 rows backfilled, 0 mismatches)
- [ ] Open an existing MP session (`/session/[id]`) and confirm percentages still display
      correctly and match what they showed before this change
- [ ] Open an existing VP session and confirm VP values still display correctly
- [ ] Open a player page (`/player/[id]`) — confirm the results table, partners table, and
      performance/partners charts all still show correct percentages/VP values; confirm the MP/VP
      toggle buttons and scoring-filter dropdown (now `ScoringTypeToggle`/`ScoringTypeSelect`)
      still work identically to before
- [ ] On the same player page, confirm the rows-per-page dropdown (now `RowsPerPageSelect`) still
      works and still resets to page 1 on change
- [ ] Open `/owner` home page — confirm the players-table rows-per-page dropdown still shows
      `15, 20, 50, 100` (its overridden list) and the sessions-table one shows `10, 20, 50, 100`
      (the default); confirm the scoring filter dropdown (with its `''` "all" sentinel) still
      filters correctly
- [ ] Open `/owner/builddata`, Results tab — confirm the `re_score` column renders and its filter
      works; expand a session row on the Sessions tab and confirm its results panel shows scores
      correctly
- [ ] Open `/owner/builddata`, Sessions tab, filter by scoring — confirm the dropdown still filters
      MP/VP correctly, and can also filter to `XIMP` (browse unfiltered too, confirming
      `se_scoring = 'XIMP'` and unclamped `re_score` values in expanded results for the 19 known
      sessions)
- [ ] Open `/owner/dataflow` and confirm the `tre_results` section text reads correctly
- [ ] Once everything above checks out, run SQL statement 3 above to drop the old
      `re_percentage`/`re_vp` columns
- [x] Run SQL statement 4 above to reclassify the 19 known-XIMP sessions from `'UNK'` to `'XIMP'`
      — confirmed run on local, verified via query: all 19 now show `se_scoring = 'XIMP'`, zero
      remaining `'UNK'` sessions
- [ ] Run the ta1/ta2 restructure manual SQL (backup → drop → recreate) above, then go to
      `/owner/pipeline` and run "Update Stats" to rebuild both tables from `tre_results`
- [ ] After rebuilding, open a player page with recorded XIMP sessions (e.g. Bill Leach) — confirm
      the group-stats table now shows an XIMP column block (Avg/Sessions/Consistency) alongside
      MP/VP, generalized rather than a third hardcoded column pair
- [ ] Open `/owner/rankings` — confirm the scoring toggle now shows MP/VP/XIMP (unified onto
      `ScoringTypeToggle`), and selecting XIMP shows sensible rankings with a plain-number "Avg
      XIMP" column (no % sign)
- [ ] Open `/owner/builddata`, `ta1_player_stats`/`ta2_partner_stats` tabs — confirm the new
      generic columns (`a1_scoring`/`a1_sessions`/`a1_avg`/`a1_stddev` and the `a2_*` equivalents)
      render correctly, each with its own filter, and that a player/partnership now shows up to
      3 rows per group (one per scoring type) instead of 1
- [ ] Open `/owner/players` (admin players list) — confirm the sessions/avg-% columns still show
      sensible combined-sessions/MP-only-average values, matching pre-restructure behavior
- [ ] Export CSV from a player page, the partners table, and the partners chart — confirm each
      now includes an XIMP column alongside %/VP
