import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { scrapeClubSessions, scrapeTrackedPlayerSessions } from '@/src/lib/actions/pipelineScrape'
import { buildSessionsFromStaging, buildResultsFromStaging } from '@/src/lib/actions/buildSteps'
import { buildAllPartnerStats } from '@/src/lib/actions/players'
import { rebuildAllStats } from '@/src/lib/actions/stats'

export async function GET(request: NextRequest) {
  const isDev  = process.env.NEXT_PUBLIC_APPENV_ISDEV === 'true'
  const secret = process.env.CRON_SECRET
  if (secret && !isDev) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log = (msg: string, severity = 'I') =>
    write_logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: msg, lg_severity: severity })

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

    const { pairs: partner_pairs } = await buildAllPartnerStats()
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
