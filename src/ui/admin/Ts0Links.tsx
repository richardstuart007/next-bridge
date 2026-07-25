'use client'

import { useState, useEffect } from 'react'
import { MyButton } from 'nextjs-shared/MyButton'

interface Ts0Row { s0_s0id: number; s0_run_id: number; s0_source: string; s0_url: string }

export default function Ts0Links() {
  const [links,   setLinks]   = useState<Ts0Row[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch('/api/scrape/ts0')
      const rows = await res.json()
      setLinks(Array.isArray(rows) ? rows : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <section className='rounded border border-gray-200 bg-gray-50 p-4'>
      <div className='flex items-center justify-between mb-2'>
        <h3 className='text-xs font-semibold text-gray-600 uppercase tracking-wide'>
          ts0_scraped — Last Scraped URLs
        </h3>
        <MyButton onClick={load} disabled={loading}
          overrideClass='rounded bg-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-300 disabled:opacity-50 h-auto md:h-auto'>
          {loading ? 'Loading…' : 'Refresh'}
        </MyButton>
      </div>
      {links.length === 0
        ? <p className='text-xs text-gray-400'>No URLs recorded — run Step 1 then Step 2.</p>
        : (
          <div className='max-h-64 overflow-y-auto space-y-0.5'>
            {links.map(r => (
              <div key={r.s0_s0id} className='flex gap-2 text-xs font-mono min-w-0'>
                <span className='text-gray-400 shrink-0'>
                  {r.s0_run_id === 0 ? r.s0_source : `${r.s0_source} run_id ${r.s0_run_id}`}
                </span>
                <a href={r.s0_url} target='_blank' rel='noreferrer'
                  className='text-blue-600 hover:underline truncate min-w-0'>
                  {r.s0_url}
                </a>
              </div>
            ))}
          </div>
        )
      }
    </section>
  )
}
