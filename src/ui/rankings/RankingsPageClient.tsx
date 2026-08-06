'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { searchAllPlayers } from '@/src/lib/actions/players'
import { ClubSelect, GradeSelect } from '@/src/ui/shared/LookupSelects'
import { TableEmptyRow } from '@/src/ui/shared/TableEmptyRow'
import { NumberFilterInput } from '@/src/ui/shared/NumberFilterInput'
import { FilterTracked } from '@/src/ui/shared/FilterTracked'
import { ScoringTypeSelect, formatScoringValue, scoringAvgLabel } from '@/src/ui/shared/ScoringTypeSelects'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import { MyTab } from 'nextjs-shared/MyTab'
import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'
import { saveBackNav } from 'nextjs-shared/useBackNav'
import { isSelectionFiltering } from 'nextjs-shared/isSelectionFiltering'
import { myMergeClasses } from 'nextjs-shared/MyMergeClasses'
import {
  BACK_KEY, SCORING_TYPES, ROWS_PER_PAGE, FILTER_DEBOUNCE_MS, WIDTH_SESSIONS_MIN, WIDTH_SCORING, WIDTH_NZB, WIDTH_PAID,
  WIDTH_TOURNAMENT_TYPE, WIDTH_TRACKED,
  MIN_RANKING_SESSIONS_MP, MIN_RANKING_SESSIONS_VP, MIN_RANKING_SESSIONS_XIMP,
  MIN_RANKING_SESSIONS_PARTNER_MP, MIN_RANKING_SESSIONS_PARTNER_VP, MIN_RANKING_SESSIONS_PARTNER_XIMP
} from '@/src/lib/constants'

interface PlayerRow {
  pl_plid: number
  pl_name: string
  pl_nzb: number
  a1_avg: number
  a1_sessions: number
  a1_avg_rank: number | null
  pl_grade: string
  pl_club: string
  pl_tracked: boolean
}

interface PartnershipRow {
  pa_paid: number
  a2_sessions: number
  a2_avg: number
  a2_avg_rank: number | null
  pl_plid1: number
  pl_name1: string
  pl_tracked1: boolean
  pl_nzb1: number
  pl_plid2: number
  pl_name2: string
  pl_tracked2: boolean
  pl_nzb2: number
}

interface PlayerSearchRow {
  pl_plid: number
  pl_name: string
  pl_grade: string
  pl_club: string
}

function isTracked(v: unknown): boolean {
  return v === true || v === 't' || v === 'true' || v === 1
}

