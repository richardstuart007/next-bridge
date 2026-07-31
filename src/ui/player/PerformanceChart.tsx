'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MyLineChart } from '@/src/ui/graphs/graph_charts'
import { GraphStructure, Datasets } from '@/src/ui/graphs/graph_types'
import { MyButton } from 'nextjs-shared/MyButton'
import MySelect from 'nextjs-shared/MySelect'
import { saveBackNav } from 'nextjs-shared/useBackNav'
import { BACK_KEY, CHART_TOP_N_PRESELECTED, SCORING_TYPES } from '@/src/lib/constants'

interface ResultRow {
  session_id:   number
  date:         string
  day_of_week:  string
  percentage:   number | null
  vp:           number | null
  ximp:         number | null
  scoring:      string
  tournament:   string
  partner_id:   number
  partner_name: string
  is_summary?:  boolean | null
}

interface Props {
  results: ResultRow[]
  scoring: (typeof SCORING_TYPES)[number]
}

const PARTNER_COLORS = [
  'rgba(54, 162, 235, 1)',  'rgba(255, 99, 132, 1)',  'rgba(75, 192, 192, 1)',
  'rgba(255, 159, 64, 1)',  'rgba(153, 102, 255, 1)', 'rgba(255, 205, 86, 1)',
  'rgba(201, 203, 207, 1)', 'rgba(0, 163, 108, 1)',   'rgba(220, 80, 50, 1)',
  'rgba(100, 100, 200, 1)',
]

function rollingAvg(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.reduce((s, v) => s + v, 0) / slice.length
  })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NZ', { month: 'short', year: '2-digit' })
}

