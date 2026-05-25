import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function POST() {
  try {
    const result = await table_query({
      caller: 'build/sessions-nzb/insert',
      query: `INSERT INTO tse_sessions
                (se_run_id, se_date, se_day_of_week, se_scoring, se_name,
                 se_club, se_tournament, se_event_type, se_is_summary)
              SELECT * FROM (
                SELECT DISTINCT ON (s9_run_id)
                  s9_run_id,
                  s9_date,
                  TO_CHAR(s9_date, 'FMDay'),
                  CASE WHEN s9_score_type = 'VP' THEN 'VP' ELSE 'MP' END,
                  s9_event_name,
                  s9_club,
                  s9_tournament,
                  s9_event_type,
                  s9_is_summary
                FROM ts09_results
                WHERE s9_date IS NOT NULL
                ORDER BY s9_run_id, s9_s9id
              ) sub
              ORDER BY s9_date, s9_run_id
              ON CONFLICT (se_run_id) DO NOTHING
              RETURNING se_seid`,
      params: []
    }) as { se_seid: number }[]

    const total = await table_query({
      caller: 'build/sessions-nzb/count',
      query: `SELECT COUNT(DISTINCT s9_run_id)::int AS n FROM ts09_results WHERE s9_date IS NOT NULL`,
      params: []
    }) as { n: number }[]

    const inserted = result.length
    const skipped  = (total[0]?.n ?? 0) - inserted
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/sessions-nzb', lg_msg: `Sessions: ${inserted} inserted, ${skipped} already existed`, lg_severity: 'I' })
    return NextResponse.json({ inserted, skipped, total: total[0]?.n ?? 0 })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/sessions-nzb', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
