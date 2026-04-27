import { NextRequest, NextResponse } from 'next/server'
import { scrapeSession } from '@/src/lib/scrape/akbc-raw'
import { clearTs6, insertTs6Rows } from '@/src/lib/actions/raw'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function POST(request: NextRequest) {
  const sourceId = parseInt(request.nextUrl.searchParams.get('source_id') ?? '', 10)
  const eventId  = parseInt(request.nextUrl.searchParams.get('event_id')  ?? '0', 10) || 0
  if (isNaN(sourceId)) return NextResponse.json({ error: 'Missing source_id' }, { status: 400 })
  try {
    const rows = await scrapeSession(sourceId, eventId)
    await clearTs6(sourceId)
    await insertTs6Rows(rows)
    return NextResponse.json({ sourceId, count: rows.length })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/session', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
