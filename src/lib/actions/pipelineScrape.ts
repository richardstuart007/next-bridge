'use server'

import * as cheerio from 'cheerio'
import { table_query } from 'nextjs-shared/table_query'
import { table_write } from 'nextjs-shared/table_write'
import { table_upsert } from 'nextjs-shared/table_upsert'
import { table_truncate } from 'nextjs-shared/table_truncate'
import { extractRunIds } from '@/src/lib/scrapeUtils'
import { logPipelineStep, resolvePipRunId } from '@/src/lib/actions/pipelineLog'
import {
  BRIDGE_CLUB_ID,
  SCRAPE_FALLBACK_LOOKBACK_DAYS,
  MP_PERCENTAGE_MIN,
  MP_PERCENTAGE_MAX,
  VP_SCORE_SANITY_MAX,
  VP_SCORE_SANITY_RESET,
  UNKNOWN_SCORE_TYPE
} from '@/src/lib/constants'

const NZB_BASE = 'https://www.nzbridge.co.nz'
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; next-bridge-bot/1.0)' }

const MONTH: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
}

export type ScrapeSessionsResult = {
  run_ids_new:     number
  pairs_total:     number
  players_created: number
}

export type ScrapeClubSessionsResult = ScrapeSessionsResult & {
  from_date: string
  to_date:   string
}

function datesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from)
  const end = new Date(to)
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function parseDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s+(\w{3})\s+(\d{2,4})$/)
  if (!m) return null
  const month = MONTH[m[2]]
  if (!month) return null
  const year = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${year}-${month}-${m[1].padStart(2, '0')}`
}

function parseScore(raw: string): { value: number; type: 'PCT' | 'VP' | 'XIMP' | typeof UNKNOWN_SCORE_TYPE } | null {
  const trimmed = raw.trim()
  const known = trimmed.match(/^([\d.]+)\s*(PCT|VP|XIMPS?)$/i)
  if (known) {
    const suffix = known[2].toUpperCase()
    const type = suffix.startsWith('XIMP') ? 'XIMP' : (suffix as 'PCT' | 'VP')
    return { value: parseFloat(known[1]), type }
  }
  //
  //  Suffix isn't a recognized score type — still capture the numeric value under a sentinel
  //  type instead of silently dropping the row, so the session survives into
  //  ts1_sessions/tse_sessions as visible, queryable "known bad/unhandled data" rather than
  //  vanishing with no trace of what it was
  //
  const unrecognised = trimmed.match(/^([\d.]+)\s*\S+$/)
  if (!unrecognised) return null
  return { value: parseFloat(unrecognised[1]), type: UNKNOWN_SCORE_TYPE }
}

function normaliseScore(value: number, type: 'PCT' | 'VP' | 'XIMP' | typeof UNKNOWN_SCORE_TYPE): number {
  if (type === 'PCT' && (value < MP_PERCENTAGE_MIN || value > MP_PERCENTAGE_MAX)) return 50
  if (type === 'VP' && value > VP_SCORE_SANITY_MAX) return VP_SCORE_SANITY_RESET
  return value
}

type ParsedRow = {
  run_id:       number
  event_name:   string
  date:         string | null
  club:         string
  player_names: string[]
  score_value:  number
  score_type:   'PCT' | 'VP' | 'XIMP' | typeof UNKNOWN_SCORE_TYPE
  tournament:   string
}

function parsePage(html: string): Map<number, ParsedRow[]> {
  const $ = cheerio.load(html)
  const rowsByRunId = new Map<number, ParsedRow[]>()

  $('table').each((_, table) => {
    const headerRow   = $(table).find('tr').first()
    const headerCells = headerRow.find('th, td').toArray().map(th => $(th).text().trim().toLowerCase())

    if (!headerCells.some(h => h.includes('event')) || !headerCells.some(h => h.includes('player'))) return

    const colDate    = headerCells.findIndex(h => h === 'date')
    const colClub    = headerCells.findIndex(h => h.includes('club'))
    const colEvent   = headerCells.findIndex(h => h.includes('event'))
    const colPlayers = headerCells.findIndex(h => h.includes('player'))
    const colMpts    = headerCells.findIndex(h => h.includes('mpt') || h === 'mp' || h.includes('point'))
    const colScore   = headerCells.findIndex(h => h.includes('score'))

    if (colEvent < 0 || colPlayers < 0 || colScore < 0) return

    $(table).find('tr').each((rowIdx, tr) => {
      if (rowIdx === 0) return
      const cells = $(tr).find('td').toArray()
      if (cells.length < Math.max(colEvent, colPlayers, colScore) + 1) return

      const get = (idx: number) => idx >= 0 ? $(cells[idx]).text().trim() : ''

      const eventCell = colEvent >= 0 ? $(cells[colEvent]) : null
      const eventHref = eventCell?.find('a').attr('href') ?? ''
      const runMatch  = eventHref.match(/run_id=(\d+)/)
      if (!runMatch) return

      const run_id     = parseInt(runMatch[1], 10)
      const event_name = eventCell?.find('a').text().trim() || get(colEvent)
      const playersRaw = get(colPlayers)
      const scoreRaw   = get(colScore)

      const parsedDate   = parseDate(get(colDate))
      const score        = parseScore(scoreRaw)
      if (!score) return

      const player_names = playersRaw.split(',').map(s => s.trim()).filter(Boolean)
      const existing     = rowsByRunId.get(run_id) ?? []
      existing.push({
        run_id, event_name, date: parsedDate, club: get(colClub),
        player_names,
        score_value: normaliseScore(score.value, score.type),
        score_type: score.type,
        tournament: get(colMpts)
      })
      rowsByRunId.set(run_id, existing)
    })
  })

  return rowsByRunId
}

async function getOrCreatePlayer(rawName: string): Promise<{ plid: number; created: boolean }> {
  const name = rawName.replace(/\s+/g, ' ').trim()
  const existing = await table_query({
    caller: 'pipelineScrape/lookup',
    query:  `SELECT pl_plid FROM tpl_players WHERE LOWER(pl_name) = LOWER($1)`,
    params: [name]
  }) as { pl_plid: number }[]
  if (existing.length > 0) return { plid: existing[0].pl_plid, created: false }

  const inserted = await table_write({
    caller: 'pipelineScrape/create',
    table: 'tpl_players',
    conflictColumn: 'pl_name',
    columnValuePairs: [
      { column: 'pl_name',             value: name },
      { column: 'pl_nzb', value: 0 },
    ]
  }) as { pl_plid: number }[]
  if (inserted.length > 0) return { plid: inserted[0].pl_plid, created: true }

  const reselect = await table_query({
    caller: 'pipelineScrape/reselect',
    query:  `SELECT pl_plid FROM tpl_players WHERE pl_name = $1`,
    params: [name]
  }) as { pl_plid: number }[]
  return { plid: reselect[0].pl_plid, created: false }
}

//----------------------------------------------------------------------------------
//  batchCheckMissing — excludes a run_id already in tse_sessions (built) OR
//  ts1_sessions (scraped but not yet built), so a session already captured by a
//  previous run is never re-fetched from nzbridge.co.nz again, regardless of which
//  scrape step found it or whether Build Sessions has run yet
//----------------------------------------------------------------------------------
async function batchCheckMissing(runIds: number[]): Promise<number[]> {
  if (runIds.length === 0) return []
  const existing = await table_query({
    caller: 'pipelineScrape/check',
    query: `SELECT se_run_id AS run_id FROM tse_sessions WHERE se_run_id = ANY($1)
            UNION
            SELECT s1_run_id AS run_id FROM ts1_sessions WHERE s1_run_id = ANY($1)`,
    params: [runIds] as unknown as (string | number | boolean | null)[],
    skipCache: true
  }) as { run_id: number }[]
  const existingSet = new Set(existing.map(r => r.run_id))
  return runIds.filter(id => !existingSet.has(id))
}

async function scrapeRunId(run_id: number): Promise<{ pairs: number; created: number }> {
  const response = await fetch(`${NZB_BASE}/results.html?run_id=${run_id}`, { headers: UA })
  if (!response.ok) return { pairs: 0, created: 0 }

  const rowsByRunId = parsePage(await response.text())
  const rows = rowsByRunId.get(run_id) ?? []
  if (rows.length === 0) return { pairs: 0, created: 0 }

  const headerRow = rows.find(r => r.player_names.length === 2 || r.player_names.length === 4)
  if (headerRow) {
    const event_type = headerRow.player_names.length === 4 ? 'teams' : 'pairs'
    await table_upsert({
      caller: 'pipelineScrape/upsert-ts1',
      table: 'ts1_sessions',
      conflictColumns: ['s1_run_id'],
      columnValuePairs: [
        { column: 's1_run_id',     value: run_id },
        { column: 's1_date',       value: headerRow.date },
        { column: 's1_club',       value: headerRow.club },
        { column: 's1_event_name', value: headerRow.event_name },
        { column: 's1_score_type', value: headerRow.score_type },
        { column: 's1_event_type', value: event_type },
        { column: 's1_tournament', value: headerRow.tournament },
      ]
    })
  }

  let pairs = 0, created = 0
  for (const row of rows) {
    const { player_names, score_value } = row
    let pairList: [string, string][] = []
    if (player_names.length === 2)      pairList = [[player_names[0], player_names[1]]]
    else if (player_names.length === 4) pairList = [[player_names[0], player_names[1]], [player_names[2], player_names[3]]]
    else continue

    for (const [nameA, nameB] of pairList) {
      const a = await getOrCreatePlayer(nameA)
      const b = await getOrCreatePlayer(nameB)
      if (a.created) created++
      if (b.created) created++
      await table_write({
        caller: 'pipelineScrape/insert-ts2',
        table: 'ts2_results',
        conflictColumn: 's2_run_id, s2_plid1, s2_plid2',
        columnValuePairs: [
          { column: 's2_run_id',      value: run_id },
          { column: 's2_plid1',      value: Math.min(a.plid, b.plid) },
          { column: 's2_plid2',      value: Math.max(a.plid, b.plid) },
          { column: 's2_score_value', value: score_value },
        ]
      })
      pairs++
    }
  }

  if (pairs === 0) {
    //
    //  This run_id's results page had no valid pair rows (e.g. the website shows the
    //  session with no player data) — remove its ts1_sessions header row so it never
    //  reaches Build Sessions with nothing for Build Results to ever fill in
    //
    await table_query({
      caller: 'pipelineScrape/delete-empty-ts1',
      query: `DELETE FROM ts1_sessions WHERE s1_run_id = $1`,
      params: [run_id],
      isupdate: true
    })
  }

  return { pairs, created }
}

//----------------------------------------------------------------------------------
//  scrapeRunIds — fetches and writes every run_id in the given set; shared by both
//  the club and tracked-player scrape steps
//----------------------------------------------------------------------------------
async function scrapeRunIds(missingIds: Set<number>): Promise<{ pairs_total: number; players_created: number }> {
  let pairs_total = 0, players_created = 0
  for (const missingRunId of missingIds) {
    const { pairs, created } = await scrapeRunId(missingRunId)
    pairs_total      += pairs
    players_created  += created
  }
  return { pairs_total, players_created }
}

async function getMaxSessionDate(): Promise<string | null> {
  const rows = await table_query({
    caller: 'pipelineScrape/from-date',
    query:  `SELECT MAX(se_date)::text AS from_date FROM tse_sessions`,
    params: [],
    skipCache: true
  }) as { from_date: string | null }[]
  return rows[0]?.from_date ?? null
}

async function getDateRange(fromDateOverride?: string, toDateOverride?: string): Promise<{ from_date: string; to_date: string }> {
  const from_date = fromDateOverride
    ?? (await getMaxSessionDate())
    ?? new Date(Date.now() - SCRAPE_FALLBACK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const to_date = toDateOverride ?? new Date().toISOString().slice(0, 10)
  return { from_date, to_date }
}

//----------------------------------------------------------------------------------
//  getScrapeFromDate — the automatic starting point for the next Scrape run (MAX
//  se_date in tse_sessions), for display next to the optional to_date input in the UI
//----------------------------------------------------------------------------------
export async function getScrapeFromDate(): Promise<string | null> {
  return getMaxSessionDate()
}

//----------------------------------------------------------------------------------
//  scrapeClubSessions — step 1: discovers and scrapes AKBC club sessions since the
//  last-built session date (or fromDateOverride, when the automatic MAX(se_date) has
//  been pushed forward by tracked-player sessions and a historical backlog still needs
//  processing; or toDateOverride, if capping a catch-up run to a smaller range),
//  writing ts1_sessions + ts2_results. Truncates staging first, since this is the start
//  of a new coordinated run.
//----------------------------------------------------------------------------------
export async function scrapeClubSessions(fromDateOverride?: string, toDateOverride?: string): Promise<ScrapeClubSessionsResult> {
  const t0 = Date.now()
  const run_id = await resolvePipRunId(1, true)

  const { from_date, to_date } = await getDateRange(fromDateOverride, toDateOverride)

  await table_truncate('ts1_sessions', 'pipelineScrape/truncate-ts1')
  await table_truncate('ts2_results',  'pipelineScrape/truncate-ts2')

  const allMissingIds = new Set<number>()
  for (const day of datesInRange(from_date, to_date)) {
    const url = `${NZB_BASE}/results.html?mp_filter_club=${BRIDGE_CLUB_ID}&date_start=${day}&date_end=${day}&mp_results=Search`
    const res = await fetch(url, { headers: UA })
    if (!res.ok) continue
    const { runIds } = extractRunIds(await res.text())
    const missing = await batchCheckMissing(runIds)
    missing.forEach(id => allMissingIds.add(id))
  }

  const { pairs_total, players_created } = await scrapeRunIds(allMissingIds)

  await logPipelineStep({
    run_id, step: 1, sub_step: 'a', step_name: 'Scrape AKBC',
    output_table: 'ts2_results', output_recs: pairs_total,
    duration_ms: Date.now() - t0
  })

  return { from_date, to_date, run_ids_new: allMissingIds.size, pairs_total, players_created }
}

//----------------------------------------------------------------------------------
//  scrapeTrackedPlayerSessions — step 2: discovers and scrapes every flagged tracked
//  player's full match history, writing ts1_sessions + ts2_results. No date range (NZB
//  returns each player's entire history) and no truncate — relies on
//  batchCheckMissing() to skip anything already in tse_sessions/ts1_sessions, so
//  re-running this never re-fetches sessions already captured by a previous run
//  (including this same session's Scrape AKBC step, once Build Sessions has run).
//----------------------------------------------------------------------------------
export async function scrapeTrackedPlayerSessions(): Promise<ScrapeSessionsResult> {
  const t0 = Date.now()
  const run_id = await resolvePipRunId(2, false)

  const flagged = await table_query({
    caller: 'pipelineScrape/flagged',
    query:  `SELECT pl_name, pl_nzb FROM tpl_players WHERE pl_tracked = TRUE AND pl_nzb > 0 ORDER BY pl_name ASC`,
    params: [],
    skipCache: true
  }) as { pl_name: string; pl_nzb: number }[]

  const allMissingIds = new Set<number>()
  for (let i = 0; i < flagged.length; i++) {
    const player = flagged[i]
    const tPlayer = Date.now()
    const url = `${NZB_BASE}/online-points.html?mpsr=1&mp_user=${player.pl_nzb}`
    const res = await fetch(url, { headers: UA })
    if (!res.ok) continue
    const { runIds } = extractRunIds(await res.text())
    const missing = await batchCheckMissing(runIds)
    missing.forEach(id => allMissingIds.add(id))
    await logPipelineStep({
      run_id, step: 2, sub_step: 'a', sub_sub: String(i + 1).padStart(2, '0'),
      step_name: player.pl_name, output_recs: missing.length,
      duration_ms: Date.now() - tPlayer
    })
  }

  const { pairs_total, players_created } = await scrapeRunIds(allMissingIds)

  await logPipelineStep({
    run_id, step: 2, sub_step: 'a', step_name: 'Scrape Tracked Players',
    output_table: 'ts2_results', output_recs: pairs_total,
    duration_ms: Date.now() - t0
  })

  return { run_ids_new: allMissingIds.size, pairs_total, players_created }
}
