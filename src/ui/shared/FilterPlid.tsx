'use client'

//==============================================================================================
//  1) DESCRIPTION
//    FilterPlid — a multi-select dropdown over a list of players (by pl_plid) with an optional
//    "select tracked" shortcut. Consolidates two near-identical local components
//    (PlayerPageClient's PartnerSelect, PartnersTable's PlayerSelect) into one.
//
//    Parameters:
//      players       — { plid, name, count, tracked } list to choose from
//      selected      — Set of currently-selected plids (size === players.length means "All")
//      onChange      — called with the new Set
//      overrideClass — extra classes for the trigger button (default WIDTH_PLID)
//
//  2) NOTES
//    "All selected" is represented as a full Set, not an empty one; toggling a single row while
//    All is active narrows to just that row.
//==============================================================================================

import { useState, useEffect, useRef } from 'react'
import { MyButton } from 'nextjs-shared/MyButton'
import { WIDTH_PLID } from '@/src/lib/constants'

export function FilterPlid({ players, selected, onChange, overrideClass = WIDTH_PLID }: {
  players: { plid: number; name: string; count: number; tracked: boolean }[]
  selected: Set<number>
  onChange: (s: Set<number>) => void
  overrideClass?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    //--------------------------------------------------------------------------------------------
    //  handle — closes the dropdown on a mousedown outside the component
    //--------------------------------------------------------------------------------------------
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const allSelected = selected.size === players.length
  const trackedPlids = players.filter(p => p.tracked).map(p => p.plid)
  const label = allSelected ? 'All' : `${selected.size} / ${players.length}`

  //--------------------------------------------------------------------------------------------
  //  toggleAll — selects every player
  //--------------------------------------------------------------------------------------------
  function toggleAll() {
    onChange(new Set(players.map(p => p.plid)))
  }

  //--------------------------------------------------------------------------------------------
  //  selectTracked — selects only the tracked players
  //--------------------------------------------------------------------------------------------
  function selectTracked() {
    onChange(new Set(trackedPlids))
  }

  //--------------------------------------------------------------------------------------------
  //  toggle — adds/removes one plid; from the "All" state, narrows to just that plid
  //--------------------------------------------------------------------------------------------
  function toggle(plid: number) {
    if (allSelected) {
      onChange(new Set([plid]))
    } else {
      const next = new Set(selected)
      if (next.has(plid)) next.delete(plid)
      else next.add(plid)
      onChange(next)
    }
  }

  return (
    <div ref={ref} className='relative'>
      <MyButton type='button' onClick={() => setOpen(v => !v)}
        overrideClass={`w-full text-left rounded border border-gray-300 px-1.5 py-0.5 text-xs bg-white truncate text-gray-700 justify-start h-auto md:h-auto ${overrideClass}`}>
        {label}
      </MyButton>
      {open && (
        <div className='absolute left-0 top-full z-20 bg-white border border-gray-200 rounded shadow-lg min-w-max max-h-56 overflow-y-auto'>
          <label className='flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs border-b border-gray-100 font-medium whitespace-nowrap'>
            <input type='checkbox' checked={allSelected} onChange={toggleAll} />
            All
          </label>
          {trackedPlids.length > 0 && (
            <MyButton type='button' onClick={selectTracked}
              overrideClass='w-full text-left px-3 py-1 hover:bg-green-50 text-xs text-green-700 font-medium border-b border-gray-100 whitespace-nowrap bg-white justify-start h-auto md:h-auto rounded-none'>
              ● Select tracked ({trackedPlids.length})
            </MyButton>
          )}
          {players.map(p => (
            <label key={p.plid} className={`flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer text-xs whitespace-nowrap ${p.tracked ? 'text-green-700' : ''}`}>
              <input type='checkbox' checked={!allSelected && selected.has(p.plid)} onChange={() => toggle(p.plid)} />
              {p.name} <span className='text-gray-400'>({p.count})</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
