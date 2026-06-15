import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

export async function POST() {
  try {
    await table_query({
      caller: 'build/results-nzb/upsert-partners',
      query: `INSERT INTO tpa_partners (pa_plid1, pa_plid2)
              SELECT DISTINCT s2_plid1, s2_plid2
              FROM ts2_results
              JOIN tse_sessions ON se_run_id = s2_run_id
              WHERE NOT EXISTS (SELECT 1 FROM tre_results WHERE re_seid = se_seid)
              ON CONFLICT (pa_plid1, pa_plid2) DO NOTHING`,
      params: []
    })

    const result = await table_query({
      caller: 'build/results-nzb/insert',
      query: `INSERT INTO tre_results (re_seid, re_paid, re_percentage, re_vp)
              SELECT DISTINCT ON (se_seid, pa_paid) se_seid, pa_paid,
                CASE WHEN s1_score_type = 'VP' THEN NULL ELSE LEAST(999.0, GREATEST(25.0, LEAST(75.0, s2_score_value))) END,
                CASE WHEN s1_score_type = 'VP' THEN LEAST(999.0, s2_score_value) ELSE NULL END
              FROM ts2_results
              JOIN tse_sessions ON se_run_id = s2_run_id
              JOIN ts1_sessions ON s1_run_id = s2_run_id
              JOIN tpa_partners ON pa_plid1 = s2_plid1 AND pa_plid2 = s2_plid2
              WHERE NOT EXISTS (SELECT 1 FROM tre_results WHERE re_seid = se_seid)
              RETURNING re_reid`,
      params: []
    }) as { re_reid: number }[]

    const inserted = result.length
    await write_logging({ lg_functionname: 'POST', lg_caller: 'build/results-nzb', lg_msg: `Inserted ${inserted} result rows`, lg_severity: 'I' })
    return NextResponse.json({ inserted })
  } catch (err) {
    await write_logging({ lg_functionname: 'POST', lg_caller: 'build/results-nzb', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
