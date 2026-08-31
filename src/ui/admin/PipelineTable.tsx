'use client'

//==============================================================================================
//  1) DESCRIPTION
//    PipelineTable — the /owner/pipeline page. Built from ONE summary component + ONE step-runner
//    and composed per scope, so every tab renders identically:
//      PipelineSummary(steps)  — run-id picker + JobsTable (tpip_pipelinelog), any step range
//      StepTable / StepRow     — the manual per-step Run-button table shell + one row renderer
//      renderPanel(scope)      — PipelineSummary + StepTable for one scope (akbc / tracked / finish)
//    The AKBC / Tracked / Finish tabs are each one renderPanel(); Overview is the Start Run /
//    Run All Cron controls + max-date strip, then the three panels stacked — no bespoke layout.
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
import { getScrapeFromDate, getPipelineMaxDates } from '@/src/lib/actions/pipelineScrape'
import {
  refreshSessionsStatus, refreshResultsStatus, refreshPartnersStatus, getStagingCounts,
  type StepStatus, type StagingCounts
} from '@/src/lib/actions/pipelineStatus'
import { FETCH_TIMEOUT_MS, PIPELINE_RUN_POLL_MS, TOURNAMENT_GROUP_SQL_EXPR, BRIDGE_CLUB_ID } from '@/src/lib/constants'
import vercelConfig from '@/vercel.json'

type StepResult = { data: Record<string, unknown> | null; error: string | null }

//
//  localStorage key the shared To-date is persisted under (owner dev tool, per-browser)
//
const PIPELINE_TO_DATE_STORAGE_KEY = 'pipeline_to_date'

type Tab = 'overview' | 'akbc' | 'tracked' | 'finish'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'akbc',     label: 'AKBC' },
  { id: 'tracked',  label: 'Tracked Players' },
  { id: 'finish',   label: 'Finish' },
]

//
//  Panel-title prefix for each pipeline scope — used by renderScopeSummary / renderScopeSteps to
//  title the collapsible MyBox ("AKBC — Summary", "Finish — Pipeline", …)
//
const SCOPE_LABEL: Record<'akbc' | 'tracked' | 'finish', string> = {
  akbc:    'AKBC',
  tracked: 'Tracked Players',
  finish:  'Finish',
}

//
//  Pipeline steps written to tpip_pipelinelog (one shared run_id per day):
//    0 Start Run       — single marker row (pip_sub_step 'a') from /api/build/start-run
//    1 AKBC            — one row per /api/build/scrape-akbc-day slot; pip_sub_step is the
//                        slot number ('0','1'), pip_step_name = "Scrape AKBC <day>"
//    2 Tracked Players — one row per /api/build/scrape-tracked-batch; pip_sub_step is the
//                        batch number ('0'..'5'), pip_step_name = "Tracked batch <N>", with
//                        per-player child rows (pip_sub_sub '01'..'05', pip_step_name = name)
//    3 Build Partners  — single row (pip_sub_step 'a')
//    4 Player Stats    — pip_sub_step 'a'..'d' (Group A/B/C/All)
//    5 Partner Stats   — pip_sub_step 'a'..'d' (Group A/B/C/All)
//  JobsTable renders these data-driven from whatever rows a run actually has — it only
//  needs the per-step display label and which steps are single-row.
//
const STEP_LABELS: Record<number, string> = {
  0: 'Start Run', 1: 'AKBC', 2: 'Tracked Players', 3: 'Build Partners',
  4: 'Player Stats', 5: 'Partner Stats',
}

//
//  Steps that always log exactly one row (pip_sub_step NULL, pip_sub_sub NULL) — rendered as a
//  single bold line. Every other step logs multiple rows whose set varies per run — keyed by
//  pip_batch (AKBC batches 1/2, tracked batches 1–6) or pip_sub_step (stats groups a–d) — so
//  those render from the data.
//
const SINGLE_ROW_STEPS = new Set<number>([0, 3])

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

//
//  CRON_JOBS — the production cron list, verbatim from vercel.json, in file order (which
//  is also execution order). "Run All Cron" POSTs each `path` in turn so a manual run
//  fires the exact same routes Vercel schedules — no parallel implementation to drift.
//  `key` indexes the per-job result/error in `results`; `label` is the short name shown
//  in the run-in-progress strip.
//
const CRON_JOBS: { path: string; key: string; label: string }[] = vercelConfig.crons.map(c => {
  const [base, query = ''] = c.path.split('?')
  const name = base.replace('/api/build/', '').replace('/api/cron/', '')
  const batch = new URLSearchParams(query).get('batch')
  const suffix = batch ? ` batch ${batch}` : ''
  return { path: c.path, key: `cron:${name}${suffix}`, label: `${name}${suffix}` }
})

