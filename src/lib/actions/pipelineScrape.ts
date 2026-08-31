'use server'

import * as cheerio from 'cheerio'
import { table_query } from 'nextjs-shared/table_query'
import { table_write } from 'nextjs-shared/table_write'
import { table_upsert } from 'nextjs-shared/table_upsert'
import { table_truncate } from 'nextjs-shared/table_truncate'
import { write_logging } from 'nextjs-shared/write_logging'
import { extractRunIds } from '@/src/lib/scrapeUtils'
import { logPipelineStep, resolvePipRunId } from '@/src/lib/actions/pipelineLog'

//
//  PHASE7-TRACE — bring-up trace logging at severity 'P' (persists on prod, unlike 'I').
//  Remove every `trace(...)` call and this helper once the new cron split is proven.
//
function trace(where: string, msg: string) {
  const result = write_logging({ lg_functionname: where, lg_caller: 'phase7', lg_msg: msg, lg_severity: 'P' })
  return result
}
import {
  BRIDGE_CLUB_ID,
  SCRAPE_FALLBACK_LOOKBACK_DAYS,
  FETCH_TIMEOUT_MS,
  TRACKED_SCRAPE_BATCH_SIZE,
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
        //
        //  collapse any internal whitespace in the club name (get() already trims the
        //  ends) so it exact-matches tcl_clubs.cl_club at build time — same normalisation
        //  player names get above
        //
        run_id, event_name, date: parsedDate, club: get(colClub).replace(/\s+/g, ' '),
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
  const existingResult = await table_query({
    caller: 'pipelineScrape/lookup',
    table: 'tpl_players',
    query:  `SELECT pl_plid FROM tpl_players WHERE LOWER(pl_name) = LOWER($1)`,
    params: [name]
  })
  if (!existingResult.ok) throw new Error('pipelineScrape/getOrCreatePlayer/lookup: ' + existingResult.error)
  const existing = existingResult.data as { pl_plid: number }[]
  if (existing.length > 0) return { plid: existing[0].pl_plid, created: false }

  const insertedResult = await table_write({
    caller: 'pipelineScrape/create',
    table: 'tpl_players',
    conflictColumn: 'pl_name',
    columnValuePairs: [
      { column: 'pl_name',             value: name },
      { column: 'pl_nzb', value: 0 },
    ]
  })
  if (!insertedResult.ok) throw new Error('pipelineScrape/getOrCreatePlayer/create: ' + insertedResult.error)
  const inserted = insertedResult.data as { pl_plid: number }[]
  if (inserted.length > 0) return { plid: inserted[0].pl_plid, created: true }

  const reselectResult = await table_query({
    caller: 'pipelineScrape/reselect',
    table: 'tpl_players',
    query:  `SELECT pl_plid FROM tpl_players WHERE pl_name = $1`,
    params: [name]
  })
  if (!reselectResult.ok) throw new Error('pipelineScrape/getOrCreatePlayer/reselect: ' + reselectResult.error)
  const reselect = reselectResult.data as { pl_plid: number }[]
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
  const existingResult = await table_query({
    caller: 'pipelineScrape/check',
    table: 'tse_sessions',
    query: `SELECT se_run_id AS run_id FROM tse_sessions WHERE se_run_id = ANY($1)
            UNION
            SELECT s1_run_id AS run_id FROM ts1_sessions WHERE s1_run_id = ANY($1)`,
    params: [runIds] as unknown as (string | number | boolean | null)[],
    skipCache: true
  })
  if (!existingResult.ok) throw new Error('pipelineScrape/batchCheckMissing: ' + existingResult.error)
  const existing = existingResult.data as { run_id: number }[]
  const existingSet = new Set(existing.map(r => r.run_id))
  return runIds.filter(id => !existingSet.has(id))
}

