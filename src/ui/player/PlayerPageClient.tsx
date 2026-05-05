'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getPlayerById, getPartnerStats } from '@/src/lib/actions/players'
import PerformanceChart from './PerformanceChart'
import MyPagination from 'nextjs-shared/MyPagination'

interface ResultRow {
  session_id:   number
  date:         string
  day_of_week:  string
  scoring:      string
  session_type: string
  session_name: string
  club:         string
  tournament:   string
  event_type:   string
  percentage:   number
  vp:           number | null
  partner_id:   number
  partner_name: string
}

interface Player {
  pl_plid:             number
  pl_nz_bridge_number: number
  pl_name:             string
  pl_club:             string
  pl_rank:             string
  pl_grade:            string
  pl_rating:           number
  pl_session_count:    number
  pl_avg_percentage:   number
  pl_a_points:         number
  pl_b_points:         number
  pl_c_points:         number
}

// ── Partner multi-select dropdown ─────────────────────────────────────────────
function PartnerSelect({
  partners, selected, onChange
}: {
  partners: { id: number; name: string; count: number }[]
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

  function toggleAll() {
    onChange(new Set(partners.map(p => p.id)))
  }

  function toggle(id: number) {
    if (allSelected) {
      onChange(new Set([id]))
    } else {
      const next = new Set(selected)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onChange(next)
    }
  }

  return (
    <div ref={ref} className='relative'>
      <button type='button' onClick={() => setOpen(v => !v)}
        className='w-full text-left rounded border border-gray-300 px-1.5 py-0.5 text-xs bg-white truncate'>
        {label}
      </button>
      {open && (
        <div className='absolute left-0 top-full z-20 bg-white border border-gray-200 rounded shadow-lg min-w-max max-h-56 overflow-y-auto'>
          <label className='flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs border-b border-gray-100 font-medium whitespace-nowrap'>
            <input type='checkbox' checked={allSelected} onChange={toggleAll} />
            All
          </label>
          {partners.map(p => (
            <label key={p.id} className='flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs whitespace-nowrap'>
              <input type='checkbox' checked={!allSelected && selected.has(p.id)} onChange={() => toggle(p.id)} />
              {p.name} <span className='text-gray-400'>({p.count})</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── String multi-select dropdown ──────────────────────────────────────────────
function StringMultiSelect({
  options, selected, onChange
}: {
  options: string[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
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

  const allSelected = selected.size === options.length
  const label = allSelected ? 'All' : `${selected.size} / ${options.length}`

  function toggleAll() {
    onChange(new Set(options))
  }

  function toggle(v: string) {
    if (allSelected) {
      onChange(new Set([v]))
    } else {
      const next = new Set(selected)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      onChange(next)
    }
  }

  return (
    <div ref={ref} className='relative'>
      <button type='button' onClick={() => setOpen(v => !v)}
        className='w-full text-left rounded border border-gray-300 px-1.5 py-0.5 text-xs bg-white truncate'>
        {label}
      </button>
      {open && (
        <div className='absolute left-0 top-full z-20 bg-white border border-gray-200 rounded shadow-lg min-w-max max-h-56 overflow-y-auto'>
          <label className='flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs border-b border-gray-100 font-medium whitespace-nowrap'>
            <input type='checkbox' checked={allSelected} onChange={toggleAll} />
            All
          </label>
          {options.map(opt => (
            <label key={opt} className='flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs whitespace-nowrap'>
              <input type='checkbox' checked={!allSelected && selected.has(opt)} onChange={() => toggle(opt)} />
              {opt || '(blank)'}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PlayerPageClient({ playerId }: { playerId: number }) {
  const searchParams = useSearchParams()
  const partnerParam = searchParams.get('partner')
  const filterPartnerId = partnerParam ? parseInt(partnerParam, 10) : null

  const [player,       setPlayer]       = useState<Player | null>(null)
  const [results,      setResults]      = useState<ResultRow[]>([])
  const [partnerStats, setPartnerStats] = useState<{ pa_sessions: number; pa_avg_pct: number } | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  // Filters
  const [dateFrom,           setDateFrom]           = useState('')
  const [dateTo,             setDateTo]             = useState('')
  const [dayFilter,          setDayFilter]          = useState('')
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<Set<number>>(new Set())
  const [scoringFilter,      setScoringFilter]      = useState('')
  const [sessionTypeFilter,  setSessionTypeFilter]  = useState('')
  const [sessionNameFilter,  setSessionNameFilter]  = useState('')
  const [selectedClubs,      setSelectedClubs]      = useState<Set<string>>(new Set())
  const [selectedTournaments,setSelectedTournaments]= useState<Set<string>>(new Set())
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set())
  const [scoreMin,           setScoreMin]           = useState('')
  const [scoreMax,           setScoreMax]           = useState('')

  const [activeTab,    setActiveTab]    = useState<'history' | 'graph'>('history')
  const [currentPage,  setCurrentPage]  = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const uniquePartners = useMemo(() => {
    const seen = new Map<number, { name: string; count: number }>()
    results.forEach(r => {
      const entry = seen.get(r.partner_id)
      if (entry) entry.count++
      else seen.set(r.partner_id, { name: r.partner_name, count: 1 })
    })
    return [...seen.entries()]
      .map(([id, { name, count }]) => ({ id, name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [results])

  const uniqueClubs       = useMemo(() => [...new Set(results.map(r => r.club))].sort(),       [results])
  const uniqueTournaments = useMemo(() => [...new Set(results.map(r => r.tournament))].sort(), [results])
  const uniqueEventTypes  = useMemo(() => [...new Set(results.map(r => r.event_type))].sort(), [results])

  // Initialise all multi-selects to all when results load
  useEffect(() => {
    setSelectedPartnerIds(new Set(results.map(r => r.partner_id)))
    setSelectedClubs(new Set(results.map(r => r.club)))
    setSelectedTournaments(new Set(results.map(r => r.tournament)))
    setSelectedEventTypes(new Set(results.map(r => r.event_type)))
  }, [results])

  const sessionsSorted = useMemo(() => {
    let rows = [...results].sort((a, b) => (a.date > b.date ? -1 : 1))
    if (dateFrom)         rows = rows.filter(r => r.date.slice(0, 10) >= dateFrom)
    if (dateTo)           rows = rows.filter(r => r.date.slice(0, 10) <= dateTo)
    if (dayFilter)        rows = rows.filter(r => r.day_of_week === dayFilter)
    if (selectedPartnerIds.size < uniquePartners.length)
                          rows = rows.filter(r => selectedPartnerIds.has(r.partner_id))
    if (scoringFilter)    rows = rows.filter(r => r.scoring === scoringFilter)
    if (sessionTypeFilter)rows = rows.filter(r => r.session_type === sessionTypeFilter)
    if (sessionNameFilter)     rows = rows.filter(r => r.session_name.toLowerCase().includes(sessionNameFilter.toLowerCase()))
    if (selectedClubs.size < uniqueClubs.length)
                               rows = rows.filter(r => selectedClubs.has(r.club))
    if (selectedTournaments.size < uniqueTournaments.length)
                               rows = rows.filter(r => selectedTournaments.has(r.tournament))
    if (selectedEventTypes.size < uniqueEventTypes.length)
                               rows = rows.filter(r => selectedEventTypes.has(r.event_type))
    if (scoreMin)              rows = rows.filter(r => parseFloat(String(r.percentage)) >= parseFloat(scoreMin))
    if (scoreMax)         rows = rows.filter(r => parseFloat(String(r.percentage)) <= parseFloat(scoreMax))
    return rows
  }, [results, dateFrom, dateTo, dayFilter, selectedPartnerIds, uniquePartners.length,
      scoringFilter, sessionTypeFilter, sessionNameFilter,
      selectedClubs, uniqueClubs.length, selectedTournaments, uniqueTournaments.length,
      selectedEventTypes, uniqueEventTypes.length, scoreMin, scoreMax])

  useEffect(() => { setCurrentPage(1) },
    [dateFrom, dateTo, dayFilter, selectedPartnerIds, scoringFilter, sessionTypeFilter, sessionNameFilter,
     selectedClubs, selectedTournaments, selectedEventTypes, scoreMin, scoreMax])

  useEffect(() => {
    if (isNaN(playerId)) { setError('Invalid player ID'); setLoading(false); return }
    setLoading(true); setResults([])
    async function load() {
      try {
        const url = filterPartnerId
          ? `/api/players/${playerId}/results?partner_id=${filterPartnerId}`
          : `/api/players/${playerId}/results`
        const [playerData, resultsRes, statsRow] = await Promise.all([
          getPlayerById(playerId),
          fetch(url),
          filterPartnerId ? getPartnerStats(playerId, filterPartnerId) : Promise.resolve(null)
        ])
        if (!playerData) { setError(`Player ${playerId} not found`); return }
        setPlayer(playerData as Player)
        if (statsRow) setPartnerStats(statsRow as { pa_sessions: number; pa_avg_pct: number })
        if (resultsRes.ok) setResults(await resultsRes.json())
      } catch (err) { setError(String(err)) }
      finally { setLoading(false) }
    }
    load()
  }, [playerId, filterPartnerId])

  if (loading) return <div className='text-sm text-gray-500 py-8 text-center'>Loading…</div>
  if (error)   return <div className='rounded bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700'>{error}</div>
  if (!player) return null

  const hasFilter = !!(dateFrom || dateTo || dayFilter || scoringFilter || sessionTypeFilter ||
    sessionNameFilter || scoreMin || scoreMax ||
    selectedPartnerIds.size < uniquePartners.length ||
    selectedClubs.size < uniqueClubs.length ||
    selectedTournaments.size < uniqueTournaments.length ||
    selectedEventTypes.size < uniqueEventTypes.length)

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setDayFilter('')
    setSelectedPartnerIds(new Set(results.map(r => r.partner_id)))
    setScoringFilter(''); setSessionTypeFilter(''); setSessionNameFilter('')
    setSelectedClubs(new Set(results.map(r => r.club)))
    setSelectedTournaments(new Set(results.map(r => r.tournament)))
    setSelectedEventTypes(new Set(results.map(r => r.event_type)))
    setScoreMin(''); setScoreMax('')
  }

  // ── Partnership mode ──────────────────────────────────────────────────────
  if (filterPartnerId !== null) {
    const partnerName = results[0]?.partner_name ?? `Player ${filterPartnerId}`
    return (
      <div className='space-y-6'>
        <div className='rounded border border-gray-200 p-4'>
          <Link href={`/player/${playerId}`} className='text-xs text-blue-600 hover:underline'>← {player.pl_name}</Link>
          <h1 className='text-xl font-bold text-gray-900 mt-1'>
            {player.pl_name} <span className='text-gray-400 font-normal'>with</span> {partnerName}
          </h1>
          <div className='flex flex-wrap gap-4 text-sm text-gray-500 mt-1'>
            <span>{partnerStats ? partnerStats.pa_sessions : results.length} session{(partnerStats ? partnerStats.pa_sessions : results.length) !== 1 ? 's' : ''} together</span>
            {partnerStats && partnerStats.pa_avg_pct > 0 && (
              <span>Avg: <strong>{parseFloat(String(partnerStats.pa_avg_pct)).toFixed(2)}%</strong></span>
            )}
          </div>
        </div>
        <div className='rounded border border-gray-200 p-4'>
          {results.length === 0
            ? <div className='text-sm text-gray-400 py-4 text-center'>No results recorded for this partnership</div>
            : <PerformanceChart results={results} />}
        </div>
      </div>
    )
  }

  // ── Full player view ──────────────────────────────────────────────────────
  return (
    <div className='space-y-6'>
      {/* Player info */}
      <div className='rounded border border-gray-200 p-4'>
        <div className='mb-1'>
          <Link href='/' className='text-xs text-blue-600 hover:underline'>← Home</Link>
        </div>
        <h1 className='text-xl font-bold text-gray-900 mb-2'>{player.pl_name}</h1>
        <div className='flex flex-wrap gap-4 text-sm text-gray-600'>
          {player.pl_club && <span>Club: {player.pl_club}</span>}
          {player.pl_rank && <span>Rank: {player.pl_rank}</span>}
          {player.pl_grade && <span>Grade: {player.pl_grade}</span>}
          {player.pl_rating > 0 && <span>Rating: {player.pl_rating}</span>}
          {player.pl_session_count > 0 && <span>Sessions: {player.pl_session_count}</span>}
          {player.pl_avg_percentage > 0 && <span>Avg: {parseFloat(String(player.pl_avg_percentage)).toFixed(2)}%</span>}
        </div>
        {(player.pl_a_points > 0 || player.pl_b_points > 0 || player.pl_c_points > 0) && (
          <div className='flex gap-4 text-sm text-gray-600 mt-2'>
            {player.pl_a_points > 0 && <span>A pts: {player.pl_a_points}</span>}
            {player.pl_b_points > 0 && <span>B pts: {player.pl_b_points}</span>}
            {player.pl_c_points > 0 && <span>C pts: {player.pl_c_points}</span>}
          </div>
        )}
        <div className='mt-1 text-xs text-gray-400'>NZ Bridge #{player.pl_nz_bridge_number}</div>
      </div>

      {/* Tabs */}
      <div className='flex gap-1 border-b border-gray-200'>
        <button onClick={() => setActiveTab('history')}
          className={`px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 ${activeTab === 'history' ? 'bg-white border-gray-200 text-gray-900' : 'bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'}`}>
          Session History
        </button>
        <button onClick={() => setActiveTab('graph')}
          className={`px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 ${activeTab === 'graph' ? 'bg-white border-gray-200 text-gray-900' : 'bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'}`}>
          Graph
        </button>
      </div>

      {/* Session history */}
      {activeTab === 'history' && (
        <div className='rounded border border-gray-200 p-4'>
          <div className='flex items-center justify-between mb-3'>
            <h2 className='text-base font-semibold text-gray-800'>
              Session History
              <span className='ml-2 text-xs font-normal text-gray-400'>{sessionsSorted.length} of {results.length}</span>
            </h2>
            {hasFilter && (
              <button onClick={clearFilters} className='text-xs text-blue-600 hover:underline'>Clear filters</button>
            )}
          </div>
          {results.length === 0 ? (
            <div className='text-sm text-gray-400 py-4 text-center'>No results recorded yet</div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-gray-200'>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Date</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Day</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-36'>Partner</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-16'>Scoring</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-16'>Type</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-36'>Session</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-28'>Club</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Tournament</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Event Type</th>
                    <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-20'>Score</th>
                    <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-16'>VP</th>
                  </tr>
                  <tr className='border-b border-gray-100 bg-gray-50 align-top'>
                    {/* Date: from on top, to below */}
                    <td className='py-1 pr-1'>
                      <div className='flex flex-col gap-0.5'>
                        <input type='date' value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                          className='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal' title='From' />
                        <input type='date' value={dateTo} onChange={e => setDateTo(e.target.value)}
                          className='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal' title='To' />
                      </div>
                    </td>
                    {/* Day */}
                    <td className='py-1 pr-1'>
                      <select value={dayFilter} onChange={e => setDayFilter(e.target.value)}
                        className='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'>
                        <option value=''>All</option>
                        {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d =>
                          <option key={d}>{d}</option>)}
                      </select>
                    </td>
                    {/* Partner multi-select */}
                    <td className='py-1 pr-1'>
                      <PartnerSelect partners={uniquePartners} selected={selectedPartnerIds} onChange={setSelectedPartnerIds} />
                    </td>
                    {/* Scoring */}
                    <td className='py-1 pr-1'>
                      <select value={scoringFilter} onChange={e => setScoringFilter(e.target.value)}
                        className='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'>
                        <option value=''>All</option>
                        <option value='MP'>MP</option>
                        <option value='VP'>VP</option>
                      </select>
                    </td>
                    {/* Type */}
                    <td className='py-1 pr-1'>
                      <select value={sessionTypeFilter} onChange={e => setSessionTypeFilter(e.target.value)}
                        className='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'>
                        <option value=''>All</option>
                        <option value='club'>Club</option>
                        <option value='online'>Online</option>
                      </select>
                    </td>
                    {/* Session name */}
                    <td className='py-1 pr-1'>
                      <input type='text' value={sessionNameFilter} onChange={e => setSessionNameFilter(e.target.value)}
                        placeholder='Search…'
                        className='w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs font-normal' />
                    </td>
                    {/* Club */}
                    <td className='py-1 pr-1'>
                      <StringMultiSelect options={uniqueClubs} selected={selectedClubs} onChange={setSelectedClubs} />
                    </td>
                    {/* Tournament */}
                    <td className='py-1 pr-1'>
                      <StringMultiSelect options={uniqueTournaments} selected={selectedTournaments} onChange={setSelectedTournaments} />
                    </td>
                    {/* Event type */}
                    <td className='py-1 pr-1'>
                      <StringMultiSelect options={uniqueEventTypes} selected={selectedEventTypes} onChange={setSelectedEventTypes} />
                    </td>
                    {/* Score: min on top, max below */}
                    <td className='py-1 pr-1'>
                      <div className='flex flex-col gap-0.5'>
                        <input type='number' value={scoreMin} onChange={e => setScoreMin(e.target.value)}
                          placeholder='Min' min={0} max={100}
                          className='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal' />
                        <input type='number' value={scoreMax} onChange={e => setScoreMax(e.target.value)}
                          placeholder='Max' min={0} max={100}
                          className='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal' />
                      </div>
                    </td>
                    {/* VP — no filter */}
                    <td className='py-1' />
                  </tr>
                </thead>
                <tbody>
                  {sessionsSorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((r, i) => (
                    <tr key={i}
                      className='border-b border-gray-100 hover:bg-gray-50 cursor-pointer'
                      onClick={() => window.location.href = `/session/${r.session_id}`}
                    >
                      <td className='py-1.5'>{r.date.slice(0, 10)}</td>
                      <td className='py-1.5 text-gray-500'>{r.day_of_week}</td>
                      <td className='py-1.5'>
                        <Link href={`/player/${playerId}?partner=${r.partner_id}`}
                          className='text-blue-600 hover:underline'
                          onClick={e => e.stopPropagation()}>
                          {r.partner_name}
                        </Link>
                      </td>
                      <td className='py-1.5 text-gray-500 text-xs'>{r.scoring}</td>
                      <td className='py-1.5 text-gray-500 text-xs'>{r.session_type}</td>
                      <td className='py-1.5 text-gray-500 text-xs'>{r.session_name}</td>
                      <td className='py-1.5 text-gray-500 text-xs'>{r.club}</td>
                      <td className='py-1.5 text-gray-500 text-xs'>{r.tournament}</td>
                      <td className='py-1.5 text-gray-500 text-xs'>{r.event_type}</td>
                      <td className='py-1.5 text-right font-medium'>{parseFloat(String(r.percentage)).toFixed(2)}%</td>
                      <td className='py-1.5 text-right text-gray-500'>
                        {r.vp != null ? parseFloat(String(r.vp)).toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sessionsSorted.length > itemsPerPage && (
            <div className='mt-3 flex items-center gap-3'>
              <select value={itemsPerPage} onChange={e => { setItemsPerPage(parseInt(e.target.value, 10)); setCurrentPage(1) }}
                className='rounded border border-gray-300 px-1.5 py-0.5 text-xs'>
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} rows</option>)}
              </select>
              <span className='text-xs text-gray-400'>p.{currentPage}/{Math.ceil(sessionsSorted.length / itemsPerPage)}</span>
              <MyPagination
                totalPages={Math.ceil(sessionsSorted.length / itemsPerPage)}
                statecurrentPage={currentPage}
                setStateCurrentPage={setCurrentPage}
              />
            </div>
          )}
        </div>
      )}

      {/* Performance chart */}
      {activeTab === 'graph' && (
        <div className='rounded border border-gray-200 p-4'>
          {results.length === 0
            ? <div className='text-sm text-gray-400 py-4 text-center'>No results recorded yet</div>
            : <PerformanceChart results={results} />}
        </div>
      )}
    </div>
  )
}
