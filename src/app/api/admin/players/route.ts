import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const name  = searchParams.get('name')?.trim()  ?? ''
  const club  = searchParams.get('club')?.trim()  ?? ''
  const grade = searchParams.get('grade')?.trim() ?? ''

  const conditions: string[] = []
  const params: (string | number | boolean | null)[] = []

  if (name)  { params.push(`%${name}%`);  conditions.push(`pl_name  ILIKE $${params.length}`) }
  if (club)  { params.push(`%${club}%`);  conditions.push(`pl_club  ILIKE $${params.length}`) }
  if (grade) { params.push(`%${grade}%`); conditions.push(`pl_grade ILIKE $${params.length}`) }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const rows = await table_query({
      caller: 'admin/players',
      query: `
        SELECT pl_plid, pl_name, pl_club, pl_grade, pl_rank,
               pl_a_points, pl_rating,
               COALESCE(s.a1_sessions, 0) AS a1_sessions,
               COALESCE(s.a1_avg_pct, 0)  AS a1_avg_pct,
               pl_all_results, pl_nz_bridge_number
        FROM tpl_players
        LEFT JOIN (
          SELECT a1_plid,
                 SUM(a1_sessions) AS a1_sessions,
                 MAX(a1_avg) FILTER (WHERE a1_scoring = 'MP') AS a1_avg_pct
          FROM ta1_player_stats
          WHERE a1_group = 'all'
          GROUP BY a1_plid
        ) s ON s.a1_plid = pl_plid
        ${where}
        ORDER BY pl_name ASC
      `,
      params
    })
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
