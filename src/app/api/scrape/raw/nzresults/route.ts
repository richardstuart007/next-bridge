import { NextRequest } from 'next/server'
import { getTs7AllFound, getTs8ExistingNzNumbers, clearTs8ByNzNumber, insertTs8Rows } from '@/src/lib/actions/raw'
import { fetchPlayerResultsHistory } from '@/src/lib/scrape/nzbridge'
import { write_Logging } from 'nextjs-shared/write_logging'

const CLUB_ALIASES: Record<string, string> = {
  'remuera bowls & bridge inc': 'Auckland',
}

function normaliseClub(club: string): string {
  return CLUB_ALIASES[club.toLowerCase()] ?? club
}

/**
 * POST /api/scrape/raw/nzresults?mode=refresh|missing
 *
 * refresh (default): for every 'found' row in ts7_nz_players, clears and
 *   re-fetches results history from nzbridge.co.nz into ts8_nz_results.
 * missing: same but skips players who already have rows in ts8_nz_results.
 * Reads only from ts* tables — does not touch tpl_players.
 * Streams SSE progress.
 */
export async function POST(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') ?? 'refresh'

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const send = async (data: object) => writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    try {
      const allTs7 = await getTs7AllFound() as any[]

      let ts7Rows = allTs7
      if (mode === 'missing') {
        const existing = new Set(await getTs8ExistingNzNumbers())
        ts7Rows = allTs7.filter(r => !existing.has(r.s7_nz_number))
      }

      const total = ts7Rows.length
      let done = 0; let failed = 0; let totalRows = 0

      for (let i = 0; i < ts7Rows.length; i++) {
        const r = ts7Rows[i]
        const nzNum: number = r.s7_nz_number
        try {
          const rows = await fetchPlayerResultsHistory(nzNum)
          const normalised = rows.map(r => ({ ...r, club: normaliseClub(r.club) }))
          await clearTs8ByNzNumber(nzNum)
          await insertTs8Rows(nzNum, normalised)
          totalRows += normalised.length
          done++
        } catch (err) {
          await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/nzresults', lg_msg: `NZ# ${nzNum}: ${String(err)}`, lg_severity: 'W' })
          failed++
        }
        await send({ processed: i + 1, total, done, failed, rows: totalRows, name: r.s7_name })
      }

      await send({ done: true, total, players: done, failed, rows: totalRows })
    } catch (err) {
      await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/nzresults', lg_msg: String(err), lg_severity: 'E' })
      await send({ error: String(err) })
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
}
