import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

/**
 * POST /api/build/results-nz
 *
 * Clears existing NZ Bridge tre_results then inserts two rows per ts8 pair
 * (one per player) using a single SQL JOIN — no row-by-row loop.
 *
 * Pairs where either NZ number has no matching player are silently skipped.
 */
export async function POST() {
  try {
    await table_query({
      caller: 'build/results-nz/clear',
      query: `DELETE FROM tre_results`,
      params: []
    })

    // Insert both directions (plid1→plid2 and plid2→plid1) in a single statement.
    // VP scores are converted to a percentage (35% + VP/20 * 30%) so re_percentage is
    // always on a 0–100 scale. The raw VP is preserved in re_vp. Rows with unknown
    // score type (neither PCT nor VP) are excluded.
    const result = await table_query({
      caller: 'build/results-nz/insert',
      query: `INSERT INTO tre_results (re_seid, re_plid1, re_plid2, re_percentage, re_vp)
              SELECT * FROM (
                SELECT s.se_seid, p1.pl_plid, p2.pl_plid,
                  CASE WHEN t.s8_score_type = 'VP'
                       THEN 35 + (t.s8_score_value / 20 * 30)
                       ELSE t.s8_score_value
                  END,
                  CASE WHEN t.s8_score_type = 'VP' THEN t.s8_score_value ELSE NULL END
                FROM ts8_nz_results t
                JOIN tse_sessions  s  ON s.se_source_id         = t.s8_run_id
                JOIN tpl_players   p1 ON p1.pl_nz_bridge_number = t.s8_nz_number1
                JOIN tpl_players   p2 ON p2.pl_nz_bridge_number = t.s8_nz_number2
                WHERE t.s8_score_type IN ('PCT', 'VP')
                UNION ALL
                SELECT s.se_seid, p2.pl_plid, p1.pl_plid,
                  CASE WHEN t.s8_score_type = 'VP'
                       THEN 35 + (t.s8_score_value / 20 * 30)
                       ELSE t.s8_score_value
                  END,
                  CASE WHEN t.s8_score_type = 'VP' THEN t.s8_score_value ELSE NULL END
                FROM ts8_nz_results t
                JOIN tse_sessions  s  ON s.se_source_id         = t.s8_run_id
                JOIN tpl_players   p1 ON p1.pl_nz_bridge_number = t.s8_nz_number1
                JOIN tpl_players   p2 ON p2.pl_nz_bridge_number = t.s8_nz_number2
                WHERE t.s8_score_type IN ('PCT', 'VP')
              ) combined
              RETURNING re_reid`,
      params: []
    }) as { re_reid: number }[]

    const ts8Total = await table_query({
      caller: 'build/results-nz/count',
      query: `SELECT COUNT(*)::int AS n FROM ts8_nz_results`,
      params: []
    }) as { n: number }[]

    const inserted = result.length
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/results-nz', lg_msg: `Inserted ${inserted} result rows from ${ts8Total[0]?.n ?? 0} ts8 pairs`, lg_severity: 'I' })
    return NextResponse.json({ inserted, ts8_pairs: ts8Total[0]?.n ?? 0 })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/results-nz', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
