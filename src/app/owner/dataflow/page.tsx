import { Metadata } from 'next'
import DataflowTabs from '@/src/ui/dataflow/DataflowTabs'

export const metadata: Metadata = { title: 'Dataflow' }

export default function DataflowPage() {
  return (
    <div className='w-full p-6 md:p-8'>
      <DataflowTabs />
    </div>
  )
}
