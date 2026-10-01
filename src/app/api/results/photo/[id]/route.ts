import { fail, handleError } from '@/lib/api'
import { db } from '@/lib/db'
import { etagFor, readUpload } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/**
 * GET /api/results/photo/[id] — a student's approved photograph, unauthenticated.
 *
 * Exists because the public results page shows the photograph, at the
 * university's instruction, and /api/uploads/[id] must not be opened up to do
 * it: that route serves the SAME store, which holds Aadhaar scans and
 * qualification documents from admission applications. Widening it to let a
 * results page fetch a face would expose identity documents to anyone who
 * could guess an id. So this is a second door, deliberately far narrower.
 *
 * The only thing it will serve is an id that is some student's live `photoId`.
 *
 *   - NOT `pendingPhotoId`: a photograph the student has uploaded and staff
 *     have not approved must never appear beside official marks, which is the
 *     whole reason the two columns are separate.
 *   - NOT an application document, because no application document is ever a
 *     student's photoId.
 *
 * Anything else is a 404, never a 403: a 403 would confirm that an id exists,
 * which is what makes probing worthwhile.
 *
 * What this does disclose: anyone holding the id can fetch that photograph
 * without signing in. The ids are cuids, so they are not guessable, but the
 * results page hands one out to anyone who enters a valid roll number — which
 * is precisely the trade the university chose. It is bounded at a face, which
 * the result page already names and dates anyway.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id || id.length > 40) return fail('Not found.', 404)

    // The whole access rule, in one query: is this id a live student photo?
    const owner = await db.student.findFirst({ where: { photoId: id }, select: { id: true } })
    if (!owner) return fail('Not found.', 404)

    const file = await readUpload(id)
    if (!file) return fail('Not found.', 404)

    const etag = etagFor(id, file.bytes.length)
    if (req.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } })
    }

    return new Response(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Length': String(file.bytes.length),
        ETag: etag,
        /*
         * Personal data, so no shared cache — Cloudflare sits in front of this
         * and would otherwise hold one student's face against this URL and
         * hand it to whoever asked next. `private` keeps it in the viewer's
         * own browser only; the ETag still saves the re-download on a reload.
         */
        'Cache-Control': 'private, max-age=0, must-revalidate',
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.filename)}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    return handleError(e)
  }
}
