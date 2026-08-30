'use client'

//==============================================================================================
//  1) DESCRIPTION
//    FilterRunId — a partial-match filter for the NZB business run_id (se_run_id / s1_run_id),
//    the externally-visible session identifier from nzbridge.co.nz. Distinct from FilterSeid,
//    which filters the internal se_seid primary key.
//
//    Parameters:
//      value         — current filter text
//      onChange      — called with the new text
//      overrideClass — extra classes for the input (default WIDTH_RUN_ID)
//==============================================================================================

import { NumberFilterInput } from '@/src/ui/shared/NumberFilterInput'
import { WIDTH_RUN_ID } from '@/src/lib/constants'

export function FilterRunId({ value, onChange, overrideClass = WIDTH_RUN_ID }: {
  value: string
  onChange: (v: string) => void
  overrideClass?: string
}) {
  return <NumberFilterInput value={value} onChange={onChange} placeholder='ID' overrideClass={overrideClass} />
}
