'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getPlayerById, getPartnerStats, getPlayerAllGroupStats } from '@/src/lib/actions/players'
import { StringMultiSelect, TournamentSelect, ClubSelect, EventTypeSelect } from '@/src/ui/shared/LookupSelects'
import PerformanceChart from './PerformanceChart'
import PartnersChart from './PartnersChart'
import MyPagination from 'nextjs-shared/MyPagination'

interface ResultRow {
  session_id:      number
  source_id:       number
  date:            string
  day_of_week:     string
  scoring:         string
  session_name:    string
  club:            string
  tournament:      string
  event_type:      string
  percentage:      number
  vp:              number | null
  partner_id:      number
  partner_name:    string
  partner_tracked: boolean
}

interface Player {
  pl_plid:             number
  pl_nz_bridge_number: number
  pl_name:             string
  pl_club:             string
  pl_rank:             string
  pl_grade:            string
  pl_rating:           number
  pl_a_points:         number
  pl_b_points:         number
  pl_c_points:         number
  pl_all_results:      boolean
}

// ── Partner multi-select dropdown ─────────────────────────────────────────────
function PartnerSelect({
  partners, selected, onChange
}: {
  partners: { id: number; name: string; count: number; tracked: boolean }[]
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
  const trackedIds  = partners.filter(p => p.tracked).map(p => p.id)
  const label = allSelected ? 'All' : `${selected.size} / ${partners.length}`

  function toggleAll() {
    onChange(new Set(partners.map(p => p.id)))
  }

  function selectTracked() {
    onChange(new Set(trackedIds))
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
          {trackedIds.length > 0 && (
            <button type='button' onClick={selectTracked}
              className='w-full text-left px-3 py-1 hover:bg-green-50 text-xs text-green-700 font-medium border-b border-gray-100 whitespace-nowrap'>
              ● Select tracked ({trackedIds.length})
            </button>
          )}
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

// ── Main component ────────────────────────────────────────────────────────────
export default function PlayerPageClient({ playerId }: { playerId: number }) {
  const searchParams = useSearchParams()
  const partnerParam = searchParams.get('partner')
  const filterPartnerId = partnerParam ? parseInt(partnerParam, 10) : null

  const [player,       setPlayer]       = useState<Player | null>(null)
  const [results,      setResults]      = useState<ResultRow[]>([])
  const [partnerStats, setPartnerStats] = useState<{ a2_mp_sessions: number; a2_mp_avg_pct: number; a2_vp_sessions: number; a2_vp_avg_vp: number } | null>(null)
  const [playerStats,  setPlayerStats]  = useState<{ a1_group: string; a1_mp_sessions: number; a1_mp_avg_pct: number; a1_vp_sessions: number; a1_vp_avg_vp: number }[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  // Filters
  const [dateFrom,           setDateFrom]           = useState('')
  const [dateTo,             setDateTo]             = useState('')
  const [dayFilter,          setDayFilter]          = useState('')
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<Set<number>>(new Set())
  const [scoring,            setScoring]            = useState<'MP' | 'VP'>('MP')

  const [sessionNameFilter,  setSessionNameFilter]  = useState('')
  const [selectedClubs,      setSelectedClubs]      = useState<Set<string>>(new Set())
  const [clubOptions,        setClubOptions]        = useState<string[]>([])
  const [selectedTournaments,setSelectedTournaments]= useState<Set<string>>(new Set())
  const [tournamentOptions,  setTournamentOptions]  = useState<string[]>([])
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set())
  const [eventTypeOptions,   setEventTypeOptions]   = useState<string[]>([])
  const [activeTab,    setActiveTab]    = useState<'history' | 'graph' | 'partners'>('history')
  const [currentPage,  setCurrentPage]  = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const uniquePartners = useMemo(() => {
    const seen = new Map<number, { name: string; count: number; tracked: boolean }>()
    results.forEach(r => {
      const entry = seen.get(r.partner_id)
      if (entry) entry.count++
      else seen.set(r.partner_id, { name: r.partner_name, count: 1, tracked: Boolean(r.partner_tracked) })
    })
    return [...seen.entries()]
      .map(([id, { name, count, tracked }]) => ({ id, name, count, tracked }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [results])


  // Initialise multi-selects to all when results load
  useEffect(() => {
    setSelectedPartnerIds(new Set(results.map(r => r.partner_id)))
  }, [results])

  const sessionsSorted = useMemo(() => {
    let rows = [...results].sort((a, b) => (a.date > b.date ? -1 : 1))
    if (dateFrom)         rows = rows.filter(r => r.date.slice(0, 10) >= dateFrom)
    if (dateTo)           rows = rows.filter(r => r.date.slice(0, 10) <= dateTo)
    if (dayFilter)        rows = rows.filter(r => r.day_of_week === dayFilter)
    if (selectedPartnerIds.size < uniquePartners.length)
                          rows = rows.filter(r => selectedPartnerIds.has(r.partner_id))
    rows = rows.filter(r => r.scoring === scoring)

    if (sessionNameFilter)     rows = rows.filter(r => r.session_name.toLowerCase().includes(sessionNameFilter.toLowerCase()))
    if (selectedClubs.size < clubOptions.length)
                               rows = rows.filter(r => selectedClubs.has(r.club))
    if (selectedTournaments.size < tournamentOptions.length)
                               rows = rows.filter(r => selectedTournaments.has(r.tournament))
    if (selectedEventTypes.size < eventTypeOptions.length)
                               rows = rows.filter(r => selectedEventTypes.has(r.event_type))
    return rows
  }, [results, dateFrom, dateTo, dayFilter, selectedPartnerIds, uniquePartners.length,
      scoring, sessionNameFilter,
      selectedClubs, clubOptions.length, selectedTournaments, tournamentOptions.length,
      selectedEventTypes, eventTypeOptions.length])

  const visiblePartners = useMemo(() => {
    const seen = new Map<number, string>()
    sessionsSorted.forEach(r => { if (!seen.has(r.partner_id)) seen.set(r.partner_id, r.partner_name) })
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [sessionsSorted])

  useEffect(() => { setCurrentPage(1) },
    [dateFrom, dateTo, dayFilter, selectedPartnerIds, scoring, sessionNameFilter,
     selectedClubs, selectedTournaments, selectedEventTypes])

  useEffect(() => {
    if (isNaN(playerId)) { setError('Invalid player ID'); setLoading(false); return }
    setLoading(true); setResults([])
    async function load() {
      try {
        const url = filterPartnerId
          ? `/api/players/${playerId}/results?partner_id=${filterPartnerId}`
          : `/api/players/${playerId}/results`
        const [playerData, resultsRes, statsRow, allStats] = await Promise.all([
          getPlayerById(playerId),
          fetch(url),
          filterPartnerId ? getPartnerStats(playerId, filterPartnerId) : Promise.resolve(null),
          getPlayerAllGroupStats(playerId)
        ])
        if (!playerData) { setError(`Player ${playerId} not found`); return }
        setPlayer(playerData as Player)
        if (statsRow) setPartnerStats(statsRow as { a2_mp_sessions: number; a2_mp_avg_pct: number; a2_vp_sessions: number; a2_vp_avg_vp: number })
        if (allStats?.length) setPlayerStats(allStats)
        if (resultsRes.ok) setResults(await resultsRes.json())
      } catch (err) { setError(String(err)) }
      finally { setLoading(false) }
    }
    load()
  }, [playerId, filterPartnerId])

  if (loading) return <div className='text-sm text-gray-500 py-8 text-center'>Loading…</div>
  if (error)   return <div className='rounded bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700'>{error}</div>
  if (!player) return null

  const hasFilter = !!(dateFrom || dateTo || dayFilter ||
    sessionNameFilter ||
    selectedPartnerIds.size < uniquePartners.length ||
    selectedClubs.size < clubOptions.length ||
    selectedTournaments.size < tournamentOptions.length ||
    selectedEventTypes.size < eventTypeOptions.length)

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setDayFilter('')
    setSelectedPartnerIds(new Set(results.map(r => r.partner_id)))
    setSessionNameFilter('')
    setSelectedClubs(new Set(clubOptions))
    setSelectedTournaments(new Set(tournamentOptions))
    setSelectedEventTypes(new Set(eventTypeOptions))
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
            <span>{partnerStats ? partnerStats.a2_mp_sessions + partnerStats.a2_vp_sessions : results.length} session{(partnerStats ? partnerStats.a2_mp_sessions + partnerStats.a2_vp_sessions : results.length) !== 1 ? 's' : ''} together</span>
            {partnerStats && partnerStats.a2_mp_avg_pct > 0 && (
              <span>MP Avg: <strong>{parseFloat(String(partnerStats.a2_mp_avg_pct)).toFixed(2)}%</strong></span>
            )}
            {partnerStats && partnerStats.a2_vp_avg_vp > 0 && (
              <span>VP Avg: <strong>{parseFloat(String(partnerStats.a2_vp_avg_vp)).toFixed(2)}</strong></span>
            )}
          </div>
        </div>
        <div className='rounded border border-gray-200 p-4'>
          {results.length === 0
            ? <div className='text-sm text-gray-400 py-4 text-center'>No results recorded for this partnership</div>
            : <PerformanceChart results={results} scoring={scoring} />}
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
        <div className='flex items-baseline gap-3 mb-2'>
          <h1 className='text-xl font-bold text-gray-900'>{player.pl_name}</h1>
          <span className='text-xs text-gray-400'>NZ Bridge #{player.pl_nz_bridge_number}</span>
          {player.pl_all_results && (
            <span className='rounded-full bg-green-100 border border-green-300 px-2 py-0.5 text-xs font-medium text-green-700'>Tracked</span>
          )}
        </div>
        <div className='flex flex-wrap gap-4 text-sm text-gray-600'>
          {player.pl_club && <span>Club: {player.pl_club}</span>}
          {player.pl_rank && <span>Rank: {player.pl_rank}</span>}
          {player.pl_grade && <span>Grade: {player.pl_grade}</span>}
          {player.pl_rating > 0 && <span>Rating: {player.pl_rating}</span>}
          {player.pl_a_points > 0 && <span>A pts: {player.pl_a_points}</span>}
          {player.pl_b_points > 0 && <span>B pts: {player.pl_b_points}</span>}
          {player.pl_c_points > 0 && <span>C pts: {player.pl_c_points}</span>}
        </div>
        {playerStats.length > 0 && (() => {
          const byGrp = Object.fromEntries(playerStats.map(r => [r.a1_group, r]))
          const grps = (['A', 'B', 'C', 'all'] as const).filter(g => byGrp[g])
          return (
            <table className='mt-2 text-sm text-gray-600'>
              <thead>
                <tr>
                  <th className='text-center font-semibold text-gray-500 pb-0 px-4 align-bottom' rowSpan={2}>Tournament<br/>Type</th>
                  <th colSpan={2} className='text-center font-semibold text-gray-500 pb-0 px-6'>MP</th>
                  <th className='w-6' />
                  <th colSpan={2} className='text-center font-semibold text-gray-500 pb-0 px-6'>VP</th>
                </tr>
                <tr>
                  <th className='text-right text-gray-400 font-normal pb-1 px-4'>Avg</th>
                  <th className='text-right text-gray-400 font-normal pb-1 px-4'>Sessions</th>
                  <th />
                  <th className='text-right text-gray-400 font-normal pb-1 px-4'>Avg</th>
                  <th className='text-right text-gray-400 font-normal pb-1 px-4'>Sessions</th>
                </tr>
              </thead>
              <tbody>
                {grps.map(g => {
                  const r = byGrp[g]
                  const label = g === 'all' ? 'All' : g
                  return (
                    <tr key={g}>
                      <td className='text-center text-gray-600 py-0.5 px-4'>{label}</td>
                      <td className='text-right font-medium text-gray-700 py-0.5 px-4'>
                        {r.a1_mp_sessions > 0 ? `${parseFloat(String(r.a1_mp_avg_pct)).toFixed(2)}%` : '—'}
                      </td>
                      <td className='text-right text-gray-500 py-0.5 px-4'>
                        {r.a1_mp_sessions > 0 ? r.a1_mp_sessions : ''}
                      </td>
                      <td />
                      <td className='text-right font-medium text-gray-700 py-0.5 px-4'>
                        {r.a1_vp_sessions > 0 ? parseFloat(String(r.a1_vp_avg_vp)).toFixed(2) : '—'}
                      </td>
                      <td className='text-right text-gray-500 py-0.5 px-4'>
                        {r.a1_vp_sessions > 0 ? r.a1_vp_sessions : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        })()}
      </div>

      {/* Tabs */}
      <div className='flex gap-1 border-b border-gray-200'>
        {(['history', 'graph', 'partners'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 ${activeTab === tab ? 'bg-white border-gray-200 text-gray-900' : 'bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'}`}>
            {tab === 'history' ? 'Session History' : tab === 'graph' ? 'Partner-Me' : 'Partners-All'}
          </button>
        ))}
      </div>

      {/* Session history */}
      {activeTab === 'history' && (
        <div className='rounded border border-gray-200 p-4'>
          <div className='flex items-center justify-between mb-3'>
            <div className='flex items-center gap-3'>
              <h2 className='text-base font-semibold text-gray-800'>
                Session History
                <span className='ml-2 text-xs font-normal text-gray-400'>{sessionsSorted.length} of {results.length}</span>
              </h2>
              <div className='flex rounded border border-gray-300 overflow-hidden text-xs'>
                {(['MP', 'VP'] as const).map(s => (
                  <button key={s} onClick={() => setScoring(s)}
                    className={`px-2 py-0.5 ${scoring === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
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
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-20'>Source</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Date</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Day</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-36'>Partner</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-36'>Session</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-28'>Club</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Tournament</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Event Type</th>
                    <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-20'>Result</th>
                  </tr>
                  <tr className='border-b border-gray-100 bg-gray-50 align-top'>
                    {/* Source — no filter */}
                    <td className='py-1' />
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
                    {/* Session name */}
                    <td className='py-1 pr-1'>
                      <input type='text' value={sessionNameFilter} onChange={e => setSessionNameFilter(e.target.value)}
                        placeholder='Search…'
                        className='w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs font-normal' />
                    </td>
                    {/* Club */}
                    <td className='py-1 pr-1'>
                      <ClubSelect mode='all' selected={selectedClubs} onChange={setSelectedClubs}
                        onOptionsLoaded={opts => { setClubOptions(opts); setSelectedClubs(new Set(opts)) }} />
                    </td>
                    {/* Tournament */}
                    <td className='py-1 pr-1'>
                      <TournamentSelect mode='all' selected={selectedTournaments} onChange={setSelectedTournaments}
                        onOptionsLoaded={opts => { setTournamentOptions(opts); setSelectedTournaments(new Set(opts)) }} />
                    </td>
                    {/* Event type */}
                    <td className='py-1 pr-1'>
                      <EventTypeSelect mode='all' selected={selectedEventTypes} onChange={setSelectedEventTypes}
                        onOptionsLoaded={opts => { setEventTypeOptions(opts); setSelectedEventTypes(new Set(opts)) }} />
                    </td>
                    {/* Result — no filter */}
                    <td className='py-1' />
                  </tr>
                </thead>
                <tbody>
                  {sessionsSorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((r, i) => (
                    <tr key={i}
                      className='border-b border-gray-100 hover:bg-gray-50 cursor-pointer'
                      onClick={() => window.location.href = `/session/${r.session_id}`}
                    >
                      <td className='py-1.5 text-gray-400 text-xs font-mono'>{r.source_id}</td>
                      <td className='py-1.5'>{r.date.slice(0, 10)}</td>
                      <td className='py-1.5 text-gray-500'>{r.day_of_week}</td>
                      <td className='py-1.5'>
                        <Link href={`/player/${playerId}?partner=${r.partner_id}`}
                          className='text-blue-600 hover:underline'
                          onClick={e => e.stopPropagation()}>
                          {r.partner_name}
                        </Link>
                      </td>
                      <td className='py-1.5 text-gray-500 text-xs'>{r.session_name}</td>
                      <td className='py-1.5 text-gray-500 text-xs'>{r.club}</td>
                      <td className='py-1.5 text-gray-500 text-xs'>{r.tournament}</td>
                      <td className='py-1.5 text-gray-500 text-xs'>{r.event_type}</td>
                      <td className='py-1.5 text-right font-medium'>
                        {scoring === 'MP'
                          ? `${parseFloat(String(r.percentage)).toFixed(2)}%`
                          : parseFloat(String(r.vp ?? 0)).toFixed(2)}
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
            : <>
                {(() => {
                  const reduced = visiblePartners.length < uniquePartners.length
                  return (
                    <div className={`mb-3 rounded px-3 py-1.5 text-xs font-medium ${reduced ? 'bg-amber-100 border border-amber-300 text-amber-800' : 'bg-green-50 border border-green-200 text-green-700'}`}>
                      {reduced
                        ? `Filtered session history · ${visiblePartners.length} of ${uniquePartners.length} partners shown`
                        : `All partners · ${uniquePartners.length} partners`}
                    </div>
                  )
                })()}
                <PerformanceChart results={sessionsSorted} scoring={scoring} />
              </>}
        </div>
      )}

      {/* Partners chart */}
      {activeTab === 'partners' && (
        <div className='rounded border border-gray-200 p-4'>
          {results.length === 0
            ? <div className='text-sm text-gray-400 py-4 text-center'>No results recorded yet</div>
            : <>
                {(() => {
                  const reduced = visiblePartners.length < uniquePartners.length
                  return (
                    <div className={`mb-3 rounded px-3 py-1.5 text-xs font-medium ${reduced ? 'bg-amber-100 border border-amber-300 text-amber-800' : 'bg-green-50 border border-green-200 text-green-700'}`}>
                      {reduced
                        ? `Filtered session history · ${visiblePartners.length} of ${uniquePartners.length} partners shown`
                        : `All partners · ${uniquePartners.length} partners`}
                    </div>
                  )
                })()}
                <PartnersChart partners={visiblePartners} self={{ id: playerId, name: player.pl_name }} />
              </>}
        </div>
      )}
    </div>
  )
}
