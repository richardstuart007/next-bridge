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
  if (result.error) return <p className='text-red-600 text-sm mt-1'>Error: {result.error}</p>
  return (
    <p className='text-green-700 text-sm mt-1'>
      {Object.entries(result.data ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}
    </p>
  )
}

const STEPS = [
  { key: 'sessions-nzb', label: 'A — ts1 → tse_sessions', url: '/api/build/sessions-nzb', desc: 'ts1_sessions → tse_sessions (skip existing)' },
  { key: 'results-nzb',  label: 'B — ts2 → tre_results',  url: '/api/build/results-nzb',  desc: 'ts2_results → tre_results' },
  { key: 'partners',     label: 'C — Build Partnerships',  url: '/api/build/partners',     desc: 'tpa_partners + re_paid linkage from tre_results' },
]

export default function BuildTables() {
  const [results, setResults] = useState<Record<string, StepResult>>({})
  const [running, setRunning] = useState<string | null>(null)

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

  async function runAll() {
    for (const step of STEPS) {
      await run(step.key, step.url)
    }
  }

  return (
    <div className='space-y-4 max-w-2xl'>
      <div className='flex items-center gap-3 mb-6'>
        <button onClick={runAll} disabled={running !== null}
          className='rounded bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50'>
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
            <button onClick={() => run(step.key, step.url)} disabled={running !== null}
              className='shrink-0 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50'>
              {running === step.key ? 'Running…' : 'Run'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
