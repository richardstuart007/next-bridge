import { NextRequest } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { table_update } from 'nextjs-shared/table_update'
import { table_upsert } from 'nextjs-shared/table_upsert'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function POST(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') ?? 'averages'

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  async function send(data: object) {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  ;(async () => {
    try {
      if (mode === 'averages') {
        const rows = await table_query({
          caller: 'recalculate/averages',
          query: `
            SELECT
              re.re_plid1,
              COUNT(*)                                                                          AS total_count,
              ROUND(AVG(re.re_percentage)::numeric, 2)                                         AS avg_all,
              COUNT(*)        FILTER (WHERE s.se_scoring = 'MP')                               AS mp_count,
              ROUND(AVG(re.re_percentage) FILTER (WHERE s.se_scoring = 'MP')::numeric, 2)      AS mp_avg,
              COUNT(*)        FILTER (WHERE s.se_scoring = 'VP')                              AS imp_count,
              ROUND(AVG(re.re_percentage) FILTER (WHERE s.se_scoring = 'VP')::numeric, 2)     AS imp_avg
            FROM tre_results re
            JOIN tse_sessions s ON s.se_seid = re.re_seid
            GROUP BY re.re_plid1
          `,
          params: []
        })
        const total = rows.length
        let processed = 0
        let failed = 0

        for (const row of rows) {
          try {
            await table_update({
              caller: 'recalculate/averages',
              table: 'tpl_players',
              columnValuePairs: [
                { column: 'pl_session_count',      value: Number(row.total_count) },
                { column: 'pl_avg_percentage',     value: row.avg_all ?? 0 },
                { column: 'pl_mp_session_count',   value: Number(row.mp_count) },
                { column: 'pl_mp_avg_percentage',  value: row.mp_avg ?? 0 },
                { column: 'pl_imp_session_count',  value: Number(row.imp_count) },
                { column: 'pl_imp_avg_percentage', value: row.imp_avg ?? 0 }
              ],
              whereColumnValuePairs: [{ column: 'pl_plid', value: row.re_plid1 }]
            })
          } catch (err) {
            failed++
            await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/recalculate', lg_msg: `averages update failed for plid ${row.re_plid1}: ${String(err)}`, lg_severity: 'E' })
          }
          processed++
          await send({ step: 'averages', processed, total, failed })
        }

        await send({ done: true, updated: rows.length, failed })

      } else if (mode === 'partners') {
        const rows = await table_query({
          caller: 'recalculate/partners',
          query: `
            WITH pairs AS (
              SELECT
                re.re_plid1, re.re_plid2,
                COUNT(*)                                                                        AS sessions,
                ROUND(AVG(re.re_percentage)::numeric, 2)                                       AS avg_pct,
                COUNT(*)        FILTER (WHERE s.se_scoring = 'MP')                             AS mp_sessions,
                ROUND(AVG(re.re_percentage) FILTER (WHERE s.se_scoring = 'MP')::numeric, 2)    AS mp_avg,
                COUNT(*)        FILTER (WHERE s.se_scoring = 'VP')                            AS imp_sessions,
                ROUND(AVG(re.re_percentage) FILTER (WHERE s.se_scoring = 'VP')::numeric, 2)   AS imp_avg
              FROM tre_results re
              JOIN tse_sessions s ON s.se_seid = re.re_seid
              WHERE re.re_plid1 < re.re_plid2
              GROUP BY re.re_plid1, re.re_plid2
            )
            SELECT
              CASE WHEN p1.pl_name <= p2.pl_name THEN pairs.re_plid1         ELSE pairs.re_plid2 END AS plid1,
              CASE WHEN p1.pl_name <= p2.pl_name THEN pairs.re_plid2 ELSE pairs.re_plid1         END AS plid2,
              pairs.sessions, pairs.avg_pct,
              pairs.mp_sessions, pairs.mp_avg,
              pairs.imp_sessions, pairs.imp_avg
            FROM pairs
            JOIN tpl_players p1 ON p1.pl_plid = pairs.re_plid1
            JOIN tpl_players p2 ON p2.pl_plid = pairs.re_plid2
          `,
          params: []
        })

        const total = rows.length
        let processed = 0
        let failed = 0

        for (const row of rows) {
          try {
            await table_upsert({
              caller: 'recalculate/partners',
              table: 'tpa_partners',
              columnValuePairs: [
                { column: 'pa_plid1',        value: row.plid1 },
                { column: 'pa_plid2',        value: row.plid2 },
                { column: 'pa_sessions',     value: Number(row.sessions) },
                { column: 'pa_avg_pct',      value: row.avg_pct ?? 0 },
                { column: 'pa_mp_sessions',  value: Number(row.mp_sessions) },
                { column: 'pa_mp_avg_pct',   value: row.mp_avg ?? 0 },
                { column: 'pa_imp_sessions', value: Number(row.imp_sessions) },
                { column: 'pa_imp_avg_pct',  value: row.imp_avg ?? 0 }
              ],
              conflictColumns: ['pa_plid1', 'pa_plid2']
            })
          } catch (err) {
            failed++
            await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/recalculate', lg_msg: `partner upsert failed (${row.plid1},${row.plid2}): ${String(err)}`, lg_severity: 'E' })
          }
          processed++
          await send({ processed, total, failed })
        }

        // Back-fill re_paid on results rows missing it
        await table_query({
          caller: 'recalculate/partners',
          query: `
            UPDATE tre_results re
            SET re_paid = pa.pa_paid
            FROM tpa_partners pa
            WHERE pa.pa_plid1 = LEAST(re.re_plid1, re.re_plid2)
              AND pa.pa_plid2 = GREATEST(re.re_plid1, re.re_plid2)
              AND re.re_paid IS NULL
          `,
          params: []
        })

        await send({ done: true, updated: rows.length, failed })
      }
    } catch (err) {
      await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/recalculate', lg_msg: String(err), lg_severity: 'E' })
      await send({ error: String(err) })
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}
