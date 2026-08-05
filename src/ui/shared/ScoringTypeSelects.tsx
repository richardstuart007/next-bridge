'use client'

import MySelect from 'nextjs-shared/MySelect'
import { StringMultiSelect } from '@/src/ui/shared/LookupSelects'
import { SCORING_TYPES, WIDTH_SCORING } from '@/src/lib/constants'

const SELECT_OVERRIDE_CLASS = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto'

//----------------------------------------------------------------------------------------------
//  ScoringTypeSelect — <select> dropdown over the shared SCORING_TYPES list, with an optional
//  'all' choice. Single source of truth for this option list lives in constants.ts.
//----------------------------------------------------------------------------------------------
export function ScoringTypeSelect({
  value, onChange, includeAll = false, allValue = 'all', allLabel = 'All', overrideClass = SELECT_OVERRIDE_CLASS
}: {
  value: string
  onChange: (value: string) => void
  includeAll?: boolean
  allValue?: string
  allLabel?: string
  overrideClass?: string
}) {
  return (
    <MySelect value={value} onChange={e => onChange(e.target.value)} overrideClass={overrideClass}>
      {includeAll && <option value={allValue}>{allLabel}</option>}
      {SCORING_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
    </MySelect>
  )
}

//----------------------------------------------------------------------------------------------
//  ScoringTypeToggle — pill/toggle button group over the shared SCORING_TYPES list.
//----------------------------------------------------------------------------------------------
export function ScoringTypeToggle({ value, onChange }: {
  value: (typeof SCORING_TYPES)[number]
  onChange: (value: (typeof SCORING_TYPES)[number]) => void
}) {
  return (
    <div className='flex rounded border border-gray-300 overflow-hidden text-xs'>
      {SCORING_TYPES.map(s => (
        <button key={s} onClick={() => onChange(s)}
          className={`px-2 py-0.5 ${value === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
          {s}
        </button>
      ))}
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  ScoringTypeMultiSelect — checkbox-dropdown multi-select over the shared SCORING_TYPES list,
//  for filter bars where more than one scoring type can be selected at once (every option
//  selected = no filter, matching MySelectMulti's standard convention).
//----------------------------------------------------------------------------------------------
export function ScoringTypeMultiSelect({ selected, onChange, overrideClass = WIDTH_SCORING }: {
  selected: Set<string>
  onChange: (s: Set<string>) => void
  overrideClass?: string
}) {
  return <StringMultiSelect options={[...SCORING_TYPES]} selected={selected} onChange={onChange} overrideClass={overrideClass} />
}

//----------------------------------------------------------------------------------------------
//  formatScoringValue — MP renders as a percentage, every other scoring type (VP, XIMP, ...)
//  renders as a plain number (agreed 2026-07-28: XIMP displays like VP, no unit suffix).
//----------------------------------------------------------------------------------------------
export function formatScoringValue(scoring: string, value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const n = typeof value === 'string' ? parseFloat(value) : value
  return scoring === 'MP' ? `${n.toFixed(2)}%` : n.toFixed(2)
}

//----------------------------------------------------------------------------------------------
//  scoringAvgLabel — column/header label for a scoring type's average value.
//----------------------------------------------------------------------------------------------
export function scoringAvgLabel(scoring: string): string {
  return scoring === 'MP' ? 'Avg %' : `Avg ${scoring}`
}
