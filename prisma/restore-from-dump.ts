import { readFileSync } from 'node:fs'

import { PrismaClient } from '@prisma/client'

/**
 * Restores a JSON dump produced by the export in the recovery runbook.
 *
 *     npx tsx prisma/restore-from-dump.ts /path/to/jnu-neon-dump-YYYY-MM-DD.json
 *
 * Written after the production VPS was terminated for an unpaid invoice and
 * permanently deleted, disk image and all. The nightly backups lived on that
 * same disk, so they went with it; what survived was the old Neon database and
 * this dump taken from it. Keeping the restore in the repository means the
 * next rebuild starts from a command rather than from memory.
 *
 * Order matters. Faculties exist before programmes, students before results
 * and certificates, uploads before anything referencing a photo — otherwise a
 * foreign key fails halfway and leaves a partial database that looks restored.
 *
 * Safe to run against a database that already has rows: each record is
 * upserted on its primary key, so a second run changes nothing and a partial
 * first run can simply be repeated.
 */

type Dump = {
  _takenAt?: string
  tables: Record<string, Record<string, unknown>[] | string>
}

/** Parent before child. Anything not listed here is skipped deliberately. */
const ORDER = [
  'setting',
  'media',
  'upload',
  'page',
  'notice',
  'slide',
  'faculty',
  'programme',
  'staff',
  'student',
  'result',
  'certificate',
  'correctionRequest',
  'application',
  'enquiry',
] as const

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: npx tsx prisma/restore-from-dump.ts <dump.json>')
    process.exit(1)
  }

  const dump: Dump = JSON.parse(readFileSync(file, 'utf8'))
  console.log(`Dump taken ${dump._takenAt ?? 'at an unrecorded time'}\n`)

  const db = new PrismaClient()
  let total = 0

  try {
    for (const model of ORDER) {
      const rows = dump.tables[model]

      if (typeof rows === 'string') {
        console.log(`  –  ${model}: not in dump (${rows})`)
        continue
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(`  –  ${model}: nothing to restore`)
        continue
      }

      // Dates come back from JSON as strings; Prisma wants Date objects.
      const revived = rows.map((row) => {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(row)) {
          out[k] =
            typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v) ? new Date(v) : v
        }
        return out
      })

      const client = (db as unknown as Record<string, {
        upsert: (a: unknown) => Promise<unknown>
      }>)[model]

      let done = 0
      for (const row of revived) {
        // Upsert rather than create: a repeated run is then harmless, which
        // matters when a restore fails partway and has to be run again.
        await client.upsert({ where: { id: row.id }, update: row, create: row })
        done++
      }

      console.log(`  ✓  ${model}: ${done}`)
      total += done
    }

    console.log(`\n${total} records restored.`)
    console.log('Now: npm run build && sudo systemctl restart jnu')
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error('\nRestore failed:', e instanceof Error ? e.message : e)
  console.error('Fix the cause and run it again — the restore is idempotent.')
  process.exit(1)
})
