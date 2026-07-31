import type { ReactNode } from 'react'

const H4 = 'text-base font-semibold text-gray-800 mt-6 mb-2 first:mt-0'
const H5 = 'text-xs font-medium text-gray-500 uppercase tracking-wide mt-4 mb-1'
const P = 'text-sm text-gray-700 mb-3 leading-relaxed'
const UL = 'list-disc list-outside pl-5 text-sm text-gray-700 mb-4 space-y-1'
const OL = 'list-decimal list-outside pl-5 text-sm text-gray-700 mb-4 space-y-1'
const CODE = 'font-mono text-[0.85em] bg-blue-50 text-blue-800 rounded px-1 py-0.5'

function Code({ children }: { children: ReactNode }) {
  return <code className={CODE}>{children}</code>
}

//----------------------------------------------------------------------------------------------
//  NzbridgeSection
//----------------------------------------------------------------------------------------------
function NzbridgeSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Source of every scraped session and result for the whole pipeline. External system, not a
        table — Input/Processing don't apply the way they do for the rest of this doc.
      </p>

      <h4 className={H4}>Output</h4>
      <p className={P}>
        Three endpoints, all under <Code>https://www.nzbridge.co.nz</Code>:
      </p>
      <ul className={UL}>
        <li><Code>results.html?mp_filter_club=&lt;id&gt;&amp;date_start=&amp;date_end=</Code> — one day&apos;s club results search — used by Scrape AKBC</li>
        <li><Code>online-points.html?mp_user=&lt;nz_bridge_number&gt;</Code> — a tracked player&apos;s full match history (no date range — NZB returns everything) — used by Scrape Tracked Players</li>
        <li><Code>results.html?run_id=&lt;id&gt;</Code> — one session&apos;s results page (header + every pair&apos;s score) — used by both scrape steps once a run_id is found</li>
      </ul>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Scrape AKBC / Scrape Tracked Players</h5>
      <p className={P}>
        <Code>pipelineScrape.ts</Code>&apos;s <Code>scrapeClubSessions</Code>/<Code>scrapeTrackedPlayerSessions</Code> — feed <Code>ts1_sessions</Code> + <Code>ts2_results</Code>.
      </p>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  Ts1SessionsSection
//----------------------------------------------------------------------------------------------
function Ts1SessionsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Staging: one row per discovered session (header info) not yet built into <Code>tse_sessions</Code> —
        source of truth from scraping, per project convention. Data fixes go here, never on{' '}
        <Code>tse_sessions</Code> directly.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}>nzbridge.co.nz, via Scrape AKBC or Scrape Tracked Players.</p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Written by whichever scrape step finds a run_id not already present in <Code>tse_sessions</Code> or{' '}
        <Code>ts1_sessions</Code>. Scrape AKBC truncates this table first (start of a new coordinated run);
        Scrape Tracked Players adds to whatever&apos;s already staged, never truncating.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Discover - club-by-date search or a tracked player&apos;s full history; <Code>batchCheckMissing</Code> excludes any run_id already in <Code>tse_sessions</Code> or <Code>ts1_sessions</Code></li>
        <li>Fetch results page - parse the header row (date, club, event name, score type, tournament code)</li>
        <li>Upsert - one row per run_id (<Code>ON CONFLICT (s1_run_id)</Code>)</li>
        <li>Empty-result cleanup - a run_id whose results page yields zero valid pair rows has its header row deleted immediately, so it never reaches Build Sessions with nothing for Build Results to ever fill in</li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}><Code>ts1_sessions</Code> itself.</p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Build Sessions</h5>
      <p className={P}>Reads rows with a non-null date, not yet in <Code>tse_sessions</Code>.</p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>Fully truncated by Scrape AKBC on every run (not incremental); Scrape Tracked Players never truncates it.</li>
        <li>A session already captured by a <em>previous</em> run — via either scrape step — is never re-fetched, since <Code>batchCheckMissing</Code> checks both <Code>tse_sessions</Code> and <Code>ts1_sessions</Code> together.</li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  Ts2ResultsSection
