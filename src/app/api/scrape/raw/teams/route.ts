import { NextRequest, NextResponse } from 'next/server'
import { scrapeTeamMatchData, scrapeTeamMembers, scrapeTeamRounds, scrapeTeamMatchPage } from '@/src/lib/scrape/akbc-raw'
import {
  clearTs2, insertTs2Rows,
  clearTs3, insertTs3Rows, getTs3ByEventId,
  clearTs4, insertTs4Rows, getTs4ByEventId,
  clearTs61, insertTs61Rows, getTs61ByEventId,
} from '@/src/lib/actions/raw'
import { write_Logging } from 'nextjs-shared/write_logging'
import type { RawTs4Row, RawTs61Row } from '@/src/lib/scrape/akbc-raw'

export async function POST(request: NextRequest) {
  const eventId = parseInt(request.nextUrl.searchParams.get('event_id') ?? '', 10)
  if (isNaN(eventId)) return NextResponse.json({ error: 'Missing event_id' }, { status: 400 })

  const step = request.nextUrl.searchParams.get('step') as 'ts2' | 'ts3' | 'ts4' | 'ts61' | null

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const send = async (data: object) => writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    try {
      if (step === 'ts2') {
        await send({ step: 'ts2', status: 'fetching' })
        const rows = await scrapeTeamMatchData(eventId)
        if (rows.length === 0) {
          await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/teams/ts2', lg_msg: `No team rows parsed for event_id=${eventId} — page may be blocked or empty`, lg_severity: 'W' })
        }
        await clearTs2(eventId)
        await insertTs2Rows(rows)
        await send({ done: true, step: 'ts2', count: rows.length })

      } else if (step === 'ts3') {
        await send({ step: 'ts3', status: 'fetching' })
        const rows = await scrapeTeamMembers(eventId)
        if (rows.length === 0) {
          await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/teams/ts3', lg_msg: `No team members parsed for event_id=${eventId} — page may be blocked or empty`, lg_severity: 'W' })
        }
        await clearTs3(eventId)
        await insertTs3Rows(rows)
        await send({ done: true, step: 'ts3', count: rows.length })

      } else if (step === 'ts4') {
        const ts3Rows = await getTs3ByEventId(eventId) as { s3_team_num: number }[]
        const teamNums = [...new Set(ts3Rows.map(r => r.s3_team_num))]
        await send({ step: 'ts4', status: 'fetching', teams: teamNums.length })
        const ts4Rows: RawTs4Row[] = []
        for (const teamNum of teamNums) {
          const row = await scrapeTeamRounds(eventId, teamNum)
          if (row.vps.length > 0) ts4Rows.push(row)
        }
        if (ts4Rows.length === 0 && teamNums.length > 0) {
          await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/teams/ts4', lg_msg: `No round data parsed for event_id=${eventId} (${teamNums.length} teams) — pages may be blocked or empty`, lg_severity: 'W' })
        }
        await clearTs4(eventId)
        await insertTs4Rows(ts4Rows)
        await send({ done: true, step: 'ts4', count: ts4Rows.length })

      } else if (step === 'ts61') {
        // Fill-missing: skip match_ids already in ts61
        const existing = await getTs61ByEventId(eventId) as { s61_match_id: number }[]
        const existingMatchIds = new Set(existing.map(r => r.s61_match_id))
        const ts4Rows = await getTs4ByEventId(eventId) as { s4_team_num: number; s4_showteam_urls: string[] }[]
        const totalUrls = ts4Rows.reduce((n, r) => n + (r.s4_showteam_urls ?? []).filter(Boolean).length, 0)
        await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/teams/ts61', lg_msg: `fill-missing: ${existingMatchIds.size} existing, ${totalUrls} total showteam URLs`, lg_severity: 'I' })
        await send({ step: 'ts61', status: 'fetching', total: totalUrls, existing: existingMatchIds.size })

        const ts61Rows: RawTs61Row[] = []
        for (const ts4Row of ts4Rows) {
          const urls = ts4Row.s4_showteam_urls ?? []
          for (let i = 0; i < urls.length; i++) {
            const url = urls[i]
            if (!url) continue
            const matchIdMatch = url.match(/[?&]id=(\d+)/)
            if (!matchIdMatch) continue
            const matchId = parseInt(matchIdMatch[1])
            if (existingMatchIds.has(matchId)) continue
            const row = await scrapeTeamMatchPage(url, eventId, matchId, i + 1)
            if (row) {
              ts61Rows.push(row)
            } else {
              await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/teams/ts61', lg_msg: `match_id=${matchId} parse returned null url=${url}`, lg_severity: 'W' })
            }
          }
        }
        await insertTs61Rows(ts61Rows)
        await send({ done: true, step: 'ts61', added: ts61Rows.length, total: existingMatchIds.size + ts61Rows.length })

      } else {
        // Run all steps in sequence
        await clearTs61(eventId)
        await clearTs4(eventId)
        await clearTs3(eventId)
        await clearTs2(eventId)

        await send({ step: 'matchdata', status: 'fetching' })
        const ts2Rows = await scrapeTeamMatchData(eventId)
        if (ts2Rows.length === 0) {
          await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/teams/ts2', lg_msg: `No team rows parsed for event_id=${eventId} — page may be blocked or empty`, lg_severity: 'W' })
        }
        await insertTs2Rows(ts2Rows)
        await send({ step: 'matchdata', status: 'done', count: ts2Rows.length })

        await send({ step: 'members', status: 'fetching' })
        const ts3Rows = await scrapeTeamMembers(eventId)
        if (ts3Rows.length === 0) {
          await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/teams/ts3', lg_msg: `No team members parsed for event_id=${eventId} — page may be blocked or empty`, lg_severity: 'W' })
        }
        await insertTs3Rows(ts3Rows)
        await send({ step: 'members', status: 'done', count: ts3Rows.length })

        const teamNums = [...new Set(ts3Rows.map(r => r.teamNum))]
        await send({ step: 'rounds', status: 'fetching', teams: teamNums.length })
        const ts4Rows: RawTs4Row[] = []
        for (const teamNum of teamNums) {
          const row = await scrapeTeamRounds(eventId, teamNum)
          if (row.vps.length > 0) ts4Rows.push(row)
        }
        if (ts4Rows.length === 0 && teamNums.length > 0) {
          await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/teams/ts4', lg_msg: `No round data parsed for event_id=${eventId} (${teamNums.length} teams) — pages may be blocked or empty`, lg_severity: 'W' })
        }
        await insertTs4Rows(ts4Rows)
        await send({ step: 'rounds', status: 'done', count: ts4Rows.length })

        const totalShowteamUrls = ts4Rows.reduce((n, r) => n + r.showteamUrls.filter(u => !!u).length, 0)
        await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/teams/ts61', lg_msg: `showteam URLs found: ${totalShowteamUrls} across ${ts4Rows.length} teams`, lg_severity: 'I' })
        await send({ step: 'matchpairs', status: 'fetching' })
        const ts61Rows: RawTs61Row[] = []
        for (const ts4Row of ts4Rows) {
          for (let i = 0; i < ts4Row.showteamUrls.length; i++) {
            const url = ts4Row.showteamUrls[i]
            if (!url) continue
            const matchIdMatch = url.match(/[?&]id=(\d+)/)
            if (!matchIdMatch) continue
            const matchId = parseInt(matchIdMatch[1])
            const row = await scrapeTeamMatchPage(url, eventId, matchId, i + 1)
            if (row) {
              ts61Rows.push(row)
            } else {
              await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/teams/ts61', lg_msg: `match_id=${matchId} parse returned null url=${url}`, lg_severity: 'W' })
            }
          }
        }
        await insertTs61Rows(ts61Rows)
        await send({ step: 'matchpairs', status: 'done', count: ts61Rows.length })

        await send({ done: true, event_id: eventId, ts2: ts2Rows.length, ts3: ts3Rows.length, ts4: ts4Rows.length, ts61: ts61Rows.length })
      }
    } catch (err) {
      await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/teams', lg_msg: String(err), lg_severity: 'E' })
      await send({ error: String(err) })
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}
