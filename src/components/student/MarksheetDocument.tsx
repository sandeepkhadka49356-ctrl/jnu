'use client'

import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

import { useSite } from '@/components/site/SiteProvider'
import { SITE_URL, SITE_HOST } from '@/lib/site-url'
import {
  divisionFor,
  dottedDate,
  percentageOf,
  sheetDate,
} from '@/lib/marksheet'
import type { ResultRecord, StudentProfile } from '@/lib/store'
import { bandFor, cumulative } from '@/lib/grading'
import { cinzel, garamond } from './marksheet-fonts'

/**
 * The printable Statement of Marks, A4 portrait.
 *
 * Layout follows the statement-of-marks sample the client supplied: crest and
 * QR in the header, serial / roll / enrollment band, candidate block with
 * photograph, theory–practical–total table, grand total, place/date and the
 * Controller's signature. Everything identifying is JNU's own — none of the
 * sample institution's name, registration numbers or recognition claims are
 * reproduced, and no recognition line is printed at all until
 * the registrar records a recognition statement WITH its evidence.
 *
 * Security features, because a statement of marks is worth forging:
 *   - Serial + QR code resolving to /verify/marksheet/, which returns the
 *     marks on record. A sheet edited in the browser before printing will not
 *     match. This is the feature that matters; the rest is deterrence.
 *   - Microprint watermark of the university name across the whole sheet.
 *   - Guilloché-style border and an embossed seal, drawn in SVG so they print
 *     at full resolution.
 *
 * Deliberately NOT here: a signature, unless the examination cell supplies
 * the real scan (Admin → Examinations). See signatureUrl below.
 */
