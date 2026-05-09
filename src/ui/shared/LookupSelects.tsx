'use client'

import { useState, useEffect, useRef } from 'react'
import { getAllClubs, getAllGrades, getAllRanks, getAllTournaments, getAllEventTypes } from '@/src/lib/actions/lookup'

// ── Shared dropdown panel ─────────────────────────────────────────────────────

function DropdownPanel({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <div ref={ref} className='relative'>
      <button type='button' onClick={() => setOpen(v => !v)}
        className='w-full text-left rounded border border-gray-300 px-1.5 py-0.5 text-xs bg-white truncate'>
        {label}
      </button>
      {open && (
        <div className='absolute left-0 top-full z-20 bg-white border border-gray-200 rounded shadow-lg min-w-max max-h-56 overflow-y-auto'>
          {children}
        </div>
      )}
    </div>
  )
}

// ── MultiSelect: empty selection = no filter ──────────────────────────────────

export function MultiSelect({ options, selected, onChange, placeholder }: {
  options: string[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
  placeholder: string
}) {
  const label = selected.size === 0 ? placeholder : `${selected.size} selected`
  return (
    <DropdownPanel label={label}>
      {options.length === 0
        ? <div className='px-3 py-2 text-xs text-gray-400'>No values</div>
        : options.map(opt => (
          <label key={opt} className='flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs whitespace-nowrap'>
            <input type='checkbox' checked={selected.has(opt)}
              onChange={e => {
                const next = new Set(selected)
                if (e.target.checked) next.add(opt)
                else next.delete(opt)
                onChange(next)
              }} />
            {opt || '(blank)'}
          </label>
        ))
      }
    </DropdownPanel>
  )
}

// ── StringMultiSelect: all selected = no filter ───────────────────────────────

export function StringMultiSelect({ options, selected, onChange }: {
  options: string[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
}) {
  const allSelected = selected.size === options.length
  const label = allSelected ? 'All' : `${selected.size} / ${options.length}`

  function toggle(v: string) {
    if (allSelected) { onChange(new Set([v])); return }
    const next = new Set(selected)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange(next)
  }

  return (
    <DropdownPanel label={label}>
      <label className='flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs border-b border-gray-100 font-medium whitespace-nowrap'>
        <input type='checkbox' checked={allSelected} onChange={() => onChange(new Set(options))} />
        All
      </label>
      {options.map(opt => (
        <label key={opt} className='flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs whitespace-nowrap'>
          <input type='checkbox' checked={!allSelected && selected.has(opt)} onChange={() => toggle(opt)} />
          {opt || '(blank)'}
        </label>
      ))}
    </DropdownPanel>
  )
}

// ── Lookup-backed self-loading select props ───────────────────────────────────

interface LookupProps {
  selected: Set<string>
  onChange: (s: Set<string>) => void
  /** 'any' = MultiSelect (empty=no filter)   'all' = StringMultiSelect (all=no filter) */
  mode?: 'any' | 'all'
  placeholder?: string
  onOptionsLoaded?: (opts: string[]) => void
}

function LookupBase({ options, selected, onChange, mode = 'all', placeholder = 'All' }: {
  options: string[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
  mode?: 'any' | 'all'
  placeholder?: string
}) {
  if (mode === 'any')
    return <MultiSelect options={options} selected={selected} onChange={onChange} placeholder={placeholder} />
  return <StringMultiSelect options={options} selected={selected} onChange={onChange} />
}

// ── ClubSelect ────────────────────────────────────────────────────────────────

export function ClubSelect({ selected, onChange, mode = 'all', placeholder = 'All', onOptionsLoaded }: LookupProps) {
  const [options, setOptions] = useState<string[]>([])
  const cbRef = useRef(onOptionsLoaded)
  cbRef.current = onOptionsLoaded
  useEffect(() => {
    getAllClubs()
      .then(rows => {
        const opts = (rows as { cl_club: string }[]).map(r => r.cl_club)
        setOptions(opts)
        cbRef.current?.(opts)
      })
      .catch(console.error)
  }, [])
  return <LookupBase options={options} selected={selected} onChange={onChange} mode={mode} placeholder={placeholder} />
}

// ── GradeSelect ───────────────────────────────────────────────────────────────

export function GradeSelect({ selected, onChange, mode = 'all', placeholder = 'All', onOptionsLoaded }: LookupProps) {
  const [options, setOptions] = useState<string[]>([])
  const cbRef = useRef(onOptionsLoaded)
  cbRef.current = onOptionsLoaded
  useEffect(() => {
    getAllGrades()
      .then(rows => {
        const opts = (rows as { gr_grade: string }[]).map(r => r.gr_grade)
        setOptions(opts)
        cbRef.current?.(opts)
      })
      .catch(console.error)
  }, [])
  return <LookupBase options={options} selected={selected} onChange={onChange} mode={mode} placeholder={placeholder} />
}

// ── RankSelect ────────────────────────────────────────────────────────────────

export function RankSelect({ selected, onChange, mode = 'all', placeholder = 'All', onOptionsLoaded }: LookupProps) {
  const [options, setOptions] = useState<string[]>([])
  const cbRef = useRef(onOptionsLoaded)
  cbRef.current = onOptionsLoaded
  useEffect(() => {
    getAllRanks()
      .then(rows => {
        const opts = (rows as { rk_rank: string }[]).map(r => r.rk_rank)
        setOptions(opts)
        cbRef.current?.(opts)
      })
      .catch(console.error)
  }, [])
  return <LookupBase options={options} selected={selected} onChange={onChange} mode={mode} placeholder={placeholder} />
}

// ── EventTypeSelect ───────────────────────────────────────────────────────────

export function EventTypeSelect({ selected, onChange, mode = 'all', placeholder = 'All', onOptionsLoaded }: LookupProps) {
  const [options, setOptions] = useState<string[]>([])
  const cbRef = useRef(onOptionsLoaded)
  cbRef.current = onOptionsLoaded
  useEffect(() => {
    getAllEventTypes()
      .then(rows => {
        const opts = (rows as { et_event_type: string }[]).map(r => r.et_event_type).sort()
        setOptions(opts)
        cbRef.current?.(opts)
      })
      .catch(console.error)
  }, [])
  return <LookupBase options={options} selected={selected} onChange={onChange} mode={mode} placeholder={placeholder} />
}

// ── TournamentSelect ──────────────────────────────────────────────────────────

export function TournamentSelect({ selected, onChange, mode = 'all', placeholder = 'All', onOptionsLoaded }: LookupProps) {
  const [options, setOptions] = useState<string[]>([])
  const cbRef = useRef(onOptionsLoaded)
  cbRef.current = onOptionsLoaded
  useEffect(() => {
    getAllTournaments()
      .then(rows => {
        const opts = (rows as { tt_tournament: string }[]).map(r => r.tt_tournament).sort()
        setOptions(opts)
        cbRef.current?.(opts)
      })
      .catch(console.error)
  }, [])
  return <LookupBase options={options} selected={selected} onChange={onChange} mode={mode} placeholder={placeholder} />
}
