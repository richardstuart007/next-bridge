//==============================================================================================
//  1) DESCRIPTION
//    POST — /api/build/cleanup route handler. Deletes tre_results rows with a negative
//    re_percentage, logs how many were removed, and returns { deleted } as JSON (500 with
//    { error } on failure).
//==============================================================================================

import { NextResponse } from 'next/server'
import { table_query } from 'nextjs-shared/table_query'
import { write_logging } from 'nextjs-shared/write_logging'

export async function POST() {
  try {
    const result = await table_query({
      caller: 'build/cleanup',
      table: 'tre_results',
      query: `DELETE FROM tre_results WHERE re_percentage < 0 RETURNING re_reid`,
      params: []
    })
    if (!result.ok) throw new Error('build/cleanup: ' + result.error)
    const deletedRows = result.data as { re_reid: number }[]

    const deleted = deletedRows.length
    await write_logging({ lg_functionname: 'POST', lg_caller: 'build/cleanup', lg_msg: `Deleted ${deleted} results with negative percentage`, lg_severity: 'I' })
    return NextResponse.json({ deleted })
  } catch (err) {
    await write_logging({ lg_functionname: 'POST', lg_caller: 'build/cleanup', lg_msg: String(err), lg_severity: 'E' })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