//----------------------------------------------------------------------------------
//  persistSessionsFromPage — for every run_id in a parsed results page, upserts its
//  ts1_sessions header + inserts every ts2_results pair row (creating players as
//  needed), and deletes the ts1_sessions header again for any run_id that yielded no
//  valid pairs. Shared by the AKBC day-search scrape (many run_ids per page) and the
//  tracked per-run_id scrape (one). `toDate` (ISO YYYY-MM-DD) skips a session dated
//  after the cap without any write (ISO strings compare lexicographically).
//----------------------------------------------------------------------------------
async function persistSessionsFromPage(rowsByRunId: Map<number, ParsedRow[]>, toDate?: string): Promise<{ pairs_total: number; players_created: number }> {
  let pairs_total = 0, players_created = 0

  for (const [run_id, rows] of rowsByRunId) {
    if (rows.length === 0) continue

    const headerRow = rows.find(r => r.player_names.length === 2 || r.player_names.length === 4)
    const sessionDate = headerRow?.date ?? rows[0]?.date ?? null
    if (toDate && sessionDate && sessionDate > toDate) {
      await trace('persistSessionsFromPage', `run_id ${run_id} dated ${sessionDate} > cap ${toDate} — skipped`)
      continue
    }

    if (headerRow) {
      const event_type = headerRow.player_names.length === 4 ? 'teams' : 'pairs'
      const upsertTs1Result = await table_upsert({
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
      if (!upsertTs1Result.ok) {
        write_logging({ lg_functionname: 'persistSessionsFromPage', lg_caller: 'pipelineScrape/upsert-ts1', lg_msg: `Failed to upsert ts1_sessions for run_id ${run_id}: ` + upsertTs1Result.error, lg_severity: 'E' })
      }
    }

    let pairs = 0
    for (const row of rows) {
      const { player_names, score_value } = row
      let pairList: [string, string][] = []
      if (player_names.length === 2)      pairList = [[player_names[0], player_names[1]]]
      else if (player_names.length === 4) pairList = [[player_names[0], player_names[1]], [player_names[2], player_names[3]]]
      else continue

      for (const [nameA, nameB] of pairList) {
        const a = await getOrCreatePlayer(nameA)
        const b = await getOrCreatePlayer(nameB)
        if (a.created) players_created++
        if (b.created) players_created++
        const insertTs2Result = await table_write({
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
        if (!insertTs2Result.ok) {
          write_logging({ lg_functionname: 'persistSessionsFromPage', lg_caller: 'pipelineScrape/insert-ts2', lg_msg: `Failed to insert ts2_results for run_id ${run_id}: ` + insertTs2Result.error, lg_severity: 'E' })
        }
        pairs++
      }
    }

    if (pairs === 0 && headerRow) {
      //
      //  This run_id's page had no valid pair rows (e.g. the website shows the session
      //  with no player data) — remove its ts1_sessions header so it never reaches Build
      //  Sessions with nothing for Build Results to ever fill in
      //
      const deleteEmptyResult = await table_query({
        caller: 'pipelineScrape/delete-empty-ts1',
        table: 'ts1_sessions',
        query: `DELETE FROM ts1_sessions WHERE s1_run_id = $1`,
        params: [run_id],
        isupdate: true
      })
      if (!deleteEmptyResult.ok) {
        write_logging({ lg_functionname: 'persistSessionsFromPage', lg_caller: 'pipelineScrape/delete-empty-ts1', lg_msg: `Failed to delete empty ts1_sessions header for run_id ${run_id}: ` + deleteEmptyResult.error, lg_severity: 'E' })
      }
      await trace('persistSessionsFromPage', `run_id ${run_id} (${sessionDate ?? '?'}) had no pairs — ts1 header removed`)
    } else {
      await trace('persistSessionsFromPage', `run_id ${run_id} (${sessionDate ?? '?'}) "${headerRow?.event_name ?? ''}" → ${pairs} pairs written`)
    }

    pairs_total += pairs
  }

  return { pairs_total, players_created }
}

//----------------------------------------------------------------------------------
//  scrapeRunId — fetches one run_id's results page and persists just that session's
//  ts1_sessions + ts2_results rows via persistSessionsFromPage. Used by the tracked
//  scrape, whose online-points discovery yields run_ids with no date/pair data.
//  `toDate` (ISO YYYY-MM-DD) skips a session dated after the cap without any write.
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
    await trace('scrapeRunId', `run_id ${run_id} fetch failed/timed out — skipped`)
    return { pairs: 0, created: 0 }
  }
  if (!response.ok) {
    await trace('scrapeRunId', `run_id ${run_id} HTTP ${response.status} — skipped`)
    return { pairs: 0, created: 0 }
  }

  const rowsByRunId = parsePage(await response.text())
  const oneSession = new Map<number, ParsedRow[]>([[run_id, rowsByRunId.get(run_id) ?? []]])
  const { pairs_total, players_created } = await persistSessionsFromPage(oneSession, toDate)
  return { pairs: pairs_total, created: players_created }
}

//----------------------------------------------------------------------------------
//  scrapeRunIds — fetches and writes every run_id in the given set; shared by both
//  the club and tracked-player scrape steps.
//----------------------------------------------------------------------------------
async function scrapeRunIds(missingIds: Set<number>, fetchTimeoutMs?: number, toDate?: string): Promise<{ pairs_total: number; players_created: number }> {
  let pairs_total = 0, players_created = 0
  for (const missingRunId of missingIds) {
    const { pairs, created } = await scrapeRunId(missingRunId, fetchTimeoutMs, toDate)
    pairs_total      += pairs
    players_created  += created
  }
  return { pairs_total, players_created }
}

//----------------------------------------------------------------------------------
//  getMaxSessionDate — MAX(se_date) from tse_sessions as an ISO text string, or
//  null when nothing matches (uncached). `scope` picks the club filter:
//    'akbc'    → se_club_nzb = BRIDGE_CLUB_ID (the AKBC catch-up / next-day scrape,
//               so a non-AKBC session the tracked scrape pulled in can't skew it)
//    'tracked' → se_club_nzb IS DISTINCT FROM BRIDGE_CLUB_ID (every non-AKBC session,
//               NULL-safe — clubs with no cl_nzb still count). No caller yet; kept
//               for a future tracked-day scrape.
//----------------------------------------------------------------------------------
async function getMaxSessionDate(scope: 'akbc' | 'tracked'): Promise<string | null> {
  const clubFilter = scope === 'akbc'
    ? 'se_club_nzb = $1'
    : 'se_club_nzb IS DISTINCT FROM $1'
  const result = await table_query({
    caller: 'pipelineScrape/from-date',
    table: 'tse_sessions',
    query:  `SELECT MAX(se_date)::text AS from_date FROM tse_sessions WHERE ${clubFilter}`,
    params: [BRIDGE_CLUB_ID],
    skipCache: true
  })
  if (!result.ok) {
    write_logging({ lg_functionname: 'getMaxSessionDate', lg_caller: 'pipelineScrape/from-date', lg_msg: `Failed to read MAX(se_date) for scope ${scope}: ` + result.error, lg_severity: 'E' })
    return null
  }
  const rows = result.data as { from_date: string | null }[]
  return rows[0]?.from_date ?? null
}

//----------------------------------------------------------------------------------
//  getDateRange — resolves the scrape date window: an override wins, else
//  MAX(se_date), else SCRAPE_FALLBACK_LOOKBACK_DAYS back from today for from_date;
//  to_date defaults to today
//----------------------------------------------------------------------------------
async function getDateRange(fromDateOverride?: string, toDateOverride?: string): Promise<{ from_date: string; to_date: string }> {
  const from_date = fromDateOverride
    ?? (await getMaxSessionDate('akbc'))
    ?? new Date(Date.now() - SCRAPE_FALLBACK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const to_date = toDateOverride ?? new Date().toISOString().slice(0, 10)
  return { from_date, to_date }
}

//----------------------------------------------------------------------------------
//  getScrapeFromDate — the automatic starting point for the next Scrape run (MAX
//  se_date in tse_sessions), for display next to the optional to_date input in the UI
//----------------------------------------------------------------------------------
export async function getScrapeFromDate(): Promise<string | null> {
  return getMaxSessionDate('akbc')
}

//----------------------------------------------------------------------------------
//  getPipelineMaxDates — MAX(se_date) for each pipeline: akbc = se_club_nzb 106,
//  tracked = everything else (NULL-safe). Shown on the /owner/pipeline Overview so
//  it's clear how far each side has caught up.
//----------------------------------------------------------------------------------
export async function getPipelineMaxDates(): Promise<{ akbc: string | null; tracked: string | null }> {
  const [akbc, tracked] = await Promise.all([
    getMaxSessionDate('akbc'),
    getMaxSessionDate('tracked')
  ])
  const result = { akbc, tracked }
  return result
}

//----------------------------------------------------------------------------------
//  addOneDay — ISO YYYY-MM-DD string advanced by one calendar day
//----------------------------------------------------------------------------------
function addOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

//----------------------------------------------------------------------------------
//  getNextScrapeDay — the single day the AKBC per-day cron should scrape: MAX(se_date)
//  + 1 (or the fallback-lookback day + 1 when no session exists yet). Returns null
//  when that day is in the future, or past `toDate` when given — nothing to scrape
//  yet. `toDate` (ISO YYYY-MM-DD) is the UI test cap; prod passes it empty → undefined.
//----------------------------------------------------------------------------------
export async function getNextScrapeDay(toDate?: string): Promise<string | null> {
  const max = await getMaxSessionDate('akbc')
  const base = max ?? new Date(Date.now() - SCRAPE_FALLBACK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const next = addOneDay(base)
  const today = new Date().toISOString().slice(0, 10)
  const cap = toDate && toDate < today ? toDate : today
  const result = next > cap ? null : next
  await trace('getNextScrapeDay', `MAX(se_date)=${max ?? 'none'} cap=${cap}${toDate ? ` (to_date ${toDate})` : ''} → ${result ?? 'past cap, nothing to scrape'}`)
  return result
}

//----------------------------------------------------------------------------------
//  scrapeAkbcDay — scrapes exactly one AKBC day in a single fetch of the club/date
//  search page (which carries the full pair detail), writing ts1_sessions +
//  ts2_results for every session that day via persistSessionsFromPage. No per-run_id
//  fetch. Caller is responsible for truncating staging and building.
//----------------------------------------------------------------------------------
export async function scrapeAkbcDay(day: string, fetchTimeoutMs?: number): Promise<{ run_ids: number; pairs_total: number; players_created: number }> {
  const url = `${NZB_BASE}/results.html?mp_filter_club=${BRIDGE_CLUB_ID}&date_start=${day}&date_end=${day}&mp_results=Search`
  await trace('scrapeAkbcDay', `${day} — fetching ${url}`)
  let res: Response
  try {
    res = await fetchWithTimeout(url, fetchTimeoutMs)
  } catch {
    await trace('scrapeAkbcDay', `${day} — search fetch failed/timed out`)
    return { run_ids: 0, pairs_total: 0, players_created: 0 }
  }
  if (!res.ok) {
    await trace('scrapeAkbcDay', `${day} — search HTTP ${res.status}`)
    return { run_ids: 0, pairs_total: 0, players_created: 0 }
  }

  const rowsByRunId = parsePage(await res.text())
  await trace('scrapeAkbcDay', `${day} — parsed ${rowsByRunId.size} session(s): run_ids [${[...rowsByRunId.keys()].join(', ')}]`)
  const { pairs_total, players_created } = await persistSessionsFromPage(rowsByRunId)
  await trace('scrapeAkbcDay', `${day} — done: ${rowsByRunId.size} sessions, ${pairs_total} pairs, ${players_created} new players`)
  return { run_ids: rowsByRunId.size, pairs_total, players_created }
}

//----------------------------------------------------------------------------------
//  scrapeClubSessions — step 1: discovers and scrapes AKBC club sessions since the
//  last-built session date (or fromDateOverride, when the automatic MAX(se_date) has
//  been pushed forward by tracked-player sessions and a historical backlog still needs
//  processing; or toDateOverride, if capping a catch-up run to a smaller range),
//  writing ts1_sessions + ts2_results. Truncates staging first. This param-less-friendly
//  catch-up loop (many days per call) is kept for manual / `npm run localprod` use;
//  the daily crons use the one-day /api/build/scrape-akbc-day route instead.
//----------------------------------------------------------------------------------
export async function scrapeClubSessions(fromDateOverride?: string, toDateOverride?: string, fetchTimeoutMs?: number): Promise<ScrapeClubSessionsResult> {
  const t0 = Date.now()
  const run_id = await resolvePipRunId(1, false)

  const { from_date, to_date } = await getDateRange(fromDateOverride, toDateOverride)

  const tr1 = await table_truncate('ts1_sessions', 'pipelineScrape/truncate-ts1')
  const tr2 = await table_truncate('ts2_results',  'pipelineScrape/truncate-ts2')
  if (!tr1.ok || !tr2.ok) {
    write_logging({ lg_functionname: 'scrapeClubSessions', lg_caller: 'pipelineScrape/truncate', lg_msg: 'Failed to truncate staging tables: ' + (tr1.error ?? tr2.error), lg_severity: 'E' })
  }

  const allMissingIds = new Set<number>()
  for (const day of datesInRange(from_date, to_date)) {
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

  const runIdsResult = await scrapeRunIds(allMissingIds, fetchTimeoutMs, toDateOverride)

  await logPipelineStep({
    run_id, step: 1, sub_step: 'a', step_name: 'Scrape AKBC',
    output_table: 'ts2_results', output_recs: runIdsResult.pairs_total,
    duration_ms: Date.now() - t0
  })

  return { from_date, to_date, run_ids_new: allMissingIds.size, pairs_total: runIdsResult.pairs_total, players_created: runIdsResult.players_created }
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
//  online-points discovery yields run_ids with no date. `batch` (**1-indexed**) restricts
//  it to one TRACKED_SCRAPE_BATCH_SIZE slice of the pl_name-ordered tracked list — the
//  per-batch cron path (logs its per-player rows under pip_batch = the batch number,
//  pip_sub_sub = the player, no summary row — the route writes that); undefined = every
//  tracked player + a summary row (pip_batch 1 via the logPipelineStep default), as
//  before (manual / localprod).
//----------------------------------------------------------------------------------
export async function scrapeTrackedPlayerSessions(toDateOverride?: string, fetchTimeoutMs?: number, batch?: number): Promise<ScrapeSessionsResult> {
  const t0 = Date.now()
  const run_id = await resolvePipRunId(2, false)

  const sliceClause = batch != null
    ? ` LIMIT ${TRACKED_SCRAPE_BATCH_SIZE} OFFSET ${(batch - 1) * TRACKED_SCRAPE_BATCH_SIZE}`
    : ''

  const flaggedResult = await table_query({
    caller: 'pipelineScrape/flagged',
    table: 'tpl_players',
    query:  `SELECT pl_name, pl_nzb FROM tpl_players WHERE pl_tracked = TRUE AND pl_nzb > 0 ORDER BY pl_name ASC${sliceClause}`,
    params: [],
    skipCache: true
  })
  if (!flaggedResult.ok) {
    write_logging({ lg_functionname: 'scrapeTrackedPlayerSessions', lg_caller: 'pipelineScrape/flagged', lg_msg: 'Failed to read tracked players: ' + flaggedResult.error, lg_severity: 'E' })
    throw new Error('scrapeTrackedPlayerSessions: failed to read tracked players: ' + flaggedResult.error)
  }
  const flagged = flaggedResult.data as { pl_name: string; pl_nzb: number }[]

  await trace('scrapeTrackedPlayerSessions', `${batch != null ? `batch ${batch}` : 'all players'} — ${flagged.length} player(s): ${flagged.map(p => p.pl_name).join(', ')}`)

  const allMissingIds = new Set<number>()
  for (let i = 0; i < flagged.length; i++) {
    const player = flagged[i]
    const tPlayer = Date.now()
    const url = `${NZB_BASE}/online-points.html?mpsr=1&mp_user=${player.pl_nzb}`
    let res: Response
    try {
      res = await fetchWithTimeout(url, fetchTimeoutMs)
    } catch {
      await trace('scrapeTrackedPlayerSessions', `${player.pl_name} — online-points fetch failed/timed out`)
      continue
    }
    if (!res.ok) {
      await trace('scrapeTrackedPlayerSessions', `${player.pl_name} — online-points HTTP ${res.status}`)
      continue
    }
    const { runIds } = extractRunIds(await res.text())
    const missing = await batchCheckMissing(runIds)
    missing.forEach(id => allMissingIds.add(id))
    await trace('scrapeTrackedPlayerSessions', `${player.pl_name} — ${runIds.length} run_ids on page, ${missing.length} missing`)
    await logPipelineStep({
      run_id, step: 2, batch: batch ?? 1, sub_sub: String(i + 1).padStart(2, '0'),
      step_name: player.pl_name, output_recs: missing.length,
      duration_ms: Date.now() - tPlayer
    })
  }

  await trace('scrapeTrackedPlayerSessions', `${batch != null ? `batch ${batch}` : 'all'} — ${allMissingIds.size} unique missing run_ids to fetch`)
  const runIdsResult = await scrapeRunIds(allMissingIds, fetchTimeoutMs, toDateOverride)

  if (batch == null) {
    await logPipelineStep({
      run_id, step: 2, step_name: 'Scrape Tracked Players',
      output_table: 'ts2_results', output_recs: runIdsResult.pairs_total,
      duration_ms: Date.now() - t0
    })
  }

  return { run_ids_new: allMissingIds.size, pairs_total: runIdsResult.pairs_total, players_created: runIdsResult.players_created }
}
