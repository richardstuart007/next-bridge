//==============================================================================================
//  1) DESCRIPTION
//    ConstantsPage — the /owner Constants tab. Assembles hardwired display data for every
//    constants.ts export (CONSTANTS_SECTIONS), the relevant .env vars (envSections), and a
//    per-consumer function-description map (FUNCTION_DESCRIPTIONS), then hands them to
//    ConstantsViewer for a read-only tabbed display.
//
//  2) NOTES
//    CONSTANTS_SECTIONS / FUNCTION_DESCRIPTIONS are hand-maintained — add an entry here
//    whenever a constant or a `consumers` reference is added.
//==============================================================================================

import ConstantsViewer, { ConstantSection } from '@/src/ui/owner/ConstantsViewer'
import {
  ROBOT_PLAYER_NAME,
  SCRAPE_DEFAULT_TO_DATE_WINDOW_DAYS,
  BACK_KEY,
  TOURNAMENT_GROUPS,
  TOURNAMENT_DEFAULT_GROUP,
  TOURNAMENT_GROUP_SQL_EXPR,
  BRIDGE_CLUB_ID,
  FETCH_TIMEOUT_MS,
  SCRAPE_MAX_DURATION_SECONDS,
  SCRAPE_FALLBACK_LOOKBACK_DAYS,
  TRACKED_SCRAPE_BATCH_SIZE,
  MP_PERCENTAGE_MIN,
  MP_PERCENTAGE_MAX,
  VP_SCORE_SANITY_MAX,
  VP_SCORE_SANITY_RESET,
  VP_SCORE_HARD_CAP,
  PLAYER_SEARCH_LIMIT,
  PLAYER_SEARCH_ALL_LIMIT,
  PIPELINE_RECENT_RUN_IDS_LIMIT,
  PIPELINE_RUN_POLL_MS,
  EARLIEST_DATA_DATE,
  CHART_TOP_N_PRESELECTED,
  ROWS_PER_PAGE,
  VALUE_DISPLAY_MAX_LENGTH,
  MIN_RANKING_SESSIONS_MP,
  MIN_RANKING_SESSIONS_VP,
  MIN_RANKING_SESSIONS_XIMP,
  MIN_RANKING_SESSIONS_PARTNER_MP,
  MIN_RANKING_SESSIONS_PARTNER_VP,
  MIN_RANKING_SESSIONS_PARTNER_XIMP,
  WIDTH_RANK,
  WIDTH_GRADE,
  WIDTH_CLUB,
  WIDTH_DAY_OF_WEEK,
  WIDTH_TOURNAMENT_TYPE,
  WIDTH_SCORING,
  WIDTH_SESSIONS_MIN,
  WIDTH_TOURNAMENT_NAME,
  WIDTH_NZB,
  WIDTH_PAID,
  WIDTH_NAME,
  WIDTH_TRACKED,
  WIDTH_RATING_MIN,
  WIDTH_A_POINTS_MIN,
  WIDTH_DATE,
  WIDTH_IS_SUMMARY,
  WIDTH_PLID,
  WIDTH_SEID,
  WIDTH_RUN_ID,
  WIDTH_EVENT_TYPE
} from '@/src/lib/constants'

