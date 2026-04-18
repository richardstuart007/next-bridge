import SessionPageClient from '@/src/ui/session/SessionPageClient'

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SessionPageClient sessionId={parseInt(id, 10)} />
}
