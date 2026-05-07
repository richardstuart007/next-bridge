'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MyLineChart } from '@/src/ui/graphs/graph_charts'
import { GraphStructure, Datasets } from '@/src/ui/graphs/graph_types'

interface ResultRow {
  session_id: number
  date: string
  session_type: string
  day_of_week: string
  percentage: number
  partner_id: number
  partner_name: string
}

interface Props {
  results: ResultRow[]
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

export default function PerformanceChart({ results }: Props) {
  const router = useRouter()
  const [smoothing, setSmoothing] = useState(0)

  const sorted = useMemo(() =>
    [...results].sort((a, b) => (a.date < b.date ? -1 : 1))
  , [results])

  const { partnerOrder, ...graphData }: GraphStructure & { partnerOrder: number[] } = useMemo(() => {
    if (sorted.length === 0) return { labels: [], datasets: [], partnerOrder: [] }

    const labels = sorted.map((_, i) => String(i + 1))

    const partnerOrder: number[] = []
    const partnerNames = new Map<number, string>()
    sorted.forEach(r => {
      if (!partnerNames.has(r.partner_id)) {
        partnerOrder.push(r.partner_id)
        partnerNames.set(r.partner_id, r.partner_name)
      }
    })

    const dateCounts = new Map<string, number>()
    const dateSeq: number[] = sorted.map(r => {
      const n = (dateCounts.get(r.date) ?? 0) + 1
      dateCounts.set(r.date, n)
      return n
    })
    const dateTotal = new Map<string, number>()
    sorted.forEach(r => dateTotal.set(r.date, dateCounts.get(r.date) ?? 1))

    const datasets: Datasets[] = partnerOrder.map((partnerId, idx) => {
      // Collect this partner's own sessions in chronological order
      const partnerSlots = sorted
        .map((r, i) => r.partner_id === partnerId ? { i, v: parseFloat(String(r.percentage)) } : null)
        .filter((x): x is { i: number; v: number } => x !== null)

      const rawVals = partnerSlots.map(x => x.v)
      const smoothedVals = smoothing > 0 ? rollingAvg(rawVals, smoothing) : rawVals
      const smoothedMap = new Map(partnerSlots.map((x, k) => [x.i, smoothedVals[k]]))

      const data: (number | null)[] = sorted.map((_, i) => smoothedMap.get(i) ?? null)

      const tooltipData: string[] = sorted.map((r, i) => {
        const seq = (dateTotal.get(r.date) ?? 1) > 1 ? ` #${dateSeq[i]}` : ''
        return `${new Date(r.date).toISOString().slice(0, 10)} · ${r.day_of_week}${seq}`
      })

      const partnerAvg = rawVals.reduce((s, v) => s + v, 0) / rawVals.length
      return {
        label: `${partnerNames.get(partnerId) ?? `Partner ${partnerId}`} (${parseFloat(partnerAvg.toFixed(1))}%)`,
        data,
        keys: sorted.map(r => r.session_id),
        keyType: 'seid',
        borderColor: PARTNER_COLORS[idx % PARTNER_COLORS.length],
        tension: 0.2,
        tooltipData
      }
    })

    return { labels, datasets, partnerOrder }
  }, [sorted, smoothing])

  const overallAvg = sorted.length > 0
    ? parseFloat((sorted.reduce((sum, r) => sum + parseFloat(String(r.percentage)), 0) / sorted.length).toFixed(1))
    : null

  return (
    <div className='space-y-3'>
      <div className='flex items-baseline gap-4'>
        <h2 className='text-base font-semibold text-gray-800'>Performance Over Time</h2>
        {overallAvg !== null && (
          <span className='text-sm text-gray-500'>avg <span className='font-medium text-gray-700'>{overallAvg}%</span></span>
        )}
        <div className='flex items-center gap-1.5 ml-auto'>
          <label className='text-xs text-gray-500'>Smooth</label>
          <select
            value={smoothing}
            onChange={e => setSmoothing(parseInt(e.target.value, 10))}
            className='rounded border border-gray-300 px-2 py-0.5 text-xs'
          >
            <option value={0}>Off</option>
            <option value={5}>5 sessions</option>
            <option value={10}>10 sessions</option>
            <option value={15}>15 sessions</option>
            <option value={20}>20 sessions</option>
          </select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className='flex items-center justify-center h-48 text-gray-400 text-sm'>
          No results for this filter
        </div>
      ) : (
        <div className='h-[576px]'>
          <MyLineChart
            LineGraphData={graphData}
            GridDisplayY={true}
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
