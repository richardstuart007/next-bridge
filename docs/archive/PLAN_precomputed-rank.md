# PLAN_precomputed-rank — next-bridge

## Title
Precompute player/partnership rank into the stats tables instead of computing at query time

## Plan
- [x] Background: Rankings page's "#" column was a client-computed row position
      (`(page-1)*itemsPerPage+i+1`), which doesn't handle ties and changes meaning depending on
      which filters are active (Grade/Club/Tracked/Min-Sessions/search). User confirmed: filters
      must be irrelevant to the rank value — it should always reflect standing across the whole
      (unfiltered-by-those-controls) data pool for that Tournament Type + Scoring combination.
      Separately, `getPlayerAllGroupStats` (feeds the Player Stats page) already computes a real
      `avg_rank`/`group_total`/`pct_rank` via `RANK()`/`PERCENT_RANK()`/`COUNT()` window functions
      — but at query time, on every single page view, even though `ta1_player_stats` only changes
      when the "Update Stats" pipeline step runs. Agreed: precompute all of these once, during that
      pipeline step, and store them — both Rankings and Player Stats then read the same stored
      values instead of two independently-computed numbers.
- [x] Explicitly out of scope (discussed and dropped): a rank based on `pl_a_points`/
      `pl_b_points`/`pl_c_points` (NZ Bridge's own scraped master-points totals, which genuinely
      do correspond to Tournament Group A/B/C — confirmed not a coincidental naming overlap, but
      splitting a rank by those points was judged too complicated for this task) — left alone
      entirely. Also out of scope: an activity/session-count rank (already rejected in an earlier
      session) and a partnership consistency rank (nothing currently displays it).
- [x] Schema: add `a1_avg_rank integer`, `a1_group_total integer`, `a1_pct_rank numeric(5,4)` to
      `ta1_player_stats`; add `a2_avg_rank integer`, `a2_group_total integer` to
      `ta2_partner_stats`. Plain `ADD COLUMN` (appended at the end) — no mid-table insertion, so no
      backup/drop/recreate needed. SQL given to the user to run manually (never executed by
      Claude); update `scripts/schema.sql` to match.
- [x] `src/lib/actions/statsCompute.ts`: after each group's upsert in `computePlayerGroupStats`/
      `computePartnerGroupStats`, add a follow-up `UPDATE ... FROM (SELECT ... RANK() OVER
      (PARTITION BY a1_scoring ORDER BY a1_avg DESC), COUNT(*) OVER (PARTITION BY a1_scoring),
      PERCENT_RANK() OVER (PARTITION BY a1_scoring ORDER BY a1_stddev NULLS LAST) FROM
      ta1_player_stats WHERE a1_group = $1) sub` scoped to the same group just upserted — keeps the
      rank fresh immediately after that group's averages are updated, no new pipeline step needed.
      Partner version omits `pct_rank` (not currently used for partnerships).
- [x] `src/lib/actions/players.ts`: simplify `getPlayerAllGroupStats` to a plain `SELECT` of the
      now-stored `a1_avg_rank`/`a1_group_total`/`a1_pct_rank` columns — removes the CTE and all
      three window functions that previously ran on every page view.
- [x] `src/app/api/rankings/route.ts`: add `a1_avg_rank`/`a1_group_total` (players) and
      `a2_avg_rank`/`a2_group_total` (partnerships) to the existing `SELECT` lists — no change to
      the existing `group`/`scoring` JOIN conditions, since those already correctly scope which
      group+scoring's precomputed rank gets returned. The Min-Sessions/Grade/Club/Tracked/search
      filters still narrow which *rows* are returned, but each returned row's rank value reflects
      its true standing in the full group+scoring pool, per the agreed design.
- [x] `src/ui/rankings/RankingsPageClient.tsx`: replace the client-computed `rank`/positional index
      in both the Players and Partnerships tables with the API-provided rank value; add the new
      fields to `PlayerRow`/`PartnershipRow`.
- [x] Run:
      npx tsc --noEmit
- [x] Run:
      npm run build

## Changes

### scripts/schema.sql
- Added `a1_avg_rank integer`, `a1_group_total integer`, `a1_pct_rank numeric(5,4)` to
  `ta1_player_stats`; added `a2_avg_rank integer`, `a2_group_total integer` to
  `ta2_partner_stats`. Appended at the end — plain `ADD COLUMN`, no mid-table insertion.

### src/lib/actions/statsCompute.ts
- `computePlayerGroupStats`/`computePartnerGroupStats` each now run a follow-up `UPDATE` after
  their main upsert, computing `RANK()`/`COUNT()`/(`PERCENT_RANK()` for players only) over the
  just-updated group's rows and writing the result into the new columns. Runs once per group per
  "Update Stats" pipeline run, not on every page view.

### src/lib/actions/players.ts
- `getPlayerAllGroupStats` simplified to a plain `SELECT` of the now-precomputed
  `a1_avg_rank`/`a1_group_total`/`a1_pct_rank` columns — removed the CTE and the three window
  functions that previously recomputed this on every call.

