'use server'

import { table_query } from 'nextjs-shared/table_query'

/** tre_results for a session, with player and partner names. */
export async function getResultsBySeid(seid: number) {
  return table_query({
    caller: 'build-viewer/resultsBySeid',
    query: `SELECT p1.pl_name AS pl_name, p2.pl_name AS partner_pl_name,
                   re_score
            FROM tre_results
            JOIN tpa_partners ON pa_paid = re_paid
            JOIN tpl_players p1 ON p1.pl_plid = pa_plid1
            JOIN tpl_players p2 ON p2.pl_plid = pa_plid2
            WHERE re_seid = $1
            ORDER BY re_score DESC`,
    params: [seid]
  })
}

/** All tre_results rows, raw columns plus player names for re_paid (1:1 lookup via tpa_partners). */
export async function getAllResults() {
  return table_query({
    caller: 'build-viewer/allResults',
    query: `SELECT re_reid, re_seid,
                   p1.pl_name AS pl_name1, p2.pl_name AS pl_name2, re_paid,
                   re_score
            FROM tre_results
            LEFT JOIN tpa_partners ON pa_paid = re_paid
            LEFT JOIN tpl_players p1 ON p1.pl_plid = pa_plid1
            LEFT JOIN tpl_players p2 ON p2.pl_plid = pa_plid2
            ORDER BY re_reid`,
    params: []
  })
}

/** All tpa_partners rows, with player names (1:1 lookup — no ta2_partner_stats join, one row per partnership). */
export async function getAllPartners() {
  return table_query({
    caller: 'build-viewer/allPartners',
    query: `SELECT pa_paid, p1.pl_name AS pl_name1, pa_plid1,
                   p2.pl_name AS pl_name2, pa_plid2
            FROM tpa_partners
            JOIN tpl_players p1 ON p1.pl_plid = pa_plid1
            JOIN tpl_players p2 ON p2.pl_plid = pa_plid2
            ORDER BY p1.pl_name, p2.pl_name`,
    params: []
  })
}

/** All ta1_player_stats rows, plus the player name for a1_plid (1:1 lookup). */
export async function getAllPlayerStats() {
  return table_query({
    caller: 'build-viewer/allPlayerStats',
    query: `SELECT pl_name, a1_plid, a1_group, a1_scoring, a1_sessions, a1_avg, a1_stddev
            FROM ta1_player_stats
            LEFT JOIN tpl_players ON pl_plid = a1_plid
            ORDER BY a1_plid, a1_group, a1_scoring`,
    params: []
  })
}

/** All ta2_partner_stats rows, plus player names for a2_paid (1:1 lookup via tpa_partners). */
export async function getAllPartnerStats() {
  return table_query({
    caller: 'build-viewer/allPartnerStats',
    query: `SELECT p1.pl_name AS pl_name1, p2.pl_name AS pl_name2, a2_paid,
                   a2_group, a2_scoring, a2_sessions, a2_avg, a2_stddev
            FROM ta2_partner_stats
            LEFT JOIN tpa_partners ON pa_paid = a2_paid
            LEFT JOIN tpl_players p1 ON p1.pl_plid = pa_plid1
            LEFT JOIN tpl_players p2 ON p2.pl_plid = pa_plid2
            ORDER BY a2_paid, a2_group, a2_scoring`,
    params: []
  })
}
