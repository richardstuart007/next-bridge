import { getPlayerByName, findOrCreatePlayerByName, getOrCreatePartnerRow } from '@/src/lib/actions/players'
import { insertResult } from '@/src/lib/actions/results'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

/**
 * POST /api/scrape/process-results
 *
 * Stage 3: resolve raw name pairs from trw_results_raw into player IDs,
 * then write tre_results and tpa_partners rows.
 * Streams SSE progress events as each session is processed.
 */
export async function POST() {
  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  async function send(data: object) {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  ;(async () => {
    try {
      const pendingSessions = await table_query({
        caller: 'process-results',
        query: `
          SELECT DISTINCT rw_seid
          FROM trw_results_raw
          WHERE NOT EXISTS (
            SELECT 1 FROM tre_results WHERE re_seid = rw_seid
          )
          ORDER BY rw_seid
        `,
        params: []
      })

      const total = pendingSessions.length
      let sessionsProcessed = 0
      let playersCreated = 0
      let resultsInserted = 0
      let partnershipsCreated = 0
      const warnings: string[] = []

      for (let i = 0; i < pendingSessions.length; i++) {
        const seid: number = pendingSessions[i].rw_seid

        const rawPairs = await table_query({
          caller: 'process-results',
          query: `SELECT rw_name1, rw_name2, rw_percentage FROM trw_results_raw WHERE rw_seid = $1`,
          params: [seid]
        })

        for (const row of rawPairs) {
          const name1: string = row.rw_name1
          const name2: string = row.rw_name2
          const percentage: number = parseFloat(row.rw_percentage)

          const wasNew1 = !(await getPlayerByName(name1))
          const wasNew2 = !(await getPlayerByName(name2))

          const plid1 = await findOrCreatePlayerByName(name1)
          const plid2 = await findOrCreatePlayerByName(name2)

          if (!plid1 || !plid2) {
            const msg = `Session ${seid}: could not resolve "${name1}" / "${name2}"`
            warnings.push(msg)
            await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/process-results', lg_msg: msg, lg_severity: 'W' })
            continue
          }

          if (wasNew1) playersCreated++
          if (wasNew2) playersCreated++

          const pairId = await getOrCreatePartnerRow(plid1, plid2, name1, name2)
          if (pairId !== null) partnershipsCreated++

          await insertResult({ se_id: seid, pl_id: plid1, partner_pl_id: plid2, pair_id: pairId, percentage })
          await insertResult({ se_id: seid, pl_id: plid2, partner_pl_id: plid1, pair_id: pairId, percentage })
          resultsInserted += 2
        }

        sessionsProcessed++
        await send({ processed: i + 1, total, players_created: playersCreated, results_inserted: resultsInserted, partnerships_created: partnershipsCreated })
      }

      await send({ done: true, sessions_processed: sessionsProcessed, players_created: playersCreated, results_inserted: resultsInserted, partnerships_created: partnershipsCreated, warnings })
    } catch (err) {
      await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/process-results', lg_msg: String(err), lg_severity: 'E' })
      await send({ error: String(err) })
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}
