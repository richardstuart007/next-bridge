'use client'

import { MyInput } from 'nextjs-shared/MyInput'
import { myMergeClasses } from 'nextjs-shared/MyMergeClasses'
import { WIDTH_NAME } from '@/src/lib/constants'

const DEFAULT_CLASS = 'w-full rounded border border-gray-300 px-2 py-0.5 text-xs font-normal h-auto md:h-auto'

//----------------------------------------------------------------------------------------------
//  FilterName — compact table-header text filter for any *_name column (pl_name, se_name).
//  Same UI shape regardless of which table's name column it filters, so one component serves
//  both rather than a separate wrapper per table.
//----------------------------------------------------------------------------------------------
export function FilterName({ value, onChange, placeholder = 'Filter…', overrideClass = WIDTH_NAME }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  overrideClass?: string
}) {
  const classValue = myMergeClasses(DEFAULT_CLASS, overrideClass)
  return (
    <MyInput type='text' value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} overrideClass={classValue} />
  )
}
