import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'
import { populateRanks, populateClubs, populateGrades } from '@/src/lib/actions/lookup'

/**
 * POST /api/build/players
 *
 * Clears tpl_players and rebuilds from ts7_nz_players (status='found') in a
 * single INSERT. Also rebuilds trk_ranks, tcl_clubs, tgr_grades.
 */
export async function POST() {
  try {
    await table_query({ caller: 'build/players/clear', query: `DELETE FROM tpl_players`, params: [] })

    const result = await table_query({
      caller: 'build/players/insert',
      query: `INSERT INTO tpl_players
                (pl_nz_bridge_number, pl_name, pl_club, pl_rank, pl_grade,
                 pl_rating, pl_a_points, pl_b_points, pl_c_points)
              SELECT s7_nz_number, s7_name, s7_club, s7_rank, s7_grade,
                     s7_rating, s7_a_points, s7_b_points, s7_c_points
              FROM ts7_nz_players
              WHERE s7_status = 'found' AND s7_nz_number IS NOT NULL
              RETURNING pl_plid`,
      params: []
    }) as { pl_plid: number }[]

    await table_query({ caller: 'build/players/clear-ranks',  query: `DELETE FROM trk_ranks`,  params: [] })
    await table_query({ caller: 'build/players/clear-clubs',  query: `DELETE FROM tcl_clubs`,  params: [] })
    await table_query({ caller: 'build/players/clear-grades', query: `DELETE FROM tgr_grades`, params: [] })
    await populateRanks()
    await populateClubs()
    await populateGrades()

    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/players', lg_msg: `Inserted ${result.length} players from ts7`, lg_severity: 'I' })
    return NextResponse.json({ count: result.length })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/players', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
