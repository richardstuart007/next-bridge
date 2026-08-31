//==============================================================================================
//  1) DESCRIPTION
//    GET — /api/scrape/ts1 route handler. Lists all ts1_sessions staging rows
//    (run_id/date/club/event name/score type/event type), ordered by date then run_id.
//
//    Returns:
//      JSON array of ts1_sessions rows
//==============================================================================================

import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

export async function GET() {
  const result = await table_query({
    caller: 'scrape/ts1/list',
    table: 'ts1_sessions',
    query: `SELECT s1_run_id, s1_date, s1_club, s1_event_name, s1_score_type, s1_event_type
            FROM ts1_sessions ORDER BY s1_date ASC, s1_run_id`,
    params: []
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'GET', lg_caller: 'scrape/ts1', lg_msg: 'Failed to list ts1_sessions: ' + result.error, lg_severity: 'E' })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  const rows = result.data as { s1_run_id: number; s1_date: string; s1_club: string; s1_event_name: string; s1_score_type: string; s1_event_type: string }[]
  return NextResponse.json(rows)
}
