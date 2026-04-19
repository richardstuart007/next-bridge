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
  rank?: number              // position in session (1 = best); IMP only
  impScore?: number          // net IMP score (e.g. +50.0, -23.5); IMP only
  player1NzNumber?: number   // extracted from href if present
  player2NzNumber?: number   // extracted from href if present
  pairHref?: string          // raw href for debugging
}

export interface ParsedSession {
  date: string           // ISO format YYYY-MM-DD
  dayOfWeek: string
  pairs: ParsedPair[]
  skipped: boolean
  skipReason?: string
  isImp?: boolean        // true when IMP/Teams session detected (pairs have rank, not percentage)
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
}

/**
 * Parse the AKBC resultsbm.asp page HTML using cheerio.
 *
 * MP row structure:  <TR CLASS=ResultsTableBody>
 *                      <TD>1</TD>           — place
 *                      <TD>590.0</TD>       — raw score
 *                      <TD>  64.27%</TD>    — percentage
 *                      <TD><A ...>NAME1 - NAME2 (12)</A></TD>
 *                    </TR>
 *
 * IMP row structure: same column layout but column 2 may not be a %-comparable value.
 * For IMP sessions we extract rank (column 0) and names (column 3); percentage is
 * computed later via quantile normalisation against the MP distribution.
 */
export function parseResultsPage(html: string): ParsedSession {
  const $ = cheerio.load(html)

  const isImp = /teams|imp/i.test($('body').text().slice(0, 1000))

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

  // Parse result rows
  const pairs: ParsedPair[] = []
  const rowClasses = ['ResultsTableBody', 'ResultsTableBodyAlternateLine']

  $('tr').each((_i, row) => {
    const cls = $(row).attr('class') ?? ''
    if (!rowClasses.includes(cls)) return

    const cells = $(row).find('td')
    if (cells.length < 4) return

    // Column 0: rank/place (1 = best)
    const rankVal = parseInt($(cells[0]).text().trim(), 10)
    const rank = isNaN(rankVal) ? undefined : rankVal

    // Column 1: raw score — for IMP this is the net IMP score (e.g. 50.0, -23.5)
    const rawScoreText = $(cells[1]).text().trim()
    const impScore = isImp ? parseFloat(rawScoreText) : undefined

    // Column 2: percentage — used for MP sessions only
    const pctText = $(cells[2]).text().trim().replace('%', '')
    const rawPct = parseFloat(pctText)
    const percentage = (!isImp && !isNaN(rawPct) && rawPct >= 0 && rawPct <= 100) ? rawPct : 0

    // For MP sessions, skip rows without a valid percentage
    if (!isImp && percentage === 0 && isNaN(rawPct)) return

    // For IMP sessions, skip rows where we couldn't parse the IMP score
    if (isImp && (impScore === undefined || isNaN(impScore))) return

    // Column 3: pair name inside <a> tag — "NAME1 - NAME2 (NUM)"
    const anchor = $(cells[3]).find('a')
    const pairText = anchor.text().trim()
    if (!pairText) return

    // Capture href for NZ number extraction
    const href = anchor.attr('href') ?? ''

    // Strip trailing "(PAIR_NUMBER)"
    const cleanPair = pairText.replace(/\s*\(\d+\)\s*$/, '')

    // Split on " - " to get two names
    const dashIdx = cleanPair.indexOf(' - ')
    if (dashIdx === -1) return

    const name1 = toTitleCase(cleanPair.slice(0, dashIdx).trim())
    const name2 = toTitleCase(cleanPair.slice(dashIdx + 3).trim())

    // Try to extract NZ bridge numbers from href query params
    // e.g. href="playerresults.asp?id1=12345&id2=67890" or "?nz1=12345&nz2=67890"
    const nzNumbers = extractNzNumbersFromHref(href)

    pairs.push({
      player1Name: name1,
      player2Name: name2,
      percentage,
      rank,
      impScore,
      player1NzNumber: nzNumbers[0],
      player2NzNumber: nzNumbers[1],
      pairHref: href || undefined
    })
  })

  return { date, dayOfWeek: '', pairs, skipped: false, isImp }
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
