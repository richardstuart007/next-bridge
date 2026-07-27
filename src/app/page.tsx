import { Suspense } from 'react'
import HomePageClient from '@/src/ui/home/HomePageClient'

export default function HomePage() {
  return (
    <div className='w-full max-w-7xl px-4 py-6'>
      <Suspense>
        <HomePageClient />
      </Suspense>
    </div>
  )
}
