'use client'

//==============================================================================================
//  1) DESCRIPTION
//    FilterSeid — a partial-match filter for se_seid, tse_sessions' internal primary key.
//    Distinct from FilterRunId, which filters the externally-visible NZB run_id.
//
//    Parameters:
//      value         — current filter text
//      onChange      — called with the new text
//      overrideClass — extra classes for the input (default WIDTH_SEID)
//==============================================================================================

import { NumberFilterInput } from '@/src/ui/shared/NumberFilterInput'
import { WIDTH_SEID } from '@/src/lib/constants'

export function FilterSeid({ value, onChange, overrideClass = WIDTH_SEID }: {
  value: string
  onChange: (v: string) => void
  overrideClass?: string
}) {
  return <NumberFilterInput value={value} onChange={onChange} placeholder='ID' overrideClass={overrideClass} />
}
