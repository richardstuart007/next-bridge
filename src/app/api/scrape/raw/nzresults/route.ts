import { getTs7AllFoundAkbc, getTs7AllFound, getTs8ProcessedRunIds, insertTs8Pairs, upsertTs7Partner, type Ts8PairRow } from '@/src/lib/actions/raw'
import { fetchPlayerResultsHistory, fetchNzSessionPage, lookupPlayer } from '@/src/lib/scrape/nzbridge'
import { write_Logging } from 'nextjs-shared/write_logging'

function normaliseName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * POST /api/scrape/raw/nzresults
 * Optional query param: ?nzNumbers=6775,2748,...  → limit to these NZ numbers (test mode)
 *
 * For every AKBC-sourced ts7 player, fetches their NZ Bridge results history.
 * For each new run_id (not already in ts8), fetches the session page and resolves
 * NZ numbers for every pair in the session. Inserts ts8 pair rows (ON CONFLICT DO NOTHING).
 * Partner players are upserted into ts7 with source='partner'.
 * Streams SSE progress.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const testParam = searchParams.get('nzNumbers')
  const testSet = testParam
    ? new Set(testParam.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)))
    : null

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const send = async (data: object) => writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    try {
      // Build name→nzNumber map from all ts7 rows with NZ numbers (includes partners from prior runs)
      const allTs7Found = await getTs7AllFound() as { s7_name: string; s7_nz_number: number }[]
      const ts7Map = new Map<string, number>()
      for (const r of allTs7Found) {
        ts7Map.set(normaliseName(r.s7_name), r.s7_nz_number)
      }

      // Get AKBC-source players to process (optionally filtered to test subset)
      let akbcPlayers = await getTs7AllFoundAkbc() as { s7_name: string; s7_nz_number: number }[]
      if (testSet) {
        akbcPlayers = akbcPlayers.filter(r => testSet.has(r.s7_nz_number))
      }

      // Run_ids already stored in ts8 — skip these entirely
      const processedRunIds = await getTs8ProcessedRunIds()

      // In-memory cache for partner NZ lookups made during this run
      const partnerCache = new Map<string, number | null>()

      const total = akbcPlayers.length
      let playersDone = 0
      let sessionsProcessed = 0
      let pairsInserted = 0

      for (const player of akbcPlayers) {
        const history = await fetchPlayerResultsHistory(player.s7_nz_number)

        for (const result of history) {
          if (result.runId <= 0) continue
          if (processedRunIds.has(result.runId)) continue
          processedRunIds.add(result.runId)  // mark immediately to prevent duplicate fetches

          const sessionPairs = await fetchNzSessionPage(result.runId)
          const batch: Ts8PairRow[] = []

          for (const pair of sessionPairs) {
            const namePairs: [string, string][] = pair.names.length === 2
              ? [[pair.names[0], pair.names[1]]]
              : pair.names.length === 4
                ? [[pair.names[0], pair.names[1]], [pair.names[2], pair.names[3]]]
                : []

            for (const [a, b] of namePairs) {
              const nzA = await resolveNzNumber(a, ts7Map, partnerCache)
              const nzB = await resolveNzNumber(b, ts7Map, partnerCache)
              if (nzA && nzB) {
                batch.push({
                  runId: result.runId,
                  nzNumber1: Math.min(nzA, nzB),
                  nzNumber2: Math.max(nzA, nzB),
                  date: pair.date || null,
                  club: pair.club,
                  eventName: pair.eventName,
                  place: pair.place,
                  scoreValue: pair.score,
                  scoreType: pair.scoreType,
                  tournament: pair.mptsCode,
                  eventType: result.eventType,
                })
              }
            }
          }

          await insertTs8Pairs(batch)
          pairsInserted += batch.length
          sessionsProcessed++
        }

        playersDone++
        await send({ processed: playersDone, total, sessions: sessionsProcessed, pairs: pairsInserted, name: player.s7_name })
      }

      await send({ done: true, total, sessions: sessionsProcessed, pairs: pairsInserted })
    } catch (err) {
      await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/nzresults', lg_msg: String(err), lg_severity: 'E' })
      await send({ error: String(err) })
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
}

async function resolveNzNumber(
  name: string,
  ts7Map: Map<string, number>,
  cache: Map<string, number | null>
): Promise<number | null> {
  const key = normaliseName(name)

  const fromTs7 = ts7Map.get(key)
  if (fromTs7 !== undefined) return fromTs7

  if (cache.has(key)) return cache.get(key)!

  const found = await lookupPlayer(name)
  const nzNum = found ? found.nz_bridge_number : null
  cache.set(key, nzNum)

  if (nzNum && found) {
    ts7Map.set(key, nzNum)
    await upsertTs7Partner(found.name, nzNum)
  }

  return nzNum
}
