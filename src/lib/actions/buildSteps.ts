'use server'

import { table_query } from 'nextjs-shared/table_query'
import { logPipelineStep, resolvePipRunId } from '@/src/lib/actions/pipelineLog'
import { MP_PERCENTAGE_MIN, MP_PERCENTAGE_MAX, VP_SCORE_HARD_CAP, UNKNOWN_SCORE_TYPE, XIMP_SCORE_HARD_CAP } from '@/src/lib/constants'

export type BuildSessionsResult = { inserted: number; skipped: number; total: number }
export type BuildResultsResult  = { inserted: number }

//----------------------------------------------------------------------------------
//  buildSessionsFromStaging — ts1_sessions → tse_sessions (skip existing). Optional
//  fromDate/toDate scopes it to a date range (e.g. matching the Scrape step that fed
//  it) — an explicit safeguard, not just relying on staging-truncate timing. Omitted,
//  it processes every ts1_sessions row with a date, as before. `group` selects which
//  top-level pipeline step this run belongs to — step 1 (AKBC) or step 2 (Tracked
//  Players) — since this one function logs for both batches.
//----------------------------------------------------------------------------------
export async function buildSessionsFromStaging(forceNewRun = false, fromDate?: string, toDate?: string, group: 'akbc' | 'tracked' = 'akbc'): Promise<BuildSessionsResult> {
  const t0 = Date.now()
  const step = group === 'akbc' ? 1 : 2
  const run_id = await resolvePipRunId(step, forceNewRun)

  const dateFilter = (fromDate && toDate) ? ` AND s1_date BETWEEN $1 AND $2` : ''
  const dateParams = (fromDate && toDate) ? [fromDate, toDate] : []

  const result = await table_query({
    caller: 'buildSteps/sessions/insert',
    query: `INSERT INTO tse_sessions
              (se_run_id, se_date, se_day_of_week, se_scoring, se_name,
               se_club, se_tournament, se_event_type, se_is_summary)
            SELECT
              s1_run_id, s1_date, TO_CHAR(s1_date, 'FMDay'),
              CASE WHEN s1_score_type = 'VP' THEN 'VP'
                   WHEN s1_score_type = 'XIMP' THEN 'XIMP'
                   WHEN s1_score_type = '${UNKNOWN_SCORE_TYPE}' THEN '${UNKNOWN_SCORE_TYPE}'
                   ELSE 'MP' END,
              s1_event_name,
              CASE s1_club WHEN 'Auckland' THEN 'Remuera Bowls & Bridge Inc' ELSE s1_club END,
              s1_tournament, s1_event_type, s1_is_summary
            FROM ts1_sessions
            WHERE s1_date IS NOT NULL${dateFilter}
            ORDER BY s1_date, s1_run_id
            ON CONFLICT (se_run_id) DO NOTHING
            RETURNING se_seid`,
    params: dateParams,
    isupdate: true
  }) as { se_seid: number }[]

  const total = await table_query({
    caller: 'buildSteps/sessions/count',
    query: `SELECT COUNT(s1_run_id)::int AS n FROM ts1_sessions WHERE s1_date IS NOT NULL${dateFilter}`,
    params: dateParams,
    skipCache: true
  }) as { n: number }[]

  const inserted = result.length
  const skipped  = (total[0]?.n ?? 0) - inserted

  await logPipelineStep({
    run_id, step, sub_step: 'b', step_name: 'Build Sessions',
    input_table: 'ts1_sessions', input_recs: total[0]?.n ?? 0,
    output_table: 'tse_sessions', output_recs: inserted,
    duration_ms: Date.now() - t0
  })

  return { inserted, skipped, total: total[0]?.n ?? 0 }
}

//----------------------------------------------------------------------------------
//  buildResultsFromStaging — ts2_results → tpa_partners + tre_results. Optional
//  fromDate/toDate scopes it (via the joined tse_sessions.se_date) to a date range —
//  same explicit-safeguard reasoning as buildSessionsFromStaging. Same `group` meaning
//  as buildSessionsFromStaging.
//----------------------------------------------------------------------------------
export async function buildResultsFromStaging(forceNewRun = false, fromDate?: string, toDate?: string, group: 'akbc' | 'tracked' = 'akbc'): Promise<BuildResultsResult> {
  const t0 = Date.now()
  const step = group === 'akbc' ? 1 : 2
  const run_id = await resolvePipRunId(step, forceNewRun)

  const dateFilter = (fromDate && toDate) ? ` AND se_date BETWEEN $1 AND $2` : ''
  const dateParams = (fromDate && toDate) ? [fromDate, toDate] : []

  await table_query({
    caller: 'buildSteps/results/upsert-partners',
    query: `INSERT INTO tpa_partners (pa_plid1, pa_plid2)
            SELECT DISTINCT s2_plid1, s2_plid2
            FROM ts2_results
            JOIN tse_sessions ON se_run_id = s2_run_id
            WHERE NOT EXISTS (SELECT 1 FROM tre_results WHERE re_seid = se_seid)${dateFilter}
            ON CONFLICT (pa_plid1, pa_plid2) DO NOTHING`,
    params: dateParams,
    isupdate: true
  })

  const result = await table_query({
    caller: 'buildSteps/results/insert',
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
  }) as { re_reid: number }[]

  const inserted = result.length

  await logPipelineStep({
    run_id, step, sub_step: 'c', step_name: 'Build Results',
    input_table: 'ts2_results', output_table: 'tre_results', output_recs: inserted,
    duration_ms: Date.now() - t0
  })

  return { inserted }
}
