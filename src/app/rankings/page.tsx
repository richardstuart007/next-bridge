import RankingsPageClient from '@/src/ui/rankings/RankingsPageClient'

export default function RankingsPage() {
  return (
    <div className='mx-auto w-full max-w-7xl px-4 py-6 space-y-4'>
      <h1 className='text-xl font-bold text-gray-900'>Rankings</h1>
      <RankingsPageClient />
    </div>
  )
}
