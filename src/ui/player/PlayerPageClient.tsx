'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getPlayerById, getPartnerStats, getPlayerAllGroupStats } from '@/src/lib/actions/players'
import { StringMultiSelect, ClubSelect, EventTypeSelect } from '@/src/ui/shared/LookupSelects'
import PerformanceChart from './PerformanceChart'
import PartnersTable from './PartnersTable'
import MyPagination from 'nextjs-shared/MyPagination'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import { MyTab } from 'nextjs-shared/MyTab'
import { MyBackHomeNav } from 'nextjs-shared/MyBackHomeNav'
import { ROWS_PER_PAGE } from '@/src/lib/tableUtils'
import { NB_BACK_FROM_KEY } from '@/src/lib/constants'

interface ResultRow {
  session_id:      number
  run_id:       number
  date:            string
  day_of_week:     string
  scoring:         string
  session_name:    string
  club:            string
  tournament:      string
  event_type:      string
  is_summary:      boolean | null
  percentage:      number
  vp:              number | null
  partner_id:         number
  partner_name:       string
  partner_nz_number:  number | null
  partner_tracked:    boolean
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

const playerStorageKey = (id: number) => `player_state_${id}`
function loadPlayerSaved(id: number) {
  try { return JSON.parse(sessionStorage.getItem(playerStorageKey(id)) ?? 'null') } catch { return null }
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
          {trackedIds.length > 0 && (
            <MyButton type='button' onClick={selectTracked}
              overrideClass='w-full text-left px-3 py-1 hover:bg-green-50 text-xs text-green-700 font-medium border-b border-gray-100 whitespace-nowrap bg-white justify-start h-auto md:h-auto rounded-none'>
              ● Select tracked ({trackedIds.length})
            </MyButton>
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
  const restoredRef  = useRef(false)
  const savedRef     = useRef<Record<string, unknown> | null>(null)

  const [backPath, setBackPath] = useState<string | null>(null)
  useEffect(() => {
    setBackPath(sessionStorage.getItem(NB_BACK_FROM_KEY))
    sessionStorage.removeItem(NB_BACK_FROM_KEY)
  }, [])

  const [player,       setPlayer]       = useState<Player | null>(null)
  const [results,      setResults]      = useState<ResultRow[]>([])
  const [partnerStats, setPartnerStats] = useState<{ a2_mp_sessions: number; a2_mp_avg_pct: number; a2_vp_sessions: number; a2_vp_avg_vp: number } | null>(null)
  const [playerStats,  setPlayerStats]  = useState<{
    a1_group: string; a1_mp_sessions: number; a1_mp_avg_pct: number; a1_mp_stddev: number | null; mp_pct_rank: number | null;
    a1_vp_sessions: number; a1_vp_avg_vp: number; a1_vp_stddev: number | null; vp_pct_rank: number | null
  }[]>([])
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
  const [selectedTournaments,setSelectedTournaments]= useState<Set<string>>(new Set(['A', 'B', 'C']))
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set())
  const [eventTypeOptions,   setEventTypeOptions]   = useState<string[]>([])
  const [summaryFilter,        setSummaryFilter]        = useState<'all' | 'summary' | 'session'>('all')
  const [scoringFilter,      setScoringFilter]      = useState<'all' | 'MP' | 'VP'>('all')
  const [activeTab,    setActiveTab]    = useState<'history' | 'partners'>('history')
  const [historyView,  setHistoryView]  = useState<'data' | 'graph'>('data')
  const [currentPage,  setCurrentPage]  = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(ROWS_PER_PAGE)

  // ── Restore from sessionStorage on mount (does NOT set restoredRef) ──
  useEffect(() => {
    const s = loadPlayerSaved(playerId)
    savedRef.current = s
    if (s) {
      if (s.activeTab === 'history' || s.activeTab === 'partners') setActiveTab(s.activeTab)
      if (s.historyView === 'data' || s.historyView === 'graph') setHistoryView(s.historyView)
      if (s.dateFrom)               setDateFrom(s.dateFrom as string)
      if (s.dateTo)                 setDateTo(s.dateTo as string)
      if (s.dayFilter)              setDayFilter(s.dayFilter as string)
      if (s.scoring)                setScoring(s.scoring as 'MP' | 'VP')
      if (s.sessionNameFilter)      setSessionNameFilter(s.sessionNameFilter as string)
      if ((s.selectedTournaments as string[])?.length) setSelectedTournaments(new Set(s.selectedTournaments as string[]))
      if (s.summaryFilter)            setSummaryFilter(s.summaryFilter as 'all' | 'summary' | 'session')
      if (s.scoringFilter)          setScoringFilter(s.scoringFilter as 'all' | 'MP' | 'VP')
      if (s.currentPage)            setCurrentPage(s.currentPage as number)
      if (s.itemsPerPage)           setItemsPerPage(s.itemsPerPage as number)
    }
  }, [playerId])

  // ── Save to sessionStorage on every filter change (guarded until after restore) ──
  useEffect(() => {
    if (!restoredRef.current) return
    try {
      sessionStorage.setItem(playerStorageKey(playerId), JSON.stringify({
        activeTab, historyView, dateFrom, dateTo, dayFilter, scoring, sessionNameFilter,
        selectedTournaments: [...selectedTournaments],
        selectedClubs: [...selectedClubs],
        selectedEventTypes: [...selectedEventTypes],
        selectedPartnerIds: [...selectedPartnerIds],
        summaryFilter, scoringFilter, currentPage, itemsPerPage,
      }))
    } catch {}
  }, [playerId, activeTab, dateFrom, dateTo, dayFilter, scoring, sessionNameFilter,
      selectedTournaments, selectedClubs, selectedEventTypes, selectedPartnerIds,
      summaryFilter, scoringFilter, currentPage, itemsPerPage])

  // ── Mark restoration complete (declared after save so save is blocked on first render) ──
  useEffect(() => {
    restoredRef.current = true
  }, [playerId])

  const uniquePartners = useMemo(() => {
    const seen = new Map<number, { name: string; nz_number: number | null; count: number; tracked: boolean }>()
    results.forEach(r => {
      const entry = seen.get(r.partner_id)
      if (entry) entry.count++
      else seen.set(r.partner_id, { name: r.partner_name, nz_number: r.partner_nz_number ?? null, count: 1, tracked: Boolean(r.partner_tracked) })
    })
    return [...seen.entries()]
      .map(([id, { name, nz_number, count, tracked }]) => ({ id, name, nz_number, count, tracked }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [results])


  // Initialise partners to all on load, or restore saved subset
  useEffect(() => {
    const all = new Set(results.map(r => r.partner_id))
    const saved = savedRef.current?.selectedPartnerIds as number[] | undefined
    if (saved?.length) {
      const valid = new Set(saved.filter(id => all.has(id)))
      setSelectedPartnerIds(valid.size > 0 ? valid : all)
    } else {
      setSelectedPartnerIds(all)
    }
  }, [results])

  const sessionsSorted = useMemo(() => {
    let rows = [...results].sort((a, b) => (a.date > b.date ? -1 : 1))
    if (dateFrom)         rows = rows.filter(r => r.date.slice(0, 10) >= dateFrom)
    if (dateTo)           rows = rows.filter(r => r.date.slice(0, 10) <= dateTo)
    if (dayFilter)        rows = rows.filter(r => r.day_of_week === dayFilter)
    if (selectedPartnerIds.size < uniquePartners.length)
                          rows = rows.filter(r => selectedPartnerIds.has(r.partner_id))
    if (scoringFilter !== 'all') rows = rows.filter(r => r.scoring === scoringFilter)

    if (sessionNameFilter)     rows = rows.filter(r => r.session_name.toLowerCase().includes(sessionNameFilter.toLowerCase()))
    if (selectedClubs.size < clubOptions.length)
                               rows = rows.filter(r => selectedClubs.has(r.club))
    if (selectedTournaments.size < 3)
                               rows = rows.filter(r => selectedTournaments.has((r.tournament ?? '').match(/[ABC]$/i)?.[0]?.toUpperCase() ?? ''))
    if (selectedEventTypes.size < eventTypeOptions.length)
                               rows = rows.filter(r => selectedEventTypes.has(r.event_type))
    if (summaryFilter === 'summary') rows = rows.filter(r => r.is_summary === true)
    if (summaryFilter === 'session') rows = rows.filter(r => r.is_summary !== true)
    return rows
  }, [results, dateFrom, dateTo, dayFilter, selectedPartnerIds, uniquePartners.length,
      scoringFilter, sessionNameFilter,
      selectedClubs, clubOptions.length, selectedTournaments,
      selectedEventTypes, eventTypeOptions.length, summaryFilter])

useEffect(() => { setCurrentPage(1) },
    [dateFrom, dateTo, dayFilter, selectedPartnerIds, scoringFilter, sessionNameFilter,
     selectedClubs, selectedTournaments, selectedEventTypes, summaryFilter])

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
    selectedTournaments.size < 3 ||
    selectedEventTypes.size < eventTypeOptions.length ||
    scoringFilter !== 'all')

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setDayFilter('')
    setSelectedPartnerIds(new Set(results.map(r => r.partner_id)))
    setSessionNameFilter('')
    setSelectedClubs(new Set(clubOptions))
    setSelectedTournaments(new Set(['A', 'B', 'C']))
    setSelectedEventTypes(new Set(eventTypeOptions))
    setScoringFilter('all')
  }

  function buildCSV(rows: ResultRow[]) {
    const esc = (v: string | number | null | undefined) => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['Player','NZB#','Run ID','Date','Day','Partner','Partner NZB#','Session','Club','Tournament','Event Type','Scoring','Summary','%','VP']
    const dataRows = rows.map(r => [
      player!.pl_name,
      player!.pl_nz_bridge_number,
      r.run_id,
      r.date.slice(0, 10),
      r.day_of_week,
      r.partner_name,
      r.partner_nz_number ?? '',
      r.session_name,
      r.club,
      r.tournament,
      r.event_type,
      r.scoring,
      r.is_summary === true ? 'Summary' : r.is_summary === null ? '?' : 'Session',
      r.scoring === 'MP' ? parseFloat(String(r.percentage)).toFixed(2) : '',
      r.scoring === 'VP' ? parseFloat(String(r.vp ?? 0)).toFixed(2) : '',
    ].map(esc).join(','))
    return [header.join(','), ...dataRows].join('\n')
  }

  function exportCSV() {
    const csv = buildCSV(sessionsSorted)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${player!.pl_name.replace(/\s+/g, '_')}_sessions.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  function exportGraphCSV() {
    const filtered = sessionsSorted.filter(r => r.scoring === scoring)
    const csv = buildCSV(filtered)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${player!.pl_name.replace(/\s+/g, '_')}_${scoring}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Partnership mode ──────────────────────────────────────────────────────
  if (filterPartnerId !== null) {
    const partnerName = results[0]?.partner_name ?? `Player ${filterPartnerId}`
    return (
      <div className='space-y-6'>
        <div className='rounded border border-gray-200 p-4'>
          <MyBackHomeNav backPath={backPath} backLabel={player.pl_name} linkClass='text-xs text-blue-600 hover:underline' />
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
          <MyBackHomeNav backPath={backPath} linkClass='text-xs text-blue-600 hover:underline' />
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
          function consistencyLabel(pctRank: number | null): { text: string; cls: string } | null {
            if (pctRank === null) return null
            if (pctRank < 0.25) return { text: 'Consistent', cls: 'text-green-600' }
            if (pctRank < 0.50) return { text: 'Wobbly',     cls: 'text-yellow-600' }
            if (pctRank < 0.75) return { text: 'Volatile',   cls: 'text-orange-500' }
            return                      { text: 'Wild',       cls: 'text-red-600' }
          }
          return (
            <table className='mt-2 text-sm text-gray-600'>
              <thead>
                <tr>
                  <th className='text-center font-semibold text-gray-500 pb-0 px-4 align-bottom' rowSpan={2}>Tournament<br/>Type</th>
                  <th colSpan={3} className='text-center font-semibold text-gray-500 pb-0 px-6'>MP</th>
                  <th className='w-6' />
                  <th colSpan={3} className='text-center font-semibold text-gray-500 pb-0 px-6'>VP</th>
                </tr>
                <tr>
                  <th className='text-right text-gray-400 font-normal pb-1 px-4'>Avg</th>
                  <th className='text-right text-gray-400 font-normal pb-1 px-4'>Sessions</th>
                  <th className='text-left text-gray-400 font-normal pb-1 px-4'>Consistency</th>
                  <th />
                  <th className='text-right text-gray-400 font-normal pb-1 px-4'>Avg</th>
                  <th className='text-right text-gray-400 font-normal pb-1 px-4'>Sessions</th>
                  <th className='text-left text-gray-400 font-normal pb-1 px-4'>Consistency</th>
                </tr>
              </thead>
              <tbody>
                {grps.map(g => {
                  const r = byGrp[g]
                  const label = g === 'all' ? 'All' : g
                  const mpLabel = consistencyLabel(r.mp_pct_rank)
                  const vpLabel = consistencyLabel(r.vp_pct_rank)
                  return (
                    <tr key={g}>
                      <td className='text-center text-gray-600 py-0.5 px-4'>{label}</td>
                      <td className='text-right font-medium text-gray-700 py-0.5 px-4'>
                        {r.a1_mp_sessions > 0 ? `${parseFloat(String(r.a1_mp_avg_pct)).toFixed(2)}%` : '—'}
                      </td>
                      <td className='text-right text-gray-500 py-0.5 px-4'>
                        {r.a1_mp_sessions > 0 ? r.a1_mp_sessions : ''}
                      </td>
                      <td className={`text-left py-0.5 px-4 text-xs font-medium ${mpLabel?.cls ?? 'text-gray-300'}`}>
                        {r.a1_mp_sessions >= 10 && mpLabel ? `${mpLabel.text} (${parseFloat(String(r.a1_mp_stddev)).toFixed(2)})` : ''}
                      </td>
                      <td />
                      <td className='text-right font-medium text-gray-700 py-0.5 px-4'>
                        {r.a1_vp_sessions > 0 ? parseFloat(String(r.a1_vp_avg_vp)).toFixed(2) : '—'}
                      </td>
                      <td className='text-right text-gray-500 py-0.5 px-4'>
                        {r.a1_vp_sessions > 0 ? r.a1_vp_sessions : ''}
                      </td>
                      <td className={`text-left py-0.5 px-4 text-xs font-medium ${vpLabel?.cls ?? 'text-gray-300'}`}>
                        {r.a1_vp_sessions >= 10 && vpLabel ? `${vpLabel.text} (${parseFloat(String(r.a1_vp_stddev)).toFixed(2)})` : ''}
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
        {(['history', 'partners'] as const).map(tab => (
          <MyTab key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)}
            underlineActiveClass='px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 bg-white border-gray-200 text-gray-900'
            underlineInactiveClass='px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'>
            {tab === 'history' ? 'Player History' : 'All Partners History'}
          </MyTab>
        ))}
      </div>

      {/* Player History */}
      {activeTab === 'history' && (
        <div className='rounded border border-gray-200 p-4'>
          <div className='flex items-center justify-between mb-3'>
            <div className='flex items-center gap-3'>
              <h2 className='text-base font-semibold text-gray-800'>
                Player History
                <span className='ml-2 text-xs font-normal text-gray-400'>{sessionsSorted.length} of {results.length}</span>
              </h2>
              {/* Data / Graph sub-tabs */}
              <div className='flex rounded border border-gray-300 overflow-hidden text-xs'>
                {(['data', 'graph'] as const).map(v => (
                  <MyTab key={v} variant='pill' active={historyView === v} onClick={() => setHistoryView(v)}
                    pillActiveClass='px-2 py-0.5 capitalize rounded-none border-0 bg-blue-600 text-white'
                    pillInactiveClass='px-2 py-0.5 capitalize rounded-none border-0 bg-white text-gray-700 hover:bg-gray-50'>
                    {v}
                  </MyTab>
                ))}
              </div>
            </div>
            <div className='flex items-center gap-2'>
              {historyView === 'data' && hasFilter && (
                <MyButton onClick={clearFilters} overrideClass='text-xs text-blue-600 hover:underline bg-transparent hover:bg-transparent h-auto md:h-auto px-0'>Clear filters</MyButton>
              )}
              {historyView === 'data'
                ? <MyButton onClick={exportCSV} overrideClass='text-xs rounded border border-gray-300 bg-white px-2 py-0.5 hover:bg-gray-50 text-gray-700 h-auto md:h-auto'>Export CSV</MyButton>
                : <MyButton onClick={exportGraphCSV} overrideClass='text-xs rounded border border-gray-300 bg-white px-2 py-0.5 hover:bg-gray-50 text-gray-700 h-auto md:h-auto'>Export Graph CSV</MyButton>
              }
            </div>
          </div>
          {results.length === 0 ? (
            <div className='text-sm text-gray-400 py-4 text-center'>No results recorded yet</div>
          ) : historyView === 'graph' ? (
            <>
              <div className='flex items-center gap-2 mb-3'>
                <div className='flex rounded border border-gray-300 overflow-hidden text-xs'>
                  {(['MP', 'VP'] as const).map(s => (
                    <button key={s} onClick={() => setScoring(s)}
                      className={`px-2 py-0.5 ${scoring === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <PerformanceChart results={sessionsSorted} scoring={scoring} />
            </>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-gray-200'>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-20'>Run ID</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Date</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Day</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-36'>Partner</th>
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
                    {/* Source — no filter */}
                    <td className='py-1' />
                    {/* Date: from on top, to below */}
                    <td className='py-1 pr-1'>
                      <div className='flex flex-col gap-0.5'>
                        <MyInput type='date' value={dateFrom} min='2024-01-01' max={new Date().toISOString().slice(0, 10)} onChange={e => setDateFrom(e.target.value)}
                          overrideClass='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto' title='From' />
                        <MyInput type='date' value={dateTo} min='2024-01-01' max={new Date().toISOString().slice(0, 10)} onChange={e => setDateTo(e.target.value)}
                          overrideClass='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto' title='To' />
                      </div>
                    </td>
                    {/* Day */}
                    <td className='py-1 pr-1'>
                      <MySelect value={dayFilter} onChange={e => setDayFilter(e.target.value)}
                        overrideClass='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto'>
                        <option value=''>All</option>
                        {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d =>
                          <option key={d}>{d}</option>)}
                      </MySelect>
                    </td>
                    {/* Partner multi-select */}
                    <td className='py-1 pr-1'>
                      <PartnerSelect partners={uniquePartners} selected={selectedPartnerIds} onChange={setSelectedPartnerIds} />
                    </td>
                    {/* Session name */}
                    <td className='py-1 pr-1'>
                      <MyInput type='text' value={sessionNameFilter} onChange={e => setSessionNameFilter(e.target.value)}
                        placeholder='Search…'
                        overrideClass='w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs font-normal h-auto md:h-auto' />
                    </td>
                    {/* Club */}
                    <td className='py-1 pr-1'>
                      <ClubSelect mode='all' selected={selectedClubs} onChange={setSelectedClubs}
                        onOptionsLoaded={opts => {
                          setClubOptions(opts)
                          const saved = savedRef.current?.selectedClubs as string[] | undefined
                          if (saved?.length) {
                            const valid = new Set(saved.filter(o => opts.includes(o)))
                            setSelectedClubs(valid.size > 0 ? valid : new Set(opts))
                          } else {
                            setSelectedClubs(new Set(opts))
                          }
                        }} />
                    </td>
                    {/* Tournament */}
                    <td className='py-1 pr-1'>
                      <StringMultiSelect options={['A', 'B', 'C']} selected={selectedTournaments} onChange={setSelectedTournaments} />
                    </td>
                    {/* Event type */}
                    <td className='py-1 pr-1'>
                      <EventTypeSelect mode='all' selected={selectedEventTypes} onChange={setSelectedEventTypes}
                        onOptionsLoaded={opts => {
                          setEventTypeOptions(opts)
                          const saved = savedRef.current?.selectedEventTypes as string[] | undefined
                          if (saved?.length) {
                            const valid = new Set(saved.filter(o => opts.includes(o)))
                            setSelectedEventTypes(valid.size > 0 ? valid : new Set(opts))
                          } else {
                            setSelectedEventTypes(new Set(opts))
                          }
                        }} />
                    </td>
                    {/* Scoring filter */}
                    <td className='py-1 pr-1'>
                      <MySelect value={scoringFilter} onChange={e => setScoringFilter(e.target.value as 'all' | 'MP' | 'VP')}
                        overrideClass='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto'>
                        <option value='all'>All</option>
                        <option value='MP'>MP</option>
                        <option value='VP'>VP</option>
                      </MySelect>
                    </td>
                    {/* Summary filter */}
                    <td className='py-1 pr-1'>
                      <MySelect value={summaryFilter} onChange={e => setSummaryFilter(e.target.value as 'all' | 'summary' | 'session')}
                        overrideClass='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal h-auto md:h-auto'>
                        <option value='all'>All</option>
                        <option value='summary'>Summary</option>
                        <option value='session'>Session</option>
                      </MySelect>
                    </td>
                    {/* % and VP — no filter */}
                    <td className='py-1' />
                    <td className='py-1' />
                  </tr>
                </thead>
                <tbody>
                  {sessionsSorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((r, i) => (
                    <tr key={i}
                      className='border-b border-gray-100 hover:bg-gray-50 cursor-pointer'
                      onClick={() => {
                        sessionStorage.setItem(NB_BACK_FROM_KEY, window.location.pathname + window.location.search)
                        window.location.href = `/session/${r.session_id}`
                      }}
                    >
                      <td className='py-1.5 text-gray-400 text-xs font-mono'>{r.run_id}</td>
                      <td className='py-1.5'>{r.date.slice(0, 10)}</td>
                      <td className='py-1.5 text-gray-500'>{r.day_of_week}</td>
                      <td className='py-1.5'>
                        <Link href={`/player/${playerId}?partner=${r.partner_id}`}
                          className='text-blue-600 hover:underline'
                          onClick={e => { e.stopPropagation(); sessionStorage.setItem(NB_BACK_FROM_KEY, window.location.pathname + window.location.search) }}>
                          {r.partner_name}
                        </Link>
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
          {historyView === 'data' && sessionsSorted.length > itemsPerPage && (
            <div className='mt-3 flex items-center gap-3'>
              <MySelect value={itemsPerPage} onChange={e => { setItemsPerPage(parseInt(e.target.value, 10)); setCurrentPage(1) }}
                overrideClass='rounded border border-gray-300 px-1.5 py-0.5 text-xs h-auto md:h-auto w-auto'>
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} rows</option>)}
              </MySelect>
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

      {/* All Partners History */}
      {activeTab === 'partners' && (
        <div className='rounded border border-gray-200 p-4'>
          {results.length === 0
            ? <div className='text-sm text-gray-400 py-4 text-center'>No results recorded yet</div>
            : <PartnersTable partners={uniquePartners} />}
        </div>
      )}
    </div>
  )
}
