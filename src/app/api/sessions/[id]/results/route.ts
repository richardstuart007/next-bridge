import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

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
    // Each pair is stored twice (one row per player). Deduplicate with
    // re_pl_id < re_partner_pl_id, then order players within the pair by
    // NZ bridge number so the display is consistent regardless of import order.
    // Sort players within each pair by NZ number (0 = no number, sorts last)
    const rows = await table_query({
      caller: 'sessions/[id]/results',
      query: `
        WITH ranked AS (
          SELECT
            re.re_percentage,
            re.re_imp_score,
            re.re_plid,
            re.re_partner_plid,
            p1.pl_name          AS name1,
            p2.pl_name          AS name2,
            COALESCE(p1.pl_nz_bridge_number, 0) AS nz1,
            COALESCE(p2.pl_nz_bridge_number, 0) AS nz2,
            CASE WHEN COALESCE(p1.pl_nz_bridge_number, 0) = 0 THEN 2147483647
                 ELSE p1.pl_nz_bridge_number END AS sort1,
            CASE WHEN COALESCE(p2.pl_nz_bridge_number, 0) = 0 THEN 2147483647
                 ELSE p2.pl_nz_bridge_number END AS sort2
          FROM tre_results re
          JOIN tpl_players p1 ON p1.pl_plid = re.re_plid
          JOIN tpl_players p2 ON p2.pl_plid = re.re_partner_plid
          WHERE re.re_seid = $1
            AND re.re_plid < re.re_partner_plid
        )
        SELECT
          re_percentage      AS percentage,
          re_imp_score       AS imp_score,
          CASE WHEN sort1 <= sort2 THEN re_plid         ELSE re_partner_plid END AS pl_id,
          CASE WHEN sort1 <= sort2 THEN name1           ELSE name2           END AS player_name,
          CASE WHEN sort1 <= sort2 THEN nz1             ELSE nz2             END AS player_nz_number,
          CASE WHEN sort1 <= sort2 THEN re_partner_plid ELSE re_plid         END AS partner_pl_id,
          CASE WHEN sort1 <= sort2 THEN name2           ELSE name1           END AS partner_name,
          CASE WHEN sort1 <= sort2 THEN nz2             ELSE nz1             END AS partner_nz_number
        FROM ranked
        ORDER BY COALESCE(re_imp_score, re_percentage) DESC
      `,
      params: [seId]
    })

    return NextResponse.json(rows)
  } catch (err) {
    await write_Logging({ lg_functionname: 'GET', lg_caller: 'sessions/[id]/results', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
