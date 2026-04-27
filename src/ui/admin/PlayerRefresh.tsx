'use client'

import { useState, useEffect } from 'react'
import HelpButton from './HelpButton'
import {
  HELP_MERGE,
  HELP_CORRECT_SEARCH,
  HELP_CORRECT_ASSIGN,
  HELP_REFRESH_ALL_STATS,
  HELP_RECALC_AVERAGES,
  HELP_RECALC_PARTNERSHIPS,
  HELP_RECALC_DATE_SEQ,
  HELP_POPULATE_RANKS,
  HELP_POPULATE_CLUBS,
  HELP_POPULATE_GRADES,
  HELP_MERGE_CLUBS,
  HELP_AUDIT_STATS,
  HELP_AUDIT_AVERAGES,
} from './adminHelp'
import { populateRanks, populateClubs, populateGrades, mergeClubs, getAllClubs } from '@/src/lib/actions/lookup'
import { auditStats, auditAverages, type AuditCheck } from '@/src/lib/actions/audit'
import AuditResults from './AuditResults'

interface AllProgress    { processed: number; total: number; updated: number; failed: number }
interface AllDone        { done: true; updated: number; failed: number; warnings: string[] }
interface RecalcProgress { step?: string; processed: number; total: number; failed: number }
interface RecalcDone     { done: true; updated: number; failed: number }

