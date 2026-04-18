import * as cheerio from 'cheerio'
import { parseResultsPage, type ParsedSession } from './parseHtml'

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
}

const DAY_ABBR_MAP: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
  FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday'
}

function parseLabelDay(label: string): string {
  const upper = label.toUpperCase()
  for (const [abbr, full] of Object.entries(DAY_ABBR_MAP)) {
    if (new RegExp(`\\b${abbr}\\b`).test(upper)) return full
  }
  return 'Unknown'
}

/**
 * Fetch the full session list from AKBC for a given year.
 *
 * The site is two levels deep:
 *   1. resultslistbm.asp?year=YYYY  →  rows with headeventid links
 *   2. resultslistbm.asp?headeventid=X  →  rows with resultsbm.asp?id=XXXXXX links
 *
 * We fetch level 1, collect all unique headeventids, then fetch each in
 * parallel to collect the actual source IDs.
 */
export async function fetchSessionList(year: number): Promise<SessionListEntry[]> {
  // Level 1 — main list for the year
  const mainHtml = await fetchHtml(`${AKBC_BASE}/resultslistbm.asp?year=${year}`)
  const $main = cheerio.load(mainHtml)

  // Collect unique headeventids + the date shown in the same row
  const headeventids = new Map<number, string>() // id → date string

  $main('a[href*="headeventid="]').each((_i, el) => {
    const href = $main(el).attr('href') ?? ''
    const m = href.match(/headeventid=(\d+)/)
    if (!m) return
    const id = parseInt(m[1], 10)
    if (isNaN(id) || headeventids.has(id)) return
    const date = $main(el).closest('tr').find('td').first().text().trim()
    headeventids.set(id, date)
  })

  // Level 2 — fetch each headeventid sub-page in parallel
  const entries: SessionListEntry[] = []
  const seenSourceIds = new Set<number>()

  await Promise.all(
    Array.from(headeventids.entries()).map(async ([headeventid, date]) => {
      try {
        const subHtml = await fetchHtml(`${AKBC_BASE}/resultslistbm.asp?headeventid=${headeventid}`)
        const $sub = cheerio.load(subHtml)

        $sub('a[href*="resultsbm.asp"]').each((_i, el) => {
          const href = $sub(el).attr('href') ?? ''
          const m = href.match(/[?&]id=(\d+)/)
          if (!m) return
          const sourceId = parseInt(m[1], 10)
          if (isNaN(sourceId) || seenSourceIds.has(sourceId)) return
          seenSourceIds.add(sourceId)
          const label = $sub(el).text().replace(/\s+/g, ' ').trim()
          entries.push({ sourceId, label, date, dayOfWeek: parseLabelDay(label) })
        })
      } catch {
        // skip sub-pages that fail (e.g. team events)
      }
    })
  )

  // Sort newest first by sourceId (IDs are sequential)
  return entries.sort((a, b) => b.sourceId - a.sourceId)
}
