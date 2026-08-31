'use server'

import { table_query } from 'nextjs-shared/table_query'
import { table_write } from 'nextjs-shared/table_write'
import { table_truncate } from 'nextjs-shared/table_truncate'
import { write_logging } from 'nextjs-shared/write_logging'
import { PIPELINE_RECENT_RUN_IDS_LIMIT } from '@/src/lib/constants'

export type PipelineStatus = {
  pip_pipid:        number
  pip_run_id:       number
  pip_step:         number
  pip_batch:        number
  pip_sub_step:     string | null
  pip_sub_sub:      string | null
  pip_step_name:    string
  pip_input_table:  string | null
  pip_input_recs:   number
  pip_output_table: string | null
  pip_output_recs:  number
  pip_duration_ms:  number
  pip_created:      string
  pip_to_date:      string | Date | null
}

//----------------------------------------------------------------------------------
//  resolvePipRunId — allocates the run_id shared by every step in one coordinated run.
//  Only a forced new run (the one genuine "start" of a run — Scrape AKBC) takes
//  MAX(pip_run_id)+1; every other step reuses the current max, so a client-sequenced
//  "Run All" groups under one run_id. (Do not key this off `step === 1` — step 1 now
//  covers 3 sub-steps of the AKBC group, and each would otherwise grab its own fresh
//  run_id instead of sharing one.)
//----------------------------------------------------------------------------------
export async function resolvePipRunId(step: number, forceNewRun: boolean): Promise<number> {
  if (forceNewRun) {
    const newResult = await table_query({
      caller: 'pipelineLog/resolvePipRunId/new',
      table: 'tpip_pipelinelog',
      query:  `SELECT COALESCE(MAX(pip_run_id), 0) + 1 AS next_run_id FROM tpip_pipelinelog`,
      params: [],
      skipCache: true
    })
    if (!newResult.ok) {
      write_logging({ lg_functionname: 'resolvePipRunId', lg_caller: 'pipelineLog/resolvePipRunId/new', lg_msg: 'Failed to allocate new pip_run_id: ' + newResult.error, lg_severity: 'E' })
      throw new Error('resolvePipRunId: failed to allocate new run_id: ' + newResult.error)
    }
    const newRows = newResult.data as { next_run_id: number }[]
    return newRows[0].next_run_id
  }

  const currentResult = await table_query({
    caller: 'pipelineLog/resolvePipRunId/current',
    table: 'tpip_pipelinelog',
    query:  `SELECT COALESCE(MAX(pip_run_id), 1) AS run_id FROM tpip_pipelinelog`,
    params: [],
    skipCache: true
  })
  if (!currentResult.ok) {
    write_logging({ lg_functionname: 'resolvePipRunId', lg_caller: 'pipelineLog/resolvePipRunId/current', lg_msg: 'Failed to read current pip_run_id: ' + currentResult.error, lg_severity: 'E' })
    throw new Error('resolvePipRunId: failed to read current run_id: ' + currentResult.error)
  }
  const currentRows = currentResult.data as { run_id: number }[]
  return currentRows[0].run_id
}

//----------------------------------------------------------------------------------
//  logPipelineStep — writes a single completion row once a step has finished running.
//  `batch` is the AKBC / Tracked batch number and is always 1-indexed; an omitted
//  `batch` defaults to 1 (steps 0/3/4/5 carry no URL batch param but still log
//  pip_batch = 1). pip_batch = 0 only ever appears on pre-Phase-13 backfilled rows.
//  `sub_step` is only set where it names a real sub-step that aligns with `step_name`
//  — the stats groups (a/b/c/d ↔ Group A/B/C/All); it's NULL for steps 0/1/2/3.
//  `to_date` is the run's process-nothing-past cap and is only ever set on the step-0
//  "Start Run" row.
//----------------------------------------------------------------------------------
export async function logPipelineStep(args: {
  run_id:        number
  step:          number
  batch?:        number
  sub_step?:     string
  sub_sub?:      string
  step_name:     string
  input_table?:  string
  input_recs?:   number
  output_table?: string
  output_recs?:  number
  duration_ms:   number
  to_date?:      string
}): Promise<void> {
  const writeResult = await table_write({
    caller: 'pipelineLog/logPipelineStep',
    table: 'tpip_pipelinelog',
    columnValuePairs: [
      { column: 'pip_run_id',       value: args.run_id },
      { column: 'pip_step',         value: args.step },
      { column: 'pip_batch',        value: args.batch ?? 1 },
      { column: 'pip_sub_step',     value: args.sub_step ?? null },
      { column: 'pip_sub_sub',      value: args.sub_sub ?? null },
      { column: 'pip_step_name',    value: args.step_name },
      { column: 'pip_input_table',  value: args.input_table ?? null },
      { column: 'pip_input_recs',   value: args.input_recs ?? 0 },
      { column: 'pip_output_table', value: args.output_table ?? null },
      { column: 'pip_output_recs',  value: args.output_recs ?? 0 },
      { column: 'pip_duration_ms',  value: args.duration_ms },
      { column: 'pip_to_date',      value: args.to_date ?? null },
    ]
  })
  if (!writeResult.ok) {
    write_logging({ lg_functionname: 'logPipelineStep', lg_caller: 'pipelineLog/logPipelineStep', lg_msg: `Failed to log pipeline step ${args.step}/${args.step_name}: ` + writeResult.error, lg_severity: 'E' })
  }
}

