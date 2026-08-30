import { NextResponse } from 'next/server'
import { buildAllPartnerStats } from '@/src/lib/actions/players'
import { write_logging } from 'nextjs-shared/write_logging'
import { logPipelineStep, resolvePipRunId } from '@/src/lib/actions/pipelineLog'

//----------------------------------------------------------------------------------
//  run — reads the tpa_partners count via buildAllPartnerStats(), logs it as
//  pipeline step 3, and returns { pairs } as JSON (500 with { error } on failure)
//----------------------------------------------------------------------------------
async function run(): Promise<NextResponse> {
  const t0 = Date.now()
  try {
    const { pairs } = await buildAllPartnerStats()
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/partners', lg_msg: `${pairs} pairs`, lg_severity: 'I' })
    await logPipelineStep({
      run_id: await resolvePipRunId(3, false), step: 3, sub_step: 'a', step_name: 'Build Partners',
      output_table: 'tpa_partners', output_recs: pairs,
      duration_ms: Date.now() - t0
    })
    return NextResponse.json({ pairs })
  } catch (err) {
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/partners', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

//----------------------------------------------------------------------------------
//  GET — runs the Build Partners step
//----------------------------------------------------------------------------------
export async function GET()  { return run() }

//----------------------------------------------------------------------------------
//  POST — manual-trigger equivalent of GET
//----------------------------------------------------------------------------------
export async function POST() { return run() }
