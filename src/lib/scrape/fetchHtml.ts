import { FETCH_TIMEOUT_MS } from '@/src/lib/constants'

// ── Web cache ─────────────────────────────────────────────────────────────────
const _webCache = new Map<string, string>()

// ── In-flight deduplication ───────────────────────────────────────────────────
const _inFlightRequests = new Map<string, Promise<string>>()

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept': 'text/html',
  'Accept-Language': 'en-NZ,en-GB;q=0.9,en;q=0.8',
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { headers: FETCH_HEADERS, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function doFetch(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetchWithTimeout(url)
  } catch (err) {
    try {
      res = await fetchWithTimeout(url)
    } catch (err2) {
      throw new Error(`fetch network error | ${url} | ${String(err2)}`)
    }
  }

  if (res.ok) return res.text()

  if (res.status === 500 || res.status === 503) {
    const res2 = await fetchWithTimeout(url)
    if (res2.ok) return res2.text()
    throw new Error(`fetch HTTP ${res2.status} | ${url}`)
  }

  throw new Error(`fetch HTTP ${res.status} | ${url}`)
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchHtml(url: string, _caller = 'fetchHtml', _forceBrowser = false): Promise<string> {
  const cached = _webCache.get(url)
  if (cached !== undefined) return cached

  const inflight = _inFlightRequests.get(url)
  if (inflight !== undefined) return inflight

  const promise = (async () => {
    try {
      const html = await doFetch(url)
      _webCache.set(url, html)
      return html
    } finally {
      _inFlightRequests.delete(url)
    }
  })()

  _inFlightRequests.set(url, promise)
  return promise
}

export function web_cache_size(): number { return _webCache.size }
export function web_cache_clear(): void  { _webCache.clear() }
