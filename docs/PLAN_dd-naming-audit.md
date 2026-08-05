# PLAN_dd-naming-audit — next-bridge

## Title
Audit and fix every SQL column alias / DD-backed field name across the project

## Plan
- [x] Background: while adding precomputed rank columns to `/api/rankings`, multiple invented
      names were used instead of the Data Dictionary root (`AS rank_num` instead of `AS avg_rank`,
      then even `AS avg_rank` was still wrong since no rename was needed at all, then `AS tracked1`
      instead of `AS all_results1`). User confirmed the standing rule: **default to no alias at
      all** — a column surfaces under its exact database name, full prefix included. The only two
      legitimate exceptions: the user explicitly asks for a specific name, or a genuine same-row
      collision requires disambiguation — and even then, append a numeral directly to the
      *unmodified* full column name (`pl_name AS pl_name1`/`AS pl_name2`), never strip the prefix
      first and never invent an unrelated word. Global `CLAUDE.md`'s "Variable naming — match the
      Data Dictionary value" section was rewritten to make this a hard stop, with this incident
      logged there. `src/app/api/rankings/route.ts` and `src/ui/rankings/RankingsPageClient.tsx`
      are already fixed to this standard (done in the same session, immediately before this audit).
- [x] User asked to audit every other file for the same pattern rather than presume it's isolated.
      Found real, confirmed violations in existing code (e.g. `se_seid AS session_id`, `se_name AS
      session_name`, `pl_name AS player` — none of these are the DD root, none are genuine
      collisions) via a grep across every file with a raw SQL query. Agreed: audit and fix
      everything now, not just as future code is touched.
- [x] Audited all 26 files in the project containing a raw SQL query string (every file under
      `src/lib/actions/*.ts` and `src/app/api/**/route.ts`), one by one: identified every `AS
      alias`, decided whether it's (a) already correct (matches DD root, a legitimate role-prefixed
      disambiguation like `partner_name`, or a genuinely-computed/aggregate value like `COUNT(*) AS
      n`), or (b) a violation to fix. Fixed every violation found, plus every downstream consumer
      (other actions, API routes, UI components) that destructured/read the renamed field.
- [x] Separate, related finding during the audit: `isTracked`/`tracked` (function/variable/prop
      name) was itself an invented name for `pl_all_results`, used across 5 UI files. User's
      resolution: rather than rename all the code to match the database (`pl_all_results` →
      `all_results` everywhere), rename the **database column** to `pl_tracked` instead, since
      "tracked" was already the established, correct, user-facing concept everywhere except the
      column name itself, and internal/external names should never diverge. Ran
      `ALTER TABLE tpl_players RENAME COLUMN pl_all_results TO pl_tracked;` (user confirmed done),
      updated `scripts/schema.sql`, and did a literal find-and-replace of `pl_all_results` →
      `pl_tracked` across all 14 referencing files — most of those files already said "tracked"
      everywhere in their own code (matching the new column name automatically), so this was a much
      smaller change than renaming the code side would have been.
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build

## Manual SQL (confirmed run by the user)
```sql
ALTER TABLE tpl_players RENAME COLUMN pl_all_results TO pl_tracked;
```

## Changes

### scripts/schema.sql
- `tpl_players.pl_all_results` renamed to `pl_tracked` (matching the manual SQL above).

### pl_all_results → pl_tracked (bulk rename, 14 files)
- `src/app/api/admin/players/route.ts`, `src/app/api/admin/players/[id]/all-results/route.ts`,
  `src/app/api/players/[id]/results/route.ts`, `src/app/api/rankings/route.ts`,
  `src/app/api/scrape/discover/nzb-by-flagged/route.ts`,
  `src/app/api/scrape/raw/nzb-by-flagged/route.ts`, `src/lib/actions/pipelineScrape.ts`,
  `src/ui/admin/BuildDataViewer.tsx`, `src/ui/admin/PipelineTable.tsx`,
  `src/ui/admin/PlayersAdmin.tsx`, `src/ui/admin/TrackedPlayers.tsx`,
  `src/ui/home/HomePageClient.tsx`, `src/ui/player/PlayerPageClient.tsx`,
  `src/ui/rankings/RankingsPageClient.tsx` — every literal occurrence of `pl_all_results` replaced
  with `pl_tracked`. No other logic changes; most call sites already used "tracked" naming in their
  own local variables/functions, which now correctly matches the renamed column.

