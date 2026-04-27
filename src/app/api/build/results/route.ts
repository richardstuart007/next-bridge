import { NextRequest, NextResponse } from 'next/server'
import { getTs3ByEventId, getTs4ByEventId, getTs6BySourceId } from '@/src/lib/actions/raw'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

const RAW_TABLE = 'trw_results_raw'

/**
 * POST /api/scrape/build/results?source_id=X
 *
 * Reads raw ts* tables for a single source_id and writes trw_results_raw rows,
 * then updates tse_sessions.se_status = 'fetched' and se_rounds.
 *
 * Session type is determined by what raw data is present:
 *   ts3+ts4 present → teams (IMP/VP)
 *   ts5 present     → multi-session MP
 *   ts6 present     → single MP session
 */
export async function POST(request: NextRequest) {
  const sourceId = parseInt(request.nextUrl.searchParams.get('source_id') ?? '', 10)
  if (isNaN(sourceId)) return NextResponse.json({ error: 'Missing source_id' }, { status: 400 })

  try {
    // Find the tse_sessions row for this source_id
    const sessionRows = await table_query({
      caller: 'build/results/session',
      query: `SELECT se_seid, se_session_type FROM tse_sessions WHERE se_source_id = $1`,
      params: [sourceId]
    }) as { se_seid: number; se_session_type: string }[]

    if (sessionRows.length === 0) return NextResponse.json({ error: `No session for source_id ${sourceId}` }, { status: 404 })
    const { se_seid: seid, se_session_type: sessionType } = sessionRows[0]

    // Clear existing results for this session so process-results re-runs cleanly
    await table_query({ caller: 'build/results/clear', query: `DELETE FROM tre_results WHERE re_seid = $1`, params: [seid] })
    await table_query({ caller: 'build/results/clear', query: `DELETE FROM ${RAW_TABLE} WHERE rw_seid = $1`, params: [seid] })

    let pairsStored = 0

    if (sessionType === 'teams') {
      // ── Teams: join ts3 (members) + ts4 (rounds) ────────────────────────────
      const ts3 = await getTs3ByEventId(sourceId) as any[]
      const ts4 = await getTs4ByEventId(sourceId) as any[]

      if (ts3.length === 0 || ts4.length === 0) {
        await table_query({ caller: 'build/results/status', query: `UPDATE tse_sessions SET se_status = 'no-pairs' WHERE se_seid = $1`, params: [seid] })
        return NextResponse.json({ sourceId, seid, pairs: 0, status: 'no-pairs' })
      }

      // Group members by team: teamNum → [player1, player2, ...]
      const teamMembers = new Map<number, string[]>()
      for (const m of ts3) {
        teamMembers.set(m.s3_team_num as number, m.s3_player_names as string[])
      }

      // Group rounds by team: teamNum → { vps[], opponentNums[] }
      const teamRounds = new Map<number, { vps: number[]; opponentNums: number[] }>()
      for (const r of ts4) {
        const vps = (Array.isArray(r.s4_vps) ? r.s4_vps : []).map(Number)
        const opponentNums = (Array.isArray(r.s4_opponent_nums) ? r.s4_opponent_nums : []).map(Number)
        teamRounds.set(r.s4_team_num as number, { vps, opponentNums })
      }

      const rounds = Math.max(...[...teamRounds.values()].map(v => v.vps.length), 0)

      for (const [teamNum, members] of teamMembers.entries()) {
        const { vps = [] } = teamRounds.get(teamNum) ?? {}
        if (vps.length === 0) continue

        // Pair 1: players 0+1, Pair 2: players 2+3
        const pairDefs = [
          [members[0], members[1]],
          [members[2], members[3]]
        ].filter(p => p[0] && p[1])

        for (const [p1, p2] of pairDefs) {
          const [name1, name2] = [p1, p2].sort()
          for (let i = 0; i < vps.length; i++) {
            await table_query({
              caller: 'build/results/insert',
              query: `INSERT INTO ${RAW_TABLE} (rw_seid, rw_name1, rw_name2, rw_percentage, rw_vp, rw_match_num) VALUES ($1, $2, $3, 0, $4, $5)`,
              params: [seid, name1, name2, vps[i], i + 1]
            })
            pairsStored++
          }
        }
      }

      await table_query({ caller: 'build/results/rounds', query: `UPDATE tse_sessions SET se_rounds = $2, se_status = 'fetched' WHERE se_seid = $1`, params: [seid, rounds] })

    } else {
      // ── MP session ──────────────────────────────────────────────────────────
      const ts6 = await getTs6BySourceId(sourceId) as any[]

      for (const r of ts6) {
        const pairNames: string = r.s6_pair_names
        const parts = pairNames.split(' - ')
        if (parts.length < 2) continue
        const [name1, name2] = [parts[0].trim(), parts.slice(1).join(' - ').trim()].sort()
        await table_query({
          caller: 'build/results/insert',
          query: `INSERT INTO ${RAW_TABLE} (rw_seid, rw_name1, rw_name2, rw_percentage, rw_vp) VALUES ($1, $2, $3, $4, NULL)`,
          params: [seid, name1, name2, r.s6_percentage]
        })
        pairsStored++
      }

      if (pairsStored === 0) {
        await table_query({ caller: 'build/results/status', query: `UPDATE tse_sessions SET se_status = 'no-pairs' WHERE se_seid = $1`, params: [seid] })
        return NextResponse.json({ sourceId, seid, pairs: 0, status: 'no-pairs' })
      }

      await table_query({ caller: 'build/results/status', query: `UPDATE tse_sessions SET se_status = 'fetched' WHERE se_seid = $1`, params: [seid] })
    }

    return NextResponse.json({ sourceId, seid, pairs: pairsStored, status: 'fetched' })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/build/results', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
