import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'
import { updateIncrementalPartnerStats } from '@/src/lib/actions/players'
import { extractRunIds } from '@/src/lib/scrapeUtils'

const NZB_BASE = 'https://www.nzbridge.co.nz'
const AKBC_CLUB_ID = 106

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

function normaliseScore(value: number, type: 'PCT' | 'VP'): number {
  if (type === 'PCT' && (value < 25 || value > 75)) return 50
  if (type === 'VP' && value > 20) return 10
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

async function getOrCreatePlayer(rawName: string): Promise<{ plid: number; created: boolean }> {
  const name = rawName.replace(/\s+/g, ' ').trim()
  const existing = await table_query({
    caller: 'cron/update-sessions/lookup',
    query: `SELECT pl_plid FROM tpl_players WHERE LOWER(pl_name) = LOWER($1)`,
    params: [name]
  }) as { pl_plid: number }[]

  if (existing.length > 0) return { plid: existing[0].pl_plid, created: false }

  const inserted = await table_query({
    caller: 'cron/update-sessions/create',
    query: `INSERT INTO tpl_players (pl_name, pl_nz_bridge_number)
            VALUES ($1, 0) ON CONFLICT (pl_name) DO NOTHING RETURNING pl_plid`,
    params: [name]
  }) as { pl_plid: number }[]

  if (inserted.length > 0) return { plid: inserted[0].pl_plid, created: true }

  const reselect = await table_query({
    caller: 'cron/update-sessions/reselect',
    query: `SELECT pl_plid FROM tpl_players WHERE pl_name = $1`,
    params: [name]
  }) as { pl_plid: number }[]

  return { plid: reselect[0].pl_plid, created: false }
}

async function batchCheckMissing(runIds: number[]): Promise<number[]> {
  if (runIds.length === 0) return []
  const existing = await table_query({
    caller: 'cron/update-sessions/check',
    query: `SELECT se_source_id FROM tse_sessions WHERE se_source_id = ANY($1)`,
    params: [runIds] as unknown as (string | number | boolean | null)[]
  }) as { se_source_id: number }[]
  const existingSet = new Set(existing.map(r => r.se_source_id))
  return runIds.filter(id => !existingSet.has(id))
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // Determine start date
    const maxDateResult = await table_query({
      caller: 'cron/update-sessions/from-date',
      query: `SELECT MAX(se_date)::text AS from_date FROM tse_sessions`,
      params: []
    }) as { from_date: string | null }[]

    const rawFrom = maxDateResult[0]?.from_date
    const from_date = rawFrom ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const to_date   = new Date().toISOString().slice(0, 10)

    await write_Logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: `START from_date=${from_date} to_date=${to_date}`, lg_severity: 'I' })

    const allMissingIds = new Set<number>()
    const allFinalIds   = new Set<number>()
    let players_scraped = 0
    let run_ids_found   = 0

    // Phase A — flagged players
    const flagged = await table_query({
      caller: 'cron/update-sessions/flagged',
      query: `SELECT pl_plid, pl_name, pl_nz_bridge_number
              FROM tpl_players
              WHERE pl_all_results = TRUE AND pl_nz_bridge_number > 0
              ORDER BY pl_name ASC`,
      params: []
    }) as { pl_plid: number; pl_name: string; pl_nz_bridge_number: number }[]

    await write_Logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: `Phase A: ${flagged.length} flagged players`, lg_severity: 'I' })

    for (const player of flagged) {
      players_scraped++
      const url = `${NZB_BASE}/online-points.html?mpsr=1&mp_user=${player.pl_nz_bridge_number}`
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; next-bridge-bot/1.0)' }
      })
      if (!response.ok) {
        await write_Logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: `Phase A: ${player.pl_name} fetch failed (${response.status})`, lg_severity: 'W' })
        continue
      }

      const { runIds, finalRunIds } = extractRunIds(await response.text())
      run_ids_found += runIds.length
      finalRunIds.forEach(id => allFinalIds.add(id))
      const missing = await batchCheckMissing(runIds)
      missing.forEach(id => allMissingIds.add(id))
    }

    await write_Logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: `Phase A complete: ${players_scraped} players, ${run_ids_found} run_ids found, ${allMissingIds.size} new so far`, lg_severity: 'I' })

    // Phase B — Auckland club by date range
    const dates = datesInRange(from_date, to_date)
    await write_Logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: `Phase B: club ${AKBC_CLUB_ID} over ${dates.length} days (${from_date} → ${to_date})`, lg_severity: 'I' })

    let club_run_ids_found  = 0
    let club_run_ids_missing = 0
    for (const day of dates) {
      const url =
        `${NZB_BASE}/results.html?mp_filter_club=${AKBC_CLUB_ID}` +
        `&date_start=${day}&date_end=${day}&mp_results=Search`
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; next-bridge-bot/1.0)' }
      })
      if (!response.ok) continue

      const { runIds, finalRunIds } = extractRunIds(await response.text())
      run_ids_found += runIds.length
      club_run_ids_found += runIds.length
      finalRunIds.forEach(id => allFinalIds.add(id))
      const missing = await batchCheckMissing(runIds)
      club_run_ids_missing += missing.length
      missing.forEach(id => allMissingIds.add(id))
    }

    await write_Logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: `Phase B complete: ${club_run_ids_found} run_ids found, ${club_run_ids_missing} new. Total new: ${allMissingIds.size}`, lg_severity: 'I' })

    const run_ids_new = allMissingIds.size

    let pairs_inserted  = 0
    let players_created = 0

    // Phase C — populate ts9 with missing sessions
    if (allMissingIds.size > 0) {
      await table_query({
        caller: 'cron/update-sessions/truncate',
        query: `TRUNCATE ts9_nzb_results`,
        params: []
      })
      await write_Logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: `Phase C: ts9 truncated, importing ${allMissingIds.size} run_ids`, lg_severity: 'I' })

      let run_id_count = 0
      for (const run_id of allMissingIds) {
        run_id_count++
        const url = `${NZB_BASE}/results.html?run_id=${run_id}`
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; next-bridge-bot/1.0)' }
        })
        if (!response.ok) continue

        const rowsByRunId = parsePage(await response.text())
        const rows = rowsByRunId.get(run_id) ?? []

        for (const row of rows) {
          const { player_names, score_value, score_type, date, club, event_name, place, tournament } = row
          const count = player_names.length

          let pairs: [string, string][] = []
          let event_type = 'pairs'

          if (count === 2) {
            pairs = [[player_names[0], player_names[1]]]
          } else if (count === 4) {
            pairs = [
              [player_names[0], player_names[1]],
              [player_names[2], player_names[3]]
            ]
            event_type = 'teams'
          } else {
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
              caller: 'cron/update-sessions/insert-ts9',
              query: `INSERT INTO ts9_nzb_results
                        (s9_run_id, s9_plid1, s9_plid2, s9_date, s9_club,
                         s9_event_name, s9_place, s9_score_value, s9_score_type,
                         s9_event_type, s9_tournament, s9_is_summary)
                      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                      ON CONFLICT (s9_run_id, s9_plid1, s9_plid2) DO NOTHING`,
              params: [run_id, plid1, plid2, date, club, event_name, place,
                       score_value, score_type, event_type, tournament, allFinalIds.has(run_id)]
            })
            pairs_inserted++
          }
        }
      }
      await write_Logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: `Phase C complete: ${pairs_inserted} pairs inserted, ${players_created} new players`, lg_severity: 'I' })
    } else {
      await write_Logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: `Phase C skipped: no new run_ids`, lg_severity: 'I' })
    }

    // Phase D — build stats from ts9
    const sessionsResult = await table_query({
      caller: 'cron/update-sessions/sessions-nzb',
      query: `INSERT INTO tse_sessions
                (se_source_id, se_date, se_day_of_week, se_scoring, se_name,
                 se_club, se_tournament, se_event_type, se_is_summary)
              SELECT DISTINCT ON (s9_run_id)
                s9_run_id,
                s9_date,
                TO_CHAR(s9_date, 'FMDay'),
                CASE WHEN s9_score_type = 'VP' THEN 'VP' ELSE 'MP' END,
                s9_event_name,
                s9_club,
                s9_tournament,
                s9_event_type,
                s9_is_summary
              FROM ts9_nzb_results
              WHERE s9_date IS NOT NULL
              ORDER BY s9_run_id, s9_s9id
              ON CONFLICT (se_source_id) DO NOTHING
              RETURNING se_seid`,
      params: []
    }) as { se_seid: number }[]
    await write_Logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: `Phase D sessions: ${sessionsResult.length} inserted`, lg_severity: 'I' })

    const resultsResult = await table_query({
      caller: 'cron/update-sessions/results-nzb',
      query: `INSERT INTO tre_results (re_seid, re_plid1, re_plid2, re_percentage, re_vp)
              SELECT * FROM (
                SELECT s.se_seid, t.s9_plid1, t.s9_plid2,
                  CASE WHEN t.s9_score_type = 'VP'
                       THEN 35 + (LEAST(t.s9_score_value, 20) / 20 * 30)
                       ELSE GREATEST(25.0, LEAST(75.0, t.s9_score_value)) END,
                  CASE WHEN t.s9_score_type = 'VP' THEN t.s9_score_value ELSE NULL END
                FROM ts9_nzb_results t
                JOIN tse_sessions s ON s.se_source_id = t.s9_run_id
                WHERE NOT EXISTS (SELECT 1 FROM tre_results re WHERE re.re_seid = s.se_seid)
                UNION ALL
                SELECT s.se_seid, t.s9_plid2, t.s9_plid1,
                  CASE WHEN t.s9_score_type = 'VP'
                       THEN 35 + (LEAST(t.s9_score_value, 20) / 20 * 30)
                       ELSE GREATEST(25.0, LEAST(75.0, t.s9_score_value)) END,
                  CASE WHEN t.s9_score_type = 'VP' THEN t.s9_score_value ELSE NULL END
                FROM ts9_nzb_results t
                JOIN tse_sessions s ON s.se_source_id = t.s9_run_id
                WHERE NOT EXISTS (SELECT 1 FROM tre_results re WHERE re.re_seid = s.se_seid)
              ) combined
              RETURNING re_reid`,
      params: []
    }) as { re_reid: number }[]
    await write_Logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: `Phase D results: ${resultsResult.length} inserted`, lg_severity: 'I' })

    const { sessions: partner_sessions, pairs: partner_pairs } = await updateIncrementalPartnerStats()
    await write_Logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: `Phase D partners: ${partner_sessions} sessions, ${partner_pairs} pairs`, lg_severity: 'I' })

    const summary = {
      from_date,
      to_date,
      players_scraped,
      run_ids_found,
      run_ids_new,
      pairs_inserted,
      players_created,
      sessions_built: sessionsResult.length,
      results_built: resultsResult.length,
      partner_sessions,
      partner_pairs,
    }

    await write_Logging({
      lg_functionname: 'GET',
      lg_caller: 'cron/update-sessions',
      lg_msg: `${from_date}→${to_date}: ${run_ids_new} new run_ids, ${sessionsResult.length} sessions, ${resultsResult.length} results, ${partner_sessions} partner sessions`,
      lg_severity: 'I'
    })

    return NextResponse.json(summary)
  } catch (err) {
    await write_Logging({
      lg_functionname: 'GET',
      lg_caller: 'cron/update-sessions',
      lg_msg: String(err),
      lg_severity: 'E'
    })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
