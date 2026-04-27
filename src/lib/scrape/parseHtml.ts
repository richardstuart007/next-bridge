import * as cheerio from 'cheerio'

// -----------------------------------------------------------------------
// Name normalisation
// -----------------------------------------------------------------------

/**
 * Convert ALL CAPS name to Title Case.
 * Handles NZ/Irish prefixes: Mc, Mac, O'
 */
export function toTitleCase(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map(capitaliseWord)
    .join(' ')
}

function capitaliseWord(word: string): string {
  if (!word) return word
  if (/^o'/.test(word)) return "O'" + capitaliseWord(word.slice(2))
  if (word.startsWith('mc') && word.length > 2) return 'Mc' + capitaliseWord(word.slice(2))
  if (word.startsWith('mac') && word.length > 3) return 'Mac' + capitaliseWord(word.slice(3))
  return word.charAt(0).toUpperCase() + word.slice(1)
}

// -----------------------------------------------------------------------
// AKBC results page parsing
// -----------------------------------------------------------------------

export interface ParsedPair {
  player1Name: string
  player2Name: string
  percentage: number
  player1NzNumber?: number
  player2NzNumber?: number
  pairHref?: string
}

export interface ParsedSession {
  date: string           // ISO format YYYY-MM-DD
  dayOfWeek: string
  pairs: ParsedPair[]
  skipped: boolean
  skipReason?: string
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
}

/**
 * Parse the AKBC resultsbm.asp page HTML using cheerio.
 * All resultsbm.asp pages are MP (matchpoints) — team events use teamresults.asp.
 *
 * Row structure:  <TR CLASS=ResultsTableBody>
 *                   <TD>1</TD>        — place
 *                   <TD>590.0</TD>    — raw score
 *                   <TD>64.27%</TD>   — percentage
 *                   <TD><A ...>NAME1 - NAME2 (12)</A></TD>
 *                 </TR>
 */
export function parseResultsPage(html: string): ParsedSession {
  const $ = cheerio.load(html)

  // Extract date from heading — supports (DD-Mon-YY) or (DD-Mon-YYYY)
  const headingText = $('.ResultsTableHead').first().text().trim()
  const dateMatch = headingText.match(/\((\d{1,2})-(\w{3})-(\d{2,4})\)/)
  if (!dateMatch) {
    return { date: '', dayOfWeek: '', pairs: [], skipped: true, skipReason: `No date in heading: "${headingText}"` }
  }

  const [, day, monthStr, yearStr] = dateMatch
  const month = MONTH_MAP[monthStr.toLowerCase()] ?? '01'
  const fullYear = yearStr.length === 4 ? yearStr : (parseInt(yearStr, 10) < 50 ? `20${yearStr}` : `19${yearStr}`)
  const date = `${fullYear}-${month}-${day.padStart(2, '0')}`

  const pairs: ParsedPair[] = []
  const rowClasses = ['ResultsTableBody', 'ResultsTableBodyAlternateLine']

  $('tr').each((_i, row) => {
    const cls = $(row).attr('class') ?? ''
    if (!rowClasses.includes(cls)) return

    const cells = $(row).find('td')
    if (cells.length < 4) return

    // Column 2: percentage
    const pctText = $(cells[2]).text().trim().replace('%', '')
    const rawPct = parseFloat(pctText)
    if (isNaN(rawPct) || rawPct < 0 || rawPct > 100) return
    const percentage = rawPct

    // Column 3: pair name inside <a> tag — "NAME1 - NAME2 (NUM)"
    const anchor = $(cells[3]).find('a')
    const pairText = anchor.text().trim()
    if (!pairText) return

    const href = anchor.attr('href') ?? ''
    const cleanPair = pairText.replace(/\s*\(\d+\)\s*$/, '')
    const dashIdx = cleanPair.indexOf(' - ')
    if (dashIdx === -1) return

    const name1 = toTitleCase(cleanPair.slice(0, dashIdx).trim())
    const name2 = toTitleCase(cleanPair.slice(dashIdx + 3).trim())
    const nzNumbers = extractNzNumbersFromHref(href)

    pairs.push({
      player1Name: name1,
      player2Name: name2,
      percentage,
      player1NzNumber: nzNumbers[0],
      player2NzNumber: nzNumbers[1],
      pairHref: href || undefined
    })
  })

  return { date, dayOfWeek: '', pairs, skipped: false }
}

// -----------------------------------------------------------------------
// nzbridge.co.nz player table parsing
// -----------------------------------------------------------------------

export interface ParsedPlayer {
  nz_bridge_number: number
  name: string
  club: string
  rank: string
  grade: string
  rating: number
  a_points: number
  b_points: number
  c_points: number
}

/**
 * Parse the nzbridge.co.nz online-points page.
 * Table columns: Name | Number | Club | Rank | Stars | Grade | Rating | A Pts | B Pts | C Pts
 * Returns the first matching data row, or null if not found.
 */
export function parsePlayerTable(html: string): ParsedPlayer | null {
  return parsePlayerTableByName(html, null)
}

/**
 * Parse the nzbridge.co.nz online-points page and find a row matching the
 * given name (case-insensitive). If name is null, returns the first data row.
 */
export function parsePlayerTableByName(html: string, name: string | null): ParsedPlayer | null {
  const $ = cheerio.load(html)
  const normTarget = name ? name.toLowerCase().replace(/\s+/g, ' ').trim() : null

  const candidates: ParsedPlayer[] = []

  $('table tr').each((_i, row) => {
    const cells = $(row).find('td')
    if (cells.length < 10) return

    const numberStr = $(cells[1]).text().trim()
    const nz_bridge_number = parseInt(numberStr, 10)
    if (isNaN(nz_bridge_number)) return

    const rowName = $(cells[0]).text().trim()

    // If a target name is given, skip rows that don't match
    if (normTarget && rowName.toLowerCase().replace(/\s+/g, ' ').trim() !== normTarget) return

    const club = $(cells[2]).text().trim()

    candidates.push({
      nz_bridge_number,
      name: rowName || '',
      club,
      rank: $(cells[3]).text().trim(),
      grade: $(cells[5]).text().trim(),
      rating: parseDecimal($(cells[6]).text().trim()),
      a_points: parseDecimal($(cells[7]).text().trim()),
      b_points: parseDecimal($(cells[8]).text().trim()),
      c_points: parseDecimal($(cells[9]).text().trim())
    })
  })

  if (candidates.length === 0) return null

  // When multiple matches, prefer the lowest NZ bridge number
  return candidates.reduce((best, c) => c.nz_bridge_number < best.nz_bridge_number ? c : best)
}

/**
 * Like parsePlayerTableByName but returns ALL non-archive matches (not just the lowest).
 * Used by lookupPlayerCandidates to detect ambiguous results.
 */
export function parseAllPlayerMatches(html: string, name: string): ParsedPlayer[] {
  const $ = cheerio.load(html)
  const normTarget = name.toLowerCase().replace(/\s+/g, ' ').trim()
  const candidates: ParsedPlayer[] = []

  $('table tr').each((_i, row) => {
    const cells = $(row).find('td')
    if (cells.length < 10) return

    const numberStr = $(cells[1]).text().trim()
    const nz_bridge_number = parseInt(numberStr, 10)
    if (isNaN(nz_bridge_number)) return

    const rowName = $(cells[0]).text().trim()
    if (rowName.toLowerCase().replace(/\s+/g, ' ').trim() !== normTarget) return

    candidates.push({
      nz_bridge_number,
      name: rowName || '',
      club: $(cells[2]).text().trim(),
      rank: $(cells[3]).text().trim(),
      grade: $(cells[5]).text().trim(),
      rating: parseDecimal($(cells[6]).text().trim()),
      a_points: parseDecimal($(cells[7]).text().trim()),
      b_points: parseDecimal($(cells[8]).text().trim()),
      c_points: parseDecimal($(cells[9]).text().trim())
    })
  })

  return candidates
}

// -----------------------------------------------------------------------
// Fuzzy name matching (surname exact, first name by progressive prefix)
// -----------------------------------------------------------------------

/**
 * Parse all non-archived rows from an nzbridge.co.nz results page.
 */
function parseAllRows(html: string): ParsedPlayer[] {
  const $ = cheerio.load(html)
  const rows: ParsedPlayer[] = []

  $('table tr').each((_i, row) => {
    const cells = $(row).find('td')
    if (cells.length < 10) return
    const nz_bridge_number = parseInt($(cells[1]).text().trim(), 10)
    if (isNaN(nz_bridge_number)) return
    rows.push({
      nz_bridge_number,
      name: $(cells[0]).text().trim(),
      club: $(cells[2]).text().trim(),
      rank: $(cells[3]).text().trim(),
      grade: $(cells[5]).text().trim(),
      rating: parseDecimal($(cells[6]).text().trim()),
      a_points: parseDecimal($(cells[7]).text().trim()),
      b_points: parseDecimal($(cells[8]).text().trim()),
      c_points: parseDecimal($(cells[9]).text().trim())
    })
  })

  return rows
}

function nameParts(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/)
  return {
    last:  parts[parts.length - 1].toLowerCase(),
    first: parts.slice(0, parts.length - 1).join(' ').toLowerCase()
  }
}

