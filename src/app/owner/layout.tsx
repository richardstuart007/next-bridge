//==============================================================================================
//  1) DESCRIPTION
//    Layout — the /owner section layout. Wraps its children in nextjs-shared's OwnerLayout.
//
//    Parameters:
//      children — the routed /owner page content
//==============================================================================================

import OwnerLayout from 'nextjs-shared/OwnerLayout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <OwnerLayout>{children}</OwnerLayout>
}
