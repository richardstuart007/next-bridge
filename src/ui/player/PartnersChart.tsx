'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MyLineChart } from '@/src/ui/graphs/graph_charts'
import { GraphStructure, Datasets } from '@/src/ui/graphs/graph_types'

interface PartnerRef {
  id: number
  name: string
}

interface ResultRow {
  session_id: number
  date: string
  percentage: number
}

const SELF_COLOR = 'rgba(0, 0, 0, 1)'

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
  // "2025-01-15" → "Jan 25"
  const d = new Date(iso)
  return d.toLocaleDateString('en-NZ', { month: 'short', year: '2-digit' })
}

export default function PartnersChart({ partners, self }: { partners: PartnerRef[]; self?: PartnerRef }) {
  const router = useRouter()
  const [smoothing, setSmoothing] = useState(30)
  const [partnerResults, setPartnerResults] = useState<Map<number, ResultRow[]>>(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const all = self ? [self, ...partners] : partners
    if (all.length === 0) { setPartnerResults(new Map()); return }
    setLoading(true)
    Promise.all(
      all.map(p =>
        fetch(`/api/players/${p.id}/results`)
          .then(r => r.json())
          .then((rows: ResultRow[]) => ({ id: p.id, rows }))
          .catch(() => ({ id: p.id, rows: [] as ResultRow[] }))
      )
    ).then(results => {
      const map = new Map<number, ResultRow[]>()
      results.forEach(({ id, rows }) => map.set(id, rows))
      setPartnerResults(map)
      setLoading(false)
    })
  }, [partners, self])

  const graphData: GraphStructure = useMemo(() => {
    const all = self ? [self, ...partners] : partners
    if (all.length === 0 || partnerResults.size === 0) return { labels: [], datasets: [] }

    // Collect all unique dates across all entries and sort chronologically
    const allDates = new Set<string>()
    all.forEach(p => {
      ;(partnerResults.get(p.id) ?? []).forEach(r => allDates.add(r.date.slice(0, 10)))
    })
    const sortedDates = [...allDates].sort()
    const dateIndex = new Map(sortedDates.map((d, i) => [d, i]))
    const labels = sortedDates.map(fmtDate)

    // Build datasets with avg computed, then sort partners by avg desc (self always first)
    const built = all.map(entry => {
      const isSelf = self && entry.id === self.id
      const rows = (partnerResults.get(entry.id) ?? [])
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1))

      const rawVals = rows.map(r => parseFloat(String(r.percentage)))
      const smoothedVals = smoothing > 0 ? rollingAvg(rawVals, smoothing) : rawVals
      const avg = rawVals.length > 0 ? rawVals.reduce((s, v) => s + v, 0) / rawVals.length : 0

      const data: (number | null)[] = Array(sortedDates.length).fill(null)
      const keys: number[]          = Array(sortedDates.length).fill(0)
      const tooltipData: string[]   = Array(sortedDates.length).fill('')

      rows.forEach((r, i) => {
        const slot = dateIndex.get(r.date.slice(0, 10))
        if (slot === undefined) return
        data[slot]        = smoothedVals[i]
        keys[slot]        = r.session_id
        tooltipData[slot] = r.date.slice(0, 10)
      })

      return { entry, isSelf, avg, data, keys, tooltipData }
    })

    // Self stays first, partners sorted by avg desc
    const selfItem  = built.filter(b => b.isSelf)
    const othersSorted = built.filter(b => !b.isSelf).sort((a, b) => b.avg - a.avg)
    const ordered = [...selfItem, ...othersSorted]

    const datasets: Datasets[] = ordered.map((b, idx) => ({
      label: `${b.entry.name} (${parseFloat(b.avg.toFixed(1))}%)`,
      data: b.data,
      keys: b.keys,
      keyType: 'seid',
      borderColor: b.isSelf ? SELF_COLOR : PARTNER_COLORS[(idx - 1) % PARTNER_COLORS.length],
      tension: 0.2,
      tooltipData: b.tooltipData
    }))

    return { labels, datasets }
  }, [partners, self, partnerResults, smoothing])

  return (
    <div className='space-y-3'>
      <div className='flex items-baseline gap-4'>
        <h2 className='text-base font-semibold text-gray-800'>Partner Performance (all their sessions)</h2>
        {loading && <span className='text-xs text-gray-400'>Loading…</span>}
        <div className='flex items-center gap-1.5 ml-auto'>
          <label className='text-xs text-gray-500'>Smooth</label>
          <select
            value={smoothing}
            onChange={e => setSmoothing(parseInt(e.target.value, 10))}
            className='rounded border border-gray-300 px-2 py-0.5 text-xs'
          >
            <option value={0}>Off</option>
            <option value={20}>20 sessions</option>
            <option value={30}>30 sessions</option>
            <option value={50}>50 sessions</option>
            <option value={75}>75 sessions</option>
            <option value={100}>100 sessions</option>
          </select>
        </div>
      </div>

      {partners.length === 0 ? (
        <div className='flex items-center justify-center h-48 text-gray-400 text-sm'>No partners</div>
      ) : !loading && graphData.datasets.length === 0 ? (
        <div className='flex items-center justify-center h-48 text-gray-400 text-sm'>No data</div>
      ) : (
        <div className='h-[576px]'>
          <MyLineChart
            LineGraphData={graphData}
            GridDisplayY={true}
            xMaxTicksLimit={24}
            onPointClick={key => { if (key) router.push(`/session/${key}`) }}
            onLegendClick={idx => { const p = partners[idx]; if (p) router.push(`/player/${p.id}`) }}
          />
        </div>
      )}

      <p className='text-xs text-gray-500'>
        {partners.length} partner{partners.length !== 1 ? 's' : ''}
        {' · '}x-axis = shared date timeline · click point → session · click legend → player
      </p>
    </div>
  )
}
