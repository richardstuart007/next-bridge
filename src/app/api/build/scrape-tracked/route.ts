import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { scrapeTrackedPlayerSessions } from '@/src/lib/actions/pipelineScrape'

//
//  Hard Vercel per-invocation ceiling — the scrape loops self-enforce a shorter
//  soft budget (SCRAPE_TIME_BUDGET_MS / ?time_budget_ms=) and resume next run.
//  Next.js route config must be a literal — keep in sync with
//  SCRAPE_MAX_DURATION_SECONDS in src/lib/constants.ts
//
export const maxDuration = 300

//----------------------------------------------------------------------------------
//  run — runs scrapeTrackedPlayerSessions(toDate, timeBudgetMs, fetchTimeoutMs), logs
//  the outcome, and returns it as JSON (500 with { error } on failure)
//----------------------------------------------------------------------------------
async function run(toDate?: string, timeBudgetMs?: number, fetchTimeoutMs?: number): Promise<NextResponse> {
  try {
    const result = await scrapeTrackedPlayerSessions(toDate, timeBudgetMs, fetchTimeoutMs)
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/scrape-tracked', lg_msg: `${result.run_ids_new} new run_ids, ${result.pairs_total} pairs${result.timed_out ? ' (stopped at time budget — resume next run)' : ''}`, lg_severity: 'I' })
    return NextResponse.json(result)
  } catch (err) {
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/scrape-tracked', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

//----------------------------------------------------------------------------------
//  params — pulls [to_date, time_budget_ms, fetch_timeout_ms] out of the request
//  query string (the two _ms values parsed to a number, or undefined)
//----------------------------------------------------------------------------------
function params(request: NextRequest): [string | undefined, number | undefined, number | undefined] {
  const toDate          = request.nextUrl.searchParams.get('to_date') ?? undefined
  const timeBudgetRaw   = request.nextUrl.searchParams.get('time_budget_ms')
  const fetchTimeoutRaw = request.nextUrl.searchParams.get('fetch_timeout_ms')
  const timeBudgetMs    = timeBudgetRaw   != null ? Number(timeBudgetRaw)   : undefined
  const fetchTimeoutMs  = fetchTimeoutRaw != null ? Number(fetchTimeoutRaw) : undefined
  return [toDate, timeBudgetMs, fetchTimeoutMs]
}

//----------------------------------------------------------------------------------
//  GET — runs the tracked-player scrape (optional to_date/time_budget_ms/fetch_timeout_ms)
//----------------------------------------------------------------------------------
export async function GET(request: NextRequest)  { return run(...params(request)) }

//----------------------------------------------------------------------------------
//  POST — manual-trigger equivalent of GET
//----------------------------------------------------------------------------------
export async function POST(request: NextRequest) { return run(...params(request)) }
