import { NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { rebuildAllStats } from '@/src/lib/actions/stats'

//
//  Hard Vercel per-invocation ceiling — rebuildAllStats' 8-group recompute needs the
//  headroom too. Next.js route config must be a literal — keep in sync with
//  SCRAPE_MAX_DURATION_SECONDS in src/lib/constants.ts
//
export const maxDuration = 300

//----------------------------------------------------------------------------------
//  run — runs rebuildAllStats(), logs the player/partner row counts, and returns
//  the result as JSON (500 with { error } on failure)
//----------------------------------------------------------------------------------
async function run(): Promise<NextResponse> {
  try {
    const result = await rebuildAllStats()
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/stats', lg_msg: `${result.player_rows} player rows, ${result.partner_rows} partner rows`, lg_severity: 'I' })
    return NextResponse.json(result)
  } catch (err) {
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/stats', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

//----------------------------------------------------------------------------------
//  GET — runs the Update Stats step
//----------------------------------------------------------------------------------
export async function GET()  { return run() }

//----------------------------------------------------------------------------------
//  POST — manual-trigger equivalent of GET
//----------------------------------------------------------------------------------
export async function POST() { return run() }
