import ScrapeTabs from '@/src/ui/admin/ScrapeTabs'
import Link from 'next/link'

export default function ScrapePage() {
  if (process.env.NEXT_PUBLIC_APPENV_ISADMIN !== 'true') {
    return <div className='p-8 text-gray-500'>Not available</div>
  }
  return (
    <div className='p-8 max-w-6xl'>
      <div className='flex items-center gap-4 mb-6'>
        <Link href='/admin'
          className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200'>
          ← Admin
        </Link>
        <h1 className='text-xl font-bold text-gray-900'>Raw Data Scraping</h1>
      </div>
      <ScrapeTabs />
    </div>
  )
}
