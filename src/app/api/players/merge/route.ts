//==============================================================================================
//  1) DESCRIPTION
//    POST — /api/players/merge route handler. Merges the discard player into the keep player:
//    remaps every discard-player partnership's results onto the equivalent keep-player
//    partnership (deleting results that would become a self-pair), deletes the discard
//    partnerships, transfers the NZ number if the keep player has none, then deletes the
//    discard player row.
//
//    Parameters:
//      request — JSON body { keep_plid, discard_plid } (must differ)
//
//    Returns:
//      JSON { merged: true, kept, discarded }; 400 on bad ids, 404 when an id isn't found,
//      500 { error } on failure
//==============================================================================================

import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { keep_plid, discard_plid } = body

    if (!keep_plid || !discard_plid) {
      return NextResponse.json({ error: 'keep_plid and discard_plid are required' }, { status: 400 })
    }
    if (keep_plid === discard_plid) {
      return NextResponse.json({ error: 'keep_plid and discard_plid must be different' }, { status: 400 })
    }

    const playersResult = await table_query({
      caller: 'players/merge',
      table: 'tpl_players',
      query: `SELECT pl_plid, pl_name FROM tpl_players WHERE pl_plid IN ($1, $2)`,
      params: [keep_plid, discard_plid]
    })
    if (!playersResult.ok) throw new Error('players/merge: ' + playersResult.error)
    const players = playersResult.data

    const keepPlayer    = players.find((p: any) => p.pl_plid === keep_plid)
    const discardPlayer = players.find((p: any) => p.pl_plid === discard_plid)

    if (!keepPlayer || !discardPlayer) {
      return NextResponse.json({ error: 'One or both player IDs not found' }, { status: 404 })
    }

    const keepName    = keepPlayer.pl_name    as string
    const discardName = discardPlayer.pl_name as string

    // 1. Get all partnerships of the discard player
    const discardPartnershipsResult = await table_query({
      caller: 'players/merge/get-partnerships',
      table: 'tpa_partners',
      query: `SELECT pa_paid,
                CASE WHEN pa_plid1 = $1 THEN pa_plid2 ELSE pa_plid1 END AS partner_id
              FROM tpa_partners WHERE pa_plid1 = $1 OR pa_plid2 = $1`,
      params: [discard_plid]
    })
    if (!discardPartnershipsResult.ok) throw new Error('players/merge/get-partnerships: ' + discardPartnershipsResult.error)
    const discardPartnerships = discardPartnershipsResult.data as { pa_paid: number; partner_id: number }[]

    // 2. For each old partnership, remap or delete results
    for (const { pa_paid: old_paid, partner_id } of discardPartnerships) {
      if (partner_id === keep_plid) {
        // keep_plid was paired with discard_plid â€” would become self-pair, delete results
        const delSelfResult = await table_query({
          caller: 'players/merge/delete-self-results',
          table: 'tre_results',
          query: `DELETE FROM tre_results WHERE re_paid = $1`,
          params: [old_paid]
        })
        if (!delSelfResult.ok) throw new Error('players/merge/delete-self-results: ' + delSelfResult.error)
      } else {
        // Create/find equivalent partnership with keep_plid
        const upsertPartnershipResult = await table_query({
          caller: 'players/merge/upsert-partnership',
          table: 'tpa_partners',
          query: `INSERT INTO tpa_partners (pa_plid1, pa_plid2)
                  VALUES (LEAST($1,$2), GREATEST($1,$2))
                  ON CONFLICT (pa_plid1, pa_plid2) DO NOTHING`,
          params: [keep_plid, partner_id]
        })
        if (!upsertPartnershipResult.ok) throw new Error('players/merge/upsert-partnership: ' + upsertPartnershipResult.error)

        const newPaRowsResult = await table_query({
          caller: 'players/merge/get-new-paid',
          table: 'tpa_partners',
          query: `SELECT pa_paid FROM tpa_partners
                  WHERE pa_plid1 = LEAST($1,$2) AND pa_plid2 = GREATEST($1,$2)`,
          params: [keep_plid, partner_id]
        })
        if (!newPaRowsResult.ok) throw new Error('players/merge/get-new-paid: ' + newPaRowsResult.error)
        const newPaRows = newPaRowsResult.data as { pa_paid: number }[]

        const remapResult = await table_query({
          caller: 'players/merge/remap-results',
          table: 'tre_results',
          query: `UPDATE tre_results SET re_paid = $1 WHERE re_paid = $2`,
          params: [newPaRows[0].pa_paid, old_paid]
        })
        if (!remapResult.ok) throw new Error('players/merge/remap-results: ' + remapResult.error)
      }
    }

    // 3. Delete all partnerships for discard player (results already remapped or deleted)
    const delPartnershipsResult = await table_query({
      caller: 'players/merge/delete-partnerships',
      table: 'tpa_partners',
      query: `DELETE FROM tpa_partners WHERE pa_plid1 = $1 OR pa_plid2 = $1`,
      params: [discard_plid]
    })
    if (!delPartnershipsResult.ok) throw new Error('players/merge/delete-partnerships: ' + delPartnershipsResult.error)

    // 4. Transfer nzb if kept player has none
    const transferNzbResult = await table_query({
      caller: 'players/merge/transfer-nzb',
      table: 'tpl_players',
      query: `UPDATE tpl_players
              SET pl_nzb = (SELECT pl_nzb FROM tpl_players WHERE pl_plid = $1)
              WHERE pl_plid = $2
                AND pl_nzb = 0
                AND (SELECT pl_nzb FROM tpl_players WHERE pl_plid = $1) > 0`,
      params: [discard_plid, keep_plid]
    })
    if (!transferNzbResult.ok) throw new Error('players/merge/transfer-nzb: ' + transferNzbResult.error)

    // 5. Delete the discarded player
    const delPlayerResult = await table_query({
      caller: 'players/merge/delete-player',
      table: 'tpl_players',
      query: `DELETE FROM tpl_players WHERE pl_plid = $1`,
      params: [discard_plid]
    })
    if (!delPlayerResult.ok) throw new Error('players/merge/delete-player: ' + delPlayerResult.error)

    await write_logging({
      lg_functionname: 'POST',
      lg_caller: 'players/merge',
      lg_msg: `Merged plid ${discard_plid} (${discardName}) into plid ${keep_plid} (${keepName})`,
      lg_severity: 'I'
    })

    return NextResponse.json({
      merged: true,
      kept: { plid: keep_plid, name: keepName },
      discarded: { plid: discard_plid, name: discardName }
    })
  } catch (err) {
    await write_logging({ lg_functionname: 'POST', lg_caller: 'players/merge', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
