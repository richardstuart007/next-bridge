import { parsePlayerTable, parsePlayerTableByName, parseAllPlayerMatches, parsePlayerTableFuzzy, parseAllPlayerMatchesFuzzy, parsePlayerResultsHistory, parseNzSessionPage, type ParsedPlayer, type ParsedPlayerResult, type ParsedSessionPair } from './parseHtml'
import { write_logging } from 'nextjs-shared/write_logging'
import { fetchHtml } from './fetchHtml'

const NZBRIDGE_BASE = 'https://www.nzbridge.co.nz'

async function fetchNzBridgePage(searchTerm: string): Promise<string | null> {
  const encoded = searchTerm.toLowerCase().split(/\s+/).map(encodeURIComponent).join('+')
  const url = `${NZBRIDGE_BASE}/online-points.html?mp_filter_name=${encoded}&mp_filter_number=&mp_search=Search`
  try {
    return await fetchHtml(url, 'nzbridge')
  } catch {
    return null
  }
}

/**
 * Look up a player on nzbridge.co.nz by their NZ bridge number.
 * Uses mp_filter_number= parameter for an exact match.
 */
export async function lookupPlayerByNumber(nzNumber: number): Promise<ParsedPlayer | null> {
  try {
    const url = `${NZBRIDGE_BASE}/online-points.html?mp_filter_name=&mp_filter_number=${nzNumber}&mp_search=Search`
    const html = await fetchHtml(url, 'nzbridge')
    const result = parsePlayerTable(html)
    if (!result) {
      await write_logging({ lg_functionname: 'lookupPlayerByNumber', lg_caller: 'nzbridge', lg_msg: `No data returned for NZ# ${nzNumber}`, lg_severity: 'W' })
    }
    return result
  } catch (err) {
    await write_logging({ lg_functionname: 'lookupPlayerByNumber', lg_caller: 'nzbridge', lg_msg: `Error for NZ# ${nzNumber}: ${String(err)}`, lg_severity: 'E' })
    return null
  }
}

/**
 * Look up a player on nzbridge.co.nz by name.
 *
 * Strategy:
 *  1. Search by full name â€” returns a single matching row if exact.
 *  1.5 Search by firstname%lastname â€” catches middle initials / suffixes.
 *  2. If not found, search by surname only and scan results for the full name.
 */
export async function lookupPlayer(name: string): Promise<ParsedPlayer | null> {
  try {
    const parts = name.trim().split(/\s+/)

    // Step 1: full name search â€” exact name match only
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

    // Step 2: surname-only search â€” fuzzy first-name match (prefix)
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
 * Fetch the full results history for a player by their NZ bridge number.
 * URL: /online-points.html?mpsr=1&mp_user=NNN
 */
export async function fetchPlayerResultsHistory(nzNumber: number): Promise<ParsedPlayerResult[]> {
  try {
    const url = `${NZBRIDGE_BASE}/online-points.html?mpsr=1&mp_user=${nzNumber}`
    return parsePlayerResultsHistory(await fetchHtml(url, 'nzbridge'))
  } catch (err) {
    await write_logging({ lg_functionname: 'fetchPlayerResultsHistory', lg_caller: 'nzbridge', lg_msg: `Error for NZ# ${nzNumber}: ${String(err)}`, lg_severity: 'E' })
    return []
  }
}

/**
 * Fetch and parse a NZbridge session results page by run_id.
 * URL: /results.html?run_id=X
 */
export async function fetchNzSessionPage(runId: number): Promise<ParsedSessionPair[]> {
  try {
    const url = `${NZBRIDGE_BASE}/results.html?run_id=${runId}`
    return parseNzSessionPage(await fetchHtml(url, 'nzbridge'))
  } catch (err) {
    await write_logging({ lg_functionname: 'fetchNzSessionPage', lg_caller: 'nzbridge', lg_msg: `Error for run_id=${runId}: ${String(err)}`, lg_severity: 'E' })
    return []
  }
}

/**
 * Like lookupPlayer but returns ALL non-archive matches across all search strategies,
 * deduplicated by nz_bridge_number.
 * - Empty array  â†’ not found
 * - Length 1     â†’ unambiguous, safe to auto-assign
 * - Length > 1   â†’ ambiguous, needs manual review
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

    // Step 2: surname-only search â€” fuzzy first-name match (prefix)
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
