'use server'

//==============================================================================================
//  1) DESCRIPTION
//    cronStart / cronEnd / cronFail — a start / normal-end / error-end boundary log line for
//    every cron route, at severity 'P' (persists on prod, unlike 'I') / 'E' for failures.
//
//    Parameters:
//      route   — the route's lg_caller, e.g. 'build/scrape-akbc-day'
//      params  — query/derived params for the START line; undefined values are dropped
//      summary — one-line result summary for the normal-END line
//      err     — the caught error for the error-END line
//
//  2) NOTES
//    PHASE7-TRACE — part of the bring-up trace logging for the split-cron rollout. Remove these
//    calls (and this file) once the new cron model is proven, along with pipelineScrape.ts's
//    `trace(...)` helper.
//==============================================================================================

import { write_logging } from 'nextjs-shared/write_logging'

export async function cronStart(route: string, params: Record<string, unknown> = {}): Promise<void> {
  const parts = Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${v}`)
  const paramStr = parts.length ? parts.join(' ') : '(no params)'
  await write_logging({ lg_functionname: 'cronStart', lg_caller: route, lg_msg: `START ${route} — ${paramStr}`, lg_severity: 'P' })
}

export async function cronEnd(route: string, summary: string): Promise<void> {
  await write_logging({ lg_functionname: 'cronEnd', lg_caller: route, lg_msg: `END OK ${route} — ${summary}`, lg_severity: 'P' })
}

export async function cronFail(route: string, err: unknown): Promise<void> {
  await write_logging({ lg_functionname: 'cronFail', lg_caller: route, lg_msg: `END ERROR ${route} — ${String(err)}`, lg_severity: 'E' })
}
