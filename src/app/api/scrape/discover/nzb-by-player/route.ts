import { NextRequest } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { extractRunIds } from '@/src/lib/scrapeUtils'

const NZB_BASE = 'https://www.nzbridge.co.nz'

export async function POST(request: NextRequest) {
  let body: { nz_bridge_number?: number }
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const { nz_bridge_number } = body
  if (!nz_bridge_number) {
    return new Response(JSON.stringify({ error: 'nz_bridge_number is required' }), { status: 400 })
  }

  try {
    const url = `${NZB_BASE}/online-points.html?mpsr=1&mp_user=${nz_bridge_number}`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; next-bridge-bot/1.0)' }
    })
    if (!response.ok) {
      return new Response(JSON.stringify({ error: `NZB fetch failed: ${response.status}` }), { status: 502 })
    }

    const { runIds, finalRunIds } = extractRunIds(await response.text())
    const finalSet = new Set(finalRunIds)

    if (runIds.length === 0) {
      return new Response(JSON.stringify({ total_found: 0, total_in_prod: 0, total_missing: 0, missing: [], final_run_ids: [] }))
    }

    const existing = await table_query({
      caller: 'scrape/discover/nzb-by-player/check',
      query: `SELECT se_run_id FROM tse_sessions WHERE se_run_id = ANY($1)`,
      params: [runIds] as unknown as (string | number | boolean | null)[]
    }) as { se_run_id: number }[]

    const existingSet = new Set(existing.map(r => r.se_run_id))
    const missing     = runIds.filter(id => !existingSet.has(id))

    return new Response(JSON.stringify({
      total_found:   runIds.length,
      total_in_prod: runIds.length - missing.length,
      total_missing: missing.length,
      missing,
      final_run_ids: finalRunIds,
      missing_final: missing.filter(id => finalSet.has(id)),
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}
