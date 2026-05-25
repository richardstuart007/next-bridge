import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'
import { extractRunIds } from '@/src/lib/scrapeUtils'

const NZB_BASE = 'https://www.nzbridge.co.nz'

export async function POST(request: Request) {
  let limit = 500
  try { const body = await request.json(); if (body.limit) limit = parseInt(body.limit, 10) } catch { /* no body */ }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      let processed    = 0
      let finals_found = 0
      let failed       = 0

      try {
        send({ status: 'querying sessions…' })

        const sessions = await table_query({
          caller: 'admin/backfill-finals/sessions',
          query: `SELECT se_run_id
                  FROM tse_sessions
                  WHERE se_run_id IS NOT NULL
                    AND se_is_summary IS NULL
                  ORDER BY se_run_id DESC
                  LIMIT $1`,
          params: [limit]
        }) as { se_run_id: number }[]

        send({ total: sessions.length })

        for (const { se_run_id } of sessions) {
          const url = `${NZB_BASE}/results.html?run_id=${se_run_id}`
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; next-bridge-bot/1.0)' }
          })

          if (!response.ok) {
            failed++
            await table_query({
              caller: 'admin/backfill-finals/mark-failed',
              query: `UPDATE tse_sessions SET se_is_summary = FALSE
                      WHERE se_run_id = $1 AND se_is_summary IS NULL`,
              params: [se_run_id]
            })
            continue
          }

          const { finalRunIds } = extractRunIds(await response.text())
          const is_final = finalRunIds.includes(se_run_id)

          await table_query({
            caller: 'admin/backfill-finals/mark',
            query: `UPDATE tse_sessions SET se_is_summary = $1
                    WHERE se_run_id = $2 AND se_is_summary IS NULL`,
            params: [is_final, se_run_id]
          })

          processed++
          if (is_final) finals_found++

          if (processed % 10 === 0) {
            send({ processed, finals_found, failed, total: sessions.length })
          }
        }

        const remaining = await table_query({
          caller: 'admin/backfill-finals/remaining',
          query: `SELECT COUNT(*)::int AS n FROM tse_sessions WHERE se_run_id IS NOT NULL AND se_is_summary IS NULL`,
          params: []
        }) as { n: number }[]

        await write_Logging({
          lg_functionname: 'POST', lg_caller: 'admin/backfill-finals',
          lg_msg: `${processed} processed, ${finals_found} finals, ${failed} failed, ${remaining[0]?.n ?? 0} remaining`,
          lg_severity: 'I'
        })

        send({ done: true, processed, finals_found, failed, total: sessions.length, remaining: remaining[0]?.n ?? 0 })
      } catch (err) {
        await write_Logging({ lg_functionname: 'POST', lg_caller: 'admin/backfill-finals', lg_msg: String(err), lg_severity: 'E' })
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

export async function GET() {
  return NextResponse.json({ info: 'POST to run the backfill' })
}
