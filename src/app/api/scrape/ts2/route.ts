import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'

export async function GET() {
  const [countRows, dataRows] = await Promise.all([
    table_query({
      caller: 'scrape/ts2/count',
      query: `SELECT COUNT(*)::int AS count FROM ts2_results`,
      params: []
    }) as Promise<{ count: number }[]>,
    table_query({
      caller: 'scrape/ts2/list',
      query: `SELECT s2_run_id, s2_plid1, s2_plid2, s2_score_value
              FROM ts2_results ORDER BY s2_run_id, s2_s2id LIMIT 200`,
      params: []
    }) as Promise<{ s2_run_id: number; s2_plid1: number; s2_plid2: number; s2_score_value: number }[]>
  ])
  return NextResponse.json({ count: countRows[0]?.count ?? 0, rows: dataRows })
}

export async function DELETE() {
  await table_query({ caller: 'scrape/ts2/truncate', query: `TRUNCATE ts2_results`, params: [] })
  return NextResponse.json({ ok: true })
}
