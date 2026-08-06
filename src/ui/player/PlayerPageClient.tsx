'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getPlayerById, getPartnerStats, getPlayerAllGroupStats } from '@/src/lib/actions/players'
import { StringMultiSelect, ClubSelect, EventTypeSelect } from '@/src/ui/shared/LookupSelects'
import { TableEmptyRow } from '@/src/ui/shared/TableEmptyRow'
import { FilterName } from '@/src/ui/shared/FilterName'
import { FilterDate } from '@/src/ui/shared/FilterDate'
import { FilterDayOfWeek } from '@/src/ui/shared/FilterDayOfWeek'
import { FilterIsSummary } from '@/src/ui/shared/FilterIsSummary'
import { FilterPlid } from '@/src/ui/shared/FilterPlid'
import { FilterRunId } from '@/src/ui/shared/FilterRunId'
import { ScoringTypeSelect, ScoringTypeToggle, formatScoringValue, scoringAvgLabel } from '@/src/ui/shared/ScoringTypeSelects'
import PerformanceChart from './PerformanceChart'
import PartnersTable from './PartnersTable'
import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyTab } from 'nextjs-shared/MyTab'
import { MyBackHomeNav } from 'nextjs-shared/MyBackHomeNav'
import { useBackNav, saveBackNav } from 'nextjs-shared/useBackNav'
import { isSelectionFiltering, SELECTION_ALL, serializeSelection } from 'nextjs-shared/isSelectionFiltering'
import {
  BACK_KEY, ROWS_PER_PAGE, SCORING_TYPES, CONSISTENCY_LEVELS, TABLE_MIN_HEIGHT_PX, SESSION_STORAGE_PREFIX,
  WIDTH_RUN_ID, WIDTH_DATE, WIDTH_DAY_OF_WEEK, WIDTH_PLID, WIDTH_NAME, WIDTH_CLUB, WIDTH_TOURNAMENT_TYPE,
  WIDTH_EVENT_TYPE, WIDTH_SCORING, WIDTH_IS_SUMMARY
} from '@/src/lib/constants'

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
  ximp:            number | null
  partner_id:         number
  partner_name:       string
  partner_nzb:  number | null
  partner_tracked:    boolean
}

interface Player {
  pl_plid:             number
  pl_nzb: number
  pl_name:             string
  pl_club:             string
  pl_rank:             string
  pl_grade:            string
  pl_rating:           number
  pl_a_points:         number
  pl_b_points:         number
  pl_c_points:         number
  pl_tracked:      boolean
}

