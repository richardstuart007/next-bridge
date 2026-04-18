'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { searchPlayers } from '@/src/lib/actions/players'
import { getRecentSessions } from '@/src/lib/actions/sessions'
import Link from 'next/link'
import MyPagination from 'nextjs-shared/MyPagination'

interface PlayerRow {
  pl_plid: number
  pl_nz_bridge_number: number | null
  pl_name: string
  pl_grade: string
  pl_club: string
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

const INPUT_CLS = 'w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs font-normal'
const SELECT_CLS = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'

export default function HomePageClient() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const [allSessions, setAllSessions] = useState<SessionRow[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dayFilter, setDayFilter] = useState('')
  const [dateSeqFilter, setDateSeqFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  useEffect(() => {
    getRecentSessions(500).then(rows => setAllSessions(rows as SessionRow[])).catch(console.error)
  }, [])

  const sessions = useMemo(() => {
    let rows = allSessions
    if (dateFrom) rows = rows.filter(s => s.se_date >= dateFrom)
    if (dateTo)   rows = rows.filter(s => s.se_date <= dateTo)
    if (dayFilter)       rows = rows.filter(s => s.se_day_of_week === dayFilter)
    if (dateSeqFilter)   rows = rows.filter(s => String(s.se_date_seq || '') === dateSeqFilter)
    return rows
  }, [allSessions, dateFrom, dateTo, dayFilter, dateSeqFilter])

  useEffect(() => { setCurrentPage(1) }, [dateFrom, dateTo, dayFilter, dateSeqFilter])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setHasSearched(false)
    try {
      const rows = await searchPlayers(query.trim())
      setPlayers(rows)
      setHasSearched(true)
    } catch (err) {
      console.error(err)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className='space-y-8'>
      <section>
        <h1 className='text-2xl font-bold text-gray-900 mb-1'>Bridge Results Tracker</h1>
        <p className='text-sm text-gray-500'>Search for a player to view their performance history.</p>
      </section>

      {/* Player search */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-3 text-base font-semibold text-gray-800'>Find a Player</h2>
        <form onSubmit={handleSearch} className='flex gap-2'>
          <input
            type='text'
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder='Search by name…'
            className='flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm'
          />
          <button
            type='submit'
            disabled={searching}
            className='rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {players.length > 0 && (
          <ul className='mt-3 divide-y divide-gray-100 border border-gray-200 rounded'>
            {players.map(p => (
              <li key={p.pl_plid}>
                <Link
                  href={`/player/${p.pl_plid}`}
                  className='flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm'
                >
                  <span className='font-medium text-gray-900'>{p.pl_name}</span>
                  <span className='text-xs text-gray-400'>
                    {[p.pl_grade, p.pl_club].filter(Boolean).join(' · ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {hasSearched && players.length === 0 && !searching && (
          <p className='mt-3 text-sm text-gray-400'>No players found for &ldquo;{query}&rdquo;</p>
        )}
      </section>

      {/* Sessions */}
      <section className='rounded border border-gray-200 p-4'>
        <div className='mb-3 flex items-center justify-between'>
          <h2 className='text-base font-semibold text-gray-800'>
            Sessions
            <span className='ml-2 text-xs font-normal text-gray-400'>{sessions.length} shown</span>
          </h2>
          <Link href='/admin' className='text-xs text-blue-600 hover:underline'>Admin →</Link>
        </div>

        {allSessions.length === 0 ? (
          <p className='text-sm text-gray-400'>No sessions imported yet. <Link href='/admin' className='text-blue-600 hover:underline'>Import one now.</Link></p>
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
                  <div className='flex gap-1 items-center'>
                    <input
                      type='date'
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className={INPUT_CLS}
                      title='From date'
                    />
                    <span className='text-gray-400 text-xs'>–</span>
                    <input
                      type='date'
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className={INPUT_CLS}
                      title='To date'
                    />
                  </div>
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
                  {(dateFrom || dateTo || dayFilter || dateSeqFilter) && (
                    <button
                      onClick={() => { setDateFrom(''); setDateTo(''); setDayFilter(''); setDateSeqFilter('') }}
                      className='text-xs text-blue-600 hover:underline'
                    >
                      Clear
                    </button>
                  )}
                </td>
              </tr>
            </thead>
            <tbody>
              {sessions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(s => (
                <tr
                  key={s.se_seid}
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
        {sessions.length > itemsPerPage && (
          <div className='mt-3 flex items-center gap-3'>
            <select
              value={itemsPerPage}
              onChange={e => { setItemsPerPage(parseInt(e.target.value, 10)); setCurrentPage(1) }}
              className='rounded border border-gray-300 px-1.5 py-0.5 text-xs'
            >
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} rows</option>)}
            </select>
            <span className='text-xs text-gray-400'>
              p.{currentPage}/{Math.ceil(sessions.length / itemsPerPage)}
            </span>
            <MyPagination
              totalPages={Math.ceil(sessions.length / itemsPerPage)}
              statecurrentPage={currentPage}
              setStateCurrentPage={setCurrentPage}
            />
          </div>
        )}
      </section>
    </div>
  )
}