### src/app/api/rankings/route.ts, src/ui/rankings/RankingsPageClient.tsx
- (Already fixed immediately before this audit started, included here for completeness.) Every
  `SELECT` alias removed except where a genuine same-row collision exists (the partnership query
  joins `tpl_players` twice) — those keep the full, unmodified column name plus a numeral suffix:
  `pl_plid1`/`pl_plid2`, `pl_name1`/`pl_name2`, `pl_tracked1`/`pl_tracked2`. `PlayerRow`/
  `PartnershipRow` and every JSX reference updated to match.

### src/app/api/sessions/[id]/results/route.ts, src/ui/session/SessionPageClient.tsx
- Removed `AS score` (no collision, `re_score` returned bare). Renamed the CTE's disambiguated
  self-join columns from stripped/invented forms to full-name-plus-number
  (`plid1`/`plid2` → `pa_plid1`/`pa_plid2`, bare, no collision in the CTE itself;
  `name1`/`name2` → `pl_name1`/`pl_name2`; `nz1`/`nz2` → `pl_nz_bridge_number1`/
  `pl_nz_bridge_number2`). In the outer `SELECT`, the "primary side" computed columns (chosen by
  sort order, not a straight copy) now use the bare DD root instead of an invented name:
  `pl_id` → `plid`, `player_name` → `pl_name`, `player_nz_number` → `pl_nz_bridge_number`. The
  "other side" columns keep their existing `partner_` role-prefix (already correct) but with the
  same DD-root correction: `partner_pl_id` → `partner_plid`, `partner_nz_number` →
  `partner_nz_bridge_number` (`partner_name` was already correct, unchanged). `ResultRow` in
  `SessionPageClient.tsx` and every reference updated to match.

### src/app/api/scrape/ts2/route.ts, src/ui/admin/Ts2Table.tsx
- `p1.pl_name AS player1` / `p2.pl_name AS player2` → `pl_name1`/`pl_name2` (genuine collision,
  full name + number). Updated `Ts2Table.tsx`'s filter state, column-filter map keys, and row
  destructuring to match — this also fixes the raw-data-viewer's displayed column headers to show
  the real column name instead of an invented one, matching `/owner/builddata`'s own stated design
  principle of showing "one table's raw, unmodified columns."

### src/lib/actions/build-viewer.ts, src/ui/admin/BuildDataViewer.tsx
- `getResultsBySeid`: `AS player`/`AS partner`/`AS score` → `pl_name` (bare, primary side) /
  `partner_pl_name` (role-prefixed, matching the established `partner_` convention) / `re_score`
  (bare, no collision). No consumer changes needed (this data renders through the generic
  `DataTable` with no custom filter map).
- `getAllResults`: `AS player1`/`AS player2` → `pl_name1`/`pl_name2`. Updated `ResultsTab`'s filter
  state and column-filter map.
- `getAllPartners`: `AS player1`/`AS player2` → `pl_name1`/`pl_name2`; `pa_plid1 AS plid1`/
  `pa_plid2 AS plid2` → bare `pa_plid1`/`pa_plid2` (no collision, no alias needed at all). Updated
  `PartnersTab`'s filter state, column-filter map, and the `onKeyClick` shared-filter payload's
  source-row references (the shared-filter *keys* `plid1`/`plid2` are an intentional, pre-existing
  cross-tab convention — see `SharedKey` — and were left as-is; only the row fields they read
  *from* were corrected).
- `getAllPlayerStats`: `pl_name AS player` → bare `pl_name` (no collision). Updated
  `PlayerStatsTab`'s filter state, column-filter map, and `onKeyClick` payload.
