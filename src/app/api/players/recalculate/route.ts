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
        // Step 1: session counts
        const countRows = await table_query({
          caller: 'recalculate/averages',
          query: `SELECT re_plid, COUNT(*) AS session_count FROM tre_results GROUP BY re_plid`,
          params: []
        })
        const total = countRows.length
        let processed = 0
        let failed = 0

        for (const row of countRows) {
          try {
            await table_update({
              caller: 'recalculate/averages',
              table: 'tpl_players',
              columnValuePairs: [{ column: 'pl_session_count', value: Number(row.session_count) }],
              whereColumnValuePairs: [{ column: 'pl_plid', value: row.re_plid }]
            })
          } catch (err) {
            failed++
            await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/recalculate', lg_msg: `session_count update failed for plid ${row.re_plid}: ${String(err)}`, lg_severity: 'E' })
          }
          processed++
          await send({ step: 'counts', processed, total, failed })
        }

        // Step 2: averages
        const avgRows = await table_query({
          caller: 'recalculate/averages',
          query: `SELECT re_plid, ROUND(AVG(re_percentage)::numeric, 2) AS avg_pct FROM tre_results GROUP BY re_plid`,
          params: []
        })
        const total2 = avgRows.length
        let processed2 = 0

        for (const row of avgRows) {
          try {
            await table_update({
              caller: 'recalculate/averages',
              table: 'tpl_players',
              columnValuePairs: [{ column: 'pl_avg_percentage', value: row.avg_pct }],
              whereColumnValuePairs: [{ column: 'pl_plid', value: row.re_plid }]
            })
          } catch (err) {
            failed++
            await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/recalculate', lg_msg: `avg_pct update failed for plid ${row.re_plid}: ${String(err)}`, lg_severity: 'E' })
          }
          processed2++
          await send({ step: 'averages', processed: processed2, total: total2, failed })
        }

        await send({ done: true, updated: avgRows.length, failed })

      } else if (mode === 'partners') {
        const rows = await table_query({
          caller: 'recalculate/partners',
          query: `
            WITH pairs AS (
              SELECT
                re_plid, re_partner_plid,
                COUNT(*)                               AS sessions,
                ROUND(AVG(re_percentage)::numeric, 2) AS avg_pct
              FROM tre_results
              WHERE re_plid < re_partner_plid
              GROUP BY re_plid, re_partner_plid
            )
            SELECT
              CASE WHEN p1.pl_name <= p2.pl_name THEN pairs.re_plid         ELSE pairs.re_partner_plid END AS plid1,
              CASE WHEN p1.pl_name <= p2.pl_name THEN pairs.re_partner_plid ELSE pairs.re_plid         END AS plid2,
              pairs.sessions,
              pairs.avg_pct
            FROM pairs
            JOIN tpl_players p1 ON p1.pl_plid = pairs.re_plid
            JOIN tpl_players p2 ON p2.pl_plid = pairs.re_partner_plid
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
                { column: 'pa_avg_pct',      value: row.avg_pct },
                { column: 'pa_last_updated', value: new Date().toISOString() }
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

        // Back-fill re_pairid on results rows missing it
        await table_query({
          caller: 'recalculate/partners',
          query: `
            UPDATE tre_results re
            SET re_pairid = pa.pa_paid
            FROM tpa_partners pa
            WHERE pa.pa_plid1 = LEAST(re.re_plid, re.re_partner_plid)
              AND pa.pa_plid2 = GREATEST(re.re_plid, re.re_partner_plid)
              AND re.re_pairid IS NULL
          `,
          params: []
        })

        await send({ done: true, updated: rows.length, failed })

      } else if (mode === 'dateseq') {
        const result = await table_query({
          caller: 'recalculate/dateseq',
          query: `
            WITH ranked AS (
              SELECT se_seid, ROW_NUMBER() OVER (PARTITION BY se_date ORDER BY se_seid ASC) AS seq
              FROM tse_sessions
            )
            UPDATE tse_sessions s
            SET se_date_seq = r.seq
            FROM ranked r
            WHERE s.se_seid = r.se_seid
            RETURNING s.se_seid
          `,
          params: []
        })
        const updated = Array.isArray(result) ? result.length : 0
        await send({ done: true, updated, failed: 0 })
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
