import { NextResponse } from 'next/server'
import { getTs3AllPlayerNames, getTs6AllPairNames, upsertTs7Names } from '@/src/lib/actions/raw'
import { toTitleCase } from '@/src/lib/scrape/parseHtml'
import { write_Logging } from 'nextjs-shared/write_logging'

/**
 * POST /api/scrape/build/ts7
 *
 * Extracts every unique player name from ts3_team_members and ts6_session,
 * converts to Title Case, and upserts into ts7_nz_players.
 * Existing rows (with NZ numbers already found) are preserved unchanged.
 * Only reads/writes ts* tables.
 */
export async function POST() {
  try {
    const [ts3Names, ts6Pairs] = await Promise.all([
      getTs3AllPlayerNames(),
      getTs6AllPairNames(),
    ])

    const names = new Set<string>()

    for (const { name } of ts3Names) {
      const n = toTitleCase(name.trim())
      if (n) names.add(n)
    }

    for (const { s6_pair_names } of ts6Pairs) {
      const parts = s6_pair_names.split(' - ')
      for (const part of parts) {
        const n = toTitleCase(part.trim())
        if (n) names.add(n)
      }
    }

    const nameList = Array.from(names)
    await upsertTs7Names(nameList)

    return NextResponse.json({ inserted: nameList.length })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/build/ts7', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
