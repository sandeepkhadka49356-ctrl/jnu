import 'server-only'

import { cache as perRequest } from 'react'
import { unstable_cache } from 'next/cache'

import { db } from '@/lib/db'
import type {
  FacultyDTO,
  GalleryCategoryDTO,
  NoticeDTO,
  PageDTO,
  SlideDTO,
} from '@/lib/content-dto'
import {
  FALLBACK_BRANDING,
  SETTING_DEFAULTS,
  SETTING_NORMALISERS,
  isSettingKey,
  normaliseBlocks,
  normaliseCrumbs,
  type MenuItem,
  type ResolvedBranding,
  type SettingKey,
  type SettingValue,
} from '@/lib/content-types'
import { parseVariants, pickVariant, srcSetFor, fallbackFormat } from '@/lib/media-shared'

/**
 * Every read the PUBLIC site makes of editable content.
 *
 * Wrapped in unstable_cache under the tag CONTENT_TAG. Public pages are
 * prerendered to static HTML at build time from these reads, and stay static
 * — search engines get complete HTML, visitors never wait on a database. When
 * an admin saves, lib/revalidate.ts invalidates the tag and the affected
 * pages regenerate on the next request.
 *
 * Admin screens call the *Admin variants, which bypass the cache and include
 * unpublished rows.
 */

export const CONTENT_TAG = 'content'

const cached = <A extends unknown[], R>(fn: (...a: A) => Promise<R>, key: string) =>
  unstable_cache(fn, [key], { tags: [CONTENT_TAG] })

/* ============================================================== settings */

/** Uncached single-row read. Admin screens want the value as it is right now. */
export async function readSetting<K extends SettingKey>(key: K): Promise<SettingValue[K]> {
  const row = await db.setting.findUnique({ where: { key } })
  if (!row) return SETTING_DEFAULTS[key]
  try {
    return SETTING_NORMALISERS[key](JSON.parse(row.value)) as SettingValue[K]
  } catch {
    return SETTING_DEFAULTS[key]
  }
}

/**
 * All eight settings in one query.
 *
 * Rendering any page touches most of them — the shell alone wants site,
 * branding, menu, footerLinks and recognition — and there are only eight rows
 * in the table, so one findMany beats one findUnique per key. perRequest()
 * then makes the header, the footer, the page and generateMetadata share a
 * single read instead of each paying a cache lookup.
 */
const loadSettings = perRequest(
  cached(async (): Promise<SettingValue> => {
    const rows = await db.setting.findMany()
    const out = { ...SETTING_DEFAULTS }
    for (const row of rows) {
      if (!isSettingKey(row.key)) continue
      try {
        out[row.key] = SETTING_NORMALISERS[row.key](JSON.parse(row.value)) as never
      } catch {
        // Leave the default in place; a corrupt row must not blank the site.
      }
    }
    return out
  }, 'settings')
)

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue[K]> {
  // Falls back to the default when the key is missing. A cache entry written
  // by an older deploy predates any setting added since, and would otherwise
  // hand back undefined and take every page that reads it down with it —
  // which is exactly what happened when the pop-up notice was introduced.
  return (await loadSettings())[key] ?? SETTING_DEFAULTS[key]
}

export const getSite = () => getSetting('site')

/* ============================================================== branding */

async function readBranding(): Promise<ResolvedBranding> {
  const b = await getSetting('branding')
  const out: ResolvedBranding = JSON.parse(JSON.stringify(FALLBACK_BRANDING))

  // Logo, crest and OG image in one query rather than three round trips.
  const ids = [b.logoId, b.crestId, b.ogImageId].filter((v): v is string => !!v)
  const rows = ids.length
    ? await db.media.findMany({ where: { id: { in: ids }, kind: 'IMAGE' } })
    : []
  const mediaVariants = (id: string | null) => {
    const m = id ? rows.find((r) => r.id === id) : null
    return m ? { variants: parseVariants(m.variants), width: m.width ?? 0, height: m.height ?? 0 } : null
  }

  const logo = mediaVariants(b.logoId)
  if (logo && logo.variants.length) {
    const f = fallbackFormat(logo.variants)
    // Header shows the lockup ~56px tall; keep the intrinsic ratio.
    const displayH = 78
    out.logo = {
      src: pickVariant(logo.variants, 640)?.path ?? out.logo.src,
      srcSet: srcSetFor(logo.variants, f),
      width: Math.round((logo.width / logo.height) * displayH) || out.logo.width,
      height: displayH,
    }
  }

  const crest = mediaVariants(b.crestId)
  if (crest) out.crest = pickVariant(crest.variants, 320)?.path ?? out.crest

  const og = mediaVariants(b.ogImageId)
  if (og) out.ogImage = pickVariant(og.variants, 1200)?.path ?? out.ogImage

  return out
}

