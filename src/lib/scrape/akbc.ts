import * as cheerio from 'cheerio'
import { parseResultsPage, toTitleCase, type ParsedSession } from './parseHtml'

const AKBC_BASE = 'https://auckland.nzbridgeclub.org'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-NZ,en;q=0.9'
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: BROWSER_HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.text()
}

/**
 * Fetch and parse a single session results page from AKBC.
 */
export async function fetchSessionResults(sourceId: number): Promise<ParsedSession> {
  const html = await fetchHtml(`${AKBC_BASE}/resultsbm.asp?id=${sourceId}&umbid=0`)
  return parseResultsPage(html)
}

export interface SessionListEntry {
  sourceId: number
  label: string
  date: string
  dayOfWeek: string
  isTeams?: boolean
  headeventId: number
}

export interface SessionHeaderEntry {
  headeventId: number
  label: string   // event name from level-1 page, e.g. "EASTER CONGRESS TEAMS"
  date: string    // ISO date string, empty for standalone imports
  year: number
}

export interface ParsedTeamMatch {
  matchNum: number
  vpScore: number   // this team's VP for this match (0–20 scale)
}

export interface ParsedTeamPair {
  player1Name: string
  player2Name: string
  matches: ParsedTeamMatch[]  // one entry per match played
}

export interface ParsedTeamSession {
  rounds: number    // number of matches played
  pairs: ParsedTeamPair[]
  skipped: boolean
  skipReason?: string
}

const TEAM_ROW_CLASSES = ['ResultsTableBody', 'ResultsTableBodyAlternateLine']

/**
 * Fetch and parse a team event from AKBC.
 *
 * Step 1: teamresults.asp?id=X&shownames=y  — get team list with player names and team numbers
 * Step 2: teamdetailedresults.asp?id=X&team=Y — per-match VPs for each team (never totals)
 *
 * Each team produces 2 pair rows (players 0+1 and 2+3). Each pair row has one
 * entry per match with the team's match VP (max 20).
 * 5th player (substitute) is ignored.
 */
export async function fetchTeamResults(sourceId: number): Promise<ParsedTeamSession> {
  // Step 1: get team list
  const summaryHtml = await fetchHtml(`${AKBC_BASE}/teamresults.asp?id=${sourceId}&shownames=y`)
  const $s = cheerio.load(summaryHtml)

  const teams = new Map<number, string[]>()  // teamNum → [playerNames]

  $s('tr').each((_i, row) => {
    const cls = $s(row).attr('class') ?? ''
    if (!TEAM_ROW_CLASSES.includes(cls)) return

    let teamCell = ''
    $s(row).find('td').each((_j, cell) => {
      const text = $s(cell).text().trim()
      if (/\(\d+\)/.test(text) && text.includes(' - ')) teamCell = text
    })
    if (!teamCell) return

    const numMatch = teamCell.match(/\((\d+)\)/)
    if (!numMatch) return
    const teamNum = parseInt(numMatch[1], 10)

    const namesOnly = teamCell.replace(/^.*?\(\d+\)\s*/, '')
    const players = namesOnly.split(' - ').map(n => toTitleCase(n.trim())).filter(Boolean)
    if (players.length >= 4) teams.set(teamNum, players)
  })

  if (teams.size === 0) {
    return { rounds: 0, pairs: [], skipped: true, skipReason: 'No teams found on summary page' }
  }

  // Step 2: scrape per-match VPs for each team in parallel
  const pairs: ParsedTeamPair[] = []

  await Promise.all(
    Array.from(teams.entries()).map(async ([teamNum, players]) => {
      try {
        const detailHtml = await fetchHtml(`${AKBC_BASE}/teamdetailedresults.asp?id=${sourceId}&team=${teamNum}`)
        const $d = cheerio.load(detailHtml)

        const matches: ParsedTeamMatch[] = []
        let matchNum = 0

        $d('tr').each((_i, row) => {
          const cls = $d(row).attr('class') ?? ''
          if (!TEAM_ROW_CLASSES.includes(cls)) return

          const cells = $d(row).find('td')
          // Columns: Match | Opponent | Imps | VPs | Cum.Rank
          if (cells.length < 4) return

          const vpText = $d(cells[3]).text().trim()
          const vp = parseFloat(vpText)
          if (isNaN(vp) || vp < 0 || vp > 20) return

          matchNum++
          matches.push({ matchNum, vpScore: vp })
        })

        if (matches.length === 0) return

        pairs.push({ player1Name: players[0], player2Name: players[1], matches })
        pairs.push({ player1Name: players[2], player2Name: players[3], matches })
      } catch {
        // skip team if detail page unavailable
      }
    })
  )

  if (pairs.length === 0) {
    return { rounds: 0, pairs: [], skipped: true, skipReason: 'No per-match data found' }
  }

  const rounds = pairs[0]?.matches.length ?? 0
  return { rounds, pairs, skipped: false }
}

const DAY_ABBR_MAP: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
  FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday'
}

export function parseLabelDay(label: string): string {
  const upper = label.toUpperCase()
  for (const [abbr, full] of Object.entries(DAY_ABBR_MAP)) {
    if (new RegExp(`\\b${abbr}\\b`).test(upper)) return full
  }
  return 'Unknown'
}

const MONTH_ABBR: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
}

