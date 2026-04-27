'use client'

import { useState } from 'react'
import { getSessionHeaders, getSessionsForHeader, type SessionHeaderRow } from '@/src/lib/actions/sessions'
import HelpButton from './HelpButton'
import {
  HELP_IMPORT_SESSION,
  HELP_FETCH_LIST,
  HELP_LOAD_STATUS,
  HELP_FETCH_ALL_PENDING,
  HELP_REFETCH_SELECTED,
  HELP_PROCESS_RESULTS,
  HELP_AUDIT_FETCH,
  HELP_AUDIT_PROCESS,
} from './adminHelp'
import { auditSessionsFetch, auditSessionsProcess, type AuditCheck } from '@/src/lib/actions/audit'
import AuditResults from './AuditResults'


interface FetchStatusEntry {
  se_seid: number
  se_source_id: number
  se_date: string
  se_session_type: string
  se_scoring: string
  se_day_of_week: string
  se_status: string
  se_name: string
  se_headevent_id: number
  pair_count: number
  last_error: string | null
}

interface FetchProgress {
  processed: number
  total: number
  pairs_stored: number
  skipped: number
}

interface FetchSummary {
  sessions_processed: number
  pairs_stored: number
  sessions_skipped: number
  warnings: string[]
}

interface ProcessProgress {
  processed: number
  total: number
  players_created: number
  results_inserted: number
  partnerships_created: number
}

interface ProcessSummary {
  sessions_processed: number
  players_created: number
  results_inserted: number
  partnerships_created: number
  warnings: string[]
}

