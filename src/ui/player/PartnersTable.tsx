'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import MyPagination from 'nextjs-shared/MyPagination'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import { MyTab } from 'nextjs-shared/MyTab'
import { NB_BACK_FROM_KEY, EARLIEST_DATA_DATE, ROWS_PER_PAGE } from '@/src/lib/constants'
import { StringMultiSelect, ClubSelect, EventTypeSelect } from '@/src/ui/shared/LookupSelects'
import PerformanceChart from './PerformanceChart'

interface PartnerEntry {
  id: number
  name: string
  nz_number: number | null
  count: number
  tracked: boolean
}

interface ResultRow {
  session_id:        number
  run_id:            number
  date:              string
  day_of_week:       string
  scoring:           string
  session_name:      string
  club:              string
  tournament:        string
  event_type:        string
  is_summary:        boolean | null
  percentage:        number
  vp:                number | null
  partner_id:        number
  partner_name:      string | null
  partner_nz_number: number | null
}

interface FlatRow extends ResultRow {
  player_id:   number
  player_name: string
}

function PlayerSelect({
  partners, selected, onChange
}: {
  partners: PartnerEntry[]
  selected: Set<number>
  onChange: (s: Set<number>) => void
}) {
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

  const allSelected = selected.size === partners.length
  const label = allSelected ? 'All' : `${selected.size} / ${partners.length}`

  function toggleAll() { onChange(new Set(partners.map(p => p.id))) }

  function toggle(id: number) {
    if (allSelected) {
      onChange(new Set([id]))
    } else {
      const next = new Set(selected)
      if (next.has(id)) next.delete(id); else next.add(id)
      onChange(next)
    }
  }

  return (
    <div ref={ref} className='relative'>
      <MyButton type='button' onClick={() => setOpen(v => !v)}
        overrideClass='w-full text-left rounded border border-gray-300 px-1.5 py-0.5 text-xs bg-white truncate text-gray-700 justify-start h-auto md:h-auto'>
        {label}
      </MyButton>
      {open && (
        <div className='absolute left-0 top-full z-20 bg-white border border-gray-200 rounded shadow-lg min-w-max max-h-56 overflow-y-auto'>
          <label className='flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs border-b border-gray-100 font-medium whitespace-nowrap'>
            <input type='checkbox' checked={allSelected} onChange={toggleAll} />
            All
          </label>
          {partners.map(p => (
            <label key={p.id} className={`flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs whitespace-nowrap ${p.tracked ? 'text-green-700' : ''}`}>
              <input type='checkbox' checked={!allSelected && selected.has(p.id)} onChange={() => toggle(p.id)} />
              {p.name} <span className='text-gray-400'>({p.count})</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PartnersTable({ partners }: { partners: PartnerEntry[] }) {
  const [partnerResults,    setPartnerResults]    = useState<Map<number, ResultRow[]>>(new Map())
  const [loading,           setLoading]           = useState(false)
  const [view,         setView]         = useState<'data' | 'graph'>('data')
  const [graphScoring, setGraphScoring] = useState<'MP' | 'VP'>('MP')

  const [dateFrom,           setDateFrom]           = useState('')
  const [dateTo,             setDateTo]             = useState('')
  const [dayFilter,          setDayFilter]          = useState('')
  const [scoringFilter,      setScoringFilter]      = useState<'all' | 'MP' | 'VP'>('all')
  const [summaryFilter,      setSummaryFilter]      = useState<'all' | 'summary' | 'session'>('all')
  const [selectedPlayerIds,  setSelectedPlayerIds]  = useState<Set<number>>(new Set())
  const [sessionNameFilter,  setSessionNameFilter]  = useState('')
  const [selectedClubs,      setSelectedClubs]      = useState<Set<string>>(new Set())
  const [clubOptions,        setClubOptions]        = useState<string[]>([])
  const [selectedTournaments,setSelectedTournaments]= useState<Set<string>>(new Set(['A', 'B', 'C']))
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set())
  const [eventTypeOptions,   setEventTypeOptions]   = useState<string[]>([])
  const [currentPage,        setCurrentPage]        = useState(1)
  const [itemsPerPage,       setItemsPerPage]       = useState(ROWS_PER_PAGE)

  useEffect(() => {
    if (partners.length === 0) { setPartnerResults(new Map()); return }
    setLoading(true)
    Promise.all(
      partners.map(async p => {
        try {
          const r = await fetch(`/api/players/${p.id}/results`)
          const rows: ResultRow[] = await r.json()
          return { id: p.id, rows }
        } catch {
          return { id: p.id, rows: [] as ResultRow[] }
        }
      })
    ).then(results => {
      const map = new Map<number, ResultRow[]>()
      results.forEach(({ id, rows }) => map.set(id, rows))
      setPartnerResults(map)
      setLoading(false)
    })
  }, [partners])

  useEffect(() => {
    setSelectedPlayerIds(new Set(partners.map(p => p.id)))
  }, [partners])

  useEffect(() => { setCurrentPage(1) },
    [dateFrom, dateTo, dayFilter, selectedPlayerIds, scoringFilter, sessionNameFilter,
     selectedClubs, selectedTournaments, selectedEventTypes, summaryFilter])

  const allRows: FlatRow[] = useMemo(() => {
    const rows: FlatRow[] = []
    partners.forEach(p => {
      ;(partnerResults.get(p.id) ?? []).forEach(r => {
        rows.push({ ...r, player_id: p.id, player_name: p.name })
      })
    })
    return rows.sort((a, b) => (a.date > b.date ? -1 : 1))
  }, [partners, partnerResults])

  const filtered = useMemo(() => {
    let rows = allRows
    if (selectedPlayerIds.size < partners.length) rows = rows.filter(r => selectedPlayerIds.has(r.player_id))
    if (dateFrom)          rows = rows.filter(r => r.date.slice(0, 10) >= dateFrom)
    if (dateTo)            rows = rows.filter(r => r.date.slice(0, 10) <= dateTo)
    if (dayFilter)         rows = rows.filter(r => r.day_of_week === dayFilter)
    if (scoringFilter !== 'all') rows = rows.filter(r => r.scoring === scoringFilter)
    if (sessionNameFilter) rows = rows.filter(r => r.session_name.toLowerCase().includes(sessionNameFilter.toLowerCase()))
    if (selectedClubs.size < clubOptions.length)
                           rows = rows.filter(r => selectedClubs.has(r.club))
    if (selectedTournaments.size < 3)
                           rows = rows.filter(r => selectedTournaments.has((r.tournament ?? '').match(/[ABC]$/i)?.[0]?.toUpperCase() ?? ''))
    if (selectedEventTypes.size < eventTypeOptions.length)
                           rows = rows.filter(r => selectedEventTypes.has(r.event_type))
    if (summaryFilter === 'summary') rows = rows.filter(r => r.is_summary === true)
    if (summaryFilter === 'session') rows = rows.filter(r => r.is_summary !== true)
    return rows
  }, [allRows, selectedPlayerIds, partners.length, dateFrom, dateTo, dayFilter,
      scoringFilter, sessionNameFilter, selectedClubs, clubOptions.length,
      selectedTournaments, selectedEventTypes, eventTypeOptions.length, summaryFilter])

  // Remap for PerformanceChart: group lines by player_id (the main player's partners)
  const graphRows = useMemo(() => filtered.map(r => ({
    session_id:   r.session_id,
    date:         r.date,
    day_of_week:  r.day_of_week,
    percentage:   r.percentage ?? 0,
    vp:           r.vp,
    scoring:      r.scoring,
    tournament:   r.tournament,
    partner_id:   r.player_id,
    partner_name: r.player_name,
    is_summary:   r.is_summary,
  })), [filtered])

  function escCsv(v: string | number | null | undefined) {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }

  function exportCSV() {
    const header = ['Player','Run ID','Date','Day','Partner','Partner NZB#','Session','Club','Tournament','Event Type','Scoring','Summary','%','VP']
    const dataRows = filtered.map(r => [
      r.player_name,
      r.run_id,
      r.date.slice(0, 10),
      r.day_of_week,
      r.partner_name ?? '',
      r.partner_nz_number ?? '',
      r.session_name,
      r.club,
      r.tournament,
      r.event_type,
      r.scoring,
      r.is_summary === true ? 'Summary' : r.is_summary === null ? '?' : 'Session',
      r.scoring === 'MP' ? parseFloat(String(r.percentage)).toFixed(2) : '',
      r.scoring === 'VP' ? parseFloat(String(r.vp ?? 0)).toFixed(2) : '',
    ].map(escCsv).join(','))
    const csv = [header.join(','), ...dataRows].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'partners_sessions.csv'
    a.click(); URL.revokeObjectURL(url)
  }

  if (partners.length === 0) {
    return <div className='text-sm text-gray-400 py-4 text-center'>No partners</div>
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between mb-3'>
        <div className='flex items-center gap-3'>
          <h2 className='text-base font-semibold text-gray-800'>
            All Partners History
            <span className='ml-2 text-xs font-normal text-gray-400'>{filtered.length} of {allRows.length}</span>
          </h2>
          {loading && <span className='text-xs text-gray-400'>Loading…</span>}
          {/* Data / Graph sub-tabs */}
          <div className='flex rounded border border-gray-300 overflow-hidden text-xs'>
            {(['data', 'graph'] as const).map(v => (
              <MyTab key={v} variant='pill' active={view === v} onClick={() => setView(v)}
                pillActiveClass='px-2 py-0.5 capitalize rounded-none border-0 bg-blue-600 text-white'
                pillInactiveClass='px-2 py-0.5 capitalize rounded-none border-0 bg-white text-gray-700 hover:bg-gray-50'>
                {v}
              </MyTab>
            ))}
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <MyButton onClick={exportCSV} disabled={loading || filtered.length === 0}
            overrideClass='text-xs rounded border border-gray-300 bg-white px-2 py-0.5 hover:bg-gray-50 disabled:opacity-50 text-gray-700 h-auto md:h-auto'>
            Export CSV
          </MyButton>
        </div>
      </div>

      {view === 'graph' ? (
        <div>
          <div className='flex items-center gap-2 mb-3'>
            <div className='flex rounded border border-gray-300 overflow-hidden text-xs'>
              {(['MP', 'VP'] as const).map(s => (
                <button key={s} onClick={() => setGraphScoring(s)}
                  className={`px-2 py-0.5 ${graphScoring === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          {graphRows.length > 0
            ? <PerformanceChart results={graphRows} scoring={graphScoring} />
            : <div className='text-sm text-gray-400 py-4 text-center'>No data to graph</div>}
        </div>
      ) : (
      <div className='overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-gray-200'>
              <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-32'>Player</th>
              <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-20'>Run ID</th>
              <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Date</th>
              <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Day</th>
              <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-32'>Partner</th>
              <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-36'>Session</th>
              <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-28'>Club</th>
              <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Tournament</th>
              <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Event Type</th>
              <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-16'>Scoring</th>
              <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-20'>Summary</th>
              <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-16'>%</th>
              <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-16'>VP</th>
            </tr>
            <tr className='border-b border-gray-100 bg-gray-50 align-top'>
              <td className='py-1 pr-1'>
                <PlayerSelect partners={partners} selected={selectedPlayerIds} onChange={setSelectedPlayerIds} />
              </td>
              <td className='py-1' />
              <td className='py-1 pr-1'>
                <div className='flex flex-col gap-0.5'>
                  <MyInput type='date' value={dateFrom} min={EARLIEST_DATA_DATE} max={new Date().toISOString().slice(0, 10)} onChange={e => setDateFrom(e.target.value)}
                    overrideClass='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto' title='From' />
                  <MyInput type='date' value={dateTo} min={EARLIEST_DATA_DATE} max={new Date().toISOString().slice(0, 10)} onChange={e => setDateTo(e.target.value)}
                    overrideClass='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto' title='To' />
                </div>
              </td>
              <td className='py-1 pr-1'>
                <MySelect value={dayFilter} onChange={e => setDayFilter(e.target.value)}
                  overrideClass='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto'>
                  <option value=''>All</option>
                  {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d =>
                    <option key={d}>{d}</option>)}
                </MySelect>
              </td>
              <td className='py-1' />
              <td className='py-1 pr-1'>
                <MyInput type='text' value={sessionNameFilter} onChange={e => setSessionNameFilter(e.target.value)}
                  placeholder='Search…'
                  overrideClass='w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs font-normal h-auto md:h-auto' />
              </td>
              <td className='py-1 pr-1'>
                <ClubSelect mode='all' selected={selectedClubs} onChange={setSelectedClubs}
                  onOptionsLoaded={opts => { setClubOptions(opts); setSelectedClubs(new Set(opts)) }} />
              </td>
              <td className='py-1 pr-1'>
                <StringMultiSelect options={['A', 'B', 'C']} selected={selectedTournaments} onChange={setSelectedTournaments} />
              </td>
              <td className='py-1 pr-1'>
                <EventTypeSelect mode='all' selected={selectedEventTypes} onChange={setSelectedEventTypes}
                  onOptionsLoaded={opts => { setEventTypeOptions(opts); setSelectedEventTypes(new Set(opts)) }} />
              </td>
              <td className='py-1 pr-1'>
                <MySelect value={scoringFilter} onChange={e => setScoringFilter(e.target.value as 'all' | 'MP' | 'VP')}
                  overrideClass='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto'>
                  <option value='all'>All</option>
                  <option value='MP'>MP</option>
                  <option value='VP'>VP</option>
                </MySelect>
              </td>
              <td className='py-1 pr-1'>
                <MySelect value={summaryFilter} onChange={e => setSummaryFilter(e.target.value as 'all' | 'summary' | 'session')}
                  overrideClass='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto'>
                  <option value='all'>All</option>
                  <option value='summary'>Summary</option>
                  <option value='session'>Session</option>
                </MySelect>
              </td>
              <td className='py-1' />
              <td className='py-1' />
            </tr>
          </thead>
          <tbody>
            {filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((r, i) => (
              <tr key={i}
                className='border-b border-gray-100 hover:bg-gray-50 cursor-pointer'
                onClick={() => {
                  sessionStorage.setItem(NB_BACK_FROM_KEY, window.location.pathname + window.location.search)
                  window.location.href = `/session/${r.session_id}`
                }}
              >
                <td className='py-1.5'>
                  <Link href={`/player/${r.player_id}`}
                    className='text-blue-600 hover:underline font-medium'
                    onClick={e => { e.stopPropagation(); sessionStorage.setItem(NB_BACK_FROM_KEY, window.location.pathname + window.location.search) }}>
                    {r.player_name}
                  </Link>
                </td>
                <td className='py-1.5 text-gray-400 text-xs font-mono'>{r.run_id}</td>
                <td className='py-1.5'>{r.date.slice(0, 10)}</td>
                <td className='py-1.5 text-gray-500'>{r.day_of_week}</td>
                <td className='py-1.5'>
                  {r.partner_name
                    ? <Link href={`/player/${r.partner_id}`} className='text-blue-600 hover:underline'
                        onClick={e => { e.stopPropagation(); sessionStorage.setItem(NB_BACK_FROM_KEY, window.location.pathname + window.location.search) }}>
                        {r.partner_name}
                      </Link>
                    : '—'}
                </td>
                <td className='py-1.5 text-gray-500 text-xs'>{r.session_name}</td>
                <td className='py-1.5 text-gray-500 text-xs'>{r.club}</td>
                <td className='py-1.5 text-gray-500 text-xs'>{r.tournament}</td>
                <td className='py-1.5 text-gray-500 text-xs'>{r.event_type}</td>
                <td className='py-1.5 text-xs text-gray-500'>{r.scoring}</td>
                <td className='py-1.5'>
                  {r.is_summary === true
                    ? <span className='rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700'>Summary</span>
                    : <span className='text-gray-400 text-xs'>{r.is_summary === null ? '?' : 'Session'}</span>}
                </td>
                <td className='py-1.5 text-right font-medium text-xs'>
                  {r.scoring === 'MP' ? `${parseFloat(String(r.percentage)).toFixed(2)}%` : ''}
                </td>
                <td className='py-1.5 text-right font-medium text-xs'>
                  {r.scoring === 'VP' ? parseFloat(String(r.vp ?? 0)).toFixed(2) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {view === 'data' && filtered.length > itemsPerPage && (
        <div className='mt-3 flex items-center gap-3'>
          <MySelect value={itemsPerPage} onChange={e => { setItemsPerPage(parseInt(e.target.value, 10)); setCurrentPage(1) }}
            overrideClass='rounded border border-gray-300 px-1.5 py-0.5 text-xs h-auto md:h-auto w-auto'>
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} rows</option>)}
          </MySelect>
          <span className='text-xs text-gray-400'>p.{currentPage}/{Math.ceil(filtered.length / itemsPerPage)}</span>
          <MyPagination
            totalPages={Math.ceil(filtered.length / itemsPerPage)}
            statecurrentPage={currentPage}
            setStateCurrentPage={setCurrentPage}
          />
        </div>
      )}
    </div>
  )
}
