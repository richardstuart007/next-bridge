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

export async function GET() {
  const rows = await table_query({
    caller: 'scrape/ts1/list',
    query: `SELECT s1_run_id, s1_date, s1_club, s1_event_name, s1_score_type, s1_event_type
            FROM ts1_sessions ORDER BY s1_date ASC, s1_run_id`,
    params: []
  }) as { s1_run_id: number; s1_date: string; s1_club: string; s1_event_name: string; s1_score_type: string; s1_event_type: string }[]
  return NextResponse.json(rows)
}