- `getAllPartnerStats`: `AS player1`/`AS player2` → `pl_name1`/`pl_name2` (no consumer changes
  needed — `PartnerStatsTab` doesn't currently filter on these fields).

### src/lib/actions/players.ts, src/ui/player/PlayerPageClient.tsx
- `getPlayerAllGroupStats`: removed the last remaining renamed aliases from this session's earlier
  rank-precompute work (`a1_pct_rank AS pct_rank`, `a1_avg_rank AS avg_rank`, `a1_group_total AS
  group_total` — no collision exists in this single-player query, so no alias was ever needed).
  Return type and `PlayerPageClient.tsx`'s `playerStats` state/JSX updated to read
  `a1_pct_rank`/`a1_avg_rank`/`a1_group_total` directly.

### Confirmed already correct, no changes needed
- `src/app/api/admin/players/route.ts`, `.../[id]/all-results/route.ts`,
  `src/app/api/admin/backfill-finals/route.ts` (+ `test/route.ts`),
  `src/app/api/build/cleanup/route.ts` (see separate bug note below),
  `src/app/api/players/merge/route.ts`, all 9 `src/app/api/scrape/**` routes except `ts2`,
  `src/lib/actions/buildSteps.ts`, `src/lib/actions/lookup.ts`, `src/lib/actions/pipelineLog.ts`,
  `src/lib/actions/pipelineScrape.ts`, `src/lib/actions/pipelineStatus.ts`,
  `src/lib/actions/sessions.ts`, `src/lib/actions/statsCompute.ts` — every alias in these files is
  either a bare column name already, a legitimate role-prefixed disambiguation, or a genuinely
  computed/aggregate value (`COUNT(*) AS n`, `RANK() OVER (...) AS avg_rank` inside an `UPDATE ...
  FROM`, a `UNION` of two differently-prefixed columns needing one shared name, etc.).

## Separate finding (not a naming issue — flagged, not fixed here)
`src/app/api/build/cleanup/route.ts` queries `re_percentage`, a column that no longer exists —
`tre_results` was consolidated onto a single `re_score` column for all scoring types in an earlier
piece of work (see this project's `.claude/CLAUDE.md` "Outstanding items"). This route would throw
a SQL error if ever invoked. Not fixed as part of this audit since the correct replacement logic
(is "negative score" still the right check for every scoring type, including VP which can
legitimately be negative?) is a judgment call, not a mechanical rename — flagging for a separate,
explicit decision.

## Testing
- [ ] Confirmed the manual `ALTER TABLE ... RENAME COLUMN` SQL has been run — **done**
- [ ] `/owner/players` (Tracked Players page): confirm the "Track" checkbox column still works
      (toggling still calls the same PATCH endpoint, now writing `pl_tracked`)
- [ ] Home page → Players tab: confirm the green "tracked" dot still shows for the right players
- [ ] Rankings page → both tabs: confirm the "Tracked only" checkbox filter still works, and the
      green tracked dot still shows correctly on both Players and Partnerships rows
- [ ] `/player/[id]`: confirm the tracked badge next to the player's name still shows correctly
- [ ] `/session/[id]`: confirm the results table still shows the right player/partner names, NZ
      numbers, and links to `/player/[id]` for both columns (this table's underlying query changed
      significantly — the "primary/partner" column assignment logic is unchanged, only field names)
- [ ] `/owner/builddata`: check every tab (`ts2`, `tre` results, `tpa` partners, `ta1` player stats,
      `ta2` partner stats) — confirm each tab's columns still display and filter correctly; column
      headers for player-name fields will now show the real column name (e.g. `pl_name1`/`pl_name2`
      instead of the old `player1`/`player2`) rather than an invented label — this is intentional
- [ ] `/owner/builddata` → click through a partnership row → confirm the cross-tab shared filter
      (clicking a row to filter another tab by plid/paid) still works correctly
- [ ] `/player/[id]` → Player Stats tab: confirm the Rank column and Consistency labels still show
      correct values (should be unchanged — this was a pure alias removal, no logic change)
- [x] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass cleanly

