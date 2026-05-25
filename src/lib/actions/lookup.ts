'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_query } from 'nextjs-shared/table_query'
import { cache_clearTable } from 'nextjs-shared/userCache_store'

export async function getAllRanks() {
  return table_fetch({ caller: 'getAllRanks', table: 'trk_ranks', orderBy: 'rk_rank ASC', skipCache: true })
}

export async function getAllClubs() {
  return table_fetch({ caller: 'getAllClubs', table: 'tcl_clubs', orderBy: 'cl_club ASC', skipCache: true })
}

export async function getAllGrades() {
  return table_fetch({ caller: 'getAllGrades', table: 'tgr_grades', orderBy: 'gr_grade ASC', skipCache: true })
}

export async function populateRanks(): Promise<{ inserted: number }> {
  await table_query({
    caller: 'populateRanks',
    query: `INSERT INTO trk_ranks (rk_rank)
            SELECT DISTINCT
              CASE WHEN LOWER(pl_rank) IN ('n/a', 'no rank', 'unknown') OR pl_rank = ''
                   THEN 'No Rank'
                   ELSE pl_rank
              END AS rk_rank
            FROM tpl_players
            ON CONFLICT (rk_rank) DO NOTHING`,
    params: []
  })
  cache_clearTable('trk_ranks', 'populateRanks')
  const rows = await table_query({
    caller: 'populateRanks/count',
    query: `SELECT COUNT(*)::int AS n FROM trk_ranks`,
    params: []
  })
  return { inserted: rows[0]?.n ?? 0 }
}

export async function populateClubs(): Promise<{ inserted: number }> {
  await table_query({
    caller: 'populateClubs',
    query: `INSERT INTO tcl_clubs (cl_club)
            SELECT DISTINCT pl_club FROM tpl_players WHERE pl_club <> ''
            ON CONFLICT (cl_club) DO NOTHING`,
    params: []
  })
  cache_clearTable('tcl_clubs', 'populateClubs')
  const rows = await table_query({
    caller: 'populateClubs/count',
    query: `SELECT COUNT(*)::int AS n FROM tcl_clubs`,
    params: []
  })
  return { inserted: rows[0]?.n ?? 0 }
}

export async function mergeClubs(fromClub: string, toClub: string): Promise<{ updated: number }> {
  const rows = await table_query({
    caller: 'mergeClubs',
    query: `UPDATE tpl_players SET pl_club = $2 WHERE pl_club = $1 RETURNING pl_plid`,
    params: [fromClub, toClub]
  })
  await table_query({
    caller: 'mergeClubs/delete',
    query: `DELETE FROM tcl_clubs WHERE cl_club = $1`,
    params: [fromClub]
  })
  cache_clearTable('tcl_clubs',   'mergeClubs')
  cache_clearTable('tpl_players', 'mergeClubs')
  return { updated: rows.length }
}

export async function populateGrades(): Promise<{ inserted: number }> {
  await table_query({
    caller: 'populateGrades',
    query: `INSERT INTO tgr_grades (gr_grade)
            SELECT DISTINCT pl_grade FROM tpl_players WHERE pl_grade <> ''
            ON CONFLICT (gr_grade) DO NOTHING`,
    params: []
  })
  cache_clearTable('tgr_grades', 'populateGrades')
  const rows = await table_query({
    caller: 'populateGrades/count',
    query: `SELECT COUNT(*)::int AS n FROM tgr_grades`,
    params: []
  })
  return { inserted: rows[0]?.n ?? 0 }
}

export async function getAllEventTypes() {
  return table_fetch({ caller: 'getAllEventTypes', table: 'tet_event_types', orderBy: 'et_event_type ASC', skipCache: true })
}

export async function populateEventTypes(): Promise<{ inserted: number }> {
  await table_query({
    caller: 'populateEventTypes',
    query: `INSERT INTO tet_event_types (et_event_type)
            SELECT DISTINCT se_event_type FROM tse_sessions WHERE se_event_type <> ''
            ON CONFLICT (et_event_type) DO NOTHING`,
    params: []
  })
  const rows = await table_query({
    caller: 'populateEventTypes/count',
    query: `SELECT COUNT(*)::int AS n FROM tet_event_types`,
    params: []
  })
  return { inserted: rows[0]?.n ?? 0 }
}
