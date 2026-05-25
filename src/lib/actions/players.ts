'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_update } from 'nextjs-shared/table_update'
import { table_count } from 'nextjs-shared/table_count'
import { table_upsert } from 'nextjs-shared/table_upsert'
import { table_query } from 'nextjs-shared/table_query'

const PLAYERS_TABLE = 'tpl_players'

export async function getPlayerById(plPlid: number) {
  const rows = await table_fetch({
    caller: 'getPlayerById',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_plid', value: plPlid }]
  })
  return rows[0] ?? null
}

export async function getPlayerByNzNumber(nzNumber: number) {
  const rows = await table_fetch({
    caller: 'getPlayerByNzNumber',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_nz_bridge_number', value: nzNumber }]
  })
  return rows[0] ?? null
}

export async function getPlayerByName(name: string) {
  const rows = await table_query({
    caller: 'getPlayerByName',
    query: `SELECT * FROM ${PLAYERS_TABLE}
            WHERE LOWER(TRIM(REGEXP_REPLACE(pl_name, '\\s+', ' ', 'g'))) = LOWER(TRIM(REGEXP_REPLACE($1, '\\s+', ' ', 'g')))
            ORDER BY
              CASE WHEN pl_club = 'Archive' THEN 1 ELSE 0 END ASC,
              pl_rating DESC`,
    params: [name]
  })
  return rows[0] ?? null
}

export async function searchPlayers(query: string) {
  // Names are stored in Title Case. table_fetch LIKE is case-sensitive, so
  // title-case each word of the search term to match correctly.
  const titleCased = query.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  return table_fetch({
    caller: 'searchPlayers',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [
      { column: 'pl_name', value: `%${titleCased}%`, operator: 'LIKE' },
      { column: 'pl_nz_bridge_number', value: 0, operator: '>' }
    ],
    orderBy: 'pl_name ASC',
    limit: 20
  })
}

export async function searchAllPlayers(query: string) {
  const titleCased = query.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  return table_fetch({
    caller: 'searchAllPlayers',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_name', value: `%${titleCased}%`, operator: 'LIKE' }],
    orderBy: 'pl_name ASC',
    limit: 30
  })
}

export async function getAllPlayers() {
  return table_fetch({
    caller: 'getAllPlayers',
    table: PLAYERS_TABLE,
    orderBy: 'pl_name ASC'
  })
}

export async function getPlayersWithoutNzNumber() {
  return table_fetch({
    caller: 'getPlayersWithoutNzNumber',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_nz_bridge_number', value: 0 }],
    orderBy: 'pl_name ASC'
  })
}

export async function playerCount(): Promise<number> {
  return table_count({
    table: PLAYERS_TABLE,
    caller: 'playerCount'
  })
}

export async function getPlayerCounts(): Promise<{ withNumber: number; withoutNumber: number }> {
  const total = await table_count({
    table: PLAYERS_TABLE,
    caller: 'getPlayerCounts'
  })
  const withNumber = await table_count({
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_nz_bridge_number', value: 0, operator: '>' }],
    caller: 'getPlayerCounts'
  })
  return { withNumber, withoutNumber: total - withNumber }
}

/** Fetch all group stats (A/B/C/all) for a player from ta1_player_stats. */
export async function getPlayerAllGroupStats(plid: number) {
  const rows = await table_query({
    caller: 'getPlayerAllGroupStats',
    query: `
      WITH all_ranked AS (
        SELECT a1_plid, a1_group, a1_mp_sessions, a1_mp_avg_pct, a1_mp_stddev,
               a1_vp_sessions, a1_vp_avg_vp, a1_vp_stddev,
               PERCENT_RANK() OVER (PARTITION BY a1_group ORDER BY a1_mp_stddev NULLS LAST) AS mp_pct_rank,
               PERCENT_RANK() OVER (PARTITION BY a1_group ORDER BY a1_vp_stddev NULLS LAST) AS vp_pct_rank
        FROM ta1_player_stats
      )
      SELECT a1_group, a1_mp_sessions, a1_mp_avg_pct, a1_mp_stddev, mp_pct_rank,
             a1_vp_sessions, a1_vp_avg_vp, a1_vp_stddev, vp_pct_rank
      FROM all_ranked
      WHERE a1_plid = $1
      ORDER BY a1_group
    `,
    params: [plid]
  })
  return rows as {
    a1_group:       string
    a1_mp_sessions: number
    a1_mp_avg_pct:  number
    a1_mp_stddev:   number | null
    mp_pct_rank:    number | null
    a1_vp_sessions: number
    a1_vp_avg_vp:   number
    a1_vp_stddev:   number | null
    vp_pct_rank:    number | null
  }[]
}

/** Upsert full player data including NZ bridge number. */
export async function upsertPlayer(data: {
  nz_bridge_number: number
  name: string
  club?: string
  rank?: string
  grade?: string
  rating?: number
  a_points?: number
  b_points?: number
  c_points?: number
}) {
  const statsCols = [
    { column: 'pl_nz_bridge_number', value: data.nz_bridge_number },
    { column: 'pl_name',             value: data.name },
    { column: 'pl_club',             value: data.club      ?? '' },
    { column: 'pl_rank',             value: data.rank      ?? '' },
    { column: 'pl_grade',            value: data.grade     ?? '' },
    { column: 'pl_rating',           value: data.rating    ?? 0 },
    { column: 'pl_a_points',         value: data.a_points  ?? 0 },
    { column: 'pl_b_points',         value: data.b_points  ?? 0 },
    { column: 'pl_c_points',         value: data.c_points  ?? 0 }
  ]

  // If a player with this name already exists, update them (covers both 0 and real NZ number)
  const byName = await getPlayerByName(data.name)
  if (byName) {
    return table_update({
      caller: 'upsertPlayer',
      table: PLAYERS_TABLE,
      columnValuePairs: statsCols,
      whereColumnValuePairs: [{ column: 'pl_plid', value: byName.pl_plid }]
    })
  }

  // If a different player already holds this NZ number, update them
  const byNz = data.nz_bridge_number > 0 ? await getPlayerByNzNumber(data.nz_bridge_number) : null
  if (byNz) {
    return table_update({
      caller: 'upsertPlayer',
      table: PLAYERS_TABLE,
      columnValuePairs: statsCols,
      whereColumnValuePairs: [{ column: 'pl_plid', value: byNz.pl_plid }]
    })
  }

  // New player — insert
  return table_write({
    caller: 'upsertPlayer',
    table: PLAYERS_TABLE,
    columnValuePairs: statsCols
  })
}

