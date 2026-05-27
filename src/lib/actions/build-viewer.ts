'use server'

import { table_query } from 'nextjs-shared/table_query'

/** tre_results for a session, with player and partner names. */
export async function getResultsBySeid(seid: number) {
  return table_query({
    caller: 'build-viewer/resultsBySeid',
    query: `SELECT p1.pl_name AS player, p2.pl_name AS partner,
                   re.re_percentage AS pct, re.re_vp AS vp
            FROM tre_results re
            JOIN tpa_partners pa ON pa.pa_paid = re.re_paid
            JOIN tpl_players p1 ON p1.pl_plid = pa.pa_plid1
            JOIN tpl_players p2 ON p2.pl_plid = pa.pa_plid2
            WHERE re.re_seid = $1
            ORDER BY re.re_percentage DESC`,
    params: [seid]
  })
}

/** tre_results for a player, with session info and partner name. */
export async function getResultsByPlid(plid: number) {
  return table_query({
    caller: 'build-viewer/resultsByPlid',
    query: `SELECT s.se_date::text AS date, s.se_scoring AS scoring,
                   s.se_name AS session,
                   p.pl_name AS partner,
                   re.re_percentage AS pct, re.re_vp AS vp
            FROM tre_results re
            JOIN tse_sessions s ON s.se_seid = re.re_seid
            JOIN tpa_partners pa ON pa.pa_paid = re.re_paid
            JOIN tpl_players p ON p.pl_plid =
              CASE WHEN pa.pa_plid1 = $1 THEN pa.pa_plid2 ELSE pa.pa_plid1 END
            WHERE pa.pa_plid1 = $1 OR pa.pa_plid2 = $1
            ORDER BY s.se_date DESC`,
    params: [plid]
  })
}

/** All partnerships with player names, ordered by session count (C-group). */
export async function getAllPartners() {
  return table_query({
    caller: 'build-viewer/allPartners',
    query: `SELECT p1.pl_name AS player1, p2.pl_name AS player2,
                   a2.a2_mp_sessions + a2.a2_vp_sessions AS sessions,
                   a2.a2_mp_avg_pct AS avg_pct,
                   a2.a2_mp_sessions AS mp, a2.a2_vp_sessions AS vp
            FROM tpa_partners pa
            JOIN ta2_partner_stats a2 ON a2.a2_paid = pa.pa_paid AND a2.a2_group = 'C'
            JOIN tpl_players p1 ON p1.pl_plid = pa.pa_plid1
            JOIN tpl_players p2 ON p2.pl_plid = pa.pa_plid2
            ORDER BY a2.a2_mp_sessions + a2.a2_vp_sessions DESC`,
    params: []
  })
}
