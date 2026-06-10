import ScrapeTabs from '@/src/ui/admin/ScrapeTabs'

export default function ScrapePage() {
  return (
    <div className='p-8 max-w-6xl'>
      <h1 className='text-xl font-bold text-gray-900 mb-6'>Raw Data Scraping</h1>
      <ScrapeTabs />
    </div>
  )
}
