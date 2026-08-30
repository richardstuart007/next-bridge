//==============================================================================================
//  1) DESCRIPTION
//    RootLayout — the app's root layout. Wraps every page in <html>/<body> with the Geist
//    sans/mono fonts, a NuqsAdapter for URL query-state, and (in dev only) a DevLayoutHeader
//    showing the current database location.
//
//    Parameters:
//      children — the routed page content
//==============================================================================================

import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { DevLayoutHeader } from 'nextjs-shared/DevLayoutHeader'

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
        <NuqsAdapter>
          {IS_DEV && <DevLayoutHeader dbLocation={DB_LOCATION} />}
          <main className='w-full flex-1'>
            {children}
          </main>
        </NuqsAdapter>
      </body>
    </html>
  )
}
