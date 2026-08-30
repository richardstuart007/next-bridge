import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { scrapeClubSessions, scrapeTrackedPlayerSessions } from '@/src/lib/actions/pipelineScrape'
import { buildSessionsFromStaging, buildResultsFromStaging } from '@/src/lib/actions/buildSteps'
import { buildAllPartnerStats } from '@/src/lib/actions/players'
import { rebuildAllStats } from '@/src/lib/actions/stats'
import { logPipelineStep, resolvePipRunId } from '@/src/lib/actions/pipelineLog'

//----------------------------------------------------------------------------------
//  checkCronAuth — returns a 401 NextResponse when CRON_SECRET is set, the env is
//  not dev, and the Authorization header isn't `Bearer <secret>`; null otherwise
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
//  run — runs the whole pipeline in one request (scrape AKBC → build → scrape
//  tracked → build → partners → stats), logging each stage, and returns a summary
//  JSON (500 with { error } on failure)
//----------------------------------------------------------------------------------
async function run(): Promise<NextResponse> {
  //----------------------------------------------------------------------------------------------
  //  log — write_logging bound to this route's functionname/caller (default severity 'I')
  //----------------------------------------------------------------------------------------------
  function log(msg: string, severity = 'I') {
    const result = write_logging({ lg_functionname: 'run', lg_caller: 'cron/update-sessions', lg_msg: msg, lg_severity: severity })
    return result
  }

  try {
    await log('START full pipeline run')

    const clubResult = await scrapeClubSessions()
    await log(`Scrape AKBC: ${clubResult.run_ids_new} new run_ids, ${clubResult.pairs_total} pairs, ${clubResult.players_created} new players`)

    const clubSessionsResult = await buildSessionsFromStaging(false, clubResult.from_date, clubResult.to_date)
    const clubResultsResult  = await buildResultsFromStaging(false, clubResult.from_date, clubResult.to_date)
    await log(`Build (AKBC): ${clubSessionsResult.inserted} sessions, ${clubResultsResult.inserted} results`)

    const trackedResult = await scrapeTrackedPlayerSessions()
    await log(`Scrape Tracked Players: ${trackedResult.run_ids_new} new run_ids, ${trackedResult.pairs_total} pairs, ${trackedResult.players_created} new players`)

    const trackedSessionsResult = await buildSessionsFromStaging(false, undefined, undefined, 'tracked')
    const trackedResultsResult  = await buildResultsFromStaging(false, undefined, undefined, 'tracked')
    await log(`Build (Tracked): ${trackedSessionsResult.inserted} sessions, ${trackedResultsResult.inserted} results`)

    const t0Partners = Date.now()
    const { pairs: partner_pairs } = await buildAllPartnerStats()
    await logPipelineStep({
      run_id: await resolvePipRunId(3, false), step: 3, sub_step: 'a', step_name: 'Build Partners',
      output_table: 'tpa_partners', output_recs: partner_pairs,
      duration_ms: Date.now() - t0Partners
    })
    await log(`Build Partners: ${partner_pairs} pairs`)

    await rebuildAllStats()
    await log('Stats: player and partner stats rebuilt')

    const summary = {
      from_date: clubResult.from_date, to_date: clubResult.to_date,
      run_ids_new:     clubResult.run_ids_new + trackedResult.run_ids_new,
      pairs_total:     clubResult.pairs_total + trackedResult.pairs_total,
      players_created: clubResult.players_created + trackedResult.players_created,
      sessions_built:  clubSessionsResult.inserted + trackedSessionsResult.inserted,
      results_built:   clubResultsResult.inserted + trackedResultsResult.inserted,
      partner_pairs,
    }
    await log(`DONE: ${summary.run_ids_new} run_ids, ${summary.sessions_built} sessions, ${summary.results_built} results`)
    return NextResponse.json(summary)

  } catch (err) {
    await log(String(err), 'E')
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

//----------------------------------------------------------------------------------
//  GET — Vercel Cron entry: cron-auth-checks, then runs the full pipeline
//----------------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized
  return run()
}

//----------------------------------------------------------------------------------
//  POST — manual-trigger equivalent of GET (same cron-auth check and behaviour)
//----------------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized
  return run()
}
