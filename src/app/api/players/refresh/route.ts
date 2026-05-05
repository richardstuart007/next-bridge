import { NextRequest, NextResponse } from 'next/server'
import { getPlayerCounts } from '@/src/lib/actions/players'
import { getTs7FoundWithStats } from '@/src/lib/actions/raw'
import { upsertPlayer } from '@/src/lib/actions/players'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function GET(_request: NextRequest) {
  try {
    const counts = await getPlayerCounts()
    return NextResponse.json(counts)
  } catch (err) {
    await write_Logging({ lg_functionname: 'GET', lg_caller: 'players/refresh', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(_request: NextRequest) {
  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const send = async (data: object) => writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    try {
      const rows = (await getTs7FoundWithStats()) as any[]
      const found = rows
      const total = rows.length
      let updated = 0; let failed = 0
      const warnings: string[] = []

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        if (r.s7_status !== 'found') {
          warnings.push(`Could not refresh: ${r.s7_name} (NZ# ${r.s7_nz_number})`)
          failed++
        } else {
          await upsertPlayer({ nz_bridge_number: r.s7_nz_number, name: r.s7_name, club: r.s7_club, rank: r.s7_rank, grade: r.s7_grade, rating: Number(r.s7_rating), a_points: Number(r.s7_a_points), b_points: Number(r.s7_b_points), c_points: Number(r.s7_c_points) })
          updated++
        }
        await send({ processed: i + 1, total, updated, failed })
      }

      await send({ done: true, updated, failed, warnings })
    } catch (err) {
      await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/refresh', lg_msg: String(err), lg_severity: 'E' })
      await send({ error: String(err) })
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
}
