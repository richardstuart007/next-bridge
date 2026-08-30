'use server'

//==============================================================================================
//  1) DESCRIPTION
//    rebuildAllStats — recomputes ta1_player_stats + ta2_partner_stats for every tournament
//    group (A/B/C plus 'all') via upsert, logging each of the 8 group computations as its own
//    sub-step under pipeline step 4.
//
//    Parameters:
//      forceNewRun — allocate a fresh pip_run_id instead of reusing the current run's
//                    (default false)
//
//    Returns:
//      player_rows  — total ta1_player_stats rows upserted across all groups
//      partner_rows — total ta2_partner_stats rows upserted across all groups
//      groups       — per-group row counts, keyed `player-<grp>` / `partner-<grp>`
//
//  2) NOTES
//    `groups` is keyed the same way PipelineTable.tsx's STATS_SUB_ROWS is, so the UI can fill
//    all 8 sub-rows' Processed column from this one call whether it was triggered by "Run All"/
//    "Finish Pipeline" or an individual button. Each of the 8 group computations is logged as a
//    separate sub-step (a/b/c/d for players, e/f/g/h for partners) rather than one aggregate row.
//==============================================================================================

import { logPipelineStep, resolvePipRunId } from '@/src/lib/actions/pipelineLog'
import { computePlayerGroupStats, computePartnerGroupStats } from '@/src/lib/actions/statsCompute'
import { TOURNAMENT_GROUPS } from '@/src/lib/constants'

export type RebuildAllStatsResult = {
  player_rows:  number
  partner_rows: number
  groups:       Record<string, number>
}

const PLAYER_SUB_STEP:  Record<string, string> = { A: 'a', B: 'b', C: 'c', all: 'd' }
const PARTNER_SUB_STEP: Record<string, string> = { A: 'e', B: 'f', C: 'g', all: 'h' }

export async function rebuildAllStats(forceNewRun = false): Promise<RebuildAllStatsResult> {
  const run_id = await resolvePipRunId(4, forceNewRun)
  const groups: Record<string, number> = {}

  let player_rows = 0
  for (const grp of [...TOURNAMENT_GROUPS, 'all']) {
    const t0 = Date.now()
    const { inserted, inputRecs } = await computePlayerGroupStats(grp)
    player_rows += inserted
    groups[`player-${grp.toLowerCase()}`] = inserted
    await logPipelineStep({
      run_id, step: 4, sub_step: PLAYER_SUB_STEP[grp], step_name: `Player Stats — Group ${grp === 'all' ? 'All' : grp}`,
      input_table: 'tre_results', input_recs: inputRecs, output_table: 'ta1_player_stats', output_recs: inserted,
      duration_ms: Date.now() - t0
    })
  }

  let partner_rows = 0
  for (const grp of [...TOURNAMENT_GROUPS, 'all']) {
    const t0 = Date.now()
    const { inserted, inputRecs } = await computePartnerGroupStats(grp)
    partner_rows += inserted
    groups[`partner-${grp.toLowerCase()}`] = inserted
    await logPipelineStep({
      run_id, step: 4, sub_step: PARTNER_SUB_STEP[grp], step_name: `Partner Stats — Group ${grp === 'all' ? 'All' : grp}`,
      input_table: 'tre_results', input_recs: inputRecs, output_table: 'ta2_partner_stats', output_recs: inserted,
      duration_ms: Date.now() - t0
    })
  }

  return { player_rows, partner_rows, groups }
}
