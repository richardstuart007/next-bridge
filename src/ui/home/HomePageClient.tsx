'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getSessionsPaged, SessionListRow } from '@/src/lib/actions/sessions'
import { ClubSelect, GradeSelect, RankSelect, StringMultiSelect } from '@/src/ui/shared/LookupSelects'
import { TableEmptyRow } from '@/src/ui/shared/TableEmptyRow'
import { ScoringTypeMultiSelect } from '@/src/ui/shared/ScoringTypeSelects'
import { SummaryTypeMultiSelect } from '@/src/ui/shared/SummaryTypeSelects'
import { saveBackNav } from 'nextjs-shared/useBackNav'
import { isSelectionFiltering } from 'nextjs-shared/isSelectionFiltering'
import { myMergeClasses } from 'nextjs-shared/MyMergeClasses'
import {
  BACK_KEY, EARLIEST_DATA_DATE, ROWS_PER_PAGE, FILTER_DEBOUNCE_MS, TABLE_MIN_HEIGHT_PX,
  WIDTH_DAY, WIDTH_TOURNAMENT_TYPE, WIDTH_TOURNAMENT_NAME,
  SCORING_TYPES, SUMMARY_TYPES
} from '@/src/lib/constants'
import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'
import { MyHelpField } from 'nextjs-shared/MyHelpField'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import { MyTab } from 'nextjs-shared/MyTab'
import { useTabQueryState } from 'nextjs-shared/useTabQueryState'
import RankingsPageClient from '@/src/ui/rankings/RankingsPageClient'

interface PlayerRow {
  pl_plid: number
  pl_nz_bridge_number: number | null
  pl_name: string
  pl_rank: string
  pl_grade: string
  pl_club: string
  pl_rating: number
  pl_a_points: number
  a1_sessions: number
  a1_avg_pct: number
  pl_tracked: boolean
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const TOURNAMENT_TYPES = ['A', 'B', 'C']
const INPUT_CLS  = 'w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs font-normal'
const NUM_CLS    = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'

const SESSION_KEY = 'home_state'

function loadSaved() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') } catch { return null }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HomePageClient() {
  const router = useRouter()
  const restoredRef    = useRef(false)
  const savedRef        = useRef<Record<string, unknown> | null>(null)

  const [activeTab, setActiveTab] = useTabQueryState('tab', 'players')

  // ── Option counts for filter comparisons (populated via onOptionsLoaded callbacks) ──
  const [fTournamentTypes, setFTournamentTypes] = useState<Set<string>>(new Set(TOURNAMENT_TYPES))
  const [sessClubOptions,   setSessClubOptions]   = useState<string[]>([])
  const [rankOptions,       setRankOptions]       = useState<string[]>([])
  const [gradeOptions,      setGradeOptions]      = useState<string[]>([])
  const [clubOptions,       setClubOptions]       = useState<string[]>([])

  // ── Players ──
  const [players,          setPlayers]          = useState<PlayerRow[]>([])
  const [playersTotalPages, setPlayersTotalPages] = useState(1)
  const [playersTotalCount, setPlayersTotalCount] = useState(0)
  const [loadingPlayers,   setLoadingPlayers]    = useState(true)
  const [hasLoadedPlayersOnce, setHasLoadedPlayersOnce] = useState(false)
  const [playerPage, setPlayerPage] = useState(1)
  const [playerItemsPerPage, setPlayerItemsPerPage] = useState(ROWS_PER_PAGE)

  // Player filters
  const [fName,      setFName]      = useState('')
  const [fNz,        setFNz]        = useState('')
  const [fRanks,     setFRanks]     = useState<Set<string>>(new Set())
  const [fGrades,    setFGrades]    = useState<Set<string>>(new Set())
  const [fClubs,     setFClubs]     = useState<Set<string>>(new Set())
  const [fRatingMin, setFRatingMin] = useState('')
  const [fAMin,      setFAMin]      = useState('')
  const [fSessMin,   setFSessMin]   = useState('')
  const [fTracked,   setFTracked]   = useState(false)
  const [fExcludeNz0, setFExcludeNz0] = useState(true)

