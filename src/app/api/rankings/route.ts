import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

type Scoring = 'all' | 'mp' | 'imp'

const SCORING_COLS: Record<Scoring, { playerAvg: string; playerCount: string; partnerAvg: string; partnerCount: string }> = {
  all: { playerAvg: 'pl_avg_percentage',     playerCount: 'pl_session_count',   partnerAvg: 'pa_avg_pct',     partnerCount: 'pa_sessions'     },
  mp:  { playerAvg: 'pl_mp_avg_percentage',  playerCount: 'pl_mp_session_count', partnerAvg: 'pa_mp_avg_pct',  partnerCount: 'pa_mp_sessions'  },
  imp: { playerAvg: 'pl_imp_avg_percentage', playerCount: 'pl_imp_session_count',partnerAvg: 'pa_imp_avg_pct', partnerCount: 'pa_imp_sessions' }
}

export async function GET(request: NextRequest) {
  const min = parseInt(request.nextUrl.searchParams.get('min') ?? '5', 10)
  const scoringParam = request.nextUrl.searchParams.get('scoring') ?? 'all'
  const scoring: Scoring = scoringParam === 'mp' ? 'mp' : scoringParam === 'imp' ? 'imp' : 'all'
  const cols = SCORING_COLS[scoring]

  try {
    const [players, partnerships] = await Promise.all([
      table_query({
        caller: 'rankings players',
        query: `
          SELECT
            pl_plid                  AS id,
            pl_name                  AS name,
            ${cols.playerAvg}        AS avg_pct,
            ${cols.playerCount}      AS sessions,
            pl_grade                 AS grade,
            pl_club                  AS club,
            pl_all_results           AS tracked
          FROM tpl_players
          WHERE ${cols.playerCount} >= $1
          ORDER BY ${cols.playerAvg} DESC
        `,
        params: [min]
      }),
      table_query({
        caller: 'rankings partnerships',
        query: `
          SELECT
            pa.pa_paid               AS id,
            pa.${cols.partnerCount}  AS sessions,
            pa.${cols.partnerAvg}    AS avg_pct,
            p1.pl_plid               AS player1_id,
            p1.pl_name               AS player1_name,
            p1.pl_all_results        AS player1_tracked,
            p2.pl_plid               AS player2_id,
            p2.pl_name               AS player2_name,
            p2.pl_all_results        AS player2_tracked
          FROM tpa_partners pa
          JOIN tpl_players p1 ON p1.pl_plid = pa.pa_plid1
          JOIN tpl_players p2 ON p2.pl_plid = pa.pa_plid2
          WHERE pa.${cols.partnerCount} >= $1
          ORDER BY pa.${cols.partnerAvg} DESC
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
