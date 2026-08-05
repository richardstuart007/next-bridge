'use client'

import { useState, useEffect } from 'react'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import MySelectMulti from 'nextjs-shared/MySelectMulti'
import MyPagination from 'nextjs-shared/MyPagination'
import { ROWS_PER_PAGE, TABLE_MIN_HEIGHT_PX } from '@/src/lib/constants'
import { TableEmptyRow } from '@/src/ui/shared/TableEmptyRow'

export type Row = Record<string, unknown>

export function rowKey(row: Row): unknown { return row[Object.keys(row)[0]] }

//----------------------------------------------------------------------------------------------
//  Shared cross-tab key filters — identity/FK-style values only (plid, plid1, plid2, paid, seid,
//  run_id). Attribute filters (club, grade, tournament, etc.) are never part of this shared state
//  — they stay local to each tab, since same-named columns across tables aren't the same
//  relationship. `label` is populated from the clicked row when available (e.g. pl_name alongside
//  pl_plid); absent when a filter is added manually via the Filters tab.
//----------------------------------------------------------------------------------------------
export type SharedKey = 'plid' | 'plid1' | 'plid2' | 'paid' | 'seid' | 'run_id'
export type SharedFilterEntry = { value: string; label?: string }
export type SharedFilters = Partial<Record<SharedKey, SharedFilterEntry>>
export const SHARED_KEYS: SharedKey[] = ['plid', 'plid1', 'plid2', 'paid', 'seid', 'run_id']

//----------------------------------------------------------------------------------------------
//  dateKey — extracts the yyyy-mm-dd portion from a date-shaped value, regardless of whether it
//  arrived as a native Date object (server actions preserve Date over the wire) or an ISO string
//  (API-route/JSON responses always stringify Date to ISO). Returns null for anything else.
//  Shared by renderCell's display formatting and every exact-date filter comparison.
//----------------------------------------------------------------------------------------------
export function dateKey(val: unknown): string | null {
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10)
  return null
}

//----------------------------------------------------------------------------------------------
//  numMatch — exact numeric equality for a text filter against a numeric column, so typing "1"
//  doesn't substring-match "18"/"21"/etc. the way a plain String(...).includes(...) check would.
//  An empty filter always matches; a non-numeric filter value matches nothing.
//----------------------------------------------------------------------------------------------
export function numMatch(filter: string, val: unknown): boolean {
  if (filter === '') return true
  const f = Number(filter)
  if (Number.isNaN(f)) return false
  return Number(val) === f
}

function formatDate(key: string): string {
  const [year, month, day] = key.split('-')
  return `${day}/${month}/${year}`
}

export function renderCell(val: unknown): React.ReactNode {
  if (val === null || val === undefined) return <span className='text-gray-300'>—</span>
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (Array.isArray(val)) return val.join(', ')
  const key = dateKey(val)
  if (key) return formatDate(key)
  return String(val)
}

export function FText({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <MyInput type='text' placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
      overrideClass='w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 h-auto md:h-auto' />
  )
}

export function FDate({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <MyInput type='date' value={value} onChange={e => onChange(e.target.value)}
      overrideClass='w-full rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 h-auto md:h-auto' />
  )
}

export function FSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <MySelect value={value} onChange={e => onChange(e.target.value)}
      overrideClass='w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:outline-none h-auto md:h-auto'>
      {children}
    </MySelect>
  )
}

export function FMultiSelect({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <MySelectMulti
      options={options}
      selected={value}
      onChange={onChange}
      overrideClass='w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:outline-none h-auto md:h-auto'
    />
  )
}

export function SectionHeader({ label, shown, total, loading, children }: {
  label: string; shown?: number; total?: number; loading?: boolean; children?: React.ReactNode
}) {
  return (
    <div className='flex items-center gap-2 mb-1'>
      <p className='text-xs font-semibold text-gray-500 uppercase tracking-wide'>{label}</p>
      {loading && <span className='text-xs text-blue-500'>Loading…</span>}
      {!loading && total !== undefined && total > 0 && (
        <span className='text-xs text-gray-400'>
          {shown !== undefined && shown !== total ? `${shown} / ${total}` : total} rows
        </span>
      )}
      {children && <div className='ml-auto flex items-center gap-2'>{children}</div>}
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  DataTable — generic filtered/paginated table, shared by every /owner/builddata tab. Filters
//  render directly above their column's heading (per project convention). Paginates its already-
//  filtered `rows` prop at ROWS_PER_PAGE, matching the same client-side pagination pattern already
//  used elsewhere in this project (HomePageClient/PlayerPageClient/SessionPageClient/PartnersTable).
//----------------------------------------------------------------------------------------------
export function DataTable({ rows, allRows, onRowClick, isClickable, selected, filters, cellRenderers }: {
  rows: Row[]
  allRows?: Row[]
  onRowClick?: (row: Row) => void
  isClickable?: boolean
  selected?: Row | null
  filters?: Record<string, React.ReactNode>
  cellRenderers?: Record<string, (val: unknown, row: Row) => React.ReactNode>
}) {
  const [page, setPage] = useState(1)
  const source = allRows ?? rows
  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE))
  const safePage = Math.min(page, totalPages)

  useEffect(() => { if (page !== safePage) setPage(safePage) }, [safePage, page])

  if (source.length === 0) return <p className='text-xs text-gray-400 py-2'>No rows</p>
  const cols = Object.keys(source[0])
  const pageRows = rows.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE)

  return (
    <div>
      <div className='overflow-x-auto border border-gray-200 rounded' style={{ minHeight: TABLE_MIN_HEIGHT_PX }}>
        <table className='w-full text-xs'>
          <thead className='bg-gray-50'>
            {filters && (
              <tr>
                {cols.map(col => (
                  <th key={`f-${col}`} className='px-1 py-1 bg-gray-50 border-b border-gray-100'>
                    {filters[col] ?? null}
                  </th>
                ))}
              </tr>
            )}
            <tr>
              {cols.map(col => (
                <th key={col} className='px-2 py-1.5 text-left text-gray-500 font-medium border-b border-gray-200'>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0
              ? <TableEmptyRow colSpan={cols.length} message='No rows match filter' />
              : pageRows.map((row, i) => {
                  const clickable = isClickable && !!onRowClick
                  const isSelected = selected != null && rowKey(selected) === rowKey(row)
                  return (
                    <tr key={i}
                      className={`border-t border-gray-100 ${isSelected ? 'bg-blue-100' : clickable ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-gray-50'}`}
                      onClick={() => clickable && onRowClick?.(row)}>
                      {cols.map(col => (
                        <td key={col} className='px-2 py-1 text-gray-700'>
                          {cellRenderers?.[col] ? cellRenderers[col](row[col], row) : renderCell(row[col])}
                        </td>
                      ))}
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className='flex justify-center mt-2'>
          <MyPagination totalPages={totalPages} statecurrentPage={safePage} setStateCurrentPage={setPage} />
        </div>
      )}
    </div>
  )
}
