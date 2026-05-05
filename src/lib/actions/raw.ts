'use server'

import { table_query } from 'nextjs-shared/table_query'
import type { RawTs1Row, RawTs2Row, RawTs3Row, RawTs4Row, RawTs6Row, RawTs5Row, RawTs61Row } from '@/src/lib/scrape/akbc-raw'

// ── ts7_nz_players ────────────────────────────────────────────────────────────

interface NzLookupResult {
  nzNumber: number
  nzName: string
  club: string
  rank: string
  grade: string
  rating: number
  aPoints: number
  bPoints: number
  cPoints: number
}

/** Delete all rows from ts7_nz_players. */
export async function clearTs7(): Promise<void> {
  await table_query({ caller: 'raw/ts7/clear', query: `DELETE FROM ts7_nz_players`, params: [] })
}

/** Insert names from session data (ts3/ts6) — skips duplicates, batched 50 at a time. */
export async function upsertTs7Names(names: string[]): Promise<void> {
  const unique = [...new Set(names)]
  if (unique.length === 0) return
  const BATCH = 50
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH)
    const placeholders = chunk.map((_, j) => `($${j + 1})`).join(', ')
    await table_query({
      caller: 'raw/ts7/upsert',
      query: `INSERT INTO ts7_nz_players (s7_name) VALUES ${placeholders} ON CONFLICT (s7_name) DO NOTHING`,
      params: chunk
    })
  }
}

/** Update ts7 row after nzbridge name-based lookup (fill missing). */
export async function updateTs7ByName(name: string, result: NzLookupResult | null): Promise<void> {
  if (result) {
    await table_query({
      caller: 'raw/ts7/updateByName',
      query: `UPDATE ts7_nz_players SET s7_nz_number=$2, s7_name=$3, s7_club=$4, s7_rank=$5, s7_grade=$6, s7_rating=$7, s7_a_points=$8, s7_b_points=$9, s7_c_points=$10, s7_status='found' WHERE s7_name=$1`,
      params: [name, result.nzNumber, result.nzName, result.club, result.rank, result.grade, result.rating, result.aPoints, result.bPoints, result.cPoints]
    })
  } else {
    await table_query({ caller: 'raw/ts7/updateByName', query: `UPDATE ts7_nz_players SET s7_status='not_found' WHERE s7_name=$1`, params: [name] })
  }
}

/** Update ts7 row after nzbridge number-based lookup (refresh). */
export async function updateTs7ByNzNumber(nzNumber: number, result: NzLookupResult | null): Promise<void> {
  if (result) {
    await table_query({
      caller: 'raw/ts7/updateByNzNum',
      query: `UPDATE ts7_nz_players SET s7_name=$2, s7_club=$3, s7_rank=$4, s7_grade=$5, s7_rating=$6, s7_a_points=$7, s7_b_points=$8, s7_c_points=$9, s7_status='found' WHERE s7_nz_number=$1`,
      params: [nzNumber, result.nzName, result.club, result.rank, result.grade, result.rating, result.aPoints, result.bPoints, result.cPoints]
    })
  } else {
    await table_query({ caller: 'raw/ts7/updateByNzNum', query: `UPDATE ts7_nz_players SET s7_status='not_found' WHERE s7_nz_number=$1`, params: [nzNumber] })
  }
}

/** All ts7 rows for display. */
export async function getTs7All() {
  return table_query({
    caller: 'raw/ts7/all',
    query: `SELECT s7_s7id, s7_name, s7_nz_number, s7_club, s7_rank, s7_grade, s7_rating, s7_a_points, s7_b_points, s7_c_points, s7_status, s7_source FROM ts7_nz_players ORDER BY s7_status, s7_name`,
    params: []
  })
}

/** Rows without an NZ number — candidates for Fill Missing lookup. */
export async function getTs7NeedingLookup() {
  return table_query({
    caller: 'raw/ts7/needingLookup',
    query: `SELECT s7_s7id, s7_name FROM ts7_nz_players WHERE s7_nz_number IS NULL ORDER BY s7_name`,
    params: []
  })
}