export const getBranding = perRequest(cached(readBranding, 'branding'))

/* ==================================================== document listings */

export type DocumentListDTO = {
  intro: string
  rows: { title: string; note: string; href: string | null }[]
}

/**
 * Affiliations and syllabus: a titled row, a note and a PDF.
 *
 * The stored value holds a media id; the public page needs a URL, so the
 * ids are resolved here in one query rather than one per row. A row whose
 * document has since been deleted still renders — with no link — because a
 * missing PDF should not blank the whole table.
 */
async function readDocumentList(key: 'affiliations' | 'syllabus'): Promise<DocumentListDTO> {
  const list = await getSetting(key)
  const ids = list.rows.map((r) => r.documentId).filter((v): v is string => !!v)
  const media = ids.length
    ? await db.media.findMany({ where: { id: { in: ids } }, select: { id: true, path: true } })
    : []
  return {
    intro: list.intro,
    rows: list.rows.map((r) => ({
      title: r.title,
      note: r.note,
      href: (r.documentId && media.find((m) => m.id === r.documentId)?.path) || null,
    })),
  }
}

export const getAffiliations = perRequest(cached(() => readDocumentList('affiliations'), 'affiliations'))
export const getSyllabus = perRequest(cached(() => readDocumentList('syllabus'), 'syllabus'))

/**
 * Distance Education, with unpublished programmes removed.
 *
 * No cache wrapper of its own: it reads through getSetting, which is already
 * tagged and deduplicated per request, and the filter is a few comparisons.
 * A second unstable_cache layer here would only add a key to keep unique.
 */
export async function getDistanceEducation() {
  const d = await getSetting('distanceEducation')
  return { ...d, programmes: d.programmes.filter((p) => p.published) }
}

/** The admin editor needs the drafts too. */
export function getDistanceEducationAdmin() {
  return readSetting('distanceEducation')
}

/* ======================================================= programmes */

async function readFaculties(includeUnpublished: boolean): Promise<FacultyDTO[]> {
  const rows = await db.faculty.findMany({
    where: includeUnpublished ? {} : { published: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      programmes: {
        where: includeUnpublished ? {} : { published: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      },
    },
  })
  return rows.map((f) => ({
    id: f.id,
    slug: f.slug,
    name: f.name,
    summary: f.summary,
    body: normaliseBlocks(parseJson(f.body)),
    published: f.published,
    sortOrder: f.sortOrder,
    programmes: f.programmes.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      award: p.award,
      durationMonths: p.durationMonths,
      mode: p.mode,
      eligibility: p.eligibility,
      intake: p.intake,
      published: p.published,
      sortOrder: p.sortOrder,
    })),
  }))
}

export const getFaculties = perRequest(cached(() => readFaculties(false), 'faculties'))
export const getFacultiesAdmin = () => readFaculties(true)

export async function getFaculty(slug: string): Promise<FacultyDTO | undefined> {
  return (await getFaculties()).find((f) => f.slug === slug)
}

export async function getAllProgrammeNames(): Promise<string[]> {
  return (await getFaculties()).flatMap((f) => f.programmes.map((p) => p.name))
}

/* ================================================================ pages */

type PageRow = {
  id: string
  path: string
  title: string
  description: string
  intro: string | null
  body: string
  crumbs: string
  published: boolean
  updatedAt: Date
}

/**
 * Parse a JSON column that holds an array, falling back to empty.
 *
 * A row whose JSON has been corrupted should cost that one field, not the
 * whole page: throwing here would take down every faculty listing because a
 * single body string was malformed.
 */
function parseJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return []
  }
}

