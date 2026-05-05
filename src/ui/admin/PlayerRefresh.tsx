'use client'

import { useState } from 'react'
import HelpButton from './HelpButton'
import {
  HELP_RECALC_AVERAGES,
  HELP_RECALC_PARTNERSHIPS,
  HELP_RECALC_DATE_SEQ,
  HELP_AUDIT_AVERAGES,
} from './adminHelp'
import { auditAverages, type AuditCheck } from '@/src/lib/actions/audit'
import AuditResults from './AuditResults'

interface RecalcProgress { step?: string; processed: number; total: number; failed: number }
interface RecalcDone     { done: true; updated: number; failed: number }

export default function PlayerRefresh() {
  // Recalculate
  const [recalcAverages,   setRecalcAverages]   = useState(false)
  const [avgProgress,      setAvgProgress]      = useState<RecalcProgress | null>(null)
  const [avgSummary,       setAvgSummary]       = useState<RecalcDone | null>(null)
  const [avgError,         setAvgError]         = useState<string | null>(null)

  const [recalcPartners,   setRecalcPartners]   = useState(false)
  const [partnersProgress, setPartnersProgress] = useState<RecalcProgress | null>(null)
  const [partnersSummary,  setPartnersSummary]  = useState<RecalcDone | null>(null)
  const [partnersError,    setPartnersError]    = useState<string | null>(null)

  const [recalcDateSeq,    setRecalcDateSeq]    = useState(false)
  const [dateSeqSummary,   setDateSeqSummary]   = useState<RecalcDone | null>(null)
  const [dateSeqError,     setDateSeqError]     = useState<string | null>(null)

  // Audit
  const [auditAvgResult,   setAuditAvgResult]   = useState<AuditCheck[] | null>(null)
  const [auditAvgRunning,  setAuditAvgRunning]  = useState(false)
  const [auditAvgError,    setAuditAvgError]    = useState<string | null>(null)

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
  async function handleRecalcAverages() {
    setRecalcAverages(true); setAvgProgress(null); setAvgSummary(null); setAvgError(null)
    try {
      const res = await fetch('/api/players/recalculate?mode=averages', { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setAvgError(d.error ?? 'Failed'); return }
      await readSSE<RecalcProgress, RecalcDone>(
        res,
        evt => setAvgProgress(evt),
        evt => { setAvgSummary(evt); setAvgProgress(null) },
        msg => setAvgError(msg)
      )
    } catch (err) { setAvgError(String(err)) }
    finally { setRecalcAverages(false) }
  }

  async function handleRecalcPartners() {
    setRecalcPartners(true); setPartnersProgress(null); setPartnersSummary(null); setPartnersError(null)
    try {
      const res = await fetch('/api/players/recalculate?mode=partners', { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setPartnersError(d.error ?? 'Failed'); return }
      await readSSE<RecalcProgress, RecalcDone>(
        res,
        evt => setPartnersProgress(evt),
        evt => { setPartnersSummary(evt); setPartnersProgress(null) },
        msg => setPartnersError(msg)
      )
    } catch (err) { setPartnersError(String(err)) }
    finally { setRecalcPartners(false) }
  }

  async function handleRecalcDateSeq() {
    setRecalcDateSeq(true); setDateSeqSummary(null); setDateSeqError(null)
    try {
      const res = await fetch('/api/players/recalculate?mode=dateseq', { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setDateSeqError(d.error ?? 'Failed'); return }
      await readSSE<RecalcProgress, RecalcDone>(res, () => {}, evt => setDateSeqSummary(evt), msg => setDateSeqError(msg))
    } catch (err) { setDateSeqError(String(err)) }
    finally { setRecalcDateSeq(false) }
  }

  async function handleAuditAverages() {
    setAuditAvgRunning(true); setAuditAvgError(null)
    try { setAuditAvgResult(await auditAverages()) }
    catch (err) { setAuditAvgError(String(err)) }
    finally { setAuditAvgRunning(false) }
  }

  const anyRunning = recalcAverages || recalcPartners || recalcDateSeq

  return (
    <div className='space-y-4'>

      {/* Recalculate */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Recalculate</h2>
        <p className='mb-3 text-xs text-gray-400'>Recompute averages, partnership stats and session date sequence from stored results.</p>
        <div className='space-y-4'>
          <div>
            <div className='flex items-center gap-2'>
              <button onClick={handleRecalcAverages} disabled={anyRunning}
                className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
                {recalcAverages ? 'Recalculating…' : 'Recalculate Averages'}
              </button>
              <HelpButton>{HELP_RECALC_AVERAGES}</HelpButton>
            </div>
            {avgProgress && (
              <div className='mt-2 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800'>
                {avgProgress.step === 'counts' ? 'Session counts' : 'Averages'}: <strong>{avgProgress.processed}</strong> / <strong>{avgProgress.total}</strong>
                {avgProgress.failed > 0 && <> · Failed: <strong className='text-red-700'>{avgProgress.failed}</strong></>}
              </div>
            )}
            {avgError   && <div className='mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{avgError}</div>}
            {avgSummary && (
              <div className='mt-2 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800'>
                Done · Updated: <strong>{avgSummary.updated}</strong>
                {avgSummary.failed > 0 && <> · Failed: <strong className='text-red-700'>{avgSummary.failed}</strong></>}
              </div>
            )}
          </div>

          <div>
            <div className='flex items-center gap-2'>
              <button onClick={handleRecalcPartners} disabled={anyRunning}
                className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
                {recalcPartners ? 'Recalculating…' : 'Recalculate Partnerships'}
              </button>
              <HelpButton>{HELP_RECALC_PARTNERSHIPS}</HelpButton>
            </div>
            {partnersProgress && (
              <div className='mt-2 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800'>
                Partnerships: <strong>{partnersProgress.processed}</strong> / <strong>{partnersProgress.total}</strong>
                {partnersProgress.failed > 0 && <> · Failed: <strong className='text-red-700'>{partnersProgress.failed}</strong></>}
              </div>
            )}
            {partnersError   && <div className='mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{partnersError}</div>}
            {partnersSummary && (
              <div className='mt-2 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800'>
                Done · Updated: <strong>{partnersSummary.updated}</strong>
                {partnersSummary.failed > 0 && <> · Failed: <strong className='text-red-700'>{partnersSummary.failed}</strong></>}
              </div>
            )}
          </div>

          <div>
            <div className='flex items-center gap-2'>
              <button onClick={handleRecalcDateSeq} disabled={anyRunning}
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
