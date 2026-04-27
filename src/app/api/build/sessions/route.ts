import { NextRequest, NextResponse } from 'next/server'
import { getTs1ByYear, getTs5ByEventId } from '@/src/lib/actions/raw'
import { upsertSessionHeaders, upsertCatalogueSessions } from '@/src/lib/actions/sessions'
import { write_Logging } from 'nextjs-shared/write_logging'

/**
 * POST /api/scrape/build/sessions?year=Y
 *
 * Reads ts1_main + ts5_event_sessions for the given year and writes:
 *   tsh_session_header  (one row per headevent entry)
 *   tse_sessions        (one row per individual session)
 *
 * Safe to re-run: upsertSessionHeaders and upsertCatalogueSessions skip existing rows.
 */
export async function POST(request: NextRequest) {
  const year = parseInt(request.nextUrl.searchParams.get('year') ?? '', 10) || new Date().getFullYear()
  try {
    const ts1Rows = await getTs1ByYear(year) as any[]
    if (ts1Rows.length === 0) return NextResponse.json({ error: `No ts1_main rows for year ${year}` }, { status: 404 })

    // Build session headers from headevent and direct-link entries
    const headerInputs = ts1Rows
      .filter((r: any) => r.s1_event_id !== null)
      .map((r: any) => ({
        headeventId: r.s1_event_id as number,
        label: r.s1_event_name as string,
        date: r.s1_date ? String(r.s1_date).slice(0, 10) : '',
        year
      }))

    const headerMap = await upsertSessionHeaders(headerInputs)

    // For headevent entries: fetch ts5 rows and build session list
    const headeventRows = ts1Rows.filter((r: any) => r.s1_type === 'headevent')
    const sessions: Array<{ sourceId: number; label: string; date: string; dayOfWeek: string; isTeams?: boolean; headeventId: number }> = []

    for (const h of headeventRows) {
      const ts5 = await getTs5ByEventId(h.s1_event_id) as any[]
      for (const s of ts5) {
        if (!s.s5_source_id) continue
        if (s.s5_type === 'multisession') continue
        sessions.push({
          sourceId: s.s5_source_id as number,
          label: s.s5_session_name as string,
          date: s.s5_date ? String(s.s5_date).slice(0, 10) : '',
          dayOfWeek: 'Unknown',
          isTeams: s.s5_type === null,  // ts5 has no teams sessions; those come via direct links
          headeventId: h.s1_event_id as number
        })
      }
    }

    // For direct teamresults / resultsbm links: create a session entry directly
    const directRows = ts1Rows.filter((r: any) => r.s1_type === 'teamresults' || r.s1_type === 'resultsbm')
    for (const r of directRows) {
      sessions.push({
        sourceId: r.s1_event_id as number,
        label: r.s1_event_name as string,
        date: r.s1_date ? String(r.s1_date).slice(0, 10) : '',
        dayOfWeek: 'Unknown',
        isTeams: r.s1_type === 'teamresults',
        headeventId: r.s1_event_id as number
      })
    }

    const added = await upsertCatalogueSessions(sessions, headerMap)

    return NextResponse.json({ year, headers: headerMap.size, sessions: sessions.length, added })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/build/sessions', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
