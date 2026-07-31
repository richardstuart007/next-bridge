'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { searchAllPlayers } from '@/src/lib/actions/players'
import { ClubSelect, GradeSelect } from '@/src/ui/shared/LookupSelects'
import { ScoringTypeToggle, formatScoringValue, scoringAvgLabel } from '@/src/ui/shared/ScoringTypeSelects'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import { MyTab } from 'nextjs-shared/MyTab'
import { saveBackNav } from 'nextjs-shared/useBackNav'
import { BACK_KEY, SCORING_TYPES } from '@/src/lib/constants'

interface PlayerRow {
  id: number
  name: string
  avg_pct: number
  sessions: number
  grade: string
  club: string
  tracked: boolean
}

interface PartnershipRow {
  id: number
  sessions: number
  avg_pct: number
  player1_id: number
  player1_name: string
  player1_tracked: boolean
  player2_id: number
  player2_name: string
  player2_tracked: boolean
}

interface PlayerSearchRow {
  pl_plid: number
  pl_name: string
  pl_grade: string
  pl_club: string
}

function matchesSearch(text: string, search: string): boolean {
  return text.toLowerCase().includes(search.toLowerCase())
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

export default function RankingsPageClient() {
  const [min, setMin] = useState(10)
  const [scoring, setScoring] = useState<(typeof SCORING_TYPES)[number]>('MP')
  const [group, setGroup] = useState<Group>('all')
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [partnerships, setPartnerships] = useState<PartnershipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('players')

  // Player column filters
  const [topN, setTopN] = useState(0)
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState<Set<string>>(new Set())
  const [clubFilter,  setClubFilter]  = useState<Set<string>>(new Set())
  const [trackedOnly, setTrackedOnly] = useState(false)

  // Partnership column filters
  const [partnerTopN, setPartnerTopN] = useState(0)
  const [partnerFilter, setPartnerFilter] = useState('')
  const [partnerTrackedOnly, setPartnerTrackedOnly] = useState(false)

  useEffect(() => {
    (async () => {
      setLoading(true)
      setError(null)
      try {
        const r = await fetch(`/api/rankings?min=${min}&scoring=${scoring}&group=${group}`)
        const data = await r.json()
        if (data.error) { setError(data.error); return }
        setPlayers(data.players ?? [])
        setPartnerships(data.partnerships ?? [])
      } catch (err) { setError(String(err)) }
      finally { setLoading(false) }
    })()
  }, [min, scoring, group])

  // Scroll to first highlighted player after render
  useEffect(() => {
    if (!search) return
    const el = document.querySelector('[data-highlight="true"]') as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [search, players])

  const filteredPlayers = useMemo(() => {
    let r = players.map((p, i) => ({ rank: i + 1, row: p }))
    if (topN > 0)            r = r.slice(0, topN)
    if (clubFilter.size > 0) r = r.filter(({ row }) => clubFilter.has(row.club))
    if (gradeFilter.size > 0)r = r.filter(({ row }) => gradeFilter.has(row.grade))
    if (trackedOnly)         r = r.filter(({ row }) => isTracked(row.tracked))
    return r
  }, [players, topN, clubFilter, gradeFilter, trackedOnly])

  const filteredPartnerships = useMemo(() => {
    let r = partnerships.map((p, i) => ({ rank: i + 1, row: p }))
    if (partnerTopN > 0)       r = r.slice(0, partnerTopN)
    if (partnerFilter)         r = r.filter(({ row }) =>
      matchesSearch(row.player1_name, partnerFilter) || matchesSearch(row.player2_name, partnerFilter)
    )
    if (partnerTrackedOnly)    r = r.filter(({ row }) =>
      isTracked(row.player1_tracked) || isTracked(row.player2_tracked)
    )
    return r
  }, [partnerships, partnerTopN, partnerFilter, partnerTrackedOnly])

  const trimmed = search.trim()

  // Shared styles
  const thF = 'px-2 pt-2 pb-1 bg-white align-bottom'                     // filter row cell
  const thH = 'px-3 py-2 bg-gray-50 text-xs text-gray-500 uppercase'     // header label cell
  const sel = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'

  function GroupToggle() {
    return (
      <div className='flex justify-center rounded border border-gray-300 overflow-hidden text-xs'>
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

  function SessionsSelect() {
    return (
      <MySelect value={min} onChange={e => setMin(parseInt(e.target.value, 10))} overrideClass={`${sel} h-auto md:h-auto`}>
        {[5, 10, 20, 50].map(n => <option key={n} value={n}>≥ {n}</option>)}
      </MySelect>
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
              {tab === 'players' ? `Players (${players.length})` : `Partnerships (${partnerships.length})`}
            </MyTab>
          ))}
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
                  <MySelect value={topN} onChange={e => setTopN(parseInt(e.target.value, 10))} overrideClass={`${sel} h-auto md:h-auto`}>
                    <option value={0}>All</option>
                    {TOP_OPTS.map(n => <option key={n} value={n}>Top {n}</option>)}
                  </MySelect>
                </th>
                <th className={thF}>
                  <HeaderTypeahead
                    placeholder='Find player…'
                    onSelect={name => setSearch(name)}
                    onClear={() => setSearch('')}
                  />
                </th>
                <th className={`${thF} text-right`}><ScoringTypeToggle value={scoring} onChange={setScoring} /></th>
                <th className={`${thF} text-right`}><GroupToggle /></th>
                <th className={`${thF} text-right`}><SessionsSelect /></th>
                <th className={thF}>
                  <GradeSelect mode='any' selected={gradeFilter} onChange={setGradeFilter} placeholder='All' />
                </th>
                <th className={thF}>
                  <ClubSelect mode='any' selected={clubFilter} onChange={setClubFilter} placeholder='All' />
                </th>
                <th className={`${thF} text-center`}>
                  <label className='flex items-center justify-center cursor-pointer' title='Tracked only'>
                    <input type='checkbox' checked={trackedOnly} onChange={e => setTrackedOnly(e.target.checked)} />
                  </label>
                </th>
              </tr>
              <tr>
                <th className={`${thH} text-right`}>#</th>
                <th className={`${thH} text-left`}>Name</th>
                <th className={`${thH} text-right`}>{scoringAvgLabel(scoring)}</th>
                <th className={`${thH} text-right`}>Sessions</th>
                <th className={`${thH} text-left`}>Grade</th>
                <th className={`${thH} text-left`}>Club</th>
                <th className={`${thH} text-center`}>Tracked</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100'>
              {filteredPlayers.map(({ rank, row: p }, i) => {
                const highlighted = trimmed ? matchesSearch(p.name, trimmed) : false
                return (
                  <tr key={p.id}
                    data-highlight={highlighted && i === filteredPlayers.findIndex(({ row }) => matchesSearch(row.name, trimmed)) ? 'true' : undefined}
                    className={highlighted ? 'bg-yellow-100' : 'hover:bg-gray-50'}>
                    <td className='px-3 py-1.5 text-right text-gray-400'>{rank}</td>
                    <td className='px-3 py-1.5'>
                      <Link href={`/player/${p.id}`} className='text-blue-600 hover:underline'
                        onClick={() => saveBackNav(BACK_KEY)}>
                        {p.name}
                      </Link>
                    </td>
                    <td className='px-3 py-1.5 text-right font-medium'>
                      {formatScoringValue(scoring, p.avg_pct)}
                    </td>
                    <td className='px-3 py-1.5 text-right text-gray-500'>{p.sessions}</td>
                    <td className='px-3 py-1.5 text-gray-500'>{p.grade}</td>
                    <td className='px-3 py-1.5 text-gray-500'>{p.club}</td>
                    <td className='px-3 py-1.5 text-center'>
                      {isTracked(p.tracked) && <span className='inline-block w-2 h-2 rounded-full bg-green-500' />}
                    </td>
                  </tr>
                )
              })}
              {!loading && filteredPlayers.length === 0 && (
                <tr><td colSpan={7} className='px-3 py-4 text-center text-gray-400'>No players found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Partnerships table */}
      {activeTab === 'partnerships' && (
        <div className='rounded border border-gray-200'>
          <table className='min-w-full text-sm'>
            <thead>
              <tr>
                <th className={`${thF} w-24 text-right`}>
                  <MySelect value={partnerTopN} onChange={e => setPartnerTopN(parseInt(e.target.value, 10))} overrideClass={`${sel} h-auto md:h-auto`}>
                    <option value={0}>All</option>
                    {TOP_OPTS.map(n => <option key={n} value={n}>Top {n}</option>)}
                  </MySelect>
                </th>
                <th className={thF}>
                  <HeaderTypeahead
                    placeholder='Filter by player…'
                    onSelect={name => setPartnerFilter(name)}
                    onClear={() => setPartnerFilter('')}
                  />
                </th>
                <th className={`${thF} text-right`}><ScoringTypeToggle value={scoring} onChange={setScoring} /></th>
                <th className={`${thF} text-right`}><GroupToggle /></th>
                <th className={`${thF} text-right`}><SessionsSelect /></th>
                <th className={`${thF} text-center`}>
                  <label className='flex items-center justify-center cursor-pointer' title='Tracked only'>
                    <input type='checkbox' checked={partnerTrackedOnly} onChange={e => setPartnerTrackedOnly(e.target.checked)} />
                  </label>
                </th>
              </tr>
              <tr>
                <th className={`${thH} text-right`}>#</th>
                <th className={`${thH} text-left`}>Players</th>
                <th className={`${thH} text-right`}>{scoringAvgLabel(scoring)}</th>
                <th className={`${thH} text-right`}>Sessions</th>
                <th className={`${thH} text-center`}>Tracked</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100'>
              {filteredPartnerships.map(({ rank, row: p }) => (
                <tr key={p.id} className='hover:bg-gray-50'>
                  <td className='px-3 py-1.5 text-right text-gray-400'>{rank}</td>
                  <td className='px-3 py-1.5'>
                    <Link href={`/player/${p.player1_id}`} className='text-blue-600 hover:underline'
                      onClick={() => saveBackNav(BACK_KEY)}>
                      {p.player1_name}
                    </Link>
                    {isTracked(p.player1_tracked) && <span className='inline-block w-2 h-2 rounded-full bg-green-500 ml-1 mb-0.5' />}
                    <span className='mx-1.5 text-gray-400'>&amp;</span>
                    <Link href={`/player/${p.player2_id}`} className='text-blue-600 hover:underline'
                      onClick={() => saveBackNav(BACK_KEY)}>
                      {p.player2_name}
                    </Link>
                    {isTracked(p.player2_tracked) && <span className='inline-block w-2 h-2 rounded-full bg-green-500 ml-1 mb-0.5' />}
                  </td>
                  <td className='px-3 py-1.5 text-right font-medium'>
                    {formatScoringValue(scoring, p.avg_pct)}
                  </td>
                  <td className='px-3 py-1.5 text-right text-gray-500'>{p.sessions}</td>
                  <td className='px-3 py-1.5 text-center'>
                    {(isTracked(p.player1_tracked) || isTracked(p.player2_tracked)) && <span className='inline-block w-2 h-2 rounded-full bg-green-500' />}
                  </td>
                </tr>
              ))}
              {!loading && filteredPartnerships.length === 0 && (
                <tr><td colSpan={5} className='px-3 py-4 text-center text-gray-400'>
                  {partnerFilter ? `No partnerships found for "${partnerFilter}"` : 'No partnerships found'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
