'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import OwnerTableCache from 'nextjs-shared/OwnerTableCache'
import OwnerTableLogging from 'nextjs-shared/OwnerTableLogging'

const TABS = ['Tools', 'Logging', 'Cache'] as const
type Tab = typeof TABS[number]

const TOOLS = [
  { href: '/owner/cron', label: 'Full Pipeline Run', description: 'Discover, scrape, build, and recompute stats in one click — runs steps 1 → 2 → 3 in sequence.', step: '▶' },
  { href: '/owner/players', label: 'Players', description: 'Manage which players are tracked (all results scraped automatically).', step: '✦' },
  { href: '/owner/scrape', label: 'Raw Data Scraping', description: 'Import NZ Bridge results by date range into ts1/ts2 staging tables.', step: '1' },
  { href: '/owner/build', label: 'Build Tables', description: 'Populate production tables (tse_sessions, tre_results, tpa_partners) from ts1/ts2.', step: '2' },
  { href: '/owner/stats', label: 'Update Stats', description: 'Recompute averages and partnership stats from stored results.', step: '3' },
  { href: '/owner/builddata', label: 'Build Data Viewer', description: 'Inspect and validate the production tables populated by the build steps.', step: '4' },
]

export default function OwnerPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Tools')

  return (
    <div>
      <nav className='flex gap-6 px-8 pt-6 pb-0 border-b border-gray-200 text-sm'>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={
              activeTab === tab
                ? 'pb-2 border-b-2 border-gray-900 text-gray-900 font-medium'
                : 'pb-2 text-gray-500 hover:text-gray-700'
            }
          >
            {tab}
          </button>
        ))}
      </nav>
      <Suspense>
        {activeTab === 'Tools' && (
          <div className='p-8 max-w-2xl'>
            <div className='space-y-3'>
              {TOOLS.map(s => (
                <Link key={s.href} href={s.href}
                  className='flex items-start gap-4 rounded border border-gray-200 p-4 hover:bg-gray-50 transition-colors'>
                  <span className='flex-none w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center'>
                    {s.step}
                  </span>
                  <div>
                    <p className='text-sm font-semibold text-gray-800'>{s.label}</p>
                    <p className='text-xs text-gray-500 mt-0.5'>{s.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'Logging' && <OwnerTableLogging />}
        {activeTab === 'Cache' && <OwnerTableCache />}
      </Suspense>
    </div>
  )
}
