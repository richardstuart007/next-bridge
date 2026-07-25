'use client'

import { useState } from 'react'
import RawScrape from '@/src/ui/admin/RawScrape'
import Ts0Links  from '@/src/ui/admin/Ts0Links'
import Ts1Table  from '@/src/ui/admin/Ts1Table'
import Ts2Table  from '@/src/ui/admin/Ts2Table'
import { MyTab } from 'nextjs-shared/MyTab'

type Tab = 'scrape' | 'ts0' | 'ts1' | 'ts2'

const TAB_ACTIVE  = 'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors border-blue-600 text-blue-600'
const TAB_PASSIVE = 'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors border-transparent text-gray-500 hover:text-gray-700'

const TABS: { id: Tab; label: string }[] = [
  { id: 'scrape', label: 'Scrape' },
  { id: 'ts0',    label: 'ts0' },
  { id: 'ts1',    label: 'ts1' },
  { id: 'ts2',    label: 'ts2' },
]

export default function ScrapeTabs() {
  const [active, setActive] = useState<Tab>('scrape')

  return (
    <div>
      <div className='flex gap-0 border-b border-gray-200 mb-6'>
        {TABS.map(t => (
          <MyTab key={t.id} active={active === t.id} onClick={() => setActive(t.id)}
            underlineActiveClass={TAB_ACTIVE} underlineInactiveClass={TAB_PASSIVE}>
            {t.label}
          </MyTab>
        ))}
      </div>

      {active === 'scrape' && <RawScrape />}
      {active === 'ts0'    && <Ts0Links />}
      {active === 'ts1'    && <Ts1Table />}
      {active === 'ts2'    && <Ts2Table />}
    </div>
  )
}
