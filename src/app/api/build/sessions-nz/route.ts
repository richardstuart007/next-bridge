import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

/**
 * POST /api/build/sessions-nz
 *
 * Inserts one tse_sessions row per distinct s8_run_id from ts8_nz_results.
 * TO_CHAR(date, 'FMDay') produces the full day name without trailing spaces.
 * Skips run_ids already present (ON CONFLICT DO NOTHING on se_source_id).
 */
export async function POST() {
  try {
    const result = await table_query({
      caller: 'build/sessions-nz/insert',
      query: `INSERT INTO tse_sessions
                (se_source_id, se_date, se_day_of_week, se_scoring, se_name, se_session_type,
                 se_club, se_tournament, se_event_type)
              SELECT DISTINCT ON (s8_run_id)
                s8_run_id,
                s8_date,
                TO_CHAR(s8_date, 'FMDay'),
                CASE WHEN s8_score_type = 'VP' THEN 'VP' ELSE 'MP' END,
                s8_event_name,
                'club',
                s8_club,
                s8_tournament,
                s8_event_type
              FROM ts8_nz_results
              WHERE s8_date IS NOT NULL
              ORDER BY s8_run_id, s8_date
              ON CONFLICT (se_source_id) DO NOTHING
              RETURNING se_seid`,
      params: []
    }) as { se_seid: number }[]

    const total = await table_query({
      caller: 'build/sessions-nz/count',
      query: `SELECT COUNT(DISTINCT s8_run_id)::int AS n FROM ts8_nz_results WHERE s8_date IS NOT NULL`,
      params: []
    }) as { n: number }[]

    const inserted = result.length
    const skipped  = (total[0]?.n ?? 0) - inserted
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/sessions-nz', lg_msg: `Sessions: ${inserted} inserted, ${skipped} already existed`, lg_severity: 'I' })
    return NextResponse.json({ inserted, skipped, total: total[0]?.n ?? 0 })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/sessions-nz', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
