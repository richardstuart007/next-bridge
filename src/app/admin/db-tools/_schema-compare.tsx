'use client'

import { useState } from 'react'

type EnvFile = { file: string; fullPath: string; location: string }

type DiffRow = {
  table_name: string
  column_name: string
  data_type: string
  max_len: number | null
  is_nullable: string
  column_default: string | null
  is_pk: boolean
  is_unique: boolean
  has_index: boolean
  side?: string
}

type ChangeRow = {
  table_name: string
  column_name: string
  source: DiffRow
  target: DiffRow
}

type CompareResult = {
  label1: string
  label2: string
  onlyIn1: DiffRow[]
  onlyIn2: DiffRow[]
  changed: ChangeRow[]
}

function ColTable({ rows }: { rows: DiffRow[] }) {
  const byTable: Record<string, DiffRow[]> = {}
  for (const r of rows) (byTable[r.table_name] ??= []).push(r)
  return (
    <>
      {Object.entries(byTable).map(([table, cols]) => (
        <div key={table} className='mb-3'>
          <p className='text-xs font-mono font-bold text-gray-700 mb-1'>{table}</p>
          <table className='w-full text-xs border border-gray-200 rounded bg-white'>
            <thead className='bg-gray-50'>
              <tr>
                {['Column', 'Type', 'Nullable', 'Default', 'PK', 'Unique', 'Index'].map(h => (
                  <th key={h} className='px-2 py-1 text-left text-gray-500 font-medium border-b'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cols.map((r, i) => (
                <tr key={i} className='border-b border-gray-100'>
                  <td className='px-2 py-1 font-mono'>{r.column_name}</td>
                  <td className='px-2 py-1'>{r.data_type}{r.max_len ? `(${r.max_len})` : ''}</td>
                  <td className='px-2 py-1'>{r.is_nullable === 'YES' ? '✓' : ''}</td>
                  <td className='px-2 py-1 text-gray-400 truncate max-w-[120px]'>{r.column_default ?? ''}</td>
                  <td className='px-2 py-1'>{r.is_pk ? '✓' : ''}</td>
                  <td className='px-2 py-1'>{r.is_unique ? '✓' : ''}</td>
                  <td className='px-2 py-1'>{r.has_index ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  )
}

export default function SchemaCompareClient({ envFiles }: { envFiles: EnvFile[] }) {
  const [env1, setEnv1] = useState(envFiles[0]?.fullPath ?? '')
  const [env2, setEnv2] = useState(envFiles[1]?.fullPath ?? '')
  const [loading, setLoading]   = useState(false)
  const [error,   setError]     = useState<string | null>(null)
  const [result,  setResult]    = useState<CompareResult | null>(null)

  const label1 = envFiles.find(e => e.fullPath === env1)?.location || env1
  const label2 = envFiles.find(e => e.fullPath === env2)?.location || env2
  const sameEnv = env1 && env2 && env1 === env2

  async function compare() {
    setLoading(true); setError(null); setResult(null)
    try {
      const params = new URLSearchParams({ env1, env2 })
      const res = await fetch(`/api/admin/db-tools/schema-compare?${params}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      setResult(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const total = result ? result.onlyIn1.length + result.onlyIn2.length + result.changed.length : 0

  const selectClass = 'py-1 px-2 w-64 text-xs border border-blue-500 rounded-md focus:outline-none'

  return (
    <div className='mt-4 py-2 px-4 bg-gray-50 rounded-lg shadow-md space-y-4'>
      <h2 className='text-sm font-bold'>Schema Compare</h2>

      <div className='flex items-center gap-2'>
        <label className='text-xs w-16 text-right shrink-0'>Source</label>
        <select className={selectClass} value={env1} onChange={e => setEnv1(e.target.value)}>
          {envFiles.map(e => (
            <option key={e.fullPath} value={e.fullPath}>
              {e.file}{e.location ? ` (${e.location})` : ''}
            </option>
          ))}
        </select>
        {label1 && (
          <span className='text-sm font-bold uppercase bg-blue-600 text-white px-3 py-1 rounded-md shadow'>{label1}</span>
        )}
      </div>

      <div className='flex items-center gap-2'>
        <label className='text-xs w-16 text-right shrink-0'>Target</label>
        <select className={selectClass} value={env2} onChange={e => setEnv2(e.target.value)}>
          {envFiles.map(e => (
            <option key={e.fullPath} value={e.fullPath}>
              {e.file}{e.location ? ` (${e.location})` : ''}
            </option>
          ))}
        </select>
        {label2 && (
          <span className='text-sm font-bold uppercase bg-red-600 text-white px-3 py-1 rounded-md shadow animate-pulse'>{label2}</span>
        )}
      </div>

      {sameEnv ? (
        <p className='text-xs font-bold text-red-700 ml-20'>&#9888; Source and target are the same environment</p>
      ) : (
        <div className='ml-20'>
          <button onClick={compare} disabled={loading || !env1 || !env2}
            className='rounded border border-gray-300 bg-white px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50'>
            {loading ? 'Comparing…' : 'Compare Schemas'}
          </button>
        </div>
      )}

      {error && (
        <div className='rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700'>{error}</div>
      )}

      {result && total === 0 && (
        <div className='rounded bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700'>
          ✓ Schemas are identical
        </div>
      )}

      {result && result.onlyIn1.length > 0 && (
        <div>
          <p className='text-xs font-semibold text-green-700 mb-2'>
            Only in {result.label1} — will ADD to target ({result.onlyIn1.length})
          </p>
          <ColTable rows={result.onlyIn1} />
        </div>
      )}

      {result && result.onlyIn2.length > 0 && (
        <div>
          <p className='text-xs font-semibold text-orange-600 mb-2'>
            Only in {result.label2} — not in source, review before dropping ({result.onlyIn2.length})
          </p>
          <ColTable rows={result.onlyIn2} />
        </div>
      )}

      {result && result.changed.length > 0 && (
        <div>
          <p className='text-xs font-semibold text-purple-700 mb-2'>Changed columns ({result.changed.length})</p>
          <table className='w-full text-xs border border-gray-200 rounded bg-white'>
            <thead className='bg-gray-50'>
              <tr>
                {['Table', 'Column', 'Attribute', result.label1, result.label2].map(h => (
                  <th key={h} className='px-2 py-1 text-left text-gray-500 font-medium border-b'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.changed.flatMap((c, i) => {
                const rows: { attr: string; src: string; tgt: string }[] = []
                if (c.source.data_type !== c.target.data_type || c.source.max_len !== c.target.max_len)
                  rows.push({ attr: 'type', src: `${c.source.data_type}${c.source.max_len ? `(${c.source.max_len})` : ''}`, tgt: `${c.target.data_type}${c.target.max_len ? `(${c.target.max_len})` : ''}` })
                if (c.source.is_nullable !== c.target.is_nullable)
                  rows.push({ attr: 'nullable', src: c.source.is_nullable, tgt: c.target.is_nullable })
                if (c.source.column_default !== c.target.column_default)
                  rows.push({ attr: 'default', src: c.source.column_default ?? '', tgt: c.target.column_default ?? '' })
                return rows.map((r, j) => (
                  <tr key={`${i}-${j}`} className='border-b border-gray-100'>
                    <td className='px-2 py-1 font-mono'>{j === 0 ? c.table_name : ''}</td>
                    <td className='px-2 py-1 font-mono'>{j === 0 ? c.column_name : ''}</td>
                    <td className='px-2 py-1 text-purple-600'>{r.attr}</td>
                    <td className='px-2 py-1 text-blue-700'>{r.src}</td>
                    <td className='px-2 py-1 text-red-600'>{r.tgt}</td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