//----------------------------------------------------------------------------------
//  CONSTANTS_SECTIONS — hardwired display data for every constants.ts export;
//  add an entry here whenever a new constant is added to constants.ts.
//----------------------------------------------------------------------------------
const CONSTANTS_SECTIONS: ConstantSection[] = [
  {
    heading: 'Scrape / Club',
    entries: [
      { name: 'BRIDGE_CLUB_ID', value: BRIDGE_CLUB_ID, description: 'NZB club id for AKBC — filters nzbridge.co.nz results pages to this club during discovery/scrape.', consumers: ['pipelineScrape.ts: scrapeClubSessions', 'scrape/discover/nzb-by-date/route.ts: POST', 'scrape/raw/nzb-by-date/route.ts: POST', 'PipelineTable.tsx: PipelineTable'] },
      { name: 'FETCH_TIMEOUT_MS', value: FETCH_TIMEOUT_MS, description: "Abort timeout for a single scrape HTML fetch. Default for the Pipeline page's 'Fetch timeout (s)' input; overrideable per run via ?fetch_timeout_ms=.", consumers: ['fetchHtml.ts: fetchWithTimeout', 'pipelineScrape.ts: fetchWithTimeout', 'PipelineTable.tsx: PipelineTable'] },
      { name: 'SCRAPE_MAX_DURATION_SECONDS', value: SCRAPE_MAX_DURATION_SECONDS, description: 'Canonical value for the hard Vercel `export const maxDuration` on the long-running pipeline routes (scrape, scrape-tracked, stats, cron/update-sessions). Next.js route config must be a literal, so each route writes `= 300` directly and keeps it in sync with this — no code imports it.', consumers: [] },
      { name: 'SCRAPE_FALLBACK_LOOKBACK_DAYS', value: SCRAPE_FALLBACK_LOOKBACK_DAYS, description: "Days back the automatic scrape 'From' date falls back to when no session has ever been built yet.", consumers: ['pipelineScrape.ts: getDateRange'] },
      { name: 'TRACKED_SCRAPE_BATCH_SIZE', value: TRACKED_SCRAPE_BATCH_SIZE, description: 'How many tracked players one /api/build/scrape-tracked-batch cron job handles (?batch=N → LIMIT this OFFSET N*this on the pl_name-ordered tracked list).', consumers: ['pipelineScrape.ts: scrapeTrackedPlayerSessions'] },
      { name: 'SCRAPE_DEFAULT_TO_DATE_WINDOW_DAYS', value: SCRAPE_DEFAULT_TO_DATE_WINDOW_DAYS, description: '(Currently unused — the Pipeline page’s shared "To date" is now opt-in with no default. Retained for possible reuse.)', consumers: [] }
    ]
  },
  {
    heading: 'Score Normalization',
    entries: [
      { name: 'MP_PERCENTAGE_MIN', value: MP_PERCENTAGE_MIN, description: 'MP percentage clamp lower bound — a raw scraped score below this is treated as unreliable. Used both at scrape time and again at build time.', consumers: ['pipelineScrape.ts: normaliseScore', 'scrape/raw/nzb-by-date/route.ts: normaliseScore', 'buildSteps.ts: buildResultsFromStaging'] },
      { name: 'MP_PERCENTAGE_MAX', value: MP_PERCENTAGE_MAX, description: 'MP percentage clamp upper bound — same treatment as MP_PERCENTAGE_MIN.', consumers: ['pipelineScrape.ts: normaliseScore', 'scrape/raw/nzb-by-date/route.ts: normaliseScore', 'buildSteps.ts: buildResultsFromStaging'] },
      { name: 'VP_SCORE_SANITY_MAX', value: VP_SCORE_SANITY_MAX, description: 'VP score sanity check at scrape time — a raw VP value above this is treated as a parse error and reset.', consumers: ['pipelineScrape.ts: normaliseScore', 'scrape/raw/nzb-by-date/route.ts: normaliseScore'] },
      { name: 'VP_SCORE_SANITY_RESET', value: VP_SCORE_SANITY_RESET, description: 'The value a failed VP sanity check (VP_SCORE_SANITY_MAX) resets to.', consumers: ['pipelineScrape.ts: normaliseScore', 'scrape/raw/nzb-by-date/route.ts: normaliseScore'] },
      { name: 'VP_SCORE_HARD_CAP', value: VP_SCORE_HARD_CAP, description: 'Hard ceiling applied to any VP score at build time, regardless of the scrape-stage sanity check above.', consumers: ['buildSteps.ts: buildResultsFromStaging'] }
    ]
  },
  {
    heading: 'Tournament Groups',
    entries: [
      { name: 'TOURNAMENT_GROUPS', value: TOURNAMENT_GROUPS, description: "Tournament group codes — derived from the last character of se_tournament.", consumers: ['BuildDataViewer.tsx: SessionsTab', 'stats.ts: rebuildAllStats'] },
      { name: 'TOURNAMENT_DEFAULT_GROUP', value: TOURNAMENT_DEFAULT_GROUP, description: "Fallback tournament group for every se_tournament value not ending in 'A' or 'B'.", consumers: ['src/lib/constants.ts (module scope)'] },
      { name: 'TOURNAMENT_GROUP_SQL_EXPR', value: TOURNAMENT_GROUP_SQL_EXPR, description: "Shared SQL CASE expression deriving a session's tournament group, kept in one place instead of duplicated per file.", consumers: ['PipelineTable.tsx: playerStatsSql, partnerStatsSql', 'statsCompute.ts: computePlayerGroupStats, computePartnerGroupStats'] }
    ]
  },
  {
    heading: 'Player Search & Identity',
    entries: [
      { name: 'PLAYER_SEARCH_LIMIT', value: PLAYER_SEARCH_LIMIT, description: 'Row cap for the tracked/nz-number player search.', consumers: ['players.ts: searchPlayers'] },
      { name: 'PLAYER_SEARCH_ALL_LIMIT', value: PLAYER_SEARCH_ALL_LIMIT, description: 'Row cap for the all-players (including untracked) search.', consumers: ['players.ts: searchAllPlayers'] },
      { name: 'ROBOT_PLAYER_NAME', value: ROBOT_PLAYER_NAME, description: "Placeholder partner name used when a session row has only one real player (paired with 'Robot').", consumers: ['nzb-from-ts1sessions/route.ts: getRobotPlid, POST'] }
    ]
  },
  {
    heading: 'Pipeline',
    entries: [
      { name: 'PIPELINE_RECENT_RUN_IDS_LIMIT', value: PIPELINE_RECENT_RUN_IDS_LIMIT, description: "Number of most-recent run_ids offered in the Pipeline page's run-id picker.", consumers: ['pipelineLog.ts: getRecentRunIds'] },
      { name: 'PIPELINE_RUN_POLL_MS', value: PIPELINE_RUN_POLL_MS, description: "How often (ms) the Pipeline Overview reloads its Jobs summary while a 'Run All Cron' request is in flight, so the new run_id and each completing step show live.", consumers: ['PipelineTable.tsx: PipelineTable'] }
    ]
  },
  {
    heading: 'Rankings',
    entries: [
      { name: 'MIN_RANKING_SESSIONS_MP', value: MIN_RANKING_SESSIONS_MP, description: 'Minimum MP sessions a player needs for a real precomputed rank (a1_avg_rank/a1_group_total/a1_pct_rank) — below this the rank is NULL rather than a number skewed by a small sample.', consumers: ['statsCompute.ts: computePlayerGroupStats', 'RankingsPageClient.tsx: RankingsPageClient'] },
      { name: 'MIN_RANKING_SESSIONS_VP', value: MIN_RANKING_SESSIONS_VP, description: 'Same as MIN_RANKING_SESSIONS_MP, for VP scoring.', consumers: ['statsCompute.ts: computePlayerGroupStats', 'RankingsPageClient.tsx: RankingsPageClient'] },
      { name: 'MIN_RANKING_SESSIONS_XIMP', value: MIN_RANKING_SESSIONS_XIMP, description: 'Same as MIN_RANKING_SESSIONS_MP, for XIMP scoring — much lower since XIMP sessions are far rarer than MP/VP.', consumers: ['statsCompute.ts: computePlayerGroupStats', 'RankingsPageClient.tsx: RankingsPageClient'] },
      { name: 'MIN_RANKING_SESSIONS_PARTNER_MP', value: MIN_RANKING_SESSIONS_PARTNER_MP, description: 'Minimum MP sessions a partnership needs for a real precomputed rank (a2_avg_rank/a2_group_total) — separate, much lower floor than the player version, since a partnership only gains a session when the same two people play together.', consumers: ['statsCompute.ts: computePartnerGroupStats', 'RankingsPageClient.tsx: RankingsPageClient'] },
      { name: 'MIN_RANKING_SESSIONS_PARTNER_VP', value: MIN_RANKING_SESSIONS_PARTNER_VP, description: 'Same as MIN_RANKING_SESSIONS_PARTNER_MP, for VP scoring.', consumers: ['statsCompute.ts: computePartnerGroupStats', 'RankingsPageClient.tsx: RankingsPageClient'] },
      { name: 'MIN_RANKING_SESSIONS_PARTNER_XIMP', value: MIN_RANKING_SESSIONS_PARTNER_XIMP, description: 'Same as MIN_RANKING_SESSIONS_PARTNER_MP, for XIMP scoring.', consumers: ['statsCompute.ts: computePartnerGroupStats', 'RankingsPageClient.tsx: RankingsPageClient'] }
    ]
  },
  {
    heading: 'Widths',
    entries: [
      { name: 'WIDTH_RANK', value: WIDTH_RANK, description: 'Shared trigger width for the rk_rank filter dropdown (RankSelect) — one DD item, one width, wherever a rank filter appears.', consumers: ['PlayersAdmin.tsx: PlayersAdmin', 'HomePageClient.tsx: HomePageClient', 'LookupSelects.tsx: RankSelect'] },
      { name: 'WIDTH_GRADE', value: WIDTH_GRADE, description: 'Shared trigger width for the gr_grade filter dropdown (GradeSelect).', consumers: ['HomePageClient.tsx: HomePageClient', 'LookupSelects.tsx: GradeSelect'] },
      { name: 'WIDTH_CLUB', value: WIDTH_CLUB, description: 'Shared trigger width for the cl_club/pl_club/se_club filter dropdown (ClubSelect) — same DD item across every table it appears on.', consumers: ['PlayersAdmin.tsx: PlayersAdmin', 'HomePageClient.tsx: HomePageClient', 'PartnersTable.tsx: PartnersTable', 'PlayerPageClient.tsx: PlayerPageClient', 'LookupSelects.tsx: ClubSelect'] },
      { name: 'WIDTH_DAY_OF_WEEK', value: WIDTH_DAY_OF_WEEK, description: 'Shared width for the se_day_of_week filter (multi-select on Home, single-select FilterDayOfWeek elsewhere).', consumers: ['HomePageClient.tsx: HomePageClient', 'PartnersTable.tsx: PartnersTable', 'PlayerPageClient.tsx: PlayerPageClient', 'FilterDayOfWeek.tsx: FilterDayOfWeek'] },
      { name: 'WIDTH_TOURNAMENT_TYPE', value: WIDTH_TOURNAMENT_TYPE, description: 'Shared width for the tournament-group (A/B/C) filter/toggle — one value applied everywhere it appears, per explicit confirmation that a shared width change may affect multiple pages at once.', consumers: ['HomePageClient.tsx: HomePageClient', 'PartnersTable.tsx: PartnersTable', 'PlayerPageClient.tsx: PlayerPageClient', 'RankingsPageClient.tsx: RankingsPageClient'] },
      { name: 'WIDTH_SCORING', value: WIDTH_SCORING, description: 'Shared width for the se_scoring filter/toggle (ScoringTypeSelect/ScoringTypeToggle).', consumers: ['HomePageClient.tsx: HomePageClient', 'PartnersTable.tsx: PartnersTable', 'PlayerPageClient.tsx: PlayerPageClient', 'RankingsPageClient.tsx: RankingsPageClient', 'ScoringTypeSelects.tsx: ScoringTypeSelect'] },
      { name: 'WIDTH_SESSIONS_MIN', value: WIDTH_SESSIONS_MIN, description: "Shared width for a minimum-sessions filter/dropdown (Home's sessions-min filter, Rankings' Top-N/min-sessions select).", consumers: ['HomePageClient.tsx: HomePageClient', 'RankingsPageClient.tsx: RankingsPageClient'] },
      { name: 'WIDTH_TOURNAMENT_NAME', value: WIDTH_TOURNAMENT_NAME, description: 'Width for the se_tournament free-text name filter on Home.', consumers: ['HomePageClient.tsx: HomePageClient'] },
      { name: 'WIDTH_NZB', value: WIDTH_NZB, description: 'Shared width for the pl_nzb filter input, wherever an NZ Bridge number filter appears.', consumers: ['PlayersAdmin.tsx: PlayersAdmin', 'HomePageClient.tsx: HomePageClient', 'RankingsPageClient.tsx: RankingsPageClient'] },
      { name: 'WIDTH_PAID', value: WIDTH_PAID, description: 'Shared width for the pa_paid filter input on Rankings.', consumers: ['RankingsPageClient.tsx: RankingsPageClient'] },
      { name: 'WIDTH_NAME', value: WIDTH_NAME, description: 'Shared width for any *_name text filter (pl_name, se_name) via FilterName.', consumers: ['PlayersAdmin.tsx: PlayersAdmin', 'HomePageClient.tsx: HomePageClient', 'PartnersTable.tsx: PartnersTable', 'PlayerPageClient.tsx: PlayerPageClient', 'FilterName.tsx: FilterName'] },
      { name: 'WIDTH_TRACKED', value: WIDTH_TRACKED, description: 'Shared width for the pl_tracked checkbox filter cell (FilterTracked).', consumers: ['HomePageClient.tsx: HomePageClient', 'RankingsPageClient.tsx: RankingsPageClient'] },
      { name: 'WIDTH_RATING_MIN', value: WIDTH_RATING_MIN, description: "Width for Home's minimum-rating filter input.", consumers: ['HomePageClient.tsx: HomePageClient'] },
      { name: 'WIDTH_A_POINTS_MIN', value: WIDTH_A_POINTS_MIN, description: "Width for Home's minimum-A-points filter input.", consumers: ['HomePageClient.tsx: HomePageClient'] },
      { name: 'WIDTH_DATE', value: WIDTH_DATE, description: 'Shared width for a single bounded date input (FilterDate), used twice per date-range filter.', consumers: ['HomePageClient.tsx: HomePageClient', 'PartnersTable.tsx: PartnersTable', 'PlayerPageClient.tsx: PlayerPageClient', 'FilterDate.tsx: FilterDate'] },
      { name: 'WIDTH_IS_SUMMARY', value: WIDTH_IS_SUMMARY, description: 'Shared width for the se_is_summary filter (multi-select on Home, single-select FilterIsSummary elsewhere).', consumers: ['HomePageClient.tsx: HomePageClient', 'PartnersTable.tsx: PartnersTable', 'PlayerPageClient.tsx: PlayerPageClient', 'FilterIsSummary.tsx: FilterIsSummary', 'SummaryTypeSelects.tsx: SummaryTypeMultiSelect'] },
      { name: 'WIDTH_PLID', value: WIDTH_PLID, description: 'Shared width for the pl_plid player-picker multi-select (FilterPlid).', consumers: ['PartnersTable.tsx: PartnersTable', 'PlayerPageClient.tsx: PlayerPageClient', 'FilterPlid.tsx: FilterPlid'] },
      { name: 'WIDTH_SEID', value: WIDTH_SEID, description: 'Width for the internal se_seid primary-key filter (FilterSeid) — distinct from WIDTH_RUN_ID, the externally-visible run_id.', consumers: ['FilterSeid.tsx: FilterSeid'] },
      { name: 'WIDTH_RUN_ID', value: WIDTH_RUN_ID, description: 'Shared width for the se_run_id/s1_run_id business-key filter (FilterRunId).', consumers: ['HomePageClient.tsx: HomePageClient', 'PartnersTable.tsx: PartnersTable', 'PlayerPageClient.tsx: PlayerPageClient', 'FilterRunId.tsx: FilterRunId'] },
      { name: 'WIDTH_EVENT_TYPE', value: WIDTH_EVENT_TYPE, description: 'Shared width for the et_event_type filter dropdown (EventTypeSelect).', consumers: ['PartnersTable.tsx: PartnersTable', 'PlayerPageClient.tsx: PlayerPageClient', 'LookupSelects.tsx: EventTypeSelect'] }
    ]
  },
  {
    heading: 'UI Display & Navigation',
    entries: [
      { name: 'BACK_KEY', value: BACK_KEY, description: "sessionStorage key (via nextjs-shared's saveBackNav/useBackNav) capturing the page the user navigated from, right before entering /session/[id] or /player/[id], so those pages can render a 'back to where you came from' link via MyBackHomeNav.", consumers: ['HomePageClient.tsx: HomePageClient', 'PlayerPageClient.tsx: PlayerPageClient', 'RankingsPageClient.tsx: RankingsPageClient', 'PerformanceChart.tsx: PerformanceChart', 'SessionPageClient.tsx: SessionPageClient', 'PartnersTable.tsx: PartnersTable', 'PartnersChart.tsx: PartnersChart', 'PlayersAdmin.tsx: PlayersAdmin'] },
      { name: 'EARLIEST_DATA_DATE', value: EARLIEST_DATA_DATE, description: "Earliest date the app's data begins — the min bound on every session/result date picker.", consumers: ['HomePageClient.tsx: HomePageClient', 'PartnersTable.tsx: PartnersTable', 'PlayerPageClient.tsx: PlayerPageClient'] },
      { name: 'CHART_TOP_N_PRESELECTED', value: CHART_TOP_N_PRESELECTED, description: 'Number of series pre-selected by default on the Partners/Performance charts.', consumers: ['PartnersChart.tsx: PartnersChart', 'PerformanceChart.tsx: PerformanceChart'] },
      { name: 'ROWS_PER_PAGE', value: ROWS_PER_PAGE, description: 'Default page size for client-side paginated tables across the app.', consumers: ['HomePageClient.tsx: HomePageClient', 'SessionPageClient.tsx: SessionPageClient', 'PartnersTable.tsx: PartnersTable', 'DataTableShared.tsx: DataTable', 'PlayerPageClient.tsx: PlayerPageClient'] },
      { name: 'VALUE_DISPLAY_MAX_LENGTH', value: VALUE_DISPLAY_MAX_LENGTH, description: "Value strings longer than this (or any object/array) render behind this page's Show popover button instead of inline.", consumers: ['ConstantsViewer.tsx: renderValue'] }
    ]
  }
]

