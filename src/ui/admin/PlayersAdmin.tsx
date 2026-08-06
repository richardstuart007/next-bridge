'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'
import { saveBackNav } from 'nextjs-shared/useBackNav'
import { FilterName } from '@/src/ui/shared/FilterName'
import { NumberFilterInput } from '@/src/ui/shared/NumberFilterInput'
import { BACK_KEY, ROWS_PER_PAGE, FILTER_DEBOUNCE_MS, WIDTH_NAME, WIDTH_NZB, WIDTH_CLUB, WIDTH_RANK } from '@/src/lib/constants'

interface PlayerRow {
  pl_plid:             number
  pl_nzb: number | null
  pl_name:             string
  pl_club:             string
  pl_rank:             string
  pl_grade:            string
  pl_rating:           number
  pl_a_points:         number
  a1_sessions:         number
  a1_avg_pct:          number
  pl_tracked:      boolean
}

export default function PlayersAdmin() {
  const [players,       setPlayers]       = useState<PlayerRow[]>([])
  const [totalPages,    setTotalPages]    = useState(1)
  const [totalCount,    setTotalCount]    = useState(0)
  const [trackedCount,  setTrackedCount]  = useState(0)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [filter_name,   setFilter_name]   = useState('')
  const [filter_nzb,    setFilter_nzb]    = useState('')
  const [page,          setPage]          = useState(1)
  const [itemsPerPage,  setItemsPerPage]  = useState(ROWS_PER_PAGE)
  const [toggling,      setToggling]      = useState<Set<number>>(new Set())

  //
  //  Overall tracked count, independent of the name/nz filter below — fetched once on mount
  //  and adjusted locally by toggle() afterward, so the header always reflects the full roster
  //
  useEffect(() => {
    fetch('/api/admin/players?tracked=true&itemsPerPage=1')
      .then(r => r.json())
      .then(data => setTrackedCount(data.totalCount ?? 0))
      .catch(() => {})
  }, [])

  // Reset to page 1 whenever a filter changes
  useEffect(() => { setPage(1) }, [filter_name, filter_nzb])

  // Fetch only the current page from the server (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      (async () => {
        try {
          const params = new URLSearchParams()
          if (filter_name) params.set('name', filter_name)
          if (filter_nzb)  params.set('nzb', filter_nzb)
          params.set('page', String(page))
          params.set('itemsPerPage', String(itemsPerPage))

          const r = await fetch(`/api/admin/players?${params.toString()}`)
          const data = await r.json()
          setPlayers(data.rows as PlayerRow[])
          setTotalPages(data.totalPages ?? 1)
          setTotalCount(data.totalCount ?? 0)
        } catch { /* keep previously-loaded rows on a failed refresh */ }
        finally { setHasLoadedOnce(true) }
      })()
    }, FILTER_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [filter_name, filter_nzb, page, itemsPerPage])

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
          p.pl_plid === plid ? { ...p, pl_tracked: !current } : p
        ))
        setTrackedCount(prev => prev + (current ? -1 : 1))
      }
    } finally {
      setToggling(prev => { const s = new Set(prev); s.delete(plid); return s })
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-4'>
        <FilterName value={filter_name} onChange={setFilter_name}
          placeholder='Filter by name…' overrideClass={`${WIDTH_NAME} px-2.5 py-1 text-sm`} />
        <NumberFilterInput value={filter_nzb} onChange={setFilter_nzb}
          placeholder='Filter by NZB#…' overrideClass={`${WIDTH_NZB} px-2.5 py-1 text-sm`} />
        <span className='text-sm text-gray-500'>
          {trackedCount} tracked · {totalCount} total
        </span>
      </div>

      {!hasLoadedOnce ? (
        <p className='text-sm text-gray-400'>Loading…</p>
      ) : (
        <>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-gray-200'>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-8'>Track</th>
                  <th className='py-1.5 text-left text-xs text-gray-500 font-medium'>Name</th>
                  <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_NZB}`}>NZB#</th>
                  <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_CLUB}`}>Club</th>
                  <th className={`py-1.5 text-left text-xs text-gray-500 font-medium ${WIDTH_RANK}`}>Rank</th>
                  <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-20'>Sessions</th>
                  <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-20'>Avg %</th>
                </tr>
              </thead>
              <tbody>
                {players.map(({ pl_plid, pl_name, pl_nzb, pl_club, pl_rank, a1_sessions, a1_avg_pct, pl_tracked }) => (
                  <tr key={pl_plid}
                    className={`border-b border-gray-100 ${pl_tracked ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                    <td className='py-1.5'>
                      <input type='checkbox' checked={pl_tracked}
                        disabled={toggling.has(pl_plid)}
                        onChange={() => toggle(pl_plid, pl_tracked)}
                        className='cursor-pointer' />
                    </td>
                    <td className='py-1.5 font-medium'>
                      <Link href={`/player/${pl_plid}`} className='text-blue-600 hover:underline'
                        onClick={() => saveBackNav(BACK_KEY)}>
                        {pl_name}
                      </Link>
                    </td>
                    <td className='py-1.5 text-gray-500 text-xs'>{pl_nzb || '—'}</td>
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
          {totalPages > 1 && (
            <MyPaginationFooter
              totalPages={totalPages}
              statecurrentPage={page}
              setStateCurrentPage={setPage}
              rowsPerPage={itemsPerPage}
              setRowsPerPage={v => { setItemsPerPage(v); setPage(1) }}
            />
          )}
        </>
      )}
    </div>
  )
}
