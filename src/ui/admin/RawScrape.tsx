'use client'

import { useState, useEffect } from 'react'
import StagingBar  from '@/src/ui/admin/StagingBar'
import PopulateTs2 from '@/src/ui/admin/PopulateTs2'

interface Staging { ts0: number; ts1: number; ts2: number }

type Source = 'club' | 'tracked' | 'both'

function StepHeading({ n, label, next }: { n: number; label: string; next?: boolean }) {
  return (
    <div className='flex items-center gap-2 mb-2'>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white shrink-0 ${next ? 'bg-green-600' : 'bg-gray-700'}`}>{n}</span>
      <span className={`text-sm font-semibold ${next ? 'text-green-700' : 'text-gray-700'}`}>{label}</span>
      {next && <span className='text-xs text-green-600 font-medium'>← next</span>}
    </div>
  )
}

export default function RawScrape() {
  // ── Staging ──
  const [staging,     setStaging]     = useState<Staging | null>(null)
  const [stagingBusy, setStagingBusy] = useState(false)

  async function loadStaging() {
    const res  = await fetch('/api/scrape/staging')
    const data = await res.json()
    setStaging(data)
  }

  async function truncateAll() {
    setStagingBusy(true)
    try {
      await fetch('/api/scrape/staging', { method: 'DELETE' })
      setStaging({ ts0: 0, ts1: 0, ts2: 0 })
      setTs1Count(null)
      setClubSummary(null)
      setTrackedSummary(null)
    } finally {
      setStagingBusy(false)
    }
  }

  const stagingEmpty = staging !== null && staging.ts0 === 0 && staging.ts1 === 0 && staging.ts2 === 0


  // ── Discover state ──
  const today = new Date().toISOString().slice(0, 10)
  const [dateFrom,  setDateFrom]  = useState(today)
  const [dateTo,    setDateTo]    = useState(today)
  const [source,    setSource]    = useState<Source>('club')
  const [busy,      setBusy]      = useState(false)
  const [progress,  setProgress]  = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [ts1Count,  setTs1Count]  = useState<number | null>(null)
  const [trackedCount, setTrackedCount] = useState(0)

  // per-source result summaries
  const [clubSummary,    setClubSummary]    = useState<{ found: number; inProd: number; missing: number } | null>(null)
  const [trackedSummary, setTrackedSummary] = useState<{ sessions: number } | null>(null)

  useEffect(() => {
    loadStaging()
    fetch('/api/admin/players')
      .then(r => r.json())
      .then((rows: { pl_all_results: boolean }[]) =>
        setTrackedCount(rows.filter(p => p.pl_all_results).length)
      )
  }, [])

  async function readSSE(
    body: ReadableStream<Uint8Array>,
    onEvent: (evt: Record<string, unknown>) => 'done' | void
  ): Promise<void> {
    const reader  = body.getReader()
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
            const evt = JSON.parse(line.slice(6)) as Record<string, unknown>
            if (onEvent(evt) === 'done') return
          } catch { /* skip malformed */ }
        }
      }
      if (done) break
    }
  }

  async function handleDiscoverWith(src: Source) {
    setBusy(true); setError(null); setProgress(null)
    setTs1Count(null); setClubSummary(null); setTrackedSummary(null)
    let total = 0
    let failed = false

    try {
      // ── Club ──
      if (src === 'club' || src === 'both') {
        const res = await fetch('/api/scrape/discover/nzb-by-date', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date_from: dateFrom, date_end: dateTo, club_id: 106 })
        })
        if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return }

        await readSSE(res.body!, evt => {
          if (evt.error) { failed = true; setError(String(evt.error)); return 'done' }
          if (evt.done) {
            const missing = (evt.total_missing as number) ?? 0
            total += missing
            setClubSummary({ found: evt.total_found as number, inProd: evt.total_in_prod as number, missing })
            return 'done'
          }
          if (evt.found !== undefined) setProgress(`Club ${evt.date}: ${evt.found} found · ${evt.missing} missing`)
          else if (evt.date) setProgress(`Club: checking ${evt.date}…`)
        })

        if (failed) return
      }

      // ── Tracked Players ──
      if (src === 'tracked' || src === 'both') {
        const res = await fetch('/api/scrape/discover/nzb-by-flagged', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date_from: dateFrom, date_end: dateTo, skip_truncate: src === 'both' })
        })
        if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); return }

        await readSSE(res.body!, evt => {
          if (evt.error) { failed = true; setError(String(evt.error)); return 'done' }
          if (evt.done) {
            const sessions = (evt.total_sessions as number) ?? 0
            total += sessions
            setTrackedSummary({ sessions })
            return 'done'
          }
          if (evt.found !== undefined) setProgress(`${evt.player}: ${evt.found} found · ${evt.missing} missing`)
          else if (evt.run_id && evt.added)   setProgress(`run_id ${evt.run_id} · added to ts1`)
          else if (evt.run_id && evt.skipped) setProgress(`run_id ${evt.run_id} · skipped`)
          else if (evt.run_id) setProgress(`Checking run_id ${evt.run_id}…`)
          else if (evt.player) setProgress(`Checking ${String(evt.player)}…`)
        })

        if (failed) return
      }

      setTs1Count(total)
      setProgress(null)
      loadStaging()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const suggestedStep = staging === null ? null
    : staging.ts1 > 0 && staging.ts2 === 0 ? 3
    : staging.ts1 === 0 && staging.ts2 === 0 ? 2
    : null

  const sourceLabel = (s: Source) => ({
    club:    `Club (106)`,
    tracked: `Tracked players (${trackedCount})`,
    both:    'Both',
  })[s]

  return (
    <div className='space-y-6 max-w-2xl'>

      {/* ── 1 — Truncate ── */}
      <div>
        <StepHeading n={1} label='Truncate staging tables' />
        <StagingBar staging={staging} busy={stagingBusy} onTruncate={truncateAll} />
      </div>

      {/* ── 2 — Scrape sessions → ts1 ── */}
      <div>
        <StepHeading n={2} label='Discover missing sessions → ts1' next={suggestedStep === 2} />
        <section className='rounded border border-amber-100 bg-amber-50 p-4 space-y-4'>

          {/* Shared date range */}
          <div className='flex gap-3 items-end flex-wrap'>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Date from</label>
              <input type='date' value={dateFrom} min='2021-01-01' max={today}
                onChange={e => setDateFrom(e.target.value)}
                className='rounded border border-gray-300 bg-white px-2 py-1 text-sm' />
            </div>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Date to</label>
              <input type='date' value={dateTo} min='2021-01-01' max={today}
                onChange={e => setDateTo(e.target.value)}
                className='rounded border border-gray-300 bg-white px-2 py-1 text-sm' />
            </div>
          </div>

          {/* Source action buttons */}
          <div className='flex gap-2 flex-wrap'>
            {(['club', 'tracked', 'both'] as Source[]).map(s => (
              <button key={s}
                onClick={() => { setSource(s); handleDiscoverWith(s) }}
                disabled={busy || !dateFrom || !dateTo || !stagingEmpty}
                className='rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50'>
                {busy && source === s ? 'Discovering…' : sourceLabel(s)}
              </button>
            ))}
          </div>

          {progress && <p className='text-sm text-amber-700 font-mono'>{progress}</p>}
          {error    && <p className='text-sm text-red-600'>{error}</p>}

          {/* Results */}
          {clubSummary && (
            <p className='text-sm text-gray-800'>
              Club: {clubSummary.found} found · {clubSummary.inProd} in prod ·{' '}
              <span className={clubSummary.missing > 0 ? 'text-red-600 font-semibold' : 'text-green-700 font-medium'}>
                {clubSummary.missing === 0 ? 'Up to Date' : `${clubSummary.missing} to be added`}
              </span>
            </p>
          )}
          {trackedSummary && (
            <p className='text-sm text-gray-800'>
              Tracked players:{' '}
              <span className={trackedSummary.sessions > 0 ? 'text-red-600 font-semibold' : 'text-green-700 font-medium'}>
                {trackedSummary.sessions === 0 ? 'Up to Date' : `${trackedSummary.sessions} sessions to be added`}
              </span>
            </p>
          )}

        </section>
      </div>

      {/* ── 3 — Build ts2 ── show when ts1 has rows ── */}
      {(staging !== null && staging.ts1 > 0) && (
        <div>
          <StepHeading n={3} label='Scrape results → ts2' next={suggestedStep === 3} />
          <PopulateTs2 ts1Count={ts1Count ?? staging?.ts1 ?? 0} source={source} onDone={() => { loadStaging() }} />
        </div>
      )}


    </div>
  )
}
