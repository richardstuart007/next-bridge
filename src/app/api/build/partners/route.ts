import { NextResponse } from 'next/server'
import { updateIncrementalPartnerStats } from '@/src/lib/actions/players'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function POST() {
  try {
    const { sessions, pairs } = await updateIncrementalPartnerStats()
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/partners', lg_msg: `${sessions} sessions · ${pairs} pairs updated`, lg_severity: 'I' })
    return NextResponse.json({ sessions, pairs })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/partners', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
