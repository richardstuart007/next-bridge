'use client'

import Link from 'next/link'
import PlayerRefresh from './PlayerRefresh'
import RawScrape from './RawScrape'

export default function AdminPageClient() {
  return (
    <div className='space-y-8'>
      <div className='flex items-center gap-4'>
        <h1 className='text-xl font-bold text-gray-900'>Admin</h1>
        <Link href='/admin/rawdata'
          className='rounded bg-gray-100 border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200'>
          Raw Data →
        </Link>
      </div>
      <RawScrape />
      <PlayerRefresh />
    </div>
  )
}
