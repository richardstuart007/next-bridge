import { NextRequest } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { extractRunIds } from '@/src/lib/scrapeUtils'
import { BRIDGE_CLUB_ID } from '@/src/lib/constants'

const NZB_BASE = 'https://www.nzbridge.co.nz'

function datesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from)
  const end = new Date(to)
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}


export async function POST(request: NextRequest) {
  let body: { date_from?: string; date_end?: string; club_id?: number }
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const { date_from, date_end, club_id = BRIDGE_CLUB_ID } = body
  if (!date_from || !date_end) {
    return new Response(JSON.stringify({ error: 'date_from and date_end are required' }), { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      let total_found   = 0
      let total_in_prod = 0
      let total_missing = 0
      const missing: { date: string; run_id: number }[] = []

      try {
        await table_query({ caller: 'scrape/discover/nzb-by-date/truncate-ts1', query: `TRUNCATE ts1_sessions`, params: [] })
        await table_query({ caller: 'scrape/discover/nzb-by-date/truncate-ts2', query: `TRUNCATE ts2_results`,  params: [] })

        const dates = datesInRange(date_from, date_end)

        for (const day of dates) {
          send({ date: day })

          const url =
            `${NZB_BASE}/results.html?mp_filter_club=${club_id}` +
            `&date_start=${day}&date_end=${day}&mp_results=Search`

          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; next-bridge-bot/1.0)' }
          })
          if (!response.ok) continue

          const { runIds, finalRunIds } = extractRunIds(await response.text())
          if (runIds.length === 0) continue
          const finalSet = new Set(finalRunIds)

          total_found += runIds.length

          const existing = await table_query({
            caller: 'scrape/discover/nzb-by-date/check',
            query: `SELECT se_run_id FROM tse_sessions WHERE se_run_id = ANY($1)`,
            params: [runIds] as unknown as (string | number | boolean | null)[]
          }) as { se_run_id: number }[]

          const existingSet  = new Set(existing.map(r => r.se_run_id))
          const dayMissing   = runIds.filter(id => !existingSet.has(id))

          total_in_prod += runIds.length - dayMissing.length
          total_missing += dayMissing.length

          for (const run_id of dayMissing) {
            const is_final = finalSet.has(run_id)
            missing.push({ date: day, run_id })
            await table_query({
              caller: 'scrape/discover/nzb-by-date/insert',
              query: `INSERT INTO ts1_sessions (s1_run_id, s1_date, s1_club_id, s1_is_summary)
                      VALUES ($1, $2, $3, $4) ON CONFLICT (s1_run_id) DO NOTHING`,
              params: [run_id, day, club_id, is_final]
            })
          }

          send({ date: day, found: runIds.length, missing: dayMissing.length })
        }

        send({ done: true, total_found, total_in_prod, total_missing, missing })
      } catch (err) {
        send({ error: String(err) })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
