'use client'

//==============================================================================================
//  1) DESCRIPTION
//    PipelineTable — the /owner/pipeline page. A 4-tab UI (Overview / AKBC / Tracked Players /
//    Finish) with per-step Run buttons, per-tab "Run All" sequencers, live "remaining" status
//    counts, and a per-run Jobs summary table (JobsTable) driven by tpip_pipelinelog.
//
//  2) NOTES
//    Top-level function order is kept helpers-first, main-component-last (against the usual
//    convention): the module-level STATS_SUB_ROWS constant calls playerStatsSql/partnerStatsSql
//    at init time, so a clean main-first reorder is entangled with const-initialisation order.
//    All declarations hoist, so the arrangement is cosmetic. Flagged for a separate review.
//==============================================================================================

import { useState, useEffect, Fragment } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import { MyTab } from 'nextjs-shared/MyTab'
import { MyHelp } from 'nextjs-shared/MyHelp'
import { MyHelpStep } from 'nextjs-shared/MyHelpStep'
import { getRecentRunIds, getPipelineRunStatus, type PipelineStatus } from '@/src/lib/actions/pipelineLog'
import { getScrapeFromDate } from '@/src/lib/actions/pipelineScrape'
import {
  refreshSessionsStatus, refreshResultsStatus, refreshPartnersStatus, getStagingCounts,
  type StepStatus, type StagingCounts
} from '@/src/lib/actions/pipelineStatus'
import { SCRAPE_TIME_BUDGET_MS, FETCH_TIMEOUT_MS, PIPELINE_RUN_POLL_MS, TOURNAMENT_GROUP_SQL_EXPR, BRIDGE_CLUB_ID } from '@/src/lib/constants'

type StepResult = { data: Record<string, unknown> | null; error: string | null }

type Tab = 'overview' | 'akbc' | 'tracked' | 'finish'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'akbc',     label: 'AKBC' },
  { id: 'tracked',  label: 'Tracked Players' },
  { id: 'finish',   label: 'Finish' },
]

type SubStep = { subStep: string; label: string }

//
//  Step 0 is the run-marker written by /api/build/start-run (single row, no
//  sub-steps). Then 4 real top-level pipeline steps written to tpip_pipelinelog:
//  steps 1/2 each have their own Scrape/Build Sessions/Build Results sub-steps;
//  step 3 is a single row; step 4 keeps its existing 8 stats sub-steps.
//
const STEP_LABELS: Record<number, string> = {
  0: 'Start Run', 1: 'AKBC', 2: 'Tracked Players', 3: 'Build Partners', 4: 'Update Stats',
}

const STEP_SUBSTEPS: Record<number, SubStep[] | null> = {
  0: null,
  1: [
    { subStep: 'a', label: 'Scrape' },
    { subStep: 'b', label: 'Build Sessions' },
    { subStep: 'c', label: 'Build Results' },
  ],
  2: [
    { subStep: 'a', label: 'Scrape' },
    { subStep: 'b', label: 'Build Sessions' },
    { subStep: 'c', label: 'Build Results' },
  ],
  3: null,
  4: [
    { subStep: 'a', label: 'Player Stats — Group A' },
    { subStep: 'b', label: 'Player Stats — Group B' },
    { subStep: 'c', label: 'Player Stats — Group C' },
    { subStep: 'd', label: 'Player Stats — All' },
    { subStep: 'e', label: 'Partner Stats — Group A' },
    { subStep: 'f', label: 'Partner Stats — Group B' },
    { subStep: 'g', label: 'Partner Stats — Group C' },
    { subStep: 'h', label: 'Partner Stats — All' },
  ],
}

const GRP_EXPR_SQL = TOURNAMENT_GROUP_SQL_EXPR

//----------------------------------------------------------------------------------------------
//  playerStatsSql — the (abbreviated, display-only) ta1_player_stats upsert SQL for one group,
//  shown in the step's SQL popover
//----------------------------------------------------------------------------------------------
function playerStatsSql(grp: string): string {
  const isAll = grp === 'all'
  return `INSERT INTO ta1_player_stats
  (a1_plid, a1_group, a1_scoring, a1_sessions, a1_avg, a1_stddev)
SELECT u.plid, ${isAll ? "'all'" : `'${grp}'`}, se_scoring, ...
FROM tre_results
JOIN tse_sessions ON se_seid = re_seid
JOIN tpa_partners ON pa_paid = re_paid
CROSS JOIN LATERAL unnest(ARRAY[pa_plid1, pa_plid2]) AS u(plid)
WHERE se_is_summary IS NOT TRUE
${isAll ? '' : `AND ${GRP_EXPR_SQL} = '${grp}'`}
GROUP BY u.plid, se_scoring
ON CONFLICT (a1_plid, a1_group, a1_scoring) DO UPDATE SET ...;`
}

//----------------------------------------------------------------------------------------------
//  partnerStatsSql — the (abbreviated, display-only) ta2_partner_stats upsert SQL for one
//  group, shown in the step's SQL popover
//----------------------------------------------------------------------------------------------
function partnerStatsSql(grp: string): string {
  const isAll = grp === 'all'
  return `INSERT INTO ta2_partner_stats
  (a2_paid, a2_group, a2_scoring, a2_sessions, a2_avg, a2_stddev)
SELECT re_paid, ${isAll ? "'all'" : `'${grp}'`}, se_scoring, ...
FROM tre_results
JOIN tse_sessions ON se_seid = re_seid
WHERE se_is_summary IS NOT TRUE
${isAll ? '' : `AND ${GRP_EXPR_SQL} = '${grp}'`}
GROUP BY re_paid, se_scoring
ON CONFLICT (a2_paid, a2_group, a2_scoring) DO UPDATE SET ...;`
}

const STATS_SUB_ROWS: { key: string; label: string; url: string; sql: string }[] = [
  { key: 'player-a',    label: 'Player Stats — Group A',  url: '/api/players/recalculate?mode=player_grp&grp=A',   sql: playerStatsSql('A') },
  { key: 'player-b',    label: 'Player Stats — Group B',  url: '/api/players/recalculate?mode=player_grp&grp=B',   sql: playerStatsSql('B') },
  { key: 'player-c',    label: 'Player Stats — Group C',  url: '/api/players/recalculate?mode=player_grp&grp=C',   sql: playerStatsSql('C') },
  { key: 'player-all',  label: 'Player Stats — All',      url: '/api/players/recalculate?mode=player_grp&grp=all', sql: playerStatsSql('all') },
  { key: 'partner-a',   label: 'Partner Stats — Group A', url: '/api/players/recalculate?mode=partner_grp&grp=A',   sql: partnerStatsSql('A') },
  { key: 'partner-b',   label: 'Partner Stats — Group B', url: '/api/players/recalculate?mode=partner_grp&grp=B',   sql: partnerStatsSql('B') },
  { key: 'partner-c',   label: 'Partner Stats — Group C', url: '/api/players/recalculate?mode=partner_grp&grp=C',   sql: partnerStatsSql('C') },
  { key: 'partner-all', label: 'Partner Stats — All',     url: '/api/players/recalculate?mode=partner_grp&grp=all', sql: partnerStatsSql('all') },
]

