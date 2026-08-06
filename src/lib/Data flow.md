# Next-Bridge — Data Flow Reference

> **Last updated:** 2026-04-20  
> Describes every admin button, the API route it calls, the tables it reads/writes, and SQL to verify each step.  
> **Admin pages:** `/admin` → Session Import (top) · Player Refresh (bottom)

---

## Contents

1. [Database Tables](#database-tables)
2. [Session Import Section](#session-import-section)
3. [Player Refresh Section](#player-refresh-section)
4. [Stage 6 — Recalculate](#stage-6--recalculate)
5. [Typical Full Workflow](#typical-full-workflow)

---

## Database Tables

### `trw_results_raw` — Raw scraped staging data

| Column          | Type    | Description                               |
|-----------------|---------|-------------------------------------------|
| `rw_rwid`       | PK      | Primary key                               |
| `rw_source_id`  | integer | AKBC page ID (e.g. 660711)                |
| `rw_name1`      | varchar | Player 1 name as scraped                  |
| `rw_name2`      | varchar | Player 2 name as scraped                  |
| `rw_percentage` | decimal | Pair % score as scraped                   |
| `rw_imp_score`  | numeric | Pair IMP score (NULL for MP sessions)     |

---

### `tse_sessions` — One row per bridge session

| Column             | Type    | Description                                     |
|--------------------|---------|-------------------------------------------------|
| `se_seid`          | PK      | Primary key                                     |
| `se_date`          | date    | YYYY-MM-DD                                      |
| `se_day_of_week`   | varchar | Monday … Saturday                               |
| `se_session_type`  | varchar | `club` / `congress` / …                         |
| `se_scoring`       | varchar | `MP` or `IMP`                                   |
| `se_source_id`     | integer | AKBC page ID                                    |
| `se_date_seq`      | integer | Sequence within the same date (1, 2, …)         |

---

### `tpl_players` — One row per unique player

| Column                  | Type    | Description                                      |
|-------------------------|---------|--------------------------------------------------|
| `pl_plid`               | PK      | Primary key                                      |
| `pl_name`               | varchar | Canonical name (title-cased, handles Mc/Mac/O')  |
| `pl_nzb`   | integer | NZ Bridge national number (0 until filled)       |
| `pl_session_count`      | integer | Total sessions (all scoring types)               |
| `pl_avg_percentage`     | numeric | Overall average %                                |
| `pl_mp_session_count`   | integer | MP-only session count                            |
| `pl_mp_avg_percentage`  | numeric | MP-only average %                                |
| `pl_imp_session_count`  | integer | IMP-only session count                           |
| `pl_imp_avg_percentage` | numeric | IMP-only average %                               |

---

### `tre_results` — One row per **player** per session (two rows per pair)

| Column           | Type    | Description                                                |
|------------------|---------|------------------------------------------------------------|
| `re_reid`        | PK      | Primary key                                                |
| `re_seid`        | FK      | → `tse_sessions.se_seid`                                   |
| `re_plid`        | FK      | → `tpl_players.pl_plid` (this player)                      |
| `re_partner_plid`| FK      | → `tpl_players.pl_plid` (their partner)                    |
| `re_pairid`      | FK      | → `tpa_partners.pa_paid` (set on import or recalc)         |
| `re_percentage`  | decimal | Final % score (MP: as scraped; IMP: set by Apply Clamp)    |
| `re_imp_score`   | numeric | Raw IMP score (NULL for MP sessions)                       |
| `re_imp_pct_raw` | numeric | Unclamped z-score % (NULL for MP; set by Calculate Raw %)  |

---

### `tpa_partners` — One row per unique player pair

| Column              | Type      | Description                                       |
|---------------------|-----------|---------------------------------------------------|
| `pa_paid`           | PK        | Primary key                                       |
| `pa_plid1`          | FK        | Player ID 1 (alphabetically first by name)        |
| `pa_plid2`          | FK        | Player ID 2 (alphabetically second by name)       |
| `pa_sessions`       | integer   | Total sessions together                           |
| `pa_avg_pct`        | numeric   | Overall average %                                 |
| `pa_mp_sessions`    | integer   | MP sessions together                              |
| `pa_mp_avg_pct`     | numeric   | MP average %                                      |
| `pa_imp_sessions`   | integer   | IMP sessions together                             |
| `pa_imp_avg_pct`    | numeric   | IMP average %                                     |
| `pa_last_updated`   | timestamp | Timestamp of last recalculate                     |

---

### `tfl_fetch_log` — Log of each Stage 2 fetch attempt

| Column          | Type      | Description                              |
|-----------------|-----------|------------------------------------------|
| `fl_flid`       | PK        | Primary key                              |
| `fl_seid`       | FK        | → `tse_sessions.se_seid`                 |
| `fl_fetched_at` | timestamp | When the fetch ran                       |
| `fl_skipped`    | boolean   | `true` = AKBC page not yet posted        |
| `fl_error`      | text      | Exception message if fetch failed        |

---

### `tam_ambiguous` — NZ Bridge lookups with multiple candidates

| Column           | Type    | Description                               |
|------------------|---------|-------------------------------------------|
| `am_amid`        | PK      | Primary key                               |
| `am_search_name` | varchar | Name searched in `tpl_players`            |
| `am_nz_number`   | integer | Candidate NZ# from nzbridge.co.nz         |
| `am_nz_name`     | varchar | Candidate name from nzbridge.co.nz        |
| `am_club`        | varchar | Club listed on nzbridge.co.nz             |

---

## Session Import Section

### Manual Session Import

> **Button:** `Import Session`  
> **Location:** Admin → Manual Session Import  
> **Route:** `POST /api/scrape/import`

**Purpose:** Import a single session by typing its AKBC source ID. Handles both MP and IMP in one pass.

#### Request body

```json
{ "source_id": 660711, "day_of_week": "Monday", "session_type": "club", "scoring": "MP", "mode": "skip" }
```

| `mode` value      | Behaviour                                                                         |
|-------------------|-----------------------------------------------------------------------------------|
| `skip` (default)  | Silently skips if session already exists                                          |
| `reimport`        | Deletes `tre_results` + `tse_sessions` for that source_id, then re-imports        |

#### What it does

1. Fetches and parses the AKBC results page
2. Detects IMP sessions (looks for `teams` or `imp` in page text)
3. Inserts `tse_sessions`
4. For each pair on the page:
   - Looks up player by NZ# (from href) or by name; inserts new `tpl_players` row if not found
   - Upserts `tpa_partners`
   - Inserts **two** `tre_results` rows (one per player):

| Session type | `re_percentage`   | `re_imp_score`  |
|--------------|-------------------|-----------------|
| MP           | Scraped pair %    | NULL            |
| IMP          | 0.00 (pending)    | Raw IMP score   |

#### Tables written

`tse_sessions` · `tpl_players` (new players only) · `tre_results` · `tpa_partners`

#### Verify

```sql
-- Confirm session was imported
SELECT se_seid, se_date, se_day_of_week, se_scoring, se_source_id
FROM tse_sessions WHERE se_source_id = 660711;

-- Confirm results (should be pairs × 2 rows)
SELECT re_reid, re_plid, re_partner_plid, re_percentage, re_imp_score
FROM tre_results
WHERE re_seid = (SELECT se_seid FROM tse_sessions WHERE se_source_id = 660711);
```

---

### Fetch Session List

> **Button:** `Fetch Session List`  
> **Location:** Admin → Available Sessions from AKBC  
> **Route:** `GET /api/scrape/sessions?year=2026`

**Purpose:** Loads all AKBC sessions for a given year so you can see what hasn't been imported yet. **Read-only — nothing is written.**

IMP sessions are flagged (greyed out, not batch-selectable — use Manual Import for those).

#### Tables read

`tse_sessions` (to mark sessions already imported)

---

### Batch Session Import

> **Button:** `Import Selected (N)`  
> **Location:** Admin → Available Sessions from AKBC → after selecting rows  
> **Route:** `POST /api/scrape/import` (called once per selected source_id)

**Purpose:** Import multiple MP sessions at once. Same logic as Manual Import per row.

> **Note:** IMP sessions cannot be batch-selected — import them via Manual Session Import.

| Status badge | Meaning                      |
|--------------|------------------------------|
| Importing…   | Currently being processed    |
| Done         | Imported successfully        |
| Error        | Fetch or insert failed       |

#### Tables written

Same as Manual Import

---

### Load Status

> **Button:** `Load Status`  
> **Location:** Admin → Stage 2 — Fetch Results  
> **Route:** `GET /api/scrape/fetch-results`

**Purpose:** Shows all sessions with pair count, processing state, and errors. Supports Type (MP/IMP) and Status filter dropdowns.

| Status    | Meaning                                               |
|-----------|-------------------------------------------------------|
| Processed | Results are in `tre_results`                          |
| Fetched   | Raw data in staging only, not yet processed           |
| Pending   | No fetch log entry                                    |
| Skipped   | AKBC page not yet posted                              |
| No Pairs  | Fetched but 0 pairs parsed                            |
| Error     | Fetch threw an exception                              |

#### Verify

```sql
SELECT s.se_seid, s.se_date, s.se_scoring,
       COUNT(r.re_reid)       AS result_rows,
       MAX(f.fl_fetched_at)   AS last_fetch,
       MAX(f.fl_skipped::int) AS was_skipped,
       MAX(f.fl_error)        AS last_error
FROM tse_sessions s
LEFT JOIN tre_results   r ON r.re_seid = s.se_seid
LEFT JOIN tfl_fetch_log f ON f.fl_seid = s.se_seid
GROUP BY s.se_seid
ORDER BY s.se_date DESC;
```

---

### Fetch All Pending

> **Button:** `Fetch All Pending`  
> **Location:** Admin → Stage 2 — Fetch Results  
> **Route:** `POST /api/scrape/fetch-results` (streaming SSE)

**Purpose:** Re-fetches from AKBC for every session with status Pending, Skipped, or Error. Mainly useful for sessions imported before their results page was posted.

#### What it does (per eligible session)

1. Fetches the AKBC results page
2. Deletes existing `trw_results_raw` rows for that source_id
3. Inserts new `trw_results_raw` rows
4. Inserts `tfl_fetch_log` row

#### Tables written

`trw_results_raw` · `tfl_fetch_log`

#### Verify

```sql
SELECT fl_seid, fl_fetched_at, fl_skipped, fl_error
FROM tfl_fetch_log ORDER BY fl_fetched_at DESC LIMIT 20;
```

---

### Refetch Selected

> **Button:** `Refetch Selected (N)`  
> **Location:** Admin → Stage 2 — Fetch Results → after ticking rows  
> **Route:** `POST /api/scrape/fetch-results?seids=1,2,3`

**Purpose:** Same as Fetch All Pending but for specific checked rows only. Use to retry errored sessions or re-pull updated results.

#### Tables written

`trw_results_raw` · `tfl_fetch_log`

---

### Process Results

> **Button:** `Process Results`  
> **Location:** Admin → Stage 3 — Process Results  
> **Route:** `POST /api/scrape/process-results` (streaming SSE)

**Purpose:** Converts raw staging rows (`trw_results_raw`) into player and result records.

> **Note:** Legacy path — Stage 1 import already does this inline. Use only if staging rows exist that were not processed during import.

#### What it does

1. Resolves `rw_name1` / `rw_name2` to `pl_plid` values (creates new players if needed)
2. Upserts `tpa_partners`
3. Inserts `tre_results` rows for each player in each pair

#### Tables written

`tpl_players` (new) · `tre_results` · `tpa_partners`

---

## Player Refresh Section

### Fill Missing NZ Numbers

> **Button:** `Fill Missing NZ Numbers`  
> **Location:** Admin → Stage 4  
> **Route:** `POST /api/players/refresh?mode=missing` (streaming SSE)

**Purpose:** For every player with `pl_nzb = 0`, searches nzbridge.co.nz by name.

| Result      | Action                                                    |
|-------------|-----------------------------------------------------------|
| 1 match     | Updates `pl_nzb` immediately                 |
| 0 matches   | Records as failed (no update)                             |
| 2+ matches  | Writes candidates to `tam_ambiguous` for manual review    |

#### Tables written

`tpl_players` (`pl_nzb`) · `tam_ambiguous`

#### Verify

```sql
-- Players still missing NZ#
SELECT pl_plid, pl_name FROM tpl_players WHERE pl_nzb = 0 ORDER BY pl_name;

-- Ambiguous cases waiting for manual review
SELECT am_search_name, am_nz_number, am_nz_name, am_club FROM tam_ambiguous ORDER BY am_search_name;
```

---

### Assign Ambiguous Player

> **Button:** `Assign` (per row in the Ambiguous Players table)  
> **Location:** Admin → Stage 4 → Show Ambiguous Players  
> **Route:** `POST /api/players/ambiguous`

**Purpose:** When Fill Missing found multiple candidates, each is listed here. Click Assign on the correct one.

#### Request body

```json
{ "search_name": "John Smith", "nzb": 12345 }
```

#### What it does

1. `UPDATE tpl_players SET pl_nzb = nzb WHERE pl_name = search_name`
2. `DELETE FROM tam_ambiguous WHERE am_search_name = search_name`

#### Verify

```sql
SELECT pl_plid, pl_name, pl_nzb FROM tpl_players WHERE pl_name = 'John Smith';
SELECT COUNT(*) AS remaining FROM tam_ambiguous;
```

---

### Merge Players

> **Button:** `Merge (cannot be undone)`  
> **Location:** Admin → Stage 4b — Merge Players  
> **Route:** `POST /api/players/merge`

**Purpose:** Fixes duplicate player records from name spelling differences. All history transfers to the kept player.

> ⚠️ **Cannot be undone.** Double-check both names before confirming.  
> Run **Recalculate Averages + Partnerships** after merging.

#### Request body

```json
{ "keep_plid": 12, "discard_plid": 34 }
```

#### What it does (in order)

| Step | Action                                                                         |
|------|--------------------------------------------------------------------------------|
| 1    | Fetch keep/discard names from `tpl_players`                                    |
| 2    | Update `trw_results_raw.rw_name1` where = discard name                         |
| 3    | Update `trw_results_raw.rw_name2` where = discard name                         |
| 4    | Update `tre_results.re_plid` where = discard plid                              |
| 5    | Update `tre_results.re_partner_plid` where = discard plid                      |
| 6    | Delete from `tpa_partners` where either plid = discard plid                    |
| 7    | Delete from `tpl_players` where `pl_plid` = discard plid                       |

#### Verify

```sql
-- Before: confirm both records exist
SELECT pl_plid, pl_name, pl_session_count FROM tpl_players WHERE pl_name ILIKE '%kerri%';

-- After merge + recalculate: one combined record
SELECT pl_plid, pl_name, pl_session_count, pl_avg_percentage
FROM tpl_players WHERE pl_name ILIKE '%kerrie%mccrae%';
```

---

### Correct NZ Numbers

> **Buttons:** `Search` + `Correct`  
> **Location:** Admin → Stage 4c  
> **Routes:** `GET /api/players/correct?q=<name>` · `POST /api/players/correct`

**Purpose:** Manually override a player's NZ number when the automatic lookup was wrong or missed them.

#### Request body (POST)

```json
{ "pl_name": "Jane Doe", "nzb": 99999 }
```

#### Tables written

`tpl_players` (`pl_nzb`)

---

### Refresh All Stats

> **Button:** `Refresh All Stats`  
> **Location:** Admin → Stage 5  
> **Route:** `POST /api/players/refresh?mode=all` (streaming SSE)

**Purpose:** For every player with a NZ#, fetches current grade, rating, and masterpoints from nzbridge.co.nz. Run periodically (e.g. monthly).

#### Tables written

`tpl_players` (grade · rating · masterpoints columns)

#### Verify

```sql
SELECT pl_name, pl_nzb, pl_grade, pl_rating
FROM tpl_players WHERE pl_nzb > 0
ORDER BY pl_rating DESC LIMIT 20;
```

---

## Stage 6 — Recalculate

### IMP Stage 1: Calculate Raw %

> **Button:** `Stage 1 — Calculate Raw %`  
> **Location:** Admin → Stage 6 (run **before** Recalculate Averages)  
> **Route:** `POST /api/players/recalculate?mode=imp-raw&clamp_pct=1` (streaming SSE)

**Purpose:** Converts raw IMP scores to percentages using a **global z-score formula** across all IMP rows. Writes the unclamped value to both `re_imp_pct_raw` and `re_percentage` so the distribution can be reviewed before clamping.

#### Clamp% dropdown — controls the z-score scale

| Option | z-score | Scale  | Meaning                                                    |
|--------|---------|--------|------------------------------------------------------------|
| 1%     | 2.576   |  9.70  | Extreme 0.5% each tail exceeds the floor/ceiling           |
| 2%     | 2.326   | 10.75  | 1% each tail                                               |
| 5%     | 1.960   | 12.76  | 2.5% each tail                                             |
| 10%    | 1.645   | 15.18  | 5% each tail                                               |

**Formula:** `raw = 50 + ((re_imp_score − global_mean) / global_std_dev) × scale`

#### Tables written

`tre_results` — `re_imp_pct_raw` and `re_percentage` (both set to unclamped value)

#### Verify

```sql
SELECT
  MIN(re_imp_pct_raw)                                                  AS min_raw,
  MAX(re_imp_pct_raw)                                                  AS max_raw,
  ROUND(AVG(re_imp_pct_raw), 2)                                        AS avg_raw,
  COUNT(*) FILTER (WHERE re_imp_pct_raw < 25 OR re_imp_pct_raw > 75)  AS outside_25_75,
  COUNT(*)                                                             AS total
FROM tre_results WHERE re_imp_score IS NOT NULL;
-- re_percentage = re_imp_pct_raw at this point (no clamping applied yet)
```

---

### IMP Stage 2: Review (no button)

Inspect the **Raw%** column in the session results and player history tables after Stage 1.

| Raw% display | Meaning                                                            |
|--------------|--------------------------------------------------------------------|
| Amber        | Score exceeds floor/ceiling — will be clamped by Apply Clamp       |
| Normal       | Within range — no clamping needed                                  |

---

### IMP Stage 3: Apply Clamp

> **Button:** `Stage 3 — Apply Clamp`  
> **Location:** Admin → Stage 6 (after reviewing Stage 1 results)  
> **Route:** `POST /api/players/recalculate?mode=imp-apply&floor=25&ceiling=75`

**Purpose:** Reads `re_imp_pct_raw` and clamps it to the chosen floor/ceiling, writing the final value to `re_percentage`.

#### Dropdowns

| Dropdown | Options           | Default |
|----------|-------------------|---------|
| Floor    | 20% · 25% · 30%   | 25%     |
| Ceiling  | 70% · 75% · 80%   | 75%     |

**Formula:** `re_percentage = GREATEST(floor, LEAST(ceiling, re_imp_pct_raw))`

#### Tables written

`tre_results` (`re_percentage`)

#### Verify

```sql
-- Rows ordered by how heavily they were clamped
SELECT re_imp_score, re_imp_pct_raw, re_percentage
FROM tre_results WHERE re_imp_score IS NOT NULL
ORDER BY ABS(re_imp_pct_raw - re_percentage) DESC
LIMIT 20;
```

---

### Recalculate Averages

> **Button:** `Recalculate Averages`  
> **Location:** Admin → Stage 6  
> **Route:** `POST /api/players/recalculate?mode=averages` (streaming SSE)

**Purpose:** Recomputes each player's session count and average % from `tre_results`. Run after any import, merge, or after Apply Clamp.

#### Tables written

`tpl_players` (all count and average columns)

#### Verify

```sql
SELECT pl_name,
       pl_session_count,     ROUND(pl_avg_percentage, 2)     AS avg,
       pl_mp_session_count,  ROUND(pl_mp_avg_percentage, 2)  AS mp_avg,
       pl_imp_session_count, ROUND(pl_imp_avg_percentage, 2) AS imp_avg
FROM tpl_players WHERE pl_name ILIKE '%McCrae%';

-- Cross-check one player manually
SELECT COUNT(*) AS rows, ROUND(AVG(re_percentage), 2) AS avg
FROM tre_results WHERE re_plid = <plid>;
```

---

### Recalculate Partnerships

> **Button:** `Recalculate Partnerships`  
> **Location:** Admin → Stage 6  
> **Route:** `POST /api/players/recalculate?mode=partners` (streaming SSE)

**Purpose:** Rebuilds `tpa_partners` stats from `tre_results`. Also back-fills `re_pairid` on any results rows missing it. Run after Recalculate Averages.

#### What it does

1. Groups `tre_results` by pair (`re_plid < re_partner_plid`) — computes sessions, avg %, MP/IMP breakdowns
2. Orders pair so `pa_plid1` / `pa_plid2` follow alphabetical name order
3. Upserts `tpa_partners` (conflict on `pa_plid1, pa_plid2`)
4. Back-fills `tre_results.re_pairid` where NULL

#### Tables written

`tpa_partners` (all columns) · `tre_results` (`re_pairid`)

#### Verify

```sql
-- Partnership stats for a player
SELECT p1.pl_name, p2.pl_name AS partner,
       pa_sessions, ROUND(pa_avg_pct, 2) AS avg,
       pa_mp_sessions, pa_imp_sessions
FROM tpa_partners pa
JOIN tpl_players p1 ON p1.pl_plid = pa.pa_plid1
JOIN tpl_players p2 ON p2.pl_plid = pa.pa_plid2
WHERE pa.pa_plid1 = <plid> OR pa.pa_plid2 = <plid>
ORDER BY pa_sessions DESC;

-- Confirm no missing pair IDs
SELECT COUNT(*) AS missing_pairid FROM tre_results WHERE re_pairid IS NULL;
```

---

### Recalculate Date Seq

> **Button:** `Recalculate Date Seq`  
> **Location:** Admin → Stage 6  
> **Route:** `POST /api/players/recalculate?mode=dateseq` (streaming SSE)

**Purpose:** Assigns `se_date_seq = 1, 2, …` to sessions sharing the same date, ordered by `se_seid`. Run once after a bulk import.

#### Tables written

`tse_sessions` (`se_date_seq`)

#### Verify

```sql
SELECT se_date, se_date_seq, se_seid, se_day_of_week, se_scoring
FROM tse_sessions
ORDER BY se_date DESC, se_date_seq ASC
LIMIT 20;
```

---

## Typical Full Workflow

### New MP session

| Step | Admin action                                 | Tables written                                                   |
|------|----------------------------------------------|------------------------------------------------------------------|
| 1    | Import Selected or Manual Session Import     | `tse_sessions` · `tpl_players` · `tre_results` · `tpa_partners` |
| 2    | Recalculate Averages                         | `tpl_players`                                                    |
| 3    | Recalculate Partnerships                     | `tpa_partners` · `tre_results` (re_pairid)                       |

### New IMP session

| Step | Admin action                                 | Result                                                           |
|------|----------------------------------------------|------------------------------------------------------------------|
| 1    | Manual Session Import (type source_id)       | `re_imp_score` stored, `re_percentage = 0`                       |
| 2    | Stage 1 — Calculate Raw %                    | `re_imp_pct_raw` + `re_percentage` = unclamped z-score           |
| 3    | Review Raw% column in result tables          | Amber = will be clamped                                          |
| 4    | Stage 3 — Apply Clamp                        | `re_percentage` finalised to chosen range                        |
| 5    | Recalculate Averages                         | `tpl_players` averages updated                                   |
| 6    | Recalculate Partnerships                     | `tpa_partners` rebuilt · `re_pairid` back-filled                 |

### Periodic / as needed

| When                       | Action                                                        |
|----------------------------|---------------------------------------------------------------|
| New players imported       | Fill Missing NZ Numbers → review Ambiguous Players            |
| Wrong NZ# assigned         | Correct NZ Numbers                                            |
| Monthly                    | Refresh All Stats (grade/rating from nzbridge.co.nz)          |
| After bulk import          | Recalculate Date Seq                                          |
| Duplicate player found     | Merge Players → Recalculate Averages + Partnerships           |
