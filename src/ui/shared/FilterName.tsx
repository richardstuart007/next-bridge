'use client'

//==============================================================================================
//  1) DESCRIPTION
//    FilterName — a compact table-header text filter for any *_name column (pl_name, se_name).
//    One component serves every table's name column since the UI shape is identical.
//
//    Parameters:
//      value         — current filter text
//      onChange      — called with the new text
//      placeholder   — input placeholder (default 'Filter…')
//      overrideClass — classes merged over DEFAULT_CLASS (default WIDTH_NAME)
//==============================================================================================

import { MyInput } from 'nextjs-shared/MyInput'
import { myMergeClasses } from 'nextjs-shared/MyMergeClasses'
import { WIDTH_NAME } from '@/src/lib/constants'

const DEFAULT_CLASS = 'w-full rounded border border-gray-300 px-2 py-0.5 text-xs font-normal h-auto md:h-auto'

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
