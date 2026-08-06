'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyTab } from 'nextjs-shared/MyTab'
import { saveBackNav } from 'nextjs-shared/useBackNav'
import { isSelectionFiltering } from 'nextjs-shared/isSelectionFiltering'
import { BACK_KEY, ROWS_PER_PAGE, SCORING_TYPES, TABLE_MIN_HEIGHT_PX,
  WIDTH_RUN_ID, WIDTH_DATE, WIDTH_DAY_OF_WEEK, WIDTH_PLID, WIDTH_NAME, WIDTH_CLUB, WIDTH_TOURNAMENT_TYPE,
  WIDTH_EVENT_TYPE, WIDTH_SCORING, WIDTH_IS_SUMMARY } from '@/src/lib/constants'
import { StringMultiSelect, ClubSelect, EventTypeSelect } from '@/src/ui/shared/LookupSelects'
import { TableEmptyRow } from '@/src/ui/shared/TableEmptyRow'
import { ScoringTypeSelect, ScoringTypeToggle } from '@/src/ui/shared/ScoringTypeSelects'
import { FilterName } from '@/src/ui/shared/FilterName'
import { FilterDate } from '@/src/ui/shared/FilterDate'
import { FilterDayOfWeek } from '@/src/ui/shared/FilterDayOfWeek'
import { FilterIsSummary } from '@/src/ui/shared/FilterIsSummary'
import { FilterPlid } from '@/src/ui/shared/FilterPlid'
import { FilterRunId } from '@/src/ui/shared/FilterRunId'
import PerformanceChart from './PerformanceChart'

interface PartnerEntry {
  plid: number
  name: string
  nzb: number | null
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
  ximp:              number | null
  partner_id:        number
  partner_name:      string | null
  partner_nzb: number | null
}

interface FlatRow extends ResultRow {
  player_id:   number
  player_name: string
}

