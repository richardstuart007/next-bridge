'use client'

import { useState, useEffect } from 'react'
import {
  getTs1WithStatus,
  getTs2ByEventId,
  getTs3ByEventId,
  getTs4ByEventId,
  getTs5ByEventId,
  getTs6BySourceId,
  getTs7All,
  getTs8ByNzNumber,
} from '@/src/lib/actions/raw'

type Row = Record<string, unknown>

const YEARS = [2026, 2025, 2024, 2023, 2022, 2021]

function rowKey(row: Row): unknown { return row[Object.keys(row)[0]] }

function renderCell(key: string, val: unknown): React.ReactNode {
  if (key.endsWith('_url') && typeof val === 'string' && val)
    return <a href={val} target='_blank' rel='noreferrer' onClick={e => e.stopPropagation()} className='text-blue-600 hover:text-blue-800'>↗</a>
  if (Array.isArray(val)) return val.join(', ')
  if (val === null || val === undefined) return <span className='text-gray-300'>—</span>
  return String(val)
}

// Filter cell components — compact, designed to sit in a <th> above the column label
function FText({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input type='text' placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
      className='w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400' />
  )
}

function FSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className='w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:outline-none'>
      {children}
    </select>
  )
}

function DataTable({ rows, allRows, onRowClick, isClickable, selected, filters }: {
  rows: Row[]
  allRows?: Row[]
  onRowClick?: (row: Row) => void
  isClickable?: (row: Row) => boolean
  selected?: Row | null
  filters?: Record<string, React.ReactNode>
}) {
  const source = allRows ?? rows
  if (source.length === 0) return <p className='text-xs text-gray-400 py-2'>No rows</p>
  const cols = Object.keys(source[0])
  return (
    <div className='overflow-x-auto border border-gray-200 rounded max-h-80 overflow-y-auto'>
      <table className='w-full text-xs whitespace-nowrap'>
        <thead className='bg-gray-50 sticky top-0'>
          {filters && (
            <tr>
              {cols.map(col => (
                <th key={`f-${col}`} className='px-1 py-1 bg-gray-50 border-b border-gray-100'>
                  {filters[col] ?? null}
                </th>
              ))}
            </tr>
          )}
          <tr>
            {cols.map(col => (
              <th key={col} className='px-2 py-1.5 text-left text-gray-500 font-medium border-b border-gray-200'>
                {col.endsWith('_url') ? '↗' : col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={cols.length} className='px-2 py-2 text-xs text-gray-400 text-center'>No rows</td></tr>
            : rows.map((row, i) => {
                const clickable = isClickable ? isClickable(row) : !!onRowClick
                const isSelected = selected != null && rowKey(selected) === rowKey(row)
                return (
                  <tr key={i}
                    className={`border-t border-gray-100 ${isSelected ? 'bg-blue-100' : clickable ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-gray-50'}`}
                    onClick={() => clickable && onRowClick?.(row)}>
                    {cols.map(col => (
                      <td key={col} className='px-2 py-1 text-gray-700'>{renderCell(col, row[col])}</td>
                    ))}
                  </tr>
                )
              })
          }
        </tbody>
      </table>
    </div>
  )
}

function SectionHeader({ label, shown, total, loading }: { label: string; shown?: number; total?: number; loading?: boolean }) {
  return (
    <div className='flex items-center gap-2 mb-1'>
      <p className='text-xs font-semibold text-gray-500 uppercase tracking-wide'>{label}</p>
      {loading && <span className='text-xs text-blue-500'>Loading…</span>}
      {!loading && total !== undefined && total > 0 && (
        <span className='text-xs text-gray-400'>{shown !== total ? `${shown} / ${total}` : total} rows</span>
      )}
    </div>
  )
}

export default function RawDataViewer() {
  const initYear = new Date().getFullYear()
  const [year,        setYear]        = useState(initYear)
  const [ts1Rows,     setTs1Rows]     = useState<Row[]>([])
  const [ts1Loading,  setTs1Loading]  = useState(false)
  const [selectedTs1, setSelectedTs1] = useState<Row | null>(null)

  // ts1 filters
  const [ts1NameFilter,   setTs1NameFilter]   = useState('')
  const [ts1TypeFilter,   setTs1TypeFilter]   = useState('all')
  const [ts1StatusFilter, setTs1StatusFilter] = useState('all')

  // ts1 child panels
  const [childLoading,  setChildLoading]  = useState(false)
  const [ts5Rows,       setTs5Rows]       = useState<Row[]>([])
  const [teamsRows,     setTeamsRows]     = useState<{ ts2: Row[]; ts3: Row[]; ts4: Row[] } | null>(null)
  const [ts6DirectRows, setTs6DirectRows] = useState<Row[]>([])
  const [selectedTs5,   setSelectedTs5]   = useState<Row | null>(null)
  const [ts6Loading,    setTs6Loading]    = useState(false)
  const [ts6Rows,       setTs6Rows]       = useState<Row[]>([])

  // ts7
  const [ts7Rows,          setTs7Rows]          = useState<Row[]>([])
  const [ts7Loading,       setTs7Loading]       = useState(false)
  const [selectedTs7,      setSelectedTs7]      = useState<Row | null>(null)
  const [ts7NameFilter,    setTs7NameFilter]    = useState('')
  const [ts7NzNumFilter,   setTs7NzNumFilter]   = useState('')
  const [ts7ClubFilter,    setTs7ClubFilter]    = useState('')
  const [ts7GradeFilter,   setTs7GradeFilter]   = useState('')
  const [ts7StatusFilter,  setTs7StatusFilter]  = useState('all')

  // ts8
  const [ts8Rows,          setTs8Rows]          = useState<Row[]>([])
  const [ts8Loading,       setTs8Loading]       = useState(false)
  const [ts8EventFilter,   setTs8EventFilter]   = useState('')
  const [ts8ClubFilter,    setTs8ClubFilter]    = useState('')
  const [ts8ScoreFilter,   setTs8ScoreFilter]   = useState('all')

  const [error, setError] = useState<string | null>(null)

  async function loadTs1(y: number) {
    setTs1Loading(true); setError(null); clearChild()
    try { setTs1Rows((await getTs1WithStatus(y)) as Row[]) }
    catch (err) { setError(String(err)) }
    finally { setTs1Loading(false) }
  }

  function clearChild() {
    setSelectedTs1(null); setTs5Rows([]); setTeamsRows(null); setTs6DirectRows([])
    setSelectedTs5(null); setTs6Rows([])
  }

  useEffect(() => { loadTs1(initYear) }, [])

  function changeYear(y: number) { setYear(y); loadTs1(y) }

  async function handleTs1Click(row: Row) {
    if (selectedTs1 && rowKey(selectedTs1) === rowKey(row)) { clearChild(); return }
    setSelectedTs1(row); setTs5Rows([]); setTeamsRows(null); setTs6DirectRows([])
    setSelectedTs5(null); setTs6Rows([])
    setChildLoading(true)
    try {
      const type = row.s1_type as string
      const id   = row.s1_event_id as number
      if (type === 'headevent') {
        setTs5Rows((await getTs5ByEventId(id)) as Row[])
      } else if (type === 'teamresults') {
        const [ts2, ts3, ts4] = await Promise.all([getTs2ByEventId(id), getTs3ByEventId(id), getTs4ByEventId(id)])
        setTeamsRows({ ts2: ts2 as Row[], ts3: ts3 as Row[], ts4: ts4 as Row[] })
      } else if (type === 'resultsbm') {
        setTs6DirectRows((await getTs6BySourceId(id)) as Row[])
      }
    } catch (err) { setError(String(err)) }
    finally { setChildLoading(false) }
  }

  async function handleTs5Click(row: Row) {
    if (!row.s5_source_id || row.s5_type === 'multisession') return
    if (selectedTs5 && rowKey(selectedTs5) === rowKey(row)) { setSelectedTs5(null); setTs6Rows([]); return }
    setSelectedTs5(row); setTs6Rows([])
    setTs6Loading(true)
    try { setTs6Rows((await getTs6BySourceId(row.s5_source_id as number)) as Row[]) }
    catch (err) { setError(String(err)) }
    finally { setTs6Loading(false) }
  }

  async function loadTs7() {
    setTs7Loading(true); setError(null); setSelectedTs7(null); setTs8Rows([])
    try { setTs7Rows((await getTs7All()) as Row[]) }
    catch (err) { setError(String(err)) }
    finally { setTs7Loading(false) }
  }

  async function handleTs7Click(row: Row) {
    if (selectedTs7 && rowKey(selectedTs7) === rowKey(row)) { setSelectedTs7(null); setTs8Rows([]); return }
    setSelectedTs7(row); setTs8Rows([])
    if (!row.s7_nz_number) return
    setTs8Loading(true)
    try { setTs8Rows((await getTs8ByNzNumber(row.s7_nz_number as number)) as Row[]) }
    catch (err) { setError(String(err)) }
    finally { setTs8Loading(false) }
  }

  // ── Filtered rows ─────────────────────────────────────────────────────────────

  const filteredTs1 = ts1Rows.filter(r => {
    if (ts1NameFilter && !String(r.s1_event_name ?? '').toLowerCase().includes(ts1NameFilter.toLowerCase())) return false
    if (ts1TypeFilter !== 'all' && r.s1_type !== ts1TypeFilter) return false
    if (ts1StatusFilter === 'none' && r.s1_status) return false
    if (ts1StatusFilter !== 'all' && ts1StatusFilter !== 'none' && r.s1_status !== ts1StatusFilter) return false
    return true
  })

  const filteredTs7 = ts7Rows.filter(r => {
    if (ts7NameFilter   && !String(r.s7_name      ?? '').toLowerCase().includes(ts7NameFilter.toLowerCase()))  return false
    if (ts7NzNumFilter  && !String(r.s7_nz_number ?? '').includes(ts7NzNumFilter))                             return false
    if (ts7ClubFilter   && !String(r.s7_club      ?? '').toLowerCase().includes(ts7ClubFilter.toLowerCase()))  return false
    if (ts7GradeFilter  && !String(r.s7_grade     ?? '').toLowerCase().includes(ts7GradeFilter.toLowerCase())) return false
    if (ts7StatusFilter !== 'all' && r.s7_status !== ts7StatusFilter)                                          return false
    return true
  })

  const filteredTs8 = ts8Rows.filter(r => {
    if (ts8EventFilter && !String(r.s8_event_name ?? '').toLowerCase().includes(ts8EventFilter.toLowerCase())) return false
    if (ts8ClubFilter  && !String(r.s8_club ?? '').toLowerCase().includes(ts8ClubFilter.toLowerCase())) return false
    if (ts8ScoreFilter !== 'all' && r.s8_score_type !== ts8ScoreFilter) return false
    return true
  })

  // ── Filter cell maps ───────────────────────────────────────────────────────��──

  const ts1Filters: Record<string, React.ReactNode> = {
    s1_year:       <FSelect value={String(year)} onChange={v => changeYear(parseInt(v, 10))}>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}</FSelect>,
    s1_event_name: <FText placeholder='name…' value={ts1NameFilter} onChange={setTs1NameFilter} />,
    s1_type:       <FSelect value={ts1TypeFilter} onChange={setTs1TypeFilter}><option value='all'>all</option><option value='headevent'>headevent</option><option value='teamresults'>teams</option><option value='resultsbm'>MP</option></FSelect>,
    s1_status:     <FSelect value={ts1StatusFilter} onChange={setTs1StatusFilter}><option value='all'>all</option><option value='none'>unscraped</option><option value='scraped'>scraped</option><option value='built'>built</option></FSelect>,
  }

  const ts7Filters: Record<string, React.ReactNode> = {
    s7_name:       <FText placeholder='name…'  value={ts7NameFilter}   onChange={setTs7NameFilter} />,
    s7_nz_number:  <FText placeholder='nz#…'   value={ts7NzNumFilter}  onChange={setTs7NzNumFilter} />,
    s7_club:       <FText placeholder='club…'  value={ts7ClubFilter}   onChange={setTs7ClubFilter} />,
    s7_grade:      <FText placeholder='grade…' value={ts7GradeFilter}  onChange={setTs7GradeFilter} />,
    s7_status:     <FSelect value={ts7StatusFilter} onChange={setTs7StatusFilter}><option value='all'>all</option><option value='found'>found</option><option value='not_found'>not found</option></FSelect>,
  }

  const ts8Filters: Record<string, React.ReactNode> = {
    s8_event_name:  <FText placeholder='event…' value={ts8EventFilter} onChange={setTs8EventFilter} />,
    s8_club:        <FText placeholder='club…'  value={ts8ClubFilter}  onChange={setTs8ClubFilter} />,
    s8_score_type:  <FSelect value={ts8ScoreFilter} onChange={setTs8ScoreFilter}><option value='all'>all</option><option value='PCT'>PCT</option><option value='VP'>VP</option></FSelect>,
  }

  const ts1Type = selectedTs1?.s1_type as string | undefined

  return (
    <div className='space-y-4'>
      <h2 className='text-base font-semibold text-gray-800'>Raw Data Viewer</h2>
      {error && <p className='text-sm text-red-600'>{error}</p>}

      {/* ts1 */}
      <div className='rounded border border-gray-200 p-3'>
        <SectionHeader label='ts1 — events' shown={filteredTs1.length} total={ts1Rows.length} loading={ts1Loading} />
        <DataTable rows={filteredTs1} allRows={ts1Rows} onRowClick={handleTs1Click} selected={selectedTs1} filters={ts1Filters} />
      </div>

      {/* ts5 (headevent child) */}
      {selectedTs1 && ts1Type === 'headevent' && (
        <div className='rounded border border-gray-200 p-3'>
          <SectionHeader label='ts5 — sessions' total={ts5Rows.length} loading={childLoading} />
          <DataTable rows={ts5Rows} onRowClick={handleTs5Click} isClickable={row => !!row.s5_source_id && row.s5_type !== 'multisession'} selected={selectedTs5} />
          {selectedTs5 && (
            <div className='mt-3 pt-3 border-t border-gray-100'>
              <SectionHeader label='ts6 — pair results' total={ts6Rows.length} loading={ts6Loading} />
              <DataTable rows={ts6Rows} />
            </div>
          )}
        </div>
      )}

      {/* teams (teamresults child) */}
      {selectedTs1 && ts1Type === 'teamresults' && (
        <div className='rounded border border-gray-200 p-3'>
          <SectionHeader label='teams' loading={childLoading} />
          {teamsRows && (
            <div className='space-y-4'>
              {(['ts2', 'ts3', 'ts4'] as const).map(t => (
                <div key={t}>
                  <p className='text-xs font-semibold text-gray-400 mb-1'>
                    {t === 'ts2' ? 'ts2 — VP match summary' : t === 'ts3' ? 'ts3 — team members' : 'ts4 — team rounds'}
                  </p>
                  <DataTable rows={teamsRows[t]} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ts6 (resultsbm child) */}
      {selectedTs1 && ts1Type === 'resultsbm' && (
        <div className='rounded border border-gray-200 p-3'>
          <SectionHeader label='ts6 — pair results' total={ts6DirectRows.length} loading={childLoading} />
          <DataTable rows={ts6DirectRows} />
        </div>
      )}

      {/* ts7 — NZ players */}
      <div className='rounded border border-gray-200 p-3'>
        <div className='flex items-center gap-2 mb-1'>
          <p className='text-xs font-semibold text-gray-500 uppercase tracking-wide'>ts7 — NZ players</p>
          {ts7Loading && <span className='text-xs text-blue-500'>Loading…</span>}
          {!ts7Loading && ts7Rows.length > 0 && (
            <span className='text-xs text-gray-400'>{filteredTs7.length !== ts7Rows.length ? `${filteredTs7.length} / ${ts7Rows.length}` : ts7Rows.length} rows</span>
          )}
          <div className='ml-auto'>
            <button onClick={loadTs7} disabled={ts7Loading}
              className='rounded bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50'>
              Load
            </button>
          </div>
        </div>
        {ts7Rows.length > 0 && <DataTable rows={filteredTs7} allRows={ts7Rows} onRowClick={handleTs7Click} isClickable={row => !!row.s7_nz_number} selected={selectedTs7} filters={ts7Filters} />}
      </div>

      {/* ts8 — NZ results history */}
      {selectedTs7 && (
        <div className='rounded border border-gray-200 p-3'>
          <div className='flex items-center gap-2 mb-1'>
            <p className='text-xs font-semibold text-gray-500 uppercase tracking-wide'>ts8 — results history</p>
            {ts8Loading && <span className='text-xs text-blue-500'>Loading…</span>}
            {!ts8Loading && ts8Rows.length > 0 && (
              <span className='text-xs text-gray-400'>{filteredTs8.length !== ts8Rows.length ? `${filteredTs8.length} / ${ts8Rows.length}` : ts8Rows.length} rows</span>
            )}
            <span className='text-xs text-gray-400'>· {String(selectedTs7.s7_name)} NZ# {String(selectedTs7.s7_nz_number)}</span>
          </div>
          <DataTable rows={filteredTs8} allRows={ts8Rows} filters={ts8Filters} />
        </div>
      )}
    </div>
  )
}
