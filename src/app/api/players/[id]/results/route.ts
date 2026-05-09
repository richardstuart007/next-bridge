import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const plId = parseInt(id, 10)

  if (isNaN(plId)) {
    return NextResponse.json({ error: 'Invalid player ID' }, { status: 400 })
  }

  const sessionType = request.nextUrl.searchParams.get('session_type')
  const dayOfWeek = request.nextUrl.searchParams.get('day_of_week')
  const partnerIdStr = request.nextUrl.searchParams.get('partner_id')
  const partnerId = partnerIdStr ? parseInt(partnerIdStr, 10) : null

  try {
    let query = `
      SELECT
        se.se_seid          AS session_id,
        se.se_source_id     AS source_id,
        se.se_date          AS date,
        se.se_day_of_week   AS day_of_week,
        se.se_scoring       AS scoring,
        se.se_session_type  AS session_type,
        se.se_name          AS session_name,
        se.se_club          AS club,
        se.se_tournament    AS tournament,
        se.se_event_type    AS event_type,
        re.re_percentage    AS percentage,
        re.re_vp            AS vp,
        re.re_plid2         AS partner_id,
        p.pl_name           AS partner_name,
        p.pl_all_results    AS partner_tracked
      FROM tre_results re
      JOIN tse_sessions se ON se.se_seid = re.re_seid
      LEFT JOIN tpl_players p ON p.pl_plid = re.re_plid2
      WHERE re.re_plid1 = $1
    `
    const queryParams: (string | number)[] = [plId]
    let paramIndex = 2

    if (sessionType) {
      query += ` AND se.se_session_type = $${paramIndex++}`
      queryParams.push(sessionType)
    }
    if (dayOfWeek) {
      query += ` AND se.se_day_of_week = $${paramIndex++}`
      queryParams.push(dayOfWeek)
    }
    if (partnerId !== null && !isNaN(partnerId)) {
      query += ` AND re.re_plid2 = $${paramIndex++}`
      queryParams.push(partnerId)
    }

    query += ' ORDER BY se.se_date ASC'

    const rows = await table_query({ caller: 'players/[id]/results', query, params: queryParams })

    return NextResponse.json(rows)
  } catch (err) {
    await write_Logging({ lg_functionname: 'GET', lg_caller: 'players/[id]/results', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