//----------------------------------------------------------------------------------
//  FUNCTION_DESCRIPTIONS — one-line description per function/module-scope reference shown in
//  the Functions tab, keyed by the exact resolved reference string buildFunctionIndex produces.
//  Add an entry here whenever a new consumers reference is introduced above.
//----------------------------------------------------------------------------------
const FUNCTION_DESCRIPTIONS: Record<string, string> = {
  'pipelineScrape.ts: scrapeClubSessions': 'Step 1 (AKBC): discovers and scrapes AKBC club sessions since the last-built session date, writing ts1_sessions + ts2_results.',
  'scrape/discover/nzb-by-date/route.ts: POST': 'Legacy manual route: finds missing run_ids for a given club/date range and writes them to ts1_sessions.',
  'scrape/raw/nzb-by-date/route.ts: POST': 'Legacy manual route: scrapes a club/date range directly from nzbridge.co.nz into ts2_results.',
  'PipelineTable.tsx: PipelineTable': 'Owner Pipeline page — runs and monitors every pipeline step (AKBC scrape, tracked players, build partners, update stats).',
  'fetchHtml.ts: fetchWithTimeout': 'Fetches a URL with an abort timeout, used by the legacy scrape HTML requests.',
  'pipelineScrape.ts: fetchWithTimeout': "The pipeline scrape's own abort-timeout fetch wrapper (default FETCH_TIMEOUT_MS, overrideable per run), used for every discovery page and run_id results page.",
  'pipelineScrape.ts: scrapeTrackedPlayerSessions': "Step 2 (Tracked Players): scrapes every flagged tracked player's history into ts1_sessions + ts2_results; honours the shared To-date, soft time budget, and fetch timeout.",
  'pipelineScrape.ts: getDateRange': "Resolves the scrape step's From/To date range, falling back to the automatic MAX(se_date) or a fixed lookback when no sessions exist yet.",
  'PipelineTable.tsx: doRefreshAll': "Refreshes every step's status counts and defaults the AKBC 'From' date input when empty.",
  'pipelineScrape.ts: normaliseScore': 'Clamps/resets an out-of-range raw scraped score before it is written to ts2_results.',
  'scrape/raw/nzb-by-date/route.ts: normaliseScore': "Legacy route's own copy of the same score sanity-check logic.",
  'buildSteps.ts: buildResultsFromStaging': 'ts2_results → tpa_partners + tre_results — clamps/caps re_score on insert.',
  'BuildDataViewer.tsx: SessionsTab': 'Build Data Viewer tab showing raw tse_sessions rows, filterable by tournament group.',
  'stats.ts: rebuildAllStats': 'Full recompute of ta1_player_stats/ta2_partner_stats for every tournament group plus "all".',
  'src/lib/constants.ts (module scope)': "Used to build TOURNAMENT_GROUP_SQL_EXPR's fallback branch.",
  'PipelineTable.tsx: playerStatsSql': "Builds the per-group ta1_player_stats upsert SQL shown in the Pipeline page's SQL popovers.",
  'PipelineTable.tsx: partnerStatsSql': "Builds the per-group ta2_partner_stats upsert SQL shown in the Pipeline page's SQL popovers.",
  'statsCompute.ts: computePlayerGroupStats': "(Re)computes ta1_player_stats for one tournament group or 'all'.",
  'statsCompute.ts: computePartnerGroupStats': "(Re)computes ta2_partner_stats for one tournament group or 'all'.",
  'players.ts: searchPlayers': 'Searches tracked players (with an NZ Bridge number) by name.',
  'players.ts: searchAllPlayers': 'Searches all players by name, including untracked ones.',
  'nzb-from-ts1sessions/route.ts: getRobotPlid': 'Looks up or creates the Robot placeholder player row.',
  'nzb-from-ts1sessions/route.ts: POST': 'Legacy manual route: scrapes ts1_sessions rows into ts2_results, pairing solo players with Robot.',
  'pipelineLog.ts: getRecentRunIds': 'Returns the most recent distinct run_ids from tpip_pipelinelog, most recent first.',
  'HomePageClient.tsx: HomePageClient': 'Home page — filterable list of recent sessions and players.',
  'PlayerPageClient.tsx: PlayerPageClient': "A player's profile page — results, partners, and performance charts.",
  'RankingsPageClient.tsx: RankingsPageClient': 'Rankings page — sortable/filterable leaderboard of player stats.',
  'PerformanceChart.tsx: PerformanceChart': "Line chart of a player's performance over time, with selectable comparison series.",
  'SessionPageClient.tsx: SessionPageClient': "A single session's results page.",
  'PartnersTable.tsx: PartnersTable': "A player's partnership history table.",
  'PartnersChart.tsx: PartnersChart': "Line chart of a player's results by partner, with selectable comparison series.",
  'PlayersAdmin.tsx: PlayersAdmin': 'Owner Players page — manage which players are tracked.',
  'DataTableShared.tsx: DataTable': "Shared paginated/filterable table renderer used across the Build Data Viewer's tabs.",
  'ConstantsViewer.tsx: renderValue': "Renders a constant's value inline, or behind a Show popover if it's an object or exceeds the display length limit.",
  'nextjs-shared/src/tables/db.ts: createDbQueryHandler': 'Builds the shared Postgres query handler (Neon pool or local Client) once per warm instance.',
  'nextjs-shared/next.config.mjs (module scope)': 'Next.js config exposing POSTGRES_URL and POSTGRES_DATABASE_LOCATION as env vars.',
  'layout.tsx: RootLayout': 'Root Next.js layout — sets up fonts, metadata, and the dev header.',
  'nextjs-shared/src/UI/OwnerLayout.tsx: OwnerLayout': 'Dev-only guard layout wrapping every /owner page — redirects away in non-dev environments.',
  'api/build/scrape/route.ts: checkCronAuth': 'Checks the CRON_SECRET bearer token, bypassed in dev.',
  'api/cron/update-sessions/route.ts: checkCronAuth': "Checks the CRON_SECRET bearer token, bypassed in dev — same shape as the scrape route's own check.",
  'nextjs-shared/src/tables/tableGeneric/write_logging.ts: write_logging': 'Inserts an application log row into xlg_logging (or falls back to console output).',
  'LookupSelects.tsx: RankSelect': 'Lookup-backed rk_rank multi-select, self-loading its options from trk_ranks.',
  'LookupSelects.tsx: GradeSelect': 'Lookup-backed gr_grade multi-select, self-loading its options from tgr_grades.',
  'LookupSelects.tsx: ClubSelect': 'Lookup-backed cl_club multi-select, self-loading its options from tcl_clubs.',
  'LookupSelects.tsx: EventTypeSelect': 'Lookup-backed et_event_type multi-select, self-loading its options from tet_event_types.',
  'FilterDayOfWeek.tsx: FilterDayOfWeek': 'Single-value se_day_of_week dropdown filter.',
  'FilterName.tsx: FilterName': 'Compact text filter for any *_name column.',
  'FilterDate.tsx: FilterDate': 'Single bounded date input, used twice per date-range filter.',
  'FilterIsSummary.tsx: FilterIsSummary': 'Single-value se_is_summary dropdown filter.',
  'FilterPlid.tsx: FilterPlid': 'Multi-select dropdown over a list of players by pl_plid.',
  'FilterSeid.tsx: FilterSeid': 'Partial-match filter for the internal se_seid primary key.',
  'FilterRunId.tsx: FilterRunId': 'Partial-match filter for the externally-visible se_run_id/s1_run_id business key.',
  'ScoringTypeSelects.tsx: ScoringTypeSelect': 'Single-value se_scoring dropdown filter, with an optional "all" option.',
  'SummaryTypeSelects.tsx: SummaryTypeMultiSelect': "Multi-select se_is_summary filter (Home Sessions tab's Summary filter)."
}

