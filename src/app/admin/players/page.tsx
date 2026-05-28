import PlayersAdmin from '@/src/ui/admin/PlayersAdmin'

export default function PlayersAdminPage() {
  if (process.env.NEXT_PUBLIC_APPENV_ISADMIN !== 'true') {
    return <div className='p-8 text-gray-500'>Not available</div>
  }
  return (
    <div className='p-8 max-w-4xl'>
      <h1 className='text-xl font-bold text-gray-900 mb-6'>Players</h1>
      <PlayersAdmin />
    </div>
  )
}
