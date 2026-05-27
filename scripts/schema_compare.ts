import path from 'path'
import { readFileSync } from 'fs'
import { Client } from 'pg'

function readEnvVar(envFile: string, varName: string): string {
  try {
    const content = readFileSync(envFile, 'utf8')
    const match = content.match(new RegExp(`^${varName}=(.+)$`, 'm'))
    return match ? match[1].trim() : ''
  } catch {
    return ''
  }
}

async function createClient(envFile: string): Promise<Client> {
  const client = new Client({ connectionString: readEnvVar(envFile, 'POSTGRES_URL') })
  await client.connect()
  return client
}

async function ensureTable(storeClient: Client): Promise<void> {
  await storeClient.query(`DROP TABLE IF EXISTS xsc_schema`)
  await storeClient.query(`
    CREATE TABLE xsc_schema (
      sc_id        SERIAL PRIMARY KEY,
      sc_source    TEXT NOT NULL,
      sc_table     TEXT NOT NULL,
      sc_column    TEXT NOT NULL,
      sc_datatype  TEXT,
      sc_maxlen    INT,
      sc_nullable  TEXT,
      sc_default   TEXT,
      sc_is_pk     BOOLEAN,
      sc_is_unique BOOLEAN,
      sc_has_index BOOLEAN
    )
  `)
}

async function schemaSnapshot(sourceClient: Client, source: string, storeClient: Client = sourceClient): Promise<void> {
  await storeClient.query('DELETE FROM xsc_schema WHERE sc_source = $1', [source])

  const result = await sourceClient.query(`
    SELECT c.table_name, c.column_name, c.data_type, c.character_maximum_length,
           c.is_nullable, c.column_default,
      EXISTS(
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
          AND kcu.table_name = c.table_name AND kcu.column_name = c.column_name
      ) AS is_pk,
      EXISTS(
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE'
          AND kcu.table_name = c.table_name AND kcu.column_name = c.column_name
      ) AS is_unique,
      EXISTS(
        SELECT 1 FROM pg_indexes ix
        WHERE ix.schemaname = 'public' AND ix.tablename = c.table_name
          AND ix.indexdef LIKE '%' || c.column_name || '%'
      ) AS has_index
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position
  `)

  const rows = result.rows
  if (rows.length === 0) return

  const BATCH = 100
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const values: unknown[] = []
    const placeholders = batch.map((r, idx) => {
      const base = idx * 10
      values.push(source, r.table_name, r.column_name, r.data_type,
        r.character_maximum_length, r.is_nullable, r.column_default,
        r.is_pk, r.is_unique, r.has_index)
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10})`
    })
    await storeClient.query(
      `INSERT INTO xsc_schema (sc_source,sc_table,sc_column,sc_datatype,sc_maxlen,sc_nullable,sc_default,sc_is_pk,sc_is_unique,sc_has_index)
       VALUES ${placeholders.join(',')}`, values)
  }
}

const COLS = `sc_table,sc_column,sc_datatype,sc_maxlen,sc_nullable,sc_default,sc_is_pk,sc_is_unique,sc_has_index`

async function schemaCompare(storeClient: Client, source1: string, source2: string) {
  const only1 = await storeClient.query(
    `SELECT ${COLS} FROM xsc_schema WHERE sc_source=$1 EXCEPT SELECT ${COLS} FROM xsc_schema WHERE sc_source=$2 ORDER BY sc_table,sc_column`,
    [source1, source2])
  const only2 = await storeClient.query(
    `SELECT ${COLS} FROM xsc_schema WHERE sc_source=$1 EXCEPT SELECT ${COLS} FROM xsc_schema WHERE sc_source=$2 ORDER BY sc_table,sc_column`,
    [source2, source1])
  return [
    ...only1.rows.map(row => ({ direction: 'only_in_1' as const, row })),
    ...only2.rows.map(row => ({ direction: 'only_in_2' as const, row }))
  ]
}

// ── main ──────────────────────────────────────────────────────────────────────
const [env1, env2] = process.argv.slice(2)

if (!env1 || !env2) {
  console.error('Usage: npm run schema:compare <env1> <env2>')
  console.error('Example: npm run schema:compare locallocal localprod')
  process.exit(1)
}

const root  = path.resolve(process.cwd())
const file1 = path.join(root, `.env.${env1}`)
const file2 = path.join(root, `.env.${env2}`)

const label1 = readEnvVar(file1, 'POSTGRES_DATABASE_LOCATION') || env1
const label2 = readEnvVar(file2, 'POSTGRES_DATABASE_LOCATION') || env2

console.log(`Comparing ${label1} vs ${label2}…`)

const client1 = await createClient(file1)
const client2 = await createClient(file2)

await ensureTable(client1)
await schemaSnapshot(client1, label1)
await schemaSnapshot(client2, label2, client1)

const diffs = await schemaCompare(client1, label1, label2)

await client1.end()
await client2.end()

if (diffs.length === 0) {
  console.log('✓ Schemas are identical')
  process.exit(0)
}

const only1 = diffs.filter(d => d.direction === 'only_in_1')
const only2 = diffs.filter(d => d.direction === 'only_in_2')

if (only1.length > 0) {
  console.log(`\nIn ${label1} but not ${label2}:`)
  only1.forEach(d => console.log(`  ${d.row.sc_table}.${d.row.sc_column}  [${d.row.sc_datatype ?? ''}]`))
}
if (only2.length > 0) {
  console.log(`\nIn ${label2} but not ${label1}:`)
  only2.forEach(d => console.log(`  ${d.row.sc_table}.${d.row.sc_column}  [${d.row.sc_datatype ?? ''}]`))
}

process.exit(1)
