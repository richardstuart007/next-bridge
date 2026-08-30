import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { scrapeClubSessions } from '@/src/lib/actions/pipelineScrape'

//
//  Hard Vercel per-invocation ceiling — the scrape loops self-enforce a shorter
//  soft budget (SCRAPE_TIME_BUDGET_MS / ?time_budget_ms=) and resume next run.
//  Next.js route config must be a literal — keep in sync with
//  SCRAPE_MAX_DURATION_SECONDS in src/lib/constants.ts
//
export const maxDuration = 300

//----------------------------------------------------------------------------------
//  run — runs scrapeClubSessions(fromDate, toDate, timeBudgetMs, fetchTimeoutMs),
//  logs the outcome, and returns it as JSON (500 with { error } on failure)
//----------------------------------------------------------------------------------
async function run(fromDate?: string, toDate?: string, timeBudgetMs?: number, fetchTimeoutMs?: number): Promise<NextResponse> {
  try {
    const result = await scrapeClubSessions(fromDate, toDate, timeBudgetMs, fetchTimeoutMs)
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/scrape', lg_msg: `${result.run_ids_new} new run_ids, ${result.pairs_total} pairs${result.timed_out ? ' (stopped at time budget — resume next run)' : ''}`, lg_severity: 'I' })
    return NextResponse.json(result)
  } catch (err) {
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/scrape', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

//----------------------------------------------------------------------------------
//  checkCronAuth — required for Vercel Cron (GET); skipped locally (ISDEV bypass), same
//  shape as /api/cron/update-sessions. Only this route (the pipeline's first step) checks
//  the secret, matching chess's /api/cron/sync — every other build route checks nothing.
//----------------------------------------------------------------------------------
function checkCronAuth(request: NextRequest): NextResponse | null {
  const isDev  = process.env.NEXT_PUBLIC_APPENV_ISDEV === 'true'
  const secret = process.env.CRON_SECRET
  if (secret && !isDev) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

//----------------------------------------------------------------------------------
//  params — pulls [from_date, to_date, time_budget_ms, fetch_timeout_ms] out of the
//  request query string (the two _ms values parsed to a number, or undefined)
//----------------------------------------------------------------------------------
function params(request: NextRequest): [string | undefined, string | undefined, number | undefined, number | undefined] {
  const fromDate       = request.nextUrl.searchParams.get('from_date') ?? undefined
  const toDate         = request.nextUrl.searchParams.get('to_date') ?? undefined
  const timeBudgetRaw  = request.nextUrl.searchParams.get('time_budget_ms')
  const fetchTimeoutRaw = request.nextUrl.searchParams.get('fetch_timeout_ms')
  const timeBudgetMs   = timeBudgetRaw  != null ? Number(timeBudgetRaw)  : undefined
  const fetchTimeoutMs = fetchTimeoutRaw != null ? Number(fetchTimeoutRaw) : undefined
  return [fromDate, toDate, timeBudgetMs, fetchTimeoutMs]
}

//----------------------------------------------------------------------------------
//  GET — Vercel Cron entry: cron-auth-checks, then runs the club scrape for the
//  optional from_date/to_date/time_budget_ms/fetch_timeout_ms query params
//----------------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized
  return run(...params(request))
}

//----------------------------------------------------------------------------------
//  POST — manual-trigger equivalent of GET (same cron-auth check and behaviour)
//----------------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized
  return run(...params(request))
}
