'use server'

import { table_query } from 'nextjs-shared/table_query'

/** tre_results for a session, with player and partner names. */
export async function getResultsBySeid(seid: number) {
  return table_query({
    caller: 'build-viewer/resultsBySeid',
    query: `SELECT p1.pl_name AS player, p2.pl_name AS partner,
                   re_percentage AS pct, re_vp AS vp
            FROM tre_results
            JOIN tpa_partners ON pa_paid = re_paid
            JOIN tpl_players p1 ON p1.pl_plid = pa_plid1
            JOIN tpl_players p2 ON p2.pl_plid = pa_plid2
            WHERE re_seid = $1
            ORDER BY re_percentage DESC`,
    params: [seid]
  })
}

/** tre_results for a player, with session info and partner name. */
export async function getResultsByPlid(plid: number) {
  return table_query({
    caller: 'build-viewer/resultsByPlid',
    query: `SELECT se_date::text AS date, se_scoring AS scoring,
                   se_name AS session,
                   pl_name AS partner,
                   re_percentage AS pct, re_vp AS vp
            FROM tre_results
            JOIN tse_sessions ON se_seid = re_seid
            JOIN tpa_partners ON pa_paid = re_paid
            JOIN tpl_players ON pl_plid =
              CASE WHEN pa_plid1 = $1 THEN pa_plid2 ELSE pa_plid1 END
            WHERE pa_plid1 = $1 OR pa_plid2 = $1
            ORDER BY se_date DESC`,
    params: [plid]
  })
}

/** All partnerships with player names, ordered by session count (C-group). */
export async function getAllPartners() {
  return table_query({
    caller: 'build-viewer/allPartners',
    query: `SELECT p1.pl_name AS player1, p2.pl_name AS player2,
                   a2_mp_sessions + a2_vp_sessions AS sessions,
                   a2_mp_avg_pct AS avg_pct,
                   a2_mp_sessions AS mp, a2_vp_sessions AS vp
            FROM tpa_partners
            JOIN ta2_partner_stats ON a2_paid = pa_paid AND a2_group = 'C'
            JOIN tpl_players p1 ON p1.pl_plid = pa_plid1
            JOIN tpl_players p2 ON p2.pl_plid = pa_plid2
            ORDER BY a2_mp_sessions + a2_vp_sessions DESC`,
    params: []
  })
}
