import { NextRequest, NextResponse } from 'next/server'
import { getAllPlayers, getPlayersWithoutNzNumber, getPlayerCounts, getPlayerByNzNumber, upsertPlayer } from '@/src/lib/actions/players'
import { lookupPlayer, lookupPlayerByNumber, lookupPlayerCandidates } from '@/src/lib/scrape/nzbridge'
import { table_update } from 'nextjs-shared/table_update'
import { table_write } from 'nextjs-shared/table_write'
import { write_Logging } from 'nextjs-shared/write_logging'
import type { ParsedPlayer } from '@/src/lib/scrape/parseHtml'

const AUCKLAND_CLUBS = [
  'akarana', 'auckland', 'dargaville', 'east coast bays', 'franklin',
  'hibiscus', 'howick', 'kerikeri', 'mangawhai', 'mount albert',
  'north shore', 'orewa', 'paihia', 'papakura', 'papatoetoe',
  'royle epsom', 'waiheke', 'waitemata', 'warkworth', 'whangarei'
]

function isAucklandClub(club: string): boolean {
  const lower = club.toLowerCase()
  return AUCKLAND_CLUBS.some(ac => lower.includes(ac))
}

function isArchive(club: string): boolean {
  return club.toLowerCase() === 'archive'
}

function resolveByClub(candidates: ParsedPlayer[]): ParsedPlayer | null {
  const local = candidates.filter(c => isAucklandClub(c.club ?? ''))
  return local.length === 1 ? local[0] : null
}

function resolveByNonArchive(candidates: ParsedPlayer[]): ParsedPlayer | null {
  const active = candidates.filter(c => !isArchive(c.club ?? ''))
  return active.length === 1 ? active[0] : null
}

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get('list') === 'missing') {
      const players = await getPlayersWithoutNzNumber()
      return NextResponse.json(players.map((p: any) => ({ pl_plid: p.pl_plid, pl_name: p.pl_name })))
    }
    const counts = await getPlayerCounts()
    return NextResponse.json(counts)
  } catch (err) {
    await write_Logging({ lg_functionname: 'GET', lg_caller: 'players/refresh', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') ?? 'missing'

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  async function send(data: object) {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  ;(async () => {
    try {
      const warnings: string[] = []
      let updated = 0
      let failed = 0

      if (mode === 'missing') {
        const players = await getPlayersWithoutNzNumber()
        const total = players.length
        let ambiguous = 0

        for (let i = 0; i < players.length; i++) {
          const player = players[i]
          const candidates = await lookupPlayerCandidates(player.pl_name)

          if (candidates.length === 0) {
            const msg = `No NZ record found for: ${player.pl_name}`
            warnings.push(msg)
            await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/refresh', lg_msg: msg, lg_severity: 'W' })
            failed++
          } else if (candidates.length === 1) {
            await upsertPlayer(candidates[0])
            updated++
          } else {
            const resolved = resolveByClub(candidates) ?? resolveByNonArchive(candidates)
            if (resolved) {
              await upsertPlayer(resolved)
              const msg = `Auto-resolved "${player.pl_name}" → NZ# ${resolved.nz_bridge_number} (${resolved.club})`
              await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/refresh', lg_msg: msg, lg_severity: 'I' })
              updated++
            } else {
              for (const c of candidates) {
                await table_write({
                  caller: 'players/refresh missing',
                  table: 'tam_players_ambiguous',
                  columnValuePairs: [
                    { column: 'am_search_name', value: player.pl_name },
                    { column: 'am_nz_number',   value: c.nz_bridge_number },
                    { column: 'am_nz_name',     value: c.name },
                    { column: 'am_club',        value: c.club }
                  ]
                })
              }
              const msg = `Ambiguous: "${player.pl_name}" matched ${candidates.length} NZ records`
              warnings.push(msg)
              await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/refresh', lg_msg: msg, lg_severity: 'W' })
              ambiguous++
            }
          }

          await send({ processed: i + 1, total, updated, failed, ambiguous })
        }

        await send({ done: true, updated, failed, ambiguous, warnings })

      } else if (mode === 'all') {
        const players = (await getAllPlayers()).filter(p => p.pl_nz_bridge_number)
        const total = players.length

        for (let i = 0; i < players.length; i++) {
          const player = players[i]
          const found = await lookupPlayerByNumber(player.pl_nz_bridge_number)
          if (!found) {
            const msg = `Could not refresh player: ${player.pl_name} (${player.pl_nz_bridge_number})`
            warnings.push(msg)
            await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/refresh', lg_msg: msg, lg_severity: 'W' })
            failed++
          } else {
            await upsertPlayer(found)
            updated++
          }
          await send({ processed: i + 1, total, updated, failed })
        }

        await send({ done: true, updated, failed, warnings })

      } else if (mode === 'verify') {
        const players = await getAllPlayers()
        const total = players.length
        let nzUpdated = 0

        for (let i = 0; i < players.length; i++) {
          const player = players[i]
          const found = await lookupPlayer(player.pl_name)
          if (!found) {
            const msg = `No NZ record found for: ${player.pl_name}`
            warnings.push(msg)
            failed++
          } else {
            const storedNz = (player.pl_nz_bridge_number as number | null) ?? null
            const foundNz = found.nz_bridge_number

            if (storedNz !== foundNz) {
              if (foundNz) {
                const conflict = await getPlayerByNzNumber(foundNz)
                if (conflict && conflict.pl_plid !== player.pl_plid) {
                  const msg = `NZ conflict for "${player.pl_name}": stored ${storedNz ?? 'null'} → found ${foundNz}, but "${conflict.pl_name}" already holds ${foundNz}`
                  warnings.push(msg)
                  await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/refresh', lg_msg: msg, lg_severity: 'W' })
                  failed++
                } else {
                  await table_update({
                    caller: 'players/refresh verify',
                    table: 'tpl_players',
                    columnValuePairs: [
                      { column: 'pl_nz_bridge_number', value: foundNz },
                      { column: 'pl_club',             value: found.club      ?? '' },
                      { column: 'pl_rank',             value: found.rank      ?? '' },
                      { column: 'pl_grade',            value: found.grade     ?? '' },
                      { column: 'pl_rating',           value: found.rating    ?? 0 },
                      { column: 'pl_a_points',         value: found.a_points  ?? 0 },
                      { column: 'pl_b_points',         value: found.b_points  ?? 0 },
                      { column: 'pl_c_points',         value: found.c_points  ?? 0 },
                      { column: 'pl_last_updated',     value: new Date().toISOString() }
                    ],
                    whereColumnValuePairs: [{ column: 'pl_plid', value: player.pl_plid }]
                  })
                  const msg = `Fixed "${player.pl_name}": NZ# ${storedNz ?? 'null'} → ${foundNz}`
                  await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/refresh', lg_msg: msg, lg_severity: 'I' })
                  nzUpdated++
                  updated++
                }
              }
            }
          }
          await send({ processed: i + 1, total, updated: nzUpdated, failed })
        }

        await send({ done: true, checked: total, updated: nzUpdated, failed, warnings })
      }
    } catch (err) {
      await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/refresh', lg_msg: String(err), lg_severity: 'E' })
      await send({ error: String(err) })
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}