//----------------------------------------------------------------------------------------------
function Ts2ResultsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Staging: one row per pair per session — raw scraped score, not yet linked to a session id or
        partnership id.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}>nzbridge.co.nz, same scrape steps as <Code>ts1_sessions</Code>.</p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Written alongside <Code>ts1_sessions</Code> for the same run_id — one row per pair (two rows for a
        4-player teams event), creating any new player by name as needed.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Split <Code>player_names</Code> into one pair (2 players) or two pairs (4 players, teams event)</li>
        <li>Get-or-create each player by name in <Code>tpl_players</Code></li>
        <li>Normalize score - MP outside 25–75 defaults to 50; VP over 20 defaults to 10</li>
        <li>Upsert one row per <Code>(run_id, plid1, plid2)</Code> - plid1/plid2 stored as (min, max) of the two ids</li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}><Code>ts2_results</Code> itself; <Code>tpl_players</Code> new player rows created on demand.</p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Build Results</h5>
      <p className={P}>
        Joined to <Code>tse_sessions</Code>/<Code>ts1_sessions</Code> for date/scoring context; feeds{' '}
        <Code>tpa_partners</Code> + <Code>tre_results</Code>.
      </p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>Score is already normalized (clamped/defaulted) at scrape time here — see tre_results Rules/gotchas for the second, final clamp Build Results applies.</li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  TseSessionsSection
//----------------------------------------------------------------------------------------------
function TseSessionsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Production: one row per session. <Code>se_run_id</Code> is the NZB run_id (was{' '}
        <Code>se_source_id</Code> before a rename).
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}><Code>ts1_sessions</Code></p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Inserts one row per <Code>ts1_sessions</Code> row not already present, deriving day-of-week from
        the date and MP/VP scoring from the score type; translates a couple of legacy club-name variants
        (<Code>Auckland</Code> → <Code>Remuera Bowls &amp; Bridge Inc</Code>).
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Optional date-range filter, matching the preceding Scrape step&apos;s from/to range - an explicit safeguard, not just relying on staging-truncate timing</li>
        <li>Insert - skip rows already present (<Code>ON CONFLICT (se_run_id) DO NOTHING</Code>)</li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}><Code>tse_sessions</Code> itself.</p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Build Results</h5>
      <p className={P}>Joined for date/scoring context (<Code>se_scoring</Code>, <Code>se_date</Code>).</p>
      <h5 className={H5}>Update Stats</h5>
      <p className={P}>Joined for the <Code>se_is_summary</Code> filter and tournament-group derivation (<Code>se_tournament</Code>).</p>
      <h5 className={H5}>Home / Session detail / Rankings pages</h5>
      <p className={P}>
        Session listings — <Code>getRecentSessions</Code>/<Code>getSessionsByYear</Code>/<Code>getSessionById</Code> etc. (<Code>sessions.ts</Code>).
      </p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>One function, <Code>buildSessionsFromStaging</Code>, handles both the AKBC and Tracked Players batches — a <Code>group</Code> param picks which pipeline step (1 or 2) each run logs under.</li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  TreResultsSection
