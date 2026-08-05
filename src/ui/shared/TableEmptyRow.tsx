'use client'

//----------------------------------------------------------------------------------------------
//  TableEmptyRow — single colSpan-wide <tr> shown in a table's <tbody> when a filter matches no
//  rows. Local to next-bridge for now; a candidate to promote to nextjs-shared later, since it
//  has no project-specific dependency.
//----------------------------------------------------------------------------------------------
export function TableEmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className='py-4 text-center text-sm text-gray-400'>{message}</td>
    </tr>
  )
}
