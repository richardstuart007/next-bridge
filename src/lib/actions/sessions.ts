'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_update } from 'nextjs-shared/table_update'
import { table_count } from 'nextjs-shared/table_count'
import { table_query } from 'nextjs-shared/table_query'

const SESSIONS_TABLE = 'tse_sessions'

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

export async function sessionExistsBySourceId(seSourceId: number): Promise<boolean> {
  const count = await table_count({
    caller: 'sessionExistsBySourceId',
    table: SESSIONS_TABLE,
    whereColumnValuePairs: [{ column: 'se_source_id', value: seSourceId }]
  })
  return count > 0
}

export async function getSkippedSourceIds(sourceIds: number[]): Promise<Set<number>> {
  if (sourceIds.length === 0) return new Set()
  const ph = sourceIds.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await table_query({
    caller: 'getSkippedSourceIds',
    query: `SELECT se_source_id FROM tse_sessions WHERE se_source_id IN (${ph}) AND se_scoring = 'VP'`,
    params: sourceIds
  })
  return new Set(rows.map((r: any) => r.se_source_id))
}

export async function getImportedSourceIds(sourceIds: number[]): Promise<Set<number>> {
  if (sourceIds.length === 0) return new Set()
  const rows = await table_fetch({
    caller: 'getImportedSourceIds',
    table: SESSIONS_TABLE,
    whereColumnValuePairs: [{ column: 'se_source_id', value: sourceIds, operator: 'IN' }],
    columns: ['se_source_id']
  })
  return new Set(rows.map((r: any) => r.se_source_id))
}

export async function getSessionBySourceId(seSourceId: number) {
  const rows = await table_fetch({
    caller: 'getSessionBySourceId',
    table: SESSIONS_TABLE,
    whereColumnValuePairs: [{ column: 'se_source_id', value: seSourceId }]
  })
  return rows[0] ?? null
}

export async function insertSession(data: {
  date: string
  day_of_week: string
  session_type: string
  scoring: string
  source_id: number
}) {
  return table_write({
    caller: 'insertSession',
    table: SESSIONS_TABLE,
    columnValuePairs: [
      { column: 'se_date',         value: data.date },
      { column: 'se_day_of_week',  value: data.day_of_week },
      { column: 'se_session_type', value: data.session_type },
      { column: 'se_scoring',      value: data.scoring },
      { column: 'se_source_id',    value: data.source_id }
    ]
  })
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
  se_source_id: number
  se_date: string
  se_day_of_week: string
  se_scoring: string
  se_name: string
}

export async function getSessionCatalogueForYear(year: number): Promise<SessionCatalogueEntry[]> {
  return table_query({
    caller: 'getSessionCatalogueForYear',
    query: `SELECT se_seid, se_source_id, se_date::text, se_day_of_week, se_scoring, se_name
            FROM tse_sessions
            WHERE EXTRACT(YEAR FROM se_date) = $1
            ORDER BY se_date DESC`,
    params: [year]
  }) as Promise<SessionCatalogueEntry[]>
}
