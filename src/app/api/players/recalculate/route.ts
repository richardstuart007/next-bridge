import { NextRequest } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

const GRP_EXPR = `CASE WHEN RIGHT(se.se_tournament,1)='A' THEN 'A' WHEN RIGHT(se.se_tournament,1)='B' THEN 'B' ELSE 'C' END`

export async function POST(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const mode = searchParams.get('mode') ?? ''
  const grp  = searchParams.get('grp')  ?? ''

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  async function send(data: object) {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  ;(async () => {
    try {
      if (mode === 'player_truncate') {
        await table_query({ caller: 'recalculate/player_truncate', query: `TRUNCATE ta1_player_stats`, params: [] })
        await send({ done: true, updated: 0, failed: 0 })

      } else if (mode === 'player_grp') {
        const isAll = grp === 'all'
        const rows = await table_query({
          caller: `recalculate/player_${grp}`,
          query: `
            INSERT INTO ta1_player_stats (a1_plid, a1_group, a1_mp_sessions, a1_mp_avg_pct, a1_vp_sessions, a1_vp_avg_vp)
            SELECT re.re_plid1,
                   ${isAll ? "'all'" : '$1::varchar'},
                   COUNT(*) FILTER (WHERE se.se_scoring = 'MP')::integer,
                   COALESCE(ROUND(AVG(re.re_percentage) FILTER (WHERE se.se_scoring = 'MP')::numeric, 2), 0),
                   COUNT(*) FILTER (WHERE se.se_scoring = 'VP')::integer,
                   COALESCE(ROUND(AVG(re.re_vp)         FILTER (WHERE se.se_scoring = 'VP')::numeric, 2), 0)
            FROM tre_results re
            JOIN tse_sessions se ON se.se_seid = re.re_seid
            ${isAll ? '' : `WHERE ${GRP_EXPR} = $1`}
            GROUP BY re.re_plid1
            RETURNING 1
          `,
          params: isAll ? [] : [grp]
        })
        await send({ done: true, updated: rows.length, failed: 0 })

      } else if (mode === 'partner_truncate') {
        await table_query({ caller: 'recalculate/partner_truncate', query: `TRUNCATE ta2_partner_stats`, params: [] })
        await send({ done: true, updated: 0, failed: 0 })

      } else if (mode === 'partner_grp') {
        const isAll = grp === 'all'
        const rows = await table_query({
          caller: `recalculate/partner_${grp}`,
          query: `
            WITH pairs AS (
              SELECT CASE WHEN p1.pl_name <= p2.pl_name THEN re.re_plid1 ELSE re.re_plid2 END AS plid1,
                     CASE WHEN p1.pl_name <= p2.pl_name THEN re.re_plid2 ELSE re.re_plid1 END AS plid2,
                     re.re_percentage, re.re_vp, se.se_scoring
              FROM tre_results re
              JOIN tse_sessions se ON se.se_seid = re.re_seid
              JOIN tpl_players p1 ON p1.pl_plid = LEAST(re.re_plid1,    re.re_plid2)
              JOIN tpl_players p2 ON p2.pl_plid = GREATEST(re.re_plid1, re.re_plid2)
              WHERE re.re_plid1 < re.re_plid2
                ${isAll ? '' : `AND ${GRP_EXPR} = $1`}
            )
            INSERT INTO ta2_partner_stats (a2_plid1, a2_plid2, a2_group, a2_mp_sessions, a2_mp_avg_pct, a2_vp_sessions, a2_vp_avg_vp)
            SELECT plid1, plid2,
                   ${isAll ? "'all'" : '$1::varchar'},
                   COUNT(*) FILTER (WHERE se_scoring = 'MP')::integer,
                   COALESCE(ROUND(AVG(re_percentage) FILTER (WHERE se_scoring = 'MP')::numeric, 2), 0),
                   COUNT(*) FILTER (WHERE se_scoring = 'VP')::integer,
                   COALESCE(ROUND(AVG(re_vp)         FILTER (WHERE se_scoring = 'VP')::numeric, 2), 0)
            FROM pairs GROUP BY plid1, plid2
            RETURNING 1
          `,
          params: isAll ? [] : [grp]
        })
        await send({ done: true, updated: rows.length, failed: 0 })
      }
    } catch (err) {
      await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/recalculate', lg_msg: String(err), lg_severity: 'E' })
      await send({ error: String(err) })
    } finally {
      try { await writer.close() } catch { /* already closed */ }
    }
  })()

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}
