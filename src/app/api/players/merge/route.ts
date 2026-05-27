import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

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

    const players = await table_query({
      caller: 'players/merge',
      query: `SELECT pl_plid, pl_name FROM tpl_players WHERE pl_plid IN ($1, $2)`,
      params: [keep_plid, discard_plid]
    })

    const keepPlayer    = players.find((p: any) => p.pl_plid === keep_plid)
    const discardPlayer = players.find((p: any) => p.pl_plid === discard_plid)

    if (!keepPlayer || !discardPlayer) {
      return NextResponse.json({ error: 'One or both player IDs not found' }, { status: 404 })
    }

    const keepName    = keepPlayer.pl_name    as string
    const discardName = discardPlayer.pl_name as string

    // 1. Get all partnerships of the discard player
    const discardPartnerships = await table_query({
      caller: 'players/merge/get-partnerships',
      query: `SELECT pa_paid,
                CASE WHEN pa_plid1 = $1 THEN pa_plid2 ELSE pa_plid1 END AS partner_id
              FROM tpa_partners WHERE pa_plid1 = $1 OR pa_plid2 = $1`,
      params: [discard_plid]
    }) as { pa_paid: number; partner_id: number }[]

    // 2. For each old partnership, remap or delete results
    for (const { pa_paid: old_paid, partner_id } of discardPartnerships) {
      if (partner_id === keep_plid) {
        // keep_plid was paired with discard_plid — would become self-pair, delete results
        await table_query({
          caller: 'players/merge/delete-self-results',
          query: `DELETE FROM tre_results WHERE re_paid = $1`,
          params: [old_paid]
        })
      } else {
        // Create/find equivalent partnership with keep_plid in name-alphabetical order
        await table_query({
          caller: 'players/merge/upsert-partnership',
          query: `INSERT INTO tpa_partners (pa_plid1, pa_plid2)
                  SELECT CASE WHEN p1.pl_name <= p2.pl_name THEN $1 ELSE $2 END,
                         CASE WHEN p1.pl_name <= p2.pl_name THEN $2 ELSE $1 END
                  FROM tpl_players p1, tpl_players p2
                  WHERE p1.pl_plid = $1 AND p2.pl_plid = $2
                  ON CONFLICT (pa_plid1, pa_plid2) DO NOTHING`,
          params: [keep_plid, partner_id]
        })

        const newPaRows = await table_query({
          caller: 'players/merge/get-new-paid',
          query: `SELECT pa_paid FROM tpa_partners
                  WHERE (pa_plid1 = $1 AND pa_plid2 = $2) OR (pa_plid1 = $2 AND pa_plid2 = $1)`,
          params: [keep_plid, partner_id]
        }) as { pa_paid: number }[]

        await table_query({
          caller: 'players/merge/remap-results',
          query: `UPDATE tre_results SET re_paid = $1 WHERE re_paid = $2`,
          params: [newPaRows[0].pa_paid, old_paid]
        })
      }
    }

    // 3. Delete all partnerships for discard player (results already remapped or deleted)
    await table_query({
      caller: 'players/merge/delete-partnerships',
      query: `DELETE FROM tpa_partners WHERE pa_plid1 = $1 OR pa_plid2 = $1`,
      params: [discard_plid]
    })

    // 4. Transfer nz_bridge_number if kept player has none
    await table_query({
      caller: 'players/merge/transfer-nz-number',
      query: `UPDATE tpl_players
              SET pl_nz_bridge_number = (SELECT pl_nz_bridge_number FROM tpl_players WHERE pl_plid = $1)
              WHERE pl_plid = $2
                AND pl_nz_bridge_number = 0
                AND (SELECT pl_nz_bridge_number FROM tpl_players WHERE pl_plid = $1) > 0`,
      params: [discard_plid, keep_plid]
    })

    // 5. Delete the discarded player
    await table_query({
      caller: 'players/merge/delete-player',
      query: `DELETE FROM tpl_players WHERE pl_plid = $1`,
      params: [discard_plid]
    })

    await write_Logging({
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
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/merge', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
