'use client'

import { useState } from 'react'
import HelpButton from './HelpButton'
import { HELP_RECALC_DATE_SEQ, HELP_AUDIT_AVERAGES } from './adminHelp'
import { auditAverages, type AuditCheck } from '@/src/lib/actions/audit'
import AuditResults from './AuditResults'

interface RecalcProgress { step?: string; processed: number; total: number; failed: number }
interface RecalcDone     { done: true; updated: number; failed: number }
interface OpResult       { updated?: number; error?: string }

const PLAYER_OPS  = ['truncate', 'A', 'B', 'C', 'all'] as const
const PARTNER_OPS = ['truncate', 'A', 'B', 'C', 'all'] as const

export default function PlayerRefresh() {
  // Date seq
  const [recalcDateSeq,  setRecalcDateSeq]  = useState(false)
  const [dateSeqSummary, setDateSeqSummary] = useState<RecalcDone | null>(null)
  const [dateSeqError,   setDateSeqError]   = useState<string | null>(null)

  // Player / partner stat ops
  const [running,   setRunning]   = useState<string | null>(null)
  const [opResults, setOpResults] = useState<Record<string, OpResult>>({})

  // Audit
  const [auditAvgResult,  setAuditAvgResult]  = useState<AuditCheck[] | null>(null)
  const [auditAvgRunning, setAuditAvgRunning] = useState(false)
  const [auditAvgError,   setAuditAvgError]   = useState<string | null>(null)

  // ── SSE reader ───────────────────────────────────────────────────────────────
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

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleRecalcDateSeq() {
    setRecalcDateSeq(true); setDateSeqSummary(null); setDateSeqError(null)
    try {
      const res = await fetch('/api/players/recalculate?mode=dateseq', { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setDateSeqError(d.error ?? 'Failed'); return }
      await readSSE<RecalcProgress, RecalcDone>(res, () => {}, evt => setDateSeqSummary(evt), msg => setDateSeqError(msg))
    } catch (err) { setDateSeqError(String(err)) }
    finally { setRecalcDateSeq(false) }
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

  async function handleAuditAverages() {
    setAuditAvgRunning(true); setAuditAvgError(null)
    try { setAuditAvgResult(await auditAverages()) }
    catch (err) { setAuditAvgError(String(err)) }
    finally { setAuditAvgRunning(false) }
  }

  const anyBusy = recalcDateSeq || running !== null

  function renderOp(prefix: 'player' | 'partner', grp: string) {
    const key = `${prefix}_${grp}`
    const isTruncate = grp === 'truncate'
    const isRunning  = running === key
    const result     = opResults[key]
    return (
      <div key={key} className='flex items-center gap-1.5'>
        <button
          onClick={() => handleOp(key, isTruncate ? `${prefix}_truncate` : `${prefix}_grp`, isTruncate ? undefined : grp)}
          disabled={anyBusy}
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

      {/* Recalculate */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Recalculate</h2>
        <p className='mb-3 text-xs text-gray-400'>Recompute averages, partnership stats and session date sequence from stored results.</p>
        <div className='space-y-4'>

          {/* Date seq */}
          <div>
            <div className='flex items-center gap-2'>
              <button onClick={handleRecalcDateSeq} disabled={anyBusy}
                className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
                {recalcDateSeq ? 'Recalculating…' : 'Recalculate Date Seq'}
              </button>
              <HelpButton>{HELP_RECALC_DATE_SEQ}</HelpButton>
            </div>
            {dateSeqError   && <div className='mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{dateSeqError}</div>}
            {dateSeqSummary && (
              <div className='mt-2 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800'>
                Done · Updated: <strong>{dateSeqSummary.updated}</strong> sessions
              </div>
            )}
          </div>

          {/* Player stats */}
          <div>
            <p className='mb-1.5 text-xs font-medium text-gray-600 uppercase tracking-wide'>Player Stats (ta1)</p>
            <div className='flex flex-wrap gap-2'>
              {PLAYER_OPS.map(grp => renderOp('player', grp))}
            </div>
          </div>

          {/* Partner stats */}
          <div>
            <p className='mb-1.5 text-xs font-medium text-gray-600 uppercase tracking-wide'>Partner Stats (ta2)</p>
            <div className='flex flex-wrap gap-2'>
              {PARTNER_OPS.map(grp => renderOp('partner', grp))}
            </div>
          </div>

          {/* Audit */}
          <div className='border-t border-gray-100 pt-3'>
            <div className='flex items-center gap-2'>
              <button onClick={handleAuditAverages} disabled={auditAvgRunning}
                className='rounded bg-amber-50 border border-amber-300 px-3 py-1.5 text-sm hover:bg-amber-100 disabled:opacity-50'>
                {auditAvgRunning ? 'Auditing…' : 'Audit'}
              </button>
              <HelpButton>{HELP_AUDIT_AVERAGES}</HelpButton>
            </div>
            <AuditResults checks={auditAvgResult} error={auditAvgError} />
          </div>

        </div>
      </section>

    </div>
  )
}