export default function SessionImport() {
  // Event import
  const [eventHeadeventId, setEventHeadeventId] = useState('')
  const [importing, setImporting] = useState(false)
  const [importLog, setImportLog] = useState<string[]>([])
  const [importError, setImportError] = useState<string | null>(null)

  // Available sessions (event headers)
  const [headerList, setHeaderList] = useState<SessionHeaderRow[]>([])
  const [loadingHeaders, setLoadingHeaders] = useState(false)
  const [headersError, setHeadersError] = useState<string | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(0)
  const [nameFilter, setNameFilter] = useState('')
  const [eventIdFilter, setEventIdFilter] = useState('')
  const [expandedHeaders, setExpandedHeaders] = useState<Set<number>>(new Set())
  const [headerSessions, setHeaderSessions] = useState<Map<number, any[]>>(new Map())
  const [loadingHeaderSessions, setLoadingHeaderSessions] = useState<Set<number>>(new Set())
  const [refreshingEvent, setRefreshingEvent] = useState<number | null>(null)
  const [eventRefreshLog, setEventRefreshLog] = useState<Map<number, string>>(new Map())

  // Stage 2: fetch-results status table
  const [fetchStatusList, setFetchStatusList] = useState<FetchStatusEntry[]>([])
  const [loadingFetchStatus, setLoadingFetchStatus] = useState(false)
  const [fetchStatusError, setFetchStatusError] = useState<string | null>(null)
  const [selectedForRefetch, setSelectedForRefetch] = useState<Set<number>>(new Set())

  const [scoringFilter, setScoringFilter] = useState<'all' | 'mp' | 'imp'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'processed' | 'fetched' | 'skipped' | 'no-pairs' | 'error' | 'pending'>('all')
  const [headeventFilter, setHeadeventFilter] = useState('')
  const [fetchingResults, setFetchingResults] = useState(false)
  const [fetchProgress, setFetchProgress] = useState<FetchProgress | null>(null)
  const [fetchSummary, setFetchSummary] = useState<FetchSummary | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Stage 3: process results
  const [processingResults, setProcessingResults] = useState(false)
  const [processProgress, setProcessProgress] = useState<ProcessProgress | null>(null)
  const [processSummary, setProcessSummary] = useState<ProcessSummary | null>(null)
  const [processError, setProcessError] = useState<string | null>(null)

  // Audit
  const [auditFetch,         setAuditFetch]         = useState<AuditCheck[] | null>(null)
  const [auditFetchRunning,  setAuditFetchRunning]  = useState(false)
  const [auditFetchError,    setAuditFetchError]    = useState<string | null>(null)
  const [auditProcess,       setAuditProcess]       = useState<AuditCheck[] | null>(null)
  const [auditProcessRunning,setAuditProcessRunning]= useState(false)
  const [auditProcessError,  setAuditProcessError]  = useState<string | null>(null)

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
          if (evt.done) { onDone(evt as D); return }
          onProgress(evt as P)
        } catch { /* skip malformed */ }
      }
    }
  }

  // ── Run fetch+process pipeline for a list of seids ─────────────────────────
  async function runPipeline(
    seids: number[],
    log: (msg: string) => void,
    setError: (msg: string) => void
  ): Promise<boolean> {
    log('Fetching results…')
    const fetchRes = await fetch(`/api/scrape/fetch-results?seids=${seids.join(',')}`, { method: 'POST' })
    if (!fetchRes.ok) { const d = await fetchRes.json(); setError(d.error ?? 'Fetch failed'); return false }
    let ok = true
    await readSSE<FetchProgress, FetchSummary>(
      fetchRes,
      evt => log(`Fetching: ${evt.processed}/${evt.total} · ${evt.pairs_stored} pairs`),
      evt => log(`Fetched: ${evt.pairs_stored} pairs`),
      msg => { setError(msg); ok = false }
    )
    if (!ok) return false

    log('Processing results…')
    const processRes = await fetch('/api/scrape/process-results', { method: 'POST' })
    if (!processRes.ok) { const d = await processRes.json(); setError(d.error ?? 'Process failed'); return false }
    await readSSE<ProcessProgress, ProcessSummary>(
      processRes,
      evt => log(`Processing: ${evt.processed}/${evt.total} · ${evt.results_inserted} results`),
      evt => log(`Done · ${evt.results_inserted} results · ${evt.players_created} new players`),
      msg => { setError(msg); ok = false }
    )
    return ok
  }

  // ── Event import ────────────────────────────────────────────────────────────
  async function handleEventImport(e: React.FormEvent) {
    e.preventDefault()
    const headeventId = parseInt(eventHeadeventId, 10)
    if (isNaN(headeventId)) { setImportError('Please enter a valid Event ID'); return }
    setImporting(true)
    setImportLog([])
    setImportError(null)
    try {
      const res = await fetch(`/api/scrape/event-import?headevent_id=${headeventId}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setImportError(data.error ?? 'Import failed'); return }
      setImportLog([`${data.session_count} session${data.session_count !== 1 ? 's' : ''} ready`])
      await runPipeline(
        data.seids,
        msg => setImportLog(prev => { const next = [...prev]; next[next.length - 1] = msg; return next }),
        msg => setImportError(msg)
      )
    } catch (err) {
      setImportError(String(err))
    } finally {
      setImporting(false)
    }
  }

  // ── Available sessions (event headers) ─────────────────────────────────────
  async function handleDisplayHeaders() {
    setLoadingHeaders(true)
    setHeadersError(null)
    setRefreshMsg(null)
    try {
      setHeaderList(await getSessionHeaders(year))
    } catch (err) {
      setHeadersError(String(err))
    } finally {
      setLoadingHeaders(false)
    }
  }

  async function toggleHeader(shid: number) {
    if (expandedHeaders.has(shid)) {
      setExpandedHeaders(prev => { const n = new Set(prev); n.delete(shid); return n })
      return
    }
    setLoadingHeaderSessions(prev => new Set(prev).add(shid))
    try {
      const sessions = await getSessionsForHeader(shid)
      setHeaderSessions(prev => new Map(prev).set(shid, sessions))
      setExpandedHeaders(prev => new Set(prev).add(shid))
    } finally {
      setLoadingHeaderSessions(prev => { const n = new Set(prev); n.delete(shid); return n })
    }
  }

  async function handleRefreshEvent(headeventId: number, shid: number) {
    setRefreshingEvent(headeventId)
    setEventRefreshLog(prev => new Map(prev).set(headeventId, 'Setting up…'))
    try {
      const res = await fetch(`/api/scrape/event-import?headevent_id=${headeventId}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setEventRefreshLog(prev => new Map(prev).set(headeventId, `Error: ${data.error}`)); return }
      setEventRefreshLog(prev => new Map(prev).set(headeventId, `${data.session_count} sessions ready — fetching…`))
      await runPipeline(
        data.seids,
        msg => setEventRefreshLog(prev => new Map(prev).set(headeventId, msg)),
        msg => setEventRefreshLog(prev => new Map(prev).set(headeventId, `Error: ${msg}`))
      )
      const updated = await getSessionHeaders(year)
      setHeaderList(updated)
      if (expandedHeaders.has(shid)) {
        const sessions = await getSessionsForHeader(shid)
        setHeaderSessions(prev => new Map(prev).set(shid, sessions))
      }
    } finally {
      setRefreshingEvent(null)
    }
  }

  // ── Stage 2: fetch results ──────────────────────────────────────────────────
  async function loadFetchStatus() {
    setLoadingFetchStatus(true)
    setFetchStatusError(null)
    try {
      const res = await fetch('/api/scrape/fetch-results')
      const data = await res.json()
      if (!res.ok) setFetchStatusError(data.error ?? 'Failed to load status')
      else setFetchStatusList(data)
    } catch (err) {
      setFetchStatusError(String(err))
    } finally {
      setLoadingFetchStatus(false)
    }
  }

  async function streamFetch(url: string) {
    setFetchingResults(true)
    setFetchProgress(null)
    setFetchSummary(null)
    setFetchError(null)
    try {
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setFetchError(d.error ?? 'Fetch failed'); return }
      await readSSE<FetchProgress, FetchSummary>(
        res,
        evt => setFetchProgress(evt),
        evt => { setFetchSummary(evt); setFetchProgress(null) },
        msg => setFetchError(msg)
      )
      await loadFetchStatus()
    } catch (err) {
      setFetchError(String(err))
    } finally {
      setFetchingResults(false)
    }
  }

  async function handleFetchAllPending() {
    await streamFetch('/api/scrape/fetch-results')
  }

  async function handleRefetchSelected() {
    if (selectedForRefetch.size === 0) return
    await streamFetch(`/api/scrape/fetch-results?seids=${[...selectedForRefetch].join(',')}`)
    setSelectedForRefetch(new Set())
  }

  function toggleRefetch(seid: number) {
    setSelectedForRefetch(prev => {
      const next = new Set(prev)
      if (next.has(seid)) next.delete(seid)
      else next.add(seid)
      return next
    })
  }

  // ── Audit ────────────────────────────────────────────────────────────────────
  async function handleAuditFetch() {
    setAuditFetchRunning(true); setAuditFetchError(null)
    try { setAuditFetch(await auditSessionsFetch()) }
    catch (err) { setAuditFetchError(String(err)) }
    finally { setAuditFetchRunning(false) }
  }

  async function handleAuditProcess() {
    setAuditProcessRunning(true); setAuditProcessError(null)
    try { setAuditProcess(await auditSessionsProcess()) }
    catch (err) { setAuditProcessError(String(err)) }
    finally { setAuditProcessRunning(false) }
  }

  // ── Stage 3: process results ────────────────────────────────────────────────
  async function handleProcessResults() {
    setProcessingResults(true)
    setProcessProgress(null)
    setProcessSummary(null)
    setProcessError(null)
    try {
      const res = await fetch('/api/scrape/process-results', { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setProcessError(d.error ?? 'Process failed'); return }
      await readSSE<ProcessProgress, ProcessSummary>(
        res,
        evt => setProcessProgress(evt),
        evt => { setProcessSummary(evt); setProcessProgress(null) },
        msg => setProcessError(msg)
      )
    } catch (err) {
      setProcessError(String(err))
    } finally {
      setProcessingResults(false)
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function fetchStatusBadge(entry: FetchStatusEntry) {
    if (entry.se_status === 'processed') return <span className='text-green-700 font-medium'>Processed ({entry.pair_count})</span>
    if (entry.se_status === 'fetched')   return <span className='text-blue-600 font-medium'>Fetched ({entry.pair_count})</span>
    if (entry.se_status === 'skipped')   return <span className='text-gray-400'>Skipped</span>
    if (entry.se_status === 'no-pairs')  return <span className='text-amber-600 font-medium'>No Pairs</span>
    if (entry.se_status === 'error')     return <span className='text-red-600 font-medium'>Error</span>
    return <span className='text-gray-500'>New</span>
  }

  function sessionStatusBadge(status: string) {
    if (status === 'processed') return <span className='text-green-700'>Processed</span>
    if (status === 'fetched')   return <span className='text-blue-600'>Fetched</span>
    if (status === 'skipped')   return <span className='text-gray-400'>Skipped</span>
    if (status === 'no-pairs')  return <span className='text-amber-600'>No Pairs</span>
    if (status === 'error')     return <span className='text-red-600'>Error</span>
    return <span className='text-gray-500'>New</span>
  }

  function selectByType(status: string) {
    const seids = fetchStatusList.filter(s => s.se_status === status).map(s => s.se_seid)
    setSelectedForRefetch(new Set(seids))
  }

  const statusCounts = fetchStatusList.reduce((acc, s) => {
    acc[s.se_status] = (acc[s.se_status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const filteredHeaders = headerList.filter(h => {
    if (month !== 0 && h.sh_date && !h.sh_date.startsWith(`${year}-${String(month).padStart(2, '0')}`)) return false
    if (nameFilter && !h.sh_name.toLowerCase().includes(nameFilter.toLowerCase())) return false
    if (eventIdFilter && !String(h.sh_headevent_id).includes(eventIdFilter.trim())) return false
    return true
  })

  const filteredFetchStatus = fetchStatusList.filter(s => {
    if (scoringFilter === 'mp'  && s.se_scoring !== 'MP')  return false
    if (scoringFilter === 'imp' && s.se_scoring !== 'IMP') return false
    if (statusFilter !== 'all' && s.se_status !== statusFilter) return false
    if (headeventFilter && String(s.se_headevent_id) !== headeventFilter.trim()) return false
    return true
  })

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className='space-y-8'>

      {/* Event Import */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-3 text-base font-semibold text-gray-800'>Event Import</h2>
        <form onSubmit={handleEventImport} className='space-y-3'>
          <div className='flex flex-wrap gap-3'>
            <div>
              <label className='block text-xs text-gray-600 mb-1'>Event ID (headeventid)</label>
              <input
                type='text'
                inputMode='numeric'
                pattern='[0-9]*'
                value={eventHeadeventId}
                onChange={e => setEventHeadeventId(e.target.value)}
                placeholder='e.g. 16868'
                className='rounded border border-gray-300 px-2 py-1 text-sm w-32'
              />
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <button type='submit' disabled={importing}
              className='rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
              {importing ? 'Importing…' : 'Import Event'}
            </button>
            <HelpButton>{HELP_IMPORT_SESSION}</HelpButton>
          </div>
        </form>
        {importError && <div className='mt-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{importError}</div>}
        {importLog.length > 0 && !importError && (
          <div className='mt-3 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800 space-y-0.5'>
            {importLog.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        )}
      </section>

      {/* Available Sessions */}
      <section className='rounded border border-gray-200 p-4'>
        <div className='mb-3 flex items-center gap-3 flex-wrap'>
          <h2 className='text-base font-semibold text-gray-800'>Available Sessions</h2>
          <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))}
            className='rounded border border-gray-300 px-2 py-1 text-sm'>
            {[2026, 2025, 2024, 2023, 2022, 2021].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={handleDisplayHeaders} disabled={loadingHeaders}
            className='rounded bg-gray-100 border border-gray-300 px-3 py-1 text-sm hover:bg-gray-200 disabled:opacity-50'>
            {loadingHeaders ? 'Loading…' : 'Display'}
          </button>
          <HelpButton>{HELP_FETCH_LIST}</HelpButton>
        </div>
        {headersError && <div className='rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{headersError}</div>}
        {headerList.length > 0 && (
          <div className='border border-gray-200 rounded'>
            <div className='px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100'>
              {filteredHeaders.length} / {headerList.length} events
            </div>
            <table className='w-full text-sm'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-3 py-1 w-8'></th>
                  <th className='px-3 py-1'>
                    <select value={month} onChange={e => setMonth(parseInt(e.target.value, 10))}
                      className='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'>
                      <option value={0}>All months</option>
                      {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                        <option key={i+1} value={i+1}>{m}</option>
                      ))}
                    </select>
                  </th>
                  <th className='px-3 py-1'>
                    <input type='text' value={nameFilter} onChange={e => setNameFilter(e.target.value)}
                      placeholder='Search…'
                      className='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal' />
                  </th>
                  <th className='px-3 py-1'></th>
                  <th className='px-3 py-1'>
                    <input type='text' inputMode='numeric' value={eventIdFilter} onChange={e => setEventIdFilter(e.target.value)}
                      placeholder='Search…'
                      className='w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal' />
                  </th>
                  <th className='px-3 py-1'></th>
                </tr>
                <tr>
                  <th className='px-3 py-1.5 text-left text-xs text-gray-500 w-8'></th>
                  <th className='px-3 py-1.5 text-left text-xs text-gray-500'>Date</th>
                  <th className='px-3 py-1.5 text-left text-xs text-gray-500'>Name</th>
                  <th className='px-3 py-1.5 text-left text-xs text-gray-500'>Processed</th>
                  <th className='px-3 py-1.5 text-left text-xs text-gray-500'>Event ID</th>
                  <th className='px-3 py-1.5 text-left text-xs text-gray-500'>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHeaders.map(h => (
                  <>
                    <tr key={h.sh_shid} className='border-t border-gray-100 hover:bg-gray-50'>
                      <td className='px-3 py-1 text-xs text-center'>
                        <button onClick={() => toggleHeader(h.sh_shid)}
                          className='text-gray-400 hover:text-gray-700 w-5 text-center'>
                          {loadingHeaderSessions.has(h.sh_shid) ? '…' : expandedHeaders.has(h.sh_shid) ? '▼' : '▶'}
                        </button>
                      </td>
                      <td className='px-3 py-1 text-xs'>{h.sh_date ?? ''}</td>
                      <td className='px-3 py-1 text-xs text-gray-700'>
                        {h.sh_name || <span className='text-gray-400 italic'>Event {h.sh_headevent_id}</span>}
                      </td>
                      <td className='px-3 py-1 text-xs'>
                        <span className={h.processed_count === h.session_count && h.session_count > 0 ? 'text-green-700 font-medium' : 'text-gray-500'}>
                          {h.processed_count}/{h.session_count}
                        </span>
                      </td>
                      <td className='px-3 py-1 font-mono text-xs text-gray-400'>{h.sh_headevent_id}</td>
                      <td className='px-3 py-1 text-xs'>
                        <button
                          onClick={() => handleRefreshEvent(h.sh_headevent_id, h.sh_shid)}
                          disabled={refreshingEvent !== null}
                          className='rounded bg-amber-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50'>
                          {refreshingEvent === h.sh_headevent_id ? 'Refreshing…' : 'Refresh'}
                        </button>
                        {eventRefreshLog.get(h.sh_headevent_id) && (
                          <span className='ml-2 text-xs text-blue-700'>{eventRefreshLog.get(h.sh_headevent_id)}</span>
                        )}
                      </td>
                    </tr>
                    {expandedHeaders.has(h.sh_shid) && (
                      <tr key={`${h.sh_shid}-sessions`} className='bg-gray-50'>
                        <td colSpan={6} className='px-6 py-2'>
                          {(headerSessions.get(h.sh_shid) ?? []).length === 0
                            ? <span className='text-xs text-gray-400'>No sessions</span>
                            : (
                              <table className='w-full text-xs border border-gray-200 rounded'>
                                <thead className='bg-white'>
                                  <tr>
                                    <th className='px-2 py-1 text-left text-gray-500'>Date</th>
                                    <th className='px-2 py-1 text-left text-gray-500'>Day</th>
                                    <th className='px-2 py-1 text-left text-gray-500'>Name</th>
                                    <th className='px-2 py-1 text-left text-gray-500'>Type</th>
                                    <th className='px-2 py-1 text-left text-gray-500 font-mono'>Source ID</th>
                                    <th className='px-2 py-1 text-left text-gray-500'>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(headerSessions.get(h.sh_shid) ?? []).filter((s: any) => s.se_source_id !== h.sh_headevent_id).map((s: any) => (
                                    <tr key={s.se_seid} className='border-t border-gray-100'>
                                      <td className='px-2 py-0.5'>{s.se_date}</td>
                                      <td className='px-2 py-0.5 text-gray-500'>{s.se_day_of_week}</td>
                                      <td className='px-2 py-0.5 text-gray-700'>{s.se_name}</td>
                                      <td className='px-2 py-0.5 text-gray-500'>{s.se_scoring}</td>
                                      <td className='px-2 py-0.5 font-mono text-gray-400'>{s.se_source_id}</td>
                                      <td className='px-2 py-0.5'>{sessionStatusBadge(s.se_status)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Stage 2: Fetch Results */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Stage 2 — Fetch Results</h2>
        <p className='mb-3 text-xs text-gray-400'>Downloads AKBC result pages into the staging table.</p>

        <div className='flex flex-wrap gap-2 mb-3'>
          <button onClick={handleFetchAllPending} disabled={fetchingResults}
            className='rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
            {fetchingResults ? 'Fetching…' : 'Fetch All Pending'}
          </button>
          <HelpButton>{HELP_FETCH_ALL_PENDING}</HelpButton>
          <button onClick={handleRefetchSelected} disabled={fetchingResults || selectedForRefetch.size === 0}
            className='rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50'>
            Refetch Selected ({selectedForRefetch.size})
          </button>
          <HelpButton>{HELP_REFETCH_SELECTED}</HelpButton>
          <button onClick={loadFetchStatus} disabled={loadingFetchStatus}
            className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
            {loadingFetchStatus ? 'Loading…' : 'Load Status'}
          </button>
          <HelpButton>{HELP_LOAD_STATUS}</HelpButton>
          <button onClick={handleAuditFetch} disabled={auditFetchRunning}
            className='rounded bg-amber-50 border border-amber-300 px-3 py-1.5 text-sm hover:bg-amber-100 disabled:opacity-50'>
            {auditFetchRunning ? 'Auditing…' : 'Audit'}
          </button>
          <HelpButton>{HELP_AUDIT_FETCH}</HelpButton>
        </div>
        <AuditResults checks={auditFetch} error={auditFetchError} />

        {fetchProgress && (
          <div className='mb-3 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800'>
            Fetching: <strong>{fetchProgress.processed}</strong> / <strong>{fetchProgress.total}</strong> sessions
            · {fetchProgress.pairs_stored.toLocaleString()} pairs stored
            · {fetchProgress.skipped} skipped
          </div>
        )}
        {fetchError && <div className='mb-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{fetchError}</div>}
        {fetchSummary && (
          <div className='mb-3 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 space-y-1'>
            <div>
              Done · <strong>{fetchSummary.sessions_processed}</strong> sessions fetched
              · <strong>{fetchSummary.pairs_stored.toLocaleString()}</strong> pairs stored
              · <strong>{fetchSummary.sessions_skipped}</strong> skipped
            </div>
            {fetchSummary.warnings.length > 0 && (
              <ul className='list-disc list-inside text-yellow-700 text-xs mt-1'>
                {fetchSummary.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}

        {fetchStatusError && <div className='rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-2'>{fetchStatusError}</div>}
        {fetchStatusList.length > 0 && (
          <>
            <div className='flex flex-wrap gap-2 mb-3 text-xs'>
              {statusCounts['processed'] && <button onClick={() => selectByType('processed')} className='rounded-full bg-green-100 text-green-800 px-2.5 py-0.5 hover:bg-green-200'>Processed: {statusCounts['processed']}</button>}
              {statusCounts['fetched']   && <button onClick={() => selectByType('fetched')}   className='rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 hover:bg-blue-200'>Fetched: {statusCounts['fetched']}</button>}
              {statusCounts['new']       && <button onClick={() => selectByType('new')}       className='rounded-full bg-gray-100 text-gray-700 px-2.5 py-0.5 hover:bg-gray-200'>New: {statusCounts['new']}</button>}
              {statusCounts['skipped']   && <button onClick={() => selectByType('skipped')}   className='rounded-full bg-gray-100 text-gray-500 px-2.5 py-0.5 hover:bg-gray-200'>Skipped: {statusCounts['skipped']}</button>}
              {statusCounts['no-pairs']  && <button onClick={() => selectByType('no-pairs')}  className='rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 hover:bg-amber-200'>No Pairs: {statusCounts['no-pairs']}</button>}
              {statusCounts['error']     && <button onClick={() => selectByType('error')}     className='rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 hover:bg-red-200'>Error: {statusCounts['error']}</button>}
              {selectedForRefetch.size > 0 && (
                <button onClick={() => setSelectedForRefetch(new Set())} className='rounded-full bg-white border border-gray-300 text-gray-500 px-2.5 py-0.5 hover:bg-gray-50'>
                  Clear ({selectedForRefetch.size})
                </button>
              )}
            </div>
            <div className='flex flex-wrap items-center gap-3 mb-2'>
              <span className='text-xs text-gray-500'>{filteredFetchStatus.length} / {fetchStatusList.length}</span>
              {selectedForRefetch.size > 0 && (
                <span className='text-xs text-amber-700 font-medium'>{selectedForRefetch.size} selected for refetch</span>
              )}
              <div className='flex items-center gap-1'>
                <label className='text-xs text-gray-500'>Event ID:</label>
                <input
                  type='text' inputMode='numeric' pattern='[0-9]*'
                  value={headeventFilter}
                  onChange={e => setHeadeventFilter(e.target.value)}
                  placeholder='e.g. 16075'
                  className='rounded border border-gray-300 px-2 py-0.5 text-xs w-24'
                />
                {headeventFilter && (
                  <button onClick={() => setHeadeventFilter('')} className='text-xs text-gray-400 hover:text-gray-600'>✕</button>
                )}
              </div>
            </div>
            <div className='max-h-72 overflow-y-auto border border-gray-200 rounded'>
              <table className='w-full text-xs'>
                <thead className='bg-gray-50 sticky top-0'>
                  <tr>
                    <th className='px-2 py-1.5 text-left text-gray-500 w-8'>
                      <input type='checkbox'
                        checked={filteredFetchStatus.length > 0 && filteredFetchStatus.every(s => selectedForRefetch.has(s.se_seid))}
                        onChange={() => {
                          const allSelected = filteredFetchStatus.every(s => selectedForRefetch.has(s.se_seid))
                          if (allSelected) {
                            setSelectedForRefetch(prev => { const next = new Set(prev); filteredFetchStatus.forEach(s => next.delete(s.se_seid)); return next })
                          } else {
                            setSelectedForRefetch(prev => { const next = new Set(prev); filteredFetchStatus.forEach(s => next.add(s.se_seid)); return next })
                          }
                        }} />
                    </th>
                    <th className='px-2 py-1.5 text-left text-gray-500'>Date</th>
                    <th className='px-2 py-1.5 text-left text-gray-500'>Day</th>
                    <th className='px-2 py-1.5 text-left text-gray-500'>Name</th>
                    <th className='px-2 py-1.5 text-left text-gray-500'>
                      <select value={scoringFilter} onChange={e => setScoringFilter(e.target.value as typeof scoringFilter)}
                        className='rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-xs text-gray-600 font-normal cursor-pointer'>
                        <option value='all'>Type</option>
                        <option value='mp'>MP</option>
                        <option value='imp'>IMP</option>
                      </select>
                    </th>
                    <th className='px-2 py-1.5 text-left text-gray-500'>Source ID</th>
                    <th className='px-2 py-1.5 text-left text-gray-500'>Event ID</th>
                    <th className='px-2 py-1.5 text-left text-gray-500'>
                      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                        className='rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-xs text-gray-600 font-normal cursor-pointer'>
                        <option value='all'>Status</option>
                        <option value='processed'>Processed</option>
                        <option value='fetched'>Fetched</option>
                        <option value='new'>New</option>
                        <option value='skipped'>Skipped</option>
                        <option value='no-pairs'>No Pairs</option>
                        <option value='error'>Error</option>
                      </select>
                    </th>
                    <th className='px-2 py-1.5 text-left text-gray-500'>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFetchStatus.map(s => (
                    <tr key={s.se_seid} className='border-t border-gray-100 hover:bg-gray-50'>
                      <td className='px-2 py-1'>
                        <input type='checkbox' checked={selectedForRefetch.has(s.se_seid)}
                          onChange={() => toggleRefetch(s.se_seid)} />
                      </td>
                      <td className='px-2 py-1'>{s.se_date}</td>
                      <td className='px-2 py-1 text-gray-500'>{s.se_day_of_week}</td>
                      <td className='px-2 py-1 text-gray-700'>{s.se_name}</td>
                      <td className='px-2 py-1 text-gray-500'>{s.se_scoring}</td>
                      <td className='px-2 py-1 font-mono text-gray-400'>{s.se_source_id}</td>
                      <td className='px-2 py-1 font-mono text-gray-400'>{s.se_headevent_id || ''}</td>
                      <td className='px-2 py-1'>
                        {fetchingResults && (selectedForRefetch.has(s.se_seid) || (selectedForRefetch.size === 0 && s.se_status === 'new'))
                          ? <span className='text-yellow-600 font-medium'>Importing…</span>
                          : fetchStatusBadge(s)}
                      </td>
                      <td className='px-2 py-1 text-red-600 max-w-xs truncate' title={s.last_error ?? undefined}>
                        {s.last_error ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Stage 3: Process Results */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Stage 3 — Process Results</h2>
        <p className='mb-3 text-xs text-gray-400'>Resolves staged name pairs into player records, results and partnerships.</p>
        <div className='flex items-center gap-2'>
          <button onClick={handleProcessResults} disabled={processingResults}
            className='rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
            {processingResults ? 'Processing…' : 'Process Results'}
          </button>
          <HelpButton>{HELP_PROCESS_RESULTS}</HelpButton>
          <button onClick={handleAuditProcess} disabled={auditProcessRunning}
            className='rounded bg-amber-50 border border-amber-300 px-3 py-1.5 text-sm hover:bg-amber-100 disabled:opacity-50'>
            {auditProcessRunning ? 'Auditing…' : 'Audit'}
          </button>
          <HelpButton>{HELP_AUDIT_PROCESS}</HelpButton>
        </div>
        <AuditResults checks={auditProcess} error={auditProcessError} />
        {processProgress && (
          <div className='mt-3 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800'>
            Processing: <strong>{processProgress.processed}</strong> / <strong>{processProgress.total}</strong> sessions
            · {processProgress.players_created} players
            · {processProgress.results_inserted.toLocaleString()} results
            · {processProgress.partnerships_created} partnerships
          </div>
        )}
        {processError && <div className='mt-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{processError}</div>}
        {processSummary && (
          <div className='mt-3 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 space-y-1'>
            <div>
              Done · <strong>{processSummary.sessions_processed}</strong> sessions
              · <strong>{processSummary.players_created}</strong> players created
              · <strong>{processSummary.results_inserted.toLocaleString()}</strong> results
              · <strong>{processSummary.partnerships_created}</strong> partnerships
            </div>
            {processSummary.warnings.length > 0 && (
              <ul className='list-disc list-inside text-yellow-700 text-xs mt-1'>
                {processSummary.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

    </div>
  )
}
