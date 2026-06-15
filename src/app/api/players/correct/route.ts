import { NextRequest, NextResponse } from 'next/server'
import { searchAllPlayers, upsertPlayer } from '@/src/lib/actions/players'
import { lookupPlayerByNumber } from '@/src/lib/scrape/nzbridge'
import { write_logging } from 'nextjs-shared/write_logging'

/**
 * GET /api/players/correct?q=name
 * Search all local players by name fragment (includes those with nz_number = 0).
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? ''
  if (q.length < 2) return NextResponse.json([])
  try {
    const rows = await searchAllPlayers(q)
    return NextResponse.json(rows)
  } catch (err) {
    await write_logging({ lg_functionname: 'GET', lg_caller: 'players/correct', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * POST /api/players/correct
 * Body: { pl_name: string, nz_number: number }
 * Fetches full stats from nzbridge.co.nz by nz_number, upserts the player record.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pl_name, nz_number } = body as { pl_name: string; nz_number: number }

    if (!pl_name || !nz_number) {
      return NextResponse.json({ error: 'Missing required fields: pl_name, nz_number' }, { status: 400 })
    }

    const player = await lookupPlayerByNumber(nz_number)
    if (!player) {
      return NextResponse.json({ error: `No player found on nzbridge.co.nz for NZ# ${nz_number}` }, { status: 404 })
    }

    // Override the name with the local DB name so the upsert matches by name
    await upsertPlayer({ ...player, name: pl_name })

    await write_logging({
      lg_functionname: 'POST',
      lg_caller: 'players/correct',
      lg_msg: `Corrected "${pl_name}" â†’ NZ# ${nz_number} (${player.name})`,
      lg_severity: 'I'
    })

    return NextResponse.json({ corrected: pl_name, nz_number, nz_name: player.name })
  } catch (err) {
    await write_logging({ lg_functionname: 'POST', lg_caller: 'players/correct', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
