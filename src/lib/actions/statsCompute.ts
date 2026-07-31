'use server'

import { table_query } from 'nextjs-shared/table_query'
import { TOURNAMENT_GROUP_SQL_EXPR } from '@/src/lib/constants'

const GRP_EXPR = TOURNAMENT_GROUP_SQL_EXPR

//----------------------------------------------------------------------------------
//  computePlayerGroupStats — (re)computes ta1_player_stats for one tournament group
//  ('A'/'B'/'C') or 'all'. Upsert on (a1_plid, a1_group) so each group can be re-run
//  independently with no truncate needed first. Shared by /api/players/recalculate
//  (one group per call) and rebuildAllStats() (all groups in one batch).
//----------------------------------------------------------------------------------
export async function computePlayerGroupStats(grp: string): Promise<{ inserted: number; inputRecs: number }> {
  const isAll = grp === 'all'
  const inputRows = await table_query({
    caller: `statsCompute/player-${grp}-input`,
    query: `SELECT COUNT(*)::int AS n
            FROM tre_results
            JOIN tse_sessions ON se_seid = re_seid
            JOIN tpa_partners ON pa_paid = re_paid
            WHERE se_is_summary IS NOT TRUE
            ${isAll ? '' : `AND ${GRP_EXPR} = $1`}`,
    params: isAll ? [] : [grp]
  }) as { n: number }[]
  const inputRecs = inputRows[0]?.n ?? 0

  const rows = await table_query({
    caller: `statsCompute/player-${grp}`,
    query: `INSERT INTO ta1_player_stats
              (a1_plid, a1_group, a1_scoring, a1_sessions, a1_avg, a1_stddev)
            SELECT u.plid,
                   ${isAll ? "'all'" : '$1::varchar'},
                   se_scoring,
                   COUNT(*)::integer,
                   COALESCE(ROUND(AVG(re_score)::numeric, 2), 0),
                   ROUND(STDDEV_SAMP(re_score)::numeric, 2)
            FROM tre_results
            JOIN tse_sessions ON se_seid = re_seid
            JOIN tpa_partners ON pa_paid = re_paid
            CROSS JOIN LATERAL unnest(ARRAY[pa_plid1, pa_plid2]) AS u(plid)
            WHERE se_is_summary IS NOT TRUE
            ${isAll ? '' : `AND ${GRP_EXPR} = $1`}
            GROUP BY u.plid, se_scoring
            ON CONFLICT (a1_plid, a1_group, a1_scoring) DO UPDATE SET
              a1_sessions = EXCLUDED.a1_sessions,
              a1_avg      = EXCLUDED.a1_avg,
              a1_stddev   = EXCLUDED.a1_stddev
            RETURNING 1`,
    params: isAll ? [] : [grp],
    isupdate: true
  })
  return { inserted: rows.length, inputRecs }
}

//----------------------------------------------------------------------------------
//  computePartnerGroupStats — (re)computes ta2_partner_stats for one tournament group
//  ('A'/'B'/'C') or 'all'. Upsert on (a2_paid, a2_group), same reasoning as above.
//----------------------------------------------------------------------------------
export async function computePartnerGroupStats(grp: string): Promise<{ inserted: number; inputRecs: number }> {
  const isAll = grp === 'all'
  const inputRows = await table_query({
    caller: `statsCompute/partner-${grp}-input`,
    query: `SELECT COUNT(*)::int AS n
            FROM tre_results
            JOIN tse_sessions ON se_seid = re_seid
            WHERE se_is_summary IS NOT TRUE
            ${isAll ? '' : `AND ${GRP_EXPR} = $1`}`,
    params: isAll ? [] : [grp]
  }) as { n: number }[]
  const inputRecs = inputRows[0]?.n ?? 0

  const rows = await table_query({
    caller: `statsCompute/partner-${grp}`,
    query: `INSERT INTO ta2_partner_stats
              (a2_paid, a2_group, a2_scoring, a2_sessions, a2_avg, a2_stddev)
            SELECT re_paid,
                   ${isAll ? "'all'" : '$1::varchar'},
                   se_scoring,
                   COUNT(*)::integer,
                   COALESCE(ROUND(AVG(re_score)::numeric, 2), 0),
                   ROUND(STDDEV_SAMP(re_score)::numeric, 2)
            FROM tre_results
            JOIN tse_sessions ON se_seid = re_seid
            WHERE se_is_summary IS NOT TRUE
            ${isAll ? '' : `AND ${GRP_EXPR} = $1`}
            GROUP BY re_paid, se_scoring
            ON CONFLICT (a2_paid, a2_group, a2_scoring) DO UPDATE SET
              a2_sessions = EXCLUDED.a2_sessions,
              a2_avg      = EXCLUDED.a2_avg,
              a2_stddev   = EXCLUDED.a2_stddev
            RETURNING 1`,
    params: isAll ? [] : [grp],
    isupdate: true
  })
  return { inserted: rows.length, inputRecs }
}
