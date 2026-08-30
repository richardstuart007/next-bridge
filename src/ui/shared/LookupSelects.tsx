'use client'

import { useState, useEffect, useRef } from 'react'
import { getAllClubs, getAllGrades, getAllRanks, getAllEventTypes } from '@/src/lib/actions/lookup'
import MySelectMulti from 'nextjs-shared/MySelectMulti'
import { myMergeClasses } from 'nextjs-shared/MyMergeClasses'
import { WIDTH_RANK, WIDTH_GRADE, WIDTH_CLUB, WIDTH_EVENT_TYPE } from '@/src/lib/constants'

// Replicates the old hand-rolled DropdownPanel trigger button's exact styling — narrow enough
// to fit a table filter-row cell, unlike MySelectMulti's own wider default
const TRIGGER_OVERRIDE_CLASS =
  'w-full text-left rounded border border-gray-300 px-1.5 py-0.5 text-xs bg-white truncate text-gray-700 justify-start h-auto md:h-auto'

//----------------------------------------------------------------------------------
//  StringMultiSelect — a table-filter-sized MySelectMulti over a plain string list;
//  every option selected means "no filter" (MySelectMulti's convention)
//----------------------------------------------------------------------------------
export function StringMultiSelect({ options, selected, onChange, overrideClass }: {
  options: string[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
  overrideClass?: string
}) {
  const triggerClass = overrideClass ? myMergeClasses(TRIGGER_OVERRIDE_CLASS, overrideClass) : TRIGGER_OVERRIDE_CLASS
  return (
    <MySelectMulti
      options={options}
      selected={[...selected]}
      onChange={values => onChange(new Set(values))}
      overrideClass={triggerClass}
    />
  )
}

// ── Lookup-backed self-loading select props ───────────────────────────────────

interface LookupProps {
  selected: Set<string>
  onChange: (s: Set<string>) => void
  onOptionsLoaded?: (opts: string[]) => void
  overrideClass?: string
}

//----------------------------------------------------------------------------------
//  LookupBase — shared inner MySelectMulti for the Club/Grade/Rank/EventType
//  selects; each wrapper loads its own options and passes them in
//----------------------------------------------------------------------------------
function LookupBase({ options, selected, onChange, overrideClass }: {
  options: string[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
  overrideClass?: string
}) {
  const triggerClass = overrideClass ? myMergeClasses(TRIGGER_OVERRIDE_CLASS, overrideClass) : TRIGGER_OVERRIDE_CLASS
  return (
    <MySelectMulti
      options={options}
      selected={[...selected]}
      onChange={values => onChange(new Set(values))}
      overrideClass={triggerClass}
    />
  )
}

//----------------------------------------------------------------------------------
//  ClubSelect — LookupBase self-loading its options from getAllClubs (cl_club)
//----------------------------------------------------------------------------------
export function ClubSelect({ selected, onChange, onOptionsLoaded, overrideClass }: LookupProps) {
  const [options, setOptions] = useState<string[]>([])
  const cbRef = useRef(onOptionsLoaded)
  cbRef.current = onOptionsLoaded
  useEffect(() => {
    (async () => {
      try {
        const rows = await getAllClubs()
        const opts = (rows as { cl_club: string }[]).map(r => r.cl_club)
        setOptions(opts)
        cbRef.current?.(opts)
      } catch (err) { console.error(err) }
    })()
  }, [])
  return <LookupBase options={options} selected={selected} onChange={onChange} overrideClass={overrideClass ?? WIDTH_CLUB} />
}

//----------------------------------------------------------------------------------
//  GradeSelect — LookupBase self-loading its options from getAllGrades (gr_grade)
//----------------------------------------------------------------------------------
export function GradeSelect({ selected, onChange, onOptionsLoaded, overrideClass }: LookupProps) {
  const [options, setOptions] = useState<string[]>([])
  const cbRef = useRef(onOptionsLoaded)
  cbRef.current = onOptionsLoaded
  useEffect(() => {
    (async () => {
      try {
        const rows = await getAllGrades()
        const opts = (rows as { gr_grade: string }[]).map(r => r.gr_grade)
        setOptions(opts)
        cbRef.current?.(opts)
      } catch (err) { console.error(err) }
    })()
  }, [])
  return <LookupBase options={options} selected={selected} onChange={onChange} overrideClass={overrideClass ?? WIDTH_GRADE} />
}

//----------------------------------------------------------------------------------
//  RankSelect — LookupBase self-loading its options from getAllRanks (rk_rank)
//----------------------------------------------------------------------------------
export function RankSelect({ selected, onChange, onOptionsLoaded, overrideClass }: LookupProps) {
  const [options, setOptions] = useState<string[]>([])
  const cbRef = useRef(onOptionsLoaded)
  cbRef.current = onOptionsLoaded
  useEffect(() => {
    (async () => {
      try {
        const rows = await getAllRanks()
        const opts = (rows as { rk_rank: string }[]).map(r => r.rk_rank)
        setOptions(opts)
        cbRef.current?.(opts)
      } catch (err) { console.error(err) }
    })()
  }, [])
  return <LookupBase options={options} selected={selected} onChange={onChange} overrideClass={overrideClass ?? WIDTH_RANK} />
}

//----------------------------------------------------------------------------------
//  EventTypeSelect — LookupBase self-loading its options from getAllEventTypes
//  (et_event_type, sorted)
//----------------------------------------------------------------------------------
export function EventTypeSelect({ selected, onChange, onOptionsLoaded, overrideClass }: LookupProps) {
  const [options, setOptions] = useState<string[]>([])
  const cbRef = useRef(onOptionsLoaded)
  cbRef.current = onOptionsLoaded
  useEffect(() => {
    (async () => {
      try {
        const rows = await getAllEventTypes()
        const opts = (rows as { et_event_type: string }[]).map(r => r.et_event_type).sort()
        setOptions(opts)
        cbRef.current?.(opts)
      } catch (err) { console.error(err) }
    })()
  }, [])
  return <LookupBase options={options} selected={selected} onChange={onChange} overrideClass={overrideClass ?? WIDTH_EVENT_TYPE} />
}
