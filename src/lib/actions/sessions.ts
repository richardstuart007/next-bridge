'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_update } from 'nextjs-shared/table_update'
import { table_count } from 'nextjs-shared/table_count'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalPages } from 'nextjs-shared/fetchTotalPages'
import type { Filter } from 'nextjs-shared/structures'

const SESSIONS_TABLE = 'tse_sessions'

export type SessionFilters = {
  dateFrom?:         string
  days?:             string[]
  scoring?:          string[]
  name?:             string
  runId?:            string
  clubs?:            string[]
  eventTypes?:       string[]
  summaryTypes?:     string[]
  tournamentTypes?:  string[]
}

export type SessionListRow = {
  se_seid:         number
  se_run_id:       number
  se_date:         string
  se_day_of_week:  string
  se_scoring:      string
  se_name:         string
  se_tournament:   string
  se_club:         string
  se_event_type:   string
  se_is_summary:   boolean | null
}

//----------------------------------------------------------------------------------
//  buildSessionFilters — SessionFilters → Filter[] for fetchFiltered/fetchTotalPages.
//  `column` is passed straight into the generated SQL, so a raw expression (e.g.
//  RIGHT(se_tournament, 1)) works the same as a plain column name — used here for the
//  tournament-type filter (derived from se_tournament's last character) and the boolean
//  se_is_summary column (cast to text, since Filter.value doesn't accept boolean).
//----------------------------------------------------------------------------------
function buildSessionFilters(f: SessionFilters): Filter[] {
  const result: Filter[] = []
  if (f.dateFrom) result.push({ column: 'se_date', operator: '>=', value: f.dateFrom })
  if (f.days && f.days.length > 0)
    result.push({ column: 'se_day_of_week', operator: 'IN', value: f.days })
  if (f.scoring && f.scoring.length > 0)
    result.push({ column: 'se_scoring', operator: 'IN', value: f.scoring })
  if (f.name)    result.push({ column: 'se_name', operator: 'LIKE', value: f.name })
  if (f.runId)   result.push({ column: 'se_run_id::text', operator: 'LIKE', value: f.runId })
  if (f.clubs && f.clubs.length > 0)
    result.push({ column: 'se_club', operator: 'IN', value: f.clubs })
  if (f.eventTypes && f.eventTypes.length > 0)
    result.push({ column: 'se_event_type', operator: 'IN', value: f.eventTypes })
  if (f.summaryTypes?.length === 1) {
    if (f.summaryTypes[0] === 'Summary') result.push({ column: 'se_is_summary::text', operator: '=',  value: 'true' })
    else                                 result.push({ column: 'se_is_summary::text', operator: '<>', value: 'true' })
  }
  if (f.tournamentTypes && f.tournamentTypes.length > 0)
    result.push({ column: 'RIGHT(se_tournament, 1)', operator: 'IN', value: f.tournamentTypes })
  return result
}

//----------------------------------------------------------------------------------
//  getSessionsPaged — real server-side pagination for the Home page's Sessions tab.
//  Returns only the current page's rows plus the total page count for the same filter
//  set, instead of loading the whole table client-side (see docs/PLAN_production-data-
//  errors.md item 3).
//----------------------------------------------------------------------------------
export async function getSessionsPaged(
  page: number,
  itemsPerPage: number,
  filters: SessionFilters = {}
): Promise<{ rows: SessionListRow[]; totalPages: number }> {
  const filterArray = buildSessionFilters(filters)
  const offset = (page - 1) * itemsPerPage

  const [rowsResult, pagesResult] = await Promise.all([
    fetchFiltered({
      table: SESSIONS_TABLE,
      filters: filterArray,
      orderBy: 'se_date DESC',
      limit: itemsPerPage,
      offset,
      caller: 'getSessionsPaged'
    }),
    fetchTotalPages({
      table: SESSIONS_TABLE,
      filters: filterArray,
      items_per_page: itemsPerPage,
      caller: 'getSessionsPaged'
    })
  ])

  if (!rowsResult.ok || !pagesResult.ok) {
    write_logging({ lg_functionname: 'getSessionsPaged', lg_caller: 'getSessionsPaged', lg_msg: 'Failed to page tse_sessions: ' + (rowsResult.error ?? pagesResult.error), lg_severity: 'E' })
    return { rows: [], totalPages: 0 }
  }

  return { rows: rowsResult.data as SessionListRow[], totalPages: pagesResult.data }
}

