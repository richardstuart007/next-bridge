import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function GET(request: NextRequest) {
  const min = parseInt(request.nextUrl.searchParams.get('min') ?? '5', 10)

  try {
    const [players, partnerships] = await Promise.all([
      table_query({
        caller: 'rankings players',
        query: `
          SELECT
            pl_plid         AS id,
            pl_name         AS name,
            pl_avg_percentage AS avg_pct,
            pl_session_count  AS sessions,
            pl_grade        AS grade,
            pl_club         AS club
          FROM tpl_players
          WHERE pl_session_count >= $1
          ORDER BY pl_avg_percentage DESC
        `,
        params: [min]
      }),
      table_query({
        caller: 'rankings partnerships',
        query: `
          SELECT
            pa.pa_paid        AS id,
            pa.pa_sessions    AS sessions,
            pa.pa_avg_pct     AS avg_pct,
            p1.pl_plid        AS player1_id,
            p1.pl_name        AS player1_name,
            p2.pl_plid        AS player2_id,
            p2.pl_name        AS player2_name
          FROM tpa_partners pa
          JOIN tpl_players p1 ON p1.pl_plid = pa.pa_plid1
          JOIN tpl_players p2 ON p2.pl_plid = pa.pa_plid2
          WHERE pa.pa_sessions >= $1
          ORDER BY pa.pa_avg_pct DESC
        `,
        params: [min]
      })
    ])

    return NextResponse.json({ players, partnerships })
  } catch (err) {
    await write_Logging({ lg_functionname: 'GET', lg_caller: 'rankings', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
