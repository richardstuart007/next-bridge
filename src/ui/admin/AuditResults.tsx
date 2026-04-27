'use client'

import { useState } from 'react'
import { type AuditCheck } from '@/src/lib/actions/audit'

export default function AuditResults({ checks, error }: { checks: AuditCheck[] | null; error: string | null }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  if (error) return <div className='mt-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{error}</div>
  if (!checks) return null
  const allGood = checks.every(c => c.count === 0)
  function toggle(label: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n })
  }
  return (
    <div className='mt-3 rounded border border-gray-200 bg-gray-50 p-3 space-y-2'>
      {allGood && <div className='text-sm text-green-700 font-medium'>✓ All checks passed</div>}
      {checks.map(c => (
        <div key={c.label}>
          <div className='flex items-center gap-2 text-sm'>
            <span className={c.count === 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
              {c.count === 0 ? '✓' : '✗'}
            </span>
            <span className={c.count === 0 ? 'text-gray-600' : 'text-gray-900 font-medium'}>{c.label}</span>
            {c.count > 0 && <>
              <span className='text-red-600 font-medium'>{c.count}</span>
              <button onClick={() => toggle(c.label)} className='text-xs text-blue-600 hover:underline'>
                {expanded.has(c.label) ? 'Hide' : 'Show'}
              </button>
            </>}
          </div>
          {expanded.has(c.label) && c.rows.length > 0 && (
            <div className='mt-1 ml-5 overflow-x-auto max-h-48 border border-gray-200 rounded bg-white'>
              <table className='text-xs w-full'>
                <thead className='bg-gray-50 sticky top-0'>
                  <tr>{Object.keys(c.rows[0]).map(k => (
                    <th key={k} className='text-left text-gray-500 font-medium px-2 py-1'>{k}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {c.rows.map((row, i) => (
                    <tr key={i} className='border-t border-gray-100'>
                      {Object.values(row).map((v, j) => (
                        <td key={j} className='px-2 py-1 text-gray-700'>{String(v ?? '—')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
