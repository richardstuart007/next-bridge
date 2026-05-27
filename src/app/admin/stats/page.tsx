import PlayerRefresh from '@/src/ui/admin/PlayerRefresh'

export default function StatsPage() {
  if (process.env.NEXT_PUBLIC_APPENV_ISADMIN !== 'true') {
    return <div className='p-8 text-gray-500'>Not available</div>
  }
  return (
    <div className='p-8 max-w-4xl'>
      <h1 className='text-xl font-bold text-gray-900 mb-6'>Update Stats</h1>
      <PlayerRefresh />
    </div>
  )
}
