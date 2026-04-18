import { NextRequest, NextResponse } from 'next/server'
import { lookupPlayer } from '@/src/lib/scrape/nzbridge'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name')

  if (!name) {
    return NextResponse.json({ error: 'Missing name parameter' }, { status: 400 })
  }

  try {
    const player = await lookupPlayer(name)

    if (!player) {
      return NextResponse.json({ error: `Player "${name}" not found on nzbridge.co.nz` }, { status: 404 })
    }

    return NextResponse.json(player)
  } catch (err) {
    await write_Logging({ lg_functionname: 'GET', lg_caller: 'players/lookup', lg_msg: String(err), lg_severity: 'W' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
