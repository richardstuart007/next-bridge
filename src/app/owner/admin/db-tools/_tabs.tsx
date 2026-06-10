'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const SchemaSync = dynamic(() => import('nextjs-shared/SchemaSync'), { ssr: false })
const CopyTable  = dynamic(() => import('nextjs-shared/CopyTable'),  { ssr: false })

const TABS = ['Schema', 'Data-copy'] as const
type Tab = typeof TABS[number]

export default function DbToolsTabs({ baseDir }: { baseDir: string }) {
  const [active, setActive] = useState<Tab>('Schema')

  return (
    <div>
      <div className='flex border-b border-gray-200 mb-6'>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {active === 'Schema'    && <SchemaSync baseDir={baseDir} caller='db-tools/schema' />}
      {active === 'Data-copy' && <CopyTable  baseDir={baseDir} caller='db-tools/copy' />}
    </div>
  )
}
