import { db } from '@/lib/db'
import { ok, fail, handleError } from '@/lib/api'
import { audit, body, requireAny, s } from '@/lib/admin-route'
import { normaliseBlocks } from '@/lib/content-types'
import { slugify } from '@/lib/content-types'
import { revalidateContent } from '@/lib/revalidate'

export const dynamic = 'force-dynamic'

/** PUT /api/admin/faculties/[id] — { name, summary, slug, published } */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAny('programmes.edit')
    const { id } = await ctx.params
    const existing = await db.faculty.findUnique({ where: { id } })
    if (!existing) return fail('Not found.', 404)

    const input = await body(req)
    const name = s(input.name, 120)
    if (!name) return fail('A name is required.')
    const slug = slugify(s(input.slug, 80) || existing.slug)
    if (slug !== existing.slug && (await db.faculty.findUnique({ where: { slug } }))) {
      return fail(`A faculty already uses /programmes/${slug}/.`, 409)
    }

    await db.faculty.update({
      where: { id },
      data: {
        name,
        slug,
        summary: s(input.summary, 400),
        // normaliseBlocks is the gate: anything the editor sends that is not
        // a known block type is dropped, so the column can never hold markup.
        body: JSON.stringify(normaliseBlocks(input.body)),
        published: input.published !== false,
      },
    })
    await audit(
      user,
      'faculty.update',
      slug === existing.slug ? name : `${name}: /programmes/${existing.slug}/ → /programmes/${slug}/`
    )
    revalidateContent()
    return ok({ ok: true })
  } catch (e) {
    return handleError(e)
  }
}

/**
 * DELETE /api/admin/faculties/[id]
 *
 * Refused while the faculty still has programmes, so a single click cannot
 * remove a whole faculty's catalogue. Unpublish it instead to hide it.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAny('programmes.edit')
    const { id } = await ctx.params
    const existing = await db.faculty.findUnique({
      where: { id },
      include: { _count: { select: { programmes: true } } },
    })
    if (!existing) return fail('Not found.', 404)
    if (existing._count.programmes > 0) {
      return fail(
        `${existing.name} still has ${existing._count.programmes} programme(s). Delete or move them first, or unpublish the faculty to hide it.`,
        409
      )
    }
    await db.faculty.delete({ where: { id } })
    await audit(user, 'faculty.delete', existing.name)
    revalidateContent()
    return ok({ ok: true })
  } catch (e) {
    return handleError(e)
  }
}