/** Rows with an NZ number — candidates for Refresh lookup. */
export async function getTs7ForRefresh() {
  return table_query({
    caller: 'raw/ts7/forRefresh',
    query: `SELECT s7_s7id, s7_name, s7_nz_number FROM ts7_nz_players WHERE s7_nz_number IS NOT NULL ORDER BY s7_name`,
    params: []
  })
}

/** All found rows with NZ numbers — used by ts8 scraper. */
export async function getTs7AllFound() {
  return table_query({
    caller: 'raw/ts7/allFound',
    query: `SELECT s7_s7id, s7_name, s7_nz_number FROM ts7_nz_players WHERE s7_status = 'found' AND s7_nz_number IS NOT NULL ORDER BY s7_name`,
    params: []
  })
}

/** Found AKBC-sourced players only — used by nzresults scraper (partners excluded). */
export async function getTs7AllFoundAkbc() {
  return table_query({
    caller: 'raw/ts7/allFoundAkbc',
    query: `SELECT s7_s7id, s7_name, s7_nz_number FROM ts7_nz_players WHERE s7_status = 'found' AND s7_nz_number IS NOT NULL AND s7_source = 'akbc' ORDER BY s7_name`,
    params: []
  })
}

/** Insert a partner name into ts7 with source='partner' — skips if already present. */
export async function upsertTs7Partner(name: string, nzNumber: number): Promise<void> {
  await table_query({
    caller: 'raw/ts7/upsertPartner',
    query: `INSERT INTO ts7_nz_players (s7_name, s7_nz_number, s7_status, s7_source)
            VALUES ($1, $2, 'found', 'partner')
            ON CONFLICT (s7_name) DO NOTHING`,
    params: [name, nzNumber],
    noLog: true
  })
}

/** All found rows with full stats — used by build/players conversion. */
export async function getTs7FoundWithStats() {
  return table_query({
    caller: 'raw/ts7/foundWithStats',
    query: `SELECT s7_name, s7_nz_number, s7_club, s7_rank, s7_grade, s7_rating, s7_a_points, s7_b_points, s7_c_points FROM ts7_nz_players WHERE s7_status = 'found' AND s7_nz_number IS NOT NULL ORDER BY s7_name`,
    params: []
  })
}

/** Raw player names from ts3 team members — for ts7 build step. */
export async function getTs3AllPlayerNames(): Promise<{ name: string }[]> {
  return table_query({
    caller: 'raw/ts3/allNames',
    query: `SELECT DISTINCT UNNEST(s3_player_names) AS name FROM ts3_team_members`,
    params: []
  }) as Promise<{ name: string }[]>
}

/** Raw pair name strings from ts6 sessions — for ts7/ts9 build steps. */
export async function getTs6AllPairNames(): Promise<{ s6_pair_names: string }[]> {
  return table_query({
    caller: 'raw/ts6/allPairNames',
    query: `SELECT DISTINCT s6_pair_names FROM ts6_session WHERE s6_pair_names != ''`,
    params: []
  }) as Promise<{ s6_pair_names: string }[]>
}

/** All ts3 rows (player name arrays) — for ts9 build step. */
export async function getTs3AllRows(): Promise<{ s3_player_names: string[] }[]> {
  return table_query({
    caller: 'raw/ts3/allRows',
    query: `SELECT s3_player_names FROM ts3_team_members`,
    params: []
  }) as Promise<{ s3_player_names: string[] }[]>
}


// ── ts1_main ──────────────────────────────────────────────────────────────────

export async function getTs1ExistingEventIds(year: number): Promise<Set<number>> {
  const rows = await table_query({
    caller: 'raw/ts1/existingIds',
    query: `SELECT s1_event_id FROM ts1_main WHERE s1_year = $1 AND s1_event_id IS NOT NULL`,
    params: [year]
  })
  return new Set((rows as any[]).map(r => r.s1_event_id as number))
}

