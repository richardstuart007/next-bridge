import { NextRequest } from 'next/server'
import * as cheerio from 'cheerio'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'
import {
  BRIDGE_CLUB_ID,
  MP_PERCENTAGE_MIN,
  MP_PERCENTAGE_MAX,
  VP_SCORE_SANITY_MAX,
  VP_SCORE_SANITY_RESET
} from '@/src/lib/constants'

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
  const m = raw.trim().match(/^([\d.]+)\s*(PCT|VP|XIMPS)$/i)
  if (!m) return null
  const type = m[2].toUpperCase() === 'XIMPS' ? 'VP' : m[2].toUpperCase() as 'PCT' | 'VP'
  return { value: parseFloat(m[1]), type }
}

function normaliseScore(value: number, type: 'PCT' | 'VP', isSummary = false): number {
  if (isSummary) return value
  if (type === 'PCT' && (value < MP_PERCENTAGE_MIN || value > MP_PERCENTAGE_MAX)) return 50
  if (type === 'VP' && value > VP_SCORE_SANITY_MAX) return VP_SCORE_SANITY_RESET
  return value
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

// Fast pass â€” just extract unique run_ids from event link hrefs
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
  player_names: string[]
  score_value: number
  score_type: 'PCT' | 'VP'
  tournament: string
}

