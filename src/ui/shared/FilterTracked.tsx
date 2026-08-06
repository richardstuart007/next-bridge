'use client'

//----------------------------------------------------------------------------------------------
//  FilterTracked — "tracked only" filter checkbox for pl_tracked, used in every table's filter
//  row that offers a tracked-only toggle.
//----------------------------------------------------------------------------------------------
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
