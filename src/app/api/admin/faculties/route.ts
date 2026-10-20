import { db } from '@/lib/db'
import { ok, fail, handleError } from '@/lib/api'
import { audit, body, requireAny, s } from '@/lib/admin-route'
import { normaliseBlocks } from '@/lib/content-types'
import { getFacultiesAdmin } from '@/lib/content'
import { slugify } from '@/lib/content-types'
import { revalidateContent } from '@/lib/revalidate'

export const dynamic = 'force-dynamic'

/** GET /api/admin/faculties — every faculty with every programme. */
export async function GET() {
  try {
    await requireAny('programmes.edit')
    return ok({ faculties: await getFacultiesAdmin() })
  } catch (e) {
    return handleError(e)
  }
}

/** POST /api/admin/faculties — { name, summary, slug?, published? } */
export async function POST(req: Request) {
  try {
    const user = await requireAny('programmes.edit')
    const input = await body(req)
    const name = s(input.name, 120)
    if (!name) return fail('A name is required.')
    const slug = slugify(s(input.slug, 80) || name)
    if (!slug) return fail('Could not make a URL from that name.')
    if (await db.faculty.findUnique({ where: { slug } })) {
      return fail(`A faculty already uses /programmes/${slug}/.`, 409)
    }
    const last = await db.faculty.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } })
    const row = await db.faculty.create({
      data: {
        name,
        slug,
        summary: s(input.summary, 400),
        body: JSON.stringify(normaliseBlocks(input.body)),
        published: input.published !== false,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    })
    await audit(user, 'faculty.create', name)
    revalidateContent()
    return ok({ id: row.id }, 201)
  } catch (e) {
    return handleError(e)
  }
}
