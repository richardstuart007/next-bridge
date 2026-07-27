'use client'

import { ReactFlow, Handle, Position, MarkerType } from '@xyflow/react'
import type { Node, Edge, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const COL_WIDTH  = 240
const ROW_HEIGHT = 130
const EDGE_COLOR = '#374151'

//
//  Invisible anchor points — every node gets a source + target handle on all
//  4 sides so any edge can exit/enter from whichever side actually faces the
//  other node, regardless of which node is the source in a given edge.
//
const HANDLE_STYLE = { opacity: 0, width: 1, height: 1 }

type DiagramNodeData = { label: string; variant: 'table' | 'process' }

//----------------------------------------------------------------------------------------------
//  DiagramNode — a single pipeline-diagram box, styled blue (table) or amber (process) to match
//  the same color convention used throughout this project's docs
//----------------------------------------------------------------------------------------------
function DiagramNode({ data }: NodeProps & { data: DiagramNodeData }) {
  const boxClass = data.variant === 'table'
    ? 'border-blue-400 bg-blue-100 text-blue-900'
    : 'border-amber-400 bg-amber-200 text-amber-900'

  return (
    <div className={`w-44 rounded-md border px-4 py-2 text-center text-sm font-medium shadow-sm ${boxClass}`}>
      <Handle type='target' position={Position.Top}    id='top-tgt'    style={HANDLE_STYLE} />
      <Handle type='source' position={Position.Top}    id='top-src'    style={HANDLE_STYLE} />
      <Handle type='target' position={Position.Top}    id='top-left-tgt' style={{ ...HANDLE_STYLE, left: '15%' }} />
      <Handle type='target' position={Position.Bottom} id='bottom-tgt' style={HANDLE_STYLE} />
      <Handle type='source' position={Position.Bottom} id='bottom-src' style={HANDLE_STYLE} />
      <Handle type='target' position={Position.Left}   id='left-tgt'   style={HANDLE_STYLE} />
      <Handle type='source' position={Position.Left}   id='left-src'   style={HANDLE_STYLE} />
      <Handle type='target' position={Position.Right}  id='right-tgt'  style={HANDLE_STYLE} />
      <Handle type='source' position={Position.Right}  id='right-src'  style={HANDLE_STYLE} />
      {data.label}
    </div>
  )
}

const NODE_TYPES = { diagram: DiagramNode }

//
//  (row, col) from the already-agreed grid layout, converted to pixel positions
//
function pos(row: number, col: number) {
  return { x: (col - 1) * COL_WIDTH, y: (row - 1) * ROW_HEIGHT }
}

const NODES: Node<DiagramNodeData>[] = [
  { id: 'nzb',           type: 'diagram', position: pos(1, 2), data: { label: 'nzbridge.co.nz',        variant: 'table' } },
  { id: 'scrape',        type: 'diagram', position: pos(2, 2), data: { label: 'Scrape',                variant: 'process' } },
  { id: 'ts1',           type: 'diagram', position: pos(3, 1), data: { label: 'ts1_sessions',           variant: 'table' } },
  { id: 'ts2',           type: 'diagram', position: pos(3, 3), data: { label: 'ts2_results',            variant: 'table' } },
  { id: 'buildsessions', type: 'diagram', position: pos(4, 1), data: { label: 'Build Sessions',         variant: 'process' } },
  { id: 'tse',           type: 'diagram', position: pos(5, 1), data: { label: 'tse_sessions',           variant: 'table' } },
  { id: 'buildresults',  type: 'diagram', position: pos(5, 3), data: { label: 'Build Results',          variant: 'process' } },
  { id: 'tpa',           type: 'diagram', position: pos(5, 4), data: { label: 'tpa_partners',           variant: 'table' } },
  { id: 'tre',           type: 'diagram', position: pos(6, 3), data: { label: 'tre_results',            variant: 'table' } },
  { id: 'updatestats',   type: 'diagram', position: pos(7, 4), data: { label: 'Update Stats',           variant: 'process' } },
  { id: 'ta1',           type: 'diagram', position: pos(8, 3), data: { label: 'ta1_player_stats',       variant: 'table' } },
  { id: 'ta2',           type: 'diagram', position: pos(8, 5), data: { label: 'ta2_partner_stats',      variant: 'table' } },
]

//
//  Every edge exits/enters via whichever side actually faces the other node —
//  bottom/top for anything above/below (straight or elbow-routed by the `step`
//  edge type automatically), left/right for the one same-row connection.
//
//
//  `type: 'step'` internally forwards only `borderRadius`/`offset` from `pathOptions`, silently
//  dropping `stepPosition` — so an edge that needs to move its bend point (to route around a node
//  its default midpoint bend would otherwise cut through) has to use `type: 'smoothstep'` with
//  `borderRadius: 0` explicitly instead, which renders identically (sharp corners) but actually
//  respects `stepPosition`.
//
function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string, stepPosition?: number): Edge {
  return {
    id, source, target, sourceHandle, targetHandle,
    type: stepPosition !== undefined ? 'smoothstep' : 'step',
    style: { stroke: EDGE_COLOR, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR },
    ...(stepPosition !== undefined ? { pathOptions: { borderRadius: 0, stepPosition } } : {}),
  }
}

const EDGES: Edge[] = [
  edge('e1',  'nzb',           'bottom-src', 'scrape',        'top-tgt'),
  edge('e3',  'scrape',        'left-src',   'ts1',           'top-tgt'),
  edge('e5',  'scrape',        'right-src',  'ts2',           'top-tgt'),
  edge('e7',  'ts1',           'bottom-src', 'buildsessions', 'top-tgt'),
  edge('e8',  'buildsessions', 'bottom-src', 'tse',           'top-tgt'),
  edge('e9',  'ts2',           'bottom-src', 'buildresults',  'top-tgt'),
  edge('e10', 'tse',           'right-src',  'buildresults',  'left-tgt'),
  edge('e11', 'buildresults',  'bottom-src', 'tre',           'top-tgt'),
  edge('e12', 'buildresults',  'right-src',  'tpa',           'left-tgt'),
  edge('e13', 'tre',           'bottom-src', 'updatestats',   'top-left-tgt'),
  edge('e14', 'tse',           'bottom-src', 'updatestats',   'left-tgt'),
  edge('e15', 'tpa',           'bottom-src', 'updatestats',   'top-tgt'),
  edge('e16', 'updatestats',   'bottom-src', 'ta1',           'top-tgt'),
  edge('e17', 'updatestats',   'bottom-src', 'ta2',           'top-tgt'),
]

//----------------------------------------------------------------------------------------------
//  PipelineDiagram — the next-bridge pipeline dataflow diagram (React Flow, replacing the
//  earlier nextjs-shared markdown-lite `flow` diagram approach for this page)
//----------------------------------------------------------------------------------------------
export default function PipelineDiagram() {
  return (
    <div style={{ height: 720 }} className='w-full rounded-lg border border-gray-200 bg-gray-50'>
      <ReactFlow
        nodes={NODES}
        edges={EDGES}
        nodeTypes={NODE_TYPES}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  )
}
