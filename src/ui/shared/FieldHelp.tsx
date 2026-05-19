'use client'

import { useState } from 'react'

export default function FieldHelp({ text, className = '' }: { text: string; className?: string }) {
  const [show, setShow] = useState(false)
  return (
    <span className={className}>
      <span className='relative inline-flex items-center'>
        <span
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
          className='rounded-full w-4 h-4 text-xs font-bold border border-gray-300 text-gray-400 hover:text-blue-600 hover:border-blue-400 flex items-center justify-center flex-shrink-0 cursor-default select-none'
        >?</span>
        {show && (
          <div className='absolute left-0 top-full mt-1 z-50 w-64 bg-gray-800 text-white text-xs rounded px-2 py-1.5 shadow-lg pointer-events-none whitespace-normal'>
            {text}
          </div>
        )}
      </span>
    </span>
  )
}