//----------------------------------------------------------------------------------------------
function TreResultsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Production: one row per player per session. <Code>re_score</Code> holds the session's value
        regardless of scoring type — clamped to 25–75 for MP, hard-capped at 999 for VP; the
        containing session's <Code>tse_sessions.se_scoring</Code> says which interpretation applies.
        <Code>re_paid</Code> links to the partnership via <Code>tpa_partners</Code>.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}><Code>ts2_results</Code> joined to <Code>tse_sessions</Code>/<Code>ts1_sessions</Code>.</p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Upserts <Code>tpa_partners</Code> for any new player pair first, then inserts one row per session
        per partnership not already in <Code>tre_results</Code>.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Upsert <Code>tpa_partners</Code> - distinct pairs from <Code>ts2_results</Code> not yet resulted, <Code>ON CONFLICT (pa_plid1, pa_plid2) DO NOTHING</Code></li>
        <li>Insert <Code>tre_results</Code> - percentage clamped 25–75 (MP) or VP capped at 999, one row per <Code>(session, partnership)</Code> via <Code>DISTINCT ON (se_seid, pa_paid)</Code></li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}><Code>tre_results</Code> itself; <Code>tpa_partners</Code> new partnership rows created as a side effect.</p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Update Stats</h5>
      <p className={P}>Aggregated by player and by partnership, per tournament group.</p>
      <h5 className={H5}>Player / session detail pages</h5>
      <p className={P}>Result listings.</p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li><Code>re_paid</Code> is NULL only transiently, mid-insert — this same function fills it in directly. &quot;Build Partner Stats&quot; doesn&apos;t exist as a separate step; the &quot;Build Partners&quot; pipeline step (step 3) is a status-only read of <Code>tpa_partners</Code> — see the tpa_partners tab&apos;s own Consumers section.</li>
        <li>Same function (<Code>buildResultsFromStaging</Code>) handles both AKBC and Tracked Players batches, same <Code>group</Code> convention as Build Sessions.</li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  TpaPartnersSection
//----------------------------------------------------------------------------------------------
function TpaPartnersSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Production: one row per distinct partnership (unordered pair of players). <Code>pa_paid</Code> is
        the id <Code>tre_results.re_paid</Code> references.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}>Upserted as a side effect of Build Results, from <Code>ts2_results</Code>.</p>

      <h4 className={H4}>Processing</h4>
      <p className={P}>No dedicated build step writes this table on its own — it&apos;s populated inline by Build Results.</p>

      <h4 className={H4}>Output</h4>
      <p className={P}><Code>tpa_partners</Code> itself.</p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Build Partners (pipeline step 3)</h5>
      <p className={P}>
        <Code>buildAllPartnerStats()</Code> (<Code>players.ts</Code>) — a single{' '}
        <Code>COUNT(*) FROM tpa_partners</Code>, no writes, no other input. Status-only: reports the
        current <Code>tpa_partners</Code> row count on the Owner &gt; Pipeline &quot;Finish&quot; tab; no
        downstream writer depends on it running. Called by both the manual{' '}
        <Code>/api/build/partners</Code> route and the full-pipeline cron.
      </p>
      <h5 className={H5}>Update Stats</h5>
      <p className={P}>Joined to <Code>tre_results</Code> for player-stats aggregation, and directly for partner-stats aggregation.</p>
      <h5 className={H5}>Player / partnership detail pages</h5>
      <p className={P}><Code>getPartnerStats</Code>/<Code>getOrCreatePartnerRow</Code> (<Code>players.ts</Code>).</p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li><Code>pa_plid1</Code>/<Code>pa_plid2</Code> ordering differs by write path — alphabetical name order via <Code>getOrCreatePartnerRow</Code>, min/max plid order via the scrape-time direct upsert — but the <Code>(pa_plid1, pa_plid2)</Code> unique constraint means only one row ever exists per unordered pair either way.</li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  UpdateStatsSection
