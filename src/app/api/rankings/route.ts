import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import { SCORING_TYPES, ROWS_PER_PAGE } from '@/src/lib/constants'

//----------------------------------------------------------------------------------
//  pageParams — resolves page/itemsPerPage for one tab. A `topN` selection (e.g. "Top
//  25") overrides itemsPerPage and forces a single page, matching the Rankings page's
//  existing "Top N" concept — real page/itemsPerPage-based browsing otherwise applies.
//----------------------------------------------------------------------------------
function pageParams(searchParams: URLSearchParams, prefix: string): { limit: number; offset: number } {
  const topN            = parseInt(searchParams.get(`${prefix}TopN`) ?? '0', 10)
  const pageParsed       = parseInt(searchParams.get(`${prefix}Page`) ?? '1', 10)
  const itemsPerPageParsed = parseInt(searchParams.get(`${prefix}ItemsPerPage`) ?? String(ROWS_PER_PAGE), 10)
  const page         = Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : 1
  const itemsPerPage = Number.isFinite(itemsPerPageParsed) && itemsPerPageParsed > 0 ? itemsPerPageParsed : ROWS_PER_PAGE

  if (Number.isFinite(topN) && topN > 0) return { limit: topN, offset: 0 }
  return { limit: itemsPerPage, offset: (page - 1) * itemsPerPage }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const min = parseInt(searchParams.get('min') ?? '5', 10)
  const scoringParam = searchParams.get('scoring') ?? 'MP'
  const scoring = (SCORING_TYPES as readonly string[]).includes(scoringParam) ? scoringParam : 'MP'
  const group = searchParams.get('group') ?? 'C'

  const playerSearch = searchParams.get('playerSearch')?.trim() ?? ''
  const grades  = searchParams.get('grades')?.split(',').filter(Boolean) ?? []
  const clubs   = searchParams.get('clubs')?.split(',').filter(Boolean)  ?? []
  const tracked = searchParams.get('tracked') === 'true'

  const partnerSearch  = searchParams.get('partnerSearch')?.trim() ?? ''
  const partnerTracked = searchParams.get('partnerTracked') === 'true'

  try {
    const playersConditions: string[] = ['a1_sessions >= $1']
    const playersParams: (string | number)[] = [min, group, scoring]
    if (playerSearch) {
      playersParams.push(`%${playerSearch}%`)
      playersConditions.push(`pl_name ILIKE $${playersParams.length}`)
    }
    if (grades.length > 0) {
      const placeholders = grades.map(g => { playersParams.push(g); return `$${playersParams.length}` }).join(', ')
      playersConditions.push(`pl_grade IN (${placeholders})`)
    }
    if (clubs.length > 0) {
      const placeholders = clubs.map(c => { playersParams.push(c); return `$${playersParams.length}` }).join(', ')
      playersConditions.push(`pl_club IN (${placeholders})`)
    }
    if (tracked) playersConditions.push(`pl_tracked = true`)
    const playersWhere = playersConditions.join(' AND ')
    const { limit: playersLimit, offset: playersOffset } = pageParams(searchParams, 'players')

    const partnersConditions: string[] = ['a2_sessions >= $1']
    const partnersParams: (string | number)[] = [min, group, scoring]
    if (partnerSearch) {
      partnersParams.push(`%${partnerSearch}%`)
      partnersConditions.push(`(p1.pl_name ILIKE $${partnersParams.length} OR p2.pl_name ILIKE $${partnersParams.length})`)
    }
    if (partnerTracked) partnersConditions.push(`(p1.pl_tracked = true OR p2.pl_tracked = true)`)
    const partnersWhere = partnersConditions.join(' AND ')
    const { limit: partnersLimit, offset: partnersOffset } = pageParams(searchParams, 'partners')

    const playersFrom = `
      FROM tpl_players
      JOIN ta1_player_stats ON a1_plid = pl_plid AND a1_group = $2 AND a1_scoring = $3
      WHERE ${playersWhere}
    `
    const partnersFrom = `
      FROM tpa_partners
      JOIN ta2_partner_stats ON a2_paid = pa_paid AND a2_group = $2 AND a2_scoring = $3
      JOIN tpl_players p1 ON p1.pl_plid = pa_plid1
      JOIN tpl_players p2 ON p2.pl_plid = pa_plid2
      WHERE ${partnersWhere}
    `

    const [players, playersCount, partnerships, partnersCount, playersGroupTotalRows, partnersGroupTotalRows] = await Promise.all([
      table_query({
        caller: 'rankings players',
        query: `
          SELECT
            pl_plid,
            pl_name,
            a1_avg,
            a1_sessions,
            a1_avg_rank,
            pl_grade,
            pl_club,
            pl_tracked
          ${playersFrom}
          ORDER BY a1_avg DESC
          LIMIT ${playersLimit} OFFSET ${playersOffset}
        `,
        params: playersParams
      }),
      table_query({
        caller: 'rankings players/count',
        query: `SELECT COUNT(*)::int AS n ${playersFrom}`,
        params: playersParams
      }),
      table_query({
        caller: 'rankings partnerships',
        query: `
          SELECT
            pa_paid,
            a2_sessions,
            a2_avg,
            a2_avg_rank,
            p1.pl_plid               AS pl_plid1,
            p1.pl_name               AS pl_name1,
            p1.pl_tracked        AS pl_tracked1,
            p2.pl_plid               AS pl_plid2,
            p2.pl_name               AS pl_name2,
            p2.pl_tracked        AS pl_tracked2
          ${partnersFrom}
          ORDER BY a2_avg DESC
          LIMIT ${partnersLimit} OFFSET ${partnersOffset}
        `,
        params: partnersParams
      }),
      table_query({
        caller: 'rankings partnerships/count',
        query: `SELECT COUNT(*)::int AS n ${partnersFrom}`,
        params: partnersParams
      }),
      table_query({
        caller: 'rankings players/groupTotal',
        query: `SELECT a1_group_total FROM ta1_player_stats WHERE a1_group = $1 AND a1_scoring = $2 LIMIT 1`,
        params: [group, scoring]
      }),
      table_query({
        caller: 'rankings partnerships/groupTotal',
        query: `SELECT a2_group_total FROM ta2_partner_stats WHERE a2_group = $1 AND a2_scoring = $2 LIMIT 1`,
        params: [group, scoring]
      })
    ])

    const playersTotalCount = playersCount[0]?.n ?? 0
    const partnersTotalCount = partnersCount[0]?.n ?? 0

    return NextResponse.json({
      players,
      playersTotalPages: Math.max(1, Math.ceil(playersTotalCount / playersLimit)),
      playersTotalCount,
      playersGroupTotal: playersGroupTotalRows[0]?.a1_group_total ?? null,
      partnerships,
      partnersTotalPages: Math.max(1, Math.ceil(partnersTotalCount / partnersLimit)),
      partnersTotalCount,
      partnersGroupTotal: partnersGroupTotalRows[0]?.a2_group_total ?? null
    })
  } catch (err) {
    await write_logging({ lg_functionname: 'GET', lg_caller: 'rankings', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
