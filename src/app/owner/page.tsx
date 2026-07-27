import Link from 'next/link'
import OwnerPage from 'nextjs-shared/OwnerPage'
import OwnerTableCache from 'nextjs-shared/OwnerTableCache'
import OwnerTableLogging from 'nextjs-shared/OwnerTableLogging'
import DataflowTabs from '@/src/ui/dataflow/DataflowTabs'

const TOOLS = [
  { href: '/owner/pipeline', label: 'Pipeline', description: 'Discover, scrape, build, and recompute stats — run each step individually or all in sequence.', step: '▶' },
  { href: '/owner/players', label: 'Players', description: 'Manage which players are tracked (all results scraped automatically).', step: '✦' },
  { href: '/owner/builddata', label: 'Build Data Viewer', description: 'Inspect and validate the staging and production tables populated by the pipeline.', step: '1' },
]

function ToolsPanel() {
  return (
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
  )
}

export default function Page() {
  return (
    <OwnerPage
      tabs={[
        { label: 'Tools', content: <ToolsPanel /> },
        { label: 'Logging', content: <OwnerTableLogging /> },
        { label: 'Cache', content: <OwnerTableCache /> },
        { label: 'Dataflow', content: <div className='p-6 md:p-8'><DataflowTabs /></div> },
      ]}
    />
  )
}
