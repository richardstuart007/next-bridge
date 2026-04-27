'use client'

import { useState } from 'react'
import { getTs1WithStatus, getTs5ByEventId, setTs1Scraped } from '@/src/lib/actions/raw'

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

  // Step 3 — Build ts7 + ts9
  const [buildTs7Busy, setBuildTs7Busy] = useState(false)
  const [buildTs7Msg,  setBuildTs7Msg]  = useState<string | null>(null)
  const [buildTs7Err,  setBuildTs7Err]  = useState<string | null>(null)
  const [buildTs9Busy, setBuildTs9Busy] = useState(false)
  const [buildTs9Msg,  setBuildTs9Msg]  = useState<string | null>(null)
  const [buildTs9Err,  setBuildTs9Err]  = useState<string | null>(null)

  // Step 4 — NZ players
  const [nzScraping, setNzScraping] = useState(false)
  const [nzMode,     setNzMode]     = useState<'refresh' | 'missing' | null>(null)
  const [nzProgress, setNzProgress] = useState<{ processed: number; total: number; found: number; not_found: number; name?: string } | null>(null)
  const [nzSummary,  setNzSummary]  = useState<string | null>(null)
  const [nzError,    setNzError]    = useState<string | null>(null)

  // Step 5 — NZ results history
  const [nzResScraping, setNzResScraping] = useState(false)
  const [nzResMode,     setNzResMode]     = useState<'refresh' | 'missing' | null>(null)
  const [nzResProgress, setNzResProgress] = useState<{ processed: number; total: number; done: number; failed: number; rows: number; name: string } | null>(null)
  const [nzResSummary,  setNzResSummary]  = useState<string | null>(null)
  const [nzResError,    setNzResError]    = useState<string | null>(null)

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
    const toProcess = ts1Rows.filter(r => selectedTs1.has(r.s1_event_id) && !r.s1_status)
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
          if (r.ok) await readSSE<any, any>(r, () => {}, evt => { rawCount = evt.ts3 ?? 0 }, () => {})
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

  // ── Step 3 — Build ts7 + ts9 ────────────────────────────────────────────────
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

  async function handleBuildTs9() {
    setBuildTs9Busy(true); setBuildTs9Msg(null); setBuildTs9Err(null)
    try {
      const res = await fetch('/api/scrape/build/ts9', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) { setBuildTs9Err(d.error ?? 'Failed'); return }
      setBuildTs9Msg(`Done · ${d.pairs ?? 0} pairs`)
    } catch (err) { setBuildTs9Err(String(err)) }
    finally { setBuildTs9Busy(false) }
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

  // ── Step 5 — NZ results history ─────────────────────────────────────────────
  async function handleScrapeNzResults(mode: 'refresh' | 'missing') {
    setNzResScraping(true); setNzResMode(mode); setNzResProgress(null); setNzResSummary(null); setNzResError(null)
    try {
      const res = await fetch(`/api/scrape/raw/nzresults?mode=${mode}`, { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setNzResError(d.error ?? 'Failed'); return }
      await readSSE<any, any>(
        res,
        evt => setNzResProgress(evt),
        evt => {
          setNzResSummary(`Done · ${evt.players ?? 0} players · ${evt.rows ?? 0} rows${evt.failed ? ` · ${evt.failed} failed` : ''}`)
          setNzResProgress(null)
        },
        msg => setNzResError(msg)
      )
    } catch (err) { setNzResError(String(err)) }
    finally { setNzResScraping(false); setNzResMode(null) }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const visibleRows = ts1Rows
    .filter(r => statusFilter === 'all' ? true : statusFilter === 'none' ? !r.s1_status : r.s1_status === statusFilter)
    .filter(r => typeFilter === 'all' ? true : r.s1_type === typeFilter)
  const allSelected   = visibleRows.length > 0 && visibleRows.every(r => selectedTs1.has(r.s1_event_id))
  const scrapableCount = ts1Rows.filter(r => selectedTs1.has(r.s1_event_id) && !r.s1_status).length

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
          <div className='flex gap-2 items-center mb-2 flex-wrap'>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className='rounded border border-gray-300 px-2 py-0.5 text-xs'>
              <option value='all'>All types</option>
              <option value='headevent'>headevent</option>
              <option value='teamresults'>teams</option>
              <option value='resultsbm'>MP</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className='rounded border border-gray-300 px-2 py-0.5 text-xs'>
              <option value='all'>All status</option>
              <option value='none'>unscraped</option>
              <option value='scraped'>scraped</option>
            </select>
          </div>
        )}
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
                  <th className='px-2 py-1.5 text-left text-gray-500'>Type</th>
                  <th className='px-2 py-1.5 text-left text-gray-500 font-mono'>Event ID</th>
                  <th className='px-2 py-1.5 text-left text-gray-500'>Status</th>
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
      </section>

      {/* Step 3 */}
      <section className='rounded border border-gray-200 p-4'>
        <h3 className='text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3'>Step 3 — Create ts7_nz_players</h3>
        <div className='flex gap-4 items-start flex-wrap'>
          <div>
            <p className='text-xs text-gray-400 mb-1'>Extract names from ts3/ts6</p>
            <button onClick={handleBuildTs7} disabled={buildTs7Busy}
              className='rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
              {buildTs7Busy ? 'Building…' : 'Build ts7'}
            </button>
            {buildTs7Err && <p className='mt-1 text-sm text-red-600'>{buildTs7Err}</p>}
            {buildTs7Msg && <p className='mt-1 text-sm text-green-700'>{buildTs7Msg}</p>}
          </div>
          <div>
            <p className='text-xs text-gray-400 mb-1'>Scrape NZ player data</p>
            <div className='flex gap-2'>
              <button onClick={() => handleScrapeNzPlayers('refresh')} disabled={nzScraping}
                className='rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
                {nzScraping && nzMode === 'refresh' ? 'Refreshing…' : 'Refresh'}
              </button>
              <button onClick={() => handleScrapeNzPlayers('missing')} disabled={nzScraping}
                className='rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50'>
                {nzScraping && nzMode === 'missing' ? 'Filling…' : 'Fill Missing'}
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

      {/* Step 4 */}
      <section className='rounded border border-gray-200 p-4'>
        <h3 className='text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3'>Step 4 — Create ts8_nz_results</h3>
        <div className='flex gap-2 items-center'>
          <button onClick={() => handleScrapeNzResults('refresh')} disabled={nzResScraping}
            className='rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
            {nzResScraping && nzResMode === 'refresh' ? 'Refreshing…' : 'Refresh'}
          </button>
          <button onClick={() => handleScrapeNzResults('missing')} disabled={nzResScraping}
            className='rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50'>
            {nzResScraping && nzResMode === 'missing' ? 'Filling…' : 'Fill Missing'}
          </button>
        </div>
        {nzResProgress && (
          <p className='mt-2 text-sm text-blue-700'>
            {nzResProgress.processed}/{nzResProgress.total} · {nzResProgress.rows} rows
            {nzResProgress.name ? ` · ${nzResProgress.name}` : ''}
            {nzResProgress.failed ? ` · ${nzResProgress.failed} failed` : ''}
          </p>
        )}
        {nzResError   && <p className='mt-2 text-sm text-red-600'>{nzResError}</p>}
        {nzResSummary && <p className='mt-2 text-sm text-green-700'>{nzResSummary}</p>}
      </section>

      {/* Step 5 */}
      <section className='rounded border border-gray-200 p-4'>
        <h3 className='text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3'>Step 5 — Create ts9_partners</h3>
        <div className='flex gap-2 items-center'>
          <button onClick={handleBuildTs9} disabled={buildTs9Busy}
            className='rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
            {buildTs9Busy ? 'Building…' : 'Build ts9'}
          </button>
        </div>
        {buildTs9Err && <p className='mt-2 text-sm text-red-600'>{buildTs9Err}</p>}
        {buildTs9Msg && <p className='mt-2 text-sm text-green-700'>{buildTs9Msg}</p>}
      </section>
    </div>
  )
}