//----------------------------------------------------------------------------------------------
function UpdateStatsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Step 4 — recomputes <Code>ta1_player_stats</Code>/<Code>ta2_partner_stats</Code> from current
        production data. Never re-imports or re-builds — a pure recompute.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}><Code>tre_results</Code> joined to <Code>tse_sessions</Code>/<Code>tpa_partners</Code>.</p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Full recompute every run (not incremental), for each of 4 tournament groups (A/B/C/all) times 2
        stat tables (player/partner) — 8 upserts total, each logged as its own pipeline sub-step.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Group derivation - <Code>TOURNAMENT_GROUP_SQL_EXPR</Code>: last character of <Code>se_tournament</Code> is <Code>&apos;A&apos;</Code> or <Code>&apos;B&apos;</Code>, else defaults to <Code>TOURNAMENT_DEFAULT_GROUP</Code> (<Code>&apos;C&apos;</Code>)</li>
        <li>Player stats - grouped by player and scoring type (via <Code>unnest(ARRAY[pa_plid1, pa_plid2])</Code>, <Code>GROUP BY ..., se_scoring</Code>) — session count, average and stddev per scoring type present, filtered to <Code>se_is_summary IS NOT TRUE</Code></li>
        <li>Partner stats - same aggregation, grouped by <Code>re_paid</Code> directly (no unnest)</li>
        <li>Upsert - <Code>ON CONFLICT (a1_plid, a1_group, a1_scoring)</Code> / <Code>(a2_paid, a2_group, a2_scoring)</Code>, so each group can be re-run independently</li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}><Code>ta1_player_stats</Code>, <Code>ta2_partner_stats</Code>.</p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Player profile page</h5>
      <p className={P}>Group stats display (<Code>getPlayerAllGroupStats</Code>).</p>
      <h5 className={H5}>Rankings page</h5>
      <p className={P}>Per-group averages.</p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>No incremental &quot;remaining&quot; count — full recompute every run, so there&apos;s nothing to show as a backlog.</li>
        <li>The tournament-group expression lives in one shared constant, <Code>TOURNAMENT_GROUP_SQL_EXPR</Code> (<Code>src/lib/constants.ts</Code>) — never duplicated locally.</li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  Ta1PlayerStatsSection
//----------------------------------------------------------------------------------------------
function Ta1PlayerStatsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>Pre-computed player stats — one row per (player, group, scoring type): session count, average, stddev, generic across MP/VP/XIMP.</p>

      <h4 className={H4}>Input</h4>
      <p className={P}>Computed by Update Stats.</p>

      <h4 className={H4}>Output</h4>
      <p className={P}><Code>ta1_player_stats</Code> itself.</p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Player profile page</h5>
      <p className={P}><Code>getPlayerAllGroupStats</Code>.</p>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  Ta2PartnerStatsSection
