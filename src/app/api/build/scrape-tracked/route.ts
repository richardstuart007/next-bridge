import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { scrapeTrackedPlayerSessions } from '@/src/lib/actions/pipelineScrape'

//
//  Hard Vercel per-invocation ceiling. This is the all-players manual / `npm run
//  localprod` path; the daily crons use /api/build/scrape-tracked-batch?batch=N instead.
//  Next.js route config must be a literal — keep in sync with SCRAPE_MAX_DURATION_SECONDS
//  in src/lib/constants.ts
//
export const maxDuration = 300

//----------------------------------------------------------------------------------
//  run — runs scrapeTrackedPlayerSessions(toDate, fetchTimeoutMs), logs the outcome,
//  and returns it as JSON (500 with { error } on failure)
//----------------------------------------------------------------------------------
async function run(toDate?: string, fetchTimeoutMs?: number): Promise<NextResponse> {
  try {
    const result = await scrapeTrackedPlayerSessions(toDate, fetchTimeoutMs)
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/scrape-tracked', lg_msg: `${result.run_ids_new} new run_ids, ${result.pairs_total} pairs`, lg_severity: 'P' })
    return NextResponse.json(result)
  } catch (err) {
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/scrape-tracked', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

//----------------------------------------------------------------------------------
//  params — pulls [to_date, fetch_timeout_ms] out of the request query string
//----------------------------------------------------------------------------------
function params(request: NextRequest): [string | undefined, number | undefined] {
  const toDate          = request.nextUrl.searchParams.get('to_date') ?? undefined
  const fetchTimeoutRaw = request.nextUrl.searchParams.get('fetch_timeout_ms')
  const fetchTimeoutMs  = fetchTimeoutRaw != null ? Number(fetchTimeoutRaw) : undefined
  return [toDate, fetchTimeoutMs]
}

//----------------------------------------------------------------------------------
//  GET — runs the tracked-player scrape (optional to_date/fetch_timeout_ms)
//----------------------------------------------------------------------------------
export async function GET(request: NextRequest)  { return run(...params(request)) }

//----------------------------------------------------------------------------------
//  POST — manual-trigger equivalent of GET
//----------------------------------------------------------------------------------
export async function POST(request: NextRequest) { return run(...params(request)) }
