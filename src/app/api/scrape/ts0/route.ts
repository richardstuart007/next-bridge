import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'

export async function GET() {
  try {
    const rows = await table_query({
      caller: 'scrape/ts0/list',
      query: `SELECT s0_s0id, s0_run_id, s0_source, s0_url FROM ts0_scraped ORDER BY s0_s0id`,
      params: []
    }) as { s0_s0id: number; s0_run_id: number; s0_source: string; s0_url: string }[]
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
