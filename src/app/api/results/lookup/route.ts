import { db } from '@/lib/db'
import { ok, fail, handleError, readJson } from '@/lib/api'
import { clientIp, rateLimit } from '@/lib/ratelimit'
import { ensureVerifyTokens } from '@/lib/marksheet-token'
import { formatSerial } from '@/lib/marksheet'

export const dynamic = 'force-dynamic'

/**
 * POST /api/results/lookup — published results for one roll number.
 *
 * Unauthenticated, at the client's instruction: a student types their roll
 * number and sees their result, with no account and no sign-in.
 *
 * What that means, recorded here so nobody has to rediscover it:
 *
 *   Roll numbers are sequential and printed on every admit card, so anyone
 *   who has seen one can work out the rest. This endpoint therefore hands a
 *   candidate's name, parents' names, date of birth, programme and marks to
 *   whoever asks. That is the client's decision, taken with the trade-off
 *   stated; it is not an oversight. /api/student/me still exists and is still
 *   session-scoped — it is what serves the photograph and contact details.
 *
 * The photograph IS included, at the client's instruction, so this page
 * matches the official marksheet. It was withheld at first on the reasoning
 * that a name and marks is a disclosure while a face is an identification;
 * the university weighed that against a result page that looks like the
 * document it represents and chose the photograph. Recorded here so the
 * trade-off is visible rather than looking like an oversight.
 *
 * What is still withheld, because none of it is needed to read a result and
 * all of it makes the disclosure worse:
 *
 *   - contact details: mobile, email, address, district, state, pincode
 *   - unpublished results, and anything about the student's account state
 *   - the UNAPPROVED photograph a student has uploaded but staff have not
 *     reviewed, which must never appear beside official marks
 *
 * The rate limit does not make the data private — someone patient still gets
 * it. It exists so the register cannot be scraped in a single pass, which is
 * the difference between a disclosure and a bulk download.
 */

const LOOKUPS_PER_HOUR = 30

export async function POST(req: Request) {
  try {
    const body = await readJson<{ rollNo?: string }>(req)
    const rollNo = (body?.rollNo ?? '').trim().toUpperCase()

    if (!rollNo) return fail('Enter your roll number.')
    // The same shape the register stores, so a malformed guess costs no query.
    if (!/^[A-Z0-9/-]{3,24}$/.test(rollNo)) return fail('That is not a valid roll number.')

    const ip = clientIp(req)
    const limit = await rateLimit('result-lookup', ip, LOOKUPS_PER_HOUR, 3600)
    if (!limit.allowed) {
      return fail(
        `Too many lookups from this connection. Try again in ${Math.ceil(
          limit.retryAfterSeconds / 60
        )} minute(s).`,
        429
      )
    }

    const student = await db.student.findUnique({
      where: { rollNo },
      // Explicit select. Everything omitted is omitted deliberately — read
      // the note above before adding to it.
      select: {
        rollNo: true,
        enrollmentNo: true,
        fullName: true,
        fatherName: true,
        motherName: true,
        dob: true,
        programme: true,
        photoId: true,
      },
    })

    const results = student
      ? await db.result.findMany({
          where: { rollNo, published: true },
          orderBy: [{ examSession: 'desc' }, { semester: 'asc' }],
        })
      : []

    // One message covers "no such roll number" and "nothing published yet", so
    // the endpoint cannot be used to test which roll numbers exist.
    if (!student || results.length === 0) {
      return fail('No published result was found for that roll number.', 404)
    }

    const tokens = await ensureVerifyTokens(results)

    return ok({
      // The portal's profile shape, with the withheld fields nulled rather
      // than absent, so the shared marksheet card renders unchanged.
      student: {
        ...student,
        photoUrl: student.photoId ? `/api/results/photo/${student.photoId}/` : null,
        pendingPhotoUrl: null,
        pendingPhotoAt: null,
        status: 'ACTIVE',
        mobile: null,
        email: null,
        addressLine: null,
        district: null,
        state: null,
        pincode: null,
      },
      results: results.map(({ verifyToken: _t, publishedAt, ...r }) => {
        const token = tokens.get(r.id)
        return {
          ...r,
          subjects: JSON.parse(r.subjects),
          publishedAt: publishedAt?.toISOString() ?? null,
          serial: token ? formatSerial(token) : null,
        }
      }),
    })
  } catch (e) {
    return handleError(e)
  }
}
