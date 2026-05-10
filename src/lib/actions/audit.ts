'use server'

import { table_query } from 'nextjs-shared/table_query'

export interface AuditCheck {
  label: string
  count: number
  rows: Record<string, unknown>[]
}

export async function auditSessionsFetch(): Promise<AuditCheck[]> {
  const noResults = await table_query({
    caller: 'audit/noResults',
    query: `SELECT s.se_seid, s.se_date::text, s.se_source_id, s.se_scoring
            FROM tse_sessions s
            WHERE NOT EXISTS (SELECT 1 FROM tre_results r WHERE r.re_seid = s.se_seid)
            ORDER BY s.se_date DESC`,
    params: []
  })

  return [
    { label: 'Sessions with no results', count: noResults.length, rows: noResults },
  ]
}

export async function auditSessionsProcess(): Promise<AuditCheck[]> {
  const mismatch = await table_query({
    caller: 'audit/mismatch',
    query: `SELECT s.se_seid, s.se_date::text, s.se_source_id,
              COUNT(DISTINCT re.re_reid)::int AS results
            FROM tse_sessions s
            LEFT JOIN tre_results re ON re.re_seid = s.se_seid
            WHERE EXISTS (SELECT 1 FROM tre_results r WHERE r.re_seid = s.se_seid)
            GROUP BY s.se_seid, s.se_date, s.se_source_id
            HAVING COUNT(DISTINCT re.re_reid) = 0
            ORDER BY s.se_date DESC`,
    params: []
  })

  const missingCounts = await table_query({
    caller: 'audit/missingCounts',
    query: `SELECT p.pl_plid, p.pl_name,
              COUNT(r.re_reid)::int AS result_rows
            FROM tpl_players p
            JOIN tre_results r  ON r.re_plid1 = p.pl_plid
            JOIN tse_sessions se ON se.se_seid = r.re_seid
            WHERE CASE WHEN RIGHT(se.se_tournament,1)='A' THEN 'A'
                       WHEN RIGHT(se.se_tournament,1)='B' THEN 'B'
                       ELSE 'C' END = 'C'
              AND NOT EXISTS (
                SELECT 1 FROM ta1_player_stats a1
                WHERE a1.a1_plid = p.pl_plid AND a1.a1_group = 'C'
              )
            GROUP BY p.pl_plid, p.pl_name
            ORDER BY p.pl_name`,
    params: []
  })

  const orphaned = await table_query({
    caller: 'audit/orphaned',
    query: `SELECT re.re_seid,
              COUNT(re.re_reid)::int AS result_count
            FROM tre_results re
            WHERE NOT EXISTS (SELECT 1 FROM tse_sessions s WHERE s.se_seid = re.re_seid)
            GROUP BY re.re_seid`,
    params: []
  })

  return [
    { label: 'Processed sessions with no results', count: mismatch.length, rows: mismatch },
    { label: 'Players with results but session_count = 0', count: missingCounts.length, rows: missingCounts },
    { label: 'Orphaned result rows (no session record)', count: orphaned.length, rows: orphaned },
  ]
}

export async function auditStats(): Promise<AuditCheck[]> {
  const noStats = await table_query({
    caller: 'audit/noStats',
    query: `SELECT pl_plid, pl_name, pl_nz_bridge_number
            FROM tpl_players
            WHERE pl_nz_bridge_number > 0 AND pl_grade = '' AND pl_rating = 0
            ORDER BY pl_name`,
    params: []
  })

  return [
    { label: 'Players with NZ# but no grade or rating (stats fetch failed)', count: noStats.length, rows: noStats },
  ]
}

export async function auditAverages(): Promise<AuditCheck[]> {
  const noPlayerStats = await table_query({
    caller: 'audit/noPlayerStats',
    query: `SELECT p.pl_plid, p.pl_name, COUNT(r.re_reid)::int AS results
            FROM tpl_players p
            JOIN tre_results r  ON r.re_plid1 = p.pl_plid
            JOIN tse_sessions se ON se.se_seid = r.re_seid
            WHERE CASE WHEN RIGHT(se.se_tournament,1)='A' THEN 'A'
                       WHEN RIGHT(se.se_tournament,1)='B' THEN 'B'
                       ELSE 'C' END = 'C'
              AND NOT EXISTS (
                SELECT 1 FROM ta1_player_stats a1
                WHERE a1.a1_plid = p.pl_plid AND a1.a1_group = 'C'
              )
            GROUP BY p.pl_plid, p.pl_name
            ORDER BY p.pl_name`,
    params: []
  })

  const noPartnerStats = await table_query({
    caller: 'audit/noPartnerStats',
    query: `SELECT COUNT(DISTINCT pa.pa_paid)::int AS n
            FROM tpa_partners pa
            WHERE EXISTS (
              SELECT 1 FROM tre_results r
              JOIN tse_sessions se ON se.se_seid = r.re_seid
              WHERE (r.re_plid1 = pa.pa_plid1 AND r.re_plid2 = pa.pa_plid2)
                 OR (r.re_plid1 = pa.pa_plid2 AND r.re_plid2 = pa.pa_plid1)
                AND CASE WHEN RIGHT(se.se_tournament,1)='A' THEN 'A'
                         WHEN RIGHT(se.se_tournament,1)='B' THEN 'B'
                         ELSE 'C' END = 'C'
            )
            AND NOT EXISTS (
              SELECT 1 FROM ta2_partner_stats a2
              WHERE a2.a2_plid1 = pa.pa_plid1 AND a2.a2_plid2 = pa.pa_plid2 AND a2.a2_group = 'C'
            )`,
    params: []
  })
  const noPartnerCount = noPartnerStats[0]?.n ?? 0

  return [
    { label: 'Players with results but no C-group stats', count: noPlayerStats.length, rows: noPlayerStats },
    { label: 'Partnerships with no C-group stats', count: noPartnerCount, rows: [] },
  ]
}
