//==============================================================================================
//  1) DESCRIPTION
//    SessionPage — the /session/[id] route. Awaits the route params and renders
//    SessionPageClient for the numeric session id.
//
//    Parameters:
//      params — route params promise resolving to { id } (the se_seid, as a string)
//==============================================================================================

import SessionPageClient from '@/src/ui/session/SessionPageClient'

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SessionPageClient sessionId={parseInt(id, 10)} />
}
