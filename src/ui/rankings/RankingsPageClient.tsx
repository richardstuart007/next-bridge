'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { searchAllPlayers } from '@/src/lib/actions/players'

interface PlayerRow {
  id: number
  name: string
  avg_pct: number
  sessions: number
  grade: string
  club: string
}

interface PartnershipRow {
  id: number
  sessions: number
  avg_pct: number
  player1_id: number
  player1_name: string
  player2_id: number
  player2_name: string
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
      <input
        type='text'
        value={value}
        onChange={e => { setValue(e.target.value); if (!e.target.value.trim()) clear() }}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className='w-full rounded border border-gray-300 px-2 py-0.5 text-xs font-normal'
        autoComplete='off'
      />
      {searching && <span className='absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400'>…</span>}
      {selected && !searching && (
        <button onClick={clear} className='absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700'>×</button>
      )}
      {open && suggestions.length > 0 && (
        <ul className='absolute left-0 z-50 mt-0.5 w-64 rounded border border-gray-200 bg-white shadow-lg divide-y divide-gray-100 max-h-60 overflow-auto'>
          {suggestions.map(p => (
            <li key={p.pl_plid}>
              <button
                type='button'
                className='flex w-full items-center justify-between px-3 py-1.5 hover:bg-gray-50 text-xs text-left'
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setValue(p.pl_name); setSelected(p.pl_name); setOpen(false); onSelect(p.pl_name) }}
              >
                <span className='font-medium text-gray-900'>{p.pl_name}</span>
                <span className='text-gray-400'>{[p.pl_grade, p.pl_club].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Scoring = 'all' | 'mp' | 'imp'
type TabId = 'players' | 'partnerships'

const TOP_OPTS = [10, 25, 50, 100]

export default function RankingsPageClient() {
  const [min, setMin] = useState(5)
  const [scoring, setScoring] = useState<Scoring>('all')
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [partnerships, setPartnerships] = useState<PartnershipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('players')

  // Player column filters
  const [topN, setTopN] = useState(0)
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [clubFilter, setClubFilter] = useState('')

  // Partnership column filters
  const [partnerTopN, setPartnerTopN] = useState(0)
  const [partnerFilter, setPartnerFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/rankings?min=${min}&scoring=${scoring}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setPlayers(data.players ?? [])
        setPartnerships(data.partnerships ?? [])
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [min, scoring])

  // Scroll to first highlighted player after render
  useEffect(() => {
    if (!search) return
    const el = document.querySelector('[data-highlight="true"]') as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [search, players])

  const clubs = useMemo(() => [...new Set(players.map(p => p.club).filter(Boolean))].sort(), [players])
  const grades = useMemo(() => [...new Set(players.map(p => p.grade).filter(Boolean))].sort(), [players])

  const filteredPlayers = useMemo(() => {
    let r = players.map((p, i) => ({ rank: i + 1, row: p }))
    if (topN > 0) r = r.slice(0, topN)
    if (clubFilter) r = r.filter(({ row }) => row.club === clubFilter)
    if (gradeFilter) r = r.filter(({ row }) => row.grade === gradeFilter)
    return r
  }, [players, topN, clubFilter, gradeFilter])

  const filteredPartnerships = useMemo(() => {
    let r = partnerships.map((p, i) => ({ rank: i + 1, row: p }))
    if (partnerTopN > 0) r = r.slice(0, partnerTopN)
    if (partnerFilter) r = r.filter(({ row }) =>
      matchesSearch(row.player1_name, partnerFilter) || matchesSearch(row.player2_name, partnerFilter)
    )
    return r
  }, [partnerships, partnerTopN, partnerFilter])

  const trimmed = search.trim()

  // Shared styles
  const thF = 'px-2 pt-2 pb-1 bg-white align-bottom'                     // filter row cell
  const thH = 'px-3 py-2 bg-gray-50 text-xs text-gray-500 uppercase'     // header label cell
  const sel = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'

  function ScoringToggle() {
    return (
      <div className='flex justify-center rounded border border-gray-300 overflow-hidden text-xs'>
        {(['all', 'mp', 'imp'] as Scoring[]).map(s => (
          <button key={s} onClick={() => setScoring(s)}
            className={`px-2 py-0.5 ${scoring === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
            {s === 'all' ? 'All' : s.toUpperCase()}
          </button>
        ))}
      </div>
    )
  }

  function SessionsSelect() {
    return (
      <select value={min} onChange={e => setMin(parseInt(e.target.value, 10))} className={sel}>
        {[5, 10, 20, 50].map(n => <option key={n} value={n}>≥ {n}</option>)}
      </select>
    )
  }

  return (
    <div className='space-y-4'>

      {/* Tabs */}
      <div className='flex items-center gap-4 border-b border-gray-200'>
        <div className='flex'>
          {(['players', 'partnerships'] as TabId[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab === 'players' ? `Players (${players.length})` : `Partnerships (${partnerships.length})`}
            </button>
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
                  <select value={topN} onChange={e => setTopN(parseInt(e.target.value, 10))} className={sel}>
                    <option value={0}>All</option>
                    {TOP_OPTS.map(n => <option key={n} value={n}>Top {n}</option>)}
                  </select>
                </th>
                <th className={thF}>
                  <HeaderTypeahead
                    placeholder='Find player…'
                    onSelect={name => setSearch(name)}
                    onClear={() => setSearch('')}
                  />
                </th>
                <th className={`${thF} text-right`}><ScoringToggle /></th>
                <th className={`${thF} text-right`}><SessionsSelect /></th>
                <th className={thF}>
                  <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)} className={sel}>
                    <option value=''>All</option>
                    {grades.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </th>
                <th className={thF}>
                  <select value={clubFilter} onChange={e => setClubFilter(e.target.value)} className={sel}>
                    <option value=''>All</option>
                    {clubs.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </th>
              </tr>
              <tr>
                <th className={`${thH} text-right`}>#</th>
                <th className={`${thH} text-left`}>Name</th>
                <th className={`${thH} text-right`}>Avg%</th>
                <th className={`${thH} text-right`}>Sessions</th>
                <th className={`${thH} text-left`}>Grade</th>
                <th className={`${thH} text-left`}>Club</th>
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
                      <Link href={`/player/${p.id}`} className='text-blue-600 hover:underline'>{p.name}</Link>
                    </td>
                    <td className='px-3 py-1.5 text-right font-medium'>{parseFloat(String(p.avg_pct)).toFixed(1)}%</td>
                    <td className='px-3 py-1.5 text-right text-gray-500'>{p.sessions}</td>
                    <td className='px-3 py-1.5 text-gray-500'>{p.grade}</td>
                    <td className='px-3 py-1.5 text-gray-500'>{p.club}</td>
                  </tr>
                )
              })}
              {!loading && filteredPlayers.length === 0 && (
                <tr><td colSpan={6} className='px-3 py-4 text-center text-gray-400'>No players found</td></tr>
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
                  <select value={partnerTopN} onChange={e => setPartnerTopN(parseInt(e.target.value, 10))} className={sel}>
                    <option value={0}>All</option>
                    {TOP_OPTS.map(n => <option key={n} value={n}>Top {n}</option>)}
                  </select>
                </th>
                <th className={thF}>
                  <HeaderTypeahead
                    placeholder='Filter by player…'
                    onSelect={name => setPartnerFilter(name)}
                    onClear={() => setPartnerFilter('')}
                  />
                </th>
                <th className={`${thF} text-right`}><ScoringToggle /></th>
                <th className={`${thF} text-right`}><SessionsSelect /></th>
              </tr>
              <tr>
                <th className={`${thH} text-right`}>#</th>
                <th className={`${thH} text-left`}>Players</th>
                <th className={`${thH} text-right`}>Avg%</th>
                <th className={`${thH} text-right`}>Sessions</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-100'>
              {filteredPartnerships.map(({ rank, row: p }) => (
                <tr key={p.id} className='hover:bg-gray-50'>
                  <td className='px-3 py-1.5 text-right text-gray-400'>{rank}</td>
                  <td className='px-3 py-1.5'>
                    <Link href={`/player/${p.player1_id}`} className='text-blue-600 hover:underline'>{p.player1_name}</Link>
                    <span className='mx-1.5 text-gray-400'>&amp;</span>
                    <Link href={`/player/${p.player2_id}`} className='text-blue-600 hover:underline'>{p.player2_name}</Link>
                  </td>
                  <td className='px-3 py-1.5 text-right font-medium'>{parseFloat(String(p.avg_pct)).toFixed(1)}%</td>
                  <td className='px-3 py-1.5 text-right text-gray-500'>{p.sessions}</td>
                </tr>
              ))}
              {!loading && filteredPartnerships.length === 0 && (
                <tr><td colSpan={4} className='px-3 py-4 text-center text-gray-400'>
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