export function MarksheetDocument({
  row,
  profile,
  all = [],
  signatureUrl = null,
}: {
  row: ResultRecord
  profile: StudentProfile
  /** Every published result, for the running totals. Empty = this one alone. */
  all?: ResultRecord[]
  /**
   * The Controller's scanned signature, if the examination cell has set one.
   * Passed in from /api/student/me rather than read from site settings, so
   * it is only ever sent to a signed-in student printing their own sheet.
   */
  signatureUrl?: string | null
}) {
  const { site, examinations, recognition, branding } = useSite()
  const verifyUrl = row.serial
    ? `${SITE_URL}/verify/marksheet/?sn=${encodeURIComponent(row.serial)}`
    : null

  const [qrSvg, setQrSvg] = useState<string | null>(null)

  useEffect(() => {
    if (!verifyUrl) return
    let cancelled = false
    QRCode.toString(verifyUrl, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#1b1f3b', light: '#ffffff' },
    })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [verifyUrl])

  const subjects = Array.isArray(row.subjects) ? row.subjects : []
  const cum = cumulative(
    { semester: row.semester, marksObtained: row.marks_obtained, marksMax: row.marks_max },
    all.map((r) => ({ semester: r.semester, marksObtained: r.marks_obtained, marksMax: r.marks_max }))
  )
  // Taken from the running total, because a grade printed beside a grand
  // total has to describe that total and not just the semester above it.
  const overall = bandFor(cum.grandMax > 0 ? (cum.grandObtained / cum.grandMax) * 100 : 0)
  const pct = percentageOf(row.marks_obtained, row.marks_max)
  const division = divisionFor(row.status, pct)
  const host = SITE_HOST.replace(/\/$/, '')
  const recognitionLine = recognition.evidence
    ? [recognition.ugcStatus, ...recognition.approvals].filter(Boolean).join(' • ')
    : ''

  const resultTone =
    row.status === 'PASS' ? '#1f7a3a' : row.status === 'ATKT' ? '#9a6a10' : '#a8322b'

  return (
    <div className={`ms-sheet ${garamond.className}`} role="document" aria-label="Statement of marks">
      <div className="ms-guilloche">
        <div className="ms-inner">
          {/* ---- security layers (in flow, so they print) ---- */}
          <Microprint text={site.name} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.crest} alt="" aria-hidden="true" className="ms-crest-ghost" />

          {/* ---- header ---- */}
          <header className="ms-head">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={branding.crest} alt={`${site.name} crest`} className="ms-crest" />

            <div className="ms-title-block">
              <p className="ms-web">www.{host.replace(/^www\./, '')}</p>
              <h1 className={`ms-uni ${cinzel.className}`}>{site.name}</h1>
              <p className={`ms-place ${cinzel.className}`}>Jodhpur, Rajasthan, India</p>
            </div>

            <div className="ms-qr" aria-label="Verification QR code">
              {qrSvg ? (
                <div className="ms-qr-code" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              ) : (
                <div className="ms-qr-code ms-qr-empty" />
              )}
              <span className="ms-qr-cap">Scan to verify</span>
            </div>
          </header>

          <div className="ms-band">
            {recognitionLine ? (
              <p>{recognitionLine}</p>
            ) : (
              <p>{[...site.campus.lines].join(', ')}</p>
            )}
            <p>Examination Cell · {site.email}</p>
          </div>

          {/* ---- title ---- */}
          <div className="ms-heading">
            <h2 className={cinzel.className}>Statement of Marks</h2>
            <p>
              {row.programme} — {row.semester}
            </p>
          </div>

          {/* ---- identifiers ---- */}
          <div className="ms-ids">
            <span>
              <b>Sr. No.:</b> <span className="ms-mono">{row.serial ?? '—'}</span>
            </span>
            <span>
              <b>Roll No.:</b> <span className="ms-mono">{row.roll_no}</span>
            </span>
            <span>
              <b>Enrollment No.:</b> <span className="ms-mono">{profile.enrollmentNo}</span>
            </span>
          </div>

          {/* ---- candidate ---- */}
          <section className="ms-candidate">
            <dl className="ms-fields">
              {/* Paired as on the supplied sample. The programme is not
                  repeated here: it is already the sub-title above. */}
              <Field label="Student Name" value={row.student_name} />
              <Field label="Session" value={row.exam_session} />
              <Field label="Father's Name" value={profile.fatherName} />
              <Field label="Year / Semester" value={row.semester} />
              <Field label="Mother's Name" value={profile.motherName} />
              <Field label="Centre Name" value={examinations.centre} />
              <Field label="Date of Birth" value={sheetDate(profile.dob)} />
            </dl>

            <div className="ms-photo">
              {profile.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.photoUrl} alt={`Photograph of ${profile.fullName}`} />
              ) : (
                <span>Photograph</span>
              )}
            </div>
          </section>

          {/* ---- marks ---- */}
          <table className="ms-table">
            <thead className={cinzel.className}>
              <tr>
                <th className="ms-c">Sr. No.</th>
                <th>Subject</th>
                <th className="ms-c">Subject Code</th>
                <th className="ms-c">Maximum Marks</th>
                <th className="ms-c">Theory</th>
                <th className="ms-c">Practical</th>
                <th className="ms-c">Total Marks</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s, i) => {
                const theory = typeof s.theory === 'number' ? s.theory : s.obtained
                const practical = typeof s.practical === 'number' ? s.practical : null
                const low = s.obtained < s.max * 0.4
                return (
                  <tr key={`${s.code}-${i}`}>
                    <td className="ms-c">{i + 1}.</td>
                    <td className="ms-subject">{s.name}</td>
                    <td className="ms-c ms-mono">{s.code}</td>
                    <td className="ms-c">{s.max}</td>
                    <td className="ms-c">{theory}</td>
                    <td className="ms-c">{practical ?? '—'}</td>
                    <td className={`ms-c ms-strong ${low ? 'ms-low' : ''}`}>{s.obtained}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className={`ms-total-label ${cinzel.className}`}>
                  {cum.previousCount > 0 ? 'This Semester' : 'Grand Total & Result'}
                </td>
                <td className="ms-c ms-strong">{row.marks_max}</td>
                <td className="ms-c">—</td>
                <td className="ms-c">—</td>
                <td className="ms-c ms-strong">{row.marks_obtained}</td>
              </tr>

              {/* Only once there is something to carry forward. On a first
                  semester these two rows would repeat the one above. */}
              {cum.previousCount > 0 ? (
                <>
                  <tr>
                    <td colSpan={3} className={`ms-total-label ${cinzel.className}`}>
                      Previous Year/Sem. Total
                    </td>
                    <td className="ms-c">{cum.previousMax}</td>
                    <td className="ms-c">—</td>
                    <td className="ms-c">—</td>
                    <td className="ms-c">{cum.previousObtained}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className={`ms-total-label ${cinzel.className}`}>
                      Grand Total &amp; Result
                    </td>
                    <td className="ms-c ms-strong">{cum.grandMax}</td>
                    <td className="ms-c">—</td>
                    <td className="ms-c">—</td>
                    <td className="ms-c ms-strong">{cum.grandObtained}</td>
                  </tr>
                </>
              ) : null}
            </tfoot>
          </table>

          <p className="ms-summary">
            <span>
              Percentage: <b>{pct.toFixed(2)}%</b>
            </span>
            <span className="ms-sep">|</span>
            <span>
              SGPA: <b>{row.sgpa.toFixed(2)}</b>
            </span>
            <span className="ms-sep">|</span>
            <span>
              Result: <b style={{ color: resultTone }}>{row.status}</b>
            </span>
            <span className="ms-sep">|</span>
            <span>
              Division: <b className="ms-upper">{division}</b>
            </span>
            <span className="ms-sep">|</span>
            {/* Was labelled "Grade" while showing the division, which are two
                different schemes that do not share boundaries. Both are named
                now, and the letter is the one the grade bands give. */}
            <span>
              Grade: <b className="ms-upper">{overall.letter}</b>
            </span>
          </p>

          {/* ---- footer ---- */}
          <footer className="ms-foot">
            <div className="ms-place-date">
              <p>{examinations.place}</p>
              <p>
                Dated: <b>{row.published_at ? dottedDate(row.published_at) : '—'}</b>
              </p>
            </div>

            <Seal />

            <div className="ms-sign">
              <div className="ms-sign-space">
                {signatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={signatureUrl} alt="Signature" />
                ) : null}
              </div>
              <p className={`ms-sign-title ${cinzel.className}`}>
                {examinations.controllerTitle}
              </p>
              <p className="ms-sign-uni">{site.name}</p>
            </div>
          </footer>

          <p className="ms-fine">
            Computer-generated statement of marks from the university examination record.
            Verify by scanning the QR code or at {host}/verify/marksheet/ using the Sr. No.
            The official marksheet is issued by the Examination Cell.
          </p>
        </div>
      </div>

      <style jsx>{`
        /*
          ------------------------------------- plain sheet, screen AND paper

          White background, no engraved border, no microprint wash, no seal,
          no coloured rules or labels. The client asked for this.

          It was scoped to @media print at first, on the reading that only the
          download needed to change. That was wrong twice over: the preview is
          what anyone actually looks at, so a decorative preview and a plain
          printout read as the change never happening; and a document that
          looks different on screen from the paper it produces is its own small
          betrayal of trust when the paper is a degree marksheet.

          Declared first, and every rule is !important, so it beats the
          decorative rules further down regardless of source order.

          It also stops the colour washes turning grey-on-grey when a browser
          prints with backgrounds disabled, and stops a home printer spending
          its ink on a full-bleed cream panel.
        */
          .ms-sheet,
          .ms-guilloche {
            background: #ffffff !important;
            border: 0 !important;
            outline: 0 !important;
          }
          /* No frame at all. A rule around the page is the last thing that
             still read as decoration rather than as the document. */
          .ms-inner {
            background: #ffffff !important;
            border: 0 !important;
            outline: 0 !important;
          }
          /* Microprint and the seal are rendered by sibling components, so
             styled-jsx scopes their class names elsewhere — :global reaches
             them. ms-crest-ghost is this component's own element. */
          :global(.ms-micro),
          :global(.ms-seal) {
            display: none !important;
          }
          .ms-crest-ghost {
            display: none !important;
          }

          /*
            Every remaining tint goes too: the lilac address band, the pink
            candidate panel, the striped table rows and the pink total row.
            "Plain white" has to mean the whole sheet, not just the paper
            behind it. Borders and text colour stay, so the structure is still
            legible — it is the fills that are removed, not the rules.
          */
          .ms-band,
          .ms-candidate,
          .ms-ids,
          .ms-foot,
          .ms-photo,
          .ms-table tbody tr:nth-child(even) td,
          .ms-table tfoot td {
            background: #ffffff !important;
          }
          /* The header row is white-on-navy on screen; inverted to dark-on-
             white it still reads as a header because of the rule beneath. */
          .ms-table th {
            background: #ffffff !important;
            color: #000000 !important;
            border-bottom: 0.4mm solid #000000 !important;
          }

          /*
            Every remaining rule goes neutral. The maroon and gold borders on
            the ids strip, the candidate panel and the marks table were the
            "colourful border" still visible on paper once the fills had gone.
            Black keeps the table legible and photocopies cleanly; the colour
            was only ever decoration.
          */
          .ms-inner :global(*) {
            border-color: #000000 !important;
            outline-color: #000000 !important;
          }

          /*
            Text too: labels were maroon, the location line gold, the footer
            blue. :global on the descendant selector is required — the field
            labels are <dt> elements rendered by a sibling component, so they
            never carry this component's styled-jsx scope class, and a plain
            descendant selector silently skipped every one of them.
          */
          .ms-inner,
          .ms-inner :global(*) {
            color: #000000 !important;
          }

        /* ------------------------------------------------ sheet + frame */
        .ms-sheet {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          padding: 5mm;
          background: #1b1f3b;
          color: #1f1f2e;
          box-sizing: border-box;
          font-size: 10.5pt;
          line-height: 1.35;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .ms-guilloche {
          height: 100%;
          min-height: calc(297mm - 10mm);
          padding: 2.2mm;
          box-sizing: border-box;
          /* Interleaved diagonal hatching reads as an engraved border when
             printed, and is tedious to reproduce convincingly by hand. */
          background:
            repeating-linear-gradient(45deg, #7a1f2b 0 0.6px, transparent 0.6px 3px),
            repeating-linear-gradient(-45deg, #b08d3c 0 0.6px, transparent 0.6px 3px),
            #f6ece6;
        }
        .ms-inner {
          position: relative;
          overflow: hidden;
          min-height: calc(297mm - 14.4mm);
          box-sizing: border-box;
          padding: 6mm 7mm 5mm;
          background: #fffaf7;
          border: 0.6mm solid #7a1f2b;
          outline: 0.3mm solid #b08d3c;
          outline-offset: -1.6mm;
          display: flex;
          flex-direction: column;
        }
        .ms-crest-ghost {
          position: absolute;
          left: 50%;
          top: 52%;
          width: 120mm;
          height: 120mm;
          transform: translate(-50%, -50%);
          opacity: 0.055;
          pointer-events: none;
          z-index: 0;
        }
        .ms-inner > :global(*:not(.ms-micro):not(.ms-crest-ghost)) {
          position: relative;
          z-index: 1;
        }

        /* ------------------------------------------------------ header */
        .ms-head {
          display: grid;
          grid-template-columns: 24mm 1fr 24mm;
          align-items: center;
          gap: 4mm;
        }
        .ms-crest {
          width: 24mm;
          height: 24mm;
          object-fit: contain;
        }
        .ms-title-block {
          text-align: center;
        }
        .ms-web {
          margin: 0;
          font-size: 9pt;
          color: #7a1f2b;
          letter-spacing: 0.04em;
        }
        .ms-uni {
          margin: 0.5mm 0 0;
          font-size: 19pt;
          line-height: 1.1;
          color: #1b2a6b;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .ms-place {
          margin: 1mm 0 0;
          font-size: 9pt;
          color: #7a1f2b;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }
        .ms-qr {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .ms-qr-code {
          width: 22mm;
          height: 22mm;
          padding: 1mm;
          background: #fff;
          border: 0.4mm solid #7a1f2b;
          box-sizing: border-box;
        }
        .ms-qr-code :global(svg) {
          width: 100%;
          height: 100%;
          display: block;
        }
        .ms-qr-empty {
          background: repeating-linear-gradient(45deg, #eee 0 2px, #fff 2px 4px);
        }
        .ms-qr-cap {
          margin-top: 0.8mm;
          font-size: 6.5pt;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #7a1f2b;
        }

        .ms-band {
          margin-top: 3mm;
          padding: 1.4mm 3mm;
          text-align: center;
          font-size: 8pt;
          color: #3b3355;
          background: #f3eef8;
          border-top: 0.5mm solid #7a1f2b;
          border-bottom: 0.5mm solid #7a1f2b;
        }
        .ms-band p {
          margin: 0;
        }

        /* ------------------------------------------------------- title */
        .ms-heading {
          margin: 4mm 0 3mm;
          text-align: center;
        }
        .ms-heading h2 {
          margin: 0;
          font-size: 16pt;
          letter-spacing: 0.12em;
          color: #1b2a6b;
          text-transform: uppercase;
        }
        .ms-heading p {
          margin: 0.6mm 0 0;
          font-style: italic;
          font-size: 12pt;
          color: #7a1f2b;
        }

        /* --------------------------------------------------- id + card */
        .ms-ids {
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 2mm 6mm;
          padding: 2.2mm 3.5mm;
          border: 0.4mm solid #7a1f2b;
          background: rgba(255, 255, 255, 0.85);
          font-size: 9.5pt;
        }
        .ms-ids b {
          color: #7a1f2b;
          font-weight: 500;
        }
        .ms-mono {
          font-family: 'Courier New', ui-monospace, monospace;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .ms-candidate {
          display: flex;
          gap: 5mm;
          margin-top: 3mm;
          padding: 3mm 3.5mm;
          border: 0.4mm solid #c9a3a8;
          background: rgba(255, 255, 255, 0.85);
        }
        .ms-fields {
          flex: 1;
          margin: 0;
          display: grid;
          /* Left column carries the names, which run long. */
          grid-template-columns: 1.15fr 1fr;
          gap: 2.6mm 5mm;
          align-content: center;
        }
        .ms-fields > :global(:nth-child(even)) {
          --ms-label: 31mm;
        }
        .ms-photo {
          width: 30mm;
          height: 37mm;
          flex-shrink: 0;
          border: 0.5mm solid #7a1f2b;
          outline: 0.3mm solid #b08d3c;
          outline-offset: 0.6mm;
          background: #f4f1ee;
          display: grid;
          place-items: center;
          font-size: 8pt;
          color: #8a7f86;
          overflow: hidden;
        }
        .ms-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        /* ------------------------------------------------------- table */
        .ms-table {
          width: 100%;
          margin-top: 4mm;
          border-collapse: collapse;
          font-size: 9.5pt;
          background: rgba(255, 255, 255, 0.82);
        }
        .ms-table th {
          padding: 2mm 1.5mm;
          background: #1b1f3b;
          color: #fff;
          font-size: 8pt;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-align: left;
          border: 0.3mm solid #7a1f2b;
          line-height: 1.2;
        }
        .ms-table td {
          padding: 2mm 2mm;
          border: 0.3mm solid #b98a91;
        }
        .ms-table tbody tr:nth-child(even) td {
          background: rgba(248, 236, 238, 0.7);
        }
        .ms-c {
          text-align: center !important;
        }
        .ms-subject {
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .ms-strong {
          font-weight: 700;
        }
        .ms-low {
          color: #a8322b;
        }
        .ms-table tfoot td {
          padding: 2.4mm 2mm;
          border-top: 0.6mm solid #7a1f2b;
          background: #fbf3f4;
        }
        .ms-total-label {
          color: #a8322b;
          font-weight: 700;
          text-align: center;
          letter-spacing: 0.04em;
        }

        .ms-summary {
          margin: 0;
          padding: 2.6mm 3mm;
          text-align: center;
          font-size: 11pt;
          color: #7a1f2b;
          border: 0.3mm solid #b98a91;
          border-top: 0;
          background: rgba(255, 255, 255, 0.85);
        }
        .ms-summary b {
          color: #1f1f2e;
        }
        .ms-sep {
          margin: 0 2.5mm;
          color: #b98a91;
        }
        .ms-upper {
          text-transform: uppercase;
        }

        /* ------------------------------------------------------ footer */
        .ms-foot {
          margin-top: auto;
          padding-top: 6mm;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: end;
          gap: 4mm;
        }
        .ms-place-date {
          justify-self: start;
          padding: 1.6mm 3mm;
          border: 0.4mm solid #7a1f2b;
          background: rgba(255, 255, 255, 0.9);
          font-size: 9.5pt;
          color: #7a1f2b;
        }
        .ms-place-date p {
          margin: 0;
        }
        .ms-place-date b {
          color: #1f1f2e;
        }
        .ms-sign {
          justify-self: end;
          text-align: right;
        }
        .ms-sign-space {
          height: 15mm;
          width: 52mm;
          margin-left: auto;
          border-bottom: 0.3mm solid #1f1f2e;
          display: flex;
          align-items: flex-end;
          justify-content: flex-end;
        }
        .ms-sign-space img {
          max-height: 14mm;
          max-width: 50mm;
          object-fit: contain;
        }
        .ms-sign-title {
          margin: 1.2mm 0 0;
          font-size: 9.5pt;
          font-weight: 700;
          color: #a8322b;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .ms-sign-uni {
          margin: 0;
          font-size: 8.5pt;
        }

        .ms-fine {
          margin: 3mm 0 0;
          padding-top: 1.6mm;
          border-top: 0.2mm solid #d9c2c5;
          text-align: center;
          font-size: 7pt;
          color: #6f6470;
        }
      `}</style>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="ms-field">
      <dt className={cinzel.className}>{label}</dt>
      <dd>: {value}</dd>
      <style jsx>{`
        .ms-field {
          display: grid;
          grid-template-columns: var(--ms-label, 27mm) 1fr;
          align-items: baseline;
          font-size: 9.5pt;
        }
        dt {
          white-space: nowrap;
          font-size: 8pt;
          font-weight: 700;
          color: #a8322b;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        dd {
          margin: 0;
          font-weight: 500;
          text-transform: uppercase;
          overflow-wrap: anywhere;
        }
      `}</style>
    </div>
  )
}

