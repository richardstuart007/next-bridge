import { NextRequest } from 'next/server'
import * as cheerio from 'cheerio'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

const NZB_BASE = 'https://www.nzbridge.co.nz'

const MONTH: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
}

function parseDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s+(\w{3})\s+(\d{2,4})$/)
  if (!m) return null
  const month = MONTH[m[2]]
  if (!month) return null
  const year = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${year}-${month}-${m[1].padStart(2, '0')}`
}

function parseScore(raw: string): { value: number; type: 'PCT' | 'VP' } | null {
  const m = raw.trim().match(/^([\d.]+)\s*(PCT|VP)$/i)
  if (!m) return null
  return { value: parseFloat(m[1]), type: m[2].toUpperCase() as 'PCT' | 'VP' }
}

function normaliseScore(value: number, type: 'PCT' | 'VP', isSummary = false): number {
  if (isSummary) return value
  if (type === 'PCT' && (value < 25 || value > 75)) return 50
  if (type === 'VP' && value > 20) return 10
  return value
}

function extractRunIds(html: string): number[] {
  const $ = cheerio.load(html)
  const runIds = new Set<number>()
  $('a[href*="run_id="]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    const m = href.match(/run_id=(\d+)/)
    if (m) runIds.add(parseInt(m[1], 10))
  })
  return [...runIds]
}

interface ParsedRow {
  run_id: number
  event_name: string
  date: string | null
  club: string
  place: string
  player_names: string[]
  score_value: number
  score_type: 'PCT' | 'VP'
  tournament: string
}

function parsePage(html: string): Map<number, ParsedRow[]> {
  const $ = cheerio.load(html)
  const rowsByRunId = new Map<number, ParsedRow[]>()

  $('table').each((_, table) => {
    const headerRow = $(table).find('tr').first()
    const headerCells = headerRow.find('th, td').toArray().map(th => $(th).text().trim().toLowerCase())

    if (!headerCells.some(h => h.includes('event')) || !headerCells.some(h => h.includes('player'))) return

    const colDate    = headerCells.findIndex(h => h === 'date')
    const colClub    = headerCells.findIndex(h => h.includes('club'))
    const colEvent   = headerCells.findIndex(h => h.includes('event'))
    const colPlace   = headerCells.findIndex(h => h.includes('place'))
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
      const dateRaw    = get(colDate)
      const clubText   = get(colClub)
      const placeRaw   = get(colPlace)
      const playersRaw = get(colPlayers)
      const mpts       = get(colMpts)
      const scoreRaw   = get(colScore)

      const parsedDate = parseDate(dateRaw)
      const score      = parseScore(scoreRaw)
      if (!score) return

      const player_names = playersRaw.split(',').map(s => s.trim()).filter(Boolean)

      const existing = rowsByRunId.get(run_id) ?? []
      existing.push({
        run_id, event_name, date: parsedDate, club: clubText, place: placeRaw,
        player_names,
        score_value: normaliseScore(score.value, score.type),
        score_type: score.type,
        tournament: mpts
      })
      rowsByRunId.set(run_id, existing)
    })
  })

  return rowsByRunId
}

export async function POST(request: NextRequest) {
  let body: { date_from?: string; date_end?: string; skip_truncate?: boolean }
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const { date_from, date_end, skip_truncate = false } = body
  if (!date_from || !date_end) {
    return new Response(JSON.stringify({ error: 'date_from and date_end are required' }), { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      let total_sessions = 0

      try {
        if (!skip_truncate) {
          await table_query({ caller: 'scrape/discover/nzb-by-flagged/truncate-ts0', query: `TRUNCATE ts0_scraped`,  params: [] })
          await table_query({ caller: 'scrape/discover/nzb-by-flagged/truncate-ts1', query: `TRUNCATE ts1_sessions`, params: [] })
          await table_query({ caller: 'scrape/discover/nzb-by-flagged/truncate-ts2', query: `TRUNCATE ts2_results`,  params: [] })
        }

        const flagged = await table_query({
          caller: 'scrape/discover/nzb-by-flagged/flagged',
          query: `SELECT pl_plid, pl_name, pl_nz_bridge_number
                  FROM tpl_players
                  WHERE pl_all_results = TRUE AND pl_nz_bridge_number > 0
                  ORDER BY pl_name ASC`,
          params: []
        }) as { pl_plid: number; pl_name: string; pl_nz_bridge_number: number }[]

        if (flagged.length === 0) {
          send({ done: true, total_sessions: 0 })
          return
        }

        const allMissingIds = new Set<number>()

        for (const player of flagged) {
          send({ player: player.pl_name })

          const url = `${NZB_BASE}/online-points.html?mpsr=1&mp_user=${player.pl_nz_bridge_number}`
          await table_query({
            caller: 'scrape/discover/nzb-by-flagged/insert-ts0-player',
            query: `INSERT INTO ts0_scraped (s0_run_id, s0_source, s0_url) VALUES (0, 'player', $1)`,
            params: [url]
          })

          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; next-bridge-bot/1.0)' }
          })
          if (!response.ok) {
            send({ player: player.pl_name, error: `fetch failed (${response.status})` })
            continue
          }

          const runIds = extractRunIds(await response.text())
          if (runIds.length === 0) {
            send({ player: player.pl_name, found: 0, missing: 0 })
            continue
          }

          const existing = await table_query({
            caller: 'scrape/discover/nzb-by-flagged/check',
            query: `SELECT se_run_id FROM tse_sessions WHERE se_run_id = ANY($1)`,
            params: [runIds] as unknown as (string | number | boolean | null)[]
          }) as { se_run_id: number }[]

          const existingSet   = new Set(existing.map(r => r.se_run_id))
          const playerMissing = runIds.filter(id => !existingSet.has(id))

          playerMissing.forEach(id => allMissingIds.add(id))
          send({ player: player.pl_name, found: runIds.length, missing: playerMissing.length })
        }

        // Fetch each missing result page to extract date, then write to ts1
        for (const run_id of allMissingIds) {
          const url = `${NZB_BASE}/results.html?run_id=${run_id}`
          await table_query({
            caller: 'scrape/discover/nzb-by-flagged/insert-ts0',
            query: `INSERT INTO ts0_scraped (s0_run_id, s0_source, s0_url) VALUES ($1, 'player', $2)`,
            params: [run_id, url]
          })
          send({ run_id })

          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; next-bridge-bot/1.0)' }
          })
          if (!response.ok) { send({ run_id, skipped: true }); continue }

          const rowsByRunId = parsePage(await response.text())
          const rows = rowsByRunId.get(run_id) ?? []
          const firstRow = rows.find(r => r.date)

          if (!firstRow?.date) { send({ run_id, skipped: true }); continue }

          if (firstRow.date < date_from || firstRow.date > date_end) {
            send({ run_id, skipped: true }); continue
          }

          const headerRow = rows.find(r => r.player_names.length === 2 || r.player_names.length === 4)
          if (!headerRow) { send({ run_id, skipped: true }); continue }

          const event_type = headerRow.player_names.length === 4 ? 'teams' : 'pairs'
          await table_query({
            caller: 'scrape/discover/nzb-by-flagged/upsert-ts1',
            query: `INSERT INTO ts1_sessions
                      (s1_run_id, s1_date, s1_club, s1_event_name, s1_score_type, s1_event_type, s1_tournament)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)
                    ON CONFLICT (s1_run_id) DO UPDATE SET
                      s1_date       = EXCLUDED.s1_date,
                      s1_club       = EXCLUDED.s1_club,
                      s1_event_name = EXCLUDED.s1_event_name,
                      s1_score_type = EXCLUDED.s1_score_type,
                      s1_event_type = EXCLUDED.s1_event_type,
                      s1_tournament = EXCLUDED.s1_tournament`,
            params: [run_id, firstRow.date, headerRow.club, headerRow.event_name,
                     headerRow.score_type, event_type, headerRow.tournament]
          })
          total_sessions++
          send({ run_id, added: true })
        }

        await write_Logging({
          lg_functionname: 'POST', lg_caller: 'scrape/discover/nzb-by-flagged',
          lg_msg: `${flagged.length} players ${date_from}–${date_end}: ${total_sessions} sessions added to ts1`,
          lg_severity: 'I'
        })

        send({ done: true, total_sessions })
      } catch (err) {
        await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/discover/nzb-by-flagged', lg_msg: String(err), lg_severity: 'E' })
        send({ error: String(err) })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
