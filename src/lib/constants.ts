import { SessionStorageKeyPrefix } from 'nextjs-shared/constants'

export const ROBOT_PLAYER_NAME = 'Robot'

//
//  This project's own sessionStorage sub-prefix, per nextjs-shared/CONSUMING_PROJECTS.md's
//  "Session Storage tab" section — every key this project writes directly (not via
//  useBackNav/saveBackNav, which already prefix under nextjs-shared's own rs7_shr_) must start
//  with this so /owner's Session Storage tab picks it up, and so it can never collide with a
//  key another project or nextjs-shared itself writes in the same browser origin.
//
export const SESSION_STORAGE_PREFIX = `${SessionStorageKeyPrefix}br_`

//
//  Default span (in days) the Pipeline page's "To" date defaults to, ahead of the
//  automatic "From" date — a starting point for the incremental catch-up workflow,
//  which you then advance forward each run
//
export const SCRAPE_DEFAULT_TO_DATE_WINDOW_DAYS = 7

//
//  sessionStorage key (via nextjs-shared's saveBackNav/useBackNav): captures the page the user
//  navigated from, right before entering /session/[id] or /player/[id], so those pages can
//  render a real "back to where you came from" link via MyBackHomeNav
//
export const BACK_KEY = 'back_key_next_bridge'

//
//  Tournament group classification — derived from the last character of se_tournament: 'A' or
//  'B' if it ends in that letter, otherwise TOURNAMENT_DEFAULT_GROUP ('C', the fallback for
//  every other value). This default-to-'C' behavior is a pre-existing decision, surfaced here as
//  a named constant (rather than a literal typed inline) so it's visible during a constants
//  review, and shared from one place instead of being duplicated verbatim across files.
//
export const TOURNAMENT_GROUPS = ['A', 'B', 'C'] as const
export const TOURNAMENT_DEFAULT_GROUP: (typeof TOURNAMENT_GROUPS)[number] = 'C'
export const TOURNAMENT_GROUP_SQL_EXPR =
  `CASE WHEN RIGHT(se_tournament,1)='A' THEN 'A' WHEN RIGHT(se_tournament,1)='B' THEN 'B' ELSE '${TOURNAMENT_DEFAULT_GROUP}' END`

//
//  NZB club id for AKBC (the primary club this project scrapes) — used to filter
//  nzbridge.co.nz results pages by club during the AKBC scrape step
//
export const BRIDGE_CLUB_ID = 106

//
//  Request timeout for a single scrape HTML fetch before aborting. Used by fetchHtml.ts and by
//  the pipeline scrape's own fetchWithTimeout. Overrideable per run via ?fetch_timeout_ms=
//
export const FETCH_TIMEOUT_MS = 15_000

//
//  Hard per-invocation ceiling (Vercel `export const maxDuration`, seconds) for the long-running
//  pipeline routes — scrape, scrape-tracked, stats, cron/update-sessions. 300 is Vercel Pro's max
//  on the default runtime without Fluid Compute. Deploy-time only, not runtime-overrideable.
//  Canonical value / documentation: Next.js route segment config must be a literal, so each route
//  writes `export const maxDuration = 300` directly and keeps it in sync with this.
//
export const SCRAPE_MAX_DURATION_SECONDS = 300

//
//  When no session has ever been built yet, how many days back the automatic "From" date
//  falls back to (getDateRange's fallback when tse_sessions is empty)
//
export const SCRAPE_FALLBACK_LOOKBACK_DAYS = 30

//
//  How many tracked players one /api/build/scrape-tracked-batch cron job handles
//  (?batch=N → LIMIT this OFFSET N*this on the pl_name-ordered tracked list)
//
export const TRACKED_SCRAPE_BATCH_SIZE = 5

//
//  MP percentage clamp bounds — a raw scraped score outside this range is treated as
//  unreliable and clamped/reset. Used both at scrape time (normaliseScore) and again at
//  build time (buildSteps.ts's SQL clamp on re_score)
//
export const MP_PERCENTAGE_MIN = 25
export const MP_PERCENTAGE_MAX = 75

