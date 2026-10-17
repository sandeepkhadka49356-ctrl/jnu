import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageShell } from '@/components/layout/PageShell'
import { JsonLd } from '@/components/seo/JsonLd'
import { getFaculties, getFaculty, getSite } from '@/lib/content'
import { isAwaitingProgrammes } from '@/lib/content-dto'
import { clampDescription, courseSchema, pageMetadata } from '@/lib/seo'

/**
 * One page per faculty, edited under Admin → Programmes. A faculty created
 * after the build renders on its first request and is cached from then on.
 */
export async function generateStaticParams() {
  return (await getFaculties()).map((f) => ({ slug: f.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const [faculty, site] = await Promise.all([getFaculty(slug), getSite()])
  if (!faculty) return {}

  const pending = isAwaitingProgrammes(faculty)
  const awards = [...new Set(faculty.programmes.map((p) => p.award))].join(', ')

  return pageMetadata({
    title: `${faculty.name} — Programmes`,
    /*
     * Ordered by what an admissions search is looking for, and clamped to
     * what Google shows. The award names come BEFORE the prose summary
     * because "B.Tech Jodhpur" is the query; concatenating all three ran to
     * 229 characters on this page and the awards were the part cut off.
     */
    description: clampDescription(
      pending
        ? [`${faculty.name} at ${site.name}, Jodhpur.`, faculty.summary]
        : [
            `${faculty.name} at ${site.name}, Jodhpur.`,
            `Programmes: ${awards}.`,
            faculty.summary,
          ]
    ),
    path: `/programmes/${faculty.slug}/`,
    // Nothing worth indexing until it has a programme; the sitemap applies
    // the same rule, so the two cannot disagree.
    noindex: pending,
  })
}

export default async function FacultyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [faculty, faculties, site] = await Promise.all([getFaculty(slug), getFaculties(), getSite()])
  if (!faculty) notFound()

  const pending = isAwaitingProgrammes(faculty)

  return (
    <>
      {pending ? null : <JsonLd data={faculty.programmes.map((p) => courseSchema(p, site.name))} />}

      <PageShell
        title={faculty.name}
        intro={faculty.summary}
        crumbs={[
          { name: 'Programmes', path: '/programmes/' },
          { name: faculty.name, path: `/programmes/${faculty.slug}/` },
        ]}
        sidebar={
          <div className="panel">
            <h2 className="panel-head m-0">Other Faculties</h2>
            <div className="panel-body p-0">
              <ul className="m-0 list-none p-0">
                {faculties
                  .filter((f) => f.slug !== faculty.slug)
                  .map((f) => (
                    <li key={f.slug} className="border-b border-hair last:border-b-0">
                      <Link
                        href={`/programmes/${f.slug}/`}
                        className="block px-4 py-2.5 text-[13px] no-underline hover:bg-shell"
                      >
                        {f.name}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        }
      >
        <h2>Programmes offered</h2>

        {pending ? (
          <>
            <p>
              The programme list for this faculty is being published. Until it appears here,
              please contact the admissions office for the current programmes, their duration
              and their eligibility requirements.
            </p>
            <p className="mt-5">
              <Link href="/contact/" className="btn btn-primary">
                Contact admissions
              </Link>{' '}
              <Link href="/admission/process/" className="btn btn-secondary">
                Admission process
              </Link>
            </p>
          </>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Programme</th>
                    <th>Award</th>
                    <th>Duration</th>
                    <th>Mode</th>
                    <th>Eligibility</th>
                  </tr>
                </thead>
                <tbody>
                  {faculty.programmes.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.award}</td>
                      <td className="tnum whitespace-nowrap">
                        {p.durationMonths % 12 === 0
                          ? `${p.durationMonths / 12} year${p.durationMonths === 12 ? '' : 's'}`
                          : `${p.durationMonths} months`}
                      </td>
                      <td className="whitespace-nowrap">{p.mode}</td>
                      <td>{p.eligibility}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-6">
              <Link href="/admission/process/" className="btn btn-primary">
                Apply now
              </Link>{' '}
              <Link href="/admission/fee-structure/" className="btn btn-secondary">
                Fee structure
              </Link>
            </p>
          </>
        )}
      </PageShell>
    </>
  )
}