//----------------------------------------------------------------------------------
//  getRecentSessions — the most recent sessions by se_date DESC, capped at `limit`
//  (default 500)
//----------------------------------------------------------------------------------
export async function getRecentSessions(limit: number = 500) {
  const result = await table_fetch({
    caller: 'getRecentSessions',
    table: SESSIONS_TABLE,
    orderBy: 'se_date DESC',
    limit
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getRecentSessions', lg_caller: 'getRecentSessions', lg_msg: 'Failed to fetch recent sessions: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  getSessionsByYear — every session for the given calendar year (se_date DESC), or
//  every session when year is null
//----------------------------------------------------------------------------------
export async function getSessionsByYear(year: number | null) {
  const result = await table_query({
    caller: 'getSessionsByYear',
    table: 'tse_sessions',
    query: year
      ? `SELECT * FROM ${SESSIONS_TABLE} WHERE EXTRACT(YEAR FROM se_date) = $1 ORDER BY se_date DESC`
      : `SELECT * FROM ${SESSIONS_TABLE} ORDER BY se_date DESC`,
    params: year ? [year] : []
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getSessionsByYear', lg_caller: 'getSessionsByYear', lg_msg: 'Failed to fetch sessions by year: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  getSessionById — the tse_sessions row for se_seid, or null
//----------------------------------------------------------------------------------
export async function getSessionById(seId: number) {
  const result = await table_fetch({
    caller: 'getSessionById',
    table: SESSIONS_TABLE,
    whereColumnValuePairs: [{ column: 'se_seid', value: seId }]
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getSessionById', lg_caller: 'getSessionById', lg_msg: 'Failed to fetch session by seid: ' + result.error, lg_severity: 'E' })
    return null
  }
  return result.data[0] ?? null
}

//----------------------------------------------------------------------------------
//  sessionExistsByRunId — true when a tse_sessions row exists for se_run_id
//----------------------------------------------------------------------------------
export async function sessionExistsByRunId(seRunId: number): Promise<boolean> {
  const result = await table_count({
    caller: 'sessionExistsByRunId',
    table: SESSIONS_TABLE,
    whereColumnValuePairs: [{ column: 'se_run_id', value: seRunId }]
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'sessionExistsByRunId', lg_caller: 'sessionExistsByRunId', lg_msg: 'Failed to count session by run_id: ' + result.error, lg_severity: 'E' })
    return false
  }
  return result.data > 0
}

//----------------------------------------------------------------------------------
//  getSkippedRunIds — the subset of runIds whose tse_sessions row has se_scoring
//  'VP' (i.e. was skipped as a VP session), as a Set
//----------------------------------------------------------------------------------
export async function getSkippedRunIds(runIds: number[]): Promise<Set<number>> {
  if (runIds.length === 0) return new Set()
  const ph = runIds.map((_, i) => `$${i + 1}`).join(', ')
  const result = await table_query({
    caller: 'getSkippedRunIds',
    table: 'tse_sessions',
    query: `SELECT se_run_id FROM tse_sessions WHERE se_run_id IN (${ph}) AND se_scoring = 'VP'`,
    params: runIds
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getSkippedRunIds', lg_caller: 'getSkippedRunIds', lg_msg: 'Failed to fetch skipped run_ids: ' + result.error, lg_severity: 'E' })
    return new Set()
  }
  return new Set(result.data.map((r: any) => r.se_run_id))
}

//----------------------------------------------------------------------------------
//  getImportedRunIds — the subset of runIds that already have a tse_sessions row,
//  as a Set
//----------------------------------------------------------------------------------
export async function getImportedRunIds(runIds: number[]): Promise<Set<number>> {
  if (runIds.length === 0) return new Set()
  const result = await table_fetch({
    caller: 'getImportedRunIds',
    table: SESSIONS_TABLE,
    whereColumnValuePairs: [{ column: 'se_run_id', value: runIds, operator: 'IN' }],
    columns: ['se_run_id']
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getImportedRunIds', lg_caller: 'getImportedRunIds', lg_msg: 'Failed to fetch imported run_ids: ' + result.error, lg_severity: 'E' })
    return new Set()
  }
  return new Set(result.data.map((r: any) => r.se_run_id))
}

//----------------------------------------------------------------------------------
//  getSessionByRunId — the tse_sessions row for se_run_id, or null
//----------------------------------------------------------------------------------
export async function getSessionByRunId(seRunId: number) {
  const result = await table_fetch({
    caller: 'getSessionByRunId',
    table: SESSIONS_TABLE,
    whereColumnValuePairs: [{ column: 'se_run_id', value: seRunId }]
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getSessionByRunId', lg_caller: 'getSessionByRunId', lg_msg: 'Failed to fetch session by run_id: ' + result.error, lg_severity: 'E' })
    return null
  }
  return result.data[0] ?? null
}


const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

//----------------------------------------------------------------------------------
//  fixUnknownDays — recomputes se_day_of_week from se_date for every session
//  currently marked 'Unknown'; returns how many rows were updated
//----------------------------------------------------------------------------------
export async function fixUnknownDays(): Promise<number> {
  const result = await table_fetch({
    caller: 'fixUnknownDays',
    table: SESSIONS_TABLE,
    whereColumnValuePairs: [{ column: 'se_day_of_week', value: 'Unknown' }],
    columns: ['se_seid', 'se_date']
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'fixUnknownDays', lg_caller: 'fixUnknownDays', lg_msg: 'Failed to fetch Unknown-day sessions: ' + result.error, lg_severity: 'E' })
    return 0
  }
  const rows = result.data
  for (const row of rows) {
    const dayName = DAY_NAMES[new Date(row.se_date).getUTCDay()]
    const updateResult = await table_update({
      caller: 'fixUnknownDays',
      table: SESSIONS_TABLE,
      columnValuePairs: [{ column: 'se_day_of_week', value: dayName }],
      whereColumnValuePairs: [{ column: 'se_seid', value: row.se_seid }]
    })
    if (!updateResult.ok) {
      write_logging({ lg_functionname: 'fixUnknownDays', lg_caller: 'fixUnknownDays', lg_msg: `Failed to update se_day_of_week for se_seid ${row.se_seid}: ` + updateResult.error, lg_severity: 'E' })
    }
  }
  return rows.length
}

//----------------------------------------------------------------------------------
//  sessionCount — total row count of tse_sessions
//----------------------------------------------------------------------------------
export async function sessionCount(): Promise<number> {
  const result = await table_count({ table: SESSIONS_TABLE, caller: 'sessionCount' })
  if (!result.ok) {
    write_logging({ lg_functionname: 'sessionCount', lg_caller: 'sessionCount', lg_msg: 'Failed to count tse_sessions: ' + result.error, lg_severity: 'E' })
    return 0
  }
  return result.data
}


export interface SessionCatalogueEntry {
  se_seid: number
  se_run_id: number
  se_date: string
  se_day_of_week: string
  se_scoring: string
  se_name: string
}

//----------------------------------------------------------------------------------
//  getSessionCatalogueForYear — a lightweight session catalogue (seid, run_id,
//  date, day, scoring, name) for one calendar year, se_date DESC
//----------------------------------------------------------------------------------
export async function getSessionCatalogueForYear(year: number): Promise<SessionCatalogueEntry[]> {
  const result = await table_query({
    caller: 'getSessionCatalogueForYear',
    table: 'tse_sessions',
    query: `SELECT se_seid, se_run_id, se_date::text, se_day_of_week, se_scoring, se_name
            FROM tse_sessions
            WHERE EXTRACT(YEAR FROM se_date) = $1
            ORDER BY se_date DESC`,
    params: [year]
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getSessionCatalogueForYear', lg_caller: 'getSessionCatalogueForYear', lg_msg: 'Failed to fetch session catalogue: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data as SessionCatalogueEntry[]
}
