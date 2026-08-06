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
  const playersMin = parseInt(searchParams.get('playersMin') ?? '5', 10)
  const partnersMin = parseInt(searchParams.get('partnersMin') ?? '5', 10)
  const scoringParam = searchParams.get('scoring') ?? 'MP'
  const scoring = (SCORING_TYPES as readonly string[]).includes(scoringParam) ? scoringParam : 'MP'
  const group = searchParams.get('group') ?? 'C'

  const name = searchParams.get('name')?.trim() ?? ''
  const nzb     = searchParams.get('nzb')?.trim() ?? ''
  const grades  = searchParams.get('grades')?.split(',').filter(Boolean) ?? []
  const clubs   = searchParams.get('clubs')?.split(',').filter(Boolean)  ?? []
  const tracked = searchParams.get('tracked') === 'true'

  const name1 = searchParams.get('name1')?.trim() ?? ''
  const name2 = searchParams.get('name2')?.trim() ?? ''
  const nzb1  = searchParams.get('nzb1')?.trim()  ?? ''
  const nzb2  = searchParams.get('nzb2')?.trim()  ?? ''
  const paid            = searchParams.get('paid')?.trim() ?? ''
  const partnerTracked = searchParams.get('partnerTracked') === 'true'

  try {
    const playersConditions: string[] = ['a1_sessions >= $1']
    const playersParams: (string | number)[] = [playersMin, group, scoring]
    if (name) {
      playersParams.push(`%${name}%`)
      playersConditions.push(`pl_name ILIKE $${playersParams.length}`)
    }
    if (nzb) {
      playersParams.push(`%${nzb}%`)
      playersConditions.push(`pl_nzb::text ILIKE $${playersParams.length}`)
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
    const partnersParams: (string | number)[] = [partnersMin, group, scoring]
    if (name1) {
      partnersParams.push(`%${name1}%`)
      partnersConditions.push(`pl_name1 ILIKE $${partnersParams.length}`)
    }
    if (name2) {
      partnersParams.push(`%${name2}%`)
      partnersConditions.push(`pl_name2 ILIKE $${partnersParams.length}`)
    }
    if (nzb1) {
      partnersParams.push(`%${nzb1}%`)
      partnersConditions.push(`pl_nzb1::text ILIKE $${partnersParams.length}`)
    }
    if (nzb2) {
      partnersParams.push(`%${nzb2}%`)
      partnersConditions.push(`pl_nzb2::text ILIKE $${partnersParams.length}`)
    }
    if (paid) {
      partnersParams.push(`%${paid}%`)
      partnersConditions.push(`pa_paid::text ILIKE $${partnersParams.length}`)
    }
    if (partnerTracked) partnersConditions.push(`(pl_tracked1 = true OR pl_tracked2 = true)`)
    const partnersWhere = partnersConditions.join(' AND ')
    const { limit: partnersLimit, offset: partnersOffset } = pageParams(searchParams, 'partners')

    const playersFrom = `
      FROM tpl_players
      JOIN ta1_player_stats ON a1_plid = pl_plid AND a1_group = $2 AND a1_scoring = $3
      WHERE ${playersWhere}
    `
    //
    //  pa_plid1/pa_plid2 storage order is not reliably alphabetical (two different write paths
    //  use different conventions — see Data flow.md) — so this subquery always puts the
    //  alphabetically-first player into the *1 columns for display/filtering, regardless of how
    //  the pair happens to be stored
    //
    const partnersFrom = `
      FROM (
        SELECT
          pa_paid,
          a2_sessions,
          a2_avg,
          a2_avg_rank,
          CASE WHEN p1.pl_name <= p2.pl_name THEN p1.pl_plid ELSE p2.pl_plid END AS pl_plid1,
          CASE WHEN p1.pl_name <= p2.pl_name THEN p1.pl_name ELSE p2.pl_name END AS pl_name1,
          CASE WHEN p1.pl_name <= p2.pl_name THEN p1.pl_tracked ELSE p2.pl_tracked END AS pl_tracked1,
          CASE WHEN p1.pl_name <= p2.pl_name THEN p1.pl_nzb ELSE p2.pl_nzb END AS pl_nzb1,
          CASE WHEN p1.pl_name <= p2.pl_name THEN p2.pl_plid ELSE p1.pl_plid END AS pl_plid2,
          CASE WHEN p1.pl_name <= p2.pl_name THEN p2.pl_name ELSE p1.pl_name END AS pl_name2,
          CASE WHEN p1.pl_name <= p2.pl_name THEN p2.pl_tracked ELSE p1.pl_tracked END AS pl_tracked2,
          CASE WHEN p1.pl_name <= p2.pl_name THEN p2.pl_nzb ELSE p1.pl_nzb END AS pl_nzb2
        FROM tpa_partners
        JOIN ta2_partner_stats ON a2_paid = pa_paid AND a2_group = $2 AND a2_scoring = $3
        JOIN tpl_players p1 ON p1.pl_plid = pa_plid1
        JOIN tpl_players p2 ON p2.pl_plid = pa_plid2
      ) t
      WHERE ${partnersWhere}
    `

    const [players, playersCount, partnerships, partnersCount, playersGroupTotalRows, partnersGroupTotalRows] = await Promise.all([
      table_query({
        caller: 'rankings players',
        query: `
          SELECT
            pl_plid,
            pl_name,
            pl_nzb,
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
        params: playersParams,
        skipCache: true
      }),
      table_query({
        caller: 'rankings players/count',
        query: `SELECT COUNT(*)::int AS n ${playersFrom}`,
        params: playersParams,
        skipCache: true
      }),
      table_query({
        caller: 'rankings partnerships',
        query: `
          SELECT
            pa_paid,
            a2_sessions,
            a2_avg,
            a2_avg_rank,
            pl_plid1,
            pl_name1,
            pl_tracked1,
            pl_nzb1,
            pl_plid2,
            pl_name2,
            pl_tracked2,
            pl_nzb2
          ${partnersFrom}
          ORDER BY a2_avg DESC
          LIMIT ${partnersLimit} OFFSET ${partnersOffset}
        `,
        params: partnersParams,
        skipCache: true
      }),
      table_query({
        caller: 'rankings partnerships/count',
        query: `SELECT COUNT(*)::int AS n ${partnersFrom}`,
        params: partnersParams,
        skipCache: true
      }),
      table_query({
        caller: 'rankings players/groupTotal',
        query: `SELECT a1_group_total FROM ta1_player_stats WHERE a1_group = $1 AND a1_scoring = $2 AND a1_group_total IS NOT NULL LIMIT 1`,
        params: [group, scoring],
        skipCache: true
      }),
      table_query({
        caller: 'rankings partnerships/groupTotal',
        query: `SELECT a2_group_total FROM ta2_partner_stats WHERE a2_group = $1 AND a2_scoring = $2 AND a2_group_total IS NOT NULL LIMIT 1`,
        params: [group, scoring],
        skipCache: true
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
