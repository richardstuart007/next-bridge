'use server'

import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import { logPipelineStep, resolvePipRunId } from '@/src/lib/actions/pipelineLog'
import { MP_PERCENTAGE_MIN, MP_PERCENTAGE_MAX, VP_SCORE_HARD_CAP, UNKNOWN_SCORE_TYPE, XIMP_SCORE_HARD_CAP } from '@/src/lib/constants'

export type BuildSessionsResult = { inserted: number; skipped: number; total: number }
export type BuildResultsResult  = { inserted: number }

//----------------------------------------------------------------------------------
//  buildSessionsFromStaging — ts1_sessions → tse_sessions (skip existing). Optional
//  fromDate/toDate scopes it (e.g. matching the Scrape step that fed it) — an explicit
//  safeguard, not just relying on staging-truncate timing. Both given → BETWEEN; only
//  toDate → date <= toDate (the catch-up "cap"); only fromDate → date >= fromDate;
//  neither → every ts1_sessions row with a date, as before. `group` selects which
//  top-level pipeline step this run belongs to — step 1 (AKBC) or step 2 (Tracked
//  Players) — since this one function logs for both batches. `skipLog` suppresses the
//  tpip_pipelinelog row — the per-day / per-batch cron jobs log one combined row for
//  the whole job instead, so this build shouldn't add its own. se_club_nzb is resolved
//  per row by an EXACT match of the session's club name against tcl_clubs.cl_club (the
//  scrape already trims the name; the parser also collapses internal whitespace). A newly
//  built session whose club has no tcl_clubs row keeps se_club_nzb NULL and gets a 'W'
//  log line naming the club — an exact-match miss means an nzbridge label change or a new
//  club, to be fixed by adding the tcl_clubs row (rare, manual SQL).
//----------------------------------------------------------------------------------
export async function buildSessionsFromStaging(forceNewRun = false, fromDate?: string, toDate?: string, group: 'akbc' | 'tracked' = 'akbc', skipLog = false): Promise<BuildSessionsResult> {
  const t0 = Date.now()
  const step = group === 'akbc' ? 1 : 2
  const run_id = await resolvePipRunId(step, forceNewRun)

  const { dateFilter, dateParams } = dateRangeFilter('s1_date', fromDate, toDate)

  const insertResult = await table_query({
    caller: 'buildSteps/sessions/insert',
    table: 'tse_sessions',
    query: `WITH src AS (
              SELECT s1_run_id, s1_date, s1_score_type, s1_event_name,
                     s1_tournament, s1_event_type, s1_is_summary,
                     CASE s1_club WHEN 'Auckland' THEN 'Remuera Bowls & Bridge Inc' ELSE s1_club END AS club_name
              FROM ts1_sessions
              WHERE s1_date IS NOT NULL${dateFilter}
            )
            INSERT INTO tse_sessions
              (se_run_id, se_date, se_day_of_week, se_scoring, se_name,
               se_club, se_tournament, se_event_type, se_is_summary, se_club_nzb)
            SELECT
              s1_run_id, s1_date, TO_CHAR(s1_date, 'FMDay'),
              CASE WHEN s1_score_type = 'VP' THEN 'VP'
                   WHEN s1_score_type = 'XIMP' THEN 'XIMP'
                   WHEN s1_score_type = '${UNKNOWN_SCORE_TYPE}' THEN '${UNKNOWN_SCORE_TYPE}'
                   ELSE 'MP' END,
              s1_event_name,
              club_name,
              s1_tournament, s1_event_type, s1_is_summary,
              (SELECT c.cl_nzb FROM tcl_clubs c WHERE c.cl_club = src.club_name)
            FROM src
            ORDER BY s1_date, s1_run_id
            ON CONFLICT (se_run_id) DO NOTHING
            RETURNING se_seid, se_club, se_club_nzb`,
    params: dateParams,
    isupdate: true
  })
  if (!insertResult.ok) {
    write_logging({ lg_functionname: 'buildSessionsFromStaging', lg_caller: group, lg_msg: 'Failed to insert tse_sessions from staging: ' + insertResult.error, lg_severity: 'E' })
    return { inserted: 0, skipped: 0, total: 0 }
  }
  const result = insertResult.data as { se_seid: number; se_club: string; se_club_nzb: number | null }[]

  //
  //  Any just-built session whose club name didn't resolve to a tcl_clubs.cl_nzb — log
  //  one 'W' per distinct club so an nzbridge label change / new club is visible rather
  //  than silently sitting at se_club_nzb NULL. Fixed by adding the tcl_clubs row.
  //
  const unmatchedClubs = [...new Set(result.filter(r => r.se_club_nzb === null && r.se_club !== '').map(r => r.se_club))]
  for (const club of unmatchedClubs) {
    await write_logging({
      lg_functionname: 'buildSessionsFromStaging',
      lg_caller: group,
      lg_msg: `se_club_nzb left NULL — club not in tcl_clubs (exact match): "${club}"`,
      lg_severity: 'W'
    })
  }

  const totalResult = await table_query({
    caller: 'buildSteps/sessions/count',
    table: 'ts1_sessions',
    query: `SELECT COUNT(s1_run_id)::int AS n FROM ts1_sessions WHERE s1_date IS NOT NULL${dateFilter}`,
    params: dateParams,
    skipCache: true
  })
  if (!totalResult.ok) {
    write_logging({ lg_functionname: 'buildSessionsFromStaging', lg_caller: group, lg_msg: 'Failed to count ts1_sessions: ' + totalResult.error, lg_severity: 'E' })
  }
  const total = totalResult.ok ? (totalResult.data as { n: number }[]) : []

  const inserted = result.length
  const skipped  = (total[0]?.n ?? 0) - inserted

  if (!skipLog) {
    await logPipelineStep({
      run_id, step, sub_step: 'b', step_name: 'Build Sessions',
      input_table: 'ts1_sessions', input_recs: total[0]?.n ?? 0,
      output_table: 'tse_sessions', output_recs: inserted,
      duration_ms: Date.now() - t0
    })
  }

  return { inserted, skipped, total: total[0]?.n ?? 0 }
}

