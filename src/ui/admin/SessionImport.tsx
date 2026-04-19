'use client'

import { useState } from 'react'

interface SessionListEntry {
  sourceId: number
  label: string
  date: string
  dayOfWeek: string
  alreadyImported: boolean
  isImp: boolean
}

interface ImportSummary {
  session_id: number
  pairs_imported: number
  new_players: number
  warnings?: string[]
}

interface FetchStatusEntry {
  se_seid: number
  se_source_id: number
  se_date: string
  se_session_type: string
  se_scoring: string
  se_day_of_week: string
  pair_count: number
  processed: boolean
  last_error: string | null
  last_skipped: boolean
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
  // Manual import
  const [manualSourceId, setManualSourceId] = useState('')
  const [importMode, setImportMode] = useState<'skip' | 'reimport'>('skip')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportSummary | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // Session list (available from AKBC)
  const [fetchingList, setFetchingList] = useState(false)
  const [sessionList, setSessionList] = useState<SessionListEntry[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [year, setYear] = useState(new Date().getFullYear())
  const [batchImporting, setBatchImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<Map<number, 'importing' | 'done' | 'error' | 'imp'>>(new Map())

  // Stage 2: fetch-results status table
  const [fetchStatusList, setFetchStatusList] = useState<FetchStatusEntry[]>([])
  const [loadingFetchStatus, setLoadingFetchStatus] = useState(false)
  const [fetchStatusError, setFetchStatusError] = useState<string | null>(null)
  const [selectedForRefetch, setSelectedForRefetch] = useState<Set<number>>(new Set())

  const [scoringFilter, setScoringFilter] = useState<'all' | 'mp' | 'imp'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'processed' | 'fetched' | 'skipped' | 'no-pairs' | 'error' | 'pending'>('all')
  const [fetchingResults, setFetchingResults] = useState(false)
  const [fetchProgress, setFetchProgress] = useState<FetchProgress | null>(null)
  const [fetchSummary, setFetchSummary] = useState<FetchSummary | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Stage 3: process results
  const [processingResults, setProcessingResults] = useState(false)
  const [processProgress, setProcessProgress] = useState<ProcessProgress | null>(null)
  const [processSummary, setProcessSummary] = useState<ProcessSummary | null>(null)
  const [processError, setProcessError] = useState<string | null>(null)

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

  // ── Manual import ───────────────────────────────────────────────────────────
  async function handleManualImport(e: React.FormEvent) {
    e.preventDefault()
    const sourceId = parseInt(manualSourceId, 10)
    if (isNaN(sourceId)) { setImportError('Please enter a valid session ID'); return }
    setImporting(true)
    setImportResult(null)
    setImportError(null)
    try {
      const res = await fetch('/api/scrape/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId, day_of_week: 'Unknown', session_type: 'club', scoring: 'MP', mode: importMode })
      })
      const data = await res.json()
      if (!res.ok) setImportError(data.error ?? 'Import failed')
      else setImportResult(data)
    } catch (err) {
      setImportError(String(err))
    } finally {
      setImporting(false)
    }
  }

  // ── Session list ────────────────────────────────────────────────────────────
  async function handleFetchList() {
    setFetchingList(true)
    setListError(null)
    setSessionList([])
    setSelected(new Set())
    setImportStatus(new Map())
    try {
      const res = await fetch(`/api/scrape/sessions?year=${year}`)
      const data = await res.json()
      if (!res.ok) setListError(data.error ?? 'Failed to fetch session list')
      else setSessionList(data.sessions ?? [])
    } catch (err) {
      setListError(String(err))
    } finally {
      setFetchingList(false)
    }
  }

  function toggleSelect(sourceId: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  async function handleBatchImport() {
    if (selected.size === 0) return
    setBatchImporting(true)
    setImportStatus(new Map())
    for (const sourceId of selected) {
      const entry = sessionList.find(s => s.sourceId === sourceId)
      setImportStatus(prev => new Map(prev).set(sourceId, 'importing'))
      try {
        const res = await fetch('/api/scrape/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_id: sourceId, day_of_week: entry?.dayOfWeek ?? 'Unknown', session_type: 'club', scoring: 'MP', mode: importMode })
        })
        const data = await res.json()
        if (!res.ok) setImportStatus(prev => new Map(prev).set(sourceId, 'error'))
        else if (data.skipped) setImportStatus(prev => new Map(prev).set(sourceId, 'imp'))
        else setImportStatus(prev => new Map(prev).set(sourceId, 'done'))
      } catch {
        setImportStatus(prev => new Map(prev).set(sourceId, 'error'))
      }
    }
    setBatchImporting(false)
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
  function getStatusType(entry: FetchStatusEntry): 'processed' | 'fetched' | 'skipped' | 'no-pairs' | 'error' | 'pending' {
    if (entry.pair_count > 0 && entry.processed) return 'processed'
    if (entry.pair_count > 0) return 'fetched'
    if (entry.last_skipped) return 'skipped'
    if (entry.last_error?.includes('no pairs found')) return 'no-pairs'
    if (entry.last_error) return 'error'
    return 'pending'
  }

  function fetchStatusBadge(entry: FetchStatusEntry) {
    const type = getStatusType(entry)
    if (type === 'processed') return <span className='text-green-700 font-medium'>Processed ({entry.pair_count})</span>
    if (type === 'fetched')   return <span className='text-blue-600 font-medium'>Fetched ({entry.pair_count})</span>
    if (type === 'skipped')   return <span className='text-gray-400'>Skipped</span>
    if (type === 'no-pairs')  return <span className='text-amber-600 font-medium'>No Pairs</span>
    if (type === 'error')     return <span className='text-red-600 font-medium'>Error</span>
    return <span className='text-gray-500'>Pending</span>
  }

  function selectByType(type: ReturnType<typeof getStatusType>) {
    const seids = fetchStatusList.filter(s => getStatusType(s) === type).map(s => s.se_seid)
    setSelectedForRefetch(new Set(seids))
  }

  const statusCounts = fetchStatusList.reduce((acc, s) => {
    const t = getStatusType(s)
    acc[t] = (acc[t] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const filteredFetchStatus = fetchStatusList.filter(s => {
    if (scoringFilter === 'mp'  && s.se_scoring !== 'MP')  return false
    if (scoringFilter === 'imp' && s.se_scoring !== 'IMP') return false
    if (statusFilter !== 'all' && getStatusType(s) !== statusFilter) return false
    return true
  })

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className='space-y-8'>

      {/* Manual Import */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-3 text-base font-semibold text-gray-800'>Manual Session Import</h2>
        <form onSubmit={handleManualImport} className='space-y-3'>
          <div className='flex flex-wrap gap-3'>
            <div>
              <label className='block text-xs text-gray-600 mb-1'>Source ID</label>
              <input
                type='number'
                value={manualSourceId}
                onChange={e => setManualSourceId(e.target.value)}
                placeholder='e.g. 654558'
                className='rounded border border-gray-300 px-2 py-1 text-sm w-32'
              />
            </div>
          </div>
          <div className='flex items-center gap-4'>
            <button type='submit' disabled={importing}
              className='rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
              {importing ? 'Importing…' : 'Import Session'}
            </button>
            <label className='flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer'>
              <input type='checkbox' checked={importMode === 'reimport'}
                onChange={e => setImportMode(e.target.checked ? 'reimport' : 'skip')} />
              Delete &amp; reimport if exists
            </label>
          </div>
        </form>
        {importError && <div className='mt-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{importError}</div>}
        {importResult && (
          <div className='mt-3 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 space-y-1'>
            <div>Session {importResult.session_id} imported: <strong>{importResult.pairs_imported}</strong> pairs, <strong>{importResult.new_players}</strong> new players</div>
            {(importResult.warnings?.length ?? 0) > 0 && (
              <ul className='list-disc list-inside text-yellow-700 text-xs'>
                {importResult.warnings?.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Session List */}
      <section className='rounded border border-gray-200 p-4'>
        <div className='mb-3 flex items-center gap-3 flex-wrap'>
          <h2 className='text-base font-semibold text-gray-800'>Available Sessions from AKBC</h2>
          <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))}
            className='rounded border border-gray-300 px-2 py-1 text-sm'>
            {[2026, 2025, 2024, 2023, 2022, 2021].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={handleFetchList} disabled={fetchingList}
            className='rounded bg-gray-100 border border-gray-300 px-3 py-1 text-sm hover:bg-gray-200 disabled:opacity-50'>
            {fetchingList ? 'Fetching…' : 'Fetch Session List'}
          </button>
        </div>
        {listError && <div className='rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{listError}</div>}
        {sessionList.length > 0 && (
          <>
            <div className='max-h-64 overflow-y-auto border border-gray-200 rounded mb-3'>
              <table className='w-full text-sm'>
                <thead className='bg-gray-50 sticky top-0'>
                  <tr>
                    <th className='px-3 py-1.5 text-left text-xs text-gray-500 w-8'>
                      <input type='checkbox' title='Select all new'
                        checked={sessionList.some(s => !s.alreadyImported && !s.isImp && importStatus.get(s.sourceId) !== 'imp') &&
                          sessionList.filter(s => !s.alreadyImported && !s.isImp && importStatus.get(s.sourceId) !== 'imp').every(s => selected.has(s.sourceId))}
                        onChange={() => {
                          const newIds = sessionList.filter(s => !s.alreadyImported && !s.isImp && importStatus.get(s.sourceId) !== 'imp').map(s => s.sourceId)
                          const allSelected = newIds.every(id => selected.has(id))
                          setSelected(allSelected ? new Set() : new Set(newIds))
                        }} />
                    </th>
                    <th className='px-3 py-1.5 text-left text-xs text-gray-500'>Date</th>
                    <th className='px-3 py-1.5 text-left text-xs text-gray-500'>Session</th>
                    <th className='px-3 py-1.5 text-left text-xs text-gray-500'>ID</th>
                    <th className='px-3 py-1.5 text-left text-xs text-gray-500'>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionList.map(s => (
                    <tr key={s.sourceId} className={`border-t border-gray-100 ${s.alreadyImported ? 'bg-green-50 text-gray-400' : s.isImp ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50'}`}>
                      <td className='px-3 py-1'>
                        <input type='checkbox' checked={selected.has(s.sourceId)} onChange={() => toggleSelect(s.sourceId)}
                          disabled={s.alreadyImported || s.isImp || importStatus.get(s.sourceId) === 'imp'} />
                      </td>
                      <td className='px-3 py-1 text-xs'>{s.date}</td>
                      <td className='px-3 py-1'>{s.label}</td>
                      <td className='px-3 py-1 font-mono text-xs text-gray-400'>{s.sourceId}</td>
                      <td className='px-3 py-1 text-xs'>
                        {s.alreadyImported ? <span className='text-green-700 font-medium'>Imported</span>
                          : s.isImp ? <span className='text-gray-500 font-medium'>IMP</span>
                          : importStatus.get(s.sourceId) === 'importing' ? <span className='text-yellow-600 font-medium'>Importing…</span>
                          : importStatus.get(s.sourceId) === 'done' ? <span className='text-green-700 font-medium'>Done</span>
                          : importStatus.get(s.sourceId) === 'imp' ? <span className='text-gray-500 font-medium'>IMP</span>
                          : importStatus.get(s.sourceId) === 'error' ? <span className='text-red-600 font-medium'>Error</span>
                          : <span className='text-blue-600 font-medium'>New</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={handleBatchImport} disabled={batchImporting || selected.size === 0}
              className='rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
              {batchImporting ? 'Importing…' : `Import Selected (${selected.size})`}
            </button>
          </>
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
          <button onClick={handleRefetchSelected} disabled={fetchingResults || selectedForRefetch.size === 0}
            className='rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50'>
            Refetch Selected ({selectedForRefetch.size})
          </button>
          <button onClick={loadFetchStatus} disabled={loadingFetchStatus}
            className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
            {loadingFetchStatus ? 'Loading…' : 'Load Status'}
          </button>
        </div>

        {/* Live progress */}
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

        {/* Status table */}
        {fetchStatusError && <div className='rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-2'>{fetchStatusError}</div>}
        {fetchStatusList.length > 0 && (
          <>
            {/* Status summary — click a badge to select all of that type */}
            <div className='flex flex-wrap gap-2 mb-3 text-xs'>
              {statusCounts['processed'] && <button onClick={() => selectByType('processed')} className='rounded-full bg-green-100 text-green-800 px-2.5 py-0.5 hover:bg-green-200'>Processed: {statusCounts['processed']}</button>}
              {statusCounts['fetched']   && <button onClick={() => selectByType('fetched')}   className='rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 hover:bg-blue-200'>Fetched: {statusCounts['fetched']}</button>}
              {statusCounts['pending']   && <button onClick={() => selectByType('pending')}   className='rounded-full bg-gray-100 text-gray-700 px-2.5 py-0.5 hover:bg-gray-200'>Pending: {statusCounts['pending']}</button>}
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
                    <th className='px-2 py-1.5 text-left text-gray-500'>
                      <select value={scoringFilter} onChange={e => setScoringFilter(e.target.value as typeof scoringFilter)}
                        className='rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-xs text-gray-600 font-normal cursor-pointer'>
                        <option value='all'>Type</option>
                        <option value='mp'>MP</option>
                        <option value='imp'>IMP</option>
                      </select>
                    </th>
                    <th className='px-2 py-1.5 text-left text-gray-500'>Source ID</th>
                    <th className='px-2 py-1.5 text-left text-gray-500'>
                      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                        className='rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-xs text-gray-600 font-normal cursor-pointer'>
                        <option value='all'>Status</option>
                        <option value='processed'>Processed</option>
                        <option value='fetched'>Fetched</option>
                        <option value='pending'>Pending</option>
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
                      <td className='px-2 py-1 text-gray-500'>{s.se_scoring}</td>
                      <td className='px-2 py-1 font-mono text-gray-400'>{s.se_source_id}</td>
                      <td className='px-2 py-1'>
                        {fetchingResults && (selectedForRefetch.has(s.se_seid) || (selectedForRefetch.size === 0 && getStatusType(s) === 'pending'))
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
        <button onClick={handleProcessResults} disabled={processingResults}
          className='rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
          {processingResults ? 'Processing…' : 'Process Results'}
        </button>
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
