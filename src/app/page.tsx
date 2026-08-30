//==============================================================================================
//  1) DESCRIPTION
//    HomePage — the app's home route. Renders HomePageClient inside a width-constrained
//    container and a Suspense boundary (HomePageClient reads URL search params).
//==============================================================================================

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
