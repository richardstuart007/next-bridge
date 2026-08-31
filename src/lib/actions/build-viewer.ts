'use server'

import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

//----------------------------------------------------------------------------------
//  getResultsBySeid — tre_results for one session (re_seid), resolved to player +
//  partner names, ordered by re_score DESC
//----------------------------------------------------------------------------------
export async function getResultsBySeid(seid: number) {
  const result = await table_query({
    caller: 'build-viewer/resultsBySeid',
    table: 'tre_results',
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
  if (!result.ok) {
    write_logging({ lg_functionname: 'getResultsBySeid', lg_caller: 'build-viewer/resultsBySeid', lg_msg: 'Failed to fetch results by seid: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  getAllResults — every tre_results row, raw columns plus both player names for
//  re_paid (1:1 lookup via tpa_partners), ordered by re_reid
//----------------------------------------------------------------------------------
export async function getAllResults() {
  const result = await table_query({
    caller: 'build-viewer/allResults',
    table: 'tre_results',
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
  if (!result.ok) {
    write_logging({ lg_functionname: 'getAllResults', lg_caller: 'build-viewer/allResults', lg_msg: 'Failed to fetch all results: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  getAllPartners — every tpa_partners row with both player names (1:1 lookup, no
//  ta2_partner_stats join so it stays one row per partnership), ordered by name
//----------------------------------------------------------------------------------
export async function getAllPartners() {
  const result = await table_query({
    caller: 'build-viewer/allPartners',
    table: 'tpa_partners',
    query: `SELECT pa_paid, p1.pl_name AS pl_name1, pa_plid1,
                   p2.pl_name AS pl_name2, pa_plid2
            FROM tpa_partners
            JOIN tpl_players p1 ON p1.pl_plid = pa_plid1
            JOIN tpl_players p2 ON p2.pl_plid = pa_plid2
            ORDER BY p1.pl_name, p2.pl_name`,
    params: []
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getAllPartners', lg_caller: 'build-viewer/allPartners', lg_msg: 'Failed to fetch all partners: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  getAllPlayerStats — every ta1_player_stats row plus the player name for a1_plid
//  (1:1 lookup), ordered by plid, group, scoring
//----------------------------------------------------------------------------------
export async function getAllPlayerStats() {
  const result = await table_query({
    caller: 'build-viewer/allPlayerStats',
    table: 'ta1_player_stats',
    query: `SELECT pl_name, a1_plid, a1_group, a1_scoring, a1_sessions, a1_avg, a1_stddev
            FROM ta1_player_stats
            LEFT JOIN tpl_players ON pl_plid = a1_plid
            ORDER BY a1_plid, a1_group, a1_scoring`,
    params: []
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getAllPlayerStats', lg_caller: 'build-viewer/allPlayerStats', lg_msg: 'Failed to fetch all player stats: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  getAllPartnerStats — every ta2_partner_stats row plus both player names for
//  a2_paid (1:1 lookup via tpa_partners), ordered by paid, group, scoring
//----------------------------------------------------------------------------------
export async function getAllPartnerStats() {
  const result = await table_query({
    caller: 'build-viewer/allPartnerStats',
    table: 'ta2_partner_stats',
    query: `SELECT p1.pl_name AS pl_name1, p2.pl_name AS pl_name2, a2_paid,
                   a2_group, a2_scoring, a2_sessions, a2_avg, a2_stddev
            FROM ta2_partner_stats
            LEFT JOIN tpa_partners ON pa_paid = a2_paid
            LEFT JOIN tpl_players p1 ON p1.pl_plid = pa_plid1
            LEFT JOIN tpl_players p2 ON p2.pl_plid = pa_plid2
            ORDER BY a2_paid, a2_group, a2_scoring`,
    params: []
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getAllPartnerStats', lg_caller: 'build-viewer/allPartnerStats', lg_msg: 'Failed to fetch all partner stats: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}
