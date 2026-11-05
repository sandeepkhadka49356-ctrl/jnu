import { writeFileSync } from 'node:fs'

import { PrismaClient } from '@prisma/client'

/**
 * Dumps every table to one JSON file.
 *
 *     npx tsx prisma/export-dump.ts /path/to/output-dir
 *
 * The companion to restore-from-dump.ts, and the thing whose absence cost a
 * production server: the nightly pg_dump wrote to /srv/backups on the same
 * disk as the database, so when the VPS was deleted the backups went with it.
 *
 * Run this from a machine that is NOT the server, and put the file somewhere
 * that is not the server either. A backup on the same disk is a copy, not a
 * backup.
 *
 * The output contains students, results and certificates — personal data under
 * the DPDP Act. Keep it out of the repository, off shared drives, and off
 * email.
 */

const MODELS = [
  'setting', 'media', 'upload', 'page', 'notice', 'slide', 'faculty',
  'programme', 'staff', 'student', 'result', 'certificate',
  'correctionRequest', 'application', 'enquiry', 'auditLog',
] as const

async function main() {
  const dir = process.argv[2] ?? '.'
  const db = new PrismaClient()
  const dump: { _takenAt: string; tables: Record<string, unknown> } = {
    _takenAt: new Date().toISOString(),
    tables: {},
  }

  try {
    for (const model of MODELS) {
      try {
        const client = (db as unknown as Record<string, { findMany: () => Promise<unknown[]> }>)[model]
        dump.tables[model] = await client.findMany()
      } catch (e) {
        dump.tables[model] = `SKIP: ${e instanceof Error ? e.message.split('\n')[0] : e}`
      }
    }

    const file = `${dir}/jnu-dump-${new Date().toISOString().slice(0, 10)}.json`
    writeFileSync(file, JSON.stringify(dump, null, 1))

    console.log(`Wrote ${file}`)
    for (const [k, v] of Object.entries(dump.tables)) {
      console.log(`  ${k.padEnd(20)}${Array.isArray(v) ? v.length : v}`)
    }
    console.log('\nContains personal data. Store it somewhere private, and NOT on the server.')
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