export default function PlayerRefresh() {
  // Refresh All Stats
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [allProgress,   setAllProgress]   = useState<AllProgress | null>(null)
  const [allSummary,    setAllSummary]     = useState<AllDone | null>(null)
  const [allError,      setAllError]       = useState<string | null>(null)

  // Merge Players
  const [mergeKeepSearch,      setMergeKeepSearch]      = useState('')
  const [mergeDiscardSearch,   setMergeDiscardSearch]   = useState('')
  const [mergeKeepResults,     setMergeKeepResults]     = useState<any[]>([])
  const [mergeDiscardResults,  setMergeDiscardResults]  = useState<any[]>([])
  const [mergeKeepSelected,    setMergeKeepSelected]    = useState<{ plid: number; name: string } | null>(null)
  const [mergeDiscardSelected, setMergeDiscardSelected] = useState<{ plid: number; name: string } | null>(null)
  const [merging,     setMerging]     = useState(false)
  const [mergeMsg,    setMergeMsg]    = useState<string | null>(null)
  const [mergeError,  setMergeError]  = useState<string | null>(null)

  // Correct NZ Numbers
  const [correctSearch,    setCorrectSearch]    = useState('')
  const [correctResults,   setCorrectResults]   = useState<any[]>([])
  const [correctSearching, setCorrectSearching] = useState(false)
  const [correctingName,   setCorrectingName]   = useState<string | null>(null)
  const [correctNzInputs,  setCorrectNzInputs]  = useState<Record<string, string>>({})
  const [correctError,     setCorrectError]     = useState<string | null>(null)
  const [correctMsg,       setCorrectMsg]       = useState<string | null>(null)

  // Recalculate
  const [recalcAverages,    setRecalcAverages]    = useState(false)
  const [avgProgress,       setAvgProgress]       = useState<RecalcProgress | null>(null)
  const [avgSummary,        setAvgSummary]        = useState<RecalcDone | null>(null)
  const [avgError,          setAvgError]          = useState<string | null>(null)

  const [recalcPartners,    setRecalcPartners]    = useState(false)
  const [partnersProgress,  setPartnersProgress]  = useState<RecalcProgress | null>(null)
  const [partnersSummary,   setPartnersSummary]   = useState<RecalcDone | null>(null)
  const [partnersError,     setPartnersError]     = useState<string | null>(null)

  const [recalcDateSeq,     setRecalcDateSeq]     = useState(false)
  const [dateSeqSummary,    setDateSeqSummary]    = useState<RecalcDone | null>(null)
  const [dateSeqError,      setDateSeqError]      = useState<string | null>(null)

  // Audit
  const [auditStatsResult,  setAuditStatsResult]  = useState<AuditCheck[] | null>(null)
  const [auditStatsRunning, setAuditStatsRunning] = useState(false)
  const [auditStatsError,   setAuditStatsError]   = useState<string | null>(null)
  const [auditAvgResult,    setAuditAvgResult]    = useState<AuditCheck[] | null>(null)
  const [auditAvgRunning,   setAuditAvgRunning]   = useState(false)
  const [auditAvgError,     setAuditAvgError]     = useState<string | null>(null)

  // Merge Clubs
  const [mergeClubFrom,  setMergeClubFrom]  = useState('')
  const [mergeClubTo,    setMergeClubTo]    = useState('')
  const [mergingClub,    setMergingClub]    = useState(false)
  const [mergeClubMsg,   setMergeClubMsg]   = useState<string | null>(null)
  const [mergeClubError, setMergeClubError] = useState<string | null>(null)
  const [clubOptions,    setClubOptions]    = useState<string[]>([])

  // Populate lookup tables
  const [populatingRanks,  setPopulatingRanks]  = useState(false)
  const [rankMsg,          setRankMsg]          = useState<string | null>(null)
  const [rankError,        setRankError]        = useState<string | null>(null)
  const [populatingClubs,  setPopulatingClubs]  = useState(false)
  const [clubMsg,          setClubMsg]          = useState<string | null>(null)
  const [clubError,        setClubError]        = useState<string | null>(null)
  const [populatingGrades, setPopulatingGrades] = useState(false)
  const [gradeMsg,         setGradeMsg]         = useState<string | null>(null)
  const [gradeError,       setGradeError]       = useState<string | null>(null)

  useEffect(() => {
    getAllClubs().then(rows => setClubOptions((rows as { cl_club: string }[]).map(r => r.cl_club))).catch(() => {})
  }, [])

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
  async function handleRefreshAll() {
    setRefreshingAll(true); setAllProgress(null); setAllSummary(null); setAllError(null)
    try {
      const res = await fetch('/api/players/refresh', { method: 'POST' })
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

  async function handleCorrectSearch() {
    if (correctSearch.trim().length < 2) return
    setCorrectSearching(true); setCorrectResults([]); setCorrectError(null); setCorrectMsg(null)
    try {
      const res = await fetch(`/api/players/correct?q=${encodeURIComponent(correctSearch.trim())}`)
      if (res.ok) setCorrectResults(await res.json())
      else setCorrectError('Search failed')
    } catch (err) { setCorrectError(String(err)) }
    finally { setCorrectSearching(false) }
  }

  async function handleCorrectAssign(plName: string) {
    const nzNumber = parseInt(correctNzInputs[plName] ?? '', 10)
    if (!nzNumber || nzNumber <= 0) { setCorrectError(`Enter a valid NZ# for ${plName}`); return }
    setCorrectingName(plName); setCorrectError(null); setCorrectMsg(null)
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
      }
    } catch (err) { setCorrectError(String(err)) }
    finally { setCorrectingName(null) }
  }

  async function searchMergePlayers(query: string, side: 'keep' | 'discard') {
    if (query.trim().length < 2) { side === 'keep' ? setMergeKeepResults([]) : setMergeDiscardResults([]); return }
    try {
      const res = await fetch(`/api/players/correct?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        side === 'keep' ? setMergeKeepResults(data) : setMergeDiscardResults(data)
      }
    } catch { /* ignore */ }
  }

  async function handleMerge() {
    if (!mergeKeepSelected || !mergeDiscardSelected) return
    setMerging(true); setMergeMsg(null); setMergeError(null)
    try {
      const res = await fetch('/api/players/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_plid: mergeKeepSelected.plid, discard_plid: mergeDiscardSelected.plid })
      })
      const data = await res.json()
      if (!res.ok) setMergeError(data.error ?? 'Merge failed')
      else {
        setMergeMsg(`Merged "${mergeDiscardSelected.name}" into "${mergeKeepSelected.name}". Averages and partnerships recalculated automatically.`)
        setMergeKeepSelected(null); setMergeDiscardSelected(null)
        setMergeKeepSearch(''); setMergeDiscardSearch('')
        setMergeKeepResults([]); setMergeDiscardResults([])
      }
    } catch (err) { setMergeError(String(err)) }
    finally { setMerging(false) }
  }

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

  async function handlePopulateRanks() {
    setPopulatingRanks(true); setRankMsg(null); setRankError(null)
    try { const r = await populateRanks(); setRankMsg(`Done · ${r.inserted} ranks`) }
    catch (err) { setRankError(String(err)) }
    finally { setPopulatingRanks(false) }
  }

  async function handlePopulateClubs() {
    setPopulatingClubs(true); setClubMsg(null); setClubError(null)
    try {
      const r = await populateClubs()
      setClubMsg(`Done · ${r.inserted} clubs`)
      getAllClubs().then(rows => setClubOptions((rows as { cl_club: string }[]).map(r => r.cl_club))).catch(() => {})
    }
    catch (err) { setClubError(String(err)) }
    finally { setPopulatingClubs(false) }
  }

  async function handlePopulateGrades() {
    setPopulatingGrades(true); setGradeMsg(null); setGradeError(null)
    try { const r = await populateGrades(); setGradeMsg(`Done · ${r.inserted} grades`) }
    catch (err) { setGradeError(String(err)) }
    finally { setPopulatingGrades(false) }
  }

  async function handleAuditStats() {
    setAuditStatsRunning(true); setAuditStatsError(null)
    try { setAuditStatsResult(await auditStats()) }
    catch (err) { setAuditStatsError(String(err)) }
    finally { setAuditStatsRunning(false) }
  }

  async function handleAuditAverages() {
    setAuditAvgRunning(true); setAuditAvgError(null)
    try { setAuditAvgResult(await auditAverages()) }
    catch (err) { setAuditAvgError(String(err)) }
    finally { setAuditAvgRunning(false) }
  }

  async function handleMergeClub() {
    if (!mergeClubFrom || !mergeClubTo || mergeClubFrom === mergeClubTo) return
    setMergingClub(true); setMergeClubMsg(null); setMergeClubError(null)
    try {
      const r = await mergeClubs(mergeClubFrom, mergeClubTo)
      setMergeClubMsg(`Done · ${r.updated} players updated`)
      setMergeClubFrom('')
      setClubOptions(clubOptions.filter(c => c !== mergeClubFrom))
    } catch (err) { setMergeClubError(String(err)) }
    finally { setMergingClub(false) }
  }

  const anyRunning = refreshingAll || recalcAverages || recalcPartners || recalcDateSeq

  return (
    <div className='space-y-4'>

      {/* Refresh All Stats */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Refresh All Stats</h2>
        <p className='mb-3 text-xs text-gray-400'>Updates grade, rating and points for all players with a NZ bridge number, from ts7 raw data.</p>
        <div className='flex items-center gap-2'>
          <button onClick={handleRefreshAll} disabled={anyRunning}
            className='rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
            {refreshingAll ? 'Refreshing…' : 'Refresh All Stats'}
          </button>
          <HelpButton>{HELP_REFRESH_ALL_STATS}</HelpButton>
          <button onClick={handleAuditStats} disabled={auditStatsRunning}
            className='rounded bg-amber-50 border border-amber-300 px-3 py-1.5 text-sm hover:bg-amber-100 disabled:opacity-50'>
            {auditStatsRunning ? 'Auditing…' : 'Audit'}
          </button>
          <HelpButton>{HELP_AUDIT_STATS}</HelpButton>
        </div>
        <AuditResults checks={auditStatsResult} error={auditStatsError} />
        {allProgress && (
          <div className='mt-3 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800'>
            Refreshing: <strong>{allProgress.processed}</strong> / <strong>{allProgress.total}</strong>
            · Updated: {allProgress.updated} · Failed: {allProgress.failed}
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

      {/* Merge Players */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Merge Players</h2>
        <p className='mb-3 text-xs text-gray-400'>Fix duplicate player records caused by name spelling differences. Updates all raw and result rows, deletes the discarded record, then recalculates averages and partnerships automatically.</p>
        <div className='flex flex-wrap gap-6 mb-3'>
          <div className='flex-1 min-w-48'>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Name to keep</label>
            <input type='text' value={mergeKeepSearch}
              onChange={e => { setMergeKeepSearch(e.target.value); setMergeKeepSelected(null); searchMergePlayers(e.target.value, 'keep') }}
              placeholder='Search…'
              className='w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400' />
            {mergeKeepResults.length > 0 && !mergeKeepSelected && (
              <ul className='border border-gray-200 rounded mt-1 bg-white shadow text-sm max-h-40 overflow-y-auto'>
                {mergeKeepResults.map((p: any) => (
                  <li key={p.pl_plid} className='px-3 py-1.5 hover:bg-blue-50 cursor-pointer'
                    onClick={() => { setMergeKeepSelected({ plid: p.pl_plid, name: p.pl_name }); setMergeKeepSearch(p.pl_name); setMergeKeepResults([]) }}>
                    {p.pl_name} <span className='text-gray-400 text-xs'>#{p.pl_plid}</span>
                  </li>
                ))}
              </ul>
            )}
            {mergeKeepSelected && <div className='mt-1 text-xs text-green-700 font-medium'>✓ {mergeKeepSelected.name} (#{mergeKeepSelected.plid})</div>}
          </div>
          <div className='flex-1 min-w-48'>
            <label className='block text-xs font-medium text-gray-600 mb-1'>Name to discard (duplicate)</label>
            <input type='text' value={mergeDiscardSearch}
              onChange={e => { setMergeDiscardSearch(e.target.value); setMergeDiscardSelected(null); searchMergePlayers(e.target.value, 'discard') }}
              placeholder='Search…'
              className='w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400' />
            {mergeDiscardResults.length > 0 && !mergeDiscardSelected && (
              <ul className='border border-gray-200 rounded mt-1 bg-white shadow text-sm max-h-40 overflow-y-auto'>
                {mergeDiscardResults.map((p: any) => (
                  <li key={p.pl_plid} className='px-3 py-1.5 hover:bg-blue-50 cursor-pointer'
                    onClick={() => { setMergeDiscardSelected({ plid: p.pl_plid, name: p.pl_name }); setMergeDiscardSearch(p.pl_name); setMergeDiscardResults([]) }}>
                    {p.pl_name} <span className='text-gray-400 text-xs'>#{p.pl_plid}</span>
                  </li>
                ))}
              </ul>
            )}
            {mergeDiscardSelected && <div className='mt-1 text-xs text-amber-700 font-medium'>✗ {mergeDiscardSelected.name} (#{mergeDiscardSelected.plid})</div>}
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <button onClick={handleMerge} disabled={!mergeKeepSelected || !mergeDiscardSelected || merging}
            className='rounded bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50'>
            {merging ? 'Merging…' : 'Merge (cannot be undone)'}
          </button>
          <HelpButton>{HELP_MERGE}</HelpButton>
        </div>
        {mergeError && <div className='mt-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{mergeError}</div>}
        {mergeMsg   && <div className='mt-3 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800'>{mergeMsg}</div>}
      </section>

      {/* Correct NZ Numbers */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Correct NZ Numbers</h2>
        <p className='mb-3 text-xs text-gray-400'>Manually fix a player's NZ bridge number. Search by name, enter the correct NZ#, then click Correct.</p>
        <div className='flex gap-2 mb-3'>
          <input type='text' value={correctSearch}
            onChange={e => setCorrectSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCorrectSearch()}
            placeholder='Search player name…'
            className='rounded border border-gray-300 px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-blue-400' />
          <button onClick={handleCorrectSearch} disabled={correctSearching || correctSearch.trim().length < 2}
            className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
            {correctSearching ? 'Searching…' : 'Search'}
          </button>
          <HelpButton>{HELP_CORRECT_SEARCH}</HelpButton>
        </div>
        {correctError && <div className='mb-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{correctError}</div>}
        {correctMsg   && <div className='mb-2 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800'>{correctMsg}</div>}
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
                      <input type='number'
                        value={correctNzInputs[row.pl_name] ?? ''}
                        onChange={e => setCorrectNzInputs(prev => ({ ...prev, [row.pl_name]: e.target.value }))}
                        placeholder='NZ#'
                        className='w-full rounded border border-gray-300 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400' />
                    </td>
                    <td className='py-1 text-right'>
                      <div className='flex items-center gap-1 justify-end'>
                        <button onClick={() => handleCorrectAssign(row.pl_name)}
                          disabled={correctingName !== null || !correctNzInputs[row.pl_name]}
                          className='rounded bg-blue-600 px-2 py-0.5 text-white hover:bg-blue-700 disabled:opacity-50'>
                          {correctingName === row.pl_name ? 'Saving…' : 'Correct'}
                        </button>
                        <HelpButton>{HELP_CORRECT_ASSIGN}</HelpButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
            {avgError && <div className='mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{avgError}</div>}
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
            {partnersError && <div className='mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{partnersError}</div>}
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
            {dateSeqError && <div className='mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{dateSeqError}</div>}
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

      {/* Populate Lookup Tables */}
      <section className='rounded border border-gray-200 p-4'>
        <h2 className='mb-1 text-base font-semibold text-gray-800'>Populate Lookup Tables</h2>
        <p className='mb-3 text-xs text-gray-400'>Refreshes the rank, club and grade lookup tables from current player data. Run after Refresh All Stats to capture any new values.</p>
        <div className='space-y-3'>
          <div>
            <div className='flex items-center gap-2'>
              <button onClick={handlePopulateRanks} disabled={populatingRanks}
                className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
                {populatingRanks ? 'Populating…' : 'Populate Ranks'}
              </button>
              <HelpButton>{HELP_POPULATE_RANKS}</HelpButton>
            </div>
            {rankError && <div className='mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{rankError}</div>}
            {rankMsg   && <div className='mt-2 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800'>{rankMsg}</div>}
          </div>
          <div>
            <div className='flex items-center gap-2'>
              <button onClick={handlePopulateClubs} disabled={populatingClubs}
                className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
                {populatingClubs ? 'Populating…' : 'Populate Clubs'}
              </button>
              <HelpButton>{HELP_POPULATE_CLUBS}</HelpButton>
            </div>
            {clubError && <div className='mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{clubError}</div>}
            {clubMsg   && <div className='mt-2 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800'>{clubMsg}</div>}
          </div>
          <div>
            <div className='flex items-center gap-2'>
              <button onClick={handlePopulateGrades} disabled={populatingGrades}
                className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50'>
                {populatingGrades ? 'Populating…' : 'Populate Grades'}
              </button>
              <HelpButton>{HELP_POPULATE_GRADES}</HelpButton>
            </div>
            {gradeError && <div className='mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{gradeError}</div>}
            {gradeMsg   && <div className='mt-2 rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800'>{gradeMsg}</div>}
          </div>
          <div className='border-t border-gray-100 pt-3'>
            <div className='flex items-center gap-2 flex-wrap'>
              <select value={mergeClubFrom} onChange={e => setMergeClubFrom(e.target.value)}
                className='rounded border border-gray-300 px-2 py-1 text-sm min-w-40'>
                <option value=''>From club…</option>
                {clubOptions.map(c => <option key={c}>{c}</option>)}
              </select>
              <span className='text-xs text-gray-400'>→</span>
              <select value={mergeClubTo} onChange={e => setMergeClubTo(e.target.value)}
                className='rounded border border-gray-300 px-2 py-1 text-sm min-w-40'>
                <option value=''>Into club…</option>
                {clubOptions.map(c => <option key={c}>{c}</option>)}
              </select>
              <button onClick={handleMergeClub}
                disabled={mergingClub || !mergeClubFrom || !mergeClubTo || mergeClubFrom === mergeClubTo}
                className='rounded bg-red-50 border border-red-300 px-3 py-1.5 text-sm hover:bg-red-100 disabled:opacity-50'>
                {mergingClub ? 'Merging…' : 'Merge Club'}
              </button>
              <HelpButton>{HELP_MERGE_CLUBS}</HelpButton>
              {mergeClubMsg && <span className='text-xs text-green-600'>{mergeClubMsg}</span>}
            </div>
            {mergeClubError && <div className='mt-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{mergeClubError}</div>}
          </div>
        </div>
      </section>

    </div>
  )
}
