'use client'

import { useState, useRef, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

export default function HelpButton({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <div ref={ref} className='relative inline-block'>
      <button
        type='button'
        onClick={() => setOpen(v => !v)}
        className={`rounded-full w-5 h-5 text-xs font-bold border flex items-center justify-center flex-shrink-0 ${open ? 'text-blue-600 border-blue-400' : 'text-gray-400 border-gray-300 hover:text-blue-600 hover:border-blue-400'}`}
        title='Help'
      >?</button>
      {open && (
        <div className='absolute left-0 top-7 z-50 w-96 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-sm'>
          <button
            type='button'
            onClick={() => setOpen(false)}
            className='absolute top-2 right-2 text-gray-400 hover:text-gray-600'
          >
            <XMarkIcon className='h-4 w-4' />
          </button>
          {children}
        </div>
      )}
    </div>
  )
}
