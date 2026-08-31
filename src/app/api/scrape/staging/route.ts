import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

//----------------------------------------------------------------------------------
//  GET — { ts1, ts2 } row counts of the two staging tables
//----------------------------------------------------------------------------------
export async function GET() {
  const [r1, r2] = await Promise.all([
    table_query({ caller: 'scrape/staging/count-ts1', table: 'ts1_sessions', query: `SELECT COUNT(*)::int AS n FROM ts1_sessions`, params: [] }),
    table_query({ caller: 'scrape/staging/count-ts2', table: 'ts2_results', query: `SELECT COUNT(*)::int AS n FROM ts2_results`,  params: [] }),
  ])
  if (!r1.ok || !r2.ok) {
    write_logging({ lg_functionname: 'GET', lg_caller: 'scrape/staging', lg_msg: 'Failed to count staging tables: ' + (r1.error ?? r2.error), lg_severity: 'E' })
    return NextResponse.json({ error: r1.error ?? r2.error }, { status: 500 })
  }
  const rows1 = r1.data as { n: number }[]
  const rows2 = r2.data as { n: number }[]
  return NextResponse.json({ ts1: rows1[0]?.n ?? 0, ts2: rows2[0]?.n ?? 0 })
}

//----------------------------------------------------------------------------------
//  DELETE — truncates both staging tables (ts1_sessions, ts2_results)
//----------------------------------------------------------------------------------
export async function DELETE() {
  const t1 = await table_query({ caller: 'scrape/staging/truncate-ts1', table: 'ts1_sessions', query: `TRUNCATE ts1_sessions`, params: [] })
  const t2 = await table_query({ caller: 'scrape/staging/truncate-ts2', table: 'ts2_results', query: `TRUNCATE ts2_results`,  params: [] })
  if (!t1.ok || !t2.ok) {
    write_logging({ lg_functionname: 'DELETE', lg_caller: 'scrape/staging', lg_msg: 'Failed to truncate staging tables: ' + (t1.error ?? t2.error), lg_severity: 'E' })
    return NextResponse.json({ error: t1.error ?? t2.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
