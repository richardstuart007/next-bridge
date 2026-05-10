'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MyLineChart } from '@/src/ui/graphs/graph_charts'
import { GraphStructure, Datasets } from '@/src/ui/graphs/graph_types'

interface ResultRow {
  session_id: number
  date: string
  day_of_week: string
  percentage: number
  vp: number | null
  scoring: string
  tournament: string
  partner_id: number
  partner_name: string
}

interface Props {
  results: ResultRow[]
  scoring: 'MP' | 'VP'
}

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

function rollingAvg(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.reduce((s, v) => s + v, 0) / slice.length
  })
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-NZ', { month: 'short', year: '2-digit' })
}

export default function PerformanceChart({ results, scoring }: Props) {
  const router = useRouter()
  const [smoothing, setSmoothing] = useState(30)

  const sorted = useMemo(() =>
    [...results].sort((a, b) => (a.date < b.date ? -1 : 1))
  , [results])

  const valueOf = (r: ResultRow) =>
    scoring === 'VP' ? parseFloat(String(r.vp ?? 0)) : parseFloat(String(r.percentage))

  const { partnerOrder, ...graphData }: GraphStructure & { partnerOrder: number[] } = useMemo(() => {
    if (sorted.length === 0) return { labels: [], datasets: [], partnerOrder: [] }

    const allDates = [...new Set(sorted.map(r => r.date.slice(0, 10)))].sort()
    const dateIndex = new Map(allDates.map((d, i) => [d, i]))
    const labels = allDates.map(fmtDate)

    const partnerNames = new Map<number, string>()
    const partnerAvgs  = new Map<number, number[]>()
    sorted.forEach(r => {
      partnerNames.set(r.partner_id, r.partner_name)
      const vals = partnerAvgs.get(r.partner_id) ?? []
      vals.push(valueOf(r))
      partnerAvgs.set(r.partner_id, vals)
    })
    const partnerOrder = [...partnerNames.keys()].sort((a, b) => {
      const avgA = partnerAvgs.get(a)!.reduce((s, v) => s + v, 0) / partnerAvgs.get(a)!.length
      const avgB = partnerAvgs.get(b)!.reduce((s, v) => s + v, 0) / partnerAvgs.get(b)!.length
      return avgB - avgA
    })

    const datasets: Datasets[] = partnerOrder.map((partnerId, idx) => {
      const partnerRows = sorted.filter(r => r.partner_id === partnerId)
      const rawVals     = partnerRows.map(valueOf)
      const smoothedVals = smoothing > 0 ? rollingAvg(rawVals, smoothing) : rawVals

      const data: (number | null)[] = Array(allDates.length).fill(null)
      const keys: number[]          = Array(allDates.length).fill(0)
      const tooltipData: string[]   = Array(allDates.length).fill('')

      partnerRows.forEach((r, i) => {
        const slot = dateIndex.get(r.date.slice(0, 10))
        if (slot === undefined) return
        data[slot]        = smoothedVals[i]
        keys[slot]        = r.session_id
        tooltipData[slot] = `${r.date.slice(0, 10)} · ${r.day_of_week}`
      })

      const avg = rawVals.reduce((s, v) => s + v, 0) / rawVals.length
      const avgLabel = scoring === 'VP'
        ? parseFloat(avg.toFixed(2))
        : parseFloat(avg.toFixed(1))
      const unit = scoring === 'VP' ? '' : '%'

      return {
        label: `${partnerNames.get(partnerId) ?? `Partner ${partnerId}`} (${avgLabel}${unit})`,
        data,
        keys,
        keyType: 'seid',
        borderColor: PARTNER_COLORS[idx % PARTNER_COLORS.length],
        tension: 0.2,
        tooltipData
      }
    })

    return { labels, datasets, partnerOrder }
  }, [sorted, smoothing, scoring])

  const overallAvg = sorted.length > 0
    ? parseFloat((sorted.reduce((sum, r) => sum + valueOf(r), 0) / sorted.length).toFixed(scoring === 'VP' ? 2 : 1))
    : null

  const unitLabel = scoring === 'VP' ? 'pts' : '%'

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-4 flex-wrap'>
        <h2 className='text-base font-semibold text-gray-800'>Performance Over Time</h2>
        {overallAvg !== null && (
          <span className='text-sm text-gray-500'>avg <span className='font-medium text-gray-700'>{overallAvg}{unitLabel}</span></span>
        )}
        <div className='flex items-center gap-1.5 ml-auto'>
          <label className='text-xs text-gray-500'>Smooth</label>
          <select value={smoothing} onChange={e => setSmoothing(parseInt(e.target.value, 10))}
            className='rounded border border-gray-300 px-2 py-0.5 text-xs'>
            <option value={0}>Off</option>
            <option value={20}>20 sessions</option>
            <option value={30}>30 sessions</option>
            <option value={50}>50 sessions</option>
            <option value={75}>75 sessions</option>
            <option value={100}>100 sessions</option>
          </select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className='flex items-center justify-center h-48 text-gray-400 text-sm'>
          No {scoring} results
        </div>
      ) : (
        <div className='h-[576px]'>
          <MyLineChart
            LineGraphData={graphData}
            GridDisplayY={true}
            xMaxTicksLimit={24}
            onPointClick={key => router.push(`/session/${key}`)}
            onLegendClick={idx => { const id = partnerOrder[idx]; if (id) router.push(`/player/${id}`) }}
          />
        </div>
      )}

      <p className='text-xs text-gray-500'>
        {sorted.length} session{sorted.length !== 1 ? 's' : ''}
        {' · '}{graphData.datasets.length} partner{graphData.datasets.length !== 1 ? 's' : ''}
        {' · '}click point → session · click legend → player
      </p>
    </div>
  )
}
