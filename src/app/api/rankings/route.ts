import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

type Scoring = 'mp' | 'vp'

const SCORING_COLS: Record<Scoring, { playerAvg: string; playerCount: string; partnerAvg: string; partnerCount: string }> = {
  mp: { playerAvg: 'a1_mp_avg_pct', playerCount: 'a1_mp_sessions', partnerAvg: 'a2_mp_avg_pct', partnerCount: 'a2_mp_sessions' },
  vp: { playerAvg: 'a1_vp_avg_vp',  playerCount: 'a1_vp_sessions',  partnerAvg: 'a2_vp_avg_vp',  partnerCount: 'a2_vp_sessions'  }
}

export async function GET(request: NextRequest) {
  const min = parseInt(request.nextUrl.searchParams.get('min') ?? '5', 10)
  const scoringParam = request.nextUrl.searchParams.get('scoring') ?? 'mp'
  const scoring: Scoring = scoringParam === 'vp' ? 'vp' : 'mp'
  const group = request.nextUrl.searchParams.get('group') ?? 'C'
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
          JOIN ta1_player_stats ON a1_plid = pl_plid AND a1_group = $2
          WHERE ${cols.playerCount} >= $1
          ORDER BY ${cols.playerAvg} DESC
        `,
        params: [min, group]
      }),
      table_query({
        caller: 'rankings partnerships',
        query: `
          SELECT
            pa_paid                  AS id,
            ${cols.partnerCount}     AS sessions,
            ${cols.partnerAvg}       AS avg_pct,
            p1.pl_plid               AS player1_id,
            p1.pl_name               AS player1_name,
            p1.pl_all_results        AS player1_tracked,
            p2.pl_plid               AS player2_id,
            p2.pl_name               AS player2_name,
            p2.pl_all_results        AS player2_tracked
          FROM tpa_partners
          JOIN ta2_partner_stats ON a2_paid = pa_paid AND a2_group = $2
          JOIN tpl_players p1 ON p1.pl_plid = pa_plid1
          JOIN tpl_players p2 ON p2.pl_plid = pa_plid2
          WHERE ${cols.partnerCount} >= $1
          ORDER BY ${cols.partnerAvg} DESC
        `,
        params: [min, group]
      })
    ])

    return NextResponse.json({ players, partnerships })
  } catch (err) {
    await write_logging({ lg_functionname: 'GET', lg_caller: 'rankings', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
