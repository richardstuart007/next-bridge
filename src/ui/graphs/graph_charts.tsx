'use client'

import { useRef } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  LegendItem
} from 'chart.js'
import { Datasets } from './graph_types'

ChartJS.register(
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend
)

interface StackDataStructure {
  labels: string[]
  datasets: Datasets[]
}

//----------------------------------------------------------------------------------
//  MyBarChart — a Chart.js bar chart (optionally stacked / horizontal / percentage)
//  with optional bar-click and y-axis-label-click callbacks; draws a dashed 50%
//  reference line when showPercentage is set
//----------------------------------------------------------------------------------
export function MyBarChart({
  StackedGraphData,
  Stacked = false,
  GridDisplayX = false,
  GridDisplayY = false,
  indexAxis = 'x' as const,
  showPercentage = false,
  onBarClick,
  onLabelClick
}: {
  StackedGraphData: StackDataStructure
  Stacked?: boolean
  GridDisplayX?: boolean
  GridDisplayY?: boolean
  indexAxis?: 'x' | 'y'
  showPercentage?: boolean
  onBarClick?: (labelIndex: number, datasetLabel: string) => void
  onLabelClick?: (labelIndex: number) => void
}) {
  const barRef = useRef<any>(null)

  const defaultBackgroundColors = [
    'rgba(34, 197, 94, 0.7)',
    'rgba(239, 68, 68, 0.7)',
    'rgba(156, 163, 175, 0.7)',
    'rgba(54, 162, 235, 0.6)',
    'rgba(153, 102, 255, 0.6)'
  ]

  if (!StackedGraphData || !StackedGraphData.datasets) {
    return <div className='text-xs text-gray-400'>No data available</div>
  }

  const displayDatasets = StackedGraphData.datasets.map((dataset, dsIndex) => ({
    ...dataset,
    backgroundColor:
      dataset.backgroundColor ||
      defaultBackgroundColors[dsIndex % defaultBackgroundColors.length]
  }))

  const modifiedGraphData = { ...StackedGraphData, datasets: displayDatasets }

  //----------------------------------------------------------------------------------------------
  //  valueLabel — a bar value formatted as "N%" when showPercentage, else "N"
  //----------------------------------------------------------------------------------------------
  function valueLabel(v: number): string {
    return showPercentage ? `${v}%` : `${v}`
  }

  const options = {
    indexAxis,
    responsive: true,
    maintainAspectRatio: false,
    hover: { mode: 'index' as const, intersect: true, animationDuration: 200 },
    scales: {
      x: {
        stacked: Stacked,
        grid: { display: GridDisplayX },
        ...(showPercentage && indexAxis === 'x' ? { max: 100, ticks: { callback: (v: any) => `${v}%` } } : {}),
        ...(showPercentage && indexAxis === 'y' ? { max: 100, ticks: { callback: (v: any) => `${v}%` } } : {})
      },
      y: {
        stacked: Stacked,
        grid: { display: GridDisplayY },
        beginAtZero: true,
        ticks: {
          font: { size: 11 },
          crossAlign: 'far' as const
        }
      }
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: function (context: any) {
            const label = context.dataset.label || ''
            const value = context.raw
            const tooltipData = context.dataset.tooltipData
            if (tooltipData?.[context.dataIndex]) {
              return [`${label}: ${valueLabel(value)}`, tooltipData[context.dataIndex]]
            }
            return `${label}: ${valueLabel(value)}`
          }
        }
      }
    },
    onClick: (event: any, _elements: any[], chart: any) => {
      if (!onBarClick) return
      const nearest = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false)
      if (nearest.length === 0) return
      const { datasetIndex, index } = nearest[0]
      const datasetLabel = StackedGraphData.datasets[datasetIndex]?.label ?? ''
      onBarClick(index, datasetLabel)
    }
  }

  const fiftyLinePlugin = showPercentage ? [{
    id: 'fiftyLine',
    afterDraw(chart: any) {
      const xScale = chart.scales?.x
      if (!xScale) return
      const xPos = xScale.getPixelForValue(50)
      const { top, bottom } = chart.chartArea
      const ctx = chart.ctx
      ctx.save()
      ctx.strokeStyle = 'rgba(80, 80, 80, 0.6)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(xPos, top)
      ctx.lineTo(xPos, bottom)
      ctx.stroke()
      ctx.restore()
    }
  }] : []

  //----------------------------------------------------------------------------------------------
  //  handleWrapperClick — for a horizontal (indexAxis 'y') chart, maps a click in the left
  //  label gutter to a label index and forwards it to onLabelClick
  //----------------------------------------------------------------------------------------------
  function handleWrapperClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onLabelClick || indexAxis !== 'y') return
    const chart = barRef.current
    if (!chart) return
    const canvas = chart.canvas as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const chartArea = chart.chartArea
    if (!chartArea || x >= chartArea.left) return
    const yScale = chart.scales?.y
    if (!yScale) return
    const labelIndex = Math.round(yScale.getValueForPixel(y) ?? -1)
    if (labelIndex >= 0 && labelIndex < StackedGraphData.labels.length) {
      onLabelClick(labelIndex)
    }
  }

  return (
    <div
      className='relative h-full'
      style={(onBarClick || onLabelClick) ? { cursor: 'pointer' } : {}}
      onClick={handleWrapperClick}
    >
      <Bar ref={barRef} data={modifiedGraphData} options={options} plugins={fiftyLinePlugin} />
    </div>
  )
}

