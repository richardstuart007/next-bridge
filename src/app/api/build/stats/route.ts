import { NextResponse } from 'next/server'
import { rebuildAllStats } from '@/src/lib/actions/stats'
import { cronStart, cronEnd, cronFail } from '@/src/lib/actions/cronTrace'

//
//  Hard Vercel per-invocation ceiling — rebuildAllStats' 8-group recompute needs the
//  headroom. Next.js route config must be a literal — keep in sync with
//  SCRAPE_MAX_DURATION_SECONDS in src/lib/constants.ts
//
export const maxDuration = 300

const ROUTE = 'build/stats'

//----------------------------------------------------------------------------------
//  run — runs rebuildAllStats() (player stats → pip_step 4 a–d, partner stats →
//  pip_step 5 a–d, under the day's current run_id), and returns the result as JSON
//  (500 with { error } on failure)
//----------------------------------------------------------------------------------
async function run(): Promise<NextResponse> {
  await cronStart(ROUTE)
  try {
    const result = await rebuildAllStats()
    await cronEnd(ROUTE, `${result.player_rows} player rows, ${result.partner_rows} partner rows`)
    return NextResponse.json(result)
  } catch (err) {
    await cronFail(ROUTE, err)
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