//----------------------------------------------------------------------------------------------
function Ta2PartnerStatsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Pre-computed partnership stats — one row per (partnership, group, scoring type): session
        count, average, stddev, generic across MP/VP/XIMP. Up to 4 groups (A/B/C/all) × up to 3
        scoring types = up to 12 rows per partnership.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}>Computed by Update Stats.</p>

      <h4 className={H4}>Output</h4>
      <p className={P}><Code>ta2_partner_stats</Code> itself.</p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Player / partnership detail pages</h5>
      <p className={P}>
        <Code>getPartnerStats</Code> — picking a single group to display is an explicit choice, since a
        partnership can have up to 12 rows here (the same reason <Code>/owner/builddata</Code>&apos;s{' '}
        <Code>tpl</Code>/<Code>tpa</Code> tabs don&apos;t join this table in directly — see this
        project&apos;s <Code>.claude/CLAUDE.md</Code>, &quot;Build Data Viewer — design
        principle&quot;).
      </p>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  ScrapeSection — combines Scrape AKBC + Scrape Tracked Players (the diagram shows them as one
//  merged "Scrape" box). Content synthesized from what was already accurately described inside
//  ts1_sessions'/ts2_results' own Processing/Consumers text, not new facts.
//----------------------------------------------------------------------------------------------
function ScrapeSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        Two scrape steps — Scrape AKBC (club-wide, date-range driven) and Scrape Tracked Players
        (per-player, full history, no date range) — that discover and fetch session/result data
        from nzbridge.co.nz into staging.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}>
        nzbridge.co.nz — club results search (Scrape AKBC) or a tracked player&apos;s full match
        history (Scrape Tracked Players).
      </p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Written by whichever scrape step finds a run_id not already present in <Code>tse_sessions</Code>{' '}
        or <Code>ts1_sessions</Code>. Scrape AKBC truncates <Code>ts1_sessions</Code>/<Code>ts2_results</Code>{' '}
        first (start of a new coordinated run); Scrape Tracked Players adds to whatever&apos;s already
        staged, never truncating.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Discover - club-by-date search (Scrape AKBC) or a tracked player&apos;s full history (Scrape Tracked Players); <Code>batchCheckMissing</Code> excludes any run_id already in <Code>tse_sessions</Code> or <Code>ts1_sessions</Code></li>
        <li>Fetch results page - parse the header row (date, club, event name, score type, tournament code) and each pair&apos;s score</li>
        <li>Get-or-create each player by name in <Code>tpl_players</Code></li>
        <li>Upsert - one <Code>ts1_sessions</Code> row per run_id, one <Code>ts2_results</Code> row per pair (two for a 4-player teams event)</li>
        <li>Empty-result cleanup - a run_id whose results page yields zero valid pair rows has its <Code>ts1_sessions</Code> header row deleted immediately</li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}><Code>ts1_sessions</Code>, <Code>ts2_results</Code>; new <Code>tpl_players</Code> rows created on demand.</p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Build Sessions</h5>
      <p className={P}>Reads <Code>ts1_sessions</Code>.</p>
      <h5 className={H5}>Build Results</h5>
      <p className={P}>Reads <Code>ts2_results</Code>.</p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>Scrape AKBC truncates <Code>ts1_sessions</Code>/<Code>ts2_results</Code> on every run (not incremental); Scrape Tracked Players never truncates.</li>
        <li>A session already captured by a <em>previous</em> run — via either scrape step — is never re-fetched, since <Code>batchCheckMissing</Code> checks both <Code>tse_sessions</Code> and <Code>ts1_sessions</Code> together.</li>
        <li>Score is already normalized (clamped/defaulted) at scrape time — MP outside 25–75 defaults to 50; VP over 20 defaults to 10 (Build Results applies a second, final clamp later).</li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  BuildSessionsSection — synthesized from tse_sessions' own Processing/Consumers text
