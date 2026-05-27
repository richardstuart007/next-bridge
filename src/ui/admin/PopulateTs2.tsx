'use client'

import { useState } from 'react'

interface Result {
  run_ids_total: number
  pairs_inserted: number
  players_created: number
  skipped_rows: number
}

export default function PopulateTs2({ ts1Count, source, onDone }: { ts1Count: number; source: string; onDone: () => void }) {
  const [busy,     setBusy]     = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [result,   setResult]   = useState<Result | null>(null)
  const [done,     setDone]     = useState(false)

  async function run() {
    setBusy(true); setError(null); setProgress(null); setResult(null); setDone(false)
    try {
      const res = await fetch('/api/scrape/raw/nzb-from-ts1sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return }
      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (value?.length) {
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const evt = JSON.parse(line.slice(6))
              if (evt.error)   { setError(evt.error); return }
              if (evt.done)    { setResult(evt as Result); setProgress(null); setDone(true); onDone() }
              else if (evt.inserted) setProgress(`run_id ${evt.run_id} · ${evt.pairs} pairs`)
              else if (evt.skipped)  setProgress(`run_id ${evt.run_id} · skipped`)
              else if (evt.run_id)   setProgress(`Fetching run_id ${evt.run_id}…`)
            } catch { /* skip malformed */ }
          }
        }
        if (streamDone) break
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className='rounded border border-amber-200 bg-amber-50 p-4'>
      <h3 className='text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3'>
        Scrape results → ts2
      </h3>
      <button onClick={run} disabled={busy || done}
        className='rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50'>
        {busy ? 'Populating ts2…' : `Step 2: Populate ts2_results for ${ts1Count} sessions in ts1`}
      </button>
      {progress && <p className='mt-2 text-sm text-amber-700 font-mono'>{progress}</p>}
      {error   && <p className='mt-2 text-sm text-red-600'>{error}</p>}
      {result  && (
        <p className='mt-2 text-sm text-green-700'>
          {result.run_ids_total} sessions · {result.pairs_inserted} pairs inserted
          {result.players_created > 0 ? ` · ${result.players_created} new players` : ''}
          {result.skipped_rows > 0 ? ` · ${result.skipped_rows} rows skipped` : ''}
        </p>
      )}
    </section>
  )
}
