'use client'

//==============================================================================================
//  1) DESCRIPTION
//    DataflowTabs — the /owner Dataflow view's top-level tab bar: Diagram / Processes / Tables.
//    Processes and Tables each render a SubTabs bar over their section list. Plain TSX
//    throughout — no markdown parsing.
//==============================================================================================

import { useState } from 'react'
import { MyTab } from 'nextjs-shared/MyTab'
import PipelineDiagram from '@/src/ui/dataflow/PipelineDiagram'
import { PROCESS_SECTIONS, TABLE_SECTIONS } from '@/src/ui/dataflow/sections'

type TopTab = 'diagram' | 'processes' | 'tables'

export default function DataflowTabs() {
  const [activeTab, setActiveTab] = useState<TopTab>('diagram')

  return (
    <div>
      <div className='flex gap-0 border-b border-gray-200 mb-4'>
        <MyTab active={activeTab === 'diagram'} onClick={() => setActiveTab('diagram')}>
          Diagram
        </MyTab>
        <MyTab active={activeTab === 'processes'} onClick={() => setActiveTab('processes')}>
          Processes
        </MyTab>
        <MyTab active={activeTab === 'tables'} onClick={() => setActiveTab('tables')}>
          Tables
        </MyTab>
      </div>
      {activeTab === 'diagram' && <PipelineDiagram />}
      {activeTab === 'processes' && <SubTabs sections={PROCESS_SECTIONS} />}
      {activeTab === 'tables' && <SubTabs sections={TABLE_SECTIONS} />}
    </div>
  )
}

//----------------------------------------------------------------------------------------------
//  SubTabs — a sub-tab bar plus content, shared by the Processes and Tables top-level tabs
//----------------------------------------------------------------------------------------------
function SubTabs({ sections }: { sections: typeof PROCESS_SECTIONS }) {
  const [activeId, setActiveId] = useState(sections[0].id)
  const active = sections.find(s => s.id === activeId)

  return (
    <div>
      <div className='flex gap-0 border-b border-gray-200 mb-4 flex-wrap'>
        {sections.map(section => (
          <MyTab key={section.id} active={activeId === section.id} onClick={() => setActiveId(section.id)}>
            {section.label}
          </MyTab>
        ))}
      </div>
      {active && active.content}
    </div>
  )
}
