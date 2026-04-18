'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MyLineChart } from '@/src/ui/graphs/graph_charts'
import { GraphStructure, Datasets } from '@/src/ui/graphs/graph_types'

interface ResultRow {
  date: string
  session_type: string
  day_of_week: string
  date_seq: number
  percentage: number
  partner_id: number
  partner_name: string
}

interface Props {
  results: ResultRow[]
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const PARTNER_COLORS = [
  'rgba(54, 162, 235, 1)',
  'rgba(255, 99, 132, 1)',
  'rgba(75, 192, 192, 1)',
  'rgba(255, 159, 64, 1)',
  'rgba(153, 102, 255, 1)',
  'rgba(255, 205, 86, 1)',
  'rgba(201, 203, 207, 1)',
  'rgba(0, 163, 108, 1)',
  'rgba(220, 80, 50, 1)',
  'rgba(100, 100, 200, 1)'
]

export default function PerformanceChart({ results }: Props) {
  const [sessionTypeFilter, setSessionTypeFilter] = useState<'all' | 'club' | 'online'>('all')
  const [dayFilter, setDayFilter] = useState('')
  const [minResults, setMinResults] = useState(3)

  // Apply filters then sort by date so x-axis is chronological
  const sorted = useMemo(() => {
    let rows = results
    if (sessionTypeFilter !== 'all') rows = rows.filter(r => r.session_type === sessionTypeFilter)
    if (dayFilter) rows = rows.filter(r => r.day_of_week === dayFilter)
    return [...rows].sort((a, b) => (a.date < b.date ? -1 : 1))
  }, [results, sessionTypeFilter, dayFilter])

  const { partnerList, ...graphData }: GraphStructure & { partnerList: { id: number; name: string; avg: number; color: string; count: number }[] } = useMemo(() => {
    if (sorted.length === 0) return { labels: [], datasets: [], partnerList: [] }

    // X-axis: sequential session numbers 1, 2, 3…
    const labels = sorted.map((_, i) => String(i + 1))

    // Count results per partner, then filter to those meeting the minimum
    const partnerCounts = new Map<number, number>()
    sorted.forEach(r => partnerCounts.set(r.partner_id, (partnerCounts.get(r.partner_id) ?? 0) + 1))

    const partnerOrder: number[] = []
    const partnerNames = new Map<number, string>()
    sorted.forEach(r => {
      if (!partnerNames.has(r.partner_id) && (partnerCounts.get(r.partner_id) ?? 0) >= minResults) {
        partnerOrder.push(r.partner_id)
        partnerNames.set(r.partner_id, r.partner_name)
      }
    })

    const datasets: Datasets[] = partnerOrder.map((partnerId, idx) => {
      const data: (number | null)[] = sorted.map(r =>
        r.partner_id === partnerId ? parseFloat(String(r.percentage)) : null
      )
      const tooltipData: string[] = sorted.map(r =>
        `${new Date(r.date).toISOString().slice(0, 10)} · ${r.day_of_week}${r.date_seq > 0 ? ` #${r.date_seq}` : ''}`
      )
      const partnerRows = sorted.filter(r => r.partner_id === partnerId)
      const partnerAvg = partnerRows.reduce((sum, r) => sum + parseFloat(String(r.percentage)), 0) / partnerRows.length
      const partnerAvgFixed = parseFloat(partnerAvg.toFixed(1))
      return {
        label: `${partnerNames.get(partnerId) ?? `Partner ${partnerId}`} (${partnerAvgFixed}%)`,
        data,
        keys: sorted.map(() => partnerId),
        keyType: 'index',
        borderColor: PARTNER_COLORS[idx % PARTNER_COLORS.length],
        tension: 0.2,
        tooltipData
      }
    })

    const partnerList = partnerOrder.map((partnerId, idx) => {
      const partnerRows = sorted.filter(r => r.partner_id === partnerId)
      const avg = parseFloat((partnerRows.reduce((sum, r) => sum + parseFloat(String(r.percentage)), 0) / partnerRows.length).toFixed(1))
      return {
        id: partnerId,
        name: partnerNames.get(partnerId) ?? `Partner ${partnerId}`,
        avg,
        color: PARTNER_COLORS[idx % PARTNER_COLORS.length],
        count: partnerRows.length
      }
    })

    return { labels, datasets, partnerList }
  }, [sorted, minResults])

  const overallAvg = sorted.length > 0
    ? parseFloat((sorted.reduce((sum, r) => sum + parseFloat(String(r.percentage)), 0) / sorted.length).toFixed(1))
    : null

  return (
    <div className='space-y-3'>
      {/* Heading with average */}
      <div className='flex items-baseline gap-3'>
        <h2 className='text-base font-semibold text-gray-800'>Performance Over Time</h2>
        {overallAvg !== null && (
          <span className='text-sm text-gray-500'>avg <span className='font-medium text-gray-700'>{overallAvg}%</span></span>
        )}
      </div>
      {/* Filters */}
      <div className='flex flex-wrap gap-2 text-sm'>
        {(['all', 'club', 'online'] as const).map(f => (
          <button
            key={f}
            onClick={() => setSessionTypeFilter(f)}
            className={`rounded px-3 py-1 border ${
              sessionTypeFilter === f
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <select
          value={dayFilter}
          onChange={e => setDayFilter(e.target.value)}
          className='rounded border border-gray-300 px-2 py-1 text-sm'
        >
          <option value=''>All days</option>
          {DAYS.map(d => <option key={d}>{d}</option>)}
        </select>
        <select
          value={minResults}
          onChange={e => setMinResults(parseInt(e.target.value, 10))}
          className='rounded border border-gray-300 px-2 py-1 text-sm'
        >
          {[2, 3, 4, 5, 10].map(n => (
            <option key={n} value={n}>Min {n} session{n !== 1 ? 's' : ''}</option>
          ))}
        </select>
      </div>

      {/* Chart */}
      {sorted.length === 0 ? (
        <div className='flex items-center justify-center h-48 text-gray-400 text-sm'>
          No results for this filter
        </div>
      ) : (
        <div className='h-72'>
          <MyLineChart LineGraphData={graphData} GridDisplayY={true} />
        </div>
      )}

      {partnerList.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {partnerList.map(p => (
            <Link
              key={p.id}
              href={`/player/${p.id}`}
              className='flex items-center gap-1.5 rounded border px-2 py-1 text-xs hover:bg-gray-50'
              style={{ borderColor: p.color }}
            >
              <span className='inline-block w-2.5 h-2.5 rounded-full flex-shrink-0' style={{ backgroundColor: p.color }} />
              <span className='font-medium text-gray-800'>{p.name}</span>
              <span className='text-gray-400'>{p.avg}% · {p.count}</span>
            </Link>
          ))}
        </div>
      )}

      <p className='text-xs text-gray-500'>
        {sorted.length} session{sorted.length !== 1 ? 's' : ''} shown
        {' · '}{graphData.datasets.length} partner{graphData.datasets.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}
