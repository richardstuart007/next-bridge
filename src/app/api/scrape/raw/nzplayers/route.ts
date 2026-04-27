import { NextRequest } from 'next/server'
import { getTs7NeedingLookup, getTs7ForRefresh, updateTs7ByName, updateTs7ByNzNumber } from '@/src/lib/actions/raw'
import { lookupPlayerByNumber, lookupPlayer } from '@/src/lib/scrape/nzbridge'
import { write_Logging } from 'nextjs-shared/write_logging'

/**
 * POST /api/scrape/raw/nzplayers?mode=refresh|missing
 *
 * refresh: for every ts7 row that already has an NZ number, re-fetches stats
 *   from nzbridge.co.nz by number and updates the row in place.
 * missing: for every ts7 row without an NZ number, searches nzbridge by name
 *   and updates the row if found.
 * Reads and writes only ts* tables.
 * Streams SSE progress.
 */
export async function POST(request: NextRequest) {
  const mode = (request.nextUrl.searchParams.get('mode') ?? 'refresh') as 'refresh' | 'missing'

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const send = async (data: object) => writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    try {
      const players = (mode === 'refresh'
        ? await getTs7ForRefresh()
        : await getTs7NeedingLookup()) as any[]

      const total = players.length
      let found = 0; let notFound = 0

      for (let i = 0; i < players.length; i++) {
        const player = players[i]

        if (mode === 'refresh') {
          const nzNum: number = player.s7_nz_number
          const result = await lookupPlayerByNumber(nzNum)
          await updateTs7ByNzNumber(nzNum, result ? {
            nzNumber: result.nz_bridge_number, nzName: result.name, club: result.club,
            rank: result.rank, grade: result.grade, rating: result.rating,
            aPoints: result.a_points, bPoints: result.b_points, cPoints: result.c_points
          } : null)
          result ? found++ : notFound++
        } else {
          const result = await lookupPlayer(player.s7_name)
          await updateTs7ByName(player.s7_name, result ? {
            nzNumber: result.nz_bridge_number, nzName: result.name, club: result.club,
            rank: result.rank, grade: result.grade, rating: result.rating,
            aPoints: result.a_points, bPoints: result.b_points, cPoints: result.c_points
          } : null)
          result ? found++ : notFound++
        }

        await send({ processed: i + 1, total, found, not_found: notFound, name: player.s7_name })
      }

      await send({ done: true, total, found, not_found: notFound })
    } catch (err) {
      await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/nzplayers', lg_msg: String(err), lg_severity: 'E' })
      await send({ error: String(err) })
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
}
