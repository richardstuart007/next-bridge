//==============================================================================================
//  1) DESCRIPTION
//    POST — /api/scrape/raw/nzb-by-runid route handler. Streams (SSE) a raw scrape of an
//    explicit run_id list: truncates ts2_results, marks which run_ids are summary sessions
//    from ts1_sessions, then for each run_id fetches and parses its results page — upserting a
//    ts1_sessions header and inserting every pair into ts2_results (creating players as needed).
//
//    Parameters:
//      request — JSON body { run_ids: number[] }
//
//    Returns:
//      a text/event-stream Response; per-run_id progress frames then a final { done: true, … }
//      with run_ids_total, pairs_inserted, players_created, skipped_rows
//==============================================================================================

import { NextRequest } from 'next/server'
import * as cheerio from 'cheerio'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

const NZB_BASE = 'https://www.nzbridge.co.nz'

const MONTH: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
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
      //----------------------------------------------------------------------------------------------
      //  send — enqueues one SSE `data:` frame carrying the JSON of `data`
      //----------------------------------------------------------------------------------------------
      function send(data: object): void {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      let pairs_inserted  = 0
      let players_created = 0
      let skipped_rows    = 0

      try {
        await table_query({
          caller: 'scrape/nzb-by-runid/truncate',
          table: 'ts2_results',
          query: `TRUNCATE ts2_results`,
          params: []
        })

        const summaryResult = await table_query({
          caller: 'scrape/nzb-by-runid/summary-lookup',
          table: 'ts1_sessions',
          query: `SELECT s1_run_id FROM ts1_sessions WHERE s1_is_summary = true AND s1_run_id = ANY($1)`,
          params: [run_ids] as unknown as (string | number | boolean | null)[]
        })
        if (!summaryResult.ok) throw new Error('scrape/nzb-by-runid/summary-lookup: ' + summaryResult.error)
        const summaryRows = summaryResult.data as { s1_run_id: number }[]
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
              table: 'ts1_sessions',
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
                table: 'ts2_results',
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

//----------------------------------------------------------------------------------
//  parsePage — parses a results page into ParsedRow[] grouped by run_id, keeping
//  only rows whose event link carries a run_id and whose score parses; isSummary
//  is forwarded to normaliseScore
//----------------------------------------------------------------------------------
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
//  parseScore — splits a score cell into { value, type }, reading a PCT/VP/XIMPS
//  suffix (XIMPS is folded to VP); null when the cell doesn't match that shape
//----------------------------------------------------------------------------------
function parseScore(raw: string): { value: number; type: 'PCT' | 'VP' } | null {
  const m = raw.trim().match(/^([\d.]+)\s*(PCT|VP|XIMPS)$/i)
  if (!m) return null
  const type = m[2].toUpperCase() === 'XIMPS' ? 'VP' : m[2].toUpperCase() as 'PCT' | 'VP'
  return { value: parseFloat(m[1]), type }
}

//----------------------------------------------------------------------------------
//  normaliseScore — resets an out-of-range PCT to 50 and an over-20 VP to 10;
//  passes summary-row values and everything else through unchanged
//----------------------------------------------------------------------------------
function normaliseScore(value: number, type: 'PCT' | 'VP', isSummary = false): number {
  if (isSummary) return value
  if (type === 'PCT' && (value < 25 || value > 75)) return 50
  if (type === 'VP' && value > 20) return 10
  return value
}

//----------------------------------------------------------------------------------
//  getOrCreatePlayer — returns the pl_plid for a whitespace-normalised name,
//  inserting a tpl_players row (pl_nzb 0) when none exists; `created` says whether
//  a new row was made. Reselects after an ON CONFLICT no-op insert
//----------------------------------------------------------------------------------
async function getOrCreatePlayer(rawName: string): Promise<{ plid: number; created: boolean }> {
  const name = rawName.replace(/\s+/g, ' ').trim()
  const existingResult = await table_query({
    caller: 'scrape/nzb-by-runid/lookup',
    table: 'tpl_players',
    query: `SELECT pl_plid FROM tpl_players WHERE LOWER(pl_name) = LOWER($1)`,
    params: [name]
  })
  if (!existingResult.ok) throw new Error('getOrCreatePlayer/lookup: ' + existingResult.error)
  const existing = existingResult.data as { pl_plid: number }[]

  if (existing.length > 0) return { plid: existing[0].pl_plid, created: false }

  const insertedResult = await table_query({
    caller: 'scrape/nzb-by-runid/create',
    table: 'tpl_players',
    query: `INSERT INTO tpl_players (pl_name, pl_nzb)
            VALUES ($1, 0) ON CONFLICT (pl_name) DO NOTHING RETURNING pl_plid`,
    params: [name]
  })
  if (!insertedResult.ok) throw new Error('getOrCreatePlayer/create: ' + insertedResult.error)
  const inserted = insertedResult.data as { pl_plid: number }[]

  if (inserted.length > 0) return { plid: inserted[0].pl_plid, created: true }

  const reselectResult = await table_query({
    caller: 'scrape/nzb-by-runid/reselect',
    table: 'tpl_players',
    query: `SELECT pl_plid FROM tpl_players WHERE pl_name = $1`,
    params: [name]
  })
  if (!reselectResult.ok) throw new Error('getOrCreatePlayer/reselect: ' + reselectResult.error)
  const reselect = reselectResult.data as { pl_plid: number }[]

  return { plid: reselect[0].pl_plid, created: false }
}
