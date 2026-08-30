'use client'

//==============================================================================================
//  1) DESCRIPTION
//    FilterTracked — a "tracked only" checkbox for the pl_tracked column, used in every table
//    filter row that offers a tracked-only toggle.
//
//    Parameters:
//      checked  — current checkbox state
//      onChange — called with the new boolean
//      title    — hover tooltip (default 'Tracked only')
//==============================================================================================

export function FilterTracked({ checked, onChange, title = 'Tracked only' }: {
  checked: boolean
  onChange: (v: boolean) => void
  title?: string
}) {
  return (
    <label className='flex items-center justify-center cursor-pointer' title={title}>
      <input type='checkbox' checked={checked} onChange={e => onChange(e.target.checked)} />
    </label>
  )
}
