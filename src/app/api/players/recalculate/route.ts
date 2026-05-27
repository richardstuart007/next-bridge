import { NextRequest } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

const GRP_EXPR = `CASE WHEN RIGHT(se_tournament,1)='A' THEN 'A' WHEN RIGHT(se_tournament,1)='B' THEN 'B' ELSE 'C' END`

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
            INSERT INTO ta1_player_stats (a1_plid, a1_group, a1_mp_sessions, a1_mp_avg_pct, a1_mp_stddev, a1_vp_sessions, a1_vp_avg_vp, a1_vp_stddev)
            SELECT u.plid,
                   ${isAll ? "'all'" : '$1::varchar'},
                   COUNT(*) FILTER (WHERE se_scoring = 'MP')::integer,
                   COALESCE(ROUND(AVG(re_percentage) FILTER (WHERE se_scoring = 'MP')::numeric, 2), 0),
                   ROUND(STDDEV_SAMP(re_percentage)  FILTER (WHERE se_scoring = 'MP')::numeric, 2),
                   COUNT(*) FILTER (WHERE se_scoring = 'VP')::integer,
                   COALESCE(ROUND(AVG(re_vp)        FILTER (WHERE se_scoring = 'VP')::numeric, 2), 0),
                   ROUND(STDDEV_SAMP(re_vp)         FILTER (WHERE se_scoring = 'VP')::numeric, 2)
            FROM tre_results
            JOIN tse_sessions ON se_seid = re_seid
            JOIN tpa_partners ON pa_paid = re_paid
            CROSS JOIN LATERAL unnest(ARRAY[pa_plid1, pa_plid2]) AS u(plid)
            WHERE se_is_summary IS NOT TRUE
            ${isAll ? '' : `AND ${GRP_EXPR} = $1`}
            GROUP BY u.plid
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
            INSERT INTO ta2_partner_stats (a2_paid, a2_group, a2_mp_sessions, a2_mp_avg_pct, a2_mp_stddev, a2_vp_sessions, a2_vp_avg_vp, a2_vp_stddev)
            SELECT re_paid,
                   ${isAll ? "'all'" : '$1::varchar'},
                   COUNT(*) FILTER (WHERE se_scoring = 'MP')::integer,
                   COALESCE(ROUND(AVG(re_percentage) FILTER (WHERE se_scoring = 'MP')::numeric, 2), 0),
                   ROUND(STDDEV_SAMP(re_percentage)  FILTER (WHERE se_scoring = 'MP')::numeric, 2),
                   COUNT(*) FILTER (WHERE se_scoring = 'VP')::integer,
                   COALESCE(ROUND(AVG(re_vp)        FILTER (WHERE se_scoring = 'VP')::numeric, 2), 0),
                   ROUND(STDDEV_SAMP(re_vp)         FILTER (WHERE se_scoring = 'VP')::numeric, 2)
            FROM tre_results
            JOIN tse_sessions ON se_seid = re_seid
            WHERE se_is_summary IS NOT TRUE
            ${isAll ? '' : `AND ${GRP_EXPR} = $1`}
            GROUP BY re_paid
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