//----------------------------------------------------------------------------------
//  startPipelineRun — allocates a fresh pip_run_id (MAX+1) and writes the step-0
//  "Start Run" marker row that every later step of this run reuses via
//  resolvePipRunId(step, false). This is the only place a new run is created.
//  `toDate` (ISO YYYY-MM-DD) is the run's process-nothing-past cap, recorded on this
//  step-0 row only. `truncateStaging` clears ts1_sessions/ts2_results as part of
//  step 0 — used by the self-contained per-day / per-batch scrape cron routes so each
//  invocation starts from clean staging. Returns the new run_id.
//----------------------------------------------------------------------------------
export async function startPipelineRun(toDate?: string, truncateStaging = false): Promise<{ run_id: number }> {
  const t0 = Date.now()
  const run_id = await resolvePipRunId(0, true)
  if (truncateStaging) {
    const t1 = await table_truncate('ts1_sessions', 'pipelineLog/startPipelineRun-truncate-ts1')
    const t2 = await table_truncate('ts2_results',  'pipelineLog/startPipelineRun-truncate-ts2')
    if (!t1.ok || !t2.ok) {
      write_logging({ lg_functionname: 'startPipelineRun', lg_caller: 'pipelineLog/startPipelineRun', lg_msg: 'Failed to truncate staging tables: ' + (t1.error ?? t2.error), lg_severity: 'E' })
    }
  }
  await logPipelineStep({
    run_id, step: 0, step_name: 'Start Run',
    duration_ms: Date.now() - t0,
    to_date: toDate
  })
  const result = { run_id }
  return result
}

//----------------------------------------------------------------------------------
//  getRecentRunIds — last 5 distinct run_ids, most recent first
//----------------------------------------------------------------------------------
export async function getRecentRunIds(): Promise<number[]> {
  const result = await table_query({
    caller: 'pipelineLog/getRecentRunIds',
    table: 'tpip_pipelinelog',
    query:  `SELECT DISTINCT pip_run_id FROM tpip_pipelinelog ORDER BY pip_run_id DESC LIMIT ${PIPELINE_RECENT_RUN_IDS_LIMIT}`,
    params: [],
    skipCache: true
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getRecentRunIds', lg_caller: 'pipelineLog/getRecentRunIds', lg_msg: 'Failed to read recent run_ids: ' + result.error, lg_severity: 'E' })
    return []
  }
  const rows = result.data as { pip_run_id: number }[]
  return rows.map(r => r.pip_run_id)
}

//----------------------------------------------------------------------------------
//  getPipelineRunStatus — latest row per (step, batch, sub_step, sub_sub) within one
//  run_id, for the "Pipeline Jobs" summary. `batch` is the AKBC slot / Tracked batch
//  (0 = none); `sub_step` the stats group (NULL for steps 0-3); `sub_sub` a tracked
//  player. So step 2 batch 3 returns its "Tracked batch 3" summary row (sub_step NULL,
//  sub_sub NULL) plus one row per player (sub_sub 01..05).
//----------------------------------------------------------------------------------
export async function getPipelineRunStatus(runId: number): Promise<PipelineStatus[]> {
  const result = await table_query({
    caller: 'pipelineLog/getPipelineRunStatus',
    table: 'tpip_pipelinelog',
    query: `SELECT DISTINCT ON (pip_step, pip_batch, pip_sub_step, pip_sub_sub) *
            FROM tpip_pipelinelog
            WHERE pip_run_id = $1
            ORDER BY pip_step, pip_batch, pip_sub_step, pip_sub_sub, pip_created DESC`,
    params: [runId],
    skipCache: true
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getPipelineRunStatus', lg_caller: 'pipelineLog/getPipelineRunStatus', lg_msg: 'Failed to read pipeline run status: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data as PipelineStatus[]
}
