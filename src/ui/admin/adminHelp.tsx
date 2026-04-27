// Help content for all admin buttons — rendered inside HelpButton / MyPopup

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className='text-base font-semibold text-gray-900 mb-2'>{title}</h3>
      {children}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className='mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2'>{children}</p>
}

// ── Session Import ────────────────────────────────────────────────────────────

export const HELP_IMPORT_SESSION = (
  <Section title='Import Session'>
    <p className='text-sm text-gray-600 mb-2'>
      Imports a single session directly by its AKBC source ID. Use this when you know the specific
      session ID and want to import it without using the session list.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Enter the numeric AKBC source ID (e.g. 654558)</li>
      <li>Check <strong>Delete &amp; reimport if exists</strong> to overwrite an existing session</li>
      <li>Click <strong>Import Session</strong> — result shows pairs imported and any new players created</li>
      <li>IMP sessions are detected automatically from the page content</li>
    </ul>
  </Section>
)

export const HELP_FETCH_LIST = (
  <Section title='Fetch Session List'>
    <p className='text-sm text-gray-600 mb-2'>
      Downloads the list of all sessions available on AKBC for the selected year.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Select the year from the dropdown</li>
      <li>Click <strong>Fetch Session List</strong> to populate the table below</li>
      <li>Sessions already in the database are highlighted green (Imported)</li>
      <li>IMP sessions are shown in grey — tick the checkbox to include them if needed</li>
    </ul>
  </Section>
)

export const HELP_IMPORT_SELECTED = (
  <Section title='Import Selected'>
    <p className='text-sm text-gray-600 mb-2'>
      Imports all ticked sessions from the session list in sequence.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Tick sessions in the list — IMP sessions are labelled in purple and can be included</li>
      <li>Select-all checkbox ticks all sessions not yet imported</li>
      <li>Click <strong>Import Selected</strong> — each row shows Importing… → Done or Error</li>
      <li>After import, run <strong>Stage 2 → Fetch All Pending</strong> to download result pages</li>
    </ul>
    <Note>Only imports the session header. Result pairs are fetched separately in Stage 2.</Note>
  </Section>
)

export const HELP_LOAD_STATUS = (
  <Section title='Load Status'>
    <p className='text-sm text-gray-600 mb-2'>
      Loads the current fetch-results status table showing which sessions have had their result pages downloaded.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li><span className='text-green-700 font-medium'>Processed</span> — results fetched and processed into player records</li>
      <li><span className='text-blue-600 font-medium'>Fetched</span> — pairs downloaded, awaiting Stage 3 processing</li>
      <li><span className='text-gray-500'>Pending</span> — session imported, results not yet fetched</li>
      <li><span className='text-amber-600 font-medium'>No Pairs</span> — AKBC page returned no result rows</li>
      <li><span className='text-red-600 font-medium'>Error</span> — fetch failed; see error column</li>
    </ul>
    <Note>Click a status badge (e.g. Error) to select all sessions of that type for refetch.</Note>
  </Section>
)

export const HELP_FETCH_ALL_PENDING = (
  <Section title='Fetch All Pending'>
    <p className='text-sm text-gray-600 mb-2'>
      Downloads result pages from AKBC for all sessions that do not yet have pairs stored.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Processes all sessions with status <strong>Pending</strong></li>
      <li>Progress bar shows sessions processed and pairs stored</li>
      <li>After completion, click <strong>Load Status</strong> to refresh the table</li>
      <li>Then run <strong>Stage 3 → Process Results</strong></li>
    </ul>
  </Section>
)

export const HELP_REFETCH_SELECTED = (
  <Section title='Refetch Selected'>
    <p className='text-sm text-gray-600 mb-2'>
      Re-downloads result pages for the ticked sessions — useful for fixing errors or updating skipped sessions.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Tick rows in the status table, or click a status badge to auto-select that type</li>
      <li>Click <strong>Refetch Selected</strong> — existing pairs for those sessions are replaced</li>
      <li>Useful for sessions that returned Error or No Pairs on the first attempt</li>
    </ul>
  </Section>
)

export const HELP_PROCESS_RESULTS = (
  <Section title='Process Results'>
    <p className='text-sm text-gray-600 mb-2'>
      Converts raw AKBC name pairs into player records, result rows, and partnership stats.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Matches player names to existing records, creating new players where needed</li>
      <li>Writes to <code className='bg-gray-100 px-1 rounded'>tre_results</code> and <code className='bg-gray-100 px-1 rounded'>tpa_partners</code></li>
      <li>Progress shows sessions, players created, results inserted, partnerships created</li>
      <li>After processing, run <strong>Stage 6 → Recalculate Averages</strong> to update player stats</li>
    </ul>
    <Note>Safe to re-run — existing results for a session are replaced, not duplicated.</Note>
  </Section>
)

// ── Player Refresh ────────────────────────────────────────────────────────────

