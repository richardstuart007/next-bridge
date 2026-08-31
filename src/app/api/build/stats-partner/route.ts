import { NextResponse } from 'next/server'
import { rebuildPartnerStats } from '@/src/lib/actions/stats'
import { cronStart, cronEnd, cronFail } from '@/src/lib/actions/cronTrace'

//
//  Hard Vercel per-invocation ceiling — the 4-group partner recompute needs the
//  headroom. Next.js route config must be a literal — keep in sync with
//  SCRAPE_MAX_DURATION_SECONDS in src/lib/constants.ts
//
export const maxDuration = 300

const ROUTE = 'build/stats-partner'

//----------------------------------------------------------------------------------
//  run — runs rebuildPartnerStats() (pip_step 5 a–d, under the day's current run_id)
//  and returns the result as JSON (500 with { error } on failure)
//----------------------------------------------------------------------------------
async function run(): Promise<NextResponse> {
  await cronStart(ROUTE)
  try {
    const result = await rebuildPartnerStats()
    await cronEnd(ROUTE, `${result.partner_rows} partner rows`)
    return NextResponse.json(result)
  } catch (err) {
    await cronFail(ROUTE, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

//----------------------------------------------------------------------------------
//  GET — runs the Partner Stats step
//----------------------------------------------------------------------------------
export async function GET()  { return run() }

//----------------------------------------------------------------------------------
//  POST — manual-trigger equivalent of GET
//----------------------------------------------------------------------------------
export async function POST() { return run() }
