'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { MyInput } from 'nextjs-shared/MyInput'
import { NB_BACK_FROM_KEY } from '@/src/lib/constants'

interface PlayerRow {
  pl_plid:             number
  pl_nz_bridge_number: number | null
  pl_name:             string
  pl_club:             string
  pl_rank:             string
  pl_grade:            string
  pl_rating:           number
  pl_a_points:         number
  a1_sessions:         number
  a1_avg_pct:          number
  pl_all_results:      boolean
}

export default function PlayersAdmin() {
  const [players, setPlayers]   = useState<PlayerRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [nameFilter, setName]   = useState('')
  const [toggling, setToggling] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetch('/api/admin/players')
      .then(r => r.json())
      .then(rows => { setPlayers(rows); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = nameFilter.toLowerCase()
    return q
      ? players.filter(p => p.pl_name.toLowerCase().includes(q) || String(p.pl_nz_bridge_number ?? '').includes(q))
      : players
  }, [players, nameFilter])

  async function toggle(plid: number, current: boolean) {
    setToggling(prev => new Set([...prev, plid]))
    try {
      const res = await fetch(`/api/admin/players/${plid}/all-results`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all_results: !current }),
      })
      if (res.ok) {
        setPlayers(prev => prev.map(p =>
          p.pl_plid === plid ? { ...p, pl_all_results: !current } : p
        ))
      }
    } finally {
      setToggling(prev => { const s = new Set(prev); s.delete(plid); return s })
    }
  }

  const trackedCount = players.filter(p => p.pl_all_results).length

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-4'>
        <MyInput type='text' value={nameFilter} onChange={e => setName(e.target.value)}
          placeholder='Search by name or NZB#…'
          overrideClass='rounded border border-gray-300 px-2.5 py-1 text-sm w-64 h-auto md:h-auto' />
        <span className='text-sm text-gray-500'>
          {trackedCount} tracked · {players.length} total
        </span>
      </div>

      {loading ? (
        <p className='text-sm text-gray-400'>Loading…</p>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b border-gray-200'>
                <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-8'>Track</th>
                <th className='py-1.5 text-left text-xs text-gray-500 font-medium'>Name</th>
                <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-20'>NZB#</th>
                <th className='py-1.5 text-left text-xs text-gray-500 font-medium'>Club</th>
                <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Rank</th>
                <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-20'>Sessions</th>
                <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-20'>Avg %</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ pl_plid, pl_name, pl_nz_bridge_number, pl_club, pl_rank, a1_sessions, a1_avg_pct, pl_all_results }) => (
                <tr key={pl_plid}
                  className={`border-b border-gray-100 ${pl_all_results ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                  <td className='py-1.5'>
                    <input type='checkbox' checked={pl_all_results}
                      disabled={toggling.has(pl_plid)}
                      onChange={() => toggle(pl_plid, pl_all_results)}
                      className='cursor-pointer' />
                  </td>
                  <td className='py-1.5 font-medium'>
                    <Link href={`/player/${pl_plid}`} className='text-blue-600 hover:underline'
                      onClick={() => sessionStorage.setItem(NB_BACK_FROM_KEY, window.location.pathname + window.location.search)}>
                      {pl_name}
                    </Link>
                  </td>
                  <td className='py-1.5 text-gray-500 text-xs'>{pl_nz_bridge_number || '—'}</td>
                  <td className='py-1.5 text-gray-500 text-xs'>{pl_club || '—'}</td>
                  <td className='py-1.5 text-gray-500 text-xs'>{pl_rank || '—'}</td>
                  <td className='py-1.5 text-right text-gray-600'>{a1_sessions}</td>
                  <td className='py-1.5 text-right text-gray-600'>
                    {a1_avg_pct > 0 ? `${parseFloat(String(a1_avg_pct)).toFixed(2)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
