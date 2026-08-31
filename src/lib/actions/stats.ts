'use server'

//==============================================================================================
//  1) DESCRIPTION
//    rebuildAllStats / rebuildPlayerStats / rebuildPartnerStats — recompute
//    ta1_player_stats and/or ta2_partner_stats for every tournament group (A/B/C plus
//    'all') via upsert, logging each group computation as its own sub-step under
//    pipeline step 4 (player) or step 5 (partner).
//
//    Parameters:
//      forceNewRun — allocate a fresh pip_run_id instead of reusing the current run's
//                    (default false)
//
//    Returns (rebuildAllStats):
//      player_rows  — total ta1_player_stats rows upserted across all groups
//      partner_rows — total ta2_partner_stats rows upserted across all groups
//      groups       — per-group row counts, keyed `player-<grp>` / `partner-<grp>`
//    rebuildPlayerStats / rebuildPartnerStats return the matching half of that shape.
//
//  2) NOTES
//    `groups` is keyed the same way PipelineTable.tsx's STATS_SUB_ROWS is, so the UI can
//    fill all 8 sub-rows' Processed column from one call whether it was triggered by
//    "Run All"/"Finish Pipeline" or an individual button. Each group computation is
//    logged as a separate sub-step (a/b/c/d ↔ Group A/B/C/All) rather than one aggregate
//    row.
//
//    rebuildPlayerStats + rebuildPartnerStats have their own cron routes
//    (/api/build/stats-player, /api/build/stats-partner) so a slow half can't starve the
//    other's maxDuration. rebuildAllStats stays the combined path for the manual /
//    `npm run localprod` full run (/api/build/stats, cron/update-sessions).
//
//  3) CHANGE HISTORY
//    2026-08-31 — split rebuildAllStats into rebuildPlayerStats + rebuildPartnerStats
//                 (each with its own cron route); rebuildAllStats now just calls both.
//                 Collapsed PLAYER_SUB_STEP/PARTNER_SUB_STEP into one GROUP_SUB_STEP map.
//==============================================================================================

import { logPipelineStep, resolvePipRunId } from '@/src/lib/actions/pipelineLog'
import { computePlayerGroupStats, computePartnerGroupStats } from '@/src/lib/actions/statsCompute'
import { TOURNAMENT_GROUPS } from '@/src/lib/constants'

export type RebuildAllStatsResult = {
  player_rows:  number
  partner_rows: number
  groups:       Record<string, number>
}

export type RebuildPlayerStatsResult = {
  player_rows: number
  groups:      Record<string, number>
}

export type RebuildPartnerStatsResult = {
  partner_rows: number
  groups:       Record<string, number>
}

const GROUP_SUB_STEP: Record<string, string> = { A: 'a', B: 'b', C: 'c', all: 'd' }

//----------------------------------------------------------------------------------
//  rebuildPlayerStats — recompute ta1_player_stats for every tournament group, one
//  logged sub-step per group under pipeline step 4
//----------------------------------------------------------------------------------
export async function rebuildPlayerStats(forceNewRun = false): Promise<RebuildPlayerStatsResult> {
  const run_id = await resolvePipRunId(4, forceNewRun)
  const groups: Record<string, number> = {}

  let player_rows = 0
  for (const grp of [...TOURNAMENT_GROUPS, 'all']) {
    const t0 = Date.now()
    const { inserted, inputRecs } = await computePlayerGroupStats(grp)
    player_rows += inserted
    groups[`player-${grp.toLowerCase()}`] = inserted
    await logPipelineStep({
      run_id, step: 4, sub_step: GROUP_SUB_STEP[grp], step_name: `Player Stats — Group ${grp === 'all' ? 'All' : grp}`,
      input_table: 'tre_results', input_recs: inputRecs, output_table: 'ta1_player_stats', output_recs: inserted,
      duration_ms: Date.now() - t0
    })
  }

  return { player_rows, groups }
}

//----------------------------------------------------------------------------------
//  rebuildPartnerStats — recompute ta2_partner_stats for every tournament group, one
//  logged sub-step per group under pipeline step 5
//----------------------------------------------------------------------------------
export async function rebuildPartnerStats(forceNewRun = false): Promise<RebuildPartnerStatsResult> {
  const run_id = await resolvePipRunId(5, forceNewRun)
  const groups: Record<string, number> = {}

  let partner_rows = 0
  for (const grp of [...TOURNAMENT_GROUPS, 'all']) {
    const t0 = Date.now()
    const { inserted, inputRecs } = await computePartnerGroupStats(grp)
    partner_rows += inserted
    groups[`partner-${grp.toLowerCase()}`] = inserted
    await logPipelineStep({
      run_id, step: 5, sub_step: GROUP_SUB_STEP[grp], step_name: `Partner Stats — Group ${grp === 'all' ? 'All' : grp}`,
      input_table: 'tre_results', input_recs: inputRecs, output_table: 'ta2_partner_stats', output_recs: inserted,
      duration_ms: Date.now() - t0
    })
  }

  return { partner_rows, groups }
}

//----------------------------------------------------------------------------------
//  rebuildAllStats — the combined player + partner recompute (manual / localprod
//  full-run path); daily crons hit rebuildPlayerStats / rebuildPartnerStats separately
//----------------------------------------------------------------------------------
export async function rebuildAllStats(forceNewRun = false): Promise<RebuildAllStatsResult> {
  const playerResult  = await rebuildPlayerStats(forceNewRun)
  const partnerResult = await rebuildPartnerStats(false)

  const result = {
    player_rows:  playerResult.player_rows,
    partner_rows: partnerResult.partner_rows,
    groups:       { ...playerResult.groups, ...partnerResult.groups }
  }
  return result
}