//----------------------------------------------------------------------------------------------
function BuildSessionsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}>
        <Code>ts1_sessions</Code> → <Code>tse_sessions</Code>. One function
        (<Code>buildSessionsFromStaging</Code>) handles both the AKBC and Tracked Players batches.
      </p>

      <h4 className={H4}>Input</h4>
      <p className={P}><Code>ts1_sessions</Code> — rows with a non-null date, not yet in <Code>tse_sessions</Code>.</p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Inserts one row per <Code>ts1_sessions</Code> row not already present, deriving day-of-week
        from the date and MP/VP scoring from the score type; translates a couple of legacy
        club-name variants (<Code>Auckland</Code> → <Code>Remuera Bowls &amp; Bridge Inc</Code>).
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Optional date-range filter, matching the preceding Scrape step&apos;s from/to range - an explicit safeguard, not just relying on staging-truncate timing</li>
        <li>Insert - skip rows already present (<Code>ON CONFLICT (se_run_id) DO NOTHING</Code>)</li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}><Code>tse_sessions</Code> itself.</p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Build Results</h5>
      <p className={P}>Joined for date/scoring context (<Code>se_scoring</Code>, <Code>se_date</Code>).</p>
      <h5 className={H5}>Update Stats</h5>
      <p className={P}>Joined for the <Code>se_is_summary</Code> filter and tournament-group derivation (<Code>se_tournament</Code>).</p>
      <h5 className={H5}>Home / Session detail / Rankings pages</h5>
      <p className={P}>Session listings.</p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li>A <Code>group</Code> param picks which pipeline step (1 or 2) each run logs under.</li>
      </ul>
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  BuildResultsSection — synthesized from tre_results' own Processing/Consumers text
//----------------------------------------------------------------------------------------------
function BuildResultsSection() {
  return (
    <div>
      <h4 className={H4}>Purpose</h4>
      <p className={P}><Code>ts2_results</Code> → <Code>tre_results</Code> + <Code>tpa_partners</Code>.</p>

      <h4 className={H4}>Input</h4>
      <p className={P}><Code>ts2_results</Code> joined to <Code>tse_sessions</Code>/<Code>ts1_sessions</Code>.</p>

      <h4 className={H4}>Processing</h4>
      <h5 className={H5}>Summary</h5>
      <p className={P}>
        Upserts <Code>tpa_partners</Code> for any new player pair first, then inserts one row per
        session per partnership not already in <Code>tre_results</Code>.
      </p>
      <h5 className={H5}>Details</h5>
      <ol className={OL}>
        <li>Upsert <Code>tpa_partners</Code> - distinct pairs from <Code>ts2_results</Code> not yet resulted, <Code>ON CONFLICT (pa_plid1, pa_plid2) DO NOTHING</Code></li>
        <li>Insert <Code>tre_results</Code> - percentage clamped 25–75 (MP) or VP capped at 999, one row per <Code>(session, partnership)</Code> via <Code>DISTINCT ON (se_seid, pa_paid)</Code></li>
      </ol>

      <h4 className={H4}>Output</h4>
      <p className={P}><Code>tre_results</Code> itself; <Code>tpa_partners</Code> new partnership rows created as a side effect.</p>

      <h4 className={H4}>Consumers</h4>
      <h5 className={H5}>Build Partners (pipeline step 3)</h5>
      <p className={P}>Status-only read of <Code>tpa_partners</Code> — a single <Code>COUNT(*)</Code>, no writes.</p>
      <h5 className={H5}>Update Stats</h5>
      <p className={P}>Aggregated by player and by partnership, per tournament group.</p>
      <h5 className={H5}>Player / session detail pages</h5>
      <p className={P}>Result listings.</p>

      <h4 className={H4}>Rules/gotchas</h4>
      <ul className={UL}>
        <li><Code>re_paid</Code> is filled in directly by this same function — there&apos;s no separate &quot;Build Partner Stats&quot; step.</li>
        <li>Same function (<Code>buildResultsFromStaging</Code>) handles both AKBC and Tracked Players batches, same <Code>group</Code> convention as Build Sessions.</li>
      </ul>
    </div>
  )
}

export type DataflowSection = { id: string; label: string; content: ReactNode }

export const PROCESS_SECTIONS: DataflowSection[] = [
  { id: 'scrape',         label: 'Scrape',         content: <ScrapeSection /> },
  { id: 'build_sessions', label: 'Build Sessions', content: <BuildSessionsSection /> },
  { id: 'build_results',  label: 'Build Results',  content: <BuildResultsSection /> },
  { id: 'update_stats',   label: 'Update Stats',   content: <UpdateStatsSection /> },
]

export const TABLE_SECTIONS: DataflowSection[] = [
  { id: 'nzbridge',     label: 'nzbridge.co.nz',     content: <NzbridgeSection /> },
  { id: 'ts1_sessions', label: 'ts1_sessions',       content: <Ts1SessionsSection /> },
  { id: 'ts2_results',  label: 'ts2_results',        content: <Ts2ResultsSection /> },
  { id: 'tse_sessions', label: 'tse_sessions',       content: <TseSessionsSection /> },
  { id: 'tre_results',  label: 'tre_results',        content: <TreResultsSection /> },
  { id: 'tpa_partners', label: 'tpa_partners',       content: <TpaPartnersSection /> },
  { id: 'ta1_player_stats',  label: 'ta1_player_stats',  content: <Ta1PlayerStatsSection /> },
  { id: 'ta2_partner_stats', label: 'ta2_partner_stats', content: <Ta2PartnerStatsSection /> },
]