//----------------------------------------------------------------------------------
//  MyLineChart — a Chart.js multi-series line chart with a line-style legend and
//  optional point-click and legend-click callbacks
//----------------------------------------------------------------------------------
export function MyLineChart({
  LineGraphData,
  GridDisplayX = false,
  GridDisplayY = true,
  xMaxTicksLimit,
  onPointClick,
  onLegendClick
}: {
  LineGraphData: StackDataStructure
  GridDisplayX?: boolean
  GridDisplayY?: boolean
  xMaxTicksLimit?: number
  onPointClick?: (key: number) => void
  onLegendClick?: (datasetIndex: number) => void
}) {
  const defaultBorderColors = [
    'rgba(75, 192, 192, 1)',
    'rgba(54, 162, 235, 1)',
    'rgba(255, 159, 64, 1)',
    'rgba(153, 102, 255, 1)'
  ]

  if (!LineGraphData || !LineGraphData.datasets) {
    return <div className='text-xs text-gray-400'>No data available</div>
  }

  const datasetsWithColors = LineGraphData.datasets.map((dataset, index) => ({
    ...dataset,
    borderColor: dataset.borderColor || defaultBorderColors[index % defaultBorderColors.length],
    backgroundColor: 'transparent',
    borderWidth: 1,
    tension: dataset.tension ?? 0.3,
    pointRadius: 2,
    pointHoverRadius: 6,
    spanGaps: true
  }))

  const modifiedGraphData = { ...LineGraphData, datasets: datasetsWithColors }

  const options = {
    animation: false as const,
    responsive: true,
    maintainAspectRatio: false,
    hover: { mode: 'index' as const, intersect: false, animationDuration: 0 },
    scales: {
      x: { grid: { display: GridDisplayX }, ticks: xMaxTicksLimit ? { maxTicksLimit: xMaxTicksLimit } : {} },
      y: { grid: { display: GridDisplayY }, beginAtZero: false }
    },
    plugins: {
      legend: {
        ...(onLegendClick ? {
          onClick: (_e: any, legendItem: any) => { onLegendClick(legendItem.datasetIndex) }
        } : {}),
        labels: {
          usePointStyle: false,
          generateLabels: (chart: ChartJS): LegendItem[] =>
            chart.data.datasets.map((dataset, i) => ({
              datasetIndex: i,
              text: dataset.label || `Dataset ${i + 1}`,
              fillStyle: dataset.borderColor as string,
              strokeStyle: dataset.borderColor as string,
              hidden: !chart.isDatasetVisible(i),
              lineWidth: 2,
              pointStyle: 'line' as const
            }))
        }
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            if (context.raw === null || context.raw === undefined) return undefined
            const label = context.dataset.label || ''
            const value = typeof context.raw === 'number' ? context.raw.toFixed(2) : context.raw
            const tooltipData = context.dataset.tooltipData
            if (tooltipData?.[context.dataIndex]) {
              return [`${label}: ${value}`, tooltipData[context.dataIndex]]
            }
            return `${label}: ${value}`
          }
        }
      }
    },
    onClick: (_event: any, elements: any[]) => {
      if (!onPointClick || elements.length === 0) return
      const { datasetIndex, index } = elements[0]
      const key = modifiedGraphData.datasets[datasetIndex]?.keys?.[index]
      if (key) onPointClick(key)
    },
    ...(onPointClick ? { cursor: 'pointer' } : {})
  }

  return (
    <div className='relative h-full' style={onPointClick ? { cursor: 'pointer' } : {}}>
      <Line data={modifiedGraphData} options={options} />
    </div>
  )
}
