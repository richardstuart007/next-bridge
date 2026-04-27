'use server'

import { table_query } from 'nextjs-shared/table_query'
import type { RawTs1Row, RawTs2Row, RawTs3Row, RawTs4Row, RawTs6Row, RawTs5Row } from '@/src/lib/scrape/akbc-raw'
import type { ParsedPlayerResult } from '@/src/lib/scrape/parseHtml'

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

/** Insert names from session data (ts3/ts6) — skips duplicates. */
export async function upsertTs7Names(names: string[]): Promise<void> {
  if (names.length === 0) return
  const arrLiteral = `{${names.map(n => `"${n.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`
  await table_query({
    caller: 'raw/ts7/upsert',
    query: `INSERT INTO ts7_nz_players (s7_name) SELECT UNNEST($1::text[]) ON CONFLICT (s7_name) DO NOTHING`,
    params: [arrLiteral]
  })
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
    query: `SELECT s7_s7id, s7_name, s7_nz_number, s7_club, s7_rank, s7_grade, s7_rating, s7_a_points, s7_b_points, s7_c_points, s7_status FROM ts7_nz_players ORDER BY s7_status, s7_name`,
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

// ── ts9_partners ──────────────────────────────────────────────────────────────

export async function clearTs9(): Promise<void> {
  await table_query({ caller: 'raw/ts9/clear', query: `DELETE FROM ts9_partners`, params: [] })
}

export async function insertTs9Pairs(pairs: Array<{ name1: string; name2: string }>): Promise<void> {
  if (pairs.length === 0) return
  const CHUNK = 500
  for (let i = 0; i < pairs.length; i += CHUNK) {
    const chunk = pairs.slice(i, i + CHUNK)
    const values = chunk.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(', ')
    const params = chunk.flatMap(p => [p.name1, p.name2])
    await table_query({
      caller: 'raw/ts9/insert',
      query: `INSERT INTO ts9_partners (s9_name1, s9_name2) VALUES ${values} ON CONFLICT (s9_name1, s9_name2) DO NOTHING`,
      params
    })
  }
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
    const vpLiteral = `{${r.vp.join(',')}}`
    await table_query({
      caller: 'raw/ts2/insert',
      query: `INSERT INTO ts2_team_matchdata (s2_event_id, s2_url, s2_place, s2_team_num, s2_vp) VALUES ($1, $2, $3, $4, $5)`,
      params: [r.eventId, r.url, r.place, r.teamNum, vpLiteral]
    })
  }
}

export async function getTs2ByEventId(eventId: number) {
  return table_query({
    caller: 'raw/ts2/get',
    query: `SELECT * FROM ts2_team_matchdata WHERE s2_event_id = $1 ORDER BY s2_place`,
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
    await table_query({
      caller: 'raw/ts4/insert',
      query: `INSERT INTO ts4_team_rounds (s4_event_id, s4_url, s4_team_num, s4_opponent_nums, s4_vps) VALUES ($1, $2, $3, $4, $5)`,
      params: [r.eventId, r.url, r.teamNum, oppLiteral, vpLiteral]
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

export async function clearTs8ByNzNumber(nzNumber: number): Promise<void> {
  await table_query({ caller: 'raw/ts8/clear', query: `DELETE FROM ts8_nz_results WHERE s8_nz_number = $1`, params: [nzNumber] })
}

export async function insertTs8Rows(nzNumber: number, rows: ParsedPlayerResult[]): Promise<void> {
  if (rows.length === 0) return
  for (const r of rows) {
    await table_query({
      caller: 'raw/ts8/insert',
      query: `INSERT INTO ts8_nz_results (s8_nz_number, s8_date, s8_club, s8_event_name, s8_place, s8_score_value, s8_score_type, s8_a_points, s8_b_points, s8_c_points, s8_tournament, s8_type, s8_session_number, s8_restricted, s8_event_type, s8_category)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      params: [nzNumber, r.date || null, r.club, r.eventName, r.place, r.scoreValue, r.scoreType, r.aPoints ?? null, r.bPoints ?? null, r.cPoints ?? null, r.tournament || null, r.type ?? null, r.sessionNumber ?? null, r.restricted ?? null, r.eventType || null, r.category || null]
    })
  }
}

export async function getTs8ExistingNzNumbers(): Promise<number[]> {
  const rows = await table_query({ caller: 'raw/ts8/existingNums', query: `SELECT DISTINCT s8_nz_number FROM ts8_nz_results`, params: [] }) as any[]
  return rows.map(r => r.s8_nz_number as number)
}

export async function getTs8ByNzNumber(nzNumber: number) {
  return table_query({
    caller: 'raw/ts8/get',
    query: `SELECT s8_s8id, s8_nz_number, s8_date::text AS s8_date, s8_club, s8_event_name, s8_place, s8_score_value, s8_score_type, s8_a_points, s8_b_points, s8_c_points, s8_tournament, s8_type, s8_session_number, s8_restricted, s8_event_type, s8_category FROM ts8_nz_results WHERE s8_nz_number = $1 ORDER BY s8_date DESC NULLS LAST, s8_s8id`,
    params: [nzNumber]
  })
}
