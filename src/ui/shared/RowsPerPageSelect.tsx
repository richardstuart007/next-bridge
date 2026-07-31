'use client'

import MySelect from 'nextjs-shared/MySelect'
import { ROWS_PER_PAGE_OPTIONS } from '@/src/lib/constants'

const SELECT_OVERRIDE_CLASS = 'rounded border border-gray-300 px-1.5 py-0.5 text-xs h-auto md:h-auto w-auto'

//----------------------------------------------------------------------------------------------
//  RowsPerPageSelect — <select> dropdown of page-size choices. Defaults to the standard
//  ROWS_PER_PAGE_OPTIONS list; a call site with different needs overrides via `options`.
//----------------------------------------------------------------------------------------------
export function RowsPerPageSelect({
  value, onChange, options = ROWS_PER_PAGE_OPTIONS, overrideClass = SELECT_OVERRIDE_CLASS
}: {
  value: number
  onChange: (value: number) => void
  options?: readonly number[]
  overrideClass?: string
}) {
  return (
    <MySelect value={value} onChange={e => onChange(parseInt(e.target.value, 10))} overrideClass={overrideClass}>
      {options.map(n => <option key={n} value={n}>{n} rows</option>)}
    </MySelect>
  )
}
