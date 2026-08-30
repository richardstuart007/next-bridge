'use client'

//==============================================================================================
//  1) DESCRIPTION
//    FilterIsSummary — a single-value se_is_summary dropdown (all / summary / session).
//    Distinct from Home's multi-select summary-type use case — same DD item, different widget.
//
//    Parameters:
//      value         — 'all' | 'summary' | 'session'
//      onChange      — called with the new value
//      overrideClass — classes merged over DEFAULT_CLASS (default WIDTH_IS_SUMMARY)
//==============================================================================================

import MySelect from 'nextjs-shared/MySelect'
import { myMergeClasses } from 'nextjs-shared/MyMergeClasses'
import { WIDTH_IS_SUMMARY } from '@/src/lib/constants'

const DEFAULT_CLASS = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto'

export function FilterIsSummary({ value, onChange, overrideClass = WIDTH_IS_SUMMARY }: {
  value: 'all' | 'summary' | 'session'
  onChange: (v: 'all' | 'summary' | 'session') => void
  overrideClass?: string
}) {
  const classValue = myMergeClasses(DEFAULT_CLASS, overrideClass)
  return (
    <MySelect value={value} onChange={e => onChange(e.target.value as 'all' | 'summary' | 'session')} overrideClass={classValue}>
      <option value='all'>All</option>
      <option value='summary'>Summary</option>
      <option value='session'>Session</option>
    </MySelect>
  )
}
