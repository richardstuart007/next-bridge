import { NextRequest, NextResponse } from 'next/server'
import { fetchSessionResults } from '@/src/lib/scrape/akbc'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

const RAW_TABLE = 'trw_results_raw'
const LOG_TABLE = 'tfl_fetch_log'

/**
 * GET /api/scrape/fetch-results
 * Returns per-session fetch status: pair count, processed flag, last error/skip.
 */
export async function GET() {
  try {
    const rows = await table_query({
      caller: 'fetch-results GET',
      query: `
        SELECT
          s.se_seid,
          s.se_source_id,
          s.se_date::text        AS se_date,
          s.se_session_type,
          s.se_scoring,
          s.se_day_of_week,
          COUNT(r.rw_rwid)::int  AS pair_count,
          EXISTS(SELECT 1 FROM tre_results WHERE re_seid = s.se_seid) AS processed,
          l.fl_error             AS last_error,
          COALESCE(l.fl_skipped, false) AS last_skipped
        FROM tse_sessions s
        LEFT JOIN trw_results_raw r ON r.rw_seid = s.se_seid
        LEFT JOIN LATERAL (
          SELECT fl_error, fl_skipped
          FROM tfl_fetch_log
          WHERE fl_seid = s.se_seid
          ORDER BY fl_run_at DESC
          LIMIT 1
        ) l ON TRUE
        GROUP BY s.se_seid, s.se_source_id, s.se_date, s.se_session_type,
                 s.se_scoring, s.se_day_of_week, l.fl_error, l.fl_skipped
        ORDER BY s.se_date DESC, s.se_seid DESC
      `,
      params: []
    })
    return NextResponse.json(rows)
  } catch (err) {
    await write_Logging({ lg_functionname: 'GET', lg_caller: 'scrape/fetch-results', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * POST /api/scrape/fetch-results[?seids=1,2,3]
 * Streams SSE progress events as each session is fetched.
 * If ?seids= supplied, deletes existing raw rows for those sessions and re-fetches them.
 * Otherwise fetches all sessions not yet in trw_results_raw.
 */
export async function POST(request: NextRequest) {
  const seidsParam = request.nextUrl.searchParams.get('seids')
  const targetSeids: number[] | null = seidsParam
    ? seidsParam.split(',').map(Number).filter(n => !isNaN(n))
    : null

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  async function send(data: object) {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  async function log(seid: number, pairs: number, skipped: boolean, error: string | null) {
    await table_query({
      caller: 'fetch-results log',
      query: `INSERT INTO ${LOG_TABLE} (fl_seid, fl_pairs, fl_skipped, fl_error) VALUES ($1, $2, $3, $4)`,
      params: [seid, pairs, skipped, error]
    })
  }

  ;(async () => {
    try {
      // Reprocess: wipe existing raw rows and log entries for targeted sessions
      if (targetSeids && targetSeids.length > 0) {
        const ph = targetSeids.map((_, i) => `$${i + 1}`).join(', ')
        await table_query({
          caller: 'fetch-results reprocess',
          query: `DELETE FROM ${RAW_TABLE} WHERE rw_seid IN (${ph})`,
          params: targetSeids
        })
        await table_query({
          caller: 'fetch-results reprocess',
          query: `DELETE FROM ${LOG_TABLE} WHERE fl_seid IN (${ph})`,
          params: targetSeids
        })
      }

      // Build work list
      const pending: { se_seid: number; se_source_id: number }[] = targetSeids && targetSeids.length > 0
        ? await table_query({
            caller: 'fetch-results',
            query: `SELECT se_seid, se_source_id FROM tse_sessions WHERE se_seid IN (${targetSeids.map((_, i) => `$${i + 1}`).join(', ')}) ORDER BY se_seid`,
            params: targetSeids
          })
        : await table_query({
            caller: 'fetch-results',
            query: `
              SELECT se_seid, se_source_id FROM tse_sessions
              WHERE NOT EXISTS (SELECT 1 FROM ${RAW_TABLE} WHERE rw_seid = se_seid)
              AND se_scoring != 'IMP'
              ORDER BY se_seid
            `,
            params: []
          })

      const total = pending.length
      let sessionsProcessed = 0
      let pairsStored = 0
      let sessionsSkipped = 0
      const warnings: string[] = []

      for (let i = 0; i < pending.length; i++) {
        const { se_seid: seid, se_source_id: sourceId } = pending[i]
        try {
          const parsed = await fetchSessionResults(sourceId)

          if (parsed.skipped) {
            sessionsSkipped++
            await log(seid, 0, true, null)
            await table_query({
              caller: 'fetch-results',
              query: `UPDATE tse_sessions SET se_scoring = 'IMP' WHERE se_seid = $1`,
              params: [seid]
            })
          } else if (parsed.pairs.length === 0) {
            const msg = `Session ${sourceId}: no pairs found`
            warnings.push(msg)
            await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/fetch-results', lg_msg: msg, lg_severity: 'W' })
            await log(seid, 0, false, msg)
          } else {
            for (const pair of parsed.pairs) {
              const [name1, name2] = [pair.player1Name, pair.player2Name].sort()
              await table_query({
                caller: 'fetch-results',
                query: `INSERT INTO ${RAW_TABLE} (rw_seid, rw_name1, rw_name2, rw_percentage) VALUES ($1, $2, $3, $4)`,
                params: [seid, name1, name2, pair.percentage]
              })
              pairsStored++
            }
            await log(seid, parsed.pairs.length, false, null)
            sessionsProcessed++
          }
        } catch (err) {
          const msg = `Session ${sourceId}: ${String(err)}`
          warnings.push(msg)
          await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/fetch-results', lg_msg: msg, lg_severity: 'E' })
          await log(seid, 0, false, msg)
        }

        await send({ processed: i + 1, total, pairs_stored: pairsStored, skipped: sessionsSkipped })
      }

      await send({ done: true, sessions_processed: sessionsProcessed, pairs_stored: pairsStored, sessions_skipped: sessionsSkipped, warnings })
    } catch (err) {
      await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/fetch-results', lg_msg: String(err), lg_severity: 'E' })
      await send({ error: String(err) })
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}