  // ── Sessions ──
  const [sessions,            setSessions]            = useState<SessionListRow[]>([])
  const [sessionsTotalPages,  setSessionsTotalPages]  = useState(1)
  const [dateFrom,            setDateFrom]            = useState('')
  const [dateTo,              setDateTo]              = useState('')
  const [fDays,               setFDays]               = useState<Set<string>>(new Set(DAYS))
  const [scoringFilter,       setScoringFilter]       = useState<Set<string>>(new Set(SCORING_TYPES))
  const [sessNameFilter,      setSessNameFilter]      = useState('')
  const [fSessClubs,          setFSessClubs]          = useState<Set<string>>(new Set())
  const [summaryFilter,       setSummaryFilter]       = useState<Set<string>>(new Set(SUMMARY_TYPES))
  const [sessionPage,         setSessionPage]         = useState(1)
  const [sessionItemsPerPage, setSessionItemsPerPage] = useState(ROWS_PER_PAGE)
  const [loadingSessions,     setLoadingSessions]     = useState(true)
  const [hasLoadedSessionsOnce, setHasLoadedSessionsOnce] = useState(false)

  // ── Restore from sessionStorage on mount ──
  useEffect(() => {
    const s = loadSaved()
    savedRef.current = s
    if (s) {
      if (s.fName)              setFName(s.fName)
      if (s.fNz)                setFNz(s.fNz)
      // fRanks/fGrades/fClubs are restored inside their own onOptionsLoaded callbacks below,
      // once the full option list is known (same pattern as PlayerPageClient.tsx)
      if (s.fRatingMin)         setFRatingMin(s.fRatingMin)
      if (s.fAMin)              setFAMin(s.fAMin)
      if (s.fSessMin)                    setFSessMin(s.fSessMin)
      if (s.fTracked)                    setFTracked(s.fTracked)
      if (s.fExcludeNz0 !== undefined)   setFExcludeNz0(s.fExcludeNz0)
      if (s.playerPage)                  setPlayerPage(s.playerPage)
      if (s.playerItemsPerPage)          setPlayerItemsPerPage(s.playerItemsPerPage)
      // Session tab filters
      if (s.dateFrom)                    setDateFrom(s.dateFrom)
      if (s.dateTo)                      setDateTo(s.dateTo)
      if (s.fDays?.length) {
        const valid = s.fDays.filter((d: string) => DAYS.includes(d))
        if (valid.length > 0) setFDays(new Set(valid))
      }
      if (s.scoringFilter?.length) {
        const valid = s.scoringFilter.filter((v: string) => (SCORING_TYPES as readonly string[]).includes(v))
        if (valid.length > 0) setScoringFilter(new Set(valid))
      }
      if (s.sessNameFilter !== undefined) setSessNameFilter(s.sessNameFilter)
      if (s.summaryFilter?.length) {
        const valid = s.summaryFilter.filter((v: string) => (SUMMARY_TYPES as readonly string[]).includes(v))
        if (valid.length > 0) setSummaryFilter(new Set(valid))
      }
      if (s.sessionPage)                 setSessionPage(s.sessionPage)
      if (s.sessionItemsPerPage)         setSessionItemsPerPage(s.sessionItemsPerPage)
    }
    restoredRef.current = true
  }, [])

