import { NextResponse } from 'next/server'
import { rebuildPlayerStats } from '@/src/lib/actions/stats'
import { cronStart, cronEnd, cronFail } from '@/src/lib/actions/cronTrace'

//
//  Hard Vercel per-invocation ceiling — the 4-group player recompute needs the
//  headroom. Next.js route config must be a literal — keep in sync with
//  SCRAPE_MAX_DURATION_SECONDS in src/lib/constants.ts
//
export const maxDuration = 300

const ROUTE = 'build/stats-player'

//----------------------------------------------------------------------------------
//  run — runs rebuildPlayerStats() (pip_step 4 a–d, under the day's current run_id)
//  and returns the result as JSON (500 with { error } on failure)
//----------------------------------------------------------------------------------
async function run(): Promise<NextResponse> {
  await cronStart(ROUTE)
  try {
    const result = await rebuildPlayerStats()
    await cronEnd(ROUTE, `${result.player_rows} player rows`)
    return NextResponse.json(result)
  } catch (err) {
    await cronFail(ROUTE, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

//----------------------------------------------------------------------------------
//  GET — runs the Player Stats step
//----------------------------------------------------------------------------------
export async function GET()  { return run() }

//----------------------------------------------------------------------------------
//  POST — manual-trigger equivalent of GET
//----------------------------------------------------------------------------------
export async function POST() { return run() }
