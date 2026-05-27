import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import SchemaCompareClient from './_schema-compare'
import CopyTable from 'nextjs-shared/CopyTable'

function readVar(file: string, varName: string): string {
  try {
    const content = readFileSync(file, 'utf8')
    const match = content.match(new RegExp(`^${varName}=(.+)$`, 'm'))
    return match ? match[1].trim() : ''
  } catch { return '' }
}

export default function DbToolsPage() {
  const baseDir = process.cwd()
  const envFiles = readdirSync(baseDir)
    .filter(f => /^\.env\./.test(f))
    .sort()
    .map(file => ({
      file,
      fullPath: join(baseDir, file).replace(/\\/g, '/'),
      location: readVar(join(baseDir, file), 'POSTGRES_DATABASE_LOCATION'),
    }))

  return (
    <div className='p-8 max-w-4xl space-y-10'>
      <div>
        <h1 className='text-xl font-bold text-gray-900'>Database Tools</h1>
        <p className='text-xs text-gray-400 mt-0.5'>Compare schemas between environments</p>
      </div>
      <SchemaCompareClient envFiles={envFiles} />
      <CopyTable baseDir={process.cwd().replace(/\\/g, '/')} caller='db-tools/copy' />
    </div>
  )
}
