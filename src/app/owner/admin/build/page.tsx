import BuildTables from '@/src/ui/admin/BuildTables'

export default function BuildPage() {
  return (
    <div className='p-8 max-w-5xl'>
      <h1 className='text-xl font-bold text-gray-900 mb-6'>Build Tables</h1>
      <BuildTables />
    </div>
  )
}
