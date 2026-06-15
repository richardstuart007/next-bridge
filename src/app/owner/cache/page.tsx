import OwnerTableCache from 'nextjs-shared/OwnerTableCache'
import { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cache' }

export default function Page() {
  return (
    <div className='w-full md:p-6'>
      <OwnerTableCache />
    </div>
  )
}
