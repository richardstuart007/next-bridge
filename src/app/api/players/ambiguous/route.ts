import { NextRequest, NextResponse } from 'next/server'
import { upsertPlayer } from '@/src/lib/actions/players'
import { lookupPlayerByNumber } from '@/src/lib/scrape/nzbridge'
import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_delete } from 'nextjs-shared/table_delete'
import { write_Logging } from 'nextjs-shared/write_logging'

const AMBIGUOUS_TABLE = 'tam_players_ambiguous'

/**
 * GET /api/players/ambiguous
 * Returns all rows from tam_players_ambiguous ordered by search name.
 */
export async function GET() {
  try {
    const rows = await table_fetch({
      caller: 'players/ambiguous GET',
      table: AMBIGUOUS_TABLE,
      orderBy: 'am_search_name ASC, am_nz_number ASC'
    })
    return NextResponse.json(rows)
  } catch (err) {
    await write_Logging({ lg_functionname: 'GET', lg_caller: 'players/ambiguous', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * POST /api/players/ambiguous
 * Body: { search_name: string, nz_number: number }
 * Fetches full stats from nzbridge.co.nz by NZ number, upserts the player,
 * then deletes all tam_players_ambiguous rows for that search_name.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { search_name, nz_number } = body

    if (!search_name || !nz_number) {
      return NextResponse.json({ error: 'Missing required fields: search_name, nz_number' }, { status: 400 })
    }

    // Fetch full stats from nzbridge.co.nz by NZ number
    const player = await lookupPlayerByNumber(nz_number)
    if (!player) {
      return NextResponse.json({ error: `No player found on nzbridge.co.nz for NZ number ${nz_number}` }, { status: 404 })
    }

    await upsertPlayer(player)

    // Remove all ambiguous rows for this search name
    await table_delete({
      caller: 'players/ambiguous POST',
      table: AMBIGUOUS_TABLE,
      whereColumnValuePairs: [{ column: 'am_search_name', value: search_name }]
    })

    await write_Logging({
      lg_functionname: 'POST',
      lg_caller: 'players/ambiguous',
      lg_msg: `Assigned "${search_name}" → NZ# ${nz_number} (${player.name})`,
      lg_severity: 'I'
    })

    return NextResponse.json({ assigned: player.name, nz_number })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/ambiguous', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
