import { redirect } from 'next/navigation'

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_APPENV_ISDEV !== 'true') redirect('/')

  return (
    <div>
      <nav className='flex gap-6 mb-4 pb-2 border-b border-gray-200 text-sm'>
        <a href='/owner/admin' className='text-gray-600 hover:text-gray-900'>Admin</a>
      </nav>
      {children}
    </div>
  )
}
