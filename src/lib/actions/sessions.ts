'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_update } from 'nextjs-shared/table_update'
import { table_count } from 'nextjs-shared/table_count'
import { table_query } from 'nextjs-shared/table_query'

const SESSIONS_TABLE = 'tse_sessions'
const HEADERS_TABLE  = 'tsh_session_header'

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
    query: `SELECT se_source_id FROM tse_sessions WHERE se_source_id IN (${ph}) AND se_scoring = 'IMP'`,
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

export async function updateSessionDateSeq(): Promise<number> {
  const result = await table_query({
    caller: 'updateSessionDateSeq',
    query: `
      WITH ranked AS (
        SELECT se_seid, ROW_NUMBER() OVER (PARTITION BY se_date ORDER BY se_seid ASC) AS seq
        FROM tse_sessions
      )
      UPDATE tse_sessions s
      SET se_date_seq = r.seq
      FROM ranked r
      WHERE s.se_seid = r.se_seid
      RETURNING s.se_seid
    `,
    params: []
  })
  return Array.isArray(result) ? result.length : 0
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

export async function updateSessionStatus(seid: number, status: string): Promise<void> {
  await table_update({
    caller: 'updateSessionStatus',
    table: SESSIONS_TABLE,
    columnValuePairs: [{ column: 'se_status', value: status }],
    whereColumnValuePairs: [{ column: 'se_seid', value: seid }]
  })
}

// ── Session header (tsh_session_header) ────────────────────────────────────

export interface SessionHeaderRow {
  sh_shid: number
  sh_headevent_id: number
  sh_name: string
  sh_date: string | null
  sh_year: number
  session_count: number
  processed_count: number
}

export async function getSessionHeaders(year: number): Promise<SessionHeaderRow[]> {
  return table_query({
    caller: 'getSessionHeaders',
    query: `
      SELECT h.sh_shid, h.sh_headevent_id, h.sh_name, h.sh_date::text, h.sh_year,
             COUNT(s.se_seid)::int                                              AS session_count,
             COUNT(s.se_seid) FILTER (WHERE s.se_status = 'processed')::int    AS processed_count
      FROM tsh_session_header h
      LEFT JOIN tse_sessions s ON s.se_shid = h.sh_shid
      WHERE h.sh_year = $1
      GROUP BY h.sh_shid
      ORDER BY h.sh_date DESC NULLS LAST, h.sh_shid DESC
    `,
    params: [year]
  }) as Promise<SessionHeaderRow[]>
}

export async function getSessionsForHeader(shid: number) {
  return table_query({
    caller: 'getSessionsForHeader',
    query: `SELECT se_seid, se_source_id, se_date::text, se_day_of_week, se_scoring,
                   se_status, se_name, se_session_type
            FROM tse_sessions WHERE se_shid = $1 ORDER BY se_date, se_seid`,
    params: [shid]
  })
}

/** Clears results/raw/log for all sessions under a header and resets their status. Returns seids. */
export async function resetSessionsForHeader(shid: number): Promise<number[]> {
  const rows = await table_query({
    caller: 'resetSessionsForHeader/fetch',
    query: `SELECT se_seid FROM tse_sessions WHERE se_shid = $1`,
    params: [shid]
  })
  const seids = (rows as { se_seid: number }[]).map(r => r.se_seid)
  if (seids.length === 0) return []
  const ph = seids.map((_, i) => `$${i + 1}`).join(', ')
  await table_query({ caller: 'resetSessionsForHeader', query: `DELETE FROM tre_results     WHERE re_seid IN (${ph})`, params: seids })
  await table_query({ caller: 'resetSessionsForHeader', query: `DELETE FROM trw_results_raw WHERE rw_seid IN (${ph})`, params: seids })
  await table_query({ caller: 'resetSessionsForHeader', query: `UPDATE tse_sessions SET se_status = 'new' WHERE se_seid IN (${ph})`, params: seids })
  return seids
}

/** Upsert session headers. Returns a map of headeventId → sh_shid. */
export async function upsertSessionHeaders(
  headers: Array<{ headeventId: number; label: string; date: string; year: number }>
): Promise<Map<number, number>> {
  if (headers.length === 0) return new Map()

  const ids = headers.map(h => h.headeventId)
  const ph = ids.map((_, i) => `$${i + 1}`).join(', ')
  const existing = await table_query({
    caller: 'upsertSessionHeaders/check',
    query: `SELECT sh_headevent_id, sh_shid FROM ${HEADERS_TABLE} WHERE sh_headevent_id IN (${ph})`,
    params: ids
  })
  const resultMap = new Map<number, number>(
    (existing as { sh_headevent_id: number; sh_shid: number }[]).map(r => [r.sh_headevent_id, r.sh_shid])
  )

  const newHeaders = headers.filter(h => !resultMap.has(h.headeventId))
  if (newHeaders.length > 0) {
    const values = newHeaders.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(', ')
    const params = newHeaders.flatMap(h => [h.headeventId, h.label, h.date || null, h.year])
    await table_query({
      caller: 'upsertSessionHeaders/insert',
      query: `INSERT INTO ${HEADERS_TABLE} (sh_headevent_id, sh_name, sh_date, sh_year) VALUES ${values} RETURNING sh_headevent_id, sh_shid`,
      params
    }).then((inserted: any[]) => {
      inserted.forEach(r => resultMap.set(r.sh_headevent_id, r.sh_shid))
    })
  }

  // Update names/dates for existing headers when they have content (refresh from AKBC fills them in)
  for (const h of headers) {
    if (resultMap.has(h.headeventId) && h.label) {
      await table_query({
        caller: 'upsertSessionHeaders/update',
        query: `UPDATE ${HEADERS_TABLE} SET sh_name = $2, sh_date = $3 WHERE sh_headevent_id = $1 AND sh_name = ''`,
        params: [h.headeventId, h.label, h.date || null]
      })
    }
  }

  return resultMap
}

export async function upsertCatalogueSessions(
  sessions: Array<{ sourceId: number; label: string; date: string; dayOfWeek: string; isTeams?: boolean; headeventId?: number }>,
  headerMap: Map<number, number> = new Map()
): Promise<number> {
  if (sessions.length === 0) return 0

  const sourceIds = sessions.map(s => s.sourceId)
  const ph = sourceIds.map((_, i) => `$${i + 1}`).join(', ')
  const existing = await table_query({
    caller: 'upsertCatalogueSessions/check',
    query: `SELECT se_source_id FROM tse_sessions WHERE se_source_id IN (${ph})`,
    params: sourceIds
  })
  const existingSet = new Set((existing as { se_source_id: number }[]).map(r => r.se_source_id))
  const newSessions = sessions.filter(s => !existingSet.has(s.sourceId))
  if (newSessions.length === 0) return 0

  const values = newSessions.map((s, i) => {
    const scoring = s.isTeams ? 'IMP' : 'MP'
    const sessionType = s.isTeams ? 'teams' : 'club'
    const shid = headerMap.get(s.headeventId ?? 0) ?? 0
    return `($${i * 5 + 1}, $${i * 5 + 2}, '${scoring}', $${i * 5 + 3}, 'new', '${sessionType}', $${i * 5 + 4}, $${i * 5 + 5}, ${shid})`
  }).join(', ')
  const params = newSessions.flatMap(s => [s.date, s.dayOfWeek, s.sourceId, s.label, s.headeventId ?? 0])
  await table_query({
    caller: 'upsertCatalogueSessions/insert',
    query: `INSERT INTO tse_sessions (se_date, se_day_of_week, se_scoring, se_source_id, se_status, se_session_type, se_name, se_headevent_id, se_shid) VALUES ${values}`,
    params
  })
  return newSessions.length
}

// ── Legacy catalogue query (used by Stage 2 fetch-results display) ──────────

export interface SessionCatalogueEntry {
  se_seid: number
  se_source_id: number
  se_date: string
  se_day_of_week: string
  se_scoring: string
  se_status: string
  se_name: string
}

export async function getSessionCatalogueForYear(year: number): Promise<SessionCatalogueEntry[]> {
  return table_query({
    caller: 'getSessionCatalogueForYear',
    query: `SELECT se_seid, se_source_id, se_date::text, se_day_of_week, se_scoring, se_status, se_name
            FROM tse_sessions
            WHERE EXTRACT(YEAR FROM se_date) = $1
            ORDER BY se_date DESC`,
    params: [year]
  }) as Promise<SessionCatalogueEntry[]>
}
