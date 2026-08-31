//==============================================================================================
//  1) DESCRIPTION
//    POST — /api/players/recalculate route handler. Recomputes one group's stats: mode
//    'player_grp' runs computePlayerGroupStats(grp) → pipeline step 4 (sub_step a–d),
//    mode 'partner_grp' runs computePartnerGroupStats(grp) → step 5 (sub_step a–d).
//
//    Parameters:
//      request — query string: mode ('player_grp' | 'partner_grp'), grp ('A' | 'B' | 'C' | 'all')
//
//    Returns:
//      JSON { updated: <rows> }; 400 for an unknown mode, 500 { error } on failure
//==============================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { computePlayerGroupStats, computePartnerGroupStats } from '@/src/lib/actions/statsCompute'
import { logPipelineStep, resolvePipRunId } from '@/src/lib/actions/pipelineLog'

const GROUP_SUB_STEP: Record<string, string> = { A: 'a', B: 'b', C: 'c', all: 'd' }

export async function POST(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const mode = searchParams.get('mode') ?? ''
  const grp  = searchParams.get('grp')  ?? ''
  const t0 = Date.now()

  try {
    const run_id = await resolvePipRunId(4, false)

    if (mode === 'player_grp') {
      const { inserted, inputRecs } = await computePlayerGroupStats(grp)
      await logPipelineStep({
        run_id, step: 4, sub_step: GROUP_SUB_STEP[grp], step_name: `Player Stats — Group ${grp === 'all' ? 'All' : grp}`,
        input_table: 'tre_results', input_recs: inputRecs, output_table: 'ta1_player_stats', output_recs: inserted, duration_ms: Date.now() - t0
      })
      return NextResponse.json({ updated: inserted })

    } else if (mode === 'partner_grp') {
      const { inserted, inputRecs } = await computePartnerGroupStats(grp)
      await logPipelineStep({
        run_id, step: 5, sub_step: GROUP_SUB_STEP[grp], step_name: `Partner Stats — Group ${grp === 'all' ? 'All' : grp}`,
        input_table: 'tre_results', input_recs: inputRecs, output_table: 'ta2_partner_stats', output_recs: inserted, duration_ms: Date.now() - t0
      })
      return NextResponse.json({ updated: inserted })
    }

    return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 })

  } catch (err) {
    await write_logging({ lg_functionname: 'POST', lg_caller: 'players/recalculate', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
