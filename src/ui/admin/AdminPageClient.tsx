'use client'

import SessionImport from './SessionImport'
import PlayerRefresh from './PlayerRefresh'

export default function AdminPageClient() {
  return (
    <div className='space-y-8'>
      <h1 className='text-xl font-bold text-gray-900'>Admin</h1>
      <SessionImport />
      <PlayerRefresh />
    </div>
  )
}
