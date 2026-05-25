import * as cheerio from 'cheerio'

/**
 * Parse run_ids from an NZ Bridge results/points HTML page.
 * Returns all run_ids found, plus the subset that are "Final"
 * (combined summary sessions — Session column = "Final").
 */
export function extractRunIds(html: string): { runIds: number[]; finalRunIds: number[] } {
  const $ = cheerio.load(html)
  const finalSet = new Set<number>()
  const allSet   = new Set<number>()

  $('table').each((_, table) => {
    const headerRow = $(table).find('tr').first()
    const headers = headerRow.find('th, td').toArray().map(th => $(th).text().trim().toLowerCase())
    const colSession = headers.findIndex(h => h === 'session')
    const colEvent   = headers.findIndex(h => h.includes('event'))
    if (colEvent < 0) return

    $(table).find('tr').each((rowIdx, tr) => {
      if (rowIdx === 0) return
      const cells = $(tr).find('td')
      const href = $(cells[colEvent]).find('a').attr('href') ?? ''
      const m = href.match(/run_id=(\d+)/)
      if (!m) return
      const runId = parseInt(m[1], 10)
      allSet.add(runId)
      if (colSession >= 0 && $(cells[colSession]).text().trim().toLowerCase() === 'final') {
        finalSet.add(runId)
      }
    })
  })

  return { runIds: [...allSet], finalRunIds: [...finalSet] }
}
