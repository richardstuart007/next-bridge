import { NextRequest, NextResponse } from 'next/server'
import { startPipelineRun } from '@/src/lib/actions/pipelineLog'
import { cronStart, cronEnd, cronFail } from '@/src/lib/actions/cronTrace'

const ROUTE = 'build/start-run'

//----------------------------------------------------------------------------------
//  run — the day's first cron: allocates the shared pip_run_id (MAX+1), truncates
//  ts1_sessions/ts2_results, and writes the step-0 "Start Run" marker row. Every other
//  cron job of the day reuses this run_id. `to_date` (optional) is recorded on the
//  step-0 row as the run's process-nothing-past cap. Returns { run_id } (500 on failure).
//----------------------------------------------------------------------------------
async function run(toDate?: string): Promise<NextResponse> {
  await cronStart(ROUTE, { to_date: toDate })
  try {
    const result = await startPipelineRun(toDate, true)
    await cronEnd(ROUTE, `new pipeline run_id ${result.run_id}${toDate ? ` (to_date ${toDate})` : ''}, staging truncated`)
    return NextResponse.json(result)
  } catch (err) {
    await cronFail(ROUTE, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

//----------------------------------------------------------------------------------
//  toDateParam — the optional ?to_date= query value, or undefined. `|| undefined`
//  (not `?? undefined`) so an empty ?to_date= — the form every vercel.json cron
//  path carries, filled in only for a UI test run — reads as "no cap".
//----------------------------------------------------------------------------------
function toDateParam(request: NextRequest): string | undefined {
  return request.nextUrl.searchParams.get('to_date') || undefined
}

//----------------------------------------------------------------------------------
//  GET — Vercel Cron entry (first of the day): allocates the pipeline run
//----------------------------------------------------------------------------------
export async function GET(request: NextRequest)  { return run(toDateParam(request)) }

//----------------------------------------------------------------------------------
//  POST — manual-trigger equivalent of GET
//----------------------------------------------------------------------------------
export async function POST(request: NextRequest) { return run(toDateParam(request)) }
