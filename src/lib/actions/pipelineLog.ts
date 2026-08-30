'use server'

import { table_query } from 'nextjs-shared/table_query'
import { table_write } from 'nextjs-shared/table_write'
import { PIPELINE_RECENT_RUN_IDS_LIMIT } from '@/src/lib/constants'

export type PipelineStatus = {
  pip_pipid:        number
  pip_run_id:       number
  pip_step:         number
  pip_sub_step:     string
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
    const rows = await table_query({
      caller: 'pipelineLog/resolvePipRunId/new',
      query:  `SELECT COALESCE(MAX(pip_run_id), 0) + 1 AS next_run_id FROM tpip_pipelinelog`,
      params: [],
      skipCache: true
    }) as { next_run_id: number }[]
    return rows[0].next_run_id
  }

  const rows = await table_query({
    caller: 'pipelineLog/resolvePipRunId/current',
    query:  `SELECT COALESCE(MAX(pip_run_id), 1) AS run_id FROM tpip_pipelinelog`,
    params: [],
    skipCache: true
  }) as { run_id: number }[]
  return rows[0].run_id
}

//----------------------------------------------------------------------------------
//  logPipelineStep — writes a single completion row once a step has finished running.
//  `to_date` is the run's process-nothing-past cap and is only ever set on the step-0
//  "Start Run" row (NULL everywhere else) — read it back via the step-0 row of a run.
//----------------------------------------------------------------------------------
export async function logPipelineStep(args: {
  run_id:        number
  step:          number
  sub_step:      string
  sub_sub?:      string
  step_name:     string
  input_table?:  string
  input_recs?:   number
  output_table?: string
  output_recs?:  number
  duration_ms:   number
  to_date?:      string
}): Promise<void> {
  await table_write({
    caller: 'pipelineLog/logPipelineStep',
    table: 'tpip_pipelinelog',
    columnValuePairs: [
      { column: 'pip_run_id',       value: args.run_id },
      { column: 'pip_step',         value: args.step },
      { column: 'pip_sub_step',     value: args.sub_step },
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
}

//----------------------------------------------------------------------------------
//  startPipelineRun — allocates the day's fresh pip_run_id (MAX+1) and writes the
//  step-0 "Start Run" marker row that every later step reuses via
//  resolvePipRunId(step, false). This is the only place a new run is created — the
//  AKBC scrape no longer forces one, so run_id allocation never depends on a heavy
//  step completing. `toDate` (ISO YYYY-MM-DD) is the run's process-nothing-past cap;
//  it is recorded on this step-0 row only. Returns the new run_id.
//----------------------------------------------------------------------------------
export async function startPipelineRun(toDate?: string): Promise<{ run_id: number }> {
  const t0 = Date.now()
  const run_id = await resolvePipRunId(0, true)
  await logPipelineStep({
    run_id, step: 0, sub_step: 'a', step_name: 'Start Run',
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
  const rows = await table_query({
    caller: 'pipelineLog/getRecentRunIds',
    query:  `SELECT DISTINCT pip_run_id FROM tpip_pipelinelog ORDER BY pip_run_id DESC LIMIT ${PIPELINE_RECENT_RUN_IDS_LIMIT}`,
    params: [],
    skipCache: true
  }) as { pip_run_id: number }[]
  return rows.map(r => r.pip_run_id)
}

//----------------------------------------------------------------------------------
//  getPipelineRunStatus — latest row per (step, sub_step, sub_sub) within one specific
//  run_id, for the "Pipeline Jobs" summary table's run-id picker. Returns every
//  sub-step (e.g. Update Stats' 8 rows) and every per-item sub_sub row (e.g. one per
//  tracked player), not collapsed to one row per step. Postgres groups all-NULL
//  sub_sub rows together for DISTINCT ON, so steps with no sub_sub usage are
//  unaffected — still exactly one row per (step, sub_step) as before.
//----------------------------------------------------------------------------------
export async function getPipelineRunStatus(runId: number): Promise<PipelineStatus[]> {
  const rows = await table_query({
    caller: 'pipelineLog/getPipelineRunStatus',
    query: `SELECT DISTINCT ON (pip_step, pip_sub_step, pip_sub_sub) *
            FROM tpip_pipelinelog
            WHERE pip_run_id = $1
            ORDER BY pip_step, pip_sub_step, pip_sub_sub, pip_created DESC`,
    params: [runId],
    skipCache: true
  })
  return rows as PipelineStatus[]
}
