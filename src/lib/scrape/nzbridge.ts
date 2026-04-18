import { parsePlayerTable, parsePlayerTableByName, parseAllPlayerMatches, parsePlayerTableFuzzy, parseAllPlayerMatchesFuzzy, type ParsedPlayer } from './parseHtml'
import { write_Logging } from 'nextjs-shared/write_logging'

const NZBRIDGE_BASE = 'https://www.nzbridge.co.nz'

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8'
}

async function fetchNzBridgePage(searchTerm: string): Promise<string | null> {
  const encoded = searchTerm.toLowerCase().split(/\s+/).map(encodeURIComponent).join('+')
  const url = `${NZBRIDGE_BASE}/online-points.html?mp_filter_name=${encoded}&mp_filter_number=&mp_search=Search`
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) return null
  return res.text()
}

/**
 * Look up a player on nzbridge.co.nz by their NZ bridge number.
 * Uses mp_filter_number= parameter for an exact match.
 */
export async function lookupPlayerByNumber(nzNumber: number): Promise<ParsedPlayer | null> {
  try {
    const url = `${NZBRIDGE_BASE}/online-points.html?mp_filter_name=&mp_filter_number=${nzNumber}&mp_search=Search`
    const res = await fetch(url, { headers: FETCH_HEADERS })
    if (!res.ok) {
      await write_Logging({ lg_functionname: 'lookupPlayerByNumber', lg_caller: 'nzbridge', lg_msg: `HTTP ${res.status} for NZ# ${nzNumber}`, lg_severity: 'W' })
      return null
    }
    const html = await res.text()
    const result = parsePlayerTable(html)
    if (!result) {
      await write_Logging({ lg_functionname: 'lookupPlayerByNumber', lg_caller: 'nzbridge', lg_msg: `No data returned for NZ# ${nzNumber}`, lg_severity: 'W' })
    }
    return result
  } catch (err) {
    await write_Logging({ lg_functionname: 'lookupPlayerByNumber', lg_caller: 'nzbridge', lg_msg: `Error for NZ# ${nzNumber}: ${String(err)}`, lg_severity: 'E' })
    return null
  }
}

/**
 * Look up a player on nzbridge.co.nz by name.
 *
 * Strategy:
 *  1. Search by full name — returns a single matching row if exact.
 *  1.5 Search by firstname%lastname — catches middle initials / suffixes.
 *  2. If not found, search by surname only and scan results for the full name.
 */
export async function lookupPlayer(name: string): Promise<ParsedPlayer | null> {
  try {
    const parts = name.trim().split(/\s+/)

    // Step 1: full name search — exact name match only
    const html = await fetchNzBridgePage(name)
    if (html) {
      const found = parsePlayerTableByName(html, name)
      if (found) return found
    }

    // Step 1.5: firstname%lastname wildcard search (handles middle initials/names)
    if (parts.length >= 2) {
      const firstName = parts[0]
      const lastName = parts[parts.length - 1]
      const wildcardHtml = await fetchNzBridgePage(`${firstName} % ${lastName}`)
      if (wildcardHtml) {
        const found = parsePlayerTableByName(wildcardHtml, name)
        if (found) return found
      }
    }

    // Step 2: surname-only search — fuzzy first-name match (prefix)
    const surname = parts[parts.length - 1]
    if (!surname || surname.toLowerCase() === name.toLowerCase()) return null

    const surnameHtml = await fetchNzBridgePage(surname)
    if (!surnameHtml) return null

    return parsePlayerTableFuzzy(surnameHtml, name)
  } catch {
    return null
  }
}

/**
 * Like lookupPlayer but returns ALL non-archive matches across all search strategies,
 * deduplicated by nz_bridge_number.
 * - Empty array  → not found
 * - Length 1     → unambiguous, safe to auto-assign
 * - Length > 1   → ambiguous, needs manual review
 */
export async function lookupPlayerCandidates(name: string): Promise<ParsedPlayer[]> {
  try {
    const seen = new Set<number>()
    const results: ParsedPlayer[] = []

    function addAll(candidates: ParsedPlayer[]) {
      for (const c of candidates) {
        if (!seen.has(c.nz_bridge_number)) {
          seen.add(c.nz_bridge_number)
          results.push(c)
        }
      }
    }

    const parts = name.trim().split(/\s+/)

    // Step 1: full name search
    const html = await fetchNzBridgePage(name)
    if (html) addAll(parseAllPlayerMatches(html, name))

    // Step 1.5: firstname%lastname wildcard
    if (parts.length >= 2) {
      const firstName = parts[0]
      const lastName = parts[parts.length - 1]
      const wildcardHtml = await fetchNzBridgePage(`${firstName} % ${lastName}`)
      if (wildcardHtml) addAll(parseAllPlayerMatches(wildcardHtml, name))
    }

    // Step 2: surname-only search — fuzzy first-name match (prefix)
    const surname = parts[parts.length - 1]
    if (surname && surname.toLowerCase() !== name.toLowerCase()) {
      const surnameHtml = await fetchNzBridgePage(surname)
      if (surnameHtml) addAll(parseAllPlayerMatchesFuzzy(surnameHtml, name))
    }

    return results
  } catch {
    return []
  }
}
