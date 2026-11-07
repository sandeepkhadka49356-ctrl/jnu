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
 * REPLACES the tables it restores. Every table present in the dump is emptied
 * first, children before parents, then refilled parents before children.
 *
 * Merging was tried and is wrong. A fresh server has already been seeded with
 * default content, and those rows carry different ids but the same natural
 * keys — so upserting by id tries to insert a second page with an existing
 * path and dies on the unique constraint. A restore is not a merge: the dump
 * is the authority, and anything the dump does not contain was not in the
 * database when it was taken.
 *
 * This means it will DISCARD rows added since the dump. That is what restoring
 * a backup does, but it is worth knowing before running it against a database
 * that has been in use.
 */

type Dump = {
  _takenAt?: string
  tables: Record<string, Record<string, unknown>[] | string>
}

/**
 * The primary key of each model that is not `id`.
 *
 * Setting is keyed by `key` — it is a key/value table, so a cuid would be a
 * second identity for a row that already has one. Everything else uses `id`.
 * Getting this wrong fails on the very first table with a Prisma error about
 * SettingWhereUniqueInput, which does not obviously mean "wrong column".
 */
const PRIMARY_KEY: Record<string, string> = { setting: 'key' }

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
    /*
     * Empty first, children before parents, or a delete fails on a foreign
     * key held by a row we are about to remove anyway.
     */
    console.log('Clearing tables the dump will replace...')
    for (const model of [...ORDER].reverse()) {
      const rows = dump.tables[model]
      if (!Array.isArray(rows) || rows.length === 0) continue
      const client = (db as unknown as Record<string, {
        deleteMany: (a?: unknown) => Promise<{ count: number }>
      }>)[model]
      const { count } = await client.deleteMany({})
      if (count > 0) console.log(`  ×  ${model}: removed ${count}`)
    }
    console.log()

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

      const pk = PRIMARY_KEY[model] ?? 'id'
      let done = 0
      for (const row of revived) {
        // Upsert rather than create: a repeated run is then harmless, which
        // matters when a restore fails partway and has to be run again.
        await client.upsert({ where: { [pk]: row[pk] }, update: row, create: row })
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
