import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const plid = parseInt(id, 10)
  if (isNaN(plid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: { all_results?: boolean }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.all_results !== 'boolean') {
    return NextResponse.json({ error: 'all_results boolean required' }, { status: 400 })
  }

  try {
    await table_query({
      caller: 'admin/players/all-results',
      query: `UPDATE tpl_players SET pl_tracked = $1 WHERE pl_plid = $2`,
      params: [body.all_results, plid]
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
