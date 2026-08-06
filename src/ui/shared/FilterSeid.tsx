'use client'

import { NumberFilterInput } from '@/src/ui/shared/NumberFilterInput'
import { WIDTH_SEID } from '@/src/lib/constants'

//----------------------------------------------------------------------------------------------
//  FilterSeid — partial-match filter for se_seid, tse_sessions' internal primary key. Distinct
//  from FilterRunId, which filters the externally-visible NZB run_id.
//----------------------------------------------------------------------------------------------
export function FilterSeid({ value, onChange, overrideClass = WIDTH_SEID }: {
  value: string
  onChange: (v: string) => void
  overrideClass?: string
}) {
  return <NumberFilterInput value={value} onChange={onChange} placeholder='ID' overrideClass={overrideClass} />
}
