'use client'

import { useState, useEffect } from 'react'

interface Ts1Row {
  s1_run_id: number
  s1_date: string
  s1_club: string
  s1_event_name: string
  s1_score_type: string
  s1_event_type: string
}

export default function Ts1Table() {
  const [rows,    setRows]    = useState<Ts1Row[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch('/api/scrape/ts1')
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <section className='rounded border border-gray-200 bg-gray-50 p-4'>
      <div className='flex items-center justify-between mb-3'>
        <span className='text-xs font-semibold text-gray-600 uppercase tracking-wide'>
          ts1_sessions — {rows.length} rows
        </span>
        <button onClick={load} disabled={loading}
          className='rounded bg-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-300 disabled:opacity-50'>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {rows.length === 0
        ? <p className='text-xs text-gray-400'>Empty</p>
        : (
          <div className='overflow-x-auto'>
            <table className='w-full text-xs font-mono'>
              <thead>
                <tr className='border-b border-gray-200 text-left text-gray-500'>
                  <th className='pb-1 pr-4'>run_id</th>
                  <th className='pb-1 pr-4'>date</th>
                  <th className='pb-1 pr-4'>club</th>
                  <th className='pb-1 pr-4'>event</th>
                  <th className='pb-1 pr-4'>score</th>
                  <th className='pb-1'>type</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {rows.map(r => (
                  <tr key={r.s1_run_id} className='hover:bg-gray-100'>
                    <td className='py-0.5 pr-4 text-blue-600'>{r.s1_run_id}</td>
                    <td className='py-0.5 pr-4'>{r.s1_date}</td>
                    <td className='py-0.5 pr-4 truncate max-w-32'>{r.s1_club}</td>
                    <td className='py-0.5 pr-4 truncate max-w-48'>{r.s1_event_name}</td>
                    <td className='py-0.5 pr-4'>{r.s1_score_type}</td>
                    <td className='py-0.5'>{r.s1_event_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </section>
  )
}
