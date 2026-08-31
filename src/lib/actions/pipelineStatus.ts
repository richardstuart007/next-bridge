'use server'

import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

export type StepStatus = { remaining: number }

export type StagingCounts = { ts1_sessions: number; ts2_results: number }

//----------------------------------------------------------------------------------
//  getStagingCounts — raw row counts of ts1_sessions / ts2_results, for the Pipeline
//  Overview's "run in progress" strip: the scrape fills these long before it logs a
//  pipeline step, so they give visible movement while a full "Run All Cron" runs
//----------------------------------------------------------------------------------
export async function getStagingCounts(): Promise<StagingCounts> {
  const queryResult = await table_query({
    caller: 'pipelineStatus/staging',
    table: 'ts1_sessions',
    query: `SELECT
              (SELECT COUNT(*)::int FROM ts1_sessions) AS ts1_sessions,
              (SELECT COUNT(*)::int FROM ts2_results)  AS ts2_results`,
    params: [],
    skipCache: true
  })
  if (!queryResult.ok) {
    write_logging({ lg_functionname: 'getStagingCounts', lg_caller: 'pipelineStatus/staging', lg_msg: 'Failed to read staging counts: ' + queryResult.error, lg_severity: 'E' })
    return { ts1_sessions: 0, ts2_results: 0 }
  }
  const rows = queryResult.data as StagingCounts[]
  const result = rows[0] ?? { ts1_sessions: 0, ts2_results: 0 }
  return result
}

//----------------------------------------------------------------------------------
//  refreshSessionsStatus — ts1_sessions rows not yet built into tse_sessions
//----------------------------------------------------------------------------------
export async function refreshSessionsStatus(): Promise<StepStatus> {
  const queryResult = await table_query({
    caller: 'pipelineStatus/sessions',
    table: 'ts1_sessions',
    query: `SELECT COUNT(*)::int AS remaining FROM ts1_sessions
            WHERE s1_date IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM tse_sessions WHERE se_run_id = s1_run_id)`,
    params: [],
    skipCache: true
  })
  if (!queryResult.ok) {
    write_logging({ lg_functionname: 'refreshSessionsStatus', lg_caller: 'pipelineStatus/sessions', lg_msg: 'Failed to read sessions backlog: ' + queryResult.error, lg_severity: 'E' })
    return { remaining: 0 }
  }
  const rows = queryResult.data as { remaining: number }[]
  return { remaining: rows[0]?.remaining ?? 0 }
}

//----------------------------------------------------------------------------------
//  refreshResultsStatus — tse_sessions rows with no tre_results yet
//----------------------------------------------------------------------------------
export async function refreshResultsStatus(): Promise<StepStatus> {
  const queryResult = await table_query({
    caller: 'pipelineStatus/results',
    table: 'tse_sessions',
    query: `SELECT COUNT(*)::int AS remaining FROM tse_sessions
            WHERE NOT EXISTS (SELECT 1 FROM tre_results WHERE re_seid = se_seid)`,
    params: [],
    skipCache: true
  })
  if (!queryResult.ok) {
    write_logging({ lg_functionname: 'refreshResultsStatus', lg_caller: 'pipelineStatus/results', lg_msg: 'Failed to read results backlog: ' + queryResult.error, lg_severity: 'E' })
    return { remaining: 0 }
  }
  const rows = queryResult.data as { remaining: number }[]
  return { remaining: rows[0]?.remaining ?? 0 }
}

//----------------------------------------------------------------------------------
//  refreshPartnersStatus — distinct ts2_results pairs not yet reflected in tpa_partners
//----------------------------------------------------------------------------------
export async function refreshPartnersStatus(): Promise<StepStatus> {
  const queryResult = await table_query({
    caller: 'pipelineStatus/partners',
    table: 'ts2_results',
    query: `SELECT COUNT(*)::int AS remaining FROM (
              SELECT DISTINCT s2_plid1, s2_plid2 FROM ts2_results
            ) t
            WHERE NOT EXISTS (
              SELECT 1 FROM tpa_partners WHERE pa_plid1 = t.s2_plid1 AND pa_plid2 = t.s2_plid2
            )`,
    params: [],
    skipCache: true
  })
  if (!queryResult.ok) {
    write_logging({ lg_functionname: 'refreshPartnersStatus', lg_caller: 'pipelineStatus/partners', lg_msg: 'Failed to read partners backlog: ' + queryResult.error, lg_severity: 'E' })
    return { remaining: 0 }
  }
  const rows = queryResult.data as { remaining: number }[]
  return { remaining: rows[0]?.remaining ?? 0 }
}
