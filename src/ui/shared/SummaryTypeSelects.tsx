'use client'

import { StringMultiSelect } from '@/src/ui/shared/LookupSelects'
import { SUMMARY_TYPES, WIDTH_SUMMARY } from '@/src/lib/constants'

//----------------------------------------------------------------------------------------------
//  SummaryTypeMultiSelect — checkbox-dropdown multi-select over the shared SUMMARY_TYPES list
//  (every option selected = no filter, matching MySelectMulti's standard convention).
//----------------------------------------------------------------------------------------------
export function SummaryTypeMultiSelect({ selected, onChange, overrideClass = WIDTH_SUMMARY }: {
  selected: Set<string>
  onChange: (s: Set<string>) => void
  overrideClass?: string
}) {
  return <StringMultiSelect options={[...SUMMARY_TYPES]} selected={selected} onChange={onChange} overrideClass={overrideClass} />
}
