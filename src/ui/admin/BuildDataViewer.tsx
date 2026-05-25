'use client'

import { useState, useEffect } from 'react'
import { getAllPlayers } from '@/src/lib/actions/players'
import { getSessionsByYear } from '@/src/lib/actions/sessions'
import { getResultsBySeid, getResultsByPlid, getAllPartners } from '@/src/lib/actions/build-viewer'
import { EventTypeSelect } from '@/src/ui/shared/LookupSelects'

type Row = Record<string, unknown>

const YEARS = [2026, 2025, 2024, 2023, 2022, 2021]

function rowKey(row: Row): unknown { return row[Object.keys(row)[0]] }

function renderCell(val: unknown): React.ReactNode {
  if (val === null || val === undefined) return <span className='text-gray-300'>—</span>
  if (Array.isArray(val)) return val.join(', ')
  return String(val)
}

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

function FMultiSelect({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <select multiple value={value}
      onChange={e => onChange(Array.from(e.target.selectedOptions, o => o.value))}
      className='w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:outline-none'
      size={4}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function DataTable({ rows, allRows, onRowClick, isClickable, selected, filters, cellRenderers }: {
  rows: Row[]
  allRows?: Row[]
  onRowClick?: (row: Row) => void
  isClickable?: boolean
  selected?: Row | null
  filters?: Record<string, React.ReactNode>
  cellRenderers?: Record<string, (val: unknown, row: Row) => React.ReactNode>
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
              <th key={col} className='px-2 py-1.5 text-left text-gray-500 font-medium border-b border-gray-200'>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={cols.length} className='px-2 py-2 text-xs text-gray-400 text-center'>No rows match filter</td></tr>
            : rows.map((row, i) => {
                const clickable = isClickable && !!onRowClick
                const isSelected = selected != null && rowKey(selected) === rowKey(row)
                return (
                  <tr key={i}
                    className={`border-t border-gray-100 ${isSelected ? 'bg-blue-100' : clickable ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-gray-50'}`}
                    onClick={() => clickable && onRowClick?.(row)}>
                    {cols.map(col => (
                      <td key={col} className='px-2 py-1 text-gray-700'>
                        {cellRenderers?.[col] ? cellRenderers[col](row[col], row) : renderCell(row[col])}
                      </td>
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

function SectionHeader({ label, shown, total, loading, children }: {
  label: string; shown?: number; total?: number; loading?: boolean; children?: React.ReactNode
}) {
  return (
    <div className='flex items-center gap-2 mb-1'>
      <p className='text-xs font-semibold text-gray-500 uppercase tracking-wide'>{label}</p>
      {loading && <span className='text-xs text-blue-500'>Loading…</span>}
      {!loading && total !== undefined && total > 0 && (
        <span className='text-xs text-gray-400'>
          {shown !== undefined && shown !== total ? `${shown} / ${total}` : total} rows
        </span>
      )}
      {children && <div className='ml-auto flex items-center gap-2'>{children}</div>}
    </div>
  )
}

export default function BuildDataViewer() {
  const [error, setError] = useState<string | null>(null)

  // tpl_players
  const [players,        setPlayers]        = useState<Row[]>([])
  const [playersLoading, setPlayersLoading] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<Row | null>(null)
  const [playerResults,  setPlayerResults]  = useState<Row[]>([])
  const [plNameFilter,   setPlNameFilter]   = useState('')
  const [plNzFilter,     setPlNzFilter]     = useState('')
  const [plClubFilter,   setPlClubFilter]   = useState('')
  const [plRankFilter,   setPlRankFilter]   = useState('')

  // tse_sessions
  const [sessYear,           setSessYear]           = useState(new Date().getFullYear())
  const [sessions,           setSessions]           = useState<Row[]>([])
  const [sessLoading,        setSessLoading]        = useState(false)
  const [selectedSess,       setSelectedSess]       = useState<Row | null>(null)
  const [sessResults,        setSessResults]        = useState<Row[]>([])
  const [sessNameFilter,     setSessNameFilter]     = useState('')
  const [sessScoringFilter,  setSessScoringFilter]  = useState('all')
  const [sessClubFilter,     setSessClubFilter]     = useState('')
  const [sessTournamentFilter, setSessTournamentFilter] = useState<string[]>([])
  const [sessEventTypeFilter, setSessEventTypeFilter] = useState<Set<string>>(new Set())
  const [sessDayFilter,      setSessDayFilter]      = useState('all')
  const [sessSourceFilter,   setSessSourceFilter]   = useState('')
  const tournamentTypes = ['A', 'B', 'C']

  // tpa_partners
  const [partners,        setPartners]        = useState<Row[]>([])
  const [partnersLoading, setPartnersLoading] = useState(false)
  const [paNameFilter,    setPaNameFilter]    = useState('')


  async function loadPlayers() {
    setPlayersLoading(true); setError(null); setSelectedPlayer(null); setPlayerResults([])
    try { setPlayers((await getAllPlayers()) as Row[]) }
    catch (err) { setError(String(err)) }
    finally { setPlayersLoading(false) }
  }

  async function handlePlayerClick(row: Row) {
    if (selectedPlayer && rowKey(selectedPlayer) === rowKey(row)) { setSelectedPlayer(null); setPlayerResults([]); return }
    setSelectedPlayer(row); setPlayerResults([])
    try { setPlayerResults((await getResultsByPlid(row.pl_plid as number)) as Row[]) }
    catch (err) { setError(String(err)) }
  }

  async function loadSessions(y: number) {
    setSessLoading(true); setError(null); setSelectedSess(null); setSessResults([])
    try { setSessions((await getSessionsByYear(y)) as Row[]) }
    catch (err) { setError(String(err)) }
    finally { setSessLoading(false) }
  }

  async function handleSessClick(row: Row) {
    if (selectedSess && rowKey(selectedSess) === rowKey(row)) { setSelectedSess(null); setSessResults([]); return }
    setSelectedSess(row); setSessResults([])
    try { setSessResults((await getResultsBySeid(row.se_seid as number)) as Row[]) }
    catch (err) { setError(String(err)) }
  }

  async function loadPartners() {
    setPartnersLoading(true); setError(null)
    try { setPartners((await getAllPartners()) as Row[]) }
    catch (err) { setError(String(err)) }
    finally { setPartnersLoading(false) }
  }

  // Filtered rows
  const filteredPlayers = players.filter(r => {
    if (plNameFilter && !String(r.pl_name ?? '').toLowerCase().includes(plNameFilter.toLowerCase())) return false
    if (plNzFilter   && !String(r.pl_nz_bridge_number ?? '').includes(plNzFilter)) return false
    if (plClubFilter && !String(r.pl_club ?? '').toLowerCase().includes(plClubFilter.toLowerCase())) return false
    if (plRankFilter && !String(r.pl_rank ?? '').toLowerCase().includes(plRankFilter.toLowerCase())) return false
    return true
  })

  const filteredSessions = sessions.filter(r => {
    if (sessNameFilter      && !String(r.se_name       ?? '').toLowerCase().includes(sessNameFilter.toLowerCase()))  return false
    if (sessClubFilter      && !String(r.se_club       ?? '').toLowerCase().includes(sessClubFilter.toLowerCase()))  return false
    if (sessSourceFilter    && !String(r.se_source_id  ?? '').includes(sessSourceFilter))                            return false
    if (sessScoringFilter   !== 'all' && r.se_scoring    !== sessScoringFilter)   return false
    if (sessEventTypeFilter.size > 0 && !sessEventTypeFilter.has(String(r.se_event_type ?? ''))) return false
    if (sessDayFilter       !== 'all' && r.se_day_of_week !== sessDayFilter)       return false
    if (sessTournamentFilter.length > 0 && !sessTournamentFilter.includes(String(r.se_tournament ?? '')[1] ?? '')) return false
    return true
  })

  const filteredPartners = partners.filter(r =>
    !paNameFilter ||
    String(r.player1 ?? '').toLowerCase().includes(paNameFilter.toLowerCase()) ||
    String(r.player2 ?? '').toLowerCase().includes(paNameFilter.toLowerCase())
  )

  const playerFilters: Record<string, React.ReactNode> = {
    pl_name:             <FText placeholder='name…'  value={plNameFilter}  onChange={setPlNameFilter} />,
    pl_nz_bridge_number: <FText placeholder='nz#…'   value={plNzFilter}    onChange={setPlNzFilter} />,
    pl_club:             <FText placeholder='club…'  value={plClubFilter}  onChange={setPlClubFilter} />,
    pl_rank:             <FText placeholder='rank…'  value={plRankFilter}  onChange={setPlRankFilter} />,
  }

  const sessFilters: Record<string, React.ReactNode> = {
    se_source_id:    <FText placeholder='id…'   value={sessSourceFilter}   onChange={setSessSourceFilter} />,
    se_day_of_week:  <FSelect value={sessDayFilter} onChange={setSessDayFilter}>
                       <option value='all'>all</option>
                       {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => <option key={d} value={d}>{d}</option>)}
                     </FSelect>,
    se_scoring:      <FSelect value={sessScoringFilter} onChange={setSessScoringFilter}>
                       <option value='all'>all</option><option value='MP'>MP</option><option value='VP'>VP</option>
                     </FSelect>,
    se_name:         <FText placeholder='name…' value={sessNameFilter} onChange={setSessNameFilter} />,
    se_club:         <FText placeholder='club…' value={sessClubFilter} onChange={setSessClubFilter} />,
    se_tournament:   <FMultiSelect options={tournamentTypes} value={sessTournamentFilter} onChange={setSessTournamentFilter} />,
    se_event_type:   <EventTypeSelect mode='any' selected={sessEventTypeFilter} onChange={setSessEventTypeFilter} placeholder='all' />,
  }

  const sessCellRenderers: Record<string, (val: unknown) => React.ReactNode> = {
    se_source_id: val => (
      <a href={`https://www.nzbridge.co.nz/results.html?run_id=${val}`}
         target='_blank' rel='noopener noreferrer'
         className='text-blue-600 hover:underline'
         onClick={e => e.stopPropagation()}>
        {String(val)}
      </a>
    ),
  }

  const paFilters: Record<string, React.ReactNode> = {
    player1: <FText placeholder='name…' value={paNameFilter} onChange={setPaNameFilter} />,
  }

  return (
    <div className='space-y-4'>
      <h2 className='text-base font-semibold text-gray-800'>Build Data Viewer</h2>
      {error && <p className='text-sm text-red-600'>{error}</p>}

      {/* tpl_players */}
      <div className='rounded border border-gray-200 p-3'>
        <SectionHeader label='tpl_players — players' shown={filteredPlayers.length} total={players.length} loading={playersLoading}>
          <button onClick={loadPlayers} disabled={playersLoading}
            className='rounded bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50'>
            Load
          </button>
        </SectionHeader>
        {players.length > 0 && (
          <DataTable rows={filteredPlayers} allRows={players} onRowClick={handlePlayerClick}
            isClickable selected={selectedPlayer} filters={playerFilters} />
        )}
        {selectedPlayer && (
          <div className='mt-3 pt-3 border-t border-gray-100'>
            <p className='text-xs font-semibold text-gray-400 mb-1'>
              tre_results — {String(selectedPlayer.pl_name)} ({playerResults.length} sessions)
            </p>
            <DataTable rows={playerResults} />
          </div>
        )}
      </div>

      {/* tse_sessions */}
      <div className='rounded border border-gray-200 p-3'>
        <SectionHeader label='tse_sessions — sessions' shown={filteredSessions.length} total={sessions.length} loading={sessLoading}>
          <FSelect value={String(sessYear)} onChange={v => setSessYear(parseInt(v, 10))}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </FSelect>
          <button onClick={() => loadSessions(sessYear)} disabled={sessLoading}
            className='rounded bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50'>
            Load
          </button>
        </SectionHeader>
        {sessions.length > 0 && (
          <DataTable rows={filteredSessions} allRows={sessions} onRowClick={handleSessClick}
            isClickable selected={selectedSess} filters={sessFilters} cellRenderers={sessCellRenderers} />
        )}
        {selectedSess && (
          <div className='mt-3 pt-3 border-t border-gray-100'>
            <p className='text-xs font-semibold text-gray-400 mb-1'>
              tre_results — {String(selectedSess.se_name)} {String(selectedSess.se_date).slice(0, 10)} ({sessResults.length} pairs)
            </p>
            <DataTable rows={sessResults} />
          </div>
        )}
      </div>

      {/* tpa_partners */}
      <div className='rounded border border-gray-200 p-3'>
        <SectionHeader label='tpa_partners — partnerships' shown={filteredPartners.length} total={partners.length} loading={partnersLoading}>
          <button onClick={loadPartners} disabled={partnersLoading}
            className='rounded bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50'>
            Load
          </button>
        </SectionHeader>
        {partners.length > 0 && (
          <DataTable rows={filteredPartners} allRows={partners} filters={paFilters} />
        )}
      </div>

    </div>
  )
}
