'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAkbc = pathname.startsWith('/admin/akbc')

  return (
    <div>
      <div className='border-b border-gray-200 bg-white px-8 flex gap-0'>
        <Link href='/admin'
          className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            !isAkbc
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          Admin
        </Link>
        <Link href='/admin/akbc'
          className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            isAkbc
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          AKBC
        </Link>
      </div>
      {children}
    </div>
  )
}
