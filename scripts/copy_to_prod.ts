import path from 'path'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execSync, spawnSync, ExecSyncOptions } from 'child_process'

// ── env reading ───────────────────────────────────────────────────────────────
function readEnvVar(envFile: string, varName: string): string {
  try {
    const content = readFileSync(envFile, 'utf8')
    const match = content.match(new RegExp(`^${varName}=(.+)$`, 'm'))
    return match ? match[1].trim() : ''
  } catch {
    return ''
  }
}

// ── postgres binary path ──────────────────────────────────────────────────────
const PG_BIN_PATHS = [
  'C:\\Program Files\\PostgreSQL\\18\\bin',
  'C:\\Program Files\\PostgreSQL\\17\\bin',
  'C:\\Program Files\\PostgreSQL\\16\\bin',
  'C:\\Program Files\\PostgreSQL\\15\\bin',
]

function execPg(cmd: string, options: ExecSyncOptions = {}) {
  const augmentedPath = [...PG_BIN_PATHS, process.env.PATH ?? ''].join(';')
  return execSync(cmd, { ...options, env: { ...process.env, PATH: augmentedPath } })
}

function spawnPg(args: string[]): { stdout: string; stderr: string } {
  const augmentedPath = [...PG_BIN_PATHS, process.env.PATH ?? ''].join(';')
  const result = spawnSync('psql', args, {
    encoding: 'utf8',
    env: { ...process.env, PATH: augmentedPath }
  })
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function stripUnsupportedParams(url: string): string {
  return url.replace(/[&?]timezone=[^&]*/g, '')
}

// ── copy one table ────────────────────────────────────────────────────────────
async function copyTable(sourceUrl: string, targetUrl: string, table: string): Promise<boolean> {
  const cleanSource = stripUnsupportedParams(sourceUrl)
  const cleanTarget = stripUnsupportedParams(targetUrl)
  const tmpFile = join(tmpdir(), `copy_${table}_${Date.now()}.sql`)
  let ok = true

  try {
    // Step 1: dump
    try {
      execPg(`pg_dump --no-owner --clean --if-exists -t ${table} "${cleanSource}" -f "${tmpFile}"`)
    } catch (error) {
      console.error(`  ERROR: ${table} — pg_dump failed: ${(error as Error).message}`)
      return false
    }

    // Step 2: filter unsupported lines
    const filtered = readFileSync(tmpFile, 'utf8')
      .split('\n')
      .filter(line => !line.match(/transaction_timeout/))
      .filter(line => !line.match(/setval/))
      .join('\n')
    writeFileSync(tmpFile, filtered, 'utf8')

    // Step 3: restore
    let psqlOutput = ''
    try {
      psqlOutput = execPg(`psql "${cleanTarget}" -f "${tmpFile}"`, { encoding: 'utf8' }) as string
    } catch (error) {
      psqlOutput = (error as any).stdout ?? ''
      const stderr = ((error as any).stderr ?? '').trim()
      if (stderr) console.error(`  ERROR: ${table} — ${stderr}`)
    }

    for (const line of psqlOutput.split('\n')) {
      const t = line.trim()
      if (/^DROP TABLE/i.test(t))   console.log(`  DROP     ${table}`)
      else if (/^CREATE TABLE/i.test(t)) console.log(`  CREATE   ${table}`)
      else if (/^COPY (\d+)/.test(t)) {
        const m = t.match(/^COPY (\d+)/)!
        console.log(`  COPY     ${table} — ${m[1]} rows`)
      }
      else if (/^CREATE INDEX/i.test(t)) console.log(`  INDEX    ${table}`)
      else if (/ERROR/i.test(t) && t.length > 5) { console.error(`  ERROR    ${table} — ${t}`); ok = false }
    }

    // Step 4: repair sequence
    const seqSql = `DO $$
DECLARE
  r RECORD;
  v BIGINT;
BEGIN
  FOR r IN
    SELECT t.relname, a.attname,
           pg_get_serial_sequence('public.'||t.relname, a.attname) AS seq
    FROM pg_class t
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = '${table}'
      AND pg_get_serial_sequence('public.'||t.relname, a.attname) IS NOT NULL
  LOOP
    EXECUTE format('SELECT COALESCE(MAX(%I),0) FROM %I', r.attname, r.relname) INTO v;
    PERFORM setval(r.seq, GREATEST(v, 1), v > 0);
    RAISE NOTICE 'SEQFIX:%:%', r.relname, v;
  END LOOP;
END $$;
`
    const seqFile = join(tmpdir(), `seq_${table}_${Date.now()}.sql`)
    writeFileSync(seqFile, seqSql, 'utf8')
    try {
      const { stderr } = spawnPg([cleanTarget, '-f', seqFile])
      for (const line of stderr.split('\n')) {
        const m = line.match(/SEQFIX:([^:]+):(\d+)/)
        if (m) console.log(`  SEQFIX   ${m[1]} → ${m[2]}`)
      }
    } finally {
      if (existsSync(seqFile)) unlinkSync(seqFile)
    }

  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile)
  }

  return ok
}

// ── tables to copy ────────────────────────────────────────────────────────────
// Excluded: tsc_schema (temp schema comparison table)
//           tlg_logging (don't overwrite prod logs)
//           ttt_tournament_types (removed from codebase)
const TABLES = [
  'tpl_players',
  'tse_sessions',
  'tre_results',
  'ta1_player_stats',
  'ta2_partner_stats',
  'tpa_partners',
  'ts9_nzb_results',
  'ts10_nzb_missing_sessions',
  'tcl_clubs',
  'tgr_grades',
  'trk_ranks',
  'tet_event_types',
]

// ── main ──────────────────────────────────────────────────────────────────────
const [env1 = 'locallocal', env2 = 'localprod'] = process.argv.slice(2)

const root  = path.resolve(process.cwd())
const file1 = path.join(root, `.env.${env1}`)
const file2 = path.join(root, `.env.${env2}`)

const sourceUrl  = readEnvVar(file1, 'POSTGRES_URL')
const targetUrl  = readEnvVar(file2, 'POSTGRES_URL')
const sourceLabel = readEnvVar(file1, 'POSTGRES_DATABASE_LOCATION') || env1
const targetLabel = readEnvVar(file2, 'POSTGRES_DATABASE_LOCATION') || env2

if (!sourceUrl) { console.error(`No POSTGRES_URL found in ${file1}`); process.exit(1) }
if (!targetUrl) { console.error(`No POSTGRES_URL found in ${file2}`); process.exit(1) }

console.log(`Copying ${sourceLabel} → ${targetLabel}`)
console.log(`Tables: ${TABLES.join(', ')}\n`)

let anyError = false
for (const table of TABLES) {
  const ok = await copyTable(sourceUrl, targetUrl, table)
  if (!ok) anyError = true
}

console.log(anyError ? '\nDone with errors.' : '\nDone.')
process.exit(anyError ? 1 : 0)
