import { NextRequest, NextResponse } from 'next/server'
import { fetchSessionList } from '@/src/lib/scrape/akbc'
import { getImportedSourceIds, getSkippedSourceIds } from '@/src/lib/actions/sessions'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function GET(request: NextRequest) {
  const year = parseInt(request.nextUrl.searchParams.get('year') ?? String(new Date().getFullYear()), 10)

  try {
    const entries = await fetchSessionList(year)
    const sourceIds = entries.map(e => e.sourceId)
    const [importedIds, skippedIds] = await Promise.all([
      getImportedSourceIds(sourceIds),
      getSkippedSourceIds(sourceIds)
    ])

    const enriched = entries.map(entry => ({
      ...entry,
      alreadyImported: importedIds.has(entry.sourceId),
      isImp: skippedIds.has(entry.sourceId)
    }))

    return NextResponse.json({ sessions: enriched })
  } catch (err) {
    await write_Logging({ lg_functionname: 'GET', lg_caller: 'scrape/sessions', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
