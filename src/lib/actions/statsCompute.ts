'use server'

import { table_query } from 'nextjs-shared/table_query'

const GRP_EXPR = `CASE WHEN RIGHT(se_tournament,1)='A' THEN 'A' WHEN RIGHT(se_tournament,1)='B' THEN 'B' ELSE 'C' END`

//----------------------------------------------------------------------------------
//  computePlayerGroupStats — (re)computes ta1_player_stats for one tournament group
//  ('A'/'B'/'C') or 'all'. Upsert on (a1_plid, a1_group) so each group can be re-run
//  independently with no truncate needed first. Shared by /api/players/recalculate
//  (one group per call) and rebuildAllStats() (all groups in one batch).
//----------------------------------------------------------------------------------
export async function computePlayerGroupStats(grp: string): Promise<number> {
  const isAll = grp === 'all'
  const rows = await table_query({
    caller: `statsCompute/player-${grp}`,
    query: `INSERT INTO ta1_player_stats
              (a1_plid, a1_group, a1_mp_sessions, a1_mp_avg_pct, a1_mp_stddev,
               a1_vp_sessions, a1_vp_avg_vp, a1_vp_stddev)
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
            ON CONFLICT (a1_plid, a1_group) DO UPDATE SET
              a1_mp_sessions = EXCLUDED.a1_mp_sessions,
              a1_mp_avg_pct  = EXCLUDED.a1_mp_avg_pct,
              a1_mp_stddev   = EXCLUDED.a1_mp_stddev,
              a1_vp_sessions = EXCLUDED.a1_vp_sessions,
              a1_vp_avg_vp   = EXCLUDED.a1_vp_avg_vp,
              a1_vp_stddev   = EXCLUDED.a1_vp_stddev
            RETURNING 1`,
    params: isAll ? [] : [grp],
    isupdate: true
  })
  return rows.length
}

//----------------------------------------------------------------------------------
//  computePartnerGroupStats — (re)computes ta2_partner_stats for one tournament group
//  ('A'/'B'/'C') or 'all'. Upsert on (a2_paid, a2_group), same reasoning as above.
//----------------------------------------------------------------------------------
export async function computePartnerGroupStats(grp: string): Promise<number> {
  const isAll = grp === 'all'
  const rows = await table_query({
    caller: `statsCompute/partner-${grp}`,
    query: `INSERT INTO ta2_partner_stats
              (a2_paid, a2_group, a2_mp_sessions, a2_mp_avg_pct, a2_mp_stddev,
               a2_vp_sessions, a2_vp_avg_vp, a2_vp_stddev)
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
            ON CONFLICT (a2_paid, a2_group) DO UPDATE SET
              a2_mp_sessions = EXCLUDED.a2_mp_sessions,
              a2_mp_avg_pct  = EXCLUDED.a2_mp_avg_pct,
              a2_mp_stddev   = EXCLUDED.a2_mp_stddev,
              a2_vp_sessions = EXCLUDED.a2_vp_sessions,
              a2_vp_avg_vp   = EXCLUDED.a2_vp_avg_vp,
              a2_vp_stddev   = EXCLUDED.a2_vp_stddev
            RETURNING 1`,
    params: isAll ? [] : [grp],
    isupdate: true
  })
  return rows.length
}