/**
 * Fuzzy first-name match: surname must be exact; first name matched by progressive
 * prefix — i.e. one name must start with the first N characters of the other,
 * where N grows until a unique match is found or names are exhausted.
 *
 * Examples:
 *   "Beverley" vs "Bev"     → match (Bev is prefix of Beverley)
 *   "Will"     vs "William" → match (Will is prefix of William)
 *   "Bob"      vs "Robert"  → no match (neither is prefix of the other)
 */
function fuzzyFirstMatch(a: string, b: string): boolean {
  if (a === b) return true
  const shorter = a.length <= b.length ? a : b
  const longer  = a.length <= b.length ? b : a
  return shorter.length >= 1 && longer.startsWith(shorter)
}

/**
 * Search html for players whose surname exactly matches the target and whose
 * first name fuzzy-matches (prefix), using progressive prefix narrowing to
 * disambiguate multiple same-surname candidates.
 *
 * Returns the single best match, or null if none or ambiguous.
 */
export function parsePlayerTableFuzzy(html: string, name: string): ParsedPlayer | null {
  const all = parseAllRows(html)
  const target = nameParts(name)
  if (!target.last) return null

  // Must share exact surname
  const bySurname = all.filter(r => nameParts(r.name).last === target.last)
  if (bySurname.length === 0) return null

  // Only one person with this surname — require at least first-letter match
  if (bySurname.length === 1) {
    const nzFirst = nameParts(bySurname[0].name).first
    return fuzzyFirstMatch(target.first.slice(0, 1), nzFirst.slice(0, 1)) ? bySurname[0] : null
  }

  // Multiple — narrow progressively by first-name prefix
  const targetFirst = target.first
  let remaining = bySurname
  for (let len = 1; len <= targetFirst.length; len++) {
    const prefix = targetFirst.slice(0, len)
    const narrowed = remaining.filter(r => {
      const nzFirst = nameParts(r.name).first
      return fuzzyFirstMatch(prefix, nzFirst.slice(0, len))
    })
    if (narrowed.length === 1) return narrowed[0]
    if (narrowed.length === 0) break
    remaining = narrowed
  }

  return null // ambiguous or no match
}

