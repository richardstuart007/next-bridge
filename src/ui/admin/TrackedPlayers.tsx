'use client'

//==============================================================================================
//  1) DESCRIPTION
//    TrackedPlayers — an indigo panel on the pipeline/players admin UI that shows the tracked-
//    player count and runs the nzb-by-flagged discovery scrape for a chosen date range,
//    streaming progress and reporting how many sessions were added to ts1_sessions.
//
//    Parameters:
//      stagingEmpty    — Discover is disabled unless staging is empty
//      onDiscoveryDone — called with the total sessions added once discovery completes
//==============================================================================================

import { useState, useEffect } from 'react'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'

interface Props {
  stagingEmpty: boolean
  onDiscoveryDone: (count: number) => void
}

export default function TrackedPlayers({ stagingEmpty, onDiscoveryDone }: Props) {
  const [trackedCount, setTrackedCount] = useState(0)
  const [dateFrom,     setDateFrom]     = useState(new Date().toISOString().slice(0, 10))
  const [dateTo,       setDateTo]       = useState(new Date().toISOString().slice(0, 10))
  const [busy,         setBusy]         = useState(false)
  const [progress,     setProgress]     = useState<string | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [ts1Count,     setTs1Count]     = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/admin/players')
      .then(r => r.json())
      .then((rows: { pl_tracked: boolean }[]) =>
        setTrackedCount(rows.filter(p => p.pl_tracked).length)
      )
  }, [])

  //----------------------------------------------------------------------------------------------
  //  handleDiscover — POSTs to /api/scrape/discover/nzb-by-flagged and consumes its SSE stream,
  //  updating `progress` per event and `ts1Count` (+ onDiscoveryDone) when it completes
  //----------------------------------------------------------------------------------------------
  async function handleDiscover() {
    setBusy(true); setError(null); setProgress(null); setTs1Count(null)
    try {
      const res = await fetch('/api/scrape/discover/nzb-by-flagged', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: dateFrom, date_end: dateTo })
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return }
      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (value?.length) {
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const evt = JSON.parse(line.slice(6))
              if (evt.error) { setError(evt.error); return }
              if (evt.done)  { setTs1Count(evt.total_sessions); setProgress(null); onDiscoveryDone(evt.total_sessions) }
              else if (evt.found !== undefined) setProgress(`${evt.player}: ${evt.found} found · ${evt.missing} missing`)
              else if (evt.run_id && evt.added)   setProgress(`run_id ${evt.run_id} · added to ts1`)
              else if (evt.run_id && evt.skipped) setProgress(`run_id ${evt.run_id} · skipped`)
              else if (evt.run_id) setProgress(`Checking run_id ${evt.run_id}…`)
              else if (evt.player) setProgress(`Checking ${evt.player}…`)
            } catch { /* skip malformed */ }
          }
        }
        if (done) break
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <section className='rounded border border-indigo-100 bg-indigo-50 p-4'>
      <p className='text-xs font-semibold text-indigo-700 mb-3'>Tracked players ({trackedCount})</p>
      <div className='flex gap-3 items-end flex-wrap mb-3'>
        <div>
          <label className='text-xs text-gray-500 block mb-1'>Date from</label>
          <MyInput type='date' value={dateFrom} min='2021-01-01' max={today}
            onChange={e => setDateFrom(e.target.value)}
            overrideClass='rounded border border-gray-300 bg-white px-2 py-1 text-sm h-auto md:h-auto' />
        </div>
        <div>
          <label className='text-xs text-gray-500 block mb-1'>Date to</label>
          <MyInput type='date' value={dateTo} min='2021-01-01' max={today}
            onChange={e => setDateTo(e.target.value)}
            overrideClass='rounded border border-gray-300 bg-white px-2 py-1 text-sm h-auto md:h-auto' />
        </div>
        <MyButton onClick={handleDiscover} disabled={busy || trackedCount === 0 || !dateFrom || !dateTo || !stagingEmpty}
          overrideClass='rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 h-auto md:h-auto'>
          {busy ? 'Discovering…' : 'Discover'}
        </MyButton>
      </div>
      {progress  && <p className='text-sm text-indigo-700 font-mono'>{progress}</p>}
      {error     && <p className='text-sm text-red-600'>{error}</p>}
      {ts1Count !== null && (
        ts1Count === 0
          ? <p className='text-sm text-green-700 font-medium'>Up to Date</p>
          : <p className='text-sm text-gray-800'>{ts1Count} sessions added to ts1</p>
      )}
    </section>
  )
}
