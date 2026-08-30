'use client'

//==============================================================================================
//  1) DESCRIPTION
//    ConstantsViewer — a two-level tabbed read-only display of constants.ts and .env (no edit
//    controls). Top-level tabs pick Constants / .env / Functions; a second tab row picks one
//    section within Constants/.env and only that section's SectionTable renders. Functions is a
//    flat reverse-index (buildFunctionIndex) across both, with no section row.
//
//    Parameters:
//      constantsSections    — the constants.ts sections to display
//      envSections          — the .env sections to display
//      functionDescriptions — one-line description per resolved consumer reference
//
//  2) NOTES
//    Top-level function order is kept helpers-first, main-component-last. All helpers are
//    hoisted `function` declarations, so the arrangement is cosmetic. Flagged for a separate
//    review pass alongside PipelineTable/PipelineDiagram.
//==============================================================================================

import { useState } from 'react'
import { VALUE_DISPLAY_MAX_LENGTH } from '@/src/lib/constants'
import { MyTab } from 'nextjs-shared/MyTab'

const TAB_ACTIVE  = 'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors border-blue-600 text-blue-600'
const TAB_PASSIVE = 'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors border-transparent text-gray-500 hover:text-gray-700'

export type ConstantEntry = {
  name: string
  value: unknown
  description: string
  consumers: string[]
}

export type ConstantSection = {
  heading: string
  entries: ConstantEntry[]
}

type Tab = 'constants' | 'env' | 'functions'

type FunctionIndexName = {
  name: string
  isEnv: boolean
}

type FunctionIndexEntry = {
  usedIn: string
  names: FunctionIndexName[]
}

