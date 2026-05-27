import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function POST() {
  try {
    await table_query({
      caller: 'build/results-nzb/upsert-partners',
      query: `INSERT INTO tpa_partners (pa_plid1, pa_plid2)
              SELECT DISTINCT
                CASE WHEN p1.pl_name <= p2.pl_name THEN s2_plid1 ELSE s2_plid2 END,
                CASE WHEN p1.pl_name <= p2.pl_name THEN s2_plid2 ELSE s2_plid1 END
              FROM ts2_results
              JOIN tpl_players p1 ON p1.pl_plid = s2_plid1
              JOIN tpl_players p2 ON p2.pl_plid = s2_plid2
              JOIN tse_sessions ON se_run_id = s2_run_id
              WHERE NOT EXISTS (SELECT 1 FROM tre_results WHERE re_seid = se_seid)
              ON CONFLICT (pa_plid1, pa_plid2) DO NOTHING`,
      params: []
    })

    const result = await table_query({
      caller: 'build/results-nzb/insert',
      query: `INSERT INTO tre_results (re_seid, re_paid, re_percentage, re_vp)
              SELECT se_seid, pa_paid,
                CASE WHEN s1_score_type = 'VP' THEN NULL
                     ELSE GREATEST(25.0, LEAST(75.0, s2_score_value)) END,
                CASE WHEN s1_score_type = 'VP' THEN s2_score_value ELSE NULL END
              FROM ts2_results
              JOIN tse_sessions ON se_run_id = s2_run_id
              JOIN ts1_sessions ON s1_run_id = s2_run_id
              JOIN tpa_partners ON (pa_plid1 = s2_plid1 AND pa_plid2 = s2_plid2)
                                OR (pa_plid1 = s2_plid2 AND pa_plid2 = s2_plid1)
              WHERE NOT EXISTS (SELECT 1 FROM tre_results WHERE re_seid = se_seid)
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
