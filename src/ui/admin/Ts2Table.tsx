'use client'

//==============================================================================================
//  1) DESCRIPTION
//    Ts2Table — the ts2_results tab of the Build Data Viewer. Fetches /api/scrape/ts2 on
//    mount, filters the rows in-browser via per-column filter controls, and renders them in a
//    shared DataTable; clicking a row publishes its run_id and both plids to the cross-tab
//    shared filters.
//
//    Parameters:
//      sharedFilters — the current cross-tab key filters (run_id/plid1/plid2 are read here to
//                      seed the matching filter boxes)
//      onKeyClick    — called with a { run_id, plid1, plid2 } patch when a row is clicked
//==============================================================================================

import { useState, useEffect } from 'react'
import { MyButton } from 'nextjs-shared/MyButton'
import { DataTable, SectionHeader, FText, rowKey, type Row, type SharedFilters } from '@/src/ui/admin/DataTableShared'

export default function Ts2Table({ sharedFilters, onKeyClick }: {
  sharedFilters: SharedFilters
  onKeyClick: (patch: SharedFilters) => void
}) {
  const [error,   setError]   = useState<string | null>(null)
  const [results, setResults] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Row | null>(null)

  const [filter_run_id,      setFilter_run_id]      = useState(() => sharedFilters.run_id?.value ?? '')
  const [filter_pl_name1,    setFilter_pl_name1]    = useState('')
  const [filter_plid1,       setFilter_plid1]       = useState(() => sharedFilters.plid1?.value ?? '')
  const [filter_pl_name2,    setFilter_pl_name2]    = useState('')
  const [filter_plid2,       setFilter_plid2]       = useState(() => sharedFilters.plid2?.value ?? '')
  const [filter_score_value, setFilter_score_value] = useState('')

  useEffect(() => { load() }, [])

  //----------------------------------------------------------------------------------------------
  //  load — fetches /api/scrape/ts2 into `results`, tracking loading/error state
  //----------------------------------------------------------------------------------------------
  async function load() {
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/scrape/ts2')
      const data = await res.json()
      setResults(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  //----------------------------------------------------------------------------------------------
  //  handleClick — toggles row selection; on select, publishes the row's run_id + both plids
  //  (with names as labels) via onKeyClick
  //----------------------------------------------------------------------------------------------
  function handleClick(row: Row) {
    if (selected && rowKey(selected) === rowKey(row)) { setSelected(null); return }
    setSelected(row)
    onKeyClick({
      run_id: { value: String(row.s2_run_id) },
      plid1:  { value: String(row.s2_plid1), label: String(row.pl_name1 ?? '') },
      plid2:  { value: String(row.s2_plid2), label: String(row.pl_name2 ?? '') },
    })
  }

  const filteredRows = results.filter(r => {
    if (filter_run_id && !String(r.s2_run_id ?? '').includes(filter_run_id)) return false
    if (filter_pl_name1 && !String(r.pl_name1 ?? '').toLowerCase().includes(filter_pl_name1.toLowerCase())) return false
    if (filter_plid1 && !String(r.s2_plid1 ?? '').includes(filter_plid1)) return false
    if (filter_pl_name2 && !String(r.pl_name2 ?? '').toLowerCase().includes(filter_pl_name2.toLowerCase())) return false
    if (filter_plid2 && !String(r.s2_plid2 ?? '').includes(filter_plid2)) return false
    if (filter_score_value && !String(r.s2_score_value ?? '').includes(filter_score_value)) return false
    return true
  })

  const filters: Record<string, React.ReactNode> = {
    s2_run_id:      <FText placeholder='id…'    value={filter_run_id} onChange={setFilter_run_id} />,
    pl_name1:       <FText placeholder='name…'  value={filter_pl_name1} onChange={setFilter_pl_name1} />,
    s2_plid1:       <FText placeholder='plid1…' value={filter_plid1} onChange={setFilter_plid1} />,
    pl_name2:       <FText placeholder='name…'  value={filter_pl_name2} onChange={setFilter_pl_name2} />,
    s2_plid2:       <FText placeholder='plid2…' value={filter_plid2} onChange={setFilter_plid2} />,
    s2_score_value: <FText placeholder='score…' value={filter_score_value} onChange={setFilter_score_value} />,
  }

  return (
    <div className='space-y-4'>
      {error && <p className='text-sm text-red-600'>{error}</p>}
      <div className='rounded border border-gray-200 p-3'>
        <SectionHeader label='ts2_results' shown={filteredRows.length} total={results.length} loading={loading}>
          <MyButton onClick={load} disabled={loading}
            overrideClass='rounded bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50 text-gray-700 h-auto md:h-auto'>
            {loading ? 'Loading…' : 'Refresh'}
          </MyButton>
        </SectionHeader>
        {results.length > 0 && (
          <DataTable rows={filteredRows} allRows={results} onRowClick={handleClick}
            isClickable selected={selected} filters={filters} />
        )}
      </div>
    </div>
  )
}
