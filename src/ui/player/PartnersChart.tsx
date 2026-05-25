'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MyLineChart } from '@/src/ui/graphs/graph_charts'
import { GraphStructure, Datasets } from '@/src/ui/graphs/graph_types'

interface PartnerRef {
  id: number
  name: string
  nz_number?: number | null
}

interface ResultRow {
  session_id:        number
  source_id:         number
  date:              string
  day_of_week:       string
  scoring:           string
  session_name:      string
  club:              string
  tournament:        string
  event_type:        string
  is_summary:        boolean | null
  percentage:        number
  vp:                number | null
  partner_id:        number
  partner_name:      string | null
  partner_nz_number: number | null
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

type Scoring = 'MP' | 'VP'
type Grp = 'all' | 'A' | 'B' | 'C'

function grpOf(tournament: string): string {
  const last = tournament.slice(-1)
  if (last === 'A') return 'A'
  if (last === 'B') return 'B'
  return 'C'
}

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

function escCsv(v: string | number | null | undefined) {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

export default function PartnersChart({ partners, self }: { partners: PartnerRef[]; self?: PartnerRef }) {
  const router = useRouter()
  const [smoothing,      setSmoothing]      = useState(10)
  const [scoring,        setScoring]        = useState<Scoring>('MP')
  const [grp,            setGrp]            = useState<Grp>('all')
  const [partnerResults, setPartnerResults] = useState<Map<number, ResultRow[]>>(new Map())
  const [loading,        setLoading]        = useState(false)

  useEffect(() => {
    (async () => {
      const all = self ? [self, ...partners] : partners
      if (all.length === 0) { setPartnerResults(new Map()); return }
      setLoading(true)
      const results = await Promise.all(
        all.map(async p => {
          try {
            const r = await fetch(`/api/players/${p.id}/results`)
            const rows: ResultRow[] = await r.json()
            return { id: p.id, rows }
          } catch {
            return { id: p.id, rows: [] as ResultRow[] }
          }
        })
      )
      const map = new Map<number, ResultRow[]>()
      results.forEach(({ id, rows }) => map.set(id, rows))
      setPartnerResults(map)
      setLoading(false)
    })()
  }, [partners, self])

  const valueOf = (r: ResultRow) =>
    scoring === 'VP' ? parseFloat(String(r.vp ?? 0)) : parseFloat(String(r.percentage))

  const graphData: GraphStructure = useMemo(() => {
    const all = self ? [self, ...partners] : partners
    if (all.length === 0 || partnerResults.size === 0) return { labels: [], datasets: [] }

    // One slot per session (not per unique date) so same-day sessions each get their own point
    const seenIds = new Set<number>()
    const allSessions: { session_id: number; date: string }[] = []
    all.forEach(p => {
      ;(partnerResults.get(p.id) ?? [])
        .filter(r => r.scoring === scoring && (grp === 'all' || grpOf(r.tournament) === grp))
        .forEach(r => {
          if (!seenIds.has(r.session_id)) {
            seenIds.add(r.session_id)
            allSessions.push({ session_id: r.session_id, date: r.date.slice(0, 10) })
          }
        })
    })
    allSessions.sort((a, b) => (a.date < b.date ? -1 : 1))
    const sessionIndex = new Map(allSessions.map((s, i) => [s.session_id, i]))
    const labels = allSessions.map(s => fmtDate(s.date))

    const built = all.map(entry => {
      const isSelf = self && entry.id === self.id
      const rows = (partnerResults.get(entry.id) ?? [])
        .filter(r => r.scoring === scoring && (grp === 'all' || grpOf(r.tournament) === grp))
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1))

      const rawVals     = rows.map(valueOf)
      const smoothedVals = smoothing > 0 ? rollingAvg(rawVals, smoothing) : rawVals
      const avg = rawVals.length > 0 ? rawVals.reduce((s, v) => s + v, 0) / rawVals.length : 0

      const data: (number | null)[] = Array(allSessions.length).fill(null)
      const keys: number[]          = Array(allSessions.length).fill(0)
      const tooltipData: string[]   = Array(allSessions.length).fill('')

      rows.forEach((r, i) => {
        const slot = sessionIndex.get(r.session_id)
        if (slot === undefined) return
        data[slot]        = smoothedVals[i]
        keys[slot]        = r.session_id
        tooltipData[slot] = r.date.slice(0, 10)
      })

      return { entry, isSelf, avg, data, keys, tooltipData }
    })

    const selfItem      = built.filter(b => b.isSelf)
    const othersSorted  = built.filter(b => !b.isSelf).sort((a, b) => b.avg - a.avg)
    const ordered       = [...selfItem, ...othersSorted]

    const unit = scoring === 'VP' ? '' : '%'
    const dp   = scoring === 'VP' ? 2 : 1

    const datasets: Datasets[] = ordered.map((b, idx) => ({
      label: `${b.entry.name} (${parseFloat(b.avg.toFixed(dp))}${unit})`,
      data: b.data,
      keys: b.keys,
      keyType: 'seid',
      borderColor: b.isSelf ? SELF_COLOR : PARTNER_COLORS[(idx - 1) % PARTNER_COLORS.length],
      tension: 0.2,
      tooltipData: b.tooltipData
    }))

    return { labels, datasets }
  }, [partners, self, partnerResults, smoothing, scoring, grp])

