import * as cheerio from 'cheerio'
import { parseAkbcDate, parseLabelDay } from './akbc'

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

// ── ts1_main ─────────────────────────────────────────────────────────────────

export interface RawTs1Row {
  year: number
  date: string        // ISO date or ''
  eventName: string
  eventId: number | null
  type: 'headevent' | 'teamresults' | 'resultsbm' | null
  url: string | null
}

export async function scrapeYearPage(year: number): Promise<RawTs1Row[]> {
  const html = await fetchHtml(`${AKBC_BASE}/resultslistbm.asp?year=${year}`)
  const $ = cheerio.load(html)
  const rows: RawTs1Row[] = []
  const seenIds = new Set<number>()

  $('tr').each((_i, tr) => {
    const cells = $(tr).find('td')
    if (cells.length < 2) return

    const rawDate = $(cells[0]).text().trim()
    if (!rawDate.match(/\d{1,2}-[A-Za-z]{3}-\d{2,4}/)) return

    const date = parseAkbcDate(rawDate)

    let eventId: number | null = null
    let type: RawTs1Row['type'] = null
    let eventName = ''
    let url: string | null = null

    $(tr).find('a').each((_j, a) => {
      const href = $(a).attr('href') ?? ''
      const txt = $(a).text().replace(/\s+/g, ' ').trim()
      const absHref = href.startsWith('http') ? href : href ? `${AKBC_BASE}/${href.replace(/^\//, '')}` : null

      if (href.includes('headeventid=') && !eventId) {
        const m = href.match(/headeventid=(\d+)/)
        if (m) { eventId = parseInt(m[1]); type = 'headevent'; url = absHref; if (txt && txt !== 'Results') eventName = txt }
      } else if (href.includes('teamresults.asp') && !href.includes('showteam') && !eventId) {
        const m = href.match(/[?&]id=(\d+)/)
        if (m) { eventId = parseInt(m[1]); type = 'teamresults'; url = absHref; if (txt && txt !== 'Results') eventName = txt }
      } else if (href.includes('resultsbm.asp') && !href.includes('multisession') && !eventId) {
        const m = href.match(/[?&]id=(\d+)/)
        if (m) { eventId = parseInt(m[1]); type = 'resultsbm'; url = absHref; if (txt && txt !== 'Results') eventName = txt }
      }
    })

    if (!eventName) eventName = $(cells[1]).text().replace(/\s+/g, ' ').trim()
    if (!eventName) return
    if (eventId !== null && seenIds.has(eventId)) return
    if (eventId !== null) seenIds.add(eventId)

    rows.push({ year, date, eventName, eventId, type, url })
  })

  return rows
}

// ── ts5_session_header ────────────────────────────────────────────────────────

export interface RawTs5Row {
  eventId: number
  date: string        // ISO date or ''
  sessionName: string
  sourceId: number | null
  type: 'resultsbm' | 'multisession' | null
  url: string | null
}

export async function scrapeEventPage(eventId: number): Promise<RawTs5Row[]> {
  const html = await fetchHtml(`${AKBC_BASE}/resultslistbm.asp?headeventid=${eventId}`)
  const $ = cheerio.load(html)
  const rows: RawTs5Row[] = []
  const seenIds = new Set<number>()

  $('tr').each((_i, tr) => {
    const cells = $(tr).find('td')
    if (cells.length < 2) return

    const rawDate = $(cells[0]).text().trim()
    if (!rawDate.match(/\d{1,2}-[A-Za-z]{3}-\d{2,4}/)) return
    const date = parseAkbcDate(rawDate)
    const sessionName = $(cells[1]).text().replace(/\s+/g, ' ').trim()
    if (!sessionName) return

    // Find Results link (first link to resultsbm or multisession)
    let sourceId: number | null = null
    let type: RawTs5Row['type'] = null
    let url: string | null = null

    $(tr).find('a').each((_j, a) => {
      const href = $(a).attr('href') ?? ''
      const txt = $(a).text().trim()
      if (txt !== 'Results' && txt !== 'results') return

      if (href.includes('resultsbmmultisession')) {
        const m = href.match(/[?&]id=(\d+)/)
        if (m && !sourceId) {
          sourceId = parseInt(m[1])
          type = 'multisession'
          url = href.startsWith('http') ? href : `${AKBC_BASE}/${href.replace(/^\//, '')}`
        }
      } else if (href.includes('resultsbm.asp')) {
        const m = href.match(/[?&]id=(\d+)/)
        if (m && !sourceId) {
          sourceId = parseInt(m[1])
          type = 'resultsbm'
          url = href.startsWith('http') ? href : `${AKBC_BASE}/${href.replace(/^\//, '')}`
        }
      }
    })

    if (sourceId !== null && seenIds.has(sourceId)) return
    if (sourceId !== null) seenIds.add(sourceId)

    rows.push({ eventId, date, sessionName, sourceId, type, url })
  })

  return rows
}

