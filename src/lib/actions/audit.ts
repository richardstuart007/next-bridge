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
            JOIN tre_results r ON r.re_plid = p.pl_plid
            WHERE p.pl_session_count = 0
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
  const wrongCount = await table_query({
    caller: 'audit/wrongCount',
    query: `SELECT p.pl_plid, p.pl_name,
              p.pl_session_count AS stored_count,
              COUNT(DISTINCT r.re_seid)::int AS actual_count
            FROM tpl_players p
            JOIN tre_results r ON r.re_plid = p.pl_plid
            GROUP BY p.pl_plid, p.pl_name, p.pl_session_count
            HAVING p.pl_session_count <> COUNT(DISTINCT r.re_seid)
            ORDER BY p.pl_name`,
    params: []
  })

  const zeroAvg = await table_query({
    caller: 'audit/zeroAvg',
    query: `SELECT pl_plid, pl_name, pl_session_count
            FROM tpl_players
            WHERE pl_session_count > 0 AND pl_avg_percentage = 0
            ORDER BY pl_name`,
    params: []
  })

  const zeroPartners = await table_query({
    caller: 'audit/zeroPartners',
    query: `SELECT COUNT(*)::int AS n FROM tpa_partners WHERE pa_sessions = 0`,
    params: []
  })
  const partnerCount = zeroPartners[0]?.n ?? 0

  return [
    { label: 'Players with incorrect session count', count: wrongCount.length, rows: wrongCount },
    { label: 'Players with sessions but avg% = 0', count: zeroAvg.length, rows: zeroAvg },
    { label: 'Partnerships not recalculated (pa_sessions = 0)', count: partnerCount, rows: [] },
  ]
}
