'use client'

//==============================================================================================
//  1) DESCRIPTION
//    SummaryTypeMultiSelect — a checkbox-dropdown multi-select over the shared SUMMARY_TYPES
//    list (every option selected = no filter, per MySelectMulti's standard convention).
//
//    Parameters:
//      selected      — Set of selected summary-type strings
//      onChange      — called with the new Set
//      overrideClass — extra classes for the trigger (default WIDTH_IS_SUMMARY)
//==============================================================================================

import { StringMultiSelect } from '@/src/ui/shared/LookupSelects'
import { SUMMARY_TYPES, WIDTH_IS_SUMMARY } from '@/src/lib/constants'

export function SummaryTypeMultiSelect({ selected, onChange, overrideClass = WIDTH_IS_SUMMARY }: {
  selected: Set<string>
  onChange: (s: Set<string>) => void
  overrideClass?: string
}) {
  return <StringMultiSelect options={[...SUMMARY_TYPES]} selected={selected} onChange={onChange} overrideClass={overrideClass} />
}
