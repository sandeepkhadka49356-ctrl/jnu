import { db } from '@/lib/db'
import { ok, fail, handleError, readJson } from '@/lib/api'
import { audit, requireRole } from '@/lib/auth'
import { removeUpload, storeUpload } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/photos/[studentId] — { action: 'approve' | 'reject' }
 *
 * Registrar or exam cell. Approving promotes the pending photo to the live
 * one and deletes the photo it replaces; rejecting deletes the pending one
 * and leaves the live photo untouched. Either way exactly one photograph per
 * student remains on disk.
 */
export async function POST(req: Request, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const user = await requireRole('registrar', 'exam_cell')
    const { studentId } = await params

    const body = await readJson<{ action?: string }>(req)
    const action = body?.action
    if (action !== 'approve' && action !== 'reject') return fail('Unknown action.')

    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { rollNo: true, photoId: true, pendingPhotoId: true },
    })
    if (!student) return fail('Student not found.', 404)
    if (!student.pendingPhotoId) return fail('There is no photograph awaiting review.', 409)

    if (action === 'approve') {
      await db.student.update({
        where: { id: studentId },
        data: { photoId: student.pendingPhotoId, pendingPhotoId: null, pendingPhotoAt: null },
      })
      if (student.photoId) await removeUpload(student.photoId)
      await audit(user, 'photo.approve', `Approved new photograph for ${student.rollNo}`)
    } else {
      await db.student.update({
        where: { id: studentId },
        data: { pendingPhotoId: null, pendingPhotoAt: null },
      })
      await removeUpload(student.pendingPhotoId)
      await audit(user, 'photo.reject', `Rejected photograph submitted by ${student.rollNo}`)
    }

    return ok({ ok: true })
  } catch (e) {
    return handleError(e)
  }
}

/**
 * PUT /api/admin/photos/[studentId] — staff upload a photograph directly.
 *
 * Goes straight to `photoId`, not `pendingPhotoId`. The pending column exists
 * because a student's own upload must not appear unreviewed beside official
 * marks — but a registrar uploading from the admission file IS the review,
 * and routing it through a queue would mean approving one's own upload.
 *
 * Needed because a photograph now appears on the public results page, and
 * until this existed the only way one could arrive was for the student to
 * sign in and upload it themselves. Students who never sign in — which is
 * most of them, most of the time — simply had no photograph, and staff had no
 * way to add the one already sitting in the paper file.
 *
 * Replacing a photo deletes the file it replaces, and a pending upload the
 * student was waiting on is cleared too: staff putting the right photograph
 * on the record settles the question the queue was asking.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ studentId: string }> }) {
  let storedId: string | null = null

  try {
    const user = await requireRole('registrar', 'exam_cell')
    const { studentId } = await params

    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { rollNo: true, photoId: true, pendingPhotoId: true },
    })
    if (!student) return fail('Student not found.', 404)

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return fail('Could not read the upload.')
    }

    const file = form.get('photo')
    if (!(file instanceof File) || file.size === 0) return fail('Choose a photograph to upload.')

    // Same pipeline as the student's own upload: format sniffed from the
    // bytes rather than trusted from the name, re-encoded, EXIF stripped.
    const stored = await storeUpload(file, 'PHOTO')
    if (!stored.ok) return fail(stored.error)
    storedId = stored.id

    await db.student.update({
      where: { id: studentId },
      data: { photoId: stored.id, pendingPhotoId: null, pendingPhotoAt: null },
    })
    storedId = null // committed; the cleanup below must not delete it

    // Both of these are now unreferenced.
    if (student.photoId) await removeUpload(student.photoId)
    if (student.pendingPhotoId) await removeUpload(student.pendingPhotoId)

    await audit(user, 'photo.upload', `Uploaded a photograph for ${student.rollNo}`)
    return ok({ ok: true, photoUrl: `/api/uploads/${stored.id}/` }, 201)
  } catch (e) {
    // The row never referenced it, so an orphan would sit on disk for ever.
    if (storedId) await removeUpload(storedId)
    return handleError(e)
  }
}

/**
 * DELETE /api/admin/photos/[studentId] — remove the live photograph.
 *
 * For a photo that should not be on a public page at all: wrong student,
 * wrong file, or a request from the family. Leaves the record otherwise
 * untouched.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const user = await requireRole('registrar', 'exam_cell')
    const { studentId } = await params

    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { rollNo: true, photoId: true },
    })
    if (!student) return fail('Student not found.', 404)
    if (!student.photoId) return fail('That student has no photograph.', 409)

    await db.student.update({ where: { id: studentId }, data: { photoId: null } })
    await removeUpload(student.photoId)
    await audit(user, 'photo.delete', `Removed the photograph for ${student.rollNo}`)

    return ok({ ok: true })
  } catch (e) {
    return handleError(e)
  }
}
