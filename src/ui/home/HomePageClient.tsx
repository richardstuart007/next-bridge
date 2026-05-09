'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getSessionsByYear } from '@/src/lib/actions/sessions'
import { ClubSelect, GradeSelect, RankSelect, TournamentSelect } from '@/src/ui/shared/LookupSelects'
import Link from 'next/link'
import MyPagination from 'nextjs-shared/MyPagination'

interface PlayerRow {
  pl_plid: number
  pl_nz_bridge_number: number | null
  pl_name: string
  pl_rank: string
  pl_grade: string
  pl_club: string
  pl_rating: number
  pl_a_points: number
  pl_session_count: number
  pl_avg_percentage: number
  pl_all_results: boolean
}

interface SessionRow {
  se_seid: number
  se_date: string
  se_day_of_week: string
  se_source_id: number
  se_scoring: string
  se_name: string
  se_tournament: string
  se_club: string
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const SELECT_CLS = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'
const INPUT_CLS  = 'w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs font-normal'
const NUM_CLS    = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'

function normalizeRank(rank: string): string {
  const lower = (rank ?? '').toLowerCase()
  if (!lower || lower === 'n/a' || lower === 'no rank' || lower === 'unknown') return 'No Rank'
  return rank
}

// ── Number range filter pair (avg% only) ─────────────────────────────────────
function NumRange({
  min, max, onMin, onMax, step
}: {
  min: string; max: string
  onMin: (v: string) => void; onMax: (v: string) => void
  step?: string
}) {
  return (
    <div className='flex flex-col gap-0.5'>
      <input type='number' placeholder='Min' value={min} step={step}
        onChange={e => onMin(e.target.value)} className={NUM_CLS} />
      <input type='number' placeholder='Max' value={max} step={step}
        onChange={e => onMax(e.target.value)} className={NUM_CLS} />
    </div>
  )
}

const SESSION_KEY = 'home_state'

function loadSaved() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') } catch { return null }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HomePageClient() {
  const router = useRouter()
  const restoredRef    = useRef(false)
  const clubsReadyRef  = useRef(false)

  const [activeTab, setActiveTab] = useState<'players' | 'sessions'>('players')

  // ── Option counts for filter comparisons (populated via onOptionsLoaded callbacks) ──
  const [tournamentOptions, setTournamentOptions] = useState<string[]>([])
  const [sessClubOptions,   setSessClubOptions]   = useState<string[]>([])

  // ── Players ──
  const [allPlayers, setAllPlayers] = useState<PlayerRow[]>([])
  const [playerPage, setPlayerPage] = useState(1)
  const [playerItemsPerPage, setPlayerItemsPerPage] = useState(15)

  // Player filters
  const [fName,      setFName]      = useState('')
  const [fNz,        setFNz]        = useState('')
  const [fRanks,     setFRanks]     = useState<Set<string>>(new Set())
  const [fGrades,    setFGrades]    = useState<Set<string>>(new Set())
  const [fClubs,     setFClubs]     = useState<Set<string>>(new Set())
  const [fRatingMin, setFRatingMin] = useState('')
  const [fAMin,      setFAMin]      = useState('')
  const [fAvgMin,    setFAvgMin]    = useState('')
  const [fAvgMax,    setFAvgMax]    = useState('')
  const [fSessMin,   setFSessMin]   = useState('')
  const [fTracked,   setFTracked]   = useState(false)
  const [fExcludeNz0, setFExcludeNz0] = useState(true)

  // ── Sessions ──
  const [allSessions,         setAllSessions]         = useState<SessionRow[]>([])
  const [dateFrom,            setDateFrom]            = useState('')
  const [dateTo,              setDateTo]              = useState('')
  const [dayFilter,           setDayFilter]           = useState('')
  const [scoringFilter,       setScoringFilter]       = useState('')
  const [sessNameFilter,      setSessNameFilter]      = useState('')
  const [fTournaments,        setFTournaments]        = useState<Set<string>>(new Set())
  const [fSessClubs,          setFSessClubs]          = useState<Set<string>>(new Set())
  const [sessionPage,         setSessionPage]         = useState(1)
  const [sessionItemsPerPage, setSessionItemsPerPage] = useState(10)
  const [loadingSessions,     setLoadingSessions]     = useState(false)

