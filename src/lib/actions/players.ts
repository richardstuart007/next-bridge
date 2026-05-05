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

/** Find a player by name; insert by name only if not found. Returns pl_plid or null. */
export async function findOrCreatePlayerByName(name: string): Promise<number | null> {
  const existing = await getPlayerByName(name)
  if (existing) return existing.pl_plid as number
  const plId = await insertPlayerByName(name)
  return plId ?? null
}

/** Insert a player by name only (no NZ bridge number yet). Returns the new pl_plid. */
export async function insertPlayerByName(name: string): Promise<number> {
  const normalised = name.trim().replace(/\s+/g, ' ')
  const rows = await table_write({
    caller: 'insertPlayerByName',
    table: PLAYERS_TABLE,
    columnValuePairs: [{ column: 'pl_name', value: normalised }]
  })
  return rows[0]?.pl_plid
}

/** Recalculate and store session count and average percentage for all players. Returns count updated. */
export async function updateAllPlayerAverages(): Promise<number> {
  // Step 1: compute session counts
  const countRows = await table_query({
    caller: 'updateAllPlayerAverages',
    query: `SELECT re_plid, COUNT(*) AS session_count FROM tre_results GROUP BY re_plid`,
    params: []
  })
  for (const row of countRows) {
    await table_update({
      caller: 'updateAllPlayerAverages',
      table: PLAYERS_TABLE,
      columnValuePairs: [{ column: 'pl_session_count', value: Number(row.session_count) }],
      whereColumnValuePairs: [{ column: 'pl_plid', value: row.re_plid }]
    })
  }

  // Step 2: compute averages
  const avgRows = await table_query({
    caller: 'updateAllPlayerAverages',
    query: `SELECT re_plid, ROUND(AVG(re_percentage)::numeric, 2) AS avg_pct FROM tre_results GROUP BY re_plid`,
    params: []
  })
  for (const row of avgRows) {
    await table_update({
      caller: 'updateAllPlayerAverages',
      table: PLAYERS_TABLE,
      columnValuePairs: [{ column: 'pl_avg_percentage', value: row.avg_pct }],
      whereColumnValuePairs: [{ column: 'pl_plid', value: row.re_plid }]
    })
  }

  return avgRows.length
}

/** Fetch top N players by average percentage (requires updateAllPlayerAverages to have been run). */
export async function getTopPlayersByAverage(limit = 100) {
  return table_fetch({
    caller: 'getTopPlayersByAverage',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_avg_percentage', value: 0, operator: '>' }],
    orderBy: 'pl_avg_percentage DESC',
    limit
  })
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

/** Recompute and store session count, avg %, and name key for every partnership. Returns count upserted. */
export async function updateAllPartnerStats(): Promise<number> {
  // Deduplicate pairs with re_plid < re_partner_plid, then assign plid1/plid2 by alphabetical name order
  const rows = await table_query({
    caller: 'updateAllPartnerStats',
    query: `
      WITH pairs AS (
        SELECT
          re_plid, re_partner_plid,
          COUNT(*)                               AS sessions,
          ROUND(AVG(re_percentage)::numeric, 2) AS avg_pct
        FROM tre_results
        WHERE re_plid < re_partner_plid
        GROUP BY re_plid, re_partner_plid
      )
      SELECT
        CASE WHEN p1.pl_name <= p2.pl_name THEN pairs.re_plid         ELSE pairs.re_partner_plid END AS plid1,
        CASE WHEN p1.pl_name <= p2.pl_name THEN pairs.re_partner_plid ELSE pairs.re_plid         END AS plid2,
        pairs.sessions,
        pairs.avg_pct
      FROM pairs
      JOIN tpl_players p1 ON p1.pl_plid = pairs.re_plid
      JOIN tpl_players p2 ON p2.pl_plid = pairs.re_partner_plid
    `,
    params: []
  })

  for (const row of rows) {
    await table_upsert({
      caller: 'updateAllPartnerStats',
      table: PARTNERS_TABLE,
      columnValuePairs: [
        { column: 'pa_plid1',        value: row.plid1 },
        { column: 'pa_plid2',        value: row.plid2 },
        { column: 'pa_sessions',     value: Number(row.sessions) },
        { column: 'pa_avg_pct',      value: row.avg_pct }
      ],
      conflictColumns: ['pa_plid1', 'pa_plid2']
    })
  }

  // Retroactively fill re_paid on existing result rows that are missing it
  await table_query({
    caller: 'updateAllPartnerStats',
    query: `
      UPDATE tre_results re
      SET re_paid = pa.pa_paid
      FROM tpa_partners pa
      WHERE pa.pa_plid1 = LEAST(re.re_plid, re.re_partner_plid)
        AND pa.pa_plid2 = GREATEST(re.re_plid, re.re_partner_plid)
        AND re.re_paid IS NULL
    `,
    params: []
  })

  return rows.length
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

/** Fetch stored partnership stats for a pair (order of IDs does not matter). */
export async function getPartnerStats(plid1: number, plid2: number) {
  const [p1, p2] = await Promise.all([getPlayerById(plid1), getPlayerById(plid2)])
  if (!p1 || !p2) return null
  const firstIsAlpha = (p1.pl_name as string) <= (p2.pl_name as string)
  const lo = firstIsAlpha ? plid1 : plid2
  const hi = firstIsAlpha ? plid2 : plid1
  const rows = await table_fetch({
    caller: 'getPartnerStats',
    table: PARTNERS_TABLE,
    whereColumnValuePairs: [
      { column: 'pa_plid1', value: lo },
      { column: 'pa_plid2', value: hi }
    ]
  })
  return rows[0] ?? null
}
