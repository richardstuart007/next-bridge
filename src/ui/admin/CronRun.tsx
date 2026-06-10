'use client'

import { useState } from 'react'

interface CronSummary {
  from_date:       string
  to_date:         string
  run_ids_new:     number
  pairs_total:     number
  players_created: number
  sessions_built:  number
  results_built:   number
  partner_pairs:   number
}

export default function CronRun() {
  const [running, setRunning] = useState(false)
  const [result,  setResult]  = useState<CronSummary | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  //----------------------------------------------------------------------------------------------
  //  handleRun — calls the cron endpoint and displays the summary result
  //----------------------------------------------------------------------------------------------
  async function handleRun() {
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const res  = await fetch('/api/cron/update-sessions')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
      } else {
        setResult(data as CronSummary)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className='space-y-4'>

      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Full Pipeline Run</h2>
        <p className='mb-3 text-xs text-gray-400'>
          Discover new sessions, scrape results, build production tables, and recompute stats —
          equivalent to steps 1 → 2 → 3 in sequence.
        </p>
        <button
          onClick={handleRun}
          disabled={running}
          className='rounded border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50'
        >
          {running ? 'Running…' : 'Run Full Pipeline'}
        </button>
        {running && (
          <p className='mt-3 text-xs text-gray-500'>This may take a minute or two — scraping all new sessions…</p>
        )}
      </section>

      {error && (
        <section className='rounded border border-red-200 bg-red-50 p-4'>
          <p className='text-sm font-medium text-red-700'>{error}</p>
        </section>
      )}

      {result && (
        <section className='rounded border border-green-200 bg-green-50 p-4'>
          <h2 className='mb-3 text-base font-semibold text-green-800'>Done</h2>
          <dl className='grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3'>
            <div>
              <dt className='text-xs text-gray-500'>Date range</dt>
              <dd className='font-medium text-gray-800'>{result.from_date} → {result.to_date}</dd>
            </div>
            <div>
              <dt className='text-xs text-gray-500'>New run_ids</dt>
              <dd className='font-medium text-gray-800'>{result.run_ids_new}</dd>
            </div>
            <div>
              <dt className='text-xs text-gray-500'>Pairs scraped</dt>
              <dd className='font-medium text-gray-800'>{result.pairs_total}</dd>
            </div>
            <div>
              <dt className='text-xs text-gray-500'>New players</dt>
              <dd className='font-medium text-gray-800'>{result.players_created}</dd>
            </div>
            <div>
              <dt className='text-xs text-gray-500'>Sessions built</dt>
              <dd className='font-medium text-gray-800'>{result.sessions_built}</dd>
            </div>
            <div>
              <dt className='text-xs text-gray-500'>Results built</dt>
              <dd className='font-medium text-gray-800'>{result.results_built}</dd>
            </div>
            <div>
              <dt className='text-xs text-gray-500'>Partner pairs</dt>
              <dd className='font-medium text-gray-800'>{result.partner_pairs}</dd>
            </div>
          </dl>
        </section>
      )}

    </div>
  )
}
