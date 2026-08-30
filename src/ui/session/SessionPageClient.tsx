'use client'

//==============================================================================================
//  1) DESCRIPTION
//    SessionPageClient — the /session/[id] page body. Loads the session row (getSessionById)
//    and its pair results (/api/sessions/[id]/results) on mount, then renders a header plus a
//    client-paginated results table; each row links through to the player page.
//
//    Parameters:
//      sessionId — the se_seid to display
//==============================================================================================

import { useState, useEffect } from 'react'
import { getSessionById } from '@/src/lib/actions/sessions'
import Link from 'next/link'
import MyPaginationFooter from 'nextjs-shared/MyPaginationFooter'
import { MyBackHomeNav } from 'nextjs-shared/MyBackHomeNav'
import { useBackNav, saveBackNav } from 'nextjs-shared/useBackNav'
import { BACK_KEY, ROWS_PER_PAGE } from '@/src/lib/constants'

interface SessionRow {
  se_seid: number
  se_date: string
  se_day_of_week: string

  se_scoring: string
  se_run_id: number
}

interface ResultRow {
  re_score: number | null
  plid: number
  pl_name: string
  pl_nzb: number
  partner_plid: number
  partner_name: string
  partner_nzb: number
}

export default function SessionPageClient({ sessionId }: { sessionId: number }) {
  const [session, setSession] = useState<SessionRow | null>(null)
  const [results, setResults] = useState<ResultRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(ROWS_PER_PAGE)
  const backPath = useBackNav(BACK_KEY)

  useEffect(() => {
    if (isNaN(sessionId)) {
      setError('Invalid session ID')
      setLoading(false)
      return
    }

    //------------------------------------------------------------------------------------------
    //  load — fetches the session row + its results in parallel, into `session` / `results`
    //------------------------------------------------------------------------------------------
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
          <MyBackHomeNav backPath={backPath} linkClass='text-xs text-blue-600 hover:underline' />
        </div>
        <h1 className='text-xl font-bold text-gray-900'>
          {dateStr}
          <span className='ml-3 text-sm font-normal text-gray-400'>#{session.se_run_id}</span>
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
                <th className='py-1.5 text-right text-xs text-gray-500 font-medium'>{session.se_scoring === 'VP' ? 'VP' : '%'}</th>
              </tr>
            </thead>
            <tbody>
              {results.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((r, i) => {
                const rowNum = (currentPage - 1) * itemsPerPage + i + 1
                return (
                <tr
                  key={i}
                  className='border-b border-gray-100 hover:bg-blue-50 cursor-pointer'
                  onClick={() => {
                    saveBackNav(BACK_KEY)
                    window.location.href = `/player/${r.plid}?partner=${r.partner_plid}`
                  }}
                >
                  <td className='py-1.5 text-gray-400'>{rowNum}</td>
                  <td className='py-1.5'>
                    <Link href={`/player/${r.plid}`} className='text-blue-600 hover:underline'
                      onClick={e => { e.stopPropagation(); saveBackNav(BACK_KEY) }}>
                      {r.pl_name}
                    </Link>
                  </td>
                  <td className='py-1.5 text-xs text-gray-400'>{r.pl_nzb || '—'}</td>
                  <td className='py-1.5'>
                    <Link href={`/player/${r.partner_plid}`} className='text-blue-600 hover:underline'
                      onClick={e => { e.stopPropagation(); saveBackNav(BACK_KEY) }}>
                      {r.partner_name}
                    </Link>
                  </td>
                  <td className='py-1.5 text-xs text-gray-400'>{r.partner_nzb || '—'}</td>
                  <td className='py-1.5 text-right font-medium'>
                    {session.se_scoring === 'VP'
                      ? parseFloat(String(r.re_score)).toFixed(2)
                      : `${parseFloat(String(r.re_score)).toFixed(2)}%`}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        )}
        {results.length > itemsPerPage && (
          <MyPaginationFooter
            totalPages={Math.ceil(results.length / itemsPerPage)}
            statecurrentPage={currentPage}
            setStateCurrentPage={setCurrentPage}
            rowsPerPage={itemsPerPage}
            setRowsPerPage={v => { setItemsPerPage(v); setCurrentPage(1) }}
          />
        )}
      </div>
    </div>
  )
}
