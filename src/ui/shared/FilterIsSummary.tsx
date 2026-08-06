'use client'

import MySelect from 'nextjs-shared/MySelect'
import { myMergeClasses } from 'nextjs-shared/MyMergeClasses'
import { WIDTH_IS_SUMMARY } from '@/src/lib/constants'

const DEFAULT_CLASS = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto'

//----------------------------------------------------------------------------------------------
//  FilterIsSummary — single-value se_is_summary dropdown (all/summary/session), distinct from
//  Home's multi-select SummaryTypeMultiSelect — same DD item, different widget.
//----------------------------------------------------------------------------------------------
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
