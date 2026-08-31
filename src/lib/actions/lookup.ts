'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import { cache_clearTable } from 'nextjs-shared/userCache_store'

//----------------------------------------------------------------------------------
//  getAllRanks — every trk_ranks row, ordered by rk_rank (uncached)
//----------------------------------------------------------------------------------
export async function getAllRanks() {
  const result = await table_fetch({ caller: 'getAllRanks', table: 'trk_ranks', orderBy: 'rk_rank ASC', skipCache: true })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getAllRanks', lg_caller: 'getAllRanks', lg_msg: 'Failed to fetch trk_ranks: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  getAllClubs — every tcl_clubs row, ordered by cl_club (uncached)
//----------------------------------------------------------------------------------
export async function getAllClubs() {
  const result = await table_fetch({ caller: 'getAllClubs', table: 'tcl_clubs', orderBy: 'cl_club ASC', skipCache: true })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getAllClubs', lg_caller: 'getAllClubs', lg_msg: 'Failed to fetch tcl_clubs: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  getAllGrades — every tgr_grades row, ordered by gr_grade (uncached)
//----------------------------------------------------------------------------------
export async function getAllGrades() {
  const result = await table_fetch({ caller: 'getAllGrades', table: 'tgr_grades', orderBy: 'gr_grade ASC', skipCache: true })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getAllGrades', lg_caller: 'getAllGrades', lg_msg: 'Failed to fetch tgr_grades: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  populateRanks — inserts any distinct pl_rank from tpl_players missing from
//  trk_ranks (blank/"n/a"/"no rank"/"unknown" folded to 'No Rank'); clears the
//  trk_ranks cache and returns the resulting row count
//----------------------------------------------------------------------------------
export async function populateRanks(): Promise<{ inserted: number }> {
  const insertResult = await table_query({
    caller: 'populateRanks',
    table: 'trk_ranks',
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
  if (!insertResult.ok) {
    write_logging({ lg_functionname: 'populateRanks', lg_caller: 'populateRanks', lg_msg: 'Failed to insert missing trk_ranks: ' + insertResult.error, lg_severity: 'E' })
    return { inserted: 0 }
  }
  cache_clearTable('trk_ranks', 'populateRanks')
  const countResult = await table_query({
    caller: 'populateRanks/count',
    table: 'trk_ranks',
    query: `SELECT COUNT(*)::int AS n FROM trk_ranks`,
    params: []
  })
  if (!countResult.ok) {
    write_logging({ lg_functionname: 'populateRanks', lg_caller: 'populateRanks/count', lg_msg: 'Failed to count trk_ranks: ' + countResult.error, lg_severity: 'E' })
    return { inserted: 0 }
  }
  return { inserted: countResult.data[0]?.n ?? 0 }
}

//----------------------------------------------------------------------------------
//  populateClubs — inserts any distinct non-blank pl_club from tpl_players missing
//  from tcl_clubs; clears the tcl_clubs cache and returns the resulting row count
//----------------------------------------------------------------------------------
export async function populateClubs(): Promise<{ inserted: number }> {
  const insertResult = await table_query({
    caller: 'populateClubs',
    table: 'tcl_clubs',
    query: `INSERT INTO tcl_clubs (cl_club)
            SELECT DISTINCT pl_club FROM tpl_players WHERE pl_club <> ''
            ON CONFLICT (cl_club) DO NOTHING`,
    params: []
  })
  if (!insertResult.ok) {
    write_logging({ lg_functionname: 'populateClubs', lg_caller: 'populateClubs', lg_msg: 'Failed to insert missing tcl_clubs: ' + insertResult.error, lg_severity: 'E' })
    return { inserted: 0 }
  }
  cache_clearTable('tcl_clubs', 'populateClubs')
  const countResult = await table_query({
    caller: 'populateClubs/count',
    table: 'tcl_clubs',
    query: `SELECT COUNT(*)::int AS n FROM tcl_clubs`,
    params: []
  })
  if (!countResult.ok) {
    write_logging({ lg_functionname: 'populateClubs', lg_caller: 'populateClubs/count', lg_msg: 'Failed to count tcl_clubs: ' + countResult.error, lg_severity: 'E' })
    return { inserted: 0 }
  }
  return { inserted: countResult.data[0]?.n ?? 0 }
}

//----------------------------------------------------------------------------------
//  mergeClubs — repoints every tpl_players.pl_club from fromClub to toClub, deletes
//  the now-unused fromClub row from tcl_clubs, clears both caches, and returns the
//  number of player rows updated
//----------------------------------------------------------------------------------
export async function mergeClubs(fromClub: string, toClub: string): Promise<{ updated: number }> {
  const updateResult = await table_query({
    caller: 'mergeClubs',
    table: 'tpl_players',
    query: `UPDATE tpl_players SET pl_club = $2 WHERE pl_club = $1 RETURNING pl_plid`,
    params: [fromClub, toClub]
  })
  if (!updateResult.ok) {
    write_logging({ lg_functionname: 'mergeClubs', lg_caller: 'mergeClubs', lg_msg: 'Failed to repoint pl_club: ' + updateResult.error, lg_severity: 'E' })
    return { updated: 0 }
  }
  const deleteResult = await table_query({
    caller: 'mergeClubs/delete',
    table: 'tcl_clubs',
    query: `DELETE FROM tcl_clubs WHERE cl_club = $1`,
    params: [fromClub]
  })
  if (!deleteResult.ok) {
    write_logging({ lg_functionname: 'mergeClubs', lg_caller: 'mergeClubs/delete', lg_msg: 'Failed to delete merged tcl_clubs row: ' + deleteResult.error, lg_severity: 'E' })
  }
  cache_clearTable('tcl_clubs',   'mergeClubs')
  cache_clearTable('tpl_players', 'mergeClubs')
  return { updated: updateResult.data.length }
}

//----------------------------------------------------------------------------------
//  populateGrades — inserts any distinct non-blank pl_grade from tpl_players
//  missing from tgr_grades; clears the tgr_grades cache and returns the row count
//----------------------------------------------------------------------------------
export async function populateGrades(): Promise<{ inserted: number }> {
  const insertResult = await table_query({
    caller: 'populateGrades',
    table: 'tgr_grades',
    query: `INSERT INTO tgr_grades (gr_grade)
            SELECT DISTINCT pl_grade FROM tpl_players WHERE pl_grade <> ''
            ON CONFLICT (gr_grade) DO NOTHING`,
    params: []
  })
  if (!insertResult.ok) {
    write_logging({ lg_functionname: 'populateGrades', lg_caller: 'populateGrades', lg_msg: 'Failed to insert missing tgr_grades: ' + insertResult.error, lg_severity: 'E' })
    return { inserted: 0 }
  }
  cache_clearTable('tgr_grades', 'populateGrades')
  const countResult = await table_query({
    caller: 'populateGrades/count',
    table: 'tgr_grades',
    query: `SELECT COUNT(*)::int AS n FROM tgr_grades`,
    params: []
  })
  if (!countResult.ok) {
    write_logging({ lg_functionname: 'populateGrades', lg_caller: 'populateGrades/count', lg_msg: 'Failed to count tgr_grades: ' + countResult.error, lg_severity: 'E' })
    return { inserted: 0 }
  }
  return { inserted: countResult.data[0]?.n ?? 0 }
}

//----------------------------------------------------------------------------------
//  getAllEventTypes — every tet_event_types row, ordered by et_event_type (uncached)
//----------------------------------------------------------------------------------
export async function getAllEventTypes() {
  const result = await table_fetch({ caller: 'getAllEventTypes', table: 'tet_event_types', orderBy: 'et_event_type ASC', skipCache: true })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getAllEventTypes', lg_caller: 'getAllEventTypes', lg_msg: 'Failed to fetch tet_event_types: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  populateEventTypes — inserts any distinct non-blank se_event_type from
//  tse_sessions missing from tet_event_types; returns the resulting row count
//----------------------------------------------------------------------------------
export async function populateEventTypes(): Promise<{ inserted: number }> {
  const insertResult = await table_query({
    caller: 'populateEventTypes',
    table: 'tet_event_types',
    query: `INSERT INTO tet_event_types (et_event_type)
            SELECT DISTINCT se_event_type FROM tse_sessions WHERE se_event_type <> ''
            ON CONFLICT (et_event_type) DO NOTHING`,
    params: []
  })
  if (!insertResult.ok) {
    write_logging({ lg_functionname: 'populateEventTypes', lg_caller: 'populateEventTypes', lg_msg: 'Failed to insert missing tet_event_types: ' + insertResult.error, lg_severity: 'E' })
    return { inserted: 0 }
  }
  const countResult = await table_query({
    caller: 'populateEventTypes/count',
    table: 'tet_event_types',
    query: `SELECT COUNT(*)::int AS n FROM tet_event_types`,
    params: []
  })
  if (!countResult.ok) {
    write_logging({ lg_functionname: 'populateEventTypes', lg_caller: 'populateEventTypes/count', lg_msg: 'Failed to count tet_event_types: ' + countResult.error, lg_severity: 'E' })
    return { inserted: 0 }
  }
  return { inserted: countResult.data[0]?.n ?? 0 }
}
