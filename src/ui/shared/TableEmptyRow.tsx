'use client'

//==============================================================================================
//  1) DESCRIPTION
//    TableEmptyRow — a single colSpan-wide <tr> shown in a table's <tbody> when a filter
//    matches no rows. Local to next-bridge for now; a candidate to promote to nextjs-shared
//    later, since it has no project-specific dependency.
//
//    Parameters:
//      colSpan — number of columns to span
//      message — text to show
//==============================================================================================

export function TableEmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className='py-4 text-center text-sm text-gray-400'>{message}</td>
    </tr>
  )
}
