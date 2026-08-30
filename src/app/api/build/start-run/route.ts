import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { startPipelineRun } from '@/src/lib/actions/pipelineLog'

//----------------------------------------------------------------------------------
//  run — allocates the day's fresh pipeline run_id and writes the step-0 "Start
//  Run" marker row via startPipelineRun(toDate), logs it, and returns { run_id } as
//  JSON (500 with { error } on failure). toDate is recorded on the step-0 row.
//----------------------------------------------------------------------------------
async function run(toDate?: string): Promise<NextResponse> {
  try {
    const result = await startPipelineRun(toDate)
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/start-run', lg_msg: `New pipeline run_id ${result.run_id}${toDate ? ` (to_date ${toDate})` : ''}`, lg_severity: 'I' })
    return NextResponse.json(result)
  } catch (err) {
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/start-run', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

//----------------------------------------------------------------------------------
//  toDateParam — the optional ?to_date= query value, or undefined
//----------------------------------------------------------------------------------
function toDateParam(request: NextRequest): string | undefined {
  return request.nextUrl.searchParams.get('to_date') ?? undefined
}

//----------------------------------------------------------------------------------
//  GET — Vercel Cron entry (first of the day): allocates the pipeline run
//----------------------------------------------------------------------------------
export async function GET(request: NextRequest)  { return run(toDateParam(request)) }

//----------------------------------------------------------------------------------
//  POST — manual-trigger equivalent of GET
//----------------------------------------------------------------------------------
export async function POST(request: NextRequest) { return run(toDateParam(request)) }
