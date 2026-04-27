'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getAllPlayers } from '@/src/lib/actions/players'
import { getSessionsByYear } from '@/src/lib/actions/sessions'
import { getAllRanks, getAllClubs, getAllGrades } from '@/src/lib/actions/lookup'
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
}

interface SessionRow {
  se_seid: number
  se_date: string
  se_day_of_week: string
  se_date_seq: number
  se_session_type: string
  se_source_id: number
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const YEARS = [2026, 2025, 2024]
const SELECT_CLS = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'
const INPUT_CLS  = 'w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs font-normal'
const NUM_CLS    = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'

function normalizeRank(rank: string): string {
  const lower = (rank ?? '').toLowerCase()
  if (!lower || lower === 'n/a' || lower === 'no rank' || lower === 'unknown') return 'No Rank'
  return rank
}

// ── Multi-select checkbox dropdown ────────────────────────────────────────────
function MultiSelect({
  options, selected, onChange, placeholder
}: {
  options: string[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
  placeholder: string
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

  const label = selected.size === 0 ? placeholder : `${selected.size} selected`

  return (
    <div ref={ref} className='relative'>
      <button
        type='button'
        onClick={() => setOpen(v => !v)}
        className='w-full text-left rounded border border-gray-300 px-1.5 py-0.5 text-xs bg-white truncate'
      >{label}</button>
      {open && (
        <div className='absolute left-0 top-full z-20 bg-white border border-gray-200 rounded shadow-lg min-w-max max-h-56 overflow-y-auto'>
          {options.length === 0
            ? <div className='px-3 py-2 text-xs text-gray-400'>No values</div>
            : options.map(opt => (
              <label key={opt} className='flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs whitespace-nowrap'>
                <input
                  type='checkbox'
                  checked={selected.has(opt)}
                  onChange={e => {
                    const next = new Set(selected)
                    if (e.target.checked) next.add(opt)
                    else next.delete(opt)
                    onChange(next)
                  }}
                />
                {opt || '(blank)'}
              </label>
            ))
          }
        </div>
      )}
    </div>
  )
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

  // ── Lookup data ──
  const [rankOptions,  setRankOptions]  = useState<string[]>([])
  const [clubOptions,  setClubOptions]  = useState<string[]>([])
  const [gradeOptions, setGradeOptions] = useState<string[]>([])

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

  // ── Sessions ──
  const [allSessions,         setAllSessions]         = useState<SessionRow[]>([])
  const [sessionYear,         setSessionYear]         = useState<string>('2026')
  const [dayFilter,           setDayFilter]           = useState('')
  const [dateSeqFilter,       setDateSeqFilter]       = useState('')
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
      if (s.fSessMin)           setFSessMin(s.fSessMin)
      if (s.playerPage)         setPlayerPage(s.playerPage)
      if (s.playerItemsPerPage) setPlayerItemsPerPage(s.playerItemsPerPage)
      if (s.sessionYear)        setSessionYear(s.sessionYear)
    }
    restoredRef.current = true
  }, [])