function toPage(r: PageRow): PageDTO {
  const parse = parseJson
  return {
    id: r.id,
    path: r.path,
    title: r.title,
    description: r.description,
    intro: r.intro,
    body: normaliseBlocks(parse(r.body)),
    crumbs: normaliseCrumbs(parse(r.crumbs)),
    published: r.published,
    updatedAt: r.updatedAt.toISOString(),
  }
}

export const getPage = cached(async (path: string): Promise<PageDTO | null> => {
  const row = await db.page.findUnique({ where: { path } })
  return row && row.published ? toPage(row) : null
}, 'page')

export const getPublishedPagePaths = cached(async (): Promise<{ path: string; updatedAt: string }[]> => {
  const rows = await db.page.findMany({
    where: { published: true },
    select: { path: true, updatedAt: true },
    orderBy: { path: 'asc' },
  })
  return rows.map((r) => ({ path: r.path, updatedAt: r.updatedAt.toISOString() }))
}, 'page-paths')

export async function listPagesAdmin(): Promise<PageDTO[]> {
  const rows = await db.page.findMany({ orderBy: { path: 'asc' } })
  return rows.map(toPage)
}

export async function getPageAdmin(id: string): Promise<PageDTO | null> {
  const row = await db.page.findUnique({ where: { id } })
  return row ? toPage(row) : null
}

/* ============================================================== notices */

async function readNotices(includeUnpublished: boolean): Promise<NoticeDTO[]> {
  const rows = await db.notice.findMany({
    where: includeUnpublished ? {} : { published: true },
    include: { file: { select: { path: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  })
  const list = rows.map((n) => ({
    id: n.id,
    date: n.date,
    title: n.title,
    category: n.category,
    href: n.href,
    fileId: n.fileId,
    fileUrl: n.file?.path ?? null,
    pinned: n.pinned,
    published: n.published,
  }))
  // Pinned first, then newest first.
  return list.sort((a, b) =>
    a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : b.date.localeCompare(a.date)
  )
}

export const getNotices = perRequest(cached(() => readNotices(false), 'notices'))
export const getNoticesAdmin = () => readNotices(true)

/* ======================================================= slides, gallery */

async function readSlides(includeDisabled: boolean): Promise<SlideDTO[]> {
  const rows = await db.slide.findMany({
    where: includeDisabled ? {} : { enabled: true },
    include: { media: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map((s) => ({
    id: s.id,
    mediaId: s.mediaId,
    alt: s.alt,
    banner: s.banner,
    bannerBackground: s.bannerBackground,
    enabled: s.enabled,
    sortOrder: s.sortOrder,
    width: s.media.width ?? 1600,
    height: s.media.height ?? 658,
    variants: parseVariants(s.media.variants),
  }))
}

export const getSlides = perRequest(cached(() => readSlides(false), 'slides'))
export const getSlidesAdmin = () => readSlides(true)

async function readGallery(includeUnpublished: boolean): Promise<GalleryCategoryDTO[]> {
  const rows = await db.galleryCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    include: {
      photos: {
        where: includeUnpublished ? {} : { published: true },
        include: { media: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    blurb: c.blurb,
    sortOrder: c.sortOrder,
    photos: c.photos.map((p) => ({
      id: p.id,
      mediaId: p.mediaId,
      categoryId: p.categoryId,
      alt: p.alt,
      caption: p.caption,
      published: p.published,
      sortOrder: p.sortOrder,
      width: p.media.width ?? 495,
      height: p.media.height ?? 400,
      variants: parseVariants(p.media.variants),
    })),
  }))
}

export const getGallery = perRequest(cached(() => readGallery(false), 'gallery'))
export const getGalleryAdmin = () => readGallery(true)

/* ================================================================= menu */

/** The menu with any `auto: 'faculties'` item expanded to the live faculties. */
export const getResolvedMenu = perRequest(async function getResolvedMenu(): Promise<MenuItem[]> {
  const [menu, faculties] = await Promise.all([getSetting('menu'), getFaculties()])
  return menu.map((item) =>
    item.auto === 'faculties'
      ? {
          ...item,
          children: faculties.map((f) => ({
            label: `Faculty of ${f.name}`,
            href: `/programmes/${f.slug}/`,
          })),
        }
      : item
  )
})
