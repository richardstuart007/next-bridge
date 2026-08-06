'use client'

import { MyInput } from 'nextjs-shared/MyInput'
import { myMergeClasses } from 'nextjs-shared/MyMergeClasses'

const DEFAULT_CLASS = 'w-full rounded border border-gray-300 px-2 py-0.5 text-xs font-normal h-auto md:h-auto'

//----------------------------------------------------------------------------------------------
//  NumberFilterInput — compact table-header filter box for a numeric ID/number column (partial
//  match, e.g. pl_nzb, pa_paid). Reused wherever a table needs the same "type
//  digits, filter by substring" box rather than each table hand-rolling its own MyInput.
//----------------------------------------------------------------------------------------------
export function NumberFilterInput({ value, onChange, placeholder = 'Filter…', overrideClass }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  overrideClass?: string
}) {
  const classValue = overrideClass ? myMergeClasses(DEFAULT_CLASS, overrideClass) : DEFAULT_CLASS
  return (
    <MyInput type='text' inputMode='numeric' value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} overrideClass={classValue} />
  )
}