// Full parse â€” only called when missing sessions found on the page
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
      const playersRaw = get(colPlayers)
      const mpts       = get(colMpts)
      const scoreRaw   = get(colScore)

      const parsedDate = parseDate(dateRaw)
      const score      = parseScore(scoreRaw)
      if (!score) return

      const player_names = playersRaw.split(',').map(s => s.trim()).filter(Boolean)

      const existing = rowsByRunId.get(run_id) ?? []
      existing.push({
        run_id, event_name, date: parsedDate, club: clubText,
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

async function getOrCreatePlayer(rawName: string): Promise<{ plid: number; created: boolean }> {
  const name = rawName.replace(/\s+/g, ' ').trim()
  const existing = await table_query({
    caller: 'scrape/nzb-by-date/lookup',
    query: `SELECT pl_plid FROM tpl_players WHERE LOWER(pl_name) = LOWER($1)`,
    params: [name]
  }) as { pl_plid: number }[]

  if (existing.length > 0) return { plid: existing[0].pl_plid, created: false }

  const inserted = await table_query({
    caller: 'scrape/nzb-by-date/create',
    query: `INSERT INTO tpl_players (pl_name, pl_nzb)
            VALUES ($1, 0) ON CONFLICT (pl_name) DO NOTHING RETURNING pl_plid`,
    params: [name]
  }) as { pl_plid: number }[]

  if (inserted.length > 0) return { plid: inserted[0].pl_plid, created: true }

  const reselect = await table_query({
    caller: 'scrape/nzb-by-date/reselect',
    query: `SELECT pl_plid FROM tpl_players WHERE pl_name = $1`,
    params: [name]
  }) as { pl_plid: number }[]

  return { plid: reselect[0].pl_plid, created: false }
}

export async function POST(request: NextRequest) {
  let body: { date_from?: string; date_end?: string; club_id?: number }
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const { date_from, date_end, club_id = BRIDGE_CLUB_ID } = body
  if (!date_from || !date_end) {
    return new Response(JSON.stringify({ error: 'date_from and date_end are required' }), { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      let run_ids_found    = 0
      let run_ids_skipped  = 0
      let run_ids_inserted = 0
      let pairs_inserted   = 0
      let players_created  = 0
      let skipped_rows     = 0

      try {
        await table_query({
          caller: 'scrape/nzb-by-date/truncate',
          query: `TRUNCATE ts2_results`,
          params: []
        })

        const dates = datesInRange(date_from, date_end)

        for (const day of dates) {
          send({ date: day })

          const url =
            `${NZB_BASE}/results.html?mp_filter_club=${club_id}` +
            `&date_start=${day}&date_end=${day}&mp_results=Search`

          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; next-bridge-bot/1.0)' }
          })
          if (!response.ok) continue

          const html = await response.text()

          // Fast pass: extract run_ids only
          const runIds = extractRunIds(html)
          if (runIds.length === 0) continue

          run_ids_found += runIds.length

          // Batch check which run_ids are already in prod
          const existing = await table_query({
            caller: 'scrape/nzb-by-date/check',
            query: `SELECT se_run_id FROM tse_sessions WHERE se_run_id = ANY($1)`,
            params: [runIds] as unknown as (string | number | boolean | null)[]
          }) as { se_run_id: number }[]

          const existingSet = new Set(existing.map(r => r.se_run_id))
          const missingIds  = runIds.filter(id => !existingSet.has(id))

          run_ids_skipped += runIds.length - missingIds.length

          if (missingIds.length === 0) continue

          // Full parse only for days with missing sessions
          const rowsByRunId = parsePage(html)

          for (const run_id of missingIds) {
            const rows = rowsByRunId.get(run_id)
            if (!rows) continue

            run_ids_inserted++

            // Upsert ts1 header from first valid row
            const headerRow = rows.find(r => r.player_names.length === 2 || r.player_names.length === 4)
            if (headerRow) {
              const event_type = headerRow.player_names.length === 4 ? 'teams' : 'pairs'
              await table_query({
                caller: 'scrape/nzb-by-date/upsert-ts1',
                query: `INSERT INTO ts1_sessions
                          (s1_run_id, s1_date, s1_club, s1_event_name, s1_score_type, s1_event_type, s1_tournament)
                        VALUES ($1,$2,$3,$4,$5,$6,$7)
                        ON CONFLICT (s1_run_id) DO UPDATE SET
                          s1_date = EXCLUDED.s1_date,
                          s1_club = EXCLUDED.s1_club,
                          s1_event_name = EXCLUDED.s1_event_name,
                          s1_score_type = EXCLUDED.s1_score_type,
                          s1_event_type = EXCLUDED.s1_event_type,
                          s1_tournament = EXCLUDED.s1_tournament`,
                params: [run_id, headerRow.date, headerRow.club, headerRow.event_name,
                         headerRow.score_type, event_type, headerRow.tournament]
              })
            }

            for (const row of rows) {
              const { player_names, score_value } = row
              const count = player_names.length

              let pairs: [string, string][] = []
              if (count === 2) {
                pairs = [[player_names[0], player_names[1]]]
              } else if (count === 4) {
                pairs = [
                  [player_names[0], player_names[1]],
                  [player_names[2], player_names[3]]
                ]
              } else {
                skipped_rows++
                continue
              }

              for (const [nameA, nameB] of pairs) {
                const a = await getOrCreatePlayer(nameA)
                const b = await getOrCreatePlayer(nameB)
                if (a.created) players_created++
                if (b.created) players_created++

                const plid1 = Math.min(a.plid, b.plid)
                const plid2 = Math.max(a.plid, b.plid)

                await table_query({
                  caller: 'scrape/nzb-by-date/insert',
                  query: `INSERT INTO ts2_results (s2_run_id, s2_plid1, s2_plid2, s2_score_value)
                          VALUES ($1,$2,$3,$4)
                          ON CONFLICT (s2_run_id, s2_plid1, s2_plid2) DO NOTHING`,
                  params: [run_id, plid1, plid2, score_value]
                })
                pairs_inserted++
              }
            }

            send({ date: day, run_id, pairs: pairs_inserted, inserted: run_ids_inserted })
          }
        }

        await write_logging({
          lg_functionname: 'POST', lg_caller: 'scrape/raw/nzb-by-date',
          lg_msg: `club=${club_id} ${date_from}â€“${date_end}: ${run_ids_found} run_ids (${run_ids_skipped} skipped, ${run_ids_inserted} new), ${pairs_inserted} pairs, ${players_created} new players`,
          lg_severity: 'I'
        })

        send({ done: true, run_ids_found, run_ids_skipped, run_ids_inserted, pairs_inserted, players_created, skipped_rows })
      } catch (err) {
        await write_logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/nzb-by-date', lg_msg: String(err), lg_severity: 'E' })
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
