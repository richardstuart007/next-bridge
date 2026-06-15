import OwnerLayout from 'nextjs-shared/OwnerLayout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <OwnerLayout>{children}</OwnerLayout>
}
