/**
 * The shapes public pages and admin screens receive from lib/content.ts.
 * Client-safe: types only.
 */
import type { Block, Crumb } from '@/lib/content-types'
import type { MediaVariant } from '@/lib/media-shared'

export type ProgrammeDTO = {
  id: string
  slug: string
  name: string
  award: string
  durationMonths: number
  mode: string
  eligibility: string
  intake: number | null
  published: boolean
  sortOrder: number
}

export type FacultyDTO = {
  id: string
  slug: string
  name: string
  summary: string
  /** Prose below the programme table. Parsed from JSON, never raw HTML. */
  body: Block[]
  published: boolean
  sortOrder: number
  programmes: ProgrammeDTO[]
}

export type PageDTO = {
  id: string
  path: string
  title: string
  description: string
  intro: string | null
  body: Block[]
  crumbs: Crumb[]
  published: boolean
  updatedAt: string
}

export type NoticeDTO = {
  id: string
  date: string
  title: string
  category: string
  href: string | null
  fileId: string | null
  fileUrl: string | null
  pinned: boolean
  published: boolean
}

export type SlideDTO = {
  id: string
  mediaId: string
  alt: string
  banner: boolean
  bannerBackground: string | null
  enabled: boolean
  sortOrder: number
  width: number
  height: number
  variants: MediaVariant[]
}

export type GalleryPhotoDTO = {
  id: string
  mediaId: string
  categoryId: string
  alt: string
  caption: string
  published: boolean
  sortOrder: number
  width: number
  height: number
  variants: MediaVariant[]
}

export type GalleryCategoryDTO = {
  id: string
  slug: string
  title: string
  blurb: string
  sortOrder: number
  photos: GalleryPhotoDTO[]
}

/** A faculty is "awaiting programmes" until it has a published programme. */
export function isAwaitingProgrammes(f: FacultyDTO): boolean {
  return !f.programmes.some((p) => p.published)
}
