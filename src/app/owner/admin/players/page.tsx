import PlayersAdmin from '@/src/ui/admin/PlayersAdmin'

export default function PlayersAdminPage() {
  return (
    <div className='p-8 max-w-4xl'>
      <h1 className='text-xl font-bold text-gray-900 mb-6'>Players</h1>
      <PlayersAdmin />
    </div>
  )
}
