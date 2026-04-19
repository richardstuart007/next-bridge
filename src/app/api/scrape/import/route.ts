import { NextRequest, NextResponse } from 'next/server'
import { fetchSessionResults } from '@/src/lib/scrape/akbc'
import { sessionExistsBySourceId, insertSession, getSessionBySourceId } from '@/src/lib/actions/sessions'
import { table_delete } from 'nextjs-shared/table_delete'
import { getPlayerByName, getPlayerByNzNumber, findOrCreatePlayerByName, getOrCreatePartnerRow } from '@/src/lib/actions/players'
import { insertResult } from '@/src/lib/actions/results'
import { write_Logging } from 'nextjs-shared/write_logging'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { source_id, day_of_week, session_type = 'club', scoring = 'MP', mode = 'skip' } = body

    if (!source_id || !day_of_week) {
      const msg = 'Missing required fields: source_id, day_of_week'
      await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/import', lg_msg: msg, lg_severity: 'W' })
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // Check for duplicate
    const existing = await getSessionBySourceId(source_id)
    if (existing) {
      if (mode === 'reimport') {
        // Delete results then session so we can re-import fresh
        await table_delete({ table: 'tre_results', whereColumnValuePairs: [{ column: 're_seid', value: existing.se_seid }], caller: 'scrape/import' })
        await table_delete({ table: 'tse_sessions', whereColumnValuePairs: [{ column: 'se_seid', value: existing.se_seid }], caller: 'scrape/import' })
      } else {
        return NextResponse.json({ skipped: true, skip_reason: 'already imported' })
      }
    }

    // Fetch and parse the session page
    const parsed = await fetchSessionResults(source_id)

    if (parsed.skipped) {
      return NextResponse.json({ skipped: true, skip_reason: parsed.skipReason }, { status: 200 })
    }

    if (parsed.pairs.length === 0) {
      const msg = `Session ${source_id}: no pairs found`
      await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/import', lg_msg: msg, lg_severity: 'W' })
      return NextResponse.json({ error: msg }, { status: 422 })
    }

    // Derive day from date if not supplied (fallback for unknown/missing)
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const resolvedDay = (!day_of_week || day_of_week === 'Unknown')
      ? DAY_NAMES[new Date(parsed.date).getUTCDay()]
      : day_of_week

    // Insert session — use detected scoring for IMP, passed-in value for MP
    await insertSession({
      date: parsed.date,
      day_of_week: resolvedDay,
      session_type,
      scoring: parsed.isImp ? 'IMP' : scoring,
      source_id
    })

    const session = await getSessionBySourceId(source_id)
    if (!session) {
      const msg = `Session ${source_id}: failed to retrieve after insert`
      await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/import', lg_msg: msg, lg_severity: 'E' })
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    let pairsImported = 0
    let newPlayers = 0
    const warnings: string[] = []

    // Process each pair
    for (const pair of parsed.pairs) {
      const result1 = await resolvePlayer(pair.player1Name, warnings, pair.player1NzNumber)
      const result2 = await resolvePlayer(pair.player2Name, warnings, pair.player2NzNumber)

      if (result1 === null || result2 === null) {
        warnings.push(`Skipped pair: ${pair.player1Name} / ${pair.player2Name} — could not resolve player IDs`)
        continue
      }

      if (result1.isNew) newPlayers++
      if (result2.isNew) newPlayers++

      // Upsert partnership row and get pa_paid for re_pairid
      const pairId = await getOrCreatePartnerRow(
        result1.plId, result2.plId,
        result1.name, result2.name
      )

      const impScore = pair.impScore ?? null

      // Insert result for player 1 (partner is player 2)
      await insertResult({
        se_id: session.se_seid,
        pl_id: result1.plId,
        partner_pl_id: result2.plId,
        pair_id: pairId,
        percentage: pair.percentage,
        imp_score: impScore
      })

      // Insert result for player 2 (partner is player 1)
      await insertResult({
        se_id: session.se_seid,
        pl_id: result2.plId,
        partner_pl_id: result1.plId,
        pair_id: pairId,
        percentage: pair.percentage,
        imp_score: impScore
      })

      pairsImported++
    }

    return NextResponse.json({
      session_id: session.se_seid,
      pairs_imported: pairsImported,
      new_players: newPlayers,
      warnings
    })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'scrape/import', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

interface ResolvedPlayer {
  plId: number
  name: string
  nzNumber: number
  isNew: boolean
}

/**
 * Resolve a player name to their pl_plid.
 * Checks local DB only — no outbound HTTP calls during import.
 * NZ number enrichment is a separate admin step.
 */
async function resolvePlayer(name: string, warnings: string[], hrefNzNumber?: number): Promise<ResolvedPlayer | null> {
  // If NZ number came from the AKBC page href, try direct lookup first — avoids ambiguous name matches
  if (hrefNzNumber) {
    const byNz = await getPlayerByNzNumber(hrefNzNumber)
    if (byNz) return { plId: byNz.pl_plid, name: byNz.pl_name, nzNumber: byNz.pl_nz_bridge_number ?? 0, isNew: false }
  }

  // Already in DB by name?
  const existing = await getPlayerByName(name)
  if (existing) return { plId: existing.pl_plid, name: existing.pl_name, nzNumber: existing.pl_nz_bridge_number ?? 0, isNew: false }

  // Insert by name only — NZ number enrichment happens via admin "Fill Missing" step
  const plId = await findOrCreatePlayerByName(name)
  if (plId) return { plId, name, nzNumber: 0, isNew: true }

  warnings.push(`Failed to create player record for: ${name}`)
  await write_Logging({ lg_functionname: 'resolvePlayer', lg_caller: 'scrape/import', lg_msg: `Failed to create player record for "${name}"`, lg_severity: 'E' })
  return null
}
