import { db } from '@/lib/db'
import { ok, fail, handleError } from '@/lib/api'
import { requireAny } from '@/lib/admin-route'
import { getFacultiesAdmin } from '@/lib/content'
import { propose, rollStem, programmeCode } from '@/lib/student-numbering'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/next-student-number?programme=…&year=…
 *
 * Proposes the next roll and enrollment number for a programme and an
 * admission year. Proposes only — the registrar can overwrite both before
 * saving, and the uniqueness constraint on the column is what actually
 * guarantees no collision.
 *
 * The serial is taken from the highest number already issued for that year
 * and programme, so two registrars working at once can both be handed 0191.
 * That is a real race and it is handled where it has to be: the save fails on
 * the unique constraint and the second one asks again. Reserving a number at
 * this endpoint would mean every abandoned form burned one.
 */
export async function GET(req: Request) {
  try {
    await requireAny('students.edit', 'students.view')

    const url = new URL(req.url)
    const programme = (url.searchParams.get('programme') ?? '').trim()
    const yearParam = url.searchParams.get('year')
    const year = Number.parseInt(yearParam ?? '', 10) || new Date().getFullYear()

    if (!programme) return fail('Choose a programme first.')

    // The programme's award carries the code, so the catalogue is the
    // authority on it rather than a second list kept in step by hand.
    const faculties = await getFacultiesAdmin()
    const match = faculties.flatMap((f) => f.programmes).find((p) => p.name === programme)

    if (!match) return fail('That programme is not in the catalogue.')

    const code = programmeCode(match.award)
    if (!code) {
      return fail(
        `No programme code can be worked out from the award "${match.award}". ` +
          `Enter the numbers by hand, or give the programme an award in Programmes.`
      )
    }

    // Only this year and programme, matched on the stem, so the query stays
    // small whatever the size of the register.
    const rows = await db.student.findMany({
      where: { rollNo: { startsWith: rollStem(year, code) } },
      select: { rollNo: true },
    })

    const proposal = propose(match.award, year, rows.map((r) => r.rollNo))
    if (!proposal) return fail('Could not propose a number for that programme.')

    return ok(proposal)
  } catch (e) {
    return handleError(e)
  }
}