export const HELP_FILL_MISSING = (
  <Section title='Fill Missing NZ Numbers'>
    <p className='text-sm text-gray-600 mb-2'>
      Looks up players without an NZ bridge number by searching nzbridge.co.nz by name.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Only processes players with no NZ number assigned yet</li>
      <li>Exact name matches are assigned automatically</li>
      <li>Ambiguous matches (multiple possible players) are queued for manual review below</li>
      <li>Failed lookups (name not found) are counted but not retried automatically</li>
    </ul>
    <Note>Click the orange count next to "Without NZ#" to see which players are missing numbers.</Note>
  </Section>
)

export const HELP_MERGE = (
  <Section title='Merge Players'>
    <p className='text-sm text-gray-600 mb-2'>
      Combines two duplicate player records into one. All results and partnerships from the discarded
      record are moved to the kept record.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Search for the <strong>correct</strong> record in the "Name to keep" box</li>
      <li>Search for the <strong>duplicate</strong> in the "Name to discard" box</li>
      <li>Click <strong>Merge</strong> — averages and partnerships are recalculated automatically</li>
    </ul>
    <Note>This cannot be undone. Double-check both names before merging.</Note>
  </Section>
)

export const HELP_CORRECT_SEARCH = (
  <Section title='Correct NZ Numbers — Search'>
    <p className='text-sm text-gray-600 mb-2'>
      Finds a player by name so you can manually fix their NZ bridge number.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Type at least 2 characters and press Enter or click <strong>Search</strong></li>
      <li>Results show current NZ# and an input for the correct value</li>
      <li>Enter the correct NZ# and click <strong>Correct</strong> on that row</li>
    </ul>
  </Section>
)

export const HELP_CORRECT_ASSIGN = (
  <Section title='Correct NZ Number — Assign'>
    <p className='text-sm text-gray-600 mb-2'>
      Saves the manually entered NZ bridge number for this player.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Enter the correct NZ# in the input field on this row</li>
      <li>Click <strong>Correct</strong> to save — the player record is updated immediately</li>
      <li>Run <strong>Refresh All Stats</strong> afterwards to pull grade/rating/points from nzbridge.co.nz</li>
    </ul>
  </Section>
)

export const HELP_REFRESH_ALL_STATS = (
  <Section title='Refresh All Stats'>
    <p className='text-sm text-gray-600 mb-2'>
      Updates grade, rating, and masterpoints for all players by fetching their profile from nzbridge.co.nz
      using their NZ bridge number.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Only players with a valid NZ# are updated</li>
      <li>Updates <code className='bg-gray-100 px-1 rounded'>pl_grade</code>, <code className='bg-gray-100 px-1 rounded'>pl_rating</code>, <code className='bg-gray-100 px-1 rounded'>pl_a_points</code>, <code className='bg-gray-100 px-1 rounded'>pl_b_points</code>, <code className='bg-gray-100 px-1 rounded'>pl_c_points</code></li>
      <li>Progress shows updated vs failed counts</li>
    </ul>
    <Note>Run after Fill Missing NZ Numbers to pick up newly assigned numbers.</Note>
  </Section>
)

export const HELP_RECALC_AVERAGES = (
  <Section title='Recalculate Averages'>
    <p className='text-sm text-gray-600 mb-2'>
      Recomputes session counts and average percentages for all players from their stored result rows.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Updates <code className='bg-gray-100 px-1 rounded'>pl_session_count</code> and <code className='bg-gray-100 px-1 rounded'>pl_avg_percentage</code> on every player</li>
      <li>Run after importing new sessions, processing results, or applying an IMP clamp</li>
      <li>Progress shows two passes: session counts, then averages</li>
    </ul>
  </Section>
)

export const HELP_RECALC_PARTNERSHIPS = (
  <Section title='Recalculate Partnerships'>
    <p className='text-sm text-gray-600 mb-2'>
      Recomputes the session count and average percentage for every player–partner pair.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Updates <code className='bg-gray-100 px-1 rounded'>pa_sessions</code> and <code className='bg-gray-100 px-1 rounded'>pa_avg_pct</code> in <code className='bg-gray-100 px-1 rounded'>tpa_partners</code></li>
      <li>Run after importing new results or applying an IMP clamp</li>
    </ul>
  </Section>
)

export const HELP_POPULATE_RANKS = (
  <Section title='Populate Ranks'>
    <p className='text-sm text-gray-600 mb-2'>
      Scans all player records and inserts every distinct <code className='bg-gray-100 px-1 rounded'>pl_rank</code> value
      into <code className='bg-gray-100 px-1 rounded'>trk_ranks</code>.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Safe to run repeatedly — existing entries are skipped (ON CONFLICT DO NOTHING)</li>
      <li>Run after importing new player data or after refreshing all stats</li>
      <li>The Players table on the home page uses this list for its Rank filter</li>
    </ul>
  </Section>
)