  // ── Restore from sessionStorage on mount ──
  useEffect(() => {
    const s = loadSaved()
    if (s) {
      if (s.activeTab)          setActiveTab(s.activeTab)
      if (s.fName)              setFName(s.fName)
      if (s.fNz)                setFNz(s.fNz)
      if (s.fRanks?.length)     setFRanks(new Set(s.fRanks))
      if (s.fGrades?.length)    setFGrades(new Set(s.fGrades))
      if (Array.isArray(s.fClubs)) {
        setFClubs(new Set(s.fClubs))
        clubsReadyRef.current = true
      }
      if (s.fRatingMin)         setFRatingMin(s.fRatingMin)
      if (s.fAMin)              setFAMin(s.fAMin)
      if (s.fAvgMin)            setFAvgMin(s.fAvgMin)
      if (s.fAvgMax)            setFAvgMax(s.fAvgMax)
      if (s.fSessMin)                    setFSessMin(s.fSessMin)
      if (s.fTracked)                    setFTracked(s.fTracked)
      if (s.fExcludeNz0 !== undefined)   setFExcludeNz0(s.fExcludeNz0)
      if (s.playerPage)                  setPlayerPage(s.playerPage)
      if (s.playerItemsPerPage)          setPlayerItemsPerPage(s.playerItemsPerPage)
    }
    restoredRef.current = true
  }, [])