export function parseAkbcDate(raw: string): string {
  const m = raw.match(/(\d{1,2})-([A-Z]{3})-(\d{2,4})/i)
  if (!m) return ''
  const [, day, mon, yr] = m
  const month = MONTH_ABBR[mon.toUpperCase()] ?? '01'
  const year = yr.length === 2 ? (parseInt(yr) < 50 ? `20${yr}` : `19${yr}`) : yr
  return `${year}-${month}-${day.padStart(2, '0')}`
}

/**
 * Fetch sessions for a single headeventid sub-page.
 * Used both by fetchSessionList (year scrape) and event-import (single event).
 */
export async function fetchEventSessions(headeventId: number, date = ''): Promise<SessionListEntry[]> {
  const subHtml = await fetchHtml(`${AKBC_BASE}/resultslistbm.asp?headeventid=${headeventId}`)
  const $sub = cheerio.load(subHtml)
  const entries: SessionListEntry[] = []
  const seenSourceIds = new Set<number>()

  $sub('a[href*="resultsbm.asp"]').each((_i, el) => {
    const href = $sub(el).attr('href') ?? ''
    const m = href.match(/[?&]id=(\d+)/)
    if (!m) return
    const sourceId = parseInt(m[1], 10)
    if (isNaN(sourceId) || seenSourceIds.has(sourceId)) return
    seenSourceIds.add(sourceId)
    const label = $sub(el).text().replace(/\s+/g, ' ').trim()
    const rowDate = $sub(el).closest('tr').find('td').first().text().trim()
    const resolvedDate = date || parseAkbcDate(label) || parseAkbcDate(rowDate)
    entries.push({ sourceId, label, date: resolvedDate, dayOfWeek: parseLabelDay(label), headeventId })
  })

  $sub('a[href*="teamresults.asp"]').each((_i, el) => {
    const href = $sub(el).attr('href') ?? ''
    const m = href.match(/[?&]id=(\d+)/)
    if (!m) return
    const sourceId = parseInt(m[1], 10)
    if (isNaN(sourceId) || seenSourceIds.has(sourceId)) return
    seenSourceIds.add(sourceId)
    const label = $sub(el).text().replace(/\s+/g, ' ').trim()
    const rowDate = $sub(el).closest('tr').find('td').first().text().trim()
    const resolvedDate = date || parseAkbcDate(label) || parseAkbcDate(rowDate)
    entries.push({ sourceId, label, date: resolvedDate, dayOfWeek: parseLabelDay(label), isTeams: true, headeventId })
  })

  return entries
}

/**
 * Fetch the full session list from AKBC for a given year.
 * Returns both event headers (level 1) and individual sessions (level 2).
 */
export async function fetchSessionList(year: number): Promise<{ headers: SessionHeaderEntry[], sessions: SessionListEntry[] }> {
  const mainHtml = await fetchHtml(`${AKBC_BASE}/resultslistbm.asp?year=${year}`)
  const $main = cheerio.load(mainHtml)

  const headeventids = new Map<number, { date: string; label: string }>()

  $main('a[href*="headeventid="]').each((_i, el) => {
    const href = $main(el).attr('href') ?? ''
    const m = href.match(/headeventid=(\d+)/)
    if (!m) return
    const id = parseInt(m[1], 10)
    if (isNaN(id) || headeventids.has(id)) return
    const rawDate = $main(el).closest('tr').find('td').first().text().trim()
    const label = $main(el).text().replace(/\s+/g, ' ').trim()
    headeventids.set(id, { date: parseAkbcDate(rawDate), label })
  })

  const headers: SessionHeaderEntry[] = Array.from(headeventids.entries()).map(([headeventId, { date, label }]) => ({
    headeventId, label, date, year
  }))

  const allSessions: SessionListEntry[] = []
  await Promise.all(
    Array.from(headeventids.entries()).map(async ([headeventid, { date }]) => {
      try {
        const sessions = await fetchEventSessions(headeventid, date)
        allSessions.push(...sessions)
      } catch {
        // skip sub-pages that fail
      }
    })
  )

  // Also capture direct session links on the year page (events with no headeventid sub-page).
  // Use the sourceId as a synthetic headeventId so they get a header row and appear in Available Sessions.
  const coveredSourceIds = new Set(allSessions.map(s => s.sourceId))
  const seenDirect = new Set<number>()

  const captureDirectYearLink = (el: any, isTeams: boolean) => {
    const href = $main(el).attr('href') ?? ''
    const m = href.match(/[?&]id=(\d+)/)
    if (!m) return
    const sourceId = parseInt(m[1], 10)
    if (isNaN(sourceId) || seenDirect.has(sourceId) || coveredSourceIds.has(sourceId)) return
    seenDirect.add(sourceId)
    const rawDate = $main(el).closest('tr').find('td').first().text().trim()
    const label = $main(el).text().replace(/\s+/g, ' ').trim()
    const date = parseAkbcDate(rawDate) || parseAkbcDate(label)
    headers.push({ headeventId: sourceId, label, date, year })
    allSessions.push({ sourceId, label, date, dayOfWeek: parseLabelDay(label), isTeams, headeventId: sourceId })
  }
  $main('a[href*="teamresults.asp"]').each((_i, el) => captureDirectYearLink(el, true))
  $main('a[href*="resultsbm.asp"]').each((_i, el) => captureDirectYearLink(el, false))

  allSessions.sort((a, b) => b.sourceId - a.sourceId)
  return { headers, sessions: allSessions }
}