//
//  VP score sanity check — a raw VP value above this is treated as a parse error and reset
//  to VP_SCORE_SANITY_RESET (normaliseScore, scrape stage)
//
export const VP_SCORE_SANITY_MAX = 20
export const VP_SCORE_SANITY_RESET = 10

//
//  Hard ceiling applied to any VP score at build time (buildSteps.ts's SQL), regardless of
//  the scrape-stage sanity check above
//
export const VP_SCORE_HARD_CAP = 999

//
//  Sentinel s1_score_type/se_scoring value for a scraped score whose suffix isn't a recognized
//  type (PCT/VP/XIMP). Used instead of silently dropping the row (pipelineScrape.ts's
//  parseScore), so a session with an unhandled scoring format still lands in
//  ts1_sessions/tse_sessions as visible, queryable data rather than vanishing with no trace.
//
export const UNKNOWN_SCORE_TYPE = 'UNK'

//
//  Hard ceiling applied to any XIMP (cross-IMPs) score at build time (buildSteps.ts's SQL) — a
//  single clamp only, no separate scrape-stage sanity-reset step (unlike VP's two-stage check)
//
export const XIMP_SCORE_HARD_CAP = 200

//
//  Row caps for the two player-search server actions (players.ts)
//
export const PLAYER_SEARCH_LIMIT = 20
export const PLAYER_SEARCH_ALL_LIMIT = 30

//
//  Number of most-recent run_ids offered in the Pipeline page's run-id picker (pipelineLog.ts)
//
export const PIPELINE_RECENT_RUN_IDS_LIMIT = 10

//
//  How often (ms) the Pipeline page's Overview refreshes its Jobs summary while a full
//  "Run All Cron" request is in flight, so the new run_id and each completing step show live
//
export const PIPELINE_RUN_POLL_MS = 2500

//
//  Earliest date the app's data begins — the min bound on every session/result date picker
//
export const EARLIEST_DATA_DATE = '2024-01-01'

//
//  Number of series pre-selected by default on the Partners/Performance charts
//
export const CHART_TOP_N_PRESELECTED = 5

//
//  Default page size for paginated tables across the app (server-side pagination — see
//  docs/PLAN_production-data-errors.md item 3)
//
export const ROWS_PER_PAGE = 20

//
//  Delay before a filter change triggers a paginated re-fetch (Home page Players/Sessions
//  tabs) — avoids firing a request on every keystroke while typing into a text filter
//
export const FILTER_DEBOUNCE_MS = 300

//
//  Recognized scoring types shown in scoring-type UI (ScoringTypeSelect/ScoringTypeToggle, and
//  BuildDataViewer's se_scoring filter) — single source of truth so adding a new type is a
//  one-line change here instead of hunting down every duplicate
//
export const SCORING_TYPES = ['MP', 'VP', 'XIMP'] as const

//
//  se_day_of_week values — single source of truth so it isn't hand-typed at every filter call
//  site (Home Sessions tab, PlayerPageClient/PartnersTable's FilterDayOfWeek)
//
export const DAYS_OF_WEEK: string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

//
//  Minimum sessions a player needs, per scoring type, to receive a real precomputed rank
//  (a1_avg_rank/a1_group_total/a1_pct_rank) in statsCompute.ts — below this they get NULL rank
//  rather than a number skewed by low-sample-size averages. XIMP sessions are far rarer than
//  MP/VP, so it needs its own much lower floor.
//
export const MIN_RANKING_SESSIONS_MP = 30
export const MIN_RANKING_SESSIONS_VP = 30
export const MIN_RANKING_SESSIONS_XIMP = 1

//
//  Same idea, but for partnerships (a2_avg_rank/a2_group_total) — a partnership only accumulates
//  a session when the exact same two people play together, so partnerships reach far fewer
//  sessions than an individual player does (confirmed against local data: ~4.5 avg MP sessions
//  per partnership vs. an individual player's much higher volume). Using the player thresholds
//  for partnerships left almost none of them ever ranked, hence separate, much lower constants.
//
export const MIN_RANKING_SESSIONS_PARTNER_MP = 5
export const MIN_RANKING_SESSIONS_PARTNER_VP = 5
export const MIN_RANKING_SESSIONS_PARTNER_XIMP = 1

