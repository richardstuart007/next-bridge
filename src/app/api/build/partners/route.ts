import { NextResponse } from 'next/server'
import { buildAllPartnerStats } from '@/src/lib/actions/players'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function POST() {
  try {
    const { pairs } = await buildAllPartnerStats()
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/partners', lg_msg: `${pairs} pairs`, lg_severity: 'I' })
    return NextResponse.json({ pairs })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'build/partners', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