### src/app/api/rankings/route.ts
- Added `a1_avg_rank` (players) and `a2_avg_rank` (partnerships) to the `SELECT` lists, **as raw
  column names, no alias** — see the naming correction below. Added two small dedicated lookups
  (`SELECT a1_group_total FROM ta1_player_stats WHERE a1_group = $1 AND a1_scoring = $2 LIMIT 1`,
  and the `a2_` equivalent) returned as top-level `playersGroupTotal`/`partnersGroupTotal` response
  fields, independent of the row list — avoids the total going blank when the current Grade/Club/
  Tracked/Min-Sessions/search filters happen to match zero rows.
- **Naming correction (see the global `CLAUDE.md` incident this triggered):** the players/
  partnerships `SELECT` lists were originally written with aliases throughout (`pl_plid AS id`,
  `a1_avg AS avg_pct`, `a1_sessions AS sessions`, `pl_all_results AS tracked`, `a1_avg_rank AS
  rank_num`, and for partnerships `p1.pl_plid AS player1_id` etc.) — all invented names for
  already-uniquely-named columns. Removed every alias; columns now surface under their exact
  database names (`pl_plid`, `pl_name`, `a1_avg`, `a1_sessions`, `a1_avg_rank`, `pl_grade`,
  `pl_club`, `pl_all_results` for players; `pa_paid`, `a2_sessions`, `a2_avg`, `a2_avg_rank` for
  partnerships). The partnership query still needs *some* disambiguation since it joins
  `tpl_players` twice (`p1`/`p2`) — `pl_plid`/`pl_name`/`pl_all_results` each appear twice in one
  row — so those six use a numbered suffix on the unmodified root: `AS plid1`/`AS plid2`,
  `AS name1`/`AS name2`, `AS tracked1`/`AS tracked2`, matching the DB's own `pa_plid1`/`pa_plid2`
  convention rather than inventing new words.

### src/ui/rankings/RankingsPageClient.tsx
- `PlayerRow`/`PartnershipRow` renamed field-for-field to match the route's now-alias-free output:
  `pl_plid`, `pl_name`, `a1_avg`, `a1_sessions`, `a1_avg_rank`, `pl_grade`, `pl_club`,
  `pl_all_results` (players); `pa_paid`, `a2_sessions`, `a2_avg`, `a2_avg_rank`, `plid1`/`name1`/
  `tracked1`, `plid2`/`name2`/`tracked2` (partnerships). Every JSX reference (`key`, `Link href`,
  `formatScoringValue`, `isTracked`, etc.) updated to match.
- Both tables' "#" column now shows just `{a1_avg_rank}`/`{a2_avg_rank}` (a real, tie-aware,
  filter-independent rank) instead of the old client-computed `(page-1)*itemsPerPage+i+1` position
  — removed the now-unused `i` map-index parameter and inline `rank` calculation in both loops.
- The group/scoring pool total moved out of the row entirely and into the header, next to the
  Tournament Type toggle, reading from the new `playersGroupTotal`/`partnersGroupTotal` state
  (whichever matches the active tab) — fixes the earlier "empty for All" report, since the total is
  no longer tied to whether any filtered rows happen to be visible.

## Manual SQL to run (pgAdmin4)
```sql
ALTER TABLE ta1_player_stats
  ADD COLUMN a1_avg_rank integer,
  ADD COLUMN a1_group_total integer,
  ADD COLUMN a1_pct_rank numeric(5,4);

ALTER TABLE ta2_partner_stats
  ADD COLUMN a2_avg_rank integer,
  ADD COLUMN a2_group_total integer;
```
After running this, the new columns will be `NULL` for every existing row until the next "Update
Stats" pipeline run backfills them (via the new UPDATE step in `statsCompute.ts`) — run "Update
Stats" on `/owner/pipeline` right after applying this SQL.

## Testing
- [ ] Confirmed the manual SQL above has been run (both `ALTER TABLE` statements)
- [ ] Run "Update Stats" on `/owner/pipeline` and confirm it completes without error
- [ ] `/owner/rankings` (or wherever Rankings is embedded) → Players tab: confirm the "#" column
      now shows "N / total" and that switching Tournament Type (All/A/B/C) changes both numbers
      (different pool per group)
- [ ] Rankings → Players tab: apply a Grade/Club/Tracked/Min-Sessions/search filter and confirm the
      rank numbers shown for the still-visible rows do **not** change (they reflect standing in the
      full pool, not the filtered list) — this was the point of the whole change
- [ ] Rankings → Partnerships tab: same two checks (group switch changes numbers; row filters don't)
- [ ] `/player/[id]` → Player Stats tab: confirm the Rank column and Consistency labels still show
      correct, sensible values after switching `getPlayerAllGroupStats` to read precomputed columns
      instead of computing them live
- [ ] Confirmed via `npx tsc --noEmit` and `npm run build` — both pass cleanly

