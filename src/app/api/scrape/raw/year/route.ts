import { NextRequest, NextResponse } from 'next/server'
import { scrapeYearPage } from '@/src/lib/scrape/akbc-raw'
import { getTs1ExistingEventIds, insertTs1Rows } from '@/src/lib/actions/raw'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function POST(request: NextRequest) {
  const year = parseInt(request.nextUrl.searchParams.get('year') ?? '', 10) || new Date().getFullYear()
  try {
    const rows = await scrapeYearPage(year)
    const existingIds = await getTs1ExistingEventIds(year)
    const newRows = rows.filter(r => r.eventId == null || !existingIds.has(r.eventId))
    await insertTs1Rows(newRows)
    return NextResponse.json({ year, count: rows.length, added: newRows.length })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/raw/year', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
