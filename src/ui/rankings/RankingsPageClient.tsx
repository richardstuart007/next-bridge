'use client'

import { useState, useEffect, useRef } from 'react'
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

function PlayerTypeahead({
  label,
  onSelect,
  onClear
}: {
  label: string
  onSelect: (name: string) => void
  onClear: () => void
}) {
  const [typeahead, setTypeahead] = useState('')
  const [suggestions, setSuggestions] = useState<PlayerSearchRow[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selected, setSelected] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trimmed = typeahead.trim()
    if (trimmed.length < 2) { setSuggestions([]); setShowDropdown(false); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const rows = await searchAllPlayers(trimmed)
        setSuggestions(rows as PlayerSearchRow[])
        setShowDropdown(true)
      } catch { /* ignore */ } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [typeahead])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function clear() {
    setTypeahead('')
    setSelected('')
    setShowDropdown(false)
    onClear()
  }

  return (
    <div ref={ref} className='flex items-center gap-2'>
      <label className='text-sm text-gray-600'>{label}</label>
      <div className='relative'>
        <input
          type='text'
          value={typeahead}
          onChange={e => {
            setTypeahead(e.target.value)
            if (!e.target.value.trim()) clear()
          }}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true) }}
          placeholder='Type a name…'
          className='rounded border border-gray-300 px-2 py-1 text-sm w-44'
          autoComplete='off'
        />
        {searching && <span className='absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400'>…</span>}
        {selected && !searching && (
          <button
            onClick={clear}
            className='absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600'
          >Clear</button>
        )}
        {showDropdown && suggestions.length > 0 && (
          <ul className='absolute z-10 mt-1 w-64 rounded border border-gray-200 bg-white shadow-md divide-y divide-gray-100 max-h-60 overflow-auto'>
            {suggestions.map(p => (
              <li key={p.pl_plid}>
                <button
                  type='button'
                  className='flex w-full items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm text-left'
                  onClick={() => {
                    setTypeahead(p.pl_name)
                    setSelected(p.pl_name)
                    setShowDropdown(false)
                    onSelect(p.pl_name)
                  }}
                >
                  <span className='font-medium text-gray-900'>{p.pl_name}</span>
                  <span className='text-xs text-gray-400'>{[p.pl_grade, p.pl_club].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {showDropdown && suggestions.length === 0 && !searching && typeahead.trim().length >= 2 && (
          <div className='absolute z-10 mt-1 w-44 rounded border border-gray-200 bg-white shadow-md px-3 py-2 text-sm text-gray-400'>
            No players found
          </div>
        )}
      </div>
    </div>
  )
}

type Scoring = 'all' | 'mp' | 'imp'

export default function RankingsPageClient() {
  const [min, setMin] = useState(5)
  const [scoring, setScoring] = useState<Scoring>('all')
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [partnerships, setPartnerships] = useState<PartnershipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Player table — highlight search
  const [search, setSearch] = useState('')
  const firstPlayerMatchRef = useRef<HTMLTableRowElement | null>(null)

  // Partnerships table — filter by player
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

  // Scroll to first highlighted player
  useEffect(() => {
    if (!search) return
    firstPlayerMatchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [search, players])

  const trimmed = search.trim()

  // Partnerships filtered by selected player, retaining original rank index
  const filteredPartnerships: Array<{ rank: number; row: PartnershipRow }> = partnerships
    .map((p, i) => ({ rank: i + 1, row: p }))
    .filter(({ row }) =>
      !partnerFilter ||
      matchesSearch(row.player1_name, partnerFilter) ||
      matchesSearch(row.player2_name, partnerFilter)
    )

  return (
    <div className='space-y-6'>

      {/* Controls */}
      <div className='flex flex-wrap items-center gap-4'>
        <div className='flex items-center gap-2'>
          <label className='text-sm text-gray-600'>Scoring</label>
          <div className='flex rounded border border-gray-300 overflow-hidden text-sm'>
            {(['all', 'mp', 'imp'] as Scoring[]).map(s => (
              <button
                key={s}
                onClick={() => { setScoring(s); setSearch(''); setPartnerFilter('') }}
                className={`px-3 py-1 ${scoring === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {s === 'all' ? 'All' : s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <label className='text-sm text-gray-600'>Min sessions</label>
          <select
            value={min}
            onChange={e => { setMin(parseInt(e.target.value, 10)); setSearch('') }}
            className='rounded border border-gray-300 px-2 py-1 text-sm'
          >
            {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <PlayerTypeahead
          label='Find player'
          onSelect={name => setSearch(name)}
          onClear={() => setSearch('')}
        />
        {loading && <span className='text-xs text-gray-400'>Loading…</span>}
      </div>

      {error && <p className='text-sm text-red-600'>{error}</p>}

      <div className='grid grid-cols-1 gap-8 lg:grid-cols-2'>

        {/* Players */}
        <div>
          <h2 className='mb-3 text-base font-semibold text-gray-800'>
            Players <span className='text-sm font-normal text-gray-500'>({players.length})</span>
          </h2>
          <div className='overflow-auto rounded border border-gray-200 max-h-[70vh]'>
            <table className='min-w-full text-sm'>
              <thead className='bg-gray-50 text-xs text-gray-500 uppercase sticky top-0'>
                <tr>
                  <th className='px-3 py-2 text-right w-10'>#</th>
                  <th className='px-3 py-2 text-left'>Name</th>
                  <th className='px-3 py-2 text-right'>Avg%</th>
                  <th className='px-3 py-2 text-right'>Sessions</th>
                  <th className='px-3 py-2 text-left'>Grade</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {players.map((p, i) => {
                  const highlighted = trimmed && matchesSearch(p.name, trimmed)
                  const isFirst = highlighted && firstPlayerMatchRef.current === null
                  return (
                    <tr
                      key={p.id}
                      ref={isFirst ? (el) => { firstPlayerMatchRef.current = el } : undefined}
                      className={highlighted ? 'bg-yellow-100' : 'hover:bg-gray-50'}
                    >
                      <td className='px-3 py-1.5 text-right text-gray-400'>{i + 1}</td>
                      <td className='px-3 py-1.5'>
                        <Link href={`/player/${p.id}`} className='text-blue-600 hover:underline'>
                          {p.name}
                        </Link>
                      </td>
                      <td className='px-3 py-1.5 text-right font-medium'>{parseFloat(String(p.avg_pct)).toFixed(1)}%</td>
                      <td className='px-3 py-1.5 text-right text-gray-500'>{p.sessions}</td>
                      <td className='px-3 py-1.5 text-gray-500'>{p.grade}</td>
                    </tr>
                  )
                })}
                {!loading && players.length === 0 && (
                  <tr><td colSpan={5} className='px-3 py-4 text-center text-gray-400'>No players found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Partnerships */}
        <div>
          <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
            <h2 className='text-base font-semibold text-gray-800'>
              Partnerships{' '}
              <span className='text-sm font-normal text-gray-500'>
                ({partnerFilter ? `${filteredPartnerships.length} of ${partnerships.length}` : partnerships.length})
              </span>
            </h2>
            <PlayerTypeahead
              label='Filter'
              onSelect={name => setPartnerFilter(name)}
              onClear={() => setPartnerFilter('')}
            />
          </div>
          <div className='overflow-auto rounded border border-gray-200 max-h-[70vh]'>
            <table className='min-w-full text-sm'>
              <thead className='bg-gray-50 text-xs text-gray-500 uppercase sticky top-0'>
                <tr>
                  <th className='px-3 py-2 text-right w-10'>#</th>
                  <th className='px-3 py-2 text-left'>Players</th>
                  <th className='px-3 py-2 text-right'>Avg%</th>
                  <th className='px-3 py-2 text-right'>Sessions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {filteredPartnerships.map(({ rank, row: p }) => (
                  <tr key={p.id} className='hover:bg-gray-50'>
                    <td className='px-3 py-1.5 text-right text-gray-400'>{rank}</td>
                    <td className='px-3 py-1.5'>
                      <Link href={`/player/${p.player1_id}`} className='text-blue-600 hover:underline'>
                        {p.player1_name}
                      </Link>
                      <span className='mx-1.5 text-gray-400'>&amp;</span>
                      <Link href={`/player/${p.player2_id}`} className='text-blue-600 hover:underline'>
                        {p.player2_name}
                      </Link>
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
        </div>

      </div>
    </div>
  )
}
