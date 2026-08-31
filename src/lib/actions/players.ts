'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_update } from 'nextjs-shared/table_update'
import { table_count } from 'nextjs-shared/table_count'
import { table_upsert } from 'nextjs-shared/table_upsert'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import { PLAYER_SEARCH_LIMIT, PLAYER_SEARCH_ALL_LIMIT } from '@/src/lib/constants'

const PLAYERS_TABLE = 'tpl_players'

//----------------------------------------------------------------------------------
//  getPlayerById — the tpl_players row for pl_plid, or null
//----------------------------------------------------------------------------------
export async function getPlayerById(plPlid: number) {
  const result = await table_fetch({
    caller: 'getPlayerById',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_plid', value: plPlid }]
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getPlayerById', lg_caller: 'getPlayerById', lg_msg: 'Failed to fetch player by plid: ' + result.error, lg_severity: 'E' })
    return null
  }
  return result.data[0] ?? null
}

//----------------------------------------------------------------------------------
//  getPlayerByNzb — the tpl_players row for pl_nzb, or null
//----------------------------------------------------------------------------------
export async function getPlayerByNzb(nzb: number) {
  const result = await table_fetch({
    caller: 'getPlayerByNzb',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_nzb', value: nzb }]
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getPlayerByNzb', lg_caller: 'getPlayerByNzb', lg_msg: 'Failed to fetch player by nzb: ' + result.error, lg_severity: 'E' })
    return null
  }
  return result.data[0] ?? null
}

//----------------------------------------------------------------------------------
//  getPlayerByName — the best tpl_players row for a name, matched
//  whitespace-/case-insensitively, preferring non-Archive rows then highest
//  pl_rating; null when none match
//----------------------------------------------------------------------------------
export async function getPlayerByName(name: string) {
  const result = await table_query({
    caller: 'getPlayerByName',
    table: 'tpl_players',
    query: `SELECT * FROM ${PLAYERS_TABLE}
            WHERE LOWER(TRIM(REGEXP_REPLACE(pl_name, '\\s+', ' ', 'g'))) = LOWER(TRIM(REGEXP_REPLACE($1, '\\s+', ' ', 'g')))
            ORDER BY
              CASE WHEN pl_club = 'Archive' THEN 1 ELSE 0 END ASC,
              pl_rating DESC`,
    params: [name]
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getPlayerByName', lg_caller: 'getPlayerByName', lg_msg: 'Failed to fetch player by name: ' + result.error, lg_severity: 'E' })
    return null
  }
  return result.data[0] ?? null
}

//----------------------------------------------------------------------------------
//  searchPlayers — up to PLAYER_SEARCH_LIMIT tpl_players rows whose pl_name
//  contains the (title-cased) query and whose pl_nzb > 0, ordered by pl_name
//----------------------------------------------------------------------------------
export async function searchPlayers(query: string) {
  // Names are stored in Title Case. table_fetch LIKE is case-sensitive, so
  // title-case each word of the search term to match correctly.
  const titleCased = query.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  const result = await table_fetch({
    caller: 'searchPlayers',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [
      { column: 'pl_name', value: `%${titleCased}%`, operator: 'LIKE' },
      { column: 'pl_nzb', value: 0, operator: '>' }
    ],
    orderBy: 'pl_name ASC',
    limit: PLAYER_SEARCH_LIMIT
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'searchPlayers', lg_caller: 'searchPlayers', lg_msg: 'Failed to search players: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  searchAllPlayers — like searchPlayers but includes pl_nzb = 0 players and is
//  capped at PLAYER_SEARCH_ALL_LIMIT
//----------------------------------------------------------------------------------
export async function searchAllPlayers(query: string) {
  const titleCased = query.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  const result = await table_fetch({
    caller: 'searchAllPlayers',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_name', value: `%${titleCased}%`, operator: 'LIKE' }],
    orderBy: 'pl_name ASC',
    limit: PLAYER_SEARCH_ALL_LIMIT
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'searchAllPlayers', lg_caller: 'searchAllPlayers', lg_msg: 'Failed to search all players: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  getAllPlayers — every tpl_players row, ordered by pl_name
//----------------------------------------------------------------------------------
export async function getAllPlayers() {
  const result = await table_fetch({
    caller: 'getAllPlayers',
    table: PLAYERS_TABLE,
    orderBy: 'pl_name ASC'
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getAllPlayers', lg_caller: 'getAllPlayers', lg_msg: 'Failed to fetch all players: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  getPlayersWithoutNzb — every tpl_players row with pl_nzb = 0, ordered by pl_name
//----------------------------------------------------------------------------------
export async function getPlayersWithoutNzb() {
  const result = await table_fetch({
    caller: 'getPlayersWithoutNzb',
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_nzb', value: 0 }],
    orderBy: 'pl_name ASC'
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getPlayersWithoutNzb', lg_caller: 'getPlayersWithoutNzb', lg_msg: 'Failed to fetch players without nzb: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  playerCount — total row count of tpl_players
//----------------------------------------------------------------------------------
export async function playerCount(): Promise<number> {
  const result = await table_count({
    table: PLAYERS_TABLE,
    caller: 'playerCount'
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'playerCount', lg_caller: 'playerCount', lg_msg: 'Failed to count tpl_players: ' + result.error, lg_severity: 'E' })
    return 0
  }
  return result.data
}

//----------------------------------------------------------------------------------
//  getPlayerCounts — { withNumber, withoutNumber } split of tpl_players by whether
//  pl_nzb > 0
//----------------------------------------------------------------------------------
export async function getPlayerCounts(): Promise<{ withNumber: number; withoutNumber: number }> {
  const totalResult = await table_count({
    table: PLAYERS_TABLE,
    caller: 'getPlayerCounts'
  })
  const withNumberResult = await table_count({
    table: PLAYERS_TABLE,
    whereColumnValuePairs: [{ column: 'pl_nzb', value: 0, operator: '>' }],
    caller: 'getPlayerCounts'
  })
  if (!totalResult.ok || !withNumberResult.ok) {
    write_logging({ lg_functionname: 'getPlayerCounts', lg_caller: 'getPlayerCounts', lg_msg: 'Failed to count tpl_players split: ' + (totalResult.error ?? withNumberResult.error), lg_severity: 'E' })
    return { withNumber: 0, withoutNumber: 0 }
  }
  return { withNumber: withNumberResult.data, withoutNumber: totalResult.data - withNumberResult.data }
}

//----------------------------------------------------------------------------------
//  getPlayerAllGroupStats — every group/scoring stats row (A/B/C/all × MP/VP/XIMP)
//  for a player from ta1_player_stats, ordered by group then scoring;
//  avg_rank/group_total/pct_rank are precomputed by statsCompute.ts during the
//  "Update Stats" pipeline step, not recalculated here
//----------------------------------------------------------------------------------
export async function getPlayerAllGroupStats(plid: number) {
  const result = await table_query({
    caller: 'getPlayerAllGroupStats',
    table: 'ta1_player_stats',
    query: `
      SELECT a1_group, a1_scoring, a1_sessions, a1_avg, a1_stddev,
             a1_pct_rank, a1_avg_rank, a1_group_total
      FROM ta1_player_stats
      WHERE a1_plid = $1
      ORDER BY a1_group, a1_scoring
    `,
    params: [plid]
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getPlayerAllGroupStats', lg_caller: 'getPlayerAllGroupStats', lg_msg: 'Failed to fetch player group stats: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data as {
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

//----------------------------------------------------------------------------------
//  upsertPlayer — upserts full player data (incl. NZ bridge number): updates the
//  row matched by name if one exists, else the row holding this nzb, else inserts
//  a new tpl_players row
//----------------------------------------------------------------------------------
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
    const updateResult = await table_update({
      caller: 'upsertPlayer',
      table: PLAYERS_TABLE,
      columnValuePairs: statsCols,
      whereColumnValuePairs: [{ column: 'pl_plid', value: byName.pl_plid }]
    })
    if (!updateResult.ok) {
      write_logging({ lg_functionname: 'upsertPlayer', lg_caller: 'upsertPlayer/byName', lg_msg: `Failed to update player ${data.name}: ` + updateResult.error, lg_severity: 'E' })
    }
    return updateResult
  }

  // If a different player already holds this NZ number, update them
  const byNzb = data.nzb > 0 ? await getPlayerByNzb(data.nzb) : null
  if (byNzb) {
    const updateResult = await table_update({
      caller: 'upsertPlayer',
      table: PLAYERS_TABLE,
      columnValuePairs: statsCols,
      whereColumnValuePairs: [{ column: 'pl_plid', value: byNzb.pl_plid }]
    })
    if (!updateResult.ok) {
      write_logging({ lg_functionname: 'upsertPlayer', lg_caller: 'upsertPlayer/byNzb', lg_msg: `Failed to update player nzb ${data.nzb}: ` + updateResult.error, lg_severity: 'E' })
    }
    return updateResult
  }

  // New player — insert
  const writeResult = await table_write({
    caller: 'upsertPlayer',
    table: PLAYERS_TABLE,
    columnValuePairs: statsCols
  })
  if (!writeResult.ok) {
    write_logging({ lg_functionname: 'upsertPlayer', lg_caller: 'upsertPlayer/insert', lg_msg: `Failed to insert player ${data.name}: ` + writeResult.error, lg_severity: 'E' })
  }
  return writeResult
}

const PARTNERS_TABLE = 'tpa_partners'

//----------------------------------------------------------------------------------
//  buildAllPartnerStats — status-only count of tpa_partners rows (no writes); the
//  Build Partners pipeline step's reported figure
//----------------------------------------------------------------------------------
export async function buildAllPartnerStats(): Promise<{ pairs: number }> {
  const result = await table_query({
    caller: 'buildAllPartnerStats/count',
    table: 'tpa_partners',
    query: `SELECT COUNT(*)::int AS n FROM tpa_partners`,
    params: []
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'buildAllPartnerStats', lg_caller: 'buildAllPartnerStats/count', lg_msg: 'Failed to count tpa_partners: ' + result.error, lg_severity: 'E' })
    return { pairs: 0 }
  }
  const rows = result.data as { n: number }[]
  return { pairs: rows[0]?.n ?? 0 }
}

//----------------------------------------------------------------------------------
//  getOrCreatePartnerRow — upserts the tpa_partners row for a pair and returns its
//  pa_paid; plid1/plid2 are stored in alphabetical name order (earlier name →
//  pa_plid1). Used during session import so re_paid can be set immediately
//----------------------------------------------------------------------------------
export async function getOrCreatePartnerRow(
  plid1: number, plid2: number,
  name1: string, name2: string
): Promise<number | null> {
  const firstIsAlpha = name1 <= name2
  const lo = firstIsAlpha ? plid1 : plid2
  const hi = firstIsAlpha ? plid2 : plid1

  const result = await table_upsert({
    caller: 'getOrCreatePartnerRow',
    table: PARTNERS_TABLE,
    columnValuePairs: [
      { column: 'pa_plid1', value: lo },
      { column: 'pa_plid2', value: hi }
    ],
    conflictColumns: ['pa_plid1', 'pa_plid2']
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getOrCreatePartnerRow', lg_caller: 'getOrCreatePartnerRow', lg_msg: 'Failed to upsert tpa_partners row: ' + result.error, lg_severity: 'E' })
    return null
  }
  return result.data[0]?.pa_paid ?? null
}

//----------------------------------------------------------------------------------
//  getPartnerStats — C-group partnership stats (one row per scoring type) for a
//  pair from ta2_partner_stats; ID order does not matter
//----------------------------------------------------------------------------------
export async function getPartnerStats(plid1: number, plid2: number) {
  const result = await table_query({
    caller: 'getPartnerStats',
    table: 'ta2_partner_stats',
    query: `SELECT a2_scoring, a2_sessions, a2_avg, a2_stddev FROM ta2_partner_stats
            WHERE a2_paid IN (
              SELECT pa_paid FROM tpa_partners
              WHERE (pa_plid1 = $1 AND pa_plid2 = $2)
                 OR (pa_plid1 = $2 AND pa_plid2 = $1)
            )
            AND a2_group = 'C'`,
    params: [plid1, plid2]
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getPartnerStats', lg_caller: 'getPartnerStats', lg_msg: 'Failed to fetch partner stats: ' + result.error, lg_severity: 'E' })
    return []
  }
  return result.data as {
    a2_scoring:  string
    a2_sessions: number
    a2_avg:      number
    a2_stddev:   number | null
  }[]
}
