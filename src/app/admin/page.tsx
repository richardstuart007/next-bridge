import Link from 'next/link'

const SECTIONS = [
  {
    href: '/admin/scrape',
    label: 'Raw Data Scraping',
    description: 'Scrape AKBC year pages and events into ts* staging tables.',
    step: '1',
  },
  {
    href: '/admin/rawdata',
    label: 'Raw Data Viewer',
    description: 'Inspect and validate the contents of the ts* staging tables.',
    step: '2',
  },
  {
    href: '/admin/build',
    label: 'Build Tables',
    description: 'Populate tse_sessions, trw_results_raw and tre_results from ts* data.',
    step: '3',
  },
  {
    href: '/admin/stats',
    label: 'Update Stats',
    description: 'Refresh player NZ numbers, averages, partnerships and lookup tables.',
    step: '4',
  },
]

export default function AdminPage() {
  if (process.env.NODE_ENV !== 'development') {
    return <div className='p-8 text-gray-500'>Not available</div>
  }
  return (
    <div className='p-8 max-w-2xl'>
      <h1 className='text-xl font-bold text-gray-900 mb-6'>Admin</h1>
      <div className='space-y-3'>
        {SECTIONS.map(s => (
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