export async function insertTs1Rows(rows: RawTs1Row[]): Promise<void> {
  if (rows.length === 0) return
  const values = rows.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(', ')
  const params = rows.flatMap(r => [r.year, r.date || null, r.eventName, r.eventId, r.type, r.url || null])
  await table_query({
    caller: 'raw/ts1/insert',
    query: `INSERT INTO ts1_main (s1_year, s1_date, s1_event_name, s1_event_id, s1_type, s1_url) VALUES ${values}`,
    params
  })
}

export async function getTs1ByYear(year: number) {
  return table_query({
    caller: 'raw/ts1/get',
    query: `SELECT s1_s1id, s1_year, s1_date::text AS s1_date, s1_event_name, s1_event_id, s1_type FROM ts1_main WHERE s1_year = $1 ORDER BY s1_date DESC NULLS LAST, s1_s1id`,
    params: [year]
  })
}

export async function setTs1Scraped(s1id: number, rawCount: number): Promise<void> {
  await table_query({ caller: 'raw/ts1/setScraped', query: `UPDATE ts1_main SET s1_status = 'scraped', s1_raw_count = $2 WHERE s1_s1id = $1`, params: [s1id, rawCount] })
}

export async function setTs1Built(s1id: number): Promise<void> {
  await table_query({ caller: 'raw/ts1/setBuilt', query: `UPDATE ts1_main SET s1_status = 'built' WHERE s1_s1id = $1`, params: [s1id] })
}

export async function getTs1WithStatus(year: number) {
  return table_query({
    caller: 'raw/ts1/withStatus',
    query: `
      SELECT s1_s1id, s1_year, s1_date::text AS s1_date, s1_event_name, s1_event_id, s1_type, s1_status, s1_raw_count AS raw_count, s1_url
      FROM ts1_main
      WHERE s1_year = $1 AND s1_event_id IS NOT NULL
      ORDER BY s1_date DESC NULLS LAST, s1_s1id
    `,
    params: [year]
  })
}

// ── ts2_team_matchdata ────────────────────────────────────────────────────────

export async function clearTs2(eventId: number): Promise<void> {
  await table_query({ caller: 'raw/ts2/clear', query: `DELETE FROM ts2_team_matchdata WHERE s2_event_id = $1`, params: [eventId] })
}

export async function insertTs2Rows(rows: RawTs2Row[]): Promise<void> {
  if (rows.length === 0) return
  for (const r of rows) {
    await table_query({
      caller: 'raw/ts2/insert',
      query: `INSERT INTO ts2_team_matchdata (s2_event_id, s2_url, s2_team_num) VALUES ($1, $2, $3)`,
      params: [r.eventId, r.url, r.teamNum]
    })
  }
}

export async function getTs2ByEventId(eventId: number) {
  return table_query({
    caller: 'raw/ts2/get',
    query: `SELECT * FROM ts2_team_matchdata WHERE s2_event_id = $1 ORDER BY s2_team_num`,
    params: [eventId]
  })
}

// ── ts3_team_members ──────────────────────────────────────────────────────────

export async function clearTs3(eventId: number): Promise<void> {
  await table_query({ caller: 'raw/ts3/clear', query: `DELETE FROM ts3_team_members WHERE s3_event_id = $1`, params: [eventId] })
}

export async function insertTs3Rows(rows: RawTs3Row[]): Promise<void> {
  if (rows.length === 0) return
  const values = rows.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ')
  const params = rows.flatMap(r => {
    const namesLiteral = `{${r.playerNames.map(n => `"${n.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`
    return [r.eventId, r.url, r.teamNum, r.teamName, namesLiteral]
  })
  await table_query({
    caller: 'raw/ts3/insert',
    query: `INSERT INTO ts3_team_members (s3_event_id, s3_url, s3_team_num, s3_team_name, s3_player_names) VALUES ${values}`,
    params
  })
}

