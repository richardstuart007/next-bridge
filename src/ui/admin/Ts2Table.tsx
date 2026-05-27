'use client'

import { useState, useEffect } from 'react'

interface Ts2Row {
  s2_run_id: number
  s2_plid1: number
  s2_plid2: number
  s2_score_value: number
}

export default function Ts2Table() {
  const [rows,    setRows]    = useState<Ts2Row[]>([])
  const [count,   setCount]   = useState(0)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch('/api/scrape/ts2')
      const data = await res.json()
      setCount(data.count ?? 0)
      setRows(Array.isArray(data.rows) ? data.rows : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <section className='rounded border border-gray-200 bg-gray-50 p-4'>
      <div className='flex items-center justify-between mb-3'>
        <span className='text-xs font-semibold text-gray-600 uppercase tracking-wide'>
          ts2_results — {count} rows{count > 200 ? ' (showing first 200)' : ''}
        </span>
        <button onClick={load} disabled={loading}
          className='rounded bg-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-300 disabled:opacity-50'>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {rows.length === 0
        ? <p className='text-xs text-gray-400'>Empty</p>
        : (
          <div className='overflow-x-auto max-h-96'>
            <table className='w-full text-xs font-mono'>
              <thead className='sticky top-0 bg-gray-50'>
                <tr className='border-b border-gray-200 text-left text-gray-500'>
                  <th className='pb-1 pr-4'>run_id</th>
                  <th className='pb-1 pr-4'>plid1</th>
                  <th className='pb-1 pr-4'>plid2</th>
                  <th className='pb-1'>score</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {rows.map((r, i) => (
                  <tr key={i} className='hover:bg-gray-100'>
                    <td className='py-0.5 pr-4 text-blue-600'>{r.s2_run_id}</td>
                    <td className='py-0.5 pr-4'>{r.s2_plid1}</td>
                    <td className='py-0.5 pr-4'>{r.s2_plid2}</td>
                    <td className='py-0.5'>{r.s2_score_value}</td>
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
