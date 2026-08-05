import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const seId = parseInt(id, 10)

  if (isNaN(seId)) {
    return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })
  }

  try {
    const rows = await table_query({
      caller: 'sessions/[id]/results',
      query: `
        WITH ranked AS (
          SELECT
            re_score,
            pa_plid1,
            pa_plid2,
            p1.pl_name       AS pl_name1,
            p2.pl_name       AS pl_name2,
            COALESCE(p1.pl_nz_bridge_number, 0) AS pl_nz_bridge_number1,
            COALESCE(p2.pl_nz_bridge_number, 0) AS pl_nz_bridge_number2,
            CASE WHEN COALESCE(p1.pl_nz_bridge_number, 0) = 0 THEN 2147483647
                 ELSE p1.pl_nz_bridge_number END AS sort1,
            CASE WHEN COALESCE(p2.pl_nz_bridge_number, 0) = 0 THEN 2147483647
                 ELSE p2.pl_nz_bridge_number END AS sort2
          FROM tre_results
          JOIN tpa_partners ON pa_paid = re_paid
          JOIN tpl_players p1 ON p1.pl_plid = pa_plid1
          JOIN tpl_players p2 ON p2.pl_plid = pa_plid2
          WHERE re_seid = $1
        )
        SELECT
          re_score,
          CASE WHEN sort1 <= sort2 THEN pa_plid1 ELSE pa_plid2 END AS plid,
          CASE WHEN sort1 <= sort2 THEN pl_name1 ELSE pl_name2 END AS pl_name,
          CASE WHEN sort1 <= sort2 THEN pl_nz_bridge_number1 ELSE pl_nz_bridge_number2 END AS pl_nz_bridge_number,
          CASE WHEN sort1 <= sort2 THEN pa_plid2 ELSE pa_plid1 END AS partner_plid,
          CASE WHEN sort1 <= sort2 THEN pl_name2 ELSE pl_name1 END AS partner_name,
          CASE WHEN sort1 <= sort2 THEN pl_nz_bridge_number2 ELSE pl_nz_bridge_number1 END AS partner_nz_bridge_number
        FROM ranked
        ORDER BY re_score DESC NULLS LAST
      `,
      params: [seId]
    })

    return NextResponse.json(rows)
  } catch (err) {
    await write_logging({ lg_functionname: 'GET', lg_caller: 'sessions/[id]/results', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