export async function getTs3ByEventId(eventId: number) {
  return table_query({
    caller: 'raw/ts3/get',
    query: `SELECT * FROM ts3_team_members WHERE s3_event_id = $1 ORDER BY s3_team_num`,
    params: [eventId]
  })
}

// ── ts4_team_rounds ───────────────────────────────────────────────────────────

export async function clearTs4(eventId: number): Promise<void> {
  await table_query({ caller: 'raw/ts4/clear', query: `DELETE FROM ts4_team_rounds WHERE s4_event_id = $1`, params: [eventId] })
}

export async function insertTs4Rows(rows: RawTs4Row[]): Promise<void> {
  if (rows.length === 0) return
  for (const r of rows) {
    const oppLiteral = `{${r.opponentNums.join(',')}}`
    const vpLiteral  = `{${r.vps.join(',')}}`
    const urlLiteral = `{${r.showteamUrls.map(u => u ? `"${u.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : '""').join(',')}}`
    await table_query({
      caller: 'raw/ts4/insert',
      query: `INSERT INTO ts4_team_rounds (s4_event_id, s4_url, s4_team_num, s4_opponent_nums, s4_vps, s4_showteam_urls)
              VALUES ($1, $2, $3, $4, $5, $6)`,
      params: [r.eventId, r.url, r.teamNum, oppLiteral, vpLiteral, urlLiteral]
    })
  }
}

export async function getTs4ByEventId(eventId: number) {
  return table_query({
    caller: 'raw/ts4/get',
    query: `SELECT * FROM ts4_team_rounds WHERE s4_event_id = $1 ORDER BY s4_team_num`,
    params: [eventId]
  })
}

export async function getTeamsStatus(eventId: number): Promise<{
  ts2Count: number; ts3Count: number; ts4Count: number
  ts61Count: number; ts61Expected: number
}> {
  const rows = await table_query({
    caller: 'raw/teams/status',
    query: `SELECT
      (SELECT COUNT(*)::int FROM ts2_team_matchdata  WHERE s2_event_id  = $1) AS ts2_count,
      (SELECT COUNT(*)::int FROM ts3_team_members    WHERE s3_event_id  = $1) AS ts3_count,
      (SELECT COUNT(*)::int FROM ts4_team_rounds     WHERE s4_event_id  = $1) AS ts4_count,
      (SELECT COUNT(*)::int FROM ts61_session_teams  WHERE s61_event_id = $1) AS ts61_count,
      (SELECT FLOOR(COALESCE(SUM(
         (SELECT COUNT(*) FROM UNNEST(s4_showteam_urls) u WHERE u != '')
       ), 0) / 2.0)::int
       FROM ts4_team_rounds WHERE s4_event_id = $1) AS ts61_expected`,
    params: [eventId]
  }) as { ts2_count: number; ts3_count: number; ts4_count: number; ts61_count: number; ts61_expected: number }[]
  const r = rows[0]
  return {
    ts2Count:     r?.ts2_count     ?? 0,
    ts3Count:     r?.ts3_count     ?? 0,
    ts4Count:     r?.ts4_count     ?? 0,
    ts61Count:    r?.ts61_count    ?? 0,
    ts61Expected: r?.ts61_expected ?? 0,
  }
}

// ── ts6_session ───────────────────────────────────────────────────────────────

export async function clearTs6(sourceId: number): Promise<void> {
  await table_query({ caller: 'raw/ts6/clear', query: `DELETE FROM ts6_session WHERE s6_source_id = $1`, params: [sourceId] })
}

