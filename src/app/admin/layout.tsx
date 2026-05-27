'use client'

import { MyLink } from 'nextjs-shared/MyLink'
import { usePathname } from 'next/navigation'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isSubPage = pathname !== '/admin'

  return (
    <div>
      {isSubPage && (
        <div className='px-8 pt-4'>
          <MyLink
            href={{ reference: 'admin', pathname: '/admin' }}
            overrideClass='bg-transparent hover:bg-gray-100 h-auto px-2 py-1 text-xs !text-gray-500 rounded'
          >
            ← Admin
          </MyLink>
        </div>
      )}
      {children}
    </div>
  )
}
