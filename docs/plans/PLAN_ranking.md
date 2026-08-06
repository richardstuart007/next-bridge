# PLAN_ranking — next-bridge

## Title
ranking

## Plan

### Problem
`a1_avg_rank` / `a1_group_total` / `a1_pct_rank` (and the `a2_*` partnership equivalents) are
precomputed in `statsCompute.ts` using a window function over **every** player/partnership in a
group/scoring, including those with very few sessions. A player with a strong average over many
sessions can show as e.g. "#47 of 312" because 46 players with tiny sample sizes have higher raw
(lucky) averages — even though that player is correctly sorted at the top of the visible,
session-filtered `/rankings` list. This precomputed rank is shown in two places: the `#` column
on `/rankings` (`RankingsPageClient.tsx`) and "`X of Y`" on a player's own stats table
(`PlayerPageClient.tsx`).

### Fix
Only players/partnerships meeting a minimum session count get a real precomputed rank. The
minimum is **per scoring type**, since XIMP sessions are much rarer than MP/VP — each scoring
type gets its own explicit named constant rather than one shared value:

| Constant | Value |
|---|---|
| `MIN_RANKING_SESSIONS_MP` | 30 |
| `MIN_RANKING_SESSIONS_VP` | 30 |
| `MIN_RANKING_SESSIONS_XIMP` | 1 |

Anyone below their scoring type's threshold gets `NULL` rank/group_total/pct_rank, shown in the
UI as "not enough sessions" rather than a misleading number. Because ranking is already
`PARTITION BY a1_scoring`/`a2_scoring` (see previous Q&A above), each scoring type's threshold is
fully independent — XIMP's floor of 1 has no effect on MP/VP ranking or vice versa.

- [x] Add `MIN_RANKING_SESSIONS_MP = 30`, `MIN_RANKING_SESSIONS_VP = 30`,
      `MIN_RANKING_SESSIONS_XIMP = 1` to `src/lib/constants.ts`
- [x] `statsCompute.ts` — `computePlayerGroupStats`: change the rank UPDATE so
      `avg_rank`/`group_total`/`pct_rank` are computed only over rows meeting their scoring
      type's threshold (`CASE a1_scoring WHEN 'MP' THEN MIN_RANKING_SESSIONS_MP WHEN 'VP' THEN
      MIN_RANKING_SESSIONS_VP WHEN 'XIMP' THEN MIN_RANKING_SESSIONS_XIMP END`) within the
      group/scoring partition, and explicitly set those three columns to `NULL` for rows below
      their threshold (two-statement update: one window-function UPDATE for qualifying rows, one
      NULL-reset for non-qualifying rows, so a player who later drops back below threshold on a
      recompute doesn't keep a stale rank)
- [x] `statsCompute.ts` — `computePartnerGroupStats`: same treatment for `a2_avg_rank` /
      `a2_group_total` using the same three per-scoring constants against `a2_sessions`
- [x] `players.ts` (`getPlayerAllGroupStats`) — widen `a1_avg_rank`/`a1_group_total` types to
      `number | null`
- [x] `RankingsPageClient.tsx` — widen `a1_avg_rank`/`a2_avg_rank` types to `number | null`;
      render "—" in the `#` column when null instead of a blank cell
- [x] `PlayerPageClient.tsx` — widen `a1_avg_rank`/`a1_group_total` types to `number | null`;
      Rank column shows "`X of Y`" only when `a1_avg_rank` is not null, otherwise shows
      "Not enough sessions" (when `sessions > 0`) instead of the current blank
- [ ] After `#code`, re-run "Update Stats" on `/owner/pipeline` (local) to repopulate
      `ta1_player_stats`/`ta2_partner_stats` with the new nulled-out ranks for sub-threshold rows

### Rankings page session-min dropdown
Align the `/rankings` "≥ N sessions" browse filter with the new floors, per scoring type, so
every visible row always has a real precomputed rank. The dropdown's option list changes based on
which scoring type is currently selected.

- [x] `RankingsPageClient.tsx` — replace the single `SESSIONS_MIN_OPTIONS = [1, 20, 50, 100, 200]`
      with two lists selected by the current `scoring` value:
      - MP/VP: `[MIN_RANKING_SESSIONS_MP, 50, 100, 200]` → `[30, 50, 100, 200]` (MP and VP share
        the same numeric value today, so one list serves both)
      - XIMP: `[MIN_RANKING_SESSIONS_XIMP, 3, 5]` → `[1, 3, 5]`
- [x] `RankingsPageClient.tsx` — `min` state default becomes scoring-dependent: switching the
      `scoring` selector resets `min` to that scoring type's threshold
      (`MIN_RANKING_SESSIONS_MP`/`VP`/`XIMP`) rather than keeping whatever `min` was selected for
      the previous scoring type — otherwise switching to XIMP with `min` still at 30 would show
      an empty list

