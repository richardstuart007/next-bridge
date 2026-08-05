import { Suspense } from 'react'
import HomePageClient from '@/src/ui/home/HomePageClient'

export default function HomePage() {
  return (
    <div className='w-full max-w-[1920px] px-4 py-6'>
      <Suspense>
        <HomePageClient />
      </Suspense>
    </div>
  )
}
