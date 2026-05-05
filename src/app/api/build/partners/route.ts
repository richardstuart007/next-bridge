import { NextResponse } from 'next/server'
import { updateAllPartnerStats } from '@/src/lib/actions/players'
import { write_Logging } from 'nextjs-shared/write_logging'

/**
 * POST /api/build/partners
 *
 * Recomputes tpa_partners from tre_results.
 */
export async function POST() {
  try {
    const partnerCount = await updateAllPartnerStats()

    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/partners', lg_msg: `Partners: ${partnerCount} pairs`, lg_severity: 'I' })
    return NextResponse.json({ partnerships: partnerCount })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/partners', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
