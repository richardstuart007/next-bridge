'use client'

//==============================================================================================
//  1) DESCRIPTION
//    BuildDataViewer — the /owner/builddata inspector. A tab bar (ts1/ts2/tse/tre/tpl/tpa/ta1/
//    ta2 plus Filters) where each tab shows one raw table with per-column filters and
//    click-through; a set of cross-tab "shared key" filters (plid/paid/seid/run_id) is threaded
//    through every tab so clicking a row on one tab pre-seeds the matching filter on the others.
//
//  2) NOTES
//    Each tab is its own component (PlayersTab, SessionsTab, …) declared below the main
//    component. mergeSharedFilters/removeSharedFilter own the shared-filter state.
//==============================================================================================

import { useState } from 'react'
import { getAllPlayers } from '@/src/lib/actions/players'
import { getSessionsByYear } from '@/src/lib/actions/sessions'
import { getResultsBySeid, getAllPartners, getAllResults, getAllPlayerStats, getAllPartnerStats } from '@/src/lib/actions/build-viewer'
import { EventTypeSelect } from '@/src/ui/shared/LookupSelects'
import { isSelectionFiltering } from 'nextjs-shared/isSelectionFiltering'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyTab } from 'nextjs-shared/MyTab'
import Ts1Table from '@/src/ui/admin/Ts1Table'
import Ts2Table from '@/src/ui/admin/Ts2Table'
import {
  DataTable, SectionHeader, FText, FDate, FSelect, FMultiSelect, rowKey, dateKey, numMatch,
  type Row, type SharedKey, type SharedFilters, SHARED_KEYS
} from '@/src/ui/admin/DataTableShared'
import { TOURNAMENT_GROUPS, SCORING_TYPES } from '@/src/lib/constants'

type Tab = 'ts1' | 'ts2' | 'tse' | 'tre' | 'tpl' | 'tpa' | 'ta1' | 'ta2' | 'filters'

const TAB_ACTIVE  = 'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors border-blue-600 text-blue-600'
const TAB_PASSIVE = 'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors border-transparent text-gray-500 hover:text-gray-700'

const TABS: { id: Tab; label: string }[] = [
  { id: 'ts1', label: 'ts1' },
  { id: 'ts2', label: 'ts2' },
  { id: 'tse', label: 'tse' },
  { id: 'tre', label: 'tre' },
  { id: 'tpl', label: 'tpl' },
  { id: 'tpa', label: 'tpa' },
  { id: 'ta1', label: 'ta1' },
  { id: 'ta2', label: 'ta2' },
  { id: 'filters', label: 'Filters' },
]

const YEARS = [2026, 2025, 2024, 2023, 2022, 2021]

type TabProps = { sharedFilters: SharedFilters; onKeyClick: (patch: SharedFilters) => void }