export const HELP_POPULATE_CLUBS = (
  <Section title='Populate Clubs'>
    <p className='text-sm text-gray-600 mb-2'>
      Scans all player records and inserts every distinct <code className='bg-gray-100 px-1 rounded'>pl_club</code> value
      into <code className='bg-gray-100 px-1 rounded'>tcl_clubs</code>.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Safe to run repeatedly — existing entries are skipped</li>
      <li>Run after importing new sessions that introduce new club names</li>
    </ul>
  </Section>
)

export const HELP_POPULATE_GRADES = (
  <Section title='Populate Grades'>
    <p className='text-sm text-gray-600 mb-2'>
      Scans all player records and inserts every distinct <code className='bg-gray-100 px-1 rounded'>pl_grade</code> value
      into <code className='bg-gray-100 px-1 rounded'>tgr_grades</code>.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Safe to run repeatedly — existing entries are skipped</li>
      <li>Run after refreshing all stats to pick up any new grade values from nzbridge.co.nz</li>
    </ul>
  </Section>
)

export const HELP_AUDIT_STATS = (
  <Section title='Audit — Stats Refresh'>
    <p className='text-sm text-gray-600 mb-2'>
      Checks that all players with a valid NZ# had their stats successfully fetched from nzbridge.co.nz.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Flags players where <code className='bg-gray-100 px-1 rounded'>pl_grade</code> is blank and <code className='bg-gray-100 px-1 rounded'>pl_rating</code> is 0 despite having a valid NZ#</li>
      <li>These players' profiles could not be fetched — check their NZ# is correct</li>
    </ul>
    <Note>Run after Stage 5 — Refresh All Stats.</Note>
  </Section>
)

export const HELP_AUDIT_AVERAGES = (
  <Section title='Audit — Averages & Partnerships'>
    <p className='text-sm text-gray-600 mb-2'>
      Checks that player session counts, averages, and partnership stats are consistent with the result data.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li><strong>Incorrect session count</strong> — stored count differs from actual distinct sessions in results; re-run Recalculate Averages</li>
      <li><strong>Avg% = 0 with sessions</strong> — average calculation failed for these players</li>
      <li><strong>Partnerships not recalculated</strong> — partnerships exist with no sessions; re-run Recalculate Partnerships</li>
    </ul>
    <Note>Run after Stage 6 — Recalculate Averages and Recalculate Partnerships.</Note>
  </Section>
)

export const HELP_AUDIT_FETCH = (
  <Section title='Audit — Fetch Coverage'>
    <p className='text-sm text-gray-600 mb-2'>
      Checks that all imported sessions have been fetched from AKBC. Run before Stage 3.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li><strong>Sessions never fetched</strong> — no fetch log entry and no raw results; needs Fetch All Pending</li>
      <li><strong>Sessions with fetch errors</strong> — last fetch attempt failed; use Refetch Selected to retry</li>
      <li><strong>Sessions fetched but not processed</strong> — raw pairs exist but no results in <code className='bg-gray-100 px-1 rounded'>tre_results</code>; run Process Results</li>
    </ul>
    <Note>All counts should be 0 before proceeding to Stage 3.</Note>
  </Section>
)

export const HELP_AUDIT_PROCESS = (
  <Section title='Audit — Process Integrity'>
    <p className='text-sm text-gray-600 mb-2'>
      Checks that processed results are consistent and player stats are up to date. Run after Stage 3 and again after Stage 6.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li><strong>Pair/result count mismatch</strong> — each raw pair should produce exactly 2 result rows; a mismatch means partial processing</li>
      <li><strong>Players with results but session_count = 0</strong> — results exist but averages have not been recalculated; run Recalculate Averages</li>
      <li><strong>Orphaned result rows</strong> — results reference a session that no longer exists</li>
    </ul>
    <Note>All counts should be 0 after running Recalculate Averages (Stage 6).</Note>
  </Section>
)

export const HELP_MERGE_CLUBS = (
  <Section title='Merge Club'>
    <p className='text-sm text-gray-600 mb-2'>
      Renames all players whose club matches <strong>From</strong> to the <strong>Into</strong> value,
      then removes the <strong>From</strong> entry from the club lookup table.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Use when two club names refer to the same club (e.g. "2020 Waiheke" → "Waiheke")</li>
      <li>After merging, run <strong>Populate Clubs</strong> to refresh the dropdown</li>
    </ul>
    <Note>Cannot be undone — verify both selections before clicking Merge Club.</Note>
  </Section>
)

export const HELP_RECALC_DATE_SEQ = (
  <Section title='Recalculate Date Seq'>
    <p className='text-sm text-gray-600 mb-2'>
      Assigns a sequence number (1, 2, 3…) to sessions that share the same date, in chronological
      import order.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Updates <code className='bg-gray-100 px-1 rounded'>se_date_seq</code> on <code className='bg-gray-100 px-1 rounded'>tre_sessions</code></li>
      <li>Needed when a club runs two sessions on the same day (e.g. morning and afternoon)</li>
      <li>The Seq column in the player history table uses this value</li>
    </ul>
  </Section>
)
