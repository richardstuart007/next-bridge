'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ClubSelect, GradeSelect, RankSelect } from '@/src/ui/shared/LookupSelects'
import MyPagination from 'nextjs-shared/MyPagination'

interface Player {
  pl_plid: number
  pl_name: string
  pl_nz_bridge_number: number
  pl_rank: string
  pl_grade: string
  pl_club: string
  pl_rating: number
  pl_a_points: number
  pl_avg_percentage: number
  pl_session_count: number
  pl_all_results: boolean
}

interface ImportResult {
  total_found: number
  total_missing: number
  pairs_inserted: number
  players_created: number
  skipped_rows: number
}

const SELECT_CLS = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'
const INPUT_CLS  = 'w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs font-normal'
const NUM_CLS    = 'w-full rounded border border-gray-300 px-1 py-0.5 text-xs font-normal'

export default function TrackedPlayers() {
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [toggling,     setToggling]     = useState<number | null>(null)
  const [page,         setPage]         = useState(1)
  const [perPage,      setPerPage]      = useState(15)

  const [fName,      setFName]      = useState('')
  const [fNz,        setFNz]        = useState('')
  const [fRanks,     setFRanks]     = useState<Set<string>>(new Set())
  const [fGrades,    setFGrades]    = useState<Set<string>>(new Set())
  const [fClubs,     setFClubs]     = useState<Set<string>>(new Set())
  const [fRatingMin, setFRatingMin] = useState('')
  const [fAMin,      setFAMin]      = useState('')
  const [fAvgMin,    setFAvgMin]    = useState('')
  const [fAvgMax,    setFAvgMax]    = useState('')
  const [fSessMin,   setFSessMin]   = useState('')
  const [fTracked,   setFTracked]   = useState(false)

  const [dateFrom,    setDateFrom]    = useState('2024-01-01')
  const [dateTo,      setDateTo]      = useState(new Date().toISOString().slice(0, 10))
  const [impBusy,     setImpBusy]     = useState(false)
  const [impProgress, setImpProgress] = useState<string | null>(null)
  const [impError,    setImpError]    = useState<string | null>(null)
  const [impResult,   setImpResult]   = useState<ImportResult | null>(null)

  const loadPlayers = useCallback(async () => {
    const res = await fetch('/api/admin/players')
    if (res.ok) setAllPlayers(await res.json())
  }, [])

  useEffect(() => { loadPlayers() }, [loadPlayers])

  const num = (v: string) => v === '' ? null : parseFloat(v)

  const filtered = useMemo(() => {
    let rows = allPlayers
    if (fTracked)      rows = rows.filter(p => p.pl_all_results)
    if (fName)         rows = rows.filter(p => p.pl_name.toLowerCase().includes(fName.toLowerCase()))
    if (fNz)           rows = rows.filter(p => String(p.pl_nz_bridge_number ?? '').includes(fNz))
    if (fRanks.size)   rows = rows.filter(p => fRanks.has(p.pl_rank))
    if (fGrades.size)  rows = rows.filter(p => fGrades.has(p.pl_grade))
    if (fClubs.size)   rows = rows.filter(p => fClubs.has(p.pl_club))
    const rMin = num(fRatingMin); if (rMin !== null) rows = rows.filter(p => parseFloat(String(p.pl_rating)) >= rMin)
    const aMin = num(fAMin);      if (aMin !== null) rows = rows.filter(p => parseFloat(String(p.pl_a_points)) >= aMin)
    const avMin = num(fAvgMin);   if (avMin !== null) rows = rows.filter(p => parseFloat(String(p.pl_avg_percentage)) >= avMin)
    const avMax = num(fAvgMax);   if (avMax !== null) rows = rows.filter(p => parseFloat(String(p.pl_avg_percentage)) <= avMax)
    const sMin = num(fSessMin);   if (sMin !== null) rows = rows.filter(p => p.pl_session_count >= sMin)
    return rows
  }, [allPlayers, fTracked, fName, fNz, fRanks, fGrades, fClubs, fRatingMin, fAMin, fAvgMin, fAvgMax, fSessMin])

  useEffect(() => setPage(1), [fName, fNz, fRanks, fGrades, fClubs, fRatingMin, fAMin, fAvgMin, fAvgMax, fSessMin, fTracked])

  const trackedCount = allPlayers.filter(p => p.pl_all_results).length

  async function togglePlayer(player: Player) {
    setToggling(player.pl_plid)
    try {
      await fetch(`/api/admin/players/${player.pl_plid}/all-results`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all_results: !player.pl_all_results })
      })
      setAllPlayers(prev => prev.map(p =>
        p.pl_plid === player.pl_plid ? { ...p, pl_all_results: !p.pl_all_results } : p
      ))
    } finally {
      setToggling(null)
    }
  }

  async function handleImport() {
    setImpBusy(true); setImpError(null); setImpResult(null); setImpProgress(null)
    try {
      const res = await fetch('/api/scrape/raw/nzb-by-flagged', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: dateFrom, date_end: dateTo })
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
              if (evt.done) { setImpResult(evt as ImportResult); setImpProgress(null) }
              else if (evt.inserted) setImpProgress(`run_id ${evt.run_id} · ${evt.pairs} pairs total`)
              else if (evt.run_id && evt.skipped) setImpProgress(`run_id ${evt.run_id} · no data, skipped`)
              else if (evt.run_id) setImpProgress(`Fetching run_id ${evt.run_id}…`)
              else if (evt.found !== undefined) setImpProgress(`${evt.player}: ${evt.found} found · ${evt.missing} missing`)
              else if (evt.player) setImpProgress(`Checking ${evt.player}…`)
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
  const paged = filtered.slice((page - 1) * perPage, page * perPage)

  return (
    <div className='space-y-6'>

      {/* Player table */}
      <section className='rounded border border-gray-200 p-4'>
        <div className='flex items-center justify-between mb-3'>
          <h3 className='text-base font-semibold text-gray-800'>
            Players
            <span className='ml-2 text-xs font-normal text-gray-400'>{filtered.length} of {allPlayers.length}</span>
            {trackedCount > 0 && (
              <span className='ml-3 text-xs font-medium text-green-700'>{trackedCount} tracked</span>
            )}
          </h3>
          <label className='flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer'>
            <input type='checkbox' checked={fTracked} onChange={e => setFTracked(e.target.checked)} />
            Tracked only
          </label>
        </div>

        {allPlayers.length === 0 ? (
          <p className='text-sm text-gray-400'>Loading…</p>
        ) : (
          <>
            <div className='overflow-x-auto'>
              <table className='w-full text-xs'>
                <thead>
                  <tr className='border-b border-gray-200'>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-20'>Name</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-16'>NZ#</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-36'>Rank</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium w-24'>Grade</th>
                    <th className='py-1.5 text-left text-xs text-gray-500 font-medium min-w-24'>Club</th>
                    <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-16'>Rating</th>
                    <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-14'>A Pts</th>
                    <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-16'>Avg %</th>
                    <th className='py-1.5 text-right text-xs text-gray-500 font-medium w-16'>Sessions</th>
                    <th className='py-1.5 w-20'></th>
                  </tr>
                  <tr className='border-b border-gray-100 bg-gray-50 align-top'>
                    <td className='py-1 pr-1'><input type='text' value={fName} onChange={e => setFName(e.target.value)} placeholder='Filter…' className={INPUT_CLS} /></td>
                    <td className='py-1 pr-1'><input type='text' value={fNz} onChange={e => setFNz(e.target.value)} placeholder='Filter…' className={INPUT_CLS} /></td>
                    <td className='py-1 pr-1'><RankSelect mode='any' selected={fRanks} onChange={setFRanks} placeholder='All' /></td>
                    <td className='py-1 pr-1'><GradeSelect mode='any' selected={fGrades} onChange={setFGrades} placeholder='All' /></td>
                    <td className='py-1 pr-1'><ClubSelect mode='any' selected={fClubs} onChange={setFClubs} placeholder='All' /></td>
                    <td className='py-1 pr-1'><input type='number' placeholder='Min' value={fRatingMin} onChange={e => setFRatingMin(e.target.value)} className={NUM_CLS} /></td>
                    <td className='py-1 pr-1'><input type='number' placeholder='Min' value={fAMin} onChange={e => setFAMin(e.target.value)} className={NUM_CLS} /></td>
                    <td className='py-1 pr-1'>
                      <input type='number' placeholder='Min' value={fAvgMin} onChange={e => setFAvgMin(e.target.value)} className={NUM_CLS} />
                      <input type='number' placeholder='Max' value={fAvgMax} onChange={e => setFAvgMax(e.target.value)} className={`${NUM_CLS} mt-0.5`} />
                    </td>
                    <td className='py-1 pr-1'><input type='number' placeholder='Min' value={fSessMin} onChange={e => setFSessMin(e.target.value)} className={NUM_CLS} /></td>
                    <td className='py-1'></td>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(p => (
                    <tr key={p.pl_plid} className={`border-b border-gray-100 ${p.pl_all_results ? 'bg-green-50' : ''}`}>
                      <td className='py-1.5 font-medium'>{p.pl_name}</td>
                      <td className='py-1.5 text-gray-500 text-xs'>{p.pl_nz_bridge_number || '—'}</td>
                      <td className='py-1.5 text-gray-600'>{p.pl_rank || '—'}</td>
                      <td className='py-1.5 text-gray-600'>{p.pl_grade || '—'}</td>
                      <td className='py-1.5 text-gray-500'>{p.pl_club || '—'}</td>
                      <td className='py-1.5 text-right font-mono'>{p.pl_rating > 0 ? parseFloat(String(p.pl_rating)).toFixed(2) : '—'}</td>
                      <td className='py-1.5 text-right font-mono'>{p.pl_a_points > 0 ? parseFloat(String(p.pl_a_points)).toFixed(2) : '—'}</td>
                      <td className='py-1.5 text-right font-medium'>{p.pl_avg_percentage > 0 ? parseFloat(String(p.pl_avg_percentage)).toFixed(2) + '%' : '—'}</td>
                      <td className='py-1.5 text-right text-gray-600'>{p.pl_session_count > 0 ? p.pl_session_count : '—'}</td>
                      <td className='py-1.5 text-right'>
                        <button
                          onClick={() => togglePlayer(p)}
                          disabled={toggling === p.pl_plid}
                          className={`rounded px-2 py-0.5 text-xs font-medium disabled:opacity-50 ${p.pl_all_results ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                        >
                          {toggling === p.pl_plid ? '…' : p.pl_all_results ? 'Untrack' : 'Track'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > perPage && (
              <div className='mt-3 flex items-center gap-3'>
                <select value={perPage} onChange={e => { setPerPage(parseInt(e.target.value, 10)); setPage(1) }}
                  className='rounded border border-gray-300 px-1.5 py-0.5 text-xs'>
                  {[15, 20, 50, 100].map(n => <option key={n} value={n}>{n} rows</option>)}
                </select>
                <span className='text-xs text-gray-400'>p.{page}/{Math.ceil(filtered.length / perPage)}</span>
                <MyPagination totalPages={Math.ceil(filtered.length / perPage)} statecurrentPage={page} setStateCurrentPage={setPage} />
              </div>
            )}
          </>
        )}
      </section>

      {/* Import */}
      <section className='rounded border border-indigo-100 bg-indigo-50 p-4'>
        <h3 className='text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-3'>
          Import All Tracked Players → ts9
        </h3>
        <p className='text-xs text-gray-500 mb-3'>
          Fetches each tracked player&apos;s sessions, finds missing from prod, imports into ts9.
        </p>
        <div className='flex gap-3 items-end flex-wrap mb-3'>
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
          <button onClick={handleImport} disabled={impBusy || trackedCount === 0 || !dateFrom || !dateTo}
            className='rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50'>
            {impBusy ? 'Importing…' : `Import (${trackedCount} players)`}
          </button>
        </div>
        {impProgress && <p className='text-sm text-indigo-700 font-mono'>{impProgress}</p>}
        {impError   && <p className='text-sm text-red-600'>{impError}</p>}
        {impResult  && (
          <p className='text-sm text-green-700'>
            {impResult.total_found} found · {impResult.total_missing} missing · {impResult.pairs_inserted} pairs inserted
            {impResult.players_created > 0 ? ` · ${impResult.players_created} new players` : ''}
            {impResult.skipped_rows > 0 ? ` · ${impResult.skipped_rows} rows skipped` : ''}
          </p>
        )}
      </section>

    </div>
  )
}
