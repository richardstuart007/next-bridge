import ScrapeTabs from '@/src/ui/admin/ScrapeTabs'

export default function ScrapePage() {
  if (process.env.NEXT_PUBLIC_APPENV_ISADMIN !== 'true') {
    return <div className='p-8 text-gray-500'>Not available</div>
  }
  return (
    <div className='p-8 max-w-6xl'>
      <h1 className='text-xl font-bold text-gray-900 mb-6'>Raw Data Scraping</h1>
      <ScrapeTabs />
    </div>
  )
}
