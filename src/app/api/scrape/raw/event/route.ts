import { NextRequest, NextResponse } from 'next/server'
import { scrapeEventPage } from '@/src/lib/scrape/akbc-raw'
import { clearTs5, insertTs5Rows } from '@/src/lib/actions/raw'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function POST(request: NextRequest) {
  const eventId = parseInt(request.nextUrl.searchParams.get('event_id') ?? '', 10)
  if (isNaN(eventId)) return NextResponse.json({ error: 'Missing event_id' }, { status: 400 })
  try {
    const rows = await scrapeEventPage(eventId)
    await clearTs5(eventId)
    await insertTs5Rows(rows)
    return NextResponse.json({ eventId, count: rows.length })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/event', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
