import { NextResponse } from 'next/server'
import { getTs3AllRows, getTs6AllPairNames, clearTs9, insertTs9Pairs } from '@/src/lib/actions/raw'
import { toTitleCase } from '@/src/lib/scrape/parseHtml'
import { write_Logging } from 'nextjs-shared/write_logging'

/**
 * POST /api/scrape/build/ts9
 *
 * Extracts every unique pair combination from ts3_team_members and ts6_session,
 * converts names to Title Case, stores alphabetically as (s9_name1, s9_name2).
 * Clears and rebuilds ts9_partners on each run.
 * Only reads/writes ts* tables.
 */
export async function POST() {
  try {
    const [ts3Rows, ts6Pairs] = await Promise.all([getTs3AllRows(), getTs6AllPairNames()])

    const pairSet = new Set<string>()
    const pairs: Array<{ name1: string; name2: string }> = []

    function addPair(raw1: string, raw2: string) {
      const n1 = toTitleCase(raw1.trim())
      const n2 = toTitleCase(raw2.trim())
      if (!n1 || !n2) return
      const [a, b] = [n1, n2].sort()
      const key = `${a}||${b}`
      if (!pairSet.has(key)) { pairSet.add(key); pairs.push({ name1: a, name2: b }) }
    }

    // ts3: team members stored as arrays — pairs are players[0]+[1] and [2]+[3]
    for (const row of ts3Rows) {
      const names = row.s3_player_names ?? []
      for (let i = 0; i + 1 < names.length; i += 2) addPair(names[i], names[i + 1])
    }

    // ts6: pair name strings like "NAME1 - NAME2"
    for (const { s6_pair_names } of ts6Pairs) {
      const dash = s6_pair_names.indexOf(' - ')
      if (dash === -1) continue
      addPair(s6_pair_names.slice(0, dash), s6_pair_names.slice(dash + 3))
    }

    await clearTs9()
    await insertTs9Pairs(pairs)

    return NextResponse.json({ pairs: pairs.length })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/build/ts9', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
