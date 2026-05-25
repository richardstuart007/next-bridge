'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSessionById } from '@/src/lib/actions/sessions'
import Link from 'next/link'
import MyPagination from 'nextjs-shared/MyPagination'
import { ROWS_PER_PAGE } from '@/src/lib/tableUtils'

interface SessionRow {
  se_seid: number
  se_date: string
  se_day_of_week: string

  se_scoring: string
  se_source_id: number
}

interface ResultRow {
  percentage: number
  pl_id: number
  player_name: string
  player_nz_number: number
  partner_pl_id: number
  partner_name: string
  partner_nz_number: number
}

export default function SessionPageClient({ sessionId }: { sessionId: number }) {
  const router = useRouter()
  const [session, setSession] = useState<SessionRow | null>(null)
  const [results, setResults] = useState<ResultRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(ROWS_PER_PAGE)

  useEffect(() => {
    if (isNaN(sessionId)) {
      setError('Invalid session ID')
      setLoading(false)
      return
    }

    async function load() {
      try {
        const [sessionData, res] = await Promise.all([
          getSessionById(sessionId),
          fetch(`/api/sessions/${sessionId}/results`)
        ])

        if (!sessionData) {
          setError(`Session ${sessionId} not found`)
          return
        }

        setSession(sessionData as SessionRow)

        if (res.ok) {
          setResults(await res.json())
        } else {
          setError('Failed to load results')
        }
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [sessionId])

  if (loading) {
    return <div className='text-sm text-gray-500 py-8 text-center'>Loading…</div>
  }

  if (error) {
    return <div className='rounded bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700'>{error}</div>
  }

  if (!session) return null

  const dateStr = new Date(session.se_date).toISOString().slice(0, 10)

  return (
    <div className='space-y-6'>
      {/* Session header */}
      <div className='rounded border border-gray-200 p-4'>
        <div className='flex items-center gap-2 mb-1'>
          <button onClick={() => router.back()} className='text-xs text-blue-600 hover:underline'>← Back</button>
        </div>
        <h1 className='text-xl font-bold text-gray-900'>
          {dateStr}
          <span className='ml-3 text-sm font-normal text-gray-400'>#{session.se_source_id}</span>
        </h1>
        <div className='flex flex-wrap gap-4 text-sm text-gray-600 mt-1'>
          <span>{session.se_day_of_week}</span>

          <span className={session.se_scoring === 'VP' ? 'text-purple-600 font-medium' : ''}>{session.se_scoring}</span>
        </div>
      </div>

      {/* Results table */}
      <div className='rounded border border-gray-200 p-4'>
        <h2 className='text-base font-semibold text-gray-800 mb-3'>
          Results — {results.length} pair{results.length !== 1 ? 's' : ''}
        </h2>

        {results.length === 0 ? (
          <div className='text-sm text-gray-400 text-center py-4'>No results found</div>
        ) : (
          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b border-gray-200'>
                <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-8'>#</th>
                <th className='py-1.5 text-left text-xs text-gray-500 font-medium'>Player 1</th>
                <th className='py-1.5 text-left text-xs text-gray-500 font-medium'>NZ#</th>
                <th className='py-1.5 text-left text-xs text-gray-500 font-medium'>Player 2</th>
                <th className='py-1.5 text-left text-xs text-gray-500 font-medium'>NZ#</th>
                <th className='py-1.5 text-right text-xs text-gray-500 font-medium'>%</th>
              </tr>
            </thead>
            <tbody>
              {results.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((r, i) => {
                const rowNum = (currentPage - 1) * itemsPerPage + i + 1
                return (
                <tr
                  key={i}
                  className='border-b border-gray-100 hover:bg-blue-50 cursor-pointer'
                  onClick={() => window.location.href = `/player/${r.pl_id}?partner=${r.partner_pl_id}`}
                >
                  <td className='py-1.5 text-gray-400'>{rowNum}</td>
                  <td className='py-1.5'>
                    <Link href={`/player/${r.pl_id}`} className='text-blue-600 hover:underline' onClick={e => e.stopPropagation()}>
                      {r.player_name}
                    </Link>
                  </td>
                  <td className='py-1.5 text-xs text-gray-400'>{r.player_nz_number || '—'}</td>
                  <td className='py-1.5'>
                    <Link href={`/player/${r.partner_pl_id}`} className='text-blue-600 hover:underline' onClick={e => e.stopPropagation()}>
                      {r.partner_name}
                    </Link>
                  </td>
                  <td className='py-1.5 text-xs text-gray-400'>{r.partner_nz_number || '—'}</td>
                  <td className='py-1.5 text-right font-medium'>
                    {parseFloat(String(r.percentage)).toFixed(2)}%
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        )}
        {results.length > itemsPerPage && (
          <div className='mt-3 flex items-center gap-3'>
            <select
              value={itemsPerPage}
              onChange={e => { setItemsPerPage(parseInt(e.target.value, 10)); setCurrentPage(1) }}
              className='rounded border border-gray-300 px-1.5 py-0.5 text-xs'
            >
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} rows</option>)}
            </select>
            <span className='text-xs text-gray-400'>
              p.{currentPage}/{Math.ceil(results.length / itemsPerPage)}
            </span>
            <MyPagination
              totalPages={Math.ceil(results.length / itemsPerPage)}
              statecurrentPage={currentPage}
              setStateCurrentPage={setCurrentPage}
            />
          </div>
        )}
      </div>
    </div>
  )
}