/**
 * Like parsePlayerTableFuzzy but returns ALL fuzzy surname+first-name-prefix
 * matches. Used by lookupPlayerCandidates.
 */
export function parseAllPlayerMatchesFuzzy(html: string, name: string): ParsedPlayer[] {
  const all = parseAllRows(html)
  const target = nameParts(name)
  if (!target.last) return []

  const bySurname = all.filter(r => nameParts(r.name).last === target.last)
  if (bySurname.length === 0) return []

  // Filter to first-letter match at minimum
  return bySurname.filter(r => {
    const nzFirst = nameParts(r.name).first
    return fuzzyFirstMatch(target.first.slice(0, 1), nzFirst.slice(0, 1))
  })
}

function parseDecimal(val: string): number {
  const n = parseFloat(val)
  return isNaN(n) ? 0 : n
}

// -----------------------------------------------------------------------
// nzbridge.co.nz player results history (?mpsr=1&mp_user=NNN)
// -----------------------------------------------------------------------

export interface ParsedPlayerResult {
  date: string        // ISO YYYY-MM-DD
  club: string
  eventName: string
  place: string       // may include "=" e.g. "3="
  scoreValue: number
  scoreType: 'PCT' | 'VP' | ''
  aPoints: number | null
  bPoints: number | null
  cPoints: number | null
  tournament: string        // masterpoint code e.g. '10A'; '' if none
  type: string | null       // 'Final' | 'Session' | null
  sessionNumber: number | null
  restricted: string        // 'restricted' | 'open' | ''
  eventType: string         // 'pairs' | 'teams' | 'swiss_pairs' | 'swiss_teams' | ''
  category: string          // 'Provincial' | 'Championship' | 'Junior' | 'Intermediate' | 'Open' | ''
}

