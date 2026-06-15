'use client'
import { usePathname } from 'next/navigation'

export function DevHeader({ dbLocation }: { dbLocation: string }) {
  const pathname = usePathname()

  function handleOwnerClick() {
    if (!pathname.startsWith('/owner')) {
      sessionStorage.setItem('ownerFrom', pathname)
    }
  }

  return (
    <header className='flex items-center justify-between border-b border-gray-200 px-4 py-2 text-sm'>
      <a href='/owner' onClick={handleOwnerClick} className='text-gray-600 hover:text-gray-900'>
        Owner
      </a>
      <span className='rounded bg-yellow-200 px-2 py-0.5 text-xs font-bold text-yellow-800 opacity-70'>
        {dbLocation}
      </span>
    </header>
  )
}