// ── ts2_team_matchdata ────────────────────────────────────────────────────────

export interface RawTs2Row {
  eventId: number
  url: string
  place: number
  teamNum: number
  vp: number[]
}

export async function scrapeTeamMatchData(eventId: number): Promise<RawTs2Row[]> {
  const url = `${AKBC_BASE}/teamresults.asp?id=${eventId}&iswide=y&matchdata=v`
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)
  const rows: RawTs2Row[] = []

  // Find header row to locate match columns (M1, M2, ...)
  let matchColIndices: number[] = []
  $('tr').each((_i, tr) => {
    if (matchColIndices.length > 0) return
    const cells = $(tr).find('th, td')
    const headers: string[] = []
    cells.each((_j, c) => { headers.push($(c).text().trim().toUpperCase()) })
    const mCols = headers.map((h, idx) => ({ h, idx })).filter(x => /^M\d+$/.test(x.h))
    if (mCols.length > 0) matchColIndices = mCols.map(x => x.idx)
  })

  const ROW_CLASSES = ['ResultsTableBody', 'ResultsTableBodyAlternateLine']

  $('tr').each((_i, tr) => {
    const cls = $(tr).attr('class') ?? ''
    if (!ROW_CLASSES.includes(cls)) return

    const cells = $(tr).find('td')
    if (cells.length < 3) return

    const placeText = $(cells[0]).text().trim()
    const place = parseInt(placeText) || 0

    // Team cell: "ITCH (3)" or "ITCH(3)"
    const teamCell = $(cells[2]).text().trim()
    const teamNumMatch = teamCell.match(/\((\d+)\)/)
    if (!teamNumMatch) return
    const teamNum = parseInt(teamNumMatch[1])

    // Extract VP values from match columns
    const vp: number[] = []
    if (matchColIndices.length > 0) {
      for (const idx of matchColIndices) {
        const cell = cells[idx]
        if (!cell) break
        const val = parseFloat($(cell).text().trim())
        if (isNaN(val)) break
        vp.push(val)
      }
    } else {
      // Fallback: columns 3..N-3 are match columns (skip Place, Cat, Team at start; Imps, VPs, W-D-L, Masterpoints at end)
      const skip = 3
      const tail = 4
      for (let j = skip; j < cells.length - tail; j++) {
        const val = parseFloat($(cells[j]).text().trim())
        if (!isNaN(val) && val >= 0 && val <= 20) vp.push(val)
        else break
      }
    }

    if (vp.length > 0) rows.push({ eventId, url, place, teamNum, vp })
  })

  return rows
}

// ── ts3_team_members ──────────────────────────────────────────────────────────

export interface RawTs3Row {
  eventId: number
  url: string
  teamNum: number
  teamName: string
  playerNames: string[]
}

export async function scrapeTeamMembers(eventId: number): Promise<RawTs3Row[]> {
  const url = `${AKBC_BASE}/teammemberlist.asp?id=${eventId}`
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)
  const rows: RawTs3Row[] = []

  const ROW_CLASSES = ['ResultsTableBody', 'ResultsTableBodyAlternateLine']

  $('tr').each((_i, tr) => {
    const cls = $(tr).attr('class') ?? ''
    if (!ROW_CLASSES.includes(cls)) return

    const cells = $(tr).find('td')
    if (cells.length < 3) return

    const teamNum = parseInt($(cells[0]).text().trim())
    if (isNaN(teamNum)) return

    const teamName = $(cells[1]).text().replace(/\s+/g, ' ').trim()
    const membersRaw = $(cells[2]).text().replace(/\s+/g, ' ').trim()
    const playerNames = membersRaw.split(' - ').map(p => p.trim()).filter(Boolean)

    rows.push({ eventId, url, teamNum, teamName, playerNames })
  })

  return rows
}

