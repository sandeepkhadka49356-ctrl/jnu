import { Prisma } from '@prisma/client'

import { db } from '@/lib/db'
import { audit } from '@/lib/auth'
import { requirePermission } from '@/lib/admin-route'
import { marksProblem } from '@/lib/results-validate'
import { ok, fail, handleError, readJson } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** GET /api/results — staff only. Full list including unpublished drafts. */
export async function GET() {
  try {
    await requirePermission('results.manage')
    const rows = await db.result.findMany({ orderBy: { rollNo: 'asc' }, take: 500 })
    return ok({ results: rows.map((r) => ({ ...r, subjects: JSON.parse(r.subjects) })) })
  } catch (e) {
    return handleError(e)
  }
}

type NewResult = {
  rollNo?: string
  studentName?: string
  programme?: string
  semester?: string
  examSession?: string
  marksObtained?: number
  marksMax?: number
  sgpa?: number
  status?: string
  subjects?: unknown[]
}

const STATUSES = ['PASS', 'FAIL', 'ATKT', 'WITHHELD']

/**
 * POST /api/results — staff only. Creates one result, or many when `rows` is
 * supplied (CSV import).
 *
 * Everything is created unpublished regardless of what the client sends, so a
 * bad import can be corrected before any student sees it.
 */
export async function POST(req: Request) {
  try {
    const user = await requirePermission('results.manage')
    const body = await readJson<NewResult & { rows?: NewResult[] }>(req)
    if (!body) return fail('Invalid request body.')

    const incoming = body.rows ?? [body]
    if (incoming.length === 0) return fail('No rows supplied.')
    if (incoming.length > 500) return fail('Import is limited to 500 rows at a time.')

    const data: Prisma.ResultCreateManyInput[] = []
    for (const [i, r] of incoming.entries()) {
      if (!r.rollNo?.trim() || !r.studentName?.trim()) {
        return fail('Every row needs a roll number and a student name.')
      }
      if (!r.semester?.trim() || !r.examSession?.trim()) {
        return fail('Every row needs a semester and an exam session.')
      }
      const status = (r.status ?? 'PASS').toUpperCase()
      if (!STATUSES.includes(status)) {
        return fail(`Status must be one of ${STATUSES.join(', ')}.`)
      }

      const label = incoming.length > 1 ? `Row ${i + 1} (${r.rollNo.trim()})` : r.rollNo.trim()
      const problem = marksProblem(r, label)
      if (problem) return fail(problem)

      data.push({
        rollNo: r.rollNo.trim().toUpperCase(),
        studentName: r.studentName.trim(),
        programme: r.programme?.trim() ?? '',
        semester: r.semester.trim(),
        examSession: r.examSession.trim(),
        subjects: JSON.stringify(Array.isArray(r.subjects) ? r.subjects : []),
        marksObtained: Number(r.marksObtained) || 0,
        marksMax: Number(r.marksMax) || 0,
        sgpa: Number(r.sgpa) || 0,
        status,
        published: false,
      })
    }

    /*
     * Every roll number must already be in the student register.
     *
     * Not a formality. /api/results/lookup requires BOTH a Student row and a
     * published Result before it will show anything, and returns the same
     * "no published result was found" either way so the endpoint cannot be
     * used to discover which roll numbers exist. So a result filed against a
     * roll number with no student is invisible to the student, indefinitely,
     * and the only symptom is a candidate being told their result does not
     * exist — days after the exam cell watched it save and publish without
     * complaint. Catching it here, at the write, is the only point where the
     * person who can fix it is still looking.
     *
     * One query for the whole import, not one per row.
     */
    const rolls = [...new Set(data.map((d) => d.rollNo))]
    const known = new Set(
      (await db.student.findMany({ where: { rollNo: { in: rolls } }, select: { rollNo: true } }))
        .map((s) => s.rollNo)
    )
    const unknown = rolls.filter((r) => !known.has(r))

    if (unknown.length > 0) {
      const shown = unknown.slice(0, 5).join(', ')
      const rest = unknown.length > 5 ? ` and ${unknown.length - 5} more` : ''
      return fail(
        unknown.length === 1
          ? `No student is registered with roll number ${shown}. Add the student under Students first — ` +
            `a result on its own is never visible, because the results page matches it to a student record.`
          : `${unknown.length} roll numbers are not in the student register: ${shown}${rest}. ` +
            `Add those students under Students first — a result on its own is never visible, because ` +
            `the results page matches it to a student record.`
      )
    }

    // SQLite does not support createMany({ skipDuplicates }), so rows are
    // inserted individually and a duplicate is skipped rather than failing the
    // whole import — a half-loaded semester is more useful than none.
    let created = 0
    let skipped = 0

    for (const row of data) {
      try {
        await db.result.create({ data: row })
        created++
      } catch (err) {
        if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
          skipped++
          continue
        }
        throw err
      }
    }

    await audit(
      user,
      incoming.length > 1 ? 'result.import' : 'result.create',
      `${created} row(s) created as drafts, ${skipped} duplicate(s) skipped`
    )

    if (created === 0 && skipped > 0) {
      return fail('A result already exists for that roll number, semester and session.', 409)
    }

    return ok({ created, skipped }, 201)
  } catch (e) {
    return handleError(e)
  }
}
