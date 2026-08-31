import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

//----------------------------------------------------------------------------------
//  GET — lists all ts2_results staging rows, resolved to both player names,
//  ordered by run_id then s2_s2id
//----------------------------------------------------------------------------------
export async function GET() {
  const result = await table_query({
    caller: 'scrape/ts2/list',
    table: 'ts2_results',
    query: `SELECT s2_run_id,
                   p1.pl_name AS pl_name1, s2_plid1,
                   p2.pl_name AS pl_name2, s2_plid2,
                   s2_score_value
            FROM ts2_results
            LEFT JOIN tpl_players p1 ON p1.pl_plid = s2_plid1
            LEFT JOIN tpl_players p2 ON p2.pl_plid = s2_plid2
            ORDER BY s2_run_id, s2_s2id`,
    params: []
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'GET', lg_caller: 'scrape/ts2', lg_msg: 'Failed to list ts2_results: ' + result.error, lg_severity: 'E' })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  const rows = result.data as { s2_run_id: number; pl_name1: string; s2_plid1: number; pl_name2: string; s2_plid2: number; s2_score_value: number }[]
  return NextResponse.json(rows)
}

//----------------------------------------------------------------------------------
//  DELETE — truncates ts2_results
//----------------------------------------------------------------------------------
export async function DELETE() {
  const result = await table_query({ caller: 'scrape/ts2/truncate', table: 'ts2_results', query: `TRUNCATE ts2_results`, params: [] })
  if (!result.ok) {
    write_logging({ lg_functionname: 'DELETE', lg_caller: 'scrape/ts2', lg_msg: 'Failed to truncate ts2_results: ' + result.error, lg_severity: 'E' })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