const playerStorageKey = (id: number) => `${SESSION_STORAGE_PREFIX}player_state_${id}`
function loadPlayerSaved(id: number) {
  try { return JSON.parse(sessionStorage.getItem(playerStorageKey(id)) ?? 'null') } catch { return null }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PlayerPageClient({ playerId }: { playerId: number }) {
  const searchParams = useSearchParams()
  const partnerParam = searchParams.get('partner')
  const filterPartnerId = partnerParam ? parseInt(partnerParam, 10) : null
  const restoredRef  = useRef(false)
  const savedRef     = useRef<Record<string, unknown> | null>(null)

  const backPath = useBackNav(BACK_KEY)

  const [player,       setPlayer]       = useState<Player | null>(null)
  const [results,      setResults]      = useState<ResultRow[]>([])
  const [partnerStats, setPartnerStats] = useState<{ a2_scoring: string; a2_sessions: number; a2_avg: number; a2_stddev: number | null }[]>([])
  const [playerStats,  setPlayerStats]  = useState<{
    a1_group: string; a1_scoring: string; a1_sessions: number; a1_avg: number; a1_stddev: number | null
    a1_pct_rank: number | null; a1_avg_rank: number | null; a1_group_total: number | null
  }[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  // Filters
  const [filter_run_id,              setFilter_run_id]              = useState('')
  const [filter_date_from,           setFilter_date_from]           = useState('')
  const [filter_date_to,             setFilter_date_to]             = useState('')
  const [filter_day_of_week,          setFilter_day_of_week]          = useState('')
  const [filter_plid, setFilter_plid] = useState<Set<number>>(new Set())
  const [scoring,            setScoring]            = useState<(typeof SCORING_TYPES)[number]>('MP')
  const [statsScoring,       setStatsScoring]        = useState<(typeof SCORING_TYPES)[number]>('MP')

  const [filter_name,  setFilter_name]  = useState('')
  const [filter_club,      setFilter_club]      = useState<Set<string>>(new Set())
  const [clubOptions,        setClubOptions]        = useState<string[]>([])
  const [filter_tournament,setFilter_tournament]= useState<Set<string>>(new Set(['A', 'B', 'C']))
  const [filter_event_type, setFilter_event_type] = useState<Set<string>>(new Set())
  const [eventTypeOptions,   setEventTypeOptions]   = useState<string[]>([])
  const [filter_is_summary,        setFilter_is_summary]        = useState<'all' | 'summary' | 'session'>('all')
  const [filter_scoring,      setFilter_scoring]      = useState<'all' | (typeof SCORING_TYPES)[number]>('all')
  const [activeTab,    setActiveTab]    = useState<'stats' | 'history' | 'partners'>('history')
  const [historyView,  setHistoryView]  = useState<'data' | 'graph'>('data')
  const [currentPage,  setCurrentPage]  = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(ROWS_PER_PAGE)

  // ── Restore from sessionStorage on mount (does NOT set restoredRef) ──
  useEffect(() => {
    const s = loadPlayerSaved(playerId)
    savedRef.current = s
    if (s) {
      if (s.activeTab === 'stats' || s.activeTab === 'history' || s.activeTab === 'partners') setActiveTab(s.activeTab)
      if (s.historyView === 'data' || s.historyView === 'graph') setHistoryView(s.historyView)
      if (s.filter_run_id)                  setFilter_run_id(s.filter_run_id as string)
      if (s.filter_date_from)               setFilter_date_from(s.filter_date_from as string)
      if (s.filter_date_to)                 setFilter_date_to(s.filter_date_to as string)
      if (s.filter_day_of_week)              setFilter_day_of_week(s.filter_day_of_week as string)
      if (s.scoring)                setScoring(s.scoring as (typeof SCORING_TYPES)[number])
      if (s.statsScoring)           setStatsScoring(s.statsScoring as (typeof SCORING_TYPES)[number])
      if (s.filter_name)      setFilter_name(s.filter_name as string)
      if (Array.isArray(s.filter_tournament) && s.filter_tournament.length) setFilter_tournament(new Set(s.filter_tournament as string[]))
      if (s.filter_is_summary)            setFilter_is_summary(s.filter_is_summary as 'all' | 'summary' | 'session')
      if (s.filter_scoring)          setFilter_scoring(s.filter_scoring as 'all' | (typeof SCORING_TYPES)[number])
      if (s.currentPage)            setCurrentPage(s.currentPage as number)
      if (s.itemsPerPage)           setItemsPerPage(s.itemsPerPage as number)
    }
  }, [playerId])

  // ── Save to sessionStorage on every filter change (guarded until after restore) ──
  useEffect(() => {
    if (!restoredRef.current) return
    try {
      sessionStorage.setItem(playerStorageKey(playerId), JSON.stringify({
        activeTab, historyView, filter_run_id, filter_date_from, filter_date_to, filter_day_of_week, scoring, statsScoring, filter_name,
        filter_tournament: serializeSelection([...filter_tournament], 3),
        filter_club: serializeSelection([...filter_club], clubOptions.length),
        filter_event_type: serializeSelection([...filter_event_type], eventTypeOptions.length),
        filter_plid: serializeSelection([...filter_plid].map(String), new Set(results.map(r => r.partner_id)).size),
        filter_is_summary, filter_scoring, currentPage, itemsPerPage,
      }))
    } catch {}
  }, [playerId, activeTab, filter_run_id, filter_date_from, filter_date_to, filter_day_of_week, scoring, statsScoring, filter_name,
      filter_tournament, filter_club, clubOptions.length, filter_event_type, eventTypeOptions.length, filter_plid, results,
      filter_is_summary, filter_scoring, currentPage, itemsPerPage])

  // ── Mark restoration complete (declared after save so save is blocked on first render) ──
  useEffect(() => {
    restoredRef.current = true
  }, [playerId])

  const uniquePartners = useMemo(() => {
    const seen = new Map<number, { name: string; nzb: number | null; count: number; tracked: boolean }>()
    results.forEach(r => {
      const entry = seen.get(r.partner_id)
      if (entry) entry.count++
      else seen.set(r.partner_id, { name: r.partner_name, nzb: r.partner_nzb ?? null, count: 1, tracked: Boolean(r.partner_tracked) })
    })
    return [...seen.entries()]
      .map(([plid, { name, nzb, count, tracked }]) => ({ plid, name, nzb, count, tracked }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [results])


  // Initialise partners to all on load, or restore saved subset
  useEffect(() => {
    const all = new Set(results.map(r => r.partner_id))
    const saved = savedRef.current?.filter_plid as string[] | typeof SELECTION_ALL | undefined
    if (Array.isArray(saved) && saved.length) {
      const valid = new Set(saved.map(Number).filter(id => all.has(id)))
      setFilter_plid(valid.size > 0 ? valid : all)
    } else {
      setFilter_plid(all)
    }
  }, [results])

  const sessionsSorted = useMemo(() => {
    let rows = [...results].sort((a, b) => (a.date > b.date ? -1 : 1))
    if (filter_run_id)            rows = rows.filter(r => String(r.run_id).includes(filter_run_id))
    if (filter_date_from)         rows = rows.filter(r => r.date.slice(0, 10) >= filter_date_from)
    if (filter_date_to)           rows = rows.filter(r => r.date.slice(0, 10) <= filter_date_to)
    if (filter_day_of_week)        rows = rows.filter(r => r.day_of_week === filter_day_of_week)
    if (filter_plid.size < uniquePartners.length)
                          rows = rows.filter(r => filter_plid.has(r.partner_id))
    if (filter_scoring !== 'all') rows = rows.filter(r => r.scoring === filter_scoring)

    if (filter_name)     rows = rows.filter(r => r.session_name.toLowerCase().includes(filter_name.toLowerCase()))
    if (isSelectionFiltering([...filter_club], clubOptions.length))
                               rows = rows.filter(r => filter_club.has(r.club))
    if (isSelectionFiltering([...filter_tournament], 3))
                               rows = rows.filter(r => filter_tournament.has((r.tournament ?? '').match(/[ABC]$/i)?.[0]?.toUpperCase() ?? ''))
    if (isSelectionFiltering([...filter_event_type], eventTypeOptions.length))
                               rows = rows.filter(r => filter_event_type.has(r.event_type))
    if (filter_is_summary === 'summary') rows = rows.filter(r => r.is_summary === true)
    if (filter_is_summary === 'session') rows = rows.filter(r => r.is_summary !== true)
    return rows
  }, [results, filter_run_id, filter_date_from, filter_date_to, filter_day_of_week, filter_plid, uniquePartners.length,
      filter_scoring, filter_name,
      filter_club, clubOptions.length, filter_tournament,
      filter_event_type, eventTypeOptions.length, filter_is_summary])

useEffect(() => { setCurrentPage(1) },
    [filter_run_id, filter_date_from, filter_date_to, filter_day_of_week, filter_plid, filter_scoring, filter_name,
     filter_club, filter_tournament, filter_event_type, filter_is_summary])

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
        if (statsRow?.length) setPartnerStats(statsRow)
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

  const hasFilter = !!(filter_run_id || filter_date_from || filter_date_to || filter_day_of_week ||
    filter_name ||
    filter_plid.size < uniquePartners.length ||
    isSelectionFiltering([...filter_club], clubOptions.length) ||
    isSelectionFiltering([...filter_tournament], 3) ||
    isSelectionFiltering([...filter_event_type], eventTypeOptions.length) ||
    filter_scoring !== 'all')

  function clearFilters() {
    setFilter_date_from(''); setFilter_date_to(''); setFilter_day_of_week('')
    setFilter_plid(new Set(results.map(r => r.partner_id)))
    setFilter_name('')
    setFilter_club(new Set(clubOptions))
    setFilter_tournament(new Set(['A', 'B', 'C']))
    setFilter_event_type(new Set(eventTypeOptions))
    setFilter_scoring('all')
  }

  function buildCSV(rows: ResultRow[]) {
    const esc = (v: string | number | null | undefined) => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['Player','NZB#','Run ID','Date','Day','Partner','Partner NZB#','Session','Club','Tournament','Event Type','Scoring','Summary','%','VP','XIMP']
    const dataRows = rows.map(r => [
      player!.pl_name,
      player!.pl_nzb,
      r.run_id,
      r.date.slice(0, 10),
      r.day_of_week,
      r.partner_name,
      r.partner_nzb ?? '',
      r.session_name,
      r.club,
      r.tournament,
      r.event_type,
      r.scoring,
      r.is_summary === true ? 'Summary' : r.is_summary === null ? '?' : 'Session',
      r.scoring === 'MP' ? parseFloat(String(r.percentage)).toFixed(2) : '',
      r.scoring === 'VP' ? parseFloat(String(r.vp ?? 0)).toFixed(2) : '',
      r.scoring === 'XIMP' ? parseFloat(String(r.ximp ?? 0)).toFixed(2) : '',
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
            <span>
              {partnerStats.length ? partnerStats.reduce((sum, r) => sum + r.a2_sessions, 0) : results.length} session
              {(partnerStats.length ? partnerStats.reduce((sum, r) => sum + r.a2_sessions, 0) : results.length) !== 1 ? 's' : ''} together
            </span>
            {partnerStats.filter(r => r.a2_avg > 0).map(r => (
              <span key={r.a2_scoring}>{r.a2_scoring} Avg: <strong>{formatScoringValue(r.a2_scoring, r.a2_avg)}</strong></span>
            ))}
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
        <div className='flex items-baseline gap-3'>
          <h1 className='text-xl font-bold text-gray-900'>{player.pl_name}</h1>
          <span className='text-xs text-gray-400'>NZ Bridge #{player.pl_nzb}</span>
          {player.pl_tracked && (
            <span className='rounded-full bg-green-100 border border-green-300 px-2 py-0.5 text-xs font-medium text-green-700'>Tracked</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className='flex gap-1 border-b border-gray-200'>
        {(['stats', 'history', 'partners'] as const).map(tab => (
          <MyTab key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)}
            underlineActiveClass='px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 bg-white border-gray-200 text-gray-900'
            underlineInactiveClass='px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'>
            {tab === 'stats' ? 'Player Stats' : tab === 'history' ? 'Player History' : 'All Partners History'}
          </MyTab>
        ))}
      </div>

      {/* Player Stats */}
      {activeTab === 'stats' && (
        <div className='rounded border border-gray-200 p-4'>
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
            const byGrp: Record<string, Record<string, (typeof playerStats)[number]>> = {}
            playerStats.forEach(r => { (byGrp[r.a1_group] ??= {})[r.a1_scoring] = r })
            const grps = (['A', 'B', 'C', 'all'] as const).filter(g => byGrp[g])
            function consistencyLabel(pctRank: number | null): { text: string; cls: string } | null {
              if (pctRank === null) return null
              return CONSISTENCY_LEVELS.find(level => pctRank < level.max) ?? null
            }
            return (
              <div className='mt-2'>
                <div className='flex items-center gap-1.5 mb-1.5'>
                  <span className='text-xs text-gray-500'>Scoring</span>
                  <ScoringTypeToggle value={statsScoring} onChange={setStatsScoring} />
                </div>
                <table className='text-sm text-gray-600'>
                  <thead>
                    <tr>
                      <th className='text-center font-semibold text-gray-500 pb-1 px-4'>Tournament<br/>Type</th>
                      <th className='text-right text-gray-400 font-normal pb-1 px-4'>Avg</th>
                      <th className='text-right text-gray-400 font-normal pb-1 px-4'>Rank</th>
                      <th className='text-right text-gray-400 font-normal pb-1 px-4'>Sessions</th>
                      <th className='text-left text-gray-400 font-normal pb-1 px-4'>Consistency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grps.map(g => {
                      const r = byGrp[g][statsScoring]
                      const sessions = r?.a1_sessions ?? 0
                      const label = consistencyLabel(r?.a1_pct_rank ?? null)
                      return (
                        <tr key={g}>
                          <td className='text-center text-gray-600 py-0.5 px-4'>{g === 'all' ? 'All' : g}</td>
                          <td className='text-right font-medium text-gray-700 py-0.5 px-4'>
                            {sessions > 0 ? formatScoringValue(statsScoring, r.a1_avg) : '—'}
                          </td>
                          <td className='text-right text-xs text-gray-400 py-0.5 px-4'>
                            {sessions > 0
                              ? (r.a1_avg_rank != null ? `${r.a1_avg_rank} of ${r.a1_group_total}` : 'Not enough sessions')
                              : ''}
                          </td>
                          <td className='text-right text-gray-500 py-0.5 px-4'>
                            {sessions > 0 ? sessions : ''}
                          </td>
                          <td className={`text-left py-0.5 px-4 text-xs font-medium ${label?.cls ?? 'text-gray-300'}`}>
                            {sessions >= 10 && label ? `${label.text} (${parseFloat(String(r.a1_stddev)).toFixed(2)})` : ''}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </div>
      )}

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
                <ScoringTypeToggle value={scoring} onChange={setScoring} />
              </div>
              <PerformanceChart results={sessionsSorted} scoring={scoring} />
            </>
          ) : (
            <div className='overflow-x-auto' style={{ minHeight: TABLE_MIN_HEIGHT_PX }}>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-gray-200'>
                    <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_RUN_ID}`}>Run ID</th>
                    <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_DATE}`}>Date</th>
                    <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_DAY_OF_WEEK}`}>Day</th>
                    <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_PLID}`}>Partner</th>
                    <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_NAME}`}>Session</th>
                    <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_CLUB}`}>Club</th>
                    <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_TOURNAMENT_TYPE}`}>Tournament</th>
                    <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_EVENT_TYPE}`}>Event Type</th>
                    <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_SCORING}`}>Scoring</th>
                    <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_IS_SUMMARY}`}>Summary</th>
                    <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-16'>%</th>
                    <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-16'>VP</th>
                    <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-16'>XIMP</th>
                  </tr>
                  <tr className='border-b border-gray-100 bg-gray-50 align-top'>
                    {/* Run ID */}
                    <td className='py-1 pr-1'>
                      <FilterRunId value={filter_run_id} onChange={setFilter_run_id} />
                    </td>
                    {/* Date: from on top, to below */}
                    <td className='py-1 pr-1'>
                      <div className='flex flex-col gap-0.5'>
                        <FilterDate value={filter_date_from} onChange={setFilter_date_from} />
                        <FilterDate value={filter_date_to} onChange={setFilter_date_to} />
                      </div>
                    </td>
                    {/* Day */}
                    <td className='py-1 pr-1'>
                      <FilterDayOfWeek value={filter_day_of_week} onChange={setFilter_day_of_week} />
                    </td>
                    {/* Partner multi-select */}
                    <td className='py-1 pr-1'>
                      <FilterPlid players={uniquePartners} selected={filter_plid} onChange={setFilter_plid} />
                    </td>
                    {/* Session name */}
                    <td className='py-1 pr-1'>
                      <FilterName value={filter_name} onChange={setFilter_name} placeholder='Search…' />
                    </td>
                    {/* Club */}
                    <td className='py-1 pr-1'>
                      <ClubSelect selected={filter_club} onChange={setFilter_club}
                        onOptionsLoaded={opts => {
                          setClubOptions(opts)
                          const saved = savedRef.current?.filter_club as string[] | typeof SELECTION_ALL | undefined
                          if (Array.isArray(saved) && saved.length) {
                            const valid = new Set(saved.filter(o => opts.includes(o)))
                            setFilter_club(valid.size > 0 ? valid : new Set(opts))
                          } else {
                            setFilter_club(new Set(opts))
                          }
                        }} />
                    </td>
                    {/* Tournament */}
                    <td className='py-1 pr-1'>
                      <StringMultiSelect options={['A', 'B', 'C']} selected={filter_tournament} onChange={setFilter_tournament} />
                    </td>
                    {/* Event type */}
                    <td className='py-1 pr-1'>
                      <EventTypeSelect selected={filter_event_type} onChange={setFilter_event_type}
                        onOptionsLoaded={opts => {
                          setEventTypeOptions(opts)
                          const saved = savedRef.current?.filter_event_type as string[] | typeof SELECTION_ALL | undefined
                          if (Array.isArray(saved) && saved.length) {
                            const valid = new Set(saved.filter(o => opts.includes(o)))
                            setFilter_event_type(valid.size > 0 ? valid : new Set(opts))
                          } else {
                            setFilter_event_type(new Set(opts))
                          }
                        }} />
                    </td>
                    {/* Scoring filter */}
                    <td className='py-1 pr-1'>
                      <ScoringTypeSelect value={filter_scoring} onChange={v => setFilter_scoring(v as 'all' | (typeof SCORING_TYPES)[number])} includeAll />
                    </td>
                    {/* Summary filter */}
                    <td className='py-1 pr-1'>
                      <FilterIsSummary value={filter_is_summary} onChange={setFilter_is_summary} />
                    </td>
                    {/* %, VP, XIMP — no filter */}
                    <td className='py-1' />
                    <td className='py-1' />
                    <td className='py-1' />
                  </tr>
                </thead>
                <tbody>
                  {sessionsSorted.length === 0 ? (
                    <TableEmptyRow colSpan={13} message='No results match the current filters.' />
                  ) : sessionsSorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((r, i) => (
                    <tr key={i}
                      className='border-b border-gray-100 hover:bg-gray-50 cursor-pointer'
                      onClick={() => {
                        saveBackNav(BACK_KEY)
                        window.location.href = `/session/${r.session_id}`
                      }}
                    >
                      <td className='py-1.5 text-gray-400 text-xs font-mono'>{r.run_id}</td>
                      <td className='py-1.5'>{r.date.slice(0, 10)}</td>
                      <td className='py-1.5 text-gray-500'>{r.day_of_week}</td>
                      <td className='py-1.5'>
                        <Link href={`/player/${playerId}?partner=${r.partner_id}`}
                          className='text-blue-600 hover:underline'
                          onClick={e => { e.stopPropagation(); saveBackNav(BACK_KEY) }}>
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
                      <td className='py-1.5 text-right font-medium text-xs'>
                        {r.scoring === 'XIMP' ? parseFloat(String(r.ximp ?? 0)).toFixed(2) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {historyView === 'data' && sessionsSorted.length > itemsPerPage && (
            <MyPaginationFooter
              totalPages={Math.ceil(sessionsSorted.length / itemsPerPage)}
              statecurrentPage={currentPage}
              setStateCurrentPage={setCurrentPage}
              rowsPerPage={itemsPerPage}
              setRowsPerPage={v => { setItemsPerPage(v); setCurrentPage(1) }}
            />
          )}
        </div>
      )}

      {/* All Partners History */}
      {activeTab === 'partners' && (
        <div className='rounded border border-gray-200 p-4'>
          {results.length === 0
            ? <div className='text-sm text-gray-400 py-4 text-center'>No results recorded yet</div>
            : <PartnersTable partners={uniquePartners} playerId={playerId} />}
        </div>
      )}
    </div>
  )
}