//----------------------------------------------------------------------------------
//  buildResultsFromStaging — ts2_results → tpa_partners + tre_results. Optional
//  fromDate/toDate scopes it (via the joined tse_sessions.se_date) — same
//  both/to-only/from-only/neither semantics as buildSessionsFromStaging. Same `group`
//  and `skipLog` meaning as buildSessionsFromStaging.
//----------------------------------------------------------------------------------
export async function buildResultsFromStaging(forceNewRun = false, fromDate?: string, toDate?: string, group: 'akbc' | 'tracked' = 'akbc', skipLog = false): Promise<BuildResultsResult> {
  const t0 = Date.now()
  const step = group === 'akbc' ? 1 : 2
  const run_id = await resolvePipRunId(step, forceNewRun)

  const { dateFilter, dateParams } = dateRangeFilter('se_date', fromDate, toDate)

  const partnersResult = await table_query({
    caller: 'buildSteps/results/upsert-partners',
    table: 'tpa_partners',
    query: `INSERT INTO tpa_partners (pa_plid1, pa_plid2)
            SELECT DISTINCT s2_plid1, s2_plid2
            FROM ts2_results
            JOIN tse_sessions ON se_run_id = s2_run_id
            WHERE NOT EXISTS (SELECT 1 FROM tre_results WHERE re_seid = se_seid)${dateFilter}
            ON CONFLICT (pa_plid1, pa_plid2) DO NOTHING`,
    params: dateParams,
    isupdate: true
  })
  if (!partnersResult.ok) {
    write_logging({ lg_functionname: 'buildResultsFromStaging', lg_caller: group, lg_msg: 'Failed to upsert tpa_partners from staging: ' + partnersResult.error, lg_severity: 'E' })
    return { inserted: 0 }
  }

  const insertResult = await table_query({
    caller: 'buildSteps/results/insert',
    table: 'tre_results',
    query: `INSERT INTO tre_results (re_seid, re_paid, re_score)
            SELECT DISTINCT ON (se_seid, pa_paid) se_seid, pa_paid,
              CASE WHEN s1_score_type = 'VP'
                THEN LEAST(${VP_SCORE_HARD_CAP}.0, s2_score_value)
                WHEN s1_score_type = 'XIMP'
                THEN LEAST(${XIMP_SCORE_HARD_CAP}.0, s2_score_value)
                WHEN s1_score_type = '${UNKNOWN_SCORE_TYPE}'
                THEN s2_score_value
                ELSE LEAST(${VP_SCORE_HARD_CAP}.0, GREATEST(${MP_PERCENTAGE_MIN}.0, LEAST(${MP_PERCENTAGE_MAX}.0, s2_score_value)))
              END
            FROM ts2_results
            JOIN tse_sessions ON se_run_id  = s2_run_id
            JOIN ts1_sessions ON s1_run_id  = s2_run_id
            JOIN tpa_partners ON pa_plid1 = s2_plid1 AND pa_plid2 = s2_plid2
            WHERE NOT EXISTS (SELECT 1 FROM tre_results WHERE re_seid = se_seid)${dateFilter}
            RETURNING re_reid`,
    params: dateParams,
    isupdate: true
  })
  if (!insertResult.ok) {
    write_logging({ lg_functionname: 'buildResultsFromStaging', lg_caller: group, lg_msg: 'Failed to insert tre_results from staging: ' + insertResult.error, lg_severity: 'E' })
    return { inserted: 0 }
  }
  const result = insertResult.data as { re_reid: number }[]

  const inserted = result.length

  if (!skipLog) {
    await logPipelineStep({
      run_id, step, sub_step: 'c', step_name: 'Build Results',
      input_table: 'ts2_results', output_table: 'tre_results', output_recs: inserted,
      duration_ms: Date.now() - t0
    })
  }

  return { inserted }
}

//----------------------------------------------------------------------------------
//  dateRangeFilter — the ` AND <column> …` SQL fragment + positional params for an
//  optional from/to window. both → BETWEEN $1 AND $2; toDate only → <= $1; fromDate
//  only → >= $1; neither → '' with no params. `column` is a bare, already-unique
//  column name (s1_date / se_date), never user input.
//----------------------------------------------------------------------------------
function dateRangeFilter(column: string, fromDate?: string, toDate?: string): { dateFilter: string; dateParams: string[] } {
  if (fromDate && toDate) return { dateFilter: ` AND ${column} BETWEEN $1 AND $2`, dateParams: [fromDate, toDate] }
  if (toDate)             return { dateFilter: ` AND ${column} <= $1`,             dateParams: [toDate] }
  if (fromDate)           return { dateFilter: ` AND ${column} >= $1`,             dateParams: [fromDate] }
  return { dateFilter: '', dateParams: [] }
}
