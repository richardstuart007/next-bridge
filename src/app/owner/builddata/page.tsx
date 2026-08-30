//==============================================================================================
//  1) DESCRIPTION
//    BuildDataPage — the /owner/builddata route. Renders the tabbed BuildDataViewer for
//    inspecting the staging and production tables, under a heading.
//==============================================================================================

import BuildDataViewer from '@/src/ui/admin/BuildDataViewer'

export default function BuildDataPage() {
  return (
    <div className='p-8'>
      <h1 className='text-xl font-bold text-gray-900 mb-6'>Build Data Viewer</h1>
      <BuildDataViewer />
    </div>
  )
}
