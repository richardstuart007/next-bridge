'use client'

import { useState, useEffect } from 'react'
import { getTs1WithStatus, getTs5ByEventId, setTs1Scraped, clearTs7, clearTs8, getTeamsStatus } from '@/src/lib/actions/raw'

interface Ts1Row {
  s1_s1id: number
  s1_year: number
  s1_date: string | null
  s1_event_name: string
  s1_event_id: number
  s1_type: string | null
  s1_status: string | null
  raw_count: number
}

export default function RawScrape() {
  const [year, setYear] = useState(new Date().getFullYear())

  // Step 1
  const [scrapingYear,  setScrapingYear]  = useState(false)
  const [scrapeYearMsg, setScrapeYearMsg] = useState<string | null>(null)
  const [scrapeYearErr, setScrapeYearErr] = useState<string | null>(null)

  // Step 2
  const [ts1Rows,           setTs1Rows]          = useState<Ts1Row[]>([])
  const [loadingTs1,        setLoadingTs1]        = useState(false)
  const [ts1Error,          setTs1Error]          = useState<string | null>(null)
  const [statusFilter,      setStatusFilter]      = useState<string>('all')
  const [typeFilter,        setTypeFilter]        = useState<string>('all')
  const [selectedTs1,       setSelectedTs1]       = useState<Set<number>>(new Set())
  const [scrapingSelected,  setScrapingSelected]  = useState(false)
  const [scrapeSelProgress, setScrapeSelProgress] = useState<{ done: number; total: number; current: string } | null>(null)
  const [scrapeSelError,    setScrapeSelError]    = useState<string | null>(null)

  // Step 3 — Build ts7
  const [buildTs7Busy, setBuildTs7Busy] = useState(false)
  const [buildTs7Msg,  setBuildTs7Msg]  = useState<string | null>(null)
  const [buildTs7Err,  setBuildTs7Err]  = useState<string | null>(null)

  // Step 3 — clear ts7
  const [clearTs7Busy, setClearTs7Busy] = useState(false)
  const [clearTs7Err,  setClearTs7Err]  = useState<string | null>(null)

  // Step 4 — NZ players
  const [nzScraping, setNzScraping] = useState(false)
  const [nzMode,     setNzMode]     = useState<'refresh' | 'missing' | null>(null)
  const [nzProgress, setNzProgress] = useState<{ processed: number; total: number; found: number; not_found: number; name?: string } | null>(null)
  const [nzSummary,  setNzSummary]  = useState<string | null>(null)
  const [nzError,    setNzError]    = useState<string | null>(null)

  // Step 4 — clear ts8
  const [clearTs8Busy, setClearTs8Busy] = useState(false)
  const [clearTs8Err,  setClearTs8Err]  = useState<string | null>(null)

  // Step 5 — NZ pair scrape (full + test subset)
  const [nzResScraping,     setNzResScraping]     = useState(false)
  const [nzResTestScraping, setNzResTestScraping] = useState(false)
  const [nzResProgress,     setNzResProgress]     = useState<{ processed: number; total: number; sessions: number; pairs: number; name: string } | null>(null)
  const [nzResSummary,      setNzResSummary]      = useState<string | null>(null)
  const [nzResError,        setNzResError]        = useState<string | null>(null)

  // Teams step status
  interface TeamsStatus { ts2Count: number; ts3Count: number; ts4Count: number; ts61Count: number; ts61Expected: number }
  const [teamsStatus,        setTeamsStatus]        = useState<TeamsStatus | null>(null)
  const [teamsStatusLoading, setTeamsStatusLoading] = useState(false)
  const [stepBusy,           setStepBusy]           = useState<'ts2'|'ts3'|'ts4'|'ts61'|null>(null)
  const [stepMsg,            setStepMsg]            = useState<string | null>(null)
  const [stepError,          setStepError]          = useState<string | null>(null)

  // ── SSE reader ──────────────────────────────────────────────────────────────
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

  // ── Step 1 ──────────────────────────────────────────────────────────────────
  async function handleScrapeYear() {
    setScrapingYear(true); setScrapeYearMsg(null); setScrapeYearErr(null)
    try {
      const res = await fetch(`/api/scrape/raw/year?year=${year}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setScrapeYearErr(data.error ?? 'Failed'); return }
      setScrapeYearMsg(`${data.count} events found · ${data.added} new`)
    } catch (err) { setScrapeYearErr(String(err)) }
    finally { setScrapingYear(false) }
  }

  // ── Step 2 ──────────────────────────────────────────────────────────────────
  async function handleDisplayTs1() {
    setLoadingTs1(true); setTs1Error(null)
    try {
      setTs1Rows(await getTs1WithStatus(year) as Ts1Row[])
      setSelectedTs1(new Set())
    } catch (err) { setTs1Error(String(err)) }
    finally { setLoadingTs1(false) }
  }

  function toggleTs1(eventId: number) {
    setSelectedTs1(prev => {
      const n = new Set(prev)
      if (n.has(eventId)) n.delete(eventId); else n.add(eventId)
      return n
    })
  }

  function updateRowInState(s1id: number, patch: Partial<Ts1Row>) {
    setTs1Rows(prev => prev.map(r => r.s1_s1id === s1id ? { ...r, ...patch } : r))
  }

  async function handleScrapeSelected() {
    const toProcess = ts1Rows.filter(r => selectedTs1.has(r.s1_event_id))
    if (toProcess.length === 0) return
    setScrapingSelected(true); setScrapeSelProgress(null); setScrapeSelError(null)
    for (let i = 0; i < toProcess.length; i++) {
      const row = toProcess[i]
      setScrapeSelProgress({ done: i, total: toProcess.length, current: row.s1_event_name })
      try {
        let rawCount = 0
        if (row.s1_type === 'headevent') {
          const evRes = await fetch(`/api/scrape/raw/event?event_id=${row.s1_event_id}`, { method: 'POST' })
          if (evRes.ok) {
            const ts5 = await getTs5ByEventId(row.s1_event_id) as any[]
            for (const s of ts5) {
              if (!s.s5_source_id) continue
              if (s.s5_type === 'multisession') continue
              const r = await fetch(`/api/scrape/raw/session?source_id=${s.s5_source_id}&event_id=${s.s5_event_id}`, { method: 'POST' })
              if (r.ok) rawCount++
            }
          }
        } else if (row.s1_type === 'teamresults') {
          const r = await fetch(`/api/scrape/raw/teams?event_id=${row.s1_event_id}`, { method: 'POST' })
          if (r.ok) await readSSE<any, any>(r, () => {}, evt => { rawCount = (evt.ts3 ?? 0) + (evt.ts61 ?? 0) }, () => {})
        } else if (row.s1_type === 'resultsbm') {
          const r = await fetch(`/api/scrape/raw/session?source_id=${row.s1_event_id}&event_id=${row.s1_event_id}`, { method: 'POST' })
          if (r.ok) { const d = await r.json(); rawCount = d.count ?? 0 }
        }
        await setTs1Scraped(row.s1_s1id, rawCount)
        updateRowInState(row.s1_s1id, { s1_status: 'scraped', raw_count: rawCount })
      } catch { /* continue on per-row error */ }
    }
    setScrapeSelProgress({ done: toProcess.length, total: toProcess.length, current: '' })
    setScrapingSelected(false)
  }

  // ── Step 3 — Clear ts7 ───────────────────────────────────────────────────────
  async function handleClearTs7() {
    setClearTs7Busy(true); setClearTs7Err(null)
    try {
      await clearTs7()
    } catch (err) { setClearTs7Err(String(err)) }
    finally { setClearTs7Busy(false) }
  }

  // ── Step 3 — Build ts7 ──────────────────────────────────────────────────────
  async function handleBuildTs7() {
    setBuildTs7Busy(true); setBuildTs7Msg(null); setBuildTs7Err(null)
    try {
      const res = await fetch('/api/scrape/build/ts7', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) { setBuildTs7Err(d.error ?? 'Failed'); return }
      setBuildTs7Msg(`Done · ${d.inserted ?? 0} names added`)
    } catch (err) { setBuildTs7Err(String(err)) }
    finally { setBuildTs7Busy(false) }
  }

  // ── Step 4 — NZ players ──────────────────────────────────────────────────────
  async function handleScrapeNzPlayers(mode: 'refresh' | 'missing') {
    setNzScraping(true); setNzMode(mode); setNzProgress(null); setNzSummary(null); setNzError(null)
    try {
      const res = await fetch(`/api/scrape/raw/nzplayers?mode=${mode}`, { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setNzError(d.error ?? 'Failed'); return }
      await readSSE<any, any>(
        res,
        evt => setNzProgress(evt),
        evt => {
          setNzSummary(`Done · ${evt.found ?? 0} found · ${evt.not_found ?? 0} not found`)
          setNzProgress(null)
        },
        msg => setNzError(msg)
      )
    } catch (err) { setNzError(String(err)) }
    finally { setNzScraping(false); setNzMode(null) }
  }

  // ── Step 4 — Clear ts8 ───────────────────────────────────────────────────────
  async function handleClearTs8() {
    setClearTs8Busy(true); setClearTs8Err(null)
    try {
      await clearTs8()
    } catch (err) { setClearTs8Err(String(err)) }
    finally { setClearTs8Busy(false) }
  }

  // ── Step 5 — NZ pair scrape ──────────────────────────────────────────────────
  async function runNzResults(url: string, setBusy: (v: boolean) => void) {
    setBusy(true); setNzResProgress(null); setNzResSummary(null); setNzResError(null)
    try {
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setNzResError(d.error ?? 'Failed'); return }
      await readSSE<any, any>(
        res,
        evt => setNzResProgress(evt),
        evt => {
          setNzResSummary(`Done · ${evt.total ?? 0} players · ${evt.sessions ?? 0} sessions · ${evt.pairs ?? 0} pairs`)
          setNzResProgress(null)
        },
        msg => setNzResError(msg)
      )
    } catch (err) { setNzResError(String(err)) }
    finally { setBusy(false) }
  }

  const handleScrapeNzResults     = () => runNzResults('/api/scrape/raw/nzresults', setNzResScraping)
  const handleScrapeNzResultsTest = () => runNzResults('/api/scrape/raw/nzresults?nzNumbers=6775,2748,38456,36752', setNzResTestScraping)

  // ── Teams step status ────────────────────────────────────────────────────────
  const selectedTeamsRows = ts1Rows.filter(r => selectedTs1.has(r.s1_event_id) && r.s1_type === 'teamresults')
  const focusedTeamsEvent = selectedTeamsRows.length === 1 ? selectedTeamsRows[0] : null

  async function refreshTeamsStatus(eventId: number) {
    setTeamsStatusLoading(true)
    setStepError(null)
    try {
      const s = await getTeamsStatus(eventId)
      setTeamsStatus(s as TeamsStatus)
    } catch (err) {
      setTeamsStatus(null)
      setStepError(`Status query failed: ${String(err)}`)
    } finally {
      setTeamsStatusLoading(false)
    }
  }

  useEffect(() => {
    if (!focusedTeamsEvent) { setTeamsStatus(null); return }
    refreshTeamsStatus(focusedTeamsEvent.s1_event_id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedTeamsEvent?.s1_event_id])

  async function handleStepScrape(eventId: number, step: 'ts2'|'ts3'|'ts4'|'ts61') {
    setStepBusy(step); setStepMsg(null); setStepError(null)
    try {
      const res = await fetch(`/api/scrape/raw/teams?event_id=${eventId}&step=${step}`, { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setStepError(d.error ?? 'Failed'); return }
      await readSSE<any, any>(
        res,
        evt => {
          if (evt.total !== undefined)
            setStepMsg(`${evt.existing ?? 0} already done · fetching remaining ${evt.total - (evt.existing ?? 0)}…`)
          else if (evt.teams !== undefined)
            setStepMsg(`Fetching ${evt.teams} teams…`)
          else
            setStepMsg('Fetching…')
        },
        evt => {
          if (step === 'ts61')
            setStepMsg(`Done · +${evt.added ?? 0} added · ${evt.total ?? 0} total`)
          else
            setStepMsg(`Done · ${evt.count ?? 0} rows`)
          refreshTeamsStatus(eventId)
        },
        msg => setStepError(msg)
      )
    } catch (err) { setStepError(String(err)) }
    finally { setStepBusy(null) }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const visibleRows = ts1Rows
    .filter(r => statusFilter === 'all' ? true : statusFilter === 'none' ? !r.s1_status : r.s1_status === statusFilter)
    .filter(r => typeFilter === 'all' ? true : r.s1_type === typeFilter)
  const allSelected   = visibleRows.length > 0 && visibleRows.every(r => selectedTs1.has(r.s1_event_id))
  const scrapableCount = ts1Rows.filter(r => selectedTs1.has(r.s1_event_id)).length

  function statusBadge(row: Ts1Row) {
    if (row.s1_status === 'scraped')
      return <span className='rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs'>scraped {row.raw_count}</span>
    return <span className='text-gray-300 text-xs'>—</span>
  }

  function typeBadge(type: string | null) {
    if (type === 'headevent')   return <span className='text-blue-600'>headevent</span>
    if (type === 'teamresults') return <span className='text-purple-600'>teams</span>
    if (type === 'resultsbm')   return <span className='text-gray-500'>MP</span>
    return <span className='text-gray-300'>{type ?? ''}</span>
  }

  const AKBC = 'https://auckland.nzbridgeclub.org'
  function sourceUrl(r: Ts1Row): string | null {
    if (!r.s1_event_id) return null
    if (r.s1_type === 'headevent')   return `${AKBC}/resultslistbm.asp?headeventid=${r.s1_event_id}`
    if (r.s1_type === 'teamresults') return `${AKBC}/teamresults.asp?id=${r.s1_event_id}`
    if (r.s1_type === 'resultsbm')   return `${AKBC}/resultsbm.asp?id=${r.s1_event_id}`
    return null
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className='space-y-6'>
      <div className='flex items-center gap-3'>
        <h2 className='text-base font-semibold text-gray-800'>Raw Scrape Pipeline</h2>
        <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))}
          className='rounded border border-gray-300 px-2 py-1 text-sm'>
          {[2026, 2025, 2024, 2023, 2022, 2021].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Step 1 */}
      <section className='rounded border border-gray-200 p-4'>
        <h3 className='text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3'>Step 1 — Scrape year page → ts1_main</h3>
        <div className='flex gap-2 items-center'>
          <button onClick={handleScrapeYear} disabled={scrapingYear}
            className='rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
            {scrapingYear ? 'Scraping…' : 'Scrape Year'}
          </button>
        </div>
        {scrapeYearErr && <p className='mt-2 text-sm text-red-600'>{scrapeYearErr}</p>}
        {scrapeYearMsg && <p className='mt-2 text-sm text-green-700'>{scrapeYearMsg}</p>}
      </section>

      {/* Step 2 */}
      <section className='rounded border border-gray-200 p-4'>
        <h3 className='text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3'>Step 2 — Select events → scrape into ts* tables</h3>
        <div className='flex gap-2 items-center mb-3'>
          <button onClick={handleDisplayTs1} disabled={loadingTs1 || scrapingSelected}
            className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
            {loadingTs1 ? 'Loading…' : 'Display'}
          </button>
          <button onClick={handleScrapeSelected} disabled={scrapingSelected || scrapableCount === 0}
            className='rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
            {scrapingSelected ? 'Scraping…' : `Scrape Selected (${scrapableCount})`}
          </button>
        </div>
        {ts1Error && <p className='text-sm text-red-600 mb-2'>{ts1Error}</p>}
        {ts1Rows.length > 0 && (
          <div className='max-h-72 overflow-y-auto border border-gray-200 rounded'>
            <table className='w-full text-xs'>
              <thead className='bg-gray-50 sticky top-0'>
                <tr>
                  <th className='px-2 py-1.5 w-8'>
                    <input type='checkbox' checked={allSelected}
                      onChange={() => setSelectedTs1(allSelected ? new Set() : new Set(visibleRows.map(r => r.s1_event_id)))} />
                  </th>
                  <th className='px-2 py-1.5 text-left text-gray-500'>Date</th>
                  <th className='px-2 py-1.5 text-left text-gray-500'>Name</th>
                  <th className='px-2 py-1 text-left'>
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                      className='rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-gray-600 cursor-pointer'>
                      <option value='all'>All types</option>
                      <option value='headevent'>headevent</option>
                      <option value='teamresults'>teams</option>
                      <option value='resultsbm'>MP</option>
                    </select>
                  </th>
                  <th className='px-2 py-1.5 text-left text-gray-500 font-mono'>Event ID</th>
                  <th className='px-2 py-1 text-left'>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                      className='rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-gray-600 cursor-pointer'>
                      <option value='all'>All status</option>
                      <option value='none'>unscraped</option>
                      <option value='scraped'>scraped</option>
                    </select>
                  </th>
                  <th className='px-2 py-1.5 w-6'></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(r => (
                  <tr key={r.s1_event_id} className='border-t border-gray-100 hover:bg-gray-50 cursor-pointer'
                    onClick={() => toggleTs1(r.s1_event_id)}>
                    <td className='px-2 py-1'>
                      <input type='checkbox' checked={selectedTs1.has(r.s1_event_id)}
                        onChange={() => toggleTs1(r.s1_event_id)} onClick={e => e.stopPropagation()} />
                    </td>
                    <td className='px-2 py-1'>{r.s1_date ?? ''}</td>
                    <td className='px-2 py-1 text-gray-700'>{r.s1_event_name}</td>
                    <td className='px-2 py-1'>{typeBadge(r.s1_type)}</td>
                    <td className='px-2 py-1 font-mono text-gray-400'>{r.s1_event_id}</td>
                    <td className='px-2 py-1'>{statusBadge(r)}</td>
                    <td className='px-2 py-1'>
                      {sourceUrl(r) && (
                        <a href={sourceUrl(r)!} target='_blank' rel='noreferrer'
                          onClick={e => e.stopPropagation()}
                          className='text-gray-400 hover:text-blue-600' title='View source'>
                          ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {scrapeSelProgress && (
          <p className='mt-2 text-sm text-blue-700'>
            {scrapeSelProgress.done}/{scrapeSelProgress.total}
            {scrapeSelProgress.current ? ` · ${scrapeSelProgress.current}` : ' — done'}
          </p>
        )}
        {scrapeSelError && <p className='mt-2 text-sm text-red-600'>{scrapeSelError}</p>}

        {/* Teams step status — shown when exactly one teams event is selected */}
        {focusedTeamsEvent && (
          <div className='mt-4 rounded border border-purple-200 bg-purple-50 p-3'>
            <div className='flex items-center gap-2 mb-2'>
              <p className='text-xs font-semibold text-purple-700'>
                Teams Steps — {focusedTeamsEvent.s1_event_name}
              </p>
              <button
                onClick={() => refreshTeamsStatus(focusedTeamsEvent.s1_event_id)}
                disabled={teamsStatusLoading}
                className='text-purple-500 hover:text-purple-700 disabled:opacity-50 text-xs'
                title='Refresh counts'>
                {teamsStatusLoading ? 'loading…' : '↺'}
              </button>
            </div>
            {teamsStatus && (
              <div className='space-y-1.5'>
                {([
                  { key: 'ts2', label: 'ts2  VP Summary',   count: teamsStatus.ts2Count,  expected: null },
                  { key: 'ts3', label: 'ts3  Team Members', count: teamsStatus.ts3Count,  expected: null },
                  { key: 'ts4', label: 'ts4  Round Detail', count: teamsStatus.ts4Count,  expected: null },
                  { key: 'ts61', label: 'ts61 Match Pairs', count: teamsStatus.ts61Count, expected: teamsStatus.ts61Expected },
                ] as { key: 'ts2'|'ts3'|'ts4'|'ts61'; label: string; count: number; expected: number|null }[]).map(({ key, label, count, expected }) => (
                  <div key={key} className='flex items-center gap-3'>
                    <span className='font-mono text-xs text-gray-500 w-36'>{label}</span>
                    <span className='text-xs text-gray-700 w-20'>
                      {expected !== null
                        ? <>{count} <span className='text-gray-400'>/ {expected || '?'}</span></>
                        : count}
                    </span>
                    <span className={`text-xs w-16 ${count > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {count > 0 ? (expected !== null && count >= expected ? 'complete' : 'partial') : 'empty'}
                    </span>
                    <button
                      onClick={() => handleStepScrape(focusedTeamsEvent.s1_event_id, key)}
                      disabled={!!stepBusy}
                      className='rounded bg-white border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-50'>
                      {stepBusy === key ? '…' : key === 'ts61' ? 'Fill Missing' : 'Refresh'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {stepMsg   && <p className='mt-2 text-xs text-blue-700'>{stepMsg}</p>}
            {stepError && <p className='mt-2 text-xs text-red-600'>{stepError}</p>}
          </div>
        )}
      </section>

      {/* Step 3 */}
      <section className='rounded border border-gray-200 p-4'>
        <h3 className='text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3'>Step 3 — ts7_nz_players</h3>
        <div className='flex gap-4 items-start flex-wrap'>
          <div>
            <p className='text-xs text-gray-400 mb-1'>Clear table</p>
            <button onClick={handleClearTs7} disabled={clearTs7Busy}
              className='rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50'>
              {clearTs7Busy ? 'Clearing…' : 'Clear ts7'}
            </button>
            {clearTs7Err && <p className='mt-1 text-sm text-red-600'>{clearTs7Err}</p>}
          </div>
          <div>
            <p className='text-xs text-gray-400 mb-1'>Add names from AKBC (ts3/ts6)</p>
            <button onClick={handleBuildTs7} disabled={buildTs7Busy}
              className='rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
              {buildTs7Busy ? 'Adding…' : 'Add New Names'}
            </button>
            {buildTs7Err && <p className='mt-1 text-sm text-red-600'>{buildTs7Err}</p>}
            {buildTs7Msg && <p className='mt-1 text-sm text-green-700'>{buildTs7Msg}</p>}
          </div>
          <div>
            <p className='text-xs text-gray-400 mb-1'>NZ bridge lookup</p>
            <div className='flex gap-2'>
              <button onClick={() => handleScrapeNzPlayers('missing')} disabled={nzScraping}
                className='rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
                {nzScraping && nzMode === 'missing' ? 'Populating…' : 'Populate NZ Bridge Numbers'}
              </button>
              <button onClick={() => handleScrapeNzPlayers('refresh')} disabled={nzScraping}
                className='rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50'>
                {nzScraping && nzMode === 'refresh' ? 'Updating…' : 'Update NZ Bridge Stats'}
              </button>
            </div>
            {nzProgress && (
              <p className='mt-1 text-sm text-blue-700'>
                {nzProgress.processed}/{nzProgress.total} · {nzProgress.found} found · {nzProgress.not_found} not found
                {nzProgress.name ? ` · ${nzProgress.name}` : ''}
              </p>
            )}
            {nzError   && <p className='mt-1 text-sm text-red-600'>{nzError}</p>}
            {nzSummary && <p className='mt-1 text-sm text-green-700'>{nzSummary}</p>}
          </div>
        </div>
      </section>

      {/* Step 4 — Clear ts8 */}
      <section className='rounded border border-gray-200 p-4'>
        <h3 className='text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3'>Step 4 — ts8_nz_results (clear)</h3>
        <div className='flex gap-2 items-center'>
          <button onClick={handleClearTs8} disabled={clearTs8Busy}
            className='rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50'>
            {clearTs8Busy ? 'Clearing…' : 'Clear ts8'}
          </button>
        </div>
        {clearTs8Err && <p className='mt-2 text-sm text-red-600'>{clearTs8Err}</p>}
      </section>

      {/* Step 5 */}
      <section className='rounded border border-gray-200 p-4'>
        <h3 className='text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3'>Step 5 — Scrape NZ Pairs → ts8_nz_results</h3>
        <p className='text-xs text-gray-400 mb-2'>For each AKBC player, fetches NZ Bridge history and session pairs. Partners added to ts7.</p>
        <div className='flex gap-2 items-center flex-wrap'>
          <button onClick={handleScrapeNzResults} disabled={nzResScraping || nzResTestScraping}
            className='rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
            {nzResScraping ? 'Scraping…' : 'Scrape NZ Pairs'}
          </button>
          <button onClick={handleScrapeNzResultsTest} disabled={nzResScraping || nzResTestScraping}
            className='rounded bg-gray-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-600 disabled:opacity-50'
            title='NZ# 6775, 2748, 38456, 36752'>
            {nzResTestScraping ? 'Testing…' : 'Test (4 players)'}
          </button>
        </div>
        {nzResProgress && (
          <p className='mt-2 text-sm text-blue-700'>
            {nzResProgress.processed}/{nzResProgress.total} players · {nzResProgress.sessions} sessions · {nzResProgress.pairs} pairs
            {nzResProgress.name ? ` · ${nzResProgress.name}` : ''}
          </p>
        )}
        {nzResError   && <p className='mt-2 text-sm text-red-600'>{nzResError}</p>}
        {nzResSummary && <p className='mt-2 text-sm text-green-700'>{nzResSummary}</p>}
      </section>
    </div>
  )
}
