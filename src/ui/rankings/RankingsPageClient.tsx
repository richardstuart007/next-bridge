'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

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

function matchesSearch(text: string, search: string): boolean {
  return text.toLowerCase().includes(search.toLowerCase())
}

export default function RankingsPageClient() {
  const [min, setMin] = useState(5)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [partnerships, setPartnerships] = useState<PartnershipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const firstPlayerMatchRef = useRef<HTMLTableRowElement | null>(null)
  const firstPartnerMatchRef = useRef<HTMLTableRowElement | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/rankings?min=${min}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setPlayers(data.players ?? [])
        setPartnerships(data.partnerships ?? [])
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [min])

  // Scroll to first match when search changes
  useEffect(() => {
    if (!search) return
    firstPlayerMatchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [search, players])

  const trimmed = search.trim()

  return (
    <div className='space-y-6'>

      {/* Controls */}
      <div className='flex flex-wrap items-center gap-4'>
        <div className='flex items-center gap-2'>
          <label className='text-sm text-gray-600'>Minimum sessions</label>
          <select
            value={min}
            onChange={e => { setMin(parseInt(e.target.value, 10)); setSearch('') }}
            className='rounded border border-gray-300 px-2 py-1 text-sm'
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </div>
        <div className='flex items-center gap-2'>
          <label className='text-sm text-gray-600'>Find player</label>
          <input
            type='text'
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder='Name…'
            className='rounded border border-gray-300 px-2 py-1 text-sm w-40'
          />
          {trimmed && (
            <button onClick={() => setSearch('')} className='text-xs text-gray-400 hover:text-gray-600'>Clear</button>
          )}
        </div>
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
          <h2 className='mb-3 text-base font-semibold text-gray-800'>
            Partnerships <span className='text-sm font-normal text-gray-500'>({partnerships.length})</span>
          </h2>
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
                {partnerships.map((p, i) => {
                  const highlighted = trimmed && (matchesSearch(p.player1_name, trimmed) || matchesSearch(p.player2_name, trimmed))
                  const isFirst = highlighted && firstPartnerMatchRef.current === null
                  return (
                    <tr
                      key={p.id}
                      ref={isFirst ? (el) => { firstPartnerMatchRef.current = el } : undefined}
                      className={highlighted ? 'bg-yellow-100' : 'hover:bg-gray-50'}
                    >
                      <td className='px-3 py-1.5 text-right text-gray-400'>{i + 1}</td>
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
                  )
                })}
                {!loading && partnerships.length === 0 && (
                  <tr><td colSpan={4} className='px-3 py-4 text-center text-gray-400'>No partnerships found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
