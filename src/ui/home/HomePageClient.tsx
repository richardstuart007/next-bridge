'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getSessionsPaged, SessionListRow } from '@/src/lib/actions/sessions'
import { ClubSelect, GradeSelect, RankSelect, StringMultiSelect } from '@/src/ui/shared/LookupSelects'
import { TableEmptyRow } from '@/src/ui/shared/TableEmptyRow'
import { NumberFilterInput } from '@/src/ui/shared/NumberFilterInput'
import { FilterName } from '@/src/ui/shared/FilterName'
import { FilterTracked } from '@/src/ui/shared/FilterTracked'
import { FilterDate } from '@/src/ui/shared/FilterDate'
import { FilterRunId } from '@/src/ui/shared/FilterRunId'
import { ScoringTypeMultiSelect } from '@/src/ui/shared/ScoringTypeSelects'
import { SummaryTypeMultiSelect } from '@/src/ui/shared/SummaryTypeSelects'
import { saveBackNav } from 'nextjs-shared/useBackNav'
import { isSelectionFiltering, SELECTION_ALL, serializeSelection } from 'nextjs-shared/isSelectionFiltering'
import {
  BACK_KEY, ROWS_PER_PAGE, FILTER_DEBOUNCE_MS, TABLE_MIN_HEIGHT_PX,
  WIDTH_DAY_OF_WEEK, WIDTH_TOURNAMENT_TYPE, WIDTH_TOURNAMENT_NAME,
  WIDTH_NZB, WIDTH_RANK, WIDTH_GRADE, WIDTH_CLUB, WIDTH_RATING_MIN, WIDTH_A_POINTS_MIN,
  WIDTH_SESSIONS_MIN, WIDTH_TRACKED, WIDTH_NAME, WIDTH_DATE, WIDTH_IS_SUMMARY, WIDTH_SCORING, WIDTH_RUN_ID,
  SCORING_TYPES, SUMMARY_TYPES, DAYS_OF_WEEK, SESSION_STORAGE_PREFIX
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
  pl_nzb: number | null
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

const TOURNAMENT_TYPES = ['A', 'B', 'C']
const INPUT_CLS  = 'w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs font-normal'
const NUM_CLS    = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'

const SESSION_KEY = `${SESSION_STORAGE_PREFIX}home_state`

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
  const [filter_pl_name,      setFilter_pl_name]      = useState('')
  const [filter_nzb,        setFilter_nzb]        = useState('')
  const [filter_rank,     setFilter_rank]     = useState<Set<string>>(new Set())
  const [filter_grade,    setFilter_grade]    = useState<Set<string>>(new Set())
  const [filter_pl_club,     setFilter_pl_club]     = useState<Set<string>>(new Set())
  const [filter_rating_min, setFilter_rating_min] = useState('')
  const [filter_a_points_min,      setFilter_a_points_min]      = useState('')
  const [filter_sessions_min,   setFilter_sessions_min]   = useState('')
  const [filter_tracked,   setFilter_tracked]   = useState(false)
  const [filter_exclude_nzb0, setFilter_exclude_nzb0] = useState(true)

  // ── Sessions ──
  const [sessions,            setSessions]            = useState<SessionListRow[]>([])
  const [sessionsTotalPages,  setSessionsTotalPages]  = useState(1)
  const [filter_run_id,               setFilter_run_id]               = useState('')
  const [filter_date_from,            setFilter_date_from]            = useState('')
  const [filter_date_to,              setFilter_date_to]              = useState('')
  const [filter_day_of_week,               setFilter_day_of_week]               = useState<Set<string>>(new Set(DAYS_OF_WEEK))
  const [filter_scoring,       setFilter_scoring]       = useState<Set<string>>(new Set(SCORING_TYPES))
  const [filter_se_name,      setFilter_se_name]      = useState('')
  const [filter_se_club,          setFilter_se_club]          = useState<Set<string>>(new Set())
  const [filter_is_summary,       setFilter_is_summary]       = useState<Set<string>>(new Set(SUMMARY_TYPES))
  const [sessionPage,         setSessionPage]         = useState(1)
  const [sessionItemsPerPage, setSessionItemsPerPage] = useState(ROWS_PER_PAGE)
  const [loadingSessions,     setLoadingSessions]     = useState(true)
  const [hasLoadedSessionsOnce, setHasLoadedSessionsOnce] = useState(false)

  // ── Restore from sessionStorage on mount ──
  useEffect(() => {
    const s = loadSaved()
    savedRef.current = s
    if (s) {
      if (s.filter_pl_name)              setFilter_pl_name(s.filter_pl_name)
      if (s.filter_nzb)                setFilter_nzb(s.filter_nzb)
      // filter_rank/filter_grade/filter_pl_club are restored inside their own onOptionsLoaded callbacks below,
      // once the full option list is known (same pattern as PlayerPageClient.tsx)
      if (s.filter_rating_min)         setFilter_rating_min(s.filter_rating_min)
      if (s.filter_a_points_min)              setFilter_a_points_min(s.filter_a_points_min)
      if (s.filter_sessions_min)                    setFilter_sessions_min(s.filter_sessions_min)
      if (s.filter_tracked)                    setFilter_tracked(s.filter_tracked)
      if (s.filter_exclude_nzb0 !== undefined)   setFilter_exclude_nzb0(s.filter_exclude_nzb0)
      if (s.playerPage)                  setPlayerPage(s.playerPage)
      if (s.playerItemsPerPage)          setPlayerItemsPerPage(s.playerItemsPerPage)
      // Session tab filters
      if (s.filter_run_id)                       setFilter_run_id(s.filter_run_id)
      if (s.filter_date_from)                    setFilter_date_from(s.filter_date_from)
      if (s.filter_date_to)                      setFilter_date_to(s.filter_date_to)
      if (Array.isArray(s.filter_day_of_week) && s.filter_day_of_week.length) {
        const valid = s.filter_day_of_week.filter((d: string) => DAYS_OF_WEEK.includes(d))
        if (valid.length > 0) setFilter_day_of_week(new Set(valid))
      }
      if (Array.isArray(s.filter_scoring) && s.filter_scoring.length) {
        const valid = s.filter_scoring.filter((v: string) => (SCORING_TYPES as readonly string[]).includes(v))
        if (valid.length > 0) setFilter_scoring(new Set(valid))
      }
      if (s.filter_se_name !== undefined) setFilter_se_name(s.filter_se_name)
      if (Array.isArray(s.filter_is_summary) && s.filter_is_summary.length) {
        const valid = s.filter_is_summary.filter((v: string) => (SUMMARY_TYPES as readonly string[]).includes(v))
        if (valid.length > 0) setFilter_is_summary(new Set(valid))
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
        filter_pl_name, filter_nzb, filter_tracked, filter_exclude_nzb0,
        filter_rank: serializeSelection([...filter_rank], rankOptions.length),
        filter_grade: serializeSelection([...filter_grade], gradeOptions.length),
        filter_pl_club: serializeSelection([...filter_pl_club], clubOptions.length),
        filter_rating_min, filter_a_points_min, filter_sessions_min,
        playerPage, playerItemsPerPage,
        filter_run_id, filter_date_from, filter_date_to,
        filter_day_of_week: serializeSelection([...filter_day_of_week], DAYS_OF_WEEK.length),
        filter_scoring: serializeSelection([...filter_scoring], SCORING_TYPES.length),
        filter_se_name,
        filter_se_club: serializeSelection([...filter_se_club], sessClubOptions.length),
        filter_is_summary: serializeSelection([...filter_is_summary], SUMMARY_TYPES.length),
        sessionPage, sessionItemsPerPage,
      }))
    } catch {}
  }, [filter_pl_name, filter_nzb, filter_tracked, filter_exclude_nzb0, filter_rank, filter_grade, filter_pl_club, rankOptions.length, gradeOptions.length, clubOptions.length,
      filter_rating_min, filter_a_points_min, filter_sessions_min,
      playerPage, playerItemsPerPage,
      filter_run_id, filter_date_from, filter_date_to, filter_day_of_week, filter_scoring, filter_se_name, filter_se_club, sessClubOptions.length, filter_is_summary,
      sessionPage, sessionItemsPerPage])

  const isTracked = (v: unknown) => v === true || v === 't' || v === 'true' || v === 1

  const hasPlayerFilter = filter_tracked || filter_pl_name || filter_nzb ||
    isSelectionFiltering([...filter_rank], rankOptions.length) ||
    isSelectionFiltering([...filter_grade], gradeOptions.length) ||
    isSelectionFiltering([...filter_pl_club], clubOptions.length) ||
    filter_rating_min || filter_a_points_min || filter_sessions_min

  function clearPlayerFilters() {
    setFilter_tracked(false); setFilter_exclude_nzb0(true)
    setFilter_pl_name(''); setFilter_nzb('')
    setFilter_rank(new Set(rankOptions)); setFilter_grade(new Set(gradeOptions)); setFilter_pl_club(new Set(clubOptions))
    setFilter_rating_min(''); setFilter_a_points_min(''); setFilter_sessions_min('')
  }

  // Reset to page 1 whenever a player filter changes
  useEffect(() => {
    if (restoredRef.current) setPlayerPage(1)
  }, [filter_tracked, filter_exclude_nzb0, filter_pl_name, filter_nzb, filter_rank, filter_grade, filter_pl_club, filter_rating_min, filter_a_points_min, filter_sessions_min])

  // Reset to page 1 whenever a session filter changes
  useEffect(() => {
    if (restoredRef.current) setSessionPage(1)
  }, [filter_run_id, filter_date_from, filter_date_to, filter_day_of_week, filter_scoring, filter_se_name, fTournamentTypes, filter_se_club, filter_is_summary])

  // ── Players: fetch only the current page from the server (debounced) ──
  useEffect(() => {
    const timer = setTimeout(() => {
      (async () => {
        setLoadingPlayers(true)
        try {
          const params = new URLSearchParams()
          if (filter_pl_name) params.set('name', filter_pl_name)
          if (filter_nzb)   params.set('nzb', filter_nzb)
          if (isSelectionFiltering([...filter_rank], rankOptions.length))   params.set('ranks', [...filter_rank].join(','))
          if (isSelectionFiltering([...filter_grade], gradeOptions.length)) params.set('grades', [...filter_grade].join(','))
          if (isSelectionFiltering([...filter_pl_club], clubOptions.length))   params.set('clubs', [...filter_pl_club].join(','))
          if (filter_rating_min) params.set('rating_min', filter_rating_min)
          if (filter_a_points_min)      params.set('a_points_min', filter_a_points_min)
          if (filter_sessions_min)   params.set('sessions_min', filter_sessions_min)
          if (filter_tracked)   params.set('tracked', 'true')
          params.set('excludeNzb0', String(filter_exclude_nzb0))
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
  }, [filter_pl_name, filter_nzb, filter_rank, filter_grade, filter_pl_club, rankOptions.length, gradeOptions.length, clubOptions.length,
      filter_rating_min, filter_a_points_min, filter_sessions_min, filter_tracked, filter_exclude_nzb0,
      playerPage, playerItemsPerPage])

  // ── Sessions: fetch only the current page from the server (debounced) ──
  useEffect(() => {
    const timer = setTimeout(() => {
      (async () => {
        setLoadingSessions(true)
        try {
          const { rows, totalPages } = await getSessionsPaged(sessionPage, sessionItemsPerPage, {
            runId: filter_run_id || undefined,
            dateFrom: filter_date_from || undefined,
            dateTo: filter_date_to || undefined,
            days: isSelectionFiltering([...filter_day_of_week], DAYS_OF_WEEK.length) ? [...filter_day_of_week] : undefined,
            scoring: isSelectionFiltering([...filter_scoring], SCORING_TYPES.length) ? [...filter_scoring] : undefined,
            name: filter_se_name || undefined,
            clubs: isSelectionFiltering([...filter_se_club], sessClubOptions.length) ? [...filter_se_club] : undefined,
            summaryTypes: isSelectionFiltering([...filter_is_summary], SUMMARY_TYPES.length) ? [...filter_is_summary] : undefined,
            tournamentTypes: isSelectionFiltering([...fTournamentTypes], TOURNAMENT_TYPES.length) ? [...fTournamentTypes] : undefined,
          })
          setSessions(rows)
          setSessionsTotalPages(totalPages)
        } catch (err) { console.error(err) }
        finally { setLoadingSessions(false); setHasLoadedSessionsOnce(true) }
      })()
    }, FILTER_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [filter_run_id, filter_date_from, filter_date_to, filter_day_of_week, filter_scoring, filter_se_name, filter_se_club, sessClubOptions.length,
      filter_is_summary, fTournamentTypes, sessionPage, sessionItemsPerPage])

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
                      <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_NZB}`}>NZ#</th>
                      <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_RANK}`}>Rank</th>
                      <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_GRADE}`}>Grade</th>
                      <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_CLUB}`}>Club</th>
                      <th className={`py-1.5 text-right text-xs text-gray-500 font-medium ${WIDTH_RATING_MIN}`}>Rating</th>
                      <th className={`py-1.5 text-right text-xs text-gray-500 font-medium ${WIDTH_A_POINTS_MIN}`}>A Pts</th>
                      <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-20'>Avg %</th>
                      <th className={`py-1.5 text-right text-xs text-gray-500 font-medium ${WIDTH_SESSIONS_MIN}`}>Sessions</th>
                      <th className={`py-1.5 text-center text-xs text-gray-500 font-medium ${WIDTH_TRACKED}`}>Tracked</th>
                    </tr>
                    <tr className='border-b border-gray-100 bg-gray-50 align-top'>
                      <td className='py-1 pr-1'>
                        <div className='relative'>
                          <FilterName value={filter_pl_name} onChange={setFilter_pl_name}
                            overrideClass={`${WIDTH_NAME} pr-5`} />
                          <MyHelpField text='Type any part of a player name. Case-insensitive.'
                            className='absolute right-1 top-1/2 -translate-y-1/2' />
                        </div>
                      </td>
                      <td className='py-1 pr-1'>
                        <NumberFilterInput value={filter_nzb} onChange={setFilter_nzb} overrideClass={WIDTH_NZB} />
                        <label className='flex items-center gap-1 mt-0.5 cursor-pointer text-xs text-gray-500 whitespace-nowrap'>
                          <input type='checkbox' checked={filter_exclude_nzb0} onChange={e => setFilter_exclude_nzb0(e.target.checked)} />
                          Excl. 0
                        </label>
                      </td>
                      <td className='py-1 pr-1'>
                        <RankSelect selected={filter_rank} onChange={setFilter_rank}
                          onOptionsLoaded={opts => {
                            setRankOptions(opts)
                            const saved = savedRef.current?.filter_rank as string[] | typeof SELECTION_ALL | undefined
                            if (Array.isArray(saved) && saved.length) {
                              const valid = new Set(saved.filter(o => opts.includes(o)))
                              setFilter_rank(valid.size > 0 ? valid : new Set(opts))
                            } else {
                              setFilter_rank(new Set(opts))
                            }
                          }} />
                      </td>
                      <td className='py-1 pr-1'>
                        <GradeSelect selected={filter_grade} onChange={setFilter_grade}
                          onOptionsLoaded={opts => {
                            setGradeOptions(opts)
                            const saved = savedRef.current?.filter_grade as string[] | typeof SELECTION_ALL | undefined
                            if (Array.isArray(saved) && saved.length) {
                              const valid = new Set(saved.filter(o => opts.includes(o)))
                              setFilter_grade(valid.size > 0 ? valid : new Set(opts))
                            } else {
                              setFilter_grade(new Set(opts))
                            }
                          }} />
                      </td>
                      <td className='py-1 pr-1'>
                        <ClubSelect selected={filter_pl_club} onChange={setFilter_pl_club}
                          onOptionsLoaded={opts => {
                            setClubOptions(opts)
                            const saved = savedRef.current?.filter_pl_club as string[] | typeof SELECTION_ALL | undefined
                            if (Array.isArray(saved) && saved.length) {
                              const valid = new Set(saved.filter(o => opts.includes(o)))
                              setFilter_pl_club(valid.size > 0 ? valid : new Set(opts))
                            } else {
                              setFilter_pl_club(new Set(opts))
                            }
                          }} />
                      </td>
                      <td className='py-1 pr-1'>
                        <NumberFilterInput value={filter_rating_min} placeholder='Min' onChange={setFilter_rating_min} overrideClass={WIDTH_RATING_MIN} />
                      </td>
                      <td className='py-1 pr-1'>
                        <NumberFilterInput value={filter_a_points_min} placeholder='Min' onChange={setFilter_a_points_min} overrideClass={WIDTH_A_POINTS_MIN} />
                      </td>
                      <td className='py-1 pr-1' />
                      <td className='py-1 pr-1'>
                        <NumberFilterInput value={filter_sessions_min} placeholder='Min' onChange={setFilter_sessions_min} overrideClass={WIDTH_SESSIONS_MIN} />
                      </td>
                      <td className={`py-1 text-center ${WIDTH_TRACKED}`}>
                        <FilterTracked checked={filter_tracked} onChange={setFilter_tracked} />
                      </td>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map(({ pl_plid, pl_name, pl_nzb, pl_rank, pl_grade, pl_club, pl_rating, pl_a_points, a1_avg_pct, a1_sessions, pl_tracked }) => (
                      <tr key={pl_plid}
                        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${isTracked(pl_tracked) ? 'bg-green-50' : ''}`}
                        onClick={() => {
                          saveBackNav(BACK_KEY)
                          router.push(`/player/${pl_plid}`)
                        }}
                      >
                        <td className='py-1.5 font-medium text-blue-600'>{pl_name}</td>
                        <td className='py-1.5 text-gray-500 text-xs'>{pl_nzb || '—'}</td>
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
                  <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_RUN_ID}`}>ID</th>
                  <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_DATE}`}>Date</th>
                  <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_DAY_OF_WEEK}`}>Day</th>
                  <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_TOURNAMENT_TYPE}`}>Type</th>
                  <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_SCORING}`}>Scoring</th>
                  <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_IS_SUMMARY}`}>Summary</th>
                  <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_CLUB}`}>Club</th>
                  <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_TOURNAMENT_NAME}`}>Tournament Name</th>
                </tr>
                <tr className='border-b border-gray-100 bg-gray-50'>
                  <td className='py-1 pr-2'>
                    <FilterRunId value={filter_run_id} onChange={setFilter_run_id} />
                  </td>
                  <td className='py-1 pr-2'>
                    <div className='flex flex-col gap-0.5'>
                      <FilterDate value={filter_date_from} onChange={setFilter_date_from} />
                      <FilterDate value={filter_date_to} onChange={setFilter_date_to} />
                    </div>
                  </td>
                  <td className='py-1 pr-2'>
                    <StringMultiSelect options={DAYS_OF_WEEK} selected={filter_day_of_week} onChange={setFilter_day_of_week} overrideClass={WIDTH_DAY_OF_WEEK} />
                  </td>
                  <td className='py-1 pr-2'>
                    <StringMultiSelect options={TOURNAMENT_TYPES} selected={fTournamentTypes} onChange={setFTournamentTypes} overrideClass={WIDTH_TOURNAMENT_TYPE} />
                  </td>
                  <td className='py-1 pr-2'>
                    <ScoringTypeMultiSelect selected={filter_scoring} onChange={setFilter_scoring} />
                  </td>
                  <td className='py-1 pr-2'>
                    <SummaryTypeMultiSelect selected={filter_is_summary} onChange={setFilter_is_summary} />
                  </td>
                  <td className='py-1 pr-2'>
                    <ClubSelect selected={filter_se_club} onChange={setFilter_se_club}
                      onOptionsLoaded={opts => {
                        setSessClubOptions(opts)
                        const saved = savedRef.current?.filter_se_club as string[] | typeof SELECTION_ALL | undefined
                        if (Array.isArray(saved) && saved.length) {
                          const valid = new Set(saved.filter(o => opts.includes(o)))
                          setFilter_se_club(valid.size > 0 ? valid : new Set(opts))
                        } else {
                          setFilter_se_club(new Set(opts))
                        }
                      }} />
                  </td>
                  <td className='py-1'>
                    <FilterName value={filter_se_name} onChange={setFilter_se_name}
                      placeholder='Search…' overrideClass={WIDTH_TOURNAMENT_NAME} />
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
