import { NextRequest, NextResponse } from 'next/server'
import { scrapeTeamMatchData, scrapeTeamMembers, scrapeTeamRounds } from '@/src/lib/scrape/akbc-raw'
import { clearTs2, insertTs2Rows, clearTs3, insertTs3Rows, clearTs4, insertTs4Rows } from '@/src/lib/actions/raw'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function POST(request: NextRequest) {
  const eventId = parseInt(request.nextUrl.searchParams.get('event_id') ?? '', 10)
  if (isNaN(eventId)) return NextResponse.json({ error: 'Missing event_id' }, { status: 400 })

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const send = async (data: object) => writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    try {
      // ts2: match VP summary
      await send({ step: 'matchdata', status: 'fetching' })
      const ts2Rows = await scrapeTeamMatchData(eventId)
      await clearTs2(eventId)
      await insertTs2Rows(ts2Rows)
      await send({ step: 'matchdata', status: 'done', count: ts2Rows.length })

      // ts3: team members
      await send({ step: 'members', status: 'fetching' })
      const ts3Rows = await scrapeTeamMembers(eventId)
      await clearTs3(eventId)
      await insertTs3Rows(ts3Rows)
      await send({ step: 'members', status: 'done', count: ts3Rows.length })

      // ts4: per-round detail for each team
      const teamNums = [...new Set(ts3Rows.map(r => r.teamNum))]
      await send({ step: 'rounds', status: 'fetching', teams: teamNums.length })
      const ts4Rows = []
      for (const teamNum of teamNums) {
        try {
          const row = await scrapeTeamRounds(eventId, teamNum)
          if (row.vps.length > 0) ts4Rows.push(row)
        } catch {
          // skip teams whose detail page is unavailable
        }
      }
      await clearTs4(eventId)
      await insertTs4Rows(ts4Rows)
      await send({ step: 'rounds', status: 'done', count: ts4Rows.length })

      await send({ done: true, event_id: eventId, ts2: ts2Rows.length, ts3: ts3Rows.length, ts4: ts4Rows.length })
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
