import { NextRequest, NextResponse } from 'next/server'
import { logPipelineStep, resolvePipRunId } from '@/src/lib/actions/pipelineLog'
import { scrapeTrackedPlayerSessions } from '@/src/lib/actions/pipelineScrape'
import { buildSessionsFromStaging, buildResultsFromStaging } from '@/src/lib/actions/buildSteps'
import { cronStart, cronEnd, cronFail } from '@/src/lib/actions/cronTrace'

//
//  Hard Vercel per-invocation ceiling — one batch of 5 players is a few seconds; backstop.
//  Next.js route config must be a literal — keep in sync with SCRAPE_MAX_DURATION_SECONDS
//  in src/lib/constants.ts
//
export const maxDuration = 300

const ROUTE = 'build/scrape-tracked-batch'

//----------------------------------------------------------------------------------
//  run — one tracked-player batch of the shared daily run: reuses the day's run_id
//  (set by /api/build/start-run), scrapes the ?batch= slice of the pl_name-ordered
//  tracked list (per-player rows logged by scrapeTrackedPlayerSessions under
//  pip_step 2 / pip_batch = the batch number, pip_sub_sub = the player), then Build
//  Sessions + Build Results (skipLog). This route logs one combined step-2 row for the
//  batch (pip_batch = batch, pip_sub_step NULL). `toDate` (UI test cap) and
//  `fetchTimeoutMs` are forwarded to scrapeTrackedPlayerSessions. 500 on failure.
//----------------------------------------------------------------------------------
async function run(batch: number, toDate?: string, fetchTimeoutMs?: number): Promise<NextResponse> {
  await cronStart(ROUTE, { batch, to_date: toDate, fetch_timeout_ms: fetchTimeoutMs })
  try {
    const run_id = await resolvePipRunId(2, false)
    const t0 = Date.now()
    const scraped = await scrapeTrackedPlayerSessions(toDate, fetchTimeoutMs, batch)
    const sessions = await buildSessionsFromStaging(false, undefined, undefined, 'tracked', true)
    const results  = await buildResultsFromStaging(false, undefined, undefined, 'tracked', true)

    await logPipelineStep({
      run_id, step: 2, batch, step_name: `Tracked batch ${batch}`,
      input_table: 'ts2_results', input_recs: scraped.pairs_total,
      output_table: 'tre_results', output_recs: results.inserted,
      duration_ms: Date.now() - t0
    })

    const summary = { batch, run_id, run_ids_new: scraped.run_ids_new, pairs: scraped.pairs_total, players_created: scraped.players_created, sessions: sessions.inserted, results: results.inserted }
    await cronEnd(ROUTE, `batch ${batch}: ${scraped.run_ids_new} new run_ids, ${scraped.pairs_total} pairs, ${sessions.inserted} built sessions, ${results.inserted} built results, ${scraped.players_created} new players`)
    return NextResponse.json(summary)
  } catch (err) {
    await cronFail(ROUTE, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

//----------------------------------------------------------------------------------
//  checkCronAuth — 401 when CRON_SECRET is set, env is not dev, and the Authorization
//  header isn't `Bearer <secret>`; null otherwise. Vercel Cron sends the header.
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
//  params — [batch, to_date, fetch_timeout_ms] from the query string. batch is
//  1-indexed (vercel.json runs ?batch=1 … ?batch=6), default 1; to_date /
//  fetch_timeout_ms use `|| undefined` so the empty forms every vercel.json path
//  carries read as unset (only a UI test run fills them).
//----------------------------------------------------------------------------------
function params(request: NextRequest): [number, string | undefined, number | undefined] {
  const q = request.nextUrl.searchParams
  const rawBatch = Number(q.get('batch'))
  const batch = Number.isInteger(rawBatch) && rawBatch >= 1 ? rawBatch : 1
  const toDate = q.get('to_date') || undefined
  const rawTimeout = q.get('fetch_timeout_ms') || undefined
  const fetchTimeoutMs = rawTimeout != null ? Number(rawTimeout) : undefined
  return [batch, toDate, fetchTimeoutMs]
}

//----------------------------------------------------------------------------------
//  GET — Vercel Cron entry: cron-auth-checks, then runs the ?batch= tracked scrape+build
//----------------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized
  return run(...params(request))
}

//----------------------------------------------------------------------------------
//  POST — manual-trigger equivalent of GET
//----------------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized
  return run(...params(request))
}
