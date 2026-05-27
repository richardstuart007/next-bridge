import DbToolsTabs from './_tabs'

export default function DbToolsPage() {
  return (
    <div className='p-8 max-w-4xl'>
      <h1 className='text-xl font-bold text-gray-900 mb-6'>Database Tools</h1>
      <DbToolsTabs baseDir={process.cwd().replace(/\\/g, '/')} />
    </div>
  )
}
