import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import { SCORING_TYPES } from '@/src/lib/constants'

export async function GET(request: NextRequest) {
  const min = parseInt(request.nextUrl.searchParams.get('min') ?? '5', 10)
  const scoringParam = request.nextUrl.searchParams.get('scoring') ?? 'MP'
  const scoring = (SCORING_TYPES as readonly string[]).includes(scoringParam) ? scoringParam : 'MP'
  const group = request.nextUrl.searchParams.get('group') ?? 'C'

  try {
    const [players, partnerships] = await Promise.all([
      table_query({
        caller: 'rankings players',
        query: `
          SELECT
            pl_plid                  AS id,
            pl_name                  AS name,
            a1_avg                   AS avg_pct,
            a1_sessions               AS sessions,
            pl_grade                 AS grade,
            pl_club                  AS club,
            pl_all_results           AS tracked
          FROM tpl_players
          JOIN ta1_player_stats ON a1_plid = pl_plid AND a1_group = $2 AND a1_scoring = $3
          WHERE a1_sessions >= $1
          ORDER BY a1_avg DESC
        `,
        params: [min, group, scoring]
      }),
      table_query({
        caller: 'rankings partnerships',
        query: `
          SELECT
            pa_paid                  AS id,
            a2_sessions              AS sessions,
            a2_avg                   AS avg_pct,
            p1.pl_plid               AS player1_id,
            p1.pl_name               AS player1_name,
            p1.pl_all_results        AS player1_tracked,
            p2.pl_plid               AS player2_id,
            p2.pl_name               AS player2_name,
            p2.pl_all_results        AS player2_tracked
          FROM tpa_partners
          JOIN ta2_partner_stats ON a2_paid = pa_paid AND a2_group = $2 AND a2_scoring = $3
          JOIN tpl_players p1 ON p1.pl_plid = pa_plid1
          JOIN tpl_players p2 ON p2.pl_plid = pa_plid2
          WHERE a2_sessions >= $1
          ORDER BY a2_avg DESC
        `,
        params: [min, group, scoring]
      })
    ])

    return NextResponse.json({ players, partnerships })
  } catch (err) {
    await write_logging({ lg_functionname: 'GET', lg_caller: 'rankings', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