/**
 * The university name in tiny repeated rows behind everything. On a genuine
 * print it reads as a tint; photocopied or re-typeset, it breaks up — the same
 * reason banknotes use it.
 */
function Microprint({ text }: { text: string }) {
  const line = `${text} · `.repeat(14)
  return (
    <div className="ms-micro" aria-hidden="true">
      {Array.from({ length: 64 }, (_, i) => (
        <span key={i} style={{ marginLeft: i % 2 ? '-18mm' : '0' }}>
          {line}
        </span>
      ))}
      <style jsx>{`
        .ms-micro {
          position: absolute;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 1.6mm;
          padding-top: 1mm;
          pointer-events: none;
          user-select: none;
        }
        span {
          display: block;
          white-space: nowrap;
          font-size: 5.4pt;
          line-height: 1;
          letter-spacing: 0.05em;
          color: rgba(122, 31, 43, 0.085);
          text-transform: uppercase;
        }
      `}</style>
    </div>
  )
}

/** Embossed-style round seal, drawn in SVG so it prints crisp at any DPI. */
function Seal() {
  const { site } = useSite()
  const ring = `${site.name.toUpperCase()} • EXAMINATION CELL • `
  return (
    <svg
      className="ms-seal"
      viewBox="0 0 120 120"
      width="30mm"
      height="30mm"
      role="img"
      aria-label={`Seal of the Examination Cell, ${site.name}`}
    >
      <defs>
        <path id="ms-seal-ring" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="57" fill="none" stroke="#7a1f2b" strokeWidth="2" opacity="0.75" />
      <circle cx="60" cy="60" r="52" fill="none" stroke="#7a1f2b" strokeWidth="0.8" opacity="0.75" />
      <circle cx="60" cy="60" r="36" fill="none" stroke="#7a1f2b" strokeWidth="0.8" opacity="0.75" />
      <text fill="#7a1f2b" opacity="0.8" fontSize="7.6" letterSpacing="0.6" fontWeight="700">
        <textPath href="#ms-seal-ring">{ring}</textPath>
      </text>
      <text
        x="60"
        y="57"
        textAnchor="middle"
        fill="#7a1f2b"
        opacity="0.85"
        fontSize="17"
        fontWeight="700"
        letterSpacing="1"
      >
        JNU
      </text>
      <text x="60" y="71" textAnchor="middle" fill="#7a1f2b" opacity="0.8" fontSize="7" letterSpacing="1">
        EST. {site.established}
      </text>
    </svg>
  )
}
