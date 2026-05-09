'use client'

import { useState } from 'react'
import TrackedPlayers from '@/src/ui/admin/TrackedPlayers'

interface DiscoverResult {
  total_found: number
  total_in_prod: number
  total_missing: number
  missing: { date: string; run_id: number }[]
}

const TAB_CLS     = 'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors'
const TAB_ACTIVE  = 'border-blue-600 text-blue-600'
const TAB_PASSIVE = 'border-transparent text-gray-500 hover:text-gray-700'

export default function RawScrape() {
  const [activeTab, setActiveTab] = useState<'club' | 'player'>('club')

  // ── Club Results state ──
  const [chkClubId,    setChkClubId]    = useState(106)
  const [chkDateFrom,  setChkDateFrom]  = useState('2024-01-01')
  const [chkDateTo,    setChkDateTo]    = useState(new Date().toISOString().slice(0, 10))
  const [chkBusy,      setChkBusy]      = useState(false)
  const [chkError,     setChkError]     = useState<string | null>(null)
  const [chkResult,    setChkResult]    = useState<DiscoverResult | null>(null)
  const [chkProgress,  setChkProgress]  = useState<string | null>(null)
  const [chkImpBusy,   setChkImpBusy]   = useState(false)
  const [chkImpError,  setChkImpError]  = useState<string | null>(null)
  const [chkImpProg,   setChkImpProg]   = useState<string | null>(null)
  const [chkImpResult, setChkImpResult] = useState<{ run_ids_total: number; pairs_inserted: number; players_created: number; skipped_rows: number } | null>(null)

  // ── Player Results state ──
  const [plyrNzb,     setPlyrNzb]     = useState('')
  const [plyrBusy,    setPlyrBusy]    = useState(false)
  const [plyrError,   setPlyrError]   = useState<string | null>(null)
  const [plyrMissing, setPlyrMissing] = useState<number[] | null>(null)
  const [plyrFound,   setPlyrFound]   = useState<{ total_found: number; total_in_prod: number; total_missing: number } | null>(null)
  const [impBusy,     setImpBusy]     = useState(false)
  const [impError,    setImpError]    = useState<string | null>(null)
  const [impProgress, setImpProgress] = useState<string | null>(null)
  const [impResult,   setImpResult]   = useState<{ run_ids_total: number; pairs_inserted: number; players_created: number; skipped_rows: number } | null>(null)

  async function handleDiscover() {
    setChkBusy(true); setChkError(null); setChkResult(null); setChkProgress(null)
    try {
      const res = await fetch('/api/scrape/discover/nzb-by-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: chkDateFrom, date_end: chkDateTo, club_id: chkClubId })
      })
      if (!res.ok) { const d = await res.json(); setChkError(d.error ?? 'Failed'); return }

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
              if (evt.error) { setChkError(evt.error); return }
              if (evt.done) { setChkResult(evt as DiscoverResult); setChkProgress(null) }
              else if (evt.found !== undefined) setChkProgress(`${evt.date}: ${evt.found} found · ${evt.missing} missing`)
              else if (evt.date) setChkProgress(`Checking ${evt.date}…`)
            } catch { /* skip malformed */ }
          }
        }
        if (done) break
      }
    } catch (err) {
      setChkError(String(err))
    } finally {
      setChkBusy(false)
    }
  }

  async function handleChkImport() {
    if (!chkResult || chkResult.missing.length === 0) return
    setChkImpBusy(true); setChkImpError(null); setChkImpProg(null); setChkImpResult(null)
    try {
      const res = await fetch('/api/scrape/raw/nzb-from-ts10', { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setChkImpError(d.error ?? 'Failed'); return }

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
              if (evt.error) { setChkImpError(evt.error); return }
              if (evt.done) { setChkImpResult(evt); setChkImpProg(null) }
              else if (evt.inserted) setChkImpProg(`run_id ${evt.run_id} · ${evt.pairs} pairs`)
              else if (evt.skipped)  setChkImpProg(`run_id ${evt.run_id} · skipped`)
              else if (evt.run_id)   setChkImpProg(`Fetching run_id ${evt.run_id}…`)
            } catch { /* skip malformed */ }
          }
        }
        if (done) break
      }
    } catch (err) {
      setChkImpError(String(err))
    } finally {
      setChkImpBusy(false)
    }
  }

  async function handlePlayerCheck() {
    setPlyrBusy(true); setPlyrError(null); setPlyrMissing(null); setPlyrFound(null)
    setImpError(null); setImpProgress(null); setImpResult(null)
    try {
      const res = await fetch('/api/scrape/discover/nzb-by-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nz_bridge_number: parseInt(plyrNzb, 10) })
      })
      const data = await res.json()
      if (!res.ok || data.error) { setPlyrError(data.error ?? 'Failed'); return }
      setPlyrFound({ total_found: data.total_found, total_in_prod: data.total_in_prod, total_missing: data.total_missing })
      setPlyrMissing(data.missing)
    } catch (err) {
      setPlyrError(String(err))
    } finally {
      setPlyrBusy(false)
    }
  }

  async function handlePlayerImport() {
    if (!plyrMissing || plyrMissing.length === 0) return
    setImpBusy(true); setImpError(null); setImpProgress(null); setImpResult(null)
    try {
      const res = await fetch('/api/scrape/raw/nzb-by-runid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_ids: plyrMissing })
      })
      if (!res.ok) { const d = await res.json(); setImpError(d.error ?? 'Failed'); return }

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
              if (evt.error) { setImpError(evt.error); return }
              if (evt.done) { setImpResult(evt); setImpProgress(null) }
              else if (evt.inserted) setImpProgress(`run_id ${evt.run_id} · ${evt.pairs} pairs inserted`)
              else if (evt.skipped)  setImpProgress(`run_id ${evt.run_id} · skipped`)
              else if (evt.run_id)   setImpProgress(`Fetching run_id ${evt.run_id}…`)
            } catch { /* skip malformed */ }
          }
        }
        if (done) break
      }
    } catch (err) {
      setImpError(String(err))
    } finally {
      setImpBusy(false)
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className='space-y-4'>
      {/* Tabs */}
      <div className='flex gap-0 border-b border-gray-200'>
        <button onClick={() => setActiveTab('club')} className={`${TAB_CLS} ${activeTab === 'club' ? TAB_ACTIVE : TAB_PASSIVE}`}>
          Club Results
        </button>
        <button onClick={() => setActiveTab('player')} className={`${TAB_CLS} ${activeTab === 'player' ? TAB_ACTIVE : TAB_PASSIVE}`}>
          Player Results
        </button>
      </div>

      {/* ── Club Results tab ── */}
      {activeTab === 'club' && (
        <section className='rounded border border-amber-100 bg-amber-50 p-4'>
          <h3 className='text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3'>
            Check Missing Sessions (website vs tse_sessions)
          </h3>
          <div className='flex gap-3 items-end flex-wrap mb-3'>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Club ID</label>
              <input type='number' value={chkClubId} onChange={e => setChkClubId(parseInt(e.target.value, 10))}
                className='w-20 rounded border border-gray-300 bg-white px-2 py-1 text-sm' />
            </div>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Date from</label>
              <input type='date' value={chkDateFrom} min='2021-01-01' max={today}
                onChange={e => setChkDateFrom(e.target.value)}
                className='rounded border border-gray-300 bg-white px-2 py-1 text-sm' />
            </div>
            <div>
              <label className='text-xs text-gray-500 block mb-1'>Date to</label>
              <input type='date' value={chkDateTo} min='2021-01-01' max={today}
                onChange={e => setChkDateTo(e.target.value)}
                className='rounded border border-gray-300 bg-white px-2 py-1 text-sm' />
            </div>
            <button onClick={handleDiscover} disabled={chkBusy || !chkDateFrom || !chkDateTo}
              className='rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50'>
              {chkBusy ? 'Checking…' : 'Check'}
            </button>
          </div>
          {chkProgress && <p className='mt-2 text-sm text-amber-700 font-mono'>{chkProgress}</p>}
          {chkError   && <p className='mt-2 text-sm text-red-600'>{chkError}</p>}
          {chkResult  && (
            <div className='mt-2 space-y-2'>
              <p className='text-sm font-medium text-gray-800'>
                {chkResult.total_found} found on website · {chkResult.total_in_prod} in prod ·{' '}
                <span className={chkResult.total_missing > 0 ? 'text-red-600 font-semibold' : 'text-green-700'}>
                  {chkResult.total_missing} missing
                </span>
              </p>
              {chkResult.missing.length > 0 && (
                <>
                  <div className='max-h-48 overflow-y-auto rounded border border-amber-200 bg-white p-2'>
                    <table className='w-full text-xs font-mono'>
                      <thead><tr className='text-gray-500'><th className='text-left pr-4'>Date</th><th className='text-left'>Run ID</th></tr></thead>
                      <tbody>
                        {chkResult.missing.map(r => (
                          <tr key={r.run_id}>
                            <td className='pr-4'>{r.date}</td>
                            <td>{r.run_id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={handleChkImport} disabled={chkImpBusy}
                    className='rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50'>
                    {chkImpBusy ? 'Importing…' : `Import ${chkResult.missing.length} missing sessions → ts9`}
                  </button>
                  {chkImpProg   && <p className='text-sm text-amber-700 font-mono'>{chkImpProg}</p>}
                  {chkImpError  && <p className='text-sm text-red-600'>{chkImpError}</p>}
                  {chkImpResult && (
                    <p className='text-sm text-green-700'>
                      {chkImpResult.run_ids_total} sessions · {chkImpResult.pairs_inserted} pairs inserted
                      {chkImpResult.players_created > 0 ? ` · ${chkImpResult.players_created} new players` : ''}
                      {chkImpResult.skipped_rows > 0 ? ` · ${chkImpResult.skipped_rows} rows skipped` : ''}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Player Results tab ── */}
      {activeTab === 'player' && (
        <div className='space-y-6'>
          {/* Single player by NZ# */}
          <section className='rounded border border-purple-100 bg-purple-50 p-4'>
            <h3 className='text-xs font-semibold text-purple-600 uppercase tracking-wide mb-3'>
              Check &amp; Import by NZ Bridge Number → ts9
            </h3>
            <div className='flex gap-3 items-end flex-wrap mb-3'>
              <div>
                <label className='text-xs text-gray-500 block mb-1'>NZ Bridge Number</label>
                <input type='number' value={plyrNzb} onChange={e => setPlyrNzb(e.target.value)}
                  placeholder='e.g. 3525'
                  className='w-32 rounded border border-gray-300 bg-white px-2 py-1 text-sm' />
              </div>
              <button onClick={handlePlayerCheck} disabled={plyrBusy || !plyrNzb}
                className='rounded bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50'>
                {plyrBusy ? 'Checking…' : 'Check'}
              </button>
            </div>
            {plyrError && <p className='text-sm text-red-600 mb-2'>{plyrError}</p>}
            {plyrFound && (
              <div className='space-y-2'>
                <p className='text-sm font-medium text-gray-800'>
                  {plyrFound.total_found} found on website · {plyrFound.total_in_prod} in prod ·{' '}
                  <span className={plyrFound.total_missing > 0 ? 'text-red-600 font-semibold' : 'text-green-700'}>
                    {plyrFound.total_missing} missing
                  </span>
                </p>
                {plyrMissing && plyrMissing.length > 0 && (
                  <>
                    <div className='max-h-32 overflow-y-auto rounded border border-purple-200 bg-white p-2'>
                      <p className='text-xs font-mono text-gray-600'>{plyrMissing.join(', ')}</p>
                    </div>
                    <button onClick={handlePlayerImport} disabled={impBusy}
                      className='rounded bg-purple-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-800 disabled:opacity-50'>
                      {impBusy ? 'Importing…' : `Import ${plyrMissing.length} missing sessions → ts9`}
                    </button>
                    {impProgress && <p className='text-sm text-purple-700 font-mono'>{impProgress}</p>}
                    {impError   && <p className='text-sm text-red-600'>{impError}</p>}
                    {impResult  && (
                      <p className='text-sm text-green-700'>
                        {impResult.run_ids_total} sessions · {impResult.pairs_inserted} pairs · {impResult.players_created} new players
                        {impResult.skipped_rows > 0 ? ` · ${impResult.skipped_rows} rows skipped` : ''}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          {/* Tracked players */}
          <TrackedPlayers />
        </div>
      )}
    </div>
  )
}
