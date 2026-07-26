import { NextRequest, NextResponse } from 'next/server'
import { write_logging } from 'nextjs-shared/write_logging'
import { buildSessionsFromStaging } from '@/src/lib/actions/buildSteps'

async function run(fromDate?: string, toDate?: string, group?: string): Promise<NextResponse> {
  try {
    const groupValue = group === 'tracked' ? 'tracked' : 'akbc'
    const { inserted, skipped, total } = await buildSessionsFromStaging(false, fromDate, toDate, groupValue)
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/sessions-nzb', lg_msg: `Sessions: ${inserted} inserted, ${skipped} already existed`, lg_severity: 'I' })
    return NextResponse.json({ inserted, skipped, total })
  } catch (err) {
    await write_logging({ lg_functionname: 'run', lg_caller: 'build/sessions-nzb', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

function params(request: NextRequest): [string | undefined, string | undefined, string | undefined] {
  return [
    request.nextUrl.searchParams.get('from_date') ?? undefined,
    request.nextUrl.searchParams.get('to_date') ?? undefined,
    request.nextUrl.searchParams.get('group') ?? undefined,
  ]
}

export async function GET(request: NextRequest)  { return run(...params(request)) }
export async function POST(request: NextRequest) { return run(...params(request)) }
