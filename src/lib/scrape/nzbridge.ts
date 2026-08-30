import { parsePlayerTable, parsePlayerTableByName, parseAllPlayerMatches, parsePlayerTableFuzzy, parseAllPlayerMatchesFuzzy, parsePlayerResultsHistory, parseNzSessionPage, type ParsedPlayer, type ParsedPlayerResult, type ParsedSessionPair } from './parseHtml'
import { write_logging } from 'nextjs-shared/write_logging'
import { fetchHtml } from './fetchHtml'

const NZBRIDGE_BASE = 'https://www.nzbridge.co.nz'

//----------------------------------------------------------------------------------
//  fetchNzBridgePage — fetches the online-points search page for a name search
//  term (space-split, lowercased, '+'-joined); returns null on any fetch error
//----------------------------------------------------------------------------------
async function fetchNzBridgePage(searchTerm: string): Promise<string | null> {
  const encoded = searchTerm.toLowerCase().split(/\s+/).map(encodeURIComponent).join('+')
  const url = `${NZBRIDGE_BASE}/online-points.html?mp_filter_name=${encoded}&mp_filter_number=&mp_search=Search`
  try {
    return await fetchHtml(url, 'nzbridge')
  } catch {
    return null
  }
}

//----------------------------------------------------------------------------------
//  lookupPlayerByNumber — looks up a player on nzbridge.co.nz by exact NZ bridge
//  number (mp_filter_number); logs a warning on no data, an error on failure,
//  and returns null in both cases
//----------------------------------------------------------------------------------
export async function lookupPlayerByNumber(nzb: number): Promise<ParsedPlayer | null> {
  try {
    const url = `${NZBRIDGE_BASE}/online-points.html?mp_filter_name=&mp_filter_number=${nzb}&mp_search=Search`
    const html = await fetchHtml(url, 'nzbridge')
    const result = parsePlayerTable(html)
    if (!result) {
      await write_logging({ lg_functionname: 'lookupPlayerByNumber', lg_caller: 'nzbridge', lg_msg: `No data returned for NZ# ${nzb}`, lg_severity: 'W' })
    }
    return result
  } catch (err) {
    await write_logging({ lg_functionname: 'lookupPlayerByNumber', lg_caller: 'nzbridge', lg_msg: `Error for NZ# ${nzb}: ${String(err)}`, lg_severity: 'E' })
    return null
  }
}

//----------------------------------------------------------------------------------
//  lookupPlayer — looks up a player on nzbridge.co.nz by name in three passes:
//  (1) exact full-name search, (1.5) firstname % lastname wildcard for middle
//  initials/suffixes, (2) surname-only search with fuzzy first-name matching;
//  returns the first hit or null
//----------------------------------------------------------------------------------
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

//----------------------------------------------------------------------------------
//  fetchPlayerResultsHistory — fetches and parses a player's full results-history
//  page (?mpsr=1&mp_user=NNN); logs and returns [] on error
//----------------------------------------------------------------------------------
export async function fetchPlayerResultsHistory(nzb: number): Promise<ParsedPlayerResult[]> {
  try {
    const url = `${NZBRIDGE_BASE}/online-points.html?mpsr=1&mp_user=${nzb}`
    return parsePlayerResultsHistory(await fetchHtml(url, 'nzbridge'))
  } catch (err) {
    await write_logging({ lg_functionname: 'fetchPlayerResultsHistory', lg_caller: 'nzbridge', lg_msg: `Error for NZ# ${nzb}: ${String(err)}`, lg_severity: 'E' })
    return []
  }
}

//----------------------------------------------------------------------------------
//  fetchNzSessionPage — fetches and parses a session results page by run_id
//  (/results.html?run_id=X); logs and returns [] on error
//----------------------------------------------------------------------------------
export async function fetchNzSessionPage(runId: number): Promise<ParsedSessionPair[]> {
  try {
    const url = `${NZBRIDGE_BASE}/results.html?run_id=${runId}`
    return parseNzSessionPage(await fetchHtml(url, 'nzbridge'))
  } catch (err) {
    await write_logging({ lg_functionname: 'fetchNzSessionPage', lg_caller: 'nzbridge', lg_msg: `Error for run_id=${runId}: ${String(err)}`, lg_severity: 'E' })
    return []
  }
}

//----------------------------------------------------------------------------------
//  lookupPlayerCandidates — like lookupPlayer but returns every non-archive match
//  across all three search passes, deduplicated by nzb: [] = not found, length 1
//  = unambiguous (safe to auto-assign), length > 1 = ambiguous (manual review)
//----------------------------------------------------------------------------------
export async function lookupPlayerCandidates(name: string): Promise<ParsedPlayer[]> {
  try {
    const seen = new Set<number>()
    const results: ParsedPlayer[] = []

    //----------------------------------------------------------------------------------------------
    //  addAll — pushes each candidate whose nzb hasn't been seen yet into results
    //----------------------------------------------------------------------------------------------
    function addAll(candidates: ParsedPlayer[]) {
      for (const c of candidates) {
        if (!seen.has(c.nzb)) {
          seen.add(c.nzb)
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
