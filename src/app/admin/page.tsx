import Link from 'next/link'

const SECTIONS = [
  {
    href: '/admin/scrape',
    label: 'Raw Data Scraping',
    description: 'Import NZ Bridge results by date range into ts1/ts2 staging tables.',
    step: '1',
  },
  {
    href: '/admin/build',
    label: 'Build Tables',
    description: 'Populate production tables (tse_sessions, tre_results, tpa_partners) from ts1/ts2.',
    step: '2',
  },
  {
    href: '/admin/stats',
    label: 'Update Stats',
    description: 'Recompute averages and partnership stats from stored results.',
    step: '3',
  },
  {
    href: '/admin/builddata',
    label: 'Build Data Viewer',
    description: 'Inspect and validate the production tables populated by the build steps.',
    step: '4',
  },
  {
    href: '/admin/db-tools',
    label: 'Database Tools',
    description: 'Compare schemas between local and prod databases, and copy tables between them.',
    step: '✦',
  },
]

export default function AdminPage() {
  if (process.env.NEXT_PUBLIC_APPENV_ISADMIN !== 'true') {
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
