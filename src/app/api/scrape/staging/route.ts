import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'

//----------------------------------------------------------------------------------
//  GET — { ts1, ts2 } row counts of the two staging tables
//----------------------------------------------------------------------------------
export async function GET() {
  const [r1, r2] = await Promise.all([
    table_query({ caller: 'scrape/staging/count-ts1', query: `SELECT COUNT(*)::int AS n FROM ts1_sessions`, params: [] }) as Promise<{ n: number }[]>,
    table_query({ caller: 'scrape/staging/count-ts2', query: `SELECT COUNT(*)::int AS n FROM ts2_results`,  params: [] }) as Promise<{ n: number }[]>,
  ])
  return NextResponse.json({ ts1: r1[0]?.n ?? 0, ts2: r2[0]?.n ?? 0 })
}

//----------------------------------------------------------------------------------
//  DELETE — truncates both staging tables (ts1_sessions, ts2_results)
//----------------------------------------------------------------------------------
export async function DELETE() {
  await table_query({ caller: 'scrape/staging/truncate-ts1', query: `TRUNCATE ts1_sessions`, params: [] })
  await table_query({ caller: 'scrape/staging/truncate-ts2', query: `TRUNCATE ts2_results`,  params: [] })
  return NextResponse.json({ ok: true })
}