const SQL_STATUS_SESSIONS =
`SELECT COUNT(*) AS remaining FROM ts1_sessions
WHERE s1_date IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tse_sessions WHERE se_run_id = s1_run_id);`

const SQL_STATUS_RESULTS =
`SELECT COUNT(*) AS remaining FROM tse_sessions
WHERE NOT EXISTS (SELECT 1 FROM tre_results WHERE re_seid = se_seid);`

const SQL_STATUS_PARTNERS =
`SELECT COUNT(*) AS remaining FROM (
  SELECT DISTINCT s2_plid1, s2_plid2 FROM ts2_results
) t
WHERE NOT EXISTS (
  SELECT 1 FROM tpa_partners WHERE pa_plid1 = t.s2_plid1 AND pa_plid2 = t.s2_plid2
);`

//----------------------------------------------------------------------------------------------
//  n — a number formatted with thousands separators, or an em-dash when undefined
//----------------------------------------------------------------------------------------------
function n(val: number | undefined): string {
  return val === undefined ? '—' : val.toLocaleString()
}

//----------------------------------------------------------------------------------------------
//  formatDuration — milliseconds as "NNNms" (< 1s) or "N.Ns"
//----------------------------------------------------------------------------------------------
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

//----------------------------------------------------------------------------------------------
//  formatElapsed — milliseconds as "M:SS" for the run-in-progress strip
//----------------------------------------------------------------------------------------------
function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

//----------------------------------------------------------------------------------------------
//  formatPipToDate — a pip_to_date value (the run's To-date cap, only on the step-0 row) as
//  "YYYY-MM-DD", or an em-dash when null. The pg driver hands a `date` column back as a Date at
//  *local* midnight, so read local components — .toISOString() (UTC) would shift it a day.
//----------------------------------------------------------------------------------------------
function formatPipToDate(v: string | Date | null): string {
  if (!v) return '—'
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    const date = `${y}-${m}-${d}`
    return date
  }
  const date = String(v).slice(0, 10)
  return date
}


//----------------------------------------------------------------------------------------------
//  formatPipDate — a pip_created timestamp as "YYYY/MM/DD HH:MM:SS" (24-hour, local time),
//  replacing the locale-dependent toLocaleString() format
//----------------------------------------------------------------------------------------------
function formatPipDate(value: string): string {
  const d = new Date(value)
  function pad(num: number): string {
    const padded = String(num).padStart(2, '0')
    return padded
  }
  const formatted = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return formatted
}

//----------------------------------------------------------------------------------------------
//  runStep — POSTs to a pipeline step URL and returns its JSON, throwing on a non-OK response
//----------------------------------------------------------------------------------------------
async function runStep(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: 'POST' })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json
}

//----------------------------------------------------------------------------------------------
//  StatusBadge — a green "Completed" / red "Incomplete" pill, or an em-dash when `complete` is
//  null (unknown)
//----------------------------------------------------------------------------------------------
function StatusBadge({ complete }: { complete: boolean | null }) {
  if (complete === null) return <span className='text-gray-300'>—</span>
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${complete ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
      {complete ? 'Completed' : 'Incomplete'}
    </span>
  )
}

