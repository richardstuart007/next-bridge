//==============================================================================================
//  1) DESCRIPTION
//    PipelinePage — the /owner/pipeline route. Renders the PipelineTable (per-step Run buttons
//    plus "Run All") under a heading with the PipelineHelp popover.
//==============================================================================================

import PipelineTable from '@/src/ui/admin/PipelineTable'
import PipelineHelp from '@/src/ui/admin/PipelineHelp'

export default function PipelinePage() {
  return (
    <div className='p-8'>
      <div className='flex items-center gap-2 mb-6'>
        <h1 className='text-xl font-bold text-gray-900'>Pipeline</h1>
        <PipelineHelp />
      </div>
      <PipelineTable />
    </div>
  )
}
