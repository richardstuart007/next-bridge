//==============================================================================================
//  1) DESCRIPTION
//    PlayerPage — the /player/[id] route. Awaits the route params and renders PlayerPageClient
//    for the numeric player id inside a Suspense boundary.
//
//    Parameters:
//      params — route params promise resolving to { id } (the pl_plid, as a string)
//==============================================================================================

import { Suspense } from 'react'
import PlayerPageClient from '@/src/ui/player/PlayerPageClient'

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={<div className='text-sm text-gray-500 py-8 text-center'>Loading…</div>}>
      <PlayerPageClient playerId={parseInt(id, 10)} />
    </Suspense>
  )
}
