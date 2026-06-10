import CronRun from '@/src/ui/admin/CronRun'

export default function CronPage() {
  return (
    <div className='p-8 max-w-2xl'>
      <h1 className='text-xl font-bold text-gray-900 mb-6'>Full Pipeline Run</h1>
      <CronRun />
    </div>
  )
}
