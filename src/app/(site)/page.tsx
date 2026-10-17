import Link from 'next/link'
import type { Metadata } from 'next'

import { Hero } from '@/components/home/Hero'
import { Ticker } from '@/components/home/Ticker'
import { NoticeBoard } from '@/components/home/NoticeBoard'
import { JsonLd } from '@/components/seo/JsonLd'
import { getFaculties, getNotices, getSetting, getSite, getSlides } from '@/lib/content'
import { pageMetadata, faqSchema } from '@/lib/seo'

/**
 * Homepage. Every piece of copy — hero, quick-access cards, the About block
 * and the FAQs — is edited under Admin → Homepage; the carousel under
 * Admin → Carousel. The page is still prerendered to static HTML and
 * regenerated when any of those is saved.
 */

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite()
  const meta = pageMetadata({
    title: site.defaultTitle,
    description: site.defaultDescription,
    path: '/',
  })
  /*
   * The home page names the university once, not twice.
   *
   * Every other page's title runs through the "%s | Jodhpur National
   * University" template, which is right for them and wrong here: the home
   * page's own title IS the university's name, so the template produced
   * "Jodhpur National University, Jodhpur | Jodhpur National University".
   * Google shows roughly 60 characters of a title, and that spent 34 of them
   * saying the same thing twice — on the one page most likely to be the
   * result someone sees first.
   */
  return { ...meta, title: { absolute: site.defaultTitle } }
}

export default async function HomePage() {
  const [home, faculties, slides, notices] = await Promise.all([
    getSetting('home'),
    getFaculties(),
    getSlides(),
    getNotices(),
  ])

  return (
    <>
      {home.faqs.length ? <JsonLd data={faqSchema(home.faqs)} /> : null}

      <Hero slides={slides} home={home} />
      <Ticker notices={notices} />

      {/* ---- quick access ---- */}
      {home.quickCards.length ? (
        <section className="boxed py-9" aria-labelledby="quick-heading">
          <h2 id="quick-heading" className="sr-only">
            Quick access
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {home.quickCards.map((c) => (
              <Link
                key={c.href + c.label}
                href={c.href}
                className="panel block p-5 text-center no-underline transition-shadow hover:shadow-raised"
              >
                <span className="iconbox-badge font-display text-xl" aria-hidden="true">
                  {c.icon}
                </span>
                <span className="mb-1 block font-display text-[15px] uppercase tracking-wide text-jnu-800">
                  {c.label}
                </span>
                <span className="block text-[13px] text-muted">{c.text}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- about + notices ---- */}
      <section className="border-y border-hair bg-white py-9">
        <div className="boxed grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="prose-jnu min-w-0">
            <h2 className="rule-heading">{home.aboutTitle}</h2>
            {home.aboutParagraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <p className="mt-5">
              <Link href="/about/" className="btn btn-primary">
                More about JNU
              </Link>
            </p>
          </div>
          <div className="min-w-0">
            <NoticeBoard notices={notices} limit={6} />
          </div>
        </div>
      </section>

      {/* ---- faculties ---- */}
      <section className="boxed py-9" aria-labelledby="faculties-heading">
        <h2 id="faculties-heading" className="rule-heading">
          Faculties
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {faculties.map((f) => (
            <Link
              key={f.slug}
              href={`/programmes/${f.slug}/`}
              className="panel block p-4 no-underline transition-shadow hover:shadow-raised"
            >
              <span className="mb-1 block font-display text-[14px] uppercase tracking-wide text-jnu-800">
                {f.name}
              </span>
              <span className="tnum block text-xs text-muted">
                {f.programmes.length === 0
                  ? 'Programme list being published'
                  : `${f.programmes.length} programme${f.programmes.length === 1 ? '' : 's'}`}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- FAQ, visible and matching the FAQPage schema above ---- */}
      {home.faqs.length ? (
        <section className="border-t border-hair bg-white py-9" aria-labelledby="faq-heading">
          <div className="boxed">
            <h2 id="faq-heading" className="rule-heading">
              Frequently Asked Questions
            </h2>
            <dl className="m-0 grid gap-5 md:grid-cols-2">
              {home.faqs.map((f) => (
                <div key={f.q}>
                  <dt className="mb-1 font-semibold text-jnu-800">{f.q}</dt>
                  <dd className="m-0 text-[13.5px] leading-relaxed text-muted">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}
    </>
  )
}
