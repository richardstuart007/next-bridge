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
