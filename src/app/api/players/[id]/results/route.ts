import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const plId = parseInt(id, 10)

  if (isNaN(plId)) {
    return NextResponse.json({ error: 'Invalid player ID' }, { status: 400 })
  }

  const dayOfWeek = request.nextUrl.searchParams.get('day_of_week')
  const partnerIdStr = request.nextUrl.searchParams.get('partner_id')
  const partnerId = partnerIdStr ? parseInt(partnerIdStr, 10) : null

  try {
    let query = `
      SELECT
        se_seid          AS session_id,
        se_run_id        AS run_id,
        se_date::text    AS date,
        se_day_of_week   AS day_of_week,
        se_scoring       AS scoring,
        se_name          AS session_name,
        se_club          AS club,
        se_tournament    AS tournament,
        se_event_type    AS event_type,
        se_is_summary    AS is_summary,
        CASE WHEN se_scoring = 'MP' THEN re_score END AS percentage,
        CASE WHEN se_scoring = 'VP' THEN re_score END AS vp,
        CASE WHEN se_scoring = 'XIMP' THEN re_score END AS ximp,
        CASE WHEN pa_plid1 = $1 THEN pa_plid2 ELSE pa_plid1 END AS partner_id,
        pl_name          AS partner_name,
        pl_nzb AS partner_nzb,
        pl_tracked   AS partner_tracked
      FROM tre_results
      JOIN tse_sessions ON se_seid = re_seid
      JOIN tpa_partners ON pa_paid = re_paid
      LEFT JOIN tpl_players ON pl_plid =
        CASE WHEN pa_plid1 = $1 THEN pa_plid2 ELSE pa_plid1 END
      WHERE (pa_plid1 = $1 OR pa_plid2 = $1)
    `
    const queryParams: (string | number)[] = [plId]
    let paramIndex = 2

    if (dayOfWeek) {
      query += ` AND se_day_of_week = $${paramIndex++}`
      queryParams.push(dayOfWeek)
    }
    if (partnerId !== null && !isNaN(partnerId)) {
      query += ` AND (pa_plid1 = $${paramIndex} OR pa_plid2 = $${paramIndex})`
      paramIndex++
      queryParams.push(partnerId)
    }

    query += ' ORDER BY se_run_id DESC'

    const rows = await table_query({ caller: 'players/[id]/results', query, params: queryParams })

    return NextResponse.json(rows)
  } catch (err) {
    await write_logging({ lg_functionname: 'GET', lg_caller: 'players/[id]/results', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
