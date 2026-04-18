'use server'

import { table_write } from 'nextjs-shared/table_write'

const RESULTS_TABLE = 'tre_results'

export async function insertResult(data: {
  se_id: number
  pl_id: number
  partner_pl_id: number
  pair_id: number | null
  percentage: number
}) {
  const cols: { column: string; value: string | number | boolean }[] = [
    { column: 're_seid',          value: data.se_id },
    { column: 're_plid',          value: data.pl_id },
    { column: 're_partner_plid',  value: data.partner_pl_id },
    { column: 're_percentage',    value: data.percentage }
  ]
  if (data.pair_id !== null) cols.push({ column: 're_pairid', value: data.pair_id })
  return table_write({ caller: 'insertResult', table: RESULTS_TABLE, columnValuePairs: cols })
}