  // ── Save to sessionStorage whenever state changes (after restore) ──
  useEffect(() => {
    if (!restoredRef.current) return
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        fName, fNz, fTracked, fExcludeNz0,
        fRanks: [...fRanks], fGrades: [...fGrades], fClubs: [...fClubs],
        fRatingMin, fAMin, fSessMin,
        playerPage, playerItemsPerPage,
        dateFrom, dateTo, fDays: [...fDays], scoringFilter: [...scoringFilter], sessNameFilter,
        summaryFilter: [...summaryFilter],
        sessionPage, sessionItemsPerPage,
      }))
    } catch {}
  }, [fName, fNz, fTracked, fExcludeNz0, fRanks, fGrades, fClubs,
      fRatingMin, fAMin, fSessMin,
      playerPage, playerItemsPerPage,
      dateFrom, dateTo, fDays, scoringFilter, sessNameFilter, summaryFilter,
      sessionPage, sessionItemsPerPage])

  const isTracked = (v: unknown) => v === true || v === 't' || v === 'true' || v === 1

  const hasPlayerFilter = fTracked || fName || fNz ||
    isSelectionFiltering([...fRanks], rankOptions.length) ||
    isSelectionFiltering([...fGrades], gradeOptions.length) ||
    isSelectionFiltering([...fClubs], clubOptions.length) ||
    fRatingMin || fAMin || fSessMin

  function clearPlayerFilters() {
    setFTracked(false); setFExcludeNz0(true)
    setFName(''); setFNz('')
    setFRanks(new Set(rankOptions)); setFGrades(new Set(gradeOptions)); setFClubs(new Set(clubOptions))
    setFRatingMin(''); setFAMin(''); setFSessMin('')
  }

  // Reset to page 1 whenever a player filter changes
  useEffect(() => {
    if (restoredRef.current) setPlayerPage(1)
  }, [fTracked, fExcludeNz0, fName, fNz, fRanks, fGrades, fClubs, fRatingMin, fAMin, fSessMin])

  // Reset to page 1 whenever a session filter changes
  useEffect(() => {
    if (restoredRef.current) setSessionPage(1)
  }, [dateFrom, dateTo, fDays, scoringFilter, sessNameFilter, fTournamentTypes, fSessClubs, summaryFilter])

  // ── Players: fetch only the current page from the server (debounced) ──
  useEffect(() => {
    const timer = setTimeout(() => {
      (async () => {
        setLoadingPlayers(true)
        try {
          const params = new URLSearchParams()
          if (fName) params.set('name', fName)
          if (fNz)   params.set('nz', fNz)
          if (isSelectionFiltering([...fRanks], rankOptions.length))   params.set('ranks', [...fRanks].join(','))
          if (isSelectionFiltering([...fGrades], gradeOptions.length)) params.set('grades', [...fGrades].join(','))
          if (isSelectionFiltering([...fClubs], clubOptions.length))   params.set('clubs', [...fClubs].join(','))
          if (fRatingMin) params.set('ratingMin', fRatingMin)
          if (fAMin)      params.set('aMin', fAMin)
          if (fSessMin)   params.set('sessMin', fSessMin)
          if (fTracked)   params.set('tracked', 'true')
          params.set('excludeNz0', String(fExcludeNz0))
          params.set('page', String(playerPage))
          params.set('itemsPerPage', String(playerItemsPerPage))

          const r = await fetch(`/api/admin/players?${params.toString()}`)
          const data = await r.json()
          setPlayers(data.rows as PlayerRow[])
          setPlayersTotalPages(data.totalPages ?? 1)
          setPlayersTotalCount(data.totalCount ?? 0)
        } catch (err) { console.error(err) }
        finally { setLoadingPlayers(false); setHasLoadedPlayersOnce(true) }
      })()
    }, FILTER_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [fName, fNz, fRanks, fGrades, fClubs, rankOptions.length, gradeOptions.length, clubOptions.length,
      fRatingMin, fAMin, fSessMin, fTracked, fExcludeNz0,
      playerPage, playerItemsPerPage])

  // ── Sessions: fetch only the current page from the server (debounced) ──
  useEffect(() => {
    const timer = setTimeout(() => {
      (async () => {
        setLoadingSessions(true)
        try {
          const { rows, totalPages } = await getSessionsPaged(sessionPage, sessionItemsPerPage, {
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            days: isSelectionFiltering([...fDays], DAYS.length) ? [...fDays] : undefined,
            scoring: isSelectionFiltering([...scoringFilter], SCORING_TYPES.length) ? [...scoringFilter] : undefined,
            name: sessNameFilter || undefined,
            clubs: isSelectionFiltering([...fSessClubs], sessClubOptions.length) ? [...fSessClubs] : undefined,
            summaryTypes: isSelectionFiltering([...summaryFilter], SUMMARY_TYPES.length) ? [...summaryFilter] : undefined,
            tournamentTypes: isSelectionFiltering([...fTournamentTypes], TOURNAMENT_TYPES.length) ? [...fTournamentTypes] : undefined,
          })
          setSessions(rows)
          setSessionsTotalPages(totalPages)
        } catch (err) { console.error(err) }
        finally { setLoadingSessions(false); setHasLoadedSessionsOnce(true) }
      })()
    }, FILTER_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [dateFrom, dateTo, fDays, scoringFilter, sessNameFilter, fSessClubs, sessClubOptions.length,
      summaryFilter, fTournamentTypes, sessionPage, sessionItemsPerPage])

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-bold text-gray-900'>Bridge Results Tracker</h1>

      {/* Tabs */}
      <div className='flex gap-1 border-b border-gray-200'>
        <MyTab active={activeTab === 'players'} onClick={() => setActiveTab('players')}
          underlineActiveClass='px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 bg-white border-gray-200 text-gray-900'
          underlineInactiveClass='px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'
        >
          <span className='flex items-center gap-1'>
            Players
          </span>
        </MyTab>
        <MyTab active={activeTab === 'sessions'} onClick={() => setActiveTab('sessions')}
          underlineActiveClass='px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 bg-white border-gray-200 text-gray-900'
          underlineInactiveClass='px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'
        >Sessions</MyTab>
        <MyTab active={activeTab === 'rankings'} onClick={() => setActiveTab('rankings')}
          underlineActiveClass='px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 bg-white border-gray-200 text-gray-900'
          underlineInactiveClass='px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'
        >Rankings</MyTab>
      </div>

      {/* ── Players tab ───────────────────────────────────────────────────── */}
      <section className={`rounded border border-gray-200 p-4${activeTab !== 'players' ? ' hidden' : ''}`}>
          <div className='flex items-center justify-between mb-3'>
            <h2 className='text-base font-semibold text-gray-800'>
              Players
              <span className='ml-2 text-xs font-normal text-gray-400'>{playersTotalCount} found</span>
            </h2>
            {hasPlayerFilter && (
              <MyButton onClick={clearPlayerFilters} overrideClass='text-xs text-blue-600 hover:underline bg-transparent hover:bg-transparent h-auto md:h-auto px-0'>Clear filters</MyButton>
            )}
          </div>

          {!hasLoadedPlayersOnce ? (
            <p className='text-sm text-gray-400'>Loading…</p>
          ) : (
            <>
              <div className='overflow-x-auto' style={{ minHeight: TABLE_MIN_HEIGHT_PX }}>
                <table className='w-full text-sm'>
                  <thead className='sticky top-0 z-10 bg-white'>
                    <tr className='border-b border-gray-200'>
                      <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-20'>Name</th>
                      <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-20'>NZ#</th>
                      <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-40'>Rank</th>
                      <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-28'>Grade</th>
                      <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-28'>Club</th>
                      <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-20'>Rating</th>
                      <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-16'>A Pts</th>
                      <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-20'>Avg %</th>
                      <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-16'>Sessions</th>
                      <th className='py-1.5 text-center text-xs text-gray-500 font-medium w-16'>Tracked</th>
                    </tr>
                    <tr className='border-b border-gray-100 bg-gray-50 align-top'>
                      <td className='py-1 pr-1'>
                        <div className='relative'>
                          <MyInput type='text' value={fName} onChange={e => setFName(e.target.value)}
                            placeholder='Filter…' overrideClass={`${INPUT_CLS} pr-5 h-auto md:h-auto`} />
                          <MyHelpField text='Type any part of a player name. Case-insensitive.'
                            className='absolute right-1 top-1/2 -translate-y-1/2' />
                        </div>
                      </td>
                      <td className='py-1 pr-1'>
                        <MyInput type='text' value={fNz} onChange={e => setFNz(e.target.value)}
                          placeholder='Filter…' overrideClass={`${INPUT_CLS} h-auto md:h-auto`} />
                        <label className='flex items-center gap-1 mt-0.5 cursor-pointer text-xs text-gray-500 whitespace-nowrap'>
                          <input type='checkbox' checked={fExcludeNz0} onChange={e => setFExcludeNz0(e.target.checked)} />
                          Excl. 0
                        </label>
                      </td>
                      <td className='py-1 pr-1'>
                        <RankSelect selected={fRanks} onChange={setFRanks}
                          onOptionsLoaded={opts => {
                            setRankOptions(opts)
                            const saved = savedRef.current?.fRanks as string[] | undefined
                            if (saved?.length) {
                              const valid = new Set(saved.filter(o => opts.includes(o)))
                              setFRanks(valid.size > 0 ? valid : new Set(opts))
                            } else {
                              setFRanks(new Set(opts))
                            }
                          }} />
                      </td>
                      <td className='py-1 pr-1'>
                        <GradeSelect selected={fGrades} onChange={setFGrades}
                          onOptionsLoaded={opts => {
                            setGradeOptions(opts)
                            const saved = savedRef.current?.fGrades as string[] | undefined
                            if (saved?.length) {
                              const valid = new Set(saved.filter(o => opts.includes(o)))
                              setFGrades(valid.size > 0 ? valid : new Set(opts))
                            } else {
                              setFGrades(new Set(opts))
                            }
                          }} />
                      </td>
                      <td className='py-1 pr-1'>
                        <ClubSelect selected={fClubs} onChange={setFClubs}
                          onOptionsLoaded={opts => {
                            setClubOptions(opts)
                            const saved = savedRef.current?.fClubs as string[] | undefined
                            if (saved?.length) {
                              const valid = new Set(saved.filter(o => opts.includes(o)))
                              setFClubs(valid.size > 0 ? valid : new Set(opts))
                            } else {
                              setFClubs(new Set(opts))
                            }
                          }} />
                      </td>
                      <td className='py-1 pr-1'>
                        <MyInput type='text' inputMode='decimal' placeholder='Min' value={fRatingMin}
                          onChange={e => setFRatingMin(e.target.value)} overrideClass={`${NUM_CLS} h-auto md:h-auto`} />
                      </td>
                      <td className='py-1 pr-1'>
                        <MyInput type='text' inputMode='decimal' placeholder='Min' value={fAMin}
                          onChange={e => setFAMin(e.target.value)} overrideClass={`${NUM_CLS} h-auto md:h-auto`} />
                      </td>
                      <td className='py-1 pr-1' />
                      <td className='py-1 pr-1'>
                        <MyInput type='text' inputMode='numeric' placeholder='Min' value={fSessMin}
                          onChange={e => setFSessMin(e.target.value)} overrideClass={`${NUM_CLS} h-auto md:h-auto`} />
                      </td>
                      <td className='py-1 text-center'>
                        <label className='flex items-center justify-center cursor-pointer' title='Tracked only'>
                          <input type='checkbox' checked={fTracked} onChange={e => setFTracked(e.target.checked)} />
                        </label>
                      </td>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map(({ pl_plid, pl_name, pl_nz_bridge_number, pl_rank, pl_grade, pl_club, pl_rating, pl_a_points, a1_avg_pct, a1_sessions, pl_tracked }) => (
                      <tr key={pl_plid}
                        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${isTracked(pl_tracked) ? 'bg-green-50' : ''}`}
                        onClick={() => {
                          saveBackNav(BACK_KEY)
                          router.push(`/player/${pl_plid}`)
                        }}
                      >
                        <td className='py-1.5 font-medium text-blue-600'>{pl_name}</td>
                        <td className='py-1.5 text-gray-500 text-xs'>{pl_nz_bridge_number || '—'}</td>
                        <td className='py-1.5 text-gray-600'>{pl_rank || '—'}</td>
                        <td className='py-1.5 text-gray-600'>{pl_grade || '—'}</td>
                        <td className='py-1.5 text-gray-500'>{pl_club || '—'}</td>
                        <td className='py-1.5 text-right text-gray-700 font-mono text-xs'>{parseFloat(String(pl_rating)).toFixed(2)}</td>
                        <td className='py-1.5 text-right text-gray-700 font-mono text-xs'>{parseFloat(String(pl_a_points)).toFixed(2)}</td>
                        <td className='py-1.5 text-right font-medium'>{parseFloat(String(a1_avg_pct)).toFixed(2)}%</td>
                        <td className='py-1.5 text-right text-gray-600'>{a1_sessions}</td>
                        <td className='py-1.5 text-center'>
                          {isTracked(pl_tracked) && <span className='inline-block w-2 h-2 rounded-full bg-green-500' />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {playersTotalPages > 1 && (
                <MyPaginationFooter
                  totalPages={playersTotalPages}
                  statecurrentPage={playerPage}
                  setStateCurrentPage={setPlayerPage}
                  rowsPerPage={playerItemsPerPage}
                  setRowsPerPage={v => { setPlayerItemsPerPage(v); setPlayerPage(1) }}
                  rowsOptions={[15, 20, 50, 100]}
                />
              )}
            </>
          )}
      </section>

      {/* ── Sessions tab ──────────────────────────────────────────────────── */}
      <section className={`rounded border border-gray-200 p-4${activeTab !== 'sessions' ? ' hidden' : ''}`}>
          <div className='mb-3 flex items-center justify-between'>
            <h2 className='text-base font-semibold text-gray-800'>
              Sessions
              <span className='ml-2 text-xs font-normal text-gray-400'>
                {loadingSessions ? 'Loading…' : `page ${sessionPage} of ${sessionsTotalPages}`}
              </span>
            </h2>
          </div>

          {!hasLoadedSessionsOnce ? (
            <p className='text-sm text-gray-400'>Loading…</p>
          ) : (
            <table className='w-full text-sm'>
              <thead className='sticky top-0 z-10 bg-white'>
                <tr className='border-b border-gray-200'>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-20'>ID</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-36'>Date</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-28'>Day</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-16'>Type</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-16'>Scoring</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-20'>Summary</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium whitespace-nowrap'>Club</th>
                  <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_TOURNAMENT_NAME}`}>Tournament Name</th>
                </tr>
                <tr className='border-b border-gray-100 bg-gray-50'>
                  <td className='py-1 pr-2' />
                  <td className='py-1 pr-2'>
                    <div className='flex flex-col gap-0.5'>
                      <MyInput type='date' value={dateFrom} min={EARLIEST_DATA_DATE} max={new Date().toISOString().slice(0, 10)} onChange={e => setDateFrom(e.target.value)} overrideClass={`${INPUT_CLS} h-auto md:h-auto`} />
                      <MyInput type='date' value={dateTo}   min={EARLIEST_DATA_DATE} max={new Date().toISOString().slice(0, 10)} onChange={e => setDateTo(e.target.value)}   overrideClass={`${INPUT_CLS} h-auto md:h-auto`} />
                    </div>
                  </td>
                  <td className='py-1 pr-2'>
                    <StringMultiSelect options={DAYS} selected={fDays} onChange={setFDays} overrideClass={WIDTH_DAY} />
                  </td>
                  <td className='py-1 pr-2'>
                    <StringMultiSelect options={TOURNAMENT_TYPES} selected={fTournamentTypes} onChange={setFTournamentTypes} overrideClass={WIDTH_TOURNAMENT_TYPE} />
                  </td>
                  <td className='py-1 pr-2'>
                    <ScoringTypeMultiSelect selected={scoringFilter} onChange={setScoringFilter} />
                  </td>
                  <td className='py-1 pr-2'>
                    <SummaryTypeMultiSelect selected={summaryFilter} onChange={setSummaryFilter} />
                  </td>
                  <td className='py-1 pr-2'>
                    <ClubSelect selected={fSessClubs} onChange={setFSessClubs}
                      onOptionsLoaded={opts => { setSessClubOptions(opts); setFSessClubs(new Set(opts)) }} />
                  </td>
                  <td className='py-1'>
                    <MyInput type='text' value={sessNameFilter} onChange={e => setSessNameFilter(e.target.value)}
                      placeholder='Search…' overrideClass={myMergeClasses(INPUT_CLS, `${WIDTH_TOURNAMENT_NAME} h-auto md:h-auto`)} />
                  </td>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <TableEmptyRow colSpan={8} message='No sessions found.' />
                ) : sessions.map(s => (
                  <tr key={s.se_seid}
                    className='border-b border-gray-100 hover:bg-gray-50 cursor-pointer'
                    onClick={() => {
                      saveBackNav(BACK_KEY)
                      router.push(`/session/${s.se_seid}`)
                    }}
                  >
                    <td className='py-1.5 font-mono text-xs text-gray-400'>
                      <a href={`https://www.nzbridge.co.nz/results.html?run_id=${s.se_run_id}`}
                         target='_blank' rel='noopener noreferrer'
                         className='text-blue-600 hover:underline'
                         onClick={e => e.stopPropagation()}>
                        {s.se_run_id}
                      </a>
                    </td>
                    <td className='py-1.5'>{new Date(s.se_date).toISOString().slice(0, 10)}</td>
                    <td className='py-1.5'>{s.se_day_of_week}</td>
                    <td className='py-1.5 text-gray-500'>{s.se_tournament || '—'}</td>
                    <td className='py-1.5 text-gray-500'>{s.se_scoring}</td>
                    <td className='py-1.5'>
                      {s.se_is_summary === true
                        ? <span className='rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700'>Summary</span>
                        : s.se_is_summary === null || s.se_is_summary === undefined
                          ? <span className='text-gray-300 text-xs'>?</span>
                          : <span className='text-gray-400 text-xs'>—</span>}
                    </td>
                    <td className='py-1.5 text-gray-500 whitespace-nowrap'>{s.se_club || '—'}</td>
                    <td className='py-1.5 text-gray-600'>{s.se_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sessionsTotalPages > 1 && (
            <MyPaginationFooter
              totalPages={sessionsTotalPages}
              statecurrentPage={sessionPage}
              setStateCurrentPage={setSessionPage}
              rowsPerPage={sessionItemsPerPage}
              setRowsPerPage={v => { setSessionItemsPerPage(v); setSessionPage(1) }}
            />
          )}
      </section>

      {/* ── Rankings tab ──────────────────────────────────────────────────── */}
      <section className={`rounded border border-gray-200 p-4${activeTab !== 'rankings' ? ' hidden' : ''}`}>
        <RankingsPageClient />
      </section>
    </div>
  )
}
