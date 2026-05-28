import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'
import { buildAllPartnerStats } from '@/src/lib/actions/players'
import { extractRunIds } from '@/src/lib/scrapeUtils'

const NZB_BASE       = 'https://www.nzbridge.co.nz'
const BRIDGE_CLUB_ID = 106
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; next-bridge-bot/1.0)' }

const GRP_EXPR = `CASE WHEN RIGHT(se_tournament,1)='A' THEN 'A' WHEN RIGHT(se_tournament,1)='B' THEN 'B' ELSE 'C' END`

const MONTH: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
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

interface ParsedRow {
  run_id:       number
  event_name:   string
  date:         string | null
  club:         string
  player_names: string[]
  score_value:  number
  score_type:   'PCT' | 'VP'
  tournament:   string
}

function parsePage(html: string): Map<number, ParsedRow[]> {
  const $ = cheerio.load(html)
  const rowsByRunId = new Map<number, ParsedRow[]>()

  $('table').each((_, table) => {
    const headerRow   = $(table).find('tr').first()
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
      const playersRaw = get(colPlayers)
      const scoreRaw   = get(colScore)

      const parsedDate   = parseDate(get(colDate))
      const score        = parseScore(scoreRaw)
      if (!score) return

      const player_names = playersRaw.split(',').map(s => s.trim()).filter(Boolean)
      const existing     = rowsByRunId.get(run_id) ?? []
      existing.push({
        run_id, event_name, date: parsedDate, club: get(colClub),
        player_names,
        score_value: normaliseScore(score.value, score.type),
        score_type: score.type,
        tournament: get(colMpts)
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
    query:  `SELECT pl_plid FROM tpl_players WHERE LOWER(pl_name) = LOWER($1)`,
    params: [name]
  }) as { pl_plid: number }[]
  if (existing.length > 0) return { plid: existing[0].pl_plid, created: false }

  const inserted = await table_query({
    caller: 'cron/update-sessions/create',
    query:  `INSERT INTO tpl_players (pl_name, pl_nz_bridge_number) VALUES ($1, 0) ON CONFLICT (pl_name) DO NOTHING RETURNING pl_plid`,
    params: [name]
  }) as { pl_plid: number }[]
  if (inserted.length > 0) return { plid: inserted[0].pl_plid, created: true }

  const reselect = await table_query({
    caller: 'cron/update-sessions/reselect',
    query:  `SELECT pl_plid FROM tpl_players WHERE pl_name = $1`,
    params: [name]
  }) as { pl_plid: number }[]
  return { plid: reselect[0].pl_plid, created: false }
}

async function batchCheckMissing(runIds: number[]): Promise<number[]> {
  if (runIds.length === 0) return []
  const existing = await table_query({
    caller: 'cron/update-sessions/check',
    query:  `SELECT se_run_id FROM tse_sessions WHERE se_run_id = ANY($1)`,
    params: [runIds] as unknown as (string | number | boolean | null)[]
  }) as { se_run_id: number }[]
  const existingSet = new Set(existing.map(r => r.se_run_id))
  return runIds.filter(id => !existingSet.has(id))
}

async function scrapeRunId(run_id: number): Promise<{ pairs: number; created: number }> {
  const response = await fetch(`${NZB_BASE}/results.html?run_id=${run_id}`, { headers: UA })
  if (!response.ok) return { pairs: 0, created: 0 }

  const rowsByRunId = parsePage(await response.text())
  const rows = rowsByRunId.get(run_id) ?? []
  if (rows.length === 0) return { pairs: 0, created: 0 }

  const headerRow = rows.find(r => r.player_names.length === 2 || r.player_names.length === 4)
  if (headerRow) {
    const event_type = headerRow.player_names.length === 4 ? 'teams' : 'pairs'
    await table_query({
      caller: 'cron/update-sessions/upsert-ts1',
      query: `INSERT INTO ts1_sessions
                (s1_run_id, s1_date, s1_club, s1_event_name, s1_score_type, s1_event_type, s1_tournament)
              VALUES ($1,$2,$3,$4,$5,$6,$7)
              ON CONFLICT (s1_run_id) DO UPDATE SET
                s1_date = EXCLUDED.s1_date, s1_club = EXCLUDED.s1_club,
                s1_event_name = EXCLUDED.s1_event_name, s1_score_type = EXCLUDED.s1_score_type,
                s1_event_type = EXCLUDED.s1_event_type, s1_tournament = EXCLUDED.s1_tournament`,
      params: [run_id, headerRow.date, headerRow.club, headerRow.event_name,
               headerRow.score_type, event_type, headerRow.tournament]
    })
  }

  let pairs = 0, created = 0
  for (const row of rows) {
    const { player_names, score_value } = row
    let pairList: [string, string][] = []
    if (player_names.length === 2)      pairList = [[player_names[0], player_names[1]]]
    else if (player_names.length === 4) pairList = [[player_names[0], player_names[1]], [player_names[2], player_names[3]]]
    else continue

    for (const [nameA, nameB] of pairList) {
      const a = await getOrCreatePlayer(nameA)
      const b = await getOrCreatePlayer(nameB)
      if (a.created) created++
      if (b.created) created++
      await table_query({
        caller: 'cron/update-sessions/insert-ts2',
        query:  `INSERT INTO ts2_results (s2_run_id, s2_plid1, s2_plid2, s2_score_value)
                 VALUES ($1,$2,$3,$4) ON CONFLICT (s2_run_id, s2_plid1, s2_plid2) DO NOTHING`,
        params: [run_id, Math.min(a.plid, b.plid), Math.max(a.plid, b.plid), score_value]
      })
      pairs++
    }
  }
  return { pairs, created }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log = (msg: string, severity = 'I') =>
    write_Logging({ lg_functionname: 'GET', lg_caller: 'cron/update-sessions', lg_msg: msg, lg_severity: severity })

  try {
    const maxDateResult = await table_query({
      caller: 'cron/update-sessions/from-date',
      query:  `SELECT MAX(se_date)::text AS from_date FROM tse_sessions`,
      params: []
    }) as { from_date: string | null }[]

    const from_date = maxDateResult[0]?.from_date
      ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const to_date = new Date().toISOString().slice(0, 10)

    await log(`START from_date=${from_date} to_date=${to_date}`)
    await table_query({ caller: 'cron/update-sessions/truncate-staging', query: `TRUNCATE ts1_sessions, ts2_results`, params: [] })

    const allMissingIds = new Set<number>()

    // Phase A — Club by date
    const dates = datesInRange(from_date, to_date)
    for (const day of dates) {
      const url = `${NZB_BASE}/results.html?mp_filter_club=${BRIDGE_CLUB_ID}&date_start=${day}&date_end=${day}&mp_results=Search`
      const res = await fetch(url, { headers: UA })
      if (!res.ok) continue
      const { runIds } = extractRunIds(await res.text())
      const missing = await batchCheckMissing(runIds)
      missing.forEach(id => allMissingIds.add(id))
    }
    await log(`Phase A club (${dates.length} days): ${allMissingIds.size} new run_ids`)

    // Phase B — Tracked players
    const flagged = await table_query({
      caller: 'cron/update-sessions/flagged',
      query:  `SELECT pl_nz_bridge_number FROM tpl_players WHERE pl_all_results = TRUE AND pl_nz_bridge_number > 0 ORDER BY pl_name ASC`,
      params: []
    }) as { pl_nz_bridge_number: number }[]

    const beforeB = allMissingIds.size
    for (const player of flagged) {
      const url = `${NZB_BASE}/online-points.html?mpsr=1&mp_user=${player.pl_nz_bridge_number}`
      const res = await fetch(url, { headers: UA })
      if (!res.ok) continue
      const { runIds } = extractRunIds(await res.text())
      const missing = await batchCheckMissing(runIds)
      missing.forEach(id => allMissingIds.add(id))
    }
    await log(`Phase B tracked (${flagged.length} players): ${allMissingIds.size - beforeB} additional run_ids`)

    // Phase C — Scrape all missing run_ids → ts1 + ts2
    let pairs_total = 0, players_created = 0
    for (const run_id of allMissingIds) {
      const { pairs, created } = await scrapeRunId(run_id)
      pairs_total   += pairs
      players_created += created
    }
    await log(`Phase C scrape (${allMissingIds.size} run_ids): ${pairs_total} pairs, ${players_created} new players`)

    // Phase D — Build production tables
    const sessionsResult = await table_query({
      caller: 'cron/update-sessions/sessions-nzb',
      query: `INSERT INTO tse_sessions
                (se_run_id, se_date, se_day_of_week, se_scoring, se_name,
                 se_club, se_tournament, se_event_type, se_is_summary)
              SELECT s1_run_id, s1_date, TO_CHAR(s1_date, 'FMDay'),
                CASE WHEN s1_score_type = 'VP' THEN 'VP' ELSE 'MP' END,
                s1_event_name, CASE s1_club WHEN 'Auckland' THEN 'Remuera Bowls & Bridge Inc' ELSE s1_club END, s1_tournament, s1_event_type, s1_is_summary
              FROM ts1_sessions
              WHERE s1_date IS NOT NULL
              ORDER BY s1_date, s1_run_id
              ON CONFLICT (se_run_id) DO NOTHING
              RETURNING se_seid`,
      params: []
    }) as { se_seid: number }[]

    await table_query({
      caller: 'cron/update-sessions/upsert-partners',
      query: `INSERT INTO tpa_partners (pa_plid1, pa_plid2)
              SELECT DISTINCT s2_plid1, s2_plid2
              FROM ts2_results
              JOIN tse_sessions ON se_run_id = s2_run_id
              WHERE NOT EXISTS (SELECT 1 FROM tre_results WHERE re_seid = se_seid)
              ON CONFLICT (pa_plid1, pa_plid2) DO NOTHING`,
      params: []
    })

    const resultsResult = await table_query({
      caller: 'cron/update-sessions/results-nzb',
      query: `INSERT INTO tre_results (re_seid, re_paid, re_percentage, re_vp)
              SELECT DISTINCT ON (se_seid, pa_paid) se_seid, pa_paid,
                CASE WHEN s1_score_type = 'VP' THEN NULL ELSE LEAST(999.0, GREATEST(25.0, LEAST(75.0, s2_score_value))) END,
                CASE WHEN s1_score_type = 'VP' THEN LEAST(999.0, s2_score_value) ELSE NULL END
              FROM ts2_results
              JOIN tse_sessions ON se_run_id  = s2_run_id
              JOIN ts1_sessions ON s1_run_id  = s2_run_id
              JOIN tpa_partners ON pa_plid1 = s2_plid1 AND pa_plid2 = s2_plid2
              WHERE NOT EXISTS (SELECT 1 FROM tre_results WHERE re_seid = se_seid)
              RETURNING re_reid`,
      params: []
    }) as { re_reid: number }[]

    const { pairs: partner_pairs } = await buildAllPartnerStats()
    await log(`Phase D build: ${sessionsResult.length} sessions, ${resultsResult.length} results, ${partner_pairs} partners`)

    // Phase E — Recalculate stats
    await table_query({ caller: 'cron/update-sessions/truncate-stats', query: `TRUNCATE ta1_player_stats, ta2_partner_stats`, params: [] })

    for (const grp of ['A', 'B', 'C']) {
      await table_query({
        caller: `cron/update-sessions/player-stats-${grp}`,
        query: `INSERT INTO ta1_player_stats
                  (a1_plid, a1_group, a1_mp_sessions, a1_mp_avg_pct, a1_mp_stddev,
                   a1_vp_sessions, a1_vp_avg_vp, a1_vp_stddev)
                SELECT u.plid, $1::varchar,
                  COUNT(*)                FILTER (WHERE se_scoring = 'MP')::integer,
                  COALESCE(ROUND(AVG(re_percentage)        FILTER (WHERE se_scoring = 'MP')::numeric, 2), 0),
                  ROUND(STDDEV_SAMP(re_percentage)         FILTER (WHERE se_scoring = 'MP')::numeric, 2),
                  COUNT(*)                FILTER (WHERE se_scoring = 'VP')::integer,
                  COALESCE(ROUND(AVG(re_vp)               FILTER (WHERE se_scoring = 'VP')::numeric, 2), 0),
                  ROUND(STDDEV_SAMP(re_vp)                FILTER (WHERE se_scoring = 'VP')::numeric, 2)
                FROM tre_results
                JOIN tse_sessions ON se_seid = re_seid
                JOIN tpa_partners ON pa_paid = re_paid
                CROSS JOIN LATERAL unnest(ARRAY[pa_plid1, pa_plid2]) AS u(plid)
                WHERE se_is_summary IS NOT TRUE AND ${GRP_EXPR} = $1
                GROUP BY u.plid`,
        params: [grp]
      })
    }
    await table_query({
      caller: 'cron/update-sessions/player-stats-all',
      query: `INSERT INTO ta1_player_stats
                (a1_plid, a1_group, a1_mp_sessions, a1_mp_avg_pct, a1_mp_stddev,
                 a1_vp_sessions, a1_vp_avg_vp, a1_vp_stddev)
              SELECT u.plid, 'all',
                COUNT(*)                FILTER (WHERE se_scoring = 'MP')::integer,
                COALESCE(ROUND(AVG(re_percentage)        FILTER (WHERE se_scoring = 'MP')::numeric, 2), 0),
                ROUND(STDDEV_SAMP(re_percentage)         FILTER (WHERE se_scoring = 'MP')::numeric, 2),
                COUNT(*)                FILTER (WHERE se_scoring = 'VP')::integer,
                COALESCE(ROUND(AVG(re_vp)               FILTER (WHERE se_scoring = 'VP')::numeric, 2), 0),
                ROUND(STDDEV_SAMP(re_vp)                FILTER (WHERE se_scoring = 'VP')::numeric, 2)
              FROM tre_results
              JOIN tse_sessions ON se_seid = re_seid
              JOIN tpa_partners ON pa_paid = re_paid
              CROSS JOIN LATERAL unnest(ARRAY[pa_plid1, pa_plid2]) AS u(plid)
              WHERE se_is_summary IS NOT TRUE
              GROUP BY u.plid`,
      params: []
    })

    for (const grp of ['A', 'B', 'C']) {
      await table_query({
        caller: `cron/update-sessions/partner-stats-${grp}`,
        query: `INSERT INTO ta2_partner_stats
                  (a2_paid, a2_group, a2_mp_sessions, a2_mp_avg_pct, a2_mp_stddev,
                   a2_vp_sessions, a2_vp_avg_vp, a2_vp_stddev)
                SELECT re_paid, $1::varchar,
                  COUNT(*)                FILTER (WHERE se_scoring = 'MP')::integer,
                  COALESCE(ROUND(AVG(re_percentage)        FILTER (WHERE se_scoring = 'MP')::numeric, 2), 0),
                  ROUND(STDDEV_SAMP(re_percentage)         FILTER (WHERE se_scoring = 'MP')::numeric, 2),
                  COUNT(*)                FILTER (WHERE se_scoring = 'VP')::integer,
                  COALESCE(ROUND(AVG(re_vp)               FILTER (WHERE se_scoring = 'VP')::numeric, 2), 0),
                  ROUND(STDDEV_SAMP(re_vp)                FILTER (WHERE se_scoring = 'VP')::numeric, 2)
                FROM tre_results
                JOIN tse_sessions ON se_seid = re_seid
                WHERE se_is_summary IS NOT TRUE AND ${GRP_EXPR} = $1
                GROUP BY re_paid`,
        params: [grp]
      })
    }
    await table_query({
      caller: 'cron/update-sessions/partner-stats-all',
      query: `INSERT INTO ta2_partner_stats
                (a2_paid, a2_group, a2_mp_sessions, a2_mp_avg_pct, a2_mp_stddev,
                 a2_vp_sessions, a2_vp_avg_vp, a2_vp_stddev)
              SELECT re_paid, 'all',
                COUNT(*)                FILTER (WHERE se_scoring = 'MP')::integer,
                COALESCE(ROUND(AVG(re_percentage)        FILTER (WHERE se_scoring = 'MP')::numeric, 2), 0),
                ROUND(STDDEV_SAMP(re_percentage)         FILTER (WHERE se_scoring = 'MP')::numeric, 2),
                COUNT(*)                FILTER (WHERE se_scoring = 'VP')::integer,
                COALESCE(ROUND(AVG(re_vp)               FILTER (WHERE se_scoring = 'VP')::numeric, 2), 0),
                ROUND(STDDEV_SAMP(re_vp)                FILTER (WHERE se_scoring = 'VP')::numeric, 2)
              FROM tre_results
              JOIN tse_sessions ON se_seid = re_seid
              WHERE se_is_summary IS NOT TRUE
              GROUP BY re_paid`,
      params: []
    })
    await log(`Phase E stats: player and partner stats rebuilt`)

    const summary = {
      from_date, to_date,
      run_ids_new:     allMissingIds.size,
      pairs_total,     players_created,
      sessions_built:  sessionsResult.length,
      results_built:   resultsResult.length,
      partner_pairs,
    }
    await log(`DONE: ${allMissingIds.size} run_ids, ${sessionsResult.length} sessions, ${resultsResult.length} results`)
    return NextResponse.json(summary)

  } catch (err) {
    await log(String(err), 'E')
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