function parseDMY(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/)
  if (!m) return ''
  const month = MONTH_MAP[m[2].toLowerCase()] ?? '01'
  return `${m[3]}-${month}-${m[1].padStart(2, '0')}`
}

function parseNullablePoints(val: string): number | null {
  const s = val.trim()
  if (!s) return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function parseScore(val: string): { scoreValue: number; scoreType: 'PCT' | 'VP' | '' } {
  const s = val.trim()
  if (s.endsWith('PCT')) return { scoreValue: parseFloat(s) || 0, scoreType: 'PCT' }
  if (s.endsWith('VP'))  return { scoreValue: parseFloat(s) || 0, scoreType: 'VP' }
  return { scoreValue: parseFloat(s) || 0, scoreType: '' }
}

function parseEventFields(name: string) {
  const tournamentMatch = name.match(/(\d+[ABC])/)
  const tournament = tournamentMatch ? tournamentMatch[1] : ''

  let type: string | null = null
  let sessionNumber: number | null = null
  if (/\(Final\)/.test(name)) {
    type = 'Final'
  } else {
    const m = name.match(/\(Session (\d{1,2})\)/)
    if (m) { type = 'Session'; sessionNumber = parseInt(m[1], 10) }
  }

  const restricted = /restricted/i.test(name) ? 'restricted' : /\bopen\b/i.test(name) ? 'open' : ''

  const hasSwiss = /swiss/i.test(name)
  const hasPairs = /\bpairs\b/i.test(name)
  const hasTeams = /\bteams\b/i.test(name)
  const eventType = hasSwiss && hasPairs ? 'swiss_pairs'
    : hasSwiss && hasTeams ? 'swiss_teams'
    : hasPairs ? 'pairs'
    : hasTeams ? 'teams'
    : ''

  const category = /provincial/i.test(name) ? 'Provincial'
    : /championship/i.test(name) ? 'Championship'
    : /junior/i.test(name) ? 'Junior'
    : /intermediate/i.test(name) ? 'Intermediate'
    : /\bopen\b/i.test(name) ? 'Open'
    : ''

  return { tournament, type, sessionNumber, restricted, eventType, category }
}

/**
 * Parse the nzbridge.co.nz player results history page (?mpsr=1&mp_user=NNN).
 * Rows have columns: date | club | event name | place | score | A-pts | B-pts | C-pts
 */
export function parsePlayerResultsHistory(html: string): ParsedPlayerResult[] {
  const $ = cheerio.load(html)
  const results: ParsedPlayerResult[] = []

  $('table tr').each((_i, row) => {
    const cells = $(row).find('td')
    if (cells.length < 5) return

    const dateText = $(cells[0]).text().trim()
    const date = parseDMY(dateText)
    if (!date) return  // skip header rows and non-data rows

    const club      = $(cells[1]).text().trim()
    const eventName = $(cells[2]).text().trim()
    const place     = $(cells[3]).text().trim()
    const { scoreValue, scoreType } = parseScore($(cells[4]).text())
    const aPoints   = cells.length > 5 ? parseNullablePoints($(cells[5]).text()) : null
    const bPoints   = cells.length > 6 ? parseNullablePoints($(cells[6]).text()) : null
    const cPoints   = cells.length > 7 ? parseNullablePoints($(cells[7]).text()) : null

    if (!eventName) return
    const { tournament, type, sessionNumber, restricted, eventType, category } = parseEventFields(eventName)
    results.push({ date, club, eventName, place, scoreValue, scoreType, aPoints, bPoints, cPoints, tournament, type, sessionNumber, restricted, eventType, category })
  })

  return results
}

/**
 * Extract up to two NZ bridge numbers from an href query string.
 * NZ bridge numbers are 1–5 digit integers.
 * Returns [nz1, nz2] — either may be undefined if not found.
 */
function extractNzNumbersFromHref(href: string): [number | undefined, number | undefined] {
  if (!href) return [undefined, undefined]
  try {
    const qs = href.includes('?') ? href.slice(href.indexOf('?') + 1) : href
    const nums = new URLSearchParams(qs)
    const candidates: number[] = []
    for (const val of nums.values()) {
      const n = parseInt(val, 10)
      if (!isNaN(n) && n > 0 && n <= 99999) candidates.push(n)
    }
    return [candidates[0], candidates[1]]
  } catch {
    return [undefined, undefined]
  }
}