//----------------------------------------------------------------------------------------------
//  buildFunctionIndex — reverse-indexes every section's entries' `consumers` arrays into one row
//  per function/module-scope reference, listing which constants/env vars that reference uses.
//  constantsSections and envSections are kept separate (not pre-merged) so each matched name can
//  be tagged with its origin for the Functions tab's blue/red color coding.
//----------------------------------------------------------------------------------------------
function buildFunctionIndex(constantsSections: ConstantSection[], envSections: ConstantSection[]): FunctionIndexEntry[] {
  const namesByUsedIn = new Map<string, Map<string, boolean>>()

  //--------------------------------------------------------------------------------------------
  //  addSections — folds one section list's entries into namesByUsedIn, tagging each name with
  //  whether it came from the .env set
  //--------------------------------------------------------------------------------------------
  function addSections(sections: ConstantSection[], isEnv: boolean) {
    for (const section of sections) {
      for (const entry of section.entries) {
        for (const consumer of entry.consumers) {
          if (consumer === 'none yet') continue

          const references = consumer.endsWith(' (module scope)') && !consumer.includes(': ')
            ? [consumer]
            : (() => {
                const [file, functionsPart] = consumer.split(': ')
                if (functionsPart === undefined) return [consumer]
                return functionsPart.split(', ').map(functionName => `${file}: ${functionName}`)
              })()

          for (const reference of references) {
            const names = namesByUsedIn.get(reference) ?? new Map<string, boolean>()
            names.set(entry.name, isEnv)
            namesByUsedIn.set(reference, names)
          }
        }
      }
    }
  }

  addSections(constantsSections, false)
  addSections(envSections, true)

  const index = Array.from(namesByUsedIn.entries()).map(([usedIn, names]) => ({
    usedIn,
    names: Array.from(names.entries())
      .map(([name, isEnv]) => ({ name, isEnv }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }))

  return index.sort((a, b) => a.usedIn.localeCompare(b.usedIn))
}

//----------------------------------------------------------------------------------------------
//  PopoverButton — small button that toggles an absolutely-positioned popover on click
//----------------------------------------------------------------------------------------------
function PopoverButton({ label, align = 'right', children }: { label: string; align?: 'left' | 'right'; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <span className='relative inline-block'>
      <button
        type='button'
        onClick={() => setOpen(o => !o)}
        className='text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-1.5 py-0.5 leading-none'
      >
        {label}
      </button>

      {open && (
        <div className={`absolute z-20 mt-1 ${align === 'left' ? 'left-0' : 'right-0'} w-[32rem] max-h-64 overflow-y-auto p-3 bg-blue-50 border border-blue-200 rounded-md shadow-xl text-xs`}>
          <div className='flex justify-end mb-2'>
            <button
              onClick={() => setOpen(false)}
              className='text-gray-400 hover:text-gray-700 text-sm leading-none font-bold'
              type='button'
            >
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </span>
  )
}

//----------------------------------------------------------------------------------------------
//  renderValue — short scalars print as-is; objects/arrays and long scalars (over
//  VALUE_DISPLAY_MAX_LENGTH characters) render behind a Show popover button
//----------------------------------------------------------------------------------------------
function renderValue(value: unknown) {
  const isObject = value !== null && typeof value === 'object'
  const text = isObject ? JSON.stringify(value, null, 2) : String(value)

  if (isObject || text.length > VALUE_DISPLAY_MAX_LENGTH) {
    return (
      <PopoverButton label='Show' align='left'>
        <pre className='whitespace-pre-wrap font-mono text-xxs text-gray-700'>{text}</pre>
      </PopoverButton>
    )
  }
  return text
}

//----------------------------------------------------------------------------------------------
//  SectionTable — fixed-width table of entries for one section; same column widths on every
//  table, on both tabs, so they all line up and look identical
//----------------------------------------------------------------------------------------------
function SectionTable({ section }: { section: ConstantSection }) {
  return (
    <table className='w-full table-fixed text-xs border-collapse'>
      <thead>
        <tr className='text-left text-gray-500 border-b border-gray-200'>
          <th className='py-1.5 pr-4 font-medium w-96'>Name</th>
          <th className='py-1.5 pr-4 font-medium w-64'>Value</th>
          <th className='py-1.5 pr-4 font-medium'>Description</th>
          <th className='py-1.5 font-medium w-24'>Used by</th>
        </tr>
      </thead>
      <tbody>
        {section.entries.map(entry => (
          <tr key={entry.name} className='border-b border-gray-100 align-top'>
            <td className='py-1.5 pr-4 font-mono whitespace-nowrap'>{entry.name}</td>
            <td className='py-1.5 pr-4 break-words'>{renderValue(entry.value)}</td>
            <td className='py-1.5 pr-4 text-gray-600'>{entry.description}</td>
            <td className='py-1.5'>
              <PopoverButton label='Show'>
                <ul className='list-disc pl-4 space-y-1 text-gray-700'>
                  {entry.consumers.map((consumer, i) => (
                    <li key={i}>{consumer}</li>
                  ))}
                </ul>
              </PopoverButton>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

//----------------------------------------------------------------------------------------------
//  FunctionIndexPopup — always-a-popup display of a function's description followed by its
//  matched constant/env-var names, one per line, color-coded by origin (blue for constants.ts,
//  red for .env)
//----------------------------------------------------------------------------------------------
function FunctionIndexPopup({ description, names }: { description: string; names: FunctionIndexName[] }) {
  return (
    <PopoverButton label='Show'>
      {description && <p className='text-gray-700 mb-2'>{description}</p>}
      <ul className='list-disc pl-4 space-y-1'>
        {names.map(n => (
          <li key={n.name} className={n.isEnv ? 'text-red-700' : 'text-blue-700'}>{n.name}</li>
        ))}
      </ul>
    </PopoverButton>
  )
}

//----------------------------------------------------------------------------------------------
//  FunctionIndexTable — flat table of every function/module-scope reference and the
//  constants/env vars it uses, driven by buildFunctionIndex
//----------------------------------------------------------------------------------------------
function FunctionIndexTable({ index, functionDescriptions }: { index: FunctionIndexEntry[]; functionDescriptions: Record<string, string> }) {
  return (
    <table className='w-full table-fixed text-xs border-collapse'>
      <thead>
        <tr className='text-left text-gray-500 border-b border-gray-200'>
          <th className='py-1.5 pr-10 font-medium w-[32rem]'>Functions</th>
          <th className='py-1.5 font-medium'>
            <span className='text-blue-700'>Constants</span> <span className='text-red-700'>.ENV</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {index.map(entry => (
          <tr key={entry.usedIn} className='border-b border-gray-100 align-top'>
            <td className='py-1.5 pr-10 font-mono break-words'>{entry.usedIn}</td>
            <td className='py-1.5'>
              <FunctionIndexPopup description={functionDescriptions[entry.usedIn] ?? ''} names={entry.names} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function ConstantsViewer({
  constantsSections,
  envSections,
  functionDescriptions
}: {
  constantsSections: ConstantSection[]
  envSections: ConstantSection[]
  functionDescriptions: Record<string, string>
}) {
  const [tab, setTab] = useState<Tab>('constants')
  const [sectionIndex, setSectionIndex] = useState(0)

  const sections = tab === 'env' ? envSections : constantsSections
  const activeSection = sections[sectionIndex] ?? sections[0]
  const functionIndex = buildFunctionIndex(constantsSections, envSections)

  //--------------------------------------------------------------------------------------------
  //  handleTabChange — switches the top-level tab and resets the section selection to the first
  //--------------------------------------------------------------------------------------------
  function handleTabChange(next: Tab) {
    setTab(next)
    setSectionIndex(0)
  }

  return (
    <div className='p-8'>
      <div className='flex gap-2 mb-4 border-b border-gray-200'>
        <MyTab active={tab === 'constants'} onClick={() => handleTabChange('constants')}
          underlineActiveClass={TAB_ACTIVE} underlineInactiveClass={TAB_PASSIVE}>
          Constants
        </MyTab>
        <MyTab active={tab === 'env'} onClick={() => handleTabChange('env')}
          underlineActiveClass={TAB_ACTIVE} underlineInactiveClass={TAB_PASSIVE}>
          .env
        </MyTab>
        <MyTab active={tab === 'functions'} onClick={() => handleTabChange('functions')}
          underlineActiveClass={TAB_ACTIVE} underlineInactiveClass={TAB_PASSIVE}>
          Functions
        </MyTab>
      </div>

      {tab === 'functions' ? (
        <FunctionIndexTable index={functionIndex} functionDescriptions={functionDescriptions} />
      ) : (
        <>
          <div className='flex gap-2 mb-6 flex-wrap'>
            {sections.map((section, i) => (
              <MyTab
                key={section.heading}
                variant='pill'
                active={i === sectionIndex}
                onClick={() => setSectionIndex(i)}
              >
                {section.heading}
              </MyTab>
            ))}
          </div>

          {activeSection && <SectionTable section={activeSection} />}
        </>
      )}
    </div>
  )
}
