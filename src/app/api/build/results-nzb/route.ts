import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function POST() {
  try {
    const result = await table_query({
      caller: 'build/results-nzb/insert',
      query: `INSERT INTO tre_results (re_seid, re_plid1, re_plid2, re_percentage, re_vp)
              SELECT * FROM (
                SELECT s.se_seid, t.s9_plid1, t.s9_plid2,
                  CASE WHEN t.s9_score_type = 'VP'
                       THEN 0
                       ELSE GREATEST(25.0, LEAST(75.0, t.s9_score_value)) END,
                  CASE WHEN t.s9_score_type = 'VP' THEN t.s9_score_value ELSE NULL END
                FROM ts9_nzb_results t
                JOIN tse_sessions s ON s.se_source_id = t.s9_run_id
                WHERE NOT EXISTS (SELECT 1 FROM tre_results re WHERE re.re_seid = s.se_seid)
                UNION ALL
                SELECT s.se_seid, t.s9_plid2, t.s9_plid1,
                  CASE WHEN t.s9_score_type = 'VP'
                       THEN 0
                       ELSE GREATEST(25.0, LEAST(75.0, t.s9_score_value)) END,
                  CASE WHEN t.s9_score_type = 'VP' THEN t.s9_score_value ELSE NULL END
                FROM ts9_nzb_results t
                JOIN tse_sessions s ON s.se_source_id = t.s9_run_id
                WHERE NOT EXISTS (SELECT 1 FROM tre_results re WHERE re.re_seid = s.se_seid)
              ) combined
              RETURNING re_reid`,
      params: []
    }) as { re_reid: number }[]

    const inserted = result.length
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/results-nzb', lg_msg: `Inserted ${inserted} result rows`, lg_severity: 'I' })
    return NextResponse.json({ inserted })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/results-nzb', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
