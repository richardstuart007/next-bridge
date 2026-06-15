import { NextRequest } from 'next/server'
import * as cheerio from 'cheerio'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

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
  if (type === 'PCT' && (value < 25 || value > 75)) return 50
  if (type === 'VP' && value > 20) return 10
  return value
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

function parsePage(html: string, isSummary = false): Map<number, ParsedRow[]> {
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
        score_value: normaliseScore(score.value, score.type, isSummary),
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
    caller: 'scrape/nzb-by-runid/lookup',
    query: `SELECT pl_plid FROM tpl_players WHERE LOWER(pl_name) = LOWER($1)`,
    params: [name]
  }) as { pl_plid: number }[]

  if (existing.length > 0) return { plid: existing[0].pl_plid, created: false }

  const inserted = await table_query({
    caller: 'scrape/nzb-by-runid/create',
    query: `INSERT INTO tpl_players (pl_name, pl_nz_bridge_number)
            VALUES ($1, 0) ON CONFLICT (pl_name) DO NOTHING RETURNING pl_plid`,
    params: [name]
  }) as { pl_plid: number }[]

  if (inserted.length > 0) return { plid: inserted[0].pl_plid, created: true }

  const reselect = await table_query({
    caller: 'scrape/nzb-by-runid/reselect',
    query: `SELECT pl_plid FROM tpl_players WHERE pl_name = $1`,
    params: [name]
  }) as { pl_plid: number }[]

  return { plid: reselect[0].pl_plid, created: false }
}

export async function POST(request: NextRequest) {
  let body: { run_ids?: number[] }
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const { run_ids } = body
  if (!run_ids || run_ids.length === 0) {
    return new Response(JSON.stringify({ error: 'run_ids array is required' }), { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      let pairs_inserted  = 0
      let players_created = 0
      let skipped_rows    = 0

      try {
        await table_query({
          caller: 'scrape/nzb-by-runid/truncate',
          query: `TRUNCATE ts2_results`,
          params: []
        })

        const summaryRows = await table_query({
          caller: 'scrape/nzb-by-runid/summary-lookup',
          query: `SELECT s1_run_id FROM ts1_sessions WHERE s1_is_summary = true AND s1_run_id = ANY($1)`,
          params: [run_ids] as unknown as (string | number | boolean | null)[]
        }) as { s1_run_id: number }[]
        const summarySet = new Set(summaryRows.map(r => r.s1_run_id))

        for (const run_id of run_ids) {
          send({ run_id })
          const isSummary = summarySet.has(run_id)

          const url = `${NZB_BASE}/results.html?run_id=${run_id}`
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; next-bridge-bot/1.0)' }
          })
          if (!response.ok) { send({ run_id, skipped: true }); continue }

          const rowsByRunId = parsePage(await response.text(), isSummary)
          const rows = rowsByRunId.get(run_id) ?? []

          if (rows.length === 0) { send({ run_id, skipped: true }); continue }

          // Upsert ts1 header from first valid row
          const headerRow = rows.find(r => r.player_names.length === 2 || r.player_names.length === 4)
          if (headerRow) {
            const event_type = headerRow.player_names.length === 4 ? 'teams' : 'pairs'
            await table_query({
              caller: 'scrape/nzb-by-runid/upsert-ts1',
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
                caller: 'scrape/nzb-by-runid/insert',
                query: `INSERT INTO ts2_results (s2_run_id, s2_plid1, s2_plid2, s2_score_value)
                        VALUES ($1,$2,$3,$4)
                        ON CONFLICT (s2_run_id, s2_plid1, s2_plid2) DO NOTHING`,
                params: [run_id, plid1, plid2, score_value]
              })
              pairs_inserted++
            }

            send({ run_id, pairs: pairs_inserted, inserted: true })
          }
        }

        await write_logging({
          lg_functionname: 'POST', lg_caller: 'scrape/raw/nzb-by-runid',
          lg_msg: `${run_ids.length} run_ids: ${pairs_inserted} pairs, ${players_created} new players`,
          lg_severity: 'I'
        })

        send({ done: true, run_ids_total: run_ids.length, pairs_inserted, players_created, skipped_rows })
      } catch (err) {
        await write_logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/nzb-by-runid', lg_msg: String(err), lg_severity: 'E' })
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