### Bug: "all" Tournament Type showed a stale rank (found while verifying the fix above)
Reported: A/B/C renumbered correctly after the fix above, but Tournament Type "All" still showed
Martin Reid (the genuine #1 by average, 30+ MP sessions) at position 88.

Investigated directly against the local database (`ta1_player_stats` for Martin Reid, group=all,
scoring=MP): the actual precomputed data is already correct — `a1_avg_rank = 1`,
`a1_group_total = 5496`. So the underlying fix works; the "88" on screen was a **stale cached API
response**. `/api/rankings/route.ts`'s `table_query` calls don't pass `skipCache`, and
`nextjs-shared`'s read cache has no expiry and is keyed by exact SQL+params — it's only bypassed
on writes (`isupdate: true`), never invalidated by a later "Update Stats" run. So a `/rankings`
request made (with the same group/scoring/min/filters) before a recompute keeps being served
back verbatim after the recompute, indefinitely, until a server restart or manual cache clear.
This is the same failure mode `~/.claude/CLAUDE.md`'s "Maintenance/pipeline reads must never use
the cache" rule targets: data whose entire purpose is "what does the DB look like right now,
after the pipeline last ran" must not be cached.

- [x] `src/app/api/rankings/route.ts` — add `skipCache: true` to all six `table_query` calls
      (players, players/count, partnerships, partnerships/count, players/groupTotal,
      partnerships/groupTotal), so `/rankings` always reflects the current `ta1_player_stats`/
      `ta2_partner_stats` contents instead of a stale pre-recompute snapshot

### Feature: show NZ Bridge number on the Players tab
Add `pl_nz_bridge_number` as a column immediately before Name on the Players tab of
`/rankings` (Partnerships tab not touched — it has no single "Name" column, just a combined
"Player 1 & Player 2" cell, so "before the name" doesn't map onto it the same way).

- [x] `src/app/api/rankings/route.ts` — add `pl_nz_bridge_number` to the players `SELECT`
- [x] `RankingsPageClient.tsx` — add `pl_nz_bridge_number: number` to `PlayerRow`; add a new
      "NZ#" header/filter-row cell and body cell immediately before the Name column in the
      Players table

### Feature: NZ# filter (reusable component) + Partnership ID column/filter
NZ# needs an actual filter control, not just a display column — and since `HomePageClient.tsx`
already hand-rolls an identical "type digits, filter by substring" box for the same
`pl_nz_bridge_number` field, this is the second occurrence of that exact shape, which is the
trigger (per `~/.claude/CLAUDE.md`'s "Catch duplication before writing the second copy") to
extract a shared component now rather than write a third one-off copy. The same component also
covers the new Partnership ID (`pa_paid`) filter — both are "numeric ID column, partial-match
filter" boxes with no field-specific behavior.

- [x] New `src/ui/shared/NumberFilterInput.tsx` — generic reusable header-cell filter input
      (`value`/`onChange`/`placeholder`/`overrideClass` props), wrapping `MyInput`
- [x] `HomePageClient.tsx` — replace the hand-rolled NZ# `MyInput` with `NumberFilterInput`
      (the `fNz`/`setFNz` state and the separate "Excl. 0" checkbox are unchanged — only the
      input box itself is swapped)
- [x] `src/app/api/rankings/route.ts` — accept an `nz` param, filtering
      `pl_nz_bridge_number::text ILIKE $n` (same pattern as `admin/players/route.ts`); accept a
      `paid` param, filtering `pa_paid::text ILIKE $n`; add `pa_paid` is already selected in the
      partnerships query (no change needed there)
- [x] `RankingsPageClient.tsx` — add `nzFilter`/`setNzFilter` state (already added) wired into
      the fetch params and the players-page-reset effect; add `paidFilter`/`setPaidFilter` state
      wired the same way for partnerships; add an "NZ#" `NumberFilterInput` filter-row cell on
      the Players tab (replacing the empty placeholder cell); add a new "ID" column
      (header + filter-row `NumberFilterInput` + body cell showing `pa_paid`) as the first data
      column on the Partnerships tab, before the Players (name pair) column

### Partnerships need their own, much lower ranking threshold
Partnership data investigated directly against the local DB: partnerships accumulate shared
sessions far slower than individual players (e.g. all/MP: avg 4.5 sessions/partnership, only
~2% reach 30, vs. ~42% of individual players). Applying the player thresholds
(`MIN_RANKING_SESSIONS_MP/VP` = 30) to partnerships as well was wrong — almost no partnership
would ever get a real rank. Partnerships get their own, separate constants:

| Constant | Value |
|---|---|
| `MIN_RANKING_SESSIONS_PARTNER_MP` | 5 |
| `MIN_RANKING_SESSIONS_PARTNER_VP` | 5 |
| `MIN_RANKING_SESSIONS_PARTNER_XIMP` | 1 |

The `/rankings` session-min browse dropdown was previously a single value (`min`) shared by both
tabs — that no longer makes sense now that players and partnerships rank from very different
floors, so it splits into two independent dropdowns/states, one per tab:
- Players tab (unchanged): MP/VP `[30, 50, 100, 200]`, XIMP `[1, 3, 5]`
- Partnerships tab (new): MP/VP `[5, 10, 20, 50]`, XIMP `[1, 3, 5]`

- [x] Add `MIN_RANKING_SESSIONS_PARTNER_MP = 5`, `MIN_RANKING_SESSIONS_PARTNER_VP = 5`,
      `MIN_RANKING_SESSIONS_PARTNER_XIMP = 1` to `src/lib/constants.ts`
- [x] `statsCompute.ts` — `computePartnerGroupStats`'s rank CASE SQL switches from reusing the
      player thresholds (`MIN_RANKING_SESSIONS_CASE_SQL_A2`, previously a straight
      `a1_scoring`→`a2_scoring` substitution of the player CASE) to its own CASE built from the
      three new partner-specific constants
- [x] `src/app/api/rankings/route.ts` — split the single `min` query param into `playersMin` and
      `partnersMin`, applied to `a1_sessions >= $1` / `a2_sessions >= $1` respectively
- [x] `RankingsPageClient.tsx` — split `min`/`setMin`/`defaultMinFor`/`sessionsMinOptionsFor` into
      separate players- and partnerships-scoped versions (`playersMin`/`partnersMin`, etc.), each
      with their own scoring-change reset effect and dropdown option lists per the table above
- [ ] After `#code`, re-run "Update Stats" on `/owner/pipeline` (local) so partnership ranks
      reflect the new, much lower threshold

### Small display fixes
- [x] `RankingsPageClient.tsx` — new `WIDTH_NZ_RANKINGS = 'w-32'` constant in
      `src/lib/constants.ts`; applied to the Players tab's NZ# column (header + filter cell)
- [x] `RankingsPageClient.tsx` — Partnerships tab's combined "Players" column (one cell showing
      "Name1 & Name2") split into two separate columns, "Player 1" and "Player 2", each with its
      own name/link/tracked-dot

### Partnership player order was never reliably alphabetical — fixed at display time
Investigated why "Jack James" showed in the Player 1 column ahead of "Anne Gordon": `tpa_partners`'
`pa_plid1`/`pa_plid2` are written by two different code paths with different conventions —
`getOrCreatePartnerRow` (players.ts) sorts alphabetically by name, but the scrape pipeline
(`pipelineScrape.ts`, which is what actually populates data via `/owner/pipeline` today) sorts by
`Math.min(plid, plid)`/`Math.max(plid, plid)` — numeric player ID, unrelated to name. Whichever
path's insert lands first for a pair wins (`ON CONFLICT DO NOTHING`), so the stored order is
effectively arbitrary. Agreed fix: don't rely on stored order — always display/filter the
alphabetically-first player as "Player 1", computed at query time.

- [x] `src/app/api/rankings/route.ts` — `partnersFrom` restructured into a subquery that computes
      `pl_plid1`/`pl_name1`/`pl_tracked1`/`pl_nz_bridge_number1` (and the `*2` equivalents) via
      `CASE WHEN p1.pl_name <= p2.pl_name THEN ... ELSE ...`, so the `*1` columns always hold the
      alphabetically-first player regardless of how `pa_plid1`/`pa_plid2` are actually stored;
      verified directly against local data (0 rows violate `name1 <= name2`; "Anne Gordon" now
      correctly outputs as `pl_name1` ahead of "Jack James")

### Partnerships: NZ# for each player + per-column filters
Once Player 1/Player 2 had their own columns, extended to match the Players tab's pattern fully:
each player gets their own NZ# column (before their name), and — per explicit agreement — each of
the 4 columns (P1 NZ#, P1 Name, P2 NZ#, P2 Name) gets its own independent filter, rather than one
shared/combined box.

- [x] `src/app/api/rankings/route.ts` — the display-order subquery above also outputs
      `pl_nz_bridge_number1`/`pl_nz_bridge_number2`; added `p1Name`/`p2Name` params
      (`pl_name1 ILIKE`/`pl_name2 ILIKE`, replacing the old single `partnerSearch` param that
      matched either name) and `p1Nz`/`p2Nz` params (`pl_nz_bridge_number1/2::text ILIKE`)
- [x] `RankingsPageClient.tsx` — `PartnershipRow` gained `pl_nz_bridge_number1`/`_2`; replaced the
      single `partnerFilter` state with `p1NameFilter`/`p2NameFilter`/`p1NzFilter`/`p2NzFilter`,
      each wired to its own filter-row cell (reusing `HeaderTypeahead` for the two name filters
      and the shared `NumberFilterInput` for the two NZ# filters, both already-established
      components — no new component code needed); Partnerships tab now has 9 columns (#, ID, P1
      NZ#, Player 1, P2 NZ#, Player 2, Avg, Sessions, Tracked); `TableEmptyRow` `colSpan` updated
      7 → 9

## Changes

### src/lib/constants.ts
- Added `MIN_RANKING_SESSIONS_MP = 30`, `MIN_RANKING_SESSIONS_VP = 30`,
  `MIN_RANKING_SESSIONS_XIMP = 1` — per-scoring-type floor for a real precomputed player rank.
- Added `MIN_RANKING_SESSIONS_PARTNER_MP = 5`, `MIN_RANKING_SESSIONS_PARTNER_VP = 5`,
  `MIN_RANKING_SESSIONS_PARTNER_XIMP = 1` — separate, much lower floor for partnerships (a
  partnership only gains a session when the same two people play together, so it accumulates
  sessions far slower than an individual player).

### src/lib/actions/statsCompute.ts
- Added `MIN_RANKING_SESSIONS_CASE_SQL` (player thresholds, keyed on `a1_scoring`) and a separate
  `MIN_RANKING_SESSIONS_CASE_SQL_A2` (partner thresholds, keyed on `a2_scoring`) — no longer a
  straight substitution of the player CASE, since partnerships now use their own constants.
- `computePlayerGroupStats`: the rank/group_total/pct_rank UPDATE now only ranks rows with
  `a1_sessions >= <that row's scoring-type threshold>`; added a second UPDATE that resets those
  three columns to `NULL` for rows below their threshold, so a player who falls back below
  threshold on a later recompute doesn't keep a stale rank.
- `computePartnerGroupStats`: same treatment for `a2_avg_rank`/`a2_group_total` against
  `a2_sessions`, using the partner-specific thresholds.

### src/lib/actions/players.ts
- `getPlayerAllGroupStats` — widened `a1_avg_rank`/`a1_group_total` return types to
  `number | null` to match the now-nullable columns.

### src/ui/shared/NumberFilterInput.tsx (new)
- Generic reusable header-cell filter input (`value`/`onChange`/`placeholder`/`overrideClass`
  props) wrapping `MyInput`, for "type digits, filter by substring" numeric-ID columns. Extracted
  because `HomePageClient.tsx` already hand-rolled this exact shape for NZ# — the second call
  site (Rankings' NZ# filter) was the trigger to build a shared component instead of a third
  one-off copy; it also now covers the new Partnership ID filter.

### src/ui/home/HomePageClient.tsx
- The NZ# column's hand-rolled `MyInput` replaced with `NumberFilterInput`. `fNz`/`setFNz` state
  and the separate "Excl. 0" checkbox are unchanged.

### src/app/api/rankings/route.ts
- The `playersGroupTotal`/`partnersGroupTotal` lookups (`SELECT a1_group_total ... LIMIT 1`) now
  add `AND a1_group_total IS NOT NULL` (and the `a2_` equivalent) — without it, an arbitrary
  `LIMIT 1` row could land on a newly-nullable, below-threshold row and show "— total" instead of
  the real ranked-population count.
- All six `table_query` calls now pass `skipCache: true`. Root cause of the "all/MP shows stale
  rank" bug: this data is only ever refreshed by an explicit "Update Stats" pipeline run, but the
  read cache has no expiry and isn't invalidated by that run's writes — confirmed directly against
  the local DB (Martin Reid's `ta1_player_stats` row was already correct, `a1_avg_rank = 1`) while
  the API kept serving a pre-recompute cached response. Restarting the dev server (which clears
  the in-memory cache) made the stale value disappear, confirming the diagnosis.
- Added `pl_nz_bridge_number` to the players `SELECT`.
- Added an `nz` filter param (`pl_nz_bridge_number::text ILIKE`) and a `paid` filter param
  (`pa_paid::text ILIKE`), same partial-match pattern as `admin/players/route.ts`'s `nz` filter.
- The single `min` query param split into `playersMin` and `partnersMin`, applied to
  `a1_sessions >= $1` / `a2_sessions >= $1` respectively — players and partnerships now rank from
  different floors, so a shared value no longer made sense.
- `partnersFrom` restructured into a subquery (see "Partnership player order" plan section above)
  that always outputs the alphabetically-first player as `pl_plid1`/`pl_name1`/`pl_tracked1`/
  `pl_nz_bridge_number1` and the other as the `*2` equivalents, regardless of `pa_plid1`/`pa_plid2`
  storage order.
- Replaced the single `partnerSearch` param (matched either player's name) with independent
  `p1Name`/`p2Name` (`pl_name1 ILIKE`/`pl_name2 ILIKE`) and `p1Nz`/`p2Nz`
  (`pl_nz_bridge_number1/2::text ILIKE`) params.

### src/ui/rankings/RankingsPageClient.tsx
- `PlayerRow`/`PartnershipRow` — `a1_avg_rank`/`a2_avg_rank` widened to `number | null`; the `#`
  column now renders "—" when null instead of a blank cell.
- `SESSIONS_MIN_OPTIONS_STANDARD`/`_XIMP` (Players tab, unchanged values) plus new
  `PARTNER_SESSIONS_MIN_OPTIONS_STANDARD` (`[5, 10, 20, 50]`) and `_XIMP` (`[1, 3, 5]`) for the
  Partnerships tab; `sessionsMinOptionsFor`/`defaultMinFor` split into
  `playersSessionsMinOptionsFor`/`playersDefaultMinFor` and
  `partnersSessionsMinOptionsFor`/`partnersDefaultMinFor`.
- The single shared `min`/`setMin` state split into `playersMin`/`setPlayersMin` and
  `partnersMin`/`setPartnersMin`; the scoring-change reset `useEffect` now resets both
  independently to their own tab's default.
- `PlayerRow` gained `pl_nz_bridge_number`; the Players tab has an "NZ#" column (with a working
  `NumberFilterInput` filter, wired to new `nzFilter` state) immediately before Name, rendering
  "—" when 0. Given a fixed `WIDTH_NZ_RANKINGS = 'w-32'` (new constant in `constants.ts`).
- Partnerships tab gained an "ID" column (`pa_paid`, with a `NumberFilterInput` filter wired to
  new `paidFilter` state) as the first data column, before the Player columns.
- Partnerships tab's combined "Players" column (one cell, "Name1 & Name2") split into two
  separate "Player 1"/"Player 2" columns, each with its own link/tracked-dot, each preceded by
  its own "NZ#" column (`pl_nz_bridge_number1`/`_2`, `WIDTH_NZ_RANKINGS`).
- `PartnershipRow` gained `pl_nz_bridge_number1`/`_2`. The single `partnerFilter` state replaced
  with four independent filters — `p1NameFilter`/`p2NameFilter` (`HeaderTypeahead`, reused as-is)
  and `p1NzFilter`/`p2NzFilter` (`NumberFilterInput`, reused as-is) — one per column, per explicit
  agreement (rather than one shared/combined box).
- Partnerships tab is now 9 columns (#, ID, P1 NZ#, Player 1, P2 NZ#, Player 2, Avg, Sessions,
  Tracked); `TableEmptyRow`'s `colSpan` corrected to 8 (Players) and 9 (Partnerships) — the
  Players one had gone stale at 7 when the NZ# column was first added.

### src/ui/player/PlayerPageClient.tsx
- `playerStats` state type — `a1_avg_rank`/`a1_group_total` widened to `number | null`.
- Rank column now shows "`X of Y`" only when `a1_avg_rank` is not null; otherwise shows
  "Not enough sessions" (when the player has sessions in that group/scoring) instead of a blank.

### Column rename: pl_nz_bridge_number → pl_nzb (project-wide)
`pl_nz_bridge_number` (integer, on `tpl_players`) renamed to `pl_nzb` — the "NZ#" column was too
wide in the Rankings UI, and the shorter name reads fine there. Run project-wide (not just the
ranking-related files touched above), since the column is referenced in 24+ files including
scraping/pipeline internals — confirmed and agreed explicitly rather than assumed.

Related identifiers renamed for consistency with the new DD root (`nzb`), everywhere they appear:
`nz_bridge_number` (local vars/params), `nzNumber`, `nz_number`, `partner_nz_number` →
`partner_nzb`, `getPlayerByNzNumber` → `getPlayerByNzb`, `getPlayersWithoutNzNumber` →
`getPlayersWithoutNzb`. **Not** touched: `am_nz_number` on `tam_ambiguous` — a genuinely different
column (candidate NZ number for an ambiguous name match), confirmed before excluding it.

New filter-state variables added earlier in this same plan were also corrected to the project's
actual documented convention (`filter_<column>`/`setFilter_<column>`, not a suffix or an invented
`p1`/`p2` prefix) — see `~/.claude/CLAUDE.md`'s "Everything tied to a DD item..." section for the
incident this added. `RankingsPageClient.tsx`'s partnership filters are now `filter_name1`/
`filter_name2`/`filter_nzb1`/`filter_nzb2`/`filter_paid` (previously `p1NameFilter` etc.).

- [x] User ran `ALTER TABLE tpl_players RENAME COLUMN pl_nz_bridge_number TO pl_nzb;` in pgAdmin4
      (local) — confirmed done
- [ ] User runs the matching index rename (`ALTER INDEX uq_pl_nz_bridge_number RENAME TO
      uq_pl_nzb;`, or the drop/recreate equivalent given in chat) — Postgres does not rename
      indexes automatically when a column is renamed, whether via SQL or pgAdmin's rename dialog
- [x] `scripts/schema.sql` — column and its unique index renamed to match
- [x] Full project sweep (24+ files: `RankingsPageClient.tsx`, `api/rankings/route.ts`,
      `HomePageClient.tsx`, `PlayerPageClient.tsx`, `NumberFilterInput.tsx`, `admin/players/route.ts`,
      `admin/BuildDataViewer.tsx`, `admin/PlayersAdmin.tsx`, `SessionPageClient.tsx`,
      `api/sessions/[id]/results/route.ts`, `api/players/[id]/results/route.ts`,
      `PartnersChart.tsx`, `PartnersTable.tsx`, `api/players/correct/route.ts`,
      `lib/actions/players.ts`, `api/players/merge/route.ts`, `lib/actions/pipelineScrape.ts`,
      `lib/scrape/parseHtml.ts`, `lib/scrape/nzbridge.ts`, all 6 scrape API routes,
      `src/lib/Data flow.md`, `src/ui/dataflow/sections.tsx`) — verified via repo-wide grep (zero
      remaining `pl_nz_bridge_number`/`nz_bridge_number`/`nz_number` references outside archived
      plan files, which are left as historical record) and `npx tsc --noEmit` (clean)
- [x] `RankingsPageClient.tsx` partnership filter-state variables corrected to
      `filter_<column>`/`setFilter_<column>` form

**Found, not fixed (flagged for you, out of scope for this task):**
- `lib/create_prod_tables.sql` and `lib/migrate_clean.sql` still reference the old column name.
  These aren't `scripts/schema.sql` (the project's declared single source of truth) — they look
  like older one-off migration artifacts. Left untouched since deleting/editing them is a judgment
  call, not a mechanical rename.
- `src/lib/Data flow.md`'s "Assign Ambiguous Player" section documents `POST
  /api/players/ambiguous`, and "Merge Players" describes updating `trw_results_raw.rw_name1`/
  `rw_name2` and `tre_results.re_plid`/`re_partner_plid` — none of which exist in the current
  codebase (no `ambiguous` route folder; `players/merge/route.ts` does something entirely
  different via `tpa_partners`/`re_paid`). This looks like stale documentation from a prior
  implementation, unrelated to today's rename — only touched the column-name mentions inside it,
  left the rest as-is.

### More column-width fixes on the Partnerships/Players tabs
- [x] New `WIDTH_PAID_RANKINGS = 'w-32'` constant (own name, tied to `pa_paid` — a different DD
      item from `pl_nzb`, so not reusing `WIDTH_NZB_RANKINGS` even though the value matches) —
      applied to the Partnerships tab's "ID" column (header + filter cell), which had no explicit
      width before
- [x] `WIDTH_SCORING_RANKINGS` changed `w-32` → `w-24` — affects both tabs' scoring-type column
      (shared constant, single change point)
- [x] New `WIDTH_TOURNAMENT_TYPE_RANKINGS = 'w-24'` constant — applied to the Tournament Type
      (A/B/C/All) toggle in the header bar above both tables, which had no width constraint before
      (not reusing the existing `WIDTH_TOURNAMENT_TYPE = 'w-40'`, since that's Home page's
      TournamentType multi-select and changing it would affect Home page too)

### Bug: sessionStorage persists "all selected" as a frozen full-array snapshot, not "all"
Found live in the `rs7_br_home_state` sessionStorage entry: `filter_pl_club` (and every other
"start fully selected = no filter" multi-select) is written to sessionStorage as the literal array
of every currently-selected value (e.g. all 106 club names), not a sentinel meaning "all."

Root cause, confirmed against the code: on reload, that saved array is reconciled against the
freshly-loaded option list (`HomePageClient.tsx:354-360`, same pattern in
`PlayerPageClient.tsx:510-538` and `:171` for `filter_plid`). If the underlying option set grows
between saves (a new club gets scraped in, a new grade/rank/event type appears, a player gets a
new partner for the first time), the old saved array no longer covers every current option —
`isSelectionFiltering` (`nextjs-shared`) then reports a genuine partial filter, and the page
silently starts excluding the new value from "all" results with no user action having caused it.
This is the same failure mode `~/.claude/CLAUDE.md`'s "Never bury a hardcoded decision inline"/DD
sections generally guard against: a snapshot masquerading as a live "no filter" state.

SQL side checked and confirmed already correct — `HomePageClient.tsx:203` and its siblings only
send a filter param when `isSelectionFiltering` is true, so "all selected" already means "no WHERE
clause" server-side. The bug is isolated to sessionStorage serialization.

**Affected** (every file that calls `sessionStorage.setItem` — confirmed via project-wide grep,
only these two): `HomePageClient.tsx` (`filter_rank`, `filter_grade`, `filter_pl_club`,
`filter_se_club` — DB-driven, can grow; `filter_day_of_week`, `filter_scoring`,
`filter_is_summary` — fixed lists, same waste but no correctness bug since those never grow);
`PlayerPageClient.tsx` (`filter_club`, `filter_event_type`, `filter_plid` — DB-driven/derived from
loaded results, can grow; `filter_tournament` — fixed list).

**Decided approach** (via `AskUserQuestion`): the sentinel serialize helper is generic enough to
pair with `isSelectionFiltering` (already shared), so it belongs in `nextjs-shared`, not
duplicated locally — proposed addition, to be applied from a `nextjs-shared` session (Claude
cannot write there from this project):

```ts
// nextjs-shared/src/components/isSelectionFiltering.ts (or a new sibling file, same folder)
export const SELECTION_ALL = 'all'

export function serializeSelection(selected: string[], totalOptions: number): typeof SELECTION_ALL | string[] {
  return isSelectionFiltering(selected, totalOptions) ? selected : SELECTION_ALL
}
```

- [x] User applied `SELECTION_ALL`/`serializeSelection` in a `nextjs-shared` session next to
      `isSelectionFiltering` (exactly the proposed shape above), bumped the package version,
      committed, pushed — documented in `CONSUMING_PROJECTS.md` under "SELECTION_ALL /
      serializeSelection"
- [x] `#reinstall` run in next-bridge to pick up `nextjs-shared@2.1.63` (all 6 steps passed:
      `node_modules`/`package-lock.json` removed, `npm install --legacy-peer-deps`, `.next`
      removed, `tsc --noEmit` clean, `npm run build` clean)
- [x] `HomePageClient.tsx` — at save time, every multi-select now serialized via
      `serializeSelection([...filter_X], xOptions.length)`: `filter_rank` (`rankOptions.length`),
      `filter_grade` (`gradeOptions.length`), `filter_pl_club` (`clubOptions.length`),
      `filter_se_club` (`sessClubOptions.length` — this one was never persisted at all before;
      now saved + restored like its siblings), `filter_day_of_week`/`filter_scoring`/
      `filter_is_summary` (fixed-list totals: `DAYS_OF_WEEK.length`/`SCORING_TYPES.length`/
      `SUMMARY_TYPES.length`)
- [x] `HomePageClient.tsx` — at restore time, the 4 DB-driven filters' `onOptionsLoaded`
      reconciliation now checks `Array.isArray(saved) && saved.length` (previously `saved?.length`,
      which would have thrown trying to `.filter()` the sentinel string) — the `SELECTION_ALL`
      sentinel and an absent key both fall through to the existing `setFilter_X(new Set(opts))`
      default
- [x] `HomePageClient.tsx` — the 3 fixed-list filters' restore block: same `Array.isArray` guard,
      so `SELECTION_ALL` is skipped (state already initializes to the full set by default) while
      genuine saved arrays still reconcile as before
- [x] `PlayerPageClient.tsx` — same treatment: `serializeSelection` at save time for
      `filter_club`/`filter_event_type` (options-length totals), `filter_tournament` (fixed total
      of 3), and `filter_plid` (serialized as `[...filter_plid].map(String)` against
      `new Set(results.map(r => r.partner_id)).size` — `serializeSelection` stayed `string[]`-only
      per the nextjs-shared decision, so the numeric Set converts to strings at the call site and
      back via `.map(Number)` on restore, no second overload needed); restore logic updated the
      same way (skip reconciliation when saved is the sentinel) across all four
- [x] Regression-checked via `npm run build` (full production build, clean) — the genuine-subset
      restore path (array reconciliation) is unchanged code, only newly guarded by
      `Array.isArray`, so existing partial-filter persistence continues to work

### App-wide filter componentization + width consolidation (scope grew beyond ranking)
User is iterating live on the UI while looking at it and will keep adjusting until it's right —
everything stays tracked in this one plan rather than splitting into a new one.

Three directives, agreed via `AskUserQuestion`:
1. `WIDTH_NZB_RANKINGS`/`WIDTH_PAID_RANKINGS` were wrongly scoped as Rankings-only — an audit
   confirmed `pl_nzb` and `pa_paid` columns/filters exist on Home, `PlayersAdmin.tsx` (hardcoded
   `w-20`/`w-40`, not even using a shared component), and `BuildDataViewer.tsx` (unstyled). Rename
   to `WIDTH_NZB`/`WIDTH_PAID` (drop page suffix) and apply everywhere those columns appear.
   `WIDTH_TOURNAMENT_TYPE_RANKINGS` → `WIDTH_TOURNAMENT_TYPE_TOGGLE` (names the component-type
   difference — bespoke button toggle vs. Home's `StringMultiSelect` — not the page; no other
   button-toggle instance exists yet to actually share the value with).
2. Every `WIDTH_*` constant (not just the 9 new ones) gets one consolidated section in the
   `/owner` Constants tab, instead of being scattered across topic sections or missing entirely.
3. Every filter control app-wide becomes its own named component — whether reused elsewhere or
   not — per full audit (below). Raw inline `MyInput`/`MySelect`/`<input>` filters get extracted;
   already-shared components (`NumberFilterInput`, `ClubSelect`, `GradeSelect`, `RankSelect`,
   `ScoringTypeSelect`, `StringMultiSelect`, BuildDataViewer's `FText`/`FDate`/`FMultiSelect`/
   `FSelect`) already satisfy this and are left alone. Genuinely duplicated raw filters (date
   range, day-of-week, session-name, is_summary, the near-identical `PartnerSelect`/`PlayerSelect`
   dropdowns) consolidate into one shared component each rather than one extraction per call site.
4. New session-id filter (`se_seid`/equivalent), positioned above the session column, everywhere
   a session-id-shaped column appears: Home Sessions tab, `BuildDataViewer.tsx`'s ts1/tse/tre
   tabs, `PlayerPageClient.tsx`'s History tab, `PartnersTable.tsx`.

#### Full filter audit (component + width, before this work)
- **Rankings Players**: topN (raw `MySelect`, `w-24` hardcoded) · `pl_nzb` (`NumberFilterInput`,
  `WIDTH_NZB_RANKINGS`) · `pl_name` (`HeaderTypeahead`, local, no width) · scoring
  (`ScoringTypeSelect`, `WIDTH_SCORING_RANKINGS`) · sessions-min (`SessionsMinSelect`, local,
  `WIDTH_SESSIONS_MIN`) · `pl_grade` (`GradeSelect`, `WIDTH_GRADE`) · `pl_club` (`ClubSelect`,
  `WIDTH_CLUB`) · `pl_tracked` (raw checkbox, no width)
- **Rankings Partnerships**: topN (raw `MySelect`, `w-24` hardcoded, duplicate of Players' one) ·
  `pa_paid` (`NumberFilterInput`, `WIDTH_PAID_RANKINGS`) · `pl_nzb1`/`pl_nzb2`
  (`NumberFilterInput`×2, `WIDTH_NZB_RANKINGS`) · `pl_name1`/`pl_name2` (`HeaderTypeahead`×2,
  local, no width) · scoring/sessions-min (shared with Players tab) · `pl_tracked1`/`pl_tracked2`
  (raw checkbox, no width)
- **Home Players**: `pl_name` (raw `MyInput`, local `INPUT_CLS`, no fixed width) · `pl_nzb`
  (`NumberFilterInput`, but passed local `INPUT_CLS` not a named width) · exclude-0 (raw
  checkbox) · `pl_rank` (`RankSelect`, `WIDTH_RANK`) · `pl_grade` (`GradeSelect`, `WIDTH_GRADE`) ·
  `pl_club` (`ClubSelect`, `WIDTH_CLUB`) · `pl_rating`/`pl_a_points`/`a1_sessions` min (raw
  `MyInput`×3, local `NUM_CLS`) · `pl_tracked` (raw checkbox)
- **Home Sessions**: date from/to (raw `MyInput type=date`×2, local `INPUT_CLS`) ·
  `se_day_of_week` (`StringMultiSelect`, `WIDTH_DAY`) · `se_tournament`
  (`StringMultiSelect`, `WIDTH_TOURNAMENT_TYPE`) · `se_scoring` (`ScoringTypeMultiSelect`,
  `WIDTH_SCORING`) · `se_is_summary` (`SummaryTypeMultiSelect`, `WIDTH_SUMMARY`) · `se_club`
  (`ClubSelect`, `WIDTH_CLUB`) · `se_name` (raw `MyInput`, `WIDTH_TOURNAMENT_NAME` merged in)
- **PlayersAdmin.tsx**: `pl_name` (raw `MyInput`, hardcoded `w-56`) · `pl_nzb` (raw `MyInput` —
  not even using the shared `NumberFilterInput` component, hardcoded `w-40`)
- **BuildDataViewer.tsx** (ts1/ts2/tse/tre/tpl/tpa/ta1/ta2 tabs): all filters already use shared
  `FText`/`FDate`/`FMultiSelect`/`FSelect` wrapper components (defined once in
  `DataTableShared.tsx`) — already satisfies "is a component," just all `w-full`, no named
  per-column width anywhere
- **PlayerPageClient.tsx History tab**: date from/to (raw `MyInput`×2) · `day_of_week` (raw
  `MySelect`) · `partner_id` (local `PartnerSelect` — near-duplicate of `PartnersTable.tsx`'s
  `PlayerSelect`) · `session_name` (raw `MyInput`) · `club` (`ClubSelect`, `WIDTH_CLUB`) ·
  `tournament` (`StringMultiSelect`, no width) · `event_type` (`EventTypeSelect`, no width) ·
  `scoring` (`ScoringTypeSelect`, no width) · `is_summary` (raw `MySelect`)
- **PartnersTable.tsx**: `player_id` (local `PlayerSelect` — near-duplicate of the above) · date
  from/to, `day_of_week`, `session_name`, `club`, `tournament`, `event_type`, `scoring`,
  `is_summary` — same shapes as PlayerPageClient's History tab, several raw/duplicated

#### Plan
- [x] Rename `WIDTH_NZB_RANKINGS` → `WIDTH_NZB`, `WIDTH_PAID_RANKINGS` → `WIDTH_PAID` in
      `constants.ts` and `RankingsPageClient.tsx`. `WIDTH_TOURNAMENT_TYPE_RANKINGS` and
      `WIDTH_SCORING_RANKINGS` were further consolidated (not just renamed) into the existing
      shared `WIDTH_TOURNAMENT_TYPE`/`WIDTH_SCORING` constants (both changed to `w-24`), per
      explicit agreement via `AskUserQuestion` that one shared value should apply everywhere
      those columns appear, superseding the earlier "keep Rankings on its own suffixed constant"
      plan text above
- [x] Applied `WIDTH_NZB` to `pl_nzb` filters/columns on Home Players and `PlayersAdmin.tsx`
      (replacing its hardcoded `w-40`); `BuildDataViewer.tsx`'s architecture (shared `FText`/etc.
      wrappers, all `w-full`) makes a per-column width moot there, so left as-is
- [x] Applied `WIDTH_PAID` — currently only consumed on Rankings' Partnerships "ID" column;
      `BuildDataViewer.tsx`'s `tpa` tab has no `pa_paid` filter cell to apply it to
- [x] `PlayersAdmin.tsx` — replaced its raw `MyInput` NZ# filter with `NumberFilterInput`
      (`WIDTH_NZB`)
- [x] New consolidated "Widths" section in `ConstantsPage.tsx` listing all 20 `WIDTH_*`
      constants; the "Rankings" section now holds only the 6 `MIN_RANKING_SESSIONS_*` constants
- [x] Rankings — extracted shared local `TopNSelect` (used by both Players and Partnerships tabs,
      replacing the duplicated inline `MySelect`) and reused the new `FilterTracked` component for
      both tabs' tracked checkboxes (a dedicated `TrackedOnlyCheckbox` wasn't needed once
      `FilterTracked` existed)
- [x] New shared `src/ui/shared/`: `FilterName` (text, any `*_name` column), `FilterTracked`
      (`pl_tracked` checkbox), `FilterDate` (single bounded date input, instantiated twice per
      range), `FilterDayOfWeek` (single-value dropdown), `FilterIsSummary` (single-value dropdown),
      `FilterPlid` (consolidated player-picker multi-select, replacing `PlayerPageClient.tsx`'s
      `PartnerSelect` and `PartnersTable.tsx`'s `PlayerSelect`), `FilterRunId`/`FilterSeid`
      (business-key vs. internal-PK session filters — see below). Named per the DD-naming
      convention agreed mid-session (`Filter<Root>` prefix, matching `filter_<root>`/
      `WIDTH_<ROOT>`), not the originally-planned generic names above (`NameFilter`,
      `DateRangeFilter`, etc. — superseded)
- [x] Wired the new shared components into Home Players/Sessions, `PlayersAdmin.tsx`,
      `PlayerPageClient.tsx` History tab, and `PartnersTable.tsx`, replacing every raw filter
      identified in the audit above; all filter state variables across these files renamed to the
      `filter_<root>`/`setFilter_<root>` convention (full renames listed in Changes below)
- [x] New session-id filters: `FilterSeid` (internal `se_seid` PK) and `FilterRunId` (external
      `se_run_id`/`s1_run_id` business key) — recognized as two distinct DD items per explicit
      agreement, not one shared filter. Added to Home Sessions tab, `BuildDataViewer.tsx`'s tse tab
      (`se_seid`; `s1_run_id`/`re_seid` already existed on ts1/tre), `PlayerPageClient.tsx` History
      tab, and `PartnersTable.tsx` (both via `FilterRunId`, the business key each of those tables
      displays)
- [x] Every new component's width registered as a named constant in the consolidated Widths
      section in `ConstantsPage.tsx`

### /owner Constants tab was missing every constant added this session
`src/ui/owner/ConstantsPage.tsx` is manually maintained (explicit comment: "add an entry here
whenever a new constant is added to constants.ts") — none of the 9 constants added earlier in
this plan (`MIN_RANKING_SESSIONS_MP/VP/XIMP`, `MIN_RANKING_SESSIONS_PARTNER_MP/VP/XIMP`,
`WIDTH_NZB_RANKINGS`, `WIDTH_PAID_RANKINGS`, `WIDTH_TOURNAMENT_TYPE_RANKINGS`) had been added,
until asked directly.

- [x] `ConstantsPage.tsx` — added a new "Rankings" section with all 9 constants (name, value,
      description, consumers)

**Found, not fixed at the time — since resolved:** none of the pre-existing `WIDTH_*` constants
(`WIDTH_RANK`, `WIDTH_CLUB`, `WIDTH_SESSIONS_MIN`, `WIDTH_SCORING_RANKINGS`, etc.) were in the
Constants tab either. Resolved by the consolidated "Widths" section added later in this same plan
(see "App-wide filter componentization" above) — all 20 `WIDTH_*` constants now listed together.

### src/lib/constants.ts (app-wide filter componentization phase)
- Renamed `WIDTH_NZB_RANKINGS`→`WIDTH_NZB`, `WIDTH_PAID_RANKINGS`→`WIDTH_PAID`; consolidated
  `WIDTH_TOURNAMENT_TYPE_RANKINGS`/`WIDTH_SCORING_RANKINGS` into the existing shared
  `WIDTH_TOURNAMENT_TYPE`/`WIDTH_SCORING` (both set to `w-24`, confirmed via `AskUserQuestion` to
  apply everywhere, including Home).
- Added `WIDTH_RANK`, `WIDTH_GRADE`, `WIDTH_CLUB`, `WIDTH_DAY_OF_WEEK`, `WIDTH_SESSIONS_MIN`,
  `WIDTH_TOURNAMENT_NAME`, `WIDTH_NAME`, `WIDTH_TRACKED`, `WIDTH_RATING_MIN`,
  `WIDTH_A_POINTS_MIN`, `WIDTH_DATE`, `WIDTH_IS_SUMMARY`, `WIDTH_PLID`, `WIDTH_SEID`,
  `WIDTH_RUN_ID`, `WIDTH_EVENT_TYPE` — one named width constant per DD concept, shared by every
  call site for that concept rather than a per-page variant.
- Added `DAYS_OF_WEEK: string[]` (plain array, not `as const` — a `readonly` tuple broke
  `StringMultiSelect`'s `string[]` prop and `.includes()` calls) — single source of truth for
  `se_day_of_week` values, replacing hand-typed day lists at each call site.
- Added `SESSION_STORAGE_PREFIX = `${SessionStorageKeyPrefix}br_`` (imports
  `SessionStorageKeyPrefix` from `nextjs-shared/constants`) — this project's `rs7_br_` sub-prefix
  per `nextjs-shared/CONSUMING_PROJECTS.md`'s Session Storage tab convention, so `/owner`'s Session
  Storage tab picks up this project's keys and they can't collide with another project's or
  nextjs-shared's own `rs7_shr_` keys.

### New shared filter components (src/ui/shared/)
- `FilterName.tsx`, `FilterTracked.tsx`, `FilterDate.tsx`, `FilterDayOfWeek.tsx`,
  `FilterIsSummary.tsx`, `FilterPlid.tsx`, `FilterRunId.tsx`, `FilterSeid.tsx` — one component per
  DD concept, each defaulting to that concept's `WIDTH_*` constant, each named `Filter<Root>` to
  align with `filter_<root>`/`WIDTH_<ROOT>`. `FilterPlid` consolidates what were two
  near-identical local components (`PlayerPageClient.tsx`'s `PartnerSelect`,
  `PartnersTable.tsx`'s `PlayerSelect`) into one. `FilterRunId`/`FilterSeid` are deliberately
  separate — `run_id` (external, NZB business key) and `seid` (internal PK) are two distinct DD
  items, confirmed explicitly before building two filters instead of one.
- `LookupSelects.tsx` — `ClubSelect`/`GradeSelect`/`RankSelect`/`EventTypeSelect` switched to
  their new dedicated `WIDTH_*` defaults (previously `EventTypeSelect` had no named width).
- `SummaryTypeSelects.tsx` — `SummaryTypeMultiSelect`'s default width switched from the removed
  `WIDTH_SUMMARY` to `WIDTH_IS_SUMMARY` (same DD item as the new single-select `FilterIsSummary`).

### src/ui/rankings/RankingsPageClient.tsx (this phase)
- New local `TopNSelect` component shared by both tabs, replacing the duplicated inline `MySelect`
  for the session-min dropdown.
- Both tabs' tracked-only checkboxes now use the new `FilterTracked` component.
- `WIDTH_NZB`/`WIDTH_PAID`/`WIDTH_TOURNAMENT_TYPE`/`WIDTH_SCORING`/`WIDTH_TRACKED` applied
  throughout (superseding the earlier Rankings-suffixed constants).

### src/ui/home/HomePageClient.tsx (this phase)
- Full filter-state rename to the `filter_<root>`/`setFilter_<root>` convention: Players tab
  `fName`→`filter_pl_name`, `fNzb`→`filter_nzb`, `fRanks`→`filter_rank`, `fGrades`→`filter_grade`,
  `fClubs`→`filter_pl_club`, `fRatingMin`→`filter_rating_min`, `fAMin`→`filter_a_points_min`,
  `fSessMin`→`filter_sessions_min`, `fTracked`→`filter_tracked`,
  `fExcludeNzb0`→`filter_exclude_nzb0`; Sessions tab `dateFrom`→`filter_date_from`,
  `dateTo`→`filter_date_to`, `fDays`→`filter_day_of_week`, `scoringFilter`→`filter_scoring`,
  `sessNameFilter`→`filter_se_name`, `fSessClubs`→`filter_se_club`,
  `summaryFilter`→`filter_is_summary`.
- New `filter_run_id` state wired to the new `FilterRunId` component in the previously-empty ID
  filter cell above the Sessions tab's Run ID column.
- All raw `MyInput`/`MySelect` filters swapped for the new shared components
  (`FilterName`/`FilterTracked`/`NumberFilterInput`/`FilterDate`).
- `SESSION_KEY` now built from `SESSION_STORAGE_PREFIX`.
- Fixed a bug introduced by the bulk rename: the `SessionFilters` object literal passed to
  `getSessionsPaged` must keep the external type's literal keys (`dateFrom`/`dateTo`), so those
  two keys were reverted while their values still source from the renamed local variables.
- `admin/players` API call param names corrected to `rating_min`/`a_points_min`/`sessions_min` to
  match the route (see below).

### src/app/api/admin/players/route.ts
- Param names corrected: `ratingMin`→`rating_min`, `aMin`→`a_points_min`,
  `sessMin`→`sessions_min`.

### src/ui/admin/PlayersAdmin.tsx
- `nameFilter`→`filter_name` (now `FilterName` + `WIDTH_NAME`), `nzFilter`→`filter_nzb` (now
  `NumberFilterInput` + `WIDTH_NZB` — previously a raw hardcoded-width `MyInput`, not even using
  the shared component). Headers use `WIDTH_NZB`/`WIDTH_CLUB`/`WIDTH_RANK`.

### src/ui/admin/BuildDataViewer.tsx
- Added `filter_seid` state + `se_seid` filter cell to the Sessions tab (`tse`) — the one table
  among ts1/tse/tre missing a session-identifying filter (`s1_run_id` and `re_seid` already
  existed on the other two).

### src/ui/player/PlayerPageClient.tsx (this phase)
- Full History-tab filter-state rename to `filter_<root>`: `dateFrom`→`filter_date_from`,
  `dateTo`→`filter_date_to`, `dayFilter`→`filter_day_of_week`,
  `selectedPartnerIds`→`filter_plid`, `sessionNameFilter`→`filter_name`,
  `selectedClubs`→`filter_club`, `selectedTournaments`→`filter_tournament`,
  `selectedEventTypes`→`filter_event_type`, `summaryFilter`→`filter_is_summary`,
  `scoringFilter`→`filter_scoring` (`scoring`/`statsScoring` left as-is — different role, not a
  table-filter).
- Deleted the local `PartnerSelect` component; replaced with the shared `FilterPlid`.
  `uniquePartners`'s `id` field renamed to `plid`.
- New `filter_run_id` state wired to the new `FilterRunId` component in the previously-empty
  filter cell above the "Run ID" column.
- Wired `FilterDate`×2/`FilterDayOfWeek`/`FilterPlid`/`FilterName`/`FilterIsSummary`; all header
  widths converted to the shared `WIDTH_*` constants; `playerStorageKey` now uses
  `SESSION_STORAGE_PREFIX`.

### src/ui/player/PartnersTable.tsx (this phase)
- Same treatment as `PlayerPageClient.tsx`'s History tab (structurally near-identical table):
  filter-state renamed to `filter_<root>` (`dateFrom`/`dateTo`/`dayFilter`/`scoringFilter`/
  `summaryFilter`/`selectedPlayerIds`/`sessionNameFilter`/`selectedClubs`/`selectedTournaments`/
  `selectedEventTypes` → `filter_date_from`/`filter_date_to`/`filter_day_of_week`/
  `filter_scoring`/`filter_is_summary`/`filter_plid`/`filter_name`/`filter_club`/
  `filter_tournament`/`filter_event_type`).
- `PartnerEntry.id: number` renamed to `.plid: number`; every `.id` usage in the fetch/aggregation
  logic updated to `.plid` to match.
- Deleted the local `PlayerSelect` component (near-duplicate of `PlayerPageClient.tsx`'s
  now-also-deleted `PartnerSelect`); replaced with the shared `FilterPlid`.
- New `filter_run_id` state wired to the new `FilterRunId` component in the previously-empty
  filter cell above the "Run ID" column.
- Wired `FilterDate`×2/`FilterDayOfWeek`/`FilterName`/`FilterIsSummary`; all header widths
  converted to the shared `WIDTH_*` constants (`WIDTH_PLID`/`WIDTH_RUN_ID`/`WIDTH_DATE`/
  `WIDTH_DAY_OF_WEEK`/`WIDTH_NAME`/`WIDTH_CLUB`/`WIDTH_TOURNAMENT_TYPE`/`WIDTH_EVENT_TYPE`/
  `WIDTH_SCORING`/`WIDTH_IS_SUMMARY`); removed the now-unused `MyInput`/`MySelect`/
  `EARLIEST_DATA_DATE`/`useRef` imports.

### src/ui/owner/ConstantsPage.tsx (this phase)
- New consolidated "Widths" section listing all 20 `WIDTH_*` constants (name, value, description,
  consumers) in one place, replacing the previous state where 2 were imported-but-unused and the
  rest weren't documented at all. The "Rankings" section now holds only the 6
  `MIN_RANKING_SESSIONS_*` constants.
- `FUNCTION_DESCRIPTIONS` extended with entries for every new shared filter/lookup component
  (`FilterName`, `FilterDate`, `FilterDayOfWeek`, `FilterIsSummary`, `FilterPlid`, `FilterSeid`,
  `FilterRunId`, `RankSelect`, `GradeSelect`, `ClubSelect`, `EventTypeSelect`,
  `ScoringTypeSelect`, `SummaryTypeMultiSelect`).

### ~/.claude/CLAUDE.md (global, cross-project)
- Added a "Real incident, 2026-08-06 (next-bridge)" paragraph under "Everything tied to a DD item
  is named after that item," documenting the repeated DD-naming corrections from this session
  (`nzFilter`, `paidFilter`, `p1NameFilter`/etc., `NameFilter` suffix-vs-prefix), and a
  supplementary paragraph under the "Filter state" bullet explaining the `filter_<root>`/
  `WIDTH_<ROOT>` prefix-alignment rationale the user gave.

### nextjs-shared (applied by the user in a separate nextjs-shared session, not this one)
- `src/components/isSelectionFiltering.ts` — added `SELECTION_ALL = 'all'` and
  `serializeSelection(selected, totalOptions)` alongside the existing `isSelectionFiltering`,
  exactly per the spec worked out in this plan. Documented in `CONSUMING_PROJECTS.md`. Bumped to
  `2.1.63` and pushed.

### src/ui/home/HomePageClient.tsx (sessionStorage "all" sentinel fix)
- Every persisted multi-select filter (`filter_rank`, `filter_grade`, `filter_pl_club`,
  `filter_se_club`, `filter_day_of_week`, `filter_scoring`, `filter_is_summary`) now serialized via
  `serializeSelection` instead of a raw `[...set]` spread — "everything selected" is now stored as
  the `SELECTION_ALL` sentinel, not a frozen snapshot of every option, so it can't go stale when
  the DB-backed option list (clubs/grades/ranks) grows.
- `filter_se_club` is now actually persisted and restored at all — previously its `onOptionsLoaded`
  unconditionally reset to "all" on every load with no reconciliation against a saved value, unlike
  its three siblings (`filter_rank`/`filter_grade`/`filter_pl_club`), which already had
  saved-array reconciliation. Brought in line with the same pattern while fixing the sentinel bug.
- Restore-side reconciliation (the 4 DB-driven `onOptionsLoaded` callbacks, plus the 3 fixed-list
  filters in the main restore effect) now guards with `Array.isArray(saved)` before treating it as
  a real selection array — needed because `saved` can now legitimately be the string `'all'`.

### src/ui/player/PlayerPageClient.tsx (sessionStorage "all" sentinel fix)
- Same treatment for `filter_club`, `filter_event_type`, `filter_tournament`, and `filter_plid`.
  `filter_plid` is numeric (`Set<number>`) — since `serializeSelection` is `string[]`-only (a
  deliberate nextjs-shared decision, kept minimal rather than adding a second overload), it's
  serialized as `[...filter_plid].map(String)` against a partner-count total computed directly
  from `results` (`new Set(results.map(r => r.partner_id)).size` — the save effect runs before
  `uniquePartners` is declared later in the file, so it can't reference that memo directly) and
  parsed back with `.map(Number)` on restore.

## Testing
- [ ] User runs "Update Stats" on `/owner/pipeline` (local) first — the new nulled-out ranks (both
  player and partnership) only appear after a recompute.
- [ ] On `/rankings`, Players tab, scoring = MP: session-min dropdown shows `≥ 30/50/100/200`,
  defaulting to `≥ 30`. Switch to XIMP: dropdown swaps to `≥ 1/3/5` and resets to `≥ 1`.
- [ ] On `/rankings`, Partnerships tab, scoring = MP: session-min dropdown shows
  `≥ 5/10/20/50`, defaulting to `≥ 5` — independent of whatever the Players tab's dropdown is set
  to. Switch to XIMP: dropdown swaps to `≥ 1/3/5`.
- [ ] With Players/MP/`≥ 30` selected, confirm the `#` column looks sane relative to row order
  (top row's `#` should be a low number, not something like 47 or 88) — the original bug.
- [ ] Group = "All", scoring = MP (the exact combination that showed the stale "88"): confirm it
  now shows the correct rank on first load, with no server restart needed.
- [ ] Type a few digits into the new "NZ#" filter box on the Players tab and confirm the list
  narrows to matching `pl_nzb` values (partial match).
- [ ] Switch to the Partnerships tab, confirm a new "ID" column appears showing `pa_paid`, and
  type a value into its filter box to confirm it narrows the list.
- [ ] On the Partnerships tab, confirm "Player 1" and "Player 2" now show as two separate columns
  with their own "NZ#" column before each (9 columns total: #, ID, NZ#, Player 1, NZ#, Player 2,
  Avg, Sessions, Tracked), each name independently clickable through to that player's page.
- [ ] Find a partnership where the two names are out of alphabetical order in the old combined
  view (e.g. search "Anne Gordon" or "Jack James") and confirm Player 1 is now always the
  alphabetically-first name, regardless of which one is `pa_plid1` in the database.
- [ ] On the Partnerships tab, confirm all 4 new filters work independently: typing in "P1 Name"
  only narrows by the Player 1 column, "P2 Name" only by Player 2, and likewise for the two NZ#
  filters — narrowing one should not affect what the others show as available.
- [ ] Confirm the NZ# column on the Players tab (and the two on the Partnerships tab) render at
  the narrower `w-32` width.
- [ ] Open Home page's Players tab and confirm the NZ# filter box still works exactly as before
  (visual/behavioral no-op — it's now `NumberFilterInput` under the hood).
- [ ] Open a player's page (`/player/[id]`) for someone with fewer than 30 MP sessions: Rank
  column shows "Not enough sessions". For someone with 30+: shows "`X of Y`".
- [ ] Spot-check an XIMP player with 1+ sessions and a partnership with 5+ MP/VP sessions (or 1+
  XIMP sessions): confirm both now get a real rank.
- [ ] Confirm the "(N total)" figure next to the Tournament Type toggle still shows a real number
  (not "—") on both tabs.
- [ ] User runs the pending index-rename SQL (see above) in pgAdmin4 before testing anything that
  touches `pl_nzb` uniqueness (e.g. Correct NZ Numbers / player merge on `/owner/players`).
- [ ] Open a player's own page and confirm their "NZ Bridge #" still displays correctly.
- [ ] Open a session's results page and confirm the NZ# column for both players in each pair still
  displays correctly (this reads through the renamed `pl_nzb1`/`pl_nzb2`/`partner_nzb` columns).
- [ ] Open `/owner/builddata`'s Players tab and confirm the NZ# filter still works (renamed
  `filter_nzb`/`pl_nzb` internally).
- [ ] Open `/owner/players` (admin) and confirm the player list, its NZ# filter, and the
  Correct/Merge flows still work end-to-end.
- [ ] Confirm the ID column on the Partnerships tab and the Tournament Type toggle both render
  narrower now (`w-32` and `w-24` respectively), and the scoring column is narrower too (`w-24`).
- [ ] Open `/owner` → Constants tab → "Rankings" section and confirm all 9 new constants appear
  with correct values.
- [ ] Open `/owner` → Constants tab → new "Widths" section and confirm all 20 `WIDTH_*` constants
  are listed with correct values.
- [ ] Open Home page: Players tab filters (Name, NZ#, Rank, Grade, Club, Rating min, A-points min,
  Sessions min, Tracked) all still work exactly as before; Sessions tab filters (Date from/to,
  Day, Tournament, Scoring, Summary, Club, Session name, and the new Run ID filter above the Run
  ID column) all work, including the new Run ID partial-match filter.
- [ ] Open `/owner/players` (admin): Name and NZ# filters both work (NZ# is now the shared
  `NumberFilterInput` component, same behavior as before).
- [ ] Open `/owner/builddata`, Sessions tab (tse): confirm the new `se_seid` filter above the
  session-id column narrows the list correctly.
- [ ] Open a player's page (`/player/[id]`), History tab: Run ID filter (new, above the Run ID
  column), Date from/to, Day, Partner multi-select, Session name, Club, Tournament, Event Type,
  Scoring, Summary filters all work; switching partners via the multi-select still updates the
  filtered rows correctly (this replaced the deleted local `PartnerSelect` component).
- [ ] On the same player's page, Partners tab (`PartnersTable`): Player multi-select, new Run ID
  filter, Date from/to, Day, Session name, Club, Tournament, Event Type, Scoring, Summary filters
  all work (this replaced the deleted local `PlayerSelect` component); exporting CSV still
  includes the correct rows.
- [ ] Confirm sessionStorage keys written directly by this project (Home page state, player page
  state) now start with `rs7_br_` — check via `/owner`'s Session Storage tab.
- [ ] Full click-through smoke test: Home → click a session → click a result row → click a
  player → History tab → Partners tab → back to Home, confirming no console errors and every
  filter row renders at its expected (narrower, consistent) width.
- [ ] On Home page, leave every multi-select filter at its default ("all") and reload the page —
  inspect `rs7_br_home_state` via `/owner`'s Session Storage tab and confirm `filter_pl_club`,
  `filter_rank`, `filter_grade`, `filter_se_club`, `filter_day_of_week`, `filter_scoring`, and
  `filter_is_summary` all show the literal string `"all"`, not an enumerated array.
- [ ] On Home page, narrow the Club filter to 2-3 specific clubs, reload the page, and confirm
  those exact clubs are still selected (the genuine-subset restore path still works — this is the
  regression check for the sentinel change).
- [ ] Open a player's page, leave Club/Event Type/Tournament/Partner filters at "all", reload, and
  confirm `rs7_br_player_state_<id>` in Session Storage shows `"all"` for `filter_club`,
  `filter_event_type`, `filter_tournament`, and `filter_plid` — then narrow the partner picker to
  one partner, reload, and confirm that specific partner is still selected.
- [ ] On Home page, confirm the Sessions tab's Club filter (`filter_se_club`) now actually persists
  across a reload at all (previously it silently reset to "all" every time, regardless of what was
  selected).
