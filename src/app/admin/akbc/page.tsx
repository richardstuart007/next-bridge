import Link from 'next/link'

const SECTIONS = [
  {
    href: '/admin/akbc/scrape',
    label: 'Raw Data Scraping',
    description: 'Scrape AKBC year pages and events into ts1–ts6 staging tables.',
    step: '1',
  },
  {
    href: '/admin/akbc/rawdata',
    label: 'Raw Data Viewer',
    description: 'Inspect and validate the contents of the ts* staging tables.',
    step: '2',
  },
  {
    href: '/admin/akbc/build',
    label: 'Build Tables',
    description: 'Populate production tables (tpl_players, tse_sessions, tre_results) from ts7 and ts8.',
    step: '3',
  },
  {
    href: '/admin/akbc/builddata',
    label: 'Build Data Viewer',
    description: 'Inspect and validate the production tables populated by the build steps.',
    step: '4',
  },
  {
    href: '/admin/akbc/stats',
    label: 'Update Stats',
    description: 'Recompute averages, partnership stats and session date sequence from stored results.',
    step: '5',
  },
]

export default function AkbcPage() {
  if (process.env.NEXT_PUBLIC_APPENV_ISADMIN !== 'true') {
    return <div className='p-8 text-gray-500'>Not available</div>
  }
  return (
    <div className='p-8 max-w-2xl'>
      <h1 className='text-xl font-bold text-gray-900 mb-1'>AKBC</h1>
      <p className='text-sm text-gray-400 mb-6'>Legacy pipeline — ts1–ts8. Read-only archive, no longer updated.</p>
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