export default function PartnersTable({ partners, playerId }: { partners: PartnerEntry[]; playerId: number }) {
  const [partnerResults,    setPartnerResults]    = useState<Map<number, ResultRow[]>>(new Map())
  const [loading,           setLoading]           = useState(false)
  const [view,         setView]         = useState<'data' | 'graph'>('data')
  const [graphScoring, setGraphScoring] = useState<(typeof SCORING_TYPES)[number]>('MP')

  const [filter_run_id,              setFilter_run_id]              = useState('')
  const [filter_date_from,           setFilter_date_from]           = useState('')
  const [filter_date_to,             setFilter_date_to]             = useState('')
  const [filter_day_of_week,          setFilter_day_of_week]          = useState('')
  const [filter_scoring,      setFilter_scoring]      = useState<'all' | (typeof SCORING_TYPES)[number]>('all')
  const [filter_is_summary,      setFilter_is_summary]      = useState<'all' | 'summary' | 'session'>('all')
  const [filter_plid,  setFilter_plid]  = useState<Set<number>>(new Set())
  const [filter_name,  setFilter_name]  = useState('')
  const [filter_club,      setFilter_club]      = useState<Set<string>>(new Set())
  const [clubOptions,        setClubOptions]        = useState<string[]>([])
  const [filter_tournament,setFilter_tournament]= useState<Set<string>>(new Set(['A', 'B', 'C']))
  const [filter_event_type, setFilter_event_type] = useState<Set<string>>(new Set())
  const [eventTypeOptions,   setEventTypeOptions]   = useState<string[]>([])
  const [currentPage,        setCurrentPage]        = useState(1)
  const [itemsPerPage,       setItemsPerPage]       = useState(ROWS_PER_PAGE)

  useEffect(() => {
    if (partners.length === 0) { setPartnerResults(new Map()); return }
    setLoading(true)
    Promise.all(
      partners.map(async p => {
        try {
          const r = await fetch(`/api/players/${p.plid}/results?partner_id=${playerId}`)
          const rows: ResultRow[] = await r.json()
          return { plid: p.plid, rows }
        } catch {
          return { plid: p.plid, rows: [] as ResultRow[] }
        }
      })
    ).then(results => {
      const map = new Map<number, ResultRow[]>()
      results.forEach(({ plid, rows }) => map.set(plid, rows))
      setPartnerResults(map)
      setLoading(false)
    })
  }, [partners, playerId])

  useEffect(() => {
    setFilter_plid(new Set(partners.map(p => p.plid)))
  }, [partners])

  useEffect(() => { setCurrentPage(1) },
    [filter_run_id, filter_date_from, filter_date_to, filter_day_of_week, filter_plid, filter_scoring, filter_name,
     filter_club, filter_tournament, filter_event_type, filter_is_summary])

  const allRows: FlatRow[] = useMemo(() => {
    const rows: FlatRow[] = []
    partners.forEach(p => {
      ;(partnerResults.get(p.plid) ?? []).forEach(r => {
        rows.push({ ...r, player_id: p.plid, player_name: p.name })
      })
    })
    return rows.sort((a, b) => (a.date > b.date ? -1 : 1))
  }, [partners, partnerResults])

  const filtered = useMemo(() => {
    let rows = allRows
    if (filter_plid.size < partners.length) rows = rows.filter(r => filter_plid.has(r.player_id))
    if (filter_run_id)            rows = rows.filter(r => String(r.run_id).includes(filter_run_id))
    if (filter_date_from)          rows = rows.filter(r => r.date.slice(0, 10) >= filter_date_from)
    if (filter_date_to)            rows = rows.filter(r => r.date.slice(0, 10) <= filter_date_to)
    if (filter_day_of_week)         rows = rows.filter(r => r.day_of_week === filter_day_of_week)
    if (filter_scoring !== 'all') rows = rows.filter(r => r.scoring === filter_scoring)
    if (filter_name) rows = rows.filter(r => r.session_name.toLowerCase().includes(filter_name.toLowerCase()))
    if (isSelectionFiltering([...filter_club], clubOptions.length))
                           rows = rows.filter(r => filter_club.has(r.club))
    if (isSelectionFiltering([...filter_tournament], 3))
                           rows = rows.filter(r => filter_tournament.has((r.tournament ?? '').match(/[ABC]$/i)?.[0]?.toUpperCase() ?? ''))
    if (isSelectionFiltering([...filter_event_type], eventTypeOptions.length))
                           rows = rows.filter(r => filter_event_type.has(r.event_type))
    if (filter_is_summary === 'summary') rows = rows.filter(r => r.is_summary === true)
    if (filter_is_summary === 'session') rows = rows.filter(r => r.is_summary !== true)
    return rows
  }, [allRows, filter_plid, partners.length, filter_run_id, filter_date_from, filter_date_to, filter_day_of_week,
      filter_scoring, filter_name, filter_club, clubOptions.length,
      filter_tournament, filter_event_type, eventTypeOptions.length, filter_is_summary])

  // Remap for PerformanceChart: group lines by player_id (the main player's partners)
  const graphRows = useMemo(() => filtered.map(r => ({
    session_id:   r.session_id,
    date:         r.date,
    day_of_week:  r.day_of_week,
    percentage:   r.percentage ?? 0,
    vp:           r.vp,
    ximp:         r.ximp,
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
    const header = ['Player','Run ID','Date','Day','Partner','Partner NZB#','Session','Club','Tournament','Event Type','Scoring','Summary','%','VP','XIMP']
    const dataRows = filtered.map(r => [
      r.player_name,
      r.run_id,
      r.date.slice(0, 10),
      r.day_of_week,
      r.partner_name ?? '',
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
            <ScoringTypeToggle value={graphScoring} onChange={setGraphScoring} />
          </div>
          {graphRows.length > 0
            ? <PerformanceChart results={graphRows} scoring={graphScoring} />
            : <div className='text-sm text-gray-400 py-4 text-center'>No data to graph</div>}
        </div>
      ) : (
      <div className='overflow-x-auto' style={{ minHeight: TABLE_MIN_HEIGHT_PX }}>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-gray-200'>
              <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_PLID}`}>Player</th>
              <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_RUN_ID}`}>Run ID</th>
              <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_DATE}`}>Date</th>
              <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_DAY_OF_WEEK}`}>Day</th>
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
              <td className='py-1 pr-1'>
                <FilterPlid players={partners} selected={filter_plid} onChange={setFilter_plid} />
              </td>
              <td className='py-1 pr-1'>
                <FilterRunId value={filter_run_id} onChange={setFilter_run_id} />
              </td>
              <td className='py-1 pr-1'>
                <div className='flex flex-col gap-0.5'>
                  <FilterDate value={filter_date_from} onChange={setFilter_date_from} />
                  <FilterDate value={filter_date_to} onChange={setFilter_date_to} />
                </div>
              </td>
              <td className='py-1 pr-1'>
                <FilterDayOfWeek value={filter_day_of_week} onChange={setFilter_day_of_week} />
              </td>
              <td className='py-1 pr-1'>
                <FilterName value={filter_name} onChange={setFilter_name} placeholder='Search…' />
              </td>
              <td className='py-1 pr-1'>
                <ClubSelect selected={filter_club} onChange={setFilter_club}
                  onOptionsLoaded={opts => { setClubOptions(opts); setFilter_club(new Set(opts)) }} />
              </td>
              <td className='py-1 pr-1'>
                <StringMultiSelect options={['A', 'B', 'C']} selected={filter_tournament} onChange={setFilter_tournament} />
              </td>
              <td className='py-1 pr-1'>
                <EventTypeSelect selected={filter_event_type} onChange={setFilter_event_type}
                  onOptionsLoaded={opts => { setEventTypeOptions(opts); setFilter_event_type(new Set(opts)) }} />
              </td>
              <td className='py-1 pr-1'>
                <ScoringTypeSelect value={filter_scoring} onChange={v => setFilter_scoring(v as 'all' | (typeof SCORING_TYPES)[number])} includeAll />
              </td>
              <td className='py-1 pr-1'>
                <FilterIsSummary value={filter_is_summary} onChange={setFilter_is_summary} />
              </td>
              <td className='py-1' />
              <td className='py-1' />
              <td className='py-1' />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <TableEmptyRow colSpan={13} message='No results match the current filters.' />
            ) : filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((r, i) => (
              <tr key={i}
                className='border-b border-gray-100 hover:bg-gray-50 cursor-pointer'
                onClick={() => {
                  saveBackNav(BACK_KEY)
                  window.location.href = `/session/${r.session_id}`
                }}
              >
                <td className='py-1.5'>
                  <Link href={`/player/${r.player_id}`}
                    className='text-blue-600 hover:underline font-medium'
                    onClick={e => { e.stopPropagation(); saveBackNav(BACK_KEY) }}>
                    {r.player_name}
                  </Link>
                </td>
                <td className='py-1.5 text-gray-400 text-xs font-mono'>{r.run_id}</td>
                <td className='py-1.5'>{r.date.slice(0, 10)}</td>
                <td className='py-1.5 text-gray-500'>{r.day_of_week}</td>
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

      {view === 'data' && filtered.length > itemsPerPage && (
        <MyPaginationFooter
          totalPages={Math.ceil(filtered.length / itemsPerPage)}
          statecurrentPage={currentPage}
          setStateCurrentPage={setCurrentPage}
          rowsPerPage={itemsPerPage}
          setRowsPerPage={v => { setItemsPerPage(v); setCurrentPage(1) }}
        />
      )}
    </div>
  )
}