export async function insertTs6Rows(rows: RawTs6Row[]): Promise<void> {
  if (rows.length === 0) return
  const values = rows.map((_, i) => `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`).join(', ')
  const params = rows.flatMap(r => [r.eventId, r.sourceId, r.url, r.title, r.direction, r.place, r.percentage, r.pairNames, r.pairNum])
  await table_query({
    caller: 'raw/ts6/insert',
    query: `INSERT INTO ts6_session (s6_event_id, s6_source_id, s6_url, s6_title, s6_direction, s6_place, s6_percentage, s6_pair_names, s6_pair_num) VALUES ${values}`,
    params
  })
}

export async function getTs6BySourceId(sourceId: number) {
  return table_query({
    caller: 'raw/ts6/get',
    query: `SELECT * FROM ts6_session WHERE s6_source_id = $1 ORDER BY s6_direction NULLS FIRST, s6_place`,
    params: [sourceId]
  })
}

// ── ts5_session_header ────────────────────────────────────────────────────────

export async function clearTs5(eventId: number): Promise<void> {
  await table_query({ caller: 'raw/ts5/clear', query: `DELETE FROM ts5_session_header WHERE s5_event_id = $1`, params: [eventId] })
}

export async function insertTs5Rows(rows: RawTs5Row[]): Promise<void> {
  if (rows.length === 0) return
  const values = rows.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(', ')
  const params = rows.flatMap(r => [r.eventId, r.date || null, r.sessionName, r.sourceId, r.type, r.url])
  await table_query({
    caller: 'raw/ts5/insert',
    query: `INSERT INTO ts5_session_header (s5_event_id, s5_date, s5_session_name, s5_source_id, s5_type, s5_url) VALUES ${values}`,
    params
  })
}

export async function getTs5ByEventId(eventId: number) {
  return table_query({
    caller: 'raw/ts5/get',
    query: `SELECT s5_s5id, s5_event_id, s5_date::text AS s5_date, s5_session_name, s5_source_id, s5_type, s5_url FROM ts5_session_header WHERE s5_event_id = $1 ORDER BY s5_date, s5_s5id`,
    params: [eventId]
  })
}

// ── ts8_nz_results ────────────────────────────────────────────────────────────

export interface Ts8PairRow {
  runId: number
  nzNumber1: number   // LEAST of the two NZ numbers
  nzNumber2: number   // GREATEST of the two NZ numbers
  date: string | null
  club: string
  eventName: string
  place: string
  scoreValue: number
  scoreType: string
  tournament: string
  eventType: string
}

export async function clearTs8(): Promise<void> {
  await table_query({ caller: 'raw/ts8/clearAll', query: `DELETE FROM ts8_nz_results`, params: [] })
}

export async function insertTs8Pairs(rows: Ts8PairRow[]): Promise<void> {
  if (rows.length === 0) return
  const N = 11
  const values = rows.map((_, i) => `($${i*N+1},$${i*N+2},$${i*N+3},$${i*N+4},$${i*N+5},$${i*N+6},$${i*N+7},$${i*N+8},$${i*N+9},$${i*N+10},$${i*N+11})`).join(',')
  const params = rows.flatMap(r => {
    // PCT outside 25–75 or VP > 20 is bad data — set to neutral 50/10.
    let scoreValue = r.scoreValue
    if (r.scoreType === 'PCT' && (r.scoreValue > 75 || r.scoreValue < 25)) scoreValue = 50
    if (r.scoreType === 'VP'  && r.scoreValue > 20) scoreValue = 10
    return [r.runId, r.nzNumber1, r.nzNumber2, r.date || null, r.club,
            r.eventName, r.place, scoreValue, r.scoreType, r.tournament, r.eventType]
  })
  await table_query({
    caller: 'raw/ts8/insert',
    query: `INSERT INTO ts8_nz_results
              (s8_run_id, s8_nz_number1, s8_nz_number2, s8_date, s8_club, s8_event_name,
               s8_place, s8_score_value, s8_score_type, s8_tournament, s8_event_type)
            VALUES ${values}
            ON CONFLICT (s8_run_id, s8_nz_number1, s8_nz_number2) DO NOTHING`,
    params,
    noLog: true
  })
}

