'use client'

import { useState } from 'react'

interface RecalcProgress { step?: string; processed: number; total: number; failed: number }
interface RecalcDone     { done: true; updated: number; failed: number }
interface OpResult       { updated?: number; error?: string }

const PLAYER_OPS  = ['truncate', 'A', 'B', 'C', 'all'] as const
const PARTNER_OPS = ['truncate', 'A', 'B', 'C', 'all'] as const

export default function PlayerRefresh() {
  const [running,   setRunning]   = useState<string | null>(null)
  const [opResults, setOpResults] = useState<Record<string, OpResult>>({})

  async function readSSE<P, D>(
    res: Response,
    onProgress: (evt: P) => void,
    onDone: (evt: D) => void,
    onError: (msg: string) => void
  ) {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const evt = JSON.parse(line.slice(6))
          if (evt.error) { onError(evt.error); return }
          if (evt.done)  { onDone(evt as D); return }
          onProgress(evt as P)
        } catch { /* skip malformed */ }
      }
    }
  }

  async function handleOp(key: string, apiMode: string, apiGrp?: string) {
    setRunning(key)
    setOpResults(r => { const n = { ...r }; delete n[key]; return n })
    try {
      const url = `/api/players/recalculate?mode=${apiMode}${apiGrp ? `&grp=${apiGrp}` : ''}`
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json()
        setOpResults(r => ({ ...r, [key]: { error: d.error ?? 'Failed' } }))
        return
      }
      await readSSE<RecalcProgress, RecalcDone>(
        res,
        () => {},
        evt => setOpResults(r => ({ ...r, [key]: { updated: evt.updated } })),
        msg => setOpResults(r => ({ ...r, [key]: { error: msg } }))
      )
    } catch (err) {
      setOpResults(r => ({ ...r, [key]: { error: String(err) } }))
    } finally {
      setRunning(null)
    }
  }

  function renderOp(prefix: 'player' | 'partner', grp: string) {
    const key = `${prefix}_${grp}`
    const isTruncate = grp === 'truncate'
    const isRunning  = running === key
    const result     = opResults[key]
    return (
      <div key={key} className='flex items-center gap-1.5'>
        <button
          onClick={() => handleOp(key, isTruncate ? `${prefix}_truncate` : `${prefix}_grp`, isTruncate ? undefined : grp)}
          disabled={running !== null}
          className={`rounded border px-3 py-1.5 text-sm disabled:opacity-50 ${
            isTruncate
              ? 'border-red-300 bg-red-50 hover:bg-red-100'
              : 'border-gray-300 bg-gray-100 hover:bg-gray-200'
          }`}
        >
          {isRunning ? '…' : isTruncate ? 'Truncate' : grp === 'all' ? 'All' : `Group ${grp}`}
        </button>
        {result?.updated !== undefined && (
          <span className='text-xs text-green-700'>
            {isTruncate ? 'cleared' : `${result.updated} rows`}
          </span>
        )}
        {result?.error && (
          <span className='text-xs text-red-600'>{result.error}</span>
        )}
      </div>
    )
  }

  return (
    <div className='space-y-4'>

      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Recalculate</h2>
        <p className='mb-3 text-xs text-gray-400'>Recompute averages and partnership stats from stored results.</p>
        <div className='space-y-4'>

          <div>
            <p className='mb-1.5 text-xs font-medium text-gray-600 uppercase tracking-wide'>Player Stats (ta1)</p>
            <div className='flex flex-wrap gap-2'>
              {PLAYER_OPS.map(grp => renderOp('player', grp))}
            </div>
          </div>

          <div>
            <p className='mb-1.5 text-xs font-medium text-gray-600 uppercase tracking-wide'>Partner Stats (ta2)</p>
            <div className='flex flex-wrap gap-2'>
              {PARTNER_OPS.map(grp => renderOp('partner', grp))}
            </div>
          </div>

        </div>
      </section>

    </div>
  )
}
