'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_update } from 'nextjs-shared/table_update'
import { table_count } from 'nextjs-shared/table_count'
import { table_query } from 'nextjs-shared/table_query'
import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalPages } from 'nextjs-shared/fetchTotalPages'
import type { Filter } from 'nextjs-shared/structures'

const SESSIONS_TABLE = 'tse_sessions'

export type SessionFilters = {
  dateFrom?:         string
  dateTo?:           string
  days?:             string[]
  scoring?:          string[]
  name?:             string
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
  if (f.dateTo)   result.push({ column: 'se_date', operator: '<=', value: f.dateTo })
  if (f.days && f.days.length > 0)
    result.push({ column: 'se_day_of_week', operator: 'IN', value: f.days })
  if (f.scoring && f.scoring.length > 0)
    result.push({ column: 'se_scoring', operator: 'IN', value: f.scoring })
  if (f.name)    result.push({ column: 'se_name', operator: 'LIKE', value: f.name })
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

  const [rows, totalPages] = await Promise.all([
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

  return { rows: rows as SessionListRow[], totalPages }
}

export async function getRecentSessions(limit: number = 500) {
  return table_fetch({
    caller: 'getRecentSessions',
    table: SESSIONS_TABLE,
    orderBy: 'se_date DESC',
    limit
  })
}

export async function getSessionsByYear(year: number | null) {
  return table_query({
    caller: 'getSessionsByYear',
    query: year
      ? `SELECT * FROM ${SESSIONS_TABLE} WHERE EXTRACT(YEAR FROM se_date) = $1 ORDER BY se_date DESC`
      : `SELECT * FROM ${SESSIONS_TABLE} ORDER BY se_date DESC`,
    params: year ? [year] : []
  })
}

export async function getSessionById(seId: number) {
  const rows = await table_fetch({
    caller: 'getSessionById',
    table: SESSIONS_TABLE,
    whereColumnValuePairs: [{ column: 'se_seid', value: seId }]
  })
  return rows[0] ?? null
}

export async function sessionExistsByRunId(seRunId: number): Promise<boolean> {
  const count = await table_count({
    caller: 'sessionExistsByRunId',
    table: SESSIONS_TABLE,
    whereColumnValuePairs: [{ column: 'se_run_id', value: seRunId }]
  })
  return count > 0
}

export async function getSkippedRunIds(runIds: number[]): Promise<Set<number>> {
  if (runIds.length === 0) return new Set()
  const ph = runIds.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await table_query({
    caller: 'getSkippedRunIds',
    query: `SELECT se_run_id FROM tse_sessions WHERE se_run_id IN (${ph}) AND se_scoring = 'VP'`,
    params: runIds
  })
  return new Set(rows.map((r: any) => r.se_run_id))
}

export async function getImportedRunIds(runIds: number[]): Promise<Set<number>> {
  if (runIds.length === 0) return new Set()
  const rows = await table_fetch({
    caller: 'getImportedRunIds',
    table: SESSIONS_TABLE,
    whereColumnValuePairs: [{ column: 'se_run_id', value: runIds, operator: 'IN' }],
    columns: ['se_run_id']
  })
  return new Set(rows.map((r: any) => r.se_run_id))
}

export async function getSessionByRunId(seRunId: number) {
  const rows = await table_fetch({
    caller: 'getSessionByRunId',
    table: SESSIONS_TABLE,
    whereColumnValuePairs: [{ column: 'se_run_id', value: seRunId }]
  })
  return rows[0] ?? null
}


const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function fixUnknownDays(): Promise<number> {
  const rows = await table_fetch({
    caller: 'fixUnknownDays',
    table: SESSIONS_TABLE,
    whereColumnValuePairs: [{ column: 'se_day_of_week', value: 'Unknown' }],
    columns: ['se_seid', 'se_date']
  })
  for (const row of rows) {
    const dayName = DAY_NAMES[new Date(row.se_date).getUTCDay()]
    await table_update({
      caller: 'fixUnknownDays',
      table: SESSIONS_TABLE,
      columnValuePairs: [{ column: 'se_day_of_week', value: dayName }],
      whereColumnValuePairs: [{ column: 'se_seid', value: row.se_seid }]
    })
  }
  return rows.length
}

export async function sessionCount(): Promise<number> {
  return table_count({ table: SESSIONS_TABLE, caller: 'sessionCount' })
}


export interface SessionCatalogueEntry {
  se_seid: number
  se_run_id: number
  se_date: string
  se_day_of_week: string
  se_scoring: string
  se_name: string
}

export async function getSessionCatalogueForYear(year: number): Promise<SessionCatalogueEntry[]> {
  return table_query({
    caller: 'getSessionCatalogueForYear',
    query: `SELECT se_seid, se_run_id, se_date::text, se_day_of_week, se_scoring, se_name
            FROM tse_sessions
            WHERE EXTRACT(YEAR FROM se_date) = $1
            ORDER BY se_date DESC`,
    params: [year]
  }) as Promise<SessionCatalogueEntry[]>
}
