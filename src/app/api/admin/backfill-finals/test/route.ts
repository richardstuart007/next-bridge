import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { extractRunIds } from '@/src/lib/scrapeUtils'

const NZB_BASE     = 'https://www.nzbridge.co.nz'
const TEST_RUN_IDS = [230346, 230352, 230353]

export async function POST() {
  const log: string[] = []

  try {
    log.push(`Test run_ids: ${TEST_RUN_IDS.join(', ')}`)

    // Step 1 — current DB state before reset
    const before = await table_query({
      caller: 'backfill-finals/test/before',
      query: `SELECT se_source_id, se_name, se_is_summary
              FROM tse_sessions WHERE se_source_id = ANY($1)
              ORDER BY se_source_id`,
      params: [TEST_RUN_IDS] as unknown as (string | number | boolean | null)[]
    }) as { se_source_id: number; se_name: string; se_is_summary: boolean | null }[]

    log.push(`DB state before reset:`)
    for (const r of before) log.push(`  run_id=${r.se_source_id} se_is_summary=${r.se_is_summary} name="${r.se_name}"`)

    // Step 2 — reset those sessions to NULL
    await table_query({
      caller: 'backfill-finals/test/reset',
      query: `UPDATE tse_sessions SET se_is_summary = NULL WHERE se_source_id = ANY($1)`,
      params: [TEST_RUN_IDS] as unknown as (string | number | boolean | null)[]
    })
    log.push(`Reset ${TEST_RUN_IDS.length} sessions to NULL`)

    // Step 3 — fetch each run_id page directly and check for Final
    for (const run_id of TEST_RUN_IDS) {
      const url = `${NZB_BASE}/results.html?run_id=${run_id}`
      log.push(`Fetching: ${url}`)

      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; next-bridge-bot/1.0)' }
      })
      log.push(`  HTTP status: ${response.status}`)

      if (!response.ok) {
        log.push(`  SKIPPED (fetch failed)`)
        continue
      }

      const html = await response.text()
      log.push(`  HTML length: ${html.length} chars`)

      const { runIds, finalRunIds } = extractRunIds(html)
      log.push(`  run_ids on page: ${runIds.join(', ') || '(none)'}`)
      log.push(`  final run_ids:   ${finalRunIds.join(', ') || '(none)'}`)

      const is_final = finalRunIds.includes(run_id)
      log.push(`  is_final: ${is_final}`)

      await table_query({
        caller: 'backfill-finals/test/mark',
        query: `UPDATE tse_sessions SET se_is_summary = $1 WHERE se_source_id = $2 AND se_is_summary IS NULL`,
        params: [is_final, run_id]
      })
      log.push(`  Updated se_is_summary = ${is_final}`)
    }

    // Step 4 — DB state after update
    const after = await table_query({
      caller: 'backfill-finals/test/after',
      query: `SELECT se_source_id, se_name, se_is_summary
              FROM tse_sessions WHERE se_source_id = ANY($1)
              ORDER BY se_source_id`,
      params: [TEST_RUN_IDS] as unknown as (string | number | boolean | null)[]
    }) as { se_source_id: number; se_name: string; se_is_summary: boolean | null }[]

    log.push(`DB state after update:`)
    for (const r of after) log.push(`  run_id=${r.se_source_id} se_is_summary=${r.se_is_summary} name="${r.se_name}"`)

    return NextResponse.json({ log, after })
  } catch (err) {
    log.push(`ERROR: ${String(err)}`)
    return NextResponse.json({ log, error: String(err) }, { status: 500 })
  }
}
