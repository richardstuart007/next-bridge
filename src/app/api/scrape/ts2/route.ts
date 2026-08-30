import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'

//----------------------------------------------------------------------------------
//  GET — lists all ts2_results staging rows, resolved to both player names,
//  ordered by run_id then s2_s2id
//----------------------------------------------------------------------------------
export async function GET() {
  const rows = await table_query({
    caller: 'scrape/ts2/list',
    query: `SELECT s2_run_id,
                   p1.pl_name AS pl_name1, s2_plid1,
                   p2.pl_name AS pl_name2, s2_plid2,
                   s2_score_value
            FROM ts2_results
            LEFT JOIN tpl_players p1 ON p1.pl_plid = s2_plid1
            LEFT JOIN tpl_players p2 ON p2.pl_plid = s2_plid2
            ORDER BY s2_run_id, s2_s2id`,
    params: []
  }) as { s2_run_id: number; pl_name1: string; s2_plid1: number; pl_name2: string; s2_plid2: number; s2_score_value: number }[]
  return NextResponse.json(rows)
}

//----------------------------------------------------------------------------------
//  DELETE — truncates ts2_results
//----------------------------------------------------------------------------------
export async function DELETE() {
  await table_query({ caller: 'scrape/ts2/truncate', query: `TRUNCATE ts2_results`, params: [] })
  return NextResponse.json({ ok: true })
}