const PARTNERS_TABLE = 'tpa_partners'

/** Incremental: process only sessions flagged se_partners_built = FALSE. */
export async function updateIncrementalPartnerStats(): Promise<{ sessions: number; pairs: number }> {
  const unbuilt = await table_query({
    caller: 'updateIncrementalPartnerStats/sessions',
    query: `SELECT se_seid FROM tse_sessions WHERE se_partners_built = FALSE AND se_is_summary IS NOT TRUE`,
    params: []
  }) as { se_seid: number }[]

  if (unbuilt.length === 0) return { sessions: 0, pairs: 0 }

  const seids = unbuilt.map(r => r.se_seid)

  // Insert tpa_partners rows for any new pairs in these sessions
  await table_query({
    caller: 'updateIncrementalPartnerStats/insert',
    query: `
      INSERT INTO tpa_partners (pa_plid1, pa_plid2)
      SELECT DISTINCT
        CASE WHEN p1.pl_name <= p2.pl_name THEN re.re_plid1 ELSE re.re_plid2 END,
        CASE WHEN p1.pl_name <= p2.pl_name THEN re.re_plid2 ELSE re.re_plid1 END
      FROM tre_results re
      JOIN tpl_players p1 ON p1.pl_plid = LEAST(re.re_plid1, re.re_plid2)
      JOIN tpl_players p2 ON p2.pl_plid = GREATEST(re.re_plid1, re.re_plid2)
      WHERE re.re_seid = ANY($1)
        AND re.re_plid1 <> re.re_plid2
      ON CONFLICT (pa_plid1, pa_plid2) DO NOTHING
    `,
    params: [seids] as unknown as (string | number | boolean | null)[]
  })

  const pairsResult = await table_query({
    caller: 'updateIncrementalPartnerStats/count',
    query: `
      SELECT COUNT(DISTINCT (LEAST(re_plid1,re_plid2), GREATEST(re_plid1,re_plid2)))::int AS n
      FROM tre_results WHERE re_seid = ANY($1) AND re_plid1 <> re_plid2
    `,
    params: [seids] as unknown as (string | number | boolean | null)[]
  }) as { n: number }[]

  await table_query({
    caller: 'updateIncrementalPartnerStats/link',
    query: `
      UPDATE tre_results re
      SET re_paid = pa.pa_paid
      FROM tpa_partners pa
      WHERE pa.pa_plid1 = LEAST(re.re_plid1, re.re_plid2)
        AND pa.pa_plid2 = GREATEST(re.re_plid1, re.re_plid2)
        AND re.re_seid = ANY($1)
        AND re.re_paid IS NULL
    `,
    params: [seids] as unknown as (string | number | boolean | null)[]
  })

  await table_query({
    caller: 'updateIncrementalPartnerStats/flag',
    query: `UPDATE tse_sessions SET se_partners_built = TRUE WHERE se_seid = ANY($1)`,
    params: [seids] as unknown as (string | number | boolean | null)[]
  })

  return { sessions: seids.length, pairs: pairsResult[0]?.n ?? 0 }
}

/**
 * Upsert a tpa_partners row for a pair and return its pa_paid.
 * plid1/plid2 are stored in alphabetical name order (first name → plid1, second → plid2).
 * Used during session import so re_paid can be set immediately.
 */
export async function getOrCreatePartnerRow(
  plid1: number, plid2: number,
  name1: string, name2: string
): Promise<number | null> {
  const firstIsAlpha = name1 <= name2
  const lo = firstIsAlpha ? plid1 : plid2
  const hi = firstIsAlpha ? plid2 : plid1

  const rows = await table_upsert({
    caller: 'getOrCreatePartnerRow',
    table: PARTNERS_TABLE,
    columnValuePairs: [
      { column: 'pa_plid1', value: lo },
      { column: 'pa_plid2', value: hi }
    ],
    conflictColumns: ['pa_plid1', 'pa_plid2']
  })
  return rows[0]?.pa_paid ?? null
}

/** Fetch C-group partnership stats for a pair from ta2_partner_stats (order of IDs does not matter). */
export async function getPartnerStats(plid1: number, plid2: number) {
  const [p1, p2] = await Promise.all([getPlayerById(plid1), getPlayerById(plid2)])
  if (!p1 || !p2) return null
  const firstIsAlpha = (p1.pl_name as string) <= (p2.pl_name as string)
  const lo = firstIsAlpha ? plid1 : plid2
  const hi = firstIsAlpha ? plid2 : plid1
  const rows = await table_fetch({
    caller: 'getPartnerStats',
    table: 'ta2_partner_stats',
    whereColumnValuePairs: [
      { column: 'a2_plid1', value: lo },
      { column: 'a2_plid2', value: hi },
      { column: 'a2_group', value: 'C'  }
    ]
  })
  return rows[0] ?? null
}