  // ── Save to sessionStorage whenever state changes (after restore) ──
  useEffect(() => {
    if (!restoredRef.current) return
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        activeTab, fName, fNz, fTracked, fExcludeNz0,
        fRanks: [...fRanks], fGrades: [...fGrades], fClubs: [...fClubs],
        fRatingMin, fAMin, fAvgMin, fAvgMax, fSessMin,
        playerPage, playerItemsPerPage,
      }))
    } catch {}
  }, [activeTab, fName, fNz, fTracked, fExcludeNz0, fRanks, fGrades, fClubs,
      fRatingMin, fAMin, fAvgMin, fAvgMax, fSessMin,
      playerPage, playerItemsPerPage])

  useEffect(() => {
    fetch('/api/admin/players')
      .then(r => r.json())
      .then(rows => setAllPlayers(rows as PlayerRow[]))
      .catch(console.error)
  }, [])

  useEffect(() => {
    setLoadingSessions(true)
    getSessionsByYear(null)
      .then(rows => {
        setAllSessions(rows as SessionRow[])
      })
      .catch(console.error)
      .finally(() => setLoadingSessions(false))
  }, [])

  const num = (v: string) => v === '' ? null : parseFloat(v)

  const isTracked = (p: PlayerRow) => p.pl_all_results === true || (p.pl_all_results as unknown) === 't' || (p.pl_all_results as unknown) === 'true' || (p.pl_all_results as unknown) === 1

  const filteredPlayers = useMemo(() => {
    let rows = allPlayers
    if (fTracked)        rows = rows.filter(p => isTracked(p))
    if (fExcludeNz0)     rows = rows.filter(p => (p.pl_nz_bridge_number ?? 0) > 0)
    if (fName)           rows = rows.filter(p => p.pl_name.toLowerCase().includes(fName.toLowerCase()))
    if (fNz)             rows = rows.filter(p => String(p.pl_nz_bridge_number ?? '').includes(fNz))
    if (fRanks.size > 0) rows = rows.filter(p => fRanks.has(normalizeRank(p.pl_rank)))
    if (fGrades.size > 0) rows = rows.filter(p => fGrades.has(p.pl_grade))
    if (fClubs.size > 0)  rows = rows.filter(p => fClubs.has(p.pl_club))
    const rMin = num(fRatingMin)
    if (rMin !== null)   rows = rows.filter(p => parseFloat(String(p.pl_rating)) >= rMin)
    const aMin = num(fAMin)
    if (aMin !== null)   rows = rows.filter(p => parseFloat(String(p.pl_a_points)) >= aMin)
    const avMin = num(fAvgMin), avMax = num(fAvgMax)
    if (avMin !== null)  rows = rows.filter(p => parseFloat(String(p.pl_avg_percentage)) >= avMin)
    if (avMax !== null)  rows = rows.filter(p => parseFloat(String(p.pl_avg_percentage)) <= avMax)
    const sMin = num(fSessMin)
    if (sMin !== null)   rows = rows.filter(p => p.pl_session_count >= sMin)
    return rows
  }, [allPlayers, fTracked, fExcludeNz0, fName, fNz, fRanks, fGrades, fClubs, fRatingMin, fAMin, fAvgMin, fAvgMax, fSessMin])

  const hasPlayerFilter = fTracked || fName || fNz || fRanks.size || fGrades.size || fClubs.size ||
    fRatingMin || fAMin || fAvgMin || fAvgMax || fSessMin

  function clearPlayerFilters() {
    setFTracked(false); setFExcludeNz0(true)
    setFName(''); setFNz(''); setFRanks(new Set()); setFGrades(new Set()); setFClubs(new Set())
    setFRatingMin(''); setFAMin(''); setFAvgMin(''); setFAvgMax(''); setFSessMin('')
  }

  useEffect(() => {
    if (restoredRef.current) setPlayerPage(1)
  }, [fTracked, fExcludeNz0, fName, fNz, fRanks, fGrades, fClubs, fRatingMin, fAMin, fAvgMin, fAvgMax, fSessMin])

  const sessions = useMemo(() => {
    let rows = allSessions
    if (dateFrom)      rows = rows.filter(s => s.se_date.slice(0, 10) >= dateFrom)
    if (dateTo)        rows = rows.filter(s => s.se_date.slice(0, 10) <= dateTo)
    if (dayFilter)     rows = rows.filter(s => s.se_day_of_week === dayFilter)
    if (scoringFilter) rows = rows.filter(s => s.se_scoring === scoringFilter)
    if (sessNameFilter) rows = rows.filter(s => s.se_name.toLowerCase().includes(sessNameFilter.toLowerCase()))
    if (fTournaments.size < tournamentOptions.length) rows = rows.filter(s => fTournaments.has(s.se_tournament ?? ''))
    if (fSessClubs.size < sessClubOptions.length) rows = rows.filter(s => fSessClubs.has(s.se_club ?? ''))
    return rows
  }, [allSessions, dateFrom, dateTo, dayFilter, scoringFilter, sessNameFilter, fTournaments, tournamentOptions.length, fSessClubs, sessClubOptions.length])

  useEffect(() => { setSessionPage(1) }, [dateFrom, dateTo, dayFilter, scoringFilter, sessNameFilter, fTournaments, fSessClubs])

  return (
    <div className='space-y-4'>
      <h1 className='text-2xl font-bold text-gray-900'>Bridge Results Tracker</h1>

      {/* Tabs */}
      <div className='flex gap-1 border-b border-gray-200'>
        <button onClick={() => setActiveTab('players')}
          className={`px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 ${activeTab === 'players' ? 'bg-white border-gray-200 text-gray-900' : 'bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'}`}
        >Players</button>
        <button onClick={() => setActiveTab('sessions')}
          className={`px-4 py-1.5 text-sm font-medium rounded-t border border-b-0 ${activeTab === 'sessions' ? 'bg-white border-gray-200 text-gray-900' : 'bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'}`}
        >Sessions</button>
      </div>

      {/* ── Players tab ───────────────────────────────────────────────────── */}
      <section className={`rounded border border-gray-200 p-4${activeTab !== 'players' ? ' hidden' : ''}`}>
          <div className='flex items-center justify-between mb-3'>
            <h2 className='text-base font-semibold text-gray-800'>
              Players
              <span className='ml-2 text-xs font-normal text-gray-400'>{filteredPlayers.length} of {allPlayers.length}</span>
            </h2>
            {hasPlayerFilter && (
              <button onClick={clearPlayerFilters} className='text-xs text-blue-600 hover:underline'>Clear filters</button>
            )}
          </div>

          {allPlayers.length === 0 ? (
            <p className='text-sm text-gray-400'>Loading…</p>
          ) : (
            <>
              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead>
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
                        <input type='text' value={fName} onChange={e => setFName(e.target.value)}
                          placeholder='Filter…' className={INPUT_CLS} />
                      </td>
                      <td className='py-1 pr-1'>
                        <input type='text' value={fNz} onChange={e => setFNz(e.target.value)}
                          placeholder='Filter…' className={INPUT_CLS} />
                        <label className='flex items-center gap-1 mt-0.5 cursor-pointer text-xs text-gray-500 whitespace-nowrap'>
                          <input type='checkbox' checked={fExcludeNz0} onChange={e => setFExcludeNz0(e.target.checked)} />
                          Excl. 0
                        </label>
                      </td>
                      <td className='py-1 pr-1'>
                        <RankSelect mode='any' selected={fRanks} onChange={setFRanks} placeholder='All' />
                      </td>
                      <td className='py-1 pr-1'>
                        <GradeSelect mode='any' selected={fGrades} onChange={setFGrades} placeholder='All' />
                      </td>
                      <td className='py-1 pr-1'>
                        <ClubSelect mode='any' selected={fClubs} onChange={setFClubs} placeholder='All'
                          onOptionsLoaded={opts => {
                            if (!clubsReadyRef.current) {
                              setFClubs(new Set(opts.filter(c => c !== 'Archive')))
                              clubsReadyRef.current = true
                            }
                          }} />
                      </td>
                      <td className='py-1 pr-1'>
                        <input type='number' placeholder='Min' value={fRatingMin} step='0.01'
                          onChange={e => setFRatingMin(e.target.value)} className={NUM_CLS} />
                      </td>
                      <td className='py-1 pr-1'>
                        <input type='number' placeholder='Min' value={fAMin} step='0.01'
                          onChange={e => setFAMin(e.target.value)} className={NUM_CLS} />
                      </td>
                      <td className='py-1 pr-1'>
                        <NumRange min={fAvgMin} max={fAvgMax} onMin={setFAvgMin} onMax={setFAvgMax} step='0.01' />
                      </td>
                      <td className='py-1 pr-1'>
                        <input type='number' placeholder='Min' value={fSessMin}
                          onChange={e => setFSessMin(e.target.value)} className={NUM_CLS} />
                      </td>
                      <td className='py-1 text-center'>
                        <label className='flex items-center justify-center cursor-pointer' title='Tracked only'>
                          <input type='checkbox' checked={fTracked} onChange={e => setFTracked(e.target.checked)} />
                        </label>
                      </td>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.slice((playerPage - 1) * playerItemsPerPage, playerPage * playerItemsPerPage).map(p => (
                      <tr key={p.pl_plid}
                        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${isTracked(p) ? 'bg-green-50' : ''}`}
                        onClick={() => router.push(`/player/${p.pl_plid}`)}
                      >
                        <td className='py-1.5 font-medium text-blue-600'>{p.pl_name}</td>
                        <td className='py-1.5 text-gray-500 text-xs'>{p.pl_nz_bridge_number || '—'}</td>
                        <td className='py-1.5 text-gray-600'>{p.pl_rank || '—'}</td>
                        <td className='py-1.5 text-gray-600'>{p.pl_grade || '—'}</td>
                        <td className='py-1.5 text-gray-500'>{p.pl_club || '—'}</td>
                        <td className='py-1.5 text-right text-gray-700 font-mono text-xs'>{p.pl_rating > 0 ? parseFloat(String(p.pl_rating)).toFixed(2) : '—'}</td>
                        <td className='py-1.5 text-right text-gray-700 font-mono text-xs'>{p.pl_a_points > 0 ? parseFloat(String(p.pl_a_points)).toFixed(2) : '—'}</td>
                        <td className='py-1.5 text-right font-medium'>{p.pl_avg_percentage > 0 ? parseFloat(String(p.pl_avg_percentage)).toFixed(2) + '%' : '—'}</td>
                        <td className='py-1.5 text-right text-gray-600'>{p.pl_session_count > 0 ? p.pl_session_count : '—'}</td>
                        <td className='py-1.5 text-center'>
                          {isTracked(p) && <span className='inline-block w-2 h-2 rounded-full bg-green-500' />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredPlayers.length > playerItemsPerPage && (
                <div className='mt-3 flex items-center gap-3'>
                  <select
                    value={playerItemsPerPage}
                    onChange={e => { setPlayerItemsPerPage(parseInt(e.target.value, 10)); setPlayerPage(1) }}
                    className='rounded border border-gray-300 px-1.5 py-0.5 text-xs'
                  >
                    {[15, 20, 50, 100].map(n => <option key={n} value={n}>{n} rows</option>)}
                  </select>
                  <span className='text-xs text-gray-400'>
                    p.{playerPage}/{Math.ceil(filteredPlayers.length / playerItemsPerPage)}
                  </span>
                  <MyPagination
                    totalPages={Math.ceil(filteredPlayers.length / playerItemsPerPage)}
                    statecurrentPage={playerPage}
                    setStateCurrentPage={setPlayerPage}
                  />
                </div>
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
                {loadingSessions ? 'Loading…' : `${sessions.length} shown`}
              </span>
            </h2>
            <Link href='/admin' className='text-xs text-blue-600 hover:underline'>Admin →</Link>
          </div>

          {allSessions.length === 0 && !loadingSessions ? (
            <p className='text-sm text-gray-400'>No sessions found. <Link href='/admin' className='text-blue-600 hover:underline'>Import one now.</Link></p>
          ) : (
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-gray-200'>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-20'>ID</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-36'>Date</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-28'>Day</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-16'>Type</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-16'>Scoring</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium whitespace-nowrap'>Club</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium'>Tournament Name</th>
                </tr>
                <tr className='border-b border-gray-100 bg-gray-50'>
                  <td className='py-1 pr-2' />
                  <td className='py-1 pr-2'>
                    <div className='flex flex-col gap-0.5'>
                      <input type='date' value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={INPUT_CLS} />
                      <input type='date' value={dateTo}   onChange={e => setDateTo(e.target.value)}   className={INPUT_CLS} />
                    </div>
                  </td>
                  <td className='py-1 pr-2'>
                    <select value={dayFilter} onChange={e => setDayFilter(e.target.value)} className={SELECT_CLS}>
                      <option value=''>All</option>
                      {DAYS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </td>
                  <td className='py-1 pr-2'>
                    <TournamentSelect mode='all' selected={fTournaments} onChange={setFTournaments}
                      onOptionsLoaded={opts => { setTournamentOptions(opts); setFTournaments(new Set(opts)) }} />
                  </td>
                  <td className='py-1 pr-2'>
                    <select value={scoringFilter} onChange={e => setScoringFilter(e.target.value)} className={SELECT_CLS}>
                      <option value=''>All</option>
                      <option value='MP'>MP</option>
                      <option value='VP'>VP</option>
                    </select>
                  </td>
                  <td className='py-1 pr-2'>
                    <ClubSelect mode='all' selected={fSessClubs} onChange={setFSessClubs}
                      onOptionsLoaded={opts => { setSessClubOptions(opts); setFSessClubs(new Set(opts)) }} />
                  </td>
                  <td className='py-1'>
                    <input type='text' value={sessNameFilter} onChange={e => setSessNameFilter(e.target.value)}
                      placeholder='Search…' className={INPUT_CLS} />
                  </td>
                </tr>
              </thead>
              <tbody>
                {sessions.slice((sessionPage - 1) * sessionItemsPerPage, sessionPage * sessionItemsPerPage).map(s => (
                  <tr key={s.se_seid}
                    className='border-b border-gray-100 hover:bg-gray-50 cursor-pointer'
                    onClick={() => router.push(`/session/${s.se_seid}`)}
                  >
                    <td className='py-1.5 font-mono text-xs text-gray-400'>
                      <a href={`https://www.nzbridge.co.nz/results.html?run_id=${s.se_source_id}`}
                         target='_blank' rel='noopener noreferrer'
                         className='text-blue-600 hover:underline'
                         onClick={e => e.stopPropagation()}>
                        {s.se_source_id}
                      </a>
                    </td>
                    <td className='py-1.5'>{new Date(s.se_date).toISOString().slice(0, 10)}</td>
                    <td className='py-1.5'>{s.se_day_of_week}</td>
                    <td className='py-1.5 text-gray-500'>{s.se_tournament || '—'}</td>
                    <td className='py-1.5 text-gray-500'>{s.se_scoring}</td>
                    <td className='py-1.5 text-gray-500 whitespace-nowrap'>{s.se_club || '—'}</td>
                    <td className='py-1.5 text-gray-600'>{s.se_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sessions.length > sessionItemsPerPage && (
            <div className='mt-3 flex items-center gap-3'>
              <select
                value={sessionItemsPerPage}
                onChange={e => { setSessionItemsPerPage(parseInt(e.target.value, 10)); setSessionPage(1) }}
                className='rounded border border-gray-300 px-1.5 py-0.5 text-xs'
              >
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} rows</option>)}
              </select>
              <span className='text-xs text-gray-400'>
                p.{sessionPage}/{Math.ceil(sessions.length / sessionItemsPerPage)}
              </span>
              <MyPagination
                totalPages={Math.ceil(sessions.length / sessionItemsPerPage)}
                statecurrentPage={sessionPage}
                setStateCurrentPage={setSessionPage}
              />
            </div>
          )}
      </section>
    </div>
  )
}
