'use client'

import { useState, useEffect } from 'react'
import { MyButton } from 'nextjs-shared/MyButton'
import { DataTable, SectionHeader, FText, FDate, FMultiSelect, rowKey, dateKey, type Row, type SharedFilters } from '@/src/ui/admin/DataTableShared'

export default function Ts1Table({ sharedFilters, onKeyClick }: {
  sharedFilters: SharedFilters
  onKeyClick: (patch: SharedFilters) => void
}) {
  const [error,    setError]    = useState<string | null>(null)
  const [sessions, setSessions] = useState<Row[]>([])
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState<Row | null>(null)

  const [filter_run_id,     setFilter_run_id]     = useState(() => sharedFilters.run_id?.value ?? '')
  const [filter_date,       setFilter_date]       = useState('')
  const [filter_club,       setFilter_club]       = useState<string[]>([])
  const [filter_event_name, setFilter_event_name] = useState('')
  const [filter_score_type, setFilter_score_type] = useState<string[]>([])
  const [filter_event_type, setFilter_event_type] = useState<string[]>([])

  async function load() {
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/scrape/ts1')
      const data = await res.json()
      setSessions(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleClick(row: Row) {
    if (selected && rowKey(selected) === rowKey(row)) { setSelected(null); return }
    setSelected(row)
    onKeyClick({ run_id: { value: String(row.s1_run_id) } })
  }

  const clubOptions      = Array.from(new Set(sessions.map(r => String(r.s1_club ?? '')))).filter(Boolean).sort()
  const scoreTypeOptions = Array.from(new Set(sessions.map(r => String(r.s1_score_type ?? '')))).filter(Boolean).sort()
  const eventTypeOptions = Array.from(new Set(sessions.map(r => String(r.s1_event_type ?? '')))).filter(Boolean).sort()

  const filteredRows = sessions.filter(r => {
    if (filter_run_id && !String(r.s1_run_id ?? '').includes(filter_run_id)) return false
    if (filter_date && dateKey(r.s1_date) !== filter_date) return false
    if (filter_club.length > 0 && !filter_club.includes(String(r.s1_club ?? ''))) return false
    if (filter_event_name && !String(r.s1_event_name ?? '').toLowerCase().includes(filter_event_name.toLowerCase())) return false
    if (filter_score_type.length > 0 && !filter_score_type.includes(String(r.s1_score_type ?? ''))) return false
    if (filter_event_type.length > 0 && !filter_event_type.includes(String(r.s1_event_type ?? ''))) return false
    return true
  })

  const filters: Record<string, React.ReactNode> = {
    s1_run_id:     <FText placeholder='id…'    value={filter_run_id}     onChange={setFilter_run_id} />,
    s1_date:       <FDate value={filter_date} onChange={setFilter_date} />,
    s1_club:       <FMultiSelect options={clubOptions} value={filter_club} onChange={setFilter_club} />,
    s1_event_name: <FText placeholder='event…' value={filter_event_name} onChange={setFilter_event_name} />,
    s1_score_type: <FMultiSelect options={scoreTypeOptions} value={filter_score_type} onChange={setFilter_score_type} />,
    s1_event_type: <FMultiSelect options={eventTypeOptions} value={filter_event_type} onChange={setFilter_event_type} />,
  }

  return (
    <div className='space-y-4'>
      {error && <p className='text-sm text-red-600'>{error}</p>}
      <div className='rounded border border-gray-200 p-3'>
        <SectionHeader label='ts1_sessions' shown={filteredRows.length} total={sessions.length} loading={loading}>
          <MyButton onClick={load} disabled={loading}
            overrideClass='rounded bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50 text-gray-700 h-auto md:h-auto'>
            {loading ? 'Loading…' : 'Refresh'}
          </MyButton>
        </SectionHeader>
        {sessions.length > 0 && (
          <DataTable rows={filteredRows} allRows={sessions} onRowClick={handleClick}
            isClickable selected={selected} filters={filters} />
        )}
      </div>
    </div>
  )
}
