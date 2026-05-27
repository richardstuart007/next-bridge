import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function POST() {
  try {
    await table_query({
      caller: 'build/results-nzb/upsert-partners',
      query: `INSERT INTO tpa_partners (pa_plid1, pa_plid2)
              SELECT DISTINCT
                CASE WHEN p1.pl_name <= p2.pl_name THEN t.s2_plid1 ELSE t.s2_plid2 END,
                CASE WHEN p1.pl_name <= p2.pl_name THEN t.s2_plid2 ELSE t.s2_plid1 END
              FROM ts2_results t
              JOIN tpl_players p1 ON p1.pl_plid = t.s2_plid1
              JOIN tpl_players p2 ON p2.pl_plid = t.s2_plid2
              JOIN tse_sessions s ON s.se_run_id = t.s2_run_id
              WHERE NOT EXISTS (SELECT 1 FROM tre_results re WHERE re.re_seid = s.se_seid)
              ON CONFLICT (pa_plid1, pa_plid2) DO NOTHING`,
      params: []
    })

    const result = await table_query({
      caller: 'build/results-nzb/insert',
      query: `INSERT INTO tre_results (re_seid, re_paid, re_percentage, re_vp)
              SELECT s.se_seid, pa.pa_paid,
                CASE WHEN s1.s1_score_type = 'VP' THEN NULL
                     ELSE GREATEST(25.0, LEAST(75.0, t.s2_score_value)) END,
                CASE WHEN s1.s1_score_type = 'VP' THEN t.s2_score_value ELSE NULL END
              FROM ts2_results t
              JOIN tse_sessions  s  ON s.se_run_id  = t.s2_run_id
              JOIN ts1_sessions  s1 ON s1.s1_run_id = t.s2_run_id
              JOIN tpa_partners  pa ON (pa.pa_plid1 = t.s2_plid1 AND pa.pa_plid2 = t.s2_plid2)
                                    OR (pa.pa_plid1 = t.s2_plid2 AND pa.pa_plid2 = t.s2_plid1)
              WHERE NOT EXISTS (SELECT 1 FROM tre_results re WHERE re.re_seid = s.se_seid)
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
