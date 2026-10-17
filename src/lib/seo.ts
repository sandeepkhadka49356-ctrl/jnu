import 'server-only'

import type { Metadata } from 'next'

import { getBranding, getFaculties, getPublishedPagePaths, getSetting, getSite } from '@/lib/content'
import type { ProgrammeDTO } from '@/lib/content-dto'
import { absoluteUrl, SITE_URL } from '@/lib/site-url'

export { absoluteUrl }

/**
 * Every page builds its metadata through here, so canonical URLs, OG tags and
 * robots directives can never drift apart. The original site's single biggest
 * SEO defect was a *relative* canonical (`rel=canonical="index.html"`), which
 * made every URL self-canonicalise ambiguously. `absoluteUrl` prevents that
 * class of bug entirely.
 *
 * Async because the site name and default share image are now edited in the
 * admin panel; pages call it from generateMetadata.
 */

type PageMetaInput = {
  title: string
  description: string
  path: string
  /** Private routes: results, admin. Keeps student data out of the index. */
  noindex?: boolean
  /** Path or absolute URL; defaults to the share image set in Branding. */
  ogImage?: string
  type?: 'website' | 'article'
  publishedTime?: string
}

export async function pageMetadata({
  title,
  description,
  path,
  noindex = false,
  ogImage,
  type = 'website',
  publishedTime,
}: PageMetaInput): Promise<Metadata> {
  const [site, branding] = await Promise.all([getSite(), getBranding()])
  const url = absoluteUrl(path)
  const image = absoluteUrl(ogImage ?? branding.ogImage)

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: noindex ? { index: false, follow: false, nocache: true } : { index: true, follow: true },
    openGraph: {
      type,
      url,
      siteName: site.name,
      title,
      description,
      locale: 'en_IN',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

/* ---------------------------------------------------------------- schema */

/**
 * EducationalOrganization — the single highest-value schema type for a
 * university. Recognition appears ONLY when the registrar has recorded a
 * statement with its evidence (see Recognition in the admin panel).
 */
export async function organizationSchema() {
  const [site, branding, recognition] = await Promise.all([
    getSite(),
    getBranding(),
    getSetting('recognition'),
  ])
  const hasApprovals = recognition.approvals.length > 0 && Boolean(recognition.evidence)
  const sameAs = Object.values(site.social).filter(Boolean)

  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': absoluteUrl('/#organization'),
    name: site.name,
    legalName: site.legalName,
    /*
     * The names people actually type.
     *
     * Students search "JNU Jodhpur", not "Jodhpur National University" — and
     * "JNU" alone belongs to Jawaharlal Nehru University in Delhi, which is
     * far better known and will always win that query. So the alternates
     * always carry Jodhpur: they tell Google which JNU this is instead of
     * competing for a name that is not ours.
     *
     * This matters here more than it would elsewhere. Directory sites list
     * this university under half a dozen spellings, and an older domain of
     * its own still ranks for them; the more precisely this site states its
     * identity, the better the chance Google treats it as the same entity.
     */
    alternateName: [
      ...new Set([site.shortName, site.legalName, `${site.name} Jodhpur Rajasthan`].filter(Boolean)),
    ],
    description: site.defaultDescription,
    url: absoluteUrl('/'),
    logo: absoluteUrl(branding.logo.src),
    email: site.email,
    ...(site.phone ? { telephone: site.phone } : {}),
    ...(site.established ? { foundingDate: site.established } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.campus.lines[0] ?? '',
      addressLocality: 'Jodhpur',
      addressRegion: 'Rajasthan',
      // No postalCode: this is the CAMPUS on Jhanwar Road, and the only
      // postcode the register holds (342003) belongs to the administrative
      // office on Residency Road. A wrong postcode on an organisation's
      // address is worse than none — local search matches a business against
      // the address it finds elsewhere, so an invented one splits the entity.
      addressCountry: 'IN',
    },
    areaServed: { '@type': 'State', name: 'Rajasthan' },
    ...(hasApprovals
      ? { accreditedBy: recognition.approvals.map((n) => ({ '@type': 'Organization', name: n })) }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
  }
}

export async function websiteSchema() {
  const site = await getSite()
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    url: absoluteUrl('/'),
    name: site.name,
    inLanguage: 'en-IN',
    publisher: { '@id': absoluteUrl('/#organization') },
  }
}

/** Course schema per programme — drives eligibility-rich SERP results. */
export function courseSchema(p: ProgrammeDTO, siteName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: p.name,
    description: `${p.name} (${p.award}) at ${siteName}. ${p.eligibility}.`,
    provider: { '@id': absoluteUrl('/#organization') },
    educationalCredentialAwarded: p.award,
    inLanguage: 'en-IN',
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: p.mode === 'Full-time' ? 'onsite' : p.mode === 'Distance' ? 'online' : 'blended',
      courseWorkload: `P${p.durationMonths}M`,
    },
  }
}

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: absoluteUrl(t.path),
    })),
  }
}

