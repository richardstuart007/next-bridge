import { NextRequest, NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_Logging } from 'nextjs-shared/write_logging'

/**
 * POST /api/players/merge
 * Merges two player records into one, then recalculates averages and
 * partnerships for the kept player.
 * Body: { keep_plid: number, discard_plid: number }
 *
 * Steps:
 * 1. Update trw_results_raw name columns
 * 2. Update tre_results plid columns
 * 3. Delete tpa_partners rows for the discarded player
 * 4. Delete the discarded tpl_players row
 * 5. Recalculate averages for the kept player
 * 6. Recalculate partnerships for the kept player
 */
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

    // Fetch both player names for raw staging update
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

    // 1. Update tre_results player ID columns
    await table_query({
      caller: 'players/merge',
      query: `UPDATE tre_results SET re_plid1 = $1 WHERE re_plid1 = $2`,
      params: [keep_plid, discard_plid]
    })
    await table_query({
      caller: 'players/merge',
      query: `UPDATE tre_results SET re_plid2 = $1 WHERE re_plid2 = $2`,
      params: [keep_plid, discard_plid]
    })

    // 3a. Clear re_paid on ALL result rows that will lose their partnership row,
    //     so the back-fill at the end can reassign them correctly.
    //     (Rows transferred from discard_plid already have re_plid1 = keep_plid at this point,
    //     but their re_paid still points to the about-to-be-deleted partnership rows.)
    await table_query({
      caller: 'players/merge',
      query: `
        UPDATE tre_results
        SET re_paid = NULL
        WHERE re_paid IN (
          SELECT pa_paid FROM tpa_partners
          WHERE pa_plid1 = $1 OR pa_plid2 = $1
        )
      `,
      params: [discard_plid]
    })

    // 3b. Remove partnership rows for the discarded player (now safe to delete)
    await table_query({
      caller: 'players/merge',
      query: `DELETE FROM tpa_partners WHERE pa_plid1 = $1 OR pa_plid2 = $1`,
      params: [discard_plid]
    })

    // 3c. Transfer nz_bridge_number from discarded player if kept player has none (= 0)
    await table_query({
      caller: 'players/merge',
      query: `
        UPDATE tpl_players
        SET pl_nz_bridge_number = (SELECT pl_nz_bridge_number FROM tpl_players WHERE pl_plid = $1)
        WHERE pl_plid = $2
          AND pl_nz_bridge_number = 0
          AND (SELECT pl_nz_bridge_number FROM tpl_players WHERE pl_plid = $1) > 0
      `,
      params: [discard_plid, keep_plid]
    })

    // 4. Delete the discarded player record
    await table_query({
      caller: 'players/merge',
      query: `DELETE FROM tpl_players WHERE pl_plid = $1`,
      params: [discard_plid]
    })

    // 4b. Remove any self-partnership rows created by the merge
    //     (happens if both spellings appeared as a pair in AKBC — re_plid1 = re_plid2 = keep_plid)
    await table_query({
      caller: 'players/merge',
      query: `DELETE FROM tre_results WHERE re_plid1 = $1 AND re_plid2 = $1`,
      params: [keep_plid]
    })

    // 5+6. Rebuild tpa_partners rows for the kept player (stats live in ta1/ta2 — re-run recalculate after merge)
    await table_query({
      caller: 'players/merge',
      query: `
        INSERT INTO tpa_partners (pa_plid1, pa_plid2)
        SELECT DISTINCT
          CASE WHEN p1.pl_name <= p2.pl_name THEN re.re_plid1 ELSE re.re_plid2 END,
          CASE WHEN p1.pl_name <= p2.pl_name THEN re.re_plid2 ELSE re.re_plid1 END
        FROM tre_results re
        JOIN tpl_players p1 ON p1.pl_plid = LEAST(re.re_plid1, re.re_plid2)
        JOIN tpl_players p2 ON p2.pl_plid = GREATEST(re.re_plid1, re.re_plid2)
        WHERE re.re_plid1 < re.re_plid2
          AND (re.re_plid1 = $1 OR re.re_plid2 = $1)
        ON CONFLICT (pa_plid1, pa_plid2) DO NOTHING
      `,
      params: [keep_plid]
    })
    // Back-fill re_paid for ALL kept player result rows (including transferred rows
    // whose old re_paid was nulled in step 3a).
    // Uses both (plid1,plid2) orderings so it works regardless of whether tpa_partners
    // stored the pair in alphabetical-name order or numerical order.
    await table_query({
      caller: 'players/merge',
      query: `
        UPDATE tre_results re
        SET re_paid = pa.pa_paid
        FROM tpa_partners pa
        WHERE (
          (pa.pa_plid1 = re.re_plid1 AND pa.pa_plid2 = re.re_plid2) OR
          (pa.pa_plid1 = re.re_plid2 AND pa.pa_plid2 = re.re_plid1)
        )
        AND (re.re_plid1 = $1 OR re.re_plid2 = $1)
        AND re.re_paid IS NULL
      `,
      params: [keep_plid]
    })

    await write_Logging({
      lg_functionname: 'POST',
      lg_caller: 'players/merge',
      lg_msg: `Merged plid ${discard_plid} (${discardName}) into plid ${keep_plid} (${keepName}); rebuilt partnerships`,
      lg_severity: 'I'
    })

    return NextResponse.json({
      merged: true,
      kept: { plid: keep_plid, name: keepName },
      discarded: { plid: discard_plid, name: discardName },
      partnerships_rebuilt: true
    })
  } catch (err) {
    await write_Logging({ lg_functionname: 'POST', lg_caller: 'players/merge', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
