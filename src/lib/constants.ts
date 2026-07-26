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