function escCsv(v: string | number | null | undefined) {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

export default function PerformanceChart({ results, scoring }: Props) {
  const router = useRouter()
  const [smoothing,   setSmoothing]   = useState(10)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const initialised = useRef(false)

  const sorted = useMemo(() =>
    [...results]
      .filter(r => r.scoring === scoring && r.is_summary !== true)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
  , [results, scoring])

  const valueOf = (r: ResultRow) =>
    scoring === 'VP'   ? parseFloat(String(r.vp   ?? 0)) :
    scoring === 'XIMP' ? parseFloat(String(r.ximp ?? 0)) :
    parseFloat(String(r.percentage))

  const { partnerOrder, partnerMeta } = useMemo(() => {
    const groups = new Map<number, { name: string; vals: number[] }>()
    sorted.forEach(r => {
      const g = groups.get(r.partner_id) ?? { name: r.partner_name, vals: [] }
      g.vals.push(valueOf(r))
      groups.set(r.partner_id, g)
    })
    const order = [...groups.keys()].sort((a, b) => {
      const va = groups.get(a)!.vals, vb = groups.get(b)!.vals
      return (vb.reduce((s, v) => s + v, 0) / vb.length) - (va.reduce((s, v) => s + v, 0) / va.length)
    })
    const meta = new Map(order.map((id, idx) => {
      const g = groups.get(id)!
      const avg = g.vals.reduce((s, v) => s + v, 0) / g.vals.length
      return [id, { name: g.name, avg, color: PARTNER_COLORS[idx % PARTNER_COLORS.length] }]
    }))
    return { partnerOrder: order, partnerMeta: meta }
  }, [sorted, scoring])

  // First load → top 5; after that keep existing selection, only drop partners no longer available
  useEffect(() => {
    if (partnerOrder.length === 0) return
    if (!initialised.current) {
      setSelectedIds(new Set(partnerOrder.slice(0, CHART_TOP_N_PRESELECTED)))
      initialised.current = true
    } else {
      const available = new Set(partnerOrder)
      setSelectedIds(prev => new Set([...prev].filter(id => available.has(id))))
    }
  }, [partnerOrder])

  const dp   = 2
  const unit = scoring === 'MP' ? '%' : ''

  const graphData: GraphStructure = useMemo(() => {
    if (sorted.length === 0 || selectedIds.size === 0) return { labels: [], datasets: [] }
    const sessionIndex = new Map(sorted.map((r, i) => [r.session_id, i]))
    const labels = sorted.map(r => fmtDate(r.date))
    const datasets: Datasets[] = partnerOrder
      .filter(id => selectedIds.has(id))
      .map(partnerId => {
        const meta = partnerMeta.get(partnerId)!
        const rows = sorted.filter(r => r.partner_id === partnerId)
        const raw  = rows.map(valueOf)
        const vals = smoothing > 0 ? rollingAvg(raw, smoothing) : raw
        const data: (number | null)[] = Array(sorted.length).fill(null)
        const keys: number[]          = Array(sorted.length).fill(0)
        const tips: string[]          = Array(sorted.length).fill('')
        rows.forEach((r, i) => {
          const slot = sessionIndex.get(r.session_id)
          if (slot === undefined) return
          data[slot] = vals[i]
          keys[slot] = r.session_id
          tips[slot] = smoothing > 0
            ? `${r.date.slice(0, 10)} · ${r.day_of_week} · actual: ${raw[i].toFixed(dp)}${unit}`
            : `${r.date.slice(0, 10)} · ${r.day_of_week}`
        })
        return {
          label: `${meta.name} →`,
          data, keys, keyType: 'seid',
          borderColor: meta.color, tension: 0.2, tooltipData: tips,
        }
      })
    return { labels, datasets }
  }, [sorted, smoothing, scoring, selectedIds, partnerOrder, partnerMeta])

  const overallAvg = sorted.length > 0
    ? parseFloat((sorted.reduce((s, r) => s + valueOf(r), 0) / sorted.length).toFixed(dp))
    : null

  const visibleOrder = partnerOrder.filter(id => selectedIds.has(id))

  function exportCSV() {
    const smoothLabel = smoothing > 0 ? `Smooth_${smoothing}` : 'Score'
    const header = ['Date', 'Day', 'Session_ID', 'Partner', 'Actual', smoothLabel].join(',')
    const rows: string[] = []

    visibleOrder.forEach(partnerId => {
      const meta = partnerMeta.get(partnerId)!
      const partnerRows = sorted.filter(r => r.partner_id === partnerId)
      const raw  = partnerRows.map(valueOf)
      const vals = smoothing > 0 ? rollingAvg(raw, smoothing) : raw
      partnerRows.forEach((r, i) => {
        rows.push([
          r.date.slice(0, 10),
          r.day_of_week,
          r.session_id,
          meta.name,
          raw[i].toFixed(dp),
          vals[i].toFixed(dp),
        ].map(escCsv).join(','))
      })
    })

    const csv = [header, ...rows].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `performance_${scoring}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  function toggleId(id: number) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-4 flex-wrap'>
        <h2 className='text-base font-semibold text-gray-800'>Performance Over Time</h2>
        {overallAvg !== null && (
          <span className='text-sm text-gray-500'>avg <span className='font-medium text-gray-700'>{overallAvg}{scoring === 'MP' ? '%' : 'pts'}</span></span>
        )}
        <div className='flex items-center gap-1.5 ml-auto'>
          <MyButton onClick={exportCSV} disabled={sorted.length === 0 || selectedIds.size === 0}
            overrideClass='text-xs rounded border border-gray-300 bg-white px-2 py-0.5 hover:bg-gray-50 disabled:opacity-50 text-gray-700 h-auto md:h-auto'>
            Export CSV
          </MyButton>
          <label className='text-xs text-gray-500'>Smooth</label>
          <MySelect value={smoothing} onChange={e => setSmoothing(parseInt(e.target.value, 10))}
            overrideClass='rounded border border-gray-300 px-2 py-0.5 text-xs h-auto md:h-auto w-auto'>
            <option value={0}>Off</option>
            <option value={5}>5 sessions</option>
            <option value={10}>10 sessions</option>
            <option value={20}>20 sessions</option>
            <option value={50}>50 sessions</option>
          </MySelect>
        </div>
      </div>

      {/* Partner chips — click to toggle */}
      {partnerOrder.length > 0 && (
        <div className='flex flex-wrap items-center gap-1.5'>
          <span className='text-xs text-gray-500 font-medium whitespace-nowrap'>Show on graph:</span>
          {partnerOrder.map(id => {
            const meta = partnerMeta.get(id)!
            const sel  = selectedIds.has(id)
            return (
              <button key={id} onClick={() => toggleId(id)}
                className={`rounded px-1.5 py-0.5 text-xs border transition-colors ${sel ? 'text-white border-transparent' : 'border-gray-300 text-gray-500 bg-white hover:bg-gray-50'}`}
                style={sel ? { backgroundColor: meta.color } : {}}>
                {meta.name} ({meta.avg.toFixed(dp)}{unit})
              </button>
            )
          })}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className='flex items-center justify-center h-48 text-gray-400 text-sm'>No {scoring} results</div>
      ) : selectedIds.size === 0 ? (
        <div className='flex items-center justify-center h-48 text-gray-400 text-sm'>No partners selected</div>
      ) : (
        <div className='h-[576px]'>
          <MyLineChart
            LineGraphData={graphData}
            GridDisplayY={true}
            xMaxTicksLimit={24}
            onPointClick={key => {
              saveBackNav(BACK_KEY)
              router.push(`/session/${key}`)
            }}
            onLegendClick={idx => {
              const id = visibleOrder[idx]
              if (!id) return
              saveBackNav(BACK_KEY)
              router.push(`/player/${id}`)
            }}
          />
        </div>
      )}

      <p className='text-xs text-gray-500'>
        {sorted.length} session{sorted.length !== 1 ? 's' : ''}
        {' · '}{selectedIds.size} of {partnerOrder.length} partner{partnerOrder.length !== 1 ? 's' : ''}
        {' · '}click point → session · click legend → player page
      </p>
    </div>
  )
}
