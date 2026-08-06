'use client'

import { MyInput } from 'nextjs-shared/MyInput'
import { myMergeClasses } from 'nextjs-shared/MyMergeClasses'
import { EARLIEST_DATA_DATE, WIDTH_DATE } from '@/src/lib/constants'

const DEFAULT_CLASS = 'w-full rounded border border-gray-300 px-2 py-0.5 text-xs font-normal h-auto md:h-auto'

//----------------------------------------------------------------------------------------------
//  FilterDate — single bounded date input for a se_date-style column filter, bounded between
//  EARLIEST_DATA_DATE and today. Instantiated twice (from/to) wherever a date-range filter is
//  needed, rather than one component per range.
//----------------------------------------------------------------------------------------------
export function FilterDate({ value, onChange, overrideClass = WIDTH_DATE }: {
  value: string
  onChange: (v: string) => void
  overrideClass?: string
}) {
  const classValue = myMergeClasses(DEFAULT_CLASS, overrideClass)
  return (
    <MyInput type='date' value={value} min={EARLIEST_DATA_DATE} max={new Date().toISOString().slice(0, 10)}
      onChange={e => onChange(e.target.value)} overrideClass={classValue} />
  )
}
