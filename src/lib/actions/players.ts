'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_update } from 'nextjs-shared/table_update'
import { table_count } from 'nextjs-shared/table_count'
import { table_upsert } from 'nextjs-shared/table_upsert'
import { table_query } from 'nextjs-shared/table_query'
import { PLAYER_SEARCH_LIMIT, PLAYER_SEARCH_ALL_LIMIT } from '@/src/lib/constants'

const PLAYERS_TABLE = 'tpl_players'

export async function getPlayerById(plPlid: number) {
  const rows = await table_fetch({
    caller: 'getPlayerById',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_plid', value: plPlid }]
  })
  return rows[0] ?? null
}

export async function getPlayerByNzb(nzb: number) {
  const rows = await table_fetch({
    caller: 'getPlayerByNzb',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_nzb', value: nzb }]
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
      { column: 'pl_nzb', value: 0, operator: '>' }
    ],
    orderBy: 'pl_name ASC',
    limit: PLAYER_SEARCH_LIMIT
  })
}

export async function searchAllPlayers(query: string) {
  const titleCased = query.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  return table_fetch({
    caller: 'searchAllPlayers',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_name', value: `%${titleCased}%`, operator: 'LIKE' }],
    orderBy: 'pl_name ASC',
    limit: PLAYER_SEARCH_ALL_LIMIT
  })
}

export async function getAllPlayers() {
  return table_fetch({
    caller: 'getAllPlayers',
    table: PLAYERS_TABLE,
    orderBy: 'pl_name ASC'
  })
}

export async function getPlayersWithoutNzb() {
  return table_fetch({
    caller: 'getPlayersWithoutNzb',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_nzb', value: 0 }],
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
    whereColumnValuePairs: [{ column: 'pl_nzb', value: 0, operator: '>' }],
    caller: 'getPlayerCounts'
  })
  return { withNumber, withoutNumber: total - withNumber }
}

/** Fetch all group/scoring stats (A/B/C/all × MP/VP/XIMP) for a player from ta1_player_stats.
 *  avg_rank/group_total/pct_rank are precomputed by statsCompute.ts during the "Update Stats"
 *  pipeline step, not recalculated here — this data is static between pipeline runs. */
export async function getPlayerAllGroupStats(plid: number) {
  const rows = await table_query({
    caller: 'getPlayerAllGroupStats',
    query: `
      SELECT a1_group, a1_scoring, a1_sessions, a1_avg, a1_stddev,
             a1_pct_rank, a1_avg_rank, a1_group_total
      FROM ta1_player_stats
      WHERE a1_plid = $1
      ORDER BY a1_group, a1_scoring
    `,
    params: [plid]
  })
  return rows as {
    a1_group:       string
    a1_scoring:     string
    a1_sessions:    number
    a1_avg:         number
    a1_stddev:      number | null
    a1_pct_rank:    number | null
    a1_avg_rank:    number | null
    a1_group_total: number | null
  }[]
}

/** Upsert full player data including NZ bridge number. */
export async function upsertPlayer(data: {
  nzb: number
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
    { column: 'pl_nzb', value: data.nzb },
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
  const byNzb = data.nzb > 0 ? await getPlayerByNzb(data.nzb) : null
  if (byNzb) {
    return table_update({
      caller: 'upsertPlayer',
      table: PLAYERS_TABLE,
      columnValuePairs: statsCols,
      whereColumnValuePairs: [{ column: 'pl_plid', value: byNzb.pl_plid }]
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

export async function buildAllPartnerStats(): Promise<{ pairs: number }> {
  const result = await table_query({
    caller: 'buildAllPartnerStats/count',
    query: `SELECT COUNT(*)::int AS n FROM tpa_partners`,
    params: []
  }) as { n: number }[]

  return { pairs: result[0]?.n ?? 0 }
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

/** Fetch C-group partnership stats (one row per scoring type) for a pair from ta2_partner_stats (order of IDs does not matter). */
export async function getPartnerStats(plid1: number, plid2: number) {
  const rows = await table_query({
    caller: 'getPartnerStats',
    query: `SELECT a2_scoring, a2_sessions, a2_avg, a2_stddev FROM ta2_partner_stats
            WHERE a2_paid IN (
              SELECT pa_paid FROM tpa_partners
              WHERE (pa_plid1 = $1 AND pa_plid2 = $2)
                 OR (pa_plid1 = $2 AND pa_plid2 = $1)
            )
            AND a2_group = 'C'`,
    params: [plid1, plid2]
  })
  return rows as {
    a2_scoring:  string
    a2_sessions: number
    a2_avg:      number
    a2_stddev:   number | null
  }[]
}