export default function BuildDataViewer() {
  const [active, setActive] = useState<Tab>('ts1')
  const [sharedFilters, setSharedFilters] = useState<SharedFilters>({})

  //----------------------------------------------------------------------------------------------
  //  mergeSharedFilters — merges a patch into the cross-tab shared-filter state
  //----------------------------------------------------------------------------------------------
  function mergeSharedFilters(patch: SharedFilters) {
    setSharedFilters(prev => ({ ...prev, ...patch }))
  }

  //----------------------------------------------------------------------------------------------
  //  removeSharedFilter — drops one key from the cross-tab shared-filter state
  //----------------------------------------------------------------------------------------------
  function removeSharedFilter(key: SharedKey) {
    setSharedFilters(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  return (
    <div>
      <div className='flex gap-0 border-b border-gray-200 mb-6'>
        {TABS.map(t => (
          <MyTab key={t.id} active={active === t.id} onClick={() => setActive(t.id)}
            underlineActiveClass={TAB_ACTIVE} underlineInactiveClass={TAB_PASSIVE}>
            {t.label}
          </MyTab>
        ))}
      </div>

      {active === 'ts1' && <Ts1Table sharedFilters={sharedFilters} onKeyClick={mergeSharedFilters} />}
      {active === 'ts2' && <Ts2Table sharedFilters={sharedFilters} onKeyClick={mergeSharedFilters} />}
      {active === 'tse' && <SessionsTab sharedFilters={sharedFilters} onKeyClick={mergeSharedFilters} />}
      {active === 'tre' && <ResultsTab sharedFilters={sharedFilters} onKeyClick={mergeSharedFilters} />}
      {active === 'tpl' && <PlayersTab sharedFilters={sharedFilters} onKeyClick={mergeSharedFilters} />}
      {active === 'tpa' && <PartnersTab sharedFilters={sharedFilters} onKeyClick={mergeSharedFilters} />}
      {active === 'ta1' && <PlayerStatsTab sharedFilters={sharedFilters} onKeyClick={mergeSharedFilters} />}
      {active === 'ta2' && <PartnerStatsTab sharedFilters={sharedFilters} onKeyClick={mergeSharedFilters} />}
      {active === 'filters' && <FiltersTab sharedFilters={sharedFilters} onRemove={removeSharedFilter} onAdd={mergeSharedFilters} />}
    </div>
  )
}

//----------------------------------------------------------------------------------
//  PlayersTab — the tpl tab: loads getAllPlayers, filters in-browser, click a row
//  to publish its plid to the shared filters
//----------------------------------------------------------------------------------
function PlayersTab({ sharedFilters, onKeyClick }: TabProps) {
  const [error,          setError]          = useState<string | null>(null)
  const [players,        setPlayers]        = useState<Row[]>([])
  const [playersLoading, setPlayersLoading] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<Row | null>(null)
  const [filter_plid,         setFilter_plid]         = useState(() => sharedFilters.plid?.value ?? '')
  const [filter_name,         setFilter_name]         = useState('')
  const [filter_nzb, setFilter_nzb] = useState('')
  const [filter_club,         setFilter_club]         = useState<string[]>([])
  const [filter_rank,         setFilter_rank]         = useState('')
  const [filter_grade,        setFilter_grade]        = useState<string[]>([])
  const [filter_all_results,  setFilter_all_results]  = useState('all')

  //--------------------------------------------------------------------------------------------
  //  loadPlayers — fetches getAllPlayers into `players`
  //--------------------------------------------------------------------------------------------
  async function loadPlayers() {
    setPlayersLoading(true); setError(null); setSelectedPlayer(null)
    try { setPlayers((await getAllPlayers()) as Row[]) }
    catch (err) { setError(String(err)) }
    finally { setPlayersLoading(false) }
  }

  //--------------------------------------------------------------------------------------------
  //  handlePlayerClick — toggles row selection; on select publishes plid (+ name label)
  //--------------------------------------------------------------------------------------------
  function handlePlayerClick(row: Row) {
    if (selectedPlayer && rowKey(selectedPlayer) === rowKey(row)) { setSelectedPlayer(null); return }
    setSelectedPlayer(row)
    onKeyClick({ plid: { value: String(row.pl_plid), label: String(row.pl_name ?? '') } })
  }

  const clubOptions  = Array.from(new Set(players.map(r => String(r.pl_club  ?? '')))).filter(Boolean).sort()
  const gradeOptions = Array.from(new Set(players.map(r => String(r.pl_grade ?? '')))).filter(Boolean).sort()

  const filteredPlayers = players.filter(r => {
    if (filter_plid && !String(r.pl_plid ?? '').includes(filter_plid)) return false
    if (filter_name && !String(r.pl_name ?? '').toLowerCase().includes(filter_name.toLowerCase())) return false
    if (filter_nzb && !String(r.pl_nzb ?? '').includes(filter_nzb)) return false
    if (filter_club.length > 0 && !filter_club.includes(String(r.pl_club ?? ''))) return false
    if (filter_rank && !String(r.pl_rank ?? '').toLowerCase().includes(filter_rank.toLowerCase())) return false
    if (filter_grade.length > 0 && !filter_grade.includes(String(r.pl_grade ?? ''))) return false
    if (filter_all_results !== 'all') {
      const want = filter_all_results === 'yes'
      if (Boolean(r.pl_tracked) !== want) return false
    }
    return true
  })

  const playerFilters: Record<string, React.ReactNode> = {
    pl_plid:             <FText placeholder='id…'    value={filter_plid} onChange={setFilter_plid} />,
    pl_name:             <FText placeholder='name…'  value={filter_name} onChange={setFilter_name} />,
    pl_nzb: <FText placeholder='nzb#…'  value={filter_nzb} onChange={setFilter_nzb} />,
    pl_club:             <FMultiSelect options={clubOptions} value={filter_club} onChange={setFilter_club} />,
    pl_rank:             <FText placeholder='rank…'  value={filter_rank} onChange={setFilter_rank} />,
    pl_grade:            <FMultiSelect options={gradeOptions} value={filter_grade} onChange={setFilter_grade} />,
    pl_tracked:      <FSelect value={filter_all_results} onChange={setFilter_all_results}>
                            <option value='all'>all</option><option value='yes'>Yes</option><option value='no'>No</option>
                          </FSelect>,
  }

  return (
    <div className='space-y-4'>
      {error && <p className='text-sm text-red-600'>{error}</p>}
      <div className='rounded border border-gray-200 p-3'>
        <SectionHeader label='tpl_players — players' shown={filteredPlayers.length} total={players.length} loading={playersLoading}>
          <MyButton onClick={loadPlayers} disabled={playersLoading}
            overrideClass='rounded bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50 text-gray-700 h-auto md:h-auto'>
            Load
          </MyButton>
        </SectionHeader>
        {players.length > 0 && (
          <DataTable rows={filteredPlayers} allRows={players} onRowClick={handlePlayerClick}
            isClickable selected={selectedPlayer} filters={playerFilters} />
        )}
      </div>
    </div>
  )
}

//----------------------------------------------------------------------------------
//  SessionsTab — the tse tab: loads sessions for a chosen year, filters in-browser,
//  and shows the clicked session's tre_results below; publishes seid + run_id
//----------------------------------------------------------------------------------
function SessionsTab({ sharedFilters, onKeyClick }: TabProps) {
  const [error,              setError]              = useState<string | null>(null)
  const [sessYear,           setSessYear]           = useState(new Date().getFullYear())
  const [sessions,           setSessions]           = useState<Row[]>([])
  const [sessLoading,        setSessLoading]        = useState(false)
  const [selectedSess,       setSelectedSess]       = useState<Row | null>(null)
  const [sessResults,        setSessResults]        = useState<Row[]>([])
  const [filter_seid,        setFilter_seid]        = useState(() => sharedFilters.seid?.value ?? '')
  const [filter_run_id,      setFilter_run_id]      = useState(() => sharedFilters.run_id?.value ?? '')
  const [filter_date,        setFilter_date]        = useState('')
  const [filter_scoring,     setFilter_scoring]     = useState<string[]>([])
  const [filter_club,        setFilter_club]        = useState<string[]>([])
  const [filter_name,        setFilter_name]        = useState('')
  const [filter_tournament,  setFilter_tournament]  = useState<string[]>([])
  const [filter_event_type,  setFilter_event_type]  = useState<Set<string>>(new Set())
  const [eventTypeOptions,   setEventTypeOptions]   = useState<string[]>([])
  const [filter_day_of_week, setFilter_day_of_week] = useState<string[]>([])
  const [filter_is_summary,  setFilter_is_summary]  = useState('all')
  const tournamentTypes: string[] = [...TOURNAMENT_GROUPS]
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  //--------------------------------------------------------------------------------------------
  //  loadSessions — fetches getSessionsByYear(y) into `sessions`
  //--------------------------------------------------------------------------------------------
  async function loadSessions(y: number) {
    setSessLoading(true); setError(null); setSelectedSess(null); setSessResults([])
    try { setSessions((await getSessionsByYear(y)) as Row[]) }
    catch (err) { setError(String(err)) }
    finally { setSessLoading(false) }
  }

  //--------------------------------------------------------------------------------------------
  //  handleSessClick — toggles row selection; on select publishes seid + run_id and loads the
  //  session's tre_results via getResultsBySeid
  //--------------------------------------------------------------------------------------------
  async function handleSessClick(row: Row) {
    if (selectedSess && rowKey(selectedSess) === rowKey(row)) { setSelectedSess(null); setSessResults([]); return }
    setSelectedSess(row); setSessResults([])
    onKeyClick({
      seid:   { value: String(row.se_seid), label: String(row.se_name ?? '') },
      run_id: { value: String(row.se_run_id) },
    })
    try { setSessResults((await getResultsBySeid(row.se_seid as number)) as Row[]) }
    catch (err) { setError(String(err)) }
  }

  const clubOptions = Array.from(new Set(sessions.map(r => String(r.se_club ?? '')))).filter(Boolean).sort()

  const filteredSessions = sessions.filter(r => {
    if (filter_name      && !String(r.se_name       ?? '').toLowerCase().includes(filter_name.toLowerCase()))  return false
    if (filter_date      && dateKey(r.se_date) !== filter_date) return false
    if (filter_club.length > 0 && !filter_club.includes(String(r.se_club ?? ''))) return false
    if (filter_seid      && !String(r.se_seid    ?? '').includes(filter_seid))                              return false
    if (filter_run_id    && !String(r.se_run_id  ?? '').includes(filter_run_id))                            return false
    if (filter_scoring.length > 0 && !filter_scoring.includes(String(r.se_scoring ?? '')))   return false
    if (isSelectionFiltering([...filter_event_type], eventTypeOptions.length) && !filter_event_type.has(String(r.se_event_type ?? ''))) return false
    if (filter_day_of_week.length > 0 && !filter_day_of_week.includes(String(r.se_day_of_week ?? '')))       return false
    if (filter_is_summary !== 'all') {
      const want = filter_is_summary === 'yes'
      if (Boolean(r.se_is_summary) !== want) return false
    }
    if (filter_tournament.length > 0 && !filter_tournament.includes(String(r.se_tournament ?? '').slice(-1).toUpperCase())) return false
    return true
  })

  const sessFilters: Record<string, React.ReactNode> = {
    se_seid:      <FText placeholder='seid…' value={filter_seid}     onChange={setFilter_seid} />,
    se_run_id:    <FText placeholder='id…'   value={filter_run_id}   onChange={setFilter_run_id} />,
    se_date:      <FDate value={filter_date} onChange={setFilter_date} />,
    se_day_of_week:  <FMultiSelect options={dayNames} value={filter_day_of_week} onChange={setFilter_day_of_week} />,
    se_scoring:      <FMultiSelect options={[...SCORING_TYPES]} value={filter_scoring} onChange={setFilter_scoring} />,
    se_name:         <FText placeholder='name…' value={filter_name} onChange={setFilter_name} />,
    se_club:         <FMultiSelect options={clubOptions} value={filter_club} onChange={setFilter_club} />,
    se_tournament:   <FMultiSelect options={tournamentTypes} value={filter_tournament} onChange={setFilter_tournament} />,
    se_event_type:   <EventTypeSelect selected={filter_event_type} onChange={setFilter_event_type}
                        onOptionsLoaded={opts => { setEventTypeOptions(opts); setFilter_event_type(new Set(opts)) }} />,
    se_is_summary:   <FSelect value={filter_is_summary} onChange={setFilter_is_summary}>
                        <option value='all'>all</option><option value='yes'>Yes</option><option value='no'>No</option>
                      </FSelect>,
  }

  const sessCellRenderers: Record<string, (val: unknown) => React.ReactNode> = {
    se_run_id: val => (
      <a href={`https://www.nzbridge.co.nz/results.html?run_id=${val}`}
         target='_blank' rel='noopener noreferrer'
         className='text-blue-600 hover:underline'
         onClick={e => e.stopPropagation()}>
        {String(val)}
      </a>
    ),
  }

  return (
    <div className='space-y-4'>
      {error && <p className='text-sm text-red-600'>{error}</p>}
      <div className='rounded border border-gray-200 p-3'>
        <SectionHeader label='tse_sessions — sessions' shown={filteredSessions.length} total={sessions.length} loading={sessLoading}>
          <FSelect value={String(sessYear)} onChange={v => setSessYear(parseInt(v, 10))}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </FSelect>
          <MyButton onClick={() => loadSessions(sessYear)} disabled={sessLoading}
            overrideClass='rounded bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50 text-gray-700 h-auto md:h-auto'>
            Load
          </MyButton>
        </SectionHeader>
        {sessions.length > 0 && (
          <DataTable rows={filteredSessions} allRows={sessions} onRowClick={handleSessClick}
            isClickable selected={selectedSess} filters={sessFilters} cellRenderers={sessCellRenderers} />
        )}
        {selectedSess && (
          <div className='mt-3 pt-3 border-t border-gray-100'>
            <p className='text-xs font-semibold text-gray-400 mb-1'>
              tre_results — {String(selectedSess.se_name)} {dateKey(selectedSess.se_date) ?? ''} ({sessResults.length} pairs)
            </p>
            <DataTable rows={sessResults} />
          </div>
        )}
      </div>
    </div>
  )
}

//----------------------------------------------------------------------------------
//  ResultsTab — the tre tab: loads getAllResults, filters in-browser, click a row
//  to publish its seid + paid
//----------------------------------------------------------------------------------
function ResultsTab({ sharedFilters, onKeyClick }: TabProps) {
  const [error,    setError]    = useState<string | null>(null)
  const [results,  setResults]  = useState<Row[]>([])
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState<Row | null>(null)

  const [filter_reid,       setFilter_reid]       = useState('')
  const [filter_seid,       setFilter_seid]       = useState(() => sharedFilters.seid?.value ?? '')
  const [filter_pl_name1,   setFilter_pl_name1]   = useState('')
  const [filter_pl_name2,   setFilter_pl_name2]   = useState('')
  const [filter_paid,       setFilter_paid]       = useState(() => sharedFilters.paid?.value ?? '')
  const [filter_score,      setFilter_score]      = useState('')

  //--------------------------------------------------------------------------------------------
  //  load — fetches getAllResults into `results`
  //--------------------------------------------------------------------------------------------
  async function load() {
    setLoading(true); setError(null)
    try { setResults((await getAllResults()) as Row[]) }
    catch (err) { setError(String(err)) }
    finally { setLoading(false) }
  }

  //--------------------------------------------------------------------------------------------
  //  handleClick — toggles row selection; on select publishes the row's seid + paid
  //--------------------------------------------------------------------------------------------
  function handleClick(row: Row) {
    if (selected && rowKey(selected) === rowKey(row)) { setSelected(null); return }
    setSelected(row)
    onKeyClick({
      seid: { value: String(row.re_seid) },
      paid: { value: String(row.re_paid) },
    })
  }

  const filteredResults = results.filter(r => {
    if (filter_reid       && !String(r.re_reid ?? '').includes(filter_reid)) return false
    if (filter_seid       && !String(r.re_seid ?? '').includes(filter_seid)) return false
    if (filter_pl_name1   && !String(r.pl_name1 ?? '').toLowerCase().includes(filter_pl_name1.toLowerCase())) return false
    if (filter_pl_name2   && !String(r.pl_name2 ?? '').toLowerCase().includes(filter_pl_name2.toLowerCase())) return false
    if (filter_paid       && !String(r.re_paid ?? '').includes(filter_paid)) return false
    if (filter_score      && !String(r.re_score ?? '').includes(filter_score)) return false
    return true
  })

  const filters: Record<string, React.ReactNode> = {
    re_reid:       <FText placeholder='id…'    value={filter_reid}       onChange={setFilter_reid} />,
    re_seid:       <FText placeholder='seid…'  value={filter_seid}       onChange={setFilter_seid} />,
    pl_name1:      <FText placeholder='name…'  value={filter_pl_name1}   onChange={setFilter_pl_name1} />,
    pl_name2:      <FText placeholder='name…'  value={filter_pl_name2}   onChange={setFilter_pl_name2} />,
    re_paid:       <FText placeholder='paid…'  value={filter_paid}       onChange={setFilter_paid} />,
    re_score:      <FText placeholder='score…' value={filter_score}      onChange={setFilter_score} />,
  }

  return (
    <div className='space-y-4'>
      {error && <p className='text-sm text-red-600'>{error}</p>}
      <div className='rounded border border-gray-200 p-3'>
        <SectionHeader label='tre_results — results' shown={filteredResults.length} total={results.length} loading={loading}>
          <MyButton onClick={load} disabled={loading}
            overrideClass='rounded bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50 text-gray-700 h-auto md:h-auto'>
            Load
          </MyButton>
        </SectionHeader>
        {results.length > 0 && (
          <DataTable rows={filteredResults} allRows={results} onRowClick={handleClick}
            isClickable selected={selected} filters={filters} />
        )}
      </div>
    </div>
  )
}

//----------------------------------------------------------------------------------
//  PartnersTab — the tpa tab: loads getAllPartners, filters in-browser (incl. a
//  "player on either side" filter), click a row to publish paid + both plids
//----------------------------------------------------------------------------------
function PartnersTab({ sharedFilters, onKeyClick }: TabProps) {
  const [error,           setError]           = useState<string | null>(null)
  const [partners,        setPartners]        = useState<Row[]>([])
  const [partnersLoading, setPartnersLoading] = useState(false)
  const [selectedPartner, setSelectedPartner] = useState<Row | null>(null)
  const [filter_pl_name1,     setFilter_pl_name1]     = useState('')
  const [filter_plid1,        setFilter_plid1]        = useState(() => sharedFilters.plid1?.value ?? '')
  const [filter_pl_name2,     setFilter_pl_name2]     = useState('')
  const [filter_plid2,        setFilter_plid2]        = useState(() => sharedFilters.plid2?.value ?? '')
  const [filter_paid,         setFilter_paid]         = useState(() => sharedFilters.paid?.value ?? '')
  const [filter_involves_plid, setFilter_involves_plid] = useState(() => sharedFilters.plid?.value ?? '')

  //--------------------------------------------------------------------------------------------
  //  loadPartners — fetches getAllPartners into `partners`
  //--------------------------------------------------------------------------------------------
  async function loadPartners() {
    setPartnersLoading(true); setError(null); setSelectedPartner(null)
    try { setPartners((await getAllPartners()) as Row[]) }
    catch (err) { setError(String(err)) }
    finally { setPartnersLoading(false) }
  }

  //--------------------------------------------------------------------------------------------
  //  handlePartnerClick — toggles row selection; on select publishes paid + both plids
  //--------------------------------------------------------------------------------------------
  function handlePartnerClick(row: Row) {
    if (selectedPartner && rowKey(selectedPartner) === rowKey(row)) { setSelectedPartner(null); return }
    setSelectedPartner(row)
    onKeyClick({
      paid:  { value: String(row.pa_paid) },
      plid1: { value: String(row.pa_plid1), label: String(row.pl_name1 ?? '') },
      plid2: { value: String(row.pa_plid2), label: String(row.pl_name2 ?? '') },
    })
  }

  const filteredPartners = partners.filter(r => {
    if (filter_pl_name1 && !String(r.pl_name1 ?? '').toLowerCase().includes(filter_pl_name1.toLowerCase())) return false
    if (filter_plid1    && !String(r.pa_plid1 ?? '').includes(filter_plid1)) return false
    if (filter_pl_name2 && !String(r.pl_name2 ?? '').toLowerCase().includes(filter_pl_name2.toLowerCase())) return false
    if (filter_plid2    && !String(r.pa_plid2 ?? '').includes(filter_plid2)) return false
    if (filter_paid && !String(r.pa_paid ?? '').includes(filter_paid)) return false
    if (filter_involves_plid && String(r.pa_plid1 ?? '') !== filter_involves_plid && String(r.pa_plid2 ?? '') !== filter_involves_plid) return false
    return true
  })

  const paFilters: Record<string, React.ReactNode> = {
    pa_paid:        <FText placeholder='paid…'  value={filter_paid}       onChange={setFilter_paid} />,
    pl_name1:       <FText placeholder='name…'  value={filter_pl_name1}   onChange={setFilter_pl_name1} />,
    pa_plid1:       <FText placeholder='id…'    value={filter_plid1}      onChange={setFilter_plid1} />,
    pl_name2:       <FText placeholder='name…'  value={filter_pl_name2}   onChange={setFilter_pl_name2} />,
    pa_plid2:       <FText placeholder='id…'    value={filter_plid2}      onChange={setFilter_plid2} />,
  }

  return (
    <div className='space-y-4'>
      {error && <p className='text-sm text-red-600'>{error}</p>}
      <div className='rounded border border-gray-200 p-3'>
        <SectionHeader label='tpa_partners — partnerships' shown={filteredPartners.length} total={partners.length} loading={partnersLoading}>
          <span className='text-xs text-gray-400'>Player (either side):</span>
          <FText placeholder='plid…' value={filter_involves_plid} onChange={setFilter_involves_plid} />
          <MyButton onClick={loadPartners} disabled={partnersLoading}
            overrideClass='rounded bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50 text-gray-700 h-auto md:h-auto'>
            Load
          </MyButton>
        </SectionHeader>
        {partners.length > 0 && (
          <DataTable rows={filteredPartners} allRows={partners} onRowClick={handlePartnerClick}
            isClickable selected={selectedPartner} filters={paFilters} />
        )}
      </div>
    </div>
  )
}

//----------------------------------------------------------------------------------
//  PlayerStatsTab — the ta1 tab: loads getAllPlayerStats, filters in-browser, click
//  a row to publish its plid
//----------------------------------------------------------------------------------
function PlayerStatsTab({ sharedFilters, onKeyClick }: TabProps) {
  const [error,    setError]    = useState<string | null>(null)
  const [stats,    setStats]    = useState<Row[]>([])
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState<Row | null>(null)

  const [filter_pl_name,     setFilter_pl_name]     = useState('')
  const [filter_plid,        setFilter_plid]        = useState(() => sharedFilters.plid?.value ?? '')
  const [filter_group,       setFilter_group]       = useState<string[]>([])
  const [filter_scoring,     setFilter_scoring]     = useState<string[]>([])
  const [filter_sessions,    setFilter_sessions]    = useState('')
  const [filter_avg,         setFilter_avg]         = useState('')
  const [filter_stddev,      setFilter_stddev]      = useState('')

  //--------------------------------------------------------------------------------------------
  //  load — fetches getAllPlayerStats into `stats`
  //--------------------------------------------------------------------------------------------
  async function load() {
    setLoading(true); setError(null)
    try { setStats((await getAllPlayerStats()) as Row[]) }
    catch (err) { setError(String(err)) }
    finally { setLoading(false) }
  }

  //--------------------------------------------------------------------------------------------
  //  handleClick — toggles row selection; on select publishes the row's a1_plid (+ name label)
  //--------------------------------------------------------------------------------------------
  function handleClick(row: Row) {
    if (selected && rowKey(selected) === rowKey(row)) { setSelected(null); return }
    setSelected(row)
    onKeyClick({ plid: { value: String(row.a1_plid), label: String(row.pl_name ?? '') } })
  }

  const groupOptions = Array.from(new Set(stats.map(r => String(r.a1_group ?? '')))).filter(Boolean).sort()
  const scoringOptions = Array.from(new Set(stats.map(r => String(r.a1_scoring ?? '')))).filter(Boolean).sort()

  const filteredStats = stats.filter(r => {
    if (filter_pl_name     && !String(r.pl_name ?? '').toLowerCase().includes(filter_pl_name.toLowerCase())) return false
    if (filter_plid        && !String(r.a1_plid ?? '').includes(filter_plid)) return false
    if (filter_group.length > 0 && !filter_group.includes(String(r.a1_group ?? ''))) return false
    if (filter_scoring.length > 0 && !filter_scoring.includes(String(r.a1_scoring ?? ''))) return false
    if (!numMatch(filter_sessions, r.a1_sessions)) return false
    if (!numMatch(filter_avg,      r.a1_avg))      return false
    if (!numMatch(filter_stddev,   r.a1_stddev))   return false
    return true
  })

  const filters: Record<string, React.ReactNode> = {
    pl_name:     <FText placeholder='name…'     value={filter_pl_name}  onChange={setFilter_pl_name} />,
    a1_plid:     <FText placeholder='id…'       value={filter_plid}     onChange={setFilter_plid} />,
    a1_group:    <FMultiSelect options={groupOptions}   value={filter_group}   onChange={setFilter_group} />,
    a1_scoring:  <FMultiSelect options={scoringOptions} value={filter_scoring} onChange={setFilter_scoring} />,
    a1_sessions: <FText placeholder='sessions…' value={filter_sessions} onChange={setFilter_sessions} />,
    a1_avg:      <FText placeholder='avg…'      value={filter_avg}      onChange={setFilter_avg} />,
    a1_stddev:   <FText placeholder='stddev…'   value={filter_stddev}   onChange={setFilter_stddev} />,
  }

  return (
    <div className='space-y-4'>
      {error && <p className='text-sm text-red-600'>{error}</p>}
      <div className='rounded border border-gray-200 p-3'>
        <SectionHeader label='ta1_player_stats' shown={filteredStats.length} total={stats.length} loading={loading}>
          <MyButton onClick={load} disabled={loading}
            overrideClass='rounded bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50 text-gray-700 h-auto md:h-auto'>
            Load
          </MyButton>
        </SectionHeader>
        {stats.length > 0 && (
          <DataTable rows={filteredStats} allRows={stats} onRowClick={handleClick}
            isClickable selected={selected} filters={filters} />
        )}
      </div>
    </div>
  )
}

//----------------------------------------------------------------------------------
//  PartnerStatsTab — the ta2 tab: loads getAllPartnerStats, filters in-browser,
//  click a row to publish its paid
//----------------------------------------------------------------------------------
function PartnerStatsTab({ sharedFilters, onKeyClick }: TabProps) {
  const [error,    setError]    = useState<string | null>(null)
  const [stats,    setStats]    = useState<Row[]>([])
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState<Row | null>(null)

  const [filter_paid,        setFilter_paid]        = useState(() => sharedFilters.paid?.value ?? '')
  const [filter_group,       setFilter_group]       = useState<string[]>([])
  const [filter_scoring,     setFilter_scoring]     = useState<string[]>([])
  const [filter_sessions,    setFilter_sessions]    = useState('')
  const [filter_avg,         setFilter_avg]         = useState('')
  const [filter_stddev,      setFilter_stddev]      = useState('')

  //--------------------------------------------------------------------------------------------
  //  load — fetches getAllPartnerStats into `stats`
  //--------------------------------------------------------------------------------------------
  async function load() {
    setLoading(true); setError(null)
    try { setStats((await getAllPartnerStats()) as Row[]) }
    catch (err) { setError(String(err)) }
    finally { setLoading(false) }
  }

  //--------------------------------------------------------------------------------------------
  //  handleClick — toggles row selection; on select publishes the row's a2_paid
  //--------------------------------------------------------------------------------------------
  function handleClick(row: Row) {
    if (selected && rowKey(selected) === rowKey(row)) { setSelected(null); return }
    setSelected(row)
    onKeyClick({ paid: { value: String(row.a2_paid) } })
  }

  const groupOptions = Array.from(new Set(stats.map(r => String(r.a2_group ?? '')))).filter(Boolean).sort()
  const scoringOptions = Array.from(new Set(stats.map(r => String(r.a2_scoring ?? '')))).filter(Boolean).sort()

  const filteredStats = stats.filter(r => {
    if (filter_paid        && !String(r.a2_paid ?? '').includes(filter_paid)) return false
    if (filter_group.length > 0 && !filter_group.includes(String(r.a2_group ?? ''))) return false
    if (filter_scoring.length > 0 && !filter_scoring.includes(String(r.a2_scoring ?? ''))) return false
    if (!numMatch(filter_sessions, r.a2_sessions)) return false
    if (!numMatch(filter_avg,      r.a2_avg))      return false
    if (!numMatch(filter_stddev,   r.a2_stddev))   return false
    return true
  })

  const filters: Record<string, React.ReactNode> = {
    a2_paid:     <FText placeholder='id…'       value={filter_paid}     onChange={setFilter_paid} />,
    a2_group:    <FMultiSelect options={groupOptions}   value={filter_group}   onChange={setFilter_group} />,
    a2_scoring:  <FMultiSelect options={scoringOptions} value={filter_scoring} onChange={setFilter_scoring} />,
    a2_sessions: <FText placeholder='sessions…' value={filter_sessions} onChange={setFilter_sessions} />,
    a2_avg:      <FText placeholder='avg…'      value={filter_avg}      onChange={setFilter_avg} />,
    a2_stddev:   <FText placeholder='stddev…'   value={filter_stddev}   onChange={setFilter_stddev} />,
  }

  return (
    <div className='space-y-4'>
      {error && <p className='text-sm text-red-600'>{error}</p>}
      <div className='rounded border border-gray-200 p-3'>
        <SectionHeader label='ta2_partner_stats' shown={filteredStats.length} total={stats.length} loading={loading}>
          <MyButton onClick={load} disabled={loading}
            overrideClass='rounded bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50 text-gray-700 h-auto md:h-auto'>
            Load
          </MyButton>
        </SectionHeader>
        {stats.length > 0 && (
          <DataTable rows={filteredStats} allRows={stats} onRowClick={handleClick}
            isClickable selected={selected} filters={filters} />
        )}
      </div>
    </div>
  )
}

//----------------------------------------------------------------------------------
//  FiltersTab — the Filters tab: lists the active cross-tab key filters (each
//  removable) and a key/value form to add one manually
//----------------------------------------------------------------------------------
function FiltersTab({ sharedFilters, onRemove, onAdd }: {
  sharedFilters: SharedFilters
  onRemove: (key: SharedKey) => void
  onAdd: (patch: SharedFilters) => void
}) {
  const [addKey,   setAddKey]   = useState<SharedKey>('plid')
  const [addValue, setAddValue] = useState('')

  //--------------------------------------------------------------------------------------------
  //  handleAdd — adds the { addKey: addValue } entry to the shared filters and clears the input
  //--------------------------------------------------------------------------------------------
  function handleAdd() {
    if (!addValue.trim()) return
    onAdd({ [addKey]: { value: addValue.trim() } })
    setAddValue('')
  }

  const activeKeys = SHARED_KEYS.filter(k => sharedFilters[k] !== undefined)

  return (
    <div className='space-y-4'>
      <div className='rounded border border-gray-200 p-3'>
        <SectionHeader label='Active key filters' />
        {activeKeys.length === 0 && (
          <p className='text-xs text-gray-400 py-2'>No key filters set — click a row on any tab to set one.</p>
        )}
        {activeKeys.length > 0 && (
          <ul className='space-y-1'>
            {activeKeys.map(key => {
              const entry = sharedFilters[key]!
              return (
                <li key={key} className='flex items-center gap-2 text-xs py-1'>
                  <span className='font-medium text-gray-500 w-16'>{key}</span>
                  <span className='text-gray-700'>{entry.label ? `${entry.label} (${entry.value})` : entry.value}</span>
                  <MyButton onClick={() => onRemove(key)}
                    overrideClass='rounded bg-gray-100 border border-gray-300 px-1.5 py-0 text-xs hover:bg-gray-200 text-gray-500 h-auto md:h-auto'>
                    ×
                  </MyButton>
                </li>
              )
            })}
          </ul>
        )}
        <div className='mt-3 pt-3 border-t border-gray-100 flex items-center gap-2'>
          <div className='w-24'>
            <FSelect value={addKey} onChange={v => setAddKey(v as SharedKey)}>
              {SHARED_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </FSelect>
          </div>
          <div className='w-32'>
            <FText placeholder='value…' value={addValue} onChange={setAddValue} />
          </div>
          <MyButton onClick={handleAdd}
            overrideClass='rounded bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 text-gray-700 h-auto md:h-auto'>
            Add
          </MyButton>
        </div>
      </div>
    </div>
  )
}