export async function getTs8ProcessedRunIds(): Promise<Set<number>> {
  const rows = await table_query({
    caller: 'raw/ts8/processedRunIds',
    query: `SELECT DISTINCT s8_run_id FROM ts8_nz_results`,
    params: []
  }) as any[]
  return new Set(rows.map(r => r.s8_run_id as number))
}

export async function getTs8ByRunId(runId: number) {
  return table_query({
    caller: 'raw/ts8/getByRunId',
    query: `SELECT s8_s8id, s8_run_id, s8_nz_number1, s8_nz_number2,
                   s8_date::text AS s8_date, s8_club, s8_event_name, s8_place,
                   s8_score_value, s8_score_type, s8_tournament, s8_event_type
            FROM ts8_nz_results WHERE s8_run_id = $1 ORDER BY s8_place, s8_s8id`,
    params: [runId]
  })
}

export async function getTs8ByNzNumber(nzNumber: number) {
  return table_query({
    caller: 'raw/ts8/getByNzNumber',
    query: `SELECT s8_s8id, s8_run_id, s8_nz_number1, s8_nz_number2,
                   s8_date::text AS s8_date, s8_club, s8_event_name, s8_place,
                   s8_score_value, s8_score_type, s8_tournament, s8_event_type
            FROM ts8_nz_results
            WHERE s8_nz_number1 = $1 OR s8_nz_number2 = $1
            ORDER BY s8_date DESC NULLS LAST, s8_run_id`,
    params: [nzNumber]
  })
}

export async function getTs8Sessions() {
  return table_query({
    caller: 'raw/ts8/sessions',
    query: `SELECT s8_run_id, s8_date::text AS s8_date, s8_club, s8_event_name,
                   s8_score_type, s8_event_type, COUNT(*)::int AS pair_count
            FROM ts8_nz_results
            GROUP BY s8_run_id, s8_date, s8_club, s8_event_name, s8_score_type, s8_event_type
            ORDER BY s8_date DESC, s8_run_id`,
    params: []
  })
}

// ── ts61_session_teams ────────────────────────────────────────────────────────

export async function clearTs61(eventId: number): Promise<void> {
  await table_query({ caller: 'raw/ts61/clear', query: `DELETE FROM ts61_session_teams WHERE s61_event_id = $1`, params: [eventId] })
}

export async function insertTs61Rows(rows: RawTs61Row[]): Promise<void> {
  if (rows.length === 0) return
  for (const r of rows) {
    const toArr = (names: string[]) => `{${names.map(n => `"${n.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`
    await table_query({
      caller: 'raw/ts61/insert',
      query: `INSERT INTO ts61_session_teams
              (s61_event_id, s61_match_id, s61_round_num, s61_url,
               s61_home_pair1, s61_home_pair2, s61_away_pair1, s61_away_pair2)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              ON CONFLICT (s61_match_id) DO NOTHING`,
      params: [r.eventId, r.matchId, r.roundNum, r.url,
               toArr(r.homePair1), toArr(r.homePair2), toArr(r.awayPair1), toArr(r.awayPair2)]
    })
  }
}

export async function getTs61ByEventId(eventId: number) {
  return table_query({
    caller: 'raw/ts61/get',
    query: `SELECT * FROM ts61_session_teams WHERE s61_event_id = $1 ORDER BY s61_round_num`,
    params: [eventId]
  })
}

/** All player names from ts61 pairs (flattened) — for ts7 upsert. */
export async function getTs61AllPairNames(): Promise<{ name: string }[]> {
  return table_query({
    caller: 'raw/ts61/allNames',
    query: `SELECT DISTINCT UNNEST(s61_home_pair1 || s61_home_pair2 || s61_away_pair1 || s61_away_pair2) AS name
            FROM ts61_session_teams`,
    params: []
  }) as Promise<{ name: string }[]>
}

