import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Link from 'next/link'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin']
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin']
})

export const metadata: Metadata = {
  title: 'Bridge Results Tracker',
  description: 'Track Auckland Bridge Club session results and player performance'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  const DB_LOCATION = process.env.POSTGRES_DATABASE_LOCATION ?? 'unknown'
  const IS_DEV = process.env.NEXT_PUBLIC_APPENV_ISDEV === 'true'
  return (
    <html
      lang='en'
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className='min-h-full flex flex-col bg-background text-foreground'>
        {IS_DEV && (
          <div className='fixed top-2 right-2 z-50 rounded bg-yellow-200 px-2 py-0.5 text-xxs font-bold text-yellow-800 opacity-70'>
            {DB_LOCATION}
          </div>
        )}
        <header className='border-b border-gray-200 bg-white'>
          <div className='mx-auto flex max-w-7xl items-center justify-between px-4 py-3'>
            <h1 className='text-lg font-bold text-gray-900'>Bridge Results Tracker</h1>
            <nav className='flex gap-4 text-sm'>
              <Link href='/' className='text-gray-600 hover:text-gray-900'>Home</Link>
              <Link href='/rankings' className='text-gray-600 hover:text-gray-900'>Rankings</Link>
              {IS_DEV && <Link href='/owner' className='text-gray-600 hover:text-gray-900'>Owner</Link>}
            </nav>
          </div>
        </header>
        <main className='mx-auto w-full max-w-7xl flex-1 px-4 py-6'>
          {children}
        </main>
      </body>
    </html>
  )
}
