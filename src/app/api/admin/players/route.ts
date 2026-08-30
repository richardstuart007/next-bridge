//==============================================================================================
//  1) DESCRIPTION
//    GET — /api/admin/players route handler. Returns one filtered, paginated page of
//    tpl_players rows, each joined 1:1 to aggregated ta1_player_stats ('all' group) session
//    totals and MP average, plus the page/row totals for the same filter set.
//
//    Parameters:
//      request — query string: page, itemsPerPage, name, nzb, ranks, grades, clubs,
//                rating_min, a_points_min, sessions_min, tracked, excludeNzb0
//
//    Returns:
//      JSON { rows, totalPages, totalCount }; 500 { error } on failure
//==============================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { ROWS_PER_PAGE } from '@/src/lib/constants'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const pageParsed         = parseInt(searchParams.get('page') ?? '1', 10)
  const itemsPerPageParsed = parseInt(searchParams.get('itemsPerPage') ?? String(ROWS_PER_PAGE), 10)
  const page         = Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : 1
  const itemsPerPage = Number.isFinite(itemsPerPageParsed) && itemsPerPageParsed > 0 ? itemsPerPageParsed : ROWS_PER_PAGE
  const offset       = (page - 1) * itemsPerPage

  const { where, params } = buildWhere(searchParams)

  const fromJoin = `
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
  `

  try {
    const [rows, countRows] = await Promise.all([
      table_query({
        caller: 'admin/players',
        query: `
          SELECT pl_plid, pl_name, pl_club, pl_grade, pl_rank,
                 pl_a_points, pl_rating,
                 COALESCE(s.a1_sessions, 0) AS a1_sessions,
                 COALESCE(s.a1_avg_pct, 0)  AS a1_avg_pct,
                 pl_tracked, pl_nzb
          ${fromJoin}
          ORDER BY pl_name ASC
          LIMIT ${itemsPerPage} OFFSET ${offset}
        `,
        params
      }),
      table_query({
        caller: 'admin/players/count',
        query: `SELECT COUNT(*)::int AS n ${fromJoin}`,
        params
      })
    ])

    const totalCount = countRows[0]?.n ?? 0
    const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage))
    return NextResponse.json({ rows, totalPages, totalCount })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

//----------------------------------------------------------------------------------
//  buildWhere — builds the shared WHERE clause (and its bound params) for both the
//  page-of-rows query and the companion COUNT(*) query, so the two always agree on
//  which rows are being counted/fetched
//----------------------------------------------------------------------------------
function buildWhere(searchParams: URLSearchParams): { where: string; params: (string | number | boolean)[] } {
  const name       = searchParams.get('name')?.trim()  ?? ''
  const nzb        = searchParams.get('nzb')?.trim()   ?? ''
  const ranks      = searchParams.get('ranks')?.split(',').filter(Boolean)  ?? []
  const grades     = searchParams.get('grades')?.split(',').filter(Boolean) ?? []
  const clubs      = searchParams.get('clubs')?.split(',').filter(Boolean)  ?? []
  const ratingMin  = searchParams.get('rating_min')
  const aMin       = searchParams.get('a_points_min')
  const sessMin    = searchParams.get('sessions_min')
  const tracked    = searchParams.get('tracked') === 'true'
  const excludeNzb0 = searchParams.get('excludeNzb0') !== 'false'

  const conditions: string[] = []
  const params: (string | number | boolean)[] = []

  if (name) { params.push(`%${name}%`); conditions.push(`pl_name ILIKE $${params.length}`) }
  if (nzb)  { params.push(`%${nzb}%`);  conditions.push(`pl_nzb::text ILIKE $${params.length}`) }
  if (ranks.length > 0) {
    // Matches the normalization in populateRanks()/normalizeRank() — pl_rank itself may still
    // hold raw 'n/a'/'unknown'/'' values that the "No Rank" lookup option represents
    const placeholders = ranks.map(r => { params.push(r); return `$${params.length}` }).join(', ')
    conditions.push(`
      CASE WHEN LOWER(pl_rank) IN ('n/a', 'no rank', 'unknown') OR pl_rank = ''
           THEN 'No Rank' ELSE pl_rank END IN (${placeholders})
    `)
  }
  if (grades.length > 0) {
    const placeholders = grades.map(g => { params.push(g); return `$${params.length}` }).join(', ')
    conditions.push(`pl_grade IN (${placeholders})`)
  }
  if (clubs.length > 0) {
    const placeholders = clubs.map(c => { params.push(c); return `$${params.length}` }).join(', ')
    conditions.push(`pl_club IN (${placeholders})`)
  }
  if (ratingMin) { params.push(parseFloat(ratingMin)); conditions.push(`pl_rating >= $${params.length}`) }
  if (aMin)      { params.push(parseFloat(aMin));      conditions.push(`pl_a_points >= $${params.length}`) }
  if (sessMin)   { params.push(parseFloat(sessMin));   conditions.push(`COALESCE(s.a1_sessions, 0) >= $${params.length}`) }
  if (tracked)   conditions.push(`pl_tracked = true`)
  if (excludeNzb0) conditions.push(`pl_nzb > 0`)

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { where, params }
}
