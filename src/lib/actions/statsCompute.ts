'use server'

import { table_query } from 'nextjs-shared/table_query'
import {
  TOURNAMENT_GROUP_SQL_EXPR,
  MIN_RANKING_SESSIONS_MP, MIN_RANKING_SESSIONS_VP, MIN_RANKING_SESSIONS_XIMP,
  MIN_RANKING_SESSIONS_PARTNER_MP, MIN_RANKING_SESSIONS_PARTNER_VP, MIN_RANKING_SESSIONS_PARTNER_XIMP
} from '@/src/lib/constants'

const GRP_EXPR = TOURNAMENT_GROUP_SQL_EXPR

//
//  Per-scoring-type minimum-sessions floor for a real precomputed rank — see the matching
//  comment on the constants themselves. Expressed as a SQL CASE so it can be dropped straight
//  into a WHERE clause against a1_sessions/a2_sessions. Players and partnerships use separate
//  constants (partnerships accumulate shared sessions far slower), so each gets its own CASE.
//
const MIN_RANKING_SESSIONS_CASE_SQL = `
  CASE a1_scoring
    WHEN 'MP' THEN ${MIN_RANKING_SESSIONS_MP}
    WHEN 'VP' THEN ${MIN_RANKING_SESSIONS_VP}
    WHEN 'XIMP' THEN ${MIN_RANKING_SESSIONS_XIMP}
  END`
const MIN_RANKING_SESSIONS_CASE_SQL_A2 = `
  CASE a2_scoring
    WHEN 'MP' THEN ${MIN_RANKING_SESSIONS_PARTNER_MP}
    WHEN 'VP' THEN ${MIN_RANKING_SESSIONS_PARTNER_VP}
    WHEN 'XIMP' THEN ${MIN_RANKING_SESSIONS_PARTNER_XIMP}
  END`

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

  //
  //  Precompute rank/group_total/pct_rank for this group now that its averages are current —
  //  read on every Rankings/Player Stats page view otherwise, even though this data is static
  //  until the next "Update Stats" run. Only rows meeting their scoring type's
  //  MIN_RANKING_SESSIONS_* floor are ranked; below it, rank is reset to NULL (a player who
  //  drops back below threshold on a recompute must not keep a stale rank).
  //
  await table_query({
    caller: `statsCompute/player-${grp}-rank`,
    query: `UPDATE ta1_player_stats t
            SET a1_avg_rank    = sub.avg_rank,
                a1_group_total = sub.group_total,
                a1_pct_rank    = sub.pct_rank
            FROM (
              SELECT a1_plid, a1_scoring,
                     RANK() OVER (PARTITION BY a1_scoring ORDER BY a1_avg DESC) AS avg_rank,
                     COUNT(*) OVER (PARTITION BY a1_scoring) AS group_total,
                     PERCENT_RANK() OVER (PARTITION BY a1_scoring ORDER BY a1_stddev NULLS LAST) AS pct_rank
              FROM ta1_player_stats
              WHERE a1_group = $1 AND a1_sessions >= ${MIN_RANKING_SESSIONS_CASE_SQL}
            ) sub
            WHERE t.a1_group = $1 AND t.a1_plid = sub.a1_plid AND t.a1_scoring = sub.a1_scoring`,
    params: [grp],
    isupdate: true
  })
  await table_query({
    caller: `statsCompute/player-${grp}-rank-reset`,
    query: `UPDATE ta1_player_stats
            SET a1_avg_rank = NULL, a1_group_total = NULL, a1_pct_rank = NULL
            WHERE a1_group = $1 AND a1_sessions < ${MIN_RANKING_SESSIONS_CASE_SQL}`,
    params: [grp],
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

  //
  //  Precompute rank/group_total for this group now that its averages are current — see the
  //  matching comment in computePlayerGroupStats for the full reasoning, including the
  //  per-scoring-type MIN_RANKING_SESSIONS_* floor and NULL-reset for rows below it
  //
  await table_query({
    caller: `statsCompute/partner-${grp}-rank`,
    query: `UPDATE ta2_partner_stats t
            SET a2_avg_rank    = sub.avg_rank,
                a2_group_total = sub.group_total
            FROM (
              SELECT a2_paid, a2_scoring,
                     RANK() OVER (PARTITION BY a2_scoring ORDER BY a2_avg DESC) AS avg_rank,
                     COUNT(*) OVER (PARTITION BY a2_scoring) AS group_total
              FROM ta2_partner_stats
              WHERE a2_group = $1 AND a2_sessions >= ${MIN_RANKING_SESSIONS_CASE_SQL_A2}
            ) sub
            WHERE t.a2_group = $1 AND t.a2_paid = sub.a2_paid AND t.a2_scoring = sub.a2_scoring`,
    params: [grp],
    isupdate: true
  })
  await table_query({
    caller: `statsCompute/partner-${grp}-rank-reset`,
    query: `UPDATE ta2_partner_stats
            SET a2_avg_rank = NULL, a2_group_total = NULL
            WHERE a2_group = $1 AND a2_sessions < ${MIN_RANKING_SESSIONS_CASE_SQL_A2}`,
    params: [grp],
    isupdate: true
  })

  return { inserted: rows.length, inputRecs }
}