// ── ts4_team_rounds ───────────────────────────────────────────────────────────

export interface RawTs4Row {
  eventId: number
  url: string
  teamNum: number
  opponentNums: number[]
  vps: number[]
}

export async function scrapeTeamRounds(eventId: number, teamNum: number): Promise<RawTs4Row> {
  const url = `${AKBC_BASE}/teamdetailedresults.asp?id=${eventId}&team=${teamNum}`
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)
  const opponentNums: number[] = []
  const vps: number[] = []

  const ROW_CLASSES = ['ResultsTableBody', 'ResultsTableBodyAlternateLine']

  $('tr').each((_i, tr) => {
    const cls = $(tr).attr('class') ?? ''
    if (!ROW_CLASSES.includes(cls)) return

    const cells = $(tr).find('td')
    // Columns: (blank) | Match | Opponent | Imps | VPs | Cum. Rank
    if (cells.length < 5) return

    // Skip totals row
    const opponentText = $(cells[2]).text().trim()
    if (!opponentText || opponentText.toLowerCase() === 'totals') return

    const vpsVal = parseFloat($(cells[4]).text().trim())
    if (isNaN(vpsVal)) return

    const opponentMatch = opponentText.match(/\((\d+)\)/)
    opponentNums.push(opponentMatch ? parseInt(opponentMatch[1]) : 0)
    vps.push(vpsVal)
  })

  return { eventId, url, teamNum, opponentNums, vps }
}

// ── ts6_session ───────────────────────────────────────────────────────────────

export interface RawTs6Row {
  eventId: number
  sourceId: number
  url: string
  title: string
  direction: string | null
  place: number
  percentage: number
  pairNames: string
  pairNum: number
}

export async function scrapeSession(sourceId: number, eventId: number): Promise<RawTs6Row[]> {
  const url = `${AKBC_BASE}/resultsbm.asp?id=${sourceId}&umbid=0`
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)
  const rows: RawTs6Row[] = []

  const title = $('h1, h2, h3, .ResultsTitle, td.ResultsTitle').first().text().replace(/\s+/g, ' ').trim()

  const ROW_CLASSES = ['ResultsTableBody', 'ResultsTableBodyAlternateLine']
  let currentDirection: string | null = null

  $('tr').each((_i, tr) => {
    // Check for direction header rows (North-South / East-West)
    const rowText = $(tr).text().replace(/\s+/g, ' ').trim()
    if (/^north.?south$/i.test(rowText)) { currentDirection = 'NS'; return }
    if (/^east.?west$/i.test(rowText)) { currentDirection = 'EW'; return }

    const cls = $(tr).attr('class') ?? ''
    if (!ROW_CLASSES.includes(cls)) return

    const cells = $(tr).find('td')
    // Columns: Place | Result | % | Pair Name
    if (cells.length < 4) return

    const place = parseInt($(cells[0]).text().trim()) || 0
    const pctText = $(cells[2]).text().trim().replace('%', '')
    const percentage = parseFloat(pctText)
    if (isNaN(percentage)) return

    const pairCell = $(cells[3]).text().replace(/\s+/g, ' ').trim()
    // Extract pair number from brackets: "SCOTT - MCMILLAN (8)"
    const pairNumMatch = pairCell.match(/\((\d+)\)\s*$/)
    const pairNum = pairNumMatch ? parseInt(pairNumMatch[1]) : 0
    const pairNames = pairCell.replace(/\s*\(\d+\)\s*$/, '').trim()
    if (!pairNames) return

    rows.push({ eventId, sourceId, url, title, direction: currentDirection, place, percentage, pairNames, pairNum })
  })

  return rows
}