// Compact typeahead used inside table header cells — no label, no external container
function HeaderTypeahead({ placeholder, onSelect, onClear }: {
  placeholder: string
  onSelect: (name: string) => void
  onClear: () => void
}) {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<PlayerSearchRow[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState('')

  useEffect(() => {
    const t = value.trim()
    if (t.length < 2) { setSuggestions([]); setOpen(false); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const rows = await searchAllPlayers(t)
        setSuggestions(rows as PlayerSearchRow[])
        setOpen(true)
      } catch { /* ignore */ } finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(timer)
  }, [value])

  function clear() {
    setValue(''); setSelected(''); setOpen(false); onClear()
  }

  return (
    <div className='relative w-full'>
      <MyInput
        type='text'
        value={value}
        onChange={e => { setValue(e.target.value); if (!e.target.value.trim()) clear() }}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        overrideClass='w-full rounded border border-gray-300 px-2 py-0.5 text-xs font-normal h-auto md:h-auto'
        autoComplete='off'
      />
      {searching && <span className='absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400'>…</span>}
      {selected && !searching && (
        <MyButton onClick={clear}
          overrideClass='absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700 bg-transparent hover:bg-transparent h-auto md:h-auto px-0'>
          ×
        </MyButton>
      )}
      {open && suggestions.length > 0 && (
        <ul className='absolute left-0 z-50 mt-0.5 w-64 rounded border border-gray-200 bg-white shadow-lg divide-y divide-gray-100 max-h-60 overflow-auto'>
          {suggestions.map(p => (
            <li key={p.pl_plid}>
              <MyButton
                type='button'
                overrideClass='flex w-full items-center justify-between px-3 py-1.5 hover:bg-gray-50 text-xs text-left bg-white hover:text-current text-gray-900 h-auto md:h-auto rounded-none'
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setValue(p.pl_name); setSelected(p.pl_name); setOpen(false); onSelect(p.pl_name) }}
              >
                <span className='font-medium text-gray-900'>{p.pl_name}</span>
                <span className='text-gray-400'>{[p.pl_grade, p.pl_club].filter(Boolean).join(' · ')}</span>
              </MyButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Group  = 'A' | 'B' | 'C' | 'all'
type TabId = 'players' | 'partnerships'

const TOP_OPTS = [10, 25, 50, 100]

//
//  Session-min dropdown options, per scoring type — MP and VP share the same
//  MIN_RANKING_SESSIONS_* value today so one list serves both; XIMP sessions are far rarer so it
//  gets its own much lower list. Keeps the dropdown's lowest option aligned with the floor
//  statsCompute.ts actually ranks from, so every visible row always has a real rank. Partnerships
//  get their own, much lower set of lists — a partnership only gains a session when the exact
//  same two people play together, so it accumulates sessions far slower than an individual
//  player does (confirmed against local data: ~2-5% of partnerships ever reach the player floor).
//
const SESSIONS_MIN_OPTIONS_STANDARD = [MIN_RANKING_SESSIONS_MP, 50, 100, 200]
const SESSIONS_MIN_OPTIONS_XIMP = [MIN_RANKING_SESSIONS_XIMP, 3, 5]
const PARTNER_SESSIONS_MIN_OPTIONS_STANDARD = [MIN_RANKING_SESSIONS_PARTNER_MP, 10, 20, 50]
const PARTNER_SESSIONS_MIN_OPTIONS_XIMP = [MIN_RANKING_SESSIONS_PARTNER_XIMP, 3, 5]
const SEL_CLS = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'

//----------------------------------------------------------------------------------------------
//  playersSessionsMinOptionsFor / playersDefaultMinFor — scoring-type-specific dropdown options
//  and default for the Players tab, matching statsCompute.ts's per-scoring
//  MIN_RANKING_SESSIONS_* floor
//----------------------------------------------------------------------------------------------
function playersSessionsMinOptionsFor(scoring: string): number[] {
  return scoring === 'XIMP' ? SESSIONS_MIN_OPTIONS_XIMP : SESSIONS_MIN_OPTIONS_STANDARD
}
function playersDefaultMinFor(scoring: string): number {
  if (scoring === 'MP') return MIN_RANKING_SESSIONS_MP
  if (scoring === 'VP') return MIN_RANKING_SESSIONS_VP
  return MIN_RANKING_SESSIONS_XIMP
}

//----------------------------------------------------------------------------------------------
//  partnersSessionsMinOptionsFor / partnersDefaultMinFor — same idea for the Partnerships tab,
//  matching statsCompute.ts's per-scoring MIN_RANKING_SESSIONS_PARTNER_* floor
//----------------------------------------------------------------------------------------------
function partnersSessionsMinOptionsFor(scoring: string): number[] {
  return scoring === 'XIMP' ? PARTNER_SESSIONS_MIN_OPTIONS_XIMP : PARTNER_SESSIONS_MIN_OPTIONS_STANDARD
}
function partnersDefaultMinFor(scoring: string): number {
  if (scoring === 'MP') return MIN_RANKING_SESSIONS_PARTNER_MP
  if (scoring === 'VP') return MIN_RANKING_SESSIONS_PARTNER_VP
  return MIN_RANKING_SESSIONS_PARTNER_XIMP
}

//----------------------------------------------------------------------------------------------
//  SessionsMinSelect — "≥ N sessions" threshold dropdown. Used by both the Players and
//  Partnerships tabs, but each passes its own value/options/onChange — the two tabs rank from
//  very different floors (see MIN_RANKING_SESSIONS_* vs MIN_RANKING_SESSIONS_PARTNER_*), so they
//  no longer share a single underlying state
//----------------------------------------------------------------------------------------------
function SessionsMinSelect({ value, options, onChange }: { value: number; options: number[]; onChange: (v: number) => void }) {
  return (
    <MySelect value={value} onChange={e => onChange(parseInt(e.target.value, 10))}
      overrideClass={myMergeClasses(SEL_CLS, `${WIDTH_SESSIONS_MIN} text-right h-auto md:h-auto`)}>
      {options.map(n => <option key={n} value={n}>≥ {n}</option>)}
    </MySelect>
  )
}

//----------------------------------------------------------------------------------------------
//  TopNSelect — "show only the top N rows" dropdown, shared by the Players and Partnerships
//  tabs. Not a DD-backed filter (no underlying column), just a client-side row cap.
//----------------------------------------------------------------------------------------------
function TopNSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <MySelect value={value} onChange={e => onChange(parseInt(e.target.value, 10))} overrideClass={`${SEL_CLS} h-auto md:h-auto`}>
      <option value={0}>All</option>
      {TOP_OPTS.map(n => <option key={n} value={n}>Top {n}</option>)}
    </MySelect>
  )
}

export default function RankingsPageClient() {
  const restoredRef = useRef(false)
  const [scoring, setScoring] = useState<(typeof SCORING_TYPES)[number]>('MP')
  const [playersMin, setPlayersMin] = useState(playersDefaultMinFor('MP'))
  const [partnersMin, setPartnersMin] = useState(partnersDefaultMinFor('MP'))
  const [group, setGroup] = useState<Group>('all')
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [playersTotalPages, setPlayersTotalPages] = useState(1)
  const [playersGroupTotal, setPlayersGroupTotal] = useState<number | null>(null)
  const [partnerships, setPartnerships] = useState<PartnershipRow[]>([])
  const [partnersTotalPages, setPartnersTotalPages] = useState(1)
  const [partnersGroupTotal, setPartnersGroupTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('players')

  // Player column filters
  const [topN, setTopN] = useState(0)
  const [filter_name, setFilter_name] = useState('')
  const [filter_nzb, setFilter_nzb] = useState('')
  const [filter_grade, setFilter_grade] = useState<Set<string>>(new Set())
  const [filter_club,  setFilter_club]  = useState<Set<string>>(new Set())
  const [gradeOptions, setGradeOptions] = useState<string[]>([])
  const [clubOptions,  setClubOptions]  = useState<string[]>([])
  const [filter_tracked, setFilter_tracked] = useState(false)
  const [playersPage, setPlayersPage] = useState(1)
  const [playersItemsPerPage, setPlayersItemsPerPage] = useState(ROWS_PER_PAGE)

  // Partnership column filters
  const [partnerTopN, setPartnerTopN] = useState(0)
  const [filter_name1, setFilter_name1] = useState('')
  const [filter_name2, setFilter_name2] = useState('')
  const [filter_nzb1, setFilter_nzb1] = useState('')
  const [filter_nzb2, setFilter_nzb2] = useState('')
  const [filter_paid, setFilter_paid] = useState('')
  const [filter_tracked_partners, setFilter_tracked_partners] = useState(false)
  const [partnersPage, setPartnersPage] = useState(1)
  const [partnersItemsPerPage, setPartnersItemsPerPage] = useState(ROWS_PER_PAGE)

  // Sessions-min thresholds are scoring-specific (XIMP is far rarer than MP/VP) — switching
  // scoring resets both tabs' min to that scoring type's own default rather than keeping a
  // value that could exclude every row (e.g. min=30 while viewing XIMP)
  useEffect(() => {
    setPlayersMin(playersDefaultMinFor(scoring))
    setPartnersMin(partnersDefaultMinFor(scoring))
  }, [scoring])

  // Reset to page 1 whenever a filter changes
  useEffect(() => {
    if (restoredRef.current) setPlayersPage(1)
  }, [playersMin, scoring, group, topN, filter_name, filter_nzb, filter_grade, filter_club, gradeOptions.length, clubOptions.length, filter_tracked])

  useEffect(() => {
    if (restoredRef.current) setPartnersPage(1)
  }, [partnersMin, scoring, group, partnerTopN, filter_name1, filter_name2, filter_nzb1, filter_nzb2, filter_paid, filter_tracked_partners])

  useEffect(() => {
    const timer = setTimeout(() => {
      (async () => {
        setLoading(true)
        setError(null)
        try {
          const params = new URLSearchParams({ playersMin: String(playersMin), partnersMin: String(partnersMin), scoring, group })
          if (filter_name) params.set('name', filter_name)
          if (filter_nzb) params.set('nzb', filter_nzb)
          if (isSelectionFiltering([...filter_grade], gradeOptions.length)) params.set('grades', [...filter_grade].join(','))
          if (isSelectionFiltering([...filter_club], clubOptions.length))   params.set('clubs', [...filter_club].join(','))
          if (filter_tracked) params.set('tracked', 'true')
          if (topN > 0) params.set('playersTopN', String(topN))
          params.set('playersPage', String(playersPage))
          params.set('playersItemsPerPage', String(playersItemsPerPage))

          if (filter_name1) params.set('name1', filter_name1)
          if (filter_name2) params.set('name2', filter_name2)
          if (filter_nzb1) params.set('nzb1', filter_nzb1)
          if (filter_nzb2) params.set('nzb2', filter_nzb2)
          if (filter_paid) params.set('paid', filter_paid)
          if (filter_tracked_partners) params.set('partnerTracked', 'true')
          if (partnerTopN > 0) params.set('partnersTopN', String(partnerTopN))
          params.set('partnersPage', String(partnersPage))
          params.set('partnersItemsPerPage', String(partnersItemsPerPage))

          const r = await fetch(`/api/rankings?${params.toString()}`)
          const data = await r.json()
          if (data.error) { setError(data.error); return }
          setPlayers(data.players ?? [])
          setPlayersTotalPages(data.playersTotalPages ?? 1)
          setPlayersGroupTotal(data.playersGroupTotal ?? null)
          setPartnerships(data.partnerships ?? [])
          setPartnersTotalPages(data.partnersTotalPages ?? 1)
          setPartnersGroupTotal(data.partnersGroupTotal ?? null)
        } catch (err) { setError(String(err)) }
        finally { setLoading(false); restoredRef.current = true }
      })()
    }, FILTER_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [playersMin, partnersMin, scoring, group, topN, filter_name, filter_nzb, filter_grade, filter_club, gradeOptions.length, clubOptions.length,
      filter_tracked, playersPage, playersItemsPerPage,
      filter_name1, filter_name2, filter_nzb1, filter_nzb2, filter_paid, filter_tracked_partners, partnerTopN, partnersPage, partnersItemsPerPage])

  // Shared styles
  const thF = 'px-2 pt-2 pb-1 bg-white align-bottom'                     // filter row cell
  const thH = 'px-3 py-2 bg-gray-50 text-xs text-gray-500 uppercase'     // header label cell
  const sel = SEL_CLS

  function GroupToggle() {
    return (
      <div className={`flex justify-center rounded border border-gray-300 overflow-hidden text-xs ${WIDTH_TOURNAMENT_TYPE}`}>
        {(['All', 'A', 'B', 'C'] as const).map(g => {
          const val: Group = g === 'All' ? 'all' : g
          return (
            <button key={g} onClick={() => setGroup(val)}
              className={`px-2 py-0.5 ${group === val ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              {g}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className='space-y-4'>

      {/* Tabs */}
      <div className='flex items-center gap-4 border-b border-gray-200'>
        <div className='flex'>
          {(['players', 'partnerships'] as TabId[]).map(tab => (
            <MyTab key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)}
              underlineActiveClass='px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize border-blue-600 text-blue-600'
              underlineInactiveClass='px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize border-transparent text-gray-500 hover:text-gray-700'>
              {tab === 'players' ? 'Players' : 'Partnerships'}
            </MyTab>
          ))}
        </div>
        {/* Tournament Type applies to both tabs and filters no single displayed column, so it
            lives here rather than in either table's per-column filter row */}
        <div className='flex items-center gap-1.5'>
          <span className='text-xs text-gray-500'>Tournament Type</span>
          <GroupToggle />
          <span className='text-xs text-gray-400'>
            ({(activeTab === 'players' ? playersGroupTotal : partnersGroupTotal) ?? '—'} total)
          </span>
        </div>
        {loading && <span className='text-xs text-gray-400'>Loading…</span>}
      </div>

      {error && <p className='text-sm text-red-600'>{error}</p>}

      {/* Players table */}
      {activeTab === 'players' && (
        <div className='rounded border border-gray-200'>
          <table className='min-w-full text-sm'>
            <thead>
              <tr>
                <th className={`${thF} w-24 text-right`}>
                  <TopNSelect value={topN} onChange={setTopN} />
                </th>
                <th className={`${thF} text-right ${WIDTH_NZB}`}>
                  <NumberFilterInput value={filter_nzb} onChange={setFilter_nzb} placeholder='NZ#' overrideClass={WIDTH_NZB} />
                </th>
                <th className={thF}>
                  <HeaderTypeahead
                    placeholder='Filter by player…'
                    onSelect={name => setFilter_name(name)}
                    onClear={() => setFilter_name('')}
                  />
                </th>
                <th className={`${thF} text-right ${WIDTH_SCORING}`}><ScoringTypeSelect value={scoring} onChange={v => setScoring(v as (typeof SCORING_TYPES)[number])} overrideClass={myMergeClasses(sel, `${WIDTH_SCORING} text-right h-auto md:h-auto`)} /></th>
                <th className={`${thF} text-right ${WIDTH_SESSIONS_MIN}`}><SessionsMinSelect value={playersMin} options={playersSessionsMinOptionsFor(scoring)} onChange={setPlayersMin} /></th>
                <th className={thF}>
                  <GradeSelect selected={filter_grade} onChange={setFilter_grade}
                    onOptionsLoaded={opts => { setGradeOptions(opts); setFilter_grade(new Set(opts)) }} />
                </th>
                <th className={thF}>
                  <ClubSelect selected={filter_club} onChange={setFilter_club}
                    onOptionsLoaded={opts => { setClubOptions(opts); setFilter_club(new Set(opts)) }} />
                </th>
                <th className={`${thF} text-center ${WIDTH_TRACKED}`}>
                  <FilterTracked checked={filter_tracked} onChange={setFilter_tracked} />
                </th>
              </tr>
              <tr>
                <th className={`${thH} text-right`}>#</th>
                <th className={`${thH} text-right ${WIDTH_NZB}`}>NZ#</th>
                <th className={`${thH} text-left`}>Name</th>
                <th className={`${thH} text-right ${WIDTH_SCORING}`}>{scoringAvgLabel(scoring)}</th>
                <th className={`${thH} text-right ${WIDTH_SESSIONS_MIN}`}>Sessions</th>
                <th className={`${thH} text-left`}>Grade</th>
                <th className={`${thH} text-left`}>Club</th>
                <th className={`${thH} text-center`}>Tracked</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100'>
              {players.map(p => {
                return (
                  <tr key={p.pl_plid} className='hover:bg-gray-50'>
                    <td className='px-3 py-1.5 text-right text-gray-400'>{p.a1_avg_rank ?? '—'}</td>
                    <td className='px-3 py-1.5 text-right text-gray-500'>{p.pl_nzb || '—'}</td>
                    <td className='px-3 py-1.5'>
                      <Link href={`/player/${p.pl_plid}`} className='text-blue-600 hover:underline'
                        onClick={() => saveBackNav(BACK_KEY)}>
                        {p.pl_name}
                      </Link>
                    </td>
                    <td className='px-3 py-1.5 text-right font-medium'>
                      {formatScoringValue(scoring, p.a1_avg)}
                    </td>
                    <td className='px-3 py-1.5 text-right text-gray-500'>{p.a1_sessions}</td>
                    <td className='px-3 py-1.5 text-gray-500'>{p.pl_grade}</td>
                    <td className='px-3 py-1.5 text-gray-500'>{p.pl_club}</td>
                    <td className='px-3 py-1.5 text-center'>
                      {isTracked(p.pl_tracked) && <span className='inline-block w-2 h-2 rounded-full bg-green-500' />}
                    </td>
                  </tr>
                )
              })}
              {!loading && players.length === 0 && (
                <TableEmptyRow colSpan={8} message={filter_name ? `No players found for "${filter_name}"` : 'No players found'} />
              )}
            </tbody>
          </table>
          {playersTotalPages > 1 && (
            <div className='p-2'>
              <MyPaginationFooter
                totalPages={playersTotalPages}
                statecurrentPage={playersPage}
                setStateCurrentPage={setPlayersPage}
                rowsPerPage={playersItemsPerPage}
                setRowsPerPage={v => { setPlayersItemsPerPage(v); setPlayersPage(1) }}
              />
            </div>
          )}
        </div>
      )}

      {/* Partnerships table */}
      {activeTab === 'partnerships' && (
        <div className='rounded border border-gray-200'>
          <table className='min-w-full text-sm'>
            <thead>
              <tr>
                <th className={`${thF} w-24 text-right`}>
                  <TopNSelect value={partnerTopN} onChange={setPartnerTopN} />
                </th>
                <th className={`${thF} text-right ${WIDTH_PAID}`}>
                  <NumberFilterInput value={filter_paid} onChange={setFilter_paid} placeholder='ID' overrideClass={WIDTH_PAID} />
                </th>
                <th className={`${thF} text-right ${WIDTH_NZB}`}>
                  <NumberFilterInput value={filter_nzb1} onChange={setFilter_nzb1} placeholder='NZ#' overrideClass={WIDTH_NZB} />
                </th>
                <th className={thF}>
                  <HeaderTypeahead
                    placeholder='Filter player 1…'
                    onSelect={name => setFilter_name1(name)}
                    onClear={() => setFilter_name1('')}
                  />
                </th>
                <th className={`${thF} text-right ${WIDTH_NZB}`}>
                  <NumberFilterInput value={filter_nzb2} onChange={setFilter_nzb2} placeholder='NZ#' overrideClass={WIDTH_NZB} />
                </th>
                <th className={thF}>
                  <HeaderTypeahead
                    placeholder='Filter player 2…'
                    onSelect={name => setFilter_name2(name)}
                    onClear={() => setFilter_name2('')}
                  />
                </th>
                <th className={`${thF} text-right ${WIDTH_SCORING}`}><ScoringTypeSelect value={scoring} onChange={v => setScoring(v as (typeof SCORING_TYPES)[number])} overrideClass={myMergeClasses(sel, `${WIDTH_SCORING} text-right h-auto md:h-auto`)} /></th>
                <th className={`${thF} text-right ${WIDTH_SESSIONS_MIN}`}><SessionsMinSelect value={partnersMin} options={partnersSessionsMinOptionsFor(scoring)} onChange={setPartnersMin} /></th>
                <th className={`${thF} text-center ${WIDTH_TRACKED}`}>
                  <FilterTracked checked={filter_tracked_partners} onChange={setFilter_tracked_partners} />
                </th>
              </tr>
              <tr>
                <th className={`${thH} text-right`}>#</th>
                <th className={`${thH} text-right ${WIDTH_PAID}`}>ID</th>
                <th className={`${thH} text-right ${WIDTH_NZB}`}>NZ#</th>
                <th className={`${thH} text-left`}>Player 1</th>
                <th className={`${thH} text-right ${WIDTH_NZB}`}>NZ#</th>
                <th className={`${thH} text-left`}>Player 2</th>
                <th className={`${thH} text-right ${WIDTH_SCORING}`}>{scoringAvgLabel(scoring)}</th>
                <th className={`${thH} text-right ${WIDTH_SESSIONS_MIN}`}>Sessions</th>
                <th className={`${thH} text-center`}>Tracked</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100'>
              {partnerships.map(p => (
                <tr key={p.pa_paid} className='hover:bg-gray-50'>
                  <td className='px-3 py-1.5 text-right text-gray-400'>{p.a2_avg_rank ?? '—'}</td>
                  <td className='px-3 py-1.5 text-right text-gray-500'>{p.pa_paid}</td>
                  <td className='px-3 py-1.5 text-right text-gray-500'>{p.pl_nzb1 || '—'}</td>
                  <td className='px-3 py-1.5'>
                    <Link href={`/player/${p.pl_plid1}`} className='text-blue-600 hover:underline'
                      onClick={() => saveBackNav(BACK_KEY)}>
                      {p.pl_name1}
                    </Link>
                    {isTracked(p.pl_tracked1) && <span className='inline-block w-2 h-2 rounded-full bg-green-500 ml-1 mb-0.5' />}
                  </td>
                  <td className='px-3 py-1.5 text-right text-gray-500'>{p.pl_nzb2 || '—'}</td>
                  <td className='px-3 py-1.5'>
                    <Link href={`/player/${p.pl_plid2}`} className='text-blue-600 hover:underline'
                      onClick={() => saveBackNav(BACK_KEY)}>
                      {p.pl_name2}
                    </Link>
                    {isTracked(p.pl_tracked2) && <span className='inline-block w-2 h-2 rounded-full bg-green-500 ml-1 mb-0.5' />}
                  </td>
                  <td className='px-3 py-1.5 text-right font-medium'>
                    {formatScoringValue(scoring, p.a2_avg)}
                  </td>
                  <td className='px-3 py-1.5 text-right text-gray-500'>{p.a2_sessions}</td>
                  <td className='px-3 py-1.5 text-center'>
                    {(isTracked(p.pl_tracked1) || isTracked(p.pl_tracked2)) && <span className='inline-block w-2 h-2 rounded-full bg-green-500' />}
                  </td>
                </tr>
              ))}
              {!loading && partnerships.length === 0 && (
                <TableEmptyRow colSpan={9}
                  message={(filter_name1 || filter_name2) ? `No partnerships found for "${filter_name1 || filter_name2}"` : 'No partnerships found'} />
              )}
            </tbody>
          </table>
          {partnersTotalPages > 1 && (
            <div className='p-2'>
              <MyPaginationFooter
                totalPages={partnersTotalPages}
                statecurrentPage={partnersPage}
                setStateCurrentPage={setPartnersPage}
                rowsPerPage={partnersItemsPerPage}
                setRowsPerPage={v => { setPartnersItemsPerPage(v); setPartnersPage(1) }}
              />
            </div>
          )}
        </div>
      )}

    </div>
  )
}
