'use client'

import { useState, useEffect } from 'react'

interface PlayerCounts {
  withNumber: number
  withoutNumber: number
}

interface AmbiguousRow {
  am_amid: number
  am_search_name: string
  am_nz_number: number
  am_nz_name: string
  am_club: string
}

interface MissingProgress   { processed: number; total: number; updated: number; failed: number; ambiguous: number }
interface MissingDone       { done: true; updated: number; failed: number; ambiguous: number; warnings: string[] }
interface AllProgress       { processed: number; total: number; updated: number; failed: number }
interface AllDone           { done: true; updated: number; failed: number; warnings: string[] }
interface RecalcProgress    { step?: string; processed: number; total: number; failed: number }
interface RecalcDone        { done: true; updated: number; failed: number }

export default function PlayerRefresh() {
  const [counts, setCounts] = useState<PlayerCounts | null>(null)

  // Fill Missing
  const [fillingMissing, setFillingMissing] = useState(false)
  const [missingProgress, setMissingProgress] = useState<MissingProgress | null>(null)
  const [missingSummary, setMissingSummary] = useState<MissingDone | null>(null)
  const [missingError, setMissingError] = useState<string | null>(null)
  const [missingList, setMissingList] = useState<{ pl_plid: number; pl_name: string }[] | null>(null)
  const [loadingMissingList, setLoadingMissingList] = useState(false)

  // Ambiguous
  const [ambiguousRows, setAmbiguousRows] = useState<AmbiguousRow[]>([])
  const [loadingAmbiguous, setLoadingAmbiguous] = useState(false)
  const [assigningAmid, setAssigningAmid] = useState<number | null>(null)
  const [ambiguousError, setAmbiguousError] = useState<string | null>(null)

  // Correct NZ Numbers
  const [correctSearch, setCorrectSearch] = useState('')
  const [correctResults, setCorrectResults] = useState<any[]>([])
  const [correctSearching, setCorrectSearching] = useState(false)
  const [correctingName, setCorrectingName] = useState<string | null>(null)
  const [correctNzInputs, setCorrectNzInputs] = useState<Record<string, string>>({})
  const [correctError, setCorrectError] = useState<string | null>(null)
  const [correctMsg, setCorrectMsg] = useState<string | null>(null)

  // Refresh All Stats
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [allProgress, setAllProgress] = useState<AllProgress | null>(null)
  const [allSummary, setAllSummary] = useState<AllDone | null>(null)
  const [allError, setAllError] = useState<string | null>(null)

  // Recalculate
  const [recalcAverages, setRecalcAverages] = useState(false)
  const [avgProgress, setAvgProgress] = useState<RecalcProgress | null>(null)
  const [avgSummary, setAvgSummary] = useState<RecalcDone | null>(null)
  const [avgError, setAvgError] = useState<string | null>(null)

  const [recalcPartners, setRecalcPartners] = useState(false)
  const [partnersProgress, setPartnersProgress] = useState<RecalcProgress | null>(null)
  const [partnersSummary, setPartnersSummary] = useState<RecalcDone | null>(null)
  const [partnersError, setPartnersError] = useState<string | null>(null)

  const [recalcDateSeq, setRecalcDateSeq] = useState(false)
  const [dateSeqSummary, setDateSeqSummary] = useState<RecalcDone | null>(null)
  const [dateSeqError, setDateSeqError] = useState<string | null>(null)

  async function loadCounts() {
    try {
      const res = await fetch('/api/players/refresh')
      if (res.ok) setCounts(await res.json())
    } catch {}
  }

  async function loadAmbiguous() {
    setLoadingAmbiguous(true)
    setAmbiguousError(null)
    try {
      const res = await fetch('/api/players/ambiguous')
      if (res.ok) setAmbiguousRows(await res.json())
      else setAmbiguousError('Failed to load ambiguous players')
    } catch (err) { setAmbiguousError(String(err)) }
    finally { setLoadingAmbiguous(false) }
  }

  async function loadMissingList() {
    setLoadingMissingList(true)
    try {
      const res = await fetch('/api/players/refresh?list=missing')
      if (res.ok) setMissingList(await res.json())
    } catch {}
    finally { setLoadingMissingList(false) }
  }

  useEffect(() => { loadCounts(); loadAmbiguous() }, [])

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
  async function handleFillMissing() {
    setFillingMissing(true)
    setMissingProgress(null)
    setMissingSummary(null)
    setMissingError(null)
    try {
      const res = await fetch('/api/players/refresh?mode=missing', { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setMissingError(d.error ?? 'Failed'); return }
      await readSSE<MissingProgress, MissingDone>(
        res,
        evt => setMissingProgress(evt),
        evt => { setMissingSummary(evt); setMissingProgress(null); loadCounts(); loadAmbiguous() },
        msg => setMissingError(msg)
      )
    } catch (err) { setMissingError(String(err)) }
    finally { setFillingMissing(false) }
  }

  async function handleAssign(searchName: string, nzNumber: number, amid: number) {
    setAssigningAmid(amid)
    setAmbiguousError(null)
    try {
      const res = await fetch('/api/players/ambiguous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_name: searchName, nz_number: nzNumber })
      })
      const data = await res.json()
      if (!res.ok) setAmbiguousError(data.error ?? 'Assign failed')
      else { setAmbiguousRows(prev => prev.filter(r => r.am_search_name !== searchName)); loadCounts() }
    } catch (err) { setAmbiguousError(String(err)) }
    finally { setAssigningAmid(null) }
  }

  async function handleCorrectSearch() {
    if (correctSearch.trim().length < 2) return
    setCorrectSearching(true)
    setCorrectResults([])
    setCorrectError(null)
    setCorrectMsg(null)
    try {
      const res = await fetch(`/api/players/correct?q=${encodeURIComponent(correctSearch.trim())}`)
      if (res.ok) setCorrectResults(await res.json())
      else setCorrectError('Search failed')
    } catch (err) { setCorrectError(String(err)) }
    finally { setCorrectSearching(false) }
  }

  async function handleCorrectAssign(plName: string) {
    const nzStr = correctNzInputs[plName] ?? ''
    const nzNumber = parseInt(nzStr, 10)
    if (!nzNumber || nzNumber <= 0) { setCorrectError(`Enter a valid NZ# for ${plName}`); return }
    setCorrectingName(plName)
    setCorrectError(null)
    setCorrectMsg(null)
    try {
      const res = await fetch('/api/players/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pl_name: plName, nz_number: nzNumber })
      })
      const data = await res.json()
      if (!res.ok) setCorrectError(data.error ?? 'Correction failed')
      else {
        setCorrectMsg(`Corrected "${plName}" → NZ# ${data.nz_number} (${data.nz_name})`)
        setCorrectResults(prev => prev.map(r => r.pl_name === plName ? { ...r, pl_nz_bridge_number: nzNumber } : r))
        loadCounts()
      }
    } catch (err) { setCorrectError(String(err)) }
    finally { setCorrectingName(null) }
  }

  async function handleRefreshAll() {
    setRefreshingAll(true)
    setAllProgress(null)
    setAllSummary(null)
    setAllError(null)
    try {
      const res = await fetch('/api/players/refresh?mode=all', { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setAllError(d.error ?? 'Failed'); return }
      await readSSE<AllProgress, AllDone>(
        res,
        evt => setAllProgress(evt),
        evt => { setAllSummary(evt); setAllProgress(null) },
        msg => setAllError(msg)
      )
    } catch (err) { setAllError(String(err)) }
    finally { setRefreshingAll(false) }
  }

  async function handleRecalcAverages() {
    setRecalcAverages(true)
    setAvgProgress(null)
    setAvgSummary(null)
    setAvgError(null)
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
    setRecalcPartners(true)
    setPartnersProgress(null)
    setPartnersSummary(null)
    setPartnersError(null)
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
    setRecalcDateSeq(true)
    setDateSeqSummary(null)
    setDateSeqError(null)
    try {
      const res = await fetch('/api/players/recalculate?mode=dateseq', { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setDateSeqError(d.error ?? 'Failed'); return }
      await readSSE<RecalcProgress, RecalcDone>(
        res,
        () => {},
        evt => { setDateSeqSummary(evt) },
        msg => setDateSeqError(msg)
      )
    } catch (err) { setDateSeqError(String(err)) }
    finally { setRecalcDateSeq(false) }
  }

  const anyRunning = fillingMissing || refreshingAll || recalcAverages || recalcPartners || recalcDateSeq

  return (
    <div className='space-y-4'>

      {/* Stage 4 — Fill Missing NZ Numbers */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Stage 4 — Fill Missing NZ Numbers</h2>
        <p className='mb-3 text-xs text-gray-400'>Looks up players without an NZ bridge number by name on nzbridge.co.nz.</p>

        {counts && (
          <div className='mb-3 flex gap-4 text-sm items-center'>
            <span className='text-gray-600'>With NZ#: <strong className='text-gray-900'>{counts.withNumber}</strong></span>
            <span className='text-gray-600'>
              Without NZ#:{' '}
              <button
                onClick={() => missingList ? setMissingList(null) : loadMissingList()}
                disabled={loadingMissingList}
                className='font-bold text-amber-700 underline decoration-dotted hover:text-amber-900 disabled:opacity-50'>
                {loadingMissingList ? '…' : counts.withoutNumber}
              </button>
              <span className='ml-1 text-xs text-gray-400'>(click to {missingList ? 'hide' : 'show'})</span>
            </span>
          </div>
        )}

        {missingList && (
          <div className='mb-3 rounded border border-amber-200 bg-amber-50 p-3'>
            <div className='mb-1 text-xs font-medium text-amber-800'>{missingList.length} players without NZ# — names as stored in DB:</div>
            <div className='max-h-48 overflow-y-auto columns-2 gap-4 text-xs text-gray-700'>
              {missingList.map(p => <div key={p.pl_plid}>{p.pl_name}</div>)}
            </div>
          </div>
        )}

        <button onClick={handleFillMissing} disabled={anyRunning}
          className='rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
          {fillingMissing ? 'Filling…' : 'Fill Missing NZ Numbers'}
        </button>

        {missingProgress && (
          <div className='mt-3 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800'>
            Filling: <strong>{missingProgress.processed}</strong> / <strong>{missingProgress.total}</strong>
            · Updated: {missingProgress.updated}
            · Failed: {missingProgress.failed}
            · Ambiguous: {missingProgress.ambiguous}
          </div>
        )}
        {missingError && <div className='mt-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{missingError}</div>}
        {missingSummary && (
          <div className='mt-3 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 space-y-1'>
            <div>Done · Updated: <strong>{missingSummary.updated}</strong> · Failed: <strong>{missingSummary.failed}</strong>
              {missingSummary.ambiguous > 0 && <> · Ambiguous: <strong className='text-amber-700'>{missingSummary.ambiguous}</strong></>}
            </div>
            {missingSummary.ambiguous > 0 && <div className='text-xs text-amber-700'>Review ambiguous players below.</div>}
            {missingSummary.warnings.length > 0 && (
              <ul className='list-disc list-inside text-yellow-700 text-xs mt-1'>
                {missingSummary.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* Ambiguous Players */}
        <div className='mt-4 border-t border-gray-200 pt-4'>
          <div className='flex items-center gap-3 mb-2'>
            <h3 className='text-sm font-semibold text-gray-700'>Ambiguous Players</h3>
            <button onClick={loadAmbiguous} disabled={loadingAmbiguous}
              className='text-xs text-blue-600 hover:underline disabled:opacity-50'>
              {loadingAmbiguous ? 'Loading…' : 'Refresh'}
            </button>
            {ambiguousRows.length > 0 && (
              <span className='text-xs text-amber-700 font-medium'>{ambiguousRows.length} pending</span>
            )}
          </div>
          {ambiguousError && <div className='rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-2'>{ambiguousError}</div>}
          {ambiguousRows.length === 0 && !loadingAmbiguous
            ? <div className='text-xs text-gray-400'>No ambiguous players pending review.</div>
            : ambiguousRows.length > 0 && (
              <div className='overflow-x-auto'>
                <table className='w-full text-xs'>
                  <thead>
                    <tr className='border-b border-gray-200'>
                      <th className='py-1.5 text-left text-gray-500 font-medium'>Search Name</th>
                      <th className='py-1.5 text-left text-gray-500 font-medium w-16'>NZ#</th>
                      <th className='py-1.5 text-left text-gray-500 font-medium'>NZ Name</th>
                      <th className='py-1.5 text-left text-gray-500 font-medium'>Club</th>
                      <th className='py-1.5 w-20'></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ambiguousRows.map(row => (
                      <tr key={row.am_amid} className='border-b border-gray-100 hover:bg-gray-50'>
                        <td className='py-1 pr-2'>{row.am_search_name}</td>
                        <td className='py-1 pr-2 text-gray-400'>{row.am_nz_number}</td>
                        <td className='py-1 pr-2'>{row.am_nz_name}</td>
                        <td className='py-1 pr-2 text-gray-500'>{row.am_club}</td>
                        <td className='py-1 text-right'>
                          <button onClick={() => handleAssign(row.am_search_name, row.am_nz_number, row.am_amid)}
                            disabled={assigningAmid !== null}
                            className='rounded bg-blue-600 px-2 py-0.5 text-white hover:bg-blue-700 disabled:opacity-50'>
                            {assigningAmid === row.am_amid ? 'Assigning…' : 'Assign'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      </section>

      {/* Stage 4b — Correct NZ Numbers */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Stage 4b — Correct NZ Numbers</h2>
        <p className='mb-3 text-xs text-gray-400'>Manually fix a player's NZ bridge number. Search by name, enter the correct NZ#, then click Correct.</p>

        <div className='flex gap-2 mb-3'>
          <input
            type='text'
            value={correctSearch}
            onChange={e => setCorrectSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCorrectSearch()}
            placeholder='Search player name…'
            className='rounded border border-gray-300 px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-blue-400'
          />
          <button onClick={handleCorrectSearch} disabled={correctSearching || correctSearch.trim().length < 2}
            className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
            {correctSearching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {correctError && <div className='mb-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{correctError}</div>}
        {correctMsg  && <div className='mb-2 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800'>{correctMsg}</div>}

        {correctResults.length > 0 && (
          <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
              <thead>
                <tr className='border-b border-gray-200'>
                  <th className='py-1.5 text-left text-gray-500 font-medium'>Name</th>
                  <th className='py-1.5 text-left text-gray-500 font-medium w-20'>Current NZ#</th>
                  <th className='py-1.5 text-left text-gray-500 font-medium w-28'>Correct NZ#</th>
                  <th className='py-1.5 w-20'></th>
                </tr>
              </thead>
              <tbody>
                {correctResults.map(row => (
                  <tr key={row.pl_plid} className='border-b border-gray-100 hover:bg-gray-50'>
                    <td className='py-1 pr-2'>{row.pl_name}</td>
                    <td className='py-1 pr-2 text-gray-400'>{row.pl_nz_bridge_number || '—'}</td>
                    <td className='py-1 pr-2'>
                      <input
                        type='number'
                        value={correctNzInputs[row.pl_name] ?? ''}
                        onChange={e => setCorrectNzInputs(prev => ({ ...prev, [row.pl_name]: e.target.value }))}
                        placeholder='NZ#'
                        className='w-full rounded border border-gray-300 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400'
                      />
                    </td>
                    <td className='py-1 text-right'>
                      <button
                        onClick={() => handleCorrectAssign(row.pl_name)}
                        disabled={correctingName !== null || !correctNzInputs[row.pl_name]}
                        className='rounded bg-blue-600 px-2 py-0.5 text-white hover:bg-blue-700 disabled:opacity-50'>
                        {correctingName === row.pl_name ? 'Saving…' : 'Correct'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Stage 5 — Refresh All Stats */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Stage 5 — Refresh All Stats</h2>
        <p className='mb-3 text-xs text-gray-400'>Updates grade, rating and points for all players via their NZ bridge number.</p>

        <button onClick={handleRefreshAll} disabled={anyRunning}
          className='rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
          {refreshingAll ? 'Refreshing…' : 'Refresh All Stats'}
        </button>

        {allProgress && (
          <div className='mt-3 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800'>
            Refreshing: <strong>{allProgress.processed}</strong> / <strong>{allProgress.total}</strong>
            · Updated: {allProgress.updated}
            · Failed: {allProgress.failed}
          </div>
        )}
        {allError && <div className='mt-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{allError}</div>}
        {allSummary && (
          <div className='mt-3 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 space-y-1'>
            <div>Done · Updated: <strong>{allSummary.updated}</strong> · Failed: <strong>{allSummary.failed}</strong></div>
            {allSummary.warnings.length > 0 && (
              <ul className='list-disc list-inside text-yellow-700 text-xs mt-1'>
                {allSummary.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Stage 6 — Recalculate */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Stage 6 — Recalculate</h2>
        <p className='mb-3 text-xs text-gray-400'>Recompute averages, partnership stats and session date sequence from stored results.</p>

        <div className='space-y-4'>

          {/* Averages */}
          <div>
            <button onClick={handleRecalcAverages} disabled={anyRunning}
              className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
              {recalcAverages ? 'Recalculating…' : 'Recalculate Averages'}
            </button>
            {avgProgress && (
              <div className='mt-2 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800'>
                {avgProgress.step === 'counts' ? 'Session counts' : 'Averages'}:&nbsp;
                <strong>{avgProgress.processed}</strong> / <strong>{avgProgress.total}</strong>
                {avgProgress.failed > 0 && <> · Failed: <strong className='text-red-700'>{avgProgress.failed}</strong></>}
              </div>
            )}
            {avgError && <div className='mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{avgError}</div>}
            {avgSummary && (
              <div className='mt-2 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800'>
                Done · Updated: <strong>{avgSummary.updated}</strong>
                {avgSummary.failed > 0 && <> · Failed: <strong className='text-red-700'>{avgSummary.failed}</strong></>}
              </div>
            )}
          </div>

          {/* Partnerships */}
          <div>
            <button onClick={handleRecalcPartners} disabled={anyRunning}
              className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
              {recalcPartners ? 'Recalculating…' : 'Recalculate Partnerships'}
            </button>
            {partnersProgress && (
              <div className='mt-2 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800'>
                Partnerships: <strong>{partnersProgress.processed}</strong> / <strong>{partnersProgress.total}</strong>
                {partnersProgress.failed > 0 && <> · Failed: <strong className='text-red-700'>{partnersProgress.failed}</strong></>}
              </div>
            )}
            {partnersError && <div className='mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{partnersError}</div>}
            {partnersSummary && (
              <div className='mt-2 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800'>
                Done · Updated: <strong>{partnersSummary.updated}</strong>
                {partnersSummary.failed > 0 && <> · Failed: <strong className='text-red-700'>{partnersSummary.failed}</strong></>}
              </div>
            )}
          </div>

          {/* Date Seq */}
          <div>
            <button onClick={handleRecalcDateSeq} disabled={anyRunning}
              className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
              {recalcDateSeq ? 'Recalculating…' : 'Recalculate Date Seq'}
            </button>
            {dateSeqError && <div className='mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{dateSeqError}</div>}
            {dateSeqSummary && (
              <div className='mt-2 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800'>
                Done · Updated: <strong>{dateSeqSummary.updated}</strong> sessions
              </div>
            )}
          </div>

        </div>
      </section>

    </div>
  )
}