export default function ConstantsPage() {
  const envSections: ConstantSection[] = [
    {
      heading: 'Database',
      entries: [
        { name: 'POSTGRES_URL', value: process.env.POSTGRES_URL, description: 'Full Postgres connection string — the only DB var actually read by the app.', consumers: ['nextjs-shared/src/tables/db.ts: createDbQueryHandler', 'nextjs-shared/next.config.mjs (module scope)'] },
        { name: 'POSTGRES_DATABASE_LOCATION', value: process.env.POSTGRES_DATABASE_LOCATION, description: 'Human-readable environment label (local/dev/prod) shown in the app header.', consumers: ['layout.tsx: RootLayout'] }
      ]
    },
    {
      heading: 'Application Environment',
      entries: [
        { name: 'NEXT_PUBLIC_APPENV_ISDEV', value: process.env.NEXT_PUBLIC_APPENV_ISDEV, description: 'Marks this environment as dev; gates every /owner route and is read by the app header.', consumers: ['layout.tsx: RootLayout', 'nextjs-shared/src/UI/OwnerLayout.tsx: OwnerLayout', 'api/build/scrape/route.ts: checkCronAuth', 'api/cron/update-sessions/route.ts: checkCronAuth'] },
        { name: 'NEXT_PUBLIC_APPENV_DBHANDLER', value: process.env.NEXT_PUBLIC_APPENV_DBHANDLER, description: 'Selects the DB connection handler in nextjs-shared.', consumers: ['nextjs-shared/src/tables/db.ts: createDbQueryHandler'] },
        { name: 'NEXT_PUBLIC_APPENV_LOG_I', value: process.env.NEXT_PUBLIC_APPENV_LOG_I, description: 'Enables/disables Info-level logging.', consumers: ['nextjs-shared/src/tables/tableGeneric/write_logging.ts: write_logging'] },
        { name: 'CRON_SECRET', value: process.env.CRON_SECRET, description: "Shared secret required by the pipeline's first scrape step and the full-pipeline cron fallback for the external Vercel-scheduled trigger.", consumers: ['api/build/scrape/route.ts: checkCronAuth', 'api/cron/update-sessions/route.ts: checkCronAuth'] }
      ]
    }
  ]

  return <ConstantsViewer constantsSections={CONSTANTS_SECTIONS} envSections={envSections} functionDescriptions={FUNCTION_DESCRIPTIONS} />
}