//
//  Recognized session-summary types (Home Sessions tab's Summary filter — se_is_summary is a
//  boolean column; both selected = no filter, matching the standard MySelectMulti convention)
//
export const SUMMARY_TYPES = ['Summary', 'Session'] as const

//
//  Value strings longer than this (or any object/array) render behind the Constants page's
//  Show popover button instead of inline
//
export const VALUE_DISPLAY_MAX_LENGTH = 40

//
//  Consistency label bands for the player stats table (PlayerPageClient.tsx) — pct_rank is a
//  player's percentile position by stddev among others in the same group/scoring (0 = most
//  consistent). Ordered ascending by `max`; the first band whose max the value falls under wins,
//  with the last entry (Infinity) as the catch-all.
//
export const CONSISTENCY_LEVELS = [
  { max: 0.25,      text: 'Consistent', cls: 'text-green-600'  },
  { max: 0.50,      text: 'Wobbly',     cls: 'text-yellow-600' },
  { max: 0.75,      text: 'Volatile',   cls: 'text-orange-500' },
  { max: Infinity,  text: 'Wild',       cls: 'text-red-600'    },
] as const

//
//  Minimum height for a table's overflow-x-auto scroll wrapper, so a filter that narrows the
//  table down to few/no rows never leaves too little room below the header for an open
//  MySelectMulti dropdown panel to render into (the wrapper's horizontal scrolling also clips
//  vertically, per the CSS rule that promotes a `visible` overflow axis to `auto` when the other
//  axis isn't `visible`). TABLE_MIN_VISIBLE_ROWS (8) was sized to fully contain nextjs-shared's
//  MySelectMulti panel at its capped max-h-60 (~240px); TABLE_ROW_HEIGHT_PX matches these tables'
//  text-sm + py-1.5 + border row styling; TABLE_HEADER_HEIGHT_PX covers the tallest 2-row filter
//  header among the affected tables (Home Players' stacked NZ#-input-plus-checkbox cell)
//
export const TABLE_MIN_VISIBLE_ROWS = 8
export const TABLE_ROW_HEIGHT_PX = 33
export const TABLE_HEADER_HEIGHT_PX = 90
export const TABLE_MIN_HEIGHT_PX = TABLE_HEADER_HEIGHT_PX + TABLE_MIN_VISIBLE_ROWS * TABLE_ROW_HEIGHT_PX

//
//  Per-dropdown trigger widths for Home page filter-row MySelectMulti/MySelect controls — each
//  named after the dropdown it applies to. Passed as `overrideClass`/merged against the shared
//  per-column default so only the width piece changes. WIDTH_CLUB is shared by both the Players
//  and Sessions tabs' Club dropdown (same value, same DD item, not two independent decisions).
//
export const WIDTH_RANK = 'w-40'
export const WIDTH_GRADE = 'w-40'
export const WIDTH_CLUB = 'w-96'
export const WIDTH_DAY_OF_WEEK = 'w-40'
export const WIDTH_TOURNAMENT_TYPE = 'w-24'
export const WIDTH_SCORING = 'w-24'
export const WIDTH_SESSIONS_MIN = 'w-32'
export const WIDTH_TOURNAMENT_NAME = 'w-96'
export const WIDTH_NZB = 'w-32'
export const WIDTH_PAID = 'w-32'
export const WIDTH_NAME = 'w-40'
export const WIDTH_TRACKED = 'w-16'
export const WIDTH_RATING_MIN = 'w-24'
export const WIDTH_A_POINTS_MIN = 'w-24'
export const WIDTH_DATE = 'w-32'
export const WIDTH_IS_SUMMARY = 'w-40'
export const WIDTH_PLID = 'w-40'
export const WIDTH_SEID = 'w-20'
export const WIDTH_RUN_ID = 'w-20'
export const WIDTH_EVENT_TYPE = 'w-24'
