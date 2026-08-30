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
  SCRAPE_TIME_BUDGET_MS,
  FETCH_TIMEOUT_MS,
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
  timed_out:       boolean
}

export type ScrapeClubSessionsResult = ScrapeSessionsResult & {
  from_date: string
  to_date:   string
}

//----------------------------------------------------------------------------------
//  fetchWithTimeout — fetch(url) aborted by an AbortController after timeoutMs
//  (default FETCH_TIMEOUT_MS). The pipeline scrape's raw fetches had no timeout at
//  all, so one stalled nzbridge connection could burn the whole function budget.
//  Overrideable per run via the routes' ?fetch_timeout_ms= query param.
//----------------------------------------------------------------------------------
async function fetchWithTimeout(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { headers: UA, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timer)
  }
}

//----------------------------------------------------------------------------------
//  datesInRange — every ISO (YYYY-MM-DD) date string from `from` to `to` inclusive
//----------------------------------------------------------------------------------
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

//----------------------------------------------------------------------------------
//  parseDate — "D MMM YY(YY)" → ISO YYYY-MM-DD; null when the string doesn't match
//  that shape or the month abbreviation is unknown. 2-digit years become 20xx
//----------------------------------------------------------------------------------
function parseDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s+(\w{3})\s+(\d{2,4})$/)
  if (!m) return null
  const month = MONTH[m[2]]
  if (!month) return null
  const year = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${year}-${month}-${m[1].padStart(2, '0')}`
}

//----------------------------------------------------------------------------------
//  parseScore — splits a score cell into { value, type }, reading a PCT/VP/XIMP(S)
//  suffix; an unrecognised suffix still yields the numeric value under the
//  UNKNOWN_SCORE_TYPE sentinel; null only when there is no leading number at all
//----------------------------------------------------------------------------------
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

//----------------------------------------------------------------------------------
//  normaliseScore — resets an out-of-range PCT to 50 and an over-VP_SCORE_SANITY_MAX
//  VP to VP_SCORE_SANITY_RESET; passes every other value through unchanged
//----------------------------------------------------------------------------------
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

//----------------------------------------------------------------------------------
//  parsePage — parses an NZB results HTML page into ParsedRow[] grouped by run_id,
//  scanning only tables that have both an "event" and a "player" header column and
//  keeping only rows whose event link carries a run_id and whose score parses
//----------------------------------------------------------------------------------
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

      //----------------------------------------------------------------------------------------------
      //  get — trimmed text of the cell at column idx, or '' when idx < 0
      //----------------------------------------------------------------------------------------------
      function get(idx: number): string {
        return idx >= 0 ? $(cells[idx]).text().trim() : ''
      }

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

//----------------------------------------------------------------------------------
//  getOrCreatePlayer — returns the pl_plid for a whitespace-normalised name,
//  inserting a tpl_players row (pl_nzb 0) when none exists; `created` says whether
//  a new row was made. Reselects after an ON CONFLICT no-op insert
//----------------------------------------------------------------------------------
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

//----------------------------------------------------------------------------------
//  scrapeRunId — fetches one run_id's results page, upserts its ts1_sessions header
//  row and every ts2_results pair row (creating players as needed), and deletes the
//  ts1_sessions header again when the page yielded no valid pair rows. `toDate` (ISO
//  YYYY-MM-DD) caps it: a session dated after toDate is skipped without any write —
//  this is how the tracked scrape gets a To-date bound (its discovery yields run_ids
//  with no date), and a harmless safeguard for the already-bounded AKBC scrape.
//----------------------------------------------------------------------------------
async function scrapeRunId(run_id: number, fetchTimeoutMs?: number, toDate?: string): Promise<{ pairs: number; created: number }> {
  let response: Response
  try {
    response = await fetchWithTimeout(`${NZB_BASE}/results.html?run_id=${run_id}`, fetchTimeoutMs)
  } catch {
    //
    //  Timed out / network error on this one run_id — skip it (like a non-OK response)
    //  rather than failing the whole batch; a later run re-fetches it via batchCheckMissing
    //
    return { pairs: 0, created: 0 }
  }
  if (!response.ok) return { pairs: 0, created: 0 }

  const rowsByRunId = parsePage(await response.text())
  const rows = rowsByRunId.get(run_id) ?? []
  if (rows.length === 0) return { pairs: 0, created: 0 }

  const headerRow = rows.find(r => r.player_names.length === 2 || r.player_names.length === 4)

  //
  //  To-date cap — this session is past the cutoff, so write nothing (ISO date strings
  //  compare lexicographically). A later run picks it up once the cap is lifted / advanced.
  //
  const sessionDate = headerRow?.date ?? rows[0]?.date ?? null
  if (toDate && sessionDate && sessionDate > toDate) return { pairs: 0, created: 0 }

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
//  the club and tracked-player scrape steps. Stops before starting a new run_id once
//  past `deadline` (epoch ms) — never mid-run_id, so each run_id is either fully
//  written or not started, and the next run resumes the rest via batchCheckMissing.
//----------------------------------------------------------------------------------
async function scrapeRunIds(missingIds: Set<number>, deadline: number, fetchTimeoutMs?: number, toDate?: string): Promise<{ pairs_total: number; players_created: number; timed_out: boolean }> {
  let pairs_total = 0, players_created = 0, timed_out = false
  for (const missingRunId of missingIds) {
    if (Date.now() > deadline) { timed_out = true; break }
    const { pairs, created } = await scrapeRunId(missingRunId, fetchTimeoutMs, toDate)
    pairs_total      += pairs
    players_created  += created
  }
  return { pairs_total, players_created, timed_out }
}

//----------------------------------------------------------------------------------
//  getMaxSessionDate — MAX(se_date) from tse_sessions as an ISO text string, or
//  null when the table is empty (uncached)
//----------------------------------------------------------------------------------
async function getMaxSessionDate(): Promise<string | null> {
  const rows = await table_query({
    caller: 'pipelineScrape/from-date',
    query:  `SELECT MAX(se_date)::text AS from_date FROM tse_sessions`,
    params: [],
    skipCache: true
  }) as { from_date: string | null }[]
  return rows[0]?.from_date ?? null
}

//----------------------------------------------------------------------------------
//  getDateRange — resolves the scrape date window: an override wins, else
//  MAX(se_date), else SCRAPE_FALLBACK_LOOKBACK_DAYS back from today for from_date;
//  to_date defaults to today
//----------------------------------------------------------------------------------
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
//  of a new coordinated run. timeBudgetMs / fetchTimeoutMs default to
//  SCRAPE_TIME_BUDGET_MS / FETCH_TIMEOUT_MS; once past the budget the discovery and
//  fetch loops stop and commit what they have, and the next run resumes the rest.
//----------------------------------------------------------------------------------
export async function scrapeClubSessions(fromDateOverride?: string, toDateOverride?: string, timeBudgetMs?: number, fetchTimeoutMs?: number): Promise<ScrapeClubSessionsResult> {
  const t0 = Date.now()
  const deadline = Date.now() + (timeBudgetMs ?? SCRAPE_TIME_BUDGET_MS)
  //
  //  The run_id is now created by the dedicated /api/build/start-run step (step 0),
  //  which runs first — both as the earliest Vercel cron and at the front of every
  //  "Run All" sequence — so this step just reuses the current run like the rest.
  //
  const run_id = await resolvePipRunId(1, false)

  const { from_date, to_date } = await getDateRange(fromDateOverride, toDateOverride)

  await table_truncate('ts1_sessions', 'pipelineScrape/truncate-ts1')
  await table_truncate('ts2_results',  'pipelineScrape/truncate-ts2')

  const allMissingIds = new Set<number>()
  let timed_out = false
  for (const day of datesInRange(from_date, to_date)) {
    if (Date.now() > deadline) { timed_out = true; break }
    const url = `${NZB_BASE}/results.html?mp_filter_club=${BRIDGE_CLUB_ID}&date_start=${day}&date_end=${day}&mp_results=Search`
    let res: Response
    try {
      res = await fetchWithTimeout(url, fetchTimeoutMs)
    } catch {
      continue
    }
    if (!res.ok) continue
    const { runIds } = extractRunIds(await res.text())
    const missing = await batchCheckMissing(runIds)
    missing.forEach(id => allMissingIds.add(id))
  }

  const runIdsResult = await scrapeRunIds(allMissingIds, deadline, fetchTimeoutMs, toDateOverride)
  timed_out = timed_out || runIdsResult.timed_out

  await logPipelineStep({
    run_id, step: 1, sub_step: 'a', step_name: 'Scrape AKBC',
    output_table: 'ts2_results', output_recs: runIdsResult.pairs_total,
    duration_ms: Date.now() - t0
  })

  return { from_date, to_date, run_ids_new: allMissingIds.size, pairs_total: runIdsResult.pairs_total, players_created: runIdsResult.players_created, timed_out }
}

//----------------------------------------------------------------------------------
//  scrapeTrackedPlayerSessions — step 2: discovers and scrapes every flagged tracked
//  player's full match history, writing ts1_sessions + ts2_results. No date range (NZB
//  returns each player's entire history) and no truncate — relies on
//  batchCheckMissing() to skip anything already in tse_sessions/ts1_sessions, so
//  re-running this never re-fetches sessions already captured by a previous run
//  (including this same session's Scrape AKBC step, once Build Sessions has run).
//  toDateOverride (ISO YYYY-MM-DD) caps it: a discovered run_id whose session is dated
//  after toDateOverride is fetched but not written (scrapeRunId skips it), since the
//  online-points discovery yields run_ids with no date. timeBudgetMs / fetchTimeoutMs
//  behave as in scrapeClubSessions — the player loop and the run_id fetch loop stop and
//  commit once past the budget, next run resumes.
//----------------------------------------------------------------------------------
export async function scrapeTrackedPlayerSessions(toDateOverride?: string, timeBudgetMs?: number, fetchTimeoutMs?: number): Promise<ScrapeSessionsResult> {
  const t0 = Date.now()
  const deadline = Date.now() + (timeBudgetMs ?? SCRAPE_TIME_BUDGET_MS)
  const run_id = await resolvePipRunId(2, false)

  const flagged = await table_query({
    caller: 'pipelineScrape/flagged',
    query:  `SELECT pl_name, pl_nzb FROM tpl_players WHERE pl_tracked = TRUE AND pl_nzb > 0 ORDER BY pl_name ASC`,
    params: [],
    skipCache: true
  }) as { pl_name: string; pl_nzb: number }[]

  const allMissingIds = new Set<number>()
  let timed_out = false
  for (let i = 0; i < flagged.length; i++) {
    if (Date.now() > deadline) { timed_out = true; break }
    const player = flagged[i]
    const tPlayer = Date.now()
    const url = `${NZB_BASE}/online-points.html?mpsr=1&mp_user=${player.pl_nzb}`
    let res: Response
    try {
      res = await fetchWithTimeout(url, fetchTimeoutMs)
    } catch {
      continue
    }
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

  const runIdsResult = await scrapeRunIds(allMissingIds, deadline, fetchTimeoutMs, toDateOverride)
  timed_out = timed_out || runIdsResult.timed_out

  await logPipelineStep({
    run_id, step: 2, sub_step: 'a', step_name: 'Scrape Tracked Players',
    output_table: 'ts2_results', output_recs: runIdsResult.pairs_total,
    duration_ms: Date.now() - t0
  })

  return { run_ids_new: allMissingIds.size, pairs_total: runIdsResult.pairs_total, players_created: runIdsResult.players_created, timed_out }
}
