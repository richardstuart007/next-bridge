'use client'

import { useState } from 'react'

//----------------------------------------------------------------------------------------------
//  STEPS — structured data flow for all 5 pipeline steps
//----------------------------------------------------------------------------------------------
const STEPS = [
  {
    num: '1',
    title: 'Raw Data Scraping',
    input: [
      'nzbridge.co.nz — club results search (club 106) for each day from the last built session date to today',
      'nzbridge.co.nz — each tracked player\'s online-points history',
    ],
    processing:
      'Truncates ts1_sessions and ts2_results, then finds every run_id not yet in tse_sessions via the club-by-date search and each tracked player\'s results history. For each missing run_id, fetches its results page and writes the session header to ts1_sessions and each pair\'s score to ts2_results, creating any new player by name as needed. Automatic date range only — no manual date/source selection.',
    output: [
      'ts1_sessions — one row per discovered session: date, club, event name, score type, tournament code',
      'ts2_results — one row per pair per session: raw score',
      'tpl_players — new player rows created on demand',
    ],
  },
  {
    num: '2',
    title: 'Build Sessions',
    input: [
      'ts1_sessions — rows with a date, not yet in tse_sessions',
    ],
    processing:
      'Inserts one tse_sessions row per ts1_sessions row (skipped if already present), deriving day-of-week from the date, MP/VP scoring type from the score type, and translating a couple of club name variants.',
    output: [
      'tse_sessions — one row per session',
    ],
  },
  {
    num: '3',
    title: 'Build Results',
    input: [
      'ts2_results joined to tse_sessions/ts1_sessions — sessions not yet in tre_results',
    ],
    processing:
      'Upserts tpa_partners for any new player pair, then inserts one tre_results row per session per partnership — percentage clamped to 25–75 for MP sessions, VP capped at 999 for VP sessions.',
    output: [
      'tpa_partners — new partnership rows',
      'tre_results — one row per player pair per session',
    ],
  },
  {
    num: '4',
    title: 'Build Partners',
    input: [
      'tpa_partners',
    ],
    processing:
      'Status-only — counts the current tpa_partners row total. The actual partnership upsert already happens inside Build Results; this step does not insert anything itself.',
    output: [
      '(none — read-only status check)',
    ],
  },
  {
    num: '5',
    title: 'Update Stats',
    input: [
      'tre_results joined to tse_sessions/tpa_partners',
    ],
    processing:
      'Truncates ta1_player_stats and ta2_partner_stats, then recomputes MP/VP session counts, averages and standard deviations per player and per partnership, for each tournament group (A/B/C, derived from the last character of se_tournament) plus a combined \'all\' group — 8 inserts total, each logged as its own sub-step. Full rebuild every run, not incremental.',
    output: [
      'ta1_player_stats — one row per player per group',
      'ta2_partner_stats — one row per partnership per group',
    ],
  },
]

const ROW_COUNT_SQL =
  `SELECT tbl, cnt FROM (
  SELECT 1 ord, 'ts1_sessions'      tbl, COUNT(*) cnt FROM ts1_sessions
  UNION ALL SELECT 2, 'ts2_results',        COUNT(*) FROM ts2_results
  UNION ALL SELECT 3, 'tse_sessions',       COUNT(*) FROM tse_sessions
  UNION ALL SELECT 4, 'tre_results',        COUNT(*) FROM tre_results
  UNION ALL SELECT 5, 'tpa_partners',       COUNT(*) FROM tpa_partners
  UNION ALL SELECT 6, 'ta1_player_stats',   COUNT(*) FROM ta1_player_stats
  UNION ALL SELECT 7, 'ta2_partner_stats',  COUNT(*) FROM ta2_partner_stats
) t ORDER BY ord;`

//----------------------------------------------------------------------------------------------
//  PipelineHelp — wider structured help popover for the Pipeline page
//----------------------------------------------------------------------------------------------
export default function PipelineHelp() {
  const [open, setOpen] = useState(false)

  return (
    <span className='inline-block'>
      <button
        onClick={() => setOpen(o => !o)}
        className='text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-1.5 py-0.5 leading-none'
        type='button'
      >
        Help
      </button>

      {open && (
        <div className='absolute z-20 mt-1 left-0 w-[min(2000px,90vw)] max-h-[85vh] overflow-y-auto p-4 bg-blue-50 border border-blue-200 rounded-md shadow-xl text-xs'>

          <div className='flex justify-between items-center mb-3'>
            <p className='font-semibold text-blue-800 text-sm'>Pipeline — Data Flow</p>
            <button
              onClick={() => setOpen(false)}
              className='ml-4 text-gray-400 hover:text-gray-700 text-base leading-none font-bold'
              type='button'
            >
              ×
            </button>
          </div>

          <div className='space-y-3'>
            {STEPS.map(step => (
              <div key={step.num} className='bg-white border border-blue-100 rounded'>
                <div className='bg-blue-100 px-3 py-1.5 rounded-t'>
                  <p className='font-semibold text-blue-800'>Step {step.num} — {step.title}</p>
                </div>
                <table className='w-full text-xs border-collapse'>
                  <tbody>
                    <tr className='align-top'>
                      <td className='font-semibold text-gray-500 w-24 px-3 py-2 border-b border-gray-100 whitespace-nowrap'>Input</td>
                      <td className='text-gray-700 px-3 py-2 border-b border-gray-100'>
                        {step.input.map((s, i) => (
                          <div key={i} className={i > 0 ? 'mt-0.5' : ''}>{s}</div>
                        ))}
                      </td>
                    </tr>
                    <tr className='align-top'>
                      <td className='font-semibold text-gray-500 px-3 py-2 border-b border-gray-100'>Processing</td>
                      <td className='text-gray-700 px-3 py-2 border-b border-gray-100'>{step.processing}</td>
                    </tr>
                    <tr className='align-top'>
                      <td className='font-semibold text-gray-500 px-3 py-2'>Output</td>
                      <td className='text-gray-700 px-3 py-2'>
                        {step.output.map((s, i) => (
                          <div key={i} className={i > 0 ? 'mt-0.5' : ''}>{s}</div>
                        ))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}

            <div className='bg-white border border-blue-100 rounded p-3'>
              <p className='font-semibold text-gray-600 mb-2'>Row Count SQL</p>
              <pre className='text-gray-700 font-mono text-xs whitespace-pre overflow-x-auto leading-relaxed'>{ROW_COUNT_SQL}</pre>
            </div>
          </div>

        </div>
      )}
    </span>
  )
}
