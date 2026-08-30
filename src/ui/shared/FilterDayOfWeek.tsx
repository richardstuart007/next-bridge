'use client'

//==============================================================================================
//  1) DESCRIPTION
//    FilterDayOfWeek — a single-value se_day_of_week dropdown ('' = All). Distinct from Home's
//    multi-select day-of-week use case (StringMultiSelect) — same DD item, different widget.
//
//    Parameters:
//      value         — current day name, or '' for All
//      onChange      — called with the new value
//      overrideClass — classes merged over DEFAULT_CLASS (default WIDTH_DAY_OF_WEEK)
//==============================================================================================

import MySelect from 'nextjs-shared/MySelect'
import { myMergeClasses } from 'nextjs-shared/MyMergeClasses'
import { DAYS_OF_WEEK, WIDTH_DAY_OF_WEEK } from '@/src/lib/constants'

const DEFAULT_CLASS = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto'

export function FilterDayOfWeek({ value, onChange, overrideClass = WIDTH_DAY_OF_WEEK }: {
  value: string
  onChange: (v: string) => void
  overrideClass?: string
}) {
  const classValue = myMergeClasses(DEFAULT_CLASS, overrideClass)
  return (
    <MySelect value={value} onChange={e => onChange(e.target.value)} overrideClass={classValue}>
      <option value=''>All</option>
      {DAYS_OF_WEEK.map(d => <option key={d}>{d}</option>)}
    </MySelect>
  )
}