export function faqSchema(qas: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qas.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

/** Routes that have their own page file rather than a CMS page. */
const FIXED_ROUTES = ['/', '/notices/', '/verify/', '/contact/']

/**
 * Every indexable route, for sitemap.xml: fixed routes, every published CMS
 * page, and every faculty that has at least one published programme (an
 * empty faculty is served noindex, so listing it would contradict itself).
 */
export async function indexableRoutes(): Promise<{ path: string; updatedAt?: string }[]> {
  const [pages, faculties] = await Promise.all([getPublishedPagePaths(), getFaculties()])
  const seen = new Set<string>()
  const out: { path: string; updatedAt?: string }[] = []
  const add = (path: string, updatedAt?: string) => {
    if (seen.has(path)) return
    seen.add(path)
    out.push({ path, updatedAt })
  }
  FIXED_ROUTES.forEach((p) => add(p))
  pages.forEach((p) => add(p.path, p.updatedAt))
  faculties.filter((f) => f.programmes.length > 0).forEach((f) => add(`/programmes/${f.slug}/`))
  return out
}

export { SITE_URL }

/**
 * Assembles a meta description that fits what Google actually shows.
 *
 * Roughly 155–160 characters survive; past that the snippet is cut, and it is
 * cut mid-word with an ellipsis rather than at anything meaningful. Several
 * pages were running to 206, 216, 229 — so the part that mattered, the award
 * names an admissions search is looking for, was being chopped off the end.
 *
 * Sentences are added whole while they fit, in the order given, so the caller
 * states its priority by ordering rather than by counting characters. A first
 * sentence that is on its own too long is cut at a word boundary, because a
 * description that stops mid-word reads as broken in a way a shorter one
 * does not.
 */
export function clampDescription(parts: string[], max = 158): string {
  let out = ''

  for (const raw of parts) {
    const part = raw.trim().replace(/\s+/g, ' ')
    if (!part) continue
    const next = out ? `${out} ${part}` : part
    if (next.length <= max) {
      out = next
      continue
    }
    /*
     * Does not fit whole. Take as many of its words as the budget allows
     * rather than dropping it.
     *
     * Dropping it whole left faculty descriptions at 95 characters of a 158
     * budget — 60 characters of relevance given away because one sentence was
     * a few words too long. A description ending on a complete word reads
     * fine, and Google is going to cut it somewhere regardless.
     *
     * MIN_TAIL guards the opposite failure: three words of a sentence is
     * noise, and below that it is better to stop cleanly.
     */
    const MIN_TAIL = 40
    const room = max - out.length - (out ? 1 : 0)
    if (room >= MIN_TAIL) {
      const cut = part.slice(0, room)
      const lastSpace = cut.lastIndexOf(' ')
      const tail = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, '')
      if (tail) out = out ? `${out} ${tail}` : tail
    }
    break
  }

  return out
}