//----------------------------------------------------------------------------------------------
//  fillCronParams — takes a vercel.json cron path (which carries empty ?to_date= /
//  ?fetch_timeout_ms= placeholders) and substitutes the Overview field values, but only
//  when a field is non-empty. Empty fields → the path is POSTed exactly as prod fires it.
//----------------------------------------------------------------------------------------------
function fillCronParams(path: string, toDate: string, fetchTimeoutSec: string): string {
  const [base, query = ''] = path.split('?')
  const q = new URLSearchParams(query)
  if (q.has('to_date') && toDate) q.set('to_date', toDate)
  if (q.has('fetch_timeout_ms') && fetchTimeoutSec) q.set('fetch_timeout_ms', String(Number(fetchTimeoutSec) * 1000))
  const qs = q.toString()
  const url = qs ? `${base}?${qs}` : base
  return url
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
//  Pure presentational, no run-id fetching of its own — the body of PipelineSummary, which is
//  the one summary component used by every panel (Overview stacks all three panels).
//  Renders each step data-driven from the run's actual rows — SINGLE_ROW_STEPS as one bold
//  line, the rest as a header plus one row per pip_sub_step present (▶ expands a tracked
//  batch's per-player pip_sub_sub children).
//----------------------------------------------------------------------------------------------
function JobsTable({ steps, runs }: { steps: number[]; runs: PipelineStatus[] }) {
  //
  //  Which multi-sub-step rows are expanded to show their per-player children, keyed
  //  "<step>-<pip_sub_step>" (e.g. "2-0"). Only tracked-batch rows ever have children.
  //
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>({})

  //----------------------------------------------------------------------------------------------
  //  dataCells — the 8 value cells shared by every row shape (bold single-row, sub-step row),
  //  rendered from one PipelineStatus or left as em-dashes when the row hasn't run
  //----------------------------------------------------------------------------------------------
  function dataCells(run: PipelineStatus | undefined) {
    return (
      <>
        <td className='px-2 py-1 text-gray-500'>{run ? formatPipDate(run.pip_created) : '—'}</td>
        <td className='px-2 py-1 text-gray-500'>{run ? formatPipToDate(run.pip_to_date) : '—'}</td>
        <td className='px-2 py-1 text-gray-500'>{run ? run.pip_input_table : '—'}</td>
        <td className='px-2 py-1 text-right'>{run ? run.pip_input_recs.toLocaleString() : '—'}</td>
        <td className='px-2 py-1 text-gray-500'>{run ? run.pip_output_table : '—'}</td>
        <td className='px-2 py-1 text-right'>{run ? run.pip_output_recs.toLocaleString() : '—'}</td>
        <td className='px-2 py-1 text-right'>{run ? Math.round(run.pip_duration_ms / 1000).toLocaleString() : '—'}</td>
        <td className='px-2 py-1 text-center'><StatusBadge complete={run ? true : null} /></td>
      </>
    )
  }

  return (
      <table className='w-full text-xs'>
        <thead>
          <tr className='text-left text-gray-400'>
            <th className='font-medium px-2 py-1 text-center'>Step</th>
            <th className='font-medium px-2 py-1 text-center'>Sub</th>
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
            //
            //  Single-row steps (Start Run, Build Partners): one bold line — no sub_step,
            //  no per-player child. pip_batch is always ≥ 1 now, so it isn't part of the match.
            //
            if (SINGLE_ROW_STEPS.has(step)) {
              const run = runs.find(r => r.pip_step === step && r.pip_sub_step === null && r.pip_sub_sub === null)
              return (
                <tr key={step} className='border-t border-gray-100 font-bold'>
                  <td className='px-2 py-1 text-center text-gray-800'>{step}</td>
                  <td className='px-2 py-1 text-center text-gray-500'>—</td>
                  <td className='px-2 py-1 text-gray-800'>{STEP_LABELS[step]}</td>
                  {dataCells(run)}
                </tr>
              )
            }

            //
            //  Multi-row steps: a bold header, then one row per sub-unit present. Steps 1 & 2 are
            //  keyed by pip_batch (AKBC 1/2, Tracked 1–6, pip_sub_step NULL); steps 4 & 5 by
            //  pip_sub_step (the stats groups a–d, pip_batch always 1). A tracked batch's
            //  per-player pip_sub_sub rows hang off it under a ▶ toggle.
            //
            const subRuns = runs
              .filter(r => r.pip_step === step && r.pip_sub_sub === null)
              .sort((a, b) => a.pip_batch - b.pip_batch || (a.pip_sub_step ?? '').localeCompare(b.pip_sub_step ?? ''))
            return (
              <Fragment key={step}>
                <tr className='border-t border-gray-100 font-bold'>
                  <td className='px-2 py-1 text-center text-gray-800'>{step}</td>
                  <td className='px-2 py-1' colSpan={10}>{STEP_LABELS[step]}</td>
                </tr>
                {subRuns.length === 0 && (
                  <tr className='border-t border-gray-50'>
                    <td className='px-2 py-1'></td>
                    <td className='px-2 py-1 pl-4 text-gray-400' colSpan={10}>— not run —</td>
                  </tr>
                )}
                {subRuns.map(run => {
                  const key = `${step}-${run.pip_batch}-${run.pip_sub_step ?? ''}`
                  const childRuns = runs
                    .filter(r => r.pip_step === step && r.pip_batch === run.pip_batch && r.pip_sub_sub !== null)
                    .sort((a, b) => (a.pip_sub_sub ?? '').localeCompare(b.pip_sub_sub ?? ''))
                  const isOpen = expandedSubs[key] ?? false
                  //
                  //  pip_sub_step (a–d) names the stats groups on steps 4/5; every other
                  //  multi-row step identifies its rows by pip_batch (always ≥ 1) instead.
                  //
                  const subLabel = run.pip_sub_step ?? `batch ${run.pip_batch}`
                  return (
                    <Fragment key={key}>
                      <tr className='border-t border-gray-50'>
                        <td className='px-2 py-1 text-center text-gray-400'>{step}</td>
                        <td className='px-2 py-1 text-center text-gray-700'>
                          {childRuns.length > 0 && (
                            <button type='button' onClick={() => setExpandedSubs(p => ({ ...p, [key]: !isOpen }))}
                              className='text-gray-500 hover:text-gray-700 mr-1'>
                              {isOpen ? '▼' : '▶'}
                            </button>
                          )}
                          {subLabel}
                        </td>
                        <td className='px-2 py-1 pl-4 text-gray-800'>
                          {run.pip_step_name}{childRuns.length > 0 ? ` (${childRuns.length} players)` : ''}
                        </td>
                        {dataCells(run)}
                      </tr>
                      {isOpen && childRuns.map(child => (
                        <tr key={child.pip_sub_sub} className='border-t border-gray-50 bg-gray-50'>
                          <td className='px-2 py-1 text-center text-gray-300'>{step}</td>
                          <td className='px-2 py-1 text-center text-gray-400'>{run.pip_batch}·{child.pip_sub_sub}</td>
                          <td className='px-2 py-1 pl-8 text-gray-600'>{child.pip_step_name}</td>
                          <td className='px-2 py-1 text-gray-500'>{formatPipDate(child.pip_created)}</td>
                          <td className='px-2 py-1 text-gray-300'>—</td>
                          <td className='px-2 py-1 text-gray-300'>—</td>
                          <td className='px-2 py-1 text-gray-300'>—</td>
                          <td className='px-2 py-1 text-gray-300'>—</td>
                          <td className='px-2 py-1 text-right'>{child.pip_output_recs.toLocaleString()}</td>
                          <td className='px-2 py-1 text-right'>{Math.round(child.pip_duration_ms / 1000).toLocaleString()}</td>
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
//  PipelineSummary — the one run-id picker + JobsTable, scoped to `steps`. Used identically by
//  the Overview (steps 0–5) and every per-scope panel (AKBC [1], Tracked [2], Finish [3,4,5]) —
//  there is no second implementation to drift from. Self-manages its own recent-run_id list and
//  selection; re-reads when `refreshKey` bumps. `title` is the collapsible MyBox heading.
//----------------------------------------------------------------------------------------------
function PipelineSummary({ title, refreshKey, steps }: { title: string; refreshKey: number; steps: number[] }) {
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
    <MyBox title={title} collapsible>
      <div className='flex items-center gap-2 mb-2'>
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
//  dashCell — the "no value here" table cell used by StepRow for every column a given step
//  doesn't populate. One definition so the em-dash styling can't drift between rows.
//----------------------------------------------------------------------------------------------
function dashCell() {
  return <td className='py-1 pr-2 text-gray-300'>—</td>
}

//----------------------------------------------------------------------------------------------
//  StepRow — one row of the manual step-runner table. The single row renderer shared by every
//  panel (AKBC / Tracked / Finish); each column is `undefined` → dashCell(), or a node. `indent`
//  is the stats sub-row style (no bold, pl-4 label, smaller Run button).
//----------------------------------------------------------------------------------------------
function StepRow({
  num, label, indent = false, help, processed, sql, refresh, remaining, statusNode, error, run,
}: {
  num: string
  label: string
  indent?: boolean
  help?: React.ReactNode
  processed?: React.ReactNode
  sql?: React.ReactNode
  refresh?: { onClick: () => void; loading: boolean }
  remaining?: React.ReactNode
  statusNode?: React.ReactNode
  error?: string
  run?: { onClick: () => void; disabled: boolean; active: boolean }
}) {
  return (
    <tr className={`border-t ${indent ? 'border-gray-50' : 'border-gray-100'}`}>
      <td className={`py-1 pr-2 text-xs ${indent ? '' : 'font-bold'}`}>{num}</td>
      <td className={`py-1 pr-2 text-xs ${indent ? 'pl-4 text-gray-600' : 'font-bold'}`}>{label}</td>
      {help ? <td className='py-1 pr-2'>{help}</td> : dashCell()}
      {processed !== undefined ? <td className='py-1 pr-2 text-gray-600'>{processed}</td> : dashCell()}
      {sql ? <td className='py-1 pr-2'>{sql}</td> : dashCell()}
      {refresh
        ? <td className='py-1 pr-2'>
            <MyButton onClick={refresh.onClick} disabled={refresh.loading}
              overrideClass='h-auto md:h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>
              {refresh.loading ? '…' : '↻'}
            </MyButton>
          </td>
        : dashCell()}
      {remaining !== undefined
        ? <td className='py-1 pr-2 text-gray-600'><strong className='text-gray-800'>{remaining}</strong></td>
        : dashCell()}
      {statusNode !== undefined ? <td className='py-1 pr-2'>{statusNode}</td> : dashCell()}
      <td className='py-1 pr-2'>{error && <p className='text-xs text-red-600'>{error}</p>}</td>
      {run
        ? <td className='py-1'>
            <MyButton onClick={run.onClick} disabled={run.disabled}
              overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none ${indent ? 'text-xs ' : ''}${run.active ? 'bg-orange-300 hover:bg-orange-300' : ''}`}>
              {run.active ? 'Running...' : 'Run'}
            </MyButton>
          </td>
        : <td className='py-1'></td>}
    </tr>
  )
}

//----------------------------------------------------------------------------------------------
//  StepTable — the manual step-runner shell (collapsible MyBox titled `title` + the one <thead>
//  with its Refresh and Run All buttons). Shared by every panel; `headerExtra` is the only
//  bespoke slot (AKBC's "From" date input). Its <tbody> is a list of <StepRow>.
//----------------------------------------------------------------------------------------------
function StepTable({
  title, runAllLabel, onRunAll, runningAll, onRefreshAll, refreshingAll, headerExtra, children,
}: {
  title: string
  runAllLabel: string
  onRunAll: () => void
  runningAll: boolean
  onRefreshAll: () => void
  refreshingAll: boolean
  headerExtra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <MyBox title={title} collapsible>
      {headerExtra && <div className='flex items-center gap-4 mb-2'>{headerExtra}</div>}
      <table className='w-full text-xs'>
        <thead>
          <tr className='text-left text-gray-400'>
            <th className='font-medium py-1 pr-2'>Step</th>
            <th className='font-medium py-1 pr-2'>Description</th>
            <th className='font-medium py-1 pr-2'>Help</th>
            <th className='font-medium py-1 pr-2'>Processed</th>
            <th className='font-medium py-1 pr-2'>SQL</th>
            <th className='font-medium py-1 pr-2'>
              <MyButton onClick={onRefreshAll} disabled={refreshingAll} overrideClass='h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium'>
                {refreshingAll ? 'Refreshing…' : 'Refresh'}
              </MyButton>
            </th>
            <th className='font-medium py-1 pr-2'>Remaining</th>
            <th className='font-medium py-1 pr-2'>Status</th>
            <th className='font-medium py-1 pr-2'>Result</th>
            <th className='font-medium py-1'>
              <MyButton onClick={onRunAll} disabled={runningAll}
                overrideClass={`h-auto md:h-auto px-1.5 py-0.5 leading-none font-medium ${runningAll ? 'bg-red-700 hover:bg-red-700 animate-pulse' : 'bg-red-500 hover:bg-red-600'}`}>
                {runningAll ? 'Running…' : runAllLabel}
              </MyButton>
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </MyBox>
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
  //  Overview "Run All Cron" per-fetch timeout override, entered in seconds, sent as
  //  ?fetch_timeout_ms= (× 1000). Seeded from the constant; clearing it falls back to it.
  //
  const [cronFetchTimeoutSec, setCronFetchTimeoutSec] = useState(String(FETCH_TIMEOUT_MS / 1000))

  //
  //  "Run in progress" strip state — the coarse pipeline steps only log when their function
  //  finishes, so during a long AKBC scrape the Jobs summary sits on "step 0 only". These
  //  give visible movement: elapsed time from fullCronStartedAt + live staging row counts.
  //
  const [fullCronStartedAt, setFullCronStartedAt] = useState<number | null>(null)
  const [stagingCounts,     setStagingCounts]     = useState<StagingCounts | null>(null)
  //
  //  Which CRON_JOBS entry the "Run All Cron" loop is currently POSTing (1-indexed), or null
  //
  const [cronProgress,      setCronProgress]      = useState<{ i: number; n: number; label: string } | null>(null)

  //
  //  MAX(se_date) per pipeline — akbc = club 106, tracked = everything else — shown on the
  //  Overview so it's clear how far each side has caught up
  //
  const [maxDates, setMaxDates] = useState<{ akbc: string | null; tracked: string | null } | null>(null)

  useEffect(() => { doRefreshAll() }, [])

  //
  //  Restore the shared To-date from localStorage on mount — done here rather than in the
  //  useState initializer, which also runs during SSR where localStorage is undefined.
  //
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PIPELINE_TO_DATE_STORAGE_KEY)
      if (saved) setPipelineToDate(saved)
    } catch {
      //
      //  localStorage unavailable (private mode / disabled) — the field just starts empty
      //
    }
  }, [])

  //
  //  Persist the shared To-date back to localStorage whenever it changes (removed when cleared)
  //
  useEffect(() => {
    try {
      if (pipelineToDate) localStorage.setItem(PIPELINE_TO_DATE_STORAGE_KEY, pipelineToDate)
      else localStorage.removeItem(PIPELINE_TO_DATE_STORAGE_KEY)
    } catch {
      //
      //  localStorage write failed — non-fatal, the value just won't persist this session
      //
    }
  }, [pipelineToDate])

  //
  //  While a full "Run All Cron" request is in flight, poll on a timer: bump refreshKey (each
  //  panel's PipelineSummary picks up the new run_id once Start Run has logged, then each step
  //  as it completes) and reload the staging counts + max dates for the progress strip. The
  //  end-of-run refresh is handled by handleRunFullCron's finally block.
  //
  useEffect(() => {
    if (running !== 'full-cron') {
      setStagingCounts(null)
      return
    }
    async function poll() {
      setRefreshKey(k => k + 1)
      setStagingCounts(await getStagingCounts())
      setMaxDates(await getPipelineMaxDates())
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
    const [rSessions, rResults, rPartners, rFromDate, rMaxDates] = await Promise.all([
      refreshSessionsStatus(), refreshResultsStatus(), refreshPartnersStatus(), getScrapeFromDate(),
      getPipelineMaxDates(),
    ])
    setSessionsStatus(rSessions); setResultsStatus(rResults); setPartnersStatus(rPartners)
    setMaxDates(rMaxDates)
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
  //  handleRunFullCron — fires every CRON_JOBS entry (verbatim from vercel.json) in order, one
  //  POST at a time, mirroring exactly what Vercel schedules. Each job's empty ?to_date= /
  //  ?fetch_timeout_ms= placeholders are filled from the Overview fields only when set (empty →
  //  posted exactly as prod fires it). A failing job is recorded and the loop continues to the
  //  next, since prod crons are independent.
  //----------------------------------------------------------------------------------------------
  async function handleRunFullCron() {
    setFullCronStartedAt(Date.now())
    setRunning('full-cron')
    try {
      for (let i = 0; i < CRON_JOBS.length; i++) {
        const job = CRON_JOBS[i]
        setCronProgress({ i: i + 1, n: CRON_JOBS.length, label: job.label })
        const url = fillCronParams(job.path, pipelineToDate, cronFetchTimeoutSec)
        try {
          const res  = await fetch(url, { method: 'POST' })
          const json = await res.json()
          setResults(prev => ({ ...prev, [job.key]: res.ok ? { data: json, error: null } : { data: null, error: json.error ?? `HTTP ${res.status}` } }))
        } catch (err) {
          setResults(prev => ({ ...prev, [job.key]: { data: null, error: String(err) } }))
        }
        setRefreshKey(k => k + 1)
      }
    } finally {
      setRunning(null)
      setCronProgress(null)
      await doRefreshAll()
      setRefreshKey(k => k + 1)
    }
  }

  //----------------------------------------------------------------------------------------------
  //  fanGroupsToSubRows — fills the STATS_SUB_ROWS result cells from a stats route's
  //  per-group `groups` map (player-* or partner-* keys)
  //----------------------------------------------------------------------------------------------
  function fanGroupsToSubRows(groups: Record<string, number> | undefined) {
    if (!groups) return
    setResults(prev => {
      const next = { ...prev }
      for (const row of STATS_SUB_ROWS) {
        const updated = groups[row.key]
        if (updated !== undefined) next[row.key] = { data: { updated }, error: null }
      }
      return next
    })
  }

  //----------------------------------------------------------------------------------------------
  //  handlePlayerStats — runs the Player Stats step (/api/build/stats-player), then fans its
  //  per-group counts out into the 4a–4d STATS_SUB_ROWS result cells
  //----------------------------------------------------------------------------------------------
  async function handlePlayerStats() {
    const data = await run('stats-player', '/api/build/stats-player', async () => {})
    fanGroupsToSubRows(data?.groups as Record<string, number> | undefined)
    return data
  }

  //----------------------------------------------------------------------------------------------
  //  handlePartnerStats — runs the Partner Stats step (/api/build/stats-partner), then fans its
  //  per-group counts out into the 5a–5d STATS_SUB_ROWS result cells
  //----------------------------------------------------------------------------------------------
  async function handlePartnerStats() {
    const data = await run('stats-partner', '/api/build/stats-partner', async () => {})
    fanGroupsToSubRows(data?.groups as Record<string, number> | undefined)
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
    await handlePlayerStats()
    await handlePartnerStats()
    setRunningAll(null)
  }

  //----------------------------------------------------------------------------------------------
  //  akbcRows / trackedRows / finishRows — the <StepRow> list for each panel's manual runner.
  //  Content (help text, which result/status to read, which handler) is per-step data; the row
  //  and table structure lives in StepRow / StepTable, so all three render identically.
  //----------------------------------------------------------------------------------------------
  function akbcRows() {
    const rc = results['scrape-club'], sc = results['sessions-club'], rr = results['results-club']
    return (
      <>
        <StepRow
          num='1a.' label='Scrape AKBC'
          help={<MyHelpStep
            title='1a. Scrape AKBC'
            input={[`nzbridge.co.nz — club results search (club ${BRIDGE_CLUB_ID}) for each day from the last built session date to today (or the To date, if set)`]}
            processing="Truncates ts1_sessions and ts2_results (start of a new coordinated run), then finds every AKBC run_id not yet in tse_sessions or ts1_sessions via the club-by-date search. For each missing run_id, fetches its results page and writes the session header to ts1_sessions and each pair's score to ts2_results, creating any new player by name as needed."
            output={[
              'ts1_sessions — one row per discovered session: date, club, event name, score type, tournament code',
              'ts2_results — one row per pair per session: raw score',
              'tpl_players — new player rows created on demand',
            ]}
            consumers={['Step 1b Build Sessions — ts1_sessions → tse_sessions', 'Step 1c Build Results — ts2_results → tre_results']}
          />}
          processed={rc?.data ? <span>{n(rc.data.run_ids_new as number)} sessions, {n(rc.data.pairs_total as number)} pairs</span> : undefined}
          error={rc?.error ?? undefined}
          run={{ onClick: () => handleScrapeClub(), disabled: anyRunning, active: running === 'scrape-club' }}
        />
        <StepRow
          num='1b.' label='Build Sessions — AKBC batch'
          help={<MyHelpStep
            title='1b. Build Sessions — AKBC batch'
            input={['ts1_sessions — rows with a date, not yet in tse_sessions, filtered to the AKBC scrape\'s date range']}
            processing='Inserts one tse_sessions row per ts1_sessions row (skipped if already present), deriving day-of-week from the date, MP/VP scoring type from the score type, and translating a couple of club name variants. Scoped to the same from/to date range as the preceding Scrape AKBC step — an explicit safeguard.'
            output={['tse_sessions — one row per session']}
            consumers={['Step 1c Build Results — joins tse_sessions for date/scoring context', 'Home/Rankings pages — session listings']}
          />}
          processed={sc?.data ? <span>{n(sc.data.inserted as number)} inserted, {n(sc.data.skipped as number)} skipped</span> : undefined}
          sql={<MyHelp label='SQL' text={SQL_STATUS_SESSIONS} />}
          refresh={{ onClick: doRefreshSessions, loading: sessionsLoading }}
          remaining={n(sessionsStatus?.remaining)}
          statusNode={<StatusBadge complete={sessionsStatus === null ? null : sessionsStatus.remaining === 0} />}
          error={sc?.error ?? undefined}
          run={{ onClick: () => handleSessionsClub(), disabled: anyRunning, active: running === 'sessions-club' }}
        />
        <StepRow
          num='1c.' label='Build Results — AKBC batch'
          help={<MyHelpStep
            title='1c. Build Results — AKBC batch'
            input={['ts2_results joined to tse_sessions/ts1_sessions — sessions not yet in tre_results, filtered to the AKBC scrape\'s date range']}
            processing='Upserts tpa_partners for any new player pair, then inserts one tre_results row per session per partnership — percentage clamped to 25–75 for MP sessions, VP capped at 999 for VP sessions. Scoped to the same from/to date range as the preceding Scrape AKBC step.'
            output={['tpa_partners — new partnership rows', 'tre_results — one row per player pair per session']}
            consumers={['Step 3 Build Partners — status count reads tpa_partners', 'Step 4 Update Stats — aggregates from tre_results', 'Player/session detail pages']}
          />}
          processed={rr?.data ? <span>{n(rr.data.inserted as number)} inserted</span> : undefined}
          sql={<MyHelp label='SQL' text={SQL_STATUS_RESULTS} />}
          refresh={{ onClick: doRefreshResults, loading: resultsLoading }}
          remaining={n(resultsStatus?.remaining)}
          statusNode={<StatusBadge complete={resultsStatus === null ? null : resultsStatus.remaining === 0} />}
          error={rr?.error ?? undefined}
          run={{ onClick: () => handleResultsClub(), disabled: anyRunning, active: running === 'results-club' }}
        />
      </>
    )
  }

  function trackedRows() {
    const st = results['scrape-tracked'], se = results['sessions-tracked'], re = results['results-tracked']
    return (
      <>
        <StepRow
          num='2a.' label='Scrape Tracked Players'
          help={<MyHelpStep
            title='2a. Scrape Tracked Players'
            input={["nzbridge.co.nz — each tracked player's full online-points history (no date range — NZB returns everything)"]}
            processing="For each flagged player (pl_tracked = TRUE), fetches their full match history and finds every run_id not already in tse_sessions or ts1_sessions — so a session already built (e.g. by Scrape AKBC + Build Sessions, if that ran first) or already scraped in a previous run is never re-fetched, however many tracked players share it. Does not truncate ts1_sessions/ts2_results — adds to whatever's already staged. Writes exactly like Scrape AKBC otherwise."
            output={['ts1_sessions — one row per newly-discovered session', 'ts2_results — one row per pair per session', 'tpl_players — new player rows created on demand']}
            consumers={['Step 2b Build Sessions — ts1_sessions → tse_sessions', 'Step 2c Build Results — ts2_results → tre_results']}
          />}
          processed={st?.data ? <span>{n(st.data.run_ids_new as number)} sessions, {n(st.data.pairs_total as number)} pairs</span> : undefined}
          error={st?.error ?? undefined}
          run={{ onClick: () => handleScrapeTracked(), disabled: anyRunning, active: running === 'scrape-tracked' }}
        />
        <StepRow
          num='2b.' label='Build Sessions — Tracked batch'
          help={<MyHelpStep
            title='2b. Build Sessions — Tracked batch'
            input={['ts1_sessions — rows with a date, not yet in tse_sessions (unfiltered — tracked players aren\'t date-bound)']}
            processing='Same as the AKBC batch, but with no date filter — processes whatever is currently in ts1_sessions left over from Scrape Tracked Players.'
            output={['tse_sessions — one row per session']}
            consumers={['Step 2c Build Results — joins tse_sessions for date/scoring context', 'Home/Rankings pages — session listings']}
          />}
          processed={se?.data ? <span>{n(se.data.inserted as number)} inserted, {n(se.data.skipped as number)} skipped</span> : undefined}
          error={se?.error ?? undefined}
          run={{ onClick: () => handleSessionsTracked(), disabled: anyRunning, active: running === 'sessions-tracked' }}
        />
        <StepRow
          num='2c.' label='Build Results — Tracked batch'
          help={<MyHelpStep
            title='2c. Build Results — Tracked batch'
            input={['ts2_results joined to tse_sessions/ts1_sessions — sessions not yet in tre_results (unfiltered)']}
            processing='Same as the AKBC batch, but with no date filter.'
            output={['tpa_partners — new partnership rows', 'tre_results — one row per player pair per session']}
            consumers={['Step 3 Build Partners — status count reads tpa_partners', 'Step 4 Update Stats — aggregates from tre_results', 'Player/session detail pages']}
          />}
          processed={re?.data ? <span>{n(re.data.inserted as number)} inserted</span> : undefined}
          error={re?.error ?? undefined}
          run={{ onClick: () => handleResultsTracked(), disabled: anyRunning, active: running === 'results-tracked' }}
        />
      </>
    )
  }

  function finishRows() {
    const pa = results.partners, stp = results['stats-player'], stpa = results['stats-partner']
    return (
      <>
        <StepRow
          num='3.' label='Build Partners'
          help={<MyHelpStep
            title='3. Build Partners'
            input={['tpa_partners']}
            processing='Status-only — counts the current tpa_partners row total. The actual partnership upsert already happens inside Build Results; this step does not insert anything itself.'
            output={['(none — read-only status check)']}
            consumers={['Informational only — no downstream writer depends on this step running']}
          />}
          processed={pa?.data ? <span>{n(pa.data.pairs as number)} pairs</span> : undefined}
          sql={<MyHelp label='SQL' text={SQL_STATUS_PARTNERS} />}
          refresh={{ onClick: doRefreshPartners, loading: partnersLoading }}
          remaining={n(partnersStatus?.remaining)}
          statusNode={<StatusBadge complete={partnersStatus === null ? null : partnersStatus.remaining === 0} />}
          error={pa?.error ?? undefined}
          run={{ onClick: handlePartners, disabled: anyRunning, active: running === 'partners' }}
        />
        <StepRow
          num='4.' label='Player Stats'
          help={<MyHelpStep
            title='4. Player Stats'
            input={['tre_results joined to tse_sessions/tpa_partners']}
            processing="Upserts ta1_player_stats — MP/VP session counts, averages and standard deviations per player, per tournament group (A/B/C, from the last character of se_tournament) plus a combined 'all' group. Logged as sub-steps 4a–4d. Full recompute every run — no incremental backlog, so no Remaining count. The Run button here calls /api/build/stats-player (step 4 only); step 5 Partner Stats is its own route/Run button. The 4a–4d rows below re-run a single group for manual correction."
            output={['ta1_player_stats — one row per player per group']}
            consumers={['Player profile page — group stats display', 'Rankings page — per-group averages']}
          />}
          processed={stp?.data ? <span>{n(stp.data.player_rows as number)} player rows</span> : undefined}
          error={stp?.error ?? undefined}
          run={{ onClick: handlePlayerStats, disabled: anyRunning, active: running === 'stats-player' }}
        />
        {STATS_SUB_ROWS.filter(r => r.key.startsWith('player-')).map((row, i) => (
          <StepRow
            key={row.key}
            num={`4${'abcd'[i]}.`} label={row.label} indent
            processed={results[row.key]?.data ? <span>{n(results[row.key].data!.updated as number)} rows</span> : undefined}
            sql={<MyHelp label='SQL' text={row.sql} />}
            statusNode={<StatusBadge complete={results[row.key]?.data ? true : null} />}
            error={results[row.key]?.error ?? undefined}
            run={{ onClick: () => run(row.key, row.url, async () => {}), disabled: anyRunning, active: running === row.key }}
          />
        ))}
        <StepRow
          num='5.' label='Partner Stats'
          help={<MyHelpStep
            title='5. Partner Stats'
            input={['tre_results joined to tse_sessions']}
            processing="Upserts ta2_partner_stats — the same per-group MP/VP session counts / averages / stddev, per partnership. Logged as sub-steps 5a–5d. The Run button here calls /api/build/stats-partner (step 5 only), a separate route/schedule from step 4 Player Stats; the 5a–5d rows re-run one group for manual correction."
            output={['ta2_partner_stats — one row per partnership per group']}
            consumers={['Player profile page — partnership stats', 'Partners / Rankings pages — per-group averages']}
          />}
          processed={stpa?.data ? <span>{n(stpa.data.partner_rows as number)} partner rows</span> : undefined}
          error={stpa?.error ?? undefined}
          run={{ onClick: handlePartnerStats, disabled: anyRunning, active: running === 'stats-partner' }}
        />
        {STATS_SUB_ROWS.filter(r => r.key.startsWith('partner-')).map((row, i) => (
          <StepRow
            key={row.key}
            num={`5${'abcd'[i]}.`} label={row.label} indent
            processed={results[row.key]?.data ? <span>{n(results[row.key].data!.updated as number)} rows</span> : undefined}
            sql={<MyHelp label='SQL' text={row.sql} />}
            statusNode={<StatusBadge complete={results[row.key]?.data ? true : null} />}
            error={results[row.key]?.error ?? undefined}
            run={{ onClick: () => run(row.key, row.url, async () => {}), disabled: anyRunning, active: running === row.key }}
          />
        ))}
      </>
    )
  }

  //----------------------------------------------------------------------------------------------
  //  renderScopeSummary — one pipeline scope's <PipelineSummary> (its run-id picker + JobsTable)
  //----------------------------------------------------------------------------------------------
  function renderScopeSummary(scope: 'akbc' | 'tracked' | 'finish') {
    const summarySteps = scope === 'akbc' ? [0, 1] : scope === 'tracked' ? [2] : [3, 4, 5]
    return <PipelineSummary title={`${SCOPE_LABEL[scope]} — Summary`} refreshKey={refreshKey} steps={summarySteps} />
  }

  //----------------------------------------------------------------------------------------------
  //  renderScopeSteps — one pipeline scope's <StepTable> (the manual per-step runner rows)
  //----------------------------------------------------------------------------------------------
  function renderScopeSteps(scope: 'akbc' | 'tracked' | 'finish') {
    const onRunAll = scope === 'akbc' ? runAllAkbc : scope === 'tracked' ? runAllTracked : runFinishPipeline
    const rows     = scope === 'akbc' ? akbcRows() : scope === 'tracked' ? trackedRows() : finishRows()
    return (
      <StepTable
        title={`${SCOPE_LABEL[scope]} — Pipeline`}
        runAllLabel='Run All'
        onRunAll={onRunAll}
        runningAll={runningAll === scope}
        onRefreshAll={doRefreshAll}
        refreshingAll={refreshAllLoading}
        headerExtra={scope === 'akbc' ? (
          <>
            <div className='flex items-center gap-1'>
              <span className='text-xs text-gray-500'>From:</span>
              <MyInput type='date' value={scrapeFromDate} onChange={e => setScrapeFromDate(e.target.value)}
                overrideClass='rounded border border-gray-300 px-1 py-0.5 text-xs h-auto md:h-auto' />
            </div>
            <span className='text-xs text-gray-400'>To: the shared "To date" above</span>
          </>
        ) : undefined}
      >
        {rows}
      </StepTable>
    )
  }

  //----------------------------------------------------------------------------------------------
  //  renderPanel — one pipeline scope = <PipelineSummary> + <StepTable>, in that order. Used by
  //  the AKBC / Tracked / Finish single-scope tabs. Overview composes renderScopeSummary /
  //  renderScopeSteps separately so all three summaries stack before all three step tables.
  //----------------------------------------------------------------------------------------------
  function renderPanel(scope: 'akbc' | 'tracked' | 'finish') {
    return (
      <>
        {renderScopeSummary(scope)}
        {renderScopeSteps(scope)}
      </>
    )
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
        {CRON_JOBS.filter(j => results[j.key]?.error).map(j => (
          <p key={j.key} className='text-xs text-red-600'>{j.label}: {results[j.key].error}</p>
        ))}
      </div>
      <div className='flex items-center gap-4'>
        <div className='flex items-center gap-1'>
          <span className='text-xs text-gray-500'>Fetch timeout (s):</span>
          <MyInput type='number' value={cronFetchTimeoutSec} onChange={e => setCronFetchTimeoutSec(e.target.value)}
            overrideClass='rounded border border-gray-300 px-1 py-0.5 text-xs h-auto md:h-auto w-20' />
        </div>
        {maxDates && (
          <div className='flex items-center gap-3 text-xs text-gray-600'>
            <span>MAX(se_date) — AKBC (106): <strong className='text-gray-800'>{maxDates.akbc ?? '—'}</strong></span>
            <span>Tracked: <strong className='text-gray-800'>{maxDates.tracked ?? '—'}</strong></span>
          </div>
        )}
      </div>
      {running === 'full-cron' && (
        <div className='flex items-center gap-3 text-xs text-gray-600'>
          <span className='animate-pulse font-medium'>Run in progress</span>
          {cronProgress && <span>running {cronProgress.label} ({cronProgress.i}/{cronProgress.n})</span>}
          {fullCronStartedAt !== null && <span>elapsed {formatElapsed(Date.now() - fullCronStartedAt)}</span>}
          {stagingCounts && <span>ts1_sessions {stagingCounts.ts1_sessions.toLocaleString()}</span>}
          {stagingCounts && <span>ts2_results {stagingCounts.ts2_results.toLocaleString()}</span>}
        </div>
      )}
      {renderScopeSummary('akbc')}
      {renderScopeSummary('tracked')}
      {renderScopeSummary('finish')}
      {renderScopeSteps('akbc')}
      {renderScopeSteps('tracked')}
      {renderScopeSteps('finish')}
      </>
      )}

      {activeTab === 'akbc'    && renderPanel('akbc')}
      {activeTab === 'tracked' && renderPanel('tracked')}
      {activeTab === 'finish'  && renderPanel('finish')}

    </div>
  )
}
