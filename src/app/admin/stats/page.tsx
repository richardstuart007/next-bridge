import PlayerRefresh from '@/src/ui/admin/PlayerRefresh'
import Link from 'next/link'

export default function StatsPage() {
  if (process.env.NEXT_PUBLIC_APPENV_ISADMIN !== 'true') {
    return <div className='p-8 text-gray-500'>Not available</div>
  }
  return (
    <div className='p-8 max-w-4xl'>
      <div className='flex items-center gap-4 mb-6'>
        <Link href='/admin'
          className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200'>
          ← Admin
        </Link>
        <h1 className='text-xl font-bold text-gray-900'>Update Stats</h1>
      </div>
      <PlayerRefresh />
    </div>
  )
}
