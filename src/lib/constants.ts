export const ROBOT_PLAYER_NAME = 'Robot'

//
//  Default span (in days) the Pipeline page's "To" date defaults to, ahead of the
//  automatic "From" date — a starting point for the incremental catch-up workflow,
//  which you then advance forward each run
//
export const SCRAPE_DEFAULT_TO_DATE_WINDOW_DAYS = 7

//
//  sessionStorage key: captures the page the user navigated from, right before
//  entering /session/[id] or /player/[id], so those pages can render a real
//  "back to where you came from" link via MyBackHomeNav
//
export const NB_BACK_FROM_KEY = 'nbBackFrom'

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
//  Request timeout for scrape HTML fetches (fetchHtml.ts) before aborting and retrying once
//
export const FETCH_TIMEOUT_MS = 15_000

//
//  When no session has ever been built yet, how many days back the automatic "From" date
//  falls back to (getDateRange's fallback when tse_sessions is empty)
//
export const SCRAPE_FALLBACK_LOOKBACK_DAYS = 30

//
//  MP percentage clamp bounds — a raw scraped score outside this range is treated as
//  unreliable and clamped/reset. Used both at scrape time (normaliseScore) and again at
//  build time (buildSteps.ts's SQL clamp on re_percentage)
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
//  Row caps for the two player-search server actions (players.ts)
//
export const PLAYER_SEARCH_LIMIT = 20
export const PLAYER_SEARCH_ALL_LIMIT = 30

//
//  Number of most-recent run_ids offered in the Pipeline page's run-id picker (pipelineLog.ts)
//
export const PIPELINE_RECENT_RUN_IDS_LIMIT = 5

//
//  Earliest date the app's data begins — the min bound on every session/result date picker
//
export const EARLIEST_DATA_DATE = '2024-01-01'

//
//  Number of series pre-selected by default on the Partners/Performance charts
//
export const CHART_TOP_N_PRESELECTED = 5

//
//  Default page size for client-side paginated tables across the app
//
export const ROWS_PER_PAGE = 20

//
//  Value strings longer than this (or any object/array) render behind the Constants page's
//  Show popover button instead of inline
//
export const VALUE_DISPLAY_MAX_LENGTH = 40
