import { NextResponse } from 'next/server'
import { buildAllPartnerStats } from '@/src/lib/actions/players'
import { write_logging } from 'nextjs-shared/write_logging'
import { logPipelineStep, resolvePipRunId } from '@/src/lib/actions/pipelineLog'

async function run(): Promise<NextResponse> {
  const t0 = Date.now()
  try {
    const { pairs } = await buildAllPartnerStats()
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/partners', lg_msg: `${pairs} pairs`, lg_severity: 'I' })
    await logPipelineStep({
      run_id: await resolvePipRunId(3, false), step: 3, sub_step: 'a', step_name: 'Build Partners',
      input_table: 'tre_results', output_table: 'tpa_partners', output_recs: pairs,
      duration_ms: Date.now() - t0
    })
    return NextResponse.json({ pairs })
  } catch (err) {
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/partners', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET()  { return run() }
export async function POST() { return run() }
