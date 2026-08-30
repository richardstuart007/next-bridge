import * as cheerio from 'cheerio'

// -----------------------------------------------------------------------
// Name normalisation
// -----------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  toTitleCase — converts an ALL CAPS name to Title Case, handling NZ/Irish name
//  prefixes (Mc, Mac, O')
//----------------------------------------------------------------------------------
export function toTitleCase(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map(capitaliseWord)
    .join(' ')
}

//----------------------------------------------------------------------------------
//  capitaliseWord — capitalises a single lowercase word, recursing past an
//  O'/Mc/Mac prefix so the letter after the prefix is capitalised too
//----------------------------------------------------------------------------------
function capitaliseWord(word: string): string {
  if (!word) return word
  if (/^o'/.test(word)) return "O'" + capitaliseWord(word.slice(2))
  if (word.startsWith('mc') && word.length > 2) return 'Mc' + capitaliseWord(word.slice(2))
  if (word.startsWith('mac') && word.length > 3) return 'Mac' + capitaliseWord(word.slice(3))
  return word.charAt(0).toUpperCase() + word.slice(1)
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
}

// -----------------------------------------------------------------------
// nzbridge.co.nz player table parsing
// -----------------------------------------------------------------------

export interface ParsedPlayer {
  nzb: number
  name: string
  club: string
  rank: string
  grade: string
  rating: number
  a_points: number
  b_points: number
  c_points: number
}

//----------------------------------------------------------------------------------
//  parsePlayerTable — parses the nzbridge.co.nz online-points page (columns: Name |
//  Number | Club | Rank | Stars | Grade | Rating | A Pts | B Pts | C Pts) and
//  returns the first matching data row, or null if none
//----------------------------------------------------------------------------------
export function parsePlayerTable(html: string): ParsedPlayer | null {
  return parsePlayerTableByName(html, null)
}

//----------------------------------------------------------------------------------
//  parsePlayerTableByName — parses the online-points page and returns the row
//  matching name (case-insensitive), preferring the lowest NZ bridge number on a
//  tie; returns the first data row when name is null, or null when none match
//----------------------------------------------------------------------------------
export function parsePlayerTableByName(html: string, name: string | null): ParsedPlayer | null {
  const $ = cheerio.load(html)
  const normTarget = name ? name.toLowerCase().replace(/\s+/g, ' ').trim() : null

  const candidates: ParsedPlayer[] = []

  $('table tr').each((_i, row) => {
    const cells = $(row).find('td')
    if (cells.length < 10) return

    const numberStr = $(cells[1]).text().trim()
    const nzb = parseInt(numberStr, 10)
    if (isNaN(nzb)) return

    const rowName = $(cells[0]).text().trim()

    // If a target name is given, skip rows that don't match
    if (normTarget && rowName.toLowerCase().replace(/\s+/g, ' ').trim() !== normTarget) return

    candidates.push({
      nzb,
      name: rowName || '',
      club: normaliseClub($(cells[2]).text().trim()),
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
  return candidates.reduce((best, c) => c.nzb < best.nzb ? c : best)
}

//----------------------------------------------------------------------------------
//  parseAllPlayerMatches — like parsePlayerTableByName but returns every
//  non-archive row matching name (not just the lowest NZ#); used by
//  lookupPlayerCandidates to detect ambiguous results
//----------------------------------------------------------------------------------
export function parseAllPlayerMatches(html: string, name: string): ParsedPlayer[] {
  const $ = cheerio.load(html)
  const normTarget = name.toLowerCase().replace(/\s+/g, ' ').trim()
  const candidates: ParsedPlayer[] = []

  $('table tr').each((_i, row) => {
    const cells = $(row).find('td')
    if (cells.length < 10) return

    const numberStr = $(cells[1]).text().trim()
    const nzb = parseInt(numberStr, 10)
    if (isNaN(nzb)) return

    const rowName = $(cells[0]).text().trim()
    if (rowName.toLowerCase().replace(/\s+/g, ' ').trim() !== normTarget) return

    candidates.push({
      nzb,
      name: rowName || '',
      club: normaliseClub($(cells[2]).text().trim()),
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

//----------------------------------------------------------------------------------
//  parseAllRows — parses every non-archived data row from an nzbridge.co.nz
//  results page into ParsedPlayer records
//----------------------------------------------------------------------------------
function parseAllRows(html: string): ParsedPlayer[] {
  const $ = cheerio.load(html)
  const rows: ParsedPlayer[] = []

  $('table tr').each((_i, row) => {
    const cells = $(row).find('td')
    if (cells.length < 10) return
    const nzb = parseInt($(cells[1]).text().trim(), 10)
    if (isNaN(nzb)) return
    rows.push({
      nzb,
      name: $(cells[0]).text().trim(),
      club: normaliseClub($(cells[2]).text().trim()),
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

//----------------------------------------------------------------------------------
//  nameParts — splits a full name into { first, last } (both lowercased); the
//  last whitespace-separated token is the surname, everything before it the first
//----------------------------------------------------------------------------------
function nameParts(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/)
  return {
    last:  parts[parts.length - 1].toLowerCase(),
    first: parts.slice(0, parts.length - 1).join(' ').toLowerCase()
  }
}

//----------------------------------------------------------------------------------
//  fuzzyFirstMatch — true when a and b are equal or the shorter is a prefix of the
//  longer (e.g. "Bev"/"Beverley" match; "Bob"/"Robert" do not)
//----------------------------------------------------------------------------------
function fuzzyFirstMatch(a: string, b: string): boolean {
  if (a === b) return true
  const shorter = a.length <= b.length ? a : b
  const longer  = a.length <= b.length ? b : a
  return shorter.length >= 1 && longer.startsWith(shorter)
}

//----------------------------------------------------------------------------------
//  parsePlayerTableFuzzy — finds the player whose surname exactly matches name and
//  whose first name fuzzy-matches by progressive prefix narrowing; returns the
//  single best match, or null when none match or it stays ambiguous
//----------------------------------------------------------------------------------
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

//----------------------------------------------------------------------------------
//  parseAllPlayerMatchesFuzzy — like parsePlayerTableFuzzy but returns every row
//  with an exact surname and at least a first-letter first-name match; used by
//  lookupPlayerCandidates
//----------------------------------------------------------------------------------
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

//----------------------------------------------------------------------------------
//  parseDecimal — parseFloat that returns 0 instead of NaN for a blank/unparseable
//  value
//----------------------------------------------------------------------------------
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
  runId: number             // NZbridge run_id from results.html?run_id=X; 0 if not found
  url: string               // full session URL; '' if not found
}

//----------------------------------------------------------------------------------
//  parseDMY — converts a "D MMM YY(YY)" date string to ISO YYYY-MM-DD; returns ''
//  when the string doesn't match that shape. 2-digit years < 50 are 20xx, else 19xx
//----------------------------------------------------------------------------------
function parseDMY(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{1,2})\s+(\w{3})\s+(\d{2,4})$/)
  if (!m) return ''
  const month = MONTH_MAP[m[2].toLowerCase()] ?? '01'
  const yearStr = m[3]
  const fullYear = yearStr.length === 4 ? yearStr : (parseInt(yearStr, 10) < 50 ? `20${yearStr}` : `19${yearStr}`)
  return `${fullYear}-${month}-${m[1].padStart(2, '0')}`
}

//----------------------------------------------------------------------------------
//  parseNullablePoints — parseFloat that returns null for a blank/unparseable
//  value (masterpoint columns that may legitimately be empty)
//----------------------------------------------------------------------------------
function parseNullablePoints(val: string): number | null {
  const s = val.trim()
  if (!s) return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

//----------------------------------------------------------------------------------
//  parseScore — splits a score cell into its numeric value and type, reading a
//  trailing "PCT" or "VP" suffix; scoreType is '' when neither suffix is present
//----------------------------------------------------------------------------------
function parseScore(val: string): { scoreValue: number; scoreType: 'PCT' | 'VP' | '' } {
  const s = val.trim()
  if (s.endsWith('PCT')) return { scoreValue: parseFloat(s) || 0, scoreType: 'PCT' }
  if (s.endsWith('VP'))  return { scoreValue: parseFloat(s) || 0, scoreType: 'VP' }
  return { scoreValue: parseFloat(s) || 0, scoreType: '' }
}

//----------------------------------------------------------------------------------
//  parseEventFields — pulls structured fields out of a free-text event name:
//  tournament masterpoint code, Final/Session type + session number, restricted/
//  open, event type (pairs/teams/swiss_*), and category (Provincial/…/Open)
//----------------------------------------------------------------------------------
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

//----------------------------------------------------------------------------------
//  parsePlayerResultsHistory — parses the player results-history page
//  (?mpsr=1&mp_user=NNN); rows are date | club | event | place | score | A/B/C
//  pts, and the event cell's link supplies the session run_id + URL when present
//----------------------------------------------------------------------------------
export function parsePlayerResultsHistory(html: string): ParsedPlayerResult[] {
  const $ = cheerio.load(html)
  const results: ParsedPlayerResult[] = []

  $('table tr').each((_i, row) => {
    const cells = $(row).find('td')
    if (cells.length < 5) return

    const dateText = $(cells[0]).text().trim()
    const date = parseDMY(dateText)
    if (!date) return  // skip header rows and non-data rows

    const club       = $(cells[1]).text().trim()
    const eventCell  = $(cells[2])
    const eventName  = eventCell.text().trim()
    const eventHref  = eventCell.find('a').attr('href') ?? ''
    const runId      = extractRunIdFromHref(eventHref)
    const url        = runId > 0 ? `https://www.nzbridge.co.nz/results.html?run_id=${runId}` : ''
    const place      = $(cells[3]).text().trim()
    const { scoreValue, scoreType } = parseScore($(cells[4]).text())
    const aPoints    = cells.length > 5 ? parseNullablePoints($(cells[5]).text()) : null
    const bPoints    = cells.length > 6 ? parseNullablePoints($(cells[6]).text()) : null
    const cPoints    = cells.length > 7 ? parseNullablePoints($(cells[7]).text()) : null

    if (!eventName) return
    const { tournament, type, sessionNumber, restricted, eventType, category } = parseEventFields(eventName)
    results.push({ date, club, eventName, place, scoreValue, scoreType, aPoints, bPoints, cPoints, tournament, type, sessionNumber, restricted, eventType, category, runId, url })
  })

  return results
}

//----------------------------------------------------------------------------------
//  extractRunIdFromHref — reads the run_id query param out of an href; returns 0
//  when absent or unparseable
//----------------------------------------------------------------------------------
function extractRunIdFromHref(href: string): number {
  if (!href) return 0
  try {
    const qs = href.includes('?') ? href.slice(href.indexOf('?') + 1) : href
    const n = parseInt(new URLSearchParams(qs).get('run_id') ?? '', 10)
    return isNaN(n) ? 0 : n
  } catch {
    return 0
  }
}

// -----------------------------------------------------------------------
// Club name normalisation
// -----------------------------------------------------------------------

const CLUB_TRANSLATIONS: Record<string, string> = {
  '2020 Waiheke Bridge Club': 'Waiheke',
}

//----------------------------------------------------------------------------------
//  normaliseClub — trims a raw club name and maps it through CLUB_TRANSLATIONS
//  (e.g. "2020 Waiheke Bridge Club" → "Waiheke"), passing anything else through
//----------------------------------------------------------------------------------
export function normaliseClub(raw: string): string {
  const trimmed = raw.trim()
  return CLUB_TRANSLATIONS[trimmed] ?? trimmed
}

// -----------------------------------------------------------------------
// NZbridge session results page (results.html?run_id=X)
// -----------------------------------------------------------------------

export interface ParsedSessionPair {
  date: string          // ISO YYYY-MM-DD
  club: string          // normalised
  eventName: string
  sessionNum: number
  place: string         // e.g. '1', '9='
  names: string[]       // player names (2 for pairs, 4 for teams)
  mptsCode: string      // e.g. '8B'
  score: number         // e.g. 60.19 or 16.55
  scoreType: 'PCT' | 'VP' | ''
}

//----------------------------------------------------------------------------------
//  parseNzSessionPage — parses a session results page (results.html?run_id=X);
//  columns are date | club | event | session | place | players | mpts | score |
//  A/B/C, players comma-separated (2 for pairs, 4 for teams); skips rows with < 2
//----------------------------------------------------------------------------------
export function parseNzSessionPage(html: string): ParsedSessionPair[] {
  const $ = cheerio.load(html)
  const pairs: ParsedSessionPair[] = []

  $('table tr').each((_i, row) => {
    const cells = $(row).find('td')
    if (cells.length < 8) return

    const dateText = $(cells[0]).text().trim()
    const date = parseDMY(dateText)
    if (!date) return

    const club       = normaliseClub($(cells[1]).text().trim())
    const eventName  = $(cells[2]).text().trim()
    const sessionNum = parseInt($(cells[3]).text().trim(), 10) || 1
    const place      = $(cells[4]).text().trim()

    const names = $(cells[5]).text().trim().split(',').map(n => toTitleCase(n.trim())).filter(Boolean)
    if (names.length < 2) return

    const mptsCode = $(cells[6]).text().trim()
    const { scoreValue: score, scoreType } = parseScore($(cells[7]).text())

    pairs.push({ date, club, eventName, sessionNum, place, names, mptsCode, score, scoreType })
  })

  return pairs
}