//----------------------------------------------------------------------------------------------
//  JobsTable — the table body for one or more steps, joined against already-fetched `runs`.
//  Pure presentational, no run-id fetching of its own — shared by PipelineJobsSummary (its own
//  self-managed run-id picker) and OverviewSummary (one shared picker for all 3 groups).
//----------------------------------------------------------------------------------------------
function JobsTable({ steps, runs }: { steps: number[]; runs: PipelineStatus[] }) {
  const [playersExpanded, setPlayersExpanded] = useState(false)

  return (
      <table className='w-full text-xs'>
        <thead>
          <tr className='text-left text-gray-400'>
            <th className='font-medium px-2 py-1 text-center'>Step</th>
            <th className='font-medium px-2 py-1'>Job</th>
            <th className='font-medium px-2 py-1'>Last Run</th>
            <th className='font-medium px-2 py-1'>To date</th>
            <th className='font-medium px-2 py-1'>Input Table</th>
            <th className='font-medium px-2 py-1 text-right'>Input Recs</th>
            <th className='font-medium px-2 py-1'>Output Table</th>
            <th className='font-medium px-2 py-1 text-right'>Output Recs</th>
            <th className='font-medium px-2 py-1 text-right'>Duration(s)</th>
            <th className='font-medium px-2 py-1 text-center'>Status</th>
          </tr>
        </thead>
        <tbody>
          {steps.map(step => {
            const subSteps = STEP_SUBSTEPS[step]
            if (!subSteps) {
              const run = runs.find(r => r.pip_step === step && r.pip_sub_step === 'a' && r.pip_sub_sub === null)
              return (
                <tr key={step} className='border-t border-gray-100 font-bold'>
                  <td className='px-2 py-1 text-center text-gray-800'>{step}</td>
                  <td className='px-2 py-1 text-gray-800'>{STEP_LABELS[step]}</td>
                  <td className='px-2 py-1 text-gray-500'>{run ? formatPipDate(run.pip_created) : '—'}</td>
                  <td className='px-2 py-1 text-gray-500'>{run ? formatPipToDate(run.pip_to_date) : '—'}</td>
                  <td className='px-2 py-1 text-gray-500'>{run ? run.pip_input_table : '—'}</td>
                  <td className='px-2 py-1 text-right'>{run ? run.pip_input_recs.toLocaleString() : '—'}</td>
                  <td className='px-2 py-1 text-gray-500'>{run ? run.pip_output_table : '—'}</td>
                  <td className='px-2 py-1 text-right'>{run ? run.pip_output_recs.toLocaleString() : '—'}</td>
                  <td className='px-2 py-1 text-right'>{run ? Math.round(run.pip_duration_ms / 1000).toLocaleString() : '—'}</td>
                  <td className='px-2 py-1 text-center'><StatusBadge complete={run ? true : null} /></td>
                </tr>
              )
            }
            return (
              <Fragment key={step}>
                <tr className='border-t border-gray-100 font-bold'>
                  <td className='px-2 py-1 text-center text-gray-800'>{step}</td>
                  <td className='px-2 py-1 text-gray-800'>{STEP_LABELS[step]}</td>
                  <td className='px-2 py-1' colSpan={8}></td>
                </tr>
                {subSteps.map(sub => {
                  const run = runs.find(r => r.pip_step === step && r.pip_sub_step === sub.subStep && r.pip_sub_sub === null)
                  const isPlayerRow = step === 2 && sub.subStep === 'a'
                  const playerRuns = isPlayerRow
                    ? runs.filter(r => r.pip_step === step && r.pip_sub_step === sub.subStep && r.pip_sub_sub !== null)
                        .sort((a, b) => (a.pip_sub_sub ?? '').localeCompare(b.pip_sub_sub ?? ''))
                    : []
                  return (
                    <Fragment key={sub.subStep}>
                      <tr className='border-t border-gray-50'>
                        <td className='px-2 py-1 text-center text-gray-800'>
                          {isPlayerRow && playerRuns.length > 0 && (
                            <button type='button' onClick={() => setPlayersExpanded(p => !p)}
                              className='text-gray-500 hover:text-gray-700'>
                              {playersExpanded ? '▼' : '▶'}
                            </button>
                          )}
                        </td>
                        <td className='px-2 py-1 pl-4 text-gray-800'>
                          {sub.label}{isPlayerRow && playerRuns.length > 0 ? ` (${playerRuns.length} players)` : ''}
                        </td>
                        <td className='px-2 py-1 text-gray-500'>{run ? formatPipDate(run.pip_created) : '—'}</td>
                        <td className='px-2 py-1 text-gray-500'>{run ? formatPipToDate(run.pip_to_date) : '—'}</td>
                        <td className='px-2 py-1 text-gray-500'>{run ? run.pip_input_table : '—'}</td>
                        <td className='px-2 py-1 text-right'>{run ? run.pip_input_recs.toLocaleString() : '—'}</td>
                        <td className='px-2 py-1 text-gray-500'>{run ? run.pip_output_table : '—'}</td>
                        <td className='px-2 py-1 text-right'>{run ? run.pip_output_recs.toLocaleString() : '—'}</td>
                        <td className='px-2 py-1 text-right'>{run ? Math.round(run.pip_duration_ms / 1000).toLocaleString() : '—'}</td>
                        <td className='px-2 py-1 text-center'><StatusBadge complete={run ? true : null} /></td>
                      </tr>
                      {isPlayerRow && playersExpanded && playerRuns.map(p => (
                        <tr key={p.pip_sub_sub} className='border-t border-gray-50 bg-gray-50'>
                          <td className='px-2 py-1 text-center text-gray-400'></td>
                          <td className='px-2 py-1 pl-8 text-gray-600'>{p.pip_step_name}</td>
                          <td className='px-2 py-1 text-gray-500'>{formatPipDate(p.pip_created)}</td>
                          <td className='px-2 py-1 text-gray-300'>—</td>
                          <td className='px-2 py-1 text-gray-300'>—</td>
                          <td className='px-2 py-1 text-gray-300'>—</td>
                          <td className='px-2 py-1 text-gray-300'>—</td>
                          <td className='px-2 py-1 text-right'>{p.pip_output_recs.toLocaleString()}</td>
                          <td className='px-2 py-1 text-right'>{Math.round(p.pip_duration_ms / 1000).toLocaleString()}</td>
                          <td className='px-2 py-1 text-center'><StatusBadge complete={true} /></td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
  )
}

//----------------------------------------------------------------------------------------------
//  PipelineJobsSummary — self-managed run-id picker (own recentRunIds/selectedRunId/runs state),
//  scoped to just the step(s) this panel covers. Used by the AKBC/Tracked Players/Finish tabs,
//  each with their own independent picker.
//----------------------------------------------------------------------------------------------
function PipelineJobsSummary({ refreshKey, steps }: { refreshKey: number; steps: number[] }) {
  const [recentRunIds, setRecentRunIds] = useState<number[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [runs, setRuns] = useState<PipelineStatus[]>([])
  const [runsLoading, setRunsLoading] = useState(false)

  useEffect(() => { doRefreshRuns() }, [refreshKey])

  //----------------------------------------------------------------------------------------------
  //  loadRunStatus — replaces `runs` with getPipelineRunStatus for one run_id
  //----------------------------------------------------------------------------------------------
  async function loadRunStatus(runId: number) {
    setRuns(await getPipelineRunStatus(runId))
  }

  //----------------------------------------------------------------------------------------------
  //  doRefreshRuns — reloads the recent-run_id list; shows the newest run if one just appeared,
  //  otherwise keeps the current selection (or falls back to the newest), then loads its rows
  //----------------------------------------------------------------------------------------------
  async function doRefreshRuns() {
    setRunsLoading(true)
    const ids = await getRecentRunIds()
    const isNewRun = ids[0] !== undefined && !recentRunIds.includes(ids[0])
    setRecentRunIds(ids)
    const stillPresent = selectedRunId !== null && ids.includes(selectedRunId)
    const idToShow = isNewRun ? ids[0] : (stillPresent ? selectedRunId : (ids[0] ?? null))
    setSelectedRunId(idToShow)
    if (idToShow !== null) await loadRunStatus(idToShow)
    setRunsLoading(false)
  }

  //----------------------------------------------------------------------------------------------
  //  handleSelectRunId — selects a run_id from the picker and loads its rows
  //----------------------------------------------------------------------------------------------
  async function handleSelectRunId(runId: number) {
    setSelectedRunId(runId)
    setRunsLoading(true)
    await loadRunStatus(runId)
    setRunsLoading(false)
  }

  if (recentRunIds.length === 0) return null

  return (
    <MyBox>
      <div className='flex items-center gap-2 mb-2'>
        <h3 className='text-xs font-bold'>Summary</h3>
        <MySelect
          options={recentRunIds.map(String)}
          value={selectedRunId != null ? String(selectedRunId) : ''}
          onChange={e => handleSelectRunId(parseInt(e.target.value, 10))}
          overrideClass='w-20'
        />
        <MyButton onClick={doRefreshRuns} disabled={runsLoading}
          overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>
          {runsLoading ? '…' : '↻'}
        </MyButton>
      </div>
      <JobsTable steps={steps} runs={runs} />
    </MyBox>
  )
}

//----------------------------------------------------------------------------------------------
//  OverviewSummary — one shared run-id picker and one combined table covering all 4 steps
//  (AKBC/Tracked Players/Finish), fetched once via getPipelineRunStatus (already returns every
//  step for the selected run_id in one query).
//----------------------------------------------------------------------------------------------
function OverviewSummary({ refreshKey }: { refreshKey: number }) {
  const [recentRunIds, setRecentRunIds] = useState<number[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [runs, setRuns] = useState<PipelineStatus[]>([])
  const [runsLoading, setRunsLoading] = useState(false)

  useEffect(() => { doRefreshRuns() }, [refreshKey])

  //----------------------------------------------------------------------------------------------
  //  loadRunStatus — replaces `runs` with getPipelineRunStatus for one run_id
  //----------------------------------------------------------------------------------------------
  async function loadRunStatus(runId: number) {
    setRuns(await getPipelineRunStatus(runId))
  }

  //----------------------------------------------------------------------------------------------
  //  doRefreshRuns — reloads the recent-run_id list; shows the newest run if one just appeared,
  //  otherwise keeps the current selection (or falls back to the newest), then loads its rows
  //----------------------------------------------------------------------------------------------
  async function doRefreshRuns() {
    setRunsLoading(true)
    const ids = await getRecentRunIds()
    const isNewRun = ids[0] !== undefined && !recentRunIds.includes(ids[0])
    setRecentRunIds(ids)
    const stillPresent = selectedRunId !== null && ids.includes(selectedRunId)
    const idToShow = isNewRun ? ids[0] : (stillPresent ? selectedRunId : (ids[0] ?? null))
    setSelectedRunId(idToShow)
    if (idToShow !== null) await loadRunStatus(idToShow)
    setRunsLoading(false)
  }

  //----------------------------------------------------------------------------------------------
  //  handleSelectRunId — selects a run_id from the picker and loads its rows
  //----------------------------------------------------------------------------------------------
  async function handleSelectRunId(runId: number) {
    setSelectedRunId(runId)
    setRunsLoading(true)
    await loadRunStatus(runId)
    setRunsLoading(false)
  }

  if (recentRunIds.length === 0) return null

  return (
    <>
      <div className='flex items-center gap-2'>
        <MySelect
          options={recentRunIds.map(String)}
          value={selectedRunId != null ? String(selectedRunId) : ''}
          onChange={e => handleSelectRunId(parseInt(e.target.value, 10))}
          overrideClass='w-20'
        />
        <MyButton onClick={doRefreshRuns} disabled={runsLoading}
          overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>
          {runsLoading ? '…' : '↻'}
        </MyButton>
      </div>

      <JobsTable steps={[0, 1, 2, 3, 4]} runs={runs} />
    </>
  )
}

export default function PipelineTable() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [refreshKey, setRefreshKey] = useState(0)
  const [results, setResults] = useState<Record<string, StepResult>>({})
  const [running, setRunning] = useState<string | null>(null)
  const [runningAll, setRunningAll] = useState<'akbc' | 'tracked' | 'finish' | null>(null)

  const [sessionsStatus, setSessionsStatus] = useState<StepStatus | null>(null)
  const [resultsStatus,  setResultsStatus]  = useState<StepStatus | null>(null)
  const [partnersStatus, setPartnersStatus] = useState<StepStatus | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [resultsLoading,  setResultsLoading]  = useState(false)
  const [partnersLoading, setPartnersLoading] = useState(false)
  const [refreshAllLoading, setRefreshAllLoading] = useState(false)

  //
  //  pipelineToDate — one shared "process nothing past this date" cap for the whole page,
  //  rendered above the tab bar and threaded into every scrape/build action on every tab as
  //  ?to_date=. Opt-in — empty means "up to today", as before. scrapeFromDate stays
  //  AKBC-only (winds the discovery start point back for historical reprocessing).
  //
  const [scrapeFromDate, setScrapeFromDate] = useState('')
  const [pipelineToDate, setPipelineToDate] = useState('')

  //
  //  Overview "Run All Cron" soft-limit overrides, entered in seconds, sent as
  //  ?time_budget_ms= / ?fetch_timeout_ms= (× 1000). Seeded from the constants so the
  //  current defaults are visible; clearing a field falls back to the constant.
  //
  const [cronTimeBudgetSec,   setCronTimeBudgetSec]   = useState(String(SCRAPE_TIME_BUDGET_MS / 1000))
  const [cronFetchTimeoutSec, setCronFetchTimeoutSec] = useState(String(FETCH_TIMEOUT_MS / 1000))

  //
  //  "Run in progress" strip state — the coarse pipeline steps only log when their function
  //  finishes, so during a long AKBC scrape the Jobs summary sits on "step 0 only". These
  //  give visible movement: elapsed time from fullCronStartedAt + live staging row counts.
  //
  const [fullCronStartedAt, setFullCronStartedAt] = useState<number | null>(null)
  const [stagingCounts,     setStagingCounts]     = useState<StagingCounts | null>(null)

  useEffect(() => { doRefreshAll() }, [])

  //
  //  While a full "Run All Cron" request is in flight, poll on a timer:
  //  /api/cron/update-sessions is one long request with no intermediate state, so bump
  //  refreshKey (OverviewSummary picks up the new run_id once Start Run has logged, then
  //  each step as it completes) and reload the staging counts for the progress strip. The
  //  end-of-run refresh is handled by run()'s finally block.
  //
  useEffect(() => {
    if (running !== 'full-cron') {
      setStagingCounts(null)
      return
    }
    async function poll() {
      setRefreshKey(k => k + 1)
      setStagingCounts(await getStagingCounts())
    }
    poll()
    const timer = setInterval(poll, PIPELINE_RUN_POLL_MS)
    return () => clearInterval(timer)
  }, [running])

  //----------------------------------------------------------------------------------------------
  //  doRefreshSessions / doRefreshResults / doRefreshPartners — reload one step's "remaining"
  //  status count
  //----------------------------------------------------------------------------------------------
  async function doRefreshSessions() { setSessionsLoading(true); setSessionsStatus(await refreshSessionsStatus()); setSessionsLoading(false) }
  async function doRefreshResults()  { setResultsLoading(true);  setResultsStatus(await refreshResultsStatus());   setResultsLoading(false) }
  async function doRefreshPartners() { setPartnersLoading(true); setPartnersStatus(await refreshPartnersStatus()); setPartnersLoading(false) }

  //----------------------------------------------------------------------------------------------
  //  doRefreshAll — reloads all three status counts and the auto scrape "From" date in parallel,
  //  seeding the AKBC "From" input (only while still empty) for the catch-up workflow
  //----------------------------------------------------------------------------------------------
  async function doRefreshAll() {
    setRefreshAllLoading(true)
    setSessionsLoading(true); setResultsLoading(true); setPartnersLoading(true)
    const [rSessions, rResults, rPartners, rFromDate] = await Promise.all([
      refreshSessionsStatus(), refreshResultsStatus(), refreshPartnersStatus(), getScrapeFromDate(),
    ])
    setSessionsStatus(rSessions); setResultsStatus(rResults); setPartnersStatus(rPartners)
    //
    //  Default the AKBC "From" to the automatic MAX(se_date). Only when empty, so this
    //  never clobbers a date you're actively overriding on a later refresh — e.g. winding
    //  "From" backwards to reprocess a historical backlog once tracked-player sessions
    //  have pushed the automatic value forward. The shared To-date is left empty (opt-in).
    //
    setScrapeFromDate(prev => prev || (rFromDate ?? ''))
    setSessionsLoading(false); setResultsLoading(false); setPartnersLoading(false)
    setRefreshAllLoading(false)
  }

  //----------------------------------------------------------------------------------------------
  //  run — POSTs one step URL via runStep, stores its result/error under `key`, then runs
  //  afterRefresh and bumps refreshKey so the Jobs summary reloads. Returns the step's data
  //----------------------------------------------------------------------------------------------
  async function run(key: string, url: string, afterRefresh: () => Promise<void>): Promise<Record<string, unknown> | null> {
    setRunning(key)
    let data: Record<string, unknown> | null = null
    try {
      data = await runStep(url)
      setResults(prev => ({ ...prev, [key]: { data, error: null } }))
    } catch (err) {
      setResults(prev => ({ ...prev, [key]: { data: null, error: String(err) } }))
    } finally {
      setRunning(null)
      await afterRefresh()
      setRefreshKey(k => k + 1)
    }
    return data
  }

  //----------------------------------------------------------------------------------------------
  //  handleScrapeClub — runs the AKBC scrape step, passing the AKBC "From" input and the shared
  //  pipelineToDate as query params when set
  //----------------------------------------------------------------------------------------------
  function handleScrapeClub() {
    const params = new URLSearchParams()
    if (scrapeFromDate) params.set('from_date', scrapeFromDate)
    if (pipelineToDate) params.set('to_date',   pipelineToDate)
    const query = params.toString()
    const url = query ? `/api/build/scrape?${query}` : '/api/build/scrape'
    return run('scrape-club', url, async () => {})
  }

  //----------------------------------------------------------------------------------------------
  //  clubDateParams — the ?group=akbc[&from_date&to_date] query string for the AKBC build
  //  steps, taken from the passed scrape result or the last stored one
  //----------------------------------------------------------------------------------------------
  function clubDateParams(clubData?: Record<string, unknown> | null): string {
    const data = clubData ?? results['scrape-club']?.data ?? null
    if (data && data.from_date && data.to_date) return `?group=akbc&from_date=${data.from_date}&to_date=${data.to_date}`
    return '?group=akbc'
  }

  //----------------------------------------------------------------------------------------------
  //  handleSessionsClub / handleResultsClub — run the AKBC Build Sessions / Build Results steps,
  //  scoped to the AKBC scrape's date range
  //----------------------------------------------------------------------------------------------
  function handleSessionsClub(clubData?: Record<string, unknown> | null) {
    return run('sessions-club', `/api/build/sessions-nzb${clubDateParams(clubData)}`, doRefreshSessions)
  }
  function handleResultsClub(clubData?: Record<string, unknown> | null) {
    return run('results-club', `/api/build/results-nzb${clubDateParams(clubData)}`, doRefreshResults)
  }

  //----------------------------------------------------------------------------------------------
  //  handleScrapeTracked / handleSessionsTracked / handleResultsTracked — run the three
  //  tracked-player pipeline steps, each passing the shared pipelineToDate as ?to_date= when set
  //----------------------------------------------------------------------------------------------
  function handleScrapeTracked() {
    const url = pipelineToDate ? `/api/build/scrape-tracked?to_date=${pipelineToDate}` : '/api/build/scrape-tracked'
    return run('scrape-tracked', url, async () => {})
  }
  function handleSessionsTracked() {
    const url = pipelineToDate ? `/api/build/sessions-nzb?group=tracked&to_date=${pipelineToDate}` : '/api/build/sessions-nzb?group=tracked'
    return run('sessions-tracked', url, doRefreshSessions)
  }
  function handleResultsTracked() {
    const url = pipelineToDate ? `/api/build/results-nzb?group=tracked&to_date=${pipelineToDate}` : '/api/build/results-nzb?group=tracked'
    return run('results-tracked', url, doRefreshResults)
  }

  //----------------------------------------------------------------------------------------------
  //  handleStartRun — creates a new pipeline run_id (+ step-0 marker row) via /api/build/start-run,
  //  recording the shared To-date on that step-0 row when set
  //----------------------------------------------------------------------------------------------
  function handleStartRun() {
    const url = pipelineToDate ? `/api/build/start-run?to_date=${pipelineToDate}` : '/api/build/start-run'
    return run('start-run', url, async () => {})
  }

  //----------------------------------------------------------------------------------------------
  //  handlePartners / handleRunFullCron — run the Build Partners step / the whole cron pipeline
  //----------------------------------------------------------------------------------------------
  function handlePartners()    { return run('partners', '/api/build/partners', doRefreshPartners) }

  //----------------------------------------------------------------------------------------------
  //  handleRunFullCron — runs the whole cron pipeline, passing the Overview overrides
  //  (to_date cap, soft time budget, per-fetch timeout) as query params when set
  //----------------------------------------------------------------------------------------------
  function handleRunFullCron() {
    const params = new URLSearchParams()
    if (pipelineToDate)      params.set('to_date', pipelineToDate)
    if (cronTimeBudgetSec)   params.set('time_budget_ms',   String(Number(cronTimeBudgetSec) * 1000))
    if (cronFetchTimeoutSec) params.set('fetch_timeout_ms', String(Number(cronFetchTimeoutSec) * 1000))
    const query = params.toString()
    const url = query ? `/api/cron/update-sessions?${query}` : '/api/cron/update-sessions'
    setFullCronStartedAt(Date.now())
    return run('full-cron', url, async () => {})
  }

  //----------------------------------------------------------------------------------------------
  //  handleStats — runs the Update Stats step, then fans its per-group counts out into the
  //  matching STATS_SUB_ROWS result cells
  //----------------------------------------------------------------------------------------------
  async function handleStats() {
    const data = await run('stats', '/api/build/stats', async () => {})
    const groups = data?.groups as Record<string, number> | undefined
    if (groups) {
      setResults(prev => {
        const next = { ...prev }
        for (const row of STATS_SUB_ROWS) {
          const updated = groups[row.key]
          if (updated !== undefined) next[row.key] = { data: { updated }, error: null }
        }
        return next
      })
    }
    return data
  }

  //----------------------------------------------------------------------------------------------
  //  runAllAkbc / runAllTracked / runFinishPipeline — the per-tab "Run All" sequencers, each
  //  running its tab's steps in order
  //----------------------------------------------------------------------------------------------
  async function runAllAkbc() {
    setRunningAll('akbc')
    await handleStartRun()
    const clubData = await handleScrapeClub()
    await handleSessionsClub(clubData)
    await handleResultsClub(clubData)
    setRunningAll(null)
  }

  async function runAllTracked() {
    setRunningAll('tracked')
    await handleScrapeTracked()
    await handleSessionsTracked()
    await handleResultsTracked()
    setRunningAll(null)
  }

  async function runFinishPipeline() {
    setRunningAll('finish')
    await handlePartners()
    await handleStats()
    setRunningAll(null)
  }

  const anyRunning = running !== null || runningAll !== null

  return (
    <div className='space-y-4 relative'>
      <div className='flex items-center gap-1'>
        <span className='text-xs text-gray-500'>To date (caps every step, all tabs):</span>
        <MyInput type='date' value={pipelineToDate} onChange={e => setPipelineToDate(e.target.value)}
          overrideClass='rounded border border-gray-300 px-1 py-0.5 text-xs h-auto md:h-auto' />
        {pipelineToDate && (
          <button type='button' onClick={() => setPipelineToDate('')}
            className='text-xs text-blue-600 hover:text-blue-800 ml-1'>clear</button>
        )}
      </div>
      <div className='flex gap-0 border-b border-gray-200'>
        {TABS.map(t => (
          <MyTab key={t.id} active={activeTab === t.id} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </MyTab>
        ))}
      </div>

      {activeTab === 'overview' && (
      <>
      <div className='flex items-center gap-2'>
        <MyButton onClick={handleStartRun} disabled={anyRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium ${running === 'start-run' ? 'bg-red-700 hover:bg-red-700 animate-pulse' : 'bg-red-500 hover:bg-red-600'}`}>
          {running === 'start-run' ? 'Running…' : 'Start Run'}
        </MyButton>
        <MyButton onClick={handleRunFullCron} disabled={anyRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium ${running === 'full-cron' ? 'bg-red-700 hover:bg-red-700 animate-pulse' : 'bg-red-500 hover:bg-red-600'}`}>
          {running === 'full-cron' ? 'Running…' : 'Run All Cron'}
        </MyButton>
        {results['start-run']?.error && <p className='text-xs text-red-600'>{results['start-run'].error}</p>}
        {results['full-cron']?.error && <p className='text-xs text-red-600'>{results['full-cron'].error}</p>}
      </div>
      <div className='flex items-center gap-4'>
        <div className='flex items-center gap-1'>
          <span className='text-xs text-gray-500'>Time budget (s):</span>
          <MyInput type='number' value={cronTimeBudgetSec} onChange={e => setCronTimeBudgetSec(e.target.value)}
            overrideClass='rounded border border-gray-300 px-1 py-0.5 text-xs h-auto md:h-auto w-20' />
        </div>
        <div className='flex items-center gap-1'>
          <span className='text-xs text-gray-500'>Fetch timeout (s):</span>
          <MyInput type='number' value={cronFetchTimeoutSec} onChange={e => setCronFetchTimeoutSec(e.target.value)}
            overrideClass='rounded border border-gray-300 px-1 py-0.5 text-xs h-auto md:h-auto w-20' />
        </div>
      </div>
      {running === 'full-cron' && (
        <div className='flex items-center gap-3 text-xs text-gray-600'>
          <span className='animate-pulse font-medium'>Run in progress</span>
          {fullCronStartedAt !== null && <span>elapsed {formatElapsed(Date.now() - fullCronStartedAt)}</span>}
          {stagingCounts && <span>ts1_sessions {stagingCounts.ts1_sessions.toLocaleString()}</span>}
          {stagingCounts && <span>ts2_results {stagingCounts.ts2_results.toLocaleString()}</span>}
        </div>
      )}
      <OverviewSummary refreshKey={refreshKey} />
      </>
      )}

      {activeTab === 'akbc' && (
      <>
      <PipelineJobsSummary refreshKey={refreshKey} steps={[1]} />

      <MyBox>
        <div className='flex items-center gap-4 mb-2'>
          <h3 className='text-xs font-bold'>Pipeline</h3>
          <div className='flex items-center gap-1'>
            <span className='text-xs text-gray-500'>From:</span>
            <MyInput type='date' value={scrapeFromDate} onChange={e => setScrapeFromDate(e.target.value)}
              overrideClass='rounded border border-gray-300 px-1 py-0.5 text-xs h-auto md:h-auto' />
          </div>
          <span className='text-xs text-gray-400'>To: the shared "To date" above</span>
        </div>
        <table className='w-full text-xs'>
          <thead>
            <tr className='text-left text-gray-400'>
              <th className='font-medium py-1 pr-2'>Step</th>
              <th className='font-medium py-1 pr-2'>Description</th>
              <th className='font-medium py-1 pr-2'>Help</th>
              <th className='font-medium py-1 pr-2'>Processed</th>
              <th className='font-medium py-1 pr-2'>SQL</th>
              <th className='font-medium py-1 pr-2'>
                <MyButton onClick={doRefreshAll} disabled={refreshAllLoading} overrideClass='h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium'>
                  {refreshAllLoading ? 'Refreshing…' : 'Refresh'}
                </MyButton>
              </th>
              <th className='font-medium py-1 pr-2'>Remaining</th>
              <th className='font-medium py-1 pr-2'>Status</th>
              <th className='font-medium py-1 pr-2'>Result</th>
              <th className='font-medium py-1'>
                <MyButton onClick={runAllAkbc} disabled={anyRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium ${runningAll === 'akbc' ? 'bg-red-700 hover:bg-red-700 animate-pulse' : 'bg-red-500 hover:bg-red-600'}`}>
                  {runningAll === 'akbc' ? 'Running…' : 'Run All'}
                </MyButton>
              </th>
            </tr>
          </thead>
          <tbody>

            {/* 1a — Scrape AKBC */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>1a.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Scrape AKBC</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='1a. Scrape AKBC'
                  input={[`nzbridge.co.nz — club results search (club ${BRIDGE_CLUB_ID}) for each day from the last built session date to today (or the To date, if set)`]}
                  processing="Truncates ts1_sessions and ts2_results (start of a new coordinated run), then finds every AKBC run_id not yet in tse_sessions or ts1_sessions via the club-by-date search. For each missing run_id, fetches its results page and writes the session header to ts1_sessions and each pair's score to ts2_results, creating any new player by name as needed."
                  output={[
                    'ts1_sessions — one row per discovered session: date, club, event name, score type, tournament code',
                    'ts2_results — one row per pair per session: raw score',
                    'tpl_players — new player rows created on demand',
                  ]}
                  consumers={[
                    'Step 1b Build Sessions — ts1_sessions → tse_sessions',
                    'Step 1c Build Results — ts2_results → tre_results',
                  ]}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>
                {results['scrape-club']?.data && (
                  <span>{n(results['scrape-club'].data.run_ids_new as number)} sessions, {n(results['scrape-club'].data.pairs_total as number)} pairs</span>
                )}
              </td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2'>
                {results['scrape-club']?.error && <p className='text-xs text-red-600'>{results['scrape-club'].error}</p>}
              </td>
              <td className='py-1'>
                <MyButton onClick={() => handleScrapeClub()} disabled={anyRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${running === 'scrape-club' ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {running === 'scrape-club' ? 'Running...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* 1b — Build Sessions (AKBC batch) */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>1b.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Build Sessions — AKBC batch</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='1b. Build Sessions — AKBC batch'
                  input={['ts1_sessions — rows with a date, not yet in tse_sessions, filtered to the AKBC scrape\'s date range']}
                  processing='Inserts one tse_sessions row per ts1_sessions row (skipped if already present), deriving day-of-week from the date, MP/VP scoring type from the score type, and translating a couple of club name variants. Scoped to the same from/to date range as the preceding Scrape AKBC step — an explicit safeguard.'
                  output={['tse_sessions — one row per session']}
                  consumers={[
                    'Step 1c Build Results — joins tse_sessions for date/scoring context',
                    'Home/Rankings pages — session listings',
                  ]}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>
                {results['sessions-club']?.data && <span>{n(results['sessions-club'].data.inserted as number)} inserted, {n(results['sessions-club'].data.skipped as number)} skipped</span>}
              </td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_SESSIONS} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshSessions} disabled={sessionsLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{sessionsLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(sessionsStatus?.remaining)}</strong></td>
              <td className='py-1 pr-2'><StatusBadge complete={sessionsStatus === null ? null : sessionsStatus.remaining === 0} /></td>
              <td className='py-1 pr-2'>
                {results['sessions-club']?.error && <p className='text-xs text-red-600'>{results['sessions-club'].error}</p>}
              </td>
              <td className='py-1'>
                <MyButton onClick={() => handleSessionsClub()} disabled={anyRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${running === 'sessions-club' ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {running === 'sessions-club' ? 'Running...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* 1c — Build Results (AKBC batch) */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>1c.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Build Results — AKBC batch</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='1c. Build Results — AKBC batch'
                  input={['ts2_results joined to tse_sessions/ts1_sessions — sessions not yet in tre_results, filtered to the AKBC scrape\'s date range']}
                  processing='Upserts tpa_partners for any new player pair, then inserts one tre_results row per session per partnership — percentage clamped to 25–75 for MP sessions, VP capped at 999 for VP sessions. Scoped to the same from/to date range as the preceding Scrape AKBC step.'
                  output={[
                    'tpa_partners — new partnership rows',
                    'tre_results — one row per player pair per session',
                  ]}
                  consumers={[
                    'Step 3 Build Partners — status count reads tpa_partners',
                    'Step 4 Update Stats — aggregates from tre_results',
                    'Player/session detail pages',
                  ]}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>
                {results['results-club']?.data && <span>{n(results['results-club'].data.inserted as number)} inserted</span>}
              </td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_RESULTS} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshResults} disabled={resultsLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{resultsLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(resultsStatus?.remaining)}</strong></td>
              <td className='py-1 pr-2'><StatusBadge complete={resultsStatus === null ? null : resultsStatus.remaining === 0} /></td>
              <td className='py-1 pr-2'>
                {results['results-club']?.error && <p className='text-xs text-red-600'>{results['results-club'].error}</p>}
              </td>
              <td className='py-1'>
                <MyButton onClick={() => handleResultsClub()} disabled={anyRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${running === 'results-club' ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {running === 'results-club' ? 'Running...' : 'Run'}
                </MyButton>
              </td>
            </tr>

          </tbody>
        </table>
      </MyBox>
      </>
      )}

      {activeTab === 'tracked' && (
      <>
      <PipelineJobsSummary refreshKey={refreshKey} steps={[2]} />

      <MyBox>
        <div className='flex items-center gap-4 mb-2'>
          <h3 className='text-xs font-bold'>Pipeline</h3>
        </div>
        <table className='w-full text-xs'>
          <thead>
            <tr className='text-left text-gray-400'>
              <th className='font-medium py-1 pr-2'>Step</th>
              <th className='font-medium py-1 pr-2'>Description</th>
              <th className='font-medium py-1 pr-2'>Help</th>
              <th className='font-medium py-1 pr-2'>Processed</th>
              <th className='font-medium py-1 pr-2'>SQL</th>
              <th className='font-medium py-1 pr-2'>
                <MyButton onClick={doRefreshAll} disabled={refreshAllLoading} overrideClass='h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium'>
                  {refreshAllLoading ? 'Refreshing…' : 'Refresh'}
                </MyButton>
              </th>
              <th className='font-medium py-1 pr-2'>Remaining</th>
              <th className='font-medium py-1 pr-2'>Status</th>
              <th className='font-medium py-1 pr-2'>Result</th>
              <th className='font-medium py-1'>
                <MyButton onClick={runAllTracked} disabled={anyRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium ${runningAll === 'tracked' ? 'bg-red-700 hover:bg-red-700 animate-pulse' : 'bg-red-500 hover:bg-red-600'}`}>
                  {runningAll === 'tracked' ? 'Running…' : 'Run All'}
                </MyButton>
              </th>
            </tr>
          </thead>
          <tbody>

            {/* 2a — Scrape Tracked Players */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>2a.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Scrape Tracked Players</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='2a. Scrape Tracked Players'
                  input={["nzbridge.co.nz — each tracked player's full online-points history (no date range — NZB returns everything)"]}
                  processing="For each flagged player (pl_tracked = TRUE), fetches their full match history and finds every run_id not already in tse_sessions or ts1_sessions — so a session already built (e.g. by Scrape AKBC + Build Sessions, if that ran first) or already scraped in a previous run is never re-fetched, however many tracked players share it. Does not truncate ts1_sessions/ts2_results — adds to whatever's already staged. Writes exactly like Scrape AKBC otherwise."
                  output={[
                    'ts1_sessions — one row per newly-discovered session',
                    'ts2_results — one row per pair per session',
                    'tpl_players — new player rows created on demand',
                  ]}
                  consumers={[
                    'Step 2b Build Sessions — ts1_sessions → tse_sessions',
                    'Step 2c Build Results — ts2_results → tre_results',
                  ]}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>
                {results['scrape-tracked']?.data && (
                  <span>{n(results['scrape-tracked'].data.run_ids_new as number)} sessions, {n(results['scrape-tracked'].data.pairs_total as number)} pairs</span>
                )}
              </td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2'>
                {results['scrape-tracked']?.error && <p className='text-xs text-red-600'>{results['scrape-tracked'].error}</p>}
              </td>
              <td className='py-1'>
                <MyButton onClick={() => handleScrapeTracked()} disabled={anyRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${running === 'scrape-tracked' ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {running === 'scrape-tracked' ? 'Running...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* 2b — Build Sessions (Tracked batch) */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>2b.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Build Sessions — Tracked batch</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='2b. Build Sessions — Tracked batch'
                  input={['ts1_sessions — rows with a date, not yet in tse_sessions (unfiltered — tracked players aren\'t date-bound)']}
                  processing='Same as the AKBC batch, but with no date filter — processes whatever is currently in ts1_sessions left over from Scrape Tracked Players.'
                  output={['tse_sessions — one row per session']}
                  consumers={[
                    'Step 2c Build Results — joins tse_sessions for date/scoring context',
                    'Home/Rankings pages — session listings',
                  ]}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>
                {results['sessions-tracked']?.data && <span>{n(results['sessions-tracked'].data.inserted as number)} inserted, {n(results['sessions-tracked'].data.skipped as number)} skipped</span>}
              </td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2'>
                {results['sessions-tracked']?.error && <p className='text-xs text-red-600'>{results['sessions-tracked'].error}</p>}
              </td>
              <td className='py-1'>
                <MyButton onClick={() => handleSessionsTracked()} disabled={anyRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${running === 'sessions-tracked' ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {running === 'sessions-tracked' ? 'Running...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* 2c — Build Results (Tracked batch) */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>2c.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Build Results — Tracked batch</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='2c. Build Results — Tracked batch'
                  input={['ts2_results joined to tse_sessions/ts1_sessions — sessions not yet in tre_results (unfiltered)']}
                  processing='Same as the AKBC batch, but with no date filter.'
                  output={[
                    'tpa_partners — new partnership rows',
                    'tre_results — one row per player pair per session',
                  ]}
                  consumers={[
                    'Step 3 Build Partners — status count reads tpa_partners',
                    'Step 4 Update Stats — aggregates from tre_results',
                    'Player/session detail pages',
                  ]}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>
                {results['results-tracked']?.data && <span>{n(results['results-tracked'].data.inserted as number)} inserted</span>}
              </td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2'>
                {results['results-tracked']?.error && <p className='text-xs text-red-600'>{results['results-tracked'].error}</p>}
              </td>
              <td className='py-1'>
                <MyButton onClick={() => handleResultsTracked()} disabled={anyRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${running === 'results-tracked' ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {running === 'results-tracked' ? 'Running...' : 'Run'}
                </MyButton>
              </td>
            </tr>

          </tbody>
        </table>
      </MyBox>
      </>
      )}

      {activeTab === 'finish' && (
      <>
      <PipelineJobsSummary refreshKey={refreshKey} steps={[3, 4]} />

      <MyBox>
        <div className='flex items-center gap-4 mb-2'>
          <h3 className='text-xs font-bold'>Pipeline</h3>
        </div>
        <table className='w-full text-xs'>
          <thead>
            <tr className='text-left text-gray-400'>
              <th className='font-medium py-1 pr-2'>Step</th>
              <th className='font-medium py-1 pr-2'>Description</th>
              <th className='font-medium py-1 pr-2'>Help</th>
              <th className='font-medium py-1 pr-2'>Processed</th>
              <th className='font-medium py-1 pr-2'>SQL</th>
              <th className='font-medium py-1 pr-2'>
                <MyButton onClick={doRefreshAll} disabled={refreshAllLoading} overrideClass='h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium'>
                  {refreshAllLoading ? 'Refreshing…' : 'Refresh'}
                </MyButton>
              </th>
              <th className='font-medium py-1 pr-2'>Remaining</th>
              <th className='font-medium py-1 pr-2'>Status</th>
              <th className='font-medium py-1 pr-2'>Result</th>
              <th className='font-medium py-1'>
                <MyButton onClick={runFinishPipeline} disabled={anyRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium ${runningAll === 'finish' ? 'bg-red-700 hover:bg-red-700 animate-pulse' : 'bg-red-500 hover:bg-red-600'}`}>
                  {runningAll === 'finish' ? 'Running…' : 'Run All'}
                </MyButton>
              </th>
            </tr>
          </thead>
          <tbody>

            {/* Step 3 — Build Partners */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>3.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Build Partners</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='3. Build Partners'
                  input={['tpa_partners']}
                  processing='Status-only — counts the current tpa_partners row total. The actual partnership upsert already happens inside Build Results; this step does not insert anything itself.'
                  output={['(none — read-only status check)']}
                  consumers={['Informational only — no downstream writer depends on this step running']}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>
                {results.partners?.data && <span>{n(results.partners.data.pairs as number)} pairs</span>}
              </td>
              <td className='py-1 pr-2'><MyHelp label='SQL' text={SQL_STATUS_PARTNERS} /></td>
              <td className='py-1 pr-2'>
                <MyButton onClick={doRefreshPartners} disabled={partnersLoading} overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{partnersLoading ? '…' : '↻'}</MyButton>
              </td>
              <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{n(partnersStatus?.remaining)}</strong></td>
              <td className='py-1 pr-2'><StatusBadge complete={partnersStatus === null ? null : partnersStatus.remaining === 0} /></td>
              <td className='py-1 pr-2'>
                {results.partners?.error && <p className='text-xs text-red-600'>{results.partners.error}</p>}
              </td>
              <td className='py-1'>
                <MyButton onClick={handlePartners} disabled={anyRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${running === 'partners' ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {running === 'partners' ? 'Running...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* Step 4 — Update Stats (no Remaining/Status — full rebuild every run) */}
            <tr className='border-t border-gray-100'>
              <td className='py-1 pr-2 text-xs font-bold'>4.</td>
              <td className='py-1 pr-2 text-xs font-bold'>Update Stats</td>
              <td className='py-1 pr-2'>
                <MyHelpStep
                  title='4. Update Stats'
                  input={['tre_results joined to tse_sessions/tpa_partners']}
                  processing="Upserts ta1_player_stats and ta2_partner_stats (no truncate — each group can be re-run independently), recomputing MP/VP session counts, averages and standard deviations per player and per partnership, for each tournament group (A/B/C, derived from the last character of se_tournament) plus a combined 'all' group — 8 upserts total, each logged as its own sub-step (see Pipeline Jobs above) with its own Input Recs (tre_results rows matched) and Output Recs (rows upserted). Full recompute every run, not incremental — there is no incremental backlog to show as a Remaining count."
                  output={[
                    'ta1_player_stats — one row per player per group',
                    'ta2_partner_stats — one row per partnership per group',
                  ]}
                  consumers={[
                    'Player profile page — group stats display',
                    'Rankings page — per-group averages',
                  ]}
                />
              </td>
              <td className='py-1 pr-2 text-gray-600'>
                {results.stats?.data && <span>{n(results.stats.data.player_rows as number)} player rows, {n(results.stats.data.partner_rows as number)} partner rows</span>}
              </td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2 text-gray-300'>—</td>
              <td className='py-1 pr-2'>
                {results.stats?.error && <p className='text-xs text-red-600'>{results.stats.error}</p>}
              </td>
              <td className='py-1'>
                <MyButton onClick={handleStats} disabled={anyRunning} overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${running === 'stats' ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                  {running === 'stats' ? 'Running...' : 'Run'}
                </MyButton>
              </td>
            </tr>

            {/* Step 4 sub-rows — individual group operations (manual corrections) */}
            {STATS_SUB_ROWS.map(row => (
              <tr key={row.key} className='border-t border-gray-50'>
                <td className='py-1 pr-2 text-xs'></td>
                <td className='py-1 pr-2 pl-4 text-xs text-gray-600'>{row.label}</td>
                <td className='py-1 pr-2 text-gray-300'>—</td>
                <td className='py-1 pr-2 text-gray-600'>
                  {results[row.key]?.data && <span>{n(results[row.key].data!.updated as number)} rows</span>}
                </td>
                <td className='py-1 pr-2'><MyHelp label='SQL' text={row.sql} /></td>
                <td className='py-1 pr-2 text-gray-300'>—</td>
                <td className='py-1 pr-2 text-gray-300'>—</td>
                <td className='py-1 pr-2'><StatusBadge complete={results[row.key]?.data ? true : null} /></td>
                <td className='py-1 pr-2'>
                  {results[row.key]?.error && <p className='text-xs text-red-600'>{results[row.key].error}</p>}
                </td>
                <td className='py-1'>
                  <MyButton onClick={() => run(row.key, row.url, async () => {})} disabled={anyRunning}
                    overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none text-xs ${running === row.key ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
                    {running === row.key ? 'Running...' : 'Run'}
                  </MyButton>
                </td>
              </tr>
            ))}

          </tbody>
        </table>
      </MyBox>
      </>
      )}
    </div>
  )
}
