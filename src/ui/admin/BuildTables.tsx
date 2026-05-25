'use client'

import { useState } from 'react'

interface StepResult {
  label: string
  data: Record<string, unknown> | null
  error: string | null
}

async function runStep(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: 'POST' })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json
}

function ResultRow({ result }: { result: StepResult }) {
  if (!result.data && !result.error) return null
  if (result.error) {
    return <p className='text-red-600 text-sm mt-1'>Error: {result.error}</p>
  }
  const entries = Object.entries(result.data ?? {})
  return (
    <p className='text-green-700 text-sm mt-1'>
      {entries.map(([k, v]) => `${k}: ${v}`).join(' · ')}
    </p>
  )
}

const STEPS = [
  { key: 'sessions-nzb', label: 'Step 1 — Build Sessions (NZB)',  url: '/api/build/sessions-nzb', desc: 'ts9 run_ids → tse_sessions (skip existing)' },
  { key: 'results-nzb',  label: 'Step 2 — Build Results (NZB)',   url: '/api/build/results-nzb',  desc: 'ts9 pairs → tre_results (incremental, both directions)' },
  { key: 'cleanup',      label: 'Step 3 — Cleanup Bad Results',   url: '/api/build/cleanup',      desc: 'Delete tre_results rows with negative percentage' },
  { key: 'partners',     label: 'Step 4 — Build Partnerships',    url: '/api/build/partners',     desc: 'Incremental: sessions where se_partners_built = false → update affected pairs only' },
]

export default function BuildTables() {
  const [results, setResults] = useState<Record<string, StepResult>>({})
  const [running, setRunning] = useState<string | null>(null)

  const [testBusy,  setTestBusy]  = useState(false)
  const [testLog,   setTestLog]   = useState<string[] | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  async function runBackfillTest() {
    setTestBusy(true); setTestLog(null); setTestError(null)
    try {
      const res = await fetch('/api/admin/backfill-finals/test', { method: 'POST' })
      const data = await res.json()
      setTestLog(data.log ?? [])
      if (data.error) setTestError(data.error)
    } catch (err) {
      setTestError(String(err))
    } finally {
      setTestBusy(false)
    }
  }

  const [bfBusy,     setBfBusy]     = useState(false)
  const [bfProgress, setBfProgress] = useState<string | null>(null)
  const [bfResult,   setBfResult]   = useState<{ processed: number; finals_found: number; failed: number; total: number; remaining: number } | null>(null)
  const [bfError,    setBfError]    = useState<string | null>(null)
  const [bfLimit,    setBfLimit]    = useState(500)

  async function runBackfillFinals() {
    setBfBusy(true); setBfError(null); setBfResult(null); setBfProgress('Starting…')
    try {
      const res = await fetch('/api/admin/backfill-finals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: bfLimit })
      })
      if (!res.ok) { const d = await res.json(); setBfError(d.error ?? 'Failed'); return }
      const reader = res.body!.getReader()
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
              if (evt.error) { setBfError(evt.error); return }
              if (evt.done) {
                setBfResult(evt); setBfProgress(null)
                window.alert(`Batch done — ${evt.processed} processed · ${evt.finals_found} finals · ${evt.remaining} remaining`)
              }
              else if (evt.total !== undefined) setBfProgress(`0 / ${evt.total} sessions to check…`)
              else if (evt.status) setBfProgress(evt.status)
              else if (evt.processed !== undefined) setBfProgress(`${evt.processed} / ${evt.total} processed · ${evt.finals_found} finals found`)
            } catch { /* skip malformed */ }
          }
        }
        if (done) break
      }
    } catch (err) {
      setBfError(String(err))
    } finally {
      setBfBusy(false)
    }
  }

  async function runAll() {
    for (const step of STEPS) {
      await run(step.key, step.url)
    }
  }

  async function run(key: string, url: string) {
    setRunning(key)
    try {
      const data = await runStep(url)
      setResults(prev => ({ ...prev, [key]: { label: key, data, error: null } }))
    } catch (err) {
      setResults(prev => ({ ...prev, [key]: { label: key, data: null, error: String(err) } }))
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className='space-y-4 max-w-2xl'>
      <div className='flex items-center gap-3 mb-6'>
        <button
          onClick={runAll}
          disabled={running !== null}
          className='rounded bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50'
        >
          {running ? 'Running…' : 'Run All Steps'}
        </button>
        <span className='text-sm text-gray-500'>or run individual steps below</span>
      </div>

      {STEPS.map(step => (
        <div key={step.key} className='border border-gray-200 rounded-lg p-4'>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <p className='font-medium text-gray-900 text-sm'>{step.label}</p>
              <p className='text-xs text-gray-400 mt-0.5'>{step.desc}</p>
              <ResultRow result={results[step.key] ?? { label: step.key, data: null, error: null }} />
            </div>
            <button
              onClick={() => run(step.key, step.url)}
              disabled={running !== null}
              className='shrink-0 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50'
            >
              {running === step.key ? 'Running…' : 'Run'}
            </button>
          </div>
        </div>
      ))}

      <div className='border border-blue-200 rounded-lg p-4 mt-6'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex-1'>
            <p className='font-medium text-gray-900 text-sm'>Test Final Flag (3 ANZAC run_ids)</p>
            <p className='text-xs text-gray-400 mt-0.5'>
              Resets run_ids 230346 / 230352 / 230353 to NULL, fetches 2026-04-25 club page, applies flags, shows debug log.
            </p>
            {testError && <p className='text-xs text-red-600 mt-1'>Error: {testError}</p>}
            {testLog && (
              <pre className='mt-2 text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre-wrap'>
                {testLog.join('\n')}
              </pre>
            )}
          </div>
          <button
            onClick={runBackfillTest}
            disabled={testBusy || running !== null || bfBusy}
            className='shrink-0 rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm hover:bg-blue-100 disabled:opacity-50'
          >
            {testBusy ? 'Running…' : 'Test'}
          </button>
        </div>
      </div>

      <div className='border border-amber-200 rounded-lg p-4 mt-6'>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <p className='font-medium text-gray-900 text-sm'>Backfill Summary Flags</p>
            <p className='text-xs text-gray-400 mt-0.5'>
              Fetches NZ Bridge club page for every session date and marks sessions where Session = &quot;Final&quot; in the HTML.
              Run once after adding the <code className='bg-gray-100 px-1 rounded'>se_is_summary</code> column.
            </p>
            {bfProgress && <p className='text-xs text-blue-600 mt-1'>{bfProgress}</p>}
            {bfError    && <p className='text-xs text-red-600 mt-1'>Error: {bfError}</p>}
            {bfResult   && (
              <p className='text-xs text-green-700 mt-1'>
                Done — {bfResult.processed} processed · {bfResult.finals_found} finals · {bfResult.failed} failed · <strong>{bfResult.remaining} remaining</strong>
              </p>
            )}
          </div>
          <div className='flex items-center gap-2 shrink-0'>
            <input
              type='number' value={bfLimit} min={10} max={2000} step={100}
              onChange={e => setBfLimit(parseInt(e.target.value, 10))}
              disabled={bfBusy}
              className='w-20 rounded border border-gray-300 px-1.5 py-1 text-xs text-center'
            />
            <button
              onClick={runBackfillFinals}
              disabled={bfBusy || running !== null}
              className='rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm hover:bg-amber-100 disabled:opacity-50'
            >
              {bfBusy ? 'Running…' : 'Run'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
