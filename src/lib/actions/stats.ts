'use server'

import { logPipelineStep, resolvePipRunId } from '@/src/lib/actions/pipelineLog'
import { computePlayerGroupStats, computePartnerGroupStats } from '@/src/lib/actions/statsCompute'

export type RebuildAllStatsResult = {
  player_rows:  number
  partner_rows: number
}

const PLAYER_SUB_STEP:  Record<string, string> = { A: 'a', B: 'b', C: 'c', all: 'd' }
const PARTNER_SUB_STEP: Record<string, string> = { A: 'e', B: 'f', C: 'g', all: 'h' }

//----------------------------------------------------------------------------------
//  rebuildAllStats — recomputes ta1_player_stats + ta2_partner_stats for every group
//  (A/B/C/all) via upsert. Logs each of the 8 group computations as its own sub-step
//  under step 4, rather than one aggregate row.
//----------------------------------------------------------------------------------
export async function rebuildAllStats(forceNewRun = false): Promise<RebuildAllStatsResult> {
  const run_id = await resolvePipRunId(4, forceNewRun)

  let player_rows = 0
  for (const grp of ['A', 'B', 'C', 'all']) {
    const t0 = Date.now()
    const rows = await computePlayerGroupStats(grp)
    player_rows += rows
    await logPipelineStep({
      run_id, step: 4, sub_step: PLAYER_SUB_STEP[grp], step_name: `Player Stats — Group ${grp === 'all' ? 'All' : grp}`,
      input_table: 'tre_results', output_table: 'ta1_player_stats', output_recs: rows,
      duration_ms: Date.now() - t0
    })
  }

  let partner_rows = 0
  for (const grp of ['A', 'B', 'C', 'all']) {
    const t0 = Date.now()
    const rows = await computePartnerGroupStats(grp)
    partner_rows += rows
    await logPipelineStep({
      run_id, step: 4, sub_step: PARTNER_SUB_STEP[grp], step_name: `Partner Stats — Group ${grp === 'all' ? 'All' : grp}`,
      input_table: 'tre_results', output_table: 'ta2_partner_stats', output_recs: rows,
      duration_ms: Date.now() - t0
    })
  }

  return { player_rows, partner_rows }
}