  function exportCSV() {
    const all = self ? [self, ...partners] : partners
    const header = ['Player','Player NZB#','Run ID','Date','Day','Partner','Partner NZB#','Session','Club','Tournament','Event Type','Scoring','Summary','%','VP']
    const dataRows: string[] = []
    all.forEach(entry => {
      const rows = (partnerResults.get(entry.id) ?? [])
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1))
      rows.forEach(r => {
        dataRows.push([
          entry.name,
          entry.nz_number ?? '',
          r.source_id,
          r.date.slice(0, 10),
          r.day_of_week,
          r.partner_name ?? '',
          r.partner_nz_number ?? '',
          r.session_name,
          r.club,
          r.tournament,
          r.event_type,
          r.scoring,
          r.is_summary === true ? 'Summary' : r.is_summary === null ? '?' : '',
          r.scoring === 'MP' ? parseFloat(String(r.percentage)).toFixed(2) : '',
          r.scoring === 'VP' ? parseFloat(String(r.vp ?? 0)).toFixed(2) : '',
        ].map(escCsv).join(','))
      })
    })
    const csv = [header.join(','), ...dataRows].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'partners_all.csv'
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-4 flex-wrap'>
        <h2 className='text-base font-semibold text-gray-800'>Partner Performance (all their sessions)</h2>
        {loading && <span className='text-xs text-gray-400'>Loading…</span>}
        <div className='flex items-center gap-3 ml-auto flex-wrap'>
          {/* Scoring toggle */}
          <div className='flex rounded border border-gray-300 overflow-hidden text-xs'>
            {(['MP', 'VP'] as Scoring[]).map(s => (
              <button key={s} onClick={() => setScoring(s)}
                className={`px-2 py-0.5 ${scoring === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                {s}
              </button>
            ))}
          </div>
          {/* Group selector */}
          <div className='flex rounded border border-gray-300 overflow-hidden text-xs'>
            {(['all', 'A', 'B', 'C'] as Grp[]).map(g => (
              <button key={g} onClick={() => setGrp(g)}
                className={`px-2 py-0.5 ${grp === g ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                {g === 'all' ? 'All' : g}
              </button>
            ))}
          </div>
          {/* Smoothing */}
          <div className='flex items-center gap-1.5'>
            <label className='text-xs text-gray-500'>Smooth</label>
            <select value={smoothing} onChange={e => setSmoothing(parseInt(e.target.value, 10))}
              className='rounded border border-gray-300 px-2 py-0.5 text-xs'>
              <option value={0}>Off</option>
              <option value={5}>5 sessions</option>
              <option value={10}>10 sessions</option>
              <option value={20}>20 sessions</option>
              <option value={50}>50 sessions</option>
            </select>
          </div>
          <button onClick={exportCSV} disabled={loading || partnerResults.size === 0}
            className='text-xs rounded border border-gray-300 bg-white px-2 py-0.5 hover:bg-gray-50 disabled:opacity-50'>
            Export CSV
          </button>
        </div>
      </div>

      {partners.length === 0 ? (
        <div className='flex items-center justify-center h-48 text-gray-400 text-sm'>No partners</div>
      ) : !loading && graphData.datasets.length === 0 ? (
        <div className='flex items-center justify-center h-48 text-gray-400 text-sm'>
          No {scoring} results{grp !== 'all' ? ` for group ${grp}` : ''}
        </div>
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