  // ── Save to sessionStorage whenever state changes (after restore) ──
  useEffect(() => {
    if (!restoredRef.current) return
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        activeTab, fName, fNz,
        fRanks: [...fRanks], fGrades: [...fGrades], fClubs: [...fClubs],
        fRatingMin, fAMin, fAvgMin, fAvgMax, fSessMin,
        playerPage, playerItemsPerPage, sessionYear,
      }))
    } catch {}
  }, [activeTab, fName, fNz, fRanks, fGrades, fClubs,
      fRatingMin, fAMin, fAvgMin, fAvgMax, fSessMin,
      playerPage, playerItemsPerPage, sessionYear])

  useEffect(() => {
    getAllPlayers().then(rows => setAllPlayers(rows as PlayerRow[])).catch(console.error)
    getAllRanks().then(rows  => setRankOptions((rows as {rk_rank: string}[]).map(r => r.rk_rank))).catch(console.error)
    getAllClubs().then(rows  => {
      const options = (rows as {cl_club: string}[]).map(r => r.cl_club)
      setClubOptions(options)
      if (!clubsReadyRef.current) {
        setFClubs(new Set(options.filter(c => c !== 'Archive')))
        clubsReadyRef.current = true
      }
    }).catch(console.error)
    getAllGrades().then(rows => setGradeOptions((rows as {gr_grade: string}[]).map(r => r.gr_grade))).catch(console.error)
  }, [])

  useEffect(() => {
    setLoadingSessions(true)
    setSessionPage(1)
    getSessionsByYear(sessionYear ? parseInt(sessionYear, 10) : null)
      .then(rows => setAllSessions(rows as SessionRow[]))
      .catch(console.error)
      .finally(() => setLoadingSessions(false))
  }, [sessionYear])

  const num = (v: string) => v === '' ? null : parseFloat(v)

  const filteredPlayers = useMemo(() => {
    let rows = allPlayers
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
  }, [allPlayers, fName, fNz, fRanks, fGrades, fClubs, fRatingMin, fAMin, fAvgMin, fAvgMax, fSessMin])

  const hasPlayerFilter = fName || fNz || fRanks.size || fGrades.size || fClubs.size ||
    fRatingMin || fAMin || fAvgMin || fAvgMax || fSessMin

  function clearPlayerFilters() {
    setFName(''); setFNz(''); setFRanks(new Set()); setFGrades(new Set()); setFClubs(new Set())
    setFRatingMin(''); setFAMin(''); setFAvgMin(''); setFAvgMax(''); setFSessMin('')
  }

  useEffect(() => {
    if (restoredRef.current) setPlayerPage(1)
  }, [fName, fNz, fRanks, fGrades, fClubs, fRatingMin, fAMin, fAvgMin, fAvgMax, fSessMin])

  const sessions = useMemo(() => {
    let rows = allSessions
    if (dayFilter)     rows = rows.filter(s => s.se_day_of_week === dayFilter)
    if (dateSeqFilter) rows = rows.filter(s => String(s.se_date_seq || '') === dateSeqFilter)
    return rows
  }, [allSessions, dayFilter, dateSeqFilter])

  useEffect(() => { setSessionPage(1) }, [dayFilter, dateSeqFilter])

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
                    </tr>
                    <tr className='border-b border-gray-100 bg-gray-50 align-top'>
                      <td className='py-1 pr-1'>
                        <input type='text' value={fName} onChange={e => setFName(e.target.value)}
                          placeholder='Filter…' className={INPUT_CLS} />
                      </td>
                      <td className='py-1 pr-1'>
                        <input type='text' value={fNz} onChange={e => setFNz(e.target.value)}
                          placeholder='Filter…' className={INPUT_CLS} />
                      </td>
                      <td className='py-1 pr-1'>
                        <MultiSelect options={rankOptions} selected={fRanks} onChange={setFRanks} placeholder='All' />
                      </td>
                      <td className='py-1 pr-1'>
                        <MultiSelect options={gradeOptions} selected={fGrades} onChange={setFGrades} placeholder='All' />
                      </td>
                      <td className='py-1 pr-1'>
                        <MultiSelect options={clubOptions} selected={fClubs} onChange={setFClubs} placeholder='All' />
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
                      <td className='py-1'>
                        <input type='number' placeholder='Min' value={fSessMin}
                          onChange={e => setFSessMin(e.target.value)} className={NUM_CLS} />
                      </td>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.slice((playerPage - 1) * playerItemsPerPage, playerPage * playerItemsPerPage).map(p => (
                      <tr key={p.pl_plid}
                        className='border-b border-gray-100 hover:bg-gray-50 cursor-pointer'
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
            <p className='text-sm text-gray-400'>No sessions for this year. <Link href='/admin' className='text-blue-600 hover:underline'>Import one now.</Link></p>
          ) : (
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-gray-200'>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-20'>ID</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-36'>Date</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-28'>Day</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-16'>Seq</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium'>Type</th>
                </tr>
                <tr className='border-b border-gray-100 bg-gray-50'>
                  <td className='py-1 pr-2' />
                  <td className='py-1 pr-2'>
                    <select value={sessionYear} onChange={e => setSessionYear(e.target.value)} className={SELECT_CLS}>
                      <option value=''>All years</option>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </td>
                  <td className='py-1 pr-2'>
                    <select value={dayFilter} onChange={e => setDayFilter(e.target.value)} className={SELECT_CLS}>
                      <option value=''>All</option>
                      {DAYS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </td>
                  <td className='py-1 pr-2'>
                    <select value={dateSeqFilter} onChange={e => setDateSeqFilter(e.target.value)} className={SELECT_CLS}>
                      <option value=''>All</option>
                      <option value='1'>1</option>
                      <option value='2'>2</option>
                      <option value='3'>3</option>
                    </select>
                  </td>
                  <td className='py-1'>
                    {(dayFilter || dateSeqFilter) && (
                      <button onClick={() => { setDayFilter(''); setDateSeqFilter('') }}
                        className='text-xs text-blue-600 hover:underline'>Clear</button>
                    )}
                  </td>
                </tr>
              </thead>
              <tbody>
                {sessions.slice((sessionPage - 1) * sessionItemsPerPage, sessionPage * sessionItemsPerPage).map(s => (
                  <tr key={s.se_seid}
                    className='border-b border-gray-100 hover:bg-gray-50 cursor-pointer'
                    onClick={() => router.push(`/session/${s.se_seid}`)}
                  >
                    <td className='py-1.5 font-mono text-xs text-gray-400 select-all'>{s.se_source_id}</td>
                    <td className='py-1.5'>{new Date(s.se_date).toISOString().slice(0, 10)}</td>
                    <td className='py-1.5'>{s.se_day_of_week}</td>
                    <td className='py-1.5 text-gray-500'>{s.se_date_seq || '—'}</td>
                    <td className='py-1.5 capitalize'>{s.se_session_type}</td>
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
