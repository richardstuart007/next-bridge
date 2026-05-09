import { NextRequest } from 'next/server'
import * as cheerio from 'cheerio'
import { table_query } from 'nextjs-shared/table_query'

const NZB_BASE = 'https://www.nzbridge.co.nz'

function extractRunIds(html: string): number[] {
  const $ = cheerio.load(html)
  const runIds = new Set<number>()
  $('a[href*="run_id="]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    const m = href.match(/run_id=(\d+)/)
    if (m) runIds.add(parseInt(m[1], 10))
  })
  return [...runIds]
}

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

    const runIds = extractRunIds(await response.text())

    if (runIds.length === 0) {
      return new Response(JSON.stringify({ total_found: 0, total_in_prod: 0, total_missing: 0, missing: [] }))
    }

    const existing = await table_query({
      caller: 'scrape/discover/nzb-by-player/check',
      query: `SELECT se_source_id FROM tse_sessions WHERE se_source_id = ANY($1)`,
      params: [runIds]
    }) as { se_source_id: number }[]

    const existingSet = new Set(existing.map(r => r.se_source_id))
    const missing     = runIds.filter(id => !existingSet.has(id))

    return new Response(JSON.stringify({
      total_found:   runIds.length,
      total_in_prod: runIds.length - missing.length,
      total_missing: missing.length,
      missing
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}
